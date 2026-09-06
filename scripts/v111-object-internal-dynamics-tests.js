'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const Art = require(path.join(root, 'js', 'v111-art-platform.js'));
const Manifest = require(path.join(root, 'js', 'v111-object-manifest.js'));
require(path.join(root, 'js', 'v111-art-reference.js'));
require(path.join(root, 'js', 'v111-art-pack-a.js'));
require(path.join(root, 'js', 'v111-art-pack-b.js'));
require(path.join(root, 'js', 'v111-art-pack-c.js'));
const Bootstrap = require(path.join(root, 'js', 'v111-bootstrap.js'));

const INTERNAL_IDS = new Set([
  'coffee-mug', 'milk-carton', 'teapot', 'salt-pepper-shaker', 'soup-can',
  'smoothie', 'gumball-machine', 'potted-plants', 'snow-globe',
  'eyeball-monster', 'soda-can', 'watering-can', 'pinata', 'box-of-snacks',
]);
const EMOTION_IDS = new Set([
  'penguin', 'owl', 'giraffe', 'red-panda', 'eyeball-monster',
  'huge-rubber-duck', 'action-figures',
]);
const OPEN_IDS = new Set(['coffee-mug', 'watering-can']);
const LOCKED_PLANTS = [
  'Succulent', 'Cactus', 'Fern', 'Sunflower', 'Orchid', 'Bonsai',
  'Snake Plant', 'Monstera', 'Aloe', 'Flytrap', 'Palm', 'Flowering Vine',
];
const LOCKED_FIGURES = [
  'Astronaut', 'Robot', 'Knight', 'Wizard', 'Explorer', 'Scientist',
  'Racer', 'Diver', 'Detective', 'Pilot', 'Inventor', 'Space Ranger',
];
const LOCKED_BUILDINGS = [
  'Glass Tower', 'Brick High-Rise', 'Art Deco Tower', 'Clock Tower',
  'Observation Tower', 'Castle Tower', 'Futuristic Spire', 'Apartment Tower',
  'Lighthouse Tower', 'Hotel Tower', 'Garden Tower', 'Crystal Tower',
];

function fakeContext() {
  const calls = [];
  const ctx = { canvas: { width: 300, height: 420 }, calls };
  [
    'save', 'restore', 'translate', 'rotate', 'scale', 'beginPath', 'closePath',
    'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'ellipse', 'arc',
    'fillRect', 'fill', 'stroke', 'setLineDash',
  ].forEach((name) => { ctx[name] = (...args) => calls.push([name, ...args]); });
  ctx.createLinearGradient = (...args) => {
    calls.push(['createLinearGradient', ...args]);
    return { addColorStop: (...stop) => calls.push(['addColorStop', ...stop]) };
  };
  return ctx;
}

function record(id) {
  return Manifest.objects.find((object) => object.id === id);
}

function castLabels(id) {
  return record(id).variants.map((variant) => variant.castLabel);
}

function testRegistryAndLockedMatrices() {
  assert.equal(Manifest.objects.length, 25);
  assert.equal(Manifest.variants.length, 300);
  assert.equal(Art.listDynamicProfiles().length, 25);
  assert.deepEqual(new Set(Art.listDynamicProfiles().map((entry) => entry.id)),
    new Set(Manifest.objects.map((object) => object.id)));
  assert.deepEqual(castLabels('potted-plants'), LOCKED_PLANTS);
  assert.deepEqual(castLabels('action-figures'), LOCKED_FIGURES);
  assert.deepEqual(castLabels('tall-buildings'), LOCKED_BUILDINGS);
  assert.equal(Bootstrap.contractRevision, 4);
}

function testContentsMoveButSolidsHaveNoFakeContents() {
  for (const object of Manifest.objects) {
    const upright = Art.physicalDynamicsSnapshot(object.id, {
      angle: 0, slosh: 0, angularVelocity: 0, time: 1,
    });
    const quarter = Art.physicalDynamicsSnapshot(object.id, {
      angle: Math.PI / 2, slosh: 0.8, angularVelocity: 4, time: 1,
    });
    assert.equal(upright.hasContents, INTERNAL_IDS.has(object.id), object.id);
    if (INTERNAL_IDS.has(object.id)) {
      assert.notDeepEqual(quarter.contentShift, upright.contentShift,
        `${object.id} contents must respond to orientation/slosh`);
      assert.notEqual(quarter.surfaceAngle, upright.surfaceAngle,
        `${object.id} contents must re-level during rotation`);
    } else {
      assert.equal(upright.contentShift, null, `${object.id} must not fake contents`);
      assert.equal(quarter.contentShift, null, `${object.id} must not fake contents`);
    }
    assert(!('mass' in upright) && !('collider' in upright) && !('scoring' in upright));
  }
}

