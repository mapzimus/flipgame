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

  const mixedCpu = Battle.normalizeConfig({ formatId: 'four-way', players: [
    { id: 'cpu-current', cpu: true }, { id: 'cpu-legacy', ai: true },
    { id: 'cpu-capital-alias', isAI: true }, { id: 'cpu-type-alias', type: 'ai' },
  ] });
  assert.deepEqual(mixedCpu.players.map((player) => player.cpu), [true, true, true, true],
    'legacy ai/isAI/type-ai and current cpu flags normalize at the Battle boundary');
  const otherAliases = Battle.normalizeConfig({ formatId: 'four-way', players: [
    { id: 'is-cpu', isCpu: true }, { id: 'cpu-type', type: 'cpu' },
    { id: 'human-a', type: 'human' }, { id: 'human-b' },
  ] });
  assert.deepEqual(otherAliases.players.map((player) => player.cpu), [true, true, false, false]);
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

function testRushPowerOffersIgnoreCrossCompetitorResolveOrder() {
  function resolve(order) {
    let state = Battle.startHeat(Battle.createState({ formatId: 'duel', paceId: 'rush',
      powerProfileId: 'mayhem', players: players(2), seed: 349,
      hardware: { width: 1280, verifiedContacts: 2 } }));
    for (let round = 0; round < 3; round += 1) {
      for (const playerId of order) {
        state = Battle.recordAttempt(state, { attemptId: `${playerId}-${round}`,
          playerId, pose: 'miss' });
      }
    }
    return state;
  }
  const leftFirst = resolve(['p1', 'p2']);
  const rightFirst = resolve(['p2', 'p1']);
  assert.deepEqual(leftFirst.powerOffers, rightFirst.powerOffers,
    'Rush settle order cannot alter either competitor power offer');
  assert.deepEqual(leftFirst.powerOfferSequences, { p1: 1, p2: 1 });

  let team = Battle.startHeat(Battle.createState({ formatId: 'doubles', paceId: 'rush',
    players: players(4, true), hardware: { width: 1920, verifiedContacts: 4 } }));
  for (const [index, playerId] of ['p1', 'p2', 'p1', 'p2'].entries()) {
    team = Battle.recordAttempt(team, { attemptId: `team-charge-${index}`, playerId, pose: 'miss' });
  }
  assert(team.powerOffers.a);
  assert.equal(team.charges.a, 1,
    'a teammate resolving after the offer threshold still receives its qualified charge');
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
  assert.deepEqual(state.activePlayerIds, ['p3', 'p4', 'p7', 'p8'],
    'two representatives per team advance by a two-seat stride');
}

function testOneLaneDuelRushAlternatesBothPlayers() {
  let state = Battle.startHeat(Battle.createState({ formatId: 'duel', paceId: 'rush',
    players: players(2), hardware: { width: 600, verifiedContacts: 1 } }));
  assert.deepEqual(state.activePlayerIds, ['p1']);
  assert.deepEqual(Battle.powerRoundPlayerIds(state), ['p1', 'p2']);
  state = Battle.advanceClock(state, 7500);
  assert.deepEqual(state.activePlayerIds, ['p2']);
  state = Battle.advanceClock(state, 7500);
  assert.deepEqual(state.activePlayerIds, ['p1']);

  let heat = Battle.startHeat(Battle.createState({ formatId: 'duel', paceId: 'rush',
    players: players(2), hardware: { width: 600, verifiedContacts: 1 } }));
  heat = Battle.recordAttempt(heat, { attemptId: 'relay-duel-score', playerId: 'p1',
    pose: 'upright', qualifiedManual: false });
  heat = Battle.advanceClock(heat, 60000);
  heat = Battle.startHeat(heat);
  assert.deepEqual(heat.activePlayerIds, ['p2'], 'the next heat rotates the relay starter');
}

