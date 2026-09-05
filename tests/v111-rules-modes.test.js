'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  game, GAME_STATES, SD_THRESHOLD, STARTING_LIFE_PRESETS,
} = require('../js/game.js');
const modes = require('../js/v111-modes.js');
const runtimeModule = require('../js/v111-runtime.js');

function defs(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `player-${index + 1}`,
    name: `P${index + 1}`,
    color: '#123456',
  }));
}

function init(count = 2, startingLives = 10, options = {}) {
  game.callbacks = {};
  game.init(defs(count), 1, Object.assign({ startingLives }, options));
  return game;
}

function recordTeamRound(match, actions) {
  for (let index = 0; index < 6; index++) {
    const next = match.nextFlip();
    const action = actions[index] || { result: 'MISS' };
    match.recordFlip(Object.assign({ playerIndex: next.playerIndex }, action));
  }
  return match.snapshot();
}

test('all 2–8 player Classic lobbies and life presets initialize without changing legacy defaults', () => {
  for (let count = 2; count <= 8; count++) {
    for (const lives of STARTING_LIFE_PRESETS) {
      const current = init(count, lives);
      assert.equal(current.players.length, count);
      assert.deepEqual(current.players.map(player => player.lives), Array(count).fill(lives));
      assert.equal(current.maxLives, Math.ceil(lives * 1.5));
      assert.equal(current.state, GAME_STATES.TURN_START);
      assert.equal(current.format, 'classic');
      assert.equal(current.currentPlayerIndex, 0);
      assert.equal(current.pointCount, 0);
    }
  }
});

test('additive rewards use ceil(1.5x), while multipliers bypass and do not raise the cap', () => {
  for (const startingLives of STARTING_LIFE_PRESETS) {
    const current = init(2, startingLives);
    const player = current.players[0];
    player.lives = current.maxLives - 1;
    assert.equal(current.addLivesCapped(player, 5), 1);
    assert.equal(player.lives, Math.ceil(startingLives * 1.5));
    current.multiplyLives(player, 2);
    const multiplied = player.lives;
    assert.ok(multiplied > current.maxLives);
    assert.equal(current.addLivesCapped(player, 5), 0);
    assert.equal(player.lives, multiplied);

    const pure = modes.addLivesCapped(current.maxLives - 1, 5, startingLives);
    assert.equal(pure.lives, current.maxLives);
    assert.equal(modes.multiplyLives(current.maxLives, 2), current.maxLives * 2);
  }
});

test('ON FIRE streak continues above three, awards upright/cap lives, and miss is isolated', () => {
  const current = init(2, 10);
  const player = current.players[0];
  current.resolveFlip('MAKE');
  current.resolveFlip('MAKE');
  current.resolveFlip('MAKE');
  assert.equal(player.streak, 3);
  assert.equal(player.isOnFire, true);
  assert.equal(current.pointCount, 3);

  current.resolveFlip('MAKE');
  assert.equal(player.streak, 4);
  assert.equal(player.lives, 11);
  assert.equal(current.onFireGain, 1);
  assert.equal(current.pointCount, 3);

  current.resolveFlip('MAKE', { onCap: true });
  assert.equal(player.streak, 5);
  assert.equal(player.lives, 13);
  assert.equal(current.onFireGain, 2);
  assert.equal(current.pointCount, 3);

  current.turnCounter = 500;
  current.resolveFlip('MISS');
  assert.equal(player.lives, 13, 'no stake or sudden-death loss');
  assert.equal(current.lastPenalty, 0);
  assert.equal(current.pointCount, 3, 'the communal stake is not spent twice');
  assert.equal(player.eliminated, false);
  assert.equal(player.streak, 0);
  assert.equal(player.isOnFire, false);
  assert.equal(current.fireEnded, true);
  current.advanceTurn();
  assert.equal(current.currentPlayerIndex, 1);
});

test('ON FIRE ends cleanly at the additive ceiling without applying a penalty', () => {
  const current = init(2, 3);
  const player = current.players[0];
  player.lives = current.maxLives;
  player.streak = 9;
  player.isOnFire = true;
  current.onFirePlayer = player;
  current.resolveFlip('MAKE');
  assert.equal(player.lives, 5);
  assert.equal(player.streak, 0);
  assert.equal(player.isOnFire, false);
  assert.equal(current.fireCapped, true);
  current.advanceTurn();
  assert.equal(current.state, GAME_STATES.TURN_START);
  assert.equal(current.currentPlayerIndex, 1);
});

