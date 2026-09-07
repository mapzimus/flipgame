#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const Activity = require('../js/v112-activity.js');
const Story = require('../js/v112-story.js');
const Economy = require('../js/v112-economy.js');
const Profile = require('../js/v112-profile.js');
const View = require('../js/v112-story-view.js');
const Runtime = require('../js/v112-story-runtime.js');

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
  const profileStore = options.profileStore || Profile.createStore({
    storage,
    now: options.now || (() => 112),
  });
  if (options.flipLevel) {
    profileStore.claimBundle({
      claimId: `test:level:${options.flipLevel}`,
      sourceType: 'migration',
      fxp: Economy.fxpThresholdForLevel(options.flipLevel),
      reveal: false,
    });
  }
  const storyStore = options.storyStore || Runtime.createStoryStateStore({
    storage,
    initialState: options.storyState || Story.defaultState(),
  });
  let statsCalls = 0;
  const runtime = Runtime.createStoryRuntime({
    profileStore,
    storyStore,
    statsSink() { statsCalls++; },
  });
  return { storage, profileStore, storyStore, runtime, statsCalls: () => statsCalls };
}

function human(id = 'human-1') {
  return { id, displayName: id, flipperId: 'bottle' };
}

function outcome(matchId, winnerIds, extra = {}) {
  return Activity.MatchOutcomeV2({
    matchId,
    status: extra.status || 'completed',
    winnerIds,
    completionReason: extra.completionReason,
    telemetry: {
      qualifiedManualHumanFlips: extra.flips == null ? 4 : extra.flips,
      performanceMultiplier: extra.performanceMultiplier || 1,
    },
  });
}

