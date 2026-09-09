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

function assertSameData(actual, expected, message) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);
}

function players(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`, name: `Player ${index + 1}`, isAI: false,
  }));
}

let authoritySequence = 0;
const RULES_BY_AUTHORITY = new WeakMap();
function authorityFor(formatId = 'classic', matchId, count = 2) {
  const rules = Rules.createRulesAdapter({ formatId,
    matchId: matchId || `event-authority-${++authoritySequence}`, players: players(count) });
  const authority = rules.claimEventAuthority();
  RULES_BY_AUTHORITY.set(authority, rules);
  return authority;
}
function rulesFor(authority) {
  const rules = RULES_BY_AUTHORITY.get(authority);
  if (!rules) throw new Error('Test authority has no Rules owner');
  return rules;
}
function liveIdentity(authority, outcome) {
  return rulesFor(authority).nextResolutionIdentity(outcome.launchClaimId);
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
  const lane = authority.createLane(laneId);
  return Object.assign({ laneId, packs: [pack], authority: lane.runtime,
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

function plinkoFacts(overrides = {}) {
  return Object.assign({}, Harness.DEFAULT_FACTS.plinko, overrides);
}
function plinkoElapsed(facts) {
  return Kernel.PLINKO_TRANSPORT.boardDropStartMs + facts.dropDurationMs;
}

function drivePlinko(authority, laneId, facts, probe = {}) {
  const harness = Harness.createHarness({ eventId: 'plinko', eventClass: 'wildcard',
    authority, laneId, facts,
    evaluate: facts.completionKind === 'no-contest' ? landing => Kernel.immutableData({
      result: landing.result, pose: landing.pose, reason: landing.reason, facts,
    }, 'Plinko no-contest evaluation') : undefined });
  const outcome = Harness.drive(harness.runtime, {
    step: Harness.makeStep({ elapsedMs: plinkoElapsed(facts) }),
    probe: Object.assign({ elapsedMs: plinkoElapsed(facts) }, probe),
  }).outcome;
  return { harness, outcome };
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
  const authority = authorityFor();
  const missingLane = authority.createLane('missing');
  assert.throws(() => Runtime.createEventRuntime({ laneId: 'missing', packs: [pack],
    authority: missingLane.runtime }), /collider resolver/);
  const runtime = Runtime.createEventRuntime(runtimeOptions(pack, 'inherited-registry', authority));
  const inheritedSelection = Object.assign({}, Harness.makeSelection('rainbow-corkscrew', 'assist', 1),
    { eventId: 'toString' });
  assert.throws(() => runtime.issueSelection(inheritedSelection), /Unknown canonical/);
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
  const authority = authorityFor();
  const runtime = Runtime.createEventRuntime(runtimeOptions(pack, 'selection-lane', authority));
  runtime.bind(runtime.issueSelection(Harness.makeSelection('rainbow-corkscrew', 'assist', 77,
    { turnSeed: 999 })),
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
  const consumedRuntime = Runtime.createEventRuntime(runtimeOptions(pack, 'consumed', authorityFor()));
  assert.throws(() => consumedRuntime.issueSelection(consumed), /Consumed/);
  const stringSeedRuntime = Runtime.createEventRuntime(runtimeOptions(pack, 'string-seed', authorityFor()));
  assert.throws(() => stringSeedRuntime.issueSelection(
    Harness.makeSelection('rainbow-corkscrew', 'assist', '12')),
  /number primitive|safe integer/);
  const stringTurnRuntime = Runtime.createEventRuntime(runtimeOptions(pack, 'string-turn', authorityFor()));
  assert.throws(() => stringTurnRuntime.issueSelection(
    Harness.makeSelection('rainbow-corkscrew', 'assist', 12, { turnSeed: '1' })),
  /number primitive|safe integer/);

  const selected = ExistingEvents.select({ activityId: 'practice', physicsModeId: 'normal',
    forceName: 'Wind Tunnel', playerName: 'Tester', seed: 42 });
  const compatibility = Harness.makePack({ eventClass: 'hazard', ids: ['wind-tunnel'] });
  const compatibilityAuthority = authorityFor();
  const compatibleRuntime = Runtime.createEventRuntime(runtimeOptions(compatibility,
    'actual-event-selection', compatibilityAuthority));
  compatibleRuntime.bind(compatibleRuntime.issueSelection(selected), Harness.makeContext());
  assert.equal(compatibleRuntime.snapshot().eventId, 'wind-tunnel');
  compatibleRuntime.cleanup('done');

  const duplicateRoot = authorityFor('classic', 'duplicate-lane-root');
  duplicateRoot.createLane('one-lane');
  assert.throws(() => duplicateRoot.createLane('one-lane'), /Duplicate lane ID/,
    'lane IDs are unique within a match root');

  const selectionRoot = authorityFor('classic', 'selection-authority-root');
  const sourceLane = selectionRoot.createLane('selection-source');
  const targetLane = selectionRoot.createLane('selection-target');
  const sourceRuntime = Runtime.createEventRuntime({ laneId: 'selection-source', packs: [pack],
    authority: sourceLane.runtime, resolveCollider() { return {}; } });
  const targetRuntime = Runtime.createEventRuntime({ laneId: 'selection-target', packs: [pack],
    authority: targetLane.runtime, resolveCollider() { return {}; } });
  const raw = Harness.makeSelection('rainbow-corkscrew', 'assist', 91);
  assert.throws(() => sourceRuntime.bind(raw, Harness.makeContext()), /not issued/,
    'a structural EventSelectionV2 is not an authority token');
  const branded = sourceLane.issueSelection(raw);
  assert.throws(() => targetRuntime.bind(branded, Harness.makeContext()), /different match or lane/);
  assert.throws(() => targetLane.issueSelection(raw), /already issued/,
    'the exact registry selection object can be branded only once');
  sourceRuntime.bind(branded, Harness.makeContext());
  assert.throws(() => Kernel.claimSelection(sourceLane.runtime, branded,
    'rainbow-corkscrew', 'assist'), /already consumed/);
  sourceRuntime.cleanup('done');
  targetRuntime.cleanup('done');

  const sameClaimA = Harness.createHarness({ matchId: 'claim-a', laneId: 'same-lane',
    eventSeed: 444 });
  const sameClaimB = Harness.createHarness({ matchId: 'claim-b', laneId: 'same-lane',
    eventSeed: 444 });
  sameClaimA.runtime.telegraph();
  sameClaimB.runtime.telegraph();
  const claimA = sameClaimA.runtime.qualifyLaunch(Harness.makeSignal()).launchClaim;
  const claimB = sameClaimB.runtime.qualifyLaunch(Harness.makeSignal()).launchClaim;
  assert.notEqual(claimA.claimId, claimB.claimId,
    'same event, lane, and seed still receive globally unique opaque launch claims');
  sameClaimA.runtime.cleanup('done');
  sameClaimB.runtime.cleanup('done');
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
  const runtime = Runtime.createEventRuntime(runtimeOptions(dynamic, 'random-lane', authorityFor()));
  assert.throws(() => runtime.bind(runtime.issueSelection(
    Harness.makeSelection('rainbow-corkscrew', 'assist', 4)),
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

  [
    function () { return Date.now(); },
    function () { return new Date(); },
    function () { return performance.now(); },
    function () { return crypto.getRandomValues(new Uint32Array(1)); },
  ].forEach((callback, index) => {
    assert.throws(() => Kernel.definePack({ eventClass: 'assist',
      ids: ['rainbow-corkscrew'], create: callback }), /ambient random|clock sources/,
    `ambient clock/random source ${index} is rejected at authoring time`);
  });

  const deterministic = Harness.makePack({ eventClass: 'assist',
    ids: ['rainbow-corkscrew'] });
  assert.equal(Harness.assertDeterministicReplay({ pack: deterministic }).schema,
    'EventDeterministicReplayV1');

  let capturedClosureState = 0;
  const closurePack = Harness.makePack({ eventClass: 'assist',
    ids: ['rainbow-corkscrew'], launch() {
      capturedClosureState += 1;
      return { impulses: [{ entityRef: 'body:flipper-main',
        x: capturedClosureState, y: -1 }] };
    } });
  assert.throws(() => Harness.assertDeterministicReplay({ pack: closurePack }),
    /failed deterministic replay/,
  'qualification replay detects captured mutable closure state that static inspection cannot sandbox');
}

function arm(runtime, step = Harness.makeStep()) {
  runtime.telegraph();
  runtime.qualifyLaunch(Harness.makeSignal());
  runtime.launch(Harness.makeDraft());
  if (runtime.snapshot().eventId === 'plinko') {
    [Kernel.PLINKO_TRANSPORT.compressionEndMs,
      Kernel.PLINKO_TRANSPORT.releaseEndMs,
      Kernel.PLINKO_TRANSPORT.apexHandoffStartMs,
      Kernel.PLINKO_TRANSPORT.boardDropStartMs].forEach(elapsedMs => {
        if (elapsedMs < step.elapsedMs) {
          runtime.step(Harness.makeStep({ elapsedMs }));
        }
      });
  }
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
  })), /lane-owned collider/);
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
  const createAuthority = authorityFor();
  const createFailureRuntime = Runtime.createEventRuntime(runtimeOptions(createFailurePack,
    'create-failure', createAuthority));
  assert.throws(() => createFailureRuntime.bind(createFailureRuntime.issueSelection(
    Harness.makeSelection('rainbow-corkscrew', 'assist', 1)), Harness.makeContext()), error => {
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
  const authority = authorityFor();
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
  assert.equal(harness.trace.filter(item => item === 'frame:false').length, 1,
    'event behavior produces one authoritative mechanics frame');
  assert.equal(harness.trace.some(item => item === 'frame:true'), false,
    'reduced presentation never invokes a second behavior callback');
  const reduced = harness.runtime.frame(true);
  assert.equal(harness.trace.filter(item => item.startsWith('frame:')).length, 1,
    'both render requests reuse the single mechanics frame');
  assert.equal(Kernel.mechanicsSignature(full), Kernel.mechanicsSignature(reduced));
  assert.notDeepEqual(full.cues, reduced.cues);
  assert.equal(Object.isFrozen(full.entities[0].transform), true);

  const renderPack = EventRenderer.defineRenderPack({ eventClass: 'assist',
    ids: ['rainbow-corkscrew'], render() { return {}; } });
  const renderer = EventRenderer.createEventRenderer({ packs: [renderPack],
    authority: harness.laneAuthority.renderer });
  const plan = renderer.render(full);
  assert.equal(JSON.stringify(plan.commands[0].transform), JSON.stringify(full.entities[0].transform));
  assert.equal(JSON.stringify(plan.commands[0].bounds), JSON.stringify(full.entities[0].bounds));
  assert.equal(plan.mechanicsSignature, Kernel.mechanicsSignature(full));
  assert.equal(Object.isFrozen(plan.commands[0]), true);

  const forged = Harness.makeFrame('rainbow-corkscrew', 'assist', 'lane-a');
  assert.throws(() => renderer.render(forged), /kernel-issued/);
  const otherAuthorityRenderer = EventRenderer.createEventRenderer({ packs: [renderPack],
    authority: authorityFor().createLane('lane-a').renderer });
  assert.throws(() => otherAuthorityRenderer.render(full), /kernel-issued/);

  const badRender = EventRenderer.defineRenderPack({ eventClass: 'assist',
    ids: ['rainbow-corkscrew'], render(frame) {
      const commands = frame.entities.map(entity => clone(entity));
      commands[0].transform.x += 1;
      return { commands };
    } });
  const badRenderer = EventRenderer.createEventRenderer({ packs: [badRender],
    authority: harness.laneAuthority.renderer });
  assert.throws(() => badRenderer.render(full), /diverges/);

  const mutationPack = EventRenderer.defineRenderPack({ eventClass: 'assist',
    ids: ['rainbow-corkscrew'], render(frame) {
      frame.entities[0].transform.x = -999;
      return {};
    } });
  assert.throws(() => EventRenderer.createEventRenderer({ packs: [mutationPack],
    authority: harness.laneAuthority.renderer }).render(full), TypeError);
  assert.equal(full.entities[0].transform.x, 640);

  const badCue = EventRenderer.defineRenderPack({ eventClass: 'assist',
    ids: ['rainbow-corkscrew'], render() {
      return { cues: [{ cueId: 'reward', bonusLives: 9 }] };
    } });
  assert.throws(() => EventRenderer.createEventRenderer({ packs: [badCue],
    authority: harness.laneAuthority.renderer }).render(full), /unsupported field/);

  const colliderCheat = Harness.createHarness({ resolveCollider(collider) {
    return { transform: Object.assign({}, collider.transform, { x: collider.transform.x + 1 }),
      bounds: collider.bounds };
  } });
  colliderCheat.runtime.telegraph();
  colliderCheat.runtime.qualifyLaunch(Harness.makeSignal());
  colliderCheat.runtime.launch(Harness.makeDraft());
  colliderCheat.runtime.step(Harness.makeStep());
  assert.throws(() => colliderCheat.runtime.frame(false), /authoritative collider/);

  const colliderless = Harness.createHarness({ frame(reduced, context, sequence) {
    const candidate = Harness.makeScopeFrame('rainbow-corkscrew', 'assist', context, sequence);
    candidate.entities[0].colliderRef = null;
    return candidate;
  } });
  arm(colliderless.runtime);
  assert.throws(() => colliderless.runtime.frame(false), /Physical EventFrame entity lacks a collider/);

  const omitted = Harness.createHarness({ eventId: 'mitosis', eventClass: 'assist',
    frame(reduced, context, sequence) {
      return Harness.makeFrame('mitosis', 'assist', context.scope.laneId,
        { sequence, entities: [Harness.makeScopeFrame('mitosis', 'assist', context,
          sequence).entities[0]] });
    } });
  arm(omitted.runtime);
  assert.throws(() => omitted.runtime.frame(false), /omitted an owned physical collider/);

  const duplicateCollider = Harness.createHarness({ frame(reduced, context, sequence) {
    const candidate = Harness.makeScopeFrame('rainbow-corkscrew', 'assist', context, sequence);
    const duplicateEntity = clone(candidate.entities[0]);
    duplicateEntity.entityId = 'duplicate-main';
    candidate.entities.push(duplicateEntity);
    return candidate;
  } });
  arm(duplicateCollider.runtime);
  assert.throws(() => duplicateCollider.runtime.frame(false), /duplicates collider-backed entity/);

  const mutatingFrame = Harness.createHarness({ frame(reduced, context, sequence) {
    context.scope.getCollider('body:flipper-main').transform.x += 1;
    return Harness.makeScopeFrame('rainbow-corkscrew', 'assist', context, sequence);
  } });
  arm(mutatingFrame.runtime);
  assert.throws(() => mutatingFrame.runtime.frame(false), /mutated authoritative physics state/);

  const gameplayRngFrame = Harness.createHarness({ frame(reduced, context, sequence) {
    context.rng.sampleUint32(0, 'presentation-cheat');
    return Harness.makeScopeFrame('rainbow-corkscrew', 'assist', context, sequence);
  } });
  arm(gameplayRngFrame.runtime);
  assert.throws(() => gameplayRngFrame.runtime.frame(false), /Gameplay RNG cannot advance during frame/);

  let isolatedContext;
  const visualRngFrame = Harness.createHarness({
    onCreate(eventId, context) { isolatedContext = context; },
    frame(reduced, context, sequence) {
      const value = context.visualRng.floatAt(7, 'rainbow-particle');
      const candidate = Harness.makeScopeFrame('rainbow-corkscrew', 'assist', context, sequence);
      candidate.cues[0].intensity = value;
      return candidate;
    },
  });
  arm(visualRngFrame.runtime);
  const gameplayBeforeRender = isolatedContext.rng.snapshot().counter;
  const visualFull = visualRngFrame.runtime.frame(false);
  const visualReduced = visualRngFrame.runtime.frame(true);
  const isolatedRenderer = EventRenderer.createEventRenderer({ packs: [renderPack],
    authority: visualRngFrame.laneAuthority.renderer });
  isolatedRenderer.render(visualFull);
  isolatedRenderer.render(visualReduced);
  assert.equal(isolatedContext.rng.snapshot().counter, gameplayBeforeRender,
    'frame generation and rendering never advance gameplay RNG state');
  assert.equal(isolatedContext.visualRng.floatAt(7, 'rainbow-particle'),
    isolatedContext.visualRng.floatAt(7, 'rainbow-particle'),
  'visual RNG is counterless and explicitly indexed');
  visualRngFrame.runtime.cleanup('done');
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
    Harness.DEFAULT_FACTS['roulette-table'], { settled: false })), /settled sector evidence/);
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

function testPlinkoTrampolineOpeningTransport() {
  assert.deepEqual({ rows: Kernel.PLINKO_TRANSPORT.pegRows,
    minimum: Kernel.PLINKO_TRANSPORT.cleanDropMinMs,
    median: Kernel.PLINKO_TRANSPORT.cleanDropMedianMs,
    maximum: Kernel.PLINKO_TRANSPORT.cleanDropMaxMs },
  { rows: 24, minimum: 10000, median: 12000, maximum: 15000 });

  let authoredContext;
  const selected = Harness.createHarness({ eventId: 'plinko', eventClass: 'wildcard',
    laneId: 'plinko-opening-selected-object', eventSeed: 0x112,
    context: {
      appearance: { flipperId: 'coffee-mug', variantId: 'midnight-mocha' },
      physicsProfile: { id: 'standard', mass: 1,
        colliderRef: 'body:flipper-main', internalDynamicsRef: 'coffee-slosh' },
    },
    onCreate(_eventId, context) { authoredContext = context; },
  });
  selected.runtime.telegraph();
  selected.runtime.qualifyLaunch(Harness.makeSignal());
  const rngBeforeOpening = authoredContext.rng.snapshot().counter;
  const launch = selected.runtime.launch(Harness.makeDraft());
  assert.equal(launch.plinkoTransport.phase, 'compression');
  assert.equal(launch.plinkoTransport.flipperId, 'coffee-mug');
  assert.equal(launch.plinkoTransport.variantId, 'midnight-mocha');
  assert.equal(launch.plinkoTransport.physicsProfileId, 'standard');
  assert.equal(launch.plinkoTransport.objectColliderRef, 'body:flipper-main');
  assert.equal(launch.plinkoTransport.trampolineColliderRef,
    'body:plinko-opening-trampoline');
  assert.equal(launch.plinkoTransport.openingLateralImpulse, 0);
  assert.deepEqual(launch.impulses, []);
  const compressedFlipper = launch.bodies.find(body =>
    body.entityRef === 'body:flipper-main');
  const compressedTrampoline = launch.bodies.find(body =>
    body.entityRef === 'body:plinko-opening-trampoline');
  assert.equal(compressedFlipper.scaleX, Kernel.PLINKO_TRANSPORT.compressedScaleX);
  assert.equal(compressedFlipper.scaleY, Kernel.PLINKO_TRANSPORT.compressedScaleY);
  assert.equal(compressedTrampoline.scaleX,
    Kernel.PLINKO_TRANSPORT.trampolineCompressedScaleX);
  assert.equal(compressedTrampoline.scaleY,
    Kernel.PLINKO_TRANSPORT.trampolineCompressedScaleY);
  assert.equal(Object.hasOwn(compressedFlipper, 'mass'), false,
    'opening compression preserves competitive mass and internal dynamics');
  const compressionFrame = selected.runtime.frame(false);
  const selectedEntity = compressionFrame.entities.find(entity =>
    entity.colliderRef === 'body:flipper-main');
  assert.equal(selectedEntity.appearanceRef, 'coffee-mug:midnight-mocha');
  assert.equal(selectedEntity.visualStateRef, 'plinko-compression');
  const trampolineEntity = compressionFrame.entities.find(entity =>
    entity.entityId === 'plinko-opening-trampoline');
  assert.equal(trampolineEntity.visible, true);
  assert.equal(trampolineEntity.role, 'event-body');
  assert.equal(trampolineEntity.colliderRef, 'body:plinko-opening-trampoline',
    'the visible opening trampoline is a lane-owned physical body');
  assert.equal(compressionFrame.entities.find(entity =>
    entity.entityId === 'plinko-board-24').visible, false);

  const forgedCompression = Harness.createHarness({ eventId: 'plinko',
    eventClass: 'wildcard', laneId: 'plinko-forged-compression',
    launch(draft, context) {
      const transport = Kernel.derivePlinkoTransportState({ elapsedMs: 0,
        objectColliderRef: draft.bodyRef, flipperId: context.appearance.flipperId,
        variantId: context.appearance.variantId,
        physicsProfileId: context.physicsProfile.id });
      return { bodies: [{ entityRef: draft.bodyRef,
        scaleX: Kernel.PLINKO_TRANSPORT.compressedScaleX,
        scaleY: Kernel.PLINKO_TRANSPORT.compressedScaleY,
        velocity: { x: 75, y: 0 } },
      { entityRef: transport.trampolineColliderRef,
        scaleX: Kernel.PLINKO_TRANSPORT.trampolineCompressedScaleX,
        scaleY: Kernel.PLINKO_TRANSPORT.trampolineCompressedScaleY }],
      cameraCues: [{ cueId: 'forged-compression-camera',
        kind: 'plinko-trampoline-lock', entityRef: draft.bodyRef }],
      plinkoTransport: transport };
    } });
  forgedCompression.runtime.telegraph();
  forgedCompression.runtime.qualifyLaunch(Harness.makeSignal());
  assert.throws(() => forgedCompression.runtime.launch(Harness.makeDraft()),
    /visible physical trampoline compression/,
  'compression cannot overwrite the preexisting gesture velocity');
  assert.equal(forgedCompression.runtime.snapshot().phase, 'cleaned');
  Harness.assertNoLeaks(forgedCompression.runtime);

  const cameraTargets = [compressionFrame.plinkoTransport.cameraTargetRef];
  const release = selected.runtime.step(Harness.makeStep({ elapsedMs: 400 }));
  assert.equal(release.plinkoTransport.phase, 'release');
  const launchImpulse = release.impulses.find(impulse => impulse.y <=
    -Kernel.PLINKO_TRANSPORT.minimumUpwardImpulse);
  assert.ok(launchImpulse, 'trampoline release launches the selected Flipper dramatically upward');
  assert.equal(launchImpulse.x, 0, 'opening impulse cannot steer toward a favorable slot');
  assert.equal(launchImpulse.atX, null);
  assert.equal(launchImpulse.atY, null);
  assert.equal(release.bodies.some(body =>
    body.entityRef === 'body:plinko-opening-trampoline' &&
      body.scaleX === 1 && body.scaleY === 1), true,
  'the physical trampoline visibly rebounds as it releases the Flipper');
  cameraTargets.push(selected.runtime.frame(false).plinkoTransport.cameraTargetRef);

  const ascent = selected.runtime.step(Harness.makeStep({ elapsedMs: 900 }));
  assert.equal(ascent.plinkoTransport.phase, 'ascent');
  assert.equal(ascent.impulses.length, 0, 'the opening trampoline releases exactly once');
  cameraTargets.push(selected.runtime.frame(false).plinkoTransport.cameraTargetRef);

  const apex = selected.runtime.step(Harness.makeStep({ elapsedMs: 2200 }));
  assert.equal(apex.plinkoTransport.phase, 'apex-handoff');
  const apexFrame = selected.runtime.frame(false);
  assert.equal(apexFrame.plinkoTransport.cameraMode, 'apex-board-handoff');
  assert.equal(apexFrame.entities.find(entity => entity.entityId === 'plinko-board-24').visible,
    true, 'camera hands off to the top of the extended board at apex');
  cameraTargets.push(apexFrame.plinkoTransport.cameraTargetRef);

  const descent = selected.runtime.step(Harness.makeStep({
    elapsedMs: Kernel.PLINKO_TRANSPORT.boardDropStartMs }));
  assert.equal(descent.plinkoTransport.phase, 'board-descent');
  assert.equal(descent.plinkoTransport.pegRows, 24);
  const descentFull = selected.runtime.frame(false);
  const descentReduced = selected.runtime.frame(true);
  assert.equal(descentFull.plinkoTransport.cameraMode, 'object-drop-follow');
  assert.equal(JSON.stringify(descentReduced.plinkoTransport),
    JSON.stringify(descentFull.plinkoTransport),
  'reduced motion preserves the exact physical phase and camera target');
  assert.equal(Kernel.mechanicsSignature(descentReduced),
    Kernel.mechanicsSignature(descentFull));
  cameraTargets.push(descentFull.plinkoTransport.cameraTargetRef);
  assert.deepEqual(Array.from(new Set(cameraTargets)), ['body:flipper-main'],
    'camera continuity retains one selected-object target from compression through descent');

  const renderPack = EventRenderer.defineRenderPack({ eventClass: 'wildcard',
    ids: ['plinko'], render(frame, context) {
      assert.equal(context.plinkoTransport, frame.plinkoTransport);
      return {};
    } });
  const renderer = EventRenderer.createEventRenderer({ packs: [renderPack],
    authority: selected.laneAuthority.renderer });
  const renderPlan = renderer.render(descentReduced);
  assert.equal(renderPlan.plinkoTransport.pegRows, 24);
  assert.equal(renderPlan.plinkoTransport.cameraTargetRef, 'body:flipper-main');

  const phaseBeforeResize = selected.runtime.snapshot().plinkoTransport;
  const resize = selected.runtime.resize({ width: 3840, height: 2160, groundY: 1880 });
  assert.equal(resize.deferred, true);
  assert.equal(JSON.stringify(selected.runtime.snapshot().plinkoTransport),
    JSON.stringify(phaseBeforeResize),
  'airborne resize cannot re-time or replace the Plinko transport');

  const finalElapsed = Kernel.PLINKO_TRANSPORT.boardDropStartMs +
    Kernel.PLINKO_TRANSPORT.cleanDropMedianMs;
  selected.runtime.step(Harness.makeStep({ elapsedMs: finalElapsed }));
  selected.runtime.contact(Harness.makeContact({ elapsedMs: finalElapsed - 200 }));
  const outcome = selected.runtime.evaluate(Harness.makeProbe({ elapsedMs: finalElapsed }));
  assert.equal(outcome.facts.values.dropDurationMs, 12000);
  assert.equal(outcome.facts.values.objectColliderRef, 'body:flipper-main');
  assert.equal(authoredContext.rng.snapshot().counter, rngBeforeOpening,
    'compression, launch, camera and board handoff consume no slot RNG');
  selected.runtime.cleanup('plinko-opening-complete');
  assert.equal(selected.runtime.snapshot().plinkoTransport, null);
  assert.equal(selected.reflows.length, 1);
  Harness.assertNoLeaks(selected.runtime);

  const recoveryFacts = plinkoFacts({ completionKind: 'recovered',
    dropDurationMs: 22000, recoveryStartedMs: 22000, recoveryImpulseCount: 2 });
  const recovery = Harness.createHarness({ eventId: 'plinko', eventClass: 'wildcard',
    laneId: 'plinko-opening-recovery', facts: recoveryFacts });
  recovery.runtime.telegraph();
  recovery.runtime.qualifyLaunch(Harness.makeSignal());
  recovery.runtime.launch(Harness.makeDraft());
  recovery.runtime.step(Harness.makeStep({ elapsedMs: 400 }));
  recovery.runtime.step(Harness.makeStep({ elapsedMs: 650 }));
  recovery.runtime.step(Harness.makeStep({ elapsedMs: 2150 }));
  recovery.runtime.step(Harness.makeStep({ elapsedMs: 2400 }));
  const recoveryStep = recovery.runtime.step(Harness.makeStep({
    elapsedMs: plinkoElapsed(recoveryFacts) }));
  assert.equal(recoveryStep.plinkoTransport.phase, 'anti-wedge-recovery');
  assert.equal(recoveryStep.impulses.filter(impulse => Math.abs(impulse.x) === 2).length, 2,
    'anti-wedge recovery remains deterministic and physically represented');
  recovery.runtime.cleanup('recovery-covered');

  const skippedOpening = Harness.createHarness({ eventId: 'plinko',
    eventClass: 'wildcard', laneId: 'plinko-skipped-opening' });
  skippedOpening.runtime.telegraph();
  skippedOpening.runtime.qualifyLaunch(Harness.makeSignal());
  skippedOpening.runtime.launch(Harness.makeDraft());
  assert.throws(() => skippedOpening.runtime.step(Harness.makeStep({ elapsedMs: 900 })),
    /release window/,
  'a host cannot skip the physical trampoline release and fabricate ascent');
  assert.equal(skippedOpening.runtime.snapshot().phase, 'cleaned');
  Harness.assertNoLeaks(skippedOpening.runtime);

  function forgedReleaseStep(kind) {
    return function (physicsStep, context) {
      const transport = Kernel.derivePlinkoTransportState({
        elapsedMs: physicsStep.elapsedMs, objectColliderRef: 'body:flipper-main',
        flipperId: context.appearance.flipperId,
        variantId: context.appearance.variantId,
        physicsProfileId: context.physicsProfile.id,
      });
      const objectBody = { entityRef: transport.objectColliderRef,
        scaleX: 1, scaleY: 1 };
      const trampolineBody = { entityRef: transport.trampolineColliderRef,
        scaleX: 1, scaleY: 1 };
      const impulses = [{ entityRef: transport.objectColliderRef, x: 0,
        y: -Kernel.PLINKO_TRANSPORT.releaseUpwardImpulse }];
      const forces = [];
      if (kind === 'teleport') objectBody.position = { x: 900, y: -500 };
      if (kind === 'x-velocity') objectBody.velocity = { x: 80, y: -28 };
      if (kind === 'mass') objectBody.mass = 0.01;
      if (kind === 'additional-impulse') {
        impulses.push({ entityRef: transport.objectColliderRef, x: 0, y: -2 });
      }
      if (kind === 'vertical-force') {
        forces.push({ entityRef: transport.objectColliderRef, x: 0, y: -500 });
      }
      return { bodies: [objectBody, trampolineBody], impulses, forces,
        cameraCues: [{ cueId: 'forged-release-camera-' + kind,
          kind: 'plinko-object-ascent-follow', entityRef: transport.objectColliderRef }],
        plinkoTransport: transport };
    };
  }

  ['teleport', 'x-velocity', 'mass', 'additional-impulse', 'vertical-force']
    .forEach(kind => {
      const forged = Harness.createHarness({ eventId: 'plinko',
        eventClass: 'wildcard', laneId: `plinko-forged-${kind}`,
        step: forgedReleaseStep(kind) });
      forged.runtime.telegraph();
      forged.runtime.qualifyLaunch(Harness.makeSignal());
      forged.runtime.launch(Harness.makeDraft());
      assert.throws(() => forged.runtime.step(Harness.makeStep({ elapsedMs: 400 })),
        /only its exact centered spring impulse and scale restores/,
      `Plinko release must reject ${kind} authority escalation`);
      assert.equal(forged.runtime.snapshot().phase, 'cleaned');
      Harness.assertNoLeaks(forged.runtime);
    });

  const repeatedSmall = Harness.createHarness({ eventId: 'plinko',
    eventClass: 'wildcard', laneId: 'plinko-repeated-small-impulse',
    step(physicsStep, context) {
      const transport = Kernel.derivePlinkoTransportState({
        elapsedMs: physicsStep.elapsedMs, objectColliderRef: 'body:flipper-main',
        flipperId: context.appearance.flipperId,
        variantId: context.appearance.variantId,
        physicsProfileId: context.physicsProfile.id,
      });
      const result = { cameraCues: [{ cueId: 'repeat-small-camera',
        kind: 'plinko-' + transport.cameraMode,
        entityRef: transport.objectColliderRef }], plinkoTransport: transport };
      if (physicsStep.elapsedMs === 400) {
        result.bodies = [{ entityRef: transport.objectColliderRef,
          scaleX: 1, scaleY: 1 }, { entityRef: transport.trampolineColliderRef,
          scaleX: 1, scaleY: 1 }];
        result.impulses = [{ entityRef: transport.objectColliderRef, x: 0,
          y: -Kernel.PLINKO_TRANSPORT.releaseUpwardImpulse }];
      } else {
        result.impulses = [{ entityRef: transport.objectColliderRef, x: 0, y: -1 }];
      }
      return result;
    } });
  repeatedSmall.runtime.telegraph();
  repeatedSmall.runtime.qualifyLaunch(Harness.makeSignal());
  repeatedSmall.runtime.launch(Harness.makeDraft());
  repeatedSmall.runtime.step(Harness.makeStep({ elapsedMs: 400 }));
  assert.throws(() => repeatedSmall.runtime.step(Harness.makeStep({ elapsedMs: 500 })),
    /single spring release/,
  'Plinko opening must reject repeated sub-threshold impulses');
  assert.equal(repeatedSmall.runtime.snapshot().phase, 'cleaned');
  Harness.assertNoLeaks(repeatedSmall.runtime);

  const biased = Harness.createHarness({ eventId: 'plinko', eventClass: 'wildcard',
    laneId: 'plinko-biased-opening', step(physicsStep, context) {
      return { impulses: [{ entityRef: 'body:flipper-main', x: 4, y: -28 }],
        bodies: [{ entityRef: 'body:flipper-main', scaleX: 1, scaleY: 1 }],
        cameraCues: [{ cueId: 'biased-camera', kind: 'plinko-object-ascent-follow',
          entityRef: 'body:flipper-main' }],
        plinkoTransport: Kernel.derivePlinkoTransportState({
          elapsedMs: physicsStep.elapsedMs, objectColliderRef: 'body:flipper-main',
          flipperId: context.appearance.flipperId, variantId: context.appearance.variantId,
          physicsProfileId: context.physicsProfile.id }) };
    } });
  biased.runtime.telegraph();
  biased.runtime.qualifyLaunch(Harness.makeSignal());
  biased.runtime.launch(Harness.makeDraft());
  assert.throws(() => biased.runtime.step(Harness.makeStep({ elapsedMs: 400 })),
    /exact centered spring impulse/,
  'an authored opening cannot steer toward a prize slot');

  const replayPack = Harness.makePack({ eventClass: 'wildcard', ids: ['plinko'],
    facts: Harness.DEFAULT_FACTS.plinko });
  const replay = Harness.assertDeterministicReplay({ pack: replayPack,
    eventId: 'plinko', eventSeed: 0xfeed,
    context: { appearance: { flipperId: 'snow-globe', variantId: 'polar-puff' },
      physicsProfile: { id: 'standard', mass: 1,
        colliderRef: 'body:flipper-main', internalDynamicsRef: 'snow-slosh' } } });
  assert.equal(replay.first.frame.plinkoTransport.flipperId, 'snow-globe');
  assert.equal(JSON.stringify(replay.first), JSON.stringify(replay.second));
}

function testHighValueColliderOwnership() {
  const badFacts = Object.assign({}, Harness.DEFAULT_FACTS.plinko,
    { objectColliderRef: 'body:not-owned' });
  const harness = Harness.createHarness({ eventId: 'plinko', eventClass: 'wildcard', facts: badFacts });
  arm(harness.runtime, Harness.makeStep({ elapsedMs: plinkoElapsed(badFacts) }));
  harness.runtime.contact(Harness.makeContact({ elapsedMs: 11000 }));
  assert.throws(() => harness.runtime.evaluate(Harness.makeProbe({
    elapsedMs: plinkoElapsed(badFacts) })),
    /not owned/);
  assert.equal(harness.runtime.snapshot().phase, 'cleaned');

  const roulette = Harness.createHarness({ eventId: 'roulette-table', eventClass: 'wildcard',
    resolveCollider(collider) {
      const transform = Object.assign({}, collider.transform);
      if (collider.name === 'object') Object.assign(transform, { x: 740, y: 300 });
      return { transform, bounds: collider.bounds, evidence: collider.evidence };
    } });
  arm(roulette.runtime, Harness.makeStep({ elapsedMs: 2000 }));
  roulette.runtime.contact(Harness.makeContact());
  assert.throws(() => roulette.runtime.evaluate(Harness.makeProbe({ elapsedMs: 2000 })),
    /authoritative wheel\/object geometry/);

  const mistimed = Harness.createHarness({ eventId: 'plinko', eventClass: 'wildcard' });
  arm(mistimed.runtime, Harness.makeStep({ elapsedMs: 11000 }));
  mistimed.runtime.contact(Harness.makeContact({ elapsedMs: 10000 }));
  assert.throws(() => mistimed.runtime.evaluate(Harness.makeProbe({ elapsedMs: 11000 })),
    /host timing evidence/);

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

  [10000, 15000].forEach(duration => {
    const facts = plinkoFacts({ dropDurationMs: duration });
    const boundary = Harness.createHarness({ eventId: 'plinko', eventClass: 'wildcard', facts,
      laneId: `clean-${duration}` });
    arm(boundary.runtime, Harness.makeStep({ elapsedMs: plinkoElapsed(facts) }));
    boundary.runtime.contact(Harness.makeContact({ elapsedMs: 800 }));
    const outcome = boundary.runtime.evaluate(Harness.makeProbe({
      elapsedMs: plinkoElapsed(facts) }));
    assert.equal(outcome.facts.values.completionKind, 'clean');
    boundary.runtime.cleanup('done');
  });

  const recoveredFacts = plinkoFacts({ completionKind: 'recovered',
    dropDurationMs: 22000, recoveryStartedMs: 22000, recoveryImpulseCount: 1 });
  const recovered = Harness.createHarness({ eventId: 'plinko', eventClass: 'wildcard',
    facts: recoveredFacts, laneId: 'recovered-at-boundary' });
  arm(recovered.runtime, Harness.makeStep({ elapsedMs: plinkoElapsed(recoveredFacts) }));
  recovered.runtime.contact(Harness.makeContact({ elapsedMs: 1000 }));
  assert.equal(recovered.runtime.evaluate(Harness.makeProbe({
    elapsedMs: plinkoElapsed(recoveredFacts) }))
    .facts.values.completionKind, 'recovered');
  recovered.runtime.cleanup('done');

  const lateCleanFacts = plinkoFacts({ dropDurationMs: 15001 });
  const lateClean = Harness.createHarness({ eventId: 'plinko', eventClass: 'wildcard',
    facts: lateCleanFacts, laneId: 'late-clean' });
  arm(lateClean.runtime, Harness.makeStep({ elapsedMs: plinkoElapsed(lateCleanFacts) }));
  lateClean.runtime.contact(Harness.makeContact({ elapsedMs: 1000 }));
  assert.throws(() => lateClean.runtime.evaluate(Harness.makeProbe({
    elapsedMs: plinkoElapsed(lateCleanFacts) })),
  /clean completion requires a settled 10-15 second sensor result/);

  const contradictorySlot = Harness.createHarness({ eventId: 'plinko', eventClass: 'wildcard',
    laneId: 'contradictory-slot', resolveCollider(collider) {
      const evidence = Object.assign({}, collider.evidence);
      if (collider.name === 'slot-4') evidence.sensorIndex = 5;
      return { transform: collider.transform, bounds: collider.bounds, evidence };
    } });
  arm(contradictorySlot.runtime, Harness.makeStep({
    elapsedMs: plinkoElapsed(Harness.DEFAULT_FACTS.plinko) }));
  contradictorySlot.runtime.contact(Harness.makeContact({ elapsedMs: 1000 }));
  assert.throws(() => contradictorySlot.runtime.evaluate(Harness.makeProbe({
    elapsedMs: plinkoElapsed(Harness.DEFAULT_FACTS.plinko) })),
    /supplied slot contradicts branded host sensor geometry/);

  const contradictoryRecovery = Harness.createHarness({ eventId: 'plinko', eventClass: 'wildcard',
    laneId: 'contradictory-recovery', facts: recoveredFacts,
    resolveCollider(collider) {
      const evidence = Object.assign({}, collider.evidence);
      if (collider.name === 'flipper-main') evidence.recoveryImpulseCount = 2;
      return { transform: collider.transform, bounds: collider.bounds, evidence };
    } });
  arm(contradictoryRecovery.runtime, Harness.makeStep({
    elapsedMs: plinkoElapsed(recoveredFacts) }));
  contradictoryRecovery.runtime.contact(Harness.makeContact({ elapsedMs: 1000 }));
  assert.throws(() => contradictoryRecovery.runtime.evaluate(
    Harness.makeProbe({ elapsedMs: plinkoElapsed(recoveredFacts) })),
  /recovery facts contradict host provenance/);
}

function ownerRules(issued) {
  return issued.harness.rules || rulesFor(issued.authority);
}
function makeAdapterFor(issued) {
  return RulesAdapter.createRulesAdapter({ authority: issued.authority.rules });
}
function resolveIssued(issued, adapter) {
  const identity = ownerRules(issued).nextResolutionIdentity(issued.outcome.launchClaimId);
  return { identity, resolution: adapter.resolve({ resolutionIdentity: identity,
    outcome: issued.outcome }) };
}

function testRulesIdentityAuthorityAndExactTeamMappings() {
  assert.throws(() => Kernel.createAuthority({ matchCapability: {
    schema: 'RulesEventMatchCapabilityV1' } }), /Rules-issued/);
  assert.throws(() => Runtime.createEventRuntime({ laneId: 'fake', packs: [Harness.makePack({})],
    authority: { schema: 'EventRuntimeAuthorityV2' }, resolveCollider() {} }), /not issued/);
  assert.throws(() => RulesAdapter.createRulesAdapter({ authority: {
    schema: 'EventRulesAuthorityV2' } }), /not issued/);

  const issued = issue('rainbow-corkscrew');
  const adapter = makeAdapterFor(issued);
  assert.throws(() => RulesAdapter.createRulesAdapter({ authority: issued.authority.rules }),
    /already has/);
  const first = resolveIssued(issued, adapter);
  assert.equal(first.resolution.claimed, true);
  assert.equal(first.resolution.rulesInput.effects.additiveLives, 1);
  assert.equal(first.resolution.transition.state.sequence, 1);
  const duplicate = adapter.resolve({ resolutionIdentity: first.identity, outcome: issued.outcome });
  assert.equal(duplicate.claimed, false);
  assert.equal(duplicate.rulesInput, null);

  const corrupt = clone(first.identity);
  corrupt.token = '0000000000000000';
  const second = issue('heart-rush');
  assert.throws(() => adapter.resolve({ resolutionIdentity: corrupt, outcome: second.outcome }),
    /another match|token|identity|consumed/);
  assert.throws(() => adapter.resolve({ resolutionIdentity: first.identity,
    outcome: issued.outcome, formatId: 'team-clash' }), /unsupported field/,
  'format is immutable and cannot be supplied per resolution');
  issued.harness.runtime.cleanup('done');
  second.harness.runtime.cleanup('done');
}

function testRulesAdapterSequentialAndForgedOutcomes() {
  const sharedAuthority = authorityFor('classic', 'sequential');
  const a = Harness.createHarness({ eventId: 'rainbow-corkscrew', laneId: 'lane-a',
    authority: sharedAuthority });
  const b = Harness.createHarness({ eventId: 'heart-rush', eventClass: 'assist', laneId: 'lane-b',
    authority: sharedAuthority });
  const c = Harness.createHarness({ eventId: 'mirror-match', eventClass: 'wildcard', laneId: 'lane-c',
    authority: sharedAuthority });
  const outA = Harness.drive(a.runtime).outcome;
  const outB = Harness.drive(b.runtime).outcome;
  const outC = Harness.drive(c.runtime).outcome;
  const rules = rulesFor(sharedAuthority);
  const adapter = RulesAdapter.createRulesAdapter({ authority: sharedAuthority.rules });
  const idA = rules.nextResolutionIdentity(outA.launchClaimId);
  adapter.resolve({ resolutionIdentity: idA, outcome: outA });
  const idB = rules.nextResolutionIdentity(outB.launchClaimId);
  assert.throws(() => adapter.resolve({ resolutionIdentity: idA, outcome: outB }),
    /not bound|stale|identity/);
  adapter.resolve({ resolutionIdentity: idB, outcome: outB });
  assert.equal(adapter.snapshot().resolvedThrough, 2);
  assert.equal(adapter.snapshot().nextOrdinal, 3);

  const idC = rules.nextResolutionIdentity(outC.launchClaimId);
  const firstDeferred = adapter.resolve({ resolutionIdentity: idC, outcome: outC });
  assert.equal(firstDeferred.deferred.kind, 'mirror-match');
  const duplicateDeferred = adapter.resolve({ resolutionIdentity: idC, outcome: outC });
  assert.equal(duplicateDeferred.claimed, false);
  assert.equal(duplicateDeferred.deferred, null,
    'duplicate event results must never re-emit an actionable deferred effect');
  assert.equal(duplicateDeferred.rulesInput, null);
  assert.equal(duplicateDeferred.terminalOutcome, null);
  assert.equal(duplicateDeferred.noContest, false);
  assert.equal(adapter.snapshot().resolvedThrough, 3);
  assert.equal(adapter.snapshot().nextOrdinal, 4);
  const replayIdentity = rules.nextResolutionIdentity(outA.launchClaimId);
  assert.throws(() => adapter.resolve({ resolutionIdentity: replayIdentity, outcome: outA }),
    /already consumed/);
  const forged = Kernel.immutableData(clone(outA), 'forged runtime outcome');
  assert.throws(() => adapter.resolve({ resolutionIdentity: replayIdentity, outcome: forged }),
    /not issued/);

  const foreignAuthority = authorityFor('classic', 'foreign-match');
  const foreignAdapter = RulesAdapter.createRulesAdapter({ authority: foreignAuthority.rules });
  assert.throws(() => foreignAdapter.resolve({
    resolutionIdentity: rulesFor(foreignAuthority).nextResolutionIdentity(outA.launchClaimId),
    outcome: outA }), /another match/);
  const closed = adapter.cleanup();
  assert.equal(closed.closed, true);
  assert.throws(() => adapter.resolve({ resolutionIdentity: idB, outcome: outB }), /closed/);
}

function testEveryCanonicalEventRulesBoundary() {
  let terminalCount = 0;
  Kernel.EVENT_IDS.forEach(eventId => {
    const issued = issue(eventId);
    const adapter = makeAdapterFor(issued);
    const result = resolveIssued(issued, adapter).resolution;
    assert.equal(result.claimed, true);
    assert.equal(result.eventId, eventId);
    if (result.rulesInput) assert.equal(result.rulesInput.effects.metadata.eventId, eventId);
    if (result.terminalOutcome) terminalCount += 1;
    assert.equal(result.transition.schema, 'RulesTransitionV1');
    issued.harness.runtime.cleanup('done');
  });
  assert.equal(terminalCount, 1, 'Plinko is the only event with a terminal automatic result');
}

function teamMapping(eventId, facts, probe = {}) {
  const shared = authorityFor('team-clash', `team-${eventId}-${++authoritySequence}`);
  const harness = Harness.createHarness({ eventId, laneId: `lane-${authoritySequence}`,
    eventClass: Kernel.EVENT_CLASS_BY_ID[eventId], facts, authority: shared });
  const outcome = Harness.drive(harness.runtime, { probe }).outcome;
  const adapter = RulesAdapter.createRulesAdapter({ authority: shared.rules });
  return adapter.resolve({ resolutionIdentity: rulesFor(shared).nextResolutionIdentity(
    outcome.launchClaimId), outcome });
}

function testTeamRuleCompatibility() {
  const shrinkUpright = teamMapping('shrink-ray', Harness.DEFAULT_FACTS['shrink-ray']);
  assert.equal(shrinkUpright.rulesInput.rawPoints, 2);
  assert.equal(shrinkUpright.transition.outcome.rawPoints, 2);
  const shrinkCap = teamMapping('shrink-ray', Harness.DEFAULT_FACTS['shrink-ray'], { pose: 'cap' });
  assert.equal(shrinkCap.transition.outcome.rawPoints, 3);

  const twoCopies = Object.assign({}, Harness.DEFAULT_FACTS.mitosis, {
    primaryLanded: true, secondaryLanded: true, landedCopies: 2,
  });
  const mitosis = teamMapping('mitosis', twoCopies);
  assert.equal(mitosis.transition.outcome.rawPoints, 3);

  const plinkoFacts = Object.assign({}, Harness.DEFAULT_FACTS.plinko, { slotIndex: 1 });
  const plinko = teamMapping('plinko', plinkoFacts);
  assert.equal(plinko.rulesInput.effects.halveOpponentScore, true);

  const teamRules = Rules.createRulesAdapter({ formatId: 'team-clash',
    matchId: 'adapter-integration', players: players(2) });
  assert.throws(() => teamRules.resolveFlip({ result: 'MAKE', rawPoints: 99 }),
    /cannot apply event field/);
  for (let index = 0; index < 18; index += 1) {
    const state = teamRules.snapshot();
    const currentTeam = state.queue[state.queuePosition].teamIndex;
    teamRules.resolveFlip({ playerId: state.turn.current,
      result: currentTeam === 0 ? 'MAKE' : 'MISS' });
  }
  assert.deepEqual(teamRules.snapshot().scores, [9, 0]);
  const shared = teamRules.claimEventAuthority();
  const plinkoHarness = Harness.createHarness({ eventId: 'plinko', eventClass: 'wildcard',
    facts: plinkoFacts, authority: shared, laneId: 'team-plinko' });
  const outcome = Harness.drive(plinkoHarness.runtime).outcome;
  const realAdapter = RulesAdapter.createRulesAdapter({ authority: shared.rules });
  const mapped = realAdapter.resolve({
    resolutionIdentity: teamRules.nextResolutionIdentity(outcome.launchClaimId), outcome });
  assert.equal(mapped.transition.state.scores[0], 5,
    'opponent match score halves upward through the live v112 rules capability');

  const drainRules = Rules.createRulesAdapter({ formatId: 'team-clash',
    matchId: 'life-drain-excluded', players: players(2) });
  const drainAuthority = drainRules.claimEventAuthority();
  const drainHarness = Harness.createHarness({ eventId: 'life-drain', eventClass: 'assist',
    authority: drainAuthority, laneId: 'drain' });
  const drainOutcome = Harness.drive(drainHarness.runtime).outcome;
  const drainAdapter = RulesAdapter.createRulesAdapter({ authority: drainAuthority.rules });
  assert.throws(() => drainAdapter.resolve({
    resolutionIdentity: drainRules.nextResolutionIdentity(drainOutcome.launchClaimId),
    outcome: drainOutcome }), /excluded/);
}

function testLiveHighWaterAfterOrdinaryResolution() {
  const rules = Rules.createRulesAdapter({ formatId: 'classic', matchId: 'live-high-water',
    players: players(3), startingLives: 10, suddenDeathEnabled: false });
  const authority = rules.claimEventAuthority();
  const issued = Harness.createHarness({ eventId: 'heart-rush', eventClass: 'assist',
    authority, laneId: 'after-normal-flip' });
  const outcome = Harness.drive(issued.runtime).outcome;
  const stale = rules.nextResolutionIdentity(outcome.launchClaimId);

  rules.resolveFlip({ result: 'MAKE', pose: 'upright' });
  assert.equal(rules.snapshot().sequence, 1);
  const adapter = RulesAdapter.createRulesAdapter({ authority: authority.rules });
  assert.throws(() => adapter.resolve({ resolutionIdentity: stale, outcome }),
    /stale|foreign resolution identity/,
  'a publicly recomputable identity cannot override the live Rules high-water');
  const live = rules.nextResolutionIdentity(outcome.launchClaimId);
  const resolved = adapter.resolve({ resolutionIdentity: live, outcome });
  assert.equal(resolved.resolvedThrough, 2);
  assert.equal(resolved.transition.state.sequence, 2);
  assert.throws(() => adapter.resolve({
    resolutionIdentity: rules.nextResolutionIdentity(outcome.launchClaimId), outcome,
  }), /already consumed/,
  'an outcome stays one-use even after an ordinary rules resolution advanced high-water');
  issued.runtime.cleanup('done');
}

function testPlinkoNoContestAcrossFormats() {
  const timeoutFacts = plinkoFacts({ slotSensorRef: null, slotIndex: null,
    dropDurationMs: 30000, settled: false, completionKind: 'no-contest',
    recoveryStartedMs: 22000, recoveryImpulseCount: 3 });
  const timeoutProbe = { result: 'MISS', pose: 'miss', reason: 'plinko-timeout',
    settled: false, elapsedMs: plinkoElapsed(timeoutFacts) };

  const classicRules = Rules.createRulesAdapter({ formatId: 'classic',
    matchId: 'classic-no-contest', players: players(3), startingLives: 10,
    suddenDeathAfterTurns: 0, suddenDeathStepTurns: 6 });
  const classicAuthority = classicRules.claimEventAuthority();
  const classic = drivePlinko(classicAuthority, 'classic-timeout', timeoutFacts, timeoutProbe);
  const classicBefore = classicRules.snapshot();
  const classicAdapter = RulesAdapter.createRulesAdapter({ authority: classicAuthority.rules });
  const classicIdentity = classicRules.nextResolutionIdentity(classic.outcome.launchClaimId);
  const classicResolution = classicAdapter.resolve({ resolutionIdentity: classicIdentity,
    outcome: classic.outcome });
  const classicAfter = classicResolution.transition.state;
  assert.equal(classicResolution.noContest, true);
  assert.equal(classicResolution.rulesInput, null);
  assert.equal(classicResolution.terminalOutcome, null);
  assert.equal(classicAfter.sequence, classicBefore.sequence + 1);
  assert.equal(classicAfter.attemptCounter, classicBefore.attemptCounter + 1);
  assert.equal(classicAfter.rulesTurnCounter, classicBefore.rulesTurnCounter);
  assertSameData(classicAfter.players, classicBefore.players);
  assert.equal(classicAfter.stake, classicBefore.stake);
  assertSameData(classicAfter.suddenDeath, classicBefore.suddenDeath);
  assertSameData(classicAfter.turn, classicBefore.turn);
  assert.equal(classic.harness.runtime.snapshot().phase, 'cleaned');
  assert.equal(classic.harness.runtime.snapshot().resources.active, 0,
    '30-second no-contest releases the Plinko scene before returning');
  const duplicate = classicAdapter.resolve({ resolutionIdentity: classicIdentity,
    outcome: classic.outcome });
  assert.equal(duplicate.duplicate, true);
  assert.equal(classicRules.snapshot().sequence, classicAfter.sequence,
    'a repeated no-contest resolution is idempotent');
  classicRules.resolveFlip({ result: 'MAKE', pose: 'upright' });
  assert.equal(classicRules.snapshot().sequence, 2,
    'normal play resumes from the no-contest high-water');

  const cupRules = Rules.createRulesAdapter({ formatId: 'cup', matchId: 'cup-no-contest',
    cupLength: 'short', players: players(4), startIndex: 2 });
  const cupAuthority = cupRules.claimEventAuthority();
  const cup = drivePlinko(cupAuthority, 'cup-timeout', timeoutFacts, timeoutProbe);
  const cupBefore = cupRules.snapshot();
  const cupAdapter = RulesAdapter.createRulesAdapter({ authority: cupAuthority.rules });
  const cupResolution = cupAdapter.resolve({
    resolutionIdentity: cupRules.nextResolutionIdentity(cup.outcome.launchClaimId),
    outcome: cup.outcome });
  const cupAfter = cupResolution.transition.state;
  assert.equal(cupAfter.sequence, cupBefore.sequence + 1);
  assertSameData(cupAfter.currentHeat, cupBefore.currentHeat);
  assertSameData(cupAfter.heatWins, cupBefore.heatWins);
  assertSameData(cupAfter.turn, cupBefore.turn);
  assert.equal(cup.harness.runtime.snapshot().resources.active, 0);
  cupRules.resolveFlip({ result: 'MAKE', pose: 'upright' });
  assert.equal(cupRules.snapshot().sequence, 2);
  assert.equal(cupRules.snapshot().currentHeat.sequence, 1,
    'Cup retries without charging the inner competitive heat');

  const teamRules = Rules.createRulesAdapter({ formatId: 'team-clash',
    matchId: 'team-no-contest', players: players(4) });
  const teamAuthority = teamRules.claimEventAuthority();
  const team = drivePlinko(teamAuthority, 'team-timeout', timeoutFacts, timeoutProbe);
  const teamBefore = teamRules.snapshot();
  const teamAdapter = RulesAdapter.createRulesAdapter({ authority: teamAuthority.rules });
  const teamResolution = teamAdapter.resolve({
    resolutionIdentity: teamRules.nextResolutionIdentity(team.outcome.launchClaimId),
    outcome: team.outcome });
  const teamAfter = teamResolution.transition.state;
  assert.equal(teamAfter.sequence, teamBefore.sequence + 1);
  assert.equal(teamAfter.noContestCount, teamBefore.noContestCount + 1);
  assert.equal(teamAfter.queuePosition, teamBefore.queuePosition);
  assertSameData(teamAfter.roundRaw, teamBefore.roundRaw);
  assertSameData(teamAfter.scores, teamBefore.scores);
  assertSameData(teamAfter.playerStats, teamBefore.playerStats);
  assertSameData(teamAfter.turn, teamBefore.turn);
  assert.equal(team.harness.runtime.snapshot().resources.active, 0);
  teamRules.resolveFlip({ result: 'MAKE', pose: 'upright' });
  const teamResumed = teamRules.snapshot();
  assert.equal(teamResumed.sequence, 2);
  assert.equal(teamResumed.noContestCount, 1);
  assert.equal(teamResumed.queuePosition, 1,
    'Team Clash resumes the same queued competitive turn after no-contest');
}

function testPlinkoTerminalRulesAcrossFormats() {
  const lossFacts = plinkoFacts({ slotIndex: 3 });

  const suddenRules = Rules.createRulesAdapter({ formatId: 'classic',
    matchId: 'classic-terminal-loss', players: players(3), startingLives: 3,
    suddenDeathAfterTurns: 0, suddenDeathStepTurns: 6 });
  const suddenAuthority = suddenRules.claimEventAuthority();
  const sudden = drivePlinko(suddenAuthority, 'sudden-loss', lossFacts);
  const suddenBefore = suddenRules.snapshot();
  const suddenAdapter = RulesAdapter.createRulesAdapter({ authority: suddenAuthority.rules });
  const suddenIdentity = suddenRules.nextResolutionIdentity(sudden.outcome.launchClaimId);
  const suddenResolution = suddenAdapter.resolve({ resolutionIdentity: suddenIdentity,
    outcome: sudden.outcome });
  const suddenAfter = suddenResolution.transition.state;
  assert.equal(suddenResolution.terminalOutcome, 'current-loss');
  assert.equal(suddenAfter.players[0].lives, 0);
  assert.equal(suddenAfter.players[0].eliminated, true);
  assert.equal(suddenAfter.phase, 'active');
  assert.equal(suddenAfter.turn.current, 'p2');
  assert.equal(suddenAfter.attemptCounter, suddenBefore.attemptCounter + 1);
  assert.equal(suddenAfter.rulesTurnCounter, suddenBefore.rulesTurnCounter + 1);
  assert.equal(suddenAfter.suddenDeath.countedTurns,
    suddenBefore.suddenDeath.countedTurns + 1);
  const repeatedLoss = suddenAdapter.resolve({ resolutionIdentity: suddenIdentity,
    outcome: sudden.outcome });
  assert.equal(repeatedLoss.duplicate, true);
  assert.equal(suddenRules.snapshot().rulesTurnCounter, suddenAfter.rulesTurnCounter,
    'terminal replay cannot double-charge a competitive turn');

  const fireRules = Rules.createRulesAdapter({ formatId: 'classic',
    matchId: 'on-fire-terminal-loss', players: players(2), startingLives: 10,
    suddenDeathEnabled: false });
  for (let index = 0; index < 5; index += 1) {
    fireRules.resolveFlip({ result: 'MAKE', pose: 'upright' });
  }
  const fireBefore = fireRules.snapshot();
  assert.equal(fireBefore.players[fireBefore.currentPlayerIndex].onFire, true);
  const fireAuthority = fireRules.claimEventAuthority();
  const fire = drivePlinko(fireAuthority, 'on-fire-loss', lossFacts);
  const fireAdapter = RulesAdapter.createRulesAdapter({ authority: fireAuthority.rules });
  const fireResolution = fireAdapter.resolve({
    resolutionIdentity: fireRules.nextResolutionIdentity(fire.outcome.launchClaimId),
    outcome: fire.outcome });
  const fireAfter = fireResolution.transition.state;
  assert.equal(fireAfter.players[0].lives, 0);
  assert.equal(fireAfter.players[0].eliminated, true);
  assert.equal(fireAfter.onFirePlayerId, null);
  assert.equal(fireAfter.stake, fireBefore.stake,
    'terminal loss bypasses ordinary ON FIRE/stake miss accounting');
  assert.deepEqual(fireAfter.winnerIds, ['p2']);
  assert.equal(fireAfter.completionReason, 'plinko-automatic-loss');

  const winRules = Rules.createRulesAdapter({ formatId: 'classic',
    matchId: 'classic-terminal-win', players: players(4), startingLives: 10 });
  const winAuthority = winRules.claimEventAuthority();
  const win = drivePlinko(winAuthority, 'classic-win', plinkoFacts({ slotIndex: 4 }));
  const winAdapter = RulesAdapter.createRulesAdapter({ authority: winAuthority.rules });
  const winResolution = winAdapter.resolve({
    resolutionIdentity: winRules.nextResolutionIdentity(win.outcome.launchClaimId),
    outcome: win.outcome });
  assert.equal(winResolution.transition.state.phase, 'complete');
  assert.deepEqual(winResolution.transition.state.winnerIds, ['p1']);
  assert.equal(winResolution.transition.state.players.slice(1)
    .every(player => player.eliminated && player.lives === 0), true);

  // Candidate policy (pending Integrator promotion): Cup Automatic Loss awards
  // the heat to the next surviving seat in configured rotation.  Prove it is
  // deterministic and fair for every supported 3-8-entry WFC Cup field.
  for (let count = 3; count <= 8; count += 1) {
    for (const direction of [1, -1]) {
      const startIndex = count - 2;
      const cupRules = Rules.createRulesAdapter({ formatId: 'cup',
        matchId: `cup-loss-${count}-${direction}`, cupLength: 'short',
        players: players(count), startIndex, direction });
      const authority = cupRules.claimEventAuthority();
      const cup = drivePlinko(authority, `cup-${count}-${direction}`, lossFacts);
      const adapter = RulesAdapter.createRulesAdapter({ authority: authority.rules });
      const resolution = adapter.resolve({
        resolutionIdentity: cupRules.nextResolutionIdentity(cup.outcome.launchClaimId),
        outcome: cup.outcome });
      const expectedIndex = (startIndex + direction + count) % count;
      assert.equal(resolution.transition.outcome.heatWinnerId, `p${expectedIndex + 1}`);
      assert.equal(resolution.transition.state.heatResults[0].attempts, 1);
      assert.equal(resolution.transition.state.heatResults[0].rulesTurns, 1);
      assert.equal(resolution.transition.state.heatResults[0].completionReason,
        'plinko-automatic-loss');
      assert.equal(resolution.transition.state.phase, 'between-heats');
      cup.harness.runtime.cleanup('done');
    }
  }

  for (const terminal of [
    { slotIndex: 4, expectedTeam: 0, label: 'win' },
    { slotIndex: 3, expectedTeam: 1, label: 'loss' },
  ]) {
    const teamRules = Rules.createRulesAdapter({ formatId: 'team-clash',
      matchId: `team-terminal-${terminal.label}`, players: players(4) });
    const authority = teamRules.claimEventAuthority();
    const plinko = drivePlinko(authority, `team-${terminal.label}`,
      plinkoFacts({ slotIndex: terminal.slotIndex }));
    const adapter = RulesAdapter.createRulesAdapter({ authority: authority.rules });
    const resolution = adapter.resolve({
      resolutionIdentity: teamRules.nextResolutionIdentity(plinko.outcome.launchClaimId),
      outcome: plinko.outcome });
    const state = resolution.transition.state;
    assert.equal(state.phase, 'complete');
    assert.equal(state.winnerTeamIndex, terminal.expectedTeam);
    assert.equal(state.sequence, 1);
    assert.equal(state.queuePosition, 1);
    assert.equal(state.playerStats.p1.flips, 1);
    assert.equal(state.completionReason, 'automatic-team-result');
    plinko.harness.runtime.cleanup('done');
  }
}

function testEventCoresArePrivate() {
  assert.equal(Object.prototype.hasOwnProperty.call(globalThis,
    'FlipgameV112EventKernel'), false,
  'CommonJS loading must not publish the trusted kernel API on globalThis');
  const files = [
    '../js/v112-rules.js', '../js/v112-event-kernel.js', '../js/v112-event-runtime.js',
    '../js/v112-event-rules-adapter.js', '../js/v112-event-renderer.js',
    './lib/v112-event-harness.js',
  ];
  files.forEach(relative => {
    const filename = path.resolve(__dirname, relative);
    const context = vm.createContext({ console });
    assert.throws(() => vm.runInContext(fs.readFileSync(filename, 'utf8'), context,
      { filename }), /private CommonJS core|test-only CommonJS/,
    `${relative} must refuse classic-script initialization`);
    assert.deepEqual(Object.keys(context), ['console']);
  });

  const cjsPreseed = { attacker: true };
  globalThis.FlipgameV112EventKernel = cjsPreseed;
  try {
    delete require.cache[require.resolve('../js/v112-event-kernel.js')];
    const reconstructed = require('../js/v112-event-kernel.js');
    assert.equal(reconstructed.schema, 'FlipgameEventKernelV2',
      'real CommonJS must construct normally despite a browser-like preseed');
    assert.equal(globalThis.FlipgameV112EventKernel, cjsPreseed,
      'CommonJS construction must not touch the browser global');
  } finally {
    delete globalThis.FlipgameV112EventKernel;
  }
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
  testPlinkoTrampolineOpeningTransport();
  testHighValueColliderOwnership();
  testRulesIdentityAuthorityAndExactTeamMappings();
  testRulesAdapterSequentialAndForgedOutcomes();
  testEveryCanonicalEventRulesBoundary();
  testTeamRuleCompatibility();
  testLiveHighWaterAfterOrdinaryResolution();
  testPlinkoNoContestAcrossFormats();
  testPlinkoTerminalRulesAcrossFormats();
  testEventCoresArePrivate();
  console.log('v1.12 event kernel adversarial tests passed.');
}

run();
