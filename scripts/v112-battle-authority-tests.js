'use strict';
// Application coverage for the private Battle authority. The lane runtime plays
// the series here exactly as a browser host would, and the composition decides
// whether that series is worth anything. A host that inflates a score, renames
// its setup or submits an unfinished heat must earn nothing.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const Runtime = require('../js/v112-battle-runtime.js');

const Root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(Root, file), 'utf8');
// Values built inside the vm realm carry that realm's prototypes; re-home them
// before a Node-realm module or an assertion sees them.
const home = (value) => JSON.parse(JSON.stringify(value));

async function application() {
  const store = new Map();
  const context = vm.createContext({
    console, crypto: webcrypto, AbortController, setTimeout,
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
  type: 'human', flipperId: 'bottle',
}));

const pointer = (pointerId, clientX, clientY, timeStamp) => ({
  pointerId, clientX, clientY, timeStamp, pointerType: 'touch',
  pressure: 0.5, preventDefault() {},
});

const laneRects = (count, width = 1200, height = 600) =>
  Array.from({ length: count }, (_, index) => ({
    laneId: `lane-${index + 1}`, left: index * (width / count), top: 0,
    width: width / count, height,
  }));

// Records the launch envelopes the runtime hands a lane and leaves every attempt
// airborne, so the series only advances when this harness reports a pose.
function laneHarness() {
  const launches = [];
  return {
    launches,
    factory: (context) => ({
      resources: context.resources,
      launch(value) { launches.push(value); },
      reset() {},
    }),
  };
}

// Plays a whole series through the runtime: every idle assigned lane takes a
// qualified upward flick, then each launched attempt reports a pose.
function playSeries(config, options = {}) {
  const rects = laneRects(config.hardware.activeLaneLimit);
  const harness = laneHarness();
  const runtime = Runtime.createBattleRuntime({
    matchId: config.matchId, config, laneRects: rects,
    laneAdapterFactory: harness.factory,
  });
  const poses = options.poses || ['upright', 'cap', 'miss'];
  const seen = new Set();
  let pointerId = 0;
  let clock = 0;
  let attempts = 0;
  let turns = 0;
  runtime.startHeat();
  while (runtime.snapshot().battle.phase !== 'complete') {
    assert.ok((turns += 1) < 400, 'A Battle series must terminate');
    const view = runtime.snapshot();
    if (view.battle.phase === 'between-heats') { runtime.startHeat(); continue; }
    const idle = view.lanes.filter((lane) => lane.playerId && lane.state === 'ready');
    assert.ok(idle.length, 'An active heat always waits on at least one lane');
    for (const lane of idle) {
      const rect = rects[lane.laneIndex];
      const x = rect.left + rect.width / 2;
      clock += 200;
      pointerId += 1;
      assert.equal(runtime.handlePointerDown(pointer(pointerId, x, 420, clock)), true);
      assert.equal(runtime.handlePointerMove(pointer(pointerId, x + 4, 340, clock + 40)), true);
      assert.equal(runtime.handlePointerUp(pointer(pointerId, x + 8, 250, clock + 80)), true);
      seen.add(lane.playerId);
    }
    const inFlight = harness.launches.splice(0);
    assert.ok(inFlight.length, 'A prepared lane must reach its adapter');
    for (const launch of inFlight) {
      runtime.resolveAttempt(launch.laneId, launch.attemptId, { pose: poses[attempts % poses.length] });
      attempts += 1;
    }
  }
  assert.deepEqual(home(runtime.drainErrors()), [], 'A clean series logs no runtime error');
  const state = home(runtime.snapshot().battle);
  runtime.destroy();
  return { state, seen, attempts };
}

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

async function testTheHostOwnsNoRulesAuthority(app) {
  app.battle.observeDisplay({ width: 1280, observedContacts: 2 });
  const prepared = app.battle.prepare({ players: roster(2) });
  const state = playSeries(home(prepared.config)).state;
  assert.throws(() => app.battle.submitResult(prepared.handle, state),
    /not running/, 'A reserved series is not a running one');
  assert.throws(() => app.battle.start('battle-forged'), /not current/);
  app.battle.start(prepared.handle);
  assert.throws(() => app.battle.start(prepared.handle), /already started/);
  assert.equal(app.battle.snapshot().status, 'playing');
  assert.equal(app.battle.snapshot().state, null, 'The composition holds no series until one is submitted');
  for (const name of ['recordAttempt', 'markLaunch', 'startHeat', 'advanceClock',
    'choosePower', 'consumePower', 'resolve', 'finalize', 'grant']) {
    assert.equal(app.battle[name], undefined, name + ' must not be reachable from a host');
  }
  await app.battle.retryFinalization().then(
    () => { throw new Error('An unsubmitted Battle must not finalize'); },
    (error) => assert.match(error.message, /still running/),
  );
  app.battle.abandon('test');
  assert.equal(app.battle.snapshot(), null);
}

