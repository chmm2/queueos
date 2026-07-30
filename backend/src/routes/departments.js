const express = require('express');
const Department = require('../models/Department');
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

/**
 * Departments are the queues a branch offers. They are pure configuration —
 * no physical layout — which is what makes them safely copyable between
 * branches (see POST /copy).
 */
router.get('/branch/:branchId', async (req, res) => {
  const departments = await Department.find(
    scoped(req, { branch: req.params.branchId, isActive: true })
  ).sort({ name: 1 });
  res.json({ departments });
});

router.post('/', authorize('Admin'), async (req, res) => {
  if (!(await ownsBranch(req, req.body.branch))) {
    return res.status(404).json({ message: 'Branch not found' });
  }
  const department = await Department.create({ ...req.body, organization: req.orgId });
  res.status(201).json({ department });
});

router.patch('/:id', authorize('Admin'), async (req, res) => {
  const department = await Department.findById(req.params.id);
  if (!assertSameOrg(req, res, department)) return;
  const { organization, branch, ...safe } = req.body; // never re-parent
  Object.assign(department, safe);
  await department.save();
  res.json({ department });
});

router.delete('/:id', authorize('Admin'), async (req, res) => {
  const department = await Department.findById(req.params.id);
  if (!assertSameOrg(req, res, department)) return;
  department.isActive = false; // soft delete — keep historical tokens intact
  await department.save();
  res.json({ message: 'Department archived' });
});

/**
 * Copy departments from one branch to another. Opening a second location
 * usually means running the same queues, so this saves re-entering them by
 * hand. Names already present in the target branch are skipped rather than
 * duplicated, so it's safe to run twice.
 */
router.post('/copy', authorize('Admin'), async (req, res) => {
  const { fromBranch, toBranch, departmentIds } = req.body;
  if (!(await ownsBranch(req, fromBranch)) || !(await ownsBranch(req, toBranch))) {
    return res.status(404).json({ message: 'Branch not found' });
  }
  if (String(fromBranch) === String(toBranch)) {
    return res.status(400).json({ message: 'Source and target branch must be different' });
  }

  const filter = scoped(req, { branch: fromBranch, isActive: true });
  if (Array.isArray(departmentIds) && departmentIds.length) filter._id = { $in: departmentIds };
  const source = await Department.find(filter);

  const existing = await Department.find(scoped(req, { branch: toBranch, isActive: true })).select('name');
  const taken = new Set(existing.map((d) => d.name.toLowerCase()));

  const toCreate = source
    .filter((d) => !taken.has(d.name.toLowerCase()))
    .map((d) => ({
      organization: req.orgId,
      branch: toBranch,
      name: d.name,
      tokenPrefix: d.tokenPrefix,
      queueType: d.queueType,
      priorityWeight: d.priorityWeight,
      slaSeconds: d.slaSeconds,
      avgServiceTimeSeconds: d.avgServiceTimeSeconds,
    }));

  const created = toCreate.length ? await Department.insertMany(toCreate) : [];
  res.status(201).json({
    copied: created.length,
    skipped: source.length - created.length,
    departments: created,
  });
});

module.exports = router;
