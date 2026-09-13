#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Achievements = require('../js/v112-achievements.js');
const Legacy = require('../js/achievements.js');
const LegacyProgression = require('../js/v111-progression.js');
const Profile = require('../js/v112-profile.js');

const EXISTING_IDS = [
  'first_flip', 'first_make', 'ignition', 'inferno', 'supernova', 'streak_master',
  'high_roller', 'table_setter', 'bullseye', 'full_send', 'feather_touch',
  'great_save', 'cap_land', 'mothership', 'smooth_operator', 'deadeye',
  'last_one_standing', 'dynasty', 'empire', 'iron_will', 'clean_sweep',
  'sudden_survivor', 'comeback_kid', 'party_animal', 'full_house',
  'century_club', 'millennial', 'hot_hands', 'ghost_protocol', 'close_encounter',
];
const EVENT_IDS = [
  'rainbow-corkscrew', 'half-full', 'power-launch', 'fizz-jet', 'golden-flip',
  'bouncy-bottle', 'earthquake', 'moon-gravity', 'ice-slide', 'alien-invasion',
  'gravity-slam', 'trampoline', 'wind-tunnel', 'shrink-ray', 'portal-pair',
  'tether-swing', 'mitosis', 'double-flip', 'ceiling-flip', 'meteor-shower',
  'magnet', 'heart-rush', 'black-hole', 'boomerang', 'roulette-table', 'rewind',
  'plinko', 'mirror-match', 'cap-toss', 'life-drain',
].map((id) => `event-${id}`);
const CLASSIC_IDS = [
  'classic-opening-make', 'classic-edge-landing', 'classic-two-rotation-make',
  'classic-one-life-make', 'classic-sudden-death-cap', 'classic-stake-20-make',
  'classic-perfect-pair', 'classic-three-caps', 'classic-on-fire-cap',
  'classic-twenty-make-streak',
];
const CUP_IDS = [
  'cup-first-win', 'cup-sweep-2-0', 'cup-reverse-sweep', 'cup-short-win',
  'cup-full-win', 'cup-eight-player', 'cup-all-starters', 'cup-three-lifetime',
];
const TEAM_IDS = [
  'team-first-win', 'team-two-player-win', 'team-eight-player-win',
  'team-five-point-cancellation', 'team-five-point-comeback',
  'team-every-teammate-scored', 'team-match-point-cancellation',
  'team-every-teammate-made-round',
];
const COLLECTION_IDS = [
  'collection-use-5-objects', 'collection-use-15-objects',
  'collection-use-30-objects', 'collection-use-all-objects',
  'collection-equip-5-cosmetics', 'collection-equip-25-cosmetics',
  'collection-equip-all-cosmetics', 'collection-play-all-arenas',
];
const STATS_IDS = [
  'stats-advanced-lab', 'stats-improved-seed', 'stats-hundred-perfect-landings',
  'stats-fifty-cap-landings', 'stats-hundred-matches', 'stats-five-thousand-flips',
];
const BATTLE_IDS = [
  'battle-first-win', 'battle-duel-win', 'battle-doubles-win',
  'battle-four-way-win', 'battle-volley-sweep', 'battle-rush-win',
  'battle-stored-power-win', 'battle-paired-sudden-death-win',
];
const STORY_IDS = [
  'story-first-rival', 'story-act-one', 'story-all-urth-rivals',
  'story-campaign-complete', 'story-alien-defeated', 'story-coop-chapter',
  'story-clean-rival-duel', 'story-all-field-notes',
];
const STORE_IDS = [
  'store-first-purchase', 'store-five-purchases', 'store-twenty-purchases',
  'store-all-cosmetics',
];
const LEGACY_IDS = [
  ...EXISTING_IDS, ...EVENT_IDS, ...CLASSIC_IDS, ...CUP_IDS, ...TEAM_IDS,
  ...COLLECTION_IDS, ...STATS_IDS,
];
const ADDED_IDS = [...BATTLE_IDS, ...STORY_IDS, ...STORE_IDS];
const ALL_IDS = [...LEGACY_IDS, ...ADDED_IDS];

function input(context, earnedIds = []) {
  return { schema: 'AchievementEvaluationV1', version: 1, context, earnedIds };
}
function awardIds(result) {
  return result.awards.map((award) => award.achievement.id);
}
function onlyTargetContext(id, context) {
  return Achievements.createEvaluator().evaluate(input(context, ALL_IDS.filter((known) => known !== id)));
}