function testOpenSpillAndSealedProtection() {
  for (const object of Manifest.objects) {
    const snapshot = Art.physicalDynamicsSnapshot(object.id, {
      angle: Math.PI, slosh: 0.7, velocity: { x: 3, y: -2 }, airborne: true,
    });
    assert.equal(snapshot.canSpill, OPEN_IDS.has(object.id), object.id);
    assert.equal(snapshot.spilling, OPEN_IDS.has(object.id), object.id);
  }
  for (const id of OPEN_IDS) {
    assert.equal(Art.physicalDynamicsSnapshot(id, { angle: 0, airborne: true }).spilling,
      false, `${id} must not spill while upright`);
  }
}

function testDeterminismReducedMotionAndSeededSmoothie() {
  const input = {
    angle: 1.1, slosh: -0.55, angularVelocity: 2.5,
    velocity: { x: 140, y: -80 }, airborne: true, impact: 0.2,
    emotion: 'scared', flipSeed: 1729, motionSeed: 31415, time: 2.75,
  };
  assert.deepEqual(Art.normalizeRenderState(input), Art.normalizeRenderState(input));
  assert.deepEqual(Art.physicalDynamicsSnapshot('snow-globe', input),
    Art.physicalDynamicsSnapshot('snow-globe', input));

  const reducedA = Art.normalizeRenderState({ ...input, reducedMotion: true, time: 1 });
  const reducedB = Art.normalizeRenderState({ ...input, reducedMotion: true, time: 99 });
  assert.equal(reducedA.phase, 0);
  assert.equal(reducedB.phase, 0);
  assert.deepEqual(reducedA.contentShift, reducedB.contentShift);

  const sameA = Art.smoothieLiquidColor({ flipSeed: '42', motionSeed: '1' });
  const sameB = Art.smoothieLiquidColor({ flipSeed: '42', motionSeed: '999' });
  assert.equal(sameA, sameB, 'trajectory seed must keep smoothie color stable');
  const colors = new Set(Array.from({ length: 80 }, (_, seed) =>
    Art.smoothieLiquidColor({ flipSeed: String(seed + 1) })));
  assert(colors.size >= 10, 'seeded smoothie palette should exercise most of its colors');
  assert.equal(Art.smoothieLiquidColor({ flipSeed: '0', motionSeed: '77' }),
    Art.smoothieLiquidColor({ motionSeed: '77' }), 'motionSeed is the deterministic fallback');
}

function testFaceMetadataAndExplicitAllowlist() {
  for (const object of Manifest.objects) {
    for (const variant of object.variants) {
      const renderVariant = Art.getRenderVariant(object.id, variant.variantId);
      assert(Object.isFrozen(renderVariant.face));
      assert(Object.isFrozen(renderVariant.face.anchor));
      assert.equal(renderVariant.face.supportsEmotion, EMOTION_IDS.has(object.id), variant.id);
      const ctx = fakeContext();
      const painted = Art.paintReactionFace(ctx, renderVariant.face, { emotion: 'scared' });
      assert.equal(painted, EMOTION_IDS.has(object.id), variant.id);
    }
  }
  const hollow = Art.getRenderVariant('owl', 'making-waves').face;
  assert.deepEqual(hollow.anchor, { x: 150, y: 184 },
    'Tree Hollow reaction must remain attached to the owl, never float');
  const baby = Art.getRenderVariant('giraffe', 'sucker-punch').face;
  assert.deepEqual(baby.anchor, { x: 151, y: 115 });
}

