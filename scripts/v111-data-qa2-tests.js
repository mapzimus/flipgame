#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const Stats = require('../js/v111-stats.js');
const NamePolicy = require('../js/v111-name-policy.js');

function uuid(prefix, n) {
  return `${prefix.padEnd(8, '0').slice(0, 8)}-0000-4000-8000-${String(n).padStart(12, '0')}`;
}
const day = Date.UTC(2026, 8, 6);
function flip(n, extra = {}) {
  return Object.assign({
    schema: 'FlipRecordV1', version: 1, uuid: uuid('a11ce', n), timestamp: day + n,
    sessionId: 'shared-session', deviceId: 'shared-device', scope: 'device', mode: 'classic',
    result: 'MAKE', made: true, pose: 'upright', testData: false, online: false,
    playerCount: 2, playerId: 'p1', displayName: 'Ada', seat: 0, isAI: false, teamId: 'red',
    objectId: 'bottle', variantId: 'bottle.blue-steel', cosmeticId: 'sparkles',
    arenaId: 'rooftop', eventId: 'rainbow-corkscrew', eventSuccess: true,
    viewport: { bucket: '1280x720' }, flightMs: 1100, settleMs: 300,
  }, extra);
}
function match(n, extra = {}) {
  return Object.assign({
    schema: 'MatchRecordV1', version: 1, uuid: uuid('b00b5', n), timestamp: day + n,
    sessionId: 'match-session', deviceId: 'match-device', scope: 'device', mode: 'cup',
    online: false, testData: false, playerCount: 2, arenaId: 'rooftop',
    viewport: { bucket: '1280x720' }, eventCounts: { 'rainbow-corkscrew': 1 },
    participants: [
      { playerId: 'p1', displayName: 'Ada', seat: 0, isAI: false, teamId: 'red',
        objectId: 'bottle', variantId: 'bottle.blue-steel', cosmeticId: 'sparkles' },
      { playerId: 'p2', displayName: 'CPU', seat: 1, isAI: true, teamId: 'blue',
        objectId: 'coffee-mug', variantId: 'coffee-mug.sucker-punch', cosmeticId: 'chrome' },
    ],
    winnerId: 'p1', winnerIds: ['p1'], cup: { heats: [2, 0] }, completed: true,
  }, extra);
}
function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

async function createSource(label, prefix, count) {
  const store = Stats.createStore({ backend: Stats.createMemoryBackend(), maxRawFlips: 1,
    deviceId: `${label}-archive`, sessionId: `${label}-archive` });
  for (let n = 1; n <= count; n++) await store.recordFlip(flip(n, { uuid: uuid(prefix, n) }));
  return store;
}

async function testHubLineageComposition() {
  const sourceA = await createSource('source-a', 'aaaa', 80);
  const sourceB = await createSource('source-b', 'bbbb', 80);
  const a80 = await sourceA.exportJSON({ includeTestData: true, exportedAt: 80 });
  const b80 = await sourceB.exportJSON({ includeTestData: true, exportedAt: 80 });
  assert.equal(JSON.parse(a80).rollups[0].uuid, JSON.parse(b80).rollups[0].uuid,
    'fixture exercises equal source-local aggregate UUIDs');

  const hub = Stats.createStore({ backend: Stats.createMemoryBackend(), maxRawFlips: 1,
    deviceId: 'hub', sessionId: 'hub' });
  await hub.importJSON(a80); await hub.importJSON(b80);
  assert.equal((await hub.summary({ includeTestData: true })).flips, 160);
  const hub160 = await hub.exportJSON({ includeTestData: true, exportedAt: 160 });
  const leaf = Stats.createStore({ backend: Stats.createMemoryBackend(), maxRawFlips: 1,
    deviceId: 'leaf', sessionId: 'leaf' });
  await leaf.importJSON(hub160);
  assert.equal((await leaf.summary({ includeTestData: true })).flips, 160,
    'composed snapshot keeps both upstream lineages');
  assert.equal((await leaf.importJSON(hub160)).duplicate, true);
  assert.equal((await leaf.summary({ includeTestData: true })).flips, 160);

  for (let n = 81; n <= 100; n++) await sourceA.recordFlip(flip(n, { uuid: uuid('aaaa', n) }));
  await hub.importJSON(await sourceA.exportJSON({ includeTestData: true, exportedAt: 100 }));
  assert.equal((await hub.summary({ includeTestData: true })).flips, 180);
  await leaf.importJSON(await hub.exportJSON({ includeTestData: true, exportedAt: 180 }));
  assert.equal((await leaf.summary({ includeTestData: true })).flips, 180,
    'newer composed snapshot atomically supersedes the older hub contribution');
  await sourceA.close(); await sourceB.close(); await hub.close(); await leaf.close();
}

