'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Alien = require('../js/v112-alien-event-adapters.js');
const Events = require('../js/v112-events.js');

const EVENT_IDS = Events.definitions.map((entry) => entry.id);
const REPLACEMENT_IDS = [
  'earthquake', 'moon-gravity', 'ice-slide', 'alien-invasion', 'trampoline',
  'wind-tunnel',
];
const SELF_CONTAINED_IDS = ['roulette-table', 'plinko'];

function assertDeepFrozen(value, label, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true, `${label} must be recursively frozen`);
  Reflect.ownKeys(value).forEach((key) => assertDeepFrozen(value[key], label, seen));
}

function baseAlienState() {
  return {
    schema: 'AlienBaseStateV1',
    physicsProfile: {
      id: 'alien-standard', gravity: { x: 0, y: 0, scale: 0 },
      collisionMask: ['wall', 'ufo', 'tractor-ring'], arenaScale: 1.25,
    },
    ufoState: {
      revision: 17,
      bodies: [
        { id: 'ufo-left', x: 112.5, y: 240, vx: 0.2, vy: -0.1, angle: 0.4 },
        { id: 'ufo-right', x: 875.25, y: 310, vx: -0.2, vy: 0.1, angle: -0.4 },
      ],
    },
    selectedFlipperDynamics: {
      bodyRef: 'body:flipper-main', x: 640, y: 330, vx: 2.2, vy: -5.1,
      angle: 1.7, angularVelocity: 4.25, mass: 1.3, inertia: 2.7,
      friction: 0.08, restitution: 0.22, internalDynamicsSeed: 991,
    },
    selectedFlipperAppearance: {
      flipperId: 'snow-globe', variantId: 'midnight-squall',
      appearanceRevision: 'snow-globe:12', cosmeticId: 'aurora',
    },
    cameraState: {
      x: 640, y: 360, zoom: 0.91, mode: 'alien-follow',
      targetRef: 'body:flipper-main', shake: { x: 0, y: 0 },
    },
    scoringState: { bankCount: 1, ringEntered: false, lastBankRef: 'body:ufo-left' },
  };
}

function testCompleteImmutableRegistry() {
  assert.equal(Alien.schema, 'AlienEventAdapterRegistryV1');
  assert.equal(Alien.version, 1);
  assert.equal(Alien.adapters.length, 30);
  assert.equal(new Set(Alien.adapters.map((entry) => entry.eventId)).size, 30);
  assert.equal(Alien.assertComplete(EVENT_IDS), true);
  assert.throws(() => Alien.assertComplete(EVENT_IDS.slice(1)), /does not exactly cover/);
  assert.throws(() => Alien.assertComplete([...EVENT_IDS, 'invented']), /does not exactly cover/);
  assertDeepFrozen(Alien, 'Alien adapter registry');

  const counts = Alien.adapters.reduce((result, entry) => {
    result[entry.classification] = (result[entry.classification] || 0) + 1;
    return result;
  }, Object.create(null));
  assert.deepEqual({ ...counts }, {
    adapted: 22,
    'excluded-with-authored-replacement': 6,
    'self-contained': 2,
  });
  assert.deepEqual(Alien.adapters
    .filter((entry) => entry.classification === 'excluded-with-authored-replacement')
    .map((entry) => entry.eventId), REPLACEMENT_IDS);
  assert.deepEqual(Alien.adapters
    .filter((entry) => entry.classification === 'self-contained')
    .map((entry) => entry.eventId), SELF_CONTAINED_IDS);

  assert.equal(new Set(Alien.adapters.map((entry) => entry.mechanicsKind)).size, 30,
    'every event requires an authored physical mechanic, not one generic multiplier');
  Alien.adapters.forEach((entry) => {
    assert.equal(entry.schema, 'AlienEventAdapterV1');
    assert.equal(entry.version, 1);
    assert.equal(entry.physical, true);
    assert.equal(entry.visible, true);
    assert.equal(entry.skillBased, true);
    assert.equal(entry.missable, true);
    assert.equal(entry.viewportScaled, true);
    assert.equal(entry.restoresExactAlienState, true);
    assert(entry.authoredGeometry.length >= 2);
    assert(entry.seededChannels.length >= 1);
    assert(entry.missPaths.length >= 1);
    assert.equal(entry.telegraph.instruction.length > 20, true);
    assert.equal(Events.get(entry.eventId).alienAdapter, entry);

    if (entry.classification === 'self-contained') {
      assert.equal(entry.goalMode, 'event-owned');
      assert.equal(entry.preservesUfoField, false);
      assert.equal(entry.requiresBankThenTractorRing, false);
    } else {
      assert.equal(entry.goalMode, 'bank-then-tractor-ring');
      assert.equal(entry.preservesUfoField, true);
      assert.equal(entry.requiresBankThenTractorRing, true);
    }
    if (entry.eventClass === 'hazard') {
      assert.equal(entry.difficultyContract.relationship, 'harder');
      assert(entry.difficultyContract.maximumRatio <= 0.75);
      assert(entry.difficultyContract.minimumMakeRate >= 0.10);
    } else if (entry.eventClass === 'assist') {
      assert.equal(entry.difficultyContract.relationship, 'easier');
      assert(entry.difficultyContract.maximumMakeRate <= 0.85);
      assert(entry.difficultyContract.minimumMissRate >= 0.05);
    } else {
      assert.equal(entry.difficultyContract.relationship, 'different-technique');
      assert(entry.difficultyContract.minimumRatio >= 0.80);
      assert(entry.difficultyContract.maximumRatio <= 1.20);
    }
  });
  assert.deepEqual(Alien.adapters.filter((entry) => entry.automaticWinPossible)
    .map((entry) => entry.eventId), ['plinko']);
}

