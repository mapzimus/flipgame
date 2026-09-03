#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadGame() {
  const context = vm.createContext({ console });
  const source = fs.readFileSync(path.join(root, 'js', 'game.js'), 'utf8') +
    '\nthis.__game = game; this.__states = GAME_STATES;';
  vm.runInContext(source, context, { filename: 'js/game.js' });
  context.__game.callbacks = {};
  return context.__game;
}

function players(count) {
  return Array.from({ length: count }, (_, i) => ({
    name: `Player ${i + 1}`,
    color: '#0b86ff',
    isAI: false,
  }));
}

function igniteInSuddenDeath(game, startingLives = 20) {
  game.init(players(8), 1, { startingLives });
  game.callbacks = {};
  game.turnCounter = 70;
  game.currentPlayer().streak = 2;
  game.currentPlayer().isHeatingUp = true;
  game.resolveFlip('MAKE');
  assert.equal(game.currentPlayer().isOnFire, true);
  assert.equal(game.sdLevel(), 1);
}

function testSuddenDeathFireMissIsFree() {
  const game = loadGame();
  igniteInSuddenDeath(game);
  const player = game.currentPlayer();

  game.resolveFlip('MAKE');
  game.resolveFlip('MAKE');
  assert.equal(player.lives, 22, 'ON FIRE makes must add lives during sudden death');
  assert.equal(game.onFireBonus, 2);
  assert.equal(game.missWouldEliminate(), false, 'ON FIRE miss must never predict elimination');

  game.resolveFlip('MISS');
  assert.equal(player.lives, 22, 'ending an ON FIRE run must not remove lives');
  assert.equal(player.eliminated, false);
  assert.equal(game.lastPenalty, 0);
  assert.equal(game.fireEnded, true);
}

function testLifeCeilingScalesWithStartingLives() {
  const game = loadGame();
  for (const [startingLives, expectedCap] of [[3, 5], [5, 8], [10, 15], [20, 30], [100, 150]]) {
    game.init(players(2), 1, { startingLives });
    assert.equal(game.maxLives, expectedCap,
      `${startingLives} starting lives must use the 1.5× whole-life ceiling`);
  }
}

function testEightPlayerFireUsesMatchCeiling() {
  const game = loadGame();
  game.init(players(8), 1, { startingLives: 100 });
  game.callbacks = {};
  game.currentPlayer().streak = 2;
  game.currentPlayer().isHeatingUp = true;
  game.resolveFlip('MAKE');
  const player = game.currentPlayer();

  for (let i = 0; i < 5; i++) game.resolveFlip('MAKE');
  assert.equal(player.lives, 105);
  assert.equal(player.isOnFire, true, 'an eight-player fire run must not stop at +5');
  assert.equal(game.fireCapped, false);

  for (let i = 0; i < 45; i++) game.resolveFlip('MAKE');
  assert.equal(player.lives, 150);
  assert.equal(game.endedFireBonus, 50);
  assert.equal(game.fireCapped, true);
  assert.equal(player.isOnFire, false);
  assert.equal(player.eliminated, false);
}

function testOrdinarySuddenDeathPenaltyRemains() {
  const game = loadGame();
  game.init(players(8), 1, { startingLives: 3 });
  game.callbacks = {};
  game.turnCounter = 70;
  game.resolveFlip('MISS');
  assert.equal(game.currentPlayer().lives, 2);
  assert.equal(game.lastPenalty, 1);
}

function testCoreRulesStayStable() {
  const game = loadGame();
  game.init(players(3), 1, { startingLives: 5 });
  game.callbacks = {};

  game.resolveFlip('MAKE');
  assert.equal(game.pointCount, 1, 'an ordinary make adds one to the communal stake');
  game.advanceTurn();
  assert.equal(game.currentPlayerIndex, 1, 'turns continue in the selected direction');

  game.resolveFlip('MAKE', { onCap: true });
  assert.equal(game.pointCount, 3, 'a cap make remains worth two stake points');
  game.advanceTurn();
  game.resolveFlip('MISS');
  assert.equal(game.players[2].lives, 2, 'a normal miss spends the full stake');
  assert.equal(game.pointCount, 0, 'a normal miss resets the stake');
}

