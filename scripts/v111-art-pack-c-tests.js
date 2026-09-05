'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const Art = require(path.join(root, 'js', 'v111-art-platform.js'));
const Manifest = require(path.join(root, 'js', 'v111-object-manifest.js'));
const Pack = require(path.join(root, 'js', 'v111-art-pack-c.js'));

const EXPECTED_OBJECT_IDS = [
  'snow-globe',
  'eyeball-monster',
  'soda-can',
  'watering-can',
  'pinata',
  'huge-rubber-duck',
  'action-figures',
  'tall-buildings',
  'box-of-snacks',
];

const EXPECTED_OBJECTS = Manifest.objects.filter((object) =>
  EXPECTED_OBJECT_IDS.includes(object.id));
const EXPECTED_IDS = EXPECTED_OBJECTS.flatMap((object) =>
  object.variants.map((variant) => variant.id));

function fakeContext(width = 300, height = 420) {
  const calls = [];
  const ctx = {
    canvas: { width, height },
    calls,
    save() { calls.push(['save']); },
    restore() { calls.push(['restore']); },
    translate(x, y) { calls.push(['translate', x, y]); },
    rotate(angle) { calls.push(['rotate', angle]); },
    scale(x, y) { calls.push(['scale', x, y]); },
    beginPath() { calls.push(['beginPath']); },
    closePath() { calls.push(['closePath']); },
    moveTo(x, y) { calls.push(['moveTo', x, y]); },
    lineTo(x, y) { calls.push(['lineTo', x, y]); },
    quadraticCurveTo(cpx, cpy, x, y) {
      calls.push(['quadraticCurveTo', cpx, cpy, x, y]);
    },
    bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
      calls.push(['bezierCurveTo', cp1x, cp1y, cp2x, cp2y, x, y]);
    },
    ellipse(x, y, rx, ry, rotation, start, end, counterclockwise) {
      calls.push(['ellipse', x, y, rx, ry, rotation, start, end, !!counterclockwise]);
    },
    arc(x, y, radius, start, end, counterclockwise) {
      calls.push(['arc', x, y, radius, start, end, !!counterclockwise]);
    },
    fill() { calls.push(['fill']); },
    stroke() { calls.push(['stroke']); },
    fillRect(x, y, widthValue, heightValue) {
      calls.push(['fillRect', x, y, widthValue, heightValue]);
    },
    createLinearGradient(x0, y0, x1, y1) {
      calls.push(['createLinearGradient', x0, y0, x1, y1]);
      return {
        addColorStop(offset) { calls.push(['addColorStop', offset]); },
      };
    },
  };
  return ctx;
}

function geometrySignature(calls) {
  const geometry = new Set([
    'translate', 'rotate', 'scale', 'moveTo', 'lineTo', 'quadraticCurveTo',
    'bezierCurveTo', 'ellipse', 'arc', 'fillRect',
  ]);
  return JSON.stringify(calls.filter((call) => geometry.has(call[0])));
}

function renderSignature(objectId, variantId, options = {}) {
  const ctx = fakeContext();
  Art.renderPreview(ctx, {
    objectId,
    variantId,
    time: options.time == null ? 0.75 : options.time,
    reducedMotion: !!options.reducedMotion,
    box: { x: 0, y: 0, width: 300, height: 420 },
  });
  return { ctx, signature: geometrySignature(ctx.calls) };
}

function testCatalogAndManifestParity() {
  assert.deepEqual(Array.from(Pack.objectIds), EXPECTED_OBJECT_IDS);
  assert.equal(Pack.definitions.length, 9);
  assert.equal(Pack.variantIds.length, 108);
  assert.deepEqual(Array.from(Pack.variantIds), EXPECTED_IDS);
  assert.equal(new Set(Pack.variantIds).size, 108);

  EXPECTED_OBJECTS.forEach((manifestObject) => {
    const definition = Art.getObject(manifestObject.id);
    assert.ok(definition, manifestObject.id + ' must be registered');
    assert.equal(definition.label, manifestObject.displayName);
    assert.equal(definition.variants.length, 12);
    assert.ok(Object.isFrozen(definition));
    assert.ok(Object.isFrozen(definition.metrics));
    assert.ok(Object.isFrozen(definition.variants));

    definition.variants.forEach((variant, index) => {
      const expected = manifestObject.variants[index];
      assert.equal(variant.id, expected.variantId);
      assert.equal(variant.canonicalId, expected.id);
      assert.equal(variant.label, expected.label);
      assert.equal(variant.color, expected.color);
      assert.equal(variant.tokens.castLabel, expected.castLabel);
      assert.equal(variant.tokens.silhouette, expected.silhouette);
      assert.equal(variant.tokens.finish, expected.finish);
      assert.equal(variant.tokens.castIndex, index);
      assert.ok(Object.isFrozen(variant));
      assert.ok(Object.isFrozen(variant.tokens));
    });
  });
}

