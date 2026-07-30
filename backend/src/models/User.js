const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * A User is an administrator — the only kind of person who signs in as
 * themselves. There is no staff account type: the people working the desks
 * sign in as the COUNTER they're sitting at (see models/Counter.js), because
 * the desk is the fixed thing and the person changes shift to shift.
 */
const ROLES = ['Admin'];

const userSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },

    name: { type: String, required: true, trim: true },
    // Globally unique: one email = one account = one organization.
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    role: { type: String, enum: ROLES, default: 'Admin' },
    phone: { type: String, trim: true },
    isActive: { type: Boolean, default: true },

    // Incremented on password change / forced logout so previously issued
    // tokens stop working (revocation).
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
