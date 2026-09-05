'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const Art = require(path.join(root, 'js', 'v111-art-platform.js'));
const Manifest = require(path.join(root, 'js', 'v111-object-manifest.js'));
const Reference = require(path.join(root, 'js', 'v111-art-reference.js'));
const coffeeBeforePack = Art.getObject('coffee-mug');
Art.clearRenderCache();
const Pack = require(path.join(root, 'js', 'v111-art-pack-a.js'));

const EXPECTED_OBJECT_IDS = Manifest.objects.slice(0, 8).map((object) => object.id);
const EXPECTED_VARIANT_IDS = Manifest.objects.slice(0, 8)
  .flatMap((object) => object.variants.map((variant) => variant.id));

function fakeContext() {
  const calls = [];
  const ctx = {
    canvas: { width: 300, height: 420 },
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
    quadraticCurveTo(a, b, c, d) { calls.push(['quadraticCurveTo', a, b, c, d]); },
    bezierCurveTo(a, b, c, d, e, f) { calls.push(['bezierCurveTo', a, b, c, d, e, f]); },
    ellipse(x, y, rx, ry, rotation, start, end) {
      calls.push(['ellipse', x, y, rx, ry, rotation, start, end]);
    },
    arc(x, y, radius, start, end) { calls.push(['arc', x, y, radius, start, end]); },
    fillRect(x, y, width, height) { calls.push(['fillRect', x, y, width, height]); },
    fill() { calls.push(['fill']); },
    stroke() { calls.push(['stroke']); },
    setLineDash(values) { calls.push(['setLineDash'].concat(values)); },
    createLinearGradient(x0, y0, x1, y1) {
      calls.push(['createLinearGradient', x0, y0, x1, y1]);
      return {
        addColorStop(offset, color) { calls.push(['addColorStop', offset, color]); },
      };
    },
  };
  return ctx;
}

function signature(calls) {
  return JSON.stringify(calls.map((call) => call.map((value) =>
    typeof value === 'number' ? Math.round(value * 1000) / 1000 : value)));
}

function renderLocal(objectId, variantId, time, reducedMotion) {
  const ctx = fakeContext();
  const renderVariant = Art.getRenderVariant(objectId, variantId);
  renderVariant.renderLocal(ctx, {
    mode: 'gameplay',
    time,
    reducedMotion,
    selected: false,
  });
  return { ctx, renderVariant };
}

function testPackCatalogAndCoffeeCoordination() {
  assert.equal(Pack.contractRevision, 3);
  assert.deepEqual(Array.from(Pack.objectIds), EXPECTED_OBJECT_IDS);
  assert.deepEqual(Array.from(Pack.canonicalVariantIds), EXPECTED_VARIANT_IDS);
  assert.equal(Pack.objectIds.length, 8);
  assert.equal(Pack.canonicalVariantIds.length, 96);
  assert.equal(new Set(Pack.canonicalVariantIds).size, 96);
  assert.equal(Pack.definitions.length, 8);
  assert.equal(Pack.coffeeMugSource, 'v111-art-reference');
  assert.strictEqual(Art.getObject('coffee-mug'), coffeeBeforePack,
    'Pack A must reuse, not replace or duplicate, the Coffee Mug reference');
  assert.strictEqual(Pack.definitions[0], Reference.definition);
  assert.ok(Object.isFrozen(Pack));
  assert.ok(Object.isFrozen(Pack.objectIds));
  assert.ok(Object.isFrozen(Pack.canonicalVariantIds));
}

function testRegistrationIsLazy() {
  assert.equal(Art.cacheInfo().variantsBuilt, 0,
    'loading Pack A must register metadata without constructing painters');
  assert.equal(Art.cacheInfo().objectsRegistered, 8);
}

function testManifestRegistryParityAndCanonicalMapping() {
  Manifest.objects.slice(0, 8).forEach((record, objectIndex) => {
    const definition = Art.getObject(record.id);
    assert.strictEqual(definition, Pack.definitions[objectIndex]);
    assert.equal(definition.variants.length, 12);
    assert.deepEqual(definition.variants.map((variant) => variant.canonicalId),
      record.variants.map((variant) => variant.id));
    assert.deepEqual(definition.variants.map((variant) => variant.id),
      record.variants.map((variant) => variant.variantId));
    assert.deepEqual(definition.variants.map((variant) => variant.color),
      record.variants.map((variant) => variant.color));

    const metrics = definition.metrics;
    assert.deepEqual(metrics.viewBox, { x: 0, y: 0, width: 300, height: 420 });
    assert.deepEqual(metrics.pivot, { x: 150, y: 323.2972972973 });
    assert.equal(metrics.baselineY, 376);
    assert.equal(metrics.artScale, 0.74);
    assert.equal(metrics.localContactOffset, 39);
    assert.ok(Math.abs((metrics.baselineY - metrics.pivot.y) * metrics.artScale - 39) < 1e-9);
    assert.ok(metrics.bounds.x >= metrics.viewBox.x);
    assert.ok(metrics.bounds.y >= metrics.viewBox.y);
    assert.ok(metrics.bounds.x + metrics.bounds.width <= metrics.viewBox.width);
    assert.ok(metrics.bounds.y + metrics.bounds.height <= metrics.viewBox.height);
    assert.ok(metrics.baselineY >= metrics.bounds.y);
    assert.ok(metrics.baselineY <= metrics.bounds.y + metrics.bounds.height);
  });
}

