'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

class FakeCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.listeners = new Map();
  }

  addEventListener(type, handler) { this.listeners.set(type, handler); }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: this.width, height: this.height };
  }
  setPointerCapture() {}
  emit(type, values = {}) {
    const event = {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 0,
      clientY: 0,
      timeStamp: 0,
      preventDefault() {},
      ...values,
    };
    const handler = this.listeners.get(type);
    if (!handler) throw new Error(`No ${type} listener`);
    handler(event);
  }
}

function loadInput() {
  const context = vm.createContext({ console, performance: { now: () => 0 } });
  const source = fs.readFileSync(path.join(root, 'js/input.js'), 'utf8') +
    '\nthis.__input = Input;';
  vm.runInContext(source, context, { filename: 'js/input.js' });
  return context.__input;
}

function runGesture({ width, height, pointerType = 'mouse', start, samples, up }) {
  const input = loadInput();
  const canvas = new FakeCanvas(width, height);
  let launched = null;
  input.attach(canvas, (vx, vy, type) => { launched = { vx, vy, type }; });
  input.enable();
  canvas.emit('pointerdown', { ...start, pointerType });
  for (const sample of samples || []) {
    canvas.emit('pointermove', { ...sample, pointerType });
  }
  canvas.emit('pointerup', { ...up, pointerType });
  return launched;
}

function testLaneRelativeAndPointerParity() {
  const viewports = [[360, 640], [1280, 720], [3840, 2160]];
  const pointerTypes = ['touch', 'pen', 'mouse'];
  const results = [];
  for (const [width, height] of viewports) {
    for (const pointerType of pointerTypes) {
      results.push(runGesture({
        width,
        height,
        pointerType,
        start: { clientX: width * 0.40, clientY: height * 0.75, timeStamp: 100 },
        samples: [{ clientX: width * 0.45, clientY: height * 0.60, timeStamp: 180 }],
        up: { clientX: width * 0.50, clientY: height * 0.55, timeStamp: 260 },
      }));
    }
  }
  for (const result of results) {
    assert.ok(result, 'qualified lane-relative gesture did not launch');
    assert.ok(Math.abs(result.vx - results[0].vx) <= Math.abs(results[0].vx) * 0.02,
      `horizontal launch drifted across device/pointer: ${result.vx} vs ${results[0].vx}`);
    assert.ok(Math.abs(result.vy - results[0].vy) <= Math.abs(results[0].vy) * 0.02,
      `vertical launch drifted across device/pointer: ${result.vy} vs ${results[0].vy}`);
  }
}

function testCoalescedAndPointerUpSamples() {
  const input = loadInput();
  const canvas = new FakeCanvas(1280, 720);
  let launched = null;
  input.attach(canvas, (vx, vy) => { launched = { vx, vy }; });
  input.enable();
  canvas.emit('pointerdown', { clientX: 400, clientY: 500, timeStamp: 0 });
  canvas.emit('pointermove', {
    clientX: 400,
    clientY: 450,
    timeStamp: 30,
    getCoalescedEvents: () => [
      { clientX: 400, clientY: 480, timeStamp: 10 },
      { clientX: 400, clientY: 400, timeStamp: 20 },
    ],
  });
  const live = input.getDragState();
  assert.equal(Math.round(live.launchVy), -8000,
    'live meter did not use the fastest coalesced sample');
  canvas.emit('pointerup', { clientX: 400, clientY: 450, timeStamp: 40 });
  assert.equal(Math.round(launched.vy), Math.round(live.launchVy),
    'release launch did not match the live coalesced signal');

  const upOnly = runGesture({
    width: 1280,
    height: 720,
    start: { clientX: 300, clientY: 500, timeStamp: 0 },
    up: { clientX: 340, clientY: 400, timeStamp: 50 },
  });
  assert.deepEqual({ vx: Math.round(upOnly.vx), vy: Math.round(upOnly.vy) },
    { vx: 800, vy: -2000 }, 'pointer-up-only motion was discarded');
}

