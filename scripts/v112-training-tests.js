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

function assertIsolated(value, activityId, testData = true) {
  assert.equal(value.testData, testData);
  assert.equal(value.progressionEligible, false);
  assert.equal(value.fcEligible, false);
  assert.equal(value.achievementsEligible, false);
  assert.equal(value.statisticsDefaultEligible, !testData);
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
  assert.throws(() => Training.createMatchRequest({
    activityId: 'physics-lab', matchId: 'unguarded-lab-request',
  }), (error) => error.code === 'PHYSICS_LAB_LOCKED',
  'a caller cannot bypass the FL50 gate by entering through MatchRequestV2');
  const migratedAuthorization = Training.authorizePhysicsLab({
    flipLevel: 1, featureIds: ['physics-lab'],
  });
  assert.equal(migratedAuthorization.entitlementSource, 'migrated-feature');
  const forgedAuthorization = Object.assign({}, migratedAuthorization);
  assert.throws(() => Training.createMatchRequest({
    activityId: 'physics-lab', matchId: 'forged-lab-request',
    physicsLabAuthorization: forgedAuthorization,
  }), (error) => error.code === 'PHYSICS_LAB_LOCKED',
  'a structurally identical hand-built authorization is not issuer authority');
  const restoredAuthorization = JSON.parse(JSON.stringify(migratedAuthorization));
  assert.throws(() => Training.createMatchRequest({
    activityId: 'physics-lab', matchId: 'restored-auth-request',
    physicsLabAuthorization: restoredAuthorization,
  }), (error) => error.code === 'PHYSICS_LAB_LOCKED',
  'serialized authorization metadata cannot be replayed as a capability');
  const authorizedRequest = Training.createMatchRequest({
    activityId: 'physics-lab', matchId: 'authorized-lab-request',
    physicsLabAuthorization: migratedAuthorization,
  });
  assert.equal(authorizedRequest.activityContext.physicsLabAuthorization.authorized, true);
  const authorizedRuntime = Training.createRuntime({
    activityId: 'physics-lab', sessionId: 'authorized-lab-runtime',
    authorization: migratedAuthorization,
  });
  assert.equal(authorizedRuntime.request.activityContext.physicsLabAuthorization
    .entitlementSource, 'migrated-feature');
  const immediate = Training.createRuntime({ activityId: 'practice', sessionId: 'fresh-practice',
    profile: { flipLevel: 1 }, availableFlipperIds: ['bottle'] });
  assert.equal(immediate.snapshot().activityId, 'practice');
}

