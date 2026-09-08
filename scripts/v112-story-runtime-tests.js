#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const Activity = require('../js/v112-activity.js');
const Rules = require('../js/v112-rules.js');
const Story = require('../js/v112-story.js');
const Economy = require('../js/v112-economy.js');
const Profile = require('../js/v112-profile.js');
const ProgressionRuntime = require('../js/v112-progression-runtime.js');
const View = require('../js/v112-story-view.js');
const Runtime = require('../js/v112-story-runtime.js');

let fixtureAwardId = 0;
const clone = (value) => JSON.parse(JSON.stringify(value));

function reachFixtureLevel(store, targetLevel) {
  const minimum = Math.max(0,
    Economy.fxpThresholdForLevel(targetLevel) - store.snapshot().fxp);
  if (!minimum) return;
  const rewards = [
    { rarity: 'legendary', fxp: 75 },
    { rarity: 'rare', fxp: 50 },
    { rarity: 'notable', fxp: 30 },
    { rarity: 'common', fxp: 15 },
  ];
  const reachable = Array(minimum + 76).fill(null);
  reachable[0] = [];
  for (let total = 0; total < reachable.length; total++) {
    if (!reachable[total]) continue;
    for (const reward of rewards) {
      if (total + reward.fxp < reachable.length && !reachable[total + reward.fxp]) {
        reachable[total + reward.fxp] = reachable[total].concat(reward.rarity);
      }
    }
  }
  const total = Array.from({ length: 76 }, (_, index) => minimum + index)
    .find((candidate) => reachable[candidate]);
  assert.notEqual(total, undefined, 'fixture level must be reachable by canonical achievement rewards');
  reachable[total].forEach((rarity) => {
    store.claimAchievement(`story-fixture-${++fixtureAwardId}`, rarity);
  });
  assert.ok(store.snapshot().flipLevel >= targetLevel);
}

function stateBeforeChapter(index, options = {}) {
  const prior = Story.chapters.slice(0, index);
  const chapter = Story.chapters[index];
  const preliminaries = prior.filter((entry) => entry.preliminaryId)
    .map((entry) => entry.preliminaryId);
  if (options.currentPreliminary && chapter.preliminaryId) {
    preliminaries.push(chapter.preliminaryId);
  }
  return Story.normalizeState({
    defeatedRivalIds: prior.map((entry) => entry.rivalId),
    clearedPreliminaryIds: preliminaries,
    discoveredRivalIds: prior.map((entry) => entry.rivalId).concat([chapter.rivalId]),
  });
}

function harness(options = {}) {
  const storage = options.storage || Profile.createMemoryStorage();
  const profileStore = options.profileStore || Profile.createTestStore({
    storage,
    now: options.now || (() => 112),
  });
  if (options.flipLevel) {
    reachFixtureLevel(profileStore, options.flipLevel);
  }
  const storyStore = options.storyStore || Runtime.createStoryStateStore({
    storage,
    initialState: options.storyState || Story.defaultState(),
  });
  let statsCalls = 0;
  const runtime = Runtime.createStoryRuntime({
    profileStore: options.progressionRuntime || profileStore,
    storyStore,
    statsSink() { statsCalls++; },
  });
  return { storage, profileStore, storyStore, runtime, statsCalls: () => statsCalls };
}

function human(id = 'human-1') {
  return { id, displayName: id, flipperId: 'bottle' };
}

function outcome(session, winnerIds, extra = {}) {
  const request = session.request;
  let state = Rules.createClassicState({
    matchId: request.matchId,
    players: request.roster,
    startingLives: request.rulesOptions.startingLives,
    opponentTargeting: request.rulesOptions.opponentTargeting,
    clearCondition: request.rulesOptions.clearCondition,
    physicsModeId: request.physicsModeId,
    seed: request.seed,
  });
  const status = extra.status || 'completed';
  if (status === 'completed') {
    const winners = new Set(winnerIds.map(String));
    const loserIds = request.roster.map((entry) => entry.id)
      .filter((id) => !winners.has(id));
    state = Rules.forceEliminate(state, loserIds, 'forced-elimination').state;
    assert.equal(state.phase, 'complete', 'Story test fixture must produce terminal Rules state');
  }
  return Rules.toMatchOutcomeV2(state, {
    status,
    telemetry: {
      qualifiedManualHumanFlips: extra.flips == null ? 4 : extra.flips,
      performanceMultiplier: extra.performanceMultiplier || 1,
    },
  });
}

async function win(runtime, session, humanId = 'human-1') {
  return runtime.finalize(outcome(session, [humanId]));
}

function assertPrescribedRequest(request, chapter, expected) {
  assert.equal(request.schema, 'MatchRequestV2');
  assert.equal(request.activityId, expected.source || 'story');
  assert.equal(request.formatId, 'classic');
  assert.equal(request.physicsModeId, chapter.nativeAlien ? 'alien' : 'normal');
  assert.equal(request.rulesOptions.arenaId, chapter.arenaId);
  assert.equal(request.rulesOptions.prescribedArena, true);
  assert.equal(request.activityContext.arenaId, chapter.arenaId);
  assert.equal(request.activityContext.cpuTier, chapter.cpuTier);
  assert.equal(request.activityContext.matchKind, expected.matchKind);
  assert.equal(request.rulesOptions.startingLives, expected.lives);
  assert.equal(request.roster.length, expected.humans + expected.cpus);
  assert.equal(request.roster.filter((entry) => entry.human).length, expected.humans);
  assert.equal(request.roster.filter((entry) => !entry.human).length, expected.cpus);
  assert(request.roster.every((entry) => entry.startingLives === expected.lives));
  assert.equal(request.activityContext.events.enabled, !chapter.nativeAlien);
  assert.equal(request.activityContext.events.nestedEvents, !chapter.nativeAlien);
  assert.equal(request.activityContext.events.oddsProfile, 'normal');
  assert.equal(request.activityContext.events.exactMrHoweBoost, !chapter.nativeAlien);
  if (expected.humans === 2) {
    assert.deepEqual(request.rulesOptions.opponentTargeting.alliedHumanIds, ['human-1', 'human-2']);
    assert.equal(request.rulesOptions.opponentTargeting.excludeAlliedHumans, true);
  }
}

function testAllTwelveSoloRequestContracts() {
  Story.chapters.forEach((chapter, index) => {
    if (chapter.preliminaryId) {
      const prelimHarness = harness({ storyState: stateBeforeChapter(index) });
      const request = prelimHarness.runtime.createMatchRequest({
        matchId: `solo-${chapter.id}-preliminary`,
        chapterId: chapter.id,
        humans: [human()],
        seed: 100 + index,
      });
      assertPrescribedRequest(request, chapter,
        { matchKind: 'preliminary', lives: 10, humans: 1, cpus: 7 });
      assert.equal(request.seed, 100 + index);
    }
    const signatureHarness = harness({
      storyState: stateBeforeChapter(index, { currentPreliminary: true }),
    });
    const request = signatureHarness.runtime.createMatchRequest({
      matchId: `solo-${chapter.id}-signature`,
      chapterId: chapter.id,
      humans: [human()],
      seed: 300 + index,
    });
    assertPrescribedRequest(request, chapter,
      { matchKind: 'signature', lives: 3, humans: 1, cpus: 1 });
    assert.equal(request.roster[1].id, `rival-${chapter.rivalId}`);
    assert.equal(request.roster[1].flipperId, chapter.flipperId);
    assert.equal(request.roster[1].displayName, chapter.rivalName);
  });
}

function testAllTwelveCoopRequestContracts() {
  Story.chapters.forEach((chapter, index) => {
    const people = [human('human-1'), human('human-2')];
    if (chapter.preliminaryId) {
      const prelimHarness = harness({ storyState: stateBeforeChapter(index) });
      const request = prelimHarness.runtime.createMatchRequest({
        matchId: `coop-${chapter.id}-preliminary`,
        chapterId: chapter.id,
        cooperative: true,
        humans: people,
      });
      assertPrescribedRequest(request, chapter,
        { matchKind: 'preliminary', lives: 10, humans: 2, cpus: 6 });
    }
    const signatureHarness = harness({
      storyState: stateBeforeChapter(index, { currentPreliminary: true }),
    });
    const request = signatureHarness.runtime.createMatchRequest({
      matchId: `coop-${chapter.id}-signature`,
      chapterId: chapter.id,
      cooperative: true,
      humans: people,
    });
    assertPrescribedRequest(request, chapter,
      { matchKind: 'signature', lives: 10, humans: 2, cpus: 6 });
    assert.equal(request.roster[2].id, `rival-${chapter.rivalId}`);
    assert.equal(request.roster[2].flipperId, chapter.flipperId);
    assert.deepEqual(request.rulesOptions.clearCondition.anyWinnerId, ['human-1', 'human-2']);
  });
}

