const mongoose = require('mongoose');

/**
 * Delivery outbox: one row per notification attempt on any channel. Gives an
 * auditable, retryable record of what was sent to whom — and keeps a slow or
 * failing provider off the queue's critical path.
 */
const notificationSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    token: { type: mongoose.Schema.Types.ObjectId, ref: 'Token', default: null },
    channel: { type: String, enum: ['email', 'sms', 'whatsapp', 'push'], required: true },
    template: { type: String, required: true },
    status: { type: String, enum: ['sent', 'failed', 'skipped', 'queued'], default: 'queued' },
    providerRef: { type: String, default: null },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);
