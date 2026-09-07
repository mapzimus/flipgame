'use strict';

const assert = require('node:assert/strict');
const Events = require('../js/v112-events.js');

function findSeed(predicate, limit = 1000000) {
  for (let seed = 0; seed < limit; seed += 1) {
    const selected = Events.select({ activityId: 'free-play', physicsModeId: 'normal', seed });
    if (predicate(selected)) return seed;
  }
  throw new Error('No matching seed found');
}

function testCatalog() {
  assert.equal(Events.definitions.length, 30);
  assert.equal(new Set(Events.definitions.map((entry) => entry.id)).size, 30);
  assert.deepEqual([...new Set(Events.definitions.map((entry) => entry.eventClass))].sort(),
    ['assist', 'hazard', 'wildcard']);
  assert.equal(Events.definitions.filter((entry) => entry.automatic).map((entry) => entry.id).join(), 'plinko');
  assert(Events.definitions.filter((entry) => entry.id !== 'plinko').every((entry) => entry.fallible));
  assert.equal(Events.get('life-drain').insaneEligible, false);
  assert.equal(Events.get('plinko').insaneWeight, 1.25);
  assert.equal(Events.plinkoSlots.length, 9);
}

function testForceAndSuppression() {
  const forced = Events.select({ activityId: 'practice', physicsModeId: 'normal',
    forceName: 'Wind Tunnel', seed: 4 });
  assert.equal(forced.eventId, 'wind-tunnel');
  assert.equal(forced.testData, true);
  assert.equal(Events.forcedId('Wind Tunnel', 'free-play'), null);
  assert.equal(Events.forcedId('wind tunnel', 'practice'), null, 'force names are exact allowlisted names');
  assert.throws(() => Events.select({ activityId: 'practice', forceName: 'wind tunnel', seed: 1 }),
    /Unknown forced event/);
  assert.equal(Events.select({ activityId: 'free-play', formatId: 'battle', seed: 1 }), null);
  assert.equal(Events.select({ activityId: 'story', physicsModeId: 'alien', seed: 1 }), null);
  assert.equal(Events.select({ activityId: 'free-play', copiedFlip: true, seed: 1 }), null);
  assert.equal(Events.select({ activityId: 'free-play', arenaDraft: true, seed: 1 }), null);
}

function testExactMrHoweAndInsanePolicy() {
  let normalCount = 0, boostedCount = 0, wrongCaseCount = 0;
  const insaneCounts = Object.create(null);
  const total = 180000;
  for (let seed = 0; seed < total; seed += 1) {
    if (Events.select({ activityId: 'free-play', seed })) normalCount += 1;
    if (Events.select({ activityId: 'free-play', playerName: 'Mr. Howe', seed })) boostedCount += 1;
    if (Events.select({ activityId: 'free-play', playerName: 'mr. howe', seed })) wrongCaseCount += 1;
    const insane = Events.select({ activityId: 'free-play', physicsModeId: 'insane',
      playerName: 'Mr. Howe', seed });
    if (insane) insaneCounts[insane.eventId] = (insaneCounts[insane.eventId] || 0) + 1;
  }
  assert.equal(wrongCaseCount, normalCount);
  assert(boostedCount > normalCount * 9.5 && boostedCount < normalCount * 10.5);
  assert.equal(insaneCounts['life-drain'], undefined);
  const ordinaryMean = Object.entries(insaneCounts).filter(([id]) => id !== 'plinko')
    .reduce((sum, [, count]) => sum + count, 0) / 28;
  assert(insaneCounts.plinko > ordinaryMean * 1.18 && insaneCounts.plinko < ordinaryMean * 1.32);
}

function testPrelaunchBindingLifecycle() {
  const seed = findSeed((selection) => !!selection);
  const controller = Events.createTurnController();
  const binding = controller.bind({ activityId: 'free-play', seed });
  assert(binding);
  assert.equal(controller.phase(0), 'named');
  assert.equal(controller.phase(200), 'mechanic-visible');
  assert.equal(controller.phase(500), 'instruction');
  assert.equal(controller.canAcceptInput(899), false);
  assert.equal(controller.canAcceptInput(900), true);
  assert.equal(controller.cancelGesture(), binding, 'cancelled input retains its already-bound event');
  assert.equal(controller.snapshot().qualified, false);
  const consumed = controller.qualifyLaunch();
  assert.equal(consumed.consumed, true);
  assert.throws(() => controller.qualifyLaunch(), /already consumed/);
  controller.clear();
  assert.equal(controller.snapshot().binding, null);
  const emptySeed = findSeed((selection) => !selection);
  const empty = Events.createTurnController();
  assert.equal(empty.bind({ activityId: 'free-play', seed: emptySeed }), null);
  assert.throws(() => empty.bind({ activityId: 'free-play', seed: emptySeed + 1 }), /already bound/);
}

function run() {
  testCatalog();
  testForceAndSuppression();
  testExactMrHoweAndInsanePolicy();
  testPrelaunchBindingLifecycle();
  console.log('v1.12 event contract tests passed.');
}

run();
