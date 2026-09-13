'use strict';
// Application coverage for the private Battle authority. Rules, the launch
// lease, power offers and the series verdict stay inside the composition; this
// harness only plays the part a real host plays, supplying a measured display
// and engine landing frames.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const Root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(Root, file), 'utf8');

// Stands in for PhysicsCompositionDriverV1: one qualified launch, then one
// measured landing. It cannot name a player, a score or a winner.
function engine() {
  let frame = null;
  const wake = new Set();
  let launches = 0;
  function publish(next) { frame = next; wake.forEach((listener) => listener()); }
  return {
    driver: {
      schema: 'PhysicsCompositionDriverV1',
      snapshot: () => frame,
      subscribe(listener) { wake.add(listener); return () => wake.delete(listener); },
    },
    launch({ manual = true } = {}) {
      launches += 1;
      publish({ launchId: 'launch-' + launches, atMs: launches * 1000, qualified: true,
        manual, grounded: false, eventId: null, landing: null });
      return 'launch-' + launches;
    },
    land(pose) {
      const result = pose === 'miss' ? 'MISS' : 'MAKE';
      publish({ launchId: 'launch-' + launches, atMs: launches * 1000 + 900, qualified: true,
        manual: true, grounded: true, eventId: null,
        landing: { result, pose, reason: 'settled', stableForMs: 400 } });
    },
    flip(pose, options) { this.launch(options); this.land(pose); },
  };
}

