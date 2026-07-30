const TokenSequence = require('../models/TokenSequence');

/**
 * Branch-local date key, e.g. "2026-07-19". Computed in the branch's own
 * timezone so the daily token counter resets at local midnight, not the
 * server's — a branch in Asia/Kolkata and one in America/New_York roll over
 * at the right local time even on the same server.
 */
function branchDateKey(timezone = 'UTC', date = new Date()) {
  // en-CA gives ISO-style YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Atomically allocate the next token number for a service on a given day.
 * A single findOneAndUpdate with $inc + upsert — no read-then-write race,
 * so two simultaneous joins can never collide on "A-014".
 *
 * Returns a formatted token number like "A-014".
 */
async function nextTokenNumber({ organization, branch, department, prefix, timezone }) {
  const dateKey = branchDateKey(timezone);
  const doc = await TokenSequence.findOneAndUpdate(
    { organization, branch, department, dateKey },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  const num = String(doc.seq).padStart(3, '0');
  return `${(prefix || 'A').toUpperCase()}-${num}`;
}

module.exports = { nextTokenNumber, branchDateKey };
