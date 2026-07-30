const express = require('express');
const Token = require('../models/Token');
const Counter = require('../models/Counter');
const Department = require('../models/Department');
const AuditLog = require('../models/AuditLog');
const { authenticate, authorize } = require('../middleware/auth');
const { requireOrg, scoped, assertSameOrg } = require('../middleware/tenant');
const stateMachine = require('../services/tokenStateMachine');
const { recalcDepartmentEtas, recalibrateDepartmentAvg } = require('../services/etaService');
const { issueToken, callNext } = require('../services/queueService');
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
    .sort({ isPriority: -1, issuedAt: 1 });
  res.json({ tokens });
});

// Staff/kiosk issues a walk-in token.
router.post('/', authorize('Staff', 'Admin'), async (req, res, next) => {
  try {
    const { branchId, departmentId, roomId, isPriority, customerName, customerPhone } = req.body;
    const result = await issueToken({
      organization: req.orgId,
      branchId,
      departmentId,
      roomId,
      source: 'walk-in',
      isPriority,
      customerName,
      customerPhone,
      actorId: req.user._id,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// Call the next eligible token to a counter (race-safe).
router.post('/call-next', authorize('Staff', 'Admin'), async (req, res, next) => {
  try {
    const counter = await Counter.findById(req.body.counterId);
    if (!assertSameOrg(req, res, counter)) return;

    const token = await callNext({ counter, actorId: req.user._id });
    if (!token) return res.json({ token: null, message: 'Queue is empty' });
    res.json({ token });
  } catch (err) {
    next(err);
  }
});

/**
 * Shared handler for lifecycle transitions: fetch, assert tenant, apply the
 * state-machine transition, refresh that department's ETAs, broadcast.
 */
async function doTransition(req, res, toStatus) {
  const token = await Token.findById(req.params.id);
  if (!assertSameOrg(req, res, token)) return;

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
  ['skip', 'skipped'],
  ['recall', 'serving'],
];

lifecycle.forEach(([path, status]) => {
  router.patch(`/:id/${path}`, authorize('Staff', 'Admin'), async (req, res) => {
    try {
      const t = await doTransition(req, res, status);
      if (t) res.json({ token: t });
    } catch (err) {
      res.status(err.statusCode || 500).json({ message: err.message });
    }
  });
});

router.patch('/:id/complete', authorize('Staff', 'Admin'), async (req, res) => {
  try {
    const t = await doTransition(req, res, 'completed');
    if (t) {
      // Learn from this real completion (off the response path).
      recalibrateDepartmentAvg(t.department).catch(() => {});
      res.json({ token: t });
    }
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.patch('/:id/miss', authorize('Staff', 'Admin'), async (req, res) => {
  try {
    const token = await Token.findById(req.params.id);
    if (!assertSameOrg(req, res, token)) return;
    notify({ ...token.toObject(), organization: req.orgId }, 'missed').catch(() => {});
    const t = await doTransition(req, res, 'missed');
    if (t) res.json({ token: t });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

// Transfer a token to another department (e.g. Consultation -> Pharmacy).
router.patch('/:id/transfer', authorize('Staff', 'Admin'), async (req, res, next) => {
  try {
    const { departmentId } = req.body;
    const token = await Token.findById(req.params.id);
    if (!assertSameOrg(req, res, token)) return;
    const department = await Department.findById(departmentId);
    if (!assertSameOrg(req, res, department)) return;

    const fromDepartment = token.department;
    if (token.counter) await Counter.findByIdAndUpdate(token.counter, { currentToken: null });

    token.department = department._id;
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