test('ON FIRE rewards and protected misses hold for every starting-life preset', () => {
  for (const startingLives of STARTING_LIFE_PRESETS) {
    const current = init(2, startingLives);
    const player = current.players[0];
    player.isOnFire = true;
    player.streak = 3;
    current.onFirePlayer = player;
    current.pointCount = startingLives;
    current.resolveFlip('MAKE', { onCap: true });
    assert.equal(player.lives, Math.min(current.maxLives, startingLives + 2));
    if (player.isOnFire) {
      current.turnCounter = 500;
      const beforeMiss = player.lives;
      current.resolveFlip('MISS');
      assert.equal(player.lives, beforeMiss);
      assert.equal(current.lastPenalty, 0);
      assert.equal(player.eliminated, false);
    }
  }
});

test('explicit rematch start seats remain deterministic for 2–8 Classic players', () => {
  for (let count = 2; count <= 8; count++) {
    for (let startIndex = 0; startIndex < count; startIndex++) {
      const current = init(count, 10, { startIndex });
      assert.equal(current.currentPlayerIndex, startIndex);
    }
  }
});

test('sudden death has exact 20-flip escalation bands', () => {
  const current = init(2, 100);
  const cases = [
    [SD_THRESHOLD, 0], [SD_THRESHOLD + 1, 1], [SD_THRESHOLD + 20, 1],
    [SD_THRESHOLD + 21, 2], [SD_THRESHOLD + 40, 2], [SD_THRESHOLD + 41, 3],
  ];
  for (const [turn, level] of cases) {
    current.turnCounter = turn;
    assert.equal(current.sdLevel(), level, `turn ${turn}`);
  }
  current.turnCounter = SD_THRESHOLD - 1;
  assert.equal(current.sdLevelForNextFlip(), 0);
  current.turnCounter = SD_THRESHOLD;
  assert.equal(current.sdLevelForNextFlip(), 1);
  current.turnCounter = SD_THRESHOLD + 19;
  assert.equal(current.sdLevelForNextFlip(), 1);
  current.turnCounter = SD_THRESHOLD + 20;
  assert.equal(current.sdLevelForNextFlip(), 2);
});

test('Cup-specific sudden death begins after the exact configured rotations', () => {
  for (let count = 2; count <= 8; count++) {
    for (const cupLength of ['short', 'full']) {
      const definition = modes.CUP_FORMATS[cupLength];
      const threshold = definition.suddenDeathRotations * count;
      const current = init(count, definition.startingLives, { suddenDeathFlipThreshold: threshold });
      current.turnCounter = threshold;
      assert.equal(current.inSuddenDeath(), false);
      assert.equal(current.sdLevelForNextFlip(), 1);
      current.turnCounter = threshold + 20;
      assert.equal(current.sdLevel(), 1);
      current.turnCounter++;
      assert.equal(current.sdLevel(), 2);
    }
  }
});

test('opponent halving is max(1, ceil) and forced eliminations always show zero lives', () => {
  const current = init(4, 10);
  const player = current.players[0];
  current.players[1].lives = 1;
  current.players[2].lives = 5;
  current.players[3].lives = 6;
  current.applyDoubleFlipReward(player);
  assert.deepEqual(current.players.map(p => p.lives), [20, 1, 3, 3]);
  assert.equal(modes.halveLives(1), 1);
  assert.equal(modes.halveLives(5), 3);
  current.eliminatePlayer(current.players[2]);
  assert.equal(current.players[2].lives, 0);
  assert.equal(current.players[2].eliminated, true);
});

test('ordinary elimination is forced to zero for every player count and life preset', () => {
  for (let count = 2; count <= 8; count++) {
    for (const startingLives of STARTING_LIFE_PRESETS) {
      const current = init(count, startingLives);
      current.pointCount = startingLives;
      current.resolveFlip('MISS');
      assert.equal(current.players[0].lives, 0);
      assert.equal(current.players[0].eliminated, true);
      assert.equal(current.justEliminated, true);
    }
  }
});

