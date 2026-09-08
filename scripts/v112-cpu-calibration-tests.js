'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Cpu = require('../js/v112-cpu.js');

const root = path.resolve(__dirname, '..');
const ALL_VIEWPORTS = Object.freeze([
  [360, 740],
  [768, 1024],
  [1280, 720],
  [1366, 768],
  [1920, 1080],
  [3840, 2160],
]);
const QUICK = process.env.FLIPGAME_CPU_QUICK === '1';
const MEASURE_ONLY = process.env.FLIPGAME_CPU_MEASURE_ONLY === '1';
const REQUESTED_VIEWPORT = String(process.env.FLIPGAME_CPU_VIEWPORT || '').match(/^(\d+)x(\d+)$/);
const VIEWPORTS = REQUESTED_VIEWPORT
  ? [[Number(REQUESTED_VIEWPORT[1]), Number(REQUESTED_VIEWPORT[2])]]
  : (QUICK ? [[1280, 720]] : ALL_VIEWPORTS);
const SAMPLES = Math.max(QUICK ? 100 : 240,
  Number(process.env.FLIPGAME_CPU_SAMPLES) || (QUICK ? 120 : 240));
const DIFFICULTIES = Object.freeze(['easy', 'medium', 'hard']);

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

function resolveShot(physics, { mode, difficulty, feel, width, height, seed }) {
  physics.setProfile(null);
  physics.init(width, height);
  physics.setFeel(feel || 'standard');
  if (mode === 'native-alien') {
    physics.setProfile(ALIEN_PROFILE);
    physics.resetBottle();
  }
  physics.seedTurn(seed);
  if (mode === 'alien-invasion') {
    assert.equal(physics.forceSpecialEvent('alien-invasion'), true);
  }
  const alien = mode !== 'classic';
  const arenaPreview = alien ? physics.getAlienArenaState(seed) : null;
  const launch = Cpu.createLaunch({
    difficulty,
    physicsModeId: alien ? 'alien' : 'normal',
    seed,
    target: arenaPreview && arenaPreview.target,
    arena: arenaPreview && { worldW: arenaPreview.target.worldW },
  });
  physics.applyFlick(launch.vx, launch.vy, seed, 1,
    mode === 'alien-invasion' ? 'normal' : 'disabled', false,
    { inputFeelMode: launch.inputFeelMode });
  for (let frame = 1; frame <= 1200; frame += 1) {
    physics.step(1 / 60);
    const verdict = physics.checkLanding();
    if (verdict) {
      return {
        verdict,
        frame,
        launch,
        info: physics.getLastLandingInfo(),
        flick: physics.getLastFlickInfo(),
        target: physics.getTarget(),
        arena: physics.getAlienArenaState(),
      };
    }
  }
  throw new Error(`${mode}/${difficulty} did not resolve at ${width}x${height}, seed ${seed}`);
}

function measure(physics, mode, difficulty, feel, width, height) {
  let makes = 0;
  let caps = 0;
  let banklessMakes = 0;
  const sequences = [];
  const launches = [];
  for (let seed = 1; seed <= SAMPLES; seed += 1) {
    const outcome = resolveShot(physics, { mode, difficulty, feel, width, height, seed });
    if (outcome.verdict === 'MAKE') {
      makes += 1;
      if (outcome.info.onCap) caps += 1;
      if (mode !== 'classic' && outcome.info.bankHits < 1) banklessMakes += 1;
    }
    sequences.push(`${outcome.verdict}:${outcome.info.reason}:${outcome.info.bankHits}`);
    launches.push(`${outcome.launch.vx.toFixed(6)}:${outcome.launch.vy.toFixed(6)}`);
  }
  return {
    mode, difficulty, feel, width, height,
    makes, caps, banklessMakes, sequences, launches,
    rate: makes / SAMPLES,
    capRate: caps / SAMPLES,
  };
}

function testCpuApiIsStatelessAndResultBlind() {
  assert.equal(Cpu.schema, 'CpuProfileV1');
  assert.deepEqual(Cpu.targetBands, {
    easy: { minimum: 0.30, maximum: 0.40 },
    medium: { minimum: 0.45, maximum: 0.55 },
    hard: { minimum: 0.60, maximum: 0.70 },
  });
  assert.deepEqual([1, 2, 3, 5, 6, 8].map(Cpu.difficultyForTier),
    ['easy', 'easy', 'medium', 'medium', 'hard', 'hard']);
  assert.throws(() => Cpu.createLaunch({ seed: -1 }), /unsigned 32-bit seed/);
  assert.throws(() => Cpu.createLaunch({ seed: 1.5 }), /unsigned 32-bit seed/);
  const base = Cpu.createLaunch({ seed: 77, difficulty: 'hard' });
  const hostileContext = Cpu.createLaunch({
    seed: 77,
    difficulty: 'hard',
    lastResult: 'MISS',
    losing: true,
    score: -500,
    lives: 1,
    opponentLives: 100,
    adaptiveDifficulty: true,
  });
  assert.deepEqual(hostileContext, base,
    'score/result/history fields changed the physical CPU gesture');
  assert.ok(Object.isFrozen(base));
}

