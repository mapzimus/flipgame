#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Catalog = require('../js/v112-progression-catalog.js');
const Economy = require('../js/v112-economy.js');
const Profile = require('../js/v112-profile.js');

function testCatalogContract() {
  const direct = [
    [4,'milk-carton'],[6,'ketchup'],[8,'soup-can'],[10,'soda-can'],
    [12,'salt-pepper-shaker'],[14,'maple'],[16,'honeybear'],[18,'babybottle'],
    [20,'soap'],[22,'smoothie'],[24,'teapot'],[26,'tabasco'],[28,'coke'],
    [30,'stanley'],[32,'watering-can'],[34,'wineglass'],[36,'flask'],
    [40,'microphone-stand'],[42,'bowlingpin'],[44,'cone'],[46,'potted-plants'],
    [48,'lawnchair'],[51,'box-of-snacks'],[54,'hourglass'],[56,'pawn'],
    [58,'buoy'],[60,'extinguisher'],[68,'whippedcream'],[70,'potion'],
    [74,'owl'],[76,'toucan'],[78,'red-panda'],[84,'pinata'],
    [88,'mechanical-metronome'],[90,'octopus'],[92,'eyeball-monster'],
    [94,'lavalamp'],[96,'shell'],
  ];
  const arenas = [
    [3,'rooftop'],[7,'school-cafeteria'],[11,'sports-locker-room'],
    [15,'grand-library'],[21,'garden'],[25,'arcade'],[29,'island-beach'],
    [35,'skate-park-sunset'],[39,'pirate-ship-deck'],[43,'aquarium-tunnel'],
    [47,'rainforest-treehouse'],[55,'movie-soundstage'],[59,'haunted-hall'],
    [63,'ice-cave'],[69,'moon-deck'],[73,'neon-grid'],[79,'volcano'],
    [85,'storm-table'],[89,'mars-outpost'],[93,'stadium-night'],
    [95,'space-station'],[99,'aurora-stage'],
  ];
  const levelFc = {
    2:50,5:50,9:50,13:50,17:50,19:50,23:50,
    27:75,31:75,33:75,37:75,38:75,41:75,45:75,49:75,
    52:100,53:100,57:100,61:100,62:100,64:100,65:100,66:100,
    67:100,71:100,72:100,75:100,
    77:150,80:150,81:150,82:150,83:150,86:150,87:150,91:150,97:150,
    98:200,
  };
  assert.deepEqual(Catalog.counts, {
    objects: 51, directObjects: 38, rivalObjects: 12, arenas: 23,
    collectibleArenas: 22, storeCosmetics: 40, levelFcTotal: 3700,
  });
  assert.equal(new Set(Catalog.objectIds).size, 51);
  assert.equal(new Set(Catalog.arenaIds).size, 23);
  assert.equal(new Set(Catalog.storeCosmetics.map((item) => item.id)).size, 40);
  assert.deepEqual(Catalog.directObjects.map((entry) => [entry.level, entry.id]), direct);
  assert.deepEqual(Catalog.arenas.map((entry) => [entry.level, entry.id]), arenas);
  assert.deepEqual(Catalog.levelFc, levelFc);
  assert.equal(Catalog.rewardsAtLevel(4)[0].contentId, 'milk-carton');
  assert.equal(Catalog.rewardsAtLevel(88)[0].contentId, 'mechanical-metronome');
  assert.deepEqual(Catalog.rewardsAtLevel(50).map((reward) => reward.id),
    ['level.50.feature.physics-lab']);
  assert.equal(Catalog.rewardsAtLevel(100)[0].condition, 'alien-defeated');
  assert.deepEqual(Catalog.invitationsThroughLevel(100).map((rival) => rival.level),
    [5, 13, 21, 29, 37, 45, 50, 61, 71, 81, 91, 100]);
  assert.equal(Catalog.rival('desk-gyroscope').id, 'true-axis');
  assert.equal(Catalog.rival('visitor-zero').objectId, 'alien');
  assert.equal(Catalog.storeCosmetic('finish.chrome').price, 200);
  assert.equal(Catalog.storeCosmetic('nameplate.flip-legend').price, 300);
  assert.equal(Object.isFrozen(Catalog.directObjects), true);
}

