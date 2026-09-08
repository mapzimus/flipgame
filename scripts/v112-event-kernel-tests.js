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
const Rules = require('../js/v112-rules.js');
const Harness = require('./lib/v112-event-harness.js');

function clone(value) {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(clone);
  const result = {};
  Object.keys(value).forEach(key => { result[key] = clone(value[key]); });
  return result;
}

function players(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`, name: `Player ${index + 1}`, isAI: false,
  }));
}

function fnv(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function hex(value) { return (value >>> 0).toString(16).padStart(8, '0'); }
function identity(namespace, ordinal, callerId = null) {
  const caller = callerId == null ? '' : callerId;
  const material = `${namespace}|${ordinal}|${encodeURIComponent(caller)}|pressure-signal`;
  const token = hex(fnv(`a|${material}`)) + hex(fnv(`b|${material}`));
  return Object.freeze({ schema: 'ResolutionIdentityV1', namespace, ordinal, token,
    callerId, id: `ri1|${namespace}|${ordinal}|${token}|${callerId == null ? '' : encodeURIComponent(callerId)}` });
}

function runtimeOptions(pack, laneId, authority, overrides = {}) {
  return Object.assign({ laneId, packs: [pack], authority: authority.runtime,
    resolveCollider(collider) { return { transform: collider.transform, bounds: collider.bounds }; },
  }, overrides);
}

function issue(eventId, options = {}) {
  const eventClass = Kernel.EVENT_CLASS_BY_ID[eventId];
  const harness = Harness.createHarness({ eventId, eventClass,
    facts: options.facts || Harness.DEFAULT_FACTS[eventId],
    evaluate: options.evaluate, probe: options.probe });
  const driven = Harness.drive(harness.runtime, { probe: options.probe });
  return { outcome: driven.outcome, frame: driven.frame, harness,
    authority: harness.authority };
}

function testCanonicalContractsAndUntrustedData() {
  assert.equal(Kernel.schema, 'FlipgameEventKernelV2');
  assert.equal(Runtime.schema, 'FlipgameEventRuntimeV2');
  assert.equal(RulesAdapter.schema, 'FlipgameEventRulesAdapterV2');
  assert.equal(EventRenderer.schema, 'FlipgameEventRendererV2');
  assert.equal(Harness.schema, 'FlipgameEventHarnessV2');
  assert.equal(Kernel.EVENT_IDS.length, 30);
  assert.equal(Object.getPrototypeOf(Kernel.EVENT_CLASS_BY_ID), null);
  assert.equal(Object.keys(Kernel.FACT_SPECS).length, 30);
  assert.deepEqual(Kernel.EVENT_CLASSES, ['hazard', 'wildcard', 'assist']);

  assert.throws(() => Kernel.definePack({ eventClass: 'assist', ids: ['not-an-event'], create() {} }),
    /Unknown canonical/);
  assert.throws(() => Kernel.definePack({ eventClass: 'hazard', ids: ['rainbow-corkscrew'], create() {} }),
    /belongs to the assist/);
  assert.throws(() => Kernel.definePack({ eventClass: 'assist',
    ids: ['rainbow-corkscrew', 'rainbow-corkscrew'], create() {} }), /unique/);
  assert.throws(() => Kernel.definePack({ eventClass: 'assist', ids: ['rainbow-corkscrew'],
    create() {}, reward: 5 }), /unsupported field/);
  assert.throws(() => Kernel.definePack({ eventClass: 'assist', ids: ['rainbow-corkscrew'],
    create() { return Math.random(); } }), /ambient random/);
  assert.throws(() => Kernel.definePack({ eventClass: 'assist', ids: ['rainbow-corkscrew'],
    create: Math.random }), /inspectable authored code/);

  const polluted = JSON.parse('{"safe":1,"__proto__":{"owned":true}}');
  assert.throws(() => Kernel.immutableData(polluted, 'polluted'), /unsafe field/);
  assert.throws(() => Kernel.immutableData({ constructor: 'x' }, 'polluted'), /unsafe field/);
  assert.throws(() => Kernel.immutableData({ prototype: 'x' }, 'polluted'), /unsafe field/);
  assert.throws(() => Kernel.immutableData({ [Symbol('hidden')]: 1 }, 'polluted'), /symbol fields/);
  const safe = Kernel.immutableData({ nested: { value: 1 } }, 'safe');
  assert.equal(Object.getPrototypeOf(safe), null);
  assert.equal(Object.getPrototypeOf(safe.nested), null);

  const pack = Harness.makePack({ eventClass: 'assist', ids: ['rainbow-corkscrew'] });
  const authority = Kernel.createAuthority();
  assert.throws(() => Runtime.createEventRuntime({ laneId: 'missing', packs: [pack],
    authority: authority.runtime }), /collider resolver/);
  const runtime = Runtime.createEventRuntime(runtimeOptions(pack, 'inherited-registry', authority));
  const inheritedSelection = Object.assign({}, Harness.makeSelection('rainbow-corkscrew', 'assist', 1),
    { eventId: 'toString' });
  assert.throws(() => runtime.bind(inheritedSelection, Harness.makeContext()), /No EventPack/);
}

function testStrictDeterministicRngAndSelectionConsumption() {
  const first = Kernel.createEventRng(0xffffffff);
  const second = Kernel.createEventRng(0xffffffff);
  assert.deepEqual([
    first.sampleUint32(0, 'peg'), first.sampleUint32(999999, 'peg'),
    first.nextFloat('flight'), first.nextInt(9, 'slot'),
  ], [
    second.sampleUint32(0, 'peg'), second.sampleUint32(999999, 'peg'),
    second.nextFloat('flight'), second.nextInt(9, 'slot'),
  ]);
  assert.throws(() => Kernel.createEventRng('1'), /number primitive|safe integer/);
  assert.throws(() => Kernel.createEventRng(-1), /minimum/);
  assert.throws(() => first.sampleUint32('1', 'peg'), /number primitive|safe integer/);
  assert.throws(() => first.sampleUint32(1000000, 'peg'), /exceeds/);
  assert.throws(() => first.sampleUint32(1, 'x'.repeat(65)), /exceeds/);

  let capturedSelection;
  const pack = Harness.makePack({ eventClass: 'assist', ids: ['rainbow-corkscrew'],
    onCreate(id, context) { capturedSelection = context.selection; } });
  const authority = Kernel.createAuthority();
  const runtime = Runtime.createEventRuntime(runtimeOptions(pack, 'selection-lane', authority));
  runtime.bind(Harness.makeSelection('rainbow-corkscrew', 'assist', 77, { turnSeed: 999 }),
    Harness.makeContext());
  assert.equal(capturedSelection.eventSeed, 77);
  assert.equal(Object.hasOwn(capturedSelection, 'turnSeed'), false,
    'pack selection cannot observe the turn seed');
  runtime.telegraph();
  const qualified = runtime.qualifyLaunch(Harness.makeSignal());
  assert.equal(qualified.consumed, true);
  assert.equal(runtime.snapshot().selection.consumed, true);
  assert.equal(Object.isFrozen(qualified.launchClaim), true);
  assert.throws(() => runtime.qualifyLaunch(Harness.makeSignal()), /telegraphed|already consumed/);
  runtime.cleanup('done');

  const consumed = Harness.makeSelection('rainbow-corkscrew', 'assist', 1, { consumed: true });
  const consumedRuntime = Runtime.createEventRuntime(runtimeOptions(pack, 'consumed', Kernel.createAuthority()));
  assert.throws(() => consumedRuntime.bind(consumed, Harness.makeContext()), /Consumed/);
  const stringSeedRuntime = Runtime.createEventRuntime(runtimeOptions(pack, 'string-seed', Kernel.createAuthority()));
  assert.throws(() => stringSeedRuntime.bind(
    Harness.makeSelection('rainbow-corkscrew', 'assist', '12'), Harness.makeContext()),
  /number primitive|safe integer/);
  const stringTurnRuntime = Runtime.createEventRuntime(runtimeOptions(pack, 'string-turn', Kernel.createAuthority()));
  assert.throws(() => stringTurnRuntime.bind(
    Harness.makeSelection('rainbow-corkscrew', 'assist', 12, { turnSeed: '1' }), Harness.makeContext()),
  /number primitive|safe integer/);

  const selected = ExistingEvents.select({ activityId: 'practice', physicsModeId: 'normal',
    forceName: 'Wind Tunnel', playerName: 'Tester', seed: 42 });
  const compatibility = Harness.makePack({ eventClass: 'hazard', ids: ['wind-tunnel'] });
  const compatibilityAuthority = Kernel.createAuthority();
  const compatibleRuntime = Runtime.createEventRuntime(runtimeOptions(compatibility,
    'actual-event-selection', compatibilityAuthority));
  compatibleRuntime.bind(selected, Harness.makeContext());
  assert.equal(compatibleRuntime.snapshot().eventId, 'wind-tunnel');
  compatibleRuntime.cleanup('done');
}

function testStaticAndDynamicAmbientRandomProhibition() {
  const direct = () => Math.random();
  assert.throws(() => Kernel.definePack({ eventClass: 'assist',
    ids: ['rainbow-corkscrew'], create: direct }), /ambient random/);

  const dynamic = Kernel.definePack({ eventClass: 'assist', ids: ['rainbow-corkscrew'],
    create(eventId, context) {
      globalThis.Math['ran' + 'dom']();
      return Harness.makePack({ eventClass: 'assist', ids: [eventId] }).create(eventId, context);
    } });
  const runtime = Runtime.createEventRuntime(runtimeOptions(dynamic, 'random-lane', Kernel.createAuthority()));
  assert.throws(() => runtime.bind(Harness.makeSelection('rainbow-corkscrew', 'assist', 4),
    Harness.makeContext()), /attempted ambient random/);
  assert.equal(runtime.snapshot().phase, 'cleaned');

  const dynamicBehavior = Harness.createHarness({ launch() {
    globalThis.Math['ran' + 'dom']();
    return {};
  } });
  dynamicBehavior.runtime.telegraph();
  dynamicBehavior.runtime.qualifyLaunch(Harness.makeSignal());
  assert.throws(() => dynamicBehavior.runtime.launch(Harness.makeDraft()), /attempted ambient random/);

  assert.throws(() => EventRenderer.defineRenderPack({ eventClass: 'assist',
    ids: ['rainbow-corkscrew'], render() { return Math.random(); } }), /ambient random/);
}

function arm(runtime, step = Harness.makeStep()) {
  runtime.telegraph();
  runtime.qualifyLaunch(Harness.makeSignal());
  runtime.launch(Harness.makeDraft());
  runtime.step(step);
}

function testEvaluationLifecycleAndRuntimeOwnedVerdict() {
  const pending = Harness.createHarness({});
  arm(pending.runtime, Harness.makeStep({ elapsedMs: 2000 }));
  pending.runtime.contact(Harness.makeContact());
  assert.equal(pending.runtime.evaluate(Harness.makeProbe({ settled: false,
    elapsedMs: 1000 })), null);
  assert.equal(pending.runtime.snapshot().phase, 'active');
  const outcome = pending.runtime.evaluate(Harness.makeProbe({ elapsedMs: 2000 }));
  assert.equal(outcome.schema, 'EventRuntimeOutcomeV1');
  assert.equal(outcome.result, 'MAKE');
  assert.equal(outcome.reason, 'stable-upright');
  assert.equal(Object.isFrozen(outcome.facts.values), true);
  assert.equal(pending.runtime.snapshot().phase, 'evaluated');
  pending.runtime.cleanup('done');

  const beforeStep = Harness.createHarness({});
  beforeStep.runtime.telegraph();
  beforeStep.runtime.qualifyLaunch(Harness.makeSignal());
  beforeStep.runtime.launch(Harness.makeDraft());
  assert.throws(() => beforeStep.runtime.evaluate(Harness.makeProbe()), /step evidence/);

  const premature = Harness.createHarness({ evaluate(probe) {
    return Kernel.immutableData({ result: 'MAKE', pose: 'upright', reason: 'early',
      facts: Harness.DEFAULT_FACTS['rainbow-corkscrew'] }, 'premature');
  } });
  arm(premature.runtime, Harness.makeStep({ elapsedMs: 2000 }));
  premature.runtime.contact(Harness.makeContact());
  assert.throws(() => premature.runtime.evaluate(Harness.makeProbe({ settled: false,
    reason: 'early', elapsedMs: 1000 })), /unsettled/);
  assert.equal(premature.runtime.snapshot().phase, 'cleaned');

  let evaluations = 0;
  const delayed = Harness.createHarness({ evaluate(probe) {
    evaluations += 1;
    if (evaluations === 1) return null;
    return Kernel.immutableData({ result: probe.result, pose: probe.pose,
      reason: probe.reason, facts: Harness.DEFAULT_FACTS['rainbow-corkscrew'] }, 'delayed');
  } });
  arm(delayed.runtime, Harness.makeStep({ elapsedMs: 2000 }));
  delayed.runtime.contact(Harness.makeContact());
  assert.equal(delayed.runtime.evaluate(Harness.makeProbe({ elapsedMs: 2000 })), null);
  assert.equal(delayed.runtime.snapshot().phase, 'active');
  assert.equal(delayed.runtime.evaluate(Harness.makeProbe({ elapsedMs: 2000 })).result, 'MAKE');
  delayed.runtime.cleanup('done');

  const liar = Harness.createHarness({ evaluate() {
    return Kernel.immutableData({ result: 'MISS', pose: 'miss', reason: 'pack-invented',
      facts: Harness.DEFAULT_FACTS['rainbow-corkscrew'] }, 'liar');
  } });
  arm(liar.runtime, Harness.makeStep({ elapsedMs: 2000 }));
  liar.runtime.contact(Harness.makeContact());
  assert.throws(() => liar.runtime.evaluate(Harness.makeProbe({ elapsedMs: 2000 })),
    /conflicts with the host/);

  const mutable = Harness.createHarness({ evaluate(probe) {
    return { result: probe.result, pose: probe.pose, reason: probe.reason,
      facts: Harness.DEFAULT_FACTS['rainbow-corkscrew'] };
  } });
  arm(mutable.runtime, Harness.makeStep({ elapsedMs: 2000 }));
  mutable.runtime.contact(Harness.makeContact());
  assert.throws(() => mutable.runtime.evaluate(Harness.makeProbe({ elapsedMs: 2000 })), /frozen result/);

  const noContact = Harness.createHarness({});
  arm(noContact.runtime, Harness.makeStep({ elapsedMs: 2000 }));
  assert.throws(() => noContact.runtime.evaluate(Harness.makeProbe({ contactCount: 0,
    elapsedMs: 2000 })), /MAKE requires accepted contact evidence/);
}

function testContactOrderingDeduplicationAndBounds() {
  let calls = 0;
  const harness = Harness.createHarness({ contact() { calls += 1; return {}; } });
  arm(harness.runtime, Harness.makeStep({ elapsedMs: 2000 }));
  const begin = Harness.makeContact({ elapsedMs: 600 });
  assert.equal(harness.runtime.contact(begin).duplicate, false);
  assert.equal(harness.runtime.contact(begin).duplicate, true);
  assert.equal(calls, 1, 'exact duplicate never reaches EventBehavior.contact');
  harness.runtime.contact(Harness.makeContact({ phase: 'persist', elapsedMs: 700 }));
  harness.runtime.contact(Harness.makeContact({ phase: 'end', elapsedMs: 800 }));
  assert.equal(calls, 3);
  assert.throws(() => harness.runtime.contact(Harness.makeContact({ phase: 'begin', elapsedMs: 900 })),
    /cannot restart/);
  assert.equal(calls, 3, 'invalid restart is rejected before behavior invocation');

  const missingBegin = Harness.createHarness({ contact() { throw new Error('must-not-run'); } });
  arm(missingBegin.runtime, Harness.makeStep({ elapsedMs: 2000 }));
  assert.throws(() => missingBegin.runtime.contact(Harness.makeContact({ phase: 'persist' })),
    /must begin/);
  assert.equal(missingBegin.trace.filter(item => item === 'contact').length, 0);

  const foreign = Harness.createHarness({ contact() { throw new Error('must-not-run'); } });
  arm(foreign.runtime, Harness.makeStep({ elapsedMs: 2000 }));
  assert.throws(() => foreign.runtime.contact(Harness.makeContact({
    entityARef: 'body:foreign-a', entityBRef: 'body:foreign-b',
  })), /owned by this event lane/);
  assert.equal(foreign.trace.filter(item => item === 'contact').length, 0);

  const reordered = Harness.createHarness({ contact() { calls += 1; return {}; } });
  arm(reordered.runtime, Harness.makeStep({ elapsedMs: 2000 }));
  reordered.runtime.contact(Harness.makeContact({ elapsedMs: 700 }));
  assert.throws(() => reordered.runtime.contact(Harness.makeContact({ phase: 'persist', elapsedMs: 699 })),
    /reordered/);

  const ahead = Harness.createHarness({});
  arm(ahead.runtime, Harness.makeStep({ elapsedMs: 500 }));
  assert.throws(() => ahead.runtime.contact(Harness.makeContact({ elapsedMs: 501 })),
    /ahead of host physics evidence/);

  const bounded = Harness.createHarness({});
  arm(bounded.runtime, Harness.makeStep({ elapsedMs: 2000 }));
  for (let index = 0; index < Kernel.LIMITS.contacts; index += 1) {
    bounded.runtime.contact(Harness.makeContact({ contactId: `c-${index}`, elapsedMs: 500 + index }));
  }
  assert.throws(() => bounded.runtime.contact(Harness.makeContact({ contactId: 'overflow', elapsedMs: 900 })),
    /contact limit/);
}

function testResourceOwnershipAndHostileCleanup() {
  const shared = {};
  const left = Kernel.createResourceScope('left');
  const right = Kernel.createResourceScope('right');
  left.ownBody('main', shared, () => {});
  assert.throws(() => right.ownBody('foreign', shared, () => {}), /another scope/);
  left.cleanup('release');
  // The cross-scope WeakMap claim is released even though lane metadata still
  // prevents an accidental cross-lane transfer.
  const sameLane = Kernel.createResourceScope('left');
  assert.doesNotThrow(() => sameLane.ownBody('reused', shared, () => {}));
  sameLane.cleanup('done');

  const order = [];
  const scope = Kernel.createResourceScope('cleanup-lane');
  for (let index = 0; index < 20; index += 1) {
    scope.ownCallback(`callback-${index}`, { laneId: 'cleanup-lane' }, () => {
      order.push(index);
      throw new Error(`dispose-${index}`);
    });
  }
  const hostileReason = new Proxy({}, { get() { throw new Error('reason getter'); } });
  const report = scope.cleanup(hostileReason);
  assert.equal(report.released.length, 20);
  assert.deepEqual(order, Array.from({ length: 20 }, (_, index) => 19 - index));
  assert.equal(report.errors.length, Kernel.LIMITS.errors);
  assert.equal(report.droppedErrors, 4);
  assert.equal(report.reason, 'cleanup');
  assert.equal(scope.snapshot().active, 0);

  const thenableScope = Kernel.createResourceScope('thenable');
  const resource = { laneId: 'thenable' };
  thenableScope.ownBody('main', resource, () => ({ then() {} }));
  const thenableReport = thenableScope.cleanup('done');
  assert.equal(thenableReport.clean, false);
  const reuse = Kernel.createResourceScope('thenable');
  assert.doesNotThrow(() => reuse.ownBody('main', resource, () => {}));
  reuse.cleanup('done');
  assert.throws(() => Kernel.createResourceScope('async').ownBody('x', { laneId: 'async' },
    async () => {}), /cannot be async/);

  let nestedScope;
  let nestedDisposals = 0;
  nestedScope = Kernel.createResourceScope('nested-scope');
  nestedScope.ownBody('main', { laneId: 'nested-scope' }, () => {
    nestedDisposals += 1;
    assert.equal(nestedScope.cleanup('nested').inProgress, true);
  });
  assert.equal(nestedScope.cleanup('outer').clean, true);
  assert.equal(nestedDisposals, 1);

  let reentrantRuntime;
  let behaviorCleanups = 0;
  reentrantRuntime = Harness.createHarness({ cleanup() {
    behaviorCleanups += 1;
    const nested = reentrantRuntime.runtime.cleanup(new Proxy({}, { get() { throw new Error('nested'); } }));
    assert.equal(nested.inProgress, true);
  } });
  const reentrantReport = reentrantRuntime.runtime.cleanup(hostileReason);
  assert.equal(behaviorCleanups, 1);
  assert.equal(reentrantReport.reason, 'cleanup');
  assert.equal(reentrantRuntime.runtime.snapshot().resources.active, 0);

  const thrown = new Proxy({}, { get() { throw new Error('hostile thrown getter'); },
    getPrototypeOf() { throw new Error('hostile prototype'); } });
  const hostile = Harness.createHarness({ step() { throw thrown; } });
  hostile.runtime.telegraph();
  hostile.runtime.qualifyLaunch(Harness.makeSignal());
  hostile.runtime.launch(Harness.makeDraft());
  assert.throws(() => hostile.runtime.step(Harness.makeStep()), error => {
    assert.equal(error.eventCleanupReport.resources.released.length >= 1, true);
    return true;
  });
  assert.equal(hostile.runtime.snapshot().resources.active, 0);

  const hostileCleanup = Harness.createHarness({ cleanup() { throw thrown; } });
  const hostileCleanupReport = hostileCleanup.runtime.cleanup('manual');
  assert.equal(hostileCleanupReport.clean, false);
  assert.equal(hostileCleanupReport.errors.length, 1);
  assert.equal(hostileCleanup.runtime.snapshot().resources.active, 0,
    'a hostile cleanup throw cannot prevent resource release');

  const asynchronousCleanup = Harness.createHarness({ cleanup() {
    return { then() {} };
  } });
  const asynchronousReport = asynchronousCleanup.runtime.cleanup('manual');
  assert.equal(asynchronousReport.clean, false);
  assert.equal(asynchronousCleanup.runtime.snapshot().resources.active, 0);

  let createReleased = 0;
  const createFailurePack = Kernel.definePack({ eventClass: 'assist',
    ids: ['rainbow-corkscrew'], create(eventId, context) {
      context.scope.ownBody('created', { laneId: context.scope.laneId }, () => {
        createReleased += 1;
        throw new Error('create-disposer-failed');
      });
      throw new Error('pack-create-failed');
    } });
  const createAuthority = Kernel.createAuthority();
  const createFailureRuntime = Runtime.createEventRuntime(runtimeOptions(createFailurePack,
    'create-failure', createAuthority));
  assert.throws(() => createFailureRuntime.bind(
    Harness.makeSelection('rainbow-corkscrew', 'assist', 1), Harness.makeContext()), error => {
    assert.equal(error.eventCleanupReport.resources.released.length, 1);
    assert.equal(error.eventCleanupReport.errors.length, 2);
    return true;
  });
  assert.equal(createReleased, 1);
  assert.equal(createFailureRuntime.snapshot().resources.active, 0);

  const resourceLimit = Kernel.createResourceScope('resource-limit');
  for (let index = 0; index < Kernel.LIMITS.resources; index += 1) {
    resourceLimit.ownCallback(`r-${index}`, { laneId: 'resource-limit' }, () => {});
  }
  assert.throws(() => resourceLimit.ownCallback('overflow', { laneId: 'resource-limit' }, () => {}),
    /resource limit/);
  resourceLimit.cleanup('done');
}

function testResizeSemanticsAndBoundedRetirement() {
  const harness = Harness.createHarness({});
  harness.runtime.telegraph();
  for (let index = 0; index < 24; index += 1) {
    const decision = harness.runtime.resize({ width: 1200 + index, height: 720, groundY: 620 });
    assert.equal(decision.rebound, true);
  }
  const state = harness.runtime.snapshot();
  assert.equal(state.retired.cycles, 24);
  assert.equal(state.retired.released, 24);
  assert.equal(Array.isArray(state.retired.recentErrors), true);
  assert.equal(state.retired.recentErrors.length <= Kernel.LIMITS.errors, true);
  assert.equal(Object.hasOwn(state, 'retiredReports'), false);

  harness.runtime.qualifyLaunch(Harness.makeSignal());
  harness.runtime.launch(Harness.makeDraft());
  harness.runtime.step(Harness.makeStep());
  harness.runtime.resize({ width: 1400, height: 800 });
  harness.runtime.resize({ width: 1920, height: 1080, latest: true });
  assert.equal(harness.reflows.length, 24, 'flight resizes are deferred');
  const cleanup = harness.runtime.cleanup('resolved');
  assert.equal(cleanup.deferredReflowApplied, true);
  assert.equal(cleanup.deferredResizeCount, 2);
  assert.equal(harness.reflows.length, 25);
  assert.equal(harness.reflows.at(-1).layout.latest, true);
  harness.runtime.cleanup('again');
  assert.equal(harness.reflows.length, 25, 'deferred reflow happens exactly once');

  const throwing = Harness.createHarness({ throwReflow: true });
  arm(throwing.runtime);
  throwing.runtime.resize({ width: 900, height: 600 });
  const failed = throwing.runtime.cleanup('done');
  assert.equal(failed.deferredReflowApplied, true);
  assert.equal(failed.errors.some(entry => entry.phase === 'host.reflow'), true);
  throwing.runtime.cleanup('again');
  assert.equal(throwing.reflows.length, 1);
}

function testLaneRuntimeIsolation() {
  const authority = Kernel.createAuthority();
  const left = Harness.createHarness({ laneId: 'left-lane', eventSeed: 91, authority });
  const right = Harness.createHarness({ laneId: 'right-lane', eventSeed: 91, authority });
  arm(left.runtime);
  arm(right.runtime);
  assert.equal(left.runtime.frame(false).laneId, 'left-lane');
  assert.equal(right.runtime.frame(false).laneId, 'right-lane');
  left.runtime.cleanup('left-done');
  assert.equal(left.runtime.snapshot().resources.active, 0);
  assert.equal(right.runtime.snapshot().resources.active, 1);
  assert.equal(right.runtime.snapshot().phase, 'active');
  right.runtime.cleanup('right-done');
}

function testColliderBackedFramesReducedMotionAndRenderer() {
  const harness = Harness.createHarness({});
  arm(harness.runtime);
  const full = harness.runtime.frame(false);
  assert.deepEqual(harness.trace.slice(-2), ['frame:false', 'frame:true'],
    'both motion variants are checked even when only one was requested');
  const reduced = harness.runtime.frame(true);
  assert.equal(Kernel.mechanicsSignature(full), Kernel.mechanicsSignature(reduced));
  assert.notDeepEqual(full.cues, reduced.cues);
  assert.equal(Object.isFrozen(full.entities[0].transform), true);

  const renderPack = EventRenderer.defineRenderPack({ eventClass: 'assist',
    ids: ['rainbow-corkscrew'], render() { return {}; } });
  const renderer = EventRenderer.createEventRenderer({ packs: [renderPack],
    authority: harness.authority.renderer });
  const plan = renderer.render(full);
  assert.equal(JSON.stringify(plan.commands[0].transform), JSON.stringify(full.entities[0].transform));
  assert.equal(JSON.stringify(plan.commands[0].bounds), JSON.stringify(full.entities[0].bounds));
  assert.equal(plan.mechanicsSignature, Kernel.mechanicsSignature(full));
  assert.equal(Object.isFrozen(plan.commands[0]), true);

  const forged = Harness.makeFrame('rainbow-corkscrew', 'assist', 'lane-a');
  assert.throws(() => renderer.render(forged), /kernel-issued/);
  const otherAuthorityRenderer = EventRenderer.createEventRenderer({ packs: [renderPack],
    authority: Kernel.createAuthority().renderer });
  assert.throws(() => otherAuthorityRenderer.render(full), /kernel-issued/);

  const badRender = EventRenderer.defineRenderPack({ eventClass: 'assist',
    ids: ['rainbow-corkscrew'], render(frame) {
      const commands = frame.entities.map(entity => clone(entity));
      commands[0].transform.x += 1;
      return { commands };
    } });
  const badRenderer = EventRenderer.createEventRenderer({ packs: [badRender],
    authority: harness.authority.renderer });
  assert.throws(() => badRenderer.render(full), /diverges/);

  const mutationPack = EventRenderer.defineRenderPack({ eventClass: 'assist',
    ids: ['rainbow-corkscrew'], render(frame) {
      frame.entities[0].transform.x = -999;
      return {};
    } });
  assert.throws(() => EventRenderer.createEventRenderer({ packs: [mutationPack],
    authority: harness.authority.renderer }).render(full), TypeError);
  assert.equal(full.entities[0].transform.x, 640);

  const badCue = EventRenderer.defineRenderPack({ eventClass: 'assist',
    ids: ['rainbow-corkscrew'], render() {
      return { cues: [{ cueId: 'reward', bonusLives: 9 }] };
    } });
  assert.throws(() => EventRenderer.createEventRenderer({ packs: [badCue],
    authority: harness.authority.renderer }).render(full), /unsupported field/);

  const reducedCheat = Harness.createHarness({ frame(reducedMotion, context, sequence) {
    const frame = Harness.makeFrame('rainbow-corkscrew', 'assist', context.scope.laneId,
      { sequence, reducedMotion });
    if (reducedMotion) frame.entities[0].transform.x += 5;
    return frame;
  } });
  arm(reducedCheat.runtime);
  assert.throws(() => reducedCheat.runtime.frame(true), /Reduced motion changed|authoritative collider/);

  const colliderCheat = Harness.createHarness({ resolveCollider(collider) {
    return { transform: Object.assign({}, collider.transform, { x: collider.transform.x + 1 }),
      bounds: collider.bounds };
  } });
  colliderCheat.runtime.telegraph();
  colliderCheat.runtime.qualifyLaunch(Harness.makeSignal());
  colliderCheat.runtime.launch(Harness.makeDraft());
  colliderCheat.runtime.step(Harness.makeStep());
  assert.throws(() => colliderCheat.runtime.frame(false), /authoritative collider/);
}

function testNarrowDirectiveFrameFactAndSizeSchemas() {
  for (const eventId of Kernel.EVENT_IDS) {
    const normalized = Kernel.normalizeOutcomeFacts(eventId, Harness.DEFAULT_FACTS[eventId]);
    assert.equal(normalized.eventId, eventId);
  }
  assert.throws(() => Kernel.normalizeOutcomeFacts('rainbow-corkscrew',
    { corkscrewRadians: 8, bonusLives: 99 }), /unsupported field/);
  assert.throws(() => Kernel.normalizeOutcomeFacts('heart-rush', { pulseCount: '3' }),
    /number primitive|safe integer/);
  assert.throws(() => Kernel.normalizeOutcomeFacts('mitosis', {
    primaryColliderRef: 'body:a', secondaryColliderRef: 'body:b',
    primaryLanded: true, secondaryLanded: false, landedCopies: 2 }), /conflicts/);
  assert.throws(() => Kernel.normalizeOutcomeFacts('roulette-table', Object.assign({},
    Harness.DEFAULT_FACTS['roulette-table'], { landingX: 99 })), /settled sector evidence/);
  assert.throws(() => Kernel.normalizeOutcomeFacts('plinko', Object.assign({},
    Harness.DEFAULT_FACTS.plinko, { dropDurationMs: 9999 })), /minimum/);
  assert.throws(() => Kernel.normalizeOutcomeFacts('cap-toss', {
    bodyColliderRef: 'body:same', topColliderRef: 'body:same',
    bodyLanded: true, topLanded: true }), /distinct/);

  const directive = Harness.createHarness({ launch() { return { bonusLives: 100 }; } });
  directive.runtime.telegraph();
  directive.runtime.qualifyLaunch(Harness.makeSignal());
  assert.throws(() => directive.runtime.launch(Harness.makeDraft()), /unsupported field/);

  const ownedDirective = Harness.createHarness({ launch() {
    return { impulses: [{ entityRef: 'body:flipper-main', x: 1, y: -2 }] };
  } });
  ownedDirective.runtime.telegraph();
  ownedDirective.runtime.qualifyLaunch(Harness.makeSignal());
  assert.equal(ownedDirective.runtime.launch(Harness.makeDraft()).impulses.length, 1);
  ownedDirective.runtime.cleanup('done');

  const foreignDirective = Harness.createHarness({ launch() {
    return { impulses: [{ entityRef: 'body:other-lane', x: 1, y: -2 }] };
  } });
  foreignDirective.runtime.telegraph();
  foreignDirective.runtime.qualifyLaunch(Harness.makeSignal());
  assert.throws(() => foreignDirective.runtime.launch(Harness.makeDraft()), /not owned by this event lane/);

  const alias = Harness.createHarness({ launch() { return { payout: 100 }; } });
  alias.runtime.telegraph();
  alias.runtime.qualifyLaunch(Harness.makeSignal());
  assert.throws(() => alias.runtime.launch(Harness.makeDraft()), /unsupported field/);

  ['bonusLives', 'lifeDelta', 'payout', 'prize'].forEach(field => {
    assert.throws(() => Kernel.normalizeDirective('step', { [field]: 1 }), /unsupported field/);
    assert.throws(() => Kernel.normalizeCue({ cueId: 'bad', [field]: 1 }, 'bad cue'),
      /unsupported field/);
  });

  const tooMany = Array.from({ length: Kernel.LIMITS.directiveItems + 1 }, (_, index) => ({
    entityRef: `body:${index}`, x: 1, y: 2,
  }));
  assert.throws(() => Kernel.normalizeDirective('step', { forces: tooMany }), /bounded array/);
  const tooManyCues = Array.from({ length: Kernel.LIMITS.cues + 1 }, (_, index) => ({ cueId: `c${index}` }));
  assert.throws(() => Kernel.normalizeCues(tooManyCues, 'cues'), /bounded cue array/);
  assert.throws(() => Kernel.immutableData({ text: 'x'.repeat(Kernel.LIMITS.stringLength + 1) }, 'long'),
    /overlong string/);

  let deep = { value: 1 };
  for (let index = 0; index < Kernel.LIMITS.dataDepth + 2; index += 1) deep = { child: deep };
  assert.throws(() => Kernel.immutableData(deep, 'deep'), /depth limit/);

  const entities = Array.from({ length: Kernel.LIMITS.entities + 1 }, (_, index) => ({
    entityId: `e${index}`, role: 'fx', transform: { x: 0, y: 0, angle: 0, scaleX: 1, scaleY: 1 },
    bounds: { left: 0, top: 0, width: 1, height: 1 }, colliderRef: null,
    appearanceRef: 'fx', visualStateRef: null, visible: true, zIndex: index,
  }));
  assert.throws(() => Kernel.normalizeFrame({ schema: 'EventFrameV1',
    eventId: 'rainbow-corkscrew', eventClass: 'assist', laneId: 'lane', sequence: 0,
    entities, cues: [], reducedMotion: false }, {
    eventId: 'rainbow-corkscrew', eventClass: 'assist', laneId: 'lane',
  }), /bounded array/);
  const hugeFrame = Harness.makeFrame('rainbow-corkscrew', 'assist', 'lane');
  hugeFrame.entities[0].transform.x = 1e20;
  assert.throws(() => Kernel.normalizeFrame(hugeFrame, {
    eventId: 'rainbow-corkscrew', eventClass: 'assist', laneId: 'lane',
  }), /exceeds its maximum/);
}

function testHighValueColliderOwnership() {
  const badFacts = Object.assign({}, Harness.DEFAULT_FACTS.plinko,
    { objectColliderRef: 'body:not-owned' });
  const harness = Harness.createHarness({ eventId: 'plinko', eventClass: 'wildcard', facts: badFacts });
  arm(harness.runtime, Harness.makeStep({ elapsedMs: 12000 }));
  harness.runtime.contact(Harness.makeContact({ elapsedMs: 11000 }));
  assert.throws(() => harness.runtime.evaluate(Harness.makeProbe({ elapsedMs: 12000 })),
    /not owned/);
  assert.equal(harness.runtime.snapshot().phase, 'cleaned');

  const roulette = Harness.createHarness({ eventId: 'roulette-table', eventClass: 'wildcard',
    resolveCollider(collider) {
      const transform = Object.assign({}, collider.transform);
      if (collider.name === 'object') transform.x += 0.5;
      return { transform, bounds: collider.bounds, evidence: collider.evidence };
    } });
  arm(roulette.runtime, Harness.makeStep({ elapsedMs: 2000 }));
  roulette.runtime.contact(Harness.makeContact());
  assert.throws(() => roulette.runtime.evaluate(Harness.makeProbe({ elapsedMs: 2000 })),
    /wheel\/object transforms/);

  const mistimed = Harness.createHarness({ eventId: 'plinko', eventClass: 'wildcard' });
  arm(mistimed.runtime, Harness.makeStep({ elapsedMs: 11000 }));
  mistimed.runtime.contact(Harness.makeContact({ elapsedMs: 10000 }));
  assert.throws(() => mistimed.runtime.evaluate(Harness.makeProbe({ elapsedMs: 11000 })),
    /slot, timing, or transform evidence/);

  const mitosis = Harness.createHarness({ eventId: 'mitosis', eventClass: 'assist',
    resolveCollider(collider) {
      const evidence = Object.assign({}, collider.evidence);
      if (collider.name === 'primary') evidence.validLanding = false;
      return { transform: collider.transform, bounds: collider.bounds, evidence };
    } });
  arm(mitosis.runtime, Harness.makeStep({ elapsedMs: 2000 }));
  mitosis.runtime.contact(Harness.makeContact());
  assert.throws(() => mitosis.runtime.evaluate(Harness.makeProbe({ elapsedMs: 2000 })),
    /collider landing verdicts/);

  const capToss = Harness.createHarness({ eventId: 'cap-toss', eventClass: 'hazard',
    resolveCollider(collider) {
      const evidence = Object.assign({}, collider.evidence);
      if (collider.name === 'top') evidence.validLanding = false;
      return { transform: collider.transform, bounds: collider.bounds, evidence };
    } });
  arm(capToss.runtime, Harness.makeStep({ elapsedMs: 2000 }));
  capToss.runtime.contact(Harness.makeContact());
  assert.throws(() => capToss.runtime.evaluate(Harness.makeProbe({ elapsedMs: 2000 })),
    /collider landing verdicts/);
}

function makeAdapterFor(issued, namespace, resolvedThrough = 0) {
  return RulesAdapter.createRulesAdapter({ namespace, resolvedThrough,
    authority: issued.authority.rules });
}

function testRulesIdentityAuthorityAndExactTeamMappings() {
  const issued = issue('rainbow-corkscrew');
  const namespace = 'v112.classic.identity-test';
  const adapter = makeAdapterFor(issued, namespace);
  const firstIdentity = identity(namespace, 1, 'flip-a');
  const first = adapter.resolve({ resolutionIdentity: firstIdentity,
    formatId: 'classic', outcome: issued.outcome });
  assert.equal(first.claimed, true);
  assert.equal(first.rulesInput.effects.additiveLives, 1);
  const duplicate = adapter.resolve({ resolutionIdentity: firstIdentity,
    formatId: 'classic', outcome: issued.outcome });
  assert.equal(duplicate.claimed, false);
  assert.equal(duplicate.rulesInput, null);
  assert.throws(() => adapter.resolve({ resolutionIdentity: identity(namespace, 3),
    formatId: 'classic', outcome: issued.outcome }), /future|reordered/);
  assert.throws(() => adapter.resolve({ resolutionIdentity: Object.freeze(Object.assign({},
    identity(namespace, 2), { token: '0000000000000000' })),
    formatId: 'classic', outcome: issued.outcome }), /token or id is invalid/);
  assert.throws(() => adapter.resolve({ resolutionIdentity: identity('foreign', 2),
    formatId: 'classic', outcome: issued.outcome }), /Foreign/);
  issued.harness.runtime.cleanup('done');
}

function testRulesAdapterSequentialAndForgedOutcomes() {
  // One authority must issue both outcomes for a real match; use runtime issuance
  // directly only through the harness runtimes sharing that authority.
  const sharedAuthority = Kernel.createAuthority();
  const a = Harness.createHarness({ eventId: 'rainbow-corkscrew', authority: sharedAuthority });
  const b = Harness.createHarness({ eventId: 'heart-rush', eventClass: 'assist', authority: sharedAuthority });
  const outA = Harness.drive(a.runtime).outcome;
  const outB = Harness.drive(b.runtime).outcome;
  const namespace = 'v112.classic.sequential';
  const adapter = RulesAdapter.createRulesAdapter({ namespace, authority: sharedAuthority.rules });
  adapter.resolve({ resolutionIdentity: identity(namespace, 1), formatId: 'classic', outcome: outA });
  assert.throws(() => adapter.resolve({ resolutionIdentity: identity(namespace, 1),
    formatId: 'classic', outcome: outB }), /stale|reordered/,
  'the last identity cannot be replayed with a different issued outcome');
  adapter.resolve({ resolutionIdentity: identity(namespace, 2), formatId: 'classic', outcome: outB });
  assert.throws(() => adapter.resolve({ resolutionIdentity: identity(namespace, 1),
    formatId: 'classic', outcome: outA }), /stale|reordered/);
  assert.equal(adapter.snapshot().resolvedThrough, 2);
  assert.equal(adapter.snapshot().nextOrdinal, 3);
  assert.throws(() => adapter.resolve({ resolutionIdentity: identity(namespace, 3),
    formatId: 'classic', outcome: outA }), /already consumed/);
  const forged = Kernel.immutableData(clone(outA), 'forged runtime outcome');
  assert.throws(() => adapter.resolve({ resolutionIdentity: identity(namespace, 3),
    formatId: 'classic', outcome: forged }), /kernel-issued/);
  assert.throws(() => adapter.resolve({ resolutionIdentity: identity(namespace, 3),
    formatId: 'classic', outcome: outA, result: 'MAKE' }), /unsupported field/);
  const closed = adapter.cleanup();
  assert.equal(closed.closed, true);
  assert.throws(() => adapter.resolve({ resolutionIdentity: identity(namespace, 3),
    formatId: 'classic', outcome: outA }), /closed/);
}

function testEveryCanonicalEventRulesBoundary() {
  let terminalCount = 0;
  Kernel.EVENT_IDS.forEach((eventId, index) => {
    const issued = issue(eventId);
    const namespace = `v112.classic.all-${index}`;
    const adapter = makeAdapterFor(issued, namespace);
    const result = adapter.resolve({ resolutionIdentity: identity(namespace, 1),
      formatId: 'classic', outcome: issued.outcome });
    assert.equal(result.claimed, true);
    assert.equal(result.eventId, eventId);
    assert.equal(result.rulesInput.effects.metadata.eventId, eventId);
    if (result.terminalOutcome) terminalCount += 1;
    issued.harness.runtime.cleanup('done');
  });
  assert.equal(terminalCount, 1, 'Plinko is the only event with a terminal automatic result');
}

function teamMapping(eventId, facts, probe = {}) {
  const shared = Kernel.createAuthority();
  const harness = Harness.createHarness({ eventId, eventClass: Kernel.EVENT_CLASS_BY_ID[eventId],
    facts, authority: shared });
  const outcome = Harness.drive(harness.runtime, { probe }).outcome;
  const namespace = `v112.team-clash.${eventId}`;
  const adapter = RulesAdapter.createRulesAdapter({ namespace, authority: shared.rules });
  return adapter.resolve({ resolutionIdentity: identity(namespace, 1),
    formatId: 'team-clash', outcome });
}

function testTeamRuleCompatibility() {
  const shrinkUpright = teamMapping('shrink-ray', Harness.DEFAULT_FACTS['shrink-ray']);
  assert.equal(shrinkUpright.rulesInput.rawPoints, 2);
  assert.equal(shrinkUpright.rulesInput.effects.additivePoints, undefined);
  const shrinkCap = teamMapping('shrink-ray', Harness.DEFAULT_FACTS['shrink-ray'], { pose: 'cap' });
  assert.equal(shrinkCap.rulesInput.rawPoints, 3);

  const twoCopies = Object.assign({}, Harness.DEFAULT_FACTS.mitosis, {
    primaryLanded: true, secondaryLanded: true, landedCopies: 2,
  });
  const mitosis = teamMapping('mitosis', twoCopies);
  assert.equal(mitosis.rulesInput.rawPoints, 3);
  assert.equal(mitosis.rulesInput.effects.additivePoints, undefined);

  function applyOnRealRules(eventId, facts, probe, matchId) {
    const shared = Kernel.createAuthority();
    const harness = Harness.createHarness({ eventId,
      eventClass: Kernel.EVENT_CLASS_BY_ID[eventId], facts, authority: shared });
    const eventOutcome = Harness.drive(harness.runtime, { probe }).outcome;
    const initial = Rules.createTeamClashState({ matchId, players: players(2) });
    const resolutionIdentity = Rules.nextResolutionIdentity(initial, `${eventId}-compat`);
    const adapter = RulesAdapter.createRulesAdapter({ namespace: initial.resolutionIdentity.namespace,
      authority: shared.rules });
    const mapped = adapter.resolve({ resolutionIdentity, formatId: 'team-clash',
      outcome: eventOutcome });
    return Rules.resolveTeamFlip(initial, Object.assign({ playerId: initial.turn.current,
      resolutionIdentity }, mapped.rulesInput));
  }
  assert.equal(applyOnRealRules('shrink-ray', Harness.DEFAULT_FACTS['shrink-ray'], {},
    'shrink-upright').outcome.rawPoints, 2);
  assert.equal(applyOnRealRules('shrink-ray', Harness.DEFAULT_FACTS['shrink-ray'], { pose: 'cap' },
    'shrink-cap').outcome.rawPoints, 3);
  assert.equal(applyOnRealRules('mitosis', twoCopies, {}, 'mitosis-two').outcome.rawPoints, 3);

  const plinkoFacts = Object.assign({}, Harness.DEFAULT_FACTS.plinko, { slotIndex: 1 });
  const plinko = teamMapping('plinko', plinkoFacts);
  assert.equal(plinko.rulesInput.effects.halveOpponentScore, true);
  assert.equal(plinko.rulesInput.effects.halveOpponentRound, undefined);

  let state = Rules.createTeamClashState({ matchId: 'adapter-integration', players: players(2) });
  // Give team 0 nine match points so the next round begins with team 1, whose
  // Plinko effect can demonstrate opponent match-score halving through v112-rules.
  for (let index = 0; index < 6; index += 1) {
    const currentTeam = state.queue[state.queuePosition].teamIndex;
    const transition = Rules.resolveTeamFlip(state, { playerId: state.turn.current,
      result: currentTeam === 0 ? 'MAKE' : 'MISS', rawPoints: currentTeam === 0 ? 3 : 0 });
    state = transition.state;
  }
  assert.deepEqual(state.scores, [9, 0]);
  assert.equal(state.queue[state.queuePosition].teamIndex, 1);
  const shared = Kernel.createAuthority();
  const plinkoHarness = Harness.createHarness({ eventId: 'plinko', eventClass: 'wildcard',
    facts: plinkoFacts, authority: shared });
  const outcome = Harness.drive(plinkoHarness.runtime).outcome;
  const realAdapter = RulesAdapter.createRulesAdapter({ namespace: state.resolutionIdentity.namespace,
    resolvedThrough: state.sequence, authority: shared.rules });
  const resolutionIdentity = Rules.nextResolutionIdentity(state, 'plinko-halving');
  const mapped = realAdapter.resolve({ resolutionIdentity, formatId: 'team-clash', outcome });
  const applied = Rules.resolveTeamFlip(state, Object.assign({ playerId: state.turn.current,
    resolutionIdentity }, mapped.rulesInput));
  assert.equal(applied.state.scores[0], 5, 'opponent match score halves upward through v112-rules');

  const lifeDrain = issue('life-drain');
  const drainAdapter = makeAdapterFor(lifeDrain, 'v112.team-clash.life-drain');
  assert.throws(() => drainAdapter.resolve({
    resolutionIdentity: identity('v112.team-clash.life-drain', 1),
    formatId: 'team-clash', outcome: lifeDrain.outcome }), /excluded/);
}

function testBrowserUmdSurfaces() {
  const context = vm.createContext({ console });
  const files = [
    '../js/v112-event-kernel.js', '../js/v112-event-runtime.js',
    '../js/v112-event-rules-adapter.js', '../js/v112-event-renderer.js',
    './lib/v112-event-harness.js',
  ];
  files.forEach(relative => {
    const filename = path.resolve(__dirname, relative);
    vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  });
  assert.equal(context.FlipgameV112EventKernel.schema, 'FlipgameEventKernelV2');
  assert.equal(context.FlipgameV112EventRuntime.schema, 'FlipgameEventRuntimeV2');
  assert.equal(context.FlipgameV112EventRulesAdapter.schema, 'FlipgameEventRulesAdapterV2');
  assert.equal(context.FlipgameV112EventRenderer.schema, 'FlipgameEventRendererV2');
  assert.equal(context.FlipgameV112EventHarness.schema, 'FlipgameEventHarnessV2');
}

function run() {
  testCanonicalContractsAndUntrustedData();
  testStrictDeterministicRngAndSelectionConsumption();
  testStaticAndDynamicAmbientRandomProhibition();
  testEvaluationLifecycleAndRuntimeOwnedVerdict();
  testContactOrderingDeduplicationAndBounds();
  testResourceOwnershipAndHostileCleanup();
  testResizeSemanticsAndBoundedRetirement();
  testLaneRuntimeIsolation();
  testColliderBackedFramesReducedMotionAndRenderer();
  testNarrowDirectiveFrameFactAndSizeSchemas();
  testHighValueColliderOwnership();
  testRulesIdentityAuthorityAndExactTeamMappings();
  testRulesAdapterSequentialAndForgedOutcomes();
  testEveryCanonicalEventRulesBoundary();
  testTeamRuleCompatibility();
  testBrowserUmdSurfaces();
  console.log('v1.12 event kernel adversarial tests passed.');
}

run();
