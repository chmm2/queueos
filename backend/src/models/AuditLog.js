const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
    token: { type: mongoose.Schema.Types.ObjectId, ref: 'Token', default: null },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null = system
    action: { type: String, required: true }, // e.g. "TOKEN_ISSUED", "TOKEN_CALLED", "TOKEN_COMPLETED"
    fromStatus: { type: String, default: null },
    toStatus: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

auditLogSchema.index({ token: 1, createdAt: 1 });
auditLogSchema.index({ branch: 1, createdAt: -1 });
auditLogSchema.index({ organization: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
