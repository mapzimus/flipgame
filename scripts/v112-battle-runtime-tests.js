'use strict';

const assert = require('node:assert/strict');
const MultiPointer = require('../js/v112-multipointer.js');
const Runtime = require('../js/v112-battle-runtime.js');

function pointer(pointerId, clientX, clientY, timeStamp, patch = {}) {
  return Object.assign({ pointerId, clientX, clientY, timeStamp, pointerType: 'touch',
    pressure: 0.5, preventDefault() {} }, patch);
}

function captureTarget() {
  const captured = new Set();
  const set = [];
  const released = [];
  return {
    set, released,
    setPointerCapture(id) { captured.add(id); set.push(id); },
    releasePointerCapture(id) { captured.delete(id); released.push(id); },
    hasPointerCapture(id) { return captured.has(id); },
  };
}

function laneRects(count, width = 1200, height = 600) {
  const laneWidth = width / count;
  return Array.from({ length: count }, (_, index) => ({
    laneId: `lane-${index + 1}`,
    left: index * laneWidth,
    top: 0,
    width: laneWidth,
    height,
  }));
}

function players(count, options = {}) {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    teamId: options.teams ? (index < count / 2 ? 'a' : 'b') : null,
    cpu: options.cpu === true || (Array.isArray(options.cpu) && options.cpu.includes(index + 1)),
  }));
}

function adapterHarness() {
  const launches = [];
  const assignments = [];
  const contacts = [];
  const resolves = [];
  const resources = [];
  function factory(context) {
    resources.push(context.resources);
    return {
      resources: context.resources,
      launch(value) { launches.push(value); },
      onAssignment(value) { assignments.push(value); },
      onContact(value) { contacts.push(value); },
      onResolve(value) { resolves.push(value); },
      reset() {},
    };
  }
  return { factory, launches, assignments, contacts, resolves, resources };
}

function successfulGesture(runtime, laneIndex, pointerId, time = 0, rects = laneRects(2)) {
  const rect = rects[laneIndex];
  const x = rect.left + rect.width / 2;
  assert.equal(runtime.handlePointerDown(pointer(pointerId, x, 420, time)), true);
  assert.equal(runtime.handlePointerMove(pointer(pointerId, x + 4, 340, time + 40)), true);
  assert.equal(runtime.handlePointerUp(pointer(pointerId, x + 8, 250, time + 80)), true);
}

function testMultiPointerSamplingCaptureAndFrozenGeometry() {
  const releases = [];
  const cancellations = [];
  const samples = [];
  const capture = captureTarget();
  const router = MultiPointer.createMultiPointerRouter({
    laneRects: laneRects(2, 1000),
    captureTarget: capture,
    onSample(value) { samples.push(value); },
    onRelease(value) { releases.push(value); },
    onCancel(value) { cancellations.push(value); },
  });

  assert.equal(router.handlePointerDown(pointer(1, 250, 400, 10)), true);
  assert.equal(router.handlePointerDown(pointer(2, 260, 390, 11)), false,
    'one lane cannot be claimed by two pointers');
  router.setLaneRects(laneRects(2, 600));
  const coalesced = [pointer(1, 240, 350, 20), pointer(1, 230, 300, 30)];
  assert.equal(router.handlePointerMove(pointer(1, 220, 260, 40, {
    getCoalescedEvents() { return coalesced; },
  })), true);
  assert.equal(router.handlePointerUp(pointer(1, 210, 220, 50)), true);
  assert.deepEqual(capture.set, [1]);
  assert.deepEqual(capture.released, [1]);
  assert.equal(releases.length, 1);
  assert.equal(releases[0].geometry.width, 500, 'active gesture keeps pointerdown geometry');
  assert.equal(releases[0].samples.at(-1).nx, 0.42,
    'final up sample uses frozen lane-relative CSS coordinates');
  assert(samples.length >= 5, 'coalesced and dispatched samples are retained');
  assert(Object.isFrozen(releases[0].samples));
  assert(Object.isFrozen(releases[0].geometry));

  assert.equal(router.handlePointerDown(pointer(3, 450, 400, 60)), true,
    'new gesture uses resized right-lane geometry');
  assert.equal(router.handlePointerCancel(pointer(3, 450, 380, 70)), true);
  assert.equal(cancellations[0].reason, 'pointercancel');

  assert.equal(router.handlePointerDown(pointer(4, 100, 400, 80)), true);
  assert.equal(router.handleLostPointerCapture(pointer(4, 100, 400, 81)), true);
  assert.equal(cancellations[1].reason, 'lostpointercapture');

  // No move event: pointerup is still an authoritative sample.
  assert.equal(router.handlePointerDown(pointer(5, 100, 400, 90)), true);
  assert.equal(router.handlePointerUp(pointer(5, 100, 200, 120)), true);
  assert.equal(releases[1].samples.length, 2);
}

