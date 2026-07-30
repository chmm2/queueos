const mongoose = require('mongoose');

/**
 * A Room is a PHYSICAL space inside a branch — the registration hall, the
 * pharmacy window, the consultation wing. It is the unit that gets:
 *
 *   - its own join QR      (scanning it shows only this room's departments)
 *   - its own wall display (showing only what's relevant to people sitting here)
 *   - its own Counters     (the serving points physically located in it)
 *
 * A room usually maps to one department, but can deliberately combine several
 * (e.g. a single "Front Desk" room handling Registration + Billing), which is
 * why `departments` is a list.
 */
const roomSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },

    name: { type: String, required: true, trim: true },
    // Short code used when generating counter labels, e.g. "REG".
    code: { type: String, trim: true, uppercase: true, maxlength: 6, default: '' },

    // Which queues are served in this physical space.
    departments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

roomSchema.index({ organization: 1, branch: 1, isActive: 1 });

module.exports = mongoose.model('Room', roomSchema);