test('Plinko publishes the exact nine slots and applies every prize', () => {
  assert.deepEqual(modes.PLINKO_SLOTS.map(slot => slot.label), [
    'Lives Doubled', 'Everyone Else Halved', 'Always Magnet', 'Automatic Loss',
    'Automatic Win', 'Automatic Loss', 'Always Magnet', 'Everyone Else Halved',
    'Lives Doubled',
  ]);

  let current = init(3, 10);
  current.resolvePlinko('double');
  assert.equal(current.players[0].lives, 20);

  current = init(3, 10);
  current.players[1].lives = 5;
  current.players[2].lives = 1;
  current.resolvePlinko('halve');
  assert.deepEqual(current.players.map(p => p.lives), [10, 3, 1]);

  current = init(2, 10);
  current.resolvePlinko('magnet');
  assert.equal(current.players[0].alwaysMagnet, true);

  current = init(2, 10);
  current.resolvePlinko('lose');
  assert.equal(current.players[0].lives, 0);
  assert.equal(current.players[0].eliminated, true);

  current = init(4, 10);
  current.resolvePlinko('win');
  assert.deepEqual(current.players.map(p => p.lives), [10, 0, 0, 0]);
  assert.deepEqual(current.players.map(p => p.eliminated), [false, true, true, true]);
  assert.throws(() => current.resolvePlinko('mystery'), /Unknown Plinko prize/);
});

test('Plinko forced outcomes and ceil-halving hold for every 2–8 player lobby', () => {
  for (let count = 2; count <= 8; count++) {
    let current = init(count, 10);
    current.players.slice(1).forEach(player => { player.lives = 5; });
    current.resolvePlinko('halve');
    assert.deepEqual(current.players.slice(1).map(player => player.lives), Array(count - 1).fill(3));

    current = init(count, 10);
    current.resolvePlinko('win');
    assert.deepEqual(current.players.slice(1).map(player => player.lives), Array(count - 1).fill(0));

    current = init(count, 10);
    current.resolvePlinko('lose');
    assert.equal(current.players[0].lives, 0);
    assert.equal(current.players[0].eliminated, true);
  }
});

test('Classic event rewards cover all additive, multiplier, and opponent effects', () => {
  const cases = [
    ['rainbow-corkscrew', {}, 1],
    ['heart-rush', {}, 3],
    ['shrink-ray', {}, 2],
    ['shrink-ray', { onCap: true }, 3],
    ['mitosis', { eventReward: { landedCount: 1 } }, 1],
    ['mitosis', { eventReward: { landedCount: 2 } }, 3],
    ['cap-toss', {}, 5],
  ];
  for (const [eventId, extra, expected] of cases) {
    const current = init(2, 100);
    current.resolveFlip('MAKE', Object.assign({ eventId }, extra));
    assert.equal(current.players[0].lives, 100 + expected, eventId);
  }

  let current = init(2, 10);
  current.resolveFlip('MAKE', { eventId: 'roulette-table', eventReward: { slotIndex: 3 } });
  assert.equal(current.players[0].lives, 40);

  current = init(3, 10);
  current.players[1].lives = 5;
  current.resolveFlip('MAKE', { eventId: 'double-flip' });
  assert.deepEqual(current.players.map(p => p.lives), [20, 3, 5]);

  current = init(3, 10);
  current.resolveFlip('MAKE', { eventId: 'life-drain' });
  assert.deepEqual(current.players.map(p => p.lives), [10, 1, 1]);
});

test('Arena Draft exposes only five reward-free symmetric all-player profiles', () => {
  assert.equal(modes.ARENA_DRAFT_PROFILES.length, 5);
  for (const profile of modes.ARENA_DRAFT_PROFILES) {
    assert.equal(profile.competitiveEligible, true);
    assert.equal(profile.symmetric, true);
    assert.equal(profile.affectsAllPlayers, true);
    assert.equal(profile.rewardFree, true);
    assert.equal(modes.arenaProfile(profile.id), profile);
  }
  assert.throws(() => modes.arenaProfile('heart-rush'), /not competitively eligible/);
});

