'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const Driver = require('../js/v112-physics-driver.js');
const root = path.resolve(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));
function load(withComposition = false) {
  const storage = new Map();
  const context = vm.createContext({ console, crypto: webcrypto, AbortController,
    window: { matchMedia: () => ({ matches: false }) },
    localStorage: { getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    navigator: { locks: { request(_name, options, callback) {
      if (options.ifAvailable && options.signal) throw new Error('invalid native lock options');
      return Promise.resolve().then(() => callback({ name: 'writer' }));
    } } },
  });
  for (const name of ['vendor/matter.min.js', 'v111-interfaces.js', 'v111-physics-events.js', 'physics.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'js', name), 'utf8'), context, { filename: name });
  }
  const physics = vm.runInContext('Physics', context);
  physics.init(1280, 720); physics.setProfile(null);
  if (withComposition) vm.runInContext(fs.readFileSync(path.join(root, 'js/v112-browser-bundle.js'), 'utf8'), context);
  return { context, physics, app: context.FlipgameV112 };
}
function launch(h, driver, seed, power = 2400, dt = 1 / 60, event = null) {
  h.physics.resetBottle(); h.physics.seedTurn(seed);
  if (event) h.physics.forceSpecialEvent(event);
  if (driver) driver.armLaunch({ manual: true });
  h.physics.applyFlick(0, -power, seed, 1, event ? 'normal' : 'disabled');
  const trace = [];
  for (let tick = 0; tick < 1500; tick++) {
    h.physics.step(dt);
    const body = h.physics.getBottle();
    if (tick % 30 === 0) trace.push([body.position.x, body.position.y, body.angle,
      body.velocity.x, body.velocity.y, body.angularVelocity]);
    const result = h.physics.checkLanding();
    if (result) return { result, ticks: tick + 1, trace, info: plain(h.physics.getLastLandingInfo()) };
  }
  throw new Error('Physics shot did not finish');
}
function testPassiveParityAndExactLanding() {
  const baseline = load(), observed = load();
  const driver = Driver.create(observed.physics);
  const frames = [];
  driver.subscribe(() => { if (driver.snapshot()) frames.push(driver.snapshot()); });
  for (const [seed, dt] of [[1, 1 / 60], [5, 1 / 60], [19, 1 / 30], [103, 1 / 120]]) {
    frames.length = 0;
    const before = launch(baseline, null, seed, 2400, dt), after = launch(observed, driver, seed, 2400, dt);
    assert.deepEqual(after, before, 'passive hooks preserve every sampled trajectory and original verdict');
    const terminal = frames.filter(frame => frame.landing);
    assert.equal(terminal.length, 1);
    assert.equal(terminal[0].landing.result, after.result);
    assert.equal(terminal[0].landing.reason, after.info.reason);
    assert.equal(terminal[0].landing.pose, after.info.onCap ? 'cap' : after.result === 'MAKE' ? 'upright' : 'miss');
    const sameTime = frames.filter(frame => frame.atMs === terminal[0].atMs);
    assert(sameTime.some(frame => !frame.landing), 'landing notification follows fixed step at the same engine time');
    const count = frames.length;
    observed.physics.checkLanding(); observed.physics.step(1 / 60);
    assert.equal(frames.length, count, 'repeated legacy verdict reads/steps cannot publish another driver resolution');
    assert(Object.isFrozen(terminal[0]) && Object.isFrozen(terminal[0].landing));
  }
  // The observer never calls checkLanding. No verdict is created merely by
  // stepping, even though the object physically comes to rest.
  observed.physics.resetBottle(); driver.armLaunch({ manual: false });
  observed.physics.applyFlick(0, -2400, 45, 1, 'disabled');
  for (let tick = 0; tick < 360; tick++) observed.physics.step(1 / 60);
  assert.equal(observed.physics.getLastLandingInfo(), null);
  assert.equal(driver.snapshot().manual, false);
  driver.close();
}
function testMarkersAndUnsupportedEvents() {
  const h = load(), driver = Driver.create(h.physics);
  let count = 0; driver.subscribe(() => count++);
  h.physics.applyFlick(0, -2400, 10, 1, 'disabled');
  h.physics.step(1 / 60);
  assert.equal(driver.snapshot(), null, 'unmarked legacy launches do not become reward-bearing');
  h.physics.resetBottle();
  assert.throws(() => driver.armLaunch({ manual: 1 }), /exact manual boolean/);
  driver.armLaunch({ manual: true });
  assert.throws(() => driver.armLaunch({ manual: true }), /already armed/);
  assert.equal(driver.cancelArmedLaunch(), true);
  assert.equal(driver.cancelArmedLaunch(), false);
  launch(h, driver, 66, 2400, 1 / 60, 'moon-gravity');
  assert.equal(driver.snapshot().supported, false);
  assert.equal(driver.status().warning, 'event-adapter-required');
  driver.close(); const closedCount = count;
  h.physics.resetBottle(); h.physics.step(1 / 60);
  assert.equal(count, closedCount); assert.throws(() => driver.armLaunch({ manual: true }), /closed/);
}
async function testActualEngineComposition() {
  const h = load(true); await h.app.ready;
  const driver = Driver.create(h.physics); h.app.attachPhysics(driver);
  h.app.beginSession({ startingLives: 3, roster: [{ name: 'One' }, { name: 'Two' }] });
  let state = h.app.snapshot(); h.app.subscribe(value => { state = value; });
  const results = [];
  for (let index = 0; index < 100 && state.session.status === 'active'; index++) {
    const shot = launch(h, driver, index + 1, 1400 + (index % 9) * 300);
    results.push(shot.result);
    if (driver.status().warning) throw new Error(driver.status().warning);
    if (state.warning) throw new Error(state.warning);
    assert.equal(state.session.lastLanding.result, shot.result);
    assert.equal(state.session.rules.sequence, index + 1);
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(state.session.status, 'completed', 'real engine → branded Rules → Profile match completes');
  assert(state.profile.fxp > 0); assert(results.includes('MAKE') && results.includes('MISS'));
  const fxp = state.profile.fxp;
  await h.app.retryFinalization(); assert.equal(h.app.snapshot().profile.fxp, fxp);
  h.app.beginSession({ activityId: 'practice', roster: [{ name: 'One' }] });
  const practice = launch(h, driver, 500);
  assert.equal(h.app.snapshot().session.lastLanding.result, practice.result);
  assert.equal(h.app.snapshot().session.practice.flips, 1);
  assert.equal(h.app.snapshot().profile.fxp, fxp);
  h.app.abandonSession(); h.app.close(); driver.close();
  console.log('Actual game engine integration:', results.length, 'flips,', fxp, 'FXP; Practice excluded');
}
(async () => {
  testPassiveParityAndExactLanding(); testMarkersAndUnsupportedEvents();
  await testActualEngineComposition();
  console.log('Physics driver: exact engine parity, launch qualification, CPU marker, one-use landing and real composition passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
