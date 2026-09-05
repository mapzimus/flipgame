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
  const hostileCategories = Array.from({ length: 200 }, (_, index) => flip(7000 + index, {
    objectId: `injected-object-${index}`, eventId: `injected-event-${index}`, mode: `mode-${index}`,
  }));
  const collapsed = Stats.aggregateRecords(hostileCategories, { prefix: 'retention' });
  assert.equal(collapsed.length, 1, 'unknown imported category values collapse into bounded other buckets');
  assert.deepEqual(collapsed[0].dimensions,
    { day: '2026-09-05', mode: 'other', objectId: 'other', eventId: 'other', testData: false });

  const operations = [];
  const memory = Stats.createMemoryBackend();
  const backend = {
    load: () => memory.load(), close: () => memory.close(),
    commit(operation) { operations.push(operation); return memory.commit(operation); },
  };
  const store = Stats.createStore({
    backend, maxRawFlips: 1, deviceId: 'device', sessionId: 'session',
  });
  for (let i = 0; i < 500; i++) await store.recordFlip(flip(1000 + i, {
    eventSeed: i, trajectorySeed: 500 - i, turn: i, flightMs: 500 + i,
    settleMs: 100 + i, livesAfter: i, stakeAfter: i, streakAfter: i,
  }));
  const stored = await store.query({ includeTestData: true });
  assert.equal(stored.flips.length, 1);
  assert.equal(stored.rollups.filter((row) => row.schema === 'FlipAggregateV1').length, 1,
    '500 unique seeds/timings/state values produce one bounded rollup cell');
  assert.deepEqual(Object.keys(stored.rollups[0].dimensions).sort(),
    ['day','eventId','mode','objectId','testData']);
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
  await store.close();
}

(async () => {
  testExactNameCorpus();
  testNamePolicyAtPersistenceBoundaries();
  testSaveBackupRoundTripChecksumMigrationAndNames();
  await testBoundedRetentionAndContractSummary();
  console.log('v111 data corrective tests passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
