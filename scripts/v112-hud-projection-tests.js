'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Rules = require('../js/v112-rules.js');
const Hud = require('../js/v112-hud-projection.js');

function fixture(count = 8, options = {}) {
  const roster = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`,
    objectId: i ? 'coffee-mug' : 'bottle', variantId: i, human: i !== 1 }));
  let state = Rules.createClassicState({ matchId: 'hud-match', players: roster,
    startingLives: 3, suddenDeathAfterTurns: 8, ...options });
  const snapshot = { session: { matchId: state.matchId,
    request: { matchId: state.matchId, roster, activityId: 'free-play',
      formatId: 'classic', physicsModeId: 'normal' },
    rules: state, flipPhase: 'ready', status: 'active', lastRulesOutcome: null,
    lastLanding: null, resolution: null } };
  return { snapshot, step(input = { result: 'MAKE' }) {
    const transition = Rules.resolveClassicFlip(state, input);
    state = transition.state;
    snapshot.session.rules = state;
    snapshot.session.lastRulesOutcome = transition.outcome;
    snapshot.session.flipPhase = 'resolved';
    return transition;
  } };
}
function result(f) { return Hud.project(f.snapshot, { presentation: 'result' }); }
function next(f) { return Hud.project(f.snapshot, { presentation: 'next' }); }

const fire = fixture();
assert.equal(next(fire).canArm, true);
for (let i = 0; i < 17; i++) {
  const transition = fire.step();
  const shown = result(fire);
  assert.equal(shown.display.players[shown.display.currentPlayerIndex].id, transition.outcome.playerId);
  assert.equal(shown.nextTurn.current, transition.state.turn.current);
  assert.equal(shown.display.pointCount, transition.state.stake);
  assert.equal(shown.display.turnCounter, transition.state.rulesTurnCounter);
  assert.equal(shown.display.justIgnited, transition.outcome.onFire.justIgnited);
  assert.equal(shown.canArm, false);
  assert.equal(next(fire).display.lastResult, null);
}
assert.equal(result(fire).display.justIgnited, true);
assert.equal(result(fire).display.currentPlayerIndex, 0);
assert.equal(result(fire).display.onFirePlayer, 0);
assert.equal(result(fire).display.suddenDeathLevel, fire.snapshot.session.rules.suddenDeath.level);
const fireTurnCount = result(fire).display.turnCounter;
fire.step();
assert.equal(result(fire).display.players[0].lives, 4);
assert.equal(result(fire).display.players[0].streak, 4);
assert.equal(result(fire).display.onFireGain, 1);
assert.equal(result(fire).display.turnCounter, fireTurnCount);
fire.step({ result: 'MISS' });
const ended = result(fire);
assert.equal(ended.display.currentPlayerIndex, 0);
assert.equal(ended.nextPlayerIndex, 1);
assert.equal(ended.display.onDeckPlayerIndex, 1);
assert.equal(ended.display.afterThatPlayerIndex, 2);
assert.equal(ended.display.lastPenalty, 0);
assert.equal(ended.display.fireEnded, true);
assert.equal(ended.display.endedFireBonus, 1);
assert.equal(ended.display.players[0].lives, 4);
assert.equal(ended.display.pointCount, 17);
assert.equal(ended.display.justEliminated, false);
assert.equal(next(fire).display.currentPlayerIndex, 1);
assert.equal(next(fire).display.fireEnded, false);
assert.equal(next(fire).display.endedFireBonus, 0);
fire.step({ result: 'MISS' });
assert.equal(result(fire).display.lastPenalty, 3, 'show actual lost lives, not the much larger stake');
assert.equal(result(fire).display.justEliminated, true);
assert.equal(result(fire).display.players[1].lives, 0);
assert.equal(result(fire).display.currentPlayerIndex, 1, 'eliminated actor stays on RESULT');
assert.equal(next(fire).display.currentPlayerIndex, 2);

const cap = fixture(2, { suddenDeathEnabled: false });
for (let i = 0; i < 5; i++) cap.step();
cap.step({ result: 'MAKE', pose: 'cap' });
const capped = result(cap);
assert.equal(capped.display.onFireGain, 2);
assert.equal(capped.display.fireCapped, true);
assert.equal(capped.display.fireEnded, true);
assert.equal(capped.display.capLand, true);
assert.equal(capped.display.players[0].lives, 5);
assert.equal(capped.display.endedFireBonus, 2);
assert.equal(capped.display.perfectKnown, false);
const outcomeId = cap.snapshot.session.lastRulesOutcome.outcomeId;
assert.equal(Hud.project(cap.snapshot, { presentation: 'result',
  landingPresentation: { outcomeId, perfect: true } }).display.perfectLanding, true);
assert.equal(Hud.project(cap.snapshot, { presentation: 'result',
  landingPresentation: { outcomeId: 'stale', perfect: true } }).display.perfectLanding, false);
assert.equal(next(cap).display.capLand, false);

const terminal = fixture(2, { suddenDeathAfterTurns: 0 });
while (terminal.snapshot.session.rules.phase !== 'complete') terminal.step({ result: 'MISS' });
assert.equal(result(terminal).phase, 'result');
assert.equal(next(terminal).phase, 'awaiting-finalization');
assert.equal(next(terminal).canArm, false);
assert.equal(next(terminal).nextPlayerIndex, -1);
terminal.snapshot.session.status = 'finalization-failed';
assert.equal(next(terminal).retryFinalization, true);
terminal.snapshot.session.status = 'completed';
terminal.snapshot.session.resolution = { rewards: { fxp: 45 } };
assert.equal(result(terminal).postMatch, null, 'completion cannot cut short result interval');
assert.equal(next(terminal).phase, 'postmatch');
assert.equal(next(terminal).display.state, 'GAME_OVER');
assert.equal(next(terminal).postMatch.rewards.fxp, 45);

// Practice uses actual Classic outcome behind the facade but never shows its
// synthetic opponent, penalty, fire state, or life/stake economy.
const practice = fixture(2, { suddenDeathEnabled: false });
practice.step({ result: 'MAKE', pose: 'cap' });
practice.snapshot.session.request.activityId = 'practice';
practice.snapshot.session.request.roster = practice.snapshot.session.request.roster.slice(0, 1);
practice.snapshot.session.rules = null;
practice.snapshot.session.practice = { flips: 1, makes: 1, misses: 0, caps: 1 };
const p = result(practice);
assert.equal(p.display.players.length, 1);
assert.equal(p.display.currentPlayerIndex, 0);
assert.equal(p.display.players[0].lives, null);
assert.equal(p.display.pointCount, 0);
assert.equal(p.display.practiceCaps, 1);
assert.equal(p.display.capLand, true);
assert.equal(p.display.practiceStreak, null);
assert.equal(next(practice).canArm, true);

const identity = fixture(3);
identity.snapshot.session.request.roster.reverse();
const before = JSON.stringify(identity.snapshot);
const projected = next(identity);
assert.equal(projected.display.currentPlayerIndex, 2, 'join player identity, not incidental roster ordering');
assert.equal(projected.display.players[2].objectId, 'bottle');
assert.equal(projected.display.players[2].skin, 'bottle');
assert.equal(projected.display.players[1].variantId, 1);
assert.equal(projected.display.players[1].isAI, true);
assert.equal(JSON.stringify(identity.snapshot), before);
assert.throws(() => { projected.display.players[0].lives = 99; }, TypeError);
assert.equal(Object.isFrozen(projected.nextTurn.signals), true);
identity.step();
identity.snapshot.session.lastRulesOutcome = { ...identity.snapshot.session.lastRulesOutcome, matchId: 'other' };
assert.equal(result(identity).supported, false);
assert.equal(Hud.project({}).reason, 'no-session');
const event = fixture();
event.step({ result: 'MAKE', effects: { lifeMultiplier: 2 } });
assert.equal(result(event).reason, 'event-adapter-required');
for (const [field, value] of [['formatId', 'battle'], ['physicsModeId', 'alien'], ['activityId', 'story']]) {
  const unsupported = fixture();
  unsupported.snapshot.session.request[field] = value;
  assert.equal(next(unsupported).reason, 'mode-adapter-required');
}
const airborne = fixture();
for (const phase of ['airborne', 'contact', 'settling']) {
  airborne.snapshot.session.flipPhase = phase;
  assert.equal(next(airborne).canArm, false);
  assert.equal(next(airborne).phase, phase);
}
const browser = {};
vm.runInNewContext(fs.readFileSync(require.resolve('../js/v112-hud-projection.js'), 'utf8'), browser);
assert.deepEqual(Object.keys(browser.FlipgameV112HudProjection), ['schema', 'project']);
assert.equal(Object.isFrozen(browser.FlipgameV112HudProjection), true);
console.log('HUD projection: actual Rules fire/SD/cap/elimination, result-next/finalization, Practice, identity and browser checks passed');