function testACompletedSeriesEarnsRealRewards(hardware, formatId, playerCount) {
  return withApplication(async (app) => {
    const before = app.snapshot().profile;
    app.battle.observeDisplay(hardware);
    const prepared = app.battle.prepare({ battleFormatId: formatId, players: roster(playerCount) });
    app.battle.start(prepared.handle);
    const { state, seen, attempts } = playSeries(home(prepared.config));

    assert.equal(state.phase, 'complete');
    assert.ok(state.winnerId, 'A completed series names a winner');
    assert.ok(['battle-heat-target', 'battle-pressure-heat'].includes(state.completionReason));
    assert.ok(state.heatResults.length >= 2 && state.heatResults.length <= 3);
    assert.equal(seen.size, prepared.config.players.length,
      'Every competitor at the table takes a turn');
    assert.ok(attempts >= 10, 'A best-of-three volley series takes more than a few flips');

    await app.battle.submitResult(prepared.handle, state);
    const view = app.battle.snapshot();
    assert.equal(view.status, 'completed');
    assert.equal(view.state.winnerId, state.winnerId);
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
    assert.ok(app.snapshot().profile.fxp > before.fxp, 'A completed Battle awards FXP');

    // The reservation is spent: the same series cannot be banked twice.
    assert.throws(() => app.battle.submitResult(prepared.handle, state), /not running/);
    app.battle.abandon('after-completion');
  });
}

// Each of these is a host telling the composition something the attempts it
// submitted do not support. None of them may reach the reward authority.
function testForgedSeriesEarnNothing() {
  return withApplication(async (app) => {
    const before = app.snapshot().profile;
    app.battle.observeDisplay({ width: 360, observedContacts: 1 });
    const prepared = app.battle.prepare({ players: roster(2) });
    app.battle.start(prepared.handle);
    const honest = playSeries(home(prepared.config)).state;

    const inflated = home(honest);
    inflated.scores[inflated.winnerId] += 5;
    assert.throws(() => app.battle.submitResult(prepared.handle, inflated),
      'An inflated score must not follow from the attempt ledger');

    const stolen = home(honest);
    const loser = Object.keys(stolen.scores).find((id) => id !== stolen.winnerId);
    stolen.winnerId = loser;
    assert.throws(() => app.battle.submitResult(prepared.handle, stolen),
      'A series winner must be the competitor its heats produced');

    const dropped = home(honest);
    dropped.resolvedAttempts.pop();
    dropped.resolvedAttemptIds.pop();
    assert.throws(() => app.battle.submitResult(prepared.handle, dropped),
      'A ledger cannot lose the attempts its scores came from');

    const foreign = home(honest);
    foreign.matchId = 'local-someone-elses-match';
    foreign.config.matchId = foreign.matchId;
    assert.throws(() => app.battle.submitResult(prepared.handle, foreign),
      /another match/);

    const reshaped = home(honest);
    reshaped.config.players[0].displayName = 'Somebody Else';
    assert.throws(() => app.battle.submitResult(prepared.handle, reshaped),
      /contradicts the reserved Battle setup/);

    const wrongShape = home(honest);
    wrongShape.schema = 'BattleStateV2';
    assert.throws(() => app.battle.submitResult(prepared.handle, wrongShape),
      /BattleStateV1 series is required/);

    assert.equal(app.snapshot().profile.fxp, before.fxp, 'No forged series awarded FXP');
    assert.equal(app.battle.snapshot().status, 'playing', 'The reservation is still open');
    assert.equal(app.battle.snapshot().state, null);

    // The honest series it actually played still settles.
    await app.battle.submitResult(prepared.handle, honest);
    assert.equal(app.battle.snapshot().status, 'completed');
    assert.ok(app.snapshot().profile.fxp > before.fxp);
    app.battle.abandon('after-completion');
  });
}

function testAnUnfinishedSeriesEarnsNothing() {
  return withApplication(async (app) => {
    app.battle.observeDisplay({ width: 360, observedContacts: 1 });
    const prepared = app.battle.prepare({ players: roster(2) });
    app.battle.start(prepared.handle);
    const config = home(prepared.config);
    const Battle = require('../js/v112-battle.js');
    const opening = home(Battle.startHeat(Battle.createState(config)));
    assert.throws(() => app.battle.submitResult(prepared.handle, opening),
      /completed Battle series/, 'A heat in progress is not a result');
    assert.equal(app.snapshot().profile.fxp, 0);
    app.battle.abandon('left-mid-series');
    assert.equal(app.battle.snapshot(), null, 'Leaving a Battle consumes its reservation');
  });
}

async function run() {
  await withApplication(async (app) => {
    await testDisplayQualification(app);
    await testRosterAndFormatRules(app);
    await testTheHostOwnsNoRulesAuthority(app);
  });
  await testACompletedSeriesEarnsRealRewards({ width: 360, observedContacts: 1 }, 'duel', 2);
  await testACompletedSeriesEarnsRealRewards({ width: 1280, observedContacts: 2 }, 'doubles', 4);
  await testForgedSeriesEarnNothing();
  await testAnUnfinishedSeriesEarnsNothing();
  console.log('v1.12 Battle authority tests passed: measured display qualification, format and roster rules, no host rules authority, real one-lane and two-lane series rewarded through the runtime, and forged or unfinished series earning nothing.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
