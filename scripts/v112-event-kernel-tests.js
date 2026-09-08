'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Kernel = require('../js/v112-event-kernel.js');
const Runtime = require('../js/v112-event-runtime.js');
const RulesAdapter = require('../js/v112-event-rules-adapter.js');
const EventRenderer = require('../js/v112-event-renderer.js');
const ExistingEvents = require('../js/v112-events.js');
const Harness = require('./lib/v112-event-harness.js');

function baseBehavior(eventId, eventClass, context, overrides = {}) {
  let sequence = 0;
  const methods = {
    telegraph() {
      return { title: eventId, instruction: 'Physical test event.', glyph: 'test', durationMs: 0,
        cues: [] };
    },
    qualifyLaunch() { return { qualified: true, reason: null }; },
    launch() { return { sample: context.rng.nextUint32('launch') }; },
    step() { sequence += 1; return { stepped: true }; },
    contact() { return { contacted: true }; },
    evaluate() { return JSON.parse(JSON.stringify(Harness.DEFAULT_FACTS[eventId])); },
    frame(reducedMotion) {
      return Harness.makeFrame(eventId, eventClass, context.scope.laneId,
        { sequence, reducedMotion, cues: reducedMotion ? [{ cueId: 'static' }] : [{ cueId: 'full' }] });
    },
    cleanup() { return { cleaned: true }; },
  };
  return Object.freeze(Object.assign(methods, overrides));
}

function makeRuntime(pack, laneId = 'lane-a', selectionOverrides = {}, reflow) {
  const runtime = Runtime.createEventRuntime({ laneId, packs: [pack], reflow });
  const selection = Harness.makeSelection(pack.ids[0], pack.eventClass,
    selectionOverrides.eventSeed == null ? 123 : selectionOverrides.eventSeed,
    selectionOverrides);
  runtime.bind(selection, Harness.makeContext());
  return runtime;
}

function launchToActive(runtime) {
  runtime.telegraph();
  assert.equal(runtime.qualifyLaunch({ dx: 0.1, dy: -0.5 }).qualified, true);
  runtime.launch({ velocity: { x: 3, y: -9 }, spin: 4 });
  runtime.step({ dtMs: 16, elapsedMs: 16 });
}

function resolve(adapter, resolutionId, eventId, facts, overrides = {}) {
  return adapter.resolve(Object.assign({ resolutionId, eventId, formatId: 'classic',
    result: 'MAKE', pose: 'upright', facts }, overrides));
}