function testForfeitCleansOnFireState() {
  const game = loadGame();
  const defs = players(3).map((p, i) => ({ ...p, netId: `peer-${i}` }));
  game.init(defs, 1, { startingLives: 5 });
  game.callbacks = {};
  const leaving = game.players[1];
  leaving.isOnFire = true;
  game.onFirePlayer = leaving;
  game.onFireBonus = 4;

  assert.equal(game.forfeitPlayer('peer-1', 'left'), true);
  assert.equal(leaving.eliminated, true);
  assert.equal(leaving.isOnFire, false);
  assert.equal(game.onFirePlayer, null);
  assert.equal(game.onFireBonus, 0);
}

function testPlinkoRewards() {
  const game = loadGame();
  game.init(players(4), 1, { startingLives: 3 });
  game.callbacks = {};
  game.players[0].lives = 7;
  game.players[1].lives = 9;
  game.players[2].lives = 2;
  game.players[3].lives = 1;

  game.resolvePlinko('double');
  assert.equal(game.players[0].lives, 14, 'outer Plinko slot must double the flipper');
  assert.equal(game.maxLives, 5, 'multipliers must not raise the additive reward ceiling');

  game.resolvePlinko('halve');
  assert.deepEqual(game.players.slice(1).map((p) => p.lives), [4, 1, 0]);
  assert.equal(game.players[3].eliminated, true, 'halving one life rounds down and eliminates');
  assert.equal(game.players[0].lives, 14, 'halving must not affect the flipper');

  const jackpot = loadGame();
  jackpot.init(players(4), 1, { startingLives: 3 });
  jackpot.callbacks = {};
  jackpot.resolvePlinko('win');
  assert.deepEqual(jackpot.players.map((p) => p.eliminated), [false, true, true, true]);

  const magnet = loadGame();
  magnet.init(players(3), 1, { startingLives: 3 });
  magnet.callbacks = {};
  magnet.resolvePlinko('magnet');
  assert.equal(magnet.players[0].alwaysMagnet, true,
    'Always Magnet must remain attached to the player for the match');
  magnet.advanceTurn();
  magnet.advanceTurn();
  assert.equal(magnet.players[0].alwaysMagnet, true, 'turn rotation must not clear Always Magnet');

  const loss = loadGame();
  loss.init(players(4), 1, { startingLives: 3 });
  loss.callbacks = {};
  loss.resolvePlinko('lose');
  assert.equal(loss.lastResult, 'MISS');
  assert.equal(loss.players[0].eliminated, true, 'automatic-loss slot must eliminate the flipper');
  assert.equal(loss.justEliminated, true);
}

function testHeartRushReward() {
  const game = loadGame();
  game.init(players(4), 1, { startingLives: 10 });
  game.callbacks = {};
  game.resolveFlip('MAKE', { rareEvent: 'heart-rush' });
  assert.equal(game.currentPlayer().lives, 13);
  assert.equal(game.rareLifeGain, 3);

  game.currentPlayer().lives = 14;
  game.resolveFlip('MAKE', { rareEvent: 'heart-rush' });
  assert.equal(game.currentPlayer().lives, 15, 'Heart Rush must stop at the 1.5× ceiling');
  assert.equal(game.rareLifeGain, 1, 'the HUD must show the lives actually awarded');

  game.resolveFlip('MISS', { rareEvent: 'heart-rush' });
  assert.equal(game.rareLifeGain, 0, 'Heart Rush only rewards a successful landing');
}