function createRuntime({ formatId = 'duel', paceId = 'volley', count = 2,
  width = 1200, contacts = 2, powerProfileId = 'sport', seed = 1,
  cpu = false, teams = false, harness = adapterHarness(), onRelay } = {}) {
  const rects = laneRects(width >= 1100 && contacts >= 4 ? 4 : (width >= 768 && contacts >= 2 ? 2 : 1), width);
  const runtime = Runtime.createBattleRuntime({
    matchId: `match-${formatId}-${paceId}-${seed}-${contacts}`,
    config: { formatId, paceId, powerProfileId, seed, players: players(count, { cpu, teams }),
      hardware: { width, verifiedContacts: contacts } },
    laneRects: rects,
    laneAdapterFactory: harness.factory,
    onRelay,
    now: () => 12345,
  });
  runtime.startHeat();
  return { runtime, harness, rects };
}

function testSynchronizedTwoPointerVolleyAndResultOrdering() {
  const capture = captureTarget();
  const harness = adapterHarness();
  const rects = laneRects(2);
  const runtime = Runtime.createBattleRuntime({
    matchId: 'two-pointer-volley',
    config: { formatId: 'duel', paceId: 'volley', players: players(2),
      hardware: { width: 1200, verifiedContacts: 2 } },
    laneRects: rects,
    laneAdapterFactory: harness.factory,
    captureTarget: capture,
    now: () => 777,
  });
  runtime.startHeat();

  assert.equal(runtime.handlePointerDown(pointer(11, 250, 420, 0)), true);
  assert.equal(runtime.handlePointerDown(pointer(22, 850, 420, 1)), true);
  assert.equal(runtime.handlePointerUp(pointer(22, 850, 240, 70)), true);
  assert.equal(harness.launches.length, 0, 'Volley waits for every active lane');
  assert.equal(runtime.snapshot().lanes[1].state, 'armed');
  assert.equal(runtime.handlePointerUp(pointer(11, 250, 240, 80)), true);
  assert.equal(harness.launches.length, 2);
  assert.equal(harness.launches[0].gateId, harness.launches[1].gateId);
  assert.equal(harness.launches[0].launchedAt, 777);
  assert.equal(harness.launches[1].launchedAt, 777);
  assert.equal(harness.launches[0].ordinaryEvent, null);
  assert.equal(harness.launches[0].randomEventsEnabled, false);
  assert.equal(harness.launches[0].terminalEventsAllowed, false);
  assert.equal(harness.launches[0].crossLaneCollisions, false);

  const left = harness.launches.find((entry) => entry.laneId === 'lane-1');
  const right = harness.launches.find((entry) => entry.laneId === 'lane-2');
  assert.equal(left.attemptId, 'two-pointer-volley:lane-1:attempt-1');
  assert.equal(right.attemptId, 'two-pointer-volley:lane-2:attempt-1',
    'attempt IDs are lane-deterministic rather than release-order-dependent');
  runtime.resolveAttempt('lane-2', right.attemptId, { pose: 'miss' });
  assert.equal(runtime.snapshot().battle.resolvedAttemptIds.length, 0,
    'Volley outcomes remain buffered until the synchronized gate settles');
  runtime.resolveAttempt('lane-1', left.attemptId, { pose: 'upright' });
  assert.deepEqual(runtime.snapshot().battle.resolvedAttemptIds, [left.attemptId, right.attemptId],
    'different settle times cannot change deterministic lane order');
  assert.equal(runtime.snapshot().battle.scores.p1, 1);
  assert.equal(runtime.snapshot().battle.scores.p2, 0);
  assert.deepEqual(capture.set.slice().sort((a, b) => a - b), [11, 22]);
}

