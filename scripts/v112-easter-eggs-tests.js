'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const Eggs = require('../js/v112-easter-eggs.js');
const Globe = require('../js/v112-globe.js');
const Catalog = require('../js/v112-progression-catalog.js');
const Urth = require('../js/v112-urth.js');

const FIXTURES = Object.freeze({
  'desk-globe-visible-wurld': {
    objectId: 'desk-globe', arenaId: 'baseline-table', verdict: 'MAKE',
    landingClass: 'upright', rotationCount: 1,
  },
  'baseline-return-signal': {
    objectId: 'bottle', arenaId: 'baseline-table', verdict: 'MAKE',
    landingClass: 'cap', rotationCount: 2, clean: true,
  },
  'cafeteria-clean-hold-inspection': {
    objectId: 'milk-carton', arenaId: 'school-cafeteria', verdict: 'MAKE',
    landingClass: 'upright', rotationCount: 1, bounceCount: 0, clean: true,
  },
  'library-quiet-table': {
    objectId: 'owl', arenaId: 'grand-library', verdict: 'MISS',
    landingClass: 'side', rotationCount: 2, bounceCount: 1, clean: false,
  },
  'pirate-buoy-crown-bell': {
    objectId: 'buoy', arenaId: 'pirate-ship-deck', verdict: 'MAKE',
    landingClass: 'cap', bounceCount: 1, recovery: true, clean: false,
  },
  'volcano-molten-echo': {
    objectId: 'lavalamp', arenaId: 'volcano', verdict: 'MAKE',
    landingClass: 'upright', bounceCount: 1, settleMs: 800,
    recovery: true, clean: false,
  },
  'space-station-fine-point': {
    objectId: 'microscope', arenaId: 'space-station', verdict: 'MAKE',
    landingClass: 'upright', rotationCount: 2, bounceCount: 0, clean: true,
  },
  'stadium-deep-time-salute': {
    objectId: 'trex', arenaId: 'stadium-night', verdict: 'MAKE',
    landingClass: 'cap', rotationCount: 2,
  },
  'aquarium-high-water-review': {
    objectId: 'huge-rubber-duck', arenaId: 'aquarium-tunnel', verdict: 'MISS',
    landingClass: 'side', bounceCount: 2, clean: false,
  },
  'arcade-scatterline-trace': {
    objectId: 'gumball-machine', arenaId: 'arcade', verdict: 'MAKE',
    landingClass: 'cap', rotationCount: 3,
  },
  'haunted-thirteenth-tick': {
    objectId: 'mechanical-metronome', arenaId: 'haunted-hall', verdict: 'MAKE',
    landingClass: 'upright', settleMs: 1200, clean: true,
  },
  'mars-ninth-return': {
    objectId: 'alien', arenaId: 'mars-outpost', physicsModeId: 'alien',
    verdict: 'MAKE', landingClass: 'alien-ring', bankCount: 2,
  },
});

function outcome(overrides = {}) {
  return Object.assign({
    schema: 'EasterEggOutcomeContextV1',
    matchId: 'match-1', flipId: 'flip-1', sequence: 1,
    presentationSeed: 'seed-1',
    objectId: 'bottle', variantId: null, arenaId: 'baseline-table',
    playerName: 'Player', physicsModeId: 'normal', eventId: null,
    outcomePhase: 'committed', verdict: 'MAKE', physical: true, automatic: false,
    landingClass: 'upright', rotationCount: 1, bounceCount: 0, bankCount: 0,
    settleMs: 800, clean: true, recovery: false, pressureShot: false,
    matchTerminal: false, testData: false, reducedMotion: false,
    audioMuted: false, laneId: 'lane-1', storyChapterId: null,
  }, overrides);
}

function qualifying(id, overrides = {}) {
  return outcome(Object.assign({}, FIXTURES[id], overrides));
}

function isDeepFrozen(value, visited = new Set()) {
  if (!value || typeof value !== 'object' || visited.has(value)) return true;
  visited.add(value);
  if (!Object.isFrozen(value)) return false;
  return Reflect.ownKeys(value).every((key) => isDeepFrozen(value[key], visited));
}