function testExactCatalogIdentityAndOrder() {
  assert.equal(LEGACY_IDS.length, 100);
  assert.equal(ADDED_IDS.length, 20);
  assert.equal(ALL_IDS.length, 120);
  assert.equal(new Set(ALL_IDS).size, 120);
  assert.deepEqual(Legacy.catalogSummary().categoryCounts, {
    existing: 30, events: 30, classic: 10, cup: 8, team: 8,
    collection: 8, 'lab-stats': 6,
  });
  assert.deepEqual(Achievements.catalogSummary(), {
    total: 120,
    legacy: 100,
    added: 20,
    categoryCounts: {
      existing: 30, events: 30, classic: 10, cup: 8, team: 8,
      collection: 8, 'lab-stats': 6, battle: 8, 'story-rival': 8, store: 4,
    },
    rarityCounts: { common: 24, rare: 38, legendary: 19, notable: 39 },
  });
  const views = Achievements.listViews(ALL_IDS);
  assert.deepEqual(views.map((view) => view.id), ALL_IDS,
    'the first 100 IDs and all appended IDs must retain their frozen order');
  ALL_IDS.forEach((id) => {
    assert.equal(Achievements.isKnownId(id), true, `${id} must be recognized`);
    const definition = Achievements.lookupForMigration(id);
    assert.equal(definition.id, id);
    assert.equal(definition.generation, LEGACY_IDS.includes(id) ? 'v1.11' : 'v1.12');
    assert.ok(Object.isFrozen(definition));
    assert.ok(Object.isFrozen(definition.reward));
  });
  assert.equal(Achievements.lookupForMigration('event-rainbow-trail').id,
    'event-rainbow-corkscrew', 'the one frozen legacy event alias remains migratable');
  assert.equal(Achievements.lookupForMigration('future-achievement'), null);
  assert.equal(Achievements.isKnownId('<script>'), false);
}

function testEveryAuthoredRarityAndReward() {
  const raritySerialization = ALL_IDS.map((id) => {
    const item = Achievements.lookupForMigration(id);
    assert.ok(['common', 'notable', 'rare', 'legendary'].includes(item.rarity));
    const expectedReward = {
      common: { fxp: 15, fc: 10 }, notable: { fxp: 30, fc: 20 },
      rare: { fxp: 50, fc: 30 }, legendary: { fxp: 75, fc: 50 },
    }[item.rarity];
    assert.deepEqual(item.reward, expectedReward, `${id} uses its exact rarity reward`);
    assert.deepEqual(Achievements.rewardForRarity(item.rarity), expectedReward);
    return `${id}:${item.rarity}`;
  }).join('\n');
  // Full-catalog fingerprint: a change to any one of the 120 authored tiers is
  // intentional only if this reviewed fixture is deliberately updated.
  assert.equal(crypto.createHash('sha256').update(raritySerialization).digest('hex'),
    'd5aadd6b354212adf3e76731e47018c58032a28eeb146a3889a02600a0ce89ea');
  assert.equal(Achievements.rewardForRarity('future'), null);
}

function testLockedViewsAreOpaque() {
  const locked = Achievements.listViews([]);
  assert.equal(locked.length, 120);
  locked.forEach((view) => {
    assert.deepEqual(view, { locked: true, symbol: '🔒', ariaLabel: 'Locked' });
    assert.deepEqual(Object.keys(view).sort(), ['ariaLabel', 'locked', 'symbol']);
    assert.ok(Object.isFrozen(view));
  });
  const one = Achievements.listViews(['first_flip']);
  assert.equal(one[0].locked, false);
  assert.equal(one[0].id, 'first_flip');
  one.slice(1).forEach((view) => assert.deepEqual(view,
    { locked: true, symbol: '🔒', ariaLabel: 'Locked' }));
}

