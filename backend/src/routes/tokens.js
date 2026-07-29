const express = require('express');
const Token = require('../models/Token');
const Counter = require('../models/Counter');
const Service = require('../models/Service');
const AuditLog = require('../models/AuditLog');
const { authenticate, authorize } = require('../middleware/auth');
const { requireOrg, scoped, assertSameOrg } = require('../middleware/tenant');
const stateMachine = require('../services/tokenStateMachine');
const { recalcServiceEtas, recalibrateServiceAvg } = require('../services/etaService');
const { issueToken, callNext } = require('../services/queueService');
const { notify } = require('../services/notificationService');
const { emitQueueUpdate } = require('../sockets');

const router = express.Router();

// All token routes are tenant-scoped.
router.use(authenticate, requireOrg);

// Live queue for a branch (staff/kiosk display).
router.get('/branch/:branchId', async (req, res) => {
  const tokens = await Token.find(
    scoped(req, {
      branch: req.params.branchId,
      status: { $in: ['waiting', 'serving', 'held', 'skipped'] },
    })
  )
    .populate('service', 'name tokenPrefix')
    .populate('counter', 'name')
    .sort({ isPriority: -1, issuedAt: 1 });
  res.json({ tokens });
});

// Staff/kiosk issues a walk-in token.
router.post('/', authorize('Staff', 'Operator', 'Admin'), async (req, res, next) => {
  try {
    const { branchId, serviceId, isPriority, customerName, customerPhone } = req.body;
    const result = await issueToken({
      organization: req.orgId,
      branchId,
      serviceId,
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
router.post('/call-next', authorize('Staff', 'Operator', 'Admin'), async (req, res, next) => {
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
 * Shared handler for the lifecycle transitions. Fetches the token, asserts
 * it belongs to the caller's org, applies the state-machine transition,
 * refreshes that service's ETAs, and broadcasts.
 */
async function doTransition(req, res, toStatus) {
  const token = await Token.findById(req.params.id);
  if (!assertSameOrg(req, res, token)) return;

  const updated = await stateMachine.transition(token._id, toStatus, req.user._id, req.body);

  if (toStatus === 'completed' && updated.counter) {
    await Counter.findByIdAndUpdate(updated.counter, { currentToken: null });
  }
  await recalcServiceEtas(updated.branch, updated.service);
  emitQueueUpdate(updated.branch, { type: toStatus, tokenId: updated._id, service: updated.service });
  return updated;
}

router.patch('/:id/hold', authorize('Staff', 'Operator', 'Admin'), async (req, res, next) => {
  try {
    const t = await doTransition(req, res, 'held');
    if (t) res.json({ token: t });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.patch('/:id/skip', authorize('Staff', 'Operator', 'Admin'), async (req, res, next) => {
  try {
    const t = await doTransition(req, res, 'skipped');
    if (t) res.json({ token: t });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

// Recall a held/skipped token back into service.
router.patch('/:id/recall', authorize('Staff', 'Operator', 'Admin'), async (req, res) => {
  try {
    const t = await doTransition(req, res, 'serving');
    if (t) res.json({ token: t });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.patch('/:id/complete', authorize('Staff', 'Operator', 'Admin'), async (req, res) => {
  try {
    const t = await doTransition(req, res, 'completed');
    if (t) {
      // Learn from this real completion: refine the service's measured average
      // service time (off the response path).
      recalibrateServiceAvg(t.service).catch(() => {});
      res.json({ token: t });
    }
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.patch('/:id/miss', authorize('Staff', 'Operator', 'Admin'), async (req, res) => {
  try {
    const token = await Token.findById(req.params.id);
    if (!assertSameOrg(req, res, token)) return;
    // Notify the real token owner, not a client-supplied address.
    notify({ ...token.toObject(), organization: req.orgId }, 'missed').catch(() => {});
    const t = await doTransition(req, res, 'missed');
    if (t) res.json({ token: t });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

// Transfer a token to another service (cross-service journey, e.g. Consultation -> Pharmacy).
router.patch('/:id/transfer', authorize('Staff', 'Operator', 'Admin'), async (req, res, next) => {
  try {
    const { serviceId } = req.body;
    const token = await Token.findById(req.params.id);
    if (!assertSameOrg(req, res, token)) return;
    const service = await Service.findById(serviceId);
    if (!assertSameOrg(req, res, service)) return;

    const fromService = token.service;
    // Re-enter the destination queue as waiting; keep counter free.
    if (token.counter) await Counter.findByIdAndUpdate(token.counter, { currentToken: null });
    token.service = service._id;
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
      metadata: { from: fromService, to: service._id },
    });

    await Promise.all([
      recalcServiceEtas(token.branch, fromService),
      recalcServiceEtas(token.branch, service._id),
    ]);
    emitQueueUpdate(token.branch, { type: 'transfer', tokenId: token._id });
    res.json({ token });
  } catch (err) {
    next(err);
  }
});

// Full lifecycle history for one token.
router.get('/:id/audit', authorize('Admin', 'Operator'), async (req, res) => {
  const token = await Token.findById(req.params.id);
  if (!assertSameOrg(req, res, token)) return;
  const logs = await AuditLog.find({ token: token._id }).sort({ createdAt: 1 });
  res.json({ logs });
});

module.exports = router;
