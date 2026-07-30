const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Two roles, deliberately. Admin configures the organization (branches,
// departments, rooms, counters, staff) and sees analytics. Staff work a
// counter and call customers. Customers never need an account at all — they
// join by scanning a QR — so there is no customer role here.
const ROLES = ['Staff', 'Admin'];

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
    role: { type: String, enum: ROLES, default: 'Staff' },
    phone: { type: String, trim: true },
    // Staff belong to one branch; Admins are org-wide (branch stays null).
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
    // Optional default counter a staff member works at.
    counter: { type: mongoose.Schema.Types.ObjectId, ref: 'Counter', default: null },
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
