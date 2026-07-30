const Token = require('../models/Token');
const AuditLog = require('../models/AuditLog');

/**
 * Valid transitions for a token's lifecycle:
 *
 *   waiting --> serving --> completed
 *      |           |
 *      |           +--> held --> serving   (staff parks the customer, recalls later)
 *      |           |
 *      |           +--> skipped --> serving | missed
 *      |
 *      +--> cancelled                        (customer/staff cancels while waiting)
 *      +--> missed                           (no-show after recall window expires)
 *
 * Anything not listed here is rejected. This keeps the queue's data
 * consistent — a token can never jump straight from "waiting" to
 * "completed", for example.
 */
const TRANSITIONS = {
  waiting: ['serving', 'cancelled', 'missed'],
  // A no-show sends them straight back to `waiting` (further down the line) or
  // to `missed` once they've used up their chances — no manual recall needed.
  serving: ['held', 'skipped', 'completed', 'waiting', 'missed'],
  held: ['serving', 'waiting', 'missed'],
  skipped: ['serving', 'waiting', 'missed'],
  completed: [],
  missed: [],
  cancelled: [],
};

class InvalidTransitionError extends Error {
  constructor(from, to) {
    super(`Cannot transition token from '${from}' to '${to}'`);
    this.name = 'InvalidTransitionError';
    this.statusCode = 409;
  }
}

function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

/**
 * Applies a validated transition, stamps the relevant timestamp, and
 * writes an audit log entry. Returns the updated token.
 */
async function transition(tokenId, toStatus, actorUserId = null, metadata = {}) {
  const token = await Token.findById(tokenId);
  if (!token) {
    const err = new Error('Token not found');
    err.statusCode = 404;
    throw err;
  }

  const fromStatus = token.status;
  if (!canTransition(fromStatus, toStatus)) {
    throw new InvalidTransitionError(fromStatus, toStatus);
  }

  const now = new Date();
  // Grace window (seconds) before a held/skipped no-show is auto-missed.
  const recallWindow = Number(process.env.RECALL_WINDOW_SECONDS) || 300;

  switch (toStatus) {
    case 'serving':
      token.calledAt = token.calledAt || now;
      token.startedAt = now;
      token.recallDeadline = null;
      break;
    case 'completed':
      token.completedAt = now;
      token.recallDeadline = null;
      break;
    case 'held':
      token.recallDeadline = new Date(now.getTime() + recallWindow * 1000);
      break;
    case 'skipped':
      token.recallCount += 1;
      token.recallDeadline = new Date(now.getTime() + recallWindow * 1000);
      break;
    case 'waiting':
      // Back in line (e.g. after a no-show) — no longer at any counter.
      token.counter = null;
      token.calledAt = null;
      token.startedAt = null;
      token.recallDeadline = null;
      break;
    case 'missed':
      token.recallDeadline = null;
      break;
    default:
      break;
  }

  token.status = toStatus;
  await token.save();

  await AuditLog.create({
    organization: token.organization,
    token: token._id,
    branch: token.branch,
    actor: actorUserId,
    action: `TOKEN_${toStatus.toUpperCase()}`,
    fromStatus,
    toStatus,
    metadata,
  });

  return token;
}

module.exports = { transition, canTransition, TRANSITIONS, InvalidTransitionError };