async function testActivityAdaptersAndNoRewardPath() {
  const registry = Activity.createActivityRegistry();
  let currentProfile = { flipLevel: 49 };
  const profileProvider = Training.createPhysicsLabProfileProvider(() => currentProfile);
  assert.equal(Training.registerActivities(registry, {
    physicsLabProfileProvider: profileProvider,
  }), registry);
  Training.registerActivities(registry, {
    physicsLabProfileProvider: profileProvider,
  }); // Registration is deliberately idempotent with the same authority.
  assert.deepEqual([...registry.ids()].sort(), ['physics-lab', 'practice', 'tutorial']);
  const directUnauthorized = Activity.MatchRequestV2({
    matchId: 'direct-unauthorized-lab', activityId: 'physics-lab', formatId: 'classic',
    physicsModeId: 'normal', roster: [{ id: 'student' }], activityContext: {},
  });
  assert.throws(() => registry.prepare('physics-lab', { request: directUnauthorized }),
    (error) => error.code === 'PHYSICS_LAB_LOCKED',
    'the registered adapter independently enforces Lab authorization');
  currentProfile = { flipLevel: 50 };

  const unboundRegistry = Activity.createActivityRegistry();
  Training.registerActivities(unboundRegistry);
  const structuralRequest = Activity.MatchRequestV2({
    matchId: 'structural-lab-request', activityId: 'physics-lab', formatId: 'classic',
    physicsModeId: 'normal', roster: [{ id: 'student' }],
    activityContext: { physicsLabAuthorization: {
      schema: 'PhysicsLabAuthorizationV1', featureId: 'physics-lab',
      authorized: true, entitlementSource: 'flip-level',
    } },
  });
  assert.throws(() => unboundRegistry.prepare('physics-lab', { request: structuralRequest }),
    (error) => error.code === 'PHYSICS_LAB_LOCKED',
    'serialized or hand-built request metadata never substitutes for a current-profile provider');
  assert.throws(() => Training.registerActivities(Activity.createActivityRegistry(), {
    physicsLabProfileProvider: { schema: 'PhysicsLabProfileProviderV1', read: () => ({ flipLevel: 100 }) },
  }), /Invalid PhysicsLabProfileProviderV1/);

  for (const activityId of registry.ids()) {
    const request = Training.createMatchRequest({
      matchId: `training-${activityId}`, sessionId: `training-${activityId}`,
      activityId, seed: 22, roster: [{ id: 'student', human: true }],
      profile: activityId === 'physics-lab' ? { flipLevel: 50 } : undefined,
    });
    assert.equal(request.formatId, 'classic');
    assert.equal(request.physicsModeId, 'normal');
    assert.equal(request.rulesOptions.rewardsEnabled, false);
    assert.equal(request.rulesOptions.progressionEnabled, false);
    const expectedTestData = activityId !== 'practice';
    assertIsolated(request.activityContext, activityId, expectedTestData);
    const prepared = registry.prepare(activityId, { request });
    assertIsolated(prepared.isolation, activityId, expectedTestData);
    const resolved = registry.resolve(activityId, {
      request, outcome: Activity.MatchOutcomeV2({ matchId: request.matchId, status: 'completed' }),
    });
    assert.deepEqual(resolved.awards, []);
    assert.deepEqual(resolved.progressionCommands, []);
    assert.deepEqual(resolved.achievementCommands, []);
    assert.deepEqual(resolved.ownershipCommands, []);
    assertIsolated(resolved, activityId, expectedTestData);
    const abandoned = registry.abandon(activityId, { request, reason: 'back' });
    assert.equal(abandoned.status, 'abandoned');
    assert.deepEqual(abandoned.awards, []);
  }

  const recheckRequest = Training.createMatchRequest({
    activityId: 'physics-lab', matchId: 'lab-live-profile-recheck', profile: { flipLevel: 50 },
  });
  registry.prepare('physics-lab', { request: recheckRequest });
  currentProfile = { flipLevel: 49 };
  assert.throws(() => registry.resolve('physics-lab', {
    request: recheckRequest,
    outcome: Activity.MatchOutcomeV2({ matchId: recheckRequest.matchId, status: 'completed' }),
  }), (error) => error.code === 'PHYSICS_LAB_LOCKED',
  'the registered adapter rechecks current entitlement on resolve');
  assert.throws(() => registry.abandon('physics-lab', {
    request: recheckRequest, reason: 'back',
  }), (error) => error.code === 'PHYSICS_LAB_LOCKED',
  'the registered adapter rechecks current entitlement on abandon');
  currentProfile = { flipLevel: 50 };

  let transactionCommands = 0;
  let statsPayload = null;
  const coordinator = Activity.createMatchSessionCoordinator({
    registry,
    transaction(command) {
      transactionCommands += 1;
      assert.deepEqual(command.activityResolution.awards, []);
      assert.deepEqual(command.activityResolution.progressionCommands, []);
      assert.equal(command.request.activityContext.testData, false);
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
  assert.equal(statsPayload.request.activityContext.testData, false);
  assert.equal(statsPayload.request.activityContext.statisticsDefaultEligible, true,
    'ordinary unforced Practice remains in default observed Practice statistics');
  const forcedResolution = registry.resolve('practice', {
    request,
    outcome: Activity.MatchOutcomeV2({ matchId: request.matchId, status: 'completed',
      activityState: { forcedEventId: 'wind-tunnel' } }),
  });
  assertIsolated(forcedResolution, 'practice', true);
  const nestedForcedResolution = registry.resolve('practice', {
    request,
    outcome: Activity.MatchOutcomeV2({ matchId: request.matchId, status: 'completed',
      telemetry: { flips: [{ testDataRecord: { testData: true,
        statisticsDefaultEligible: false } }] } }),
  });
  assertIsolated(nestedForcedResolution, 'practice', true,
    'nested forced-attempt markers cannot leak into default session statistics');
}

async function testRuntimeCoordinatorDynamicClassification() {
  const registry = Activity.createActivityRegistry();
  Training.registerActivities(registry);
  const commands = new Map();
  const stats = new Map();
  const coordinator = Activity.createMatchSessionCoordinator({
    registry,
    transaction(command) {
      commands.set(command.matchId, command);
      return { duplicate: false, fxp: 0, fc: 0 };
    },
    statsSink(payload) { stats.set(payload.request.matchId, payload); },
  });

  const mixed = Training.createRuntime({
    activityId: 'practice', sessionId: 'coordinator-mixed', seed: 441,
  });
  assert.equal(mixed.request.activityContext.dynamicActivityState, true);
  assertIsolated(mixed.request.activityContext, 'practice', false,
    'a mutable Practice runtime opens with ordinary classification');
  assert.equal(mixed.startSession(coordinator).hasActivityStateProvider, true);
  let attempt = mixed.prepareAttempt();
  mixed.qualifyLaunch(attempt.attemptId, signal(), 900);
  const ordinary = mixed.resolveAttempt(attempt.attemptId, verdict('MAKE'));
  assertIsolated(ordinary, 'practice', false);
  mixed.setForcedEvent('Wind Tunnel');
  attempt = mixed.prepareAttempt();
  mixed.qualifyLaunch(attempt.attemptId, signal(), 900);
  const forced = mixed.resolveAttempt(attempt.attemptId, verdict('MISS'));
  assertIsolated(forced, 'practice', true);
  const mixedResolution = await coordinator.finalize({
    matchId: mixed.request.matchId, status: 'completed',
  });
  await new Promise((resolve) => setImmediate(resolve));
  assertIsolated(mixedResolution.activityResolution, 'practice', true,
    'the coordinator automatically reads latest mixed/forced state at finalize');
  assert.equal(commands.get('coordinator-mixed').outcome.activityState.forcedAttemptSeen, true);
  assert.equal(stats.get('coordinator-mixed').outcome.activityState.testData, true);
  assert.equal(stats.get('coordinator-mixed').outcome.activityState.statisticsDefaultEligible, false);

  const forceCleared = Training.createRuntime({
    activityId: 'practice', sessionId: 'coordinator-force-cleared', seed: 9,
    forceName: 'Trampoline',
  });
  assertIsolated(forceCleared.request.activityContext, 'practice', false,
    'configured force does not taint a dynamic session before a qualified launch');
  forceCleared.setForcedEvent(null);
  forceCleared.startSession(coordinator);
  const clearedResolution = await coordinator.finalize({
    matchId: forceCleared.request.matchId, status: 'completed',
  });
  assertIsolated(clearedResolution.activityResolution, 'practice', false,
    'setting then clearing a force without launching remains ordinary Practice');

  const abandonedRuntime = Training.createRuntime({
    activityId: 'practice', sessionId: 'coordinator-forced-abandon', seed: 18,
  });
  abandonedRuntime.startSession(coordinator);
  abandonedRuntime.setForcedEvent('Earthquake');
  attempt = abandonedRuntime.prepareAttempt();
  abandonedRuntime.qualifyLaunch(attempt.attemptId, signal(), 900);
  const abandoned = coordinator.abandon(abandonedRuntime.request.matchId, 'menu-exit');
  assertIsolated(abandoned.activityResolution, 'practice', true,
    'abandon automatically reads a qualified forced attempt from the runtime provider');
  assert.equal(abandoned.activityResolution.status, 'abandoned');

  const unqualifiedRuntime = Training.createRuntime({
    activityId: 'practice', sessionId: 'coordinator-unqualified-abandon', seed: 20,
    forceName: 'Ice Slide',
  });
  unqualifiedRuntime.startSession(coordinator);
  attempt = unqualifiedRuntime.prepareAttempt();
  unqualifiedRuntime.qualifyLaunch(attempt.attemptId, { qualifiedManual: false }, 900);
  const unqualifiedAbandon = coordinator.abandon(unqualifiedRuntime.request.matchId, 'menu-exit');
  assertIsolated(unqualifiedAbandon.activityResolution, 'practice', false,
    'an unqualified forced gesture does not leak Test Data into match-level statistics');
}

function testRosterDrivenForcingAndMrHowe() {
  const ordinaryRequest = Training.createMatchRequest({
    activityId: 'practice', matchId: 'ordinary-practice',
    roster: [{ id: 'p1', displayName: 'Student' }],
  });
  assertIsolated(ordinaryRequest.activityContext, 'practice', false);
  assert.throws(() => Training.createMatchRequest({ activityId: 'practice',
    matchId: 'bad-force-request', forceName: 'wind tunnel' }), /Unknown forced event/);

  const namedRequest = Training.createMatchRequest({
    activityId: 'practice', matchId: 'named-force-request', activePlayerId: 'p2',
    roster: [{ id: 'p1', displayName: 'Student' },
      { id: 'p2', displayName: 'Wind Tunnel' }],
  });
  assertIsolated(namedRequest.activityContext, 'practice', true);
  const generatedSeat = Training.createMatchRequest({
    activityId: 'practice', matchId: 'generated-seat-name-force',
    roster: [{ displayName: 'Trampoline' }],
  });
  assert.equal(generatedSeat.activityContext.activePlayerId, 'seat-1');
  assertIsolated(generatedSeat.activityContext, 'practice', true);
  const named = Training.createRuntime({
    activityId: 'practice', sessionId: 'named-force-runtime', activePlayerId: 'p2', seed: 10,
    roster: [{ id: 'p1', displayName: 'Student' },
      { id: 'p2', displayName: 'Wind Tunnel' }],
  });
  const forced = named.prepareAttempt();
  assert.equal(forced.eventSelection.eventId, 'wind-tunnel');
  assert.equal(forced.eventSelection.forced, true);
  assert.equal(forced.eventSelection.oddsProfile, 'forced-test');
  assertIsolated(forced, 'practice', true);

  const wrongCase = Training.createRuntime({
    activityId: 'practice', sessionId: 'wrong-case-force', seed: 10,
    roster: [{ id: 'p1', displayName: 'wind tunnel' }],
  }).prepareAttempt();
  assert.notEqual(wrongCase.eventSelection && wrongCase.eventSelection.forced, true,
    'display-name forcing is exact and case-sensitive');
  assertIsolated(wrongCase, 'practice', false);

  let boosted = null;
  let boostedSeed = null;
  for (let seed = 0; seed < 100 && !boosted; seed += 1) {
    const runtime = Training.createRuntime({
      activityId: 'practice', sessionId: `mr-howe-${seed}`, seed,
      roster: [{ id: 'howe', displayName: 'Mr. Howe' }],
    });
    const attempt = runtime.prepareAttempt();
    if (attempt.eventSelection) { boosted = attempt; boostedSeed = seed; }
  }
  assert(boosted, 'deterministic Mr. Howe corpus should contain an event');
  assert.equal(boosted.eventSelection.oddsProfile, 'mr-howe');
  assert.equal(boosted.eventSelection.forced, false);
  assertIsolated(boosted, 'practice', false,
    'the easter-egg odds profile is ordinary observed Practice data, not a forced test');
  const nearMiss = Training.createRuntime({
    activityId: 'practice', sessionId: 'wrong-case-howe', seed: boostedSeed,
    roster: [{ id: 'howe', displayName: 'mr. howe' }],
  }).prepareAttempt();
  if (nearMiss.eventSelection) assert.equal(nearMiss.eventSelection.oddsProfile, 'normal');
}

function testPracticeBindingTelegraphAndIsolation() {
  const runtime = Training.createRuntime({
    activityId: 'practice', sessionId: 'practice-events', seed: 99,
    availableFlipperIds: ['bottle'], viewportPresetId: 'phone-portrait',
  });
  assertIsolated(runtime.snapshot().isolation, 'practice', false);
  assert.equal(runtime.request.activityContext.testData, false);
  assert.equal(runtime.setForcedEvent('Wind Tunnel').forcedEventDisplayName, 'Wind Tunnel');
  assertIsolated(runtime.snapshot().nextAttemptIsolation, 'practice');
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
  assert.equal(runtime.activityState().testData, false,
    'an unqualified cancelled gesture does not taint an otherwise ordinary Practice session');
  const retained = runtime.prepareAttempt();
  assert.equal(retained.attemptId, prepared.attemptId);
  assert.equal(retained.eventSelection.eventSeed, prepared.eventSelection.eventSeed);
  assertIsolated(retained, 'practice');

  const launch = runtime.qualifyLaunch(prepared.attemptId, signal(), 900);
  assert.equal(launch.eventSelection.consumed, true);
  assertIsolated(launch.isolation, 'practice');
  assertIsolated(launch, 'practice');
  const resolution = runtime.resolveAttempt(prepared.attemptId, verdict('MISS'));
  assert.equal(runtime.activityState().testData, true);
  assert.equal(runtime.activityState().forcedAttemptSeen, true);
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
  assertIsolated(made, 'practice', false);
  runtime.qualifyLaunch(made.attemptId, signal(), 900);
  const ordinary = runtime.resolveAttempt(made.attemptId, verdict('MAKE'));
  assert.equal(ordinary.ghost, null,
    'successful-shot ghosts remain an FL50 Physics Lab feature');
  assertIsolated(ordinary, 'practice', false);
  assert.equal(ordinary.testDataRecord.testData, false);
  assert.equal(ordinary.testDataRecord.statisticsDefaultEligible, true);
  assertIsolated(runtime.snapshot().isolation, 'practice', true,
    'a mixed session stays excluded at session-summary level after any forced attempt');
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

function testZeroSeedIsDistinctEverywhere() {
  const request = Training.createMatchRequest({
    activityId: 'practice', matchId: 'zero-request', seed: 0,
  });
  assert.equal(request.seed, 0);
  const zero = Training.createRuntime({
    activityId: 'practice', sessionId: 'zero-runtime', seed: 0,
  });
  const one = Training.createRuntime({
    activityId: 'practice', sessionId: 'one-runtime', seed: 1,
  });
  assert.equal(zero.request.seed, 0);
  assert.notEqual(zero.prepareAttempt().turnSeed, one.prepareAttempt().turnSeed,
    'base seed 0 is not silently remapped onto seed 1');
  const tour = Training.createTutorialSession({ sessionId: 'zero-tour', seed: 0 });
  assert.equal(tour.request.seed, 0);
  assert.equal(tour.snapshot().state.baseSeed, 0);
}

function testBoundedTrajectoriesRetentionAndGhosts() {
  const longPath = Array.from({ length: 1000 }, (_, index) => ({
    t: index * 4, x: index / 10, y: 10 - index / 100, angle: index / 20,
  }));
  const boundedOutcome = Training.outcome(verdict('MAKE', { trajectory: longPath }));
  assert.equal(boundedOutcome.trajectory.length, Training.MAX_TRAJECTORY_SAMPLES);
  assert.equal(boundedOutcome.trajectorySourceSampleCount, 1000);
  assert.equal(boundedOutcome.trajectoryTruncated, true);
  assert.equal(boundedOutcome.trajectory[0].sourceIndex, 0);
  assert.equal(boundedOutcome.trajectory.at(-1).sourceIndex, 999,
    'deterministic downsampling keeps both physical endpoints');

  const runtime = Training.createRuntime({
    activityId: 'physics-lab', sessionId: 'bounded-resolutions', seed: 4,
    profile: { flipLevel: 50 },
  });
  const ids = [];
  for (let index = 0; index < Training.MAX_RESOLVED_ATTEMPTS + 4; index += 1) {
    const prepared = runtime.prepareAttempt();
    ids.push(prepared.attemptId);
    runtime.qualifyLaunch(prepared.attemptId, signal(), 900);
    runtime.resolveAttempt(prepared.attemptId, verdict('MISS', { trajectory: [] }));
  }
  const retained = runtime.snapshot();
  assert.equal(retained.resolvedAttemptCount, Training.MAX_RESOLVED_ATTEMPTS + 4);
  assert.equal(retained.retainedResolutionCount, Training.MAX_RESOLVED_ATTEMPTS);
  assert.equal(retained.retention.maximum, Training.MAX_RESOLVED_ATTEMPTS);
  assert.equal(retained.retention.evicted, 4);
  assert.equal(retained.retention.oldestAttemptId, ids[4]);
  assert.equal(retained.retention.newestAttemptId, ids.at(-1));
  assert.throws(() => runtime.replayAttempt(ids[0]), /not found/,
    'FIFO-evicted full resolutions are no longer replayable');
  assert.equal(runtime.replayAttempt(ids[4]).replayOfAttemptId, ids[4]);
  runtime.close();

  const ghosts = Training.createRuntime({
    activityId: 'physics-lab', sessionId: 'bounded-ghosts', seed: 8,
    profile: { flipLevel: 50 }, forceName: 'Rainbow Corkscrew',
  });
  for (let index = 0; index < Training.MAX_SUCCESSFUL_GHOSTS + 2; index += 1) {
    const prepared = ghosts.prepareAttempt();
    ghosts.qualifyLaunch(prepared.attemptId, signal(), 900);
    ghosts.resolveAttempt(prepared.attemptId, verdict('MAKE'));
  }
  const ghostSnapshot = ghosts.snapshot();
  assert.equal(ghostSnapshot.ghosts.length, Training.MAX_SUCCESSFUL_GHOSTS);
  assert.equal(ghostSnapshot.ghosts[0].sourceAttemptId, 'bounded-ghosts.attempt.3');
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
  assert.deepEqual(tour.snapshot().targetDurationSeconds, { minimum: 45, maximum: 75 });
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

  const preview = tour.snapshot().step;
  assert.equal(preview.id, 'deep-time-preview');
  assert.equal(preview.flipperId, 'trex');
  assert.equal(preview.temporaryFlipper, true);
  tour.acknowledge();
  prepared = tour.prepareAttempt();
  assert.equal(prepared.flipperId, 'trex');
  assert.equal(prepared.temporaryFlipper, true);
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

function testTutorialGuidedCapIntegrationAndBoundedHistory() {
  const tour = Training.createTutorialSession({ sessionId: 'guided-cap-tour', seed: 33 });
  tour.acknowledge();
  completeAttempt(tour, null, 'MAKE', 'upright'); // gesture
  completeAttempt(tour, null, 'MAKE', 'upright'); // meter
  completeAttempt(tour, null, 'MISS', 'other'); // settling
  tour.acknowledge();
  completeAttempt(tour, null, 'MAKE', 'upright');

  let cap = completeAttempt(tour, null, 'MISS', 'other');
  assert.equal(cap.prepared.guidedAssist, false);
  assert.equal(cap.value.resolution.advanced, false);
  cap = completeAttempt(tour, null, 'MAKE', 'upright');
  assert.equal(cap.prepared.guidedAssist, false);
  assert.equal(cap.value.resolution.advanced, false);
  cap = completeAttempt(tour, null, 'MISS', 'other');
  assert.equal(cap.prepared.guidedAssist, true);
  assert.deepEqual(cap.prepared.guidedAssistProfile, {
    id: 'cap-window', inputGuide: true, resultOverride: false,
    completesAfterQualifiedResolution: true, showCapDemonstrationOnFailure: true,
  });
  assert.equal(cap.value.resolution.guidedAssist, true);
  assert.equal(cap.value.resolution.guidedCompletion, true);
  assert.equal(cap.value.resolution.result, 'MISS',
    'guided completion does not rewrite a real physical miss into a make');
  assert.equal(cap.value.session.step.id, 'deep-time-preview');

  const retryTour = Training.createTutorialSession({ sessionId: 'bounded-tour-history', seed: 71 });
  retryTour.acknowledge();
  completeAttempt(retryTour, null, 'MAKE', 'upright');
  completeAttempt(retryTour, null, 'MAKE', 'upright');
  completeAttempt(retryTour, null, 'MISS', 'other');
  retryTour.acknowledge();
  for (let index = 0; index < Training.MAX_RESOLVED_ATTEMPTS + 3; index += 1) {
    const retry = completeAttempt(retryTour, null, 'MISS', 'other');
    assert.equal(retry.value.resolution.advanced, false);
  }
  const snapshot = retryTour.snapshot();
  assert.equal(snapshot.history.length, Training.MAX_RESOLVED_ATTEMPTS);
  assert.equal(snapshot.retention.maximum, Training.MAX_RESOLVED_ATTEMPTS);
  assert(snapshot.retention.evicted > 0);
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
  assert.equal(restored.request.seed, 73,
    'the restored MatchRequestV2 uses the normalized persisted base seed');
  assert.equal(restored.prepareAttempt().turnSeed, first.prepareAttempt().turnSeed);
  const skipped = restored.skip();
  assert.equal(skipped.skipped, true);
  assert.equal(skipped.state.completed, false);
  assert.equal(skipped.history.length, 0);
  assertIsolated(skipped.isolation, 'tutorial');
  assert.throws(() => restored.prepareAttempt(), /skipped/);

  const zeroState = Training.createTutorialSession({ sessionId: 'zero-state-source', seed: 0 })
    .snapshot().state;
  const restoredZero = Training.createTutorialSession({
    sessionId: 'zero-state-restored', seed: 888, state: zeroState,
  });
  assert.equal(restoredZero.request.seed, 0,
    'persisted seed zero remains distinct when a different constructor seed is supplied');
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
  assert.equal(practice.snapshot().isolation.testData, false);
  assert.equal(practice.snapshot().isolation.statisticsDefaultEligible, true);
}

async function run() {
  testFeatureEligibilityAndMigrationFacingState();
  await testActivityAdaptersAndNoRewardPath();
  await testRuntimeCoordinatorDynamicClassification();
  testRosterDrivenForcingAndMrHowe();
  testPracticeBindingTelegraphAndIsolation();
  testLabControlsGhostAndExactReplay();
  testLandingReasonAndValidationSafety();
  testZeroSeedIsDistinctEverywhere();
  testBoundedTrajectoriesRetentionAndGhosts();
  testFirstFlipTourRealSessionIntegration();
  testTutorialGuidedCapIntegrationAndBoundedHistory();
  testTutorialDeterminismSkipAndRestoredState();
  testCatalogSecrecyAndDeterministicPracticeSeeds();
  testBrowserExportsAndDependencyOrder();
  console.log('v1.12 Training / Physics Lab / Tour tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
