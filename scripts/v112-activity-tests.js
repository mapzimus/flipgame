'use strict';

const assert = require('node:assert/strict');
const Activity = require('../js/v112-activity.js');
const Rules = require('../js/v112-rules.js');
const Profile = require('../js/v112-profile.js');
const ProgressionRuntime = require('../js/v112-progression-runtime.js');

function request(patch = {}) {
  return Object.assign({
    matchId: 'match-1', activityId: 'free-play', formatId: 'classic',
    physicsModeId: 'normal', roster: [{ id: 'p1' }, { id: 'p2' }], seed: 7,
  }, patch);
}

function rewardInput(extra = {}) {
  return Object.assign({
    completed: true, resolved: true, qualifiedManualHumanFlips: 4,
    humanPlayers: 2, format: 'classic', startingLives: 3,
    performanceMultiplier: 1,
  }, extra);
}

function humanRequest(patch = {}) {
  return request(Object.assign({
    roster: [{ id: 'p1', human: true }, { id: 'p2', human: true }],
  }, patch));
}

function completedClassicOutcome(matchId, winnerId = 'p1', roster = [
  { id: 'p1', human: true }, { id: 'p2', human: true },
], patch = {}) {
  const state = Rules.createClassicState({
    matchId,
    players: roster,
    startingLives: 3,
    seed: 7,
  });
  const loserIds = roster.map((entry) => String(entry.id))
    .filter((id) => id !== String(winnerId));
  const terminal = Rules.forceEliminate(state, loserIds, 'forced-elimination').state;
  assert.equal(terminal.phase, 'complete', 'fixture must produce a terminal Rules state');
  return Object.assign({}, Rules.toMatchOutcomeV2(terminal), patch);
}

function testContractsAndValidation() {
  const value = Activity.MatchRequestV2(request());
  assert.equal(value.schema, 'MatchRequestV2');
  assert.equal(value.roster[1].seat, 1);
  assert(Object.isFrozen(value.roster));
  assert.throws(() => Activity.MatchRequestV2(request({ activityId: 'story', formatId: 'cup' })),
    /requires classic/);
  assert.throws(() => Activity.MatchRequestV2(request({ roster: [] })), /1–16/);
  assert.throws(() => Activity.MatchRequestV2(request({
    roster: [{ id: 'same' }, { id: 'same' }],
  })), /Duplicate/);
  assert.throws(() => Activity.MatchRequestV2(request({ formatId: 'battle', physicsModeId: 'alien' })),
    /does not support/);
  assert.throws(() => Activity.MatchRequestV2(request({ activityId: 'story', physicsModeId: 'insane' })),
    /prescribed Story physics/);
  assert.equal(Activity.MatchRequestV2(request({ activityId: 'story', physicsModeId: 'alien',
    activityContext: { rivalId: 'visitor-zero', nativeAlien: true } })).physicsModeId, 'alien');
  assert.throws(() => Activity.MatchRequestV2(request({ activityId: 'tutorial', physicsModeId: 'alien' })),
    /normal physics/);
  assert.throws(() => Activity.MatchRequestV2(request({ activityId: 'practice', formatId: 'battle' })),
    /free-play format/);
}

function testOutcomeStatusAndRulesAuthorityContracts() {
  const active = Rules.createClassicState({
    matchId: 'active-rules-outcome', players: [{ id: 'p1' }, { id: 'p2' }],
  });
  assert.throws(() => Activity.MatchOutcomeV2({
    matchId: active.matchId, status: 'completed', rulesState: active,
  }), /rules phase|contradicts/i,
  'an active Rules state cannot be relabeled as completed');

  const terminal = completedClassicOutcome('terminal-rules-outcome');
  assert.throws(() => Activity.MatchOutcomeV2(Object.assign({}, terminal, {
    status: 'abandoned', completed: false,
  })), /rules phase|contradicts/i,
  'a terminal Rules state cannot be relabeled as abandoned');

  const abandoned = Activity.MatchOutcomeV2({
    matchId: 'ordinary-abandon', status: 'abandoned', completed: false,
    winnerIds: ['p1'], completionReason: '<caller-controlled reason>',
  });
  assert.deepEqual(abandoned.winnerIds, []);
  assert.equal(abandoned.completionReason, 'abandoned');
  assert.throws(() => Activity.MatchOutcomeV2({
    matchId: 'boolean-contradiction', status: 'completed', completed: false,
  }), /completed flag contradicts/i);
}

