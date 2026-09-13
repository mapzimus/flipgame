// Battle host: the FlipgameV112BattleHostV1 the Battle route asks for.
//
// It composes two authorities and adds none of its own. The private application
// reserves the match and decides what a completed series is worth. The lane
// runtime plays that series, because only the page owns pointers, lanes and
// physics. This module carries the reservation between them, drives the frame
// clock the runtime needs, and projects lanes for the screen.
//
// It never scores a pose, names a winner or writes progression.
//
// createBattleHost({
//   application,          // window.FlipgameV112
//   laneAdapterFactory,   // BattleLaneAdapterContractV1 factory: the real flip
//   laneCapacity,         // lanes that factory can genuinely run at once
//   measureDisplay,       // () -> {width, observedContacts}
//   laneRects,            // (stage, count) -> lane rectangles in client pixels
//   requestFrame/cancelFrame/now,
// })
(function (root, factory) {
  'use strict';
  var Runtime = root && root.FlipgameV112BattleRuntime;
  if (typeof module === 'object' && module.exports) Runtime = require('./v112-battle-runtime.js');
  var api = factory(Runtime);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.defineProperty(root, 'FlipgameV112BattleHost', { value: api, enumerable: true });
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Runtime) {
  'use strict';
  if (!Runtime || typeof Runtime.createBattleRuntime !== 'function') {
    throw new Error('FlipgameV112BattleRuntime must load before v112-battle-host.js');
  }
  var LANE_STATUS = {
    ready: 'Flick to launch', aiming: 'Aiming', armed: 'Launching',
    airborne: 'In flight', contact: 'Landing', settling: 'Settling',
    resolved: 'Scored', disabled: 'Waiting',
  };
  function copy(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

  function defaultLaneRects(stage, count) {
    var box = stage.getBoundingClientRect();
    var width = box.width / count;
    var rects = [];
    for (var index = 0; index < count; index += 1) {
      rects.push({ laneId: 'lane-' + (index + 1), left: box.left + index * width,
        top: box.top, width: width, height: box.height });
    }
    return rects;
  }

  function createBattleHost(options) {
    var opts = options || {};
    var application = opts.application;
    if (!application || !application.battle) throw new TypeError('The private application is required');
    if (typeof opts.laneAdapterFactory !== 'function') throw new TypeError('A lane adapter factory is required');
    var laneRectsFor = opts.laneRects || defaultLaneRects;
    var buildRuntime = opts.createRuntime || Runtime.createBattleRuntime;
    // A contact is only worth a lane if the injected adapter can actually run
    // that lane. One physics surface means one lane, whatever the glass reports.
    var laneCapacity = Math.max(1, Math.floor(opts.laneCapacity || 1));
    var now = opts.now || function () { return Date.now(); };
    var requestFrame = opts.requestFrame || function (fn) { return setTimeout(fn, 16); };
    var cancelFrame = opts.cancelFrame || function (id) { clearTimeout(id); };
    var listeners = new Set();
    var reservation = null;   // { handle, config }
    var runtime = null;
    var detachPointers = null;
    var frameId = null;
    var lastFrameAt = 0;
    var series = null;        // last BattleStateV1 this host saw
    var message = '';
    var submission = null;
    var unsubscribeApplication = application.subscribe
      ? application.subscribe(function () { wake(); }) : null;

    // The frame clock runs every frame; the screen must not. Waking only on a
    // changed view keeps the HUD off the animation path.
    var lastSignature = null;
    function wake() {
      var view = snapshot();
      var signature = view == null ? 'closed' : JSON.stringify([view.status, view.message,
        view.lanes, view.state.phase, view.state.heatNumber, view.state.volleyIndex,
        view.state.scores, view.state.heatWins, view.state.charges, view.state.powerOffers,
        view.state.storedPowers, view.state.suddenDeath, view.state.elapsedMs,
        view.state.winnerId]);
      if (signature === lastSignature) return;
      lastSignature = signature;
      listeners.forEach(function (listener) { try { listener(); } catch (_) {} });
    }

    function capabilities() {
      var measured = (opts.measureDisplay || function () { return { width: 0, observedContacts: 1 }; })();
      var observed = Math.max(1, Math.floor(Number(measured.observedContacts) || 1));
      return application.battle.observeDisplay({ width: measured.width,
        observedContacts: Math.min(observed, laneCapacity) });
    }

    function prepare(input) {
      var source = input || {};
      var ticket = application.battle.prepare({ battleFormatId: source.formatId,
        paceId: source.paceId, powerProfileId: source.powerProfileId,
        players: source.players });
      reservation = { handle: ticket.handle, config: copy(ticket.config) };
      series = null; message = ''; submission = null;
      return { handle: ticket.handle };
    }

    function cancel(handle) {
      stopRuntime();
      application.battle.cancel(handle);
      reservation = null; series = null; wake();
      return null;
    }

    function start(handle, context) {
      if (!reservation || reservation.handle !== handle) throw new Error('That Battle reservation is not current');
      var stage = (context || {}).stage;
      if (!stage) throw new Error('Battle needs its stage before a heat can open');
      var config = reservation.config;
      var rects = laneRectsFor(stage, config.hardware.activeLaneLimit);
      runtime = buildRuntime({ matchId: config.matchId, config: config, laneRects: rects,
        laneAdapterFactory: opts.laneAdapterFactory, captureTarget: stage,
        onError: function (error) { message = error && error.message ? error.message : String(error); },
      });
      application.battle.start(handle);
      // From here the reservation is live, so a failure has to release it rather
      // than leave a match nobody can finish or leave.
      try {
        detachPointers = runtime.attach(stage);
        runtime.startHeat();
        series = copy(runtime.snapshot().battle);
      } catch (error) {
        stopRuntime();
        application.battle.abandon('start-failed');
        reservation = null; series = null; wake();
        throw error;
      }
      lastFrameAt = now();
      frameId = requestFrame(frame);
      wake();
      return snapshot();
    }

    function frame() {
      frameId = null;
      if (!runtime) return;
      var at = now();
      var delta = Math.max(0, at - lastFrameAt);
      lastFrameAt = at;
      try { runtime.tick(delta); } catch (error) { message = error.message; }
      settle();
      if (runtime) frameId = requestFrame(frame);
    }

    // Between heats the next heat has to be opened, a stored card has to be
    // deployed before its owner's next launch, and a completed series has to be
    // handed to the composition exactly once.
    function settle() {
      var state = runtime.snapshot().battle;
      if (state.phase === 'between-heats') { runtime.startHeat(); state = runtime.snapshot().battle; }
      deployStoredPowers(state);
      series = copy(runtime.snapshot().battle);
      if (series.phase === 'complete' && !submission) submit();
      wake();
    }

    function deployStoredPowers(state) {
      Object.keys(state.storedPowers).forEach(function (competitorId) {
        if (!state.storedPowers[competitorId]) return;
        var owner = state.config.players.find(function (player) {
          return competitorKey(player) === competitorId;
        });
        if (!owner) return;
        // A deployment that is merely early keeps its card: the runtime refuses
        // it until the recipient is between launches, and this retries then.
        try { runtime.deployPower(owner.id); } catch (_) {}
      });
    }

    function competitorKey(player) {
      var formatId = reservation ? reservation.config.formatId : null;
      return formatId === 'doubles' || formatId === 'team' ? player.teamId : player.id;
    }

    function submit() {
      var handle = reservation.handle;
      submission = Promise.resolve()
        .then(function () { return application.battle.submitResult(handle, series); })
        .then(function () { stopRuntime(); wake(); })
        .catch(function (error) {
          message = error && error.message ? error.message : String(error);
          stopRuntime(); wake();
        });
      return submission;
    }

    function stopRuntime() {
      if (frameId != null) { cancelFrame(frameId); frameId = null; }
      if (detachPointers) { try { detachPointers(); } catch (_) {} detachPointers = null; }
      if (runtime) { try { runtime.destroy(); } catch (_) {} runtime = null; }
    }

    function choosePower(input) {
      if (!runtime) throw new Error('No Battle is running');
      var source = input || {};
      var state = runtime.snapshot().battle;
      var player = state.config.players.find(function (entry) { return entry.id === source.playerId; });
      if (!player) throw new Error('That player is not in this Battle');
      var offer = state.powerOffers[competitorKey(player)] || [];
      var index = -1;
      for (var position = 0; position < offer.length; position += 1) {
        if (offer[position].id === source.cardId) index = position;
      }
      if (index < 0) throw new Error('That card is not on offer');
      runtime.choosePower({ playerId: source.playerId, index: index, targetId: source.targetId });
      settle();
      return snapshot();
    }

    // Only lanes the rules currently expect a launch from are shown, so the
    // screen can never invite a flick the runtime would refuse.
    function lanes() {
      if (!runtime || !series || series.phase === 'complete') return [];
      var active = series.activePlayerIds || [];
      return runtime.snapshot().lanes.filter(function (lane) {
        return lane.playerId && active.indexOf(lane.playerId) >= 0;
      }).slice(0, series.config.hardware.activeLaneLimit).map(function (lane) {
        return { laneId: lane.laneId, playerId: lane.playerId,
          status: LANE_STATUS[lane.state] || 'Waiting' };
      });
    }

    function status() {
      var view = application.battle.snapshot();
      if (!view) return 'settled';
      if (view.status === 'finalizing') return 'finalizing';
      if (view.status === 'finalization-failed') return 'retryable';
      if (view.status === 'completed') return 'settled';
      // The last heat is in: the series is on its way to the reward authority,
      // and the screen must stop inviting flicks before that lands.
      if (series && series.phase === 'complete') return 'finalizing';
      return 'playing';
    }

    function snapshot() {
      if (!series) return null;
      return { status: status(), state: series, lanes: lanes(), message: message };
    }

    function abandon() {
      stopRuntime();
      var left = Promise.resolve(application.battle.abandon('left-battle'));
      reservation = null;
      wake();
      return left;
    }

    return Object.freeze({
      schema: 'FlipgameV112BattleHostV1',
      capabilities: capabilities,
      prepare: prepare,
      start: start,
      cancel: cancel,
      snapshot: snapshot,
      subscribe: function (listener) {
        listeners.add(listener);
        return function () { listeners.delete(listener); };
      },
      choosePower: choosePower,
      abandon: abandon,
      retryFinalization: function () {
        return Promise.resolve(application.battle.retryFinalization()).then(function (result) {
          wake(); return result;
        }, function (error) { message = error.message; wake(); throw error; });
      },
      close: function () {
        stopRuntime();
        if (unsubscribeApplication) { unsubscribeApplication(); unsubscribeApplication = null; }
        listeners.clear();
      },
    });
  }

  return Object.freeze({ schema: 'FlipgameBattleHostFactoryV1', createBattleHost: createBattleHost });
});