function testFourWaySuddenDeathOnlyUsesTiedLeadersInPairs() {
  let state = Battle.startHeat(Battle.createState({ formatId: 'four-way', paceId: 'volley',
    players: players(4), hardware: { width: 1920, verifiedContacts: 4 } }));
  for (let volley = 0; volley < 5; volley += 1) {
    for (const playerId of ['p1', 'p2', 'p3', 'p4']) {
      state = Battle.recordAttempt(state, { attemptId: `normal-${volley}-${playerId}`,
        playerId, pose: playerId === 'p1' || playerId === 'p2' ? 'upright' : 'miss' });
    }
  }
  assert.equal(state.suddenDeath, true);
  assert.deepEqual(state.suddenDeathCompetitorIds, ['p1', 'p2']);
  assert.deepEqual(state.volleyParticipantIds.slice().sort(), ['p1', 'p2']);
  assert.equal(state.activePlayerIds.length, 2, 'sudden death runs paired even on four-touch hardware');
  assert.throws(() => Battle.recordAttempt(state, { attemptId: 'trailer', playerId: 'p3',
    pose: 'cap' }), /not active/, 'a trailing competitor can never re-enter sudden death');

  state = Battle.recordAttempt(state, { attemptId: 'sd-tie-a', playerId: state.activePlayerIds[0],
    pose: 'miss' });
  state = Battle.recordAttempt(state, { attemptId: 'sd-tie-b', playerId: state.activePlayerIds[1],
    pose: 'miss' });
  assert.deepEqual(state.suddenDeathCompetitorIds.slice().sort(), ['p1', 'p2'],
    'a repeated tie retains only the still-tied leader set');
  const first = state.activePlayerIds[0];
  const second = state.activePlayerIds[1];
  state = Battle.recordAttempt(state, { attemptId: 'sd-win-a', playerId: first, pose: 'upright' });
  state = Battle.recordAttempt(state, { attemptId: 'sd-win-b', playerId: second, pose: 'miss' });
  assert.equal(state.heatWins[first], 1);

  let allTied = Battle.startHeat(Battle.createState({ formatId: 'four-way', paceId: 'volley',
    players: players(4), hardware: { width: 1920, verifiedContacts: 4 } }));
  for (let volley = 0; volley < 5; volley += 1) {
    for (const id of allTied.activePlayerIds.slice()) {
      allTied = Battle.recordAttempt(allTied, { attemptId: `all-tie-${volley}-${id}`,
        playerId: id, pose: 'miss' });
    }
  }
  assert.equal(allTied.suddenDeathCompetitorIds.length, 4);
  const firstPair = allTied.activePlayerIds.slice();
  for (const id of firstPair) {
    allTied = Battle.recordAttempt(allTied, { attemptId: `first-pair-${id}`,
      playerId: id, pose: 'miss' });
  }
  assert.equal(allTied.activePlayerIds.length, 2);
  assert(allTied.activePlayerIds.every((id) => !firstPair.includes(id)),
    'all tied leaders receive one attempt through fair paired batches');
  for (const id of allTied.activePlayerIds.slice()) {
    allTied = Battle.recordAttempt(allTied, { attemptId: `second-pair-${id}`,
      playerId: id, pose: 'miss' });
  }
  assert.equal(allTied.suddenDeathCompetitorIds.length, 4);
  assert.equal(allTied.activePlayerIds.length, 2, 'a repeated four-way tie opens another pair');
}

function rushExposure(teamSize, profile) {
  let state = Battle.createState({ formatId: 'team', paceId: 'rush',
    players: players(teamSize * 2, true), hardware: profile });
  const seen = new Set();
  const counts = Object.fromEntries(players(teamSize * 2, true).map((player) => [player.id, 0]));
  const interval = profile.width < 768 || profile.verifiedContacts < 2 ? 7500 : 15000;
  const windows = 60000 / interval;
  for (let heat = 0; heat < 2; heat += 1) {
    state = Battle.startHeat(state);
    for (let window = 0; window < windows; window += 1) {
      state.activePlayerIds.forEach((id) => { seen.add(id); counts[id] += 1; });
      if (window === 0) {
        const scorer = state.activePlayerIds.find((id) => Number(id.slice(1)) <= teamSize);
        if (scorer) state = Battle.recordAttempt(state, { attemptId: `rush-score-${heat}`,
          playerId: scorer, pose: 'upright', qualifiedManual: false });
      }
      state = Battle.advanceClock(state, interval);
    }
  }
  return { state, seen, counts };
}

function volleyExposure(teamSize, profile) {
  let state = Battle.createState({ formatId: 'team', paceId: 'volley',
    players: players(teamSize * 2, true), hardware: profile });
  const seen = new Set();
  const counts = Object.fromEntries(players(teamSize * 2, true).map((player) => [player.id, 0]));
  const countedVolleys = new Set();
  let sequence = 0;
  for (let heat = 0; heat < 2; heat += 1) {
    state = Battle.startHeat(state);
    while (state.phase === 'active' && !state.suddenDeath) {
      const volleyKey = `${heat}:${state.volleyIndex}`;
      if (!countedVolleys.has(volleyKey)) {
        countedVolleys.add(volleyKey);
        state.volleyParticipantIds.forEach((id) => { seen.add(id); counts[id] += 1; });
      }
      const active = state.activePlayerIds.slice();
      for (const id of active) {
        state = Battle.recordAttempt(state, { attemptId: `volley-${sequence++}-${id}`,
          playerId: id, pose: Number(id.slice(1)) <= teamSize ? 'upright' : 'miss',
          qualifiedManual: false });
      }
    }
  }
  return { state, seen, counts };
}

