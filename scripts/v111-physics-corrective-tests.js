'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const Events = require(path.join(root, 'js', 'v111-physics-events.js'));

function loadPhysics() {
  const context = vm.createContext({
    console,
    Math,
    window: { matchMedia: () => ({ matches: false }) },
  });
  for (const relative of [
    'js/vendor/matter.min.js',
    'js/v111-interfaces.js',
    'js/v111-physics-events.js',
    'js/physics.js',
  ]) {
    let source = fs.readFileSync(path.join(root, relative), 'utf8');
    if (relative === 'js/physics.js') source += '\nthis.__physics = Physics;';
    vm.runInContext(source, context, { filename: relative });
  }
  return context.__physics;
}

function simulate({ eventId = null, eventMode = null, width = 1280, height = 800,
  vx = 320, vy = -2500, seed = 1 }) {
  const physics = loadPhysics();
  physics.init(width, height);
  if (eventId) physics.forceSpecialEvent(eventId);
  physics.applyFlick(vx, vy, seed, 1, eventMode || (eventId ? 'normal' : 'disabled'));
  for (let frame = 0; frame < 3600; frame += 1) {
    physics.step(1 / 60);
    const verdict = physics.checkLanding();
    if (verdict) return { verdict, frame: frame + 1, info: physics.getLastLandingInfo(), physics };
  }
  throw new Error(`${eventId || 'classic'} did not resolve for seed ${seed}`);
}

function rateFor(eventId, width, height, samples = 100) {
  let makes = 0;
  for (let seed = 1; seed <= samples; seed += 1) {
    if (simulate({ eventId, width, height, seed }).verdict === 'MAKE') makes += 1;
  }
  return makes / samples;
}

const ALIEN_PROFILE = Object.freeze({
  gravity: 0.10, frictionAir: 0.0025, friction: 0.02, restitution: 0.90,
  spinScale: 0.7, launchScale: 1.50, horizDivisor: 140, horizMax: 15,
  wallBounce: 0.96, ceiling: true, floorResolve: true, landOnTarget: true,
  targetHalfWidth: 96, requireFlip: false, deflector: true, deflectorCount: 3,
  saucerCount: 6, keepWalls: true, minHorizRatio: 0.12, strictTarget: false,
  allowSlideIn: false, hitScale: 0.86, alienPortal: true, arenaExpand: 1,
  mobileArenaExpand: 1.42, arenaExpandY: 1, mobileArenaExpandY: 1.14,
});

function simulateAlienMode({ width, height, vx, vy, seed }) {
  const physics = loadPhysics();
  physics.init(width, height);
  physics.setProfile(ALIEN_PROFILE);
  physics.resetBottle();
  physics.seedTurn(seed);
  physics.applyFlick(vx, vy, seed, 1, 'disabled');
  for (let frame = 0; frame < 3600; frame += 1) {
    physics.step(1 / 60);
    const verdict = physics.checkLanding();
    if (verdict) return { verdict, frame: frame + 1, info: physics.getLastLandingInfo(), physics };
  }
  throw new Error(`alien mode did not resolve for seed ${seed}`);
}

if (process.env.FLIPGAME_PRINT_CORRECTIVE_MATRIX === '1') {
  for (const id of [null, 'tether-swing', 'mitosis', 'heart-rush', 'mirror-match', 'ceiling-flip', 'alien-invasion']) {
    console.log(id || 'classic', rateFor(id, 1280, 800, 50));
  }
  for (const [width, height] of [[360, 640], [768, 1024], [1280, 800], [1920, 1080], [3840, 2160]]) {
    console.log('alien', width, height, rateFor('alien-invasion', width, height, 50));
  }
}

if (process.env.FLIPGAME_PRINT_CORRECTIVE_EXACT === '1') {
  for (const sample of [
    { eventId: null, seed: 6129, vx: 350, height: 720 },
    { eventId: 'mirror-match', seed: 6129, vx: 350, height: 720 },
    { eventId: 'tether-swing', seed: 6110, vx: 500, height: 720 },
    { eventId: 'mitosis', seed: 6111, vx: 320, height: 720 },
    { eventId: 'heart-rush', seed: 6115, vx: 320, height: 720 },
    { eventId: 'ceiling-flip', seed: 6112, vx: 320, height: 720 },
    { eventId: 'alien-invasion', seed: 3, vx: -603, vy: -951, width: 360, height: 640 },
    { eventId: 'alien-invasion', seed: 3, vx: -603, vy: -951, width: 3840, height: 2160 },
  ]) {
    const outcome = simulate({ width: 1280, vy: -2500, ...sample });
    console.log(sample.eventId || 'classic', sample.seed, outcome.verdict, outcome.frame,
      JSON.stringify(outcome.info));
  }
}

