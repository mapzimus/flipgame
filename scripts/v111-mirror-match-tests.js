'use strict';

const assert = require('node:assert/strict');
const mirror = require('../js/v111-mirror-match.js');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('PASS', name);
  } catch (error) {
    console.error('FAIL', name);
    throw error;
  }
}

function roster(count) {
  return Array.from({ length: count }, (_, playerIndex) => ({
    playerId: `stable-${playerIndex + 1}`,
    playerIndex,
    active: true,
  }));
}

function source() { return { playerId: 'stable-1', playerIndex: 0 }; }
function launch() {
  return { vector: { x: -827.25, y: -2910.5 }, spin: -0.187, seed: 0x5eed1234 };
}
function profile() {
  return {
    id: 'bottle-standard-v111', gravity: 1.5, frictionAir: 0.024,
    friction: 0.85, restitution: 0.02, spinScale: 1, requireFlip: true,
    nested: { targetHalfWidth: 84 },
  };
}
function arm(queue, count) {
  return queue.arm({ source: source(), activeRoster: roster(count), launch: launch(), profile: profile() });
}

test('exports the frozen v1 browser and Node call shape', () => {
  assert.equal(mirror.SCHEMA, 'MirrorMatchQueueV1');
  assert.equal(mirror.CLAIM_SCHEMA, 'MirrorMatchClaimV1');
  assert.equal(mirror.VERSION, 1);
  assert.equal(Object.isFrozen(mirror), true);
  assert.equal(Object.isFrozen(mirror.POLICY), true);
  const queue = mirror.create({ matchId: 'match-111' });
  for (const method of ['arm', 'peek', 'claim', 'consume', 'syncRoster', 'snapshot', 'cleanup']) {
    assert.equal(typeof queue[method], 'function');
  }
  assert.equal(Object.isFrozen(queue), true);
});

test('queues every other active opponent for all 2 through 8 player rosters', () => {
  for (let count = 2; count <= 8; count++) {
    const queue = mirror.create({ matchId: `players-${count}` });
    const state = arm(queue, count);
    assert.equal(state.targets.length, count - 1);
    assert.deepEqual(state.targets.map(entry => entry.playerId), roster(count).slice(1).map(entry => entry.playerId));
    assert.equal(state.targets.some(entry => entry.playerId === source().playerId), false);
    assert.equal(state.source.playerId, source().playerId);
    assert.equal(state.source.playerIndex, source().playerIndex);
  }
});

test('claims are order-independent, one per opponent, and copy exact detached physical inputs', () => {
  const queue = mirror.create({ matchId: 'order' });
  const inputLaunch = launch();
  const inputProfile = profile();
  queue.arm({ source: source(), activeRoster: roster(8), launch: inputLaunch, profile: inputProfile });

  inputLaunch.vector.x = 999;
  inputProfile.nested.targetHalfWidth = 1;
  for (const player of roster(8).slice(1).reverse()) {
    const before = queue.peek(player);
    assert.equal(before.launch.vector.x, -827.25);
    assert.equal(before.profile.nested.targetHalfWidth, 84);
    const claimed = queue.claim(player);
    assert.deepEqual(claimed, before);
    assert.notStrictEqual(claimed.launch, inputLaunch);
    assert.notStrictEqual(claimed.profile, inputProfile);
    assert.equal(Object.isFrozen(claimed.launch.vector), true);
    assert.deepEqual(queue.claim(player), claimed, 'claim is reconnect-safe while unresolved');
    const result = queue.consume({ playerId: player.playerId, verdict: { phase: 'resolved', result: 'MAKE' } });
    assert.equal(result.scoring.rawPoints, 1);
    assert.equal(queue.peek(player), null);
    assert.throws(() => queue.consume({ playerId: player.playerId, verdict: 'MAKE' }), /claim/);
  }
  assert.equal(queue.snapshot().status, 'complete');
});

