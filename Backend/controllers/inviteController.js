const Board = require('../models/Board');
const User = require('../models/User');
const Invite = require('../models/Invite');
const { HttpError, hashToken, boardChanged } = require('../utils/helpers');

const stateOf = (inv) => (inv.status !== 'pending' ? inv.status : inv.expiresAt < new Date() ? 'expired' : 'pending');

exports.previewInvite = async (req, res) => {
  const inv = await Invite.findOne({ tokenHash: hashToken(req.query.token || '') })
    .populate('board', 'name').populate('invitedBy', 'name email');
  if (!inv) throw new HttpError(404, 'This invitation link is not valid.');
  res.json({
    state: stateOf(inv), email: inv.email,
    boardName: inv.board ? inv.board.name : 'a board',
    invitedBy: inv.invitedBy ? (inv.invitedBy.name || inv.invitedBy.email) : 'Someone'
  });
};

exports.acceptInvite = async (req, res) => {
  const inv = await Invite.findOne({ tokenHash: hashToken(req.body.token || '') });
  if (!inv) throw new HttpError(404, 'This invitation link is not valid.');
  const state = stateOf(inv);
  if (state === 'revoked') throw new HttpError(410, 'This invitation was cancelled by the board owner.');
  if (state === 'expired') throw new HttpError(410, 'This invitation has expired. Ask the owner to send a new one.');

  const user = await User.findById(req.userId).select('name email');
  if (!user || user.email.toLowerCase() !== inv.email.toLowerCase()) {
    throw new HttpError(403, `This invitation was sent to ${inv.email}, but you are signed in as ${user ? user.email : 'another account'}. Sign in with the invited email.`);
  }
  const board = await Board.findById(inv.board);
  if (!board) throw new HttpError(404, 'That board no longer exists.');

  const isMember = board.members.some((m) => String(m) === String(user._id));
  if (state === 'accepted' && !isMember) throw new HttpError(410, 'This invitation was already used.');

  if (!isMember && String(board.owner) !== String(user._id)) {
    await Board.updateOne({ _id: board._id }, { $addToSet: { members: user._id } });
    await boardChanged(req.app, board._id, { icon: 'icon-unlocked', symbol: '+', text: `${user.name || user.email} joined the board` });
  }
  if (state === 'pending') { inv.status = 'accepted'; inv.acceptedAt = new Date(); await inv.save(); }
  res.json({ board: { _id: board._id, name: board.name } });
};

exports.getMyPendingInvites = async (req, res) => {
  const user = await User.findById(req.userId).select('email');
  if (!user) throw new HttpError(401, 'User not found');
  const list = await Invite.find({
    email: user.email.toLowerCase(),
    status: 'pending',
    expiresAt: { $gt: new Date() }
  })
    .populate('board', 'name')
    .populate('invitedBy', 'name email')
    .sort('-createdAt');

  res.json(list.map((inv) => ({
    _id: inv._id,
    boardId: inv.board ? inv.board._id : null,
    boardName: inv.board ? inv.board.name : 'Shared Board',
    invitedBy: inv.invitedBy ? (inv.invitedBy.name || inv.invitedBy.email) : 'A team member',
    createdAt: inv.createdAt
  })));
};

exports.acceptInviteDirect = async (req, res) => {
  const user = await User.findById(req.userId).select('name email');
  if (!user) throw new HttpError(401, 'User not found');
  const inv = await Invite.findById(req.params.inviteId);
  if (!inv) throw new HttpError(404, 'Invitation not found');
  if (inv.email.toLowerCase() !== user.email.toLowerCase()) {
    throw new HttpError(403, 'This invitation was not sent to your email.');
  }
  const state = stateOf(inv);
  if (state === 'revoked') throw new HttpError(410, 'This invitation was cancelled.');
  if (state === 'expired') throw new HttpError(410, 'This invitation has expired.');

  const board = await Board.findById(inv.board);
  if (!board) throw new HttpError(404, 'Board not found');

  const isMember = board.members.some((m) => String(m) === String(user._id));
  if (!isMember && String(board.owner) !== String(user._id)) {
    await Board.updateOne({ _id: board._id }, { $addToSet: { members: user._id } });
    await boardChanged(req.app, board._id, { icon: 'icon-unlocked', symbol: '+', text: `${user.name || user.email} joined the board` });
  }
  inv.status = 'accepted';
  inv.acceptedAt = new Date();
  await inv.save();

  res.json({ board: { _id: board._id, name: board.name } });
};
