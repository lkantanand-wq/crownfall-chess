(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CrownfallEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

  const PIECE_VALUES = {
    p: 100,
    n: 320,
    b: 330,
    r: 500,
    q: 900,
    k: 20000
  };

  // Piece-Square Tables (from White's perspective, index 0 = a8, 63 = h1)
  const PST = {
    p: [
      0,  0,  0,  0,  0,  0,  0,  0,
      50, 50, 50, 50, 50, 50, 50, 50,
      10, 10, 20, 30, 30, 20, 10, 10,
      5,  5, 10, 25, 25, 10,  5,  5,
      0,  0,  0, 20, 20,  0,  0,  0,
      5, -5,-10,  0,  0,-10, -5,  5,
      5, 10, 10,-20,-20, 10, 10,  5,
      0,  0,  0,  0,  0,  0,  0,  0
    ],
    n: [
      -50,-40,-30,-30,-30,-30,-40,-50,
      -40,-20,  0,  0,  0,  0,-20,-40,
      -30,  0, 10, 15, 15, 10,  0,-30,
      -30,  5, 15, 20, 20, 15,  5,-30,
      -30,  0, 15, 20, 20, 15,  0,-30,
      -30,  5, 10, 15, 15, 10,  5,-30,
      -40,-20,  0,  5,  5,  0,-20,-40,
      -50,-40,-30,-30,-30,-30,-40,-50
    ],
    b: [
      -20,-10,-10,-10,-10,-10,-10,-20,
      -10,  0,  0,  0,  0,  0,  0,-10,
      -10,  0,  5, 10, 10,  5,  0,-10,
      -10,  5,  5, 10, 10,  5,  5,-10,
      -10,  0, 10, 10, 10, 10,  0,-10,
      -10, 10, 10, 10, 10, 10, 10,-10,
      -10,  5,  0,  0,  0,  0,  5,-10,
      -20,-10,-10,-10,-10,-10,-10,-20
    ],
    r: [
      0,  0,  0,  0,  0,  0,  0,  0,
      5, 10, 10, 10, 10, 10, 10,  5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      0,  0,  0,  5,  5,  0,  0,  0
    ],
    q: [
      -20,-10,-10, -5, -5,-10,-10,-20,
      -10,  0,  0,  0,  0,  0,  0,-10,
      -10,  0,  5,  5,  5,  5,  0,-10,
      -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
      -10,  5,  5,  5,  5,  5,  0,-10,
      -10,  0,  5,  0,  0,  0,  0,-10,
      -20,-10,-10, -5, -5,-10,-10,-20
    ],
    k: [
      -30,-40,-40,-50,-50,-40,-40,-30,
      -30,-40,-40,-50,-50,-40,-40,-30,
      -30,-40,-40,-50,-50,-40,-40,-30,
      -30,-40,-40,-50,-50,-40,-40,-30,
      -20,-30,-30,-40,-40,-30,-30,-20,
      -10,-20,-20,-20,-20,-20,-20,-10,
      20, 20,  0,  0,  0,  0, 20, 20,
      20, 30, 10,  0,  0, 10, 30, 20
    ]
  };

  function idxToAlgebraic(idx) {
    const r = Math.floor(idx / 8);
    const c = idx % 8;
    return FILES[c] + RANKS[r];
  }

  function algebraicToIdx(sq) {
    if (!sq || sq.length !== 2) return -1;
    const c = FILES.indexOf(sq[0]);
    const r = RANKS.indexOf(sq[1]);
    if (c === -1 || r === -1) return -1;
    return r * 8 + c;
  }

  function pieceColor(p) {
    if (!p) return null;
    return p === p.toUpperCase() ? 'w' : 'b';
  }

  function pieceType(p) {
    return p ? p.toLowerCase() : null;
  }

  function oppositeColor(c) {
    return c === 'w' ? 'b' : 'w';
  }

  class ChessGame {
    constructor(fen = INITIAL_FEN) {
      this.load(fen);
    }

    load(fen) {
      const parts = fen.trim().split(/\s+/);
      if (parts.length < 4) throw new Error('Invalid FEN');
      const [placement, turn, castling, ep, halfmove = '0', fullmove = '1'] = parts;

      const board = new Array(64).fill(null);
      const rows = placement.split('/');
      if (rows.length !== 8) throw new Error('Invalid FEN placement');

      for (let r = 0; r < 8; r++) {
        let c = 0;
        for (const ch of rows[r]) {
          if (/[1-8]/.test(ch)) {
            c += parseInt(ch, 10);
          } else if (/[pnbrqkPNBRQK]/.test(ch)) {
            if (c >= 8) throw new Error('Invalid FEN row');
            board[r * 8 + c] = ch;
            c++;
          } else {
            throw new Error('Invalid FEN char: ' + ch);
          }
        }
        if (c !== 8) throw new Error('Invalid FEN row width');
      }

      this.board = board;
      this.turn = turn === 'b' ? 'b' : 'w';
      this.castling = {
        wK: castling.includes('K'),
        wQ: castling.includes('Q'),
        bK: castling.includes('k'),
        bQ: castling.includes('q')
      };
      this.epSquare = ep === '-' ? -1 : algebraicToIdx(ep);
      this.halfmoveClock = parseInt(halfmove, 10) || 0;
      this.fullmoveNumber = parseInt(fullmove, 10) || 1;
      this.history = [];
      this.positionCounts = {};
      this._recordPosition();
    }

    fen() {
      let placement = '';
      for (let r = 0; r < 8; r++) {
        let empty = 0;
        for (let c = 0; c < 8; c++) {
          const p = this.board[r * 8 + c];
          if (!p) {
            empty++;
          } else {
            if (empty > 0) {
              placement += empty;
              empty = 0;
            }
            placement += p;
          }
        }
        if (empty > 0) placement += empty;
        if (r < 7) placement += '/';
      }
      let castling = '';
      if (this.castling.wK) castling += 'K';
      if (this.castling.wQ) castling += 'Q';
      if (this.castling.bK) castling += 'k';
      if (this.castling.bQ) castling += 'q';
      if (!castling) castling = '-';
      const ep = this.epSquare === -1 ? '-' : idxToAlgebraic(this.epSquare);
      return `${placement} ${this.turn} ${castling} ${ep} ${this.halfmoveClock} ${this.fullmoveNumber}`;
    }

    _positionKey() {
      return this.fen().split(' ').slice(0, 4).join(' ');
    }

    _recordPosition() {
      const key = this._positionKey();
      this.positionCounts[key] = (this.positionCounts[key] || 0) + 1;
    }

    clone() {
      const g = new ChessGame(this.fen());
      g.positionCounts = { ...this.positionCounts };
      g.history = this.history.slice();
      return g;
    }

    findKing(color) {
      const target = color === 'w' ? 'K' : 'k';
      return this.board.indexOf(target);
    }

    isSquareAttacked(sq, byColor) {
      const r = Math.floor(sq / 8);
      const c = sq % 8;

      // Pawn attacks
      const pawnDir = byColor === 'w' ? 1 : -1; // square from which a pawn of byColor attacks sq
      const pawnChar = byColor === 'w' ? 'P' : 'p';
      const pr = r + pawnDir;
      if (pr >= 0 && pr < 8) {
        if (c - 1 >= 0 && this.board[pr * 8 + (c - 1)] === pawnChar) return true;
        if (c + 1 < 8 && this.board[pr * 8 + (c + 1)] === pawnChar) return true;
      }

      // Knight attacks
      const knightChar = byColor === 'w' ? 'N' : 'n';
      const knightOffsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
      for (const [dr, dc] of knightOffsets) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          if (this.board[nr * 8 + nc] === knightChar) return true;
        }
      }

      // King attacks
      const kingChar = byColor === 'w' ? 'K' : 'k';
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
            if (this.board[nr * 8 + nc] === kingChar) return true;
          }
        }
      }

      // Orthogonals (Rook / Queen)
      const rookChar = byColor === 'w' ? 'R' : 'r';
      const queenChar = byColor === 'w' ? 'Q' : 'q';
      const orthoDirs = [[-1,0],[1,0],[0,-1],[0,1]];
      for (const [dr, dc] of orthoDirs) {
        let nr = r + dr, nc = c + dc;
        while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const p = this.board[nr * 8 + nc];
          if (p) {
            if (p === rookChar || p === queenChar) return true;
            break;
          }
          nr += dr;
          nc += dc;
        }
      }

      // Diagonals (Bishop / Queen)
      const bishopChar = byColor === 'w' ? 'B' : 'b';
      const diagDirs = [[-1,-1],[-1,1],[1,-1],[1,1]];
      for (const [dr, dc] of diagDirs) {
        let nr = r + dr, nc = c + dc;
        while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const p = this.board[nr * 8 + nc];
          if (p) {
            if (p === bishopChar || p === queenChar) return true;
            break;
          }
          nr += dr;
          nc += dc;
        }
      }

      return false;
    }

    inCheck(color = this.turn) {
      const kSq = this.findKing(color);
      if (kSq === -1) return false;
      return this.isSquareAttacked(kSq, oppositeColor(color));
    }

    _generatePseudoMoves(color = this.turn) {
      const moves = [];
      for (let idx = 0; idx < 64; idx++) {
        const p = this.board[idx];
        if (!p || pieceColor(p) !== color) continue;
        const type = pieceType(p);
        const r = Math.floor(idx / 8);
        const c = idx % 8;

        if (type === 'p') {
          const dir = color === 'w' ? -1 : 1;
          const startRank = color === 'w' ? 6 : 1;
          const promoRank = color === 'w' ? 0 : 7;

          // Forward 1
          const f1r = r + dir;
          if (f1r >= 0 && f1r < 8 && !this.board[f1r * 8 + c]) {
            const to = f1r * 8 + c;
            if (f1r === promoRank) {
              for (const promo of ['q', 'r', 'b', 'n']) {
                moves.push({ from: idx, to, piece: p, promotion: promo });
              }
            } else {
              moves.push({ from: idx, to, piece: p });
              // Forward 2
              if (r === startRank) {
                const f2r = r + dir * 2;
                const to2 = f2r * 8 + c;
                if (!this.board[to2]) {
                  moves.push({ from: idx, to: to2, piece: p, doublePush: true });
                }
              }
            }
          }

          // Captures
          for (const dc of [-1, 1]) {
            const nc = c + dc;
            if (nc < 0 || nc >= 8 || f1r < 0 || f1r >= 8) continue;
            const to = f1r * 8 + nc;
            const target = this.board[to];
            if (target && pieceColor(target) !== color) {
              if (f1r === promoRank) {
                for (const promo of ['q', 'r', 'b', 'n']) {
                  moves.push({ from: idx, to, piece: p, captured: target, promotion: promo });
                }
              } else {
                moves.push({ from: idx, to, piece: p, captured: target });
              }
            } else if (to === this.epSquare) {
              const epCapSq = r * 8 + nc;
              moves.push({
                from: idx,
                to,
                piece: p,
                captured: this.board[epCapSq],
                enPassant: true
              });
            }
          }
        } else if (type === 'n') {
          const offsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
          for (const [dr, dc] of offsets) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) continue;
            const to = nr * 8 + nc;
            const target = this.board[to];
            if (!target || pieceColor(target) !== color) {
              moves.push({ from: idx, to, piece: p, captured: target || null });
            }
          }
        } else if (type === 'b' || type === 'r' || type === 'q') {
          const dirs = [];
          if (type === 'b' || type === 'q') dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
          if (type === 'r' || type === 'q') dirs.push([-1,0],[1,0],[0,-1],[0,1]);
          for (const [dr, dc] of dirs) {
            let nr = r + dr, nc = c + dc;
            while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
              const to = nr * 8 + nc;
              const target = this.board[to];
              if (!target) {
                moves.push({ from: idx, to, piece: p });
              } else {
                if (pieceColor(target) !== color) {
                  moves.push({ from: idx, to, piece: p, captured: target });
                }
                break;
              }
              nr += dr;
              nc += dc;
            }
          }
        } else if (type === 'k') {
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue;
              const nr = r + dr, nc = c + dc;
              if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) continue;
              const to = nr * 8 + nc;
              const target = this.board[to];
              if (!target || pieceColor(target) !== color) {
                moves.push({ from: idx, to, piece: p, captured: target || null });
              }
            }
          }
          // Castling
          const enemy = oppositeColor(color);
          if (color === 'w' && idx === 60 && !this.isSquareAttacked(60, enemy)) {
            if (this.castling.wK && !this.board[61] && !this.board[62] && this.board[63] === 'R') {
              if (!this.isSquareAttacked(61, enemy) && !this.isSquareAttacked(62, enemy)) {
                moves.push({ from: 60, to: 62, piece: p, castling: 'K' });
              }
            }
            if (this.castling.wQ && !this.board[59] && !this.board[58] && !this.board[57] && this.board[56] === 'R') {
              if (!this.isSquareAttacked(59, enemy) && !this.isSquareAttacked(58, enemy)) {
                moves.push({ from: 60, to: 58, piece: p, castling: 'Q' });
              }
            }
          } else if (color === 'b' && idx === 4 && !this.isSquareAttacked(4, enemy)) {
            if (this.castling.bK && !this.board[5] && !this.board[6] && this.board[7] === 'r') {
              if (!this.isSquareAttacked(5, enemy) && !this.isSquareAttacked(6, enemy)) {
                moves.push({ from: 4, to: 6, piece: p, castling: 'k' });
              }
            }
            if (this.castling.bQ && !this.board[3] && !this.board[2] && !this.board[1] && this.board[0] === 'r') {
              if (!this.isSquareAttacked(3, enemy) && !this.isSquareAttacked(2, enemy)) {
                moves.push({ from: 4, to: 2, piece: p, castling: 'q' });
              }
            }
          }
        }
      }
      return moves;
    }

    _applyMoveRaw(move) {
      const saved = {
        boardFrom: this.board[move.from],
        boardTo: this.board[move.to],
        epSquare: this.epSquare,
        castling: { ...this.castling },
        halfmoveClock: this.halfmoveClock,
        fullmoveNumber: this.fullmoveNumber,
        turn: this.turn,
        epCapturedPiece: null,
        epCapturedIdx: -1
      };

      const color = pieceColor(move.piece);
      const type = pieceType(move.piece);

      this.board[move.from] = null;
      if (move.promotion) {
        this.board[move.to] = color === 'w' ? move.promotion.toUpperCase() : move.promotion.toLowerCase();
      } else {
        this.board[move.to] = move.piece;
      }

      if (move.enPassant) {
        const r = Math.floor(move.from / 8);
        const c = move.to % 8;
        const capIdx = r * 8 + c;
        saved.epCapturedIdx = capIdx;
        saved.epCapturedPiece = this.board[capIdx];
        this.board[capIdx] = null;
      }

      if (move.castling === 'K') {
        this.board[61] = this.board[63];
        this.board[63] = null;
      } else if (move.castling === 'Q') {
        this.board[59] = this.board[56];
        this.board[56] = null;
      } else if (move.castling === 'k') {
        this.board[5] = this.board[7];
        this.board[7] = null;
      } else if (move.castling === 'q') {
        this.board[3] = this.board[0];
        this.board[0] = null;
      }

      // Update castling rights
      if (type === 'k') {
        if (color === 'w') { this.castling.wK = false; this.castling.wQ = false; }
        else { this.castling.bK = false; this.castling.bQ = false; }
      }
      if (move.from === 63 || move.to === 63) this.castling.wK = false;
      if (move.from === 56 || move.to === 56) this.castling.wQ = false;
      if (move.from === 7 || move.to === 7) this.castling.bK = false;
      if (move.from === 0 || move.to === 0) this.castling.bQ = false;

      // Update en passant square
      if (move.doublePush) {
        this.epSquare = (move.from + move.to) / 2;
      } else {
        this.epSquare = -1;
      }

      // Halfmove & fullmove
      if (type === 'p' || move.captured) {
        this.halfmoveClock = 0;
      } else {
        this.halfmoveClock++;
      }
      if (color === 'b') {
        this.fullmoveNumber++;
      }

      this.turn = oppositeColor(color);
      return saved;
    }

    _undoMoveRaw(move, saved) {
      this.board[move.from] = saved.boardFrom;
      this.board[move.to] = saved.boardTo;
      if (saved.epCapturedIdx !== -1) {
        this.board[saved.epCapturedIdx] = saved.epCapturedPiece;
      }
      if (move.castling === 'K') {
        this.board[63] = this.board[61];
        this.board[61] = null;
      } else if (move.castling === 'Q') {
        this.board[56] = this.board[59];
        this.board[59] = null;
      } else if (move.castling === 'k') {
        this.board[7] = this.board[5];
        this.board[5] = null;
      } else if (move.castling === 'q') {
        this.board[0] = this.board[3];
        this.board[3] = null;
      }
      this.epSquare = saved.epSquare;
      this.castling = saved.castling;
      this.halfmoveClock = saved.halfmoveClock;
      this.fullmoveNumber = saved.fullmoveNumber;
      this.turn = saved.turn;
    }

    legalMoves(fromSquare = null) {
      const pseudo = this._generatePseudoMoves(this.turn);
      const legal = [];
      const fromIdx = fromSquare ? (typeof fromSquare === 'string' ? algebraicToIdx(fromSquare) : fromSquare) : null;
      const moverColor = this.turn;

      for (const m of pseudo) {
        if (fromIdx !== null && m.from !== fromIdx) continue;
        const saved = this._applyMoveRaw(m);
        const kingInCheck = this.inCheck(moverColor);
        this._undoMoveRaw(m, saved);
        if (!kingInCheck) {
          legal.push(m);
        }
      }
      return legal;
    }

    _toSAN(move, allLegal) {
      if (move.castling === 'K' || move.castling === 'k') return 'O-O';
      if (move.castling === 'Q' || move.castling === 'q') return 'O-O-O';

      const type = pieceType(move.piece);
      const fromSq = idxToAlgebraic(move.from);
      const toSq = idxToAlgebraic(move.to);
      let san = '';

      if (type === 'p') {
        if (move.captured) {
          san += fromSq[0] + 'x';
        }
        san += toSq;
        if (move.promotion) {
          san += '=' + move.promotion.toUpperCase();
        }
      } else {
        san += type.toUpperCase();
        const samePiece = allLegal.filter(
          (m) => m.from !== move.from && m.to === move.to && pieceType(m.piece) === type
        );
        if (samePiece.length > 0) {
          const sameFile = samePiece.some((m) => idxToAlgebraic(m.from)[0] === fromSq[0]);
          const sameRank = samePiece.some((m) => idxToAlgebraic(m.from)[1] === fromSq[1]);
          if (!sameFile) san += fromSq[0];
          else if (!sameRank) san += fromSq[1];
          else san += fromSq;
        }
        if (move.captured) san += 'x';
        san += toSq;
      }

      return san;
    }

    makeMove({ from, to, promotion = null }) {
      const fromIdx = typeof from === 'string' ? algebraicToIdx(from) : from;
      const toIdx = typeof to === 'string' ? algebraicToIdx(to) : to;
      if (fromIdx === -1 || toIdx === -1) return null;

      const allLegal = this.legalMoves();
      const match = allLegal.find((m) => {
        if (m.from !== fromIdx || m.to !== toIdx) return false;
        if (m.promotion) {
          return m.promotion === (promotion ? promotion.toLowerCase() : 'q');
        }
        return true;
      });
      if (!match) return null;

      let san = this._toSAN(match, allLegal);
      const fenBefore = this.fen();
      this._applyMoveRaw(match);
      this._recordPosition();

      const inCheckNow = this.inCheck(this.turn);
      const nextLegal = this.legalMoves();
      if (inCheckNow) {
        san += nextLegal.length === 0 ? '#' : '+';
      }

      const moveRecord = {
        from: idxToAlgebraic(match.from),
        to: idxToAlgebraic(match.to),
        piece: match.piece,
        captured: match.captured || null,
        promotion: match.promotion || null,
        castling: match.castling || null,
        enPassant: !!match.enPassant,
        san,
        fenBefore,
        fenAfter: this.fen(),
        color: oppositeColor(this.turn)
      };
      this.history.push(moveRecord);
      return moveRecord;
    }

    isCheckmate() {
      return this.inCheck(this.turn) && this.legalMoves().length === 0;
    }

    isStalemate() {
      return !this.inCheck(this.turn) && this.legalMoves().length === 0;
    }

    isThreefoldRepetition() {
      const key = this._positionKey();
      return (this.positionCounts[key] || 0) >= 3;
    }

    isFiftyMoveRule() {
      return this.halfmoveClock >= 100;
    }

    isInsufficientMaterial() {
      const pieces = [];
      for (let i = 0; i < 64; i++) {
        const p = this.board[i];
        if (p && pieceType(p) !== 'k') {
          pieces.push({ p, i, r: Math.floor(i / 8), c: i % 8 });
        }
      }
      if (pieces.length === 0) return true;
      if (pieces.length === 1) {
        const t = pieceType(pieces[0].p);
        return t === 'n' || t === 'b';
      }
      if (pieces.length === 2) {
        const t0 = pieceType(pieces[0].p);
        const t1 = pieceType(pieces[1].p);
        if (t0 === 'b' && t1 === 'b') {
          const sqColor0 = (pieces[0].r + pieces[0].c) % 2;
          const sqColor1 = (pieces[1].r + pieces[1].c) % 2;
          return sqColor0 === sqColor1;
        }
      }
      return false;
    }

    getStatus() {
      if (this.isCheckmate()) {
        return {
          over: true,
          reason: 'checkmate',
          winner: oppositeColor(this.turn)
        };
      }
      if (this.isStalemate()) {
        return { over: true, reason: 'stalemate', winner: 'draw' };
      }
      if (this.isInsufficientMaterial()) {
        return { over: true, reason: 'insufficient_material', winner: 'draw' };
      }
      if (this.isThreefoldRepetition()) {
        return { over: true, reason: 'threefold_repetition', winner: 'draw' };
      }
      if (this.isFiftyMoveRule()) {
        return { over: true, reason: 'fifty_move_rule', winner: 'draw' };
      }
      return { over: false, reason: null, winner: null };
    }

    // Static evaluation from White's perspective (in centipawns)
    evaluateStatic() {
      let score = 0;
      for (let idx = 0; idx < 64; idx++) {
        const p = this.board[idx];
        if (!p) continue;
        const color = pieceColor(p);
        const type = pieceType(p);
        const val = PIECE_VALUES[type];
        const pstIdx = color === 'w' ? idx : (7 - Math.floor(idx / 8)) * 8 + (idx % 8);
        const pstVal = PST[type][pstIdx] || 0;
        if (color === 'w') {
          score += val + pstVal;
        } else {
          score -= val + pstVal;
        }
      }
      return score;
    }

    // Alpha-beta search returning { scoreCp, mateIn, bestMove } from White's perspective
    searchBestMove(depth = 3) {
      const turn = this.turn;
      const legal = this.legalMoves();
      if (legal.length === 0) {
        if (this.inCheck(turn)) {
          return { scoreCp: turn === 'w' ? -99999 : 99999, mateIn: 0, bestMove: null };
        }
        return { scoreCp: 0, mateIn: null, bestMove: null };
      }

      // Move ordering: captures & promotions first
      const orderMoves = (moves) => {
        return moves.sort((a, b) => {
          const sa = (a.captured ? PIECE_VALUES[pieceType(a.captured)] * 10 - PIECE_VALUES[pieceType(a.piece)] : 0) + (a.promotion ? 800 : 0);
          const sb = (b.captured ? PIECE_VALUES[pieceType(b.captured)] * 10 - PIECE_VALUES[pieceType(b.piece)] : 0) + (b.promotion ? 800 : 0);
          return sb - sa;
        });
      };

      const alphaBeta = (d, alpha, beta, maximizing) => {
        const moves = this.legalMoves();
        if (moves.length === 0) {
          if (this.inCheck(this.turn)) {
            return maximizing ? -90000 - d : 90000 + d;
          }
          return 0;
        }
        if (d === 0) {
          return this.evaluateStatic();
        }

        orderMoves(moves);
        if (maximizing) {
          let maxEval = -Infinity;
          for (const m of moves) {
            const saved = this._applyMoveRaw(m);
            const ev = alphaBeta(d - 1, alpha, beta, false);
            this._undoMoveRaw(m, saved);
            if (ev > maxEval) maxEval = ev;
            if (ev > alpha) alpha = ev;
            if (beta <= alpha) break;
          }
          return maxEval;
        } else {
          let minEval = Infinity;
          for (const m of moves) {
            const saved = this._applyMoveRaw(m);
            const ev = alphaBeta(d - 1, alpha, beta, true);
            this._undoMoveRaw(m, saved);
            if (ev < minEval) minEval = ev;
            if (ev < beta) beta = ev;
            if (beta <= alpha) break;
          }
          return minEval;
        }
      };

      orderMoves(legal);
      const maximizing = turn === 'w';
      let bestMove = legal[0];
      let bestScore = maximizing ? -Infinity : Infinity;
      let alpha = -Infinity;
      let beta = Infinity;

      for (const m of legal) {
        const saved = this._applyMoveRaw(m);
        const ev = alphaBeta(depth - 1, alpha, beta, !maximizing);
        this._undoMoveRaw(m, saved);
        if (maximizing) {
          if (ev > bestScore) {
            bestScore = ev;
            bestMove = m;
          }
          if (ev > alpha) alpha = ev;
        } else {
          if (ev < bestScore) {
            bestScore = ev;
            bestMove = m;
          }
          if (ev < beta) beta = ev;
        }
      }

      let mateIn = null;
      if (Math.abs(bestScore) >= 85000) {
        const plies = Math.max(1, depth - (Math.abs(bestScore) - 90000));
        mateIn = Math.ceil(plies / 2) * (bestScore > 0 ? 1 : -1);
      }

      return {
        scoreCp: bestScore,
        mateIn,
        bestMove: {
          from: idxToAlgebraic(bestMove.from),
          to: idxToAlgebraic(bestMove.to),
          promotion: bestMove.promotion || null
        }
      };
    }
  }

  return {
    INITIAL_FEN,
    FILES,
    RANKS,
    PIECE_VALUES,
    ChessGame,
    idxToAlgebraic,
    algebraicToIdx,
    pieceColor,
    pieceType
  };
});
