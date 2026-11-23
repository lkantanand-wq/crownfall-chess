(function () {
  const game = new CrownfallEngine.ChessGame(CrownfallEngine.INITIAL_FEN);
  const evalWorker = new Worker('/js/eval-worker.js');

  let fullHistory = [];
  let currentPly = 0;
  let flipped = false;
  let selectedSq = null;
  let legalTargets = [];
  let evalReqId = 0;

  const boardEl = document.getElementById('chessboard');
  const evalBar = document.getElementById('eval-bar');
  const evalFillWhite = document.getElementById('eval-fill-white');
  const evalScoreEl = document.getElementById('eval-score');
  const moveListEl = document.getElementById('move-list');
  const fenInput = document.getElementById('fen-input');
  const modeSelect = document.getElementById('mode-select');
  const themeSelect = document.getElementById('theme-select');
  const bestHintEl = document.getElementById('best-move-hint');
  const turnBadge = document.getElementById('turn-badge');
  const recentListEl = document.getElementById('recent-games-list');

  // Apply saved theme
  const savedTheme = CrownfallStorage.getBoardTheme();
  themeSelect.value = savedTheme;
  CrownfallStorage.applyBoardTheme(savedTheme);
  themeSelect.addEventListener('change', () => {
    CrownfallStorage.applyBoardTheme(themeSelect.value);
  });

  function renderRecentGames() {
    const games = CrownfallStorage.getRecentGames();
    recentListEl.innerHTML = '';
    if (games.length === 0) {
      recentListEl.innerHTML = '<div style="font-size:0.82rem; color:var(--text-muted);">Finish a match to see your last 3 games here.</div>';
      return;
    }
    games.forEach((g) => {
      const item = document.createElement('div');
      item.className = 'saved-game-item';
      const meta = document.createElement('div');
      meta.className = 'saved-game-meta';

      const title = document.createElement('div');
      title.className = 'saved-game-title';
      title.textContent = `${g.whiteName} vs ${g.blackName} (${g.resultLabel})`;

      const sub = document.createElement('div');
      sub.className = 'saved-game-sub';
      sub.textContent = `${g.timeLabel || 'Match'} • ${g.history.length} moves • ${g.reason || ''}`;

      meta.appendChild(title);
      meta.appendChild(sub);

      const btn = document.createElement('button');
      btn.className = 'btn btn-sm btn-primary';
      btn.textContent = 'Analyze';
      btn.addEventListener('click', () => {
        modeSelect.value = 'analysis';
        fullHistory = g.history || [];
        jumpToPly(0);
      });

      item.appendChild(meta);
      item.appendChild(btn);
      recentListEl.appendChild(item);
    });
  }

  // Check if arriving from a finished multiplayer game
  const imported = sessionStorage.getItem('crownfall_analysis_history');
  if (imported) {
    try {
      const parsed = JSON.parse(imported);
      if (Array.isArray(parsed) && parsed.length > 0) {
        fullHistory = parsed;
        currentPly = parsed.length;
        game.load(parsed[parsed.length - 1].fenAfter);
      }
    } catch (_) {}
    sessionStorage.removeItem('crownfall_analysis_history');
  }

  function updateEval(fen) {
    evalReqId++;
    bestHintEl.textContent = 'Best move: calculating...';
    evalWorker.postMessage({ id: evalReqId, fen, depth: 3 });
  }

  evalWorker.onmessage = (e) => {
    const { id, scoreCp, mateIn, bestMove } = e.data;
    if (id !== evalReqId) return;

    let label = '0.0';
    let whitePct = 50;
    if (mateIn !== null && mateIn !== undefined) {
      label = `M${Math.abs(mateIn)}`;
      whitePct = mateIn > 0 ? 98 : 2;
    } else {
      const pawns = scoreCp / 100;
      label = (pawns >= 0 ? '+' : '') + pawns.toFixed(1);
      whitePct = 50 + 46 * (2 / (1 + Math.exp(-0.0038 * scoreCp)) - 1);
      whitePct = Math.max(4, Math.min(96, whitePct));
    }

    evalScoreEl.textContent = label;
    evalFillWhite.style.height = `${whitePct}%`;
    bestHintEl.textContent = bestMove
      ? `Best move: ${bestMove.from} → ${bestMove.to}`
      : 'Game over';
  };

  function jumpToPly(ply) {
    currentPly = Math.max(0, Math.min(fullHistory.length, ply));
    const fen = currentPly === 0 ? CrownfallEngine.INITIAL_FEN : fullHistory[currentPly - 1].fenAfter;
    game.load(fen);
    selectedSq = null;
    legalTargets = [];
    render();
  }

  function saveIfBotGameOver() {
    const st = game.getStatus();
    if (!st.over || fullHistory.length === 0) return;
    if (!modeSelect.value.startsWith('bot')) return;
    const resultLabel = st.winner === 'draw' ? '½-½' : (st.winner === 'w' ? '1-0' : '0-1');
    CrownfallStorage.saveRecentGame({
      id: 'bot_' + Date.now(),
      whiteName: 'You',
      blackName: 'Crownfall Bot',
      timeLabel: modeSelect.options[modeSelect.selectedIndex].text,
      resultLabel,
      reason: st.reason,
      history: fullHistory
    });
    renderRecentGames();
  }

  function maybeTriggerBot() {
    const mode = modeSelect.value;
    if (mode === 'analysis' || game.getStatus().over) return;
    if (game.turn !== 'b') return;

    const depth = mode === 'bot-easy' ? 1 : mode === 'bot-med' ? 2 : 3;
    setTimeout(() => {
      if (game.turn !== 'b' || game.getStatus().over) return;
      const res = game.searchBestMove(depth);
      if (!res.bestMove) return;
      const mv = game.makeMove(res.bestMove);
      if (mv) {
        fullHistory = fullHistory.slice(0, currentPly);
        fullHistory.push(mv);
        currentPly = fullHistory.length;
        CrownfallSound.move();
        render();
        saveIfBotGameOver();
      }
    }, 250);
  }

  function onSquareClick(sqAlg) {
    if (game.getStatus().over) return;
    const mode = modeSelect.value;
    if (mode !== 'analysis' && game.turn === 'b') return;

    if (selectedSq) {
      const match = legalTargets.find((m) => CrownfallEngine.idxToAlgebraic(m.to) === sqAlg);
      if (match) {
        const mv = game.makeMove({ from: selectedSq, to: sqAlg, promotion: match.promotion ? 'q' : null });
        if (mv) {
          fullHistory = fullHistory.slice(0, currentPly);
          fullHistory.push(mv);
          currentPly = fullHistory.length;
          selectedSq = null;
          legalTargets = [];
          if (mv.captured) CrownfallSound.capture();
          else CrownfallSound.move();
          render();
          saveIfBotGameOver();
          maybeTriggerBot();
          return;
        }
      }
    }

    const idx = CrownfallEngine.algebraicToIdx(sqAlg);
    const p = game.board[idx];
    if (p && CrownfallEngine.pieceColor(p) === game.turn) {
      selectedSq = sqAlg;
      legalTargets = game.legalMoves(sqAlg);
    } else {
      selectedSq = null;
      legalTargets = [];
    }
    renderBoardOnly();
  }

  function renderBoardOnly() {
    const lastMove = currentPly > 0 ? fullHistory[currentPly - 1] : null;
    const kingCheckIdx = game.inCheck(game.turn) ? game.findKing(game.turn) : -1;

    boardEl.innerHTML = '';
    for (let rVis = 0; rVis < 8; rVis++) {
      for (let cVis = 0; cVis < 8; cVis++) {
        const r = flipped ? 7 - rVis : rVis;
        const c = flipped ? 7 - cVis : cVis;
        const idx = r * 8 + c;
        const sqAlg = CrownfallEngine.idxToAlgebraic(idx);
        const sqEl = document.createElement('div');
        sqEl.className = `square ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
        if (lastMove && (lastMove.from === sqAlg || lastMove.to === sqAlg)) sqEl.classList.add('last-move');
        if (selectedSq === sqAlg) sqEl.classList.add('selected');
        if (idx === kingCheckIdx) sqEl.classList.add('in-check');

        const p = game.board[idx];
        if (p) sqEl.insertAdjacentHTML('beforeend', CrownfallPieces.getSvg(p));
        if (legalTargets.some((m) => CrownfallEngine.idxToAlgebraic(m.to) === sqAlg)) {
          const ind = document.createElement('div');
          ind.className = p ? 'legal-ring' : 'legal-dot';
          sqEl.appendChild(ind);
        }
        sqEl.addEventListener('click', () => onSquareClick(sqAlg));
        boardEl.appendChild(sqEl);
      }
    }
    evalBar.classList.toggle('flipped', flipped);
  }

  function render() {
    renderBoardOnly();
    fenInput.value = game.fen();
    const status = game.getStatus();
    if (status.over) {
      turnBadge.textContent = status.winner === 'draw' ? 'Draw' : `${status.winner === 'w' ? 'White' : 'Black'} Wins`;
    } else {
      turnBadge.textContent = game.turn === 'w' ? 'White Turn' : 'Black Turn';
    }

    moveListEl.innerHTML = '';
    for (let i = 0; i < fullHistory.length; i += 2) {
      const num = document.createElement('div');
      num.className = 'move-num';
      num.textContent = `${i / 2 + 1}.`;
      moveListEl.appendChild(num);

      const wCell = document.createElement('div');
      wCell.className = 'move-cell' + (currentPly === i + 1 ? ' active' : '');
      wCell.textContent = fullHistory[i].san;
      wCell.addEventListener('click', () => jumpToPly(i + 1));
      moveListEl.appendChild(wCell);

      const bCell = document.createElement('div');
      if (fullHistory[i + 1]) {
        bCell.className = 'move-cell' + (currentPly === i + 2 ? ' active' : '');
        bCell.textContent = fullHistory[i + 1].san;
        bCell.addEventListener('click', () => jumpToPly(i + 2));
      }
      moveListEl.appendChild(bCell);
    }

    updateEval(game.fen());
  }

  document.getElementById('flip-btn').addEventListener('click', () => {
    flipped = !flipped;
    renderBoardOnly();
  });
  document.getElementById('reset-btn').addEventListener('click', () => {
    fullHistory = [];
    currentPly = 0;
    game.load(CrownfallEngine.INITIAL_FEN);
    selectedSq = null;
    legalTargets = [];
    render();
  });
  document.getElementById('nav-start').addEventListener('click', () => jumpToPly(0));
  document.getElementById('nav-prev').addEventListener('click', () => jumpToPly(currentPly - 1));
  document.getElementById('nav-next').addEventListener('click', () => jumpToPly(currentPly + 1));
  document.getElementById('nav-end').addEventListener('click', () => jumpToPly(fullHistory.length));
  document.getElementById('load-fen-btn').addEventListener('click', () => {
    try {
      game.load(fenInput.value.trim());
      fullHistory = [];
      currentPly = 0;
      render();
    } catch (_) {
      alert('Invalid FEN string.');
    }
  });

  renderRecentGames();
  render();
})();