function testDoubleFlipCompoundReward() {
  const game = loadGame();
  game.init(players(4), 1, { startingLives: 5 });
  game.callbacks = {};
  game.players[0].lives = 5;
  game.players[1].lives = 9;
  game.players[2].lives = 2;
  game.players[3].lives = 1;

  game.resolveFlip('MAKE', { rareEvent: 'double-flip', onCap: true });
  assert.equal(game.players[0].lives, 10, 'Double Flip must double the flipper');
  assert.equal(game.maxLives, 8, 'Double Flip must not raise the additive reward ceiling');
  assert.deepEqual(game.players.slice(1).map((p) => p.lives), [4, 1, 0]);
  assert.equal(game.players[3].eliminated, true, 'halving one life must eliminate');
  assert.equal(game.pointCount, 2, 'a Double Flip cap landing still earns cap stake value');
  assert.equal(game.doubleFlipReward, true);

  const miss = loadGame();
  miss.init(players(3), 1, { startingLives: 5 });
  miss.callbacks = {};
  miss.resolveFlip('MISS', { rareEvent: 'double-flip' });
  assert.deepEqual(miss.players.map((p) => p.lives), [5, 5, 5],
    'a failed Double Flip must not apply the compound reward');

  const fire = loadGame();
  igniteInSuddenDeath(fire, 3);
  fire.resolveFlip('MAKE', { rareEvent: 'double-flip' });
  assert.equal(fire.players[0].lives, 8,
    'an ON FIRE Double Flip must add its fire life, then double the total');
  assert.deepEqual(fire.players.slice(1).map((p) => p.lives), [1, 1, 1, 1, 1, 1, 1]);
  assert.equal(fire.maxLives, 5);
  assert.equal(fire.players[0].isOnFire, false,
    'an ON FIRE multiplier above the additive ceiling must pass the turn gracefully');
}

function testLifeDrainReward() {
  const game = loadGame();
  game.init(players(4), 1, { startingLives: 10 });
  game.callbacks = {};
  game.players[0].lives = 7;
  game.players[1].lives = 18;
  game.players[2].lives = 2;
  game.players[3].lives = 1;
  game.resolveFlip('MAKE', { rareEvent: 'life-drain' });
  assert.equal(game.players[0].lives, 7, 'Life Drain must not change the flipper');
  assert.deepEqual(game.players.slice(1).map((p) => p.lives), [1, 1, 1]);
  assert.equal(game.lifeDrainTriggered, true);
  assert.equal(game.lifeDrainActive, true, 'Life Drain tint must persist for the match');
}

function loadPhysics() {
  const window = { matchMedia: () => ({ matches: false }) };
  const context = vm.createContext({ console, window, Math });
  const matterSource = fs.readFileSync(path.join(root, 'js', 'vendor', 'matter.min.js'), 'utf8');
  vm.runInContext(matterSource, context, { filename: 'js/vendor/matter.min.js' });
  const source = fs.readFileSync(path.join(root, 'js', 'physics.js'), 'utf8') +
    '\nthis.__physics = Physics;';
  vm.runInContext(source, context, { filename: 'js/physics.js' });
  return context.__physics;
}