function testLevelCurve() {
  assert.equal(Economy.fxpThresholdForLevel(1), 0);
  assert.equal(Economy.fxpThresholdForLevel(2), 30);
  assert.equal(Economy.fxpThresholdForLevel(26), 750);
  assert.equal(Economy.fxpThresholdForLevel(50), 1590);
  assert.equal(Economy.fxpThresholdForLevel(51), 1625);
  assert.equal(Economy.fxpThresholdForLevel(76), 2625);
  assert.equal(Economy.fxpThresholdForLevel(100), 3705);
  assert.equal(Economy.flipLevelForFxp(29), 1);
  assert.equal(Economy.flipLevelForFxp(30), 2);
  assert.equal(Economy.flipLevelForFxp(1590), 50);
  assert.equal(Economy.flipLevelForFxp(999999), 100);
  assert.equal(Economy.levelProgress(3705).next, null);
  assert.equal(Economy.roundHalfAwayFromZero(2.5), 3);
  assert.equal(Economy.roundHalfAwayFromZero(-2.5), -3);
}

function testSetupAndPerformanceMath() {
  assert.deepEqual(Economy.setupDefaults.humanRoster.map((band) => band.bonus), [0, 4, 8, 11, 14]);
  assert.deepEqual(Economy.setupDefaults.classicLives.map((band) => band.bonus), [0, 3, 5]);
  assert.deepEqual(Economy.setupDefaults.cpuChallenge,
    { minimumManualFlips: 4, easy: 0, medium: 2, hard: 4 });
  assert.equal(Economy.setupDefaults.teamwork.bonus, 5);
  assert.equal(Economy.calculateSetupBonus({ format: 'classic', startingLives: 10, humanPlayers: 8 }).total, 11);
  assert.equal(Economy.calculateSetupBonus({ format: 'cup', cupLength: 'full', humanPlayers: 16 }).total, 25);
  assert.equal(Economy.calculateSetupBonus({ format: 'battle', battleFormat: 'duel', humanPlayers: 2 }).total, 4);
  assert.equal(Economy.calculateSetupBonus({ format: 'battle', battleFormat: 'relay', humanPlayers: 10 }).total, 23);
  assert.equal(Economy.calculateSetupBonus({ formatId: 'cup', humanCount: 16,
    rulesOptions: { cupLength: 'full', startingLives: 10 } }).total, 25);
  assert.equal(Economy.calculateSetupBonus({ format: 'classic', humanPlayers: 2,
    difficulty: 'hard', qualifiedManualHumanFlips: 4, opposingCpuTurnOccurred: true }).parts.cpuChallenge, 4);
  assert.equal(Economy.calculateSetupBonus({ format: 'classic', humanPlayers: 2,
    difficulty: 'hard', qualifiedManualHumanFlips: 3, opposingCpuTurnOccurred: true }).parts.cpuChallenge, 0);
  assert.deepEqual(Economy.calculateSetupBonus({ setupComponents: {
    mode: 4, humanRoster: 8, lives: 3, cpuChallenge: 2, teamwork: 5,
  } }), {
    modeKey: 'classic', source: 'components',
    parts: { mode: 4, humanRoster: 8, lives: 3, cpuChallenge: 2, teamwork: 5 }, total: 22,
  });
  assert.equal(Economy.calculateSetupBonus({ setupBonus: 999 }).total, 25);
  assert.equal(Economy.expectedMakeRate('forgiving', 1), 0.60);
  assert.equal(Economy.expectedMakeRate('standard', 2), 0.47);
  assert.equal(Economy.expectedMakeRate('pro', 4), 0.35);
  assert.equal(Economy.performanceMultiplier({ eligibleShots: 3, adjustedMake: 1,
    landingQuality: 1, ordinaryStreak: 1, clutch: 1, teamContribution: 1 }).multiplier, 1);
  assert.equal(Economy.performanceMultiplier({ eligibleShots: 12, adjustedMake: 1,
    landingQuality: 1, ordinaryStreak: 1, clutch: 1, teamContribution: 1 }).multiplier, 1.25);
  assert.equal(Economy.performanceMultiplier({ eligibleShots: 12, adjustedMake: -1,
    landingQuality: -1, ordinaryStreak: -1, clutch: -1, teamContribution: -1 }).multiplier, 0.85);
}

