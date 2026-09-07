// v112-story-runtime.js -- headless Story/Rival orchestration and progression bridge.
// Rendering, rules simulation, input, and statistics remain external consumers.
(function (root, factory) {
  'use strict';
  var Activity = root && root.FlipgameV112Activity;
  var Story = root && root.FlipgameV112Story;
  var Profile = root && root.FlipgameV112Profile;
  var View = root && root.FlipgameV112StoryView;
  if (typeof module === 'object' && module.exports) {
    Activity = require('./v112-activity.js');
    Story = require('./v112-story.js');
    Profile = require('./v112-profile.js');
    View = require('./v112-story-view.js');
  }
  var api = factory(Activity, Story, Profile, View, root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV112StoryRuntime = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)),
function (Activity, Story, Profile, View, root) {
  'use strict';

  if (!Activity || !Story || !Profile || !View) {
    throw new Error('v1.12 Activity, Story, Profile, and Story view modules must load before Story runtime');
  }

  var STORY_STORAGE_KEY = 'flipgame.story.v1';

  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }
  function object(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }
  function nonEmpty(value, label) {
    var text = String(value == null ? '' : value).trim();
    if (!text || /[\u0000-\u001f\u007f]/.test(text)) {
      throw new TypeError((label || 'value') + ' is required');
    }
    return text;
  }
  function unique(values) {
    return Array.from(new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean)));
  }
  function chapterFor(value) {
    var source = object(value);
    return Story.chapters.find(function (chapter) {
      return chapter.id === String(source.chapterId || '') ||
        chapter.rivalId === String(source.rivalId || '');
    }) || null;
  }
  function safeParse(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch (_) { return null; }
  }
  function readStorage(storage, key) {
    if (!storage || typeof storage.getItem !== 'function') return null;
    try { return safeParse(storage.getItem(key)); } catch (_) { return null; }
  }

  function createStoryStateStore(options) {
    var opts = object(options);
    var storage = opts.storage || null;
    var key = String(opts.key || STORY_STORAGE_KEY);
    var persisted = readStorage(storage, key);
    var initial = persisted && persisted.schema === 'StoryStateV1'
      ? persisted : (opts.initialState || Story.defaultState());
    var state = Story.normalizeState(initial);
    var revision = Math.max(0, Math.floor(Number(persisted && persisted.runtimeRevision) || 0));

    function persist(next, nextRevision) {
      if (!storage || typeof storage.setItem !== 'function') return;
      var record = Object.assign({}, clone(next), { runtimeRevision: nextRevision });
      try { storage.setItem(key, JSON.stringify(record)); }
      catch (error) {
        var wrapped = new Error('Story state persistence failed');
        wrapped.cause = error;
        throw wrapped;
      }
    }
    function snapshot() { return Story.normalizeState(state); }
    function set(next) {
      var normalized = Story.normalizeState(next);
      var nextRevision = revision + 1;
      persist(normalized, nextRevision);
      state = normalized;
      revision = nextRevision;
      return snapshot();
    }
    function refresh() {
      var external = readStorage(storage, key);
      var externalRevision = Math.max(0, Math.floor(Number(external && external.runtimeRevision) || 0));
      if (external && external.schema === 'StoryStateV1' && externalRevision > revision) {
        state = Story.normalizeState(external);
        revision = externalRevision;
      }
      return snapshot();
    }
    function discoverLevel(level) {
      var current = refresh();
      var result = Story.discoverForLevel(current, level);
      if (result.newlyDiscovered.length) set(result.state);
      return freeze({ state: snapshot(), newlyDiscovered: result.newlyDiscovered });
    }
    function discoverRival(rivalId) {
      var id = nonEmpty(rivalId, 'rivalId');
      var current = refresh();
      if (current.discoveredRivalIds.indexOf(id) >= 0) return current;
      if (!Story.chapters.some(function (chapter) { return chapter.rivalId === id; })) {
        throw new RangeError('Unknown Story rival: ' + id);
      }
      return set(Object.assign({}, clone(current), {
        discoveredRivalIds: current.discoveredRivalIds.concat([id]),
      }));
    }
    function reconcileProfile(profileInput) {
      var profile = object(profileInput);
      var current = refresh();
      var defeated = unique(current.defeatedRivalIds.concat(profile.defeatedRivalIds || []));
      var rewardClaims = unique(current.claimedRewardIds.concat(
        (profile.processedClaimIds || []).filter(function (id) {
          return /^rival\.[^.]+\.first-clear$/.test(String(id)) ||
            /^story\.act\.[1-4]\.first-clear$/.test(String(id));
        })));
      if (JSON.stringify(defeated) === JSON.stringify(current.defeatedRivalIds) &&
          JSON.stringify(rewardClaims) === JSON.stringify(current.claimedRewardIds)) return current;
      return set(Object.assign({}, clone(current), {
        defeatedRivalIds: defeated, claimedRewardIds: rewardClaims,
      }));
    }
    function commitResolution(resolutionInput) {
      var resolution = object(resolutionInput);
      if (resolution.schema !== 'StoryResolutionV1') {
        throw new TypeError('StoryResolutionV1 is required');
      }
      if (resolution.abandoned === true) {
        return freeze({ applied: false, duplicate: false, reason: 'abandoned', state: snapshot() });
      }
      var current = refresh();
      var incoming = Story.normalizeState(resolution.state);
      var newAttempts = incoming.resolvedAttemptIds.filter(function (id) {
        return current.resolvedAttemptIds.indexOf(id) < 0;
      });
      if (!newAttempts.length) {
        return freeze({ applied: false, duplicate: true, reason: 'duplicate', state: current });
      }
      var merged = Story.normalizeState({
        clearedPreliminaryIds: unique(current.clearedPreliminaryIds.concat(incoming.clearedPreliminaryIds)),
        defeatedRivalIds: unique(current.defeatedRivalIds.concat(incoming.defeatedRivalIds)),
        discoveredRivalIds: unique(current.discoveredRivalIds.concat(incoming.discoveredRivalIds)),
        resolvedAttemptIds: unique(current.resolvedAttemptIds.concat(incoming.resolvedAttemptIds)),
        claimedRewardIds: unique(current.claimedRewardIds.concat(incoming.claimedRewardIds)),
        lastCheckpoint: incoming.lastCheckpoint || current.lastCheckpoint,
      });
      return freeze({ applied: true, duplicate: false, state: set(merged), attemptIds: newAttempts });
    }

    return freeze({
      schema: 'StoryStateStoreV1', key: key,
      snapshot: snapshot, refresh: refresh, set: set,
      discoverLevel: discoverLevel, discoverRival: discoverRival,
      reconcileProfile: reconcileProfile, commitResolution: commitResolution,
    });
  }

  function normalizeHumanPlayers(input, cooperative) {
    var source = object(input);
    var expected = cooperative ? 2 : 1;
    var players = Array.isArray(source.humans) ? source.humans : [];
    if (!players.length && Array.isArray(source.alliedHumanIds)) {
      players = source.alliedHumanIds.map(function (id) { return { id: id }; });
    }
    if (players.length !== expected) {
      throw new TypeError('Story match requires exactly ' + expected + ' human player' +
        (expected === 1 ? '' : 's'));
    }
    var seen = new Set();
    return players.map(function (entry, index) {
      var player = object(entry);
      var id = nonEmpty(player.id || player.playerId, 'human player id');
      if (seen.has(id)) throw new TypeError('Duplicate human player id: ' + id);
      seen.add(id);
      return freeze({
        id: id, kind: 'human', human: true,
        displayName: String(player.displayName || player.name || ('Player ' + (index + 1))),
        flipperId: String(player.flipperId || player.objectId || 'bottle'),
        variantId: player.variantId == null ? null : String(player.variantId),
        cosmeticId: player.cosmeticId == null ? null : String(player.cosmeticId),
        allianceId: cooperative ? 'story-allies' : null,
      });
    });
  }

  function createCpuRoster(attempt, count) {
    var chapter = chapterFor(attempt);
    var output = [];
    for (var index = 0; index < count; index++) {
      var signature = attempt.matchKind === 'signature' && index === 0;
      output.push(freeze({
        id: signature ? ('rival-' + chapter.rivalId) :
          ('cpu-' + chapter.id + '-' + (index + 1)),
        kind: 'cpu', human: false,
        displayName: signature ? chapter.rivalName : ('WFC Entry ' + (index + 1)),
        callsign: signature ? chapter.callsign : null,
        flipperId: signature ? chapter.flipperId : 'bottle',
        cpuTier: chapter.cpuTier,
        allianceId: 'story-opposition',
      }));
    }
    return output;
  }

  function attemptIsReplay(stateInput, attempt) {
    var state = Story.normalizeState(stateInput);
    var chapter = chapterFor(attempt);
    if (attempt.matchKind === 'preliminary') {
      return state.clearedPreliminaryIds.indexOf(chapter.preliminaryId) >= 0;
    }
    return state.defeatedRivalIds.indexOf(chapter.rivalId) >= 0;
  }

  function buildRequest(options) {
    var opts = object(options);
    var storyStore = opts.storyStore;
    var profileStore = opts.profileStore;
    if (!storyStore || typeof storyStore.snapshot !== 'function') {
      throw new TypeError('Story state store is required');
    }
    if (!profileStore || typeof profileStore.snapshot !== 'function') {
      throw new TypeError('Profile store is required');
    }
    var input = object(opts.input);
    var matchId = nonEmpty(input.matchId, 'matchId');
    var source = input.activityId === 'rival-board' || input.source === 'rival-board'
      ? 'rival-board' : 'story';
    var cooperative = source === 'story' && input.cooperative === true;
    var humans = normalizeHumanPlayers(input, cooperative);
    var profile = profileStore.snapshot();
    storyStore.reconcileProfile(profile);
    storyStore.discoverLevel(profile.flipLevel);
    var chapter = chapterFor(input);
    if (!chapter) throw new TypeError('Unknown Story chapter or rival');
    var before = storyStore.snapshot();
    var attempt = Story.prepareAttempt(before, {
      attemptId: String(input.attemptId || ('attempt:' + matchId)),
      source: source, chapterId: chapter.id,
      matchKind: input.matchKind,
      cooperative: cooperative,
      alliedHumanIds: humans.map(function (player) { return player.id; }),
      seed: input.seed,
    });
    // Reveal a Story rival only after availability validation. Invalid requests
    // must never leak a later Board identity into the persisted discovery state.
    if (source === 'story') storyStore.discoverRival(chapter.rivalId);
    var replay = attemptIsReplay(before, attempt);
    var cpuCount = attempt.rosterTemplate.cpuCount;
    var roster = humans.concat(createCpuRoster(attempt, cpuCount)).map(function (entry) {
      return Object.assign({}, clone(entry), { startingLives: attempt.rosterTemplate.lives });
    });
    var eventPolicy = freeze({
      enabled: attempt.eventsEnabled,
      oddsProfile: 'normal',
      exactMrHoweBoost: attempt.eventsEnabled,
      nestedEvents: attempt.eventsEnabled,
      forcedEventId: null,
    });
    var opponentTargeting = freeze({
      alliedHumanIds: attempt.alliedHumanIds,
      excludeAlliedHumans: cooperative,
    });
    return Activity.MatchRequestV2({
      matchId: matchId,
      activityId: source,
      formatId: 'classic',
      physicsModeId: attempt.physicsModeId,
      roster: roster,
      rulesOptions: {
        startingLives: attempt.rosterTemplate.lives,
        playerCount: roster.length,
        arenaId: attempt.arenaId,
        prescribedArena: true,
        events: eventPolicy,
        cpuProfile: { tier: attempt.cpuTier },
        clearCondition: { anyWinnerId: attempt.alliedHumanIds },
        opponentTargeting: opponentTargeting,
      },
      activityContext: {
        schema: 'StoryActivityContextV1',
        attempt: attempt,
        chapterId: attempt.chapterId,
        rivalId: attempt.rivalId,
        matchKind: attempt.matchKind,
        source: attempt.source,
        cooperative: attempt.cooperative,
        alliedHumanIds: attempt.alliedHumanIds,
        arenaId: attempt.arenaId,
        prescribedArena: true,
        cpuTier: attempt.cpuTier,
        nativeAlien: attempt.physicsModeId === 'alien',
        events: eventPolicy,
        opponentTargeting: opponentTargeting,
        replay: replay,
      },
      seed: attempt.seed,
      createdAt: input.createdAt,
    });
  }

  function abandonedResolution(state, request, reason) {
    var context = object(request.activityContext);
    var attempt = object(context.attempt);
    return freeze({
      schema: 'StoryResolutionV1', duplicate: false, success: false,
      abandoned: true, source: request.activityId,
      matchKind: attempt.matchKind || null, chapterId: attempt.chapterId || null,
      rivalId: attempt.rivalId || null, ordinaryRewardsEligible: false,
      state: Story.normalizeState(state), rewards: [],
      newlyClearedChapterIds: [], newlyCompletedActIds: [],
      nextChapterId: (Story.nextChapter(state) || {}).id || null,
      campaignCompleted: Story.normalizeState(state).campaignCompleted,
      reason: String(reason || 'abandoned'),
    });
  }

  function validateStoryMatchRequest(request, activityId) {
    var context = object(request.activityContext);
    var attempt = object(context.attempt);
    var chapter = chapterFor(attempt);
    if (request.activityId !== activityId || context.source !== activityId ||
        attempt.schema !== 'StoryAttemptV1' || attempt.source !== activityId || !chapter) {
      throw new TypeError('Invalid ' + activityId + ' activity context');
    }
    var expectedPhysics = chapter.nativeAlien ? 'alien' : 'normal';
    var expectedEvents = !chapter.nativeAlien;
    var rules = object(request.rulesOptions);
    var ruleEvents = object(rules.events);
    var contextEvents = object(context.events);
    var humans = request.roster.filter(function (entry) { return entry.human === true; });
    var cpus = request.roster.filter(function (entry) { return entry.human !== true; });
    if (request.formatId !== 'classic' || request.physicsModeId !== expectedPhysics ||
        attempt.physicsModeId !== expectedPhysics || attempt.arenaId !== chapter.arenaId ||
        context.arenaId !== chapter.arenaId || rules.arenaId !== chapter.arenaId ||
        context.prescribedArena !== true || rules.prescribedArena !== true ||
        contextEvents.enabled !== expectedEvents || contextEvents.nestedEvents !== expectedEvents ||
        ruleEvents.enabled !== expectedEvents || ruleEvents.nestedEvents !== expectedEvents ||
        contextEvents.oddsProfile !== 'normal' || ruleEvents.oddsProfile !== 'normal' ||
        humans.length !== attempt.rosterTemplate.humanCount ||
        cpus.length !== attempt.rosterTemplate.cpuCount ||
        rules.startingLives !== attempt.rosterTemplate.lives ||
        request.roster.some(function (entry) {
          return Number(entry.startingLives) !== attempt.rosterTemplate.lives;
        })) {
      throw new TypeError('Story request violates its prescribed match contract');
    }
    if (attempt.cooperative &&
        (!rules.opponentTargeting || rules.opponentTargeting.excludeAlliedHumans !== true)) {
      throw new TypeError('Co-op Story request must protect the allied human partner');
    }
    return freeze({ chapter: chapter, attempt: attempt });
  }

  function registerStoryActivities(registry, options) {
    var opts = object(options);
    var storyStore = opts.storyStore;
    if (!registry || typeof registry.register !== 'function') {
      throw new TypeError('ActivityRegistry is required');
    }
    if (!storyStore || typeof storyStore.snapshot !== 'function') {
      throw new TypeError('Story state store is required');
    }
    ['story', 'rival-board'].forEach(function (activityId) {
      registry.register({
        id: activityId,
        prepare: function (payload) {
          var request = object(payload).request;
          var context = object(request.activityContext);
          validateStoryMatchRequest(request, activityId);
          return freeze({
            schema: 'PreparedStoryActivityV1', attempt: context.attempt,
            replay: context.replay === true,
            broadcast: View.broadcastCard({ attempt: context.attempt,
              replay: context.replay === true }),
          });
        },
        resolve: function (payload) {
          var source = object(payload);
          var request = source.request;
          var outcome = source.outcome;
          if (!outcome || outcome.status !== 'completed') {
            return abandonedResolution(storyStore.snapshot(), request,
              outcome && outcome.completionReason);
          }
          return Story.resolveAttempt(storyStore.snapshot(),
            request.activityContext.attempt, outcome);
        },
        abandon: function (payload) {
          var source = object(payload);
          return abandonedResolution(storyStore.snapshot(), source.request, source.reason);
        },
      });
    });
    return registry;
  }

  function ordinaryRewardInput(command) {
    var request = command.request;
    var outcome = command.outcome;
    var resolution = command.activityResolution;
    var telemetry = object(outcome.telemetry);
    var humanCount = request.roster.filter(function (entry) { return entry.human === true; }).length;
    return Object.assign({}, clone(telemetry.rewardInput || {}), {
      status: outcome.status,
      completed: outcome.status === 'completed',
      resolved: outcome.status === 'completed',
      activityId: request.activityId,
      formatId: request.formatId,
      humanCount: humanCount,
      humanPlayers: humanCount,
      startingLives: request.rulesOptions.startingLives,
      qualifiedManualHumanFlips: Number(telemetry.qualifiedManualHumanFlips) || 0,
      performanceMultiplier: Number(telemetry.performanceMultiplier) || 1,
      humanWon: resolution.success === true,
      result: resolution.success === true ? 'human-win' : 'loss',
      testData: false,
    });
  }

  function createProfileCommands(command) {
    var resolution = object(command.activityResolution);
    var context = object(command.request && command.request.activityContext);
    if (resolution.abandoned === true || resolution.duplicate === true || context.replay === true) {
      return freeze([]);
    }
    return freeze([freeze({
      kind: 'claimStoryMatchResolution',
      input: freeze({
        matchId: command.matchId,
        ordinaryRewardsEligible: resolution.ordinaryRewardsEligible === true &&
          command.request.activityId === 'story',
        rewardInput: ordinaryRewardInput(command),
        rewards: freeze((Array.isArray(resolution.rewards) ? resolution.rewards : []).map(clone)),
      }),
    })]);
  }

  function executeProfileCommands(profileStore, commands) {
    return commands.map(function (command) {
      var result;
      if (command.kind === 'claimStoryMatchResolution') {
        result = profileStore.claimStoryMatchResolution(command.input);
      } else {
        throw new RangeError('Unknown Story profile command: ' + command.kind);
      }
      if (result && result.reason === 'persistence-failed') {
        throw new Error('Profile persistence failed for ' + command.kind);
      }
      return freeze({ command: clone(command), result: clone(result) });
    });
  }

  function createStoryRuntime(options) {
    var opts = object(options);
    var profileStore = opts.profileStore || Profile;
    if (!profileStore || typeof profileStore.snapshot !== 'function' ||
        typeof profileStore.claimStoryMatchResolution !== 'function') {
      throw new TypeError('A v1.12 profile store is required');
    }
    var browserStorage = null;
    try { browserStorage = root && root.localStorage ? root.localStorage : null; } catch (_) {}
    var storyStore = opts.storyStore || createStoryStateStore({
      storage: opts.storage || browserStorage, initialState: opts.initialStoryState,
    });
    storyStore.reconcileProfile(profileStore.snapshot());
    storyStore.discoverLevel(profileStore.snapshot().flipLevel);
    var registry = opts.registry || Activity.createActivityRegistry();
    registerStoryActivities(registry, { storyStore: storyStore });

    function transaction(command) {
      var resolution = command.activityResolution;
      var context = object(command.request.activityContext);
      var commands = createProfileCommands(command);
      var commandResults = executeProfileCommands(profileStore, commands);
      var stateResult = resolution.abandoned === true
        ? freeze({ applied: false, duplicate: false, reason: 'abandoned', state: storyStore.snapshot() })
        : storyStore.commitResolution(resolution);
      var replay = context.replay === true;
      var duplicate = resolution.duplicate === true || stateResult.duplicate === true;
      var presentation = View.postMatch({ resolution: resolution, replay: replay });
      return freeze({
        schema: 'StoryProfileTransactionV1', duplicate: duplicate,
        replay: replay, noRewardsReason: duplicate ? 'duplicate' : (replay ? 'replay' : null),
        profileCommands: commands, commandResults: commandResults,
        storyState: stateResult.state, storyCommit: stateResult,
        presentation: presentation,
      });
    }

    var coordinator = Activity.createMatchSessionCoordinator({
      registry: registry,
      transaction: transaction,
      statsSink: typeof opts.statsSink === 'function' ? opts.statsSink : function () {},
    });
    var activeMatchIds = new Set();

    function createMatchRequest(input) {
      return buildRequest({ input: input, storyStore: storyStore, profileStore: profileStore });
    }
    function start(input) {
      if (activeMatchIds.size) {
        throw new Error('Finish or leave the active Story match before starting another');
      }
      var request = createMatchRequest(input);
      var session = coordinator.start(request);
      activeMatchIds.add(request.matchId);
      return session;
    }
    function finalize(outcome) {
      var matchId = nonEmpty(object(outcome).matchId, 'matchId');
      return coordinator.finalize(outcome).then(function (resolution) {
        activeMatchIds.delete(matchId);
        return resolution;
      });
    }
    function abandon(matchId, reason) {
      var result = coordinator.abandon(matchId, reason);
      activeMatchIds.delete(String(matchId));
      return result;
    }
    function views() {
      var state = storyStore.snapshot();
      var profile = profileStore.snapshot();
      return freeze({
        hub: View.storyHub(state),
        rivalBoard: View.rivalBoard({ storyState: state }),
        fieldNotes: View.fieldNotes({ profile: profile }),
        alienGate: View.alienGate({ storyState: state, profile: profile }),
      });
    }

    return freeze({
      schema: 'StoryRuntimeV1', registry: registry, coordinator: coordinator,
      storyStore: storyStore, profileStore: profileStore,
      createMatchRequest: createMatchRequest, start: start,
      finalize: finalize, abandon: abandon, views: views,
      discoverForCurrentLevel: function () {
        return storyStore.discoverLevel(profileStore.snapshot().flipLevel);
      },
    });
  }

  return freeze({
    schema: 'StoryRuntimeV1', storageKey: STORY_STORAGE_KEY,
    createStoryStateStore: createStoryStateStore,
    registerStoryActivities: registerStoryActivities,
    validateStoryMatchRequest: validateStoryMatchRequest,
    buildRequest: buildRequest,
    createProfileCommands: createProfileCommands,
    createStoryRuntime: createStoryRuntime,
  });
});