function testCatalogIsFrozenDataOnlyAndCanonical() {
  assert.equal(Eggs.schema, 'EasterEggRegistryV1');
  assert.equal(Eggs.version, 1);
  assert.equal(Eggs.presentationOnly, true);
  assert.equal(Eggs.definitions.length, 12);
  assert.equal(new Set(Eggs.definitions.map((entry) => entry.id)).size, 12);
  assert.equal(isDeepFrozen(Eggs), true);

  const objectIds = new Set(Catalog.objectIds);
  const arenaIds = new Set(Catalog.arenaIds);
  for (const entry of Eggs.definitions) {
    assert.match(entry.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(entry.visibility, 'hidden-until-triggered');
    assert.equal(entry.limits.maxPerMatch, 1);
    assert.ok(entry.limits.cooldownResolvedOutcomes > 0);
    assert.ok(entry.chance.denominator > 1);
    assert.ok(entry.presentation.durationMs <= 2000);
    assert.ok(entry.presentation.reducedDurationMs <= 1300);
    assert.ok(entry.presentation.camera.maxDurationMs <= entry.presentation.durationMs);
    entry.criteria.objectIds.forEach((id) => assert(objectIds.has(id), `${id} is not a Flipper`));
    (entry.criteria.arenaIds || []).forEach((id) => assert(arenaIds.has(id), `${id} is not an arena`));
  }
  assert.doesNotMatch(JSON.stringify(Eggs.definitions), /function\s*\(|=>/);

  const dinosaurMoments = Eggs.definitions.filter((entry) =>
    /dinosaur|triceratops|hadrosaur/i.test(entry.presentation.detail));
  assert.ok(dinosaurMoments.length >= 3, 'Urth needs several ordinary dinosaur-coexistence moments');
  const trex = Eggs.definitions.find((entry) => entry.id === 'stadium-deep-time-salute');
  assert.equal(trex.presentation.objectPolicy, 'protected-trex-arena-only');
}

function testEveryDefinitionCanBeForcedOnlyAsEligibleTestData() {
  for (const entry of Eggs.definitions) {
    const matchId = `force-${entry.id}`;
    const context = qualifying(entry.id, {
      matchId, flipId: `${entry.id}-1`, presentationSeed: `force-${entry.id}`,
      testData: true,
    });
    const before = JSON.stringify(context);
    const result = Eggs.evaluate(Eggs.createMatchState(matchId), context, { forceId: entry.id });
    assert.equal(result.status, 'forced-test-presentation', entry.id);
    assert.equal(result.selectedId, entry.id);
    assert.equal(result.presentation.testData, true);
    assert.equal(result.presentation.presentationOnly, true);
    assert.equal(result.presentation.afterCommittedOutcome, true);
    assert.equal(result.presentation.defaultStatisticsPolicy, 'excluded');
    assert.equal(JSON.stringify(context), before, `${entry.id} mutated its caller context`);

    const ordinaryTest = Eggs.evaluate(Eggs.createMatchState(matchId), context);
    assert.equal(ordinaryTest.status, 'test-data-suppressed');
    assert.equal(ordinaryTest.presentation, null);
    assert.throws(() => Eggs.evaluate(Eggs.createMatchState(matchId),
      Object.assign({}, context, { testData: false }), { forceId: entry.id }), /only in Test Data/);
  }
  assert.throws(() => Eggs.evaluate(Eggs.createMatchState('unknown-force'),
    outcome({ matchId: 'unknown-force', testData: true }), { forceId: 'not-an-egg' }), /Unknown/);
}

function testPhysicalCircumstancesFailClosed() {
  for (const entry of Eggs.definitions) {
    const id = entry.id;
    const base = qualifying(id, { matchId: `negative-${id}`, flipId: `${id}-negative`, testData: true });
    const wrongObject = Object.assign({}, base, { objectId: base.objectId === 'bottle' ? 'teapot' : 'bottle' });
    assert.equal(Eggs.evaluate(Eggs.createMatchState(base.matchId), wrongObject,
      { forceId: id }).presentation, null, `${id} ignored Flipper eligibility`);

    if (entry.criteria.arenaIds) {
      const wrongArena = Object.assign({}, base,
        { arenaId: base.arenaId === 'rooftop' ? 'garden' : 'rooftop' });
      assert.equal(Eggs.evaluate(Eggs.createMatchState(base.matchId), wrongArena,
        { forceId: id }).presentation, null, `${id} ignored arena eligibility`);
    }

    const wrongVerdict = Object.assign({}, base, { verdict: base.verdict === 'MAKE' ? 'MISS' : 'MAKE' });
    assert.equal(Eggs.evaluate(Eggs.createMatchState(base.matchId), wrongVerdict,
      { forceId: id }).presentation, null, `${id} ignored physical result eligibility`);

    const automatic = Object.assign({}, base, { automatic: true });
    const automaticResult = Eggs.evaluate(Eggs.createMatchState(base.matchId), automatic,
      { forceId: id });
    assert.equal(automaticResult.status, 'automatic-outcome-suppressed');
    assert.equal(automaticResult.presentation, null);
  }

  assert.throws(() => Eggs.validateContext(outcome({ physical: false })), /physical outcomes/);
  assert.throws(() => Eggs.validateContext(outcome({ outcomePhase: 'settling' })), /committed/);
  assert.throws(() => Eggs.validateContext(outcome({ score: 99 })), /Unknown.*score/);
  assert.throws(() => Eggs.validateContext(outcome({ lives: 99 })), /Unknown.*lives/);
}

function testGlobeDecisionIsExactlyBackwardCompatible() {
  const names = ['Player', 'Mr. Howe', 'mr. howe', 'MR. HOWE', 'Mr. Howe ',
    'Mr Howe', 'Ｍｒ. Howe'];
  for (const name of names) {
    for (let seed = 0; seed < 2500; seed += 1) {
      const matchId = `globe-${name}-${seed}`;
      const context = qualifying('desk-globe-visible-wurld', {
        matchId, flipId: `flip-${seed}`, presentationSeed: seed, playerName: name,
      });
      const expected = Globe.focusDecision({
        seed, made: true, physical: true, testData: false, playerName: name,
      }).triggered;
      const actual = Eggs.evaluate(Eggs.createMatchState(matchId), context);
      assert.equal(!!actual.presentation, expected, `Globe decision drifted for ${name}/${seed}`);
      if (actual.presentation) {
        assert.equal(actual.presentation.visual.deterministicSeed, String(seed));
        assert.equal(actual.presentation.cue.accessibilityText, 'Desk Globe close-up.');
      }
    }
  }
  const globe = Eggs.definitions.find((entry) => entry.id === 'desk-globe-visible-wurld');
  assert.deepEqual(globe.chance, {
    algorithm: 'globe-v1-compatible', denominator: 100,
    exactName: 'Mr. Howe', exactNameDenominator: 10,
  });
}

function testDeterminismDuplicateProtectionAndOneShotLimits() {
  for (const entry of Eggs.definitions) {
    const matchId = `determinism-${entry.id}`;
    const context = qualifying(entry.id, {
      matchId, flipId: 'first', sequence: 1, testData: true,
      presentationSeed: `determinism-${entry.id}`,
    });
    const initial = Eggs.createMatchState(matchId);
    const first = Eggs.evaluate(initial, context, { forceId: entry.id });
    const replay = Eggs.evaluate(initial, context, { forceId: entry.id });
    assert.deepEqual(first, replay, `${entry.id} is not replay deterministic`);
    assert.equal(isDeepFrozen(first), true);

    const duplicate = Eggs.evaluate(first.state, context, { forceId: entry.id });
    assert.equal(duplicate.status, 'stale-or-duplicate');
    assert.equal(duplicate.accepted, false);
    assert.equal(duplicate.presentation, null);
    assert.deepEqual(duplicate.state, first.state);

    const secondContext = qualifying(entry.id, {
      matchId, flipId: 'second', sequence: 100, testData: true,
      presentationSeed: `determinism-${entry.id}-second`,
    });
    const second = Eggs.evaluate(first.state, secondContext, { forceId: entry.id });
    assert.equal(second.presentation, null, `${entry.id} violated its one-shot match limit`);
    assert.equal(second.state.triggerHistory.find((item) => item.id === entry.id).count, 1);
  }

  const state = Eggs.createMatchState('monotonic');
  const high = qualifying('baseline-return-signal', {
    matchId: 'monotonic', flipId: 'high', sequence: 9, testData: true,
  });
  const after = Eggs.evaluate(state, high, { forceId: 'baseline-return-signal' });
  const stale = qualifying('cafeteria-clean-hold-inspection', {
    matchId: 'monotonic', flipId: 'stale', sequence: 8, testData: true,
  });
  assert.equal(Eggs.evaluate(after.state, stale,
    { forceId: 'cafeteria-clean-hold-inspection' }).status, 'stale-or-duplicate');
}

function testReducedMotionMuteAndCameraLeases() {
  for (const entry of Eggs.definitions) {
    const normalId = `presentation-normal-${entry.id}`;
    const normal = Eggs.evaluate(Eggs.createMatchState(normalId), qualifying(entry.id, {
      matchId: normalId, flipId: 'normal', testData: true, audioMuted: false,
      reducedMotion: false, laneId: 'lane-3',
    }), { forceId: entry.id }).presentation;
    assert.equal(normal.audio.play, true);
    assert.ok(normal.audio.cueId);
    assert.ok(normal.audio.caption);
    assert.equal(normal.camera.requested, true);
    assert.match(normal.camera.leaseId, /^egg-camera-[0-9a-f]{8}$/);
    assert.equal(normal.camera.scope, 'lane');
    assert.equal(normal.camera.laneId, 'lane-3');
    assert.equal(normal.camera.interruptsExisting, false);
    assert.equal(normal.camera.deferIfBusy, true);
    assert.equal(normal.camera.expiresWithPresentation, true);
    assert.equal(normal.camera.restoresGameplayCamera, true);
    assert.ok(normal.camera.maxDurationMs <= normal.visual.durationMs);

    const reducedId = `presentation-reduced-${entry.id}`;
    const reduced = Eggs.evaluate(Eggs.createMatchState(reducedId), qualifying(entry.id, {
      matchId: reducedId, flipId: 'reduced', testData: true, audioMuted: true,
      reducedMotion: true, laneId: 'lane-4',
    }), { forceId: entry.id }).presentation;
    assert.equal(reduced.visual.reducedMotion, true);
    assert.ok(reduced.visual.durationMs <= 1300);
    assert.equal(reduced.audio.play, false);
    assert.equal(reduced.audio.cueId, null);
    assert.ok(reduced.audio.caption);
    assert.ok(reduced.audio.mutedFallbackCueId);
    assert.equal(reduced.camera.requested, false);
    assert.equal(reduced.camera.leaseId, null);
    assert.equal(reduced.camera.kind, 'none');
    assert.equal(reduced.camera.maxDurationMs, 0);
    assert.equal(reduced.camera.restoresGameplayCamera, true);
  }
}

function walkKeys(value, visit, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    visit(String(key));
    walkKeys(value[key], visit, seen);
  }
}

function testPresentationCannotCarryCompetitiveMutation() {
  const forbidden = new Set([
    'score', 'scores', 'life', 'lives', 'fxp', 'fc', 'reward', 'rewards',
    'progression', 'achievement', 'achievements', 'landingVerdict', 'eventOdds',
    'eventWeight', 'eventWeights', 'physicsImpulse', 'force', 'velocity', 'angularVelocity',
  ]);
  for (const entry of Eggs.definitions) {
    const matchId = `boundary-${entry.id}`;
    const result = Eggs.evaluate(Eggs.createMatchState(matchId), qualifying(entry.id, {
      matchId, flipId: 'boundary', testData: true,
    }), { forceId: entry.id });
    walkKeys(result.presentation, (key) => {
      assert.equal(forbidden.has(key), false, `${entry.id} leaked competitive key ${key}`);
    });
    assert.equal('chance' in result.presentation, false);
    assert.equal('denominator' in result.presentation, false);
    assert.equal('roll' in result.presentation, false);
  }

  const source = fs.readFileSync(path.join(ROOT, 'js', 'v112-easter-eggs.js'), 'utf8');
  const executable = source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(executable, /\brequire\s*\(/);
  assert.doesNotMatch(executable, /\bMath\.random\s*\(/);
  assert.doesNotMatch(executable, /\b(?:localStorage|sessionStorage|indexedDB|fetch|XMLHttpRequest)\b/);
  assert.doesNotMatch(executable, /\b(?:Matter|Engine|Body\.set|World\.add)\b/);

  const originalRandom = Math.random;
  Math.random = () => { throw new Error('gameplay random stream was touched'); };
  try {
    const matchId = 'rng-isolation';
    assert.doesNotThrow(() => Eggs.evaluate(Eggs.createMatchState(matchId),
      qualifying('baseline-return-signal', { matchId, flipId: 'rng', presentationSeed: 'rng' })));
  } finally {
    Math.random = originalRandom;
  }
}

function testInputHardeningAndImmutability() {
  const valid = outcome();
  const accessor = Object.assign({}, valid);
  Object.defineProperty(accessor, 'score', { enumerable: true, get() { throw new Error('getter ran'); } });
  assert.throws(() => Eggs.validateContext(accessor), /accessors/);

  const custom = Object.create({ polluted: true });
  Object.assign(custom, valid);
  assert.throws(() => Eggs.validateContext(custom), /plain prototype/);

  const state = Eggs.createMatchState('bad-state');
  const sparse = {
    schema: state.schema, version: state.version, matchId: state.matchId,
    lastSequence: 0, processedFlipIds: new Array(2), triggerHistory: [],
  };
  assert.throws(() => Eggs.normalizeState(sparse), /sparse/);
  assert.throws(() => Eggs.normalizeState(Object.assign({}, state, { score: 4 })),
    /Unknown EasterEggMatchStateV1 field/);
  assert.throws(() => Eggs.normalizeState({
    schema: state.schema, version: state.version, matchId: state.matchId,
    lastSequence: 1, processedFlipIds: ['flip-1'], triggerHistory: [{
      id: 'baseline-return-signal', count: 1, lastSequence: 2,
    }],
  }), /outside the consumed outcome range/);

  const before = JSON.stringify(valid);
  const normalized = Eggs.validateContext(valid);
  assert.equal(JSON.stringify(valid), before);
  assert.equal(isDeepFrozen(normalized), true);
  assert.throws(() => Eggs.evaluate(Eggs.createMatchState('other'), valid), /another match/);
}

function testFlavorAndAccessibilityDiscipline() {
  const altered = Object.values(Urth.flavorSpellings);
  for (const entry of Eggs.definitions) {
    for (const field of ['headline', 'detail']) {
      const lower = entry.presentation[field].toLowerCase();
      const count = altered.filter((word) => lower.includes(word)).length;
      assert.ok(count <= 1, `${entry.id}.${field} overuses altered spelling`);
    }
    const accessible = entry.presentation.accessibilityText.toLowerCase();
    assert.equal(altered.some((word) => accessible.includes(word)), false,
      `${entry.id} uses flavor spelling in accessible text`);
  }
}

function testBrowserGlobalAndNaturalRates() {
  const context = vm.createContext({ console });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'v112-easter-eggs.js'), 'utf8'),
    context, { filename: 'v112-easter-eggs.js' });
  assert.equal(context.FlipgameV112EasterEggs.schema, 'EasterEggRegistryV1');
  assert.equal(context.FlipgameV112EasterEggs.definitions.length, 12);

  for (const entry of Eggs.definitions) {
    let hits = 0;
    const count = 4000;
    for (let seed = 0; seed < count; seed += 1) {
      const matchId = `rate-${entry.id}-${seed}`;
      const result = Eggs.evaluate(Eggs.createMatchState(matchId), qualifying(entry.id, {
        matchId, flipId: `flip-${seed}`, presentationSeed: seed,
      }));
      if (result.presentation) hits += 1;
    }
    const expected = count / entry.chance.denominator;
    assert.ok(hits > expected * 0.45 && hits < expected * 1.55,
      `${entry.id} deterministic rate ${hits}/${count} drifted from its internal band`);
  }
}

testCatalogIsFrozenDataOnlyAndCanonical();
testEveryDefinitionCanBeForcedOnlyAsEligibleTestData();
testPhysicalCircumstancesFailClosed();
testGlobeDecisionIsExactlyBackwardCompatible();
testDeterminismDuplicateProtectionAndOneShotLimits();
testReducedMotionMuteAndCameraLeases();
testPresentationCannotCarryCompetitiveMutation();
testInputHardeningAndImmutability();
testFlavorAndAccessibilityDiscipline();
testBrowserGlobalAndNaturalRates();

console.log('v1.12 deterministic presentation-only Easter-egg registry tests passed.');
