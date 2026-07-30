// records.js — persisted hall-of-fame (localStorage). Loaded before main.js.
// Pure read of game state — touches no rules or physics.
const Records = (() => {
  const KEY = 'flipgame.records.v1';
  // The edition that is free from the start. Branded ports (Parrot Flip) swap
  // this with the bottle — see window.FLIP_BRAND in skins.js.
  const BASE_SKIN =
    (typeof window !== 'undefined' && window.FLIP_BRAND && window.FLIP_BRAND.baseSkin) || 'bottle';
  const DEFAULTS = {
    bestStreak: 0,      // longest personal consecutive makes
    highestStake: 0,    // highest shared stake (pointCount) ever reached
    totalMakes: 0,
    totalFlips: 0,
    longestOnFire: 0,   // most bonus makes in one ON FIRE run
    greatSaves: 0,      // lifetime tip-past-the-brink-and-recover MAKEs
    mostWins: {},       // name -> win count
    totalWins: 0,       // wins on this device, across all players — drives skin unlocks
    unlockedSkins: [BASE_SKIN],  // flippable editions earned on this device
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
        data.unlockedSkins = [BASE_SKIN];
      }
      return data;
    } catch (e) { return clone(DEFAULTS); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }

  // Expand legacy edition unlocks (people/buildings/…) into individual
  // character ids once Skins is available. Safe to call repeatedly.
  function migrateEditionUnlocks() {
    if (typeof window === 'undefined' || !window.Skins || typeof Skins.editionChars !== 'function') return false;
    let changed = false;
    const next = [];
    for (const id of unlockedSkins()) {
      // Christ the Redeemer retired → Space Needle (same yellow slot).
      if (id === 'building-redeemer') {
        next.push('building-needle');
        changed = true;
        continue;
      }
      const kids = Skins.editionChars(id);
      if (kids && kids.length) {
        next.push(...kids);
        changed = true;
      } else {
        next.push(id);
      }
    }
    if (!changed) return false;
    data.unlockedSkins = [...new Set(next)];
    save();
    return true;
  }

  // ── Mystery boxes ─────────────────────────────────────────────────────────
  // Every WINS_PER_BOX wins earns one box, and a box grants ONE RANDOM
  // still-locked character (Smash-Bros style reveal). Deliberately not the
  // ordered `unlock` ladder any more: the old order dumped the six cartoon casts
  // in an arbitrary block at the end, so the last families sat behind 300+ wins
  // and nobody ever saw them.
  //
  // Nothing new is persisted to track this. The count of characters owned beyond
  // the free base skin IS the count of boxes opened, so "owed" is derivable —
  // which also means the old threshold saves migrate for free.
  const WINS_PER_BOX = 2;

  function boxesEarned() { return Math.floor((data.totalWins || 0) / WINS_PER_BOX); }
  function boxesOpened() { return Math.max(0, unlockedSkins().length - 1); }
  function allChars() {
    return (typeof window !== 'undefined' && window.Skins && typeof Skins.list === 'function')
      ? Skins.list() : [];
  }
  function lockedChars() { return allChars().filter((s) => !isSkinUnlocked(s.id)); }

  // Aliens are the capstone (unique bank-shot physics), so they're held out of
  // the pool until everything else is collected — the collection always ends
  // on aliens no matter how the draws fall.
  function drawPool() {
    const locked = lockedChars();
    const nonAlien = locked.filter((s) =>
      (window.Skins.familyKey ? Skins.familyKey(s.id) : s.drawAs) !== 'alien');
    return nonAlien.length ? nonAlien : locked;
  }

  // Boxes earned but not yet opened, clamped to what's actually left to give.
  function pendingBoxes() {
    return Math.max(0, Math.min(boxesEarned() - boxesOpened(), lockedChars().length));
  }
  function winsToNextBox() {
    const w = data.totalWins || 0;
    return lockedChars().length ? WINS_PER_BOX - (w % WINS_PER_BOX) : 0;
  }

  function openBoxes(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const pool = drawPool();
      if (!pool.length) break;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      data.unlockedSkins = unlockedSkins().concat(pick.id);
      out.push(pick.id);
    }
    if (out.length) save();
    return out;
  }

  // BOOT: reconcile quietly. A returning player on the old 1-per-3-wins ladder
  // is owed a few boxes under the new 1-per-2 rate; granting those with five
  // reveal animations before they've even played would be nonsense.
  function syncUnlocksFromWins() {
    if (!allChars().length) return [];
    migrateEditionUnlocks();
    return openBoxes(pendingBoxes());
  }

  // GAME OVER: claim boxes earned during play, for an animated reveal.
  function claimBoxes() {
    if (!allChars().length) return [];
    return openBoxes(pendingBoxes());
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
    if (!Array.isArray(data.unlockedSkins)) data.unlockedSkins = [BASE_SKIN];
    if (!data.unlockedSkins.includes(BASE_SKIN)) data.unlockedSkins.unshift(BASE_SKIN);
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
    data.unlockedSkins = [BASE_SKIN];
    save();
  }

  return { recordFlip, recordWin, renderHtml, reset, totalWins, unlockedSkins,
           isSkinUnlocked, unlockSkin, resetSkinProgress, syncUnlocksFromWins,
           claimBoxes, pendingBoxes, winsToNextBox, WINS_PER_BOX };
})();
