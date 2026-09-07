'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Activity = require('../js/v112-activity.js');
const Training = require('../js/v112-training.js');

function signal(patch = {}) {
  return Object.assign({
    qualifiedManual: true, normalizedPower: 0.61, normalizedDirection: -0.18,
    pointerType: 'touch', sampleCount: 7, durationMs: 148,
    velocity: { x: -3.2, y: -14.4 }, angularVelocity: 0.067,
  }, patch);
}

function verdict(result = 'MAKE', patch = {}) {
  return Object.assign({
    phase: 'resolved', result, pose: result === 'MAKE' ? 'upright' : 'other',
    landingReason: result === 'MAKE' ? 'upright' : 'invalid-pose',
    qualifiedManual: true, physical: true, automatic: false,
    contacts: 1, bounces: 0, banks: 0, flightMs: 1730, settleMs: 418,
    trajectory: [
      { t: 0, x: 0.4, y: 0.8, angle: 0, phase: 'airborne' },
      { t: 800, x: 0.48, y: 0.22, angle: 3.3, phase: 'airborne' },
      { t: 1730, x: 0.52, y: 0.82, angle: 6.28, phase: 'settling' },
    ],
  }, patch);
}

function assertIsolated(value, activityId) {
  assert.equal(value.testData, true);
  assert.equal(value.progressionEligible, false);
  assert.equal(value.fcEligible, false);
  assert.equal(value.achievementsEligible, false);
  assert.equal(value.statisticsDefaultEligible, false);
  if (activityId) assert.equal(value.activityId, activityId);
}

function testFeatureEligibilityAndMigrationFacingState() {
  const fresh = Training.featureState({ flipLevel: 1, featureIds: [] });
  assert.equal(fresh.practice.available, true, 'Basic Practice is available on a fresh save');
  assert.equal(fresh.physicsLab.available, false);
  assert.equal(fresh.physicsLab.requirement, 'Locked until Flip Level 50');
  assert.equal(JSON.stringify(fresh).includes('Alien'), false, 'Lab state must not leak unrelated gates');
  assert.equal(JSON.stringify(fresh).includes('event'), false, 'Lab lock must not leak event catalog data');

  assert.equal(Training.featureState({ flipLevel: 49 }).physicsLab.available, false);
  assert.equal(Training.featureState({ flipLevel: 50 }).physicsLab.available, true);
  assert.equal(Training.featureState({ flipLevel: 1, featureIds: ['physics-lab'] })
    .physicsLab.available, true, 'migrated legitimate entitlement is never relocked');
  assert.equal(Training.featureState({ flipLevel: 1,
    claimedRewardIds: ['level.50.feature.physics-lab'] }).physicsLab.available, true);
  assert.equal(Training.featureState({ flipLevel: 1,
    claimedRewardIds: ['feature.physics-lab'] }).physicsLab.available, true);

  assert.throws(() => Training.createRuntime({ activityId: 'physics-lab', sessionId: 'locked',
    profile: { flipLevel: 49 } }), (error) => error.code === 'PHYSICS_LAB_LOCKED');
  const immediate = Training.createRuntime({ activityId: 'practice', sessionId: 'fresh-practice',
    profile: { flipLevel: 1 }, availableFlipperIds: ['bottle'] });
  assert.equal(immediate.snapshot().activityId, 'practice');
}

