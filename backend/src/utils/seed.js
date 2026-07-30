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
 * departments, rooms and counters — plus one Admin and one Staff account.
 */
async function seed() {
  await connectDB();

  // Reconcile indexes with the current schemas. This matters after a model
  // change: an index from a previous shape (e.g. the old
  // organization+branch+service+date unique key on token sequences) would
  // otherwise linger and reject the new documents.
  await Promise.all(
    [Organization, User, Branch, Department, Room, Counter, Token, TokenSequence, AuditLog, Notification, ModelState]
      .map((M) => M.syncIndexes())
  );

  await Promise.all([
    Organization.deleteMany({}), User.deleteMany({}), Branch.deleteMany({}),
    Department.deleteMany({}), Room.deleteMany({}), Counter.deleteMany({}),
    Token.deleteMany({}), AuditLog.deleteMany({}), Notification.deleteMany({}),
    TokenSequence.deleteMany({}), ModelState.deleteMany({}),
  ]);

  const orgName = 'Demo City Clinic';
  const org = await Organization.create({
    name: orgName,
    slug: 'demo-city-clinic',
    industry: 'hospital',
    terminology: terminologyFor('hospital'), // Patients
    settings: { requireOtp: false, requireGeofence: false, qrRotationSeconds: 45 },
  });

  const { branch, rooms } = await applyTemplate(org._id, 'hospital', orgName);

  const admin = await User.create({
    organization: org._id,
    name: 'Admin User',
    email: 'admin@queue.com',
    password: 'password123',
    role: 'Admin',
  });

  const staff = await User.create({
    organization: org._id,
    name: 'Staff User',
    email: 'staff@queue.com',
    password: 'password123',
    role: 'Staff',
    branch: branch._id,
  });

  // Open the first counter of the Registration room with the staff member, so
  // "call next" works out of the box.
  const registration = rooms.find((r) => r.name === 'Registration') || rooms[0];
  const firstCounter = await Counter.findOne({ room: registration._id });
  if (firstCounter) {
    firstCounter.assignedStaff = staff._id;
    firstCounter.status = 'open';
    await firstCounter.save();
    staff.counter = firstCounter._id;
    await staff.save();
  }

  console.log(`\nSeed complete — ${orgName} (hospital template)\n`);
  console.log('  Admin: admin@queue.com / password123');
  console.log('  Staff: staff@queue.com / password123');
  console.log(`\n  Branch: ${branch.name} (${branch._id})`);
  console.log(`  Rooms:  ${rooms.map((r) => r.name).join(', ')}`);
  if (firstCounter) console.log(`  Open counter: ${firstCounter.code} in ${registration.name}`);
  console.log(`\n  Room QR page:  /join/${org.slug}/${branch._id}?room=${registration._id}`);
  console.log(`  Room display:  /board/${branch._id}?room=${registration._id}\n`);

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