test('Arena Draft offers exactly three deterministic distinct profiles for every Cup size and length', () => {
  const allowed = new Set(modes.ARENA_DRAFT_PROFILES.map(profile => profile.id));
  for (let count = 2; count <= 8; count++) {
    for (const cupLength of ['short', 'full']) {
      const playerIds = defs(count).map(player => player.id);
      const cup = new modes.CupSeries({
        playerCount: count,
        playerIds,
        cupLength,
        openingIndex: count - 1,
        arenaDraftSeed: `draft-${cupLength}-${count}`,
      });
      const state = cup.recordHeatWinner(0);
      const offer = state.arenaDraft;
      assert.equal(state.phase, 'between-heats');
      assert.equal(offer.schema, 'ArenaDraftOfferV1');
      assert.equal(offer.heatNumber, 2);
      assert.equal(offer.choices.length, 3);
      assert.equal(new Set(offer.choices.map(profile => profile.id)).size, 3);
      assert.ok(offer.choices.every(profile => allowed.has(profile.id)));
      assert.ok(offer.choices.every(profile => profile.rewardFree && profile.symmetric && profile.affectsAllPlayers));
      assert.equal(Object.isFrozen(offer), true);

      const replay = modes.createArenaDraftOffer({
        seed: state.arenaDraftSeed,
        cupLength: state.cupLength,
        playerCount: state.playerCount,
        playerIds: state.playerIds,
        heatNumber: state.heatNumber,
        heatWins: state.heatWins,
        heatResults: state.heatResults,
        openerIndex: state.openerIndex,
      });
      assert.deepEqual(replay, offer);
    }
  }
});

test('Arena Draft offer and selected profile survive snapshot, adapter prepare, and reconnect', () => {
  const playerIds = defs(8).map(player => player.id);
  let cup = new modes.CupSeries({ playerCount: 8, playerIds, cupLength: 'full', arenaDraftSeed: 'save-seed' });
  let state = cup.recordHeatWinner(0);
  const chosen = state.arenaDraft.choices[1].id;
  cup.selectArenaDraft(chosen);
  state = cup.beginNextHeat();
  assert.equal(state.arenaDraft.selectedProfileId, chosen);
  assert.equal(state.arenaProfileId, chosen);

  cup = new modes.CupSeries({ playerCount: 8, playerIds, cupLength: 'full', state: JSON.parse(JSON.stringify(state)) });
  assert.equal(cup.snapshot().arenaDraft.selectedProfileId, chosen);
  assert.equal(cup.snapshot().arenaProfileId, chosen);

  cup.recordHeatWinner(1);
  state = cup.snapshot();
  assert.equal(state.phase, 'between-heats');
  assert.equal(state.arenaDraft.heatNumber, 3);
  const thirdHeatChoice = state.arenaDraft.choices[2].id;
  const registry = new runtimeModule.constructors.ModeAdapterRegistry();
  registry.register(modes.createCupAdapter());
  const prepared = registry.prepareMatch({
    defs: defs(8),
    direction: 1,
    options: { format: 'cup', cupLength: 'full', cupState: state, arenaDraftSelectionId: thirdHeatChoice },
  });
  assert.equal(prepared.options.arenaProfileId, thirdHeatChoice);
  assert.equal(prepared.options.arenaDraft.selectedProfileId, thirdHeatChoice);
  assert.equal(prepared.options.arenaDraftSeed, 'save-seed');
});

test('Arena Draft rejects forged selections and forged or stale saved offers', () => {
  const cup = new modes.CupSeries({ playerCount: 4, cupLength: 'short', arenaDraftSeed: 'forgery-seed' });
  const state = cup.recordHeatWinner(0);
  const offered = new Set(state.arenaDraft.choices.map(profile => profile.id));
  const unoffered = modes.ARENA_DRAFT_PROFILES.find(profile => !offered.has(profile.id));
  assert.ok(unoffered);
  assert.throws(() => cup.selectArenaDraft(unoffered.id), /not in the current offer/);
  assert.throws(() => cup.beginNextHeat('heart-rush'), /not competitively eligible/);

  const forgedChoice = JSON.parse(JSON.stringify(state));
  forgedChoice.arenaDraft.choices[0] = modes.ARENA_DRAFT_PROFILES.find(profile => !offered.has(profile.id));
  assert.throws(() => new modes.CupSeries({ playerCount: 4, cupLength: 'short', state: forgedChoice }), /forged or stale offer/);

  const forgedSelection = JSON.parse(JSON.stringify(state));
  forgedSelection.arenaDraft.selectedProfileId = unoffered.id;
  assert.throws(() => new modes.CupSeries({ playerCount: 4, cupLength: 'short', state: forgedSelection }), /not in the current offer/);
});

