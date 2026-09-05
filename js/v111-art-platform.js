// v111-art-platform.js — paint-only vector art registry for v111 objects.
//
// This file deliberately has no dependency on Matter.js or the game state. It
// turns immutable object/variant descriptions into lazy RenderVariant painters
// that can be used by setup previews and the gameplay renderer.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipArtV111 = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function () {
  'use strict';

  var ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  var PHYSICS_KEYS = ['physics', 'body', 'hitbox', 'mass', 'collision', 'collisionEnvelope'];
  var objects = new Map();
  var renderVariantCache = new Map();

  function own(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function positive(value, label) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new TypeError(label + ' must be a positive finite number');
    }
    return value;
  }

  function stableId(value, label) {
    var id = String(value == null ? '' : value);
    if (!ID_RE.test(id)) {
      throw new TypeError(label + ' must use lowercase kebab-case');
    }
    return id;
  }

  function cloneAndFreeze(value) {
    if (!value || typeof value !== 'object') return value;
    var copy;
    if (Array.isArray(value)) {
      copy = value.map(cloneAndFreeze);
    } else {
      copy = {};
      Object.keys(value).forEach(function (key) {
        copy[key] = cloneAndFreeze(value[key]);
      });
    }
    return Object.freeze(copy);
  }

  function normalizedMetrics(input) {
    var src = input || {};
    var vb = src.viewBox || {};
    var viewBox = {
      x: finite(vb.x, 0),
      y: finite(vb.y, 0),
      width: positive(vb.width, 'metrics.viewBox.width'),
      height: positive(vb.height, 'metrics.viewBox.height'),
    };
    var boundsSrc = src.bounds || {};
    var bounds = {
      x: finite(boundsSrc.x, viewBox.x),
      y: finite(boundsSrc.y, viewBox.y),
      width: positive(boundsSrc.width, 'metrics.bounds.width'),
      height: positive(boundsSrc.height, 'metrics.bounds.height'),
    };
    var pivotSrc = src.pivot || {};
    var pivot = {
      x: finite(pivotSrc.x, viewBox.x + viewBox.width / 2),
      y: finite(pivotSrc.y, viewBox.y + viewBox.height / 2),
    };
    var baselineY = finite(src.baselineY, NaN);

    if (!Number.isFinite(baselineY)) {
      throw new TypeError('metrics.baselineY must be a finite number');
    }
    if (bounds.x < viewBox.x || bounds.y < viewBox.y ||
        bounds.x + bounds.width > viewBox.x + viewBox.width ||
        bounds.y + bounds.height > viewBox.y + viewBox.height) {
      throw new RangeError('metrics.bounds must stay inside metrics.viewBox');
    }
    if (baselineY < bounds.y || baselineY > bounds.y + bounds.height) {
      throw new RangeError('metrics.baselineY must cross metrics.bounds');
    }
    if (pivot.x < viewBox.x || pivot.x > viewBox.x + viewBox.width ||
        pivot.y < viewBox.y || pivot.y > viewBox.y + viewBox.height) {
      throw new RangeError('metrics.pivot must stay inside metrics.viewBox');
    }

    return cloneAndFreeze({
      viewBox: viewBox,
      bounds: bounds,
      pivot: pivot,
      baselineY: baselineY,
    });
  }

  function rejectPhysicsFields(definition) {
    PHYSICS_KEYS.forEach(function (key) {
      if (own(definition, key)) {
        throw new TypeError('Vector art definitions cannot declare physics field "' + key + '"');
      }
    });
  }

  // ObjectDefinition:
  //   { id, label, metrics, variants[], buildVariant(variant, object) }
  // buildVariant is intentionally lazy and returns either a paint function or
  // { paint(ctx, state) }. The function is first called when that variant is
  // requested for rendering, never when its object is registered.
  function registerObject(definition) {
    if (!definition || typeof definition !== 'object') {
      throw new TypeError('registerObject requires an object definition');
    }
    rejectPhysicsFields(definition);
    var id = stableId(definition.id, 'object id');
    if (objects.has(id)) throw new Error('Art object already registered: ' + id);
    if (typeof definition.buildVariant !== 'function') {
      throw new TypeError('Art object ' + id + ' requires buildVariant()');
    }
    if (!Array.isArray(definition.variants) || definition.variants.length < 1) {
      throw new TypeError('Art object ' + id + ' requires at least one variant');
    }

    var seen = new Set();
    var variants = definition.variants.map(function (raw, index) {
      if (!raw || typeof raw !== 'object') {
        throw new TypeError('Variant ' + index + ' for ' + id + ' must be an object');
      }
      rejectPhysicsFields(raw);
      var localId = stableId(raw.id, 'variant id');
      if (seen.has(localId)) throw new Error('Duplicate variant id for ' + id + ': ' + localId);
      seen.add(localId);
      return cloneAndFreeze({
        id: localId,
        canonicalId: id + '.' + localId,
        label: String(raw.label || localId),
        color: String(raw.color || ''),
        tokens: raw.tokens || {},
        order: index,
      });
    });

    var publicDefinition = Object.freeze({
      id: id,
      label: String(definition.label || id),
      metrics: normalizedMetrics(definition.metrics),
      variants: Object.freeze(variants),
    });
    objects.set(id, {
      publicDefinition: publicDefinition,
      buildVariant: definition.buildVariant,
    });
    return publicDefinition;
  }

  function getObject(objectId) {
    var entry = objects.get(String(objectId || ''));
    return entry ? entry.publicDefinition : null;
  }

  function listObjects() {
    return Array.from(objects.values()).map(function (entry) {
      return entry.publicDefinition;
    });
  }

  function variantFor(entry, objectId, requestedId) {
    var raw = String(requestedId || '');
    var prefix = objectId + '.';
    var localId = raw.indexOf(prefix) === 0 ? raw.slice(prefix.length) : raw;
    for (var i = 0; i < entry.publicDefinition.variants.length; i++) {
      if (entry.publicDefinition.variants[i].id === localId) {
        return entry.publicDefinition.variants[i];
      }
    }
    return null;
  }

  // RenderVariant is the stable runtime art interface consumed by renderers:
  //   { id, objectId, variantId, label, color, metrics, renderLocal(ctx, state) }
  function getRenderVariant(objectId, variantId) {
    var id = String(objectId || '');
    var entry = objects.get(id);
    if (!entry) throw new Error('Unknown art object: ' + id);
    var variant = variantFor(entry, id, variantId);
    if (!variant) throw new Error('Unknown variant for ' + id + ': ' + variantId);
    var key = variant.canonicalId;
    if (renderVariantCache.has(key)) return renderVariantCache.get(key);

    var built = entry.buildVariant(variant, entry.publicDefinition);
    var paint = typeof built === 'function' ? built : built && built.paint;
    if (typeof paint !== 'function') {
      throw new TypeError('buildVariant() for ' + key + ' must return a paint function');
    }
    var renderVariant = Object.freeze({
      id: key,
      objectId: id,
      variantId: variant.id,
      label: variant.label,
      color: variant.color,
      metrics: entry.publicDefinition.metrics,
      renderLocal: function (ctx, state) { return paint(ctx, state || {}); },
    });
    renderVariantCache.set(key, renderVariant);
    return renderVariant;
  }

  function assertContext(ctx) {
    if (!ctx || typeof ctx.save !== 'function' || typeof ctx.restore !== 'function' ||
        typeof ctx.translate !== 'function' || typeof ctx.scale !== 'function') {
      throw new TypeError('A CanvasRenderingContext2D-compatible context is required');
    }
  }

  function render(ctx, request) {
    assertContext(ctx);
    var req = request || {};
    var mode = req.mode === 'preview' ? 'preview' : (req.mode === 'gameplay' ? 'gameplay' : null);
    if (!mode) throw new TypeError('render mode must be "preview" or "gameplay"');
    var variant = getRenderVariant(req.objectId, req.variantId);
    var metrics = variant.metrics;
    var state = {
      mode: mode,
      time: Math.max(0, finite(req.time, 0)),
      reducedMotion: !!req.reducedMotion,
      selected: !!req.selected,
    };

    ctx.save();
    try {
      if (mode === 'gameplay') {
        var gameScale = positive(req.scale == null ? 1 : req.scale, 'gameplay scale');
        ctx.translate(finite(req.x, 0), finite(req.y, 0));
        if (typeof ctx.rotate === 'function') ctx.rotate(finite(req.angle, 0));
        ctx.scale(gameScale, gameScale);
        ctx.translate(-metrics.pivot.x, -metrics.pivot.y);
      } else {
        var box = req.box || {};
        var x = finite(box.x, 0);
        var y = finite(box.y, 0);
        var width = positive(box.width == null
          ? (ctx.canvas && ctx.canvas.width) || metrics.viewBox.width
          : box.width, 'preview box width');
        var height = positive(box.height == null
          ? (ctx.canvas && ctx.canvas.height) || metrics.viewBox.height
          : box.height, 'preview box height');
        var padding = Math.max(0, Math.min(0.45, finite(req.padding, 0.08)));
        var innerWidth = width * (1 - padding * 2);
        var innerHeight = height * (1 - padding * 2);
        var previewScale = Math.min(innerWidth / metrics.bounds.width,
          innerHeight / metrics.bounds.height);
        var drawWidth = metrics.bounds.width * previewScale;
        var drawHeight = metrics.bounds.height * previewScale;
        ctx.translate(
          x + (width - drawWidth) / 2 - metrics.bounds.x * previewScale,
          y + (height - drawHeight) / 2 - metrics.bounds.y * previewScale
        );
        ctx.scale(previewScale, previewScale);
      }
      variant.renderLocal(ctx, state);
    } finally {
      ctx.restore();
    }
    return variant;
  }

  function renderPreview(ctx, request) {
    var req = {};
    Object.keys(request || {}).forEach(function (key) { req[key] = request[key]; });
    req.mode = 'preview';
    return render(ctx, req);
  }

  function renderGameplay(ctx, request) {
    var req = {};
    Object.keys(request || {}).forEach(function (key) { req[key] = request[key]; });
    req.mode = 'gameplay';
    return render(ctx, req);
  }

  function clearRenderCache(objectId) {
    if (objectId == null) {
      renderVariantCache.clear();
      return;
    }
    var prefix = String(objectId) + '.';
    Array.from(renderVariantCache.keys()).forEach(function (key) {
      if (key.indexOf(prefix) === 0) renderVariantCache.delete(key);
    });
  }

  function cacheInfo() {
    return Object.freeze({
      objectsRegistered: objects.size,
      variantsBuilt: renderVariantCache.size,
      keys: Object.freeze(Array.from(renderVariantCache.keys())),
    });
  }

  return Object.freeze({
    contractVersion: 1,
    registerObject: registerObject,
    getObject: getObject,
    listObjects: listObjects,
    getRenderVariant: getRenderVariant,
    render: render,
    renderPreview: renderPreview,
    renderGameplay: renderGameplay,
    clearRenderCache: clearRenderCache,
    cacheInfo: cacheInfo,
  });
});
