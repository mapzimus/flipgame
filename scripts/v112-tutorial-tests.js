'use strict';

const assert = require('node:assert/strict');
const Tutorial = require('../js/v112-tutorial.js');

function advanceAttempt(state, outcome) {
  const attempt = Tutorial.prepareAttempt(state);
  const result = Tutorial.resolveAttempt(state, attempt, outcome);
  return { attempt, result, state: result.state };
}

function testTourFlowAndRetries() {
  let state = Tutorial.initial(91);
  assert.equal(Tutorial.current(state).id, 'welcome');
  state = Tutorial.acknowledge(state);
  let step = advanceAttempt(state, { qualifiedManual: false });
  assert.equal(step.result.advanced, false);
  step = advanceAttempt(step.state, { qualifiedManual: true });
  state = step.state;
  step = advanceAttempt(state, { qualifiedManual: true, normalizedPower: 0.6, normalizedDirection: -0.1 });
  state = step.state;
  step = advanceAttempt(state, { phase: 'resolved', result: 'MISS' });
  state = step.state;
  state = Tutorial.acknowledge(state);
  step = advanceAttempt(state, { phase: 'resolved', result: 'MAKE', pose: 'upright' });
  state = step.state;
  step = advanceAttempt(state, { phase: 'resolved', result: 'MAKE', pose: 'cap' });
  state = step.state;
  assert.equal(Tutorial.current(state).id, 'deep-time-preview');
  assert.equal(Tutorial.current(state).objectId, 'trex');
  state = Tutorial.acknowledge(state);
  step = advanceAttempt(state, { phase: 'resolved', result: 'MISS' });
  assert.equal(step.attempt.objectId, 'trex');
  assert.equal(step.attempt.temporaryObject, true);
  assert.equal(step.attempt.eventSelection.eventId, 'rainbow-corkscrew');
  assert.equal(step.attempt.eventSelection.testData, true);
  state = step.state;
  step = advanceAttempt(state, { phase: 'resolved', result: 'MISS' });
  assert.equal(step.attempt.objectId, 'trex');
  assert.equal(step.attempt.temporaryObject, true);
  assert.equal(step.attempt.eventSelection.eventId, 'trampoline');
  assert.equal(step.attempt.progressionEligible, false);
  assert.deepEqual(step.result.awards, []);
  assert.equal(step.state.completed, true);
}

function testDeterminismSkipAndIsolation() {
  let a = Tutorial.acknowledge(Tutorial.initial(7));
  let b = Tutorial.acknowledge(Tutorial.initial(7));
  assert.equal(Tutorial.prepareAttempt(a).seed, Tutorial.prepareAttempt(b).seed);
  const skipped = Tutorial.skip(a);
  assert.equal(skipped.skipped, true);
  assert.equal(skipped.completed, false);
  assert.throws(() => Tutorial.acknowledge(a), /not a card/);
}

function stateAtCap(seed = 3) {
  let state = Tutorial.acknowledge(Tutorial.initial(seed));
  state = advanceAttempt(state, { qualifiedManual: true }).state;
  state = advanceAttempt(state, { qualifiedManual: true,
    normalizedPower: 0.5, normalizedDirection: 0 }).state;
  state = advanceAttempt(state, { phase: 'resolved', result: 'MISS' }).state;
  state = Tutorial.acknowledge(state);
  state = advanceAttempt(state, { phase: 'resolved', result: 'MAKE', pose: 'upright' }).state;
  return state;
}

function testGuidedCapCompletionCannotStall() {
  let state = stateAtCap();
  let first = advanceAttempt(state, { phase: 'resolved', qualifiedManual: true,
    result: 'MISS', pose: 'other' });
  assert.equal(first.attempt.guidedAssist, false);
  assert.equal(first.result.advanced, false);
  state = first.state;
  let second = advanceAttempt(state, { phase: 'resolved', qualifiedManual: true,
    result: 'MAKE', pose: 'upright' });
  assert.equal(second.attempt.guidedAssist, false);
  assert.equal(second.result.advanced, false);
  state = second.state;
  const third = advanceAttempt(state, { phase: 'resolved', qualifiedManual: true,
    result: 'MISS', pose: 'other' });
  assert.equal(third.attempt.guidedAssist, true);
  assert.equal(third.result.advanced, true);
  assert.equal(third.result.guidedCompletion, true);
  assert.equal(Tutorial.current(third.state).id, 'deep-time-preview');
  assert.deepEqual(Tutorial.targetDurationSeconds, { minimum: 45, maximum: 75 });
}

function testZeroSeedIsDistinctAndMigrates() {
  const zero = Tutorial.initial(0);
  const one = Tutorial.initial(1);
  assert.equal(zero.baseSeed, 0);
  assert.equal(Tutorial.normalize(zero).baseSeed, 0);
  const zeroAttempt = Tutorial.prepareAttempt(Tutorial.acknowledge(zero));
  const oneAttempt = Tutorial.prepareAttempt(Tutorial.acknowledge(one));
  assert.notEqual(zeroAttempt.seed, oneAttempt.seed);
}

function testProtectedTrexPrecedesBothShowcases() {
  const ids = Tutorial.steps.map((step) => step.id);
  assert(ids.indexOf('deep-time-preview') < ids.indexOf('rainbow-demo'));
  assert(ids.indexOf('rainbow-demo') < ids.indexOf('trampoline-demo'));
  for (const id of ['rainbow-demo', 'trampoline-demo']) {
    const step = Tutorial.steps.find((entry) => entry.id === id);
    assert.equal(step.objectId, 'trex');
    assert.equal(step.temporaryObject, true);
  }
}

function run() {
  assert.equal(Tutorial.steps.length, 11);
  testTourFlowAndRetries();
  testDeterminismSkipAndIsolation();
  testGuidedCapCompletionCannotStall();
  testZeroSeedIsDistinctAndMigrates();
  testProtectedTrexPrecedesBothShowcases();
  console.log('v1.12 Tutorial tests passed.');
}

run();
