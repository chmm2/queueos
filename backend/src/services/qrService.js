const QRCode = require('qrcode');
const { signQrToken } = require('./tokenService');
const { withScheme } = require('../config/urls');

const PUBLIC_URL = withScheme(process.env.PUBLIC_WEB_URL || 'http://localhost:5173');

/**
 * Rotating branch join QR. The QR encodes a URL to the public join page plus
 * a SHORT-LIVED signed token (qr JWT). Because the token expires in seconds,
 * a screenshot shared later fails validation on join — this is the core
 * anti-cheat "you had to scan a fresh code" mechanism. The kiosk/display
 * refreshes it every `qrRotationSeconds`.
 */
async function generateBranchQr(org, branch, scope = {}) {
  const ttl = org?.settings?.qrRotationSeconds || 45;
  const qrToken = signQrToken(branch._id, org._id, ttl);
  const params = new URLSearchParams({ t: qrToken });
  // Scope the QR to a physical area so scanning it joins that area's queue(s).
  if (scope.zone) params.set('zone', scope.zone.toString());
  if (scope.service) params.set('service', scope.service.toString());
  const url = `${PUBLIC_URL}/join/${org.slug}/${branch._id}?${params.toString()}`;
  const dataUrl = await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 320 });
  return { url, dataUrl, expiresInSeconds: ttl };
}

/**
 * Per-token QR the customer keeps — points at the public tracking page for
 * their token, so staff can scan it at the counter to validate/check in.
 */
async function generateTokenQr(token, sessionToken) {
  const url = `${PUBLIC_URL}/t/${token._id}?s=${sessionToken}`;
  return QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 240 });
}

module.exports = { generateBranchQr, generateTokenQr };
