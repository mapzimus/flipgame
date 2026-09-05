'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const ALIEN_PROFILE = Object.freeze({
  gravity: 0.10, frictionAir: 0.0025, friction: 0.02, restitution: 0.90,
  spinScale: 0.7, launchScale: 1.50, horizDivisor: 140, horizMax: 15,
  wallBounce: 0.96, ceiling: true, floorResolve: true, landOnTarget: true,
  targetHalfWidth: 96, requireFlip: false, deflector: true, deflectorCount: 3,
  saucerCount: 6, keepWalls: true, minHorizRatio: 0.12, strictTarget: false,
  allowSlideIn: false, hitScale: 0.86, alienPortal: true, arenaExpand: 1,
  mobileArenaExpand: 1.42, arenaExpandY: 1, mobileArenaExpandY: 1.14,
  arenaZoom: 1, mobileArenaZoom: 1,
});

function loadPhysics() {
  const context = vm.createContext({
    console, Math, window: { matchMedia: () => ({ matches: false }) },
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

function startShot({ eventId = null, nativeAlien = false, width = 1280, height = 720,
  vx = 320, vy = -2500, seed = 1 }) {
  const physics = loadPhysics();
  physics.init(width, height);
  if (nativeAlien) {
    physics.setProfile(ALIEN_PROFILE);
    physics.resetBottle();
    physics.seedTurn(seed);
  } else if (eventId) {
    assert.equal(physics.forceSpecialEvent(eventId), true);
  }
  physics.applyFlick(vx, vy, seed, 1,
    nativeAlien ? 'disabled' : (eventId ? 'normal' : 'disabled'));
  return physics;
}

function resolve(physics, maxFrames = 1800) {
  let firstContactFrame = null;
  for (let frame = 1; frame <= maxFrames; frame += 1) {
    physics.step(1 / 60);
    const lifecycle = physics.getLandingLifecycle();
    if (firstContactFrame == null && lifecycle.firstContactMs != null) firstContactFrame = frame;
    const verdict = physics.checkLanding();
    if (verdict) {
      return { verdict, frame, firstContactFrame,
        lifecycle: physics.getLandingLifecycle(), info: physics.getLastLandingInfo(), physics };
    }
  }
  throw new Error('Shot did not resolve');
}

function testIceDeadlineSurvivesTemporaryUngrounding() {
  const outcome = resolve(startShot({ eventId: 'ice-slide', width: 360, height: 640,
    vx: 0, vy: -1800, seed: 3668341011 }));
  assert.equal(outcome.firstContactFrame, 60);
  assert.ok(outcome.frame >= 419 && outcome.frame <= 421,
    `Ice hard deadline resolved on frame ${outcome.frame}, expected about frame 420`);
  assert.ok(outcome.lifecycle.settleMs >= 5999 && outcome.lifecycle.settleMs <= 6017,
    `Ice settlement allowance was ${outcome.lifecycle.settleMs}ms`);
  assert.equal(outcome.verdict, 'MAKE');
  assert.equal(outcome.lifecycle.reason, 'upright-settle-limit');
}

function testContactDeadlineAndEventResets() {
  const ordinary = resolve(startShot({ seed: 7781, vx: 0, vy: -2500 }));
  assert.ok(ordinary.firstContactFrame != null);
  assert.ok(ordinary.lifecycle.settleMs <= 4017,
    `Ordinary settlement exceeded four seconds: ${ordinary.lifecycle.settleMs}`);

  const bouncy = resolve(startShot({ eventId: 'bouncy-bottle', seed: 6104 }));
  assert.ok(bouncy.info.contacts >= 1);
  assert.ok(bouncy.lifecycle.settleMs <= 6017,
    `Bouncy settlement exceeded six seconds: ${bouncy.lifecycle.settleMs}`);

  const trampolinePhysics = startShot({ eventId: 'trampoline', seed: 6107 });
  let sawRelaunch = false;
  for (let frame = 1; frame <= 1200 && !sawRelaunch; frame += 1) {
    trampolinePhysics.step(1 / 60);
    sawRelaunch = trampolinePhysics.getEventRenderState().runtime.flags.relaunched === true;
  }
  assert.equal(sawRelaunch, true, 'Trampoline never relaunched');
  assert.equal(trampolinePhysics.getLandingLifecycle().firstContactMs, null,
    'Trampoline compression incorrectly consumed the return-shot deadline');
  const trampoline = resolve(trampolinePhysics);
  assert.ok(trampoline.lifecycle.settleMs <= 4017);

  const rewindPhysics = startShot({ eventId: 'rewind', seed: 6120 });
  for (let frame = 0; frame < 90; frame += 1) rewindPhysics.step(1 / 60);
  assert.equal(rewindPhysics.forceLanding('MISS', { reason: 'deadline-regression' }), null);
  let replayed = false;
  for (let frame = 0; frame < 600 && !replayed; frame += 1) {
    rewindPhysics.step(1 / 60);
    replayed = rewindPhysics.getEventRenderState().runtime.flags.replayed === true;
  }
  assert.equal(replayed, true);
  assert.equal(rewindPhysics.getLandingLifecycle().firstContactMs, null,
    'Rewind first attempt incorrectly consumed the replay deadline');
  const rewind = resolve(rewindPhysics);
  assert.equal(rewind.info.meta.rewind.firstFailureReason, 'deadline-regression');
  assert.equal(rewind.info.meta.rewind.replayed, true);
}

function testNativeAlienExactCrossViewportSeeds() {
  for (const seed of [1, 3]) {
    const vx = ((seed * 49) % 1400) - 750;
    const vy = -900 - ((seed * 17) % 2100);
    const outcomes = [];
    for (const [width, height] of [[360, 640], [768, 1024], [3840, 2160]]) {
      const outcome = resolve(startShot({ nativeAlien: true, width, height, vx, vy, seed }), 900);
      const bottle = outcome.physics.getBottle();
      const target = outcome.physics.getTarget();
      outcomes.push({ width, height, verdict: outcome.verdict, frame: outcome.frame,
        banks: outcome.info.bankHits,
        distance: target ? Math.hypot(bottle.position.x - target.x, bottle.position.y - target.y) : null });
      if (outcome.verdict === 'MAKE') {
        assert.ok(outcome.info.bankHits >= 1, 'Alien scored without a bank');
        assert.equal(outcome.info.reason, 'tractor-ring');
      }
    }
    if (process.env.FLIPGAME_PRINT_EXACT === '1') console.log('native-alien-exact', seed, outcomes);
    assert.equal(new Set(outcomes.map((entry) => entry.verdict)).size, 1,
      `Native Alien seed ${seed} diverged across viewports: ${JSON.stringify(outcomes)}`);
  }
}

function corpusInput(seed) {
  return {
    vx: ((seed * 49) % 1400) - 750,
    vy: -900 - ((seed * 17) % 2100),
  };
}

function testNativeAlienViewportCorpus() {
  const samples = 100;
  let classicMakes = 0;
  for (let seed = 1; seed <= samples; seed += 1) {
    if (resolve(startShot({ width: 1280, height: 720, seed, ...corpusInput(seed) })).verdict === 'MAKE') {
      classicMakes += 1;
    }
  }
  const classicRate = classicMakes / samples;
  const rates = [];
  for (const [width, height] of [
    [360, 640], [768, 1024], [1280, 720], [1920, 1080], [3840, 2160],
  ]) {
    let makes = 0;
    for (let seed = 1; seed <= samples; seed += 1) {
      if (resolve(startShot({ nativeAlien: true, width, height, seed,
        ...corpusInput(seed) }), 900).verdict === 'MAKE') makes += 1;
    }
    rates.push({ width, height, rate: makes / samples });
  }
  const minRate = Math.min(...rates.map((entry) => entry.rate));
  const maxRate = Math.max(...rates.map((entry) => entry.rate));
  if (process.env.FLIPGAME_PRINT_CORPUS === '1') {
    console.log('native-alien-corpus', { samples, classicRate, rates });
  }
  assert.ok(rates.every((entry) => Math.abs(entry.rate - classicRate) <= 0.10),
    `Native Alien rates diverged from Classic ${classicRate}: ${JSON.stringify(rates)}`);
  assert.ok(maxRate - minRate <= 0.12,
    `Native Alien viewport spread was ${maxRate - minRate}: ${JSON.stringify(rates)}`);
}

function testWindRemainsPhysicalButNotAutomatic() {
  for (const fixture of [
    { seed: 5, vx: 9594, vy: 647 },
    { seed: 3, vx: -6244, vy: -712 },
  ]) {
    const outcome = resolve(startShot({ eventId: 'wind-tunnel', ...fixture }));
    assert.equal(outcome.verdict, 'MISS',
      `Wind converted rejected input seed ${fixture.seed} into an automatic make`);
    assert.ok(outcome.physics.getEventRenderState().runtime.gustVector,
      'Wind lost its physical gust while removing outcome assistance');
    assert.ok(outcome.lifecycle.settleMs <= 5017,
      `Wind exceeded its five-second settle limit: ${outcome.lifecycle.settleMs}`);
  }

  let makes = 0;
  let misses = 0;
  for (let seed = 1; seed <= 100; seed += 1) {
    const vx = ((seed * 7919) % 20001) - 10000;
    const vy = 800 - ((seed * 271) % 4801);
    const outcome = resolve(startShot({ eventId: 'wind-tunnel', vx, vy, seed }));
    if (outcome.verdict === 'MAKE') makes += 1;
    else misses += 1;
  }
  assert.ok(makes >= 5, `Wind corpus had too few makes: ${makes}/100`);
  assert.ok(misses >= 5, `Wind corpus had too few misses: ${misses}/100`);

  const cap = startShot({ eventId: 'wind-tunnel', seed: 90210 });
  for (let frame = 0; frame < 45; frame += 1) cap.step(1 / 60);
  assert.equal(cap.forceLanding('MAKE', { reason: 'cap', onCap: true }), 'MAKE');
  assert.equal(cap.getLastLandingInfo().onCap, true,
    'Wind rejected a valid settled cap verdict');
}

function testAssistedEventsRemainSkillDependent() {
  for (const eventId of ['power-launch', 'trampoline', 'heart-rush']) {
    const rejected = resolve(startShot({ eventId, seed: 5, vx: 9594, vy: 647 }));
    assert.equal(rejected.verdict, 'MISS',
      `${eventId} converted the frozen rejected input into an automatic make ` +
      `(rotations=${rejected.info.rotations}, reason=${rejected.info.reason})`);
    assert.ok(rejected.lifecycle.settleMs <= 4017,
      `${eventId} exceeded its four-second settle limit`);

    if (eventId === 'power-launch') {
      assert.ok(rejected.physics.getLastFlickInfo().upSpeed === 0);
      assert.ok(Math.abs(rejected.physics.getBottle().position.x - 640) > 100,
        'Power Launch lost its large physical displacement');
    } else if (eventId === 'trampoline') {
      assert.equal(rejected.physics.getEventRenderState().runtime.flags.relaunched, true,
        'Trampoline lost its physical relaunch');
    } else {
      assert.equal(rejected.physics.getEventRenderState().runtime.heartbeatCount, 3,
        'Heart Rush lost its three physical impulses');
    }

    let makes = 0;
    let misses = 0;
    for (let seed = 1; seed <= 100; seed += 1) {
      const vx = ((seed * 7919) % 20001) - 10000;
      const vy = 800 - ((seed * 271) % 4801);
      const outcome = resolve(startShot({ eventId, vx, vy, seed }));
      if (outcome.verdict === 'MAKE') makes += 1;
      else misses += 1;
    }
    assert.ok(makes >= 5, `${eventId} corpus had too few makes: ${makes}/100`);
    assert.ok(misses >= 5, `${eventId} corpus had too few misses: ${misses}/100`);
  }
}

testIceDeadlineSurvivesTemporaryUngrounding();
testContactDeadlineAndEventResets();
testWindRemainsPhysicalButNotAutomatic();
testAssistedEventsRemainSkillDependent();
testNativeAlienExactCrossViewportSeeds();
testNativeAlienViewportCorpus();

console.log('v111 final physics deadline and native Alien tests passed.');
