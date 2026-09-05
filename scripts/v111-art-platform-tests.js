'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const Art = require(path.join(root, 'js', 'v111-art-platform.js'));
const Reference = require(path.join(root, 'js', 'v111-art-reference.js'));

const EXPECTED_IDS = [
  'coffee-mug.blue-steel',
  'coffee-mug.sucker-punch',
  'coffee-mug.lime-light',
  'coffee-mug.orange-crush',
  'coffee-mug.grape-expectations',
  'coffee-mug.ice-ice-baby',
  'coffee-mug.apple-solutely',
  'coffee-mug.berry-nice',
  'coffee-mug.making-waves',
  'coffee-mug.lemon-aid',
  'coffee-mug.very-cherry',
  'coffee-mug.pink-fluff',
];

function fakeContext() {
  const calls = [];
  const ctx = {
    canvas: { width: 200, height: 280 },
    calls,
    save() { calls.push(['save']); },
    restore() { calls.push(['restore']); },
    translate(x, y) { calls.push(['translate', x, y]); },
    rotate(a) { calls.push(['rotate', a]); },
    scale(x, y) { calls.push(['scale', x, y]); },
    beginPath() { calls.push(['beginPath']); },
    closePath() { calls.push(['closePath']); },
    moveTo(x, y) { calls.push(['moveTo', x, y]); },
    lineTo(x, y) { calls.push(['lineTo', x, y]); },
    quadraticCurveTo() { calls.push(['quadraticCurveTo']); },
    bezierCurveTo() { calls.push(['bezierCurveTo']); },
    ellipse() { calls.push(['ellipse']); },
    arc() { calls.push(['arc']); },
    fill() { calls.push(['fill']); },
    stroke() { calls.push(['stroke']); },
    createLinearGradient() {
      calls.push(['createLinearGradient']);
      return { addColorStop() { calls.push(['addColorStop']); } };
    },
  };
  return ctx;
}

function testReferenceCatalogAndStableIds() {
  assert.equal(Art.contractVersion, 2);
  assert.equal(Reference.objectId, 'coffee-mug');
  assert.deepEqual(Array.from(Reference.variantIds), EXPECTED_IDS);
  assert.equal(new Set(Reference.variantIds).size, 12);

  const mug = Art.getObject('coffee-mug');
  assert.ok(mug);
  assert.equal(mug.variants.length, 12);
  assert.deepEqual(mug.variants.map((variant) => variant.canonicalId), EXPECTED_IDS);
  assert.equal(new Set(mug.variants.map((variant) => variant.color)).size, 12);
  assert.ok(Object.isFrozen(mug));
  assert.ok(Object.isFrozen(mug.variants));
  assert.ok(Object.isFrozen(mug.variants[0]));
}

function testBoundsAndBaseline() {
  const metrics = Art.getObject('coffee-mug').metrics;
  assert.deepEqual(metrics.viewBox, { x: 0, y: 0, width: 300, height: 420 });
  assert.deepEqual(metrics.bounds, { x: 54, y: 60, width: 222, height: 316 });
  assert.deepEqual(metrics.pivot, { x: 150, y: 323.2972972973 });
  assert.equal(metrics.baselineY, 376);
  assert.equal(metrics.artScale, 0.74);
  assert.equal(metrics.localContactOffset, 39);
  assert.ok(Math.abs((metrics.baselineY - metrics.pivot.y) * metrics.artScale - 39) < 1e-9);
  assert.strictEqual(Art.CANONICAL_MAPPING.pivot.x, 150);
  assert.strictEqual(Art.CANONICAL_MAPPING.pivot.y, 323.2972972973);
  assert.strictEqual(Art.CANONICAL_MAPPING.baselineY, 376);
  assert.strictEqual(Art.CANONICAL_MAPPING.artScale, 0.74);
  assert.strictEqual(Art.CANONICAL_MAPPING.localContactOffset, 39);
  assert.ok(Object.isFrozen(Art.CANONICAL_MAPPING));
  assert.ok(Object.isFrozen(Art.CANONICAL_MAPPING.pivot));
  assert.ok(Math.abs(Art.getLocalContactOffset(Art.CANONICAL_MAPPING) - 39) < 1e-9);
  assert.equal(metrics.bounds.y + metrics.bounds.height, metrics.baselineY,
    'the visible silhouette must terminate on the shared art baseline');
  assert.ok(metrics.bounds.x >= metrics.viewBox.x);
  assert.ok(metrics.bounds.x + metrics.bounds.width <= metrics.viewBox.width);
}

function testAllTwelveVariantsPaint() {
  Art.clearRenderCache();
  EXPECTED_IDS.forEach((canonicalId) => {
    const ctx = fakeContext();
    const rendered = Art.renderPreview(ctx, {
      objectId: 'coffee-mug',
      variantId: canonicalId,
      reducedMotion: true,
    });
    assert.equal(rendered.id, canonicalId);
    assert.ok(ctx.calls.some((call) => call[0] === 'fill'),
      canonicalId + ' must produce visible vector paint calls');
  });
  assert.equal(Art.cacheInfo().variantsBuilt, 12);
}

