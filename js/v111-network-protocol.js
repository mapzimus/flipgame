// v111-network-protocol.js — dependency-free NetworkEnvelopeV2 validation.
//
// This module deliberately contains no transport code.  It is shared by the
// browser client and the adversarial protocol tests so every transport has the
// same replay, ordering, authority, and result-binding rules.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameNetworkProtocolV2 = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function () {
  'use strict';

  var SCHEMA = 'NetworkEnvelopeV2';
  var VERSION = 2;
  var PROTOCOL = 'flipgame-net/2';
  var GAME_TYPES = Object.freeze(['flick', 'result']);
  var CONTROL_TYPES = Object.freeze([
    'hello', 'welcome', 'join', 'leave', 'roster', 'start', 'ping', 'pong',
    'resume', 'resume-state', 'rename-required',
  ]);
  var TYPE_SET = new Set(CONTROL_TYPES.concat(GAME_TYPES));

  function copy(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(copy);
    var result = {};
    Object.keys(value).forEach(function (key) { result[key] = copy(value[key]); });
    return result;
  }

  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }

  function immutable(value) { return freeze(copy(value)); }

  function integer(value, minimum) {
    return Number.isSafeInteger(value) && value >= (minimum == null ? 0 : minimum);
  }

  function finite(value) { return Number.isFinite(Number(value)); }

  function safeData(value, depth, budget) {
    var level = depth || 0;
    var remaining = budget || { nodes: 0 };
    if (++remaining.nodes > 20000 || level > 24) return false;
    if (value == null || typeof value === 'undefined' || typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'string') return value.length <= 65536;
    if (Array.isArray(value)) {
      if (value.length > 5000) return false;
      return value.every(function (item) { return safeData(item, level + 1, remaining); });
    }
    if (typeof value !== 'object') return false;
    var keys = Object.keys(value);
    if (keys.length > 1000) return false;
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] === '__proto__' || keys[i] === 'prototype' || keys[i] === 'constructor' ||
          !safeData(value[keys[i]], level + 1, remaining)) return false;
    }
    return true;
  }

  function normalizeNumber(value) {
    var number = Number(value);
    if (Object.is(number, -0)) number = 0;
    return String(number);
  }

  // A checksum is not authentication.  Its purpose is to make the authoritative
  // result unambiguously refer to the exact launch tuple all peers accepted.
  function flickBinding(seed, vx, vy) {
    var source = String(Number(seed) >>> 0) + '|' + normalizeNumber(vx) + '|' + normalizeNumber(vy);
    var hash = 0x811c9dc5;
    for (var i = 0; i < source.length; i++) {
      hash ^= source.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return ('00000000' + hash.toString(16)).slice(-8);
  }

  function randomId(prefix, randomValues) {
    var bytes = new Uint32Array(4);
    if (typeof randomValues === 'function') randomValues(bytes);
    else {
      for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 0x100000000) >>> 0;
    }
    return prefix + Array.from(bytes).map(function (part) {
      return ('00000000' + part.toString(16)).slice(-8);
    }).join('');
  }

  function result(ok, code, envelope) {
    return Object.freeze({
      ok: !!ok,
      code: code || null,
      envelope: ok && envelope ? envelope : null,
    });
  }

  function ProtocolSession(options) {
    if (!(this instanceof ProtocolSession)) return new ProtocolSession(options);
    var config = options || {};
    var selfId = String(config.selfId || '');
    var room = String(config.room || '').toUpperCase();
    var hostId = config.hostId == null ? null : String(config.hostId);
    var randomValues = typeof config.randomValues === 'function' ? config.randomValues : null;
    var outboundSequence = 0;
    var inboundSequences = new Map();
    var matchId = null;
    var currentPlayerId = null;
    var turnId = 0;
    var lastFlipId = 0;
    var activeFlick = null;

    function reject(code, envelope) {
      if (typeof config.onReject === 'function') {
        try { config.onReject(code, envelope || null); } catch (_) {}
      }
      return result(false, code);
    }

    function baseEnvelope(type, payload, fields) {
      if (!selfId || !room) throw new Error('Protocol session is not initialized');
      if (!TYPE_SET.has(type)) throw new RangeError('Unknown network message type: ' + type);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !safeData(payload)) {
        throw new TypeError('Network payload must be bounded JSON-safe data');
      }
      var extra = fields || {};
      return immutable({
        schema: SCHEMA,
        version: VERSION,
        protocol: PROTOCOL,
        room: room,
        matchId: extra.matchId !== undefined ? extra.matchId : matchId,
        type: type,
        senderId: selfId,
        sequence: ++outboundSequence,
        turnId: extra.turnId !== undefined ? extra.turnId : null,
        flipId: extra.flipId !== undefined ? extra.flipId : null,
        payload: payload || {},
      });
    }

    function activate(id, playerId, firstTurnId) {
      matchId = String(id || '');
      if (!/^m_[a-f0-9]{32}$/.test(matchId)) throw new TypeError('Invalid host-issued match id');
      currentPlayerId = String(playerId || '');
      if (!currentPlayerId) throw new TypeError('A current player is required');
      turnId = firstTurnId == null ? 1 : Number(firstTurnId);
      if (!integer(turnId, 1)) throw new TypeError('turnId must be a positive integer');
      lastFlipId = 0;
      activeFlick = null;
    }

    function validateBase(envelope) {
      if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return 'legacy-protocol';
      if (envelope.schema !== SCHEMA || envelope.version !== VERSION || envelope.protocol !== PROTOCOL) {
        return 'legacy-protocol';
      }
      if (!/^[A-HJ-NP-Z2-9]{3,6}$/.test(String(envelope.room || '')) ||
          String(envelope.room).toUpperCase() !== room) return 'wrong-room';
      if (!TYPE_SET.has(envelope.type)) return 'unknown-type';
      if (typeof envelope.senderId !== 'string' || !/^p_[a-f0-9]{16}$/.test(envelope.senderId)) {
        return 'invalid-sender';
      }
      if (!integer(envelope.sequence, 1)) return 'invalid-sequence';
      if (!envelope.payload || typeof envelope.payload !== 'object' || Array.isArray(envelope.payload)) {
        return 'invalid-payload';
      }
      if (!safeData(envelope.payload)) return 'unsafe-payload';
      return null;
    }

    function validateOrder(envelope) {
      var previous = inboundSequences.get(envelope.senderId);
      if (previous == null) return null; // A late join pins the first observed sequence.
      if (envelope.sequence <= previous) return 'duplicate-or-stale';
      if (envelope.sequence !== previous + 1 && envelope.type !== 'resume-state') return 'out-of-order';
      return null;
    }

    function validateMatch(envelope) {
      if (!matchId || envelope.matchId !== matchId) return 'wrong-match';
      if (!integer(envelope.turnId, 1) || envelope.turnId !== turnId) return 'wrong-turn';
      if (!integer(envelope.flipId, 1)) return 'invalid-flip-id';
      return null;
    }

    function validateFlick(envelope) {
      var error = validateMatch(envelope);
      if (error) return error;
      var payload = envelope.payload;
      if (!currentPlayerId || envelope.senderId !== currentPlayerId || payload.playerId !== currentPlayerId) {
        return 'not-current-player';
      }
      if (activeFlick) return 'flip-already-active';
      if (envelope.flipId !== lastFlipId + 1) return 'non-monotonic-flip';
      if (!finite(payload.vx) || !finite(payload.vy) || !integer(payload.seed, 0) || payload.seed > 0xffffffff) {
        return 'invalid-flick';
      }
      if (payload.flickBinding !== flickBinding(payload.seed, payload.vx, payload.vy)) return 'invalid-flick-binding';
      return null;
    }

    function validateResult(envelope) {
      var error = validateMatch(envelope);
      if (error) return error;
      var payload = envelope.payload;
      if (!activeFlick) return 'result-without-flick';
      if (envelope.senderId !== activeFlick.senderId || payload.playerId !== activeFlick.senderId) {
        return 'wrong-result-sender';
      }
      if (envelope.flipId !== activeFlick.flipId || payload.flickSeed !== activeFlick.seed ||
          payload.flickBinding !== activeFlick.binding) return 'result-binding-mismatch';
      if (payload.result !== 'MAKE' && payload.result !== 'MISS') return 'invalid-result';
      return null;
    }

    function commit(envelope) {
      inboundSequences.set(envelope.senderId, envelope.sequence);
      if (envelope.type === 'start') {
        var players = envelope.payload.defs;
        var index = integer(envelope.payload.startIndex, 0) ? envelope.payload.startIndex : 0;
        if (!Array.isArray(players) || !players[index] || !players[index].netId) return 'invalid-start';
        activate(envelope.matchId, players[index].netId, 1);
      } else if (envelope.type === 'flick') {
        lastFlipId = envelope.flipId;
        activeFlick = Object.freeze({
          senderId: envelope.senderId,
          turnId: envelope.turnId,
          flipId: envelope.flipId,
          seed: envelope.payload.seed,
          binding: envelope.payload.flickBinding,
        });
      } else if (envelope.type === 'result') {
        activeFlick = null;
      }
      return null;
    }

    this.issueMatchId = function () {
      if (!hostId || selfId !== hostId) throw new Error('Only the host may issue a match id');
      return randomId('m_', randomValues);
    };

    this.start = function (payload) {
      if (!hostId || selfId !== hostId) throw new Error('Only the host may start a match');
      var players = payload && payload.defs;
      var index = payload && integer(payload.startIndex, 0) ? payload.startIndex : 0;
      if (!Array.isArray(players) || !players[index] || !players[index].netId) {
        throw new TypeError('Start payload requires an ordered player list');
      }
      var id = this.issueMatchId();
      activate(id, players[index].netId, 1);
      return baseEnvelope('start', payload, { matchId: id, turnId: 1, flipId: 0 });
    };

    this.control = function (type, payload) {
      if (GAME_TYPES.indexOf(type) >= 0 || type === 'start') {
        throw new RangeError('Use the typed gameplay/start method');
      }
      return baseEnvelope(type, payload || {}, {
        matchId: matchId,
        turnId: matchId ? turnId : null,
        flipId: activeFlick ? activeFlick.flipId : null,
      });
    };

    this.flick = function (payload) {
      var source = payload || {};
      if (!matchId) throw new Error('No active v2 match');
      if (String(source.playerId || '') !== selfId || selfId !== currentPlayerId) {
        throw new Error('Only the current player may flick');
      }
      if (activeFlick) throw new Error('A flip is already active');
      if (!finite(source.vx) || !finite(source.vy) || !integer(source.seed, 0) || source.seed > 0xffffffff) {
        throw new TypeError('Invalid flick payload');
      }
      var flipId = lastFlipId + 1;
      var payloadCopy = Object.assign({}, source, {
        playerId: selfId,
        seed: Number(source.seed) >>> 0,
        flickBinding: flickBinding(source.seed, source.vx, source.vy),
      });
      var envelope = baseEnvelope('flick', payloadCopy, { turnId: turnId, flipId: flipId });
      lastFlipId = flipId;
      activeFlick = Object.freeze({
        senderId: selfId, turnId: turnId, flipId: flipId,
        seed: payloadCopy.seed, binding: payloadCopy.flickBinding,
      });
      return envelope;
    };

    this.result = function (payload) {
      var source = payload || {};
      if (!activeFlick) throw new Error('A result requires an active flick');
      if (selfId !== currentPlayerId || activeFlick.senderId !== selfId || source.playerId !== selfId) {
        throw new Error('Only the flicking player may report its result');
      }
      if (source.result !== 'MAKE' && source.result !== 'MISS') throw new TypeError('Invalid result');
      var payloadCopy = Object.assign({}, source, {
        playerId: selfId,
        flickSeed: activeFlick.seed,
        flickBinding: activeFlick.binding,
      });
      var envelope = baseEnvelope('result', payloadCopy, {
        turnId: activeFlick.turnId,
        flipId: activeFlick.flipId,
      });
      activeFlick = null;
      return envelope;
    };

    this.receive = function (candidate) {
      var envelope = candidate;
      var error = validateBase(envelope);
      if (error) return reject(error, envelope);
      if (envelope.senderId === selfId) return reject('self-message', envelope);
      error = validateOrder(envelope);
      if (error) return reject(error, envelope);
      if (envelope.type === 'start') {
        if (!hostId || envelope.senderId !== hostId) return reject('start-not-from-host', envelope);
        if (!/^m_[a-f0-9]{32}$/.test(String(envelope.matchId || ''))) return reject('invalid-match-id', envelope);
      } else if (envelope.type === 'flick') {
        error = validateFlick(envelope);
        if (error) return reject(error, envelope);
      } else if (envelope.type === 'result') {
        error = validateResult(envelope);
        if (error) return reject(error, envelope);
      } else if (envelope.type !== 'resume' && envelope.type !== 'resume-state' &&
          matchId && envelope.matchId != null && envelope.matchId !== matchId) {
        return reject('wrong-match', envelope);
      }
      error = commit(envelope);
      if (error) return reject(error, envelope);
      return result(true, null, immutable(envelope));
    };

    this.setTurn = function (value) {
      var next = value || {};
      var nextPlayer = String(next.playerId || '');
      var nextTurn = Number(next.turnId);
      if (!matchId) throw new Error('No active match');
      if (!nextPlayer || !integer(nextTurn, 1)) throw new TypeError('playerId and turnId are required');
      if (nextTurn < turnId || nextTurn > turnId + 1) throw new Error('turnId must advance monotonically');
      if (nextTurn === turnId && nextPlayer !== currentPlayerId) throw new Error('Current turn is already bound');
      if (activeFlick && nextTurn !== turnId) throw new Error('Cannot advance with an active flip');
      currentPlayerId = nextPlayer;
      turnId = nextTurn;
      return this.snapshot();
    };

    this.setHost = function (value) {
      var id = String(value || '');
      if (!id) throw new TypeError('hostId is required');
      if (hostId && hostId !== id) throw new Error('Host identity is already pinned');
      hostId = id;
      return hostId;
    };

    this.snapshot = function () {
      var sequences = {};
      inboundSequences.forEach(function (value, key) { sequences[key] = value; });
      return immutable({
        protocol: PROTOCOL,
        room: room,
        hostId: hostId,
        matchId: matchId,
        currentPlayerId: currentPlayerId,
        turnId: turnId,
        lastFlipId: lastFlipId,
        activeFlick: activeFlick,
        outboundSequence: outboundSequence,
        inboundSequences: sequences,
      });
    };

    this.restore = function (snapshot, authorityId) {
      var source = snapshot || {};
      if (!hostId || String(authorityId || '') !== hostId) throw new Error('Resume state must come from the pinned host');
      if (source.protocol !== PROTOCOL || String(source.room || '').toUpperCase() !== room) {
        throw new Error('Incompatible resume state');
      }
      if (source.matchId == null) {
        matchId = null; currentPlayerId = null; turnId = 0; lastFlipId = 0; activeFlick = null;
      } else {
        if (source.hostId !== hostId || !/^m_[a-f0-9]{32}$/.test(String(source.matchId)) ||
            !/^p_[a-f0-9]{16}$/.test(String(source.currentPlayerId || '')) ||
            !integer(source.turnId, 1) || !integer(source.lastFlipId, 0)) {
          throw new Error('Invalid resume state');
        }
        matchId = source.matchId;
        currentPlayerId = String(source.currentPlayerId);
        turnId = source.turnId;
        lastFlipId = source.lastFlipId;
        if (source.activeFlick &&
            (source.activeFlick.senderId !== currentPlayerId || source.activeFlick.turnId !== turnId ||
             source.activeFlick.flipId !== lastFlipId || !integer(source.activeFlick.seed, 0) ||
             source.activeFlick.seed > 0xffffffff || !/^[a-f0-9]{8}$/.test(String(source.activeFlick.binding || '')))) {
          throw new Error('Invalid active flick in resume state');
        }
        activeFlick = source.activeFlick ? immutable(source.activeFlick) : null;
      }
      var received = source.inboundSequences || {};
      Object.keys(received).forEach(function (sender) {
        if (integer(received[sender], 1)) {
          inboundSequences.set(sender, Math.max(inboundSequences.get(sender) || 0, received[sender]));
        }
      });
      return this.snapshot();
    };

    this.identity = function () { return Object.freeze({ selfId: selfId, room: room, hostId: hostId }); };
  }

  return Object.freeze({
    SCHEMA: SCHEMA,
    VERSION: VERSION,
    PROTOCOL: PROTOCOL,
    CONTROL_TYPES: CONTROL_TYPES,
    GAME_TYPES: GAME_TYPES,
    ProtocolSession: ProtocolSession,
    flickBinding: flickBinding,
  });
});
