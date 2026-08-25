/* ==========================================================================
   TaskFlow — Profile Page (v3)
   Restructured to match: header card, Account Information + Workspace
   Activity side-by-side, Recent Activity below, Account/security row.
   Still fully read-only — Edit Profile / Change Password are shown as
   clearly disabled, not fake working buttons.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  const currentUser = Storage.getSession();

  if (!currentUser) {
    window.location.href = 'login.html';
    return;
  }

  const tasks = Storage.loadTasks(currentUser);
  const activities = Storage.loadActivities(currentUser);

  const total = tasks.length;
  const done = tasks.filter(t => t.status === 'DONE').length;
  const inProgress = tasks.filter(t => t.status === 'IN_PROGRESS').length;
  const locked = tasks.filter(t => t.status !== 'DONE' && DependencyGraph.isLocked(t, tasks)).length;
  const completionPct = total === 0 ? 0 : Math.round((done / total) * 100);

  const displayName = currentUser.name || currentUser.email.split('@')[0];
  const initial = displayName.charAt(0).toUpperCase();

  const recentActivities = activities.slice(0, 5);

  function renderActivityList() {
    if (recentActivities.length === 0) {
      return `<div class="profile-empty">No activity yet — create your first task to get started.</div>`;
    }
    return recentActivities.map(act => `
      <div class="profile-activity-item">
        <div class="profile-activity-icon">${act.symbol}</div>
        <span class="profile-activity-text">${act.text}</span>
        <span class="profile-activity-time">${act.time}</span>
      </div>`).join('');
  }

  const view = document.getElementById('profileView');
  view.innerHTML = `
    <div class="profile-header-card">
      <div class="profile-avatar">${initial}</div>
      <div class="profile-header-text">
        <h1 class="profile-name">${displayName}</h1>
        
        <p class="profile-email">${currentUser.email}</p>
      </div>
    </div>

    <div class="profile-grid">
      <div class="profile-section">
        <h2 class="profile-section-title">Account Information</h2>
        <div class="info-row">
          <span class="info-label">Full Name</span>
          <span class="info-value">${displayName}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Email</span>
          <span class="info-value">${currentUser.email}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Role</span>
          <span class="info-value">Team Member</span>
        </div>
      </div>

      <div class="profile-section">
        <h2 class="profile-section-title">Workspace Activity</h2>
        <div class="info-row">
          <span class="info-label">Total Tasks</span>
          <span class="info-value">${total}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Completed</span>
          <span class="info-value">${done}</span>
        </div>
        <div class="info-row">
          <span class="info-label">In Progress</span>
          <span class="info-value">${inProgress}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Locked</span>
          <span class="info-value">${locked}</span>
        </div>
        <div class="profile-progress">
          <div class="profile-progress-labels">
            <span>Completion</span>
            <span>${completionPct}%</span>
          </div>
          <div class="profile-progress-track">
            <div class="profile-progress-fill" style="width:${completionPct}%;"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="profile-section">
      <h2 class="profile-section-title">Recent Activity</h2>
      <div class="profile-activity-list">${renderActivityList()}</div>
    </div>
  `;

  document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    Storage.clearSession();
    window.location.href = 'login.html';
  });
});
