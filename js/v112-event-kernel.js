// v112-event-kernel.js -- shared, renderer-free contracts for v1.12 event packs.
//
// The kernel deliberately owns no event implementation and no game rules. It
// gives each lane an isolated deterministic RNG and resource scope, validates
// physical facts, and freezes every value crossing a pack boundary.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV112EventKernel = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function () {
  'use strict';

  var EVENT_CLASSES = Object.freeze(['hazard', 'wildcard', 'assist']);
  var RESOURCE_KINDS = Object.freeze([
    'body', 'sensor', 'constraint', 'audio', 'camera', 'override', 'callback',
  ]);
  var RESOURCE_KIND_SET = Object.create(null);
  RESOURCE_KINDS.forEach(function (kind) { RESOURCE_KIND_SET[kind] = true; });

  var FORBIDDEN_RULE_KEYS = Object.freeze({
    reward: true, rewards: true, effect: true, effects: true,
    additivelives: true, lifemultiplier: true, halveopponents: true,
    setopponentsto: true, forceeliminateactor: true, forceeliminateids: true,
    grantalwaysmagnet: true, scoremultiplier: true, additivepoints: true,
    automaticwinner: true, terminaloutcome: true, rawpoints: true,
    winner: true, loser: true, win: true, loss: true,
  });

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function requiredString(value, label, maximum) {
    var text = String(value == null ? '' : value).trim();
    if (!text) throw new TypeError(label + ' is required');
    if (maximum != null && text.length > maximum) {
      throw new RangeError(label + ' exceeds ' + maximum + ' characters');
    }
    return text;
  }

  function finite(value, label, minimum, maximum) {
    var number = Number(value);
    if (!Number.isFinite(number)) throw new TypeError(label + ' must be finite');
    if (minimum != null && number < minimum) throw new RangeError(label + ' is below its minimum');
    if (maximum != null && number > maximum) throw new RangeError(label + ' exceeds its maximum');
    return number;
  }

  function whole(value, label, minimum, maximum) {
    var number = Number(value);
    if (!Number.isSafeInteger(number)) throw new TypeError(label + ' must be a safe integer');
    if (minimum != null && number < minimum) throw new RangeError(label + ' is below its minimum');
    if (maximum != null && number > maximum) throw new RangeError(label + ' exceeds its maximum');
    return number;
  }

  function deepFreeze(value, seen) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    var visited = seen || [];
    if (visited.indexOf(value) >= 0) return value;
    visited.push(value);
    Object.keys(value).forEach(function (key) { deepFreeze(value[key], visited); });
    return Object.freeze(value);
  }

  function copyData(value, label, stack) {
    var where = label || 'value';
    if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new TypeError(where + ' contains a non-finite number');
      return value;
    }
    if (typeof value !== 'object') throw new TypeError(where + ' must contain data only');
    var ancestors = stack || [];
    if (ancestors.indexOf(value) >= 0) throw new TypeError(where + ' cannot be cyclic');
    var nextStack = ancestors.concat([value]);
    if (Array.isArray(value)) {
      return value.map(function (entry, index) {
        return copyData(entry, where + '[' + index + ']', nextStack);
      });
    }
    if (!isPlainObject(value)) throw new TypeError(where + ' must use plain data objects');
    var result = {};
    Object.keys(value).forEach(function (key) {
      result[key] = copyData(value[key], where + '.' + key, nextStack);
    });
    return result;
  }

  function immutableData(value, label) {
    return deepFreeze(copyData(value, label));
  }

  function normalizedKey(value) {
    return String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function assertNoRuleEffects(value, label, stack) {
    if (!value || typeof value !== 'object') return true;
    var visited = stack || [];
    if (visited.indexOf(value) >= 0) throw new TypeError((label || 'pack output') + ' cannot be cyclic');
    var next = visited.concat([value]);
    if (Array.isArray(value)) {
      value.forEach(function (entry, index) {
        assertNoRuleEffects(entry, (label || 'pack output') + '[' + index + ']', next);
      });
      return true;
    }
    Object.keys(value).forEach(function (key) {
      if (FORBIDDEN_RULE_KEYS[normalizedKey(key)]) {
        throw new Error((label || 'pack output') + ' cannot emit rule field: ' + key);
      }
      assertNoRuleEffects(value[key], (label || 'pack output') + '.' + key, next);
    });
    return true;
  }

  function exactKeys(value, allowed, label) {
    Object.keys(value).forEach(function (key) {
      if (allowed.indexOf(key) < 0) throw new TypeError((label || 'value') + ' has unsupported field: ' + key);
    });
  }

  function eventId(value) {
    var id = requiredString(value, 'eventId', 64);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new TypeError('Invalid eventId: ' + id);
    return id;
  }

  function eventClass(value) {
    var result = requiredString(value, 'eventClass', 16);
    if (EVENT_CLASSES.indexOf(result) < 0) throw new TypeError('Unsupported eventClass: ' + result);
    return result;
  }

  function definePack(input) {
    if (!isPlainObject(input)) throw new TypeError('EventPackV1 definition is required');
    exactKeys(input, ['schema', 'eventClass', 'ids', 'create'], 'EventPackV1');
    if (input.schema != null && input.schema !== 'EventPackV1') throw new TypeError('Invalid EventPackV1 schema');
    var kind = eventClass(input.eventClass);
    if (!Array.isArray(input.ids) || !input.ids.length) throw new TypeError('EventPackV1 ids are required');
    var ids = input.ids.map(eventId);
    if (new Set(ids).size !== ids.length) throw new TypeError('EventPackV1 ids must be unique');
    if (typeof input.create !== 'function') throw new TypeError('EventPackV1 create must be a function');
    return Object.freeze({ schema: 'EventPackV1', eventClass: kind,
      ids: Object.freeze(ids.slice()), create: input.create });
  }

  function validatePack(value) {
    if (!value || value.schema !== 'EventPackV1' || typeof value.create !== 'function') {
      throw new TypeError('EventPackV1 is required');
    }
    exactKeys(value, ['schema', 'eventClass', 'ids', 'create'], 'EventPackV1');
    if (!Object.isFrozen(value) || !Object.isFrozen(value.ids)) {
      throw new TypeError('EventPackV1 and its IDs must be immutable');
    }
    eventClass(value.eventClass);
    if (!Array.isArray(value.ids) || !value.ids.length ||
        new Set(value.ids.map(eventId)).size !== value.ids.length) {
      throw new TypeError('Invalid EventPackV1 ids');
    }
    return value;
  }

  function mix32(value) {
    var x = Number(value) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }

  function hashText(value) {
    var text = String(value);
    var hash = 2166136261;
    for (var index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function createEventRng(seedValue) {
    var seed = whole(seedValue, 'eventSeed', 0, 0xffffffff) >>> 0;
    var counter = 0;
    function sample(index, channel) {
      var position = whole(index, 'RNG sample index', 0, Number.MAX_SAFE_INTEGER);
      var salt = hashText(channel == null ? 'default' : channel);
      return mix32(seed ^ salt ^ Math.imul((position + 1) >>> 0, 0x9e3779b9));
    }
    function nextUint32(channel) {
      var value = sample(counter, channel);
      counter += 1;
      return value;
    }
    function nextFloat(channel) { return nextUint32(channel) / 0x100000000; }
    function nextInt(maxExclusive, channel) {
      var maximum = whole(maxExclusive, 'RNG maximum', 1, 0x100000000);
      return Math.floor(nextFloat(channel) * maximum);
    }
    function range(minimum, maximum, channel) {
      var low = finite(minimum, 'RNG range minimum');
      var high = finite(maximum, 'RNG range maximum');
      if (!(high > low)) throw new RangeError('RNG range maximum must exceed its minimum');
      return low + (high - low) * nextFloat(channel);
    }
    function snapshot() {
      return Object.freeze({ schema: 'EventRngSnapshotV1', seed: seed, counter: counter });
    }
    return Object.freeze({ schema: 'EventRngV1', seed: seed, sampleUint32: sample,
      nextUint32: nextUint32, nextFloat: nextFloat, nextInt: nextInt,
      range: range, snapshot: snapshot });
  }

  function normalizeSelection(value, expectedId, expectedClass) {
    if (!isPlainObject(value) || value.schema !== 'EventSelectionV2') {
      throw new TypeError('EventSelectionV2 is required');
    }
    exactKeys(value, ['schema', 'eventId', 'displayName', 'eventClass', 'turnSeed',
      'eventSeed', 'oddsProfile', 'forced', 'testData', 'consumed', 'telegraph'],
    'EventSelectionV2');
    var id = eventId(value.eventId);
    var kind = eventClass(value.eventClass);
    if (expectedId != null && id !== expectedId) throw new Error('Event selection ID does not match its pack');
    if (expectedClass != null && kind !== expectedClass) {
      throw new Error('Event selection class does not match its pack');
    }
    var turnSeed = whole(value.turnSeed, 'turnSeed', 0, 0xffffffff) >>> 0;
    var seed = whole(value.eventSeed, 'eventSeed', 0, 0xffffffff) >>> 0;
    if (typeof value.forced !== 'boolean' || typeof value.testData !== 'boolean' ||
        typeof value.consumed !== 'boolean') {
      throw new TypeError('EventSelectionV2 flags must be boolean');
    }
    return deepFreeze({ schema: 'EventSelectionV2', eventId: id,
      displayName: requiredString(value.displayName, 'event displayName', 96), eventClass: kind,
      turnSeed: turnSeed, eventSeed: seed,
      oddsProfile: requiredString(value.oddsProfile, 'event oddsProfile', 48),
      forced: value.forced, testData: value.testData, consumed: value.consumed,
      telegraph: normalizeTelegraph(value.telegraph) });
  }

  function createResourceScope(laneValue) {
    var laneId = requiredString(laneValue, 'laneId', 96);
    var records = [];
    var keys = Object.create(null);
    var cleaned = false;
    var cleanupInProgress = false;
    var cleanupResult = null;

    function own(kindValue, idValue, resource, disposer) {
      if (cleaned) throw new Error('Event resource scope is already cleaned');
      var kind = requiredString(kindValue, 'resource kind', 24);
      if (!RESOURCE_KIND_SET[kind]) throw new TypeError('Unsupported event resource kind: ' + kind);
      var id = requiredString(idValue, 'resource id', 96);
      var key = kind + ':' + id;
      if (keys[key]) throw new Error('Duplicate lane resource: ' + key);
      if ((typeof resource !== 'object' || resource === null) && typeof resource !== 'function') {
        throw new TypeError('Event resource must be an object or function');
      }
      if (resource && Object.prototype.hasOwnProperty.call(resource, 'laneId') &&
          String(resource.laneId) !== laneId) {
        throw new Error('Cross-lane event resource rejected: ' + key);
      }
      if (records.some(function (record) { return record.resource === resource; })) {
        throw new Error('The same event resource cannot be owned twice in one lane');
      }
      if (typeof disposer !== 'function') throw new TypeError('Event resource disposer is required');
      keys[key] = true;
      records.push({ kind: kind, id: id, resource: resource, disposer: disposer, released: false });
      return resource;
    }

    function method(kind) {
      return function (id, resource, disposer) { return own(kind, id, resource, disposer); };
    }

    function snapshot() {
      var counts = {};
      RESOURCE_KINDS.forEach(function (kind) { counts[kind] = 0; });
      records.forEach(function (record) { if (!record.released) counts[record.kind] += 1; });
      return deepFreeze({ schema: 'EventResourceScopeSnapshotV1', laneId: laneId,
        cleaned: cleaned, active: records.filter(function (record) { return !record.released; }).length,
        counts: counts, resourceIds: records.filter(function (record) { return !record.released; })
          .map(function (record) { return record.kind + ':' + record.id; }) });
    }

    function cleanup(reasonValue) {
      if (cleanupResult) return cleanupResult;
      if (cleanupInProgress) {
        return deepFreeze({ schema: 'EventResourceCleanupV1', laneId: laneId,
          reason: String(reasonValue == null ? 'cleanup' : reasonValue), released: [], errors: [],
          clean: false, inProgress: true });
      }
      cleanupInProgress = true;
      cleaned = true;
      var reason = String(reasonValue == null ? 'cleanup' : reasonValue);
      var errors = [];
      var released = [];
      for (var index = records.length - 1; index >= 0; index -= 1) {
        var record = records[index];
        if (record.released) continue;
        record.released = true;
        try {
          record.disposer(record.resource, Object.freeze({ schema: 'EventResourceDisposalV1',
            laneId: laneId, kind: record.kind, resourceId: record.id, reason: reason }));
        } catch (error) {
          errors.push({ kind: record.kind, resourceId: record.id,
            name: String(error && error.name || 'Error'), message: String(error && error.message || error) });
        }
        released.push(record.kind + ':' + record.id);
      }
      cleanupResult = deepFreeze({ schema: 'EventResourceCleanupV1', laneId: laneId,
        reason: reason, released: released, errors: errors, clean: errors.length === 0 });
      cleanupInProgress = false;
      return cleanupResult;
    }

    return Object.freeze({ schema: 'EventResourceScopeV1', laneId: laneId,
      own: own, ownBody: method('body'), ownSensor: method('sensor'),
      ownConstraint: method('constraint'), ownAudio: method('audio'),
      ownCamera: method('camera'), ownOverride: method('override'),
      ownCallback: method('callback'), snapshot: snapshot, cleanup: cleanup });
  }

  var BEHAVIOR_METHODS = Object.freeze([
    'telegraph', 'qualifyLaunch', 'launch', 'step', 'contact', 'evaluate', 'frame', 'cleanup',
  ]);

  function validateBehavior(value) {
    if (!value || typeof value !== 'object') throw new TypeError('EventBehaviorV1 is required');
    if (!Object.isFrozen(value)) throw new TypeError('EventBehaviorV1 must be immutable');
    BEHAVIOR_METHODS.forEach(function (name) {
      if (typeof value[name] !== 'function') throw new TypeError('EventBehaviorV1.' + name + ' is required');
    });
    var wrapped = {};
    BEHAVIOR_METHODS.forEach(function (name) {
      var method = value[name];
      wrapped[name] = function () { return method.apply(value, arguments); };
    });
    return Object.freeze(wrapped);
  }

  function normalizeTelegraph(value) {
    var source = value == null ? {} : value;
    if (!isPlainObject(source)) throw new TypeError('Event telegraph must be a data object');
    exactKeys(source, ['schema', 'title', 'instruction', 'glyph', 'durationMs', 'cues'], 'EventTelegraphV1');
    assertNoRuleEffects(source, 'Event telegraph');
    var result = {
      schema: 'EventTelegraphV1',
      title: requiredString(source.title, 'telegraph title', 96),
      instruction: requiredString(source.instruction, 'telegraph instruction', 240),
      glyph: source.glyph == null ? null : requiredString(source.glyph, 'telegraph glyph', 64),
      durationMs: whole(source.durationMs == null ? 900 : source.durationMs,
        'telegraph duration', 0, 30000),
      cues: source.cues == null ? [] : copyData(source.cues, 'telegraph cues'),
    };
    if (!Array.isArray(result.cues)) throw new TypeError('telegraph cues must be an array');
    return deepFreeze(result);
  }

  function normalizeQualification(value) {
    var source = typeof value === 'boolean' ? { qualified: value } : value;
    if (!isPlainObject(source)) throw new TypeError('Event launch qualification is required');
    exactKeys(source, ['schema', 'qualified', 'reason'], 'EventLaunchQualificationV1');
    if (typeof source.qualified !== 'boolean') throw new TypeError('qualified must be boolean');
    return deepFreeze({ schema: 'EventLaunchQualificationV1', qualified: source.qualified,
      reason: source.reason == null ? null : requiredString(source.reason, 'qualification reason', 160) });
  }

  function normalizeDirective(phase, value) {
    var data = value == null ? {} : value;
    if (!isPlainObject(data)) throw new TypeError(phase + ' directive must be a data object');
    assertNoRuleEffects(data, phase + ' directive');
    return deepFreeze({ schema: 'EventDirectiveV1', phase: phase,
      data: copyData(data, phase + ' directive') });
  }

  function normalizeContact(value) {
    if (!isPlainObject(value)) throw new TypeError('ContactV1 is required');
    exactKeys(value, ['schema', 'contactId', 'phase', 'entityARef', 'entityBRef',
      'point', 'normal', 'impulse', 'elapsedMs'], 'ContactV1');
    var phase = String(value.phase || 'begin');
    if (['begin', 'persist', 'end'].indexOf(phase) < 0) throw new TypeError('Unsupported contact phase');
    function vector(input, label) {
      if (!isPlainObject(input)) throw new TypeError(label + ' vector is required');
      exactKeys(input, ['x', 'y'], label);
      return { x: finite(input.x, label + '.x'), y: finite(input.y, label + '.y') };
    }
    return deepFreeze({ schema: 'ContactV1', contactId: requiredString(value.contactId, 'contactId', 128),
      phase: phase, entityARef: requiredString(value.entityARef, 'entityARef', 128),
      entityBRef: requiredString(value.entityBRef, 'entityBRef', 128),
      point: vector(value.point, 'contact point'), normal: vector(value.normal, 'contact normal'),
      impulse: finite(value.impulse == null ? 0 : value.impulse, 'contact impulse', 0),
      elapsedMs: finite(value.elapsedMs == null ? 0 : value.elapsedMs, 'contact elapsedMs', 0) });
  }

  function normalizeLandingProbe(value) {
    if (!isPlainObject(value)) throw new TypeError('LandingProbeV1 is required');
    exactKeys(value, ['schema', 'result', 'pose', 'reason', 'settled', 'rotations',
      'contactCount', 'bounceCount', 'elapsedMs'], 'LandingProbeV1');
    var result = String(value.result || '').toUpperCase();
    if (result !== 'MAKE' && result !== 'MISS') throw new TypeError('LandingProbeV1 result must be MAKE or MISS');
    var pose = result === 'MISS' ? 'miss' : String(value.pose || 'upright').toLowerCase();
    if (result === 'MAKE' && pose !== 'upright' && pose !== 'cap') {
      throw new TypeError('LandingProbeV1 make pose must be upright or cap');
    }
    if (typeof value.settled !== 'boolean') throw new TypeError('LandingProbeV1 settled is required');
    return deepFreeze({ schema: 'LandingProbeV1', result: result, pose: pose,
      reason: value.reason == null ? null : requiredString(value.reason, 'landing reason', 160),
      settled: value.settled, rotations: finite(value.rotations == null ? 0 : value.rotations,
        'landing rotations', 0),
      contactCount: whole(value.contactCount == null ? 0 : value.contactCount,
        'landing contact count', 0),
      bounceCount: whole(value.bounceCount == null ? 0 : value.bounceCount,
        'landing bounce count', 0),
      elapsedMs: finite(value.elapsedMs == null ? 0 : value.elapsedMs, 'landing elapsedMs', 0) });
  }

  function numberField(minimum, maximum) {
    return function (value, label) { return finite(value, label, minimum, maximum); };
  }
  function integerField(minimum, maximum) {
    return function (value, label) { return whole(value, label, minimum, maximum); };
  }
  function booleanField(value, label) {
    if (typeof value !== 'boolean') throw new TypeError(label + ' must be boolean');
    return value;
  }
  function stringField(value, label) { return requiredString(value, label, 128); }

  // These are physical observations only. Rules-relevant values such as life
  // awards or score multipliers are intentionally absent from this vocabulary.
  var FACT_SPECS = Object.freeze({
    'rainbow-corkscrew': { corkscrewRadians: numberField(0, 200) },
    'half-full': { centerOfMassShift: numberField(-1, 1), baseStabilized: booleanField },
    'power-launch': { impulseScale: numberField(0, 10) },
    'fizz-jet': { topEjected: booleanField, thrustMs: numberField(0, 60000) },
    'golden-flip': { massScale: numberField(0.01, 20) },
    'bouncy-bottle': { bounceCount: integerField(0, 3), fullySettled: booleanField },
    earthquake: { tableTravel: numberField(0, 100000), debrisContacts: integerField(0, 10000) },
    'moon-gravity': { gravityScale: numberField(0.001, 1) },
    'ice-slide': { slideDistance: numberField(0, 100000), frictionRecovered: booleanField },
    'alien-invasion': { bankCount: integerField(0, 100), ringEntered: booleanField },
    'gravity-slam': { peakImpact: numberField(0, 1000000) },
    trampoline: { relaunchCount: integerField(0, 10), returnedToTable: booleanField },
    'wind-tunnel': { lateralImpulse: numberField(-1000000, 1000000) },
    'shrink-ray': { scale: numberField(0.05, 1) },
    'portal-pair': { portalPasses: integerField(0, 100), speedRatio: numberField(0, 100) },
    'tether-swing': { cableAttached: booleanField, released: booleanField,
      swingRadians: numberField(0, 200) },
    mitosis: { landedCopies: integerField(0, 2) },
    'double-flip': { rotations: numberField(0, 100) },
    'ceiling-flip': { ceilingContact: booleanField },
    'meteor-shower': { debrisContacts: integerField(0, 10000) },
    magnet: { magneticImpulse: numberField(0, 1000000) },
    'heart-rush': { pulseCount: integerField(0, 3) },
    'black-hole': { orbitRadians: numberField(0, 1000) },
    boomerang: { returnedToOrigin: booleanField, returnDistance: numberField(0, 100000) },
    'roulette-table': { sectorIndex: integerField(0, 7) },
    rewind: { replayCount: integerField(0, 1), correctiveImpulseApplied: booleanField },
    plinko: { slotIndex: integerField(0, 8), dropDurationMs: numberField(0, 60000) },
    'mirror-match': { normalizedLaunchX: numberField(-4, 4), normalizedLaunchY: numberField(-4, 4),
      spin: numberField(-1000, 1000), profileSeed: integerField(0, 0xffffffff),
      physicsProfileId: stringField },
    'cap-toss': { bodyLanded: booleanField, topLanded: booleanField },
    'life-drain': { magnetAssisted: booleanField },
  });

  function normalizeOutcomeFacts(idValue, value) {
    var id = eventId(idValue);
    var spec = FACT_SPECS[id];
    if (!spec) throw new TypeError('No EventOutcomeFactsV1 contract for ' + id);
    var wrapped = value && value.schema === 'EventOutcomeFactsV1';
    if (wrapped) {
      if (!isPlainObject(value)) throw new TypeError('EventOutcomeFactsV1 must be a data object');
      exactKeys(value, ['schema', 'eventId', 'values'], 'EventOutcomeFactsV1');
      if (eventId(value.eventId) !== id) throw new Error('EventOutcomeFactsV1 eventId mismatch');
      if (!isPlainObject(value.values)) throw new TypeError('EventOutcomeFactsV1 values are required');
    }
    var source = wrapped ? value.values : value;
    if (!isPlainObject(source)) throw new TypeError('Outcome facts for ' + id + ' are required');
    assertNoRuleEffects(source, 'Outcome facts');
    exactKeys(source, Object.keys(spec), 'Outcome facts for ' + id);
    var values = {};
    Object.keys(spec).forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) {
        throw new TypeError('Outcome facts for ' + id + ' require ' + key);
      }
      values[key] = spec[key](source[key], 'Outcome facts.' + key);
    });
    return deepFreeze({ schema: 'EventOutcomeFactsV1', eventId: id, values: values });
  }

  function normalizeEntity(value, index) {
    if (!isPlainObject(value)) throw new TypeError('EventFrame entity ' + index + ' is required');
    exactKeys(value, ['entityId', 'role', 'transform', 'bounds', 'colliderRef',
      'appearanceRef', 'visualStateRef', 'visible', 'zIndex'], 'EventFrame entity');
    var transform = value.transform;
    if (!isPlainObject(transform)) throw new TypeError('EventFrame entity transform is required');
    exactKeys(transform, ['x', 'y', 'angle', 'scaleX', 'scaleY'], 'EventFrame transform');
    var bounds = value.bounds;
    if (!isPlainObject(bounds)) throw new TypeError('EventFrame entity bounds are required');
    exactKeys(bounds, ['left', 'top', 'width', 'height', 'right', 'bottom'], 'EventFrame bounds');
    var left = finite(bounds.left, 'bounds.left');
    var top = finite(bounds.top, 'bounds.top');
    var width = finite(bounds.width, 'bounds.width', 0);
    var height = finite(bounds.height, 'bounds.height', 0);
    var right = left + width;
    var bottom = top + height;
    if (bounds.right != null && Math.abs(finite(bounds.right, 'bounds.right') - right) > 1e-7) {
      throw new Error('EventFrame bounds.right is not authoritative');
    }
    if (bounds.bottom != null && Math.abs(finite(bounds.bottom, 'bounds.bottom') - bottom) > 1e-7) {
      throw new Error('EventFrame bounds.bottom is not authoritative');
    }
    return {
      entityId: requiredString(value.entityId, 'entityId', 128),
      role: requiredString(value.role, 'entity role', 64),
      transform: {
        x: finite(transform.x, 'transform.x'), y: finite(transform.y, 'transform.y'),
        angle: finite(transform.angle, 'transform.angle'),
        scaleX: finite(transform.scaleX == null ? 1 : transform.scaleX, 'transform.scaleX'),
        scaleY: finite(transform.scaleY == null ? 1 : transform.scaleY, 'transform.scaleY'),
      },
      bounds: { left: left, top: top, width: width, height: height,
        right: right, bottom: bottom },
      colliderRef: value.colliderRef == null ? null : requiredString(value.colliderRef, 'colliderRef', 128),
      appearanceRef: requiredString(value.appearanceRef, 'appearanceRef', 160),
      visualStateRef: value.visualStateRef == null ? null
        : requiredString(value.visualStateRef, 'visualStateRef', 160),
      visible: value.visible !== false,
      zIndex: whole(value.zIndex == null ? 0 : value.zIndex, 'zIndex', -100000, 100000),
    };
  }

  function normalizeFrame(value, expected) {
    if (!isPlainObject(value)) throw new TypeError('EventFrameV1 is required');
    exactKeys(value, ['schema', 'eventId', 'eventClass', 'laneId', 'sequence', 'entities',
      'cues', 'reducedMotion'], 'EventFrameV1');
    var expectedValue = expected || {};
    var id = eventId(value.eventId == null ? expectedValue.eventId : value.eventId);
    var kind = eventClass(value.eventClass == null ? expectedValue.eventClass : value.eventClass);
    var laneId = requiredString(value.laneId == null ? expectedValue.laneId : value.laneId,
      'EventFrame laneId', 96);
    if (expectedValue.eventId != null && id !== expectedValue.eventId) throw new Error('EventFrame eventId mismatch');
    if (expectedValue.eventClass != null && kind !== expectedValue.eventClass) throw new Error('EventFrame eventClass mismatch');
    if (expectedValue.laneId != null && laneId !== expectedValue.laneId) throw new Error('EventFrame laneId mismatch');
    if (!Array.isArray(value.entities)) throw new TypeError('EventFrame entities are required');
    var entities = value.entities.map(normalizeEntity);
    var ids = entities.map(function (entity) { return entity.entityId; });
    if (new Set(ids).size !== ids.length) throw new Error('EventFrame entity IDs must be unique');
    var cues = value.cues == null ? [] : copyData(value.cues, 'EventFrame cues');
    if (!Array.isArray(cues)) throw new TypeError('EventFrame cues must be an array');
    return deepFreeze({ schema: 'EventFrameV1', eventId: id, eventClass: kind, laneId: laneId,
      sequence: whole(value.sequence == null ? 0 : value.sequence, 'EventFrame sequence', 0),
      entities: entities, cues: cues, reducedMotion: value.reducedMotion === true });
  }

  function mechanicsSignature(frame) {
    var normalized = frame && frame.schema === 'EventFrameV1' ? frame : normalizeFrame(frame);
    return JSON.stringify(normalized.entities.map(function (entity) {
      return [entity.entityId, entity.role, entity.transform, entity.bounds, entity.colliderRef,
        entity.appearanceRef, entity.visible, entity.zIndex];
    }));
  }

  return Object.freeze({
    schema: 'FlipgameEventKernelV1', EVENT_CLASSES: EVENT_CLASSES,
    RESOURCE_KINDS: RESOURCE_KINDS, FACT_SPECS: FACT_SPECS,
    immutableData: immutableData, deepFreeze: deepFreeze,
    assertNoRuleEffects: assertNoRuleEffects,
    definePack: definePack, validatePack: validatePack,
    createEventRng: createEventRng, normalizeSelection: normalizeSelection,
    createResourceScope: createResourceScope, validateBehavior: validateBehavior,
    normalizeTelegraph: normalizeTelegraph, normalizeQualification: normalizeQualification,
    normalizeDirective: normalizeDirective, normalizeContact: normalizeContact,
    normalizeLandingProbe: normalizeLandingProbe, normalizeOutcomeFacts: normalizeOutcomeFacts,
    normalizeFrame: normalizeFrame, mechanicsSignature: mechanicsSignature,
  });
});
