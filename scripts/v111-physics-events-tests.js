'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const Interfaces = require(path.join(root, 'js', 'v111-interfaces.js'));
const Events = require(path.join(root, 'js', 'v111-physics-events.js'));

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

function runToVerdict(physics, maxFrames = 3600) {
  for (let frame = 0; frame < maxFrames; frame++) {
    physics.step(1 / 60);
    const verdict = physics.checkLanding();
    if (verdict) return { verdict, frame: frame + 1, info: physics.getLastLandingInfo() };
  }
  return null;
}

function runUntil(physics, predicate, maxFrames = 1800) {
  for (let frame = 0; frame < maxFrames; frame++) {
    physics.step(1 / 60);
    physics.checkLanding();
    if (predicate()) return frame + 1;
  }
  return null;
}

function forcedPhysics(id, seed = 1234, vx = 320, vy = -2500) {
  const physics = loadPhysics();
  physics.init(1280, 800);
  physics.forceSpecialEvent(id);
  physics.applyFlick(vx, vy, seed);
  return physics;
}

function testCanonicalRegistryAndHooks() {
  assert.equal(Events.CONTRACT_REVISION, 3);
  assert.equal(Events.list().length, 30);
  assert.deepEqual(Events.list().map((event) => event.id), Array.from(Interfaces.EVENT_IDS));
  assert.deepEqual(Events.list().map((event) => event.normalDenominator),
    Interfaces.EVENT_CATALOG.map((event) => event.normalDenominator));
  assert.deepEqual(Object.keys(Events.ARENA_PROFILES),
    ['crosswind', 'moon-gravity', 'gravity-slam', 'spring-table', 'slick-table']);
  for (const profile of Object.values(Events.ARENA_PROFILES)) {
    assert.equal(profile.symmetric, true);
    assert.equal(profile.reward, null);
  }

  for (const definition of Events.list()) {
    const phases = [];
    const controller = Events.createController();
    const context = { seed: 123, applyEventEffect: (phase) => phases.push(phase) };
    controller.prepare(definition.id, context);
    assert.throws(() => controller.prepare(definition.id, context), /already active/,
      `${definition.id} allowed a second active event`);
    controller.applyPhysics(context);
    controller.onContact(context);
    controller.resolve(context);
    controller.cleanup(context);
    assert.deepEqual(phases, ['prepare', 'physics', 'contact', 'resolve', 'cleanup'],
      `${definition.id} did not implement every lifecycle hook`);
    assert.ok(definition.render({}), `${definition.id} lacks visual behavior`);
    assert.equal(definition.reducedMotion({}).retainPhysicalGeometry, true,
      `${definition.id} reduced motion changed gameplay`);
    assert.ok(definition.metadata.physics.kind, `${definition.id} lacks a physical kind`);
    assert.equal(definition.metadata.schema, 'FlipgameEventMetadataV1');
    const expectedSettleMs = ['wind-tunnel', 'moon-gravity'].includes(definition.id) ? 5000
      : (['ice-slide', 'bouncy-bottle'].includes(definition.id) ? 6000 : 4000);
    assert.equal(definition.metadata.physics.settleLimitMs, expectedSettleMs,
      `${definition.id} has the wrong settle limit`);
  }
}

function testForcedMapping() {
  assert.equal(Events.oddsProfileForName('Mr. Howe'), 'mr-howe');
  assert.equal(Events.oddsProfileForName('mr. howe'), 'normal');
  for (const definition of Events.list()) {
    assert.equal(Events.forcedEventId(definition.id), definition.id);
    assert.equal(Events.forcedEventId(definition.displayName), definition.id);
    assert.equal(Events.forcedEventId(definition.displayName.replaceAll(' ', '')), definition.id);
  }
  assert.equal(Events.forcedEventId('Rainbow Trail'), 'rainbow-corkscrew');
  assert.equal(Events.forcedEventId('Trampoline Tab'), 'trampoline');
  assert.equal(Events.forcedEventId('Plinko Drop'), 'plinko');
  assert.equal(Events.forcedEventId('not-an-event'), null);
}

