// v112-event-runtime.js -- lane-local lifecycle and physics-evidence authority.
(function (root, factory) {
  'use strict';
  var Kernel = root && root.FlipgameV112EventKernel;
  if (typeof module === 'object' && module.exports) Kernel = require('./v112-event-kernel.js');
  var api = factory(Kernel);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV112EventRuntime = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (Kernel) {
  'use strict';

  if (!Kernel || Kernel.schema !== 'FlipgameEventKernelV2') {
    throw new Error('FlipgameV112EventKernel V2 must load before v112-event-runtime.js');
  }

  var PHASES_AFTER_QUALIFICATION = Object.freeze({
    qualified: true, launched: true, active: true, evaluated: true,
  });

  function plain(value) { return Kernel.isPlainObject(value); }
  function required(value, label, maximum) {
    return Kernel.primitiveString(value, label, maximum == null ? 160 : maximum, false);
  }
  function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
  function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
  function safeError(value, phase) {
    var fact = Kernel.safeThrown(value, phase);
    var error = new Error(fact.message);
    error.name = fact.name;
    return error;
  }

  function buildRegistry(packs) {
    if (!Array.isArray(packs) || !packs.length || packs.length > Kernel.EVENT_CLASSES.length) {
      throw new TypeError('One to three EventPackV1 packs are required');
    }
    var byId = Object.create(null);
    packs.forEach(function (packValue) {
      var pack = Kernel.validatePack(packValue);
      pack.ids.forEach(function (id) {
        if (own(byId, id)) throw new Error('Duplicate event pack owner for ' + id);
        byId[id] = pack;
      });
    });
    return byId;
  }

  function createEventRuntime(options) {
    if (!plain(options)) throw new TypeError('Event runtime options are required');
    Kernel.exactKeys(options, ['laneId', 'packs', 'reflow', 'resolveCollider', 'authority'],
      'Event runtime options');
    var laneId = required(options.laneId, 'laneId', 96);
    var byId = buildRegistry(options.packs);
    var hostReflow = options.reflow;
    var resolveCollider = options.resolveCollider;
    var authority = options.authority;
    if (hostReflow != null && typeof hostReflow !== 'function') {
      throw new TypeError('Event runtime reflow must be a function');
    }
    if (typeof resolveCollider !== 'function') {
      throw new TypeError('Event runtime requires a host collider resolver');
    }
    var authorityInfo = Kernel.runtimeAuthorityInfo(authority);
    if (authorityInfo.laneId !== laneId) {
      throw new Error('Event runtime lane does not match its branded lane capability');
    }

    var phase = 'idle';
    var pack = null;
    var selection = null;
    var selectionConsumed = false;
    var launchClaim = null;
    var contextSource = null;
    var context = null;
    var behavior = null;
    var scope = null;
    var outcome = null;
    var cleanupReport = null;
    var cleanupInProgress = false;
    var pendingLayout = null;
    var deferredResizeCount = 0;
    var stepSequence = 0;
    var lastStepElapsed = -1;
    var contactBeginCount = 0;
    var contacts = Object.create(null);
    var contactRecordCount = 0;
    var frameSignatures = Object.create(null);
    var frameCache = Object.create(null);
    var plinkoTransport = null;
    var plinkoReleaseApplied = false;
    var plinkoAscentObserved = false;
    var plinkoApexObserved = false;
    var plinkoBoardEntered = false;
    var callbackPhase = 'idle';
    var cleanedBehaviors = new WeakSet();
    var retired = { cycles: 0, released: 0, errorCount: 0,
      droppedErrors: 0, recentErrors: [] };

    function recordError(bucket, value, phaseValue) {
      // Never inspect a thrown value directly: proxies and accessor-backed
      // Error lookalikes are deliberately treated as hostile input.
      var fact = Kernel.safeThrown(value, phaseValue);
      bucket.errorCount += 1;
      if (bucket.recentErrors.length < Kernel.LIMITS.errors) bucket.recentErrors.push(fact);
      else bucket.droppedErrors += 1;
    }

    function checkedAdd(value, amount, label, maximum) {
      var next = value + amount;
      if (!Number.isSafeInteger(next) || next < 0 || next > maximum) {
        throw new RangeError(label + ' exceeded its bounded counter');
      }
      return next;
    }

    function normalizeContext(value) {
      if (!plain(value)) throw new TypeError('Event bind context is required');
      Kernel.exactKeys(value, ['layout', 'appearance', 'physicsProfile', 'hostColliderRefs'],
        'Event bind context');
      ['layout', 'appearance', 'physicsProfile'].forEach(function (key) {
        if (!plain(value[key])) throw new TypeError('Event bind context requires ' + key);
      });
      var hostColliderRefs = value.hostColliderRefs == null ? [] : value.hostColliderRefs;
      if (!Array.isArray(hostColliderRefs) || hostColliderRefs.length > 64) {
        throw new TypeError('Event bind hostColliderRefs must be a bounded array');
      }
      hostColliderRefs = Array.from(new Set(hostColliderRefs.map(function (entry) {
        return required(entry, 'host collider reference', 128);
      })));
      return Kernel.immutableData({ layout: value.layout, appearance: value.appearance,
        physicsProfile: value.physicsProfile, hostColliderRefs: hostColliderRefs },
      'event bind context');
    }

    function callSpecificBehavior(target, name, args) {
      var previous = callbackPhase;
      callbackPhase = name;
      try { return target[name].apply(target, args || []); }
      finally { callbackPhase = previous; }
    }
    function callBehavior(name, args) { return callSpecificBehavior(behavior, name, args); }

    function assertGameplayRngPhase() {
      if (['create', 'qualifyLaunch', 'launch', 'step', 'contact', 'evaluate']
        .indexOf(callbackPhase) < 0) {
        throw new Error('Gameplay RNG cannot advance during ' + callbackPhase);
      }
    }

    function callHost(fn, args, label) {
      return Kernel.callSynchronous(fn, null, args, label);
    }

    function colliderSnapshot(reference) {
      var resource = scope.getCollider(reference);
      var raw = callHost(resolveCollider, [resource, Object.freeze({
        schema: 'EventColliderResolveContextV1', laneId: laneId,
        eventId: selection.eventId, colliderRef: reference,
      })], 'event collider resolver');
      return Kernel.normalizeColliderSnapshot(raw);
    }

    function validateDirectiveOwnership(directive) {
      directive.forces.concat(directive.impulses, directive.bodies).forEach(function (command) {
        scope.getResource(command.entityRef, ['body']);
      });
      directive.constraints.forEach(function (command) {
        scope.getResource(command.constraintRef, ['constraint']);
      });
      directive.sensors.forEach(function (command) {
        scope.getResource(command.sensorRef, ['sensor']);
      });
      return directive;
    }

    function plinkoTransportFor(elapsedMs, objectColliderRef) {
      var appearance = contextSource.appearance;
      var profile = contextSource.physicsProfile;
      var flipperId = required(appearance.flipperId, 'Plinko flipperId', 96);
      var variantId = required(appearance.variantId, 'Plinko variantId', 96);
      var physicsProfileId = required(profile.id, 'Plinko physics profile ID', 96);
      var selectedColliderRef = required(profile.colliderRef,
        'Plinko selected collider reference', 128);
      if (selectedColliderRef !== objectColliderRef) {
        throw new Error('Plinko must transport the selected Flipper collider');
      }
      return Kernel.derivePlinkoTransportState({ elapsedMs: elapsedMs,
        objectColliderRef: objectColliderRef, flipperId: flipperId,
        variantId: variantId, physicsProfileId: physicsProfileId });
    }

    function hasPlinkoCameraCue(directive, state) {
      return directive.cameraCues.some(function (cue) {
        return cue.entityRef === state.cameraTargetRef &&
          cue.kind === 'plinko-' + state.cameraMode;
      });
    }

    function exactScaleCommand(command, reference, scaleX, scaleY) {
      return command && command.entityRef === reference &&
        closeEnough(command.scaleX, scaleX) && closeEnough(command.scaleY, scaleY) &&
        Object.keys(command).every(function (key) {
          return ['entityRef', 'scaleX', 'scaleY'].indexOf(key) >= 0;
        });
    }

    function hasAnyPhysicalCommand(directive) {
      return directive.forces.length !== 0 || directive.impulses.length !== 0 ||
        directive.bodies.length !== 0 || directive.constraints.length !== 0 ||
        directive.sensors.length !== 0;
    }

    function validatePlinkoLaunchDirective(directive, draft) {
      var expected = plinkoTransportFor(0, draft.bodyRef);
      if (!same(directive.plinkoTransport, expected)) {
        throw new Error('Plinko launch lacks its deterministic compression phase');
      }
      var objectBodies = directive.bodies.filter(function (command) {
        return command.entityRef === draft.bodyRef;
      });
      var trampolineBodies = directive.bodies.filter(function (command) {
        return command.entityRef === expected.trampolineColliderRef;
      });
      if (directive.bodies.length !== 2 || directive.forces.length !== 0 ||
          directive.impulses.length !== 0 || directive.constraints.length !== 0 ||
          directive.sensors.length !== 0 || objectBodies.length !== 1 ||
          !exactScaleCommand(objectBodies[0], draft.bodyRef,
            Kernel.PLINKO_TRANSPORT.compressedScaleX,
            Kernel.PLINKO_TRANSPORT.compressedScaleY) || trampolineBodies.length !== 1 ||
          !exactScaleCommand(trampolineBodies[0], expected.trampolineColliderRef,
            Kernel.PLINKO_TRANSPORT.trampolineCompressedScaleX,
            Kernel.PLINKO_TRANSPORT.trampolineCompressedScaleY)) {
        throw new Error('Plinko must begin with visible physical trampoline compression');
      }
      if (!hasPlinkoCameraCue(directive, expected)) {
        throw new Error('Plinko compression camera must lock to the selected Flipper');
      }
      plinkoTransport = expected;
      plinkoReleaseApplied = false;
      plinkoAscentObserved = false;
      plinkoApexObserved = false;
      plinkoBoardEntered = false;
      return directive;
    }

    function validatePlinkoStepDirective(directive, physicsStep) {
      if (!plinkoTransport) throw new Error('Plinko step lacks an opening transport');
      var expected = plinkoTransportFor(physicsStep.elapsedMs,
        plinkoTransport.objectColliderRef);
      if (!same(directive.plinkoTransport, expected)) {
        throw new Error('Plinko step conflicts with its deterministic phase clock');
      }
      if (!hasPlinkoCameraCue(directive, expected)) {
        throw new Error('Plinko camera lost its selected-Flipper tracking target');
      }
      var objectRef = expected.objectColliderRef;
      if (!plinkoReleaseApplied && expected.phase !== 'compression' &&
          expected.phase !== 'release') {
        throw new Error('Plinko missed its deterministic trampoline release window');
      }
      if (!plinkoReleaseApplied && expected.phase === 'release') {
        var restoredObjects = directive.bodies.filter(function (command) {
          return command.entityRef === objectRef;
        });
        var restoredTrampolines = directive.bodies.filter(function (command) {
          return command.entityRef === expected.trampolineColliderRef;
        });
        var releaseImpulse = directive.impulses[0];
        if (directive.forces.length !== 0 || directive.impulses.length !== 1 ||
            directive.bodies.length !== 2 || directive.constraints.length !== 0 ||
            directive.sensors.length !== 0 || !releaseImpulse ||
            releaseImpulse.entityRef !== objectRef || !closeEnough(releaseImpulse.x, 0) ||
            !closeEnough(releaseImpulse.y,
              -Kernel.PLINKO_TRANSPORT.releaseUpwardImpulse) ||
            releaseImpulse.atX != null || releaseImpulse.atY != null ||
            restoredObjects.length !== 1 ||
            !exactScaleCommand(restoredObjects[0], objectRef, 1, 1) ||
            restoredTrampolines.length !== 1 ||
            !exactScaleCommand(restoredTrampolines[0],
              expected.trampolineColliderRef, 1, 1)) {
          throw new Error('Plinko trampoline release permits only its exact centered spring impulse and scale restores');
        }
        plinkoReleaseApplied = true;
      } else if (physicsStep.elapsedMs < Kernel.PLINKO_TRANSPORT.boardDropStartMs &&
          hasAnyPhysicalCommand(directive)) {
        throw new Error('Plinko opening preserves its launch vector and spin after the single spring release');
      }
      if (expected.phase === 'ascent') {
        if (!plinkoReleaseApplied) throw new Error('Plinko ascent requires trampoline release');
        plinkoAscentObserved = true;
      } else if (expected.phase === 'apex-handoff') {
        if (!plinkoAscentObserved) throw new Error('Plinko apex requires observed upward travel');
        plinkoApexObserved = true;
      } else if (expected.phase === 'board-descent') {
        if (!plinkoApexObserved) throw new Error('Plinko board entry requires apex camera handoff');
        plinkoBoardEntered = true;
      } else if ((expected.phase === 'anti-wedge-recovery' ||
          expected.phase === 'recovery-timeout') && !plinkoBoardEntered) {
        throw new Error('Plinko recovery requires an observed board descent');
      }
      plinkoTransport = expected;
      return directive;
    }

    function closeEnough(left, right) { return Math.abs(left - right) <= 1e-7; }

    function settledEvidence(snapshot, label) {
      if (!snapshot.evidence || snapshot.evidence.settled !== true) {
        throw new Error(label + ' lacks host-owned settled collider evidence');
      }
      return snapshot.evidence;
    }

    function registerHighValueColliders(facts, probe) {
      var values = facts.values;
      var terminal = { schema: 'ColliderTerminalEvidenceV1', eventId: selection.eventId,
        probe: probe, colliders: Object.create(null), derived: Object.create(null) };
      if (selection.eventId === 'mitosis') {
        var primarySnapshot = colliderSnapshot(values.primaryColliderRef);
        var secondarySnapshot = colliderSnapshot(values.secondaryColliderRef);
        var primary = settledEvidence(primarySnapshot, 'Mitosis primary');
        var secondary = settledEvidence(secondarySnapshot, 'Mitosis secondary');
        if (primary.validLanding !== values.primaryLanded ||
            secondary.validLanding !== values.secondaryLanded) {
          throw new Error('Mitosis facts conflict with host collider landing verdicts');
        }
        terminal.colliders.primary = primarySnapshot;
        terminal.colliders.secondary = secondarySnapshot;
      } else if (selection.eventId === 'roulette-table') {
        var wheel = colliderSnapshot(values.wheelColliderRef);
        var rouletteObject = colliderSnapshot(values.objectColliderRef);
        settledEvidence(rouletteObject, 'Roulette object');
        var dx = rouletteObject.transform.x - wheel.transform.x;
        var dy = rouletteObject.transform.y - wheel.transform.y;
        if (Math.hypot(dx, dy) <= 1e-7) {
          throw new Error('Roulette object lacks authoritative radial wheel geometry');
        }
        var relative = Math.atan2(dy, dx) - wheel.transform.angle;
        relative = ((relative % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        var derivedSector = Math.min(7, Math.floor(relative / (Math.PI * 2 / 8)));
        if (values.sectorCount !== 8 || values.sectorIndex !== derivedSector) {
          throw new Error('Roulette supplied sector contradicts authoritative wheel/object geometry');
        }
        terminal.colliders.wheel = wheel;
        terminal.colliders.object = rouletteObject;
        terminal.derived.sectorIndex = derivedSector;
      } else if (selection.eventId === 'plinko') {
        var plinkoObject = colliderSnapshot(values.objectColliderRef);
        var objectEvidence = plinkoObject.evidence;
        var expectedTotalMs = Kernel.PLINKO_TRANSPORT.boardDropStartMs +
          values.dropDurationMs;
        if (!objectEvidence || !plinkoTransport ||
            values.objectColliderRef !== plinkoTransport.objectColliderRef ||
            !closeEnough(expectedTotalMs, probe.elapsedMs) ||
            !closeEnough(values.dropDurationMs, plinkoTransport.dropElapsedMs)) {
          throw new Error('Plinko facts conflict with host timing evidence');
        }
        var expectedTransportPhase = values.completionKind === 'clean'
          ? 'board-descent' : (values.completionKind === 'recovered'
            ? 'anti-wedge-recovery' : 'recovery-timeout');
        if (plinkoTransport.phase !== expectedTransportPhase) {
          throw new Error('Plinko completion conflicts with its physical transport phase');
        }
        if (values.completionKind === 'no-contest') {
          if (probe.settled || objectEvidence.settled ||
              objectEvidence.recoveryStartedMs !== values.recoveryStartedMs ||
              objectEvidence.recoveryImpulseCount !== values.recoveryImpulseCount) {
            throw new Error('Plinko no-contest lacks host recovery-timeout evidence');
          }
          terminal.derived.noContest = true;
        } else {
          settledEvidence(plinkoObject, 'Plinko object');
          var slot = colliderSnapshot(values.slotSensorRef);
          if (!slot.evidence || slot.evidence.sensorActive !== true ||
              slot.evidence.sensorKind !== 'plinko-slot' ||
              slot.evidence.sensorIndex !== values.slotIndex ||
              plinkoObject.transform.x < slot.bounds.left ||
              plinkoObject.transform.x > slot.bounds.right) {
            throw new Error('Plinko supplied slot contradicts branded host sensor geometry');
          }
          if (values.completionKind === 'recovered' &&
              (objectEvidence.recoveryStartedMs !== values.recoveryStartedMs ||
               objectEvidence.recoveryImpulseCount !== values.recoveryImpulseCount)) {
            throw new Error('Plinko recovery facts contradict host provenance');
          }
          terminal.colliders.slot = slot;
          terminal.derived.slotIndex = slot.evidence.sensorIndex;
        }
        terminal.colliders.object = plinkoObject;
        terminal.derived.completionKind = values.completionKind;
      } else if (selection.eventId === 'cap-toss') {
        var bodySnapshot = colliderSnapshot(values.bodyColliderRef);
        var topSnapshot = colliderSnapshot(values.topColliderRef);
        var body = settledEvidence(bodySnapshot, 'Cap Toss body');
        var top = settledEvidence(topSnapshot, 'Cap Toss top');
        if (body.validLanding !== values.bodyLanded || top.validLanding !== values.topLanded) {
          throw new Error('Cap Toss facts conflict with host collider landing verdicts');
        }
        terminal.colliders.body = bodySnapshot;
        terminal.colliders.top = topSnapshot;
      }
      return Kernel.immutableData(terminal, 'collider terminal evidence');
    }

    function makeCycle(nextContext) {
      scope = Kernel.createResourceScope(laneId);
      var rng = Kernel.createEventRng(selection.eventSeed, assertGameplayRngPhase);
      var visualRng = Kernel.createVisualRng(selection.eventSeed);
      context = Object.freeze({ selection: selection, layout: nextContext.layout,
        appearance: nextContext.appearance, physicsProfile: nextContext.physicsProfile,
        hostColliderRefs: nextContext.hostColliderRefs,
        scope: scope, rng: rng, visualRng: visualRng });
      plinkoTransport = null;
      plinkoReleaseApplied = false;
      plinkoAscentObserved = false;
      plinkoApexObserved = false;
      plinkoBoardEntered = false;
      try {
        callbackPhase = 'create';
        try {
          behavior = Kernel.validateBehavior(callHost(pack.create,
            [selection.eventId, context], 'EventPackV1.create'));
        } finally { callbackPhase = 'idle'; }
      } catch (thrown) {
        var failure = scope.cleanup('pack-create-error');
        var createErrors = [Kernel.safeThrown(thrown, 'create')];
        var createDropped = failure.droppedErrors || 0;
        failure.errors.forEach(function (entry) {
          if (createErrors.length < Kernel.LIMITS.errors) {
            createErrors.push(Kernel.safeThrown(entry, 'resource.dispose'));
          } else createDropped += 1;
        });
        phase = 'cleaned';
        cleanupReport = Kernel.deepFreeze({ schema: 'EventRuntimeCleanupV1', laneId: laneId,
          eventId: selection.eventId, reason: 'pack-create-error', behaviorCalled: false,
          resources: failure, deferredReflowApplied: false, deferredResizeCount: 0,
          retired: Kernel.immutableData(retired, 'retired cleanup summary'),
          errors: Object.freeze(createErrors), droppedErrors: createDropped,
          clean: false });
        var error = safeError(thrown, 'create');
        error.eventCleanupReport = cleanupReport;
        throw error;
      }
    }

    function bind(selectionValue, bindContext) {
      if (phase !== 'idle') throw new Error('Event runtime can bind only once');
      var selectionAuthority = Kernel.selectionInfo(authority, selectionValue);
      var id = selectionAuthority.eventId;
      if (!own(byId, id)) throw new TypeError('No EventPackV1 owns the selected event');
      pack = byId[id];
      selection = Kernel.claimSelection(authority, selectionValue, id, pack.eventClass);
      contextSource = normalizeContext(bindContext);
      makeCycle(contextSource);
      phase = 'bound';
      return snapshot();
    }

    function issueSelection(selectionValue) {
      if (phase !== 'idle') throw new Error('Selections can be issued only before bind');
      return Kernel.issueSelection(authority, selectionValue);
    }

    function cleanupCycle(reason, targetBehavior, targetScope) {
      var summary = { behaviorCalled: false, released: 0, errorCount: 0,
        droppedErrors: 0, recentErrors: [] };
      if (targetBehavior && !cleanedBehaviors.has(targetBehavior)) {
        cleanedBehaviors.add(targetBehavior);
        summary.behaviorCalled = true;
        try {
          var output = callSpecificBehavior(targetBehavior, 'cleanup', [reason]);
          if (output != null) throw new TypeError('EventBehaviorV1.cleanup must return nothing');
        } catch (thrown) { recordError(summary, thrown, 'behavior.cleanup'); }
      }
      var resources;
      try {
        resources = targetScope ? targetScope.cleanup(reason) : Kernel.deepFreeze({
          schema: 'EventResourceCleanupV1', laneId: laneId, reason: reason,
          released: [], errors: [], droppedErrors: 0, clean: true });
      } catch (thrown) {
        recordError(summary, thrown, 'resource.cleanup');
        resources = Kernel.deepFreeze({ schema: 'EventResourceCleanupV1', laneId: laneId,
          reason: reason, released: [], errors: [], droppedErrors: 1, clean: false });
      }
      summary.released = resources.released.length;
      resources.errors.forEach(function (entry) { recordError(summary, entry, 'resource.dispose'); });
      summary.droppedErrors += resources.droppedErrors || 0;
      return { behaviorCalled: summary.behaviorCalled, resources: resources,
        released: summary.released, errorCount: summary.errorCount,
        droppedErrors: summary.droppedErrors, recentErrors: summary.recentErrors };
    }

    function addRetired(cycle) {
      retired.cycles = checkedAdd(retired.cycles, 1, 'retired event cycles', 1000000);
      retired.released = checkedAdd(retired.released, cycle.released,
        'retired event resources', 100000000);
      retired.errorCount = checkedAdd(retired.errorCount, cycle.errorCount,
        'retired event errors', 100000000);
      retired.droppedErrors = checkedAdd(retired.droppedErrors, cycle.droppedErrors,
        'retired dropped errors', 100000000);
      cycle.recentErrors.forEach(function (entry) {
        if (retired.recentErrors.length < Kernel.LIMITS.errors) retired.recentErrors.push(entry);
        else retired.droppedErrors = checkedAdd(retired.droppedErrors, 1,
          'retired dropped errors', 100000000);
      });
    }

    function cleanupInternal(reasonValue) {
      if (cleanupReport) return cleanupReport;
      var reason = Kernel.safeReason(reasonValue, 'cleanup', 160);
      if (cleanupInProgress) return Kernel.deepFreeze({ schema: 'EventRuntimeCleanupV1',
        laneId: laneId, eventId: selection ? selection.eventId : null,
        reason: reason, inProgress: true, clean: false, errors: [], droppedErrors: 0 });
      cleanupInProgress = true;
      phase = 'cleaned';
      var cycle = null;
      var errors = [];
      var droppedErrors = 0;
      var reflowApplied = false;
      try {
        try { cycle = cleanupCycle(reason, behavior, scope); }
        catch (thrown) {
          cycle = { behaviorCalled: false, resources: null, released: 0,
            errorCount: 1, droppedErrors: 0,
            recentErrors: [Kernel.safeThrown(thrown, 'cleanup-cycle')] };
        }
        cycle.recentErrors.forEach(function (entry) {
          if (errors.length < Kernel.LIMITS.errors) errors.push(entry); else droppedErrors += 1;
        });
        droppedErrors += cycle.droppedErrors;
        retired.recentErrors.forEach(function (entry) {
          if (errors.length < Kernel.LIMITS.errors) errors.push(entry); else droppedErrors += 1;
        });
        droppedErrors += retired.droppedErrors;
        if (pendingLayout) {
          var layout = pendingLayout;
          pendingLayout = null;
          reflowApplied = hostReflow != null;
          if (hostReflow) {
            try {
              callHost(hostReflow, [layout, Object.freeze({ schema: 'EventResizeV1',
                laneId: laneId, deferred: true, coalescedRequests: deferredResizeCount,
                reason: reason })], 'event host reflow');
            } catch (thrown) {
              if (errors.length < Kernel.LIMITS.errors) errors.push(Kernel.safeThrown(thrown, 'host.reflow'));
              else droppedErrors += 1;
            }
          }
        }
        cleanupReport = Kernel.deepFreeze({ schema: 'EventRuntimeCleanupV1', laneId: laneId,
          eventId: selection ? selection.eventId : null, reason: reason,
          behaviorCalled: cycle.behaviorCalled, resources: cycle.resources,
          deferredReflowApplied: reflowApplied, deferredResizeCount: deferredResizeCount,
          retired: Kernel.immutableData(retired, 'retired cleanup summary'),
          errors: errors, droppedErrors: droppedErrors,
          clean: errors.length === 0 && droppedErrors === 0 && retired.errorCount === 0 });
        plinkoTransport = null;
        plinkoReleaseApplied = false;
        plinkoAscentObserved = false;
        plinkoApexObserved = false;
        plinkoBoardEntered = false;
        return cleanupReport;
      } finally {
        cleanupInProgress = false;
      }
    }

    function invoke(handlerName, action) {
      try { return action(); }
      catch (thrown) {
        var report = cleanupInternal('handler-error:' + handlerName);
        var error = safeError(thrown, handlerName);
        error.eventCleanupReport = report;
        throw error;
      }
    }

    function telegraph() {
      if (phase !== 'bound') throw new Error('telegraph requires a bound event');
      return invoke('telegraph', function () {
        var result = Kernel.normalizeTelegraph(callBehavior('telegraph'));
        phase = 'telegraphed';
        return result;
      });
    }

    function qualifyLaunch(signalValue) {
      if (phase !== 'telegraphed') throw new Error('qualifyLaunch requires a telegraphed event');
      if (selectionConsumed) throw new Error('Event selection was already consumed');
      return invoke('qualifyLaunch', function () {
        var signal = Kernel.normalizeLaunchSignal(signalValue);
        var result = Kernel.normalizeQualification(callBehavior('qualifyLaunch', [signal]));
        if (result.qualified) {
          selectionConsumed = true;
          launchClaim = Kernel.issueLaunchClaim(authority, selection);
          phase = 'qualified';
        }
        return Kernel.deepFreeze({ schema: 'EventLaunchQualificationV1',
          qualified: result.qualified, reason: result.reason,
          consumed: result.qualified, launchClaim: result.qualified ? launchClaim : null });
      });
    }

    function launch(draftValue) {
      if (phase !== 'qualified' || !selectionConsumed || !launchClaim) {
        throw new Error('launch requires an atomically claimed qualified gesture');
      }
      return invoke('launch', function () {
        var draft = Kernel.normalizeLaunchDraft(draftValue);
        colliderSnapshot(draft.bodyRef);
        var result = validateDirectiveOwnership(
          Kernel.normalizeDirective('launch', callBehavior('launch', [draft])));
        if (selection.eventId === 'plinko') {
          result = validatePlinkoLaunchDirective(result, draft);
        } else if (result.plinkoTransport != null) {
          throw new Error('Only Plinko may publish a Plinko transport state');
        }
        phase = 'launched';
        stepSequence = 0;
        lastStepElapsed = -1;
        contacts = Object.create(null);
        contactRecordCount = 0;
        contactBeginCount = 0;
        frameSignatures = Object.create(null);
        frameCache = Object.create(null);
        return result;
      });
    }

    function assertFlightPhase(name) {
      if (phase !== 'launched' && phase !== 'active') {
        throw new Error(name + ' requires an active launch');
      }
    }

    function step(stepValue) {
      assertFlightPhase('step');
      return invoke('step', function () {
        var physicsStep = Kernel.normalizeStep(stepValue);
        if (physicsStep.elapsedMs <= lastStepElapsed) {
          throw new Error('Physics steps must have strictly increasing elapsedMs');
        }
        var result = validateDirectiveOwnership(
          Kernel.normalizeDirective('step', callBehavior('step', [physicsStep])));
        if (selection.eventId === 'plinko') {
          result = validatePlinkoStepDirective(result, physicsStep);
        } else if (result.plinkoTransport != null) {
          throw new Error('Only Plinko may publish a Plinko transport state');
        }
        phase = 'active';
        stepSequence = checkedAdd(stepSequence, 1, 'event physics steps', 10000000);
        lastStepElapsed = physicsStep.elapsedMs;
        frameSignatures = Object.create(null);
        frameCache = Object.create(null);
        return result;
      });
    }

    function contact(contactValue) {
      assertFlightPhase('contact');
      if (stepSequence < 1) throw new Error('contact requires preceding physics step evidence');
      var normalized;
      try { normalized = Kernel.normalizeContact(contactValue); }
      catch (thrown) { return invoke('contact', function () { throw thrown; }); }
      var ownsA = scope.ownsResource(normalized.entityARef, ['body', 'sensor']);
      var ownsB = scope.ownsResource(normalized.entityBRef, ['body', 'sensor']);
      var hostRefs = contextSource.hostColliderRefs || [];
      var knownA = ownsA || hostRefs.indexOf(normalized.entityARef) >= 0;
      var knownB = ownsB || hostRefs.indexOf(normalized.entityBRef) >= 0;
      if ((!ownsA && !ownsB) || !knownA || !knownB) {
        return invoke('contact', function () {
          throw new Error('Contact must join a lane-owned collider to registered host evidence');
        });
      }
      var prior = contacts[normalized.contactId];
      var fingerprint = JSON.stringify(normalized);
      if (normalized.elapsedMs > lastStepElapsed) {
        return invoke('contact', function () { throw new Error('Contact is ahead of host physics evidence'); });
      }
      if (!prior) {
        if (normalized.phase !== 'begin') {
          return invoke('contact', function () { throw new Error('Contact must begin before persist or end'); });
        }
        if (contactRecordCount >= Kernel.LIMITS.contacts) {
          return invoke('contact', function () { throw new RangeError('Event contact limit exceeded'); });
        }
      } else {
        if (prior.lastFingerprint === fingerprint) return Object.freeze({
          schema: 'EventContactDecisionV1', duplicate: true, directive: null });
        if (prior.ended) return invoke('contact', function () { throw new Error('Ended contact cannot restart'); });
        if (prior.entityARef !== normalized.entityARef || prior.entityBRef !== normalized.entityBRef ||
            normalized.elapsedMs < prior.elapsedMs || normalized.phase === 'begin') {
          return invoke('contact', function () { throw new Error('Contact transition is reordered or inconsistent'); });
        }
      }
      return invoke('contact', function () {
        var directive = validateDirectiveOwnership(
          Kernel.normalizeDirective('contact', callBehavior('contact', [normalized])));
        if (!prior) {
          contactRecordCount += 1;
          contactBeginCount += 1;
          prior = { entityARef: normalized.entityARef, entityBRef: normalized.entityBRef,
            elapsedMs: normalized.elapsedMs, ended: false, lastFingerprint: null };
          contacts[normalized.contactId] = prior;
        }
        prior.elapsedMs = normalized.elapsedMs;
        prior.ended = normalized.phase === 'end';
        prior.lastFingerprint = fingerprint;
        return Object.freeze({ schema: 'EventContactDecisionV1', duplicate: false,
          directive: directive });
      });
    }

    function evaluate(probeValue) {
      assertFlightPhase('evaluate');
      if (stepSequence < 1) throw new Error('evaluate requires physics step evidence');
      return invoke('evaluate', function () {
        var probe = Kernel.normalizeLandingProbe(probeValue);
        if (probe.elapsedMs > lastStepElapsed) throw new Error('Landing probe is ahead of host physics evidence');
        if (probe.contactCount > contactBeginCount) throw new Error('Landing probe contact count exceeds accepted contacts');
        if (probe.result === 'MAKE' && contactBeginCount < 1) throw new Error('MAKE requires accepted contact evidence');
        var evaluation = Kernel.normalizeBehaviorEvaluation(selection.eventId,
          callBehavior('evaluate', [probe]));
        if (!probe.settled) {
          var isPlinkoNoContest = selection.eventId === 'plinko' && evaluation != null &&
            evaluation.facts.values.completionKind === 'no-contest' &&
            probe.elapsedMs === Kernel.PLINKO_TRANSPORT.boardDropStartMs +
              Kernel.PLINKO_TRANSPORT.timeoutDropMs;
          if (!isPlinkoNoContest && evaluation != null) {
            throw new Error('Event behavior cannot resolve an unsettled landing');
          }
          if (isPlinkoNoContest) {
            if (evaluation.result !== probe.result || evaluation.pose !== probe.pose ||
                evaluation.reason !== probe.reason) {
              throw new Error('Event behavior verdict conflicts with the host landing verdict');
            }
          } else {
            phase = 'active';
            return null;
          }
        }
        if (evaluation == null) { phase = 'active'; return null; }
        if (evaluation.result !== probe.result || evaluation.pose !== probe.pose ||
            evaluation.reason !== probe.reason) {
          throw new Error('Event behavior verdict conflicts with the host landing verdict');
        }
        var derivedEvidence = registerHighValueColliders(evaluation.facts, probe);
        var terminalEvidence = Kernel.issueTerminalEvidence(authority, launchClaim, derivedEvidence);
        outcome = Kernel.issueOutcome(authority, launchClaim, terminalEvidence, {
          eventId: selection.eventId,
          eventClass: pack.eventClass, laneId: laneId,
          launchClaimId: launchClaim.claimId, result: probe.result,
          pose: probe.pose, reason: probe.reason, facts: evaluation.facts,
          evidence: { steps: stepSequence, contacts: contactBeginCount,
            elapsedMs: probe.elapsedMs } });
        phase = 'evaluated';
        if (selection.eventId === 'plinko' &&
            evaluation.facts.values.completionKind === 'no-contest') {
          // A timed-out board is a retry, not a suspended physical scene.  Its
          // branded outcome survives cleanup, while every body/sensor and any
          // deferred resize is released before control returns to match rules.
          cleanupInternal('plinko-no-contest');
        }
        return outcome;
      });
    }

    function colliderStateMap() {
      var result = Object.create(null);
      scope.colliderRefs().forEach(function (reference) {
        result[reference] = colliderSnapshot(reference);
      });
      return result;
    }

    function exactColliderFrame(frameValue, colliders) {
      var represented = Object.create(null);
      frameValue.entities.forEach(function (entity) {
        if (!entity.colliderRef) {
          if (Kernel.entityNeedsCollider(entity)) {
            throw new Error('Physical EventFrame entity lacks a collider: ' + entity.entityId);
          }
          return;
        }
        if (represented[entity.colliderRef]) {
          throw new Error('EventFrame duplicates collider-backed entity: ' + entity.colliderRef);
        }
        var collider = colliders[entity.colliderRef];
        if (!collider) throw new Error('EventFrame references a collider outside this event lane');
        represented[entity.colliderRef] = true;
        if (!same(entity.transform, collider.transform) || !same(entity.bounds, collider.bounds)) {
          throw new Error('EventFrame entity diverges from its authoritative collider: ' + entity.entityId);
        }
      });
      scope.colliderRefs().forEach(function (reference) {
        if (!represented[reference]) {
          throw new Error('EventFrame omitted an owned physical collider: ' + reference);
        }
      });
    }

    function canonicalFrame() {
      if (frameCache.canonical) return frameCache.canonical;
      var before = colliderStateMap();
      var raw = callBehavior('frame', [false]);
      var after = colliderStateMap();
      if (!same(before, after)) {
        throw new Error('EventBehaviorV1.frame mutated authoritative physics state');
      }
      if (!plain(raw)) throw new TypeError('EventBehaviorV1.frame must return EventFrameV1 data');
      if (raw.reducedMotion != null && raw.reducedMotion !== false) {
        throw new Error('The authoritative mechanics frame must use full-motion presentation');
      }
      var source = Object.create(null);
      Object.keys(raw).forEach(function (key) { source[key] = raw[key]; });
      source.reducedMotion = false;
      source.sequence = raw.sequence == null ? stepSequence : raw.sequence;
      if (source.sequence !== stepSequence) throw new Error('EventFrame sequence is host-owned');
      var normalized = Kernel.normalizeFrame(source, { eventId: selection.eventId,
        eventClass: pack.eventClass, laneId: laneId });
      exactColliderFrame(normalized, before);
      if (selection.eventId === 'plinko') {
        if (!same(normalized.plinkoTransport, plinkoTransport)) {
          throw new Error('Plinko frame diverges from its authoritative transport phase');
        }
        var selectedFlippers = normalized.entities.filter(function (entity) {
          return entity.colliderRef === plinkoTransport.objectColliderRef;
        });
        var expectedAppearance = plinkoTransport.flipperId + ':' + plinkoTransport.variantId;
        if (selectedFlippers.length !== 1 ||
            selectedFlippers[0].appearanceRef !== expectedAppearance ||
            selectedFlippers[0].visualStateRef !== 'plinko-' + plinkoTransport.phase) {
          throw new Error('Plinko frame substituted or detached the selected Flipper');
        }
        var board = normalized.entities.find(function (entity) {
          return entity.entityId === 'plinko-board-24';
        });
        var trampoline = normalized.entities.find(function (entity) {
          return entity.entityId === 'plinko-opening-trampoline';
        });
        var boardExpected = ['apex-handoff', 'board-descent', 'anti-wedge-recovery',
          'recovery-timeout'].indexOf(plinkoTransport.phase) >= 0;
        var trampolineExpected = ['compression', 'release'].indexOf(
          plinkoTransport.phase) >= 0;
        if (!board || board.appearanceRef !== 'plinko-board:24-rows' ||
            board.visible !== boardExpected || !trampoline ||
            trampoline.appearanceRef !== 'plinko-trampoline:opening' ||
            trampoline.colliderRef !== plinkoTransport.trampolineColliderRef ||
            trampoline.role !== 'event-body' ||
            trampoline.visible !== trampolineExpected ||
            !normalized.cues.some(function (cue) {
              return cue.entityRef === plinkoTransport.cameraTargetRef &&
                cue.kind === 'plinko-' + plinkoTransport.cameraMode;
            })) {
          throw new Error('Plinko frame lacks continuous trampoline/board camera presentation');
        }
      }
      var signature = Kernel.mechanicsSignature(normalized);
      if (frameSignatures.all != null && frameSignatures.all !== signature) {
        throw new Error('Event frame mechanics changed without a host physics step');
      }
      frameSignatures.all = signature;
      frameCache.canonical = normalized;
      return normalized;
    }

    function deriveFrame(full, reduced) {
      if (!reduced) return full;
      return Kernel.normalizeFrame({ schema: 'EventFrameV1', eventId: full.eventId,
        eventClass: full.eventClass, laneId: full.laneId, sequence: full.sequence,
        entities: full.entities, cues: full.cues.map(function (cue) {
          return { cueId: cue.cueId, kind: cue.kind, entityRef: cue.entityRef,
            intensity: Math.min(cue.intensity, 0.45), durationMs: Math.min(cue.durationMs, 900),
            textRef: cue.textRef, ariaCue: cue.ariaCue };
        }), reducedMotion: true, plinkoTransport: full.plinkoTransport }, { eventId: full.eventId,
        eventClass: full.eventClass, laneId: full.laneId });
    }

    function frame(reducedMotion) {
      if (phase !== 'launched' && phase !== 'active' && phase !== 'evaluated') {
        throw new Error('frame requires a launched or evaluated event');
      }
      return invoke('frame', function () {
        var key = reducedMotion === true ? 'reduced' : 'full';
        if (frameCache[key]) return frameCache[key];
        var full = canonicalFrame();
        var selected = deriveFrame(full, reducedMotion === true);
        if (Kernel.mechanicsSignature(full) !== Kernel.mechanicsSignature(selected)) {
          throw new Error('Reduced motion changed authoritative event mechanics');
        }
        frameCache[key] = Kernel.issueFrame(authority, selected);
        return frameCache[key];
      });
    }

    function callReflow(layout, metadata) {
      if (hostReflow) callHost(hostReflow, [layout, metadata], 'event host reflow');
    }

    function resize(layoutValue) {
      if (phase === 'cleaned') throw new Error('Cannot resize a cleaned event runtime');
      if (!plain(layoutValue)) throw new TypeError('Event layout must be a data object');
      var layout = Kernel.immutableData(layoutValue, 'event layout');
      if (phase === 'idle') {
        return invoke('resize', function () {
          callReflow(layout, Object.freeze({ schema: 'EventResizeV1', laneId: laneId,
            deferred: false, coalescedRequests: 1, reason: 'idle-resize' }));
          return Object.freeze({ schema: 'EventResizeDecisionV1', deferred: false, rebound: false });
        });
      }
      if (PHASES_AFTER_QUALIFICATION[phase]) {
        pendingLayout = layout;
        deferredResizeCount = checkedAdd(deferredResizeCount, 1,
          'deferred event resizes', 1000000);
        return Object.freeze({ schema: 'EventResizeDecisionV1', deferred: true,
          rebound: false, coalescedRequests: deferredResizeCount });
      }
      return invoke('resize', function () {
        var previousPhase = phase;
        var cycle = cleanupCycle('prelaunch-resize', behavior, scope);
        addRetired(cycle);
        if (cycle.errorCount || cycle.droppedErrors) throw new Error('Prelaunch event rebind cleanup failed');
        callReflow(layout, Object.freeze({ schema: 'EventResizeV1', laneId: laneId,
          deferred: false, coalescedRequests: 1, reason: 'prelaunch-resize' }));
        contextSource = Kernel.immutableData({ layout: layout,
          appearance: contextSource.appearance, physicsProfile: contextSource.physicsProfile,
          hostColliderRefs: contextSource.hostColliderRefs },
        'event bind context');
        makeCycle(contextSource);
        phase = 'bound';
        if (previousPhase === 'telegraphed') {
          Kernel.normalizeTelegraph(callBehavior('telegraph'));
          phase = 'telegraphed';
        }
        return Object.freeze({ schema: 'EventResizeDecisionV1', deferred: false,
          rebound: true });
      });
    }

    function snapshot() {
      return Kernel.deepFreeze({ schema: 'EventRuntimeSnapshotV1', laneId: laneId,
        phase: phase, eventId: selection ? selection.eventId : null,
        eventClass: pack ? pack.eventClass : null,
        selection: selection ? { schema: selection.schema, eventId: selection.eventId,
          displayName: selection.displayName, eventClass: selection.eventClass,
          eventSeed: selection.eventSeed, oddsProfile: selection.oddsProfile,
          forced: selection.forced, testData: selection.testData,
          consumed: selectionConsumed, telegraph: selection.telegraph } : null,
        launchClaim: launchClaim, outcome: outcome,
        steps: stepSequence, contacts: contactBeginCount,
        plinkoTransport: plinkoTransport,
        pendingResize: pendingLayout != null, deferredResizeCount: deferredResizeCount,
        retired: Kernel.immutableData(retired, 'retired cleanup summary'),
        resources: scope ? scope.snapshot() : null, cleanup: cleanupReport });
    }

    return Object.freeze({ schema: 'EventRuntimeV2', laneId: laneId,
      issueSelection: issueSelection, bind: bind, telegraph: telegraph, qualifyLaunch: qualifyLaunch,
      launch: launch, step: step, contact: contact, evaluate: evaluate,
      frame: frame, resize: resize, cleanup: cleanupInternal, snapshot: snapshot });
  }

  return Object.freeze({ schema: 'FlipgameEventRuntimeV2',
    createEventRuntime: createEventRuntime });
});
