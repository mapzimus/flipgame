#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Stats = require('../js/v111-stats.js');
const NamePolicy = require('../js/v111-name-policy.js');
const SaveBackup = require('../js/v111-save-backup.js');

const root = path.resolve(__dirname, '..');
function uuid(prefix, n) {
  return `${prefix.padEnd(8, '0').slice(0, 8)}-0000-4000-8000-${String(n).padStart(12, '0')}`;
}
function flip(n, extra = {}) {
  return Object.assign({
    schema: 'FlipRecordV1', version: 1, uuid: uuid('feed', n),
    timestamp: Date.UTC(2026, 8, 5) + n, sessionId: 'source-session', deviceId: 'source-device',
    scope: 'device', mode: 'classic', result: 'MAKE', made: true, pose: 'upright',
    playerCount: 2, online: false, testData: false, playerId: 'p1', displayName: 'Ada',
    seat: 0, playerIndex: 0, isAI: false, teamId: 'red', objectId: 'bottle',
    variantId: 'bottle.blue-steel', cosmeticId: 'sparkles', arenaId: 'rooftop',
    eventId: null, flightMs: 1100, firstContactMs: 800, settleMs: 300,
    viewport: { bucket: '1280x720', width: 1280, height: 720 },
  }, extra);
}
function match(n, extra = {}) {
  return Object.assign({
    schema: 'MatchRecordV1', version: 1, uuid: uuid('face', n),
    timestamp: Date.UTC(2026, 8, 5) + n, sessionId: 'fallback-session', deviceId: 'fallback-device',
    scope: 'device', mode: 'cup', online: true, testData: false, arenaId: 'rooftop', playerCount: 2,
    viewport: { bucket: '1280x720', width: 1280, height: 720 },
    participants: [
      { playerId: 'p1', displayName: 'Ada', seat: 0, playerIndex: 0, isAI: false, teamId: 'red',
        objectId: 'bottle', variantId: 'bottle.blue-steel', cosmeticId: 'sparkles' },
      { playerId: 'p2', displayName: 'CPU', seat: 1, playerIndex: 1, isAI: true, teamId: 'blue',
        objectId: 'coffee-mug', variantId: 'coffee-mug.red', cosmeticId: 'chrome' },
    ],
    cup: { heats: [2, 0] }, winnerId: 'p1', winnerIds: ['p1'], completed: true,
  }, extra);
}
function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    dump: () => Object.fromEntries(values),
  };
}

