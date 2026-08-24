/* ==========================================================================
   TaskFlow — Team Page
   Groups the current board's tasks by their `assignee` field and shows
   each person's task counts. This is a single-user, single-board view —
   real multi-user login/sync is a planned Phase 2 feature (needs a
   backend), and this page is intentionally scoped to not claim otherwise.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  const currentUser = Storage.getSession();

  if (!currentUser) {
    window.location.href = 'login.html';
    return;
  }

  const tasks = Storage.loadTasks(currentUser);

  function groupByAssignee(tasks) {
    const groups = new Map();
    tasks.forEach(t => {
      const name = (t.assignee || 'Unassigned').trim() || 'Unassigned';
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(t);
    });
    return groups;
  }

  function renderMemberCard(name, memberTasks) {
    const total = memberTasks.length;
    const done = memberTasks.filter(t => t.status === 'DONE').length;
    const locked = memberTasks.filter(t => t.status !== 'DONE' && DependencyGraph.isLocked(t, tasks)).length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    const initial = name.charAt(0).toUpperCase();

    return `
      <div class="member-card">
        <div class="member-header">
          <div class="member-avatar">${initial}</div>
          <div>
            <div class="member-name">${name}</div>
            <div class="member-sub">${total} task${total === 1 ? '' : 's'} assigned</div>
          </div>
        </div>
        <div class="member-stats">
          <div class="member-stat">
            <span class="member-stat-value">${done}</span>
            <span class="member-stat-label">Done</span>
          </div>
          <div class="member-stat">
            <span class="member-stat-value">${total - done}</span>
            <span class="member-stat-label">Open</span>
          </div>
          <div class="member-stat">
            <span class="member-stat-value">${locked}</span>
            <span class="member-stat-label">Locked</span>
          </div>
        </div>
        <div class="member-progress-track">
          <div class="member-progress-fill" style="width:${pct}%;"></div>
        </div>
        <div class="member-progress-pct">${pct}% complete</div>
      </div>
    `;
  }

  const groups = groupByAssignee(tasks);
  const view = document.getElementById('teamView');

  const cardsHtml = groups.size === 0
    ? `<div class="team-empty">No tasks yet — assign a task to someone to see them here.</div>`
    : Array.from(groups.entries()).map(([name, memberTasks]) => renderMemberCard(name, memberTasks)).join('');

  view.innerHTML = `
    <div class="dashboard-header">
      <div>
        <h1 class="page-title">Team</h1>
        <p class="page-subtitle">Task breakdown by assignee for this board.</p>
      </div>
    </div>

    <div class="team-notice">
      Tasks grouped by assignee. Add a name in the Assignee field when
      creating a task to see them appear here.
    </div>

    <div class="team-grid">${cardsHtml}</div>
  `;

  document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    Storage.clearSession();
    window.location.href = 'login.html';
  });
});
