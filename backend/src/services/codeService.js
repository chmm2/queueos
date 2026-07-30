/**
 * Human-readable codes for physical things.
 *
 * A counter's code is printed above the desk and announced on the display, so
 * it has to be short, stable and unambiguous across the whole organization:
 *
 *   DCC-MH-REG-01
 *   │   │  │   └── sequence within the room
 *   │   │  └────── room code      (Registration)
 *   │   └───────── branch initials(Main Hospital)
 *   └───────────── org initials   (Demo City Clinic)
 */

// "Demo City Clinic" -> "DCC";  "Registration" -> "REG";  "Counter 1" -> "C1"
function initials(name, max = 3) {
  if (!name) return 'X';
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words.map((w) => w[0]).join('').slice(0, max).toUpperCase();
  }
  return words[0].slice(0, max).toUpperCase();
}

function roomCode(room) {
  return (room.code && room.code.trim()) || initials(room.name, 3);
}

/**
 * Build the next counter code for a room, e.g. DCC-MH-REG-03.
 * `existingCodes` is used to avoid collisions when counters are deleted and
 * re-added, so we never reuse a live code.
 */
function buildCounterCode({ orgName, branchName, room, existingCodes = [] }) {
  const prefix = [initials(orgName, 3), initials(branchName, 2), roomCode(room)].join('-');
  const taken = new Set(existingCodes.map((c) => (c || '').toUpperCase()));
  for (let n = 1; n < 1000; n += 1) {
    const code = `${prefix}-${String(n).padStart(2, '0')}`;
    if (!taken.has(code)) return code;
  }
  return `${prefix}-${Date.now().toString().slice(-4)}`;
}

/**
 * Login credentials for a counter. The email is derived from its code so it's
 * predictable and easy to type at the desk; the password is random and shown
 * to the admin exactly once, so only a hash is ever stored.
 */
const { randomInt } = require('crypto');

function counterEmail(code, orgSlug) {
  return `${String(code).toLowerCase()}@${orgSlug || 'org'}.queueos.app`;
}

// Readable but random — easy to dictate to the team, hard to guess.
function generatePassword() {
  const words = ['desk', 'queue', 'front', 'token', 'serve', 'line', 'call', 'room'];
  const w = words[randomInt(0, words.length)];
  return `${w}-${randomInt(1000, 9999)}-${randomInt(1000, 9999)}`;
}

module.exports = { initials, roomCode, buildCounterCode, counterEmail, generatePassword };
