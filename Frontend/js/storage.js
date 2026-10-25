/* ==========================================================================
   TaskFlow — Storage Layer
   Pure persistence: reads/writes localStorage & sessionStorage only.
   No DOM access, no task-validation logic — just get/set for data.
   ========================================================================== */

const Storage = (function () {
  const SESSION_KEY = 'weaveSession';

  function getSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); }
    catch (e) { return null; }
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  function tasksKey(user) { return `taskflow_tasks_${user.email}`; }
  function activitiesKey(user) { return `taskflow_activities_${user.email}`; }
  function notifSeenKey(user) { return `taskflow_notif_seen_${user.email}`; }

  function loadTasks(user) {
    if (!user) return [];
    try { return JSON.parse(localStorage.getItem(tasksKey(user))) || []; }
    catch (e) { return []; }
  }

  function saveTasks(user, tasks) {
    if (!user) return;
    localStorage.setItem(tasksKey(user), JSON.stringify(tasks));
  }

  function loadActivities(user) {
    if (!user) return [];
    try { return JSON.parse(localStorage.getItem(activitiesKey(user))) || []; }
    catch (e) { return []; }
  }

  function saveActivities(user, activities) {
    if (!user) return;
    localStorage.setItem(activitiesKey(user), JSON.stringify(activities));
  }

  function getNotifSeenCount(user) {
    if (!user) return 0;
    return Number(localStorage.getItem(notifSeenKey(user)) || 0);
  }

  function setNotifSeenCount(user, count) {
    if (!user) return;
    localStorage.setItem(notifSeenKey(user), String(count));
  }

  return {
    getSession, clearSession,
    loadTasks, saveTasks,
    loadActivities, saveActivities,
    getNotifSeenCount, setNotifSeenCount
  };
})();
