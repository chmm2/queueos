const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * A Counter is a single serving point INSIDE a room — one desk, one window,
 * one machine.
 *
 * A counter is also a LOGIN IDENTITY. There are no per-person staff accounts:
 * the admin creates the counter, the system hands back an email + password,
 * and whoever sits at that machine signs in as the counter itself. That
 * matches how these venues actually work — the desk is the fixed thing, the
 * person behind it changes shift to shift.
 *
 * Its `code` (DCC-MH-REG-01) is printed above the desk and announced on the
 * display, built from organization / branch / room initials plus a number.
 *
 * A counter serves a SUBSET of its room's departments — leave it empty to
 * serve everything the room handles.
 */
const counterSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true, index: true },

    name: { type: String, required: true, trim: true }, // e.g. "Counter 1"
    code: { type: String, trim: true, uppercase: true }, // e.g. "DCC-MH-REG-01"

    // --- Login credentials for the machine at this desk ---
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    // Bumped on password reset so old sessions stop working.
    tokenVersion: { type: Number, default: 0 },

    // Which of the room's departments this counter handles. Empty = all.
    departments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],

    // open = serving, paused = temporarily not calling, closed = off.
    status: { type: String, enum: ['open', 'paused', 'closed'], default: 'closed' },
    currentToken: { type: mongoose.Schema.Types.ObjectId, ref: 'Token', default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

counterSchema.index({ organization: 1, branch: 1 });
counterSchema.index({ organization: 1, code: 1 }, { unique: true, sparse: true });

counterSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, await bcrypt.genSalt(10));
  next();
});

counterSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

counterSchema.methods.toSafeObject = function toSafeObject() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('Counter', counterSchema);