function testPublicContractsAndInvalidPacks() {
  assert.equal(Kernel.schema, 'FlipgameEventKernelV1');
  assert.equal(Runtime.schema, 'FlipgameEventRuntimeV1');
  assert.equal(RulesAdapter.schema, 'FlipgameEventRulesAdapterV1');
  assert.equal(EventRenderer.schema, 'FlipgameEventRendererV1');
  assert.equal(Harness.schema, 'FlipgameEventHarnessV1');
  assert.deepEqual(Kernel.EVENT_CLASSES, ['hazard', 'wildcard', 'assist']);
  assert.deepEqual(Kernel.RESOURCE_KINDS,
    ['body', 'sensor', 'constraint', 'audio', 'camera', 'override', 'callback']);
  assert.equal(Object.keys(Kernel.FACT_SPECS).length, 30);

  const pack = Kernel.definePack({ eventClass: 'assist', ids: ['rainbow-corkscrew'],
    create(id, context) { return baseBehavior(id, 'assist', context); } });
  assert.equal(pack.schema, 'EventPackV1');
  assert.equal(Object.isFrozen(pack), true);
  assert.equal(Object.isFrozen(pack.ids), true);
  assert.throws(() => Kernel.definePack({ eventClass: 'cosmetic', ids: ['x'], create() {} }),
    /Unsupported eventClass/);
  assert.throws(() => Kernel.definePack({ eventClass: 'assist', ids: ['x', 'x'], create() {} }),
    /unique/);
  assert.throws(() => Kernel.definePack({ eventClass: 'assist', ids: ['Bad ID'], create() {} }),
    /Invalid eventId/);
  assert.throws(() => Kernel.definePack({ eventClass: 'assist', ids: ['x'] }), /create/);
  assert.throws(() => Kernel.definePack({ eventClass: 'assist', ids: ['x'], create() {}, reward: 1 }),
    /unsupported field/);
  assert.throws(() => Runtime.createEventRuntime({ laneId: 'a', packs: [] }), /At least one/);
  assert.throws(() => Runtime.createEventRuntime({ laneId: 'a', packs: [pack, pack] }),
    /Duplicate event pack owner/);
  assert.throws(() => Runtime.createEventRuntime({ laneId: 'a', packs: [{
    schema: 'EventPackV1', eventClass: 'assist', ids: ['rainbow-corkscrew'], create() {},
  }] }), /immutable/);

  const badSelectionRuntime = Runtime.createEventRuntime({ laneId: 'selection', packs: [pack] });
  assert.throws(() => badSelectionRuntime.bind(Object.assign({},
    Harness.makeSelection('rainbow-corkscrew', 'assist', 1),
    { effects: { additiveLives: 100 } }), Harness.makeContext()), /unsupported field/);
  const missingContextRuntime = Runtime.createEventRuntime({ laneId: 'context', packs: [pack] });
  assert.throws(() => missingContextRuntime.bind(
    Harness.makeSelection('rainbow-corkscrew', 'assist', 1),
    { layout: {}, appearance: {} }), /requires physicsProfile/);

  const missing = Kernel.definePack({ eventClass: 'assist', ids: ['rainbow-corkscrew'],
    create() { return Object.freeze({}); } });
  const invalidRuntime = Runtime.createEventRuntime({ laneId: 'a', packs: [missing] });
  assert.throws(() => invalidRuntime.bind(Harness.makeSelection('rainbow-corkscrew', 'assist', 1),
    Harness.makeContext()), /EventBehaviorV1.telegraph/);
  assert.equal(invalidRuntime.snapshot().phase, 'cleaned');

  const mutableBehavior = Kernel.definePack({ eventClass: 'assist', ids: ['rainbow-corkscrew'],
    create(id, context) {
      const behavior = baseBehavior(id, 'assist', context);
      return Object.assign({}, behavior);
    } });
  const mutableRuntime = Runtime.createEventRuntime({ laneId: 'mutable', packs: [mutableBehavior] });
  assert.throws(() => mutableRuntime.bind(Harness.makeSelection('rainbow-corkscrew', 'assist', 1),
    Harness.makeContext()), /must be immutable/);
}

function testEventSeedOnlyDeterminismAndImmutability() {
  let captured;
  const pack = Kernel.definePack({ eventClass: 'assist', ids: ['rainbow-corkscrew'],
    create(id, context) {
      captured = context;
      return baseBehavior(id, 'assist', context);
    } });
  const left = makeRuntime(pack, 'lane-left', { eventSeed: 987, turnSeed: 1 });
  const leftSelection = left.snapshot().selection;
  assert.equal(Object.isFrozen(captured), true);
  assert.equal(Object.isFrozen(captured.selection), true);
  assert.equal(Object.isFrozen(captured.layout), true);
  assert.equal(Object.isFrozen(captured.rng), true);
  assert.throws(() => { captured.selection.eventSeed = 5; }, TypeError);
  assert.throws(() => { captured.layout.width = 1; }, TypeError);

  const right = makeRuntime(pack, 'lane-right', { eventSeed: 987, turnSeed: 0xffffffff });
  const otherSeed = makeRuntime(pack, 'lane-other', { eventSeed: 988, turnSeed: 1 });
  const priorRandom = Math.random;
  Math.random = () => { throw new Error('ambient RNG must not be used'); };
  let a;
  let b;
  let c;
  try {
    left.telegraph(); right.telegraph(); otherSeed.telegraph();
    left.qualifyLaunch({}); right.qualifyLaunch({}); otherSeed.qualifyLaunch({});
    a = left.launch({}).data.sample;
    b = right.launch({}).data.sample;
    c = otherSeed.launch({}).data.sample;
  } finally { Math.random = priorRandom; }
  assert.equal(a, b, 'turn seed, lane and other context cannot perturb event RNG');
  assert.notEqual(a, c);
  assert.equal(leftSelection.eventSeed, 987);

  const rngA = Kernel.createEventRng(42);
  const rngB = Kernel.createEventRng(42);
  assert.equal(rngA.sampleUint32(99, 'peg'), rngB.sampleUint32(99, 'peg'));
  assert.deepEqual([rngA.nextUint32('a'), rngA.nextFloat('b'), rngA.nextInt(9, 'c')],
    [rngB.nextUint32('a'), rngB.nextFloat('b'), rngB.nextInt(9, 'c')]);
  assert.equal(rngA.snapshot().counter, 3);
  assert.throws(() => Kernel.createEventRng(-1), /minimum/);
  assert.throws(() => Kernel.createEventRng(Number.NaN), /safe integer/);
}

