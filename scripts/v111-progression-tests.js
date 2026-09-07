#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const Content = require('../js/v111-content-catalog.js');
const Cosmetics = require('../js/v111-cosmetic-catalog.js');
const Progression = require('../js/v111-progression.js');
const Achievements = require('../js/achievements.js');
const Records = require('../js/records.js');
const Interfaces = require('../js/v111-interfaces.js');

function testCatalogCountsAndLadder() {
  const objects = Content.internalObjects();
  assert.equal(Content.objectCount, 51);
  assert.equal(Content.variantCount, 612);
  assert.deepEqual(objects.map((object) => object.unlockAtWins),
    [0, ...Array.from({ length: 50 }, (_, index) => (index + 1) * 2)]);
  assert.equal(objects[0].id, 'bottle');
  assert.equal(objects[1].id, 'coffee-mug');
  assert.equal(objects[2].id, 'ketchup');
  assert.equal(objects[49].id, 'box-of-snacks');
  assert.equal(objects[50].id, 'alien');
  assert.ok(objects.every((object) => object.variants.length === 12));
  assert.ok(objects.every((object) => object.variants.every((variant) =>
    variant.id === `${object.id}.${variant.variantId}`)));
  assert.deepEqual(Content.rewardsAt(100).map((reward) => reward.id),
    ['object.alien', 'feature.insane-mode', 'feature.physics-lab']);
}

function testFrozenCosmeticSequence() {
  const expected = [
    ['finish.chrome','trail.sparks','burst.impact-rings','nameplate.clean-flip','arena.rooftop'],
    ['finish.matte','trail.bubbles','burst.splash','nameplate.table-tamer','arena.arcade'],
    ['finish.porcelain','trail.leaves','burst.dust-cloud','nameplate.spin-doctor','arena.moon-deck'],
    ['finish.woodgrain','trail.stars','burst.petals','nameplate.clutch','arena.ice-cave'],
    ['finish.frosted-glass','trail.pixel','burst.blocks','nameplate.hot-hand','arena.neon-grid'],
    ['finish.neon','trail.confetti','burst.comic-pop','nameplate.chaos-pilot','arena.garden'],
    ['finish.galaxy','trail.snow','burst.music-notes','nameplate.cap-collector','arena.space-station'],
    ['finish.lava','trail.smoke','burst.feathers','nameplate.orbit-breaker','arena.volcano'],
    ['finish.ice','trail.lightning','burst.gears','nameplate.crowd-favorite','arena.storm-table'],
    ['finish.holographic','trail.prism','burst.aurora','nameplate.flip-legend','arena.aurora-stage'],
  ].flat();
  const catalog = Cosmetics.internalCatalog();
  assert.equal(Cosmetics.count, 50);
  assert.deepEqual(catalog.map((entry) => entry.id), expected);
  assert.deepEqual(catalog.map((entry) => entry.unlockAtWins),
    Array.from({ length: 50 }, (_, index) => index * 2 + 1));
  assert.equal(catalog.filter((entry) => entry.scope === 'global').length, 10);
}

function humanWin(extra = {}) {
  return { won: true, completed: true, winnerIsHuman: true, format: 'classic', ...extra };
}

function testEveryWinRevealsAndReachesAllContent() {
  const store = Progression.createStore({ storage: Progression.createMemoryStorage() });
  for (let win = 1; win <= 100; win++) {
    const result = store.recordQualifyingWin(humanWin());
    assert.equal(result.qualified, true);
    assert.ok(result.unlocked.length >= 1, `qualifying win ${win} must reveal content`);
    if (win % 2) assert.equal(result.unlocked.length, 1, `odd win ${win} awards one cosmetic`);
    if (win < 100 && win % 2 === 0) assert.equal(result.unlocked.length, 1, `even win ${win} awards one object`);
    if (win === 100) assert.deepEqual(result.unlocked.map((reward) => reward.id),
      ['object.alien', 'feature.insane-mode', 'feature.physics-lab']);
  }
  const state = store.snapshot();
  assert.equal(state.qualifyingWins, 100);
  assert.equal(state.ownedObjectIds.length, 51);
  assert.equal(state.ownedCosmeticIds.length, 50);
  assert.equal(Content.ownsFeature(state, 'insane-mode'), true);
  assert.equal(Content.ownsFeature(state, 'physics-lab'), true);
}

