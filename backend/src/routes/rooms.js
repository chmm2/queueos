const express = require('express');
const Room = require('../models/Room');
const Branch = require('../models/Branch');
const Department = require('../models/Department');
const Counter = require('../models/Counter');
const { authenticate, authorize } = require('../middleware/auth');
const { requireOrg, scoped, assertSameOrg } = require('../middleware/tenant');

const router = express.Router();
router.use(authenticate, requireOrg);

async function ownsBranch(req, branchId) {
  if (!branchId) return false;
  const branch = await Branch.findById(branchId);
  return branch && branch.organization.toString() === req.orgId;
}

/**
 * Rooms are the physical spaces in a branch. Each one owns a join QR, a wall
 * display, and the counters standing inside it.
 */
router.get('/branch/:branchId', async (req, res) => {
  const rooms = await Room.find(scoped(req, { branch: req.params.branchId, isActive: true }))
    .populate('departments', 'name tokenPrefix')
    .sort({ name: 1 });

  // Attach each room's counters so the UI can render the full picture in one go.
  const counters = await Counter.find(scoped(req, { branch: req.params.branchId }))
    .populate('assignedStaff', 'name email')
    .populate('departments', 'name');

  const byRoom = counters.reduce((acc, c) => {
    const key = String(c.room);
    (acc[key] = acc[key] || []).push(c);
    return acc;
  }, {});

  res.json({
    rooms: rooms.map((r) => ({ ...r.toObject(), counters: byRoom[String(r._id)] || [] })),
  });
});

router.post('/', authorize('Admin'), async (req, res) => {
  const { branch, name, code, departments = [] } = req.body;
  if (!(await ownsBranch(req, branch))) {
    return res.status(404).json({ message: 'Branch not found' });
  }
  // Every listed department must belong to this branch.
  const valid = await Department.countDocuments({
    _id: { $in: departments }, branch, organization: req.orgId, isActive: true,
  });
  if (valid !== departments.length) {
    return res.status(400).json({ message: 'One or more departments do not belong to this branch' });
  }

  const room = await Room.create({ organization: req.orgId, branch, name, code, departments });
  res.status(201).json({ room });
});

router.patch('/:id', authorize('Admin'), async (req, res) => {
  const room = await Room.findById(req.params.id);
  if (!assertSameOrg(req, res, room)) return;

  if (Array.isArray(req.body.departments)) {
    const valid = await Department.countDocuments({
      _id: { $in: req.body.departments }, branch: room.branch, organization: req.orgId, isActive: true,
    });
    if (valid !== req.body.departments.length) {
      return res.status(400).json({ message: 'One or more departments do not belong to this branch' });
    }
    room.departments = req.body.departments;
  }
  if (req.body.name !== undefined) room.name = req.body.name;
  if (req.body.code !== undefined) room.code = req.body.code;

  await room.save();
  res.json({ room });
});

router.delete('/:id', authorize('Admin'), async (req, res) => {
  const room = await Room.findById(req.params.id);
  if (!assertSameOrg(req, res, room)) return;

  const counters = await Counter.countDocuments({ room: room._id });
  if (counters > 0) {
    return res.status(409).json({
      message: `Remove this room's ${counters} counter(s) first.`,
    });
  }
  room.isActive = false;
  await room.save();
  res.json({ message: 'Room removed' });
});

module.exports = router;
