const assert = require('assert');
const E = require('../utils/engine');

const T = (id, title, status = 'todo', dependsOn = [], estimate = 1) => ({ _id: id, title, status, dependsOn, estimate });
const byId = (tasks, id) => tasks.find((t) => t._id === id);
let n = 0;
const test = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

// A <- B <- C   (B needs A, C needs B)
const chain = () => [T('A', 'Schema'), T('B', 'API', 'todo', ['A']), T('C', 'UI', 'todo', ['B'])];

test('blocks moving a task whose dependency is not done', () => {
  const r = E.moveTask(chain(), 'B', 'inprogress');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.blockedBy[0]._id, 'A');
});
test('blocks jumping straight to done too', () => {
  assert.strictEqual(E.moveTask(chain(), 'B', 'done').ok, false);
});
test('finishing a dependency unlocks its dependent', () => {
  const r = E.moveTask(chain(), 'A', 'done');
  assert.ok(r.ok);
  assert.deepStrictEqual(r.unlocked, ['B']);
  assert.strictEqual(E.withLockState(r.tasks).find((t) => t._id === 'C').locked, true);
});
test('un-doing a dependency re-locks and resets the whole downstream chain', () => {
  let tasks = chain();
  tasks = E.moveTask(tasks, 'A', 'done').tasks;
  tasks = E.moveTask(tasks, 'B', 'done').tasks;
  tasks = E.moveTask(tasks, 'C', 'inprogress').tasks;
  const r = E.moveTask(tasks, 'A', 'todo');
  assert.ok(r.ok);
  assert.strictEqual(byId(r.tasks, 'B').status, 'todo');
  assert.strictEqual(byId(r.tasks, 'C').status, 'todo');
  assert.ok(r.locked.includes('B'));
});
test('review column is also blocked while a dependency is unfinished', () => {
  assert.strictEqual(E.moveTask(chain(), 'B', 'review').status, 409);
});
test('moving a done task back to review re-locks its dependents', () => {
  let tasks = E.moveTask(chain(), 'A', 'done').tasks;
  tasks = E.moveTask(tasks, 'B', 'done').tasks;
  const r = E.moveTask(tasks, 'B', 'review');
  assert.ok(r.locked.includes('C'));
});
test('rejects an unknown status', () => {
  assert.strictEqual(E.moveTask(chain(), 'A', 'archived').status, 400);
});
test('cycle detection: self dependency', () => {
  assert.strictEqual(E.setDependencies(chain(), 'A', ['A']).ok, false);
});
test('cycle detection: indirect loop A -> C', () => {
  const r = E.setDependencies(chain(), 'A', ['C']);
  assert.strictEqual(r.ok, false);
  assert.match(r.message, /Circular/);
});
test('valid dependency is accepted and saved', () => {
  const r = E.setDependencies(chain(), 'C', ['A', 'B']);
  assert.ok(r.ok);
  assert.deepStrictEqual(r.dependsOn, ['A', 'B']);
});
test('adding an unfinished prerequisite demotes a started task', () => {
  const tasks = [T('A', 'A'), T('B', 'B', 'inprogress')];
  const r = E.setDependencies(tasks, 'B', ['A']);
  assert.strictEqual(byId(r.tasks, 'B').status, 'todo');
});
test('deleting a dependency unlocks dependents', () => {
  const r = E.removeTask(chain(), 'A');
  assert.deepStrictEqual(r.unlocked, ['B']);
});
test('critical path follows the longest chain of remaining work', () => {
  // A(1) -> B(5) -> D(1)   and   A -> C(2) -> D
  const tasks = [T('A', 'A', 'todo', [], 1), T('B', 'B', 'todo', ['A'], 5), T('C', 'C', 'todo', ['A'], 2), T('D', 'D', 'todo', ['B', 'C'], 1)];
  const cp = E.criticalPath(tasks);
  assert.deepStrictEqual(cp.path, ['A', 'B', 'D']);
  assert.strictEqual(cp.total, 7);
});
test('critical path ignores finished work', () => {
  const tasks = [T('A', 'A', 'done', [], 4), T('B', 'B', 'todo', ['A'], 2)];
  const cp = E.criticalPath(tasks);
  assert.deepStrictEqual(cp.path, ['B']);
  assert.strictEqual(cp.total, 2);
});
console.log(`\n${n} engine tests passed`);
