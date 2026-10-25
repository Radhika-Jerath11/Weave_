const Task = require('../models/Task');
const { HttpError, loadTask, persistStatuses, logActivity, cleanFields, publish } = require('../utils/helpers');
const engine = require('../utils/engine');

const boardTasks = (boardId) => Task.find({ board: boardId }).lean();
const LABEL = { todo: 'TODO', inprogress: 'IN PROGRESS', review: 'REVIEW', done: 'DONE' };
const titleOf = (tasks, id) => tasks.find((t) => String(t._id) === String(id))?.title;
const unlockedEntries = (tasks, ids) => ids.map((id) => ({ icon: 'icon-unlocked', symbol: '🔓', text: `'${titleOf(tasks, id)}' unlocked` }));

exports.moveTaskStatus = async (req, res) => {
  const { task, board } = await loadTask(req.params.id, req.userId);
  const status = req.body.status;
  const result = engine.moveTask(await boardTasks(board._id), task._id, status);

  if (!result.ok) {
    const extra = { blockedBy: result.blockedBy };
    if (result.status === 409) {
      extra.activities = await logActivity(board._id, { icon: 'icon-blocked', symbol: '⚠', text: `Movement blocked: '${task.title}' is locked.` });
    }
    throw new HttpError(result.status, result.message, extra);
  }

  await persistStatuses(result.changes);
  const entries = [];
  if (result.changes.length) {
    entries.push(status === 'done'
      ? { icon: 'icon-done', symbol: '✓', text: `'${task.title}' marked Done` }
      : { icon: 'icon-unlocked', symbol: '➔', text: `'${task.title}' moved to ${LABEL[status]}` });
    for (const c of result.changes) {
      if (c.id !== String(task._id)) entries.push({ icon: 'icon-blocked', symbol: '🔒', text: `'${titleOf(result.tasks, c.id)}' was reset to TODO and re-locked` });
    }
  }
  entries.push(...unlockedEntries(result.tasks, result.unlocked));
  const activities = await logActivity(board._id, entries);

  publish(req, board._id, result.tasks, { type: 'task:moved', taskId: String(task._id), status, unlocked: result.unlocked, locked: result.locked }, activities);
  res.json({ tasks: engine.withLockState(result.tasks), changes: result.changes, unlocked: result.unlocked, locked: result.locked, activities });
};

exports.setDependencies = async (req, res) => {
  const { task, board } = await loadTask(req.params.id, req.userId);
  if (!Array.isArray(req.body.dependsOn)) throw new HttpError(400, 'dependsOn must be an array of task ids');
  const result = engine.setDependencies(await boardTasks(board._id), task._id, req.body.dependsOn);
  if (!result.ok) throw new HttpError(result.status, result.message);

  await Task.updateOne({ _id: task._id }, { $set: { dependsOn: result.dependsOn } });
  await persistStatuses(result.changes);
  const activities = await logActivity(board._id, [
    { icon: 'icon-unlocked', symbol: '✎', text: `Updated dependencies of '${task.title}'` },
    ...unlockedEntries(result.tasks, result.unlocked)
  ]);
  publish(req, board._id, result.tasks, { type: 'task:dependencies', taskId: String(task._id), unlocked: result.unlocked, locked: result.locked }, activities);
  res.json({ tasks: engine.withLockState(result.tasks), unlocked: result.unlocked, locked: result.locked, activities });
};

exports.updateTask = async (req, res) => {
  const { task, board } = await loadTask(req.params.id, req.userId);
  Object.assign(task, cleanFields(req.body));
  await task.save();
  const tasks = await boardTasks(board._id);
  const activities = await logActivity(board._id, { icon: 'icon-unlocked', symbol: '✎', text: `Updated task '${task.title}'` });
  publish(req, board._id, tasks, { type: 'task:updated', taskId: String(task._id), unlocked: [], locked: [] }, activities);
  res.json({ tasks: engine.withLockState(tasks), activities });
};

exports.deleteTask = async (req, res) => {
  const { task, board } = await loadTask(req.params.id, req.userId);
  const result = engine.removeTask(await boardTasks(board._id), task._id);
  await Task.updateMany({ board: board._id }, { $pull: { dependsOn: task._id } });
  await task.deleteOne();
  const activities = await logActivity(board._id, [
    { icon: 'icon-blocked', symbol: '−', text: `Deleted task '${task.title}'` },
    ...unlockedEntries(result.tasks, result.unlocked)
  ]);
  publish(req, board._id, result.tasks, { type: 'task:deleted', taskId: String(task._id), unlocked: result.unlocked, locked: result.locked }, activities);
  res.json({ tasks: engine.withLockState(result.tasks), unlocked: result.unlocked, activities });
};
