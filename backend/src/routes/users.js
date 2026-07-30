const express = require('express');
const User = require('../models/User');
const Counter = require('../models/Counter');
const { authenticate, authorize } = require('../middleware/auth');
const { requireOrg, scoped, assertSameOrg } = require('../middleware/tenant');

const router = express.Router();
router.use(authenticate, requireOrg, authorize('Admin'));

/**
 * Administrator accounts. These are the only accounts belonging to a PERSON —
 * the people working the desks sign in as the counter they're sitting at.
 */
router.get('/', async (req, res) => {
  const users = await User.find(scoped(req, {})).select('-password').sort({ name: 1 });
  res.json({ users });
});

router.post('/', async (req, res) => {
  const { name, email, password, phone } = req.body;

  // The email must be free across both account types.
  const [takenByUser, takenByCounter] = await Promise.all([
    User.exists({ email }),
    Counter.exists({ email }),
  ]);
  if (takenByUser || takenByCounter) {
    return res.status(409).json({ message: 'That email already has an account' });
  }

  const user = await User.create({
    organization: req.orgId, name, email, password, phone, role: 'Admin',
  });
  res.status(201).json({ user: user.toSafeObject() });
});

router.patch('/:id', async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!assertSameOrg(req, res, user)) return;
  const { name, phone } = req.body;
  if (name !== undefined) user.name = name;
  if (phone !== undefined) user.phone = phone;
  await user.save();
  res.json({ user: user.toSafeObject() });
});

router.patch('/:id/deactivate', async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!assertSameOrg(req, res, user)) return;
  if (String(user._id) === String(req.user._id)) {
    return res.status(400).json({ message: 'You cannot deactivate your own account' });
  }
  const remaining = await User.countDocuments({ organization: req.orgId, isActive: true });
  if (remaining <= 1) {
    return res.status(400).json({ message: 'An organization needs at least one active administrator' });
  }
  user.isActive = false;
  user.tokenVersion += 1; // revoke their active sessions
  await user.save();
  res.json({ user: user.toSafeObject() });
});

module.exports = router;