function testLargeTeamRotationCoverageAndFairness() {
  const profiles = [
    { width: 600, verifiedContacts: 1 },
    { width: 900, verifiedContacts: 2 },
    { width: 1920, verifiedContacts: 4 },
  ];
  for (let teamSize = 3; teamSize <= 8; teamSize += 1) {
    for (const profile of profiles) {
      for (const result of [rushExposure(teamSize, profile), volleyExposure(teamSize, profile)]) {
        assert.equal(result.seen.size, teamSize * 2,
          `${teamSize}v${teamSize} ${profile.width}px schedule must expose every player in a 2-0`);
        assert.equal(result.state.winnerId, 'a');
        for (const firstSeat of [1, teamSize + 1]) {
          const values = Array.from({ length: teamSize }, (_, offset) =>
            result.counts[`p${firstSeat + offset}`]);
          assert(Math.max(...values) - Math.min(...values) <= 1,
            `${teamSize}v${teamSize} ${profile.width}px teammate exposure must differ by at most one`);
        }
      }
    }
  }
  const relay = rushExposure(8, profiles[0]);
  assert.deepEqual(Array.from(relay.seen).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))),
    players(16, true).map((player) => player.id),
  'one-lane 8v8 alternates competitors every 7.5s and exposes all sixteen players');
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
  assert.deepEqual(teams.activePlayerIds, ['p6'],
    'the one-lane opener alternates teams while the representative cursor advances');
  teams = Battle.recordAttempt(teams, { attemptId: 'team-relay-b-opener', playerId: 'p6', pose: 'miss' });
  assert.deepEqual(teams.activePlayerIds, ['p2']);
}

function testOneLaneVolleyOpenerAndPowerOfferBarrier() {
  let state = Battle.startHeat(Battle.createState({ formatId: 'duel', paceId: 'volley',
    players: players(2), seed: 31, hardware: { width: 600, verifiedContacts: 1 } }));
  assert.deepEqual(state.activePlayerIds, ['p1']);
  for (let volley = 0; volley < 2; volley += 1) {
    const order = state.volleyParticipantIds.slice();
    assert.equal(order[0], volley === 0 ? 'p1' : 'p2',
      'the fallback opener rotates every logical volley');
    for (const playerId of order) {
      state = Battle.recordAttempt(state, { attemptId: `barrier-${volley}-${playerId}`,
        playerId, pose: 'miss' });
    }
  }
  assert.deepEqual(state.volleyParticipantIds, ['p1', 'p2']);
  state = Battle.recordAttempt(state, { attemptId: 'barrier-third-p1',
    playerId: 'p1', pose: 'miss' });
  assert.equal(state.powerOffers.p1, null,
    'an offer earned by the opener stays private during the paired logical volley');
  assert.equal(state.deferredPowerOffers.p1.length, 2);
  assert.throws(() => Battle.choosePower(state, { playerId: 'p1', index: 0 }), /No power offer/);
  state = Battle.recordAttempt(state, { attemptId: 'barrier-third-p2',
    playerId: 'p2', pose: 'miss' });
  assert.equal(state.deferredPowerOffers.p1, null);
  assert.equal(state.powerOffers.p1.length, 2,
    'the offer publishes only after both sides resolve the logical volley');
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
  testRushPowerOffersIgnoreCrossCompetitorResolveOrder();
  testRushHornAndPendingLaunch();
  testOneLaneDuelRushAlternatesBothPlayers();
  testTeamRotationAndSharedScore();
  testFourWaySuddenDeathOnlyUsesTiedLeadersInPairs();
  testLargeTeamRotationCoverageAndFairness();
  testVolleyFallbackCompletesEqualOpportunityBeforeClosing();
  testOneLaneVolleyOpenerAndPowerOfferBarrier();
  testRushTieEntersPairedSuddenDeath();
  console.log('v1.12 Battle rules tests passed.');
}

run();
