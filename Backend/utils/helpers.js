const crypto = require('crypto');
const mongoose = require('mongoose');
const Board = require('../models/Board');
const Task = require('../models/Task');
const { withLockState } = require('./engine');

class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

// Owner OR accepted member. 404 (not 403) so board ids can't be probed.
async function accessibleBoard(boardId, userId) {
  if (!mongoose.isValidObjectId(boardId)) throw new HttpError(404, 'Board not found');
  const board = await Board.findOne({ _id: boardId, $or: [{ owner: userId }, { members: userId }] });
  if (!board) throw new HttpError(404, 'Board not found');
  return board;
}
// Owner only: deleting the board, inviting, removing members.
async function ownedBoard(boardId, userId) {
  if (!mongoose.isValidObjectId(boardId)) throw new HttpError(404, 'Board not found');
  const board = await Board.findOne({ _id: boardId, owner: userId });
  if (!board) throw new HttpError(404, 'Board not found');
  return board;
}
async function loadTask(taskId, userId) {
  if (!mongoose.isValidObjectId(taskId)) throw new HttpError(404, 'Task not found');
  const task = await Task.findById(taskId);
  if (!task) throw new HttpError(404, 'Task not found');
  const board = await accessibleBoard(task.board, userId);
  return { task, board };
}

const persistStatuses = (changes) => changes.length
  ? Task.bulkWrite(changes.map((c) => ({
      updateOne: { filter: { _id: c.id }, update: { $set: { status: c.status, completedAt: c.status === 'done' ? new Date() : null } } }
    })))
  : null;

// ---- Activity feed (stored on the board, newest first) ----
const plain = (list) => list.map((a) => ({ icon: a.icon, symbol: a.symbol, text: a.text, createdAt: a.createdAt }));
async function logActivity(boardId, entries) {
  const list = [].concat(entries || []).map((e) => ({ ...e, createdAt: new Date() }));
  if (!list.length) {
    const b = await Board.findById(boardId).select('activities');
    return b ? plain(b.activities) : [];
  }
  const board = await Board.findByIdAndUpdate(
    boardId,
    { $push: { activities: { $each: list.reverse(), $position: 0, $slice: 30 } } },
    { new: true }
  ).select('activities');
  return board ? plain(board.activities) : [];
}

// ---- Validate the editable task fields ----
function cleanFields(body) {
  const f = {};
  if (body.title !== undefined) {
    const t = String(body.title).trim();
    if (!t) throw new HttpError(400, 'Task title is required');
    f.title = t;
  }
  if (body.description !== undefined) f.description = String(body.description).slice(0, 1000);
  if (body.assignee !== undefined) f.assignee = String(body.assignee).trim().slice(0, 80);
  if (body.priority !== undefined) {
    const p = String(body.priority).toUpperCase();
    if (!['LOW', 'MEDIUM', 'HIGH'].includes(p)) throw new HttpError(400, 'Priority must be LOW, MEDIUM or HIGH');
    f.priority = p;
  }
  if (body.dueDate !== undefined) {
    const d = String(body.dueDate);
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new HttpError(400, 'Due date must look like YYYY-MM-DD');
    f.dueDate = d;
  }
  if (body.estimate !== undefined) f.estimate = Math.max(1, Number(body.estimate) || 1);
  return f;
}

const emit = (app, boardId, tasks, activities, event) =>
  app.get('io').to('board:' + boardId).emit('board:update', {
    tasks: JSON.parse(JSON.stringify(withLockState(tasks))),
    activities,
    event: { unlocked: [], locked: [], ...event, at: Date.now() }
  });

// Push the new board state to everyone viewing it.
function publish(req, boardId, tasks, event, activities) {
  emit(req.app, boardId, tasks, activities, { ...event, by: req.userId });
}
// Membership changed (joined / removed): log it and refresh every open page.
async function boardChanged(app, boardId, entry) {
  const activities = await logActivity(boardId, entry);
  const tasks = await Task.find({ board: boardId }).lean();
  emit(app, boardId, tasks, activities, { type: 'members' });
}

module.exports = {
  HttpError, wrap, hashToken, accessibleBoard, ownedBoard, loadTask,
  persistStatuses, logActivity, plain, cleanFields, publish, boardChanged
};
