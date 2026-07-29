const express = require('express');
const Service = require('../models/Service');
const Branch = require('../models/Branch');
const { authenticate, authorize } = require('../middleware/auth');
const { requireOrg, scoped, assertSameOrg } = require('../middleware/tenant');

const router = express.Router();
router.use(authenticate, requireOrg);

// Confirm a referenced branch belongs to the caller's org (prevents creating
// records that point at another tenant's branch).
async function ownsBranch(req, branchId) {
  if (!branchId) return false;
  const branch = await Branch.findById(branchId);
  return branch && branch.organization.toString() === req.orgId;
}

/**
 * Service CRUD — this is the zero-code configuration surface. An org admin
 * creates/edits the services (queues) their branches offer without any
 * deploy: prefix, queue type, priority, SLA and avg service time are all
 * editable data.
 */
router.get('/branch/:branchId', async (req, res) => {
  const services = await Service.find(scoped(req, { branch: req.params.branchId, isActive: true }));
  res.json({ services });
});

router.post('/', authorize('Admin', 'Operator'), async (req, res) => {
  if (!(await ownsBranch(req, req.body.branch))) {
    return res.status(404).json({ message: 'Branch not found' });
  }
  const service = await Service.create({ ...req.body, organization: req.orgId });
  res.status(201).json({ service });
});

router.patch('/:id', authorize('Admin', 'Operator'), async (req, res) => {
  const service = await Service.findById(req.params.id);
  if (!assertSameOrg(req, res, service)) return;
  const { organization, ...safe } = req.body;
  Object.assign(service, safe);
  await service.save();
  res.json({ service });
});

router.delete('/:id', authorize('Admin', 'Operator'), async (req, res) => {
  const service = await Service.findById(req.params.id);
  if (!assertSameOrg(req, res, service)) return;
  service.isActive = false; // soft delete — keep history intact
  await service.save();
  res.json({ message: 'Service archived' });
});

module.exports = router;
