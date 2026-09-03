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

function igniteInSuddenDeath(game) {
  game.init(players(8), 1, { startingLives: 3 });
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
  assert.equal(player.lives, 5, 'ON FIRE makes must add lives during sudden death');
  assert.equal(game.onFireBonus, 2);
  assert.equal(game.missWouldEliminate(), false, 'ON FIRE miss must never predict elimination');

  game.resolveFlip('MISS');
  assert.equal(player.lives, 5, 'ending an ON FIRE run must not remove lives');
  assert.equal(player.eliminated, false);
  assert.equal(game.lastPenalty, 0);
  assert.equal(game.fireEnded, true);
}

function testEightPlayerFireCapsAtFiveGains() {
  const game = loadGame();
  igniteInSuddenDeath(game);
  const player = game.currentPlayer();

  for (let i = 0; i < 5; i++) game.resolveFlip('MAKE');
  assert.equal(player.lives, 8);
  assert.equal(game.endedFireBonus, 5);
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
  assert.ok(game.maxLives >= 14, 'doubling must not leave the life cap below the reward');

  game.resolvePlinko('halve');
  assert.deepEqual(game.players.slice(1).map((p) => p.lives), [4, 1, 0]);
  assert.equal(game.players[3].eliminated, true, 'halving one life rounds down and eliminates');
  assert.equal(game.players[0].lives, 14, 'halving must not affect the flipper');

  const jackpot = loadGame();
  jackpot.init(players(4), 1, { startingLives: 3 });
  jackpot.callbacks = {};
  jackpot.resolvePlinko('win');
  assert.deepEqual(jackpot.players.map((p) => p.eliminated), [false, true, true, true]);
}

function testHeartRushReward() {
  const game = loadGame();
  game.init(players(4), 1, { startingLives: 3 });
  game.callbacks = {};
  game.resolveFlip('MAKE', { rareEvent: 'heart-rush' });
  assert.equal(game.currentPlayer().lives, 6);
  assert.equal(game.rareLifeGain, 3);
  assert.ok(game.maxLives >= 6);

  game.resolveFlip('MISS', { rareEvent: 'heart-rush' });
  assert.equal(game.rareLifeGain, 0, 'Heart Rush only rewards a successful landing');
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
    assert.ok(board.bottom - board.top > 900, 'Plinko board must provide a long drop');
    assert.equal(new Set(board.pegs.map((p) => p.y)).size, 8, 'Plinko board must have eight peg rows');

    let verdict = null;
    for (let frame = 0; frame < 3000 && !verdict; frame++) {
      physics.step(1 / 60);
      verdict = physics.checkLanding();
    }
    assert.equal(verdict, 'MAKE', `Plinko seed ${seed} did not resolve`);
    const info = physics.getLastLandingInfo();
    assert.equal(info.reason, 'plinko');
    assert.ok(['double', 'halve', 'win'].includes(info.plinko));
    prizes.add(info.plinko);
  }
  assert.ok(prizes.size >= 2, 'seeded Plinko simulation should exercise multiple prize types');
}

function testRareEventLadder() {
  const physics = loadPhysics();
  const ids = ['trampoline', 'wind-tunnel', 'double-flip', 'magnet', 'heart-rush'];
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
    const startX = physics.getBottle().position.x;
    let previousVy = physics.getBottle().velocity.y;
    let upwardReversals = 0;
    let maxDrift = 0;
    let verdict = null;
    for (let frame = 0; frame < 1600 && !verdict; frame++) {
      physics.step(1 / 60);
      const bottle = physics.getBottle();
      if (previousVy > 0.5 && bottle.velocity.y < -1) upwardReversals++;
      previousVy = bottle.velocity.y;
      maxDrift = Math.max(maxDrift, Math.abs(bottle.position.x - startX));
      verdict = physics.checkLanding();
    }
    assert.ok(verdict, `${id} did not reach a verdict`);
    assert.notEqual(physics.getLastLandingInfo().reason, 'timeout', `${id} used the timeout fallback`);
    if (id === 'trampoline' || id === 'double-flip') {
      assert.ok(upwardReversals >= 1, `${id} never produced its second aerial arc`);
    }
    if (id === 'wind-tunnel') {
      assert.ok(maxDrift > 20, `wind tunnel only moved ${maxDrift.toFixed(1)}px sideways`);
    }
  }
}

function testForcedSpecialEvents() {
  const physics = loadPhysics();
  physics.init(1280, 800);
  physics.setPlinkoEnabled(false);
  const events = ['plinko', 'trampoline', 'wind-tunnel', 'double-flip', 'magnet', 'heart-rush'];

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
}

testSuddenDeathFireMissIsFree();
testEightPlayerFireCapsAtFiveGains();
testOrdinarySuddenDeathPenaltyRemains();
testCoreRulesStayStable();
testForfeitCleansOnFireState();
testPlinkoRewards();
testHeartRushReward();
testLandingVerdictsRequireRealSettle();
testLongPlinkoBoardResolves();
testRareEventLadder();
testForcedSpecialEvents();
console.log('Regression tests passed.');
