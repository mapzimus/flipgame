// v111-stats.js -- private, device-local statistics with durable rollups.
(function (root, factory) {
  'use strict';
  var Interfaces = root && root.FlipgameV111Interfaces;
  var Runtime = root && root.FlipgameV111Runtime;
  if (typeof module === 'object' && module.exports) {
    Interfaces = require('./v111-interfaces.js');
    Runtime = require('./v111-runtime.js');
  }
  var api = factory(Interfaces, Runtime, root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV111Stats = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (Interfaces, Runtime, root) {
  'use strict';

  var DB_NAME = 'flipgame-v111-stats';
  var DB_VERSION = 2;
  var EXPORT_SCHEMA = 'FlipStatsExportV1';
  var FALLBACK_KEY = 'flipgame.stats.aggregate.v1';
  var DEVICE_KEY = 'flipgame.stats.device-id.v1';
  var MAX_RAW_FLIPS = 100000;
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var SCOPE_VALUES = new Set(['all', 'device', 'session', 'import']);
  var instanceSequence = 0;

  function clone(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }
  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }
  function finite(value, fallback) {
    if (value == null || value === '') return fallback == null ? null : fallback;
    var n = Number(value);
    return Number.isFinite(n) ? n : (fallback == null ? null : fallback);
  }
  function integer(value, fallback) {
    var n = finite(value, fallback);
    return n == null ? null : Math.trunc(n);
  }
  function bool(value) { return value === true; }
  function text(value, fallback) {
    return value == null ? (fallback == null ? null : String(fallback)) : String(value);
  }
  function oneOf(value, values, fallback) {
    var candidate = text(value, fallback);
    return values.indexOf(candidate) >= 0 ? candidate : fallback;
  }
  function timestamp(value, fallback) {
    var n = finite(value, fallback == null ? Date.now() : fallback);
    return Math.max(0, Math.trunc(n));
  }
  function fnv(textValue, seed) {
    var hash = seed >>> 0;
    var value = String(textValue);
    for (var i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
  function stableUuid(namespace, value) {
    var source = namespace + '|' + String(value);
    var a = fnv(source, 2166136261);
    var b = fnv(source, 2246822519);
    var c = fnv(source, 3266489917);
    var d = fnv(source, 668265263);
    // RFC-4122-shaped deterministic identifier (version 5 / variant 1 bits).
    var hex = [a, b, c, d].map(function (part) { return ('00000000' + part.toString(16)).slice(-8); }).join('');
    hex = hex.slice(0, 12) + '5' + hex.slice(13, 16) + ((parseInt(hex[16], 16) & 3) | 8).toString(16) + hex.slice(17);
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }
  function recordUuid(kind, source, context) {
    var supplied = source.uuid || source.id || (source.payload && (source.payload.uuid || source.payload.id));
    if (UUID_RE.test(String(supplied || ''))) return String(supplied).toLowerCase();
    if (supplied) return stableUuid(kind, supplied);
    var eventSequence = source.sequence;
    if (eventSequence != null) {
      return stableUuid(kind, [context.deviceId, context.sessionId, source.timestamp, eventSequence].join('|'));
    }
    // No random source is touched: statistics must never advance gameplay RNG.
    return stableUuid(kind, [context.deviceId, context.sessionId,
      source.timestamp, JSON.stringify(source), context.nextRecordId ? context.nextRecordId() : 0].join('|'));
  }
  function safePlayer(player, index) {
    var source = player && typeof player === 'object' ? player : {};
    return {
      playerId: text(source.playerId != null ? source.playerId : source.id, 'seat-' + index),
      displayName: text(source.displayName != null ? source.displayName : source.name, ''),
      playerIndex: integer(source.playerIndex != null ? source.playerIndex : source.index, index),
      isAI: !!source.isAI,
      teamId: text(source.teamId, null),
      objectId: text(source.objectId != null ? source.objectId : source.skin, null),
      variantId: text(source.variantId, null),
      lives: finite(source.lives, null),
      streak: finite(source.streak, 0),
      eliminated: !!source.eliminated,
    };
  }
  function sourceParts(input) {
    var source = input && typeof input === 'object' ? input : {};
    var payload = source.payload && typeof source.payload === 'object' ? source.payload : source;
    var game = payload.game && typeof payload.game === 'object' ? payload.game : {};
    var players = Array.isArray(game.players) ? game.players : (Array.isArray(payload.players) ? payload.players : []);
    return { source: source, payload: payload, game: game, players: players };
  }
  function normalizeFlipRecord(input, options) {
    var opts = options || {};
    var parts = sourceParts(input);
    var source = parts.source;
    var payload = parts.payload;
    var game = parts.game;
    var landing = payload.landing && typeof payload.landing === 'object' ? payload.landing : {};
    var flick = payload.flick && typeof payload.flick === 'object' ? payload.flick : {};
    var playerIndex = integer(payload.playerIndex, integer(game.currentPlayerIndex, 0));
    var player = safePlayer(payload.player || parts.players[playerIndex] ||
      (payload.schema === 'FlipRecordV1' ? payload : null), playerIndex);
    var result = text(payload.result != null ? payload.result : landing.result,
      text(game.lastResult, 'MISS')).toUpperCase() === 'MAKE' ? 'MAKE' : 'MISS';
    var direction = finite(payload.direction, finite(flick.direction, finite(game.direction, null)));
    if (direction == null && finite(flick.vx, null) != null) direction = Number(flick.vx) < 0 ? -1 : 1;
    if (direction != null) direction = direction < 0 ? -1 : 1;
    var power = finite(payload.power, finite(flick.power, null));
    if (power == null && finite(flick.vx, null) != null && finite(flick.vy, null) != null) {
      power = Math.sqrt(Number(flick.vx) * Number(flick.vx) + Number(flick.vy) * Number(flick.vy));
    }
    var modeState = payload.modeState && typeof payload.modeState === 'object' ? payload.modeState : {};
    var recordBase = payload.schema === 'FlipRecordV1' ? clone(payload) : clone(payload.record || {});
    var record = Object.assign({}, recordBase, {
      schema: 'FlipRecordV1', version: 1,
      uuid: recordUuid('flip', source, opts),
      timestamp: timestamp(source.timestamp != null ? source.timestamp : payload.timestamp, opts.now ? opts.now() : Date.now()),
      sessionId: text(payload.sessionId, opts.sessionId), deviceId: text(payload.deviceId, opts.deviceId),
      matchId: text(payload.matchId, opts.matchId), sequence: integer(source.sequence, integer(payload.sequence, null)),
      scope: oneOf(payload.scope, ['device', 'session'], 'device'),
      mode: text(payload.mode, text(game.format, text(modeState.format, 'classic'))), online: !!payload.online,
      practice: !!(payload.practice || game.practice), forced: !!payload.forced,
      testData: !!(payload.testData || payload.forced || payload.test || payload.simulated),
      playerId: player.playerId, displayName: player.displayName, playerIndex: player.playerIndex,
      isAI: player.isAI, teamId: text(payload.teamId, player.teamId),
      result: result, made: result === 'MAKE', pose: text(landing.pose, landing.onCap ? 'cap' : null),
      landingReason: text(payload.landingReason, text(landing.reason, null)),
      perfect: !!(payload.perfect || landing.perfect), cap: !!(payload.cap || landing.onCap || landing.pose === 'cap'),
      power: power, direction: direction, rotations: finite(payload.rotations, finite(landing.rotations, null)),
      livesBefore: finite(payload.livesBefore, null), livesAfter: finite(payload.livesAfter, player.lives),
      stake: finite(payload.stake, finite(game.pointCount, null)), streak: finite(payload.streak, player.streak),
      eventId: text(payload.eventId, null),
      eventSuccess: payload.eventSuccess == null ? (payload.eventId ? result === 'MAKE' : null) : !!payload.eventSuccess,
      objectId: text(payload.objectId, player.objectId), variantId: text(payload.variantId, player.variantId),
      cupHeat: integer(payload.cupHeat, integer(modeState.heatIndex, null)),
      teamScore: finite(payload.teamScore, null),
    });
    if (input && input._importId) record._importId = String(input._importId);
    return freeze(record);
  }
  function normalizeMatchRecord(input, options) {
    var opts = options || {};
    var parts = sourceParts(input);
    var source = parts.source;
    var payload = parts.payload;
    var game = parts.game;
    var modeState = payload.modeState && typeof payload.modeState === 'object' ? payload.modeState : {};
    var players = (Array.isArray(payload.players) ? payload.players : parts.players).map(safePlayer);
    var winnerIndex = integer(payload.winnerIndex, integer(game.winnerIndex, null));
    var winnerIds = Array.isArray(payload.winnerIds) ? payload.winnerIds.map(String) : [];
    if (!winnerIds.length && winnerIndex != null && players[winnerIndex]) winnerIds.push(players[winnerIndex].playerId);
    var recordBase = payload.schema === 'MatchRecordV1' ? clone(payload) : clone(payload.record || {});
    var record = Object.assign({}, recordBase, {
      schema: 'MatchRecordV1', version: 1,
      uuid: recordUuid('match', source, opts),
      timestamp: timestamp(source.timestamp != null ? source.timestamp : payload.timestamp, opts.now ? opts.now() : Date.now()),
      startedAt: payload.startedAt == null ? null : timestamp(payload.startedAt),
      sessionId: text(payload.sessionId, opts.sessionId), deviceId: text(payload.deviceId, opts.deviceId),
      matchId: text(payload.matchId, null), scope: oneOf(payload.scope, ['device', 'session'], 'device'),
      mode: text(payload.mode, text(game.format, text(modeState.format, 'classic'))), online: !!payload.online,
      practice: !!(payload.practice || game.practice),
      testData: !!(payload.testData || payload.forced || payload.test || payload.simulated),
      winnerIndex: winnerIndex, winnerIds: winnerIds, players: players,
      cup: clone(payload.cup || modeState.cup || (String(game.format) === 'cup' ? modeState : null)),
      team: clone(payload.team || modeState.team || (String(game.format) === 'team-clash' ? modeState : null)),
      stats: clone(payload.stats || (payload.match && payload.match.stats) || null),
      completed: payload.completed !== false,
    });
    if (input && input._importId) record._importId = String(input._importId);
    return freeze(record);
  }

  function dayBucket(ms) { return new Date(timestamp(ms, 0)).toISOString().slice(0, 10); }
  function powerBucket(value) {
    var n = finite(value, null);
    if (n == null) return null;
    if (n < 1000) return '<1000';
    if (n < 2000) return '1000-1999';
    if (n < 3000) return '2000-2999';
    if (n < 4000) return '3000-3999';
    return '4000+';
  }
  function rotationBucket(value) {
    var n = finite(value, null);
    if (n == null) return null;
    return String(Math.max(0, Math.floor(n)));
  }
  function dimensionFor(record) {
    var dimensions = {
      day: dayBucket(record.timestamp), sessionId: record.sessionId, deviceId: record.deviceId,
      scope: record.scope, mode: record.mode, online: !!record.online, practice: !!record.practice,
      testData: !!record.testData, playerId: record.playerId, displayName: record.displayName,
      isAI: !!record.isAI, teamId: record.teamId, result: record.result, pose: record.pose,
      landingReason: record.landingReason, eventId: record.eventId, eventSuccess: record.eventSuccess,
      objectId: record.objectId, variantId: record.variantId, powerBucket: powerBucket(record.power),
      direction: record.direction, rotationBucket: rotationBucket(record.rotations),
      livesBefore: record.livesBefore, livesAfter: record.livesAfter, stake: record.stake,
      streak: record.streak, cupHeat: record.cupHeat,
    };
    if (record._importId) dimensions._importId = record._importId;
    return dimensions;
  }
  function dimensionKey(dimensions) {
    return Object.keys(dimensions).sort().map(function (key) {
      return key + '=' + JSON.stringify(dimensions[key]);
    }).join('|');
  }
  function newRollup(dimensions, prefix) {
    var key = dimensionKey(dimensions);
    return {
      schema: 'FlipAggregateV1', version: 1, uuid: stableUuid('rollup', (prefix || 'retention') + '|' + key),
      key: key, source: prefix || 'retention', timestampStart: null, timestampEnd: null,
      dimensions: clone(dimensions), flips: 0, makes: 0, caps: 0, perfect: 0,
      eventObserved: 0, eventSuccesses: 0,
    };
  }
  function addRecordToRollup(cell, record) {
    var next = clone(cell);
    next.flips += 1;
    if (record.made || record.result === 'MAKE') next.makes += 1;
    if (record.cap) next.caps += 1;
    if (record.perfect) next.perfect += 1;
    if (record.eventId) {
      next.eventObserved += 1;
      if (record.eventSuccess === true) next.eventSuccesses += 1;
    }
    next.timestampStart = next.timestampStart == null ? record.timestamp : Math.min(next.timestampStart, record.timestamp);
    next.timestampEnd = next.timestampEnd == null ? record.timestamp : Math.max(next.timestampEnd, record.timestamp);
    if (record._importId) next._importId = record._importId;
    return next;
  }
  function aggregateRecords(records, options) {
    var opts = options || {};
    var map = new Map();
    var passthrough = [];
    (Array.isArray(opts.existing) ? opts.existing : []).forEach(function (cell) {
      if (cell.source !== (opts.prefix || 'retention')) { passthrough.push(clone(cell)); return; }
      map.set(cell.key || dimensionKey(cell.dimensions || {}), clone(cell));
    });
    (Array.isArray(records) ? records : []).forEach(function (record) {
      var dimensions = dimensionFor(record);
      var key = dimensionKey(dimensions);
      var cell = map.get(key) || newRollup(dimensions, opts.prefix);
      map.set(key, addRecordToRollup(cell, record));
    });
    return passthrough.concat(Array.from(map.values())).map(freeze);
  }

  function listFilter(value) {
    if (value == null) return null;
    return (Array.isArray(value) ? value : [value]).map(String);
  }
  function normalizeFilters(filters) {
    var source = filters || {};
    var scope = text(source.scope, 'all');
    if (!SCOPE_VALUES.has(scope)) scope = 'all';
    return freeze({
      includeTestData: source.includeTestData === true, scope: scope,
      from: source.from == null ? null : timestamp(source.from), to: source.to == null ? null : timestamp(source.to),
      sessionIds: listFilter(source.sessionIds != null ? source.sessionIds : source.sessionId),
      deviceIds: listFilter(source.deviceIds != null ? source.deviceIds : source.deviceId),
      playerIds: listFilter(source.playerIds != null ? source.playerIds : source.playerId),
      modes: listFilter(source.modes != null ? source.modes : source.mode),
      eventIds: listFilter(source.eventIds != null ? source.eventIds : source.eventId),
      objectIds: listFilter(source.objectIds != null ? source.objectIds : source.objectId),
      teamIds: listFilter(source.teamIds != null ? source.teamIds : source.teamId),
      results: listFilter(source.results != null ? source.results : source.result),
      online: source.online == null ? null : !!source.online,
      isAI: source.isAI == null ? null : !!source.isAI,
      currentSessionId: text(source.currentSessionId, null), currentDeviceId: text(source.currentDeviceId, null),
    });
  }
  function contains(filter, value) { return !filter || filter.indexOf(String(value)) >= 0; }
  function inScope(record, filter) {
    if (filter.scope === 'all') return true;
    if (filter.scope === 'import') return !!record._importId;
    if (filter.scope === 'session') return !record._importId && record.sessionId === filter.currentSessionId;
    if (filter.scope === 'device') return !record._importId && (!filter.currentDeviceId || record.deviceId === filter.currentDeviceId);
    return true;
  }
  function matchesDimensions(dim, cell, filter) {
    if (!filter.includeTestData && dim.testData) return false;
    if (!inScope(Object.assign({}, dim, { _importId: cell ? cell._importId : dim._importId }), filter)) return false;
    if (!contains(filter.sessionIds, dim.sessionId) || !contains(filter.deviceIds, dim.deviceId) ||
        !contains(filter.playerIds, dim.playerId) || !contains(filter.modes, dim.mode) ||
        !contains(filter.eventIds, dim.eventId) || !contains(filter.objectIds, dim.objectId) ||
        !contains(filter.teamIds, dim.teamId) || !contains(filter.results, dim.result)) return false;
    if (filter.online != null && !!dim.online !== filter.online) return false;
    if (filter.isAI != null && !!dim.isAI !== filter.isAI) return false;
    var start = cell ? cell.timestampStart : dim.timestamp;
    var end = cell ? cell.timestampEnd : dim.timestamp;
    if (filter.from != null && end < filter.from) return false;
    if (filter.to != null && start > filter.to) return false;
    return true;
  }
  function matchesRecord(record, filter) {
    var effective = filter;
    if (record && record.schema === 'MatchRecordV1') {
      var players = Array.isArray(record.players) ? record.players : [];
      if (filter.playerIds) {
        if (!players.some(function (player) { return contains(filter.playerIds, player.playerId); })) return false;
        effective = Object.assign({}, effective, { playerIds: null });
      }
      if (filter.objectIds) {
        if (!players.some(function (player) { return contains(filter.objectIds, player.objectId); })) return false;
        effective = Object.assign({}, effective, { objectIds: null });
      }
      if (filter.teamIds) {
        if (!players.some(function (player) { return contains(filter.teamIds, player.teamId); })) return false;
        effective = Object.assign({}, effective, { teamIds: null });
      }
    }
    return matchesDimensions(Object.assign({ timestamp: record.timestamp }, record), null, effective);
  }
  function matchesRollup(cell, filter) { return matchesDimensions(cell.dimensions || {}, cell, filter); }

  function metricMap() { return new Map(); }
  function metricAdd(map, key, count, makes, extra) {
    var normalized = key == null ? 'Unknown' : String(key);
    var row = map.get(normalized) || Object.assign({ key: normalized, count: 0, makes: 0 }, extra || {});
    row.count += Number(count) || 0;
    row.makes += Number(makes) || 0;
    map.set(normalized, row);
  }
  function metricRows(map, label) {
    return Array.from(map.values()).sort(function (a, b) { return a.key.localeCompare(b.key); }).map(function (row) {
      var result = Object.assign({}, row);
      result[label || 'label'] = row.key;
      result.rate = row.count ? row.makes / row.count : 0;
      result.percentage = result.rate * 100;
      delete result.key;
      return freeze(result);
    });
  }
  function buildDatasets(input, filters) {
    var data = input || {};
    var filter = normalizeFilters(filters);
    var flips = (data.flips || []).filter(function (record) { return matchesRecord(record, filter); });
    var matches = (data.matches || []).filter(function (record) { return matchesRecord(record, filter); });
    var rollups = (data.rollups || data.aggregates || []).filter(function (cell) { return matchesRollup(cell, filter); });
    var contributions = flips.map(function (record) {
      return { timestamp: record.timestamp, dimensions: dimensionFor(record), flips: 1,
        makes: record.made ? 1 : 0, eventObserved: record.eventId ? 1 : 0,
        eventSuccesses: record.eventId && record.eventSuccess ? 1 : 0 };
    }).concat(rollups.map(function (cell) {
      return { timestamp: cell.timestampEnd, dimensions: cell.dimensions || {}, flips: cell.flips || 0,
        makes: cell.makes || 0, eventObserved: cell.eventObserved || 0,
        eventSuccesses: cell.eventSuccesses || 0 };
    }));
    contributions.sort(function (a, b) { return a.timestamp - b.timestamp; });
    var cumulativeFlips = 0;
    var cumulativeMakes = 0;
    var cumulative = contributions.map(function (entry) {
      cumulativeFlips += entry.flips;
      cumulativeMakes += entry.makes;
      return freeze({ timestamp: entry.timestamp, flips: cumulativeFlips, makes: cumulativeMakes,
        fraction: cumulativeMakes + '/' + cumulativeFlips,
        rate: cumulativeFlips ? cumulativeMakes / cumulativeFlips : 0,
        percentage: cumulativeFlips ? cumulativeMakes / cumulativeFlips * 100 : 0 });
    });
    var sequence = flips.slice().sort(function (a, b) {
      return a.timestamp - b.timestamp || (a.sequence || 0) - (b.sequence || 0);
    }).map(function (record) {
      return freeze({ uuid: record.uuid, timestamp: record.timestamp, sequence: record.sequence,
        result: record.result, made: record.made, eventId: record.eventId, playerId: record.playerId });
    });
    var heat = metricMap();
    var rotations = metricMap();
    var reasons = metricMap();
    var lives = metricMap();
    var stakes = metricMap();
    var streaks = metricMap();
    var events = new Map();
    var objects = metricMap();
    contributions.forEach(function (entry) {
      var dim = entry.dimensions;
      metricAdd(heat, (dim.powerBucket || 'Unknown') + '|' + (dim.direction == null ? 'Unknown' : dim.direction), entry.flips, entry.makes,
        { powerBucket: dim.powerBucket, direction: dim.direction });
      metricAdd(rotations, dim.rotationBucket, entry.flips, entry.makes);
      metricAdd(reasons, dim.landingReason, entry.flips, entry.makes);
      metricAdd(lives, dim.livesAfter, entry.flips, entry.makes);
      metricAdd(stakes, dim.stake, entry.flips, entry.makes);
      metricAdd(streaks, dim.streak, entry.flips, entry.makes);
      metricAdd(objects, dim.objectId, entry.flips, entry.makes);
      if (dim.eventId && entry.eventObserved > 0) {
        var eventRow = events.get(dim.eventId) || { eventId: dim.eventId, observed: 0, successes: 0 };
        eventRow.observed += entry.eventObserved;
        eventRow.successes += entry.eventSuccesses;
        events.set(dim.eventId, eventRow);
      }
    });
    var eventRows = Array.from(events.values()).sort(function (a, b) { return a.eventId.localeCompare(b.eventId); }).map(function (row) {
      row.fraction = row.successes + '/' + row.observed;
      row.observedFraction = row.observed + '/' + cumulativeFlips;
      row.frequency = cumulativeFlips ? row.observed / cumulativeFlips : 0;
      row.successRate = row.observed ? row.successes / row.observed : 0;
      row.frequencyPercent = row.frequency * 100;
      row.successPercent = row.successRate * 100;
      return freeze(row);
    });
    var cup = [];
    var team = [];
    matches.forEach(function (match) {
      if (match.mode === 'cup' || match.cup) cup.push(freeze({
        uuid: match.uuid, timestamp: match.timestamp, winnerIds: (match.winnerIds || []).slice(),
        heats: match.cup && (match.cup.heats || match.cup.heatWins) || null,
        shootoutRounds: match.cup && match.cup.shootoutRounds || 0,
      }));
      if (match.mode === 'team-clash' || match.mode === 'team' || match.team) team.push(freeze({
        uuid: match.uuid, timestamp: match.timestamp, winnerIds: (match.winnerIds || []).slice(),
        scores: match.team && (match.team.scores || match.team.teamScores) || null,
      }));
    });
    var output = {
      cumulativeMakeRate: cumulative, sequenceStrip: sequence,
      powerDirectionHeatmap: metricRows(heat, 'cell'), rotations: metricRows(rotations, 'rotations'),
      landingReasons: metricRows(reasons, 'reason'),
      livesStake: freeze({ lives: metricRows(lives, 'lives'), stake: metricRows(stakes, 'stake') }),
      streaks: metricRows(streaks, 'streak'), observedEventFrequencySuccess: eventRows,
      events: eventRows, objects: metricRows(objects, 'objectId'), cupTeam: freeze({ cup: cup, team: team }),
    };
    return freeze(output);
  }

  function aggregateSummary(data, filters) {
    var filter = normalizeFilters(filters);
    var flips = 0, makes = 0, caps = 0, perfect = 0;
    (data.flips || []).forEach(function (record) {
      if (!matchesRecord(record, filter)) return;
      flips++; if (record.made) makes++; if (record.cap) caps++; if (record.perfect) perfect++;
    });
    (data.rollups || []).forEach(function (cell) {
      if (!matchesRollup(cell, filter)) return;
      flips += cell.flips || 0; makes += cell.makes || 0; caps += cell.caps || 0; perfect += cell.perfect || 0;
    });
    var matches = (data.matches || []).filter(function (record) { return matchesRecord(record, filter); }).length;
    return freeze({ flips: flips, makes: makes, misses: Math.max(0, flips - makes), makeRate: flips ? makes / flips : 0,
      makePercentage: flips ? makes / flips * 100 : 0,
      caps: caps, perfect: perfect, matches: matches });
  }

  function requestPromise(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('IndexedDB request failed')); };
    });
  }
  function transactionPromise(transaction) {
    return new Promise(function (resolve, reject) {
      transaction.oncomplete = function () { resolve(); };
      transaction.onabort = transaction.onerror = function () {
        reject(transaction.error || new Error('IndexedDB transaction failed'));
      };
    });
  }
  function createIndexedDBBackend(indexedDB, options) {
    var opts = options || {};
    var database = null;
    function open() {
      if (!indexedDB || typeof indexedDB.open !== 'function') return Promise.reject(new Error('IndexedDB unavailable'));
      if (database) return Promise.resolve(database);
      return new Promise(function (resolve, reject) {
        var request = indexedDB.open(opts.dbName || DB_NAME, opts.dbVersion || DB_VERSION);
        request.onupgradeneeded = function () {
          var db = request.result;
          if (!db.objectStoreNames.contains('flips')) db.createObjectStore('flips', { keyPath: 'uuid' });
          if (!db.objectStoreNames.contains('matches')) db.createObjectStore('matches', { keyPath: 'uuid' });
          if (!db.objectStoreNames.contains('rollups')) db.createObjectStore('rollups', { keyPath: 'uuid' });
          if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
          if (!db.objectStoreNames.contains('seen')) db.createObjectStore('seen', { keyPath: 'uuid' });
        };
        request.onsuccess = function () { database = request.result; resolve(database); };
        request.onerror = function () { reject(request.error || new Error('Unable to open statistics database')); };
        request.onblocked = function () { reject(new Error('Statistics database upgrade blocked')); };
      });
    }
    function load() {
      return open().then(function (db) {
        var tx = db.transaction(['flips', 'matches', 'rollups', 'meta', 'seen'], 'readonly');
        var requests = ['flips', 'matches', 'rollups', 'meta', 'seen'].map(function (name) {
          return requestPromise(tx.objectStore(name).getAll());
        });
        return Promise.all(requests).then(function (values) {
          return { flips: values[0], matches: values[1], rollups: values[2], meta: values[3], seen: values[4] };
        });
      });
    }
    function commit(operation) {
      return open().then(function (db) {
        var tx = db.transaction(['flips', 'matches', 'rollups', 'meta', 'seen'], 'readwrite');
        (operation.putFlips || []).forEach(function (record) { tx.objectStore('flips').put(clone(record)); });
        (operation.deleteFlipIds || []).forEach(function (uuid) { tx.objectStore('flips').delete(uuid); });
        (operation.putMatches || []).forEach(function (record) { tx.objectStore('matches').put(clone(record)); });
        (operation.putRollups || []).forEach(function (record) { tx.objectStore('rollups').put(clone(record)); });
        (operation.putMeta || []).forEach(function (record) { tx.objectStore('meta').put(clone(record)); });
        (operation.putSeen || []).forEach(function (record) { tx.objectStore('seen').put(clone(record)); });
        return transactionPromise(tx);
      });
    }
    function close() { if (database) database.close(); database = null; }
    return { kind: 'indexeddb', load: load, commit: commit, close: close };
  }
  function createMemoryBackend(seed, options) {
    var initial = seed || {};
    var opts = options || {};
    var data = {
      flips: new Map((initial.flips || []).map(function (row) { return [row.uuid, clone(row)]; })),
      matches: new Map((initial.matches || []).map(function (row) { return [row.uuid, clone(row)]; })),
      rollups: new Map((initial.rollups || []).map(function (row) { return [row.uuid, clone(row)]; })),
      meta: new Map((initial.meta || []).map(function (row) { return [row.key, clone(row)]; })),
      seen: new Map((initial.seen || []).map(function (row) { return [row.uuid, clone(row)]; })),
    };
    var commits = 0;
    function load() {
      return Promise.resolve({ flips: Array.from(data.flips.values()).map(clone),
        matches: Array.from(data.matches.values()).map(clone), rollups: Array.from(data.rollups.values()).map(clone),
        meta: Array.from(data.meta.values()).map(clone), seen: Array.from(data.seen.values()).map(clone) });
    }
    function commit(operation) {
      commits++;
      if (opts.failCommit === true || (typeof opts.failCommit === 'function' && opts.failCommit(commits, operation))) {
        return Promise.reject(new Error('Injected transaction failure'));
      }
      var next = { flips: new Map(data.flips), matches: new Map(data.matches),
        rollups: new Map(data.rollups), meta: new Map(data.meta), seen: new Map(data.seen) };
      (operation.putFlips || []).forEach(function (row) { next.flips.set(row.uuid, clone(row)); });
      (operation.deleteFlipIds || []).forEach(function (uuid) { next.flips.delete(uuid); });
      (operation.putMatches || []).forEach(function (row) { next.matches.set(row.uuid, clone(row)); });
      (operation.putRollups || []).forEach(function (row) { next.rollups.set(row.uuid, clone(row)); });
      (operation.putMeta || []).forEach(function (row) { next.meta.set(row.key, clone(row)); });
      (operation.putSeen || []).forEach(function (row) { next.seen.set(row.uuid, clone(row)); });
      data = next;
      return Promise.resolve();
    }
    return { kind: 'memory', load: load, commit: commit, close: function () {}, dump: load };
  }

  function readJson(storage, key) {
    if (!storage) return null;
    try { return JSON.parse(storage.getItem(key)); } catch (_) { return null; }
  }
  function legacyAggregate(legacy, deviceId) {
    var source = legacy && typeof legacy === 'object' ? legacy : {};
    var totalFlips = Math.max(0, integer(source.totalFlips, 0));
    var totalMakes = Math.min(totalFlips, Math.max(0, integer(source.totalMakes, 0)));
    if (!totalFlips && !totalMakes) return null;
    var dimensions = { day: null, sessionId: null, deviceId: deviceId, scope: 'device', mode: null,
      online: false, practice: false, testData: false, playerId: null, displayName: null, isAI: false,
      teamId: null, result: null, pose: null, landingReason: null, eventId: null, eventSuccess: null,
      objectId: null, variantId: null, powerBucket: null, direction: null, rotationBucket: null,
      livesBefore: null, livesAfter: null, stake: null, streak: null, cupHeat: null };
    return freeze({ schema: 'FlipAggregateV1', version: 1, uuid: stableUuid('legacy-rollup', deviceId),
      key: dimensionKey(dimensions), source: 'legacy-records', timestampStart: null, timestampEnd: null,
      dimensions: dimensions, flips: totalFlips, makes: totalMakes,
      caps: Math.max(0, integer(source.capLands, 0)), perfect: 0, eventObserved: 0, eventSuccesses: 0,
      bestStreak: Math.max(0, finite(source.bestStreak, 0)), highestStake: Math.max(0, finite(source.highestStake, 0)) });
  }

  function cleanInternal(value) {
    if (Array.isArray(value)) return value.map(cleanInternal);
    if (!value || typeof value !== 'object') return value;
    var output = {};
    Object.keys(value).forEach(function (key) {
      if (key.charAt(0) !== '_') output[key] = cleanInternal(value[key]);
    });
    return output;
  }
  function exportDocument(data, options) {
    var opts = options || {};
    var filter = normalizeFilters(Object.assign({}, opts, opts.filters || {}));
    var flips = (data.flips || []).filter(function (row) { return matchesRecord(row, filter); }).map(cleanInternal);
    var matches = (data.matches || []).filter(function (row) { return matchesRecord(row, filter); }).map(cleanInternal);
    var rollups = (data.rollups || []).filter(function (row) { return matchesRollup(row, filter); }).map(cleanInternal);
    return freeze({ schema: EXPORT_SCHEMA, version: 1,
      exportedAt: timestamp(opts.exportedAt, Date.now()), flips: flips, matches: matches, rollups: rollups });
  }
  function exportJSON(data, options) { return JSON.stringify(exportDocument(data, options)); }
  function assertSafeImportObject(value) {
    if (!value || typeof value !== 'object') return;
    Object.keys(value).forEach(function (key) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
        throw new TypeError('Unsafe .flipstats.json key');
      }
      assertSafeImportObject(value[key]);
    });
  }
  function parseImportJSON(input) {
    var document = typeof input === 'string' ? JSON.parse(input) : clone(input);
    assertSafeImportObject(document);
    if (!document || document.schema !== EXPORT_SCHEMA || document.version !== 1 ||
        !Array.isArray(document.flips) || !Array.isArray(document.matches) || !Array.isArray(document.rollups)) {
      throw new TypeError('Invalid .flipstats.json document');
    }
    return document;
  }
  function csvCell(value) {
    var raw = value == null ? '' : (typeof value === 'object' ? JSON.stringify(value) : String(value));
    if (/^[=+\-@]/.test(raw)) raw = "'" + raw;
    return '"' + raw.replace(/"/g, '""').replace(/[\r\n]+/g, ' ') + '"';
  }
  function csv(rows, columns) {
    return [columns.map(csvCell).join(',')].concat(rows.map(function (row) {
      return columns.map(function (column) { return csvCell(row[column]); }).join(',');
    })).join('\r\n');
  }
  function playerAliases(data) {
    var ids = new Set();
    (data.flips || []).forEach(function (row) { if (row.playerId != null) ids.add(String(row.playerId)); });
    (data.matches || []).forEach(function (row) {
      (row.players || []).forEach(function (player) { if (player.playerId != null) ids.add(String(player.playerId)); });
    });
    var aliases = new Map();
    Array.from(ids).sort().forEach(function (id, index) { aliases.set(id, 'Player ' + (index + 1)); });
    return aliases;
  }
  function exportCSV(data, type, options) {
    var opts = options || {};
    var filter = normalizeFilters(Object.assign({}, opts, opts.filters || {}));
    var source = { flips: (data.flips || []).filter(function (row) { return matchesRecord(row, filter); }),
      matches: (data.matches || []).filter(function (row) { return matchesRecord(row, filter); }),
      rollups: (data.rollups || []).filter(function (row) { return matchesRollup(row, filter); }) };
    var aliases = playerAliases(source);
    var showName = function (id, name) { return opts.includeNames === true ? text(name, '') : (aliases.get(String(id)) || 'Player'); };
    if (type === 'flip') {
      var flipColumns = ['uuid','timestamp','sessionId','matchId','mode','playerId','player','isAI','result','pose',
        'landingReason','power','direction','rotations','livesBefore','livesAfter','stake','streak','eventId','eventSuccess','objectId','variantId','testData'];
      return csv(source.flips.map(function (row) { return Object.assign({}, row,
        { playerId: opts.includeNames === true ? row.playerId : (aliases.get(String(row.playerId)) || 'Player'),
          player: showName(row.playerId, row.displayName) }); }), flipColumns);
    }
    if (type === 'match') {
      var matchColumns = ['uuid','timestamp','sessionId','matchId','mode','online','completed','winnerIds','players','cup','team','testData'];
      return csv(source.matches.map(function (row) { return Object.assign({}, row, {
        players: (row.players || []).map(function (player) { return showName(player.playerId, player.displayName); }).join('|'),
        winnerIds: (row.winnerIds || []).map(function (id) { return opts.includeNames === true ? id : (aliases.get(String(id)) || 'Player'); }).join('|'),
      }); }), matchColumns);
    }
    if (type === 'player') {
      var byPlayer = new Map();
      source.flips.forEach(function (row) {
        var key = String(row.playerId);
        var item = byPlayer.get(key) || { playerId: opts.includeNames === true ? key : aliases.get(key), player: showName(key, row.displayName), flips: 0, makes: 0, matches: 0 };
        item.flips++; if (row.made) item.makes++; byPlayer.set(key, item);
      });
      source.matches.forEach(function (match) {
        (match.players || []).forEach(function (player) {
          var key = String(player.playerId);
          var item = byPlayer.get(key) || { playerId: opts.includeNames === true ? key : aliases.get(key), player: showName(key, player.displayName), flips: 0, makes: 0, matches: 0 };
          item.matches++; byPlayer.set(key, item);
        });
      });
      var playerRows = Array.from(byPlayer.values()).map(function (row) { row.makeRate = row.flips ? row.makes / row.flips : 0; return row; });
      return csv(playerRows, ['playerId','player','flips','makes','makeRate','matches']);
    }
    if (type === 'event') {
      return csv(buildDatasets(source, { includeTestData: true }).events,
        ['eventId','observed','successes','fraction','observedFraction','frequency','frequencyPercent','successRate','successPercent']);
    }
    throw new RangeError('CSV type must be flip, match, player, or event');
  }

  function createStore(options) {
    var opts = options || {};
    var now = typeof opts.now === 'function' ? opts.now : Date.now;
    var localStorage = opts.localStorage || null;
    if (!localStorage && root) { try { localStorage = root.localStorage || null; } catch (_) {} }
    var storedDeviceId = null;
    if (localStorage) { try { storedDeviceId = localStorage.getItem(DEVICE_KEY); } catch (_) {} }
    var generatedDeviceId = stableUuid('device', [text(opts.deviceSeed, 'device'), now(), ++instanceSequence].join('|'));
    var deviceId = text(opts.deviceId, text(storedDeviceId, generatedDeviceId));
    if (!opts.deviceId && !storedDeviceId && localStorage) {
      try { localStorage.setItem(DEVICE_KEY, deviceId); } catch (_) {}
    }
    var sessionId = text(opts.sessionId, stableUuid('session', [deviceId, now(), ++instanceSequence].join('|')));
    var recordSequence = 0;
    var maxRaw = Math.max(1, integer(opts.maxRawFlips, MAX_RAW_FLIPS));
    var indexedDB = opts.indexedDB !== undefined ? opts.indexedDB : (root && root.indexedDB);
    var lacksIndexedDB = !opts.backend && !indexedDB;
    var backend = opts.backend || (indexedDB ? createIndexedDBBackend(indexedDB, opts) : createMemoryBackend());
    var usingFallback = lacksIndexedDB;
    var closed = false;
    var state = { flips: [], matches: [], rollups: [], meta: [], seen: [] };
    var errors = [];

    function report(error) {
      errors.push(error);
      if (typeof opts.onError === 'function') { try { opts.onError(error); } catch (_) {} }
    }
    function fallbackState() {
      var current = aggregateRecords(state.flips, { prefix: 'fallback-' + deviceId, existing: state.rollups });
      return { schema: 'FlipStatsFallbackV1', version: 1, rollups: current.map(clone),
        seen: state.seen.map(clone), meta: state.meta.map(clone), savedAt: now() };
    }
    function persistFallback() {
      if (!localStorage) return;
      try { localStorage.setItem(FALLBACK_KEY, JSON.stringify(fallbackState())); } catch (error) { report(error); }
    }
    function activateFallback(error, deferPersist) {
      if (error) report(error);
      usingFallback = true;
      backend = createMemoryBackend(state);
      if (!deferPersist) persistFallback();
    }
    function normalizeLoaded(loaded) {
      state.flips = (loaded.flips || []).map(function (row) { return normalizeFlipRecord(row, context()); });
      state.matches = (loaded.matches || []).map(function (row) { return normalizeMatchRecord(row, context()); });
      state.rollups = (loaded.rollups || []).map(function (row) { return freeze(clone(row)); });
      state.meta = (loaded.meta || []).map(function (row) { return freeze(clone(row)); });
      var seenMap = new Map((loaded.seen || []).map(function (row) { return [row.uuid, row]; }));
      state.flips.forEach(function (row) {
        if (!seenMap.has(row.uuid)) seenMap.set(row.uuid, { uuid: row.uuid, kind: 'flip' });
      });
      state.seen = Array.from(seenMap.values()).map(function (row) { return freeze(clone(row)); });
    }
    function context() {
      return { now: now, deviceId: deviceId, sessionId: sessionId,
        nextRecordId: function () { return ++recordSequence; } };
    }
    function hydrateLocalFallback() {
      var saved = readJson(localStorage, FALLBACK_KEY);
      if (saved && saved.schema === 'FlipStatsFallbackV1' && Array.isArray(saved.rollups)) {
        state.rollups = saved.rollups.map(function (row) { return freeze(row); });
        state.seen = (saved.seen || []).map(function (row) { return freeze(row); });
        state.meta = (saved.meta || []).map(function (row) { return freeze(row); });
      }
    }
    function migrateLegacy() {
      if (state.meta.some(function (row) { return row.key === 'legacy-migrated'; })) return Promise.resolve();
      var legacy = opts.legacyRecords;
      if (!legacy && localStorage) legacy = readJson(localStorage, 'flipgame.records.v2') || readJson(localStorage, 'flipgame.records.v1');
      var rollup = legacyAggregate(legacy, deviceId);
      var marker = freeze({ key: 'legacy-migrated', value: true, timestamp: now() });
      var operation = { putRollups: rollup ? [rollup] : [], putMeta: [marker] };
      return backend.commit(operation).then(function () {
        if (rollup) state.rollups.push(rollup);
        state.meta.push(marker);
      }).catch(function (error) {
        if (rollup) state.rollups.push(rollup);
        state.meta.push(marker);
        activateFallback(error);
      });
    }
    var ready = backend.load().then(function (loaded) {
      normalizeLoaded(loaded);
      if (lacksIndexedDB) hydrateLocalFallback();
    }).catch(function (error) {
      activateFallback(error, true); hydrateLocalFallback();
    }).then(migrateLegacy);
    var queue = ready;
    function enqueue(work) {
      var result = queue.then(function () {
        if (closed) throw new Error('Statistics store is closed');
        return work();
      });
      queue = result.catch(function () {});
      return result.catch(function (error) { report(error); return { stored: false, error: 'storage-unavailable' }; });
    }
    function operationForFlip(record) {
      if (state.seen.some(function (row) { return row.uuid === record.uuid; })) return null;
      var nextFlips = state.flips.concat([record]).sort(function (a, b) { return a.timestamp - b.timestamp || a.uuid.localeCompare(b.uuid); });
      var remove = nextFlips.length > maxRaw ? nextFlips.slice(0, nextFlips.length - maxRaw) : [];
      var keep = remove.length ? nextFlips.slice(remove.length) : nextFlips;
      var rollups = remove.length ? aggregateRecords(remove, { prefix: 'retention', existing: state.rollups }) : state.rollups.slice();
      var seen = freeze({ uuid: record.uuid, kind: 'flip' });
      return { state: { flips: keep, matches: state.matches.slice(), rollups: rollups, meta: state.meta.slice(), seen: state.seen.concat([seen]) },
        db: { putFlips: [record], deleteFlipIds: remove.map(function (row) { return row.uuid; }),
          putRollups: remove.length ? rollups : [], putSeen: [seen] } };
    }
    function operationForMatch(record) {
      if (state.matches.some(function (row) { return row.uuid === record.uuid; })) return null;
      return { state: { flips: state.flips.slice(), matches: state.matches.concat([record]), rollups: state.rollups.slice(), meta: state.meta.slice(), seen: state.seen.slice() },
        db: { putMatches: [record] } };
    }
    function commitMutation(operation, kind, uuid) {
      if (!operation) return Promise.resolve({ stored: false, duplicate: true, uuid: uuid });
      if (usingFallback) {
        state = operation.state; persistFallback();
        return backend.commit(operation.db).catch(report).then(function () { return { stored: true, fallback: true, uuid: uuid }; });
      }
      return backend.commit(operation.db).then(function () {
        state = operation.state;
        return { stored: true, fallback: false, uuid: uuid, kind: kind };
      }).catch(function (error) {
        state = operation.state; activateFallback(error);
        return { stored: true, fallback: true, uuid: uuid, kind: kind };
      });
    }
    function recordFlip(input) {
      var record = normalizeFlipRecord(input, context());
      return enqueue(function () { return commitMutation(operationForFlip(record), 'flip', record.uuid); });
    }
    function recordMatch(input) {
      var record = normalizeMatchRecord(input, context());
      return enqueue(function () { return commitMutation(operationForMatch(record), 'match', record.uuid); });
    }
    function filteredData(filters) {
      var source = Object.assign({}, filters || {}, { currentSessionId: sessionId, currentDeviceId: deviceId });
      var filter = normalizeFilters(source);
      return { flips: state.flips.filter(function (row) { return matchesRecord(row, filter); }).map(clone),
        matches: state.matches.filter(function (row) { return matchesRecord(row, filter); }).map(clone),
        rollups: state.rollups.filter(function (row) { return matchesRollup(row, filter); }).map(clone) };
    }
    function query(filters) { return queue.then(function () { return freeze(filteredData(filters)); }); }
    function datasets(filters) { return queue.then(function () { return buildDatasets(state, Object.assign({}, filters || {}, { currentSessionId: sessionId, currentDeviceId: deviceId })); }); }
    function summary(filters) { return queue.then(function () { return aggregateSummary(state, Object.assign({}, filters || {}, { currentSessionId: sessionId, currentDeviceId: deviceId })); }); }
    function storeExportJSON(options) {
      return queue.then(function () {
        var config = Object.assign({}, options || {});
        config.filters = Object.assign({}, config.filters || config, {
          currentSessionId: sessionId, currentDeviceId: deviceId,
        });
        return exportJSON(state, config);
      });
    }
    function storeExportCSV(type, options) {
      return queue.then(function () {
        var config = Object.assign({}, options || {});
        config.filters = Object.assign({}, config.filters || config, {
          currentSessionId: sessionId, currentDeviceId: deviceId,
        });
        return exportCSV(state, type, config);
      });
    }
    function importJSON(input) {
      var document;
      try { document = parseImportJSON(input); }
      catch (error) { return Promise.resolve({ imported: false, error: 'invalid-import' }); }
      var importId = stableUuid('import', JSON.stringify(document));
      return enqueue(function () {
        var flipIds = new Set(state.seen.map(function (row) { return row.uuid; }));
        var matchIds = new Set(state.matches.map(function (row) { return row.uuid; }));
        var rollupIds = new Set(state.rollups.map(function (row) { return row.uuid; }));
        var addedFlips = document.flips.map(function (row) {
          var copy = clone(row); copy._importId = importId; return normalizeFlipRecord(copy, context());
        }).filter(function (row) { if (flipIds.has(row.uuid)) return false; flipIds.add(row.uuid); return true; });
        var addedMatches = document.matches.map(function (row) {
          var copy = clone(row); copy._importId = importId; return normalizeMatchRecord(copy, context());
        }).filter(function (row) { if (matchIds.has(row.uuid)) return false; matchIds.add(row.uuid); return true; });
        var addedRollups = document.rollups.map(function (row) {
          var copy = clone(row); copy._importId = importId; return freeze(copy);
        }).filter(function (row) { if (!row.uuid || rollupIds.has(row.uuid)) return false; rollupIds.add(row.uuid); return true; });
        var combined = state.flips.concat(addedFlips).sort(function (a, b) { return a.timestamp - b.timestamp || a.uuid.localeCompare(b.uuid); });
        var prune = combined.length > maxRaw ? combined.slice(0, combined.length - maxRaw) : [];
        var kept = prune.length ? combined.slice(prune.length) : combined;
        var combinedRollups = state.rollups.concat(addedRollups);
        if (prune.length) combinedRollups = aggregateRecords(prune, { prefix: 'retention', existing: combinedRollups });
        var seen = addedFlips.map(function (row) { return freeze({ uuid: row.uuid, kind: 'flip' }); });
        var next = { flips: kept, matches: state.matches.concat(addedMatches), rollups: combinedRollups,
          meta: state.meta.slice(), seen: state.seen.concat(seen) };
        var operation = { putFlips: addedFlips, deleteFlipIds: prune.map(function (row) { return row.uuid; }),
          putMatches: addedMatches, putRollups: combinedRollups, putSeen: seen };
        return commitMutation({ state: next, db: operation }, 'import', importId).then(function (result) {
          return Object.assign({}, result, { imported: true, importId: importId,
            flips: addedFlips.length, matches: addedMatches.length, rollups: addedRollups.length,
            duplicates: document.flips.length + document.matches.length + document.rollups.length -
              addedFlips.length - addedMatches.length - addedRollups.length });
        });
      });
    }
    function onOutcome(event) {
      if (event && event.type === 'flip.resolved.v1') return recordFlip(event);
      if (event && event.type === 'match.resolved.v1') return recordMatch(event);
      return Promise.resolve({ stored: false, ignored: true });
    }
    function close() {
      return queue.then(function () { closed = true; if (backend && backend.close) backend.close(); });
    }
    return Object.freeze({
      schema: 'StatsStoreV1', version: 1, deviceId: deviceId, sessionId: sessionId,
      recordFlip: recordFlip, recordMatch: recordMatch, onOutcome: onOutcome,
      flush: function () { return queue; }, query: query, datasets: datasets, summary: summary,
      exportJSON: storeExportJSON, exportCSV: storeExportCSV, importJSON: importJSON, close: close,
      usingFallback: function () { return usingFallback; }, getErrors: function () { return errors.slice(); },
    });
  }

  function install(runtime, options) {
    var target = runtime || Runtime;
    if (!target || !target.stats || typeof target.stats.install !== 'function') return null;
    var store = createStore(options);
    target.stats.install(store);
    return store;
  }
  var api = {
    schema: 'FlipgameStatsModuleV1', version: 1, DB_NAME: DB_NAME, DB_VERSION: DB_VERSION,
    EXPORT_SCHEMA: EXPORT_SCHEMA, FALLBACK_KEY: FALLBACK_KEY, DEVICE_KEY: DEVICE_KEY,
    MAX_RAW_FLIPS: MAX_RAW_FLIPS,
    stableUuid: stableUuid, normalizeFlipRecord: normalizeFlipRecord, normalizeMatchRecord: normalizeMatchRecord,
    normalizeFilters: normalizeFilters, aggregateRecords: aggregateRecords, buildDatasets: buildDatasets,
    aggregateSummary: aggregateSummary, createIndexedDBBackend: createIndexedDBBackend,
    createMemoryBackend: createMemoryBackend, createStore: createStore,
    exportDocument: exportDocument, exportJSON: exportJSON, parseImportJSON: parseImportJSON,
    exportCSV: exportCSV, install: install,
  };
  if (Runtime) api.defaultStore = install(Runtime);
  return freeze(api);
});