test('Arena Draft never consumes Math.random or a gameplay RNG stream', () => {
  const originalRandom = Math.random;
  let gameplayRngCalls = 0;
  const gameplayRng = () => { gameplayRngCalls++; return 0.5; };
  Math.random = () => { throw new Error('Arena Draft touched Math.random'); };
  try {
    const cup = new modes.CupSeries({
      playerCount: 6,
      cupLength: 'full',
      arenaDraftSeed: 'isolated-seed',
      rng: gameplayRng,
    });
    const state = cup.recordHeatWinner(2);
    cup.selectArenaDraft(state.arenaDraft.choices[0].id);
    cup.beginNextHeat();
    assert.equal(gameplayRngCalls, 0);
  } finally {
    Math.random = originalRandom;
  }
});

test('Cup Short/Full are first-to-two, reset configuration, and rotate openers for 2–8 players', () => {
  for (let count = 2; count <= 8; count++) {
    for (const cupLength of ['short', 'full']) {
      const cup = new modes.CupSeries({ playerCount: count, cupLength, direction: -1, openingIndex: 0 });
      let state = cup.snapshot();
      const definition = modes.CUP_FORMATS[cupLength];
      assert.equal(state.startingLives, definition.startingLives);
      assert.equal(state.suddenDeathRotations, definition.suddenDeathRotations);
      state = cup.recordHeatWinner(0);
      assert.equal(state.phase, 'between-heats');
      assert.equal(state.openerIndex, count - 1);
      assert.equal(state.heatNumber, 2);
      cup.beginNextHeat();
      state = cup.recordHeatWinner(0);
      assert.equal(state.phase, 'complete');
      assert.equal(state.seriesWinnerIndex, 0);
      assert.equal(state.heatResults.length, 2);
      const newCup = cup.newCupOptions();
      assert.equal(newCup.openingIndex, count - 1, 'a new Cup rotates the prior opening seat');
    }
  }
});

test('Cup three-way tie enters events-disabled shootout and rotates opener on every repeated round', () => {
  const cup = new modes.CupSeries({
    playerCount: 5, playerIds: defs(5).map(player => player.id), cupLength: 'short', openingIndex: 0,
  });
  cup.recordHeatWinner(0);
  cup.beginNextHeat();
  cup.recordHeatWinner(1);
  cup.beginNextHeat();
  let state = cup.recordHeatWinner(2);
  assert.equal(state.phase, 'shootout');
  assert.equal(state.seriesTied, true);
  assert.equal(state.tiebreakRound, 1);
  assert.equal(state.arenaDraft, null);
  assert.equal(state.arenaProfileId, null);
  assert.deepEqual(state.tiebreakPlayers, [0, 1, 2]);

  const shootoutRegistry = new runtimeModule.constructors.ModeAdapterRegistry();
  shootoutRegistry.register(modes.createCupAdapter());
  const shootoutPrepared = shootoutRegistry.prepareMatch({
    defs: defs(5), direction: 1,
    options: { format: 'cup', cupLength: 'short', cupState: state },
  });
  assert.equal(shootoutPrepared.options.eventsDisabled, true);
  assert.equal(shootoutPrepared.options.arenaDraft, null);
  assert.equal(shootoutPrepared.options.arenaProfile, null);
  const firstOrder = state.queue.map(entry => entry.playerIndex);

  for (const entry of state.queue) cup.recordShootoutFlip(entry.playerIndex, 'MISS');
  state = cup.snapshot();
  assert.equal(state.tiebreakRound, 2);
  assert.notDeepEqual(state.queue.map(entry => entry.playerIndex), firstOrder);
  const secondOrder = state.queue.slice();
  cup.recordShootoutFlip(secondOrder[0].playerIndex, 'MAKE');
  cup.recordShootoutFlip(secondOrder[1].playerIndex, 'MAKE');
  cup.recordShootoutFlip(secondOrder[2].playerIndex, 'MISS');
  state = cup.snapshot();
  assert.equal(state.tiebreakRound, 3);
  const finalOrder = state.queue.slice();
  cup.recordShootoutFlip(finalOrder[0].playerIndex, 'MISS');
  cup.recordShootoutFlip(finalOrder[1].playerIndex, 'MAKE');
  state = cup.recordShootoutFlip(finalOrder[2].playerIndex, 'MISS');
  assert.equal(state.phase, 'complete');
  assert.equal(state.seriesTied, false);
  assert.equal(state.seriesWinnerIndex, finalOrder[1].playerIndex);
  assert.equal(state.highlight.kind, 'cup-shootout-win');
});

