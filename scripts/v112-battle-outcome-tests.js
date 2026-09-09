'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Activity = require('../js/v112-activity.js');
const BattleAuthority = require('../js/v112-battle.js');

// Headless completion helpers follow the executable runtime contract and bind
// every Timed Rush launch before reporting its eventual result.
const Battle = Object.freeze(Object.assign({}, BattleAuthority, {
  recordAttempt(state, input) {
    let leased = state;
    if (state.config.paceId === 'rush' &&
        state.resolvedAttemptIds.indexOf(input.attemptId) < 0 &&
        state.pendingLaunchIds.indexOf(input.attemptId) < 0) {
      leased = BattleAuthority.markLaunch(state, {
        attemptId: input.attemptId, playerId: input.playerId,
      });
    }
    return BattleAuthority.recordAttempt(leased, input);
  },
}));

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function players(count, teams = false) {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    human: true,
    teamId: teams ? (index < count / 2 ? 'a' : 'b') : null,
    displayName: `Player ${index + 1}`,
  }));
}

function competitorFor(config, playerId) {
  const player = config.players.find((entry) => entry.id === playerId);
  return config.formatId === 'doubles' || config.formatId === 'team'
    ? player.teamId : player.id;
}

function winningPlayer(state) {
  const wanted = state.config.formatId === 'doubles' || state.config.formatId === 'team'
    ? 'a' : 'p1';
  return state.activePlayerIds.find((id) => competitorFor(state.config, id) === wanted)
    || state.activePlayerIds[0];
}

function completeBattle({ matchId = 'battle-complete', formatId = 'duel',
  paceId = 'volley', count = 2, teams = false, powerProfileId = 'sport',
  seed = 91, roster = null, width = 1920, verifiedContacts = 4 } = {}) {
  let state = Battle.createState({ matchId, formatId, paceId, powerProfileId,
    seed, players: roster || players(count, teams),
    hardware: { width, verifiedContacts } });
  let sequence = 0;
  while (state.phase !== 'complete') {
    if (state.phase === 'ready' || state.phase === 'between-heats') {
      state = Battle.startHeat(state);
      continue;
    }
    if (paceId === 'rush' && !state.suddenDeath) {
      state = Battle.recordAttempt(state, { attemptId: `${matchId}:a${sequence++}`,
        playerId: winningPlayer(state), pose: 'upright' });
      state = Battle.advanceClock(state, 60000);
      continue;
    }
    for (const playerId of state.activePlayerIds.slice()) {
      const winner = competitorFor(state.config, playerId) ===
        ((formatId === 'doubles' || formatId === 'team') ? 'a' : 'p1');
      state = Battle.recordAttempt(state, { attemptId: `${matchId}:a${sequence++}`,
        playerId, pose: winner ? 'upright' : 'miss' });
    }
  }
  Battle.validateBattleState(state);
  return state;
}

function completeBattleThroughSuddenDeath({ matchId, formatId, paceId, count, teams }) {
  let state = Battle.createState({ matchId, formatId, paceId,
    players: players(count, teams), hardware: { width: 1920, verifiedContacts: 4 } });
  let sequence = 0;
  while (state.phase !== 'complete') {
    if (state.phase === 'ready' || state.phase === 'between-heats') {
      state = Battle.startHeat(state);
      continue;
    }
    if (!state.suddenDeath) {
      if (paceId === 'rush') {
        state = Battle.advanceClock(state, 60000);
      } else {
        for (const playerId of state.activePlayerIds.slice()) {
          state = Battle.recordAttempt(state, { attemptId: `${matchId}:tie${sequence++}`,
            playerId, pose: 'miss' });
        }
      }
      continue;
    }
    let winnerScored = false;
    while (state.phase === 'active' && state.suddenDeath) {
      const active = state.activePlayerIds.slice();
      for (const playerId of active) {
        const isWinningCompetitor = competitorFor(state.config, playerId) ===
          ((formatId === 'doubles' || formatId === 'team') ? 'a' : 'p1');
        const pose = isWinningCompetitor && !winnerScored ? 'upright' : 'miss';
        if (pose === 'upright') winnerScored = true;
        state = Battle.recordAttempt(state, { attemptId: `${matchId}:sd${sequence++}`,
          playerId, pose });
      }
    }
  }
  Battle.validateBattleState(state);
  return state;
}

function finishHeatFor(state, competitorId, ids) {
  let sequence = ids.value;
  if (state.phase === 'ready' || state.phase === 'between-heats') {
    state = Battle.startHeat(state);
  }
  const heatNumber = state.heatNumber;
  if (state.config.paceId === 'rush') {
    let scorer = state.activePlayerIds.find((playerId) =>
      competitorFor(state.config, playerId) === competitorId);
    while (!scorer && state.elapsedMs < state.config.rushDurationMs) {
      state = Battle.advanceClock(state, Battle.rushRotationIntervalMs(state.config));
      scorer = state.activePlayerIds.find((playerId) =>
        competitorFor(state.config, playerId) === competitorId);
    }
    assert(scorer, `rush starter exposes ${competitorId}`);
    for (const playerId of state.activePlayerIds.slice()) {
      state = Battle.recordAttempt(state, { attemptId: `${state.matchId}:rotate${sequence++}`,
        playerId, pose: competitorFor(state.config, playerId) === competitorId
          ? 'upright' : 'miss' });
    }
    state = Battle.advanceClock(state, 60000);
  } else {
    while (state.phase === 'active' && state.heatNumber === heatNumber && !state.suddenDeath) {
      for (const playerId of state.activePlayerIds.slice()) {
        state = Battle.recordAttempt(state, { attemptId: `${state.matchId}:rotate${sequence++}`,
          playerId, pose: competitorFor(state.config, playerId) === competitorId
            ? 'upright' : 'miss' });
      }
    }
  }
  ids.value = sequence;
  return state;
}

