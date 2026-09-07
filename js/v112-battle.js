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
  function hashText(value) {
    var text = String(value);
    var result = 0x811c9dc5;
    for (var i = 0; i < text.length; i++) {
      result ^= text.charCodeAt(i);
      result = Math.imul(result, 0x01000193);
    }
    return result >>> 0;
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
      var cpu = source.cpu === true || source.isCpu === true || source.ai === true ||
        String(source.type || '').toLowerCase() === 'cpu';
      return freeze(Object.assign({}, clone(source), { id: id, seat: seat,
        teamId: source.teamId == null ? null : String(source.teamId), cpu: cpu }));
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

  function selectRushActive(config, rotationIndex) {
    var limit = config.hardware.activeLaneLimit;
    if (config.formatId === 'duel') {
      return limit === 1 ? [config.players[rotationIndex % config.players.length].id]
        : config.players.map(function (player) { return player.id; });
    }
    if (config.formatId === 'four-way') {
      var count = Math.min(limit, config.players.length);
      var list = [];
      for (var i = 0; i < count; i++) list.push(config.players[(rotationIndex + i) % config.players.length].id);
      return list;
    }
    if (limit === 1) {
      // Unsupported/small displays alternate teams, then advance each team's
      // own roster cursor. A single global player list would give one team all
      // four Rush windows in an entire heat.
      var relayTeams = competitors(config);
      var relayTeamIndex = rotationIndex % relayTeams.length;
      var relayRound = Math.floor(rotationIndex / relayTeams.length);
      var relayMembers = members(config, relayTeams[relayTeamIndex]);
      return [relayMembers[relayRound % relayMembers.length].id];
    }
    var ids = [];
    var perTeam = limit >= 4 ? 2 : 1;
    competitors(config).forEach(function (teamId) {
      var team = members(config, teamId);
      for (var i = 0; i < perTeam; i++) ids.push(team[(rotationIndex + i) % team.length].id);
    });
    return ids.slice(0, limit);
  }

  function selectVolleyParticipants(config, rotationIndex, eligibleCompetitorIds) {
    var eligible = unique(eligibleCompetitorIds && eligibleCompetitorIds.length
      ? eligibleCompetitorIds : competitors(config));
    if (config.formatId === 'duel') {
      return config.players.filter(function (player) {
        return eligible.indexOf(player.id) >= 0;
      }).map(function (player) { return player.id; });
    }
    if (config.formatId === 'four-way') {
      return config.players.map(function (_, index) {
        return config.players[(rotationIndex + index) % config.players.length].id;
      }).filter(function (id) { return eligible.indexOf(id) >= 0; });
    }
    var teamIds = competitors(config).filter(function (id) { return eligible.indexOf(id) >= 0; });
    var perTeam = config.hardware.activeLaneLimit >= 4 ? 2 : 1;
    var selected = teamIds.map(function (teamId) {
      var team = members(config, teamId);
      var entries = [];
      for (var i = 0; i < perTeam; i++) {
        entries.push(team[(rotationIndex + i) % team.length].id);
      }
      return entries;
    });
    var interleaved = [];
    for (var seat = 0; seat < perTeam; seat++) {
      selected.forEach(function (team) { interleaved.push(team[seat]); });
    }
    return interleaved;
  }

  function rotationStep(config) {
    if (config.paceId === 'volley') {
      if (config.formatId === 'doubles' || config.formatId === 'team') {
        return config.hardware.activeLaneLimit >= 4 ? 2 : 1;
      }
      return 1;
    }
    if (config.formatId === 'four-way') {
      return Math.min(config.hardware.activeLaneLimit, config.players.length);
    }
    if (config.formatId === 'doubles' || config.formatId === 'team') {
      return config.hardware.activeLaneLimit === 1 ? 1
        : (config.hardware.activeLaneLimit >= 4 ? 2 : 1);
    }
    return 1;
  }

  function rushRotationInterval(config) {
    // On a one-lane relay, alternating competitors every 7.5s gives each team
    // a new representative every advertised 15s. This is the only way an 8v8
    // 2-0 match can expose all sixteen players while retaining 60-second heats.
    return config.hardware.activeLaneLimit === 1 &&
      (config.formatId === 'duel' || config.formatId === 'doubles' || config.formatId === 'team')
      ? config.rotationIntervalMs / 2 : config.rotationIntervalMs;
  }

  function advanceRotation(next) { next.rotationIndex += rotationStep(next.config); }

  function powerRoundPlayerIds(state) {
    if (state.config.paceId === 'volley' || state.suddenDeath) {
      return freeze(state.volleyParticipantIds.slice());
    }
    var wanted = competitors(state.config);
    var perCompetitor = (state.config.formatId === 'doubles' || state.config.formatId === 'team') &&
      state.config.hardware.activeLaneLimit >= 4 ? 2 : 1;
    var result = [];
    var counts = blankMap(wanted, 0);
    var cursor = state.rotationIndex;
    var safety = state.config.players.length * 2 + 2;
    while (safety-- > 0 && wanted.some(function (id) { return counts[id] < perCompetitor; })) {
      selectRushActive(state.config, cursor).forEach(function (playerId) {
        var key = (state.config.formatId === 'doubles' || state.config.formatId === 'team')
          ? state.config.players.find(function (entry) { return entry.id === playerId; }).teamId
          : playerId;
        if (counts[key] < perCompetitor && result.indexOf(playerId) < 0) {
          result.push(playerId);
          counts[key] += 1;
        }
      });
      cursor += rotationStep(state.config);
    }
    return freeze(result);
  }

  function volleyBatchLimit(next) {
    return next.suddenDeath
      ? Math.min(2, next.config.hardware.activeLaneLimit)
      : next.config.hardware.activeLaneLimit;
  }

  function prepareVolley(next) {
    next.volleyPlayerIds = [];
    next.volleyParticipantIds = selectVolleyParticipants(next.config, next.rotationIndex,
      next.suddenDeath ? next.suddenDeathCompetitorIds : null);
    next.activePlayerIds = next.volleyParticipantIds.slice(0, volleyBatchLimit(next));
  }

  function advanceVolleyBatch(next) {
    var remaining = next.volleyParticipantIds.filter(function (id) {
      return next.volleyPlayerIds.indexOf(id) < 0;
    });
    if (!remaining.length) return false;
    next.activePlayerIds = remaining.slice(0, volleyBatchLimit(next));
    return true;
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
    var initialParticipants = selectVolleyParticipants(config, 0);
    var initialActive = config.paceId === 'volley'
      ? initialParticipants.slice(0, config.hardware.activeLaneLimit)
      : selectRushActive(config, 0);
    return freeze({ schema: 'BattleStateV1', config: config, phase: 'ready',
      heatNumber: 1, heatWins: blankMap(ids, 0), scores: blankMap(ids, 0),
      charges: blankMap(ids, 0), powerOffers: blankMap(ids, null), storedPowers: blankMap(ids, null),
      powerOfferSequences: blankMap(ids, 0),
      activePlayerIds: initialActive, rotationIndex: 0, heatStarterIndex: 0, volleyIndex: 0,
      suddenDeath: false, suddenDeathCompetitorIds: [], elapsedMs: 0, clockExpired: false,
      resolvedAttemptIds: [], volleyPlayerIds: [], volleyParticipantIds: initialParticipants,
      winnerId: null,
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

  function offerCards(state, key, sequence) {
    var pool = powerPool(state.config);
    var salt = hash(hashText(key), Number(sequence) || 0);
    var firstIndex = hash(state.config.seed, salt) % pool.length;
    var secondIndex = hash(state.config.seed, salt ^ 0x9e3779b9) % (pool.length - 1);
    if (secondIndex >= firstIndex) secondIndex += 1;
    return [clone(pool[firstIndex]), clone(pool[secondIndex])];
  }

  function rankedLeaders(scores, eligibleIds) {
    var ids = eligibleIds && eligibleIds.length ? eligibleIds : Object.keys(scores);
    var entries = unique(ids).filter(function (id) {
      return Object.prototype.hasOwnProperty.call(scores, id);
    }).map(function (id) { return [id, scores[id]]; });
    if (!entries.length) throw new Error('Sudden death requires at least one eligible competitor');
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
    next.suddenDeathCompetitorIds = [];
    next.elapsedMs = 0;
    next.clockExpired = false;
    next.volleyPlayerIds = [];
    next.pendingLaunchIds = [];
    next.rotationIndex = next.heatStarterIndex;
    if (next.config.paceId === 'volley') prepareVolley(next);
    else next.activePlayerIds = selectRushActive(next.config, next.rotationIndex);
    return freeze(next);
  }

  function nextHeatStarter(next) {
    var nextCursor = next.rotationIndex + rotationStep(next.config);
    if (next.config.paceId === 'rush') {
      var isTeam = next.config.formatId === 'doubles' || next.config.formatId === 'team';
      var cycle = isTeam && next.config.hardware.activeLaneLimit === 1 ? 1
        : (isTeam ? members(next.config, competitors(next.config)[0]).length
          : next.config.players.length);
      if (cycle > 1 && (nextCursor - next.heatStarterIndex) % cycle === 0) nextCursor += 1;
    }
    return nextCursor;
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
    next.heatStarterIndex = nextHeatStarter(next);
    next.rotationIndex = next.heatStarterIndex;
    next.activePlayerIds = next.config.paceId === 'rush'
      ? selectRushActive(next.config, next.rotationIndex) : [];
  }

  function enterSuddenDeath(next, leaders) {
    next.suddenDeath = true;
    next.suddenDeathCompetitorIds = unique(leaders);
    advanceRotation(next);
    prepareVolley(next);
  }

  function closeVolley(next) {
    next.volleyIndex += 1;
    next.volleyPlayerIds = [];
    if (next.volleyIndex < next.config.volleyCount && !next.suddenDeath) {
      advanceRotation(next);
      prepareVolley(next);
      return;
    }
    var leaders = rankedLeaders(next.scores,
      next.suddenDeath ? next.suddenDeathCompetitorIds : null);
    if (leaders.length === 1) finishHeat(next, leaders[0]);
    else enterSuddenDeath(next, leaders);
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
    if (source.qualifiedManual !== false) {
      next.charges[key] = Math.min(3, next.charges[key] + 1);
      if (next.charges[key] === 3 && !next.powerOffers[key]) {
        next.powerOfferSequences = next.powerOfferSequences || blankMap(competitors(next.config), 0);
        next.powerOfferSequences[key] = (next.powerOfferSequences[key] || 0) + 1;
        next.powerOffers[key] = offerCards(next, key, next.powerOfferSequences[key]);
        next.charges[key] = 0;
      }
    }
    if (next.config.paceId === 'volley' || next.suddenDeath) {
      if (next.volleyPlayerIds.indexOf(playerId) < 0) next.volleyPlayerIds.push(playerId);
      if (next.activePlayerIds.every(function (id) { return next.volleyPlayerIds.indexOf(id) >= 0; })) {
        if (!advanceVolleyBatch(next)) closeVolley(next);
      }
    } else if (next.clockExpired && next.pendingLaunchIds.length === 0) {
      var leaders = rankedLeaders(next.scores);
      if (leaders.length === 1) finishHeat(next, leaders[0]);
      else enterSuddenDeath(next, leaders);
    }
    return freeze(next);
  }

  function markLaunch(state, attemptId) {
    var next = clone(state);
    var id = required(attemptId, 'attemptId');
    if (next.phase !== 'active' || (next.clockExpired && !next.suddenDeath)) {
      throw new Error('Launch is not allowed');
    }
    if (next.pendingLaunchIds.indexOf(id) < 0) next.pendingLaunchIds.push(id);
    return freeze(next);
  }

  function advanceClock(state, deltaMs) {
    var next = clone(state);
    if (next.phase !== 'active' || next.config.paceId !== 'rush' || next.suddenDeath) return freeze(next);
    var interval = rushRotationInterval(next.config);
    var beforeBucket = Math.floor(next.elapsedMs / interval);
    next.elapsedMs = Math.min(next.config.rushDurationMs,
      next.elapsedMs + Math.max(0, Number(deltaMs) || 0));
    var afterBucket = Math.floor(Math.min(next.elapsedMs, next.config.rushDurationMs - 1) /
      interval);
    if (afterBucket > beforeBucket) {
      next.rotationIndex += (afterBucket - beforeBucket) * rotationStep(next.config);
      next.activePlayerIds = selectRushActive(next.config, next.rotationIndex);
    }
    if (next.elapsedMs >= next.config.rushDurationMs) {
      next.clockExpired = true;
      if (next.pendingLaunchIds.length === 0) {
        var leaders = rankedLeaders(next.scores);
        if (leaders.length === 1) finishHeat(next, leaders[0]);
        else enterSuddenDeath(next, leaders);
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
    consumePower: consumePower, scoreForPose: scoreForPose,
    powerRoundPlayerIds: powerRoundPlayerIds });
});
