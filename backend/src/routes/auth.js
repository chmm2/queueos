const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Organization = require('../models/Organization');
const { authenticate } = require('../middleware/auth');
const { signAccess, signRefresh, verify } = require('../services/tokenService');
const { applyTemplate } = require('../services/templateService');
const { terminologyFor } = require('../config/terminology');

// The org fields the frontend needs (name, industry, vocabulary, brand).
function publicOrg(org) {
  if (!org) return null;
  return {
    _id: org._id,
    name: org.name,
    slug: org.slug,
    industry: org.industry,
    terminology: org.terminology,
    brandColor: org.settings?.brandColor,
  };
}

const router = express.Router();

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

async function uniqueSlug(base) {
  let slug = base || 'org';
  let n = 0;
  // eslint-disable-next-line no-await-in-loop
  while (await Organization.exists({ slug })) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

/**
 * Self-serve organization signup. Creates the Organization, its first Admin
 * (the owner), and optionally seeds an industry template (branch + services
 * + counters) so the org is usable in one step. This is what makes "sign up
 * and start managing queues in minutes" real.
 */
router.post(
  '/register-org',
  [
    body('orgName').trim().notEmpty().withMessage('Organization name is required'),
    body('name').trim().notEmpty().withMessage('Your name is required'),
    body('email').isEmail(),
    body('password').isLength({ min: 6 }),
    body('industry').optional().isString(),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { orgName, name, email, password, phone, industry } = req.body;

    // Sequential creates with manual rollback. We deliberately avoid a Mongo
    // multi-document transaction here because those require a replica set —
    // and this platform must deploy against a plain standalone MongoDB too.
    let org = null;
    try {
      const slug = await uniqueSlug(slugify(orgName));
      org = await Organization.create({
        name: orgName,
        slug,
        industry: industry || 'other',
        terminology: terminologyFor(industry), // speak the industry's language
      });

      const admin = await User.create({
        organization: org._id,
        name,
        email,
        password,
        phone,
        role: 'Admin',
      });

      // Seed a ready-to-use branch + departments + rooms + counters.
      await applyTemplate(org._id, industry, orgName);

      return res.status(201).json({
        organization: publicOrg(org),
        user: admin.toSafeObject(),
        accessToken: signAccess(admin),
        refreshToken: signRefresh(admin),
      });
    } catch (err) {
      // Roll back the half-created org so a retry (e.g. after a duplicate
      // email) starts clean.
      if (org) {
        await Promise.all([
          Organization.deleteOne({ _id: org._id }),
          User.deleteMany({ organization: org._id }),
        ]).catch(() => {});
      }
      if (err.code === 11000) {
        return res.status(409).json({ message: 'That email or organization is already registered' });
      }
      return next(err);
    }
  }
);

router.post(
  '/login',
  [body('email').isEmail(), body('password').notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;
    // Email is unique per org; a staff member logs in with just their email
    // because the org is resolved from the matched account.
    const user = await User.findOne({ email, isActive: true });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const match = await user.comparePassword(password);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });

    const org = user.organization ? await Organization.findById(user.organization) : null;
    res.json({
      user: user.toSafeObject(),
      organization: publicOrg(org),
      accessToken: signAccess(user),
      refreshToken: signRefresh(user),
    });
  }
);

// Exchange a valid refresh token for a fresh access token. tokenVersion is
// re-checked so a revoked session can't be refreshed.
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ message: 'refreshToken required' });
  try {
    const decoded = verify(refreshToken);
    if (decoded.typ !== 'refresh') throw new Error('wrong token type');

    const user = await User.findById(decoded.id).select('-password');
    if (!user || !user.isActive || user.tokenVersion !== decoded.tv) {
      return res.status(401).json({ message: 'Session expired, please log in again' });
    }
    res.json({ accessToken: signAccess(user), refreshToken: signRefresh(user) });
  } catch {
    return res.status(401).json({ message: 'Invalid refresh token' });
  }
});

// Revoke all of this user's tokens (logout everywhere) by bumping the version.
router.post('/logout-all', authenticate, async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { $inc: { tokenVersion: 1 } });
  res.json({ message: 'All sessions revoked' });
});

router.get('/me', authenticate, async (req, res) => {
  const org = req.user.organization ? await Organization.findById(req.user.organization) : null;
  res.json({ user: req.user, organization: publicOrg(org) });
});

module.exports = router;
