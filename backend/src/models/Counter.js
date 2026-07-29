const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },

    name: { type: String, required: true, trim: true }, // e.g. "Counter 1"

    // Services this counter is able to serve (M:N). A counter can handle
    // several services; "call next" pulls from any of them.
    services: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Service' }],

    assignedStaff: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // open = serving, paused = temporarily not calling, closed = off.
    status: { type: String, enum: ['open', 'paused', 'closed'], default: 'closed' },
    currentToken: { type: mongoose.Schema.Types.ObjectId, ref: 'Token', default: null },
  },
  { timestamps: true }
);

counterSchema.index({ organization: 1, branch: 1 });

module.exports = mongoose.model('Counter', counterSchema);
