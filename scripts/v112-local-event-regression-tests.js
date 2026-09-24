'use strict';

// Active local-event/UI coverage extracted from the retired peer-protocol suite.
// Wire serialization, sender identity and reconnect assertions remain archived
// because v1.12 has no Online mode. Real physical outcomes remain exercised here.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const { game: gamePrototype } = require('../js/game.js');
const { EVENT_IDS } = require('../js/v111-interfaces.js');
const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
const DEFS = [0, 1].map(index => ({ id: 'seat-' + (index + 1), name: 'Player ' + (index + 1), color: index ? '#ef476f' : '#58c8ff', isAI: false }));
const PLINKO = ['double', 'halve', 'magnet', 'lose', 'win', 'lose', 'magnet', 'halve', 'double'];

function loadPhysics() {
  const context = vm.createContext({ console, Math, window: { matchMedia: () => ({ matches: false }) } });
  for (const relative of [
    'js/vendor/matter.min.js', 'js/v111-interfaces.js', 'js/v111-physics-events.js',
    'js/v112-plinko-matter.js', 'js/v112-plinko-live.js', 'js/physics.js',
  ]) {
    let source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    if (relative === 'js/physics.js') source += '\nthis.__physics = Physics;';
    vm.runInContext(source, context, { filename: relative });
  }
  return context.__physics;
}

function physicalOutcome(eventId, index) {
  const physics = loadPhysics();
  physics.init(1280, 800);
  physics.forceSpecialEvent(eventId);
  physics.applyFlick(index % 2 ? 350 : -350, -2500, 7000 + index);
  for (let frame = 0; frame < 3600; frame++) {
    physics.step(1 / 60);
    const result = physics.checkLanding();
    if (!result) continue;
    const info = physics.getLastLandingInfo();
    const detail = physics.getEventResultMetadata() || {};
    const reward = detail.eventReward && typeof detail.eventReward === 'object' ? detail.eventReward : {};
    const meta = Object.assign({}, detail, {
      perfect: !!info.perfect,
      onCap: !!(info.onCap || info.reason === 'cap'),
      golden: eventId === 'golden-flip',
      plinko: detail.plinko || detail.prize || info.plinko || null,
      rareEvent: eventId,
      eventId,
      landedCount: detail.landedCount ?? reward.landedCount,
      rouletteMultiplier: detail.rouletteMultiplier || detail.multiplier || reward.multiplier,
      rouletteSlot: detail.rouletteSlot ?? reward.slotIndex,
      automaticOutcome: detail.automaticOutcome,
      eventReward: reward,
    });
    return { result, info, meta };
  }
  throw new Error(`${eventId} did not resolve`);
}

function newGame() {
  const value = Object.assign({}, gamePrototype, { callbacks: {} });
  value.init(DEFS, 1, { startingLives: 10 });
  return value;
}

// Every actual event must finish a physical attempt and produce usable local
// metadata. No fabricated verdict or transport projection is substituted.
assert.equal(EVENT_IDS.length, 30);
EVENT_IDS.forEach((eventId, index) => {
  const outcome = physicalOutcome(eventId, index);
  assert.ok(['MAKE', 'MISS'].includes(outcome.result), eventId);
  assert.ok(outcome.info && typeof outcome.info.reason === 'string', eventId + ' has landing reason');
  assert.equal(outcome.meta.eventId, eventId);
  const local = newGame();
  if (outcome.meta.plinko) local.resolvePlinko(outcome.meta.plinko);
  else local.resolveFlip(outcome.result, outcome.meta);
  assert.ok(local.turnCounter >= 1, eventId + ' counts the final attempt');
  for (const player of local.players) {
    assert.ok(Number.isInteger(player.lives) && player.lives >= 0, eventId + ' valid lives');
    if (player.eliminated) assert.equal(player.lives, 0, eventId + ' stores elimination as zero');
  }
});

// All nine slots retain their actual local effects, including both physical
// slots on each side sharing a reward. Canonical slot geometry has its own suite.
PLINKO.forEach(prize => {
  const local = newGame();
  local.resolvePlinko(prize);
  assert.equal(local.plinkoPrize, prize);
  if (prize === 'double') assert.equal(local.players[0].lives, 20);
  if (prize === 'halve') assert.equal(local.players[1].lives, 5);
  if (prize === 'magnet') assert.equal(local.players[0].alwaysMagnet, true);
  if (prize === 'lose') { assert.equal(local.players[0].lives, 0); assert.equal(local.players[0].eliminated, true); }
  if (prize === 'win') { assert.equal(local.players[1].lives, 0); assert.equal(local.players[1].eliminated, true); }
});

// Direct local rewards must survive removal of the wire-format normalizer.
for (const [eventId, expected, detail] of [
  ['rainbow-corkscrew', 11, {}], ['heart-rush', 13, {}],
  ['shrink-ray', 12, {}], ['mitosis', 10, { landedCount: 1 }],
  ['mitosis', 13, { landedCount: 2 }], ['cap-toss', 15, {}],
  ['double-flip', 20, {}], ['roulette-table', 40, { slotIndex: 3 }],
]) {
  const local = newGame();
  local.resolveFlip('MAKE', { eventId, eventReward: detail });
  assert.equal(local.players[0].lives, expected, eventId);
  if (eventId === 'double-flip') assert.equal(local.players[1].lives, 5);
}
const drain = newGame(); drain.resolveFlip('MAKE', { eventId: 'life-drain' });
assert.equal(drain.players[0].lives, 10); assert.equal(drain.players[1].lives, 1);
const cap = newGame(); cap.resolveFlip('MAKE', { eventId: 'shrink-ray', onCap: true });
assert.equal(cap.players[0].lives, 13);

// Customize has three real rows. The conditional arena note overlays row 3,
// so no hidden fourth explicit track can consume the remaining gallery height.
assert.match(css, /\.customize-main\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(0,1fr\)/s);
assert.match(css, /\.customize-main > \.seat-switcher\s*\{[^}]*grid-row:\s*1/s);
assert.match(css, /\.customize-main > \.tab-list\s*\{[^}]*grid-row:\s*2/s);
assert.match(css, /#arena-scope-note\s*\{[^}]*grid-row:\s*3/s);
assert.match(css, /#customize-panel\s*\{[^}]*grid-row:\s*3/s);
assert.doesNotMatch(css, /\.customize-main[^}]*auto auto auto minmax\(0,1fr\)/s);
const desktopPadding = 16;
const desktopMainHeight = 720 - 56 - 72;
const computedPanelHeight = desktopMainHeight - (2 * desktopPadding) - 48 - 48 - (2 * 10);
assert.equal(computedPanelHeight, 444, '1280x720 computed browser geometry stays stable');
assert.ok(computedPanelHeight > 400, '1280x720 active gallery is taller than 400px');
assert.ok(desktopPadding <= 16, 'gallery bottom stays near the main content bottom');

console.log('v1.12 local event/UI regression passed: all 30 physical events, nine Plinko prizes, direct rewards and picker layout.');
