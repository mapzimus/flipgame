#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const Achievements = require('../js/achievements.js');
const Interfaces = require('../js/v111-interfaces.js');

const EXISTING_IDS = [
  'first_flip', 'first_make', 'ignition', 'inferno', 'supernova', 'streak_master',
  'high_roller', 'table_setter', 'bullseye', 'full_send', 'feather_touch',
  'great_save', 'cap_land', 'mothership', 'smooth_operator', 'deadeye',
  'last_one_standing', 'dynasty', 'empire', 'iron_will', 'clean_sweep',
  'sudden_survivor', 'comeback_kid', 'party_animal', 'full_house',
  'century_club', 'millennial', 'hot_hands', 'ghost_protocol', 'close_encounter',
];

const NEW_IDS = {
  events: Interfaces.EVENT_IDS.map((id) => `event-${id}`),
  classic: [
    'classic-opening-make', 'classic-edge-landing', 'classic-two-rotation-make',
    'classic-one-life-make', 'classic-sudden-death-cap', 'classic-stake-20-make',
    'classic-perfect-pair', 'classic-three-caps', 'classic-on-fire-cap',
    'classic-twenty-make-streak',
  ],
  cup: [
    'cup-first-win', 'cup-sweep-2-0', 'cup-reverse-sweep', 'cup-short-win',
    'cup-full-win', 'cup-eight-player', 'cup-all-starters', 'cup-three-lifetime',
  ],
  team: [
    'team-first-win', 'team-two-player-win', 'team-eight-player-win',
    'team-five-point-cancellation', 'team-five-point-comeback',
    'team-every-teammate-scored', 'team-match-point-cancellation',
    'team-every-teammate-made-round',
  ],
  collection: [
    'collection-use-5-objects', 'collection-use-15-objects',
    'collection-use-30-objects', 'collection-use-all-objects',
    'collection-equip-5-cosmetics', 'collection-equip-25-cosmetics',
    'collection-equip-all-cosmetics', 'collection-play-all-arenas',
  ],
  'lab-stats': [
    'stats-advanced-lab', 'stats-improved-seed',
    'stats-hundred-perfect-landings', 'stats-fifty-cap-landings',
    'stats-hundred-matches', 'stats-five-thousand-flips',
  ],
};

function store(seed) {
  return Achievements.createStore({
    storage: Achievements.createMemoryStorage(seed),
    progression: null,
    now: () => '2031-04-05T06:07:08.000Z',
  });
}

function human(extra = {}) {
  return { qualifying: true, humanParticipant: true, ...extra };
}

function ids(results, category) {
  return results.filter((entry) => !category || entry.category === category).map((entry) => entry.id);
}

function assertUnlocks(target, context, id, category) {
  const fresh = target.check(context);
  assert.ok(ids(fresh, category).includes(id), `${id} was not reached by its documented context`);
}

function testExactCountsAndLegacyMigration() {
  assert.deepEqual(Achievements.catalogSummary(), {
    total: 100,
    categoryCounts: {
      existing: 30, events: 30, classic: 10, cup: 8, team: 8,
      collection: 8, 'lab-stats': 6,
    },
  });
  const migrated = store({ 'flipgame.achievements.v1': JSON.stringify(EXISTING_IDS) });
  assert.equal(migrated.unlockedCount(), 30);
  assert.deepEqual(migrated.earned().map((entry) => entry.id), EXISTING_IDS);
  assert.deepEqual(migrated.exportState().earned.map((entry) => entry.id), EXISTING_IDS);
}

function testEveryEventAchievement() {
  const target = store();
  Interfaces.EVENT_IDS.forEach((eventId) => {
    assert.deepEqual(ids(target.check(human({ eventId, eventResolved: false })), 'events'), []);
    assertUnlocks(target, human({ eventId, eventResolved: true }), `event-${eventId}`, 'events');
  });
  assert.deepEqual(target.earned().filter((entry) => entry.category === 'events').map((entry) => entry.id), NEW_IDS.events);
}