function testLifecycleAndFrozenBoundaryValues() {
  const harness = Harness.createHarness({ eventId: 'rainbow-corkscrew' });
  const runtime = harness.runtime;
  assert.equal(runtime.snapshot().phase, 'bound');
  assert.throws(() => runtime.launch({}), /qualified/);
  const telegraph = runtime.telegraph();
  assert.equal(Object.isFrozen(telegraph), true);
  const qualification = runtime.qualifyLaunch({ dx: 1, dy: -4 });
  assert.equal(qualification.qualified, true);
  const launch = runtime.launch({ velocity: { x: 1, y: -8 }, spin: 4 });
  assert.equal(Object.isFrozen(launch.data), true);
  runtime.step({ dtMs: 16 });
  runtime.contact(Harness.makeContact());
  const frame = runtime.frame(false);
  assert.equal(Object.isFrozen(frame), true);
  assert.equal(Object.isFrozen(frame.entities[0].transform), true);
  const facts = runtime.evaluate(Harness.makeProbe());
  assert.equal(facts.schema, 'EventOutcomeFactsV1');
  assert.equal(Object.isFrozen(facts.values), true);
  assert.deepEqual(harness.trace.slice(0, 7),
    ['create:lane-a', 'telegraph', 'qualifyLaunch', 'launch', 'step', 'contact', 'frame:false']);
  const cleanup = runtime.cleanup('resolved');
  assert.equal(cleanup.clean, true);
  assert.equal(runtime.cleanup('again'), cleanup, 'cleanup is idempotent');
  assert.equal(runtime.snapshot().phase, 'cleaned');
  assert.throws(() => runtime.frame(false), /requires/);

  const retry = Harness.createHarness({ qualified: false }).runtime;
  retry.telegraph();
  assert.equal(retry.qualifyLaunch({}).qualified, false);
  assert.equal(retry.snapshot().phase, 'telegraphed');
  assert.equal(retry.qualifyLaunch({}).qualified, false, 'unqualified input does not consume the event');
  retry.cleanup('cancelled');

  const selected = ExistingEvents.select({ activityId: 'practice', physicsModeId: 'normal',
    forceName: 'Wind Tunnel', seed: 4 });
  const integrationPack = Kernel.definePack({ eventClass: 'hazard', ids: ['wind-tunnel'],
    create(id, context) { return baseBehavior(id, 'hazard', context); } });
  const integrationRuntime = Runtime.createEventRuntime({ laneId: 'actual-selection',
    packs: [integrationPack] });
  integrationRuntime.bind(selected, Harness.makeContext());
  assert.equal(integrationRuntime.snapshot().eventId, 'wind-tunnel',
    'the current prelaunch EventSelectionV2 binds without translation');
  integrationRuntime.cleanup('compatibility-check');
}

