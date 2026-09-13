'use strict';
// Battle host coverage: the real private application, the real lane runtime, and
// a fake stage and lane standing in for the page. The host must satisfy the
// route's FlipgameV112BattleHostV1 contract, carry one reservation from setup to
// reward, and add no authority of its own on the way.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const Host = require('../js/v112-battle-host.js');
const Routes = require('../js/v112-battle-routes.js');

const Root = path.resolve(__dirname, '..');
// The runtime resolves a lane's promise in a microtask; let those drain.
const settle = async () => { for (let turn = 0; turn < 4; turn += 1) await Promise.resolve(); };

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
  vm.runInContext(fs.readFileSync(path.join(Root, 'js/v112-browser-bundle.js'), 'utf8'), context);
  const app = context.FlipgameV112;
  await app.ready;
  return app;
}

// A stage that records the listeners the runtime attaches, so a test can deliver
// pointer events the same way a browser would.
function stage(width = 1200, height = 600) {
  const handlers = new Map();
  const captured = new Set();
  return {
    width,
    attached: () => handlers.size,
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height, right: width, bottom: height }),
    addEventListener(type, handler) { handlers.set(type, handler); },
    removeEventListener(type) { handlers.delete(type); },
    setPointerCapture(id) { captured.add(id); },
    releasePointerCapture(id) { captured.delete(id); },
    hasPointerCapture(id) { return captured.has(id); },
    fire(type, event) {
      const handler = handlers.get(type);
      assert.ok(handler, 'the runtime listens for ' + type);
      handler(event);
    },
  };
}

const pointerEvent = (pointerId, clientX, clientY, timeStamp) => ({
  pointerId, clientX, clientY, timeStamp, pointerType: 'touch',
  pressure: 0.5, preventDefault() {},
});

// A lane whose launch stays airborne until the test lands it, exactly as a real
// physics lane settles a flip. Reporting the pose is the adapter's only power.
function lane() {
  const launches = [];
  const airborne = [];
  return {
    launches, airborne,
    factory: (context) => ({
      resources: context.resources,
      launch(value) {
        launches.push(value);
        return new Promise((resolve) => { airborne.push({ value, resolve }); });
      },
      reset() {},
    }),
    async land(pose) {
      const next = airborne.shift();
      assert.ok(next, 'a lane can only land an attempt it launched');
      next.resolve({ pose });
      await settle();
      return next.value;
    },
  };
}

// The physics surface a Battle borrows from the page. Only the order in which it
// is taken and given back matters here.
function table(options = {}) {
  const log = [];
  return {
    log,
    open(context) {
      log.push('open');
      if (options.failsToOpen) throw new Error('The table could not be brought up');
      return context;
    },
    close() { log.push('close'); },
  };
}

// Runs the host's frame clock by hand so a series never depends on wall time.
function clock() {
  let pending = null;
  let at = 0;
  return {
    now: () => at,
    requestFrame(fn) { pending = fn; return 1; },
    cancelFrame() { pending = null; },
    advance(ms = 16) {
      at += ms;
      const fn = pending;
      pending = null;
      if (fn) fn();
      return !!fn;
    },
    pending: () => !!pending,
  };
}

function build(app, options = {}) {
  const surface = options.stage || stage();
  const track = options.lane || lane();
  const tick = options.clock || clock();
  const lent = options.table || table();
  const host = Host.createBattleHost({
    application: app,
    laneAdapterFactory: track.factory,
    laneCapacity: options.laneCapacity || 1,
    measureDisplay: () => options.display || { width: 360, observedContacts: 1 },
    openLane: lent.open, closeLane: lent.close,
    now: tick.now, requestFrame: tick.requestFrame, cancelFrame: tick.cancelFrame,
  });
  return { host, stage: surface, lane: track, clock: tick, table: lent };
}

const roster = (count) => Array.from({ length: count }, (_, index) => ({
  id: 'entry-' + (index + 1), displayName: 'Entry ' + (index + 1), type: 'human',
}));

// A closing application refuses to drop a Battle that is still owed rewards, so
// a plain finally would replace the assertion that left it there. The first
// failure always wins, and a teardown fault still fails a passing body.
async function withHost(options, body) {
  const app = await application();
  const context = build(app, options);
  let failure = null;
  try { await body(context, app); } catch (error) { failure = error; }
  for (const teardown of [() => context.host.close(), () => app.close()]) {
    try { teardown(); } catch (error) { failure = failure || error; }
  }
  if (failure) throw failure;
}

function flick(context, laneId, laneCount, counter) {
  const index = Number(String(laneId).replace('lane-', '')) - 1;
  const width = context.stage.width / laneCount;
  const x = index * width + width / 2;
  counter.pointerId += 1;
  counter.at += 200;
  context.stage.fire('pointerdown', pointerEvent(counter.pointerId, x, 420, counter.at));
  context.stage.fire('pointermove', pointerEvent(counter.pointerId, x + 4, 340, counter.at + 40));
  context.stage.fire('pointerup', pointerEvent(counter.pointerId, x + 8, 250, counter.at + 80));
}

