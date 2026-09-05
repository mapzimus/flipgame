#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const NamePolicy = require('../js/v111-name-policy.js');
const Stats = require('../js/v111-stats.js');

function uuid(n) {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}
function flip(n, extra = {}) {
  return Object.assign({
    schema: 'FlipRecordV1', version: 1, uuid: uuid(n), timestamp: n * 1000,
    sessionId: 'session-a', deviceId: 'device-a', scope: 'device', matchId: 'match-a',
    sequence: n, mode: 'classic', online: false, practice: false, forced: false,
    testData: false, playerId: 'p1', displayName: 'Ada', playerIndex: 0, isAI: false,
    teamId: null, result: n % 2 ? 'MAKE' : 'MISS', made: !!(n % 2), pose: n % 2 ? 'upright' : 'other',
    landingReason: n % 2 ? 'upright' : 'fallen', perfect: false, cap: false,
    power: 2000 + n, direction: n % 2 ? 1 : -1, rotations: n, livesBefore: 3,
    livesAfter: 2, stake: n, streak: n % 3, eventId: null, eventSuccess: null,
    objectId: 'bottle', variantId: 'bottle.blue-steel', cupHeat: null, teamScore: null,
  }, extra);
}
function match(n, extra = {}) {
  return Object.assign({
    schema: 'MatchRecordV1', version: 1, uuid: uuid(1000 + n), timestamp: n * 10000,
    sessionId: 'session-a', deviceId: 'device-a', scope: 'device', matchId: `m${n}`,
    mode: 'classic', online: false, practice: false, testData: false,
    winnerIndex: 0, winnerIds: ['p1'], players: [{ playerId: 'p1', displayName: 'Ada', playerIndex: 0, isAI: false }],
    cup: null, team: null, stats: null, completed: true,
  }, extra);
}

function memoryStorage(seed = {}) {
  const values = Object.assign({}, seed);
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
    setItem(key, value) { values[key] = String(value); },
    dump() { return JSON.parse(JSON.stringify(values)); },
  };
}