function testLazyConstructionAndCache() {
  assert.deepEqual(Art.cacheInfo(), {
    objectsRegistered: 9,
    variantsBuilt: 0,
    keys: [],
  }, 'registration and catalog access must not build painters');

  const first = Art.getRenderVariant('snow-globe', 'blue-steel');
  assert.equal(Art.cacheInfo().variantsBuilt, 1);
  assert.strictEqual(first,
    Art.getRenderVariant('snow-globe', 'snow-globe.blue-steel'));
  assert.equal(Art.cacheInfo().variantsBuilt, 1,
    'local and canonical lookups must reuse one lazy painter');
  Art.clearRenderCache('snow-globe');
  assert.equal(Art.cacheInfo().variantsBuilt, 0);
}

function testCanonicalBoundsAndContactMapping() {
  Pack.definitions.forEach((definition) => {
    const metrics = definition.metrics;
    assert.deepEqual(metrics.viewBox, { x: 0, y: 0, width: 300, height: 420 });
    assert.deepEqual(metrics.pivot, { x: 150, y: 323.2972972973 });
    assert.equal(metrics.baselineY, 376);
    assert.equal(metrics.artScale, 0.74);
    assert.equal(metrics.localContactOffset, 39);
    assert.equal(metrics.bounds.y + metrics.bounds.height, metrics.baselineY,
      definition.id + ' bounds must terminate at the canonical baseline');
    assert.ok(metrics.bounds.x >= 0 && metrics.bounds.y >= 0);
    assert.ok(metrics.bounds.x + metrics.bounds.width <= 300);
    assert.ok(metrics.bounds.y + metrics.bounds.height <= 420);
    assert.ok(Math.abs(Art.getLocalContactOffset(metrics) - 39) < 1e-9);
  });
}

function testEveryVariantPaintsAndEveryCastHasDistinctGeometry() {
  Art.clearRenderCache();
  EXPECTED_OBJECTS.forEach((object) => {
    const signatures = new Set();
    object.variants.forEach((variant) => {
      const { ctx, signature } = renderSignature(object.id, variant.id, { time: 0.91 });
      const paintCount = ctx.calls.filter((call) =>
        call[0] === 'fill' || call[0] === 'stroke' || call[0] === 'fillRect').length;
      assert.ok(paintCount >= 8, variant.id + ' must produce substantial vector paint');
      assert.ok(ctx.calls.some((call) => call[0] === 'beginPath' || call[0] === 'fillRect'),
        variant.id + ' must construct Canvas 2D geometry');
      signatures.add(signature);
    });
    assert.equal(signatures.size, 12,
      object.id + ' must have 12 visibly distinct authored cast geometries');
  });
  assert.equal(Art.cacheInfo().variantsBuilt, 108);
}

function testDynamicArtAndReducedMotionFallbacks() {
  const movingVariant = {
    'snow-globe': 'blue-steel',
    'eyeball-monster': 'blue-steel',
    'soda-can': 'blue-steel',
    'watering-can': 'blue-steel',
    pinata: 'blue-steel',
    'huge-rubber-duck': 'blue-steel',
    'action-figures': 'blue-steel',
    'tall-buildings': 'grape-expectations',
    'box-of-snacks': 'blue-steel',
  };

  EXPECTED_OBJECT_IDS.forEach((objectId) => {
    const variantId = movingVariant[objectId];
    const normalA = renderSignature(objectId, variantId, { time: 0.15 }).signature;
    const normalB = renderSignature(objectId, variantId, { time: 2.35 }).signature;
    assert.notEqual(normalA, normalB, objectId + ' must expose authored time-based art');

    const reducedA = renderSignature(objectId, variantId,
      { time: 0.15, reducedMotion: true }).signature;
    const reducedB = renderSignature(objectId, variantId,
      { time: 200, reducedMotion: true }).signature;
    assert.equal(reducedA, reducedB,
      objectId + ' reduced-motion art must be a stable, visible final pose');
  });
}