function testResourceScopeAndExceptionSafeCleanup() {
  const order = [];
  const scope = Kernel.createResourceScope('lane-a');
  const body = { laneId: 'lane-a' };
  scope.ownBody('main', body, () => order.push('body'));
  scope.ownSensor('ring', { laneId: 'lane-a' }, () => { order.push('sensor'); throw new Error('sensor'); });
  scope.ownCallback('tick', { laneId: 'lane-a' }, () => order.push('callback'));
  assert.throws(() => scope.ownBody('main', {}, () => {}), /Duplicate/);
  assert.throws(() => scope.ownCamera('wrong', { laneId: 'lane-b' }, () => {}), /Cross-lane/);
  assert.throws(() => scope.ownAudio('again', body, () => {}), /owned twice/);
  const report = scope.cleanup('unit-test');
  assert.deepEqual(order, ['callback', 'sensor', 'body'], 'all resources dispose in reverse ownership order');
  assert.equal(report.released.length, 3);
  assert.equal(report.errors.length, 1);
  assert.equal(scope.snapshot().active, 0);
  assert.equal(scope.cleanup('second'), report);
  assert.throws(() => scope.ownBody('late', {}, () => {}), /already cleaned/);

  let reentrantScope;
  let reentrantDisposals = 0;
  reentrantScope = Kernel.createResourceScope('reentrant-scope');
  reentrantScope.ownBody('main', { laneId: 'reentrant-scope' }, () => {
    reentrantDisposals += 1;
    assert.equal(reentrantScope.cleanup('nested').inProgress, true);
  });
  const reentrantScopeReport = reentrantScope.cleanup('outer');
  assert.equal(reentrantScopeReport.clean, true);
  assert.equal(reentrantDisposals, 1);

  const allKinds = [...Kernel.RESOURCE_KINDS];
  const harness = Harness.createHarness({ resourceKinds: allKinds,
    throwAt: 'step', throwDisposerAt: 'sensor' });
  harness.runtime.telegraph();
  harness.runtime.qualifyLaunch({});
  harness.runtime.launch({});
  assert.throws(() => harness.runtime.step({}), error => {
    assert.match(error.message, /harness-step/);
    assert.equal(error.eventCleanupReport.errors.length, 1);
    return true;
  });
  assert.equal(harness.disposals.length, allKinds.length,
    'one failing disposer cannot suppress any other disposer');
  assert.equal(harness.runtime.snapshot().resources.active, 0);
  Harness.assertNoLeaks(harness.runtime);

  let createDisposals = 0;
  const createFailure = Kernel.definePack({ eventClass: 'assist', ids: ['rainbow-corkscrew'],
    create(id, context) {
      context.scope.ownBody('created', { laneId: context.scope.laneId }, () => { createDisposals += 1; });
      throw new Error('create-failure');
    } });
  const createRuntime = Runtime.createEventRuntime({ laneId: 'create-lane', packs: [createFailure] });
  assert.throws(() => createRuntime.bind(Harness.makeSelection('rainbow-corkscrew', 'assist', 1),
    Harness.makeContext()), /create-failure/);
  assert.equal(createDisposals, 1);
  assert.equal(createRuntime.snapshot().resources.active, 0);

  let cleanupDisposals = 0;
  const cleanupFailure = Kernel.definePack({ eventClass: 'assist', ids: ['rainbow-corkscrew'],
    create(id, context) {
      context.scope.ownBody('main', { laneId: context.scope.laneId }, () => { cleanupDisposals += 1; });
      return baseBehavior(id, 'assist', context, { cleanup() { throw new Error('cleanup-failure'); } });
    } });
  const cleanupRuntime = makeRuntime(cleanupFailure);
  const failedCleanup = cleanupRuntime.cleanup('manual');
  assert.equal(failedCleanup.clean, false);
  assert.equal(failedCleanup.errors[0].phase, 'behavior.cleanup');
  assert.equal(cleanupDisposals, 1);
  assert.equal(cleanupRuntime.cleanup('again'), failedCleanup);

  let dualDisposals = 0;
  const dualFailure = Kernel.definePack({ eventClass: 'assist', ids: ['rainbow-corkscrew'],
    create(id, context) {
      context.scope.ownCallback('loop', { laneId: context.scope.laneId }, () => { dualDisposals += 1; });
      return baseBehavior(id, 'assist', context, {
        step() { throw new Error('original-step-failure'); },
        cleanup() { throw new Error('secondary-cleanup-failure'); },
      });
    } });
  const dualRuntime = makeRuntime(dualFailure);
  dualRuntime.telegraph(); dualRuntime.qualifyLaunch({}); dualRuntime.launch({});
  assert.throws(() => dualRuntime.step({}), error => {
    assert.match(error.message, /original-step-failure/,
      'cleanup failures cannot replace the triggering handler failure');
    assert.equal(error.eventCleanupReport.errors[0].phase, 'behavior.cleanup');
    return true;
  });
  assert.equal(dualDisposals, 1);

  let reentrantRuntime;
  let behaviorCleanups = 0;
  const reentrantPack = Kernel.definePack({ eventClass: 'assist', ids: ['rainbow-corkscrew'],
    create(id, context) {
      return baseBehavior(id, 'assist', context, { cleanup() {
        behaviorCleanups += 1;
        assert.equal(reentrantRuntime.cleanup('nested').inProgress, true);
        return { cleaned: true };
      } });
    } });
  reentrantRuntime = makeRuntime(reentrantPack);
  const reentrantReport = reentrantRuntime.cleanup('outer');
  assert.equal(reentrantReport.clean, true);
  assert.equal(behaviorCleanups, 1);
}