function testLandingVerdictsRequireRealSettle() {
  const physics = loadPhysics();
  physics.init(1280, 800);
  physics.setPlinkoEnabled(false);
  let settledVerdicts = 0;
  const reasons = {};

  for (let seed = 1; seed <= 24; seed++) {
    physics.resetBottle();
    physics.applyFlick(0, -2500, seed);
    let groundedFrames = 0;
    let verdict = null;
    for (let frame = 0; frame < 900 && !verdict; frame++) {
      physics.step(1 / 60);
      const bottle = physics.getBottle();
      const grounded = bottle.bounds.max.y >= physics.getGroundY() - 6;
      groundedFrames = grounded ? groundedFrames + 1 : 0;
      verdict = physics.checkLanding();
      if (verdict) {
        const info = physics.getLastLandingInfo();
        reasons[info && info.reason] = (reasons[info && info.reason] || 0) + 1;
        // Timeout is an intentional off-world/perpetual-motion failsafe, not a
        // pose judgment. Every pose-based MAKE/MISS must meet the settle gates.
        if (info && info.reason === 'timeout') continue;
        settledVerdicts++;
        const angularSpeed = Math.abs(bottle.angularVelocity);
        const linearSpeed = Math.hypot(bottle.velocity.x, bottle.velocity.y);
        assert.ok(groundedFrames >= 30, `seed ${seed} judged after only ${groundedFrames} grounded frames`);
        assert.ok(angularSpeed < 0.010, `seed ${seed} judged while angular speed=${angularSpeed}`);
        assert.ok(linearSpeed < 7, `seed ${seed} judged while linear speed=${linearSpeed}`);
      }
    }
    assert.ok(verdict, `seed ${seed} did not reach a verdict`);
  }
  assert.equal(reasons.timeout || 0, 0,
    `normal seeded flips must settle without the timeout failsafe (${JSON.stringify(reasons)})`);
  assert.equal(settledVerdicts, 24,
    `only ${settledVerdicts} seeds produced pose verdicts (${JSON.stringify(reasons)})`);
}

function testLongPlinkoBoardResolves() {
  const physics = loadPhysics();
  physics.init(1280, 800);
  const prizes = new Set();

  for (let seed = 1; seed <= 12; seed++) {
    physics.resetBottle();
    physics.forcePlinko();
    physics.applyFlick(0, -2500, seed);
    const board = physics.getPlinko();
    assert.deepEqual(Array.from(board.slots, (slot) => slot.kind),
      ['double', 'halve', 'magnet', 'lose', 'win', 'lose', 'magnet', 'halve', 'double'],
      'Plinko must expose the exact symmetric nine-slot reward layout');
    assert.ok(board.bottom - board.top > 900, 'Plinko board must provide a long drop');
    assert.equal(new Set(board.pegs.map((p) => p.y)).size, 8, 'Plinko board must have eight peg rows');
    const launchView = physics.getViewHint();
    assert.equal(launchView.tracking, 'plinko');
    assert.ok(launchView.zoom >= 0.68, `Plinko follow-cam zoomed out to ${launchView.zoom}`);
    assert.equal(launchView.camX, physics.getBottle().position.x);
    assert.equal(launchView.camY, physics.getBottle().position.y + 20);

    let verdict = null;
    for (let frame = 0; frame < 3000 && !verdict; frame++) {
      physics.step(1 / 60);
      verdict = physics.checkLanding();
    }
    const info = physics.getLastLandingInfo();
    assert.equal(info.reason, 'plinko');
    assert.ok(['double', 'halve', 'magnet', 'lose', 'win'].includes(info.plinko));
    assert.equal(verdict, info.plinko === 'lose' ? 'MISS' : 'MAKE',
      `Plinko seed ${seed} returned the wrong automatic verdict`);
    const finishView = physics.getViewHint();
    const visibleBottom = finishView.camY + 800 / (2 * finishView.zoom);
    assert.ok(visibleBottom >= board.bottom,
      `Plinko reward bins are below the tracked frame (${visibleBottom} < ${board.bottom})`);
    prizes.add(info.plinko);
  }
  assert.ok(prizes.size >= 2, 'seeded Plinko simulation should exercise multiple prize types');
}

