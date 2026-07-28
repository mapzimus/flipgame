// records.js — persisted hall-of-fame (localStorage). Loaded before main.js.
// Pure read of game state — touches no rules or physics.
const Records = (() => {
  const KEY = 'flipgame.records.v1';
  const DEFAULTS = {
    bestStreak: 0,      // longest personal consecutive makes
    highestStake: 0,    // highest shared stake (pointCount) ever reached
    totalMakes: 0,
    totalFlips: 0,
    longestOnFire: 0,   // most bonus makes in one ON FIRE run
    greatSaves: 0,      // lifetime tip-past-the-brink-and-recover MAKEs
    mostWins: {},       // name -> win count
    totalWins: 0,       // wins on this device, across all players — drives skin unlocks
    unlockedSkins: ['bottle'],  // flippable editions earned on this device
  };
  let data = load();

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      const data = raw ? { ...clone(DEFAULTS), ...JSON.parse(raw) } : clone(DEFAULTS);
      // Gold Trophy edition was replaced by Buildings — migrate any saved unlock.
      if (Array.isArray(data.unlockedSkins)) {
        const before = data.unlockedSkins.join(',');
        data.unlockedSkins = [...new Set(
          data.unlockedSkins.map((id) => id === 'trophy_gold' ? 'buildings' : id)
        )];
        if (data.unlockedSkins.join(',') !== before) {
          try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
        }
      } else {
        data.unlockedSkins = ['bottle'];
      }
      return data;
    } catch (e) { return clone(DEFAULTS); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }

  // Grant editions whose unlock threshold totalWins already meets. Call after
  // Skins is loaded (Records boots before skins.js). Returns newly granted ids.
  function syncUnlocksFromWins() {
    if (typeof window === 'undefined' || !window.Skins || typeof Skins.list !== 'function') return [];
    const wins = data.totalWins || 0;
    const fresh = [];
    for (const s of Skins.list()) {
      const need = s.unlock;
      if (typeof need === 'number' && wins >= need && !isSkinUnlocked(s.id)) {
        data.unlockedSkins = unlockedSkins().concat(s.id);
        fresh.push(s.id);
      }
    }
    if (fresh.length) save();
    return fresh;
  }

  // Call AFTER each game.resolveFlip() (normal play and practice).
  // `extra` carries display-only flip detail from main.js (e.g. greatSave).
  // Returns a snapshot of the updated totals so achievement checks can read
  // "lifetime count AFTER this flip" without a second load.
  function recordFlip(g, extra) {
    data.totalFlips++;
    if (g.lastResult === 'MAKE') data.totalMakes++;
    const streak = g.practice ? g.practiceStreak : (g.currentPlayer()?.streak || 0);
    if (streak > data.bestStreak) data.bestStreak = streak;
    if (g.pointCount > data.highestStake) data.highestStake = g.pointCount;
    if (g.onFireBonus > data.longestOnFire) data.longestOnFire = g.onFireBonus;
    if ((g.endedFireBonus || 0) > data.longestOnFire) data.longestOnFire = g.endedFireBonus;
    if (extra && extra.greatSave) data.greatSaves = (data.greatSaves || 0) + 1;
    save();
    return clone(data);
  }
  function recordWin(name) {
    if (!name) return clone(data);
    data.mostWins[name] = (data.mostWins[name] || 0) + 1;
    data.totalWins = (data.totalWins || 0) + 1;
    save();
    return clone(data);
  }
  function totalWins() { return data.totalWins || 0; }
  function topWinner() {
    let best = null, n = 0;
    for (const [name, c] of Object.entries(data.mostWins)) if (c > n) { best = name; n = c; }
    return best ? `${best} · ${n}` : '—';
  }
  function renderHtml() {
    const rows = [
      ['🏆', 'Most wins',   topWinner()],
      ['🔥', 'Best streak', data.bestStreak],
      ['⚡', 'Top stake',   '×' + data.highestStake],
      ['🔥', 'Hot run',     '+' + data.longestOnFire],
      ['🧤', 'Great Saves', data.greatSaves || 0],
      ['✓',  'Total makes', data.totalMakes],
      ['Σ',  'Total flips', data.totalFlips],
    ];
    return '<div class="records-title">🏅 Hall of Fame</div><div class="records-grid">' +
      rows.map(([icon, key, val]) =>
        `<div class="rec-item"><span class="rec-val">${val}</span>` +
        `<span class="rec-key">${icon} ${key}</span></div>`).join('') + '</div>';
  }
  function reset() { data = clone(DEFAULTS); save(); }

  // ── Unlockable skins ──────────────────────────────────────────────────────
  function unlockedSkins() {
    if (!Array.isArray(data.unlockedSkins)) data.unlockedSkins = ['bottle'];
    if (!data.unlockedSkins.includes('bottle')) data.unlockedSkins.unshift('bottle');
    return data.unlockedSkins.slice();
  }
  function isSkinUnlocked(id) { return unlockedSkins().includes(id); }
  // Returns true only if this call is what newly unlocked it (for the reveal).
  function unlockSkin(id) {
    if (isSkinUnlocked(id)) return false;
    data.unlockedSkins = unlockedSkins().concat(id);
    save();
    return true;
  }
  // Wipe ONLY the unlock ladder (editions + the win counter that drives it).
  // Hall-of-fame stats stay — "start the collection over" shouldn't erase the
  // party's records. Both fields must clear together: zeroing the skins while
  // keeping totalWins would re-unlock everything at the next game over.
  function resetSkinProgress() {
    data.totalWins = 0;
    data.unlockedSkins = ['bottle'];
    save();
  }

  return { recordFlip, recordWin, renderHtml, reset, totalWins, unlockedSkins, isSkinUnlocked, unlockSkin, resetSkinProgress, syncUnlocksFromWins };
})();