function testFourPointerIsolationAndLifecycle() {
  const harness = adapterHarness();
  const { runtime, rects } = createRuntime({ formatId: 'four-way', count: 4,
    width: 1600, contacts: 4, harness });
  [4, 2, 1, 3].forEach((number, order) => successfulGesture(runtime, number - 1,
    100 + number, order * 100, rects));
  assert.equal(harness.launches.length, 4);
  assert.equal(new Set(harness.launches.map((entry) => entry.gateId)).size, 1);
  assert.equal(new Set(harness.resources.map((entry) => entry.bodyState)).size, 4);
  assert.equal(new Set(harness.resources.map((entry) => entry.cameraState)).size, 4);
  assert.equal(new Set(harness.resources.map((entry) => entry.audioState)).size, 4);
  assert.equal(new Set(harness.resources.map((entry) => entry.eventState)).size, 4);
  assert.equal(Object.isFrozen(harness.resources[0].bodyState), false,
    'each adapter receives mutable physics state inside its isolated container');
  harness.resources[0].bodyState.testValue = 9;
  assert.equal(harness.resources[1].bodyState.testValue, undefined);
  harness.launches.forEach((launch) => {
    assert.equal(launch.resources.laneId, launch.laneId);
    assert.deepEqual(launch.powerEffects, []);
  });

  const first = harness.launches[0];
  const second = harness.launches[1];
  runtime.reportContact(first.laneId, first.attemptId);
  runtime.reportSettling(first.laneId, first.attemptId);
  assert.equal(runtime.snapshot().lanes[0].state, 'settling');
  assert.equal(runtime.snapshot().lanes[1].state, 'airborne',
    'one lane lifecycle cannot alter another lane');
  runtime.reportAirborne(first.laneId, first.attemptId);
  assert.equal(runtime.snapshot().lanes[0].state, 'airborne');
  assert.equal(harness.contacts.length, 1);

  harness.launches.slice().reverse().forEach((launch) => {
    runtime.resolveAttempt(launch.laneId, launch.attemptId,
      { pose: launch === second ? 'cap' : 'miss' });
  });
  assert.equal(runtime.snapshot().battle.scores.p2, 2);
}

function testAdapterCannotSubstituteSharedResources() {
  let firstResources;
  assert.throws(() => Runtime.createBattleRuntime({
    matchId: 'shared-adapter',
    config: { formatId: 'duel', paceId: 'volley', players: players(2),
      hardware: { width: 1200, verifiedContacts: 2 } },
    laneRects: laneRects(2),
    laneAdapterFactory(context) {
      if (!firstResources) firstResources = context.resources;
      return { resources: firstResources, launch() {} };
    },
  }), /supplied isolated resources/);

  const harness = adapterHarness();
  const duel = Runtime.createBattleRuntime({
    matchId: 'four-touch-duel',
    config: { formatId: 'duel', paceId: 'volley', players: players(2),
      hardware: { width: 1600, verifiedContacts: 4 } },
    laneRects: laneRects(2, 1600),
    laneAdapterFactory: harness.factory,
  });
  duel.startHeat();
  assert.equal(duel.snapshot().lanes.length, 2,
    'a four-touch display does not require unused lanes for a duel');
}