function testLegacyEvaluationIsWrappedWithoutMutation() {
  const progressionBefore = LegacyProgression.exportState();
  let result = onlyTargetContext('first_flip', {
    qualifying: true, humanParticipant: true, totalFlipsLifetime: 1,
  });
  assert.deepEqual(awardIds(result), ['first_flip']);
  result = onlyTargetContext('event-rainbow-corkscrew', {
    qualifying: true, humanParticipant: true, eventId: 'rainbow-trail', eventResolved: true,
  });
  assert.deepEqual(awardIds(result), ['event-rainbow-corkscrew']);
  result = onlyTargetContext('classic-opening-make', {
    qualifying: true, humanParticipant: true, format: 'classic', result: 'MAKE', openingFlip: true,
  });
  assert.deepEqual(awardIds(result), ['classic-opening-make']);
  assert.deepEqual(Legacy.catalogSummary(), {
    total: 100,
    categoryCounts: {
      existing: 30, events: 30, classic: 10, cup: 8, team: 8,
      collection: 8, 'lab-stats': 6,
    },
  });
  assert.deepEqual(LegacyProgression.exportState(), progressionBefore,
    'observing legacy conditions must not mutate the v1.11 progression singleton');
}

function testAllTwentyNewConditions() {
  const cases = [
    ['battle-first-win',
      { qualifying: true, humanParticipant: true, format: 'battle', won: true },
      { qualifying: true, humanParticipant: true, format: 'battle', won: false }],
    ['battle-duel-win',
      { qualifying: true, humanParticipant: true, format: 'battle', won: true, battleFormatId: 'duel' },
      { qualifying: true, humanParticipant: true, format: 'battle', won: true, battleFormatId: 'doubles' }],
    ['battle-doubles-win',
      { qualifying: true, humanParticipant: true, format: 'battle', won: true, battleFormatId: 'doubles' },
      { qualifying: true, humanParticipant: true, format: 'battle', won: true, battleFormatId: 'duel' }],
    ['battle-four-way-win',
      { qualifying: true, humanParticipant: true, format: 'battle', won: true, battleFormatId: 'four-way' },
      { qualifying: true, humanParticipant: true, format: 'battle', won: true, battleFormatId: 'duel' }],
    ['battle-volley-sweep',
      { qualifying: true, humanParticipant: true, format: 'battle', won: true,
        battlePaceId: 'volley', battleHeatWins: 2, battleHeatLosses: 0 },
      { qualifying: true, humanParticipant: true, format: 'battle', won: true,
        battlePaceId: 'volley', battleHeatWins: 2, battleHeatLosses: 1 }],
    ['battle-rush-win',
      { qualifying: true, humanParticipant: true, format: 'battle', won: true, battlePaceId: 'rush' },
      { qualifying: true, humanParticipant: true, format: 'battle', won: true, battlePaceId: 'volley' }],
    ['battle-stored-power-win',
      { qualifying: true, humanParticipant: true, format: 'battle', won: true, battleStoredPowerWin: true },
      { qualifying: true, humanParticipant: true, format: 'battle', won: true, battleStoredPowerWin: false }],
    ['battle-paired-sudden-death-win',
      { qualifying: true, humanParticipant: true, format: 'battle', won: true,
        battlePairedSuddenDeathWin: true },
      { qualifying: true, humanParticipant: true, format: 'battle', won: true,
        battlePairedSuddenDeathWin: false }],
    ['story-first-rival',
      { qualifying: true, humanParticipant: true, activity: 'rival-board', newlyDefeatedRivalId: 'first-light' },
      { qualifying: true, humanParticipant: true, activity: 'rival-board' }],
    ['story-act-one',
      { qualifying: true, humanParticipant: true, activity: 'story', newlyCompletedActIds: ['1'] },
      { qualifying: true, humanParticipant: true, activity: 'story', newlyCompletedActIds: ['2'] }],
    ['story-all-urth-rivals',
      { qualifying: true, humanParticipant: true, activity: 'story', urthRivalsDefeated: 11 },
      { qualifying: true, humanParticipant: true, activity: 'story', urthRivalsDefeated: 10 }],
    ['story-campaign-complete',
      { qualifying: true, humanParticipant: true, activity: 'story', campaignCompleted: true },
      { qualifying: true, humanParticipant: true, activity: 'story', campaignCompleted: false }],
    ['story-alien-defeated',
      { qualifying: true, humanParticipant: true, activity: 'story', alienDefeated: true },
      { qualifying: true, humanParticipant: true, activity: 'story', alienDefeated: false }],
    ['story-coop-chapter',
      { qualifying: true, humanParticipant: true, activity: 'story',
        storyChapterCleared: true, storyCoop: true },
      { qualifying: true, humanParticipant: true, activity: 'story',
        storyChapterCleared: true, storyCoop: false }],
    ['story-clean-rival-duel',
      { qualifying: true, humanParticipant: true, activity: 'rival-board', rivalDuelWonWithoutMiss: true },
      { qualifying: true, humanParticipant: true, activity: 'rival-board', rivalDuelWonWithoutMiss: false }],
    ['story-all-field-notes',
      { qualifying: true, humanParticipant: true, activity: 'story', fieldNoteCount: 4 },
      { qualifying: true, humanParticipant: true, activity: 'story', fieldNoteCount: 3 }],
    ['store-first-purchase',
      { storeAction: true, storePurchaseCount: 1 },
      { storeAction: true, storePurchaseCount: 0 }],
    ['store-five-purchases',
      { storeAction: true, storePurchaseCount: 5 },
      { storeAction: true, storePurchaseCount: 4 }],
    ['store-twenty-purchases',
      { storeAction: true, storePurchaseCount: 20 },
      { storeAction: true, storePurchaseCount: 19 }],
    ['store-all-cosmetics',
      { storeAction: true, storePurchaseCount: 40 },
      { storeAction: true, storePurchaseCount: 39 }],
  ];
  assert.deepEqual(cases.map(([id]) => id), ADDED_IDS);
  cases.forEach(([id, positive, negative]) => {
    const success = onlyTargetContext(id, positive);
    assert.equal(success.eligible, true);
    assert.deepEqual(awardIds(success), [id], `${id} must match its exact positive signal`);
    assert.deepEqual(awardIds(onlyTargetContext(id, negative)), [],
      `${id} must reject its adjacent negative boundary`);
  });

  assert.deepEqual(awardIds(Achievements.createEvaluator().evaluate(input(
    { storeAction: true, storePurchaseCount: 40 }, LEGACY_IDS))), STORE_IDS,
  'the Store milestones intentionally stack on the fortieth purchase');
  assert.deepEqual(awardIds(onlyTargetContext('story-alien-defeated', {
    qualifying: true, humanParticipant: true, activity: 'rival-board',
    newlyDefeatedRivalId: 'visitor-zero',
  })), ['story-alien-defeated'], 'Visitor Zero first-clear is an exact Alien-defeat signal');
}

