'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Cpu = require('../js/v112-cpu.js');

const root = path.resolve(__dirname, '..');
const UINT32_MAX = 0xffffffff;
const VIEWPORT_REFLOWS = Object.freeze([
  Object.freeze({ from: [360, 740], to: [1280, 720] }),
  Object.freeze({ from: [1280, 720], to: [3840, 2160] }),
  Object.freeze({ from: [3840, 2160], to: [360, 740] }),
]);

const ALIEN_PROFILE = Object.freeze({
  gravity: 0.10,
  frictionAir: 0.0025,
  friction: 0.02,
  restitution: 0.90,
  spinScale: 0.7,
  launchScale: 1.50,
  horizDivisor: 140,
  horizMax: 15,
  wallBounce: 0.96,
  ceiling: true,
  floorResolve: true,
  landOnTarget: true,
  targetHalfWidth: 96,
  requireFlip: false,
  deflector: true,
  deflectorCount: 3,
  saucerCount: 6,
  keepWalls: true,
  minHorizRatio: 0.12,
  strictTarget: false,
  allowSlideIn: false,
  hitScale: 0.86,
  alienPortal: true,
  arenaExpand: 1,
  mobileArenaExpand: 1.42,
  arenaExpandY: 1,
  mobileArenaExpandY: 1.14,
});

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

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

function configure(physics, mode, width, height) {
  physics.setProfile(null);
  physics.init(width, height);
  if (mode === 'native-alien') {
    physics.setProfile(ALIEN_PROFILE);
    physics.resetBottle();
  }
}

function planAlienLaunch(physics, seed) {
  const preview = physics.getAlienArenaState(seed);
  return Cpu.createLaunch({
    difficulty: 'hard',
    physicsModeId: 'alien',
    seed,
    target: preview.target,
    arena: { worldW: preview.target.worldW },
  });
}

function launchAlien(physics, mode, seed) {
  physics.seedTurn(seed);
  const launch = planAlienLaunch(physics, seed);
  if (mode === 'alien-invasion') {
    assert.equal(physics.forceSpecialEvent('alien-invasion'), true);
  }
  physics.applyFlick(launch.vx, launch.vy, seed, 1,
    mode === 'alien-invasion' ? 'normal' : 'disabled', false,
    { inputFeelMode: launch.inputFeelMode });
  return launch;
}

function compactState(physics) {
  const body = physics.getBottle();
  const target = physics.getTarget();
  const bank = physics.getAlienBankTelemetry();
  return [
    body.position.x,
    body.position.y,
    body.velocity.x,
    body.velocity.y,
    body.angle,
    body.angularVelocity,
    target && target.x,
    target && target.y,
    target && target.armed,
    bank.hits,
    bank.tick,
    bank.pending,
  ].map((value) => typeof value === 'number' ? Number(value.toFixed(9)) : value);
}

function finishShot(physics, options = {}) {
  const states = [];
  let reflowResult;
  let beforeReflowHint;
  let afterReflowHint;
  for (let frame = 1; frame <= 1200; frame += 1) {
    physics.step(1 / 60);
    if (options.reflowAt === frame) {
      beforeReflowHint = physics.getViewHint();
      reflowResult = physics.reflow(options.to[0], options.to[1], options.bottomInset || 0);
      afterReflowHint = physics.getViewHint();
    }
    if (frame % 12 === 0) states.push(compactState(physics));
    const verdict = physics.checkLanding();
    if (verdict) {
      return {
        verdict,
        frame,
        states,
        info: physics.getLastLandingInfo(),
        reflowResult,
        beforeReflowHint,
        afterReflowHint,
      };
    }
  }
  throw new Error('Alien hardening shot did not resolve');
}

function replay(mode, width, height, seed) {
  const physics = loadPhysics();
  configure(physics, mode, width, height);
  const launch = launchAlien(physics, mode, seed);
  const outcome = finishShot(physics);
  return { launch, outcome };
}

