/* ==========================================================================
   TaskFlow — Due Date Notifications
   Checks tasks for a due date of "tomorrow" and surfaces a browser
   notification (falls back to an in-app toast if permission is denied
   or the Notification API isn't available). No external services.
   ========================================================================== */

const DueDateNotifier = (function () {

  // Returns true if `dueDate` (a 'YYYY-MM-DD' string) is exactly tomorrow,
  // relative to right now.
  function isDueTomorrow(dueDate) {
    if (!dueDate) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const due = new Date(dueDate + 'T00:00:00');

    return due.getTime() === tomorrow.getTime();
  }

  // Returns the subset of tasks (excluding DONE ones) due tomorrow.
  function getTasksDueTomorrow(tasks) {
    return tasks.filter(t => t.status !== 'DONE' && isDueTomorrow(t.dueDate));
  }

  function isOverdue(dueDate, status) {
  if (!dueDate || status === 'DONE') return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00');
  return due.getTime() < today.getTime();
}

function getOverdueTasks(tasks) {
  return tasks.filter(t => isOverdue(t.dueDate, t.status));
}

  // Asks the browser for notification permission if we haven't already
  // been granted or denied it. Call this once, e.g. on dashboard load.
  function requestPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  // Fires one browser notification per task due tomorrow. If permission
  // isn't granted (denied, or API unavailable), calls `fallback(task)`
  // instead for each task so the caller can show an in-app toast.
  function notifyDueTomorrow(tasks, fallback) {
    const dueTasks = getTasksDueTomorrow(tasks);

    dueTasks.forEach(task => {
      const canNotify = ('Notification' in window) && Notification.permission === 'granted';
      if (canNotify) {
        new Notification('Task due tomorrow', {
          body: `"${task.title}" is due tomorrow.`,
          tag: 'taskflow-due-' + task.id // prevents duplicate stacked notifications for the same task
        });
      } else if (typeof fallback === 'function') {
        fallback(task);
      }
    });

    return dueTasks;
  }

  return { isDueTomorrow, getTasksDueTomorrow, isOverdue, getOverdueTasks, requestPermission, notifyDueTomorrow };
})();
