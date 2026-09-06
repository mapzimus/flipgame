'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const Art = require(path.join(root, 'js', 'v111-art-platform.js'));
const Manifest = require(path.join(root, 'js', 'v111-object-manifest.js'));
const Pack = require(path.join(root, 'js', 'v111-art-pack-b.js'));

const EXPECTED_OBJECT_IDS = [
  'desk-globe',
  'microphone-stand',
  'potted-plants',
  'penguin',
  'owl',
  'giraffe',
  'red-panda',
  'trophy-cup',
];
const EXPECTED_LOCAL_VARIANTS = [
  'blue-steel',
  'sucker-punch',
  'lime-light',
  'orange-crush',
  'grape-expectations',
  'ice-ice-baby',
  'apple-solutely',
  'berry-nice',
  'making-waves',
  'lemon-aid',
  'very-cherry',
  'pink-fluff',
];
const CANONICAL_MAPPING = {
  viewBox: { x: 0, y: 0, width: 300, height: 420 },
  pivot: { x: 150, y: 323.2972972973 },
  baselineY: 376,
  artScale: 0.74,
  localContactOffset: 39,
};

function fakeContext() {
  const calls = [];
  const ctx = {
    canvas: { width: 300, height: 420 },
    calls,
    save() { calls.push(['save']); },
    restore() { calls.push(['restore']); },
    translate(...args) { calls.push(['translate', ...args]); },
    rotate(...args) { calls.push(['rotate', ...args]); },
    scale(...args) { calls.push(['scale', ...args]); },
    beginPath() { calls.push(['beginPath']); },
    closePath() { calls.push(['closePath']); },
    moveTo(...args) { calls.push(['moveTo', ...args]); },
    lineTo(...args) { calls.push(['lineTo', ...args]); },
    quadraticCurveTo(...args) { calls.push(['quadraticCurveTo', ...args]); },
    bezierCurveTo(...args) { calls.push(['bezierCurveTo', ...args]); },
    ellipse(...args) { calls.push(['ellipse', ...args]); },
    arc(...args) { calls.push(['arc', ...args]); },
    fill() { calls.push(['fill']); },
    stroke() { calls.push(['stroke']); },
    createLinearGradient(...args) {
      calls.push(['createLinearGradient', ...args]);
      return {
        addColorStop(...stopArgs) { calls.push(['addColorStop', ...stopArgs]); },
      };
    },
  };
  return ctx;
}

function manifestObject(objectId) {
  return Manifest.objects.find((object) => object.id === objectId);
}

function expectedCanonicalIds(objectId) {
  return EXPECTED_LOCAL_VARIANTS.map((variantId) => `${objectId}.${variantId}`);
}

function geometricSignature(calls) {
  return JSON.stringify(calls.filter((call) => [
    'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'ellipse', 'arc',
    'translate', 'rotate',
  ].includes(call[0])));
}

function roundedGeometrySignature(calls) {
  return JSON.stringify(calls.filter((call) => [
    'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'ellipse', 'arc',
  ].includes(call[0])).map((call) => call.map((value) => (
    typeof value === 'number' ? Math.round(value * 1000) / 1000 : value
  ))));
}

