#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const Interfaces = require('../js/v111-interfaces.js');
const Runtime = require('../js/v111-runtime.js');

function noop() {}

function testFrozenInterfaceCatalog() {
  assert.equal(Interfaces.CONTRACT_REVISION, 3);
  assert.equal(Interfaces.RELEASE_VERSION, 'v1.11');
  assert.equal(Interfaces.EVENT_IDS.length, 30);
  assert.equal(new Set(Interfaces.EVENT_IDS).size, 30);
  assert.deepEqual(Interfaces.EVENT_IDS.slice(0, 3), [
    'rainbow-corkscrew', 'half-full', 'power-launch',
  ]);
  assert.deepEqual(Interfaces.EVENT_IDS.slice(-3), [
    'mirror-match', 'cap-toss', 'life-drain',
  ]);
  assert.ok(Object.isFrozen(Interfaces));
  assert.ok(Object.isFrozen(Interfaces.EVENT_CATALOG));
  assert.equal(Interfaces.EVENT_CATALOG[26].normalDenominator, 4500);
}

function testEventsArePluggableButInactiveByDefault() {
  const calls = [];
  const registry = new Interfaces.EventRegistry();
  const definition = new Interfaces.EventDefinition({
    id: 'heart-rush',
    displayName: 'Heart Rush',
    prepare(context) { calls.push(['prepare', context]); return { beats: 0 }; },
    applyPhysics(context, state) { state.beats++; calls.push(['physics', context, state.beats]); },
    onContact(context, state) { calls.push(['contact', context, state.beats]); },
    resolve(context, state) { calls.push(['resolve', context, state.beats]); return 'reward'; },
    cleanup(context, state) { calls.push(['cleanup', context, state.beats]); },
  });
  registry.register(definition);
  assert.equal(registry.roll({ mode: 'normal', oddsProfile: 'normal', seed: 42 }), null,
    'the architecture wave must not install gameplay event selection');
  registry.setRollStrategy((request, definitions) => request.seed === 42 ? definitions[0].id : null);
  assert.equal(registry.roll({ mode: 'normal', oddsProfile: 'normal', seed: 42 }), definition);
  assert.equal(registry.roll({ mode: 'normal', oddsProfile: 'normal', seed: 43 }), null);

  const controller = new Interfaces.EventController(registry);
  assert.equal(controller.prepare('heart-rush', { flip: 1 }), definition);
  controller.applyPhysics({ frame: 1 });
  controller.onContact({ surface: 'table' });
  assert.equal(controller.resolve({ result: 'MAKE' }), 'reward');
  controller.cleanup({ done: true });
  assert.equal(controller.active(), null);
  assert.deepEqual(calls.map((entry) => entry[0]), [
    'prepare', 'physics', 'contact', 'resolve', 'cleanup',
  ]);
}

function testVersionedDataContracts() {
  const landing = Interfaces.LandingVerdict.fromLegacy('MAKE', {
    reason: 'cap', onCap: true, tilt: Math.PI, rotations: 2.1, bankHits: 3,
  });
  assert.equal(landing.phase, 'resolved');
  assert.equal(landing.pose, 'cap');
  assert.equal(landing.result, 'MAKE');
  assert.equal(landing.banks, 3);
  assert.ok(Object.isFrozen(landing));
  assert.throws(() => Interfaces.LandingVerdict({ phase: 'contact', result: 'MISS' }),
    /Only a resolved landing/);

  const progression = Interfaces.ProgressionStateV3({
    qualifyingWins: 6,
    ownedObjectIds: ['bottle', 'coffee-mug'],
  });
  assert.equal(progression.schema, 'ProgressionStateV3');
  assert.equal(progression.version, 3);
  assert.ok(Object.isFrozen(progression.ownedObjectIds));

  assert.equal(Interfaces.FlipRecordV1({ id: 'flip-1' }).version, 1);
  assert.equal(Interfaces.MatchRecordV1({ id: 'match-1' }).schema, 'MatchRecordV1');
  assert.equal(Interfaces.NetworkEnvelopeV2({ matchId: 'match-1' }).version, 2);
  assert.throws(() => Interfaces.StatsStore({ recordFlip: noop }), /recordMatch/);
}

