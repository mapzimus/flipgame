'use strict';
const assert = require('node:assert/strict');
const Matter = require('../js/vendor/matter.min.js');
const Plinko = require('../js/v112-plinko-matter.js');

const rectangle = (id, ref, role, left, top, width, height) => Object.freeze({ entityId: id,
  colliderRef: ref, geometryRole: role,
  transform: Object.freeze({ x: left + width / 2, y: top + height / 2, angle: 0, scaleX: 1, scaleY: 1 }),
  bounds: Object.freeze({ left, top, width, height, right: left + width, bottom: top + height }) });

function canonicalBoard() {
  const centerX = 640, innerLeft = 100, innerWidth = 1080, top = 3590, bottom = 6040, sensorTop = 5890;
  const pegRows = Array.from({ length: 24 }, (_, rowIndex) => {
    const count = rowIndex % 2 ? 10 : 11, y = top + 105 + rowIndex * 92;
    return Object.freeze({ rowIndex, y, centers: Object.freeze(Array.from({ length: count }, (_, pegIndex) =>
      Object.freeze({ x: innerLeft + (pegIndex + (count === 11 ? .5 : 1)) * innerWidth / 11, y, radius: 9 }))) });
  });
  return Object.freeze({ schema: 'PlinkoBoardGeometryV1', version: 1, rowCount: 24, slotCount: 9,
    centerX, top, bottom, width: 1116, innerLeft, innerRight: 1180, innerWidth,
    rowSpacing: 92, slotWidth: 120, slotBandHeight: 150,
    board: rectangle('board', 'body:plinko-board-24', 'peg-field-compound', 82, top, 1116, 2450),
    trampoline: rectangle('trampoline', 'body:plinko-opening-trampoline', 'opening-trampoline', 510, 5972, 260, 56),
    pegRows: Object.freeze(pegRows),
    rails: Object.freeze([rectangle('left', 'body:plinko-rail-left', 'rail-left', 82, top, 18, 2450), rectangle('right', 'body:plinko-rail-right', 'rail-right', 1180, top, 18, 2450)]),
    dividers: Object.freeze(Array.from({ length: 8 }, (_, i) => rectangle('divider-' + i, 'body:plinko-divider-' + i, 'divider-' + i, 215 + i * 120, sensorTop - 18, 10, 168))),
    sensors: Object.freeze(Array.from({ length: 9 }, (_, i) => rectangle('slot-' + i, 'sensor:plinko-slot-' + i, 'slot-' + i, 101 + i * 120, sensorTop, 118, 150))),
    fingerprint: 'plinko-matter-test-board', physics: Object.freeze({ schema: 'PlinkoBoardPhysicsV1',
      selectedObjectEnvelope: Object.freeze({ friction: .15, frictionAir: .004, restitution: .5 }),
      pegField: Object.freeze({ pegCount: 252 }) }) });
}

function applyExpected(adapter, tick, seed) {
  if (tick === 0) return adapter.applyDirective('launch', { bodies: [
    { entityRef: 'body:flipper-main', scaleX: 1.18, scaleY: .62 },
    { entityRef: 'body:plinko-opening-trampoline', scaleX: 1.08, scaleY: .38 }], impulses: [] });
  if (tick === 24) return adapter.applyDirective('step', { bodies: [
    { entityRef: 'body:flipper-main', scaleX: 1, scaleY: 1 },
    { entityRef: 'body:plinko-opening-trampoline', scaleX: 1, scaleY: 1 }],
    impulses: [{ entityRef: 'body:flipper-main', x: 0, y: -28, atX: null, atY: null }] });
  const ordinal = tick >= 1464 && tick <= 1554 && (tick - 1464) % 30 === 0 ? (tick - 1464) / 30 : null;
  return adapter.applyDirective('step', { bodies: [], impulses: ordinal == null ? [] : [{ entityRef: 'body:flipper-main',
    x: ((seed + ordinal) & 1) === 0 ? 2 : -2, y: 3, atX: null, atY: null }] });
}

