#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Catalog = require('../js/v112-progression-catalog.js');
const Economy = require('../js/v112-economy.js');
const Achievements = require('../js/v112-achievements.js');
const Profile = require('../js/v112-profile.js');
const LegacyBackup = require('../js/v111-save-backup.js');
const Backup = require('../js/v112-profile-backup.js');
const Runtime = require('../js/v112-progression-runtime.js');

function rewardInput(extra = {}) {
  return {
    completed: true, resolved: true, qualifiedManualHumanFlips: 4,
    humanPlayers: 2, format: 'classic', startingLives: 3,
    performanceMultiplier: 1, ...extra,
  };
}

function harness(seed) {
  const storage = Profile.createMemoryStorage(seed);
  const store = Profile.createTestStore({ storage, now: () => 12345 });
  const runtime = Runtime.createTestRuntime({ profileStore: store, backupAdapter: Backup });
  return { storage, store, runtime };
}

function reserveAndClaim(h, matchId, input = rewardInput(), activityId = 'free-play') {
  const reservation = h.runtime.reserveMatch(matchId, activityId);
  assert.ok(reservation.applied || reservation.resumed, `failed to reserve ${matchId}`);
  return h.runtime.claimMatch(reservation.token, input);
}

let fixtureAwardSequence = 0;
function canonicalAward(store, rarity = 'common', label = 'fixture') {
  const id = `${label}-${++fixtureAwardSequence}`;
  return { id, result: store.claimAchievement(id, rarity) };
}

function reachFixtureLevel(store, targetLevel, label = 'level-fixture') {
  if (store.snapshot().flipLevel >= targetLevel) return [];
  const minimum = Economy.fxpThresholdForLevel(targetLevel) - store.snapshot().fxp;
  const upper = targetLevel >= 100 ? minimum + 300
    : Economy.fxpThresholdForLevel(targetLevel + 1) - 1 - store.snapshot().fxp;
  const options = [{ rarity: 'legendary', value: 75 }, { rarity: 'rare', value: 50 },
    { rarity: 'notable', value: 30 }, { rarity: 'common', value: 15 }];
  const paths = Array(upper + 1).fill(null); paths[0] = [];
  for (let total = 0; total <= upper; total++) {
    if (!paths[total]) continue;
    for (const option of options) {
      if (total + option.value <= upper && !paths[total + option.value]) {
        paths[total + option.value] = paths[total].concat(option.rarity);
      }
    }
  }
  const delta = Array.from({ length: upper - minimum + 1 }, (_, index) => minimum + index)
    .find((candidate) => paths[candidate]);
  assert.ok(delta != null, `no canonical achievement path to FL${targetLevel}`);
  const ids = paths[delta].map((rarity) => canonicalAward(store, rarity, label).id);
  assert.equal(store.snapshot().flipLevel, targetLevel);
  return ids;
}

function earnFixtureFc(store, targetBalance, label = 'fc-fixture') {
  const ids = [];
  while (store.snapshot().fcBalance < targetBalance) {
    ids.push(canonicalAward(store, 'legendary', label).id);
  }
  return ids;
}

function testSingleV4MigrationAndImmediateSelection() {
  const v3 = {
    schema: 'ProgressionStateV3', version: 3, qualifyingWins: 2,
    ownedObjectIds: ['bottle'], ownedCosmeticIds: [], achievementIds: [],
    claimedRewardIds: [],
  };
  const h = harness({ 'flipgame.progression.v3': JSON.stringify(v3) });
  assert.equal(h.store.snapshot().flipLevel, 2);
  assert.ok(h.storage.dump()['flipgame.profile.v4'], 'the reconciliation is durably written once');
  const originalV3 = h.storage.dump()['flipgame.progression.v3'];
  let updates = 0;
  h.runtime.subscribe((_state, event) => { if (event.type === 'profile-commit') updates++; },
    { emitCurrent: false });
  const result = reserveAndClaim(h, 'match:reach-fl4', rewardInput({
    qualifiedManualHumanFlips: 6,
  }));
  assert.equal(result.applied, true);
  if (h.store.snapshot().flipLevel < 4) {
    reachFixtureLevel(h.store, 4, 'immediate-fl4');
  }
  assert.equal(h.runtime.viewObject('milk-carton').id, 'milk-carton',
    'the live picker view changes in the same task without reload');
  assert.equal(h.runtime.isObjectAvailable('milk-carton'), true);
  assert.ok(updates >= 1, 'the live runtime receives committed state immediately');
  assert.equal(h.storage.dump()['flipgame.progression.v3'], originalV3,
    'V3 is a read-once source and is never dual-written');
  h.runtime.close();

  const reload = Profile.createTestStore({ storage: h.storage });
  assert.equal(reload.snapshot().flipLevel, h.store.snapshot().flipLevel);
  assert.ok(reload.snapshot().ownedObjectIds.includes('milk-carton'));
}

function testExactMatchIdempotenceAndAtomicFailure() {
  const h = harness();
  let notifications = 0;
  h.runtime.subscribe((_state, event) => {
    if (event.type === 'profile-commit' && event.result && event.result.consumed) notifications++;
  },
    { emitCurrent: false });
  const reservation = h.runtime.reserveMatch('immutable-match-1', 'free-play');
  const first = h.runtime.claimMatch(reservation.token, rewardInput({ humanWon: true }));
  assert.equal(first.applied, true);
  const committed = h.store.snapshot();
  assert.equal(h.runtime.claimMatch(reservation.token, rewardInput({ humanWon: false })).reason,
    'duplicate');
  assert.deepEqual(h.store.snapshot(), committed);
  assert.equal(notifications, 1);
  assert.throws(() => h.runtime.reserveMatch(' immutable-match-1', 'free-play'),
    /exact string identifier/);
  assert.throws(() => h.runtime.reserveMatch(7, 'free-play'), /exact string identifier/);

  const failedReservation = h.runtime.reserveMatch('immutable-match-failed', 'free-play');
  const reserved = h.store.snapshot();
  h.storage.failNextWrite();
  const failed = h.runtime.claimMatch(failedReservation.token, rewardInput());
  assert.equal(failed.reason, 'persistence-failed');
  assert.deepEqual(h.store.snapshot(), reserved);
  assert.equal(notifications, 1, 'a failed write is never published');
  assert.ok(!h.store.snapshot().processedClaimIds.includes('match:immutable-match-failed'));
  assert.equal(h.runtime.claimMatch(failedReservation.token, rewardInput()).applied, true,
    'a failed consume leaves the exact reservation resumable');
  h.runtime.close();
}

function testRevealQueueOrderResumeDismissAndEveryKind() {
  const h = harness();
  const fl4Awards = reachFixtureLevel(h.store, 4, 'reveal-fl4');
  h.store.dismissReveals(fl4Awards.map((id) => `achievement.${id}`));
  assert.deepEqual(h.runtime.pendingReveals().map((entry) => [entry.type, entry.contentId || null]), [
    ['fc', null], ['arena', 'rooftop'], ['object', 'milk-carton'],
  ], 'crossed-level reveals stay in ascending level order and include FC');

  const reloadedStore = Profile.createTestStore({ storage: h.storage });
  const reloadedRuntime = Runtime.createTestRuntime({ profileStore: reloadedStore,
    backupAdapter: Backup });
  assert.deepEqual(reloadedRuntime.pendingReveals(), h.runtime.pendingReveals(),
    'the queue resumes after reload');
  const firstId = reloadedRuntime.pendingReveals()[0].id;
  assert.equal(reloadedRuntime.dismissReveal(firstId).applied, true);
  assert.equal(reloadedRuntime.pendingReveals().some((entry) => entry.id === firstId), false);
  assert.equal(reloadedRuntime.dismissAllReveals().applied, true);
  assert.deepEqual(reloadedRuntime.pendingReveals(), []);

  reachFixtureLevel(reloadedStore, 49, 'reveal-fl49');
  reloadedStore.dismissReveals();
  reachFixtureLevel(reloadedStore, 50, 'reveal-fl50');
  assert.ok(reloadedRuntime.pendingReveals().some((entry) =>
    entry.type === 'feature' && entry.contentId === 'physics-lab'));

  reloadedRuntime.dismissAllReveals();
  assert.equal(reloadedRuntime.claimAchievement('runtime-achievement', 'common').applied, true);
  assert.equal(reloadedRuntime.pendingReveals().at(-1).type, 'achievement');
  reloadedRuntime.dismissAllReveals();
  earnFixtureFc(reloadedStore, 500, 'store-fc');
  assert.equal(reloadedRuntime.purchaseCosmetic('finish.chrome').applied, true);
  assert.deepEqual(reloadedRuntime.pendingReveals().at(-1), {
    id: 'store.finish.chrome', type: 'store', contentId: 'finish.chrome',
    displayName: 'Chrome',
  });
  h.runtime.close(); reloadedRuntime.close();
}

function testAllClaimsPublishImmediately() {
  const h = harness();
  const events = [];
  h.runtime.subscribe((_state, event) => { if (event.type === 'profile-commit') events.push(event); },
    { emitCurrent: false });
  reserveAndClaim(h, 'publish:match', rewardInput());
  h.runtime.claimRivalVictory('first-light');
  h.runtime.claimStoryAct('1');
  earnFixtureFc(h.store, 500, 'publish-store-seed');
  h.runtime.purchaseCosmetic('finish.chrome');
  assert.ok(events.length >= 7, 'reservation, consumption, and every canonical award publish immediately');
  assert.ok(h.runtime.viewObject('coffee-mug').id === 'coffee-mug');
  assert.ok(h.runtime.viewStore().find((item) => item.id === 'finish.chrome').owned);
  h.runtime.close();
}

function testWholeLevelLadderFeedsOneOrderedLiveView() {
  const h = harness();
  const ladderAwards = reachFixtureLevel(h.store, 100, 'whole-ladder');
  h.store.dismissReveals(ladderAwards.map((id) => `achievement.${id}`));
  assert.equal(h.runtime.listObjects().filter((item) => !item.locked).length, 39,
    'fresh FXP owns Bottle plus exactly 38 direct Flippers');
  assert.equal(h.runtime.listArenas().filter((item) => !item.locked).length, 23);
  assert.equal(h.runtime.viewFeature('physics-lab').locked, false);
  assert.equal(h.runtime.viewFeature('insane-mode').locked, true,
    'FL100 alone does not fabricate the final-rival clear');
  const reveals = h.runtime.pendingReveals();
  assert.deepEqual(new Set(reveals.map((entry) => entry.type)),
    new Set(['fc', 'arena', 'object', 'feature']));
  const levels = reveals.map((entry) => entry.level).filter(Number.isFinite);
  assert.deepEqual(levels, levels.slice().sort((a, b) => a - b),
    'every crossed level is presented in ascending order');
  assert.equal(h.store.snapshot().fcBalance, 6170,
    '3,700 level FC plus 2,470 FC from the canonical achievements used to reach FL100');
  h.runtime.close();
}

function testLockSecrecy() {
  const h = harness();
  const lockedObject = h.runtime.viewObject('milk-carton');
  assert.deepEqual(lockedObject, { locked: true, symbol: '🔒', ariaLabel: 'Locked' });
  assert.equal(Object.prototype.hasOwnProperty.call(lockedObject, 'id'), false);
  assert.deepEqual(h.runtime.viewVariant('milk-carton.blue-steel'), lockedObject);
  assert.deepEqual(h.runtime.viewArena('aurora-stage'), lockedObject);
  assert.deepEqual(h.runtime.viewFeature('physics-lab'), lockedObject);
  assert.equal(h.runtime.listObjects().length, 51);
  assert.equal(h.runtime.listArenas().length, 23);
  h.runtime.close();
}

