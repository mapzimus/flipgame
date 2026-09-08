// v112-event-kernel.js -- bounded, renderer-free contracts for v1.12 events.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV112EventKernel = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function () {
  'use strict';

  var LIMITS = Object.freeze({ dataDepth: 12, dataNodes: 2048, objectKeys: 96,
    arrayItems: 512, stringLength: 2048, packIds: 12, resources: 256,
    entities: 128, cues: 32, directiveItems: 128, rngSamples: 1000000,
    rngChannelLength: 64, contacts: 256, errors: 16 });
  var EVENT_CLASSES = Object.freeze(['hazard', 'wildcard', 'assist']);
  var RESOURCE_KINDS = Object.freeze([
    'body', 'sensor', 'constraint', 'audio', 'camera', 'override', 'callback',
  ]);
  var RESOURCE_KIND_SET = Object.create(null);
  RESOURCE_KINDS.forEach(function (kind) { RESOURCE_KIND_SET[kind] = true; });
  var DANGEROUS_KEYS = Object.freeze({ '__proto__': true, prototype: true, constructor: true });
  var RESOURCE_OWNERS = new WeakMap();

  var EVENT_CLASS_BY_ID = Object.freeze(Object.assign(Object.create(null), {
    'rainbow-corkscrew': 'assist', 'half-full': 'assist', 'power-launch': 'assist',
    'fizz-jet': 'hazard', 'golden-flip': 'assist', 'bouncy-bottle': 'hazard',
    earthquake: 'hazard', 'moon-gravity': 'wildcard', 'ice-slide': 'hazard',
    'alien-invasion': 'wildcard', 'gravity-slam': 'hazard', trampoline: 'assist',
    'wind-tunnel': 'hazard', 'shrink-ray': 'wildcard', 'portal-pair': 'wildcard',
    'tether-swing': 'wildcard', mitosis: 'assist', 'double-flip': 'wildcard',
    'ceiling-flip': 'hazard', 'meteor-shower': 'hazard', magnet: 'assist',
    'heart-rush': 'assist', 'black-hole': 'hazard', boomerang: 'wildcard',
    'roulette-table': 'wildcard', rewind: 'assist', plinko: 'wildcard',
    'mirror-match': 'wildcard', 'cap-toss': 'hazard', 'life-drain': 'assist',
  }));
  var EVENT_IDS = Object.freeze(Object.keys(EVENT_CLASS_BY_ID));

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    try {
      var proto = Object.getPrototypeOf(value);
      return proto === Object.prototype || proto === null;
    } catch (_) { return false; }
  }

  function primitiveString(value, label, maximum, allowEmpty) {
    if (typeof value !== 'string') throw new TypeError(label + ' must be a string primitive');
    var text = value.trim();
    if (!allowEmpty && !text) throw new TypeError(label + ' is required');
    if (text.length > maximum) throw new RangeError(label + ' exceeds ' + maximum + ' characters');
    return text;
  }

  function safeReason(value, fallback, maximum) {
    var limit = maximum == null ? 160 : maximum;
    var text = typeof value === 'string' ? value : (typeof fallback === 'string' ? fallback : 'cleanup');
    text = text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    if (!text) text = typeof fallback === 'string' && fallback ? fallback : 'cleanup';
    return text.slice(0, limit);
  }

  function safeThrown(value, phase) {
    var name = 'Error';
    var message = 'Non-Error value thrown';
    if (typeof value === 'string') message = value.slice(0, 320);
    else if (value && (typeof value === 'object' || typeof value === 'function')) {
      try {
        var ownName = Object.getOwnPropertyDescriptor(value, 'name');
        if (ownName && Object.prototype.hasOwnProperty.call(ownName, 'value') &&
            typeof ownName.value === 'string') name = ownName.value.slice(0, 80);
      } catch (_) { name = 'Error'; }
      try {
        var ownMessage = Object.getOwnPropertyDescriptor(value, 'message');
        if (ownMessage && Object.prototype.hasOwnProperty.call(ownMessage, 'value') &&
            typeof ownMessage.value === 'string') message = ownMessage.value.slice(0, 320);
        else if (value instanceof Error && typeof value.message === 'string') {
          message = value.message.slice(0, 320);
          if (typeof value.name === 'string') name = value.name.slice(0, 80);
        }
      } catch (_) { message = 'Unreadable thrown value'; }
    }
    return Object.freeze({ phase: safeReason(phase, 'unknown', 80), name: name, message: message });
  }

  function finite(value, label, minimum, maximum) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError(label + ' must be a finite number primitive');
    }
    if (minimum != null && value < minimum) throw new RangeError(label + ' is below its minimum');
    if (maximum != null && value > maximum) throw new RangeError(label + ' exceeds its maximum');
    return value;
  }

  function whole(value, label, minimum, maximum) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
      throw new TypeError(label + ' must be a safe integer primitive');
    }
    if (minimum != null && value < minimum) throw new RangeError(label + ' is below its minimum');
    if (maximum != null && value > maximum) throw new RangeError(label + ' exceeds its maximum');
    return value;
  }

  function deepFreeze(value, seen) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    var visited = seen || new WeakSet();
    if (visited.has(value)) return value;
    visited.add(value);
    Object.keys(value).forEach(function (key) { deepFreeze(value[key], visited); });
    return Object.freeze(value);
  }

  function safeOwnKeys(value, label) {
    var keys;
    try { keys = Reflect.ownKeys(value); }
    catch (_) { throw new TypeError(label + ' keys are unreadable'); }
    if (keys.length > LIMITS.objectKeys) throw new RangeError(label + ' has too many fields');
    keys.forEach(function (key) {
      if (typeof key !== 'string') throw new TypeError(label + ' cannot contain symbol fields');
      if (key.length > 128) throw new RangeError(label + ' contains an overlong field name');
      if (DANGEROUS_KEYS[key]) throw new TypeError(label + ' contains unsafe field: ' + key);
      var descriptor;
      try { descriptor = Object.getOwnPropertyDescriptor(value, key); }
      catch (_) { throw new TypeError(label + '.' + key + ' is unreadable'); }
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        throw new TypeError(label + '.' + key + ' cannot be an accessor');
      }
    });
    return keys;
  }

  function ancestorHas(chain, value) {
    var cursor = chain;
    while (cursor) {
      if (cursor.value === value) return true;
      cursor = cursor.parent;
    }
    return false;
  }

  function copyData(value, label, state, depth, ancestors) {
    var where = label || 'value';
    var budget = state || { nodes: 0 };
    var level = depth || 0;
    if (level > LIMITS.dataDepth) throw new RangeError(where + ' exceeds the data depth limit');
    budget.nodes += 1;
    if (budget.nodes > LIMITS.dataNodes) throw new RangeError(where + ' exceeds the data node limit');
    if (value == null || typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      if (value.length > LIMITS.stringLength) throw new RangeError(where + ' contains an overlong string');
      return value;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new TypeError(where + ' contains a non-finite number');
      return value;
    }
    if (typeof value !== 'object') throw new TypeError(where + ' must contain data only');
    if (ancestorHas(ancestors, value)) throw new TypeError(where + ' cannot be cyclic');
    var chain = { value: value, parent: ancestors || null };
    if (Array.isArray(value)) {
      if (value.length > LIMITS.arrayItems) throw new RangeError(where + ' has too many items');
      return value.map(function (entry, index) {
        return copyData(entry, where + '[' + index + ']', budget, level + 1, chain);
      });
    }
    if (!isPlainObject(value)) throw new TypeError(where + ' must use plain data objects');
    var result = Object.create(null);
    safeOwnKeys(value, where).forEach(function (key) {
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      result[key] = copyData(descriptor.value, where + '.' + key, budget, level + 1, chain);
    });
    return result;
  }

  function immutableData(value, label) { return deepFreeze(copyData(value, label)); }

  function exactKeys(value, allowed, label) {
    safeOwnKeys(value, label || 'value').forEach(function (key) {
      if (allowed.indexOf(key) < 0) throw new TypeError((label || 'value') + ' has unsupported field: ' + key);
    });
  }

  function eventId(value) {
    var id = primitiveString(value, 'eventId', 64, false);
    if (!Object.prototype.hasOwnProperty.call(EVENT_CLASS_BY_ID, id)) {
      throw new TypeError('Unknown canonical eventId: ' + id);
    }
    return id;
  }

  function eventClass(value) {
    var result = primitiveString(value, 'eventClass', 16, false);
    if (EVENT_CLASSES.indexOf(result) < 0) throw new TypeError('Unsupported eventClass: ' + result);
    return result;
  }

  function assertNoAmbientRandom(fn, label) {
    if (typeof fn !== 'function') throw new TypeError(label + ' must be a function');
    var source;
    try { source = Function.prototype.toString.call(fn); }
    catch (_) { throw new TypeError(label + ' source is not inspectable'); }
    if (/\[native code\]/.test(source)) throw new Error(label + ' must use inspectable authored code');
    if (/\bMath\s*\.\s*random\b/.test(source) ||
        /\bMath\s*\[\s*['"]random['"]\s*\]/.test(source)) {
      throw new Error(label + ' cannot use ambient random');
    }
    if (/^\s*async\b/.test(source)) throw new Error(label + ' cannot be async');
    return fn;
  }

  function thenableState(value) {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) return { thenable: false };
    try { return { thenable: typeof value.then === 'function' }; }
    catch (_) { return { thenable: true, unreadable: true }; }
  }

  function callSynchronous(fn, thisValue, args, label) {
    assertNoAmbientRandom(fn, label);
    var original = Math.random;
    var replaced = false;
    try {
      Math.random = function () { throw new Error(label + ' attempted ambient random'); };
      replaced = Math.random !== original;
    } catch (_) { replaced = false; }
    var result;
    try { result = fn.apply(thisValue, args || []); }
    finally {
      if (replaced) {
        try { Math.random = original; } catch (_) { /* static guard remains authoritative */ }
      }
    }
    if (thenableState(result).thenable) throw new TypeError(label + ' must complete synchronously');
    return result;
  }

  function definePack(input) {
    if (!isPlainObject(input)) throw new TypeError('EventPackV1 definition is required');
    exactKeys(input, ['schema', 'eventClass', 'ids', 'create'], 'EventPackV1');
    if (input.schema != null && input.schema !== 'EventPackV1') throw new TypeError('Invalid EventPackV1 schema');
    var kind = eventClass(input.eventClass);
    if (!Array.isArray(input.ids) || !input.ids.length || input.ids.length > LIMITS.packIds) {
      throw new TypeError('EventPackV1 requires a bounded ID list');
    }
    var ids = input.ids.map(eventId);
    if (new Set(ids).size !== ids.length) throw new TypeError('EventPackV1 ids must be unique');
    ids.forEach(function (id) {
      if (EVENT_CLASS_BY_ID[id] !== kind) throw new Error(id + ' belongs to the ' + EVENT_CLASS_BY_ID[id] + ' pack');
    });
    assertNoAmbientRandom(input.create, 'EventPackV1.create');
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
    var kind = eventClass(value.eventClass);
    if (!Array.isArray(value.ids) || !value.ids.length || value.ids.length > LIMITS.packIds) {
      throw new TypeError('Invalid EventPackV1 ids');
    }
    var ids = value.ids.map(eventId);
    if (new Set(ids).size !== ids.length) throw new TypeError('Invalid EventPackV1 ids');
    ids.forEach(function (id) {
      if (EVENT_CLASS_BY_ID[id] !== kind) throw new Error('EventPackV1 class authority mismatch for ' + id);
    });
    assertNoAmbientRandom(value.create, 'EventPackV1.create');
    return value;
  }

  function mix32(value) {
    var x = value >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }
  function hashText(value) {
    var text = primitiveString(value, 'RNG channel', LIMITS.rngChannelLength, true);
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
    function channel(value) { return value == null ? 'default' : primitiveString(value,
      'RNG channel', LIMITS.rngChannelLength, true); }
    function sample(index, channelValue) {
      var position = whole(index, 'RNG sample index', 0, LIMITS.rngSamples - 1);
      return mix32(seed ^ hashText(channel(channelValue)) ^ Math.imul(position + 1, 0x9e3779b9));
    }
    function nextUint32(channelValue) {
      if (counter >= LIMITS.rngSamples) throw new RangeError('Event RNG sample budget exhausted');
      var value = sample(counter, channelValue); counter += 1; return value;
    }
    function nextFloat(channelValue) { return nextUint32(channelValue) / 0x100000000; }
    function nextInt(maxExclusive, channelValue) {
      var maximum = whole(maxExclusive, 'RNG maximum', 1, 0x100000000);
      return Math.floor(nextFloat(channelValue) * maximum);
    }
    function range(minimum, maximum, channelValue) {
      var low = finite(minimum, 'RNG range minimum');
      var high = finite(maximum, 'RNG range maximum');
      if (!(high > low)) throw new RangeError('RNG range maximum must exceed its minimum');
      return low + (high - low) * nextFloat(channelValue);
    }
    function snapshot() { return Object.freeze({ schema: 'EventRngSnapshotV1', seed: seed, counter: counter }); }
    return Object.freeze({ schema: 'EventRngV1', seed: seed, sampleUint32: sample,
      nextUint32: nextUint32, nextFloat: nextFloat, nextInt: nextInt,
      range: range, snapshot: snapshot });
  }

  function normalizeCue(value, label) {
    if (!isPlainObject(value)) throw new TypeError(label + ' must be a cue object');
    exactKeys(value, ['cueId', 'kind', 'entityRef', 'intensity', 'durationMs',
      'textRef', 'ariaCue'], label);
    return deepFreeze({ cueId: primitiveString(value.cueId, label + '.cueId', 96, false),
      kind: value.kind == null ? null : primitiveString(value.kind, label + '.kind', 48, false),
      entityRef: value.entityRef == null ? null : primitiveString(value.entityRef,
        label + '.entityRef', 128, false),
      intensity: value.intensity == null ? 1 : finite(value.intensity, label + '.intensity', 0, 1),
      durationMs: value.durationMs == null ? 0 : whole(value.durationMs,
        label + '.durationMs', 0, 30000),
      textRef: value.textRef == null ? null : primitiveString(value.textRef, label + '.textRef', 160, false),
      ariaCue: value.ariaCue == null ? null : primitiveString(value.ariaCue, label + '.ariaCue', 240, false) });
  }
  function normalizeCues(value, label) {
    if (value == null) return Object.freeze([]);
    if (!Array.isArray(value) || value.length > LIMITS.cues) throw new TypeError(label + ' must be a bounded cue array');
    return Object.freeze(value.map(function (cue, index) { return normalizeCue(cue, label + '[' + index + ']'); }));
  }
  function normalizeTelegraph(value) {
    if (!isPlainObject(value)) throw new TypeError('EventTelegraphV1 is required');
    exactKeys(value, ['schema', 'title', 'instruction', 'glyph', 'durationMs', 'cues'], 'EventTelegraphV1');
    if (value.schema != null && value.schema !== 'EventTelegraphV1') throw new TypeError('Invalid EventTelegraphV1 schema');
    return deepFreeze({ schema: 'EventTelegraphV1',
      title: primitiveString(value.title, 'telegraph title', 96, false),
      instruction: primitiveString(value.instruction, 'telegraph instruction', 240, false),
      glyph: value.glyph == null ? null : primitiveString(value.glyph, 'telegraph glyph', 64, false),
      durationMs: whole(value.durationMs == null ? 900 : value.durationMs, 'telegraph duration', 0, 30000),
      cues: normalizeCues(value.cues, 'telegraph cues') });
  }

  function normalizeSelection(value, expectedId, expectedClass) {
    if (!isPlainObject(value) || value.schema !== 'EventSelectionV2') throw new TypeError('EventSelectionV2 is required');
    exactKeys(value, ['schema', 'eventId', 'displayName', 'eventClass', 'turnSeed',
      'eventSeed', 'oddsProfile', 'forced', 'testData', 'consumed', 'telegraph'], 'EventSelectionV2');
    var id = eventId(value.eventId);
    var kind = eventClass(value.eventClass);
    if (id !== expectedId || kind !== expectedClass || EVENT_CLASS_BY_ID[id] !== kind) {
      throw new Error('Event selection does not match canonical pack authority');
    }
    whole(value.turnSeed, 'turnSeed', 0, 0xffffffff);
    var seed = whole(value.eventSeed, 'eventSeed', 0, 0xffffffff) >>> 0;
    if (value.consumed !== false) throw new Error('Consumed event selections cannot be rebound');
    if (typeof value.forced !== 'boolean' || typeof value.testData !== 'boolean') {
      throw new TypeError('EventSelectionV2 flags must be boolean');
    }
    return deepFreeze({ schema: 'BoundEventSelectionV1', eventId: id,
      displayName: primitiveString(value.displayName, 'event displayName', 96, false),
      eventClass: kind, eventSeed: seed,
      oddsProfile: primitiveString(value.oddsProfile, 'event oddsProfile', 48, false),
      forced: value.forced, testData: value.testData, consumed: false,
      telegraph: normalizeTelegraph(value.telegraph) });
  }

  function createResourceScope(laneValue) {
    var laneId = primitiveString(laneValue, 'laneId', 96, false);
    var token = Object.freeze({});
    var records = [];
    var byKey = Object.create(null);
    var cleaned = false;
    var cleaning = false;
    var cleanupResult = null;

    function own(kindValue, idValue, resource, disposer) {
      if (cleaned) throw new Error('Event resource scope is already cleaned');
      if (records.length >= LIMITS.resources) throw new RangeError('Event resource limit exceeded');
      var kind = primitiveString(kindValue, 'resource kind', 24, false);
      if (!RESOURCE_KIND_SET[kind]) throw new TypeError('Unsupported event resource kind: ' + kind);
      var id = primitiveString(idValue, 'resource id', 96, false);
      if (id.indexOf(':') >= 0) throw new TypeError('resource id cannot contain a colon');
      var key = kind + ':' + id;
      if (byKey[key]) throw new Error('Duplicate lane resource: ' + key);
      if ((typeof resource !== 'object' || resource === null) && typeof resource !== 'function') {
        throw new TypeError('Event resource must be an object or function');
      }
      var laneDescriptor;
      try { laneDescriptor = Object.getOwnPropertyDescriptor(resource, 'laneId'); }
      catch (_) { throw new TypeError('Event resource lane ownership is unreadable'); }
      if (laneDescriptor && (!Object.prototype.hasOwnProperty.call(laneDescriptor, 'value') ||
          typeof laneDescriptor.value !== 'string' || laneDescriptor.value !== laneId)) {
        throw new Error('Cross-lane event resource rejected: ' + key);
      }
      var prior = RESOURCE_OWNERS.get(resource);
      if (prior && prior.token !== token) throw new Error('Event resource is already owned by another scope');
      if (prior) throw new Error('The same event resource cannot be owned twice in one lane');
      assertNoAmbientRandom(disposer, 'event resource disposer');
      var record = { token: token, kind: kind, id: id, key: key,
        resource: resource, disposer: disposer, released: false };
      RESOURCE_OWNERS.set(resource, record);
      byKey[key] = record;
      records.push(record);
      return resource;
    }
    function method(kind) { return function (id, resource, disposer) { return own(kind, id, resource, disposer); }; }
    function getResource(reference, allowedKinds) {
      var ref = primitiveString(reference, 'resourceRef', 128, false);
      var parts = ref.split(':');
      if (parts.length !== 2 || !RESOURCE_KIND_SET[parts[0]]) {
        throw new TypeError('resourceRef must use a scoped kind:<id> reference');
      }
      if (allowedKinds && allowedKinds.indexOf(parts[0]) < 0) {
        throw new TypeError('resourceRef has an incompatible resource kind');
      }
      var record = byKey[ref];
      if (!record || record.released || RESOURCE_OWNERS.get(record.resource) !== record) {
        throw new Error('Resource is not owned by this event lane: ' + ref);
      }
      return record.resource;
    }
    function getCollider(reference) { return getResource(reference, ['body', 'sensor']); }
    function ownsResource(reference, allowedKinds) {
      try { getResource(reference, allowedKinds); return true; }
      catch (_) { return false; }
    }
    function snapshot() {
      var counts = Object.create(null);
      RESOURCE_KINDS.forEach(function (kind) { counts[kind] = 0; });
      var ids = [];
      records.forEach(function (record) {
        if (!record.released) { counts[record.kind] += 1; ids.push(record.key); }
      });
      return deepFreeze({ schema: 'EventResourceScopeSnapshotV1', laneId: laneId,
        cleaned: cleaned, active: ids.length, counts: counts, resourceIds: ids });
    }
    function cleanup(reasonValue) {
      if (cleanupResult) return cleanupResult;
      if (cleaning) return Object.freeze({ schema: 'EventResourceCleanupV1', laneId: laneId,
        reason: 'reentrant-cleanup', released: Object.freeze([]), errors: Object.freeze([]),
        droppedErrors: 0, clean: false, inProgress: true });
      var reason = safeReason(reasonValue, 'cleanup', 160);
      cleaning = true;
      cleaned = true;
      var errors = [];
      var droppedErrors = 0;
      var released = [];
      try {
        for (var index = records.length - 1; index >= 0; index -= 1) {
          var record = records[index];
          if (record.released) continue;
          record.released = true;
          try {
            callSynchronous(record.disposer, null, [record.resource,
              Object.freeze({ schema: 'EventResourceDisposalV1', laneId: laneId,
                kind: record.kind, resourceId: record.id, reason: reason })], 'event resource disposer');
          } catch (error) {
            if (errors.length < LIMITS.errors) errors.push(safeThrown(error, 'resource.dispose'));
            else droppedErrors += 1;
          } finally {
            if (RESOURCE_OWNERS.get(record.resource) === record) RESOURCE_OWNERS.delete(record.resource);
            released.push(record.key);
          }
        }
        cleanupResult = deepFreeze({ schema: 'EventResourceCleanupV1', laneId: laneId,
          reason: reason, released: released, errors: errors, droppedErrors: droppedErrors,
          clean: errors.length === 0 && droppedErrors === 0 });
        return cleanupResult;
      } finally { cleaning = false; }
    }
    return Object.freeze({ schema: 'EventResourceScopeV1', laneId: laneId,
      own: own, ownBody: method('body'), ownSensor: method('sensor'),
      ownConstraint: method('constraint'), ownAudio: method('audio'),
      ownCamera: method('camera'), ownOverride: method('override'),
      ownCallback: method('callback'), getResource: getResource,
      getCollider: getCollider, ownsResource: ownsResource,
      snapshot: snapshot, cleanup: cleanup });
  }

  var BEHAVIOR_METHODS = Object.freeze([
    'telegraph', 'qualifyLaunch', 'launch', 'step', 'contact', 'evaluate', 'frame', 'cleanup',
  ]);
  function validateBehavior(value) {
    if (!value || typeof value !== 'object' || !Object.isFrozen(value)) {
      throw new TypeError('EventBehaviorV1 must be an immutable object');
    }
    var wrapped = {};
    BEHAVIOR_METHODS.forEach(function (name) {
      var method = value[name];
      if (typeof method !== 'function') throw new TypeError('EventBehaviorV1.' + name + ' is required');
      assertNoAmbientRandom(method, 'EventBehaviorV1.' + name);
      wrapped[name] = function () {
        return callSynchronous(method, value, Array.prototype.slice.call(arguments),
          'EventBehaviorV1.' + name);
      };
    });
    return Object.freeze(wrapped);
  }

  function normalizeQualification(value) {
    if (!isPlainObject(value)) throw new TypeError('EventLaunchQualificationV1 is required');
    exactKeys(value, ['schema', 'qualified', 'reason'], 'EventLaunchQualificationV1');
    if (value.schema != null && value.schema !== 'EventLaunchQualificationV1') {
      throw new TypeError('Invalid EventLaunchQualificationV1 schema');
    }
    if (typeof value.qualified !== 'boolean') throw new TypeError('qualified must be boolean');
    return deepFreeze({ schema: 'EventLaunchQualificationV1', qualified: value.qualified,
      reason: value.reason == null ? null : primitiveString(value.reason, 'qualification reason', 160, false) });
  }
  function vector(value, label) {
    if (!isPlainObject(value)) throw new TypeError(label + ' is required');
    exactKeys(value, ['x', 'y'], label);
    return { x: finite(value.x, label + '.x', -1000000000, 1000000000),
      y: finite(value.y, label + '.y', -1000000000, 1000000000) };
  }
  function normalizeLaunchSignal(value) {
    if (!isPlainObject(value)) throw new TypeError('EventLaunchSignalV1 is required');
    exactKeys(value, ['schema', 'dx', 'dy', 'vx', 'vy', 'power', 'direction', 'spin', 'elapsedMs'],
      'EventLaunchSignalV1');
    if (value.schema !== 'EventLaunchSignalV1') throw new TypeError('Invalid EventLaunchSignalV1 schema');
    return deepFreeze({ schema: 'EventLaunchSignalV1', dx: finite(value.dx, 'signal.dx'),
      dy: finite(value.dy, 'signal.dy'), vx: finite(value.vx, 'signal.vx'),
      vy: finite(value.vy, 'signal.vy'), power: finite(value.power, 'signal.power', 0, 1),
      direction: finite(value.direction, 'signal.direction', -1, 1),
      spin: finite(value.spin, 'signal.spin', -1000, 1000),
      elapsedMs: finite(value.elapsedMs, 'signal.elapsedMs', 0, 60000) });
  }
  function normalizeLaunchDraft(value) {
    if (!isPlainObject(value)) throw new TypeError('EventLaunchDraftV1 is required');
    exactKeys(value, ['schema', 'bodyRef', 'position', 'velocity', 'angle', 'angularVelocity'],
      'EventLaunchDraftV1');
    if (value.schema !== 'EventLaunchDraftV1') throw new TypeError('Invalid EventLaunchDraftV1 schema');
    return deepFreeze({ schema: 'EventLaunchDraftV1',
      bodyRef: primitiveString(value.bodyRef, 'launch bodyRef', 128, false),
      position: vector(value.position, 'launch position'), velocity: vector(value.velocity, 'launch velocity'),
      angle: finite(value.angle, 'launch angle'),
      angularVelocity: finite(value.angularVelocity, 'launch angularVelocity', -1000, 1000) });
  }
  function normalizeStep(value) {
    if (!isPlainObject(value)) throw new TypeError('EventPhysicsStepV1 is required');
    exactKeys(value, ['schema', 'dtMs', 'elapsedMs'], 'EventPhysicsStepV1');
    if (value.schema !== 'EventPhysicsStepV1') throw new TypeError('Invalid EventPhysicsStepV1 schema');
    return deepFreeze({ schema: 'EventPhysicsStepV1', dtMs: finite(value.dtMs, 'step.dtMs', 0.001, 1000),
      elapsedMs: finite(value.elapsedMs, 'step.elapsedMs', 0, 600000) });
  }

  function normalizePhysicalCommand(value, label, kind) {
    if (!isPlainObject(value)) throw new TypeError(label + ' is required');
    if (kind === 'vector') {
      exactKeys(value, ['entityRef', 'x', 'y', 'atX', 'atY'], label);
      return deepFreeze({ entityRef: primitiveString(value.entityRef, label + '.entityRef', 128, false),
        x: finite(value.x, label + '.x', -1000000000, 1000000000),
        y: finite(value.y, label + '.y', -1000000000, 1000000000),
        atX: value.atX == null ? null : finite(value.atX, label + '.atX', -1000000000, 1000000000),
        atY: value.atY == null ? null : finite(value.atY, label + '.atY', -1000000000, 1000000000) });
    }
    if (kind === 'body') {
      exactKeys(value, ['entityRef', 'position', 'velocity', 'angle', 'angularVelocity',
        'mass', 'inertia', 'friction', 'restitution', 'scaleX', 'scaleY'], label);
      var result = { entityRef: primitiveString(value.entityRef, label + '.entityRef', 128, false) };
      if (value.position != null) result.position = vector(value.position, label + '.position');
      if (value.velocity != null) result.velocity = vector(value.velocity, label + '.velocity');
      if (value.angle != null) result.angle = finite(value.angle, label + '.angle', -1000000, 1000000);
      if (value.angularVelocity != null) result.angularVelocity = finite(value.angularVelocity,
        label + '.angularVelocity', -1000000, 1000000);
      ['mass', 'inertia'].forEach(function (key) {
        if (value[key] != null) result[key] = finite(value[key], label + '.' + key, 0.000001, 1000000000);
      });
      ['friction', 'restitution'].forEach(function (key) {
        if (value[key] != null) result[key] = finite(value[key], label + '.' + key, 0, 1000);
      });
      ['scaleX', 'scaleY'].forEach(function (key) {
        if (value[key] != null) result[key] = finite(value[key], label + '.' + key, -1000, 1000);
      });
      if (Object.keys(result).length === 1) throw new TypeError(label + ' contains no body update');
      return deepFreeze(result);
    }
    if (kind === 'constraint') {
      exactKeys(value, ['constraintRef', 'length', 'stiffness', 'damping', 'enabled'], label);
      var constraint = { constraintRef: primitiveString(value.constraintRef,
        label + '.constraintRef', 128, false) };
      ['length', 'stiffness', 'damping'].forEach(function (key) {
        if (value[key] != null) constraint[key] = finite(value[key], label + '.' + key, 0, 1000000000);
      });
      if (value.enabled != null) {
        if (typeof value.enabled !== 'boolean') throw new TypeError(label + '.enabled must be boolean');
        constraint.enabled = value.enabled;
      }
      if (Object.keys(constraint).length === 1) throw new TypeError(label + ' contains no constraint update');
      return deepFreeze(constraint);
    }
    exactKeys(value, ['sensorRef', 'enabled'], label);
    if (typeof value.enabled !== 'boolean') throw new TypeError(label + '.enabled must be boolean');
    return deepFreeze({ sensorRef: primitiveString(value.sensorRef, label + '.sensorRef', 128, false),
      enabled: value.enabled });
  }
  function boundedArray(value, label, mapper) {
    if (value == null) return Object.freeze([]);
    if (!Array.isArray(value) || value.length > LIMITS.directiveItems) throw new TypeError(label + ' must be a bounded array');
    return Object.freeze(value.map(mapper));
  }
  function normalizeDirective(phase, value) {
    var source = value == null ? {} : value;
    if (!isPlainObject(source)) throw new TypeError(phase + ' directive must be an object');
    exactKeys(source, ['schema', 'forces', 'impulses', 'bodies', 'constraints', 'sensors',
      'cameraCues', 'audioCues', 'presentationCues'], 'EventDirectiveV1');
    if (source.schema != null && source.schema !== 'EventDirectiveV1') throw new TypeError('Invalid EventDirectiveV1 schema');
    return deepFreeze({ schema: 'EventDirectiveV1', phase: phase,
      forces: boundedArray(source.forces, 'directive forces', function (item, index) {
        return normalizePhysicalCommand(item, 'directive forces[' + index + ']', 'vector'); }),
      impulses: boundedArray(source.impulses, 'directive impulses', function (item, index) {
        return normalizePhysicalCommand(item, 'directive impulses[' + index + ']', 'vector'); }),
      bodies: boundedArray(source.bodies, 'directive bodies', function (item, index) {
        return normalizePhysicalCommand(item, 'directive bodies[' + index + ']', 'body'); }),
      constraints: boundedArray(source.constraints, 'directive constraints', function (item, index) {
        return normalizePhysicalCommand(item, 'directive constraints[' + index + ']', 'constraint'); }),
      sensors: boundedArray(source.sensors, 'directive sensors', function (item, index) {
        return normalizePhysicalCommand(item, 'directive sensors[' + index + ']', 'sensor'); }),
      cameraCues: normalizeCues(source.cameraCues, 'directive camera cues'),
      audioCues: normalizeCues(source.audioCues, 'directive audio cues'),
      presentationCues: normalizeCues(source.presentationCues, 'directive presentation cues') });
  }

  function normalizeContact(value) {
    if (!isPlainObject(value)) throw new TypeError('ContactV1 is required');
    exactKeys(value, ['schema', 'contactId', 'phase', 'entityARef', 'entityBRef',
      'point', 'normal', 'impulse', 'elapsedMs'], 'ContactV1');
    if (value.schema !== 'ContactV1') throw new TypeError('Invalid ContactV1 schema');
    var phase = primitiveString(value.phase, 'contact phase', 16, false);
    if (['begin', 'persist', 'end'].indexOf(phase) < 0) throw new TypeError('Unsupported contact phase');
    return deepFreeze({ schema: 'ContactV1',
      contactId: primitiveString(value.contactId, 'contactId', 128, false), phase: phase,
      entityARef: primitiveString(value.entityARef, 'entityARef', 128, false),
      entityBRef: primitiveString(value.entityBRef, 'entityBRef', 128, false),
      point: vector(value.point, 'contact point'), normal: vector(value.normal, 'contact normal'),
      impulse: finite(value.impulse, 'contact impulse', 0),
      elapsedMs: finite(value.elapsedMs, 'contact elapsedMs', 0, 600000) });
  }
  function normalizeLandingProbe(value) {
    if (!isPlainObject(value)) throw new TypeError('LandingProbeV1 is required');
    exactKeys(value, ['schema', 'result', 'pose', 'reason', 'settled', 'rotations',
      'contactCount', 'bounceCount', 'elapsedMs'], 'LandingProbeV1');
    if (value.schema !== 'LandingProbeV1') throw new TypeError('Invalid LandingProbeV1 schema');
    var result = primitiveString(value.result, 'landing result', 8, false).toUpperCase();
    if (result !== 'MAKE' && result !== 'MISS') throw new TypeError('Landing result must be MAKE or MISS');
    var pose = result === 'MISS' ? 'miss' : primitiveString(value.pose, 'landing pose', 16, false).toLowerCase();
    if (result === 'MAKE' && pose !== 'upright' && pose !== 'cap') throw new TypeError('Invalid make pose');
    if (typeof value.settled !== 'boolean') throw new TypeError('Landing settled flag is required');
    return deepFreeze({ schema: 'LandingProbeV1', result: result, pose: pose,
      reason: primitiveString(value.reason, 'landing reason', 160, false), settled: value.settled,
      rotations: finite(value.rotations, 'landing rotations', 0, 100),
      contactCount: whole(value.contactCount, 'landing contact count', 0, LIMITS.contacts),
      bounceCount: whole(value.bounceCount, 'landing bounce count', 0, 100),
      elapsedMs: finite(value.elapsedMs, 'landing elapsedMs', 0, 600000) });
  }

  function numberField(minimum, maximum) { return function (value, label) {
    return finite(value, label, minimum, maximum); }; }
  function integerField(minimum, maximum) { return function (value, label) {
    return whole(value, label, minimum, maximum); }; }
  function booleanField(value, label) {
    if (typeof value !== 'boolean') throw new TypeError(label + ' must be boolean'); return value;
  }
  function stringField(value, label) { return primitiveString(value, label, 128, false); }

  var FACT_SPECS = Object.freeze(Object.assign(Object.create(null), {
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
    'tether-swing': { cableAttached: booleanField, released: booleanField, swingRadians: numberField(0, 200) },
    mitosis: { primaryColliderRef: stringField, secondaryColliderRef: stringField,
      primaryLanded: booleanField, secondaryLanded: booleanField, landedCopies: integerField(0, 2) },
    'double-flip': { rotations: numberField(0, 100) },
    'ceiling-flip': { ceilingContact: booleanField },
    'meteor-shower': { debrisContacts: integerField(0, 10000) },
    magnet: { magneticImpulse: numberField(0, 1000000) },
    'heart-rush': { pulseCount: integerField(0, 3) },
    'black-hole': { orbitRadians: numberField(0, 1000) },
    boomerang: { returnedToOrigin: booleanField, returnDistance: numberField(0, 100000) },
    'roulette-table': { wheelColliderRef: stringField, objectColliderRef: stringField,
      sectorIndex: integerField(0, 7), landingX: numberField(-100000, 100000),
      sectorLeft: numberField(-100000, 100000), sectorRight: numberField(-100000, 100000),
      wheelAngle: numberField(-100000, 100000), settled: booleanField },
    rewind: { replayCount: integerField(0, 1), correctiveImpulseApplied: booleanField },
    plinko: { objectColliderRef: stringField, slotSensorRef: stringField,
      slotIndex: integerField(0, 8), dropDurationMs: numberField(10000, 15000),
      landingX: numberField(-100000, 100000), slotLeft: numberField(-100000, 100000),
      slotRight: numberField(-100000, 100000), settled: booleanField },
    'mirror-match': { normalizedLaunchX: numberField(-4, 4), normalizedLaunchY: numberField(-4, 4),
      spin: numberField(-1000, 1000), profileSeed: integerField(0, 0xffffffff), physicsProfileId: stringField },
    'cap-toss': { bodyColliderRef: stringField, topColliderRef: stringField,
      bodyLanded: booleanField, topLanded: booleanField },
    'life-drain': { magnetAssisted: booleanField },
  }));

  function validateFactRelations(id, values) {
    if (id === 'mitosis') {
      if (values.primaryColliderRef === values.secondaryColliderRef) throw new Error('Mitosis colliders must be distinct');
      if (values.landedCopies !== Number(values.primaryLanded) + Number(values.secondaryLanded)) {
        throw new Error('Mitosis landedCopies conflicts with collider outcomes');
      }
    }
    if (id === 'cap-toss' && values.bodyColliderRef === values.topColliderRef) {
      throw new Error('Cap Toss colliders must be distinct');
    }
    if (id === 'roulette-table') {
      if (values.wheelColliderRef === values.objectColliderRef) throw new Error('Roulette colliders must be distinct');
      if (!(values.sectorRight > values.sectorLeft) || values.landingX < values.sectorLeft ||
          values.landingX > values.sectorRight || !values.settled) {
        throw new Error('Roulette landing lacks authoritative settled sector evidence');
      }
    }
    if (id === 'plinko') {
      if (values.objectColliderRef === values.slotSensorRef) throw new Error('Plinko object and slot sensor must differ');
      if (!(values.slotRight > values.slotLeft) || values.landingX < values.slotLeft ||
          values.landingX > values.slotRight || !values.settled) {
        throw new Error('Plinko landing lacks settled slot-boundary evidence');
      }
    }
  }

  function normalizeOutcomeFacts(idValue, value) {
    var id = eventId(idValue);
    var spec = FACT_SPECS[id];
    var wrapped = value && value.schema === 'EventOutcomeFactsV1';
    if (wrapped) {
      if (!isPlainObject(value)) throw new TypeError('EventOutcomeFactsV1 must be an object');
      exactKeys(value, ['schema', 'eventId', 'values'], 'EventOutcomeFactsV1');
      if (eventId(value.eventId) !== id) throw new Error('EventOutcomeFactsV1 eventId mismatch');
    }
    var source = wrapped ? value.values : value;
    if (!isPlainObject(source)) throw new TypeError('Outcome facts for ' + id + ' are required');
    exactKeys(source, Object.keys(spec), 'Outcome facts for ' + id);
    var values = Object.create(null);
    Object.keys(spec).forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) throw new TypeError('Outcome facts require ' + key);
      values[key] = spec[key](source[key], 'Outcome facts.' + key);
    });
    validateFactRelations(id, values);
    return deepFreeze({ schema: 'EventOutcomeFactsV1', eventId: id, values: values });
  }

  function normalizeBehaviorEvaluation(eventIdValue, value) {
    if (value == null) return null;
    if (!isPlainObject(value) || !Object.isFrozen(value)) {
      throw new TypeError('EventBehaviorV1.evaluate must return null or a frozen result');
    }
    exactKeys(value, ['result', 'pose', 'reason', 'facts'], 'EventBehavior evaluation');
    var result = primitiveString(value.result, 'event result', 8, false).toUpperCase();
    if (result !== 'MAKE' && result !== 'MISS') throw new TypeError('Event result must be MAKE or MISS');
    var pose = result === 'MISS' ? 'miss' : primitiveString(value.pose, 'event pose', 16, false).toLowerCase();
    if (result === 'MAKE' && pose !== 'upright' && pose !== 'cap') throw new TypeError('Invalid event make pose');
    return deepFreeze({ result: result, pose: pose,
      reason: primitiveString(value.reason, 'event result reason', 160, false),
      facts: normalizeOutcomeFacts(eventIdValue, value.facts) });
  }

  function normalizeEntity(value, index) {
    var label = 'EventFrame entity[' + index + ']';
    if (!isPlainObject(value)) throw new TypeError(label + ' is required');
    exactKeys(value, ['entityId', 'role', 'transform', 'bounds', 'colliderRef',
      'appearanceRef', 'visualStateRef', 'visible', 'zIndex'], label);
    var transform = value.transform;
    if (!isPlainObject(transform)) throw new TypeError(label + '.transform is required');
    exactKeys(transform, ['x', 'y', 'angle', 'scaleX', 'scaleY'], label + '.transform');
    var bounds = value.bounds;
    if (!isPlainObject(bounds)) throw new TypeError(label + '.bounds is required');
    exactKeys(bounds, ['left', 'top', 'width', 'height', 'right', 'bottom'], label + '.bounds');
    var left = finite(bounds.left, label + '.bounds.left', -1000000000, 1000000000);
    var top = finite(bounds.top, label + '.bounds.top', -1000000000, 1000000000);
    var width = finite(bounds.width, label + '.bounds.width', 0, 1000000000);
    var height = finite(bounds.height, label + '.bounds.height', 0, 1000000000);
    var right = left + width;
    var bottom = top + height;
    if (!Number.isFinite(right) || !Number.isFinite(bottom)) throw new RangeError(label + '.bounds overflow');
    if (bounds.right != null && Math.abs(finite(bounds.right, label + '.bounds.right') - right) > 1e-7) {
      throw new Error(label + '.bounds.right is inconsistent');
    }
    if (bounds.bottom != null && Math.abs(finite(bounds.bottom, label + '.bounds.bottom') - bottom) > 1e-7) {
      throw new Error(label + '.bounds.bottom is inconsistent');
    }
    if (typeof value.visible !== 'boolean') throw new TypeError(label + '.visible must be boolean');
    return { entityId: primitiveString(value.entityId, label + '.entityId', 128, false),
      role: primitiveString(value.role, label + '.role', 64, false),
      transform: { x: finite(transform.x, label + '.transform.x', -1000000000, 1000000000),
        y: finite(transform.y, label + '.transform.y', -1000000000, 1000000000),
        angle: finite(transform.angle, label + '.transform.angle', -1000000, 1000000),
        scaleX: finite(transform.scaleX, label + '.transform.scaleX', -1000, 1000),
        scaleY: finite(transform.scaleY, label + '.transform.scaleY', -1000, 1000) },
      bounds: { left: left, top: top, width: width, height: height, right: right, bottom: bottom },
      colliderRef: value.colliderRef == null ? null : primitiveString(value.colliderRef, label + '.colliderRef', 128, false),
      appearanceRef: primitiveString(value.appearanceRef, label + '.appearanceRef', 160, false),
      visualStateRef: value.visualStateRef == null ? null : primitiveString(value.visualStateRef,
        label + '.visualStateRef', 160, false),
      visible: value.visible,
      zIndex: whole(value.zIndex, label + '.zIndex', -100000, 100000) };
  }
  function normalizeFrame(value, expected) {
    if (!isPlainObject(value)) throw new TypeError('EventFrameV1 is required');
    exactKeys(value, ['schema', 'eventId', 'eventClass', 'laneId', 'sequence', 'entities',
      'cues', 'reducedMotion'], 'EventFrameV1');
    if (value.schema !== 'EventFrameV1') throw new TypeError('Invalid EventFrameV1 schema');
    if (typeof value.reducedMotion !== 'boolean') throw new TypeError('EventFrame reducedMotion must be boolean');
    var expect = expected || {};
    var id = eventId(value.eventId);
    var kind = eventClass(value.eventClass);
    var laneId = primitiveString(value.laneId, 'EventFrame laneId', 96, false);
    if (id !== expect.eventId || kind !== expect.eventClass || laneId !== expect.laneId) {
      throw new Error('EventFrame identity mismatch');
    }
    if (!Array.isArray(value.entities) || value.entities.length > LIMITS.entities) {
      throw new TypeError('EventFrame entities must be a bounded array');
    }
    var entities = value.entities.map(normalizeEntity);
    var ids = entities.map(function (entity) { return entity.entityId; });
    if (new Set(ids).size !== ids.length) throw new Error('EventFrame entity IDs must be unique');
    return deepFreeze({ schema: 'EventFrameV1', eventId: id, eventClass: kind, laneId: laneId,
      sequence: whole(value.sequence, 'EventFrame sequence', 0, 10000000), entities: entities,
      cues: normalizeCues(value.cues, 'EventFrame cues'), reducedMotion: value.reducedMotion === true });
  }
  function normalizeColliderSnapshot(value) {
    if (!isPlainObject(value)) throw new TypeError('ColliderSnapshotV1 is required');
    exactKeys(value, ['transform', 'bounds', 'evidence'], 'ColliderSnapshotV1');
    var entity = normalizeEntity({ entityId: 'collider-snapshot', role: 'collider',
      transform: value.transform, bounds: value.bounds, colliderRef: null,
      appearanceRef: 'collider-snapshot', visualStateRef: null, visible: false, zIndex: 0 }, 0);
    var evidence = null;
    if (value.evidence != null) {
      if (!isPlainObject(value.evidence)) throw new TypeError('ColliderSnapshotV1.evidence must be an object');
      exactKeys(value.evidence, ['settled', 'validLanding', 'pose', 'sensorActive'],
        'ColliderSnapshotV1.evidence');
      if (typeof value.evidence.settled !== 'boolean' ||
          typeof value.evidence.validLanding !== 'boolean' ||
          typeof value.evidence.sensorActive !== 'boolean') {
        throw new TypeError('ColliderSnapshotV1 evidence flags must be boolean');
      }
      var pose = primitiveString(value.evidence.pose, 'ColliderSnapshotV1 evidence pose', 16, false)
        .toLowerCase();
      if (['upright', 'cap', 'miss', 'none'].indexOf(pose) < 0) {
        throw new TypeError('ColliderSnapshotV1 evidence pose is invalid');
      }
      evidence = { settled: value.evidence.settled,
        validLanding: value.evidence.validLanding, pose: pose,
        sensorActive: value.evidence.sensorActive };
    }
    return deepFreeze({ transform: entity.transform, bounds: entity.bounds, evidence: evidence });
  }
  function mechanicsSignature(frame) {
    return JSON.stringify(frame.entities.map(function (entity) {
      return [entity.entityId, entity.role, entity.transform, entity.bounds, entity.colliderRef,
        entity.appearanceRef, entity.visualStateRef, entity.visible, entity.zIndex];
    }));
  }

  function normalizeRuntimeOutcome(value) {
    if (!isPlainObject(value)) throw new TypeError('EventRuntimeOutcomeV1 payload is required');
    exactKeys(value, ['eventId', 'eventClass', 'laneId', 'launchClaimId', 'result', 'pose',
      'reason', 'facts', 'evidence'], 'EventRuntimeOutcomeV1');
    var id = eventId(value.eventId);
    var kind = eventClass(value.eventClass);
    if (EVENT_CLASS_BY_ID[id] !== kind) throw new Error('Runtime outcome event class mismatch');
    var evidence = value.evidence;
    if (!isPlainObject(evidence)) throw new TypeError('Runtime outcome evidence is required');
    exactKeys(evidence, ['steps', 'contacts', 'elapsedMs'], 'Runtime outcome evidence');
    var result = primitiveString(value.result, 'runtime outcome result', 8, false).toUpperCase();
    if (result !== 'MAKE' && result !== 'MISS') throw new TypeError('Invalid runtime outcome result');
    var pose = result === 'MISS' ? 'miss'
      : primitiveString(value.pose, 'runtime outcome pose', 16, false).toLowerCase();
    if (result === 'MAKE' && pose !== 'upright' && pose !== 'cap') {
      throw new TypeError('Invalid runtime outcome make pose');
    }
    return deepFreeze({ schema: 'EventRuntimeOutcomeV1', eventId: id, eventClass: kind,
      laneId: primitiveString(value.laneId, 'runtime outcome laneId', 96, false),
      launchClaimId: primitiveString(value.launchClaimId, 'launchClaimId', 160, false),
      result: result, pose: pose,
      reason: primitiveString(value.reason, 'runtime outcome reason', 160, false),
      facts: normalizeOutcomeFacts(id, value.facts), evidence: {
        steps: whole(evidence.steps, 'outcome evidence steps', 1, 10000000),
        contacts: whole(evidence.contacts, 'outcome evidence contacts', 0, LIMITS.contacts),
        elapsedMs: finite(evidence.elapsedMs, 'outcome evidence elapsedMs', 0, 600000) } });
  }

  function createAuthority() {
    var frames = new WeakSet();
    var outcomes = new WeakSet();
    var runtime = Object.freeze({
      issueFrame: function (frame) {
        if (!frame || frame.schema !== 'EventFrameV1' || !Object.isFrozen(frame)) {
          throw new TypeError('Only normalized EventFrameV1 values can be issued');
        }
        frames.add(frame); return frame;
      },
      issueOutcome: function (value) { var outcome = normalizeRuntimeOutcome(value); outcomes.add(outcome); return outcome; },
    });
    return Object.freeze({ schema: 'EventAuthorityV1', runtime: runtime,
      renderer: Object.freeze({ verifyFrame: function (frame) { return frames.has(frame); } }),
      rules: Object.freeze({ verifyOutcome: function (outcome) { return outcomes.has(outcome); } }) });
  }

  return Object.freeze({ schema: 'FlipgameEventKernelV2', LIMITS: LIMITS,
    EVENT_CLASSES: EVENT_CLASSES, EVENT_IDS: EVENT_IDS,
    EVENT_CLASS_BY_ID: EVENT_CLASS_BY_ID, RESOURCE_KINDS: RESOURCE_KINDS,
    FACT_SPECS: FACT_SPECS, isPlainObject: isPlainObject,
    primitiveString: primitiveString, finite: finite, whole: whole,
    immutableData: immutableData, deepFreeze: deepFreeze, exactKeys: exactKeys,
    safeReason: safeReason, safeThrown: safeThrown,
    assertNoAmbientRandom: assertNoAmbientRandom, callSynchronous: callSynchronous,
    definePack: definePack, validatePack: validatePack,
    createEventRng: createEventRng, normalizeCue: normalizeCue, normalizeCues: normalizeCues,
    normalizeTelegraph: normalizeTelegraph, normalizeSelection: normalizeSelection,
    createResourceScope: createResourceScope, validateBehavior: validateBehavior,
    normalizeQualification: normalizeQualification, normalizeLaunchSignal: normalizeLaunchSignal,
    normalizeLaunchDraft: normalizeLaunchDraft, normalizeStep: normalizeStep,
    normalizeDirective: normalizeDirective, normalizeContact: normalizeContact,
    normalizeLandingProbe: normalizeLandingProbe, normalizeOutcomeFacts: normalizeOutcomeFacts,
    normalizeBehaviorEvaluation: normalizeBehaviorEvaluation,
    normalizeFrame: normalizeFrame, normalizeColliderSnapshot: normalizeColliderSnapshot,
    mechanicsSignature: mechanicsSignature, createAuthority: createAuthority });
});
