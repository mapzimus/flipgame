'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const REQUIRED_VIEWPORTS = Object.freeze([
  [360, 740], [768, 1024], [1280, 720],
  [1366, 768], [1920, 1080], [3840, 2160],
]);

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
  const pointerTypes = ['touch', 'pen', 'mouse'];
  const results = [];
  for (const [width, height] of REQUIRED_VIEWPORTS) {
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

function canonicalPoint(width, height, point, timeStamp) {
  return {
    clientX: point[0] * width / 1280,
    clientY: point[1] * height / 720,
    timeStamp,
  };
}

function testLowMidHighGestureCorpusAndSpinParity() {
  const corpus = [
    { id: 'low', start: [480, 620], samples: [[488, 562, 100]], up: [496, 520, 200] },
    { id: 'mid', start: [480, 620], samples: [[500, 520, 50]], up: [520, 420, 100] },
    { id: 'high', start: [480, 620], samples: [[512, 460, 40]], up: [544, 340, 80] },
  ];
  const pointerTypes = ['touch', 'pen', 'mouse'];
  const byGesture = new Map();

  for (const gesture of corpus) {
    const outcomes = [];
    for (const [width, height] of REQUIRED_VIEWPORTS) {
      for (const pointerType of pointerTypes) {
        const signal = runGesture({
          width,
          height,
          pointerType,
          start: canonicalPoint(width, height, gesture.start, 0),
          samples: gesture.samples.map((sample) =>
            canonicalPoint(width, height, sample, sample[2])),
          up: canonicalPoint(width, height, gesture.up, gesture.up[2]),
        });
        assert.ok(signal, `${gesture.id} ${pointerType} gesture did not qualify at ${width}x${height}`);
        const physics = loadPhysics();
        physics.setProfile(null);
        physics.init(width, height);
        physics.setFeel('standard');
        physics.applyFlick(signal.vx, signal.vy, 9871, 1, 'disabled');
        outcomes.push({ signal, spin: physics.getLastFlickInfo().spin,
          pointerType, width, height });
      }
    }
    const reference = outcomes[0];
    for (const outcome of outcomes) {
      const velocity = Math.hypot(outcome.signal.vx, outcome.signal.vy);
      const referenceVelocity = Math.hypot(reference.signal.vx, reference.signal.vy);
      assert.ok(Math.abs(velocity - referenceVelocity) <= referenceVelocity * 0.02,
        `${gesture.id} launch velocity drifted at ${outcome.width}x${outcome.height}/${outcome.pointerType}`);
      assert.ok(Math.abs(outcome.spin - reference.spin) <= 0.03,
        `${gesture.id} spin drifted at ${outcome.width}x${outcome.height}/${outcome.pointerType}`);
    }
    byGesture.set(gesture.id, reference);
  }

  const powers = corpus.map((gesture) => Math.abs(byGesture.get(gesture.id).signal.vy));
  assert.ok(powers[0] < powers[1] && powers[1] < powers[2],
    `low/mid/high launch corpus collapsed: ${powers.join(', ')}`);
  const spins = corpus.map((gesture) => Math.abs(byGesture.get(gesture.id).spin));
  assert.ok(spins[0] < spins[1] && spins[1] < spins[2],
    `low/mid/high spin response collapsed: ${spins.join(', ')}`);
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

  for (const [width, height] of [[360, 640], [1280, 720], [3840, 2160]]) {
    const x = width * 0.5;
    const y = height * 0.5;
    assert.equal(runGesture({ width, height,
      start: { clientX: x, clientY: y, timeStamp: 0 },
      up: { clientX: x, clientY: y - 21 * height / 720, timeStamp: 20 },
    }), null, `canonical 21px threshold drifted at ${width}x${height}`);
    assert.ok(runGesture({ width, height,
      start: { clientX: x, clientY: y, timeStamp: 0 },
      up: { clientX: x, clientY: y - 22 * height / 720, timeStamp: 20 },
    }), `canonical 22px threshold drifted at ${width}x${height}`);
  }

  const quantized = runGesture({ width: 1280, height: 720,
    start: { clientX: 300, clientY: 500, timeStamp: 10 },
    samples: [{ clientX: 300, clientY: 420, timeStamp: 10 }],
    up: { clientX: 300, clientY: 380, timeStamp: 20 },
  });
  assert.ok(Math.abs(quantized.vy) <= 5000,
    'equal timestamps manufactured an extreme velocity spike');

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

function resolvePhysicalSignal(vx, vy, seed) {
  const physics = loadPhysics();
  physics.setProfile(null);
  physics.init(1280, 720);
  physics.setFeel('standard');
  physics.applyFlick(vx, vy, seed, 1, 'disabled');
  let sawContact = false;
  let sawSettling = false;
  for (let frame = 1; frame <= 1200; frame += 1) {
    physics.step(1 / 60);
    const before = physics.getLandingLifecycle();
    if (before.phase === 'contact') {
      sawContact = true;
      assert.equal(physics.checkLanding(), null,
        'ordinary shot resolved on its first contact frame');
      continue;
    }
    if (before.phase === 'settling') sawSettling = true;
    const verdict = physics.checkLanding();
    if (verdict) {
      const lifecycle = physics.getLandingLifecycle();
      assert.equal(sawContact, true, 'ordinary verdict skipped contact');
      assert.equal(sawSettling, true, 'ordinary verdict skipped settling');
      assert.ok(lifecycle.settleMs <= 4017,
        `ordinary settle limit exceeded: ${lifecycle.settleMs}ms`);
      return { verdict, lifecycle };
    }
  }
  throw new Error(`ordinary signal did not resolve for seed ${seed}`);
}

function testLowMidHighPhysicalOutcomesAndSettlement() {
  const signals = [
    { id: 'low', vx: 80, vy: -580 },
    { id: 'mid', vx: 400, vy: -2000 },
    { id: 'high', vx: 800, vy: -4000 },
  ];
  const rows = [];
  for (const signal of signals) {
    for (let seed = 1; seed <= 18; seed += 1) {
      rows.push({ id: signal.id,
        ...resolvePhysicalSignal(signal.vx, signal.vy, seed) });
    }
  }
  const low = rows.filter((row) => row.id === 'low');
  assert.ok(low.every((row) => row.verdict === 'MISS'),
    'low-power corpus unexpectedly became a full-flip band');
  assert.ok(low.some((row) => row.lifecycle.reason === 'underrotated'),
    'low-power misses lost the under-rotation reason');
  assert.ok(rows.some((row) => row.verdict === 'MAKE'),
    'controlled corpus contains no physical make path');
  assert.ok(rows.some((row) => row.verdict === 'MISS'),
    'controlled corpus contains no physical miss path');
}

function testPracticeConsumerUsesReleaseSignal() {
  const source = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
  const start = source.indexOf('function practiceMeterFromDrag');
  const end = source.indexOf('\n  function onFlick', start);
  const meter = source.slice(start, end);
  assert.match(meter, /canonicalDistance \+ 1e-6 < 22/);
  assert.match(meter, /drag\.launchVx/);
  assert.match(meter, /drag\.launchVy/);
  assert.match(meter, /Physics\.previewInput/);
  assert.doesNotMatch(source, /vx \*= 1\.32|vx \*= 0\.92/,
    'device-type launch equalizer remains in main');
  assert.doesNotMatch(meter, /liveDx|matchMedia|pointerType/,
    'live Practice meter still uses a different device/displacement signal');
}

testLaneRelativeAndPointerParity();
testLowMidHighGestureCorpusAndSpinParity();
testCoalescedAndPointerUpSamples();
testThresholdAndCancellation();
testFeelIsBoundedPrelaunchTransfer();
testLowMidHighPhysicalOutcomesAndSettlement();
testPracticeConsumerUsesReleaseSignal();

console.log('v1.12 lane-relative input and prelaunch Feel tests passed.');
