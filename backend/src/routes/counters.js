const express = require('express');
const Counter = require('../models/Counter');
const Room = require('../models/Room');
const Branch = require('../models/Branch');
const Organization = require('../models/Organization');
const User = require('../models/User');
const { authenticate, authorize } = require('../middleware/auth');
const { requireOrg, scoped, assertSameOrg } = require('../middleware/tenant');
const { buildCounterCode, counterEmail, generatePassword } = require('../services/codeService');

const router = express.Router();
router.use(authenticate, requireOrg);

// The counter's own identity — what the machine at the desk sees on sign-in.
router.get('/me', authorize('Counter'), async (req, res) => {
  const counter = await Counter.findById(req.counter._id)
    .select('-password')
    .populate('room', 'name code departments')
    .populate('departments', 'name tokenPrefix');
  res.json({ counter });
});

router.get('/branch/:branchId', authorize('Admin'), async (req, res) => {
  const counters = await Counter.find(scoped(req, { branch: req.params.branchId }))
    .select('-password')
    .populate('departments', 'name tokenPrefix')
    .populate('room', 'name code');
  res.json({ counters });
});

/**
 * Create a counter inside a room. This also creates its LOGIN: an email
 * derived from the counter code and a generated password, which is returned
 * exactly once so the admin can hand it to the team. Only the hash is stored.
 */
router.post('/', authorize('Admin'), async (req, res) => {
  const { room: roomId, name, departments = [], code, email, password } = req.body;

  const room = await Room.findById(roomId);
  if (!assertSameOrg(req, res, room)) return;

  // A counter can only serve departments its room actually handles.
  const roomDepts = new Set((room.departments || []).map(String));
  if (departments.some((d) => !roomDepts.has(String(d)))) {
    return res.status(400).json({ message: "A counter can only serve departments assigned to its room" });
  }

  const [org, branch, siblings] = await Promise.all([
    Organization.findById(req.orgId).select('name slug'),
    Branch.findById(room.branch).select('name'),
    Counter.find({ organization: req.orgId }).select('code'),
  ]);

  const finalCode = (code || buildCounterCode({
    orgName: org?.name, branchName: branch?.name, room, existingCodes: siblings.map((c) => c.code),
  })).toUpperCase();

  const finalEmail = (email || counterEmail(finalCode, org?.slug)).toLowerCase();
  const plainPassword = password || generatePassword();

  // The email must be free across BOTH account types.
  const [takenByUser, takenByCounter] = await Promise.all([
    User.exists({ email: finalEmail }),
    Counter.exists({ email: finalEmail }),
  ]);
  if (takenByUser || takenByCounter) {
    return res.status(409).json({ message: 'That sign-in email is already in use' });
  }

  const counter = await Counter.create({
    organization: req.orgId,
    branch: room.branch,
    room: room._id,
    name: name || `Counter ${(await Counter.countDocuments({ room: room._id })) + 1}`,
    code: finalCode,
    email: finalEmail,
    password: plainPassword,
    departments,
  });

  // `credentials` is the ONLY time the password is ever readable.
  res.status(201).json({
    counter: counter.toSafeObject(),
    credentials: { email: finalEmail, password: plainPassword },
  });
});

// Edit a counter — including clubbing several of its room's departments.
router.patch('/:id', authorize('Admin'), async (req, res) => {
  const counter = await Counter.findById(req.params.id);
  if (!assertSameOrg(req, res, counter)) return;

  if (Array.isArray(req.body.departments)) {
    const room = await Room.findById(counter.room);
    const roomDepts = new Set((room?.departments || []).map(String));
    if (req.body.departments.some((d) => !roomDepts.has(String(d)))) {
      return res.status(400).json({
        message: "This counter's room doesn't handle that department — add it to the room first",
      });
    }
    counter.departments = req.body.departments;
  }
  if (req.body.name !== undefined) counter.name = req.body.name;
  if (req.body.code !== undefined) counter.code = req.body.code.toUpperCase();

  await counter.save();
  res.json({ counter: counter.toSafeObject() });
});

// Issue a fresh password (returned once) and invalidate existing sessions.
router.post('/:id/reset-password', authorize('Admin'), async (req, res) => {
  const counter = await Counter.findById(req.params.id);
  if (!assertSameOrg(req, res, counter)) return;
  const plainPassword = generatePassword();
  counter.password = plainPassword;
  counter.tokenVersion += 1; // sign the machine out everywhere
  await counter.save();
  res.json({ credentials: { email: counter.email, password: plainPassword } });
});

// Open / pause / close. A counter can control itself; an admin can too.
router.patch('/:id/pause', authorize('Admin', 'Counter'), async (req, res) => {
  const counter = await Counter.findById(req.params.id);
  if (!assertSameOrg(req, res, counter)) return;
  if (req.user.role === 'Counter' && String(counter._id) !== String(req.counter._id)) {
    return res.status(403).json({ message: 'A counter can only control itself' });
  }
  counter.status = counter.status === 'paused' ? 'open' : 'paused';
  await counter.save();
  res.json({ counter: counter.toSafeObject() });
});

router.patch('/:id/open', authorize('Admin', 'Counter'), async (req, res) => {
  const counter = await Counter.findById(req.params.id);
  if (!assertSameOrg(req, res, counter)) return;
  if (req.user.role === 'Counter' && String(counter._id) !== String(req.counter._id)) {
    return res.status(403).json({ message: 'A counter can only control itself' });
  }
  counter.status = 'open';
  await counter.save();
  res.json({ counter: counter.toSafeObject() });
});

router.patch('/:id/close', authorize('Admin', 'Counter'), async (req, res) => {
  const counter = await Counter.findById(req.params.id);
  if (!assertSameOrg(req, res, counter)) return;
  if (req.user.role === 'Counter' && String(counter._id) !== String(req.counter._id)) {
    return res.status(403).json({ message: 'A counter can only control itself' });
  }
  counter.status = 'closed';
  counter.currentToken = null;
  await counter.save();
  res.json({ counter: counter.toSafeObject() });
});

router.delete('/:id', authorize('Admin'), async (req, res) => {
  const counter = await Counter.findById(req.params.id);
  if (!assertSameOrg(req, res, counter)) return;
  await Counter.deleteOne({ _id: counter._id });
  res.json({ message: 'Counter removed' });
});

module.exports = router;
