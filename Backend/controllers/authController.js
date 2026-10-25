const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { HttpError } = require('../utils/helpers');

const session = (u) => ({
  token: jwt.sign({ id: u._id }, process.env.JWT_SECRET, { expiresIn: '7d' }),
  user: { id: u._id, name: u.name, email: u.email }
});

exports.signup = async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Enter a valid email address');
  if (password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
  if (await User.exists({ email })) throw new HttpError(409, 'An account with this email already exists');
  const user = await User.create({ name, email, password: await bcrypt.hash(password, 10) });
  res.status(201).json(session(user));
};

exports.login = async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = await User.findOne({ email });
  const ok = user && await bcrypt.compare(String(req.body.password || ''), user.password);
  if (!ok) throw new HttpError(401, 'Invalid email or password');
  res.json(session(user));
};

exports.getMe = async (req, res) => {
  const user = await User.findById(req.userId).select('-password');
  if (!user) throw new HttpError(401, 'Account no longer exists');
  res.json({ user: { id: user._id, name: user.name, email: user.email } });
};