function testLaneIsolation() {
  const left = Harness.createHarness({ laneId: 'left', resourceKinds: ['body'], eventSeed: 55 });
  const right = Harness.createHarness({ laneId: 'right', resourceKinds: ['body'], eventSeed: 55 });
  assert.equal(left.runtime.snapshot().resources.active, 1);
  assert.equal(right.runtime.snapshot().resources.active, 1);
  launchToActive(left.runtime);
  launchToActive(right.runtime);
  assert.equal(left.runtime.frame(false).laneId, 'left');
  assert.equal(right.runtime.frame(false).laneId, 'right');
  left.runtime.cleanup('left-complete');
  assert.equal(left.runtime.snapshot().resources.active, 0);
  assert.equal(right.runtime.snapshot().resources.active, 1,
    'cleaning one lane cannot touch another lane');
  assert.equal(left.disposals[0].metadata.laneId, 'left');
  right.runtime.cleanup('right-complete');
  assert.equal(right.disposals[0].metadata.laneId, 'right');
}

function testResizeOwnershipAndExactlyOnceReflow() {
  const harness = Harness.createHarness({ resourceKinds: ['body'] });
  const runtime = harness.runtime;
  runtime.telegraph();
  const prelaunch = runtime.resize({ width: 1366, height: 768, groundY: 660 });
  assert.equal(prelaunch.rebound, true);
  assert.equal(harness.reflows.length, 1);
  assert.equal(harness.disposals.length, 1, 'prelaunch rebind retires every old resource');
  assert.equal(runtime.snapshot().phase, 'telegraphed', 'telegraph state survives safe rebind');
  assert.equal(runtime.snapshot().resources.active, 1);

  runtime.qualifyLaunch({});
  runtime.launch({});
  runtime.step({});
  assert.equal(runtime.resize({ width: 1400, height: 800 }).deferred, true);
  assert.equal(runtime.resize({ width: 1600, height: 900 }).deferred, true);
  assert.equal(runtime.resize({ width: 1920, height: 1080, marker: 'latest' }).deferred, true);
  assert.equal(harness.reflows.length, 1, 'flight geometry remains frozen');
  const cleanup = runtime.cleanup('resolved');
  assert.equal(cleanup.deferredReflowApplied, true);
  assert.equal(cleanup.deferredResizeCount, 3);
  assert.equal(harness.reflows.length, 2);
  assert.equal(harness.reflows[1].layout.marker, 'latest', 'only the newest flight resize is applied');
  runtime.cleanup('again');
  assert.equal(harness.reflows.length, 2, 'deferred resize reflows exactly once');
  assert.equal(harness.disposals.length, 2);

  const throwing = Harness.createHarness({ throwReflow: true });
  launchToActive(throwing.runtime);
  throwing.runtime.resize({ width: 900, height: 600 });
  const report = throwing.runtime.cleanup('resolved');
  assert.equal(report.deferredReflowApplied, true);
  assert.equal(report.errors.some(error => error.phase === 'host.reflow'), true);
  throwing.runtime.cleanup('again');
  assert.equal(throwing.reflows.length, 1, 'a throwing host still cannot reflow twice');
}

