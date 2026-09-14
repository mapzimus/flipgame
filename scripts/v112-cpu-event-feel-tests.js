'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Cpu = require('../js/v112-cpu.js');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'js/renderer.js'), 'utf8');

const speed = main.match(/function gameSpeed\(\) \{[\s\S]*?\n  \}/)[0];
assert.match(speed, /rareEventActive \|\| plinkoFlipActive \|\| cur\.isOnFire/);
assert.match(speed, /return 1;/);
assert.match(speed, /return 4;/);
assert.doesNotMatch(speed, /if \(cur && cur\.isAI\) return 4;/);

assert.match(renderer, /strokeText\(title, W \/ 2/);
assert.match(renderer, /'rgba\(255,70,0,0\.40\)'/);
assert.match(renderer, /function eventObjectScale/);
assert.match(renderer, /function eventCapDetached/);
assert.match(renderer, /bodiesWithLabel\(bodies, 'fizz-cap'\)/);
assert.match(renderer, /bodiesWithLabel\(bodies, 'cap-toss-cap'\)/);
assert.match(renderer, /bodiesWithLabel\(bodies, 'quake-debris'\)/);
assert.match(renderer, /bodiesWithLabel\(bodies, 'ice-bumper'\)/);
assert.match(renderer, /runtime\.heartbeatCount/);
assert.match(renderer, /runtime\.originX/);
assert.match(renderer, /runtime\.targetX/);
assert.match(renderer, /flags\.reversing/);
assert.match(renderer, /event === 'life-drain'/);
assert.doesNotMatch(renderer, /event === 'magnet' \|\| event === 'life-drain'/);

const physics = fs.readFileSync(path.join(root, 'js/physics.js'), 'utf8');
assert.match(physics, /bodyScale: eventRuntime\.bodyScale/);
assert.match(physics, /originY: eventRuntime\.originY/);
assert.match(physics, /x: wave \* bottle\.mass \* 0\.00090/);

const hard = [];
const medium = [];
for (let seed = 1; seed <= 400; seed += 1) {
  hard.push(Cpu.createLaunch({ seed, difficulty: 'hard' }));
  medium.push(Cpu.createLaunch({ seed, difficulty: 'medium' }));
}
function shank(row) {
  return Math.abs(row.vy) < 900;
}
assert.ok(hard.filter(shank).length >= 8, 'Hard must visibly shank some shots');
assert.ok(medium.filter(shank).length >= 16, 'Medium must visibly shank some shots');
assert.ok(new Set(hard.map((row) => row.vx.toFixed(2) + ':' + row.vy.toFixed(2))).size > 300,
  'Hard launch variance collapsed');

console.log('v1.12 CPU/event feel: heaters play in real time, and Classic shanks are real releases.');
