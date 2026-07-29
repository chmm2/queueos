const axios = require('axios');
const Notification = require('../models/Notification');
const { sendMail, templates } = require('./emailService');

/**
 * One event in, many channels out (WhatsApp · SMS · email). Route handlers
 * call notify() with a semantic event; the platform sends on whichever
 * channels are both configured AND have a recipient, records every attempt
 * (outbox pattern), and never lets a slow/failing provider block the queue.
 *
 * WhatsApp + SMS go through Twilio's REST API (no SDK needed — just an
 * authenticated POST). Set these env vars to turn them on:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
 *   TWILIO_SMS_FROM        e.g. +14155551234
 *   TWILIO_WHATSAPP_FROM   e.g. whatsapp:+14155238886
 * If they're unset, those channels are simply skipped (logged), so the app
 * runs fine out of the box and lights up the moment credentials are added.
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

// ---- Twilio transport (shared by SMS + WhatsApp) ----------------------------
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

// ---- Channel adapters. Each returns null (skip) when not configured. --------
const adapters = {
  whatsapp: async (phone, content) => {
    const from = process.env.TWILIO_WHATSAPP_FROM;
    if (!process.env.TWILIO_ACCOUNT_SID || !from || !content.text) return null;
    return twilioSend({ to: `whatsapp:${phone}`, from, body: content.text });
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

module.exports = { notify, EVENTS };