async function testManagedCompletionRequiresCanonicalTerminalRules() {
  const profile = Profile.createTestStore({
    storage: Profile.createMemoryStorage(), now: () => 4001,
  });
  let transactions = 0;
  const registry = Activity.createActivityRegistry([{
    id: 'free-play', resolve({ outcome }) { return { winners: outcome.winnerIds }; },
  }]);
  const coordinator = Activity.createMatchSessionCoordinator({
    registry,
    rewardAuthority: profile,
    transaction(_command, rewards) {
      transactions += 1;
      const result = rewards.consumeMatch(rewardInput({ humanWon: true }));
      return { duplicate: result.duplicate };
    },
  });
  coordinator.start(humanRequest({ matchId: 'proof-required' }));
  await assert.rejects(() => coordinator.finalize({
    matchId: 'proof-required', status: 'completed', winnerIds: ['p1'],
  }), /terminal Rules-issued outcome|rules state/i);
  assert.equal(transactions, 0, 'an unproved terminal claim cannot reach the reward transaction');
  assert.equal(profile.snapshot().activeMatchReservation.matchId, 'proof-required',
    'rejection leaves the exact entitlement available for a valid retry');

  const active = Rules.createClassicState({
    matchId: 'proof-required', players: [{ id: 'p1' }, { id: 'p2' }],
  });
  await assert.rejects(() => coordinator.finalize({
    matchId: 'proof-required', status: 'completed', winnerIds: ['p1'], rulesState: active,
  }), /rules phase|contradicts/i);
  assert.equal(transactions, 0);

  const resolution = await coordinator.finalize(
    completedClassicOutcome('proof-required'));
  assert.equal(resolution.status, 'completed');
  assert.equal(transactions, 1);

  const wrongRoster = Activity.createMatchSessionCoordinator({ registry });
  wrongRoster.start(request({ matchId: 'wrong-rules-roster' }));
  await assert.rejects(() => wrongRoster.finalize(completedClassicOutcome(
    'wrong-rules-roster', 'p1', [{ id: 'p1' }, { id: 'p3' }],
  )), /roster/i);

  const wrongWinner = completedClassicOutcome('wrong-rules-winner');
  assert.throws(() => Activity.MatchOutcomeV2(Object.assign({}, wrongWinner, {
    winnerIds: ['p2'],
  })), /winner/i,
  'caller-supplied winners cannot override the Rules-owned terminal result');

  const wrongParticipants = completedClassicOutcome('wrong-participants');
  assert.throws(() => Activity.MatchOutcomeV2(Object.assign({}, wrongParticipants, {
    participantResults: [{ playerId: 'outsider' }],
  })), /participant/i,
  'caller-supplied participant results cannot override Rules-owned results');
}

async function testCoordinatorExactlyOnceAndStatsFailure() {
  let prepared = 0, resolved = 0, transactions = 0, stats = 0;
  const registry = Activity.createActivityRegistry([{
    id: 'free-play',
    prepare({ request: value }) { prepared += 1; return { seed: value.seed }; },
    resolve({ outcome }) { resolved += 1; return { winner: outcome.winnerIds[0] }; },
  }]);
  const coordinator = Activity.createMatchSessionCoordinator({
    registry,
    transaction(command) {
      transactions += 1;
      return { claim: command.idempotencyKey, presentation: { title: 'Done' } };
    },
    statsSink() { stats += 1; throw new Error('storage unavailable'); },
  });
  coordinator.start(request());
  const outcome = { matchId: 'match-1', status: 'completed', winnerIds: ['p1'] };
  const [first, second] = await Promise.all([
    coordinator.finalize(outcome), coordinator.finalize(outcome),
  ]);
  assert.equal(first, second, 'concurrent finalization must share one promise/result');
  assert.equal(prepared, 1);
  assert.equal(resolved, 1);
  assert.equal(transactions, 1);
  assert.equal(first.presentation.title, 'Done');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(stats, 1, 'stats failure is attempted but must not reject finalization');
  assert.equal(coordinator.snapshot('match-1').status, 'finalized');
}

async function testCoordinatorValidationAndSafeRetry() {
  let resolved = 0, transactions = 0;
  const registry = Activity.createActivityRegistry([{
    id: 'free-play', resolve() { resolved += 1; return { stable: true }; },
  }]);
  const coordinator = Activity.createMatchSessionCoordinator({
    registry,
    transaction() {
      transactions += 1;
      if (transactions === 1) throw new Error('temporary storage failure');
      return { duplicate: false };
    },
  });
  coordinator.start(request({ matchId: 'retry-match' }));
  await assert.rejects(() => coordinator.finalize({ matchId: 'retry-match', winnerIds: ['outsider'] }),
    /outside the match roster/);
  const outcome = { matchId: 'retry-match', status: 'completed', winnerIds: ['p1'] };
  await assert.rejects(() => coordinator.finalize(outcome), /temporary storage failure/);
  assert.equal(coordinator.snapshot('retry-match').status, 'active');
  const result = await coordinator.finalize(outcome);
  assert.equal(result.status, 'completed');
  assert.equal(resolved, 1, 'activity resolution remains pure and is reused across transaction retry');
  assert.equal(transactions, 2);
  await assert.rejects(() => coordinator.finalize(Object.assign({}, outcome, { winnerIds: ['p2'] })),
    /not active|Conflicting/);
}

function testAbandon() {
  let abandoned = 0;
  const registry = Activity.createActivityRegistry([{
    id: 'story',
    abandon({ reason }) { abandoned += 1; return { reason }; },
  }]);
  const coordinator = Activity.createMatchSessionCoordinator({ registry });
  coordinator.start(request({ matchId: 'story-1', activityId: 'story' }));
  const result = coordinator.abandon('story-1', 'window-closed');
  assert.equal(result.status, 'abandoned');
  assert.equal(result.activityResolution.reason, 'window-closed');
  assert.equal(abandoned, 1);
  assert.equal(coordinator.abandon('story-1').status, 'abandoned');
}