if (process.env.FLIPGAME_PRINT_ALIEN_PROBE === '1') {
  for (const [width, height] of [[360, 640], [768, 1024], [1280, 720], [1920, 1080], [3840, 2160]]) {
    let classicMakes = 0;
    let alienMakes = 0;
    const alienFrames = [];
    for (let seed = 1; seed <= 300; seed += 1) {
      const vx = ((seed * 49) % 1400) - 750;
      const vy = -900 - ((seed * 17) % 2100);
      if (simulate({ width, height, vx, vy, seed }).verdict === 'MAKE') classicMakes += 1;
      const alienOutcome = simulate({ eventId: 'alien-invasion', width, height, vx, vy, seed });
      if (alienOutcome.verdict === 'MAKE') {
        alienMakes += 1;
        alienFrames.push(alienOutcome.frame);
      }
    }
    alienFrames.sort((a, b) => a - b);
    console.log('probe', width, height, classicMakes, alienMakes,
      alienFrames[Math.floor(alienFrames.length * 0.25)],
      alienFrames[Math.floor(alienFrames.length * 0.50)],
      alienFrames[Math.floor(alienFrames.length * 0.75)]);
  }
}

function testKnownEventMakeabilityFixtures() {
  const fixtures = [
    ['tether-swing', 6110, 500],
    ['mitosis', 6111, 320],
    ['heart-rush', 6115, 320],
    ['ceiling-flip', 6112, 320],
  ];
  for (const [eventId, seed, vx] of fixtures) {
    const outcome = simulate({ eventId, width: 1280, height: 720, vx, vy: -2500, seed });
    assert.equal(outcome.verdict, 'MAKE', `${eventId} regressed its frozen viable shot`);
    assert.ok(outcome.info.rotations >= outcome.info.requiredRotations,
      `${eventId} discarded a completed rotation`);
  }

  const tether = simulate({ eventId: 'tether-swing', width: 1280, height: 720,
    vx: 500, vy: -2500, seed: 6110 });
  const tetherRuntime = tether.physics.getEventRenderState().runtime;
  assert.equal(tetherRuntime.flags.released, true);
  assert.ok(Math.abs(tetherRuntime.releaseAngle) < 0.2);

  const mitosis = simulate({ eventId: 'mitosis', width: 1280, height: 720,
    vx: 320, vy: -2500, seed: 6111 });
  assert.equal(mitosis.info.eventReward.landedCount, 1);
  assert.equal(mitosis.info.meta.copies.length, 2);

  const heart = simulate({ eventId: 'heart-rush', width: 1280, height: 720,
    vx: 320, vy: -2500, seed: 6115 });
  assert.equal(heart.physics.getEventRenderState().runtime.heartbeatCount, 3);

  const ceiling = simulate({ eventId: 'ceiling-flip', width: 1280, height: 720,
    vx: 320, vy: -2500, seed: 6112 });
  assert.ok(ceiling.info.contacts > 0);
  assert.equal(ceiling.physics.getEventRenderState().runtime.landingPlane, 'ceiling');
}

function testMirrorIsKinematicAndTrajectoryNeutral() {
  const classic = loadPhysics();
  const mirror = loadPhysics();
  classic.init(1280, 720);
  mirror.init(1280, 720);
  mirror.forceSpecialEvent('mirror-match');
  classic.applyFlick(350, -2500, 6129, 1, 'disabled');
  mirror.applyFlick(350, -2500, 6129);

  let classicVerdict = null;
  let mirrorVerdict = null;
  for (let frame = 0; frame < 3600 && (!classicVerdict || !mirrorVerdict); frame += 1) {
    classic.step(1 / 60);
    mirror.step(1 / 60);
    const source = mirror.getBottle();
    const baseline = classic.getBottle();
    for (const key of ['x', 'y']) {
      assert.ok(Math.abs(source.position[key] - baseline.position[key]) < 1e-9,
        `Mirror changed source ${key} on frame ${frame}`);
      assert.ok(Math.abs(source.velocity[key] - baseline.velocity[key]) < 1e-9,
        `Mirror changed source velocity ${key} on frame ${frame}`);
    }
    assert.ok(Math.abs(source.angle - baseline.angle) < 1e-9,
      `Mirror changed source angle on frame ${frame}`);
    assert.ok(Math.abs(source.angularVelocity - baseline.angularVelocity) < 1e-9,
      `Mirror changed source spin on frame ${frame}`);

    const copy = mirror.getEventBodies().find((body) => body.label === 'mirror-bottle');
    assert.ok(copy, 'Mirror presentation body disappeared');
    assert.ok(Math.abs(copy.x - (1280 - source.position.x)) < 1e-9);
    assert.ok(Math.abs(copy.y - source.position.y) < 1e-9);
    assert.ok(Math.abs(copy.velocity.x + source.velocity.x) < 1e-9);
    assert.ok(Math.abs(copy.velocity.y - source.velocity.y) < 1e-9);
    assert.ok(Math.abs(copy.angularVelocity + source.angularVelocity) < 1e-9,
      `Mirror copy spin mismatch on frame ${frame}: ${copy.angularVelocity}/${source.angularVelocity}`);

    classicVerdict = classic.checkLanding() || classicVerdict;
    mirrorVerdict = mirror.checkLanding() || mirrorVerdict;
  }
  assert.equal(classicVerdict, 'MAKE');
  assert.equal(mirrorVerdict, classicVerdict);
  assert.ok(Math.abs(mirror.getLastLandingInfo().rotations -
    classic.getLastLandingInfo().rotations) < 1e-9);
}

