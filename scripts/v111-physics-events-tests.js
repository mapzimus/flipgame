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
  const samples = 2_000_000;
  const normal = new Uint32Array(30);
  const boosted = new Uint32Array(30);
  let selected = 0;
  for (let seed = 1; seed <= samples; seed++) {
    for (let i = 0; i < Interfaces.EVENT_CATALOG.length; i++) {
      const denominator = Interfaces.EVENT_CATALOG[i].normalDenominator;
      const hash = Events.mixSeed(seed, Events.eventSalt(i));
      if (hash % denominator === 0) normal[i]++;
      if (hash % (denominator / 10) === 0) boosted[i]++;
    }
    const rolled = Events.rollId({ mode: 'normal', oddsProfile: 'normal', seed });
    if (rolled) selected++;
  }
  assert.ok(selected > 0 && selected < samples, 'normal selector must return zero or one event');
  for (let i = 0; i < normal.length; i++) {
    const denominator = Interfaces.EVENT_CATALOG[i].normalDenominator;
    const expected = samples / denominator;
    const tolerance = Math.max(0.035, 4.5 / Math.sqrt(expected));
    assert.ok(Math.abs(normal[i] - expected) / expected < tolerance,
      `${Interfaces.EVENT_IDS[i]} raw occurrence deviated from exact 1/${denominator}`);
    const ratio = boosted[i] / normal[i];
    assert.ok(ratio > 9.2 && ratio < 10.8,
      `${Interfaces.EVENT_IDS[i]} Mr. Howe ratio was ${ratio.toFixed(3)}, not 10x`);
  }
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

    if (definition.id === 'shrink-ray') {
      assert.ok(physics.getBottle().bounds.max.x - physics.getBottle().bounds.min.x < 60);
    }
    if (definition.id === 'mitosis' || definition.id === 'mirror-match') {
      assert.equal(physics.getEventBodies().length, 1);
    }
    if (definition.id === 'meteor-shower') assert.equal(physics.getEventBodies().length, 3);
    if (definition.id === 'alien-invasion') {
      assert.equal(physics.getTarget().style, 'portal');
      assert.equal(flick.gravityScale, 0.08);
    }
    if (definition.id === 'moon-gravity') assert.equal(flick.gravityScale, 0.28);
    if (definition.id === 'gravity-slam') assert.equal(flick.gravityScale, 2.55);
    if (definition.id === 'double-flip') assert.equal(flick.requiredTurns, 2);
    if (definition.id === 'cap-toss') {
      assert.equal(definition.metadata.landing.uprightValid, false);
      assert.equal(definition.metadata.landing.capValid, true);
    }
    if (definition.id === 'plinko') {
      const board = physics.getPlinko();
      assert.equal(board.rows, 8);
      assert.ok(board.bottom - board.top > 900);
      assert.equal(physics.getViewHint().trackingData.slots.length, 9);
    }

    physics.step(1 / 60);
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
    assert.ok(metrics.ringRadius >= 64 && metrics.ringRadius <= 112);
    assert.ok(metrics.attractionPerStep > 0);
    assert.ok(metrics.timeoutFrames >= 600 && metrics.timeoutFrames <= 900);
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
  assert.ok([1, 2].includes(mitosisOutcome.info.eventReward.landedCount));

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
testNoTimeoutFuzzAndCleanup();
console.log('v111 physics/event tests passed.');
