const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const Organization = require('../models/Organization');
const Branch = require('../models/Branch');
const Service = require('../models/Service');
const Counter = require('../models/Counter');
const Zone = require('../models/Zone');
const Token = require('../models/Token');
const AuditLog = require('../models/AuditLog');
const { verify } = require('../services/tokenService');
const { issueToken } = require('../services/queueService');
const { recalcServiceEtas } = require('../services/etaService');
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
 * Resolve which services are in scope for a scan/screen: a single service, a
 * zone's services, or (default) the whole branch. This is what makes each
 * physical area — Consultation, Pharmacy — its own QR and its own screen.
 */
async function scopeServices(branchId, { zone, service }) {
  if (service) {
    const s = await Service.findOne({ _id: service, branch: branchId, isActive: true });
    return { services: s ? [s] : [], label: s ? s.name : null };
  }
  if (zone) {
    const z = await Zone.findOne({ _id: zone, branch: branchId, isActive: true }).populate({
      path: 'services', match: { isActive: true },
    });
    return { services: z ? z.services : [], label: z ? z.name : null };
  }
  const services = await Service.find({ branch: branchId, isActive: true });
  return { services, label: null };
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
 * Join page bootstrap: the services a customer can pick, plus the org's
 * anti-cheat policy so the frontend knows whether to collect OTP / location.
 * Safe to expose — no secrets, only what the join form needs.
 */
router.get('/branch/:branchId/config', async (req, res, next) => {
  try {
    const branch = await Branch.findById(req.params.branchId);
    if (!branch || !branch.isActive) return res.status(404).json({ message: 'Branch not found' });
    const org = await Organization.findById(branch.organization);

    // If the scan was scoped to a zone/service, only offer those services.
    const { services, label } = await scopeServices(branch._id, { zone: req.query.zone, service: req.query.service });

    res.json({
      organization: { name: org.name, slug: org.slug, brandColor: org.settings.brandColor },
      branch: { id: branch._id, name: branch.name },
      area: label, // e.g. "Pharmacy" — shown on the join page when scoped
      services: services.map((s) => ({ _id: s._id, name: s.name, tokenPrefix: s.tokenPrefix, queueType: s.queueType })),
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
 * The core customer action: join a queue from a scanned QR. Enforces the
 * org's configured anti-cheat policy (fresh QR token, OTP, geofence) before
 * issuing a token. No account, no app install.
 */
router.post(
  '/join',
  joinLimiter,
  [
    body('branchId').notEmpty(),
    body('serviceId').notEmpty(),
    body('customerName').optional().trim(),
    body('customerPhone').optional().trim(),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { branchId, serviceId, qrToken, customerName, customerPhone, otp, geo } = req.body;

      const branch = await Branch.findById(branchId);
      if (!branch || !branch.isActive) return res.status(404).json({ message: 'Branch not found' });
      const org = await Organization.findById(branch.organization);
      if (!org || org.status !== 'active') return res.status(403).json({ message: 'Organization unavailable' });

      // 0. The service must belong to this branch (can't join another area's/
      //    org's queue by passing a foreign serviceId).
      const svc = await Service.findOne({ _id: serviceId, branch: branch._id, isActive: true });
      if (!svc) return res.status(404).json({ message: 'That service is not available here.' });

      // 1. Fresh-QR check (anti screenshot-reuse). Required when a rotating
      //    QR is in use; the token's short TTL means an old screenshot fails.
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
        const dist = distanceMeters(geo, branch.geo);
        if (dist > (branch.geo.radiusMeters || 150)) {
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

      const result = await issueToken({
        organization: org._id,
        branchId,
        serviceId,
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
        serviceName: result.serviceName,
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
    const token = await Token.findById(req.params.id).populate('service', 'name').populate('counter', 'name');
    if (!token) return res.status(404).json({ message: 'Token not found' });
    if (!session || session.token !== token._id.toString() || session.sid !== token.sessionId) {
      return res.status(403).json({ message: 'Not authorized for this token' });
    }

    // Live position = waiting tokens in the same service ahead of this one.
    let position = 0;
    if (token.status === 'waiting') {
      position = await Token.countDocuments({
        branch: token.branch,
        service: token.service,
        status: 'waiting',
        $or: [
          { isPriority: true, issuedAt: { $lt: token.issuedAt } },
          { isPriority: token.isPriority, issuedAt: { $lt: token.issuedAt } },
        ],
      });
      position += 1;
    }

    res.json({
      token: {
        id: token._id,
        tokenNumber: token.tokenNumber,
        status: token.status,
        service: token.service?.name,
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

// Customer cancels their OWN token (fixes the earlier IDOR — session-bound).
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
    await recalcServiceEtas(token.branch, token.service);
    emitQueueUpdate(token.branch, { type: 'cancelled', tokenId: token._id });
    res.json({ message: 'Token cancelled' });
  } catch (err) {
    next(err);
  }
});

/**
 * Wall-display board data, SCOPEABLE so each physical area gets its own screen:
 *   /board/:branchId               -> whole branch
 *   /board/:branchId?zone=<id>     -> just that zone's services (e.g. Pharmacy)
 *   /board/:branchId?service=<id>  -> a single service
 *
 * Service-centric: for each service in scope it lists who is being served now
 * (token + which counter) and how many are waiting.
 */
router.get('/board/:branchId', async (req, res, next) => {
  try {
    const branch = await Branch.findById(req.params.branchId);
    if (!branch) return res.status(404).json({ message: 'Branch not found' });

    const { services, label } = await scopeServices(branch._id, { zone: req.query.zone, service: req.query.service });
    const serviceIds = services.map((s) => s._id);

    const [serving, waitingAgg] = await Promise.all([
      Token.find({ branch: branch._id, service: { $in: serviceIds }, status: 'serving' })
        .populate('counter', 'name')
        .populate('service', 'name')
        .select('tokenNumber counter service'),
      Token.aggregate([
        { $match: { branch: branch._id, status: 'waiting' } },
        { $group: { _id: '$service', count: { $sum: 1 } } },
      ]),
    ]);
    const waitingMap = Object.fromEntries(waitingAgg.map((w) => [String(w._id), w.count]));

    // One row per service in scope: its current call(s) + waiting count.
    const board = services.map((s) => ({
      service: s.name,
      waiting: waitingMap[String(s._id)] || 0,
      nowServing: serving
        .filter((t) => String(t.service?._id) === String(s._id))
        .map((t) => ({ tokenNumber: t.tokenNumber, counter: t.counter?.name || null })),
    }));

    res.json({
      branch: { id: branch._id, name: branch.name },
      area: label,          // zone/service name, or null for whole branch
      services: board,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
