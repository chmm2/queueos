const mongoose = require('mongoose');

// The token lifecycle. Valid transitions are enforced in
// services/tokenStateMachine.js, not here — the schema just records state.
const STATUSES = [
  'waiting',
  'serving',
  'held',
  'skipped',
  'completed',
  'missed',
  'cancelled',
];

const SOURCES = ['walk-in', 'online'];

const tokenSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    // The queue this customer is in.
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    // The physical space they were sent to (derived from the room whose QR
    // they scanned) — lets a room's display filter to just its own tokens.
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', default: null, index: true },
    counter: { type: mongoose.Schema.Types.ObjectId, ref: 'Counter', default: null },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null for anonymous walk-ins

    tokenNumber: { type: String, required: true }, // e.g. "A-014"

    // Denormalized customer contact for the public (accountless) join flow.
    customerName: { type: String, trim: true, default: null },
    customerPhone: { type: String, trim: true, default: null },
    // Opaque session id issued to the customer so they can track/cancel
    // their own token without an account (see routes/public.js).
    sessionId: { type: String, default: null, index: true },

    source: { type: String, enum: SOURCES, default: 'walk-in' },

    // --- Priority pass ---
    // A counter can push someone forward, but must record why — the reason,
    // who granted it and when are kept for accountability.
    isPriority: { type: Boolean, default: false },
    priorityReason: { type: String, trim: true, default: null },
    priorityGrantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Counter', default: null },
    priorityGrantedAt: { type: Date, default: null },

    status: { type: String, enum: STATUSES, default: 'waiting' },

    /**
     * Sort position within the queue. Normally equal to issuedAt (plain FIFO),
     * but it can be moved so a token lands at a specific place in line —
     * that's how the no-show penalty pushes someone back without rewriting
     * everyone else's record.
     */
    orderKey: { type: Date, default: Date.now, index: true },

    // How many times this token has been called and not shown up. Resets never
    // — a token is a single day's visit, so the count is naturally per-day.
    noShowCount: { type: Number, default: 0 },

    // Timestamps for each stage transition — these double as the feature set
    // for ETA prediction (actual wait/service durations) and for analytics.
    issuedAt: { type: Date, default: Date.now },
    calledAt: { type: Date, default: null },
    startedAt: { type: Date, default: null }, // when service actually began
    completedAt: { type: Date, default: null },

    // Recall support: if a customer misses their call, they get a grace
    // window before being marked "missed" by the auto-miss sweeper.
    recallCount: { type: Number, default: 0 },
    maxRecalls: { type: Number, default: 1 },
    // When a held/skipped token should be auto-marked missed if not recalled.
    recallDeadline: { type: Date, default: null },

    predictedEtaSeconds: { type: Number, default: null },
    // Where the ETA came from: 'heuristic' (cold start / learning) or 'model'
    // (the org's self-trained model is active).
    etaSource: { type: String, enum: ['heuristic', 'model'], default: 'heuristic' },

    // Snapshot of the feature vector as it was when this token was issued.
    // Combined with the actual wait (startedAt - issuedAt) once served, each
    // completed token becomes one labeled training example for the org's model.
    etaFeatures: {
      queuePosition: { type: Number, default: null },
      avgServiceSeconds: { type: Number, default: null },
      openCounters: { type: Number, default: null },
    },

    qrCode: { type: String, default: null }, // data URL for the check-in QR
  },
  { timestamps: true }
);

// Primary ordering index: priority first, then by queue position.
tokenSchema.index({ organization: 1, branch: 1, status: 1, isPriority: -1, orderKey: 1 });
tokenSchema.index({ department: 1, status: 1, isPriority: -1, orderKey: 1 });

module.exports = mongoose.model('Token', tokenSchema);
module.exports.STATUSES = STATUSES;
module.exports.SOURCES = SOURCES;