function testQualificationAndAntiFarmingRules() {
  assert.equal(Progression.isQualifyingHumanWin(humanWin()), true);
  assert.equal(Progression.isQualifyingHumanWin(humanWin({ online: true })), true);
  assert.equal(Progression.isQualifyingHumanWin({ won: true, winningTeamHasHuman: true, format: 'team' }), true);
  [
    {}, { won: true, aiOnly: true }, { won: true, winnerIsAI: true, hasHumanPlayer: true },
    humanWin({ practice: true }), humanWin({ mode: 'physics-lab' }), humanWin({ lab: true }),
    humanWin({ forced: true }), humanWin({ test: true }), humanWin({ testData: true }),
    humanWin({ simulated: true }), humanWin({ abandoned: true }), humanWin({ completed: false }),
  ].forEach((context) => assert.equal(Progression.isQualifyingHumanWin(context), false));

  const store = Progression.createStore({ storage: Progression.createMemoryStorage() });
  for (const context of [
    { won: true, aiOnly: true }, humanWin({ practice: true }), humanWin({ lab: true }),
    humanWin({ forced: true }), humanWin({ test: true }),
  ]) assert.equal(store.recordQualifyingWin(context).qualified, false);
  assert.equal(store.snapshot().qualifyingWins, 0);
}

function testMigrationAndNoRelock() {
  const migrated = Progression.migrate({
    progression: {
      schema: 'ProgressionStateV3', version: 3, qualifyingWins: 2,
      ownedObjectIds: ['bottle', 'alien', 'future-object'],
      ownedCosmeticIds: ['arena.aurora-stage', 'future.cosmetic'],
      achievementIds: ['first_flip'], claimedRewardIds: ['feature.insane-mode'],
    },
    legacyRecords: {
      totalWins: 12,
      unlockedSkins: ['bottle', 'trophy_gold', 'octopus'],
    },
    legacyAchievements: ['great_save'],
  });
  assert.equal(migrated.qualifyingWins, 12);
  for (const id of ['alien', 'future-object', 'tall-buildings', 'octopus', 'coffee-mug', 'milk-carton', 'teapot']) {
    assert.ok(migrated.ownedObjectIds.includes(id), `migration preserves/grants ${id}`);
  }
  assert.ok(migrated.ownedCosmeticIds.includes('arena.aurora-stage'));
  assert.ok(migrated.ownedCosmeticIds.includes('future.cosmetic'));
  assert.ok(migrated.achievementIds.includes('first_flip'));
  assert.ok(migrated.achievementIds.includes('great_save'));
  assert.equal(Content.ownsFeature(migrated, 'insane-mode'), true);

  const lowerCounter = Progression.reconcile({ ...migrated, qualifyingWins: 0 });
  assert.ok(lowerCounter.ownedObjectIds.includes('alien'));
  assert.ok(lowerCounter.ownedCosmeticIds.includes('arena.aurora-stage'));
  assert.equal(Content.ownsFeature(lowerCounter, 'insane-mode'), true);
}

function assertLockOnly(value) {
  assert.deepEqual(Object.keys(value).sort(), ['ariaLabel', 'locked', 'symbol']);
  assert.deepEqual(value, { locked: true, symbol: '🔒', ariaLabel: 'Locked' });
  const encoded = JSON.stringify(value).toLowerCase();
  for (const forbidden of ['name', 'threshold', 'wins', 'progress', 'coffee', 'chrome', 'insane']) {
    assert.ok(!encoded.includes(forbidden), `locked view leaked ${forbidden}`);
  }
}

function testHiddenContentQueries() {
  const state = Interfaces.ProgressionStateV3({ qualifyingWins: 0, ownedObjectIds: ['bottle'] });
  assertLockOnly(Content.viewObject(state, 'coffee-mug'));
  assertLockOnly(Content.viewVariant(state, 'coffee-mug.blue-steel'));
  assertLockOnly(Content.viewFeature(state, 'insane-mode'));
  assertLockOnly(Cosmetics.view(state, 'finish.chrome'));
  assert.equal(Content.listObjectsForPlayer(state).length, 51);
  Content.listObjectsForPlayer(state).slice(1).forEach(assertLockOnly);
  Cosmetics.listForPlayer(state).forEach(assertLockOnly);
}

