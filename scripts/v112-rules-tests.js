'use strict';

const assert = require('node:assert/strict');
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
  const transition = adapter.resolveFlip({ playerId: 'p1', result: 'MAKE',
    effects: { forceEliminateIds: ['p2', 'p3', 'p4'] } });
  assert.equal(transition.state.phase, 'complete');
  const raw = adapter.toMatchOutcome({ endedAt: '2026-09-07T12:00:00Z' });
  const accepted = Activity.MatchOutcomeV2(raw);
  assert.equal(accepted.schema, 'MatchOutcomeV2');
  assert.equal(accepted.status, 'completed');
  assert.deepEqual(accepted.winnerIds, ['p1']);
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
  console.log('v1.12 Classic/Cup/Team/ON FIRE rules tests passed.');
}

run();
