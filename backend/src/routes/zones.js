const express = require('express');
const Zone = require('../models/Zone');
const Branch = require('../models/Branch');
const { authenticate, authorize } = require('../middleware/auth');
const { requireOrg, scoped, assertSameOrg } = require('../middleware/tenant');

const router = express.Router();
router.use(authenticate, requireOrg);

async function ownsBranch(req, branchId) {
  if (!branchId) return false;
  const branch = await Branch.findById(branchId);
  return branch && branch.organization.toString() === req.orgId;
}

// Zones for a branch, with their services populated (for pickers + boards).
router.get('/branch/:branchId', async (req, res) => {
  const zones = await Zone.find(scoped(req, { branch: req.params.branchId, isActive: true }))
    .populate('services', 'name tokenPrefix');
  res.json({ zones });
});

router.post('/', authorize('Admin', 'Operator'), async (req, res) => {
  if (!(await ownsBranch(req, req.body.branch))) {
    return res.status(404).json({ message: 'Branch not found' });
  }
  const zone = await Zone.create({ ...req.body, organization: req.orgId });
  res.status(201).json({ zone });
});

router.patch('/:id', authorize('Admin', 'Operator'), async (req, res) => {
  const zone = await Zone.findById(req.params.id);
  if (!assertSameOrg(req, res, zone)) return;
  const { organization, ...safe } = req.body;
  Object.assign(zone, safe);
  await zone.save();
  res.json({ zone });
});

router.delete('/:id', authorize('Admin', 'Operator'), async (req, res) => {
  const zone = await Zone.findById(req.params.id);
  if (!assertSameOrg(req, res, zone)) return;
  zone.isActive = false;
  await zone.save();
  res.json({ message: 'Zone removed' });
});

module.exports = router;
