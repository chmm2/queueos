const express = require('express');
const Branch = require('../models/Branch');
const Organization = require('../models/Organization');
const { authenticate, authorize } = require('../middleware/auth');
const { requireOrg, scoped, assertSameOrg } = require('../middleware/tenant');
const { generateBranchQr } = require('../services/qrService');

const router = express.Router();
router.use(authenticate, requireOrg);

// List this org's branches only.
router.get('/', async (req, res) => {
  const branches = await Branch.find(scoped(req, { isActive: true }));
  res.json({ branches });
});

router.post('/', authorize('Admin'), async (req, res) => {
  const branch = await Branch.create({ ...req.body, organization: req.orgId });
  res.status(201).json({ branch });
});

router.patch('/:id', authorize('Admin'), async (req, res) => {
  const branch = await Branch.findById(req.params.id);
  if (!assertSameOrg(req, res, branch)) return;
  // Never allow the org to be reassigned from the body.
  const { organization, ...safe } = req.body;
  Object.assign(branch, safe);
  await branch.save();
  res.json({ branch });
});

// Rotating join QR for the branch, optionally scoped to a physical area:
//   /branches/:id/qr                -> whole branch
//   /branches/:id/qr?zone=<id>      -> just that zone (e.g. Pharmacy)
//   /branches/:id/qr?service=<id>   -> a single service
router.get('/:id/qr', async (req, res, next) => {
  try {
    const branch = await Branch.findById(req.params.id);
    if (!assertSameOrg(req, res, branch)) return;
    const org = await Organization.findById(req.orgId);
    const qr = await generateBranchQr(org, branch, { zone: req.query.zone, service: req.query.service });
    res.json(qr);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