function testAlienViewportCalibration() {
  const samples = 120;
  let classicMakes = 0;
  for (let seed = 1; seed <= samples; seed += 1) {
    const vx = ((seed * 49) % 1400) - 750;
    const vy = -900 - ((seed * 17) % 2100);
    if (simulate({ width: 1280, height: 720, vx, vy, seed }).verdict === 'MAKE') {
      classicMakes += 1;
    }
  }
  const classicRate = classicMakes / samples;
  const rates = [];
  for (const [width, height] of [[360, 640], [768, 1024], [1280, 720], [1920, 1080], [3840, 2160]]) {
    let makes = 0;
    for (let seed = 1; seed <= samples; seed += 1) {
      const vx = ((seed * 49) % 1400) - 750;
      const vy = -900 - ((seed * 17) % 2100);
      if (simulate({ eventId: 'alien-invasion', width, height, vx, vy, seed }).verdict === 'MAKE') {
        makes += 1;
      }
    }
    const rate = makes / samples;
    rates.push(rate);
    assert.ok(Math.abs(rate - classicRate) <= 0.10,
      `Alien ${width}x${height} rate ${rate} diverged from Classic ${classicRate}`);
  }
  assert.ok(Math.max(...rates) - Math.min(...rates) <= 0.12,
    `Alien viewport spread was ${Math.max(...rates) - Math.min(...rates)}`);

  // The reported cross-viewport seed must retain the same physical outcome.
  for (const [width, height] of [[360, 640], [3840, 2160]]) {
    const outcome = simulate({ eventId: 'alien-invasion', width, height,
      vx: -603, vy: -951, seed: 3 });
    assert.equal(outcome.verdict, 'MAKE');
    assert.ok(outcome.info.bankHits >= 1);

    const nativeAlien = simulateAlienMode({ width, height, vx: -603, vy: -951, seed: 3 });
    assert.equal(nativeAlien.physics.getTarget().halfWidth,
      nativeAlien.physics.alienMetricsForViewport(width, height).ringRadius);
    assert.ok(['MAKE', 'MISS'].includes(nativeAlien.verdict));
    assert.ok(nativeAlien.frame <=
      nativeAlien.physics.alienMetricsForViewport(width, height).timeoutFrames + 2);
  }
}

function testCanonicalGoldenFixtures() {
  assert.equal(Events.rollId({ mode: 'normal', oddsProfile: 'normal', seed: 457 }), 'golden-flip');
  assert.equal(Events.rollId({ mode: 'normal', oddsProfile: 'normal', seed: 77 }), null);
  const golden = simulate({ eventMode: 'normal', width: 1280, height: 720,
    vx: 320, vy: -2500, seed: 457 });
  assert.equal(golden.physics.getLastFlickInfo().eventId, 'golden-flip');
  assert.ok(golden.physics.getEventMetadata().physics.kind === 'golden-balance');
  const ordinary = simulate({ eventMode: 'normal', width: 1280, height: 720,
    vx: 320, vy: -2500, seed: 77 });
  assert.equal(ordinary.physics.getLastFlickInfo().eventId, null);
  assert.equal(ordinary.physics.getEventMetadata(), null);
}

testKnownEventMakeabilityFixtures();
testMirrorIsKinematicAndTrajectoryNeutral();
testAlienViewportCalibration();
testCanonicalGoldenFixtures();

console.log('v111 corrective physics tests passed.');
