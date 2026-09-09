'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Rules = require('../js/v112-rules.js');
const Activity = require('../js/v112-activity.js');
const V111Modes = require('../js/v111-modes.js');

function players(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`,
    isAI: index % 3 === 2,
  }));
}

function stepClassic(state, input = { result: 'MISS' }) {
  return Rules.resolveClassicFlip(state, input).state;
}

function stepCup(state, input = { result: 'MISS' }) {
  return Rules.resolveCupFlip(state, input).state;
}

function stepTeam(state, input = { result: 'MISS' }) {
  return Rules.resolveTeamFlip(state, input).state;
}

function withResolution(state, callerId, input = {}) {
  return Object.assign({}, input, {
    flipId: callerId,
    resolutionIdentity: Rules.nextResolutionIdentity(state, callerId),
  });
}

function resolveClassicTurns(state, count, inputFactory) {
  for (let index = 0; index < count; index += 1) {
    const input = inputFactory ? inputFactory(state, index) : { result: 'MISS' };
    state = stepClassic(state, input);
  }
  return state;
}

function closeCupHeatFor(state, winnerId) {
  assert.equal(state.phase, 'heat');
  while (state.currentHeat.turn.current !== winnerId) {
    state = stepCup(state, { playerId: state.currentHeat.turn.current, result: 'MISS' });
  }
  const loserIds = state.config.players.map(player => player.id).filter(id => id !== winnerId);
  return stepCup(state, { playerId: winnerId, result: 'MAKE',
    effects: { forceEliminateIds: loserIds } });
}

function teamRound(state, actions) {
  let last;
  for (let index = 0; index < 6; index += 1) {
    const entry = state.queue[state.queuePosition];
    const action = actions[index] || { result: 'MISS' };
    last = Rules.resolveTeamFlip(state, Object.assign({ playerId: entry.playerId }, action));
    state = last.state;
  }
  return { state, outcome: last.outcome };
}

function testPublicContract() {
  assert.equal(Rules.schema, 'FlipgameV112RulesV1');
  assert.equal(Rules.version, 1);
  assert.equal(Rules.OUTCOME_SCHEMA, 'RulesOutcomeV1');
  assert.equal(Rules.RESOLUTION_IDENTITY_SCHEMA, 'ResolutionIdentityV1');
  assert.equal(Rules.MAX_CALLER_FLIP_ID_LENGTH, 96);
  assert.deepEqual(Rules.STARTING_LIFE_PRESETS, [3, 5, 10, 20, 100]);
  assert.equal(Object.isFrozen(Rules), true);
  assert.equal(Object.isFrozen(Rules.CUP_FORMATS), true);
  assert.deepEqual(Rules.REMATCH_STRATEGIES,
    ['same-setup', 'rotate-first-player', 'shuffle-order', 'swap-teams']);
}

function testClassicAllCountsAndPresets() {
  for (let count = 2; count <= 16; count += 1) {
    for (const startingLives of Rules.STARTING_LIFE_PRESETS) {
      const state = Rules.createClassicState({ matchId: `classic-${count}-${startingLives}`,
        players: players(count), startingLives });
      assert.equal(state.players.length, count);
      assert.deepEqual(state.players.map(player => player.lives), Array(count).fill(startingLives));
      assert.equal(state.config.additiveLifeCap, Math.ceil(startingLives * 1.5));
      assert.equal(state.turn.current, 'p1');
      assert.equal(state.turn.onDeck, 'p2');
      assert.equal(state.phase, 'active');
      assert.equal(Object.isFrozen(state), true);
      assert.equal(Object.isFrozen(state.players[0]), true);
    }
  }
  assert.throws(() => Rules.createClassicState({ players: players(1) }), /between 2 and 16/);
  assert.throws(() => Rules.createClassicState({ players: players(17) }), /between 2 and 16/);
  assert.throws(() => Rules.createClassicState({ players: [{ id: 'same' }, { id: 'same' }] }), /Duplicate/);

  const aliases = Rules.createClassicState({ matchId: 'cpu-aliases', players: [
    { id: 'human' }, { id: 'a', ai: true }, { id: 'b', cpu: true },
    { id: 'c', isCpu: true }, { id: 'd', type: 'cpu' }, { id: 'e', type: 'ai' },
    { id: 'f', isAI: true },
  ] });
  assert.deepEqual(aliases.players.map(player => player.isAI),
    [false, true, true, true, true, true, true]);

  const legacyDefs = Rules.createClassicState({ matchId: 'legacy-defs',
    defs: [{ id: 'd1' }, { id: 'd2', ai: true }], playerCount: 2 });
  assert.deepEqual(legacyDefs.players.map(player => player.isAI), [false, true]);
}

function testLegacyStakeAndTurnSemantics() {
  let state = Rules.createClassicState({ matchId: 'stake', players: players(2),
    startingLives: 10, suddenDeathEnabled: false });
  let transition = Rules.resolveClassicFlip(state, { result: 'MAKE' });
  state = transition.state;
  assert.equal(state.stake, 1, 'ordinary upright make adds one communal stake');
  assert.equal(state.turn.current, 'p2');
  assert.equal(transition.outcome.landing.worth, 1);

  state = stepClassic(state, { result: 'MAKE', pose: 'cap' });
  assert.equal(state.stake, 3, 'cap make adds two communal stake');
  assert.equal(state.turn.current, 'p1');

  transition = Rules.resolveClassicFlip(state, { result: 'MISS' });
  state = transition.state;
  assert.equal(transition.outcome.lives.before, 10);
  assert.equal(transition.outcome.lives.after, 7);
  assert.equal(transition.outcome.suddenDeath.penalty, 3);
  assert.equal(state.stake, 0);
  assert.equal(state.turn.current, 'p2');
  assert.equal(transition.outcome.type, 'rules.classic-flip-resolved.v1');
  assert.equal(transition.outcome.schema, 'RulesOutcomeV1');

  let pressure = Rules.createClassicState({ matchId: 'heat-point', players: players(2),
    startingLives: 3, suddenDeathEnabled: false });
  pressure = stepClassic(pressure, { result: 'MAKE' });
  pressure = stepClassic(pressure, { result: 'MAKE', pose: 'cap' });
  assert.equal(Rules.classicMissWouldEliminate(pressure), true);
  assert.ok(pressure.turn.signals.includes('heat-point'));
}

function testOnFireEightPlayerThreeLifeRegression() {
  let state = Rules.createClassicState({
    matchId: 'reported-8p-3l-fire-sd', players: players(8), startingLives: 3,
    suddenDeathAfterTurns: 8,
  });

  // Three complete personal makes for p1, with two full rounds between them.
  // All normal makes avoid eliminating anyone while entering sudden death.
  state = resolveClassicTurns(state, 17, current => ({
    playerId: current.turn.current, result: 'MAKE',
  }));
  assert.equal(state.turn.current, 'p1');
  assert.equal(state.players[0].onFire, true);
  assert.equal(state.players[0].streak, 3);
  assert.equal(state.stake, 17);
  assert.equal(state.suddenDeath.phase, 'sudden-death');

  const rulesTurnsAtIgnition = state.rulesTurnCounter;
  const levelAtIgnition = state.suddenDeath.level;
  let transition = Rules.resolveClassicFlip(state, { playerId: 'p1', result: 'MAKE' });
  state = transition.state;
  assert.equal(state.players[0].lives, 4, 'upright ON FIRE make adds one life');
  assert.equal(state.players[0].streak, 4, 'live streak continues beyond three');
  assert.equal(state.rulesTurnCounter, rulesTurnsAtIgnition,
    'bonus makes do not advance sudden-death accounting');
  assert.equal(state.stake, 17);

  transition = Rules.resolveClassicFlip(state, { playerId: 'p1', result: 'MISS' });
  state = transition.state;
  assert.equal(transition.outcome.onFire.protectedMiss, true);
  assert.equal(transition.outcome.suddenDeath.penalty, 0);
  assert.equal(transition.outcome.suddenDeath.counted, false);
  assert.equal(state.players[0].lives, 4, 'fire-ending miss cannot take stake or sudden-death lives');
  assert.equal(state.players[0].eliminated, false);
  assert.equal(state.players[0].streak, 0);
  assert.equal(state.players[0].onFire, false);
  assert.equal(state.stake, 17, 'communal stake survives the entire bonus run');
  assert.equal(state.rulesTurnCounter, rulesTurnsAtIgnition);
  assert.equal(state.suddenDeath.level, levelAtIgnition);
  assert.equal(state.turn.current, 'p2', 'the protected miss passes the turn');
}

function testOnFireRewardsCapAndMultiplierExceptions() {
  for (const startingLives of Rules.STARTING_LIFE_PRESETS) {
    const cap = Rules.additiveLifeCap(startingLives);
    assert.equal(cap, Math.ceil(startingLives * 1.5));
    assert.equal(Rules.addLivesCapped(cap - 1, 9, startingLives).lives, cap);
    assert.equal(Rules.addLivesCapped(cap, 9, startingLives).gained, 0);
    assert.equal(Rules.multiplyLives(cap, 2), cap * 2);

    let state = Rules.createClassicState({ matchId: `fire-cap-${startingLives}`,
      players: players(2), startingLives, suddenDeathEnabled: false });
    // p1 makes on personal turns 1, 2 and 3; p2 makes between them.
    state = resolveClassicTurns(state, 5, current => ({
      playerId: current.turn.current, result: 'MAKE',
    }));
    assert.equal(state.turn.current, 'p1');
    assert.equal(state.players[0].onFire, true);
    let transition = Rules.resolveClassicFlip(state, { playerId: 'p1', result: 'MAKE', pose: 'cap' });
    state = transition.state;
    assert.equal(state.players[0].lives, Math.min(cap, startingLives + 2));
    assert.equal(transition.outcome.onFire.rewardApplied, Math.min(2, cap - startingLives));

    if (state.players[0].onFire) {
      transition = Rules.resolveClassicFlip(state, { playerId: 'p1', result: 'MAKE',
        effects: { additiveLives: startingLives * 2 } });
      state = transition.state;
      assert.equal(state.players[0].lives, cap);
      assert.equal(transition.outcome.onFire.capped, true);
      assert.equal(state.players[0].onFire, false);
    }

    // Explicit multiplication bypasses the additive ceiling and later additive
    // rewards do not pull the value back down.
    let multiplied = Rules.createClassicState({ matchId: `multiply-${startingLives}`,
      players: players(2), startingLives, suddenDeathEnabled: false });
    transition = Rules.resolveClassicFlip(multiplied, { result: 'MAKE',
      effects: { lifeMultiplier: 2 } });
    multiplied = transition.state;
    assert.equal(multiplied.players[0].lives, startingLives * 2);
    const before = multiplied.players[0].lives;
    // Cycle back to p1 and request an additive reward.
    multiplied = stepClassic(multiplied, { result: 'MISS' });
    multiplied = stepClassic(multiplied, { result: 'MAKE', effects: { additiveLives: 99 } });
    assert.equal(multiplied.players[0].lives, before);
  }
}

function testOpponentHalvingAndForcedZero() {
  assert.equal(Rules.halveLives(1), 1);
  assert.equal(Rules.halveLives(5), 3);
  assert.equal(Rules.halveLives(6), 3);
  let state = Rules.createClassicState({ matchId: 'halve', players: players(4),
    startingLives: 5, suddenDeathEnabled: false });
  let transition = Rules.resolveClassicFlip(state, { result: 'MAKE',
    effects: { halveOpponents: true } });
  state = transition.state;
  assert.deepEqual(state.players.map(player => player.lives), [5, 3, 3, 3]);
  assert.deepEqual(transition.outcome.effects.halvedOpponentIds, ['p2', 'p3', 'p4']);

  state = Rules.createClassicState({ matchId: 'allied-exclusion', players: players(3),
    startingLives: 5, suddenDeathEnabled: false });
  state = stepClassic(state, { result: 'MAKE', effects: { halveOpponents: true,
    excludedTargetIds: ['p2'] } });
  assert.deepEqual(state.players.map(player => player.lives), [5, 5, 3],
    'activity adapters can protect an allied co-op human from opponent effects');

  for (let count = 2; count <= 16; count += 1) {
    for (const startingLives of Rules.STARTING_LIFE_PRESETS) {
      state = Rules.createClassicState({ matchId: `forced-${count}-${startingLives}`,
        players: players(count), startingLives });
      const result = Rules.forceEliminate(state, 'p2', 'test');
      assert.equal(result.state.players[1].lives, 0);
      assert.equal(result.state.players[1].eliminated, true);
    }
  }
}

function testSuddenDeathUsesWholeSeatRotations() {
  for (let count = 2; count <= 16; count += 1) {
    let state = Rules.createClassicState({ matchId: `sd-${count}`, players: players(count),
      startingLives: 100, suddenDeathAfterTurns: 70 });
    const activation = Math.ceil(70 / count) * count;
    assert.equal(state.suddenDeath.activationTurn, activation);
    state = resolveClassicTurns(state, activation - 1);
    assert.equal(state.suddenDeath.level, 0);
    state = stepClassic(state);
    assert.equal(state.suddenDeath.level, 1);
    const levelTurns = Math.ceil(20 / count) * count;
    assert.equal(state.suddenDeath.band.targetTurns, levelTurns);
    state = resolveClassicTurns(state, levelTurns - 1);
    assert.equal(state.suddenDeath.level, 1,
      `${count} players must all finish the level-one allotment`);
    const boundary = Rules.resolveClassicFlip(state, { result: 'MISS' });
    state = boundary.state;
    assert.equal(state.suddenDeath.level, 2,
      `${count} players advance only at a full-rotation boundary`);
    assert.equal(boundary.outcome.suddenDeath.configuredActivationTurn, 70);
    assert.equal(boundary.outcome.suddenDeath.paddedActivationTurn, activation);
    assert.equal(boundary.outcome.suddenDeath.minimumBandTurns, 20);
    assert.equal(boundary.outcome.suddenDeath.paddedBandTurnsBefore, levelTurns);
    assert.equal(boundary.outcome.suddenDeath.turnsPerActiveSeatBefore,
      Math.ceil(20 / count));
    const counts = state.suddenDeath.band.turnsByPlayer;
    assert.ok(Object.values(counts).every(value => value === 0),
      'the new escalation starts with a fresh equal-turn ledger');
  }

  // Cup thresholds are already exact rotation multiples.
  for (let count = 2; count <= 12; count += 1) {
    const state = Rules.createCupState({ matchId: `short-threshold-${count}`,
      cupLength: 'short', players: players(count) });
    assert.equal(state.currentHeat.suddenDeath.activationTurn, count * 3);
  }
  for (let count = 2; count <= 8; count += 1) {
    const state = Rules.createCupState({ matchId: `full-threshold-${count}`,
      cupLength: 'full', players: players(count) });
    assert.equal(state.currentHeat.suddenDeath.activationTurn, count * 5);
  }

  let waived = Rules.createClassicState({ matchId: 'sd-elimination-waiver',
    players: players(4), startingLives: 100, suddenDeathAfterTurns: 0 });
  waived = stepClassic(waived, { playerId: 'p1', result: 'MAKE',
    effects: { forceEliminateIds: ['p4'] } });
  assert.equal(waived.players[3].lives, 0);
  waived = resolveClassicTurns(waived, 13);
  assert.equal(waived.suddenDeath.level, 1,
    'waiving the eliminated seat cannot skip a surviving seat allocation');
  waived = stepClassic(waived);
  assert.equal(waived.suddenDeath.level, 2,
    'the level advances after every survivor receives all five turns');
}

function testOnFireCannotAdvanceSuddenDeathBand() {
  let state = Rules.createClassicState({ matchId: 'fire-clock', players: players(2),
    startingLives: 100, suddenDeathAfterTurns: 0 });
  // Ignite p1 while level one is in progress.
  state = resolveClassicTurns(state, 5, current => ({ playerId: current.turn.current, result: 'MAKE' }));
  assert.equal(state.players[0].onFire, true);
  const before = JSON.stringify(state.suddenDeath);
  for (let bonus = 0; bonus < 10; bonus += 1) {
    state = stepClassic(state, { playerId: 'p1', result: 'MAKE' });
  }
  assert.equal(JSON.stringify(state.suddenDeath), before);
  state = stepClassic(state, { playerId: 'p1', result: 'MISS' });
  assert.equal(JSON.stringify(state.suddenDeath), before);
}

function testCupLimitsResetsRotationAndBestOfThree() {
  for (let count = 2; count <= 12; count += 1) {
    const short = Rules.createCupState({ matchId: `short-${count}`, cupLength: 'short',
      players: players(count), direction: -1 });
    assert.equal(short.currentHeat.players.length, count);
    assert.ok(short.currentHeat.players.every(player => player.lives === 3));
    assert.equal(short.currentHeat.config.startIndex, 0);
  }
  for (let count = 2; count <= 8; count += 1) {
    const full = Rules.createCupState({ matchId: `full-${count}`, cupLength: 'full',
      players: players(count) });
    assert.ok(full.currentHeat.players.every(player => player.lives === 10));
  }
  assert.throws(() => Rules.createCupState({ cupLength: 'short', players: players(13) }), /between 2 and 12/);
  assert.throws(() => Rules.createCupState({ cupLength: 'full', players: players(9) }), /between 2 and 8/);

  let state = Rules.createCupState({ matchId: 'cup-series', cupLength: 'short',
    players: players(4), direction: 1, startIndex: 0 });
  state = closeCupHeatFor(state, 'p1');
  assert.equal(state.phase, 'between-heats');
  assert.equal(state.heatWins.p1, 1);
  assert.equal(state.heatNumber, 2);
  state = Rules.beginNextCupHeat(state);
  assert.equal(state.currentHeat.config.startIndex, 1, 'heat starter rotates one seat');
  assert.ok(state.currentHeat.players.every(player => player.lives === 3), 'lives reset between heats');
  state = closeCupHeatFor(state, 'p1');
  assert.equal(state.phase, 'complete');
  assert.deepEqual(state.winnerIds, ['p1']);
  assert.equal(state.heatResults.length, 2);
  assert.equal(state.completionReason, 'cup-won');

  let pressure = Rules.createCupState({ matchId: 'cup-match-point', cupLength: 'short',
    players: players(2), startIndex: 0 });
  pressure = closeCupHeatFor(pressure, 'p1');
  pressure = Rules.beginNextCupHeat(pressure);
  pressure = stepCup(pressure, { playerId: 'p2', result: 'MAKE' });
  pressure = stepCup(pressure, { playerId: 'p1', result: 'MAKE', pose: 'cap' });
  assert.ok(pressure.turn.signals.includes('heat-point'));
  assert.ok(pressure.turn.signals.includes('match-point'));

  let magnet = Rules.createCupState({ matchId: 'cup-earned-magnet', cupLength: 'short',
    players: players(2) });
  magnet = stepCup(magnet, { playerId: 'p1', result: 'MAKE',
    effects: { grantAlwaysMagnet: true } });
  assert.deepEqual(magnet.persistentMagnetIds, ['p1']);
  assert.equal(magnet.currentHeat.config.players[0].alwaysMagnet, true);
  assert.doesNotThrow(() => Rules.resolveCupFlip(magnet,
    { playerId: magnet.turn.current, result: 'MISS' }));
}

function testCupMultiWinnerShootoutAndRematches() {
  let state = Rules.createCupState({ matchId: 'cup-shootout', cupLength: 'short',
    players: players(5), startIndex: 0, seed: 88 });
  state = closeCupHeatFor(state, 'p1');
  state = Rules.beginNextCupHeat(state);
  state = closeCupHeatFor(state, 'p2');
  state = Rules.beginNextCupHeat(state);
  state = closeCupHeatFor(state, 'p3');
  assert.equal(state.phase, 'shootout');
  assert.equal(state.shootout.eventsDisabled, true);
  assert.deepEqual(state.shootout.participantIds, ['p1', 'p2', 'p3']);

  const firstOrder = state.shootout.queue.slice();
  // Nobody makes: the full tied field gets another fairly rotated round.
  while (state.phase === 'shootout' && state.shootout.round === 1) {
    state = stepCup(state, { playerId: state.turn.current, result: 'MISS' });
  }
  assert.equal(state.shootout.round, 2);
  assert.notDeepEqual(state.shootout.queue, firstOrder);
  const winningId = state.shootout.queue[1];
  while (state.phase === 'shootout') {
    const id = state.turn.current;
    state = stepCup(state, { playerId: id, result: id === winningId ? 'MAKE' : 'MISS' });
  }
  assert.deepEqual(state.winnerIds, [winningId]);
  assert.equal(state.completionReason, 'cup-shootout');

  const a = Rules.cupRematchOptions(state, 1234);
  const b = Rules.cupRematchOptions(state, 1234);
  assert.deepEqual(a, b);
  assert.equal(a.sameSetup.startIndex, 1);
  assert.equal(a.rotateFirstPlayer.startIndex, 0);
  assert.equal(a.rotateFirstPlayer.players[0].id, 'p2');
  assert.equal(new Set(a.shuffleOrder.players.map(player => player.id)).size, 5);
  assert.equal(Object.isFrozen(a), true);
}

function testTeamCountsQueueAndFairRotation() {
  for (let count = 2; count <= 16; count += 2) {
    let state = Rules.createTeamClashState({ matchId: `team-${count}`, players: players(count) });
    assert.equal(state.queue.length, 6, `${count} players still use six flips per round`);
    assert.deepEqual(state.queue.map(entry => entry.teamIndex), [0, 1, 0, 1, 0, 1]);
    assert.deepEqual(state.queue.reduce((totals, entry) => {
      totals[entry.teamIndex] += 1;
      return totals;
    }, [0, 0]), [3, 3]);
    assert.equal(state.turn.current, state.queue[0].playerId);
    assert.equal(state.turn.onDeck, state.queue[1].playerId);
    assert.equal(state.turn.afterThat, state.queue[2].playerId);

    const seen = [new Set(), new Set()];
    for (let round = 0; round < count / 2 + 2; round += 1) {
      for (const entry of state.queue) seen[entry.teamIndex].add(entry.playerId);
      ({ state } = teamRound(state, Array(6).fill({ result: 'MISS' })));
    }
    assert.equal(seen[0].size, count / 2, `all ${count / 2} team-A members rotate in`);
    assert.equal(seen[1].size, count / 2, `all ${count / 2} team-B members rotate in`);
  }
  for (const count of [3, 5, 7, 9, 11, 13, 15]) {
    assert.throws(() => Rules.createTeamClashState({ players: players(count) }), /even 2–16/);
  }

  const rosterTeams = players(4).map((player, index) => Object.assign({}, player, {
    teamId: index < 2 ? 'north' : 'south',
  }));
  const derived = Rules.createTeamClashState({ matchId: 'derived-teams', players: rosterTeams });
  assert.deepEqual(derived.config.teamIds, ['north', 'south']);
  assert.deepEqual(derived.config.teams, [['p1', 'p2'], ['p3', 'p4']]);
  assert.throws(() => Rules.createTeamClashState({ players: [
    { id: 'x', teamId: 'north' }, { id: 'y' },
  ] }), /exactly two complete teams/);
}

function testTeamScoringCancellationAndNoWinByTwo() {
  let state = Rules.createTeamClashState({ matchId: 'team-score', players: players(4) });
  let result = teamRound(state, [
    { result: 'MAKE', rawPoints: 5 }, { result: 'MAKE', rawPoints: 3 },
    { result: 'MAKE', rawPoints: 1 }, { result: 'MAKE', rawPoints: 1 },
    { result: 'MISS' }, { result: 'MISS' },
  ]);
  state = result.state;
  assert.deepEqual(result.outcome.round.raw, [6, 4]);
  assert.equal(result.outcome.round.cancelled, 4);
  assert.equal(result.outcome.round.awardedPoints, 2);
  assert.deepEqual(state.scores, [2, 0]);

  result = teamRound(state, [
    { result: 'MISS' }, { result: 'MAKE', rawPoints: 9 },
    { result: 'MISS' }, { result: 'MISS' },
    { result: 'MISS' }, { result: 'MISS' },
  ]);
  state = result.state;
  assert.equal(state.scores[0], 11);
  assert.equal(state.phase, 'complete');
  assert.equal(state.winnerTeamIndex, 0);
  assert.equal(state.scores[1], 0, 'first to 11 does not require a two-point margin');
  assert.deepEqual(state.winnerIds.slice().sort(), ['p1', 'p3']);
}

function testTeamRuleEffectsAndPersistentMagnet() {
  let state = Rules.createTeamClashState({ matchId: 'team-effects', players: players(2) });
  let transition = Rules.resolveTeamFlip(state, { playerId: state.turn.current,
    result: 'MAKE', rawPoints: 2, effects: { scoreMultiplier: 3,
      grantAlwaysMagnet: true } });
  state = transition.state;
  assert.equal(state.roundRaw[0], 6);
  assert.deepEqual(state.persistentMagnetIds, ['p1']);

  transition = Rules.resolveTeamFlip(state, { playerId: state.turn.current,
    result: 'MAKE', rawPoints: 5 });
  state = transition.state;
  assert.equal(state.roundRaw[1], 5);
  transition = Rules.resolveTeamFlip(state, { playerId: state.turn.current,
    result: 'MAKE', effects: { halveOpponentRound: true } });
  state = transition.state;
  assert.equal(state.roundRaw[1], 3, 'opponent round points halve upward');
  assert.throws(() => Rules.resolveTeamFlip(state, { playerId: state.turn.current,
    result: 'MAKE', disallowed: true }), /not eligible/);

  const beforeMiss = state.roundRaw.slice();
  transition = Rules.resolveTeamFlip(state, { playerId: state.turn.current,
    result: 'MISS', rawPoints: 99, effects: { additivePoints: 50,
      halveOpponentRound: true, grantAlwaysMagnet: true } });
  assert.equal(transition.outcome.rawPoints, 0, 'a miss cannot be converted into raw points');
  assert.equal(transition.state.roundRaw[0], beforeMiss[0]);
  assert.equal(transition.state.persistentMagnetIds.length, 1,
    'miss-side effects cannot grant permanent assistance');
}

function testTeamPositivePresentationSignals() {
  let state = Rules.createTeamClashState({ matchId: 'team-comeback', players: players(2) });
  let result = teamRound(state, [
    { result: 'MISS' }, { result: 'MAKE', rawPoints: 5 },
    { result: 'MISS' }, { result: 'MISS' },
    { result: 'MISS' }, { result: 'MISS' },
  ]);
  state = result.state;
  assert.deepEqual(state.scores, [0, 5]);
  result = teamRound(state, [
    { result: 'MISS' }, { result: 'MAKE', rawPoints: 5 },
    { result: 'MISS' }, { result: 'MISS' },
    { result: 'MISS' }, { result: 'MISS' },
  ]);
  state = result.state;
  assert.deepEqual(state.scores, [5, 5]);
  assert.ok(result.outcome.presentation.cues.includes('comeback-shot'));

  // Build a separate 10–0 lead, then win 2–1 so cancellation is part of the
  // target-score play and the final pre-shot metadata announces Match Point.
  state = Rules.createTeamClashState({ matchId: 'team-cancel-win', players: players(2) });
  ({ state } = teamRound(state, [
    { result: 'MAKE', rawPoints: 10 }, { result: 'MISS' },
    { result: 'MISS' }, { result: 'MISS' },
    { result: 'MISS' }, { result: 'MISS' },
  ]));
  assert.deepEqual(state.scores, [10, 0]);
  // Round two starts team B. Arrange B=1 and A=1 before the last A flip.
  state = stepTeam(state, { playerId: state.turn.current, result: 'MAKE', rawPoints: 1 });
  state = stepTeam(state, { playerId: state.turn.current, result: 'MAKE', rawPoints: 1 });
  state = stepTeam(state, { playerId: state.turn.current, result: 'MISS' });
  state = stepTeam(state, { playerId: state.turn.current, result: 'MISS' });
  state = stepTeam(state, { playerId: state.turn.current, result: 'MISS' });
  assert.ok(state.turn.signals.includes('match-point'));
  result = Rules.resolveTeamFlip(state, { playerId: state.turn.current,
    result: 'MAKE', rawPoints: 1 });
  assert.equal(result.state.phase, 'complete');
  assert.ok(result.outcome.presentation.cues.includes('cancel-for-win'));
  assert.ok(result.outcome.presentation.cues.includes('match-win'));

  const forbidden = /miss|failure|worst|most-misses/i;
  assert.ok(!result.outcome.presentation.cues.some(cue => forbidden.test(cue)));
  assert.equal(result.outcome.presentation.positiveOnly, true);

  const highlights = Rules.collectPositiveHighlights([
    { schema: 'RulesOutcomeV1', sequence: 1, outcomeId: 'a', playerId: 'p1',
      presentation: { positiveOnly: true, cues: ['make', 'cap-landing'] } },
    result.outcome,
    { schema: 'RulesOutcomeV1', sequence: 99, outcomeId: 'negative', playerId: 'p2',
      presentation: { positiveOnly: false, cues: ['most-misses'] } },
  ], 3);
  assert.deepEqual(highlights.map(entry => entry.kind),
    ['match-win', 'cancel-for-win', 'cap-landing']);
  assert.equal(Object.isFrozen(highlights), true);
}

function testTeamRematchesAllSizes() {
  for (let count = 2; count <= 16; count += 2) {
    const state = Rules.createTeamClashState({ matchId: `rematch-${count}`,
      players: players(count), startingTeamIndex: 0, seed: 99 });
    const a = Rules.teamRematchOptions(state, 4242);
    const b = Rules.teamRematchOptions(state, 4242);
    assert.deepEqual(a, b);
    assert.equal(a.sameSetup.startingTeamIndex, 1);
    assert.deepEqual(a.sameSetup.teammateOffsets,
      [1 % (count / 2), 1 % (count / 2)]);
    assert.equal(a.rotateFirstPlayer.teams[0][0],
      state.config.teams[0][1 % state.config.teams[0].length]);
    assert.deepEqual(a.swapTeams.teams[0], state.config.teams[1]);
    assert.equal(a.swapTeams.teamIds[a.swapTeams.startingTeamIndex], 'team-b',
      'side swapping still gives the prior non-starting team the rematch opener');
    assert.deepEqual(new Set(a.shuffleOrder.teams.flat()), new Set(players(count).map(player => player.id)));
    assert.equal(Object.isFrozen(a.sameSetup), true);
  }
}

function testAdapterMatchRequestAndOutcomeCompatibility() {
  const request = Activity.MatchRequestV2({
    matchId: 'activity-classic', activityId: 'free-play', formatId: 'classic',
    physicsModeId: 'normal', roster: players(4), rulesOptions: { startingLives: 5 }, seed: 7,
  });
  const adapter = Rules.createRulesAdapter(request);
  assert.equal(adapter.snapshot().config.startingLives, 5);
  assert.throws(() => adapter.resolveFlip({ playerId: 'p1', result: 'MAKE',
    effects: { forceEliminateIds: ['p2', 'p3', 'p4'] } }), /cannot apply event field/);
  assert.throws(() => adapter.resolveFlip({ playerId: 'p1', result: 'MAKE', rawPoints: 99 }),
    /cannot apply event field/);
  let attempts = 0;
  while (adapter.snapshot().phase !== 'complete' && attempts < 200) {
    const state = adapter.snapshot();
    adapter.resolveFlip({ playerId: state.turn.current, result: 'MISS' });
    attempts += 1;
  }
  assert.ok(attempts < 200, 'ordinary adapter match did not complete');
  const raw = adapter.toMatchOutcome({ endedAt: '2026-09-07T12:00:00Z' });
  const accepted = Activity.MatchOutcomeV2(raw);
  assert.equal(accepted.schema, 'MatchOutcomeV2');
  assert.equal(accepted.status, 'completed');
  assert.equal(accepted.winnerIds.length, 1);
  assert.ok(players(4).some(player => player.id === accepted.winnerIds[0]));
  assert.equal(accepted.participantResults.length, 4);
  assert.equal(Object.isFrozen(raw), true);
}

function testDeterminismAndInputImmutability() {
  const initial = Rules.createClassicState({ matchId: 'deterministic', players: players(3),
    startingLives: 10, suddenDeathAfterTurns: 3 });
  const input = { result: 'MAKE', pose: 'cap', effects: { additiveLives: 2,
    metadata: { source: 'test' } } };
  const copy = structuredClone(input);
  const a = Rules.resolveClassicFlip(initial, input);
  const b = Rules.resolveClassicFlip(initial, input);
  assert.deepEqual(a, b);
  assert.deepEqual(input, copy);
  assert.equal(initial.stake, 0);
  assert.equal(a.state.stake, 2);
  assert.equal(Object.isFrozen(a.state.turn), true);
  assert.equal(Object.isFrozen(a.outcome.effects.metadata), true);
}

function testV111CompatibilitySurface() {
  for (const startingLives of Rules.STARTING_LIFE_PRESETS) {
    assert.equal(Rules.additiveLifeCap(startingLives), V111Modes.additiveLifeCap(startingLives));
    assert.equal(Rules.addLivesCapped(startingLives, 4, startingLives).lives,
      V111Modes.addLivesCapped(startingLives, 4, startingLives).lives);
    assert.equal(Rules.multiplyLives(startingLives, 2), V111Modes.multiplyLives(startingLives, 2));
    assert.equal(Rules.halveLives(startingLives), V111Modes.halveLives(startingLives));
  }
  const state = Rules.createClassicState({ matchId: 'legacy-shape', players: players(5),
    startingLives: 10, startIndex: 3, suddenDeathAfterTurns: 70 });
  const options = Rules.legacyClassicOptions(state);
  assert.deepEqual(options, { format: 'classic', startingLives: 10,
    startIndex: 3, suddenDeathFlipThreshold: 70 });
  const legacy = Rules.legacyClassicSnapshot(state);
  assert.equal(legacy.pointCount, 0);
  assert.equal(legacy.turnCounter, 0);
  assert.equal(legacy.currentPlayerIndex, 3);
  assert.equal(legacy.players.length, 5);
}

function testCompactMonotonicResolutionIdentity() {
  let classic = Rules.createClassicState({ matchId: 'dedup-classic', players: players(3) });
  assert.equal('resolvedFlipIds' in classic, false);
  const classicA = withResolution(classic, 'classic-a', { result: 'MAKE' });
  let transition = Rules.resolveClassicFlip(classic, classicA);
  assert.equal(transition.outcome.resolutionIdentity.ordinal, 1);
  assert.equal(transition.outcome.outcomeId, classicA.resolutionIdentity.id);
  classic = transition.state;
  const classicB = withResolution(classic, 'classic-b', { result: 'MISS' });
  classic = Rules.resolveClassicFlip(classic, classicB).state;
  const classicBefore = JSON.stringify(classic);
  assert.throws(() => Rules.resolveClassicFlip(classic, classicA),
    /stale|foreign|Duplicate/i);
  assert.equal(JSON.stringify(classic), classicBefore, 'stale callback rejection is atomic');
  assert.throws(() => Rules.resolveClassicFlip(classic, { flipId: 'unbound-caller-id',
    result: 'MISS' }), /ResolutionIdentityV1/);
  assert.throws(() => Rules.nextResolutionIdentity(classic, 'x'.repeat(97)), /exceeds 96/);
  const tampered = structuredClone(Rules.nextResolutionIdentity(classic, 'tampered'));
  tampered.token = tampered.token.replace(/^./, tampered.token[0] === '0' ? '1' : '0');
  assert.throws(() => Rules.resolveClassicFlip(classic, {
    result: 'MISS', resolutionIdentity: tampered,
  }), /payload is invalid/);
  const rebound = structuredClone(Rules.nextResolutionIdentity(classic, 'original-caller'));
  rebound.callerId = 'different-caller';
  rebound.id = rebound.id.slice(0, rebound.id.lastIndexOf('|') + 1) +
    encodeURIComponent(rebound.callerId);
  assert.throws(() => Rules.resolveClassicFlip(classic, {
    result: 'MISS', resolutionIdentity: rebound,
  }), /payload is invalid/, 'the identity token binds its caller ID');
  assert.throws(() => Rules.resolveClassicFlip(classic, {
    result: 'MISS', flipId: 'different-caller',
    resolutionIdentity: Rules.nextResolutionIdentity(classic, 'bound-caller'),
  }), /does not match/);

  const restored = JSON.parse(JSON.stringify(classic));
  const restoredIdentity = Rules.nextResolutionIdentity(restored, 'after-restore');
  transition = Rules.resolveClassicFlip(restored, { result: 'MISS',
    flipId: restoredIdentity.id });
  assert.equal(transition.state.sequence, 3);
  assert.equal(transition.outcome.resolutionIdentity.callerId, 'after-restore');

  const foreign = Rules.createClassicState({ matchId: 'other-match', players: players(3) });
  assert.throws(() => Rules.resolveClassicFlip(foreign, Object.assign({}, classicB,
    { playerId: foreign.turn.current })), /stale|foreign/i);

  let cup = Rules.createCupState({ matchId: 'dedup-cup', cupLength: 'short', players: players(2) });
  cup = JSON.parse(JSON.stringify(cup));
  const cupIdentity = withResolution(cup, 'cup-across-heats', { result: 'MAKE',
    effects: { forceEliminateIds: ['p2'] } });
  transition = Rules.resolveCupFlip(cup, cupIdentity);
  cup = transition.state;
  assert.equal(transition.outcome.resolutionIdentity.namespace,
    cupIdentity.resolutionIdentity.namespace);
  assert.notEqual(transition.outcome.innerOutcome.resolutionIdentity.namespace,
    transition.outcome.resolutionIdentity.namespace, 'Cup inner and outer namespaces cannot collide');
  cup = Rules.beginNextCupHeat(cup);
  const cupBefore = JSON.stringify(cup);
  assert.throws(() => Rules.resolveCupFlip(cup, cupIdentity), /stale|foreign/i);
  assert.equal(JSON.stringify(cup), cupBefore);

  let shootout = Rules.createCupState({ matchId: 'dedup-shootout', cupLength: 'short',
    players: players(3) });
  shootout = closeCupHeatFor(shootout, 'p1');
  shootout = Rules.beginNextCupHeat(shootout);
  shootout = closeCupHeatFor(shootout, 'p2');
  shootout = Rules.beginNextCupHeat(shootout);
  shootout = closeCupHeatFor(shootout, 'p3');
  assert.equal(shootout.phase, 'shootout');
  shootout = JSON.parse(JSON.stringify(shootout));
  const shootoutOld = withResolution(shootout, 'shootout-old', {
    playerId: shootout.turn.current, result: 'MISS' });
  shootout = stepCup(shootout, shootoutOld);
  shootout = stepCup(shootout, { playerId: shootout.turn.current, result: 'MISS' });
  shootout = stepCup(shootout, { playerId: shootout.turn.current, result: 'MISS' });
  assert.equal(shootout.shootout.round, 2);
  const shootoutBefore = JSON.stringify(shootout);
  assert.throws(() => Rules.resolveCupFlip(shootout, shootoutOld), /stale|foreign/i);
  assert.equal(JSON.stringify(shootout), shootoutBefore);

  let team = Rules.createTeamClashState({ matchId: 'dedup-team', players: players(4) });
  team = JSON.parse(JSON.stringify(team));
  const teamOld = withResolution(team, 'team-a', {
    playerId: team.turn.current, result: 'MAKE' });
  team = stepTeam(team, teamOld);
  team = stepTeam(team, { playerId: team.turn.current, result: 'MISS' });
  const teamBefore = JSON.stringify(team);
  assert.throws(() => Rules.resolveTeamFlip(team, teamOld), /stale|foreign/i);
  assert.equal(JSON.stringify(team), teamBefore);

  const delimitersA = Rules.createClassicState({ matchId: 'match|encoded', players: players(2) });
  const delimitersB = Rules.createClassicState({ matchId: 'match%7Cencoded', players: players(2) });
  const identityA = Rules.nextResolutionIdentity(delimitersA, 'caller|encoded');
  const identityB = Rules.nextResolutionIdentity(delimitersB, 'caller%7Cencoded');
  assert.notEqual(identityA.namespace, identityB.namespace);
  assert.notEqual(identityA.id, identityB.id);
}

function testTenThousandResolutionHighWaterIsCompact() {
  let state = Rules.createClassicState({ matchId: 'ten-thousand-resolutions',
    players: players(2), startingLives: 3, suddenDeathEnabled: false });
  const initialBytes = JSON.stringify(state).length;
  let firstIdentity = null;
  for (let index = 0; index < 10000; index += 1) {
    const input = withResolution(state, `bench-${index}`, { result: 'MISS' });
    if (index === 0) firstIdentity = input;
    state = Rules.resolveClassicFlip(state, input).state;
  }
  assert.equal(state.sequence, 10000);
  assert.equal(state.resolutionIdentity.resolvedThrough, 10000);
  assert.equal(state.resolutionIdentity.nextOrdinal, 10001);
  assert.equal('resolvedFlipIds' in state, false);
  assert.ok(JSON.stringify(state).length < initialBytes + 256,
    '10,000 resolutions retain constant-size integrity state');
  const before = JSON.stringify(state);
  assert.throws(() => Rules.resolveClassicFlip(state, firstIdentity), /stale|foreign/i);
  assert.equal(JSON.stringify(state), before);
  const outcome = Rules.toMatchOutcomeV2(state, { status: 'abandoned' });
  assert.equal(JSON.stringify(outcome).includes('resolvedFlipIds'), false);
  assert.deepEqual(outcome.resolutionIdentity, state.resolutionIdentity);
}

function testOutcomeStatusCannotSpoofAWin() {
  const active = Rules.createClassicState({ matchId: 'active-outcome', players: players(2) });
  assert.throws(() => Rules.toMatchOutcomeV2(active, { status: 'completed' }),
    /contradicts the rules phase/);
  const abandoned = Rules.toMatchOutcomeV2(active, {
    status: 'abandoned', completionReason: 'last-player-standing',
  });
  assert.equal(abandoned.completed, false);
  assert.deepEqual(abandoned.winnerIds, []);
  assert.equal(abandoned.completionReason, 'abandoned');
  assert.deepEqual(abandoned.rulesState.winnerIds, []);
  assert.equal(abandoned.rulesState.completionReason, null);
  assert.doesNotThrow(() => Rules.toMatchOutcomeV2(abandoned.rulesState,
    { status: 'cancelled' }), 'embedded active state remains self-validating');

  const complete = Rules.resolveClassicFlip(active, { result: 'MAKE',
    effects: { forceEliminateIds: ['p2'] } }).state;
  const accepted = Rules.toMatchOutcomeV2(complete);
  assert.equal(accepted.status, 'completed');
  assert.deepEqual(accepted.winnerIds, ['p1']);
  assert.throws(() => Rules.toMatchOutcomeV2(complete, { status: 'cancelled' }),
    /contradicts the rules phase/);
  assert.throws(() => Rules.toMatchOutcomeV2(complete, { status: 'abandoned' }),
    /contradicts the rules phase/);

  const activeCup = Rules.createCupState({ matchId: 'active-cup-outcome', cupLength: 'short',
    players: players(2) });
  assert.throws(() => Rules.toMatchOutcomeV2(activeCup, { status: 'completed' }),
    /contradicts/);
  assert.equal(Rules.toMatchOutcomeV2(activeCup, { status: 'cancelled' }).status, 'cancelled');
  let completeCup = closeCupHeatFor(activeCup, 'p1');
  completeCup = Rules.beginNextCupHeat(completeCup);
  completeCup = closeCupHeatFor(completeCup, 'p1');
  assert.equal(Rules.toMatchOutcomeV2(completeCup, { status: 'completed' }).completed, true);
  assert.throws(() => Rules.toMatchOutcomeV2(completeCup, { status: 'cancelled' }), /contradicts/);

  const activeTeam = Rules.createTeamClashState({ matchId: 'active-team-outcome',
    players: players(4) });
  assert.throws(() => Rules.toMatchOutcomeV2(activeTeam, { status: 'completed' }), /contradicts/);
  assert.equal(Rules.toMatchOutcomeV2(activeTeam, { status: 'abandoned' }).status, 'abandoned');
  const completeTeam = Rules.resolveTeamFlip(activeTeam, { playerId: activeTeam.turn.current,
    result: 'MAKE', effects: { automaticWinner: 'current' } }).state;
  assert.equal(Rules.toMatchOutcomeV2(completeTeam).completed, true);
  assert.throws(() => Rules.toMatchOutcomeV2(completeTeam, { status: 'abandoned' }), /contradicts/);
}

function storyRulesRequest(matchId, startIndex = 0) {
  return Activity.MatchRequestV2({
    matchId, activityId: 'story', formatId: 'classic', physicsModeId: 'normal',
    roster: [
      { id: 'human-1', kind: 'human', human: true, displayName: 'Ada', flipperId: 'bottle' },
      { id: 'human-2', kind: 'human', human: true, displayName: 'Bo', flipperId: 'bottle' },
      { id: 'cpu-1', kind: 'cpu', human: false, displayName: 'Mara Venn', cpuTier: 3,
        flipperId: 'coffee-mug' },
      { id: 'cpu-2', type: 'cpu', displayName: 'WFC Entry', cpuTier: 2,
        flipperId: 'gumball-machine' },
    ],
    rulesOptions: {
      startingLives: 10, startIndex,
      clearCondition: { anyWinnerId: ['human-1', 'human-2'] },
      opponentTargeting: { excludeAlliedHumans: true,
        alliedHumanIds: ['human-1', 'human-2'] },
    },
    activityContext: { nativeAlien: false }, seed: 71,
  });
}

function testStoryCpuShapeAndAutomaticAllyProtection() {
  let state = Rules.createClassicState(storyRulesRequest('story-shape'));
  assert.equal(state.players[0].displayName, 'Ada');
  assert.equal(state.players[0].human, true);
  assert.equal(state.players[0].kind, 'human');
  assert.equal(state.players[2].name, 'Mara Venn');
  assert.equal(state.players[2].displayName, 'Mara Venn');
  assert.equal(state.players[2].kind, 'cpu');
  assert.equal(state.players[2].human, false);
  assert.equal(state.players[2].isAI, true);
  assert.equal(state.players[2].cpuTier, 3);
  assert.equal(state.players[3].isAI, true, 'legacy type=cpu remains supported');
  assert.deepEqual(state.config.opponentTargeting, {
    excludeAlliedHumans: true, alliedHumanIds: ['human-1', 'human-2'],
  });
  assert.deepEqual(state.config.alliedHumanIds, ['human-1', 'human-2']);
  assert.deepEqual(state.config.clearCondition,
    { anyWinnerId: ['human-1', 'human-2'] });

  let transition = Rules.resolveClassicFlip(state, { playerId: 'human-1', result: 'MAKE',
    effects: { halveOpponents: true, excludedTargetIds: ['cpu-1'] } });
  assert.deepEqual(transition.state.players.map(player => player.lives), [10, 10, 5, 5]);
  assert.deepEqual(transition.outcome.effects.protectedTargetIds,
    ['human-2']);

  state = Rules.createClassicState(storyRulesRequest('story-set'));
  transition = Rules.resolveClassicFlip(state, { playerId: 'human-1', result: 'MAKE',
    effects: { setOpponentsTo: 1 } });
  assert.deepEqual(transition.state.players.map(player => player.lives), [10, 10, 1, 1]);

  state = Rules.createClassicState(storyRulesRequest('story-force'));
  transition = Rules.resolveClassicFlip(state, { playerId: 'human-1', result: 'MAKE',
    effects: { forceEliminateIds: ['human-2', 'cpu-1'] } });
  assert.equal(transition.state.players[1].eliminated, false,
    'co-op ally cannot be selected by an opponent effect');
  assert.equal(transition.state.players[1].lives, 10);
  assert.equal(transition.state.players[2].eliminated, true);
  assert.equal(transition.state.players[2].lives, 0);

  state = Rules.createClassicState(storyRulesRequest('story-cpu-targets-humans', 2));
  transition = Rules.resolveClassicFlip(state, { playerId: 'cpu-1', result: 'MAKE',
    effects: { halveOpponents: true, excludedTargetIds: ['human-1', 'human-2'] } });
  assert.deepEqual(transition.outcome.effects.protectedTargetIds, [],
    'CPU actor shares no human alliance and protects no human target');
  assert.deepEqual(transition.state.players.map(player => player.lives), [5, 5, 10, 5],
    'CPU actor can target both allied humans normally');

  state = Rules.createClassicState(storyRulesRequest('story-cpu-force-humans', 2));
  transition = Rules.resolveClassicFlip(state, { playerId: 'cpu-1', result: 'MAKE',
    effects: { forceEliminateIds: ['human-1', 'human-2'] } });
  assert.equal(transition.state.players[0].eliminated, true);
  assert.equal(transition.state.players[1].eliminated, true);
  assert.equal(transition.state.phase, 'active', 'two CPU survivors keep the match active');

  state = Rules.createClassicState(storyRulesRequest('story-two-allies-clear'));
  transition = Rules.resolveClassicFlip(state, { playerId: 'human-1', result: 'MAKE',
    effects: { forceEliminateIds: ['cpu-1', 'cpu-2'] } });
  assert.equal(transition.state.phase, 'complete');
  assert.deepEqual(transition.state.winnerIds, ['human-1', 'human-2']);
  assert.equal(transition.state.completionReason, 'allied-survivors');
  assert.deepEqual(transition.outcome.winnerIds, ['human-1', 'human-2']);
  assert.deepEqual(Rules.toMatchOutcomeV2(transition.state).winnerIds,
    ['human-1', 'human-2']);
}

function testCupPresentationAndZeroSurvivorResolver() {
  let cup = Rules.createCupState({ matchId: 'cup-cue', cupLength: 'short', players: players(2) });
  let transition = Rules.resolveCupFlip(cup, withResolution(cup, 'heat-one-win', {
    result: 'MAKE', effects: { forceEliminateIds: ['p2'] } }));
  cup = transition.state;
  assert.equal(cup.phase, 'between-heats');
  assert.ok(transition.outcome.presentation.cues.includes('heat-win'));
  assert.ok(!transition.outcome.presentation.cues.includes('match-win'));
  assert.ok(!transition.outcome.innerOutcome.presentation.cues.includes('match-win'),
    'inner Classic heat result cannot masquerade as a Cup win');

  cup = Rules.createCupState({ matchId: 'cup-no-survivors', cupLength: 'short',
    players: players(2), startIndex: 0 });
  transition = Rules.resolveCupFlip(cup, withResolution(cup, 'zero-heat-1', { playerId: 'p1',
    result: 'MAKE', effects: { forceEliminateActor: true, forceEliminateIds: ['p2'] } }));
  cup = transition.state;
  assert.equal(cup.phase, 'shootout');
  assert.equal(cup.shootout.purpose, 'heat');
  assert.equal(cup.shootout.eventsDisabled, true);
  assert.deepEqual(cup.shootout.participantIds, ['p1', 'p2']);
  assert.equal(cup.turn.current, 'p2', 'heat tiebreak opener rotates fairly from heat starter');
  assert.equal(transition.outcome.zeroSurvivorTie, true);
  assert.equal(transition.outcome.heatResolved, false);

  cup = stepCup(cup, withResolution(cup, 'heat-tie-p2', { playerId: 'p2', result: 'MAKE' }));
  transition = Rules.resolveCupFlip(cup,
    withResolution(cup, 'heat-tie-p1', { playerId: 'p1', result: 'MISS' }));
  cup = transition.state;
  assert.equal(cup.phase, 'between-heats');
  assert.equal(cup.heatWins.p2, 1);
  assert.equal(transition.outcome.heatResolved, true);
  assert.equal(transition.outcome.heatWinnerId, 'p2');
  assert.ok(transition.outcome.presentation.cues.includes('heat-win'));
  assert.ok(!transition.outcome.presentation.cues.includes('match-win'));

  cup = Rules.beginNextCupHeat(cup);
  transition = Rules.resolveCupFlip(cup, withResolution(cup, 'zero-heat-2', { playerId: 'p2',
    result: 'MAKE', effects: { forceEliminateActor: true, forceEliminateIds: ['p1'] } }));
  cup = transition.state;
  assert.equal(cup.phase, 'shootout');
  assert.equal(cup.turn.current, 'p1');
  cup = stepCup(cup,
    withResolution(cup, 'second-tie-p1', { playerId: 'p1', result: 'MISS' }));
  transition = Rules.resolveCupFlip(cup,
    withResolution(cup, 'second-tie-p2', { playerId: 'p2', result: 'MAKE' }));
  cup = transition.state;
  assert.equal(cup.phase, 'complete');
  assert.deepEqual(cup.winnerIds, ['p2']);
  assert.equal(transition.outcome.matchResolved, true);
  assert.ok(transition.outcome.presentation.cues.includes('match-win'));
}

function testForceEliminateSuddenDeathReconciliation() {
  let complete = Rules.createClassicState({ matchId: 'force-band-complete',
    players: players(4), startingLives: 100, suddenDeathAfterTurns: 0 });
  complete = resolveClassicTurns(complete, 19);
  assert.equal(complete.turn.current, 'p4');
  assert.deepEqual(complete.suddenDeath.band.turnsByPlayer,
    { p1: 5, p2: 5, p3: 5, p4: 4 });
  complete = Rules.forceEliminate(complete, 'p4').state;
  assert.equal(complete.suddenDeath.level, 2,
    'eliminating the only unfinished seat advances the completed band');
  assert.equal(complete.turn.current, 'p1');

  let owed = Rules.createClassicState({ matchId: 'force-band-owed',
    players: players(4), startingLives: 100, suddenDeathAfterTurns: 0 });
  owed = resolveClassicTurns(owed, 18);
  assert.deepEqual(owed.suddenDeath.band.turnsByPlayer,
    { p1: 5, p2: 5, p3: 4, p4: 4 });
  owed = Rules.forceEliminate(owed, 'p4').state;
  assert.equal(owed.suddenDeath.level, 1,
    'another survivor still owes a turn, so elimination cannot skip the band');
  assert.equal(owed.turn.current, 'p3');
  owed = stepClassic(owed, { playerId: 'p3', result: 'MISS' });
  assert.equal(owed.suddenDeath.level, 2);
}

function testForgedSchemaTagsAreNeverTrusted() {
  assert.throws(() => Rules.createClassicState({ schema: 'ClassicRulesConfigV1',
    matchId: 'forged-classic-config', players: [], startingLives: 10 }), /between 2 and 16/);
  assert.throws(() => Rules.createClassicState({ matchId: 'unsafe-starting-lives',
    players: players(2), startingLives: Number.MAX_SAFE_INTEGER }), /safe integer range/);
  assert.throws(() => Rules.createCupState({ schema: 'CupRulesConfigV1',
    matchId: 'forged-cup-config', cupLength: 'short', players: [] }), /between 2 and 12/);
  assert.throws(() => Rules.createTeamClashState({ schema: 'TeamClashRulesConfigV1',
    matchId: 'forged-team-config', players: [], teams: [[], []] }), /between 2 and 16/);

  const valid = Rules.createClassicState({ matchId: 'forged-state', players: players(2) });
  const noRoster = structuredClone(valid);
  noRoster.config.players = [];
  assert.throws(() => Rules.resolveClassicFlip(noRoster, { result: 'MISS' }), /between 2 and 16/);
  const forgedHighWater = structuredClone(valid);
  forgedHighWater.resolutionIdentity.nextOrdinal = 7;
  assert.throws(() => Rules.resolveClassicFlip(forgedHighWater, { result: 'MISS' }),
    /high-water/);
  const legacyUnboundedLedger = structuredClone(valid);
  legacyUnboundedLedger.resolvedFlipIds = [];
  assert.throws(() => Rules.toMatchOutcomeV2(legacyUnboundedLedger,
    { status: 'abandoned' }), /Unbounded resolved flip histories/);
  const forgedLifeCap = structuredClone(valid);
  forgedLifeCap.config.additiveLifeCap = 999999;
  assert.throws(() => Rules.resolveClassicFlip(forgedLifeCap, { result: 'MAKE' }),
    /config is not canonical/);
  const forgedTurn = structuredClone(valid);
  forgedTurn.turn.current = 'p2';
  assert.throws(() => Rules.resolveClassicFlip(forgedTurn, { result: 'MISS' }),
    /turn metadata/);
  const unsafeLives = structuredClone(valid);
  unsafeLives.players[0].lives = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(() => Rules.resolveClassicFlip(unsafeLives, { result: 'MISS' }),
    /safe whole number/);
  const forgedFire = structuredClone(valid);
  forgedFire.players[0].onFire = true;
  forgedFire.players[0].streak = 3;
  forgedFire.players[0].bestStreak = 3;
  forgedFire.onFirePlayerId = null;
  assert.throws(() => Rules.resolveClassicFlip(forgedFire, { result: 'MAKE' }),
    /owner/);
  const disabledSudden = Rules.createClassicState({ matchId: 'forged-disabled-sudden',
    players: players(2), suddenDeathEnabled: false });
  const impossibleSudden = structuredClone(disabledSudden);
  impossibleSudden.suddenDeath.phase = 'sudden-death';
  impossibleSudden.suddenDeath.level = 1;
  impossibleSudden.suddenDeath.band = {
    id: 'sd-1-0', level: 1, rosterIds: ['p1', 'p2'],
    targetTurnsPerPlayer: 10, targetTurns: 20, countedTurns: 0,
    turnsByPlayer: { p1: 0, p2: 0 },
  };
  assert.throws(() => Rules.toMatchOutcomeV2(impossibleSudden, { status: 'abandoned' }),
    /Disabled sudden death/);
  const immediateSudden = Rules.createClassicState({ matchId: 'forged-sudden-band',
    players: players(4), suddenDeathAfterTurns: 0 });
  const forgedBandId = structuredClone(immediateSudden);
  forgedBandId.suddenDeath.band.id = 'sd-1-9';
  assert.throws(() => Rules.resolveClassicFlip(forgedBandId, { result: 'MISS' }),
    /identity or age/);
  const forgedBandOrder = structuredClone(immediateSudden);
  forgedBandOrder.suddenDeath.band.rosterIds = ['p1', 'p3', 'p2', 'p4'];
  assert.throws(() => Rules.resolveClassicFlip(forgedBandOrder, { result: 'MISS' }),
    /band order/);
  const forgedBandMap = structuredClone(immediateSudden);
  forgedBandMap.suddenDeath.band.turnsByPlayer.intruder = 0;
  assert.throws(() => Rules.resolveClassicFlip(forgedBandMap, { result: 'MISS' }),
    /turn map/);

  const cup = Rules.createCupState({ matchId: 'forged-cup-state', cupLength: 'short',
    players: players(2) });
  const cupNoRoster = structuredClone(cup);
  cupNoRoster.config.players = [];
  assert.throws(() => Rules.resolveCupFlip(cupNoRoster, { result: 'MISS' }), /between 2 and 12/);
  const forgedCupWinTarget = structuredClone(cup);
  forgedCupWinTarget.config.winsNeeded = 99;
  assert.throws(() => Rules.resolveCupFlip(forgedCupWinTarget, { result: 'MISS' }),
    /config is not canonical/);
  const forgedInnerSeed = structuredClone(cup);
  forgedInnerSeed.currentHeat.config.seed ^= 1;
  assert.throws(() => Rules.resolveCupFlip(forgedInnerSeed, { result: 'MISS' }),
    /parent-derived/);
  const baseInner = {
    matchId: `${cup.matchId}:heat:1`, players: cup.config.players,
    startingLives: 3, direction: 1, startIndex: 0,
    suddenDeathAfterRotations: 3, seed: cup.config.seed ^ 1,
  };
  for (const override of [
    { matchId: 'foreign-inner-match' },
    { players: cup.config.players.slice().reverse() },
    { startingLives: 10 },
    { direction: -1 },
    { startIndex: 1 },
    { suddenDeathAfterRotations: 4 },
    { seed: 982451653 },
  ]) {
    const forgedParentContract = structuredClone(cup);
    forgedParentContract.currentHeat = Rules.createClassicState({ ...baseInner, ...override });
    assert.throws(() => Rules.resolveCupFlip(forgedParentContract, { result: 'MISS' }),
      /parent-derived/, `inner override must reject: ${JSON.stringify(override)}`);
  }
  let between = closeCupHeatFor(cup, 'p1');
  const forgedHeatWins = structuredClone(between);
  forgedHeatWins.heatWins.p2 = 1;
  assert.throws(() => Rules.beginNextCupHeat(forgedHeatWins), /do not match heat history/);
  const forgedHistoryStarter = structuredClone(between);
  forgedHistoryStarter.heatResults[0].starterId = 'p2';
  assert.throws(() => Rules.beginNextCupHeat(forgedHistoryStarter), /history is not reachable/);
  const forgedHeatNumber = structuredClone(between);
  forgedHeatNumber.heatNumber = 3;
  assert.throws(() => Rules.beginNextCupHeat(forgedHeatNumber), /history, and phase/);
  const zeroAttemptHistory = structuredClone(between);
  zeroAttemptHistory.heatResults[0].attempts = 0;
  zeroAttemptHistory.heatResults[0].rulesTurns = 0;
  assert.throws(() => Rules.beginNextCupHeat(zeroAttemptHistory),
    /foreign namespace|at least 1/);
  let clinched = Rules.beginNextCupHeat(between);
  clinched = closeCupHeatFor(clinched, 'p1');
  const postClinch = structuredClone(clinched);
  postClinch.heatNumber = 3;
  const forgedThirdHeat = Rules.createClassicState({
    matchId: `${postClinch.matchId}:heat:3`, players: players(2), startingLives: 3,
  });
  postClinch.heatResults.push({
    heatNumber: 3, winnerId: 'p2', starterId: 'p1', rulesTurns: 1, attempts: 1,
    completionReason: 'last-player-standing',
    outcomeId: Rules.nextResolutionIdentity(forgedThirdHeat, 'forged-third').id,
  });
  postClinch.heatWins.p2 = 1;
  assert.throws(() => Rules.toMatchOutcomeV2(postClinch, { status: 'completed' }),
    /continues after a clinching win/);
  const magnetCup = Rules.createCupState({ matchId: 'forged-cup-magnet', cupLength: 'short',
    players: [{ id: 'p1', alwaysMagnet: true }, { id: 'p2' }] });
  const lostMagnet = structuredClone(magnetCup);
  lostMagnet.persistentMagnetIds = [];
  assert.throws(() => Rules.resolveCupFlip(lostMagnet, { result: 'MISS' }),
    /lost an initial permanent magnet/);
  const team = Rules.createTeamClashState({ matchId: 'forged-team-state', players: players(4) });
  const teamNoRoster = structuredClone(team);
  teamNoRoster.config.players = [];
  assert.throws(() => Rules.resolveTeamFlip(teamNoRoster, { result: 'MISS' }), /between 2 and 16/);
  const forgedTeamTarget = structuredClone(team);
  forgedTeamTarget.config.targetScore = 1;
  assert.throws(() => Rules.resolveTeamFlip(forgedTeamTarget, { result: 'MAKE' }),
    /config is not canonical/);
  const reassignedTeamActor = structuredClone(team);
  reassignedTeamActor.queue[0].playerId = reassignedTeamActor.queue[1].playerId;
  assert.throws(() => Rules.resolveTeamFlip(reassignedTeamActor, { result: 'MAKE' }),
    /canonically derived/);
  const duplicateTeamActor = structuredClone(team);
  duplicateTeamActor.queue[2] = structuredClone(duplicateTeamActor.queue[0]);
  duplicateTeamActor.queue[2].position = 2;
  assert.throws(() => Rules.resolveTeamFlip(duplicateTeamActor, { result: 'MAKE' }),
    /canonically derived/);
  let oneTeamFlip = Rules.resolveTeamFlip(team, {
    playerId: team.turn.current, result: 'MISS',
  }).state;
  const reassignedStats = structuredClone(oneTeamFlip);
  const actualActor = team.turn.current;
  const otherActor = reassignedStats.config.players.find(player => player.id !== actualActor).id;
  reassignedStats.playerStats[actualActor].flips = 0;
  reassignedStats.playerStats[otherActor].flips = 1;
  assert.throws(() => Rules.toMatchOutcomeV2(reassignedStats, { status: 'abandoned' }),
    /canonical actors/);
  const zeroFlipAutomatic = structuredClone(team);
  zeroFlipAutomatic.phase = 'complete';
  zeroFlipAutomatic.winnerTeamIndex = 0;
  zeroFlipAutomatic.winnerIds = zeroFlipAutomatic.config.teams[0].slice();
  zeroFlipAutomatic.completionReason = 'automatic-team-result';
  zeroFlipAutomatic.turn = { current: null, onDeck: null, afterThat: null, signals: [] };
  assert.throws(() => Rules.toMatchOutcomeV2(zeroFlipAutomatic, { status: 'completed' }),
    /requires a resolved flip/);
}

function testRulesOwnedEventTerminalAndRetryPath() {
  assert.throws(() => Rules.inspectEventMatchCapability({
    schema: 'RulesEventMatchCapabilityV1',
  }), /Rules-issued event match capability/);

  const classic = Rules.createRulesAdapter({ formatId: 'classic',
    matchId: 'rules-event-classic', players: players(3), startingLives: 3,
    suddenDeathAfterTurns: 0, suddenDeathStepTurns: 6 });
  assert.equal(Object.prototype.hasOwnProperty.call(classic, 'eventCapability'), false,
    'the Rules-owned match capability must never escape through the public adapter');
  assert.throws(() => Rules.consumeEventMatchCapability(undefined, {
    eventId: 'plinko', noContest: true,
  }), /Rules-issued event match capability/);

  const authority = classic.claimEventAuthority();
  assert.equal(authority.schema, 'EventAuthorityV2');
  assert.ok(Object.isFrozen(authority));
  assert.throws(() => classic.claimEventAuthority(), /already issued/,
    'a second caller must not obtain the hidden Rules match capability');

  // Claiming event authority does not disturb the ordinary rules path. Full
  // Plinko retry/terminal semantics are exercised through the real kernel and
  // rules adapter in v112-event-kernel-tests.js.
  const ordinary = classic.resolveFlip({ result: 'MAKE', pose: 'upright' });
  assert.equal(ordinary.state.sequence, 1);
  assert.equal(ordinary.state.players[0].lives, 3);
}

function testBrowserRulesAuthoritySurface() {
  assert.equal(Object.prototype.hasOwnProperty.call(globalThis,
    'FlipgameV112Rules'), false,
  'CommonJS loading must not publish the trusted Rules API on globalThis');

  const rulesFilename = path.resolve(__dirname, '../js/v112-rules.js');
  const rulesSource = fs.readFileSync(rulesFilename, 'utf8');
  const context = vm.createContext({ console });
  vm.runInContext(rulesSource, context, { filename: rulesFilename });

  const installedRules = context.FlipgameV112Rules;
  const descriptor = Object.getOwnPropertyDescriptor(context, 'FlipgameV112Rules');
  assert.equal(installedRules.schema, 'FlipgameV112RulesV1');
  assert.equal(Object.isFrozen(installedRules), true);
  assert.equal(descriptor.writable, false,
    'browser Rules authority must not be replaceable');
  assert.equal(descriptor.configurable, false,
    'browser Rules authority must not be deletable or redefined');
  assert.equal(vm.runInContext(`(function () {
    var forged = Object.freeze({ schema: 'FlipgameV112RulesV1',
      toMatchOutcomeV2: function () { return { winnerIds: ['attacker'] }; } });
    try { FlipgameV112Rules = forged; } catch (_) {}
    return FlipgameV112Rules === forged;
  })()`, context), false,
  'a forged winner authority cannot replace the installed browser Rules module');

  assert.throws(() => vm.runInContext(rulesSource, context,
    { filename: rulesFilename }), /duplicate or preseeded/,
  'a duplicate browser Rules load must fail closed');
  assert.equal(context.FlipgameV112Rules, installedRules);

  const preseed = vm.createContext({ console,
    FlipgameV112Rules: Object.freeze({ schema: 'FlipgameV112RulesV1' }) });
  assert.throws(() => vm.runInContext(rulesSource, preseed,
    { filename: rulesFilename }), /duplicate or preseeded/,
  'a schema-shaped Rules preseed must be rejected rather than trusted');

  let shimRequireCalls = 0;
  const shimExports = { sentinel: 'browser-module-shim' };
  const shimmed = vm.createContext({ console,
    module: {
      exports: shimExports,
      filename: 'browser-module-shim.js',
      require: function () { shimRequireCalls += 1; throw new Error('unsafe require'); },
    },
    require: function () { shimRequireCalls += 1; throw new Error('unsafe require'); },
  });
  vm.runInContext(rulesSource, shimmed, { filename: rulesFilename });
  assert.equal(shimRequireCalls, 0,
    'a browser module shim must not select the trusted CommonJS path');
  assert.equal(shimmed.module.exports, shimExports);
  assert.equal(shimmed.FlipgameV112Rules.schema, 'FlipgameV112RulesV1');
  const shimDescriptor = Object.getOwnPropertyDescriptor(shimmed,
    'FlipgameV112Rules');
  assert.equal(shimDescriptor.writable, false);
  assert.equal(shimDescriptor.configurable, false);

  const mutableKernelContext = vm.createContext({ console });
  vm.runInContext(rulesSource, mutableKernelContext, { filename: rulesFilename });
  mutableKernelContext.FlipgameV112EventKernel = Object.freeze({
    schema: 'FlipgameEventKernelV2', createAuthority: function () { return {}; },
  });
  const mutableAdapter = mutableKernelContext.FlipgameV112Rules.createRulesAdapter({
    formatId: 'classic', matchId: 'mutable-kernel', players: players(2),
  });
  assert.throws(() => mutableAdapter.claimEventAuthority(), /immutable owned authority/,
  'Rules must reject a replaceable browser EventKernel even when its schema looks valid');
}

function run() {
  testPublicContract();
  testClassicAllCountsAndPresets();
  testLegacyStakeAndTurnSemantics();
  testOnFireEightPlayerThreeLifeRegression();
  testOnFireRewardsCapAndMultiplierExceptions();
  testOpponentHalvingAndForcedZero();
  testSuddenDeathUsesWholeSeatRotations();
  testOnFireCannotAdvanceSuddenDeathBand();
  testCupLimitsResetsRotationAndBestOfThree();
  testCupMultiWinnerShootoutAndRematches();
  testTeamCountsQueueAndFairRotation();
  testTeamScoringCancellationAndNoWinByTwo();
  testTeamRuleEffectsAndPersistentMagnet();
  testTeamPositivePresentationSignals();
  testTeamRematchesAllSizes();
  testAdapterMatchRequestAndOutcomeCompatibility();
  testDeterminismAndInputImmutability();
  testV111CompatibilitySurface();
  testCompactMonotonicResolutionIdentity();
  testTenThousandResolutionHighWaterIsCompact();
  testOutcomeStatusCannotSpoofAWin();
  testStoryCpuShapeAndAutomaticAllyProtection();
  testCupPresentationAndZeroSurvivorResolver();
  testForceEliminateSuddenDeathReconciliation();
  testForgedSchemaTagsAreNeverTrusted();
  testRulesOwnedEventTerminalAndRetryPath();
  testBrowserRulesAuthoritySurface();
  console.log('v1.12 Classic/Cup/Team/ON FIRE rules tests passed.');
}

run();