async function testManagedFreePlayClaimIsPrivateAndExactlyOnce() {
  const profile = Profile.createTestStore({ storage: Profile.createMemoryStorage(), now: () => 401 });
  const registry = Activity.createActivityRegistry([{
    id: 'free-play', resolve({ outcome }) { return { winner: outcome.winnerIds[0] }; },
  }]);
  let activeNonce = null;
  let statsPayload = null;
  let transactionCalls = 0;
  const coordinator = Activity.createMatchSessionCoordinator({
    registry, rewardAuthority: profile,
    transaction(command, rewards) {
      transactionCalls++;
      assert.equal(rewards.schema, 'PrivateMatchRewardContextV1');
      assert.equal(rewards.reserved, true);
      assert.equal(rewards.rewardsEligible, true);
      assert.doesNotMatch(JSON.stringify(command), /MatchClaimTokenV1|match-nonce/);
      assert.doesNotMatch(JSON.stringify(rewards), new RegExp(activeNonce));
      const claim = rewards.consumeMatch(rewardInput({ humanWon: true }));
      return { duplicate: claim.duplicate, claimId: claim.claimId,
        presentation: { title: 'Counted' } };
    },
    statsSink(payload) { statsPayload = payload; },
  });
  const opened = coordinator.start(humanRequest({ matchId: 'private-token-match' }));
  activeNonce = profile.snapshot().activeMatchReservation.nonce;
  assert.doesNotMatch(JSON.stringify(opened), new RegExp(activeNonce));
  assert.doesNotMatch(JSON.stringify(coordinator.snapshot(opened.matchId)), new RegExp(activeNonce));
  const outcome = completedClassicOutcome(opened.matchId);
  const [first, second] = await Promise.all([
    coordinator.finalize(outcome), coordinator.finalize(outcome),
  ]);
  assert.equal(first, second);
  assert.equal(transactionCalls, 1);
  assert.equal(profile.snapshot().activeMatchReservation, null);
  assert.equal(profile.snapshot().consumedMatchOrdinal, 1);
  assert.equal(first.presentation.title, 'Counted');
  await new Promise((resolve) => setImmediate(resolve));
  assert.doesNotMatch(JSON.stringify(first), new RegExp(activeNonce));
  assert.doesNotMatch(JSON.stringify(statsPayload), new RegExp(activeNonce));
}

async function testManagedRetryAfterConsumeNeverReawards() {
  const profile = Profile.createTestStore({ storage: Profile.createMemoryStorage(), now: () => 402 });
  const registry = Activity.createActivityRegistry([{
    id: 'free-play', resolve() { return { stable: true }; },
  }]);
  let calls = 0;
  let firstClaim = null;
  let retryClaim = null;
  const coordinator = Activity.createMatchSessionCoordinator({
    registry, rewardAuthority: profile,
    transaction(_command, rewards) {
      calls++;
      const claim = rewards.consumeMatch(rewardInput());
      if (calls === 1) {
        firstClaim = claim;
        throw new Error('downstream story-like persistence failure');
      }
      retryClaim = claim;
      return { duplicate: claim.duplicate };
    },
  });
  coordinator.start(humanRequest({ matchId: 'consume-then-retry' }));
  const outcome = completedClassicOutcome('consume-then-retry');
  await assert.rejects(() => coordinator.finalize(outcome), /downstream/);
  const once = profile.snapshot();
  assert.equal(firstClaim.applied, true);
  assert.equal(coordinator.snapshot(outcome.matchId).status, 'active');
  assert.throws(() => coordinator.start(humanRequest({ matchId: 'blocked-before-retry' })),
    /Unresolved reward finalization must retry/,
  'a later match cannot replace a retry path after the profile reward was consumed');
  assert.equal(profile.snapshot().activeMatchReservation, null,
    'the blocked match cannot create a second reservation');
  const recovered = await coordinator.finalize(outcome);
  assert.equal(retryClaim.reason, 'duplicate');
  assert.equal(recovered.duplicate, true);
  assert.equal(profile.snapshot().fxp, once.fxp);
  assert.equal(profile.snapshot().fcBalance, once.fcBalance);
  assert.equal(profile.snapshot().consumedMatchOrdinal, 1);
  const next = coordinator.start(humanRequest({ matchId: 'allowed-after-retry' }));
  assert.equal(profile.snapshot().activeMatchReservation.matchId, next.matchId,
    'a later match may reserve only after the owning finalization is durable');
  coordinator.abandon(next.matchId, 'fixture-complete');
}