async function testSnapshotLineageReplacementAndAtomicity() {
  const source = Stats.createStore({ backend: Stats.createMemoryBackend(), maxRawFlips: 1,
    deviceId: 'source-device', sessionId: 'source-session' });
  await source.recordFlip(flip(1));
  await source.recordFlip(flip(2));
  const snapshot2 = await source.exportJSON({ exportedAt: 2, includeTestData: true });
  for (let n = 3; n <= 100; n++) await source.recordFlip(flip(n));
  const snapshot100 = await source.exportJSON({ exportedAt: 100, includeTestData: true });
  const two = JSON.parse(snapshot2);
  const hundred = JSON.parse(snapshot100);
  assert.equal(two.sourceArchiveId, hundred.sourceArchiveId, 'one source has a stable archive lineage');
  assert.equal(two.snapshotSequence, 2);
  assert.equal(hundred.snapshotSequence, 100);
  assert.equal(two.rollups.reduce((sum, row) => sum + row.flips, 0) + two.flips.length, 2);
  assert.equal(hundred.rollups.reduce((sum, row) => sum + row.flips, 0) + hundred.flips.length, 100,
    'raw-to-rollup transition appears once in a snapshot');

  const backend = Stats.createMemoryBackend();
  const destination = Stats.createStore({ backend, maxRawFlips: 1,
    deviceId: 'destination', sessionId: 'destination' });
  assert.equal((await destination.importJSON(snapshot2)).imported, true);
  assert.equal((await destination.summary({ includeTestData: true })).flips, 2);
  assert.equal((await destination.importJSON(snapshot100)).imported, true);
  assert.equal((await destination.summary({ includeTestData: true })).flips, 100,
    'new snapshot supersedes the complete older contribution');
  const repeat = await destination.importJSON(snapshot100);
  assert.equal(repeat.duplicate, true);
  assert.equal((await destination.summary({ includeTestData: true })).flips, 100);
  const older = await destination.importJSON(snapshot2);
  assert.equal(older.duplicate, true);
  assert.equal((await destination.summary({ includeTestData: true })).flips, 100);

  const other = Stats.createStore({ backend: Stats.createMemoryBackend(), deviceId: 'other-source',
    sessionId: 'other-session' });
  for (let n = 1001; n <= 1003; n++) await other.recordFlip(flip(n, {
    uuid: uuid('beef', n), deviceId: 'other-source', sessionId: 'other-session', playerId: 'p2',
  }));
  const otherSnapshot = await other.exportJSON({ exportedAt: 101, includeTestData: true });
  await destination.importJSON(otherSnapshot);
  assert.equal((await destination.summary({ includeTestData: true })).flips, 103,
    'independent source archives remain additive');
  await source.close(); await other.close(); await destination.close();

  const durable = Stats.createMemoryBackend();
  let fail = false;
  const failingBackend = {
    load: () => durable.load(), close: () => {},
    commit(operation) { return fail ? Promise.reject(new Error('injected snapshot failure')) : durable.commit(operation); },
  };
  const atomic = Stats.createStore({ backend: failingBackend, maxRawFlips: 1,
    deviceId: 'atomic-destination', sessionId: 'atomic-1' });
  await atomic.importJSON(snapshot2);
  assert.equal((await atomic.summary({ includeTestData: true })).flips, 2);
  fail = true;
  const failed = await atomic.importJSON(snapshot100);
  assert.equal(failed.imported, false);
  assert.equal((await atomic.summary({ includeTestData: true })).flips, 2,
    'failed replacement leaves the in-memory snapshot untouched');
  await atomic.close();
  fail = false;
  const reopened = Stats.createStore({ backend: failingBackend, maxRawFlips: 1,
    deviceId: 'atomic-destination', sessionId: 'atomic-2' });
  assert.equal((await reopened.summary({ includeTestData: true })).flips, 2,
    'failed replacement leaves the durable snapshot untouched');
  await reopened.close();

  const legacy = JSON.parse(snapshot2);
  delete legacy.sourceArchiveId; delete legacy.snapshotSequence; delete legacy.snapshotId; delete legacy.dictionaries;
  const legacyDestination = Stats.createStore({ backend: Stats.createMemoryBackend(),
    deviceId: 'legacy-destination', sessionId: 'legacy-destination' });
  await legacyDestination.importJSON(JSON.stringify(legacy));
  await legacyDestination.importJSON(JSON.stringify(legacy));
  assert.equal((await legacyDestination.summary({ includeTestData: true })).flips, 2,
    'version-1 exports without lineage metadata retain UUID deduplication compatibility');
  await legacyDestination.close();

  const fallbackStorage = memoryStorage();
  const fallback = Stats.createStore({ indexedDB: null, localStorage: fallbackStorage, maxRawFlips: 1,
    deviceId: 'fallback-import', sessionId: 'fallback-import-1' });
  await fallback.importJSON(snapshot2);
  await fallback.importJSON(snapshot100);
  assert.equal((await fallback.summary({ includeTestData: true })).flips, 100);
  await fallback.close();
  const fallbackReopen = Stats.createStore({ indexedDB: null, localStorage: fallbackStorage, maxRawFlips: 1,
    deviceId: 'fallback-import', sessionId: 'fallback-import-2' });
  assert.equal((await fallbackReopen.summary({ includeTestData: true })).flips, 100,
    'lineage replacement survives aggregate-only fallback reload');
  await fallbackReopen.close();
}

function testSaveRowsAndUnicodeSafety() {
  const payload = {
    schema: 'FlipgameLocalSaveV1', version: 1,
    storage: { 'flipgame.setup.v2': { rows: [
      { id: 'seat-1', name: 'fu\u03f2k' }, { id: 'seat-2', name: 'Zoë' },
    ] } },
    object: { name: 'fu\u03f2k' },
  };
  const serialized = SaveBackup.serialize(payload, { createdAt: 1 });
  assert.equal(JSON.parse(serialized).payload.storage['flipgame.setup.v2'].rows[0].name, '',
    'blocked setup rows are blank before backup persistence');
  const parsed = SaveBackup.parse(serialized);
  assert.equal(parsed.payload.storage['flipgame.setup.v2'].rows[0].name, '');
  assert.equal(parsed.payload.storage['flipgame.setup.v2'].rows[1].name, 'Zoë');
  assert.equal(parsed.payload.object.name, 'fu\u03f2k', 'non-player metadata remains lossless');

  ['fu\u03f2k', 'f\u13ccck', '\u0455\u04bb\u0456t', 'f\u03c5\u03f2k', 'f\u1d1cc\u1d0b']
    .forEach((probe) => assert.equal(NamePolicy.validate(probe).valid, false, `${probe} bypassed screening`));
  ['Zoë', 'André', 'Cassidy', 'Classic', 'Scunthorpe', 'Grape Soda', 'Saturday']
    .forEach((name) => assert.equal(NamePolicy.validate(name).valid, true, `${name} became a false positive`));
  ['Mr. Howe', ...NamePolicy.EVENT_QA_NAMES]
    .forEach((name) => assert.equal(NamePolicy.validate(name).valid, true, `${name} lost QA allowlist status`));

  const mainSource = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
  const applyStart = mainSource.indexOf('function applyGameSavePayload');
  const firstWrite = mainSource.indexOf('localStorage.setItem', applyStart);
  const sanitation = mainSource.indexOf('FlipgameV111SaveBackup?.sanitizeNames', applyStart);
  assert.ok(applyStart >= 0 && sanitation > applyStart && sanitation < firstWrite,
    'save apply boundary sanitizes setup rows before the first local-storage write');
}