function completeWithHeatWinners({ matchId, formatId, paceId, count, teams,
  winnerIds, width = 1920, verifiedContacts = 4 }) {
  let state = Battle.createState({ matchId, formatId, paceId,
    players: players(count, teams), hardware: { width, verifiedContacts } });
  const ids = { value: 0 };
  for (const winnerId of winnerIds) state = finishHeatFor(state, winnerId, ids);
  return state;
}

function mutated(value, edit) {
  const result = clone(value);
  edit(result);
  return result;
}

function testStrictConfigAndIdentityBoundary() {
  assert.throws(() => Battle.normalizeConfig({ formatId: 'duel', players: players(2) }),
    /matchId/i);
  assert.throws(() => Battle.normalizeConfig({ matchId: 'x'.repeat(129),
    formatId: 'duel', players: players(2) }), /128/);
  assert.throws(() => Battle.normalizeConfig({ matchId: 'ok', formatId: 'duel',
    players: [{ id: 'p'.repeat(65) }, { id: 'p2' }] }), /64/);
  assert.throws(() => Battle.normalizeConfig({ matchId: 'sparse', formatId: 'duel',
    players: new Array(2) }), /player id/i);
  assert.throws(() => Battle.normalizeConfig({ matchId: 'ok', formatId: 'team',
    players: players(6, true).map((entry, index) => Object.assign({}, entry,
      index === 0 ? { teamId: 't'.repeat(65) } : {})) }), /64/);

  const config = Battle.normalizeConfig({ matchId: 'strict-config', formatId: 'doubles',
    paceId: 'rush', powerProfileId: 'mayhem', physicsModeId: 'insane',
    players: players(4, true), hardware: { width: 1366, verifiedContacts: 4 }, seed: 0 });
  assert.equal(config.matchId, 'strict-config');
  assert.equal(config.activityFormatId, 'battle');
  assert.equal(config.physicsModeId, 'insane');
  assert.equal(config.seed, 0, 'zero is a valid immutable MatchRequest seed');
  assert.equal(Battle.validateBattleConfig(config), true);
  assert.throws(() => Battle.validateBattleConfig(Object.assign({}, clone(config), {
    unexpected: true,
  })), /unknown or missing/);
  assert.throws(() => Battle.validateBattleConfig(mutated(config, (value) => {
    value.hardware.activeLaneLimit = 1;
  })), /canonical/);
  assert.throws(() => Battle.validateBattleConfig(mutated(config, (value) => {
    value.players[0].teamId = 'b';
  })), /equal groups|canonical/);
}