function testInsanityEventDistribution() {
  const physics = loadPhysics();
  const counts = new Map();
  let eventCount = 0;
  const samples = 180000;
  for (let seed = 1; seed <= samples; seed++) {
    const event = physics.insanityEventForSeed(seed);
    if (!event) continue;
    eventCount++;
    counts.set(event, (counts.get(event) || 0) + 1);
  }
  assert.ok(eventCount / samples > 0.325 && eventCount / samples < 0.342,
    `Insanity event rate must stay near 1/3 (got ${eventCount}/${samples})`);
  assert.equal(counts.has('life-drain'), false, 'Insanity must exclude Life Drain');

  const ordinaryIds = [
    'heart-rush', 'magnet', 'double-flip', 'wind-tunnel', 'trampoline',
    'gravity-slam', 'ice-slide', 'alien-invasion', 'moon-gravity', 'power-launch', 'rainbow-trail',
  ];
  const ordinaryCounts = ordinaryIds.map((id) => counts.get(id) || 0);
  const ordinaryMean = ordinaryCounts.reduce((sum, value) => sum + value, 0) / ordinaryCounts.length;
  for (let i = 0; i < ordinaryIds.length; i++) {
    assert.ok(Math.abs(ordinaryCounts[i] - ordinaryMean) / ordinaryMean < 0.06,
      `${ordinaryIds[i]} is not equally weighted in Insanity`);
  }
  const plinkoRatio = (counts.get('plinko') || 0) / ordinaryMean;
  assert.ok(plinkoRatio > 1.17 && plinkoRatio < 1.33,
    `Plinko should be only slightly more likely (ratio=${plinkoRatio.toFixed(3)})`);

  physics.init(1280, 800);
  physics.setPlinkoEnabled(true);
  let eventSeed = null;
  for (let seed = 1; seed < 1000 && eventSeed == null; seed++) {
    if (physics.insanityEventForSeed(seed)) eventSeed = seed;
  }
  physics.applyFlick(0, -2500, eventSeed, 1, 'insanity');
  const expected = physics.insanityEventForSeed(eventSeed);
  const actual = physics.getLastFlickInfo();
  assert.equal(actual.plinko ? 'plinko' : actual.rareEvent, expected,
    'Insanity selection must drive the actual flick event');
}

