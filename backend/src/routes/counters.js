const express = require('express');
const Counter = require('../models/Counter');
const Branch = require('../models/Branch');
const { authenticate, authorize } = require('../middleware/auth');
const { requireOrg, scoped, assertSameOrg } = require('../middleware/tenant');

const router = express.Router();
router.use(authenticate, requireOrg);

async function ownsBranch(req, branchId) {
  if (!branchId) return false;
  const branch = await Branch.findById(branchId);
  return branch && branch.organization.toString() === req.orgId;
}

router.get('/branch/:branchId', async (req, res) => {
  const counters = await Counter.find(scoped(req, { branch: req.params.branchId }))
    .populate('assignedStaff', 'name')
    .populate('services', 'name tokenPrefix');
  res.json({ counters });
});

router.post('/', authorize('Admin', 'Operator'), async (req, res) => {
  if (!(await ownsBranch(req, req.body.branch))) {
    return res.status(404).json({ message: 'Branch not found' });
  }
  const counter = await Counter.create({ ...req.body, organization: req.orgId });
  res.status(201).json({ counter });
});

// Assign staff and open the counter for serving.
router.patch('/:id/assign', authorize('Admin', 'Operator'), async (req, res) => {
  const counter = await Counter.findById(req.params.id);
  if (!assertSameOrg(req, res, counter)) return;
  counter.assignedStaff = req.body.staffId || null;
  if (Array.isArray(req.body.services)) counter.services = req.body.services;
  counter.status = 'open';
  await counter.save();
  res.json({ counter });
});

// Pause = temporarily stop calling (kept out of ETA capacity); resume reopens.
router.patch('/:id/pause', authorize('Admin', 'Operator', 'Staff'), async (req, res) => {
  const counter = await Counter.findById(req.params.id);
  if (!assertSameOrg(req, res, counter)) return;
  counter.status = counter.status === 'paused' ? 'open' : 'paused';
  await counter.save();
  res.json({ counter });
});

router.patch('/:id/close', authorize('Admin', 'Operator', 'Staff'), async (req, res) => {
  const counter = await Counter.findById(req.params.id);
  if (!assertSameOrg(req, res, counter)) return;
  counter.status = 'closed';
  counter.assignedStaff = null;
  counter.currentToken = null;
  await counter.save();
  res.json({ counter });
});

module.exports = router;
