const { randomInt } = require('crypto');
const { sendWhatsapp } = require('./notificationService');

/**
 * Minimal OTP service for phone verification on the public join flow.
 *
 * Codes are stored in-memory with a short TTL. This is fine for a single
 * instance / demo; for a horizontally-scaled deployment move this store to
 * Redis (same interface) so any node can verify a code it didn't issue.
 *
 * Delivery rides the same WhatsApp transport as everything else in
 * notificationService.js (Meta Cloud API, falling back to Twilio's Sandbox) —
 * an OTP is just a text message, there's no separate "OTP product" to
 * integrate. If neither provider is configured, or the send fails (e.g. the
 * number hasn't opted into the sandbox / isn't an approved Meta tester), we
 * fall back to logging + returning the code outside production so the join
 * flow stays testable end-to-end either way.
 */
const store = new Map(); // phone -> { code, expiresAt, attempts }
const TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function purge() {
  const now = Date.now();
  for (const [phone, rec] of store) if (rec.expiresAt < now) store.delete(phone);
}

async function deliver(phone, code) {
  const body = `Your QueueOS verification code is ${code}. It expires in 5 minutes.`;
  try {
    const sent = await sendWhatsapp(phone, body);
    if (sent) return;
  } catch (err) {
    console.error('[otp] WhatsApp delivery failed, falling back to log:', err.response?.data?.error?.message || err.message);
  }
  console.log(`[otp] code for ${phone}: ${code}`);
}

async function requestOtp(phone) {
  purge();
  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  store.set(phone, { code, expiresAt: Date.now() + TTL_MS, attempts: 0 });
  await deliver(phone, code);
  const res = { sent: true };
  if (process.env.NODE_ENV !== 'production') res.devCode = code; // testability
  return res;
}

function verifyOtp(phone, code) {
  purge();
  const rec = store.get(phone);
  if (!rec) return false;
  if (rec.attempts >= MAX_ATTEMPTS) {
    store.delete(phone);
    return false;
  }
  rec.attempts += 1;
  if (rec.code === String(code)) {
    store.delete(phone);
    return true;
  }
  return false;
}

module.exports = { requestOtp, verifyOtp };