async function completeCampaign(cooperative) {
  const h = harness();
  const humans = cooperative ? [human('human-1'), human('human-2')] : [human()];
  const winner = cooperative ? 'human-2' : 'human-1';
  let completedMatches = 0;
  for (const chapter of Story.chapters) {
    if (chapter.preliminaryId) {
      const session = h.runtime.start({
        matchId: `${cooperative ? 'coop' : 'solo'}:campaign:${chapter.id}:prelim`,
        chapterId: chapter.id,
        cooperative,
        humans,
      });
      assert.equal(session.request.activityContext.matchKind, 'preliminary');
      const resolution = await win(h.runtime, session, winner);
      assert.equal(resolution.activityResolution.success, true);
      completedMatches++;
    }
    const session = h.runtime.start({
      matchId: `${cooperative ? 'coop' : 'solo'}:campaign:${chapter.id}:signature`,
      chapterId: chapter.id,
      cooperative,
      humans,
    });
    assert.equal(session.request.activityContext.matchKind, 'signature');
    const resolution = await win(h.runtime, session, winner);
    assert.equal(resolution.activityResolution.success, true);
    completedMatches++;
  }
  const storyState = h.storyStore.snapshot();
  const profile = h.profileStore.snapshot();
  assert.equal(completedMatches, 17);
  assert.equal(storyState.clearedPreliminaryIds.length, 5);
  assert.equal(storyState.defeatedRivalIds.length, 12);
  assert.equal(storyState.clearedChapterIds.length, 12);
  assert.deepEqual(storyState.completedActIds, ['1', '2', '3', '4']);
  assert.equal(storyState.campaignCompleted, true);
  assert.equal(storyState.alienDefeated, true);
  assert.equal(profile.defeatedRivalIds.length, 12);
  assert.deepEqual(profile.completedActIds, ['1', '2', '3', '4']);
  assert.deepEqual(profile.fieldNoteIds,
    ['field-note-act-1', 'field-note-act-2', 'field-note-act-3', 'field-note-act-4']);
  assert.equal(profile.consumedMatchOrdinal, 17,
    'each of the 17 eligible Story matches consumes one exact local reservation');
  assert.equal(profile.activeMatchReservation, null);
  assert.equal(profile.processedClaimIds.filter((id) => /^rival\./.test(id)).length, 12);
  assert.equal(profile.processedClaimIds.filter((id) => /^story\.act\./.test(id)).length, 4);
  assert.equal(profile.ownedObjectIds.includes('trex'), true);
  assert.equal(profile.ownedObjectIds.includes('alien'), profile.flipLevel >= 100,
    'Alien victory banks until the level gate is also satisfied');
  return h;
}

async function testCompleteSoloAndCoopCampaigns() {
  const solo = await completeCampaign(false);
  const coop = await completeCampaign(true);
  assert.equal(solo.runtime.views().hub.completionLine,
    'FIELD STABLE. SIGNAL QUIET. REMATCH AVAILABLE.');
  assert.equal(coop.runtime.views().hub.completed, true);
}

async function testRivalBoardSharedClearAndPreliminaryGate() {
  const h = harness({ flipLevel: 13 });
  const beforeBoardReward = h.profileStore.snapshot();
  const board = h.runtime.start({
    matchId: 'board:first-light:first-clear',
    activityId: 'rival-board',
    rivalId: 'first-light',
    humans: [human()],
  });
  assertPrescribedRequest(board.request, Story.chapters[0],
    { source: 'rival-board', matchKind: 'signature', lives: 3, humans: 1, cpus: 1 });
  const boardResult = await win(h.runtime, board);
  assert.equal(boardResult.activityResolution.success, true);
  assert.equal(boardResult.activityResolution.ordinaryRewardsEligible, false);
  assert.equal(boardResult.transaction.profileCommands[0].input.ordinaryRewardsEligible, false);
  assert.equal(Object.prototype.hasOwnProperty.call(
    boardResult.transaction.profileCommands[0].input, 'matchClaimToken'), false);
  assert.equal(h.storyStore.snapshot().defeatedRivalIds.includes('first-light'), true);
  assert.equal(h.storyStore.snapshot().clearedChapterIds.includes('first-broadcast'), false,
    'Board victory cannot skip an attached WFC preliminary');
  assert.equal(h.profileStore.snapshot().consumedMatchOrdinal, 0,
    'Rival Board never reserves or grants ordinary match FXP/FC');
  assert.equal(h.profileStore.snapshot().fxp - beforeBoardReward.fxp, 25,
    'Rival Board applies only its finite canonical first-clear FXP');
  assert.equal(h.profileStore.snapshot().fcBalance - beforeBoardReward.fcBalance, 15,
    'Rival Board applies only its finite canonical first-clear FC');

  const prelim = h.runtime.start({
    matchId: 'story:first-broadcast:required-prelim',
    chapterId: 'first-broadcast',
    humans: [human()],
  });
  assert.equal(prelim.request.activityContext.matchKind, 'preliminary');
  const prelimResult = await win(h.runtime, prelim);
  assert.equal(prelimResult.activityResolution.newlyClearedChapterIds.includes('first-broadcast'), true);
  assert.equal(prelimResult.activityResolution.rewards.some((reward) =>
    reward.type === 'rival-first-clear'), false, 'shared rival reward is not duplicated');
  assert.equal(Story.nextChapter(h.storyStore.snapshot()).id, 'scatterline');

  const scatterBoard = h.runtime.start({
    matchId: 'board:scatterline:first-clear',
    activityId: 'rival-board',
    rivalId: 'scatterline',
    humans: [human()],
  });
  await win(h.runtime, scatterBoard);
  assert.equal(h.storyStore.snapshot().clearedChapterIds.includes('scatterline'), true,
    'Board victory skips a signature when no preliminary remains');
  assert.equal(Story.nextChapter(h.storyStore.snapshot()).id, 'lane-09');
}

async function testEarlyAlienVictoryBanksUntilFlipLevelOneHundred() {
  const h = harness({ storyState: stateBeforeChapter(11) });
  const session = h.runtime.start({
    matchId: 'story:visitor-zero:early',
    chapterId: 'visitor-zero',
    humans: [human()],
  });
  assert.equal(session.request.physicsModeId, 'alien');
  assert.equal(session.request.activityContext.events.enabled, false);
  await win(h.runtime, session);
  const banked = h.profileStore.snapshot();
  assert.equal(banked.defeatedRivalIds.includes('visitor-zero'), true);
  assert.equal(banked.flipLevel < 100, true);
  assert.equal(banked.ownedObjectIds.includes('alien'), false);
  assert.equal(h.runtime.views().alienGate.locked, true);

  reachFixtureLevel(h.profileStore, 100);
  const released = h.profileStore.snapshot();
  assert.equal(released.flipLevel, 100);
  assert.equal(released.ownedObjectIds.includes('alien'), true);
  assert.equal(released.featureIds.includes('insane-mode'), true);
  assert.equal(h.runtime.views().alienGate.available, true);
}

async function testDuplicateReplayAndRetryNeverDoubleReward() {
  const h = harness({
    storyState: stateBeforeChapter(1),
  });
  const first = h.runtime.start({
    matchId: 'story:scatterline:first', chapterId: 'scatterline', humans: [human()],
  });
  const [a, b] = await Promise.all([
    win(h.runtime, first),
    win(h.runtime, first),
  ]);
  assert.deepEqual(a, b, 'concurrent finalize calls share one finalization');
  const afterFirst = h.profileStore.snapshot();
  assert.equal(afterFirst.consumedMatchOrdinal, 1);
  assert.equal(afterFirst.processedClaimIds.filter((id) => id === 'rival.scatterline.first-clear').length, 1);
  const storyAfterFirst = h.storyStore.snapshot();

  const replay = h.runtime.start({
    matchId: 'story:scatterline:replay', chapterId: 'scatterline', humans: [human()],
  });
  assert.equal(replay.request.activityContext.replay, true);
  const replayResult = await win(h.runtime, replay);
  assert.equal(replayResult.transaction.noRewardsReason, 'replay');
  assert.equal(replayResult.transaction.profileCommands.length, 0);
  assert.deepEqual(h.profileStore.snapshot(), afterFirst,
    'a replay cannot grant profile progression');
  assert.deepEqual(h.storyStore.snapshot(), storyAfterFirst,
    'a successful replay cannot advance Story, rival, checkpoint, or attempt state');

  const restartedStore = Runtime.createStoryStateStore({ storage: h.storage });
  const restarted = Runtime.createStoryRuntime({
    storyStore: restartedStore,
    profileStore: h.profileStore,
  });
  const duplicate = restarted.start({
    matchId: 'story:scatterline:first', chapterId: 'scatterline', humans: [human()],
  });
  const duplicateResult = await win(restarted, duplicate);
  assert.equal(duplicateResult.duplicate, true);
  assert.equal(duplicateResult.transaction.profileCommands.length, 0);
  assert.deepEqual(h.profileStore.snapshot(), afterFirst);
}