function testEveryClassicAchievement() {
  const target = store();
  const cases = [
    ['classic-opening-make', { result: 'MAKE', openingFlip: true }],
    ['classic-edge-landing', { result: 'MAKE', edgeLanding: true }],
    ['classic-two-rotation-make', { result: 'MAKE', rotations: 2.01 }],
    ['classic-one-life-make', { result: 'MAKE', livesBefore: 1 }],
    ['classic-sudden-death-cap', { result: 'MAKE', suddenDeathBefore: true, capLand: true }],
    ['classic-stake-20-make', { result: 'MAKE', stakeBefore: 20 }],
    ['classic-perfect-pair', { perfectPair: true }],
    ['classic-three-caps', { capMakesThisMatch: 3 }],
    ['classic-on-fire-cap', { reachedOnFireCap: true }],
    ['classic-twenty-make-streak', { streak: 20 }],
  ];
  cases.forEach(([id, context]) => assertUnlocks(target, human({ format: 'classic', ...context }), id, 'classic'));
  assert.deepEqual(target.earned().filter((entry) => entry.category === 'classic').map((entry) => entry.id), NEW_IDS.classic);

  const ordinary = store();
  assert.deepEqual(ids(ordinary.check(human({ format: 'classic', result: 'MAKE', rotations: 2, eventId: 'magnet' })), 'classic'), []);
}

function testEveryCupAchievement() {
  const target = store();
  const cases = [
    ['cup-first-win', { won: true }],
    ['cup-sweep-2-0', { won: true, loserHeatWins: 0 }],
    ['cup-reverse-sweep', { won: true, lostFirstHeat: true }],
    ['cup-short-win', { won: true, cupLength: 'short' }],
    ['cup-full-win', { won: true, cupLength: 'full' }],
    ['cup-eight-player', { won: true, playerCount: 8 }],
    ['cup-all-starters', { allCupStarterPositionsCovered: true }],
    ['cup-three-lifetime', { lifetimeCupWins: 3 }],
  ];
  cases.forEach(([id, context]) => assertUnlocks(target, human({ format: 'cup', ...context }), id, 'cup'));
  assert.deepEqual(target.earned().filter((entry) => entry.category === 'cup').map((entry) => entry.id), NEW_IDS.cup);
}

function testEveryTeamAchievement() {
  const target = store();
  const cases = [
    ['team-first-win', { won: true }],
    ['team-two-player-win', { won: true, playerCount: 2 }],
    ['team-eight-player-win', { won: true, playerCount: 8 }],
    ['team-five-point-cancellation', { cancellationPoints: 5 }],
    ['team-five-point-comeback', { won: true, largestDeficit: 5 }],
    ['team-every-teammate-scored', { everyTeammateScored: true }],
    ['team-match-point-cancellation', { matchPointCancellation: true }],
    ['team-every-teammate-made-round', { everyTeammateMadeInRound: true }],
  ];
  cases.forEach(([id, context]) => assertUnlocks(target, human({ format: 'team', ...context }), id, 'team'));
  assert.deepEqual(target.earned().filter((entry) => entry.category === 'team').map((entry) => entry.id), NEW_IDS.team);
}

function testEveryCollectionAchievement() {
  const target = store();
  const cases = [
    ['collection-use-5-objects', { distinctObjectsUsed: 5 }],
    ['collection-use-15-objects', { distinctObjectsUsed: 15 }],
    ['collection-use-30-objects', { distinctObjectsUsed: 30 }],
    ['collection-use-all-objects', { distinctObjectsUsed: 51 }],
    ['collection-equip-5-cosmetics', { distinctCosmeticsEquipped: 5 }],
    ['collection-equip-25-cosmetics', { distinctCosmeticsEquipped: 25 }],
    ['collection-equip-all-cosmetics', { distinctCosmeticsEquipped: 50 }],
    ['collection-play-all-arenas', { distinctArenasPlayed: 10 }],
  ];
  cases.forEach(([id, context]) => assertUnlocks(target, human(context), id, 'collection'));
  assert.deepEqual(target.earned().filter((entry) => entry.category === 'collection').map((entry) => entry.id), NEW_IDS.collection);
}