async function testExactBoundedOverflowFilters() {
  const objects = ['bottle','coffee-mug','milk-carton','teapot','soup-can','smoothie','microscope','desk-globe'];
  const events = ['rainbow-corkscrew','half-full','power-launch','fizz-jet','golden-flip','bouncy-bottle',
    'earthquake','moon-gravity','ice-slide','alien-invasion'];
  const arenas = ['rooftop','arcade','moon-deck','ice-cave'];
  const modes = ['classic','cup','team-clash'];
  const rows = [];
  const storage = memoryStorage();
  const store = Stats.createStore({ indexedDB: null, localStorage: storage, maxRawFlips: 1,
    deviceId: 'filter-device', sessionId: 'filter-session' });
  for (let n = 0; n < 96; n++) {
    const objectId = objects[n % objects.length];
    const row = flip(1000 + n, { uuid: uuid('cafe', n + 1), sessionId: 'filter-session',
      deviceId: 'filter-device', mode: modes[n % modes.length], playerId: `p${n % 8}`,
      seat: n % 8, teamId: n % 2 ? 'blue' : 'red', objectId,
      variantId: `${objectId}.blue-steel`, arenaId: arenas[n % arenas.length],
      eventId: events[n % events.length] });
    rows.push(row); await store.recordFlip(row);
  }
  const target = rows[73];
  const combined = { includeTestData: true, objectId: target.objectId, eventId: target.eventId,
    arenaId: target.arenaId, mode: target.mode, playerId: target.playerId, seat: target.seat };
  const expected = rows.filter((row) => row.objectId === target.objectId && row.eventId === target.eventId &&
    row.arenaId === target.arenaId && row.mode === target.mode && row.playerId === target.playerId &&
    row.seat === target.seat).length;
  assert.equal((await store.summary(combined)).flips, expected);
  let data = await store.query({ includeTestData: true });
  assert.ok(data.rollups.length <= 64);
  assert.ok(data.rollups.every((row) => !row.index || row.index.length <= Stats.MAX_AGGREGATE_INDEX_ENTRIES));
  await store.close();
  const reopened = Stats.createStore({ indexedDB: null, localStorage: storage, maxRawFlips: 1,
    deviceId: 'filter-device', sessionId: 'filter-reopen' });
  assert.equal((await reopened.summary(combined)).flips, expected,
    'combined flip filters remain exact after fallback reopen');
  assert.equal((await reopened.summary(Object.assign({}, combined, { eventId: 'life-drain' }))).flips, 0);
  const filterHub = Stats.createStore({ backend: Stats.createMemoryBackend(), maxRawFlips: 1,
    deviceId: 'filter-hub', sessionId: 'filter-hub' });
  await filterHub.importJSON(await reopened.exportJSON({ includeTestData: true }));
  assert.equal((await filterHub.summary(combined)).flips, expected);
  const filterLeaf = Stats.createStore({ backend: Stats.createMemoryBackend(), maxRawFlips: 1,
    deviceId: 'filter-leaf', sessionId: 'filter-leaf' });
  await filterLeaf.importJSON(await filterHub.exportJSON({ includeTestData: true }));
  assert.equal((await filterLeaf.summary(combined)).flips, expected,
    'joint filter index survives export hub chaining');
  await filterHub.close(); await filterLeaf.close();
  await reopened.close();

  const matchRows = [];
  const matchStorage = memoryStorage();
  const matchStore = Stats.createStore({ indexedDB: null, localStorage: matchStorage,
    deviceId: 'match-device', sessionId: 'match-session' });
  for (let n = 0; n < 80; n++) {
    const playerId = `p${n % 8}`;
    const objectId = objects[n % objects.length];
    const eventId = events[n % events.length];
    const arenaId = arenas[n % arenas.length];
    const mode = modes[n % modes.length];
    const row = match(2000 + n, { uuid: uuid('d00d', n + 1), mode, arenaId,
      eventCounts: { [eventId]: 1 }, participants: [
        { playerId, displayName: 'Ada', seat: n % 8, isAI: false, teamId: n % 2 ? 'blue' : 'red',
          objectId, variantId: `${objectId}.blue-steel`, cosmeticId: 'sparkles' },
      ] });
    matchRows.push(row); await matchStore.recordMatch(row);
  }
  const matchTarget = matchRows[67];
  const participant = matchTarget.participants[0];
  const eventId = Object.keys(matchTarget.eventCounts)[0];
  const matchFilter = { objectId: participant.objectId, eventId, arenaId: matchTarget.arenaId,
    mode: matchTarget.mode, playerId: participant.playerId, seat: participant.seat };
  const expectedMatches = matchRows.filter((row) => {
    const player = row.participants[0];
    return player.objectId === participant.objectId && Object.keys(row.eventCounts)[0] === eventId &&
      row.arenaId === matchTarget.arenaId && row.mode === matchTarget.mode &&
      player.playerId === participant.playerId && player.seat === participant.seat;
  }).length;
  assert.equal((await matchStore.summary(matchFilter)).matches, expectedMatches);
  await matchStore.close();
  const matchReopen = Stats.createStore({ indexedDB: null, localStorage: matchStorage,
    deviceId: 'match-device', sessionId: 'match-reopen' });
  assert.equal((await matchReopen.summary(matchFilter)).matches, expectedMatches,
    'combined match filters remain exact after fallback reopen');
  assert.equal((await matchReopen.summary(Object.assign({}, matchFilter, { eventId: 'life-drain' }))).matches, 0);
  data = await matchReopen.query({ includeTestData: true });
  assert.ok(data.rollups.filter((row) => row.schema === 'MatchAggregateV1').length <= 64);
  const matchLeaf = Stats.createStore({ backend: Stats.createMemoryBackend(), deviceId: 'match-leaf' });
  const matchImport = await matchLeaf.importJSON(await matchReopen.exportJSON({ includeTestData: true }));
  assert.equal(matchImport.imported, true, JSON.stringify({ matchImport,
    errors: matchLeaf.getErrors().map((error) => error && error.stack || String(error)) }));
  assert.equal((await matchLeaf.summary(matchFilter)).matches, expectedMatches,
    'joint match filter index survives export/import');
  await matchLeaf.close();
  await matchReopen.close();
}

