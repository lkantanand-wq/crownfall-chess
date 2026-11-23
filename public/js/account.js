(function () {
  const authSection = document.getElementById('auth-section');
  const profileSection = document.getElementById('profile-section');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');

  tabLogin.addEventListener('click', () => {
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    tabLogin.classList.add('btn-primary');
    tabRegister.classList.remove('btn-primary');
  });

  tabRegister.addEventListener('click', () => {
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    tabRegister.classList.add('btn-primary');
    tabLogin.classList.remove('btn-primary');
  });

  async function init() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'google_not_configured') {
      document.getElementById('google-note').textContent = 'Google OAuth is not configured on this server yet (set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Render/Replit).';
    } else if (params.get('error')) {
      document.getElementById('google-note').textContent = 'Google sign-in failed. Please try again or use username/password.';
    }

    try {
      const cfg = await (await fetch('/api/auth/config')).json();
      if (!cfg.googleEnabled) {
        document.getElementById('google-note').textContent = 'Tip: Set GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET on your host to enable Google Sign-In.';
      }
    } catch (_) {}

    const meRes = await fetch('/api/auth/me');
    const meData = await meRes.json();
    if (meData.user) {
      showProfile(meData.user);
    } else {
      authSection.style.display = 'grid';
      profileSection.style.display = 'none';
    }
  }

  async function showProfile(user) {
    authSection.style.display = 'none';
    profileSection.style.display = 'grid';
    document.getElementById('profile-name').textContent = user.displayName;
    document.getElementById('profile-meta').textContent = `@${user.username} • Friend Code: ${user.friendCode}${user.email ? ' • ' + user.email : ''}`;

    const gamesRes = await fetch('/api/games');
    const gamesData = await gamesRes.json();
    const games = gamesData.games || [];
    document.getElementById('games-count-badge').textContent = `${games.length} Games`;

    const listEl = document.getElementById('account-games-list');
    listEl.innerHTML = '';
    if (games.length === 0) {
      listEl.innerHTML = '<div style="color:var(--text-muted); font-size:0.9rem;">No saved matches yet. Play an online game while signed in to save it here automatically.</div>';
      return;
    }

    games.forEach((g) => {
      const row = document.createElement('div');
      row.className = 'saved-game-item';
      const meta = document.createElement('div');
      meta.className = 'saved-game-meta';

      const title = document.createElement('div');
      title.className = 'saved-game-title';
      title.textContent = `${g.whiteName} vs ${g.blackName} (${g.resultLabel})`;

      const sub = document.createElement('div');
      sub.className = 'saved-game-sub';
      const dt = g.playedAt ? new Date(g.playedAt).toLocaleDateString() : '';
      sub.textContent = `${g.timeLabel || 'Match'} • ${(g.history || []).length} moves • ${g.reason || ''}${dt ? ' • ' + dt : ''}`;

      meta.appendChild(title);
      meta.appendChild(sub);

      const btn = document.createElement('button');
      btn.className = 'btn btn-sm btn-primary';
      btn.textContent = 'Analyze';
      btn.addEventListener('click', () => {
        sessionStorage.setItem('crownfall_analysis_history', JSON.stringify(g.history || []));
        window.location.href = '/analysis';
      });

      row.appendChild(meta);
      row.appendChild(btn);
      listEl.appendChild(row);
    });
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('login-err');
    errEl.textContent = '';
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: document.getElementById('login-id').value,
        password: document.getElementById('login-pw').value
      })
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error || 'Sign in failed';
      return;
    }
    window.location.reload();
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('reg-err');
    errEl.textContent = '';
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('reg-username').value,
        displayName: document.getElementById('reg-name').value,
        email: document.getElementById('reg-email').value,
        password: document.getElementById('reg-pw').value
      })
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error || 'Registration failed';
      return;
    }
    window.location.reload();
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.reload();
  });

  init();
})();