function testEveryLabAndStatsAchievement() {
  const target = store();
  const labBase = { mode: 'physics-lab', physicsLab: true, qualifyingLabAction: true, humanParticipant: true };
  assertUnlocks(target, { ...labBase, advancedLabUsed: true }, 'stats-advanced-lab', 'lab-stats');
  assertUnlocks(target, { ...labBase, replayedSeedImproved: true }, 'stats-improved-seed', 'lab-stats');
  const cases = [
    ['stats-hundred-perfect-landings', { perfectLandingsLifetime: 100 }],
    ['stats-fifty-cap-landings', { capLandingsLifetime: 50 }],
    ['stats-hundred-matches', { matchesLifetime: 100 }],
    ['stats-five-thousand-flips', { totalFlipsLifetime: 5000 }],
  ];
  cases.forEach(([id, context]) => assertUnlocks(target, human(context), id, 'lab-stats'));
  assert.deepEqual(target.earned().filter((entry) => entry.category === 'lab-stats').map((entry) => entry.id), NEW_IDS['lab-stats']);
}

function testEligibilityBoundaries() {
  for (const blocked of [
    human({ eventId: 'plinko', practice: true }),
    human({ eventId: 'plinko', forced: true }),
    human({ eventId: 'plinko', testData: true }),
    human({ eventId: 'plinko', simulated: true }),
    human({ eventId: 'plinko', aiOnly: true }),
  ]) assert.deepEqual(store().check(blocked), []);

  const labAttempts = [
    { mode: 'physics-lab', physicsLab: true, qualifyingLabAction: true, advancedLabUsed: true },
    { mode: 'physics-lab', physicsLab: true, humanParticipant: true, advancedLabUsed: true },
    { mode: 'physics-lab', physicsLab: true, qualifyingLabAction: true, humanParticipant: true, test: true, advancedLabUsed: true },
  ];
  labAttempts.forEach((context) => assert.deepEqual(store().check(context), []));
  assert.equal(store().check({ mode: 'physics-lab', physicsLab: true, qualifyingLabAction: true,
    humanParticipant: true, advancedLabUsed: true })[0].id, 'stats-advanced-lab');
  assert.deepEqual(store().check({ mode: 'physics-lab', physicsLab: true, qualifyingLabAction: true,
    humanParticipant: true, perfectLandingsLifetime: 100 }), []);
}

function testLockSecrecyAndNoRng() {
  const target = store();
  target.list().forEach((view) => {
    assert.deepEqual(view, { locked: true, symbol: '🔒', ariaLabel: 'Locked' });
    assert.deepEqual(Object.keys(view).sort(), ['ariaLabel', 'locked', 'symbol']);
  });
  const html = target.renderGridHtml();
  assert.equal((html.match(/aria-label="Locked"/g) || []).length, 1);
  assert.ok(!html.includes('/100'));
  for (const hidden of ['Opening Statement', 'Plinko', 'Advanced Lab', 'Twenty Straight']) {
    assert.ok(!html.includes(hidden), `locked HTML leaked ${hidden}`);
  }

  const originalRandom = Math.random;
  Math.random = () => { throw new Error('achievement checks must not call RNG'); };
  try {
    assert.doesNotThrow(() => target.check(human({ format: 'classic', result: 'MAKE', openingFlip: true })));
  } finally {
    Math.random = originalRandom;
  }
}

const tests = [
  testExactCountsAndLegacyMigration,
  testEveryEventAchievement,
  testEveryClassicAchievement,
  testEveryCupAchievement,
  testEveryTeamAchievement,
  testEveryCollectionAchievement,
  testEveryLabAndStatsAchievement,
  testEligibilityBoundaries,
  testLockSecrecyAndNoRng,
];

for (const test of tests) {
  test();
  console.log(`✓ ${test.name}`);
}
console.log(`v111 achievement tests passed (${tests.length} groups)`);