function testOutcomeLifecycleAndSnapshots() {
  const errors = [];
  const hub = new Runtime.constructors.OutcomeHub({ now: () => 1234, onError: (error) => errors.push(error) });
  const seen = [];
  hub.on('*', (event) => seen.push(event));
  hub.on('flip.started.v1', () => { throw new Error('observer failure'); });
  const lifecycle = new Runtime.constructors.Lifecycle(hub);

  lifecycle.matchStarted({ match: 1 });
  lifecycle.flipStarted({ flip: 1 });
  lifecycle.contact({ contact: 1 });
  lifecycle.settling({ still: false });
  lifecycle.flipResolved({ result: 'MAKE' });
  lifecycle.matchResolved({ winner: 0 });

  assert.deepEqual(seen.map((event) => event.type), [
    'match.started.v1', 'flip.started.v1', 'landing.contact.v1',
    'landing.settling.v1', 'flip.resolved.v1', 'match.resolved.v1',
  ]);
  assert.ok(seen.every((event) => event.timestamp === 1234 && Object.isFrozen(event)));
  assert.equal(errors.length, 1, 'one observer must not prevent later observers');
  assert.deepEqual(lifecycle.snapshot(), { screen: 'game-over', matchActive: false, landingPhase: null });

  const live = { state: 'RESULT', players: [{ name: 'P1', lives: 3 }] };
  const snapshot = Runtime.captureGame(live);
  live.players[0].lives = 0;
  assert.equal(snapshot.players[0].lives, 3, 'observers receive detached game snapshots');
  assert.ok(Object.isFrozen(snapshot.players));
}

function testModeAndNameEntrypoints() {
  const modes = new Runtime.constructors.ModeAdapterRegistry();
  let resolved = 0;
  modes.register({
    id: 'cup',
    prepareMatch(request) {
      return { ...request, options: { ...request.options, prepared: true } };
    },
    resolveFlip() { resolved++; return true; },
  });
  const request = modes.prepareMatch({ defs: [], direction: 1, options: { format: 'cup' } });
  assert.equal(request.options.prepared, true);
  assert.equal(modes.active().id, 'cup');
  assert.equal(modes.resolveFlip({}), true);
  assert.equal(resolved, 1);

  const names = new Runtime.constructors.NamePolicyEntrypoint();
  assert.deepEqual(names.validate(' Legacy '), {
    valid: true, ok: true, value: ' Legacy ', error: null, code: null,
  });
  names.install({
    validate(value) {
      return value === 'blocked'
        ? { valid: false, code: 'blocked-term' }
        : { valid: true, value: value.normalize('NFKC') };
    },
  });
  assert.equal(names.validate('Ａda').value, 'Ada');
  assert.deepEqual(names.validate('blocked'), {
    valid: false,
    ok: false,
    value: 'blocked',
    error: 'Choose a different name.',
    code: 'blocked-term',
  });
}

function testStatsWritesAreScheduledAndIsolated() {
  const hub = new Runtime.constructors.OutcomeHub({ now: () => 1 });
  const work = [];
  const errors = [];
  const stats = new Runtime.constructors.StatsInstrumentation(hub, {
    schedule: (fn) => work.push(fn),
    onError: (error) => errors.push(error),
  });
  const calls = [];
  stats.install({
    recordFlip(event) { calls.push(event.type); },
    recordMatch() { throw new Error('storage unavailable'); },
  });
  hub.emit('flip.resolved.v1', { result: 'MAKE' });
  hub.emit('match.resolved.v1', { winner: 0 });
  assert.deepEqual(calls, [], 'stats work must not execute in the gameplay call stack');
  work.splice(0).forEach((fn) => fn());
  assert.deepEqual(calls, ['flip.resolved.v1']);
  assert.equal(errors.length, 1, 'storage errors remain outside gameplay');
  stats.dispose();
}