function testResizeDuringGestureAndRushIndependentRearm() {
  const harness = adapterHarness();
  const { runtime } = createRuntime({ paceId: 'rush', harness });
  const resizedRects = [
    { laneId: 'lane-1', left: 0, top: 0, width: 300, height: 600 },
    { laneId: 'lane-2', left: 300, top: 0, width: 300, height: 600 },
  ];
  assert.equal(runtime.handlePointerDown(pointer(31, 250, 420, 0)), true);
  runtime.updateLaneRects(resizedRects);
  assert.equal(runtime.handlePointerUp(pointer(31, 250, 240, 80)), true);
  const p1First = harness.launches.at(-1);
  assert.equal(p1First.gesture.geometry.width, 600,
    'flight geometry is frozen from pointerdown despite render resize');

  successfulGesture(runtime, 1, 32, 100, resizedRects);
  const p2First = harness.launches.at(-1);
  runtime.resolveAttempt('lane-1', p1First.attemptId, { pose: 'upright' });
  assert.equal(runtime.snapshot().lanes[0].state, 'ready');
  assert.equal(runtime.snapshot().lanes[1].state, 'airborne');
  successfulGesture(runtime, 0, 33, 200, resizedRects);
  assert.equal(harness.launches.filter((entry) => entry.playerId === 'p1').length, 2,
    'Rush lane re-arms without waiting for the other lane to settle');
  runtime.resolveAttempt('lane-2', p2First.attemptId, { pose: 'miss' });
  const p1Second = harness.launches.at(-1);
  runtime.resolveAttempt('lane-1', p1Second.attemptId, { pose: 'miss' });
}

function testPowerTargetLocksAtPointerDownAndStaysFallible() {
  const harness = adapterHarness();
  const { runtime, rects } = createRuntime({ paceId: 'rush', powerProfileId: 'mayhem',
    seed: 2, harness });
  for (let index = 0; index < 3; index += 1) {
    successfulGesture(runtime, 0, 200 + index, index * 100, rects);
    const launch = harness.launches.at(-1);
    runtime.resolveAttempt('lane-1', launch.attemptId, { pose: 'miss' });
  }
  const offer = runtime.snapshot().battle.powerOffers.p1;
  assert.equal(offer[1].scope, 'target');
  runtime.choosePower({ playerId: 'p1', index: 1, targetId: 'p2' });

  assert.equal(runtime.handlePointerDown(pointer(250, 900, 420, 400)), true);
  assert.throws(() => runtime.deployPower('p1'), /before the affected pointerdown/);
  runtime.handlePointerCancel(pointer(250, 900, 420, 410));
  const deployment = runtime.deployPower('p1');
  assert.deepEqual(deployment.destinations, ['p2']);
  successfulGesture(runtime, 1, 251, 500, rects);
  const powered = harness.launches.at(-1);
  assert.equal(powered.powerEffects.length, 1);
  assert.equal(powered.powerEffects[0].eventAdapterId, 'gravity-slam');
  assert.equal(powered.randomEventsEnabled, false);
  runtime.resolveAttempt('lane-2', powered.attemptId, { pose: 'miss' });
  assert.equal(runtime.snapshot().battle.scores.p2, 0,
    'a physical Battle power never forces a successful verdict');
}

function testHornHonorsAirborneLeaseAndRejectsLateInput() {
  const harness = adapterHarness();
  const { runtime, rects } = createRuntime({ paceId: 'rush', harness });
  successfulGesture(runtime, 0, 301, 59000, rects);
  const pending = harness.launches.at(-1);
  runtime.tick(60000);
  assert.equal(runtime.snapshot().hornExpired, true);
  assert.equal(runtime.snapshot().battle.clockExpired, true);
  assert.equal(runtime.snapshot().battle.phase, 'active',
    'a qualified pre-horn launch remains pending');
  assert.equal(runtime.handlePointerDown(pointer(302, 900, 420, 60001)), false,
    'new input cannot arm after the horn');
  runtime.resolveAttempt('lane-1', pending.attemptId, { pose: 'cap' });
  assert.equal(runtime.snapshot().battle.phase, 'between-heats');
  assert.equal(runtime.snapshot().battle.heatWins.p1, 1);
}