async function testActivityAdaptersAndNoRewardPath() {
  const registry = Activity.createActivityRegistry();
  assert.equal(Training.registerActivities(registry), registry);
  Training.registerActivities(registry); // Registration is deliberately idempotent.
  assert.deepEqual([...registry.ids()].sort(), ['physics-lab', 'practice', 'tutorial']);

  for (const activityId of registry.ids()) {
    const request = Training.createMatchRequest({
      matchId: `training-${activityId}`, sessionId: `training-${activityId}`,
      activityId, seed: 22, roster: [{ id: 'student', human: true }],
    });
    assert.equal(request.formatId, 'classic');
    assert.equal(request.physicsModeId, 'normal');
    assert.equal(request.rulesOptions.rewardsEnabled, false);
    assert.equal(request.rulesOptions.progressionEnabled, false);
    assertIsolated(request.activityContext, activityId);
    const prepared = registry.prepare(activityId, { request });
    assertIsolated(prepared.isolation, activityId);
    const resolved = registry.resolve(activityId, {
      request, outcome: Activity.MatchOutcomeV2({ matchId: request.matchId, status: 'completed' }),
    });
    assert.deepEqual(resolved.awards, []);
    assert.deepEqual(resolved.progressionCommands, []);
    assert.deepEqual(resolved.achievementCommands, []);
    assert.deepEqual(resolved.ownershipCommands, []);
    assertIsolated(resolved, activityId);
    const abandoned = registry.abandon(activityId, { request, reason: 'back' });
    assert.equal(abandoned.status, 'abandoned');
    assert.deepEqual(abandoned.awards, []);
  }

  let transactionCommands = 0;
  let statsPayload = null;
  const coordinator = Activity.createMatchSessionCoordinator({
    registry,
    transaction(command) {
      transactionCommands += 1;
      assert.deepEqual(command.activityResolution.awards, []);
      assert.deepEqual(command.activityResolution.progressionCommands, []);
      assert.equal(command.request.activityContext.testData, true);
      return { duplicate: false, fxp: 0, fc: 0, awards: [] };
    },
    statsSink(payload) { statsPayload = payload; },
  });
  const request = Training.createMatchRequest({ matchId: 'practice-final', activityId: 'practice' });
  coordinator.start(request);
  const resolution = await coordinator.finalize({ matchId: request.matchId, status: 'completed' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(transactionCommands, 1);
  assert.equal(resolution.transaction.fxp, 0);
  assert.equal(resolution.transaction.fc, 0);
  assert.equal(statsPayload.request.activityContext.testData, true);
  assert.equal(statsPayload.request.activityContext.statisticsDefaultEligible, false,
    'any optional Training record is excluded from default Stats Lab totals');
}

function testPracticeBindingTelegraphAndIsolation() {
  const runtime = Training.createRuntime({
    activityId: 'practice', sessionId: 'practice-events', seed: 99,
    availableFlipperIds: ['bottle'], viewportPresetId: 'phone-portrait',
  });
  assertIsolated(runtime.snapshot().isolation, 'practice');
  assert.equal(runtime.request.activityContext.testData, true);
  assert.equal(runtime.setForcedEvent('Wind Tunnel').forcedEventDisplayName, 'Wind Tunnel');
  assert.throws(() => runtime.setForcedEvent('wind tunnel'), /Unknown forced event/,
    'event force names are exact allowlisted display names');

  const prepared = runtime.prepareAttempt();
  assert.equal(prepared.eventSelection.schema, 'EventSelectionV2');
  assert.equal(prepared.eventSelection.eventId, 'wind-tunnel');
  assert.equal(prepared.eventSelection.consumed, false);
  assert.equal(prepared.eventSelection.testData, true);
  assert.deepEqual(runtime.eventPhase(prepared.attemptId, 100),
    { phase: 'named', canAcceptInput: false });
  assert.deepEqual(runtime.eventPhase(prepared.attemptId, 500),
    { phase: 'instruction', canAcceptInput: false });
  assert.equal(runtime.eventPhase(prepared.attemptId, 900).canAcceptInput, true);
  assert.throws(() => runtime.qualifyLaunch(prepared.attemptId, signal(), 899), /telegraph/);

  const cancelled = runtime.qualifyLaunch(prepared.attemptId,
    { qualifiedManual: false }, 900);
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.attempt.attemptId, prepared.attemptId);
  assert.equal(cancelled.attempt.eventSelection.consumed, false,
    'cancelled gestures retain rather than consume the pre-bound event');
  const retained = runtime.prepareAttempt();
  assert.equal(retained.attemptId, prepared.attemptId);
  assert.equal(retained.eventSelection.eventSeed, prepared.eventSelection.eventSeed);
  assertIsolated(retained, 'practice');

  const launch = runtime.qualifyLaunch(prepared.attemptId, signal(), 900);
  assert.equal(launch.eventSelection.consumed, true);
  assertIsolated(launch.isolation, 'practice');
  assertIsolated(launch, 'practice');
  const resolution = runtime.resolveAttempt(prepared.attemptId, verdict('MISS'));
  assert.equal(resolution.result, 'MISS');
  assert.equal(resolution.ghost, null);
  assert.deepEqual(resolution.awards, []);
  assert.deepEqual(resolution.progressionCommands, []);
  assert.deepEqual(resolution.achievementCommands, []);
  assert.equal(resolution.testDataRecord.testData, true);
  assert.equal(resolution.testDataRecord.statisticsDefaultEligible, false);
  assertIsolated(resolution, 'practice');
  assert.throws(() => runtime.setFlipper('bottle'), /requires Physics Lab/);
  assert.throws(() => runtime.setViewportPreset('smartboard-hd'), /requires Physics Lab/);
  assert.throws(() => runtime.setSlowMotion(0.5), /requires Physics Lab/);
  assert.throws(() => runtime.replayAttempt(prepared.attemptId), /requires Physics Lab/);

  runtime.setForcedEvent(null);
  const made = runtime.prepareAttempt();
  runtime.qualifyLaunch(made.attemptId, signal(), 900);
  assert.equal(runtime.resolveAttempt(made.attemptId, verdict('MAKE')).ghost, null,
    'successful-shot ghosts remain an FL50 Physics Lab feature');
  assert.throws(() => runtime.prepareAttempt({ seed: 7 }), /requires Physics Lab/);
}

function testLabControlsGhostAndExactReplay() {
  const profile = Object.freeze({ flipLevel: 50, featureIds: Object.freeze(['physics-lab']) });
  const before = JSON.stringify(profile);
  const runtime = Training.createRuntime({
    activityId: 'physics-lab', sessionId: 'lab-controls', seed: 815,
    profile, availableFlipperIds: ['bottle', 'coffee-mug'], flipperId: 'bottle',
  });
  runtime.setFlipper('coffee-mug');
  runtime.setViewportPreset('smartboard-hd');
  runtime.setSlowMotion(0.5);
  runtime.setForcedEvent('Rainbow Corkscrew');
  assert.throws(() => runtime.setFlipper('alien-secret'), (error) =>
    /not available/.test(error.message) && !error.message.includes('alien-secret'),
  'locked or unknown Flipper IDs are not reflected back by the Training contract');

  const prepared = runtime.prepareAttempt();
  assert.equal(prepared.flipperId, 'coffee-mug');
  assert.equal(prepared.viewportPreset.id, 'smartboard-hd');
  assert.equal(prepared.presentationRate, 0.5);
  assert.equal(prepared.simulationStepScale, 1,
    'slow motion changes presentation clock, not deterministic simulation time');
  assert.throws(() => runtime.setSlowMotion(0.25), /active Training attempt/);
  const launch = runtime.qualifyLaunch(prepared.attemptId, signal(), 900);
  const resolution = runtime.resolveAttempt(prepared.attemptId, verdict('MAKE'));
  assert.equal(resolution.landingReason.id, 'upright');
  assert.equal(resolution.ghost.schema, 'SuccessfulShotGhostV1');
  assert.equal(resolution.ghost.trajectory.length, 3);
  assert.deepEqual(resolution.ghost.launchSignal, launch.launchSignal);
  assertIsolated(resolution.ghost, 'physics-lab');

  runtime.setFlipper('bottle');
  runtime.setViewportPreset('phone-portrait');
  runtime.setSlowMotion(0.25);
  runtime.setForcedEvent(null);
  const replay = runtime.replayAttempt(prepared.attemptId);
  assert.equal(replay.replayOfAttemptId, prepared.attemptId);
  assert.equal(replay.turnSeed, prepared.turnSeed);
  assert.equal(replay.seedSource, 'replay');
  assert.equal(replay.eventSelection.eventId, prepared.eventSelection.eventId);
  assert.equal(replay.eventSelection.eventSeed, prepared.eventSelection.eventSeed);
  assert.equal(replay.flipperId, 'coffee-mug', 'replay retains the source Flipper');
  assert.equal(replay.viewportPreset.id, 'smartboard-hd', 'replay retains the source viewport');
  assert.equal(replay.presentationRate, 0.5, 'replay retains source clock configuration');
  assert.deepEqual(replay.recordedLaunchSignal, launch.launchSignal);
  assert.equal(replay.ghost.sourceAttemptId, prepared.attemptId);
  const replayLaunch = runtime.qualifyLaunch(replay.attemptId, replay.recordedLaunchSignal, 900);
  assert.deepEqual(replayLaunch.launchSignal, launch.launchSignal,
    'recorded launch plus bound seeds creates an exact replay input contract');
  const replayResolution = runtime.resolveAttempt(replay.attemptId, verdict('MAKE'));
  assert.equal(replayResolution.replayOfAttemptId, prepared.attemptId);
  assert.equal(runtime.snapshot().ghosts.length, 2);
  assert.equal(JSON.stringify(profile), before, 'Training has no profile mutation path');

  runtime.setForcedEvent('Plinko');
  const plinko = runtime.prepareAttempt();
  runtime.qualifyLaunch(plinko.attemptId, signal(), 900);
  const automatic = runtime.resolveAttempt(plinko.attemptId,
    verdict('MAKE', { landingReason: 'plinko', automatic: true }));
  assert.equal(automatic.ghost, null, 'automatic results never become successful-shot ghosts');
  assert.equal(runtime.snapshot().ghosts.length, 2);

  runtime.setForcedEvent(null);
  const explicitZero = runtime.prepareAttempt({ seed: 0 });
  assert.equal(explicitZero.turnSeed, 0);
  assert.equal(explicitZero.seedSource, 'explicit');
  runtime.qualifyLaunch(explicitZero.attemptId, signal(), 900);
  runtime.resolveAttempt(explicitZero.attemptId, verdict('MISS'));
  assert.throws(() => runtime.prepareAttempt({ seed: 0x100000000 }), /0 to 4294967295/);
}

function testLandingReasonAndValidationSafety() {
  assert.equal(Training.landingReason('tractor-ring', 'MAKE').label,
    'Banked into the tractor ring');
  assert.equal(Training.landingReason('off-plane-settle-limit', 'MISS').verdict, 'miss');
  assert.equal(Training.landingReason('future-valid-reason', 'MISS').label,
    'Future Valid Reason', 'future engine reasons remain inspectable without a shared-file edit');
  const unsafe = Training.landingReason('<img src=x onerror=1>', 'MISS');
  assert.equal(unsafe.id, 'unknown');
  assert.equal(unsafe.label, 'Other resolved outcome');
  assert.throws(() => Training.launchSignal({ qualifiedManual: true,
    normalizedPower: 2, normalizedDirection: 0 }), /between 0 and 1/);
  assert.throws(() => Training.outcome(verdict('MAKE', { trajectory: [
    { t: 2, x: 1, y: 1, angle: 0 }, { t: 1, x: 2, y: 2, angle: 1 },
  ] })), /monotonic/);
}

function completeAttempt(runtime, expected, result, pose, patch = {}) {
  const prepared = runtime.prepareAttempt();
  if (expected) assert.equal(prepared.eventSelection && prepared.eventSelection.eventId, expected);
  const launch = runtime.qualifyLaunch(prepared.attemptId, signal(), 900);
  assert.equal(launch.flipperId, prepared.flipperId);
  return { prepared, value: runtime.resolveAttempt(prepared.attemptId,
    verdict(result, Object.assign({ pose, landingReason: result === 'MAKE' ? pose : 'invalid-pose' }, patch))) };
}

function testFirstFlipTourRealSessionIntegration() {
  const ownedFlippers = Object.freeze(['bottle']);
  const before = JSON.stringify(ownedFlippers);
  const tour = Training.createTutorialSession({ sessionId: 'tour-full', seed: 912,
    roster: [{ id: 'new-player', human: true }] });
  assert.equal(tour.request.activityId, 'tutorial');
  assert.equal(tour.request.formatId, 'classic');
  assert.equal(tour.request.physicsModeId, 'normal');
  assertIsolated(tour.request.activityContext, 'tutorial');
  assert.equal(tour.snapshot().step.id, 'welcome');
  assert.equal(tour.snapshot().history.length, 0);
  tour.acknowledge();

  let prepared = tour.prepareAttempt();
  assert.equal(prepared.flipperId, 'bottle');
  assert.equal(prepared.eventSelection, null,
    'ordinary Tour lessons suppress random events; only authored demos are forced');
  const cancelled = tour.qualifyLaunch(prepared.attemptId, { qualifiedManual: false }, 0);
  assert.equal(cancelled.retained, true);
  assert.equal(tour.prepareAttempt().turnSeed, prepared.turnSeed);
  let step = completeAttempt(tour, null, 'MISS', 'other');
  assert.equal(step.value.resolution.advanced, true);
  assert.deepEqual(step.value.resolution.awards, []);
  assert.equal(step.value.resolution.testDataRecord.statisticsDefaultEligible, false);

  step = completeAttempt(tour, null, 'MAKE', 'upright'); // meter
  assert.equal(step.value.resolution.advanced, true);
  step = completeAttempt(tour, null, 'MISS', 'other'); // settle lesson
  assert.equal(step.value.resolution.advanced, true);
  assert.equal(tour.snapshot().step.id, 'lives-turns');
  tour.acknowledge();

  step = completeAttempt(tour, null, 'MISS', 'other'); // failed upright lesson
  assert.equal(step.value.resolution.advanced, false);
  assert.equal(step.value.resolution.retry, true);
  assert.equal(tour.snapshot().step.id, 'upright');
  step = completeAttempt(tour, null, 'MAKE', 'upright');
  assert.equal(step.value.resolution.advanced, true);
  step = completeAttempt(tour, null, 'MAKE', 'cap');
  assert.equal(step.value.resolution.advanced, true);

  prepared = tour.prepareAttempt();
  assert.equal(prepared.eventSelection.eventId, 'rainbow-corkscrew');
  assert.equal(prepared.eventSelection.forced, true);
  assert.equal(prepared.eventSelection.testData, true);
  assert.equal(prepared.eventSelection.consumed, false);
  assert.equal(tour.eventPhase(prepared.attemptId, 899).canAcceptInput, false);
  assert.throws(() => tour.qualifyLaunch(prepared.attemptId, signal(), 899), /telegraph/);
  const rainbowLaunch = tour.qualifyLaunch(prepared.attemptId, signal(), 900);
  assert.equal(rainbowLaunch.eventSelection.consumed, true);
  let resolved = tour.resolveAttempt(prepared.attemptId, verdict('MISS'));
  assert.equal(resolved.resolution.advanced, true,
    'the scripted event demonstrates real fallible mechanics; a miss still teaches it');

  const preview = tour.snapshot().step;
  assert.equal(preview.id, 'deep-time-preview');
  assert.equal(preview.flipperId, 'trex');
  assert.equal(preview.temporaryFlipper, true);
  tour.acknowledge();
  prepared = tour.prepareAttempt();
  assert.equal(prepared.flipperId, 'trex');
  assert.equal(prepared.temporaryFlipper, true);
  assert.equal(prepared.eventSelection.eventId, 'trampoline');
  const trampolineLaunch = tour.qualifyLaunch(prepared.attemptId, signal(), 900);
  assert.equal(trampolineLaunch.temporaryFlipper, true);
  resolved = tour.resolveAttempt(prepared.attemptId, verdict('MISS'));
  assert.equal(resolved.resolution.advanced, true);
  assert.equal(resolved.resolution.temporaryFlipper, true);
  assert.equal(resolved.session.step.id, 'complete');
  assert.equal(resolved.session.state.completed, true);
  assert.equal(JSON.stringify(ownedFlippers), before,
    'temporary protected T-Rex presentation cannot grant or mutate ownership');
  assert(resolved.session.history.every((entry) => entry.awards.length === 0 &&
    entry.progressionCommands.length === 0 && entry.achievementCommands.length === 0));
}

function testTutorialDeterminismSkipAndRestoredState() {
  const first = Training.createTutorialSession({ sessionId: 'tour-a', seed: 73 });
  const second = Training.createTutorialSession({ sessionId: 'tour-b', seed: 73 });
  first.acknowledge(); second.acknowledge();
  assert.equal(first.prepareAttempt().turnSeed, second.prepareAttempt().turnSeed);

  const state = first.snapshot().state;
  const restored = Training.createTutorialSession({ sessionId: 'tour-restored', seed: 999, state });
  assert.equal(restored.snapshot().state.baseSeed, 73,
    'migration/restoration uses the persisted Tour seed rather than a new constructor seed');
  assert.equal(restored.prepareAttempt().turnSeed, first.prepareAttempt().turnSeed);
  const skipped = restored.skip();
  assert.equal(skipped.skipped, true);
  assert.equal(skipped.state.completed, false);
  assert.equal(skipped.history.length, 0);
  assertIsolated(skipped.isolation, 'tutorial');
  assert.throws(() => restored.prepareAttempt(), /skipped/);
}

function testCatalogSecrecyAndDeterministicPracticeSeeds() {
  assert.equal(Training.FORCEABLE_EVENT_NAMES.length, 30);
  assert.equal(Training.FORCEABLE_EVENT_NAMES.includes('Wind Tunnel'), true);
  assert.equal(JSON.stringify(Training.FORCEABLE_EVENT_NAMES).includes('850'), false,
    'Training force UI contract contains names, never programmed rates');
  assert.equal(Object.prototype.hasOwnProperty.call(Training.FORCEABLE_EVENT_NAMES[0],
    'normalDenominator'), false);
  const a = Training.createRuntime({ activityId: 'practice', sessionId: 'seed-a', seed: 444 });
  const b = Training.createRuntime({ activityId: 'practice', sessionId: 'seed-b', seed: 444 });
  const pa = a.prepareAttempt();
  const pb = b.prepareAttempt();
  assert.equal(pa.turnSeed, pb.turnSeed);
  assert.deepEqual(pa.eventSelection, pb.eventSelection);
}

function testBrowserExportsAndDependencyOrder() {
  const context = { console };
  context.globalThis = context;
  vm.createContext(context);
  ['v111-interfaces.js', 'v111-physics-events.js', 'v112-activity.js', 'v112-events.js',
    'v112-tutorial.js', 'v112-training.js'].forEach((name) => {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8'),
      context, { filename: name });
  });
  assert.equal(context.FlipgameV112Training.schema, 'FlipgameV112TrainingV1');
  const practice = context.FlipgameV112Training.createRuntime({
    activityId: 'practice', sessionId: 'browser-practice', seed: 4,
  });
  assert.equal(practice.request.schema, 'MatchRequestV2');
  assert.equal(practice.snapshot().isolation.testData, true);
}

async function run() {
  testFeatureEligibilityAndMigrationFacingState();
  await testActivityAdaptersAndNoRewardPath();
  testPracticeBindingTelegraphAndIsolation();
  testLabControlsGhostAndExactReplay();
  testLandingReasonAndValidationSafety();
  testFirstFlipTourRealSessionIntegration();
  testTutorialDeterminismSkipAndRestoredState();
  testCatalogSecrecyAndDeterministicPracticeSeeds();
  testBrowserExportsAndDependencyOrder();
  console.log('v1.12 Training / Physics Lab / Tour tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
