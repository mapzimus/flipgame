#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Matter = require('../js/vendor/matter.min.js');
const LivePlinko = require('../js/v112-plinko-live.js');

const root = path.resolve(__dirname, '..');
const SLOT_KINDS = [
  'double', 'halve', 'magnet', 'lose', 'win',
  'lose', 'magnet', 'halve', 'double',
];

function loadPhysics() {
  const context = vm.createContext({
    console,
    Math,
    window: { matchMedia: () => ({ matches: false }) },
  });
  for (const relative of [
    'js/vendor/matter.min.js',
    'js/v111-interfaces.js',
    'js/v111-physics-events.js',
    'js/v112-plinko-matter.js',
    'js/v112-plinko-live.js',
    'js/physics.js',
  ]) {
    let source = fs.readFileSync(path.join(root, relative), 'utf8');
    if (relative === 'js/physics.js') source += '\nthis.__physics = Physics;';
    vm.runInContext(source, context, { filename: relative });
  }
  return context.__physics;
}

function begin(seed, vx = 320) {
  const physics = loadPhysics();
  physics.init(1280, 800);
  physics.setPlinkoAppearance({
    flipperId: 'protected-selected-flipper',
    variantId: 'test-variant',
    appearanceRevision: 'art-revision-17',
    cosmeticId: 'test-cosmetic',
    authoredParts: ['body', 'top', 'internal-fluid'],
    internalDynamics: ['fluid-slosh-v2'],
  });
  const selected = physics.getBottle();
  const partIds = selected.parts.map((part) => part.id);
  const protectedShape = {
    mass: selected.mass,
    inertia: selected.inertia,
    parts: selected.parts.map((part) => ({
      area: part.area,
      width: part.bounds.max.x - part.bounds.min.x,
      height: part.bounds.max.y - part.bounds.min.y,
    })),
  };
  const material = selected.parts.map((part) => ({
    mask: part.collisionFilter.mask,
    friction: part.friction,
    frictionAir: part.frictionAir,
    restitution: part.restitution,
  }));
  physics.forceSpecialEvent('plinko');
  physics.applyFlick(vx, -2500, seed);
  return { physics, selected, partIds, protectedShape, material };
}

function primitiveSnapshot(snapshot) {
  return {
    slot: snapshot.outcome && snapshot.outcome.slotIndex,
    sensor: snapshot.outcome && snapshot.outcome.sensorRef,
    prize: snapshot.outcome && snapshot.outcome.canonicalPrize,
    settledTick: snapshot.outcome && snapshot.outcome.settledTick,
    contactDigest: snapshot.contactDigest,
    recovery: snapshot.recovery.applied,
    antiBalance: snapshot.recovery.antiBalanceApplied,
  };
}

function runToVerdict(run, maximumTicks = 2100) {
  let verdict = null;
  while (!verdict && run.physics.getPlinkoSnapshot().tick < maximumTicks) {
    run.physics.step(1 / 60);
    verdict = run.physics.checkLanding();
  }
  return verdict;
}

