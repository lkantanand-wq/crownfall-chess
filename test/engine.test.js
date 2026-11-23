const assert = require('assert');
const { ChessGame, INITIAL_FEN } = require('../shared/chess-engine');

// 1. Initial position has 20 legal moves
const g1 = new ChessGame(INITIAL_FEN);
assert.strictEqual(g1.legalMoves().length, 20, 'Initial position should have 20 legal moves');

// 2. Fool's Mate checkmate detection
assert.ok(g1.makeMove({ from: 'f2', to: 'f3' }));
assert.ok(g1.makeMove({ from: 'e7', to: 'e5' }));
assert.ok(g1.makeMove({ from: 'g2', to: 'g4' }));
const mateMove = g1.makeMove({ from: 'd8', to: 'h4' });
assert.ok(mateMove);
assert.strictEqual(mateMove.san, 'Qh4#');
assert.strictEqual(g1.isCheckmate(), true);
assert.deepStrictEqual(g1.getStatus(), { over: true, reason: 'checkmate', winner: 'b' });

// 3. Castling kingside
const gCastle = new ChessGame('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
const castleMove = gCastle.makeMove({ from: 'e1', to: 'g1' });
assert.ok(castleMove);
assert.strictEqual(castleMove.san, 'O-O');
assert.strictEqual(gCastle.board[62], 'K');
assert.strictEqual(gCastle.board[61], 'R');

// 4. En passant
const gEp = new ChessGame('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3');
const epMove = gEp.makeMove({ from: 'e5', to: 'd6' });
assert.ok(epMove);
assert.strictEqual(epMove.enPassant, true);
assert.strictEqual(gEp.board[27], null); // d5 captured pawn removed

// 5. Pawn promotion
const gPromo = new ChessGame('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
const promoMove = gPromo.makeMove({ from: 'a7', to: 'a8', promotion: 'q' });
assert.ok(promoMove);
assert.strictEqual(promoMove.san, 'a8=Q+');
assert.strictEqual(gPromo.board[0], 'Q');

// 6. Alpha-Beta evaluation sanity
const gEval = new ChessGame('4k3/8/8/8/8/8/4Q3/4K3 w - - 0 1');
const res = gEval.searchBestMove(2);
assert.ok(res.scoreCp > 800, 'White up a Queen should have > +8.00 evaluation');
assert.ok(res.bestMove, 'Should return a best move');

console.log('All Crownfall Chess engine tests passed!');
