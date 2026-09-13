'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Rules = require('../js/v112-rules.js');
const Landing = require('../js/v112-landing-verdict.js');

const ROOT = path.resolve(__dirname, '..');

function players(count = 4) {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`, name: `Player ${index + 1}`,
  }));
}

function unclaimed(name = 'landing', laneIds = ['lane-a'], formatId = 'classic') {
  const rules = Rules.createRulesAdapter({
    matchId: name, formatId, players: players(formatId === 'team-clash' ? 4 : 3),
    startingLives: 10,
  });
  return { rules, connector: rules.claimLandingConnector(), name, laneIds };
}

function fixture(name = 'landing', laneIds = ['lane-a'], formatId = 'classic') {
  const setup = unclaimed(name, laneIds, formatId);
  const authority = Landing.createAuthority({
    matchId: name, rulesConnector: setup.connector, laneIds,
  });
  const physics = authority.claimPhysicsLane(laneIds[0]);
  const consumer = authority.claimRulesLane(laneIds[0]);
  return { ...setup, authority, physics, consumer };
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

function testTrustedSurfaceAndRulesIssuedConnector() {
  assert.equal(Landing.schema, 'FlipgameV112LandingVerdictAuthorityV1');
  assert.equal(Landing.VERDICT_SCHEMA, 'LandingVerdictV2');
  assert.equal(Landing.ORDINARY_SETTLE_LIMIT_MS, 4000);
  assert.equal(Landing.MIN_STABLE_MS, 80);
  assert.equal(Object.isFrozen(Landing), true);
  assert.equal('browser' in Landing, false);
  assert.equal(Object.prototype.hasOwnProperty.call(globalThis,
    'FlipgameV112LandingVerdict'), false, 'CommonJS must not pollute globalThis');

  const pending = unclaimed('connector-once');
  assert.throws(() => pending.rules.claimLandingConnector(), /already issued/);
  assert.throws(() => Landing.createAuthority({
    matchId: pending.name,
    rulesConnector: Object.freeze({ schema: 'RulesLandingConnectorV1' }),
    laneIds: pending.laneIds,
  }), /Rules-issued landing connector/);
  const authority = Landing.createAuthority({
    matchId: pending.name, rulesConnector: pending.connector, laneIds: pending.laneIds,
  });
  assert.throws(() => Landing.createAuthority({
    matchId: pending.name, rulesConnector: pending.connector, laneIds: pending.laneIds,
  }), /already claimed/, 'the exact Rules connector can bind only once');
  assert.equal(Object.isFrozen(authority), true);

  const setup = fixture('success');
  assert.equal(Object.isFrozen(setup.physics), true);
  assert.equal(Object.isFrozen(setup.consumer), true);
  assert.throws(() => setup.authority.claimPhysicsLane('lane-a'), /already claimed/);
  assert.throws(() => setup.authority.claimRulesLane('lane-a'), /already claimed/);
  const { verdict } = settle(setup.physics, { pose: 'cap' });
  assert.equal(Object.isFrozen(verdict), true);
  assert.deepEqual({ matchId: verdict.matchId, laneId: verdict.laneId,
    flipId: verdict.flipId, playerId: verdict.playerId, result: verdict.result,
    pose: verdict.pose, firstContactMs: verdict.firstContactMs,
    settleMs: verdict.settleMs, finalSettleMs: verdict.finalSettleMs,
    contacts: verdict.contacts, timedOut: verdict.timedOut }, {
    matchId: 'success', laneId: 'lane-a', flipId: 'flip-1', playerId: 'p1',
    result: 'MAKE', pose: 'cap', firstContactMs: 900, settleMs: 200,
    finalSettleMs: 200, contacts: 1, timedOut: false,
  });
  const transition = setup.consumer.resolve(verdict);
  assert.equal(transition.state.sequence, 1);
  assert.equal(transition.outcome.playerId, 'p1');
  assert.equal(transition.outcome.landing.pose, 'cap');
  assert.equal(setup.rules.snapshot().stake, 2);
  assert.throws(() => setup.consumer.resolve(verdict), /already been consumed/);
}

function testOrdinaryLimitAndLifecycleBoundaries() {
  for (const invalid of [5000, 6000, 3999, 4001]) {
    const setup = fixture(`limit-${invalid}`);
    assert.throws(() => setup.physics.beginFlip({
      flipId: `limit-${invalid}`, playerId: 'p1', launchedAtMs: 0,
      settleLimitMs: invalid,
    }), /exactly a 4000 ms settle limit/);
  }
  const setup = fixture('lifecycle');
  const handle = setup.physics.beginFlip({
    flipId: 'life-1', playerId: 'p1', launchedAtMs: 50, settleLimitMs: 4000,
  });
  assert.throws(() => setup.physics.issueSettledVerdict(handle, {
    result: 'MISS', atMs: 100, stableForMs: 80,
  }), /contact and settling/);
  setup.physics.markContact(handle, 100);
  assert.throws(() => setup.physics.issueSettledVerdict(handle, {
    result: 'MISS', atMs: 101, stableForMs: 80,
  }), /contact and settling/);
  assert.throws(() => setup.physics.markSettling(handle, 100), /latest contact frame/);
  setup.physics.markSettling(handle, 116);
  assert.throws(() => setup.physics.issueSettledVerdict(handle, {
    result: 'MAKE', pose: 'upright', atMs: 116, stableForMs: 80,
  }), /first settling frame/);
  assert.throws(() => setup.physics.issueSettledVerdict(handle, {
    result: 'MAKE', pose: 'upright', atMs: 195, stableForMs: 80,
  }), /final measured 80 ms window/);
  const verdict = setup.physics.issueSettledVerdict(handle, {
    result: 'MAKE', pose: 'upright', atMs: 196, stableForMs: 80,
  });
  assert.equal(verdict.result, 'MAKE', 'exactly 80 stable ms after settling is accepted');
}

function testBounceRecontactResetsStabilityButKeepsFirstContact() {
  const setup = fixture('bounce');
  const handle = setup.physics.beginFlip({
    flipId: 'bounce-1', playerId: 'p1', launchedAtMs: 0,
  });
  setup.physics.markContact(handle, 1000);
  setup.physics.markSettling(handle, 1016);
  setup.physics.markAirborne(handle, 1080);
  assert.throws(() => setup.physics.issueSettledVerdict(handle, {
    result: 'MAKE', atMs: 1200, stableForMs: 120,
  }), /contact and settling/);
  setup.physics.markContact(handle, 1200);
  setup.physics.markSettling(handle, 1216);
  assert.throws(() => setup.physics.issueSettledVerdict(handle, {
    result: 'MAKE', pose: 'upright', atMs: 1295, stableForMs: 80,
  }), /after recontact/);
  const verdict = setup.physics.issueSettledVerdict(handle, {
    result: 'MAKE', pose: 'upright', atMs: 1296, stableForMs: 80,
  });
  assert.equal(verdict.firstContactMs, 1000, 'first contact remains telemetry authority');
  assert.equal(verdict.settleMs, 296, 'overall settle time remains first-contact based');
  assert.equal(verdict.finalSettleMs, 96, 'final stability is last-contact based');
  assert.equal(verdict.contacts, 2);

  const timeout = fixture('bounce-timeout');
  const timed = timeout.physics.beginFlip({
    flipId: 'bounce-timeout-1', playerId: 'p1', launchedAtMs: 0,
  });
  timeout.physics.markContact(timed, 1000);
  timeout.physics.markAirborne(timed, 4900);
  timeout.physics.markContact(timed, 4990);
  timeout.physics.markSettling(timed, 4991);
  assert.throws(() => timeout.physics.issueTimeoutVerdict(timed, { atMs: 4999 }),
    /before the 4000 ms settle limit/);
  const timedVerdict = timeout.physics.issueTimeoutVerdict(timed, { atMs: 5000 });
  assert.equal(timedVerdict.timedOut, true);
  assert.equal(timedVerdict.firstContactMs, 1000);
  assert.equal(timedVerdict.settleMs, 4000);
  assert.equal(timedVerdict.finalSettleMs, 10);
}

function testTimeoutAlwaysMissAndStableBoundaryUsesTimeout() {
  const setup = fixture('timeout');
  const handle = setup.physics.beginFlip({ flipId: 'timeout-1', playerId: 'p1', launchedAtMs: 0 });
  setup.physics.markContact(handle, 1000);
  setup.physics.markSettling(handle, 1016);
  assert.throws(() => setup.physics.issueTimeoutVerdict(handle, {
    result: 'MISS', atMs: 4999,
  }), /before the 4000 ms settle limit/);
  assert.throws(() => setup.physics.issueSettledVerdict(handle, {
    result: 'MAKE', pose: 'upright', atMs: 5000, stableForMs: 3984,
  }), /must use the timeout path/);
  assert.throws(() => setup.physics.issueTimeoutVerdict(handle, {
    result: 'MAKE', atMs: 5000,
  }), /must be a miss/);
  const verdict = setup.physics.issueTimeoutVerdict(handle, { atMs: 5000 });
  assert.equal(verdict.result, 'MISS');
  assert.equal(verdict.pose, 'miss');
  const transition = setup.consumer.resolve(verdict);
  assert.equal(transition.outcome.landing.result, 'MISS');
}

function testForgeryCopyStaleAndCrossAuthorityRejection() {
  const left = fixture('cross-left', ['lane-a', 'lane-b']);
  const leftRulesB = left.authority.claimRulesLane('lane-b');
  const right = fixture('cross-right');
  const { handle, verdict } = settle(left.physics);
  assert.throws(() => left.physics.markContact({ ...handle }, 3000), /exact physics-issued/);
  assert.throws(() => left.consumer.resolve({ ...verdict }), /exact physics-issued/);
  assert.throws(() => left.consumer.resolve(Object.freeze({
    schema: 'LandingVerdictV2', matchId: 'cross-left', laneId: 'lane-a',
    flipId: 'flip-1', playerId: 'p1', result: 'MAKE', pose: 'upright',
  })), /exact physics-issued/);
  assert.throws(() => leftRulesB.resolve(verdict), /different lane/);
  assert.throws(() => right.consumer.resolve(verdict), /different match/);
  const transition = left.consumer.resolve(verdict);
  assert.equal(transition.state.sequence, 1);

  const stale = fixture('stale');
  const issued = settle(stale.physics, { flipId: 'expected-flip' });
  stale.rules.resolveFlip({ result: 'MISS', playerId: 'p1' });
  assert.throws(() => stale.consumer.resolve(issued.verdict),
    /stale for the current player|stale or future/);

  const current = fixture('identity');
  const exact = settle(current.physics, { flipId: 'identity-1' });
  assert.throws(() => { exact.verdict.flipId = 'future-id'; }, /read only|Cannot assign/);
  assert.throws(() => current.consumer.resolve({ ...exact.verdict, flipId: 'identity-999' }),
    /exact physics-issued/);
  current.consumer.resolve(exact.verdict);
}

function testPlayerLaneEventAbortAndAttemptGuards() {
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
}

function testHostileObjectsAndArraysFailBeforeAuthorityOrVerdict() {
  let inheritedReads = 0;
  const inherited = Object.create({
    get rulesConnector() { inheritedReads += 1; return null; },
  });
  inherited.matchId = 'hostile-inherited';
  inherited.laneIds = ['lane'];
  assert.throws(() => Landing.createAuthority(inherited), /custom prototype/);
  assert.equal(inheritedReads, 0, 'inherited accessors must never be evaluated');

  let hostileArrayCase = 0;
  function rejectedLaneIds(make, pattern) {
    hostileArrayCase += 1;
    const setup = unclaimed(`hostile-array-${hostileArrayCase}`);
    const lanes = make();
    assert.throws(() => Landing.createAuthority({
      matchId: setup.name, rulesConnector: setup.connector, laneIds: lanes,
    }), pattern);
  }
  rejectedLaneIds(() => { const value = []; value.length = 1; return value; }, /dense/);
  rejectedLaneIds(() => { const value = ['lane']; value.named = true; return value; }, /dense/);
  rejectedLaneIds(() => { const value = ['lane']; value[Symbol('x')] = true; return value; }, /symbol/);
  rejectedLaneIds(() => {
    const value = ['lane'];
    Object.defineProperty(value, '0', { get: () => 'lane' });
    return value;
  }, /own data fields/);
  rejectedLaneIds(() => {
    const value = ['lane'];
    Object.setPrototypeOf(value, { forEach() { throw new Error('caller iteration'); } });
    return value;
  }, /altered array prototype/);
  rejectedLaneIds(() => {
    const value = ['lane'];
    value.forEach = () => { throw new Error('caller forEach'); };
    return value;
  }, /dense/);

  let proxyTrapCount = 0;
  const proxySetup = unclaimed('proxy');
  const target = { matchId: 'proxy', rulesConnector: proxySetup.connector, laneIds: ['lane'] };
  const hostileProxy = new Proxy(target, {
    getPrototypeOf() { proxyTrapCount += 1; throw new Error('trap'); },
  });
  assert.throws(() => Landing.createAuthority(hostileProxy), /structure is unreadable/);
  assert.ok(proxyTrapCount > 0, 'JavaScript necessarily invokes structural Proxy traps');
  const afterProxy = Landing.createAuthority(target);
  assert.equal(afterProxy.matchId, 'proxy',
    'the rejected Proxy did not claim the genuine Rules connector or issue authority');

  const setup = fixture('hostile-verdict');
  const handle = setup.physics.beginFlip({ flipId: 'hostile-1', playerId: 'p1', launchedAtMs: 0 });
  setup.physics.markContact(handle, 100);
  setup.physics.markSettling(handle, 116);
  let getterReads = 0;
  const accessor = { result: 'MAKE', pose: 'upright', atMs: 200, stableForMs: 80 };
  Object.defineProperty(accessor, 'reason', {
    get() { getterReads += 1; return 'getter'; },
  });
  assert.throws(() => setup.physics.issueSettledVerdict(handle, accessor), /own data field/);
  assert.equal(getterReads, 0);
  const verdict = setup.physics.issueSettledVerdict(handle, {
    result: 'MAKE', pose: 'upright', atMs: 200, stableForMs: 80,
  });
  assert.equal(verdict.result, 'MAKE', 'hostile input did not issue or spend a verdict');
}

function testConnectorIsBoundToTheExactImportedRulesInstance() {
  const setup = unclaimed('module-instance');
  const rulesPath = require.resolve('../js/v112-rules.js');
  const landingPath = require.resolve('../js/v112-landing-verdict.js');
  delete require.cache[landingPath];
  delete require.cache[rulesPath];
  const independentlyLoadedLanding = require('../js/v112-landing-verdict.js');
  assert.throws(() => independentlyLoadedLanding.createAuthority({
    matchId: 'module-instance', rulesConnector: setup.connector, laneIds: ['lane'],
  }), /Rules-issued landing connector/,
  'a connector from another Rules module instance cannot cross the WeakMap boundary');
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

function fakeCommonJsContext() {
  let calls = 0;
  const sentinel = Object.freeze({ untouched: true });
  function FakeModule() {}
  FakeModule._cache = Object.create(null);
  FakeModule.prototype.require = () => { calls += 1; throw new Error('fake require'); };
  const fake = { exports: sentinel, filename: 'browser-shim.js',
    require: () => { calls += 1; throw new Error('fake require'); } };
  return { context: vm.createContext({ console, module: fake, require: fake.require,
    process: { release: { name: 'node' }, versions: { node: '999' },
      getBuiltinModule: () => FakeModule } }), sentinel, calls: () => calls };
}

function testPrivateCoreAndSeparateBrowserFacade() {
  const coreFile = path.join(ROOT, 'js/v112-landing-verdict.js');
  const facadeFile = path.join(ROOT, 'js/v112-landing-verdict-browser-facade.js');
  const coreSource = fs.readFileSync(coreFile, 'utf8');
  const facadeSource = fs.readFileSync(facadeFile, 'utf8');

  const empty = vm.createContext({ console });
  assert.throws(() => vm.runInContext(coreSource, empty, { filename: coreFile }),
    /private CommonJS core/);
  assert.equal('FlipgameV112LandingVerdict' in empty, false);
  assert.equal('FlipgameV112LandingVerdictBrowserFacadeV1' in empty, false);

  const shim = fakeCommonJsContext();
  assert.throws(() => vm.runInContext(coreSource, shim.context, { filename: coreFile }),
    /private CommonJS core/);
  assert.equal(shim.calls(), 0);
  assert.equal(shim.context.module.exports, shim.sentinel);
  vm.runInContext(facadeSource, shim.context, { filename: facadeFile });
  assert.equal(shim.calls(), 0, 'facade ignores fake module, process, and require globals');
  const browser = shim.context.FlipgameV112LandingVerdictBrowserFacadeV1;
  const descriptor = Object.getOwnPropertyDescriptor(shim.context,
    'FlipgameV112LandingVerdictBrowserFacadeV1');
  assert.deepEqual(Object.keys(browser), ['schema', 'version', 'liveAvailable']);
  assert.equal(browser.schema, 'FlipgameV112LandingVerdictBrowserFacadeV1');
  assert.equal(browser.liveAvailable, false);
  assert.equal(Object.isFrozen(browser), true);
  assert.equal(Reflect.ownKeys(browser).some(key => typeof browser[key] === 'function'), false);
  assert.equal('createAuthority' in browser, false);
  assert.equal(descriptor.writable, false);
  assert.equal(descriptor.configurable, false);
  assert.throws(() => vm.runInContext(facadeSource, shim.context, { filename: facadeFile }),
    /duplicate or preseeded/);

  const preseed = vm.createContext({ console,
    FlipgameV112LandingVerdictBrowserFacadeV1: Object.freeze({
      schema: 'FlipgameV112LandingVerdictBrowserFacadeV1', version: 1, liveAvailable: false,
    }) });
  assert.throws(() => vm.runInContext(facadeSource, preseed, { filename: facadeFile }),
    /duplicate or preseeded/);
}

function testCoreAndFacadeAreAbsentFromShippedBootGraphs() {
  const names = ['v112-landing-verdict.js', 'v112-landing-verdict-browser-facade.js'];
  const files = [
    'index.html', 'service-worker.js', 'manifest.json', 'js/v111-boot.js',
    'android/app/src/main/AndroidManifest.xml',
    'android/app/src/main/java/com/mapzimus/flipgame/MainActivity.java',
    '.github/workflows/build-apk.yml',
  ];
  for (const file of files) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const name of names) {
      assert.equal(source.includes(name), false, `${file} must not name ${name}`);
    }
  }
}

function run() {
  testTrustedSurfaceAndRulesIssuedConnector();
  testOrdinaryLimitAndLifecycleBoundaries();
  testBounceRecontactResetsStabilityButKeepsFirstContact();
  testTimeoutAlwaysMissAndStableBoundaryUsesTimeout();
  testForgeryCopyStaleAndCrossAuthorityRejection();
  testPlayerLaneEventAbortAndAttemptGuards();
  testHostileObjectsAndArraysFailBeforeAuthorityOrVerdict();
  testCupAndTeamOrdinaryPaths();
  testConnectorIsBoundToTheExactImportedRulesInstance();
  testPrivateCoreAndSeparateBrowserFacade();
  testCoreAndFacadeAreAbsentFromShippedBootGraphs();
  console.log('v1.12 Rules-issued physics LandingVerdict authority tests passed.');
}

run();
