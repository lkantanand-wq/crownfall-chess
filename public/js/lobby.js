(function () {
  let selectedTc = '10+0';
  let selectedColor = 'random';

  const savedName = localStorage.getItem('crownfall_name') || '';
  const hostNameInput = document.getElementById('host-name');
  const joinNameInput = document.getElementById('join-name');
  hostNameInput.value = savedName;
  joinNameInput.value = savedName;

  // Elo Matchmaking
  const mmFindBtn = document.getElementById('mm-find-btn');
  const mmCancelBtn = document.getElementById('mm-cancel-btn');
  const mmStatusText = document.getElementById('mm-status-text');
  const mmBotFallback = document.getElementById('mm-bot-fallback');
  const myEloBadge = document.getElementById('my-elo-badge');
  const mmSocket = typeof io === 'function' ? io() : null;

  let currentElo = Number(localStorage.getItem('crownfall_guest_elo') || 500);
  myEloBadge.textContent = currentElo;

  fetch('/api/auth/me')
    .then((r) => r.json())
    .then((d) => {
      if (d.user && typeof d.user.elo === 'number') {
        currentElo = d.user.elo;
        myEloBadge.textContent = currentElo;
      }
    })
    .catch(() => {});

  if (mmSocket) {
    mmSocket.on('matchmaking:status', ({ waitSec, range, elo }) => {
      mmStatusText.textContent = `Searching for opponent within ±${range} Elo of ${elo} (${waitSec}s)...`;
      if (waitSec >= 8) mmBotFallback.style.display = 'inline-flex';
    });

    mmSocket.on('matchmaking:found', ({ roomId, opponentName, opponentElo }) => {
      mmStatusText.style.color = 'var(--emerald)';
      mmStatusText.textContent = `Match found vs ${opponentName} (${opponentElo} Elo)! Joining arena...`;
      window.location.href = `/game/${roomId}`;
    });
  }

  mmFindBtn.addEventListener('click', () => {
    if (!mmSocket) return;
    const tc = document.getElementById('mm-tc-select').value;
    const name = hostNameInput.value.trim() || 'Player';
    mmFindBtn.style.display = 'none';
    mmCancelBtn.style.display = 'inline-flex';
    mmSocket.emit('matchmaking:join', { timeControl: tc, playerName: name, guestElo: currentElo });
  });

  mmCancelBtn.addEventListener('click', () => {
    if (mmSocket) mmSocket.emit('matchmaking:cancel');
    mmFindBtn.style.display = 'inline-flex';
    mmCancelBtn.style.display = 'none';
    mmBotFallback.style.display = 'none';
    mmStatusText.textContent = 'Pairs you with an online player within ±100 Elo (widens automatically if needed).';
  });

  document.querySelectorAll('#tc-pills .pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#tc-pills .pill-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedTc = btn.dataset.tc;
    });
  });

  document.querySelectorAll('#color-pills .pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#color-pills .pill-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedColor = btn.dataset.color;
    });
  });

  document.getElementById('create-btn').addEventListener('click', async () => {
    const name = hostNameInput.value.trim() || 'Player 1';
    localStorage.setItem('crownfall_name', name);
    const allowEval = document.getElementById('allow-eval').checked;

    const btn = document.getElementById('create-btn');
    btn.disabled = true;
    btn.textContent = 'Creating Room...';

    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeControl: selectedTc,
          colorPreference: selectedColor,
          allowEval,
          hostName: name
        })
      });
      const data = await res.json();
      window.location.href = `/game/${data.roomId}`;
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Create Room & Enter Arena';
      alert('Failed to create room. Please try again.');
    }
  });

  document.getElementById('join-btn').addEventListener('click', async () => {
    const name = joinNameInput.value.trim() || 'Player 2';
    localStorage.setItem('crownfall_name', name);
    const raw = document.getElementById('room-code-input').value.trim();
    const errEl = document.getElementById('join-error');
    errEl.textContent = '';

    let code = raw;
    const match = raw.match(/\/game\/([A-Za-z0-9]+)/i);
    if (match) code = match[1];
    code = code.toUpperCase().replace(/[^A-Z0-9]/g, '');

    if (!code) {
      errEl.textContent = 'Please enter a valid 6-character room code.';
      return;
    }

    try {
      const res = await fetch(`/api/rooms/${code}`);
      if (!res.ok) {
        errEl.textContent = 'Room not found. Double-check the code with your friend.';
        return;
      }
      window.location.href = `/game/${code}`;
    } catch (err) {
      errEl.textContent = 'Could not reach server.';
    }
  });
})();
