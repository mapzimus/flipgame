#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const NamePolicy = require('../js/v111-name-policy.js');
const Stats = require('../js/v111-stats.js');
const Records = require('../js/records.js');
const SaveBackup = require('../js/v111-save-backup.js');

function uuid(n) { return `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`; }
function flip(n, extra = {}) {
  return Object.assign({
    schema: 'FlipRecordV1', version: 1, uuid: uuid(n), timestamp: Date.UTC(2026, 8, 5) + n,
    mode: 'classic', result: 'MAKE', made: true, pose: 'upright', testData: false,
    playerId: 'seat-0', displayName: 'Ada', seat: 0, playerIndex: 0, isAI: false,
    objectId: 'bottle', eventId: null, eventSuccess: null, flightMs: 900, settleMs: 250,
    streakBefore: 2, streakAfter: 3, onFireBefore: false, onFireAfter: true,
  }, extra);
}

function testExactNameCorpus() {
  const blocked = [
    'f.u.u.c.c.k', 'f\u200bu\u202ec\u2069k', 'n.і.g.g.е.r', 'nıgger', 'ѕ_h_і_t',
    'fυck', 'fսck', 'cυnt', 'F4GG0T', 'p.h.u.u.c.k',
  ];
  blocked.forEach((name) => assert.equal(NamePolicy.validate(name).valid, false, `${name} bypassed screening`));
  ['Cassidy', 'Classic', 'Assistant', 'Dickens', 'Penistone', 'Scunthorpe', 'Grape Soda', 'Saturday']
    .forEach((name) => assert.equal(NamePolicy.validate(name).valid, true, `${name} was a false positive`));
}

function testNamePolicyAtPersistenceBoundaries() {
  const normalized = Stats.normalizeFlipRecord(flip(1, {
    displayName: 'f.u.c.k', custom: { playerName: 'n1gg3r', nested: { name: '<script>' } },
  }), { deviceId: 'device', sessionId: 'session' });
  assert.equal(normalized.displayName, 'Player');
  assert.equal(normalized.custom.playerName, 'Player');
  assert.equal(normalized.custom.nested.name, '<script>', 'unrelated metadata named `name` remains lossless');
  assert.ok(!JSON.stringify(normalized).includes('f.u.c.k'));

  const storage = Records.createMemoryStorage({
    'flipgame.records.v2': JSON.stringify({
      winnerRecords: [{ playerId: 'p1', displayName: 'f.u.c.k', wins: 3 }], qualifyingWins: 3,
    }),
  });
  const records = Records.createStore({ storage });
  assert.equal(records.topWinnerRecord().displayName, 'Player');
  assert.ok(!storage.dump()['flipgame.records.v2'].includes('f.u.c.k'));
  records.recordWin({ qualifying: true, humanParticipant: true, playerId: 'p2', displayName: '<img src=x>' });
  assert.ok(!storage.dump()['flipgame.records.v2'].includes('<img'));
}

function testSaveBackupRoundTripChecksumMigrationAndNames() {
  const payload = {
    saveVersion: 2,
    settings: { lives: 50, nested: { future: ['kept', { flag: true }] } },
    object: { id: 'future-object', name: 'F.U.C.K', physicsName: 'Future Profile' },
    players: [{ id: 'p1', name: 'Zoë' }, { id: 'p2', displayName: 'f.u.u.c.c.k' }],
    records: { totalFlips: 123 }, progression: { qualifyingWins: 42 },
  };
  const serialized = SaveBackup.serialize(payload, { createdAt: 123, releaseVersion: 'v111' });
  const parsed = SaveBackup.parse(serialized);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.payload.players[0].name, 'Zoë');
  assert.equal(parsed.payload.players[1].displayName, '', 'blocked imported names require replacement');
  assert.deepEqual(parsed.payload.settings, payload.settings, 'unknown save data round-trips losslessly');
  assert.deepEqual(parsed.payload.object, payload.object,
    'non-player object/achievement/arena metadata named `name` remains lossless');

  const tampered = JSON.parse(serialized);
  tampered.payload.progression.qualifyingWins = 999;
  assert.equal(SaveBackup.validate(JSON.stringify(tampered)).valid, false, 'tampering is rejected by checksum');
  assert.throws(() => SaveBackup.parse(JSON.stringify(tampered)), /checksum/);

  const migrated = SaveBackup.parse(serialized, {
    adapters: [(save) => Object.assign({}, save, { migratedByTest: true })],
  });
  assert.equal(migrated.payload.migratedByTest, true);
  assert.equal(SaveBackup.extension, '.flipgame-save');
}

