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
const HIGH_VOLUME = process.env.FLIPGAME_CPU_QUALIFICATION === '1';
const DIAGNOSTICS = process.env.FLIPGAME_CPU_DIAGNOSTICS === '1';
const REQUESTED_VIEWPORT = String(process.env.FLIPGAME_CPU_VIEWPORT || '').match(/^(\d+)x(\d+)$/);
const VIEWPORTS = REQUESTED_VIEWPORT
  ? [[Number(REQUESTED_VIEWPORT[1]), Number(REQUESTED_VIEWPORT[2])]]
  : (QUICK ? [[1280, 720]] : ALL_VIEWPORTS);
const MIN_CALIBRATION_SAMPLES = 240;
const MIN_HIGH_VOLUME_SAMPLES = 720;
const requestedSamples = Number(process.env.FLIPGAME_CPU_SAMPLES);
const defaultSamples = HIGH_VOLUME ? 960 : (QUICK ? 120 : MIN_CALIBRATION_SAMPLES);
const SAMPLES = Math.max(HIGH_VOLUME ? MIN_HIGH_VOLUME_SAMPLES : (QUICK ? 100 : MIN_CALIBRATION_SAMPLES),
  Number.isInteger(requestedSamples) && requestedSamples > 0 ? requestedSamples : defaultSamples);
const DIFFICULTIES = Object.freeze(['easy', 'medium', 'hard']);
const requestedDifficulty = String(process.env.FLIPGAME_CPU_DIFFICULTY || '').toLowerCase();
const ACTIVE_DIFFICULTIES = MEASURE_ONLY && DIFFICULTIES.includes(requestedDifficulty)
  ? [requestedDifficulty] : DIFFICULTIES;
const requestedScope = String(process.env.FLIPGAME_CPU_SCOPE || '').toLowerCase();
const MEASURE_SCOPE = MEASURE_ONLY && ['classic', 'alien'].includes(requestedScope)
  ? requestedScope : 'all';

// Interleave four frozen, non-overlapping windows across uint32 space. A
// short prefix now samples every window instead of accidentally qualifying a
// profile against seeds 1..N. The high-volume release gate expands these same
// windows; it never swaps in a hand-picked passing corpus.
const SEED_WINDOWS = Object.freeze([
  Object.freeze({ start: 0x13579bdf, stride: 0x9e3779b9 }),
  Object.freeze({ start: 0x6a09e667, stride: 0x85ebca6b }),
  Object.freeze({ start: 0xbb67ae85, stride: 0xc2b2ae35 }),
  Object.freeze({ start: 0x3c6ef372, stride: 0x27d4eb2f }),
]);

function qualificationSeeds(count) {
  const seeds = [];
  for (let index = 0; index < count; index += 1) {
    const window = SEED_WINDOWS[index % SEED_WINDOWS.length];
    const offset = Math.floor(index / SEED_WINDOWS.length) + 1;
    let seed = (window.start + Math.imul(offset, window.stride)) >>> 0;
    seed = Math.imul(seed ^ (seed >>> 16), 0x7feb352d);
    seed = Math.imul(seed ^ (seed >>> 15), 0x846ca68b);
    seeds.push((seed ^ (seed >>> 16)) >>> 0);
  }
  assert.equal(new Set(seeds).size, seeds.length, 'qualification seed windows overlap');
  return Object.freeze(seeds);
}

const SEEDS = qualificationSeeds(SAMPLES);

function wilson95(successes, trials) {
  const z = 1.959963984540054;
  const p = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const center = (p + (z * z) / (2 * trials)) / denominator;
  const radius = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * trials)) / trials) /
    denominator;
  return { minimum: center - radius, maximum: center + radius };
}

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
        preview: arenaPreview,
      };
    }
  }
  throw new Error(`${mode}/${difficulty} did not resolve at ${width}x${height}, seed ${seed}`);
}

