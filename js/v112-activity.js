// v112-activity.js -- activity/session contracts shared by Story, Rival Board,
// free play, and Battle. This module owns no DOM, physics, progression, or stats.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV112Activity = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function () {
  'use strict';

  var ACTIVITY_IDS = Object.freeze([
    'free-play', 'story', 'rival-board', 'practice', 'physics-lab', 'tutorial',
  ]);
  var FORMAT_IDS = Object.freeze(['classic', 'cup', 'team-clash', 'battle']);
  var PHYSICS_MODE_IDS = Object.freeze(['normal', 'insane', 'alien']);
  var LANE_STATES = Object.freeze([
    'ready', 'aiming', 'airborne', 'contact', 'settling', 'resolved', 'disabled',
  ]);
  var LANE_TRANSITIONS = Object.freeze({
    ready: Object.freeze(['aiming', 'disabled']),
    aiming: Object.freeze(['ready', 'airborne', 'disabled']),
    airborne: Object.freeze(['contact', 'settling', 'resolved', 'disabled']),
    contact: Object.freeze(['airborne', 'settling', 'resolved', 'disabled']),
    settling: Object.freeze(['airborne', 'contact', 'resolved', 'disabled']),
    resolved: Object.freeze(['ready', 'disabled']),
    disabled: Object.freeze(['ready']),
  });

  function clone(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  function object(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function nonEmpty(value, label) {
    var text = String(value == null ? '' : value).trim();
    if (!text) throw new TypeError(label + ' is required');
    return text;
  }

  function oneOf(value, values, label) {
    var text = nonEmpty(value, label);
    if (values.indexOf(text) < 0) throw new TypeError('Unsupported ' + label + ': ' + text);
    return text;
  }

  function finiteInteger(value, fallback) {
    var number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.floor(number);
  }

  // SessionActivityStateProviderV1 is deliberately registered out-of-band from
  // MatchRequestV2: request records stay serializable while coordinators can
  // obtain authoritative, current activity state at prepare/finalize/abandon.
  function createSessionActivityStateProvider(reader) {
    if (typeof reader !== 'function') throw new TypeError('Activity-state reader is required');
    return Object.freeze({ schema: 'SessionActivityStateProviderV1', read: reader });
  }

  function MatchSessionHooksV1(value) {
    var source = object(value);
    var provider = source.activityStateProvider || null;
    if (provider && (provider.schema !== 'SessionActivityStateProviderV1' ||
        typeof provider.read !== 'function')) {
      throw new TypeError('Invalid SessionActivityStateProviderV1');
    }
    return Object.freeze({ schema: 'MatchSessionHooksV1', activityStateProvider: provider });
  }

  function readSessionActivityState(session, phase) {
    var provider = session && session.hooks && session.hooks.activityStateProvider;
    if (!provider) return null;
    var state = provider.read(Object.freeze({
      schema: 'SessionActivityStateReadV1', phase: String(phase),
      request: session.request, prepared: session.prepared || null,
    }));
    if (state == null) return null;
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      throw new TypeError('Session activity-state provider must return an object or null');
    }
    return deepFreeze(clone(state));
  }

  function validateRoster(value) {
    if (!Array.isArray(value) || value.length < 1 || value.length > 16) {
      throw new TypeError('roster must contain 1–16 entries');
    }
    var ids = new Set();
    return value.map(function (entry, index) {
      var source = object(entry);
      var id = nonEmpty(source.id || source.playerId || ('seat-' + (index + 1)), 'roster id');
      if (ids.has(id)) throw new TypeError('Duplicate roster id: ' + id);
      ids.add(id);
      return deepFreeze(Object.assign({}, clone(source), { id: id, seat: index }));
    });
  }

  function validateActivityFormat(activityId, formatId, physicsModeId, activityContext) {
    var context = object(activityContext);
    if ((activityId === 'story' || activityId === 'rival-board') && formatId !== 'classic') {
      throw new TypeError(activityId + ' requires classic format');
    }
    if (activityId === 'story' || activityId === 'rival-board') {
      var nativeAlien = context.nativeAlien === true || context.rivalId === 'visitor-zero';
      if (physicsModeId !== (nativeAlien ? 'alien' : 'normal')) {
        throw new TypeError(activityId + ' requires its prescribed Story physics mode');
      }
    }
    if (activityId === 'tutorial' && (formatId !== 'classic' || physicsModeId !== 'normal')) {
      throw new TypeError('tutorial requires classic format and normal physics');
    }
    if (formatId === 'battle' && physicsModeId === 'alien') {
      throw new TypeError('battle does not support native alien physics');
    }
    if (formatId === 'battle' && activityId !== 'free-play') {
      throw new TypeError('battle is a free-play format');
    }
  }

  function MatchRequestV2(value) {
    var source = object(value);
    var activityId = oneOf(source.activityId || 'free-play', ACTIVITY_IDS, 'activityId');
    var formatId = oneOf(source.formatId || 'classic', FORMAT_IDS, 'formatId');
    var physicsModeId = oneOf(source.physicsModeId || 'normal', PHYSICS_MODE_IDS, 'physicsModeId');
    var activityContext = clone(object(source.activityContext));
    validateActivityFormat(activityId, formatId, physicsModeId, activityContext);
    var record = {
      schema: 'MatchRequestV2',
      matchId: nonEmpty(source.matchId, 'matchId'),
      activityId: activityId,
      formatId: formatId,
      physicsModeId: physicsModeId,
      roster: validateRoster(source.roster),
      rulesOptions: clone(object(source.rulesOptions)),
      activityContext: activityContext,
      seed: finiteInteger(source.seed, 1) >>> 0,
      createdAt: source.createdAt == null ? null : String(source.createdAt),
    };
    return deepFreeze(record);
  }

  function MatchOutcomeV2(value) {
    var source = object(value);
    var status = String(source.status || (source.completed === false ? 'abandoned' : 'completed'));
    if (['completed', 'abandoned', 'cancelled'].indexOf(status) < 0) {
      throw new TypeError('Unsupported outcome status: ' + status);
    }
    return deepFreeze({
      schema: 'MatchOutcomeV2',
      matchId: nonEmpty(source.matchId, 'matchId'),
      status: status,
      completed: status === 'completed',
      winnerIds: Array.from(new Set(Array.isArray(source.winnerIds) ? source.winnerIds.map(String) : [])),
      participantResults: clone(Array.isArray(source.participantResults) ? source.participantResults : []),
      rulesState: clone(object(source.rulesState)),
      activityState: clone(object(source.activityState)),
      telemetry: clone(object(source.telemetry)),
      completionReason: source.completionReason == null ? null : String(source.completionReason),
      endedAt: source.endedAt == null ? null : String(source.endedAt),
    });
  }

  function PostMatchResolutionV1(value) {
    var source = object(value);
    return deepFreeze({
      schema: 'PostMatchResolutionV1',
      matchId: nonEmpty(source.matchId, 'matchId'),
      activityId: oneOf(source.activityId || 'free-play', ACTIVITY_IDS, 'activityId'),
      status: String(source.status || 'completed'),
      duplicate: source.duplicate === true,
      activityResolution: clone(object(source.activityResolution)),
      transaction: clone(object(source.transaction)),
      presentation: clone(object(source.presentation)),
      statsQueued: source.statsQueued !== false,
    });
  }

  function createActivityRegistry(initialDefinitions) {
    var definitions = new Map();

    function register(value) {
      var source = object(value);
      var id = oneOf(source.id, ACTIVITY_IDS, 'activity id');
      if (definitions.has(id)) throw new Error('Activity already registered: ' + id);
      var definition = {
        id: id,
        prepare: typeof source.prepare === 'function' ? source.prepare : function (request) {
          return { request: request };
        },
        resolve: typeof source.resolve === 'function' ? source.resolve : function () { return {}; },
        abandon: typeof source.abandon === 'function' ? source.abandon : function () { return {}; },
      };
      definitions.set(id, Object.freeze(definition));
      return definition;
    }

    function get(id) {
      var definition = definitions.get(String(id));
      if (!definition) throw new Error('Activity is not registered: ' + id);
      return definition;
    }

    (Array.isArray(initialDefinitions) ? initialDefinitions : []).forEach(register);
    return Object.freeze({
      register: register,
      get: get,
      has: function (id) { return definitions.has(String(id)); },
      ids: function () { return Object.freeze(Array.from(definitions.keys())); },
      prepare: function (id, payload) { return get(id).prepare(payload); },
      resolve: function (id, payload) { return get(id).resolve(payload); },
      abandon: function (id, payload) { return get(id).abandon(payload); },
    });
  }

  function createMatchSessionCoordinator(options) {
    var opts = object(options);
    var registry = opts.registry;
    if (!registry || typeof registry.prepare !== 'function') {
      throw new TypeError('Activity registry is required');
    }
    var transaction = typeof opts.transaction === 'function'
      ? opts.transaction : function (payload) { return payload; };
    var statsSink = typeof opts.statsSink === 'function' ? opts.statsSink : function () {};
    var sessions = new Map();

    function start(input, sessionHooks) {
      var request = MatchRequestV2(input);
      if (sessions.has(request.matchId)) throw new Error('Match already started: ' + request.matchId);
      var hooks = MatchSessionHooksV1(sessionHooks);
      var session = {
        request: request, hooks: hooks, prepared: null,
        status: 'active',
        finalPromise: null,
        resolution: null,
        outcome: null,
        activityResolution: null,
      };
      var initialActivityState = readSessionActivityState(session, 'prepare');
      var prepared = registry.prepare(request.activityId, {
        request: request, activityState: initialActivityState,
      });
      session.prepared = deepFreeze(clone(prepared || {}));
      sessions.set(request.matchId, session);
      return deepFreeze({
        schema: 'MatchSessionV1',
        matchId: request.matchId,
        request: request,
        prepared: session.prepared,
        status: session.status, hasActivityStateProvider: !!hooks.activityStateProvider,
      });
    }

    function finalize(input) {
      var suppliedOutcome = MatchOutcomeV2(input);
      var session = sessions.get(suppliedOutcome.matchId);
      if (!session) return Promise.reject(new Error('Unknown match: ' + suppliedOutcome.matchId));
      // The first finalize call freezes the provider snapshot. Concurrent calls
      // compare against that snapshot rather than re-reading mutable activity state.
      if (session.status === 'finalizing' && session.finalPromise) {
        var repeatedOutcome = MatchOutcomeV2(Object.assign({}, clone(suppliedOutcome), {
          activityState: clone(session.outcome.activityState),
        }));
        if (JSON.stringify(session.outcome) !== JSON.stringify(repeatedOutcome)) {
          return Promise.reject(new Error('Conflicting final outcome for match: ' + suppliedOutcome.matchId));
        }
        return session.finalPromise;
      }
      if (session.status !== 'active') {
        return Promise.reject(new Error('Match is not active: ' + suppliedOutcome.matchId));
      }
      var dynamicActivityState;
      try {
        dynamicActivityState = readSessionActivityState(session, 'finalize');
      } catch (error) {
        return Promise.reject(error);
      }
      var outcome = dynamicActivityState ? MatchOutcomeV2(Object.assign({}, clone(suppliedOutcome), {
        activityState: Object.assign({}, clone(suppliedOutcome.activityState), dynamicActivityState),
      })) : suppliedOutcome;
      var allowedWinnerIds = new Set();
      session.request.roster.forEach(function (entry) {
        allowedWinnerIds.add(entry.id);
        if (entry.teamId != null) allowedWinnerIds.add(String(entry.teamId));
      });
      if (outcome.winnerIds.some(function (id) { return !allowedWinnerIds.has(id); })) {
        return Promise.reject(new TypeError('Outcome contains a winner outside the match roster'));
      }
      if (outcome.participantResults.some(function (entry) {
        var source = object(entry);
        var id = source.playerId == null ? source.id : source.playerId;
        return id != null && !allowedWinnerIds.has(String(id));
      })) {
        return Promise.reject(new TypeError('Outcome contains a participant outside the match roster'));
      }
      if (session.outcome && JSON.stringify(session.outcome) !== JSON.stringify(outcome)) {
        return Promise.reject(new Error('Conflicting final outcome for match: ' + outcome.matchId));
      }
      if (session.finalPromise) return session.finalPromise;
      session.outcome = outcome;
      session.status = 'finalizing';
      session.finalPromise = Promise.resolve().then(function () {
        if (!session.activityResolution) {
          session.activityResolution = deepFreeze(clone(registry.resolve(session.request.activityId, {
            request: session.request,
            prepared: session.prepared,
            outcome: outcome,
          }) || {}));
        }
        var activityResolution = session.activityResolution;
        return Promise.resolve(transaction({
          schema: 'MatchFinalizationCommandV1',
          idempotencyKey: 'match:' + outcome.matchId,
          matchId: outcome.matchId,
          request: session.request,
          outcome: outcome,
          activityResolution: deepFreeze(clone(activityResolution)),
        })).then(function (transactionResult) {
          session.status = 'finalized';
          var duplicate = !!(transactionResult && transactionResult.duplicate);
          session.resolution = PostMatchResolutionV1({
            matchId: outcome.matchId,
            activityId: session.request.activityId,
            status: outcome.status,
            duplicate: duplicate,
            activityResolution: activityResolution,
            transaction: transactionResult,
            presentation: transactionResult && transactionResult.presentation,
            statsQueued: true,
          });
          Promise.resolve().then(function () {
            return statsSink({ request: session.request, outcome: outcome,
              resolution: session.resolution });
          }).catch(function () {});
          return session.resolution;
        });
      });
      session.finalPromise = session.finalPromise.catch(function (error) {
        session.finalPromise = null;
        session.status = 'active';
        throw error;
      });
      return session.finalPromise;
    }

    function abandon(matchId, reason) {
      var id = nonEmpty(matchId, 'matchId');
      var session = sessions.get(id);
      if (!session) throw new Error('Unknown match: ' + id);
      if (session.status !== 'active') return deepFreeze({ matchId: id, status: session.status });
      var activityState = readSessionActivityState(session, 'abandon');
      var activityResolution = registry.abandon(session.request.activityId, {
        request: session.request,
        prepared: session.prepared,
        activityState: activityState,
        reason: reason == null ? 'abandoned' : String(reason),
      }) || {};
      session.status = 'abandoned';
      return deepFreeze({ matchId: id, status: 'abandoned',
        activityResolution: clone(activityResolution) });
    }

    function snapshot(matchId) {
      var session = sessions.get(String(matchId));
      if (!session) return null;
      return deepFreeze({ matchId: session.request.matchId, status: session.status,
        request: session.request, prepared: session.prepared,
        resolution: session.resolution,
        hasActivityStateProvider: !!session.hooks.activityStateProvider });
    }

    return Object.freeze({ start: start, finalize: finalize, abandon: abandon, snapshot: snapshot });
  }

  function createLaneRuntime(input) {
    var source = object(input);
    var laneId = nonEmpty(source.laneId, 'laneId');
    var state = oneOf(source.state || 'ready', LANE_STATES, 'lane state');
    var pointerId = null;
    var attemptId = null;
    var result = null;
    var charge = Math.max(0, Math.min(3, finiteInteger(source.charge, 0)));
    var powerOffer = null;
    var storedPower = null;

    function snapshot() {
      return deepFreeze({ schema: 'LaneRuntimeV1', laneId: laneId,
        ownerId: source.ownerId == null ? null : String(source.ownerId),
        teamId: source.teamId == null ? null : String(source.teamId),
        state: state, pointerId: pointerId, attemptId: attemptId,
        result: clone(result), charge: charge, powerOffer: clone(powerOffer),
        storedPower: clone(storedPower) });
    }
    function transition(next) {
      var desired = oneOf(next, LANE_STATES, 'lane state');
      if (LANE_TRANSITIONS[state].indexOf(desired) < 0) {
        throw new Error('Invalid lane transition: ' + state + ' -> ' + desired);
      }
      state = desired;
      if (state === 'ready') { attemptId = null; result = null; pointerId = null; }
      return snapshot();
    }
    function claimPointer(value) {
      if (state !== 'ready' && state !== 'aiming') throw new Error('Lane cannot claim pointer while ' + state);
      var id = finiteInteger(value, NaN);
      if (!Number.isFinite(id)) throw new TypeError('pointerId is required');
      if (pointerId != null && pointerId !== id) return false;
      pointerId = id;
      if (state === 'ready') state = 'aiming';
      return true;
    }
    function releasePointer(value) {
      if (pointerId == null || pointerId !== finiteInteger(value, NaN)) return false;
      pointerId = null;
      return true;
    }
    function armAttempt(value) {
      if (state !== 'aiming') throw new Error('Lane must be aiming before launch');
      attemptId = nonEmpty(value, 'attemptId');
      pointerId = null;
      state = 'airborne';
      return snapshot();
    }
    function resolveAttempt(value) {
      if (['airborne', 'contact', 'settling'].indexOf(state) < 0) {
        throw new Error('Lane has no active attempt');
      }
      result = clone(object(value));
      state = 'resolved';
      return snapshot();
    }
    function addCharge(amount) {
      charge = Math.max(0, Math.min(3, charge + Math.max(0, finiteInteger(amount, 1))));
      return charge;
    }
    function offerPower(cards) {
      if (charge < 3) throw new Error('Lane requires three charges');
      if (!Array.isArray(cards) || cards.length !== 2) throw new TypeError('Power offer requires two cards');
      powerOffer = cards.map(function (card) { return clone(object(card)); });
      charge = 0;
      return snapshot();
    }
    function storePower(index) {
      if (!powerOffer) throw new Error('No power offer');
      var selected = finiteInteger(index, -1);
      if (selected < 0 || selected >= powerOffer.length) throw new RangeError('Invalid power choice');
      storedPower = clone(powerOffer[selected]);
      powerOffer = null;
      return snapshot();
    }
    function consumePower() {
      var value = clone(storedPower);
      storedPower = null;
      return value;
    }
    return Object.freeze({ snapshot: snapshot, transition: transition,
      claimPointer: claimPointer, releasePointer: releasePointer,
      armAttempt: armAttempt, resolveAttempt: resolveAttempt,
      addCharge: addCharge, offerPower: offerPower, storePower: storePower,
      consumePower: consumePower });
  }

  return deepFreeze({
    schema: 'FlipgameV112ActivityV1',
    ACTIVITY_IDS: ACTIVITY_IDS,
    FORMAT_IDS: FORMAT_IDS,
    PHYSICS_MODE_IDS: PHYSICS_MODE_IDS,
    LANE_STATES: LANE_STATES,
    MatchRequestV2: MatchRequestV2,
    MatchOutcomeV2: MatchOutcomeV2,
    PostMatchResolutionV1: PostMatchResolutionV1,
    createSessionActivityStateProvider: createSessionActivityStateProvider,
    MatchSessionHooksV1: MatchSessionHooksV1,
    createActivityRegistry: createActivityRegistry,
    createMatchSessionCoordinator: createMatchSessionCoordinator,
    createLaneRuntime: createLaneRuntime,
  });
});
