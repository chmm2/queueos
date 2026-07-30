/**
 * DEMO / TEST UTILITY — not part of the product runtime.
 *
 * Generates a batch of *historical completed visits* for the demo org so the
 * self-learning ETA pipeline can be exercised end-to-end (train → evaluate →
 * activate) without waiting for a real clinic to run for a week. Each visit
 * has a realistic, learnable wait pattern plus noise — exactly the shape of
 * data the product collects from genuine usage.
 *
 *   docker compose exec backend node src/utils/simulateHistory.js [count]
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Organization = require('../models/Organization');
const Branch = require('../models/Branch');
const Department = require('../models/Department');
const Token = require('../models/Token');

function rand(min, max) { return min + Math.random() * (max - min); }
function randint(min, max) { return Math.floor(rand(min, max + 1)); }

async function run() {
  await connectDB();
  const count = Number(process.argv[2]) || 260;

  const org = await Organization.findOne({ slug: 'demo-city-clinic' });
  if (!org) throw new Error('Run `npm run seed` first.');
  const branch = await Branch.findOne({ organization: org._id });
  const department = await Department.findOne({ organization: org._id, branch: branch._id });

  const docs = [];
  let seq = 900;
  for (let i = 0; i < count; i += 1) {
    const queuePosition = randint(1, 16);
    const openCounters = randint(1, 3);
    const avgServiceSeconds = department.avgServiceTimeSeconds || 300;
    const hour = randint(8, 18);
    const day = randint(0, 6);

    // The "true" (unknown to the model) relationship it must learn.
    const peak = hour >= 11 && hour <= 13 ? 1.35 : hour >= 16 ? 1.25 : 1.0;
    const isPriority = Math.random() < 0.12;
    const base = ((queuePosition - 1) * avgServiceSeconds) / openCounters;
    let actualWait = base * peak * (isPriority ? 0.5 : 1) + rand(-25, 25);
    actualWait = Math.max(0, actualWait);
    const serviceDur = avgServiceSeconds + rand(-40, 40);

    const issuedAt = new Date();
    issuedAt.setUTCHours(hour, randint(0, 59), 0, 0);
    issuedAt.setUTCDate(issuedAt.getUTCDate() - randint(0, 6));
    const startedAt = new Date(issuedAt.getTime() + actualWait * 1000);
    const completedAt = new Date(startedAt.getTime() + serviceDur * 1000);

    docs.push({
      organization: org._id,
      branch: branch._id,
      department: department._id,
      tokenNumber: `H-${seq++}`,
      source: 'walk-in',
      isPriority,
      status: 'completed',
      issuedAt, startedAt, completedAt,
      etaFeatures: { queuePosition, avgServiceSeconds, openCounters },
    });
  }

  await Token.insertMany(docs);
  console.log(`Inserted ${docs.length} historical completed visits for "${org.name}".`);
  console.log('Now trigger training:  POST /api/analytics/model/train  (or wait for the scheduler).');
  await mongoose.disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