function testFactsAreStrictPhysicalData() {
  for (const [eventId, facts] of Object.entries(Harness.DEFAULT_FACTS)) {
    const normalized = Kernel.normalizeOutcomeFacts(eventId, facts);
    assert.equal(normalized.eventId, eventId);
    assert.equal(Object.isFrozen(normalized.values), true);
  }
  assert.throws(() => Kernel.normalizeOutcomeFacts('rainbow-corkscrew', {}), /require/);
  assert.throws(() => Kernel.normalizeOutcomeFacts('rainbow-corkscrew',
    { corkscrewRadians: 1, additiveLives: 50 }), /rule field/);
  assert.throws(() => Kernel.normalizeOutcomeFacts('mitosis', { landedCopies: 3 }), /maximum/);
  assert.throws(() => Kernel.normalizeOutcomeFacts('plinko', { slotIndex: 9, dropDurationMs: 1 }), /maximum/);
  assert.throws(() => Kernel.normalizeOutcomeFacts('alien-invasion',
    { bankCount: 1, ringEntered: true, surprise: true }), /unsupported field/);
  assert.throws(() => Kernel.normalizeOutcomeFacts('heart-rush', {
    schema: 'EventOutcomeFactsV1', eventId: 'magnet', values: { pulseCount: 3 },
  }), /eventId mismatch/);

  const badOutput = Kernel.definePack({ eventClass: 'assist', ids: ['rainbow-corkscrew'],
    create(id, context) {
      return baseBehavior(id, 'assist', context, {
        launch() { return { effects: { additiveLives: 999 } }; },
      });
    } });
  const runtime = makeRuntime(badOutput);
  runtime.telegraph(); runtime.qualifyLaunch({});
  assert.throws(() => runtime.launch({}), /cannot emit rule field/);
  assert.equal(runtime.snapshot().phase, 'cleaned');

  const badFacts = Kernel.definePack({ eventClass: 'assist', ids: ['heart-rush'],
    create(id, context) {
      return baseBehavior(id, 'assist', context, {
        evaluate() { return { pulseCount: 3, reward: 100 }; },
      });
    } });
  const factRuntime = makeRuntime(badFacts);
  launchToActive(factRuntime);
  assert.throws(() => factRuntime.evaluate(Harness.makeProbe()), /cannot emit rule field/);
  assert.equal(factRuntime.snapshot().phase, 'cleaned');
}