async function testBoundedRetentionAndContractSummary() {
  const operations = [];
  const memory = Stats.createMemoryBackend();
  const backend = {
    load: () => memory.load(), close: () => memory.close(),
    commit(operation) { operations.push(operation); return memory.commit(operation); },
  };
  const store = Stats.createStore({
    backend, maxRawFlips: 1, deviceId: 'device-filter', sessionId: 'session-filter',
  });
  for (let i = 0; i < 500; i++) await store.recordFlip(flip(1000 + i, {
    scope: 'device', sessionId: 'session-filter', deviceId: 'device-filter', mode: 'cup',
    playerId: 'player-filter', seat: 3, playerIndex: 3, isAI: true, teamId: 'blue',
    objectId: 'coffee-mug', variantId: 'coffee-mug.red', cosmeticId: 'chrome', arenaId: 'rooftop',
    eventId: 'heart-rush', playerCount: 8,
    viewport: { width: 1920, height: 1080, bucket: '1920x1080', orientation: 'landscape' },
    result: 'MAKE', made: true, online: true, testData: false,
    eventSeed: i, trajectorySeed: 500 - i, turn: i, flightMs: 500 + i,
    settleMs: 100 + i, livesBefore: i, livesAfter: i + 1,
    stakeBefore: i, stakeAfter: i, streakAfter: i,
  }));
  const stored = await store.query({ includeTestData: true });
  assert.equal(stored.flips.length, 1);
  assert.equal(stored.rollups.filter((row) => row.schema === 'FlipAggregateV1').length, 1,
    '500 unique seeds/timings/state values produce one bounded rollup cell');
  assert.deepEqual(Object.keys(stored.rollups[0].dimensions).sort(),
    ['arenaId','cosmeticId','day','deviceId','eventId','isAI','mode','objectId','online','playerCount',
      'playerId','result','scope','seat','sessionId','teamId','testData','variantId','viewportBucket']);
  assert.deepEqual(stored.rollups[0].dimensions, {
    day: '2026-09-05', scope: 'device', sessionId: 'session-filter', deviceId: 'device-filter',
    mode: 'cup', playerId: 'player-filter', seat: 3, isAI: true, teamId: 'blue',
    objectId: 'coffee-mug', variantId: 'coffee-mug.red', cosmeticId: 'chrome', arenaId: 'rooftop',
    eventId: 'heart-rush', playerCount: 8, viewportBucket: '1920x1080',
    result: 'MAKE', online: true, testData: false,
  });
  assert.equal(stored.rollups[0].timestampStart, Date.UTC(2026, 8, 5));
  assert.equal(stored.rollups[0].timestampEnd, Date.UTC(2026, 8, 5, 23, 59, 59, 999));
  const forbidden = [
    'displayName', 'uuid', 'matchId', 'sequence', 'heat', 'round', 'turn', 'playerIndex',
    'eventSeed', 'trajectorySeed', 'timestamp', 'flightMs', 'firstContactMs', 'settleMs',
    'livesBefore', 'livesAfter', 'stakeBefore', 'stakeAfter', 'power', 'direction',
    'rotations', 'contacts', 'bounces', 'banks', 'oddsProfile', 'appliedReward', 'appliedEffect',
  ];
  const rollupKeyText = JSON.stringify(stored.rollups[0].dimensions) + stored.rollups[0].key;
  forbidden.forEach((field) => assert.ok(!rollupKeyText.includes(field), `${field} leaked into a rollup key`));
  assert.ok(Object.keys(stored.rollups[0].counters.lives).length <= 10 &&
    Object.keys(stored.rollups[0].counters.stakes).length <= 10 &&
    Object.keys(stored.rollups[0].counters.streaks).length <= 9,
  'mutable values are retained only in fixed buckets and cannot grow counters without bound');
  const summary = await store.summary({ includeTestData: true });
  assert.equal(summary.flips, 500);
  assert.equal(summary.upright, 500);
  assert.equal(summary.onFireRuns, 500);
  assert.equal(summary.bestStreak, 499);
  assert.equal(summary.sampleSize, 500);
  assert.equal(summary.fraction, '500/500');
  assert.ok(summary.averageFlightMs > 500 && summary.averageSettleMs > 100);
  assert.ok(operations.every((operation) => (operation.putRollups || []).length <= 1),
    'each prune writes only its changed bounded rollup rather than rewriting the aggregate store');

  const matchingFilters = [
    { scope: 'device' }, { scope: 'session' },
    { sessionId: 'session-filter' }, { deviceId: 'device-filter' },
    { mode: 'cup' }, { playerId: 'player-filter' }, { seat: 3 },
    { isAI: true }, { playerType: 'cpu' }, { teamId: 'blue' },
    { objectId: 'coffee-mug' }, { variantId: 'coffee-mug.red' }, { cosmeticId: 'chrome' },
    { arenaId: 'rooftop' }, { eventId: 'heart-rush' }, { playerCount: 8 },
    { viewportBucket: '1920x1080' }, { viewport: { width: 1920, height: 1080 } },
    { result: 'MAKE' }, { online: true },
    { dateFrom: '2026-09-05T00:00:00.000Z', dateTo: '2026-09-05T23:59:59.999Z' },
    { scope: 'session', playerId: 'player-filter', seat: 3, isAI: true, teamId: 'blue',
      mode: 'cup', objectId: 'coffee-mug', variantId: 'coffee-mug.red', cosmeticId: 'chrome',
      arenaId: 'rooftop', eventId: 'heart-rush', playerCount: 8,
      viewportBucket: '1920x1080', result: 'MAKE', online: true },
  ];
  for (const filter of matchingFilters) {
    assert.equal((await store.summary(filter)).flips, 500,
      `rollup lost matching filter ${JSON.stringify(filter)}`);
  }
  const combinedFilter = matchingFilters.at(-1);
  const combinedQuery = await store.query(combinedFilter);
  assert.equal(combinedQuery.flips.length + combinedQuery.rollups.reduce((sum, row) => sum + row.flips, 0), 500,
    'query retains raw and rolled history for a representative filter combination');
  const combinedDatasets = await store.datasets(combinedFilter);
  assert.equal(combinedDatasets.cumulativeMakeRate.at(-1).flips, 500,
    'Stats Lab datasets retain rolled history for a representative filter combination');
  const nonmatchingFilters = [
    { scope: 'import' }, { sessionId: 'other-session' }, { deviceId: 'other-device' },
    { mode: 'classic' }, { playerId: 'other-player' }, { seat: 2 },
    { isAI: false }, { playerType: 'human' }, { teamId: 'red' },
    { objectId: 'bottle' }, { variantId: 'coffee-mug.blue' }, { cosmeticId: 'neon' },
    { arenaId: 'moon-deck' }, { eventId: 'plinko' }, { playerCount: 7 },
    { viewportBucket: '1280x720' }, { result: 'MISS' }, { online: false },
    { dateFrom: '2026-09-06T00:00:00.000Z', dateTo: '2026-09-06T23:59:59.999Z' },
  ];
  for (const filter of nonmatchingFilters) {
    assert.equal((await store.summary(filter)).flips, 0,
      `rollup guessed a nonmatching filter ${JSON.stringify(filter)}`);
  }
  assert.equal((await store.summary({ online: 'false' })).flips, 500,
    'a string online filter is ignored rather than coerced to a boolean');
  assert.equal((await store.summary({ isAI: 'false' })).flips, 500,
    'a string CPU filter is ignored rather than coerced to a boolean');
  await store.close();
}

