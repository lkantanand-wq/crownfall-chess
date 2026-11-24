(function () {
  const E = window.CrownfallEngine;
  const game = new E.ChessGame(E.INITIAL_FEN);
  const evalWorker = new Worker('/js/eval-worker.js');

  let baseHistory = []; // Immutable historical game moves
  let exploreHistory = null; // Non-null when user explores custom variations
  let moveReviews = []; // Parallel to baseHistory
  let moveComments = {}; // plyIndex -> comment string
  let gameMeta = { id: null, whiteName: 'White', blackName: 'Black', resultLabel: '*', timeLabel: '' };

  let currentPly = 0;
  let flipped = false;
  let showArrow = true;
  let showEvalBar = true;
  let showCoords = true;
  let selectedSq = null;
  let legalTargets = [];
  let evalReqId = 0;
  let gameAnalysisReqId = 0;
  let retryTargetPly = null; // When retrying a mistake, points to plyIndex of the mistake

  const boardEl = document.getElementById('chessboard');
  document.getElementById('coach-avatar').innerHTML = CrownfallPieces.getSvg('N');
  const arrowOverlay = document.getElementById('best-arrow-overlay');
  const evalWrapper = document.getElementById('eval-wrapper');
  const evalBar = document.getElementById('eval-bar');
  const evalFillWhite = document.getElementById('eval-fill-white');
  const evalScoreEl = document.getElementById('eval-score');
  const evalGraphCanvas = document.getElementById('eval-graph');
  const moveListEl = document.getElementById('move-list');
  const pvListEl = document.getElementById('pv-list');
  const fenInput = document.getElementById('fen-input');
  const pgnInput = document.getElementById('pgn-input');
  const modeSelect = document.getElementById('mode-select');
  const themeSelect = document.getElementById('theme-select');
  const depthSelect = document.getElementById('depth-select');
  const turnBadge = document.getElementById('turn-badge');
  const openingBadge = document.getElementById('opening-badge');
  const reviewCard = document.getElementById('review-card');
  const coachEl = document.getElementById('coach-explanation');
  const accuracyRow = document.getElementById('accuracy-row');
  const progressWrap = document.getElementById('review-progress-wrap');
  const progressFill = document.getElementById('review-progress-fill');
  const analyzeBtn = document.getElementById('analyze-all-btn');
  const cancelBtn = document.getElementById('cancel-review-btn');
  const resetVarBtn = document.getElementById('reset-var-btn');
  const retryBanner = document.getElementById('retry-banner');
  const retryPromptText = document.getElementById('retry-prompt-text');

  const savedTheme = CrownfallStorage.getBoardTheme();
  themeSelect.value = savedTheme;
  CrownfallStorage.applyBoardTheme(savedTheme);
  themeSelect.addEventListener('change', () => CrownfallStorage.applyBoardTheme(themeSelect.value));

  // Tabs
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  function activeHistory() {
    return exploreHistory || baseHistory;
  }

  function sqToCenter(sqAlg) {
    const idx = E.algebraicToIdx(sqAlg);
    if (idx === -1) return null;
    const r = Math.floor(idx / 8), c = idx % 8;
    return { x: (flipped ? 7 - c : c) * 100 + 50, y: (flipped ? 7 - r : r) * 100 + 50 };
  }

  function drawBestArrow(bestMove) {
    arrowOverlay.innerHTML = '';
    if (!showArrow || !bestMove || retryTargetPly !== null) return;
    const a = sqToCenter(bestMove.from), b = sqToCenter(bestMove.to);
    if (!a || !b) return;
    arrowOverlay.innerHTML = `
      <defs><marker id="best-arrowhead" markerWidth="4" markerHeight="4" refX="2.5" refY="2" orient="auto"><polygon points="0 0, 4 2, 0 4" fill="rgba(56, 184, 124, 0.88)"/></marker></defs>
      <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="rgba(56, 184, 124, 0.85)" stroke-width="14" stroke-linecap="round" marker-end="url(#best-arrowhead)" />
    `;
  }

  function formatEval(scoreCp, mateIn) {
    if (mateIn !== null && mateIn !== undefined && mateIn !== 0) {
      return `M${Math.abs(mateIn)}`;
    }
    const p = (scoreCp || 0) / 100;
    return (p >= 0 ? '+' : '') + p.toFixed(2);
  }

  function renderMultiPV(lines) {
    pvListEl.innerHTML = '';
    if (!lines || !lines.length) {
      pvListEl.innerHTML = '<div style="font-size:0.8rem; color:var(--text-muted);">No legal moves (game over).</div>';
      return;
    }
    lines.forEach((line, idx) => {
      const div = document.createElement('div');
      div.className = 'pv-line';
      const ev = formatEval(line.scoreCp, line.mateIn);
      div.innerHTML = `<span class="pv-eval">${ev}</span><span class="pv-moves">${idx + 1}. ${(line.pvSan || [line.san]).join(' ')}</span>`;
      div.title = 'Click to play this engine line on the board';
      div.addEventListener('click', () => {
        if (!line.bestMove) return;
        enterVariationAndMove(line.bestMove);
      });
      pvListEl.appendChild(div);
    });
  }

  function enterVariationAndMove(moveObj) {
    if (!exploreHistory) {
      exploreHistory = baseHistory.slice(0, currentPly);
      resetVarBtn.style.display = 'inline-flex';
    } else {
      exploreHistory = exploreHistory.slice(0, currentPly);
    }
    const mv = game.makeMove(moveObj);
    if (!mv) return;
    exploreHistory.push(mv);
    currentPly = exploreHistory.length;
    selectedSq = null;
    legalTargets = [];
    CrownfallSound.move();
    render();
  }

  function drawEvalGraph() {
    const ctx = evalGraphCanvas.getContext('2d');
    const w = evalGraphCanvas.width, h = evalGraphCanvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background halves
    ctx.fillStyle = '#1b2029';
    ctx.fillRect(0, 0, w, h / 2);
    ctx.fillStyle = '#12161e';
    ctx.fillRect(0, h / 2, w, h / 2);

    // Midline
    ctx.strokeStyle = 'rgba(226, 183, 84, 0.35)';
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    if (!moveReviews.length) return;
    const n = moveReviews.length;
    const toY = (cp, mate) => {
      if (mate) return mate > 0 ? 6 : h - 6;
      const clamped = Math.max(-700, Math.min(700, cp || 0));
      return h / 2 - (clamped / 700) * (h / 2 - 8);
    };

    // Area curve
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    for (let i = 0; i < n; i++) {
      const x = ((i + 1) / n) * (w - 16) + 8;
      const y = toY(moveReviews[i].evalAfterCp, moveReviews[i].mateAfter);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w - 8, h / 2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(244, 241, 234, 0.16)';
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(8, h / 2);
    for (let i = 0; i < n; i++) {
      const x = ((i + 1) / n) * (w - 16) + 8;
      const y = toY(moveReviews[i].evalAfterCp, moveReviews[i].mateAfter);
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#e2b754';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Highlight dots for notable moves & current ply cursor
    for (let i = 0; i < n; i++) {
      const r = moveReviews[i];
      const x = ((i + 1) / n) * (w - 16) + 8;
      const y = toY(r.evalAfterCp, r.mateAfter);
      if (['Brilliant', 'Blunder', 'Mistake', 'Missed Win'].includes(r.label)) {
        ctx.fillStyle = r.color;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!exploreHistory && currentPly === i + 1) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 5.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  evalGraphCanvas.addEventListener('click', (e) => {
    if (!moveReviews.length) return;
    const rect = evalGraphCanvas.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const ply = Math.max(1, Math.min(moveReviews.length, Math.round(ratio * moveReviews.length)));
    exploreHistory = null;
    resetVarBtn.style.display = 'none';
    jumpToPly(ply);
  });

  function renderMoveReviewCard() {
    if (exploreHistory) {
      reviewCard.innerHTML = '<div><strong>Variation Mode</strong> — Exploring your own line (original game untouched).</div>';
      return;
    }
    if (currentPly === 0 || !moveReviews[currentPly - 1]) {
      reviewCard.innerHTML = `<div>${baseHistory.length ? 'Click <strong>Review Game</strong> or step through moves to hear from your Chess Coach.' : 'Load a game or play moves to start.'}</div>`;
      return;
    }
    const rev = moveReviews[currentPly - 1];
    const altText = rev.bestSan && rev.bestSan !== rev.san ? ` Best move was <strong style="color:#1b6e44;">${rev.bestSan}</strong>.` : '';
    reviewCard.innerHTML = `
      <div class="coach-bubble-title">
        <span class="review-badge" style="background:${rev.color}; color:#fff; width:22px; height:22px; min-width:22px; border-radius:50%; font-size:0.7rem;">${rev.symbol}</span>
        <span style="color:${rev.color};">${rev.label}</span>
        <span style="color:#555; font-weight:600; font-size:0.8rem;">(${rev.san})</span>
      </div>
      <div>${rev.explanation || ''}${altText}</div>
    `;
  }

  function renderKeyMoments() {
    const el = document.getElementById('key-moments-list');
    el.innerHTML = '';
    const moments = moveReviews
      .map((r, idx) => ({ ...r, ply: idx + 1 }))
      .filter((r) => ['Blunder', 'Mistake', 'Missed Win', 'Brilliant', 'Great'].includes(r.label));

    if (!moments.length) {
      el.innerHTML = '<div style="color:var(--text-muted); font-size:0.86rem;">No major mistakes, missed wins, or brilliant moves detected yet.</div>';
      return;
    }

    moments.forEach((m) => {
      const row = document.createElement('div');
      row.className = 'saved-game-item';
      row.innerHTML = `
        <div class="saved-game-meta">
          <div class="saved-game-title" style="display:flex; align-items:center; gap:8px;">
            <span class="review-badge" style="background:${m.color}; min-width:22px; height:22px; font-size:0.7rem;">${m.symbol}</span>
            <span>Move ${Math.ceil(m.ply / 2)} (${m.color === 'w' ? 'White' : 'Black'}): ${m.san} — ${m.label}</span>
          </div>
          <div class="saved-game-sub">${m.explanation}</div>
        </div>
      `;
      const btns = document.createElement('div');
      btns.style.display = 'flex';
      btns.style.gap = '6px';

      const goBtn = document.createElement('button');
      goBtn.className = 'btn btn-sm';
      goBtn.textContent = 'View';
      goBtn.addEventListener('click', () => {
        exploreHistory = null;
        resetVarBtn.style.display = 'none';
        jumpToPly(m.ply);
      });
      btns.appendChild(goBtn);

      if (['Blunder', 'Mistake', 'Missed Win'].includes(m.label)) {
        const retryBtn = document.createElement('button');
        retryBtn.className = 'btn btn-sm btn-primary';
        retryBtn.textContent = 'Retry';
        retryBtn.addEventListener('click', () => startRetryMistake(m.ply - 1));
        btns.appendChild(retryBtn);
      }

      row.appendChild(btns);
      el.appendChild(row);
    });
  }

  function startRetryMistake(plyBeforeIdx) {
    retryTargetPly = plyBeforeIdx;
    exploreHistory = null;
    resetVarBtn.style.display = 'none';
    jumpToPly(plyBeforeIdx);
    const rev = moveReviews[plyBeforeIdx];
    retryBanner.style.display = 'block';
    retryPromptText.textContent = `Move ${Math.floor(plyBeforeIdx / 2) + 1}: Instead of ${rev.san} (${rev.label}), find the strongest move on the board!`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.getElementById('retry-exit-btn').addEventListener('click', () => {
    retryTargetPly = null;
    retryBanner.style.display = 'none';
    render();
  });

  function renderStatsAndPhases() {
    const el = document.getElementById('stats-content');
    if (!moveReviews.length) return;

    const toAcc = (arr) => {
      if (!arr.length) return '--%';
      const avg = arr.reduce((s, x) => s + x.cpLoss, 0) / arr.length;
      return Math.max(10, Math.min(99.9, 100 * Math.exp(-0.0035 * avg))).toFixed(1) + '%';
    };

    const wMoves = moveReviews.filter((_, i) => i % 2 === 0);
    const bMoves = moveReviews.filter((_, i) => i % 2 === 1);
    const wAccStr = toAcc(wMoves), bAccStr = toAcc(bMoves);

    document.getElementById('acc-white').textContent = wAccStr;
    document.getElementById('acc-black').textContent = bAccStr;

    const avgCp = (arr) => arr.length ? (arr.reduce((s, x) => s + x.cpLoss, 0) / arr.length / 100).toFixed(2) : '0.00';
    document.getElementById('perf-white').textContent = `ACPL: ${avgCp(wMoves)}`;
    document.getElementById('perf-black').textContent = `ACPL: ${avgCp(bMoves)}`;
    accuracyRow.style.display = 'grid';

    const countBy = (arr, lbl) => arr.filter((r) => r.label === lbl).length;
    const phaseAcc = (arr, ph) => toAcc(arr.filter((r) => r.phase === ph));

    el.innerHTML = `
      <div class="stat-box"><div class="stat-label">White Accuracy</div><div class="stat-val" style="color:var(--gold);">${wAccStr}</div></div>
      <div class="stat-box"><div class="stat-label">Black Accuracy</div><div class="stat-val" style="color:var(--gold);">${bAccStr}</div></div>
      <div class="stat-box"><div class="stat-label">White Opening / Mid / End</div><div class="stat-val" style="font-size:0.86rem;">${phaseAcc(wMoves,'opening')} / ${phaseAcc(wMoves,'middlegame')} / ${phaseAcc(wMoves,'endgame')}</div></div>
      <div class="stat-box"><div class="stat-label">Black Opening / Mid / End</div><div class="stat-val" style="font-size:0.86rem;">${phaseAcc(bMoves,'opening')} / ${phaseAcc(bMoves,'middlegame')} / ${phaseAcc(bMoves,'endgame')}</div></div>
      <div class="stat-box"><div class="stat-label">Brilliant / Great / Best</div><div class="stat-val" style="font-size:0.9rem;">W: ${countBy(wMoves,'Brilliant')}/${countBy(wMoves,'Great')}/${countBy(wMoves,'Best')} • B: ${countBy(bMoves,'Brilliant')}/${countBy(bMoves,'Great')}/${countBy(bMoves,'Best')}</div></div>
      <div class="stat-box"><div class="stat-label">Inacc / Mistake / Blunder</div><div class="stat-val" style="font-size:0.9rem; color:#e58f2a;">W: ${countBy(wMoves,'Inaccuracy')}/${countBy(wMoves,'Mistake')}/${countBy(wMoves,'Blunder')} • B: ${countBy(bMoves,'Inaccuracy')}/${countBy(bMoves,'Mistake')}/${countBy(bMoves,'Blunder')}</div></div>
    `;
  }

  function renderOpeningAndMaterial() {
    const op = E.detectOpening(baseHistory);
    openingBadge.textContent = `${op.eco}: ${op.name}`;

    const start = { P:8,N:2,B:2,R:2,Q:1,p:8,n:2,b:2,r:2,q:1 }, cur = {};
    for (const p of game.board) if (p) cur[p] = (cur[p] || 0) + 1;
    const vals = { p:1,n:3,b:3,r:5,q:9 }, glyphs = { P:'♙',N:'♘',B:'♗',R:'♖',Q:'♕',p:'♟',n:'♞',b:'♝',r:'♜',q:'♛' };
    let wCap = '', bCap = '', wPts = 0, bPts = 0;
    for (const k of ['q','r','b','n','p']) {
      const mb = Math.max(0, start[k] - (cur[k] || 0));
      for (let i = 0; i < mb; i++) { wCap += glyphs[k]; wPts += vals[k]; }
      const u = k.toUpperCase(), mw = Math.max(0, start[u] - (cur[u] || 0));
      for (let i = 0; i < mw; i++) { bCap += glyphs[u]; bPts += vals[k]; }
    }
    document.getElementById('bottom-captured').textContent = wCap + (wPts > bPts ? ` +${wPts - bPts}` : '');
    document.getElementById('top-captured').textContent = bCap + (bPts > wPts ? ` +${bPts - wPts}` : '');

    document.getElementById('opening-content').innerHTML = `
      <div class="stats-grid">
        <div class="stat-box"><div class="stat-label">ECO &amp; Opening</div><div class="stat-val" style="font-size:0.95rem;">${op.eco} — ${op.name}</div></div>
        <div class="stat-box"><div class="stat-label">Theory Depth / First Deviation</div><div class="stat-val" style="font-size:0.9rem;">${op.theoryPlies} plies${op.firstDeviationSan ? ` • Dev: ${op.firstDeviationSan} (ply ${op.firstDeviationPly})` : ''}</div></div>
        <div class="stat-box"><div class="stat-label">Material Balance</div><div class="stat-val">${wPts === bPts ? 'Equal (0)' : (wPts > bPts ? `White +${wPts - bPts}` : `Black +${bPts - wPts}`)}</div></div>
      </div>
    `;
  }

  function renderTimeAnalysis() {
    const el = document.getElementById('time-content');
    const withTime = baseHistory.filter((m) => typeof m.timeSpentMs === 'number' && m.timeSpentMs > 0);
    if (!withTime.length) {
      el.innerHTML = 'Time analysis is unavailable for this game (no per-move clock timestamps were recorded in the PGN or match).';
      return;
    }
    const maxMove = withTime.reduce((a, b) => (b.timeSpentMs > a.timeSpentMs ? b : a), withTime[0]);
    const avgSec = (withTime.reduce((s, m) => s + m.timeSpentMs, 0) / withTime.length / 1000).toFixed(1);
    el.innerHTML = `
      <div class="stats-grid">
        <div class="stat-box"><div class="stat-label">Tracked Moves</div><div class="stat-val">${withTime.length}</div></div>
        <div class="stat-box"><div class="stat-label">Avg Time / Move</div><div class="stat-val">${avgSec}s</div></div>
        <div class="stat-box"><div class="stat-label">Longest Think</div><div class="stat-val">${maxMove.san} (${(maxMove.timeSpentMs / 1000).toFixed(1)}s)</div></div>
      </div>
    `;
  }

  function runFullGameReview() {
    if (!baseHistory.length) return;
    gameAnalysisReqId++;
    const depth = Number(depthSelect.value) || 2;
    document.getElementById('engine-meta-label').textContent = `Crownfall Engine • Depth ${depth}`;
    progressWrap.style.display = 'block';
    progressFill.style.width = '0%';
    analyzeBtn.style.display = 'none';
    cancelBtn.style.display = 'inline-flex';
    reviewCard.innerHTML = '<div style="font-size:0.84rem; color:var(--gold);">Analyzing all moves with MultiPV...</div>';
    evalWorker.postMessage({ type: 'analyzeGame', id: gameAnalysisReqId, history: baseHistory, depth });
  }

  cancelBtn.addEventListener('click', () => {
    evalWorker.postMessage({ type: 'cancel' });
    progressWrap.style.display = 'none';
    analyzeBtn.style.display = 'inline-flex';
    cancelBtn.style.display = 'none';
    renderMoveReviewCard();
  });

  function updateEval(fen) {
    evalReqId++;
    const depth = Number(depthSelect.value) || 2;
    evalWorker.postMessage({ id: evalReqId, fen, depth, multiPv: 3 });
  }

  evalWorker.onmessage = (e) => {
    const data = e.data || {};
    if (data.type === 'gameProgress') {
      if (data.id !== gameAnalysisReqId) return;
      const pct = Math.round((data.done / Math.max(1, data.total)) * 100);
      progressFill.style.width = `${pct}%`;
      return;
    }
    if (data.type === 'gameAnalysis') {
      if (data.id !== gameAnalysisReqId) return;
      progressWrap.style.display = 'none';
      analyzeBtn.style.display = 'inline-flex';
      cancelBtn.style.display = 'none';
      moveReviews = data.reviews || [];
      renderStatsAndPhases();
      renderKeyMoments();
      renderMoveList();
      renderMoveReviewCard();
      drawEvalGraph();
      return;
    }

    const { id, scoreCp, mateIn, bestMove, lines } = data;
    if (id !== evalReqId) return;

    let label = '0.0', whitePct = 50;
    if (mateIn !== null && mateIn !== undefined && mateIn !== 0) {
      label = `M${Math.abs(mateIn)}`;
      whitePct = mateIn > 0 ? 98 : 2;
    } else {
      const pawns = scoreCp / 100;
      label = (pawns >= 0 ? '+' : '') + pawns.toFixed(1);
      whitePct = Math.max(4, Math.min(96, 50 + 46 * (2 / (1 + Math.exp(-0.0038 * scoreCp)) - 1)));
    }
    evalScoreEl.textContent = label;
    evalFillWhite.style.height = `${whitePct}%`;
    const isPlayingBot = Boolean(BOT_CONFIG[modeSelect.value]) && !game.getStatus().over && currentPly === activeHistory().length;
    if (isPlayingBot) {
      pvListEl.innerHTML = '<div style="font-size:0.8rem; color:var(--text-muted);">Engine lines hidden during rated bot play.</div>';
      drawBestArrow(null);
    } else {
      renderMultiPV(lines || []);
      drawBestArrow(bestMove);
    }
  };

  function jumpToPly(ply) {
    const hist = activeHistory();
    currentPly = Math.max(0, Math.min(hist.length, ply));
    const fen = currentPly === 0 ? E.INITIAL_FEN : hist[currentPly - 1].fenAfter;
    game.load(fen);
    selectedSq = null;
    legalTargets = [];
    render();
  }

  const BOT_CONFIG = {
    'bot-400': { name: 'PawnBot', elo: 400, depth: 1 },
    'bot-650': { name: 'KnightBot', elo: 650, depth: 2 },
    'bot-950': { name: 'RookBot', elo: 950, depth: 2 },
    'bot-1250': { name: 'QueenBot', elo: 1250, depth: 3 }
  };

  function maybeTriggerBot() {
    const bot = BOT_CONFIG[modeSelect.value];
    if (!bot || game.getStatus().over || game.turn !== 'b') return;
    setTimeout(() => {
      if (game.turn !== 'b' || game.getStatus().over) return;
      const res = game.searchBestMove(bot.depth);
      if (!res.bestMove) return;
      const mv = game.makeMove(res.bestMove);
      if (mv) {
        baseHistory = baseHistory.slice(0, currentPly);
        moveReviews = [];
        baseHistory.push(mv);
        currentPly = baseHistory.length;
        CrownfallSound.move();
        render();
      }
    }, 220);
  }

  let dragState = null;
  function attachPieceDrag(sqEl, sqAlg, pieceChar) {
    sqEl.addEventListener('pointerdown', (e) => {
      if (e.button && e.button !== 0) return;
      if (game.getStatus().over) return;
      const bot = BOT_CONFIG[modeSelect.value];
      if (bot && game.turn === 'b') return;
      if (!pieceChar || E.pieceColor(pieceChar) !== game.turn) return;

      selectedSq = sqAlg;
      legalTargets = game.legalMoves(sqAlg);
      const rect = sqEl.getBoundingClientRect();
      dragState = { from: sqAlg, startX: e.clientX, startY: e.clientY, active: false, ghost: null, size: rect.width, pieceChar };
      renderBoardOnly();
    });
  }

  window.addEventListener('pointermove', (e) => {
    if (!dragState) return;
    if (!dragState.active && Math.hypot(e.clientX - dragState.startX, e.clientY - dragState.startY) > 6) {
      dragState.active = true;
      const ghost = document.createElement('div');
      ghost.style.cssText = `position:fixed; pointer-events:none; z-index:999; width:${dragState.size}px; height:${dragState.size}px; display:flex; align-items:center; justify-content:center; transform:translate(-50%,-50%) scale(1.12);`;
      ghost.innerHTML = CrownfallPieces.getSvg(dragState.pieceChar);
      document.body.appendChild(ghost);
      dragState.ghost = ghost;
    }
    if (dragState.active && dragState.ghost) {
      dragState.ghost.style.left = e.clientX + 'px';
      dragState.ghost.style.top = e.clientY + 'px';
    }
  });

  window.addEventListener('pointerup', (e) => {
    if (!dragState) return;
    const ds = dragState;
    dragState = null;
    if (ds.ghost) ds.ghost.remove();
    if (!ds.active) return;

    const el = document.elementFromPoint(e.clientX, e.clientY);
    const sqEl = el ? el.closest('.square[data-sq]') : null;
    if (sqEl) {
      const targetSq = sqEl.dataset.sq;
      if (targetSq && targetSq !== ds.from) {
        const match = legalTargets.find((m) => E.idxToAlgebraic(m.to) === targetSq);
        if (match) {
          onSquareClick(targetSq);
          return;
        }
      }
    }
    renderBoardOnly();
  });
  function onSquareClick(sqAlg) {
    if (game.getStatus().over) return;
    const bot = BOT_CONFIG[modeSelect.value];
    if (bot && game.turn === 'b') return;

    if (selectedSq) {
      const match = legalTargets.find((m) => E.idxToAlgebraic(m.to) === sqAlg);
      if (match) {
        if (retryTargetPly !== null) {
          const rev = moveReviews[retryTargetPly];
          const isBest = rev && rev.bestMove && rev.bestMove.from === selectedSq && rev.bestMove.to === sqAlg;
          const playedMove = { from: selectedSq, to: sqAlg, promotion: match.promotion ? 'q' : null };
          enterVariationAndMove(playedMove);
          if (isBest) {
            retryPromptText.innerHTML = `<span style="color:var(--emerald); font-weight:700;">Correct!</span> ${rev.bestSan} was the engine's best move. (${rev.explanation})`;
          } else {
            retryPromptText.innerHTML = `<span style="color:#e58f2a; font-weight:700;">Not the top move.</span> Engine preferred <strong>${rev ? rev.bestSan : 'another move'}</strong>. Try another move or exit retry.`;
          }
          return;
        }

        if (currentPly < baseHistory.length || exploreHistory) {
          enterVariationAndMove({ from: selectedSq, to: sqAlg, promotion: match.promotion ? 'q' : null });
          return;
        }

        const mv = game.makeMove({ from: selectedSq, to: sqAlg, promotion: match.promotion ? 'q' : null });
        if (mv) {
          baseHistory.push(mv);
          moveReviews = [];
          currentPly = baseHistory.length;
          selectedSq = null;
          legalTargets = [];
          if (mv.captured) CrownfallSound.capture();
          else CrownfallSound.move();
          render();
          maybeTriggerBot();
          return;
        }
      }
    }

    const idx = E.algebraicToIdx(sqAlg);
    const p = game.board[idx];
    if (p && E.pieceColor(p) === game.turn) {
      selectedSq = sqAlg;
      legalTargets = game.legalMoves(sqAlg);
    } else {
      selectedSq = null;
      legalTargets = [];
    }
    renderBoardOnly();
  }

  function renderBoardOnly() {
    const hist = activeHistory();
    const lastMove = currentPly > 0 ? hist[currentPly - 1] : null;
    const kingCheckIdx = game.inCheck(game.turn) ? game.findKing(game.turn) : -1;

    boardEl.innerHTML = '';
    for (let rVis = 0; rVis < 8; rVis++) {
      for (let cVis = 0; cVis < 8; cVis++) {
        const r = flipped ? 7 - rVis : rVis;
        const c = flipped ? 7 - cVis : cVis;
        const idx = r * 8 + c;
        const sqAlg = E.idxToAlgebraic(idx);
        const sqEl = document.createElement('div');
        sqEl.className = `square ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
        sqEl.dataset.sq = sqAlg;
        if (lastMove && (lastMove.from === sqAlg || lastMove.to === sqAlg)) sqEl.classList.add('last-move');
        if (selectedSq === sqAlg) sqEl.classList.add('selected');
        if (idx === kingCheckIdx) sqEl.classList.add('in-check');

        if (showCoords && cVis === 0) sqEl.insertAdjacentHTML('beforeend', `<span class="coord-rank">${E.RANKS[r]}</span>`);
        if (showCoords && rVis === 7) sqEl.insertAdjacentHTML('beforeend', `<span class="coord-file">${E.FILES[c]}</span>`);

        const p = game.board[idx];
        if (p) sqEl.insertAdjacentHTML('beforeend', CrownfallPieces.getSvg(p));
        if (legalTargets.some((m) => E.idxToAlgebraic(m.to) === sqAlg)) {
          const ind = document.createElement('div');
          ind.className = p ? 'legal-ring' : 'legal-dot';
          sqEl.appendChild(ind);
        }
        if (!exploreHistory && lastMove && lastMove.to === sqAlg && currentPly > 0 && moveReviews[currentPly - 1]) {
          const rev = moveReviews[currentPly - 1];
          const bdg = document.createElement('div');
          bdg.className = 'board-move-badge';
          bdg.style.background = rev.color;
          bdg.textContent = rev.symbol;
          bdg.title = `${rev.san} — ${rev.label}`;
          sqEl.appendChild(bdg);
        }
        if (p) attachPieceDrag(sqEl, sqAlg, p);
        sqEl.addEventListener('click', () => onSquareClick(sqAlg));
        boardEl.appendChild(sqEl);
      }
    }
    evalBar.classList.toggle('flipped', flipped);
  }

  function renderMoveList() {
    const hist = activeHistory();
    moveListEl.innerHTML = '';
    for (let i = 0; i < hist.length; i += 2) {
      const num = document.createElement('div');
      num.className = 'move-num';
      num.textContent = `${i / 2 + 1}.`;
      moveListEl.appendChild(num);

      const makeCell = (plyIdx) => {
        const cell = document.createElement('div');
        cell.className = 'move-cell' + (currentPly === plyIdx + 1 ? ' active' : '');
        cell.textContent = hist[plyIdx].san;
        const rev = !exploreHistory ? moveReviews[plyIdx] : null;
        if (rev) {
          const tag = document.createElement('span');
          tag.className = 'move-tag';
          tag.style.background = rev.color;
          tag.textContent = rev.symbol;
          tag.title = `${rev.label} (Best: ${rev.bestSan || '-'})`;
          cell.appendChild(tag);
        }
        cell.addEventListener('click', () => jumpToPly(plyIdx + 1));
        return cell;
      };

      moveListEl.appendChild(makeCell(i));
      moveListEl.appendChild(hist[i + 1] ? makeCell(i + 1) : document.createElement('div'));
    }
  }

  function render() {
    renderBoardOnly();
    fenInput.value = game.fen();
    document.getElementById('top-player-label').textContent = flipped ? gameMeta.whiteName : gameMeta.blackName;
    document.getElementById('bottom-player-label').textContent = flipped ? gameMeta.blackName : gameMeta.whiteName;

    const status = game.getStatus();
    turnBadge.textContent = status.over
      ? (status.winner === 'draw' ? 'Draw' : `${status.winner === 'w' ? 'White' : 'Black'} Wins`)
      : `${game.turn === 'w' ? 'White' : 'Black'} Turn`;

    renderMoveList();
    renderMoveReviewCard();
    renderOpeningAndMaterial();
    renderTimeAnalysis();
    drawEvalGraph();
    updateEval(game.fen());
  }

  function renderRecentGames() {
    const listEl = document.getElementById('recent-games-list');
    const games = CrownfallStorage.getRecentGames();
    listEl.innerHTML = '';
    if (!games.length) {
      listEl.innerHTML = '<div style="font-size:0.82rem; color:var(--text-muted);">No browser-cached games yet.</div>';
      return;
    }
    games.forEach((g) => {
      const item = document.createElement('div');
      item.className = 'saved-game-item';
      item.innerHTML = `<div class="saved-game-meta"><div class="saved-game-title">${g.whiteName} vs ${g.blackName} (${g.resultLabel})</div><div class="saved-game-sub">${g.timeLabel || 'Match'} • ${g.history.length} moves</div></div>`;
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm btn-primary';
      btn.textContent = 'Analyze';
      btn.addEventListener('click', () => loadHistoricalGame(g));
      item.appendChild(btn);
      listEl.appendChild(item);
    });
  }

  function loadHistoricalGame(g, cachedAnalysis = null) {
    gameMeta = {
      id: g.id || null,
      whiteName: g.whiteName || 'White',
      blackName: g.blackName || 'Black',
      resultLabel: g.resultLabel || '*',
      timeLabel: g.timeLabel || ''
    };
    baseHistory = g.history || [];
    exploreHistory = null;
    resetVarBtn.style.display = 'none';
    retryTargetPly = null;
    retryBanner.style.display = 'none';
    moveReviews = cachedAnalysis && Array.isArray(cachedAnalysis.reviews) ? cachedAnalysis.reviews : [];
    moveComments = (cachedAnalysis && cachedAnalysis.comments) || {};
    document.getElementById('delete-analysis-btn').style.display = cachedAnalysis ? 'inline-flex' : 'none';
    jumpToPly(0);
    if (moveReviews.length) {
      renderStatsAndPhases();
      renderKeyMoments();
      renderMoveList();
      renderMoveReviewCard();
      drawEvalGraph();
    } else if (baseHistory.length) {
      runFullGameReview();
    }
  }

  // Controls
  document.getElementById('flip-btn').addEventListener('click', () => { flipped = !flipped; render(); });
  document.getElementById('toggle-arrow-btn').addEventListener('click', (e) => {
    showArrow = !showArrow;
    e.target.textContent = `Arrow: ${showArrow ? 'On' : 'Off'}`;
    updateEval(game.fen());
  });
  document.getElementById('toggle-eval-btn').addEventListener('click', (e) => {
    showEvalBar = !showEvalBar;
    evalWrapper.classList.toggle('hidden', !showEvalBar);
    e.target.textContent = `Eval Bar: ${showEvalBar ? 'On' : 'Off'}`;
  });
  document.getElementById('toggle-coords-btn').addEventListener('click', (e) => {
    showCoords = !showCoords;
    e.target.textContent = `Coords: ${showCoords ? 'On' : 'Off'}`;
    renderBoardOnly();
  });
  document.getElementById('reset-var-btn').addEventListener('click', () => {
    exploreHistory = null;
    resetVarBtn.style.display = 'none';
    jumpToPly(Math.min(currentPly, baseHistory.length));
  });
  document.getElementById('reset-btn').addEventListener('click', () => {
    baseHistory = []; exploreHistory = null; moveReviews = []; currentPly = 0;
    accuracyRow.style.display = 'none';
    game.load(E.INITIAL_FEN);
    render();
  });

  analyzeBtn.addEventListener('click', runFullGameReview);
  depthSelect.addEventListener('change', () => updateEval(game.fen()));
  document.getElementById('nav-start').addEventListener('click', () => jumpToPly(0));
  document.getElementById('nav-prev').addEventListener('click', () => jumpToPly(currentPly - 1));
  document.getElementById('nav-next').addEventListener('click', () => jumpToPly(currentPly + 1));
  document.getElementById('nav-end').addEventListener('click', () => jumpToPly(activeHistory().length));

  document.getElementById('load-pgn-btn').addEventListener('click', () => {
    try {
      const parsed = E.parsePGN(pgnInput.value);
      loadHistoricalGame({
        whiteName: parsed.headers.White || 'White',
        blackName: parsed.headers.Black || 'Black',
        resultLabel: parsed.headers.Result || '*',
        timeLabel: parsed.headers.TimeControl || '',
        history: parsed.history
      });
    } catch (err) {
      alert(err.message || 'Invalid PGN');
    }
  });

  document.getElementById('load-fen-btn').addEventListener('click', () => {
    try {
      game.load(fenInput.value.trim());
      baseHistory = []; exploreHistory = null; moveReviews = []; currentPly = 0;
      render();
    } catch (_) {
      alert('Invalid FEN');
    }
  });

  document.getElementById('export-pgn-btn').addEventListener('click', () => {
    const op = E.detectOpening(baseHistory);
    const pgn = E.exportAnnotatedPGN({ ...gameMeta, eco: op.eco, opening: op.name }, baseHistory, moveReviews, moveComments);
    pgnInput.value = pgn;
    navigator.clipboard?.writeText(pgn).catch(() => {});
    document.getElementById('save-status-msg').textContent = 'Annotated PGN exported to box & copied to clipboard!';
  });

  document.getElementById('copy-fen-btn').addEventListener('click', () => {
    navigator.clipboard?.writeText(game.fen()).catch(() => {});
    document.getElementById('save-status-msg').textContent = 'FEN copied to clipboard!';
  });

  document.getElementById('save-analysis-btn').addEventListener('click', async () => {
    if (!gameMeta.id) {
      document.getElementById('save-status-msg').textContent = 'Sign in and open a game from Account History to save to your account.';
      return;
    }
    const res = await fetch(`/api/analysis/${encodeURIComponent(gameMeta.id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ depth: Number(depthSelect.value), reviews: moveReviews, comments: moveComments })
    });
    if (res.ok) {
      document.getElementById('delete-analysis-btn').style.display = 'inline-flex';
      document.getElementById('save-status-msg').textContent = 'Analysis saved to your account!';
    }
  });

  document.getElementById('delete-analysis-btn').addEventListener('click', async () => {
    if (!gameMeta.id) return;
    await fetch(`/api/analysis/${encodeURIComponent(gameMeta.id)}`, { method: 'DELETE' });
    document.getElementById('delete-analysis-btn').style.display = 'none';
    document.getElementById('save-status-msg').textContent = 'Saved analysis deleted (original game preserved).';
  });

  // Init: Check ?gameId= or sessionStorage
  async function init() {
    renderRecentGames();
    const params = new URLSearchParams(window.location.search);
    const gameId = params.get('gameId');
    if (gameId) {
      try {
        const res = await fetch(`/api/games/${encodeURIComponent(gameId)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.game) {
            loadHistoricalGame(data.game, data.analysis || null);
            return;
          }
        }
      } catch (_) {}
    }

    const imported = sessionStorage.getItem('crownfall_analysis_history');
    if (imported) {
      try {
        const parsed = JSON.parse(imported);
        if (Array.isArray(parsed) && parsed.length > 0) {
          sessionStorage.removeItem('crownfall_analysis_history');
          loadHistoricalGame({ whiteName: 'White', blackName: 'Black', history: parsed });
          return;
        }
      } catch (_) {}
    }
    render();
  }

  init();
})();