async function testMalformedAggregatesAreAtomic() {
  const source = Stats.createStore({ backend: Stats.createMemoryBackend(), maxRawFlips: 1,
    deviceId: 'validation-source', sessionId: 'validation-source' });
  await source.recordFlip(flip(4001, { uuid: uuid('eeee', 1) }));
  await source.recordFlip(flip(4002, { uuid: uuid('eeee', 2) }));
  const original = JSON.parse(await source.exportJSON({ includeTestData: true }));
  const destination = Stats.createStore({ backend: Stats.createMemoryBackend(), deviceId: 'validation-dest' });
  await destination.recordFlip(flip(4999, { uuid: uuid('ffff', 1) }));
  const baseline = (await destination.summary({ includeTestData: true })).flips;
  const mutations = [
    (row) => { row.schema = 'UnknownAggregate'; },
    (row) => { row.version = 99; },
    (row) => { row.version = '3'; },
    (row) => { row.flips = -1; },
    (row) => { row.flips = Infinity; },
    (row) => { row.flips = Stats.MAX_AGGREGATE_INDEX_ENTRIES * 10001; },
    (row) => { row.makes = row.flips + 1; },
    (row) => { row.caps = row.flips + 1; },
    (row) => { row.perfect = row.flips + 1; },
    (row) => { row.counters = { results: { MAKE: -1 } }; },
    (row) => { row.makeCounters = { results: { MAKE: row.makes + 1 } }; },
    (row) => { row.overflow = true; row.index = new Array(Stats.MAX_AGGREGATE_INDEX_ENTRIES + 1).fill({}); },
  ];
  for (const mutate of mutations) {
    const malformed = structuredClone(original);
    mutate(malformed.rollups[0]);
    const result = await destination.importJSON(malformed);
    assert.equal(result.imported, false, 'malformed aggregate was imported');
    assert.equal(result.error, 'invalid-import');
    assert.equal((await destination.summary({ includeTestData: true })).flips, baseline,
      'invalid document partially mutated the store');
  }
  await source.close(); await destination.close();
}

