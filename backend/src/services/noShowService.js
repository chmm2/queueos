const Token = require('../models/Token');
const Counter = require('../models/Counter');
const AuditLog = require('../models/AuditLog');

/**
 * No-show handling.
 *
 * Being called and not answering shouldn't cost someone their whole visit, but
 * it can't be free either or the queue stops meaning anything. So each no-show
 * puts them back in line a bit further down — forgiving the first time, harsher
 * the second — and after `maxNoShows` the token is spent and they need a new
 * one.
 *
 * The position is applied by moving the token's `orderKey` to sit between two
 * existing tokens, so nobody else's record has to be rewritten.
 */

const DEFAULT_PENALTY_POSITIONS = [2, 4];
const DEFAULT_MAX_NO_SHOWS = 3;

function policyFor(org) {
  const p = org?.settings?.noShow || {};
  const positions = Array.isArray(p.penaltyPositions) && p.penaltyPositions.length
    ? p.penaltyPositions
    : DEFAULT_PENALTY_POSITIONS;
  const maxNoShows = p.maxNoShows || DEFAULT_MAX_NO_SHOWS;
  return { positions, maxNoShows };
}

// The peers a token competes with for position: same queue, same priority
// band, still waiting.
function peerFilter(token) {
  return {
    branch: token.branch,
    department: token.department,
    status: 'waiting',
    isPriority: token.isPriority, // never leapfrog a different priority band
    _id: { $ne: token._id },
  };
}

/**
 * Spread a queue's order keys a second apart, preserving current order. Only
 * needed in the rare case where two neighbours are too close together to fit
 * a new token between them.
 */
async function respace(token) {
  const peers = await Token.find(peerFilter(token)).sort({ orderKey: 1 }).select('_id');
  const base = Date.now();
  await Promise.all(
    peers.map((p, i) => Token.updateOne({ _id: p._id }, { orderKey: new Date(base + i * 1000) }))
  );
  return Token.find(peerFilter(token)).sort({ orderKey: 1 }).select('orderKey');
}

/**
 * An `orderKey` that will place `token` at 1-based `position` among its peers.
 * Returns a key just past the end if the queue is shorter than that position.
 */
async function orderKeyForPosition(token, position) {
  let peers = await Token.find(peerFilter(token)).sort({ orderKey: 1 }).select('orderKey');
  if (peers.length === 0) return new Date();

  // position 1 -> slot 0 (in front of everyone), position 2 -> slot 1, ...
  let slot = Math.min(Math.max(position - 1, 0), peers.length);
  if (slot >= peers.length) {
    return new Date(peers[peers.length - 1].orderKey.getTime() + 1000); // past the end
  }

  const gapAt = (list, i) => {
    const before = i === 0
      ? new Date(list[0].orderKey.getTime() - 1000)
      : list[i - 1].orderKey;
    return { before, after: list[i].orderKey };
  };

  let { before, after } = gapAt(peers, slot);
  if (after.getTime() - before.getTime() <= 1) {
    // Too tight to slot into — spread the queue out and try once more.
    peers = await respace(token);
    slot = Math.min(Math.max(position - 1, 0), peers.length);
    if (slot >= peers.length) {
      return new Date(peers[peers.length - 1].orderKey.getTime() + 1000);
    }
    ({ before, after } = gapAt(peers, slot));
  }

  return new Date(before.getTime() + Math.floor((after.getTime() - before.getTime()) / 2));
}

/**
 * Record a no-show for a token currently being served.
 *
 * Returns { outcome: 'requeued', position, noShowCount, remaining }
 *      or { outcome: 'removed', noShowCount }
 */
async function recordNoShow({ token, organization, actorId }) {
  const { positions, maxNoShows } = policyFor(organization);
  const nextCount = (token.noShowCount || 0) + 1;
  const fromStatus = token.status;

  // Free up the counter either way.
  if (token.counter) {
    await Counter.findByIdAndUpdate(token.counter, { currentToken: null });
  }

  // Out of chances — the token is spent.
  if (nextCount >= maxNoShows) {
    token.noShowCount = nextCount;
    token.status = 'missed';
    token.counter = null;
    token.calledAt = null;
    token.startedAt = null;
    token.recallDeadline = null;
    await token.save();

    await AuditLog.create({
      organization: token.organization,
      token: token._id,
      branch: token.branch,
      actor: actorId,
      action: 'TOKEN_NO_SHOW_REMOVED',
      fromStatus,
      toStatus: 'missed',
      metadata: { noShowCount: nextCount, maxNoShows },
    });

    return { outcome: 'removed', noShowCount: nextCount };
  }

  // Back in line, further down.
  const targetPosition = positions[nextCount - 1] ?? positions[positions.length - 1];
  const orderKey = await orderKeyForPosition(token, targetPosition);

  token.noShowCount = nextCount;
  token.status = 'waiting';
  token.counter = null;
  token.calledAt = null;
  token.startedAt = null;
  token.recallDeadline = null;
  token.orderKey = orderKey;
  await token.save();

  // Where they actually ended up (the queue may be shorter than the penalty).
  // Someone is ahead if they're in a higher priority band, or in the same band
  // with an earlier order key — mirroring the { isPriority: -1, orderKey: 1 }
  // sort the queue is read with.
  const ahead = await Token.countDocuments({
    branch: token.branch,
    department: token.department,
    status: 'waiting',
    _id: { $ne: token._id },
    $or: [
      ...(token.isPriority ? [] : [{ isPriority: true }]),
      { isPriority: token.isPriority, orderKey: { $lt: orderKey } },
    ],
  });
  const position = ahead + 1;

  await AuditLog.create({
    organization: token.organization,
    token: token._id,
    branch: token.branch,
    actor: actorId,
    action: 'TOKEN_NO_SHOW_REQUEUED',
    fromStatus,
    toStatus: 'waiting',
    metadata: { noShowCount: nextCount, targetPosition, position, maxNoShows },
  });

  return {
    outcome: 'requeued',
    position,
    noShowCount: nextCount,
    remaining: maxNoShows - nextCount,
  };
}

module.exports = { recordNoShow, orderKeyForPosition, policyFor };
