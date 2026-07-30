const mongoose = require('mongoose');

/**
 * A Department is a queue — the thing a customer actually lines up for.
 * "Registration", "Consultation", "Pharmacy", "Cash Deposit", "Passport".
 *
 * Departments belong to a branch and can be COPIED between branches (they're
 * pure configuration), which is why they're defined independently of the
 * physical layout. Where a department is physically served is decided by the
 * Room that lists it, and who serves it by the Counters inside that room.
 */
const QUEUE_TYPES = [
  'walk-in',     // standard first-come queue
  'appointment', // pre-booked slots
  'vip',         // priority tier
  'emergency',   // preempts everything
];

const departmentSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },

    name: { type: String, required: true, trim: true },
    // Prefix used in generated token numbers, e.g. "R" -> "R-014".
    tokenPrefix: { type: String, required: true, trim: true, uppercase: true, maxlength: 3, default: 'A' },
    queueType: { type: String, enum: QUEUE_TYPES, default: 'walk-in' },

    // Higher = served sooner relative to peers. Emergency overrides entirely.
    priorityWeight: { type: Number, default: 0 },

    // Target wait before being served (analytics + SLA breach detection).
    slaSeconds: { type: Number, default: 0 },

    // Average service time in seconds. Seeds the ETA cold start and is
    // continuously recalibrated from real completed visits.
    avgServiceTimeSeconds: { type: Number, default: 300 },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

departmentSchema.index({ organization: 1, branch: 1, isActive: 1 });

module.exports = mongoose.model('Department', departmentSchema);
module.exports.QUEUE_TYPES = QUEUE_TYPES;