async function testNameAndStartingSettingsSafety() {
  ['n\u0456\u0261\u0261\u0435r', 'f\u028bck', 'f\u028cck'].forEach((probe) => {
    assert.equal(NamePolicy.validate(probe).valid, false, `${probe} bypassed NamePolicy`);
  });
  ['Zoë', 'André', 'Cassidy', 'Scunthorpe', 'Grape Soda', 'Mr. Howe', ...NamePolicy.EVENT_QA_NAMES]
    .forEach((name) => assert.equal(NamePolicy.validate(name).valid, true, `${name} became a false positive`));

  const blocked = 'f\u028bck';
  const input = match(5001, { uuid: uuid('abcde', 1), startingSettings: {
    rows: [{ id: 'seat-1', name: blocked }], arena: { name: blocked },
  } });
  assert.equal(Stats.normalizeMatchRecord(input, { deviceId: 'match-device', sessionId: 'match-session' })
    .startingSettings.rows[0].name, 'Player');
  const backend = Stats.createMemoryBackend();
  const store = Stats.createStore({ backend, deviceId: 'match-device', sessionId: 'match-session' });
  await store.recordMatch(input);
  assert.equal((await backend.dump()).matches[0].startingSettings.rows[0].name, 'Player');
  const exported = JSON.parse(await store.exportJSON({ includeTestData: true }));
  assert.equal(exported.matches[0].startingSettings.rows[0].name, 'Player');
  assert.equal(exported.matches[0].startingSettings.arena.name, blocked,
    'unrelated metadata remains lossless');

  const importedDoc = structuredClone(exported);
  importedDoc.sourceArchiveId = 'malicious-source'; importedDoc.snapshotSequence += 1;
  importedDoc.snapshotId = 'malicious-snapshot';
  importedDoc.matches[0].uuid = uuid('123ab', 1);
  importedDoc.matches[0].startingSettings.rows[0].name = blocked;
  const imported = Stats.createStore({ backend: Stats.createMemoryBackend(), deviceId: 'import-dest' });
  assert.equal((await imported.importJSON(importedDoc)).imported, true);
  const reexported = JSON.parse(await imported.exportJSON({ includeTestData: true }));
  assert.equal(reexported.matches[0].startingSettings.rows[0].name, 'Player');
  await store.close(); await imported.close();
}

(async () => {
  await testHubLineageComposition();
  await testExactBoundedOverflowFilters();
  await testMalformedAggregatesAreAtomic();
  await testNameAndStartingSettingsSafety();
  console.log('v111 State/Data QA2 corrections passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