function assertCanonicalOpeningAndBodyPreservation() {
  const run = begin(9123);
  const snapshot = run.physics.getPlinkoSnapshot();
  const board = run.physics.getPlinko();

  assert.equal(run.physics.getBottle(), run.selected,
    'Plinko must keep the exact selected Matter body live');
  assert.deepEqual(run.selected.parts.map((part) => part.id), run.partIds,
    'Plinko must retain every authored compound part');
  assert.equal(run.selected.mass, run.protectedShape.mass,
    'Plinko must not replace or rescale the selected body mass');
  assert.equal(run.selected.inertia, run.protectedShape.inertia,
    'Plinko must not replace or rescale the selected body inertia');
  run.selected.parts.forEach((part, index) => {
    assert.equal(part.area, run.protectedShape.parts[index].area);
    assert.equal(part.bounds.max.x - part.bounds.min.x,
      run.protectedShape.parts[index].width);
    assert.equal(part.bounds.max.y - part.bounds.min.y,
      run.protectedShape.parts[index].height);
  });
  assert.equal(snapshot.selectedBodyPreserved, true);
  assert.equal(snapshot.adapter.selected.sameBody, true);
  assert.equal(snapshot.adapter.selected.genericCircle, false);
  assert.equal(snapshot.adapter.selected.appearanceRevision, 'art-revision-17');
  assert.equal(snapshot.adapter.selected.cosmeticId, 'test-cosmetic');
  assert.equal(snapshot.adapter.selected.colliderFingerprint.startsWith('matter-compound-'), true);
  assert.equal(Array.from(snapshot.adapter.selected.authoredParts).join('|'),
    'body|top|internal-fluid');
  assert.equal(Array.from(snapshot.adapter.selected.internalDynamics).join('|'),
    'fluid-slosh-v2');

  assert.equal(board.schema, 'PlinkoLiveRenderBoardV1');
  assert.equal(board.rows, 24);
  assert.equal(board.pegs.length, 252);
  assert.equal(board.dividers.length, 8);
  assert.equal(board.slots.length, 9);
  assert.equal(board.bottom - board.top, 2450);
  assert.deepEqual(Array.from(board.slots, (slot) => slot.kind), SLOT_KINDS);
  for (let index = 1; index < board.slots.length; index += 1) {
    assert.ok(board.slots[index - 1].x1 < board.slots[index].x0,
      'canonical Plinko sensors must be nonoverlapping');
  }

  assert.equal(snapshot.tick, 0);
  assert.equal(snapshot.spring.compressed, true);
  assert.equal(snapshot.spring.applied, false);
  assert.equal(snapshot.boardEnabled, false);
  assert.equal(run.physics.checkLanding(), null,
    'compression alone cannot resolve Plinko');
  assert.equal(run.physics.getViewHint().trackingData.phase, 'trampoline-lock');

  for (let tick = 1; tick < 24; tick += 1) {
    run.physics.step(1 / 60);
    assert.equal(run.physics.checkLanding(), null,
      'Plinko cannot resolve before its one-time spring release');
  }
  assert.equal(run.physics.getPlinkoSnapshot().tick, 23);
  assert.equal(run.physics.getPlinkoSnapshot().spring.applied, false);

  run.physics.step(1 / 60);
  assert.equal(run.physics.checkLanding(), null);
  const released = run.physics.getPlinkoSnapshot();
  assert.equal(released.tick, 24);
  assert.equal(released.spring.applied, true);
  assert.equal(released.spring.appliedTick, 24);
  assert.equal(released.spring.impulse.y, -28);
  assert.equal(run.physics.getViewHint().trackingData.phase, 'object-ascent-follow');

  const verdict = runToVerdict(run);
  const finish = run.physics.getPlinkoSnapshot();
  const info = run.physics.getLastLandingInfo();
  assert.ok(verdict === 'MAKE' || verdict === 'MISS', 'physical Plinko did not resolve');
  assert.ok(finish.outcome, 'resolved Plinko must expose a canonical outcome');
  assert.equal(finish.outcome.actualSensorContact, true);
  assert.equal(finish.outcome.sensorRef, 'sensor:plinko-slot-' + finish.outcome.slotIndex);
  assert.equal(info.plinkoSensorRef, finish.outcome.sensorRef);
  assert.equal(info.plinkoContactDigest, finish.contactDigest);
  assert.equal(info.plinko, finish.outcome.legacyPrize);
  assert.equal(info.plinkoPrize, finish.outcome.canonicalPrize);
  assert.equal(verdict, finish.outcome.legacyPrize === 'lose' ? 'MISS' : 'MAKE');
  assert.equal(run.physics.getViewHint().trackingData.allSlotsVisible, true,
    'the finish camera must expose all nine reward slots');
  return run;
}

function assertDeterministicReplay() {
  const left = begin(43117, -180);
  const right = begin(43117, -180);
  assert.ok(runToVerdict(left));
  assert.ok(runToVerdict(right));
  assert.deepEqual(primitiveSnapshot(left.physics.getPlinkoSnapshot()),
    primitiveSnapshot(right.physics.getPlinkoSnapshot()),
    'identical seed/input must replay the same physical contacts and slot');
}

