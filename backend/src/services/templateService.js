const Branch = require('../models/Branch');
const Service = require('../models/Service');
const Counter = require('../models/Counter');
const Zone = require('../models/Zone');

/**
 * Industry templates. This is the concrete proof of the platform's core
 * promise: every vertical is CONFIGURATION, not a code fork. Picking an
 * industry at signup seeds a working branch + services + counters so the
 * org can issue its first token immediately.
 *
 * Each service defines its own token prefix, queue type, priority and
 * average service time — exactly the knobs an ops manager would otherwise
 * need custom software to get.
 */
const TEMPLATES = {
  hospital: {
    branch: 'Main Hospital',
    services: [
      { name: 'Registration', tokenPrefix: 'R', avgServiceTimeSeconds: 180 },
      { name: 'Consultation', tokenPrefix: 'C', avgServiceTimeSeconds: 600 },
      { name: 'Lab', tokenPrefix: 'L', avgServiceTimeSeconds: 300 },
      { name: 'Pharmacy', tokenPrefix: 'P', avgServiceTimeSeconds: 240 },
      { name: 'Billing', tokenPrefix: 'B', avgServiceTimeSeconds: 200 },
      { name: 'Emergency', tokenPrefix: 'E', queueType: 'emergency', priorityWeight: 100, avgServiceTimeSeconds: 300 },
    ],
    counters: 3,
  },
  bank: {
    branch: 'Main Branch',
    services: [
      { name: 'Cash Deposit', tokenPrefix: 'D', avgServiceTimeSeconds: 240 },
      { name: 'Loan Desk', tokenPrefix: 'L', avgServiceTimeSeconds: 900 },
      { name: 'Customer Support', tokenPrefix: 'S', avgServiceTimeSeconds: 360 },
      { name: 'Priority Banking', tokenPrefix: 'V', queueType: 'vip', priorityWeight: 50, avgServiceTimeSeconds: 300 },
    ],
    counters: 3,
  },
  restaurant: {
    branch: 'Main Outlet',
    services: [
      { name: 'Order Counter', tokenPrefix: 'O', avgServiceTimeSeconds: 120 },
      { name: 'Pickup Counter', tokenPrefix: 'K', avgServiceTimeSeconds: 60 },
    ],
    counters: 2,
  },
  government: {
    branch: 'Main Office',
    services: [
      { name: 'Passport', tokenPrefix: 'P', avgServiceTimeSeconds: 600, slaSeconds: 1800 },
      { name: 'License', tokenPrefix: 'L', avgServiceTimeSeconds: 480, slaSeconds: 1800 },
      { name: 'Documentation', tokenPrefix: 'D', avgServiceTimeSeconds: 420, slaSeconds: 1800 },
    ],
    counters: 4,
  },
  pharmacy: {
    branch: 'Main Store',
    services: [
      { name: 'Prescription', tokenPrefix: 'R', avgServiceTimeSeconds: 240 },
      { name: 'General', tokenPrefix: 'G', avgServiceTimeSeconds: 120 },
    ],
    counters: 2,
  },
  salon: {
    branch: 'Main Salon',
    services: [
      { name: 'Haircut', tokenPrefix: 'H', avgServiceTimeSeconds: 1800 },
      { name: 'Spa', tokenPrefix: 'S', avgServiceTimeSeconds: 2700 },
      { name: 'Appointment', tokenPrefix: 'A', queueType: 'appointment', priorityWeight: 20, avgServiceTimeSeconds: 1800 },
    ],
    counters: 2,
  },
};

// Anything without a specific template gets a single generic service.
const DEFAULT_TEMPLATE = {
  branch: 'Main Branch',
  services: [{ name: 'General', tokenPrefix: 'A', avgServiceTimeSeconds: 300 }],
  counters: 2,
};

/**
 * Seeds a branch + its services + counters for an org. Runs inside the
 * signup transaction when a session is passed.
 */
async function applyTemplate(orgId, industry, session = null) {
  const tpl = TEMPLATES[industry] || DEFAULT_TEMPLATE;
  const opts = session ? { session } : {};

  const [branch] = await Branch.create(
    [{ organization: orgId, name: tpl.branch, timezone: 'UTC' }],
    opts
  );

  const services = await Service.create(
    tpl.services.map((s) => ({
      organization: orgId,
      branch: branch._id,
      queueType: 'walk-in',
      priorityWeight: 0,
      slaSeconds: 0,
      ...s,
    })),
    opts
  );

  const serviceIds = services.map((s) => s._id);
  const counters = [];
  for (let i = 1; i <= tpl.counters; i += 1) {
    counters.push({
      organization: orgId,
      branch: branch._id,
      name: `Counter ${i}`,
      services: serviceIds, // every counter can serve everything by default
      status: 'closed',
    });
  }
  await Counter.create(counters, opts);

  // Seed one zone (physical area) per service by default — each gets its own
  // screen + QR out of the box. Admins can merge/rename them into grouped
  // areas later (e.g. Lab + X-Ray → "Diagnostics").
  await Zone.create(
    services.map((s) => ({ organization: orgId, branch: branch._id, name: s.name, services: [s._id] })),
    opts
  );

  return { branch, services };
}

module.exports = { applyTemplate, TEMPLATES };