function rewardInput(extra = {}) {
  return {
    completed: true, resolved: true, qualifiedManualHumanFlips: 4,
    humanPlayers: 2, format: 'classic', startingLives: 3,
    performanceMultiplier: 1, ...extra,
  };
}

function testExactMatchRewards() {
  const pure = Economy.calculateRewardFormula({ attempts: 4, setupBonus: 0,
    performanceMultiplier: 1, outcome: 'human-win' });
  assert.equal(pure.fxp, 60);
  assert.equal(pure.fc, 16);
  assert.equal(Economy.calculateRewardFormula({ attempts: 999, setupBonus: 999,
    performanceMultiplier: 999, outcome: 'loss' }).breakdown.variableBase, 49,
  'attempts and setup inputs are independently capped before variableBase');
  const loss = Economy.calculateMatchReward(rewardInput({ result: 'loss' }));
  assert.equal(loss.fxp, 46);
  assert.equal(loss.fc, 12);
  const win = Economy.calculateMatchReward(rewardInput({ humanWon: true }));
  assert.equal(win.fxp, 60);
  assert.equal(win.fc, 16);
  assert.equal(win.breakdown.winBonus, 14);
  const draw = Economy.calculateMatchReward(rewardInput({ draw: true }));
  assert.equal(draw.fxp, loss.fxp);
  assert.equal(draw.fc, loss.fc);
  assert.equal(draw.breakdown.winBonus, 0);
  const precomputed = Economy.calculateMatchReward(rewardInput({ setupComponents: {
    mode: 4, humanRoster: 8, lives: 3, cpuChallenge: 2, teamwork: 5,
  } }));
  assert.equal(precomputed.breakdown.setupBonus, 22);
  assert.equal(precomputed.breakdown.setupSource, 'components');
  assert.equal(Economy.calculateMatchReward(rewardInput({ activityId: 'practice' })).fxp, 0);
  assert.equal(Economy.calculateMatchReward(rewardInput({ activityId: 'rival-board' })).fc, 0);
  assert.equal(Economy.calculateMatchReward(rewardInput({ testData: true })).fxp, 0);
  assert.equal(Economy.calculateMatchReward(rewardInput({ qualifiedManualHumanFlips: 0 })).fc, 0);
  assert.equal(Economy.calculateMatchReward({ status: 'completed', activityId: 'story',
    formatId: 'classic', qualifiedManualHumanFlips: 4, humanCount: 1,
    performanceMultiplier: 1, result: 'loss' }).eligible, true,
  'MatchOutcomeV2 status/format field names are accepted');
  assert.deepEqual(Economy.achievementReward('legendary'), { rarity: 'legendary', fxp: 75, fc: 50 });
}