function testCatalogAndManifestCompatibility() {
  assert.equal(Art.cacheInfo().variantsBuilt, 0,
    'loading the shard must register metadata without building painters');
  assert.deepEqual(Array.from(Pack.objectIds), EXPECTED_OBJECT_IDS);
  assert.equal(Pack.definitions.length, 8);
  assert.equal(Pack.variantIds.length, 96);
  assert.equal(new Set(Pack.variantIds).size, 96);

  EXPECTED_OBJECT_IDS.forEach((objectId, objectIndex) => {
    const source = manifestObject(objectId);
    const definition = Art.getObject(objectId);
    assert.ok(source, `${objectId} must exist in the object manifest`);
    assert.ok(definition, `${objectId} must be registered in FlipArtV111`);
    assert.strictEqual(Pack.definitions[objectIndex], definition);
    assert.equal(definition.label, source.displayName);
    assert.equal(definition.variants.length, 12);
    assert.deepEqual(definition.variants.map(({ id }) => id), EXPECTED_LOCAL_VARIANTS);
    assert.deepEqual(definition.variants.map(({ canonicalId }) => canonicalId), expectedCanonicalIds(objectId));
    assert.deepEqual(
      definition.variants.map(({ canonicalId }) => canonicalId),
      source.variants.map(({ id }) => id),
      `${objectId} canonical IDs must match the manifest`,
    );
    definition.variants.forEach((variant, variantIndex) => {
      const sourceVariant = source.variants[variantIndex];
      assert.equal(variant.label, sourceVariant.displayName);
      assert.equal(variant.color, sourceVariant.color);
      assert.equal(variant.tokens.castIndex, variantIndex);
      assert.equal(variant.tokens.castLabel, sourceVariant.castLabel);
      assert.equal(variant.tokens.silhouette, sourceVariant.silhouette);
      assert.equal(variant.tokens.finish, sourceVariant.finish);
      assert.deepEqual(variant.tokens.dynamicArt, source.dynamicArt);
      assert.deepEqual(variant.tokens.material, source.material);
      assert.ok(Object.isFrozen(variant));
      assert.ok(Object.isFrozen(variant.tokens));
    });
    assert.ok(Object.isFrozen(definition));
    assert.ok(Object.isFrozen(definition.variants));
  });

  const plants = Art.getObject('potted-plants');
  assert.deepEqual(
    plants.variants.map((variant) => variant.tokens.castLabel),
    ['Succulent', 'Cactus', 'Fern', 'Sunflower', 'Orchid', 'Bonsai',
      'Snake Plant', 'Monstera', 'Aloe', 'Flytrap', 'Palm', 'Flowering Vine'],
    'all twelve potted-plant casts must remain distinct and in manifest order',
  );
}

function testCanonicalBoundsAndContactMapping() {
  EXPECTED_OBJECT_IDS.forEach((objectId) => {
    const metrics = Art.getObject(objectId).metrics;
    assert.deepEqual(metrics.viewBox, CANONICAL_MAPPING.viewBox);
    assert.deepEqual(metrics.pivot, CANONICAL_MAPPING.pivot);
    assert.equal(metrics.baselineY, CANONICAL_MAPPING.baselineY);
    assert.equal(metrics.artScale, CANONICAL_MAPPING.artScale);
    assert.equal(metrics.localContactOffset, CANONICAL_MAPPING.localContactOffset);
    assert.equal(metrics.bounds.y + metrics.bounds.height, metrics.baselineY,
      `${objectId} bounds must terminate on the shared baseline`);
    assert.ok(metrics.bounds.x >= metrics.viewBox.x);
    assert.ok(metrics.bounds.y >= metrics.viewBox.y);
    assert.ok(metrics.bounds.x + metrics.bounds.width <= metrics.viewBox.width);
    assert.ok(metrics.bounds.y + metrics.bounds.height <= metrics.viewBox.height);
    assert.ok(Math.abs(Art.getLocalContactOffset(metrics) - 39) < 1e-9);
  });
}

function testLazyPainterBuilds() {
  Art.clearRenderCache();
  assert.equal(Art.cacheInfo().variantsBuilt, 0);
  EXPECTED_OBJECT_IDS.forEach((objectId, index) => {
    const local = Art.getRenderVariant(objectId, 'blue-steel');
    assert.equal(local.id, `${objectId}.blue-steel`);
    assert.equal(Art.cacheInfo().variantsBuilt, index + 1);
    assert.strictEqual(local, Art.getRenderVariant(objectId, `${objectId}.blue-steel`));
    assert.equal(Art.cacheInfo().variantsBuilt, index + 1,
      'canonical and local lookups must share one lazy cache entry');
  });
  assert.deepEqual(Array.from(Art.cacheInfo().keys),
    EXPECTED_OBJECT_IDS.map((objectId) => `${objectId}.blue-steel`));
}

