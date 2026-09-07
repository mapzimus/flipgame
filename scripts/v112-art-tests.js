'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const Globe = require(path.join(root, 'js', 'v112-globe.js'));
const geographyPath = path.join(root, 'data', 'v112-globe', 'natural-earth-land-110m.geojson');
const geography = JSON.parse(fs.readFileSync(geographyPath, 'utf8'));
Globe.setBundledGeography(geography);
const Art = require(path.join(root, 'js', 'v112-art-system.js'));

const EXPECTED_IDS = [
  'coffee-mug',
  'penguin',
  'action-figures',
  'desk-globe',
  'desk-gyroscope',
  'mechanical-metronome',
  'potted-plants',
];

function fakeGradient(calls) {
  return { addColorStop(offset, color) { calls.push(['addColorStop', offset, color]); } };
}

function fakeContext(width = 300, height = 420) {
  const calls = [];
  const ctx = {
    canvas: { width, height },
    calls,
    globalAlpha: 1,
    save() { calls.push(['save']); },
    restore() { calls.push(['restore']); },
    translate(x, y) { calls.push(['translate', x, y]); },
    rotate(angle) { calls.push(['rotate', angle]); },
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
    clip() { calls.push(['clip']); },
    fillRect() { calls.push(['fillRect']); },
    fillText(text, x, y) { calls.push(['fillText', text, x, y]); },
    strokeText(text, x, y) { calls.push(['strokeText', text, x, y]); },
    createLinearGradient() { calls.push(['createLinearGradient']); return fakeGradient(calls); },
    createRadialGradient() { calls.push(['createRadialGradient']); return fakeGradient(calls); },
  };
  return ctx;
}

