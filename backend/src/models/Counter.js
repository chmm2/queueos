const mongoose = require('mongoose');

/**
 * A Counter is a single serving point INSIDE a room — one desk, one window,
 * one chair. It is where a staff member sits and calls customers.
 *
 * Each counter carries a unique, human-readable `code` (e.g. DCC-MH-REG-01)
 * built from organization / branch / room initials plus a number, so it can be
 * printed above the desk and announced on the display unambiguously.
 *
 * A counter serves a SUBSET of its room's departments: in a "Front Desk" room
 * handling Registration + Billing, counter 01 might do only Registration while
 * counter 02 does both. Leaving `departments` empty means "everything this
 * room handles".
 */
const counterSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    // The physical space this counter sits in.
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true, index: true },

    name: { type: String, required: true, trim: true }, // e.g. "Counter 1"
    code: { type: String, trim: true, uppercase: true }, // e.g. "DCC-MH-REG-01"

    // Which of the room's departments this counter actually handles.
    // Empty = all departments of its room.
    departments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],

    assignedStaff: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // open = serving, paused = temporarily not calling, closed = off.
    status: { type: String, enum: ['open', 'paused', 'closed'], default: 'closed' },
    currentToken: { type: mongoose.Schema.Types.ObjectId, ref: 'Token', default: null },
  },
  { timestamps: true }
);

counterSchema.index({ organization: 1, branch: 1 });
counterSchema.index({ organization: 1, code: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Counter', counterSchema);
