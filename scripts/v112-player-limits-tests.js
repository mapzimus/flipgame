'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Interfaces = require('../js/v111-interfaces.js');
const modes = require('../js/v111-modes.js');
const mirror = require('../js/v111-mirror-match.js');
const { game, alignToStartingRoster, SD_THRESHOLD, SD_STEP } = require('../js/game.js');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
const stats = fs.readFileSync(path.join(root, 'js/v111-stats.js'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'js/renderer.js'), 'utf8');

assert.deepEqual(modes.TEAM_COUNTS, Interfaces.supportedPlayerCounts('team-clash'));
assert.equal(Interfaces.PLAYER_LIMITS.rosterMax, 16);
assert.equal(alignToStartingRoster(70, 9), 72);
assert.equal(alignToStartingRoster(20, 9), 27);
assert.equal(alignToStartingRoster(70, 16), 80);
assert.equal(alignToStartingRoster(20, 16), 32);

game.init(Array.from({ length: 9 }, (_, i) => ({ name: 'P' + (i + 1) })), 1);
assert.equal(game.suddenDeathFlipThreshold, 72);
assert.equal(game.suddenDeathStep, 27);

const roster = Array.from({ length: 16 }, (_, playerIndex) => ({
  playerId: 'seat-' + (playerIndex + 1),
  playerIndex,
  active: true,
}));
const queue = mirror.create({ matchId: 'sixteen' });
const armed = queue.arm({
  source: roster[0],
  activeRoster: roster,
  launch: { vector: { x: 1, y: -2 }, spin: 0.1, seed: 11 },
  profile: { id: 'standard' },
});
assert.equal(armed.targets.length, 15);
assert.equal(armed.targets[14].playerIndex, 15);

assert.match(main, /player-list-focus/);
assert.match(main, /roster-drawer-btn/);
assert.match(main, /seat >= 0 && seat <= 15/);
assert.match(stats, /seat >= 0 && seat <= 15/);
assert.match(stats, /boundedInteger\('seat', 0, 15\)/);
assert.match(stats, /boundedInteger\('playerCount', 1, 16\)/);
assert.match(renderer, /function drawSelectedObjectClones/);
assert.doesNotMatch(main, /slice\(0,\s*8\)/);

console.log('v1.12 player limits: 2–16 Classic/Team, Cup caps, Mirror 16, aligned sudden death.');
