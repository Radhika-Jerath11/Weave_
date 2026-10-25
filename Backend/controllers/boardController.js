const crypto = require('crypto');
const mongoose = require('mongoose');
const Board = require('../models/Board');
const Task = require('../models/Task');
const User = require('../models/User');
const Invite = require('../models/Invite');
const {
  HttpError, hashToken, accessibleBoard, ownedBoard,
  logActivity, plain, cleanFields, publish, boardChanged
} = require('../utils/helpers');
const { withLockState, criticalPath } = require('../utils/engine');
const { sendInviteEmail } = require('../utils/mailer');

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const INVITE_DAYS = 7;

exports.getBoards = async (req, res) => {
  const boards = await Board.find({ $or: [{ owner: req.userId }, { members: req.userId }] })
    .select('name owner').sort('-createdAt');
  res.json(boards.map((b) => ({ _id: b._id, name: b.name, isOwner: String(b.owner) === String(req.userId) })));
};

exports.createBoard = async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) throw new HttpError(400, 'Board name is required');
  const board = await Board.create({ name, owner: req.userId });
  res.status(201).json({ _id: board._id, name: board.name, isOwner: true });
};

exports.getBoard = async (req, res) => {
  const board = await accessibleBoard(req.params.id, req.userId);
  await board.populate([{ path: 'owner', select: 'name email' }, { path: 'members', select: 'name email' }]);
  const isOwner = String(board.owner?._id) === String(req.userId);

  const tasks = await Task.find({ board: board._id }).lean();
  const invites = isOwner
    ? await Invite.find({ board: board._id, status: 'pending', expiresAt: { $gt: new Date() } }).select('email createdAt').sort('-createdAt')
    : [];
  const owner = board.owner || {};

  res.json({
    board: {
      _id: board._id, name: board.name, isOwner,
      owner: { _id: owner._id, name: owner.name, email: owner.email },
      members: board.members.map((m) => ({ _id: m._id, name: m.name, email: m.email }))
    },
    tasks: withLockState(tasks),
    activities: plain(board.activities),
    invites
  });
};

exports.deleteBoard = async (req, res) => {
  const board = await ownedBoard(req.params.id, req.userId);
  await Task.deleteMany({ board: board._id });
  await Invite.deleteMany({ board: board._id });
  await board.deleteOne();
  res.json({ ok: true });
};

exports.getCriticalPath = async (req, res) => {
  const board = await accessibleBoard(req.params.id, req.userId);
  res.json(criticalPath(await Task.find({ board: board._id }).lean()));
};

exports.createTask = async (req, res) => {
  const board = await accessibleBoard(req.params.id, req.userId);
  const fields = cleanFields(req.body);
  if (!fields.title) throw new HttpError(400, 'Task title is required');

  const existing = await Task.find({ board: board._id }).lean();
  const ids = new Set(existing.map((t) => String(t._id)));
  const deps = [...new Set((req.body.dependsOn || []).map(String))];
  if (deps.some((d) => !ids.has(d))) throw new HttpError(400, 'Dependency must be a task on the same board.');

  const task = await Task.create({ ...fields, board: board._id, member: req.userId, dependsOn: deps });
  const tasks = await Task.find({ board: board._id }).lean();
  const activities = await logActivity(board._id, { icon: 'icon-unlocked', symbol: '+', text: `Created new task '${task.title}'` });
  publish(req, board._id, tasks, { type: 'task:created', taskId: String(task._id) }, activities);
  res.status(201).json({ task, tasks: withLockState(tasks), activities });
};

exports.createInvite = async (req, res) => {
  const board = await ownedBoard(req.params.id, req.userId);
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address');

  const inviter = await User.findById(req.userId).select('name email');
  if (email === inviter.email) throw new HttpError(400, 'That is your own email. You already own this board.');

  const existingUser = await User.findOne({ email }).select('_id');
  if (existingUser && board.members.some((m) => String(m) === String(existingUser._id))) {
    throw new HttpError(409, 'That person is already on this board.');
  }
  const recent = await Invite.countDocuments({ invitedBy: req.userId, createdAt: { $gt: new Date(Date.now() - 3600e3) } });
  if (recent >= 20) throw new HttpError(429, 'Too many invitations in the last hour. Try again later.');

  await Invite.updateMany({ board: board._id, email, status: 'pending' }, { $set: { status: 'revoked' } });
  const token = crypto.randomBytes(32).toString('hex');
  await Invite.create({
    board: board._id, email, invitedBy: req.userId, tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + INVITE_DAYS * 864e5)
  });

  const base = (process.env.CLIENT_URL || 'http://127.0.0.1:5500').replace(/\/+$/, '');
  const link = `${base}/accept-invite.html?token=${token}`;

  let emailSent = false;
  try {
    const result = await sendInviteEmail({
      to: email,
      inviterName: inviter.name || inviter.email,
      boardName: board.name,
      link
    });
    emailSent = result.sent;
  } catch (err) {
    console.error('[mail] Invitation email failed:', err.message);
  }

  const out = { ok: true, email, emailSent, link, devLink: link };
  if (!emailSent) {
    out.message = 'Invitation created, but email was not sent. Check SMTP configuration.';
  }
  res.status(201).json(out);
};

exports.revokeInvite = async (req, res) => {
  const board = await ownedBoard(req.params.id, req.userId);
  if (!mongoose.isValidObjectId(req.params.inviteId)) throw new HttpError(404, 'Invitation not found');
  const r = await Invite.updateOne({ _id: req.params.inviteId, board: board._id, status: 'pending' }, { $set: { status: 'revoked' } });
  if (!r.matchedCount) throw new HttpError(404, 'Invitation not found');
  res.json({ ok: true });
};

exports.removeMember = async (req, res) => {
  const board = await accessibleBoard(req.params.id, req.userId);
  const target = req.params.userId;
  const isOwner = String(board.owner) === String(req.userId);
  if (!isOwner && String(req.userId) !== target) throw new HttpError(403, 'Only the board owner can remove members.');
  if (!mongoose.isValidObjectId(target)) throw new HttpError(404, 'Member not found');
  if (String(board.owner) === target) throw new HttpError(400, 'The owner cannot be removed from their own board.');

  const user = await User.findById(target).select('name email');
  const r = await Board.updateOne({ _id: board._id }, { $pull: { members: target } });
  if (!r.modifiedCount) throw new HttpError(404, 'Member not found');

  const room = 'board:' + board._id;
  const sockets = await req.app.get('io').in(room).fetchSockets();
  sockets.filter((s) => String(s.data.userId) === target).forEach((s) => s.leave(room));

  const who = user ? (user.name || user.email) : 'A member';
  await boardChanged(req.app, board._id, { icon: 'icon-blocked', symbol: '−', text: `${who} was removed from the board` });
  res.json({ ok: true });
};
