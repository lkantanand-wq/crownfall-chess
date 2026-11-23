(function () {
  const guestEl = document.getElementById('friends-guest');
  const mainEl = document.getElementById('friends-main');
  const msgEl = document.getElementById('friend-msg');

  async function loadFriends() {
    const res = await fetch('/api/friends');
    if (res.status === 401) {
      guestEl.style.display = 'block';
      mainEl.style.display = 'none';
      return;
    }
    const data = await res.json();
    guestEl.style.display = 'none';
    mainEl.style.display = 'grid';

    document.getElementById('my-friend-code').textContent = data.friendCode || '------';

    // Incoming Requests
    const reqList = document.getElementById('requests-list');
    reqList.innerHTML = '';
    if (!data.incoming.length) {
      reqList.innerHTML = '<div style="font-size:0.85rem; color:var(--text-muted);">No pending friend requests.</div>';
    } else {
      data.incoming.forEach((r) => {
        const row = document.createElement('div');
        row.className = 'saved-game-item';
        row.innerHTML = `
          <div class="saved-game-meta">
            <div class="saved-game-title">${escapeHtml(r.displayName)}</div>
            <div class="saved-game-sub">@${escapeHtml(r.username)}</div>
          </div>
        `;
        const btns = document.createElement('div');
        btns.style.display = 'flex';
        btns.style.gap = '6px';

        const acc = document.createElement('button');
        acc.className = 'btn btn-sm btn-emerald';
        acc.textContent = 'Accept';
        acc.addEventListener('click', () => respond(r.id, true));

        const dec = document.createElement('button');
        dec.className = 'btn btn-sm btn-danger';
        dec.textContent = 'Decline';
        dec.addEventListener('click', () => respond(r.id, false));

        btns.appendChild(acc);
        btns.appendChild(dec);
        row.appendChild(btns);
        reqList.appendChild(row);
      });
    }

    // Friends List
    const fList = document.getElementById('friends-list');
    fList.innerHTML = '';
    if (!data.friends.length) {
      fList.innerHTML = '<div style="font-size:0.88rem; color:var(--text-muted);">No friends added yet. Share your Friend Code above!</div>';
    } else {
      data.friends.forEach((f) => {
        const row = document.createElement('div');
        row.className = 'saved-game-item';
        row.innerHTML = `
          <div class="saved-game-meta">
            <div class="saved-game-title" style="display:flex; align-items:center; gap:8px;">
              <span class="status-dot ${f.online ? 'online' : ''}"></span>
              <span>${escapeHtml(f.displayName)}</span>
            </div>
            <div class="saved-game-sub">@${escapeHtml(f.username)} • ${f.online ? 'Online' : 'Offline'}</div>
          </div>
        `;
        const btns = document.createElement('div');
        btns.style.display = 'flex';
        btns.style.gap = '8px';

        const chal = document.createElement('button');
        chal.className = 'btn btn-sm btn-primary';
        chal.textContent = 'Challenge';
        chal.addEventListener('click', async () => {
          chal.disabled = true;
          chal.textContent = 'Creating...';
          const tc = document.getElementById('challenge-tc').value;
          const r = await fetch('/api/friends/challenge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ friendId: f.id, timeControl: tc })
          });
          const d = await r.json();
          if (d.roomId) window.location.href = `/game/${d.roomId}`;
        });

        const rem = document.createElement('button');
        rem.className = 'btn btn-sm btn-danger';
        rem.textContent = 'Remove';
        rem.addEventListener('click', async () => {
          await fetch('/api/friends/remove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ friendId: f.id })
          });
          loadFriends();
        });

        btns.appendChild(chal);
        btns.appendChild(rem);
        row.appendChild(btns);
        fList.appendChild(row);
      });
    }
  }

  async function respond(requesterId, accept) {
    await fetch('/api/friends/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requesterId, accept })
    });
    loadFriends();
  }

  document.getElementById('add-friend-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    msgEl.textContent = '';
    const q = document.getElementById('friend-query').value.trim();
    const res = await fetch('/api/friends/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q })
    });
    const data = await res.json();
    if (!res.ok) {
      msgEl.style.color = 'var(--danger)';
      msgEl.textContent = data.error || 'Could not send request';
      return;
    }
    msgEl.style.color = 'var(--emerald)';
    msgEl.textContent = `Friend request sent to ${data.targetName}!`;
    document.getElementById('friend-query').value = '';
    loadFriends();
  });

  document.getElementById('copy-code-btn').addEventListener('click', () => {
    const code = document.getElementById('my-friend-code').textContent;
    navigator.clipboard.writeText(code).then(() => {
      const b = document.getElementById('copy-code-btn');
      b.textContent = 'Copied!';
      setTimeout(() => (b.textContent = 'Copy Code'), 1500);
    });
  });

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  loadFriends();
})();
