const jwt = require('jsonwebtoken');

/**
 * Centralized JWT minting/verification for every token kind:
 *   - access  : short-lived, sent on every API call
 *   - refresh : long-lived, exchanged for a new access token
 *   - qr      : short-lived room-join token embedded in the rotating QR
 *   - session : per-customer token so an accountless customer can track/cancel
 *
 * There are two kinds of PRINCIPAL, distinguished by `pt` (principal type):
 *   'user'    an administrator signing in as themselves
 *   'counter' a machine at a desk signing in as the counter itself
 */
const ACCESS_TTL = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_TTL = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

function signAccess(user) {
  return jwt.sign(
    {
      pt: 'user',
      id: user._id,
      role: user.role,
      organization: user.organization,
      tv: user.tokenVersion,
    },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

function signRefresh(user) {
  return jwt.sign(
    { pt: 'user', id: user._id, tv: user.tokenVersion, typ: 'refresh' },
    process.env.JWT_SECRET,
    { expiresIn: REFRESH_TTL }
  );
}

// A counter signs in as itself — the token carries where it physically is.
function signCounterAccess(counter) {
  return jwt.sign(
    {
      pt: 'counter',
      id: counter._id,
      role: 'Counter',
      organization: counter.organization,
      branch: counter.branch,
      room: counter.room,
      tv: counter.tokenVersion,
    },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

function signCounterRefresh(counter) {
  return jwt.sign(
    { pt: 'counter', id: counter._id, tv: counter.tokenVersion, typ: 'refresh' },
    process.env.JWT_SECRET,
    { expiresIn: REFRESH_TTL }
  );
}

// Short-lived token baked into a room's rotating QR. Validating it on join
// proves the code was scanned while fresh (anti screenshot-reuse).
function signQrToken(branchId, orgId, ttlSeconds) {
  return jwt.sign(
    { branch: branchId.toString(), org: orgId.toString(), typ: 'qr' },
    process.env.JWT_SECRET,
    { expiresIn: ttlSeconds }
  );
}

// Per-token customer session — lets an accountless customer track and cancel
// only their own token.
function signSession(tokenId, sessionId) {
  return jwt.sign(
    { token: tokenId.toString(), sid: sessionId, typ: 'session' },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );
}

function verify(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = {
  signAccess,
  signRefresh,
  signCounterAccess,
  signCounterRefresh,
  signQrToken,
  signSession,
  verify,
};
