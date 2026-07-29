const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
}

/**
 * Fire-and-forget style helper. Email failures should never break the
 * queue flow, so callers don't need to await this on the critical path
 * if they don't want to (though awaiting is fine too — nodemailer's
 * sendMail already returns a promise and doesn't block the event loop).
 */
async function sendMail({ to, subject, html }) {
  if (!to) return null;
  try {
    const info = await getTransporter().sendMail({
      from: process.env.SMTP_FROM || 'no-reply@queueplatform.com',
      to,
      subject,
      html,
    });
    return info;
  } catch (err) {
    console.error('[email] send failed:', err.message);
    return null;
  }
}

const templates = {
  tokenIssued: (tokenNumber, branchName) => ({
    subject: `Your token ${tokenNumber} has been issued`,
    html: `<p>Your token <strong>${tokenNumber}</strong> at <strong>${branchName}</strong> has been issued. We'll email you when you're next in line.</p>`,
  }),
  almostYourTurn: (tokenNumber) => ({
    subject: `You're next — token ${tokenNumber}`,
    html: `<p>Token <strong>${tokenNumber}</strong>, you are next in line. Please head to the counter.</p>`,
  }),
  missed: (tokenNumber) => ({
    subject: `You missed your turn — token ${tokenNumber}`,
    html: `<p>Token <strong>${tokenNumber}</strong> was marked as missed after no response. Please speak to staff to be requeued.</p>`,
  }),
};

module.exports = { sendMail, templates };