async function win(runtime, session, humanId = 'human-1') {
  return runtime.finalize(outcome(session.matchId, [humanId]));
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
  assert.equal(profile.processedClaimIds.filter((id) => id.startsWith('match:')).length, 17);
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
  assert.equal(h.storyStore.snapshot().defeatedRivalIds.includes('first-light'), true);
  assert.equal(h.storyStore.snapshot().clearedChapterIds.includes('first-broadcast'), false,
    'Board victory cannot skip an attached WFC preliminary');
  assert.equal(h.profileStore.snapshot().processedClaimIds.includes('match:board:first-light:first-clear'), false,
    'Rival Board never grants ordinary match FXP/FC');

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

  h.profileStore.claimBundle({
    claimId: 'test:reach-fl100-after-alien',
    sourceType: 'match',
    fxp: Economy.MAX_LEVEL_FXP - banked.fxp,
    reveal: true,
  });
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
  assert.equal(afterFirst.processedClaimIds.filter((id) => id === 'match:story:scatterline:first').length, 1);
  assert.equal(afterFirst.processedClaimIds.filter((id) => id === 'rival.scatterline.first-clear').length, 1);

  const replay = h.runtime.start({
    matchId: 'story:scatterline:replay', chapterId: 'scatterline', humans: [human()],
  });
  assert.equal(replay.request.activityContext.replay, true);
  const replayResult = await win(h.runtime, replay);
  assert.equal(replayResult.transaction.noRewardsReason, 'replay');
  assert.equal(replayResult.transaction.profileCommands.length, 0);
  assert.deepEqual(h.profileStore.snapshot(), afterFirst,
    'a replay may update Story attempt history but cannot grant progression');

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
  const realProfile = Profile.createStore({ storage, now: () => 900 });
  let failStoryReward = true;
  const profileProxy = {
    snapshot: realProfile.snapshot,
    claimMatch: realProfile.claimMatch,
    claimStoryReward(reward) {
      if (failStoryReward) {
        failStoryReward = false;
        return { applied: false, duplicate: false, reason: 'persistence-failed' };
      }
      return realProfile.claimStoryReward(reward);
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
  await assert.rejects(() => win(runtime, session), /Profile persistence failed/);
  assert.equal(realProfile.snapshot().processedClaimIds.includes('match:story:retry:scatterline'), true,
    'ordinary reward committed before the simulated later failure');
  assert.equal(storyStore.snapshot().defeatedRivalIds.includes('scatterline'), false,
    'Story state waits until all profile commands are durable');
  const recovered = await win(runtime, session);
  assert.equal(recovered.activityResolution.success, true);
  assert.equal(realProfile.snapshot().processedClaimIds.filter((id) =>
    id === 'match:story:retry:scatterline').length, 1);
  assert.equal(realProfile.snapshot().processedClaimIds.filter((id) =>
    id === 'rival.scatterline.first-clear').length, 1);
  assert.equal(storyStore.snapshot().defeatedRivalIds.includes('scatterline'), true);
}

async function testLossAndAbandonmentHaveNoClearPenalty() {
  const h = harness();
  const abandoned = h.runtime.start({
    matchId: 'story:abandon', chapterId: 'first-broadcast', humans: [human()],
  });
  const afterStart = h.storyStore.snapshot();
  const profileBefore = h.profileStore.snapshot();
  const abandonedResult = h.runtime.abandon(abandoned.matchId, 'owner-left');
  assert.equal(abandonedResult.activityResolution.abandoned, true);
  assert.deepEqual(h.storyStore.snapshot(), afterStart);
  assert.deepEqual(h.profileStore.snapshot(), profileBefore);
  await assert.rejects(() => win(h.runtime, abandoned), /not active/);

  const finalizedAbandon = h.runtime.start({
    matchId: 'story:outcome-abandon', chapterId: 'first-broadcast', humans: [human()],
  });
  const abandonedPost = await h.runtime.finalize(outcome(finalizedAbandon.matchId, [], {
    status: 'abandoned', completionReason: 'app-backgrounded',
  }));
  assert.equal(abandonedPost.activityResolution.abandoned, true);
  assert.equal(abandonedPost.transaction.profileCommands.length, 0);
  assert.equal(h.storyStore.snapshot().resolvedAttemptIds.length, 0);

  const lossSession = h.runtime.start({
    matchId: 'story:loss', chapterId: 'first-broadcast', humans: [human()],
  });
  const lossResult = await h.runtime.finalize(outcome(lossSession.matchId, ['cpu-first-broadcast-1']));
  assert.equal(lossResult.activityResolution.success, false);
  assert.equal(h.storyStore.snapshot().clearedPreliminaryIds.length, 0);
  assert.equal(h.storyStore.snapshot().defeatedRivalIds.length, 0);
  assert.equal(lossResult.transaction.profileCommands[0].kind, 'claimMatch',
    'a completed, qualified Story loss still earns ordinary participation progression');
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

function testRegistryAndBrowserExports() {
  const h = harness();
  assert.deepEqual(h.runtime.registry.ids(), ['story', 'rival-board']);
  assert.throws(() => h.runtime.registry.register({ id: 'story' }), /already registered/);

  const valid = h.runtime.createMatchRequest({
    matchId: 'story:request-contract', chapterId: 'first-broadcast', humans: [human()],
  });
  const forged = Activity.MatchRequestV2({
    ...valid,
    rulesOptions: { ...valid.rulesOptions, arenaId: 'baseline-table' },
  });
  assert.throws(() => h.runtime.registry.prepare('story', { request: forged }),
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
}

const tests = [
  testAllTwelveSoloRequestContracts,
  testAllTwelveCoopRequestContracts,
  testCompleteSoloAndCoopCampaigns,
  testRivalBoardSharedClearAndPreliminaryGate,
  testEarlyAlienVictoryBanksUntilFlipLevelOneHundred,
  testDuplicateReplayAndRetryNeverDoubleReward,
  testProfileRetryIsExactlyOnce,
  testLossAndAbandonmentHaveNoClearPenalty,
  testViewsHideSecretsAndUseAuthoredCopy,
  testInvalidFutureRequestDoesNotRevealRival,
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