function testConcreteAlienReplacements() {
  const expected = {
    earthquake: ['oscillating-alien-cage', 'oscillating-walls', 'oscillating-ufo-banks'],
    'moon-gravity': ['rotating-gravity-tide', 'gravity-compass', 'tide-streamlines'],
    'ice-slide': ['low-friction-rail-deflector', 'ice-rail-collider', 'soft-end-bumpers'],
    'alien-invasion': ['moving-ufo-bank-swarm', 'five-to-seven-ufo-banks', 'swarm-orbits'],
    trampoline: ['deforming-spring-wall', 'spring-wall-collider', 'compression-mesh'],
    'wind-tunnel': ['directional-plasma-jets', 'three-jet-nozzles', 'force-streamlines'],
  };
  Object.entries(expected).forEach(([eventId, [kind, ...geometry]]) => {
    const entry = Alien.get(eventId);
    assert.equal(entry.classification, 'excluded-with-authored-replacement');
    assert.equal(entry.replacementForEarthImplementation, eventId);
    assert.equal(entry.mechanicsKind, kind);
    geometry.forEach((name) => assert(entry.authoredGeometry.includes(name)));
    const plan = Alien.derivePlan({ eventId, eventSeed: 99123,
      layout: { width: 1280, height: 720 } });
    assert.equal(plan.mechanics.kind, kind);
    assert.equal(plan.goal.bankRequired, true);
    assert.equal(plan.goal.tractorRingRequired, true);
  });

  const invasion = Alien.derivePlan({ eventId: 'alien-invasion', eventSeed: 44,
    layout: { width: 1280, height: 720 } });
  assert(invasion.mechanics.ufoCount >= 5 && invasion.mechanics.ufoCount <= 7);
  assert(invasion.mechanics.angularRate > 0);
  const ice = Alien.derivePlan({ eventId: 'ice-slide', eventSeed: 44,
    layout: { width: 1280, height: 720 } });
  assert.equal(ice.mechanics.friction, 0.001);
  assert(ice.mechanics.recoveryMs > 0);
  const quake = Alien.derivePlan({ eventId: 'earthquake', eventSeed: 44,
    layout: { width: 1280, height: 720 } });
  assert(quake.mechanics.wallAmplitudeX > quake.mechanics.wallAmplitudeY);
  const trampoline = Alien.derivePlan({ eventId: 'trampoline', eventSeed: 44,
    layout: { width: 1280, height: 720 } });
  assert.equal(trampoline.mechanics.maximumRelaunches, 1);
  assert(trampoline.mechanics.springImpulse >= 25);
  const wind = Alien.derivePlan({ eventId: 'wind-tunnel', eventSeed: 44,
    layout: { width: 1280, height: 720 } });
  assert.equal(wind.mechanics.nozzleCount, 3);
  assert.notEqual(wind.mechanics.heading, 0);
}

