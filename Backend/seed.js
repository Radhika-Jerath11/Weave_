// npm run seed  ->  demo user + a board with a dependency chain
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Board = require('./models/Board');
const Task = require('./models/Task');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await User.deleteOne({ email: 'demo@weave.dev' });
  const user = await User.create({ name: 'Demo', email: 'demo@weave.dev', password: await bcrypt.hash('demo1234', 10) });
  const board = await Board.create({ name: 'Launch plan', owner: user._id });
  const mk = (title, estimate, dependsOn = []) => Task.create({ title, estimate, board: board._id, member: user._id, dependsOn });
  const schema = await mk('Design schema', 2);
  const api = await mk('Build API', 5, [schema._id]);
  const auth = await mk('Add auth', 3, [schema._id]);
  const ui = await mk('Build UI', 4, [api._id, auth._id]);
  const qa = await mk('QA pass', 2, [ui._id]);
  await mk('Write docs', 1, [api._id]);
  await mk('Release', 1, [qa._id]);
  console.log('Seeded. Login: demo@weave.dev / demo1234\nBoard id:', String(board._id));
  await mongoose.disconnect();
})();