function testRushTieOpensPostHornSynchronizedGate() {
  const harness = adapterHarness();
  const { runtime, rects } = createRuntime({ paceId: 'rush', harness });
  runtime.tick(60000);
  assert.equal(runtime.snapshot().battle.suddenDeath, true);
  assert.equal(runtime.snapshot().hornExpired, true);
  successfulGesture(runtime, 0, 401, 60010, rects);
  assert.equal(harness.launches.length, 0);
  successfulGesture(runtime, 1, 402, 60020, rects);
  assert.equal(harness.launches.length, 2,
    'paired sudden death remains playable through a synchronized gate after the horn');
  const left = harness.launches.find((entry) => entry.laneId === 'lane-1');
  const right = harness.launches.find((entry) => entry.laneId === 'lane-2');
  runtime.resolveAttempt(left.laneId, left.attemptId, { pose: 'upright' });
  runtime.resolveAttempt(right.laneId, right.attemptId, { pose: 'miss' });
  assert.equal(runtime.snapshot().battle.heatWins.p1, 1);
}

function playCpuFourWayVolley(contacts) {
  const relays = [];
  const harness = adapterHarness();
  const { runtime } = createRuntime({ formatId: 'four-way', count: 4, width: 1600,
    contacts, cpu: true, harness, onRelay(value) { relays.push(value.playerId); } });
  const poses = { p1: 'upright', p2: 'miss', p3: 'miss', p4: 'miss' };
  let safety = 0;
  while (runtime.snapshot().battle.phase === 'active' && safety < 40) {
    safety += 1;
    const active = runtime.snapshot().lanes.filter((lane) => lane.playerId && lane.state === 'ready');
    const attempts = active.map((lane) => ({ laneId: lane.laneId, playerId: lane.playerId,
      attemptId: runtime.prepareCpuLaunch(lane.playerId, { launchSignal: { scripted: true } }) }));
    attempts.forEach((attempt) => runtime.resolveAttempt(attempt.laneId, attempt.attemptId,
      { pose: poses[attempt.playerId] }));
  }
  assert(safety < 40, 'scripted heat should terminate');
  return { snapshot: runtime.snapshot(), relays, launches: harness.launches };
}

function testTwoFourTouchProfilesAndRelayFairness() {
  const four = playCpuFourWayVolley(4);
  const relay = playCpuFourWayVolley(1);
  assert.deepEqual(relay.snapshot.battle.scores, four.snapshot.battle.scores,
    'alternating relay preserves identical scoring opportunity');
  assert.deepEqual(relay.snapshot.battle.heatWins, four.snapshot.battle.heatWins);
  assert.equal(four.snapshot.battle.config.hardware.activeLaneLimit, 4);
  assert.equal(relay.snapshot.battle.config.hardware.activeLaneLimit, 1);
  assert.equal(relay.snapshot.battle.config.hardware.fallback, 'alternating-relay');
  assert(relay.relays.includes('p1') && relay.relays.includes('p2') &&
    relay.relays.includes('p3') && relay.relays.includes('p4'),
  'relay announces every player handoff');
  assert.deepEqual(relay.snapshot.battle.charges, { p1: 0, p2: 0, p3: 0, p4: 0 },
    'CPU handoffs never earn manual-launch charges');

  const two = createRuntime({ formatId: 'four-way', count: 4, width: 900,
    contacts: 4, cpu: true });
  assert.equal(two.runtime.snapshot().battle.config.hardware.activeLaneLimit, 2,
    'compact verified hardware uses exactly two simultaneous lanes');
}

function run() {
  testMultiPointerSamplingCaptureAndFrozenGeometry();
  testSynchronizedTwoPointerVolleyAndResultOrdering();
  testFourPointerIsolationAndLifecycle();
  testAdapterCannotSubstituteSharedResources();
  testResizeDuringGestureAndRushIndependentRearm();
  testPowerTargetLocksAtPointerDownAndStaysFallible();
  testHornHonorsAirborneLeaseAndRejectsLateInput();
  testRushTieOpensPostHornSynchronizedGate();
  testTwoFourTouchProfilesAndRelayFairness();
  console.log('v1.12 Battle simultaneous-lane runtime tests passed.');
}

run();
