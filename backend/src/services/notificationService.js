const axios = require('axios');
const Notification = require('../models/Notification');
const { sendMail, templates } = require('./emailService');

/**
 * One event in, many channels out (WhatsApp · SMS · email). Route handlers
 * call notify() with a semantic event; the platform sends on whichever
 * channels are both configured AND have a recipient, records every attempt
 * (outbox pattern), and never lets a slow/failing provider block the queue.
 *
 * SMS goes through Twilio's REST API (no SDK needed — just an authenticated
 * POST). Set these env vars to turn it on:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM  e.g. +14155551234
 *
 * WhatsApp has two free providers, tried in this order — use whichever one
 * is actually available to you:
 *
 * 1. Meta's WhatsApp Cloud API — 1,000 free conversations/month, no card.
 *    WHATSAPP_CLOUD_TOKEN, WHATSAPP_CLOUD_PHONE_ID from developers.facebook.com
 *    → your App → WhatsApp → API Setup. Gated by the country registered on
 *    your Meta Business Portfolio — not available everywhere, and there's no
 *    workaround from the code side if yours isn't supported.
 * 2. Twilio's WhatsApp Sandbox — permanently free, no business verification,
 *    available wherever Twilio operates (effectively worldwide). Reuses
 *    TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN (same as SMS) plus
 *    TWILIO_WHATSAPP_FROM (the shared sandbox number, "whatsapp:+14155238886").
 *    The tradeoff: each recipient must first message the sandbox number with
 *    a one-time join code (shown in the Twilio console) before they can
 *    receive anything — a per-tester opt-in, same practical shape as Meta's
 *    developer-mode restriction.
 *
 * If none are set, WhatsApp is simply skipped (logged), so the app runs fine
 * out of the box and lights up the moment either provider is configured.
 */

// ---- Per-event content. `text` is used for WhatsApp/SMS; `email` for email.
const EVENTS = {
  issued: {
    text: (t) => `You've joined the queue at ${t.branchName}. Your token is ${t.tokenNumber}. We'll message you when it's almost your turn.`,
    email: (t) => templates.tokenIssued(t.tokenNumber, t.branchName || 'your branch'),
  },
  your_turn: {
    text: (t) => `It's your turn! Token ${t.tokenNumber} — please proceed to ${t.counterName || 'the counter'}.`,
    email: (t) => ({
      subject: `It's your turn — token ${t.tokenNumber}`,
      html: `<p>Token <strong>${t.tokenNumber}</strong>, it's your turn. Please proceed to <strong>${t.counterName || 'the counter'}</strong>.</p>`,
    }),
  },
  almost: {
    text: (t) => `Almost your turn — token ${t.tokenNumber}. Please head back now; you're near the front.`,
    email: (t) => templates.almostYourTurn(t.tokenNumber),
  },
  missed: {
    text: (t) => `You missed your turn (token ${t.tokenNumber}). Please see staff to re-join.`,
    email: (t) => templates.missed(t.tokenNumber),
  },
};

// ---- Twilio transport (SMS) --------------------------------------------------
async function twilioSend({ to, from, body }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  const params = new URLSearchParams({ To: to, From: from, Body: body });
  const res = await axios.post(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    params,
    { auth: { username: sid, password: auth }, timeout: 5000 }
  );
  return { messageId: res.data.sid };
}

/**
 * WhatsApp Cloud API transport — one authenticated POST, no SDK. `to` must be
 * an E.164 number (e.g. "+14155551234", no "whatsapp:" prefix — that's a
 * Twilio-ism, Meta doesn't use it).
 */
async function whatsappCloudSend({ to, body }) {
  const phoneId = process.env.WHATSAPP_CLOUD_PHONE_ID;
  const token = process.env.WHATSAPP_CLOUD_TOKEN;
  const res = await axios.post(
    `https://graph.facebook.com/v21.0/${phoneId}/messages`,
    { messaging_product: 'whatsapp', to: to.replace(/[^\d+]/g, ''), type: 'text', text: { body } },
    { headers: { Authorization: `Bearer ${token}` }, timeout: 5000 }
  );
  return { messageId: res.data.messages?.[0]?.id };
}

/**
 * Try Meta's Cloud API first, then Twilio's Sandbox, then give up. Shared by
 * the notify() fan-out and otpService.js — an OTP is just a WhatsApp message,
 * same transport, same fallback order. Returns null (not a throw) when
 * neither provider is configured, so callers can fall back to their own
 * dev-mode behaviour.
 */
async function sendWhatsapp(phone, body) {
  if (process.env.WHATSAPP_CLOUD_TOKEN && process.env.WHATSAPP_CLOUD_PHONE_ID) {
    return whatsappCloudSend({ to: phone, body });
  }
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (process.env.TWILIO_ACCOUNT_SID && from) {
    return twilioSend({ to: `whatsapp:${phone}`, from, body });
  }
  return null;
}

// ---- Channel adapters. Each returns null (skip) when not configured. --------
const adapters = {
  whatsapp: async (phone, content) => {
    if (!content.text) return null;
    return sendWhatsapp(phone, content.text);
  },
  sms: async (phone, content) => {
    const from = process.env.TWILIO_SMS_FROM;
    if (!process.env.TWILIO_ACCOUNT_SID || !from || !content.text) return null;
    return twilioSend({ to: phone, from, body: content.text });
  },
  email: async (email, content) => {
    if (!content.email) return null;
    return sendMail({ to: email, ...content.email });
  },
};

async function record(orgId, tokenId, channel, template, status, ref) {
  try {
    await Notification.create({
      organization: orgId, token: tokenId, channel, template, status,
      providerRef: ref || null, sentAt: new Date(),
    });
  } catch (err) {
    console.error('[notify] failed to record notification:', err.message);
  }
}

/**
 * @param {Object} token  plain object with contact + org + branch/counter info
 * @param {string} event  one of EVENTS
 */
async function notify(token, event) {
  const spec = EVENTS[event];
  if (!spec) return;

  const content = { text: spec.text && spec.text(token), email: spec.email && spec.email(token) };
  const phone = token.customerPhone;
  const email = token.customerEmail || (token.user && token.user.email);

  const targets = [
    ['whatsapp', phone],
    ['sms', phone],
    ['email', email],
  ];

  await Promise.all(
    targets.map(async ([channel, to]) => {
      if (!to) return;
      try {
        const res = await adapters[channel](to, content);
        if (res) await record(token.organization, token._id, channel, event, 'sent', res.messageId);
        else await record(token.organization, token._id, channel, event, 'skipped', null);
      } catch (err) {
        console.error(`[notify] ${channel} failed:`, err.response?.data?.message || err.message);
        await record(token.organization, token._id, channel, event, 'failed', null);
      }
    })
  );
}

module.exports = { notify, EVENTS, sendWhatsapp };