function testExactEphemeralOwnerMode() {
  const h = harness();
  const earnedBefore = JSON.stringify(h.runtime.earnedSnapshot());
  ['howe test mode', 'Howe Test Mode ', 'HOWE TEST MODE', 'Hоwe Test Mode',
    'Howe  Test Mode', new String('Howe Test Mode')].forEach((attempt) => {
    assert.equal(h.runtime.activateOwnerTestMode(attempt).activated, false);
  });
  assert.equal(h.runtime.ownerProjection(), null);
  const activated = h.runtime.activateOwnerTestMode('Howe Test Mode');
  assert.equal(activated.activated, true);
  assert.deepEqual(activated.projection.counts,
    { objects: 51, variants: 612, arenas: 23, cosmetics: 40 });
  assert.deepEqual(activated.projection.featureIds,
    ['physics-lab', 'alien', 'insane-mode']);
  assert.equal(new Set(activated.projection.variantIds).size, 612);
  assert.equal(h.runtime.viewObject('alien').locked, false);
  assert.equal(h.runtime.viewFeature('physics-lab').locked, false);
  assert.equal(h.runtime.viewFeature('insane-mode').displayName, 'INSANE MODE');
  assert.equal(h.runtime.viewStore().every((item) => item.owned), true);
  const ownerPolicy = h.runtime.activityPolicy({ activityId: 'free-play' });
  assert.deepEqual({ ...ownerPolicy, ownerTestGuard: undefined }, {
    activityId: 'free-play', ownerTest: true, ownerTestMode: true,
    testData: true, rewardsEligible: false, progressionEligible: false,
    achievementsEligible: false, statisticsDefaultIncluded: false,
    storyRuntimeInjectionRequired: false, ownerTestGuard: undefined,
  });
  assert.equal(h.runtime.validateOwnerTestGuard(ownerPolicy.ownerTestGuard, 'free-play'), true);
  assert.equal(h.runtime.validateOwnerTestGuard({ ...ownerPolicy.ownerTestGuard }, 'free-play'), false,
    'the MatchRequest guard is identity-bound and cannot be forged by copying data');
  const defaultPolicy = h.runtime.activityPolicy({});
  assert.equal(defaultPolicy.activityId, 'practice', 'owner testing uses a registered activity identity');
  assert.throws(() => h.runtime.activityPolicy({ activityId: 'owner-test' }), /registered/);
  const storyPolicy = h.runtime.activityPolicy({ activityId: 'story' });
  assert.equal(storyPolicy.storyRuntimeInjectionRequired, true);
  assert.equal(h.runtime.reserveMatch('owner:no-reward', 'free-play').reason, 'owner-test-mode');
  assert.equal(h.runtime.claimMatch({}, rewardInput()).reason, 'owner-test-mode');
  assert.equal(h.runtime.claimAchievement('owner-achievement', 'legendary').reason, 'owner-test-mode');
  assert.equal(h.runtime.claimRivalVictory('first-light').reason, 'owner-test-mode');
  assert.equal(h.runtime.claimStoryAct('1').reason, 'owner-test-mode');
  assert.equal(h.runtime.purchaseCosmetic('finish.chrome').reason, 'owner-test-mode');
  assert.equal(JSON.stringify(h.runtime.earnedSnapshot()), earnedBefore,
    'preview and blocked commands cannot mutate serialized earned state');
  assert.throws(() => Backup.serialize(h.runtime.snapshot(), {}), /Ephemeral owner-test/);
  const safeBackup = h.runtime.exportBackup({ rows: [] }, { createdAt: 10 });
  assert.equal(Backup.parse(safeBackup).payload.profileV4.ownerTestMode, undefined,
    'runtime backup always exports the earned store, never its projection');
  h.runtime.deactivateOwnerTestMode();
  assert.equal(h.runtime.validateOwnerTestGuard(ownerPolicy.ownerTestGuard, 'free-play'), true,
    'a session-issued negative-only guard survives UI deactivation so Test Data can finish safely');
  h.runtime.activateOwnerTestMode('Howe Test Mode');
  assert.equal(h.runtime.validateOwnerTestGuard(ownerPolicy.ownerTestGuard, 'free-play'), true,
    'reactivation cannot turn an earlier Test Data guard into reward authority');
  const replacementPolicy = h.runtime.activityPolicy({ activityId: 'free-play' });
  assert.equal(h.runtime.validateOwnerTestGuard(replacementPolicy.ownerTestGuard, 'free-play'), true);
  h.runtime.deactivateOwnerTestMode();
  assert.equal(h.runtime.viewObject('alien').locked, true);
  assert.equal(JSON.stringify(h.runtime.earnedSnapshot()), earnedBefore);
  h.runtime.close();
  const restarted = Runtime.createTestRuntime({ profileStore: Profile.createTestStore({ storage: h.storage }),
    backupAdapter: Backup });
  assert.equal(restarted.ownerProjection(), null, 'owner mode never survives a restart');
  restarted.close();
}

function testV4BackupRoundTripAliasesAndDuplicateSafety() {
  const source = harness({ 'flipgame.progression.v3': JSON.stringify({
    schema: 'ProgressionStateV3', version: 3, qualifyingWins: 6,
    ownedObjectIds: ['bottle', 'tall-buildings', 'giraffe'], ownedCosmeticIds: [],
    achievementIds: [], claimedRewardIds: ['object.tall-buildings', 'object.giraffe'],
  }) });
  earnFixtureFc(source.store, 500, 'backup-progress');
  source.runtime.claimRivalVictory('first-light');
  const setup = {
    selectedSkin: 'giraffe', selectedVariantId: 'giraffe.blue-steel',
    visualArenaId: 'arena.rooftop', rows: [
      { id: 'p1', name: 'Zoë', charId: 'tall-buildings',
        variantId: 'tall-buildings.sucker-punch' },
      { id: 'p2', name: '<img src=x onerror=alert(1)>', charId: 'alien',
        variantId: 'alien.blue-steel' },
    ],
  };
  const serialized = source.runtime.exportBackup(setup, { createdAt: 44,
    sections: { 'flipgame.settings.v1': { sound: false },
      'flipgame.records.v2': { totalFlips: 77,
        historical: [{ objectId: 'tall-buildings' }, { objectId: 'giraffe' }] } } });
  const parsed = Backup.parse(serialized);
  assert.equal(parsed.releaseVersion, 'v1.12');
  assert.equal(parsed.payload.profileV4.schema, 'ProgressionStateV4');
  assert.equal(parsed.payload.setupSelection.selectedSkin, 'desk-gyroscope');
  assert.equal(parsed.payload.setupSelection.rows[0].charId, 'mechanical-metronome');
  assert.equal(parsed.payload.setupSelection.rows[1].name, '', 'blocked imported names are blanked');
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.payload.sections['flipgame.records.v2'].historical)),
    [{ objectId: 'tall-buildings' }, { objectId: 'giraffe' }],
    'historical statistics IDs are preserved verbatim');

  const target = harness();
  reachFixtureLevel(target.store, 8, 'target-head-start');
  earnFixtureFc(target.store, 800, 'target-head-start-fc');
  const beforeImportBalance = target.store.snapshot().fcBalance;
  const imported = target.runtime.importBackup(serialized, {
    selectedSkin: 'bottle', selectedVariantId: 'bottle.blue-steel',
    visualArenaId: 'baseline-table', rows: [{ id: 'p1', charId: 'bottle' },
      { id: 'p2', charId: 'bottle' }],
  });
  assert.equal(imported.imported, true);
  assert.ok(imported.state.fxp >= Economy.fxpThresholdForLevel(8), 'import never downgrades FXP');
  assert.ok(imported.state.fcBalance >= beforeImportBalance, 'import never downgrades FC');
  assert.ok(imported.state.ownedObjectIds.includes('mechanical-metronome'));
  assert.ok(imported.state.ownedObjectIds.includes('desk-gyroscope'));
  assert.equal(imported.setupSelection.rows[0].charId, 'mechanical-metronome');
  assert.equal(imported.setupSelection.rows[1].charId, 'bottle',
    'a backed-up unearned Alien selection is not imported');
  assert.equal(imported.sections['flipgame.records.v2'].totalFlips, 77,
    'non-profile save sections survive the checked adapter for their owning store');
  const afterFirst = target.store.snapshot();
  const duplicate = target.runtime.importBackup(serialized, imported.setupSelection);
  assert.equal(duplicate.duplicate, true);
  assert.deepEqual(target.store.snapshot(), afterFirst, 'repeat import cannot duplicate rewards');
  assert.equal(new Set(afterFirst.fcTransactions.map((tx) => tx.idempotencyKey)).size,
    afterFirst.fcTransactions.length);
  source.runtime.close(); target.runtime.close();
}

function testLegacyBackupMigratesWithoutRelock() {
  const legacy = LegacyBackup.serialize({
    schema: 'FlipgameLocalSaveV1', version: 1,
    storage: {
      'flipgame.progression.v3': {
        schema: 'ProgressionStateV3', version: 3, qualifyingWins: 12,
        ownedObjectIds: ['bottle', 'tall-buildings', 'giraffe'],
        ownedCosmeticIds: [], achievementIds: ['first_flip'],
        claimedRewardIds: ['object.tall-buildings', 'object.giraffe'],
      },
      'flipgame.setup.v2': { selectedSkin: 'giraffe',
        selectedVariantId: 'giraffe.very-cherry' },
      'flipgame.records.v2': { qualifyingWins: 12,
        history: [{ objectId: 'tall-buildings' }, { objectId: 'giraffe' }] },
    },
  }, { releaseVersion: 'v1.11', createdAt: 1 });
  const parsed = Backup.parse(legacy);
  assert.equal(parsed.payload.profileV4.flipLevel, 12);
  assert.ok(parsed.payload.profileV4.ownedObjectIds.includes('mechanical-metronome'));
  assert.ok(parsed.payload.profileV4.ownedObjectIds.includes('desk-gyroscope'));
  assert.equal(parsed.payload.setupSelection.selectedSkin, 'desk-gyroscope');
  assert.equal(parsed.payload.profileV4.achievementIds.includes('first_flip'), true);
  assert.deepEqual(parsed.payload.profileV4.pendingRevealIds, [], 'migration never reannounces');
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.payload.sections['flipgame.records.v2'].history)),
    [{ objectId: 'tall-buildings' }, { objectId: 'giraffe' }]);
  const h = harness();
  const imported = h.runtime.importBackup(legacy, {});
  assert.equal(imported.imported, true);
  assert.equal(imported.state.flipLevel, 12);
  assert.equal(new Set(imported.state.fcTransactions.map((tx) => tx.idempotencyKey)).size,
    imported.state.fcTransactions.length,
    'migration-kind level transactions coalesce with canonical live grants');
  h.runtime.close();
}

function testMaliciousAndFutureImportsAreRejectedAtomically() {
  const h = harness();
  const before = h.store.snapshot();
  const valid = JSON.parse(h.runtime.exportBackup({}, { createdAt: 2 }));
  valid.payload.profileV4.fxp = 3705;
  assert.equal(Backup.validate(JSON.stringify(valid)).valid, false, 'checksum tampering is rejected');

  const futureProfile = { ...before, version: 99 };
  const future = LegacyBackup.serialize({ schema: 'FlipgameLocalSaveV2', version: 2,
    profileV4: futureProfile, setupSelection: {} }, { createdAt: 3 });
  assert.equal(Backup.validate(future).valid, false);

  const duplicateLedgerProfile = clone(before);
  duplicateLedgerProfile.fcTransactions = [
    { schema: 'FcTransactionV1', version: 1, txId: 'x', idempotencyKey: 'x',
      kind: 'earn', sourceType: 'migration', sourceId: 'x', signedAmount: 10,
      balanceAfter: 10, timestamp: 0 },
    { schema: 'FcTransactionV1', version: 1, txId: 'x', idempotencyKey: 'x',
      kind: 'earn', sourceType: 'migration', sourceId: 'x', signedAmount: 10,
      balanceAfter: 20, timestamp: 0 },
  ];
  duplicateLedgerProfile.fcBalance = 20;
  const duplicateLedger = LegacyBackup.serialize({ schema: 'FlipgameLocalSaveV2', version: 2,
    profileV4: duplicateLedgerProfile, setupSelection: {} }, { createdAt: 4 });
  assert.equal(Backup.validate(duplicateLedger).valid, false);

  const duplicateIdsProfile = clone(before);
  duplicateIdsProfile.ownedObjectIds = ['bottle', 'bottle'];
  const duplicateIds = LegacyBackup.serialize({ schema: 'FlipgameLocalSaveV2', version: 2,
    profileV4: duplicateIdsProfile, setupSelection: {} }, { createdAt: 5 });
  assert.equal(Backup.validate(duplicateIds).valid, false);

  const unsupportedLegacyContent = clone(before);
  unsupportedLegacyContent.legacy.reconciledV111 = true;
  unsupportedLegacyContent.ownedCosmeticIds = ['future.fake-cosmetic'];
  const unsupportedLegacy = LegacyBackup.serialize({ schema: 'FlipgameLocalSaveV2', version: 2,
    profileV4: unsupportedLegacyContent, setupSelection: {} }, { createdAt: 5 });
  assert.equal(Backup.validate(unsupportedLegacy).valid, false,
    'legacy metadata cannot make unsupported future content active');

  const pollution = '{"schema":"FlipgameSaveBackupV1","version":1,"releaseVersion":"v1.12",' +
    '"createdAt":1,"payload":{"__proto__":{"polluted":true}},' +
    '"checksum":{"algorithm":"crc32-canonical-json-v1","value":"00000000"}}';
  assert.equal(Backup.validate(pollution).valid, false);
  assert.equal({}.polluted, undefined);
  assert.deepEqual(h.store.snapshot(), before, 'rejected imports cannot partially mutate profile state');

  const durableBytesBeforeHostile = h.storage.dump()[Profile.storageKey];
  let topLevelGetterCalls = 0;
  const oversizedAfterGetter = {};
  Object.defineProperty(oversizedAfterGetter, 'ownedObjectIds', { enumerable: true,
    get() { topLevelGetterCalls++; throw new Error('must never invoke top-level getter'); } });
  Object.keys(before).forEach((key) => {
    if (key !== 'ownedObjectIds' && key !== 'fcTransactions') oversizedAfterGetter[key] = clone(before[key]);
  });
  oversizedAfterGetter.fcTransactions = new Array(Profile.retentionPolicy.fcTransactions + 1);
  assert.throws(() => h.store.mergeImportedState(oversizedAfterGetter,
    'hostile-oversized-after-getter'), /oversized or invalid fcTransactions/);
  assert.equal(topLevelGetterCalls, 0,
    'collection preflight uses own descriptors and never invokes an earlier getter');

  let nestedGetterCalls = 0;
  const unknownAfterHostileArray = clone(before);
  Object.defineProperty(unknownAfterHostileArray.ownedObjectIds, '0', { enumerable: true,
    get() { nestedGetterCalls++; throw new Error('must never walk array before key preflight'); } });
  Object.defineProperty(unknownAfterHostileArray, 'futureUnknownStructure', {
    enumerable: true, value: { deeply: { nested: true } },
  });
  assert.throws(() => h.store.mergeImportedState(unknownAfterHostileArray,
    'hostile-unknown-after-array'), /unsupported field: futureUnknownStructure/);
  assert.equal(nestedGetterCalls, 0,
    'unknown top-level fields fail before semantic traversal of earlier collections');

  let lateGetterCalls = 0;
  const lateGetter = clone(before);
  Object.defineProperty(lateGetter, 'matchReceipts', { enumerable: true,
    get() { lateGetterCalls++; throw new Error('must never invoke late getter'); } });
  assert.throws(() => h.store.mergeImportedState(lateGetter,
    'hostile-late-getter'), /fields must be plain own values/);
  assert.equal(lateGetterCalls, 0);
  assert.deepEqual(h.store.snapshot(), before,
    'every hostile preflight rejection leaves live memory unchanged');
  assert.equal(h.storage.dump()[Profile.storageKey], durableBytesBeforeHostile,
    'every hostile preflight rejection leaves durable bytes unchanged');
  h.runtime.close();

  const source = harness();
  const target = harness();
  earnFixtureFc(source.store, 100, 'ledger-source');
  earnFixtureFc(target.store, 200, 'ledger-target');
  const collision = source.runtime.exportBackup({}, { createdAt: 6 });
  const targetBefore = target.store.snapshot();
  const collisionImport = target.runtime.importBackup(collision, {});
  assert.equal(collisionImport.imported, true);
  assert.equal(target.store.snapshot().fcBalance, targetBefore.fcBalance,
    'independent backup ledgers reconcile to a balance floor and are never summed');
  assert.equal(target.runtime.importBackup(collision, {}).duplicate, true);
  source.runtime.close(); target.runtime.close();
}