function testStatsRecordPassthroughIsDetached() {
  const seen = [];
  const unsubscribeFlip = Runtime.outcomes.on('flip.resolved.v1', (event) => seen.push(event));
  const flipRecord = { matchId: 'm-1', cosmeticId: 'cosmetic.chrome', before: { lives: 3 } };
  Runtime.bridge.flipResolved({
    game: { state: 'RESULT', players: [{ id: 'p-1', name: 'Player', lives: 4 }] },
    result: 'MAKE',
    record: flipRecord,
  });
  flipRecord.before.lives = 99;
  unsubscribeFlip();
  assert.equal(seen.length, 1);
  assert.equal(seen[0].payload.record.matchId, 'm-1');
  assert.equal(seen[0].payload.record.before.lives, 3,
    'per-flip stats payload must be detached from live UI state');

  const matches = [];
  const unsubscribeMatch = Runtime.outcomes.on('match.resolved.v1', (event) => matches.push(event));
  const matchRecord = { completionReason: 'last-player-standing', totalFlips: 12 };
  Runtime.bridge.matchResolved({
    game: { state: 'GAME_OVER', players: [] },
    match: { record: matchRecord },
  });
  matchRecord.totalFlips = 1000;
  unsubscribeMatch();
  assert.equal(matches[0].payload.record.totalFlips, 12,
    'per-match stats payload must be detached from live UI state');
}

function testArtBootstrapIsCompleteAndLazy() {
  const art = require('../js/v111-bootstrap.js');
  assert.equal(art.objectIds.length, 25);
  assert.equal(art.variantIds.length, 300);
  assert.equal(art.platform.cacheInfo().variantsBuilt, 0,
    'bootstrapping the full pack must not construct painters');
  assert.equal(art.object('pinata').displayName, 'Piñata');
  assert.equal(art.variant('coffee-mug.blue-steel').variantId, 'blue-steel');
  const renderVariant = art.getRenderVariant('coffee-mug', 'blue-steel');
  assert.equal(Interfaces.assertRenderVariant(renderVariant), renderVariant);
}

function testBrowserGlobalsAndLoaderSeams() {
  const context = vm.createContext({ console, Map, Set, Promise });
  [
    'js/v111-interfaces.js',
    'js/v111-runtime.js',
    'js/v111-art-platform.js',
    'js/v111-object-manifest.js',
    'js/v111-art-reference.js',
    'js/v111-art-pack-a.js',
    'js/v111-art-pack-b.js',
    'js/v111-art-pack-c.js',
    'js/v111-bootstrap.js',
  ].forEach((file) => vm.runInContext(read(file), context, { filename: file }));
  assert.equal(context.FlipgameV111, context.FlipgameV111Runtime);
  assert.equal(context.NamePolicy, context.FlipgameV111.namePolicy);
  assert.equal(context.FlipgameV111.interfaces.EVENT_IDS.length, 30);
  assert.equal(context.FlipgameV111Art.objectIds.length, 25);
  assert.equal(context.FlipgameV111.art.current(), context.FlipgameV111Art);
  assert.equal(context.FlipgameV111Art.platform.cacheInfo().variantsBuilt, 0);

  const scripts = [...read('js/v111-boot.js').matchAll(/['"](js\/[^"]+?\.js\?v=111)['"]/g)]
    .map((match) => match[1].replace(/\?v=\d+$/, ''));
  const position = (file) => scripts.indexOf(file);
  assert.ok(position('js/v111-interfaces.js') < position('js/v111-runtime.js'));
  assert.ok(position('js/v111-runtime.js') < position('js/v111-bootstrap.js'));
  assert.ok(position('js/v111-art-pack-c.js') < position('js/v111-bootstrap.js'));
  assert.ok(position('js/v111-bootstrap.js') < position('js/main.js'));

  const main = read('js/main.js');
  for (const hook of ['prepareMatch', 'resolveFlip', 'advanceTurn', 'matchStarted',
    'flipStarted', 'flipResolved', 'matchResolved', 'menuEntered']) {
    assert.ok(main.includes(`v111Bridge('${hook}'`), `main.js is missing the ${hook} seam`);
  }
}

testFrozenInterfaceCatalog();
testEventsArePluggableButInactiveByDefault();
testVersionedDataContracts();
testOutcomeLifecycleAndSnapshots();
testModeAndNameEntrypoints();
testStatsWritesAreScheduledAndIsolated();
testStatsRecordPassthroughIsDetached();
testArtBootstrapIsCompleteAndLazy();
testBrowserGlobalsAndLoaderSeams();

console.log('v111 architecture tests passed.');