async function testRewardEligibilityAndZeroRewardAbandonment() {
  const profile = Profile.createTestStore({ storage: Profile.createMemoryStorage(), now: () => 403 });
  const definitions = ['free-play', 'rival-board', 'practice', 'physics-lab', 'tutorial']
    .map((id) => ({ id, resolve() { return {}; } }));
  const registry = Activity.createActivityRegistry(definitions);
  const observed = [];
  const coordinator = Activity.createMatchSessionCoordinator({
    registry, rewardAuthority: profile,
    transaction(_command, rewards) {
      observed.push({ reserved: rewards.reserved, eligible: rewards.rewardsEligible,
        reason: rewards.noRewardsReason });
      return { duplicate: false };
    },
  });
  const cases = [
    humanRequest({ matchId: 'practice-no-reward', activityId: 'practice' }),
    humanRequest({ matchId: 'lab-no-reward', activityId: 'physics-lab' }),
    humanRequest({ matchId: 'tutorial-no-reward', activityId: 'tutorial' }),
    humanRequest({ matchId: 'replay-no-reward', activityContext: { replay: true } }),
    humanRequest({ matchId: 'import-no-reward', activityContext: { imported: true } }),
    request({ matchId: 'ai-only-no-reward', roster: [{ id: 'cpu', human: false }] }),
    humanRequest({ matchId: 'rival-no-match-reward', activityId: 'rival-board' }),
  ];
  for (const value of cases) {
    coordinator.start(value);
    assert.equal(profile.snapshot().activeMatchReservation, null);
    await coordinator.finalize({ matchId: value.matchId,
      status: value.activityId === 'rival-board' ? 'cancelled' : 'completed', winnerIds: [] });
  }
  assert.equal(observed.every((entry) => !entry.reserved && !entry.eligible), true);
  assert.equal(profile.snapshot().consumedMatchOrdinal, 0);

  const before = profile.snapshot();
  coordinator.start(humanRequest({ matchId: 'managed-abandon' }));
  assert.equal(profile.snapshot().activeMatchReservation.matchId, 'managed-abandon');
  const abandoned = coordinator.abandon('managed-abandon', 'owner-left');
  assert.equal(abandoned.status, 'abandoned');
  assert.equal(profile.snapshot().activeMatchReservation, null);
  assert.equal(profile.snapshot().consumedMatchOrdinal, 1);
  assert.equal(profile.snapshot().fxp, before.fxp);
  assert.equal(profile.snapshot().fcBalance, before.fcBalance);
}

function testAbandonPersistenceFailureRetainsReservation() {
  const storage = Profile.createMemoryStorage();
  const profile = Profile.createTestStore({ storage, now: () => 4031 });
  const registry = Activity.createActivityRegistry([{ id: 'free-play' }]);
  const coordinator = Activity.createMatchSessionCoordinator({ registry,
    rewardAuthority: profile });
  coordinator.start(humanRequest({ matchId: 'retry-abandon' }));
  const token = profile.snapshot().activeMatchReservation;
  storage.failNextWrite();
  assert.throws(() => coordinator.abandon('retry-abandon', 'first-attempt'),
    /Match reward abandonment failed: persistence-failed/);
  assert.equal(coordinator.snapshot('retry-abandon').status, 'active');
  assert.deepEqual(profile.snapshot().activeMatchReservation, token,
    'a failed abandonment keeps the exact token available for retry');
  const result = coordinator.abandon('retry-abandon', 'second-attempt');
  assert.equal(result.status, 'abandoned');
  assert.equal(profile.snapshot().activeMatchReservation, null);
  assert.equal(profile.snapshot().fxp, 0);
  assert.equal(profile.snapshot().fcBalance, 0);
}

async function testStartFailureCleansOrResumesTheExactReservation() {
  const storage = Profile.createMemoryStorage();
  const profile = Profile.createTestStore({ storage, now: () => 404 });
  let prepareMode = 'ordinary-failure';
  const registry = Activity.createActivityRegistry([{
    id: 'free-play',
    prepare() {
      if (prepareMode === 'ordinary-failure') throw new Error('prepare exploded');
      if (prepareMode === 'cleanup-failure') {
        storage.failNextWrite();
        throw new Error('prepare exploded with cleanup fault');
      }
      return { ready: true };
    },
    resolve() { return {}; },
  }]);
  const coordinator = Activity.createMatchSessionCoordinator({
    registry, rewardAuthority: profile,
    transaction(_command, rewards) { return rewards.consumeMatch(rewardInput()); },
  });
  assert.throws(() => coordinator.start(humanRequest({ matchId: 'start-failed-clean' })),
    /prepare exploded/);
  assert.equal(profile.snapshot().activeMatchReservation, null);
  assert.equal(profile.snapshot().consumedMatchOrdinal, 1,
    'a failed start consumes its reserved ordinal with zero reward');
  assert.equal(profile.snapshot().fxp, 0);

  prepareMode = 'cleanup-failure';
  assert.throws(() => coordinator.start(humanRequest({ matchId: 'start-failed-resume' })),
    /reservation cleanup failed/);
  const retained = profile.snapshot().activeMatchReservation;
  assert.equal(retained.matchId, 'start-failed-resume');
  prepareMode = 'success';
  const resumed = coordinator.start(humanRequest({ matchId: 'start-failed-resume' }));
  assert.equal(profile.snapshot().activeMatchReservation.nonce, retained.nonce,
    'retry resumes the same private token rather than creating another entitlement');
  await coordinator.finalize(completedClassicOutcome(resumed.matchId));
  assert.equal(profile.snapshot().consumedMatchOrdinal, 2);
  assert.equal(profile.snapshot().activeMatchReservation, null);
}

