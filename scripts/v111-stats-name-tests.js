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
    schema: 'FlipRecordV1', version: 1, releaseVersion: 'v111', uuid: uuid(n), timestamp: n * 1000,
    sessionId: 'session-a', deviceId: 'device-a', scope: 'device', matchId: 'match-a',
    sequence: n, mode: 'classic', heat: 1, round: 1, turn: n, playerCount: 2,
    online: false, practice: false, forced: false,
    testData: false, playerId: 'p1', displayName: 'Ada', playerIndex: 0, isAI: false,
    seat: 0, teamId: null, result: n % 2 ? 'MAKE' : 'MISS', made: !!(n % 2), pose: n % 2 ? 'upright' : 'other',
    landingReason: n % 2 ? 'upright' : 'fallen', perfect: false, cap: false,
    power: 2000 + n, direction: n % 2 ? 1 : -1, rotations: n, contacts: 1, bounces: 0, banks: 0,
    flightMs: 600, firstContactMs: 500, settleMs: 100,
    livesBefore: 3, livesAfter: 2, stakeBefore: n - 1, stakeAfter: n, stake: n,
    streakBefore: Math.max(0, n % 3 - 1), streakAfter: n % 3, streak: n % 3,
    onFireBefore: false, onFireAfter: false, suddenDeathBefore: false, suddenDeathAfter: false,
    eventId: null, eventSuccess: null, oddsProfile: 'normal', eventSeed: n, trajectorySeed: n + 100,
    appliedReward: null, appliedEffect: null,
    objectId: 'bottle', variantId: 'bottle.blue-steel', cosmeticId: 'cosmetic-blue', arenaId: 'classic-table',
    viewport: { width: 1280, height: 800, bucket: '1280x800', orientation: 'landscape' },
    performance: { fpsBucket: '55-60', frameTimeBucket: '<20ms', slowFrameRateBucket: '<1%' },
    cupHeat: null, teamScore: null,
  }, extra);
}
function match(n, extra = {}) {
  return Object.assign({
    schema: 'MatchRecordV1', version: 1, releaseVersion: 'v111', uuid: uuid(1000 + n), timestamp: n * 10000,
    startedAt: n * 10000 - 5000, durationMs: 5000,
    sessionId: 'session-a', deviceId: 'device-a', scope: 'device', matchId: `m${n}`,
    mode: 'classic', arenaId: 'classic-table', viewport: { width: 1280, height: 800, bucket: '1280x800' },
    online: false, practice: false, testData: false, playerCount: 1,
    winnerIndex: 0, winnerIds: ['p1'], players: [{ playerId: 'p1', displayName: 'Ada', playerIndex: 0, isAI: false }],
    participants: [{ playerId: 'p1', displayName: 'Ada', playerIndex: 0, seat: 0, isAI: false, flips: 3, makes: 2 }],
    winnerId: 'p1', winnerTeamId: null, winner: { playerIds: ['p1'], teamId: null }, teams: [],
    heatSummaries: [], roundSummaries: [], totalFlips: 3, eventCounts: {},
    startingSettings: { mode: 'classic', startingLives: 3 }, completionReason: 'completed',
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
  for (const name of [
    'f.u.c.k', 'f u c k', 'f--u--c--k', 'f.u.u.c.c.k', 'a.s.s', 'phuuck',
    'n1gg3r', 'nіggеr', 'n.і.g.g.е.r', 'nıgger', 'FÁGGÓT', 'f4gg0t',
    'fυck', 'fսck', 'cυnt', 'ѕ.h.і.t', 'h3ll',
  ]) {
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
  assert.deepEqual(await store.summary(), {
    flips: 1, makes: 1, misses: 0, makeRate: 1, makePercentage: 100,
    fraction: '1/1', sampleSize: 1, upright: 1, caps: 0, perfect: 0,
    bestStreak: 1, onFireRuns: 0, matches: 1, cups: 0, teamWins: 0,
    events: 0, averageFlightMs: 600, averageSettleMs: 100,
  });
  await store.close();
}

async function testCompleteRecordSchemasAndNestedPayloads() {
  const nestedFlip = flip(41, {
    heat: 2, round: 3, turn: 9, playerCount: 4, seat: 2,
    cosmeticId: 'sparkles', arenaId: 'moon-table',
    viewport: { width: 768, height: 1024, bucket: 'tablet-portrait', orientation: 'portrait', future: 'kept' },
    oddsProfile: 'mr-howe', eventSeed: 123, trajectorySeed: 456,
    contacts: 4, bounces: 2, banks: 1, flightMs: 1400, firstContactMs: 900, settleMs: 500,
    stakeBefore: 2, stakeAfter: 4, livesBefore: 5, livesAfter: 6,
    streakBefore: 2, streakAfter: 3, onFireBefore: false, onFireAfter: true,
    suddenDeathBefore: false, suddenDeathAfter: true,
    appliedReward: { type: 'life', amount: 1 }, appliedEffect: { target: 'self', kind: 'magnet' },
    performance: { fpsBucket: '45-54', frameTimeBucket: '20-24ms', slowFrameRateBucket: '1-5%' },
    futureField: { retained: true },
  });
  const normalized = Stats.normalizeFlipRecord({ sequence: 41, timestamp: 41000, payload: { record: nestedFlip } },
    { deviceId: 'other-device', sessionId: 'other-session' });
  for (const field of Stats.FLIP_RECORD_FIELDS) {
    assert.ok(Object.prototype.hasOwnProperty.call(normalized, field), `FlipRecordV1 missing ${field}`);
  }
  assert.equal(normalized.releaseVersion, 'v111');
  assert.deepEqual([normalized.heat, normalized.round, normalized.turn, normalized.playerCount, normalized.seat], [2, 3, 9, 4, 2]);
  assert.deepEqual([normalized.contacts, normalized.bounces, normalized.banks], [4, 2, 1]);
  assert.deepEqual([normalized.flightMs, normalized.firstContactMs, normalized.settleMs], [1400, 900, 500]);
  assert.deepEqual([normalized.stakeBefore, normalized.stakeAfter, normalized.livesBefore, normalized.livesAfter], [2, 4, 5, 6]);
  assert.deepEqual([normalized.streakBefore, normalized.streakAfter, normalized.onFireBefore, normalized.onFireAfter], [2, 3, false, true]);
  assert.deepEqual([normalized.suddenDeathBefore, normalized.suddenDeathAfter], [false, true]);
  assert.equal(normalized.viewport.future, 'kept');
  assert.equal(normalized.futureField.retained, true);
  assert.ok(Object.isFrozen(normalized) && Object.isFrozen(normalized.viewport) && Object.isFrozen(normalized.performance));

  const runtimeDerived = Stats.normalizeFlipRecord({ timestamp: 42000, sequence: 42, payload: {
    game: { format: 'classic', currentPlayerIndex: 0, players: [{ id: 'p1', name: 'Ada' }] },
    flick: { seed: 8675309, rareMultiplier: 10 },
    landing: { result: 'MAKE', firstContactMs: 825, settleMs: 175,
      eventReward: { additiveLives: 1 }, eventEffect: { magnet: true } },
  } }, { deviceId: 'device-a', sessionId: 'session-a' });
  assert.deepEqual([runtimeDerived.eventSeed, runtimeDerived.trajectorySeed], [8675309, 8675309],
    'the runtime seed populates both deterministic replay seeds');
  assert.equal(runtimeDerived.oddsProfile, 'mr-howe');
  assert.deepEqual([runtimeDerived.flightMs, runtimeDerived.firstContactMs, runtimeDerived.settleMs], [1000, 825, 175]);
  assert.deepEqual(runtimeDerived.appliedReward, { additiveLives: 1 });
  assert.deepEqual(runtimeDerived.appliedEffect, { magnet: true });
  const insanityDerived = Stats.normalizeFlipRecord({ timestamp: 43000, sequence: 43, payload: {
    game: { insanity: true }, flick: { seed: 12 }, landing: { result: 'MISS' },
  } }, { deviceId: 'device-a', sessionId: 'session-a' });
  assert.equal(insanityDerived.oddsProfile, 'insane');

  const matchRecord = match(7, {
    durationMs: 32100, playerCount: 2,
    participants: [
      { playerId: 'p1', displayName: 'Ada', seat: 0, isAI: false, objectId: 'bottle', variantId: 'bottle.blue-steel', cosmeticId: 'sparkles', flips: 5, makes: 3, future: 1 },
      { playerId: 'p2', displayName: 'CPU', seat: 1, isAI: true, objectId: 'coffee-mug', variantId: 'coffee-mug.red', cosmeticId: null, flips: 5, makes: 2 },
    ],
    winner: { playerIds: ['p1'], teamId: 'red', future: 'kept' }, winnerId: 'p1', winnerTeamId: 'red',
    teams: [{ teamId: 'red', score: 11 }, { teamId: 'blue', score: 8 }],
    heatSummaries: [{ heat: 1, winnerId: 'p1' }], roundSummaries: [{ round: 1, scores: [3, 1] }],
    totalFlips: 10, eventCounts: { 'heart-rush': 2 },
    startingSettings: { mode: 'team-clash', startingLives: 10, arenaId: 'slick-table' },
    completionReason: 'score-limit', futureMatchField: { retained: true },
  });
  const normalizedMatch = Stats.normalizeMatchRecord({ timestamp: 70000, payload: { match: { record: matchRecord } } },
    { deviceId: 'other-device', sessionId: 'other-session' });
  for (const field of Stats.MATCH_RECORD_FIELDS) {
    assert.ok(Object.prototype.hasOwnProperty.call(normalizedMatch, field), `MatchRecordV1 missing ${field}`);
  }
  assert.equal(normalizedMatch.uuid, matchRecord.uuid, 'payload.match.record identity is honored');
  assert.equal(normalizedMatch.durationMs, 32100);
  assert.equal(normalizedMatch.participants[0].future, 1);
  assert.equal(normalizedMatch.winner.future, 'kept');
  assert.equal(normalizedMatch.winnerTeamId, 'red');
  assert.equal(normalizedMatch.totalFlips, 10);
  assert.deepEqual(normalizedMatch.eventCounts, { 'heart-rush': 2 });
  assert.equal(normalizedMatch.startingSettings.arenaId, 'slick-table');
  assert.equal(normalizedMatch.completionReason, 'score-limit');
  assert.equal(normalizedMatch.futureMatchField.retained, true);
  assert.ok(Object.isFrozen(normalizedMatch) && Object.isFrozen(normalizedMatch.participants));
}

async function testCompleteFiltersAndRollupDimensions() {
  const human = Stats.normalizeFlipRecord(flip(51, {
    timestamp: Date.UTC(2026, 0, 1), mode: 'classic', seat: 0, playerId: 'human', isAI: false,
    objectId: 'bottle', variantId: 'bottle.blue-steel', cosmeticId: 'sparkles', arenaId: 'classic-table',
    eventId: 'heart-rush', playerCount: 2, viewport: { width: 1280, height: 800, bucket: '1280x800' },
  }), { deviceId: 'device-a', sessionId: 'session-a' });
  const cpuInput = flip(52, {
    timestamp: Date.UTC(2026, 0, 2), mode: 'cup', seat: 1, playerIndex: 1, playerId: 'cpu', isAI: true,
    objectId: 'coffee-mug', variantId: 'coffee-mug.red', cosmeticId: 'crown', arenaId: 'moon-table',
    eventId: 'plinko', playerCount: 4, viewport: { width: 768, height: 1024, bucket: 'tablet-portrait' },
    sessionId: 'session-b', deviceId: 'device-b',
  });
  cpuInput._importId = 'import-1';
  const cpu = Stats.normalizeFlipRecord(cpuInput, { deviceId: 'device-a', sessionId: 'session-a' });
  const data = { flips: [human, cpu], matches: [], rollups: [] };
  const one = [
    { mode: 'classic' }, { seat: 0 }, { playerId: 'human' }, { playerType: 'human' }, { human: true },
    { objectId: 'bottle' }, { variantId: 'bottle.blue-steel' }, { cosmeticId: 'sparkles' },
    { arenaId: 'classic-table' }, { eventId: 'heart-rush' }, { playerCount: 2 },
    { viewportBucket: '1280x800' }, { viewport: { width: 1280, height: 800 } },
    { dateFrom: '2026-01-01T00:00:00.000Z', dateTo: '2026-01-01T23:59:59.999Z' },
    { scope: 'device', currentDeviceId: 'device-a', currentSessionId: 'session-a' },
    { scope: 'session', currentDeviceId: 'device-a', currentSessionId: 'session-a' },
  ];
  for (const filter of one) {
    assert.equal(Stats.buildDatasets(data, filter).sequenceStrip.length, 1, `filter failed: ${JSON.stringify(filter)}`);
  }
  assert.equal(Stats.buildDatasets(data, { playerType: 'cpu' }).sequenceStrip[0].playerId, 'cpu');
  assert.equal(Stats.buildDatasets(data, { scope: 'import', currentDeviceId: 'device-a', currentSessionId: 'session-a' }).sequenceStrip[0].playerId, 'cpu');
  assert.equal(Stats.buildDatasets(data, { scopes: ['device', 'import'], currentDeviceId: 'device-a' }).sequenceStrip.length, 2);
  const rollup = Stats.aggregateRecords([human], { prefix: 'retention' })[0];
  assert.deepEqual(Object.keys(rollup.dimensions).sort(), [
    'arenaId','cosmeticId','day','deviceId','eventId','isAI','mode','objectId','online','playerCount',
    'playerId','result','scope','seat','sessionId','teamId','testData','variantId','viewportBucket',
  ], 'retention keys contain only contractually filterable categorical dimensions');
  assert.equal(rollup.counters.seats['0'], 1, 'bounded seat distribution detail is retained as a counter');
  assert.equal(rollup.flightMsTotal, human.flightMs);
  assert.equal(rollup.settleMsTotal, human.settleMs);
  const highCardinality = Array.from({ length: 1000 }, (_, index) => Stats.normalizeFlipRecord(flip(5000 + index, {
    timestamp: Date.UTC(2026, 0, 1) + index, eventSeed: index, trajectorySeed: index + 1,
    flightMs: 1000 + index, settleMs: 100 + index, turn: index, stakeAfter: index,
    mode: 'classic', objectId: 'bottle', eventId: null, result: 'MAKE', made: true,
  }), { deviceId: 'device-a', sessionId: 'session-a' }));
  assert.equal(Stats.aggregateRecords(highCardinality, { prefix: 'retention' }).length, 1,
    'per-flip IDs, seeds, timings, turn and mutable values cannot grow retention row cardinality');
  const countedMatch = match(53, { mode: 'cup', cup: { heats: [1, 0] },
    eventCounts: [{ eventId: 'plinko', count: 2 }] });
  assert.equal(Stats.buildDatasets({ flips: [], matches: [countedMatch], rollups: [] }, { eventId: 'plinko' })
    .cupTeam.cup.length, 1, 'array-form observed event counts participate in match filtering');
  assert.equal(Stats.aggregateSummary({ flips: [], matches: [countedMatch], rollups: [] }, { eventId: 'plinko' })
    .matches, 1);
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
    match(1, { mode: 'cup', cup: { heats: [0, 1, 0], shootoutRounds: 0 },
      heatSummaries: [{ heat: 1, winnerId: 'p1' }] }),
    match(2, { mode: 'team-clash', team: { scores: [11, 8] }, winnerTeamId: 'red',
      participants: [{ playerId: 'p2', displayName: 'CPU', seat: 1, isAI: true,
        objectId: 'coffee-mug', variantId: 'coffee-mug.red', cosmeticId: 'crown' }],
      players: [{ playerId: 'p2', displayName: 'CPU', seat: 1, isAI: true,
        objectId: 'coffee-mug', variantId: 'coffee-mug.red', cosmeticId: 'crown' }],
      teams: [{ teamId: 'red', score: 11 }], roundSummaries: [{ round: 1, scores: [3, 1] }] }),
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
  assert.equal(charts.livesStake.livesTimeline.length, 3);
  assert.equal(charts.livesStake.stakeTimeline.length, 3);
  assert.ok(charts.streaks.length && charts.streakTimeline.length === 3);
  assert.ok(charts.objects.length && charts.objectComparison === charts.objects);
  assert.deepEqual(charts.rotationLanding.rotations, charts.rotations);
  assert.equal(charts.cupTeam.cup.length, 1);
  assert.equal(charts.cupTeam.team.length, 1);
  assert.equal(charts.cupTeam.cupTimeline, charts.cupTeam.cup);
  assert.equal(charts.cupTeam.teamTimeline, charts.cupTeam.team);
  assert.equal(charts.cupTeam.cupTimeline[0].heatSummaries.length, 1);
  assert.equal(charts.cupTeam.teamTimeline[0].winnerTeamId, 'red');
  assert.equal(Stats.buildDatasets(data, { playerId: 'p1' }).cupTeam.cup.length, 1,
    'nested match players participate in filters');
  assert.equal(Stats.buildDatasets(data, { playerType: 'cpu', variantId: 'coffee-mug.red' }).cupTeam.team.length, 1);
  assert.ok(!JSON.stringify(charts).includes('normalDenominator'));

  const testData = { flips: records.concat([flip(90, {
    eventId: 'life-drain', forced: true, testData: true, result: 'MAKE', made: true,
  })]), matches, rollups: [] };
  const withTests = Stats.buildDatasets(testData, { includeTestData: true });
  assert.ok(!JSON.stringify(withTests).includes('life-drain'),
    'including Test Data does not disclose a forced event name by default');
  assert.ok(JSON.stringify(Stats.buildDatasets(testData, {
    includeTestData: true, includeTestEventNames: true,
  })).includes('life-drain'), 'internal QA can explicitly request forced-event labels');
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
  assert.ok(!named.includes('HYPERLINK') && named.includes('Player'),
    'explicit named CSV still consumes NamePolicy and never persists a rejected value');
  assert.ok(named.includes('"releaseVersion"') && named.includes('"stakeBefore"') && named.includes('"performance"'));
  const pseudoMatch = await imported.exportCSV('match', { includeTestData: true });
  assert.ok(!pseudoMatch.includes('"Ada"') && !pseudoMatch.includes('"p1"'), 'match participant data is pseudonymized');
  const namedMatch = await imported.exportCSV('match', { includeNames: true, includeTestData: true });
  assert.ok(namedMatch.includes('Ada') && namedMatch.includes('"completionReason"'));
  for (const type of ['match', 'player', 'event']) {
    const output = await imported.exportCSV(type, { includeTestData: true });
    assert.ok(output.includes('\r\n') || output.startsWith('"'), `${type} CSV is produced`);
  }
  const malicious = '{"schema":"FlipStatsExportV1","version":1,"flips":[{"__proto__":{"polluted":true}}],"matches":[],"rollups":[]}';
  assert.throws(() => Stats.parseImportJSON(malicious), /Unsafe/);
  assert.equal({}.polluted, undefined);
  await original.close(); await imported.close();

  const rolled = Stats.createStore({ backend: Stats.createMemoryBackend(), maxRawFlips: 1,
    deviceId: 'roll-device', sessionId: 'roll-session' });
  await rolled.recordFlip(flip(61, { cosmeticId: 'sparkles', arenaId: 'moon-table' }));
  await rolled.recordFlip(flip(62, { cosmeticId: 'crown', arenaId: 'slick-table' }));
  const rolledJSON = await rolled.exportJSON({ exportedAt: 999, includeTestData: true });
  const rolledImport = Stats.createStore({ backend: Stats.createMemoryBackend(), maxRawFlips: 10,
    deviceId: 'destination', sessionId: 'destination' });
  await rolledImport.importJSON(rolledJSON);
  assert.deepEqual(JSON.parse(await rolledImport.exportJSON({ exportedAt: 999, includeTestData: true })),
    JSON.parse(rolledJSON), 'expanded rollup dimensions survive lossless JSON roundtrip');
  assert.equal((await rolledImport.summary({ includeTestData: true })).flips, 2);
  await rolled.close(); await rolledImport.close();
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
  assert.equal(saved.rollups.filter((row) => row.schema === 'FlipAggregateV1')
    .reduce((n, row) => n + row.flips, 0), 21);
  assert.ok(store.getErrors().some((error) => /Injected transaction/.test(error.message)));
  await store.close();

  const firstFallback = Stats.createStore({ indexedDB: null, localStorage: storage, deviceId: 'device-a', sessionId: 'fallback-1' });
  await firstFallback.recordFlip(flip(9, { sessionId: 'fallback-1' }));
  await firstFallback.recordMatch(match(9, { sessionId: 'fallback-1', mode: 'cup', cup: { heats: [2, 1] } }));
  const beforeReload = await firstFallback.summary({ includeTestData: true });
  assert.ok(firstFallback.getWarning());
  let warned = false;
  firstFallback.onWarning((notice) => { warned = notice.code === 'stats-storage-fallback'; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(warned, true, 'fallback warning API is non-blocking and observable');
  await firstFallback.close();
  const secondFallback = Stats.createStore({ indexedDB: null, localStorage: storage, deviceId: 'device-a', sessionId: 'fallback-2' });
  assert.equal(secondFallback.usingFallback(), true);
  assert.deepEqual(await secondFallback.summary({ includeTestData: true }), beforeReload,
    'aggregate-only local fallback preserves flip totals and matches over reload without double-counting');
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
  await testCompleteRecordSchemasAndNestedPayloads();
  await testCompleteFiltersAndRollupDimensions();
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