function testFreshAndRecordsV2AheadMigration() {
  const fresh = Profile.migrateV111({});
  assert.equal(fresh.flipLevel, 1);
  assert.equal(fresh.fxp, 0);
  assert.equal(fresh.fcBalance, 0);
  assert.deepEqual(fresh.ownedObjectIds, ['bottle']);
  assert.deepEqual(fresh.ownedArenaIds, ['baseline-table']);

  const ahead = Profile.migrateV111({
    progression: { schema: 'ProgressionStateV3', version: 3, qualifyingWins: 2 },
    recordsV2: { schema: 'RecordSummaryV2', version: 2, qualifyingWins: 50 },
  });
  assert.equal(ahead.legacy.qualifyingWins, 50);
  assert.equal(ahead.flipLevel, 50);
  assert.equal(ahead.fxp, 1590);
  assert.equal(ahead.fcBalance, 950);
  assert.ok(ahead.featureIds.includes('physics-lab'));
  assert.ok(ahead.ownedObjectIds.includes('coffee-mug'));
  assert.ok(ahead.ownedObjectIds.includes('milk-carton'));
  assert.ok(ahead.ownedArenaIds.includes('rainforest-treehouse'));
  assert.equal(ahead.pendingRevealIds.length, 0);
}

function testEveryLegacyWinFloorMigratesDeterministically() {
  const fcThrough = (level) => Object.entries(Catalog.levelFc)
    .filter(([at]) => Number(at) <= level)
    .reduce((sum, [, amount]) => sum + amount, 0);
  for (let wins = 0; wins <= 100; wins++) {
    const state = Profile.migrateV111({ progression: { qualifyingWins: wins } });
    const expectedLevel = Math.max(1, wins);
    assert.equal(state.flipLevel, expectedLevel, `wins ${wins} level floor`);
    assert.equal(state.fxp, Economy.fxpThresholdForLevel(expectedLevel), `wins ${wins} FXP floor`);
    assert.equal(state.fcBalance, fcThrough(expectedLevel), `wins ${wins} level FC`);
    assert.equal(state.pendingRevealIds.length, 0, `wins ${wins} must not reannounce migration`);
    assert.equal(new Set(state.processedClaimIds).size, state.processedClaimIds.length);
    assert.equal(new Set(state.fcTransactions.map((tx) => tx.idempotencyKey)).size,
      state.fcTransactions.length, `wins ${wins} FC idempotency`);
  }
}

function testCompleteV111MigrationAndAliases() {
  const migrated = Profile.migrateV111({
    progression: {
      schema: 'ProgressionStateV3', version: 3, qualifyingWins: 100,
      ownedObjectIds: ['bottle', 'tall-buildings', 'giraffe', 'future-object'],
      ownedCosmeticIds: ['arena.rooftop', 'finish.chrome', 'future.cosmetic'],
      achievementIds: ['first_flip'],
      claimedRewardIds: ['feature.insane-mode', 'feature.physics-lab'],
    },
    achievementsV3: { earned: [{ id: 'great_save', earnedAt: '2030-01-01' }] },
  });
  assert.equal(migrated.flipLevel, 100);
  assert.equal(migrated.fxp, 3705);
  assert.equal(migrated.fcBalance, 3700);
  assert.equal(migrated.ownedObjectIds.length, 52, 'unknown owned IDs must also survive');
  assert.ok(migrated.ownedObjectIds.includes('mechanical-metronome'));
  assert.ok(migrated.ownedObjectIds.includes('desk-gyroscope'));
  assert.ok(!migrated.ownedObjectIds.includes('tall-buildings'));
  assert.ok(!migrated.ownedObjectIds.includes('giraffe'));
  assert.ok(migrated.ownedArenaIds.includes('rooftop'));
  assert.ok(migrated.ownedCosmeticIds.includes('finish.chrome'));
  assert.ok(migrated.ownedCosmeticIds.includes('future.cosmetic'));
  assert.ok(migrated.featureIds.includes('insane-mode'));
  assert.ok(migrated.featureIds.includes('physics-lab'));
  assert.ok(migrated.achievementIds.includes('first_flip'));
  assert.ok(migrated.achievementIds.includes('great_save'));
  assert.equal(migrated.defeatedRivalIds.length, 0, 'legacy ownership cannot fabricate rival clears');
  assert.equal(migrated.fcTransactions.reduce((sum, tx) => sum + tx.signedAmount, 0), 3700);
}

