const express = require('express');
const Token = require('../models/Token');
const Counter = require('../models/Counter');
const Department = require('../models/Department');
const Organization = require('../models/Organization');
const AuditLog = require('../models/AuditLog');
const { authenticate, authorize } = require('../middleware/auth');
const { requireOrg, scoped, assertSameOrg } = require('../middleware/tenant');
const stateMachine = require('../services/tokenStateMachine');
const { recalcDepartmentEtas, recalibrateDepartmentAvg } = require('../services/etaService');
const { issueToken, callNext } = require('../services/queueService');
const { recordNoShow } = require('../services/noShowService');
const { notify } = require('../services/notificationService');
const { emitQueueUpdate } = require('../sockets');

const router = express.Router();
router.use(authenticate, requireOrg);

// Live queue for a branch (optionally narrowed to a room).
router.get('/branch/:branchId', async (req, res) => {
  const filter = scoped(req, {
    branch: req.params.branchId,
    status: { $in: ['waiting', 'serving', 'held', 'skipped'] },
  });
  if (req.query.room) filter.room = req.query.room;

  const tokens = await Token.find(filter)
    .populate('department', 'name tokenPrefix')
    .populate('counter', 'name code')
    .sort({ isPriority: -1, orderKey: 1 });
  res.json({ tokens });
});