function testDeterministicPhysicalPlansAndViewportScaling() {
  const mechanicsKinds = new Set();
  EVENT_IDS.forEach((eventId, index) => {
    const input = { eventId, eventSeed: 0x10203040 + index,
      layout: { width: 1366, height: 768 } };
    const first = Alien.derivePlan(input);
    const replay = Alien.derivePlan(input);
    assert.deepEqual(replay, first, `${eventId} must deterministically replay`);
    assert.notDeepEqual(Alien.derivePlan({ ...input, eventSeed: input.eventSeed + 1 }), first,
      `${eventId} must bind its plan to the event seed`);
    assertDeepFrozen(first, `${eventId} plan`);
    assert.equal(first.schema, 'AlienEventPlanV1');
    assert.equal(first.version, 1);
    assert.equal(first.eventId, eventId);
    assert.equal(first.mechanics.kind, Alien.get(eventId).mechanicsKind);
    assert(first.missPaths.length > 0);
    mechanicsKinds.add(first.mechanics.kind);
  });
  assert.equal(mechanicsKinds.size, 30);

  const phone = Alien.derivePlan({ eventId: 'earthquake', eventSeed: 4,
    layout: { width: 360, height: 740 } });
  const board = Alien.derivePlan({ eventId: 'earthquake', eventSeed: 4,
    layout: { width: 1280, height: 720 } });
  const fourK = Alien.derivePlan({ eventId: 'earthquake', eventSeed: 4,
    layout: { width: 3840, height: 2160 } });
  assert.equal(phone.arena.scale, 0.5);
  assert.equal(board.arena.scale, 1);
  assert.equal(fourK.arena.scale, 3);
  assert.equal(board.mechanics.wallAmplitudeX / phone.mechanics.wallAmplitudeX, 2);
  assert.equal(fourK.mechanics.wallAmplitudeX / board.mechanics.wallAmplitudeX, 3);

  assert.throws(() => Alien.derivePlan({ eventId: 'not-real', eventSeed: 1,
    layout: { width: 1280, height: 720 } }), /No compatible/);
  assert.throws(() => Alien.derivePlan({ eventId: 'plinko', eventSeed: -1,
    layout: { width: 1280, height: 720 } }), /out of range/);
  assert.throws(() => Alien.derivePlan({ eventId: 'plinko', eventSeed: 1,
    layout: { width: 1280, height: 720 }, surprise: true }), /unexpected field/);
}

function testSelfContainedGoalsAndExactRestore() {
  const original = baseAlienState();
  const expected = structuredClone(original);
  SELF_CONTAINED_IDS.forEach((eventId) => {
    const captureSource = structuredClone(original);
    const restore = Alien.captureRestoreState(eventId, captureSource);
    assert.equal(restore.schema, 'AlienEventRestoreV1');
    assert.equal(restore.exact, true);
    assertDeepFrozen(restore, `${eventId} restore contract`);
    captureSource.ufoState.bodies[0].x = -99999;
    captureSource.cameraState.zoom = 99;
    captureSource.selectedFlipperDynamics.mass = 999;
    assert.deepEqual(Alien.restoreState(restore), expected,
      `${eventId} cleanup must restore the captured Alien state, not current mutable input`);
    assert.deepEqual(Alien.restoreState(restore), expected,
      `${eventId} cleanup restore must be idempotent`);
  });

  const plinko = Alien.derivePlan({ eventId: 'plinko', eventSeed: 712,
    layout: { width: 1920, height: 1080 } });
  assert.equal(plinko.goal.mode, 'event-owned');
  assert.equal(plinko.mechanics.trampolineImpulse > 0, true);
  assert.equal(plinko.mechanics.pegRows, 24);
  assert.equal(plinko.mechanics.slots, 9);
  assert.equal(plinko.mechanics.dropMinMs, 10000);
  assert.equal(plinko.mechanics.dropMedianMs, 12000);
  assert.equal(plinko.mechanics.dropMaxMs, 15000);
  assert.equal(plinko.mechanics.trackedCamera, true);

  const roulette = Alien.derivePlan({ eventId: 'roulette-table', eventSeed: 18,
    layout: { width: 1920, height: 1080 } });
  assert.deepEqual(roulette.mechanics.sectors, [1, 2, 3, 4, 4, 3, 2, 1]);
  assert.equal(roulette.mechanics.trackedCamera, true);

  const accessorState = baseAlienState();
  Object.defineProperty(accessorState, 'cameraState', { enumerable: true,
    get() { throw new Error('must not execute'); } });
  assert.throws(() => Alien.captureRestoreState('plinko', accessorState), /accessors/);
  const sparseState = baseAlienState();
  sparseState.ufoState.bodies = new Array(2);
  sparseState.ufoState.bodies[1] = { id: 'only-one' };
  assert.throws(() => Alien.captureRestoreState('plinko', sparseState), /sparse array/);
}

