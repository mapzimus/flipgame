'use strict';
const assert = require('node:assert/strict');
const Rules = require('../js/v112-rules.js');
const Landing = require('../js/v112-landing-verdict.js');
function fixture(id) {
  const rules = Rules.createRulesAdapter({ matchId: id, formatId: 'classic',
    players: [{ id: 'one' }, { id: 'two' }], startingLives: 3 });
  const authority = Landing.createAuthority({ matchId: id,
    rulesConnector: rules.claimLandingConnector(), laneIds: ['main'] });
  const physics = authority.claimPhysicsLane('main'), consumer = authority.claimRulesLane('main');
  const attempt = physics.beginFlip({ flipId: 'flight', playerId: 'one', launchedAtMs: 500 });
  return { rules, physics, consumer, attempt };
}
function evidence(patch = {}) {
  return { schema: 'LandingAirborneTerminalEvidenceV1', kind: 'absolute-flight-timeout',
    wasAirborne: true, flightFrames: 901, limitFrames: 900, ...patch };
}
function input(patch = {}) {
  return { result: 'MISS', pose: 'miss', reason: 'timeout', atMs: 15516,
    evidence: evidence(), ...patch };
}
{
  const h = fixture('airborne-positive'), request = input();
  const verdict = h.physics.issueAirborneTerminalVerdict(h.attempt, request);
  assert.equal(verdict.result, 'MISS'); assert.equal(verdict.airborneTerminal, true);
  assert.equal(verdict.contacts, 0); assert.equal(verdict.firstContactMs, null);
  assert.equal(verdict.settleMs, null); assert.equal(verdict.finalSettleMs, null);
  assert.equal(verdict.timedOut, true);
  request.evidence.flightFrames = 2000;
  assert.equal(verdict.terminalEvidence.flightFrames, 901);
  assert(Object.isFrozen(verdict) && Object.isFrozen(verdict.terminalEvidence));
  assert.throws(() => h.consumer.resolve(JSON.parse(JSON.stringify(verdict))), /exact physics-issued/);
  assert.equal(h.consumer.resolve(verdict).state.sequence, 1);
  assert.throws(() => h.consumer.resolve(verdict), /already been consumed/);
  assert.throws(() => h.physics.issueAirborneTerminalVerdict(h.attempt, input()), /no prior scoring contact|reuse an issued/);
}
{
  const h = fixture('airborne-invalid');
  for (const invalid of [evidence({ flightFrames: 900 }), evidence({ flightFrames: 900.5 }),
    evidence({ limitFrames: 899 }), evidence({ wasAirborne: false }),
    evidence({ flightFrames: Infinity }), evidence({ kind: 'miss-anytime' })]) {
    assert.throws(() => h.physics.issueAirborneTerminalVerdict(h.attempt, input({ evidence: invalid })), /strict 900-frame/);
  }
  assert.throws(() => h.physics.issueAirborneTerminalVerdict(h.attempt, input({ atMs: 1000 })), /contradicts/);
  assert.throws(() => h.physics.issueAirborneTerminalVerdict(h.attempt, input({ result: 'MAKE' })), /only issue/);
  assert.throws(() => h.physics.issueAirborneTerminalVerdict(h.attempt, input({ reason: 'off-target' })), /only issue/);
  assert.throws(() => h.physics.issueAirborneTerminalVerdict(h.attempt, input({ pose: 'upright' })), /only issue/);
  let read = false;
  const hostile = Object.defineProperty(evidence(), 'flightFrames', { get() { read = true; return 901; } });
  assert.throws(() => h.physics.issueAirborneTerminalVerdict(h.attempt, input({ evidence: hostile })), /own data field/);
  assert.equal(read, false);
  h.physics.markContact(h.attempt, 600); h.physics.markSettling(h.attempt, 617);
  h.physics.markAirborne(h.attempt, 700);
  assert.throws(() => h.physics.issueAirborneTerminalVerdict(h.attempt, input()), /no prior scoring contact/,
    'a re-launched object cannot erase its earlier contact');
}
console.log('Airborne authority: strict measured 901st-frame MISS, no fabricated contact, one-use evidence, invalid/early/make paths rejected');
