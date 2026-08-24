/* ==========================================================================
   TaskFlow — Impact Predictor
   Pure logic, same pattern as DependencyGraph/TaskManager/PriorityEngine:
   plain task arrays in, plain data out. No DOM.

   Answers: "If this task is delayed by N days, what does that affect?"
   This is the SAME forward-walk used for lock propagation and the
   Priority Engine's downstream count — here it carries a delay value
   forward through the chain instead of a lock boolean or an unlock count.
   ========================================================================== */

const ImpactPredictor = (function () {

  /**
   * Walks forward from `taskId` through every task that (directly or
   * indirectly) depends on it, carrying `delayDays` forward unchanged
   * at each step (a delay upstream delays everything downstream by at
   * least that much).
   *
   * Returns:
   *   originId       - the task the delay started from
   *   delayDays       - the delay being simulated
   *   chain           - ordered list of { task, delay }, in the order
   *                      the ripple reaches them (BFS order)
   *   affectedCount    - chain.length
   *   peopleAffected   - unique assignee names across the affected chain
   *   atRiskTasks      - tasks in the chain that nothing else in the
   *                      chain depends on, i.e. the "end points" most
   *                      likely to actually miss their own deadline
   */
  function calculateImpact(tasks, taskId, delayDays) {
    const chain = [];
    const visited = new Set([taskId]);
    const queue = [taskId];

    while (queue.length) {
      const current = queue.shift();
      const dependents = tasks.filter(t => t.dependencies && t.dependencies.includes(current));

      dependents.forEach(dep => {
        if (visited.has(dep.id)) return;
        visited.add(dep.id);
        chain.push({ task: dep, delay: delayDays });
        queue.push(dep.id);
      });
    }

    const affected = chain.map(c => c.task);
    const involvedIds = new Set([taskId, ...affected.map(t => t.id)]);

    const atRiskTasks = affected.filter(t => {
      const hasDownstreamInChain = tasks.some(other =>
        involvedIds.has(other.id) &&
        other.dependencies &&
        other.dependencies.includes(t.id)
      );
      return !hasDownstreamInChain;
    });

    const peopleAffected = [...new Set(affected.map(t => t.assignee).filter(Boolean))];

    return {
      originId: taskId,
      delayDays,
      chain,
      affectedCount: affected.length,
      peopleAffected,
      atRiskTasks
    };
  }

  return { calculateImpact };
})();