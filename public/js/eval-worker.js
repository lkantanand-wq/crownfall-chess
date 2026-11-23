importScripts('/shared/chess-engine.js');

self.onmessage = function (e) {
  const { id, fen, depth = 3 } = e.data;
  try {
    const game = new self.CrownfallEngine.ChessGame(fen);
    const result = game.searchBestMove(depth);
    self.postMessage({ id, ...result });
  } catch (err) {
    self.postMessage({ id, scoreCp: 0, mateIn: null, bestMove: null });
  }
};