function testEligibilityExclusionsAreFailClosed() {
  const base = { qualifying: true, humanParticipant: true, format: 'battle', won: true };
  for (const blocked of [
    { testData: true }, { test: true }, { testMode: true }, { forced: true },
    { isForced: true }, { ownerTest: true }, { ownerTestMode: true },
    { simulated: true }, { aiOnly: true }, { imported: true }, { replay: true },
    { practice: true }, { isPractice: true }, { tutorial: true }, { isTutorial: true },
    { rewardsEligible: false }, { progressionEligible: false }, { achievementsEligible: false },
    { qualifying: false },
  ]) {
    const result = Achievements.createEvaluator().evaluate(input({ ...base, ...blocked }));
    assert.equal(result.eligible, false, JSON.stringify(blocked));
    assert.deepEqual(result.awards, []);
  }
  for (const mode of ['practice', 'tutorial', 'physics-lab', 'lab']) {
    const result = Achievements.createEvaluator().evaluate(input({
      qualifying: true, humanParticipant: true, mode, advancedLabUsed: true,
    }));
    assert.equal(result.eligible, false, mode);
    assert.deepEqual(result.awards, []);
  }
  assert.equal(Achievements.createEvaluator().evaluate(input({
    format: 'battle', won: true, players: [{ isAI: true }, { isAI: true }],
  })).eligible, false, 'AI-only context without a human signal is ineligible');
  assert.equal(Achievements.createEvaluator().evaluate(input({
    format: 'battle', won: true, players: [{ isAI: false }, { isAI: true }],
  })).eligible, true, 'an explicit manual player signal is sufficient');
}

