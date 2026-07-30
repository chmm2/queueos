require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Organization = require('../models/Organization');
const User = require('../models/User');
const Branch = require('../models/Branch');
const Department = require('../models/Department');
const Room = require('../models/Room');
const Counter = require('../models/Counter');
const Token = require('../models/Token');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const TokenSequence = require('../models/TokenSequence');
const ModelState = require('../models/ModelState');
const { applyTemplate } = require('../services/templateService');
const { terminologyFor } = require('../config/terminology');

/**
 * Seeds a demo organization (a clinic) with the hospital template — branch,
 * departments, rooms and counters — plus one administrator.
 *
 * There are no staff accounts: each counter IS a login, so the seed prints the
 * generated counter credentials the way the console shows them to an admin.
 */
async function seed() {
  await connectDB();

  const MODELS = [
    Organization, User, Branch, Department, Room, Counter,
    Token, TokenSequence, AuditLog, Notification, ModelState,
  ];

  // Clear data BEFORE touching indexes. Documents written under an older
  // schema (e.g. counters from before they had login emails) would otherwise
  // violate a newly-added unique index and abort the build.
  await Promise.all(MODELS.map((M) => M.deleteMany({})));

  // Now reconcile indexes with the current schemas, dropping any left over
  // from a previous shape.
  await Promise.all(MODELS.map((M) => M.syncIndexes()));

  const orgName = 'Demo City Clinic';
  const slug = 'demo-city-clinic';
  const org = await Organization.create({
    name: orgName,
    slug,
    industry: 'hospital',
    terminology: terminologyFor('hospital'), // Patients
    settings: { requireOtp: false, requireGeofence: false, qrRotationSeconds: 45 },
  });

  const { branch, rooms, credentials } = await applyTemplate(org._id, 'hospital', orgName, slug);

  await User.create({
    organization: org._id,
    name: 'Admin User',
    email: 'admin@queue.com',
    password: 'password123',
    role: 'Admin',
  });

  // Open the first Registration counter so the queue is workable immediately.
  const registration = rooms.find((r) => r.name === 'Registration') || rooms[0];
  const firstCounter = await Counter.findOne({ room: registration._id }).sort({ code: 1 });
  if (firstCounter) {
    firstCounter.status = 'open';
    await firstCounter.save();
  }

  console.log(`\nSeed complete — ${orgName} (hospital template)\n`);
  console.log('  ADMIN (configures the organization)');
  console.log('    admin@queue.com / password123\n');
  console.log('  COUNTER LOGINS (each desk signs in as itself)');
  credentials.slice(0, 4).forEach((c) => {
    const open = firstCounter && c.code === firstCounter.code ? '  <- open' : '';
    console.log(`    ${c.code.padEnd(16)} ${c.email.padEnd(42)} ${c.password}${open}`);
  });
  if (credentials.length > 4) console.log(`    …and ${credentials.length - 4} more counters`);
  console.log(`\n  Branch: ${branch.name}`);
  console.log(`  Rooms:  ${rooms.map((r) => r.name).join(', ')}`);
  console.log(`\n  Room QR page:  /join/${slug}/${branch._id}?room=${registration._id}`);
  console.log(`  Room display:  /board/${branch._id}?room=${registration._id}\n`);

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