function testWriteThenThrowRollbackAndFailClosedPoisoning() {
  function adversarialStorage() {
    const values = Object.create(null);
    let throwsRemaining = 0;
    return {
      getItem(key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
      setItem(key, value) {
        values[key] = String(value);
        if (throwsRemaining > 0) { throwsRemaining--; throw new Error('write completed, then threw'); }
      },
      removeItem(key) { delete values[key]; },
      throwAfterWrites(count) { throwsRemaining = count; },
      bytes(key) { return this.getItem(key); },
    };
  }

  const storage = adversarialStorage();
  const store = Profile.createTestStore({ storage, now: () => 50 });
  const memoryBefore = store.snapshot();
  const bytesBefore = storage.bytes(Profile.storageKey);
  storage.throwAfterWrites(1);
  const committed = store.claimAchievement('atomic-write-then-throw', 'notable');
  assert.equal(committed.applied, true);
  assert.notDeepEqual(store.snapshot(), memoryBefore);
  // A storage adapter may durably write and then throw. Exact candidate
  // readback is the observable commit point, so memory and restart must both
  // adopt that committed revision instead of attempting a hazardous rollback.
  assert.notEqual(storage.bytes(Profile.storageKey), bytesBefore);
  assert.deepEqual(Profile.createTestStore({ storage }).snapshot(), store.snapshot(),
    'restart observes the exact readback-confirmed commit');

  function ambiguousStorage() {
    const values = Object.create(null);
    let corruptingWrites = 0;
    let rejectRemovals = false;
    return {
      getItem(key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
      setItem(key, value) {
        if (corruptingWrites > 0) {
          values[key] = `{corrupt-${corruptingWrites}`;
          corruptingWrites--;
          throw new Error('ambiguous corrupt write');
        }
        values[key] = String(value);
      },
      removeItem(key) {
        if (rejectRemovals) throw new Error('journal removal rejected');
        delete values[key];
      },
      corruptNextWrites(count) { corruptingWrites = count; rejectRemovals = true; },
      bytes(key) { return this.getItem(key); },
    };
  }
  const poisonedStorage = ambiguousStorage();
  const poisoned = Profile.createTestStore({ storage: poisonedStorage, now: () => 51 });
  const poisonBefore = poisonedStorage.bytes(Profile.storageKey);
  poisonedStorage.corruptNextWrites(2);
  const poisonedResult = poisoned.claimAchievement('atomic-rollback-throws', 'notable');
  assert.equal(poisonedResult.reason, 'persistence-closed');
  assert.equal(poisoned.persistenceStatus().closed, true, 'an uncertain adapter is permanently failed closed');
  assert.equal(poisonedStorage.bytes(Profile.storageKey), poisonBefore,
    'a failed journal preparation never touches the authoritative profile');
  assert.ok(poisonedStorage.bytes(Profile.journalStorageKey),
    'an unremovable corrupt journal remains visible so restart fails closed');
  assert.throws(() => Profile.createTestStore({ storage: poisonedStorage }), /corrupt/,
    'restart deterministically rejects ambiguous corrupt bytes');
  assert.equal(poisoned.claimAchievement('atomic-after-poison', 'notable').reason,
    'persistence-closed');
}

function testJournalCrashRecoveryMatrix() {
  function controlledStorage(seed = {}) {
    const values = Object.assign(Object.create(null), seed);
    let controls = Object.create(null);
    return {
      getItem(key) {
        const normal = () => Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
        return controls.get ? controls.get(key, normal, values) : normal();
      },
      setItem(key, value) {
        const normal = () => { values[key] = String(value); };
        return controls.set ? controls.set(key, String(value), normal, values) : normal();
      },
      removeItem(key) {
        const normal = () => { delete values[key]; };
        return controls.remove ? controls.remove(key, normal, values) : normal();
      },
      control(next) { controls = next || Object.create(null); },
      bytes(key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
    };
  }

  // Candidate bytes can cross the adapter boundary before setItem throws.  An
  // exact readback is safe to carry through the committed marker.
  {
    const storage = controlledStorage();
    const store = Profile.createTestStore({ storage, now: () => 501 });
    let thrown = false;
    storage.control({ set(key, value, normal) {
      normal();
      if (key === Profile.storageKey && !thrown) {
        thrown = true;
        throw new Error('primary write completed then threw');
      }
    } });
    const result = store.claimAchievement('journal-primary-write-then-throw', 'common');
    assert.equal(result.applied, true);
    storage.control();
    assert.deepEqual(Profile.createTestStore({ storage }).snapshot(), store.snapshot(),
      'an exact write-then-throw commits once and survives restart');
  }

  // If primary readback itself is unavailable, the prepared marker remains the
  // decision record.  Restart selects the old bytes and the next writer repairs
  // both keys before attempting a new transaction.
  {
    const storage = controlledStorage();
    const store = Profile.createTestStore({ storage, now: () => 502 });
    const before = store.snapshot();
    let unreadable = false;
    let armed = true;
    storage.control({
      set(key, _value, normal) {
        normal();
        if (key === Profile.storageKey && armed) { armed = false; unreadable = true; }
      },
      get(key, normal) {
        if (key === Profile.storageKey && unreadable) {
          unreadable = false;
          throw new Error('primary readback unavailable');
        }
        return normal();
      },
    });
    const failed = store.claimAchievement('journal-unreadable-readback', 'common');
    assert.equal(failed.reason, 'persistence-closed');
    assert.deepEqual(store.snapshot(), before);
    assert.match(storage.bytes(Profile.journalStorageKey), /"phase":"prepared"/);
    storage.control();
    const restarted = Profile.createTestStore({ storage, now: () => 503 });
    assert.deepEqual(restarted.snapshot(), before,
      'prepared recovery never promotes an unreadable candidate write');
    assert.equal(restarted.claimAchievement('journal-after-unreadable-restart', 'common').applied, true);
    assert.equal(storage.bytes(Profile.journalStorageKey), null,
      'the next authorized writer completes prepared-journal recovery');
    assert.equal(restarted.snapshot().achievementIds.includes('journal-unreadable-readback'), false);
  }

  // A storage implementation that substitutes another syntactically valid V4
  // value is not allowed to trick the commit verifier.
  {
    const storage = controlledStorage();
    const store = Profile.createTestStore({ storage, now: () => 504 });
    const before = store.snapshot();
    let replaced = false;
    storage.control({ set(key, value, normal, values) {
      if (key === Profile.storageKey && !replaced) {
        replaced = true;
        const other = JSON.parse(value);
        other.legacy.qualifyingWins += 1;
        values[key] = JSON.stringify(other);
        throw new Error('adapter substituted a different valid snapshot');
      }
      normal();
    } });
    const failed = store.claimAchievement('journal-different-valid-write', 'common');
    assert.equal(failed.reason, 'persistence-failed');
    assert.equal(store.persistenceStatus().closed, false);
    assert.deepEqual(store.snapshot(), before);
    assert.equal(storage.bytes(Profile.storageKey), JSON.stringify(before));
    assert.equal(storage.bytes(Profile.journalStorageKey), null);
    storage.control();
    assert.equal(store.claimAchievement('journal-after-valid-rollback', 'common').applied, true);
  }

  // If that exact rollback also fails, the live writer closes.  The prepared
  // journal still gives restart one deterministic old state; it is never forced
  // to choose the substituted primary bytes.
  {
    const storage = controlledStorage();
    const store = Profile.createTestStore({ storage, now: () => 505 });
    const before = store.snapshot();
    let primaryWrites = 0;
    storage.control({ set(key, value, normal, values) {
      if (key !== Profile.storageKey) return normal();
      primaryWrites++;
      if (primaryWrites === 1) {
        const other = JSON.parse(value);
        other.legacy.qualifyingWins += 1;
        values[key] = JSON.stringify(other);
        throw new Error('candidate substituted');
      }
      throw new Error('rollback rejected');
    } });
    const failed = store.claimAchievement('journal-rollback-failure', 'common');
    assert.equal(failed.reason, 'persistence-closed');
    assert.equal(store.persistenceStatus().closed, true);
    assert.deepEqual(store.snapshot(), before);
    assert.match(storage.bytes(Profile.journalStorageKey), /"phase":"prepared"/);
    assert.notEqual(storage.bytes(Profile.storageKey), JSON.stringify(before));
    storage.control();
    const restarted = Profile.createTestStore({ storage, now: () => 506 });
    assert.deepEqual(restarted.snapshot(), before);
    assert.equal(restarted.claimAchievement('journal-after-rollback-restart', 'common').applied, true);
    assert.equal(storage.bytes(Profile.journalStorageKey), null);
  }

  // Failure to remove an exact committed marker is recoverable: both current
  // and restarted readers select candidateBytes, and cleanup can be retried.
  {
    const storage = controlledStorage();
    const store = Profile.createTestStore({ storage, now: () => 507 });
    let rejected = false;
    storage.control({ remove(key, normal) {
      if (key === Profile.journalStorageKey && !rejected) {
        rejected = true;
        throw new Error('committed marker removal rejected');
      }
      normal();
    } });
    const result = store.claimAchievement('journal-committed-marker-left', 'common');
    assert.equal(result.applied, true);
    assert.match(storage.bytes(Profile.journalStorageKey), /"phase":"committed"/);
    storage.control();
    const restarted = Profile.createTestStore({ storage, now: () => 508 });
    assert.deepEqual(restarted.snapshot(), store.snapshot());
    assert.equal(restarted.claimAchievement('journal-cleanup-after-restart', 'common').applied, true);
    assert.equal(storage.bytes(Profile.journalStorageKey), null);
  }

  assert.throws(() => Profile.createTestStore({ storage: controlledStorage({
    [Profile.journalStorageKey]: '{not-a-journal',
  }) }), /journal is corrupt/,
  'an unrecoverable journal fails closed at construction instead of guessing');
  assert.throws(() => Profile.createTestStore({ storage: controlledStorage({
    [Profile.journalStorageKey]: JSON.stringify({ schema: 'ProfileCommitJournalV1',
      version: 1, phase: 'committed', previousBytes: null, candidateBytes: '{}' }),
  }) }), /unsupported authoritative bytes/,
  'a well-formed marker cannot make a non-profile candidate authoritative');
}

function testQueuedMonotonicProfileAndRuntimeNotifications() {
  const profileStore = Profile.createTestStore({ storage: Profile.createMemoryStorage(), now: () => 60 });
  const start = profileStore.snapshot().revision;
  const a = []; const b = []; const c = [];
  const selfSeen = [];
  let nested = false;
  profileStore.subscribe((state) => {
    a.push(state.revision);
    if (!nested) {
      nested = true;
      profileStore.subscribe((next) => c.push(next.revision));
      profileStore.claimAchievement('notify-profile-second', 'common');
    }
  });
  profileStore.subscribe(() => { throw new Error('subscriber failure is isolated'); });
  profileStore.subscribe((state) => b.push(state.revision));
  let unsubscribeSelf;
  unsubscribeSelf = profileStore.subscribe((state) => {
    selfSeen.push(state.revision); unsubscribeSelf();
  });
  let leakedCalls = 0;
  assert.throws(() => profileStore.subscribe(() => { leakedCalls++; throw new Error('initial'); },
    { emitCurrent: true }), /initial/);
  profileStore.claimAchievement('notify-profile-first', 'common');
  assert.deepEqual(a, [start + 1, start + 2]);
  assert.deepEqual(b, [start + 1, start + 2]);
  assert.deepEqual(c, [start + 2], 'a listener added mid-delivery waits for the next event');
  assert.deepEqual(selfSeen, [start + 1], 'a listener may unsubscribe itself without disturbing delivery');
  assert.equal(leakedCalls, 1, 'a throwing initial subscription is never retained');

  const h = harness();
  const runtimeStart = h.store.snapshot().revision;
  const ra = []; const rb = []; const rc = [];
  const runtimeSelfSeen = [];
  let runtimeNested = false;
  h.runtime.subscribe((state, event) => {
    if (event.type !== 'profile-commit') return;
    ra.push(state.revision);
    if (!runtimeNested) {
      runtimeNested = true;
      h.runtime.subscribe((next, nextEvent) => {
        if (nextEvent.type === 'profile-commit') rc.push(next.revision);
      }, { emitCurrent: false });
      h.store.claimAchievement('notify-runtime-second', 'common');
    }
  }, { emitCurrent: false });
  h.runtime.subscribe(() => { throw new Error('runtime subscriber failure'); }, { emitCurrent: false });
  h.runtime.subscribe((state, event) => {
    if (event.type === 'profile-commit') rb.push(state.revision);
  }, { emitCurrent: false });
  let detachRuntimeSelf;
  detachRuntimeSelf = h.runtime.subscribe((state, event) => {
    if (event.type === 'profile-commit') { runtimeSelfSeen.push(state.revision); detachRuntimeSelf(); }
  }, { emitCurrent: false });
  let runtimeLeak = 0;
  assert.throws(() => h.runtime.subscribe(() => { runtimeLeak++; throw new Error('runtime initial'); }),
    /runtime initial/);
  h.store.claimAchievement('notify-runtime-first', 'common');
  assert.deepEqual(ra, [runtimeStart + 1, runtimeStart + 2]);
  assert.deepEqual(rb, [runtimeStart + 1, runtimeStart + 2]);
  assert.deepEqual(rc, [runtimeStart + 2]);
  assert.deepEqual(runtimeSelfSeen, [runtimeStart + 1]);
  assert.equal(runtimeLeak, 1);
  h.runtime.close();
}

function testSemanticImportQuarantineAndNoSuppression() {
  const h = harness();
  const inconsistent = clone(h.store.snapshot());
  inconsistent.claimedRewardIds.push('level.4.object.milk-carton');
  assert.throws(() => Profile.validateImportedState(inconsistent), /unsupported|lacks ownership/,
    'claimed Milk at FL1 without ownership is rejected');

  const missingAchievement = clone(h.store.snapshot());
  missingAchievement.processedClaimIds.push('achievement:not-earned');
  const reconciledMissing = Profile.validateImportedState(missingAchievement);
  assert.equal(reconciledMissing.processedClaimIds.includes('achievement:not-earned'), false,
    'unsupported imported suppression evidence is quarantined');

  const unpaidAchievement = clone(h.store.snapshot());
  unpaidAchievement.achievementIds.push('first_flip');
  unpaidAchievement.processedClaimIds.push('achievement:first_flip');
  const reconciledUnpaid = Profile.validateImportedState(unpaidAchievement);
  assert.equal(reconciledUnpaid.achievementIds.includes('first_flip'), true,
    'the imported entitlement survives reconciliation');
  assert.equal(reconciledUnpaid.processedClaimIds.includes('achievement:first_flip'), false,
    'entitlement without exact reward evidence cannot suppress the real award');

  const impossibleCursor = clone(h.store.snapshot());
  impossibleCursor.matchClaimCursor = 1;
  impossibleCursor.consumedMatchOrdinal = 2;
  assert.throws(() => Profile.validateImportedState(impossibleCursor), /exceeds its cursor/);

  const source = harness();
  const sourceState = clone(source.store.snapshot());
  sourceState.processedClaimIds.push('match:future-local-id');
  sourceState.revision++;
  const document = LegacyBackup.serialize({ schema: 'FlipgameLocalSaveV2', version: 2,
    profileV4: sourceState, setupSelection: {}, sections: {} }, { releaseVersion: 'v1.12', createdAt: 70 });
  const quarantined = Backup.parse(document).payload.profileV4;
  assert.equal(quarantined.processedClaimIds.includes('match:future-local-id'), false);
  assert.equal(quarantined.legacy.compactedLegacyClaims, 1,
    'legacy external match identities become bounded quarantine evidence');
  const target = harness();
  assert.equal(target.runtime.importBackup(document, {}).imported, true);
  assert.equal(target.store.snapshot().processedClaimIds.includes('match:future-local-id'), false,
    'external processed IDs are quarantined instead of entering local idempotence');
  assert.equal(reserveAndClaim(target, 'future-local-id').applied, true,
    'an imported future ID cannot suppress a later reserved local match');

  const legacyAchievementSeed = {
    'flipgame.achievements.v3': JSON.stringify({ earned: [{ id: 'legacy-import-achievement' }] }),
  };
  const achievementSource = harness(legacyAchievementSeed);
  const achievementTarget = harness(legacyAchievementSeed);
  assert.equal(achievementSource.store.claimAchievement('legacy-import-achievement', 'common').applied, true);
  assert.equal(achievementTarget.runtime.importBackup(
    achievementSource.runtime.exportBackup({}, { createdAt: 71 }), {}).imported, true);
  const importedUnprovenAward = achievementTarget.store.claimAchievement(
    'legacy-import-achievement', 'common');
  assert.equal(importedUnprovenAward.applied, true,
    'an arbitrary imported achievement cannot suppress a later evaluator-issued award');
  achievementSource.runtime.close(); achievementTarget.runtime.close();
  source.runtime.close(); target.runtime.close(); h.runtime.close();
}

function testCanonicalImportedRewardProvenance() {
  const evaluator = Achievements.createEvaluator();
  const award = evaluator.evaluate({ schema: 'AchievementEvaluationV1', version: 1,
    context: { qualifying: true, humanParticipant: true, totalFlipsLifetime: 1 },
    earnedIds: [] }).awards.find((entry) => entry.achievement.id === 'first_flip');
  assert.ok(award, 'the canonical evaluator issues first_flip evidence');

  // A production-semantic store has no string-and-rarity back door.  It accepts
  // only evidence issued by the construction-time evaluator authority.
  const unavailable = Profile.createTestStore({ storage: Profile.createMemoryStorage(),
    productionSemantics: true });
  assert.throws(() => unavailable.claimAchievement(award.rewardEvidence),
    /authority is unavailable/);
  const authoritative = Profile.createTestStore({ storage: Profile.createMemoryStorage(),
    productionSemantics: true, achievementAuthority: evaluator.rewardAuthority,
    now: () => 700 });
  assert.equal(authoritative.claimAchievement(award.rewardEvidence).applied, true);
  assert.throws(() => authoritative.claimAchievement(
    Object.freeze({ schema: 'AchievementRewardEvidenceV1', version: 1 })),
  /not evaluator-issued/);
  const exactEvaluator = Achievements.createEvaluator();
  const exactAchievementTarget = Profile.createTestStore({
    storage: Profile.createMemoryStorage(), productionSemantics: true,
    achievementAuthority: exactEvaluator.rewardAuthority, now: () => 700,
  });
  assert.equal(exactAchievementTarget.mergeImportedState(authoritative.snapshot(),
    'exact-achievement-import').applied, true);
  const exactAward = exactEvaluator.evaluate({ schema: 'AchievementEvaluationV1', version: 1,
    context: { qualifying: true, humanParticipant: true, totalFlipsLifetime: 1 },
    earnedIds: [] }).awards.find((entry) => entry.achievement.id === 'first_flip');
  assert.equal(exactAchievementTarget.claimAchievement(exactAward.rewardEvidence).reason,
    'duplicate', 'complete canonical achievement provenance survives import exactly once');
  const duplicateEvidence = clone(authoritative.snapshot());
  duplicateEvidence.rewardedAchievementIds.push('first_flip');
  assert.throws(() => Profile.validateImportedState(duplicateEvidence),
    /duplicate rewardedAchievementIds/,
  'reward reconciliation does not silently deduplicate malformed evidence');
  const oversizedEvidence = clone(authoritative.snapshot());
  oversizedEvidence.rewardedAchievementIds = Array.from({ length: 121 },
    (_, index) => `bounded-achievement-evidence-${index}`);
  assert.throws(() => Profile.validateImportedState(oversizedEvidence),
    /invalid rewardedAchievementIds/,
  'reward evidence is cardinality-checked before quarantine can shrink it');

  // Start from the exact canonical local award, then corrupt its transaction
  // provenance while keeping every superficial completion flag.  Import must
  // retain the earned badge but must not let it suppress a later real reward.
  const forgedAchievement = clone(authoritative.snapshot());
  const firstFlipTx = forgedAchievement.fcTransactions.find((tx) =>
    tx.sourceType === 'achievement' && tx.sourceId === 'first_flip');
  firstFlipTx.kind = 'migration';
  firstFlipTx.sourceType = 'migration';
  const reconciled = Profile.validateImportedState(forgedAchievement);
  assert.ok(reconciled.achievementIds.includes('first_flip'));
  assert.equal(reconciled.rewardedAchievementIds.includes('first_flip'), false);
  assert.equal(reconciled.processedClaimIds.includes('achievement:first_flip'), false);
  const targetEvaluator = Achievements.createEvaluator();
  const target = Profile.createTestStore({ storage: Profile.createMemoryStorage(),
    productionSemantics: true, achievementAuthority: targetEvaluator.rewardAuthority,
    now: () => 701 });
  assert.equal(target.mergeImportedState(forgedAchievement, 'forged-achievement-import').applied, true);
  const targetAward = targetEvaluator.evaluate({ schema: 'AchievementEvaluationV1', version: 1,
    context: { qualifying: true, humanParticipant: true, totalFlipsLifetime: 1 },
    earnedIds: [] }).awards.find((entry) => entry.achievement.id === 'first_flip');
  const beforeAchievementReward = target.snapshot();
  const awarded = target.claimAchievement(targetAward.rewardEvidence);
  assert.equal(awarded.applied, true);
  assert.equal(awarded.baseFcAwarded, 10);
  assert.equal(target.snapshot().fxp, beforeAchievementReward.fxp + 15);
  assert.ok(target.snapshot().fcBalance >= beforeAchievementReward.fcBalance + 10,
    'the canonical award and any crossed-level FC are granted together');

  // Rival/act completion and ownership alone are likewise insufficient.  Each
  // legitimate first-clear reward remains claimable unless its exact canonical
  // FC identity, processed claim, linked entitlement, and FXP floor all agree.
  const rivalSource = clone(Profile.migrateV111({}));
  rivalSource.lineageId = 'forged-rival-lineage';
  rivalSource.revision = 3;
  rivalSource.defeatedRivalIds = ['first-light'];
  rivalSource.rewardedRivalIds = ['first-light'];
  rivalSource.ownedObjectIds.push('coffee-mug');
  rivalSource.processedClaimIds.push('rival.first-light.first-clear');
  const rivalTarget = Profile.createTestStore({ storage: Profile.createMemoryStorage(), now: () => 702 });
  assert.equal(rivalTarget.mergeImportedState(rivalSource, 'completion-only-rival').applied, true);
  assert.equal(rivalTarget.snapshot().rewardedRivalIds.includes('first-light'), false);
  const rivalBefore = rivalTarget.snapshot();
  const rivalReward = rivalTarget.claimRivalVictory('first-light');
  assert.equal(rivalReward.applied, true);
  assert.equal(rivalReward.baseFcAwarded, 15);
  assert.equal(rivalTarget.snapshot().fxp, rivalBefore.fxp + 25);
  assert.ok(rivalTarget.snapshot().fcBalance >= rivalBefore.fcBalance + 15);

  const actSource = clone(Profile.migrateV111({}));
  actSource.lineageId = 'forged-act-lineage';
  actSource.revision = 4;
  actSource.completedActIds = ['1'];
  actSource.rewardedActIds = ['1'];
  actSource.fieldNoteIds = ['field-note-act-1'];
  actSource.processedClaimIds.push('story.act.1.first-clear');
  const actTarget = Profile.createTestStore({ storage: Profile.createMemoryStorage(), now: () => 703 });
  assert.equal(actTarget.mergeImportedState(actSource, 'completion-only-act').applied, true);
  assert.equal(actTarget.snapshot().rewardedActIds.includes('1'), false);
  const actBefore = actTarget.snapshot();
  const actReward = actTarget.claimStoryAct('1');
  assert.equal(actReward.applied, true);
  assert.equal(actReward.baseFcAwarded, 25);
  assert.equal(actTarget.snapshot().fxp, actBefore.fxp + 50);
  assert.ok(actTarget.snapshot().fcBalance >= actBefore.fcBalance + 25);

  // Conversely, an unmodified canonical backup has sufficient structural
  // provenance to suppress a second first-clear on another device.
  const exactSource = Profile.createTestStore({ storage: Profile.createMemoryStorage(), now: () => 704 });
  assert.equal(exactSource.claimRivalVictory('scatterline').applied, true);
  assert.equal(exactSource.claimStoryAct('2').applied, true);
  const exactTarget = Profile.createTestStore({ storage: Profile.createMemoryStorage(), now: () => 705 });
  assert.equal(exactTarget.mergeImportedState(exactSource.snapshot(), 'exact-story-import').applied, true);
  assert.equal(exactTarget.claimRivalVictory('scatterline').reason, 'duplicate');
  assert.equal(exactTarget.claimStoryAct('2').reason, 'duplicate');
}

function testExternalFcHighWaterBlocksReplayAfterSpendAndCompaction() {
  const source = harness();
  const target = harness();
  earnFixtureFc(source.store, 500, 'external-fc-source');
  const sourceBalance = source.store.snapshot().fcBalance;
  const originalDocument = source.runtime.exportBackup({ source: 'external-fc' }, { createdAt: 710 });
  const firstImport = target.runtime.importBackup(originalDocument, {});
  assert.equal(firstImport.imported, true);
  assert.equal(firstImport.profileResult.fcAdded, sourceBalance);
  assert.equal(target.runtime.purchaseCosmetic('finish.chrome').applied, true);
  const afterSpend = target.store.snapshot();

  const replayPayload = clone(Backup.parse(originalDocument).payload);
  replayPayload.sections = { source: 'same-profile-different-checksum' };
  const checksumVariant = LegacyBackup.serialize(replayPayload,
    { releaseVersion: 'v1.12', createdAt: 711 });
  const replay = target.runtime.importBackup(checksumVariant, {});
  assert.equal(replay.duplicate, true);
  assert.equal(target.store.snapshot().fcBalance, afterSpend.fcBalance,
    'a changed backup checksum cannot recharge FC already imported and spent');

  const ownOldBackup = target.runtime.exportBackup({ before: 'own-spend' }, { createdAt: 712 });
  assert.equal(target.runtime.purchaseCosmetic('trail.sparks').applied, true);
  const afterOwnSpend = target.store.snapshot();
  const ownReplay = target.runtime.importBackup(ownOldBackup, {});
  assert.equal(ownReplay.duplicate, true);
  assert.equal(target.store.snapshot().fcBalance, afterOwnSpend.fcBalance,
    'an older backup of the active lineage cannot restore locally spent FC');

  const compacted = clone(Profile.migrateV111({}));
  compacted.lineageId = 'compacted-external-ledger';
  compacted.revision = 40;
  compacted.fcBalance = 500;
  compacted.fcTransactions = [];
  compacted.fcTransactionRollup = {
    schema: 'FcLedgerSummaryV1', version: 1, netAmount: 500, transactionCount: 500,
  };
  const compactedState = Profile.ProgressionStateV4(compacted);
  const compactTarget = harness();
  assert.equal(compactTarget.store.mergeImportedState(compactedState, 'compacted-import-a').applied, true);
  assert.equal(compactTarget.runtime.purchaseCosmetic('finish.chrome').applied, true);
  const compactAfterSpend = compactTarget.store.snapshot();
  const compactReplay = clone(compactedState);
  compactReplay.revision++;
  compactReplay.legacy.compactedLegacyClaims++;
  const compactResult = compactTarget.store.mergeImportedState(compactReplay,
    'compacted-import-different-checksum');
  assert.equal(compactResult.applied, true,
    'new source metadata may advance without carrying another balance credit');
  assert.equal(compactResult.fcAdded, 0);
  assert.equal(compactTarget.store.snapshot().fcBalance, compactAfterSpend.fcBalance);

  const capacityState = clone(Profile.migrateV111({}));
  capacityState.lineageId = 'external-capacity-target';
  capacityState.revision = 2;
  capacityState.externalClaimEvidence = Array.from(
    { length: Profile.retentionPolicy.externalLineages }, (_, index) => ({
      lineageId: `known-external-${index}`, throughRevision: 10, fcHighWater: 100,
    }));
  const capacityStore = Profile.createTestStore({ storage: Profile.createMemoryStorage({
    [Profile.storageKey]: JSON.stringify(Profile.ProgressionStateV4(capacityState)),
  }), now: () => 713 });
  const unknown = clone(Profile.migrateV111({}));
  unknown.lineageId = 'unknown-external-at-capacity';
  unknown.revision = 3;
  unknown.fcBalance = 50;
  unknown.fcTransactions = [{ schema: 'FcTransactionV1', version: 1,
    txId: 'unknown-external-fc', idempotencyKey: 'unknown-external-fc',
    kind: 'migration', sourceType: 'migration', sourceId: 'unknown-external',
    signedAmount: 50, balanceAfter: 50, timestamp: 0 }];
  const capacityBefore = capacityStore.snapshot();
  const refused = capacityStore.mergeImportedState(Profile.ProgressionStateV4(unknown),
    'external-over-capacity');
  assert.equal(refused.reason, 'import-lineage-capacity');
  assert.equal(refused.imported, false);
  assert.deepEqual(capacityStore.snapshot(), capacityBefore,
    'lineage capacity fails closed without evicting replay evidence or adding FC');
  assert.equal(capacityStore.snapshot().externalClaimEvidence.length,
    Profile.retentionPolicy.externalLineages);

  source.runtime.close(); target.runtime.close(); compactTarget.runtime.close();
}

function testExactReserveConsumeAbandonAndStoryBoundary() {
  const h = harness();
  assert.throws(() => h.store.claimMatch('raw-match-id', rewardInput()), /MatchClaimTokenV1/,
    'the direct Profile API cannot reward an opaque match ID');
  assert.equal(typeof h.store.claimBundle, 'undefined',
    'generic bundles cannot bypass match reservation because they are not public');
  assert.equal(typeof Profile.claimBundle, 'undefined',
    'the default browser API cannot bypass match reservation either');
  assert.throws(() => h.store.claimStoryMatchResolution({ matchId: 'raw-story', rewards: [],
    ordinaryRewardsEligible: true, rewardInput: rewardInput() }), /MatchClaimTokenV1/,
    'Story ordinary rewards require the same reservation token');

  const first = h.store.reserveMatch('reserved-one', 'free-play');
  assert.equal(first.applied, true);
  assert.equal(h.store.reserveMatch('reserved-two', 'free-play').reason, 'another-match-active',
    'only one reward-bearing local match may be active');
  assert.deepEqual(h.store.resumeMatchReservation(), first.token);
  const restarted = Profile.createTestStore({ storage: h.storage, now: () => 12346 });
  assert.deepEqual(restarted.resumeMatchReservation(), first.token, 'a crash/reload resumes the exact token');
  const beforeAbandon = restarted.snapshot();
  const abandoned = restarted.abandonReservedMatch(first.token, 'user-left');
  assert.equal(abandoned.applied, true);
  assert.equal(abandoned.fxpAwarded, 0);
  assert.equal(abandoned.fcAwarded, 0);
  assert.equal(restarted.snapshot().fxp, beforeAbandon.fxp);
  assert.equal(restarted.consumeReservedMatch(first.token, rewardInput()).reason, 'duplicate',
    'an abandoned ordinal can never become valid later');

  const second = restarted.reserveMatch('reserved-two', 'free-play');
  assert.equal(second.token.ordinal, first.token.ordinal + 1);
  const consumed = restarted.consumeReservedMatch(second.token, rewardInput());
  assert.equal(consumed.applied, true);
  const afterConsume = restarted.snapshot();
  assert.equal(restarted.consumeReservedMatch(second.token, rewardInput()).reason, 'duplicate');
  assert.deepEqual(restarted.snapshot(), afterConsume);

  const storyReservation = restarted.reserveMatch('story-reserved', 'story');
  const storyResult = restarted.claimStoryMatchResolution({ matchId: 'story-reserved',
    matchClaimToken: storyReservation.token, rewards: [], ordinaryRewardsEligible: true,
    rewardInput: rewardInput() });
  assert.equal(storyResult.applied, true);
  assert.equal(storyResult.consumed, true);

  const activeForBackup = restarted.reserveMatch('backup-active', 'story');
  const backup = Backup.parse(Backup.serialize(restarted, {}, { createdAt: 75 }));
  assert.equal(backup.payload.profileV4.activeMatchReservation, null,
    'backup payloads quarantine rather than transfer live reservations');
  assert.ok(backup.payload.profileV4.legacy.quarantinedMatchReservations >= 1);
  const target = harness();
  target.runtime.importBackup(LegacyBackup.serialize(backup.payload,
    { releaseVersion: 'v1.12', createdAt: 76 }), {});
  assert.equal(target.store.resumeMatchReservation(), null);
  assert.equal(restarted.abandonReservedMatch(activeForBackup.token).applied, true);
  target.runtime.close(); h.runtime.close();

  const reentrant = Profile.createTestStore({ storage: Profile.createMemoryStorage(), now: () => 77 });
  const observed = [];
  let reentrantConsume = null;
  reentrant.subscribe((state, event) => {
    observed.push(state.revision);
    if (event.type === 'match-reserved') {
      reentrantConsume = reentrant.consumeReservedMatch(event.token, rewardInput());
    }
  });
  const reentrantReserve = reentrant.reserveMatch('reentrant-match', 'free-play');
  assert.equal(reentrantReserve.applied, true);
  assert.equal(reentrantConsume.applied, true);
  assert.deepEqual(observed, [reentrantReserve.state.revision, reentrantReserve.state.revision + 1],
    'reentrant consume queues behind reservation delivery and stays monotonic');
  assert.equal(reentrant.resumeMatchReservation(), null);
}

function testDurableImmutableMatchReceiptsAndCapacity() {
  const storage = Profile.createMemoryStorage();
  const first = Profile.createTestStore({ storage, now: () => 600 });

  const active = first.reserveMatch('receipt-active', 'free-play');
  assert.equal(active.applied, true);
  const repeatedActive = first.reserveMatch('receipt-active', 'free-play');
  assert.equal(repeatedActive.resumed, true);
  assert.equal(repeatedActive.reason, 'reservation-active');
  assert.equal(Object.prototype.hasOwnProperty.call(repeatedActive, 'token'), false,
    'same-match reserve does not reissue the bearer token');
  assert.deepEqual(first.resumeMatchReservation(), active.token,
    'the coordinator-private resume method is the sole recovery path for an active bearer');
  assert.equal(first.consumeReservedMatch(active.token, rewardInput()).applied, true);

  const afterConsume = Profile.createTestStore({ storage, now: () => 601 });
  const consumedRetry = afterConsume.reserveMatch('receipt-active', 'free-play');
  assert.equal(consumedRetry.reason, 'match-already-resolved');
  assert.equal(consumedRetry.resolution, 'consumed');
  assert.equal(Object.prototype.hasOwnProperty.call(consumedRetry, 'token'), false);

  const abandon = afterConsume.reserveMatch('receipt-abandoned', 'free-play');
  assert.equal(afterConsume.abandonReservedMatch(abandon.token, 'left').applied, true);
  const afterAbandon = Profile.createTestStore({ storage, now: () => 602 });
  const abandonedRetry = afterAbandon.reserveMatch('receipt-abandoned', 'free-play');
  assert.equal(abandonedRetry.reason, 'match-already-resolved');
  assert.equal(abandonedRetry.resolution, 'abandoned');
  assert.equal(Object.prototype.hasOwnProperty.call(abandonedRetry, 'token'), false);

  const receipts = afterAbandon.snapshot().matchReceipts;
  assert.deepEqual(receipts.map((entry) => [entry.matchId, entry.activityId, entry.resolution]), [
    ['receipt-active', 'free-play', 'consumed'],
    ['receipt-abandoned', 'free-play', 'abandoned'],
  ]);
  assert.ok(Object.isFrozen(Profile.MatchReceiptV1(receipts[0])));

  const capacity = Profile.retentionPolicy.matchReceipts;
  const full = clone(Profile.migrateV111({}));
  full.lineageId = 'receipt-capacity-lineage';
  full.revision = 10;
  full.matchClaimCursor = capacity;
  full.consumedMatchOrdinal = capacity;
  full.matchReceipts = Array.from({ length: capacity }, (_, index) => ({
    schema: 'MatchReceiptV1', version: 1,
    matchId: `bounded-match-${index + 1}`, activityId: 'free-play',
    ordinal: index + 1, resolution: index % 2 ? 'abandoned' : 'consumed',
  }));
  const fullState = Profile.ProgressionStateV4(full);
  const fullStorage = Profile.createMemoryStorage({
    [Profile.storageKey]: JSON.stringify(fullState),
  });
  const fullStore = Profile.createTestStore({ storage: fullStorage, now: () => 603 });
  const fullBefore = fullStore.snapshot();
  const fullBytes = fullStorage.dump()[Profile.storageKey];
  const refused = fullStore.reserveMatch('bounded-match-new', 'free-play');
  assert.equal(refused.reason, 'match-receipt-capacity');
  assert.equal(refused.applied, false);
  assert.equal(refused.duplicate, false);
  assert.deepEqual(fullStore.snapshot(), fullBefore,
    'capacity exhaustion fails before reserving or changing an ordinal');
  assert.equal(fullStorage.dump()[Profile.storageKey], fullBytes,
    'capacity exhaustion does not partially persist');
  assert.equal(fullStore.reserveMatch('bounded-match-1', 'free-play').resolution, 'consumed',
    'capacity never evicts old immutable match identities');
  assert.equal(fullStore.snapshot().matchReceipts.length, capacity);

  const duplicateMatchId = clone(fullState);
  duplicateMatchId.matchReceipts[1].matchId = duplicateMatchId.matchReceipts[0].matchId;
  assert.throws(() => Profile.ProgressionStateV4(duplicateMatchId), /identity is duplicated/);
  const unordered = clone(fullState);
  unordered.matchReceipts[1].ordinal = unordered.matchReceipts[0].ordinal;
  assert.throws(() => Profile.ProgressionStateV4(unordered), /ordinal.*duplicated|increasing ordinal/);
  const overflow = clone(fullState);
  overflow.matchReceipts.push({ schema: 'MatchReceiptV1', version: 1,
    matchId: 'bounded-overflow', activityId: 'free-play',
    ordinal: capacity + 1, resolution: 'consumed' });
  overflow.matchClaimCursor++;
  overflow.consumedMatchOrdinal++;
  assert.throws(() => Profile.ProgressionStateV4(overflow), /bounded array|capacity exceeds/);
}

function testRevealLineagePreventsStaleResurrection() {
  const target = harness();
  const staleAwards = reachFixtureLevel(target.store, 4, 'stale-reveal-fl4');
  target.store.dismissReveals(staleAwards.map((id) => `achievement.${id}`));
  const stalePayload = Backup.createPayload(target.store, {}, { marker: 'first' });
  const staleDocument = LegacyBackup.serialize(stalePayload, { releaseVersion: 'v1.12', createdAt: 80 });
  const dismissedId = target.store.snapshot().pendingRevealIds[0];
  target.runtime.dismissReveal(dismissedId);
  const revisionAfterDismiss = target.store.snapshot().revision;
  const differentPayload = clone(stalePayload);
  differentPayload.sections = { marker: 'different-checksum' };
  const differentDocument = LegacyBackup.serialize(differentPayload,
    { releaseVersion: 'v1.12', createdAt: 81 });
  const staleImport = target.runtime.importBackup(differentDocument, {});
  assert.equal(staleImport.imported, true);
  assert.equal(staleImport.duplicate, true,
    'a checksum-only change with no new content is a no-op import');
  assert.equal(target.store.snapshot().pendingRevealIds.includes(dismissedId), false,
    'equivalent stale content cannot resurrect a consumed reveal under a new checksum');
  assert.equal(target.store.snapshot().revision, revisionAfterDismiss,
    'a stale equivalent backup does not manufacture a revision');

  const source = harness();
  source.runtime.claimAchievement('fresh-imported-achievement', 'common');
  const newer = source.runtime.exportBackup({}, { createdAt: 82 });
  target.runtime.importBackup(newer, {});
  assert.equal(target.store.snapshot().pendingRevealIds.includes('achievement.fresh-imported-achievement'), true,
    'genuinely new pending content imports once');
  target.runtime.dismissReveal('achievement.fresh-imported-achievement');
  const newerPayload = clone(Backup.parse(newer).payload);
  newerPayload.sections = { marker: 'new-checksum-again' };
  target.runtime.importBackup(LegacyBackup.serialize(newerPayload,
    { releaseVersion: 'v1.12', createdAt: 83 }), {});
  assert.equal(target.store.snapshot().pendingRevealIds.includes('achievement.fresh-imported-achievement'), false);
  source.runtime.close(); target.runtime.close();
}

function testRefreshAcceptsOnlySemanticMonotonicExtensions() {
  // Two pristine read-only tabs begin with unrelated ephemeral lineages.  The
  // first durable writer establishes authority and the other must adopt it
  // before a safe Web Lock handoff.
  {
    const storage = Profile.createMemoryStorage();
    let firstWritable = false;
    let secondWritable = false;
    const first = Profile.createTestStore({ storage, now: () => 90,
      writeAuthority: () => firstWritable });
    const second = Profile.createTestStore({ storage, now: () => 91,
      writeAuthority: () => secondWritable });
    const ephemeralLineage = second.snapshot().lineageId;
    assert.notEqual(first.snapshot().lineageId, ephemeralLineage);
    firstWritable = true;
    const reservation = first.reserveMatch('lineage-first-durable', 'free-play');
    assert.equal(reservation.applied, true);
    const durable = first.snapshot();
    const adopted = second.refresh();
    assert.equal(adopted.lineageId, durable.lineageId);
    assert.notEqual(adopted.lineageId, ephemeralLineage);
    assert.deepEqual(adopted.activeMatchReservation, durable.activeMatchReservation);
    assert.equal(second.persistenceStatus().closed, false);
    assert.equal(second.abandonReservedMatch(second.resumeMatchReservation(), 'read-only').reason,
      'writer-read-only');

    firstWritable = false;
    secondWritable = true;
    assert.equal(second.abandonReservedMatch(second.resumeMatchReservation(), 'handoff').applied, true,
      'the new Web Lock owner can safely finish the exact durable reservation');
    const next = second.reserveMatch('lineage-after-handoff', 'free-play');
    assert.equal(next.applied, true);
    assert.equal(next.token.ordinal, reservation.token.ordinal + 1);
    assert.equal(second.abandonReservedMatch(next.token, 'cleanup').applied, true);
  }

  // A genuine same-lineage semantic extension is published exactly once.
  {
    const storage = Profile.createMemoryStorage();
    const first = Profile.createTestStore({ storage, now: () => 92 });
    const second = Profile.createTestStore({ storage, now: () => 93 });
    const events = [];
    first.subscribe((state, event) => events.push([state.revision, event.type]));
    second.claimAchievement('refresh-valid', 'common');
    const adopted = first.refresh();
    assert.equal(adopted.fxp, 15);
    assert.deepEqual(events, [[adopted.revision, 'external-refresh']]);
    first.refresh();
    assert.equal(events.length, 1, 'the same extension publishes exactly once');
  }

  // Once a tab has durable state, a different lineage is a split-brain fault,
  // not another first-writer opportunity.
  {
    const storage = Profile.createMemoryStorage();
    const store = Profile.createTestStore({ storage, now: () => 94 });
    const exact = store.snapshot();
    const other = clone(exact);
    other.lineageId = 'different-durable-lineage';
    other.revision++;
    storage.setItem(Profile.storageKey, JSON.stringify(other));
    assert.deepEqual(store.refresh(), exact);
    assert.equal(store.persistenceStatus().closed, true);
    assert.match(store.persistenceStatus().error, /lineage divergence/);
  }

  // A valid higher revision that drops an active reservation is non-monotonic.
  // It must poison immediately rather than merely being ignored.
  {
    const storage = Profile.createMemoryStorage();
    const store = Profile.createTestStore({ storage, now: () => 95 });
    const active = store.reserveMatch('refresh-active', 'free-play');
    const exact = store.snapshot();
    const forged = clone(exact);
    forged.revision++;
    forged.activeMatchReservation = null;
    assert.doesNotThrow(() => Profile.ProgressionStateV4(forged));
    storage.setItem(Profile.storageKey, JSON.stringify(forged));
    assert.deepEqual(store.refresh(), exact);
    assert.equal(store.persistenceStatus().closed, true);
    assert.match(store.persistenceStatus().error, /Non-monotonic/);
    assert.equal(store.consumeReservedMatch(active.token, rewardInput()).reason,
      'persistence-closed');
  }

  // Higher-revision metadata downgrades are valid shapes but invalid history.
  {
    const base = clone(Profile.migrateV111({}));
    base.lineageId = 'legacy-metadata-lineage';
    base.revision = 20;
    base.legacy = { reconciledV111: true, qualifyingWins: 22,
      sourceRelease: 'v1.11', grandfatheredAlien: true,
      grandfatheredInsane: true, quarantinedMatchReservations: 3,
      compactedLegacyClaims: 8 };
    const durable = Profile.ProgressionStateV4(base);
    const storage = Profile.createMemoryStorage({
      [Profile.storageKey]: JSON.stringify(durable),
    });
    const store = Profile.createTestStore({ storage, now: () => 96 });
    const downgrade = clone(durable);
    downgrade.revision++;
    downgrade.legacy = { reconciledV111: false, qualifyingWins: 1,
      sourceRelease: '', grandfatheredAlien: false,
      grandfatheredInsane: false, quarantinedMatchReservations: 0,
      compactedLegacyClaims: 0 };
    downgrade.matchClaimCursor = 1;
    downgrade.activeMatchReservation = {
      schema: 'MatchClaimTokenV1', version: 1, lineageId: downgrade.lineageId,
      ordinal: 1, nonce: 'valid-looking-nonce', matchId: 'legacy-downgrade-match',
      activityId: 'free-play', reservedAt: 96,
    };
    assert.doesNotThrow(() => Profile.ProgressionStateV4(downgrade));
    storage.setItem(Profile.storageKey, JSON.stringify(downgrade));
    assert.deepEqual(store.refresh(), durable,
      'refresh cannot downgrade reconciliation, counters, grandfathering, or source release');
    assert.equal(store.persistenceStatus().closed, true);
  }
}

function testBoundedHistoriesAndNoOpRevealDismissal() {
  const base = clone(Profile.migrateV111({}));
  base.lineageId = 'retention-fixture';
  base.revision = 1;
  base.achievementIds = ['retained-canonical-achievement'];
  base.rewardedAchievementIds = ['retained-canonical-achievement'];
  base.processedClaimIds = ['achievement:retained-canonical-achievement'].concat(
    Array.from({ length: Profile.retentionPolicy.legacyClaimIds + 300 },
      (_, index) => `match:obsolete-${index}`));
  base.fcTransactions = Array.from({ length: Profile.retentionPolicy.fcTransactions }, (_, index) => ({
    schema: 'FcTransactionV1', version: 1, txId: `bounded-tx:${index}`,
    idempotencyKey: `bounded-key:${index}`, kind: 'migration', sourceType: 'migration',
    sourceId: `bounded-source:${index}`, signedAmount: 1, balanceAfter: index + 1, timestamp: 0,
  }));
  base.fcBalance = base.fcTransactions.length;
  const storage = Profile.createMemoryStorage({ [Profile.storageKey]: JSON.stringify(base) });
  const store = Profile.createTestStore({ storage, now: () => 100 });
  assert.equal(typeof store.claimBundle, 'undefined',
    'legacy capacity cannot be bypassed through an unrestricted generic claim');
  const reservation = store.reserveMatch('bounded-safe-match', 'free-play');
  const result = store.consumeReservedMatch(reservation.token, rewardInput());
  assert.equal(result.applied, true);
  const state = store.snapshot();
  assert.deepEqual(state.processedClaimIds,
    ['achievement:retained-canonical-achievement'],
    'one-time local upgrade retains canonical entitlement identity only');
  assert.equal(state.legacy.compactedLegacyClaims,
    Profile.retentionPolicy.legacyClaimIds + 300);
  assert.equal(state.fcTransactions.length, Profile.retentionPolicy.fcTransactions);
  assert.ok(state.fcTransactionRollup.transactionCount >= 1);
  const after = store.snapshot();
  assert.equal(store.consumeReservedMatch(reservation.token, rewardInput()).reason, 'duplicate');
  assert.deepEqual(store.snapshot(), after,
    'a consumed exact match ordinal is never evicted or re-awarded');
  assert.ok(store.snapshot().processedClaimIds.includes('achievement:retained-canonical-achievement'),
    'canonical finite entitlement identities are never evicted');
  assert.match(Profile.retentionPolicy.idempotencePolicy, /no probabilistic/);
  assert.equal(Profile.retentionPolicy.canonicalEntitlementClaimIds, 177);
  assert.equal(Profile.retentionPolicy.maxDistinctRevealIds, 271);
  const beforeNoOp = store.snapshot();
  const noOp = store.dismissReveals(['object.milk-carton']);
  assert.equal(noOp.reason, 'empty');
  assert.deepEqual(store.snapshot(), beforeNoOp, 'no-op dismissals create neither revisions nor claims');

  const reloaded = Profile.createTestStore({ storage, now: () => 101 });
  assert.deepEqual(reloaded.snapshot(), store.snapshot(),
    'compacted legacy history is durable and does not repeat on reload');
}

function testCanonicalCardinalityBoundsCannotExhaustRevealHistory() {
  assert.equal(Profile.retentionPolicy.maxDistinctRevealIds, 271);
  assert.ok(Profile.retentionPolicy.pendingReveals > Profile.retentionPolicy.maxDistinctRevealIds);
  assert.ok(Profile.retentionPolicy.consumedRevealIds > Profile.retentionPolicy.maxDistinctRevealIds);
  const proof = {
    unlockableObjects: Catalog.counts.objects - 1,
    collectibleArenas: Catalog.counts.arenas - 1,
    features: 2,
    levelFc: Object.keys(Catalog.levelFc).length,
    achievements: 120,
    storeCosmetics: Catalog.counts.storeCosmetics,
  };
  assert.equal(Object.values(proof).reduce((sum, value) => sum + value, 0), 271);

  const h = harness();
  for (let index = 0; index < 120; index++) {
    assert.equal(h.store.claimAchievement(`finite-achievement-${index}`, 'common').applied, true);
  }
  const exact = h.store.snapshot();
  assert.throws(() => h.store.claimAchievement('finite-achievement-overflow', 'common'),
    /achievementIds.*bounded array|achievementIds exceeds the canonical v1\.12 cardinality/);
  assert.deepEqual(h.store.snapshot(), exact,
    'an out-of-catalog entitlement count cannot partially commit or consume reveal capacity');
  h.runtime.close();
}

function testStrictExternalPrimitivesAndSafeSetupCopies() {
  const h = harness();
  assert.equal(typeof h.store.claimBundle, 'undefined');
  assert.equal(typeof Profile.claimBundle, 'undefined');
  assert.throws(() => h.store.reserveMatch(1, 'free-play'), /exact string/);
  assert.throws(() => Profile.MatchClaimTokenV1({ schema: 'MatchClaimTokenV1', version: 1,
    lineageId: 'lineage', ordinal: '1', nonce: 'nonce', matchId: 'match',
    activityId: 'free-play', reservedAt: 0 }), /exact non-negative integer/);
  assert.throws(() => Profile.MatchClaimTokenV1({ schema: 'MatchClaimTokenV1', version: 1,
    lineageId: 'lineage', ordinal: 1, nonce: 'nonce', matchId: 'match',
    activityId: 'free-play', reservedAt: 0, extra: true }), /unsupported field/);
  assert.throws(() => Profile.ProgressionStateV4({ fxp: '3705' }),
    /exact non-negative integer/);
  assert.throws(() => Profile.ProgressionStateV4({ fxp: 0, surprise: true }),
    /unsupported field/);
  assert.throws(() => h.store.claimAchievement(7, 'common'), /exact string/);
  assert.throws(() => h.runtime.dismissReveal(7), /exact string/);
  assert.throws(() => h.store.claimStoryReward({ claimId: 'rival.first-light.first-clear',
    type: 'rival-first-clear', rivalId: 'first-light', objectId: 'coffee-mug',
    fxp: '25', fc: 15 }), /exact non-negative integer/);
  assert.throws(() => Profile.FcTransactionV1({ schema: 'FcTransactionV1', version: 1,
    txId: 'primitive-direct', idempotencyKey: 'primitive-direct', kind: 'earn',
    sourceType: 'achievement', sourceId: 'primitive-direct', signedAmount: '10',
    balanceAfter: 10, timestamp: 0 }), /exact integer/);

  const strictReward = h.store.reserveMatch('strict-reward-input', 'free-play');
  assert.throws(() => h.store.consumeReservedMatch(strictReward.token,
    rewardInput({ qualifiedManualHumanFlips: '4' })), /exact non-negative integer/);
  assert.deepEqual(h.store.resumeMatchReservation(), strictReward.token,
    'invalid reward input cannot consume the reservation');
  h.store.abandonReservedMatch(strictReward.token, 'strict-input-rejected');
  assert.throws(() => h.store.claimStoryMatchResolution({
    matchId: 'strict-story', ordinaryRewardsEligible: false,
    rewards: [{ claimId: 'story.act.1.first-clear', type: 'act-first-clear',
      actId: 1, fieldNoteId: 'field-note-act-1', fxp: 50, fc: 25 }],
  }), /exact string/);
  assert.throws(() => h.store.claimStoryMatchResolution({
    matchId: 'strict-story-extra', ordinaryRewardsEligible: false,
    rewards: [], injected: true,
  }), /unsupported field/);
  assert.throws(() => h.store.reserveMatch('rival-ordinary', 'rival-board'),
    /cannot reserve reward-bearing matches/);
  assert.throws(() => h.store.claimStoryMatchResolution({
    matchId: 'rival-ordinary', ordinaryRewardsEligible: true,
    rewards: [], rewardInput: rewardInput({ activityId: 'rival-board' }),
  }), /MatchClaimTokenV1/);

  const stringVersion = LegacyBackup.serialize({ schema: 'FlipgameLocalSaveV2', version: '2',
    profileV4: h.store.snapshot(), setupSelection: {}, sections: {} }, { createdAt: 110 });
  assert.equal(Backup.validate(stringVersion).valid, false, 'payload versions cannot be numeric strings');
  const stringAmount = clone(h.store.snapshot());
  stringAmount.fcTransactions = [{ schema: 'FcTransactionV1', version: 1,
    txId: 'primitive:tx', idempotencyKey: 'primitive:tx', kind: 'earn', sourceType: 'migration',
    sourceId: 'primitive', signedAmount: '10', balanceAfter: 10, timestamp: 0 }];
  stringAmount.fcBalance = 10;
  const badAmount = LegacyBackup.serialize({ schema: 'FlipgameLocalSaveV2', version: 2,
    profileV4: stringAmount, setupSelection: {}, sections: {} }, { createdAt: 111 });
  assert.equal(Backup.validate(badAmount).valid, false, 'FC amounts cannot be numeric strings');

  const unsafeSetup = JSON.parse('{"rows":[{"prefs":{"__proto__":{"polluted":true}}}]}');
  assert.throws(() => Profile.migrateSetupSelection(unsafeSetup), /Unsafe object key/);
  assert.throws(() => Backup.mergeSetupSelection({}, unsafeSetup, h.store.snapshot()), /Unsafe object key/);
  const safe = Profile.migrateSetupSelection({ rows: [{ charId: 'bottle', prefs: { mute: true } }] });
  assert.equal(Object.getPrototypeOf(safe), null);
  assert.equal(Object.getPrototypeOf(safe.rows[0]), null);
  assert.equal(Object.getPrototypeOf(safe.rows[0].prefs), null);
  const sections = Backup.createPayload(h.store, {}, { nested: { safe: true } }).sections;
  assert.equal(Object.getPrototypeOf(sections), null);
  assert.equal(Object.getPrototypeOf(sections.nested), null);
  assert.equal({}.polluted, undefined);

  let tooDeep = Object.create(null);
  let cursor = tooDeep;
  for (let depth = 0; depth < 12000; depth++) {
    cursor.next = Object.create(null);
    cursor = cursor.next;
  }
  assert.throws(() => Profile.migrateSetupSelection(tooDeep), /nesting limit/,
    'deep malicious setup input is rejected before the JavaScript stack can overflow');
  assert.throws(() => Backup.createPayload(h.store, {}, tooDeep), /nesting limit/,
    'deep malicious backup sections are bounded');
  assert.throws(() => h.store.dismissReveals(Array.from({ length: 513 },
    (_, index) => `object.dismiss-${index}`)), /exceeds the canonical bound/);
  h.runtime.close();
}

function testCosmeticRevealNamespaceSurvivesRestart() {
  const state = Profile.ProgressionStateV4({ lineageId: 'store-reveal-lineage',
    fcBalance: 500, legacy: { reconciledV111: true, qualifyingWins: 0,
      sourceRelease: 'test-fixture' } });
  const storage = Profile.createMemoryStorage({
    [Profile.storageKey]: JSON.stringify(state),
  });
  const store = Profile.createTestStore({ storage, now: () => 130 });
  assert.equal(store.purchaseCosmetic('finish.chrome').applied, true);
  assert.deepEqual(store.snapshot().pendingRevealIds, ['store.finish.chrome']);
  const restarted = Profile.createTestStore({ storage, now: () => 131 });
  assert.deepEqual(restarted.snapshot().pendingRevealIds, ['store.finish.chrome']);
  assert.equal(restarted.snapshot().pendingRevealIds.some((id) =>
    id.startsWith('cosmetic.')), false);

  const legacyAlias = clone(restarted.snapshot());
  legacyAlias.pendingRevealIds = ['cosmetic.finish.chrome'];
  storage.setItem(Profile.storageKey, JSON.stringify(legacyAlias));
  const migrated = Profile.createTestStore({ storage, now: () => 132 });
  assert.deepEqual(migrated.snapshot().pendingRevealIds, ['store.finish.chrome'],
    'the rejected pre-fix reveal namespace is migrated exactly once');
}

function testPublicMutationSurfaceHasOnlyCanonicalAuthorities() {
  const h = harness();
  const expectedStoreFunctions = [
    'snapshot', 'refresh', 'subscribe', 'exportState',
    'reserveMatch', 'resumeMatchReservation', 'consumeReservedMatch',
    'abandonReservedMatch', 'claimMatch',
    'claimAchievement', 'claimRivalVictory', 'claimStoryAct',
    'claimStoryReward', 'claimStoryMatchResolution',
    'purchaseCosmetic', 'mergeImportedState', 'dismissReveals',
    'lastPersistenceError', 'persistenceStatus',
  ];
  assert.deepEqual(Object.keys(h.store).sort(), expectedStoreFunctions.sort());
  assert.equal('claimBundle' in h.store, false);
  assert.equal('commit' in h.store, false);
  assert.equal('commitMutation' in h.store, false);
  assert.equal('appendFc' in h.store, false);
  assert.equal('claimBundle' in Profile, false);
  assert.equal('commit' in Profile, false);
  assert.equal('appendFc' in Profile, false);
  assert.throws(() => h.store.claimMatch('public-raw-id', rewardInput()), /MatchClaimTokenV1/);

  const before = h.store.snapshot();
  const owner = h.runtime.activateOwnerTestMode('Howe Test Mode');
  assert.equal(owner.activated, true);
  assert.deepEqual(h.runtime.earnedSnapshot(), before,
    'owner projection cannot introduce a hidden progression mutator');
  assert.equal(h.runtime.claimAchievement('owner-public-probe', 'legendary').reason,
    'owner-test-mode');
  assert.deepEqual(h.runtime.earnedSnapshot(), before);
  h.runtime.deactivateOwnerTestMode();
  h.runtime.close();
}

async function testLifetimeWebLockWriterBoundary() {
  function lockManager() {
    let held = false;
    const requests = [];
    return {
      requests,
      request(name, options, callback) {
        requests.push({ name, options: { ...options } });
        if (held) return Promise.resolve(callback(null));
        held = true;
        return Promise.resolve(callback(Object.freeze({ name, mode: 'exclusive' })))
          .finally(() => { held = false; });
      },
    };
  }
  const locks = lockManager();
  const storage = Profile.createMemoryStorage();
  let firstWritable = false;
  let firstAuthority;
  const firstStore = Profile.createTestStore({ storage, writeAuthority: () => firstWritable });
  const first = await Runtime.acquireLiveRuntime({ profileStore: firstStore,
    lockManager: locks, setWriterEnabled(value) { firstWritable = value; },
    installRewardAuthority(authority) { firstAuthority = authority; } });
  assert.deepEqual(first.writerStatus(), { writable: true, status: 'active', reason: null });
  assert.equal(locks.requests[0].name, Runtime.writerLockName);
  assert.deepEqual(locks.requests[0].options, { mode: 'exclusive', ifAvailable: true });
  const reserved = firstAuthority.reserveMatch('locked-writer-a', 'free-play');
  assert.equal(reserved.applied, true);
  assert.equal(firstAuthority.claimMatch(reserved.token, rewardInput()).applied, true);

  let secondWritable = false;
  let secondAuthority;
  const secondStore = Profile.createTestStore({ storage, writeAuthority: () => secondWritable });
  const second = await Runtime.acquireLiveRuntime({ profileStore: secondStore,
    lockManager: locks, setWriterEnabled(value) { secondWritable = value; },
    installRewardAuthority(authority) { secondAuthority = authority; } });
  assert.deepEqual(second.writerStatus(), {
    writable: false, status: 'busy', reason: 'writer-held-elsewhere',
  });
  assert.equal(secondAuthority.reserveMatch('locked-writer-b', 'free-play').reason,
    'writer-busy', 'a second tab never receives a progression writer');
  assert.equal(secondWritable, false);

  let unsupportedAuthority;
  const unsupportedStore = Profile.createTestStore({ storage: Profile.createMemoryStorage(),
    writeAuthority: () => false });
  const unsupported = await Runtime.acquireLiveRuntime({ profileStore: unsupportedStore,
    lockManager: null, installRewardAuthority(authority) { unsupportedAuthority = authority; } });
  assert.equal(unsupported.writerStatus().status, 'unavailable');
  assert.equal(unsupportedAuthority.reserveMatch('no-web-locks', 'free-play').reason,
    'writer-read-only', 'Web Locks absence fails closed for progression writes');

  second.close(); unsupported.close(); first.close();
  await Promise.resolve();
  let thirdWritable = false;
  let thirdAuthority;
  const thirdStore = Profile.createTestStore({ storage, writeAuthority: () => thirdWritable });
  const third = await Runtime.acquireLiveRuntime({ profileStore: thirdStore,
    lockManager: locks, setWriterEnabled(value) { thirdWritable = value; },
    installRewardAuthority(authority) { thirdAuthority = authority; } });
  assert.equal(third.writerStatus().writable, true,
    'the lifetime writer lock is released only when the owning runtime closes');
  assert.ok(thirdAuthority);
  third.close();
}

function testInRealmWriterFenceAndEqualRevisionPoison() {
  const values = Object.create(null);
  let hook = null;
  const storage = {
    getItem(key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
    setItem(key, value) {
      if (hook) {
        const run = hook;
        hook = null;
        run();
      }
      values[key] = String(value);
    },
    removeItem(key) { delete values[key]; },
    interleave(callback) { hook = callback; },
  };
  const first = Profile.createTestStore({ storage, now: () => 201 });
  const second = Profile.createTestStore({ storage, now: () => 202 });
  let competing;
  storage.interleave(() => { competing = second.reserveMatch('split-brain-b', 'free-play'); });
  const winner = first.reserveMatch('split-brain-a', 'free-play');
  assert.equal(winner.applied, true);
  assert.equal(competing.reason, 'writer-busy');
  assert.equal(Object.prototype.hasOwnProperty.call(competing, 'token'), false,
    'a losing same-realm writer receives no active bearer token');
  assert.equal(first.consumeReservedMatch(winner.token, rewardInput()).applied, true);
  second.refresh();
  const next = second.reserveMatch('split-brain-b', 'free-play');
  assert.equal(next.applied, true);
  assert.equal(next.token.ordinal, 2,
    'serialization preserves one exact monotonically increasing match lineage');
  assert.equal(second.abandonReservedMatch(next.token, 'test-cleanup').applied, true);

  first.refresh();
  const divergent = clone(first.snapshot());
  divergent.pendingRevealIds = divergent.pendingRevealIds.slice(1);
  storage.setItem(Profile.storageKey, JSON.stringify(divergent));
  const before = first.snapshot();
  first.refresh();
  assert.deepEqual(first.snapshot(), before,
    'equal-revision divergence never silently changes the owned projection');
  assert.equal(first.persistenceStatus().closed, true,
    'equal-revision divergence poisons further writes instead of choosing a winner');
  assert.equal(first.reserveMatch('after-divergence', 'free-play').reason,
    'persistence-closed');
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function testBrowserExportsAndDependencyOrder() {
  const seededStorage = Profile.createMemoryStorage();
  const seededStore = Profile.createTestStore({ storage: seededStorage, now: () => 800 });
  const seededReservation = seededStore.reserveMatch('browser-private-reservation', 'story');
  assert.equal(seededReservation.applied, true);
  const browserValues = seededStorage.dump();
  function bareBrowserContext(extra = {}) {
    return vm.createContext({ console, Set, Map, Object, Array, JSON, Math,
      Number, String, Date, Promise, ...extra });
  }
  function runIn(target, name) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8'),
      target, { filename: name });
  }
  function installProfilePrerequisites(target) {
    runIn(target, 'v111-object-manifest.js');
    runIn(target, 'v111-content-catalog.js');
    target.FlipgameV111Interfaces = require('../js/v111-interfaces.js');
    target.FlipgameV111Cosmetics = require('../js/v111-cosmetic-catalog.js');
    runIn(target, 'v111-progression.js');
    runIn(target, 'v112-progression-catalog.js');
    runIn(target, 'v112-economy.js');
  }

  const missingAchievements = bareBrowserContext();
  installProfilePrerequisites(missingAchievements);
  assert.throws(() => runIn(missingAchievements, 'v112-profile.js'),
    /achievement catalog and reward authority must load before profile/,
  'wrong script order fails during Profile construction rather than disabling live awards');

  const wrongAchievements = bareBrowserContext({
    FlipgameV112Achievements: Object.freeze({ schema: 'AchievementCatalogV1', version: 1,
      lookupForMigration() { return null; },
      rewardAuthority: Object.freeze({ schema: 'WrongAuthority', version: 1,
        verify() { return null; } }) }),
  });
  installProfilePrerequisites(wrongAchievements);
  assert.throws(() => runIn(wrongAchievements, 'v112-profile.js'),
    /achievement catalog and reward authority must load before profile/,
  'an incompatible achievement authority fails fast');

  const wrongLookup = bareBrowserContext({
    FlipgameV112Achievements: Object.freeze({ schema: 'AchievementCatalogV1', version: 1,
      lookupForMigration() { return null; },
      catalogSummary() { return Object.freeze({ total: 120 }); },
      rewardAuthority: Achievements.rewardAuthority }),
  });
  installProfilePrerequisites(wrongLookup);
  assert.throws(() => runIn(wrongLookup, 'v112-profile.js'),
    /achievement catalog and reward authority must load before profile/,
  'a type-compatible but semantically wrong migration lookup fails fast');

  const context = vm.createContext({ console, Set, Map, Object, Array, JSON, Math,
    Number, String, Date, Promise, localStorage: {
      getItem(key) { return Object.prototype.hasOwnProperty.call(browserValues, key)
        ? browserValues[key] : null; },
      setItem(key, value) { browserValues[key] = String(value); },
      removeItem(key) { delete browserValues[key]; },
    } });
  function run(name) {
    runIn(context, name);
  }
  run('v111-object-manifest.js');
  run('v111-content-catalog.js');
  context.FlipgameV111Interfaces = require('../js/v111-interfaces.js');
  context.FlipgameV111Cosmetics = require('../js/v111-cosmetic-catalog.js');
  run('v111-progression.js');
  context.FlipgameV111NamePolicy = require('../js/v111-name-policy.js');
  run('v111-save-backup.js');
  context.Achievements = require('../js/achievements.js');
  run('v112-achievements.js');
  run('v112-progression-catalog.js');
  run('v112-economy.js');
  run('v112-profile.js');
  run('v112-profile-backup.js');
  run('v112-progression-runtime.js');
  assert.equal(context.FlipgameV112ProgressionRuntime.schema, 'ProgressionRuntimeV1');
  assert.equal(context.FlipgameV112ProfileBackup.schema, 'FlipgameProfileBackupV2');
  ['defaultStore', 'createStore', 'createTestStore', 'reserveMatch',
    'consumeReservedMatch', 'claimMatch', 'claimAchievement',
    'claimRivalVictory', 'claimStoryAct', 'claimStoryReward',
    'claimStoryMatchResolution'].forEach((name) => {
    assert.equal(typeof context.FlipgameV112Profile[name], 'undefined',
      `browser Profile must not expose raw ${name}`);
  });
  ['reserveMatch', 'claimMatch', 'claimAchievement', 'claimRivalVictory',
    'claimStoryAct', 'claimStoryReward', 'claimStoryMatchResolution']
    .forEach((name) => assert.equal(
      typeof context.FlipgameV112ProgressionRuntime.defaultRuntime[name], 'undefined',
      `live runtime must keep ${name} coordinator-private`));
  assert.equal(typeof context.FlipgameV112ProgressionRuntime.createTestRuntime, 'undefined');
  assert.equal(context.FlipgameV112ProgressionRuntime.defaultRuntime.writerStatus().status,
    'unavailable', 'a browser without Web Locks is explicitly read-only');
  assert.equal(context.FlipgameV112Profile.snapshot().activeMatchReservation, null);
  assert.equal(context.FlipgameV112Profile.exportState().activeMatchReservation, null);
  assert.equal(context.FlipgameV112ProgressionRuntime.defaultRuntime.snapshot()
    .activeMatchReservation, null);
  assert.equal(context.FlipgameV112ProgressionRuntime.defaultRuntime.earnedSnapshot()
    .activeMatchReservation, null);
  assert.equal(context.FlipgameV112ProgressionRuntime.defaultRuntime.exportState()
    .activeMatchReservation, null);
  const publicEvents = [];
  const detachPublic = context.FlipgameV112Profile.subscribe((state, event) => {
    publicEvents.push({ state, event });
  }, { emitCurrent: true });
  assert.equal(publicEvents.length, 1);
  assert.equal(publicEvents[0].state.activeMatchReservation, null);
  assert.equal(publicEvents[0].event.state.activeMatchReservation, null);
  assert.equal(Object.prototype.hasOwnProperty.call(publicEvents[0].event, 'token'), false);
  detachPublic();
  const owner = context.FlipgameV112ProgressionRuntime.defaultRuntime
    .activateOwnerTestMode('Howe Test Mode');
  assert.equal(owner.activated, true);
  assert.equal(context.FlipgameV112ProgressionRuntime.defaultRuntime.snapshot()
    .activeMatchReservation, null,
  'Owner Test projection cannot expose a durable match bearer');
  context.FlipgameV112ProgressionRuntime.defaultRuntime.deactivateOwnerTestMode();
  assert.ok(browserValues[Profile.storageKey].includes(seededReservation.token.nonce),
    'redaction does not destroy the private durable reservation needed for restart');
  assert.throws(() => context.FlipgameV112Profile.connectProductionRuntime(() => null),
    /already connected/, 'the one-shot production store bridge cannot be captured after boot');
  const profileIdentity = context.FlipgameV112Profile;
  const runtimeIdentity = context.FlipgameV112ProgressionRuntime;
  run('v112-profile.js');
  run('v112-progression-runtime.js');
  assert.equal(context.FlipgameV112Profile, profileIdentity,
    'a repeated classic-script evaluation cannot create a second V4 store');
  assert.equal(context.FlipgameV112ProgressionRuntime, runtimeIdentity,
    'a repeated classic-script evaluation cannot create a second live runtime');
  context.FlipgameV112ProgressionRuntime.defaultRuntime.close();
}

const tests = [
  testSingleV4MigrationAndImmediateSelection,
  testExactMatchIdempotenceAndAtomicFailure,
  testRevealQueueOrderResumeDismissAndEveryKind,
  testAllClaimsPublishImmediately,
  testWholeLevelLadderFeedsOneOrderedLiveView,
  testLockSecrecy,
  testExactEphemeralOwnerMode,
  testV4BackupRoundTripAliasesAndDuplicateSafety,
  testLegacyBackupMigratesWithoutRelock,
  testMaliciousAndFutureImportsAreRejectedAtomically,
  testWriteThenThrowRollbackAndFailClosedPoisoning,
  testJournalCrashRecoveryMatrix,
  testQueuedMonotonicProfileAndRuntimeNotifications,
  testSemanticImportQuarantineAndNoSuppression,
  testCanonicalImportedRewardProvenance,
  testExternalFcHighWaterBlocksReplayAfterSpendAndCompaction,
  testExactReserveConsumeAbandonAndStoryBoundary,
  testDurableImmutableMatchReceiptsAndCapacity,
  testRevealLineagePreventsStaleResurrection,
  testRefreshAcceptsOnlySemanticMonotonicExtensions,
  testBoundedHistoriesAndNoOpRevealDismissal,
  testCanonicalCardinalityBoundsCannotExhaustRevealHistory,
  testStrictExternalPrimitivesAndSafeSetupCopies,
  testCosmeticRevealNamespaceSurvivesRestart,
  testPublicMutationSurfaceHasOnlyCanonicalAuthorities,
  testLifetimeWebLockWriterBoundary,
  testInRealmWriterFenceAndEqualRevisionPoison,
  testBrowserExportsAndDependencyOrder,
];

(async () => {
  for (const test of tests) {
    await test();
    console.log(`✓ ${test.name}`);
  }
  console.log(`v1.12 progression runtime/backup tests passed (${tests.length} groups).`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
