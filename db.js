const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let state = {
  users: [],
  sessions: {},
  analyses: {}
};

function load() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.users)) {
        state = {
          users: parsed.users.map((u) => ({
            elo: 500,
            wins: 0,
            losses: 0,
            draws: 0,
            ...u
          })),
          sessions: parsed.sessions || {},
          analyses: parsed.analyses || {}
        };
      }
    }
  } catch (err) {
    console.error('Failed to load db.json:', err.message);
  }
}

function save() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save db.json:', err.message);
  }
}

load();

function generateId(prefix = 'u') {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function generateFriendCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return state.users.some((u) => u.friendCode === code) ? generateFriendCode() : code;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, origHash] = stored.split(':');
  const hashBuf = crypto.scryptSync(password, salt, 64);
  const origBuf = Buffer.from(origHash, 'hex');
  if (hashBuf.length !== origBuf.length) return false;
  return crypto.timingSafeEqual(hashBuf, origBuf);
}

function computeEloDelta(ratingA, ratingB, scoreA, kFactor = 32) {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  return Math.round(kFactor * (scoreA - expectedA));
}

function sanitizeUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    email: u.email,
    friendCode: u.friendCode,
    elo: typeof u.elo === 'number' ? u.elo : 500,
    peakElo: typeof u.peakElo === 'number' ? u.peakElo : (typeof u.elo === 'number' ? u.elo : 500),
    createdAt: u.createdAt || Date.now(),
    wins: u.wins || 0,
    losses: u.losses || 0,
    draws: u.draws || 0,
    authProvider: u.googleId ? 'google' : 'local',
    friends: u.friends || [],
    incomingRequests: u.incomingRequests || [],
    outgoingRequests: u.outgoingRequests || [],
    gamesCount: (u.games || []).length
  };
}

function findUserById(id) {
  return state.users.find((u) => u.id === id) || null;
}

function findUserByLogin(identifier) {
  const clean = String(identifier || '').trim().toLowerCase();
  return state.users.find(
    (u) => (u.email && u.email.toLowerCase() === clean) || (u.username && u.username.toLowerCase() === clean)
  ) || null;
}

function findUserByGoogleId(googleId) {
  return state.users.find((u) => u.googleId === googleId) || null;
}

function findUserByFriendCodeOrUsername(query) {
  const clean = String(query || '').trim().toLowerCase();
  return state.users.find(
    (u) => u.friendCode.toLowerCase() === clean || u.username.toLowerCase() === clean
  ) || null;
}

function createLocalUser({ username, email, password, displayName }) {
  const cleanUser = String(username || '').trim().replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanUser || cleanUser.length < 3) throw new Error('Username must be at least 3 characters (letters, numbers, _).');
  if (!password || password.length < 6) throw new Error('Password must be at least 6 characters.');
  if (state.users.some((u) => u.username.toLowerCase() === cleanUser.toLowerCase())) {
    throw new Error('Username is already taken.');
  }
  if (cleanEmail && state.users.some((u) => u.email && u.email.toLowerCase() === cleanEmail)) {
    throw new Error('Email is already registered.');
  }

  const user = {
    id: generateId('u'),
    username: cleanUser,
    displayName: String(displayName || cleanUser).trim().slice(0, 24) || cleanUser,
    email: cleanEmail || null,
    googleId: null,
    passwordHash: hashPassword(password),
    friendCode: generateFriendCode(),
    elo: 500,
    wins: 0,
    losses: 0,
    draws: 0,
    friends: [],
    incomingRequests: [],
    outgoingRequests: [],
    games: [],
    createdAt: Date.now()
  };
  state.users.push(user);
  save();
  return user;
}

function upsertGoogleUser({ googleId, email, name }) {
  let user = findUserByGoogleId(googleId);
  if (!user && email) {
    user = state.users.find((u) => u.email && u.email.toLowerCase() === email.toLowerCase());
    if (user) {
      user.googleId = googleId;
      save();
      return user;
    }
  }
  if (!user) {
    const base = (email ? email.split('@')[0] : name || 'player').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 14) || 'player';
    let uname = base;
    let suffix = 1;
    while (state.users.some((u) => u.username.toLowerCase() === uname.toLowerCase())) {
      uname = `${base}${suffix++}`;
    }
    user = {
      id: generateId('u'),
      username: uname,
      displayName: String(name || uname).slice(0, 24),
      email: email ? email.toLowerCase() : null,
      googleId,
      passwordHash: null,
      friendCode: generateFriendCode(),
      elo: 500,
      wins: 0,
      losses: 0,
      draws: 0,
      friends: [],
      incomingRequests: [],
      outgoingRequests: [],
      games: [],
      createdAt: Date.now()
    };
    state.users.push(user);
    save();
  }
  return user;
}

