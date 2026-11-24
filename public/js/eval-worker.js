importScripts('/shared/chess-engine.js');

let activeJobId = 0;

function classifyMove({ cpLoss, isSacrifice, isOnlyMove, isBook, isForced, missedWin }) {
  if (isForced) return { label: 'Forced', symbol: '→', cls: 'forced', color: '#8a94a6' };
  if (isBook) return { label: 'Book', symbol: '📖', cls: 'book', color: '#a88b61' };
  if (cpLoss <= 15 && isSacrifice) return { label: 'Brilliant', symbol: '!!', cls: 'brilliant', color: '#26c6da' };
  if (cpLoss <= 15 && isOnlyMove) return { label: 'Great', symbol: '!', cls: 'great', color: '#5c9ce6' };
  if (cpLoss <= 15) return { label: 'Best', symbol: '★', cls: 'best', color: '#81b64c' };
  if (cpLoss <= 35) return { label: 'Excellent', symbol: '✓', cls: 'excellent', color: '#96bc4b' };
  if (cpLoss <= 80) return { label: 'Good', symbol: '•', cls: 'good', color: '#a3b899' };
  if (missedWin) return { label: 'Missed Win', symbol: '✕', cls: 'missed-win', color: '#e67e22' };
  if (cpLoss <= 160) return { label: 'Inaccuracy', symbol: '?!', cls: 'inaccuracy', color: '#f0c15c' };
  if (cpLoss <= 320) return { label: 'Mistake', symbol: '?', cls: 'mistake', color: '#e58f2a' };
  return { label: 'Blunder', symbol: '??', cls: 'blunder', color: '#e25c5c' };
}

function buildCoachExplanation({ san, bestSan, label, cpLoss, motifs, pvSan, evalBeforeCp, evalAfterCp, mover }) {
  const side = mover === 'w' ? 'White' : 'Black';
  const opp = mover === 'w' ? 'Black' : 'White';
  const motifText = motifs && motifs.length ? motifs.join(', ') : 'positional play';
  const pvText = pvSan && pvSan.length ? `Engine line: ${pvSan.join(' ')}.` : '';

  if (label === 'Book') return `${san} follows established opening theory (${motifText}).`;
  if (label === 'Forced') return `${san} was the only legal move available.`;
  if (label === 'Brilliant') return `Brilliant sacrifice! ${san} creates decisive tactical pressure (${motifText}). ${pvText}`;
  if (label === 'Great') return `Great find! ${san} was the only move to maintain ${side}'s advantage. ${pvText}`;
  if (label === 'Best' || label === 'Excellent' || label === 'Good') {
    return `${san} is solid (${motifText}), keeping the position well-balanced or favorable for ${side}.`;
  }
  const swing = (cpLoss / 100).toFixed(2);
  if (label === 'Missed Win') {
    return `${san} missed a winning continuation. ${bestSan} kept a decisive advantage instead of losing ${swing} pawns of evaluation. ${pvText}`;
  }
  return `${san} is a ${label.toLowerCase()} (loses ${swing} pawns). ${opp} can punish this; ${bestSan ? `playing ${bestSan} was stronger` : 'a stronger alternative existed'}. ${pvText}`;
}

