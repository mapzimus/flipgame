'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const html = read('index.html');
const css = read('css/style.css');
const main = read('js/main.js');
const renderer = read('js/renderer.js');
const skins = read('js/skins.js');

function idsIn(markup) {
  return [...markup.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
}

test('DOM smoke: every literal main.js mount exists and document IDs are unique', () => {
  const ids = idsIn(html);
  assert.equal(new Set(ids).size, ids.length, 'duplicate HTML id');
  const mounted = [...main.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map((match) => match[1]);
  const dynamicOrOptional = new Set(['records-panel', 'skin-toast']);
  const missing = [...new Set(mounted)].filter((id) => !ids.includes(id) && !dynamicOrOptional.has(id));
  assert.deepEqual(missing, []);
});

test('DOM smoke: complete route shell and accessibility regions are present', () => {
  for (const id of [
    'setup-screen', 'char-picker-screen', 'online-screen', 'stats-screen',
    'achievements-screen', 'lab-screen', 'game-screen', 'game-over',
    'app-status', 'app-error', 'game-canvas',
  ]) assert.match(html, new RegExp(`id="${id}"`));
  assert.ok((html.match(/aria-live=/g) || []).length >= 6);
  assert.match(html, /aria-labelledby="lab-title"/);
  assert.match(html, /aria-label="Statistics filters"/);
});

test('loader order installs architecture, safety, modes, mirror, network, and platform before main', () => {
  const sources = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1].replace(/\?.*$/, ''));
  const position = (name) => sources.indexOf(`js/${name}`);
  for (const name of [
    'v111-interfaces.js', 'v111-runtime.js', 'v111-name-policy.js', 'v111-stats.js',
    'v111-platform.js', 'v111-object-manifest.js', 'v111-content-catalog.js',
    'v111-cosmetic-catalog.js', 'v111-progression.js', 'v111-modes.js',
    'v111-physics-events.js', 'v111-mirror-match.js', 'v111-network-protocol.js',
    'net.js', 'main.js',
  ]) assert.notEqual(position(name), -1, `${name} is not loaded`);
  assert.ok(position('v111-interfaces.js') < position('v111-runtime.js'));
  assert.ok(position('v111-runtime.js') < position('v111-name-policy.js'));
  assert.ok(position('v111-name-policy.js') < position('v111-stats.js'));
  assert.ok(position('v111-network-protocol.js') < position('net.js'));
  assert.ok(position('v111-mirror-match.js') < position('main.js'));
  assert.ok(position('v111-platform.js') < position('main.js'));
  assert.ok(sources.every((source) => source !== 'js/v111.js'));
  assert.match(html, /\?v=111/);
  assert.doesNotMatch(html, /\?v=110/);
});

