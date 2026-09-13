'use strict';
const assert = require('node:assert/strict');
const Rules = require('../js/v112-rules.js');
const Landing = require('../js/v112-landing-verdict.js');
function fixture(id, contact = true) {
  const rules = Rules.createRulesAdapter({ matchId: id, formatId: 'classic',
    players: [{ id: 'one' }, { id: 'two' }], startingLives: 3 });
  const authority = Landing.createAuthority({ matchId: id,
    rulesConnector: rules.claimLandingConnector(), laneIds: ['main'] });
  const physics = authority.claimPhysicsLane('main'), consumer = authority.claimRulesLane('main');
  const handle = physics.beginFlip({ flipId: 'flip-1', playerId: 'one', launchedAtMs: 0 });
  if (contact) { physics.markContact(handle, 100); physics.markSettling(handle, 116); }
  return { rules, physics, consumer, handle };
}
function evidence(patch = {}) {
  return { schema: 'LandingDeadlineEvidenceV1', onLandingPlane: true,
    rotationComplete: true, ...patch };
}
function input(patch = {}) {
  return { result: 'MAKE', pose: 'upright', reason: 'upright-settle-limit',
    atMs: 4100, evidence: evidence(), ...patch };
}
for (const pose of ['upright', 'cap']) {
  const h = fixture('deadline-' + pose), request = input({ pose });
  const verdict = h.physics.issueDeadlineVerdict(h.handle, request);
  assert.equal(verdict.result, 'MAKE'); assert.equal(verdict.pose, pose);
  assert.equal(verdict.deadlineReached, true); assert.equal(verdict.timedOut, false);
  assert.equal(verdict.settleMs, 4000);
  request.evidence.onLandingPlane = false;
  assert.equal(verdict.deadlineEvidence.onLandingPlane, true, 'evidence is copied at issuance');
  assert(Object.isFrozen(verdict.deadlineEvidence));
  assert.throws(() => h.consumer.resolve(JSON.parse(JSON.stringify(verdict))), /exact physics-issued/);
  const resolved = h.consumer.resolve(verdict);
  assert.equal(resolved.outcome.landing.pose, pose);
  assert.equal(h.rules.snapshot().stake, pose === 'cap' ? 2 : 1);
  assert.throws(() => h.consumer.resolve(verdict), /already been consumed/);
  assert.throws(() => h.physics.issueDeadlineVerdict(h.handle, input()), /reuse an issued/);
}
{
  const h = fixture('deadline-invalid');
  assert.throws(() => h.physics.issueDeadlineVerdict(h.handle, input({ atMs: 4099 })), /full 4000/);
  for (const invalid of [evidence({ onLandingPlane: false }), evidence({ rotationComplete: false })]) {
    assert.throws(() => h.physics.issueDeadlineVerdict(h.handle, input({ evidence: invalid })), /on-plane completed rotation/);
  }
  assert.throws(() => h.physics.issueDeadlineVerdict(h.handle, input({ pose: 'other' })), /explicit upright\/cap/);
  assert.throws(() => h.physics.issueDeadlineVerdict(h.handle, input({ result: 'MISS' })), /explicit miss pose/);
  assert.throws(() => h.physics.issueDeadlineVerdict(h.handle, input({ evidence: evidence({ onLandingPlane: 1 }) })), /exact measured/);
  let read = false;
  const accessor = Object.defineProperty(evidence(), 'onLandingPlane', { get() { read = true; return true; } });
  assert.throws(() => h.physics.issueDeadlineVerdict(h.handle, input({ evidence: accessor })), /own data field/);
  assert.equal(read, false);
  assert.throws(() => h.physics.issueDeadlineVerdict(h.handle, input({ eventId: 'wind-tunnel' })), /unsupported field/);
  assert.throws(() => h.physics.issueSettledVerdict(h.handle,
    { result: 'MAKE', pose: 'upright', atMs: 4100, stableForMs: 100 }), /passed its settle limit/);
  assert.throws(() => h.physics.issueTimeoutVerdict(h.handle,
    { result: 'MAKE', pose: 'upright', atMs: 4100, stableForMs: 0 }), /must be a miss/);
  assert.equal(h.physics.issueTimeoutVerdict(h.handle,
    { result: 'MISS', atMs: 4100, stableForMs: 0 }).timedOut, true);
}
{
  const h = fixture('off-plane-deadline');
  h.physics.markAirborne(h.handle, 300);
  const verdict = h.physics.issueDeadlineVerdict(h.handle, input({ result: 'MISS', pose: 'miss',
    reason: 'off-plane-settle-limit', evidence: evidence({ onLandingPlane: false }) }));
  assert.equal(h.consumer.resolve(verdict).outcome.landing.result, 'MISS');
  assert.equal(verdict.contacts, 1);
}
{
  const h = fixture('airborne-is-not-deadline', false);
  assert.throws(() => h.physics.issueDeadlineVerdict(h.handle, input({ atMs: 18000 })), /real first contact/);
}
{
  const h = fixture('recontact-keeps-original-deadline');
  h.physics.markAirborne(h.handle, 300); h.physics.markContact(h.handle, 4100);
  const verdict = h.physics.issueDeadlineVerdict(h.handle, input());
  assert.equal(verdict.settleMs, 4000); assert.equal(verdict.contacts, 2);
  assert.equal(verdict.finalSettleMs, 0, 'the first-contact allowance is never restarted by a bounce');
}
console.log('Landing deadline: real-contact boundary, upright/cap preservation, plane/rotation evidence, off-plane miss and unchanged timeout semantics passed');
