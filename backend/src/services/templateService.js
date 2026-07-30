const Branch = require('../models/Branch');
const Department = require('../models/Department');
const Room = require('../models/Room');
const Counter = require('../models/Counter');
const { buildCounterCode, counterEmail, generatePassword } = require('./codeService');

/**
 * Industry templates — the proof that every vertical is CONFIGURATION, not a
 * code fork. Picking an industry at signup seeds a working branch with its
 * departments (queues), the rooms those departments are served in, and one
 * counter per room, so the org can issue its first token immediately.
 *
 * `rooms` maps a physical space to the departments handled there — this is
 * where "Registration has its own room and its own screen" comes from, and
 * where a shared space (Front Desk doing Registration + Billing) is expressed.
 */
const TEMPLATES = {
  hospital: {
    branch: 'Main Hospital',
    departments: [
      { name: 'Registration', tokenPrefix: 'R', avgServiceTimeSeconds: 180 },
      { name: 'Consultation', tokenPrefix: 'C', avgServiceTimeSeconds: 600 },
      { name: 'Lab', tokenPrefix: 'L', avgServiceTimeSeconds: 300 },
      { name: 'Pharmacy', tokenPrefix: 'P', avgServiceTimeSeconds: 240 },
      { name: 'Billing', tokenPrefix: 'B', avgServiceTimeSeconds: 200 },
      { name: 'Emergency', tokenPrefix: 'E', queueType: 'emergency', priorityWeight: 100, avgServiceTimeSeconds: 300 },
    ],
    rooms: [
      { name: 'Registration', code: 'REG', departments: ['Registration'], counters: 2 },
      { name: 'Consultation Wing', code: 'CON', departments: ['Consultation'], counters: 3 },
      { name: 'Diagnostics', code: 'DIAG', departments: ['Lab'], counters: 1 },
      { name: 'Pharmacy', code: 'PHAR', departments: ['Pharmacy'], counters: 2 },
      { name: 'Billing Desk', code: 'BILL', departments: ['Billing'], counters: 1 },
      { name: 'Emergency', code: 'ER', departments: ['Emergency'], counters: 1 },
    ],
  },
  bank: {
    branch: 'Main Branch',
    departments: [
      { name: 'Cash Deposit', tokenPrefix: 'D', avgServiceTimeSeconds: 240 },
      { name: 'Loan Desk', tokenPrefix: 'L', avgServiceTimeSeconds: 900 },
      { name: 'Customer Support', tokenPrefix: 'S', avgServiceTimeSeconds: 360 },
      { name: 'Priority Banking', tokenPrefix: 'V', queueType: 'vip', priorityWeight: 50, avgServiceTimeSeconds: 300 },
    ],
    rooms: [
      { name: 'Teller Hall', code: 'TELL', departments: ['Cash Deposit', 'Customer Support'], counters: 3 },
      { name: 'Loan Office', code: 'LOAN', departments: ['Loan Desk'], counters: 1 },
      { name: 'Priority Lounge', code: 'VIP', departments: ['Priority Banking'], counters: 1 },
    ],
  },
  restaurant: {
    branch: 'Main Outlet',
    departments: [
      { name: 'Order Counter', tokenPrefix: 'O', avgServiceTimeSeconds: 120 },
      { name: 'Pickup Counter', tokenPrefix: 'K', avgServiceTimeSeconds: 60 },
    ],
    rooms: [
      { name: 'Ordering', code: 'ORD', departments: ['Order Counter'], counters: 2 },
      { name: 'Pickup', code: 'PICK', departments: ['Pickup Counter'], counters: 1 },
    ],
  },
  government: {
    branch: 'Main Office',
    departments: [
      { name: 'Passport', tokenPrefix: 'P', avgServiceTimeSeconds: 600, slaSeconds: 1800 },
      { name: 'License', tokenPrefix: 'L', avgServiceTimeSeconds: 480, slaSeconds: 1800 },
      { name: 'Documentation', tokenPrefix: 'D', avgServiceTimeSeconds: 420, slaSeconds: 1800 },
    ],
    rooms: [
      { name: 'Passport Hall', code: 'PASS', departments: ['Passport'], counters: 2 },
      { name: 'Licensing', code: 'LIC', departments: ['License'], counters: 2 },
      { name: 'Records', code: 'DOC', departments: ['Documentation'], counters: 1 },
    ],
  },
  pharmacy: {
    branch: 'Main Store',
    departments: [
      { name: 'Prescription', tokenPrefix: 'R', avgServiceTimeSeconds: 240 },
      { name: 'General', tokenPrefix: 'G', avgServiceTimeSeconds: 120 },
    ],
    rooms: [{ name: 'Front Counter', code: 'FRNT', departments: ['Prescription', 'General'], counters: 2 }],
  },
  salon: {
    branch: 'Main Salon',
    departments: [
      { name: 'Haircut', tokenPrefix: 'H', avgServiceTimeSeconds: 1800 },
      { name: 'Spa', tokenPrefix: 'S', avgServiceTimeSeconds: 2700 },
    ],
    rooms: [
      { name: 'Styling Floor', code: 'STY', departments: ['Haircut'], counters: 3 },
      { name: 'Spa Suite', code: 'SPA', departments: ['Spa'], counters: 2 },
    ],
  },
};

// Anything unlisted gets a single generic department in one room.
const DEFAULT_TEMPLATE = {
  branch: 'Main Branch',
  departments: [{ name: 'General', tokenPrefix: 'A', avgServiceTimeSeconds: 300 }],
  rooms: [{ name: 'Front Desk', code: 'FRNT', departments: ['General'], counters: 2 }],
};

/**
 * Seeds a branch + departments + rooms + counters for an org. Each counter is
 * also a login identity, so it gets generated credentials; the plaintext
 * passwords are returned so the caller can surface them once to the admin.
 */
async function applyTemplate(orgId, industry, orgName = 'Org', orgSlug = 'org') {
  const tpl = TEMPLATES[industry] || DEFAULT_TEMPLATE;

  const branch = await Branch.create({ organization: orgId, name: tpl.branch, timezone: 'UTC' });

  const departments = await Department.create(
    tpl.departments.map((d) => ({
      organization: orgId,
      branch: branch._id,
      queueType: 'walk-in',
      priorityWeight: 0,
      slaSeconds: 0,
      ...d,
    }))
  );
  const byName = Object.fromEntries(departments.map((d) => [d.name, d._id]));

  const rooms = [];
  const usedCodes = [];
  const credentials = []; // { code, email, password } — shown once to the admin

  for (const r of tpl.rooms) {
    // eslint-disable-next-line no-await-in-loop
    const room = await Room.create({
      organization: orgId,
      branch: branch._id,
      name: r.name,
      code: r.code,
      departments: r.departments.map((n) => byName[n]).filter(Boolean),
    });
    rooms.push(room);

    for (let i = 1; i <= (r.counters || 1); i += 1) {
      const code = buildCounterCode({
        orgName, branchName: tpl.branch, room, existingCodes: usedCodes,
      });
      usedCodes.push(code);
      const email = counterEmail(code, orgSlug);
      const password = generatePassword();
      credentials.push({ code, email, password });

      // Created one at a time so the password-hashing hook runs per document.
      // eslint-disable-next-line no-await-in-loop
      await Counter.create({
        organization: orgId,
        branch: branch._id,
        room: room._id,
        name: `Counter ${i}`,
        code,
        email,
        password,
        departments: [], // empty = serves everything its room handles
        status: 'closed',
      });
    }
  }

  return { branch, departments, rooms, credentials };
}

module.exports = { applyTemplate, TEMPLATES };