function testLazyVariantCache() {
  Art.clearRenderCache();
  assert.equal(Art.cacheInfo().variantsBuilt, 0,
    'registration must not eagerly build any painter');
  const first = Art.getRenderVariant('coffee-mug', 'blue-steel');
  assert.equal(Art.cacheInfo().variantsBuilt, 1);
  assert.strictEqual(first, Art.getRenderVariant('coffee-mug', 'coffee-mug.blue-steel'));
  assert.equal(Art.cacheInfo().variantsBuilt, 1,
    'repeated lookup must reuse the same RenderVariant');
  Art.getRenderVariant('coffee-mug', 'sucker-punch');
  assert.equal(Art.cacheInfo().variantsBuilt, 2);
  assert.deepEqual(Array.from(Art.cacheInfo().keys),
    ['coffee-mug.blue-steel', 'coffee-mug.sucker-punch']);
}

function testPreviewAndGameplayRendering() {
  Art.clearRenderCache();
  const preview = fakeContext();
  const previewVariant = Art.renderPreview(preview, {
    objectId: 'coffee-mug',
    variantId: 'lime-light',
    box: { x: 5, y: 7, width: 160, height: 224 },
    time: 1.5,
  });
  assert.equal(previewVariant.id, 'coffee-mug.lime-light');
  assert.ok(preview.calls.some((call) => call[0] === 'scale'));
  assert.ok(preview.calls.some((call) => call[0] === 'fill'));
  assert.deepEqual(preview.calls[0], ['save']);
  assert.deepEqual(preview.calls[preview.calls.length - 1], ['restore']);

  const gameplay = fakeContext();
  const gameplayVariant = Art.renderGameplay(gameplay, {
    objectId: 'coffee-mug',
    variantId: 'coffee-mug.orange-crush',
    x: 320,
    y: 410,
    angle: 0.75,
    time: 2,
    reducedMotion: true,
  });
  assert.equal(gameplayVariant.id, 'coffee-mug.orange-crush');
  assert.ok(gameplay.calls.some((call) =>
    call[0] === 'translate' && call[1] === 320 && call[2] === 410));
  assert.ok(gameplay.calls.some((call) => call[0] === 'rotate' && call[1] === 0.75));
  assert.ok(gameplay.calls.some((call) =>
    call[0] === 'scale' && call[1] === 0.74 && call[2] === 0.74));
}

function testPaintOnlyValidation() {
  assert.throws(() => Art.registerObject({
    id: 'bad-physics-art',
    label: 'Bad',
    physics: { mass: 2 },
    metrics: {
      viewBox: { width: 10, height: 10 },
      bounds: { x: 0, y: 0, width: 10, height: 10 },
      baselineY: 10,
    },
    variants: [{ id: 'default' }],
    buildVariant: () => () => {},
  }), /cannot declare physics field/);

  assert.throws(() => Art.registerObject({
    id: 'bad-contact-art',
    label: 'Bad contact mapping',
    metrics: {
      viewBox: { width: 300, height: 420 },
      bounds: { x: 54, y: 60, width: 222, height: 316 },
      pivot: { x: 150, y: 323.2972972973 },
      baselineY: 376,
      artScale: 0.74,
      localContactOffset: 38,
    },
    variants: [{ id: 'default' }],
    buildVariant: () => () => {},
  }), /must match the baseline mapping/);

  const platformSource = fs.readFileSync(path.join(root, 'js', 'v111-art-platform.js'), 'utf8');
  const executableSource = platformSource
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(executableSource, /\b(?:Matter|Engine|Bodies|Body)\b/,
    'the art platform must not depend on the physics engine');
}

function testBrowserGlobalsWithoutCommonJs() {
  const context = vm.createContext({ console, Map, Set, Math, Number, Object, Array, String });
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'v111-art-platform.js'), 'utf8'), context,
    { filename: 'v111-art-platform.js' });
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'v111-art-reference.js'), 'utf8'), context,
    { filename: 'v111-art-reference.js' });
  assert.ok(context.FlipArtV111);
  assert.ok(context.FlipArtV111Reference);
  assert.equal(context.FlipArtV111.contractVersion, 2);
  assert.ok(Object.isFrozen(context.FlipArtV111.CANONICAL_MAPPING));
  assert.ok(Math.abs(context.FlipArtV111.getLocalContactOffset() - 39) < 1e-9);
  assert.equal(context.FlipArtV111Reference.definition.variants.length, 12);

  const ctx = fakeContext();
  const rendered = context.FlipArtV111.renderPreview(ctx, {
    objectId: 'coffee-mug',
    variantId: 'pink-fluff',
  });
  assert.equal(rendered.id, 'coffee-mug.pink-fluff');
}

testReferenceCatalogAndStableIds();
testBoundsAndBaseline();
testAllTwelveVariantsPaint();
testLazyVariantCache();
testPreviewAndGameplayRendering();
testPaintOnlyValidation();
testBrowserGlobalsWithoutCommonJs();

console.log('v111 art platform tests passed.');
