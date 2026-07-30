const QRCode = require('qrcode');
const { signQrToken } = require('./tokenService');
const { withScheme } = require('../config/urls');

const PUBLIC_URL = withScheme(process.env.PUBLIC_WEB_URL || 'http://localhost:5173');

/**
 * Rotating join QR for a ROOM (or the whole branch).
 *
 * Each physical room gets its own QR, so scanning the one on the wall in
 * Registration only offers Registration's queue — not everything in the
 * building. The QR embeds a SHORT-LIVED signed token, so a screenshot shared
 * later fails validation: you had to scan the live code on screen.
 */
async function generateBranchQr(org, branch, scope = {}) {
  const ttl = org?.settings?.qrRotationSeconds || 45;
  const qrToken = signQrToken(branch._id, org._id, ttl);
  const params = new URLSearchParams({ t: qrToken });
  if (scope.room) params.set('room', scope.room.toString());
  if (scope.department) params.set('department', scope.department.toString());

  const url = `${PUBLIC_URL}/join/${org.slug}/${branch._id}?${params.toString()}`;
  const dataUrl = await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 320 });
  return { url, dataUrl, expiresInSeconds: ttl };
}

/**
 * Per-token QR the customer keeps — points at their live tracking page, so
 * staff can scan it at the counter to validate them.
 */
async function generateTokenQr(token, sessionToken) {
  const url = `${PUBLIC_URL}/t/${token._id}?s=${sessionToken}`;
  return QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 240 });
}

module.exports = { generateBranchQr, generateTokenQr };