function testNormalOddsAcrossMillionsOfSeeds() {
  const samples = 3_000_000;
  const normal = new Uint32Array(30);
  const boosted = new Uint32Array(30);
  let selected = 0;
  let boostedSelected = 0;
  for (let seed = 1; seed <= samples; seed++) {
    const rolled = Events.rollId({ mode: 'normal', oddsProfile: 'normal', seed });
    const boostedRoll = Events.rollId({ mode: 'normal', oddsProfile: 'mr-howe', seed });
    if (rolled) {
      normal[Interfaces.EVENT_IDS.indexOf(rolled)]++;
      selected++;
    }
    if (boostedRoll) {
      boosted[Interfaces.EVENT_IDS.indexOf(boostedRoll)]++;
      boostedSelected++;
    }
  }
  const totalWeight = Interfaces.EVENT_CATALOG.reduce(
    (sum, event) => sum + 1 / event.normalDenominator, 0);
  assert.ok(Math.abs(selected / samples - totalWeight) < 0.0006,
    `normal combined occurrence was ${selected / samples}, not ${totalWeight}`);
  assert.ok(Math.abs(boostedSelected / samples - totalWeight * 10) < 0.0015,
    `Mr. Howe combined occurrence was ${boostedSelected / samples}, not ${totalWeight * 10}`);
  for (let i = 0; i < normal.length; i++) {
    const denominator = Interfaces.EVENT_CATALOG[i].normalDenominator;
    const expected = samples / denominator;
    const boostedExpected = expected * 10;
    const tolerance = Math.max(0.045, 4.5 / Math.sqrt(expected));
    assert.ok(Math.abs(normal[i] - expected) / expected < tolerance,
      `${Interfaces.EVENT_IDS[i]} selector occurrence deviated from exact 1/${denominator}`);
    assert.ok(Math.abs(boosted[i] - boostedExpected) / boostedExpected < tolerance,
      `${Interfaces.EVENT_IDS[i]} Mr. Howe selector weight deviated from exact 10/${denominator}`);
  }

  // Preserve the deterministic release fixtures used by the Golden integration
  // probe while proving it comes from the one canonical registry path.
  assert.equal(Events.rollId({ mode: 'normal', oddsProfile: 'normal', seed: 457 }), 'golden-flip');
  assert.equal(Events.rollId({ mode: 'normal', oddsProfile: 'normal', seed: 77 }), null);
}

