// v112-event-rules-adapter.js -- sole event-verdict to match-rule boundary.
(function (root, factory) {
  'use strict';
  var Kernel = root && root.FlipgameV112EventKernel;
  if (typeof module === 'object' && module.exports) Kernel = require('./v112-event-kernel.js');
  var api = factory(Kernel);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV112EventRulesAdapter = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (Kernel) {
  'use strict';

  if (!Kernel || Kernel.schema !== 'FlipgameEventKernelV2') {
    throw new Error('FlipgameV112EventKernel V2 must load before v112-event-rules-adapter.js');
  }

  var ROULETTE_MULTIPLIERS = Object.freeze([1, 2, 3, 4, 4, 3, 2, 1]);
  var PLINKO_SLOTS = Object.freeze([
    'lives-doubled', 'everyone-else-halved', 'always-magnet', 'automatic-loss',
    'automatic-win', 'automatic-loss', 'always-magnet',
    'everyone-else-halved', 'lives-doubled',
  ]);

  function stableHash(value) {
    var text = String(value);
    var hash = 2166136261;
    for (var index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
  function hex32(value) { return (value >>> 0).toString(16).padStart(8, '0'); }
  function callerId(value) {
    if (value == null) return null;
    return Kernel.primitiveString(value, 'resolution callerId', 96, false);
  }
  function token(namespace, ordinal, caller) {
    var material = namespace + '|' + ordinal + '|' +
      encodeURIComponent(caller == null ? '' : caller) + '|pressure-signal';
    return hex32(stableHash('a|' + material)) + hex32(stableHash('b|' + material));
  }
  function identityId(namespace, ordinal, tokenValue, caller) {
    return 'ri1|' + namespace + '|' + ordinal + '|' + tokenValue + '|' +
      (caller == null ? '' : encodeURIComponent(caller));
  }
  function normalizeIdentity(value) {
    if (!Kernel.isPlainObject(value)) throw new TypeError('ResolutionIdentityV1 is required');
    Kernel.exactKeys(value, ['schema', 'namespace', 'ordinal', 'token', 'callerId', 'id'],
      'ResolutionIdentityV1');
    if (value.schema !== 'ResolutionIdentityV1') throw new TypeError('ResolutionIdentityV1 schema is invalid');
    var namespace = Kernel.primitiveString(value.namespace, 'resolution namespace', 320, false);
    if (namespace.indexOf('|') >= 0) throw new TypeError('resolution namespace cannot contain a pipe');
    var ordinal = Kernel.whole(value.ordinal, 'resolution ordinal', 1, Number.MAX_SAFE_INTEGER);
    var caller = callerId(value.callerId);
    var expectedToken = token(namespace, ordinal, caller);
    var suppliedToken = Kernel.primitiveString(value.token, 'resolution token', 32, false);
    var expectedId = identityId(namespace, ordinal, expectedToken, caller);
    var suppliedId = Kernel.primitiveString(value.id, 'resolution id', 640, false);
    if (suppliedToken !== expectedToken || suppliedId !== expectedId) {
      throw new Error('ResolutionIdentityV1 token or id is invalid');
    }
    return Kernel.deepFreeze({ schema: 'ResolutionIdentityV1', namespace: namespace,
      ordinal: ordinal, token: suppliedToken, callerId: caller, id: suppliedId });
  }
  function fingerprint(outcome, formatId) {
    return stableHash(formatId + '|' + JSON.stringify(outcome)) + ':' +
      stableHash('b|' + formatId + '|' + JSON.stringify(outcome));
  }
  function metadata(outcome) {
    return { eventId: outcome.eventId, eventClass: outcome.eventClass,
      laneId: outcome.laneId, launchClaimId: outcome.launchClaimId,
      outcomeFacts: outcome.facts.values };
  }

  function validatePhysicalVerdict(outcome) {
    var id = outcome.eventId;
    var made = outcome.result === 'MAKE';
    var facts = outcome.facts.values;
    function madeRequires(condition, message) {
      if (made && !condition) throw new Error(id + ' cannot report MAKE: ' + message);
    }
    function exactVerdict(condition, message) {
      if (made !== !!condition) throw new Error(id + ' verdict conflicts with ' + message);
    }
    if (id === 'bouncy-bottle') madeRequires(facts.fullySettled, 'bounce sequence is not settled');
    if (id === 'alien-invasion') exactVerdict(facts.bankCount >= 1 && facts.ringEntered,
      'bank-and-ring facts');
    if (id === 'trampoline') madeRequires(facts.relaunchCount >= 1 && facts.returnedToTable,
      'the return landing did not occur');
    if (id === 'portal-pair') madeRequires(facts.portalPasses >= 1, 'no portal was traversed');
    if (id === 'tether-swing') madeRequires(facts.cableAttached && facts.released,
      'the tether arc was incomplete');
    if (id === 'mitosis') exactVerdict(facts.landedCopies >= 1, 'clone landing evidence');
    if (id === 'double-flip') madeRequires(facts.rotations >= 2, 'fewer than two rotations completed');
    if (id === 'ceiling-flip') madeRequires(facts.ceilingContact, 'the ceiling plane was not reached');
    if (id === 'boomerang') madeRequires(facts.returnedToOrigin, 'the marked return was not reached');
    if (id === 'cap-toss') exactVerdict(facts.bodyLanded && facts.topLanded,
      'body/top collider verdicts');
  }

  function classicReward(outcome, rulesInput, output) {
    var id = outcome.eventId;
    var facts = outcome.facts.values;
    if (id === 'mirror-match') {
      output.deferred = { schema: 'EventDeferredEffectV1', kind: 'mirror-match',
        normalizedLaunchX: facts.normalizedLaunchX,
        normalizedLaunchY: facts.normalizedLaunchY, spin: facts.spin,
        profileSeed: facts.profileSeed, physicsProfileId: facts.physicsProfileId,
        nestedEvents: false };
    }
    if (rulesInput.result !== 'MAKE') return;
    if (id === 'rainbow-corkscrew') rulesInput.effects.additiveLives = 1;
    if (id === 'golden-flip') rulesInput.golden = true;
    if (id === 'shrink-ray') rulesInput.effects.additiveLives = rulesInput.pose === 'cap' ? 3 : 2;
    if (id === 'mitosis' && facts.landedCopies === 2) rulesInput.effects.additiveLives = 3;
    if (id === 'double-flip') {
      rulesInput.effects.lifeMultiplier = 2;
      rulesInput.effects.halveOpponents = true;
    }
    if (id === 'heart-rush') rulesInput.effects.additiveLives = 3;
    if (id === 'roulette-table') rulesInput.effects.lifeMultiplier =
      ROULETTE_MULTIPLIERS[facts.sectorIndex];
    if (id === 'cap-toss') rulesInput.effects.additiveLives = 5;
    if (id === 'life-drain') rulesInput.effects.setOpponentsTo = 1;
  }

  function teamReward(outcome, rulesInput, output) {
    var id = outcome.eventId;
    var facts = outcome.facts.values;
    if (id === 'mirror-match') {
      output.deferred = { schema: 'EventDeferredEffectV1', kind: 'mirror-match',
        normalizedLaunchX: facts.normalizedLaunchX,
        normalizedLaunchY: facts.normalizedLaunchY, spin: facts.spin,
        profileSeed: facts.profileSeed, physicsProfileId: facts.physicsProfileId,
        nestedEvents: false };
    }
    if (rulesInput.result !== 'MAKE') return;
    if (id === 'golden-flip') rulesInput.golden = true;
    if (id === 'rainbow-corkscrew') rulesInput.effects.additivePoints = 1;
    // These are total raw flip values, not bonuses on top of the base point.
    if (id === 'shrink-ray') rulesInput.rawPoints = rulesInput.pose === 'cap' ? 3 : 2;
    if (id === 'mitosis' && facts.landedCopies === 2) rulesInput.rawPoints = 3;
    if (id === 'double-flip') {
      rulesInput.effects.scoreMultiplier = 2;
      rulesInput.effects.halveOpponentRound = true;
    }
    if (id === 'heart-rush') rulesInput.effects.additivePoints = 3;
    if (id === 'roulette-table') rulesInput.effects.scoreMultiplier =
      ROULETTE_MULTIPLIERS[facts.sectorIndex];
    if (id === 'cap-toss') rulesInput.rawPoints = 5;
  }

  function applyPlinko(outcome, formatId, rulesInput, output) {
    var slot = PLINKO_SLOTS[outcome.facts.values.slotIndex];
    rulesInput.result = slot === 'automatic-loss' ? 'MISS' : 'MAKE';
    rulesInput.pose = slot === 'automatic-loss' ? 'miss' : 'upright';
    if (slot === 'automatic-win') {
      output.terminalOutcome = 'current-win';
      if (formatId === 'team-clash') rulesInput.effects.automaticWinner = 'current';
    } else if (slot === 'automatic-loss') {
      output.terminalOutcome = 'current-loss';
      if (formatId === 'team-clash') rulesInput.effects.automaticWinner = 'opponent';
      else rulesInput.effects.forceEliminateActor = true;
    } else if (slot === 'lives-doubled') {
      if (formatId === 'team-clash') rulesInput.effects.scoreMultiplier = 2;
      else rulesInput.effects.lifeMultiplier = 2;
    } else if (slot === 'everyone-else-halved') {
      if (formatId === 'team-clash') rulesInput.effects.halveOpponentScore = true;
      else rulesInput.effects.halveOpponents = true;
    } else if (slot === 'always-magnet') {
      rulesInput.effects.grantAlwaysMagnet = true;
    }
  }

  function mapOutcome(outcome, formatId) {
    validatePhysicalVerdict(outcome);
    var rulesInput = { result: outcome.result, pose: outcome.pose,
      effects: { metadata: metadata(outcome) } };
    var output = { terminalOutcome: null, deferred: null };
    if (outcome.eventId === 'plinko') applyPlinko(outcome, formatId, rulesInput, output);
    else if (formatId === 'team-clash') teamReward(outcome, rulesInput, output);
    else classicReward(outcome, rulesInput, output);
    return Kernel.immutableData({ rulesInput: rulesInput,
      terminalOutcome: output.terminalOutcome, deferred: output.deferred }, 'event rule mapping');
  }

  function createRulesAdapter(options) {
    if (!Kernel.isPlainObject(options)) throw new TypeError('Rules adapter options are required');
    Kernel.exactKeys(options, ['namespace', 'resolvedThrough', 'authority'], 'Rules adapter options');
    var namespace = Kernel.primitiveString(options.namespace, 'rules namespace', 320, false);
    if (namespace.indexOf('|') >= 0) throw new TypeError('rules namespace cannot contain a pipe');
    var resolvedThrough = options.resolvedThrough == null ? 0
      : Kernel.whole(options.resolvedThrough, 'resolvedThrough', 0, Number.MAX_SAFE_INTEGER - 1);
    var authority = options.authority;
    if (!authority || typeof authority.verifyOutcome !== 'function') {
      throw new TypeError('Rules adapter requires an EventAuthorityV1 rules capability');
    }
    var nextOrdinal = resolvedThrough + 1;
    var lastResolutionId = null;
    var lastFingerprint = null;
    var lastOutcome = null;
    var claimedOutcomes = new WeakSet();
    var closed = false;

    function resolve(value) {
      if (closed) throw new Error('Event rules adapter is closed');
      if (!Kernel.isPlainObject(value)) throw new TypeError('Event rules resolution request is required');
      Kernel.exactKeys(value, ['resolutionIdentity', 'formatId', 'outcome'],
        'Event rules resolution request');
      var identity = normalizeIdentity(value.resolutionIdentity);
      var formatId = Kernel.primitiveString(value.formatId, 'event formatId', 32, false);
      if (['classic', 'cup', 'team-clash'].indexOf(formatId) < 0) {
        throw new TypeError('Event rules adapter does not support format: ' + formatId);
      }
      var outcome = value.outcome;
      if (!authority.verifyOutcome(outcome)) {
        throw new Error('Rules adapter accepts only a kernel-issued runtime outcome');
      }
      if (formatId === 'team-clash' && outcome.eventId === 'life-drain') {
        throw new Error('Life Drain is excluded from Team Clash');
      }
      var mark = fingerprint(outcome, formatId);
      if (identity.namespace !== namespace) throw new Error('Foreign resolution identity');
      if (identity.ordinal !== nextOrdinal) {
        if (identity.ordinal === nextOrdinal - 1 && identity.id === lastResolutionId &&
            mark === lastFingerprint && outcome === lastOutcome) {
          return Kernel.immutableData({ schema: 'EventRulesResolutionV1',
            namespace: namespace, resolutionId: identity.id, eventId: outcome.eventId,
            claimed: false, duplicate: true, rulesInput: null,
            terminalOutcome: null, deferred: null }, 'duplicate event rules resolution');
        }
        throw new Error('Duplicate, stale, future, or reordered resolution identity');
      }
      if (claimedOutcomes.has(outcome)) {
        throw new Error('Runtime outcome was already consumed by a prior resolution identity');
      }
      var mapped = mapOutcome(outcome, formatId);
      var result = Kernel.immutableData({ schema: 'EventRulesResolutionV1',
        namespace: namespace, resolutionId: identity.id, eventId: outcome.eventId,
        claimed: true, duplicate: false, rulesInput: mapped.rulesInput,
        terminalOutcome: mapped.terminalOutcome, deferred: mapped.deferred },
      'event rules resolution');
      resolvedThrough = identity.ordinal;
      nextOrdinal = identity.ordinal + 1;
      lastResolutionId = identity.id;
      lastFingerprint = mark;
      lastOutcome = outcome;
      claimedOutcomes.add(outcome);
      return result;
    }

    function snapshot() {
      return Object.freeze({ schema: 'EventRulesAdapterSnapshotV1', namespace: namespace,
        closed: closed, resolvedThrough: resolvedThrough, nextOrdinal: nextOrdinal,
        lastResolutionId: lastResolutionId });
    }
    function cleanup() {
      closed = true;
      lastResolutionId = null;
      lastFingerprint = null;
      lastOutcome = null;
      return snapshot();
    }
    return Object.freeze({ schema: 'EventRulesAdapterV2', namespace: namespace,
      resolve: resolve, snapshot: snapshot, cleanup: cleanup });
  }

  return Object.freeze({ schema: 'FlipgameEventRulesAdapterV2',
    ROULETTE_MULTIPLIERS: ROULETTE_MULTIPLIERS, PLINKO_SLOTS: PLINKO_SLOTS,
    createRulesAdapter: createRulesAdapter });
});
