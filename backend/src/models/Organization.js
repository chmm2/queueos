const mongoose = require('mongoose');

/**
 * The tenant root. Every other document in the system belongs to exactly
 * one Organization, and no query ever crosses this boundary (enforced by
 * the tenant-scope middleware, see middleware/tenant.js).
 *
 * An org is created by self-serve signup (routes/auth.js -> /register-org),
 * which also creates its first Admin (owner) user.
 */
const PLANS = ['free', 'pro', 'enterprise'];
const INDUSTRIES = ['hospital', 'bank', 'restaurant', 'government', 'pharmacy', 'salon', 'retail', 'education', 'other'];

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // URL-safe unique handle, used in public join links: /join/:slug
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    industry: { type: String, enum: INDUSTRIES, default: 'other' },
    plan: { type: String, enum: PLANS, default: 'free' },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },

    // Per-tenant configuration that industry templates seed and admins tune.
    settings: {
      // Anti-cheat policy applied to the public join flow. Tunable per org
      // (an ER needs less friction than a passport office).
      requireOtp: { type: Boolean, default: false },
      requireGeofence: { type: Boolean, default: false },
      qrRotationSeconds: { type: Number, default: 45 },
      brandColor: { type: String, default: '#4B4DDB' },
    },

    // What this organization calls the person in the queue (Patient / Guest /
    // Client / Applicant). Used on the customer-facing join + tracking pages.
    // Structural names (Branch/Department/Room/Counter) are intentionally fixed.
    terminology: {
      customer: { type: String, default: 'Customer' },
      customerPlural: { type: String, default: 'Customers' },
      token: { type: String, default: 'Token' },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Organization', organizationSchema);
module.exports.PLANS = PLANS;
module.exports.INDUSTRIES = INDUSTRIES;
