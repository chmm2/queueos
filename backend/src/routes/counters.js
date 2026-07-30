const express = require('express');
const Counter = require('../models/Counter');
const Room = require('../models/Room');
const Branch = require('../models/Branch');
const Organization = require('../models/Organization');
const User = require('../models/User');
const { authenticate, authorize } = require('../middleware/auth');
const { requireOrg, scoped, assertSameOrg } = require('../middleware/tenant');
const { buildCounterCode } = require('../services/codeService');

const router = express.Router();
router.use(authenticate, requireOrg);

router.get('/branch/:branchId', async (req, res) => {
  const counters = await Counter.find(scoped(req, { branch: req.params.branchId }))
    .populate('assignedStaff', 'name email')
    .populate('departments', 'name tokenPrefix')
    .populate('room', 'name code');
  res.json({ counters });
});

router.get('/room/:roomId', async (req, res) => {
  const counters = await Counter.find(scoped(req, { room: req.params.roomId }))
    .populate('assignedStaff', 'name email')
    .populate('departments', 'name tokenPrefix');
  res.json({ counters });
});

/**
 * Create a counter inside a room. Its unique printable code (DCC-MH-REG-01)
 * is generated from the org/branch/room names unless one is supplied.
 */
router.post('/', authorize('Admin'), async (req, res) => {
  const { room: roomId, name, departments = [], code } = req.body;

  const room = await Room.findById(roomId);
  if (!assertSameOrg(req, res, room)) return;

  // A counter can only serve departments its room actually handles.
  const roomDepts = new Set((room.departments || []).map(String));
  const invalid = departments.filter((d) => !roomDepts.has(String(d)));
  if (invalid.length) {
    return res.status(400).json({ message: 'A counter can only serve departments assigned to its room' });
  }

  const [org, branch, siblings] = await Promise.all([
    Organization.findById(req.orgId).select('name'),
    Branch.findById(room.branch).select('name'),
    Counter.find({ organization: req.orgId }).select('code'),
  ]);

  const counter = await Counter.create({
    organization: req.orgId,
    branch: room.branch,
    room: room._id,
    name: name || `Counter ${(await Counter.countDocuments({ room: room._id })) + 1}`,
    code: code || buildCounterCode({
      orgName: org?.name,
      branchName: branch?.name,
      room,
      existingCodes: siblings.map((c) => c.code),
    }),
    departments,
  });

  res.status(201).json({ counter });
});

router.patch('/:id', authorize('Admin'), async (req, res) => {
  const counter = await Counter.findById(req.params.id);
  if (!assertSameOrg(req, res, counter)) return;

  if (Array.isArray(req.body.departments)) {
    const room = await Room.findById(counter.room);
    const roomDepts = new Set((room?.departments || []).map(String));
    if (req.body.departments.some((d) => !roomDepts.has(String(d)))) {
      return res.status(400).json({ message: 'A counter can only serve departments assigned to its room' });
    }
    counter.departments = req.body.departments;
  }
  if (req.body.name !== undefined) counter.name = req.body.name;
  if (req.body.code !== undefined) counter.code = req.body.code;

  await counter.save();
  res.json({ counter });
});

// Assign staff and open the counter for serving.
router.patch('/:id/assign', authorize('Admin'), async (req, res) => {
  const counter = await Counter.findById(req.params.id);
  if (!assertSameOrg(req, res, counter)) return;

  if (req.body.staffId) {
    const staff = await User.findById(req.body.staffId);
    if (!assertSameOrg(req, res, staff)) return;
    counter.assignedStaff = staff._id;
    // Remember this as the staff member's default counter.
    staff.counter = counter._id;
    staff.branch = counter.branch;
    await staff.save();
  } else {
    counter.assignedStaff = null;
  }
  counter.status = 'open';
  await counter.save();
  res.json({ counter });
});

// Pause = temporarily stop calling (excluded from ETA capacity); resume reopens.
router.patch('/:id/pause', authorize('Admin', 'Staff'), async (req, res) => {
  const counter = await Counter.findById(req.params.id);
  if (!assertSameOrg(req, res, counter)) return;
  counter.status = counter.status === 'paused' ? 'open' : 'paused';
  await counter.save();
  res.json({ counter });
});

router.patch('/:id/close', authorize('Admin', 'Staff'), async (req, res) => {
  const counter = await Counter.findById(req.params.id);
  if (!assertSameOrg(req, res, counter)) return;
  counter.status = 'closed';
  counter.currentToken = null;
  await counter.save();
  res.json({ counter });
});

router.delete('/:id', authorize('Admin'), async (req, res) => {
  const counter = await Counter.findById(req.params.id);
  if (!assertSameOrg(req, res, counter)) return;
  await Counter.deleteOne({ _id: counter._id });
  await User.updateMany({ counter: counter._id }, { counter: null });
  res.json({ message: 'Counter removed' });
});

module.exports = router;