async function testFullFlightTiming() {
  const record = Stats.normalizeFlipRecord(flip(9001, {
    flightMs: 800, firstContactMs: 800, settleMs: 300,
  }), { deviceId: 'timing-device', sessionId: 'timing-session' });
  assert.deepEqual([record.flightMs, record.firstContactMs, record.settleMs], [1100, 800, 300]);
  const summary = Stats.aggregateSummary({ flips: [record], matches: [], rollups: [] }, { includeTestData: true });
  assert.equal(summary.averageFlightMs, 1100, 'summary averages consume the full flight');
  const zero = Stats.normalizeFlipRecord(flip(9002, {
    flightMs: -1, firstContactMs: -2, settleMs: -3,
  }), { deviceId: 'timing-device', sessionId: 'timing-session' });
  assert.deepEqual([zero.flightMs, zero.firstContactMs, zero.settleMs], [0, 0, 0]);
  const timeout = Stats.normalizeFlipRecord(flip(9003, {
    flightMs: 2500, firstContactMs: null, settleMs: null, landingReason: 'timeout', result: 'MISS', made: false,
  }), { deviceId: 'timing-device', sessionId: 'timing-session' });
  assert.equal(timeout.flightMs, 2500);
  const mainSource = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
  assert.match(mainSource, /Number\(firstContactMs\) \+ Number\(settleMs\)/,
    'live outcome adapter composes contact and settling intervals');
}

async function testFallbackMatchFiltersAcrossReopen() {
  const storage = memoryStorage();
  const first = Stats.createStore({ indexedDB: null, localStorage: storage,
    deviceId: 'fallback-device', sessionId: 'fallback-session' });
  await first.recordMatch(match(1));
  const combined = { scope: 'device', mode: 'cup', online: true, playerId: 'p1', seat: 0,
    isAI: false, teamId: 'red', objectId: 'bottle', variantId: 'bottle.blue-steel',
    cosmeticId: 'sparkles', arenaId: 'rooftop', playerCount: 2, viewportBucket: '1280x720' };
  assert.equal((await first.summary(combined)).matches, 1);
  await first.close();

  const second = Stats.createStore({ indexedDB: null, localStorage: storage,
    deviceId: 'fallback-device', sessionId: 'fallback-next' });
  const matching = [
    { scope: 'device' }, { scope: 'all' }, { mode: 'cup' }, { online: true }, { playerId: 'p1' },
    { seat: 0 }, { isAI: false }, { playerType: 'human' }, { teamId: 'red' }, { objectId: 'bottle' },
    { variantId: 'bottle.blue-steel' }, { cosmeticId: 'sparkles' }, { arenaId: 'rooftop' },
    { playerCount: 2 }, { viewportBucket: '1280x720' }, combined,
  ];
  for (const filter of matching) assert.equal((await second.summary(filter)).matches, 1,
    `fallback match lost ${JSON.stringify(filter)}`);
  const misses = [{ mode: 'classic' }, { online: false }, { playerId: 'missing' }, { seat: 7 },
    { teamId: 'green' }, { objectId: 'teapot' },
    { variantId: 'bottle.pink-fluff' }, { cosmeticId: 'neon' }, { arenaId: 'garden' },
    { playerCount: 8 }, { viewportBucket: '3840x2160' }, { scope: 'session' }];
  for (const filter of misses) assert.equal((await second.summary(filter)).matches, 0,
    `fallback match guessed ${JSON.stringify(filter)}`);
  assert.equal((await second.summary({ scope: 'device' })).cups, 1);
  await second.close();
}

