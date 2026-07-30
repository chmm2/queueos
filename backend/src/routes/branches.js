const express = require('express');
const Branch = require('../models/Branch');
const Organization = require('../models/Organization');
const Department = require('../models/Department');
const Room = require('../models/Room');
const Counter = require('../models/Counter');
const User = require('../models/User');
const { authenticate, authorize } = require('../middleware/auth');
const { requireOrg, scoped, assertSameOrg } = require('../middleware/tenant');
const { generateBranchQr } = require('../services/qrService');

const router = express.Router();
router.use(authenticate, requireOrg);

// List this org's branches, with a quick count of what's configured in each.
router.get('/', async (req, res) => {
  const branches = await Branch.find(scoped(req, { isActive: true })).sort({ name: 1 });
  const ids = branches.map((b) => b._id);

  const [depts, rooms, counters, staff] = await Promise.all([
    Department.aggregate([{ $match: { branch: { $in: ids }, isActive: true } }, { $group: { _id: '$branch', n: { $sum: 1 } } }]),
    Room.aggregate([{ $match: { branch: { $in: ids }, isActive: true } }, { $group: { _id: '$branch', n: { $sum: 1 } } }]),
    Counter.aggregate([{ $match: { branch: { $in: ids } } }, { $group: { _id: '$branch', n: { $sum: 1 } } }]),
    User.aggregate([{ $match: { branch: { $in: ids }, isActive: true } }, { $group: { _id: '$branch', n: { $sum: 1 } } }]),
  ]);
  const map = (rows) => Object.fromEntries(rows.map((r) => [String(r._id), r.n]));
  const [d, r, c, s] = [map(depts), map(rooms), map(counters), map(staff)];

  res.json({
    branches: branches.map((b) => ({
      ...b.toObject(),
      counts: {
        departments: d[String(b._id)] || 0,
        rooms: r[String(b._id)] || 0,
        counters: c[String(b._id)] || 0,
        staff: s[String(b._id)] || 0,
      },
    })),
  });
});

router.get('/:id', async (req, res) => {
  const branch = await Branch.findById(req.params.id);
  if (!assertSameOrg(req, res, branch)) return;
  res.json({ branch });
});

router.post('/', authorize('Admin'), async (req, res) => {
  const branch = await Branch.create({ ...req.body, organization: req.orgId });
  res.status(201).json({ branch });
});

router.patch('/:id', authorize('Admin'), async (req, res) => {
  const branch = await Branch.findById(req.params.id);
  if (!assertSameOrg(req, res, branch)) return;
  const { organization, ...safe } = req.body; // never allow re-parenting
  Object.assign(branch, safe);
  await branch.save();
  res.json({ branch });
});

router.delete('/:id', authorize('Admin'), async (req, res) => {
  const branch = await Branch.findById(req.params.id);
  if (!assertSameOrg(req, res, branch)) return;
  branch.isActive = false;
  await branch.save();
  res.json({ message: 'Branch archived' });
});

/**
 * Rotating join QR, normally scoped to a ROOM so each physical space has its
 * own code:
 *   /branches/:id/qr                  -> whole branch (every department)
 *   /branches/:id/qr?room=<id>        -> just that room (e.g. Registration)
 *   /branches/:id/qr?department=<id>  -> a single department
 */
router.get('/:id/qr', async (req, res, next) => {
  try {
    const branch = await Branch.findById(req.params.id);
    if (!assertSameOrg(req, res, branch)) return;
    const org = await Organization.findById(req.orgId);
    const qr = await generateBranchQr(org, branch, {
      room: req.query.room,
      department: req.query.department,
    });
    res.json(qr);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
