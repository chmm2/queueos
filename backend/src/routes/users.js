const express = require('express');
const User = require('../models/User');
const Branch = require('../models/Branch');
const { authenticate, authorize } = require('../middleware/auth');
const { requireOrg, scoped, assertSameOrg } = require('../middleware/tenant');

const router = express.Router();
router.use(authenticate, requireOrg);

/**
 * Staff accounts. Only two roles exist: Admin (configures the organization)
 * and Staff (works a counter). Customers never need an account.
 */
router.get('/', async (req, res) => {
  const filter = scoped(req, {});
  // Staff can only see colleagues at their own branch.
  if (req.user.role === 'Staff') filter.branch = req.user.branch;
  else if (req.query.branch) filter.branch = req.query.branch;

  const users = await User.find(filter)
    .select('-password')
    .populate('counter', 'name code')
    .sort({ name: 1 });
  res.json({ users });
});

router.post('/', authorize('Admin'), async (req, res) => {
  const { name, email, password, role, branch, phone } = req.body;
  if (!['Staff', 'Admin'].includes(role)) {
    return res.status(400).json({ message: 'Role must be Staff or Admin' });
  }
  // Staff must belong to a branch; Admins are org-wide.
  if (role === 'Staff') {
    const owns = branch && (await Branch.findOne({ _id: branch, organization: req.orgId }));
    if (!owns) return res.status(400).json({ message: 'Staff must be assigned to a branch of your organization' });
  }

  // Emails are globally unique (one email = one account = one organization).
  const existing = await User.findOne({ email });
  if (existing) return res.status(409).json({ message: 'That email already has an account' });

  const user = await User.create({
    organization: req.orgId,
    name,
    email,
    password,
    role,
    branch: role === 'Staff' ? branch : null,
    phone,
  });
  res.status(201).json({ user: user.toSafeObject() });
});

router.patch('/:id', authorize('Admin'), async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!assertSameOrg(req, res, user)) return;
  const { name, phone, branch, role } = req.body;
  if (name !== undefined) user.name = name;
  if (phone !== undefined) user.phone = phone;
  if (branch !== undefined) user.branch = branch || null;
  if (role && ['Staff', 'Admin'].includes(role)) user.role = role;
  await user.save();
  res.json({ user: user.toSafeObject() });
});

router.patch('/:id/deactivate', authorize('Admin'), async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!assertSameOrg(req, res, user)) return;
  if (String(user._id) === String(req.user._id)) {
    return res.status(400).json({ message: 'You cannot deactivate your own account' });
  }
  user.isActive = false;
  user.tokenVersion += 1; // revoke their active sessions
  await user.save();
  res.json({ user: user.toSafeObject() });
});

module.exports = router;
