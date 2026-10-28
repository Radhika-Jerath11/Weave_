const mongoose = require('mongoose');
const activity = new mongoose.Schema({
  icon: String, symbol: String, text: String,
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

module.exports = mongoose.model('Board', new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }], // accepted collaborators
  activities: { type: [activity], default: [] }                                   
}, { timestamps: true }));
