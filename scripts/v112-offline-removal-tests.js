'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

new vm.Script(main, { filename: 'js/main.js' });
assert.doesNotMatch(main, /\b(?:Net|ONLINE_ENABLED|onlineMode|netAuthority|pendingNetResult|asAuthority|FlipgameNetworkProtocolV2)\b/);
assert.doesNotMatch(main, /(?:capture|restore|begin)OnlineMatch|showOnlineLobby|renderOnlineRoster|validateOnlineName/);
assert.doesNotMatch(html, /online-(?:btn|screen|form|lobby|roster)|data-route="online"|Create room|Join room/i);
assert.doesNotMatch(main, /onlineBeta|query\.get\(['"]online|\.sendFlick\(|\.sendResult\(|\.acceptResult\(|\.bindMatchState\(/);
for (const file of ['js/net.js', 'js/v111-network-protocol.js']) assert.equal(fs.existsSync(path.join(root, file)), false, file + ' removed');
for (const match of main.matchAll(/\bonline:\s*([^,}\n]+)/g)) assert.equal(match[1].trim(), 'false', 'legacy observer field is always local');

// Live UI helpers must still send an ordinary local launch, including Mirror
// Match and Lab seeds, with no transport authority argument in the new signature.
function helper(name) {
  const source = main.match(new RegExp('  function ' + name + '\\([^]*?\\n  \\}'));
  assert.ok(source, name + ' exists'); return source[0];
}
function launchHarness({ claim = null, labSeed = null, cpu = null } = {}) {
  const calls = [], mirror = [];
  const run = Function('cpuLaunchPolicy', 'mirrorLaunch', 'claimMirrorCopy', 'currentMatchOptions', 'launchFlick',
    helper('onFlick') + '; return onFlick;');
  const onFlick = run(() => cpu, (copy, vx, vy, seed) => {
    mirror.push(copy); return copy ? { vx: 123, vy: -456, seed: 789, claim: copy } : { vx, vy, seed, claim: null };
  }, () => claim, labSeed === null ? {} : { lab: true, labSeed }, (...args) => calls.push(args));
  onFlick(250, -1500);
  return { calls, mirror };
}
assert.deepEqual(launchHarness().calls, [[250, -1500, undefined, null, null]]);
assert.deepEqual(launchHarness({ labSeed: 314 }).calls, [[250, -1500, 314, null, null]]);
const claim = { id: 'mirror-copy' }, cpu = { seed: 71, policy: 'physical' };
assert.deepEqual(launchHarness({ claim, cpu }).calls, [[123, -456, 789, claim, cpu]]);
assert.deepEqual(launchHarness({ cpu }).calls, [[250, -1500, 71, null, cpu]]);

// Results use the local landing metadata exclusively. Ordinary, cap and Plinko
// branches remain reachable, and bridge observers receive online:false.
const resolutions = [], observations = [];
const game = {
  resolveFlip: (...args) => resolutions.push(['flip', ...args]),
  resolvePlinko: (...args) => resolutions.push(['plinko', ...args]),
};
const runResolve = Function('game', 'landingMeta', 'v111Bridge', 'canonicalEventId',
  'testDataFlipActive', 'matchTestDataActive',
  'let bridgeLandingInfo; ' + helper('resolveGameFlip') + '; return resolveGameFlip;');
const resolve = runResolve(game, info => info, (event, payload) => { observations.push([event, payload]); return false; }, () => null, false, false);
const cap = { onCap: true, perfect: false };
resolve('MAKE', cap, { plinko: 'automatic-win' });
assert.deepEqual(resolutions[0], ['flip', 'MAKE', cap], 'discard obsolete remote metadata argument');
resolve('MISS', { reason: 'settled-side' });
resolve('MAKE', { plinko: 'lives-doubled' });
assert.deepEqual(resolutions[2], ['plinko', 'lives-doubled']);
assert.ok(observations.every(row => row[1].online === false));

// Protect recently integrated selection routes from collateral removal.
for (const id of ['setup-screen', 'char-picker-screen', 'arena-select-screen', 'arena-select-grid', 'arena-play', 'game-screen', 'pass-screen', 'game-over', 'practice-btn']) {
  assert.ok(html.includes('id="' + id + '"'), 'local route remains: ' + id);
}
assert.match(main, /Physics\.setPlinkoEnabled\(true\)/);
assert.match(main, /Input\.attach\(canvas, onFlick\)/);
assert.match(main, /Settings\.setFeel\(feel\)/);
console.log('Offline removal passed: transports and lobby absent; local launches, Lab/Mirror seeds, landing metadata, Plinko and selection routes preserved.');