async function testProfileRetryIsExactlyOnce() {
  const storage = Profile.createMemoryStorage();
  const realProfile = Profile.createTestStore({ storage, now: () => 900 });
  let failAtomicResolution = true;
  const profileProxy = {
    snapshot: realProfile.snapshot,
    reserveMatch: realProfile.reserveMatch,
    resumeMatchReservation: realProfile.resumeMatchReservation,
    consumeReservedMatch: realProfile.consumeReservedMatch,
    abandonReservedMatch: realProfile.abandonReservedMatch,
    claimStoryMatchResolution(input) {
      if (failAtomicResolution) {
        failAtomicResolution = false;
        return { applied: false, duplicate: false, reason: 'persistence-failed' };
      }
      return realProfile.claimStoryMatchResolution(input);
    },
  };
  const storyStore = Runtime.createStoryStateStore({
    storage,
    initialState: stateBeforeChapter(1),
  });
  const runtime = Runtime.createStoryRuntime({ profileStore: profileProxy, storyStore });
  const session = runtime.start({
    matchId: 'story:retry:scatterline', chapterId: 'scatterline', humans: [human()],
  });
  await assert.rejects(() => win(runtime, session), /persistence-failed/);
  assert.equal(realProfile.snapshot().consumedMatchOrdinal, 0,
    'ordinary and first-clear rewards must both roll back after a failed atomic write');
  assert.equal(realProfile.snapshot().activeMatchReservation.matchId,
    'story:retry:scatterline', 'the failed finalization retains the exact reservation');
  assert.equal(realProfile.snapshot().processedClaimIds.includes(
    'rival.scatterline.first-clear'), false,
  'the rival component cannot commit separately from its match reward');
  assert.equal(storyStore.snapshot().defeatedRivalIds.includes('scatterline'), false,
    'Story state waits until all profile commands are durable');
  const recovered = await win(runtime, session);
  assert.equal(recovered.activityResolution.success, true);
  assert.equal(realProfile.snapshot().consumedMatchOrdinal, 1);
  assert.equal(realProfile.snapshot().activeMatchReservation, null);
  assert.equal(realProfile.snapshot().processedClaimIds.filter((id) =>
    id === 'rival.scatterline.first-clear').length, 1);
  assert.equal(storyStore.snapshot().defeatedRivalIds.includes('scatterline'), true);
}

async function testStoryPersistenceRetryUsesConsumedTokenWithoutReaward() {
  const backing = Profile.createMemoryStorage();
  let failStoryWrite = false;
  const storage = {
    getItem(key) { return backing.getItem(key); },
    setItem(key, value) {
      if (key === Runtime.storageKey && failStoryWrite) {
        failStoryWrite = false;
        throw new Error('temporary Story write failure');
      }
      backing.setItem(key, value);
    },
    removeItem(key) { backing.removeItem(key); },
  };
  const profileStore = Profile.createTestStore({ storage, now: () => 901 });
  const storyStore = Runtime.createStoryStateStore({
    storage, initialState: stateBeforeChapter(1),
  });
  const runtime = Runtime.createStoryRuntime({ profileStore, storyStore });
  const session = runtime.start({
    matchId: 'story:retry-story-store', chapterId: 'scatterline', humans: [human()],
  });
  failStoryWrite = true;
  await assert.rejects(() => win(runtime, session), /Story state persistence failed/);
  const profileAfterReward = profileStore.snapshot();
  assert.equal(profileAfterReward.consumedMatchOrdinal, 1,
    'the profile transaction is already durable when the later Story write fails');
  assert.equal(profileAfterReward.activeMatchReservation, null);
  assert.equal(profileAfterReward.defeatedRivalIds.includes('scatterline'), true);
  assert.equal(storyStore.snapshot().defeatedRivalIds.includes('scatterline'), false);
  assert.throws(() => runtime.start({
    matchId: 'story:must-wait-for-retry', chapterId: 'scatterline', humans: [human()],
  }), /Finish or leave the active Story match/,
  'a later Story match cannot strand or replace an unresolved owning-store retry');
  assert.equal(profileStore.snapshot().activeMatchReservation, null,
    'the blocked later match cannot create a competing entitlement');

  const recovered = await win(runtime, session);
  assert.equal(recovered.activityResolution.success, true);
  assert.deepEqual(profileStore.snapshot(), profileAfterReward,
    'retrying with the same consumed token cannot duplicate FXP, FC, or ownership');
  assert.equal(storyStore.snapshot().defeatedRivalIds.includes('scatterline'), true);
}

async function testLossAndAbandonmentHaveNoClearPenalty() {
  const h = harness();
  const earnedBeforeAbandon = h.profileStore.snapshot();
  const abandoned = h.runtime.start({
    matchId: 'story:abandon', chapterId: 'first-broadcast', humans: [human()],
  });
  const afterStart = h.storyStore.snapshot();
  assert.equal(h.profileStore.snapshot().activeMatchReservation.matchId, abandoned.matchId);
  const abandonedResult = h.runtime.abandon(abandoned.matchId, 'owner-left');
  assert.equal(abandonedResult.activityResolution.abandoned, true);
  assert.deepEqual(h.storyStore.snapshot(), afterStart);
  const afterAbandon = h.profileStore.snapshot();
  assert.equal(afterAbandon.fxp, earnedBeforeAbandon.fxp);
  assert.equal(afterAbandon.fcBalance, earnedBeforeAbandon.fcBalance);
  assert.equal(afterAbandon.activeMatchReservation, null);
  assert.equal(afterAbandon.consumedMatchOrdinal, 1);
  await assert.rejects(() => win(h.runtime, abandoned), /not active/);

  const finalizedAbandon = h.runtime.start({
    matchId: 'story:outcome-abandon', chapterId: 'first-broadcast', humans: [human()],
  });
  const abandonedPost = await h.runtime.finalize(outcome(finalizedAbandon, [], {
    status: 'abandoned', completionReason: 'app-backgrounded',
  }));
  assert.equal(abandonedPost.activityResolution.abandoned, true);
  assert.equal(abandonedPost.transaction.profileCommands.length, 0);
  assert.equal(h.storyStore.snapshot().resolvedAttemptIds.length, 0);

  const lossSession = h.runtime.start({
    matchId: 'story:loss', chapterId: 'first-broadcast', humans: [human()],
  });
  const lossResult = await h.runtime.finalize(outcome(lossSession, ['cpu-first-broadcast-1']));
  assert.equal(lossResult.activityResolution.success, false);
  assert.equal(h.storyStore.snapshot().clearedPreliminaryIds.length, 0);
  assert.equal(h.storyStore.snapshot().defeatedRivalIds.length, 0);
  assert.equal(lossResult.transaction.profileCommands[0].kind, 'claimStoryMatchResolution',
    'a completed, qualified Story loss still earns ordinary participation progression');
  assert.equal(Object.prototype.hasOwnProperty.call(
    lossResult.transaction.profileCommands[0].input, 'matchClaimToken'), false,
  'the private reservation token never enters the returned command log');
}

async function testOwnerModeIsEphemeralTestDataAcrossStory() {
  const storage = Profile.createMemoryStorage();
  const profileStore = Profile.createTestStore({ storage, now: () => 1200 });
  const progressionRuntime = ProgressionRuntime.createTestRuntime({ profileStore });
  assert.equal(progressionRuntime.activateOwnerTestMode('Howe Test Mode').activated, true);
  const storyStore = Runtime.createStoryStateStore({ storage });
  const beforeProfile = profileStore.snapshot();
  const beforeStory = storyStore.snapshot();
  let statsPayload = null;
  const runtime = Runtime.createStoryRuntime({ progressionRuntime, storyStore,
    statsSink(payload) { statsPayload = payload; } });
  const session = runtime.start({
    matchId: 'owner-test:story:first-light', chapterId: 'first-broadcast', humans: [human()],
  });
  assert.equal(profileStore.snapshot().activeMatchReservation, null,
    'owner-test Story never reserves a reward-bearing match');
  assert.doesNotMatch(JSON.stringify(session), /MatchClaimTokenV1|match-nonce/);
  progressionRuntime.deactivateOwnerTestMode();
  const result = await win(runtime, session);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(result.transaction.noRewardsReason, 'owner-test-mode');
  assert.equal(result.transaction.profileCommands.length, 0);
  assert.deepEqual(profileStore.snapshot(), beforeProfile,
    'owner projection and Story simulation cannot mutate earned progression');
  assert.deepEqual(storyStore.snapshot().clearedChapterIds, beforeStory.clearedChapterIds,
    'owner-test Story cannot clear campaign progression');
  assert.deepEqual(storyStore.snapshot().defeatedRivalIds, beforeStory.defeatedRivalIds);
  assert.deepEqual(storyStore.snapshot().resolvedAttemptIds, beforeStory.resolvedAttemptIds);
  assert.doesNotMatch(JSON.stringify(result), /MatchClaimTokenV1|match-nonce/);
  assert.doesNotMatch(JSON.stringify(statsPayload), /MatchClaimTokenV1|match-nonce/);
  assert.equal(statsPayload.outcome.activityState.testData, true);
  assert.equal(statsPayload.outcome.activityState.ownerTestMode, true,
    'the authenticated start policy remains the authoritative marker after a UI toggle');
  assert.equal(statsPayload.outcome.activityState.statisticsDefaultEligible, false);
  progressionRuntime.close();
}