function testExactSchemaAndBounds() {
  const good = input({ qualifying: true, humanParticipant: true }, []);
  assert.doesNotThrow(() => Achievements.AchievementEvaluationV1(good));
  assert.throws(() => Achievements.AchievementEvaluationV1({ ...good, extra: true }), /unknown field/);
  assert.throws(() => Achievements.AchievementEvaluationV1({ ...good, version: 2 }), /must use/);
  assert.throws(() => Achievements.AchievementEvaluationV1({ ...good, context: { surprise: true } }), /unknown field/);
  assert.throws(() => Achievements.AchievementEvaluationV1(input({ testData: 1 })), /must be boolean/);
  assert.throws(() => Achievements.AchievementEvaluationV1(input({ playerCount: 17 })), /bounded/);
  assert.throws(() => Achievements.AchievementEvaluationV1(input({ storePurchaseCount: 41 })), /bounded/);
  assert.throws(() => Achievements.AchievementEvaluationV1(input({ fieldNoteCount: 5 })), /bounded/);
  assert.throws(() => Achievements.AchievementEvaluationV1(input({ newlyCompletedActIds: ['5'] })), /Unknown Story act/);
  assert.throws(() => Achievements.AchievementEvaluationV1(input({ newlyDefeatedRivalId: 'unknown' })), /Unknown newly/);
  assert.throws(() => Achievements.AchievementEvaluationV1(input({}, ['first_flip', 'first_flip'])), /Duplicate/);
  assert.throws(() => Achievements.AchievementEvaluationV1(input({}, Array.from({ length: 257 }, (_, i) => `future-${i}`))), /at most 256/);
  assert.doesNotThrow(() => Achievements.AchievementEvaluationV1(input({}, ['future-achievement'])),
    'bounded unknown future IDs survive evaluation input for migration compatibility');

  const sparse = [];
  sparse.length = 1;
  assert.throws(() => Achievements.AchievementEvaluationV1(input({}, sparse)), /dense/);
  const extended = [];
  extended.extra = true;
  assert.throws(() => Achievements.AchievementEvaluationV1(input({}, extended)), /extra fields/);
  const accessorContext = {};
  Object.defineProperty(accessorContext, 'qualifying', { enumerable: true, get() { return true; } });
  assert.throws(() => Achievements.AchievementEvaluationV1(input(accessorContext)), /data properties/);
  const symbolContext = { qualifying: true };
  symbolContext[Symbol('hidden')] = true;
  assert.throws(() => Achievements.AchievementEvaluationV1(input(symbolContext)), /symbol fields/);
}