function testSetupAliasesDoNotRewriteHistoricalStats() {
  const setup = { visualArenaId: 'arena.rooftop', selectedVariantId: 'giraffe.blue-steel',
    selectedSkin: 'giraffe', rows: [
    { id: 'p1', charId: 'tall-buildings', variantId: 'tall-buildings.red', color: '#fff' },
    { id: 'p2', objectId: 'giraffe', color: '#000' },
  ], players: [{ id: 'p3', skin: 'tall-buildings' }] };
  const historical = [{ objectId: 'tall-buildings' }, { objectId: 'giraffe' }];
  const migrated = Profile.migrateSetupSelection(setup);
  assert.equal(migrated.rows[0].charId, 'mechanical-metronome');
  assert.equal(migrated.rows[1].objectId, 'desk-gyroscope');
  assert.equal(migrated.rows[0].variantId, 'mechanical-metronome.red');
  assert.equal(migrated.selectedVariantId, 'desk-gyroscope.blue-steel');
  assert.equal(migrated.selectedSkin, 'desk-gyroscope');
  assert.equal(migrated.players[0].skin, 'mechanical-metronome');
  assert.equal(migrated.visualArenaId, 'rooftop');
  assert.deepEqual(historical, [{ objectId: 'tall-buildings' }, { objectId: 'giraffe' }]);
  assert.equal(setup.rows[0].charId, 'tall-buildings', 'migration must not mutate its source');
}

function testAtomicMatchClaimAndLiveSnapshot() {
  const storage = Profile.createMemoryStorage();
  const store = Profile.createStore({ storage, now: () => 1234 });
  let notifications = 0;
  const unsubscribe = store.subscribe(() => { notifications++; });
  const first = store.claimMatch('match-1', rewardInput({ humanWon: true }));
  const after = store.snapshot();
  assert.equal(first.applied, true);
  assert.equal(first.fcAwarded, 66);
  assert.equal(first.baseFcAwarded, 16);
  assert.equal(after.fxp, 60);
  assert.equal(after.flipLevel, 3);
  assert.equal(after.fcBalance, 66, 'match FC and crossed FL2 grant commit together');
  assert.deepEqual(after.fcTransactions.map((tx) => tx.signedAmount), [16, 50]);
  assert.equal(notifications, 1);
  const duplicate = store.claimMatch('match-1', rewardInput({ humanWon: true }));
  assert.equal(duplicate.applied, false);
  assert.equal(duplicate.reason, 'duplicate');
  assert.deepEqual(store.snapshot(), after);
  assert.equal(notifications, 1);
  unsubscribe();

  const reloaded = Profile.createStore({ storage });
  assert.deepEqual(reloaded.snapshot(), after, 'V4 load must not remigrate or duplicate level FC');
}

function testSequentialStoreRefreshAndPersistenceRollback() {
  const storage = Profile.createMemoryStorage();
  const first = Profile.createStore({ storage, now: () => 1 });
  const second = Profile.createStore({ storage, now: () => 2 });
  first.claimBundle({ claimId: 'award:a', sourceType: 'match', fxp: 10, fc: 10 });
  second.claimBundle({ claimId: 'award:b', sourceType: 'match', fxp: 10, fc: 10 });
  assert.equal(second.snapshot().fxp, 20);
  assert.ok(second.snapshot().processedClaimIds.includes('award:a'));
  assert.ok(second.snapshot().processedClaimIds.includes('award:b'));

  const before = second.snapshot();
  storage.failNextWrite();
  const failed = second.claimBundle({ claimId: 'award:failed', sourceType: 'match', fxp: 100, fc: 100 });
  assert.equal(failed.applied, false);
  assert.equal(failed.reason, 'persistence-failed');
  assert.deepEqual(second.snapshot(), before);
  assert.ok(!second.snapshot().processedClaimIds.includes('award:failed'));
}

