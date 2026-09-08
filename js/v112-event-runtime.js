// v112-event-runtime.js -- lane-local lifecycle host for EventPackV1.
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

  if (!Kernel || typeof Kernel.definePack !== 'function') {
    throw new Error('FlipgameV112EventKernel must load before v112-event-runtime.js');
  }

  function object(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }
  function required(value, label, maximum) {
    var text = String(value == null ? '' : value).trim();
    if (!text) throw new TypeError(label + ' is required');
    if (maximum != null && text.length > maximum) throw new RangeError(label + ' is too long');
    return text;
  }
  function errorFact(error, phase) {
    return { phase: phase, name: String(error && error.name || 'Error'),
      message: String(error && error.message || error) };
  }

  function buildRegistry(packs) {
    if (!Array.isArray(packs) || !packs.length) throw new TypeError('At least one EventPackV1 is required');
    var byId = Object.create(null);
    packs.forEach(function (packValue) {
      var pack = Kernel.validatePack(packValue);
      pack.ids.forEach(function (id) {
        if (byId[id]) throw new Error('Duplicate event pack owner for ' + id);
        byId[id] = pack;
      });
    });
    return byId;
  }

  function createEventRuntime(options) {
    var source = object(options);
    var laneId = required(source.laneId, 'laneId', 96);
    var byId = buildRegistry(source.packs);
    var hostReflow = source.reflow == null ? null : source.reflow;
    if (hostReflow != null && typeof hostReflow !== 'function') {
      throw new TypeError('Event runtime reflow must be a function');
    }

    var phase = 'idle';
    var pack = null;
    var selection = null;
    var contextSource = null;
    var context = null;
    var behavior = null;
    var scope = null;
    var facts = null;
    var cleanupReport = null;
    var cleanupInProgress = false;
    var pendingLayout = null;
    var deferredResizeCount = 0;
    var stepSequence = 0;
    var frameSignatures = Object.create(null);
    var retiredReports = [];
    var cleanedBehaviors = [];

    function normalizeContext(value) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError('Event bind context is required');
      }
      var entry = object(value);
      Object.keys(entry).forEach(function (key) {
        if (['layout', 'appearance', 'physicsProfile'].indexOf(key) < 0) {
          throw new TypeError('Event bind context has unsupported field: ' + key);
        }
      });
      ['layout', 'appearance', 'physicsProfile'].forEach(function (key) {
        if (!Object.prototype.hasOwnProperty.call(entry, key) || !entry[key] ||
            typeof entry[key] !== 'object' || Array.isArray(entry[key])) {
          throw new TypeError('Event bind context requires ' + key);
        }
      });
      return Kernel.immutableData({
        layout: object(entry.layout), appearance: object(entry.appearance),
        physicsProfile: object(entry.physicsProfile),
      }, 'event bind context');
    }

    function makeCycle(nextContext) {
      scope = Kernel.createResourceScope(laneId);
      var rng = Kernel.createEventRng(selection.eventSeed);
      context = Object.freeze({ selection: selection, layout: nextContext.layout,
        appearance: nextContext.appearance, physicsProfile: nextContext.physicsProfile,
        scope: scope, rng: rng });
      var raw;
      try {
        raw = pack.create(selection.eventId, context);
        behavior = Kernel.validateBehavior(raw);
      } catch (error) {
        var failedScope = scope.cleanup('pack-create-error');
        phase = 'cleaned';
        cleanupReport = Kernel.deepFreeze({ schema: 'EventRuntimeCleanupV1', laneId: laneId,
          eventId: selection.eventId, reason: 'pack-create-error', behaviorCalled: false,
          resources: failedScope, deferredReflowApplied: false, errors: [errorFact(error, 'create')] });
        if (Object.isExtensible(error)) error.eventCleanupReport = cleanupReport;
        throw error;
      }
    }

    function bind(selectionValue, bindContext) {
      if (phase !== 'idle') throw new Error('Event runtime can bind only once');
      if (!selectionValue || !byId[selectionValue.eventId]) {
        throw new TypeError('No EventPackV1 owns the selected event');
      }
      pack = byId[selectionValue.eventId];
      selection = Kernel.normalizeSelection(selectionValue, selectionValue.eventId, pack.eventClass);
      contextSource = normalizeContext(bindContext);
      makeCycle(contextSource);
      phase = 'bound';
      return snapshot();
    }

    function cleanupCycle(reason, targetBehavior, targetScope) {
      var errors = [];
      var behaviorCalled = false;
      if (targetBehavior && cleanedBehaviors.indexOf(targetBehavior) < 0) {
        cleanedBehaviors.push(targetBehavior);
        behaviorCalled = true;
        try {
          var output = targetBehavior.cleanup(reason);
          if (output != null) {
            Kernel.assertNoRuleEffects(output, 'cleanup output');
            Kernel.immutableData(output, 'cleanup output');
          }
        } catch (error) { errors.push(errorFact(error, 'behavior.cleanup')); }
      }
      var resources = targetScope ? targetScope.cleanup(reason)
        : Kernel.deepFreeze({ schema: 'EventResourceCleanupV1', laneId: laneId,
          reason: reason, released: [], errors: [], clean: true });
      resources.errors.forEach(function (entry) {
        errors.push({ phase: 'resource.dispose', name: entry.name,
          message: entry.kind + ':' + entry.resourceId + ': ' + entry.message });
      });
      return Kernel.deepFreeze({ behaviorCalled: behaviorCalled, resources: resources, errors: errors });
    }

    function cleanupInternal(reasonValue) {
      if (cleanupReport) return cleanupReport;
      if (cleanupInProgress) {
        return Kernel.deepFreeze({ schema: 'EventRuntimeCleanupV1', laneId: laneId,
          eventId: selection ? selection.eventId : null,
          reason: String(reasonValue == null ? 'cleanup' : reasonValue),
          inProgress: true, clean: false, errors: [] });
      }
      cleanupInProgress = true;
      var reason = String(reasonValue == null ? 'cleanup' : reasonValue);
      // Mark first so re-entrant cleanup from a handler/disposer is harmless.
      phase = 'cleaned';
      var cycle = cleanupCycle(reason, behavior, scope);
      var errors = cycle.errors.slice();
      retiredReports.forEach(function (report) {
        report.errors.forEach(function (entry) {
          errors.push({ phase: 'retired.' + entry.phase, name: entry.name,
            message: entry.message });
        });
      });
      var reflowApplied = false;
      if (pendingLayout) {
        var layout = pendingLayout;
        pendingLayout = null;
        // Set before invoking the host so even a throwing host cannot reflow a
        // second time when cleanup is retried.
        reflowApplied = !!hostReflow;
        if (hostReflow) {
          try {
            hostReflow(layout, Object.freeze({ schema: 'EventResizeV1', laneId: laneId,
              deferred: true, coalescedRequests: deferredResizeCount, reason: reason }));
          } catch (error) { errors.push(errorFact(error, 'host.reflow')); }
        }
      }
      cleanupReport = Kernel.deepFreeze({ schema: 'EventRuntimeCleanupV1', laneId: laneId,
        eventId: selection ? selection.eventId : null, reason: reason,
        behaviorCalled: cycle.behaviorCalled, resources: cycle.resources,
        deferredReflowApplied: reflowApplied, deferredResizeCount: deferredResizeCount,
        retiredCycles: retiredReports.slice(), errors: errors, clean: errors.length === 0 });
      cleanupInProgress = false;
      return cleanupReport;
    }

    function invoke(handlerName, action) {
      try { return action(); }
      catch (error) {
        var report = cleanupInternal('handler-error:' + handlerName);
        if (Object.isExtensible(error)) error.eventCleanupReport = report;
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

    function qualifyLaunch(signal) {
      if (phase !== 'telegraphed') throw new Error('qualifyLaunch requires a telegraphed event');
      return invoke('qualifyLaunch', function () {
        var frozenSignal = Kernel.immutableData(object(signal), 'launch signal');
        Kernel.assertNoRuleEffects(frozenSignal, 'launch signal');
        var result = Kernel.normalizeQualification(behavior.qualifyLaunch(frozenSignal));
        if (result.qualified) phase = 'qualified';
        return result;
      });
    }

    function launch(draft) {
      if (phase !== 'qualified') throw new Error('launch requires a qualified gesture');
      return invoke('launch', function () {
        var frozenDraft = Kernel.immutableData(object(draft), 'launch draft');
        Kernel.assertNoRuleEffects(frozenDraft, 'launch draft');
        var result = Kernel.normalizeDirective('launch', behavior.launch(frozenDraft));
        phase = 'launched';
        stepSequence = 0;
        frameSignatures = Object.create(null);
        return result;
      });
    }

    function assertFlightPhase(name) {
      if (phase !== 'launched' && phase !== 'active') {
        throw new Error(name + ' requires an active launch');
      }
    }

    function step(frameValue) {
      assertFlightPhase('step');
      return invoke('step', function () {
        var frozenFrame = Kernel.immutableData(object(frameValue), 'physics step');
        Kernel.assertNoRuleEffects(frozenFrame, 'physics step');
        var result = Kernel.normalizeDirective('step', behavior.step(frozenFrame));
        phase = 'active';
        stepSequence += 1;
        frameSignatures = Object.create(null);
        return result;
      });
    }

    function contact(contactValue) {
      assertFlightPhase('contact');
      return invoke('contact', function () {
        var normalized = Kernel.normalizeContact(contactValue);
        return Kernel.normalizeDirective('contact', behavior.contact(normalized));
      });
    }

    function evaluate(probeValue) {
      assertFlightPhase('evaluate');
      return invoke('evaluate', function () {
        var probe = Kernel.normalizeLandingProbe(probeValue);
        facts = Kernel.normalizeOutcomeFacts(selection.eventId, behavior.evaluate(probe));
        phase = 'evaluated';
        return facts;
      });
    }

    function frame(reducedMotion) {
      if (phase !== 'launched' && phase !== 'active' && phase !== 'evaluated') {
        throw new Error('frame requires a launched or evaluated event');
      }
      return invoke('frame', function () {
        var reduced = reducedMotion === true;
        var raw = behavior.frame(reduced);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
          throw new TypeError('EventBehaviorV1.frame must return EventFrameV1 data');
        }
        if (raw.reducedMotion != null && raw.reducedMotion !== reduced) {
          throw new Error('EventFrame reduced-motion flag does not match its request');
        }
        var input = Object.assign({}, raw, { reducedMotion: reduced,
          sequence: raw.sequence == null ? stepSequence : raw.sequence });
        if (input.sequence !== stepSequence) throw new Error('EventFrame sequence is host-owned');
        var normalized = Kernel.normalizeFrame(input, { eventId: selection.eventId,
          eventClass: pack.eventClass, laneId: laneId });
        var signature = Kernel.mechanicsSignature(normalized);
        var key = reduced ? 'reduced' : 'full';
        var counterpart = reduced ? frameSignatures.full : frameSignatures.reduced;
        if (frameSignatures[key] != null && frameSignatures[key] !== signature) {
          throw new Error('Event frame mechanics changed without a host physics step');
        }
        if (counterpart != null && counterpart !== signature) {
          throw new Error('Reduced motion changed authoritative event mechanics');
        }
        frameSignatures[key] = signature;
        return normalized;
      });
    }

    function callHostReflow(layout, metadata) {
      if (!hostReflow) return;
      hostReflow(layout, metadata);
    }

    function resize(layoutValue) {
      if (phase === 'cleaned') throw new Error('Cannot resize a cleaned event runtime');
      var layout = Kernel.immutableData(object(layoutValue), 'event layout');
      if (phase === 'idle') {
        return invoke('resize', function () {
          callHostReflow(layout, Object.freeze({ schema: 'EventResizeV1', laneId: laneId,
            deferred: false, coalescedRequests: 1, reason: 'idle-resize' }));
          return Object.freeze({ schema: 'EventResizeDecisionV1', deferred: false, rebound: false });
        });
      }
      if (phase === 'qualified' || phase === 'launched' || phase === 'active' || phase === 'evaluated') {
        pendingLayout = layout;
        deferredResizeCount += 1;
        return Object.freeze({ schema: 'EventResizeDecisionV1', deferred: true,
          rebound: false, coalescedRequests: deferredResizeCount });
      }
      // Before qualification, geometry may safely rebind. Retire the entire old
      // cycle so a pack cannot leave a body, callback, or camera from old bounds.
      return invoke('resize', function () {
        var previousPhase = phase;
        var retired = cleanupCycle('prelaunch-resize', behavior, scope);
        retiredReports.push(retired);
        if (retired.errors.length) throw new Error('Prelaunch event rebind cleanup failed');
        callHostReflow(layout, Object.freeze({ schema: 'EventResizeV1', laneId: laneId,
          deferred: false, coalescedRequests: 1, reason: 'prelaunch-resize' }));
        contextSource = Kernel.deepFreeze({ layout: layout,
          appearance: contextSource.appearance, physicsProfile: contextSource.physicsProfile });
        makeCycle(contextSource);
        phase = 'bound';
        if (previousPhase === 'telegraphed') {
          Kernel.normalizeTelegraph(behavior.telegraph());
          phase = 'telegraphed';
        }
        return Object.freeze({ schema: 'EventResizeDecisionV1', deferred: false, rebound: true });
      });
    }

    function snapshot() {
      return Kernel.deepFreeze({ schema: 'EventRuntimeSnapshotV1', laneId: laneId,
        phase: phase, eventId: selection ? selection.eventId : null,
        eventClass: pack ? pack.eventClass : null, selection: selection,
        outcomeFacts: facts, pendingResize: pendingLayout != null,
        deferredResizeCount: deferredResizeCount,
        resources: scope ? scope.snapshot() : null,
        cleanup: cleanupReport });
    }

    return Object.freeze({ schema: 'EventRuntimeV1', laneId: laneId,
      bind: bind, telegraph: telegraph, qualifyLaunch: qualifyLaunch,
      launch: launch, step: step, contact: contact, evaluate: evaluate,
      frame: frame, resize: resize, cleanup: cleanupInternal, snapshot: snapshot });
  }

  return Object.freeze({ schema: 'FlipgameEventRuntimeV1',
    createEventRuntime: createEventRuntime });
});