async function testCardinalityBoundedRollups() {
  const operations = [];
  const memory = Stats.createMemoryBackend();
  const store = Stats.createStore({ backend: {
    load: () => memory.load(), close: () => memory.close(),
    commit(operation) { operations.push(operation); return memory.commit(operation); },
  }, maxRawFlips: 1, deviceId: 'bounded-device', sessionId: 'bounded-session' });
  for (let n = 1; n <= 500; n++) await store.recordFlip(flip(10000 + n, {
    uuid: uuid('cafe', n), sessionId: `s${n}`, deviceId: `d${n}`, playerId: `p${n}`, teamId: `t${n}`,
    objectId: `object${n}`, variantId: `variant${n}`, cosmeticId: `cosmetic${n}`,
    arenaId: `arena${n}`, eventId: `event${n}`, viewport: { bucket: `view${n}` },
  }));
  let data = await store.query({ includeTestData: true });
  assert.ok(data.rollups.length <= 64, `hostile tuples created ${data.rollups.length} cells`);
  assert.equal((await store.summary({ includeTestData: true })).flips, 500);
  assert.ok(operations.every((operation) => (operation.putRollups || []).length <= 64),
    'bounded pruning never writes an unbounded cell set');
  await store.close();

  const canonical = Stats.createStore({ backend: Stats.createMemoryBackend(), maxRawFlips: 1,
    deviceId: 'canonical-device', sessionId: 'canonical-session' });
  const objects = ['bottle','coffee-mug','teapot','soup-can','microscope','penguin','owl','giraffe'];
  const events = ['rainbow-corkscrew','half-full','power-launch','fizz-jet','golden-flip','bouncy-bottle',
    'earthquake','moon-gravity','ice-slide','alien-invasion'];
  const flavors = ['blue-steel','sucker-punch','lime-light','orange-crush','grape-expectations',
    'ice-ice-baby','apple-solutely','berry-nice'];
  for (let n = 1; n <= 500; n++) {
    const objectId = objects[n % objects.length];
    await canonical.recordFlip(flip(20000 + n, { uuid: uuid('dead', n), deviceId: 'canonical-device',
      sessionId: 'canonical-session', playerId: 'p1', seat: 0, teamId: 'red', objectId,
      variantId: `${objectId}.${flavors[n % flavors.length]}`, eventId: events[n % events.length] }));
  }
  data = await canonical.query({ includeTestData: true });
  assert.ok(data.rollups.length <= 64, `canonical product created ${data.rollups.length} cells`);
  assert.equal((await canonical.summary({ includeTestData: true })).flips, 500);
  assert.equal((await canonical.summary({ playerId: 'p1', seat: 0, includeTestData: true })).flips, 500,
    'overflow retains common trusted player and seat dimensions');
  await canonical.close();

  const migratedRows = Array.from({ length: 120 }, (_, index) => {
    const objectId = objects[index % objects.length];
    const eventId = events[Math.floor(index / objects.length) % events.length];
    const variantId = `${objectId}.${flavors[Math.floor(index / (objects.length * events.length)) % flavors.length]}`;
    const dimensions = { day: '2026-09-05', scope: 'device', sessionId: 'migration-session',
      deviceId: 'migration-device', mode: 'classic', playerId: 'p1', seat: 0, isAI: false,
      teamId: 'red', objectId, variantId, cosmeticId: 'sparkles', arenaId: 'rooftop', eventId,
      playerCount: 2, viewportBucket: '1280x720', result: 'MAKE', online: false, testData: false };
    return { schema: 'FlipAggregateV1', version: index % 3 + 1, uuid: uuid('abba', index + 1),
      key: `legacy-${index}`, source: 'retention', timestampStart: Date.UTC(2026, 8, 5),
      timestampEnd: Date.UTC(2026, 8, 5, 23, 59, 59, 999), dimensions,
      flips: 1, makes: 1, caps: 0, perfect: 0, eventObserved: 1, eventSuccesses: 1 };
  });
  const migrationBackend = Stats.createMemoryBackend({ rollups: migratedRows,
    meta: [{ key: 'legacy-migrated', value: true }] });
  const migration = Stats.createStore({ backend: migrationBackend, deviceId: 'migration-device',
    sessionId: 'migration-current' });
  await migration.flush();
  assert.equal((await migration.summary({ includeTestData: true })).flips, 120);
  await migration.close();
  const migratedDump = await migrationBackend.dump();
  assert.ok(migratedDump.rollups.length <= 64, 'v1/v2/v3 rollups migrate to the bounded representation');
  assert.equal(migratedDump.rollups.reduce((sum, row) => sum + Number(row.flips || 0), 0), 120);
  const migrationReopen = Stats.createStore({ backend: migrationBackend, deviceId: 'migration-device',
    sessionId: 'migration-reopen' });
  assert.equal((await migrationReopen.summary({ includeTestData: true })).flips, 120,
    'bounded rollup migration persists without duplicate totals on reopen');
  await migrationReopen.close();
}

(async () => {
  await testSnapshotLineageReplacementAndAtomicity();
  testSaveRowsAndUnicodeSafety();
  await testFullFlightTiming();
  await testFallbackMatchFiltersAcrossReopen();
  await testCardinalityBoundedRollups();
  console.log('v111 final data/safety corrective tests passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