function testStorePurchaseAndFcLedger() {
  const store = Profile.createStore({ storage: Profile.createMemoryStorage(), now: () => 99 });
  store.claimBundle({ claimId: 'seed-fc', sourceType: 'migration', fc: 500, reveal: false });
  const purchase = store.purchaseCosmetic('finish.chrome');
  assert.equal(purchase.applied, true);
  assert.equal(store.snapshot().fcBalance, 300);
  assert.ok(store.snapshot().ownedCosmeticIds.includes('finish.chrome'));
  assert.equal(store.snapshot().fcTransactions.at(-1).kind, 'spend');
  assert.equal(store.snapshot().fcTransactions.at(-1).signedAmount, -200);
  assert.equal(store.purchaseCosmetic('finish.chrome').reason, 'already-owned');
  assert.equal(store.purchaseCosmetic('nameplate.flip-legend').applied, true,
    'exact remaining balance can purchase the 300 FC tier');
  assert.equal(store.snapshot().fcBalance, 0);
  assert.equal(store.purchaseCosmetic('finish.matte').reason, 'insufficient-fc');
}

function testAchievementAndStoryIdempotency() {
  const storage = Profile.createMemoryStorage({
    'flipgame.achievements.v3': JSON.stringify({ earned: [{ id: 'first_flip' }] }),
  });
  const store = Profile.createStore({ storage, now: () => 77 });
  assert.ok(store.snapshot().achievementIds.includes('first_flip'));
  const achievement = store.claimAchievement('first_flip', 'common');
  assert.equal(achievement.applied, true, 'migrated achievement receives its V4 reward once');
  assert.equal(store.claimAchievement('first_flip', 'common').reason, 'duplicate');
  const act = store.claimStoryAct(1, 'field-note-act-1');
  assert.equal(act.applied, true);
  assert.equal(act.claimId, 'story.act.1.first-clear');
  assert.equal(store.claimStoryAct('1').reason, 'duplicate');
  assert.ok(store.snapshot().completedActIds.includes('1'));
  assert.ok(store.snapshot().fieldNoteIds.includes('field-note-act-1'));
  assert.throws(() => store.claimStoryAct('act-i'), /Unknown Story act/);
  assert.throws(() => store.claimStoryAct(2, 'wrong-note'), /field note ID/);
}

function testExactStoryRewardInterface() {
  const store = Profile.createStore({ storage: Profile.createMemoryStorage(), now: () => 81 });
  const rival = store.claimStoryReward({
    claimId: 'rival.first-light.first-clear', type: 'rival-first-clear',
    rivalId: 'first-light', objectId: 'coffee-mug', fxp: 25, fc: 15,
  });
  assert.equal(rival.applied, true);
  assert.equal(store.claimStoryReward({
    claimId: 'rival.first-light.first-clear', type: 'rival-first-clear',
    rivalId: 'first-light', objectId: 'coffee-mug', fxp: 25, fc: 15,
  }).reason, 'duplicate');
  const act = store.claimStoryReward({
    claimId: 'story.act.2.first-clear', type: 'act-first-clear', actId: 2,
    fxp: 50, fc: 25, fieldNoteId: 'field-note-act-2',
  });
  assert.equal(act.applied, true);
  assert.ok(store.snapshot().completedActIds.includes('2'));
  assert.throws(() => store.claimStoryReward({
    claimId: 'story.act.3.first-clear', type: 'act-first-clear', actId: 3,
    fxp: 51, fc: 25, fieldNoteId: 'field-note-act-3',
  }), /amount/);
  assert.throws(() => store.claimRivalVictory('scatterline', 'unstable-id'), /claim ID/);
}

