const Token = require('../models/Token');
const AuditLog = require('../models/AuditLog');
const { emitQueueUpdate } = require('../sockets');

/**
 * Background sweeper that enforces the no-show workflow the manual routes
 * can't: a held/skipped token whose recall window has expired is
 * automatically marked "missed". Without this, "no-show/recall workflows"
 * only ever half-works — a staff member has to remember to mark every
 * absentee. Here it happens on its own.
 *
 * Runs on an interval; each pass is a single indexed query so it's cheap.
 */
let timer = null;

async function sweepExpiredTokens() {
  const now = new Date();
  const expired = await Token.find({
    status: { $in: ['held', 'skipped'] },
    recallDeadline: { $ne: null, $lte: now },
  }).limit(200);

  for (const token of expired) {
    // Give one more recall chance if the token hasn't used them up; otherwise miss it.
    const canRetry = token.recallCount < token.maxRecalls && token.status === 'skipped';
    const fromStatus = token.status;
    if (canRetry) {
      token.status = 'waiting';
      token.recallDeadline = null;
    } else {
      token.status = 'missed';
      token.recallDeadline = null;
    }
    // eslint-disable-next-line no-await-in-loop
    await token.save();
    // eslint-disable-next-line no-await-in-loop
    await AuditLog.create({
      organization: token.organization,
      token: token._id,
      branch: token.branch,
      actor: null, // system action
      action: canRetry ? 'TOKEN_AUTO_REQUEUED' : 'TOKEN_AUTO_MISSED',
      fromStatus,
      toStatus: token.status,
      metadata: { reason: 'recall_window_expired' },
    });
    emitQueueUpdate(token.branch, { type: token.status, tokenId: token._id, auto: true });
  }
  return expired.length;
}

function startAutoMiss(intervalMs = Number(process.env.AUTO_MISS_INTERVAL_MS) || 30000) {
  if (timer) return;
  timer = setInterval(() => {
    sweepExpiredTokens().catch((err) => console.error('[autoMiss] sweep failed:', err.message));
  }, intervalMs);
  console.log(`[autoMiss] sweeper started (every ${intervalMs}ms)`);
}

function stopAutoMiss() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { startAutoMiss, stopAutoMiss, sweepExpiredTokens };