function testAchievementCatalogAndDeterminism() {
  const summary = Achievements.catalogSummary();
  assert.equal(summary.total, 100);
  assert.deepEqual(summary.categoryCounts, {
    existing: 30, events: 30, classic: 10, cup: 8, team: 8, collection: 8, 'lab-stats': 6,
  });

  const storage = Achievements.createMemoryStorage({
    'flipgame.achievements.v1': JSON.stringify(['first_flip', 'great_save']),
  });
  const store = Achievements.createStore({ storage, now: () => '2030-01-02T03:04:05.000Z' });
  assert.equal(store.isUnlocked('first_flip'), true);
  assert.equal(store.isUnlocked('great_save'), true);
  assert.equal(store.unlockedCount(), 2);

  for (const blocked of [
    { qualifying: true, practice: true, result: 'MAKE', totalMakesLifetime: 1 },
    { qualifying: true, lab: true, eventId: 'plinko' },
    { qualifying: true, forced: true, won: true, format: 'classic' },
    { qualifying: true, testData: true, ownedObjectCount: 51 },
    { qualifying: true, aiOnly: true, totalFlipsLifetime: 1000 },
  ]) assert.deepEqual(store.check(blocked), []);

  const eventIds = Interfaces.EVENT_IDS;
  eventIds.forEach((eventId) => store.check({ qualifying: true, eventId, eventResolved: true }));
  assert.ok(eventIds.every((id) => store.isUnlocked(`event-${id}`)));

  const broad = {
    qualifying: true, won: true, result: 'MAKE', format: 'classic', totalFlipsLifetime: 5000,
    totalMakesLifetime: 500, totalClassicWins: 50, winnerWins: 15, streak: 20,
    onFireBonus: 10, justIgnited: true, pointCount: 12, perfect: true, perfectInMatch: true,
    power: 0.2, greatSave: true, capLand: true, capLandsLifetime: 10, greatSavesLifetime: 10,
    landingReason: 'tractor-ring', bankHits: 6, padOffset: 0.1, wonWithoutMiss: true,
    droppedToOneLife: true, sawSuddenDeath: true, playerCount: 8, ignitionsThisGame: 2,
    openingFlip: true, edgeLanding: true, rotations: 2, livesBefore: 1,
    suddenDeathBefore: true, stakeBefore: 20, perfectPair: true, capMakesThisMatch: 3,
    reachedOnFireCap: true, distinctObjectsUsed: 51, distinctCosmeticsEquipped: 50,
    distinctArenasPlayed: 10, perfectLandingsLifetime: 100, capLandingsLifetime: 50,
    matchesLifetime: 100,
  };
  const first = store.check(broad);
  assert.ok(first.length > 0);
  assert.ok(first.every((entry) => entry.earnedAt === '2030-01-02T03:04:05.000Z'));
  assert.deepEqual(store.check(broad), [], 'already earned achievements are deterministic/idempotent');

  store.check({ qualifying: true, won: true, format: 'cup', cupLength: 'short', playerCount: 8,
    loserHeatWins: 0, lostFirstHeat: true, allCupStarterPositionsCovered: true, lifetimeCupWins: 3 });
  store.check({ qualifying: true, won: true, format: 'cup', cupLength: 'full' });
  for (const playerCount of [2, 8]) {
    store.check({ qualifying: true, won: true, format: 'team', playerCount,
      cancellationPoints: 5, largestDeficit: 5, everyTeammateScored: true,
      matchPointCancellation: true, everyTeammateMadeInRound: true });
  }
  store.check({ mode: 'physics-lab', physicsLab: true, qualifyingLabAction: true,
    humanParticipant: true, advancedLabUsed: true });
  store.check({ mode: 'physics-lab', physicsLab: true, qualifyingLabAction: true,
    humanParticipant: true, replayedSeedImproved: true });
  const earnedCounts = {};
  store.earned().forEach((entry) => { earnedCounts[entry.category] = (earnedCounts[entry.category] || 0) + 1; });
  for (const category of ['events', 'classic', 'cup', 'team', 'collection', 'lab-stats']) {
    assert.equal(earnedCounts[category], summary.categoryCounts[category],
      `deterministic fixtures must exercise every ${category} condition`);
  }

  const locked = Achievements.createStore({ storage: Achievements.createMemoryStorage() });
  locked.list().forEach(assertLockOnly);
  const html = locked.renderGridHtml();
  assert.ok(!html.includes('First Flip'));
  assert.ok(!html.includes('Take your'));
  assert.equal((html.match(/aria-label="Locked"/g) || []).length, 1);
  assert.ok(!html.includes('/100'));
}

