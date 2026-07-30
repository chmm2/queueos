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
 * Two subtleties make that guarantee real rather than merely intended:
 *
 * 1. The atomicity rests entirely on the unique index over
 *    (organization, branch, department, dateKey). Without it, two concurrent
 *    upserts for a day's FIRST token both match nothing and both insert, and
 *    two customers walk away holding "A-001". `init()` waits for that index to
 *    exist before we depend on it; it resolves instantly once built.
 * 2. With the index in place, that same race surfaces instead as a duplicate
 *    key error on one of the two inserts — expected under concurrency, not a
 *    fault. Retrying finds the document the winner created and $inc's it.
 *
 * Returns a formatted token number like "A-014".
 */
async function nextTokenNumber({ organization, branch, department, prefix, timezone }) {
  const dateKey = branchDateKey(timezone);
  await TokenSequence.init();

  let doc;
  for (let attempt = 0; ; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      doc = await TokenSequence.findOneAndUpdate(
        { organization, branch, department, dateKey },
        { $inc: { seq: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      break;
    } catch (err) {
      // 11000 = duplicate key: someone else inserted the same day's counter a
      // moment before us. Anything else is a real failure.
      if (err.code !== 11000 || attempt >= 4) throw err;
    }
  }

  const num = String(doc.seq).padStart(3, '0');
  return `${(prefix || 'A').toUpperCase()}-${num}`;
}

module.exports = { nextTokenNumber, branchDateKey };
