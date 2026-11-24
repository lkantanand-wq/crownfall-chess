const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { ChessGame, INITIAL_FEN } = require('./shared/chess-engine');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

app.use(express.json());
app.use('/shared', express.static(path.join(__dirname, 'shared')));
app.use(express.static(path.join(__dirname, 'public')));

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  cookieHeader.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx > -1) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  });
  return out;
}

function getAuthUser(req) {
  const cookies = parseCookies(req.headers.cookie);
  return db.getUserBySession(cookies.crownfall_sid);
}

function setSessionCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production';
  res.setHeader(
    'Set-Cookie',
    `crownfall_sid=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}${isProd ? '; Secure' : ''}`
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'crownfall_sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

// Multi-page routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/lobby', (req, res) => res.sendFile(path.join(__dirname, 'public', 'lobby.html')));
app.get('/game/:roomId', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game.html')));
app.get('/analysis', (req, res) => res.sendFile(path.join(__dirname, 'public', 'analysis.html')));
app.get('/rules', (req, res) => res.sendFile(path.join(__dirname, 'public', 'rules.html')));
app.get('/account', (req, res) => res.sendFile(path.join(__dirname, 'public', 'account.html')));
app.get('/friends', (req, res) => res.sendFile(path.join(__dirname, 'public', 'friends.html')));
app.get('/history', (req, res) => res.sendFile(path.join(__dirname, 'public', 'history.html')));
app.get('/openings', (req, res) => res.sendFile(path.join(__dirname, 'public', 'openings.html')));

// Auth APIs
app.get('/api/auth/config', (req, res) => {
  res.json({ googleEnabled: Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) });
});

app.get('/api/auth/me', (req, res) => {
  const user = getAuthUser(req);
  if (!user) return res.json({ user: null });
  res.json({ user: db.sanitizeUser(user) });
});

app.post('/api/auth/register', (req, res) => {
  try {
    const { username, email, password, displayName } = req.body || {};
    const user = db.createLocalUser({ username, email, password, displayName });
    const token = db.createSession(user.id);
    setSessionCookie(res, token);
    res.json({ user: db.sanitizeUser(user) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { identifier, password } = req.body || {};
  const user = db.findUserByLogin(identifier);
  if (!user || !db.verifyPassword(String(password || ''), user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid username/email or password.' });
  }
  const token = db.createSession(user.id);
  setSessionCookie(res, token);
  res.json({ user: db.sanitizeUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  db.deleteSession(cookies.crownfall_sid);
  clearSessionCookie(res);
  res.json({ ok: true });
});

// Google OAuth 2.0
app.get('/auth/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.redirect('/account?error=google_not_configured');
  }
  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  const redirectUri = `${baseUrl}/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account'
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

app.get('/auth/google/callback', async (req, res) => {
  const code = req.query.code;
  if (!code || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.redirect('/account?error=google_failed');
  }
  try {
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const redirectUri = `${baseUrl}/auth/google/callback`;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('No access token');

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const profile = await profileRes.json();
    const user = db.upsertGoogleUser({
      googleId: profile.id,
      email: profile.email,
      name: profile.name
    });
    const sessToken = db.createSession(user.id);
    setSessionCookie(res, sessToken);
    res.redirect('/account');
  } catch (err) {
    console.error('Google OAuth error:', err.message);
    res.redirect('/account?error=google_failed');
  }
});

// Account Games History API
app.post('/api/bots/result', (req, res) => {
  const user = getAuthUser(req);
  if (!user) return res.json({ guest: true });
  const { botElo = 500, outcome = 'draw' } = req.body || {};
  const score = outcome === 'win' ? 1 : (outcome === 'loss' ? 0 : 0.5);
  const delta = db.computeEloDelta(user.elo || 500, Number(botElo) || 500, score);
  const updated = db.updateUserElo(user.id, delta, outcome);
  res.json(updated);
});

app.get('/api/games', (req, res) => {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  res.json({ games: db.getUserGames(user.id) });
});

app.get('/api/games/:gameId', (req, res) => {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  const game = db.getUserGameById(user.id, req.params.gameId);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  const cachedAnalysis = db.getGameAnalysis(user.id, req.params.gameId);
  res.json({ game, analysis: cachedAnalysis });
});

app.get('/api/analysis/:gameId', (req, res) => {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  res.json({ analysis: db.getGameAnalysis(user.id, req.params.gameId) });
});

app.post('/api/analysis/:gameId', (req, res) => {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  const game = db.getUserGameById(user.id, req.params.gameId);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  const saved = db.saveGameAnalysis(user.id, req.params.gameId, req.body || {});
  res.json({ analysis: saved });
});

app.delete('/api/analysis/:gameId', (req, res) => {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  const deleted = db.deleteGameAnalysis(user.id, req.params.gameId);
  res.json({ deleted });
});

// Track online users by userId -> Set<socketId>
const onlineUsers = new Map();
function isUserOnline(userId) {
  const s = onlineUsers.get(userId);
  return Boolean(s && s.size > 0);
}

// Friends APIs
app.get('/api/friends', (req, res) => {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in to manage friends' });

  const friends = (user.friends || []).map((fid) => {
    const f = db.findUserById(fid);
    return f ? { id: f.id, username: f.username, displayName: f.displayName, online: isUserOnline(f.id) } : null;
  }).filter(Boolean);

  const incoming = (user.incomingRequests || []).map((rid) => {
    const r = db.findUserById(rid);
    return r ? { id: r.id, username: r.username, displayName: r.displayName } : null;
  }).filter(Boolean);

  const outgoing = (user.outgoingRequests || []).map((oid) => {
    const o = db.findUserById(oid);
    return o ? { id: o.id, username: o.username, displayName: o.displayName } : null;
  }).filter(Boolean);

  res.json({
    friendCode: user.friendCode,
    friends,
    incoming,
    outgoing
  });
});

app.post('/api/friends/request', (req, res) => {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in first' });
  try {
    const target = db.sendFriendRequest(user.id, req.body?.query);
    res.json({ ok: true, targetName: target.displayName });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/friends/respond', (req, res) => {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in first' });
  try {
    db.respondFriendRequest(user.id, req.body?.requesterId, Boolean(req.body?.accept));
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/friends/remove', (req, res) => {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in first' });
  db.removeFriend(user.id, req.body?.friendId);
  res.json({ ok: true });
});

// Rooms & Chess Game Engine
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

const TIME_CONTROLS = {
  '1+0': { baseMs: 60 * 1000, incMs: 0, label: 'Bullet 1+0' },
  '3+2': { baseMs: 180 * 1000, incMs: 2000, label: 'Blitz 3+2' },
  '5+0': { baseMs: 300 * 1000, incMs: 0, label: 'Blitz 5+0' },
  '10+0': { baseMs: 600 * 1000, incMs: 0, label: 'Rapid 10+0' },
  '15+10': { baseMs: 900 * 1000, incMs: 10000, label: 'Classical 15+10' },
  'untimed': { baseMs: 0, incMs: 0, label: 'Untimed' }
};

function createRoomRecord({ timeControl = '10+0', colorPreference = 'random', allowEval = true, hostName = 'Player 1' }) {
  const tc = TIME_CONTROLS[timeControl] || TIME_CONTROLS['10+0'];
  const roomId = generateRoomCode();

  let hostColor = colorPreference;
  if (hostColor !== 'w' && hostColor !== 'b') {
    hostColor = Math.random() < 0.5 ? 'w' : 'b';
  }

  rooms.set(roomId, {
    id: roomId,
    game: new ChessGame(INITIAL_FEN),
    timeControlKey: timeControl,
    baseMs: tc.baseMs,
    incMs: tc.incMs,
    timeLabel: tc.label,
    allowEval: Boolean(allowEval),
    hostColorPreference: hostColor,
    players: { w: null, b: null },
    clocks: { w: tc.baseMs, b: tc.baseMs },
    lastTickAt: null,
    started: false,
    over: false,
    result: null,
    drawOfferBy: null,
    rematchVotes: new Set(),
    chat: [],
    savedToAccounts: false,
    createdAt: Date.now(),
    hostName: String(hostName || 'Player 1').slice(0, 24)
  });

  return { roomId, hostColor, timeLabel: tc.label };
}

function getSocketColor(room, socketId) {
  if (room.players.w && room.players.w.socketId === socketId) return 'w';
  if (room.players.b && room.players.b.socketId === socketId) return 'b';
  return 'spectator';
}

function persistRoomToAccounts(room) {
  if (!room.over || !room.result || room.savedToAccounts) return;
  if (!room.game.history || room.game.history.length === 0) return;
  room.savedToAccounts = true;

  const r = room.result;
  const wElo = room.players.w?.elo || 500;
  const bElo = room.players.b?.elo || 500;
  const wScore = r.winner === 'draw' ? 0.5 : (r.winner === 'w' ? 1 : 0);
  const bScore = 1 - wScore;

  const wDelta = db.computeEloDelta(wElo, bElo, wScore);
  const bDelta = db.computeEloDelta(bElo, wElo, bScore);

  const wOutcome = wScore === 1 ? 'win' : (wScore === 0 ? 'loss' : 'draw');
  const bOutcome = bScore === 1 ? 'win' : (bScore === 0 ? 'loss' : 'draw');

  let wChange = { oldElo: wElo, newElo: Math.max(100, wElo + wDelta), delta: wDelta };
  let bChange = { oldElo: bElo, newElo: Math.max(100, bElo + bDelta), delta: bDelta };

  if (room.players.w && room.players.w.userId) {
    wChange = db.updateUserElo(room.players.w.userId, wDelta, wOutcome) || wChange;
    room.players.w.elo = wChange.newElo;
  }
  if (room.players.b && room.players.b.userId && room.players.b.userId !== room.players.w?.userId) {
    bChange = db.updateUserElo(room.players.b.userId, bDelta, bOutcome) || bChange;
    room.players.b.elo = bChange.newElo;
  }
  room.result.eloChanges = { w: wChange, b: bChange };

  const resultLabel = r.winner === 'draw' ? '½-½' : (r.winner === 'w' ? '1-0' : '0-1');
  const record = {
    id: `${room.id}_${Date.now()}`,
    whiteName: room.players.w ? `${room.players.w.name} (${wElo})` : 'White',
    blackName: room.players.b ? `${room.players.b.name} (${bElo})` : 'Black',
    timeLabel: room.timeLabel,
    resultLabel,
    reason: r.reason,
    playedAt: Date.now(),
    history: room.game.history
  };

  if (room.players.w && room.players.w.userId) {
    db.saveGameToUser(room.players.w.userId, record);
  }
  if (room.players.b && room.players.b.userId && room.players.b.userId !== room.players.w?.userId) {
    db.saveGameToUser(room.players.b.userId, record);
  }
}

app.post('/api/rooms', (req, res) => {
  const user = getAuthUser(req);
  const { timeControl = '10+0', colorPreference = 'random', allowEval = true, hostName } = req.body || {};
  const created = createRoomRecord({
    timeControl,
    colorPreference,
    allowEval,
    hostName: hostName || user?.displayName || 'Player 1'
  });
  res.json(created);
});

app.post('/api/friends/challenge', (req, res) => {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in first' });

  const { friendId, timeControl = '10+0', allowEval = true } = req.body || {};
  if (!(user.friends || []).includes(friendId)) {
    return res.status(400).json({ error: 'Not in your friends list' });
  }

  const created = createRoomRecord({
    timeControl,
    colorPreference: 'random',
    allowEval,
    hostName: user.displayName
  });

  const targetSockets = onlineUsers.get(friendId);
  if (targetSockets) {
    for (const sid of targetSockets) {
      io.to(sid).emit('friend:challenge', {
        roomId: created.roomId,
        fromName: user.displayName,
        fromUsername: user.username,
        timeLabel: created.timeLabel
      });
    }
  }

  res.json({ roomId: created.roomId, friendOnline: Boolean(targetSockets && targetSockets.size > 0) });
});

app.get('/api/rooms/:roomId', (req, res) => {
  const room = rooms.get(String(req.params.roomId).toUpperCase());
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({
    roomId: room.id,
    timeLabel: room.timeLabel,
    allowEval: room.allowEval,
    started: room.started,
    over: room.over,
    players: {
      w: room.players.w ? { name: room.players.w.name, connected: room.players.w.connected } : null,
      b: room.players.b ? { name: room.players.b.name, connected: room.players.b.connected } : null
    }
  });
});

function buildRoomSnapshot(room) {
  return {
    roomId: room.id,
    fen: room.game.fen(),
    turn: room.game.turn,
    history: room.game.history,
    inCheck: room.game.inCheck(room.game.turn),
    timeControlKey: room.timeControlKey,
    timeLabel: room.timeLabel,
    baseMs: room.baseMs,
    incMs: room.incMs,
    allowEval: room.allowEval,
    clocks: { ...room.clocks },
    started: room.started,
    over: room.over,
    result: room.result,
    drawOfferBy: room.drawOfferBy,
    rematchCount: room.rematchVotes.size,
    players: {
      w: room.players.w ? { name: room.players.w.name, connected: room.players.w.connected, elo: room.players.w.elo || 500 } : null,
      b: room.players.b ? { name: room.players.b.name, connected: room.players.b.connected, elo: room.players.b.elo || 500 } : null
    },
    chat: room.chat.slice(-50)
  };
}

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (!room.started || room.over || room.baseMs === 0 || !room.lastTickAt) continue;
    const elapsed = now - room.lastTickAt;
    room.lastTickAt = now;
    const activeColor = room.game.turn;
    room.clocks[activeColor] = Math.max(0, room.clocks[activeColor] - elapsed);

    if (room.clocks[activeColor] === 0) {
      room.over = true;
      room.result = { over: true, reason: 'timeout', winner: activeColor === 'w' ? 'b' : 'w' };
      persistRoomToAccounts(room);
      io.to(room.id).emit('game:state', buildRoomSnapshot(room));
    }
  }
}, 100);

setInterval(() => {
  const cutoff = Date.now() - 6 * 60 * 60 * 1000;
  for (const [id, room] of rooms.entries()) {
    const anyConnected = (room.players.w && room.players.w.connected) || (room.players.b && room.players.b.connected);
    if (!anyConnected && room.createdAt < cutoff) {
      rooms.delete(id);
    }
  }
}, 15 * 60 * 1000);

const matchmakingQueue = [];

setInterval(() => {
  const now = Date.now();
  const matched = new Set();
  for (let i = 0; i < matchmakingQueue.length; i++) {
    if (matched.has(i)) continue;
    const p1 = matchmakingQueue[i];
    const waitSec1 = Math.floor((now - p1.joinedAt) / 1000);
    const range1 = 100 + Math.floor(waitSec1 / 3) * 75;

    let bestIdx = -1;
    let bestDiff = Infinity;
    for (let j = i + 1; j < matchmakingQueue.length; j++) {
      if (matched.has(j)) continue;
      const p2 = matchmakingQueue[j];
      if (p1.timeControl !== p2.timeControl) continue;
      if (p1.userId && p2.userId && p1.userId === p2.userId) continue;

      const waitSec2 = Math.floor((now - p2.joinedAt) / 1000);
      const range2 = 100 + Math.floor(waitSec2 / 3) * 75;
      const diff = Math.abs(p1.elo - p2.elo);
      if (diff <= Math.max(range1, range2) && diff < bestDiff) {
        bestDiff = diff;
        bestIdx = j;
      }
    }

    if (bestIdx !== -1) {
      matched.add(i);
      matched.add(bestIdx);
      const p2 = matchmakingQueue[bestIdx];
      const created = createRoomRecord({
        timeControl: p1.timeControl,
        colorPreference: 'random',
        allowEval: true,
        hostName: p1.name
      });
      io.to(p1.socketId).emit('matchmaking:found', {
        roomId: created.roomId,
        opponentName: p2.name,
        opponentElo: p2.elo
      });
      io.to(p2.socketId).emit('matchmaking:found', {
        roomId: created.roomId,
        opponentName: p1.name,
        opponentElo: p1.elo
      });
    } else {
      io.to(p1.socketId).emit('matchmaking:status', {
        waitSec: waitSec1,
        range: range1,
        elo: p1.elo
      });
    }
  }
  if (matched.size > 0) {
    for (let k = matchmakingQueue.length - 1; k >= 0; k--) {
      if (matched.has(k)) matchmakingQueue.splice(k, 1);
    }
  }
}, 1000);

io.on('connection', (socket) => {
  const cookies = parseCookies(socket.handshake.headers.cookie);
  const authUser = db.getUserBySession(cookies.crownfall_sid);
  const authUserId = authUser ? authUser.id : null;

  if (authUserId) {
    if (!onlineUsers.has(authUserId)) onlineUsers.set(authUserId, new Set());
    onlineUsers.get(authUserId).add(socket.id);
  }

  let joinedRoomId = null;

  socket.on('matchmaking:join', ({ timeControl = '10+0', playerName, guestElo = 500 }) => {
    for (let k = matchmakingQueue.length - 1; k >= 0; k--) {
      if (matchmakingQueue[k].socketId === socket.id) matchmakingQueue.splice(k, 1);
    }
    const elo = authUser && typeof authUser.elo === 'number' ? authUser.elo : (Number(guestElo) || 500);
    const name = String(authUser?.displayName || playerName || 'Player').slice(0, 24);
    matchmakingQueue.push({
      socketId: socket.id,
      userId: authUserId,
      name,
      elo,
      timeControl,
      joinedAt: Date.now()
    });
    socket.emit('matchmaking:status', { waitSec: 0, range: 100, elo });
  });

  socket.on('matchmaking:cancel', () => {
    for (let k = matchmakingQueue.length - 1; k >= 0; k--) {
      if (matchmakingQueue[k].socketId === socket.id) matchmakingQueue.splice(k, 1);
    }
  });

  socket.on('room:join', ({ roomId, playerName, playerToken }) => {
    const code = String(roomId || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) {
      socket.emit('room:error', { message: 'Room not found. Check your room code or create a new match.' });
      return;
    }

    joinedRoomId = code;
    socket.join(code);

    const cleanName = String(authUser?.displayName || playerName || 'Guest').trim().slice(0, 24) || 'Guest';
    const playerElo = authUser && typeof authUser.elo === 'number' ? authUser.elo : 500;
    const token = authUserId ? `uid_${authUserId}` : String(playerToken || socket.id);
    let assignedColor = 'spectator';

    if (room.players.w && room.players.w.token === token) {
      room.players.w.socketId = socket.id;
      room.players.w.connected = true;
      room.players.w.name = cleanName;
      room.players.w.userId = authUserId || room.players.w.userId;
      room.players.w.elo = authUser ? playerElo : (room.players.w.elo || 500);
      assignedColor = 'w';
    } else if (room.players.b && room.players.b.token === token) {
      room.players.b.socketId = socket.id;
      room.players.b.connected = true;
      room.players.b.name = cleanName;
      room.players.b.userId = authUserId || room.players.b.userId;
      room.players.b.elo = authUser ? playerElo : (room.players.b.elo || 500);
      assignedColor = 'b';
    } else if (!room.players.w && !room.players.b) {
      const c = room.hostColorPreference;
      room.players[c] = { token, socketId: socket.id, name: cleanName, connected: true, userId: authUserId, elo: playerElo };
      assignedColor = c;
    } else if (!room.players.w) {
      room.players.w = { token, socketId: socket.id, name: cleanName, connected: true, userId: authUserId, elo: playerElo };
      assignedColor = 'w';
    } else if (!room.players.b) {
      room.players.b = { token, socketId: socket.id, name: cleanName, connected: true, userId: authUserId, elo: playerElo };
      assignedColor = 'b';
    }

    if (room.players.w && room.players.b && !room.started && !room.over) {
      room.started = true;
      room.lastTickAt = Date.now();
    }

    socket.emit('room:joined', { color: assignedColor, snapshot: buildRoomSnapshot(room) });
    socket.to(code).emit('game:state', buildRoomSnapshot(room));
  });

  socket.on('game:move', ({ from, to, promotion }) => {
    if (!joinedRoomId) return;
    const room = rooms.get(joinedRoomId);
    if (!room || !room.started || room.over) return;
    const myColor = getSocketColor(room, socket.id);
    if (myColor !== room.game.turn) return;

    const now = Date.now();
    const moveElapsedMs = room.lastTickAt ? Math.max(0, now - room.lastTickAt) : 0;
    if (room.baseMs > 0 && room.lastTickAt) {
      const elapsed = moveElapsedMs;
      room.clocks[myColor] = Math.max(0, room.clocks[myColor] - elapsed);
      if (room.clocks[myColor] === 0) {
        room.over = true;
        room.result = { over: true, reason: 'timeout', winner: myColor === 'w' ? 'b' : 'w' };
        persistRoomToAccounts(room);
        io.to(room.id).emit('game:state', buildRoomSnapshot(room));
        return;
      }
    }

    const move = room.game.makeMove({ from, to, promotion });
    if (!move) {
      socket.emit('game:invalidMove');
      return;
    }

    move.timeSpentMs = moveElapsedMs;
    if (room.baseMs > 0) {
      room.clocks[myColor] += room.incMs;
      room.lastTickAt = now;
      move.clockAfterMs = room.clocks[myColor];
    }

    room.drawOfferBy = null;
    const status = room.game.getStatus();
    if (status.over) {
      room.over = true;
      room.result = status;
      persistRoomToAccounts(room);
    }

    io.to(room.id).emit('game:state', buildRoomSnapshot(room));
  });

  socket.on('game:resign', () => {
    if (!joinedRoomId) return;
    const room = rooms.get(joinedRoomId);
    if (!room || !room.started || room.over) return;
    const myColor = getSocketColor(room, socket.id);
    if (myColor !== 'w' && myColor !== 'b') return;

    room.over = true;
    room.result = { over: true, reason: 'resignation', winner: myColor === 'w' ? 'b' : 'w' };
    persistRoomToAccounts(room);
    io.to(room.id).emit('game:state', buildRoomSnapshot(room));
  });

  socket.on('game:offerDraw', () => {
    if (!joinedRoomId) return;
    const room = rooms.get(joinedRoomId);
    if (!room || !room.started || room.over) return;
    const myColor = getSocketColor(room, socket.id);
    if (myColor !== 'w' && myColor !== 'b') return;

    if (room.drawOfferBy && room.drawOfferBy !== myColor) {
      room.over = true;
      room.result = { over: true, reason: 'agreement', winner: 'draw' };
      room.drawOfferBy = null;
      persistRoomToAccounts(room);
    } else {
      room.drawOfferBy = myColor;
    }
    io.to(room.id).emit('game:state', buildRoomSnapshot(room));
  });

  socket.on('game:declineDraw', () => {
    if (!joinedRoomId) return;
    const room = rooms.get(joinedRoomId);
    if (!room) return;
    const myColor = getSocketColor(room, socket.id);
    if (!room.drawOfferBy || room.drawOfferBy === myColor || myColor === 'spectator') return;
    room.drawOfferBy = null;
    io.to(room.id).emit('game:state', buildRoomSnapshot(room));
  });

  socket.on('game:rematch', () => {
    if (!joinedRoomId) return;
    const room = rooms.get(joinedRoomId);
    if (!room || !room.over) return;
    const myColor = getSocketColor(room, socket.id);
    if (myColor !== 'w' && myColor !== 'b') return;

    room.rematchVotes.add(myColor);
    if (room.rematchVotes.size >= 2) {
      const prevW = room.players.w;
      const prevB = room.players.b;
      room.players.w = prevB;
      room.players.b = prevW;

      room.game = new ChessGame(INITIAL_FEN);
      room.clocks = { w: room.baseMs, b: room.baseMs };
      room.lastTickAt = Date.now();
      room.started = true;
      room.over = false;
      room.result = null;
      room.drawOfferBy = null;
      room.savedToAccounts = false;
      room.rematchVotes.clear();

      if (room.players.w) io.to(room.players.w.socketId).emit('room:colorUpdated', { color: 'w' });
      if (room.players.b) io.to(room.players.b.socketId).emit('room:colorUpdated', { color: 'b' });
    }
    io.to(room.id).emit('game:state', buildRoomSnapshot(room));
  });

  socket.on('chat:send', ({ text }) => {
    if (!joinedRoomId) return;
    const room = rooms.get(joinedRoomId);
    if (!room) return;
    const myColor = getSocketColor(room, socket.id);
    const clean = String(text || '').trim().slice(0, 240);
    if (!clean) return;

    const sender = myColor === 'w' ? room.players.w?.name || 'White' : myColor === 'b' ? room.players.b?.name || 'Black' : 'Spectator';
    const msg = { sender, color: myColor, text: clean, ts: Date.now() };
    room.chat.push(msg);
    if (room.chat.length > 100) room.chat.shift();
    io.to(room.id).emit('chat:message', msg);
  });

  socket.on('disconnect', () => {
    for (let k = matchmakingQueue.length - 1; k >= 0; k--) {
      if (matchmakingQueue[k].socketId === socket.id) matchmakingQueue.splice(k, 1);
    }
    if (authUserId && onlineUsers.has(authUserId)) {
      onlineUsers.get(authUserId).delete(socket.id);
      if (onlineUsers.get(authUserId).size === 0) onlineUsers.delete(authUserId);
    }
    if (!joinedRoomId) return;
    const room = rooms.get(joinedRoomId);
    if (!room) return;
    if (room.players.w && room.players.w.socketId === socket.id) room.players.w.connected = false;
    if (room.players.b && room.players.b.socketId === socket.id) room.players.b.connected = false;
    io.to(room.id).emit('game:state', buildRoomSnapshot(room));
  });
});

server.listen(PORT, () => {
  console.log(`Crownfall Chess running on http://localhost:${PORT}`);
});
