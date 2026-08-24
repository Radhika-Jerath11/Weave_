/* ==========================================================================
   Weave / TaskFlow — Application Controller & Dependency Engine
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  // 1. Session Detection
  let currentUser = Storage.getSession();

  let tasks = Storage.loadTasks(currentUser);
  let activities = Storage.loadActivities(currentUser);

  function persistTasks() { Storage.saveTasks(currentUser, tasks); }
  function persistActivities() { Storage.saveActivities(currentUser, activities); }

  // Track which task (if any) is currently being edited, and which task
  // the details modal is currently showing — both start as "none".
  let editingTaskId = null;
  let currentDetailsTaskId = null;

  function showFormError(message) {
    const el = document.getElementById('taskFormError');
    if (!el) return;
    if (message) {
      el.textContent = message;
      el.style.display = 'block';
    } else {
      el.textContent = '';
      el.style.display = 'none';
    }
  }

  // 2. Auth State Sync
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

      const displayName = currentUser.name || currentUser.email.split('@')[0];
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

  if (currentUser) {
    DueDateNotifier.notifyDueTomorrow(tasks, (task) => {
      showToast('Due Tomorrow', `"${task.title}" is due tomorrow.`);
    });
  }

  document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    Storage.clearSession();
    window.location.href = 'login.html';
  });

  // 2b. Notifications Dropdown
  const notifBtn = document.getElementById('notifBtn');
  const notifDropdown = document.getElementById('notifDropdown');
  const notifBadge = document.getElementById('notifBadge');

  function getDueNotifications() {
    const overdue = DueDateNotifier.getOverdueTasks(tasks).map(t => ({
      icon: 'icon-blocked', symbol: '⚠', text: `"${t.title}" is overdue`
    }));
    const dueTomorrow = DueDateNotifier.getTasksDueTomorrow(tasks).map(t => ({
      icon: 'icon-blocked', symbol: '⏰', text: `"${t.title}" is due tomorrow`
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

  updateNotifBadge();

  // 3. Sidebar Toggle Handler (Desktop Collapse + Mobile Slide-over)
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

  // 4. Dependency Validation
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
    document.getElementById('statTotal').textContent = tasks.length;
    document.getElementById('statTodo').textContent = tasks.filter(t => t.status === 'TODO').length;
    document.getElementById('statInProgress').textContent = tasks.filter(t => t.status === 'IN_PROGRESS').length;
    document.getElementById('statDone').textContent = tasks.filter(t => t.status === 'DONE').length;

    document.getElementById('countTodo').textContent = tasks.filter(t => t.status === 'TODO').length;
    document.getElementById('countInProgress').textContent = tasks.filter(t => t.status === 'IN_PROGRESS').length;
    document.getElementById('countReview').textContent = tasks.filter(t => t.status === 'REVIEW').length;
    document.getElementById('countDone').textContent = tasks.filter(t => t.status === 'DONE').length;
  }

  // ------------------------------------------------------------------
  // PRIORITY ENGINE — "Your next best task" card at the top of the
  // dashboard. Recomputed every time the board changes, same as the
  // Kanban board itself.
  // ------------------------------------------------------------------
  function renderPriorityCard() {
    const card = document.getElementById('priorityCard');
    if (!card || !currentUser) return;

    const displayName = currentUser.name || currentUser.email.split('@')[0];
    const best = PriorityEngine.getNextBestTask(tasks, displayName);

    if (!best) {
      card.style.display = 'none';
      return;
    }

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
    const columns = {
      TODO: document.getElementById('colTodo'),
      IN_PROGRESS: document.getElementById('colInProgress'),
      REVIEW: document.getElementById('colReview'),
      DONE: document.getElementById('colDone')
    };

    Object.values(columns).forEach(col => { if (col) col.innerHTML = ''; });

    const filtered = tasks.filter(t =>
      t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.description && t.description.toLowerCase().includes(searchTerm.toLowerCase()))
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

    let statusBadge = isDone
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
        return `<div class="dep-item ${met ? 'met' : 'unmet'}"><span>${met ? '✓' : '❌'}</span><span>${dTask.title}</span></div>`;
      }).join('');
      dependencyHtml = `<div class="card-dependencies"><div class="dep-label">Depends on:</div>${items}</div>`;
    }

    const formattedDate = task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No date';
    const initial = (task.assignee || 'U').charAt(0).toUpperCase();

    card.innerHTML = `
      <div class="task-card-header"><h4 class="task-title">${task.title}</h4>${statusBadge}</div>
      <p class="task-desc">${task.description || 'No description provided.'}</p>
      ${dependencyHtml}
      <div class="task-card-footer">
        <div style="display:flex;gap:6px;align-items:center;">
          <span class="badge badge-priority-${task.priority}">${task.priority}</span>
          <span class="task-date">${isDone && task.completedAt ? 'Completed ' + task.completedAt : formattedDate}</span>
        </div>
        <div class="avatar" style="width:24px;height:24px;font-size:0.75rem;">${initial}</div>
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

  function renderActivity() {
    const list = document.getElementById('activityList');
    if (!list) return;

    if (activities.length === 0) {
      list.innerHTML = `<div style="color:var(--text-muted);font-size:0.85rem;padding:8px 0;">No recent activities yet. Start by creating a task!</div>`;
      return;
    }

    list.innerHTML = activities.map(act => `
      <div class="activity-item">
        <div class="activity-main">
          <div class="activity-icon ${act.icon}">${act.symbol}</div>
          <span class="activity-text">${act.text}</span>
        </div>
        <span class="activity-time">${act.time}</span>
      </div>
    `).join('');
  }

  function renderActivityFull() {
    const list = document.getElementById('activityListFull');
    if (!list) return;

    if (activities.length === 0) {
      list.innerHTML = `<div style="color:var(--text-muted);font-size:0.85rem;padding:8px 0;">No activity yet. Actions like creating, editing, moving, and deleting tasks will show up here.</div>`;
      return;
    }

    list.innerHTML = activities.map(act => `
      <div class="activity-item">
        <div class="activity-main">
          <div class="activity-icon ${act.icon}">${act.symbol}</div>
          <span class="activity-text">${act.text}</span>
        </div>
        <span class="activity-time">${act.time}</span>
      </div>
    `).join('');
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
      let stateBadge = isDone
        ? `<span class="badge badge-done">✓ DONE</span>`
        : locked
        ? `<span class="badge badge-locked">🔒 LOCKED</span>`
        : `<span class="badge badge-ready">🔓 READY</span>`;

      const deps = (task.dependencies || []).map(dId => {
        const dt = tasks.find(t => t.id === dId);
        return dt ? dt.title : dId;
      }).join(', ') || 'None';

      return `
        <div class="dep-node-row">
          <div class="dep-node-title">${task.title}</div>
          <div>${stateBadge}</div>
          <div class="dep-arrow">← Prerequisite Tasks:</div>
          <div style="font-size:0.9rem;color:var(--text-muted);">${deps}</div>
        </div>
      `;
    }).join('');
  }

  function renderGraphView() {
    const container = document.getElementById('dependencyGraphView');
    GraphView.render(container, tasks, isTaskLocked);
  }

  function addActivityEntry(icon, symbol, text) {
    activities.unshift({ icon, symbol, text, time: 'Just now' });
    if (activities.length > 8) activities.pop();
    persistActivities();
    renderActivity();
    renderActivityFull();
    if (typeof updateNotifBadge === 'function') updateNotifBadge();
  }

  // 5. Drag and Drop Handling
  document.querySelectorAll('.task-list').forEach(col => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      col.classList.add('drag-over');
    });

    col.addEventListener('dragleave', () => col.classList.remove('drag-over'));

    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.classList.remove('drag-over');

      const draggedId = e.dataTransfer.getData('text/plain');
      if (!draggedId) return;

      const targetStatus = col.parentElement.dataset.status;
      const task = tasks.find(t => t.id === draggedId);
      if (!task) return;
      if (task.status === 'DONE' && targetStatus !== 'DONE') {
        showToast('Task Completed', `'${task.title}' is already Done and can't be moved back.`);
        return;
      }

      if (isTaskLocked(task) && targetStatus !== 'TODO') {
        const unmet = getUnmetDependencies(task).map(u => `'${u.title}'`).join(', ');
        showToast('Task Locked', `Complete ${unmet} before moving to In Progress.`);
        addActivityEntry('icon-blocked', '⚠', `Movement blocked: '${task.title}' is locked.`);
        return;
      }

      if (task.status !== targetStatus) {
        task.status = targetStatus;
        if (targetStatus === 'DONE') {
          task.completedAt = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          addActivityEntry('icon-done', '✓', `'${task.title}' marked Done`);
        } else {
          addActivityEntry('icon-unlocked', '➔', `'${task.title}' moved to ${targetStatus.replace('_', ' ')}`);
        }

        persistTasks();
        renderKanbanBoard();
        renderDependencyTree();
        renderGraphView();
      }
    });
  });

  function showToast(title, message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<div class="toast-title">${title}</div><div class="toast-message">${message}</div>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // 6. Create Task Modal Logic
  const createModal = document.getElementById('createTaskModal');
  const openCreateBtn = document.getElementById('openCreateModalBtn');

  if (openCreateBtn) {
    openCreateBtn.addEventListener('click', () => {
      if (!currentUser) {
        window.location.href = 'login.html';
        return;
      }
      editingTaskId = null;
      document.getElementById('createModalTitle').textContent = 'Create New Task';
      document.getElementById('taskFormSubmitBtn').textContent = 'Create Task';
      showFormError(null);
      document.getElementById('createTaskForm')?.reset();

      const selector = document.getElementById('dependencySelector');
      if (selector) {
        selector.innerHTML = tasks.length === 0
          ? `<span style="font-size:0.8rem;color:var(--text-muted);padding:4px;">No prerequisite tasks yet.</span>`
          : tasks.map(t => `<label class="checkbox-option"><input type="checkbox" name="deps" value="${t.id}"><span>${t.title} (${t.status})</span></label>`).join('');
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
            return `<label class="checkbox-option"><input type="checkbox" name="deps" value="${t.id}" ${checked}><span>${t.title} (${t.status})</span></label>`;
          }).join('');
    }

    detailsModal?.classList.remove('active');
    createModal?.classList.add('active');
  }

  function deleteTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const dependents = TaskManager.getDependents(tasks, taskId);
    if (dependents.length > 0) {
      const names = dependents.map(t => `'${t.title}'`).join(', ');
      showToast('Cannot Delete', `${names} still depend${dependents.length === 1 ? 's' : ''} on this task. Remove that dependency first.`);
      return;
    }

    const confirmed = window.confirm(`Delete '${task.title}'? This can't be undone.`);
    if (!confirmed) return;

    tasks = tasks.filter(t => t.id !== taskId);
    persistTasks();

    renderKanbanBoard();
    renderDependencyTree();
    renderGraphView();
    addActivityEntry('icon-blocked', '−', `Deleted task '${task.title}'`);

    detailsModal?.classList.remove('active');
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

  document.getElementById('createTaskForm')?.addEventListener('submit', (e) => {
    e.preventDefault();

    const titleVal = document.getElementById('taskTitle').value;
    const assigneeVal = document.getElementById('taskAssignee')?.value || currentUser.name;

    const errorMsg = TaskManager.validate(tasks, titleVal, assigneeVal, editingTaskId);
    if (errorMsg) {
      showFormError(errorMsg);
      return;
    }
    showFormError(null);

    const selectedDeps = Array.from(document.querySelectorAll('input[name="deps"]:checked')).map(cb => cb.value);
    const taskIdForCheck = editingTaskId || 'task-' + Date.now();

    if (DependencyGraph.wouldCreateCycle(tasks, taskIdForCheck, selectedDeps)) {
      showFormError('This dependency would create a circular chain — a task cannot depend on something that (directly or indirectly) depends on it.');
      return;
    }

    const formData = {
      title: titleVal,
      description: document.getElementById('taskDesc').value,
      assignee: assigneeVal,
      priority: document.getElementById('taskPriority').value,
      dueDate: document.getElementById('taskDueDate').value,
      status: document.getElementById('taskStatus').value,
      dependencies: selectedDeps
    };

    if (editingTaskId) {
      const task = tasks.find(t => t.id === editingTaskId);
      if (task) {
        TaskManager.applyEdits(task, formData);
        persistTasks();
        renderKanbanBoard();
        renderDependencyTree();
        renderGraphView();
        addActivityEntry('icon-unlocked', '✎', `Updated task '${task.title}'`);
      }
      closeCreate();
      return;
    }

    const newTask = TaskManager.buildNewTask(formData);
    tasks.push(newTask);
    persistTasks();

    renderKanbanBoard();
    renderDependencyTree();
    renderGraphView();
    addActivityEntry('icon-unlocked', '+', `Created new task '${newTask.title}'`);
    closeCreate();
  });

  // 7. Task Details Modal
  const detailsModal = document.getElementById('taskDetailsModal');
  const detailsBody = document.getElementById('detailsModalBody');

  // ------------------------------------------------------------------
  // IMPACT PREDICTOR — renders the "if this is delayed, what breaks"
  // simulator results into the details modal. Split out from
  // openTaskDetailsModal so it can be re-run each time the delay input
  // changes without rebuilding the whole modal.
  // ------------------------------------------------------------------
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
        <span class="impact-task-name">${c.task.title}</span>
      </div>
    `).join('');

    const atRiskNames = result.atRiskTasks.map(t => t.title).join(', ') || 'Nothing further';

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
    // Only a task still sitting in To Do actually needs a locked/ready badge —
    // once it's moved forward, its dependency state isn't the interesting fact anymore.
    return locked ? { cls: 'badge-locked', label: '🔒 LOCKED' } : { cls: 'badge-ready', label: '🔓 READY' };
  }

  function openTaskDetailsModal(task) {
    if (!detailsBody) return;
    currentDetailsTaskId = task.id;
    const locked = isTaskLocked(task);
    const isDone = task.status === 'DONE';
    const unmet = getUnmetDependencies(task).map(u => `'${u.title}'`).join(', ');
    const statusBadge = getStatusBadge(task, locked);

    detailsBody.innerHTML = `
      <div style="margin-bottom:12px;">
        <span class="badge badge-priority-${task.priority}">${task.priority} PRIORITY</span>
        <span class="badge ${statusBadge.cls}" style="margin-left:8px;">${statusBadge.label}</span>
      </div>
      <h3 style="font-family:var(--font-serif);font-size:1.3rem;margin-bottom:8px;">${task.title}</h3>
      <p style="color:var(--text-muted);font-size:0.9rem;margin-bottom:16px;">${task.description || 'No description provided.'}</p>
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
      const daysInput = document.getElementById('impactDelayInput');
      const days = Math.max(1, parseInt(daysInput.value, 10) || 1);
      const result = ImpactPredictor.calculateImpact(tasks, task.id, days);
      renderImpactResults(result);
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

  // 8. Search and Navigation
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

  // 9. Bootstrap
  updateAuthNavbar();
  renderKanbanBoard();
  renderActivity();
  renderActivityFull();
});