// Walk-in issued at the desk by the counter itself.
router.post('/', authorize('Counter'), async (req, res, next) => {
  try {
    const { departmentId, isPriority, customerName, customerPhone } = req.body;
    const result = await issueToken({
      organization: req.orgId,
      branchId: req.counter.branch,
      departmentId,
      roomId: req.counter.room?._id || req.counter.room,
      source: 'walk-in',
      isPriority,
      customerName,
      customerPhone,
      actorId: req.counter._id,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * Call the next eligible customer. A counter always calls for ITSELF — the
 * counter is the signed-in principal, so there's no counterId to pass and no
 * way to call on another desk's behalf.
 */
router.post('/call-next', authorize('Counter'), async (req, res, next) => {
  try {
    const counter = await Counter.findById(req.counter._id);
    if (!counter) return res.status(404).json({ message: 'Counter not found' });

    const token = await callNext({ counter, actorId: counter._id });
    if (!token) return res.json({ token: null, message: 'Queue is empty' });
    res.json({ token });
  } catch (err) {
    next(err);
  }
});

/**
 * Shared handler for lifecycle transitions. A counter may only act on the
 * token it is currently serving.
 */
async function doTransition(req, res, toStatus) {
  const token = await Token.findById(req.params.id);
  if (!assertSameOrg(req, res, token)) return null;

  // A counter may act on the token it is serving, or on one waiting in its own
  // room (so it can recall someone a colleague skipped).
  const myRoom = String(req.counter.room?._id || req.counter.room || '');
  const isMine = String(token.counter || '') === String(req.counter._id);
  const inMyRoom = myRoom && String(token.room || '') === myRoom;
  if (!isMine && !inMyRoom) {
    res.status(403).json({ message: 'That token belongs to another counter' });
    return null;
  }

  const updated = await stateMachine.transition(token._id, toStatus, req.user._id, req.body);

  if (toStatus === 'completed' && updated.counter) {
    await Counter.findByIdAndUpdate(updated.counter, { currentToken: null });
  }
  await recalcDepartmentEtas(updated.branch, updated.department);
  emitQueueUpdate(updated.branch, { type: toStatus, tokenId: updated._id, department: updated.department });
  return updated;
}

const lifecycle = [
  ['hold', 'held'],
  ['recall', 'serving'],
];

lifecycle.forEach(([path, status]) => {
  router.patch(`/:id/${path}`, authorize('Counter'), async (req, res) => {
    try {
      const t = await doTransition(req, res, status);
      if (t) res.json({ token: t });
    } catch (err) {
      res.status(err.statusCode || 500).json({ message: err.message });
    }
  });
});

router.patch('/:id/complete', authorize('Counter'), async (req, res) => {
  try {
    const t = await doTransition(req, res, 'completed');
    if (t) {
      recalibrateDepartmentAvg(t.department).catch(() => {});
      res.json({ token: t });
    }
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

/**
 * The customer was called and didn't come.
 *
 * Instead of losing their place outright they go back in line further down —
 * position 2 the first time, 4 the second — and after the third they're out
 * and need a fresh token. No manual recall required.
 */
router.patch('/:id/no-show', authorize('Counter'), async (req, res, next) => {
  try {
    const token = await Token.findById(req.params.id);
    if (!assertSameOrg(req, res, token)) return;
    if (String(token.counter || '') !== String(req.counter._id)) {
      return res.status(403).json({ message: 'That token is not being served at this counter' });
    }
    if (token.status !== 'serving') {
      return res.status(409).json({ message: `Cannot mark a '${token.status}' token as a no-show` });
    }

    const organization = await Organization.findById(req.orgId).select('settings');
    const result = await recordNoShow({ token, organization, actorId: req.counter._id });

    if (result.outcome === 'removed') {
      notify({ ...token.toObject(), organization: req.orgId }, 'missed').catch(() => {});
    }

    await recalcDepartmentEtas(token.branch, token.department);
    emitQueueUpdate(token.branch, {
      type: 'no-show', tokenId: token._id, department: token.department,
    });

    res.json({
      token,
      ...result,
      message: result.outcome === 'removed'
        ? `${token.tokenNumber} removed after ${result.noShowCount} no-shows — a new token is needed`
        : `${token.tokenNumber} moved to position ${result.position} · ${result.remaining} chance(s) left`,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Grant a priority pass. A counter can move someone up the queue, but must
 * record WHY — the reason, who granted it and when are all kept, so a courtesy
 * can be explained later.
 */
router.patch('/:id/priority', authorize('Counter'), async (req, res, next) => {
  try {
    const reason = (req.body.reason || '').trim();
    if (reason.length < 3) {
      return res.status(400).json({ message: 'A reason is required to grant a priority pass' });
    }

    const token = await Token.findById(req.params.id);
    if (!assertSameOrg(req, res, token)) return;
    if (!['waiting', 'serving', 'held'].includes(token.status)) {
      return res.status(409).json({ message: `Cannot prioritise a '${token.status}' token` });
    }
    if (token.isPriority) {
      return res.status(409).json({ message: 'That token already has a priority pass' });
    }

    token.isPriority = true;
    token.priorityReason = reason;
    token.priorityGrantedBy = req.counter._id;
    token.priorityGrantedAt = new Date();
    await token.save();

    await AuditLog.create({
      organization: req.orgId,
      token: token._id,
      branch: token.branch,
      actor: req.counter._id,
      action: 'TOKEN_PRIORITY_GRANTED',
      metadata: { reason, counter: req.counter.code || req.counter.name },
    });

    await recalcDepartmentEtas(token.branch, token.department);
    emitQueueUpdate(token.branch, { type: 'priority', tokenId: token._id, department: token.department });

    res.json({ token, message: `${token.tokenNumber} given a priority pass` });
  } catch (err) {
    next(err);
  }
});

// Send a customer on to another department (e.g. Consultation -> Pharmacy).
router.patch('/:id/transfer', authorize('Counter'), async (req, res, next) => {
  try {
    const { departmentId } = req.body;
    const token = await Token.findById(req.params.id);
    if (!assertSameOrg(req, res, token)) return;
    const department = await Department.findById(departmentId);
    if (!assertSameOrg(req, res, department)) return;

    const fromDepartment = token.department;
    if (token.counter) await Counter.findByIdAndUpdate(token.counter, { currentToken: null });

    // Move them to a room that handles the destination department.
    const Room = require('../models/Room');
    const destRoom = await Room.findOne({
      branch: token.branch, departments: department._id, isActive: true,
    }).select('_id');

    token.department = department._id;
    token.room = destRoom?._id || null;
    token.status = 'waiting';
    token.counter = null;
    token.calledAt = null;
    token.startedAt = null;
    await token.save();

    await AuditLog.create({
      organization: req.orgId,
      token: token._id,
      branch: token.branch,
      actor: req.user._id,
      action: 'TOKEN_TRANSFERRED',
      metadata: { from: fromDepartment, to: department._id },
    });

    await Promise.all([
      recalcDepartmentEtas(token.branch, fromDepartment),
      recalcDepartmentEtas(token.branch, department._id),
    ]);
    emitQueueUpdate(token.branch, { type: 'transfer', tokenId: token._id });
    res.json({ token });
  } catch (err) {
    next(err);
  }
});

// Full lifecycle history for one token.
router.get('/:id/audit', authorize('Admin'), async (req, res) => {
  const token = await Token.findById(req.params.id);
  if (!assertSameOrg(req, res, token)) return;
  const logs = await AuditLog.find({ token: token._id }).sort({ createdAt: 1 });
  res.json({ logs });
});

module.exports = router;