function assertEngineSeedCorpus() {
  const drops = [];
  const launches = [];
  const slots = new Set();
  for (let seed = 1; seed <= 12; seed += 1) {
    const run = begin(seed, (seed - 6.5) * 24);
    assert.ok(runToVerdict(run), 'live Plinko seed ' + seed + ' did not resolve');
    const snapshot = run.physics.getPlinkoSnapshot();
    launches.push(run.physics.getLastFlickInfo());
    assert.equal(snapshot.outcome.actualSensorContact, true);
    assert.equal(snapshot.outcome.sensorRef,
      'sensor:plinko-slot-' + snapshot.outcome.slotIndex);
    assert.equal(snapshot.selectedBodyPreserved, true);
    drops.push(snapshot.outcome.dropMs);
    slots.add(snapshot.outcome.slotIndex);
    run.physics.cleanupEvent('corpus');
  }
  drops.sort((left, right) => left - right);
  const median = drops[Math.floor(drops.length / 2)];
  assert.ok(median >= 10000 && median <= 15000,
    'live bridge median must stay in the approved 10–15 second window; got ' + median +
      ' from ' + JSON.stringify(drops) + ' launches=' + JSON.stringify(launches));
  assert.ok(slots.size >= 4,
    'the live engine bridge should preserve meaningful slot variation');
  return { median, slotCount: slots.size };
}

function assertCleanupRestoresSelectedBody() {
  const run = assertCanonicalOpeningAndBodyPreservation();
  run.physics.cleanupEvent('bridge-test');
  assert.equal(run.physics.getPlinko(), null);
  assert.equal(run.physics.getPlinkoSnapshot(), null);
  assert.equal(run.physics.getBottle(), run.selected,
    'cleanup must not replace or remove the selected Flipper');
  assert.deepEqual(run.selected.parts.map((part) => part.id), run.partIds);
  run.selected.parts.forEach((part, index) => {
    assert.equal(part.collisionFilter.mask, run.material[index].mask,
      'cleanup must restore the selected collider mask');
    assert.equal(part.friction, run.material[index].friction,
      'cleanup must restore the selected collider friction');
    assert.equal(part.frictionAir, run.material[index].frictionAir,
      'cleanup must restore the selected collider air friction');
    assert.equal(part.restitution, run.material[index].restitution,
      'cleanup must restore the selected collider restitution');
  });
}

function assertPlinkoOwnsAndRestoresGravity() {
  const engine = Matter.Engine.create();
  engine.gravity.x = 0.25;
  engine.gravity.y = 1.5;
  engine.gravity.scale = 0.002;
  const selected = Matter.Body.create({ parts: [
    Matter.Bodies.rectangle(640, 620, 70, 50, { density: 0.0015 }),
    Matter.Bodies.rectangle(640, 658, 74, 70, { density: 0.018 }),
    Matter.Bodies.rectangle(640, 576, 44, 36, { density: 0.0004 }),
  ] });
  Matter.Composite.add(engine.world, selected);
  const live = LivePlinko.create({ Matter });
  live.attach({ engine, world: engine.world, selectedBody: selected,
    width: 1280, height: 800, groundY: 696, seed: 77,
    entryVelocityX: 0.2, angularVelocity: 0.1 });
  assert.deepEqual({ x: engine.gravity.x, y: engine.gravity.y,
    scale: engine.gravity.scale }, { x: 0, y: 1, scale: 0.001 },
  'Plinko must isolate its spring arc from the host gravity profile');
  for (let tick = 1; tick <= 144; tick += 1) live.step();
  assert.deepEqual({ x: engine.gravity.x, y: engine.gravity.y,
    scale: engine.gravity.scale }, { x: 0, y: 1, scale: 0.0003 },
  'the peg field must use the canonical slow-fall gravity');
  assert.equal(live.cleanup().clean, true);
  assert.deepEqual({ x: engine.gravity.x, y: engine.gravity.y,
    scale: engine.gravity.scale }, { x: 0.25, y: 1.5, scale: 0.002 },
  'Plinko cleanup must restore the exact host gravity profile');
}

assertPlinkoOwnsAndRestoresGravity();
assertCleanupRestoresSelectedBody();
assertDeterministicReplay();
const corpus = assertEngineSeedCorpus();
console.log('Live Physics↔Matter Plinko bridge passed: compound body, trampoline, ' +
  '24-row/9-slot authority, deterministic sensor verdict, camera, and cleanup.', corpus);