function analyzePositionAndMove(fenBefore, moveRecord, depth, isBook) {
  const E = self.CrownfallEngine;
  const gBefore = new E.ChessGame(fenBefore);
  const mover = gBefore.turn;
  const legalCount = gBefore.legalMoves().length;
  const isForced = legalCount === 1;

  const lines = gBefore.searchMultiPV(depth, 3);
  const bestLine = lines[0] || null;
  const secondLine = lines[1] || null;
  const bestMove = bestLine ? bestLine.bestMove : null;
  const bestSan = bestLine ? bestLine.san : null;

  const gAfter = new E.ChessGame(moveRecord.fenAfter);
  const afterRes = gAfter.searchBestMove(Math.max(1, depth - 1));

  const bestCpForMover = bestLine ? (mover === 'w' ? bestLine.scoreCp : -bestLine.scoreCp) : 0;
  const secondCpForMover = secondLine ? (mover === 'w' ? secondLine.scoreCp : -secondLine.scoreCp) : bestCpForMover;
  const afterCpForMover = mover === 'w' ? afterRes.scoreCp : -afterRes.scoreCp;

  const isSameAsBest = bestMove && bestMove.from === moveRecord.from && bestMove.to === moveRecord.to;
  const cpLoss = isSameAsBest ? 0 : Math.max(0, bestCpForMover - afterCpForMover);

  const pVals = E.PIECE_VALUES;
  const movedVal = pVals[E.pieceType(moveRecord.piece)] || 100;
  const capVal = moveRecord.captured ? (pVals[E.pieceType(moveRecord.captured)] || 0) : 0;
  const toIdx = E.algebraicToIdx(moveRecord.to);
  const isSacrifice = movedVal > capVal + 100 && gAfter.isSquareAttacked(toIdx, gAfter.turn) && !moveRecord.san.includes('=');
  const isOnlyMove = legalCount > 1 && (bestCpForMover - secondCpForMover >= 120);
  const missedWin = bestCpForMover >= 300 && afterCpForMover <= 80;

  const info = classifyMove({ cpLoss, isSacrifice, isOnlyMove, isBook, isForced, missedWin });
  const motifs = E.detectTacticalMotifs(fenBefore, moveRecord);
  const phase = E.detectPhase(gAfter.board, 0);
  const evalBeforeCp = bestLine ? bestLine.scoreCp : 0;
  const explanation = buildCoachExplanation({
    san: moveRecord.san,
    bestSan,
    label: info.label,
    cpLoss,
    motifs,
    pvSan: bestLine ? bestLine.pvSan : [],
    evalBeforeCp,
    evalAfterCp: afterRes.scoreCp,
    mover
  });

  return {
    san: moveRecord.san,
    from: moveRecord.from,
    to: moveRecord.to,
    color: mover,
    fenBefore,
    fenAfter: moveRecord.fenAfter,
    bestMove,
    bestSan,
    lines: lines.map((l) => ({ scoreCp: l.scoreCp, mateIn: l.mateIn, san: l.san, bestMove: l.bestMove, pvSan: l.pvSan })),
    cpLoss,
    evalBeforeCp,
    evalAfterCp: afterRes.scoreCp,
    mateAfter: afterRes.mateIn,
    motifs,
    phase,
    explanation,
    ...info
  };
}

self.onmessage = function (e) {
  const data = e.data || {};
  if (data.type === 'cancel') {
    activeJobId = 0;
    return;
  }

  if (data.type === 'analyzeGame') {
    const jobId = data.id;
    activeJobId = jobId;
    const history = data.history || [];
    const depth = Math.min(4, Math.max(1, Number(data.depth) || 2));
    const opening = self.CrownfallEngine.detectOpening(history);
    const reviews = [];
    let fenBefore = self.CrownfallEngine.INITIAL_FEN;

    for (let i = 0; i < history.length; i++) {
      if (activeJobId !== jobId) return; // Cancelled
      const isBook = i < opening.theoryPlies;
      const rev = analyzePositionAndMove(fenBefore, history[i], depth, isBook);
      rev.phase = self.CrownfallEngine.detectPhase(new self.CrownfallEngine.ChessGame(history[i].fenAfter).board, i);
      reviews.push(rev);
      fenBefore = history[i].fenAfter;
      self.postMessage({ type: 'gameProgress', id: jobId, done: i + 1, total: history.length });
    }

    if (activeJobId === jobId) {
      self.postMessage({ type: 'gameAnalysis', id: jobId, depth, opening, reviews });
    }
    return;
  }

  // Single-position MultiPV analysis
  const { id, fen, depth = 3, multiPv = 3 } = data;
  try {
    const game = new self.CrownfallEngine.ChessGame(fen);
    const lines = game.searchMultiPV(Math.min(4, Math.max(1, depth)), multiPv);
    const top = lines[0] || { scoreCp: game.evaluateStatic(), mateIn: null, bestMove: null, san: null, pvSan: [] };
    self.postMessage({
      id,
      scoreCp: top.scoreCp,
      mateIn: top.mateIn,
      bestMove: top.bestMove,
      bestSan: top.san,
      lines: lines.map((l) => ({ scoreCp: l.scoreCp, mateIn: l.mateIn, san: l.san, bestMove: l.bestMove, pvSan: l.pvSan }))
    });
  } catch (err) {
    self.postMessage({ id, scoreCp: 0, mateIn: null, bestMove: null, bestSan: null, lines: [] });
  }
};
