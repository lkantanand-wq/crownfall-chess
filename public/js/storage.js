window.CrownfallStorage = (function () {
  const GAMES_KEY = 'crownfall_recent_games';
  const THEME_KEY = 'crownfall_board_theme';
  const MAX_GAMES = 3;

  function getRecentGames() {
    try {
      const raw = localStorage.getItem(GAMES_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.slice(0, MAX_GAMES) : [];
    } catch (_) {
      return [];
    }
  }

  function saveRecentGame(record) {
    if (!record || !record.id || !Array.isArray(record.history) || record.history.length === 0) return;
    try {
      const existing = getRecentGames().filter((g) => g.id !== record.id);
      const updated = [record, ...existing].slice(0, MAX_GAMES);
      localStorage.setItem(GAMES_KEY, JSON.stringify(updated));
    } catch (_) {}
  }

  function getBoardTheme() {
    try {
      return localStorage.getItem(THEME_KEY) || 'emerald';
    } catch (_) {
      return 'emerald';
    }
  }

  function applyBoardTheme(theme) {
    const clean = theme || 'emerald';
    document.body.setAttribute('data-board-theme', clean);
    try {
      localStorage.setItem(THEME_KEY, clean);
    } catch (_) {}
  }

  return {
    getRecentGames,
    saveRecentGame,
    getBoardTheme,
    applyBoardTheme
  };
})();