function testAllNinetySixVariantsPaint() {
  Art.clearRenderCache();
  Pack.variantIds.forEach((canonicalId) => {
    const objectId = canonicalId.slice(0, canonicalId.indexOf('.'));
    const ctx = fakeContext();
    const result = Art.renderPreview(ctx, {
      objectId,
      variantId: canonicalId,
      box: { x: 0, y: 0, width: 240, height: 336 },
      time: 0.75,
      reducedMotion: true,
    });
    assert.equal(result.id, canonicalId);
    const visibleCalls = ctx.calls.filter((call) => call[0] === 'fill' || call[0] === 'stroke');
    assert.ok(visibleCalls.length >= 8, `${canonicalId} must produce substantial vector paint`);
    ctx.calls.forEach((call) => {
      call.slice(1).filter((value) => typeof value === 'number').forEach((value) => {
        assert.ok(Number.isFinite(value), `${canonicalId} emitted a non-finite canvas coordinate`);
      });
    });
  });
  assert.equal(Art.cacheInfo().variantsBuilt, 96);
}

function testEveryCastHasDistinctGeometry() {
  EXPECTED_OBJECT_IDS.forEach((objectId) => {
    const signatures = EXPECTED_LOCAL_VARIANTS.map((variantId) => {
      const ctx = fakeContext();
      Art.getRenderVariant(objectId, variantId).renderLocal(ctx, {
        mode: 'preview', time: 0, reducedMotion: true,
      });
      return geometricSignature(ctx.calls);
    });
    assert.equal(new Set(signatures).size, 12,
      `${objectId} must have twelve structurally distinct authored casts`);
  });
}

function testDynamicArtAndReducedMotionFallbacks() {
  EXPECTED_OBJECT_IDS.forEach((objectId) => {
    const variant = Art.getRenderVariant(objectId, 'blue-steel');
    const animated = fakeContext();
    const reduced = fakeContext();
    variant.renderLocal(animated, { mode: 'gameplay', time: 0.83, reducedMotion: false });
    variant.renderLocal(reduced, { mode: 'gameplay', time: 0.83, reducedMotion: true });
    assert.notEqual(geometricSignature(animated.calls), geometricSignature(reduced.calls),
      `${objectId} must animate decorative geometry and provide a fixed reduced-motion pose`);
  });
}

function testDeskGlobeGeographyRotationAndFaceContract() {
  const contract = Pack.deskGlobe;
  assert.ok(contract);
  assert.equal(contract.projection, 'orthographic');
  assert.equal(contract.geography.source, 'Natural Earth ne_110m_land');
  assert.equal(contract.geography.license, 'public-domain');
  assert.equal(contract.geography.ringCount, 65);
  assert.equal(contract.face, null);
  assert.equal(contract.supportsEmotion, false);
  assert.ok(Object.isFrozen(contract));
  assert.ok(Object.isFrozen(contract.geography));

  const globe = Art.getRenderVariant('desk-globe', 'blue-steel');
  const quarterViews = [0, 0.25, 0.5, 0.75].map((fraction) => {
    const ctx = fakeContext();
    globe.renderLocal(ctx, {
      mode: 'gameplay',
      time: contract.rotationPeriodSeconds * fraction,
      angle: 0,
      impact: 0,
      reducedMotion: false,
    });
    return roundedGeometrySignature(ctx.calls);
  });
  assert.equal(new Set(quarterViews).size, 4,
    'quarter rotations must expose four distinct geographic views');

  const fullTurn = fakeContext();
  globe.renderLocal(fullTurn, {
    mode: 'gameplay', time: contract.rotationPeriodSeconds,
    angle: 0, impact: 0, reducedMotion: false,
  });
  assert.equal(roundedGeometrySignature(fullTurn.calls), quarterViews[0],
    'one deterministic period must return to the same geographic view');

  const tipped = fakeContext();
  globe.renderLocal(tipped, {
    mode: 'gameplay', time: 0, angle: 1.1, impact: 0, reducedMotion: false,
  });
  assert.notEqual(roundedGeometrySignature(tipped.calls), quarterViews[0],
    'sphere must counterspin in response to host-object rotation');

  const reducedA = fakeContext();
  const reducedB = fakeContext();
  globe.renderLocal(reducedA, { mode: 'gameplay', time: 1, reducedMotion: true });
  globe.renderLocal(reducedB, { mode: 'gameplay', time: 999, reducedMotion: true });
  assert.equal(roundedGeometrySignature(reducedA.calls), roundedGeometrySignature(reducedB.calls),
    'reduced-motion globe must hold a stable longitude');

}