function testThresholdAndCancellation() {
  assert.equal(runGesture({
    width: 1280, height: 720,
    start: { clientX: 100, clientY: 100, timeStamp: 0 },
    up: { clientX: 121, clientY: 100, timeStamp: 10 },
  }), null, '21px should remain inside the dead zone');
  assert.ok(runGesture({
    width: 1280, height: 720,
    start: { clientX: 100, clientY: 100, timeStamp: 0 },
    up: { clientX: 122, clientY: 100, timeStamp: 10 },
  }), '22px must qualify');

  for (const cancellation of ['pointercancel', 'lostpointercapture']) {
    const input = loadInput();
    const canvas = new FakeCanvas(1280, 720);
    let launches = 0;
    input.attach(canvas, () => { launches += 1; });
    input.enable();
    canvas.emit('pointerdown', { clientX: 300, clientY: 500, timeStamp: 0 });
    canvas.emit('pointermove', { clientX: 300, clientY: 350, timeStamp: 50 });
    canvas.emit(cancellation, { clientX: 300, clientY: 350, timeStamp: 55 });
    canvas.emit('pointerup', { clientX: 300, clientY: 300, timeStamp: 60 });
    assert.equal(launches, 0, `${cancellation} emitted a phantom flick`);
    assert.equal(input.getDragState(), null, `${cancellation} left stale drag state`);
  }
}

function loadPhysics({ coarse = false } = {}) {
  const context = vm.createContext({
    console,
    Math,
    window: { matchMedia: () => ({ matches: coarse }) },
  });
  for (const relative of [
    'js/vendor/matter.min.js',
    'js/v111-interfaces.js',
    'js/v111-physics-events.js',
    'js/physics.js',
  ]) {
    let source = fs.readFileSync(path.join(root, relative), 'utf8');
    if (relative === 'js/physics.js') source += '\nthis.__physics = Physics;';
    vm.runInContext(source, context, { filename: relative });
  }
  return context.__physics;
}

function testFeelIsBoundedPrelaunchTransfer() {
  const physics = loadPhysics();
  const rawCases = [
    { vx: 500, vy: -1800 },
    { vx: -420, vy: -2500 },
    { vx: 300, vy: -3800 },
    { vx: 100, vy: -900 },
  ];
  for (const input of rawCases) {
    for (const mode of ['standard', 'pro']) {
      const raw = physics.previewInput(input.vx, input.vy, mode);
      assert.equal(raw.vx, input.vx);
      assert.equal(raw.vy, input.vy);
      assert.equal(raw.mode, mode);
    }
    const forgiving = physics.previewInput(input.vx, input.vy, 'forgiving');
    assert.equal(forgiving.vx, input.vx, 'Forgiving changed horizontal aim');
    const correction = Math.abs(Math.abs(forgiving.vy) - Math.abs(input.vy));
    assert.ok(correction <= Math.abs(input.vy) * 0.08 + Number.EPSILON,
      'Forgiving exceeded its eight-percent correction cap');
  }

  physics.setProfile(null);
  physics.init(1280, 720);
  const spins = {};
  for (const feel of ['standard', 'pro', 'forgiving']) {
    physics.resetBottle();
    physics.setFeel(feel);
    const preview = physics.previewInput(500, -1800);
    physics.applyFlick(500, -1800, 101, 1, 'disabled');
    const info = physics.getLastFlickInfo();
    assert.equal(info.vx, Math.round(preview.vx));
    assert.equal(info.vy, Math.round(preview.vy));
    assert.equal(info.rawVx, 500);
    assert.equal(info.rawVy, -1800);
    assert.equal(info.feel, feel);
    spins[feel] = info.spin;
  }
  assert.equal(spins.standard, spins.pro,
    'Feel changed postlaunch spin for the same raw transfer');

  physics.resetBottle();
  physics.setFeel('standard');
  physics.applyFlick(500, -2500, 991, 1, 'disabled');
  const controlled = physics.getLastFlickInfo();
  const expectedSpin = (0.105 + (2500 / 4000) * 0.110) *
    controlled.trajectoryJitter.spin;
  assert.ok(Math.abs(controlled.spin - expectedSpin) <= 0.00051,
    `ordinary spin curve drifted: ${controlled.spin} vs ${expectedSpin}`);
}

function testPracticeConsumerUsesReleaseSignal() {
  const source = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
  const start = source.indexOf('function practiceMeterFromDrag');
  const end = source.indexOf('\n  function onFlick', start);
  const meter = source.slice(start, end);
  assert.match(meter, /Math\.hypot\(dx, dy\) < 22/);
  assert.match(meter, /drag\.launchVx/);
  assert.match(meter, /drag\.launchVy/);
  assert.match(meter, /Physics\.previewInput/);
  assert.doesNotMatch(source, /vx \*= 1\.32|vx \*= 0\.92/,
    'device-type launch equalizer remains in main');
  assert.doesNotMatch(meter, /liveDx|matchMedia|pointerType/,
    'live Practice meter still uses a different device/displacement signal');
}

testLaneRelativeAndPointerParity();
testCoalescedAndPointerUpSamples();
testThresholdAndCancellation();
testFeelIsBoundedPrelaunchTransfer();
testPracticeConsumerUsesReleaseSignal();

console.log('v1.12 lane-relative input and prelaunch Feel tests passed.');
