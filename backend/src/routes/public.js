const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const Organization = require('../models/Organization');
const Branch = require('../models/Branch');
const Department = require('../models/Department');
const Counter = require('../models/Counter');
const Room = require('../models/Room');
const Token = require('../models/Token');
const AuditLog = require('../models/AuditLog');
const { verify } = require('../services/tokenService');
const { issueToken } = require('../services/queueService');
const { recalcDepartmentEtas } = require('../services/etaService');
const { requestOtp, verifyOtp } = require('../services/otpService');
const { emitQueueUpdate } = require('../sockets');

const router = express.Router();

// Public endpoints are unauthenticated, so rate-limit hard to blunt abuse.
const joinLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });
const otpLimiter = rateLimit({ windowMs: 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false });

// Distance in metres between two lat/lng points (haversine) — for geofencing.
function distanceMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Resolve which departments are in scope for a scan or a screen: a single
 * department, a room's departments, or (default) the whole branch. This is
 * what makes the Registration room's QR and TV show only Registration.
 */
async function scopeDepartments(branchId, { room, department }) {
  if (department) {
    const d = await Department.findOne({ _id: department, branch: branchId, isActive: true });
    return { departments: d ? [d] : [], label: d ? d.name : null, roomDoc: null };
  }
  if (room) {
    const r = await Room.findOne({ _id: room, branch: branchId, isActive: true }).populate({
      path: 'departments', match: { isActive: true },
    });
    return { departments: r ? r.departments : [], label: r ? r.name : null, roomDoc: r };
  }
  const departments = await Department.find({ branch: branchId, isActive: true });
  return { departments, label: null, roomDoc: null };
}

