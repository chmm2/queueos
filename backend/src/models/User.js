const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Tenant-plane roles. Admin owns the whole organization; Operator runs a
// branch; Staff works a counter; User is an (optional) registered customer.
const ROLES = ['User', 'Staff', 'Operator', 'Admin'];

const userSchema = new mongoose.Schema(
  {
    // Tenant this user belongs to. Null only for platform-level/anonymous
    // customers; every staff/operator/admin has one.
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },

    name: { type: String, required: true, trim: true },
    // Globally unique: one email = one account = one organization. This keeps
    // login deterministic (no "which org's Bob?" ambiguity). Customers don't
    // need accounts at all (public QR flow), so only staff emails live here.
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    role: { type: String, enum: ROLES, default: 'User' },
    phone: { type: String, trim: true },
    // Staff/Operator are tied to a specific branch; Admin is org-wide.
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
    isActive: { type: Boolean, default: true },

    // Incremented on password change / forced logout so previously issued
    // refresh tokens can be invalidated (token revocation).
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);


userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toSafeObject = function toSafeObject() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
