#!/usr/bin/env node

'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const dynamicsPath = path.join(root, 'js', 'v111-legacy-object-dynamics.js');
const castPath = path.join(root, 'js', 'cast25.js');
const skinsPath = path.join(root, 'js', 'skins.js');
const Dynamics = require(dynamicsPath);

const EXPECTED_IDS = [
  'bottle', 'ketchup', 'maple', 'honeybear', 'babybottle', 'extinguisher',
  'soap', 'hourglass', 'bowlingpin', 'cone', 'flask', 'shell', 'pawn',
  'buoy', 'wineglass', 'toucan', 'trex', 'whippedcream', 'potion',
  'tabasco', 'coke', 'stanley', 'lavalamp', 'lawnchair', 'octopus', 'alien',
];

function recordingContext() {
  const calls = [];
  const methods = new Set([
    'save', 'restore', 'beginPath', 'closePath', 'clip', 'rotate', 'translate',
    'scale', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'arc',
    'ellipse', 'fill', 'stroke', 'roundRect', 'fillRect', 'strokeRect', 'drawImage',
  ]);
  return {
    calls,
    ctx: new Proxy({}, {
      get(target, property) {
        if (property === 'calls') return calls;
        if (methods.has(property)) return (...args) => calls.push([property, ...args]);
        return target[property];
      },
      set(target, property, value) {
        calls.push(['set', property, value]);
        target[property] = value;
        return true;
      },
    }),
  };
}

function loadCast25() {
  class FakeImage {
    constructor() { this.onload = null; this.src = ''; }
  }
  const window = {};
  const context = vm.createContext({
    window,
    Image: FakeImage,
    requestIdleCallback() {},
    setTimeout() {},
    Math,
    Object,
  });
  vm.runInContext(fs.readFileSync(castPath, 'utf8'), context, { filename: 'cast25.js' });
  return window.FLIP_CAST25;
}

function trexFunctionSource() {
  const source = fs.readFileSync(skinsPath, 'utf8');
  const start = source.indexOf('  function trexBodySVG(p) {');
  const end = source.indexOf('\n  function drawTrex', start);
  assert.ok(start >= 0 && end > start, 'protected T-Rex function could not be isolated');
  return source.slice(start, end).replace(/\r/g, '');
}

