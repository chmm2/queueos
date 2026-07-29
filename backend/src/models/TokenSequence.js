const mongoose = require('mongoose');

/**
 * Atomic per-day token counter. This is what makes token numbers unique
 * under concurrency — two customers booking at the same instant can never
 * receive the same "A-014".
 *
 * The unique key is (organization, branch, service, dateKey). Issuing a
 * number is a single atomic findOneAndUpdate with $inc + upsert, so there
 * is no read-then-write race. See services/sequenceService.js.
 */
const tokenSequenceSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  service: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
  // Branch-local date, e.g. "2026-07-19" — resets numbering each day.
  dateKey: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

tokenSequenceSchema.index(
  { organization: 1, branch: 1, service: 1, dateKey: 1 },
  { unique: true }
);

module.exports = mongoose.model('TokenSequence', tokenSequenceSchema);