function assertEmptyBankState(physics, message) {
  const telemetry = physics.getAlienBankTelemetry();
  assert.equal(telemetry.hits, 0, `${message}: stale hit count`);
  assert.equal(telemetry.tick, 0, `${message}: stale step tick`);
  assert.equal(telemetry.pending, 0, `${message}: stale pending bank`);
  assert.equal(telemetry.trace.length, 0, `${message}: stale bank trace`);
  const snapshot = physics.getAlienArenaState();
  assert.equal(snapshot.bank.hits, 0, `${message}: public snapshot leaked hits`);
  assert.equal(snapshot.bank.tick, 0, `${message}: public snapshot leaked tick`);
  assert.equal(snapshot.bank.pending, 0, `${message}: public snapshot leaked pending state`);
  assert.equal(snapshot.bank.trace.length, 0, `${message}: public snapshot leaked trace`);
  if (snapshot.target) assert.equal(snapshot.target.armed, false, `${message}: ring stayed armed`);
}

function testStrictPublicSeeds() {
  const invalid = [undefined, null, '', ' ', '0', '1', true, false, 0.5, -1,
    UINT32_MAX + 1, NaN, Infinity, -Infinity, new Number(1), {}, []];
  for (const seed of invalid) {
    assert.throws(() => Cpu.createLaunch({ seed }), /unsigned 32-bit seed/);
  }

  const seedApis = [
    ['seedTurn', false, (physics, seed) => physics.seedTurn(seed)],
    ['alienTargetForSeed', false, (physics, seed) => physics.alienTargetForSeed(seed)],
    ['getAlienArenaState', false, (physics, seed) => physics.getAlienArenaState(seed)],
    ['rareEventForSeed', false, (physics, seed) => physics.rareEventForSeed(seed)],
    ['insanityEventForSeed', false, (physics, seed) => physics.insanityEventForSeed(seed)],
    // applyFlick intentionally permits an omitted seed for local play, but an
    // explicitly supplied value must still be a strict uint32.
    ['applyFlick', true, (physics, seed) => physics.applyFlick(0, -2400, seed, 1, 'disabled')],
  ];
  for (const [name, allowsOmittedSeed, invoke] of seedApis) {
    for (const seed of invalid.filter((value) => !(allowsOmittedSeed && value === undefined))) {
      const physics = loadPhysics();
      physics.init(1280, 720);
      assert.throws(() => invoke(physics, seed), /unsigned 32-bit seed/,
        `${name} accepted ${String(seed)}`);
    }
  }
  for (const seed of [0, 1, UINT32_MAX]) {
    assert.equal(Cpu.createLaunch({ seed }).seed, seed >>> 0);
    const physics = loadPhysics();
    physics.init(1280, 720);
    physics.seedTurn(seed);
    assert.doesNotThrow(() => physics.alienTargetForSeed(seed));
    assert.doesNotThrow(() => physics.getAlienArenaState(seed));
    assert.doesNotThrow(() => physics.rareEventForSeed(seed));
    assert.doesNotThrow(() => physics.insanityEventForSeed(seed));
  }
  const optional = loadPhysics();
  optional.init(1280, 720);
  assert.doesNotThrow(() => optional.getAlienArenaState(),
    'state snapshot without a preview seed must remain valid');
  assert.doesNotThrow(() => optional.applyFlick(0, -2400),
    'unseeded local flick must retain its documented random-seed path');
}

function testImmediateCleanupAndReplayIsolation() {
  for (const mode of ['native-alien', 'alien-invasion']) {
    const physics = loadPhysics();
    configure(physics, mode, 1280, 720);
    launchAlien(physics, mode, 37);
    for (let frame = 0; frame < 360 && physics.getAlienBankTelemetry().hits < 1; frame += 1) {
      physics.step(1 / 60);
      physics.checkLanding();
    }
    assert.ok(physics.getAlienBankTelemetry().hits > 0,
      `${mode} cleanup fixture never produced a bank`);
    assert.equal(physics.getTarget().armed, true, `${mode} bank did not arm ring`);

    physics.cleanupEvent('hardening-test');
    assertEmptyBankState(physics, `${mode} immediate cleanup`);
    assert.equal(physics.getAlienArenaState().active, mode === 'native-alien',
      `${mode} cleanup restored the wrong physics profile`);

    physics.resetBottle();
    const replaySeed = 0xd00dfeed;
    const reusedLaunch = launchAlien(physics, mode, replaySeed);
    const reusedOutcome = finishShot(physics);
    const fresh = replay(mode, 1280, 720, replaySeed);
    assert.deepEqual(reusedLaunch, fresh.launch,
      `${mode} cleanup changed the next deterministic launch`);
    assert.deepEqual(reusedOutcome.states, fresh.outcome.states,
      `${mode} cleanup leaked bank/cooldown/RNG state into the next replay`);
    assert.equal(reusedOutcome.verdict, fresh.outcome.verdict);
    assert.deepEqual(plain(reusedOutcome.info), plain(fresh.outcome.info));
  }
}