// Plays whichever lanes the screen is currently showing until the series settles.
async function playSeries(context) {
  const counter = { pointerId: 0, at: 0, attempts: 0 };
  const seen = new Set();
  const poses = ['upright', 'cap', 'miss'];
  let guard = 0;
  while (context.host.snapshot().status === 'playing') {
    assert.ok((guard += 1) < 200, 'A Battle series must terminate');
    const view = context.host.snapshot();
    const projected = Routes.project(view);
    assert.ok(projected.lanes.length, 'A running heat shows at least one lane');
    const laneCount = view.state.config.hardware.activeLaneLimit;
    for (const shown of projected.lanes) {
      seen.add(shown.playerId);
      flick(context, shown.laneId, laneCount, counter);
    }
    assert.equal(context.lane.airborne.length, projected.lanes.length,
      'Every shown lane reaches the lane adapter');
    for (const launch of context.lane.launches.splice(0)) {
      assert.equal(launch.randomEventsEnabled, false, 'A Battle lane runs no ordinary events');
      assert.equal(launch.crossLaneCollisions, false);
      assert.equal(launch.matchId, view.state.matchId);
    }
    while (context.lane.airborne.length) {
      await context.lane.land(poses[counter.attempts % poses.length]);
      counter.attempts += 1;
    }
    context.clock.advance();
  }
  return { seen, attempts: counter.attempts };
}

function testTheRouteAcceptsThisHost() {
  return withHost({}, async (context, app) => {
    assert.equal(context.host.schema, 'FlipgameV112BattleHostV1');
    for (const key of ['capabilities', 'prepare', 'start', 'cancel', 'snapshot',
      'subscribe', 'choosePower', 'abandon', 'retryFinalization']) {
      assert.equal(typeof context.host[key], 'function', key + ' is part of the host contract');
    }
    // The host must not offer the screen a way to score or reward anything.
    for (const key of ['submitResult', 'resolveAttempt', 'recordAttempt', 'finalize',
      'grant', 'tick', 'startHeat', 'advanceClock']) {
      assert.equal(context.host[key], undefined, key + ' must not be reachable from the route');
    }
    assert.equal(context.host.snapshot(), null, 'A host with no series has nothing to project');
    // Route capability validation is the same gate the screen applies.
    const profile = context.host.capabilities();
    assert.equal(profile.activeLaneLimit, 1);
    assert.equal(profile.fallback, 'alternating-relay');
  });
}

function testOneLaneCapacityNeverClaimsSimultaneousPlay() {
  return withHost({ display: { width: 1920, observedContacts: 4 }, laneCapacity: 1 }, async (context, app) => {
    const profile = context.host.capabilities();
    assert.equal(profile.verifiedContacts, 1, 'A contact is only verified if a lane can run it');
    assert.equal(profile.activeLaneLimit, 1);
    assert.equal(profile.simultaneous, false);
    assert.equal(profile.fallback, 'alternating-relay');
  });
}

