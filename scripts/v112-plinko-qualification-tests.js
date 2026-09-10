'use strict';
// Independent acceptance suite. Deliberately fails while the standalone adapter
// is not wired to the shipped Physics/renderer/observation path. No forced pass,
// production edits, synthetic collision events, teleports or forced verdicts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Root = path.resolve(__dirname, '..');
const Catalog = require('../js/v112-progression-catalog.js');
const source = file => fs.readFileSync(path.join(Root, file), 'utf8');
const json = value => JSON.parse(JSON.stringify(value));
const results = [];
function test(name, run) {
  try { const detail = run(); results.push({ name, pass: true, detail }); }
  catch (error) { results.push({ name, pass: false, error: error.message }); }
}
function load() {
  const context = vm.createContext({ console, window: { matchMedia: () => ({ matches: false }) } });
  for (const file of ['js/vendor/matter.min.js', 'js/v111-interfaces.js', 'js/v111-physics-events.js',
    'js/v112-plinko-matter.js', 'js/physics.js', 'js/v112-physics-driver.js', 'js/skins.js']) {
    vm.runInContext(source(file) + (file === 'js/physics.js' ? '\nthis.physics=Physics;' : ''), context, { filename: file });
  }
  let engine;
  const create = context.Matter.Engine.create;
  context.Matter.Engine.create = (...args) => { engine = create(...args); return engine; };
  context.physics.init(1280, 720);
  return { context, physics: context.physics, Matter: context.Matter, engine: () => engine, skins: context.window.Skins };
}
const kinds = ['lives-doubled', 'everyone-else-halved', 'always-magnet', 'automatic-loss', 'automatic-win',
  'automatic-loss', 'always-magnet', 'everyone-else-halved', 'lives-doubled'];
