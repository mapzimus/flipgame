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
// 3. beginSession({activityId:'free-play'|'practice',
//    formatId:'classic'|'cup'|'team-clash', physicsModeId:'normal'|'insane'|'alien',
//    roster:[{name,human,objectId,variantId,teamId}],
//    startingLives,cupLength,seed,suddenDeathEnabled}). The facade owns immutable IDs.
// 4. Observe session.rules/lastLanding/resolution. Do not also invoke the legacy
//    scoring/progression path for this session. retryFinalization retries only
//    a completed Rules match after a storage failure. abandonSession preserves
//    earned content and consumes the reservation without match rewards.
//
// 5. Battle runs through the battle facade, not beginSession. Report a measured
//    display with observeDisplay({width,observedContacts}) before prepare: the
//    verified-contact count only ever rises from simultaneous contacts a host
//    actually saw, and it decides how many lanes may be active. prepare opens
//    the reservation, start opens Heat 1, and from then on the same physics
//    driver frames record attempts against Battle Rules. choosePower stores an
//    offered card and advanceClock drives a Timed Rush gameplay clock. The host
//    never supplies a pose, a score or a series verdict.
// Story views and prescribed requests are composed; start them through
// createStoryRequest rather than beginSession.
function createBrowserApplication(require, platform, sourceIdentity) {
  'use strict';
  var Rules = require('./v112-rules.js');
  var Battle = require('./v112-battle.js');
  var Landing = require('./v112-landing-verdict.js');
  var Activity = require('./v112-activity.js');
  var Economy = require('./v112-economy.js');
  var Names = require('./v111-name-policy.js');
  var Runtime = require('./v112-progression-runtime.js');
  var Story = require('./v112-story-runtime.js');
  var Training = require('./v112-training.js');
  var Achievements = require('./v112-achievements.js');
  var diagnostics = require('./v112-data.js').createDataPipeline();
  var rewardAuthority;
  var handle = Runtime.connectBrowserRuntime(function (authority) { rewardAuthority = authority; });
  var progression = handle.runtime;
  var listeners = new Set();
  var session = null;
  var battle = null;
  // Verified contacts are only ever raised by simultaneous contacts a host
  // actually observed. No navigator estimate can qualify a lane.
  var battleDisplay = { width: 0, verifiedContacts: 1 };
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
      battle: battleSnapshot(),
      session: session ? { matchId: session.request.matchId, request: session.request,
        status: session.status, rules: session.practice ? null : session.rules.snapshot(),
        play: playState(session.rules.snapshot()),
        practice: session.practice ? copy(session.practiceScore) : null,
        flipPhase: session.flip ? session.flip.phase : 'ready',
        lastLanding: session.lastLanding, lastRulesOutcome: session.lastRulesOutcome,
        resolution: session.resolution } : null });
  }
  function playState(state) {
    var physical = state.currentHeat || state;
    var players = physical.players || (state.config && state.config.players) || [];
    var currentId = state.turn && state.turn.current;
    return freeze({ players: copy(players),
      currentPlayerIndex: players.findIndex(function (player) { return player.id === currentId; }),
      currentPlayerId: currentId, turn: copy(state.turn), phase: state.phase,
      stake: physical.stake || 0, heat: state.heatNumber || null, round: state.roundNumber || null,
      scores: copy(state.scores || null), heatWins: copy(state.heatWins || null),
      suddenDeath: copy(physical.suddenDeath || null) });
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
    if (battle && ['reserved', 'playing', 'finalizing', 'finalization-failed'].indexOf(battle.status) >= 0) {
      throw new Error('Finish or leave the current Battle first');
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
      var name = Names.validate(player.name || player.displayName || 'Player ' + (index + 1));
      if (!name.ok) throw new Error('Please choose another name');
      var objectId = player.objectId || player.flipperId || 'bottle';
      if (!progression.isObjectAvailable(objectId)) throw new Error('Choose an available Flipper');
      var gallery = progression.viewObject(objectId).variants;
      var selection = player.variantId == null ? 0 : player.variantId;
      var variant = typeof selection === 'number' ? gallery[selection]
        : gallery.find(function (item) { return item.id === selection || item.variantId === selection; });
      if (!variant) throw new Error('Choose an available variant');
      var cosmeticId = player.cosmeticId || null;
      if (cosmeticId && !progression.isCosmeticAvailable(cosmeticId)) throw new Error('Choose an available cosmetic');
      var type = String(player.type || '').toLowerCase();
      var cpu = player.human === false || player.isAI === true || player.cpu === true ||
        type === 'cpu' || type === 'ai';
      return { id: 'seat-' + (index + 1), name: name.value, human: !cpu,
        isAI: cpu, objectId: objectId, variantId: variant.id, cosmeticId: cosmeticId,
        teamId: player.teamId == null ? null : String(player.teamId) };
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
    { id: 'free-play' }, { id: 'practice' }, { id: 'story' },
  ]);
  Training.registerActivities(registry);
  var coordinator = Activity.createMatchSessionCoordinator({
    registry: registry, rewardAuthority: rewardAuthority,
    transaction: function (command, rewards) {
      var owner = session && command.matchId === session.request.matchId ? session
        : (battle && command.matchId === battle.request.matchId ? battle : null);
      if (!owner) throw new Error('Finalization session mismatch');
      var claim = rewards.rewardsEligible ? rewards.consumeMatch(rewardInput(owner, command.outcome)) : null;
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
      makeRate: shots.length ? made / shots.length : 0.5, feel: 'standard',
      laneCount: current.config ? current.config.hardware.activeLaneLimit : 1 });
    var telemetry = { completed: true, resolved: true, activityId: current.request.activityId,
      qualifiedManualHumanFlips: current.manualHumanFlips, humanPlayers: humans.length,
      formatId: current.request.formatId,
      performanceMultiplier: performance.multiplier,
      humanWon: outcome.winnerIds.some(function (winner) { return humanIds.has(winner); }) };
    // Battle counts heats rather than lives, and earns its own reward mode from
    // the format the roster actually played. Each field belongs to exactly one
    // kind of match, so neither may be sent as an empty value by the other.
    if (current.config) telemetry.battleFormatId = current.config.formatId;
    else telemetry.startingLives = current.request.rulesOptions.startingLives;
    return telemetry;
  }
  function installSession(request, owner) {
    var practice = request.activityId === 'practice' || request.activityId === 'tutorial';
    var runtime = makeRules(request, practice);
    session = Object.assign(runtime, { request: request, owner: owner,
      status: 'active', practice: practice,
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
    var formatId = source.formatId || 'classic';
    var physicsModeId = source.physicsModeId || 'normal';
    if (['classic', 'cup', 'team-clash'].indexOf(formatId) < 0) throw new Error('Choose a supported local format');
    if (['normal', 'insane', 'alien'].indexOf(physicsModeId) < 0) throw new Error('Choose a supported physics mode');
    if (activityId === 'practice' && formatId !== 'classic') throw new Error('Practice uses the Classic format');
    if (physicsModeId === 'alien' && !progression.isFeatureAvailable('alien')) throw new Error('Alien is locked');
    if (physicsModeId === 'insane' && !progression.isFeatureAvailable('insane-mode')) throw new Error('INSANE MODE is locked');
    if (activityId === 'free-play' && !progression.writerStatus().writable) throw new Error('Waiting for this tab’s profile writer');
    var roster = names(source.roster || [{ name: 'Player 1' }, { name: 'Player 2' }]);
    if (activityId === 'free-play' && roster.length < 2) throw new Error('Classic needs at least two players');
    if (activityId === 'practice' && roster.length !== 1) throw new Error('Practice needs one player');
    if (formatId === 'team-clash') {
      if (roster.length % 2) throw new RangeError('Team Clash requires an even 2–16 players');
      var split = roster.length / 2;
      roster = roster.map(function (player, index) {
        return Object.assign({}, player, { teamId: player.teamId || (index < split ? 'team-a' : 'team-b') });
      });
    }
    var cupLength = source.cupLength || 'short';
    if (formatId === 'cup' && ['short', 'full'].indexOf(cupLength) < 0) throw new Error('Choose Short or Full Cup');
    var startingLives = formatId === 'cup' ? (cupLength === 'short' ? 3 : 10)
      : (source.startingLives == null ? 10 : source.startingLives);
    if (!Number.isSafeInteger(startingLives) || startingLives < 1 || startingLives > 100) throw new RangeError('Choose 1–100 starting lives');
    var arenaId = source.arenaId || 'baseline-table';
    if (!progression.isArenaAvailable(arenaId)) throw new Error('Choose an available arena');
    var activityContext = { arenaId: arenaId, testData: activityId === 'practice' };
    if (source.viewport && Number.isFinite(source.viewport.width) && Number.isFinite(source.viewport.height)) {
      activityContext.viewport = { width: Math.max(1, Math.min(16384, Math.round(source.viewport.width))),
        height: Math.max(1, Math.min(16384, Math.round(source.viewport.height))) };
    }
    var request = Activity.MatchRequestV2({ matchId: id(), activityId: activityId,
      formatId: formatId, physicsModeId: physicsModeId, roster: roster,
      seed: source.seed == null ? 1 : source.seed,
      rulesOptions: { startingLives: startingLives, suddenDeathEnabled: source.suddenDeathEnabled !== false,
        cupLength: cupLength, arenaId: arenaId },
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
        players: playState(current.rules.snapshot()).players, totalFlips: current.totalFlips, testData: current.testData });
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
      players: session.practice ? session.request.roster : playState(session.rules.snapshot()).players,
      totalFlips: session.totalFlips, testData: session.testData });
    session.status = 'abandoned'; emit('session-left'); return snapshot();
  }

  // Battle. Its Rules own the relay order, the launch lease, volley batching,
  // power offers and the series verdict. The host contributes only a measured
  // display, engine landings and the player's card choice.
  function observeBattleDisplay(input) {
    var source = input || {};
    var width = Number(source.width);
    if (!Number.isFinite(width) || width <= 0) throw new RangeError('Battle needs a measured display width');
    var observed = Math.floor(Number(source.observedContacts));
    if (!Number.isFinite(observed) || observed < 1) observed = 1;
    battleDisplay = { width: Math.floor(width),
      verifiedContacts: Math.max(battleDisplay.verifiedContacts, Math.min(16, observed)) };
    return battleCapabilities();
  }
  function battleCapabilities() { return Battle.hardwareProfile(battleDisplay); }
  function battleOwnerKey(playerId) {
    var player = battle.config.players.find(function (entry) { return entry.id === playerId; });
    if (!player) throw new Error('That player is not in this Battle');
    return battle.config.formatId === 'doubles' || battle.config.formatId === 'team'
      ? player.teamId : player.id;
  }
  // Whose launch the engine is allowed to attribute next: an active participant
  // that has neither resolved this volley nor left an attempt in flight.
  function battleLauncher() {
    if (!battle || !battle.state || battle.state.phase !== 'active') return null;
    var state = battle.state;
    var owners = state.pendingLaunchOwners || {};
    var inFlight = Object.keys(owners).map(function (key) { return owners[key]; });
    var resolved = state.volleyPlayerIds || [];
    var active = state.activePlayerIds || [];
    for (var index = 0; index < active.length; index += 1) {
      if (resolved.indexOf(active[index]) < 0 && inFlight.indexOf(active[index]) < 0) return active[index];
    }
    return null;
  }
  function battleSnapshot() {
    if (!battle) return null;
    return freeze({ schema: 'BattlePrivateViewV1', matchId: battle.request.matchId,
      status: battle.status, config: copy(battle.config), state: copy(battle.state),
      launcherId: battleLauncher(), message: battle.message || '',
      resolution: copy(battle.resolution) });
  }
  function battleRoster(source, formatId) {
    var roster = names(source);
    if (formatId !== 'doubles' && formatId !== 'team') {
      return roster.map(function (player) { return Object.assign({}, player, { teamId: null }); });
    }
    if (roster.length % 2) throw new RangeError('Team Battle needs an even roster');
    var authored = roster.every(function (player) { return player.teamId; });
    if (authored) return roster;
    // Seats alternate so a table can pair off left to right without reseating.
    return roster.map(function (player, index) {
      return Object.assign({}, player, { teamId: index % 2 ? 'team-b' : 'team-a' });
    });
  }
  function prepareBattle(input) {
    assertIdle();
    var source = input || {};
    var formatId = String(source.battleFormatId || source.formatId || 'duel');
    if (['duel', 'doubles', 'four-way', 'team'].indexOf(formatId) < 0) throw new Error('Choose a supported Battle format');
    var paceId = String(source.paceId || 'volley');
    if (['volley', 'rush'].indexOf(paceId) < 0) throw new Error('Choose Equal Volley or Timed Rush');
    var powerProfileId = String(source.powerProfileId || 'sport');
    if (['sport', 'mayhem'].indexOf(powerProfileId) < 0) throw new Error('Choose Sport or Mayhem cards');
    var physicsModeId = String(source.physicsModeId || 'normal');
    if (['normal', 'insane'].indexOf(physicsModeId) < 0) throw new Error('Battle runs Normal or INSANE MODE');
    if (physicsModeId === 'insane' && !progression.isFeatureAvailable('insane-mode')) throw new Error('INSANE MODE is locked');
    if (!progression.writerStatus().writable) throw new Error('Waiting for this tab’s profile writer');
    var hardware = battleCapabilities();
    if (!hardware.width) throw new Error('Battle needs a measured display before a heat can start');
    var arenaId = source.arenaId || 'baseline-table';
    if (!progression.isArenaAvailable(arenaId)) throw new Error('Choose an available arena');
    var roster = battleRoster(source.players || source.roster || [], formatId);
    var request = Activity.MatchRequestV2({ matchId: id(), activityId: 'free-play',
      formatId: 'battle', physicsModeId: physicsModeId, roster: roster,
      seed: source.seed == null ? 1 : source.seed,
      rulesOptions: { battleFormatId: formatId, paceId: paceId,
        powerProfileId: powerProfileId, hardware: hardware, arenaId: arenaId },
      activityContext: { arenaId: arenaId } });
    var config = Battle.normalizeConfig(request);
    coordinator.start(request);
    battle = { request: request, config: config, state: null, status: 'reserved',
      owner: coordinator, handle: 'battle-' + request.matchId, message: '',
      manualHumanFlips: 0, ordinaryShots: [], attempts: 0, totalFlips: 0,
      flip: null, seen: new Set(), resolution: null, finalPromise: null,
      startedAt: Date.now(), testData: progression.snapshot().ownerTestMode === true };
    emit('battle-reserved');
    return freeze({ handle: battle.handle, request: request, config: copy(config) });
  }
  function battleReservation(handle) {
    assertOpen();
    if (!battle || battle.handle !== String(handle)) throw new Error('That Battle reservation is not current');
    return battle;
  }
  function startBattle(handle) {
    var current = battleReservation(handle);
    if (current.status !== 'reserved') throw new Error('This Battle already started');
    current.state = Battle.startHeat(Battle.createState(current.config));
    current.status = 'playing';
    emit('battle-started');
    return battleSnapshot();
  }
  function cancelBattle(handle) {
    var current = battleReservation(handle);
    if (current.status !== 'reserved') throw new Error('Leave the running Battle instead');
    current.owner.abandon(current.request.matchId, 'cancelled');
    battle = null; emit('battle-cancelled');
    return null;
  }
  function abandonBattle(reason) {
    assertOpen();
    if (!battle) return null;
    if (battle.status === 'finalizing' || battle.status === 'finalization-failed') {
      throw new Error('Retry the completed Battle’s rewards first');
    }
    if (battle.status !== 'completed') {
      battle.owner.abandon(battle.request.matchId, reason ? String(reason) : 'left-game');
      diagnostics.recordMatch({ request: battle.request, startedAt: battle.startedAt,
        completed: false, players: battle.config.players,
        totalFlips: battle.totalFlips, testData: battle.testData });
    }
    battle = null; emit('battle-left');
    return null;
  }
  function chooseBattlePower(input) {
    assertOpen();
    if (!battle || battle.status !== 'playing') throw new Error('No Battle is running');
    var source = input || {};
    var playerId = String(source.playerId);
    var key = battleOwnerKey(playerId);
    var offer = (battle.state.powerOffers || {})[key] || [];
    var index = offer.findIndex(function (card) { return card.id === source.cardId; });
    if (index < 0) throw new Error('That card is not on offer');
    battle.state = Battle.choosePower(battle.state, { playerId: playerId, index: index,
      targetId: source.targetId });
    emit('battle-power-stored');
    return battleSnapshot();
  }
  function advanceBattleClock(deltaMs) {
    assertOpen();
    if (!battle || battle.status !== 'playing') throw new Error('No Battle is running');
    if (battle.config.paceId !== 'rush') return battleSnapshot();
    battle.state = Battle.advanceClock(battle.state, deltaMs);
    settleBattlePhase();
    return battleSnapshot();
  }
  function settleBattlePhase() {
    if (battle.state.phase === 'between-heats') battle.state = Battle.startHeat(battle.state);
    emit('battle-advanced');
    if (battle.state.phase === 'complete') finishBattle().catch(function () {});
  }
  function battleOutcome() {
    var verdict = Battle.toMatchOutcomeV2(battle.state);
    return Battle.toMatchOutcomeV2(battle.state, { telemetry: rewardInput(battle, verdict) });
  }
  function finishBattle() {
    if (!battle) return Promise.reject(new Error('No Battle to finish'));
    var current = battle;
    if (current.status === 'completed') return Promise.resolve(current.resolution);
    if (current.finalPromise) return current.finalPromise;
    if (!current.state || current.state.phase !== 'complete') return Promise.reject(new Error('The Battle is still running'));
    current.status = 'finalizing';
    var outcome = battleOutcome();
    current.finalPromise = current.owner.finalize(outcome).then(function (result) {
      current.resolution = result; current.status = 'completed'; current.finalPromise = null;
      diagnostics.recordMatch({ request: current.request, outcome: outcome,
        startedAt: current.startedAt, players: current.config.players,
        totalFlips: current.totalFlips, testData: current.testData });
      emit('battle-completed'); return result;
    }).catch(function (error) {
      current.finalPromise = null; current.status = 'finalization-failed';
      current.message = 'Battle saved pending reward retry: ' + error.message;
      warning = current.message;
      emit('battle-finalization-failed'); throw error;
    });
    return current.finalPromise;
  }
  // A Battle heat disables ordinary rare events, so an event frame here can only
  // be a host defect rather than something to score.
  function observeBattleFrame(frame) {
    if (!frame || frame.qualified !== true || frame.launchId == null) return;
    var launchId = String(frame.launchId);
    if (Math.floor(finite(frame.atMs, 'physics time')) < 0) throw new RangeError('Physics time must be non-negative');
    if (frame.eventId != null) throw new Error('Battle heats disable ordinary events');
    var flip = battle.flip;
    if (!flip || flip.launchId !== launchId) {
      if (battle.seen.has(launchId)) return;
      if (flip && flip.phase !== 'resolved') throw new Error('A Battle flip is still in flight');
      var playerId = battleLauncher();
      if (!playerId) throw new Error('Battle is not waiting for a launch');
      var player = battle.config.players.find(function (entry) { return entry.id === playerId; });
      var attemptId = 'attempt-' + (battle.attempts + 1);
      if (battle.config.paceId === 'rush') {
        battle.state = Battle.markLaunch(battle.state, { attemptId: attemptId, playerId: playerId });
      }
      battle.attempts += 1;
      battle.flip = { launchId: launchId, attemptId: attemptId, playerId: playerId,
        phase: 'airborne', manual: frame.manual === true && player.human === true };
      battle.seen.add(launchId);
      if (battle.flip.manual) battle.manualHumanFlips += 1;
      emit('battle-flip-launched');
      return;
    }
    if (flip.phase === 'resolved' || !frame.landing) return;
    var result = frame.landing.result;
    if (result !== 'MAKE' && result !== 'MISS') throw new TypeError('Invalid engine landing result');
    var pose = result === 'MAKE' ? frame.landing.pose : 'miss';
    if (result === 'MAKE' && pose !== 'upright' && pose !== 'cap') throw new TypeError('Invalid engine landing pose');
    battle.state = Battle.recordAttempt(battle.state, { attemptId: flip.attemptId,
      playerId: flip.playerId, pose: pose, qualifiedManual: flip.manual });
    flip.phase = 'resolved';
    battle.totalFlips += 1;
    if (flip.manual) {
      battle.ordinaryShots.push({ made: result === 'MAKE' });
      if (battle.ordinaryShots.length > 24) battle.ordinaryShots.shift();
    }
    settleBattlePhase();
  }

  // The host engine owns the driver. Its subscriber only wakes this private
  // observer; it cannot submit a make/miss or a reward-bearing outcome.
  function observePhysics() {
    if (!physicsDriver) return;
    if (battle && battle.status === 'playing') { observeBattleFrame(physicsDriver.snapshot()); return; }
    if (!session || session.status !== 'active') return;
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
      var play = playState(state);
      var player = play.players[play.currentPlayerIndex];
      if (!player) throw new Error('The match is not ready for a launch');
      var attempt = session.physics.beginFlip({ flipId: launchId, playerId: player.id, launchedAtMs: atMs });
      session.flip = { handle: attempt, launchId: launchId, phase: 'airborne', atMs: atMs,
        launchedAtMs: atMs,
        player: copy(player), before: copy(state.currentHeat || state), seat: play.currentPlayerIndex,
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
    supported: freeze({
      formats: ['classic', 'cup', 'team-clash', 'battle'],
      activities: ['free-play', 'practice', 'story', 'tutorial', 'physics-lab'],
      physics: ['normal', 'insane', 'alien'],
      storyRequests: true,
    }),
    ready: handle.ready.then(function () { emit('ready'); return snapshot(); }),
    snapshot: snapshot,
    subscribe: function (listener) {
      if (typeof listener !== 'function') throw new TypeError('Subscriber must be a function');
      listeners.add(listener); listener(snapshot(), freeze({ type: 'snapshot' }));
      return function () { listeners.delete(listener); };
    },
    beginSession: beginSession, abandonSession: abandon, retryFinalization: finish,
    attachPhysics: attachPhysics,
    // Battle authority. The presentation host measures the display and reports
    // observed simultaneous contacts; it never submits a pose or a verdict.
    battle: freeze({
      formats: ['duel', 'doubles', 'four-way', 'team'],
      paces: ['volley', 'rush'],
      powerProfiles: ['sport', 'mayhem'],
      observeDisplay: observeBattleDisplay, capabilities: battleCapabilities,
      prepare: prepareBattle, start: startBattle, cancel: cancelBattle,
      choosePower: chooseBattlePower, advanceClock: advanceBattleClock,
      snapshot: battleSnapshot, launcherId: battleLauncher,
      abandon: abandonBattle, retryFinalization: finishBattle,
    }),
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
      abandonBattle('closed'); abandon();
      if (detachPhysics) detachPhysics(); progression.close(); closed = true;
      emit('closed'); listeners.clear();
    },
  };
  return Object.freeze(facade);
}