function testCalibration() {
  const physics = loadPhysics();
  const rows = [];
  for (const [width, height] of VIEWPORTS) {
    for (const difficulty of DIFFICULTIES) {
      for (const feel of ['forgiving', 'standard', 'pro']) {
        rows.push(measure(physics, 'classic', difficulty, feel, width, height));
      }
      rows.push(measure(physics, 'native-alien', difficulty, 'standard', width, height));
      rows.push(measure(physics, 'alien-invasion', difficulty, 'standard', width, height));
    }
  }

  console.log(`v1.12 physical CPU calibration (${SAMPLES} shots per row)`);
  console.table(rows.map((row) => ({
    mode: row.mode,
    difficulty: row.difficulty,
    feel: row.feel,
    viewport: `${row.width}x${row.height}`,
    makes: `${row.makes}/${SAMPLES}`,
    caps: `${row.caps}/${SAMPLES}`,
    rate: `${(row.rate * 100).toFixed(1)}%`,
  })));

  if (MEASURE_ONLY) return rows;

  for (const row of rows) {
    const band = Cpu.targetBands[row.difficulty];
    assert.ok(row.rate >= band.minimum && row.rate <= band.maximum,
      `${row.mode}/${row.difficulty}/${row.feel} ${(row.rate * 100).toFixed(1)}% ` +
      `outside ${(band.minimum * 100).toFixed(0)}-${(band.maximum * 100).toFixed(0)}% ` +
      `at ${row.width}x${row.height}`);
    assert.ok(new Set(row.launches).size >= Math.floor(SAMPLES * 0.80),
      `${row.mode}/${row.difficulty} launch variance collapsed`);
    if (row.mode !== 'classic') {
      assert.equal(row.banklessMakes, 0,
        `${row.mode}/${row.difficulty} produced a bankless CPU make`);
    }
  }

  for (const [width, height] of VIEWPORTS) {
    for (const mode of ['classic', 'native-alien', 'alien-invasion']) {
      for (const feel of mode === 'classic' ? ['forgiving', 'standard', 'pro'] : ['standard']) {
        const ordered = DIFFICULTIES.map((difficulty) => rows.find((row) =>
          row.mode === mode && row.difficulty === difficulty && row.feel === feel &&
          row.width === width && row.height === height));
        assert.ok(ordered[0].rate < ordered[1].rate && ordered[1].rate < ordered[2].rate,
          `${mode}/${feel} tiers are not strictly ordered at ${width}x${height}`);
      }
    }
    for (const difficulty of DIFFICULTIES) {
      const native = rows.find((row) => row.mode === 'native-alien' &&
        row.difficulty === difficulty && row.width === width && row.height === height);
      const invasion = rows.find((row) => row.mode === 'alien-invasion' &&
        row.difficulty === difficulty && row.width === width && row.height === height);
      assert.deepEqual(invasion.sequences, native.sequences,
        `native/Invasion CPU verdicts diverged for ${difficulty} at ${width}x${height}`);
      assert.deepEqual(invasion.launches, native.launches,
        `native/Invasion CPU plans diverged for ${difficulty} at ${width}x${height}`);
    }
    for (const feel of ['forgiving', 'standard', 'pro']) {
      const capCounts = DIFFICULTIES.map((difficulty) => rows.find((row) =>
        row.mode === 'classic' && row.difficulty === difficulty && row.feel === feel &&
        row.width === width && row.height === height).caps);
      assert.ok(capCounts[0] <= capCounts[1] && capCounts[1] <= capCounts[2],
        `Classic CPU cap outcomes are not ordered at ${width}x${height}/${feel}: ${capCounts}`);
      assert.ok(capCounts[2] > 0,
        `Hard CPU corpus contains no naturally simulated cap at ${width}x${height}/${feel}`);
    }
    for (const difficulty of DIFFICULTIES) {
      const feelRows = ['forgiving', 'standard', 'pro'].map((feel) => rows.find((row) =>
        row.mode === 'classic' && row.difficulty === difficulty && row.feel === feel &&
        row.width === width && row.height === height));
      assert.deepEqual(feelRows[0].sequences, feelRows[1].sequences,
        `human Feel changed ${difficulty} CPU outcomes at ${width}x${height}`);
      assert.deepEqual(feelRows[1].sequences, feelRows[2].sequences,
        `Pro changed ${difficulty} CPU outcomes at ${width}x${height}`);
    }
  }

  for (const mode of ['classic', 'native-alien', 'alien-invasion']) {
    for (const difficulty of DIFFICULTIES) {
      const rates = rows.filter((row) => row.mode === mode &&
        row.difficulty === difficulty && row.feel === 'standard')
        .map((row) => row.rate);
      assert.ok(Math.max(...rates) - Math.min(...rates) <= 0.10 + Number.EPSILON,
        `${mode}/${difficulty} viewport spread exceeds 10pp: ` +
        rates.map((rate) => `${(rate * 100).toFixed(1)}%`).join(', '));
    }
  }

  return rows;
}

testCpuApiIsStatelessAndResultBlind();
testCalibration();

console.log(MEASURE_ONLY
  ? 'v1.12 CPU calibration measurement complete (band assertions skipped).'
  : 'v1.12 physical CPU calibration tests passed.');