// Read the customer's token session from ?s= or the x-session header.
function sessionFromReq(req) {
  const raw = req.query.s || req.headers['x-session'];
  if (!raw) return null;
  try {
    const decoded = verify(raw);
    return decoded.typ === 'session' ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * Join page bootstrap: the departments a customer can pick (scoped to the room
 * they scanned), plus the org's anti-cheat policy.
 */
router.get('/branch/:branchId/config', async (req, res, next) => {
  try {
    const branch = await Branch.findById(req.params.branchId);
    if (!branch || !branch.isActive) return res.status(404).json({ message: 'Branch not found' });
    const org = await Organization.findById(branch.organization);

    const { departments, label } = await scopeDepartments(branch._id, {
      room: req.query.room, department: req.query.department,
    });

    res.json({
      organization: {
        name: org.name, slug: org.slug,
        brandColor: org.settings.brandColor,
        terminology: org.terminology,
      },
      branch: { id: branch._id, name: branch.name },
      area: label, // e.g. "Registration" — shown on the join page when scoped
      departments: departments.map((d) => ({
        _id: d._id, name: d.name, tokenPrefix: d.tokenPrefix, queueType: d.queueType,
      })),
      policy: {
        requireOtp: org.settings.requireOtp,
        requireGeofence: org.settings.requireGeofence,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Request an OTP for a phone number (when the org requires it).
router.post('/otp/request', otpLimiter, [body('phone').trim().notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const result = await requestOtp(req.body.phone);
  res.json(result);
});

/**
 * The core customer action: join a queue from a scanned QR. Enforces the org's
 * configured anti-cheat policy before issuing a token. No account, no app.
 */
router.post(
  '/join',
  joinLimiter,
  [
    body('branchId').notEmpty(),
    body('departmentId').notEmpty(),
    body('customerName').optional().trim(),
    body('customerPhone').optional().trim(),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { branchId, departmentId, roomId, qrToken, customerName, customerPhone, otp, geo } = req.body;

      const branch = await Branch.findById(branchId);
      if (!branch || !branch.isActive) return res.status(404).json({ message: 'Branch not found' });
      const org = await Organization.findById(branch.organization);
      if (!org || org.status !== 'active') return res.status(403).json({ message: 'Organization unavailable' });

      // 0. The department must belong to this branch (can't join another
      //    branch's or org's queue by passing a foreign id).
      const dept = await Department.findOne({ _id: departmentId, branch: branch._id, isActive: true });
      if (!dept) return res.status(404).json({ message: 'That department is not available here.' });

      // 1. Fresh-QR check (anti screenshot-reuse).
      if (qrToken) {
        try {
          const decoded = verify(qrToken);
          if (decoded.typ !== 'qr' || decoded.branch !== branchId) {
            return res.status(401).json({ message: 'This QR code is invalid for this branch.' });
          }
        } catch {
          return res.status(401).json({ message: 'This QR code has expired. Please scan the current code on screen.' });
        }
      }

      // 2. OTP check.
      if (org.settings.requireOtp) {
        if (!customerPhone || !otp || !verifyOtp(customerPhone, otp)) {
          return res.status(401).json({ message: 'Phone verification failed. Request a new code and try again.' });
        }
      }

      // 3. Geofence check.
      if (org.settings.requireGeofence) {
        if (!geo || branch.geo.lat == null) {
          return res.status(400).json({ message: 'Location is required to join this queue.' });
        }
        if (distanceMeters(geo, branch.geo) > (branch.geo.radiusMeters || 150)) {
          return res.status(403).json({ message: 'You must be at the location to join this queue.' });
        }
      }

      // 4. Duplicate detection: one active token per phone per branch.
      if (customerPhone) {
        const dupe = await Token.findOne({
          branch: branchId,
          customerPhone,
          status: { $in: ['waiting', 'serving', 'held', 'skipped'] },
        });
        if (dupe) {
          return res.status(409).json({ message: 'You already have an active token in this queue.', tokenId: dupe._id });
        }
      }

      // Which room the customer was directed to (the QR they scanned, or the
      // first room that handles this department).
      let room = roomId || null;
      if (!room) {
        const r = await Room.findOne({ branch: branch._id, departments: dept._id, isActive: true }).select('_id');
        room = r?._id || null;
      }

      const result = await issueToken({
        organization: org._id,
        branchId,
        departmentId,
        roomId: room,
        source: 'online',
        customerName,
        customerPhone,
      });

      res.status(201).json({
        tokenId: result.token._id,
        tokenNumber: result.token.tokenNumber,
        sessionToken: result.sessionToken,
        position: result.position,
        etaSeconds: result.token.predictedEtaSeconds,
        departmentName: result.departmentName,
        branchName: result.branchName,
        qrCode: result.token.qrCode,
      });
    } catch (err) {
      next(err);
    }
  }
);

// Live status of the customer's own token (needs their session token).
router.get('/token/:id', async (req, res, next) => {
  try {
    const session = sessionFromReq(req);
    const token = await Token.findById(req.params.id)
      .populate('department', 'name')
      .populate('counter', 'name code')
      .populate('room', 'name');
    if (!token) return res.status(404).json({ message: 'Token not found' });
    if (!session || session.token !== token._id.toString() || session.sid !== token.sessionId) {
      return res.status(403).json({ message: 'Not authorized for this token' });
    }

    let position = 0;
    if (token.status === 'waiting') {
      // Mirrors the { isPriority: -1, orderKey: 1 } sort the queue is read
      // with, so a no-show penalty shows up as a real drop in position.
      position = await Token.countDocuments({
        branch: token.branch,
        department: token.department,
        status: 'waiting',
        _id: { $ne: token._id },
        $or: [
          ...(token.isPriority ? [] : [{ isPriority: true }]),
          { isPriority: token.isPriority, orderKey: { $lt: token.orderKey } },
        ],
      });
      position += 1;
    }

    res.json({
      token: {
        id: token._id,
        tokenNumber: token.tokenNumber,
        status: token.status,
        department: token.department?.name,
        room: token.room?.name || null,
        // Customers get the human name ("Counter 1"). The code (DCC-MH-REG-01)
        // is an internal reference for staff and admins only.
        counter: token.counter?.name || null,
        position,
        etaSeconds: token.predictedEtaSeconds,
        isPriority: token.isPriority,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Customer cancels their OWN token (session-bound).
router.post('/token/:id/cancel', async (req, res, next) => {
  try {
    const session = sessionFromReq(req);
    const token = await Token.findById(req.params.id);
    if (!token) return res.status(404).json({ message: 'Token not found' });
    if (!session || session.token !== token._id.toString() || session.sid !== token.sessionId) {
      return res.status(403).json({ message: 'Not authorized for this token' });
    }
    if (!['waiting', 'held', 'skipped'].includes(token.status)) {
      return res.status(409).json({ message: `Cannot cancel a token that is '${token.status}'` });
    }
    token.status = 'cancelled';
    await token.save();
    await AuditLog.create({
      organization: token.organization,
      token: token._id,
      branch: token.branch,
      actor: null,
      action: 'TOKEN_CANCELLED',
      toStatus: 'cancelled',
      metadata: { by: 'customer' },
    });
    await recalcDepartmentEtas(token.branch, token.department);
    emitQueueUpdate(token.branch, { type: 'cancelled', tokenId: token._id });
    res.json({ message: 'Token cancelled' });
  } catch (err) {
    next(err);
  }
});

/**
 * Wall-display data. Scoped the same way as the QR: a room's screen shows only
 * that room's departments and the counters standing in it.
 */
router.get('/board/:branchId', async (req, res, next) => {
  try {
    const branch = await Branch.findById(req.params.branchId);
    if (!branch) return res.status(404).json({ message: 'Branch not found' });

    const { departments, label, roomDoc } = await scopeDepartments(branch._id, {
      room: req.query.room, department: req.query.department,
    });
    const deptIds = departments.map((d) => d._id);

    // Counters in scope: those in the room, or all in the branch.
    const counterFilter = { branch: branch._id, status: { $in: ['open', 'paused'] } };
    if (roomDoc) counterFilter.room = roomDoc._id;
    const counters = await Counter.find(counterFilter)
      .populate({ path: 'currentToken', select: 'tokenNumber department' })
      .select('name code status currentToken departments room');

    const waiting = await Token.aggregate([
      { $match: { department: { $in: deptIds }, status: 'waiting' } },
      { $group: { _id: '$department', count: { $sum: 1 } } },
    ]);
    const waitingMap = Object.fromEntries(waiting.map((w) => [String(w._id), w.count]));

    res.json({
      branch: { id: branch._id, name: branch.name },
      area: label,
      departments: departments.map((d) => ({
        department: d.name,
        waiting: waitingMap[String(d._id)] || 0,
        nowServing: counters
          .filter((c) => c.currentToken && String(c.currentToken.department) === String(d._id))
          // The public screen shows the name people can actually find.
          .map((c) => ({ tokenNumber: c.currentToken.tokenNumber, counter: c.name })),
      })),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
