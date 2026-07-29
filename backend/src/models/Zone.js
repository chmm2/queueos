const mongoose = require('mongoose');

/**
 * A Zone is a physical AREA within a branch — a place with its own waiting
 * screen and its own join QR. In a hospital, "Consultation" and "Pharmacy" are
 * in different parts of the building, so each is its own zone with its own
 * display and its own QR that drops customers straight into that area's
 * queue(s). A zone can bundle several services (e.g. a "Diagnostics" zone
 * grouping Lab + X-Ray) — that's the "group categories" idea.
 *
 * Zones are optional: without them, the whole-branch board/QR still works.
 */
const zoneSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    name: { type: String, required: true, trim: true },
    services: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Service' }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

zoneSchema.index({ organization: 1, branch: 1, isActive: 1 });

module.exports = mongoose.model('Zone', zoneSchema);
