const mongoose = require('mongoose');

/**
 * A Branch is one physical location of the organization. Everything
 * operational hangs off it: its departments (queues), its rooms (physical
 * spaces), the counters inside those rooms, and the staff who work them.
 */

// One row per weekday. `day` is 0=Sunday .. 6=Saturday to match JS getDay().
const openingHoursSchema = new mongoose.Schema(
  {
    day: { type: Number, min: 0, max: 6, required: true },
    open: { type: String, default: '09:00' },  // local branch time, HH:mm
    close: { type: String, default: '17:00' },
    isClosed: { type: Boolean, default: false },
  },
  { _id: false }
);

function defaultHours() {
  // Mon–Fri open, weekend closed — a sane starting point admins can edit.
  return [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    day,
    open: '09:00',
    close: '17:00',
    isClosed: day === 0 || day === 6,
  }));
}

const branchSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },

    name: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    phone: { type: String, trim: true },

    // IANA timezone, e.g. "Asia/Kolkata". Drives daily token-number resets and
    // opening-hours checks so a branch behaves correctly wherever it is.
    timezone: { type: String, default: 'UTC' },

    openingHours: { type: [openingHoursSchema], default: defaultHours },

    // Geofence for anti-cheat "physically present" checks (optional per org).
    geo: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      radiusMeters: { type: Number, default: 150 },
    },

    isActive: { type: Boolean, default: true },

    // Fallback average service time when a department has no history yet.
    avgServiceTimeSeconds: { type: Number, default: 300 },
  },
  { timestamps: true }
);

branchSchema.index({ organization: 1, isActive: 1 });

module.exports = mongoose.model('Branch', branchSchema);
module.exports.defaultHours = defaultHours;
