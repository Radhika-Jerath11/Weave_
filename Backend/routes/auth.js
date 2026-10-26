// const router = require('express').Router();
// const auth = require('../middleware/auth');
// const authController = require('../controllers/authController');
// const { wrap } = require('../utils/helpers');

// router.post('/signup', wrap(authController.signup));
// router.post('/login', wrap(authController.login));
// router.get('/me', auth, wrap(authController.getMe));

// module.exports = router;




const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { HttpError, wrap } = require('../utils/helpers');
const crypto = require('crypto');

const session = (u) => ({
  token: jwt.sign({ id: u._id }, process.env.JWT_SECRET, { expiresIn: '7d' }),
  user: { id: u._id, name: u.name, email: u.email }
});

router.post('/signup', wrap(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Enter a valid email address');
  if (password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
  if (await User.exists({ email })) throw new HttpError(409, 'An account with this email already exists');
  const user = await User.create({ name, email, password: await bcrypt.hash(password, 10) });
  res.status(201).json(session(user));
}));

router.post('/login', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = await User.findOne({ email });
  const ok = user && await bcrypt.compare(String(req.body.password || ''), user.password);
  if (!ok) throw new HttpError(401, 'Invalid email or password'); // same message for both cases
  res.json(session(user));
}));

// Sign in / sign up with Google (creates the account automatically on first use)
router.post('/google', wrap(async (req, res) => {
  const accessToken = String(req.body.accessToken || '');
  if (!accessToken) throw new HttpError(400, 'Missing Google token');
  if (!process.env.GOOGLE_CLIENT_ID) throw new HttpError(500, 'Google sign-in is not set up on the server');

  let profile;
  try {
    // 1) make sure this token was issued to OUR app (not some other website's)
    const t = await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(accessToken));
    const info = await t.json();
    if (!t.ok || info.aud !== process.env.GOOGLE_CLIENT_ID) throw new Error('bad token');
    // 2) ask Google who the user is
    const p = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + accessToken } });
    profile = await p.json();
    if (!p.ok) throw new Error('bad profile');
  } catch {
    throw new HttpError(401, 'Google sign-in failed. Please try again.');
  }

  const email = String(profile.email || '').trim().toLowerCase();
  if (!email || profile.email_verified !== true) throw new HttpError(401, 'Your Google email is not verified');

  let user = await User.findOne({ email });
  if (!user) {
    // Google users have no password of their own, so store a random unguessable one
    const randomPassword = crypto.randomBytes(32).toString('hex');
    user = await User.create({ name: profile.name || email.split('@')[0], email, password: await bcrypt.hash(randomPassword, 10) });
  }
  res.json(session(user));
}));

router.get('/me', auth, wrap(async (req, res) => {
  const user = await User.findById(req.userId).select('-password');
  if (!user) throw new HttpError(401, 'Account no longer exists');
  res.json({ user: { id: user._id, name: user.name, email: user.email } });
}));

module.exports = router;