function testRivalAndAlienGate() {
  const store = Profile.createStore({ storage: Profile.createMemoryStorage(), now: () => 55 });
  const earth = store.claimRivalVictory('first-light');
  assert.equal(earth.applied, true);
  assert.ok(store.snapshot().ownedObjectIds.includes('coffee-mug'));
  assert.equal(store.claimRivalVictory('coffee-mug').reason, 'duplicate');

  const alien = store.claimRivalVictory('visitor-zero');
  assert.equal(alien.applied, true);
  assert.ok(store.snapshot().defeatedRivalIds.includes('visitor-zero'));
  assert.ok(!store.snapshot().ownedObjectIds.includes('alien'), 'early victory is banked until FL100');
  assert.equal(Profile.isAlienUsable(store.snapshot()), false);
  assert.equal(Profile.isInsaneUsable(store.snapshot()), false);
  store.claimBundle({ claimId: 'reach-max', sourceType: 'match',
    fxp: Economy.MAX_LEVEL_FXP - store.snapshot().fxp, reveal: true });
  assert.equal(store.snapshot().flipLevel, 100);
  assert.ok(store.snapshot().ownedObjectIds.includes('alien'));
  assert.ok(store.snapshot().featureIds.includes('insane-mode'));
  assert.equal(Profile.isAlienUsable(store.snapshot()), true);
  assert.equal(Profile.isInsaneUsable(store.snapshot()), true);
  assert.ok(store.snapshot().pendingRevealIds.includes('object.alien'));
  assert.ok(store.snapshot().pendingRevealIds.includes('feature.insane-mode'));
}

function testV111GrandfatheredAlien() {
  const migrated = Profile.migrateV111({
    progression: { qualifyingWins: 10, ownedObjectIds: ['alien'],
      claimedRewardIds: ['object.alien', 'feature.insane-mode'] },
  });
  assert.equal(migrated.flipLevel, 10);
  assert.ok(migrated.ownedObjectIds.includes('alien'));
  assert.ok(migrated.featureIds.includes('insane-mode'));
  assert.equal(migrated.legacy.grandfatheredAlien, true);
  assert.equal(migrated.legacy.grandfatheredInsane, true);
  assert.equal(Profile.isAlienUsable(migrated), true);
  assert.equal(Profile.isInsaneUsable(migrated), true);
  assert.equal(migrated.defeatedRivalIds.length, 0);
}

function testAlienAndInsaneGateIsNotEntitlementGuessing() {
  const unearned = Profile.ProgressionStateV4({ fxp: Economy.MAX_LEVEL_FXP,
    ownedObjectIds: ['alien'], featureIds: ['insane-mode'] });
  assert.equal(Profile.isAlienUsable(unearned), false);
  assert.equal(Profile.isInsaneUsable(unearned), false);

  const defeated = Profile.ProgressionStateV4({ fxp: Economy.MAX_LEVEL_FXP,
    defeatedRivalIds: ['visitor-zero'] });
  assert.equal(Profile.alienGateSatisfied(defeated), true);
  assert.equal(Profile.isAlienUsable(defeated), true);
  assert.equal(Profile.isInsaneUsable(defeated), true);
}

function testEveryPrimaryRewardAndRivalIsReachable() {
  const store = Profile.createStore({ storage: Profile.createMemoryStorage(), now: () => 88 });
  store.claimBundle({ claimId: 'qualify:max-level', sourceType: 'match', fxp: 3705, reveal: false });
  let state = store.snapshot();
  assert.equal(state.flipLevel, 100);
  assert.equal(state.fcBalance, 3700);
  assert.equal(state.ownedObjectIds.length, 39, 'Bottle plus 38 direct Flippers');
  assert.equal(state.ownedArenaIds.length, 23);
  assert.ok(state.featureIds.includes('physics-lab'));
  assert.ok(!state.ownedObjectIds.includes('alien'));
  assert.ok(!state.featureIds.includes('insane-mode'));

  Catalog.rivals.filter((rival) => !rival.alien).forEach((rival) => {
    assert.equal(store.claimRivalVictory(rival.id).applied, true);
  });
  state = store.snapshot();
  assert.equal(state.ownedObjectIds.length, 50);
  assert.equal(store.claimRivalVictory('visitor-zero').applied, true);
  state = store.snapshot();
  assert.equal(state.ownedObjectIds.length, 51);
  assert.ok(state.featureIds.includes('insane-mode'));
  assert.equal(new Set(state.ownedObjectIds).size, 51);
}

