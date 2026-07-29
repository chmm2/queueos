const axios = require('axios');
const Token = require('../models/Token');
const Service = require('../models/Service');
const Counter = require('../models/Counter');
const { withScheme } = require('../config/urls');

const ML_BASE = withScheme(process.env.ML_SERVICE_URL || 'http://localhost:6000/predict').replace(/\/predict$/, '');
const REQUEST_TIMEOUT_MS = Number(process.env.ML_TIMEOUT_MS) || 1500;

/**
 * ETA prediction. Two sources, and we are always honest about which one:
 *
 *   - 'model'      the organization's OWN self-trained model is live (it has
 *                  learned from enough real visits and proven accurate). The
 *                  ML service returns a number only in this case.
 *   - 'heuristic'  cold start / still learning. A transparent formula using
 *                  the org's own current state (position, open counters, and
 *                  the service time measured from their real completions).
 *                  No synthetic data — just arithmetic on their numbers.
 *
 * The ML call is non-blocking I/O with a short timeout, so a slow model can
 * never stall the event loop or freeze real-time queue updates.
 */
async function predictEta({ organization, queuePosition, isPriority, avgServiceSeconds, openCounters, at = new Date() }) {
  const hourOfDay = at.getUTCHours();
  const dayOfWeek = at.getUTCDay();
  const feats = {
    orgId: organization ? organization.toString() : undefined,
    queuePosition,
    hourOfDay,
    dayOfWeek,
    isPriority: !!isPriority,
    avgServiceSeconds: Math.max(1, Math.round(avgServiceSeconds || 300)),
    openCounters: Math.max(1, openCounters || 1),
  };

  try {
    const { data } = await axios.post(`${ML_BASE}/predict`, feats, { timeout: REQUEST_TIMEOUT_MS });
    if (data.trained && data.etaSeconds != null) {
      return { etaSeconds: Math.max(0, Math.round(data.etaSeconds)), source: 'model' };
    }
  } catch {
    /* fall through to heuristic */
  }
  return { etaSeconds: heuristic(feats), source: 'heuristic' };
}

// Transparent cold-start formula: work ahead of you, shared across open
// counters, halved for priority. Uses the org's own configured/measured times.
function heuristic({ queuePosition, avgServiceSeconds, openCounters, isPriority }) {
  const perToken = avgServiceSeconds || 300;
  const parallel = Math.max(1, openCounters || 1);
  const base = (perToken * Math.max(0, queuePosition - 1)) / parallel;
  return Math.max(0, Math.round(isPriority ? base * 0.5 : base));
}

async function openCounterCount(branchId) {
  const n = await Counter.countDocuments({ branch: branchId, status: 'open' });
  return Math.max(1, n);
}

/**
 * Recompute and persist ETAs for a service's waiting queue. Called after any
 * transition so displayed waits stay fresh.
 */
async function recalcServiceEtas(branchId, serviceId) {
  const [service, openCounters] = await Promise.all([
    Service.findById(serviceId).select('avgServiceTimeSeconds organization'),
    openCounterCount(branchId),
  ]);
  if (!service) return [];
  const avgServiceSeconds = service.avgServiceTimeSeconds || 300;

  const waiting = await Token.find({ branch: branchId, service: serviceId, status: 'waiting' })
    .sort({ isPriority: -1, issuedAt: 1 });

  await Promise.all(
    waiting.map(async (token, index) => {
      const { etaSeconds, source } = await predictEta({
        organization: service.organization,
        queuePosition: index + 1,
        isPriority: token.isPriority,
        avgServiceSeconds,
        openCounters,
      });
      token.predictedEtaSeconds = etaSeconds;
      token.etaSource = source;
      return token.save();
    })
  );
  return waiting;
}

async function recalcBranchEtas(branchId) {
  const serviceIds = await Token.distinct('service', { branch: branchId, status: 'waiting' });
  await Promise.all(serviceIds.filter(Boolean).map((sid) => recalcServiceEtas(branchId, sid)));
}

/**
 * Self-calibrate a service's average service time from REAL completed visits
 * (measured `completedAt - startedAt`). This keeps even the heuristic honest —
 * it drifts toward the org's true pace instead of a configured guess.
 */
async function recalibrateServiceAvg(serviceId) {
  const recent = await Token.find({ service: serviceId, status: 'completed', startedAt: { $ne: null }, completedAt: { $ne: null } })
    .sort({ completedAt: -1 })
    .limit(100)
    .select('startedAt completedAt');
  if (recent.length < 5) return; // wait for a little real signal first

  const durations = recent.map((t) => (t.completedAt - t.startedAt) / 1000).filter((d) => d > 0 && d < 24 * 3600);
  if (!durations.length) return;
  const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
  await Service.findByIdAndUpdate(serviceId, { avgServiceTimeSeconds: avg });
}

module.exports = { predictEta, heuristic, recalcServiceEtas, recalcBranchEtas, openCounterCount, recalibrateServiceAvg };
