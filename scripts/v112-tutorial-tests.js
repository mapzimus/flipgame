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
  step = advanceAttempt(state, { phase: 'resolved', result: 'MISS' });
  assert.equal(step.attempt.eventSelection.eventId, 'rainbow-corkscrew');
  assert.equal(step.attempt.eventSelection.testData, true);
  state = step.state;
  assert.equal(Tutorial.current(state).id, 'deep-time-preview');
  assert.equal(Tutorial.current(state).objectId, 'trex');
  state = Tutorial.acknowledge(state);
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

function run() {
  assert.equal(Tutorial.steps.length, 11);
  testTourFlowAndRetries();
  testDeterminismSkipAndIsolation();
  console.log('v1.12 Tutorial tests passed.');
}

run();
