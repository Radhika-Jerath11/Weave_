/* ==========================================================================
   TaskFlow — Dependency Graph Engine
   Pure logic only: no DOM, no localStorage, no UI. Takes plain task arrays
   in, returns plain data out — so this exact file's logic can be reused
   unchanged inside an Express controller in Phase 2.

   Task shape expected: { id, status, dependencies: [id, id, ...] }
   ========================================================================== */

const DependencyGraph = (function () {

  /**
   * Returns true if setting `taskId`'s dependencies to `newDependsOn`
   * would create a cycle anywhere in the graph.
   *
   * How it works: DFS starting from each proposed new dependency, walking
   * *its* dependencies outward. If that walk ever reaches back to `taskId`
   * itself, adding the edge would close a loop, so we reject it.
   */
  function wouldCreateCycle(tasks, taskId, newDependsOn) {
    const byId = new Map(tasks.map(t => [t.id, t]));

    // Self-dependency is a trivial 1-node cycle.
    if (newDependsOn.includes(taskId)) return true;

    const visiting = new Set(); // nodes currently on the DFS path
    const visited = new Set();  // nodes fully explored, known cycle-free from here

    function dfs(currentId) {
      if (currentId === taskId) return true;      // walked back to the origin -> cycle
      if (visited.has(currentId)) return false;    // already proven safe
      if (visiting.has(currentId)) return false;    // a different cycle, not ours to catch here

      visiting.add(currentId);
      const current = byId.get(currentId);
      const deps = current ? (current.dependencies || []) : [];

      for (const depId of deps) {
        if (dfs(depId)) return true;
      }

      visiting.delete(currentId);
      visited.add(currentId);
      return false;
    }

    return newDependsOn.some(depId => dfs(depId));
  }

  /**
   * A task is locked if it has any dependency that is not yet "DONE"
   * (including a dependency that no longer exists, treated as unmet).
   */
  function isLocked(task, tasks) {
    if (!task.dependencies || task.dependencies.length === 0) return false;
    const byId = new Map(tasks.map(t => [t.id, t]));
    return task.dependencies.some(depId => {
      const dep = byId.get(depId);
      return !dep || dep.status !== 'DONE';
    });
  }

  /** Dependencies of `task` that are not yet Done — used for the UI's error message. */
  function getUnmetDependencies(task, tasks) {
    if (!task.dependencies) return [];
    const byId = new Map(tasks.map(t => [t.id, t]));
    return task.dependencies
      .map(depId => byId.get(depId))
      .filter(dep => dep && dep.status !== 'DONE');
  }

  /**
   * Recomputes locked status for every task. Called after any status
   * change, since unlocking one task can cascade to unlock others that
   * depend on it. Returns a Map<taskId, boolean>.
   *
   * Implementation note: this recomputes from scratch each call rather
   * than an incremental reverse-dependency BFS. For a coursework-scale
   * board this is O(n * avgDeps) and effectively instant; the reverse-map
   * + BFS approach is a valid optimization to mention as a Phase 2
   * improvement if asked in viva, but isn't required for correctness here.
   */
  function recomputeLocks(tasks) {
    const result = new Map();
    tasks.forEach(t => result.set(t.id, isLocked(t, tasks)));
    return result;
  }

  return { wouldCreateCycle, isLocked, getUnmetDependencies, recomputeLocks };
})();
