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

testSuddenDeathFireMissIsFree();
testEightPlayerFireCapsAtFiveGains();
testOrdinarySuddenDeathPenaltyRemains();
testLandingVerdictsRequireRealSettle();
console.log('Regression tests passed.');
