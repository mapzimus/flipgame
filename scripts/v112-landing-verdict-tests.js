'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Rules = require('../js/v112-rules.js');
const Landing = require('../js/v112-landing-verdict.js');

function players(count = 4) {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`, name: `Player ${index + 1}`,
  }));
}

function fixture(name = 'landing', laneIds = ['lane-a'], formatId = 'classic') {
  const rules = Rules.createRulesAdapter({
    matchId: name, formatId, players: players(formatId === 'team-clash' ? 4 : 3),
    startingLives: 10,
  });
  const authority = Landing.createAuthority({ matchId: name, rulesAdapter: rules, laneIds });
  const physics = authority.claimPhysicsLane(laneIds[0]);
  const consumer = authority.claimRulesLane(laneIds[0]);
  return { rules, authority, physics, consumer };
}

function settle(physics, options = {}) {
  const launchedAtMs = options.launchedAtMs ?? 1000;
  const handle = physics.beginFlip({
    flipId: options.flipId || 'flip-1',
    playerId: options.playerId || 'p1',
    launchedAtMs,
    settleLimitMs: options.settleLimitMs,
  });
  physics.markContact(handle, launchedAtMs + 900);
  physics.markSettling(handle, launchedAtMs + 916);
  const verdict = physics.issueSettledVerdict(handle, {
    result: options.result || 'MAKE', pose: options.pose || 'upright',
    reason: options.reason || 'stable-base', atMs: launchedAtMs + 1100,
    stableForMs: 160,
  });
  return { handle, verdict };
}

function testTrustedSurfaceAndSuccessfulResolution() {
  assert.equal(Landing.schema, 'FlipgameV112LandingVerdictAuthorityV1');
  assert.equal(Landing.VERDICT_SCHEMA, 'LandingVerdictV2');
  assert.equal(Landing.MIN_STABLE_MS, 80);
  assert.deepEqual(Landing.ALLOWED_SETTLE_LIMITS, [4000, 5000, 6000]);
  assert.equal(Object.isFrozen(Landing), true);
  assert.equal(Object.prototype.hasOwnProperty.call(globalThis,
    'FlipgameV112LandingVerdict'), false, 'CommonJS must not pollute globalThis');

  const { rules, authority, physics, consumer } = fixture('success');
  assert.equal(Object.isFrozen(authority), true);
  assert.equal(Object.isFrozen(physics), true);
  assert.equal(Object.isFrozen(consumer), true);
  assert.throws(() => authority.claimPhysicsLane('lane-a'), /already claimed/);
  assert.throws(() => authority.claimRulesLane('lane-a'), /already claimed/);

  const { verdict } = settle(physics, { pose: 'cap' });
  assert.equal(Object.isFrozen(verdict), true);
  assert.deepEqual({ matchId: verdict.matchId, laneId: verdict.laneId,
    flipId: verdict.flipId, playerId: verdict.playerId, result: verdict.result,
    pose: verdict.pose, firstContactMs: verdict.firstContactMs,
    settleMs: verdict.settleMs, timedOut: verdict.timedOut }, {
    matchId: 'success', laneId: 'lane-a', flipId: 'flip-1', playerId: 'p1',
    result: 'MAKE', pose: 'cap', firstContactMs: 900, settleMs: 200, timedOut: false,
  });
  const transition = consumer.resolve(verdict);
  assert.equal(transition.state.sequence, 1);
  assert.equal(transition.outcome.playerId, 'p1');
  assert.equal(transition.outcome.landing.pose, 'cap');
  assert.equal(rules.snapshot().stake, 2);
  assert.throws(() => consumer.resolve(verdict), /already been consumed/);
}

function testLifecycleCannotResolveAtContactOrPrematurely() {
  const { physics } = fixture('lifecycle');
  const handle = physics.beginFlip({ flipId: 'life-1', playerId: 'p1', launchedAtMs: 50 });
  assert.throws(() => physics.issueSettledVerdict(handle, {
    result: 'MISS', atMs: 100, stableForMs: 80,
  }), /contact and settling/);
  physics.markContact(handle, 100);
  assert.throws(() => physics.issueSettledVerdict(handle, {
    result: 'MISS', atMs: 101, stableForMs: 80,
  }), /contact and settling/);
  assert.throws(() => physics.markSettling(handle, 100), /first contact frame/);
  physics.markSettling(handle, 116);
  assert.throws(() => physics.issueSettledVerdict(handle, {
    result: 'MAKE', pose: 'upright', atMs: 116, stableForMs: 80,
  }), /first settling frame/);
  assert.throws(() => physics.issueSettledVerdict(handle, {
    result: 'MAKE', pose: 'upright', atMs: 180, stableForMs: 79,
  }), /stable settling interval/);
  assert.throws(() => physics.issueSettledVerdict(handle, {
    result: 'MAKE', pose: 'upright', atMs: 180, stableForMs: 80,
  }), /stable settling interval/, 'claimed stable time cannot exceed elapsed settling time');
  const verdict = physics.issueSettledVerdict(handle, {
    result: 'MAKE', pose: 'upright', atMs: 220, stableForMs: 80,
  });
  assert.equal(verdict.result, 'MAKE');
}

function testTimeoutMustReachBoundAndIsAlwaysMiss() {
  const { physics, consumer } = fixture('timeout');
  const handle = physics.beginFlip({
    flipId: 'timeout-1', playerId: 'p1', launchedAtMs: 0, settleLimitMs: 6000,
  });
  physics.markContact(handle, 1000);
  physics.markSettling(handle, 1016);
  assert.throws(() => physics.issueTimeoutVerdict(handle, {
    result: 'MISS', atMs: 6999,
  }), /before the settle limit/);
  assert.throws(() => physics.issueTimeoutVerdict(handle, {
    result: 'MAKE', atMs: 7000,
  }), /must be a miss/);
  const verdict = physics.issueTimeoutVerdict(handle, { atMs: 7000 });
  assert.equal(verdict.result, 'MISS');
  assert.equal(verdict.pose, 'miss');
  assert.equal(verdict.timedOut, true);
  assert.equal(verdict.settleMs, 6000);
  const transition = consumer.resolve(verdict);
  assert.equal(transition.outcome.landing.result, 'MISS');
}

function testForgeryCopyAndCrossAuthorityRejection() {
  const left = fixture('cross-match-left', ['lane-a', 'lane-b']);
  const leftRulesB = left.authority.claimRulesLane('lane-b');
  const right = fixture('cross-match-right');
  const { handle, verdict } = settle(left.physics);

  assert.throws(() => left.physics.markContact({ ...handle }, 3000), /exact physics-issued/);
  assert.throws(() => left.consumer.resolve({ ...verdict }), /exact physics-issued/);
  assert.throws(() => left.consumer.resolve(Object.freeze({
    schema: 'LandingVerdictV2', matchId: 'cross-match-left', laneId: 'lane-a',
    flipId: 'flip-1', playerId: 'p1', result: 'MAKE', pose: 'upright',
  })), /exact physics-issued/);
  assert.throws(() => leftRulesB.resolve(verdict), /different lane/);
  assert.throws(() => right.consumer.resolve(verdict), /different match/);
  const transition = left.consumer.resolve(verdict);
  assert.equal(transition.state.sequence, 1, 'failed cross-authority attacks do not spend the verdict');
}

function testStaleFutureAndExactIdentityProtection() {
  const stale = fixture('stale');
  const { verdict } = settle(stale.physics, { flipId: 'expected-flip' });
  // A trusted legacy resolver advances the exact high-water before the physical
  // verdict arrives. The old verdict must not resolve a different turn.
  stale.rules.resolveFlip({ result: 'MISS', playerId: 'p1' });
  assert.throws(() => stale.consumer.resolve(verdict), /stale for the current player|stale or future/);

  const current = fixture('identity');
  const issued = settle(current.physics, { flipId: 'identity-1' });
  assert.throws(() => {
    issued.verdict.flipId = 'future-id';
  }, /read only|Cannot assign/, 'verdict identity is immutable');
  const fakeFuture = { ...issued.verdict, flipId: 'identity-999' };
  assert.throws(() => current.consumer.resolve(fakeFuture), /exact physics-issued/);
  current.consumer.resolve(issued.verdict);
}

function testPlayerLaneEventAndAttemptGuards() {
  const setup = fixture('guards', ['left', 'right']);
  const rightPhysics = setup.authority.claimPhysicsLane('right');
  assert.throws(() => setup.physics.beginFlip({
    flipId: 'wrong-player', playerId: 'p2', launchedAtMs: 0,
  }), /wrong current player/);
  assert.throws(() => setup.physics.beginFlip({
    flipId: 'event', playerId: 'p1', launchedAtMs: 0, eventId: 'wind-tunnel',
  }), /separate branded event authority/);
  const handle = setup.physics.beginFlip({ flipId: 'active', playerId: 'p1', launchedAtMs: 0 });
  assert.throws(() => setup.physics.beginFlip({
    flipId: 'second', playerId: 'p1', launchedAtMs: 1,
  }), /unresolved attempt/);
  assert.throws(() => rightPhysics.markContact(handle, 100), /this lane's exact/);
  const abort = setup.physics.abort(handle, 'viewport teardown');
  assert.equal(abort.reason, 'viewport teardown');
  assert.throws(() => setup.physics.markContact(handle, 100), /aborted/);
  assert.throws(() => setup.physics.beginFlip({
    flipId: 'active', playerId: 'p1', launchedAtMs: 2,
  }), /already used/);
  const replacement = setup.physics.beginFlip({
    flipId: 'replacement', playerId: 'p1', launchedAtMs: 2,
  });
  assert.equal(replacement.flipId, 'replacement');

  const sparse = [];
  sparse.length = 1;
  assert.throws(() => Landing.createAuthority({
    matchId: 'guards', rulesAdapter: setup.rules, laneIds: sparse,
  }), /dense data-only array/);
  const accessor = { result: 'MAKE', pose: 'upright', atMs: 200, stableForMs: 80 };
  Object.defineProperty(accessor, 'reason', { get: () => 'getter' });
  setup.physics.markContact(replacement, 50);
  setup.physics.markSettling(replacement, 51);
  assert.throws(() => setup.physics.issueSettledVerdict(replacement, accessor), /cannot be an accessor/);
}

function testRulesFailureSpendsVerdict() {
  const real = Rules.createRulesAdapter({ matchId: 'throwing', formatId: 'classic',
    players: players(3), startingLives: 10 });
  let calls = 0;
  const throwing = Object.freeze({
    snapshot: () => real.snapshot(),
    nextResolutionIdentity: id => real.nextResolutionIdentity(id),
    resolveFlip: () => { calls += 1; throw new Error('simulated storage fault'); },
  });
  const authority = Landing.createAuthority({
    matchId: 'throwing', rulesAdapter: throwing, laneIds: ['lane'],
  });
  const physics = authority.claimPhysicsLane('lane');
  const rules = authority.claimRulesLane('lane');
  const { verdict } = settle(physics);
  assert.throws(() => rules.resolve(verdict), /simulated storage fault/);
  assert.throws(() => rules.resolve(verdict), /already been consumed/);
  assert.equal(calls, 1);
}

function testCupAndTeamOrdinaryPaths() {
  for (const formatId of ['cup', 'team-clash']) {
    const setup = fixture(`format-${formatId}`, ['lane'], formatId);
    const playerId = setup.rules.snapshot().turn.current;
    const { verdict } = settle(setup.physics, {
      flipId: `${formatId}-flip`, playerId, result: 'MAKE',
    });
    const transition = setup.consumer.resolve(verdict);
    assert.equal(transition.outcome.playerId, playerId);
    assert.equal(transition.outcome.landing.result, 'MAKE');
  }
}

function testBrowserFacadeIsMetadataOnlyAndFailClosed() {
  const filename = path.resolve(__dirname, '../js/v112-landing-verdict.js');
  const source = fs.readFileSync(filename, 'utf8');
  const context = vm.createContext({ console });
  vm.runInContext(source, context, { filename });
  const browser = context.FlipgameV112LandingVerdict;
  const descriptor = Object.getOwnPropertyDescriptor(context, 'FlipgameV112LandingVerdict');
  assert.equal(browser.schema, 'FlipgameV112LandingVerdictBrowserV1');
  assert.equal(browser.liveAuthorityAvailable, false);
  assert.equal(Object.isFrozen(browser), true);
  assert.equal(Object.prototype.hasOwnProperty.call(browser, 'createAuthority'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(browser, 'issue'), false);
  assert.equal(descriptor.writable, false);
  assert.equal(descriptor.configurable, false);
  assert.throws(() => vm.runInContext(source, context, { filename }), /duplicate or preseeded/);

  const preseed = vm.createContext({ console,
    FlipgameV112LandingVerdict: Object.freeze({ schema: 'LandingVerdictV2' }) });
  assert.throws(() => vm.runInContext(source, preseed, { filename }), /duplicate or preseeded/);

  let calls = 0;
  const sentinel = { untouched: true };
  const shim = vm.createContext({ console, module: {
    exports: sentinel, filename: 'browser-shim.js',
    require: () => { calls += 1; throw new Error('must not require'); },
  } });
  vm.runInContext(source, shim, { filename });
  assert.equal(calls, 0);
  assert.equal(shim.module.exports, sentinel);
  assert.equal(shim.FlipgameV112LandingVerdict.liveAuthorityAvailable, false);

  const rulesFilename = path.resolve(__dirname, '../js/v112-rules.js');
  const rulesSource = fs.readFileSync(rulesFilename, 'utf8');
  const browserRules = vm.createContext({ console });
  vm.runInContext(rulesSource, browserRules, { filename: rulesFilename });
  const adapter = browserRules.FlipgameV112Rules.createRulesAdapter({
    matchId: 'browser-no-raw-verdict', formatId: 'classic',
    players: [{ id: 'p1' }, { id: 'p2' }], startingLives: 3,
  });
  assert.equal(Object.prototype.hasOwnProperty.call(adapter, 'resolveFlip'), false,
    'browser Rules adapter must not expose an unbranded ordinary result mutation');
}

function run() {
  testTrustedSurfaceAndSuccessfulResolution();
  testLifecycleCannotResolveAtContactOrPrematurely();
  testTimeoutMustReachBoundAndIsAlwaysMiss();
  testForgeryCopyAndCrossAuthorityRejection();
  testStaleFutureAndExactIdentityProtection();
  testPlayerLaneEventAndAttemptGuards();
  testRulesFailureSpendsVerdict();
  testCupAndTeamOrdinaryPaths();
  testBrowserFacadeIsMetadataOnlyAndFailClosed();
  console.log('v1.12 physics-issued LandingVerdict authority tests passed.');
}

run();