function testStoryStateBoundsAreExactAndPreflighted() {
  let touched = false;
  const oversizedReceipts = [];
  oversizedReceipts.length = 1001;
  Object.defineProperty(oversizedReceipts, 0, {
    get() { touched = true; throw new Error('element traversal must not happen'); },
  });
  assert.throws(() => Story.normalizeState({ resolvedAttemptIds: oversizedReceipts }),
    /1000-entry limit/);
  assert.equal(touched, false, 'receipt cardinality is rejected before reading any element');

  const earlierField = ['first-light'];
  Object.defineProperty(earlierField, 0, {
    get() { touched = true; throw new Error('no Story array may be traversed before preflight'); },
  });
  assert.throws(() => Story.normalizeState({
    defeatedRivalIds: earlierField, resolvedAttemptIds: oversizedReceipts,
  }), /1000-entry limit/);
  assert.equal(touched, false,
    'all StoryStateV1 collection bounds are checked before any collection traversal');

  const oversizedClaims = [];
  oversizedClaims.length = 17;
  Object.defineProperty(oversizedClaims, 0, {
    get() { touched = true; throw new Error('claim traversal must not happen'); },
  });
  assert.throws(() => Story.normalizeState({ claimedRewardIds: oversizedClaims }),
    /16-entry limit/);
  assert.equal(touched, false, 'claim cardinality is rejected before reading any element');
  assert.throws(() => Story.normalizeState({ defeatedRivalIds: ['not-a-rival'] }), /unknown ID/);
  assert.throws(() => Story.normalizeState({ resolvedAttemptIds: ['same', 'same'] }), /duplicate/);
  assert.throws(() => Story.normalizeState({ resolvedAttemptIds: [7] }), /safe string/);
  const accessorReceipts = ['safe-receipt'];
  Object.defineProperty(accessorReceipts, 0, {
    get() { touched = true; throw new Error('accessor entry must not execute'); },
  });
  assert.throws(() => Story.normalizeState({ resolvedAttemptIds: accessorReceipts }),
    /ordinary data properties/);
  assert.equal(touched, false, 'bounded Story arrays reject accessors without invoking them');
  const accessorState = clone(Story.defaultState());
  Object.defineProperty(accessorState, 'lastCheckpoint', {
    enumerable: true,
    get() { touched = true; throw new Error('state accessor must not execute'); },
  });
  assert.throws(() => Story.validateState(accessorState), /ordinary data properties/);
  assert.equal(touched, false, 'Story state fields reject accessors without invoking them');
  const symbolState = clone(Story.defaultState());
  symbolState[Symbol('hidden')] = true;
  assert.throws(() => Story.validateState(symbolState), /symbol fields/);
  const nonEnumerableState = clone(Story.defaultState());
  Object.defineProperty(nonEnumerableState, 'hidden', { value: true });
  assert.throws(() => Story.validateState(nonEnumerableState), /Unknown StoryStateV1 field/);
  assert.throws(() => Story.mergeAttemptReceipts([], oversizedReceipts), /1000-entry limit/,
    'the exported receipt merger preserves the same pre-allocation boundary');
  assert.throws(() => Story.normalizeState({ unboundedHistory: [] }), /Unknown StoryStateV1 field/);

  const inconsistent = clone(Story.defaultState());
  inconsistent.campaignCompleted = true;
  assert.throws(() => Story.validateState(inconsistent), /derived progression/);
  const unknownField = { ...clone(Story.defaultState()), attackerField: true };
  assert.throws(() => Story.validateState(unknownField), /Unknown StoryStateV1 field/);

  const receipts = Array.from({ length: 1000 }, (_, index) => `bounded-receipt-${index}`);
  const full = Story.normalizeState({ resolvedAttemptIds: receipts });
  const attempt = Story.prepareAttempt(full, {
    attemptId: 'bounded-receipt-new', chapterId: 'first-broadcast',
    matchKind: 'preliminary', alliedHumanIds: ['human-1'],
  });
  const resolved = Story.resolveAttempt(full, attempt,
    { status: 'completed', winnerIds: ['cpu-1'] });
  assert.equal(resolved.state.resolvedAttemptIds.length, 1000);
  assert.equal(resolved.state.resolvedAttemptIds[0], 'bounded-receipt-1');
  assert.equal(resolved.state.resolvedAttemptIds.at(-1), 'bounded-receipt-new');
}

function testStoryAttemptSchemaIsExactAndRederived() {
  const state = Story.defaultState();
  const valid = Story.prepareAttempt(state, {
    attemptId: 'attempt:exact-validator', chapterId: 'first-broadcast',
    matchKind: 'preliminary', alliedHumanIds: ['human-1'], seed: 123,
  });
  assert.deepEqual(Story.validateAttempt(state, valid), valid);
  const mutations = [
    { ...valid, injected: true },
    { ...valid, source: 'rival-board' },
    { ...valid, chapterId: 'scatterline' },
    { ...valid, rivalId: 'scatterline' },
    { ...valid, matchKind: 'signature' },
    { ...valid, cooperative: 0 },
    { ...valid, alliedHumanIds: [7] },
    { ...valid, rosterTemplate: { ...valid.rosterTemplate, lives: 9 } },
    { ...valid, rosterTemplate: { ...valid.rosterTemplate, extra: true } },
    { ...valid, arenaId: 'baseline-table' },
    { ...valid, cpuTier: 2 },
    { ...valid, physicsModeId: 'alien' },
    { ...valid, eventsEnabled: false },
    { ...valid, seed: '123' },
  ];
  mutations.forEach((attempt, index) => {
    assert.throws(() => Story.validateAttempt(state, attempt), undefined,
      `forged StoryAttemptV1 mutation ${index + 1} must fail closed`);
  });
  assert.throws(() => Story.resolveAttempt(state, { ...valid, injected: true }, {
    status: 'completed', winnerIds: ['human-1'],
  }), /exact schema/,
  'resolveAttempt always revalidates even objects already labeled StoryAttemptV1');
  let touched = false;
  const accessorAttempt = clone(valid);
  Object.defineProperty(accessorAttempt, 'cpuTier', {
    enumerable: true,
    get() { touched = true; throw new Error('attempt accessor must not execute'); },
  });
  assert.throws(() => Story.validateAttempt(state, accessorAttempt), /ordinary data properties/);
  assert.equal(touched, false, 'StoryAttemptV1 top-level accessors are never invoked');
  const accessorAllies = clone(valid);
  Object.defineProperty(accessorAllies.alliedHumanIds, 0, {
    get() { touched = true; throw new Error('allied accessor must not execute'); },
  });
  assert.throws(() => Story.validateAttempt(state, accessorAllies), /ordinary data properties/);
  assert.equal(touched, false, 'StoryAttemptV1 allied ID accessors are never invoked');
  const symbolAttempt = clone(valid);
  symbolAttempt[Symbol('hidden')] = true;
  assert.throws(() => Story.validateAttempt(state, symbolAttempt), /symbol fields/);
}

function testStoryPersistenceUsesExactReadbackAndFailsClosedOnDivergence() {
  const backing = Profile.createMemoryStorage();
  let throwAfterMainWrite = true;
  const writeThenThrow = {
    getItem(key) { return backing.getItem(key); },
    setItem(key, value) {
      backing.setItem(key, value);
      if (key === Runtime.storageKey && throwAfterMainWrite) {
        throwAfterMainWrite = false;
        throw new Error('adapter reported failure after exact write');
      }
    },
    removeItem(key) { backing.removeItem(key); },
  };
  const store = Runtime.createStoryStateStore({ storage: writeThenThrow });
  assert.doesNotThrow(() => store.discoverRival('first-light'),
    'exact readback wins when an adapter throws after committing the requested bytes');
  const restarted = Runtime.createStoryStateStore({ storage: writeThenThrow });
  assert.equal(restarted.snapshot().discoveredRivalIds.includes('first-light'), true);

  const sameRevision = JSON.parse(backing.getItem(Runtime.storageKey));
  sameRevision.discoveredRivalIds = ['scatterline'];
  backing.setItem(Runtime.storageKey, JSON.stringify(sameRevision));
  assert.throws(() => store.refresh(), /equal-revision divergence/);
  assert.throws(() => store.snapshot(), /equal-revision divergence/,
    'a diverged store remains poisoned instead of overwriting external state');

  const uncertainBacking = Profile.createMemoryStorage();
  let replaceCandidate = true;
  const writesDifferentThenThrows = {
    getItem(key) { return uncertainBacking.getItem(key); },
    setItem(key, value) {
      if (key === Runtime.storageKey && replaceCandidate) {
        replaceCandidate = false;
        const foreign = JSON.parse(value);
        foreign.discoveredRivalIds = ['meridian'];
        uncertainBacking.setItem(key, JSON.stringify(foreign));
        throw new Error('different valid bytes were written');
      }
      uncertainBacking.setItem(key, value);
    },
    removeItem(key) { uncertainBacking.removeItem(key); },
  };
  const uncertain = Runtime.createStoryStateStore({ storage: writesDifferentThenThrows });
  assert.throws(() => uncertain.discoverRival('first-light'), /candidate write diverged/);
  assert.throws(() => Runtime.createStoryStateStore({ storage: writesDifferentThenThrows }),
    /journal and durable state diverged/,
    'restart refuses to bless bytes that match neither side of the prepared journal');

  const malformed = Profile.createMemoryStorage();
  malformed.setItem(Runtime.storageKey, JSON.stringify({ schema: 'StoryStateV1',
    runtimeRevision: 1, resolvedAttemptIds: [] }));
  assert.throws(() => Runtime.createStoryStateStore({ storage: malformed }), /invalid schema/);
}

