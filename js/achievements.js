// achievements.js -- deterministic 100-entry v111 achievement catalog.
// Checks observe reported outcomes only and never advance gameplay RNG.
(function (root, factory) {
  'use strict';
  var Interfaces = root && root.FlipgameV111Interfaces;
  var Progression = root && root.FlipgameV111Progression;
  if (typeof module === 'object' && module.exports) {
    Interfaces = require('./v111-interfaces.js');
    Progression = require('./v111-progression.js');
  }
  var api = factory(Interfaces, Progression, root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Achievements = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (Interfaces, Progression, root) {
  'use strict';

  var KEY = 'flipgame.achievements.v3';
  var LEGACY_KEY = 'flipgame.achievements.v1';

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }
  function canonicalEventId(value) {
    return value === 'rainbow-trail' ? 'rainbow-corkscrew' : String(value || '');
  }
  function format(c) { return String(c.format || c.matchFormat || '').toLowerCase(); }
  function won(c) { return c.won === true || c.result === 'win' || c.matchWon === true; }

  var CATALOG = [];
  function add(category, id, emoji, name, desc, rare) {
    CATALOG.push({ category: category, id: id, emoji: emoji, name: name, desc: desc, rare: !!rare });
  }

  // Original IDs stay unchanged so the v1 earned-id array migrates losslessly.
  var EXISTING = [
    ['first_flip','🎬','First Flip','Take your first qualifying flip.'],
    ['first_make','🔩','Nailed It','Land your first MAKE.'],
    ['ignition','🔥','Ignition','Go ON FIRE with three makes in a row.'],
    ['inferno','🌋','Inferno','Reach seven bonus lives in an ON FIRE run.'],
    ['supernova','☄️','Supernova','Reach ten bonus lives in an ON FIRE run.'],
    ['streak_master','⚡','Streak Master','String together ten makes.'],
    ['high_roller','🎲','High Roller','Make a flip with eight lives on the line.'],
    ['table_setter','🏦','Table Setter','Make a flip with twelve lives on the line.'],
    ['bullseye','🎯','Bullseye','Stick a dead-vertical landing.'],
    ['full_send','🚀','Full Send','Make a max-power flick.'],
    ['feather_touch','🪶','Feather Touch','Make a whisper-soft flick.'],
    ['great_save','🧤','The Great Save','Tip far over and stand back up.',true],
    ['cap_land','🙃','Cap Land','Stick a landing on the cap.',true],
    ['mothership','👽','Mothership','Bank a shot through the tractor ring.'],
    ['smooth_operator','🛝','Smooth Operator','Reach the tractor ring after three banks.'],
    ['deadeye','🎯','Deadeye','Bank through the center of the tractor ring.'],
    ['last_one_standing','🏆','Last One Standing','Win a qualifying match.'],
    ['dynasty','👑','Dynasty','Reach five wins with one player identity.'],
    ['empire','🏰','Empire','Reach fifteen wins with one player identity.'],
    ['iron_will','🛡️','Iron Will','Win after dropping to one life.'],
    ['clean_sweep','🧹','Clean Sweep','Win without missing.'],
    ['sudden_survivor','💀','Sudden Survivor','Win a sudden-death match.'],
    ['comeback_kid','♻️','Comeback Kid','Win from one life in sudden death.',true],
    ['party_animal','🎉','Party Animal','Win with at least six players.'],
    ['full_house','🎱','Full House','Win an eight-player match.'],
    ['century_club','💯','Century Club','Reach 250 qualifying flips.'],
    ['millennial','📚','Millennial','Reach 1,000 qualifying flips.'],
    ['hot_hands','✋','Hot Hands','Ignite ON FIRE twice in one match.'],
    ['ghost_protocol','👻','Ghost Protocol','Win a clean sweep in sudden death.',true],
    ['close_encounter','🛸','Close Encounter','Escape through the tractor ring after six banks.',true],
  ];
  EXISTING.forEach(function (a) { add('existing', a[0], a[1], a[2], a[3], a[4]); });

  var EVENT_EMOJI = ['🌈','🥤','🚀','💨','✨','🎾','🌎','🌙','🧊','🛸','⬇️','🦘','🌬️','🔬','🌀','🪢','🦠','✌️','🦇','☄️','🧲','❤️','⚫','🪃','🎰','⏪','🟡','🪞','🧢','💔'];
  Interfaces.EVENT_CATALOG.forEach(function (event, index) {
    add('events', 'event-' + event.id, EVENT_EMOJI[index], event.displayName,
      'Finish a qualifying flip with ' + event.displayName + ' active.');
  });

  var CLASSIC = [
    ['first-win','🏅','Classic Debut','Win a Classic match.'],
    ['ten-wins','🔟','Classic Ten','Reach ten Classic wins.'],
    ['twenty-five-wins','🏆','Classic Twenty-Five','Reach twenty-five Classic wins.'],
    ['fifty-wins','👑','Classic Fifty','Reach fifty Classic wins.'],
    ['clean-sweep','🧹','Classic Clean Sweep','Win Classic without missing.'],
    ['comeback','🔄','Classic Comeback','Win Classic after dropping to one life.'],
    ['sudden-death','💀','Classic Survivor','Win Classic in sudden death.'],
    ['perfect-win','🎯','Classic Precision','Win Classic with a perfect landing.'],
    ['on-fire-win','🔥','Classic Heat','Win Classic after going ON FIRE.'],
    ['eight-player-win','8️⃣','Classic Full Table','Win an eight-player Classic match.'],
  ];
  CLASSIC.forEach(function (a) { add('classic', 'classic-' + a[0], a[1], a[2], a[3]); });

  var CUP = [
    ['first-heat-win','🥇','Heat Winner','Win a Cup heat.'],
    ['first-series-win','🏆','Cup Winner','Win a Cup series.'],
    ['short-win','⏱️','Short Cup Champion','Win a Short Cup.'],
    ['full-win','🏛️','Full Cup Champion','Win a Full Cup.'],
    ['sweep','🧹','Cup Sweep','Win a Cup two heats to none.'],
    ['comeback','🌊','Cup Comeback','Win a Cup after losing its first heat.'],
    ['sudden-death','💀','Cup Survivor','Win a Cup containing sudden death.'],
    ['perfect-series','💎','Perfect Cup','Win every Cup heat without missing.',true],
  ];
  CUP.forEach(function (a) { add('cup', 'cup-' + a[0], a[1], a[2], a[3], a[4]); });

  var TEAM = [
    ['first-win','🤝','Team Debut','Win Team Clash.'],
    ['perfect-cancel','⚖️','Perfect Cancel','Finish a round with exact cancellation.'],
    ['shutout','🛡️','Team Shutout','Win Team Clash eleven to zero.'],
    ['comeback','🔄','Team Rally','Win after trailing by five team points.'],
    ['2-player-win','2','2-Player Team Win','Win Team Clash with two players.'],
    ['4-player-win','4','4-Player Team Win','Win Team Clash with four players.'],
    ['6-player-win','6','6-Player Team Win','Win Team Clash with six players.'],
    ['8-player-win','8','8-Player Team Win','Win Team Clash with eight players.'],
  ];
  TEAM.forEach(function (a) { add('team', 'team-' + a[0], a[1], a[2], a[3]); });

  var COLLECTION = [
    ['first-reward','🎁','First Reveal','Own a progression reward.'],
    ['ten-objects','📦','Object Shelf','Own ten objects.'],
    ['twenty-five-objects','🏛️','Object Gallery','Own twenty-five objects.'],
    ['all-objects','👑','Complete Object Collection','Own all fifty-one objects.',true],
    ['first-cosmetic','🎨','First Style','Own a cosmetic.'],
    ['twenty-five-cosmetics','✨','Style Cabinet','Own twenty-five cosmetics.'],
    ['all-cosmetics','🌈','Complete Style Collection','Own all fifty cosmetics.',true],
    ['capstone','🛸','Capstone','Own Alien, Insane Mode, and Physics Lab.',true],
  ];
  COLLECTION.forEach(function (a) { add('collection', 'collection-' + a[0], a[1], a[2], a[3], a[4]); });

  var LAB_STATS = [
    ['hundred-flips','🧮','Sample Size','Record one hundred qualifying flips.'],
    ['five-hundred-makes','📈','Make Archive','Record five hundred qualifying makes.'],
    ['ten-cap-lands','🙃','Cap Sample','Record ten qualifying cap lands.'],
    ['ten-great-saves','🧤','Recovery Sample','Record ten qualifying great saves.'],
    ['all-events-observed','🔭','Event Observer','Observe all thirty events in qualifying play.',true],
    ['exported','📤','Local Archivist','Export local statistics.'],
  ];
  LAB_STATS.forEach(function (a) { add('lab-stats', 'stats-' + a[0], a[1], a[2], a[3], a[4]); });

  freeze(CATALOG);
  if (CATALOG.length !== 100) throw new Error('v111 achievement catalog must contain exactly 100 entries');
  var BY_ID = Object.create(null);
  CATALOG.forEach(function (achievement) {
    if (BY_ID[achievement.id]) throw new Error('Duplicate achievement id: ' + achievement.id);
    BY_ID[achievement.id] = achievement;
  });

  function matchExisting(id, c) {
    switch (id) {
      case 'first_flip': return c.totalFlipsLifetime === 1;
      case 'first_make': return c.result === 'MAKE' && c.totalMakesLifetime === 1;
      case 'ignition': return !!c.justIgnited;
      case 'inferno': return c.onFireBonus >= 7;
      case 'supernova': return c.onFireBonus >= 10;
      case 'streak_master': return c.streak >= 10;
      case 'high_roller': return c.result === 'MAKE' && c.pointCount >= 8;
      case 'table_setter': return c.result === 'MAKE' && c.pointCount >= 12;
      case 'bullseye': return !!c.perfect;
      case 'full_send': return c.result === 'MAKE' && c.power != null && c.power >= 0.95;
      case 'feather_touch': return c.result === 'MAKE' && c.power > 0 && c.power <= 0.25;
      case 'great_save': return !!c.greatSave;
      case 'cap_land': return !!c.capLand;
      case 'mothership': return c.landingReason === 'tractor-ring';
      case 'smooth_operator': return c.landingReason === 'tractor-ring' && (c.bankHits || 0) >= 3;
      case 'deadeye': return c.landingReason === 'tractor-ring' && c.padOffset != null && c.padOffset <= 0.22;
      case 'last_one_standing': return won(c);
      case 'dynasty': return c.winnerWins >= 5;
      case 'empire': return c.winnerWins >= 15;
      case 'iron_will': return won(c) && !!c.droppedToOneLife;
      case 'clean_sweep': return won(c) && !!c.wonWithoutMiss;
      case 'sudden_survivor': return won(c) && !!c.sawSuddenDeath;
      case 'comeback_kid': return won(c) && !!c.droppedToOneLife && !!c.sawSuddenDeath;
      case 'party_animal': return won(c) && (c.playerCount || 0) >= 6;
      case 'full_house': return won(c) && (c.playerCount || 0) >= 8;
      case 'century_club': return c.totalFlipsLifetime >= 250;
      case 'millennial': return c.totalFlipsLifetime >= 1000;
      case 'hot_hands': return (c.ignitionsThisGame || 0) >= 2;
      case 'ghost_protocol': return won(c) && !!c.wonWithoutMiss && !!c.sawSuddenDeath;
      case 'close_encounter': return c.landingReason === 'tractor-ring' && (c.bankHits || 0) >= 6;
      default: return false;
    }
  }

  function matches(achievement, c) {
    var id = achievement.id;
    if (achievement.category === 'existing') return matchExisting(id, c);
    if (achievement.category === 'events') {
      return canonicalEventId(c.eventId || c.rareEvent) === id.slice(6) && c.eventResolved !== false;
    }
    switch (id) {
      case 'classic-first-win': return format(c) === 'classic' && won(c);
      case 'classic-ten-wins': return (c.totalClassicWins || 0) >= 10;
      case 'classic-twenty-five-wins': return (c.totalClassicWins || 0) >= 25;
      case 'classic-fifty-wins': return (c.totalClassicWins || 0) >= 50;
      case 'classic-clean-sweep': return format(c) === 'classic' && won(c) && !!c.wonWithoutMiss;
      case 'classic-comeback': return format(c) === 'classic' && won(c) && !!c.droppedToOneLife;
      case 'classic-sudden-death': return format(c) === 'classic' && won(c) && !!c.sawSuddenDeath;
      case 'classic-perfect-win': return format(c) === 'classic' && won(c) && !!c.perfectInMatch;
      case 'classic-on-fire-win': return format(c) === 'classic' && won(c) && (c.ignitionsThisGame || 0) > 0;
      case 'classic-eight-player-win': return format(c) === 'classic' && won(c) && c.playerCount === 8;
      case 'cup-first-heat-win': return format(c) === 'cup' && !!c.heatWon;
      case 'cup-first-series-win': return format(c) === 'cup' && won(c);
      case 'cup-short-win': return format(c) === 'cup' && won(c) && c.cupLength === 'short';
      case 'cup-full-win': return format(c) === 'cup' && won(c) && c.cupLength === 'full';
      case 'cup-sweep': return format(c) === 'cup' && won(c) && (c.loserHeatWins || 0) === 0;
      case 'cup-comeback': return format(c) === 'cup' && won(c) && !!c.lostFirstHeat;
      case 'cup-sudden-death': return format(c) === 'cup' && won(c) && !!c.sawSuddenDeath;
      case 'cup-perfect-series': return format(c) === 'cup' && won(c) && !!c.cupWonWithoutMiss;
      case 'team-first-win': return format(c) === 'team' && won(c);
      case 'team-perfect-cancel': return format(c) === 'team' && !!c.perfectCancellation;
      case 'team-shutout': return format(c) === 'team' && won(c) && c.winnerScore === 11 && c.loserScore === 0;
      case 'team-comeback': return format(c) === 'team' && won(c) && (c.largestDeficit || 0) >= 5;
      case 'team-2-player-win': return format(c) === 'team' && won(c) && c.playerCount === 2;
      case 'team-4-player-win': return format(c) === 'team' && won(c) && c.playerCount === 4;
      case 'team-6-player-win': return format(c) === 'team' && won(c) && c.playerCount === 6;
      case 'team-8-player-win': return format(c) === 'team' && won(c) && c.playerCount === 8;
      case 'collection-first-reward': return (c.qualifyingWins || 0) >= 1;
      case 'collection-ten-objects': return (c.ownedObjectCount || 0) >= 10;
      case 'collection-twenty-five-objects': return (c.ownedObjectCount || 0) >= 25;
      case 'collection-all-objects': return (c.ownedObjectCount || 0) >= 51;
      case 'collection-first-cosmetic': return (c.ownedCosmeticCount || 0) >= 1;
      case 'collection-twenty-five-cosmetics': return (c.ownedCosmeticCount || 0) >= 25;
      case 'collection-all-cosmetics': return (c.ownedCosmeticCount || 0) >= 50;
      case 'collection-capstone': return !!c.capstoneOwned;
      case 'stats-hundred-flips': return (c.totalFlipsLifetime || 0) >= 100;
      case 'stats-five-hundred-makes': return (c.totalMakesLifetime || 0) >= 500;
      case 'stats-ten-cap-lands': return (c.capLandsLifetime || 0) >= 10;
      case 'stats-ten-great-saves': return (c.greatSavesLifetime || 0) >= 10;
      case 'stats-all-events-observed': return (c.distinctEventsObserved || 0) >= 30;
      case 'stats-exported': return !!c.statsExported;
      default: return false;
    }
  }

  function isEligibleContext(context) {
    var c = context && typeof context === 'object' ? context : {};
    var activity = String(c.mode || c.activity || '').toLowerCase();
    if (c.qualifying === false || c.practice || c.isPractice || c.lab || c.physicsLab ||
        c.forced || c.isForced || c.test || c.testData || c.testMode || c.simulated || c.aiOnly ||
        activity === 'practice' || activity === 'lab' || activity === 'physics-lab') return false;
    if (c.qualifying === true || c.humanParticipant === true || c.hasHumanPlayer === true ||
        Number(c.humanPlayers) > 0 || c.statsExported === true || c.winnerIsHuman === true ||
        c.humanWinner === true || c.winningTeamHasHuman === true) return true;
    return Array.isArray(c.players) && c.players.some(function (player) { return player && player.isAI === false; });
  }

  function parse(raw, fallback) {
    if (raw == null || raw === '') return fallback;
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch (_) { return fallback; }
  }
  function normalizeState(value, legacy) {
    var source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    var ids = [];
    (Array.isArray(source.earned) ? source.earned : []).forEach(function (entry) {
      if (entry && entry.id && !ids.some(function (known) { return known.id === String(entry.id); })) {
        ids.push({ id: String(entry.id), earnedAt: entry.earnedAt || null });
      }
    });
    (Array.isArray(legacy) ? legacy : []).forEach(function (id) {
      if (!ids.some(function (entry) { return entry.id === String(id); })) ids.push({ id: String(id), earnedAt: null });
    });
    return { schema: 'AchievementStateV3', version: 3, earned: ids };
  }

  function createMemoryStorage(seed) {
    var values = Object.assign({}, seed || {});
    return {
      getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
      setItem: function (key, value) { values[key] = String(value); },
      dump: function () { return clone(values); },
    };
  }

  function createStore(options) {
    var opts = options || {};
    var storage = opts.storage || null;
    var progressionStore = opts.progression || Progression;
    var now = typeof opts.now === 'function' ? opts.now : function () { return new Date().toISOString(); };
    var state = normalizeState(opts.initialState || (storage ? parse(storage.getItem(KEY), {}) : {}),
      opts.legacyIds || (storage ? parse(storage.getItem(LEGACY_KEY), []) : []));
    function save() { if (storage) { try { storage.setItem(KEY, JSON.stringify(state)); } catch (_) {} } }
    function earnedMap() {
      var map = new Map();
      state.earned.forEach(function (entry) { map.set(entry.id, entry); });
      return map;
    }
    function check(context) {
      if (!isEligibleContext(context)) return [];
      var map = earnedMap();
      var fresh = [];
      CATALOG.forEach(function (achievement) {
        if (map.has(achievement.id) || !matches(achievement, context || {})) return;
        var earnedAt = now();
        state.earned.push({ id: achievement.id, earnedAt: earnedAt });
        var result = { id: achievement.id, category: achievement.category, emoji: achievement.emoji,
          name: achievement.name, desc: achievement.desc, rare: achievement.rare, earnedAt: earnedAt };
        fresh.push(freeze(result));
        if (progressionStore && typeof progressionStore.addAchievement === 'function') progressionStore.addAchievement(achievement.id);
      });
      if (fresh.length) save();
      return fresh;
    }
    function isUnlocked(id) { return earnedMap().has(String(id)); }
    function unlockedCount() {
      var map = earnedMap();
      return CATALOG.filter(function (achievement) { return map.has(achievement.id); }).length;
    }
    function lockedView() { return freeze({ locked: true, symbol: '🔒', ariaLabel: 'Locked' }); }
    function unlockedView(achievement, entry) {
      return freeze({ locked: false, id: achievement.id, category: achievement.category,
        emoji: achievement.emoji, name: achievement.name, desc: achievement.desc,
        rare: achievement.rare, earnedAt: entry.earnedAt || null, ariaLabel: achievement.name });
    }
    function list() {
      var map = earnedMap();
      return Object.freeze(CATALOG.map(function (achievement) {
        return map.has(achievement.id) ? unlockedView(achievement, map.get(achievement.id)) : lockedView();
      }));
    }
    function earned() {
      var map = earnedMap();
      return Object.freeze(CATALOG.filter(function (achievement) { return map.has(achievement.id); })
        .map(function (achievement) { return unlockedView(achievement, map.get(achievement.id)); }));
    }
    function renderGridHtml() {
      return '<div class="records-title ach-heading">🏅 Achievements · ' + unlockedCount() + '/' + CATALOG.length + '</div>' +
        '<div class="ach-grid">' + list().map(function (view) {
          if (view.locked) return '<div class="ach-card locked" aria-label="Locked"><div class="ach-emoji" aria-hidden="true">🔒</div></div>';
          return '<div class="ach-card unlocked' + (view.rare ? ' rare' : '') + '" title="' + esc(view.desc) +
            '" aria-label="' + esc(view.name) + '"><div class="ach-emoji" aria-hidden="true">' + esc(view.emoji) +
            '</div><div class="ach-name">' + esc(view.name) + '</div></div>';
        }).join('') + '</div>';
    }
    function exportState() { return freeze(clone(state)); }
    function reset() { state = normalizeState({}, []); save(); }
    if (progressionStore && typeof progressionStore.addAchievement === 'function') {
      state.earned.forEach(function (entry) { progressionStore.addAchievement(entry.id); });
    }
    save();
    return Object.freeze({ check: check, list: list, earned: earned, isUnlocked: isUnlocked,
      unlockedCount: unlockedCount, total: function () { return CATALOG.length; },
      renderGridHtml: renderGridHtml, exportState: exportState, reset: reset });
  }

  var browserStorage = null;
  try { browserStorage = root && root.localStorage ? root.localStorage : null; } catch (_) {}
  var defaultStore = createStore({ storage: browserStorage });
  return Object.freeze({
    check: defaultStore.check, list: defaultStore.list, earned: defaultStore.earned,
    isUnlocked: defaultStore.isUnlocked, unlockedCount: defaultStore.unlockedCount,
    total: defaultStore.total, renderGridHtml: defaultStore.renderGridHtml,
    exportState: defaultStore.exportState, reset: defaultStore.reset,
    isEligibleContext: isEligibleContext, createStore: createStore, createMemoryStorage: createMemoryStorage,
    // Aggregate catalog QA only; individual locked IDs remain undisclosed.
    catalogSummary: function () {
      var counts = {};
      CATALOG.forEach(function (achievement) { counts[achievement.category] = (counts[achievement.category] || 0) + 1; });
      return freeze({ total: CATALOG.length, categoryCounts: counts });
    },
  });
});