function testRulesAdapterValidationAndIdempotence() {
  const adapter = RulesAdapter.createRulesAdapter({ scopeId: 'match-1' });
  const rainbow = resolve(adapter, 'r1', 'rainbow-corkscrew',
    Harness.DEFAULT_FACTS['rainbow-corkscrew']);
  assert.equal(rainbow.claimed, true);
  assert.equal(rainbow.rulesInput.effects.additiveLives, 1);
  assert.equal(Object.isFrozen(rainbow.rulesInput.effects), true);
  const duplicate = resolve(adapter, 'r1', 'rainbow-corkscrew',
    Harness.DEFAULT_FACTS['rainbow-corkscrew']);
  assert.equal(duplicate.claimed, false);
  assert.equal(duplicate.rulesInput, null, 'duplicate resolution is an explicit no-op');
  assert.throws(() => resolve(adapter, 'r1', 'rainbow-corkscrew', { corkscrewRadians: 9 }),
    /reused with different/);

  const double = resolve(adapter, 'r2', 'double-flip', { rotations: 2.01 });
  assert.equal(double.rulesInput.effects.lifeMultiplier, 2);
  assert.equal(double.rulesInput.effects.halveOpponents, true);
  assert.throws(() => resolve(adapter, 'r3', 'double-flip', { rotations: 1.99 }),
    /fewer than two/);

  const roulette = resolve(adapter, 'r4', 'roulette-table', { sectorIndex: 3 },
    { formatId: 'team-clash' });
  assert.equal(roulette.rulesInput.effects.scoreMultiplier, 4,
    'Team Clash receives a raw-score multiplier, never a life effect');
  assert.equal(roulette.rulesInput.effects.lifeMultiplier, undefined);

  const plinkoWin = resolve(adapter, 'r5', 'plinko', { slotIndex: 4, dropDurationMs: 12000 },
    { formatId: 'team-clash', result: 'MISS', pose: 'miss' });
  assert.equal(plinkoWin.rulesInput.result, 'MAKE');
  assert.equal(plinkoWin.terminalOutcome, 'current-win');
  assert.equal(plinkoWin.rulesInput.effects.automaticWinner, 'current');
  const plinkoLoss = resolve(adapter, 'r6', 'plinko', { slotIndex: 3, dropDurationMs: 11000 },
    { result: 'MAKE' });
  assert.equal(plinkoLoss.rulesInput.result, 'MISS');
  assert.equal(plinkoLoss.rulesInput.effects.forceEliminateActor, true);
  const plinkoMagnet = resolve(adapter, 'r7', 'plinko', { slotIndex: 2, dropDurationMs: 10000 });
  assert.equal(plinkoMagnet.rulesInput.effects.grantAlwaysMagnet, true);

  const mitosis = resolve(adapter, 'r8', 'mitosis', { landedCopies: 2 });
  assert.equal(mitosis.rulesInput.effects.additiveLives, 3);
  assert.throws(() => resolve(adapter, 'r9', 'mitosis', { landedCopies: 0 }), /conflicts/);
  assert.throws(() => resolve(adapter, 'r10', 'cap-toss',
    { bodyLanded: true, topLanded: false }), /conflicts/);
  assert.throws(() => resolve(adapter, 'r11', 'alien-invasion',
    { bankCount: 0, ringEntered: true }), /conflicts/);

  const mirrorMiss = resolve(adapter, 'r12', 'mirror-match',
    Harness.DEFAULT_FACTS['mirror-match'], { result: 'MISS', pose: 'miss' });
  assert.equal(mirrorMiss.deferred.kind, 'mirror-match');
  assert.equal(mirrorMiss.deferred.nestedEvents, false);

  const heartMiss = resolve(adapter, 'r13', 'heart-rush', { pulseCount: 3 },
    { result: 'MISS', pose: 'miss' });
  assert.equal(heartMiss.rulesInput.effects.additiveLives, undefined,
    'misses cannot collect success rewards');
  assert.throws(() => adapter.resolve({ resolutionId: 'inject', eventId: 'heart-rush',
    formatId: 'classic', result: 'MAKE', pose: 'upright', facts: { pulseCount: 3 },
    effects: { additiveLives: 500 } }), /unsupported field/);
  assert.throws(() => resolve(adapter, 'team-drain', 'life-drain', { magnetAssisted: true },
    { formatId: 'team-clash' }), /excluded/);

  assert.equal(adapter.snapshot().claims, 9);
  const closed = adapter.cleanup();
  assert.equal(closed.closed, true);
  assert.equal(closed.claims, 0);
  assert.throws(() => resolve(adapter, 'after-close', 'heart-rush', { pulseCount: 3 }), /closed/);
}

function testEveryEventHasOneRulesBoundary() {
  const adapter = RulesAdapter.createRulesAdapter({ scopeId: 'all-events' });
  let terminals = 0;
  for (const [eventId, facts] of Object.entries(Harness.DEFAULT_FACTS)) {
    const classic = resolve(adapter, `classic:${eventId}`, eventId, facts);
    assert.equal(classic.schema, 'EventRulesResolutionV1');
    assert.equal(classic.claimed, true);
    assert.equal(classic.rulesInput.effects.metadata.eventId, eventId);
    if (classic.terminalOutcome) terminals += 1;
    if (eventId !== 'life-drain') {
      const team = resolve(adapter, `team:${eventId}`, eventId, facts,
        { formatId: 'team-clash' });
      assert.equal(team.claimed, true);
      assert.equal(team.rulesInput.effects.metadata.eventId, eventId);
    }
  }
  assert.equal(terminals, 1, 'Plinko is the only pack capable of a terminal automatic result');
  assert.equal(adapter.snapshot().claims, 59);
  adapter.cleanup();
}

