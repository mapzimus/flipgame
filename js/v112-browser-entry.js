// Included inside the generated lexical bundle. No authority constructor or
// reward mutation method is installed on the browser global.
//
// Host integration:
// 1. Load v112-browser-bundle.js once, await FlipgameV112.ready, subscribe to
//    snapshot changes and reveal/profile updates.
// 2. attachPhysics({ snapshot, subscribe }) once. subscribe wakes its listener
//    after each fixed engine step and returns unsubscribe. snapshot returns:
//    { launchId, atMs, qualified, manual, grounded, eventId, landing }.
//    launchId is unique per qualified shot. atMs is simulation milliseconds;
//    fractional fixed steps are supported. landing stays null until the engine
//    resolves, then is { result:'MAKE'|'MISS', pose:'upright'|'cap'|'miss',
//    reason, stableForMs, deadlineEvidence?, airborneTerminalEvidence? }.
//    Airborne terminal evidence represents the engine's existing absolute
//    flight timeout before any contact and can only produce a MISS.
//    The optional deadline evidence
//    is captured by the engine at its absolute on-plane pose check; the bridge
//    never reconstructs it from a later body snapshot. Event frames require a
//    separate event bridge.
// 3. beginSession({activityId:'free-play'|'practice', formatId:'classic',
//    physicsModeId:'normal', roster:[{name,human,objectId,variantId}],
//    startingLives,seed,suddenDeathEnabled}). The facade owns immutable IDs.
// 4. Observe session.rules/lastLanding/resolution. Do not also invoke the legacy
//    scoring/progression path for this session. retryFinalization retries only
//    a completed Rules match after a storage failure. abandonSession preserves
//    earned content and consumes the reservation without match rewards.
//
// This bounded bridge does not yet support events, Cup/Team/Battle, or starting
// Story gameplay. Story views and prescribed request
// creation are composed; their match runner still needs its engine adapter.
function createBrowserApplication(require, platform, sourceIdentity) {
  'use strict';
  var Rules = require('./v112-rules.js');
  var Landing = require('./v112-landing-verdict.js');
  var Activity = require('./v112-activity.js');
  var Economy = require('./v112-economy.js');
  var Names = require('./v111-name-policy.js');
  var Runtime = require('./v112-progression-runtime.js');
  var Story = require('./v112-story-runtime.js');
  var Achievements = require('./v112-achievements.js');
  var diagnostics = require('./v112-data.js').createDataPipeline();
  var rewardAuthority;
  var handle = Runtime.connectBrowserRuntime(function (authority) { rewardAuthority = authority; });
  var progression = handle.runtime;
  var listeners = new Set();
  var session = null;
  var serial = 0;
  var physicsDriver = null;
  var detachPhysics = null;
  var storyRuntime = null;
  var closed = false;
  var warning = null;

  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }
  function copy(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function finite(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(label + ' must be finite');
    return value;
  }
  function snapshot() {
    return freeze({ schema: 'FlipgameBrowserSnapshotV1', sourceIdentity: sourceIdentity,
      ready: !closed, writer: progression.writerStatus(), warning: warning,
      profile: progression.snapshot(), pendingReveals: progression.pendingReveals(),
      session: session ? { matchId: session.request.matchId, request: session.request,
        status: session.status, rules: session.practice ? null : session.rules.snapshot(),
        practice: session.practice ? copy(session.practiceScore) : null,
        flipPhase: session.flip ? session.flip.phase : 'ready',
        lastLanding: session.lastLanding, lastRulesOutcome: session.lastRulesOutcome,
        resolution: session.resolution } : null });
  }
  function emit(type) {
    var state = snapshot();
    listeners.forEach(function (listener) { try { listener(state, freeze({ type: type })); } catch (_) {} });
  }
  progression.subscribe(function () { emit('progression'); }, { emitCurrent: false });
  function assertOpen() { if (closed) throw new Error('Browser application is closed'); }
  function assertIdle() {
    assertOpen();
    if (session && ['active', 'finalizing', 'finalization-failed'].indexOf(session.status) >= 0) {
      throw new Error('Finish or leave the current session first');
    }
  }
  function id() {
    var random = platform.crypto && typeof platform.crypto.randomUUID === 'function'
      ? platform.crypto.randomUUID() : Date.now().toString(36) + '-' + (++serial).toString(36);
    return 'local-' + random;
  }
  function names(roster) {
    if (!Array.isArray(roster) || !roster.length || roster.length > 16) throw new RangeError('Choose 1–16 players');
    return roster.map(function (player, index) {
      var name = Names.validate(player.name || 'Player ' + (index + 1));
      if (!name.ok) throw new Error('Please choose another name');
      var objectId = player.objectId || 'bottle';
      if (!progression.isObjectAvailable(objectId)) throw new Error('Choose an available Flipper');
      var gallery = progression.viewObject(objectId).variants;
      var selection = player.variantId == null ? 0 : player.variantId;
      var variant = typeof selection === 'number' ? gallery[selection]
        : gallery.find(function (item) { return item.id === selection || item.variantId === selection; });
      if (!variant) throw new Error('Choose an available variant');
      var cosmeticId = player.cosmeticId || null;
      if (cosmeticId && !progression.isCosmeticAvailable(cosmeticId)) throw new Error('Choose an available cosmetic');
      return { id: 'seat-' + (index + 1), name: name.value, human: player.human !== false,
        isAI: player.human === false, objectId: objectId, variantId: variant.id, cosmeticId: cosmeticId };
    });
  }
  function makeRules(request, practice) {
    var roster = request.roster;
    if (practice) roster = [request.roster[0], { id: 'practice-marker', human: false, name: 'Practice' }];
    var rules = Rules.createRulesAdapter(Object.assign({}, request.rulesOptions, {
      matchId: request.matchId, formatId: request.formatId,
      physicsModeId: request.physicsModeId, players: roster, seed: request.seed,
    }));
    var authority = Landing.createAuthority({ matchId: request.matchId,
      rulesConnector: rules.claimLandingConnector(), laneIds: ['main'] });
    return { rules: rules, physics: authority.claimPhysicsLane('main'),
      consumer: authority.claimRulesLane('main') };
  }
  var registry = Activity.createActivityRegistry([
    { id: 'free-play' }, { id: 'practice' },
  ]);
  var coordinator = Activity.createMatchSessionCoordinator({
    registry: registry, rewardAuthority: rewardAuthority,
    transaction: function (command, rewards) {
      if (!session || command.matchId !== session.request.matchId) throw new Error('Finalization session mismatch');
      var claim = rewards.rewardsEligible ? rewards.consumeMatch(rewardInput(session, command.outcome)) : null;
      return { duplicate: !!(claim && claim.duplicate),
        presentation: { title: 'Match complete', rewards: claim ? {
          fxpAwarded: claim.fxpAwarded, fcAwarded: claim.fcAwarded,
          baseFcAwarded: claim.baseFcAwarded, levelsCrossed: claim.levelsCrossed,
          reward: copy(claim.reward), granted: copy(claim.granted) } : null,
          noRewardsReason: rewards.noRewardsReason || null } };
    },
  });
  function rewardInput(current, outcome) {
    var humans = current.request.roster.filter(function (player) { return player.human; });
    var humanIds = new Set(humans.map(function (player) { return player.id; }));
    var shots = current.ordinaryShots;
    var made = shots.filter(function (shot) { return shot.made; }).length;
    var performance = Economy.performanceMultiplier({ eligibleShots: shots.length,
      makeRate: shots.length ? made / shots.length : 0.5, feel: 'standard', laneCount: 1 });
    return { completed: true, resolved: true, activityId: current.request.activityId,
      qualifiedManualHumanFlips: current.manualHumanFlips, humanPlayers: humans.length,
      formatId: current.request.formatId, startingLives: current.request.rulesOptions.startingLives,
      performanceMultiplier: performance.multiplier,
      humanWon: outcome.winnerIds.some(function (winner) { return humanIds.has(winner); }) };
  }
  function installSession(request, owner) {
    var runtime = makeRules(request, request.activityId === 'practice');
    session = Object.assign(runtime, { request: request, owner: owner,
      status: 'active', practice: request.activityId === 'practice',
      practiceScore: { flips: 0, makes: 0, misses: 0, caps: 0 },
      flip: null, seenLaunchIds: new Set(), ordinaryShots: [], manualHumanFlips: 0,
      resolution: null, lastLanding: null, lastRulesOutcome: null, finalPromise: null,
      startedAt: Date.now(), totalFlips: 0, testData: progression.snapshot().ownerTestMode === true });
    warning = null;
    emit('session-started');
    return snapshot();
  }
  function beginSession(input) {
    assertIdle();
    var source = input || {};
    var activityId = source.activityId || 'free-play';
    if (activityId !== 'free-play' && activityId !== 'practice') throw new Error('Use the Story request flow for this activity');
    if ((source.formatId || 'classic') !== 'classic' || (source.physicsModeId || 'normal') !== 'normal') {
      throw new Error('This browser bridge currently supports Classic and ordinary Practice');
    }
    if (activityId === 'free-play' && !progression.writerStatus().writable) throw new Error('Waiting for this tab’s profile writer');
    var roster = names(source.roster || [{ name: 'Player 1' }, { name: 'Player 2' }]);
    if (activityId === 'free-play' && roster.length < 2) throw new Error('Classic needs at least two players');
    if (activityId === 'practice' && roster.length !== 1) throw new Error('Practice needs one player');
    var startingLives = source.startingLives == null ? 10 : source.startingLives;
    if (!Number.isSafeInteger(startingLives) || startingLives < 1 || startingLives > 100) throw new RangeError('Choose 1–100 starting lives');
    var arenaId = source.arenaId || 'baseline-table';
    if (!progression.isArenaAvailable(arenaId)) throw new Error('Choose an available arena');
    var activityContext = { arenaId: arenaId, testData: activityId === 'practice' };
    if (source.viewport && Number.isFinite(source.viewport.width) && Number.isFinite(source.viewport.height)) {
      activityContext.viewport = { width: Math.max(1, Math.min(16384, Math.round(source.viewport.width))),
        height: Math.max(1, Math.min(16384, Math.round(source.viewport.height))) };
    }
    var request = Activity.MatchRequestV2({ matchId: id(), activityId: activityId,
      formatId: 'classic', physicsModeId: 'normal', roster: roster,
      seed: source.seed == null ? 1 : source.seed,
      rulesOptions: { startingLives: startingLives, suddenDeathEnabled: source.suddenDeathEnabled !== false },
      activityContext: activityContext });
    // Validate Rules before opening a durable reward reservation.
    makeRules(request, activityId === 'practice');
    coordinator.start(request);
    return installSession(request, coordinator);
  }
  function finish() {
    if (!session || session.practice) return Promise.reject(new Error('No terminal match to finish'));
    var current = session;
    if (current.status === 'completed') return Promise.resolve(current.resolution);
    if (current.finalPromise) return current.finalPromise;
    if (current.rules.snapshot().phase !== 'complete') return Promise.reject(new Error('The match is still active'));
    current.status = 'finalizing';
    var telemetry = rewardInput(current, current.rules.toMatchOutcome());
    var outcome = current.rules.toMatchOutcome({ telemetry: telemetry });
    current.finalPromise = current.owner.finalize(outcome).then(function (result) {
      current.resolution = result; current.status = 'completed'; current.finalPromise = null;
      diagnostics.recordMatch({ request: current.request, outcome: outcome, startedAt: current.startedAt,
        players: current.rules.snapshot().players, totalFlips: current.totalFlips, testData: current.testData });
      emit('match-completed'); return result;
    }).catch(function (error) {
      current.finalPromise = null; current.status = 'finalization-failed';
      warning = 'Match saved pending reward retry: ' + error.message;
      emit('finalization-failed'); throw error;
    });
    return current.finalPromise;
  }
  function abandon() {
    assertOpen();
    if (!session || session.status === 'abandoned') return snapshot();
    if (session.status === 'finalizing' || session.status === 'finalization-failed') throw new Error('Retry the completed match’s rewards first');
    if (session.status === 'completed') return snapshot();
    if (session.flip && session.flip.phase !== 'resolved') session.physics.abort(session.flip.handle, 'session-left');
    session.owner.abandon(session.request.matchId, 'left-game');
    diagnostics.recordMatch({ request: session.request, startedAt: session.startedAt, completed: false,
      players: session.practice ? session.request.roster : session.rules.snapshot().players,
      totalFlips: session.totalFlips, testData: session.testData });
    session.status = 'abandoned'; emit('session-left'); return snapshot();
  }

  // The host engine owns the driver. Its subscriber only wakes this private
  // observer; it cannot submit a make/miss or a reward-bearing outcome.
  function observePhysics() {
    if (!session || session.status !== 'active' || !physicsDriver) return;
    var frame = physicsDriver.snapshot();
    if (!frame || frame.qualified !== true || frame.launchId == null) return;
    var launchId = String(frame.launchId);
    var atMs = Math.floor(finite(frame.atMs, 'physics time'));
    if (atMs < 0) throw new RangeError('Physics time must be non-negative');
    if (frame.eventId != null) throw new Error('Event frame requires its dedicated event bridge');
    if (session.seenLaunchIds.has(launchId) && (!session.flip || session.flip.launchId !== launchId || session.flip.phase === 'resolved')) return;
    if (!session.flip || session.flip.launchId !== launchId) {
      if (session.flip && session.flip.phase !== 'resolved') throw new Error('A flip is still in flight');
      if (session.practice) Object.assign(session, makeRules(session.request, true));
      var state = session.rules.snapshot();
      var player = state.players[state.currentPlayerIndex];
      var attempt = session.physics.beginFlip({ flipId: launchId, playerId: player.id, launchedAtMs: atMs });
      session.flip = { handle: attempt, launchId: launchId, phase: 'airborne', atMs: atMs,
        launchedAtMs: atMs,
        player: copy(player), before: copy(state), seat: state.currentPlayerIndex,
        firstContactAt: null, contactAt: null, stableAt: null, angles: [],
        manualHuman: frame.manual === true && player.human === true };
      session.seenLaunchIds.add(launchId);
      if (session.flip.manualHuman) session.manualHumanFlips++;
      emit('flip-launched'); return;
    }
    var flip = session.flip;
    // checkLanding follows the fixed step at the same simulation timestamp.
    // Admit that first terminal observation; duplicate resolved launches are
    // already rejected above and ordinary duplicate step frames remain inert.
    if (atMs < flip.atMs || (atMs === flip.atMs && !frame.landing)) return;
    flip.atMs = atMs;
    var measuredDeadline = !!(frame.landing && frame.landing.deadlineEvidence);
    var measuredAirborneTerminal = !!(frame.landing && frame.landing.airborneTerminalEvidence);
    if (!measuredDeadline && !measuredAirborneTerminal && frame.grounded !== true) {
      if (flip.phase === 'contact' || flip.phase === 'settling') {
        session.physics.markAirborne(flip.handle, atMs); flip.phase = 'airborne';
      }
      flip.stableAt = null; flip.angles = []; return;
    }
    if (!measuredDeadline && !measuredAirborneTerminal && flip.phase === 'airborne') {
      session.physics.markContact(flip.handle, atMs); flip.phase = 'contact';
      flip.contactAt = atMs; if (flip.firstContactAt == null) flip.firstContactAt = atMs;
      emit('flip-contact'); return;
    }
    if (!measuredDeadline && !measuredAirborneTerminal && flip.phase === 'contact') {
      session.physics.markSettling(flip.handle, atMs); flip.phase = 'settling';
      flip.stableAt = null; flip.angles = []; return;
    }
    // Read the host engine's settled classification. The composition does not
    // duplicate its tilt windows, rotation requirement, or physics feel.
    if (!frame.landing) return;
    var result = frame.landing.result;
    if (result !== 'MAKE' && result !== 'MISS') throw new TypeError('Invalid engine landing result');
    var pose = result === 'MAKE' ? frame.landing.pose : 'miss';
    if (result === 'MAKE' && pose !== 'upright' && pose !== 'cap') throw new TypeError('Invalid engine landing pose');
    var timeout = atMs - flip.firstContactAt >= 4000;
    var made = result === 'MAKE';
    var data = { result: result, pose: pose, reason: frame.landing.reason,
      atMs: atMs, stableForMs: Math.floor(finite(frame.landing.stableForMs, 'engine stable duration')) };
    var airborneEvidence = measuredAirborneTerminal && frame.landing.airborneTerminalEvidence;
    var verdict = measuredAirborneTerminal ? session.physics.issueAirborneTerminalVerdict(flip.handle, {
      result: result, pose: pose, reason: data.reason, atMs: atMs,
      evidence: { schema: airborneEvidence.schema, kind: airborneEvidence.kind,
        wasAirborne: airborneEvidence.wasAirborne, flightFrames: airborneEvidence.flightFrames,
        limitFrames: airborneEvidence.limitFrames },
    }) : measuredDeadline ? session.physics.issueDeadlineVerdict(flip.handle, {
      result: result, pose: pose, reason: data.reason, atMs: atMs,
      evidence: { schema: frame.landing.deadlineEvidence.schema,
        onLandingPlane: frame.landing.deadlineEvidence.onLandingPlane,
        rotationComplete: frame.landing.deadlineEvidence.rotationComplete },
    }) : timeout ? session.physics.issueTimeoutVerdict(flip.handle, data)
      : session.physics.issueSettledVerdict(flip.handle, data);
    var transition = session.consumer.resolve(verdict);
    session.lastRulesOutcome = transition.outcome;
    flip.phase = 'resolved'; session.lastLanding = verdict;
    session.totalFlips++;
    diagnostics.recordFlip({ request: session.request, launchId: launchId, player: flip.player,
      before: flip.before, seat: flip.seat, launchedAtMs: flip.launchedAtMs,
      firstContactAtMs: flip.firstContactAt, landing: data, frame: frame,
      after: session.rules.snapshot(), rulesOutcome: transition.outcome, testData: session.testData });
    if (flip.manualHuman) {
      session.ordinaryShots.push({ made: made });
      if (session.ordinaryShots.length > 24) session.ordinaryShots.shift();
    }
    if (session.practice) {
      session.practiceScore.flips++; session.practiceScore[made ? 'makes' : 'misses']++;
      if (pose === 'cap') session.practiceScore.caps++;
    }
    emit('flip-resolved');
    if (!session.practice && session.rules.snapshot().phase === 'complete') finish().catch(function () {});
  }
  function attachPhysics(driver) {
    assertOpen();
    if (physicsDriver) throw new Error('Physics is already attached');
    if (!driver || typeof driver.snapshot !== 'function' || typeof driver.subscribe !== 'function') throw new TypeError('A physics observer driver is required');
    physicsDriver = driver;
    try {
      detachPhysics = driver.subscribe(function () {
        try { observePhysics(); } catch (error) { warning = error.message; emit('physics-frame-rejected'); }
      });
      if (typeof detachPhysics !== 'function') throw new TypeError('Physics subscription must return a detach function');
    } catch (error) { physicsDriver = null; throw error; }
    return freeze({ connected: true });
  }
  function getStory() {
    assertOpen();
    if (!storyRuntime) storyRuntime = Story.createStoryRuntime({ progressionRuntime: progression, rewardAuthority: rewardAuthority });
    return storyRuntime;
  }
  var facade = {
    schema: 'FlipgameBrowserApplicationV1', sourceIdentity: sourceIdentity,
    supported: freeze({ formats: ['classic'], activities: ['free-play', 'practice'], physics: ['normal'], storyRequests: true }),
    ready: handle.ready.then(function () { emit('ready'); return snapshot(); }),
    snapshot: snapshot,
    subscribe: function (listener) {
      if (typeof listener !== 'function') throw new TypeError('Subscriber must be a function');
      listeners.add(listener); listener(snapshot(), freeze({ type: 'snapshot' }));
      return function () { listeners.delete(listener); };
    },
    beginSession: beginSession, abandonSession: abandon, retryFinalization: finish,
    attachPhysics: attachPhysics,
    objects: progression.listObjects, arenas: progression.listArenas, store: progression.viewStore,
    object: progression.viewObject, arena: progression.viewArena,
    isObjectAvailable: progression.isObjectAvailable, isArenaAvailable: progression.isArenaAvailable,
    isCosmeticAvailable: progression.isCosmeticAvailable, isFeatureAvailable: progression.isFeatureAvailable,
    achievements: function () { return Achievements.listViews(progression.snapshot().achievementIds); },
    statistics: diagnostics.view,
    feature: progression.viewFeature, variant: progression.viewVariant,
    purchaseCosmetic: progression.purchaseCosmetic, dismissReveal: progression.dismissReveal,
    enableOwnerTesting: function (code) { assertIdle(); return progression.activateOwnerTestMode(code); },
    disableOwnerTesting: function () { assertIdle(); return progression.deactivateOwnerTestMode(); },
    storyViews: function () { return getStory().views(); },
    createStoryRequest: function (input) { assertIdle(); return getStory().createMatchRequest(Object.assign({}, input, { matchId: id() })); },
    exportBackup: progression.exportBackup,
    importBackup: function (value, setup, options) { assertIdle(); return progression.importBackup(value, setup, options); },
    close: function () {
      if (closed) return;
      abandon(); if (detachPhysics) detachPhysics(); progression.close(); closed = true;
      emit('closed'); listeners.clear();
    },
  };
  return Object.freeze(facade);
}
