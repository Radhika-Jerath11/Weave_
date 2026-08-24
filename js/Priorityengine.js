/* ==========================================================================
   TaskFlow — Priority Engine
   Pure logic only, same pattern as taskManager.js: takes plain task arrays
   in, returns plain data out. Depends on DependencyGraph and DueDateNotifier
   already being loaded (both pure-logic modules too).

   This does NOT decide "what should the user do" by magic — it scores every
   currently-workable task on four factors that already exist elsewhere in
   the codebase, and returns the highest scorer plus the reasons why.
   ========================================================================== */

const PriorityEngine = (function () {

  const WEIGHTS = {
    downstreamPerTask: 10,   // each task this unlocks, once done
    assignedToYou: 15,
    priority: { HIGH: 10, MEDIUM: 5, LOW: 0 },
    overdue: 25,
    dueTomorrow: 12
  };

  /**
   * Counts how many tasks — directly or indirectly — depend on `taskId`.
   * This is how many tasks finishing `taskId` would eventually unlock.
   *
   * NOTE: this belongs conceptually in DependencyGraph.js (same file that
   * owns wouldCreateCycle/isLocked) since it's graph traversal, not task
   * CRUD. It's included here as a fallback so this module still works
   * stand-alone; once your teammate adds the real one to
   * DependencyGraph.js, delete this fallback and everything below keeps
   * working unchanged, since it's called the same way either way.
   */
  function getDownstreamCount(tasks, taskId) {
    if (window.DependencyGraph && typeof DependencyGraph.getDownstreamCount === 'function') {
      return DependencyGraph.getDownstreamCount(tasks, taskId);
    }

    const visited = new Set();
    const queue = [taskId];

    while (queue.length) {
      const current = queue.shift();
      const dependents = tasks.filter(t => t.dependencies && t.dependencies.includes(current));
      dependents.forEach(dep => {
        if (!visited.has(dep.id)) {
          visited.add(dep.id);
          queue.push(dep.id);
        }
      });
    }

    return visited.size;
  }

  /**
   * Scores a single task. Returns { total, breakdown } where breakdown
   * lists each factor that contributed, in points-descending order —
   * this list is what the "Why this task?" explanation is built from.
   */
  function scoreTask(task, tasks, currentUserName) {
    const breakdown = [];
    let total = 0;

    const downstream = getDownstreamCount(tasks, task.id);
    if (downstream > 0) {
      const pts = downstream * WEIGHTS.downstreamPerTask;
      total += pts;
      breakdown.push({
        points: pts,
        reason: `Completing it unlocks ${downstream} downstream task${downstream === 1 ? '' : 's'}.`
      });
    }

    const isOverdue = window.DueDateNotifier && DueDateNotifier.isOverdue(task.dueDate, task.status);
    const isDueTomorrow = window.DueDateNotifier && DueDateNotifier.isDueTomorrow(task.dueDate);

    if (isOverdue) {
      total += WEIGHTS.overdue;
      breakdown.push({ points: WEIGHTS.overdue, reason: 'It\'s already overdue.' });
    } else if (isDueTomorrow) {
      total += WEIGHTS.dueTomorrow;
      breakdown.push({ points: WEIGHTS.dueTomorrow, reason: 'It\'s due tomorrow.' });
    }

    if (currentUserName && task.assignee === currentUserName) {
      total += WEIGHTS.assignedToYou;
      breakdown.push({ points: WEIGHTS.assignedToYou, reason: 'It\'s assigned to you.' });
    }

    const priorityPts = WEIGHTS.priority[task.priority] || 0;
    if (priorityPts > 0) {
      total += priorityPts;
      breakdown.push({ points: priorityPts, reason: `Marked ${task.priority} priority.` });
    }

    breakdown.sort((a, b) => b.points - a.points);
    return { total, breakdown, downstream, isOverdue, isDueTomorrow };
  }

  /**
   * Returns the single best task to work on right now, or null if there
   * is nothing currently workable (every remaining task is locked or Done).
   *
   * Return shape: { task, total, breakdown, downstream, isOverdue, isDueTomorrow }
   */
  function getNextBestTask(tasks, currentUserName) {
    const candidates = tasks.filter(t =>
      t.status !== 'DONE' &&
      !(window.DependencyGraph && DependencyGraph.isLocked(t, tasks))
    );

    if (candidates.length === 0) return null;

    const scored = candidates.map(task => ({
      task,
      ...scoreTask(task, tasks, currentUserName)
    }));

    scored.sort((a, b) => b.total - a.total);
    return scored[0];
  }

  return { getDownstreamCount, scoreTask, getNextBestTask };
})();