const mongoose = require('mongoose');

/**
 * Tracks the state of an organization's self-learning ETA model — mirrored
 * from the ML service so the console can show progress without a round-trip,
 * and so the scheduler knows when it last trained and on how much data.
 *
 * Lifecycle: collecting -> (enough real visits + accurate) -> active.
 * There is exactly one per organization.
 */
const modelStateSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, unique: true },

    status: { type: String, enum: ['collecting', 'active'], default: 'collecting' },
    // Real completed visits available last time we trained.
    sampleCount: { type: Number, default: 0 },
    // Completed-token count at last training run (to skip redundant retrains).
    trainedAtCount: { type: Number, default: 0 },

    // Accuracy on the org's own held-out data (set once trained).
    maeSeconds: { type: Number, default: null },
    accuracy: { type: Number, default: null }, // fraction within tolerance
    reason: { type: String, default: 'Collecting real visit data…' },

    lastTrainedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ModelState', modelStateSchema);
