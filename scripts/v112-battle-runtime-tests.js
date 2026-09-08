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
  assert.deepEqual(releases[0].samples.map((sample) => sample.timeStamp), [10, 20, 30, 40, 50],
    'coalesced samples are processed chronologically');
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

function canonicalGesture(width, height, pointerType = 'touch', points) {
  const values = points || [
    { nx: 0.40, ny: 0.75, timeStamp: 100 },
    { nx: 0.45, ny: 0.60, timeStamp: 180 },
    { nx: 0.50, ny: 0.55, timeStamp: 260 },
  ];
  return {
    pointerType,
    geometry: { left: 0, top: 0, width, height },
    samples: values.map((point) => ({
      x: point.nx * width,
      y: point.ny * height,
      nx: point.nx,
      ny: point.ny,
      timeStamp: point.timeStamp,
    })),
  };
}

function testCanonicalQualifierAcrossDevicesAndPointerTypes() {
  const viewports = [[360, 640], [1280, 720], [3840, 2160]];
  const pointerTypes = ['touch', 'pen', 'mouse'];
  const results = [];
  for (const [width, height] of viewports) {
    for (const pointerType of pointerTypes) {
      const result = Runtime.defaultQualifier(canonicalGesture(width, height, pointerType));
      assert.equal(result.qualified, true);
      results.push(result.launchSignal);
    }
  }
  for (const signal of results) {
    assert.ok(Math.abs(signal.vx - results[0].vx) <= Math.abs(results[0].vx) * 0.02);
    assert.ok(Math.abs(signal.vy - results[0].vy) <= Math.abs(results[0].vy) * 0.02);
    assert.ok(Math.abs(signal.peakSpeed - results[0].peakSpeed) <= results[0].peakSpeed * 0.02);
  }
  assert.equal(new Set(results.map((signal) => `${signal.vx}:${signal.vy}`)).size, 1,
    'pointer type has no hidden launch multiplier');
}

function testCanonicalRadialDeadzoneAndLongDistanceFallback() {
  function displacement(dx, dy, duration = 100) {
    return Runtime.defaultQualifier(canonicalGesture(1280, 720, 'touch', [
      { nx: 100 / 1280, ny: 100 / 720, timeStamp: 0 },
      { nx: (100 + dx) / 1280, ny: (100 + dy) / 720, timeStamp: duration },
    ]));
  }
  assert.equal(displacement(21, 0).qualified, false);
  assert.equal(displacement(22, 0).qualified, true, 'sideways 22px gesture must qualify');
  assert.equal(displacement(0, 22).qualified, true, 'downward 22px gesture must qualify');

  const phone = Runtime.defaultQualifier(canonicalGesture(360, 640, 'touch', [
    { nx: 0.25, ny: 0.5, timeStamp: 0 },
    { nx: 0.25 + 22 / 1280, ny: 0.5, timeStamp: 100 },
  ]));
  assert.equal(phone.qualified, true,
    'deadzone is 22 canonical pixels, not 22 phone CSS pixels');

  const longDrag = displacement(30, 0, 10000);
  assert.equal(longDrag.qualified, true, 'core input has no Battle-only 1500ms rejection');
  assert.equal(longDrag.launchSignal.usedDistanceFallback, true);
  assert.equal(Math.round(longDrag.launchSignal.vx), 300,
    'slow gestures use canonical total-distance fallback');
}

function testChronologicalPeakAndQuantizedTimestamps() {
  const peak = Runtime.defaultQualifier(canonicalGesture(1280, 720, 'mouse', [
    { nx: 400 / 1280, ny: 500 / 720, timeStamp: 0 },
    { nx: 400 / 1280, ny: 480 / 720, timeStamp: 10 },
    { nx: 400 / 1280, ny: 400 / 720, timeStamp: 20 },
    { nx: 400 / 1280, ny: 450 / 720, timeStamp: 30 },
  ]));
  assert.equal(Math.round(peak.launchSignal.vy), -8000,
    'fastest chronological coalesced step supplies the launch signal');

  const quantized = Runtime.defaultQualifier(canonicalGesture(1280, 720, 'pen', [
    { nx: 400 / 1280, ny: 500 / 720, timeStamp: 100 },
    { nx: 400 / 1280, ny: 480 / 720, timeStamp: 110 },
    { nx: 400 / 1280, ny: 300 / 720, timeStamp: 110 },
    // Stale cross-batch sample: must be ignored rather than becoming a spike
    // or changing the endpoint used by the distance fallback.
    { nx: 400 / 1280, ny: 100 / 720, timeStamp: 105 },
    { nx: 400 / 1280, ny: 280 / 720, timeStamp: 120 },
  ]));
  assert.equal(Math.round(quantized.launchSignal.vy), -2000,
    'equal timestamps preserve the path without manufacturing a velocity spike');
  assert.equal(Math.round(quantized.launchSignal.dy), -220,
    'backwards timestamps do not mutate the gesture endpoint');

  for (const [width, height] of [[360, 640], [3840, 2160]]) {
    const scaled = Runtime.defaultQualifier(canonicalGesture(width, height, 'touch', [
      { nx: 400 / 1280, ny: 500 / 720, timeStamp: 100 },
      { nx: 400 / 1280, ny: 480 / 720, timeStamp: 110 },
      { nx: 400 / 1280, ny: 300 / 720, timeStamp: 110 },
      { nx: 400 / 1280, ny: 280 / 720, timeStamp: 120 },
    ]));
    assert.equal(Math.round(scaled.launchSignal.vy), -2000,
      'quantized timestamp transfer must remain viewport-independent');
  }
}