test('Team Clash validates only 2/4/6/8 and queues three alternating flips per team', () => {
  for (const count of [2, 4, 6, 8]) {
    const match = new modes.TeamClash({ playerCount: count });
    const state = match.snapshot();
    assert.equal(state.queue.length, 6);
    assert.deepEqual(state.queue.map(entry => entry.teamIndex), [0, 1, 0, 1, 0, 1]);
    assert.deepEqual(state.queue.reduce((totals, entry) => {
      totals[entry.teamIndex]++;
      return totals;
    }, [0, 0]), [3, 3]);
    assert.equal(Object.isFrozen(state), true);
    assert.equal(Object.isFrozen(state.queue), true);
  }
  for (const count of [3, 5, 7]) {
    assert.throws(() => new modes.TeamClash({ playerCount: count }), /needs 2, 4, 6, or 8/);
  }
});

test('Team event adapter follows every explicit scoring rule', () => {
  const eventCases = [
    [{ result: 'MAKE' }, 1],
    [{ result: 'MAKE', onCap: true }, 1],
    [{ result: 'MAKE', eventId: 'golden-flip', golden: true }, 2],
    [{ result: 'MAKE', eventId: 'rainbow-corkscrew' }, 2],
    [{ result: 'MAKE', eventId: 'shrink-ray' }, 2],
    [{ result: 'MAKE', eventId: 'shrink-ray', onCap: true }, 3],
    [{ result: 'MAKE', eventId: 'mitosis', eventReward: { landedCount: 1 } }, 1],
    [{ result: 'MAKE', eventId: 'mitosis', eventReward: { landedCount: 2 } }, 3],
    [{ result: 'MAKE', eventId: 'roulette-table', eventReward: { multiplier: 4 } }, 4],
    [{ result: 'MAKE', eventId: 'cap-toss' }, 5],
    [{ result: 'MAKE', eventId: 'heart-rush' }, 4],
    [{ result: 'MAKE', eventId: 'double-flip' }, 2],
    [{ result: 'MAKE', eventId: 'rewind' }, 1],
    [{ result: 'MISS', eventId: 'rewind' }, 0],
    [{ result: 'MAKE', eventId: 'plinko', plinko: 'double' }, 2],
  ];
  for (const [input, points] of eventCases) {
    assert.equal(modes.teamEventOutcome(input, 7).rawPoints, points, input.eventId || 'base');
  }
  assert.equal(modes.teamEventOutcome({ result: 'MAKE', eventId: 'mirror-match' }, 7).rawPoints, 1);
  assert.equal(modes.teamEventOutcome({ result: 'MAKE', eventId: 'life-drain' }, 0).excluded, true);
});

test('Team cancellation scores only the difference and no win-by-two is required', () => {
  let match = new modes.TeamClash({ playerCount: 4 });
  let state = recordTeamRound(match, [
    { result: 'MAKE', eventId: 'cap-toss' }, { result: 'MAKE', eventId: 'mitosis', eventReward: { landedCount: 2 } },
    { result: 'MAKE' }, { result: 'MAKE' },
    { result: 'MISS' }, { result: 'MISS' },
  ]);
  assert.deepEqual(state.highlight.raw, [6, 4]);
  assert.equal(state.highlight.cancelled, 4);
  assert.equal(state.highlight.awardedPoints, 2);
  assert.deepEqual(state.scores, [2, 0]);

  match = new modes.TeamClash({ playerCount: 2 });
  state = recordTeamRound(match, [
    { result: 'MAKE', eventId: 'heart-rush' }, { result: 'MISS' },
    { result: 'MAKE', eventId: 'cap-toss' }, { result: 'MISS' },
    { result: 'MAKE', eventId: 'double-flip' }, { result: 'MISS' },
  ]);
  assert.deepEqual(state.scores, [11, 0]);
  assert.equal(state.phase, 'complete');
  assert.equal(state.winnerTeamIndex, 0);
});