function main() {
  assert.deepEqual(Array.from(Dynamics.ids), EXPECTED_IDS);
  assert.ok(Object.isFrozen(Dynamics));
  assert.ok(Object.isFrozen(Dynamics.ids));

  for (const id of EXPECTED_IDS) {
    const profile = Dynamics.profileFor(id);
    const face = Dynamics.faceFor(id);
    assert.ok(profile, `${id} has no legacy dynamics profile`);
    assert.equal(profile.paintOnly, true, `${id} dynamics are not declared paint-only`);
    assert.ok(Object.isFrozen(profile), `${id} profile is mutable`);
    assert.ok(face && Object.isFrozen(face) && Object.isFrozen(face.anchor), `${id} face metadata is not immutable`);
    assert.ok(Number.isFinite(face.anchor.x) && Number.isFinite(face.anchor.y));
    assert.ok(face.focusRadius > 0);
  }
  assert.equal(Dynamics.profileFor('not-an-object'), null);
  assert.deepEqual(EXPECTED_IDS.filter((id) => Dynamics.profileFor(id).canSpill), ['flask', 'wineglass'],
    'sealed or rigid legacy objects were allowed to spill');

  const options = {
    time: 3.25,
    motionSeed: 12345,
    angle: 8.9,
    slosh: 0.72,
    angularVelocity: -4.2,
    velocity: { x: 260, y: -810 },
    airborne: true,
    emotion: 'scared',
  };
  const a = Dynamics.normalizeState(options);
  const b = Dynamics.normalizeState(options);
  assert.deepEqual(a, b, 'the same replay state did not produce the same normalized dynamics');
  assert.ok(Object.isFrozen(a) && Object.isFrozen(a.velocity) && Object.isFrozen(a.contentShift));
  assert.ok(a.angle >= -Math.PI && a.angle <= Math.PI);
  assert.equal(a.emotion, 'scared');

  const reduced = Dynamics.normalizeState({ ...options, reducedMotion: true });
  assert.equal(reduced.time, 0);
  assert.equal(reduced.slosh, 0);
  assert.equal(reduced.angularVelocity, 0);
  assert.deepEqual(reduced.velocity, { x: 0, y: 0 });
  assert.deepEqual(reduced.contentShift, { x: 0, y: 0 });
  assert.equal(reduced.accessoryLag, 0);
  assert.equal(reduced.outwardMotion, 0);
  assert.equal(reduced.emotion, 'scared', 'reduced motion removed the non-motion emotion cue');

  const snapshot = Dynamics.physicalDynamicsSnapshot('flask', options);
  assert.equal(snapshot.kind, 'open-liquid');
  assert.equal(snapshot.canSpill, true);
  assert.equal(snapshot.paintOnly, true);
  assert.ok(Object.isFrozen(snapshot));

  for (const id of ['toucan', 'octopus']) {
    const one = recordingContext();
    const two = recordingContext();
    assert.equal(Dynamics.paintUnderlay(one.ctx, id, options), true);
    assert.equal(Dynamics.paintUnderlay(two.ctx, id, options), true);
    assert.deepEqual(one.calls, two.calls, `${id} underlay is not deterministic`);
  }
  for (const emotion of ['scared', 'smile', 'frown']) {
    const one = recordingContext();
    const two = recordingContext();
    assert.equal(Dynamics.paintOverlay(one.ctx, 'bottle', { ...options, emotion }), true);
    assert.equal(Dynamics.paintOverlay(two.ctx, 'bottle', { ...options, emotion }), true);
    assert.deepEqual(one.calls, two.calls, `bottle ${emotion} face is not deterministic`);
  }

  // The user's absolute protected invariant: neither dynamics nor emotion
  // overlays ever draw on the original dinosaur, and its authored function is
  // byte-for-byte the integration baseline.
  assert.equal(Dynamics.profileFor('trex').protected, true);
  assert.equal(Dynamics.faceFor('trex').supportsEmotion, false);
  const trexCtx = recordingContext();
  assert.equal(Dynamics.paintUnderlay(trexCtx.ctx, 'trex', options), false);
  assert.equal(Dynamics.paintOverlay(trexCtx.ctx, 'trex', options), false);
  assert.deepEqual(trexCtx.calls, []);
  assert.equal(
    crypto.createHash('sha256').update(trexFunctionSource()).digest('hex'),
    'b9a17149070e2d753d1b8b205260e7e06ce3fddf1a959f3d46721ba815f6d53d',
    'the original T-Rex SVG implementation changed',
  );

  const Cast = loadCast25();
  assert.deepEqual(Array.from(Cast.ROSTER, (entry) => entry.id), EXPECTED_IDS);
  const baseState = { ...options, angle: Math.PI, slosh: 0.6 };
  const flaskUpright = recordingContext();
  const flaskInverted = recordingContext();
  Cast.drawFns.flask(flaskUpright.ctx, { ...baseState, angle: 0 });
  Cast.drawFns.flask(flaskInverted.ctx, baseState);
  assert.ok(flaskInverted.calls.length > flaskUpright.calls.length,
    'the open flask did not gain a visible inverted pour treatment');
  const ketchupUpright = recordingContext();
  const ketchupInverted = recordingContext();
  Cast.drawFns.ketchup(ketchupUpright.ctx, { ...baseState, angle: 0 });
  Cast.drawFns.ketchup(ketchupInverted.ctx, baseState);
  assert.deepEqual(ketchupInverted.calls.map((call) => call[0]), ketchupUpright.calls.map((call) => call[0]),
    'the sealed ketchup bottle gained spill-only paint operations');

  const animatedA = recordingContext();
  const animatedB = recordingContext();
  Cast.drawFns.potion(animatedA.ctx, { ...baseState, angle: 0.4, time: 0.5 });
  Cast.drawFns.potion(animatedB.ctx, { ...baseState, angle: 0.4, time: 1.7 });
  assert.notDeepEqual(animatedA.calls, animatedB.calls, 'suspended potion contents did not move');
  const frozenA = recordingContext();
  const frozenB = recordingContext();
  Cast.drawFns.potion(frozenA.ctx, { ...baseState, angle: 0.4, time: 0.5, reducedMotion: true });
  Cast.drawFns.potion(frozenB.ctx, { ...baseState, angle: 0.4, time: 1.7, reducedMotion: true });
  assert.deepEqual(frozenA.calls, frozenB.calls, 'reduced-motion potion contents did not freeze');

  const castSource = fs.readFileSync(castPath, 'utf8');
  const dynamicsSource = fs.readFileSync(dynamicsPath, 'utf8');
  assert.doesNotMatch(castSource, /Math\.random\s*\(/, 'legacy content paint uses nondeterministic randomness');
  assert.doesNotMatch(dynamicsSource, /Math\.random\s*\(/, 'legacy dynamics API uses nondeterministic randomness');
  assert.doesNotMatch(dynamicsSource,
    /\b(?:Matter|Physics)\s*\.|\b(?:setMass|setInertia)\s*\(|\b(?:collisionFilter|landingTolerance|score|lives)\s*[:=]/,
    'paint-only legacy module contains gameplay or physics ownership');

  console.log('v1.11 legacy object dynamics tests passed (26 objects; T-Rex protected).');
}

main();
