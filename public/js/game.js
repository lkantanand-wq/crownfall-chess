(function () {
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const roomId = (pathParts[pathParts.length - 1] || '').toUpperCase();
  document.getElementById('room-code-display').textContent = roomId || '------';

  let playerToken = localStorage.getItem('crownfall_token');
  if (!playerToken) {
    playerToken = 'tok_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('crownfall_token', playerToken);
  }
  const playerName = localStorage.getItem('crownfall_name') || 'Player';

  const socket = io();
  const evalWorker = new Worker('/js/eval-worker.js');

  let myColor = 'w';
  let flipped = false;
  let evalEnabled = true;
  let evalHiddenByUser = false;
  let snapshot = null;
  let selectedSq = null;
  let legalTargets = [];
  let pendingPromotion = null;
  let inspectPly = null; // null means live
  let lastEvalReqId = 0;
  let localClockInterval = null;
  let lastLocalSyncAt = Date.now();
  let lastHistoryLen = 0;

  const boardEl = document.getElementById('chessboard');
  const evalWrapper = document.getElementById('eval-wrapper');
  const evalBar = document.getElementById('eval-bar');
  const evalFillWhite = document.getElementById('eval-fill-white');
  const evalScoreEl = document.getElementById('eval-score');
  const moveListEl = document.getElementById('move-list');
  const liveMoveBtn = document.getElementById('live-move-btn');
  const statusBanner = document.getElementById('status-banner');
  const drawBanner = document.getElementById('draw-banner');
  const gameoverModal = document.getElementById('gameover-modal');
  const themeSelect = document.getElementById('theme-select');
  const savedTheme = CrownfallStorage.getBoardTheme();
  themeSelect.value = savedTheme;
  CrownfallStorage.applyBoardTheme(savedTheme);
  themeSelect.addEventListener('change', () => {
    CrownfallStorage.applyBoardTheme(themeSelect.value);
  });

  function formatClock(ms) {
    if (snapshot && snapshot.baseMs === 0) return '∞';
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  }

  function updateEvalUI(scoreCp, mateIn) {
    let label = '0.0';
    let whitePct = 50;

    if (mateIn !== null && mateIn !== undefined) {
      label = `M${Math.abs(mateIn)}`;
      whitePct = mateIn > 0 ? 98 : 2;
    } else {
      const pawns = scoreCp / 100;
      label = (pawns >= 0 ? '+' : '') + pawns.toFixed(1);
      // Smooth sigmoid mapping for centipawns -> percentage
      whitePct = 50 + 46 * (2 / (1 + Math.exp(-0.0038 * scoreCp)) - 1);
      whitePct = Math.max(4, Math.min(96, whitePct));
    }

    evalScoreEl.textContent = label;
    evalFillWhite.style.height = `${whitePct}%`;
  }

  evalWorker.onmessage = (e) => {
    const { id, scoreCp, mateIn } = e.data;
    if (id !== lastEvalReqId) return;
    updateEvalUI(scoreCp, mateIn);
  };

  function requestEval(fen) {
    if (!evalEnabled || evalHiddenByUser) return;
    lastEvalReqId++;
    evalWorker.postMessage({ id: lastEvalReqId, fen, depth: 3 });
  }

  function computeCaptured(board) {
    const startCounts = { P: 8, N: 2, B: 2, R: 2, Q: 1, p: 8, n: 2, b: 2, r: 2, q: 1 };
    const current = {};
    for (const p of board) {
      if (p) current[p] = (current[p] || 0) + 1;
    }
    const vals = { p: 1, n: 3, b: 3, r: 5, q: 9 };
    const glyphs = {
      P: '♙', N: '♘', B: '♗', R: '♖', Q: '♕',
      p: '♟', n: '♞', b: '♝', r: '♜', q: '♛'
    };

    const capturedByWhite = [];
    const capturedByBlack = [];
    let whiteMat = 0;
    let blackMat = 0;

    for (const k of ['q', 'r', 'b', 'n', 'p']) {
      const missingBlack = Math.max(0, startCounts[k] - (current[k] || 0));
      for (let i = 0; i < missingBlack; i++) {
        capturedByWhite.push(glyphs[k]);
        whiteMat += vals[k];
      }
      const upper = k.toUpperCase();
      const missingWhite = Math.max(0, startCounts[upper] - (current[upper] || 0));
      for (let i = 0; i < missingWhite; i++) {
        capturedByBlack.push(glyphs[upper]);
        blackMat += vals[k];
      }
    }

    return {
      w: { list: capturedByWhite.join(''), adv: whiteMat - blackMat },
      b: { list: capturedByBlack.join(''), adv: blackMat - whiteMat }
    };
  }

  function renderBoard() {
    if (!snapshot) return;
    const isInspecting = inspectPly !== null && inspectPly < snapshot.history.length;
    const displayFen = isInspecting
      ? (inspectPly === 0 ? CrownfallEngine.INITIAL_FEN : snapshot.history[inspectPly - 1].fenAfter)
      : snapshot.fen;

    const game = new CrownfallEngine.ChessGame(displayFen);
    const lastMove = isInspecting
      ? (inspectPly > 0 ? snapshot.history[inspectPly - 1] : null)
      : (snapshot.history.length > 0 ? snapshot.history[snapshot.history.length - 1] : null);

    const kingInCheckIdx = game.inCheck(game.turn) ? game.findKing(game.turn) : -1;

    boardEl.innerHTML = '';
    for (let rVis = 0; rVis < 8; rVis++) {
      for (let cVis = 0; cVis < 8; cVis++) {
        const r = flipped ? 7 - rVis : rVis;
        const c = flipped ? 7 - cVis : cVis;
        const idx = r * 8 + c;
        const sqAlg = CrownfallEngine.idxToAlgebraic(idx);
        const isLight = (r + c) % 2 === 0;

        const sqEl = document.createElement('div');
        sqEl.className = `square ${isLight ? 'light' : 'dark'}`;
        if (lastMove && (lastMove.from === sqAlg || lastMove.to === sqAlg)) {
          sqEl.classList.add('last-move');
        }
        if (selectedSq === sqAlg) {
          sqEl.classList.add('selected');
        }
        if (idx === kingInCheckIdx) {
          sqEl.classList.add('in-check');
        }

        if (cVis === 0) {
          const rankLbl = document.createElement('span');
          rankLbl.className = 'coord-rank';
          rankLbl.textContent = CrownfallEngine.RANKS[r];
          sqEl.appendChild(rankLbl);
        }
        if (rVis === 7) {
          const fileLbl = document.createElement('span');
          fileLbl.className = 'coord-file';
          fileLbl.textContent = CrownfallEngine.FILES[c];
          sqEl.appendChild(fileLbl);
        }

        const piece = game.board[idx];
        if (piece) {
          sqEl.insertAdjacentHTML('beforeend', CrownfallPieces.getSvg(piece));
        }

        const isLegalTarget = legalTargets.some((m) => CrownfallEngine.idxToAlgebraic(m.to) === sqAlg);
        if (isLegalTarget) {
          const indicator = document.createElement('div');
          indicator.className = piece ? 'legal-ring' : 'legal-dot';
          sqEl.appendChild(indicator);
        }

        sqEl.addEventListener('click', () => onSquareClick(sqAlg, game));
        boardEl.appendChild(sqEl);
      }
    }

    // Update Eval Bar flip state
    evalBar.classList.toggle('flipped', flipped);
    updatePlayerBars(game);
  }

  function onSquareClick(sqAlg, game) {
    if (!snapshot || !snapshot.started || snapshot.over) return;
    if (inspectPly !== null) return;
    if (myColor !== snapshot.turn) return;

    if (selectedSq) {
      const matchingMoves = legalTargets.filter((m) => CrownfallEngine.idxToAlgebraic(m.to) === sqAlg);
      if (matchingMoves.length > 0) {
        if (matchingMoves[0].promotion) {
          openPromotionModal(selectedSq, sqAlg);
        } else {
          socket.emit('game:move', { from: selectedSq, to: sqAlg });
        }
        selectedSq = null;
        legalTargets = [];
        renderBoard();
        return;
      }
    }

    const idx = CrownfallEngine.algebraicToIdx(sqAlg);
    const p = game.board[idx];
    if (p && CrownfallEngine.pieceColor(p) === myColor) {
      selectedSq = sqAlg;
      legalTargets = game.legalMoves(sqAlg);
    } else {
      selectedSq = null;
      legalTargets = [];
    }
    renderBoard();
  }

  function openPromotionModal(from, to) {
    pendingPromotion = { from, to };
    const choicesEl = document.getElementById('promo-choices');
    choicesEl.innerHTML = '';
    const pieces = myColor === 'w' ? ['Q', 'R', 'B', 'N'] : ['q', 'r', 'b', 'n'];
    pieces.forEach((p) => {
      const btn = document.createElement('button');
      btn.className = 'promo-btn';
      btn.innerHTML = CrownfallPieces.getSvg(p);
      btn.addEventListener('click', () => {
        socket.emit('game:move', {
          from: pendingPromotion.from,
          to: pendingPromotion.to,
          promotion: p.toLowerCase()
        });
        document.getElementById('promo-modal').classList.remove('open');
        pendingPromotion = null;
      });
      choicesEl.appendChild(btn);
    });
    document.getElementById('promo-modal').classList.add('open');
  }

  function updatePlayerBars(game) {
    if (!snapshot) return;
    const topColor = flipped ? 'w' : 'b';
    const bottomColor = flipped ? 'b' : 'w';
    const cap = computeCaptured(game.board);

    const fillBar = (prefix, color) => {
      const pInfo = snapshot.players[color];
      const avatar = document.getElementById(`${prefix}-avatar`);
      avatar.className = `avatar ${color === 'w' ? 'white' : 'black'}`;
      avatar.textContent = pInfo ? pInfo.name.slice(0, 2).toUpperCase() : (color === 'w' ? 'W' : 'B');

      document.getElementById(`${prefix}-name`).textContent = pInfo
        ? `${pInfo.name}${color === myColor ? ' (You)' : ''}`
        : 'Waiting for player...';

      const dot = document.getElementById(`${prefix}-dot`);
      dot.classList.toggle('online', Boolean(pInfo && pInfo.connected));

      const capText = cap[color].list + (cap[color].adv > 0 ? ` +${cap[color].adv}` : '');
      document.getElementById(`${prefix}-captured`).textContent = capText;

      const barEl = document.getElementById(`${prefix}-player-bar`);
      barEl.classList.toggle('active-turn', snapshot.started && !snapshot.over && snapshot.turn === color);
    };

    fillBar('top', topColor);
    fillBar('bottom', bottomColor);
    renderClocks();
  }

  function renderClocks() {
    if (!snapshot) return;
    const topColor = flipped ? 'w' : 'b';
    const bottomColor = flipped ? 'b' : 'w';
    const elapsed = (snapshot.started && !snapshot.over && snapshot.baseMs > 0)
      ? Date.now() - lastLocalSyncAt
      : 0;

    const getMs = (c) => {
      if (snapshot.baseMs === 0) return 0;
      return snapshot.turn === c ? Math.max(0, snapshot.clocks[c] - elapsed) : snapshot.clocks[c];
    };

    const applyClock = (elId, c) => {
      const el = document.getElementById(elId);
      const ms = getMs(c);
      el.textContent = formatClock(ms);
      el.classList.toggle('active', snapshot.started && !snapshot.over && snapshot.turn === c);
      el.classList.toggle('low', snapshot.baseMs > 0 && ms > 0 && ms < 20000);
    };

    applyClock('top-clock', topColor);
    applyClock('bottom-clock', bottomColor);
  }

  function renderMoves() {
    if (!snapshot) return;
    moveListEl.innerHTML = '';
    const hist = snapshot.history;
    for (let i = 0; i < hist.length; i += 2) {
      const num = document.createElement('div');
      num.className = 'move-num';
      num.textContent = `${i / 2 + 1}.`;
      moveListEl.appendChild(num);

      const wCell = document.createElement('div');
      wCell.className = 'move-cell' + (inspectPly === i + 1 || (inspectPly === null && i === hist.length - 1) ? ' active' : '');
      wCell.textContent = hist[i].san;
      wCell.addEventListener('click', () => {
        inspectPly = i + 1 === hist.length ? null : i + 1;
        liveMoveBtn.style.display = inspectPly !== null ? 'inline-flex' : 'none';
        renderBoard();
        renderMoves();
      });
      moveListEl.appendChild(wCell);

      const bCell = document.createElement('div');
      if (hist[i + 1]) {
        bCell.className = 'move-cell' + (inspectPly === i + 2 || (inspectPly === null && i + 1 === hist.length - 1) ? ' active' : '');
        bCell.textContent = hist[i + 1].san;
        bCell.addEventListener('click', () => {
          inspectPly = i + 2 === hist.length ? null : i + 2;
          liveMoveBtn.style.display = inspectPly !== null ? 'inline-flex' : 'none';
          renderBoard();
          renderMoves();
        });
      }
      moveListEl.appendChild(bCell);
    }
    moveListEl.scrollTop = moveListEl.scrollHeight;
  }

  function renderStatusAndControls() {
    if (!snapshot) return;
    document.getElementById('time-badge').textContent = snapshot.timeLabel;

    evalEnabled = snapshot.allowEval;
    const toggleEvalBtn = document.getElementById('toggle-eval-btn');
    if (!evalEnabled) {
      evalWrapper.classList.add('hidden');
      toggleEvalBtn.disabled = true;
      toggleEvalBtn.textContent = 'Eval Disabled';
    } else {
      evalWrapper.classList.toggle('hidden', evalHiddenByUser);
      toggleEvalBtn.disabled = false;
      toggleEvalBtn.textContent = evalHiddenByUser ? 'Show Eval' : 'Hide Eval';
    }

    if (!snapshot.started && !snapshot.over) {
      statusBanner.textContent = 'Waiting for your friend to open the invite link...';
    } else if (snapshot.over) {
      statusBanner.textContent = 'Match finished.';
    } else {
      const turnName = snapshot.turn === 'w' ? 'White' : 'Black';
      statusBanner.textContent = `${turnName} to move${snapshot.inCheck ? ' — CHECK!' : ''}`;
    }

    const showDrawOffer = snapshot.drawOfferBy && snapshot.drawOfferBy !== myColor && myColor !== 'spectator' && !snapshot.over;
    drawBanner.style.display = showDrawOffer ? 'flex' : 'none';

    if (snapshot.over && snapshot.result) {
      const r = snapshot.result;
      const titleEl = document.getElementById('gameover-title');
      const subEl = document.getElementById('gameover-subtitle');
      if (r.winner === 'draw') {
        titleEl.textContent = 'Draw';
      } else if (myColor === 'spectator') {
        titleEl.textContent = `${r.winner === 'w' ? 'White' : 'Black'} Wins`;
      } else {
        titleEl.textContent = r.winner === myColor ? 'Victory!' : 'Defeat';
      }
      const reasonLabels = {
        checkmate: 'by Checkmate',
        timeout: 'on Time',
        resignation: 'by Resignation',
        stalemate: 'by Stalemate',
        insufficient_material: 'by Insufficient Material',
        threefold_repetition: 'by Threefold Repetition',
        fifty_move_rule: 'by 50-Move Rule',
        agreement: 'by Mutual Agreement'
      };
      subEl.textContent = reasonLabels[r.reason] || 'Match complete';
      document.getElementById('rematch-btn').textContent = `Rematch (${snapshot.rematchCount || 0}/2)`;
      if (snapshot.history && snapshot.history.length > 0) {
        const resLabel = r.winner === 'draw' ? '½-½' : (r.winner === 'w' ? '1-0' : '0-1');
        CrownfallStorage.saveRecentGame({
          id: `${snapshot.roomId}_${snapshot.history.length}_${r.reason}`,
          whiteName: snapshot.players.w ? snapshot.players.w.name : 'White',
          blackName: snapshot.players.b ? snapshot.players.b.name : 'Black',
          timeLabel: snapshot.timeLabel,
          resultLabel: resLabel,
          reason: reasonLabels[r.reason] || r.reason,
          history: snapshot.history
        });
      }
      gameoverModal.classList.add('open');
    } else {
      gameoverModal.classList.remove('open');
    }
  }

  function appendChat(msg) {
    const box = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'chat-msg';
    const strong = document.createElement('strong');
    strong.textContent = msg.sender + ':';
    div.appendChild(strong);
    div.appendChild(document.createTextNode(msg.text));
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  function handleSnapshot(newSnap) {
    const hadNewMove = snapshot && newSnap.history.length > lastHistoryLen;
    snapshot = newSnap;
    lastLocalSyncAt = Date.now();

    if (hadNewMove) {
      const last = snapshot.history[snapshot.history.length - 1];
      inspectPly = null;
      liveMoveBtn.style.display = 'none';
      if (snapshot.over) CrownfallSound.gameOver();
      else if (snapshot.inCheck) CrownfallSound.check();
      else if (last.captured) CrownfallSound.capture();
      else CrownfallSound.move();
    }
    lastHistoryLen = snapshot.history.length;

    renderStatusAndControls();
    renderBoard();
    renderMoves();
    requestEval(snapshot.fen);
  }

  socket.on('connect', () => {
    socket.emit('room:join', { roomId, playerName, playerToken });
  });

  socket.on('room:joined', ({ color, snapshot: snap }) => {
    myColor = color;
    flipped = myColor === 'b';
    document.getElementById('chat-messages').innerHTML = '';
    (snap.chat || []).forEach(appendChat);
    handleSnapshot(snap);

    if (!localClockInterval) {
      localClockInterval = setInterval(renderClocks, 150);
    }
  });

  socket.on('room:colorUpdated', ({ color }) => {
    myColor = color;
    flipped = myColor === 'b';
    selectedSq = null;
    legalTargets = [];
  });

  socket.on('game:state', (snap) => {
    handleSnapshot(snap);
  });

  socket.on('chat:message', appendChat);

  socket.on('room:error', ({ message }) => {
    statusBanner.style.color = 'var(--danger)';
    statusBanner.textContent = message;
  });

  // UI Listeners
  document.getElementById('copy-link-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      const btn = document.getElementById('copy-link-btn');
      btn.textContent = 'Copied!';
      setTimeout(() => (btn.textContent = 'Copy Invite Link'), 1800);
    });
  });

  document.getElementById('flip-btn').addEventListener('click', () => {
    flipped = !flipped;
    renderBoard();
  });

  document.getElementById('toggle-eval-btn').addEventListener('click', () => {
    evalHiddenByUser = !evalHiddenByUser;
    renderStatusAndControls();
    if (!evalHiddenByUser && snapshot) requestEval(snapshot.fen);
  });

  document.getElementById('draw-btn').addEventListener('click', () => socket.emit('game:offerDraw'));
  document.getElementById('accept-draw-btn').addEventListener('click', () => socket.emit('game:offerDraw'));
  document.getElementById('decline-draw-btn').addEventListener('click', () => socket.emit('game:declineDraw'));
  document.getElementById('resign-btn').addEventListener('click', () => {
    if (confirm('Resign this match?')) socket.emit('game:resign');
  });

  document.getElementById('sound-btn').addEventListener('click', () => {
    const muted = !CrownfallSound.isMuted();
    CrownfallSound.setMuted(muted);
    document.getElementById('sound-btn').textContent = `Sound: ${muted ? 'Off' : 'On'}`;
  });

  liveMoveBtn.addEventListener('click', () => {
    inspectPly = null;
    liveMoveBtn.style.display = 'none';
    renderBoard();
    renderMoves();
  });

  document.getElementById('rematch-btn').addEventListener('click', () => {
    socket.emit('game:rematch');
  });

  document.getElementById('open-analysis-btn').addEventListener('click', () => {
    if (snapshot) {
      sessionStorage.setItem('crownfall_analysis_history', JSON.stringify(snapshot.history));
    }
    window.location.href = '/analysis';
  });

  document.getElementById('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    socket.emit('chat:send', { text });
    input.value = '';
  });
})();