function testAWholeRelaySeriesReachesTheReward() {
  return withHost({}, async (context, app) => {
    const woken = [];
    context.host.subscribe(() => woken.push(context.host.snapshot().status));
    context.host.capabilities();
    const ticket = context.host.prepare({ formatId: 'duel', paceId: 'volley',
      powerProfileId: 'sport', players: roster(2) });
    assert.ok(ticket.handle, 'prepare returns the reservation the route carries');
    assert.equal(context.host.snapshot(), null, 'A reservation alone is not a series');

    context.host.start(ticket.handle, { stage: context.stage });
    assert.ok(context.stage.attached() > 0, 'The runtime listens on the stage it was given');
    assert.deepEqual(context.table.log, ['open'], 'A live heat opens the lane surface once');
    let view = context.host.snapshot();
    assert.equal(view.status, 'playing');
    assert.equal(view.state.schema, 'BattleStateV1');
    assert.equal(view.state.phase, 'active');
    assert.equal(Routes.project(view).lanes.length, 1, 'One verified contact plays one lane');

    const { seen, attempts } = await playSeries(context);
    assert.equal(seen.size, 2, 'An alternating relay gives both competitors a turn');
    assert.ok(attempts >= 10, 'A best-of-three series takes more than a few flips');

    for (let turn = 0; turn < 50 && context.host.snapshot().status === 'finalizing'; turn += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    view = context.host.snapshot();
    assert.equal(view.status, 'settled');
    assert.equal(view.state.phase, 'complete');
    assert.ok(view.state.winnerId);
    assert.equal(view.state.heatResults.length >= 2, true);
    assert.deepEqual(view.lanes, [], 'A settled series shows no live lane');
    assert.ok(app.snapshot().profile.fxp > 0, 'The completed series was rewarded');
    assert.ok(woken.length > 3, 'The screen was woken as the series moved');
    assert.ok(!context.clock.pending(), 'A settled series stops the frame clock');
    assert.deepEqual(context.table.log, ['open', 'close'],
      'A rewarded series gives the lane surface back');
    assert.equal(app.battle.snapshot().status, 'completed');
  });
}

function testTwoVerifiedContactsPlayTwoLanesAtOnce() {
  return withHost({ display: { width: 1280, observedContacts: 2 }, laneCapacity: 2 }, async (context, app) => {
    const profile = context.host.capabilities();
    assert.equal(profile.activeLaneLimit, 2);
    assert.equal(profile.simultaneous, true);
    const ticket = context.host.prepare({ formatId: 'doubles', paceId: 'volley',
      powerProfileId: 'sport', players: roster(4) });
    context.host.start(ticket.handle, { stage: context.stage });
    const projected = Routes.project(context.host.snapshot());
    assert.equal(projected.lanes.length, 2, 'Two verified contacts play two lanes');
    assert.equal(new Set(projected.lanes.map((entry) => entry.playerId)).size, 2);

    const { seen } = await playSeries(context);
    assert.equal(seen.size, 4, 'A 2v2 rotation seats every player');
    for (let turn = 0; turn < 50 && context.host.snapshot().status === 'finalizing'; turn += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const view = context.host.snapshot();
    assert.equal(view.status, 'settled');
    assert.ok(['team-a', 'team-b'].includes(view.state.winnerId), 'A 2v2 series is won by a team');
    assert.ok(app.snapshot().profile.fxp > 0);
  });
}

function testLeavingMidSeriesEarnsNothing() {
  return withHost({}, async (context, app) => {
    context.host.capabilities();
    const ticket = context.host.prepare({ formatId: 'duel', paceId: 'volley',
      powerProfileId: 'sport', players: roster(2) });
    context.host.start(ticket.handle, { stage: context.stage });
    await context.host.abandon();
    assert.equal(context.host.snapshot().status, 'settled');
    assert.equal(app.snapshot().profile.fxp, 0, 'An abandoned Battle awards nothing');
    assert.equal(app.battle.snapshot(), null, 'Leaving consumes the reservation');
    assert.ok(!context.clock.pending(), 'Leaving stops the frame clock');
    assert.equal(context.stage.attached(), 0, 'Leaving releases the stage listeners');
    assert.deepEqual(context.table.log, ['open', 'close'], 'Leaving gives the lane surface back');
  });
}

// The lane surface is the page's, not the host's. A heat that cannot get it must
// leave nothing behind: no listeners, no frame clock, and no reservation the
// route cannot cancel.
function testALaneSurfaceThatWillNotOpenLeavesNothingBehind() {
  return withHost({ table: table({ failsToOpen: true }) }, async (context, app) => {
    context.host.capabilities();
    const ticket = context.host.prepare({ formatId: 'duel', paceId: 'volley',
      powerProfileId: 'sport', players: roster(2) });
    assert.throws(() => context.host.start(ticket.handle, { stage: context.stage }),
      /could not be brought up/);
    assert.deepEqual(context.table.log, ['open', 'close']);
    assert.equal(context.stage.attached(), 0, 'A failed heat listens to nothing');
    assert.ok(!context.clock.pending(), 'A failed heat runs no frame clock');
    assert.equal(context.host.snapshot(), null, 'A failed heat is not a series');
    assert.equal(app.battle.snapshot().status, 'reserved',
      'The reservation never went live, so it is still the route s to cancel');
    context.host.cancel(ticket.handle);
    assert.equal(app.battle.snapshot(), null);
    assert.equal(app.snapshot().profile.fxp, 0);
  });
}

function testAnUnstartedReservationCancels() {
  return withHost({}, async (context, app) => {
    context.host.capabilities();
    const ticket = context.host.prepare({ formatId: 'duel', paceId: 'volley',
      powerProfileId: 'sport', players: roster(2) });
    assert.equal(app.battle.snapshot().status, 'reserved');
    context.host.cancel(ticket.handle);
    assert.equal(app.battle.snapshot(), null);
    assert.equal(context.host.snapshot(), null);
    assert.throws(() => context.host.start(ticket.handle, { stage: context.stage }),
      /reservation is not current/);
  });
}

async function run() {
  await testTheRouteAcceptsThisHost();
  await testOneLaneCapacityNeverClaimsSimultaneousPlay();
  await testAnUnstartedReservationCancels();
  await testALaneSurfaceThatWillNotOpenLeavesNothingBehind();
  await testLeavingMidSeriesEarnsNothing();
  await testAWholeRelaySeriesReachesTheReward();
  await testTwoVerifiedContactsPlayTwoLanesAtOnce();
  console.log('v1.12 Battle host tests passed: the route contract, a lane capacity that never claims simultaneous play, a borrowed lane surface opened once and always given back, a whole relay series and a two-lane 2v2 series from reservation to reward, and reservations released on cancel and on leaving.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
