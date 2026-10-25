/**
 * Weave dependency engine. Pure functions: no database, no Express.
 * Every function takes a board's tasks (plain objects) and returns a result
 * without mutating its input. The routes persist whatever comes back.
 */
const STATUSES = ['todo', 'inprogress', 'review', 'done'];
const ID = (x) => String(x);

function buildMap(tasks) {
  return new Map(tasks.map((t) => [ID(t._id), { ...t, _id: ID(t._id), dependsOn: (t.dependsOn || []).map(ID) }]));
}
const blockers = (task, map) => task.dependsOn.map((id) => map.get(id)).filter((d) => d && d.status !== 'done');
function lockMap(map) {
  const out = {};
  for (const [id, t] of map) out[id] = blockers(t, map).length > 0;
  return out;
}
function childrenIndex(map) {
  const kids = new Map();
  for (const [id, t] of map) for (const d of t.dependsOn) {
    if (!kids.has(d)) kids.set(d, []);
    kids.get(d).push(id);
  }
  return kids;
}
function diffLocks(before, after) {
  const unlocked = [], locked = [];
  for (const id of Object.keys(after)) {
    if (before[id] === true && after[id] === false) unlocked.push(id);
    if (before[id] === false && after[id] === true) locked.push(id);
  }
  return { unlocked, locked };
}

// ---- Cycle detection -------------------------------------------------------
// Adding "taskId depends on depId" creates a loop iff taskId is already
// reachable by walking depId's own dependencies.
function wouldCreateCycle(taskId, newDeps, map) {
  const target = ID(taskId);
  const seen = new Set();
  const stack = newDeps.map(ID);
  while (stack.length) {
    const id = stack.pop();
    if (id === target) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const t = map.get(id);
    if (t) stack.push(...t.dependsOn);
  }
  return false;
}

// ---- Lock propagation ------------------------------------------------------
// A task that stops being "done" invalidates everything downstream of it:
// walk all transitive dependents (BFS) and reset any that already started.
function relockDependents(rootId, map, changes) {
  const kids = childrenIndex(map);
  const queue = [ID(rootId)];
  const seen = new Set(queue);
  while (queue.length) {
    for (const c of kids.get(queue.shift()) || []) {
      if (seen.has(c)) continue;
      seen.add(c);
      const t = map.get(c);
      if (t.status !== 'todo') { t.status = 'todo'; changes.push({ id: c, status: 'todo' }); }
      queue.push(c);
    }
  }
}

function moveTask(tasks, taskId, newStatus) {
  if (!STATUSES.includes(newStatus)) return { ok: false, status: 400, message: 'Status must be todo, inprogress, review or done' };
  const map = buildMap(tasks);
  const task = map.get(ID(taskId));
  if (!task) return { ok: false, status: 404, message: 'Task not found' };
  const before = lockMap(map);

  if (newStatus !== 'todo') {
    const b = blockers(task, map);
    if (b.length) {
      const names = b.map((x) => `"${x.title}"`).join(', ');
      return {
        ok: false, status: 409,
        message: `Blocked: finish ${names} before moving "${task.title}".`,
        blockedBy: b.map((x) => ({ _id: x._id, title: x.title, status: x.status }))
      };
    }
  }
  const changes = [];
  if (task.status !== newStatus) { task.status = newStatus; changes.push({ id: task._id, status: newStatus }); }
  if (newStatus !== 'done') relockDependents(task._id, map, changes);

  const { unlocked, locked } = diffLocks(before, lockMap(map));
  return { ok: true, changes, unlocked, locked, tasks: [...map.values()] };
}

function setDependencies(tasks, taskId, deps) {
  const map = buildMap(tasks);
  const task = map.get(ID(taskId));
  if (!task) return { ok: false, status: 404, message: 'Task not found' };
  const wanted = [...new Set(deps.map(ID))];
  const before = lockMap(map);

  for (const d of wanted) {
    if (d === task._id) return { ok: false, status: 400, message: 'A task cannot depend on itself.' };
    const dep = map.get(d);
    if (!dep) return { ok: false, status: 400, message: 'Dependency must be a task on the same board.' };
    if (wouldCreateCycle(task._id, [d], map)) {
      return { ok: false, status: 400, message: `Circular dependency: "${dep.title}" already depends on "${task.title}", directly or through other tasks.` };
    }
  }
  task.dependsOn = wanted;
  const changes = [];
  // A started task that just gained an unfinished prerequisite goes back to todo.
  if (task.status !== 'todo' && blockers(task, map).length) {
    task.status = 'todo';
    changes.push({ id: task._id, status: 'todo' });
    relockDependents(task._id, map, changes);
  }
  const { unlocked, locked } = diffLocks(before, lockMap(map));
  return { ok: true, dependsOn: wanted, changes, unlocked, locked, tasks: [...map.values()] };
}

function removeTask(tasks, taskId) {
  const map = buildMap(tasks);
  const before = lockMap(map);
  map.delete(ID(taskId));
  for (const t of map.values()) t.dependsOn = t.dependsOn.filter((d) => d !== ID(taskId));
  const { unlocked, locked } = diffLocks(before, lockMap(map));
  return { ok: true, unlocked, locked, tasks: [...map.values()] };
}

// ---- Critical path ---------------------------------------------------------
// Longest chain of remaining work (weights = estimates, done tasks weigh 0),
// found with a topological pass (Kahn) + DP. This is the sequence that sets
// the earliest possible finish date.
function criticalPath(tasks) {
  const map = buildMap(tasks);
  const kids = childrenIndex(map);
  const weight = (t) => (t.status === 'done' ? 0 : t.estimate || 1);
  const indeg = new Map([...map].map(([id, t]) => [id, t.dependsOn.filter((d) => map.has(d)).length]));
  const queue = [...indeg].filter(([, n]) => n === 0).map(([id]) => id);
  const dist = new Map(), prev = new Map();

  while (queue.length) {
    const id = queue.shift();
    const t = map.get(id);
    let best = 0, bp = null;
    for (const d of t.dependsOn) if (map.has(d) && dist.get(d) > (bp ? best : -1)) { best = dist.get(d); bp = d; }
    dist.set(id, weight(t) + (bp ? best : 0));
    prev.set(id, bp);
    for (const c of kids.get(id) || []) {
      indeg.set(c, indeg.get(c) - 1);
      if (indeg.get(c) === 0) queue.push(c);
    }
  }
  let end = null;
  for (const [id, d] of dist) if (map.get(id).status !== 'done' && (end === null || d > dist.get(end))) end = id;
  if (end === null) return { path: [], total: 0 };

  const path = [];
  for (let id = end; id; id = prev.get(id)) path.push(id);
  path.reverse();
  return { path: path.filter((id) => map.get(id).status !== 'done'), total: dist.get(end) };
}

// Shape sent to the frontend: ids as strings + derived lock state.
function withLockState(tasks) {
  const map = buildMap(tasks);
  return [...map.values()].map((t) => {
    const blockedBy = blockers(t, map).map((b) => ({ _id: b._id, title: b.title }));
    return { ...t, locked: blockedBy.length > 0, blockedBy };
  });
}

module.exports = { STATUSES, moveTask, setDependencies, removeTask, criticalPath, withLockState, wouldCreateCycle, buildMap };