function testRareEventLadder() {
  const physics = loadPhysics();
  const ids = [
    'rainbow-trail', 'power-launch', 'moon-gravity', 'ice-slide', 'gravity-slam',
    'alien-invasion', 'trampoline', 'wind-tunnel', 'double-flip', 'magnet', 'heart-rush', 'life-drain',
  ];
  const found = new Map();
  for (let seed = 1; seed < 100000 && found.size < ids.length; seed++) {
    const id = physics.rareEventForSeed(seed);
    if (id && !found.has(id)) found.set(id, seed);
  }
  assert.deepEqual([...found.keys()].sort(), ids.slice().sort());
  for (const [id, seed] of found) {
    assert.equal(physics.rareEventForSeed(seed), id);
    assert.equal(physics.rareEventForSeed(seed, true), null, 'Plinko must suppress every other rare event');
  }

  physics.init(1280, 800);
  physics.setPlinkoEnabled(false);
  for (const [id, seed] of found) {
    physics.resetBottle();
    physics.applyFlick(0, -2500, seed);
    assert.equal(physics.getLastFlickInfo().rareEvent, id);
    if (id === 'power-launch') {
      assert.ok(Math.abs(physics.getBottle().velocity.y) > 24,
        'Power Launch must produce a visibly stronger vertical launch');
      assert.ok(Math.abs(physics.getBottle().angularVelocity) > 0.21,
        'Power Launch must produce visibly stronger spin');
    }
    const startX = physics.getBottle().position.x;
    let previousVy = physics.getBottle().velocity.y;
    let upwardReversals = 0;
    let strongestRebound = 0;
    let reboundStartY = null;
    let reboundPeakY = Infinity;
    let maxDrift = 0;
    let maxLateralSpeed = 0;
    let verdict = null;
    for (let frame = 0; frame < 1600 && !verdict; frame++) {
      physics.step(1 / 60);
      const bottle = physics.getBottle();
      if (previousVy > 0.5 && bottle.velocity.y < -1) {
        upwardReversals++;
        strongestRebound = Math.max(strongestRebound, -bottle.velocity.y);
        if (reboundStartY === null) reboundStartY = bottle.position.y;
      }
      previousVy = bottle.velocity.y;
      if (reboundStartY !== null) reboundPeakY = Math.min(reboundPeakY, bottle.position.y);
      maxDrift = Math.max(maxDrift, Math.abs(bottle.position.x - startX));
      maxLateralSpeed = Math.max(maxLateralSpeed, Math.abs(bottle.velocity.x));
      verdict = physics.checkLanding();
    }
    assert.ok(verdict, `${id} did not reach a verdict`);
    assert.ok(!['timeout', 'alien-timeout'].includes(physics.getLastLandingInfo().reason),
      `${id} used the timeout fallback`);
    if (id === 'trampoline' || id === 'double-flip') {
      assert.ok(upwardReversals >= 1, `${id} never produced its second aerial arc`);
    }
    if (id === 'trampoline') {
      assert.ok(strongestRebound >= 23,
        `trampoline rebound was only ${strongestRebound.toFixed(1)} velocity units`);
      assert.ok(reboundStartY - reboundPeakY > 350,
        `trampoline second launch rose only ${(reboundStartY - reboundPeakY).toFixed(1)}px`);
    }
    if (id === 'wind-tunnel') {
      assert.ok(maxDrift > 150, `wind tunnel only moved ${maxDrift.toFixed(1)}px sideways`);
      assert.ok(maxLateralSpeed > 5,
        `wind tunnel lateral speed only reached ${maxLateralSpeed.toFixed(1)}`);
    }
    if (id === 'double-flip') {
      assert.equal(verdict, 'MAKE', 'the tuned Double Flip sweet-spot throw should be landable');
      assert.ok(physics.getLastLandingInfo().rotations >= 2,
        `Double Flip only rotated ${physics.getLastLandingInfo().rotations.toFixed(2)} times`);
    }
    if (id === 'ice-slide') {
      assert.ok(maxLateralSpeed > 18,
        `Ice Slide lateral speed only reached ${maxLateralSpeed.toFixed(1)}`);
      assert.ok(maxDrift > 400, `Ice Slide only travelled ${maxDrift.toFixed(1)}px`);
    }
    if (id === 'moon-gravity') assert.equal(physics.getLastFlickInfo().gravityScale, 0.28);
    if (id === 'gravity-slam') assert.equal(physics.getLastFlickInfo().gravityScale, 2.55);
    if (id === 'alien-invasion') {
      assert.equal(physics.getLastFlickInfo().gravityScale, 0.08);
      assert.equal(physics.getTarget().style, 'portal');
    }
  }
}

function testMrHoweTenfoldOdds() {
  const physics = loadPhysics();
  let normal = 0;
  let boosted = 0;
  for (let seed = 1; seed <= 100000; seed++) {
    if (physics.rareEventForSeed(seed)) normal++;
    if (physics.rareEventForSeed(seed, false, 10)) boosted++;
  }
  assert.ok(boosted > normal * 6,
    `10× mode should be dramatically more frequent (normal=${normal}, boosted=${boosted})`);
  assert.ok(boosted < normal * 12,
    `10× mode unexpectedly exceeded its intended range (normal=${normal}, boosted=${boosted})`);

  physics.init(1280, 800);
  physics.resetBottle();
  physics.applyFlick(0, -2500, 23, 1);
  assert.equal(physics.getLastFlickInfo().plinko, false);
  physics.resetBottle();
  physics.applyFlick(0, -2500, 23, 10);
  assert.equal(physics.getLastFlickInfo().plinko, true,
    '10× mode must change Plinko from 1/1000 to 1/100');
}

