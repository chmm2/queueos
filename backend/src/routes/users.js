const express = require('express');
const User = require('../models/User');
const { authenticate, authorize } = require('../middleware/auth');
const { requireOrg, scoped, assertSameOrg } = require('../middleware/tenant');

const router = express.Router();
router.use(authenticate, requireOrg);

// Admin invites Staff/Operator/Admin into THIS org (org is forced from token).
router.post('/', authorize('Admin'), async (req, res) => {
  const { name, email, password, role, branch, phone } = req.body;
  if (!['Staff', 'Operator', 'Admin'].includes(role)) {
    return res.status(400).json({ message: 'Invalid staff role' });
  }
  // Emails are globally unique (one email = one account = one org).
  const existing = await User.findOne({ email });
  if (existing) return res.status(409).json({ message: 'That email already has an account' });

  const user = await User.create({ organization: req.orgId, name, email, password, role, branch, phone });
  res.status(201).json({ user: user.toSafeObject() });
});

router.get('/', authorize('Admin', 'Operator'), async (req, res) => {
  const filter = scoped(req, {});
  if (req.user.role === 'Operator') filter.branch = req.user.branch;
  const users = await User.find(filter).select('-password');
  res.json({ users });
});

router.patch('/:id/deactivate', authorize('Admin'), async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!assertSameOrg(req, res, user)) return;
  user.isActive = false;
  user.tokenVersion += 1; // revoke their active sessions
  await user.save();
  res.json({ user: user.toSafeObject() });
});

module.exports = router;
