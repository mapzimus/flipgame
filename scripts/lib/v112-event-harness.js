// v112-event-harness.js -- deterministic reusable harness for event-pack suites.
(function (root, factory) {
  'use strict';
  var Kernel = root && root.FlipgameV112EventKernel;
  var Runtime = root && root.FlipgameV112EventRuntime;
  var Renderer = root && root.FlipgameV112EventRenderer;
  var RulesAdapter = root && root.FlipgameV112EventRulesAdapter;
  if (typeof module === 'object' && module.exports) {
    Kernel = require('../../js/v112-event-kernel.js');
    Runtime = require('../../js/v112-event-runtime.js');
    Renderer = require('../../js/v112-event-renderer.js');
    RulesAdapter = require('../../js/v112-event-rules-adapter.js');
  }
  var api = factory(Kernel, Runtime, Renderer, RulesAdapter);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV112EventHarness = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (Kernel, Runtime, Renderer, RulesAdapter) {
  'use strict';

  if (!Kernel || !Runtime || !Renderer || !RulesAdapter) {
    throw new Error('The v1.12 event infrastructure must load before its harness');
  }

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
    mitosis: { landedCopies: 1 },
    'double-flip': { rotations: 2.1 },
    'ceiling-flip': { ceilingContact: true },
    'meteor-shower': { debrisContacts: 2 },
    magnet: { magneticImpulse: 11 },
    'heart-rush': { pulseCount: 3 },
    'black-hole': { orbitRadians: 3.4 },
    boomerang: { returnedToOrigin: true, returnDistance: 6 },
    'roulette-table': { sectorIndex: 3 },
    rewind: { replayCount: 1, correctiveImpulseApplied: true },
    plinko: { slotIndex: 4, dropDurationMs: 12000 },
    'mirror-match': { normalizedLaunchX: 0.12, normalizedLaunchY: -0.48,
      spin: 7.5, profileSeed: 123, physicsProfileId: 'standard' },
    'cap-toss': { bodyLanded: true, topLanded: true },
    'life-drain': { magnetAssisted: true },
  });

  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

  function makeSelection(eventId, eventClass, eventSeed, overrides) {
    return Kernel.deepFreeze(Object.assign({ schema: 'EventSelectionV2', eventId: eventId,
      displayName: eventId, eventClass: eventClass, turnSeed: 1,
      eventSeed: eventSeed == null ? 12345 : Number(eventSeed) >>> 0,
      oddsProfile: 'forced-test', forced: true, testData: true, consumed: true,
      telegraph: { glyph: eventId, title: eventId, instruction: 'Harness event.', durationMs: 0 },
    }, clone(overrides || {})));
  }

  function makeContext(overrides) {
    return Object.assign({
      layout: { width: 1280, height: 720, groundY: 620 },
      appearance: { flipperId: 'bottle', variantId: 'classic-blue' },
      physicsProfile: { id: 'standard', mass: 1, colliderRef: 'flipper-main' },
    }, clone(overrides || {}));
  }

  function makeContact(overrides) {
    return Object.assign({ schema: 'ContactV1', contactId: 'contact-1', phase: 'begin',
      entityARef: 'flipper-main', entityBRef: 'table', point: { x: 640, y: 620 },
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
        transform: { x: 640, y: 300, angle: 1.2, scaleX: 1, scaleY: 1 },
        bounds: { left: 610, top: 240, width: 60, height: 120 },
        colliderRef: 'flipper-main', appearanceRef: 'bottle:classic-blue',
        visualStateRef: 'airborne', visible: true, zIndex: 10 }],
      cues: [{ cueId: 'harness-cue' }], reducedMotion: false,
    }, clone(overrides || {}));
  }

  function makePack(options) {
    var source = options || {};
    var eventClass = source.eventClass || 'assist';
    var ids = source.ids || ['rainbow-corkscrew'];
    var trace = source.trace || [];
    return Kernel.definePack({ eventClass: eventClass, ids: ids,
      create: function (eventId, context) {
        trace.push('create:' + context.scope.laneId);
        if (typeof source.onCreate === 'function') source.onCreate(eventId, context, trace);
        var frameSequence = 0;
        function maybeThrow(name) {
          if (source.throwAt === name) throw new Error('harness-' + name);
        }
        return Object.freeze({
          telegraph: function () {
            trace.push('telegraph'); maybeThrow('telegraph');
            return { title: eventId, instruction: 'Harness event.', glyph: 'test', durationMs: 0,
              cues: [] };
          },
          qualifyLaunch: function () {
            trace.push('qualifyLaunch'); maybeThrow('qualifyLaunch');
            return { qualified: source.qualified !== false,
              reason: source.qualified === false ? 'harness-retry' : null };
          },
          launch: function () {
            trace.push('launch'); maybeThrow('launch');
            return { rngSample: context.rng.nextUint32('launch') };
          },
          step: function () {
            trace.push('step'); maybeThrow('step'); frameSequence += 1;
            return { simulated: true };
          },
          contact: function () {
            trace.push('contact'); maybeThrow('contact');
            return { observed: true };
          },
          evaluate: function () {
            trace.push('evaluate'); maybeThrow('evaluate');
            return clone(source.facts || DEFAULT_FACTS[eventId]);
          },
          frame: function (reducedMotion) {
            trace.push('frame:' + reducedMotion); maybeThrow('frame');
            var provided = typeof source.frame === 'function'
              ? source.frame(reducedMotion, context, frameSequence) : null;
            return provided || makeFrame(eventId, eventClass, context.scope.laneId,
              { sequence: frameSequence, reducedMotion: reducedMotion,
                cues: reducedMotion ? [{ cueId: 'static-harness-cue' }] : [{ cueId: 'harness-cue' }] });
          },
          cleanup: function (reason) {
            trace.push('cleanup:' + reason); maybeThrow('cleanup');
            return { cleaned: true };
          },
        });
      } });
  }

  function createHarness(options) {
    var source = options || {};
    var trace = [];
    var disposals = [];
    var reflows = [];
    var pack = source.pack || makePack({ eventClass: source.eventClass,
      ids: source.ids || [source.eventId || 'rainbow-corkscrew'],
      facts: source.facts, frame: source.frame, throwAt: source.throwAt,
      qualified: source.qualified, trace: trace,
      onCreate: function (eventId, context) {
        (source.resourceKinds || []).forEach(function (kind, index) {
          var resource = { laneId: context.scope.laneId, kind: kind, index: index };
          var method = 'own' + kind.charAt(0).toUpperCase() + kind.slice(1);
          context.scope[method](kind + '-' + index, resource, function (value, metadata) {
            disposals.push({ value: value, metadata: metadata });
            if (source.throwDisposerAt === kind) throw new Error('harness-dispose-' + kind);
          });
        });
        if (typeof source.onCreate === 'function') source.onCreate(eventId, context, trace);
      },
    });
    var eventId = source.eventId || pack.ids[0];
    var runtime = Runtime.createEventRuntime({ laneId: source.laneId || 'lane-a',
      packs: [pack], reflow: function (layout, metadata) {
        reflows.push({ layout: layout, metadata: metadata });
        if (source.throwReflow) throw new Error('harness-reflow');
      } });
    runtime.bind(makeSelection(eventId, pack.eventClass, source.eventSeed),
      makeContext(source.context));
    return { runtime: runtime, pack: pack, trace: trace, disposals: disposals,
      reflows: reflows, selection: makeSelection(eventId, pack.eventClass, source.eventSeed) };
  }

  function drive(runtime, options) {
    var source = options || {};
    var result = { telegraph: runtime.telegraph(),
      qualification: runtime.qualifyLaunch(source.signal || { dx: 0.1, dy: -0.5 }) };
    if (!result.qualification.qualified) return result;
    result.launch = runtime.launch(source.draft || { velocity: { x: 2, y: -8 }, spin: 4 });
    result.step = runtime.step(source.step || { dtMs: 16, elapsedMs: 16 });
    if (source.contact !== false) result.contact = runtime.contact(makeContact(source.contact));
    result.frame = runtime.frame(source.reducedMotion === true);
    result.facts = runtime.evaluate(makeProbe(source.probe));
    return result;
  }

  function assertNoLeaks(runtime) {
    var snapshot = runtime.snapshot();
    if (!snapshot.cleanup || snapshot.resources.active !== 0) {
      throw new Error('Event runtime still owns lane resources');
    }
    return true;
  }

  return Object.freeze({ schema: 'FlipgameEventHarnessV1',
    Kernel: Kernel, Runtime: Runtime, Renderer: Renderer, RulesAdapter: RulesAdapter,
    DEFAULT_FACTS: DEFAULT_FACTS, makeSelection: makeSelection, makeContext: makeContext,
    makeContact: makeContact, makeProbe: makeProbe, makeFrame: makeFrame,
    makePack: makePack, createHarness: createHarness, drive: drive,
    assertNoLeaks: assertNoLeaks });
});