function testLifeDrainMagnetMakes() {
  const physics = loadPhysics();
  physics.init(1280, 800);
  physics.setPlinkoEnabled(false);
  for (const power of [1800, 2500, 3300, 4000]) {
    for (let seed = 1; seed <= 12; seed++) {
      physics.resetBottle();
      physics.forceSpecialEvent('life-drain');
      physics.applyFlick(seed % 2 ? 900 : -900, -power, seed);
      let verdict = null;
      for (let frame = 0; frame < 1200 && !verdict; frame++) {
        physics.step(1 / 60);
        verdict = physics.checkLanding();
      }
      assert.equal(verdict, 'MAKE',
        `Life Drain magnet missed for power ${power}, seed ${seed}: ${JSON.stringify(physics.getLastLandingInfo())}`);
      assert.notEqual(physics.getLastLandingInfo().reason, 'timeout');
    }
  }
}

function testExtremeEventsStayPlayable() {
  const events = [
    'rainbow-trail', 'power-launch', 'moon-gravity', 'ice-slide',
    'gravity-slam', 'alien-invasion', 'trampoline', 'wind-tunnel',
    'double-flip', 'magnet', 'heart-rush',
  ];
  for (const event of events) {
    const physics = loadPhysics();
    physics.init(1280, 800);
    physics.setPlinkoEnabled(false);
    let makes = 0;
    for (let seed = 1; seed <= 20; seed++) {
      physics.resetBottle();
      physics.forceSpecialEvent(event);
      physics.applyFlick(seed % 2 ? 350 : -350, -2500, seed);
      let verdict = null;
      for (let frame = 0; frame < 1800 && !verdict; frame++) {
        physics.step(1 / 60);
        verdict = physics.checkLanding();
      }
      assert.ok(verdict, `${event} seed ${seed} never resolved`);
      assert.ok(!String(physics.getLastLandingInfo().reason).includes('timeout'),
        `${event} seed ${seed} depended on a timeout`);
      if (verdict === 'MAKE') makes++;
    }
    assert.ok(makes >= 14,
      `${event} became a disguised automatic miss (${makes}/20 standard throws made)`);
  }
}

function testForcedSpecialEvents() {
  const physics = loadPhysics();
  physics.init(1280, 800);
  physics.setPlinkoEnabled(false);
  const events = [
    'plinko', 'rainbow-trail', 'power-launch', 'moon-gravity', 'ice-slide',
    'gravity-slam', 'alien-invasion', 'trampoline', 'wind-tunnel', 'double-flip', 'magnet',
    'heart-rush', 'life-drain',
  ];

  for (const event of events) {
    physics.resetBottle();
    assert.equal(physics.forceSpecialEvent(event), true);
    // Seed 123 naturally rolls Plinko. A specifically forced rare event must
    // still win, making the Mr. Howe picker reliable for all six outcomes.
    physics.applyFlick(0, -2500, 123);
    const info = physics.getLastFlickInfo();
    assert.equal(info.plinko, event === 'plinko', `${event} selected the wrong Plinko state`);
    assert.equal(info.rareEvent, event === 'plinko' ? null : event);
  }
  assert.equal(physics.forceSpecialEvent('not-an-event'), false);

  physics.resetBottle();
  physics.forceSpecialEvent('rainbow-trail');
  physics.applyFlick(0, -2500, 44, 1, 'normal', true);
  const persistent = physics.getLastFlickInfo();
  assert.equal(persistent.rareEvent, 'rainbow-trail');
  assert.equal(persistent.alwaysMagnet, true,
    'permanent magnet must stack with a later special event');
}

testSuddenDeathFireMissIsFree();
testLifeCeilingScalesWithStartingLives();
testEightPlayerFireUsesMatchCeiling();
testOrdinarySuddenDeathPenaltyRemains();
testCoreRulesStayStable();
testForfeitCleansOnFireState();
testPlinkoRewards();
testHeartRushReward();
testDoubleFlipCompoundReward();
testLifeDrainReward();
testLandingVerdictsRequireRealSettle();
testLongPlinkoBoardResolves();
testInsanityEventDistribution();
testRareEventLadder();
testMrHoweTenfoldOdds();
testLifeDrainMagnetMakes();
testExtremeEventsStayPlayable();
testForcedSpecialEvents();
console.log('Regression tests passed.');
