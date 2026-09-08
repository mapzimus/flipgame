// v112-event-renderer.js -- immutable render-plan dispatch for EventFrameV1.
// Render packs receive a frozen authoritative frame and may choose presentation
// cues, but every entity transform/bounds/appearance reference must remain exact.
(function (root, factory) {
  'use strict';
  var Kernel = root && root.FlipgameV112EventKernel;
  if (typeof module === 'object' && module.exports) Kernel = require('./v112-event-kernel.js');
  var api = factory(Kernel);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV112EventRenderer = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (Kernel) {
  'use strict';

  if (!Kernel || typeof Kernel.normalizeFrame !== 'function') {
    throw new Error('FlipgameV112EventKernel must load before v112-event-renderer.js');
  }

  function plain(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }
  function required(value, label, maximum) {
    var text = String(value == null ? '' : value).trim();
    if (!text) throw new TypeError(label + ' is required');
    if (maximum != null && text.length > maximum) throw new RangeError(label + ' is too long');
    return text;
  }
  function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
  function renderEventId(value) {
    var id = required(value, 'render eventId', 64);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new TypeError('Invalid render eventId: ' + id);
    return id;
  }

  function defineRenderPack(input) {
    if (!plain(input)) throw new TypeError('EventRenderPackV1 definition is required');
    Object.keys(input).forEach(function (key) {
      if (['schema', 'eventClass', 'ids', 'render'].indexOf(key) < 0) {
        throw new TypeError('EventRenderPackV1 has unsupported field: ' + key);
      }
    });
    if (input.schema != null && input.schema !== 'EventRenderPackV1') {
      throw new TypeError('Invalid EventRenderPackV1 schema');
    }
    if (Kernel.EVENT_CLASSES.indexOf(input.eventClass) < 0) {
      throw new TypeError('Unsupported render eventClass: ' + input.eventClass);
    }
    if (!Array.isArray(input.ids) || !input.ids.length) throw new TypeError('Render pack IDs are required');
    var ids = input.ids.map(renderEventId);
    if (new Set(ids).size !== ids.length) throw new TypeError('Render pack IDs must be unique');
    if (typeof input.render !== 'function') throw new TypeError('Render pack render function is required');
    return Object.freeze({ schema: 'EventRenderPackV1', eventClass: input.eventClass,
      ids: Object.freeze(ids.slice()), render: input.render });
  }

  function validateRenderPack(value) {
    if (!value || value.schema !== 'EventRenderPackV1' ||
        Kernel.EVENT_CLASSES.indexOf(value.eventClass) < 0 ||
        !Array.isArray(value.ids) || !value.ids.length || typeof value.render !== 'function') {
      throw new TypeError('EventRenderPackV1 is required');
    }
    if (!Object.isFrozen(value) || !Object.isFrozen(value.ids)) {
      throw new TypeError('EventRenderPackV1 and its IDs must be immutable');
    }
    Object.keys(value).forEach(function (key) {
      if (['schema', 'eventClass', 'ids', 'render'].indexOf(key) < 0) {
        throw new TypeError('EventRenderPackV1 has unsupported field: ' + key);
      }
    });
    if (new Set(value.ids.map(renderEventId)).size !== value.ids.length) {
      throw new TypeError('Render pack IDs must be unique');
    }
    return value;
  }

  function commandFromEntity(entity) {
    return {
      entityId: entity.entityId, role: entity.role,
      transform: entity.transform, bounds: entity.bounds,
      colliderRef: entity.colliderRef, appearanceRef: entity.appearanceRef,
      visualStateRef: entity.visualStateRef, visible: entity.visible, zIndex: entity.zIndex,
    };
  }

  function normalizeCommand(command, entity) {
    if (!plain(command)) throw new TypeError('Event render command must be an object');
    var allowed = ['entityId', 'role', 'transform', 'bounds', 'colliderRef',
      'appearanceRef', 'visualStateRef', 'visible', 'zIndex'];
    Object.keys(command).forEach(function (key) {
      if (allowed.indexOf(key) < 0) throw new TypeError('Event render command has unsupported field: ' + key);
    });
    var normalized = Kernel.immutableData(commandFromEntity(command), 'event render command');
    var authoritative = Kernel.immutableData(commandFromEntity(entity), 'authoritative render entity');
    if (!same(normalized, authoritative)) {
      throw new Error('Render command diverges from authoritative frame entity: ' + entity.entityId);
    }
    return normalized;
  }

  function normalizePlan(value, frame) {
    var source = value == null ? {} : value;
    if (!plain(source)) throw new TypeError('EventRenderPlanV1 must be a data object');
    Object.keys(source).forEach(function (key) {
      if (['schema', 'eventId', 'laneId', 'sequence', 'commands', 'cues', 'reducedMotion'].indexOf(key) < 0) {
        throw new TypeError('EventRenderPlanV1 has unsupported field: ' + key);
      }
    });
    Kernel.assertNoRuleEffects(source, 'event render plan');
    if (source.eventId != null && source.eventId !== frame.eventId) throw new Error('Render plan eventId mismatch');
    if (source.laneId != null && source.laneId !== frame.laneId) throw new Error('Render plan laneId mismatch');
    if (source.sequence != null && source.sequence !== frame.sequence) throw new Error('Render plan sequence mismatch');
    if (source.reducedMotion != null && source.reducedMotion !== frame.reducedMotion) {
      throw new Error('Render plan reduced-motion mismatch');
    }
    var commands = source.commands == null ? frame.entities.map(commandFromEntity) : source.commands;
    if (!Array.isArray(commands) || commands.length !== frame.entities.length) {
      throw new Error('Render plan must contain exactly one command per frame entity');
    }
    var byId = Object.create(null);
    frame.entities.forEach(function (entity) { byId[entity.entityId] = entity; });
    var seen = Object.create(null);
    var normalizedCommands = commands.map(function (command) {
      var id = required(command && command.entityId, 'render command entityId', 128);
      if (!byId[id]) throw new Error('Render command refers to an unknown entity: ' + id);
      if (seen[id]) throw new Error('Render command duplicates entity: ' + id);
      seen[id] = true;
      return normalizeCommand(command, byId[id]);
    });
    var cues = source.cues == null ? frame.cues : source.cues;
    if (!Array.isArray(cues)) throw new TypeError('Render plan cues must be an array');
    return Kernel.deepFreeze({ schema: 'EventRenderPlanV1', eventId: frame.eventId,
      laneId: frame.laneId, sequence: frame.sequence, commands: normalizedCommands,
      cues: Kernel.immutableData(cues, 'render cues'), reducedMotion: frame.reducedMotion,
      mechanicsSignature: Kernel.mechanicsSignature(frame) });
  }

  function createEventRenderer(options) {
    var source = options && typeof options === 'object' ? options : {};
    Object.keys(source).forEach(function (key) {
      if (key !== 'packs') throw new TypeError('Event renderer has unsupported option: ' + key);
    });
    if (!Array.isArray(source.packs) || !source.packs.length) {
      throw new TypeError('At least one EventRenderPackV1 is required');
    }
    var byId = Object.create(null);
    source.packs.forEach(function (value) {
      var pack = validateRenderPack(value);
      pack.ids.forEach(function (id) {
        if (byId[id]) throw new Error('Duplicate event render owner for ' + id);
        byId[id] = pack;
      });
    });

    function render(frameValue) {
      var frame = Kernel.normalizeFrame(frameValue);
      var pack = byId[frame.eventId];
      if (!pack) throw new Error('No EventRenderPackV1 owns ' + frame.eventId);
      if (pack.eventClass !== frame.eventClass) throw new Error('Render pack class does not match EventFrameV1');
      // Only this normalized frozen copy crosses the renderer boundary. A pack
      // can neither mutate the caller's authoritative object nor this copy.
      var output = pack.render(frame, Object.freeze({ schema: 'EventRenderContextV1',
        reducedMotion: frame.reducedMotion }));
      return normalizePlan(output, frame);
    }

    return Object.freeze({ schema: 'EventRendererV1', render: render });
  }

  return Object.freeze({ schema: 'FlipgameEventRendererV1',
    defineRenderPack: defineRenderPack, createEventRenderer: createEventRenderer });
});
