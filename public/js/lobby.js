(function () {
  let selectedTc = '10+0';
  let selectedColor = 'random';

  const savedName = localStorage.getItem('crownfall_name') || '';
  const hostNameInput = document.getElementById('host-name');
  const joinNameInput = document.getElementById('join-name');
  hostNameInput.value = savedName;
  joinNameInput.value = savedName;

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