function testInsaneOddsAcrossMillionsOfSeeds() {
  const samples = 2_000_000;
  const counts = new Map();
  let total = 0;
  for (let seed = 1; seed <= samples; seed++) {
    const id = Events.rollId({ mode: 'insane', oddsProfile: 'mr-howe', seed });
    if (!id) continue;
    total++;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  assert.ok(Math.abs(total / samples - 1 / 3) < 0.002,
    `Insane occurrence was ${total}/${samples}, not 1/3`);
  assert.equal(counts.has('life-drain'), false, 'Insane selected Life Drain');
  const ordinary = Interfaces.EVENT_IDS.filter((id) => id !== 'life-drain' && id !== 'plinko');
  const mean = ordinary.reduce((sum, id) => sum + counts.get(id), 0) / ordinary.length;
  for (const id of ordinary) {
    assert.ok(Math.abs(counts.get(id) - mean) / mean < 0.04,
      `${id} was not equally weighted in Insane`);
  }
  const ratio = counts.get('plinko') / mean;
  assert.ok(ratio > 1.20 && ratio < 1.30, `Plinko ratio was ${ratio}, not 1.25`);
}

function testEveryEventHasPhysicalRuntime() {
  for (let i = 0; i < Events.list().length; i++) {
    const definition = Events.list()[i];
    const physics = loadPhysics();
    physics.init(1280, 800);
    assert.equal(physics.forceSpecialEvent(definition.id), true);
    physics.applyFlick(i % 2 ? 420 : -420, -2500, 1000 + i);
    const flick = physics.getLastFlickInfo();
    assert.equal(flick.eventId, definition.id, `${definition.id} was not activated`);
    assert.equal(physics.getEventMetadata().physics.kind, definition.metadata.physics.kind);
    assert.equal(physics.getEventRenderState().eventId, definition.id);
    assert.equal(physics.getEventRenderState(true).visual.retainOutcome, true);

    // Mid-flight transformations are deliberately not applied at launch.
    for (let frame = 0; frame < 20; frame++) physics.step(1 / 60);

    if (definition.id === 'shrink-ray') {
      assert.equal(physics.getEventRenderState().runtime.flags.shrunk, true);
    }
    if (definition.id === 'mitosis' || definition.id === 'mirror-match') {
      assert.equal(physics.getEventBodies().length, 1);
    }
    if (definition.id === 'meteor-shower') assert.equal(physics.getEventBodies().length, 3);
    if (definition.id === 'alien-invasion') {
      assert.equal(definition.metadata.physics.kind, 'alien');
      assert.equal(definition.metadata.physics.gravity, 0.10);
      assert.equal(physics.getTarget().style, 'portal');
      assert.equal(flick.gravityScale, 0.10);
      assert.equal(flick.gravityY, 0.10);
    }
    if (definition.id === 'moon-gravity') assert.equal(flick.gravityScale, 0.28);
    if (definition.id === 'gravity-slam') assert.equal(flick.gravityScale, 2.55);
    if (definition.id === 'double-flip') assert.equal(flick.requiredTurns, 2);
    if (definition.id === 'cap-toss') {
      assert.equal(definition.metadata.landing.uprightValid, true);
      assert.equal(definition.metadata.landing.capValid, true);
      assert.equal(definition.metadata.landing.bothBodiesRequired, true);
    }
    if (definition.id === 'plinko') {
      const board = physics.getPlinko();
      assert.equal(board.rows, 24);
      assert.equal(board.pegs.length, 252);
      assert.equal(board.bottom - board.top, 2450);
      assert.equal(physics.getViewHint().trackingData.slots.length, 9);
    }

    const runtime = physics.getEventRenderState().runtime;
    assert.ok(runtime.elapsedMs > 0, `${definition.id} physics hook did not run`);
    physics.cleanupEvent('test');
    assert.equal(physics.getEventBodies().length, 0, `${definition.id} leaked a body`);
    assert.equal(physics.getEventMetadata(), null, `${definition.id} remained active after cleanup`);
    if (definition.id === 'plinko') assert.equal(physics.getPlinko(), null, 'Plinko board leaked');
  }
}

function testContactSettleAndTiming() {
  const physics = loadPhysics();
  physics.init(1280, 800);
  physics.forceSpecialEvent('golden-flip');
  physics.applyFlick(0, -2500, 7781);
  let sawContact = false;
  let sawSettling = false;
  let resolution = null;
  for (let frame = 0; frame < 1800 && !resolution; frame++) {
    physics.step(1 / 60);
    const lifecycle = physics.getLandingLifecycle();
    if (lifecycle.phase === 'contact') {
      sawContact = true;
      assert.equal(physics.checkLanding(), null, 'contact was resolved immediately');
    } else if (lifecycle.phase === 'settling') {
      sawSettling = true;
    }
    const verdict = physics.checkLanding();
    if (verdict) resolution = physics.getLandingLifecycle();
  }
  assert.ok(sawContact, 'landing never entered contact');
  assert.ok(sawSettling, 'landing never entered settling');
  assert.equal(resolution.phase, 'resolved');
  assert.ok(resolution.settleMs <= 4000 + 17, `normal settle exceeded 4 seconds: ${resolution.settleMs}`);
}

function testResizeDeferral() {
  const physics = loadPhysics();
  physics.init(800, 700);
  physics.setPlinkoEnabled(false);
  const groundBefore = physics.getGroundY();
  physics.applyFlick(0, -2500, 77, 1, 'disabled');
  assert.equal(physics.reflow(1400, 900, 20), false);
  assert.equal(physics.hasDeferredReflow(), true);
  assert.equal(physics.getGroundY(), groundBefore, 'airborne resize changed world geometry');
  const outcome = runToVerdict(physics, 1800);
  assert.ok(outcome);
  assert.equal(physics.getGroundY(), groundBefore, 'geometry reflowed before turn reset');
  physics.resetBottle();
  assert.equal(physics.hasDeferredReflow(), false);
  assert.equal(physics.getGroundY(), 900 - Math.max(64, Math.round(900 * 0.13)) - 20);
}

function testAlienViewportMatrix() {
  const physics = loadPhysics();
  const viewports = [[360, 640], [768, 1024], [1280, 800], [1920, 1080], [3840, 1080]];
  let previousRadius = 0;
  for (const [width, height] of viewports) {
    const metrics = physics.alienMetricsForViewport(width, height);
    assert.ok(metrics.ringRadius >= 54 && metrics.ringRadius <= 210);
    assert.ok(metrics.attractionPerStep > 0);
    assert.ok(metrics.timeoutFrames >= 240 && metrics.timeoutFrames <= 500);
    assert.ok(metrics.launchScale >= 0.65 && metrics.launchScale <= 2.7);
    assert.ok(metrics.ringRadius >= previousRadius || Math.min(width, height) < 800);
    previousRadius = metrics.ringRadius;

    physics.init(width, height);
    physics.forceSpecialEvent('alien-invasion');
    physics.applyFlick(900, -2500, width + height);
    const target = physics.getTarget();
    assert.equal(target.halfWidth, metrics.ringRadius);
    assert.ok(target.x - target.halfWidth > 0 && target.x + target.halfWidth < physics.getViewHint().worldW);
    physics.resetBottle();
  }
}

function testRulesMetadata() {
  const rainbow = loadPhysics();
  rainbow.init(1280, 800);
  rainbow.forceSpecialEvent('rainbow-corkscrew');
  rainbow.applyFlick(0, -2500, 91);
  const rainbowOutcome = runToVerdict(rainbow);
  assert.ok(rainbowOutcome);
  if (rainbowOutcome.verdict === 'MAKE') {
    assert.equal(rainbowOutcome.info.eventReward.additiveLives, 1);
    assert.equal(rainbowOutcome.info.eventReward.capped, true);
  }

  const roulette = loadPhysics();
  roulette.init(1280, 800);
  roulette.forceSpecialEvent('roulette-table');
  roulette.applyFlick(0, -2500, 661);
  const rouletteOutcome = runToVerdict(roulette);
  assert.ok(rouletteOutcome);
  assert.equal(rouletteOutcome.info.eventId, 'roulette-table');
  assert.ok([1, 2, 3, 4].includes(rouletteOutcome.info.eventReward.multiplier));
  assert.ok(rouletteOutcome.info.eventReward.slotIndex >= 0 && rouletteOutcome.info.eventReward.slotIndex < 8);
  assert.equal(typeof rouletteOutcome.info.meta.onCap, 'boolean');

  const mitosis = loadPhysics();
  mitosis.init(1280, 800);
  mitosis.forceSpecialEvent('mitosis');
  mitosis.applyFlick(0, -2500, 888);
  const mitosisOutcome = runToVerdict(mitosis);
  assert.ok(mitosisOutcome);
  assert.ok([0, 1, 2].includes(mitosisOutcome.info.eventReward.landedCount));

  const plinko = loadPhysics();
  plinko.init(1280, 800);
  plinko.forceSpecialEvent('plinko');
  plinko.applyFlick(0, -2500, 41);
  const plinkoOutcome = runToVerdict(plinko);
  assert.ok(plinkoOutcome);
  assert.equal(plinkoOutcome.info.eventId, 'plinko');
  assert.ok(Events.PLINKO_SLOTS.includes(plinkoOutcome.info.plinkoPrize));
  assert.ok(['MAKE', 'MISS'].includes(plinkoOutcome.info.automaticOutcome));
}

function testDeterminismAndRngIsolation() {
  const baseline = loadPhysics();
  baseline.init(1280, 800);
  baseline.applyFlick(315, -2500, 0xdecafbad, 1, 'disabled');
  const baseJitter = baseline.getLastFlickInfo().trajectoryJitter;

  for (const id of Interfaces.EVENT_IDS) {
    const physics = loadPhysics();
    physics.init(1280, 800);
    physics.forceSpecialEvent(id);
    physics.applyFlick(315, -2500, 0xdecafbad);
    assert.equal(JSON.stringify(physics.getLastFlickInfo().trajectoryJitter), JSON.stringify(baseJitter),
      `${id} consumed trajectory RNG during selection/setup`);
  }

  const traces = [];
  for (let repeat = 0; repeat < 2; repeat++) {
    const physics = loadPhysics();
    physics.init(1024, 768);
    physics.forceSpecialEvent('portal-pair');
    physics.applyFlick(450, -2600, 9001);
    for (let frame = 0; frame < 180; frame++) physics.step(1 / 60);
    traces.push({
      x: physics.getBottle().position.x,
      y: physics.getBottle().position.y,
      angle: physics.getBottle().angle,
      flags: physics.getEventRenderState().runtime.flags,
    });
  }
  assert.equal(JSON.stringify(traces[0]), JSON.stringify(traces[1]),
    'event trajectory replay was not deterministic');
}

function testModeEventExclusions() {
  let lifeDrainSeed = null;
  for (let seed = 0; seed < 500000 && lifeDrainSeed === null; seed += 1) {
    if (Events.rollId({ mode: 'normal', oddsProfile: 'normal', seed }) === 'life-drain') {
      lifeDrainSeed = seed;
    }
  }
  assert.notStrictEqual(lifeDrainSeed, null, 'test must find a deterministic Life Drain seed');
  assert.notEqual(Events.rollId({
    mode: 'normal', oddsProfile: 'normal', seed: lifeDrainSeed,
    excludedEventIds: ['life-drain'],
  }), 'life-drain', 'an excluded event must never be selected');
  assert.equal(Events.rollId({
    mode: 'normal', oddsProfile: 'normal', seed: lifeDrainSeed,
    excludedEventIds: Events.list().map((definition) => definition.id),
  }), null, 'excluding every event must produce no event');

  const excludedForced = loadPhysics();
  excludedForced.init(1280, 800);
  excludedForced.forceSpecialEvent('life-drain');
  excludedForced.applyFlick(0, -2500, 17, 1, 'normal', false, {
    excludedEventIds: ['life-drain'],
  });
  assert.notEqual(excludedForced.getLastFlickInfo().rareEvent, 'life-drain');

  const disabledForced = loadPhysics();
  disabledForced.init(1280, 800);
  disabledForced.forceSpecialEvent('plinko');
  disabledForced.applyFlick(0, -2500, 18, 1, 'disabled');
  assert.equal(disabledForced.getLastFlickInfo().rareEvent, null,
    'events-disabled Cup shootouts must suppress forced events too');
}

function testNoTimeoutFuzzAndCleanup() {
  for (const id of Interfaces.EVENT_IDS) {
    for (let seed = 1; seed <= 3; seed++) {
      const physics = loadPhysics();
      physics.init(1280, 800);
      physics.forceSpecialEvent(id);
      physics.applyFlick(seed % 2 ? 350 : -350, -2500, seed * 1009 + Interfaces.EVENT_IDS.indexOf(id));
      const outcome = runToVerdict(physics);
      assert.ok(outcome, `${id} seed ${seed} did not resolve`);
      assert.ok(!String(outcome.info.reason).includes('timeout'),
        `${id} seed ${seed} used a timeout: ${outcome.info.reason}`);
      physics.cleanupEvent('fuzz');
      assert.equal(physics.getEventBodies().length, 0, `${id} seed ${seed} leaked bodies`);
    }
  }
}

function testDeepPhysicalSemantics() {
  const ordinary = loadPhysics();
  ordinary.init(1280, 800);
  ordinary.applyFlick(320, -2500, 6098, 1, 'disabled');
  const ordinaryLaunch = {
    y: ordinary.getBottle().velocity.y,
    spin: Math.abs(ordinary.getBottle().angularVelocity),
  };

  const rainbow = forcedPhysics('rainbow-corkscrew', 6099);
  assert.ok(runUntil(rainbow,
    () => rainbow.getEventRenderState().runtime.corkscrewForce !== null, 240),
  'Rainbow Corkscrew never applied its trajectory force');

  const power = forcedPhysics('power-launch', 6098);
  assert.ok(Math.abs(power.getBottle().velocity.y) > Math.abs(ordinaryLaunch.y) * 1.6,
    'Power Launch did not substantially extend the flight');
  assert.ok(Math.abs(power.getBottle().angularVelocity) > ordinaryLaunch.spin * 1.25,
    'Power Launch did not increase spin');

  // Half Full uses a moving center of mass in flight and switches to real
  // base-contact stabilization only after touchdown.
  const half = forcedPhysics('half-full', 6101);
  runUntil(half, () => Math.abs(half.getEventRenderState().runtime.liquidShift || 0) > 0.05, 240);
  assert.ok(Math.abs(half.getEventRenderState().runtime.liquidShift) > 0.05);
  assert.ok(runUntil(half,
    () => half.getEventRenderState().runtime.flags.baseStabilizing === true, 1200));

  // Fizz thrust is recomputed from the rotating local axis and the cap becomes
  // a separate collidable body.
  const fizz = forcedPhysics('fizz-jet', 6102);
  assert.ok(runUntil(fizz, () => fizz.getEventBodies().some((body) => body.label === 'fizz-cap'), 180));
  const fizzA = fizz.getEventRenderState().runtime.thrustVector;
  for (let i = 0; i < 12; i++) fizz.step(1 / 60);
  const fizzB = fizz.getEventRenderState().runtime.thrustVector;
  assert.ok(Math.hypot(fizzA.x - fizzB.x, fizzA.y - fizzB.y) > 1e-8,
    'Fizz thrust did not steer with the rotating object axis');

  const baseline = loadPhysics();
  baseline.init(1280, 800);
  const normalMass = baseline.getBottle().mass;
  const golden = forcedPhysics('golden-flip', 6103);
  assert.ok(golden.getBottle().mass > normalMass * 1.3, 'Golden mass did not increase');
  golden.cleanupEvent('semantic-cleanup');
  assert.ok(Math.abs(golden.getBottle().mass - normalMass) < 1e-9,
    'Golden cleanup did not restore mass');

  const bouncy = forcedPhysics('bouncy-bottle', 6104);
  assert.ok(runToVerdict(bouncy));
  const bounceRuntime = bouncy.getEventRenderState().runtime;
  assert.ok(bounceRuntime.bounces <= 3, 'Bouncy exceeded its three-bounce contract');
  assert.equal(bounceRuntime.maxBounces, 3);

  const quake = forcedPhysics('earthquake', 6105);
  for (let i = 0; i < 8; i++) quake.step(1 / 60);
  assert.equal(quake.getEventBodies().filter((body) => body.label === 'quake-debris').length, 5);
  assert.ok(Math.hypot(quake.getEventRenderState().runtime.tableOffset.x,
    quake.getEventRenderState().runtime.tableOffset.y) > 0.1,
  'Earthquake table remained static');
  quake.cleanupEvent('semantic-cleanup');
  assert.equal(quake.getEventBodies().length, 0, 'Earthquake debris leaked after cleanup');

  const moon = forcedPhysics('moon-gravity', 6123);
  assert.equal(moon.getLastFlickInfo().gravityScale, 0.28);
  const alien = forcedPhysics('alien-invasion', 6124, 900);
  assert.equal(alien.getTarget().style, 'portal');
  assert.equal(alien.getTarget().armed, false);
  assert.equal(alien.getLastFlickInfo().gravityY, 0.10);

  const slam = forcedPhysics('gravity-slam', 6125);
  assert.equal(slam.getLastFlickInfo().gravityScale, 2.55);
  assert.ok(runUntil(slam,
    () => (slam.getEventRenderState().runtime.compression || 0) > 0.1, 900),
  'Gravity Slam never produced an impact-compression phase');

  const ice = forcedPhysics('ice-slide', 6106);
  assert.equal(ice.getEventBodies().filter((body) => body.label === 'ice-bumper').length, 2);
  assert.ok(runUntil(ice,
    () => (ice.getEventRenderState().runtime.frictionReturnProgress || 0) > 0, 1200),
  'Ice friction never began returning');
  assert.ok(runToVerdict(ice));

  const trampoline = forcedPhysics('trampoline', 6107);
  assert.ok(runUntil(trampoline,
    () => trampoline.getEventRenderState().runtime.flags.relaunched === true, 1200),
  'Trampoline never relaunched the object');
  assert.equal(trampoline.getLandingLifecycle().firstContactMs, null,
    'Trampoline first contact consumed the return-landing settle budget');
  assert.ok(runToVerdict(trampoline));

  const wind = forcedPhysics('wind-tunnel', 6126);
  assert.ok(runUntil(wind,
    () => wind.getEventRenderState().runtime.gustVector !== null, 240),
  'Wind Tunnel never applied lateral force');

  const shrink = forcedPhysics('shrink-ray', 6108);
  const shrinkMassBefore = shrink.getBottle().mass;
  const initialAngular = Math.abs(shrink.getBottle().angularVelocity);
  assert.ok(runUntil(shrink, () => shrink.getEventRenderState().runtime.flags.shrunk === true, 240));
  assert.equal(shrink.getEventRenderState().runtime.bodyScale, 0.62);
  assert.ok(Math.abs(shrink.getEventRenderState().runtime.angularSpeedAfter) > initialAngular,
    'Shrink Ray failed to conserve angular momentum/increase angular speed');
  const shrinkMassAfter = shrink.getBottle().mass;
  assert.ok(shrinkMassAfter < shrinkMassBefore * 0.5, 'Shrink Ray did not reduce the body');
  shrink.cleanupEvent('semantic-cleanup');
  assert.ok(shrink.getBottle().mass > shrinkMassAfter,
    'Shrink cleanup did not restore scale');

  const portal = forcedPhysics('portal-pair', 6109, 0);
  assert.ok(runUntil(portal,
    () => portal.getEventRenderState().runtime.flags.teleported === true, 600),
  'Portal was not crossed');
  const conservation = portal.getEventRenderState().runtime.conservation;
  assert.ok(Math.abs(conservation.speedBefore - conservation.speedAfter) < 1e-9,
    'Portal did not conserve speed');
  assert.ok(Math.abs(conservation.spinBefore - conservation.spinAfter) < 1e-12,
    'Portal did not conserve spin');
  assert.ok(Math.abs(conservation.directionRotation) > 0.5,
    'Portal did not rotate the exit direction');

  const tether = forcedPhysics('tether-swing', 6110, 500);
  assert.ok(runUntil(tether,
    () => tether.getEventRenderState().runtime.flags.released === true, 1200),
  'Tether did not release');
  const tetherRuntime = tether.getEventRenderState().runtime;
  assert.ok(Math.abs(tetherRuntime.releaseAngle) < 0.21,
    `Tether released away from its low point: ${tetherRuntime.releaseAngle}`);
  assert.ok(Math.abs(tetherRuntime.cableStretch) < tetherRuntime.cableLength * 0.08,
    'Tether cable was not taut');

  const mitosis = forcedPhysics('mitosis', 6111);
  assert.ok(runUntil(mitosis,
    () => mitosis.getEventRenderState().runtime.flags.split === true, 240));
  const mitosisRuntime = mitosis.getEventRenderState().runtime;
  assert.ok(mitosisRuntime.massConservationError < 1e-9, 'Mitosis did not conserve mass');
  assert.ok(mitosisRuntime.angularMomentumError < 1e-6,
    'Mitosis did not conserve angular momentum');
  const mitosisOutcome = runToVerdict(mitosis);
  assert.ok(mitosisOutcome);
  assert.ok([0, 1, 2].includes(mitosisOutcome.info.eventReward.landedCount));
  assert.equal(mitosisOutcome.info.meta.copies.length, 2);

  const doubleFlip = forcedPhysics('double-flip', 6127);
  assert.ok(runUntil(doubleFlip,
    () => doubleFlip.getEventRenderState().runtime.flags.doubleFlipAssisted === true, 900),
  'Double Flip never applied its second-arc assistance');
  const doubleOutcome = runToVerdict(doubleFlip);
  assert.ok(doubleOutcome);
  assert.equal(doubleOutcome.info.requiredRotations, 2);
  if (doubleOutcome.verdict === 'MAKE') assert.ok(doubleOutcome.info.rotations >= 2);

  const ceiling = forcedPhysics('ceiling-flip', 6112);
  assert.equal(ceiling.getEventRenderState().runtime.landingPlane, 'ceiling');
  const ceilingOutcome = runToVerdict(ceiling);
  assert.ok(ceilingOutcome, 'Ceiling Flip did not resolve on its inverted plane');
  assert.ok(ceilingOutcome.info.contacts > 0, 'Ceiling Flip never contacted its landing plane');

  const meteor = forcedPhysics('meteor-shower', 6113);
  const meteorOutcome = runToVerdict(meteor);
  assert.ok(meteorOutcome);
  assert.notEqual(meteorOutcome.info.reason, 'meteor', 'Meteor contact became an automatic miss');

  const magnet = forcedPhysics('magnet', 6114);
  assert.ok(runUntil(magnet,
    () => magnet.getEventRenderState().runtime.magnetVector !== null, 600),
  'Magnet never bent the trajectory');

  const hearts = forcedPhysics('heart-rush', 6115);
  assert.ok(runUntil(hearts,
    () => hearts.getEventRenderState().runtime.heartbeatCount === 3, 900),
  'Heart Rush did not deliver three physical pulses');

  const blackHole = forcedPhysics('black-hole', 6116);
  assert.ok(runUntil(blackHole,
    () => blackHole.getEventRenderState().runtime.attractionVector !== null, 240),
  'Black Hole never applied attraction');

  const boomerang = forcedPhysics('boomerang', 6117, 500);
  assert.ok(runUntil(boomerang,
    () => boomerang.getEventRenderState().runtime.returnArc !== null, 240));
  const boomerangRuntime = boomerang.getEventRenderState().runtime;
  assert.ok(boomerangRuntime.targetX < boomerangRuntime.originX,
    'Boomerang target was not behind the launch origin');

  const roulette = forcedPhysics('roulette-table', 6118);
  const angleBefore = roulette.getEventRenderState().runtime.wheelAngle;
  for (let i = 0; i < 30; i++) roulette.step(1 / 60);
  assert.notEqual(roulette.getEventRenderState().runtime.wheelAngle, angleBefore,
    'Roulette table did not physically spin');
  const rouletteOutcome = runToVerdict(roulette);
  assert.ok(rouletteOutcome.info.meta.roulette.slotIndex >= 0);
  assert.equal(rouletteOutcome.info.eventReward.slotIndex,
    rouletteOutcome.info.meta.roulette.slotIndex);

  const plinko = forcedPhysics('plinko', 6128);
  const board = plinko.getPlinko();
  assert.equal(board.slots.length, 9);
  assert.ok(board.bottom - board.top > 900);
  assert.equal(plinko.getViewHint().tracking, 'plinko');

  const mirror = forcedPhysics('mirror-match', 6129);
  for (let i = 0; i < 5; i++) mirror.step(1 / 60);
  const mirroredBody = mirror.getEventBodies().find((body) => body.label === 'mirror-bottle');
  assert.ok(mirroredBody);
  assert.ok(Math.abs(mirroredBody.x - (1280 - mirror.getBottle().position.x)) < 1e-6);
  assert.ok(Math.abs(mirroredBody.angularVelocity + mirror.getBottle().angularVelocity) < 1e-9);

  // A would-be MAKE never rewinds; the first would-be MISS is suppressed,
  // visibly reversed to apex, replayed once, and only then resolved.
  const noRewind = forcedPhysics('rewind', 6119);
  for (let i = 0; i < 45; i++) noRewind.step(1 / 60);
  assert.equal(noRewind.forceLanding('MAKE', { reason: 'qa-make' }), 'MAKE');
  assert.equal(noRewind.getEventRenderState().runtime.flags.replayed, undefined);

  const rewind = forcedPhysics('rewind', 6120);
  for (let i = 0; i < 90; i++) rewind.step(1 / 60);
  assert.equal(rewind.forceLanding('MISS', { reason: 'qa-first-failure' }), null,
    'Rewind emitted its first failure');
  assert.equal(rewind.getEventRenderState().runtime.phase, 'rewinding');
  assert.ok(runUntil(rewind,
    () => rewind.getEventRenderState().runtime.flags.replayed === true, 600),
  'Rewind never reached the apex/replay');
  assert.ok(rewind.getEventRenderState().runtime.correctionImpulse,
    'Rewind replay omitted its corrective impulse');
  const rewindOutcome = runToVerdict(rewind);
  assert.ok(rewindOutcome);
  assert.equal(rewindOutcome.info.meta.rewind.replayed, true);
  assert.equal(rewindOutcome.info.meta.rewind.firstFailureReason, 'qa-first-failure');

  const capToss = forcedPhysics('cap-toss', 6121);
  assert.ok(runUntil(capToss,
    () => capToss.getEventRenderState().runtime.flags.split === true, 240));
  assert.equal(capToss.getEventBodies().filter((body) => body.label === 'cap-toss-cap').length, 1);
  const capOutcome = runToVerdict(capToss);
  assert.ok(capOutcome);
  assert.equal(capOutcome.info.meta.capToss.bothRequired, true);
  assert.equal(capOutcome.verdict,
    capOutcome.info.meta.capToss.bodyLanded && capOutcome.info.meta.capToss.capLanded
      ? 'MAKE' : 'MISS');

  const drain = forcedPhysics('life-drain', 6122);
  assert.ok(runUntil(drain,
    () => drain.getEventRenderState().runtime.magnetVector !== null, 600),
  'Life Drain hidden magnet never affected the bottle');
}

testCanonicalRegistryAndHooks();
testForcedMapping();
testNormalOddsAcrossMillionsOfSeeds();
testInsaneOddsAcrossMillionsOfSeeds();
testEveryEventHasPhysicalRuntime();
testContactSettleAndTiming();
testResizeDeferral();
testAlienViewportMatrix();
testRulesMetadata();
testDeterminismAndRngIsolation();
testModeEventExclusions();
testNoTimeoutFuzzAndCleanup();
testDeepPhysicalSemantics();
console.log('v111 physics/event tests passed.');