function createSession(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  state.sessions[token] = {
    userId,
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000
  };
  save();
  return token;
}

function getUserBySession(token) {
  if (!token) return null;
  const sess = state.sessions[token];
  if (!sess) return null;
  if (sess.expiresAt < Date.now()) {
    delete state.sessions[token];
    save();
    return null;
  }
  return findUserById(sess.userId);
}

function deleteSession(token) {
  if (token && state.sessions[token]) {
    delete state.sessions[token];
    save();
  }
}

function sendFriendRequest(fromUserId, targetQuery) {
  const fromUser = findUserById(fromUserId);
  const toUser = findUserByFriendCodeOrUsername(targetQuery);
  if (!fromUser || !toUser) throw new Error('User or friend code not found.');
  if (fromUser.id === toUser.id) throw new Error('You cannot add yourself.');
  if (fromUser.friends.includes(toUser.id)) throw new Error('Already friends.');
  if (!toUser.incomingRequests.includes(fromUser.id)) toUser.incomingRequests.push(fromUser.id);
  if (!fromUser.outgoingRequests.includes(toUser.id)) fromUser.outgoingRequests.push(toUser.id);
  save();
  return toUser;
}

function respondFriendRequest(userId, requesterId, accept) {
  const user = findUserById(userId);
  const reqUser = findUserById(requesterId);
  if (!user || !reqUser) throw new Error('User not found.');
  user.incomingRequests = user.incomingRequests.filter((id) => id !== requesterId);
  reqUser.outgoingRequests = reqUser.outgoingRequests.filter((id) => id !== userId);
  if (accept) {
    if (!user.friends.includes(requesterId)) user.friends.push(requesterId);
    if (!reqUser.friends.includes(userId)) reqUser.friends.push(userId);
  }
  save();
}

function removeFriend(userId, friendId) {
  const user = findUserById(userId);
  const friend = findUserById(friendId);
  if (user) user.friends = user.friends.filter((id) => id !== friendId);
  if (friend) friend.friends = friend.friends.filter((id) => id !== userId);
  save();
}

function updateUserElo(userId, delta, outcome) {
  const user = findUserById(userId);
  if (!user) return null;
  const oldElo = typeof user.elo === 'number' ? user.elo : 500;
  const newElo = Math.max(100, oldElo + delta);
  user.elo = newElo;
  user.peakElo = Math.max(user.peakElo || oldElo, newElo);
  if (outcome === 'win') user.wins = (user.wins || 0) + 1;
  else if (outcome === 'loss') user.losses = (user.losses || 0) + 1;
  else user.draws = (user.draws || 0) + 1;
  save();
  return { oldElo, newElo, delta: newElo - oldElo };
}

function saveGameToUser(userId, gameRecord) {
  const user = findUserById(userId);
  if (!user) return;
  if (!Array.isArray(user.games)) user.games = [];
  if (user.games.some((g) => g.id === gameRecord.id)) return;
  user.games.unshift(gameRecord);
  if (user.games.length > 50) user.games = user.games.slice(0, 50);
  save();
}

function getUserGames(userId) {
  const user = findUserById(userId);
  return user && Array.isArray(user.games) ? user.games : [];
}

function getUserGameById(userId, gameId) {
  return getUserGames(userId).find((g) => g.id === gameId) || null;
}

function saveGameAnalysis(userId, gameId, analysisData) {
  const key = `${userId}:${gameId}`;
  state.analyses[key] = {
    ...analysisData,
    gameId,
    userId,
    updatedAt: Date.now()
  };
  save();
  return state.analyses[key];
}

function getGameAnalysis(userId, gameId) {
  return state.analyses[`${userId}:${gameId}`] || null;
}

function deleteGameAnalysis(userId, gameId) {
  const key = `${userId}:${gameId}`;
  if (state.analyses[key]) {
    delete state.analyses[key];
    save();
    return true;
  }
  return false;
}

module.exports = {
  computeEloDelta,
  sanitizeUser,
  findUserById,
  findUserByLogin,
  verifyPassword,
  createLocalUser,
  upsertGoogleUser,
  createSession,
  getUserBySession,
  deleteSession,
  sendFriendRequest,
  respondFriendRequest,
  removeFriend,
  updateUserElo,
  saveGameToUser,
  getUserGames,
  getUserGameById,
  saveGameAnalysis,
  getGameAnalysis,
  deleteGameAnalysis
};