function simulate(seed, vx) {
  const engine = Matter.Engine.create(), geometry = canonicalBoard();
  const selected = Matter.Body.create({ parts: [
    Matter.Bodies.rectangle(640, 5892, 70, 50, { density: .0015 }),
    Matter.Bodies.rectangle(640, 5930, 74, 70, { density: .018 }),
    Matter.Bodies.rectangle(640, 5848, 44, 36, { density: .0004 })] });
  const originalParts = selected.parts.slice(), originalMask = selected.collisionFilter.mask;
  Matter.Composite.add(engine.world, selected);
  const adapter = Plinko.create({ Matter });
  adapter.attach({ engine, world: engine.world, selectedBody: selected, selectedResource: selected,
    geometry, binding: null, viewport: { width: 1280, height: 720 } });
  adapter.start({ seed, entryVelocityX: vx, angularVelocity: .1 });
  applyExpected(adapter, 0, seed);
  let snap;
  for (let tick = 1; tick <= 3600; tick++) {
    adapter.step({ targetTick: tick }); applyExpected(adapter, tick, seed); snap = adapter.snapshot();
    if (snap.landing.settled || snap.timedOut) break;
  }
  const chassisId = snap.selected.contactChassis.matterBodyId;
  const cleanup = adapter.cleanup(), bodies = Matter.Composite.allBodies(engine.world);
  return { snap, cleanup, selected, originalParts, originalMask, bodies, chassisId, engine };
}

const results = Array.from({ length: 81 }, (_, i) => simulate(500 + i, -2 + i * .05));
for (const result of results) {
  assert.equal(result.snap.selected.sameBody, true); assert.equal(result.snap.selected.genericCircle, false);
  assert.deepEqual(result.snap.selected.contactChassis.shape, 'rounded-capsule');
  assert.equal(result.snap.selected.contactChassis.physicallyTethered, true);
  assert.equal(result.snap.board.pegs.length, 252); assert.equal(result.snap.board.slots.length, 9);
  assert.ok(result.snap.maximumStepDisplacement > 0); assert.ok(result.snap.spring.applied);
  assert.equal(result.cleanup.clean, true); assert.ok(result.bodies.includes(result.selected));
  assert.ok(!result.bodies.some(body => body.id === result.chassisId), 'event chassis must be removed');
  assert.equal(result.selected.collisionFilter.mask, result.originalMask, 'selected collision mask restored');
  assert.equal(result.selected.parts.length, result.originalParts.length, 'authored selected parts remain intact');
  assert.equal(Matter.Composite.allConstraints(result.engine.world).length, 0, 'event tether must be removed');
}
const settled = results.filter(result => result.snap.landing.settled);
const slots = new Set(settled.map(result => result.snap.landing.slotIndex));
assert.ok(settled.length >= 76, 'at least 95% of preserved-Flipper drops must physically resolve');
assert.equal(slots.size, 9, 'all nine slots must be physically reachable');
assert.ok(settled.every(result => result.snap.landing.actualSensorContact));
const durations = settled.map(result => result.snap.landing.dropMs).sort((a, b) => a - b);
const medianDropMs = durations[Math.floor(durations.length / 2)];
assert.ok(medianDropMs >= 10000, 'the physical board must retain a long dramatic median drop');
const replayA = simulate(9123, .37), replayB = simulate(9123, .37);
assert.deepEqual({ slot: replayA.snap.landing.slotIndex, tick: replayA.snap.landing.settledTick,
  contacts: replayA.snap.contactDigest, recovery: replayA.snap.recovery },
{ slot: replayB.snap.landing.slotIndex, tick: replayB.snap.landing.settledTick,
  contacts: replayB.snap.contactDigest, recovery: replayB.snap.recovery }, 'same seed and launch must replay exactly');
console.log('Plinko Matter chassis passed', { settled: settled.length,
  medianDropMs, range: [durations[0], durations[durations.length - 1]], slots: [...slots].sort() });
