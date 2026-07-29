const jwt = require('jsonwebtoken');

/**
 * Centralized JWT minting/verification for all token kinds:
 *   - access  : short-lived, sent on every API call (Authorization header)
 *   - refresh : long-lived, exchanged for a new access token
 *   - qr      : short-lived branch-join token embedded in the rotating QR
 *   - session : per-customer token so an accountless customer can track/cancel
 *
 * Keeping every jwt.sign/verify in one place means the payload shape and
 * secret usage stay consistent (and testable).
 */
const ACCESS_TTL = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_TTL = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

function signAccess(user) {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      organization: user.organization,
      branch: user.branch,
      tv: user.tokenVersion,
    },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

function signRefresh(user) {
  return jwt.sign(
    { id: user._id, tv: user.tokenVersion, typ: 'refresh' },
    process.env.JWT_SECRET,
    { expiresIn: REFRESH_TTL }
  );
}

// Short-lived token baked into a branch's rotating QR code. Validating it
// on join proves the QR was scanned while fresh (anti screenshot-reuse).
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

module.exports = { signAccess, signRefresh, signQrToken, signSession, verify };
