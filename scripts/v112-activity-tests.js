'use strict';

const assert = require('node:assert/strict');
const Activity = require('../js/v112-activity.js');

function request(patch = {}) {
  return Object.assign({
    matchId: 'match-1', activityId: 'free-play', formatId: 'classic',
    physicsModeId: 'normal', roster: [{ id: 'p1' }, { id: 'p2' }], seed: 7,
  }, patch);
}

function testContractsAndValidation() {
  const value = Activity.MatchRequestV2(request());
  assert.equal(value.schema, 'MatchRequestV2');
  assert.equal(value.roster[1].seat, 1);
  assert(Object.isFrozen(value.roster));
  assert.throws(() => Activity.MatchRequestV2(request({ activityId: 'story', formatId: 'cup' })),
    /requires classic/);
  assert.throws(() => Activity.MatchRequestV2(request({ roster: [] })), /1–16/);
  assert.throws(() => Activity.MatchRequestV2(request({
    roster: [{ id: 'same' }, { id: 'same' }],
  })), /Duplicate/);
  assert.throws(() => Activity.MatchRequestV2(request({ formatId: 'battle', physicsModeId: 'alien' })),
    /does not support/);
  assert.throws(() => Activity.MatchRequestV2(request({ activityId: 'story', physicsModeId: 'insane' })),
    /prescribed Story physics/);
  assert.equal(Activity.MatchRequestV2(request({ activityId: 'story', physicsModeId: 'alien',
    activityContext: { rivalId: 'visitor-zero', nativeAlien: true } })).physicsModeId, 'alien');
  assert.throws(() => Activity.MatchRequestV2(request({ activityId: 'tutorial', physicsModeId: 'alien' })),
    /normal physics/);
  assert.throws(() => Activity.MatchRequestV2(request({ activityId: 'practice', formatId: 'battle' })),
    /free-play format/);
}

async function testCoordinatorExactlyOnceAndStatsFailure() {
  let prepared = 0, resolved = 0, transactions = 0, stats = 0;
  const registry = Activity.createActivityRegistry([{
    id: 'free-play',
    prepare({ request: value }) { prepared += 1; return { seed: value.seed }; },
    resolve({ outcome }) { resolved += 1; return { winner: outcome.winnerIds[0] }; },
  }]);
  const coordinator = Activity.createMatchSessionCoordinator({
    registry,
    transaction(command) {
      transactions += 1;
      return { claim: command.idempotencyKey, presentation: { title: 'Done' } };
    },
    statsSink() { stats += 1; throw new Error('storage unavailable'); },
  });
  coordinator.start(request());
  const outcome = { matchId: 'match-1', status: 'completed', winnerIds: ['p1'] };
  const [first, second] = await Promise.all([
    coordinator.finalize(outcome), coordinator.finalize(outcome),
  ]);
  assert.equal(first, second, 'concurrent finalization must share one promise/result');
  assert.equal(prepared, 1);
  assert.equal(resolved, 1);
  assert.equal(transactions, 1);
  assert.equal(first.presentation.title, 'Done');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(stats, 1, 'stats failure is attempted but must not reject finalization');
  assert.equal(coordinator.snapshot('match-1').status, 'finalized');
}

async function testCoordinatorValidationAndSafeRetry() {
  let resolved = 0, transactions = 0;
  const registry = Activity.createActivityRegistry([{
    id: 'free-play', resolve() { resolved += 1; return { stable: true }; },
  }]);
  const coordinator = Activity.createMatchSessionCoordinator({
    registry,
    transaction() {
      transactions += 1;
      if (transactions === 1) throw new Error('temporary storage failure');
      return { duplicate: false };
    },
  });
  coordinator.start(request({ matchId: 'retry-match' }));
  await assert.rejects(() => coordinator.finalize({ matchId: 'retry-match', winnerIds: ['outsider'] }),
    /outside the match roster/);
  const outcome = { matchId: 'retry-match', status: 'completed', winnerIds: ['p1'] };
  await assert.rejects(() => coordinator.finalize(outcome), /temporary storage failure/);
  assert.equal(coordinator.snapshot('retry-match').status, 'active');
  const result = await coordinator.finalize(outcome);
  assert.equal(result.status, 'completed');
  assert.equal(resolved, 1, 'activity resolution remains pure and is reused across transaction retry');
  assert.equal(transactions, 2);
  await assert.rejects(() => coordinator.finalize(Object.assign({}, outcome, { winnerIds: ['p2'] })),
    /not active|Conflicting/);
}

function testAbandon() {
  let abandoned = 0;
  const registry = Activity.createActivityRegistry([{
    id: 'story',
    abandon({ reason }) { abandoned += 1; return { reason }; },
  }]);
  const coordinator = Activity.createMatchSessionCoordinator({ registry });
  coordinator.start(request({ matchId: 'story-1', activityId: 'story' }));
  const result = coordinator.abandon('story-1', 'window-closed');
  assert.equal(result.status, 'abandoned');
  assert.equal(result.activityResolution.reason, 'window-closed');
  assert.equal(abandoned, 1);
  assert.equal(coordinator.abandon('story-1').status, 'abandoned');
}

