/* Weave API client. Include after the Socket.IO client script:
   <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
   <script src="js/api.js"></script>                                      */
(function () {
  const ORIGIN = window.WEAVE_API_URL || localStorage.getItem('weave_api_origin') || (
    ['localhost', '127.0.0.1'].includes(window.location.hostname)
      ? 'http://localhost:5000'
      : window.location.origin
  );
  const API = ORIGIN + '/api';
  const TOKEN = 'weave_token', USER = 'weave_user', BOARD = 'weave_board';

  async function request(path, { method = 'GET', body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem(TOKEN);
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && token) { Weave.logout(); location.href = 'login.html'; }
    if (!res.ok) { const e = new Error(data.message || 'Request failed'); e.status = res.status; e.data = data; throw e; }
    return data;
  }
  const save = (s) => { localStorage.setItem(TOKEN, s.token); localStorage.setItem(USER, JSON.stringify(s.user)); return s.user; };

  const Weave = {
    signup: (name, email, password) => request('/auth/signup', { method: 'POST', body: { name, email, password } }).then(save),
    login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }).then(save),
    logout() { localStorage.removeItem(TOKEN); localStorage.removeItem(USER); localStorage.removeItem(BOARD); sessionStorage.removeItem('weaveSession'); },
    isLoggedIn: () => !!localStorage.getItem(TOKEN),
    user: () => JSON.parse(localStorage.getItem(USER) || 'null'),

    // Which board the dashboard / team / graph pages show (owned or shared).
    pickBoard(boards) {
      if (!boards || boards.length === 0) return null;
      const id = localStorage.getItem(BOARD);
      const saved = boards.find((b) => b._id === id);
      if (saved) return saved;
      // If the user is on a shared board (invited to collaborate), prioritize it!
      const shared = boards.find((b) => !b.isOwner);
      if (shared) {
        localStorage.setItem(BOARD, shared._id);
        return shared;
      }
      return boards.find((b) => b.isOwner) || boards[0] || null;
    },
    setActiveBoard: (id) => localStorage.setItem(BOARD, id),

    // Server task -> the shape the UI modules (TaskManager, GraphView...) use.
    toUI(t) {
      const ui = { todo: 'TODO', inprogress: 'IN_PROGRESS', review: 'REVIEW', done: 'DONE' };
      return {
        id: t._id, title: t.title, description: t.description || '', assignee: t.assignee || '',
        priority: t.priority || 'MEDIUM', dueDate: t.dueDate || '', status: ui[t.status] || 'TODO',
        dependencies: t.dependsOn || [], estimate: t.estimate || 1, createdAt: t.createdAt
      };
    },

    // Team collaboration
    inviteMember: (boardId, email) => request(`/boards/${boardId}/invites`, { method: 'POST', body: { email } }),
    revokeInvite: (boardId, inviteId) => request(`/boards/${boardId}/invites/${inviteId}`, { method: 'DELETE' }),
    removeMember: (boardId, userId) => request(`/boards/${boardId}/members/${userId}`, { method: 'DELETE' }),
    invitePreview: (token) => request('/invites/preview?token=' + encodeURIComponent(token)),
    acceptInvite: (token) => request('/invites/accept', { method: 'POST', body: { token } }),
    myPendingInvites: () => request('/invites/my-pending'),
    acceptInviteById: (inviteId) => request(`/invites/${inviteId}/accept-direct`, { method: 'POST' }),

    listBoards: () => request('/boards'),
    createBoard: (name) => request('/boards', { method: 'POST', body: { name } }),
    getBoard: (id) => request('/boards/' + id),               // -> { board, tasks }
    deleteBoard: (id) => request('/boards/' + id, { method: 'DELETE' }),
    criticalPath: (id) => request(`/boards/${id}/critical-path`),

    createTask: (boardId, task) => request(`/boards/${boardId}/tasks`, { method: 'POST', body: task }),
    moveTask: (id, status) => request(`/tasks/${id}/status`, { method: 'PUT', body: { status } }),
    setDependencies: (id, dependsOn) => request(`/tasks/${id}/dependencies`, { method: 'PUT', body: { dependsOn } }),
    updateTask: (id, fields) => request('/tasks/' + id, { method: 'PUT', body: fields }),
    deleteTask: (id) => request('/tasks/' + id, { method: 'DELETE' }),

    // Live updates: onUpdate({ tasks, event }) fires for every change by anyone on the board.
    subscribe(boardId, onUpdate) {
      const socket = io(ORIGIN, { auth: { token: localStorage.getItem(TOKEN) } });
      socket.on('connect', () => socket.emit('board:join', boardId));  // also re-joins after reconnects
      socket.on('board:update', onUpdate);
      return socket;
    }
  };
  window.Weave = Weave;
})();