async function testImportedCompletionCanRecoverCanonicalRewards() {
  const actOneAhead = Story.normalizeState({
    clearedPreliminaryIds: ['wfc-qualifier'],
    defeatedRivalIds: ['first-light', 'scatterline', 'meridian'],
    discoveredRivalIds: ['first-light', 'scatterline', 'meridian'],
  });
  const h = harness({ storyState: actOneAhead });
  const before = h.profileStore.snapshot();
  const session = h.runtime.start({
    matchId: 'story:imported-ahead:lane-09', chapterId: 'lane-09', humans: [human()],
  });
  assert.equal(session.request.activityContext.storyReplay, true);
  assert.equal(session.request.activityContext.rewardRecovery, true);
  assert.equal(session.request.activityContext.replay, false,
    'reward repair is not mislabeled as an Activity-wide no-claim replay');
  const repaired = await win(h.runtime, session);
  const after = h.profileStore.snapshot();
  assert.equal(after.fxp - before.fxp, 75, 'missing rival and act rewards are repaired exactly once');
  assert.equal(after.fcTransactions.filter((entry) =>
    entry.sourceType === 'rival' || entry.sourceType === 'story-act')
    .reduce((sum, entry) => sum + entry.signedAmount, 0), 40,
  'canonical component transactions contain exactly 15 + 25 FC; level FC remains separate');
  assert.ok(after.fcBalance - before.fcBalance >= 40);
  assert.equal(after.rewardedRivalIds.includes('meridian'), true);
  assert.equal(after.rewardedActIds.includes('1'), true);
  assert.equal(repaired.transaction.commandResults[0].result.ordinaryReward.eligible, false,
    'repair consumes its immutable match receipt without awarding replay match FXP');
  assert.equal(h.storyStore.snapshot().claimedRewardIds.includes(
    'rival.meridian.first-clear'), true);
  assert.equal(h.storyStore.snapshot().claimedRewardIds.includes(
    'story.act.1.first-clear'), true);

  const stable = clone(after);
  const normalReplay = h.runtime.start({
    matchId: 'story:imported-ahead:lane-09:again', chapterId: 'lane-09', humans: [human()],
  });
  assert.equal(normalReplay.request.activityContext.replay, true);
  await win(h.runtime, normalReplay);
  assert.deepEqual(h.profileStore.snapshot(), stable,
    'once evidence exists, an ordinary Story replay cannot pay or consume another receipt');
}

async function testCrossKeyFinalizationJournalRecoversCommittedStoryMatch() {
  const backing = Profile.createMemoryStorage();
  let failNextStoryStateWrite = false;
  const storage = {
    getItem(key) { return backing.getItem(key); },
    setItem(key, value) {
      if (key === Runtime.storageKey && failNextStoryStateWrite) {
        failNextStoryStateWrite = false;
        throw new Error('crash before Story state write');
      }
      backing.setItem(key, value);
    },
    removeItem(key) { backing.removeItem(key); },
  };
  const profileStore = Profile.createTestStore({ storage, now: () => 1600 });
  const storyStore = Runtime.createStoryStateStore({ storage });
  const runtime = Runtime.createStoryRuntime({ profileStore, storyStore });
  const session = runtime.start({
    matchId: 'story:cross-key:preliminary', chapterId: 'first-broadcast', humans: [human()],
  });
  failNextStoryStateWrite = true;
  await assert.rejects(() => win(runtime, session), /Story state persistence failed/);
  const profileAfterCommit = clone(profileStore.snapshot());
  assert.equal(profileAfterCommit.matchReceipts.some((receipt) =>
    receipt.matchId === session.matchId && receipt.resolution === 'consumed'), true);
  const intentRaw = backing.getItem(`${Runtime.storageKey}.finalization`);
  assert.notEqual(intentRaw, null,
    'the bounded intent survives the Profile/Story crash window');
  const intent = JSON.parse(intentRaw);
  const receipt = profileAfterCommit.matchReceipts.find((entry) =>
    entry.matchId === session.matchId);
  assert.equal(intent.profileLineageId, profileAfterCommit.lineageId);
  assert.equal(intent.receiptOrdinal, receipt.ordinal,
    'recovery binds to the exact immutable Profile receipt ordinal');
  assert.equal(Object.prototype.hasOwnProperty.call(intent, 'nonce'), false);
  assert.doesNotMatch(intentRaw, /match-nonce|MatchClaimTokenV1/,
    'the durable cross-key journal never persists the private bearer token');

  const restartedProfile = Profile.createTestStore({ storage, now: () => 1601 });
  const restartedStory = Runtime.createStoryStateStore({ storage });
  const restartedRuntime = Runtime.createStoryRuntime({
    profileStore: restartedProfile, storyStore: restartedStory,
  });
  assert.equal(restartedRuntime.finalizationRecovery.recovered, true);
  assert.equal(restartedStory.snapshot().clearedPreliminaryIds.includes('wfc-qualifier'), true);
  assert.equal(backing.getItem(`${Runtime.storageKey}.finalization`), null);
  assert.deepEqual(restartedProfile.snapshot(), profileAfterCommit,
    'Story recovery reads the receipt and never re-awards the Profile transaction');
}

async function testCrossKeyJournalRecoversRivalBoardAndDiscardsUncommittedIntent() {
  const backing = Profile.createMemoryStorage();
  let failStoryWrite = false;
  const storage = {
    getItem(key) { return backing.getItem(key); },
    setItem(key, value) {
      if (key === Runtime.storageKey && failStoryWrite) {
        failStoryWrite = false;
        throw new Error('rival Story write interrupted');
      }
      backing.setItem(key, value);
    },
    removeItem(key) { backing.removeItem(key); },
  };
  const profile = Profile.createTestStore({ storage, now: () => 1700 });
  const discovered = Story.discoverForLevel(Story.defaultState(), 5).state;
  const story = Runtime.createStoryStateStore({ storage, initialState: discovered });
  const runtime = Runtime.createStoryRuntime({ profileStore: profile, storyStore: story });
  const board = runtime.start({
    matchId: 'rival:cross-key:first-light', activityId: 'rival-board',
    rivalId: 'first-light', humans: [human()],
  });
  failStoryWrite = true;
  await assert.rejects(() => win(runtime, board), /Story state persistence failed/);
  assert.equal(profile.snapshot().rewardedRivalIds.includes('first-light'), true);
  const restarted = Runtime.createStoryRuntime({
    profileStore: Profile.createTestStore({ storage, now: () => 1701 }),
    storyStore: Runtime.createStoryStateStore({ storage }),
  });
  assert.equal(restarted.finalizationRecovery.recovered, true,
    'canonical rewardedRivalIds proves a component-only Board transaction');
  assert.equal(restarted.story.snapshot().defeatedRivalIds.includes('first-light'), true);
  assert.equal(restarted.story.snapshot().clearedChapterIds.includes('first-broadcast'), false,
    'Board recovery still cannot skip the attached WFC preliminary');

  const uncommittedBacking = Profile.createMemoryStorage();
  const rawProfile = Profile.createTestStore({ storage: uncommittedBacking, now: () => 1800 });
  let failProfile = true;
  const profileProxy = {
    snapshot: rawProfile.snapshot,
    reserveMatch: rawProfile.reserveMatch,
    resumeMatchReservation: rawProfile.resumeMatchReservation,
    consumeReservedMatch: rawProfile.consumeReservedMatch,
    abandonReservedMatch: rawProfile.abandonReservedMatch,
    claimStoryMatchResolution(input) {
      if (failProfile) { failProfile = false; return { applied: false, reason: 'persistence-failed' }; }
      return rawProfile.claimStoryMatchResolution(input);
    },
  };
  const uncommittedStory = Runtime.createStoryStateStore({ storage: uncommittedBacking });
  const failingRuntime = Runtime.createStoryRuntime({
    profileStore: profileProxy, storyStore: uncommittedStory,
  });
  const unfinished = failingRuntime.start({
    matchId: 'story:uncommitted-intent', chapterId: 'first-broadcast', humans: [human()],
  });
  await assert.rejects(() => win(failingRuntime, unfinished), /persistence-failed/);
  assert.notEqual(uncommittedBacking.getItem(`${Runtime.storageKey}.finalization`), null);
  const recoveryRuntime = Runtime.createStoryRuntime({
    profileStore: rawProfile,
    storyStore: Runtime.createStoryStateStore({ storage: uncommittedBacking }),
  });
  assert.equal(recoveryRuntime.finalizationRecovery.discarded, true);
  assert.equal(rawProfile.snapshot().matchReceipts.some((receipt) =>
    receipt.matchId === unfinished.matchId && receipt.resolution === 'abandoned'), true,
  'an intent without a consumed receipt is cancelled, never promoted to Story progress');
  assert.equal(recoveryRuntime.story.snapshot().clearedPreliminaryIds.length, 0);
  assert.equal(uncommittedBacking.getItem(`${Runtime.storageKey}.finalization`), null);
}

