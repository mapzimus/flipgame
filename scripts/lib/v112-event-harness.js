// v112-event-harness.js -- deterministic fixtures for event-pack qualification.
(function (root, factory) {
  'use strict';
  var Kernel = root && root.FlipgameV112EventKernel;
  var Runtime = root && root.FlipgameV112EventRuntime;
  var Renderer = root && root.FlipgameV112EventRenderer;
  var RulesAdapter = root && root.FlipgameV112EventRulesAdapter;
  var Rules = root && root.FlipgameV112Rules;
  if (typeof module === 'object' && module.exports) {
    Kernel = require('../../js/v112-event-kernel.js');
    Runtime = require('../../js/v112-event-runtime.js');
    Renderer = require('../../js/v112-event-renderer.js');
    RulesAdapter = require('../../js/v112-event-rules-adapter.js');
    Rules = require('../../js/v112-rules.js');
  }
  var api = factory(Kernel, Runtime, Renderer, RulesAdapter, Rules);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV112EventHarness = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (Kernel, Runtime, Renderer, RulesAdapter, Rules) {
  'use strict';

  if (!Kernel || !Runtime || !Renderer || !RulesAdapter || !Rules) {
    throw new Error('The v1.12 event infrastructure must load before its harness');
  }

  var PRIMARY_TRANSFORM = Object.freeze({ x: 640, y: 300, angle: 1.2, scaleX: 1, scaleY: 1 });
  var PRIMARY_BOUNDS = Object.freeze({ left: 610, top: 240, width: 60, height: 120,
    right: 670, bottom: 360 });
  var DEFAULT_FACTS = Object.freeze({
    'rainbow-corkscrew': { corkscrewRadians: 8 },
    'half-full': { centerOfMassShift: 0.2, baseStabilized: true },
    'power-launch': { impulseScale: 1.7 },
    'fizz-jet': { topEjected: true, thrustMs: 500 },
    'golden-flip': { massScale: 1.4 },
    'bouncy-bottle': { bounceCount: 2, fullySettled: true },
    earthquake: { tableTravel: 90, debrisContacts: 1 },
    'moon-gravity': { gravityScale: 0.28 },
    'ice-slide': { slideDistance: 380, frictionRecovered: true },
    'alien-invasion': { bankCount: 1, ringEntered: true },
    'gravity-slam': { peakImpact: 42 },
    trampoline: { relaunchCount: 1, returnedToTable: true },
    'wind-tunnel': { lateralImpulse: 14 },
    'shrink-ray': { scale: 0.62 },
    'portal-pair': { portalPasses: 1, speedRatio: 1 },
    'tether-swing': { cableAttached: true, released: true, swingRadians: 2.5 },
    mitosis: { primaryColliderRef: 'body:primary', secondaryColliderRef: 'body:secondary',
      primaryLanded: true, secondaryLanded: false, landedCopies: 1 },
    'double-flip': { rotations: 2.1 },
    'ceiling-flip': { ceilingContact: true },
    'meteor-shower': { debrisContacts: 2 },
    magnet: { magneticImpulse: 11 },
    'heart-rush': { pulseCount: 3 },
    'black-hole': { orbitRadians: 3.4 },
    boomerang: { returnedToOrigin: true, returnDistance: 6 },
    'roulette-table': { wheelColliderRef: 'body:wheel', objectColliderRef: 'body:object',
      sectorIndex: 3, sectorCount: 8, settled: true },
    rewind: { replayCount: 1, correctiveImpulseApplied: true },
    plinko: { objectColliderRef: 'body:flipper-main', slotSensorRef: 'sensor:slot-4',
      slotIndex: 4, dropDurationMs: 12000, settled: true, completionKind: 'clean',
      recoveryStartedMs: null, recoveryImpulseCount: 0 },
    'mirror-match': { normalizedLaunchX: 0.12, normalizedLaunchY: -0.48,
      spin: 7.5, profileSeed: 123, physicsProfileId: 'standard' },
    'cap-toss': { bodyColliderRef: 'body:body', topColliderRef: 'body:top',
      bodyLanded: true, topLanded: true },
    'life-drain': { magnetAssisted: true },
  });

  function clone(value) {
    if (value == null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(clone);
    var result = {};
    Object.keys(value).forEach(function (key) { result[key] = clone(value[key]); });
    return result;
  }

  function makeSelection(eventId, eventClass, eventSeed, overrides) {
    var value = Object.assign({ schema: 'EventSelectionV2', eventId: eventId,
      displayName: eventId, eventClass: eventClass, turnSeed: 1,
      eventSeed: eventSeed == null ? 12345 : eventSeed,
      oddsProfile: 'forced-test', forced: true, testData: true, consumed: false,
      telegraph: { glyph: eventId, title: eventId,
        instruction: 'Harness event.', durationMs: 0, cues: [] },
    }, clone(overrides || {}));
    return Kernel.deepFreeze(value);
  }

  function makeContext(overrides) {
    return Object.assign({ layout: { width: 1280, height: 720, groundY: 620 },
      appearance: { flipperId: 'bottle', variantId: 'classic-blue' },
      physicsProfile: { id: 'standard', mass: 1, colliderRef: 'body:flipper-main' },
      hostColliderRefs: ['table'],
    }, clone(overrides || {}));
  }

  function makeSignal(overrides) {
    return Object.assign({ schema: 'EventLaunchSignalV1', dx: 20, dy: -160,
      vx: 2, vy: -8, power: 0.6, direction: 0.2, spin: 4, elapsedMs: 180 },
    clone(overrides || {}));
  }

  function makeDraft(overrides) {
    return Object.assign({ schema: 'EventLaunchDraftV1', bodyRef: 'body:flipper-main',
      position: { x: 640, y: 300 }, velocity: { x: 2, y: -8 }, angle: 1.2,
      angularVelocity: 4 }, clone(overrides || {}));
  }

  function makeStep(overrides) {
    return Object.assign({ schema: 'EventPhysicsStepV1', dtMs: 16, elapsedMs: 1800 },
      clone(overrides || {}));
  }

  function makeContact(overrides) {
    return Object.assign({ schema: 'ContactV1', contactId: 'contact-1', phase: 'begin',
      entityARef: 'body:flipper-main', entityBRef: 'table', point: { x: 640, y: 620 },
      normal: { x: 0, y: -1 }, impulse: 4, elapsedMs: 600 }, clone(overrides || {}));
  }

  function makeProbe(overrides) {
    return Object.assign({ schema: 'LandingProbeV1', result: 'MAKE', pose: 'upright',
      reason: 'stable-upright', settled: true, rotations: 1.05,
      contactCount: 1, bounceCount: 0, elapsedMs: 1800 }, clone(overrides || {}));
  }

  function makeFrame(eventId, eventClass, laneId, overrides) {
    return Object.assign({ schema: 'EventFrameV1', eventId: eventId,
      eventClass: eventClass, laneId: laneId, sequence: 0,
      entities: [{ entityId: 'flipper-main', role: 'flipper',
        transform: clone(PRIMARY_TRANSFORM), bounds: clone(PRIMARY_BOUNDS),
        colliderRef: 'body:flipper-main', appearanceRef: 'bottle:classic-blue',
        visualStateRef: 'airborne', visible: true, zIndex: 10 }],
      cues: [{ cueId: 'harness-cue', kind: 'trail' }], reducedMotion: false,
    }, clone(overrides || {}));
  }

  function makeScopeFrame(eventId, eventClass, context, sequence, plinkoTransport) {
    var appearanceRef = context.appearance.flipperId + ':' + context.appearance.variantId;
    var entities = context.scope.colliderRefs().map(function (reference, index) {
      var collider = context.scope.getCollider(reference);
      var isMain = reference === 'body:flipper-main';
      var isTrampoline = plinkoTransport &&
        reference === plinkoTransport.trampolineColliderRef;
      return { entityId: isTrampoline ? 'plinko-opening-trampoline'
        : reference.replace(':', '-'),
        role: isMain ? 'flipper' : (reference.indexOf('sensor:') === 0
          ? 'sensor' : 'event-body'),
        transform: clone(collider.transform), bounds: clone(collider.bounds),
        colliderRef: reference, appearanceRef: isMain ? appearanceRef
          : (isTrampoline ? 'plinko-trampoline:opening' : reference),
        visualStateRef: isMain && plinkoTransport
          ? 'plinko-' + plinkoTransport.phase
          : (isTrampoline ? plinkoTransport.phase : 'active'),
        visible: isTrampoline ? ['compression', 'release'].indexOf(
          plinkoTransport.phase) >= 0 : reference.indexOf('sensor:') !== 0,
        zIndex: 10 + index };
    });
    if (eventId === 'plinko') {
      var boardVisible = ['apex-handoff', 'board-descent', 'anti-wedge-recovery',
        'recovery-timeout'].indexOf(plinkoTransport.phase) >= 0;
      entities.push({ entityId: 'plinko-board-24', role: 'background',
        transform: { x: context.layout.width / 2,
          y: context.layout.groundY - 920, angle: 0, scaleX: 1, scaleY: 1 },
        bounds: { left: context.layout.width / 2 - 310,
          top: context.layout.groundY - 1880, width: 620, height: 1920,
          right: context.layout.width / 2 + 310, bottom: context.layout.groundY + 40 },
        colliderRef: null, appearanceRef: 'plinko-board:24-rows',
        visualStateRef: plinkoTransport.phase, visible: boardVisible, zIndex: 2 });
    }
    var cues = plinkoTransport ? [{ cueId: 'plinko-camera-' + sequence,
      kind: 'plinko-' + plinkoTransport.cameraMode,
      entityRef: plinkoTransport.cameraTargetRef, intensity: 1, durationMs: 500,
      ariaCue: plinkoTransport.phase === 'compression'
        ? 'The trampoline compresses beneath your Flipper.'
        : (plinkoTransport.phase === 'apex-handoff'
          ? 'The camera follows the Flipper into the Plinko board.'
          : 'The camera tracks your Flipper.') }] :
      [{ cueId: 'harness-cue', kind: 'trail' }];
    return makeFrame(eventId, eventClass, context.scope.laneId,
      { sequence: sequence, entities: entities, reducedMotion: false,
        cues: cues, plinkoTransport: plinkoTransport || null });
  }

  function makeCollider(laneId, name, overrides) {
    var source = overrides || {};
    return { laneId: laneId, name: name, transform: clone(PRIMARY_TRANSFORM),
      bounds: clone(PRIMARY_BOUNDS), evidence: Object.assign({ settled: true,
        validLanding: true, pose: 'upright', sensorActive: false,
        sensorKind: null, sensorIndex: null, recoveryStartedMs: null,
        recoveryImpulseCount: 0 },
      clone(source.evidence || {})) };
  }

  function ownCollider(context, kind, id, disposals, source, overrides) {
    var collider = makeCollider(context.scope.laneId, id, overrides);
    if (overrides && overrides.transform) collider.transform = Object.assign(collider.transform,
      clone(overrides.transform));
    if (overrides && overrides.bounds) collider.bounds = Object.assign(collider.bounds,
      clone(overrides.bounds));
    var method = kind === 'sensor' ? 'ownSensor' : 'ownBody';
    context.scope[method](id, collider, function (resource, metadata) {
      disposals.push({ value: resource, metadata: metadata });
      if (source.throwDisposerAt === kind + ':' + id || source.throwDisposerAt === kind) {
        throw new Error('harness-dispose-' + kind + ':' + id);
      }
    });
    return collider;
  }

  function ownRequiredColliders(eventId, context, disposals, source) {
    var facts = source.facts || DEFAULT_FACTS[eventId];
    var mainOverrides = eventId === 'plinko' ? {
      transform: { x: 45 }, evidence: { settled: facts.settled,
        validLanding: facts.settled, pose: facts.settled ? 'upright' : 'none',
        recoveryStartedMs: facts.recoveryStartedMs,
        recoveryImpulseCount: facts.recoveryImpulseCount },
    } : null;
    ownCollider(context, 'body', 'flipper-main', disposals, source, mainOverrides);
    if (eventId === 'mitosis') {
      ownCollider(context, 'body', 'primary', disposals, source,
        { evidence: { validLanding: facts.primaryLanded, pose: facts.primaryLanded ? 'upright' : 'miss' } });
      ownCollider(context, 'body', 'secondary', disposals, source,
        { evidence: { validLanding: facts.secondaryLanded,
          pose: facts.secondaryLanded ? 'upright' : 'miss' } });
    } else if (eventId === 'roulette-table') {
      var wheelAngle = 0.35;
      var sectorAngle = wheelAngle + (facts.sectorIndex + 0.5) * (Math.PI * 2 / 8);
      ownCollider(context, 'body', 'wheel', disposals, source,
        { transform: { x: 640, y: 300, angle: wheelAngle } });
      ownCollider(context, 'body', 'object', disposals, source,
        { transform: { x: 640 + Math.cos(sectorAngle) * 100,
          y: 300 + Math.sin(sectorAngle) * 100 } });
    } else if (eventId === 'plinko') {
      ownCollider(context, 'body', 'plinko-opening-trampoline', disposals, source,
        { transform: { x: context.layout.width / 2, y: context.layout.groundY },
          bounds: { left: context.layout.width / 2 - 130,
            top: context.layout.groundY - 28, width: 260, height: 56,
            right: context.layout.width / 2 + 130,
            bottom: context.layout.groundY + 28 } });
      if (facts.slotSensorRef != null) {
        var slotId = facts.slotSensorRef.split(':')[1];
        ownCollider(context, 'sensor', slotId, disposals, source,
          { bounds: { left: 40, width: 10, right: 50 },
            evidence: { sensorActive: true, sensorKind: 'plinko-slot',
              sensorIndex: facts.slotIndex } });
      }
    } else if (eventId === 'cap-toss') {
      ownCollider(context, 'body', 'body', disposals, source,
        { evidence: { validLanding: facts.bodyLanded, pose: facts.bodyLanded ? 'upright' : 'miss' } });
      ownCollider(context, 'body', 'top', disposals, source,
        { evidence: { validLanding: facts.topLanded, pose: facts.topLanded ? 'upright' : 'miss' } });
    }
  }

  function makePack(options) {
    var source = options || {};
    var eventClass = source.eventClass || 'assist';
    var ids = source.ids || ['rainbow-corkscrew'];
    var trace = source.trace || [];
    var disposals = source.disposals || [];
    return Kernel.definePack({ eventClass: eventClass, ids: ids,
      create: function (eventId, context) {
        trace.push('create:' + context.scope.laneId);
        ownRequiredColliders(eventId, context, disposals, source);
        var eventFacts = source.facts || DEFAULT_FACTS[eventId];
        if (typeof source.onCreate === 'function') source.onCreate(eventId, context, trace);
        var frameSequence = 0;
        var plinkoTransport = null;
        var plinkoReleaseIssued = false;
        var plinkoRecoveryIssued = false;
        function nextPlinkoTransport(elapsedMs, objectRef) {
          return Kernel.derivePlinkoTransportState({ elapsedMs: elapsedMs,
            objectColliderRef: objectRef,
            flipperId: context.appearance.flipperId,
            variantId: context.appearance.variantId,
            physicsProfileId: context.physicsProfile.id });
        }
        function cameraCue(state, suffix) {
          return { cueId: 'plinko-camera-' + suffix,
            kind: 'plinko-' + state.cameraMode,
            entityRef: state.cameraTargetRef, intensity: 1, durationMs: 500,
            ariaCue: 'Camera follows the selected Flipper.' };
        }
        function maybeThrow(name) {
          if (source.throwAt === name) throw new Error('harness-' + name);
        }
        return Object.freeze({
          telegraph: function () {
            trace.push('telegraph'); maybeThrow('telegraph');
            return { title: eventId, instruction: 'Harness event.', glyph: 'test',
              durationMs: 0, cues: [] };
          },
          qualifyLaunch: function (signal) {
            trace.push('qualifyLaunch'); maybeThrow('qualifyLaunch');
            if (typeof source.qualify === 'function') return source.qualify(signal, context);
            return { qualified: source.qualified !== false,
              reason: source.qualified === false ? 'harness-retry' : null };
          },
          launch: function (draft) {
            trace.push('launch'); maybeThrow('launch');
            if (typeof source.launch === 'function') return source.launch(draft, context);
            if (eventId === 'plinko') {
              plinkoTransport = nextPlinkoTransport(0, draft.bodyRef);
              return { bodies: [{ entityRef: draft.bodyRef,
                scaleX: Kernel.PLINKO_TRANSPORT.compressedScaleX,
                scaleY: Kernel.PLINKO_TRANSPORT.compressedScaleY },
              { entityRef: plinkoTransport.trampolineColliderRef,
                scaleX: Kernel.PLINKO_TRANSPORT.trampolineCompressedScaleX,
                scaleY: Kernel.PLINKO_TRANSPORT.trampolineCompressedScaleY }],
              cameraCues: [cameraCue(plinkoTransport, 'compression')],
              presentationCues: [{ cueId: 'plinko-trampoline-compress',
                kind: 'trampoline-compression', entityRef: draft.bodyRef,
                intensity: 1, durationMs: Kernel.PLINKO_TRANSPORT.compressionEndMs,
                ariaCue: 'The trampoline compresses.' }],
              plinkoTransport: plinkoTransport };
            }
            context.rng.nextUint32('launch');
            return {};
          },
          step: function (physicsStep) {
            trace.push('step'); maybeThrow('step'); frameSequence += 1;
            if (typeof source.step === 'function') return source.step(physicsStep, context);
            if (eventId === 'plinko') {
              plinkoTransport = nextPlinkoTransport(physicsStep.elapsedMs,
                context.physicsProfile.colliderRef);
              var directive = { cameraCues: [cameraCue(plinkoTransport,
                String(frameSequence))], plinkoTransport: plinkoTransport };
              if (!plinkoReleaseIssued &&
                  physicsStep.elapsedMs >= Kernel.PLINKO_TRANSPORT.compressionEndMs) {
                directive.impulses = [{ entityRef: plinkoTransport.objectColliderRef,
                  x: 0, y: -Kernel.PLINKO_TRANSPORT.releaseUpwardImpulse }];
                directive.bodies = [{ entityRef: plinkoTransport.objectColliderRef,
                  scaleX: 1, scaleY: 1 },
                { entityRef: plinkoTransport.trampolineColliderRef,
                  scaleX: 1, scaleY: 1 }];
                directive.audioCues = [{ cueId: 'plinko-trampoline-release',
                  kind: 'trampoline-release', entityRef: plinkoTransport.objectColliderRef,
                  intensity: 1, durationMs: 650,
                  ariaCue: 'The trampoline launches the Flipper high above the table.' }];
                plinkoReleaseIssued = true;
              }
              if (!plinkoRecoveryIssued &&
                  plinkoTransport.phase === 'anti-wedge-recovery' &&
                  eventFacts.recoveryImpulseCount > 0) {
                directive.impulses = (directive.impulses || []).concat(
                  Array.from({ length: eventFacts.recoveryImpulseCount }, function (_, index) {
                    return { entityRef: plinkoTransport.objectColliderRef,
                      x: index % 2 ? -2 : 2, y: -3 };
                  }));
                plinkoRecoveryIssued = true;
              }
              return directive;
            }
            return {};
          },
          contact: function (contact) {
            trace.push('contact'); maybeThrow('contact');
            if (typeof source.contact === 'function') return source.contact(contact, context);
            return {};
          },
          evaluate: function (probe) {
            trace.push('evaluate'); maybeThrow('evaluate');
            if (typeof source.evaluate === 'function') return source.evaluate(probe, context);
            if (!probe.settled) return null;
            return Kernel.immutableData({ result: probe.result, pose: probe.pose,
              reason: probe.reason, facts: clone(source.facts || DEFAULT_FACTS[eventId]) },
            'harness evaluation');
          },
          frame: function (reducedMotion) {
            trace.push('frame:' + reducedMotion); maybeThrow('frame');
            var provided = typeof source.frame === 'function'
              ? source.frame(reducedMotion, context, frameSequence) : null;
            return provided || makeScopeFrame(eventId, eventClass, context, frameSequence,
              plinkoTransport);
          },
          cleanup: function (reason) {
            trace.push('cleanup:' + reason); maybeThrow('cleanup');
            if (typeof source.cleanup === 'function') return source.cleanup(reason, context);
          },
        });
      } });
  }

  function createHarness(options) {
    var source = options || {};
    var trace = [];
    var disposals = [];
    var reflows = [];
    var rules = source.rules || null;
    if (!source.authority) {
      rules = rules || Rules.createRulesAdapter({ matchId: source.matchId || 'harness-match',
        formatId: source.formatId || 'classic', players: source.players || [
          { id: 'p1', name: 'Player 1' }, { id: 'p2', name: 'Player 2' },
        ] });
    }
    var authority = source.authority || rules.claimEventAuthority();
    var pack = source.pack || makePack({ eventClass: source.eventClass,
      ids: source.ids || [source.eventId || 'rainbow-corkscrew'],
      facts: source.facts, frame: source.frame, evaluate: source.evaluate,
      launch: source.launch, step: source.step, contact: source.contact,
      cleanup: source.cleanup, throwAt: source.throwAt,
      qualified: source.qualified, qualify: source.qualify, trace: trace,
      disposals: disposals, throwDisposerAt: source.throwDisposerAt,
      onCreate: source.onCreate });
    var eventId = source.eventId || pack.ids[0];
    var laneId = source.laneId || 'lane-a';
    var laneAuthority = source.laneAuthority || authority.createLane(laneId);
    var runtime = Runtime.createEventRuntime({ laneId: laneId,
      packs: [pack], authority: laneAuthority.runtime,
      resolveCollider: source.resolveCollider || function (collider) {
        return { transform: collider.transform, bounds: collider.bounds,
          evidence: collider.evidence };
      },
      reflow: function (layout, metadata) {
        reflows.push({ layout: layout, metadata: metadata });
        if (source.throwReflow) throw new Error('harness-reflow');
      } });
    var rawSelection = makeSelection(eventId, pack.eventClass, source.eventSeed, source.selection);
    var selection = laneAuthority.issueSelection(rawSelection);
    runtime.bind(selection, makeContext(source.context));
    return { runtime: runtime, pack: pack, trace: trace, disposals: disposals,
      reflows: reflows, selection: selection, rawSelection: rawSelection,
      authority: authority, laneAuthority: laneAuthority, rules: rules };
  }

  function drive(runtime, options) {
    var source = options || {};
    var defaultElapsed = runtime.snapshot().eventId === 'plinko'
      ? Kernel.PLINKO_TRANSPORT.boardDropStartMs + DEFAULT_FACTS.plinko.dropDurationMs
      : 1800;
    var result = { telegraph: runtime.telegraph(),
      qualification: runtime.qualifyLaunch(source.signal || makeSignal()) };
    if (!result.qualification.qualified) return result;
    result.launch = runtime.launch(source.draft || makeDraft());
    var targetStep = source.step || makeStep({ elapsedMs: defaultElapsed });
    if (runtime.snapshot().eventId === 'plinko') {
      [Kernel.PLINKO_TRANSPORT.compressionEndMs,
        Kernel.PLINKO_TRANSPORT.releaseEndMs,
        Kernel.PLINKO_TRANSPORT.apexHandoffStartMs,
        Kernel.PLINKO_TRANSPORT.boardDropStartMs].forEach(function (elapsedMs) {
          if (elapsedMs < targetStep.elapsedMs) {
            runtime.step(makeStep({ elapsedMs: elapsedMs }));
          }
        });
    }
    result.step = runtime.step(targetStep);
    if (source.contact !== false) result.contact = runtime.contact(makeContact(source.contact));
    result.frame = runtime.frame(source.reducedMotion === true);
    result.outcome = runtime.evaluate(makeProbe(Object.assign({ elapsedMs: defaultElapsed },
      source.probe || {})));
    return result;
  }

  function assertNoLeaks(runtime) {
    var state = runtime.snapshot();
    if (!state.cleanup || state.resources.active !== 0) throw new Error('Event runtime still owns lane resources');
    return true;
  }

  var replayOrdinal = 0;
  function replayProjection(result) {
    var qualification = result.qualification ? {
      schema: result.qualification.schema,
      qualified: result.qualification.qualified,
      reason: result.qualification.reason,
      consumed: result.qualification.consumed,
    } : null;
    var outcome = result.outcome == null ? null : clone(result.outcome);
    if (outcome) delete outcome.launchClaimId;
    return Kernel.immutableData({ telegraph: result.telegraph,
      qualification: qualification, launch: result.launch || null,
      step: result.step || null, contact: result.contact || null,
      frame: result.frame || null, outcome: outcome }, 'event deterministic replay');
  }

  function runReplay(options) {
    var source = options || {};
    if (!source.pack || source.pack.schema !== 'EventPackV1') {
      throw new TypeError('Deterministic replay requires an EventPackV1');
    }
    replayOrdinal += 1;
    var laneId = source.laneId || 'deterministic-replay';
    var harness = createHarness({ pack: source.pack,
      eventId: source.eventId || source.pack.ids[0], laneId: laneId,
      matchId: 'event-replay-' + replayOrdinal,
      eventSeed: source.eventSeed == null ? 12345 : source.eventSeed,
      context: source.context, resolveCollider: source.resolveCollider });
    try { return replayProjection(drive(harness.runtime, source.drive)); }
    finally { harness.runtime.cleanup('deterministic-replay'); }
  }

  function assertDeterministicReplay(options) {
    // This is intentionally a qualification replay, not a claimed closure
    // sandbox: authored callbacks run twice from the same event seed, host
    // evidence, lane identity, and input corpus, and their observable output
    // must be byte-identical once opaque launch-claim IDs are removed.
    var first = runReplay(options);
    var second = runReplay(options);
    if (JSON.stringify(first) !== JSON.stringify(second)) {
      throw new Error('Event pack failed deterministic replay qualification');
    }
    return Object.freeze({ schema: 'EventDeterministicReplayV1', first: first, second: second });
  }

  return Object.freeze({ schema: 'FlipgameEventHarnessV2', Kernel: Kernel,
    Runtime: Runtime, Renderer: Renderer, RulesAdapter: RulesAdapter,
    DEFAULT_FACTS: DEFAULT_FACTS, makeSelection: makeSelection,
    makeContext: makeContext, makeSignal: makeSignal, makeDraft: makeDraft,
    makeStep: makeStep, makeContact: makeContact, makeProbe: makeProbe,
    makeFrame: makeFrame, makeScopeFrame: makeScopeFrame,
    makeCollider: makeCollider, makePack: makePack,
    createHarness: createHarness, drive: drive, assertNoLeaks: assertNoLeaks,
    assertDeterministicReplay: assertDeterministicReplay });
});