test('Team special effects halve with ceil, mirror action, persist magnet, and resolve Plinko', () => {
  let match = new modes.TeamClash({ playerCount: 2 });
  let next = match.nextFlip();
  match.recordFlip({ playerIndex: next.playerIndex, result: 'MISS' });
  next = match.nextFlip();
  match.recordFlip({ playerIndex: next.playerIndex, result: 'MAKE', eventId: 'mitosis', eventReward: { landedCount: 2 } });
  next = match.nextFlip();
  let state = match.recordFlip({ playerIndex: next.playerIndex, result: 'MAKE', eventId: 'double-flip' });
  assert.deepEqual(state.roundRaw, [2, 2], '3 opponent raw points halve upward to 2');

  match = new modes.TeamClash({ playerCount: 2 });
  next = match.nextFlip();
  match.recordFlip({ playerIndex: next.playerIndex, result: 'MAKE', eventId: 'cap-toss' });
  next = match.nextFlip();
  state = match.recordFlip({ playerIndex: next.playerIndex, result: 'MAKE', eventId: 'mirror-match' });
  assert.deepEqual(state.roundRaw, [5, 1], 'Mirror never nests the copied event reward');

  match = new modes.TeamClash({ playerCount: 2 });
  next = match.nextFlip();
  state = match.recordFlip({ playerIndex: next.playerIndex, result: 'MAKE', eventId: 'plinko', plinko: 'magnet' });
  assert.deepEqual(state.persistentMagnetPlayerIndexes, [next.playerIndex]);

  match = new modes.TeamClash({ playerCount: 2 });
  next = match.nextFlip();
  state = match.recordFlip({ playerIndex: next.playerIndex, result: 'MAKE', eventId: 'plinko', plinko: 'win' });
  assert.equal(state.phase, 'complete');
  assert.equal(state.winnerTeamIndex, next.teamIndex);

  match = new modes.TeamClash({ playerCount: 2 });
  next = match.nextFlip();
  state = match.recordFlip({ playerIndex: next.playerIndex, result: 'MISS', eventId: 'plinko', plinko: 'lose' });
  assert.equal(state.winnerTeamIndex, next.teamIndex === 0 ? 1 : 0);
});

test('Team score halving uses ceil and rematches rotate team opener plus teammates', () => {
  const match = new modes.TeamClash({ playerCount: 8, startingTeam: 0, teammateOffsets: [0, 0] });
  // Give team 1 five points in round one.
  recordTeamRound(match, [
    { result: 'MISS' }, { result: 'MAKE', eventId: 'cap-toss' },
    { result: 'MISS' }, { result: 'MISS' },
    { result: 'MISS' }, { result: 'MISS' },
  ]);
  let next = match.nextFlip();
  // Round two starts with team 1, so team 0's Plinko halve is the second flip.
  match.recordFlip({ playerIndex: next.playerIndex, result: 'MISS' });
  next = match.nextFlip();
  let state = match.recordFlip({ playerIndex: next.playerIndex, result: 'MAKE', eventId: 'plinko', plinko: 'halve' });
  assert.equal(state.scores[1], 3);

  const rematch = match.rematchOptions();
  assert.equal(rematch.startingTeam, 1);
  assert.deepEqual(rematch.teammateOffsets, [1, 1]);
  const replay = new modes.TeamClash(rematch);
  assert.equal(replay.nextFlip().teamIndex, 1);
  assert.equal(replay.nextFlip().playerIndex, replay.snapshot().teams[1][1]);
});

test('Team rematches alternate sides and rotate opening teammates at every supported size', () => {
  for (const count of modes.TEAM_COUNTS) {
    const match = new modes.TeamClash({ playerCount: count, startingTeam: 0 });
    const rematch = match.rematchOptions();
    const replay = new modes.TeamClash(rematch);
    const state = replay.snapshot();
    assert.equal(state.matchStartingTeam, 1);
    assert.equal(replay.nextFlip().teamIndex, 1);
    assert.equal(replay.nextFlip().playerIndex, state.teams[1][1 % state.teams[1].length]);
  }
});

test('Team queue, clutch, and highlight metadata are deterministic and immutable', () => {
  const a = new modes.TeamClash({ playerCount: 6, startingTeam: 1 });
  const b = new modes.TeamClash({ playerCount: 6, startingTeam: 1 });
  assert.deepEqual(a.snapshot().queue, b.snapshot().queue);
  assert.deepEqual(a.snapshot().clutch, b.snapshot().clutch);
  const nextA = a.nextFlip();
  const nextB = b.nextFlip();
  const stateA = a.recordFlip({ playerIndex: nextA.playerIndex, result: 'MAKE' });
  const stateB = b.recordFlip({ playerIndex: nextB.playerIndex, result: 'MAKE' });
  assert.deepEqual(stateA, stateB);
  assert.equal(stateA.highlight.kind, 'team-flip');
  assert.equal(Object.isFrozen(stateA.highlight), true);
});