function testEvidenceAuthorityAndProfileIntegration() {
  const evaluator = Achievements.createEvaluator();
  assert.ok(Object.isFrozen(evaluator));
  assert.ok(Object.isFrozen(evaluator.rewardAuthority));
  assert.deepEqual(Object.keys(evaluator.rewardAuthority).sort(), ['schema', 'verify', 'version']);
  const result = evaluator.evaluate(input({
    qualifying: true, humanParticipant: true, activity: 'story', campaignCompleted: true,
  }, ALL_IDS.filter((id) => id !== 'story-campaign-complete')));
  assert.deepEqual(awardIds(result), ['story-campaign-complete']);
  const evidence = result.awards[0].rewardEvidence;
  assert.ok(Object.isFrozen(evidence));
  assert.deepEqual(evidence, { schema: 'AchievementRewardEvidenceV1', version: 1 });
  assert.equal(Object.prototype.hasOwnProperty.call(evidence, 'id'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(evidence, 'rarity'), false);
  assert.deepEqual(evaluator.rewardAuthority.verify(evidence), {
    id: 'story-campaign-complete', rarity: 'legendary',
  });
  assert.ok(Object.isFrozen(evaluator.rewardAuthority.verify(evidence)));
  assert.throws(() => evaluator.rewardAuthority.verify(Object.freeze({
    schema: 'AchievementRewardEvidenceV1', version: 1,
  })), /not evaluator-issued/);
  assert.throws(() => Achievements.createEvaluator().rewardAuthority.verify(evidence), /not evaluator-issued/,
    'evidence cannot cross evaluator authority boundaries');

  const store = Profile.createTestStore({
    storage: Profile.createMemoryStorage(), productionSemantics: true,
    achievementAuthority: evaluator.rewardAuthority,
  });
  const before = store.snapshot();
  const claim = store.claimAchievement(evidence);
  assert.equal(claim.applied, true);
  assert.equal(claim.fxpAwarded, 75);
  assert.equal(claim.baseFcAwarded, 50,
    'the Legendary achievement itself contributes exactly 50 FC');
  assert.equal(store.snapshot().fxp - before.fxp, 75);
  assert.equal(store.snapshot().fcBalance - before.fcBalance, claim.fcAwarded,
    'the profile may atomically include deterministic level-up FC in the same claim');
  assert.ok(store.snapshot().fcTransactions.some((tx) =>
    tx.sourceType === 'achievement' && tx.sourceId === 'story-campaign-complete' &&
    tx.signedAmount === 50), 'the FC ledger retains exact achievement provenance');
  assert.ok(store.snapshot().achievementIds.includes('story-campaign-complete'));
  const after = store.snapshot();
  assert.equal(store.claimAchievement(evidence).duplicate, true);
  assert.deepEqual(store.snapshot(), after, 'replaying valid evidence is profile-idempotent');
  assert.throws(() => store.claimAchievement(Object.freeze({
    schema: 'AchievementRewardEvidenceV1', version: 1,
  })), /not evaluator-issued/);
  assert.deepEqual(store.snapshot(), after, 'forged evidence cannot mutate Profile V4');
}

function testNoRngAndDeterministicOrdering() {
  const originalRandom = Math.random;
  Math.random = () => { throw new Error('achievement evaluation must not consume RNG'); };
  try {
    const context = { qualifying: true, humanParticipant: true, format: 'battle', won: true,
      battleFormatId: 'duel', battlePaceId: 'rush', battleStoredPowerWin: true,
      battlePairedSuddenDeathWin: true };
    const first = Achievements.createEvaluator().evaluate(input(context, LEGACY_IDS));
    const second = Achievements.createEvaluator().evaluate(input(context, LEGACY_IDS));
    assert.deepEqual(awardIds(first), awardIds(second));
    assert.deepEqual(awardIds(first), [
      'battle-first-win', 'battle-duel-win', 'battle-rush-win',
      'battle-stored-power-win', 'battle-paired-sudden-death-win',
    ]);
  } finally {
    Math.random = originalRandom;
  }
}

function testBrowserReadOnlyCatalogBoundary() {
  const context = vm.createContext({ console });
  const run = (name) => vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8'), context, { filename: name });
  run('v111-interfaces.js');
  vm.runInContext('FlipgameV111Progression = { addAchievement: function () {} };', context);
  run('achievements.js');
  run('v112-achievements.js');
  const browserSummary = JSON.parse(vm.runInContext(
    'JSON.stringify(FlipgameV112Achievements.catalogSummary())', context));
  assert.deepEqual(browserSummary, Achievements.catalogSummary());
  assert.deepEqual(JSON.parse(vm.runInContext(
    'JSON.stringify(Object.keys(FlipgameV112Achievements).sort())', context)), [
    'catalogSummary', 'isKnownId', 'listViews', 'lookupForMigration',
    'rewardForRarity', 'schema', 'version',
  ]);
  assert.equal(vm.runInContext('Object.isFrozen(FlipgameV112Achievements)', context), true);
  assert.equal(vm.runInContext(`(function () {
    var descriptor = Object.getOwnPropertyDescriptor(globalThis, 'FlipgameV112Achievements');
    return !!descriptor && descriptor.writable === false && descriptor.configurable === false;
  })()`, context), true, 'the browser capability boundary cannot be replaced in place');

  const forbidden = [
    'evaluate', 'createEvaluator', 'AchievementEvaluationV1', 'rewardAuthority',
    'connectProductionRuntime', 'installRewardAuthority',
  ];
  forbidden.forEach((name) => {
    assert.equal(vm.runInContext(
      `Object.prototype.hasOwnProperty.call(FlipgameV112Achievements, ${JSON.stringify(name)})`,
      context), false, `browser achievement facade must not expose ${name}`);
    assert.equal(vm.runInContext(
      `typeof FlipgameV112Achievements[${JSON.stringify(name)}]`, context), 'undefined');
  });

  assert.equal(vm.runInContext(`(function () {
    'use strict';
    var fabricated = Object.freeze({
      schema: 'AchievementEvaluationV1', version: 1,
      earnedIds: [], context: Object.freeze({ storeAction: true, storePurchaseCount: 40 })
    });
    var publicResults = [
      FlipgameV112Achievements.lookupForMigration('store-all-cosmetics'),
      FlipgameV112Achievements.listViews(['store-all-cosmetics']),
      FlipgameV112Achievements.catalogSummary(),
      FlipgameV112Achievements.rewardForRarity('legendary')
    ];
    if (typeof FlipgameV112Achievements.evaluate === 'function') {
      publicResults.push(FlipgameV112Achievements.evaluate(fabricated));
    }
    return JSON.stringify(publicResults).indexOf('AchievementRewardEvidenceV1') === -1 &&
      JSON.stringify(publicResults).indexOf('rewardEvidence') === -1;
  })()`, context), true,
  'fabricated browser facts cannot obtain identity-bound reward evidence');

  assert.equal(vm.runInContext(`(function () {
    'use strict';
    try { FlipgameV112Achievements.evaluate = function () {}; return false; }
    catch (_) { return true; }
  })()`, context), true, 'the frozen facade rejects evaluator injection');
  assert.throws(() => run('v112-achievements.js'), /already defined/,
    'duplicate browser execution cannot silently replace the catalog boundary');

  const preseed = vm.createContext({ console,
    FlipgameV112Achievements: Object.freeze({ schema: 'AchievementCatalogV1', version: 1 }) });
  const runPreseed = (name) => vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8'), preseed, { filename: name });
  runPreseed('v111-interfaces.js');
  vm.runInContext('FlipgameV111Progression = { addAchievement: function () {} };', preseed);
  runPreseed('achievements.js');
  assert.throws(() => runPreseed('v112-achievements.js'), /already defined/,
    'a schema-only preseed is rejected rather than trusted or overwritten');

  const shimmedModule = vm.createContext({ console });
  const runShimmed = (name) => vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8'), shimmedModule,
    { filename: name });
  runShimmed('v111-interfaces.js');
  vm.runInContext('FlipgameV111Progression = { addAchievement: function () {} };', shimmedModule);
  runShimmed('achievements.js');
  shimmedModule.module = { exports: {} };
  shimmedModule.require = function () { throw new Error('browser shim require must not run'); };
  runShimmed('v112-achievements.js');
  assert.equal(Object.prototype.hasOwnProperty.call(
    shimmedModule.module.exports, 'createEvaluator'), false,
  'a browser module shim without a Node runtime cannot select the trusted export');
  assert.equal(vm.runInContext(
    'typeof FlipgameV112Achievements.createEvaluator', shimmedModule), 'undefined');
}