async function application() {
  const store = new Map();
  const context = vm.createContext({
    console, crypto: webcrypto, AbortController,
    localStorage: {
      getItem: (key) => store.get(key) || null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
    navigator: { locks: { request(_name, _options, callback) {
      return Promise.resolve().then(() => callback({ name: 'battle-writer' }));
    } } },
  });
  vm.runInContext(read('js/v112-browser-bundle.js'), context);
  const app = context.FlipgameV112;
  await app.ready;
  return app;
}

// A closing application refuses to drop a Battle that is still owed rewards, so
// a plain finally would replace the assertion that left it there. The first
// failure always wins, and a teardown fault still fails a passing body.
async function withApplication(body) {
  const app = await application();
  let failure = null;
  try { await body(app); } catch (error) { failure = error; }
  try { app.close(); } catch (error) { failure = failure || error; }
  if (failure) throw failure;
}

const roster = (count) => Array.from({ length: count }, (_, index) => ({
  id: 'entry-' + (index + 1), displayName: 'Entry ' + (index + 1),
  type: index ? 'human' : 'human', flipperId: 'bottle',
}));

async function testDisplayQualification(app) {
  assert.throws(() => app.battle.prepare({ players: roster(2) }),
    /measured display/, 'No heat may start before a display is measured');
  assert.throws(() => app.battle.observeDisplay({ width: 0 }), /measured display width/);

  let profile = app.battle.observeDisplay({ width: 360, observedContacts: 1 });
  assert.equal(profile.activeLaneLimit, 1);
  assert.equal(profile.simultaneous, false);
  assert.equal(profile.fallback, 'alternating-relay');

  profile = app.battle.observeDisplay({ width: 1280, observedContacts: 2 });
  assert.equal(profile.activeLaneLimit, 2);
  assert.equal(profile.verifiedContacts, 2);

  // A narrow layout cannot inherit the wide display's lane count.
  profile = app.battle.observeDisplay({ width: 700, observedContacts: 1 });
  assert.equal(profile.activeLaneLimit, 1);
  assert.equal(profile.verifiedContacts, 2, 'Verified contacts never fall back down');
}

async function testRosterAndFormatRules(app) {
  app.battle.observeDisplay({ width: 1280, observedContacts: 2 });
  assert.throws(() => app.battle.prepare({ battleFormatId: 'relay', players: roster(2) }),
    /supported Battle format/);
  assert.throws(() => app.battle.prepare({ paceId: 'blitz', players: roster(2) }),
    /Equal Volley or Timed Rush/);
  assert.throws(() => app.battle.prepare({ powerProfileId: 'chaos', players: roster(2) }),
    /Sport or Mayhem/);
  assert.throws(() => app.battle.prepare({ physicsModeId: 'alien', players: roster(2) }),
    /Normal or INSANE MODE/);
  assert.throws(() => app.battle.prepare({ battleFormatId: 'duel', players: roster(3) }),
    /two players/);
  assert.throws(() => app.battle.prepare({ battleFormatId: 'team', players: roster(4) }),
    /even 6–16 players/);
  assert.equal(app.battle.snapshot(), null, 'A rejected setup leaves no reservation');

  const prepared = app.battle.prepare({ battleFormatId: 'doubles', players: roster(4) });
  // Array.from re-homes the composition's array: a vm realm array never compares
  // deep-equal to one built out here, however identical its entries are.
  assert.deepEqual(Array.from(prepared.config.players, (player) => player.teamId),
    ['team-a', 'team-b', 'team-a', 'team-b'], 'Seats alternate into two equal teams');
  assert.equal(prepared.config.schema, 'BattleConfigV1');
  assert.equal(prepared.request.formatId, 'battle');
  assert.equal(prepared.request.activityId, 'free-play');
  assert.throws(() => app.beginSession({ roster: [{ name: 'One' }, { name: 'Two' }] }),
    /leave the current Battle/, 'A Battle reservation blocks an ordinary match');
  app.battle.cancel(prepared.handle);
  assert.equal(app.battle.snapshot(), null);
}

async function testHostCannotForgeAVerdict(app) {
  app.battle.observeDisplay({ width: 1280, observedContacts: 2 });
  const prepared = app.battle.prepare({ players: roster(2) });
  assert.throws(() => app.battle.start('battle-forged'), /not current/);
  assert.equal(app.battle.snapshot().status, 'reserved');
  assert.equal(app.battle.snapshot().state, null);
  app.battle.start(prepared.handle);
  assert.throws(() => app.battle.start(prepared.handle), /already started/);
  const view = app.battle.snapshot();
  assert.equal(view.state.schema, 'BattleStateV1');
  assert.equal(view.state.phase, 'active');
  assert.equal(view.state.heatNumber, 1);
  for (const name of ['recordAttempt', 'resolve', 'finalize', 'grant', 'markLaunch', 'startHeat']) {
    assert.equal(app.battle[name], undefined, name + ' must not be reachable from a host');
  }
  await app.battle.retryFinalization().then(
    () => { throw new Error('An unfinished Battle must not finalize'); },
    (error) => assert.match(error.message, /still running/),
  );
  app.battle.abandon('test');
  assert.equal(app.battle.snapshot(), null);
}

// Plays whichever competitor Rules is waiting for until the series completes.
async function playSeries(app, hardware) {
  const observed = engine();
  app.attachPhysics(observed.driver);
  app.battle.observeDisplay(hardware);
  const prepared = app.battle.prepare({ players: roster(2), seed: 7 });
  app.battle.start(prepared.handle);

  const poses = ['upright', 'cap', 'miss'];
  const seen = new Set();
  let turns = 0;
  while (app.battle.snapshot() && app.battle.snapshot().status === 'playing') {
    const view = app.battle.snapshot();
    const launcher = view.launcherId;
    assert.ok(launcher, 'Rules always names the competitor a heat is waiting for');
    seen.add(launcher);
    observed.flip(poses[turns % poses.length]);
    turns += 1;
    assert.ok(turns < 400, 'A Battle series must terminate');
  }
  await Promise.resolve();
  return { observed, prepared, turns, seen };
}

function testCompleteSeriesEarnsRealRewards() {
  return withApplication(async (app) => {
    const before = app.snapshot().profile;
    const { turns, seen } = await playSeries(app, { width: 360, observedContacts: 1 });
    // Wait for the reward transaction the terminal attempt started.
    for (let tick = 0; tick < 50 && app.battle.snapshot() && app.battle.snapshot().status === 'finalizing'; tick += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const view = app.battle.snapshot();
    assert.equal(view.status, 'completed');
    assert.equal(view.state.phase, 'complete');
    assert.ok(view.state.winnerId, 'A completed series names a winner');
    assert.ok(['battle-heat-target', 'battle-pressure-heat'].includes(view.state.completionReason));
    assert.ok(view.state.heatResults.length >= 2 && view.state.heatResults.length <= 3);
    assert.equal(view.launcherId, null, 'A completed series waits for nobody');
    assert.equal(seen.size, 2, 'Alternating relay gives both competitors a turn');
    assert.ok(turns >= 10, 'A best-of-three volley series takes more than a few flips');

    const after = app.snapshot().profile;
    assert.ok(after.fxp > before.fxp, 'A completed Battle awards FXP');
    assert.equal(view.resolution.status, 'completed');
    assert.equal(view.resolution.activityId, 'free-play');

    const reward = view.resolution.presentation.rewards.reward;
    assert.equal(reward.eligible, true, 'A local Battle between humans earns rewards');
    assert.equal(reward.outcome, 'human-win');
    // A Battle counts heats, so its setup bonus comes from the Battle mode and
    // never from the starting-lives band an ordinary match would claim.
    assert.equal(reward.breakdown.setupParts.lives, 0);
    assert.ok(reward.breakdown.setupParts.mode > 0, 'Battle earns its own mode bonus');
    assert.ok(reward.breakdown.attempts > 0, 'Manual human flips count toward the reward');
    app.battle.abandon('after-completion');
  });
}

function testRelayRefusesAnUnexpectedSecondFlight() {
  return withApplication(async (app) => {
    const observed = engine();
    app.attachPhysics(observed.driver);
    app.battle.observeDisplay({ width: 360, observedContacts: 1 });
    const prepared = app.battle.prepare({ players: roster(2) });
    app.battle.start(prepared.handle);
    observed.launch();
    const inFlight = app.snapshot().warning;
    observed.launch();
    assert.match(app.snapshot().warning || '', /still in flight/,
      'A second launch before the first lands is rejected');
    assert.notEqual(app.snapshot().warning, inFlight);
    assert.equal(app.battle.snapshot().state.resolvedAttempts.length, 0,
      'A rejected frame scores nothing');
    app.battle.abandon('test');
  });
}

function testPowerOffersComeFromRules() {
  return withApplication(async (app) => {
    const observed = engine();
    app.attachPhysics(observed.driver);
    app.battle.observeDisplay({ width: 1280, observedContacts: 2 });
    const prepared = app.battle.prepare({ players: roster(2), powerProfileId: 'mayhem', seed: 3 });
    app.battle.start(prepared.handle);
    assert.throws(() => app.battle.choosePower({ playerId: 'seat-1', cardId: 'ice-patch' }),
      /not on offer/, 'A card can only be stored once Rules offers it');

    let offered = null;
    for (let turn = 0; turn < 40 && !offered; turn += 1) {
      const launcher = app.battle.snapshot().launcherId;
      if (!launcher) break;
      observed.flip('upright');
      const state = app.battle.snapshot().state;
      offered = Object.keys(state.powerOffers).find((key) => state.powerOffers[key]);
      if (offered) offered = { key: offered, cards: state.powerOffers[offered] };
    }
    assert.ok(offered, 'Three qualified manual launches must earn a power offer');
    assert.equal(offered.cards.length, 2, 'Rules offers exactly two compatible cards');

    const player = app.battle.snapshot().config.players
      .find((entry) => entry.id === offered.key || entry.teamId === offered.key);
    const targeted = offered.cards.find((card) => card.scope === 'target');
    const card = targeted || offered.cards[0];
    const input = { playerId: player.id, cardId: card.id };
    if (targeted) {
      assert.throws(() => app.battle.choosePower(Object.assign({}, input, { targetId: offered.key })),
        /opponent/, 'A targeted card cannot be aimed at its owner');
      input.targetId = Object.keys(app.battle.snapshot().state.scores)
        .find((key) => key !== offered.key);
    }
    app.battle.choosePower(input);
    const stored = app.battle.snapshot().state.storedPowers[offered.key];
    assert.equal(stored.id, card.id);
    assert.throws(() => app.battle.choosePower(input), /not on offer/,
      'Only one power may be stored at a time');
    app.battle.abandon('test');
  });
}

function testTimedRushNeedsItsClock() {
  return withApplication(async (app) => {
    const observed = engine();
    app.attachPhysics(observed.driver);
    app.battle.observeDisplay({ width: 1280, observedContacts: 2 });
    const prepared = app.battle.prepare({ players: roster(2), paceId: 'rush' });
    app.battle.start(prepared.handle);
    assert.equal(app.battle.snapshot().state.config.rushDurationMs, 60000);
    observed.flip('upright');
    const scored = app.battle.snapshot().state;
    assert.equal(scored.resolvedAttempts.length, 1);
    assert.ok(scored.resolvedAttempts[0].launchLease,
      'A Timed Rush result must consume the lease its launch created');
    app.battle.advanceClock(30000);
    assert.equal(app.battle.snapshot().state.elapsedMs, 30000);
    app.battle.advanceClock(30000);
    const expired = app.battle.snapshot().state;
    assert.ok(expired.heatNumber > 1 || expired.phase === 'complete' || expired.suddenDeath,
      'A spent clock ends the heat rather than running on');
    app.battle.abandon('test');
  });
}

async function run() {
  await withApplication(async (app) => {
    await testDisplayQualification(app);
    await testRosterAndFormatRules(app);
    await testHostCannotForgeAVerdict(app);
  });
  await testCompleteSeriesEarnsRealRewards();
  await testRelayRefusesAnUnexpectedSecondFlight();
  await testPowerOffersComeFromRules();
  await testTimedRushNeedsItsClock();
  console.log('v1.12 Battle authority tests passed: measured display qualification, format and roster rules, no host verdict path, a complete relay series with real rewards, Rules-owned power offers and Timed Rush leases.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