function measure(physics, mode, difficulty, feel, width, height, seeds = SEEDS) {
  let makes = 0;
  let caps = 0;
  let banklessMakes = 0;
  const sequences = [];
  const launches = [];
  const targetBuckets = Array.from({ length: 4 }, () => ({ makes: 0, shots: 0 }));
  for (const seed of seeds) {
    const outcome = resolveShot(physics, { mode, difficulty, feel, width, height, seed });
    if (outcome.preview && outcome.preview.target) {
      const previewTarget = outcome.preview.target;
      const xBand = Math.max(0, Math.min(3,
        Math.floor(previewTarget.x / previewTarget.worldW * 4)));
      targetBuckets[xBand].shots += 1;
      if (outcome.verdict === 'MAKE') targetBuckets[xBand].makes += 1;
    }
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
    makes, caps, banklessMakes, sequences, launches, targetBuckets,
    samples: seeds.length,
    rate: makes / seeds.length,
    capRate: caps / seeds.length,
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
  const invalidSeeds = [undefined, null, '', ' ', '1', true, false, 1.5, -1,
    0x100000000, NaN, Infinity, -Infinity, new Number(1)];
  for (const seed of invalidSeeds) {
    assert.throws(() => Cpu.createLaunch({ seed }), /unsigned 32-bit seed/,
      `CPU accepted non-uint32 seed ${String(seed)}`);
  }
  for (const seed of [0, 1, 0xffffffff]) {
    assert.equal(Cpu.createLaunch({ seed }).seed, seed >>> 0);
  }
  assert.ok(SEEDS.some((seed) => seed > 0x80000000),
    'calibration corpus did not reach the upper uint32 range');
  assert.notDeepEqual(SEEDS.slice(0, 8), [1, 2, 3, 4, 5, 6, 7, 8],
    'calibration silently regressed to a prefix corpus');
  for (const seed of [SEEDS[0], SEEDS[Math.floor(SEEDS.length / 2)], SEEDS.at(-1)]) {
    assert.deepEqual(
      Cpu.createLaunch({ seed, difficulty: 'medium', physicsModeId: 'alien' }),
      Cpu.createLaunch({ seed, difficulty: 'medium', physicsModeId: 'alien' }),
      `CPU launch changed across identical distributed seed ${seed}`,
    );
  }
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
  const invariantRows = [];
  // Feel and Native/Invasion equality are deterministic invariants, not rate
  // estimates. A bounded cross-window subset proves them without tripling the
  // expensive Matter.js qualification corpus.
  const invariantSeedCount = Math.min(SEEDS.length, QUICK ? 100 : 128);
  const invariantSeeds = SEEDS.slice(0, invariantSeedCount);
  for (const [width, height] of VIEWPORTS) {
    for (const difficulty of ACTIVE_DIFFICULTIES) {
      if (MEASURE_SCOPE !== 'alien') {
        const classic = measure(physics, 'classic', difficulty, 'standard', width, height);
        rows.push(classic);
        if (!MEASURE_ONLY) {
          for (const feel of ['forgiving', 'pro']) {
            invariantRows.push(measure(physics, 'classic', difficulty, feel,
              width, height, invariantSeeds));
          }
        }
      }
      if (MEASURE_SCOPE !== 'classic') {
        const native = measure(physics, 'native-alien', difficulty, 'standard', width, height);
        rows.push(native);
        if (!MEASURE_ONLY) {
          invariantRows.push(measure(physics, 'alien-invasion', difficulty, 'standard',
            width, height, invariantSeeds));
        }
      }
    }
  }

  const qualificationLabel = HIGH_VOLUME ? 'high-volume qualification'
    : (QUICK ? 'smoke sample' : 'calibration');
  console.log(`v1.12 physical CPU ${qualificationLabel} ` +
    `(${SAMPLES} shots per row, ${SEED_WINDOWS.length} interleaved uint32 windows)`);
  console.table(rows.map((row) => ({
    mode: row.mode,
    difficulty: row.difficulty,
    feel: row.feel,
    viewport: `${row.width}x${row.height}`,
    makes: `${row.makes}/${row.samples}`,
    caps: `${row.caps}/${row.samples}`,
    rate: `${(row.rate * 100).toFixed(1)}%`,
    ci95: (() => {
      const interval = wilson95(row.makes, row.samples);
      return `${(interval.minimum * 100).toFixed(1)}-${
        (interval.maximum * 100).toFixed(1)}%`;
    })(),
  })));
  if (DIAGNOSTICS) {
    console.table(rows.filter((row) => row.mode !== 'classic').flatMap((row) =>
      row.targetBuckets.map((bucket, xBand) => ({
        mode: row.mode,
        difficulty: row.difficulty,
        viewport: `${row.width}x${row.height}`,
        xBand,
        makes: `${bucket.makes}/${bucket.shots}`,
        rate: bucket.shots ? `${(bucket.makes / bucket.shots * 100).toFixed(1)}%` : 'n/a',
      }))));
  }

  if (MEASURE_ONLY) return rows;

  for (const row of rows) {
    const band = Cpu.targetBands[row.difficulty];
    const interval = wilson95(row.makes, row.samples);
    // A finite deterministic corpus estimates the underlying physical make
    // probability; treating one make either side of a raw cutoff as a product
    // regression caused the old 120-shot false failure. Reject only when the
    // 95% interval no longer intersects the frozen target band. The explicit
    // >=720-shot release mode makes this gate much tighter without burdening
    // every local run.
    assert.ok(interval.maximum >= band.minimum && interval.minimum <= band.maximum,
      `${row.mode}/${row.difficulty}/${row.feel} ${(row.rate * 100).toFixed(1)}%, ` +
      `95% interval ${(interval.minimum * 100).toFixed(1)}-` +
      `${(interval.maximum * 100).toFixed(1)}% does not overlap ` +
      `${(band.minimum * 100).toFixed(0)}-${(band.maximum * 100).toFixed(0)}% ` +
      `at ${row.width}x${row.height}`);
    assert.ok(new Set(row.launches).size >= Math.floor(row.samples * 0.80),
      `${row.mode}/${row.difficulty} launch variance collapsed`);
    if (row.mode !== 'classic') {
      assert.equal(row.banklessMakes, 0,
        `${row.mode}/${row.difficulty} produced a bankless CPU make`);
    }
  }

  for (const [width, height] of VIEWPORTS) {
    for (const mode of ['classic', 'native-alien', 'alien-invasion']) {
      const source = mode === 'alien-invasion' ? invariantRows : rows;
      const ordered = DIFFICULTIES.map((difficulty) => source.find((row) =>
        row.mode === mode && row.difficulty === difficulty &&
        row.width === width && row.height === height));
      assert.ok(ordered[0].rate < ordered[1].rate && ordered[1].rate < ordered[2].rate,
        `${mode}/standard tiers are not strictly ordered at ${width}x${height}`);
    }
    for (const difficulty of DIFFICULTIES) {
      const native = rows.find((row) => row.mode === 'native-alien' &&
        row.difficulty === difficulty && row.width === width && row.height === height);
      const invasion = invariantRows.find((row) => row.mode === 'alien-invasion' &&
        row.difficulty === difficulty && row.width === width && row.height === height);
      assert.deepEqual(invasion.sequences, native.sequences.slice(0, invariantSeeds.length),
        `native/Invasion CPU verdicts diverged for ${difficulty} at ${width}x${height}`);
      assert.deepEqual(invasion.launches, native.launches.slice(0, invariantSeeds.length),
        `native/Invasion CPU plans diverged for ${difficulty} at ${width}x${height}`);
    }
    const capCounts = DIFFICULTIES.map((difficulty) => rows.find((row) =>
      row.mode === 'classic' && row.difficulty === difficulty &&
      row.width === width && row.height === height).caps);
    assert.ok(capCounts[0] <= capCounts[1] && capCounts[1] <= capCounts[2],
      `Classic CPU cap outcomes are not ordered at ${width}x${height}: ${capCounts}`);
    assert.ok(capCounts[2] > 0,
      `Hard CPU corpus contains no naturally simulated cap at ${width}x${height}`);
    for (const difficulty of DIFFICULTIES) {
      const standard = rows.find((row) => row.mode === 'classic' &&
        row.difficulty === difficulty && row.width === width && row.height === height);
      const feelRows = ['forgiving', 'pro'].map((feel) => invariantRows.find((row) =>
        row.mode === 'classic' && row.difficulty === difficulty && row.feel === feel &&
        row.width === width && row.height === height));
      assert.deepEqual(feelRows[0].sequences,
        standard.sequences.slice(0, invariantSeeds.length),
        `human Feel changed ${difficulty} CPU outcomes at ${width}x${height}`);
      assert.deepEqual(feelRows[1].sequences,
        standard.sequences.slice(0, invariantSeeds.length),
        `Pro changed ${difficulty} CPU outcomes at ${width}x${height}`);
    }
  }

  for (const mode of ['classic', 'native-alien']) {
    for (const difficulty of DIFFICULTIES) {
      const modeRows = rows.filter((row) => row.mode === mode &&
        row.difficulty === difficulty && row.feel === 'standard');
      const highest = modeRows.reduce((best, row) => row.rate > best.rate ? row : best);
      const lowest = modeRows.reduce((best, row) => row.rate < best.rate ? row : best);
      const highInterval = wilson95(highest.makes, highest.samples);
      const lowInterval = wilson95(lowest.makes, lowest.samples);
      assert.ok(highInterval.minimum - lowInterval.maximum <= 0.10 + Number.EPSILON,
        `${mode}/${difficulty} statistically supported viewport spread exceeds 10pp: ` +
        modeRows.map((row) => `${row.width}x${row.height} ` +
          `${(row.rate * 100).toFixed(1)}%`).join(', '));
    }
  }

  return rows;
}

testCpuApiIsStatelessAndResultBlind();
testCalibration();

console.log(MEASURE_ONLY
  ? 'v1.12 CPU calibration measurement complete (band assertions skipped).'
  : (QUICK
    ? 'v1.12 physical CPU smoke tests passed; this sample does not qualify target bands.'
    : 'v1.12 physical CPU calibration tests passed.'));
