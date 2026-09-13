#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Matter = require('../js/vendor/matter.min.js');
const Rules = require('../js/v112-rules.js');
const Kernel = require('../js/v112-event-kernel.js');
const LivePlinko = require('../js/v112-plinko-live.js');
const Driver = require('../js/v112-plinko-resolution-driver.js');

const ROOT = path.resolve(__dirname, '..');
const APPEARANCE = Object.freeze({
  flipperId: 'bottle', variantId: 'blue-bottle',
  appearanceRevision: 'v112-resolution-test-art', cosmeticId: 'plain',
  authoredParts: Object.freeze(['body', 'cap', 'sealed-liquid']),
  internalDynamics: Object.freeze(['sealed-liquid-slosh']),
});

function players(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: 'p' + (index + 1), name: 'Player ' + (index + 1), human: true,
  }));
}

function selectedBody(engine) {
  const body = Matter.Body.create({ parts: [
    Matter.Bodies.rectangle(640, 620, 70, 50, { density: 0.0015 }),
    Matter.Bodies.rectangle(640, 658, 74, 70, { density: 0.018 }),
    Matter.Bodies.rectangle(640, 576, 44, 36, { density: 0.0004 }),
  ] });
  Matter.Composite.add(engine.world, body);
  return body;
}

function makePhysical(seed, vx) {
  const engine = Matter.Engine.create();
  const selected = selectedBody(engine);
  const live = LivePlinko.create({ Matter });
  live.attach({ engine, world: engine.world, selectedBody: selected,
    width: 1280, height: 720, groundY: 696, seed,
    entryVelocityX: vx, angularVelocity: 0.1,
    appearance: Object.assign({ physicsProfileId: 'competitive-shared' }, APPEARANCE) });
  let cleanupCalls = 0;
  return {
    live, selected,
    source: {
      snapshot: () => live.snapshot(),
      cleanup: reason => { cleanupCalls += 1; return live.cleanup(reason); },
    },
    cleanupCalls: () => cleanupCalls,
  };
}

function begin(driver, seed, launchId) {
  return driver.begin({ launchId, turnSeed: seed ^ 0x10203040,
    eventSeed: seed, oddsProfile: 'normal', forced: false, testData: false,
    appearance: APPEARANCE, physicsProfileId: 'competitive-shared',
    viewportHeight: 720 });
}

function runPhysical(options) {
  const source = options.source || makePhysical(options.seed, options.vx);
  const rules = options.rules || Rules.createRulesAdapter(Object.assign({
    matchId: options.matchId || 'plinko-' + options.seed,
    formatId: options.formatId || 'classic', players: players(options.playerCount || 4),
    startingLives: options.startingLives || 10,
  }, options.rulesOptions || {}));
  const driver = Driver.create({ rules, source: source.source, laneId: 'main' });
  begin(driver, options.seed, options.launchId || 'physical-' + options.seed);
  let resolution = null;
  for (let tick = 1; tick <= Driver.TIMEOUT_TICK && !resolution; tick += 1) {
    source.live.step();
    resolution = driver.poll();
  }
  assert.ok(resolution, 'physical Plinko did not produce a reward or no-contest');
  return { source, rules, driver, resolution };
}

function testPhysicalRewardAuthority() {
  const cases = [
    { seed: 510, vx: -1.5, slot: 0, prize: 'lives-doubled' },
    { seed: 526, vx: -0.7, slot: 1, prize: 'everyone-else-halved' },
    { seed: 511, vx: -1.45, slot: 2, prize: 'always-magnet' },
    { seed: 501, vx: -1.95, slot: 3, prize: 'automatic-loss' },
    { seed: 504, vx: -1.8, slot: 4, prize: 'automatic-win' },
  ];
  for (const expected of cases) {
    const run = runPhysical(expected);
    assert.equal(run.resolution.slotIndex, expected.slot);
    assert.equal(run.resolution.canonicalPrize, expected.prize);
    assert.equal(run.source.cleanupCalls(), 1,
      'the physical board must clean once before Rules presentation');
    const state = run.rules.snapshot();
    if (expected.slot === 0) assert.equal(state.players[0].lives, 20);
    if (expected.slot === 1) {
      assert.equal(state.players[1].lives, 5);
      assert.equal(state.players[2].lives, 5);
      assert.equal(state.players[3].lives, 5);
    }
    if (expected.slot === 2) assert.equal(state.players[0].alwaysMagnet, true);
    if (expected.slot === 3) {
      assert.equal(state.players[0].lives, 0);
      assert.equal(state.players[0].eliminated, true);
      assert.equal(run.resolution.rules.terminalOutcome, 'current-loss');
    }
    if (expected.slot === 4) {
      assert.equal(state.phase, 'complete');
      assert.deepEqual(state.winnerIds, ['p1']);
      assert.equal(run.resolution.rules.terminalOutcome, 'current-win');
    }
    const duplicate = run.driver.poll();
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.action, 'none');
    assert.equal(run.source.cleanupCalls(), 1);
  }
}