const aliases = { double: kinds[0], halve: kinds[1], magnet: kinds[2], lose: kinds[3], win: kinds[4] };
function start(f, { seed = 500, vx = -350, vy = -2500, objectId = 'bottle' } = {}) {
  const p = f.physics;
  p.setProfile(f.skins.physicsFor(objectId)); p.resetBottle();
  const selected = p.getBottle(), parts = selected.parts.slice(), mask = selected.collisionFilter.mask;
  const resources = f.Matter.Composite.allBodies(f.engine().world).length;
  p.forceSpecialEvent('plinko'); p.applyFlick(vx, vy, seed);
  return { selected, parts, mask, resources, seed, objectId };
}
function frame(f) {
  const p = f.physics, body = p.getBottle(), board = p.getPlinko();
  return { bodyId: body.id, position: json(body.position), velocity: json(body.velocity), angle: body.angle,
    circleRadius: body.circleRadius || 0, parts: body.parts.length,
    board: board && json(board), camera: json(p.getViewHint()), lifecycle: json(p.getLandingLifecycle()) };
}
function run(f, input = {}, resizeAt = 0) {
  const launch = start(f, input), snapshots = [{ tick: 0, ...frame(f) }];
  let verdict, tick, terminal;
  for (tick = 1; tick <= 4200; tick++) {
    if (tick === resizeAt) f.physics.reflow(360, 740);
    f.physics.step(1 / 60); verdict = f.physics.checkLanding();
    if ([24, 129, 144, 300, 600, 900].includes(tick) || verdict) snapshots.push({ tick, ...frame(f) });
    if (verdict) { terminal = { tick, verdict, info: json(f.physics.getLastLandingInfo()),
      event: json(f.physics.getEventResultMetadata()) }; break; }
  }
  return { launch, snapshots, terminal, ticks: tick };
}
test('live board has nine mirrored prizes and twenty-four peg rows', () => {
  const f = load(); start(f); const board = f.physics.getPlinko();
  assert.ok(board, 'forced Plinko must produce a live board');
  assert.deepEqual(Array.from(board.slots, s => aliases[s.kind] || s.kind), kinds);
  assert.equal(new Set(board.pegs.map(p => p.y)).size, 24, 'actual live peg row count');
});
test('all 51 selected competitive envelopes survive Plinko without generic substitution', () => {
  const f = load(), failures = [];
  for (const objectId of Catalog.objectIds) {
    const launch = start(f, { objectId }), selected = f.physics.getBottle();
    if (selected !== launch.selected || selected.parts.length !== launch.parts.length || selected.circleRadius) failures.push(objectId);
    f.physics.resetBottle();
  }
  assert.deepEqual(failures, [], 'selected compound body replaced for: ' + failures.join(', '));
  return { objectCount: Catalog.objectIds.length, note: 'Variants share the standardized competitive envelope; art-state preservation needs renderer evidence.' };
});
test('live trampoline compresses before a real spring release and apex handoff', () => {
  const f = load(), output = run(f), first = output.snapshots[0];
  const board = first.board;
  assert.ok(board.spring || board.trampoline || board.snapshot?.spring, 'no live opening trampoline state');
  const modes = output.snapshots.map(s => s.board?.camera?.mode || s.camera?.mode || s.camera?.trackingData?.mode);
  assert.ok(modes.includes('trampoline-lock'), 'no initial trampoline camera lock');
  assert.ok(modes.includes('object-ascent-follow'), 'no real ascent camera phase');
  assert.ok(output.snapshots.some(s => s.tick >= 24 && s.position.y < first.position.y - 300), 'no substantial physical spring ascent');
});
test('live physical drop duration corpus remains dramatic without a time-awarded prize', () => {
  const samples = [500, 501, 502, 503, 504, 505, 506, 507, 508].map((seed, i) => run(load(), { seed, vx: -350 + i * 90 }));
  const durations = samples.map(s => s.terminal && s.terminal.tick * 1000 / 60).filter(Number.isFinite).sort((a, b) => a - b);
  assert.equal(durations.length, samples.length, 'all live drops resolve');
  const medianMs = durations[Math.floor(durations.length / 2)];
  assert.ok(medianMs >= 10000, 'median full event is only ' + medianMs.toFixed(1) + ' ms; durations=' + JSON.stringify(durations));
  const bad = samples.filter(s => !s.terminal.info.sensorRef && !s.terminal.info.plinkoEvidence?.sensorRef);
  assert.equal(bad.length, 0, 'each prize needs collision-derived sensor evidence, not x-index/time inference');
  return { medianMs, durations };
});
test('identical live seed/input replays and airborne resize does not change flight', () => {
  const a = run(load(), { seed: 9123, vx: 37 }), b = run(load(), { seed: 9123, vx: 37 });
  const c = run(load(), { seed: 9123, vx: 37 }, 100);
  const digest = out => ({ terminal: out.terminal, samples: out.snapshots.map(s => ({ tick: s.tick, position: s.position, velocity: s.velocity, angle: s.angle })) });
  assert.deepEqual(digest(a), digest(b)); assert.deepEqual(digest(a), digest(c));
  return { tick: a.terminal?.tick, slot: a.terminal?.info.plinkoSlot };
});
test('live camera remains object-relative and shows every prize bin at resolution', () => {
  const f = load(), output = run(f), last = output.snapshots.at(-1), view = last.camera;
  for (const shot of output.snapshots) {
    assert.ok([shot.camera.camX, shot.camera.camY, shot.camera.zoom].every(Number.isFinite));
    assert.ok(Math.abs((shot.position.y - shot.camera.camY) * shot.camera.zoom) <= 720 * .30, 'object leaves central camera band');
  }
  const board = last.board, visibleLeft = view.camX - 1280 / (2 * view.zoom), visibleRight = view.camX + 1280 / (2 * view.zoom);
  assert.ok(visibleLeft <= board.left && visibleRight >= board.right, 'resolved camera crops one or more prize bins');
});
test('live cleanup restores masks, removes event bodies and constraints, and accepts normal next flip', () => {
  const f = load(), p = f.physics, launched = start(f);
  for (let tick = 0; tick < 300; tick++) p.step(1 / 60);
  p.resetBottle();
  assert.equal(p.getPlinko(), null); assert.equal(p.getBottle().circleRadius || 0, 0);
  assert.equal(p.getBottle().collisionFilter.mask, launched.mask);
  assert.equal(f.Matter.Composite.allBodies(f.engine().world).length, launched.resources);
  assert.equal(f.Matter.Composite.allConstraints(f.engine().world).length, 0);
  p.applyFlick(0, -2000, 22, 1, 'disabled');
  let result; for (let tick = 0; tick < 1500 && !result; tick++) { p.step(1 / 60); result = p.checkLanding(); }
  assert.ok(result, 'ordinary next flip unresolved');
});
test('live observation bridge accepts Plinko collision evidence rather than marking it unsupported', () => {
  const f = load(), driver = f.context.FlipgameV112PhysicsDriver.create(f.physics);
  // reset precedes arming exactly as main.js does.
  f.physics.resetBottle(); driver.armLaunch({ manual: true });
  f.physics.forceSpecialEvent('plinko'); f.physics.applyFlick(-350, -2500, 500);
  assert.equal(driver.snapshot().supported, true, driver.status().warning);
  driver.close();
});
test('moving live object cannot acquire a prize from timeout or first-contact settle expiry', () => {
  const physics = source('js/physics.js');
  assert.ok(!/flightFrames\s*>\s*3000\)\s*return plinkoVerdict/.test(physics), '50-second moving-object auto-prize remains');
  assert.ok(!/simElapsedMs\s*-\s*firstContactMs\s*>=\s*plinkoSettleLimit\)\s*return plinkoVerdict/.test(physics), 'first-contact timeout still awards current horizontal slot');
  assert.ok(!/plinkoNudges\s*>\s*700\)[\s\S]{0,400}Body\.setPosition/.test(physics), 'anti-wedge still teleports to prize band');
});
test('nine mirrored rewards map to the correct Classic life/terminal effects even on fire', () => {
  const { game } = require('../js/game.js');
  const legacy = ['double', 'halve', 'magnet', 'lose', 'win', 'lose', 'magnet', 'halve', 'double'];
  for (const onFire of [false, true]) for (let index = 0; index < kinds.length; index++) {
    const match = Object.assign({}, game, { callbacks: {} });
    match.init(Array.from({ length: 8 }, (_, i) => ({ name: 'Seat ' + i, color: '#1f9bff', isAI: false })), 1, { startingLives: 10 });
    const actor = match.currentPlayer(); actor.isOnFire = onFire;
    match.players[1].lives = 1; match.players[2].lives = 9;
    match.resolvePlinko(legacy[index]);
    assert.equal(match.plinkoPrize, legacy[index]);
    if (legacy[index] === 'double') assert.equal(actor.lives, 20, 'multiplier bypasses additive cap');
    if (legacy[index] === 'halve') { assert.equal(match.players[1].lives, 1); assert.equal(match.players[2].lives, 5); }
    if (legacy[index] === 'magnet') assert.equal(actor.alwaysMagnet, true);
    if (legacy[index] === 'lose') { assert.equal(actor.lives, 0); assert.equal(actor.eliminated, true); }
    if (legacy[index] === 'win') assert.ok(match.players.filter(p => p !== actor).every(p => p.eliminated && p.lives === 0));
  }
  return { slots: 9, onFireStates: 2, scope: 'Legacy Classic reward consumer only; private Cup/Team bridge still independently required.' };
});
test('every awarded live result supplies actual sensor and settled contact evidence', () => {
  const output = run(load(), { seed: 500 });
  assert.ok(output.terminal, 'no terminal result');
  const evidence = output.terminal.info.plinkoEvidence || output.terminal.info;
  assert.ok(evidence.sensorRef, 'live prize has no sensorRef; result=' + JSON.stringify(output.terminal));
  assert.equal(evidence.actualSensorContact, true);
  assert.equal(evidence.settled, true);
});
test('renderer dispatches all selected art identities and twelve variants during a drop', () => {
  const f = load(); start(f); const calls = [];
  f.context.window.Skins = { hasDraw: () => true,
    draw(ctx, id, options) { calls.push({ id, variantId: options.variantId }); }, liquidFor: () => null };
  vm.runInContext(source('js/renderer.js') + '\nthis.renderer=Renderer;', f.context, { filename: 'js/renderer.js' });
  const gradient = { addColorStop() {} }, values = { globalAlpha: 1 };
  const ctx = new Proxy({ createLinearGradient: () => gradient, createRadialGradient: () => gradient,
    measureText: text => ({ width: String(text).length * 8 }) }, {
    get(target, key) { return key in target ? target[key] : key in values ? values[key] : () => {}; },
    set(target, key, value) { values[key] = value; return true; },
  });
  const renderer = f.context.renderer; renderer.init({ width: 1280, height: 720, getContext: () => ctx });
  renderer.setReduceMotion(true);
  for (const objectId of Catalog.objectIds) for (const variant of Catalog.variantFlavors) {
    const prior = calls.length;
    renderer.frame(1 / 60, { bottle: f.physics.getBottle(), liquid: f.physics.getLiquid(), groundY: f.physics.getGroundY(),
      skin: objectId, variantId: variant.id, liquidColor: variant.color, plinkoBoard: f.physics.getPlinko(),
      view: f.physics.getViewHint(), flipSeed: 500 });
    if (objectId === 'bottle') assert.equal(calls.length, prior);
    else { assert.equal(calls.length, prior + 1); assert.deepEqual(calls.at(-1), { id: objectId, variantId: variant.id }); }
  }
  return { selections: 612, scope: 'Actual renderer identity/variant dispatch, not artwork pixel approval or internal-dynamics qualification.' };
});
const report = { schema: 'PlinkoIndependentQualificationV1', evaluatedAt: new Date().toISOString(),
  scope: 'Actual Physics singleton, selected envelopes, live board/camera, driver and cleanup; adapter corpus remains separate.',
  passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length, results };
console.log(JSON.stringify(report, null, 2));
if (report.failed) process.exitCode = 1;
