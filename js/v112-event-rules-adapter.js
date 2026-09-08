// v112-event-rules-adapter.js -- the sole v1.12 fact-to-rule mapper.
// Event packs report physical facts; this adapter validates them and emits one
// idempotently claimable rules input. It never trusts a pack-supplied reward.
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

  if (!Kernel || typeof Kernel.normalizeOutcomeFacts !== 'function') {
    throw new Error('FlipgameV112EventKernel must load before v112-event-rules-adapter.js');
  }

  var ROULETTE_MULTIPLIERS = Object.freeze([1, 2, 3, 4, 4, 3, 2, 1]);
  var PLINKO_SLOTS = Object.freeze([
    'lives-doubled', 'everyone-else-halved', 'always-magnet', 'automatic-loss',
    'automatic-win', 'automatic-loss', 'always-magnet',
    'everyone-else-halved', 'lives-doubled',
  ]);
  var REQUEST_KEYS = Object.freeze([
    'resolutionId', 'eventId', 'formatId', 'result', 'pose', 'facts',
  ]);

  function object(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }
  function required(value, label, maximum) {
    var text = String(value == null ? '' : value).trim();
    if (!text) throw new TypeError(label + ' is required');
    if (maximum != null && text.length > maximum) throw new RangeError(label + ' is too long');
    return text;
  }
  function canonical(value) {
    if (value == null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    return '{' + Object.keys(value).sort().map(function (key) {
      return JSON.stringify(key) + ':' + canonical(value[key]);
    }).join(',') + '}';
  }
  function effectMetadata(eventId, facts) {
    return { eventId: eventId, outcomeFacts: facts.values };
  }

  function normalizedRequest(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError('Event rules resolution request is required');
    }
    Object.keys(value).forEach(function (key) {
      if (REQUEST_KEYS.indexOf(key) < 0) {
        throw new TypeError('Event rules request has unsupported field: ' + key);
      }
    });
    var resolutionId = required(value.resolutionId, 'resolutionId', 320);
    var eventId = required(value.eventId, 'eventId', 64);
    if (!Object.prototype.hasOwnProperty.call(Kernel.FACT_SPECS, eventId)) {
      throw new TypeError('Unsupported eventId: ' + eventId);
    }
    var formatId = String(value.formatId || 'classic');
    if (['classic', 'cup', 'team-clash'].indexOf(formatId) < 0) {
      throw new TypeError('Event rules adapter does not support format: ' + formatId);
    }
    if (formatId === 'team-clash' && eventId === 'life-drain') {
      throw new Error('Life Drain is excluded from Team Clash');
    }
    var result = String(value.result || '').toUpperCase();
    if (result !== 'MAKE' && result !== 'MISS') throw new TypeError('Event result must be MAKE or MISS');
    var pose = result === 'MISS' ? 'miss' : String(value.pose || 'upright').toLowerCase();
    if (result === 'MAKE' && pose !== 'upright' && pose !== 'cap') {
      throw new TypeError('Event make pose must be upright or cap');
    }
    var facts = Kernel.normalizeOutcomeFacts(eventId, value.facts);
    return Kernel.deepFreeze({ resolutionId: resolutionId, eventId: eventId,
      formatId: formatId, result: result, pose: pose, facts: facts });
  }

  function validatePhysicalVerdict(request) {
    var id = request.eventId;
    var made = request.result === 'MAKE';
    var facts = request.facts.values;
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
    if (id === 'mitosis') exactVerdict(facts.landedCopies >= 1, 'clone landing count');
    if (id === 'double-flip') madeRequires(facts.rotations >= 2, 'fewer than two rotations completed');
    if (id === 'ceiling-flip') madeRequires(facts.ceilingContact, 'the ceiling plane was not reached');
    if (id === 'boomerang') madeRequires(facts.returnedToOrigin, 'the marked return was not reached');
    if (id === 'cap-toss') exactVerdict(facts.bodyLanded && facts.topLanded,
      'body/top landing facts');
    if (id === 'plinko') return;
  }

  function classicReward(request, rulesInput, output) {
    var id = request.eventId;
    var facts = request.facts.values;
    if (id === 'mirror-match') {
      output.deferred = { schema: 'EventDeferredEffectV1', kind: 'mirror-match',
        normalizedLaunchX: facts.normalizedLaunchX, normalizedLaunchY: facts.normalizedLaunchY,
        spin: facts.spin, profileSeed: facts.profileSeed,
        physicsProfileId: facts.physicsProfileId, nestedEvents: false };
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

  function teamReward(request, rulesInput, output) {
    var id = request.eventId;
    var facts = request.facts.values;
    if (id === 'mirror-match') {
      output.deferred = { schema: 'EventDeferredEffectV1', kind: 'mirror-match',
        normalizedLaunchX: facts.normalizedLaunchX, normalizedLaunchY: facts.normalizedLaunchY,
        spin: facts.spin, profileSeed: facts.profileSeed,
        physicsProfileId: facts.physicsProfileId, nestedEvents: false };
    }
    if (rulesInput.result !== 'MAKE') return;
    if (id === 'golden-flip') rulesInput.golden = true;
    if (id === 'rainbow-corkscrew') rulesInput.effects.additivePoints = 1;
    if (id === 'shrink-ray') rulesInput.effects.additivePoints = rulesInput.pose === 'cap' ? 3 : 2;
    if (id === 'mitosis' && facts.landedCopies === 2) rulesInput.effects.additivePoints = 3;
    if (id === 'double-flip') {
      rulesInput.effects.scoreMultiplier = 2;
      rulesInput.effects.halveOpponentRound = true;
    }
    if (id === 'heart-rush') rulesInput.effects.additivePoints = 3;
    if (id === 'roulette-table') rulesInput.effects.scoreMultiplier =
      ROULETTE_MULTIPLIERS[facts.sectorIndex];
    if (id === 'cap-toss') rulesInput.rawPoints = 5;
  }

  function applyPlinko(request, rulesInput, output) {
    var slotIndex = request.facts.values.slotIndex;
    var slot = PLINKO_SLOTS[slotIndex];
    rulesInput.result = slot === 'automatic-loss' ? 'MISS' : 'MAKE';
    rulesInput.pose = slot === 'automatic-loss' ? 'miss' : 'upright';
    if (slot === 'automatic-win') {
      output.terminalOutcome = 'current-win';
      if (request.formatId === 'team-clash') rulesInput.effects.automaticWinner = 'current';
    } else if (slot === 'automatic-loss') {
      output.terminalOutcome = 'current-loss';
      if (request.formatId === 'team-clash') rulesInput.effects.automaticWinner = 'opponent';
      else rulesInput.effects.forceEliminateActor = true;
    } else if (slot === 'lives-doubled') {
      if (request.formatId === 'team-clash') rulesInput.effects.scoreMultiplier = 2;
      else rulesInput.effects.lifeMultiplier = 2;
    } else if (slot === 'everyone-else-halved') {
      if (request.formatId === 'team-clash') rulesInput.effects.halveOpponentRound = true;
      else rulesInput.effects.halveOpponents = true;
    } else if (slot === 'always-magnet') {
      rulesInput.effects.grantAlwaysMagnet = true;
    }
  }

  function mapRequest(request) {
    validatePhysicalVerdict(request);
    var rulesInput = { result: request.result, pose: request.pose,
      effects: { metadata: effectMetadata(request.eventId, request.facts) } };
    var output = { terminalOutcome: null, deferred: null };
    if (request.eventId === 'plinko') applyPlinko(request, rulesInput, output);
    else if (request.formatId === 'team-clash') teamReward(request, rulesInput, output);
    else classicReward(request, rulesInput, output);
    return Kernel.deepFreeze({ rulesInput: rulesInput,
      terminalOutcome: output.terminalOutcome, deferred: output.deferred });
  }

  function createRulesAdapter(options) {
    var source = object(options);
    Object.keys(source).forEach(function (key) {
      if (key !== 'scopeId') throw new TypeError('Rules adapter has unsupported option: ' + key);
    });
    var scopeId = required(source.scopeId || 'local-match', 'rules adapter scopeId', 160);
    var claims = new Map();
    var closed = false;

    function resolve(value) {
      if (closed) throw new Error('Event rules adapter is closed');
      var request = normalizedRequest(value);
      var fingerprint = canonical(request);
      var prior = claims.get(request.resolutionId);
      if (prior) {
        if (prior.fingerprint !== fingerprint) {
          throw new Error('Resolution ID was reused with different event facts');
        }
        return Kernel.deepFreeze({ schema: 'EventRulesResolutionV1', scopeId: scopeId,
          resolutionId: request.resolutionId, eventId: request.eventId,
          claimed: false, duplicate: true, rulesInput: null,
          terminalOutcome: null, deferred: null });
      }
      var mapped = mapRequest(request);
      var result = Kernel.deepFreeze({ schema: 'EventRulesResolutionV1', scopeId: scopeId,
        resolutionId: request.resolutionId, eventId: request.eventId,
        claimed: true, duplicate: false, rulesInput: mapped.rulesInput,
        terminalOutcome: mapped.terminalOutcome, deferred: mapped.deferred });
      claims.set(request.resolutionId, { fingerprint: fingerprint, result: result });
      return result;
    }

    function snapshot() {
      return Object.freeze({ schema: 'EventRulesAdapterSnapshotV1', scopeId: scopeId,
        closed: closed, claims: claims.size });
    }
    function cleanup() {
      if (!closed) {
        closed = true;
        claims.clear();
      }
      return snapshot();
    }
    return Object.freeze({ schema: 'EventRulesAdapterV1', scopeId: scopeId,
      resolve: resolve, snapshot: snapshot, cleanup: cleanup });
  }

  return Object.freeze({ schema: 'FlipgameEventRulesAdapterV1',
    ROULETTE_MULTIPLIERS: ROULETTE_MULTIPLIERS, PLINKO_SLOTS: PLINKO_SLOTS,
    createRulesAdapter: createRulesAdapter });
});
