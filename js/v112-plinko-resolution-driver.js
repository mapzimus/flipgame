// v112-plinko-resolution-driver.js -- real-Matter Plinko to private Rules bridge.
//
// This module intentionally owns no renderer, clock, physics step or reward
// mutation.  A match coordinator gives it two direct host closures: one reads
// the current FlipgameV112PlinkoLive snapshot and one cleans that physical
// scene.  The driver verifies the complete fixed-tick/geometry/binding chain,
// derives the slot from the tethered contact chassis, issues one branded event
// outcome, cleans the board, and then lets the private Rules authority consume
// that outcome exactly once.
(function (factory) {
  'use strict';
  var nodeModule = null;
  try {
    if (typeof process === 'object' && process !== null &&
        typeof process.getBuiltinModule === 'function') nodeModule = process.getBuiltinModule('module');
  } catch (_) { nodeModule = null; }
  var commonJs = typeof nodeModule === 'function' && nodeModule._cache &&
    typeof module === 'object' && module !== null && module.constructor === nodeModule &&
    Object.getPrototypeOf(module) === nodeModule.prototype &&
    nodeModule._cache[module.filename] === module &&
    Object.prototype.hasOwnProperty.call(module, 'exports') &&
    module.require === nodeModule.prototype.require && typeof module.filename === 'string' &&
    typeof process === 'object' && process !== null && process.release &&
    process.release.name === 'node' && process.versions &&
    typeof process.versions.node === 'string';
  if (!commonJs) {
    throw new Error('v112-plinko-resolution-driver.js is a private CommonJS core and cannot initialize as a classic script');
  }
  module.exports = factory(module.require('./v112-event-kernel.js'),
    module.require('./v112-event-rules-adapter.js'));
})(function (Kernel, EventRules) {
  'use strict';

  if (!Kernel || Kernel.schema !== 'FlipgameEventKernelV2' ||
      !EventRules || EventRules.schema !== 'FlipgameEventRulesAdapterV2') {
    throw new Error('The private v1.12 event authority must load before the Plinko resolution driver');
  }

  var SCHEMA = 'FlipgamePlinkoResolutionDriverV1';
  var FIXED_TICK_HZ = Kernel.PLINKO_TRANSPORT.fixedTickHz;
  var FIXED_DT_MS = 1000 / FIXED_TICK_HZ;
  var BOARD_START_TICK = Math.round(
    Kernel.PLINKO_TRANSPORT.boardDropStartMs * FIXED_TICK_HZ / 1000);
  var RECOVERY_START_TICK = Math.round((
    Kernel.PLINKO_TRANSPORT.boardDropStartMs +
    Kernel.PLINKO_TRANSPORT.recoveryStartDropMs) * FIXED_TICK_HZ / 1000);
  var TIMEOUT_TICK = Math.round((
    Kernel.PLINKO_TRANSPORT.boardDropStartMs +
    Kernel.PLINKO_TRANSPORT.timeoutDropMs) * FIXED_TICK_HZ / 1000);
  var RELEASE_TICK = Math.round(
    Kernel.PLINKO_TRANSPORT.compressionEndMs * FIXED_TICK_HZ / 1000);
  var SLOT_KINDS = EventRules.PLINKO_SLOTS;
  var LEGACY_PRIZES = Object.freeze({
    'lives-doubled': 'double',
    'everyone-else-halved': 'halve',
    'always-magnet': 'magnet',
    'automatic-loss': 'lose',
    'automatic-win': 'win',
  });

  function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
  function plain(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var prototype = Object.getPrototypeOf(value);
    var crossRealmPlain = prototype && Object.getPrototypeOf(prototype) === null;
    return prototype === null || prototype === Object.prototype || crossRealmPlain;
  }
  function exact(value, keys, label) {
    if (!plain(value)) throw new TypeError(label + ' must be a plain object');
    var accepted = Object.create(null);
    keys.forEach(function (key) { accepted[key] = true; });
    Object.keys(value).forEach(function (key) {
      if (!accepted[key]) throw new TypeError(label + ' has unsupported field: ' + key);
    });
    keys.forEach(function (key) {
      if (!own(value, key)) throw new TypeError(label + ' requires ' + key);
    });
    return value;
  }
  function text(value, label, maximum) {
    if (typeof value !== 'string' || !value.trim() || value.length > maximum) {
      throw new TypeError(label + ' must be a non-empty bounded string');
    }
    return value.trim();
  }
  function finite(value, label, minimum, maximum) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError(label + ' must be a finite number');
    }
    if (minimum != null && value < minimum) throw new RangeError(label + ' is below its minimum');
    if (maximum != null && value > maximum) throw new RangeError(label + ' exceeds its maximum');
    return value;
  }
  function whole(value, label, minimum, maximum) {
    finite(value, label, minimum, maximum);
    if (!Number.isSafeInteger(value)) throw new TypeError(label + ' must be a safe integer');
    return value;
  }
  function bool(value, label) {
    if (typeof value !== 'boolean') throw new TypeError(label + ' must be boolean');
    return value;
  }
  function close(left, right, tolerance) {
    return Math.abs(left - right) <= (tolerance == null ? 1e-6 : tolerance);
  }
  function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
  function list(value, label) {
    if (!Array.isArray(value) || value.length > 32 ||
        value.some(function (entry) { return typeof entry !== 'string' || !entry; })) {
      throw new TypeError(label + ' must be a bounded string array');
    }
    if (new Set(value).size !== value.length) throw new TypeError(label + ' entries must be unique');
    return value.slice();
  }
  function immutable(value, label) { return Kernel.immutableData(value, label); }

  function recoveryCountAt(tick) {
    if (tick < RECOVERY_START_TICK) return 0;
    var ordinal = Math.floor((tick - RECOVERY_START_TICK) /
      Kernel.PLINKO_TRANSPORT.recoveryImpulseIntervalTicks) + 1;
    return Math.min(Kernel.PLINKO_TRANSPORT.recoveryImpulseLimit, ordinal);
  }

  function assertRulesNoContest(before, after) {
    if (after.sequence !== before.sequence + 1) {
      throw new Error('Plinko no-contest must advance only the resolution high-water');
    }
    if (before.schema === 'ClassicRulesStateV1') {
      if (after.attemptCounter !== before.attemptCounter + 1 ||
          after.rulesTurnCounter !== before.rulesTurnCounter ||
          after.currentPlayerIndex !== before.currentPlayerIndex ||
          after.stake !== before.stake || !same(after.players, before.players) ||
          !same(after.suddenDeath, before.suddenDeath) || !same(after.turn, before.turn)) {
        throw new Error('Classic Plinko no-contest changed the competitive turn');
      }
      return;
    }
    if (before.schema === 'CupRulesStateV1') {
      if (after.heatNumber !== before.heatNumber ||
          !same(after.currentHeat, before.currentHeat) ||
          !same(after.heatWins, before.heatWins) || !same(after.turn, before.turn)) {
        throw new Error('Cup Plinko no-contest changed the heat or competitive turn');
      }
      return;
    }
    if (before.schema === 'TeamClashRulesStateV1') {
      if (after.noContestCount !== before.noContestCount + 1 ||
          after.queuePosition !== before.queuePosition ||
          !same(after.scores, before.scores) || !same(after.roundRaw, before.roundRaw) ||
          !same(after.playerStats, before.playerStats) || !same(after.turn, before.turn)) {
        throw new Error('Team Clash Plinko no-contest changed the queued competitive turn');
      }
      return;
    }
    throw new TypeError('Unsupported Rules state for Plinko no-contest');
  }

  function create(optionsValue) {
    var options = exact(optionsValue || {}, ['rules', 'source', 'laneId'],
      'Plinko resolution driver options');
    var rules = options.rules;
    if (!rules || typeof rules.claimEventAuthority !== 'function' ||
        typeof rules.nextResolutionIdentity !== 'function' ||
        typeof rules.snapshot !== 'function') {
      throw new TypeError('A private Rules match adapter is required');
    }
    var source = exact(options.source || {}, ['snapshot', 'cleanup'],
      'Plinko resolution source');
    if (typeof source.snapshot !== 'function' || typeof source.cleanup !== 'function') {
      throw new TypeError('Plinko resolution source requires snapshot and cleanup functions');
    }
    var laneId = text(options.laneId, 'Plinko lane ID', 96);
    var eventAuthority = rules.claimEventAuthority();
    var lane = eventAuthority.createLane(laneId);
    var rulesBridge = EventRules.createRulesAdapter({ authority: eventAuthority.rules });
    var usedLaunchIds = new Set();
    var cycle = null;
    var closed = false;
    var lastResolution = null;

    function read() {
      var snapshot = source.snapshot();
      if (!snapshot || snapshot.schema !== 'PlinkoLiveSnapshotV1' ||
          !Object.isFrozen(snapshot) || !snapshot.adapter ||
          snapshot.adapter.schema !== 'PlinkoMatterSnapshotV1' ||
          !Object.isFrozen(snapshot.adapter)) {
        throw new TypeError('A frozen live Matter Plinko snapshot is required');
      }
      return snapshot;
    }

    function validateBoard(snapshot, geometry) {
      var board = snapshot.board;
      var adapterBoard = snapshot.adapter.board;
      if (!board || board.schema !== 'PlinkoLiveRenderBoardV1' ||
          !adapterBoard || adapterBoard.schema !== 'PlinkoMatterRenderBoardV1' ||
          board.authority !== geometry.fingerprint ||
          adapterBoard.fingerprint !== geometry.fingerprint ||
          board.rows !== 24 || board.pegs.length !== 252 ||
          board.dividers.length !== 8 || board.slots.length !== 9 ||
          adapterBoard.pegRows.length !== 24 || adapterBoard.pegs.length !== 252 ||
          adapterBoard.dividers.length !== 8 || adapterBoard.slots.length !== 9) {
        throw new Error('Live Plinko does not match the canonical 24-row, nine-slot board');
      }
      for (var index = 0; index < SLOT_KINDS.length; index += 1) {
        var expected = geometry.sensors[index];
        var publicSlot = board.slots[index];
        var hostSlot = adapterBoard.slots[index];
        if (publicSlot.index !== index || hostSlot.index !== index ||
            publicSlot.sensorRef !== expected.colliderRef ||
            hostSlot.sensorRef !== expected.colliderRef ||
            publicSlot.canonicalKind !== SLOT_KINDS[index] ||
            hostSlot.kind !== SLOT_KINDS[index] ||
            !same(publicSlot.bounds, expected.bounds) ||
            !same(hostSlot.bounds, expected.bounds)) {
          throw new Error('Live Plinko slot geometry or reward order diverged at slot ' + index);
        }
      }
    }

    function validateBinding(snapshot, expected) {
      var selected = snapshot.adapter.selected;
      if (snapshot.selectedBodyPreserved !== true || selected.sameBody !== true ||
          selected.genericCircle !== false ||
          selected.colliderRef !== 'body:flipper-main' ||
          selected.matterBodyId !== snapshot.selectedBodyId ||
          selected.contactChassis.colliderRef !== 'body:plinko-contact-chassis' ||
          selected.contactChassis.physicallyTethered !== true ||
          selected.contactChassis.shape !== 'rounded-capsule' ||
          selected.appearanceRevision !== expected.appearanceRevision ||
          selected.cosmeticId !== expected.cosmeticId ||
          selected.colliderFingerprint !== expected.colliderFingerprint ||
          !same(selected.authoredParts, expected.authoredParts) ||
          !same(selected.internalDynamics, expected.internalDynamics)) {
        throw new Error('Live Plinko substituted or detached the selected authored Flipper');
      }
    }

    function validateClock(snapshot) {
      var tick = whole(snapshot.tick, 'Plinko snapshot tick', 0, TIMEOUT_TICK);
      if (snapshot.adapter.tick !== tick || snapshot.adapter.fixedTickHz !== FIXED_TICK_HZ ||
          !close(snapshot.elapsedMs, tick * FIXED_DT_MS) ||
          !close(snapshot.adapter.elapsedMs, snapshot.elapsedMs)) {
        throw new Error('Plinko snapshot is not bound to the fixed 60 Hz host clock');
      }
      if (tick < cycle.lastTick) throw new Error('Plinko fixed-tick snapshots moved backwards');
      var signature = JSON.stringify({ tick: tick, selected: snapshot.adapter.selected,
        spring: snapshot.spring, boardEnabled: snapshot.boardEnabled,
        landing: snapshot.landing, recovery: snapshot.recovery,
        timedOut: snapshot.timedOut, contacts: snapshot.contactCount,
        contactDigest: snapshot.contactDigest });
      if (tick === cycle.lastTick) {
        if (signature !== cycle.lastSignature) {
          throw new Error('Plinko snapshot changed without a fixed physics tick');
        }
        return { duplicate: true, tick: tick };
      }
      var selected = snapshot.adapter.selected;
      var receipt = Kernel.issuePlinkoMotionEvidence(lane.runtime,
        cycle.binding, cycle.geometry, {
          schema: 'PlinkoHostMotionEvidenceV1', fixedTickHz: FIXED_TICK_HZ,
          startTick: cycle.lastTick + 1, endTick: tick,
          integratedTicks: tick - cycle.lastTick,
          objectColliderRef: 'body:flipper-main',
          transform: { x: selected.transform.x, y: selected.transform.y,
            angle: selected.transform.angle },
          velocity: { x: selected.velocity.x, y: selected.velocity.y },
          angularVelocity: selected.angularVelocity,
        });
      Kernel.consumePlinkoMotionEvidence(lane.runtime,
        cycle.binding, cycle.geometry, receipt);
      cycle.lastTick = tick;
      cycle.lastSignature = signature;
      cycle.lastMotion = receipt;
      return { duplicate: false, tick: tick };
    }

    function validatePhysicalPhases(snapshot) {
      var tick = snapshot.tick;
      var spring = snapshot.spring;
      if (!spring || typeof spring !== 'object') throw new Error('Plinko spring evidence is missing');
      if (tick < RELEASE_TICK) {
        if (spring.applied !== false || spring.compressed !== true ||
            spring.appliedTick != null || spring.impulse != null) {
          throw new Error('Plinko spring released before its exact fixed tick');
        }
      } else if (spring.applied !== true || spring.appliedTick !== RELEASE_TICK ||
          !spring.impulse || spring.impulse.x !== 0 ||
          spring.impulse.y !== -Kernel.PLINKO_TRANSPORT.releaseUpwardImpulse) {
        throw new Error('Plinko lacks its exact one-time trampoline impulse');
      }
      if (snapshot.boardEnabled !== (tick >= BOARD_START_TICK) ||
          snapshot.adapter.boardEnabled !== snapshot.boardEnabled) {
        throw new Error('Plinko peg field activation is not bound to the apex handoff');
      }
      var expectedRecovery = recoveryCountAt(tick);
      if (!snapshot.recovery || snapshot.recovery.limit !==
          Kernel.PLINKO_TRANSPORT.recoveryImpulseLimit ||
          snapshot.recovery.applied !== expectedRecovery ||
          snapshot.adapter.recovery.applied !== expectedRecovery) {
        throw new Error('Plinko recovery impulses diverged from the bounded schedule');
      }
      if (snapshot.timedOut !== (!snapshot.landing.settled && tick >= TIMEOUT_TICK) ||
          snapshot.adapter.timedOut !== snapshot.timedOut) {
        throw new Error('Plinko timeout is not derived from unresolved fixed-tick motion');
      }
    }

    function validateSnapshot(snapshot) {
      validateBoard(snapshot, cycle.geometry);
      validateBinding(snapshot, cycle.expectedBinding);
      var clock = validateClock(snapshot);
      validatePhysicalPhases(snapshot);
      if (typeof snapshot.contactDigest !== 'string' ||
          snapshot.contactDigest !== snapshot.adapter.contactDigest ||
          snapshot.contactCount !== snapshot.adapter.contactCount ||
          !Number.isSafeInteger(snapshot.contactCount) || snapshot.contactCount < 0 ||
          snapshot.contactCount > Kernel.LIMITS.contacts) {
        throw new Error('Plinko collision evidence is missing or exceeds its bounded authority');
      }
      return clock;
    }

    function deriveTerminal(snapshot) {
      var landing = snapshot.landing;
      if (snapshot.outcome) {
        if (snapshot.timedOut || !landing.settled ||
            landing.actualSensorContact !== true ||
            !Number.isSafeInteger(landing.slotIndex) || landing.slotIndex < 0 ||
            landing.slotIndex >= SLOT_KINDS.length ||
            landing.sensorRef !== 'sensor:plinko-slot-' + landing.slotIndex) {
          throw new Error('Plinko reward lacks a settled canonical sensor contact');
        }
        var chassis = snapshot.adapter.selected.contactChassis;
        var centroid = Kernel.plinkoSlotForCentroid(cycle.geometry,
          chassis.transform.x, chassis.transform.y);
        if (!centroid || centroid.slotIndex !== landing.slotIndex ||
            centroid.slotSensorRef !== landing.sensorRef ||
            snapshot.adapter.landing.centroidSlotIndex !== landing.slotIndex) {
          throw new Error('Plinko reward conflicts with the physical contact-chassis centroid');
        }
        var dropMs = (landing.settledTick - BOARD_START_TICK) * FIXED_DT_MS;
        var canonicalPrize = SLOT_KINDS[landing.slotIndex];
        var result = canonicalPrize === 'automatic-loss' ? 'MISS' : 'MAKE';
        if (!close(landing.dropMs, dropMs) ||
            snapshot.outcome.slotIndex !== landing.slotIndex ||
            snapshot.outcome.sensorRef !== landing.sensorRef ||
            snapshot.outcome.canonicalPrize !== canonicalPrize ||
            snapshot.outcome.legacyPrize !== LEGACY_PRIZES[canonicalPrize] ||
            snapshot.outcome.result !== result ||
            snapshot.outcome.actualSensorContact !== true ||
            snapshot.outcome.contactDigest !== snapshot.contactDigest) {
          throw new Error('Plinko public outcome contradicts its physical sensor evidence');
        }
        var recovered = dropMs >= Kernel.PLINKO_TRANSPORT.recoveryStartDropMs;
        if (dropMs >= Kernel.PLINKO_TRANSPORT.timeoutDropMs) {
          throw new Error('A Plinko reward arrived at or after the no-contest deadline');
        }
        return {
          result: result, pose: result === 'MAKE' ? 'upright' : 'miss',
          reason: 'plinko-slot-' + landing.slotIndex,
          slotIndex: landing.slotIndex, sensorRef: landing.sensorRef,
          canonicalPrize: canonicalPrize, legacyPrize: LEGACY_PRIZES[canonicalPrize],
          facts: {
            objectColliderRef: 'body:flipper-main',
            slotSensorRef: landing.sensorRef, slotIndex: landing.slotIndex,
            dropDurationMs: dropMs, settled: true,
            completionKind: recovered ? 'recovered' : 'clean',
            recoveryStartedMs: recovered
              ? Kernel.PLINKO_TRANSPORT.recoveryStartDropMs : null,
            recoveryImpulseCount: recovered ? snapshot.recovery.applied : 0,
          },
          noContest: false,
        };
      }
      if (!snapshot.timedOut) return null;
      if (snapshot.tick !== TIMEOUT_TICK || landing.settled ||
          landing.slotIndex != null || landing.sensorRef != null ||
          landing.actualSensorContact !== false || snapshot.outcome != null ||
          snapshot.recovery.applied !== Kernel.PLINKO_TRANSPORT.recoveryImpulseLimit) {
        throw new Error('Plinko timeout attempted to fabricate or retain a slot');
      }
      return {
        result: 'MISS', pose: 'miss', reason: 'plinko-timeout',
        slotIndex: null, sensorRef: null, canonicalPrize: null, legacyPrize: null,
        facts: {
          objectColliderRef: 'body:flipper-main', slotSensorRef: null,
          slotIndex: null, dropDurationMs: Kernel.PLINKO_TRANSPORT.timeoutDropMs,
          settled: false, completionKind: 'no-contest',
          recoveryStartedMs: Kernel.PLINKO_TRANSPORT.recoveryStartDropMs,
          recoveryImpulseCount: snapshot.recovery.applied,
        },
        noContest: true,
      };
    }

    function cleanupPhysical(reason) {
      if (cycle.cleaned) return;
      var report = source.cleanup(reason);
      if (report != null && (!report || report.clean !== true)) {
        throw new Error('Plinko physical cleanup did not complete');
      }
      cycle.cleaned = true;
    }

    function consume(terminal, snapshot) {
      var facts = Kernel.normalizeOutcomeFacts('plinko', terminal.facts);
      var evidence = Kernel.issueTerminalEvidence(lane.runtime, cycle.claim, {
        schema: 'PlinkoLiveTerminalEvidenceV1',
        launchId: cycle.launchId, fixedTickHz: FIXED_TICK_HZ,
        terminalTick: snapshot.tick, boardFingerprint: cycle.geometry.fingerprint,
        bindingFingerprint: cycle.binding.fingerprint,
        selectedBodyId: snapshot.selectedBodyId,
        contactChassisRef: snapshot.adapter.selected.contactChassis.colliderRef,
        contactDigest: snapshot.contactDigest,
        actualSensorContact: !terminal.noContest,
        slotSensorRef: terminal.sensorRef,
        recoveryImpulseCount: snapshot.recovery.applied,
        timedOut: terminal.noContest,
      });
      var outcome = Kernel.issueOutcome(lane.runtime, cycle.claim, evidence, {
        eventId: 'plinko', eventClass: 'wildcard', laneId: laneId,
        launchClaimId: cycle.claim.claimId, result: terminal.result,
        pose: terminal.pose, reason: terminal.reason, facts: facts,
        evidence: { steps: Math.max(1, snapshot.tick),
          contacts: snapshot.contactCount, elapsedMs: snapshot.elapsedMs },
      });
      cycle.pending = { terminal: terminal, outcome: outcome,
        identity: rules.nextResolutionIdentity(cycle.claim.claimId),
        beforeRules: rules.snapshot(), snapshotTick: snapshot.tick };
      cleanupPhysical(terminal.noContest ? 'plinko-no-contest' : 'plinko-resolved');
      var resolved = rulesBridge.resolve({ resolutionIdentity: cycle.pending.identity,
        outcome: outcome });
      if (terminal.noContest) {
        if (resolved.noContest !== true || resolved.terminalOutcome != null ||
            resolved.rulesInput != null) {
          throw new Error('Plinko timeout was not consumed as a pure no-contest');
        }
        assertRulesNoContest(cycle.pending.beforeRules, resolved.transition.state);
      } else {
        var automatic = terminal.canonicalPrize === 'automatic-win'
          ? 'current-win' : (terminal.canonicalPrize === 'automatic-loss'
            ? 'current-loss' : null);
        if (resolved.noContest || resolved.terminalOutcome !== automatic ||
            (!!automatic) !== (resolved.rulesInput == null)) {
          throw new Error('Plinko slot did not map to its sole canonical Rules effect');
        }
      }
      cycle.phase = 'resolved';
      var retry = terminal.noContest ? Object.freeze({
        scheduled: true, sameCompetitiveTurn: true, eventReused: false,
        preserves: Object.freeze(['lives', 'stake', 'score', 'rotation', 'sudden-death']),
      }) : null;
      lastResolution = Object.freeze({
        schema: 'PlinkoAuthorityResolutionV1', duplicate: false,
        launchId: cycle.launchId, resolutionId: resolved.resolutionId,
        action: terminal.noContest ? 'retry-same-turn'
          : (resolved.terminalOutcome ? 'terminal-result' : 'apply-slot-reward'),
        slotIndex: terminal.slotIndex, canonicalPrize: terminal.canonicalPrize,
        legacyPrize: terminal.legacyPrize, noContest: terminal.noContest,
        retry: retry, rules: resolved,
      });
      return lastResolution;
    }

    function begin(inputValue) {
      if (closed) throw new Error('Plinko resolution driver is closed');
      if (cycle && cycle.phase !== 'resolved' && cycle.phase !== 'aborted') {
        throw new Error('The previous Plinko launch is still active');
      }
      var input = exact(inputValue || {}, [
        'launchId', 'turnSeed', 'eventSeed', 'oddsProfile', 'forced', 'testData',
        'appearance', 'physicsProfileId', 'viewportHeight',
      ], 'Plinko authority launch');
      var launchId = text(input.launchId, 'Plinko launch ID', 128);
      if (usedLaunchIds.has(launchId)) throw new Error('Plinko launch ID was already consumed');
      whole(input.turnSeed, 'Plinko turn seed', 0, 0xffffffff);
      whole(input.eventSeed, 'Plinko event seed', 0, 0xffffffff);
      text(input.oddsProfile, 'Plinko odds profile', 48);
      bool(input.forced, 'Plinko forced flag');
      bool(input.testData, 'Plinko Test Data flag');
      finite(input.viewportHeight, 'Plinko viewport height', 240, 100000);
      var appearance = exact(input.appearance || {}, [
        'flipperId', 'variantId', 'appearanceRevision', 'cosmeticId',
        'authoredParts', 'internalDynamics',
      ], 'Plinko appearance');
      var initial = read();
      if (initial.tick !== 0 || initial.timedOut || initial.outcome ||
          initial.landing.settled || initial.spring.compressed !== true ||
          initial.spring.applied !== false || initial.boardEnabled !== false) {
        throw new Error('Plinko authority must bind at the physical trampoline compression frame');
      }
      var selected = initial.adapter.selected;
      var expectedBinding = {
        appearanceRevision: text(appearance.appearanceRevision,
          'Plinko appearance revision', 96),
        cosmeticId: text(appearance.cosmeticId, 'Plinko cosmetic ID', 96),
        authoredParts: list(appearance.authoredParts, 'Plinko authored parts'),
        internalDynamics: list(appearance.internalDynamics, 'Plinko internal dynamics'),
        colliderFingerprint: text(selected.colliderFingerprint,
          'Plinko collider fingerprint', 160),
      };
      var width = (initial.adapter.board.innerLeft + initial.adapter.board.innerRight);
      var groundY = initial.adapter.board.bottom - 40;
      var geometry = Kernel.issuePlinkoBoardGeometry(lane.runtime, {
        width: width, height: input.viewportHeight, groundY: groundY,
      });
      var binding = Kernel.issuePlinkoFlipperBinding(lane.runtime, {
        appearance: {
          flipperId: text(appearance.flipperId, 'Plinko flipper ID', 96),
          variantId: text(appearance.variantId, 'Plinko variant ID', 96),
          appearanceRevision: expectedBinding.appearanceRevision,
          cosmeticId: expectedBinding.cosmeticId,
          authoredParts: expectedBinding.authoredParts,
          internalDynamics: expectedBinding.internalDynamics,
        },
        physicsProfile: {
          id: text(input.physicsProfileId, 'Plinko physics profile ID', 96),
          colliderRef: 'body:flipper-main',
          colliderFingerprint: expectedBinding.colliderFingerprint,
        },
      });
      var issuedSelection = lane.issueSelection({
        schema: 'EventSelectionV2', eventId: 'plinko', displayName: 'Plinko',
        eventClass: 'wildcard', turnSeed: input.turnSeed,
        eventSeed: input.eventSeed, oddsProfile: input.oddsProfile,
        forced: input.forced, testData: input.testData, consumed: false,
        telegraph: { schema: 'EventTelegraphV1', title: 'Plinko',
          instruction: 'Ride the trampoline and watch all nine slots.',
          glyph: 'PLINKO', durationMs: 900, cues: [] },
      });
      var selection = Kernel.claimSelection(lane.runtime, issuedSelection,
        'plinko', 'wildcard');
      var claim = Kernel.issueLaunchClaim(lane.runtime, selection);
      cycle = {
        phase: 'active', launchId: launchId, selection: selection, claim: claim,
        geometry: geometry, binding: binding, expectedBinding: expectedBinding,
        selectedBodyId: initial.selectedBodyId, lastTick: 0,
        lastSignature: JSON.stringify({ tick: 0, selected: initial.adapter.selected,
          spring: initial.spring, boardEnabled: initial.boardEnabled,
          landing: initial.landing, recovery: initial.recovery,
          timedOut: initial.timedOut, contacts: initial.contactCount,
          contactDigest: initial.contactDigest }),
        lastMotion: null, pending: null, cleaned: false,
      };
      validateBoard(initial, geometry);
      validateBinding(initial, expectedBinding);
      validatePhysicalPhases(initial);
      usedLaunchIds.add(launchId);
      lastResolution = null;
      return immutable({ schema: 'PlinkoAuthorityLaunchV1', launchId: launchId,
        claimId: claim.claimId, laneId: laneId, tick: 0,
        boardFingerprint: geometry.fingerprint,
        bindingFingerprint: binding.fingerprint }, 'Plinko authority launch');
    }

    function poll() {
      if (closed) throw new Error('Plinko resolution driver is closed');
      if (!cycle) return null;
      if (cycle.phase === 'resolved') {
        return Object.freeze({ schema: 'PlinkoAuthorityResolutionV1',
          duplicate: true, launchId: cycle.launchId,
          resolutionId: lastResolution.resolutionId,
          action: 'none', slotIndex: lastResolution.slotIndex,
          canonicalPrize: lastResolution.canonicalPrize,
          legacyPrize: lastResolution.legacyPrize,
          noContest: lastResolution.noContest, retry: lastResolution.noContest
            ? Object.freeze({ scheduled: false, sameCompetitiveTurn: true }) : null,
          rules: lastResolution.rules });
      }
      if (cycle.phase === 'aborted') return null;
      var snapshot = read();
      if (snapshot.selectedBodyId !== cycle.selectedBodyId) {
        throw new Error('Plinko selected body identity changed during the drop');
      }
      var clock = validateSnapshot(snapshot);
      if (clock.duplicate && !snapshot.outcome && !snapshot.timedOut) return null;
      var terminal = deriveTerminal(snapshot);
      return terminal ? consume(terminal, snapshot) : null;
    }

    function abort(reasonValue) {
      if (!cycle || cycle.phase === 'resolved' || cycle.phase === 'aborted') return false;
      cleanupPhysical('plinko-abort:' + String(reasonValue || 'aborted').slice(0, 80));
      cycle.phase = 'aborted';
      return true;
    }

    function status() {
      return Object.freeze({ schema: 'PlinkoAuthorityDriverSnapshotV1',
        laneId: laneId, closed: closed,
        phase: cycle ? cycle.phase : 'idle',
        launchId: cycle ? cycle.launchId : null,
        tick: cycle ? cycle.lastTick : null,
        lastResolution: lastResolution });
    }

    function close() {
      if (closed) return status();
      if (cycle && cycle.phase === 'active') abort('driver-close');
      rulesBridge.cleanup();
      closed = true;
      return status();
    }

    return Object.freeze({ schema: 'PlinkoAuthorityDriverV1',
      begin: begin, poll: poll, abort: abort, status: status, close: close });
  }

  return Object.freeze({ schema: SCHEMA, FIXED_TICK_HZ: FIXED_TICK_HZ,
    BOARD_START_TICK: BOARD_START_TICK, RECOVERY_START_TICK: RECOVERY_START_TICK,
    TIMEOUT_TICK: TIMEOUT_TICK, SLOT_KINDS: SLOT_KINDS, create: create });
});