function testCatalogAndMappings() {
  assert.equal(Art.schemaVersion, 2);
  assert.equal(Art.releaseVersion, 'v1.12');
  assert.equal(Art.visualOnly, true);
  assert.deepEqual(Array.from(Art.CALIBRATION_IDS), EXPECTED_IDS);
  assert.equal(Art.definitions.length, 7);
  assert.equal(Art.definitions.reduce((sum, definition) => sum + definition.variants.length, 0), 84);
  assert.deepEqual(Array.from(Art.PROTECTED_IDS), ['bottle', 'trex']);
  assert.equal(Art.getDefinition('bottle'), null);
  assert.equal(Art.getDefinition('trex'), null);
  assert.equal(Art.getDefinition('giraffe'), null);
  assert.equal(Art.getDefinition('tall-buildings'), null);
  assert.ok(Art.getDefinition('desk-gyroscope'));
  assert.ok(Art.getDefinition('mechanical-metronome'));

  const globalCanonicalIds = new Set();
  const globalVariantNames = new Set();
  Art.definitions.forEach((definition) => {
    assert.equal(definition.schema, 'FlipperArtDefinitionV2');
    assert.equal(definition.physicsNeutralArt, true);
    assert.strictEqual(definition.mapping, Art.COMPETITIVE_MAPPING);
    assert.equal(definition.collisionProfile, 'standard-competitive-v1');
    assert.equal(definition.contactPlaneY, 376);
    assert.equal(definition.bounds.y + definition.bounds.height, 376);
    assert.equal(definition.previewStates.length, 6);
    assert.equal(new Set(definition.variants.map((variant) => variant.name)).size, 12,
      definition.objectId + ' names must be unique within its gallery');
    assert.equal(new Set(definition.variants.map((variant) => variant.color)).size, 12);
    definition.variants.forEach((variant) => {
      assert.equal(variant.canonicalId, `${definition.objectId}.${variant.id}`);
      assert.match(variant.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      assert.ok(variant.name.length >= 8);
      assert.ok(variant.cast.length >= 4);
      assert.equal(globalCanonicalIds.has(variant.canonicalId), false);
      globalCanonicalIds.add(variant.canonicalId);
      assert.equal(globalVariantNames.has(variant.name), false,
        variant.name + ' must be unique across the calibration gallery');
      globalVariantNames.add(variant.name);
      assert.strictEqual(Art.getVariant(definition.objectId, variant.canonicalId), variant);
    });
  });
  assert.equal(globalCanonicalIds.size, 84);
  assert.equal(globalVariantNames.size, 84);
  assert.deepEqual(Art.validateCalibration(), { valid: true, errors: [] });
  assert.ok(Object.isFrozen(Art.definitions));
  assert.ok(Object.isFrozen(Art.COMPETITIVE_MAPPING));
  assert.ok(Object.isFrozen(Art.COMPETITIVE_MAPPING.pivot));
  assert.ok(Math.abs((376 - 323.2972972973) * 0.74 - 39) < 1e-9);
}

function testPottedPlantAndActionFigureMatrices() {
  assert.deepEqual(Art.getDefinition('potted-plants').variants.map((variant) => variant.cast), [
    'succulent', 'cactus', 'fern', 'sunflower', 'orchid', 'bonsai', 'snake plant',
    'monstera', 'aloe', 'flytrap', 'palm', 'flowering vine',
  ]);
  assert.deepEqual(Art.getDefinition('action-figures').variants.map((variant) => variant.cast), [
    'astronaut', 'robot', 'knight', 'wizard', 'explorer', 'scientist', 'racer', 'diver',
    'detective', 'pilot', 'inventor', 'space ranger',
  ]);
}

function testDeterministicPhysicsNeutralDynamics() {
  const input = {
    angle: Math.PI * 0.72,
    angularVelocity: 4.2,
    velocity: { x: 44, y: -71 },
    acceleration: { x: 12, y: 80 },
    airborne: true,
    time: 1.75,
    impact: 0.2,
    flipSeed: 'art-seed-09',
  };
  const pristine = JSON.stringify(input);
  const bannedKeys = /"(?:mass|force|torque|friction|restitution|collision|tolerance|scoring|odds)"\s*:/i;
  EXPECTED_IDS.forEach((objectId) => {
    const first = Art.computeDynamics(objectId, input);
    const second = Art.computeDynamics(objectId, input);
    assert.deepEqual(first, second, objectId + ' dynamics must replay exactly');
    assert.equal(first.visualOnly, true);
    assert.equal(first.affectsGameplay, false);
    assert.doesNotMatch(JSON.stringify(first), bannedKeys,
      objectId + ' visual dynamics must not expose gameplay tuning');
    assert.ok(Object.isFrozen(first));
  });
  assert.equal(JSON.stringify(input), pristine, 'art normalization must not mutate caller input');

  const upright = Art.computeDynamics('coffee-mug', { angle: 0, airborne: true, flipSeed: 'spill' });
  const inverted = Art.computeDynamics('coffee-mug', { angle: Math.PI, airborne: true,
    velocity: { y: 20 }, flipSeed: 'spill' });
  assert.equal(upright.spillActive, false);
  assert.equal(inverted.spillActive, true);
  assert.equal(inverted.droplets.length, 7);
  assert.notDeepEqual(inverted.droplets[0], inverted.droplets[1]);
  assert.deepEqual(inverted.droplets,
    Art.computeDynamics('coffee-mug', { angle: Math.PI, airborne: true,
      velocity: { y: 20 }, flipSeed: 'spill' }).droplets);

  const movingMetronome = Art.computeDynamics('mechanical-metronome', { time: 1.1, flipSeed: 'm' });
  const frozenMetronome = Art.computeDynamics('mechanical-metronome', {
    time: 1.1, flipSeed: 'm', reducedMotion: true,
  });
  assert.notEqual(movingMetronome.pendulumAngle, 0);
  assert.equal(frozenMetronome.pendulumAngle, 0);
  const movingPlant = Art.computeDynamics('potted-plants', {
    time: 0.7, angularVelocity: 3, airborne: true, flipSeed: 'plant',
  });
  assert.notEqual(movingPlant.foliageLean, 0);
  assert.notEqual(movingPlant.leafFlutter, 0);
  const gyroA = Art.computeDynamics('desk-gyroscope', { time: 0.2, angle: 1.1 });
  const gyroB = Art.computeDynamics('desk-gyroscope', { time: 0.8, angle: 1.1 });
  assert.notEqual(gyroA.rotorAngle, gyroB.rotorAngle);
}

function testAuthoredReactionPolicy() {
  const expected = {
    'coffee-mug': 'none-dynamics-led',
    penguin: 'authored-character-face',
    'action-figures': 'authored-character-face',
    'desk-globe': 'none-rigid-instrument',
    'desk-gyroscope': 'none-rigid-instrument',
    'mechanical-metronome': 'none-rigid-instrument',
    'potted-plants': 'none-dynamics-led',
  };
  Art.definitions.forEach((definition) => {
    assert.equal(definition.reactionPolicy, expected[definition.objectId]);
    const make = Art.buildScene({ objectId: definition.objectId,
      variantId: definition.variants[0].id, result: 'make' });
    const miss = Art.buildScene({ objectId: definition.objectId,
      variantId: definition.variants[0].id, result: 'miss' });
    assert.equal(make.commands.some((command) => command.kind === 'reaction-overlay'), false);
    assert.equal(miss.commands.some((command) => command.kind === 'reaction-overlay'), false);
    if (definition.reactionPolicy === 'authored-character-face') {
      assert.notDeepEqual(make.commands, miss.commands,
        definition.objectId + ' must author make/miss into its own rig');
    } else if (definition.objectId !== 'desk-globe') {
      assert.deepEqual(make.commands, miss.commands,
        definition.objectId + ' must not receive a generic result face');
    }
  });
}

function testAllVariantsBuildCanvasAndSvg() {
  Art.clearRenderCache();
  Art.definitions.forEach((definition) => {
    definition.variants.forEach((variant) => {
      const state = { time: 1.25, angle: Math.PI * 0.82, angularVelocity: 2.4,
        airborne: true, flipSeed: `${definition.objectId}:${variant.id}` };
      const scene = Art.buildScene({ objectId: definition.objectId,
        variantId: variant.id, state });
      assert.equal(scene.objectId, definition.objectId);
      assert.equal(scene.variantId, variant.canonicalId);
      assert.ok(scene.commands.length >= 9,
        variant.canonicalId + ' must be a composed vector illustration');
      assert.equal(scene.commands[0].kind, 'ellipse', 'grounded shadow is first in render order');
      assert.equal(scene.commands.some((command) => command.kind === 'globe'),
        definition.objectId === 'desk-globe',
        'the realistic sphere primitive is reserved for Desk Globe');
      const rendered = Art.renderSvg({ objectId: definition.objectId,
        variantId: variant.id, state, geography });
      assert.notStrictEqual(rendered.scene, scene); // separate deterministic scene instances are expected
      assert.match(rendered.svg, /^<svg /);
      assert.match(rendered.svg, /viewBox="0 0 300 420"/);
      assert.match(rendered.svg, new RegExp(`data-object="${definition.objectId}"`));
      assert.doesNotMatch(rendered.svg,
        /<image\b|data:image|<foreignObject|(?:href|xlink:href)="https?:\/\//i,
        'calibration SVG cannot depend on raster or online artwork');

      const preview = fakeContext(220, 300);
      Art.renderPreview(preview, { objectId: definition.objectId, variantId: variant.id,
        state, geography, box: { x: 0, y: 0, width: 220, height: 300 } });
      assert.ok(preview.calls.some((call) => call[0] === 'fill'));
      assert.ok(preview.calls.some((call) => call[0] === 'scale'));
      assert.ok(preview.calls.some((call) => call[0] === 'rotate' &&
        Math.abs(call[1] - state.angle) < 1e-12),
      'live preview must show the selected rotation state');
      const gameplay = fakeContext(800, 600);
      Art.renderGameplay(gameplay, { objectId: definition.objectId, variantId: variant.id,
        state, geography, x: 300, y: 350, angle: state.angle });
      assert.ok(gameplay.calls.some((call) => call[0] === 'translate' &&
        call[1] === 300 && call[2] === 350));
      assert.ok(gameplay.calls.some((call) => call[0] === 'rotate'));

      const renderVariant = Art.getRenderVariant(definition.objectId, variant.id);
      assert.strictEqual(renderVariant,
        Art.getRenderVariant(definition.objectId, variant.canonicalId));
      assert.equal(renderVariant.id, variant.canonicalId);
    });
  });
  assert.equal(Art.cacheInfo().size, 84);
  assert.equal(new Set(Art.cacheInfo().keys).size, 84);
  assert.throws(() => Art.buildScene({ objectId: 'bottle', variantId: 'blue-steel' }),
    /Protected Flipper art/);
  assert.throws(() => Art.buildScene({ objectId: 'trex', variantId: 'blue-steel' }),
    /Protected Flipper art/);
}

function testNaturalEarthGeographyAndProjection() {
  assert.equal(geography.type, 'FeatureCollection');
  assert.equal(geography.features.length, 127);
  const prepared = Globe.prepareGeography(geography);
  assert.ok(prepared.rings.length >= 120);
  assert.ok(prepared.pointCount >= 5000);
  assert.equal(prepared.source.license, 'public-domain');
  assert.equal(prepared.source.sourceCommit,
    'ca96624a56bd078437bca8184e78163e5039ad19');
  assert.strictEqual(Globe.prepareGeography(geography), prepared,
    'prepared geography must use the bounded weak cache');
  const front = Globe.projectPoint(0, 0, { centerLon: 0, centerLat: 0, radius: 100 });
  const back = Globe.projectPoint(0, Math.PI, { centerLon: 0, centerLat: 0, radius: 100 });
  assert.equal(front.visible, true);
  assert.ok(front.depth > 0.999999);
  assert.equal(back.visible, false);
  assert.ok(back.depth < -0.999999);

  const period = Globe.DEFAULT_PERIOD_SECONDS;
  const start = Globe.rotationAt(0, { initialLon: 0, periodSeconds: period });
  const quarter = Globe.rotationAt(period / 4, { initialLon: 0, periodSeconds: period });
  const complete = Globe.rotationAt(period, { initialLon: 0, periodSeconds: period });
  assert.ok(Math.abs(start) < 1e-12);
  assert.ok(Math.abs(quarter - Math.PI / 2) < 1e-12);
  assert.ok(Math.abs(complete) < 1e-12, 'sphere must complete a genuine 360° rotation');

  const ctx = fakeContext(300, 300);
  const snapshot = Globe.renderCanvasGlobe(ctx, { centerX: 150, centerY: 150, radius: 100,
    centerLon: quarter, centerLat: 0, geography });
  assert.equal(snapshot.renderer, 'canvas');
  assert.ok(snapshot.geographyRings >= 120);
  assert.ok(ctx.calls.some((call) => call[0] === 'clip'));
  assert.ok(ctx.calls.filter((call) => call[0] === 'fill').length > 20);
}

function testWebGLReadyMesh() {
  const mesh = Globe.buildSphereMesh(24, 48);
  assert.equal(mesh.positions.length, (24 + 1) * (48 + 1) * 3);
  assert.equal(mesh.normals.length, mesh.positions.length);
  assert.equal(mesh.uvs.length, (24 + 1) * (48 + 1) * 2);
  assert.equal(mesh.indices.length, 24 * 48 * 6);
  assert.ok(mesh.positions instanceof Float32Array);
  assert.ok(mesh.uvs instanceof Float32Array);
  assert.ok(mesh.indices instanceof Uint16Array);
  for (let index = 0; index < mesh.positions.length; index += 3) {
    const length = Math.hypot(mesh.positions[index], mesh.positions[index + 1],
      mesh.positions[index + 2]);
    assert.ok(Math.abs(length - 1) < 1e-5);
  }
  assert.equal(Math.min(...mesh.uvs), 0);
  assert.equal(Math.max(...mesh.uvs), 1);
}

function testVisibleHemisphereFocusAndOdds() {
  assert.equal(Globe.focusDecision({ seed: 'never', made: false, physical: true }).triggered, false);
  assert.equal(Globe.focusDecision({ seed: 'never', made: true, physical: false }).triggered, false);
  assert.equal(Globe.focusDecision({ seed: 'never', made: true, physical: true,
    testData: true }).triggered, false);
  assert.equal(Globe.focusDecision({ seed: 'case', made: true, physical: true,
    playerName: 'Mr. Howe' }).denominator, 10);
  assert.equal(Globe.focusDecision({ seed: 'case', made: true, physical: true,
    playerName: 'mr. howe' }).denominator, 100);

  let normalTriggers = 0;
  let howeTriggers = 0;
  let example = null;
  const count = 120000;
  for (let seed = 0; seed < count; seed += 1) {
    const normal = Globe.focusDecision({ seed, made: true, physical: true,
      playerName: 'Player', orientation: { centerLon: 1.3, centerLat: -0.24 } });
    const howe = Globe.focusDecision({ seed, made: true, physical: true,
      playerName: 'Mr. Howe', orientation: { centerLon: 1.3, centerLat: -0.24 } });
    if (normal.triggered) normalTriggers += 1;
    if (howe.triggered) {
      howeTriggers += 1;
      if (!example) example = howe;
      assert.ok(howe.point.facing >= 0.239999,
        'focus point must lie safely inside the currently visible hemisphere');
      assert.ok(Globe.visibility(howe.point.latitude, howe.point.longitude,
        { centerLon: 1.3, centerLat: -0.24 }) > 0);
      assert.equal(howe.camera.restoresOrientation, true);
      assert.equal(howe.camera.frames[0].centerLon,
        howe.camera.frames[howe.camera.frames.length - 1].centerLon);
      assert.equal(howe.camera.frames[0].centerLat,
        howe.camera.frames[howe.camera.frames.length - 1].centerLat);
    }
  }
  const normalRate = normalTriggers / count;
  const howeRate = howeTriggers / count;
  assert.ok(normalRate > 0.009 && normalRate < 0.011,
    `normal focus rate ${normalRate} must calibrate to 1/100`);
  assert.ok(howeRate > 0.097 && howeRate < 0.103,
    `Mr. Howe focus rate ${howeRate} must calibrate to 1/10`);
  assert.ok(example);
  const deterministic = Globe.focusDecision({ seed: 'case', made: true, physical: true,
    playerName: 'Mr. Howe', orientation: { centerLon: 1.3, centerLat: -0.24 } });
  assert.deepEqual(deterministic, Globe.focusDecision({ seed: 'case', made: true,
    physical: true, playerName: 'Mr. Howe',
    orientation: { centerLon: 1.3, centerLat: -0.24 } }));
}

function testBrowserGlobalsAndNoPhysicsImports() {
  const context = vm.createContext({
    console, Math, Number, Object, Array, String, Map, Set, WeakMap,
    Float32Array, Uint16Array, Uint32Array, Promise,
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'v112-globe.js'), 'utf8'), context,
    { filename: 'v112-globe.js' });
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'v112-art-system.js'), 'utf8'), context,
    { filename: 'v112-art-system.js' });
  assert.ok(context.FlipGlobeV112);
  assert.ok(context.FlipArtV112);
  assert.equal(context.FlipArtV112.definitions.length, 7);
  assert.equal(context.FlipArtV112.validateCalibration().valid, true);

  const artSource = fs.readFileSync(path.join(root, 'js', 'v112-art-system.js'), 'utf8');
  const globeSource = fs.readFileSync(path.join(root, 'js', 'v112-globe.js'), 'utf8');
  const executable = (artSource + globeSource)
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(executable, /\b(?:Matter|Engine|Bodies|Body\.set|World\.add)\b/,
    'art and globe modules must not import or mutate the physics engine');
  assert.doesNotMatch(executable, /\b(?:localStorage|indexedDB|XMLHttpRequest)\b/,
    'art rendering must remain stateless and offline');
}

testCatalogAndMappings();
testPottedPlantAndActionFigureMatrices();
testDeterministicPhysicsNeutralDynamics();
testAuthoredReactionPolicy();
testAllVariantsBuildCanvasAndSvg();
testNaturalEarthGeographyAndProjection();
testWebGLReadyMesh();
testVisibleHemisphereFocusAndOdds();
testBrowserGlobalsAndNoPhysicsImports();

console.log('v1.12 art and offline globe calibration tests passed.');
