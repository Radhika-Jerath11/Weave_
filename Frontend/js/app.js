/* ==========================================================================
   Weave — Application Controller (REST API + Socket.IO edition)
   Tasks, dependencies and the activity feed live in MongoDB. The server is
   the authority on locking; this file only renders what the server returns.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {

  // Signed in after clicking an email invite? Finish accepting it first.
  if (Weave.isLoggedIn() && sessionStorage.getItem('weaveInviteToken')) {
    window.location.replace('accept-invite.html');
    return;
  }

  // 1. Session + state ------------------------------------------------------
  const currentUser = Weave.isLoggedIn() ? Weave.user() : null;
  const displayName = currentUser ? (currentUser.name || currentUser.email.split('@')[0]) : '';

  let board = null;
  let socket = null;
  let tasks = [];
  let activities = [];
  let currentSearch = '';
  let editingTaskId = null;
  let currentDetailsTaskId = null;

  const STATUS_TO_UI = { todo: 'TODO', inprogress: 'IN_PROGRESS', review: 'REVIEW', done: 'DONE' };
  const STATUS_TO_API = { TODO: 'todo', IN_PROGRESS: 'inprogress', REVIEW: 'review', DONE: 'done' };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function timeAgo(d) {
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 45) return 'Just now';
    const m = Math.round(s / 60);
    if (m < 60) return m + ' min ago';
    const h = Math.round(m / 60);
    if (h < 24) return h + ' hr ago';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // Server task -> the shape the rest of the UI code (PriorityEngine,
  // ImpactPredictor, GraphView, TaskManager) already understands.
  function fromServer(t) {
    return {
      id: t._id,
      title: t.title,
      description: t.description || '',
      assignee: t.assignee || '',
      priority: t.priority || 'MEDIUM',
      dueDate: t.dueDate || '',
      status: STATUS_TO_UI[t.status] || 'TODO',
      dependencies: t.dependsOn || [],
      estimate: t.estimate || 1,
      createdAt: t.createdAt,
      completedAt: t.completedAt
        ? new Date(t.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : null
    };
  }
  const toActivity = (a) => ({ icon: a.icon, symbol: a.symbol, text: a.text, time: timeAgo(a.createdAt) });

  // One place to apply any server response (REST reply or live socket push).
  function applyServerState(data) {
    if (data.tasks) tasks = data.tasks.map(fromServer);
    if (data.activities) activities = data.activities.map(toActivity);
    renderKanbanBoard(currentSearch);
    renderDependencyTree();
    renderGraphView();
    renderActivity();
    renderActivityFull();
    updateNotifBadge();
  }

  function showFormError(message) {
    const el = document.getElementById('taskFormError');
    if (!el) return;
    el.textContent = message || '';
    el.style.display = message ? 'block' : 'none';
  }

  // 2. Auth State Sync ------------------------------------------------------
  function updateAuthNavbar() {
    const navAuth = document.getElementById('navAuthActions');
    const navUser = document.getElementById('navUserGroup');
    const navAvatar = document.getElementById('navUserAvatar');
    const navName = document.getElementById('navUserName');
    const sidebarLogout = document.getElementById('sidebarLogoutItem');
    const welcomeTitle = document.getElementById('welcomeTitle');

    if (currentUser) {
      if (navAuth) navAuth.style.display = 'none';
      if (navUser) navUser.style.display = 'flex';
      if (sidebarLogout) sidebarLogout.style.display = 'block';
      if (navName) navName.textContent = displayName;
      if (navAvatar) navAvatar.textContent = displayName.charAt(0).toUpperCase();
      if (welcomeTitle) welcomeTitle.textContent = `${displayName}'s Board`;
      const assigneeInput = document.getElementById('taskAssignee');
      if (assigneeInput) assigneeInput.value = displayName;
    } else {
      if (navAuth) navAuth.style.display = 'flex';
      if (navUser) navUser.style.display = 'none';
      if (sidebarLogout) sidebarLogout.style.display = 'none';
      if (welcomeTitle) welcomeTitle.textContent = 'Dashboard';
    }
  }

  DueDateNotifier.requestPermission();

  document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (socket) socket.disconnect();
    Weave.logout();
    window.location.href = 'login.html';
  });

  // 2b. Notifications Dropdown ----------------------------------------------
  const notifBtn = document.getElementById('notifBtn');
  const notifDropdown = document.getElementById('notifDropdown');
  const notifBadge = document.getElementById('notifBadge');

  function getDueNotifications() {
    const overdue = DueDateNotifier.getOverdueTasks(tasks).map(t => ({
      icon: 'icon-blocked', symbol: '⚠', text: `"${esc(t.title)}" is overdue`
    }));
    const dueTomorrow = DueDateNotifier.getTasksDueTomorrow(tasks).map(t => ({
      icon: 'icon-blocked', symbol: '⏰', text: `"${esc(t.title)}" is due tomorrow`
    }));
    return [...overdue, ...dueTomorrow];
  }

  function renderNotifDropdown() {
    const list = document.getElementById('notifDropdownList');
    if (!list) return;
    const items = getDueNotifications();
    if (items.length === 0) {
      list.innerHTML = `<div class="notif-dropdown-empty">No due or overdue tasks right now.</div>`;
      return;
    }
    list.innerHTML = items.map(item => `
      <div class="activity-item">
        <div class="activity-main">
          <div class="activity-icon ${item.icon}">${item.symbol}</div>
          <span class="activity-text">${item.text}</span>
        </div>
      </div>
    `).join('');
  }

  function updateNotifBadge() {
    if (!notifBadge) return;
    notifBadge.classList.toggle('hidden', getDueNotifications().length === 0);
  }

  if (notifBtn && notifDropdown) {
    notifBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const opening = !notifDropdown.classList.contains('open');
      notifDropdown.classList.toggle('open', opening);
      if (opening) renderNotifDropdown();
    });
    document.addEventListener('click', (e) => {
      if (!notifDropdown.contains(e.target) && e.target !== notifBtn) {
        notifDropdown.classList.remove('open');
      }
    });
  }

  // 3. Sidebar Toggle Handler -----------------------------------------------
  const menuToggle = document.getElementById('menuToggle');
  const sidebar = document.getElementById('sidebar');
  const mainContent = document.querySelector('.main-content');

  if (menuToggle) {
    menuToggle.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        sidebar?.classList.toggle('mobile-open');
      } else {
        sidebar?.classList.toggle('collapsed');
        mainContent?.classList.toggle('expanded');
      }
    });
  }

  // 4. Dependency state (display only: the server enforces the rules) ------
  function isTaskLocked(task) {
    if (!task.dependencies || task.dependencies.length === 0) return false;
    return task.dependencies.some(depId => {
      const depTask = tasks.find(t => t.id === depId);
      return !depTask || depTask.status !== 'DONE';
    });
  }

  function getUnmetDependencies(task) {
    if (!task.dependencies) return [];
    return task.dependencies
      .map(depId => tasks.find(t => t.id === depId))
      .filter(depTask => depTask && depTask.status !== 'DONE');
  }

  function updateSummaryStats() {
    const n = (s) => tasks.filter(t => t.status === s).length;
    document.getElementById('statTotal').textContent = tasks.length;
    document.getElementById('statTodo').textContent = n('TODO');
    document.getElementById('statInProgress').textContent = n('IN_PROGRESS');
    document.getElementById('statDone').textContent = n('DONE');
    document.getElementById('countTodo').textContent = n('TODO');
    document.getElementById('countInProgress').textContent = n('IN_PROGRESS');
    document.getElementById('countReview').textContent = n('REVIEW');
    document.getElementById('countDone').textContent = n('DONE');
  }

  // Priority engine card ---------------------------------------------------
  function renderPriorityCard() {
    const card = document.getElementById('priorityCard');
    if (!card || !currentUser) return;

    const best = PriorityEngine.getNextBestTask(tasks, displayName);
    if (!best) { card.style.display = 'none'; return; }

    card.style.display = 'block';
    document.getElementById('priorityTaskTitle').textContent = best.task.title;

    const tags = ['<span class="priority-tag ready">🔓 Ready</span>'];
    if (best.downstream > 0) tags.push('<span class="priority-tag impact">⚡ High impact</span>');
    if (best.task.assignee === displayName) tags.push('<span class="priority-tag you">👤 Assigned to you</span>');
    if (best.isOverdue) tags.push('<span class="priority-tag overdue">🔴 Overdue</span>');
    else if (best.isDueTomorrow) tags.push('<span class="priority-tag due">⏰ Due tomorrow</span>');
    document.getElementById('priorityTaskTags').innerHTML = tags.join('');

    document.getElementById('priorityWhyList').innerHTML = best.breakdown.length
      ? best.breakdown.map(b => `<li>${b.reason}</li>`).join('')
      : '<li>It\'s ready to start and nothing is blocking it.</li>';

    const startBtn = document.getElementById('startPriorityTaskBtn');
    if (startBtn) startBtn.onclick = () => openTaskDetailsModal(best.task);
  }

  function renderKanbanBoard(searchTerm = '') {
    currentSearch = searchTerm;
    const columns = {
      TODO: document.getElementById('colTodo'),
      IN_PROGRESS: document.getElementById('colInProgress'),
      REVIEW: document.getElementById('colReview'),
      DONE: document.getElementById('colDone')
    };
    Object.values(columns).forEach(col => { if (col) col.innerHTML = ''; });

    const q = searchTerm.toLowerCase();
    const filtered = tasks.filter(t =>
      t.title.toLowerCase().includes(q) ||
      (t.description && t.description.toLowerCase().includes(q))
    );

    filtered.forEach(task => {
      const card = createTaskCard(task);
      if (columns[task.status]) columns[task.status].appendChild(card);
    });

    Object.keys(columns).forEach(status => {
      const container = columns[status];
      if (container && container.children.length === 0) {
        container.innerHTML = `
          <div class="empty-column">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            <span>No tasks here</span>
          </div>
        `;
      }
    });

    updateSummaryStats();
    renderPriorityCard();
  }

  function createTaskCard(task) {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.setAttribute('draggable', 'true');
    card.dataset.id = task.id;

    const locked = isTaskLocked(task);
    const isDone = task.status === 'DONE';

    if (isDone) card.classList.add('is-done');
    else if (locked) card.classList.add('is-locked');
    else if (task.dependencies && task.dependencies.length > 0) card.classList.add('is-unlocked');

    const statusBadge = isDone
      ? `<span class="badge badge-done">✓ DONE</span>`
      : locked
      ? `<span class="badge badge-locked">🔒 LOCKED</span>`
      : task.dependencies?.length > 0
      ? `<span class="badge badge-ready">🔓 READY</span>`
      : '';

    let dependencyHtml = '';
    if (task.dependencies && task.dependencies.length > 0) {
      const items = task.dependencies.map(depId => {
        const dTask = tasks.find(t => t.id === depId);
        if (!dTask) return '';
        const met = dTask.status === 'DONE';
        return `<div class="dep-item ${met ? 'met' : 'unmet'}"><span>${met ? '✓' : '❌'}</span><span>${esc(dTask.title)}</span></div>`;
      }).join('');
      dependencyHtml = `<div class="card-dependencies"><div class="dep-label">Depends on:</div>${items}</div>`;
    }

    const formattedDate = task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No date';
    const initial = (task.assignee || 'U').charAt(0).toUpperCase();

    card.innerHTML = `
      <div class="task-card-header"><h4 class="task-title">${esc(task.title)}</h4>${statusBadge}</div>
      <p class="task-desc">${esc(task.description) || 'No description provided.'}</p>
      ${dependencyHtml}
      <div class="task-card-footer">
        <div style="display:flex;gap:6px;align-items:center;">
          <span class="badge badge-priority-${task.priority}">${task.priority}</span>
          <span class="task-date">${isDone && task.completedAt ? 'Completed ' + task.completedAt : formattedDate}</span>
        </div>
        <div class="avatar" style="width:24px;height:24px;font-size:0.75rem;">${esc(initial)}</div>
      </div>
    `;

    card.addEventListener('dragstart', (e) => {
      card.classList.add('dragging');
      e.dataTransfer.setData('text/plain', task.id);
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('click', () => openTaskDetailsModal(task));

    return card;
  }

  function activityRows() {
    return activities.map(act => `
      <div class="activity-item">
        <div class="activity-main">
          <div class="activity-icon ${act.icon}">${act.symbol}</div>
          <span class="activity-text">${esc(act.text)}</span>
        </div>
        <span class="activity-time">${act.time}</span>
      </div>
    `).join('');
  }

  function renderActivity() {
    const list = document.getElementById('activityList');
    if (!list) return;
    list.innerHTML = activities.length === 0
      ? `<div style="color:var(--text-muted);font-size:0.85rem;padding:8px 0;">No recent activities yet. Start by creating a task!</div>`
      : activityRows();
  }

  function renderActivityFull() {
    const list = document.getElementById('activityListFull');
    if (!list) return;
    list.innerHTML = activities.length === 0
      ? `<div style="color:var(--text-muted);font-size:0.85rem;padding:8px 0;">No activity yet. Actions like creating, editing, moving, and deleting tasks will show up here.</div>`
      : activityRows();
  }

  function renderDependencyTree() {
    const container = document.getElementById('dependencyTree');
    if (!container) return;

    if (tasks.length === 0) {
      container.innerHTML = `<div style="color:var(--text-muted);text-align:center;">No tasks created yet.</div>`;
      return;
    }

    container.innerHTML = tasks.map(task => {
      const locked = isTaskLocked(task);
      const isDone = task.status === 'DONE';
      const stateBadge = isDone
        ? `<span class="badge badge-done">✓ DONE</span>`
        : locked
        ? `<span class="badge badge-locked">🔒 LOCKED</span>`
        : `<span class="badge badge-ready">🔓 READY</span>`;

      const deps = (task.dependencies || []).map(dId => {
        const dt = tasks.find(t => t.id === dId);
        return dt ? esc(dt.title) : '';
      }).filter(Boolean).join(', ') || 'None';

      return `
        <div class="dep-node-row">
          <div class="dep-node-title">${esc(task.title)}</div>
          <div>${stateBadge}</div>
          <div class="dep-arrow">← Prerequisite Tasks:</div>
          <div style="font-size:0.9rem;color:var(--text-muted);">${deps}</div>
        </div>
      `;
    }).join('');
  }

  function renderGraphView() {
    const container = document.getElementById('dependencyGraphView');
    if (container) GraphView.render(container, tasks, isTaskLocked);
  }

  function showToast(title, message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = '<div class="toast-title"></div><div class="toast-message"></div>';
    toast.querySelector('.toast-title').textContent = title;
    toast.querySelector('.toast-message').textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  const offlineMsg = "Can't reach the server — is the backend running?";
  const errText = (err) => (err.status === undefined ? offlineMsg : err.message);

  // 5. Drag and Drop: the SERVER decides whether a move is allowed ----------
  document.querySelectorAll('.task-list').forEach(col => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      col.classList.add('drag-over');
    });
    col.addEventListener('dragleave', () => col.classList.remove('drag-over'));

    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('drag-over');

      const draggedId = e.dataTransfer.getData('text/plain');
      if (!draggedId) return;

      const targetStatus = col.parentElement.dataset.status;
      const task = tasks.find(t => t.id === draggedId);
      if (!task || task.status === targetStatus) return;

      if (task.status === 'DONE' && targetStatus !== 'DONE') {
        showToast('Task Completed', `'${task.title}' is already Done and can't be moved back.`);
        return;
      }

      try {
        applyServerState(await Weave.moveTask(draggedId, STATUS_TO_API[targetStatus]));
      } catch (err) {
        if (err.status === 409) {
          showToast('Task Locked', err.message);                 // message comes from the server
          if (err.data?.activities) applyServerState({ activities: err.data.activities });
        } else {
          showToast('Could not move task', errText(err));
        }
      }
    });
  });

  // 6. Create / Edit Task Modal --------------------------------------------
  const createModal = document.getElementById('createTaskModal');
  const openCreateBtn = document.getElementById('openCreateModalBtn');
  const detailsModal = document.getElementById('taskDetailsModal');
  const detailsBody = document.getElementById('detailsModalBody');

  if (openCreateBtn) {
    openCreateBtn.addEventListener('click', () => {
      if (!currentUser) { window.location.href = 'login.html'; return; }
      editingTaskId = null;
      document.getElementById('createModalTitle').textContent = 'Create New Task';
      document.getElementById('taskFormSubmitBtn').textContent = 'Create Task';
      showFormError(null);
      document.getElementById('createTaskForm')?.reset();
      document.getElementById('taskAssignee').value = displayName;

      const selector = document.getElementById('dependencySelector');
      if (selector) {
        selector.innerHTML = tasks.length === 0
          ? `<span style="font-size:0.8rem;color:var(--text-muted);padding:4px;">No prerequisite tasks yet.</span>`
          : tasks.map(t => `<label class="checkbox-option"><input type="checkbox" name="deps" value="${t.id}"><span>${esc(t.title)} (${t.status})</span></label>`).join('');
      }
      createModal?.classList.add('active');
    });
  }

  function openEditModal(task) {
    editingTaskId = task.id;
    document.getElementById('createModalTitle').textContent = 'Edit Task';
    document.getElementById('taskFormSubmitBtn').textContent = 'Save Changes';
    showFormError(null);

    document.getElementById('taskTitle').value = task.title;
    document.getElementById('taskDesc').value = task.description || '';
    document.getElementById('taskAssignee').value = task.assignee || '';
    document.getElementById('taskPriority').value = task.priority;
    document.getElementById('taskDueDate').value = task.dueDate || '';
    document.getElementById('taskStatus').value = task.status;

    const selector = document.getElementById('dependencySelector');
    const otherTasks = tasks.filter(t => t.id !== task.id);
    if (selector) {
      selector.innerHTML = otherTasks.length === 0
        ? `<span style="font-size:0.8rem;color:var(--text-muted);padding:4px;">No other tasks to depend on yet.</span>`
        : otherTasks.map(t => {
            const checked = task.dependencies && task.dependencies.includes(t.id) ? 'checked' : '';
            return `<label class="checkbox-option"><input type="checkbox" name="deps" value="${t.id}" ${checked}><span>${esc(t.title)} (${t.status})</span></label>`;
          }).join('');
    }

    detailsModal?.classList.remove('active');
    createModal?.classList.add('active');
  }

  async function deleteTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const dependents = TaskManager.getDependents(tasks, taskId);
    if (dependents.length > 0) {
      const names = dependents.map(t => `'${t.title}'`).join(', ');
      showToast('Cannot Delete', `${names} still depend${dependents.length === 1 ? 's' : ''} on this task. Remove that dependency first.`);
      return;
    }
    if (!window.confirm(`Delete '${task.title}'? This can't be undone.`)) return;

    try {
      applyServerState(await Weave.deleteTask(taskId));
      detailsModal?.classList.remove('active');
    } catch (err) {
      showToast('Could not delete task', errText(err));
    }
  }

  function closeCreate() {
    createModal?.classList.remove('active');
    document.getElementById('createTaskForm')?.reset();
    showFormError(null);
    editingTaskId = null;
    document.getElementById('createModalTitle').textContent = 'Create New Task';
    document.getElementById('taskFormSubmitBtn').textContent = 'Create Task';
  }

  document.getElementById('closeCreateModalBtn')?.addEventListener('click', closeCreate);
  document.getElementById('cancelCreateModalBtn')?.addEventListener('click', closeCreate);

  document.getElementById('createTaskForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!board) { showFormError(offlineMsg); return; }

    const titleVal = document.getElementById('taskTitle').value;
    const assigneeVal = document.getElementById('taskAssignee')?.value || displayName;

    const errorMsg = TaskManager.validate(tasks, titleVal, assigneeVal, editingTaskId);
    if (errorMsg) { showFormError(errorMsg); return; }
    showFormError(null);

    const selectedDeps = Array.from(document.querySelectorAll('input[name="deps"]:checked')).map(cb => cb.value);
    const fields = {
      title: titleVal,
      description: document.getElementById('taskDesc').value,
      assignee: assigneeVal,
      priority: document.getElementById('taskPriority').value,
      dueDate: document.getElementById('taskDueDate').value
    };
    const wantedStatus = document.getElementById('taskStatus').value;

    const submitBtn = document.getElementById('taskFormSubmitBtn');
    submitBtn.disabled = true;
    try {
      if (editingTaskId) {
        const existing = tasks.find(t => t.id === editingTaskId);
        const sameDeps = JSON.stringify([...existing.dependencies].sort()) === JSON.stringify([...selectedDeps].sort());
        let res;
        // The server runs cycle detection here and rejects loops with a clear message.
        if (!sameDeps) res = await Weave.setDependencies(editingTaskId, selectedDeps);
        res = await Weave.updateTask(editingTaskId, fields);
        if (existing.status !== wantedStatus) res = await Weave.moveTask(editingTaskId, STATUS_TO_API[wantedStatus]);
        applyServerState(res);
      } else {
        let res = await Weave.createTask(board._id, { ...fields, dependsOn: selectedDeps });
        if (wantedStatus !== 'TODO') {
          try { res = await Weave.moveTask(res.task._id, STATUS_TO_API[wantedStatus]); }
          catch (err) { showToast('Created in TODO', err.message); }   // e.g. it is locked
        }
        applyServerState(res);
      }
      closeCreate();
    } catch (err) {
      showFormError(errText(err));
    } finally {
      submitBtn.disabled = false;
    }
  });

  // 7. Task Details Modal + Impact Predictor --------------------------------
  function renderImpactResults(result) {
    const container = document.getElementById('impactResults');
    if (!container) return;

    if (result.chain.length === 0) {
      container.innerHTML = `<div class="impact-empty">Nothing currently depends on this task — a delay here wouldn't cascade to anything else.</div>`;
      return;
    }

    const chainHtml = result.chain.map(c => `
      <div class="impact-chain-row">
        <span class="impact-arrow">↓ +${c.delay}d</span>
        <span class="impact-task-name">${esc(c.task.title)}</span>
      </div>
    `).join('');

    const atRiskNames = result.atRiskTasks.map(t => esc(t.title)).join(', ') || 'Nothing further';

    container.innerHTML = `
      <div class="impact-chain">${chainHtml}</div>
      <div class="impact-summary">
        <div class="impact-stat impact-stat-danger">🔴 Project delay: ${result.delayDays} day${result.delayDays === 1 ? '' : 's'}</div>
        <div class="impact-stat">⚠ ${result.affectedCount} task${result.affectedCount === 1 ? '' : 's'} affected</div>
        <div class="impact-stat">👥 ${result.peopleAffected.length} ${result.peopleAffected.length === 1 ? 'person' : 'people'} affected</div>
        <div class="impact-stat">🎯 ${atRiskNames} at risk</div>
      </div>
    `;
  }

  function getStatusBadge(task, locked) {
    if (task.status === 'DONE') return { cls: 'badge-done', label: '✓ DONE' };
    if (task.status === 'IN_PROGRESS') return { cls: 'badge-inprogress', label: '🚧 IN PROGRESS' };
    if (task.status === 'REVIEW') return { cls: 'badge-review', label: '👀 IN REVIEW' };
    return locked ? { cls: 'badge-locked', label: '🔒 LOCKED' } : { cls: 'badge-ready', label: '🔓 READY' };
  }

  function openTaskDetailsModal(task) {
    if (!detailsBody) return;
    currentDetailsTaskId = task.id;
    const locked = isTaskLocked(task);
    const isDone = task.status === 'DONE';
    const unmet = getUnmetDependencies(task).map(u => `'${esc(u.title)}'`).join(', ');
    const statusBadge = getStatusBadge(task, locked);

    detailsBody.innerHTML = `
      <div style="margin-bottom:12px;">
        <span class="badge badge-priority-${task.priority}">${task.priority} PRIORITY</span>
        <span class="badge ${statusBadge.cls}" style="margin-left:8px;">${statusBadge.label}</span>
      </div>
      <h3 style="font-family:var(--font-serif);font-size:1.3rem;margin-bottom:8px;">${esc(task.title)}</h3>
      <p style="color:var(--text-muted);font-size:0.9rem;margin-bottom:16px;">${esc(task.description) || 'No description provided.'}</p>
      ${locked && task.status === 'TODO' ? `<div class="warning-box"><strong>Cannot move to In Progress</strong><br>Complete ${unmet} first.</div>` : ''}
      ${!isDone ? `
        <div class="impact-simulator">
          <div class="impact-simulator-header">🔮 Simulate a delay</div>
          <div class="impact-simulator-controls">
            <input type="number" id="impactDelayInput" min="1" max="60" value="2" class="form-control" style="width:80px;display:inline-block;">
            <span style="font-size:0.85rem;color:var(--text-muted);">days</span>
            <button type="button" class="btn btn-secondary btn-sm" id="runImpactBtn">Calculate Impact</button>
          </div>
          <div id="impactResults"></div>
        </div>
      ` : ''}
    `;

    document.getElementById('runImpactBtn')?.addEventListener('click', () => {
      const days = Math.max(1, parseInt(document.getElementById('impactDelayInput').value, 10) || 1);
      renderImpactResults(ImpactPredictor.calculateImpact(tasks, task.id, days));
    });

    detailsModal?.classList.add('active');
  }

  document.getElementById('closeDetailsModalBtn')?.addEventListener('click', () => detailsModal?.classList.remove('active'));
  document.getElementById('closeDetailsModalFooterBtn')?.addEventListener('click', () => detailsModal?.classList.remove('active'));

  document.getElementById('editTaskBtn')?.addEventListener('click', () => {
    const task = tasks.find(t => t.id === currentDetailsTaskId);
    if (task) openEditModal(task);
  });
  document.getElementById('deleteTaskBtn')?.addEventListener('click', () => {
    if (currentDetailsTaskId) deleteTask(currentDetailsTaskId);
  });

  // 8. Search and Navigation ------------------------------------------------
  document.getElementById('searchInput')?.addEventListener('input', (e) => renderKanbanBoard(e.target.value));

  document.querySelectorAll('.nav-item[data-target]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      const target = item.dataset.target;
      document.querySelectorAll('.content-view').forEach(view => view.classList.remove('active'));

      if (target === 'dependencies') {
        document.getElementById('view-dependencies')?.classList.add('active');
        renderDependencyTree();
        renderGraphView();
      } else if (target === 'activity') {
        document.getElementById('view-activity')?.classList.add('active');
        renderActivityFull();
      } else {
        document.getElementById('view-dashboard')?.classList.add('active');
      }
    });
  });

  // 9. Live updates (Socket.IO) ---------------------------------------------
  // Fires for every change on this board, including ones made in another tab.
  function onLiveUpdate({ tasks: fresh, activities: acts, event }) {
    applyServerState({ tasks: fresh, activities: acts });
    const names = ((event && event.unlocked) || [])
      .map(id => fresh.find(t => t._id === id)?.title)
      .filter(Boolean);
    if (names.length) {
      showToast('Unlocked', names.join(', ') + (names.length === 1 ? ' is' : ' are') + ' now ready to start.');
    }
  }

  async function loadBoard() {
    try {
      // Each user gets their own board; create the first one automatically.
      const boards = await Weave.listBoards();
      board = Weave.pickBoard(boards) || await Weave.createBoard(`${displayName}'s Board`);
      applyServerState(await Weave.getBoard(board._id));

      const link = document.getElementById('criticalPathLink');
      if (link) link.href = 'graph.html?board=' + board._id;

      DueDateNotifier.notifyDueTomorrow(tasks, (task) => {
        showToast('Due Tomorrow', `"${task.title}" is due tomorrow.`);
      });

      if (typeof io !== 'undefined') socket = Weave.subscribe(board._id, onLiveUpdate);
    } catch (err) {
      showToast('Could not load your board', errText(err));
    }
  }

  // 10. Bootstrap -----------------------------------------------------------
  updateAuthNavbar();
  renderKanbanBoard();
  renderActivity();
  renderActivityFull();
  if (currentUser) await loadBoard();
});
