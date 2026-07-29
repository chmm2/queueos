const mongoose = require('mongoose');

/**
 * A Service is the configurable heart of the platform — this is how one
 * codebase serves every industry without code changes. "Consultation",
 * "Cash Deposit", "Passport Renewal", "Pickup Counter" are all just
 * Service rows with different prefixes, priorities and SLAs.
 *
 * Everything industry-specific lives here as DATA, never as a code fork.
 */
const QUEUE_TYPES = [
  'walk-in',     // standard first-come queue
  'appointment', // pre-booked slots
  'vip',         // priority tier
  'emergency',   // preempts everything
];

const serviceSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },

    name: { type: String, required: true, trim: true },
    // Prefix used in generated token numbers, e.g. "A" -> "A-014".
    tokenPrefix: { type: String, required: true, trim: true, uppercase: true, maxlength: 3, default: 'A' },
    queueType: { type: String, enum: QUEUE_TYPES, default: 'walk-in' },

    // Priority weight fed to the queue-ordering score (higher = served sooner
    // relative to peers). Emergency services override this entirely.
    priorityWeight: { type: Number, default: 0 },

    // Target time a customer should wait before being served (analytics + SLA
    // breach detection). 0 = no target.
    slaSeconds: { type: Number, default: 0 },

    // Per-service average service time in seconds. Seeds ETA cold-start and
    // is continuously refined from real completed tokens.
    avgServiceTimeSeconds: { type: Number, default: 300 },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

serviceSchema.index({ organization: 1, branch: 1, isActive: 1 });

module.exports = mongoose.model('Service', serviceSchema);
module.exports.QUEUE_TYPES = QUEUE_TYPES;
