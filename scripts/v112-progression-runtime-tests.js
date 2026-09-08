#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Catalog = require('../js/v112-progression-catalog.js');
const Economy = require('../js/v112-economy.js');
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
  const store = Profile.createStore({ storage, now: () => 12345 });
  const runtime = Runtime.createRuntime({ profileStore: store, backupAdapter: Backup });
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

  const reload = Profile.createStore({ storage: h.storage });
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

  const reloadedStore = Profile.createStore({ storage: h.storage });
  const reloadedRuntime = Runtime.createRuntime({ profileStore: reloadedStore,
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
  assert.equal(h.runtime.validateOwnerTestGuard(ownerPolicy.ownerTestGuard, 'free-play'), false,
    'deactivation invalidates every guard from the prior owner-test generation');
  h.runtime.activateOwnerTestMode('Howe Test Mode');
  assert.equal(h.runtime.validateOwnerTestGuard(ownerPolicy.ownerTestGuard, 'free-play'), false,
    'a prior generation guard cannot be replayed after reactivation');
  const replacementPolicy = h.runtime.activityPolicy({ activityId: 'free-play' });
  assert.equal(h.runtime.validateOwnerTestGuard(replacementPolicy.ownerTestGuard, 'free-play'), true);
  h.runtime.deactivateOwnerTestMode();
  assert.equal(h.runtime.viewObject('alien').locked, true);
  assert.equal(JSON.stringify(h.runtime.earnedSnapshot()), earnedBefore);
  h.runtime.close();
  const restarted = Runtime.createRuntime({ profileStore: Profile.createStore({ storage: h.storage }),
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
  const store = Profile.createStore({ storage, now: () => 50 });
  const memoryBefore = store.snapshot();
  const bytesBefore = storage.bytes(Profile.storageKey);
  storage.throwAfterWrites(1);
  const failed = store.claimAchievement('atomic-write-then-throw', 'notable');
  assert.equal(failed.reason, 'persistence-failed');
  assert.deepEqual(store.snapshot(), memoryBefore, 'failed commits cannot change live memory');
  assert.equal(storage.bytes(Profile.storageKey), bytesBefore,
    'a write-then-throw is detected and the exact previous bytes are restored');
  assert.deepEqual(Profile.createStore({ storage }).snapshot(), memoryBefore,
    'restart observes exactly the pre-commit state');

  const poisonedStorage = adversarialStorage();
  const poisoned = Profile.createStore({ storage: poisonedStorage, now: () => 51 });
  const poisonBefore = poisonedStorage.bytes(Profile.storageKey);
  poisonedStorage.throwAfterWrites(2);
  const poisonedResult = poisoned.claimAchievement('atomic-rollback-throws', 'notable');
  assert.equal(poisonedResult.reason, 'persistence-closed');
  assert.equal(poisoned.persistenceStatus().closed, true, 'an uncertain adapter is permanently failed closed');
  assert.equal(poisonedStorage.bytes(Profile.storageKey), poisonBefore,
    'even a throwing rollback is verified against the previous bytes');
  assert.equal(poisoned.claimAchievement('atomic-after-poison', 'notable').reason,
    'persistence-closed');
}

function testQueuedMonotonicProfileAndRuntimeNotifications() {
  const profileStore = Profile.createStore({ storage: Profile.createMemoryStorage(), now: () => 60 });
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
  assert.throws(() => Profile.validateImportedState(missingAchievement), /lacks achievement state/);

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
  assert.equal(achievementTarget.store.claimAchievement('legacy-import-achievement', 'common').reason,
    'duplicate', 'canonical imported entitlement evidence prevents a second local reward');
  achievementSource.runtime.close(); achievementTarget.runtime.close();
  source.runtime.close(); target.runtime.close(); h.runtime.close();
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
  const restarted = Profile.createStore({ storage: h.storage, now: () => 12346 });
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

  const reentrant = Profile.createStore({ storage: Profile.createMemoryStorage(), now: () => 77 });
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
  const storage = Profile.createMemoryStorage();
  const first = Profile.createStore({ storage, now: () => 90 });
  const second = Profile.createStore({ storage, now: () => 91 });
  const runtime = Runtime.createRuntime({ profileStore: first, backupAdapter: Backup });
  const events = [];
  first.subscribe((state, event) => events.push([state.revision, event.type]));
  second.claimAchievement('refresh-valid', 'common');
  const adopted = first.refresh();
  assert.equal(adopted.fxp, 15);
  assert.deepEqual(events, [[adopted.revision, 'external-refresh']]);
  first.refresh();
  assert.equal(events.length, 1, 'the same extension publishes exactly once');

  const exact = clone(first.snapshot());
  const ownedProjection = runtime.listObjects().map((entry) => !entry.locked);
  const forgedRevision = clone(exact);
  forgedRevision.revision += 100;
  storage.setItem(Profile.storageKey, JSON.stringify(forgedRevision));
  assert.deepEqual(first.refresh(), exact, 'a higher revision with no content extension has no authority');
  assert.deepEqual(runtime.listObjects().map((entry) => !entry.locked), ownedProjection,
    'rejected refreshes never silently alter the owned picker projection');

  const mutatedLedger = clone(exact);
  mutatedLedger.revision += 100;
  mutatedLedger.fcTransactions[0].signedAmount += 1;
  mutatedLedger.fcTransactions[0].balanceAfter += 1;
  mutatedLedger.fcBalance += 1;
  storage.setItem(Profile.storageKey, JSON.stringify(mutatedLedger));
  assert.deepEqual(first.refresh(), exact,
    'a valid-looking rewrite of an existing FC identity is not a monotonic extension');
  assert.deepEqual(runtime.listObjects().map((entry) => !entry.locked), ownedProjection);

  const metadataOnly = clone(exact);
  metadataOnly.revision += 100;
  metadataOnly.externalClaimEvidence = [{ lineageId: 'untrusted-metadata', throughRevision: 1 }];
  storage.setItem(Profile.storageKey, JSON.stringify(metadataOnly));
  assert.deepEqual(first.refresh(), exact,
    'higher revision plus non-value import metadata alone has no authority');

  const downgrade = clone(exact);
  downgrade.revision += 101;
  downgrade.ownedObjectIds = downgrade.ownedObjectIds.filter((id) => id !== 'bottle');
  storage.setItem(Profile.storageKey, JSON.stringify(downgrade));
  assert.deepEqual(first.refresh(), exact, 'a malformed or downgraded external state is ignored');
  assert.equal(events.length, 1);
  assert.deepEqual(runtime.listObjects().map((entry) => !entry.locked), ownedProjection);
  runtime.close();
}

function testBoundedHistoriesAndNoOpRevealDismissal() {
  const base = clone(Profile.migrateV111({}));
  base.lineageId = 'retention-fixture';
  base.revision = 1;
  base.achievementIds = ['retained-canonical-achievement'];
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
  const store = Profile.createStore({ storage, now: () => 100 });
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

  const reloaded = Profile.createStore({ storage, now: () => 101 });
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
    /achievementIds exceeds the canonical v1\.12 cardinality/);
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
  assert.throws(() => h.store.claimAchievement(7, 'common'), /exact string/);
  assert.throws(() => h.runtime.dismissReveal(7), /exact string/);
  assert.throws(() => h.store.claimStoryReward({ claimId: 'rival.first-light.first-clear',
    type: 'rival-first-clear', rivalId: 'first-light', objectId: 'coffee-mug',
    fxp: '25', fc: 15 }), /exact non-negative integer/);
  assert.throws(() => Profile.FcTransactionV1({ schema: 'FcTransactionV1', version: 1,
    txId: 'primitive-direct', idempotencyKey: 'primitive-direct', kind: 'earn',
    sourceType: 'achievement', sourceId: 'primitive-direct', signedAmount: '10',
    balanceAfter: 10, timestamp: 0 }), /exact integer/);

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
  h.runtime.close();
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

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function testBrowserExportsAndDependencyOrder() {
  const context = vm.createContext({ console, Set, Map, Object, Array, JSON, Math,
    Number, String, Date, Promise });
  function run(name) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8'),
      context, { filename: name });
  }
  run('v111-object-manifest.js');
  run('v111-content-catalog.js');
  context.FlipgameV111Interfaces = require('../js/v111-interfaces.js');
  context.FlipgameV111Cosmetics = require('../js/v111-cosmetic-catalog.js');
  run('v111-progression.js');
  context.FlipgameV111NamePolicy = require('../js/v111-name-policy.js');
  run('v111-save-backup.js');
  run('v112-progression-catalog.js');
  run('v112-economy.js');
  run('v112-profile.js');
  run('v112-profile-backup.js');
  run('v112-progression-runtime.js');
  assert.equal(context.FlipgameV112ProgressionRuntime.schema, 'ProgressionRuntimeV1');
  assert.equal(context.FlipgameV112ProfileBackup.schema, 'FlipgameProfileBackupV2');
  assert.equal(context.FlipgameV112Profile.defaultStore,
    context.FlipgameV112Profile.defaultStore, 'one browser default store is exported by reference');
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
  testQueuedMonotonicProfileAndRuntimeNotifications,
  testSemanticImportQuarantineAndNoSuppression,
  testExactReserveConsumeAbandonAndStoryBoundary,
  testRevealLineagePreventsStaleResurrection,
  testRefreshAcceptsOnlySemanticMonotonicExtensions,
  testBoundedHistoriesAndNoOpRevealDismissal,
  testCanonicalCardinalityBoundsCannotExhaustRevealHistory,
  testStrictExternalPrimitivesAndSafeSetupCopies,
  testPublicMutationSurfaceHasOnlyCanonicalAuthorities,
  testBrowserExportsAndDependencyOrder,
];

for (const test of tests) {
  test();
  console.log(`✓ ${test.name}`);
}
console.log(`v1.12 progression runtime/backup tests passed (${tests.length} groups).`);
