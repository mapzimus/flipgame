'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const VIEWPORTS = Object.freeze([
  [360, 640],
  [768, 1024],
  [1280, 720],
  [1920, 1080],
  [3840, 2160],
]);
// The deterministic sequence intentionally spans weak, controlled, and hard
// gestures. Its first short prefix is not representative, so qualification
// always uses at least 240 shots per viewport.
const SAMPLES = Math.max(240, Number(process.env.FLIPGAME_ALIEN_SAMPLES) || 240);
const MEASURE_ONLY = process.env.FLIPGAME_ALIEN_MEASURE_ONLY === '1';

// Keep this fixture identical to the shipped Alien object profile. Physics owns
// the normalized Alien contract, so an Alien Invasion must behave the same even
// though its selected object continues to use the ordinary profile.
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

function loadPhysics({ coarse = false } = {}) {
  const context = vm.createContext({
    console,
    Math,
    window: { matchMedia: () => ({ matches: coarse }) },
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

const physics = loadPhysics();

function corpusInput(seed) {
  return {
    vx: ((seed * 49) % 1400) - 750,
    vy: -900 - ((seed * 17) % 2100),
  };
}

function startShot({ mode, width, height, seed, vx, vy }) {
  physics.setProfile(null);
  physics.init(width, height);
  if (mode === 'native-alien') {
    physics.setProfile(ALIEN_PROFILE);
    physics.resetBottle();
  }
  physics.seedTurn(seed);
  if (mode === 'alien-invasion') {
    assert.equal(physics.forceSpecialEvent('alien-invasion'), true);
  }
  physics.applyFlick(vx, vy, seed, 1,
    mode === 'alien-invasion' ? 'normal' : 'disabled');
  return physics;
}

function resolveShot(options) {
  const active = startShot(options);
  const initialTarget = active.getTarget();
  const initialRing = initialTarget && {
    halfWidth: initialTarget.halfWidth,
    hitHalfWidth: initialTarget.hitHalfWidth,
  };
  let minimumRingOffset = Infinity;
  const trajectory = [];
  for (let frame = 1; frame <= 1200; frame += 1) {
    active.step(1 / 60);
    if (frame % 30 === 0) {
      const body = active.getBottle();
      trajectory.push([frame, body.position.x, body.position.y,
        body.velocity.x, body.velocity.y].map((value) => Number(value).toFixed(3)).join(':'));
    }
    const target = active.getTarget();
    if (target && target.armed) {
      const body = active.getBottle();
      minimumRingOffset = Math.min(minimumRingOffset,
        Math.hypot(body.position.x - target.x, body.position.y - target.y) /
          Math.max(1, target.hitHalfWidth));
    }
    const verdict = active.checkLanding();
    if (verdict) {
      return {
        verdict,
        frame,
        info: active.getLastLandingInfo(),
        target: active.getTarget(),
        minimumRingOffset,
        initialRing,
        trajectory: trajectory.join('|'),
        bankTelemetry: active.getAlienBankTelemetry(),
        flick: active.getLastFlickInfo(),
      };
    }
  }
  throw new Error(`${options.mode} did not resolve at ${options.width}x${options.height}, seed ${options.seed}`);
}

function assertBankContract(outcome, message) {
  const trace = outcome.bankTelemetry.trace;
  const bySurface = new Map();
  const schedule = [
    [1, 1],
    [0.88, 0.72],
    [0.80, 0.58],
    [0.72, 0.45],
  ];
  assert.equal(trace.length, outcome.info.bankHits, `${message}: trace/hit count diverged`);
  assert.equal(outcome.target.halfWidth, outcome.initialRing.halfWidth,
    `${message}: rendered ring radius changed after banks`);
  assert.equal(outcome.target.hitHalfWidth, outcome.initialRing.hitHalfWidth,
    `${message}: scoring ring radius changed after banks`);
  for (let index = 0; index < trace.length; index += 1) {
    const bank = trace[index];
    assert.equal(bank.hit, index + 1, `${message}: non-sequential bank telemetry`);
    assert.ok(['wall', 'deflector', 'saucer'].includes(bank.label),
      `${message}: ${bank.label} incorrectly armed the ring`);
    const previousTick = bySurface.get(bank.surfaceId);
    if (previousTick != null) {
      assert.ok(bank.tick - previousTick >= 8,
        `${message}: surface ${bank.surfaceId} double-counted inside cooldown`);
    }
    bySurface.set(bank.surfaceId, bank.tick);
    const expected = schedule[Math.min(index, schedule.length - 1)];
    assert.equal(bank.linearRetention, expected[0]);
    assert.equal(bank.angularRetention, expected[1]);
    const expectedSpeed = index === 0 || bank.preSpeed <= 6
      ? bank.preSpeed : Math.max(6, bank.preSpeed * expected[0]);
    assertNear(bank.postSpeed, expectedSpeed, 1e-7,
      `${message}: bank ${index + 1} linear damping`);
    const expectedAngular = index === 0
      ? bank.preAngular : bank.preAngular * expected[1];
    assertNear(bank.postAngular, expectedAngular, 1e-9,
      `${message}: bank ${index + 1} angular damping`);
  }
}

function snapshotArena(mode, width, height, seed = 37) {
  const active = startShot({ mode, width, height, seed, ...corpusInput(seed) });
  const hint = active.getViewHint();
  const obstacles = active.getObstacles();
  const target = active.getTarget();
  return {
    target: target && {
      halfWidth: target.halfWidth,
      hitHalfWidth: target.hitHalfWidth,
      armed: target.armed,
    },
    deflectors: obstacles.deflectors.map((item) => item.vertices.map((point) => ({
      x: point.x / hint.worldW,
      y: point.y / hint.worldH,
    }))),
    saucers: obstacles.saucers.map((item) => ({
      x: item.x / hint.worldW,
      y: item.y / hint.worldH,
      rx: item.rx / hint.worldW,
      ry: item.ry / hint.worldH,
    })),
  };
}

function assertNear(actual, expected, epsilon, message) {
  assert.ok(Math.abs(actual - expected) <= epsilon,
    `${message}: ${actual} vs ${expected}`);
}

function testSharedArenaContract() {
  for (const [width, height] of VIEWPORTS) {
    const native = snapshotArena('native-alien', width, height);
    const invasion = snapshotArena('alien-invasion', width, height);
    if (MEASURE_ONLY) continue;
    assert.ok(native.deflectors.length > 0, `Native Alien lost its deflectors at ${width}x${height}`);
    assert.ok(native.saucers.length > 0, `Native Alien lost its UFOs at ${width}x${height}`);
    assert.equal(invasion.deflectors.length, native.deflectors.length,
      `Alien Invasion deflector count differs at ${width}x${height}`);
    assert.equal(invasion.saucers.length, native.saucers.length,
      `Alien Invasion UFO count differs at ${width}x${height}`);
    assertNear(invasion.target.halfWidth, native.target.halfWidth, 1e-9,
      `Alien ring render radius differs at ${width}x${height}`);
    assertNear(invasion.target.hitHalfWidth, native.target.hitHalfWidth, 1e-9,
      `Alien scoring radius differs at ${width}x${height}`);
    assert.equal(native.target.armed, false,
      `Native Alien ring started armed at ${width}x${height}`);
    assert.equal(invasion.target.armed, false,
      `Alien Invasion ring started armed at ${width}x${height}`);
    const nativeFlick = startShot({ mode: 'native-alien', width, height,
      seed: 37, ...corpusInput(37) }).getLastFlickInfo();
    const invasionFlick = startShot({ mode: 'alien-invasion', width, height,
      seed: 37, ...corpusInput(37) }).getLastFlickInfo();
    for (const flick of [nativeFlick, invasionFlick]) {
      assert.equal(flick.gravityScale, 0.10,
        `Alien gravity scale telemetry is stale at ${width}x${height}`);
      assert.equal(flick.gravityY, 0.10,
        `Alien engine gravity telemetry is stale at ${width}x${height}`);
    }
    for (let i = 0; i < native.deflectors.length; i += 1) {
      for (let j = 0; j < native.deflectors[i].length; j += 1) {
        assertNear(invasion.deflectors[i][j].x, native.deflectors[i][j].x, 1e-9,
          `Alien deflector ${i}/${j} x differs at ${width}x${height}`);
        assertNear(invasion.deflectors[i][j].y, native.deflectors[i][j].y, 1e-9,
          `Alien deflector ${i}/${j} y differs at ${width}x${height}`);
      }
    }
    for (let i = 0; i < native.saucers.length; i += 1) {
      for (const key of ['x', 'y', 'rx', 'ry']) {
        assertNear(invasion.saucers[i][key], native.saucers[i][key], 1e-9,
          `Alien UFO ${i} ${key} differs at ${width}x${height}`);
      }
    }
  }
}

function testCompactPredicateBoundaries() {
  for (const coarse of [false, true]) {
    const probe = loadPhysics({ coarse });
    for (const width of [899, 900, 1024, 1099, 1100]) {
      const expected = width < 900 || (coarse && width < 1100);
      assert.equal(probe.alienMetricsForViewport(width, 720).compact, expected,
        `compact predicate failed at ${width}px (${coarse ? 'coarse' : 'fine'})`);
    }
  }
}

function measureMode(mode, width, height) {
  let makes = 0;
  let misses = 0;
  let banklessMakes = 0;
  let wrongReasons = 0;
  let bankedShots = 0;
  let maxBanks = 0;
  const bankLabels = new Set();
  const sequence = [];
  for (let seed = 1; seed <= SAMPLES; seed += 1) {
    const outcome = resolveShot({ mode, width, height, seed, ...corpusInput(seed) });
    if (outcome.info.bankHits > 0) bankedShots += 1;
    sequence.push(`${outcome.verdict}:${outcome.info.reason}:${outcome.info.bankHits}:` +
      outcome.trajectory);
    if (mode !== 'classic') {
      assertBankContract(outcome, `${mode} ${width}x${height} seed ${seed}`);
      maxBanks = Math.max(maxBanks, outcome.info.bankHits);
      for (const bank of outcome.bankTelemetry.trace) bankLabels.add(bank.label);
    }
    if (outcome.verdict === 'MAKE') {
      makes += 1;
      if (outcome.info.bankHits < 1) banklessMakes += 1;
      if (outcome.info.reason !== 'tractor-ring') wrongReasons += 1;
    } else {
      misses += 1;
    }
  }
  return { mode, width, height, makes, misses, bankedShots, maxBanks,
    bankLabels: [...bankLabels].sort(), sequence, rate: makes / SAMPLES,
    banklessMakes, wrongReasons };
}

function testDifficultyParity() {
  const rows = [];
  for (const [width, height] of VIEWPORTS) {
    for (const mode of ['classic', 'native-alien', 'alien-invasion']) {
      rows.push(measureMode(mode, width, height));
    }
  }
  console.log('v1.12 Alien deterministic calibration');
  console.table(rows.map((row) => ({
    mode: row.mode,
    viewport: `${row.width}x${row.height}`,
    makes: `${row.makes}/${SAMPLES}`,
    misses: `${row.misses}/${SAMPLES}`,
    banked: `${row.bankedShots}/${SAMPLES}`,
    rate: `${(row.rate * 100).toFixed(1)}%`,
  })));

  if (MEASURE_ONLY) return;

  for (const [width, height] of VIEWPORTS) {
    const classic = rows.find((row) => row.mode === 'classic' &&
      row.width === width && row.height === height);
    const native = rows.find((row) => row.mode === 'native-alien' &&
      row.width === width && row.height === height);
    const invasion = rows.find((row) => row.mode === 'alien-invasion' &&
      row.width === width && row.height === height);
    for (const alien of [native, invasion]) {
      assert.ok(alien.makes > 0 && alien.misses > 0,
        `${alien.mode} became predetermined at ${width}x${height}`);
      assert.equal(alien.banklessMakes, 0,
        `${alien.mode} scored without a physical bank at ${width}x${height}`);
      assert.equal(alien.wrongReasons, 0,
        `${alien.mode} scored outside the tractor ring at ${width}x${height}`);
      assert.ok(Math.abs(alien.rate - classic.rate) <= 0.10 + Number.EPSILON,
        `${alien.mode} ${(alien.rate * 100).toFixed(1)}% differs from Classic ` +
        `${(classic.rate * 100).toFixed(1)}% by more than 10pp at ${width}x${height}`);
      assert.ok(alien.maxBanks >= 4,
        `${alien.mode} never exercised fourth-bank damping at ${width}x${height}`);
    }
    assert.ok(Math.abs(native.rate - invasion.rate) <= 0.10 + Number.EPSILON,
      `Native Alien and Alien Invasion differ by more than 10pp at ${width}x${height}`);
    assert.deepEqual(invasion.sequence, native.sequence,
      `Native Alien and Alien Invasion diverged for the same seeded shots at ${width}x${height}`);
  }

  const observedLabels = new Set(rows.filter((row) => row.mode !== 'classic')
    .flatMap((row) => row.bankLabels));
  assert.deepEqual([...observedLabels].sort(), ['deflector', 'saucer', 'wall'],
    'Alien corpus did not exercise each valid bank surface');

  for (const mode of ['native-alien', 'alien-invasion']) {
    const rates = rows.filter((row) => row.mode === mode).map((row) => row.rate);
    assert.ok(Math.max(...rates) - Math.min(...rates) <= 0.10 + Number.EPSILON,
      `${mode} viewport spread exceeds 10pp: ${rates.map((rate) =>
        `${(rate * 100).toFixed(1)}%`).join(', ')}`);
  }
}

testSharedArenaContract();
testCompactPredicateBoundaries();
testDifficultyParity();

console.log(MEASURE_ONLY
  ? 'v1.12 Alien calibration measurement complete (assertions skipped).'
  : 'v1.12 Alien calibration tests passed.');