function testRecordsSchemaAndHtmlSafety() {
  const storage = Records.createMemoryStorage({
    'flipgame.records.v1': JSON.stringify({
      totalWins: 4, totalFlips: 9, totalMakes: 5,
      mostWins: { '<img src=x onerror=alert(1)>': 4 },
      unlockedSkins: ['bottle', 'ketchup'],
    }),
  });
  const progression = Progression.createStore({ storage });
  const records = Records.createStore({ storage, progression });
  const state = records.snapshot();
  assert.equal(state.schema, 'RecordSummaryV2');
  assert.equal(Object.prototype.hasOwnProperty.call(state, 'mostWins'), false);
  assert.ok(Array.isArray(state.winnerRecords));
  assert.ok(!Object.keys(state).includes('<img src=x onerror=alert(1)>'));
  assert.equal(state.winnerRecords[0].displayName, 'Player');
  const html = records.renderHtml();
  assert.ok(html.includes('Player'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('onerror'));

  assert.equal(records.recordWin('No Context'), null, 'unclassified wins fail closed');
  assert.equal(records.recordWin('Practice', humanWin({ practice: true })), null);
  const result = records.recordWin('Ada', humanWin({ playerId: 'p-ada' }));
  assert.equal(result.winnerWins, 1);
  assert.equal(records.winnerWins('p-ada'), 1);
  assert.equal(records.unlockSkin('alien'), false);
  assert.deepEqual(records.unlockAll(), []);
  assert.equal(records.resetSkinProgress(), false);
  assert.equal(records.winsToNextBox(), 0);
  const exported = records.exportState();
  assert.equal(exported.progression.schema, 'ProgressionStateV3');
  assert.equal(exported.records.schema, 'RecordSummaryV2');
}

function testBrowserRecordsAndPickerShareLiveProgression() {
  const before = Progression.snapshot();
  const first = Records.recordWin('Live Sync', humanWin({ playerId: 'live-sync' }));
  const second = Records.recordWin('Live Sync', humanWin({ playerId: 'live-sync' }));
  const after = Progression.snapshot();

  assert.equal(after.qualifyingWins, before.qualifyingWins + 2,
    'the picker-facing progression store must advance immediately with Records');
  assert.deepEqual(second.progression, after,
    'the unlock notification and picker must observe the same progression snapshot');
  [first, second].flatMap((result) => result.unlocked)
    .filter((reward) => reward.type === 'object')
    .forEach((reward) => {
      assert.equal(Content.viewObject(after, reward.contentId).locked, false,
        `${reward.contentId} was announced but stayed locked in the picker`);
      assert.equal(Records.isSkinUnlocked(reward.contentId), true,
        `${reward.contentId} was announced but stayed locked in Records`);
    });
}

const tests = [
  testCatalogCountsAndLadder,
  testFrozenCosmeticSequence,
  testEveryWinRevealsAndReachesAllContent,
  testQualificationAndAntiFarmingRules,
  testMigrationAndNoRelock,
  testHiddenContentQueries,
  testAchievementCatalogAndDeterminism,
  testRecordsSchemaAndHtmlSafety,
  testBrowserRecordsAndPickerShareLiveProgression,
];

for (const test of tests) {
  test();
  console.log(`✓ ${test.name}`);
}
console.log(`v111 progression tests passed (${tests.length} groups)`);
