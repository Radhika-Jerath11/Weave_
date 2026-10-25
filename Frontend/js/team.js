/* ==========================================================================
   Weave — Team Collaboration & Assignee View
   Invite members by email (a link is emailed to them), manage who has access,
   and track per-member task progress in real time.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {
  if (!Weave.isLoggedIn()) { window.location.href = 'login.html'; return; }
  const currentUser = Weave.user();
  if (!currentUser) { window.location.href = 'login.html'; return; }

  let board = null;
  let tasks = [];
  let invites = [];
  let allBoards = [];
  let myPending = [];
  let boardId = null;
  let subscribed = false;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
    }, 4500);
  }
  const errText = (err) => (err.status === undefined ? "Can't reach the server. Is the backend running?" : err.message);

  // A task is locked if any prerequisite is missing or not DONE (display only; the server enforces it).
  function isLocked(task) {
    return (task.dependencies || []).some((id) => {
      const dep = tasks.find((t) => t.id === id);
      return !dep || dep.status !== 'DONE';
    });
  }

  function resolveAssigneeName(rawName) {
    const clean = (rawName || '').trim();
    if (!clean || clean.toLowerCase() === 'unassigned') return 'Unassigned';

    const collaborators = [board?.owner, ...(board?.members || [])].filter(Boolean);
    const lower = clean.toLowerCase();

    // 1. Exact match (case-insensitive)
    const exact = collaborators.find(c => c.name && c.name.trim().toLowerCase() === lower);
    if (exact) return exact.name;

    // 2. First-name match (e.g. "Nitika" matches "Nitika Anand")
    const firstNameMatch = collaborators.find(c => c.name && c.name.trim().toLowerCase().split(/\s+/)[0] === lower);
    if (firstNameMatch) return firstNameMatch.name;

    // 3. Email prefix match (e.g. "nitika" matches "nitika@gmail.com")
    const emailPrefixMatch = collaborators.find(c => c.email && c.email.split('@')[0].toLowerCase() === lower);
    if (emailPrefixMatch) return emailPrefixMatch.name || emailPrefixMatch.email;

    return clean;
  }

  function groupByAssignee(list) {
    const groups = new Map();
    list.forEach(t => {
      const name = resolveAssigneeName(t.assignee);
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(t);
    });
    return groups;
  }

  function renderMemberCard(name, memberTasks) {
    const total = memberTasks.length;
    const done = memberTasks.filter(t => t.status === 'DONE').length;
    const locked = memberTasks.filter(t => t.status !== 'DONE' && isLocked(t)).length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    const initial = (name.charAt(0) || '?').toUpperCase();

    return `
      <div class="member-card">
        <div class="member-header">
          <div class="member-avatar">${esc(initial)}</div>
          <div>
            <div class="member-name">${esc(name)}</div>
            <div class="member-sub">${total} task${total === 1 ? '' : 's'} assigned</div>
          </div>
        </div>
        <div class="member-stats">
          <div class="member-stat"><span class="member-stat-value">${done}</span><span class="member-stat-label">Done</span></div>
          <div class="member-stat"><span class="member-stat-value">${total - done}</span><span class="member-stat-label">Open</span></div>
          <div class="member-stat"><span class="member-stat-value">${locked}</span><span class="member-stat-label">Locked</span></div>
        </div>
        <div class="member-progress-track"><div class="member-progress-fill" style="width:${pct}%;"></div></div>
        <div class="member-progress-pct">${pct}% complete</div>
      </div>
    `;
  }

  function renderIncomingInvites() {
    if (!myPending || myPending.length === 0) return '';
    const items = myPending.map(inv => `
      <div style="background:#FAF3E3; border:1px solid #D6BC83; border-radius:12px; padding:16px 20px; margin-bottom:18px; display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; box-shadow:0 4px 12px rgba(192,138,61,0.08);">
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="width:36px; height:36px; border-radius:50%; background:#C08A3D; color:#fff; display:flex; align-items:center; justify-content:center; font-size:17px; flex-shrink:0;">📩</div>
          <div>
            <div style="font-weight:700; color:#3A2D16; font-size:14.5px;">Pending Team Invitation</div>
            <div style="font-size:13px; color:#6B5A38; margin-top:2px;"><b>${esc(inv.invitedBy)}</b> invited you to collaborate on the board <b>&ldquo;${esc(inv.boardName)}&rdquo;</b>.</div>
          </div>
        </div>
        <button class="btn btn-primary btn-sm accept-my-invite-btn" data-invite-id="${inv._id}" style="padding:9px 18px; font-weight:600; white-space:nowrap; background:#4E5C36; color:#F6F1E4; border:none; border-radius:8px; cursor:pointer;">
          Accept & Join Board →
        </button>
      </div>
    `).join('');
    return items;
  }

  function renderBoardSwitcher() {
    if (allBoards.length < 2) return '';
    const buttons = allBoards.map(b => `
      <button class="btn ${b._id === boardId ? 'btn-primary' : 'btn-secondary'} btn-sm switch-board-btn" data-board-id="${b._id}">
        ${esc(b.name)}${b.isOwner ? '' : ' (shared with you)'}
      </button>`).join('');
    return `
      <div class="board-members-section">
        <div class="board-members-header">
          <div>
            <h2 class="board-members-title">Your boards</h2>
            <p style="font-size:0.8rem;color:var(--t-ink-soft);margin-top:2px;">Choose which board the dashboard, team and graph pages show</p>
          </div>
        </div>
        <div class="members-list" style="gap:8px;flex-wrap:wrap;">${buttons}</div>
      </div>
    `;
  }

  function renderBoardMembers() {
    if (!board) return '';
    const owner = board.owner || {};
    const members = board.members || [];
    const isOwner = !!board.isOwner;

    const ownerName = owner.name || owner.email || 'Owner';
    const ownerPill = `
      <div class="member-pill">
        <div class="avatar">${esc(ownerName.charAt(0).toUpperCase())}</div>
        <div class="member-pill-info">
          <span class="member-pill-name">${esc(ownerName)} <span class="role-badge role-owner">Owner</span></span>
          <span class="member-pill-email">${esc(owner.email || '')}</span>
        </div>
      </div>
    `;

    const membersPills = members.map(m => {
      const mName = m.name || (m.email ? m.email.split('@')[0] : 'Member');
      const isMe = String(m._id) === String(currentUser.id);
      const removeBtn = (isOwner || isMe)
        ? `<button class="remove-member-btn" data-member-id="${m._id}" data-member-name="${esc(mName)}" data-self="${isMe}" title="${isMe ? 'Leave board' : 'Remove member'}">&times;</button>`
        : '';
      return `
        <div class="member-pill">
          <div class="avatar">${esc(mName.charAt(0).toUpperCase())}</div>
          <div class="member-pill-info">
            <span class="member-pill-name">${esc(mName)} <span class="role-badge role-member">Member</span></span>
            <span class="member-pill-email">${esc(m.email || '')}</span>
          </div>
          ${removeBtn}
        </div>
      `;
    }).join('');

    // Invitations that were emailed but not accepted yet (owner only)
    const pendingPills = (isOwner ? invites : []).map(i => `
      <div class="member-pill" style="border-style:dashed;">
        <div class="avatar">&#9993;</div>
        <div class="member-pill-info" style="flex:1;">
          <span class="member-pill-name">${esc(i.email)} <span class="role-badge" style="background:#F1E3C8;color:#8A5A1C;">Pending</span></span>
          <span class="member-pill-email">Invite sent ${new Date(i.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}. Waiting for them to accept.</span>
        </div>
        <button class="copy-pending-btn" data-invite-email="${esc(i.email)}" style="background:#4E5C36; color:#F6F1E4; border:none; border-radius:6px; padding:5px 10px; font-size:11.5px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:4px; margin-right:6px;" title="Copy direct invitation link">
          Copy Link
        </button>
        <button class="remove-member-btn revoke-invite-btn" data-invite-id="${i._id}" data-invite-email="${esc(i.email)}" title="Cancel invitation">&times;</button>
      </div>
    `).join('');

    return `
      <div class="board-members-section">
        <div class="board-members-header">
          <div>
            <h2 class="board-members-title">Board Collaborators (${1 + members.length})</h2>
            <p style="font-size:0.8rem;color:var(--t-ink-soft);margin-top:2px;">Users who have real-time access to this Kanban board</p>
          </div>
          ${isOwner ? `
            <button class="btn btn-primary btn-sm" id="openInviteBtn" style="display:inline-flex;align-items:center;gap:6px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Invite Member
            </button>
          ` : `<span style="font-size:0.8rem;color:var(--t-ink-soft);font-style:italic;">Member of ${esc(board.name)}</span>`}
        </div>
        <div class="members-list">
          ${ownerPill}
          ${membersPills}
          ${pendingPills}
          ${!membersPills && !pendingPills ? '<span style="font-size:0.85rem;color:var(--t-ink-soft);padding:6px 0;">No other members invited yet.</span>' : ''}
        </div>
      </div>
    `;
  }

  function renderView() {
    const view = document.getElementById('teamView');
    if (!view) return;

    const groups = groupByAssignee(tasks);
    const cardsHtml = groups.size === 0
      ? `<div class="team-empty">No tasks yet. Assign a task to someone to see them here.</div>`
      : Array.from(groups.entries()).map(([name, memberTasks]) => renderMemberCard(name, memberTasks)).join('');

    view.innerHTML = `
      <div class="dashboard-header">
        <div>
          <h1 class="page-title">Team Collaboration</h1>
          <p class="page-subtitle">Collaborate in real time and track task progress per assignee.</p>
        </div>
      </div>

      ${renderIncomingInvites()}
      ${renderBoardSwitcher()}
      ${renderBoardMembers()}

      <div class="team-notice">
        <strong>Task Assignments:</strong> Assign tasks to any collaborator using the "Assigned To" field on the dashboard.
      </div>

      <h2 style="font-family:'Fraunces',serif;font-size:1.2rem;margin-bottom:14px;color:var(--t-ink);">Task Breakdown by Assignee</h2>
      <div class="team-grid">${cardsHtml}</div>
    `;

    document.querySelectorAll('.accept-my-invite-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Joining…';
        try {
          const res = await Weave.acceptInviteById(btn.dataset.inviteId);
          Weave.setActiveBoard(res.board._id);
          showToast('Invitation Accepted', `You joined "${res.board.name}"!`);
          await loadData();
        } catch (err) {
          showToast('Could not accept', errText(err));
          btn.disabled = false;
          btn.textContent = 'Accept & Join Board →';
        }
      });
    });

    document.getElementById('openInviteBtn')?.addEventListener('click', () => {
      document.getElementById('inviteError').style.display = 'none';
      document.getElementById('inviteEmail').value = '';
      document.getElementById('inviteModal')?.classList.add('active');
    });

    document.querySelectorAll('.switch-board-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        Weave.setActiveBoard(btn.dataset.boardId);
        window.location.reload();
      });
    });

    document.querySelectorAll('.remove-member-btn[data-member-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const mName = btn.dataset.memberName;
        const leaving = btn.dataset.self === 'true';
        if (!confirm(leaving ? `Leave "${board.name}"?` : `Remove ${mName} from this board?`)) return;
        try {
          await Weave.removeMember(boardId, btn.dataset.memberId);
          if (leaving) { localStorage.removeItem('weave_board'); window.location.reload(); return; }
          showToast('Member removed', `${mName} was removed from the board.`);
          await loadData();
        } catch (err) {
          showToast('Could not remove member', errText(err));
        }
      });
    });

    document.querySelectorAll('.copy-pending-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const email = btn.dataset.inviteEmail;
        const origText = btn.textContent;
        btn.textContent = 'Generating…';
        btn.disabled = true;
        try {
          const res = await Weave.inviteMember(boardId, email);
          const link = res.link || res.devLink;
          if (link) {
            await copyTextToClipboard(link);
            btn.textContent = 'Copied!';
            showToast('Invite Link Copied', `Copied direct link for ${email} to clipboard!`);
            setTimeout(() => { btn.textContent = origText; btn.disabled = false; }, 2500);
          } else {
            showToast('Invite Created', 'Link ready, but clipboard write failed.');
            btn.textContent = origText;
            btn.disabled = false;
          }
        } catch (err) {
          showToast('Failed to get link', errText(err));
          btn.textContent = origText;
          btn.disabled = false;
        }
      });
    });

    document.querySelectorAll('.revoke-invite-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const email = btn.dataset.inviteEmail;
        if (!confirm(`Cancel the invitation to ${email}? Their link will stop working.`)) return;
        try {
          await Weave.revokeInvite(boardId, btn.dataset.inviteId);
          showToast('Invitation cancelled', `The link sent to ${email} no longer works.`);
          await loadData();
        } catch (err) {
          showToast('Could not cancel invitation', errText(err));
        }
      });
    });
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) { /* fallback */ }
    }
    const input = document.createElement('textarea');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    input.remove();
    return true;
  }

  async function loadData() {
    try {
      allBoards = await Weave.listBoards();
      try {
        myPending = await Weave.myPendingInvites();
      } catch (e) { myPending = []; }

      if (!allBoards || allBoards.length === 0) {
        const view = document.getElementById('teamView');
        if (view) view.innerHTML = `${renderIncomingInvites()}<div class="team-empty">You don't have a board yet. Open the dashboard first to create one.</div>`;
        return;
      }
      boardId = Weave.pickBoard(allBoards)._id;
      const data = await Weave.getBoard(boardId);
      board = data.board;
      tasks = data.tasks.map(Weave.toUI);
      invites = data.invites || [];
      renderView();

      // Live updates: someone accepted an invite, a task changed, etc.
      if (!subscribed && typeof io !== 'undefined') {
        subscribed = true;
        Weave.subscribe(boardId, () => loadData());
      }
    } catch (err) {
      console.error('Failed to load team data', err);
      showToast('Could not load team data', errText(err));
    }
  }

  // Invite modal controls
  const inviteModal = document.getElementById('inviteModal');
  const inviteForm = document.getElementById('inviteMemberForm');
  const inviteResult = document.getElementById('inviteResultSection');
  const directLinkInput = document.getElementById('directInviteLinkInput');
  const copyDirectBtn = document.getElementById('copyDirectLinkBtn');

  const closeInvite = () => {
    inviteModal?.classList.remove('active');
    document.getElementById('inviteError').style.display = 'none';
    inviteForm?.reset();
    if (inviteForm) inviteForm.style.display = 'block';
    if (inviteResult) inviteResult.style.display = 'none';
    const modalTitle = document.getElementById('inviteModalTitle');
    if (modalTitle) modalTitle.textContent = 'Invite Team Member';
  };
  document.getElementById('closeInviteModalBtn')?.addEventListener('click', closeInvite);
  document.getElementById('cancelInviteModalBtn')?.addEventListener('click', closeInvite);
  document.getElementById('closeInviteResultBtn')?.addEventListener('click', closeInvite);

  copyDirectBtn?.addEventListener('click', async () => {
    const link = directLinkInput.value;
    if (!link) return;
    await copyTextToClipboard(link);
    copyDirectBtn.textContent = 'Copied!';
    showToast('Copied to Clipboard', 'Invite link copied successfully!');
    setTimeout(() => { copyDirectBtn.textContent = 'Copy Link'; }, 2000);
  });

  inviteForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('inviteEmail').value.trim();
    const errorEl = document.getElementById('inviteError');
    const submitBtn = document.getElementById('inviteSubmitBtn');
    if (!email) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending invite...';
    errorEl.style.display = 'none';

    try {
      const res = await Weave.inviteMember(boardId, email);
      const link = res.link || res.devLink || '';

      inviteForm.style.display = 'none';
      if (inviteResult) inviteResult.style.display = 'block';
      const modalTitle = document.getElementById('inviteModalTitle');
      if (modalTitle) modalTitle.textContent = 'Invitation Details';
      if (directLinkInput) directLinkInput.value = link;

      const heading = document.getElementById('inviteResultHeading');
      const status = document.getElementById('inviteResultStatus');
      if (res.emailSent) {
        if (heading) heading.textContent = 'Invitation Sent & Link Ready!';
        if (status) status.innerHTML = `We sent an invitation email to <b>${esc(email)}</b>.<br><small style="color:#7A6E55;">(Note: Automated emails can land in Gmail's Spam or Promotions folder).</small><br>You can also copy the link below and send it directly:`;
        showToast('Invitation sent', `We emailed an invite link to ${email}.`);
      } else {
        if (heading) heading.textContent = 'Invitation Link Created!';
        if (status) status.innerHTML = `Email could not be delivered, but your direct invite link is ready! Share the link below with <b>${esc(email)}</b>:`;
        showToast('Invitation created', `Invite link ready for ${email}.`);
      }

      await loadData();
    } catch (err) {
      errorEl.textContent = errText(err) || 'Failed to send invitation';
      errorEl.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Invite Member';
    }
  });

  document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    Weave.logout();
    window.location.href = 'login.html';
  });

  await loadData();
});
