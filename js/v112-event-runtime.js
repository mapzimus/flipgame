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
    if (!authority || typeof authority.issueFrame !== 'function' ||
        typeof authority.issueOutcome !== 'function') {
      throw new TypeError('Event runtime requires an EventAuthorityV1 runtime capability');
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

    function normalizeContext(value) {
      if (!plain(value)) throw new TypeError('Event bind context is required');
      Kernel.exactKeys(value, ['layout', 'appearance', 'physicsProfile'], 'Event bind context');
      ['layout', 'appearance', 'physicsProfile'].forEach(function (key) {
        if (!plain(value[key])) throw new TypeError('Event bind context requires ' + key);
      });
      return Kernel.immutableData({ layout: value.layout, appearance: value.appearance,
        physicsProfile: value.physicsProfile }, 'event bind context');
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

    function closeEnough(left, right) { return Math.abs(left - right) <= 1e-7; }

    function settledEvidence(snapshot, label) {
      if (!snapshot.evidence || snapshot.evidence.settled !== true) {
        throw new Error(label + ' lacks host-owned settled collider evidence');
      }
      return snapshot.evidence;
    }

    function registerHighValueColliders(facts, probe) {
      var values = facts.values;
      if (selection.eventId === 'mitosis') {
        var primary = settledEvidence(colliderSnapshot(values.primaryColliderRef), 'Mitosis primary');
        var secondary = settledEvidence(colliderSnapshot(values.secondaryColliderRef), 'Mitosis secondary');
        if (primary.validLanding !== values.primaryLanded ||
            secondary.validLanding !== values.secondaryLanded) {
          throw new Error('Mitosis facts conflict with host collider landing verdicts');
        }
      } else if (selection.eventId === 'roulette-table') {
        var wheel = colliderSnapshot(values.wheelColliderRef);
        var rouletteObject = colliderSnapshot(values.objectColliderRef);
        settledEvidence(rouletteObject, 'Roulette object');
        if (!closeEnough(wheel.transform.angle, values.wheelAngle) ||
            !closeEnough(rouletteObject.transform.x, values.landingX)) {
          throw new Error('Roulette facts conflict with host wheel/object transforms');
        }
      } else if (selection.eventId === 'plinko') {
        var plinkoObject = colliderSnapshot(values.objectColliderRef);
        var slot = colliderSnapshot(values.slotSensorRef);
        settledEvidence(plinkoObject, 'Plinko object');
        if (!slot.evidence || slot.evidence.sensorActive !== true ||
            !closeEnough(plinkoObject.transform.x, values.landingX) ||
            !closeEnough(slot.bounds.left, values.slotLeft) ||
            !closeEnough(slot.bounds.right, values.slotRight) ||
            !closeEnough(values.dropDurationMs, probe.elapsedMs)) {
          throw new Error('Plinko facts conflict with host slot, timing, or transform evidence');
        }
      } else if (selection.eventId === 'cap-toss') {
        var body = settledEvidence(colliderSnapshot(values.bodyColliderRef), 'Cap Toss body');
        var top = settledEvidence(colliderSnapshot(values.topColliderRef), 'Cap Toss top');
        if (body.validLanding !== values.bodyLanded || top.validLanding !== values.topLanded) {
          throw new Error('Cap Toss facts conflict with host collider landing verdicts');
        }
      }
    }

    function makeCycle(nextContext) {
      scope = Kernel.createResourceScope(laneId);
      var rng = Kernel.createEventRng(selection.eventSeed);
      context = Object.freeze({ selection: selection, layout: nextContext.layout,
        appearance: nextContext.appearance, physicsProfile: nextContext.physicsProfile,
        scope: scope, rng: rng });
      try {
        behavior = Kernel.validateBehavior(callHost(pack.create,
          [selection.eventId, context], 'EventPackV1.create'));
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
      if (!plain(selectionValue)) throw new TypeError('EventSelectionV2 is required');
      var id = required(selectionValue.eventId, 'eventId', 64);
      if (!own(byId, id)) throw new TypeError('No EventPackV1 owns the selected event');
      pack = byId[id];
      selection = Kernel.normalizeSelection(selectionValue, id, pack.eventClass);
      contextSource = normalizeContext(bindContext);
      makeCycle(contextSource);
      phase = 'bound';
      return snapshot();
    }

    function cleanupCycle(reason, targetBehavior, targetScope) {
      var summary = { behaviorCalled: false, released: 0, errorCount: 0,
        droppedErrors: 0, recentErrors: [] };
      if (targetBehavior && !cleanedBehaviors.has(targetBehavior)) {
        cleanedBehaviors.add(targetBehavior);
        summary.behaviorCalled = true;
        try {
          var output = targetBehavior.cleanup(reason);
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
      retired.cycles += 1;
      retired.released += cycle.released;
      retired.errorCount += cycle.errorCount;
      retired.droppedErrors += cycle.droppedErrors;
      cycle.recentErrors.forEach(function (entry) {
        if (retired.recentErrors.length < Kernel.LIMITS.errors) retired.recentErrors.push(entry);
        else retired.droppedErrors += 1;
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
        var result = Kernel.normalizeTelegraph(behavior.telegraph());
        phase = 'telegraphed';
        return result;
      });
    }

    function qualifyLaunch(signalValue) {
      if (phase !== 'telegraphed') throw new Error('qualifyLaunch requires a telegraphed event');
      if (selectionConsumed) throw new Error('Event selection was already consumed');
      return invoke('qualifyLaunch', function () {
        var signal = Kernel.normalizeLaunchSignal(signalValue);
        var result = Kernel.normalizeQualification(behavior.qualifyLaunch(signal));
        if (result.qualified) {
          selectionConsumed = true;
          launchClaim = Kernel.deepFreeze({ schema: 'EventLaunchClaimV1', laneId: laneId,
            eventId: selection.eventId, eventSeed: selection.eventSeed,
            claimId: laneId + ':' + selection.eventSeed.toString(16).padStart(8, '0') + ':' +
              selection.eventId.slice(0, 40) });
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
          Kernel.normalizeDirective('launch', behavior.launch(draft)));
        phase = 'launched';
        stepSequence = 0;
        lastStepElapsed = -1;
        contacts = Object.create(null);
        contactRecordCount = 0;
        contactBeginCount = 0;
        frameSignatures = Object.create(null);
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
          Kernel.normalizeDirective('step', behavior.step(physicsStep)));
        phase = 'active';
        stepSequence += 1;
        lastStepElapsed = physicsStep.elapsedMs;
        frameSignatures = Object.create(null);
        return result;
      });
    }

    function contact(contactValue) {
      assertFlightPhase('contact');
      if (stepSequence < 1) throw new Error('contact requires preceding physics step evidence');
      var normalized;
      try { normalized = Kernel.normalizeContact(contactValue); }
      catch (thrown) { return invoke('contact', function () { throw thrown; }); }
      if (!scope.ownsResource(normalized.entityARef, ['body', 'sensor']) &&
          !scope.ownsResource(normalized.entityBRef, ['body', 'sensor'])) {
        return invoke('contact', function () {
          throw new Error('Contact does not include a collider owned by this event lane');
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
          Kernel.normalizeDirective('contact', behavior.contact(normalized)));
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
        var evaluation = Kernel.normalizeBehaviorEvaluation(selection.eventId, behavior.evaluate(probe));
        if (!probe.settled) {
          if (evaluation != null) throw new Error('Event behavior cannot resolve an unsettled landing');
          phase = 'active';
          return null;
        }
        if (evaluation == null) { phase = 'active'; return null; }
        if (evaluation.result !== probe.result || evaluation.pose !== probe.pose ||
            evaluation.reason !== probe.reason) {
          throw new Error('Event behavior verdict conflicts with the host landing verdict');
        }
        registerHighValueColliders(evaluation.facts, probe);
        outcome = authority.issueOutcome({ eventId: selection.eventId,
          eventClass: pack.eventClass, laneId: laneId,
          launchClaimId: launchClaim.claimId, result: probe.result,
          pose: probe.pose, reason: probe.reason, facts: evaluation.facts,
          evidence: { steps: stepSequence, contacts: contactBeginCount,
            elapsedMs: probe.elapsedMs } });
        phase = 'evaluated';
        return outcome;
      });
    }

    function exactColliderFrame(frameValue) {
      frameValue.entities.forEach(function (entity) {
        if (!entity.colliderRef) return;
        var collider = colliderSnapshot(entity.colliderRef);
        if (!same(entity.transform, collider.transform) || !same(entity.bounds, collider.bounds)) {
          throw new Error('EventFrame entity diverges from its authoritative collider: ' + entity.entityId);
        }
      });
    }

    function normalizeFrameVariant(reduced) {
      var raw = behavior.frame(reduced);
      if (!plain(raw)) throw new TypeError('EventBehaviorV1.frame must return EventFrameV1 data');
      if (raw.reducedMotion != null && raw.reducedMotion !== reduced) {
        throw new Error('EventFrame reduced-motion flag does not match its request');
      }
      var source = Object.create(null);
      Object.keys(raw).forEach(function (key) { source[key] = raw[key]; });
      source.reducedMotion = reduced;
      source.sequence = raw.sequence == null ? stepSequence : raw.sequence;
      if (source.sequence !== stepSequence) throw new Error('EventFrame sequence is host-owned');
      var normalized = Kernel.normalizeFrame(source, { eventId: selection.eventId,
        eventClass: pack.eventClass, laneId: laneId });
      exactColliderFrame(normalized);
      return normalized;
    }

    function frame(reducedMotion) {
      if (phase !== 'launched' && phase !== 'active' && phase !== 'evaluated') {
        throw new Error('frame requires a launched or evaluated event');
      }
      return invoke('frame', function () {
        var full = normalizeFrameVariant(false);
        var reduced = normalizeFrameVariant(true);
        var fullSignature = Kernel.mechanicsSignature(full);
        var reducedSignature = Kernel.mechanicsSignature(reduced);
        if (fullSignature !== reducedSignature) {
          throw new Error('Reduced motion changed authoritative event mechanics');
        }
        if (frameSignatures.all != null && frameSignatures.all !== fullSignature) {
          throw new Error('Event frame mechanics changed without a host physics step');
        }
        frameSignatures.all = fullSignature;
        return authority.issueFrame(reducedMotion === true ? reduced : full);
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
        deferredResizeCount += 1;
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
          appearance: contextSource.appearance, physicsProfile: contextSource.physicsProfile },
        'event bind context');
        makeCycle(contextSource);
        phase = 'bound';
        if (previousPhase === 'telegraphed') {
          Kernel.normalizeTelegraph(behavior.telegraph());
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
        pendingResize: pendingLayout != null, deferredResizeCount: deferredResizeCount,
        retired: Kernel.immutableData(retired, 'retired cleanup summary'),
        resources: scope ? scope.snapshot() : null, cleanup: cleanupReport });
    }

    return Object.freeze({ schema: 'EventRuntimeV2', laneId: laneId,
      bind: bind, telegraph: telegraph, qualifyLaunch: qualifyLaunch,
      launch: launch, step: step, contact: contact, evaluate: evaluate,
      frame: frame, resize: resize, cleanup: cleanupInternal, snapshot: snapshot });
  }

  return Object.freeze({ schema: 'FlipgameEventRuntimeV2',
    createEventRuntime: createEventRuntime });
});