test('claim disables events, copied rewards, side effects, and Mirror nesting', () => {
  const queue = mirror.create();
  arm(queue, 2);
  const claim = queue.claim({ playerId: 'stable-2', playerIndex: 1 });
  assert.deepEqual(claim.policy, {
    eventMode: 'disabled',
    eventPolicy: { eventsDisabled: true, excludedEventIds: [] },
    copiedEventId: null,
    copyRewards: false,
    copySideEffects: false,
    nestingDisabled: true,
    baseVerdictOnly: true,
  });
  assert.equal(Object.prototype.hasOwnProperty.call(claim.launch, 'eventId'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(claim, 'reward'), false);
  const miss = queue.consume({ playerId: 'stable-2', verdict: 'MISS' });
  assert.deepEqual(miss.scoring, {
    eventId: null, rawPoints: 0, reward: null, sideEffects: [], baseVerdictOnly: true,
  });
});

test('source MAKE or MISS is irrelevant because any resolved Mirror source arms the queue', () => {
  for (const sourceResult of ['MAKE', 'MISS']) {
    const queue = mirror.create({ matchId: sourceResult });
    queue.arm({
      source: { ...source(), result: sourceResult },
      activeRoster: roster(2),
      launch: launch(),
      profile: profile(),
    });
    assert.ok(queue.claim(roster(2)[1]));
  }
});

test('a copy cannot be consumed during airborne, contact, or settling phases', () => {
  for (const phase of ['airborne', 'contact', 'settling']) {
    const queue = mirror.create({ matchId: phase });
    arm(queue, 2);
    queue.claim(roster(2)[1]);
    assert.throws(() => queue.consume({ playerId: 'stable-2', verdict: { phase, result: 'MISS' } }), /final verdict/);
    assert.equal(queue.snapshot().targets[0].status, 'claimed');
  }
});

test('eliminated opponents are skipped without consuming or reordering remaining copies', () => {
  const queue = mirror.create({ matchId: 'elimination' });
  arm(queue, 5);
  const remaining = roster(5).filter(player => player.playerId !== 'stable-3');
  queue.syncRoster(remaining);
  let state = queue.snapshot();
  assert.equal(state.targets.find(entry => entry.playerId === 'stable-3').status, 'skipped');
  assert.equal(state.targets.find(entry => entry.playerId === 'stable-2').status, 'pending');
  assert.equal(state.targets.find(entry => entry.playerId === 'stable-4').status, 'pending');
  assert.equal(queue.claim({ playerId: 'stable-3', playerIndex: 2 }), null);

  queue.claim({ playerId: 'stable-5', playerIndex: 4 });
  queue.consume({ playerId: 'stable-5', verdict: 'MISS' });
  state = queue.snapshot();
  assert.equal(state.targets.find(entry => entry.playerId === 'stable-2').status, 'pending');
  assert.equal(state.targets.find(entry => entry.playerId === 'stable-4').status, 'pending');
});

test('snapshots round-trip losslessly and reconnect preserves an unresolved claim', () => {
  const original = mirror.create({ matchId: 'saved-match' });
  arm(original, 4);
  const originalClaim = original.claim({ playerId: 'stable-2', playerIndex: 1 });
  const encoded = JSON.stringify(original.snapshot());
  const restored = mirror.restore(JSON.parse(encoded), { activeRoster: roster(4) });
  assert.equal(JSON.stringify(restored.snapshot()), encoded);
  assert.deepEqual(restored.peek({ playerId: 'stable-2', playerIndex: 1 }), originalClaim);
  assert.deepEqual(restored.claim({ playerId: 'stable-2', playerIndex: 1 }), originalClaim);
  restored.consume({ playerId: 'stable-2', verdict: { phase: 'resolved', result: 'MAKE', pose: 'cap', onCap: true } });
  assert.equal(original.snapshot().targets[0].status, 'claimed', 'restored queue is detached from source state');
  assert.equal(restored.snapshot().targets[0].verdict.onCap, true);
});

test('restore skips players eliminated while disconnected but preserves other target states', () => {
  const queue = mirror.create({ matchId: 'reconnect-elimination' });
  arm(queue, 4);
  queue.claim(roster(4)[1]);
  const activeAfterReconnect = [roster(4)[0], roster(4)[1], roster(4)[3]];
  const restored = mirror.restore(JSON.parse(JSON.stringify(queue.snapshot())), {
    activeRoster: activeAfterReconnect,
  });
  const state = restored.snapshot();
  assert.equal(state.targets.find(entry => entry.playerId === 'stable-2').status, 'claimed');
  assert.equal(state.targets.find(entry => entry.playerId === 'stable-3').status, 'skipped');
  assert.equal(state.targets.find(entry => entry.playerId === 'stable-4').status, 'pending');
});

test('match-end cleanup removes every replay input and target', () => {
  const queue = mirror.create({ matchId: 'cleanup' });
  arm(queue, 8);
  queue.claim(roster(8)[4]);
  const state = queue.cleanup('match-ended');
  assert.equal(state.status, 'cleaned');
  assert.equal(state.cleanupReason, 'match-ended');
  assert.equal(state.queueId, null);
  assert.equal(state.source, null);
  assert.equal(state.launch, null);
  assert.equal(state.profile, null);
  assert.deepEqual(state.targets, []);
  assert.equal(queue.peek(roster(8)[4]), null);
});

test('malformed, stale, unsafe, and policy-tampered snapshots are rejected', () => {
  const queue = mirror.create({ matchId: 'malformed' });
  arm(queue, 3);
  const valid = JSON.parse(JSON.stringify(queue.snapshot()));
  const mutations = [
    state => { state.schema = 'MirrorMatchQueueV2'; },
    state => { state.version = 2; },
    state => { state.status = 'complete'; },
    state => { state.queueId = 'forged'; },
    state => { state.policy.eventMode = 'normal'; },
    state => { state.targets[0].playerId = state.source.playerId; },
    state => { state.targets[1].playerId = state.targets[0].playerId; },
    state => { state.targets[0].status = 'consumed'; },
    state => { state.launch.vector.x = null; },
    state => { state.sequence = -1; },
  ];
  for (const mutate of mutations) {
    const bad = JSON.parse(JSON.stringify(valid));
    mutate(bad);
    assert.throws(() => mirror.restore(bad));
  }
  assert.throws(() => mirror.restore({}));
  assert.throws(() => mirror.create({ matchId: 'other', snapshot: valid }), /different match/);
  assert.throws(() => queue.arm({ source: source(), activeRoster: roster(3), launch: launch(), profile: profile() }), /pending/);
  assert.throws(() => mirror.create().arm({
    source: source(), activeRoster: roster(2), launch: launch(), profile: { gravity: NaN },
  }), /finite/);
});

test('the complete workflow never reads Math.random or an injected RNG', () => {
  const originalRandom = Math.random;
  let injectedCalls = 0;
  Math.random = () => { throw new Error('Mirror Match touched Math.random'); };
  try {
    const queue = mirror.create({ matchId: 'no-rng', rng: () => { injectedCalls++; return 0.5; } });
    arm(queue, 8);
    for (const player of roster(8).slice(1)) {
      queue.peek(player);
      queue.claim(player);
      queue.consume({ playerId: player.playerId, verdict: player.playerIndex % 2 ? 'MAKE' : 'MISS' });
    }
    const restored = mirror.restore(JSON.parse(JSON.stringify(queue.snapshot())), { rng: () => { injectedCalls++; } });
    assert.equal(restored.snapshot().status, 'complete');
    restored.cleanup();
    assert.equal(injectedCalls, 0);
  } finally {
    Math.random = originalRandom;
  }
});

console.log(`\nMirror Match v111: ${passed} tests passed.`);