async function testFinalizeTimeTestDataAbandonsReservation() {
  const profile = Profile.createTestStore({ storage: Profile.createMemoryStorage(), now: () => 405 });
  let state = { testData: false, rewardsEligible: true };
  const provider = Activity.createSessionActivityStateProvider(() => state);
  const registry = Activity.createActivityRegistry([{
    id: 'free-play', resolve({ outcome }) { return outcome.activityState; },
  }]);
  let observed = null;
  let statsPayload = null;
  const coordinator = Activity.createMatchSessionCoordinator({
    registry, rewardAuthority: profile,
    transaction(_command, rewards) {
      observed = rewards;
      return { duplicate: false };
    },
    statsSink(payload) { statsPayload = payload; },
  });
  coordinator.start(humanRequest({ matchId: 'forced-test-data' }),
    Activity.MatchSessionHooksV1({ activityStateProvider: provider }));
  assert.equal(profile.snapshot().activeMatchReservation.matchId, 'forced-test-data');
  state = { testData: true, rewardsEligible: false, forcedAttemptSeen: true };
  await coordinator.finalize({ matchId: 'forced-test-data', status: 'completed', winnerIds: ['p1'] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(observed.noRewardsReason, 'test-data');
  assert.equal(observed.rewardsEligible, false);
  assert.equal(profile.snapshot().activeMatchReservation, null);
  assert.equal(profile.snapshot().consumedMatchOrdinal, 1);
  assert.equal(profile.snapshot().fxp, 0);
  assert.equal(profile.snapshot().fcBalance, 0);
  assert.equal(statsPayload.outcome.activityState.testData, true,
    'the Stats marker comes from the trusted out-of-band activity-state provider');
  assert.equal(statsPayload.outcome.activityState.forcedAttemptSeen, true);
}

async function testRewardEligibilityIsMonotonicDeny() {
  const profile = Profile.createTestStore({ storage: Profile.createMemoryStorage(), now: () => 4051 });
  let state = { testData: true, rewardsEligible: false, forcedAttemptSeen: true };
  const provider = Activity.createSessionActivityStateProvider(() => state);
  const registry = Activity.createActivityRegistry([{
    id: 'free-play', resolve({ outcome }) { return outcome.activityState; },
  }]);
  let rewardContext = null;
  let statsPayload = null;
  const coordinator = Activity.createMatchSessionCoordinator({
    registry, rewardAuthority: profile,
    transaction(_command, rewards) {
      rewardContext = rewards;
      return { duplicate: false };
    },
    statsSink(payload) { statsPayload = payload; },
  });

  coordinator.start(humanRequest({ matchId: 'initially-test-data' }),
    Activity.MatchSessionHooksV1({ activityStateProvider: provider }));
  assert.equal(profile.snapshot().activeMatchReservation, null,
    'an initially ineligible session never reserves a reward entitlement');
  state = { testData: false, rewardsEligible: true, forcedAttemptSeen: false };
  await coordinator.finalize({ matchId: 'initially-test-data', status: 'completed',
    winnerIds: ['p1'], activityState: { testData: false, rewardsEligible: true } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(rewardContext.rewardsEligible, false,
    'clearing the dynamic flag cannot upgrade an initially ineligible match');
  assert.equal(rewardContext.noRewardsReason, 'test-data');
  assert.equal(profile.snapshot().consumedMatchOrdinal, 0);
  assert.equal(profile.snapshot().fxp, 0);
  assert.equal(profile.snapshot().fcBalance, 0);
  assert.equal(statsPayload.outcome.activityState.testData, true,
    'the trusted initial Test Data classification remains monotonic for statistics');
  assert.equal(statsPayload.outcome.activityState.statisticsDefaultEligible, false);

  let spoofedStats = null;
  const spoofedCoordinator = Activity.createMatchSessionCoordinator({
    registry, rewardAuthority: profile,
    transaction() { return { duplicate: false }; },
    statsSink(payload) { spoofedStats = payload; },
  });
  spoofedCoordinator.start(humanRequest({ matchId: 'untrusted-test-data-spoof',
    activityContext: { testData: true } }));
  await spoofedCoordinator.finalize({ matchId: 'untrusted-test-data-spoof',
    status: 'completed', winnerIds: ['p1'], activityState: { testData: true } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(spoofedStats.outcome.activityState.testData, undefined,
    'caller-controlled flags may deny rewards but cannot author the Test Data marker');
  assert.equal(spoofedStats.outcome.activityState.rewardsEligible, false);
}

async function testPersistedReservationRestartRecovery() {
  function registry() {
    return Activity.createActivityRegistry([{
      id: 'free-play', resolve() { return {}; },
    }]);
  }
  function coordinator(profile) {
    return Activity.createMatchSessionCoordinator({
      registry: registry(), rewardAuthority: profile,
      transaction(_command, rewards) { return rewards.consumeMatch(rewardInput()); },
    });
  }

  const sameStorage = Profile.createMemoryStorage();
  const firstStore = Profile.createTestStore({ storage: sameStorage, now: () => 407 });
  coordinator(firstStore).start(humanRequest({ matchId: 'restart-same-match' }));
  const persistedToken = firstStore.snapshot().activeMatchReservation;
  const resumedStore = Profile.createTestStore({ storage: sameStorage, now: () => 408 });
  const resumedCoordinator = coordinator(resumedStore);
  const resumedSession = resumedCoordinator.start(
    humanRequest({ matchId: 'restart-same-match' }));
  assert.equal(resumedStore.snapshot().activeMatchReservation.nonce, persistedToken.nonce);
  await resumedCoordinator.finalize(completedClassicOutcome(resumedSession.matchId));
  assert.equal(resumedStore.snapshot().consumedMatchOrdinal, 1);
  const afterOneReward = resumedStore.snapshot();

  const future = resumedCoordinator.start(humanRequest({ matchId: 'restart-future-match' }));
  resumedCoordinator.abandon(future.matchId, 'fixture');
  assert.equal(resumedStore.snapshot().consumedMatchOrdinal, 2);
  assert.equal(resumedStore.snapshot().fxp, afterOneReward.fxp);
  assert.equal(resumedStore.snapshot().fcBalance, afterOneReward.fcBalance);

  const orphanStorage = Profile.createMemoryStorage();
  const orphanStore = Profile.createTestStore({ storage: orphanStorage, now: () => 409 });
  coordinator(orphanStore).start(humanRequest({ matchId: 'orphaned-old-match' }));
  const orphan = orphanStore.snapshot().activeMatchReservation;
  const recoveredStore = Profile.createTestStore({ storage: orphanStorage, now: () => 410 });
  const recoveredCoordinator = coordinator(recoveredStore);
  const replacement = recoveredCoordinator.start(humanRequest({ matchId: 'replacement-match' }));
  assert.equal(orphan.ordinal, 1);
  assert.equal(recoveredStore.snapshot().activeMatchReservation.matchId, 'replacement-match');
  assert.equal(recoveredStore.snapshot().activeMatchReservation.ordinal, 2,
    'the orphan ordinal is abandoned before the replacement is reserved');
  recoveredCoordinator.abandon(replacement.matchId, 'fixture');
  assert.equal(recoveredStore.snapshot().consumedMatchOrdinal, 2);
  assert.equal(recoveredStore.snapshot().fxp, 0);
  assert.equal(recoveredStore.snapshot().fcBalance, 0);
}

async function testOwnerPolicyCannotReserveOrBeForged() {
  const store = Profile.createTestStore({ storage: Profile.createMemoryStorage(), now: () => 406 });
  const progression = ProgressionRuntime.createTestRuntime({ profileStore: store });
  progression.activateOwnerTestMode('Howe Test Mode');
  const registry = Activity.createActivityRegistry([{
    id: 'free-play', resolve() { return {}; },
  }]);
  let rewardContext = null;
  const coordinator = Activity.createMatchSessionCoordinator({
    registry, rewardAuthority: progression,
    transaction(_command, rewards) { rewardContext = rewards; return {}; },
  });
  coordinator.start(humanRequest({ matchId: 'owner-activity' }));
  assert.equal(store.snapshot().activeMatchReservation, null);
  await coordinator.finalize({ matchId: 'owner-activity', status: 'completed', winnerIds: ['p1'] });
  assert.equal(rewardContext.noRewardsReason, 'owner-test-mode');
  assert.equal(store.snapshot().fxp, 0);

  const forgedAuthority = Object.assign({}, progression, {
    activityPolicy() {
      const genuine = progression.activityPolicy({ activityId: 'free-play' });
      return { ...genuine, ownerTestGuard: { ...genuine.ownerTestGuard } };
    },
  });
  const forgedCoordinator = Activity.createMatchSessionCoordinator({
    registry, rewardAuthority: forgedAuthority,
  });
  assert.throws(() => forgedCoordinator.start(humanRequest({ matchId: 'forged-owner-policy' })),
    /valid authority guard/);
  progression.close();
}

function testMismatchedReservationIsRejectedBeforePrepare() {
  let prepared = 0;
  const registry = Activity.createActivityRegistry([{
    id: 'free-play', prepare() { prepared++; },
  }]);
  function coordinatorFor(tokenPatch, snapshotPatch) {
    let reserved = false;
    const token = { schema: 'MatchClaimTokenV1', version: 1, lineageId: 'lineage',
      ordinal: 1, nonce: 'opaque', matchId: 'expected-match', activityId: 'free-play',
      reservedAt: 1, ...tokenPatch };
    const authority = {
      reserveMatch() { reserved = true; return { applied: true, token }; },
      resumeMatchReservation() { return reserved ? token : null; },
      consumeReservedMatch() { return { applied: true }; },
      abandonReservedMatch() { return { applied: true }; },
      snapshot() { return { lineageId: 'lineage', consumedMatchOrdinal: 0,
        activeMatchReservation: reserved ? token : null, ...snapshotPatch }; },
    };
    return Activity.createMatchSessionCoordinator({ registry, rewardAuthority: authority });
  }
  let wrongMatch;
  assert.throws(() => {
    try { coordinatorFor({ matchId: 'different-match' }).start(
      humanRequest({ matchId: 'expected-match' })); }
    catch (error) { wrongMatch = error; throw error; }
  }, /reservation cleanup failed/);
  assert.match(wrongMatch.cause.message, /does not match its request identity/);
  let wrongActivity;
  assert.throws(() => {
    try { coordinatorFor({ activityId: 'story' }).start(
      humanRequest({ matchId: 'expected-match' })); }
    catch (error) { wrongActivity = error; throw error; }
  }, /reservation cleanup failed/);
  assert.match(wrongActivity.cause.message, /does not match its request identity/);
  let wrongLineage;
  assert.throws(() => {
    try { coordinatorFor({}, { lineageId: 'different-lineage' }).start(
      humanRequest({ matchId: 'expected-match' })); }
    catch (error) { wrongLineage = error; throw error; }
  }, /reservation cleanup failed/);
  assert.match(wrongLineage.cause.message, /active profile lineage/);
  assert.equal(prepared, 0);
}

async function testVersionedDynamicActivityStateBridge() {
  const phases = [];
  let current = {
    schema: 'TrainingActivityStateV1', testData: false,
    statisticsDefaultEligible: true, forcedAttemptSeen: false,
  };
  let preparedState = null;
  let resolvedState = null;
  let transactionState = null;
  let statsState = null;
  const registry = Activity.createActivityRegistry([{
    id: 'practice',
    prepare({ activityState }) { preparedState = activityState; return { ready: true }; },
    resolve({ outcome }) { resolvedState = outcome.activityState; return outcome.activityState; },
  }]);
  const coordinator = Activity.createMatchSessionCoordinator({
    registry,
    transaction(command) {
      transactionState = command.outcome.activityState;
      return { duplicate: false };
    },
    statsSink(payload) { statsState = payload.outcome.activityState; },
  });
  assert.throws(() => coordinator.start(request({
    matchId: 'dynamic-missing-provider', activityId: 'practice',
    activityContext: { dynamicActivityState: true },
  })), /require an activity-state provider/,
  'a serialized dynamic request cannot silently bypass its live session provider');
  assert.equal(coordinator.snapshot('dynamic-missing-provider'), null,
    'a rejected provider-less request never opens a coordinator session');
  const provider = Activity.createSessionActivityStateProvider(({ schema, phase }) => {
    assert.equal(schema, 'SessionActivityStateReadV1');
    phases.push(phase);
    return current;
  });
  const hooks = Activity.MatchSessionHooksV1({ activityStateProvider: provider });
  const opened = coordinator.start(request({ matchId: 'dynamic-finalize',
    activityId: 'practice' }), hooks);
  assert.equal(opened.hasActivityStateProvider, true);
  assert.equal(preparedState.testData, false);
  current = {
    schema: 'TrainingActivityStateV1', testData: true,
    statisticsDefaultEligible: false, forcedAttemptSeen: true,
  };
  const finalPromise = coordinator.finalize({
    matchId: 'dynamic-finalize', status: 'completed', winnerIds: ['p1'],
    // Callers cannot downgrade the authoritative provider classification.
    activityState: { testData: false, statisticsDefaultEligible: true },
  });
  current = { schema: 'TrainingActivityStateV1', testData: false,
    statisticsDefaultEligible: true, forcedAttemptSeen: false };
  const duplicatePromise = coordinator.finalize({
    matchId: 'dynamic-finalize', status: 'completed', winnerIds: ['p1'],
  });
  const [resolution, duplicate] = await Promise.all([finalPromise, duplicatePromise]);
  assert.equal(resolution, duplicate);
  assert.equal(resolvedState.testData, true);
  assert.equal(transactionState.testData, true);
  assert.equal(transactionState.statisticsDefaultEligible, false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(statsState.testData, true);
  assert.deepEqual(phases, ['prepare', 'finalize'],
    'finalize freezes one authoritative provider snapshot even across concurrent calls');

  let abandonState = { schema: 'TrainingActivityStateV1', testData: false,
    statisticsDefaultEligible: true };
  let abandonedPayload = null;
  const abandonRegistry = Activity.createActivityRegistry([{
    id: 'practice',
    abandon(payload) { abandonedPayload = payload; return payload.activityState; },
  }]);
  const abandonCoordinator = Activity.createMatchSessionCoordinator({ registry: abandonRegistry });
  const abandonProvider = Activity.createSessionActivityStateProvider(() => abandonState);
  abandonCoordinator.start(request({ matchId: 'dynamic-abandon',
    activityId: 'practice' }), Activity.MatchSessionHooksV1({
    activityStateProvider: abandonProvider,
  }));
  abandonState = { schema: 'TrainingActivityStateV1', testData: true,
    statisticsDefaultEligible: false, forcedAttemptSeen: true };
  const abandoned = abandonCoordinator.abandon('dynamic-abandon', 'back');
  assert.equal(abandoned.activityResolution.testData, true);
  assert.equal(abandonedPayload.activityState.statisticsDefaultEligible, false);

  assert.throws(() => Activity.createSessionActivityStateProvider(null), /reader is required/);
  assert.throws(() => Activity.MatchSessionHooksV1({
    activityStateProvider: { schema: 'SessionActivityStateProviderV1' },
  }), /Invalid/);
  const invalidRegistry = Activity.createActivityRegistry([{ id: 'practice' }]);
  const invalidCoordinator = Activity.createMatchSessionCoordinator({ registry: invalidRegistry });
  assert.throws(() => invalidCoordinator.start(request({ matchId: 'bad-state-provider',
    activityId: 'practice' }), Activity.MatchSessionHooksV1({
    activityStateProvider: Activity.createSessionActivityStateProvider(() => 'bad'),
  })), /object or null/);
}

async function testBoundedCoordinatorRetentionAndRecentIdempotency() {
  let transactionCalls = 0;
  const registry = Activity.createActivityRegistry([{
    id: 'free-play', resolve({ outcome }) { return { matchId: outcome.matchId }; },
  }]);
  const coordinator = Activity.createMatchSessionCoordinator({
    registry,
    maxRetainedSessions: 3,
    transaction() { transactionCalls += 1; return { duplicate: false }; },
  });
  const outcomes = [];
  const resolutions = [];
  for (let index = 0; index < 6; index += 1) {
    const matchId = `retained-${index}`;
    coordinator.start(request({ matchId }));
    const outcome = { matchId, status: 'completed', winnerIds: ['p1'] };
    outcomes.push(outcome);
    resolutions.push(await coordinator.finalize(outcome));
    assert.ok(coordinator.snapshots().length <= 3,
      'terminal-session history must never grow beyond its configured bound');
  }
  assert.equal(coordinator.snapshot('retained-0'), null,
    'the oldest terminal payload is evicted before accepting later work');
  assert.deepEqual(coordinator.snapshots().map((entry) => entry.matchId),
    ['retained-3', 'retained-4', 'retained-5']);
  const repeated = await coordinator.finalize(outcomes[5]);
  assert.equal(repeated, resolutions[5],
    'an exact retry of a retained final outcome returns the same resolution');
  assert.equal(transactionCalls, 6, 'an exact retry cannot rerun its transaction');
  await assert.rejects(() => coordinator.finalize(Object.assign({}, outcomes[5], {
    winnerIds: ['p2'],
  })), /Conflicting final outcome/);

  const activeBound = Activity.createMatchSessionCoordinator({
    registry, maxRetainedSessions: 2,
  });
  activeBound.start(request({ matchId: 'active-one' }));
  activeBound.start(request({ matchId: 'active-two' }));
  assert.throws(() => activeBound.start(request({ matchId: 'active-three' })),
    /capacity/i, 'active sessions are never evicted to make room');
  activeBound.abandon('active-one', 'fixture');
  activeBound.start(request({ matchId: 'active-three' }));
  assert.equal(activeBound.snapshot('active-one'), null);
  assert.deepEqual(activeBound.snapshots().map((entry) => entry.matchId),
    ['active-two', 'active-three']);
}

function testLaneIsolationAndTransitions() {
  const left = Activity.createLaneRuntime({ laneId: 'left', ownerId: 'p1' });
  const right = Activity.createLaneRuntime({ laneId: 'right', ownerId: 'p2' });
  assert.equal(left.claimPointer(10), true);
  assert.equal(left.claimPointer(11), false);
  assert.equal(right.claimPointer(11), true);
  left.armAttempt('attempt-left');
  left.transition('contact');
  left.transition('settling');
  left.resolveAttempt({ verdict: 'MAKE' });
  assert.equal(right.snapshot().state, 'aiming', 'one lane cannot mutate another lane');
  left.addCharge(3);
  left.offerPower([{ id: 'magnet-pulse' }, { id: 'moon-round' }]);
  left.storePower(1);
  assert.equal(left.consumePower().id, 'moon-round');
  assert.equal(left.consumePower(), null);
  left.transition('ready');
  assert.equal(left.snapshot().attemptId, null);
  assert.throws(() => left.transition('settling'), /Invalid lane transition/);
}

async function run() {
  testContractsAndValidation();
  testOutcomeStatusAndRulesAuthorityContracts();
  await testManagedCompletionRequiresCanonicalTerminalRules();
  await testCoordinatorExactlyOnceAndStatsFailure();
  await testCoordinatorValidationAndSafeRetry();
  testAbandon();
  await testManagedFreePlayClaimIsPrivateAndExactlyOnce();
  await testManagedRetryAfterConsumeNeverReawards();
  await testRewardEligibilityAndZeroRewardAbandonment();
  testAbandonPersistenceFailureRetainsReservation();
  await testStartFailureCleansOrResumesTheExactReservation();
  await testFinalizeTimeTestDataAbandonsReservation();
  await testRewardEligibilityIsMonotonicDeny();
  await testPersistedReservationRestartRecovery();
  await testOwnerPolicyCannotReserveOrBeForged();
  testMismatchedReservationIsRejectedBeforePrepare();
  await testVersionedDynamicActivityStateBridge();
  await testBoundedCoordinatorRetentionAndRecentIdempotency();
  testLaneIsolationAndTransitions();
  console.log('v1.12 activity/session tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
