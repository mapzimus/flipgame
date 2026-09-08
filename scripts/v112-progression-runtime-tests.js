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
  const toFour = Economy.fxpThresholdForLevel(4) - h.store.snapshot().fxp;
  const result = h.runtime.claimMatch('match:reach-fl4', rewardInput({
    // Match math is intentionally bypassed only through the domain's explicit
    // bundle in this focused migration fixture.
    qualifiedManualHumanFlips: 6,
  }));
  assert.equal(result.applied, true);
  if (h.store.snapshot().flipLevel < 4) {
    h.store.claimBundle({ claimId: 'fixture:finish-fl4', sourceType: 'match',
      fxp: Math.max(0, toFour - result.fxpAwarded), reveal: true });
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
  h.runtime.subscribe((_state, event) => { if (event.type === 'profile-commit') notifications++; },
    { emitCurrent: false });
  const first = h.runtime.claimMatch('immutable-match-1', rewardInput({ humanWon: true }));
  assert.equal(first.applied, true);
  const committed = h.store.snapshot();
  assert.equal(h.runtime.claimMatch('immutable-match-1', rewardInput({ humanWon: false })).reason,
    'duplicate');
  assert.deepEqual(h.store.snapshot(), committed);
  assert.equal(notifications, 1);
  assert.throws(() => h.runtime.claimMatch(' immutable-match-1', rewardInput()),
    /exact string identifier/);
  assert.throws(() => h.runtime.claimMatch(7, rewardInput()), /exact string identifier/);

  h.storage.failNextWrite();
  const failed = h.runtime.claimMatch('immutable-match-failed', rewardInput());
  assert.equal(failed.reason, 'persistence-failed');
  assert.deepEqual(h.store.snapshot(), committed);
  assert.equal(notifications, 1, 'a failed write is never published');
  assert.ok(!h.store.snapshot().processedClaimIds.includes('match:immutable-match-failed'));
  h.runtime.close();
}

function testRevealQueueOrderResumeDismissAndEveryKind() {
  const h = harness();
  h.store.claimBundle({ claimId: 'fixture:fl4', sourceType: 'match',
    fxp: Economy.fxpThresholdForLevel(4), reveal: true });
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

  reloadedStore.claimBundle({ claimId: 'fixture:fl49', sourceType: 'match',
    fxp: Economy.fxpThresholdForLevel(49) - reloadedStore.snapshot().fxp, reveal: false });
  reloadedStore.claimBundle({ claimId: 'fixture:fl50', sourceType: 'match',
    fxp: Economy.fxpThresholdForLevel(50) - reloadedStore.snapshot().fxp, reveal: true });
  assert.ok(reloadedRuntime.pendingReveals().some((entry) =>
    entry.type === 'feature' && entry.contentId === 'physics-lab'));

  reloadedRuntime.dismissAllReveals();
  assert.equal(reloadedRuntime.claimAchievement('runtime-achievement', 'common').applied, true);
  assert.equal(reloadedRuntime.pendingReveals().at(-1).type, 'achievement');
  reloadedRuntime.dismissAllReveals();
  reloadedStore.claimBundle({ claimId: 'fixture:store-fc', sourceType: 'migration',
    fc: 500, reveal: false });
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
  h.runtime.claimMatch('publish:match', rewardInput());
  h.runtime.claimRivalVictory('first-light');
  h.runtime.claimStoryAct('1');
  h.store.claimBundle({ claimId: 'publish:store-seed', sourceType: 'migration',
    fc: 500, reveal: false });
  h.runtime.purchaseCosmetic('finish.chrome');
  assert.equal(events.length, 5);
  assert.ok(h.runtime.viewObject('coffee-mug').id === 'coffee-mug');
  assert.ok(h.runtime.viewStore().find((item) => item.id === 'finish.chrome').owned);
  h.runtime.close();
}

function testWholeLevelLadderFeedsOneOrderedLiveView() {
  const h = harness();
  h.store.claimBundle({ claimId: 'fixture:whole-ladder', sourceType: 'match',
    fxp: Economy.MAX_LEVEL_FXP, reveal: true });
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
  assert.equal(h.store.snapshot().fcBalance, 3700);
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
  assert.deepEqual(h.runtime.activityPolicy({ activityId: 'free-play' }), {
    activityId: 'free-play', ownerTest: true, ownerTestMode: true,
    testData: true, rewardsEligible: false, progressionEligible: false,
    achievementsEligible: false, statisticsDefaultIncluded: false,
  });
  assert.equal(h.runtime.claimMatch('owner:no-reward', rewardInput()).reason, 'owner-test-mode');
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
  assert.equal(h.runtime.viewObject('alien').locked, true);
  assert.equal(JSON.stringify(h.runtime.earnedSnapshot()), earnedBefore);
  h.runtime.close();
  const restarted = Runtime.createRuntime({ profileStore: Profile.createStore({ storage: h.storage }),
    backupAdapter: Backup });
  assert.equal(restarted.ownerProjection(), null, 'owner mode never survives a restart');
  restarted.close();
}

function testV4BackupRoundTripAliasesAndDuplicateSafety() {
  const source = harness();
  source.store.claimBundle({ claimId: 'backup:progress', sourceType: 'match',
    fxp: Economy.fxpThresholdForLevel(6), fc: 500,
    objectIds: ['tall-buildings', 'giraffe'], reveal: false });
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
  assert.deepEqual(parsed.payload.sections['flipgame.records.v2'].historical,
    [{ objectId: 'tall-buildings' }, { objectId: 'giraffe' }],
    'historical statistics IDs are preserved verbatim');

  const target = harness();
  target.store.claimBundle({ claimId: 'target:head-start', sourceType: 'match',
    fxp: Economy.fxpThresholdForLevel(8), fc: 800, reveal: false });
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
  assert.deepEqual(parsed.payload.sections['flipgame.records.v2'].history,
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

  const pollution = '{"schema":"FlipgameSaveBackupV1","version":1,"releaseVersion":"v1.12",' +
    '"createdAt":1,"payload":{"__proto__":{"polluted":true}},' +
    '"checksum":{"algorithm":"crc32-canonical-json-v1","value":"00000000"}}';
  assert.equal(Backup.validate(pollution).valid, false);
  assert.equal({}.polluted, undefined);
  assert.deepEqual(h.store.snapshot(), before, 'rejected imports cannot partially mutate profile state');
  h.runtime.close();

  const source = harness();
  const target = harness();
  source.store.claimBundle({ claimId: 'ledger:collision', sourceType: 'match', fc: 100 });
  target.store.claimBundle({ claimId: 'ledger:collision', sourceType: 'match', fc: 200 });
  const collision = source.runtime.exportBackup({}, { createdAt: 6 });
  const targetBefore = target.store.snapshot();
  assert.throws(() => target.runtime.importBackup(collision, {}), /conflicts with the local FC ledger/);
  assert.deepEqual(target.store.snapshot(), targetBefore,
    'a valid-checksum but conflicting ledger rolls back as one transaction');
  source.runtime.close(); target.runtime.close();
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
  testBrowserExportsAndDependencyOrder,
];

for (const test of tests) {
  test();
  console.log(`✓ ${test.name}`);
}
console.log(`v1.12 progression runtime/backup tests passed (${tests.length} groups).`);
