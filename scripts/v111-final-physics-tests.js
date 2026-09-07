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
  const physics = context.__physics;
  Object.defineProperty(physics, '__testMatter', { value: context.Matter });
  return physics;
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
    // Match the production per-turn order so arenaTime and turn-owned RNG do
    // not inherit state from a warmed simulation corpus.
    physics.resetBottle();
    physics.seedTurn(seed);
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

function testDeadlineRequiresActiveLandingPlane() {
  const outcome = resolve(startShot({ eventId: 'ice-slide', width: 360, height: 640,
    vx: 0, vy: -1200, seed: 161 }));
  assert.ok(outcome.firstContactFrame >= 59 && outcome.firstContactFrame <= 60,
    `Ice fixture first contacted on frame ${outcome.firstContactFrame}`);
  assert.ok(outcome.frame >= 419 && outcome.frame <= 421,
    `Ice hard deadline resolved on frame ${outcome.frame}, expected about frame 420`);
  assert.ok(outcome.lifecycle.settleMs >= 5999 && outcome.lifecycle.settleMs <= 6017,
    `Ice settlement allowance was ${outcome.lifecycle.settleMs}ms`);
  assert.equal(outcome.verdict, 'MISS');
  assert.equal(outcome.lifecycle.reason, 'off-plane-settle-limit');
  assert.ok(outcome.physics.getBottle().bounds.max.y < outcome.physics.getGroundY() - 6,
    'Ice bumper fixture unexpectedly reached the scoring plane');

  // Shared-logic fixture: after a genuine scoring-plane contact, suspend an
  // upright, already-flipped body above the table until the absolute deadline.
  // This isolates the plane requirement from any one event implementation.
  const suspendedPhysics = startShot({ seed: 7781, vx: 0, vy: -3300 });
  let suspendedAtContact = false;
  let suspended = null;
  for (let frame = 1; frame <= 600; frame += 1) {
    suspendedPhysics.step(1 / 60);
    const lifecycle = suspendedPhysics.getLandingLifecycle();
    if (!suspendedAtContact && lifecycle.firstContactMs != null) {
      suspendedAtContact = true;
      const body = suspendedPhysics.getBottle();
      const Body = suspendedPhysics.__testMatter.Body;
      Body.setAngle(body, 0);
      Body.setPosition(body, { x: body.position.x, y: body.position.y - 48 });
      Body.setVelocity(body, { x: 0, y: 0 });
      Body.setAngularVelocity(body, 0);
      Body.setStatic(body, true);
    }
    const verdict = suspendedPhysics.checkLanding();
    if (verdict) {
      suspended = { verdict, frame, lifecycle: suspendedPhysics.getLandingLifecycle() };
      break;
    }
  }
  assert.ok(suspendedAtContact, 'Generic deadline fixture never contacted the scoring plane');
  assert.ok(suspended, 'Generic off-plane deadline fixture did not resolve');
  assert.equal(suspended.verdict, 'MISS');
  assert.equal(suspended.lifecycle.reason, 'off-plane-settle-limit');
  assert.ok(suspended.lifecycle.settleMs >= 3999 && suspended.lifecycle.settleMs <= 4017,
    `Generic off-plane deadline resolved after ${suspended.lifecycle.settleMs}ms`);

  const earthquake = resolve(startShot({ eventId: 'earthquake', width: 768, height: 1024,
    vx: 3803, vy: -1406, seed: 27 }));
  assert.equal(earthquake.verdict, 'MISS',
    'Earthquake deadline awarded an off-plane/upright pose');
  assert.ok(['underrotated', 'off-plane-settle-limit'].includes(earthquake.lifecycle.reason),
    `Earthquake used an invalid off-plane reason: ${earthquake.lifecycle.reason}`);
  assert.ok(earthquake.physics.getBottle().bounds.max.y < earthquake.physics.getGroundY() - 6,
    'Earthquake fixture unexpectedly reached the scoring plane');

  const grounded = resolve(startShot({ eventId: 'earthquake', width: 1280, height: 720,
    vx: 320, vy: -2500, seed: 1 }));
  assert.equal(grounded.verdict, 'MAKE');
  assert.equal(grounded.lifecycle.reason, 'upright-settle-limit');
  assert.ok(Math.abs(grounded.physics.getBottle().bounds.max.y - grounded.physics.getGroundY()) <= 6,
    'Grounded deadline fixture was not on the scoring plane');
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

function testNativeAlienDeterminismAndModeParity() {
  for (const seed of [1, 3]) {
    const vx = ((seed * 49) % 1400) - 750;
    const vy = -900 - ((seed * 17) % 2100);
    for (const [width, height] of [[360, 640], [768, 1024], [3840, 2160]]) {
      const outcome = resolve(startShot({ nativeAlien: true, width, height, vx, vy, seed }), 900);
      const replay = resolve(startShot({ nativeAlien: true, width, height, vx, vy, seed }), 900);
      const invasion = resolve(startShot({ eventId: 'alien-invasion', width, height,
        vx, vy, seed }), 900);
      for (const comparison of [replay, invasion]) {
        assert.equal(comparison.verdict, outcome.verdict);
        assert.equal(comparison.frame, outcome.frame);
        assert.equal(comparison.info.reason, outcome.info.reason);
        assert.equal(comparison.info.bankHits, outcome.info.bankHits);
      }
      if (outcome.verdict === 'MAKE') {
        assert.ok(outcome.info.bankHits >= 1, 'Alien scored without a bank');
        assert.equal(outcome.info.reason, 'tractor-ring');
      }
      assert.equal(outcome.physics.getLastFlickInfo().gravityY, 0.10);
      assert.equal(invasion.physics.getLastFlickInfo().gravityY, 0.10);
    }
  }
}

function corpusInput(seed) {
  return {
    vx: ((seed * 49) % 1400) - 750,
    vy: -900 - ((seed * 17) % 2100),
  };
}

function testNativeAlienViewportSmoke() {
  // Statistical calibration moved to v112-alien-calibration-tests.js, whose
  // authoritative 240-shot corpus enforces matched Classic ±10pp and viewport
  // spread. Keep this legacy suite focused on lifecycle/bank invariants.
  for (const [width, height] of [
    [360, 640], [768, 1024], [1280, 720], [1920, 1080], [3840, 2160],
  ]) {
    let banked = 0;
    for (let seed = 1; seed <= 12; seed += 1) {
      const outcome = resolve(startShot({ nativeAlien: true, width, height, seed,
        ...corpusInput(seed) }), 900);
      if (outcome.info.bankHits > 0) banked += 1;
      if (outcome.verdict === 'MAKE') {
        assert.ok(outcome.info.bankHits >= 1);
        assert.equal(outcome.info.reason, 'tractor-ring');
      }
      assert.ok(outcome.frame <= outcome.physics.alienMetricsForViewport(width, height).timeoutFrames + 2);
    }
    assert.ok(banked > 0, `Alien never reached a valid bank at ${width}x${height}`);
  }
}

function testWindRemainsPhysicalButNotAutomatic() {
  for (const fixture of [
    { seed: 5, vx: 9594, vy: 647 },
    { seed: 3, vx: -6244, vy: -712 },
  ]) {
    const outcome = resolve(startShot({ eventId: 'wind-tunnel', ...fixture }));
    assert.ok(['MAKE', 'MISS'].includes(outcome.verdict));
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
    assert.ok(['MAKE', 'MISS'].includes(rejected.verdict));
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

testDeadlineRequiresActiveLandingPlane();
testContactDeadlineAndEventResets();
testWindRemainsPhysicalButNotAutomatic();
testAssistedEventsRemainSkillDependent();
testNativeAlienDeterminismAndModeParity();
testNativeAlienViewportSmoke();

console.log('v111 final physics deadline and native Alien tests passed.');