async function testCrossKeyJournalRejectsLineageAndReceiptSubstitution() {
  async function crashedFixture(label) {
    const backing = Profile.createMemoryStorage();
    let failStoryWrite = false;
    const storage = {
      getItem(key) { return backing.getItem(key); },
      setItem(key, value) {
        if (key === Runtime.storageKey && failStoryWrite) {
          failStoryWrite = false;
          throw new Error('crash before bound Story state write');
        }
        backing.setItem(key, value);
      },
      removeItem(key) { backing.removeItem(key); },
    };
    const profileStore = Profile.createTestStore({ storage, now: () => 1900 });
    const runtime = Runtime.createStoryRuntime({
      profileStore,
      storyStore: Runtime.createStoryStateStore({ storage }),
    });
    const session = runtime.start({
      matchId: `story:binding:${label}`, chapterId: 'first-broadcast', humans: [human()],
    });
    failStoryWrite = true;
    await assert.rejects(() => win(runtime, session), /Story state persistence failed/);
    return { backing, storage, profileStore };
  }

  const foreignLineage = await crashedFixture('lineage');
  const lineageKey = `${Runtime.storageKey}.finalization`;
  const lineageIntent = JSON.parse(foreignLineage.backing.getItem(lineageKey));
  lineageIntent.profileLineageId = `${lineageIntent.profileLineageId}-foreign`;
  foreignLineage.backing.setItem(lineageKey, JSON.stringify(lineageIntent));
  assert.throws(() => Runtime.createStoryRuntime({
    profileStore: Profile.createTestStore({ storage: foreignLineage.storage, now: () => 1901 }),
    storyStore: Runtime.createStoryStateStore({ storage: foreignLineage.storage }),
  }), /another Profile lineage/,
  'a valid-looking intent from another profile lineage is never replayed');
  assert.notEqual(foreignLineage.backing.getItem(lineageKey), null,
    'fail-closed recovery leaves contradictory evidence intact for diagnosis');

  const wrongReceipt = await crashedFixture('ordinal');
  const ordinalKey = `${Runtime.storageKey}.finalization`;
  const ordinalIntent = JSON.parse(wrongReceipt.backing.getItem(ordinalKey));
  ordinalIntent.receiptOrdinal += 1;
  wrongReceipt.backing.setItem(ordinalKey, JSON.stringify(ordinalIntent));
  assert.throws(() => Runtime.createStoryRuntime({
    profileStore: Profile.createTestStore({ storage: wrongReceipt.storage, now: () => 1902 }),
    storyStore: Runtime.createStoryStateStore({ storage: wrongReceipt.storage }),
  }), /receipt contradicts/,
  'a receipt for the same match ID cannot authorize a different reserved ordinal');
  assert.notEqual(wrongReceipt.backing.getItem(ordinalKey), null);
}

async function testProfileReceiptIsRequiredWhenStoryHasNoComponentReward() {
  const storage = Profile.createMemoryStorage();
  const rawProfile = Profile.createTestStore({ storage, now: () => 1940 });
  let behavior = 'closed';
  const profileProxy = {
    snapshot: rawProfile.snapshot,
    reserveMatch: rawProfile.reserveMatch,
    resumeMatchReservation: rawProfile.resumeMatchReservation,
    consumeReservedMatch: rawProfile.consumeReservedMatch,
    abandonReservedMatch: rawProfile.abandonReservedMatch,
    claimStoryMatchResolution(input) {
      if (behavior === 'closed') return { applied: false, reason: 'persistence-closed' };
      if (behavior === 'lying-applied') return { applied: true };
      return rawProfile.claimStoryMatchResolution(input);
    },
  };
  const storyStore = Runtime.createStoryStateStore({ storage });
  const runtime = Runtime.createStoryRuntime({ profileStore: profileProxy, storyStore });
  const session = runtime.start({
    matchId: 'story:receipt-required:no-components',
    chapterId: 'first-broadcast', humans: [human()],
  });
  const cpuId = session.request.roster.find((entry) => !entry.human).id;
  const loss = outcome(session, [cpuId]);

  await assert.rejects(() => runtime.finalize(loss), /failed: persistence-closed/,
    'a non-duplicate Profile failure cannot advance Story merely because no component is owed');
  assert.equal(storyStore.snapshot().resolvedAttemptIds.length, 0);
  assert.notEqual(storage.getItem(`${Runtime.storageKey}.finalization`), null,
    'the exact pending transition remains available for a safe retry');

  behavior = 'lying-applied';
  await assert.rejects(() => runtime.finalize(loss), /receipt does not prove/,
    'an applied-looking response is insufficient without the exact durable Profile receipt');
  assert.equal(storyStore.snapshot().resolvedAttemptIds.length, 0);

  behavior = 'real';
  const completed = await runtime.finalize(loss);
  assert.equal(completed.status, 'completed');
  assert.equal(storyStore.snapshot().resolvedAttemptIds.length, 1);
  const receipt = rawProfile.snapshot().matchReceipts.find((entry) =>
    entry.matchId === session.matchId);
  assert.equal(receipt.resolution, 'consumed');
  assert.equal(storage.getItem(`${Runtime.storageKey}.finalization`), null);
}

function testFinalizationIntentRejectsTamperedCandidateAndRewards() {
  function pendingFixture(label, storyState = Story.defaultState()) {
    const storage = Profile.createMemoryStorage();
    const profileStore = Profile.createTestStore({ storage, now: () => 1950 });
    const storyStore = Runtime.createStoryStateStore({ storage, initialState: storyState });
    const runtime = Runtime.createStoryRuntime({ profileStore, storyStore });
    const session = runtime.start({
      matchId: `story:tamper:${label}`, chapterId: 'first-broadcast', humans: [human()],
    });
    const profile = profileStore.snapshot();
    const resolution = Story.resolveAttempt(storyStore.snapshot(),
      session.request.activityContext.attempt, outcome(session, ['human-1']));
    storyStore.prepareFinalization(session.request, resolution, {
      profileLineageId: profile.lineageId,
      receiptOrdinal: profile.activeMatchReservation.ordinal,
    }, profile);
    return { storage, storyStore, profileStore };
  }

  const candidateFixture = pendingFixture('candidate');
  const key = `${Runtime.storageKey}.finalization`;
  const candidateIntent = JSON.parse(candidateFixture.storage.getItem(key));
  candidateIntent.candidateState = Story.normalizeState({
    ...candidateIntent.candidateState,
    discoveredRivalIds: candidateIntent.candidateState.discoveredRivalIds.concat(['scatterline']),
  });
  candidateFixture.storage.setItem(key, JSON.stringify(candidateIntent));
  assert.throws(() => candidateFixture.storyStore.pendingFinalization(),
    /bounded one-attempt transition/,
    'a valid Story state containing the receipt cannot smuggle unrelated progression');

  const rewardFixture = pendingFixture('reward');
  const rewardIntent = JSON.parse(rewardFixture.storage.getItem(key));
  rewardIntent.rewardClaimIds = ['rival.first-light.first-clear'];
  rewardFixture.storage.setItem(key, JSON.stringify(rewardIntent));
  assert.throws(() => rewardFixture.storyStore.pendingFinalization(),
    /rewards do not match its one-attempt transition/,
    'journal reward IDs must equal the canonical transition rather than merely be allowlisted');

  const signatureFixture = pendingFixture('profile-evidence', Story.normalizeState({
    clearedPreliminaryIds: ['wfc-qualifier'], discoveredRivalIds: ['first-light'],
  }));
  const pending = signatureFixture.storyStore.pendingFinalization();
  const processedOnly = clone(signatureFixture.profileStore.snapshot());
  const reservation = processedOnly.activeMatchReservation;
  processedOnly.activeMatchReservation = null;
  processedOnly.consumedMatchOrdinal = reservation.ordinal;
  processedOnly.matchReceipts.push({
    schema: 'MatchReceiptV1', version: 1,
    matchId: reservation.matchId, activityId: reservation.activityId,
    ordinal: reservation.ordinal, resolution: 'consumed',
  });
  processedOnly.processedClaimIds.push('rival.first-light.first-clear');
  assert.throws(() => signatureFixture.storyStore.assertFinalizationEvidence(
    pending, processedOnly), /does not prove/,
  'a loose processed claim cannot prove a rival reward transaction');
  const rewarded = clone(processedOnly);
  rewarded.defeatedRivalIds.push('first-light');
  rewarded.rewardedRivalIds.push('first-light');
  assert.equal(signatureFixture.storyStore.assertFinalizationEvidence(pending, rewarded), true,
    'the canonical rewardedRivalIds evidence proves the exact expected component');
}

