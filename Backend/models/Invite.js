const mongoose = require('mongoose');
// The emailed link carries a random token. Only its SHA-256 hash is stored,
// so a database leak can't be used to accept invitations.
module.exports = mongoose.model('Invite', new mongoose.Schema({
  board: { type: mongoose.Schema.Types.ObjectId, ref: 'Board', required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tokenHash: { type: String, required: true, unique: true },
  status: { type: String, enum: ['pending', 'accepted', 'revoked'], default: 'pending' },
  expiresAt: { type: Date, required: true },
  acceptedAt: Date
}, { timestamps: true }));
