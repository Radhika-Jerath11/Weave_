const mongoose = require('mongoose');
// "locked" is deliberately NOT stored: it is derived from dependsOn + statuses.
module.exports = mongoose.model('Task', new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  assignee: { type: String, default: '' },
  priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'MEDIUM' },
  dueDate: { type: String, default: '' },          // YYYY-MM-DD, same as the date input
  board: { type: mongoose.Schema.Types.ObjectId, ref: 'Board', required: true, index: true },
  member: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['todo', 'inprogress', 'review', 'done'], default: 'todo' },
  completedAt: { type: Date, default: null },
  estimate: { type: Number, min: 1, default: 1 },   // effort units for the critical path
  dependsOn: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }]
}, { timestamps: true }));
