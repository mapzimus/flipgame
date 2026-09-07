// v112-battle.js -- deterministic Battle rules and power-card state.
// Lane physics/input/rendering are injected by the runtime integration layer.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV112Battle = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function () {
  'use strict';

  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }
  function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  function required(value, label) {
    var text = String(value == null ? '' : value).trim();
    if (!text) throw new TypeError(label + ' is required');
    return text;
  }
  function unique(values) { return Array.from(new Set((Array.isArray(values) ? values : []).map(String))); }
  function hash(seed, salt) {
    var x = ((Number(seed) || 1) ^ (Number(salt) || 0)) >>> 0;
    x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b); x ^= x >>> 16;
    return x >>> 0;
  }

  var SPORT_CARDS = freeze([
    { id: 'magnet-pulse', scope: 'self', eventAdapterId: 'magnet' },
    { id: 'heartbeat-brace', scope: 'self', eventAdapterId: 'heart-rush' },
    { id: 'power-launch', scope: 'self', eventAdapterId: 'power-launch' },
    { id: 'moon-round', scope: 'symmetric', eventAdapterId: 'moon-gravity' },
    { id: 'bouncy-round', scope: 'symmetric', eventAdapterId: 'bouncy-bottle' },
    { id: 'wind-round', scope: 'symmetric', eventAdapterId: 'wind-tunnel' },
    { id: 'trampoline-round', scope: 'symmetric', eventAdapterId: 'trampoline' },
  ]);
  var MAYHEM_CARDS = freeze([
    { id: 'ice-patch', scope: 'target', eventAdapterId: 'ice-slide' },
    { id: 'crosswind', scope: 'target', eventAdapterId: 'wind-tunnel' },
    { id: 'earthquake', scope: 'target', eventAdapterId: 'earthquake' },
    { id: 'gravity-slam', scope: 'target', eventAdapterId: 'gravity-slam' },
    { id: 'fizz-jet', scope: 'target', eventAdapterId: 'fizz-jet' },
  ]);

  function hardwareProfile(input) {
    var source = object(input);
    var width = Math.max(0, Number(source.width) || 0);
    var contacts = Math.max(1, Math.floor(Number(source.verifiedContacts) || 1));
    var activeLaneLimit = width >= 1100 && contacts >= 4 ? 4
      : (width >= 768 && contacts >= 2 ? 2 : 1);
    return freeze({ width: width, verifiedContacts: contacts,
      activeLaneLimit: activeLaneLimit,
      simultaneous: activeLaneLimit > 1,
      fallback: activeLaneLimit === 1 ? 'alternating-relay' : null });
  }

  function normalizePlayers(value) {
    if (!Array.isArray(value)) throw new TypeError('players are required');
    var ids = new Set();
    return value.map(function (entry, seat) {
      var source = object(entry);
      var id = required(source.id || source.playerId, 'player id');
      if (ids.has(id)) throw new TypeError('Duplicate player id: ' + id);
      ids.add(id);
      return freeze(Object.assign({}, clone(source), { id: id, seat: seat,
        teamId: source.teamId == null ? null : String(source.teamId) }));
    });
  }

  function normalizeConfig(input) {
    var source = object(input);
    var formatId = String(source.formatId || 'duel');
    if (['duel', 'doubles', 'four-way', 'team'].indexOf(formatId) < 0) {
      throw new TypeError('Unsupported Battle format: ' + formatId);
    }
    var paceId = String(source.paceId || 'volley');
    if (['volley', 'rush'].indexOf(paceId) < 0) throw new TypeError('Unsupported Battle pace: ' + paceId);
    var powerProfileId = String(source.powerProfileId || 'sport');
    if (['sport', 'mayhem'].indexOf(powerProfileId) < 0) throw new TypeError('Unsupported power profile');
    var players = normalizePlayers(source.players);
    if (formatId === 'duel' && players.length !== 2) throw new TypeError('Duel requires two players');
    if ((formatId === 'doubles' || formatId === 'four-way') && players.length !== 4) {
      throw new TypeError(formatId + ' requires four players');
    }
    if (formatId === 'team' && (players.length < 6 || players.length > 16 || players.length % 2)) {
      throw new TypeError('Team Battle requires an even 6–16 players');
    }
    if (formatId === 'doubles' || formatId === 'team') {
      var teams = new Map();
      players.forEach(function (player) {
        if (!player.teamId) throw new TypeError('Team player requires teamId');
        teams.set(player.teamId, (teams.get(player.teamId) || 0) + 1);
      });
      if (teams.size !== 2 || new Set(teams.values()).size !== 1) throw new TypeError('Battle teams must be two equal groups');
    }
    if (formatId === 'four-way' && players.some(function (player) { return player.teamId; })) {
      throw new TypeError('Four-Way players cannot share teams');
    }
    return freeze({ schema: 'BattleConfigV1', formatId: formatId, paceId: paceId,
      powerProfileId: powerProfileId, players: players, hardware: hardwareProfile(source.hardware),
      heatTarget: 2, volleyCount: 5, rushDurationMs: 60000,
      rotationIntervalMs: 15000, seed: (Number(source.seed) || 1) >>> 0,
      normalEventsEnabled: false, crossLaneCollisions: false });
  }

  function competitors(config) {
    if (config.formatId === 'doubles' || config.formatId === 'team') {
      return unique(config.players.map(function (player) { return player.teamId; }));
    }
    return config.players.map(function (player) { return player.id; });
  }

  function members(config, competitorId) {
    return config.players.filter(function (player) {
      return (config.formatId === 'doubles' || config.formatId === 'team')
        ? player.teamId === competitorId : player.id === competitorId;
    });
  }

  function selectActive(config, rotationIndex) {
    var limit = config.hardware.activeLaneLimit;
    if (limit === 1) return [config.players[rotationIndex % config.players.length].id];
    if (config.formatId === 'duel') return config.players.map(function (player) { return player.id; });
    if (config.formatId === 'four-way') {
      var count = Math.min(limit, config.players.length);
      var list = [];
      for (var i = 0; i < count; i++) list.push(config.players[(rotationIndex + i) % config.players.length].id);
      return list;
    }
    var ids = [];
    var perTeam = limit >= 4 ? 2 : 1;
    competitors(config).forEach(function (teamId) {
      var team = members(config, teamId);
      for (var i = 0; i < perTeam; i++) ids.push(team[(rotationIndex + i) % team.length].id);
    });
    return ids.slice(0, limit);
  }

  function scoreForPose(pose) {
    return pose === 'cap' ? 2 : (pose === 'upright' ? 1 : 0);
  }

  function blankMap(ids, value) {
    var result = {};
    ids.forEach(function (id) { result[id] = typeof value === 'function' ? value() : value; });
    return result;
  }

  function createState(input) {
    var config = input && input.schema === 'BattleConfigV1' ? input : normalizeConfig(input);
    var ids = competitors(config);
    return freeze({ schema: 'BattleStateV1', config: config, phase: 'ready',
      heatNumber: 1, heatWins: blankMap(ids, 0), scores: blankMap(ids, 0),
      charges: blankMap(ids, 0), powerOffers: blankMap(ids, null), storedPowers: blankMap(ids, null),
      activePlayerIds: selectActive(config, 0), rotationIndex: 0, volleyIndex: 0,
      suddenDeath: false, elapsedMs: 0, clockExpired: false,
      resolvedAttemptIds: [], volleyPlayerIds: [], winnerId: null,
      pendingLaunchIds: [] });
  }

  function ownerKey(state, playerId) {
    var player = state.config.players.find(function (candidate) { return candidate.id === playerId; });
    if (!player) throw new TypeError('Unknown Battle player: ' + playerId);
    return (state.config.formatId === 'doubles' || state.config.formatId === 'team') ? player.teamId : player.id;
  }

  function powerPool(config) {
    return config.powerProfileId === 'mayhem' ? SPORT_CARDS.concat(MAYHEM_CARDS) : SPORT_CARDS.slice();
  }

  function offerCards(state, key, salt) {
    var pool = powerPool(state.config);
    var firstIndex = hash(state.config.seed, salt) % pool.length;
    var secondIndex = hash(state.config.seed, salt ^ 0x9e3779b9) % (pool.length - 1);
    if (secondIndex >= firstIndex) secondIndex += 1;
    return [clone(pool[firstIndex]), clone(pool[secondIndex])];
  }

  function rankedLeaders(scores) {
    var entries = Object.keys(scores).map(function (id) { return [id, scores[id]]; });
    var top = Math.max.apply(Math, entries.map(function (entry) { return entry[1]; }));
    return entries.filter(function (entry) { return entry[1] === top; }).map(function (entry) { return entry[0]; });
  }

  function startHeat(state) {
    var next = clone(state);
    if (next.phase !== 'ready' && next.phase !== 'between-heats') throw new Error('Heat cannot start from ' + next.phase);
    next.phase = 'active';
    next.scores = blankMap(competitors(next.config), 0);
    next.volleyIndex = 0;
    next.suddenDeath = false;
    next.elapsedMs = 0;
    next.clockExpired = false;
    next.volleyPlayerIds = [];
    next.pendingLaunchIds = [];
    next.activePlayerIds = selectActive(next.config, next.rotationIndex);
    return freeze(next);
  }

  function finishHeat(next, winnerId) {
    next.heatWins[winnerId] += 1;
    if (next.heatWins[winnerId] >= next.config.heatTarget) {
      next.phase = 'complete';
      next.winnerId = winnerId;
      return;
    }
    next.phase = 'between-heats';
    next.heatNumber += 1;
    next.rotationIndex += 1;
    next.activePlayerIds = selectActive(next.config, next.rotationIndex);
  }

  function closeVolley(next) {
    next.volleyIndex += 1;
    next.volleyPlayerIds = [];
    next.rotationIndex += 1;
    next.activePlayerIds = selectActive(next.config, next.rotationIndex);
    if (next.volleyIndex < next.config.volleyCount && !next.suddenDeath) return;
    var leaders = rankedLeaders(next.scores);
    if (leaders.length === 1) finishHeat(next, leaders[0]);
    else next.suddenDeath = true;
  }

  function recordAttempt(state, input) {
    var next = clone(state);
    if (next.phase !== 'active') throw new Error('Battle is not active');
    var source = object(input);
    var attemptId = required(source.attemptId, 'attemptId');
    if (next.resolvedAttemptIds.indexOf(attemptId) >= 0) return freeze(next);
    var playerId = required(source.playerId, 'playerId');
    if (next.activePlayerIds.indexOf(playerId) < 0) throw new Error('Player is not active: ' + playerId);
    next.resolvedAttemptIds.push(attemptId);
    next.pendingLaunchIds = next.pendingLaunchIds.filter(function (id) { return id !== attemptId; });
    var key = ownerKey(next, playerId);
    next.scores[key] += scoreForPose(String(source.pose || 'miss'));
    if (source.qualifiedManual !== false && !next.powerOffers[key]) {
      next.charges[key] = Math.min(3, next.charges[key] + 1);
      if (next.charges[key] === 3) {
        next.powerOffers[key] = offerCards(next, key,
          next.resolvedAttemptIds.length ^ hash(next.config.seed, key.length));
        next.charges[key] = 0;
      }
    }
    if (next.config.paceId === 'volley') {
      if (next.volleyPlayerIds.indexOf(playerId) < 0) next.volleyPlayerIds.push(playerId);
      if (next.activePlayerIds.every(function (id) { return next.volleyPlayerIds.indexOf(id) >= 0; })) closeVolley(next);
    } else if (next.clockExpired && next.pendingLaunchIds.length === 0) {
      var leaders = rankedLeaders(next.scores);
      if (leaders.length === 1) finishHeat(next, leaders[0]);
      else next.suddenDeath = true;
    }
    return freeze(next);
  }

  function markLaunch(state, attemptId) {
    var next = clone(state);
    var id = required(attemptId, 'attemptId');
    if (next.phase !== 'active' || next.clockExpired) throw new Error('Launch is not allowed');
    if (next.pendingLaunchIds.indexOf(id) < 0) next.pendingLaunchIds.push(id);
    return freeze(next);
  }

  function advanceClock(state, deltaMs) {
    var next = clone(state);
    if (next.phase !== 'active' || next.config.paceId !== 'rush') return freeze(next);
    var beforeBucket = Math.floor(next.elapsedMs / next.config.rotationIntervalMs);
    next.elapsedMs = Math.min(next.config.rushDurationMs,
      next.elapsedMs + Math.max(0, Number(deltaMs) || 0));
    var afterBucket = Math.floor(Math.min(next.elapsedMs, next.config.rushDurationMs - 1) /
      next.config.rotationIntervalMs);
    if (afterBucket > beforeBucket) {
      next.rotationIndex += afterBucket - beforeBucket;
      next.activePlayerIds = selectActive(next.config, next.rotationIndex);
    }
    if (next.elapsedMs >= next.config.rushDurationMs) {
      next.clockExpired = true;
      if (next.pendingLaunchIds.length === 0) {
        var leaders = rankedLeaders(next.scores);
        if (leaders.length === 1) finishHeat(next, leaders[0]);
        else next.suddenDeath = true;
      }
    }
    return freeze(next);
  }

  function choosePower(state, input) {
    var next = clone(state);
    var source = object(input);
    var playerId = required(source.playerId, 'playerId');
    var key = ownerKey(next, playerId);
    var offer = next.powerOffers[key];
    if (!offer) throw new Error('No power offer for ' + key);
    var index = Math.floor(Number(source.index));
    if (index !== 0 && index !== 1) throw new RangeError('Power index must be 0 or 1');
    var card = offer[index];
    if (card.scope === 'target') {
      var targetId = required(source.targetId, 'targetId');
      if (targetId === key || competitors(next.config).indexOf(targetId) < 0) {
        throw new Error('Target must be an opponent');
      }
      card.targetId = targetId;
    }
    next.storedPowers[key] = card;
    next.powerOffers[key] = null;
    return freeze(next);
  }

  function consumePower(state, playerId) {
    var next = clone(state);
    var key = ownerKey(next, playerId);
    var card = clone(next.storedPowers[key]);
    next.storedPowers[key] = null;
    return freeze({ state: next, card: card });
  }

  return freeze({ schema: 'BattleRulesV1', SPORT_CARDS: SPORT_CARDS,
    MAYHEM_CARDS: MAYHEM_CARDS, hardwareProfile: hardwareProfile,
    normalizeConfig: normalizeConfig, createState: createState,
    startHeat: startHeat, markLaunch: markLaunch, recordAttempt: recordAttempt,
    advanceClock: advanceClock, choosePower: choosePower,
    consumePower: consumePower, scoreForPose: scoreForPose });
});
