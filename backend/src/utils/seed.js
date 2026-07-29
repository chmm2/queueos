require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Organization = require('../models/Organization');
const User = require('../models/User');
const Branch = require('../models/Branch');
const Service = require('../models/Service');
const Counter = require('../models/Counter');
const Token = require('../models/Token');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const TokenSequence = require('../models/TokenSequence');
const { applyTemplate } = require('../services/templateService');
const { terminologyFor } = require('../config/terminology');

/**
 * Seeds a demo organization (a clinic) with the hospital template plus one
 * user per role, so you can log in and see the whole platform working.
 */
async function seed() {
  await connectDB();

  // Reconcile indexes with the current schema (drops stale ones, e.g. the old
  // per-org email index after the move to globally-unique emails).
  await User.syncIndexes();

  await Promise.all([
    Organization.deleteMany({}),
    User.deleteMany({}),
    Branch.deleteMany({}),
    Service.deleteMany({}),
    Counter.deleteMany({}),
    Token.deleteMany({}),
    AuditLog.deleteMany({}),
    Notification.deleteMany({}),
    TokenSequence.deleteMany({}),
  ]);

  const org = await Organization.create({
    name: 'Demo City Clinic',
    slug: 'demo-city-clinic',
    industry: 'hospital',
    terminology: terminologyFor('hospital'), // Rooms, Departments, Patients
    settings: { requireOtp: false, requireGeofence: false, qrRotationSeconds: 45 },
  });

  // Seed the industry template (branch + services + counters).
  const { branch } = await applyTemplate(org._id, 'hospital');

  const admin = await User.create({
    organization: org._id,
    name: 'Admin User',
    email: 'admin@queue.com',
    password: 'password123',
    role: 'Admin',
  });
  const operator = await User.create({
    organization: org._id,
    name: 'Operator User',
    email: 'operator@queue.com',
    password: 'password123',
    role: 'Operator',
    branch: branch._id,
  });
  const staff = await User.create({
    organization: org._id,
    name: 'Staff User',
    email: 'staff@queue.com',
    password: 'password123',
    role: 'Staff',
    branch: branch._id,
  });

  // Open the first counter with the staff member so "call next" works out of the box.
  const firstCounter = await Counter.findOne({ branch: branch._id });
  firstCounter.assignedStaff = staff._id;
  firstCounter.status = 'open';
  await firstCounter.save();

  console.log('\nSeed complete — Demo City Clinic (hospital template)\n');
  console.log('  Admin:    admin@queue.com    / password123');
  console.log('  Operator: operator@queue.com / password123');
  console.log('  Staff:    staff@queue.com    / password123');
  console.log(`\n  Org slug:  ${org.slug}`);
  console.log(`  Branch ID: ${branch._id}`);
  console.log(`\n  Public join page:    /join/${org.slug}/${branch._id}`);
  console.log(`  Public display board: /board/${branch._id}\n`);

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
