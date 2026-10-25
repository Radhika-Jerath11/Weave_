require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const auth = require('./middleware/auth');
const Board = require('./models/Board');

for (const k of ['MONGO_URI', 'JWT_SECRET']) {
  if (!process.env[k]) { console.error(`Missing ${k}. Copy .env.example to .env and fill it in.`); process.exit(1); }
}
const path = require('path');
const ORIGINS = (process.env.CLIENT_ORIGINS || 'http://127.0.0.1:5500,http://localhost:5500')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: ORIGINS } });
app.set('io', io);

app.use(cors({ origin: ORIGINS }));
app.use(express.json());

// Serve frontend static files if present (allows unified fullstack deployment)
const frontendPath = path.join(__dirname, '../Frontend');
app.use(express.static(frontendPath));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/invites', require('./routes/invites'));
app.use('/api/boards', auth, require('./routes/boards'));
app.use('/api/tasks', auth, require('./routes/tasks'));
app.use('/api', (req, res) => res.status(404).json({ message: 'Not found' }));

app.use((err, req, res, next) => {
  if (err.status) return res.status(err.status).json({ message: err.message, ...err.extra });
  if (err.name === 'ValidationError' || err.name === 'CastError') return res.status(400).json({ message: err.message });
  console.error(err);
  res.status(500).json({ message: 'Something went wrong on the server' });
});

// ---- Socket.IO: authenticated, and a user can only join boards they own ----
io.use((socket, next) => {
  try { socket.data.userId = jwt.verify(socket.handshake.auth.token, process.env.JWT_SECRET).id; next(); }
  catch { next(new Error('unauthorized')); }
});
io.on('connection', (socket) => {
  socket.on('board:join', async (boardId, ack) => {
    const ok = mongoose.isValidObjectId(boardId) && await Board.exists({ _id: boardId, $or: [{ owner: socket.data.userId }, { members: socket.data.userId }] });
    if (ok) socket.join('board:' + boardId);
    if (typeof ack === 'function') ack({ ok: !!ok });
  });
  socket.on('board:leave', (boardId) => socket.leave('board:' + boardId));
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => server.listen(process.env.PORT || 5000, () => console.log(`Weave API on :${process.env.PORT || 5000}`)))
  .catch((e) => { console.error('MongoDB connection failed:', e.message); process.exit(1); });