function testPhysicalDurationIsNotRewardAuthority() {
  const early = runPhysical({ seed: 510, vx: -1.5 });
  const facts = early.resolution.rules.transition.outcome.facts;
  assert.ok(facts.effectSummary.metadata.outcomeFacts.dropDurationMs < 10000,
    'fixture must prove a physical result below the normal experience band');
  assert.equal(early.resolution.canonicalPrize, 'lives-doubled');
  assert.equal(early.resolution.noContest, false);

  const tail = runPhysical({ seed: 1, vx: -2.2 });
  const tailMs = tail.resolution.rules.transition.outcome.facts
    .effectSummary.metadata.outcomeFacts.dropDurationMs;
  assert.ok(tailMs > 15000 && tailMs < 22000,
    'fixture must prove an active physical tail beyond the normal band');
  assert.equal(tail.resolution.noContest, false);
}

function testNoContestSchedulesExactlyOneSameTurnRetry() {
  // This qualified real-Matter seed/input remains unresolved through the four
  // bounded recovery impulses.  It reaches the adapter's true 30-second drop
  // timeout without a sensor result; no synthetic collision is injected.
  const physical = makePhysical(529, -0.55);
  const rules = Rules.createRulesAdapter({ formatId: 'classic',
    matchId: 'plinko-natural-timeout', players: players(3), startingLives: 3,
    suddenDeathAfterTurns: 0, suddenDeathStepTurns: 6 });
  const before = rules.snapshot();
  const driver = Driver.create({ rules, source: physical.source, laneId: 'main' });
  begin(driver, 529, 'natural-timeout');
  let resolution;
  for (let tick = 1; tick <= Driver.TIMEOUT_TICK; tick += 1) {
    physical.live.step();
    const candidate = driver.poll();
    if (candidate) { resolution = candidate; break; }
  }
  assert.ok(resolution, 'natural unresolved physical drop did not reach no-contest');
  assert.equal(resolution.action, 'retry-same-turn');
  assert.equal(resolution.noContest, true);
  assert.equal(resolution.slotIndex, null);
  assert.equal(resolution.canonicalPrize, null);
  assert.deepEqual(resolution.retry, {
    scheduled: true, sameCompetitiveTurn: true, eventReused: false,
    preserves: ['lives', 'stake', 'score', 'rotation', 'sudden-death'],
  });
  assert.equal(physical.cleanupCalls(), 1);
  const after = rules.snapshot();
  assert.deepEqual(after.players, before.players);
  assert.equal(after.currentPlayerIndex, before.currentPlayerIndex);
  assert.equal(after.stake, before.stake);
  assert.equal(after.rulesTurnCounter, before.rulesTurnCounter);
  assert.deepEqual(after.suddenDeath, before.suddenDeath);
  assert.deepEqual(after.turn, before.turn);
  assert.equal(after.attemptCounter, before.attemptCounter + 1);
  assert.equal(after.sequence, before.sequence + 1);
  const duplicate = driver.poll();
  assert.equal(duplicate.retry.scheduled, false,
    'polling a completed timeout cannot schedule a second retry');
  assert.equal(physical.cleanupCalls(), 1);
  rules.resolveFlip({ result: 'MAKE', pose: 'upright' });
  assert.equal(rules.snapshot().currentPlayerIndex, 1,
    'the next physical attempt resumes the same competitive turn normally');
}

function makeOnFireRules(matchId) {
  const rules = Rules.createRulesAdapter({ formatId: 'classic', matchId,
    players: players(2), startingLives: 10, suddenDeathEnabled: false });
  for (let index = 0; index < 5; index += 1) {
    rules.resolveFlip({ result: 'MAKE', pose: 'upright' });
  }
  assert.equal(rules.snapshot().players[rules.snapshot().currentPlayerIndex].onFire, true);
  return rules;
}

function testOnFireTerminalAndTimeoutBoundaries() {
  const lossRules = makeOnFireRules('plinko-fire-loss');
  const beforeLoss = lossRules.snapshot();
  const loss = runPhysical({ seed: 501, vx: -1.95, rules: lossRules });
  const afterLoss = lossRules.snapshot();
  assert.equal(afterLoss.players[0].lives, 0);
  assert.equal(afterLoss.onFirePlayerId, null);
  assert.equal(afterLoss.stake, beforeLoss.stake,
    'automatic loss bypasses ordinary ON FIRE/stake miss accounting');
  assert.deepEqual(afterLoss.winnerIds, ['p2']);

  const timeoutRules = makeOnFireRules('plinko-fire-timeout');
  const beforeTimeout = timeoutRules.snapshot();
  const timeout = runPhysical({ seed: 529, vx: -0.55, rules: timeoutRules });
  assert.equal(timeout.resolution.noContest, true);
  const afterTimeout = timeoutRules.snapshot();
  assert.deepEqual(afterTimeout.players, beforeTimeout.players);
  assert.equal(afterTimeout.onFirePlayerId, beforeTimeout.onFirePlayerId);
  assert.equal(afterTimeout.onFireEarned, beforeTimeout.onFireEarned);
  assert.equal(afterTimeout.stake, beforeTimeout.stake);
  assert.deepEqual(afterTimeout.turn, beforeTimeout.turn);
}