async function testFinalizationClearFailureRemainsRetryable() {
  const backing = Profile.createMemoryStorage();
  const finalizationKey = `${Runtime.storageKey}.finalization`;
  let failClearOnce = true;
  const storage = {
    getItem(key) { return backing.getItem(key); },
    setItem(key, value) { backing.setItem(key, value); },
    removeItem(key) {
      if (key === finalizationKey && failClearOnce) {
        failClearOnce = false;
        throw new Error('clear interrupted while bytes remain durable');
      }
      backing.removeItem(key);
    },
  };
  const profileStore = Profile.createTestStore({ storage, now: () => 1960 });
  const storyStore = Runtime.createStoryStateStore({ storage });
  let statsCalls = 0;
  const runtime = Runtime.createStoryRuntime({
    profileStore, storyStore, statsSink() { statsCalls++; },
  });
  const session = runtime.start({
    matchId: 'story:clear-retry', chapterId: 'first-broadcast', humans: [human()],
  });
  const terminal = outcome(session, ['human-1']);
  await assert.rejects(() => runtime.finalize(terminal), /cleanup is pending/);
  assert.notEqual(backing.getItem(finalizationKey), null,
    'a failed exact clear leaves the recovery evidence intact');
  assert.equal(statsCalls, 0, 'an incomplete cross-key finalization is not published to statistics');
  const profileAfterFirst = clone(profileStore.snapshot());
  assert.throws(() => runtime.start({
    matchId: 'story:clear-retry:blocked', chapterId: 'first-broadcast', humans: [human()],
  }), /active Story match/,
  'the unresolved session blocks a later match until cleanup retries');

  const retried = await runtime.finalize(terminal);
  assert.equal(retried.status, 'completed');
  assert.equal(backing.getItem(finalizationKey), null);
  assert.deepEqual(profileStore.snapshot(), profileAfterFirst,
    'cleanup retry never re-awards the already consumed Profile transaction');
  assert.equal(storyStore.snapshot().resolvedAttemptIds.filter((id) =>
    id === session.request.activityContext.attempt.attemptId).length, 1);
  assert.equal(statsCalls, 1, 'only the fully finalized retry reaches statistics');
}

function testHigherRevisionStoryRefreshIsMonotonicAndReceiptAware() {
  const regressionBacking = Profile.createMemoryStorage();
  const regression = Runtime.createStoryStateStore({ storage: regressionBacking });
  regression.ensureDurable();
  regression.discoverRival('first-light');
  const relocked = JSON.parse(regressionBacking.getItem(Runtime.storageKey));
  relocked.runtimeRevision += 1;
  relocked.discoveredRivalIds = [];
  regressionBacking.setItem(Runtime.storageKey, JSON.stringify(relocked));
  assert.throws(() => regression.refresh(), /higher-revision regression/);
  assert.throws(() => regression.snapshot(), /higher-revision regression/,
    'a higher numeric revision cannot relock already discovered progression');

  const journalBacking = Profile.createMemoryStorage();
  const journalStore = Runtime.createStoryStateStore({ storage: journalBacking });
  journalStore.ensureDurable();
  journalStore.discoverRival('first-light');
  const previousRaw = journalBacking.getItem(Runtime.storageKey);
  const journalCandidate = JSON.parse(previousRaw);
  journalCandidate.runtimeRevision += 1;
  journalCandidate.discoveredRivalIds = [];
  const candidateRaw = JSON.stringify(journalCandidate);
  journalBacking.setItem(`${Runtime.storageKey}.journal`, JSON.stringify({
    schema: 'StoryWriteJournalV1', version: 1, storageKey: Runtime.storageKey,
    previousRaw, candidateRaw,
  }));
  assert.throws(() => Runtime.createStoryStateStore({ storage: journalBacking }),
    /would relock/,
    'journal recovery applies the same semantic monotonicity gate as refresh');

  const rewriteBacking = Profile.createMemoryStorage();
  const rewrite = Runtime.createStoryStateStore({ storage: rewriteBacking });
  rewrite.ensureDurable();
  rewrite.set(Story.normalizeState({
    resolvedAttemptIds: ['receipt-a'], lastCheckpoint: 'first-broadcast',
  }));
  const rewritten = JSON.parse(rewriteBacking.getItem(Runtime.storageKey));
  rewritten.runtimeRevision += 1;
  rewritten.resolvedAttemptIds = ['receipt-b'];
  rewriteBacking.setItem(Runtime.storageKey, JSON.stringify(rewritten));
  assert.throws(() => rewrite.refresh(), /higher-revision regression/);
  assert.throws(() => rewrite.snapshot(), /higher-revision regression/,
    'an incompatible receipt rewrite permanently poisons that store instance');

  const slidingBacking = Profile.createMemoryStorage();
  const fullReceipts = Array.from({ length: 1000 }, (_, index) => `receipt-${index}`);
  const sliding = Runtime.createStoryStateStore({
    storage: slidingBacking,
    initialState: Story.normalizeState({
      resolvedAttemptIds: fullReceipts, lastCheckpoint: 'first-broadcast',
    }),
  });
  sliding.ensureDurable();
  const advanced = JSON.parse(slidingBacking.getItem(Runtime.storageKey));
  advanced.runtimeRevision += 1;
  advanced.resolvedAttemptIds = fullReceipts.slice(1).concat(['receipt-1000']);
  advanced.lastCheckpoint = 'scatterline';
  slidingBacking.setItem(Runtime.storageKey, JSON.stringify(advanced));
  assert.equal(sliding.refresh().resolvedAttemptIds[0], 'receipt-1');
  assert.equal(sliding.snapshot().resolvedAttemptIds.at(-1), 'receipt-1000');
  assert.equal(sliding.snapshot().resolvedAttemptIds.length, 1000,
    'the canonical one-out/one-in bounded window remains a valid higher revision');
}