function testDeferredAlienReflowAndRngIsolation() {
  for (const mode of ['native-alien', 'alien-invasion']) {
    for (let index = 0; index < VIEWPORT_REFLOWS.length; index += 1) {
      const fixture = VIEWPORT_REFLOWS[index];
      const seed = (0x4a17b10b + Math.imul(index + 1, 0x9e3779b9)) >>> 0;
      const baseline = replay(mode, fixture.from[0], fixture.from[1], seed);

      const physics = loadPhysics();
      configure(physics, mode, fixture.from[0], fixture.from[1]);
      const launch = launchAlien(physics, mode, seed);
      const resized = finishShot(physics, { reflowAt: 12, to: fixture.to });
      assert.deepEqual(launch, baseline.launch,
        `${mode} ${fixture.from.join('x')} resize changed launch RNG`);
      assert.equal(resized.reflowResult, false,
        `${mode} ${fixture.from.join('x')} applied physics reflow during flight`);
      assert.equal(physics.hasDeferredReflow(), true,
        `${mode} ${fixture.from.join('x')} lost deferred reflow`);
      assert.equal(resized.beforeReflowHint.worldW, resized.afterReflowHint.worldW,
        `${mode} ${fixture.from.join('x')} changed world width during flight`);
      assert.equal(resized.beforeReflowHint.worldH, resized.afterReflowHint.worldH,
        `${mode} ${fixture.from.join('x')} changed world height during flight`);
      assert.deepEqual(resized.states, baseline.outcome.states,
        `${mode} ${fixture.from.join('x')} deferred resize changed trajectory/RNG`);
      assert.equal(resized.verdict, baseline.outcome.verdict,
        `${mode} ${fixture.from.join('x')} deferred resize changed verdict`);
      assert.deepEqual(plain(resized.info), plain(baseline.outcome.info),
        `${mode} ${fixture.from.join('x')} deferred resize changed landing facts`);

      physics.cleanupEvent('resize-test');
      assertEmptyBankState(physics, `${mode} resize cleanup`);
      physics.resetBottle();
      assert.equal(physics.hasDeferredReflow(), false,
        `${mode} did not consume deferred reflow on reset`);
      const restored = physics.getAlienArenaState();
      assert.equal(restored.metrics.width, fixture.to[0],
        `${mode} restored the wrong viewport width`);
      assert.equal(restored.metrics.height, fixture.to[1],
        `${mode} restored the wrong viewport height`);
      assert.equal(restored.active, mode === 'native-alien',
        `${mode} resize reset restored the wrong activity`);

      const nextSeed = (seed ^ 0xa5a5a5a5) >>> 0;
      const reusedLaunch = launchAlien(physics, mode, nextSeed);
      const reusedOutcome = finishShot(physics);
      const fresh = replay(mode, fixture.to[0], fixture.to[1], nextSeed);
      assert.deepEqual(reusedLaunch, fresh.launch,
        `${mode} deferred reflow changed next launch`);
      assert.deepEqual(reusedOutcome.states, fresh.outcome.states,
        `${mode} deferred reflow changed next seeded replay`);
      assert.equal(reusedOutcome.verdict, fresh.outcome.verdict);
      assert.deepEqual(plain(reusedOutcome.info), plain(fresh.outcome.info));
    }
  }
}

testStrictPublicSeeds();
testImmediateCleanupAndReplayIsolation();
testDeferredAlienReflowAndRngIsolation();

console.log('v1.12 physics hardening tests passed.');
