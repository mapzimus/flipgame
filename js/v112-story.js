// v112-story.js -- Pressure Signal catalog, Rival Board, and campaign reducer.
// Rules, rendering, persistence, and progression are injected by callers.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV112Story = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function () {
  'use strict';

  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }
  function unique(values) { return Array.from(new Set((Array.isArray(values) ? values : []).map(String))); }
  function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }

  var CHAPTERS = freeze([
    { id: 'first-broadcast', act: 1, order: 1, title: 'The First Broadcast', arenaId: 'rooftop',
      preliminaryId: 'wfc-qualifier', rivalId: 'first-light', rivalName: 'Mara Venn', callsign: 'First Light',
      flipperId: 'coffee-mug', cpuTier: 1, clue: 'Offishul WFC Qualifier — doors at seven.' },
    { id: 'scatterline', act: 1, order: 2, title: 'Scatterline', arenaId: 'arcade',
      rivalId: 'scatterline', rivalName: 'Ivo Bell', callsign: 'Scatterline',
      flipperId: 'gumball-machine', cpuTier: 2, clue: 'Geometry is just timing with corners.' },
    { id: 'lane-09', act: 1, order: 3, title: 'Lane 09', arenaId: 'grand-library',
      rivalId: 'meridian', rivalName: 'Safiya Rowan', callsign: 'Meridian',
      flipperId: 'desk-globe', cpuTier: 2, clue: 'LANE 09 — RETURN RECEIVED.' },
    { id: 'under-lights', act: 2, order: 4, title: 'Under the Lights', arenaId: 'sports-locker-room',
      preliminaryId: 'broadcast-heat', rivalId: 'cold-read', rivalName: 'Jules Mercer', callsign: 'Cold Read',
      flipperId: 'penguin', cpuTier: 3, clue: 'The replay clock lost eleven seconds.' },
    { id: 'true-axis', act: 2, order: 5, title: 'True Axis', arenaId: 'neon-grid',
      rivalId: 'true-axis', rivalName: 'Niko Arden', callsign: 'True Axis',
      flipperId: 'desk-gyroscope', cpuTier: 3, clue: 'INBOUND VECTOR — SOURCE ABOVE ARRAY.' },
    { id: 'standard-bearer', act: 2, order: 6, title: 'Standard Bearer', arenaId: 'movie-soundstage',
      rivalId: 'standard-bearer', rivalName: 'Reina Sol', callsign: 'Standard Bearer',
      flipperId: 'trophy-cup', cpuTier: 4, clue: 'EIGHT ENTRIES. NINE RETURNS. REVIEW OPEN.' },
    { id: 'case-50a', act: 3, order: 7, title: 'Case 50-A', arenaId: 'space-station',
      preliminaryId: 'instrumented-heat', rivalId: 'fine-point', rivalName: 'Dr. Arun Vale', callsign: 'Fine Point',
      flipperId: 'microscope', cpuTier: 5, clue: 'MASS VERIFIED. TRAJECTORY DID NOT COMPLY.' },
    { id: 'white-noise', act: 3, order: 8, title: 'White Noise', arenaId: 'ice-cave',
      rivalId: 'white-noise', rivalName: 'Inez Park', callsign: 'White Noise',
      flipperId: 'snow-globe', cpuTier: 5, clue: 'LOCAL AIR: STILL.' },
    { id: 'high-water', act: 3, order: 9, title: 'High Water', arenaId: 'island-beach',
      rivalId: 'high-water', rivalName: 'Beck Holloway', callsign: 'High Water',
      flipperId: 'huge-rubber-duck', cpuTier: 6, clue: 'VOLUME ACCOUNTED FOR. AGAIN.' },
    { id: 'nine-tracks', act: 4, order: 10, title: 'Nine Tracks', arenaId: 'storm-table',
      preliminaryId: 'wfc-semifinal', rivalId: 'ensemble', rivalName: 'Ren Damar', callsign: 'Ensemble',
      flipperId: 'action-figures', cpuTier: 6, clue: 'SUBJECTS: 8 / TRACKS: 9.' },
    { id: 'deep-time', act: 4, order: 11, title: 'Deep Time', arenaId: 'stadium-night',
      preliminaryId: 'wfc-final', rivalId: 'deep-time', rivalName: 'Talia Quill', callsign: 'Deep Time',
      flipperId: 'trex', cpuTier: 7, clue: 'ORIGINAL MODEL. ORIGINAL MASS. NEW SHADOW.' },
    { id: 'visitor-zero', act: 4, order: 12, title: 'Visitor Zero', arenaId: 'aurora-stage',
      rivalId: 'visitor-zero', rivalName: 'Veyr', callsign: 'Visitor Zero',
      flipperId: 'alien', cpuTier: 8, nativeAlien: true,
      clue: 'NO SEED / NO FEDERATION / SIGNAL VERIFIED.' },
  ]);
  var INVITATIONS = freeze([
    ['first-light', 5], ['scatterline', 13], ['meridian', 21], ['cold-read', 29],
    ['true-axis', 37], ['standard-bearer', 45], ['fine-point', 50],
    ['white-noise', 61], ['high-water', 71], ['ensemble', 81],
    ['deep-time', 91], ['visitor-zero', 100],
  ].map(function (row) { return { rivalId: row[0], level: row[1] }; }));
  var BY_CHAPTER = Object.create(null);
  var BY_RIVAL = Object.create(null);
  CHAPTERS.forEach(function (chapter) { BY_CHAPTER[chapter.id] = chapter; BY_RIVAL[chapter.rivalId] = chapter; });

  function defaultState() {
    return freeze({
      schema: 'StoryStateV1',
      clearedPreliminaryIds: [],
      defeatedRivalIds: [],
      discoveredRivalIds: [],
      clearedChapterIds: [],
      completedActIds: [],
      resolvedAttemptIds: [],
      claimedRewardIds: [],
      lastCheckpoint: null,
      alienDefeated: false,
      campaignCompleted: false,
    });
  }

  function known(values, dictionary) {
    return unique(values).filter(function (id) { return !!dictionary[id]; });
  }

  function recompute(value) {
    var source = object(value);
    var defeated = known(source.defeatedRivalIds, BY_RIVAL);
    var prelim = unique(source.clearedPreliminaryIds).filter(function (id) {
      return CHAPTERS.some(function (chapter) { return chapter.preliminaryId === id; });
    });
    var cleared = CHAPTERS.filter(function (chapter) {
      return defeated.indexOf(chapter.rivalId) >= 0 &&
        (!chapter.preliminaryId || prelim.indexOf(chapter.preliminaryId) >= 0);
    }).map(function (chapter) { return chapter.id; });
    var acts = [1, 2, 3, 4].filter(function (act) {
      return CHAPTERS.filter(function (chapter) { return chapter.act === act; })
        .every(function (chapter) { return cleared.indexOf(chapter.id) >= 0; });
    }).map(String);
    return freeze({
      schema: 'StoryStateV1',
      clearedPreliminaryIds: prelim,
      defeatedRivalIds: defeated,
      discoveredRivalIds: known((source.discoveredRivalIds || []).concat(defeated), BY_RIVAL),
      clearedChapterIds: cleared,
      completedActIds: acts,
      resolvedAttemptIds: unique(source.resolvedAttemptIds).slice(-1000),
      claimedRewardIds: unique(source.claimedRewardIds),
      lastCheckpoint: source.lastCheckpoint == null ? null : String(source.lastCheckpoint),
      alienDefeated: defeated.indexOf('visitor-zero') >= 0,
      campaignCompleted: cleared.length === CHAPTERS.length,
    });
  }

  function normalizeState(value) { return recompute(value || defaultState()); }

  function nextChapter(state) {
    var current = normalizeState(state);
    return CHAPTERS.find(function (chapter) {
      return current.clearedChapterIds.indexOf(chapter.id) < 0;
    }) || null;
  }

  function discoverForLevel(state, level) {
    var current = normalizeState(state);
    var discovered = current.discoveredRivalIds.slice();
    var newlyDiscovered = [];
    INVITATIONS.forEach(function (invitation) {
      if (Number(level) >= invitation.level && discovered.indexOf(invitation.rivalId) < 0) {
        discovered.push(invitation.rivalId);
        newlyDiscovered.push(invitation.rivalId);
      }
    });
    return freeze({ state: recompute(Object.assign({}, current, { discoveredRivalIds: discovered })),
      newlyDiscovered: freeze(newlyDiscovered) });
  }

  function prepareAttempt(state, input) {
    var current = normalizeState(state);
    var source = object(input);
    var attemptId = String(source.attemptId || '').trim();
    if (!attemptId) throw new TypeError('attemptId is required');
    var route = source.source === 'rival-board' ? 'rival-board' : 'story';
    var chapter = source.chapterId ? BY_CHAPTER[String(source.chapterId)]
      : BY_RIVAL[String(source.rivalId)];
    if (!chapter) throw new TypeError('Unknown Story chapter or rival');
    if (route === 'rival-board' && current.discoveredRivalIds.indexOf(chapter.rivalId) < 0) {
      throw new Error('Rival is not discovered: ' + chapter.rivalId);
    }
    if (route === 'story') {
      var frontier = nextChapter(current);
      var replay = current.clearedChapterIds.indexOf(chapter.id) >= 0;
      if (!replay && frontier && frontier.id !== chapter.id) throw new Error('Story chapter is not available');
    }
    var matchKind = String(source.matchKind || (chapter.preliminaryId ? 'preliminary' : 'signature'));
    if (matchKind !== 'preliminary' && matchKind !== 'signature') throw new TypeError('Unknown matchKind');
    if (matchKind === 'preliminary' && !chapter.preliminaryId) throw new Error('Chapter has no preliminary');
    var cooperative = source.cooperative === true;
    var rosterTemplate = cooperative
      ? { humanCount: 2, cpuCount: 6, lives: 10, format: 'classic' }
      : (matchKind === 'preliminary'
        ? { humanCount: 1, cpuCount: 7, lives: 10, format: 'classic' }
        : { humanCount: 1, cpuCount: 1, lives: 3, format: 'classic' });
    return freeze({ schema: 'StoryAttemptV1', attemptId: attemptId, source: route,
      chapterId: chapter.id, rivalId: chapter.rivalId, matchKind: matchKind,
      cooperative: cooperative, alliedHumanIds: unique(source.alliedHumanIds),
      rosterTemplate: rosterTemplate, arenaId: chapter.arenaId,
      cpuTier: chapter.cpuTier, physicsModeId: chapter.nativeAlien ? 'alien' : 'normal',
      eventsEnabled: !chapter.nativeAlien, seed: (Number(source.seed) || 1) >>> 0 });
  }

  function pushReward(rewards, claims, id, reward) {
    if (claims.indexOf(id) >= 0) return false;
    claims.push(id);
    rewards.push(Object.assign({ claimId: id }, reward));
    return true;
  }

  function resolveAttempt(state, attemptInput, outcomeInput) {
    var before = normalizeState(state);
    var attempt = attemptInput && attemptInput.schema === 'StoryAttemptV1'
      ? attemptInput : prepareAttempt(before, attemptInput);
    if (before.resolvedAttemptIds.indexOf(attempt.attemptId) >= 0) {
      return freeze({ schema: 'StoryResolutionV1', duplicate: true, success: false,
        state: before, rewards: [], newlyClearedChapterIds: [], newlyCompletedActIds: [] });
    }
    var outcome = object(outcomeInput);
    var completed = outcome.status === 'completed' || outcome.completed === true;
    var winners = unique(outcome.winnerIds);
    var allied = attempt.alliedHumanIds;
    var success = completed && allied.some(function (id) { return winners.indexOf(id) >= 0; });
    var next = clone(before);
    next.resolvedAttemptIds.push(attempt.attemptId);
    next.lastCheckpoint = attempt.chapterId;
    var chapter = BY_CHAPTER[attempt.chapterId];
    if (next.discoveredRivalIds.indexOf(chapter.rivalId) < 0) next.discoveredRivalIds.push(chapter.rivalId);
    var rewards = [];
    var claims = next.claimedRewardIds;
    if (success && attempt.matchKind === 'preliminary' &&
        next.clearedPreliminaryIds.indexOf(chapter.preliminaryId) < 0) {
      next.clearedPreliminaryIds.push(chapter.preliminaryId);
    }
    if (success && attempt.matchKind === 'signature' &&
        next.defeatedRivalIds.indexOf(chapter.rivalId) < 0) {
      next.defeatedRivalIds.push(chapter.rivalId);
      var isAlien = chapter.rivalId === 'visitor-zero';
      pushReward(rewards, claims, 'rival.' + chapter.rivalId + '.first-clear', {
        type: 'rival-first-clear', rivalId: chapter.rivalId, objectId: chapter.flipperId,
        fxp: isAlien ? 75 : 25, fc: isAlien ? 50 : 15,
      });
    }
    var afterCore = recompute(next);
    var newChapters = afterCore.clearedChapterIds.filter(function (id) {
      return before.clearedChapterIds.indexOf(id) < 0;
    });
    var newActs = afterCore.completedActIds.filter(function (id) {
      return before.completedActIds.indexOf(id) < 0;
    });
    next = clone(afterCore);
    claims = next.claimedRewardIds;
    newActs.forEach(function (actId) {
      pushReward(rewards, claims, 'story.act.' + actId + '.first-clear', {
        type: 'act-first-clear', actId: Number(actId), fxp: 50, fc: 25,
        fieldNoteId: 'field-note-act-' + actId,
      });
    });
    var finalState = recompute(next);
    return freeze({ schema: 'StoryResolutionV1', duplicate: false, success: success,
      source: attempt.source, matchKind: attempt.matchKind, chapterId: chapter.id,
      rivalId: chapter.rivalId, ordinaryRewardsEligible: attempt.source === 'story' && completed,
      state: finalState, rewards: rewards, newlyClearedChapterIds: newChapters,
      newlyCompletedActIds: newActs, nextChapterId: (nextChapter(finalState) || {}).id || null,
      campaignCompleted: finalState.campaignCompleted });
  }

  function canSelectAlien(state, flipLevel, grandfathered) {
    return grandfathered === true || (Number(flipLevel) >= 100 && normalizeState(state).alienDefeated);
  }

  function catalogView(state) {
    var current = normalizeState(state);
    var frontier = nextChapter(current);
    return freeze(CHAPTERS.map(function (chapter) {
      var knownRival = current.discoveredRivalIds.indexOf(chapter.rivalId) >= 0 ||
        current.clearedChapterIds.indexOf(chapter.id) >= 0 || (frontier && frontier.id === chapter.id);
      if (!knownRival) return { locked: true, symbol: '🔒', ariaLabel: 'Locked' };
      return { locked: false, id: chapter.id, act: chapter.act, title: chapter.title,
        rivalId: chapter.rivalId, rivalName: chapter.rivalName, callsign: chapter.callsign,
        flipperId: chapter.flipperId, arenaId: chapter.arenaId,
        cleared: current.clearedChapterIds.indexOf(chapter.id) >= 0 };
    }));
  }

  return freeze({ schema: 'StoryCatalogV1', chapters: CHAPTERS, invitations: INVITATIONS,
    defaultState: defaultState, normalizeState: normalizeState, nextChapter: nextChapter,
    discoverForLevel: discoverForLevel, prepareAttempt: prepareAttempt,
    resolveAttempt: resolveAttempt, canSelectAlien: canSelectAlien,
    catalogView: catalogView });
});
