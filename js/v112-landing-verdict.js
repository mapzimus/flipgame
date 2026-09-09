// v112-landing-verdict.js -- private physics-to-rules authority for ordinary flips.
//
// Browser code receives metadata only. The trusted CommonJS composition layer
// claims separate lane capabilities for physics and rules, so a renderer or UI
// cannot manufacture a result-shaped object and submit it as a landing.
(function (root, factory) {
  'use strict';
  var commonJs = typeof module === 'object' && module !== null
    && Object.prototype.hasOwnProperty.call(module, 'exports')
    && typeof module.require === 'function'
    && typeof module.filename === 'string'
    && typeof process === 'object' && process !== null
    && process.versions && typeof process.versions.node === 'string';
  if (!commonJs && root && 'FlipgameV112LandingVerdict' in Object(root)) {
    throw new Error('Refusing duplicate or preseeded FlipgameV112LandingVerdict');
  }
  var api = factory(commonJs);
  if (commonJs) {
    module.exports = api;
  } else {
    if (!root) throw new Error('Browser landing verdict metadata requires a global object');
    Object.defineProperty(root, 'FlipgameV112LandingVerdict', {
      value: api.browser, enumerable: true, writable: false, configurable: false,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (commonJs) {
  'use strict';

  var VERSION = 1;
  var SCHEMA = 'FlipgameV112LandingVerdictAuthorityV1';
  var VERDICT_SCHEMA = 'LandingVerdictV2';
  var ATTEMPT_SCHEMA = 'LandingAttemptV1';
  var DEFAULT_SETTLE_LIMIT_MS = 4000;
  var MIN_STABLE_MS = 80;
  var MAX_ID_LENGTH = 128;
  var ALLOWED_SETTLE_LIMITS = Object.freeze([4000, 5000, 6000]);
  var RESULT_FIELDS = Object.freeze([
    'result', 'pose', 'onCap', 'reason', 'atMs', 'stableForMs',
  ]);

  // None of these maps or their identity-bearing keys leave this module.
  var AUTHORITIES = new WeakMap();
  var PHYSICS_LANES = new WeakMap();
  var RULES_LANES = new WeakMap();
  var ATTEMPTS = new WeakMap();
  var VERDICTS = new WeakMap();

  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }

  function ownDataObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError(label + ' must be a plain data object');
    }
    var prototype;
    try { prototype = Object.getPrototypeOf(value); }
    catch (_) { throw new TypeError(label + ' prototype is unreadable'); }
    var crossRealmPlain = prototype && Object.getPrototypeOf(prototype) === null;
    if (prototype !== null && prototype !== Object.prototype && !crossRealmPlain) {
      throw new TypeError(label + ' must be a plain data object');
    }
    var names;
    try { names = Object.getOwnPropertyNames(value); }
    catch (_) { throw new TypeError(label + ' fields are unreadable'); }
    if (typeof Object.getOwnPropertySymbols === 'function' &&
        Object.getOwnPropertySymbols(value).length) {
      throw new TypeError(label + ' cannot contain symbol fields');
    }
    names.forEach(function (key) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
        throw new TypeError(label + ' contains an unsafe field');
      }
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        throw new TypeError(label + '.' + key + ' cannot be an accessor');
      }
    });
    return value;
  }

  function exactFields(value, allowed, label) {
    var source = ownDataObject(value, label);
    var permitted = new Set(allowed);
    Object.getOwnPropertyNames(source).forEach(function (key) {
      if (!permitted.has(key)) throw new TypeError(label + ' contains unsupported field: ' + key);
    });
    return source;
  }

  function exactArray(value, label, minimum, maximum) {
    if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
      throw new RangeError(label + ' requires between ' + minimum + ' and ' + maximum + ' items');
    }
    var names = Object.getOwnPropertyNames(value);
    if (typeof Object.getOwnPropertySymbols === 'function' &&
        Object.getOwnPropertySymbols(value).length) {
      throw new TypeError(label + ' cannot contain symbol fields');
    }
    var expected = new Set(['length']);
    for (var index = 0; index < value.length; index += 1) expected.add(String(index));
    if (names.length !== expected.size || names.some(function (key) { return !expected.has(key); })) {
      throw new TypeError(label + ' must be a dense data-only array');
    }
    for (var offset = 0; offset < value.length; offset += 1) {
      var descriptor = Object.getOwnPropertyDescriptor(value, String(offset));
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        throw new TypeError(label + ' items cannot be accessors');
      }
    }
    return value;
  }

  function id(value, label) {
    if (typeof value !== 'string') throw new TypeError(label + ' must be a string primitive');
    var text = value.trim();
    if (!text) throw new TypeError(label + ' is required');
    if (text.length > MAX_ID_LENGTH) throw new RangeError(label + ' is too long');
    if (/[^\x20-\x7e]/.test(text)) throw new TypeError(label + ' contains unsupported characters');
    return text;
  }

  function time(value, label) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
      throw new TypeError(label + ' must be a non-negative safe integer');
    }
    return value;
  }

  function settleLimit(value) {
    var amount = value == null ? DEFAULT_SETTLE_LIMIT_MS : value;
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount) ||
        ALLOWED_SETTLE_LIMITS.indexOf(amount) < 0) {
      throw new RangeError('settleLimitMs must be an approved 4000, 5000, or 6000 ms limit');
    }
    return amount;
  }

  function sameIdentity(left, right) {
    return !!left && !!right && left.schema === right.schema && left.id === right.id &&
      left.namespace === right.namespace && left.ordinal === right.ordinal &&
      left.token === right.token && left.callerId === right.callerId;
  }

  function currentRulesSnapshot(record) {
    var state = record.rulesAdapter.snapshot();
    if (!state || typeof state !== 'object' || state.matchId !== record.matchId) {
      throw new Error('Rules adapter changed the immutable match identity');
    }
    if (state.phase !== 'active' && state.phase !== 'heat' && state.phase !== 'shootout') {
      throw new Error('Rules match is not accepting an ordinary landing');
    }
    return state;
  }

  function expectedPlayer(state) {
    if (!state.turn || typeof state.turn.current !== 'string' || !state.turn.current) {
      throw new Error('Rules state has no current player for an ordinary landing');
    }
    return state.turn.current;
  }

  function attemptRecord(handle, lane, label) {
    if (!handle || (typeof handle !== 'object' && typeof handle !== 'function')) {
      throw new TypeError(label + ' requires a physics-issued landing attempt');
    }
    var attempt = ATTEMPTS.get(handle);
    if (!attempt || attempt.lane !== lane) {
      throw new TypeError(label + ' requires this lane\'s exact physics-issued attempt');
    }
    return attempt;
  }

  function assertActiveAttempt(attempt, label) {
    if (attempt.status === 'aborted') throw new Error(label + ' cannot use an aborted attempt');
    if (attempt.status === 'issued' || attempt.status === 'consumed') {
      throw new Error(label + ' cannot reuse an issued landing attempt');
    }
  }

  function landingData(value, timedOut) {
    var source = exactFields(value, RESULT_FIELDS, 'settled landing');
    if (source.result != null && typeof source.result !== 'string') {
      throw new TypeError('Settled landing result must be a string primitive');
    }
    if (source.pose != null && typeof source.pose !== 'string') {
      throw new TypeError('Settled landing pose must be a string primitive');
    }
    if (source.reason != null && typeof source.reason !== 'string') {
      throw new TypeError('Settled landing reason must be a string primitive');
    }
    if (source.onCap != null && typeof source.onCap !== 'boolean') {
      throw new TypeError('Settled landing onCap must be a boolean primitive');
    }
    var rawResult = source.result == null ? '' : source.result.toUpperCase();
    var pose = source.pose == null ? '' : source.pose.toLowerCase();
    if (source.onCap === true) pose = 'cap';
    if (timedOut) {
      if (rawResult && rawResult !== 'MISS') throw new Error('A timed-out landing must be a miss');
      rawResult = 'MISS';
      pose = 'miss';
    } else {
      if (rawResult !== 'MAKE' && rawResult !== 'MISS') {
        throw new RangeError('Settled landing result must be MAKE or MISS');
      }
      if (rawResult === 'MISS') pose = 'miss';
      else pose = pose === 'cap' ? 'cap' : 'upright';
    }
    var reason = source.reason == null ? (timedOut ? 'settle-timeout' : null)
      : source.reason.trim().slice(0, 160);
    return freeze({
      result: rawResult, pose: pose, onCap: pose === 'cap', reason: reason,
    });
  }

  function makeVerdict(attempt, input, timedOut) {
    assertActiveAttempt(attempt, 'Landing verdict issuance');
    if (attempt.phase !== 'settling') {
      throw new Error('Landing verdict requires the contact and settling state machine');
    }
    var source = exactFields(input, RESULT_FIELDS, 'settled landing');
    var atMs = time(source.atMs, 'settled landing atMs');
    if (atMs <= attempt.settlingAtMs) {
      throw new Error('Landing verdict cannot resolve on the first settling frame');
    }
    var stableForMs = source.stableForMs == null ? 0
      : time(source.stableForMs, 'stableForMs');
    if (timedOut) {
      if (atMs - attempt.contactAtMs < attempt.settleLimitMs) {
        throw new Error('Landing timeout cannot resolve before the settle limit');
      }
    } else {
      if (stableForMs < MIN_STABLE_MS || atMs - attempt.settlingAtMs < stableForMs) {
        throw new Error('Stable landing requires a measured stable settling interval');
      }
      if (atMs - attempt.contactAtMs >= attempt.settleLimitMs) {
        throw new Error('Stable landing passed its settle limit and must use the timeout path');
      }
    }
    var landing = landingData(source, timedOut);
    var handle = freeze({
      schema: VERDICT_SCHEMA,
      version: VERSION,
      matchId: attempt.authority.matchId,
      laneId: attempt.lane.laneId,
      flipId: attempt.flipId,
      playerId: attempt.playerId,
      phase: 'resolved',
      result: landing.result,
      pose: landing.pose,
      onCap: landing.onCap,
      reason: landing.reason,
      firstContactMs: attempt.contactAtMs - attempt.launchedAtMs,
      settleMs: atMs - attempt.contactAtMs,
      settleLimitMs: attempt.settleLimitMs,
      timedOut: timedOut,
    });
    attempt.status = 'issued';
    attempt.phase = 'resolved';
    attempt.verdict = handle;
    VERDICTS.set(handle, {
      attempt: attempt,
      authority: attempt.authority,
      lane: attempt.lane,
      resolutionIdentity: attempt.resolutionIdentity,
      landing: landing,
      status: 'issued',
    });
    return handle;
  }

  function createPhysicsLane(record, lane) {
    var capability = Object.freeze({
      schema: 'LandingPhysicsLaneAuthorityV1',
      matchId: record.matchId,
      laneId: lane.laneId,
      beginFlip: function (value) {
        var source = exactFields(value,
          ['flipId', 'playerId', 'launchedAtMs', 'settleLimitMs', 'eventId'],
          'ordinary landing attempt');
        if (source.eventId != null) {
          throw new Error('Event landings must use the separate branded event authority');
        }
        if (lane.active && lane.active.status !== 'consumed' && lane.active.status !== 'aborted') {
          throw new Error('Landing lane already has an unresolved attempt');
        }
        var state = currentRulesSnapshot(record);
        var playerId = id(source.playerId == null ? expectedPlayer(state) : source.playerId,
          'playerId');
        if (playerId !== expectedPlayer(state)) {
          throw new Error('Landing attempt is for the wrong current player');
        }
        var flipId = id(source.flipId, 'flipId');
        if (record.flipIds.has(flipId)) throw new Error('flipId was already used in this match');
        var resolutionIdentity = record.rulesAdapter.nextResolutionIdentity(flipId);
        if (!resolutionIdentity || resolutionIdentity.callerId !== flipId) {
          throw new Error('Rules adapter did not bind the exact flip identity');
        }
        var handle = freeze({ schema: ATTEMPT_SCHEMA, version: VERSION,
          matchId: record.matchId, laneId: lane.laneId, flipId: flipId, playerId: playerId });
        var attempt = {
          authority: record, lane: lane, handle: handle, flipId: flipId,
          playerId: playerId, launchedAtMs: time(source.launchedAtMs, 'launchedAtMs'),
          settleLimitMs: settleLimit(source.settleLimitMs), resolutionIdentity: resolutionIdentity,
          phase: 'airborne', status: 'active', contactAtMs: null, settlingAtMs: null,
          verdict: null,
        };
        record.flipIds.add(flipId);
        lane.active = attempt;
        ATTEMPTS.set(handle, attempt);
        return handle;
      },
      markContact: function (handle, atMs) {
        var attempt = attemptRecord(handle, lane, 'Landing contact');
        assertActiveAttempt(attempt, 'Landing contact');
        if (attempt.phase !== 'airborne') throw new Error('Landing contact requires an airborne attempt');
        var timestamp = time(atMs, 'contact atMs');
        if (timestamp <= attempt.launchedAtMs) throw new Error('Landing contact must follow launch');
        attempt.contactAtMs = timestamp;
        attempt.phase = 'contact';
        return freeze({ phase: 'contact', atMs: timestamp });
      },
      markSettling: function (handle, atMs) {
        var attempt = attemptRecord(handle, lane, 'Landing settling');
        assertActiveAttempt(attempt, 'Landing settling');
        if (attempt.phase !== 'contact') throw new Error('Landing settling requires first contact');
        var timestamp = time(atMs, 'settling atMs');
        if (timestamp <= attempt.contactAtMs) {
          throw new Error('Landing settling cannot begin on the first contact frame');
        }
        attempt.settlingAtMs = timestamp;
        attempt.phase = 'settling';
        return freeze({ phase: 'settling', atMs: timestamp });
      },
      issueSettledVerdict: function (handle, input) {
        return makeVerdict(attemptRecord(handle, lane, 'Settled landing'), input, false);
      },
      issueTimeoutVerdict: function (handle, input) {
        return makeVerdict(attemptRecord(handle, lane, 'Landing timeout'), input, true);
      },
      abort: function (handle, reason) {
        var attempt = attemptRecord(handle, lane, 'Landing abort');
        assertActiveAttempt(attempt, 'Landing abort');
        attempt.status = 'aborted';
        attempt.phase = 'aborted';
        return freeze({ schema: 'LandingAttemptAbortV1', matchId: record.matchId,
          laneId: lane.laneId, flipId: attempt.flipId,
          reason: String(reason == null ? 'aborted' : reason).trim().slice(0, 160) });
      },
    });
    PHYSICS_LANES.set(capability, lane);
    return capability;
  }

  function createRulesLane(record, lane) {
    var capability = Object.freeze({
      schema: 'LandingRulesLaneAuthorityV1',
      matchId: record.matchId,
      laneId: lane.laneId,
      resolve: function (verdict) {
        if (!verdict || (typeof verdict !== 'object' && typeof verdict !== 'function')) {
          throw new TypeError('Rules resolution requires a physics-issued LandingVerdict');
        }
        var issued = VERDICTS.get(verdict);
        if (!issued) throw new TypeError('Rules resolution requires the exact physics-issued LandingVerdict');
        if (issued.authority !== record) throw new Error('LandingVerdict belongs to a different match');
        if (issued.lane !== lane) throw new Error('LandingVerdict belongs to a different lane');
        if (issued.status !== 'issued') throw new Error('LandingVerdict has already been consumed');
        var state = currentRulesSnapshot(record);
        if (expectedPlayer(state) !== issued.attempt.playerId) {
          throw new Error('LandingVerdict is stale for the current player');
        }
        var expected = record.rulesAdapter.nextResolutionIdentity(issued.attempt.flipId);
        if (!sameIdentity(expected, issued.resolutionIdentity)) {
          throw new Error('LandingVerdict is stale or future relative to the rules high-water mark');
        }
        // Spend before crossing the mutation boundary. A throwing or malformed
        // rules adapter cannot make the same physical verdict replayable.
        issued.status = 'consuming';
        issued.attempt.status = 'consuming';
        var transition;
        try {
          transition = record.rulesAdapter.resolveFlip({
            resolutionIdentity: issued.resolutionIdentity,
            flipId: issued.attempt.flipId,
            playerId: issued.attempt.playerId,
            result: issued.landing.result,
            pose: issued.landing.pose,
            onCap: issued.landing.onCap,
            reason: issued.landing.reason,
          });
        } catch (error) {
          issued.status = 'spent-error';
          issued.attempt.status = 'spent-error';
          throw error;
        }
        if (!transition || !transition.state || !transition.outcome ||
            transition.state.matchId !== record.matchId ||
            transition.outcome.matchId !== record.matchId ||
            transition.outcome.playerId !== issued.attempt.playerId ||
            !sameIdentity(transition.outcome.resolutionIdentity, issued.resolutionIdentity)) {
          issued.status = 'spent-error';
          issued.attempt.status = 'spent-error';
          throw new Error('Rules transition did not preserve the LandingVerdict identity');
        }
        issued.status = 'consumed';
        issued.attempt.status = 'consumed';
        return transition;
      },
    });
    RULES_LANES.set(capability, lane);
    return capability;
  }

  function createAuthority(options) {
    if (!commonJs) throw new Error('Landing verdict authority is available only to trusted composition');
    var source = exactFields(options, ['matchId', 'rulesAdapter', 'laneIds'],
      'landing verdict authority');
    var matchId = id(source.matchId, 'matchId');
    var rulesAdapter = source.rulesAdapter;
    if (!rulesAdapter || typeof rulesAdapter.snapshot !== 'function' ||
        typeof rulesAdapter.nextResolutionIdentity !== 'function' ||
        typeof rulesAdapter.resolveFlip !== 'function') {
      throw new TypeError('A trusted Rules adapter is required');
    }
    var initial = rulesAdapter.snapshot();
    if (!initial || initial.matchId !== matchId) {
      throw new Error('Rules adapter matchId does not match LandingVerdict authority');
    }
    exactArray(source.laneIds, 'landing verdict authority laneIds', 1, 4);
    var seen = new Set();
    var lanes = new Map();
    source.laneIds.forEach(function (value) {
      var laneId = id(value, 'laneId');
      if (seen.has(laneId)) throw new Error('Duplicate landing laneId: ' + laneId);
      seen.add(laneId);
      lanes.set(laneId, { laneId: laneId, physicsClaimed: false, rulesClaimed: false,
        active: null });
    });
    var record = { matchId: matchId, rulesAdapter: rulesAdapter, lanes: lanes,
      flipIds: new Set() };
    var authority = Object.freeze({
      schema: SCHEMA,
      version: VERSION,
      matchId: matchId,
      laneIds: Object.freeze(Array.from(lanes.keys())),
      claimPhysicsLane: function (value) {
        var lane = lanes.get(id(value, 'laneId'));
        if (!lane) throw new Error('Unknown landing lane');
        if (lane.physicsClaimed) throw new Error('Physics authority for this lane was already claimed');
        lane.physicsClaimed = true;
        return createPhysicsLane(record, lane);
      },
      claimRulesLane: function (value) {
        var lane = lanes.get(id(value, 'laneId'));
        if (!lane) throw new Error('Unknown landing lane');
        if (lane.rulesClaimed) throw new Error('Rules authority for this lane was already claimed');
        lane.rulesClaimed = true;
        return createRulesLane(record, lane);
      },
    });
    AUTHORITIES.set(authority, record);
    return authority;
  }

  var browser = freeze({
    schema: 'FlipgameV112LandingVerdictBrowserV1',
    version: VERSION,
    verdictSchema: VERDICT_SCHEMA,
    settleLimitsMs: ALLOWED_SETTLE_LIMITS,
    minimumStableMs: MIN_STABLE_MS,
    liveAuthorityAvailable: false,
  });

  var trusted = freeze({
    schema: SCHEMA,
    version: VERSION,
    VERDICT_SCHEMA: VERDICT_SCHEMA,
    ATTEMPT_SCHEMA: ATTEMPT_SCHEMA,
    DEFAULT_SETTLE_LIMIT_MS: DEFAULT_SETTLE_LIMIT_MS,
    MIN_STABLE_MS: MIN_STABLE_MS,
    ALLOWED_SETTLE_LIMITS: ALLOWED_SETTLE_LIMITS,
    browser: browser,
    createAuthority: createAuthority,
  });
  return commonJs ? trusted : { browser: browser };
});