function createRuntime({ formatId = 'duel', paceId = 'volley', count = 2,
  width = 1200, contacts = 2, powerProfileId = 'sport', seed = 1,
  cpu = false, teams = false, harness = adapterHarness(), onRelay,
  onPowerOffer, onError, inputNow = () => 0, inputDeliveryGraceMs } = {}) {
  const rects = laneRects(width >= 1100 && contacts >= 4 ? 4 : (width >= 768 && contacts >= 2 ? 2 : 1), width);
  const runtime = Runtime.createBattleRuntime({
    matchId: `match-${formatId}-${paceId}-${seed}-${contacts}`,
    config: { formatId, paceId, powerProfileId, seed, players: players(count, { cpu, teams }),
      hardware: { width, verifiedContacts: contacts } },
    laneRects: rects,
    laneAdapterFactory: harness.factory,
    onRelay,
    onPowerOffer,
    onError,
    inputNow,
    inputDeliveryGraceMs,
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
  assert.doesNotThrow(() => runtime.resolveAttempt('lane-2', right.attemptId, { pose: 'cap' }));
  assert.equal(runtime.snapshot().battle.resolvedAttemptIds.length, 0,
    'a duplicate synchronized callback cannot overwrite its buffered outcome');
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
    seed: 1, harness });
  for (let index = 0; index < 3; index += 1) {
    successfulGesture(runtime, 0, 200 + index, index * 100, rects);
    const launch = harness.launches.at(-1);
    runtime.resolveAttempt('lane-1', launch.attemptId, { pose: 'miss' });
  }
  const offer = runtime.snapshot().battle.powerOffers.p1;
  assert.equal(runtime.handlePointerDown(pointer(250, 900, 420, 400)), true);
  const targetIndex = offer.findIndex((card) => card.scope === 'target');
  assert(targetIndex >= 0);
  const targetEventId = offer[targetIndex].eventAdapterId;
  runtime.choosePower({ playerId: 'p1', index: targetIndex, targetId: 'p2' });
  assert.throws(() => runtime.deployPower('p1'), /before the affected pointerdown/);
  runtime.handlePointerCancel(pointer(250, 900, 420, 410));
  const deployment = runtime.deployPower('p1');
  assert.deepEqual(deployment.destinations, ['p2']);
  successfulGesture(runtime, 1, 251, 500, rects);
  const powered = harness.launches.at(-1);
  assert.equal(powered.powerEffects.length, 1);
  assert.equal(powered.powerEffects[0].eventAdapterId, targetEventId);
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

function testRushOffersIgnoreSettleOrderAtRuntime() {
  function scenario(resolveOrder) {
    const harness = adapterHarness();
    const { runtime, rects } = createRuntime({ paceId: 'rush', seed: 349, harness });
    for (let round = 0; round < 3; round += 1) {
      successfulGesture(runtime, 0, 600 + round * 2, round * 200, rects);
      successfulGesture(runtime, 1, 601 + round * 2, round * 200 + 10, rects);
      const launches = harness.launches.slice(-2);
      for (const playerId of resolveOrder) {
        const launch = launches.find((entry) => entry.playerId === playerId);
        runtime.resolveAttempt(launch.laneId, launch.attemptId, { pose: 'miss' });
      }
    }
    return runtime.snapshot().battle.powerOffers;
  }
  assert.deepEqual(scenario(['p1', 'p2']), scenario(['p2', 'p1']),
    'Rush power RNG is invariant to cross-lane settle order');
}

function testRuntimeFourWaySuddenDeathPairsOnlyLeaders() {
  const harness = adapterHarness();
  const { runtime, rects } = createRuntime({ formatId: 'four-way', count: 4,
    width: 1600, contacts: 4, harness });
  let pointerId = 680;
  for (let volley = 0; volley < 5; volley += 1) {
    const before = harness.launches.length;
    for (let lane = 0; lane < 4; lane += 1) {
      successfulGesture(runtime, lane, pointerId++, volley * 1000 + lane * 10, rects);
    }
    for (const launch of harness.launches.slice(before)) {
      runtime.resolveAttempt(launch.laneId, launch.attemptId,
        { pose: launch.playerId === 'p1' || launch.playerId === 'p2' ? 'upright' : 'miss' });
    }
  }
  const snapshot = runtime.snapshot();
  assert.deepEqual(snapshot.battle.suddenDeathCompetitorIds.slice().sort(), ['p1', 'p2']);
  assert.deepEqual(snapshot.battle.activePlayerIds.slice().sort(), ['p1', 'p2']);
  assert.equal(snapshot.lanes.filter((lane) => lane.playerId).length, 2);
  assert(snapshot.lanes.filter((lane) => lane.playerId).every((lane) =>
    lane.playerId === 'p1' || lane.playerId === 'p2'));
}

function testSymmetricRoundReachesEveryRepresentative() {
  const harness = adapterHarness();
  const { runtime, rects } = createRuntime({ formatId: 'doubles', paceId: 'rush', count: 4,
    teams: true, width: 1600, contacts: 4, seed: 1, harness });
  for (const [laneIndex, pointerId] of [[0, 700], [1, 701], [0, 702]]) {
    successfulGesture(runtime, laneIndex, pointerId, pointerId, rects);
    const launch = harness.launches.at(-1);
    runtime.resolveAttempt(launch.laneId, launch.attemptId, { pose: 'miss' });
  }
  const offer = runtime.snapshot().battle.powerOffers.a;
  const index = offer.findIndex((card) => card.scope === 'symmetric');
  assert(index >= 0);
  runtime.choosePower({ playerId: 'p1', index });
  const deployment = runtime.deployPower('p1');
  assert.deepEqual(deployment.recipientPlayerIds.slice().sort(), ['p1', 'p2', 'p3', 'p4']);

  const before = harness.launches.length;
  for (let lane = 0; lane < 4; lane += 1) {
    successfulGesture(runtime, lane, 710 + lane, 1000 + lane * 10, rects);
  }
  const powered = harness.launches.slice(before);
  assert.equal(powered.length, 4);
  assert(powered.every((launch) => launch.powerEffects.length === 1));
  assert.deepEqual(powered.map((launch) => launch.playerId).sort(), ['p1', 'p2', 'p3', 'p4']);
  powered.forEach((launch) => runtime.resolveAttempt(launch.laneId, launch.attemptId,
    { pose: 'miss' }));
}

function testSymmetricRoundSurvivesRelayAndCancellation() {
  const harness = adapterHarness();
  const { runtime, rects } = createRuntime({ formatId: 'doubles', paceId: 'volley', count: 4,
    teams: true, width: 600, contacts: 1, seed: 1, harness });
  let pointerId = 750;
  for (let volley = 0; volley < 3; volley += 1) {
    for (let participant = 0; participant < 2; participant += 1) {
      successfulGesture(runtime, 0, pointerId++, pointerId * 10, rects);
      const launch = harness.launches.at(-1);
      runtime.resolveAttempt(launch.laneId, launch.attemptId, { pose: 'miss' });
    }
  }
  const offer = runtime.snapshot().battle.powerOffers.a;
  const index = offer.findIndex((card) => card.scope === 'symmetric');
  assert(index >= 0);
  runtime.choosePower({ playerId: 'p1', index });
  const deployment = runtime.deployPower('p1');
  assert.equal(deployment.recipientPlayerIds.length, 2,
    'future relay representative receives a distinct Round delivery');

  const activePlayer = runtime.snapshot().lanes[0].playerId;
  assert.equal(runtime.handlePointerDown(pointer(pointerId, 300, 420, 5000)), true);
  assert.equal(runtime.handlePointerCancel(pointer(pointerId++, 300, 420, 5010)), true);
  assert.equal(runtime.snapshot().pendingPowers[activePlayer].length, 1,
    'cancelled aim restores only that representative delivery');

  const poweredPlayers = [];
  for (let participant = 0; participant < 2; participant += 1) {
    successfulGesture(runtime, 0, pointerId++, 5100 + participant * 100, rects);
    const launch = harness.launches.at(-1);
    poweredPlayers.push(launch.playerId);
    assert.equal(launch.powerEffects.length, 1);
    runtime.resolveAttempt(launch.laneId, launch.attemptId, { pose: 'miss' });
  }
  assert.deepEqual(poweredPlayers.slice().sort(), deployment.recipientPlayerIds.slice().sort());
}

function testOneLaneRushDuelAndSymmetricRelay() {
  const duelHarness = adapterHarness();
  const duel = createRuntime({ paceId: 'rush', width: 600, contacts: 1,
    harness: duelHarness }).runtime;
  assert.equal(duel.snapshot().lanes[0].playerId, 'p1');
  duel.tick(7500);
  assert.equal(duel.snapshot().lanes[0].playerId, 'p2',
    'one-lane 1v1 Rush alternates instead of starving player two');
  duel.tick(7500);
  assert.equal(duel.snapshot().lanes[0].playerId, 'p1');

  const harness = adapterHarness();
  const { runtime, rects } = createRuntime({ formatId: 'doubles', paceId: 'rush', count: 4,
    teams: true, width: 600, contacts: 1, seed: 1, harness });
  let pointerId = 780;
  for (let charge = 0; charge < 3; charge += 1) {
    const playerId = runtime.snapshot().lanes[0].playerId;
    assert.equal(playerId === 'p1' || playerId === 'p2', true);
    successfulGesture(runtime, 0, pointerId++, charge * 15000, rects);
    const launch = harness.launches.at(-1);
    runtime.resolveAttempt(launch.laneId, launch.attemptId, { pose: 'miss' });
    if (charge < 2) {
      runtime.tick(7500); // opposing team
      runtime.tick(7500); // next source-team representative
    }
  }
  const offer = runtime.snapshot().battle.powerOffers.a;
  const index = offer.findIndex((card) => card.scope === 'symmetric');
  assert(index >= 0);
  runtime.choosePower({ playerId: 'p1', index });
  const deployment = runtime.deployPower('p1');
  assert.equal(deployment.recipientPlayerIds.length, 2);
  assert.deepEqual(deployment.destinations.slice().sort(), ['a', 'b']);

  const firstPlayer = runtime.snapshot().lanes[0].playerId;
  successfulGesture(runtime, 0, pointerId++, 31000, rects);
  const first = harness.launches.at(-1);
  assert.equal(first.playerId, firstPlayer);
  assert.equal(first.powerEffects.length, 1);
  runtime.resolveAttempt(first.laneId, first.attemptId, { pose: 'miss' });
  runtime.tick(7500);
  const secondPlayer = runtime.snapshot().lanes[0].playerId;
  successfulGesture(runtime, 0, pointerId++, 39000, rects);
  const second = harness.launches.at(-1);
  assert.notEqual(secondPlayer, firstPlayer);
  assert.equal(second.powerEffects.length, 1,
    'the other competitor receives the symmetric Round on its next relay launch');
  runtime.resolveAttempt(second.laneId, second.attemptId, { pose: 'miss' });
  assert.equal(runtime.snapshot().pendingPowers[firstPlayer]?.length || 0, 0);
  assert.equal(runtime.snapshot().pendingPowers[secondPlayer]?.length || 0, 0);
}

function testRushRotationCancelsHeldAimAndRestoresPower() {
  const harness = adapterHarness();
  const { runtime, rects } = createRuntime({ formatId: 'team', paceId: 'rush', count: 16,
    teams: true, width: 1600, contacts: 4, seed: 1, harness });
  for (const [laneIndex, pointerId] of [[0, 800], [1, 801], [0, 802]]) {
    successfulGesture(runtime, laneIndex, pointerId, pointerId, rects);
    const launch = harness.launches.at(-1);
    runtime.resolveAttempt(launch.laneId, launch.attemptId, { pose: 'miss' });
  }
  const offer = runtime.snapshot().battle.powerOffers.a;
  const selfIndex = offer.findIndex((card) => card.scope === 'self');
  assert(selfIndex >= 0);
  runtime.choosePower({ playerId: 'p1', index: selfIndex });
  runtime.deployPower('p1');
  assert.equal(runtime.handlePointerDown(pointer(810, 200, 420, 1000)), true);
  assert.equal(runtime.snapshot().pendingPowers.p1.length, 0);

  runtime.tick(15000);
  const after = runtime.snapshot();
  assert.equal(runtime.handlePointerUp(pointer(810, 200, 200, 15100)), false,
    'a pointer held across a representative boundary is cancelled');
  assert.equal(after.pendingPowers.p1.length, 1, 'rotation cancellation restores locked power');
  assert.equal(after.lanes[0].playerId, 'p3');
  runtime.tick(15000);
  assert.equal(runtime.snapshot().pendingPowers.p1.length, 1,
    'restored power remains attached to its player across later windows');
}

function testPreBoundaryLaunchKeepsOwnerLease() {
  const harness = adapterHarness();
  const { runtime, rects } = createRuntime({ formatId: 'team', paceId: 'rush', count: 16,
    teams: true, width: 1600, contacts: 4, harness });
  runtime.tick(14900);
  successfulGesture(runtime, 0, 850, 14910, rects);
  const launch = harness.launches.at(-1);
  assert.equal(launch.playerId, 'p1');
  runtime.tick(100);
  runtime.resolveAttempt(launch.laneId, launch.attemptId, { pose: 'upright' });
  assert.equal(runtime.snapshot().battle.scores.a, 1,
    'an airborne pre-boundary launch resolves for its original owner');
  assert.equal(runtime.snapshot().lanes[0].playerId, 'p3');
}

function testHornUsesReleaseTimestampWithBoundedGrace() {
  let inputClock = 0;
  const harness = adapterHarness();
  const { runtime } = createRuntime({ paceId: 'rush', harness,
    inputNow: () => inputClock, inputDeliveryGraceMs: 120 });
  inputClock = 59000;
  runtime.tick(59000);
  assert.equal(runtime.handlePointerDown(pointer(900, 250, 420, 59900)), true);
  runtime.handlePointerMove(pointer(900, 250, 320, 59950));
  inputClock = 60010;
  runtime.tick(1000);
  inputClock = 60020;
  runtime.tick(16);
  assert.equal(runtime.snapshot().battle.clockExpired, false,
    'one post-deadline tick retains a short input delivery grace');
  assert.equal(runtime.handlePointerUp(pointer(900, 250, 220, 59999)), true);
  const launch = harness.launches.at(-1);
  assert(launch && launch.playerId === 'p1');
  assert.equal(runtime.snapshot().battle.clockExpired, true);
  runtime.resolveAttempt(launch.laneId, launch.attemptId, { pose: 'upright' });
  assert.equal(runtime.snapshot().battle.heatWins.p1, 1);

  inputClock = 0;
  const expiredHarness = adapterHarness();
  const expired = createRuntime({ paceId: 'rush', harness: expiredHarness,
    inputNow: () => inputClock, inputDeliveryGraceMs: 120 }).runtime;
  inputClock = 59000;
  expired.tick(59000);
  assert.equal(expired.handlePointerDown(pointer(901, 250, 420, 59900)), true);
  inputClock = 60121;
  expired.tick(1000);
  assert.equal(expired.handlePointerUp(pointer(901, 250, 220, 59999)), false,
    'an unresolved aim is cancelled once the bounded delivery grace expires');
  assert.equal(expiredHarness.launches.length, 0);
  assert.equal(expired.snapshot().battle.clockExpired, true);

  inputClock = 0;
  const lateHarness = adapterHarness();
  const late = createRuntime({ paceId: 'rush', harness: lateHarness,
    inputNow: () => inputClock }).runtime;
  inputClock = 59000;
  late.tick(59000);
  late.handlePointerDown(pointer(902, 250, 420, 59900));
  inputClock = 60001;
  late.handlePointerUp(pointer(902, 250, 220, 60001));
  assert.equal(lateHarness.launches.length, 0, 'post-horn release is rejected without waiting for tick');
  assert.equal(late.snapshot().battle.clockExpired, true);
}

function testLegacyAiFlagsAtRuntimeBoundary() {
  const harness = adapterHarness();
  const runtime = Runtime.createBattleRuntime({
    matchId: 'mixed-ai-flags',
    config: { formatId: 'four-way', paceId: 'rush', players: [
      { id: 'p1', cpu: true }, { id: 'p2', ai: true },
      { id: 'p3', isAI: true }, { id: 'p4', type: 'ai' },
    ], hardware: { width: 1600, verifiedContacts: 4 } },
    laneRects: laneRects(4, 1600), laneAdapterFactory: harness.factory,
    inputNow: () => 0,
  });
  runtime.startHeat();
  assert.deepEqual(runtime.snapshot().lanes.map((lane) => lane.cpu), [true, true, true, true]);
  assert.doesNotThrow(() => runtime.prepareCpuLaunch('p2', { launchSignal: { scripted: true } }));

  const humanHarness = adapterHarness();
  const human = Runtime.createBattleRuntime({
    matchId: 'human-not-cpu',
    config: { formatId: 'duel', paceId: 'rush', players: [
      { id: 'human', type: 'human' }, { id: 'cpu', isCpu: true },
    ], hardware: { width: 1200, verifiedContacts: 2 } },
    laneRects: laneRects(2), laneAdapterFactory: humanHarness.factory,
    inputNow: () => 0,
  });
  human.startHeat();
  assert.equal(human.prepareCpuLaunch('human', {}), null,
    'a non-CPU or stale CPU request is a safe no-op at the public boundary');
}

function testDestroyAndDuplicateLifecycleCallsAreSafe() {
  const harness = { launches: [], factory(context) { return {
    resources: context.resources,
    launch(value) { harness.launches.push(value); },
    onContact() { throw new Error('contact hook failed'); },
    reset() {},
  }; } };
  const { runtime, rects } = createRuntime({ paceId: 'rush', harness });
  successfulGesture(runtime, 0, 1100, 0, rects);
  const launch = harness.launches.at(-1);
  assert.equal(runtime.reportContact(launch.laneId, launch.attemptId), true);
  assert.equal(runtime.reportContact(launch.laneId, launch.attemptId), false,
    'duplicate contact callbacks are harmless no-ops');
  assert(runtime.snapshot().errors.some((entry) => entry.phase === 'adapter-onContact'));
  assert.equal(runtime.reportSettling(launch.laneId, launch.attemptId), true);
  assert.equal(runtime.reportSettling(launch.laneId, launch.attemptId), false);
  assert.equal(runtime.reportAirborne(launch.laneId, launch.attemptId), true);
  assert.equal(runtime.reportAirborne('missing-lane', launch.attemptId), false);

  runtime.resolveAttempt(launch.laneId, launch.attemptId, { pose: 'upright' });
  const resolved = runtime.snapshot().battle;
  assert.doesNotThrow(() => runtime.resolveAttempt(launch.laneId, launch.attemptId,
    { pose: 'cap' }));
  assert.doesNotThrow(() => runtime.resolveAttempt('missing-lane', 'stale', { pose: 'cap' }));
  assert.deepEqual(runtime.snapshot().battle, resolved,
    'duplicate and stale resolutions cannot score twice');

  runtime.destroy();
  assert.equal(runtime.prepareCpuLaunch('p1', {}), null);
  assert.equal(runtime.reportContact(launch.laneId, launch.attemptId), false);
  assert.equal(runtime.reportAirborne(launch.laneId, launch.attemptId), false);
  assert.equal(runtime.reportSettling(launch.laneId, launch.attemptId), false);
  assert.doesNotThrow(() => runtime.resolveAttempt(launch.laneId, launch.attemptId,
    { pose: 'cap' }));
  assert.deepEqual(runtime.snapshot().battle, resolved,
    'all late public callbacks remain read-only after destroy');
}

function testAbsoluteHornRejectsEntryWithoutVisualTick() {
  let inputClock = 0;
  const humanHarness = adapterHarness();
  const { runtime } = createRuntime({ paceId: 'rush', harness: humanHarness,
    inputNow: () => inputClock });
  inputClock = 60001;
  assert.equal(runtime.handlePointerDown(pointer(1200, 250, 420, 60001)), false);
  assert.equal(humanHarness.launches.length, 0);
  assert.equal(runtime.snapshot().hornExpired, true);
  assert.equal(runtime.snapshot().battle.clockExpired, true,
    'pointer entry reconciles the absolute horn before the next visual tick');

  inputClock = 0;
  const cpuHarness = adapterHarness();
  const cpu = createRuntime({ paceId: 'rush', cpu: true, harness: cpuHarness,
    inputNow: () => inputClock }).runtime;
  inputClock = 60001;
  assert.equal(cpu.prepareCpuLaunch('p1', { timeStamp: 60001 }), null);
  assert.equal(cpuHarness.launches.length, 0);
  assert.equal(cpu.snapshot().battle.clockExpired, true,
    'CPU entry uses the same absolute deadline as manual entry');

  inputClock = 0;
  const monotonic = createRuntime({ paceId: 'rush', inputNow: () => inputClock }).runtime;
  inputClock = 1000;
  monotonic.tick(0);
  inputClock = 900;
  monotonic.tick(0);
  assert.equal(monotonic.snapshot().battle.elapsedMs, 1000,
    'a backwards input clock sample cannot rewind or add game time');
  inputClock = 2000;
  monotonic.tick(0);
  assert.equal(monotonic.snapshot().battle.elapsedMs, 2000,
    'the monotonic clock resumes from the last accepted absolute sample');
}

function testOneLaneRushOpportunityClockAndBatchedHandoff() {
  let inputClock = 0;
  const harness = adapterHarness();
  const { runtime } = createRuntime({ paceId: 'rush', width: 600, contacts: 1,
    cpu: true, harness, inputNow: () => inputClock });
  const attemptId = runtime.prepareCpuLaunch('p1', { timeStamp: 0 });
  assert(attemptId);
  inputClock = 5000;
  runtime.tick(0);
  assert.equal(runtime.snapshot().battle.elapsedMs, 0,
    'airborne relay wall time does not consume controllable game time');
  assert.equal(runtime.snapshot().heatDeadlineAt, 65000);
  runtime.resolveAttempt('lane-1', attemptId, { pose: 'miss' });

  inputClock = 35000;
  runtime.tick(0);
  let snapshot = runtime.snapshot();
  assert.equal(snapshot.battle.elapsedMs, 7500,
    'a batched timer delivery stops at the first one-lane handoff');
  assert.equal(snapshot.lanes[0].playerId, 'p2');
  const extendedDeadline = snapshot.heatDeadlineAt;
  inputClock += 7499;
  runtime.tick(0);
  snapshot = runtime.snapshot();
  assert.equal(snapshot.lanes[0].playerId, 'p2');
  assert.equal(snapshot.battle.elapsedMs, 14999,
    'the incoming relay player receives a real full opportunity window');
  inputClock += 1;
  runtime.tick(0);
  assert.equal(runtime.snapshot().lanes[0].playerId, 'p1');
  assert.equal(runtime.snapshot().heatDeadlineAt, extendedDeadline,
    'normal controllable time does not further stretch the heat');

  for (let boundary = 2; boundary < 8; boundary += 1) {
    inputClock += 7500;
    runtime.tick(0);
  }
  snapshot = runtime.snapshot();
  assert.equal(snapshot.battle.elapsedMs, 60000);
  assert.equal(snapshot.hornExpired, true);
  assert(snapshot.wallElapsedMs > 60000,
    '60 seconds means controllable game-clock time, so paused wall time may extend');

  const held = createRuntime({ paceId: 'rush', width: 600, contacts: 1 }).runtime;
  assert.equal(held.handlePointerDown(pointer(1250, 300, 420, 0)), true);
  held.tick(30000);
  assert.equal(held.snapshot().battle.elapsedMs, 7500);
  assert.equal(held.snapshot().lanes[0].playerId, 'p2');
  assert.equal(held.handlePointerUp(pointer(1250, 300, 220, 30000)), false,
    'the first batched handoff cancels an outgoing held aim before assignment');
}

function playOneLaneVolleyAttempt(runtime, harness, rects, pointerId, time) {
  successfulGesture(runtime, 0, pointerId, time, rects);
  const launch = harness.launches.at(-1);
  runtime.resolveAttempt(launch.laneId, launch.attemptId, { pose: 'miss' });
  return launch.playerId;
}

function testOneLaneVolleyDefersOfferAndDeployment() {
  const offers = [];
  const harness = adapterHarness();
  const { runtime, rects } = createRuntime({ paceId: 'volley', width: 600, contacts: 1,
    seed: 31, harness, onPowerOffer(value) { offers.push(value); } });
  let pointerId = 1300;
  const openers = [];
  for (let volley = 0; volley < 2; volley += 1) {
    openers.push(runtime.snapshot().lanes[0].playerId);
    playOneLaneVolleyAttempt(runtime, harness, rects, pointerId++, volley * 300, rects);
    playOneLaneVolleyAttempt(runtime, harness, rects, pointerId++, volley * 300 + 100, rects);
  }
  openers.push(runtime.snapshot().lanes[0].playerId);
  assert.deepEqual(openers, ['p1', 'p2', 'p1']);

  playOneLaneVolleyAttempt(runtime, harness, rects, pointerId++, 700, rects);
  assert.equal(runtime.snapshot().battle.powerOffers.p1, null);
  assert.equal(offers.length, 0,
    'the opener cannot see or deploy an earned offer before its opponent resolves');
  playOneLaneVolleyAttempt(runtime, harness, rects, pointerId++, 800, rects);
  assert.equal(offers.length, 2,
    'both competitors cross the charge threshold and publish together after the pair');

  const offer = runtime.snapshot().battle.powerOffers.p1;
  const selection = { playerId: 'p1', index: 0 };
  if (offer[0].scope === 'target') selection.targetId = 'p2';
  runtime.choosePower(selection);
  playOneLaneVolleyAttempt(runtime, harness, rects, pointerId++, 900, rects);
  const storedBefore = runtime.snapshot().battle.storedPowers.p1;
  assert.throws(() => runtime.deployPower('p1'), /paired Volley/);
  assert.deepEqual(runtime.snapshot().battle.storedPowers.p1, storedBefore,
    'a mid-pair deployment barrier preserves the stored card');
  playOneLaneVolleyAttempt(runtime, harness, rects, pointerId++, 1000, rects);
  assert.doesNotThrow(() => runtime.deployPower('p1'));
}

function testModifierConflictRejectsAtomically() {
  const harness = adapterHarness();
  const { runtime, rects } = createRuntime({ paceId: 'rush', powerProfileId: 'mayhem',
    seed: 1, harness });
  let pointerId = 1400;
  for (let index = 0; index < 3; index += 1) {
    successfulGesture(runtime, 0, pointerId++, index * 100, rects);
    const launch = harness.launches.at(-1);
    runtime.resolveAttempt(launch.laneId, launch.attemptId, { pose: 'miss' });
  }
  const firstOffer = runtime.snapshot().battle.powerOffers.p1;
  const firstTarget = firstOffer.findIndex((card) => card.scope === 'target');
  assert(firstTarget >= 0);
  runtime.choosePower({ playerId: 'p1', index: firstTarget, targetId: 'p2' });
  runtime.deployPower('p1');
  assert.equal(runtime.snapshot().pendingPowers.p2.length, 1);

  for (let index = 0; index < 3; index += 1) {
    successfulGesture(runtime, 0, pointerId++, 500 + index * 100, rects);
    const launch = harness.launches.at(-1);
    runtime.resolveAttempt(launch.laneId, launch.attemptId, { pose: 'miss' });
  }
  const secondOffer = runtime.snapshot().battle.powerOffers.p1;
  const secondTarget = secondOffer.findIndex((card) => card.scope === 'target');
  assert(secondTarget >= 0);
  runtime.choosePower({ playerId: 'p1', index: secondTarget, targetId: 'p2' });
  const storedBefore = runtime.snapshot().battle.storedPowers.p1;
  const pendingBefore = runtime.snapshot().pendingPowers;
  assert.throws(() => runtime.deployPower('p1'), /pending Battle modifier/);
  assert.deepEqual(runtime.snapshot().battle.storedPowers.p1, storedBefore);
  assert.deepEqual(runtime.snapshot().pendingPowers, pendingBefore,
    'conflicting deployment is atomic and cannot partially mutate recipients');
}

function testEveryRushBoundaryInvalidatesHeldAim() {
  function heldAcross(options, jump, label) {
    const { runtime, rects } = createRuntime(options);
    const rect = rects[0];
    const x = rect.left + rect.width / 2;
    assert.equal(runtime.handlePointerDown(pointer(1500, x, 420, 0)), true, label);
    runtime.tick(jump);
    assert.equal(runtime.handlePointerUp(pointer(1500, x, 220, jump)), false,
      `${label}: pointerup cannot launch after an assignment boundary`);
    assert.notEqual(runtime.snapshot().lanes[0].state, 'aiming', label);
  }

  heldAcross({ paceId: 'rush', width: 600, contacts: 1 }, 15000,
    'one-lane multi-boundary relay');
  heldAcross({ formatId: 'doubles', paceId: 'rush', count: 4, teams: true,
    width: 900, contacts: 2 }, 30000,
  'two-lane full-cycle tick');
  heldAcross({ formatId: 'four-way', paceId: 'rush', count: 4,
    width: 1600, contacts: 4 }, 15000,
  'four-lane exact boundary with same final lineup');

  for (let teamSize = 3; teamSize <= 8; teamSize += 1) {
    for (const profile of [{ width: 900, contacts: 2 }, { width: 1600, contacts: 4 }]) {
      heldAcross({ formatId: 'team', paceId: 'rush', count: teamSize * 2, teams: true,
        width: profile.width, contacts: profile.contacts }, 45000,
      `${teamSize}v${teamSize} ${profile.contacts}-touch delayed tick`);
    }
  }

  const harness = adapterHarness();
  const powered = createRuntime({ formatId: 'doubles', paceId: 'rush', count: 4,
    teams: true, width: 900, contacts: 2, seed: 1, harness });
  let pointerId = 1600;
  for (let charge = 0; charge < 3; charge += 1) {
    successfulGesture(powered.runtime, 0, pointerId++, charge * 100, powered.rects);
    const launch = harness.launches.at(-1);
    powered.runtime.resolveAttempt(launch.laneId, launch.attemptId, { pose: 'miss' });
  }
  const offer = powered.runtime.snapshot().battle.powerOffers.a;
  const selfIndex = offer.findIndex((card) => card.scope === 'self');
  assert(selfIndex >= 0);
  powered.runtime.choosePower({ playerId: 'p1', index: selfIndex });
  powered.runtime.deployPower('p1');
  assert.equal(powered.runtime.snapshot().pendingPowers.p1.length, 1);
  assert.equal(powered.runtime.handlePointerDown(pointer(pointerId, 225, 420, 1000)), true);
  assert.equal(powered.runtime.snapshot().pendingPowers.p1.length, 0);
  powered.runtime.tick(30000);
  assert.equal(powered.runtime.handlePointerUp(pointer(pointerId, 225, 220, 31000)), false);
  assert.equal(powered.runtime.snapshot().pendingPowers.p1.length, 1,
    'a full-cycle delayed tick restores the cancelled aim power exactly once');
  powered.runtime.tick(1000);
  assert.equal(powered.runtime.snapshot().pendingPowers.p1.length, 1);
}

async function testHostileThenableRecovery() {
  const cases = [
    { name: 'throwing then getter', value() {
      return Object.defineProperty({}, 'then', { get() { throw new Error('then getter failed'); } });
    } },
    { name: 'throwing then method', value() {
      return { then() { throw new Error('then method failed'); } };
    } },
  ];
  for (const hostile of cases) {
    const harness = { launches: [], factory(context) { return {
      resources: context.resources,
      launch(value) { harness.launches.push(value); return hostile.value(); },
      reset() {},
    }; } };
    const { runtime, rects } = createRuntime({ paceId: 'rush', harness });
    successfulGesture(runtime, 0, 1700, 0, rects);
    await new Promise((resolve) => setImmediate(resolve));
    const snapshot = runtime.snapshot();
    assert.equal(snapshot.lanes[0].state, 'ready',
      `${hostile.name} cannot strand an airborne lane`);
    assert.equal(snapshot.battle.resolvedAttemptIds.length, 1);
    assert(snapshot.errors.some((entry) => entry.phase === 'adapter-launch-promise'),
      `${hostile.name} is surfaced through the recovered error ledger`);
  }
}

async function testFailureRecoveryAndStaleAsyncIsolation() {
  const callbackErrors = [];
  const syncHarness = { launches: [], factory(context) {
    return { resources: context.resources,
      launch(value) {
        syncHarness.launches.push(value);
        if (context.laneId === 'lane-1') throw new Error('sync launch failed');
      },
      onResolve() {}, reset() {} };
  } };
  const sync = createRuntime({ harness: syncHarness, onError(error) {
    callbackErrors.push(error.message);
    throw new Error('error observer failed');
  } }).runtime;
  successfulGesture(sync, 0, 950, 0);
  successfulGesture(sync, 1, 951, 10);
  const surviving = syncHarness.launches.find((launch) => launch.laneId === 'lane-2');
  assert.equal(sync.snapshot().lanes[0].state, 'resolved');
  sync.resolveAttempt(surviving.laneId, surviving.attemptId, { pose: 'miss' });
  assert(sync.snapshot().lanes.every((lane) => lane.state === 'ready'));
  assert.equal(sync.snapshot().battle.resolvedAttemptIds.length, 2);
  assert(sync.snapshot().errors.some((entry) => entry.phase === 'adapter-launch'));
  assert(sync.snapshot().errors.some((entry) => entry.phase === 'onError-callback'));
  assert(callbackErrors.includes('sync launch failed'), 'recovered failures remain externally visible');

  const rejectHarness = { factory(context) { return { resources: context.resources,
    launch() { return Promise.reject(new Error('async launch failed')); }, reset() {} }; } };
  const rejected = createRuntime({ paceId: 'rush', harness: rejectHarness }).runtime;
  successfulGesture(rejected, 0, 960, 0);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(rejected.snapshot().lanes[0].state, 'ready');
  assert(rejected.snapshot().errors.some((entry) => entry.phase === 'adapter-launch-promise'));

  const hookHarness = { factory(context) { return { resources: context.resources,
    launch() {}, onResolve() { throw new Error('resolve hook failed'); }, reset() {} }; } };
  const hook = createRuntime({ paceId: 'rush', harness: hookHarness }).runtime;
  successfulGesture(hook, 0, 970, 0);
  const hookAttempt = hook.snapshot().lanes[0].attemptId;
  hook.resolveAttempt('lane-1', hookAttempt, { pose: 'upright' });
  assert.equal(hook.snapshot().lanes[0].state, 'ready');
  assert.equal(hook.snapshot().battle.scores.p1, 1);
  assert(hook.snapshot().errors.some((entry) => entry.phase === 'adapter-onResolve'));

  const offerHarness = adapterHarness();
  const offered = createRuntime({ paceId: 'rush', harness: offerHarness,
    onPowerOffer() { throw new Error('offer hook failed'); } }).runtime;
  for (let index = 0; index < 3; index += 1) {
    successfulGesture(offered, 0, 980 + index, index * 100);
    const attempt = offerHarness.launches.at(-1);
    offered.resolveAttempt(attempt.laneId, attempt.attemptId, { pose: 'miss' });
  }
  assert.equal(offered.snapshot().lanes[0].state, 'ready');
  assert(offered.snapshot().battle.powerOffers.p1);
  assert(offered.snapshot().errors.some((entry) => entry.phase === 'onPowerOffer'));

  let finishDestroyed;
  const destroyHarness = { factory(context) { return { resources: context.resources,
    launch() { return new Promise((resolve) => { finishDestroyed = resolve; }); }, reset() {} }; } };
  const destroyed = createRuntime({ paceId: 'rush', harness: destroyHarness }).runtime;
  successfulGesture(destroyed, 0, 990, 0);
  const beforeDestroy = destroyed.snapshot().battle;
  destroyed.destroy();
  finishDestroyed({ pose: 'cap' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(destroyed.snapshot().battle, beforeDestroy,
    'an adapter completion after destroy cannot mutate Battle state');

  let finishStale;
  const staleHarness = { factory(context) { return { resources: context.resources,
    launch() { return new Promise((resolve) => { finishStale = resolve; }); }, reset() {} }; } };
  const stale = createRuntime({ paceId: 'rush', harness: staleHarness }).runtime;
  successfulGesture(stale, 0, 995, 0);
  const staleAttempt = stale.snapshot().lanes[0].attemptId;
  stale.resolveAttempt('lane-1', staleAttempt, { pose: 'miss' });
  const afterManualResolve = stale.snapshot().battle;
  finishStale({ pose: 'cap' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(stale.snapshot().battle, afterManualResolve,
    'a stale adapter completion cannot score an attempt twice');
}

async function run() {
  testMultiPointerSamplingCaptureAndFrozenGeometry();
  testCanonicalQualifierAcrossDevicesAndPointerTypes();
  testCanonicalRadialDeadzoneAndLongDistanceFallback();
  testChronologicalPeakAndQuantizedTimestamps();
  testSynchronizedTwoPointerVolleyAndResultOrdering();
  testFourPointerIsolationAndLifecycle();
  testAdapterCannotSubstituteSharedResources();
  testResizeDuringGestureAndRushIndependentRearm();
  testPowerTargetLocksAtPointerDownAndStaysFallible();
  testHornHonorsAirborneLeaseAndRejectsLateInput();
  testRushTieOpensPostHornSynchronizedGate();
  testTwoFourTouchProfilesAndRelayFairness();
  testRushOffersIgnoreSettleOrderAtRuntime();
  testRuntimeFourWaySuddenDeathPairsOnlyLeaders();
  testSymmetricRoundReachesEveryRepresentative();
  testSymmetricRoundSurvivesRelayAndCancellation();
  testOneLaneRushDuelAndSymmetricRelay();
  testRushRotationCancelsHeldAimAndRestoresPower();
  testPreBoundaryLaunchKeepsOwnerLease();
  testHornUsesReleaseTimestampWithBoundedGrace();
  testLegacyAiFlagsAtRuntimeBoundary();
  testDestroyAndDuplicateLifecycleCallsAreSafe();
  testAbsoluteHornRejectsEntryWithoutVisualTick();
  testOneLaneRushOpportunityClockAndBatchedHandoff();
  testOneLaneVolleyDefersOfferAndDeployment();
  testModifierConflictRejectsAtomically();
  testEveryRushBoundaryInvalidatesHeldAim();
  await testHostileThenableRecovery();
  await testFailureRecoveryAndStaleAsyncIsolation();
  console.log('v1.12 Battle simultaneous-lane runtime tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