function testGenericReactionPaintIsAllowlistedOnly() {
  const artSources = [
    'v111-art-reference.js', 'v111-art-pack-a.js',
    'v111-art-pack-b.js', 'v111-art-pack-c.js',
  ].map((file) => fs.readFileSync(path.join(root, 'js', file), 'utf8'));
  for (const source of artSources) {
    assert.doesNotMatch(source, /\bcommonFace\s*\(/,
      'base painters must not bake the retired generic commonFace into any variant');
  }

  for (const object of Manifest.objects) {
    for (const variant of object.variants) {
      const baseState = {
        angle: 0.31, slosh: 0.2, angularVelocity: 1.4,
        velocity: { x: 12, y: -8 }, airborne: false,
        time: 1.25, flipSeed: 'face-regression', motionSeed: variant.id,
      };
      const idle = fakeContext();
      const expressive = fakeContext();
      Art.renderGameplay(idle, {
        objectId: object.id, variantId: variant.variantId,
        x: 150, y: 323, ...baseState, emotion: 'idle',
      });
      Art.renderGameplay(expressive, {
        objectId: object.id, variantId: variant.variantId,
        x: 150, y: 323, ...baseState, emotion: 'scared',
      });
      if (EMOTION_IDS.has(object.id)) {
        assert.notDeepEqual(expressive.calls, idle.calls,
          `${variant.id} must receive the allowlisted generic reaction layer`);
      } else {
        assert.deepEqual(expressive.calls, idle.calls,
          `${variant.id} must ignore generic reaction emotion`);
      }
    }
  }
}

function testAllVariantsAndPhysicalStatesPaint() {
  const states = [
    { angle: 0, slosh: 0, time: 0.5, emotion: 'idle' },
    { angle: Math.PI / 2, slosh: 0.8, angularVelocity: 3, time: 1.25, airborne: true, emotion: 'scared' },
    { angle: Math.PI, slosh: -0.6, velocity: { x: 2, y: 1 }, time: 2, airborne: true, emotion: 'scared' },
    { angle: 0.08, slosh: 0.12, time: 3, contact: true, impact: 0.7, emotion: 'smile' },
  ];
  Art.clearRenderCache();
  for (const object of Manifest.objects) {
    for (const variant of object.variants) {
      for (const state of states) {
        const ctx = fakeContext();
        const rendered = Art.renderGameplay(ctx, {
          objectId: object.id,
          variantId: variant.variantId,
          x: 150,
          y: 323,
          flipSeed: '20260906',
          motionSeed: variant.id,
          ...state,
        });
        assert.equal(rendered.id, variant.id);
        assert(ctx.calls.some((call) => call[0] === 'fill' || call[0] === 'stroke'),
          `${variant.id} did not paint at angle ${state.angle}`);
      }
    }
  }
  assert.equal(Art.cacheInfo().variantsBuilt, 300);
  assert(Art.cacheInfo().variantsBuilt <= Manifest.variants.length,
    'lazy painter cache is bounded by the finite 300-variant manifest');
}

function testBridgeAndReviewCriteriaInstrumentation() {
  const skinsSource = fs.readFileSync(path.join(root, 'js', 'skins.js'), 'utf8');
  for (const key of [
    'angle', 'slosh', 'angularVelocity', 'velocity', 'airborne', 'contact',
    'impact', 'emotion', 'flipSeed', 'motionSeed',
  ]) {
    assert.match(skinsSource, new RegExp(`${key}: opts && opts\\.${key}`),
      `skins bridge must forward ${key}`);
  }
  const packA = fs.readFileSync(path.join(root, 'js', 'v111-art-pack-a.js'), 'utf8');
  assert.match(packA, /full-size, tall carton/);
  assert.match(packA, /brand-free cow illustration/);
  assert.match(packA, /steaming bowl with visible peas\/noodles\/carrots/);
  assert.match(packA, /Steam rises in world space/);
  assert.match(packA, /Secondary flat foot/);
  const packC = fs.readFileSync(path.join(root, 'js', 'v111-art-pack-c.js'), 'utf8');
  assert.match(packC, /miniature is bolted to an interior plinth/);
  assert.match(packC, /drawSnackAssortment/);
}

testRegistryAndLockedMatrices();
testContentsMoveButSolidsHaveNoFakeContents();
testOpenSpillAndSealedProtection();
testDeterminismReducedMotionAndSeededSmoothie();
testFaceMetadataAndExplicitAllowlist();
testGenericReactionPaintIsAllowlistedOnly();
testAllVariantsAndPhysicalStatesPaint();
testBridgeAndReviewCriteriaInstrumentation();

console.log('v1.11 object internal dynamics tests passed (25 objects, 300 variants, 4 physical states).');
