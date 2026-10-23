const express = require('express');
const mongoose = require('mongoose');
const Room = require('../models/Room');
const Token = require('../models/Token');
const Branch = require('../models/Branch');
const Department = require('../models/Department');
const Counter = require('../models/Counter');
const { authenticate, authorize } = require('../middleware/auth');
const { requireOrg, scoped, assertSameOrg } = require('../middleware/tenant');
const { FLOOR, sanitizeLayout } = require('../utils/floorplan');

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
    .select('-password')
    .populate('departments', 'name');

  const byRoom = counters.reduce((acc, c) => {
    const key = String(c.room);
    (acc[key] = acc[key] || []).push(c);
    return acc;
  }, {});

  res.json({
    floor: FLOOR, // grid size the floor-plan view draws on
    rooms: rooms.map((r) => ({ ...r.toObject(), counters: byRoom[String(r._id)] || [] })),
  });
});

/**
 * Everywhere a patient could be sent from here: every active room in the
 * branch, with the departments it serves and how many are waiting in each.
 * Deliberately lean — a counter is picking a destination, not managing rooms,
 * so it gets names and queue lengths, not other counters' logins.
 */
router.get('/branch/:branchId/destinations', async (req, res) => {
  if (!(await ownsBranch(req, req.params.branchId))) {
    return res.status(404).json({ message: 'Branch not found' });
  }
  const rooms = await Room.find(scoped(req, { branch: req.params.branchId, isActive: true }))
    .populate({ path: 'departments', select: 'name tokenPrefix', match: { isActive: true } })
    .sort({ name: 1 });

  const deptIds = rooms.flatMap((r) => (r.departments || []).map((d) => d._id));
  const counts = await Token.aggregate([
    {
      $match: {
        organization: new mongoose.Types.ObjectId(req.orgId),
        branch: new mongoose.Types.ObjectId(req.params.branchId),
        status: 'waiting',
        department: { $in: deptIds },
      },
    },
    { $group: { _id: '$department', n: { $sum: 1 } } },
  ]);
  const waiting = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));

  res.json({
    rooms: rooms.map((r) => ({
      _id: r._id,
      name: r.name,
      code: r.code,
      departments: (r.departments || []).map((d) => ({
        _id: d._id, name: d.name, waiting: waiting[String(d._id)] || 0,
      })),
    })),
  });
});

/**
 * Create a room. Departments are OPTIONAL here — you can lay out the physical
 * spaces first and decide what each one handles afterwards.
 */
router.post('/', authorize('Admin'), async (req, res) => {
  const { branch, name, code, departments = [] } = req.body;
  if (!(await ownsBranch(req, branch))) {
    return res.status(404).json({ message: 'Branch not found' });
  }
  if (departments.length) {
    const valid = await Department.countDocuments({
      _id: { $in: departments }, branch, organization: req.orgId, isActive: true,
    });
    if (valid !== departments.length) {
      return res.status(400).json({ message: 'One or more departments do not belong to this branch' });
    }
  }

  const layout = req.body.layout === undefined ? null : sanitizeLayout(req.body.layout);
  if (req.body.layout !== undefined && !layout) {
    return res.status(400).json({ message: 'layout must be { x, y, w, h } in grid cells' });
  }

  const room = await Room.create({ organization: req.orgId, branch, name, code, departments, layout });
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

    // Drop any department a counter here was handling that the room no longer
    // does, so a counter can never point at a queue outside its own room.
    const kept = new Set(req.body.departments.map(String));
    const counters = await Counter.find({ room: room._id, departments: { $ne: [] } });
    await Promise.all(
      counters.map((c) => {
        const pruned = (c.departments || []).filter((d) => kept.has(String(d)));
        if (pruned.length === c.departments.length) return null;
        c.departments = pruned;
        return c.save();
      }).filter(Boolean)
    );
  }
  if (req.body.name !== undefined) room.name = req.body.name;
  if (req.body.code !== undefined) room.code = req.body.code;
  if (req.body.layout !== undefined) {
    const layout = sanitizeLayout(req.body.layout);
    if (!layout) {
      return res.status(400).json({ message: 'layout must be { x, y, w, h } in grid cells' });
    }
    room.layout = layout;
  }

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
