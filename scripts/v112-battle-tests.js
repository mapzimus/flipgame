'use strict';

const assert = require('node:assert/strict');
const Battle = require('../js/v112-battle.js');

function players(count, teams = false) {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    teamId: teams ? (index < count / 2 ? 'a' : 'b') : null,
  }));
}

function testConfigurationAndHardware() {
  assert.equal(Battle.hardwareProfile({ width: 1920, verifiedContacts: 4 }).activeLaneLimit, 4);
  assert.equal(Battle.hardwareProfile({ width: 900, verifiedContacts: 4 }).activeLaneLimit, 2);
  assert.equal(Battle.hardwareProfile({ width: 600, verifiedContacts: 4 }).fallback, 'alternating-relay');
  assert.throws(() => Battle.normalizeConfig({ formatId: 'duel', players: players(4) }), /two/);
  assert.throws(() => Battle.normalizeConfig({ formatId: 'team', players: players(8) }), /teamId/);
  const team = Battle.normalizeConfig({ formatId: 'team', players: players(16, true),
    hardware: { width: 1920, verifiedContacts: 4 } });
  assert.equal(team.players.length, 16);
  assert.equal(team.normalEventsEnabled, false);
  assert.equal(Battle.createState(team).activePlayerIds.length, 4);
}

function testVolleyScoringTieAndHeat() {
  let state = Battle.startHeat(Battle.createState({ formatId: 'duel', paceId: 'volley',
    players: players(2), hardware: { width: 1280, verifiedContacts: 2 } }));
  for (let volley = 0; volley < 5; volley += 1) {
    state = Battle.recordAttempt(state, { attemptId: `a-${volley}`, playerId: 'p1', pose: 'upright' });
    state = Battle.recordAttempt(state, { attemptId: `b-${volley}`, playerId: 'p2', pose: 'miss' });
  }
  assert.equal(state.phase, 'between-heats');
  assert.equal(state.heatWins.p1, 1);
  state = Battle.startHeat(state);
  assert.equal(state.scores.p1, 0);
  assert.equal(Battle.scoreForPose('cap'), 2);
  assert.equal(Battle.scoreForPose('miss'), 0);
}

function testVolleySuddenDeathAndDuplicate() {
  let state = Battle.startHeat(Battle.createState({ formatId: 'duel', paceId: 'volley',
    players: players(2), hardware: { width: 1280, verifiedContacts: 2 } }));
  for (let volley = 0; volley < 5; volley += 1) {
    state = Battle.recordAttempt(state, { attemptId: `t1-${volley}`, playerId: 'p1', pose: 'upright' });
    state = Battle.recordAttempt(state, { attemptId: `t2-${volley}`, playerId: 'p2', pose: 'upright' });
  }
  assert.equal(state.suddenDeath, true);
  const once = Battle.recordAttempt(state, { attemptId: 'sd-1', playerId: 'p1', pose: 'cap' });
  const duplicate = Battle.recordAttempt(once, { attemptId: 'sd-1', playerId: 'p1', pose: 'cap' });
  assert.equal(duplicate.scores.p1, once.scores.p1);
  state = Battle.recordAttempt(duplicate, { attemptId: 'sd-2', playerId: 'p2', pose: 'miss' });
  assert.equal(state.heatWins.p1, 1);
}

function testPowerChargeAndMayhemTarget() {
  let state = Battle.startHeat(Battle.createState({ formatId: 'duel', paceId: 'rush',
    powerProfileId: 'mayhem', players: players(2), seed: 91,
    hardware: { width: 1280, verifiedContacts: 2 } }));
  for (let i = 0; i < 3; i += 1) {
    state = Battle.recordAttempt(state, { attemptId: `power-${i}`, playerId: 'p1', pose: 'miss' });
  }
  assert.equal(state.charges.p1, 0);
  assert.equal(state.powerOffers.p1.length, 2);
  let targetIndex = state.powerOffers.p1.findIndex((card) => card.scope === 'target');
  if (targetIndex < 0) targetIndex = 0;
  if (state.powerOffers.p1[targetIndex].scope === 'target') {
    assert.throws(() => Battle.choosePower(state, { playerId: 'p1', index: targetIndex }), /targetId/);
    state = Battle.choosePower(state, { playerId: 'p1', index: targetIndex, targetId: 'p2' });
  } else {
    state = Battle.choosePower(state, { playerId: 'p1', index: targetIndex });
  }
  const consumed = Battle.consumePower(state, 'p1');
  assert(consumed.card);
  assert.equal(consumed.state.storedPowers.p1, null);
}