async function testBoundedImportedIdsAndLegacyUnknownDimensions() {
  const oversized = 'x'.repeat(300);
  const importedStore = Stats.createStore({ backend: Stats.createMemoryBackend(), maxRawFlips: 1,
    deviceId: 'destination-device', sessionId: 'destination-session' });
  const importedFlips = Array.from({ length: 200 }, (_, index) => flip(8000 + index, {
    sessionId: `${oversized}${index}`, deviceId: `${oversized}${index}`,
    mode: `${oversized}${index}`, playerId: `${oversized}${index}`, teamId: `${oversized}${index}`,
    objectId: `${oversized}${index}`, variantId: `${oversized}${index}`,
    cosmeticId: `${oversized}${index}`, arenaId: `${oversized}${index}`, eventId: `${oversized}${index}`,
    viewport: { width: 1920, height: 1080, bucket: `${oversized}${index}` },
    seat: 0, isAI: false, playerCount: 8, online: false, result: 'MAKE', testData: false,
  }));
  const importResult = await importedStore.importJSON(JSON.stringify({
    schema: 'FlipStatsExportV1', version: 1, exportedAt: 1,
    flips: importedFlips, matches: [], rollups: [],
  }));
  assert.equal(importResult.imported, true);
  const imported = await importedStore.query({ scope: 'import', includeTestData: true });
  assert.equal(imported.flips.length, 1);
  assert.equal(imported.rollups.length, 1,
    'oversized distinct imported IDs collapse into one bounded rollup cell');
  const dimensions = imported.rollups[0].dimensions;
  ['sessionId','deviceId','mode','playerId','teamId','objectId','variantId','cosmeticId','arenaId',
    'eventId','viewportBucket'].forEach((field) => assert.equal(dimensions[field], 'other',
      `${field} did not collapse to a bounded bucket`));
  assert.ok(imported.rollups[0].key.length < 1000 && !imported.rollups[0].key.includes(oversized),
    'malicious imported categorical IDs cannot inflate stored keys');
  await importedStore.close();

  const legacy = {
    schema: 'FlipAggregateV1', version: 2, uuid: uuid(9000), key: 'legacy-narrow', source: 'retention',
    timestampStart: Date.UTC(2026, 8, 5), timestampEnd: Date.UTC(2026, 8, 5, 23, 59, 59, 999),
    dimensions: { day: '2026-09-05', mode: 'classic', objectId: 'bottle', eventId: null, testData: false },
    flips: 12, makes: 6, caps: 0, perfect: 0, eventObserved: 0, eventSuccesses: 0,
    counters: {}, makeCounters: {},
  };
  const retained = Stats.aggregateRecords([], { prefix: 'retention', existing: [legacy] });
  assert.equal(retained.length, 1);
  assert.deepEqual(retained[0], legacy,
    'legacy narrow cells remain immutable instead of receiving invented dimensions');
  assert.equal(retained[0].dimensions.testData, false,
    'known legacy non-test cells remain available to the default view');
  assert.equal(Stats.aggregateSummary({ flips: [], matches: [], rollups: retained }).flips, 12);
  assert.equal(Stats.aggregateSummary({ flips: [], matches: [], rollups: retained }, { mode: 'classic' }).flips, 12);
  for (const filter of [{ online: false }, { isAI: false }, { playerType: 'human' },
    { playerId: 'seat-0' }, { seat: 0 }, { viewportBucket: '1920x1080' }]) {
    assert.equal(Stats.aggregateSummary({ flips: [], matches: [], rollups: retained }, filter).flips, 0,
      `legacy rollup guessed missing dimension for ${JSON.stringify(filter)}`);
  }
  const legacyOperations = [];
  const legacyMemory = Stats.createMemoryBackend({ rollups: [legacy],
    meta: [{ key: 'legacy-migrated', value: true }] });
  const legacyStore = Stats.createStore({
    backend: {
      load: () => legacyMemory.load(), close: () => legacyMemory.close(),
      commit(operation) { legacyOperations.push(operation); return legacyMemory.commit(operation); },
    },
    maxRawFlips: 1, deviceId: 'legacy-device', sessionId: 'legacy-session',
  });
  await legacyStore.recordFlip(flip(9200));
  await legacyStore.recordFlip(flip(9201));
  assert.ok(legacyOperations.every((operation) => (operation.putRollups || []).length <= 1),
    'a prune beside a legacy cell still writes only the newly changed v3 cell');
  assert.equal((await legacyStore.summary({ includeTestData: true })).flips, 14,
    'legacy totals and new v3 totals remain additive without duplication');
  await legacyStore.close();

  const testCell = Stats.aggregateRecords([flip(9100, {
    sessionId: 'test-session', deviceId: 'test-device', playerId: 'tester', seat: 0,
    isAI: false, teamId: 'solo', variantId: 'bottle.blue', cosmeticId: 'chrome', arenaId: 'rooftop',
    playerCount: 2, viewport: { bucket: '1280x720' }, online: false, testData: true,
  })], { prefix: 'retention' });
  assert.equal(Stats.aggregateSummary({ flips: [], matches: [], rollups: testCell }).flips, 0);
  assert.equal(Stats.aggregateSummary({ flips: [], matches: [], rollups: testCell },
    { includeTestData: true }).flips, 1);
}

(async () => {
  testExactNameCorpus();
  testNamePolicyAtPersistenceBoundaries();
  testSaveBackupRoundTripChecksumMigrationAndNames();
  await testBoundedRetentionAndContractSummary();
  await testBoundedImportedIdsAndLegacyUnknownDimensions();
  console.log('v111 data corrective tests passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