function testRuntimeExposesOnlyReadOnlyStoreProjections() {
  const h = harness();
  assert.equal(Object.prototype.hasOwnProperty.call(h.runtime, 'storyStore'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(h.runtime, 'profileStore'), false);
  assert.equal(typeof h.runtime.story.snapshot, 'function');
  assert.equal(typeof h.runtime.profile.snapshot, 'function');
  assert.equal(h.runtime.story.set, undefined);
  assert.equal(h.runtime.profile.claimStoryMatchResolution, undefined);
  const active = h.runtime.start({
    matchId: 'story:public-projection', chapterId: 'first-broadcast', humans: [human()],
  });
  const projection = h.runtime.profile.snapshot();
  assert.equal(Object.prototype.hasOwnProperty.call(projection, 'activeMatchReservation'), false);
  assert.doesNotMatch(JSON.stringify(h.runtime), /MatchClaimTokenV1|match-nonce/);
  h.runtime.abandon(active.matchId, 'projection-test-complete');
}

function testViewsHideSecretsAndUseAuthoredCopy() {
  const fresh = Story.defaultState();
  const board = View.rivalBoard({ storyState: fresh });
  assert.equal(board.entries.length, 12);
  board.entries.forEach((entry) => {
    assert.deepEqual(Object.keys(entry).sort(), ['ariaLabel', 'locked', 'slot', 'symbol']);
    assert.equal(entry.symbol, '🔒');
  });
  const discovered = Story.discoverForLevel(fresh, 13).state;
  const visible = View.rivalBoard({ storyState: discovered });
  assert.equal(visible.entries.filter((entry) => !entry.locked).length, 2);
  assert.equal(visible.entries[0].rivalName, 'Mara Venn');
  assert.equal(visible.entries[0].rules, 'Solo · Three lives · Normal events');
  assert.equal(Object.prototype.hasOwnProperty.call(visible.entries[2], 'rivalName'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(visible.entries[2], 'level'), false);

  const attempt = Story.prepareAttempt(fresh, {
    attemptId: 'view:prelim', chapterId: 'first-broadcast',
    alliedHumanIds: ['human-1'],
  });
  const card = View.broadcastCard({ attempt });
  assert.equal(card.storyTitle, 'Pressure Signal');
  assert.equal(card.headline, 'WFC Qualifier');
  assert.equal(card.refrain, 'Ten lives. Every one public.');
  assert.equal(card.rival, null);
  assert.deepEqual(View.broadcastCard({ attempt }), card,
    'authored copy is deterministic rather than randomly misspelled');

  const notes = View.fieldNotes({ fieldNoteIds: ['field-note-act-1', 'field-note-act-4'] });
  assert.deepEqual(notes.notes.map((note) => note.id), ['field-note-act-1', 'field-note-act-4']);
  assert.match(notes.notes[0].body, /LANE 09 — RETURN RECEIVED/);
  assert.match(notes.notes[1].body, /REMATCH AVAILABLE/);

  const waiting = View.alienGate({ storyState: fresh, flipLevel: 100 });
  assert.equal(waiting.title, 'Final Challenger waiting');
  assert.equal(waiting.locked, true);
  const earlyVictory = Story.normalizeState({ defeatedRivalIds: ['visitor-zero'] });
  assert.equal(View.alienGate({ storyState: earlyVictory, flipLevel: 99 }).locked, true);
  assert.equal(View.alienGate({ storyState: earlyVictory, flipLevel: 100 }).available, true);
}

function testInvalidFutureRequestDoesNotRevealRival() {
  const h = harness();
  assert.throws(() => h.runtime.createMatchRequest({
    matchId: 'story:future-probe', chapterId: 'visitor-zero', humans: [human()],
  }), /not available/);
  assert.equal(h.storyStore.snapshot().discoveredRivalIds.includes('visitor-zero'), false);
  const slot = h.runtime.views().rivalBoard.entries[11];
  assert.deepEqual(Object.keys(slot).sort(), ['ariaLabel', 'locked', 'slot', 'symbol']);
}

function testCoopAlliedHumanSetsAreExactAndConsistent() {
  const h = harness();
  const registry = Activity.createActivityRegistry();
  Runtime.registerStoryActivities(registry, { storyStore: h.storyStore });
  const valid = h.runtime.createMatchRequest({
    matchId: 'story:coop-allies', chapterId: 'first-broadcast', cooperative: true,
    humans: [human('human-1'), human('human-2')],
  });
  const makeRequest = (patch = {}) => Activity.MatchRequestV2({
    ...valid,
    rulesOptions: {
      ...valid.rulesOptions,
      ...(patch.rulesOptions || {}),
    },
    activityContext: {
      ...valid.activityContext,
      ...(patch.activityContext || {}),
    },
  });
  const missingRuleAlly = makeRequest({
    rulesOptions: {
      opponentTargeting: {
        ...valid.rulesOptions.opponentTargeting, alliedHumanIds: ['human-1'],
      },
    },
  });
  assert.throws(() => registry.prepare('story', { request: missingRuleAlly }),
    /inconsistent allied human protection/);

  const extraContextAlly = makeRequest({
    activityContext: {
      opponentTargeting: {
        ...valid.activityContext.opponentTargeting,
        alliedHumanIds: ['human-1', 'human-2', 'spectator'],
      },
    },
  });
  assert.throws(() => registry.prepare('story', { request: extraContextAlly }),
    /inconsistent allied human protection/);

  const mismatchedAttempt = makeRequest({
    activityContext: {
      attempt: { ...valid.activityContext.attempt, alliedHumanIds: ['human-1'] },
    },
  });
  assert.throws(() => registry.prepare('story', { request: mismatchedAttempt }),
    /Story attempt requires 2 allied human player IDs/,
    'attempt allies must equal the actual human roster rather than merely matching a flag');

  const mismatchedSeed = makeRequest({
    activityContext: {
      attempt: { ...valid.activityContext.attempt, seed: valid.seed + 1 },
    },
  });
  assert.throws(() => registry.prepare('story', { request: mismatchedSeed }),
    /prescribed match contract/,
    'the attempt seed is rederived and must remain bound to MatchRequestV2');

  const missingClearWinner = makeRequest({
    rulesOptions: { clearCondition: { anyWinnerId: ['human-1'] } },
  });
  assert.throws(() => registry.prepare('story', { request: missingClearWinner }),
    /inconsistent allied human protection/);

  const reversed = ['human-2', 'human-1'];
  const reorderedButEquivalent = makeRequest({
    rulesOptions: {
      clearCondition: { anyWinnerId: reversed },
      opponentTargeting: {
        ...valid.rulesOptions.opponentTargeting, alliedHumanIds: reversed,
      },
    },
    activityContext: {
      attempt: { ...valid.activityContext.attempt, alliedHumanIds: reversed },
      alliedHumanIds: reversed,
      opponentTargeting: {
        ...valid.activityContext.opponentTargeting, alliedHumanIds: reversed,
      },
    },
  });
  assert.equal(registry.prepare('story', {
    request: reorderedButEquivalent,
  }).attempt.cooperative, true,
  'allied identity is an exact set contract; harmless ordering differences are accepted');
}

function testRegistryAndBrowserExports() {
  const h = harness();
  assert.equal(Object.prototype.hasOwnProperty.call(h.runtime, 'registry'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(h.runtime, 'coordinator'), false);
  const registry = Activity.createActivityRegistry();
  Runtime.registerStoryActivities(registry, { storyStore: h.storyStore });
  assert.deepEqual(registry.ids(), ['story', 'rival-board']);
  assert.throws(() => registry.register({ id: 'story' }), /already registered/);

  const valid = h.runtime.createMatchRequest({
    matchId: 'story:request-contract', chapterId: 'first-broadcast', humans: [human()],
  });
  const forged = Activity.MatchRequestV2({
    ...valid,
    rulesOptions: { ...valid.rulesOptions, arenaId: 'baseline-table' },
  });
  assert.throws(() => registry.prepare('story', { request: forged }),
    /prescribed match contract/);
  const active = h.runtime.start({
    matchId: 'story:one-active', chapterId: 'first-broadcast', humans: [human()],
  });
  assert.throws(() => h.runtime.start({
    matchId: 'story:overlap', chapterId: 'first-broadcast', humans: [human()],
  }), /active Story match/);
  h.runtime.abandon(active.matchId, 'test-complete');

  const context = vm.createContext({
    console, Set, Map, Object, Array, JSON, Math, Number, String, Date, Promise,
  });
  function run(name) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8'),
      context, { filename: name });
  }
  run('v112-activity.js');
  run('v112-story.js');
  run('v112-urth.js');
  run('v112-progression-catalog.js');
  run('v112-economy.js');
  context.Achievements = require('../js/achievements.js');
  run('v112-achievements.js');
  context.FlipgameV111Progression = {
    migrate() {
      return { qualifyingWins: 0, ownedObjectIds: ['bottle'], ownedCosmeticIds: [],
        achievementIds: [], claimedRewardIds: ['object.bottle'] };
    },
  };
  run('v112-profile.js');
  run('v112-story-view.js');
  run('v112-story-runtime.js');
  assert.equal(context.FlipgameV112StoryView.schema, 'StoryViewModelsV1');
  assert.equal(context.FlipgameV112StoryRuntime.schema, 'StoryRuntimeV1');
  assert.deepEqual(Array.from(Object.keys(context.FlipgameV112StoryRuntime)).sort(),
    ['schema']);
  ['createStoryRuntime', 'storageKey', 'createStoryStateStore', 'registerStoryActivities',
    'validateStoryMatchRequest', 'buildRequest', 'createProfileCommands'].forEach((field) => {
    assert.equal(Object.prototype.hasOwnProperty.call(
      context.FlipgameV112StoryRuntime, field), false,
    `browser Story API must not expose CommonJS-only helper ${field}`);
  });
}

const tests = [
  testAllTwelveSoloRequestContracts,
  testAllTwelveCoopRequestContracts,
  testCompleteSoloAndCoopCampaigns,
  testRivalBoardSharedClearAndPreliminaryGate,
  testEarlyAlienVictoryBanksUntilFlipLevelOneHundred,
  testDuplicateReplayAndRetryNeverDoubleReward,
  testProfileRetryIsExactlyOnce,
  testStoryPersistenceRetryUsesConsumedTokenWithoutReaward,
  testLossAndAbandonmentHaveNoClearPenalty,
  testOwnerModeIsEphemeralTestDataAcrossStory,
  testStoryStateBoundsAreExactAndPreflighted,
  testStoryAttemptSchemaIsExactAndRederived,
  testStoryPersistenceUsesExactReadbackAndFailsClosedOnDivergence,
  testImportedCompletionCanRecoverCanonicalRewards,
  testCrossKeyFinalizationJournalRecoversCommittedStoryMatch,
  testCrossKeyJournalRecoversRivalBoardAndDiscardsUncommittedIntent,
  testCrossKeyJournalRejectsLineageAndReceiptSubstitution,
  testProfileReceiptIsRequiredWhenStoryHasNoComponentReward,
  testFinalizationIntentRejectsTamperedCandidateAndRewards,
  testFinalizationClearFailureRemainsRetryable,
  testHigherRevisionStoryRefreshIsMonotonicAndReceiptAware,
  testRuntimeExposesOnlyReadOnlyStoreProjections,
  testViewsHideSecretsAndUseAuthoredCopy,
  testInvalidFutureRequestDoesNotRevealRival,
  testCoopAlliedHumanSetsAreExactAndConsistent,
  testRegistryAndBrowserExports,
];

(async () => {
  for (const test of tests) {
    await test();
    console.log(`✓ ${test.name}`);
  }
  console.log(`v1.12 Story runtime tests passed (${tests.length} groups; all 12 chapters solo/co-op).`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
