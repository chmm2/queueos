const express = require('express');
const { Types } = require('mongoose');
const Token = require('../models/Token');
const Department = require('../models/Department');
const ModelState = require('../models/ModelState');
const { authenticate, authorize } = require('../middleware/auth');
const { requireOrg, scoped } = require('../middleware/tenant');
const { trainOrg } = require('../services/trainingService');

const oid = (v) => Types.ObjectId.createFromHexString(String(v));

const router = express.Router();
router.use(authenticate, requireOrg);

// Per-branch summary: throughput, wait/service times, no-show + abandonment.
router.get('/branch/:branchId/summary', authorize('Admin'), async (req, res) => {
  const { branchId } = req.params;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const base = scoped(req, { branch: branchId });

  const completed = await Token.find({ ...base, status: 'completed', completedAt: { $gte: since } });
  const [missedCount, cancelledCount, totalIssued] = await Promise.all([
    Token.countDocuments({ ...base, status: 'missed', createdAt: { $gte: since } }),
    Token.countDocuments({ ...base, status: 'cancelled', createdAt: { $gte: since } }),
    Token.countDocuments({ ...base, createdAt: { $gte: since } }),
  ]);

  const avg = (arr, fn) => (arr.length ? Math.round(arr.reduce((s, t) => s + fn(t), 0) / arr.length) : 0);

  res.json({
    totalIssued,
    completedCount: completed.length,
    missedCount,
    cancelledCount,
    noShowRate: totalIssued ? +(missedCount / totalIssued).toFixed(3) : 0,
    abandonmentRate: totalIssued ? +(cancelledCount / totalIssued).toFixed(3) : 0,
    avgWaitSeconds: avg(completed, (t) => (t.startedAt - t.issuedAt) / 1000),
    avgServiceSeconds: avg(completed, (t) => (t.completedAt - t.startedAt) / 1000),
  });
});

// Hourly issue volume for the last 24h — feeds the peak-hour chart.
router.get('/branch/:branchId/hourly', authorize('Admin'), async (req, res) => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await Token.aggregate([
    { $match: { organization: oid(req.orgId), branch: oid(req.params.branchId), createdAt: { $gte: since } } },
    { $group: { _id: { $hour: '$createdAt' }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  res.json({ hourly: rows.map((r) => ({ hour: r._id, count: r.count })) });
});

// Per-department breakdown for the branch — which queues are busiest/slowest.
router.get('/branch/:branchId/departments', authorize('Admin'), async (req, res) => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const departments = await Department.find(scoped(req, { branch: req.params.branchId, isActive: true }));

  const rows = await Promise.all(
    departments.map(async (d) => {
      const [waiting, completedDocs] = await Promise.all([
        Token.countDocuments({ department: d._id, status: 'waiting' }),
        Token.find({ department: d._id, status: 'completed', completedAt: { $gte: since } }).select('issuedAt startedAt'),
      ]);
      const avgWait = completedDocs.length
        ? Math.round(completedDocs.reduce((s, t) => s + (t.startedAt - t.issuedAt) / 1000, 0) / completedDocs.length)
        : 0;
      return { id: d._id, name: d.name, waiting, servedToday: completedDocs.length, avgWaitSeconds: avgWait };
    })
  );
  res.json({ departments: rows });
});

// Self-learning ETA model status for the org (drives the "Smart ETA" card).
router.get('/model', authorize('Admin'), async (req, res) => {
  const state = await ModelState.findOne({ organization: req.orgId });
  const readyCount = await Token.countDocuments({
    organization: req.orgId,
    status: 'completed',
    startedAt: { $ne: null },
    'etaFeatures.queuePosition': { $ne: null },
  });
  res.json({
    status: state?.status || 'collecting',
    sampleCount: readyCount,
    accuracy: state?.accuracy ?? null,
    maeSeconds: state?.maeSeconds ?? null,
    reason: state?.reason || 'Collecting real visit data…',
    lastTrainedAt: state?.lastTrainedAt || null,
  });
});

// Force a training run instead of waiting for the scheduler.
router.post('/model/train', authorize('Admin'), async (req, res, next) => {
  try {
    res.json(await trainOrg(req.orgId));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