test('mode adapters register through architecture hooks and emit versioned outcomes only', () => {
  const events = [];
  const outcomes = new runtimeModule.constructors.OutcomeHub({ now: () => 111 });
  outcomes.on('*', event => events.push(event));
  const registry = new runtimeModule.constructors.ModeAdapterRegistry();
  registry.register(modes.createCupAdapter({ outcomes }));
  registry.register(modes.createTeamAdapter({ outcomes }));
  assert.deepEqual(registry.list().map(adapter => adapter.id), ['classic', 'cup', 'team-clash']);

  const prepared = registry.prepareMatch({ defs: defs(4), direction: 1, options: { format: 'cup', cupLength: 'short' } });
  assert.equal(prepared.options.startingLives, 3);
  init(4, 3, prepared.options);
  assert.equal(game.format, 'cup');
  assert.equal(prepared.options.suddenDeathFlipThreshold, 12);
  assert.equal(registry.snapshot({}).schema, 'FlipgameModeStateV1');
  assert.equal(registry.snapshot({}).newCupOptions.openingIndex, 1,
    'Cup adapter snapshot exposes the tested fair next-Cup opener');

  emitFakeCupHeat(registry, outcomes);
  assert.equal(events[0].schema, 'FlipgameOutcomeEventV1');
  assert.equal(events[0].version, 1);
  assert.equal(events[0].type, 'mode.cup-heat-resolved.v1');
  assert.equal(events[0].metadata.source, 'v111-modes');
});

test('mode adapter snapshots expose immutable fair rematch proposals', () => {
  const cup = modes.createCupAdapter();
  cup.prepareMatch({ defs: defs(4), direction: 1, options: { format: 'cup', cupLength: 'short', startIndex: 2 } });
  const cupState = cup.snapshot();
  assert.equal(cupState.newCupOptions.openingIndex, 3);
  assert.equal(Object.isFrozen(cupState.newCupOptions), true);

  const team = modes.createTeamAdapter();
  team.prepareMatch({ defs: defs(8), direction: 1, options: { format: 'team-clash' } });
  const teamState = team.snapshot();
  assert.equal(teamState.rematchOptions.startingTeam, 1);
  assert.deepEqual(teamState.rematchOptions.teammateOffsets, [1, 1]);
  assert.deepEqual(teamState.swapTeamOptions.teams, [teamState.teams[1], teamState.teams[0]]);
  assert.equal(Object.isFrozen(teamState.rematchOptions), true);
  assert.equal(Object.isFrozen(teamState.swapTeamOptions), true);
});

function emitFakeCupHeat(registry) {
  const players = defs(4).map((definition, index) => Object.assign(definition, {
    lives: index === 0 ? 3 : 0,
    eliminated: index !== 0,
  }));
  const fakeGame = {
    players,
    currentPlayerIndex: 3,
    turnCounter: 8,
    activePlayers() { return this.players.filter(player => !player.eliminated); },
    advanceTurn() { this.state = 'GAME_OVER'; },
  };
  assert.equal(registry.advanceTurn({ game: fakeGame }), true);
}

test('Team adapter ends match with opponent lives forced to zero', () => {
  const adapter = modes.createTeamAdapter();
  const definitions = defs(2);
  adapter.prepareMatch({ defs: definitions, direction: 1, options: { format: 'team-clash' } });
  const current = init(2, 10);
  for (let flip = 0; flip < 6; flip++) {
    const state = adapter.snapshot();
    const next = state.queue[state.queuePosition];
    current.currentPlayerIndex = next.playerIndex;
    const winningTeam = next.teamIndex === 0;
    const eventId = winningTeam ? (flip === 4 ? 'double-flip' : flip === 2 ? 'cap-toss' : 'heart-rush') : null;
    adapter.resolveFlip({
      game: current,
      result: winningTeam ? 'MAKE' : 'MISS',
      eventId,
      meta: { eventId },
    });
    adapter.advanceTurn({ game: current });
  }
  assert.equal(current.state, GAME_STATES.GAME_OVER);
  assert.equal(current.players[1].lives, 0);
  assert.equal(current.players[1].eliminated, true);
});
