const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },

    name: { type: String, required: true, trim: true },
    address: { type: String, trim: true },

    // IANA timezone, e.g. "Asia/Kolkata". Drives daily token-number resets
    // and hour-of-day features so a branch in Tokyo behaves correctly
    // regardless of where the server runs.
    timezone: { type: String, default: 'UTC' },

    // Geofence for anti-cheat "physically present" checks (optional per org).
    geo: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      radiusMeters: { type: Number, default: 150 },
    },

    isActive: { type: Boolean, default: true },

    // Fallback average service time in seconds when a service has no history
    // yet (cold start).
    avgServiceTimeSeconds: { type: Number, default: 300 },
  },
  { timestamps: true }
);

branchSchema.index({ organization: 1, isActive: 1 });

module.exports = mongoose.model('Branch', branchSchema);