function testCupAndTeamTerminalSemantics() {
  const cupRules = Rules.createRulesAdapter({ formatId: 'cup',
    matchId: 'plinko-cup-loss', cupLength: 'short', players: players(4),
    startIndex: 2, direction: -1 });
  const cup = runPhysical({ seed: 501, vx: -1.95, rules: cupRules });
  assert.equal(cup.resolution.rules.transition.outcome.heatWinnerId, 'p2');
  assert.equal(cupRules.snapshot().phase, 'between-heats');
  assert.equal(cupRules.snapshot().heatResults[0].attempts, 1);
  assert.equal(cupRules.snapshot().heatResults[0].rulesTurns, 1);

  const teamWinRules = Rules.createRulesAdapter({ formatId: 'team-clash',
    matchId: 'plinko-team-win', players: players(4) });
  runPhysical({ seed: 504, vx: -1.8, rules: teamWinRules });
  assert.equal(teamWinRules.snapshot().winnerTeamIndex, 0);
  assert.equal(teamWinRules.snapshot().completionReason, 'automatic-team-result');

  const teamLossRules = Rules.createRulesAdapter({ formatId: 'team-clash',
    matchId: 'plinko-team-loss', players: players(4) });
  runPhysical({ seed: 501, vx: -1.95, rules: teamLossRules });
  assert.equal(teamLossRules.snapshot().winnerTeamIndex, 1);
  assert.equal(teamLossRules.snapshot().completionReason, 'automatic-team-result');
}

function testPhysicsCannotTurnTimeoutIntoAReward() {
  const physicsSource = fs.readFileSync(path.join(ROOT, 'js/physics.js'), 'utf8');
  assert.match(physicsSource,
    /A timeout is deliberately exposed in getPlinkoSnapshot\(\)[\s\S]{0,260}return null;/,
  'Physics must expose a no-contest signal and leave reward resolution to Rules');
  assert.doesNotMatch(physicsSource,
    /timedOut[\s\S]{0,160}(plinkoVerdict|slotIndex|legacyPrize)/,
  'Physics timeout path must never invent a Plinko slot');

  const context = vm.createContext({ console, Math,
    window: { matchMedia: () => ({ matches: false }) } });
  for (const relative of ['js/vendor/matter.min.js', 'js/v111-interfaces.js',
    'js/v111-physics-events.js', 'js/v112-plinko-matter.js',
    'js/v112-plinko-live.js', 'js/physics.js']) {
    let source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    if (relative === 'js/physics.js') source += '\nthis.__physics = Physics;';
    vm.runInContext(source, context, { filename: relative });
  }
  const physics = context.__physics;
  physics.init(1280, 720);
  physics.forceSpecialEvent('plinko');
  // The assertion above covers the exact live Physics branch.  Its source is
  // the same qualified adapter proven with the natural timeout fixture.
  physics.applyFlick(0, -2500, 529);
  assert.equal(physics.getPlinkoSnapshot().outcome, null);
  assert.equal(physics.checkLanding(), null);
}

function testDriverRejectsFabricatedSlotAndNonPlinkoAuthority() {
  assert.deepEqual(Array.from(Driver.SLOT_KINDS), [
    'lives-doubled', 'everyone-else-halved', 'always-magnet',
    'automatic-loss', 'automatic-win', 'automatic-loss',
    'always-magnet', 'everyone-else-halved', 'lives-doubled',
  ]);
  assert.equal(Kernel.EVENT_CLASS_BY_ID.plinko, 'wildcard');
  assert.throws(() => Kernel.normalizeOutcomeFacts('plinko', {
    objectColliderRef: 'body:flipper-main', slotSensorRef: null, slotIndex: 4,
    dropDurationMs: 30000, settled: false, completionKind: 'no-contest',
    recoveryStartedMs: 22000, recoveryImpulseCount: 4,
  }), /no-contest requires/,
  'a timeout cannot smuggle an automatic-win slot');

  const rules = Rules.createRulesAdapter({ formatId: 'classic',
    matchId: 'plinko-only-auto-win', players: players(2) });
  assert.throws(() => rules.resolveFlip({ result: 'MAKE', pose: 'upright',
    terminalOutcome: 'current-win' }), /event field/,
  'ordinary physics cannot request an automatic winner');
}

testPhysicalRewardAuthority();
testPhysicalDurationIsNotRewardAuthority();
testNoContestSchedulesExactlyOneSameTurnRetry();
testOnFireTerminalAndTimeoutBoundaries();
testCupAndTeamTerminalSemantics();
testPhysicsCannotTurnTimeoutIntoAReward();
testDriverRejectsFabricatedSlotAndNonPlinkoAuthority();

console.log('Plinko authority driver passed: real sensor rewards, 30-second one-shot retry, ' +
  'Classic/Cup/Team/ON FIRE semantics, cleanup, and timeout anti-fabrication.');