function testAlienSelectionParityAndSuppression() {
  let normalCount = 0;
  let alienCount = 0;
  let boostedCount = 0;
  let boostedAlienCount = 0;
  const total = 180000;
  for (let seed = 0; seed < total; seed += 1) {
    const normal = Events.select({ activityId: 'free-play', physicsModeId: 'normal', seed });
    const alien = Events.select({ activityId: 'free-play', physicsModeId: 'alien', seed });
    const boosted = Events.select({ activityId: 'free-play', physicsModeId: 'normal',
      playerName: 'Mr. Howe', seed });
    const boostedAlien = Events.select({ activityId: 'free-play', physicsModeId: 'alien',
      playerName: 'Mr. Howe', seed });
    assert.equal(alien?.eventId || null, normal?.eventId || null,
      'Alien must preserve the Normal categorical roll for the same seed');
    assert.equal(boostedAlien?.eventId || null, boosted?.eventId || null,
      'Alien must preserve exact Mr. Howe categorical rolls');
    if (normal) {
      normalCount += 1;
      alienCount += 1;
      assert.equal(alien.eventSeed, normal.eventSeed);
      assert.equal(alien.oddsProfile, 'normal');
      assert(Alien.has(alien.eventId));
      assert.equal(typeof alien.telegraph.instruction, 'string');
      assert.equal(alien.telegraph.instruction,
        Alien.get(alien.eventId).telegraph.instruction);
    }
    if (boosted) {
      boostedCount += 1;
      boostedAlienCount += 1;
      assert.equal(boostedAlien.eventSeed, boosted.eventSeed);
      assert.equal(boostedAlien.oddsProfile, 'mr-howe');
    }
  }
  assert.equal(alienCount, normalCount);
  assert.equal(boostedAlienCount, boostedCount);
  assert(boostedCount > normalCount * 9.5 && boostedCount < normalCount * 10.5);

  assert.equal(Events.select({ activityId: 'story', physicsModeId: 'alien', seed: 2 }), null,
    'Veyr native Story Alien suppresses nested Signal Events');
  assert.equal(Events.select({ activityId: 'free-play', physicsModeId: 'alien',
    formatId: 'battle', seed: 2 }), null);
  assert.equal(Events.select({ activityId: 'free-play', physicsModeId: 'alien',
    eventsEnabled: false, seed: 2 }), null);

  Events.definitions.forEach((definition, index) => {
    const forced = Events.select({ activityId: 'practice', physicsModeId: 'alien',
      forceName: definition.displayName, seed: index });
    assert.equal(forced.eventId, definition.id);
    assert.equal(forced.testData, true);
    assert.equal(forced.forced, true);
    assert.equal(forced.telegraph.instruction,
      Alien.get(definition.id).telegraph.instruction);
  });
}

function testBrowserDependencyAndNoAmbientRng() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'js',
    'v112-alien-event-adapters.js'), 'utf8');
  assert.equal(source.includes('Math.random'), false);
  assert.equal(source.includes('Date.now'), false);
  const context = { console };
  context.globalThis = context;
  vm.createContext(context);
  ['v111-interfaces.js', 'v111-physics-events.js', 'v112-alien-event-adapters.js',
    'v112-events.js'].forEach((name) => {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8'),
      context, { filename: name });
  });
  assert.equal(context.FlipgameV112AlienEventAdapters.schema,
    'AlienEventAdapterRegistryV1');
  assert.equal(context.FlipgameV112Events.alienAdapters.length, 30);
  const forced = context.FlipgameV112Events.select({ activityId: 'practice',
    physicsModeId: 'alien', forceName: 'Alien Invasion', seed: 1 });
  assert.equal(forced.eventId, 'alien-invasion');
  assert.match(forced.telegraph.instruction, /moving UFO/i);
}

function run() {
  testCompleteImmutableRegistry();
  testConcreteAlienReplacements();
  testDeterministicPhysicalPlansAndViewportScaling();
  testSelfContainedGoalsAndExactRestore();
  testAlienSelectionParityAndSuppression();
  testBrowserDependencyAndNoAmbientRng();
  console.log('v1.12 Alien event adapter tests passed.');
}

run();