function testDeskGlobePerformanceAndOfflineSource() {
  const source = fs.readFileSync(path.join(root, 'js', 'v111-art-pack-b.js'), 'utf8');
  const packed = source.match(/DESK_GLOBE_LAND_PACKED = '([^']+)'/);
  assert.ok(packed && packed[1].length > 4500,
    'desk globe must contain substantial embedded geographic linework');
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/,
    'desk globe cannot require a runtime network request');

  const globe = Art.getRenderVariant('desk-globe', 'blue-steel');
  const ctx = fakeContext();
  const started = process.hrtime.bigint();
  for (let frame = 0; frame < 240; frame += 1) {
    ctx.calls.length = 0;
    globe.renderLocal(ctx, {
      mode: 'gameplay', time: frame / 60, angle: frame * 0.015,
      impact: frame % 31 === 0 ? 0.6 : 0, reducedMotion: false,
    });
  }
  const elapsedMilliseconds = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(elapsedMilliseconds < 2500,
    `desk globe 240-frame paint budget exceeded: ${elapsedMilliseconds.toFixed(1)}ms`);
}

function testPaintOnlyVectorSource() {
  const source = fs.readFileSync(path.join(root, 'js', 'v111-art-pack-b.js'), 'utf8');
  const executable = source
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(executable, /\b(?:Matter|Engine|Bodies|Body)\b/);
  assert.doesNotMatch(executable, /\b(?:physics|hitbox|mass|collisionEnvelope)\s*:/);
  assert.doesNotMatch(executable, /\b(?:drawImage|createImageBitmap|fillText|strokeText)\s*\(/,
    'the shard must contain authored vector paths rather than raster or glyph art');
}

function testBrowserGlobals() {
  const context = vm.createContext({ console, Map, Set, Math, Number, Object, Array, String });
  ['v111-art-platform.js', 'v111-object-manifest.js', 'v111-art-pack-b.js'].forEach((filename) => {
    vm.runInContext(fs.readFileSync(path.join(root, 'js', filename), 'utf8'), context, { filename });
  });
  assert.ok(context.FlipArtV111PackB);
  assert.equal(context.FlipArtV111PackB.objectIds.length, 8);
  assert.equal(context.FlipArtV111PackB.variantIds.length, 96);
  assert.equal(context.FlipArtV111.cacheInfo().variantsBuilt, 0);
  const ctx = fakeContext();
  const rendered = context.FlipArtV111.renderGameplay(ctx, {
    objectId: 'potted-plants',
    variantId: 'potted-plants.pink-fluff',
    x: 320,
    y: 410,
    angle: 0.35,
    time: 1.2,
    reducedMotion: false,
  });
  assert.equal(rendered.id, 'potted-plants.pink-fluff');
  assert.ok(ctx.calls.some((call) => call[0] === 'fill'));
  assert.ok(ctx.calls.some((call) => call[0] === 'translate' && call[1] === 320 && call[2] === 410));
  assert.ok(ctx.calls.some((call) => call[0] === 'rotate' && call[1] === 0.35));
  assert.ok(ctx.calls.some((call) => call[0] === 'scale' && call[1] === 0.74 && call[2] === 0.74));
}

testCatalogAndManifestCompatibility();
testCanonicalBoundsAndContactMapping();
testLazyPainterBuilds();
testAllNinetySixVariantsPaint();
testEveryCastHasDistinctGeometry();
testDynamicArtAndReducedMotionFallbacks();
testDeskGlobeGeographyRotationAndFaceContract();
testDeskGlobePerformanceAndOfflineSource();
testPaintOnlyVectorSource();
testBrowserGlobals();

console.log('v111 art pack B tests passed (8 objects, 96 variants).');