function testRushHornAndPendingLaunch() {
  let state = Battle.startHeat(Battle.createState({ formatId: 'duel', paceId: 'rush',
    players: players(2), hardware: { width: 1280, verifiedContacts: 2 } }));
  state = Battle.recordAttempt(state, { attemptId: 'score', playerId: 'p1', pose: 'upright' });
  state = Battle.markLaunch(state, 'before-horn');
  state = Battle.advanceClock(state, 60000);
  assert.equal(state.clockExpired, true);
  assert.equal(state.phase, 'active', 'pre-horn launch must finish before heat resolves');
  assert.throws(() => Battle.markLaunch(state, 'late'), /not allowed/);
  state = Battle.recordAttempt(state, { attemptId: 'before-horn', playerId: 'p2', pose: 'miss' });
  assert.equal(state.phase, 'between-heats');
  assert.equal(state.heatWins.p1, 1);
}

function testTeamRotationAndSharedScore() {
  let state = Battle.startHeat(Battle.createState({ formatId: 'team', paceId: 'rush',
    players: players(8, true), hardware: { width: 1920, verifiedContacts: 4 } }));
  assert.deepEqual(state.activePlayerIds, ['p1', 'p2', 'p5', 'p6']);
  state = Battle.recordAttempt(state, { attemptId: 'team-score', playerId: 'p1', pose: 'cap' });
  assert.equal(state.scores.a, 2);
  state = Battle.advanceClock(state, 15000);
  assert.deepEqual(state.activePlayerIds, ['p2', 'p3', 'p6', 'p7']);
}

function testVolleyFallbackCompletesEqualOpportunityBeforeClosing() {
  let state = Battle.startHeat(Battle.createState({ formatId: 'four-way', paceId: 'volley',
    players: players(4), hardware: { width: 600, verifiedContacts: 1 } }));
  assert.deepEqual(state.activePlayerIds, ['p1']);
  state = Battle.recordAttempt(state, { attemptId: 'relay-1', playerId: 'p1', pose: 'upright' });
  assert.equal(state.volleyIndex, 0);
  assert.deepEqual(state.activePlayerIds, ['p2']);
  state = Battle.recordAttempt(state, { attemptId: 'relay-2', playerId: 'p2', pose: 'upright' });
  state = Battle.recordAttempt(state, { attemptId: 'relay-3', playerId: 'p3', pose: 'miss' });
  state = Battle.recordAttempt(state, { attemptId: 'relay-4', playerId: 'p4', pose: 'miss' });
  assert.equal(state.volleyIndex, 1, 'one volley closes only after all four competitors flip');
  assert.deepEqual(state.scores, { p1: 1, p2: 1, p3: 0, p4: 0 });

  let teams = Battle.startHeat(Battle.createState({ formatId: 'team', paceId: 'volley',
    players: players(8, true), hardware: { width: 600, verifiedContacts: 1 } }));
  assert.deepEqual(teams.activePlayerIds, ['p1']);
  teams = Battle.recordAttempt(teams, { attemptId: 'team-relay-a', playerId: 'p1', pose: 'cap' });
  assert.deepEqual(teams.activePlayerIds, ['p5']);
  teams = Battle.recordAttempt(teams, { attemptId: 'team-relay-b', playerId: 'p5', pose: 'upright' });
  assert.equal(teams.volleyIndex, 1);
  assert.deepEqual(teams.activePlayerIds, ['p2'], 'larger-team representative rotates next volley');
}

function testRushTieEntersPairedSuddenDeath() {
  let state = Battle.startHeat(Battle.createState({ formatId: 'duel', paceId: 'rush',
    players: players(2), hardware: { width: 1280, verifiedContacts: 2 } }));
  state = Battle.advanceClock(state, 60000);
  assert.equal(state.suddenDeath, true);
  assert.equal(state.clockExpired, true);
  assert.deepEqual(state.activePlayerIds.slice().sort(), ['p1', 'p2']);
  state = Battle.markLaunch(state, 'rush-sd-a');
  state = Battle.markLaunch(state, 'rush-sd-b');
  state = Battle.recordAttempt(state, { attemptId: 'rush-sd-a', playerId: 'p1', pose: 'cap' });
  assert.equal(state.phase, 'active');
  state = Battle.recordAttempt(state, { attemptId: 'rush-sd-b', playerId: 'p2', pose: 'miss' });
  assert.equal(state.phase, 'between-heats');
  assert.equal(state.heatWins.p1, 1);
}

function run() {
  testConfigurationAndHardware();
  testVolleyScoringTieAndHeat();
  testVolleySuddenDeathAndDuplicate();
  testPowerChargeAndMayhemTarget();
  testRushHornAndPendingLaunch();
  testTeamRotationAndSharedScore();
  testVolleyFallbackCompletesEqualOpportunityBeforeClosing();
  testRushTieEntersPairedSuddenDeath();
  console.log('v1.12 Battle rules tests passed.');
}

run();
