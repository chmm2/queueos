const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Counter = require('../models/Counter');
const Organization = require('../models/Organization');
const { authenticate } = require('../middleware/auth');
const {
  signAccess, signRefresh, signCounterAccess, signCounterRefresh, verify,
} = require('../services/tokenService');
const { applyTemplate } = require('../services/templateService');
const { terminologyFor } = require('../config/terminology');

const router = express.Router();

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

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
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
 * Self-serve organization signup. Creates the Organization, its first Admin,
 * and seeds an industry template (branch + departments + rooms + counters) so
 * the org is usable in one step.
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
        terminology: terminologyFor(industry),
      });

      const admin = await User.create({
        organization: org._id, name, email, password, phone, role: 'Admin',
      });

      await applyTemplate(org._id, industry, orgName, slug);

      return res.status(201).json({
        organization: publicOrg(org),
        user: admin.toSafeObject(),
        accessToken: signAccess(admin),
        refreshToken: signRefresh(admin),
      });
    } catch (err) {
      if (org) {
        await Promise.all([
          Organization.deleteOne({ _id: org._id }),
          User.deleteMany({ organization: org._id }),
          Counter.deleteMany({ organization: org._id }),
        ]).catch(() => {});
      }
      if (err.code === 11000) {
        return res.status(409).json({ message: 'That email or organization is already registered' });
      }
      return next(err);
    }
  }
);

/**
 * One sign-in form for two kinds of account: an administrator, or a counter
 * signing in as itself. We try admins first, then counters.
 */
router.post(
  '/login',
  [body('email').isEmail(), body('password').notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;

    // --- Administrator ---
    const user = await User.findOne({ email, isActive: true });
    if (user && (await user.comparePassword(password))) {
      const org = user.organization ? await Organization.findById(user.organization) : null;
      return res.json({
        principal: 'user',
        user: user.toSafeObject(),
        organization: publicOrg(org),
        accessToken: signAccess(user),
        refreshToken: signRefresh(user),
      });
    }

    // --- Counter (the machine at a desk) ---
    const counter = await Counter.findOne({ email, isActive: true }).populate('room', 'name code');
    if (counter && (await counter.comparePassword(password))) {
      const org = await Organization.findById(counter.organization);
      return res.json({
        principal: 'counter',
        counter: {
          _id: counter._id,
          name: counter.name,
          code: counter.code,
          email: counter.email,
          status: counter.status,
          branch: counter.branch,
          room: counter.room,
        },
        organization: publicOrg(org),
        accessToken: signCounterAccess(counter),
        refreshToken: signCounterRefresh(counter),
      });
    }

    return res.status(401).json({ message: 'Invalid credentials' });
  }
);

// Exchange a valid refresh token for a fresh access token (either principal).
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ message: 'refreshToken required' });
  try {
    const decoded = verify(refreshToken);
    if (decoded.typ !== 'refresh') throw new Error('wrong token type');

    if (decoded.pt === 'counter') {
      const counter = await Counter.findById(decoded.id);
      if (!counter || !counter.isActive || counter.tokenVersion !== decoded.tv) {
        return res.status(401).json({ message: 'Session expired, please sign in again' });
      }
      return res.json({
        accessToken: signCounterAccess(counter),
        refreshToken: signCounterRefresh(counter),
      });
    }

    const user = await User.findById(decoded.id).select('-password');
    if (!user || !user.isActive || user.tokenVersion !== decoded.tv) {
      return res.status(401).json({ message: 'Session expired, please log in again' });
    }
    return res.json({ accessToken: signAccess(user), refreshToken: signRefresh(user) });
  } catch {
    return res.status(401).json({ message: 'Invalid refresh token' });
  }
});

// Who am I? Works for both principal types.
router.get('/me', authenticate, async (req, res) => {
  const org = req.orgId ? await Organization.findById(req.orgId) : null;
  if (req.counter) {
    return res.json({
      principal: 'counter',
      counter: req.counter,
      organization: publicOrg(org),
    });
  }
  return res.json({ principal: 'user', user: req.user, organization: publicOrg(org) });
});

module.exports = router;