function testCommonJsRetainsTrustedEvaluatorBoundary() {
  assert.equal(Object.prototype.hasOwnProperty.call(
    globalThis, 'FlipgameV112Achievements'), false,
  'CommonJS loading must not publish the trusted evaluator on the global object');
  assert.equal(typeof Achievements.evaluate, 'function');
  assert.equal(typeof Achievements.createEvaluator, 'function');
  assert.equal(typeof Achievements.AchievementEvaluationV1, 'function');
  assert.equal(typeof Achievements.rewardAuthority.verify, 'function');
  const result = Achievements.evaluate(input({
    qualifying: true, humanParticipant: true, format: 'battle', won: true,
    battleFormatId: 'duel',
  }, ALL_IDS.filter((id) => id !== 'battle-duel-win')));
  assert.deepEqual(awardIds(result), ['battle-duel-win']);
  assert.deepEqual(Achievements.rewardAuthority.verify(result.awards[0].rewardEvidence), {
    id: 'battle-duel-win', rarity: Achievements.lookupForMigration('battle-duel-win').rarity,
  });
}

const tests = [
  testExactCatalogIdentityAndOrder,
  testEveryAuthoredRarityAndReward,
  testLockedViewsAreOpaque,
  testLegacyEvaluationIsWrappedWithoutMutation,
  testAllTwentyNewConditions,
  testEligibilityExclusionsAreFailClosed,
  testExactSchemaAndBounds,
  testEvidenceAuthorityAndProfileIntegration,
  testNoRngAndDeterministicOrdering,
  testBrowserReadOnlyCatalogBoundary,
  testCommonJsRetainsTrustedEvaluatorBoundary,
];

for (const test of tests) {
  test();
  console.log(`✓ ${test.name}`);
}
console.log(`v1.12 achievement tests passed (${tests.length} groups, 120 catalog entries)`);