function testPreviewAndGameplayShareRenderVariants() {
  EXPECTED_OBJECT_IDS.forEach((objectId, index) => {
    const localId = Manifest.flavorOrder[index % 12].id;
    const preview = fakeContext(200, 280);
    const previewVariant = Art.renderPreview(preview, {
      objectId,
      variantId: localId,
      box: { x: 5, y: 7, width: 190, height: 266 },
      time: 1,
      reducedMotion: true,
    });
    const gameplay = fakeContext();
    const gameplayVariant = Art.renderGameplay(gameplay, {
      objectId,
      variantId: objectId + '.' + localId,
      x: 321,
      y: 407,
      angle: 0.61,
      reducedMotion: true,
    });
    assert.strictEqual(previewVariant, gameplayVariant);
    assert.ok(preview.calls.some((call) => call[0] === 'scale'));
    assert.ok(gameplay.calls.some((call) =>
      call[0] === 'translate' && call[1] === 321 && call[2] === 407));
    assert.ok(gameplay.calls.some((call) =>
      call[0] === 'rotate' && call[1] === 0.61));
    assert.ok(gameplay.calls.some((call) =>
      call[0] === 'scale' && call[1] === 0.74 && call[2] === 0.74));
  });
}

function testPaintOnlySourceAndPublicMetadata() {
  const source = fs.readFileSync(path.join(root, 'js', 'v111-art-pack-c.js'), 'utf8');
  const executable = source
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(executable,
    /\b(?:Matter|Engine|Bodies|Path2D|ImageBitmap|OffscreenCanvas)\b|\bdrawImage\s*\(|\bnew\s+Image\s*\(/,
    'pack C must remain Canvas 2D vector art with no engine or raster dependency');
  assert.doesNotMatch(executable,
    /\b(?:mass|friction|frictionAir|restitution|density|inertia|hitbox|collisionEnvelope)\s*:/,
    'pack C must not declare object-specific tuning fields');
  assert.doesNotMatch(executable, /\b(?:fillText|strokeText)\s*\(/,
    'package/sign art must remain generic and brand-free, without text marks');

  Pack.definitions.forEach((definition) => {
    const forbidden = [
      'physics', 'body', 'hitbox', 'mass', 'collision', 'collisionEnvelope',
      'friction', 'restitution', 'density', 'inertia',
    ];
    forbidden.forEach((key) => {
      assert.equal(Object.prototype.hasOwnProperty.call(definition, key), false,
        definition.id + ' must not publish ' + key);
    });
  });
}

function testHeadlessBrowserRegistration() {
  const context = vm.createContext({
    console, Map, Set, Math, Number, Object, Array, String, JSON,
  });
  ['v111-art-platform.js', 'v111-object-manifest.js', 'v111-art-pack-c.js']
    .forEach((filename) => {
      vm.runInContext(fs.readFileSync(path.join(root, 'js', filename), 'utf8'),
        context, { filename });
    });
  assert.ok(context.FlipArtV111);
  assert.ok(context.FLIP_V111_OBJECT_MANIFEST);
  assert.ok(context.FlipArtV111PackC);
  assert.equal(context.FlipArtV111PackC.variantIds.length, 108);
  assert.equal(context.FlipArtV111.cacheInfo().variantsBuilt, 0);

  const ctx = fakeContext();
  const rendered = context.FlipArtV111.renderPreview(ctx, {
    objectId: 'box-of-snacks',
    variantId: 'pink-fluff',
    reducedMotion: true,
  });
  assert.equal(rendered.id, 'box-of-snacks.pink-fluff');
  assert.ok(ctx.calls.some((call) => call[0] === 'fill'));
  assert.equal(context.FlipArtV111.cacheInfo().variantsBuilt, 1);
}

testCatalogAndManifestParity();
testLazyConstructionAndCache();
testCanonicalBoundsAndContactMapping();
testEveryVariantPaintsAndEveryCastHasDistinctGeometry();
testDynamicArtAndReducedMotionFallbacks();
testPreviewAndGameplayShareRenderVariants();
testPaintOnlySourceAndPublicMetadata();
testHeadlessBrowserRegistration();

console.log('v111 art pack C tests passed: 9 objects, 108 authored variants.');
