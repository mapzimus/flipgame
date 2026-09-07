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
  testAbandon();
  testLaneIsolationAndTransitions();
  console.log('v1.12 activity/session tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