function testEveryFormatAndPaceProducesCanonicalOutcome() {
  const cases = [
    { formatId: 'duel', count: 2, teams: false, winnerIds: ['p1'] },
    { formatId: 'doubles', count: 4, teams: true, winnerIds: ['p1', 'p2'] },
    { formatId: 'four-way', count: 4, teams: false, winnerIds: ['p1'] },
    { formatId: 'team', count: 16, teams: true,
      winnerIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'] },
  ];
  for (const paceId of ['volley', 'rush']) {
    for (const entry of cases) {
      const matchId = `canonical-${entry.formatId}-${paceId}`;
      const state = completeBattle(Object.assign({ matchId, paceId }, entry));
      const outcome = Battle.toMatchOutcomeV2(state, { endedAt: '2026-09-08T12:00:00Z' });
      assert.equal(outcome.schema, 'MatchOutcomeV2');
      assert.equal(outcome.matchId, matchId);
      assert.equal(outcome.status, 'completed');
      assert.equal(outcome.completed, true);
      assert.deepEqual(outcome.winnerIds, entry.winnerIds);
      assert.equal(outcome.participantResults.length, entry.count);
      assert.deepEqual(outcome.participantResults.map((result) => result.playerId),
        players(entry.count, entry.teams).map((player) => player.id));
      assert.equal(outcome.resolutionIdentity.schema, 'BattleResolutionIdentityV1');
      assert.equal(outcome.resolutionIdentity.ordinal, state.resolvedAttempts.length);
      assert.deepEqual(Battle.toMatchOutcomeV2(state).resolutionIdentity,
        outcome.resolutionIdentity, 'identical terminal evidence has one stable identity');
      assert.equal(outcome.completionReason, 'battle-heat-target');
      assert(Object.isFrozen(outcome));
    }
  }
}

function testEveryFormatAndPaceSuddenDeathIsReachable() {
  const cases = [
    { formatId: 'duel', count: 2, teams: false, winners: ['p1'] },
    { formatId: 'doubles', count: 4, teams: true, winners: ['p1', 'p2'] },
    { formatId: 'four-way', count: 4, teams: false, winners: ['p1'] },
    { formatId: 'team', count: 6, teams: true, winners: ['p1', 'p2', 'p3'] },
  ];
  for (const paceId of ['volley', 'rush']) {
    for (const entry of cases) {
      const matchId = `sudden-${entry.formatId}-${paceId}`;
      const state = completeBattleThroughSuddenDeath(Object.assign({ matchId, paceId }, entry));
      assert(state.heatResults.every((heat) => heat.suddenDeath));
      assert.deepEqual(Battle.toMatchOutcomeV2(state).winnerIds, entry.winners);
    }
  }
}

function testPressureHeatAndBestOfThreeReachability() {
  for (const paceId of ['volley', 'rush']) {
    for (const contacts of [1, 2, 4]) {
      const state = completeWithHeatWinners({
        matchId: `pressure-${paceId}-${contacts}`,
        formatId: 'four-way', paceId, count: 4, teams: false,
        winnerIds: ['p1', 'p2', 'p3'],
        width: contacts === 1 ? 600 : (contacts === 2 ? 900 : 1920),
        verifiedContacts: contacts,
      });
      assert.equal(state.phase, 'complete');
      assert.equal(state.heatNumber, 3);
      assert.equal(state.winnerId, 'p3');
      assert.equal(state.completionReason, 'battle-pressure-heat');
      assert.deepEqual(Battle.toMatchOutcomeV2(state).winnerIds, ['p3']);

      if (contacts === 4) {
        const postClinch = clone(state);
        const second = postClinch.heatResults[1];
        for (let index = second.attemptStartIndex; index < second.attemptEndIndex; index += 1) {
          const attempt = postClinch.resolvedAttempts[index];
          attempt.pose = attempt.playerId === 'p1' ? 'upright' : 'miss';
          attempt.score = attempt.pose === 'upright' ? 1 : 0;
        }
        second.winnerId = 'p1';
        second.scores = Object.fromEntries(Object.keys(second.scores).map((id) => [id, 0]));
        for (let index = second.attemptStartIndex; index < second.attemptEndIndex; index += 1) {
          const attempt = postClinch.resolvedAttempts[index];
          second.scores[attempt.competitorId] += attempt.score;
        }
        postClinch.heatWins = { p1: 2, p2: 0, p3: 1, p4: 0 };
        assert.throws(() => Battle.validateBattleState(postClinch), /continues after.*clinched/i,
          'Pressure Heat cannot override an earlier two-win clinch');
      }
    }

    const team = completeWithHeatWinners({ matchId: `team-rotation-${paceId}`,
      formatId: 'team', paceId, count: 16, teams: true,
      winnerIds: ['a', 'b', 'a'] });
    assert.equal(team.phase, 'complete');
    assert.equal(team.heatNumber, 3);
    assert.equal(team.winnerId, 'a');
    assert.equal(team.completionReason, 'battle-heat-target');
    assert.deepEqual(team.heatResults.map((heat) => heat.winnerId), ['a', 'b', 'a']);
    assert(new Set(team.resolvedAttempts.filter((attempt) => attempt.competitorId === 'a')
      .map((attempt) => attempt.playerId)).size > 1,
    'large teams rotate representatives across the three-heat series');
  }
}

function testTerminalStateForgeryRejection() {
  const terminal = completeBattle({ matchId: 'forgery-terminal', formatId: 'duel',
    paceId: 'volley' });
  const rejected = [
    ['unknown state field', (state) => { state.hacked = true; }],
    ['wrong match', (state) => { state.matchId = 'other'; }],
    ['wrong state format', (state) => { state.formatId = 'classic'; }],
    ['wrong config match', (state) => { state.config.matchId = 'other'; }],
    ['forged score', (state) => { state.scores.p1 += 2; }],
    ['forged heat score', (state) => { state.heatResults.at(-1).scores.p1 += 2; }],
    ['forged heat wins', (state) => { state.heatWins.p2 = 2; }],
    ['forged winner', (state) => { state.winnerId = 'p2'; }],
    ['forged phase', (state) => { state.phase = 'active'; }],
    ['forged completion reason', (state) => { state.completionReason = 'caller-won'; }],
    ['forged attempt pose', (state) => { state.resolvedAttempts[0].pose = 'cap'; }],
    ['forged attempt score', (state) => { state.resolvedAttempts[0].score = 2; }],
    ['forged attempt owner', (state) => { state.resolvedAttempts[0].competitorId = 'p2'; }],
    ['duplicate attempt identity', (state) => {
      state.resolvedAttemptIds[1] = state.resolvedAttemptIds[0];
      state.resolvedAttempts[1].attemptId = state.resolvedAttemptIds[0];
    }],
    ['oversize attempt identity', (state) => {
      state.resolvedAttemptIds[0] = 'a'.repeat(Battle.MAX_ATTEMPT_ID_LENGTH + 1);
      state.resolvedAttempts[0].attemptId = state.resolvedAttemptIds[0];
    }],
    ['terminal pending launch', (state) => { state.pendingLaunchIds.push('late'); }],
    ['wrong roster', (state) => { state.config.players[0].id = 'outsider'; }],
  ];
  for (const [label, edit] of rejected) {
    assert.throws(() => Battle.toMatchOutcomeV2(mutated(terminal, edit)), undefined, label);
  }
  const sparseLedger = clone(terminal);
  delete sparseLedger.resolvedAttempts[0];
  assert.throws(() => Battle.toMatchOutcomeV2(sparseLedger), /empty slots/i);

  const active = Battle.startHeat(Battle.createState({ matchId: 'still-active',
    formatId: 'duel', paceId: 'volley', players: players(2),
    hardware: { width: 1280, verifiedContacts: 2 } }));
  assert.throws(() => Battle.toMatchOutcomeV2(active, { status: 'completed' }),
    /phase|contradicts/i);
  assert.throws(() => Battle.toMatchOutcomeV2(terminal, { status: 'abandoned' }),
    /phase|contradicts/i);
  const abandoned = Battle.toMatchOutcomeV2(active, { status: 'abandoned' });
  const cancelled = Battle.toMatchOutcomeV2(active, { status: 'cancelled' });
  assert.deepEqual(abandoned.winnerIds, []);
  assert.deepEqual(cancelled.winnerIds, []);
  assert.equal(cancelled.completionReason, 'cancelled');
}

function testCanonicalEvidenceAndInactiveMetadata() {
  const terminal = completeBattle({ matchId: 'canonical-evidence', formatId: 'duel',
    paceId: 'volley' });
  const originalIdentity = Battle.toMatchOutcomeV2(terminal).resolutionIdentity;

  const reorderedMaps = clone(terminal);
  reorderedMaps.heatResults.forEach((result) => {
    result.scores = { p2: result.scores.p2, p1: result.scores.p1 };
  });
  assert.equal(Battle.validateBattleState(reorderedMaps), true);
  assert.deepEqual(Battle.toMatchOutcomeV2(reorderedMaps).resolutionIdentity, originalIdentity,
    'object insertion order cannot create a second identity for identical evidence');

  assert.throws(() => Battle.validateBattleState(mutated(terminal, (state) => {
    state.resolvedAttempts[0].attemptId = ` ${state.resolvedAttempts[0].attemptId} `;
  })), /out of sync|canonical/i);
  assert.throws(() => Battle.validateBattleState(mutated(terminal, (state) => {
    [state.resolvedAttempts[0], state.resolvedAttempts[1]] =
      [state.resolvedAttempts[1], state.resolvedAttempts[0]];
    [state.resolvedAttemptIds[0], state.resolvedAttemptIds[1]] =
      [state.resolvedAttemptIds[1], state.resolvedAttemptIds[0]];
  })), /canonical volley/i);
  for (const edit of [
    (state) => { state.volleyIndex = 999; },
    (state) => { state.elapsedMs = 60000; state.clockExpired = true; },
  ]) assert.throws(() => Battle.validateBattleState(mutated(terminal, edit)),
    /metadata|Timed Rush clock/i);

  const rush = completeBattle({ matchId: 'canonical-rush-metadata', formatId: 'duel',
    paceId: 'rush' });
  assert.throws(() => Battle.validateBattleState(mutated(rush, (state) => {
    state.volleyIndex = 999;
  })), /metadata/i);
  assert.throws(() => Battle.validateBattleState(mutated(rush, (state) => {
    state.elapsedMs = 0;
    state.clockExpired = false;
  })), /metadata/i);

  let active = Battle.startHeat(Battle.createState({ matchId: 'pending-canonical',
    formatId: 'duel', paceId: 'rush', players: players(2),
    hardware: { width: 1920, verifiedContacts: 2 } }));
  active = mutated(active, (state) => {
    state.pendingLaunchIds = [' pending '];
    state.pendingLaunchOwners = { ' pending ': 'p1' };
  });
  assert.throws(() => Battle.validateBattleState(active), /canonical/i);
}

function testPowerAndManualAttemptProvenance() {
  const terminal = completeBattle({ matchId: 'power-provenance', formatId: 'duel',
    paceId: 'volley' });
  const forged = clone(terminal);
  const offered = forged.powerOffers.p1;
  assert(offered && offered.length === 2);
  const unoffered = Battle.SPORT_CARDS.find((card) =>
    !offered.some((candidate) => candidate.id === card.id));
  forged.powerOffers.p1 = null;
  forged.storedPowers.p1 = clone(unoffered);
  forged.storedPowerSequences.p1 = forged.powerOfferSequences.p1;
  assert.throws(() => Battle.validateBattleState(forged), /deterministic offer/i);

  const duplicatedOffer = clone(terminal);
  duplicatedOffer.storedPowers.p1 = clone(duplicatedOffer.powerOffers.p1[0]);
  duplicatedOffer.storedPowerSequences.p1 = duplicatedOffer.powerOfferSequences.p1;
  assert.throws(() => Battle.validateBattleState(duplicatedOffer),
    /latest offer sequence.*incoherent/i,
  'one charge threshold cannot exist as both a stored card and a visible offer');

  let olderStored = Battle.startHeat(Battle.createState({ matchId: 'older-stored-power',
    formatId: 'duel', paceId: 'rush', players: players(2),
    hardware: { width: 1920, verifiedContacts: 2 } }));
  for (let index = 0; index < 3; index += 1) {
    olderStored = Battle.recordAttempt(olderStored, { attemptId: `older-${index}`,
      playerId: 'p1', pose: 'miss' });
  }
  olderStored = Battle.choosePower(olderStored, { playerId: 'p1', index: 0 });
  for (let index = 3; index < 6; index += 1) {
    olderStored = Battle.recordAttempt(olderStored, { attemptId: `older-${index}`,
      playerId: 'p1', pose: 'miss' });
  }
  assert.equal(olderStored.storedPowerSequences.p1, 1);
  assert.equal(olderStored.powerOfferSequences.p1, 2);
  assert(olderStored.powerOffers.p1);
  assert.equal(Battle.validateBattleState(olderStored), true,
    'a sequence-one card may remain stored while a sequence-two offer waits');

  let mixed = Battle.startHeat(Battle.createState({ matchId: 'cpu-manual-provenance',
    formatId: 'duel', paceId: 'rush', players: [
      { id: 'p1', human: true }, { id: 'cpu', cpu: true },
    ], hardware: { width: 1920, verifiedContacts: 2 } }));
  for (let index = 0; index < 3; index += 1) {
    mixed = Battle.recordAttempt(mixed, { attemptId: `cpu-${index}`,
      playerId: 'cpu', pose: 'miss' });
  }
  assert(mixed.resolvedAttempts.every((attempt) => attempt.qualifiedManual === false));
  assert.equal(mixed.charges.cpu, 0);
  assert.equal(mixed.powerOffers.cpu, null);
  assert.throws(() => Battle.validateBattleState(mutated(mixed, (state) => {
    state.resolvedAttempts[0].qualifiedManual = true;
    state.charges.cpu = 1;
  })), /CPU.*manual/i);
}

function testRushRosterReachability() {
  const terminal = completeBattle({ matchId: 'rush-bench-reachability',
    formatId: 'team', paceId: 'rush', count: 16, teams: true,
    roster: players(16, true), width: 600, verifiedContacts: 1 });
  const forged = clone(terminal);
  const attempt = forged.resolvedAttempts.find((entry) =>
    entry.heatNumber === 1 && entry.competitorId === 'a');
  assert(attempt);
  attempt.playerId = 'p8';
  attempt.launchLease.playerId = 'p8';
  assert.throws(() => Battle.validateBattleState(forged), /launch bucket/i,
    'a same-team bench player cannot be inserted into an unreachable Rush window');
}

function testRushLaunchLeaseForgeryRejection() {
  const terminal = completeBattle({ matchId: 'rush-lease-forgery',
    formatId: 'duel', paceId: 'rush' });
  const attemptIndex = terminal.resolvedAttempts.findIndex((attempt) =>
    attempt.suddenDeath === false);
  assert(attemptIndex >= 0);
  const rejected = [
    ['wrong launch bucket', (state) => { state.resolvedAttempts[attemptIndex]
      .launchLease.bucketIndex += 1; }],
    ['wrong launch rotation', (state) => { state.resolvedAttempts[attemptIndex]
      .launchLease.rotationIndex += 1; }],
    ['forged launch time', (state) => { state.resolvedAttempts[attemptIndex]
      .launchLease.elapsedMs = 15000; }],
    ['post-horn regulation time', (state) => { state.resolvedAttempts[attemptIndex]
      .launchLease.elapsedMs = 60000; }],
    ['missing Rush lease', (state) => { state.resolvedAttempts[attemptIndex]
      .launchLease = null; }],
    ['unknown lease field', (state) => { state.resolvedAttempts[attemptIndex]
      .launchLease.injected = true; }],
  ];
  for (const [label, edit] of rejected) {
    assert.throws(() => Battle.validateBattleState(mutated(terminal, edit)), undefined, label);
  }

  const volley = completeBattle({ matchId: 'volley-rejects-rush-lease',
    formatId: 'duel', paceId: 'volley' });
  assert.throws(() => Battle.validateBattleState(mutated(volley, (state) => {
    state.resolvedAttempts[0].launchLease = clone(
      terminal.resolvedAttempts[attemptIndex].launchLease);
  })), /cannot carry.*Rush launch lease/i);

  let active = Battle.startHeat(Battle.createState({ matchId: 'active-future-lease',
    formatId: 'duel', paceId: 'rush', players: players(2),
    hardware: { width: 1280, verifiedContacts: 2 } }));
  active = Battle.recordAttempt(active, { attemptId: 'active-now',
    playerId: 'p1', pose: 'miss' });
  assert.equal(active.elapsedMs, 0);
  assert.throws(() => Battle.validateBattleState(mutated(active, (state) => {
    Object.assign(state.resolvedAttempts[0].launchLease, {
      elapsedMs: 15000, bucketIndex: 1, rotationIndex: 1,
    });
  })), /ahead of the match clock/i,
  'a coherent but future Rush bucket cannot be backfilled into an active ledger');
}

function testActiveStateAndPowerForgeryRejection() {
  let state = Battle.startHeat(Battle.createState({ matchId: 'active-forgery',
    formatId: 'four-way', paceId: 'volley', powerProfileId: 'mayhem',
    players: players(4), seed: 73,
    hardware: { width: 1920, verifiedContacts: 4 } }));
  assert.throws(() => Battle.validateBattleState(mutated(state, (value) => {
    value.elapsedMs = 1;
  })), /Timed Rush clock/i);
  assert.throws(() => Battle.validateBattleState(mutated(state, (value) => {
    value.activePlayerIds = ['p4', 'p3', 'p2', 'p1'];
  })), /batch|assignment|stale|forged/i);
  assert.throws(() => Battle.validateBattleState(mutated(state, (value) => {
    value.volleyParticipantIds = ['p1', 'p2'];
  })), /participants/i);
  assert.throws(() => Battle.validateBattleState(mutated(state, (value) => {
    value.pendingLaunchIds = ['one', 'two', 'three', 'four', 'five'];
  })), /bounded|pending/i);
  assert.throws(() => Battle.validateBattleState(mutated(state, (value) => {
    value.pendingLaunchIds = [17];
    value.pendingLaunchOwners = { 17: 'p1' };
  })), /strings/i);
  assert.throws(() => Battle.markLaunch(state, { attemptId: 'missing-owner' }), /playerId/i);
  assert.throws(() => Battle.markLaunch(state, {
    attemptId: 'unknown-owner', playerId: 'outsider',
  }), /not active/i);
  let pending = Battle.markLaunch(state, { attemptId: 'bound-launch', playerId: 'p1' });
  assert.throws(() => Battle.markLaunch(pending, {
    attemptId: 'bound-launch', playerId: 'p2',
  }), /another player/i);
  assert.equal(pending.pendingLaunchOwners['bound-launch'], 'p1');
  assert.throws(() => Battle.validateBattleState(mutated(pending, (value) => {
    value.pendingLaunchIds.push('forged-same-lane');
    value.pendingLaunchOwners['forged-same-lane'] = 'p1';
    value.pendingLaunchLeases['forged-same-lane'] = null;
  })), /multiple pending launches/i,
  'a forged Volley state cannot bind two attempts to one physical player lane');

  let resolvedVolley = Battle.recordAttempt(state, { attemptId: 'resolved-player',
    playerId: 'p1', pose: 'miss' });
  assert.throws(() => Battle.markLaunch(resolvedVolley, {
    attemptId: 'second-launch', playerId: 'p1',
  }), /resolved synchronized/i);

  let sudden = Battle.startHeat(Battle.createState({ matchId: 'active-sd-forgery',
    formatId: 'four-way', paceId: 'volley', players: players(4),
    hardware: { width: 1920, verifiedContacts: 4 } }));
  let suddenSequence = 0;
  while (!sudden.suddenDeath) {
    for (const playerId of sudden.activePlayerIds.slice()) {
      sudden = Battle.recordAttempt(sudden, { attemptId: `sd-forge-${suddenSequence++}`,
        playerId, pose: 'miss' });
    }
  }
  assert.throws(() => Battle.validateBattleState(mutated(sudden, (value) => {
    value.suddenDeathCompetitorIds = ['p1', 'p2'];
    value.volleyParticipantIds = ['p1', 'p2'];
    value.activePlayerIds = ['p1', 'p2'];
  })), /roster|reachable/i,
  'an active sudden-death roster is derived from the regulation tie');

  for (let index = 0; index < 3; index += 1) {
    state = Battle.recordAttempt(state, { attemptId: `offer-${index}`,
      playerId: 'p1', pose: 'miss' });
    if (index < 2) {
      for (const id of state.activePlayerIds.slice().filter((id) => id !== 'p1')) {
        state = Battle.recordAttempt(state, { attemptId: `other-${index}-${id}`,
          playerId: id, pose: 'miss' });
      }
    }
  }
  const offerState = state;
  assert(offerState.powerOffers.p1 || offerState.deferredPowerOffers.p1);
  assert.throws(() => Battle.validateBattleState(mutated(offerState, (value) => {
    const map = value.powerOffers.p1 ? value.powerOffers : value.deferredPowerOffers;
    map.p1[0].eventAdapterId = 'plinko';
  })), /allowlist/);
  assert.throws(() => Battle.validateBattleState(mutated(offerState, (value) => {
    const map = value.powerOffers.p1 ? value.powerOffers : value.deferredPowerOffers;
    map.p1.reverse();
  })), /deterministic/);
  assert.throws(() => Battle.validateBattleState(mutated(offerState, (value) => {
    value.deferredPowerOffers.p1 = value.powerOffers.p1;
    value.powerOffers.p1 = null;
  })), /relay-volley boundary/i,
  'a multi-lane Volley offer cannot be forged into the relay-only deferred slot');

  let rushOffer = Battle.startHeat(Battle.createState({ matchId: 'rush-deferred-forgery',
    formatId: 'duel', paceId: 'rush', players: players(2),
    hardware: { width: 1280, verifiedContacts: 2 } }));
  for (let index = 0; index < 3; index += 1) {
    rushOffer = Battle.recordAttempt(rushOffer, { attemptId: `rush-offer-${index}`,
      playerId: 'p1', pose: 'miss' });
  }
  assert(rushOffer.powerOffers.p1);
  assert.throws(() => Battle.validateBattleState(mutated(rushOffer, (value) => {
    value.deferredPowerOffers.p1 = value.powerOffers.p1;
    value.powerOffers.p1 = null;
  })), /relay-volley boundary/i,
  'Timed Rush can never carry a deferred power offer');

  const inactiveOffer = completeBattle({ matchId: 'inactive-deferred-forgery',
    formatId: 'duel', paceId: 'volley', width: 1280, verifiedContacts: 2 });
  assert(inactiveOffer.powerOffers.p1);
  assert.throws(() => Battle.validateBattleState(mutated(inactiveOffer, (value) => {
    value.deferredPowerOffers.p1 = value.powerOffers.p1;
    value.powerOffers.p1 = null;
  })), /relay-volley boundary/i,
  'an inactive Battle state cannot retain a deferred offer');

  let relayOffer = Battle.startHeat(Battle.createState({
    matchId: 'relay-deferred-owner-forgery', formatId: 'duel', paceId: 'volley',
    players: players(2), hardware: { width: 600, verifiedContacts: 1 },
  }));
  for (let volley = 0; volley < 3; volley += 1) {
    while (relayOffer.phase === 'active' && relayOffer.volleyIndex === volley) {
      const playerId = relayOffer.activePlayerIds[0];
      relayOffer = Battle.recordAttempt(relayOffer, {
        attemptId: `relay-offer-${volley}-${playerId}`, playerId, pose: 'miss',
      });
    }
  }
  assert(relayOffer.powerOffers.p1 && relayOffer.powerOffers.p2);
  const openerId = relayOffer.activePlayerIds[0];
  relayOffer = Battle.recordAttempt(relayOffer, {
    attemptId: 'relay-unrelated-opener', playerId: openerId, pose: 'miss',
  });
  const unresolvedId = relayOffer.activePlayerIds[0];
  assert(unresolvedId && relayOffer.powerOffers[unresolvedId]);
  assert.throws(() => Battle.validateBattleState(mutated(relayOffer, (value) => {
    value.deferredPowerOffers[unresolvedId] = value.powerOffers[unresolvedId];
    value.powerOffers[unresolvedId] = null;
  })), /threshold-crossing volley attempt/i,
  'an older visible offer cannot be moved behind an unrelated partial-volley barrier');
}

function testBrowserAuthorityComposition() {
  const battleSource = fs.readFileSync(path.join(__dirname, '../js/v112-battle.js'), 'utf8');
  const activitySource = fs.readFileSync(path.join(__dirname, '../js/v112-activity.js'), 'utf8');
  function browserContext(seed = {}) {
    const context = vm.createContext(Object.assign({}, seed));
    vm.runInContext(battleSource, context, { filename: 'v112-battle.js' });
    return context;
  }

  assert.equal(Object.prototype.hasOwnProperty.call(globalThis, 'FlipgameV112Battle'), false,
    'CommonJS Battle construction never publishes trusted APIs on globalThis');
  const first = browserContext();
  const firstApi = first.FlipgameV112Battle;
  const descriptor = Object.getOwnPropertyDescriptor(first, 'FlipgameV112Battle');
  assert.equal(Object.isFrozen(firstApi), true);
  assert.equal(firstApi.schema, 'BattleRulesV1');
  assert.equal(descriptor.writable, false);
  assert.equal(descriptor.configurable, false);
  assert.throws(() => vm.runInContext(
    "'use strict'; globalThis.FlipgameV112Battle = Object.freeze({schema:'BattleRulesV1'});",
    first), /read only|assign/i);
  assert.strictEqual(first.FlipgameV112Battle, firstApi,
    'the accepted browser authority cannot be replaced after load');
  assert.throws(() => vm.runInContext(battleSource, first, {
    filename: 'v112-battle-duplicate.js',
  }), /already defined|ambiguous browser authority/i);

  const preseed = vm.createContext({ FlipgameV112Battle: Object.freeze({
    schema: 'BattleRulesV1', normalizeConfig() {}, validateBattleState() {},
    toMatchOutcomeV2() {},
  }) });
  assert.throws(() => vm.runInContext(battleSource, preseed, {
    filename: 'v112-battle-preseed.js',
  }), /already defined|ambiguous browser authority/i,
  'a schema-shaped preseed cannot impersonate the Battle authority');

  const shim = vm.createContext({ module: { exports: {} } });
  vm.runInContext(battleSource, shim, { filename: 'v112-battle-module-shim.js' });
  assert.equal(shim.FlipgameV112Battle.schema, 'BattleRulesV1');
  assert.equal(Object.keys(shim.module.exports).length, 0,
    'a browser module shim is not mistaken for trusted CommonJS composition');

  const second = browserContext();
  assert.notStrictEqual(second.FlipgameV112Battle, firstApi,
    'separate browser compositions retain distinct authority identities');

  let substituteCalls = 0;
  const activityContext = vm.createContext({ FlipgameV112Battle: firstApi });
  vm.runInContext(activitySource, activityContext, { filename: 'v112-activity.js' });
  const accepted = activityContext.FlipgameV112Activity;
  activityContext.FlipgameV112Battle = Object.freeze({ schema: 'BattleRulesV1',
    normalizeConfig() { substituteCalls += 1; return {}; },
    validateBattleState() { substituteCalls += 1; return true; },
    toMatchOutcomeV2() { substituteCalls += 1; return {}; },
  });
  accepted.MatchRequestV2({ schema: 'MatchRequestV2', matchId: 'authority-capture',
    activityId: 'free-play', formatId: 'battle', physicsModeId: 'normal',
    roster: players(2), seed: 1, rulesOptions: { battleFormatId: 'duel',
      paceId: 'volley', hardware: { width: 1280, verifiedContacts: 2 } } });
  assert.equal(substituteCalls, 0,
    'Activity captures its canonical Battle authority once and never rebinds');
}

function memoryRewardAuthority() {
  const state = { lineageId: 'battle-test-lineage', consumedMatchOrdinal: 0,
    activeMatchReservation: null };
  let nonce = 0;
  return {
    earnedSnapshot() { return clone(state); },
    reserveMatch(matchId, activityId) {
      if (state.activeMatchReservation) return { applied: false, reason: 'active' };
      const token = { schema: 'MatchClaimTokenV1', version: 1,
        lineageId: state.lineageId, ordinal: state.consumedMatchOrdinal + 1,
        nonce: `nonce-${++nonce}`, matchId, activityId, reservedAt: 1000 + nonce };
      state.activeMatchReservation = token;
      return { applied: true, token: clone(token) };
    },
    resumeMatchReservation() { return clone(state.activeMatchReservation); },
    claimMatch(token) {
      assert.deepEqual(token, state.activeMatchReservation);
      state.consumedMatchOrdinal = token.ordinal;
      state.activeMatchReservation = null;
      return { applied: true, duplicate: false };
    },
    abandonMatch(token) {
      assert.deepEqual(token, state.activeMatchReservation);
      state.consumedMatchOrdinal = token.ordinal;
      state.activeMatchReservation = null;
      return { applied: true };
    },
  };
}

function battleRequest(matchId, patch = {}) {
  return Object.assign({ schema: 'MatchRequestV2', matchId, activityId: 'free-play',
    formatId: 'battle', physicsModeId: 'normal', roster: players(2), seed: 91,
    rulesOptions: { battleFormatId: 'duel', paceId: 'volley',
      powerProfileId: 'sport', hardware: { width: 1920, verifiedContacts: 4 } },
  }, patch);
}

async function testActivityRequiresCanonicalBattleTerminalState() {
  let transactions = 0;
  const rewards = memoryRewardAuthority();
  const registry = Activity.createActivityRegistry([{
    id: 'free-play',
    resolve({ outcome }) { return { winnerIds: outcome.winnerIds }; },
  }]);
  const coordinator = Activity.createMatchSessionCoordinator({
    registry, rewardAuthority: rewards,
    transaction(command, context) {
      transactions += 1;
      const claimed = context.consumeMatch({ completed: true, resolved: true,
        qualifiedManualHumanFlips: 6, humanPlayers: 2, format: 'battle',
        performanceMultiplier: 1 });
      return { duplicate: claimed.duplicate === true, outcome: command.outcome };
    },
  });
  assert.throws(() => Activity.MatchRequestV2(battleRequest('x'.repeat(129))), /128/,
    'Battle identity bounds apply before the coordinator reserves rewards');
  assert.throws(() => Activity.MatchRequestV2(battleRequest('bad-battle-roster', {
    roster: players(4), rulesOptions: { battleFormatId: 'duel', paceId: 'volley',
      hardware: { width: 1920, verifiedContacts: 4 } },
  })), /two players/);
  const request = Activity.MatchRequestV2(battleRequest('activity-battle'));
  coordinator.start(request);
  await assert.rejects(() => coordinator.finalize({ matchId: request.matchId,
    status: 'completed', winnerIds: ['p1'] }), /terminal Rules-issued outcome/i);
  assert.equal(transactions, 0);

  const terminal = completeBattle({ matchId: request.matchId, formatId: 'duel',
    paceId: 'volley', seed: request.seed });
  assert.deepEqual(terminal.config, Battle.normalizeConfig(request));
  const outcome = Battle.toMatchOutcomeV2(terminal);
  const [first, duplicate] = await Promise.all([
    coordinator.finalize(outcome), coordinator.finalize(outcome),
  ]);
  assert.deepEqual(first, duplicate);
  assert.equal(first.status, 'completed');
  assert.equal(transactions, 1, 'duplicate completion cannot transact twice');

  const wrongConfigCoordinator = Activity.createMatchSessionCoordinator({
    registry, rewardAuthority: memoryRewardAuthority(),
    transaction() { throw new Error('wrong config reached transaction'); },
  });
  const wrongRequest = Activity.MatchRequestV2(battleRequest('activity-wrong-config'));
  wrongConfigCoordinator.start(wrongRequest);
  const wrongConfigState = completeBattle({ matchId: wrongRequest.matchId,
    formatId: 'duel', paceId: 'rush', seed: wrongRequest.seed });
  await assert.rejects(() => wrongConfigCoordinator.finalize(
    Battle.toMatchOutcomeV2(wrongConfigState)), /configuration/i);
  const wrongSeedState = completeBattle({ matchId: wrongRequest.matchId,
    formatId: 'duel', paceId: 'volley', seed: wrongRequest.seed + 1 });
  await assert.rejects(() => wrongConfigCoordinator.finalize(
    Battle.toMatchOutcomeV2(wrongSeedState)), /configuration/i);
  const wrongRosterState = completeBattle({ matchId: wrongRequest.matchId,
    formatId: 'duel', paceId: 'volley', seed: wrongRequest.seed,
    roster: [{ id: 'p1', human: true }, { id: 'p3', human: true }] });
  await assert.rejects(() => wrongConfigCoordinator.finalize(
    Battle.toMatchOutcomeV2(wrongRosterState)), /roster|participant|configuration/i);

  const active = Battle.startHeat(Battle.createState(request));
  assert.throws(() => Activity.MatchOutcomeV2({ matchId: request.matchId,
    status: 'completed', rulesState: active }), /phase|contradicts/i);
  assert.throws(() => Activity.MatchOutcomeV2(Object.assign({}, outcome, {
    winnerIds: ['p2'],
  })), /winner/i);
  assert.throws(() => Activity.MatchOutcomeV2(Object.assign({}, outcome, {
    matchId: 'other-match',
  })), /identity/i);
  assert.throws(() => Activity.MatchOutcomeV2(Object.assign({}, outcome, {
    resolutionIdentity: Object.assign({}, outcome.resolutionIdentity, { token: 'forged' }),
  })), /resolution identity/i);
  const cancelled = Activity.MatchOutcomeV2(Battle.toMatchOutcomeV2(active,
    { status: 'cancelled' }));
  assert.deepEqual(cancelled.winnerIds, []);
  assert.equal(cancelled.completed, false);
}

async function run() {
  testStrictConfigAndIdentityBoundary();
  testEveryFormatAndPaceProducesCanonicalOutcome();
  testEveryFormatAndPaceSuddenDeathIsReachable();
  testPressureHeatAndBestOfThreeReachability();
  testTerminalStateForgeryRejection();
  testCanonicalEvidenceAndInactiveMetadata();
  testPowerAndManualAttemptProvenance();
  testRushRosterReachability();
  testRushLaunchLeaseForgeryRejection();
  testActiveStateAndPowerForgeryRejection();
  testBrowserAuthorityComposition();
  await testActivityRequiresCanonicalBattleTerminalState();
  console.log('v1.12 Battle terminal-outcome integrity tests passed.');
}

run().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
