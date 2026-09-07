'use strict';

const assert = require('node:assert/strict');
const Story = require('../js/v112-story.js');
const Urth = require('../js/v112-urth.js');

function prepare(state, chapterId, patch = {}) {
  return Story.prepareAttempt(state, Object.assign({
    attemptId: `${chapterId}-${patch.matchKind || 'signature'}-${patch.source || 'story'}`,
    chapterId, matchKind: 'signature', alliedHumanIds: ['human-1'], seed: 7,
  }, patch));
}

function win(state, attempt) {
  return Story.resolveAttempt(state, attempt, { status: 'completed', winnerIds: ['human-1'] });
}

function testCatalogAndCanon() {
  assert.equal(Story.chapters.length, 12);
  assert.deepEqual([...new Set(Story.chapters.map((c) => c.act))], [1, 2, 3, 4]);
  assert.equal(Story.chapters.filter((c) => c.preliminaryId).length, 5);
  assert.equal(new Set(Story.chapters.map((c) => c.rivalId)).size, 12);
  assert.equal(new Set(Story.chapters.map((c) => c.flipperId)).size, 12);
  assert.equal(Story.chapters.at(-1).rivalId, 'visitor-zero');
  assert.equal(Story.chapters.find((c) => c.id === 'deep-time').flipperId, 'trex');
  assert.equal(Story.chapters.find((c) => c.id === 'true-axis').flipperId, 'desk-gyroscope');
  assert.equal(Urth.canon.planet, 'Urth');
  assert.equal(Urth.canon.championship, 'Whirled Flip Champyunship');
  assert(!Object.values(Urth.authoredLines).some((line) =>
    Object.values(Urth.flavorSpellings).filter((word) => line.toLowerCase().includes(word)).length > 1));
}

function testSequentialStoryAndPreliminary() {
  let state = Story.defaultState();
  assert.throws(() => prepare(state, 'scatterline'), /not available/);
  assert.throws(() => prepare(state, 'first-broadcast'), /preliminary must be cleared/);
  const prelim = prepare(state, 'first-broadcast', { matchKind: 'preliminary' });
  let result = win(state, prelim);
  assert.deepEqual(result.state.clearedPreliminaryIds, ['wfc-qualifier']);
  assert.equal(result.state.clearedChapterIds.length, 0);
  const duel = Story.prepareAttempt(result.state, {
    attemptId: 'first-broadcast-default-next', chapterId: 'first-broadcast',
    alliedHumanIds: ['human-1'], seed: 7,
  });
  assert.equal(duel.matchKind, 'signature', 'cleared preliminary advances to the signature encounter');
  result = win(result.state, duel);
  assert(result.state.defeatedRivalIds.includes('first-light'));
  assert(result.state.clearedChapterIds.includes('first-broadcast'));
  assert.equal(result.rewards[0].objectId, 'coffee-mug');
  assert.equal(result.rewards[0].fxp, 25);
  assert.equal(Story.nextChapter(result.state).id, 'scatterline');
}

function testCoopEitherHumanAndLoss() {
  const state = Story.defaultState();
  const attempt = Story.prepareAttempt(state, {
    attemptId: 'coop-prelim', chapterId: 'first-broadcast', matchKind: 'preliminary',
    cooperative: true, alliedHumanIds: ['a', 'b'],
  });
  assert.deepEqual(attempt.rosterTemplate, { humanCount: 2, cpuCount: 6, lives: 10, format: 'classic' });
  const success = Story.resolveAttempt(state, attempt, { status: 'completed', winnerIds: ['b'] });
  assert.equal(success.success, true);
  const lossAttempt = Object.assign({}, attempt, { attemptId: 'coop-loss' });
  const loss = Story.resolveAttempt(state, lossAttempt, { status: 'completed', winnerIds: ['cpu-1'] });
  assert.equal(loss.success, false);
  assert.equal(loss.rewards.length, 0);
}

function testRivalBoardSharedClearAndNoOrdinaryReward() {
  let state = Story.discoverForLevel(Story.defaultState(), 13).state;
  const board = Story.prepareAttempt(state, { attemptId: 'board-default-signature',
    source: 'rival-board', chapterId: 'scatterline', alliedHumanIds: ['human-1'] });
  assert.equal(board.matchKind, 'signature');
  assert.deepEqual(board.rosterTemplate, { humanCount: 1, cpuCount: 1, lives: 3, format: 'classic' });
  assert.throws(() => Story.prepareAttempt(state, { attemptId: 'board-coop',
    source: 'rival-board', chapterId: 'scatterline', cooperative: true,
    alliedHumanIds: ['a', 'b'] }), /solo/);
  const result = win(state, board);
  assert.equal(result.ordinaryRewardsEligible, false);
  assert(result.state.clearedChapterIds.includes('scatterline'));
  assert.equal(result.rewards[0].objectId, 'gumball-machine');
  assert.equal(Story.catalogView(result.state).find((view) => view.id === 'scatterline').cleared, true);
}

function testActRewardAndIdempotence() {
  let state = Story.defaultState();
  // Seed act I's first two chapters and chapter-one preliminary as already done.
  state = Story.normalizeState({
    clearedPreliminaryIds: ['wfc-qualifier'],
    defeatedRivalIds: ['first-light', 'scatterline'],
    discoveredRivalIds: ['first-light', 'scatterline', 'meridian'],
  });
  const result = win(state, prepare(state, 'lane-09'));
  assert(result.newlyCompletedActIds.includes('1'));
  assert(result.rewards.some((reward) => reward.claimId === 'story.act.1.first-clear'));
  const duplicate = Story.resolveAttempt(result.state, prepare(result.state, 'lane-09', {
    attemptId: 'lane-09-signature-story',
  }), { status: 'completed', winnerIds: ['human-1'] });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.rewards.length, 0);
}

function testAlienGateAndEarlyVictory() {
  let state = Story.normalizeState({ defeatedRivalIds: Story.chapters.slice(0, 11).map((c) => c.rivalId),
    clearedPreliminaryIds: Story.chapters.filter((c) => c.preliminaryId).map((c) => c.preliminaryId),
    discoveredRivalIds: Story.chapters.map((c) => c.rivalId) });
  const attempt = prepare(state, 'visitor-zero');
  assert.equal(attempt.physicsModeId, 'alien');
  assert.equal(attempt.eventsEnabled, false);
  const result = win(state, attempt);
  assert.equal(result.state.alienDefeated, true);
  assert.equal(Story.canSelectAlien(result.state, 99, false), false);
  assert.equal(Story.canSelectAlien(result.state, 100, false), true);
  assert.equal(Story.canSelectAlien(Story.defaultState(), 1, true), true);
  assert.equal(result.rewards.find((reward) => reward.rivalId === 'visitor-zero').fxp, 75);
}

function run() {
  testCatalogAndCanon();
  testSequentialStoryAndPreliminary();
  testCoopEitherHumanAndLoss();
  testRivalBoardSharedClearAndNoOrdinaryReward();
  testActRewardAndIdempotence();
  testAlienGateAndEarlyVictory();
  console.log('v1.12 Story/Urth tests passed.');
}

run();