// Minimal spec-shaped fake IDB used to exercise the real browser adapter,
// including upgrade, read/write transactions, reopen, and deletes.
function fakeIndexedDB() {
  const databases = new Map();
  const later = (fn) => setTimeout(fn, 0);
  class FakeStoreNames {
    constructor(db) { this.db = db; }
    contains(name) { return this.db.stores.has(name); }
  }
  class FakeTransaction {
    constructor(db, names, mode) {
      this.db = db;
      this.names = names;
      this.mode = mode;
      this.error = null;
      this.pending = 0;
      this.finished = false;
      later(() => this.maybeFinish());
    }
    objectStore(name) {
      if (!this.names.includes(name)) throw new Error('Store not in transaction');
      const target = this.db.stores.get(name);
      return {
        getAll: () => {
          const request = {};
          this.pending++;
          later(() => {
            request.result = Array.from(target.values()).map((value) => structuredClone(value));
            request.onsuccess?.(); this.pending--; this.maybeFinish();
          });
          return request;
        },
        put: (value) => {
          const key = value.uuid ?? value.key;
          target.set(key, structuredClone(value));
          return {};
        },
        delete: (key) => { target.delete(key); return {}; },
      };
    }
    maybeFinish() {
      if (!this.finished && this.pending === 0) {
        this.finished = true;
        later(() => this.oncomplete?.());
      }
    }
  }
  class FakeDB {
    constructor() { this.stores = new Map(); this.objectStoreNames = new FakeStoreNames(this); }
    createObjectStore(name) { this.stores.set(name, new Map()); return {}; }
    transaction(names, mode) { return new FakeTransaction(this, names, mode); }
    close() {}
  }
  return {
    open(name) {
      const request = {};
      later(() => {
        let db = databases.get(name);
        const fresh = !db;
        if (!db) { db = new FakeDB(); databases.set(name, db); }
        request.result = db;
        if (fresh) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };
}

async function testNamePolicyNormalizationAndLimits() {
  assert.equal(NamePolicy.normalize('  Ｍａｒｉ́ａ\u202e  Jones  '), 'María Jones');
  assert.equal(NamePolicy.validate('Zoë O’Neil').valid, true);
  assert.equal(NamePolicy.validate("Jean-Luc Jr.").valid, true);
  assert.equal(NamePolicy.validate('Player_2').valid, true);
  assert.equal(NamePolicy.validate('e\u0301'.repeat(14)).valid, true, 'limits grapheme clusters, not UTF-16 units');
  assert.equal(NamePolicy.validate('A'.repeat(15)).code, 'too-long');
  assert.equal(NamePolicy.validate('\u0000\u202e').code, 'empty');
  assert.equal(NamePolicy.validate('<img src=x>').code, 'unsupported');
  assert.equal(NamePolicy.validate('🔥').code, 'unsupported');
}

async function testNamePolicyEvasionAndFalsePositives() {
  for (const name of ['f.u.c.k', 'f u c k', 'a.s.s', 'phuuck', 'n1gg3r', 'nіggеr', 'FÁGGÓT', 'h3ll']) {
    const result = NamePolicy.validate(name);
    assert.equal(result.valid, false, `${name} should be blocked`);
    assert.equal(result.error, 'Choose a different name.');
    assert.ok(!result.error.includes(name), 'rename errors never echo rejected text');
  }
  for (const name of ['Cass', 'Class Act', 'Essex', 'Hancock', 'Scunthorpe', 'Therapist', 'Grape', 'Saturday']) {
    assert.equal(NamePolicy.validate(name).valid, true, `${name} is a false-positive guard`);
  }
  assert.equal(NamePolicy.safeDisplay('<script>alert(1)</script>', 'Player 4'), 'Player 4');
  assert.equal(NamePolicy.safeDisplay('<script>', '<unsafe>'), 'Player');
}

async function testNamePolicyAllowlistAndRuntimeInstall() {
  assert.ok(NamePolicy.EVENT_QA_NAMES.length >= 31);
  for (const name of NamePolicy.EVENT_QA_NAMES) {
    assert.equal(NamePolicy.validate(name).valid, true, `${name} should be allowlisted exactly`);
  }
  assert.equal(NamePolicy.validate('mr. howe').valid, true, 'ordinary safe case variants remain valid but are not privileged');
  const Runtime = require('../js/v111-runtime.js');
  assert.equal(Runtime.namePolicy.current(), NamePolicy);
  assert.equal(Runtime.namePolicy.validate('f.u.c.k').error, 'Choose a different name.');
}

async function testNormalizationAndStableDedupe() {
  const normalized = Stats.normalizeFlipRecord({
    sequence: 4, timestamp: 500, payload: {
      game: { format: 'cup', currentPlayerIndex: 0, pointCount: 3, players: [{ id: 'p1', name: 'Ada', skin: 'coffee-mug', lives: 4 }] },
      landing: { result: 'MAKE', pose: 'cap', reason: 'cap', rotations: 2.2, onCap: true },
      flick: { vx: -20, vy: -3000 }, eventId: 'heart-rush',
    },
  }, { deviceId: 'd', sessionId: 's', now: () => 999 });
  assert.equal(normalized.schema, 'FlipRecordV1');
  assert.match(normalized.uuid, /^[0-9a-f-]{36}$/);
  assert.equal(normalized.mode, 'cup');
  assert.equal(normalized.pose, 'cap');
  assert.equal(normalized.objectId, 'coffee-mug');
  assert.equal(normalized.direction, -1);
  assert.equal(normalized.eventSuccess, true);
  assert.ok(Object.isFrozen(normalized));

  const store = Stats.createStore({ backend: Stats.createMemoryBackend(), deviceId: 'device-a', sessionId: 'session-a' });
  await store.recordFlip(flip(1));
  const duplicate = await store.recordFlip(flip(1));
  await store.recordMatch(match(1));
  assert.equal(duplicate.duplicate, true);
  assert.deepEqual(await store.summary(), { flips: 1, makes: 1, misses: 0, makeRate: 1, makePercentage: 100, caps: 0, perfect: 0, matches: 1 });
  await store.close();
}

async function testQueuedWritesRollupAndFiltering() {
  const backend = Stats.createMemoryBackend();
  const store = Stats.createStore({ backend, maxRawFlips: 3, deviceId: 'device-a', sessionId: 'session-a' });
  const writes = [];
  for (let i = 1; i <= 5; i++) writes.push(store.recordFlip(flip(i, i === 3 ? { testData: true } : {})));
  assert.equal((await backend.dump()).flips.length, 0, 'recording is queued outside the caller stack');
  await Promise.all(writes);
  const all = await store.query({ includeTestData: true });
  assert.equal(all.flips.length, 3, 'only newest configured raw records remain');
  assert.equal(all.rollups.reduce((n, row) => n + row.flips, 0), 2, 'older records roll up before pruning');
  assert.equal((await store.summary({ includeTestData: true })).flips, 5);
  assert.equal((await store.summary()).flips, 4, 'test data is excluded by default across raw and rollups');
  assert.equal((await store.query({ playerId: 'missing' })).flips.length, 0);
  assert.equal((await store.query({ sessionId: 'session-a', includeTestData: true })).flips.length, 3);
  assert.equal((await store.query({ scope: 'session', includeTestData: true })).flips.length, 3);
  const prunedDuplicate = await store.recordFlip(flip(1));
  assert.equal(prunedDuplicate.duplicate, true, 'UUID dedupe survives raw-detail pruning');
  assert.equal((await store.summary({ includeTestData: true })).flips, 5);
  await store.close();
}

async function testObservedOnlyDatasets() {
  const records = [
    flip(1, { eventId: 'heart-rush', eventSuccess: true, result: 'MAKE', made: true, cap: true }),
    flip(2, { eventId: 'heart-rush', eventSuccess: false, result: 'MISS', made: false }),
    flip(3, { mode: 'team-clash', teamId: 'red', objectId: 'coffee-mug', landingReason: 'timeout' }),
  ];
  const matches = [
    match(1, { mode: 'cup', cup: { heats: [0, 1, 0], shootoutRounds: 0 } }),
    match(2, { mode: 'team-clash', team: { scores: [11, 8] } }),
  ];
  const data = { flips: records, matches, rollups: [] };
  const charts = Stats.buildDatasets(data);
  assert.deepEqual(charts.events.map((row) => row.eventId), ['heart-rush']);
  assert.equal(charts.events[0].fraction, '1/2');
  assert.equal(charts.events[0].observedFraction, '2/3');
  assert.equal(charts.events[0].successRate, 0.5);
  assert.equal(charts.events[0].successPercent, 50);
  assert.ok(!JSON.stringify(charts).includes('life-drain'), 'undiscovered event names never appear');
  assert.equal(charts.cumulativeMakeRate.at(-1).flips, 3);
  assert.equal(charts.sequenceStrip.length, 3);
  assert.ok(charts.powerDirectionHeatmap.length);
  assert.ok(charts.rotations.length);
  assert.ok(charts.landingReasons.some((row) => row.reason === 'timeout'));
  assert.ok(charts.livesStake.lives.length && charts.livesStake.stake.length);
  assert.ok(charts.streaks.length && charts.objects.length);
  assert.equal(charts.cupTeam.cup.length, 1);
  assert.equal(charts.cupTeam.team.length, 1);
  assert.equal(Stats.buildDatasets(data, { playerId: 'p1' }).cupTeam.cup.length, 1,
    'nested match players participate in filters');
  assert.ok(!JSON.stringify(charts).includes('normalDenominator'));
}

async function testImportExportRoundTripScopesAndCsv() {
  const original = Stats.createStore({ backend: Stats.createMemoryBackend(), deviceId: 'device-a', sessionId: 'session-a' });
  await original.recordFlip(flip(1, { customFutureField: { kept: true } }));
  await original.recordFlip(flip(2, { playerId: 'p2', displayName: '=HYPERLINK("bad")', eventId: 'plinko', eventSuccess: false }));
  await original.recordMatch(match(1));
  const serialized = await original.exportJSON({ exportedAt: 123, includeTestData: true });

  const imported = Stats.createStore({ backend: Stats.createMemoryBackend(), deviceId: 'device-b', sessionId: 'session-b' });
  const first = await imported.importJSON(serialized);
  const second = await imported.importJSON(serialized);
  assert.deepEqual({ flips: first.flips, matches: first.matches, rollups: first.rollups }, { flips: 2, matches: 1, rollups: 0 });
  assert.equal(second.duplicates, 3);
  assert.equal((await imported.query({ scope: 'import', includeTestData: true })).flips.length, 2);
  assert.equal((await imported.query({ scope: 'device', includeTestData: true })).flips.length, 0);
  const roundTrip = JSON.parse(await imported.exportJSON({ exportedAt: 123, includeTestData: true }));
  assert.deepEqual(roundTrip, JSON.parse(serialized), 'JSON roundtrip preserves every public field');

  const pseudo = await imported.exportCSV('flip', { includeTestData: true });
  assert.ok(pseudo.includes('Player 1') && pseudo.includes('Player 2'));
  assert.ok(!pseudo.includes('Ada') && !pseudo.includes('HYPERLINK'));
  assert.ok(!pseudo.includes('"p1"') && !pseudo.includes('"p2"'), 'stable player IDs are pseudonymized too');
  const named = await imported.exportCSV('flip', { includeNames: true, includeTestData: true });
  assert.ok(named.includes('Ada'));
  assert.ok(named.includes("'=HYPERLINK"), 'explicit names are still spreadsheet-injection safe');
  for (const type of ['match', 'player', 'event']) {
    const output = await imported.exportCSV(type, { includeTestData: true });
    assert.ok(output.includes('\r\n') || output.startsWith('"'), `${type} CSV is produced`);
  }
  const malicious = '{"schema":"FlipStatsExportV1","version":1,"flips":[{"__proto__":{"polluted":true}}],"matches":[],"rollups":[]}';
  assert.throws(() => Stats.parseImportJSON(malicious), /Unsafe/);
  assert.equal({}.polluted, undefined);
  await original.close(); await imported.close();
}

async function testLegacyMigrationAndTransactionFailureFallback() {
  const storage = memoryStorage();
  const backend = Stats.createMemoryBackend({}, { failCommit: (number) => number === 2 });
  const store = Stats.createStore({ backend, localStorage: storage, deviceId: 'device-a', sessionId: 'session-a',
    legacyRecords: { totalFlips: 20, totalMakes: 7, capLands: 2, bestStreak: 4 } });
  await store.flush();
  assert.equal((await store.summary()).flips, 20);
  const result = await store.recordFlip(flip(1));
  assert.equal(result.stored, true, 'a failed durable transaction still records into aggregate fallback');
  assert.equal(result.fallback, true);
  assert.equal(store.usingFallback(), true);
  assert.equal((await store.summary()).flips, 21);
  const saved = JSON.parse(storage.dump()[Stats.FALLBACK_KEY]);
  assert.equal(saved.schema, 'FlipStatsFallbackV1');
  assert.equal(saved.rollups.reduce((n, row) => n + row.flips, 0), 21);
  assert.ok(store.getErrors().some((error) => /Injected transaction/.test(error.message)));
  await store.close();

  const firstFallback = Stats.createStore({ indexedDB: null, localStorage: storage, deviceId: 'device-a', sessionId: 'fallback-1' });
  await firstFallback.recordFlip(flip(9, { sessionId: 'fallback-1' }));
  const beforeReload = await firstFallback.summary({ includeTestData: true });
  await firstFallback.close();
  const secondFallback = Stats.createStore({ indexedDB: null, localStorage: storage, deviceId: 'device-a', sessionId: 'fallback-2' });
  assert.equal(secondFallback.usingFallback(), true);
  assert.deepEqual(await secondFallback.summary({ includeTestData: true }), beforeReload,
    'aggregate-only local fallback survives reload without double-counting');
  await secondFallback.recordFlip(flip(10, { sessionId: 'fallback-2' }));
  assert.equal((await secondFallback.summary({ includeTestData: true })).flips, beforeReload.flips + 1);
  await secondFallback.close();
}

async function testFakeIndexedDBPersistence() {
  const idb = fakeIndexedDB();
  const first = Stats.createStore({ indexedDB: idb, dbName: 'test-stats', deviceId: 'd', sessionId: 's', maxRawFlips: 2 });
  await first.recordFlip(flip(1));
  await first.recordFlip(flip(2));
  await first.recordFlip(flip(3));
  await first.recordMatch(match(1));
  await first.close();
  const second = Stats.createStore({ indexedDB: idb, dbName: 'test-stats', deviceId: 'd', sessionId: 's2' });
  assert.equal((await second.summary({ includeTestData: true })).flips, 3);
  assert.equal((await second.summary({ includeTestData: true })).matches, 1);
  assert.equal((await second.query({ includeTestData: true })).flips.length, 2);
  assert.equal((await second.recordFlip(flip(1))).duplicate, true);
  await second.close();
}

async function testStableLocalDeviceIdentity() {
  const storage = memoryStorage();
  const first = Stats.createStore({ indexedDB: null, localStorage: storage, now: () => 42 });
  await first.flush();
  const second = Stats.createStore({ indexedDB: null, localStorage: storage, now: () => 99 });
  await second.flush();
  assert.equal(first.deviceId, second.deviceId, 'device scope uses a persisted local identifier');
  assert.notEqual(first.sessionId, second.sessionId);
  await first.close(); await second.close();
}

async function testBrowserGlobalsAndNoNetwork() {
  const context = vm.createContext({ console, Map, Set, Promise, Date, Math, JSON, Object, Array, String, Number,
    Boolean, RegExp, Error, TypeError, RangeError, Intl, setTimeout, clearTimeout });
  for (const file of ['js/v111-interfaces.js', 'js/v111-runtime.js', 'js/v111-name-policy.js', 'js/v111-stats.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  }
  assert.equal(context.FlipgameV111NamePolicy.schema, 'NamePolicyV1');
  assert.equal(context.FlipgameV111.namePolicy.current(), context.FlipgameV111NamePolicy);
  assert.equal(context.FlipgameV111.stats.current(), context.FlipgameV111Stats.defaultStore);
  const source = fs.readFileSync(path.join(root, 'js/v111-stats.js'), 'utf8');
  assert.ok(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket\s*\(/.test(source), 'stats has no network or telemetry path');
  assert.ok(!/Math\.random|crypto\.getRandomValues|cryptoObject\.randomUUID/.test(source),
    'stats never advances a random source');
}

async function main() {
  await testNamePolicyNormalizationAndLimits();
  await testNamePolicyEvasionAndFalsePositives();
  await testNamePolicyAllowlistAndRuntimeInstall();
  await testNormalizationAndStableDedupe();
  await testQueuedWritesRollupAndFiltering();
  await testObservedOnlyDatasets();
  await testImportExportRoundTripScopesAndCsv();
  await testLegacyMigrationAndTransactionFailureFallback();
  await testFakeIndexedDBPersistence();
  await testStableLocalDeviceIdentity();
  await testBrowserGlobalsAndNoNetwork();
  console.log('v111 stats/name safety tests passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