async function testVersionedDynamicActivityStateBridge() {
  const phases = [];
  let current = {
    schema: 'TrainingActivityStateV1', testData: false,
    statisticsDefaultEligible: true, forcedAttemptSeen: false,
  };
  let preparedState = null;
  let resolvedState = null;
  let transactionState = null;
  let statsState = null;
  const registry = Activity.createActivityRegistry([{
    id: 'practice',
    prepare({ activityState }) { preparedState = activityState; return { ready: true }; },
    resolve({ outcome }) { resolvedState = outcome.activityState; return outcome.activityState; },
  }]);
  const coordinator = Activity.createMatchSessionCoordinator({
    registry,
    transaction(command) {
      transactionState = command.outcome.activityState;
      return { duplicate: false };
    },
    statsSink(payload) { statsState = payload.outcome.activityState; },
  });
  assert.throws(() => coordinator.start(request({
    matchId: 'dynamic-missing-provider', activityId: 'practice',
    activityContext: { dynamicActivityState: true },
  })), /require an activity-state provider/,
  'a serialized dynamic request cannot silently bypass its live session provider');
  assert.equal(coordinator.snapshot('dynamic-missing-provider'), null,
    'a rejected provider-less request never opens a coordinator session');
  const provider = Activity.createSessionActivityStateProvider(({ schema, phase }) => {
    assert.equal(schema, 'SessionActivityStateReadV1');
    phases.push(phase);
    return current;
  });
  const hooks = Activity.MatchSessionHooksV1({ activityStateProvider: provider });
  const opened = coordinator.start(request({ matchId: 'dynamic-finalize',
    activityId: 'practice' }), hooks);
  assert.equal(opened.hasActivityStateProvider, true);
  assert.equal(preparedState.testData, false);
  current = {
    schema: 'TrainingActivityStateV1', testData: true,
    statisticsDefaultEligible: false, forcedAttemptSeen: true,
  };
  const finalPromise = coordinator.finalize({
    matchId: 'dynamic-finalize', status: 'completed', winnerIds: ['p1'],
    // Callers cannot downgrade the authoritative provider classification.
    activityState: { testData: false, statisticsDefaultEligible: true },
  });
  current = { schema: 'TrainingActivityStateV1', testData: false,
    statisticsDefaultEligible: true, forcedAttemptSeen: false };
  const duplicatePromise = coordinator.finalize({
    matchId: 'dynamic-finalize', status: 'completed', winnerIds: ['p1'],
  });
  const [resolution, duplicate] = await Promise.all([finalPromise, duplicatePromise]);
  assert.equal(resolution, duplicate);
  assert.equal(resolvedState.testData, true);
  assert.equal(transactionState.testData, true);
  assert.equal(transactionState.statisticsDefaultEligible, false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(statsState.testData, true);
  assert.deepEqual(phases, ['prepare', 'finalize'],
    'finalize freezes one authoritative provider snapshot even across concurrent calls');

  let abandonState = { schema: 'TrainingActivityStateV1', testData: false,
    statisticsDefaultEligible: true };
  let abandonedPayload = null;
  const abandonRegistry = Activity.createActivityRegistry([{
    id: 'practice',
    abandon(payload) { abandonedPayload = payload; return payload.activityState; },
  }]);
  const abandonCoordinator = Activity.createMatchSessionCoordinator({ registry: abandonRegistry });
  const abandonProvider = Activity.createSessionActivityStateProvider(() => abandonState);
  abandonCoordinator.start(request({ matchId: 'dynamic-abandon',
    activityId: 'practice' }), Activity.MatchSessionHooksV1({
    activityStateProvider: abandonProvider,
  }));
  abandonState = { schema: 'TrainingActivityStateV1', testData: true,
    statisticsDefaultEligible: false, forcedAttemptSeen: true };
  const abandoned = abandonCoordinator.abandon('dynamic-abandon', 'back');
  assert.equal(abandoned.activityResolution.testData, true);
  assert.equal(abandonedPayload.activityState.statisticsDefaultEligible, false);

  assert.throws(() => Activity.createSessionActivityStateProvider(null), /reader is required/);
  assert.throws(() => Activity.MatchSessionHooksV1({
    activityStateProvider: { schema: 'SessionActivityStateProviderV1' },
  }), /Invalid/);
  const invalidRegistry = Activity.createActivityRegistry([{ id: 'practice' }]);
  const invalidCoordinator = Activity.createMatchSessionCoordinator({ registry: invalidRegistry });
  assert.throws(() => invalidCoordinator.start(request({ matchId: 'bad-state-provider',
    activityId: 'practice' }), Activity.MatchSessionHooksV1({
    activityStateProvider: Activity.createSessionActivityStateProvider(() => 'bad'),
  })), /object or null/);
}

function testLaneIsolationAndTransitions() {
  const left = Activity.createLaneRuntime({ laneId: 'left', ownerId: 'p1' });
  const right = Activity.createLaneRuntime({ laneId: 'right', ownerId: 'p2' });
  assert.equal(left.claimPointer(10), true);
  assert.equal(left.claimPointer(11), false);
  assert.equal(right.claimPointer(11), true);
  left.armAttempt('attempt-left');
  left.transition('contact');
  left.transition('settling');
  left.resolveAttempt({ verdict: 'MAKE' });
  assert.equal(right.snapshot().state, 'aiming', 'one lane cannot mutate another lane');
  left.addCharge(3);
  left.offerPower([{ id: 'magnet-pulse' }, { id: 'moon-round' }]);
  left.storePower(1);
  assert.equal(left.consumePower().id, 'moon-round');
  assert.equal(left.consumePower(), null);
  left.transition('ready');
  assert.equal(left.snapshot().attemptId, null);
  assert.throws(() => left.transition('settling'), /Invalid lane transition/);
}

async function run() {
  testContractsAndValidation();
  await testCoordinatorExactlyOnceAndStatsFailure();
  await testCoordinatorValidationAndSafeRetry();
  testAbandon();
  await testVersionedDynamicActivityStateBridge();
  testLaneIsolationAndTransitions();
  console.log('v1.12 activity/session tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