function testEveryManifestVariantPaints() {
  Art.clearRenderCache();
  EXPECTED_VARIANT_IDS.forEach((canonicalId) => {
    const split = canonicalId.lastIndexOf('.');
    const objectId = canonicalId.slice(0, split);
    const result = renderLocal(objectId, canonicalId, 1.25, false);
    assert.equal(result.renderVariant.id, canonicalId);
    assert.ok(result.ctx.calls.length >= 25, canonicalId + ' must have substantial vector detail');
    assert.ok(result.ctx.calls.some((call) => call[0] === 'fill'), canonicalId + ' must fill shapes');
    assert.ok(result.ctx.calls.some((call) => call[0] === 'stroke'), canonicalId + ' must outline shapes');
    assert.ok(result.ctx.calls.some((call) =>
      call[0] === 'bezierCurveTo' || call[0] === 'quadraticCurveTo' || call[0] === 'ellipse'),
    canonicalId + ' must contain authored curved geometry');
    result.ctx.calls.forEach((call) => call.slice(1).forEach((value) => {
      if (typeof value === 'number') assert.ok(Number.isFinite(value), canonicalId + ' emitted a non-finite coordinate');
    }));
    assert.equal(result.ctx.calls.filter((call) => call[0] === 'save').length,
      result.ctx.calls.filter((call) => call[0] === 'restore').length,
      canonicalId + ' must balance Canvas state saves and restores');
  });
  assert.equal(Art.cacheInfo().variantsBuilt, 96,
    'all and only Pack A variants should be lazily built by the paint sweep');
}

function testCastsHaveDistinctGeometry() {
  Manifest.objects.slice(1, 8).forEach((record) => {
    const signatures = record.variants.map((variant) =>
      signature(renderLocal(record.id, variant.id, 0, true).ctx.calls));
    assert.equal(new Set(signatures).size, 12,
      record.id + ' must give every manifest cast visibly distinct vector geometry');
  });
}

function testMotionAndReducedMotionFallbacks() {
  Manifest.objects.slice(0, 8).forEach((record) => {
    const variantId = record.variants[0].id;
    const reducedEarly = signature(renderLocal(record.id, variantId, 0.35, true).ctx.calls);
    const reducedLate = signature(renderLocal(record.id, variantId, 4.8, true).ctx.calls);
    assert.equal(reducedEarly, reducedLate,
      record.id + ' reduced-motion art must remain stable over time');

    const animatedEarly = signature(renderLocal(record.id, variantId, 0.35, false).ctx.calls);
    const animatedLate = signature(renderLocal(record.id, variantId, 4.8, false).ctx.calls);
    assert.notEqual(animatedEarly, animatedLate,
      record.id + ' must expose a visible time-driven dynamic part');
  });
}

function testPreviewAndGameplayCompatibility() {
  Pack.objectIds.forEach((objectId, index) => {
    const record = Manifest.objects[index];
    const preview = fakeContext();
    Art.renderPreview(preview, {
      objectId,
      variantId: record.variants[2].id,
      box: { x: 7, y: 11, width: 190, height: 260 },
      time: 1,
    });
    assert.deepEqual(preview.calls[0], ['save']);
    assert.deepEqual(preview.calls[preview.calls.length - 1], ['restore']);

    const gameplay = fakeContext();
    Art.renderGameplay(gameplay, {
      objectId,
      variantId: record.variants[7].id,
      x: 321,
      y: 404,
      angle: 0.8,
      time: 1,
    });
    assert.ok(gameplay.calls.some((call) =>
      call[0] === 'scale' && call[1] === 0.74 && call[2] === 0.74));
    assert.ok(gameplay.calls.some((call) =>
      call[0] === 'translate' && call[1] === -150 && call[2] === -323.2972972973));
  });
}

function testBrowserGlobalsAndPaintOnlySource() {
  const context = vm.createContext({ console, Map, Set, Math, Number, Object, Array, String });
  ['v111-art-platform.js', 'v111-object-manifest.js', 'v111-art-reference.js', 'v111-art-pack-a.js']
    .forEach((filename) => vm.runInContext(
      fs.readFileSync(path.join(root, 'js', filename), 'utf8'), context, { filename }));
  assert.ok(context.FlipArtV111PackA);
  assert.equal(context.FlipArtV111PackA.objectIds.length, 8);
  assert.equal(context.FlipArtV111PackA.canonicalVariantIds.length, 96);
  assert.equal(context.FlipArtV111.cacheInfo().variantsBuilt, 0);
  const browserPaint = fakeContext();
  context.FlipArtV111.renderPreview(browserPaint, {
    objectId: 'microscope',
    variantId: 'microscope.pink-fluff',
    reducedMotion: true,
  });
  assert.ok(browserPaint.calls.some((call) => call[0] === 'fill'));

  const source = fs.readFileSync(path.join(root, 'js', 'v111-art-pack-a.js'), 'utf8');
  assert.doesNotMatch(source, /drawImage|new\s+Image|createImageBitmap|<svg\b|fillText|strokeText/,
    'Pack A must remain authored Canvas paths, not raster, SVG markup, emoji, or text art');
  assert.doesNotMatch(source, /[\u{1F000}-\u{1FAFF}]/u,
    'Pack A render source must not contain emoji art');
  assert.doesNotMatch(source, /\b(?:physics|body|hitbox|mass|collision)\s*:/i,
    'Pack A must not declare object-specific physics fields');
}

testPackCatalogAndCoffeeCoordination();
testRegistrationIsLazy();
testManifestRegistryParityAndCanonicalMapping();
testEveryManifestVariantPaints();
testCastsHaveDistinctGeometry();
testMotionAndReducedMotionFallbacks();
testPreviewAndGameplayCompatibility();
testBrowserGlobalsAndPaintOnlySource();

console.log('v111 art pack A tests passed (8 objects, 96 variants).');