function testNormalizationAndTransactionValidation() {
  const normalized = Profile.ProgressionStateV4({
    fxp: Infinity, fcBalance: 25,
    ownedObjectIds: ['tall-buildings', 'giraffe', 'future-object', 'future-object'],
    ownedArenaIds: ['arena.rooftop', 'future-arena'],
    ownedCosmeticIds: ['future-cosmetic'],
  });
  assert.equal(normalized.fxp, 0);
  assert.equal(normalized.fcBalance, 25);
  assert.ok(normalized.ownedObjectIds.includes('mechanical-metronome'));
  assert.ok(normalized.ownedObjectIds.includes('desk-gyroscope'));
  assert.ok(normalized.ownedObjectIds.includes('future-object'));
  assert.ok(normalized.ownedArenaIds.includes('rooftop'));
  assert.ok(normalized.ownedArenaIds.includes('future-arena'));
  assert.ok(normalized.ownedCosmeticIds.includes('future-cosmetic'));
  assert.throws(() => Profile.FcTransactionV1({ txId: 'bad', sourceId: 'bad',
    kind: 'spend', sourceType: 'cosmetic-purchase', signedAmount: 1, balanceAfter: 1 }),
  /must be negative/);
  const store = Profile.createStore({ storage: Profile.createMemoryStorage() });
  assert.throws(() => store.claimBundle({ claimId: 'bad-spend', sourceType: 'match', fc: -1 }),
    /only be spent/);
  assert.ok(!store.snapshot().processedClaimIds.includes('bad-spend'));
}

function testBrowserExports() {
  const context = vm.createContext({ console, Set, Map, Object, Array, JSON, Math, Number, String, Date });
  function run(name) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8'), context, { filename: name });
  }
  run('v112-progression-catalog.js');
  run('v112-economy.js');
  context.FlipgameV111Progression = {
    migrate() { return { qualifyingWins: 0, ownedObjectIds: ['bottle'], ownedCosmeticIds: [], achievementIds: [], claimedRewardIds: ['object.bottle'] }; },
  };
  run('v112-profile.js');
  assert.equal(context.FlipgameV112ProgressionCatalog.counts.objects, 51);
  assert.equal(context.FlipgameV112Economy.MAX_LEVEL_FXP, 3705);
  assert.equal(context.FlipgameV112Profile.snapshot().schema, 'ProgressionStateV4');
}

const tests = [
  testCatalogContract,
  testLevelCurve,
  testSetupAndPerformanceMath,
  testExactMatchRewards,
  testFreshAndRecordsV2AheadMigration,
  testEveryLegacyWinFloorMigratesDeterministically,
  testCompleteV111MigrationAndAliases,
  testSetupAliasesDoNotRewriteHistoricalStats,
  testAtomicMatchClaimAndLiveSnapshot,
  testSequentialStoreRefreshAndPersistenceRollback,
  testStorePurchaseAndFcLedger,
  testAchievementAndStoryIdempotency,
  testExactStoryRewardInterface,
  testRivalAndAlienGate,
  testV111GrandfatheredAlien,
  testAlienAndInsaneGateIsNotEntitlementGuessing,
  testEveryPrimaryRewardAndRivalIsReachable,
  testNormalizationAndTransactionValidation,
  testBrowserExports,
];

for (const test of tests) {
  test();
  console.log(`✓ ${test.name}`);
}
console.log(`v1.12 profile/economy tests passed (${tests.length} groups)`);
