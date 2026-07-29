const axios = require('axios');
const Token = require('../models/Token');
const ModelState = require('../models/ModelState');

const ML_BASE = (process.env.ML_SERVICE_URL || 'http://localhost:6000/predict').replace(/\/predict$/, '');
const TRAIN_TIMEOUT_MS = Number(process.env.ML_TRAIN_TIMEOUT_MS) || 30000;

/**
 * The self-learning pipeline. For one organization, it gathers that org's OWN
 * completed visits, turns each into a labeled training example (the features
 * snapshotted at issue time + the measured actual wait), and asks the ML
 * service to (re)train. The ML service only activates a model once it's
 * accurate on held-out data — so ETA "comes to life" on its own.
 *
 * No synthetic data ever enters this pipeline: if an org has no real history,
 * nothing trains and the heuristic keeps serving.
 */
function buildSample(t) {
  const f = t.etaFeatures || {};
  if (f.queuePosition == null || f.avgServiceSeconds == null || f.openCounters == null) return null;
  if (!t.issuedAt || !t.startedAt) return null;
  const actualWaitSeconds = (t.startedAt - t.issuedAt) / 1000;
  if (actualWaitSeconds < 0 || actualWaitSeconds > 24 * 3600) return null; // guard bad rows
  const at = new Date(t.issuedAt);
  return {
    queuePosition: f.queuePosition,
    hourOfDay: at.getUTCHours(),
    dayOfWeek: at.getUTCDay(),
    isPriority: !!t.isPriority,
    avgServiceSeconds: f.avgServiceSeconds,
    openCounters: f.openCounters,
    actualWaitSeconds,
  };
}

async function trainOrg(orgId) {
  const completed = await Token.find({
    organization: orgId,
    status: 'completed',
    'etaFeatures.queuePosition': { $ne: null },
    startedAt: { $ne: null },
  })
    .sort({ completedAt: -1 })
    .limit(5000)
    .select('etaFeatures issuedAt startedAt isPriority');

  const samples = completed.map(buildSample).filter(Boolean);

  const { data } = await axios.post(`${ML_BASE}/train`, { orgId: orgId.toString(), samples }, { timeout: TRAIN_TIMEOUT_MS });

  await ModelState.findOneAndUpdate(
    { organization: orgId },
    {
      organization: orgId,
      status: data.active ? 'active' : 'collecting',
      sampleCount: data.sampleCount,
      trainedAtCount: samples.length,
      maeSeconds: data.maeSeconds ?? null,
      accuracy: data.accuracy ?? null,
      reason: data.reason,
      lastTrainedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return data;
}

/**
 * Sweep every org and retrain those that have accumulated new real visits
 * since their last run. Cheap: one grouped count query, then train only where
 * there's genuinely new data.
 */
async function trainDueOrgs() {
  const counts = await Token.aggregate([
    { $match: { status: 'completed', startedAt: { $ne: null }, 'etaFeatures.queuePosition': { $ne: null } } },
    { $group: { _id: '$organization', n: { $sum: 1 } } },
  ]);

  for (const { _id: orgId, n } of counts) {
    // eslint-disable-next-line no-await-in-loop
    const state = await ModelState.findOne({ organization: orgId }).select('trainedAtCount');
    const last = state?.trainedAtCount || 0;
    // Retrain when at least 20 new completions have landed (or first time).
    if (n - last >= 20 || (last === 0 && n >= 20)) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await trainOrg(orgId);
        console.log(`[training] retrained org ${orgId} on ${n} real visits`);
      } catch (err) {
        console.error(`[training] failed for org ${orgId}:`, err.response?.data || err.message);
      }
    }
  }
}

let timer = null;
function startTrainingScheduler(intervalMs = Number(process.env.TRAIN_INTERVAL_MS) || 5 * 60 * 1000) {
  if (timer) return;
  timer = setInterval(() => trainDueOrgs().catch((e) => console.error('[training] sweep failed:', e.message)), intervalMs);
  console.log(`[training] scheduler started (every ${intervalMs}ms)`);
}
function stopTrainingScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { trainOrg, trainDueOrgs, startTrainingScheduler, stopTrainingScheduler };