function testImmutableFramesReducedMotionAndRenderParity() {
  const harness = Harness.createHarness({ eventId: 'rainbow-corkscrew' });
  launchToActive(harness.runtime);
  const full = harness.runtime.frame(false);
  const reduced = harness.runtime.frame(true);
  assert.equal(Kernel.mechanicsSignature(full), Kernel.mechanicsSignature(reduced));
  assert.notDeepEqual(full.cues, reduced.cues, 'reduced motion may change presentation cues');
  assert.equal(Object.isFrozen(reduced.entities[0].bounds), true);

  const malicious = Harness.createHarness({ frame(reducedMotion, context, sequence) {
    const value = Harness.makeFrame('rainbow-corkscrew', 'assist', context.scope.laneId,
      { sequence, reducedMotion });
    if (reducedMotion) value.entities[0].transform.x += 10;
    return value;
  } });
  launchToActive(malicious.runtime);
  malicious.runtime.frame(false);
  assert.throws(() => malicious.runtime.frame(true), /changed authoritative event mechanics/);
  assert.equal(malicious.runtime.snapshot().phase, 'cleaned');

  const renderPack = EventRenderer.defineRenderPack({ eventClass: 'assist',
    ids: ['rainbow-corkscrew'], render() { return {}; } });
  const renderer = EventRenderer.createEventRenderer({ packs: [renderPack] });
  const plan = renderer.render(full);
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.commands[0].transform), true);
  assert.equal(plan.mechanicsSignature, Kernel.mechanicsSignature(full));
  assert.deepEqual(plan.commands[0].transform, full.entities[0].transform);
  assert.deepEqual(plan.commands[0].bounds, full.entities[0].bounds);
  assert.equal(plan.commands[0].appearanceRef, full.entities[0].appearanceRef);
  const reducedPlan = renderer.render(reduced);
  assert.equal(plan.mechanicsSignature, reducedPlan.mechanicsSignature,
    'reduced-motion render plans retain identical mechanics');

  const badRenderPack = EventRenderer.defineRenderPack({ eventClass: 'assist',
    ids: ['rainbow-corkscrew'], render(frame) {
      const commands = JSON.parse(JSON.stringify(frame.entities));
      commands[0].transform.angle += 0.35;
      return { commands };
    } });
  const badRenderer = EventRenderer.createEventRenderer({ packs: [badRenderPack] });
  assert.throws(() => badRenderer.render(full), /diverges from authoritative/);

  const callerFrame = Harness.makeFrame('rainbow-corkscrew', 'assist', 'lane-a');
  const originalX = callerFrame.entities[0].transform.x;
  const mutationPack = EventRenderer.defineRenderPack({ eventClass: 'assist',
    ids: ['rainbow-corkscrew'], render(frame) {
      frame.entities[0].transform.x = -999;
      return {};
    } });
  const mutationRenderer = EventRenderer.createEventRenderer({ packs: [mutationPack] });
  assert.throws(() => mutationRenderer.render(callerFrame), TypeError);
  assert.equal(callerFrame.entities[0].transform.x, originalX,
    'renderer receives only a frozen copy of the authoritative frame');

  assert.throws(() => EventRenderer.createEventRenderer({ packs: [renderPack, renderPack] }),
    /Duplicate/);
  assert.throws(() => EventRenderer.defineRenderPack({ eventClass: 'assist', ids: ['x'],
    render() {}, physics() {} }), /unsupported field/);
}

function testBrowserUmdSurfaces() {
  const context = vm.createContext({ console });
  const files = [
    '../js/v112-event-kernel.js', '../js/v112-event-runtime.js',
    '../js/v112-event-rules-adapter.js', '../js/v112-event-renderer.js',
    './lib/v112-event-harness.js',
  ];
  for (const relative of files) {
    const filename = path.resolve(__dirname, relative);
    vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  }
  assert.equal(context.FlipgameV112EventKernel.schema, 'FlipgameEventKernelV1');
  assert.equal(context.FlipgameV112EventRuntime.schema, 'FlipgameEventRuntimeV1');
  assert.equal(context.FlipgameV112EventRulesAdapter.schema, 'FlipgameEventRulesAdapterV1');
  assert.equal(context.FlipgameV112EventRenderer.schema, 'FlipgameEventRendererV1');
  assert.equal(context.FlipgameV112EventHarness.schema, 'FlipgameEventHarnessV1');
}

function run() {
  testPublicContractsAndInvalidPacks();
  testEventSeedOnlyDeterminismAndImmutability();
  testLifecycleAndFrozenBoundaryValues();
  testResourceScopeAndExceptionSafeCleanup();
  testLaneIsolation();
  testResizeOwnershipAndExactlyOnceReflow();
  testFactsAreStrictPhysicalData();
  testRulesAdapterValidationAndIdempotence();
  testEveryEventHasOneRulesBoundary();
  testImmutableFramesReducedMotionAndRenderParity();
  testBrowserUmdSurfaces();
  console.log('v1.12 event kernel tests passed.');
}

run();