test('responsive shell has 48px targets, twelve-column desktop, compact roster, focus and reduced motion', () => {
  assert.match(css, /min-block-size:\s*48px/);
  assert.match(css, /\.setup-layout\s*\{[^}]*grid-template-columns:\s*repeat\(12,/s);
  assert.match(css, /max-inline-size:\s*1480px/);
  assert.match(css, /\.player-input-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
  assert.match(css, /grid-template-rows:\s*repeat\(4,/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /@media\s*\(min-width:\s*3000px\)/);
  assert.match(css, /@media\s*\(max-width:\s*420px\)/);
});

test('locked content is lock-only and pressure timers are absent', () => {
  for (const forbidden of [
    /unlocks later/i, /alien required/i, /unlock alien/i, /win #\d+ on the ladder/i,
    /teacher/i, /classroom/i, /programmed odds/i, /not collected yet/i, /resetSkinProgress/, /unlockAll/,
    /turn-timer/, /startTurnTimer/, /onTimeout/, /reason:\s*['"]timeout['"]/,
  ]) assert.doesNotMatch(html + '\n' + main + '\n' + css, forbidden);
  assert.match(main, /aria-label="Locked"/);
  assert.match(main, /announce\('Locked'\)/);
  assert.match(main, /INSANE MODE/);
  assert.match(main, /viewFeature\(FlipgameV111Progression\.snapshot\(\), id\)/);
  assert.match(main, /isCharUnlocked\('alien'\) && isFeatureUnlocked\('insane-mode'\)/);
  assert.match(main, /isFeatureUnlocked\('physics-lab'\)/);
  assert.doesNotMatch(html, />Insanity</);
});

test('all objects, variants, cosmetics and independent visual arenas feed rendering', () => {
  const manifest = require(path.join(ROOT, 'js/v111-object-manifest.js'));
  assert.equal(manifest.objects.length, 25);
  assert.equal(manifest.flavorOrder.length, 12);
  assert.equal(manifest.variants.length, 300);
  assert.match(skins, /return legacy\.concat\(additions\)/);
  assert.match(skins, /FLIP_V111_OBJECT_MANIFEST/);
  assert.match(skins, /FlipArtV111/);
  assert.match(skins, /preload:\s*\(pairs\)/);
  assert.doesNotMatch(skins, /preload:\s*\(colors\)/);
  assert.doesNotMatch(skins, /icons\/skins|pngCache|getPngSprite|drawPngSprite|preloadPngEdition/);
  assert.match(main, /Skins\.preload\(defs\.map\(\(definition\) => \(\{/);
  assert.match(main, /cosmeticId:\s+currentMatchDefs/);
  assert.match(main, /visualArenaId:\s+currentMatchOptions\.visualArenaId/);
  assert.match(renderer, /drawPersonalFinish/);
  assert.match(renderer, /spawnCosmeticTrail/);
  assert.match(renderer, /drawCosmeticNameplate/);
  assert.match(renderer, /drawVisualArena\('sky'/);
  assert.match(renderer, /drawVisualArena\('table'/);
});

test('event renderer consumes all canonical render state with Plinko and a true trail', () => {
  const events = require(path.join(ROOT, 'js/v111-physics-events.js'));
  assert.equal(events.list().length, 30);
  assert.match(main, /Physics\.getEventRenderState/);
  assert.match(main, /Physics\.getEventBodies/);
  assert.match(renderer, /drawModernEventWorld/);
  assert.match(renderer, /drawPlinko/);
  assert.match(renderer, /rainbowTrailPoints\.push/);
  assert.match(renderer, /drawRainbowTail/);
  assert.match(renderer, /reduceMotion/);
});

test('physics and rules bridge receives deterministic event and qualification context', () => {
  assert.match(main, /Physics\.applyFlick\([\s\S]*excludedEventIds:/);
  assert.match(main, /currentMatchOptions\.eventsDisabled\s*\?\s*'disabled'/);
  assert.match(main, /Records\.recordFlip\([\s\S]*practice:\s*!!game\.practice,[\s\S]*lab:\s*!!currentMatchOptions\.lab,[\s\S]*forced:/);
  assert.match(main, /Records\.recordWin\(qualification\)/);
  assert.doesNotMatch(main, /FlipgameV111Progression\.recordQualifyingWin/);
  assert.match(main, /v111Bridge\('flipResolved',[\s\S]*record:\s*statsRecord/);
  assert.match(main, /v111Bridge\('matchResolved',[\s\S]*record:\s*matchRecord/);
});

test('full stats surface offers scopes, filters, charts and export datasets', () => {
  for (const id of [
    'stats-scope', 'stats-from', 'stats-format', 'stats-player', 'stats-human',
    'stats-object', 'stats-variant', 'stats-cosmetic', 'stats-arena',
    'stats-event', 'stats-player-count', 'stats-viewport',
    'stats-test-data', 'stats-csv-type', 'stats-results',
  ]) assert.match(html, new RegExp(`id="${id}"`));
  for (const label of [
    'Cumulative make rate', 'Make / miss', 'Power × direction', 'Rotations',
    'Landing reasons', 'Lives timeline', 'Stake timeline', 'Streaks',
    'Object comparison', 'Cup timeline', 'Team Clash timeline',
  ]) assert.match(main, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  assert.match(main, /observedEventFrequencySuccess/);
  for (const value of ['flips', 'matches', 'player-summary', 'event-summary']) {
    assert.match(html, new RegExp(`value="${value}"`));
  }
  assert.doesNotMatch(html + main, /stats-visual-arena|visualArenaIds/);
  assert.match(main, /arenaId:\s*currentMatchOptions\.visualArenaId \|\| currentMatchOptions\.arenaProfileId/);
  assert.match(main, /oddsProfile:\s*testDataFlipActive \? 'forced-test' : game\.insanity \? 'insane'/);
  assert.match(main, /mode:\s*currentMatchOptions\.lab \? 'physics-lab' : game\.practice \? 'practice' : game\.format/);
  assert.match(main, /else if \(!includePractice\) filters\.modes = \['classic', 'cup', 'team-clash', 'team'\]/);
  assert.match(main, /const flipRows = \(Array\.isArray\(raw\?\.flips\)[\s\S]*\.filter\(isCompetitive\)/);
  assert.match(main, /observedPercent/);
  assert.match(main, /eventPublicName/);
});

test('Cup arena draft and fair rematch options are rules-owned', () => {
  assert.match(html, /id="arena-draft-choices"[^>]*role="radiogroup"/);
  assert.match(main, /offer\.choices\.length === 3/);
  assert.match(main, /arenaDraftSelectionId/);
  assert.match(main, /delete options\.arenaProfileId/);
  assert.match(main, /modeState\?\.newCupOptions/);
  assert.match(main, /modeState\?\.rematchOptions/);
  assert.match(main, /modeState\?\.swapTeamOptions/);
  assert.match(main, /textContent = 'Same Setup'/);
  assert.match(main, /textContent = 'Next heat'/);
  assert.match(main, /textContent = 'New Cup'/);
});

test('online and platform call sites enforce safe lifecycle and resume state', () => {
  assert.match(main, /enterMatch\(\{ fullscreen: true \}\)/);
  assert.match(main, /leaveMatch\(\)/);
  assert.doesNotMatch(main, /wakeLock|restoreActiveMatch/);
  assert.ok((main.match(/Net\.setTurn\(/g) || []).length >= 2);
  assert.match(main, /if \(!Net\.sendFlick\(/);
  assert.match(main, /Net\.bindMatchState\(\{ capture: captureOnlineMatchState, restore: restoreOnlineMatchState \}\)/);
  assert.match(main, /resume-state-missing/);
  assert.match(main, /compatibility-failure/);
  assert.match(main, /Please choose another name/);
});

test('Mirror Match arms, claims, copies policy-safe physics, consumes, persists and cleans up', () => {
  assert.match(main, /mirrorMatch\.peek\(request\)/);
  assert.match(main, /mirrorMatch\.claim\(request\)/);
  assert.match(main, /canonicalEventId\(\) !== 'mirror-match'/);
  assert.match(main, /mirrorMatch\.arm\(\{/);
  assert.match(main, /vector:\s*\{ x:\s*Number\(activeLaunchInput\?\.vx\), y:\s*Number\(activeLaunchInput\?\.vy\) \}/);
  assert.match(main, /mirrorMatch\.consume\(/);
  assert.match(main, /phase:\s*'resolved'/);
  assert.match(main, /mirrorPolicy\.eventPolicy\?\.eventsDisabled/);
  assert.match(main, /mirrorPolicy\.nestingDisabled/);
  assert.match(main, /copyRewards === false/);
  assert.match(main, /copySideEffects === false/);
  assert.match(main, /mirrorSnapshot:/);
  assert.match(main, /mirrorMatch\.cleanup\('match-ended'\)/);
  assert.match(main, /syncMirrorRoster\(\)/);
  assert.match(main, /Physics\.setProfile\(physicsProfileForPlayer\(index\)\)/);
});

test('Physics Lab captures a successful path and replays exact launch, profile, event and viewport', () => {
  for (const id of [
    'lab-object', 'lab-variant', 'lab-event', 'lab-seed', 'lab-viewport',
    'lab-slow-motion', 'lab-ghost', 'lab-replay-btn', 'lab-route-readout',
  ]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(main, /practice:\s*true, lab:\s*true, testData:\s*true/);
  assert.match(main, /activeLabTrajectory\.push/);
  assert.match(main, /path:\s*activeLabTrajectory\.map/);
  assert.match(main, /vx:\s*Number\(activeLaunchInput\?\.vx\)/);
  assert.match(main, /forcedEventId:\s*currentMatchOptions\.labEventId/);
  assert.match(main, /arenaProfileId:\s*currentMatchOptions\.arenaProfileId/);
  assert.match(main, /launchFlick\(replayShot\.vx, replayShot\.vy, replayShot\.seed/);
  assert.match(renderer, /Array\.isArray\(ghost\.path\)/);
  assert.match(renderer, /ctx\.lineTo\(Number\(path\[index\]\.x\), Number\(path\[index\]\.y\)\)/);
  assert.match(main, /qualifyingLabAction:\s*true/);
});
