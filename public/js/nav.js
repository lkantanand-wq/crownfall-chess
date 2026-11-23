(function () {
  window.CrownfallAuth = { user: null };

  async function initNav() {
    const accountLink = document.getElementById('nav-account-link');
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      window.CrownfallAuth.user = data.user || null;
      if (accountLink) {
        if (data.user) {
          accountLink.textContent = `@${data.user.username}`;
          localStorage.setItem('crownfall_name', data.user.displayName);
        } else {
          accountLink.textContent = 'Sign In';
        }
      }
      if (data.user && typeof io === 'function') {
        const navSocket = io();
        navSocket.on('friend:challenge', ({ roomId, fromName, timeLabel }) => {
          showChallengeToast(roomId, fromName, timeLabel);
        });
      }
    } catch (_) {}
  }

  function showChallengeToast(roomId, fromName, timeLabel) {
    let toast = document.getElementById('challenge-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'challenge-toast';
      toast.style.cssText = 'position:fixed; bottom:20px; right:20px; z-index:200; background:#19202e; border:1px solid #e2b754; border-radius:14px; padding:16px 18px; box-shadow:0 16px 40px rgba(0,0,0,0.6); max-width:340px;';
      document.body.appendChild(toast);
    }
    toast.innerHTML = `
      <div style="font-weight:700; color:#e2b754; margin-bottom:4px;">Incoming Match Challenge</div>
      <div style="font-size:0.9rem; color:#f4f1ea; margin-bottom:12px;"><strong>${escapeHtml(fromName)}</strong> challenged you (${escapeHtml(timeLabel)})</div>
      <div style="display:flex; gap:8px;">
        <a href="/game/${encodeURIComponent(roomId)}" class="btn btn-sm btn-emerald" style="flex:1;">Accept &amp; Play</a>
        <button type="button" id="dismiss-chal-btn" class="btn btn-sm">Dismiss</button>
      </div>
    `;
    toast.querySelector('#dismiss-chal-btn').addEventListener('click', () => toast.remove());
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNav);
  } else {
    initNav();
  }
})();
