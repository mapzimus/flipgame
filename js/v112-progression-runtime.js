// v112-progression-runtime.js -- one live V4 ownership, reveal, and owner-test boundary.
(function (root, factory) {
  'use strict';
  if (root && root.FlipgameV112ProgressionRuntime &&
      root.FlipgameV112ProgressionRuntime.schema === 'ProgressionRuntimeV1') {
    if (typeof module === 'object' && module.exports) module.exports = root.FlipgameV112ProgressionRuntime;
    return;
  }
  var Catalog = root && root.FlipgameV112ProgressionCatalog;
  var Economy = root && root.FlipgameV112Economy;
  var Profile = root && root.FlipgameV112Profile;
  var Backup = root && root.FlipgameV112ProfileBackup;
  if (typeof module === 'object' && module.exports) {
    Catalog = require('./v112-progression-catalog.js');
    Economy = require('./v112-economy.js');
    Profile = require('./v112-profile.js');
    try { Backup = require('./v112-profile-backup.js'); } catch (_) { Backup = null; }
  }
  var api = factory(Catalog, Economy, Profile, Backup);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV112ProgressionRuntime = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (Catalog, Economy, Profile, Backup) {
  'use strict';
  if (!Catalog || !Economy || !Profile) {
    throw new Error('v1.12 catalog, economy, and profile must load before progression runtime');
  }

  var OWNER_CODE = 'Howe Test Mode';
  var LOCKED = Object.freeze({ locked: true, symbol: '🔒', ariaLabel: 'Locked' });
  var FEATURE_NAMES = Object.freeze({
    'physics-lab': 'Physics Lab',
    alien: 'Alien',
    'insane-mode': 'INSANE MODE',
  });

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }
  function unique(values) {
    var seen = new Set();
    return (Array.isArray(values) ? values : []).map(String).filter(function (id) {
      if (!id || seen.has(id)) return false;
      seen.add(id); return true;
    });
  }
  function noMutation(state, reason, extra) {
    return freeze(Object.assign({ applied: false, duplicate: false, claimId: null,
      reason: reason, testData: reason === 'owner-test-mode', state: state }, extra || {}));
  }
  function lockedView() { return LOCKED; }

  function createRuntime(options) {
    var opts = options || {};
    // Production uses Profile.defaultStore.  Tests may inject exactly one store;
    // this runtime never constructs or mirrors a second progression store.
    var store = opts.profileStore || Profile.defaultStore;
    if (!store || typeof store.snapshot !== 'function' || typeof store.subscribe !== 'function') {
      throw new TypeError('progression runtime requires one authoritative V4 profile store');
    }
    var backup = opts.backupAdapter || Backup;
    var ownerActive = false;
    var listeners = new Set();
    var detach = store.subscribe(function (state, result) {
      emit({ type: 'profile-commit', result: result, earnedState: state });
    });

    function earnedSnapshot() { return store.snapshot(); }
    function isObjectAvailable(id) {
      var objectId = Catalog.canonicalObjectId(id);
      if (!Catalog.object(objectId)) return false;
      if (ownerActive) return true;
      var state = earnedSnapshot();
      if (objectId === 'alien') return Profile.isAlienUsable(state);
      return state.ownedObjectIds.indexOf(objectId) >= 0;
    }
    function isArenaAvailable(id) {
      var arenaId = Catalog.canonicalArenaId(id);
      return !!Catalog.arena(arenaId) && (ownerActive || earnedSnapshot().ownedArenaIds.indexOf(arenaId) >= 0);
    }
    function isCosmeticAvailable(id) {
      return !!Catalog.storeCosmetic(id) &&
        (ownerActive || earnedSnapshot().ownedCosmeticIds.indexOf(String(id)) >= 0);
    }
    function isFeatureAvailable(id) {
      var featureId = String(id || '');
      if (!FEATURE_NAMES[featureId]) return false;
      if (ownerActive) return true;
      var state = earnedSnapshot();
      if (featureId === 'alien') return Profile.isAlienUsable(state);
      if (featureId === 'insane-mode') return Profile.isInsaneUsable(state);
      return state.featureIds.indexOf(featureId) >= 0;
    }
    function effectiveSnapshot() {
      var earned = earnedSnapshot();
      if (!ownerActive) return earned;
      return freeze(Object.assign({}, clone(earned), {
        ownerTestMode: true,
        testData: true,
        rewardsEligible: false,
        ownedObjectIds: Catalog.objectIds.slice(),
        ownedArenaIds: Catalog.arenaIds.slice(),
        ownedCosmeticIds: Catalog.storeCosmetics.map(function (item) { return item.id; }),
        featureIds: unique(earned.featureIds.concat(['physics-lab', 'insane-mode'])),
      }));
    }
    function objectView(entry) {
      if (!isObjectAvailable(entry.id)) return lockedView();
      return freeze({ locked: false, id: entry.id, displayName: entry.displayName,
        ariaLabel: entry.displayName,
        variants: Catalog.variantIdsFor(entry.id).map(function (id) {
          var item = Catalog.variant(entry.id, id);
          return freeze({ locked: false, id: item.id, objectId: item.objectId,
            variantId: item.variantId, displayName: item.displayName,
            color: item.color, ariaLabel: item.displayName });
        }) });
    }
    function viewObject(id) {
      var entry = Catalog.object(id);
      return entry ? objectView(entry) : null;
    }
    function listObjects() {
      return freeze(Catalog.objects.map(objectView));
    }
    function viewVariant(id) {
      var canonical = Catalog.canonicalVariantId(id);
      var split = canonical.indexOf('.');
      if (split < 0) return null;
      var objectId = canonical.slice(0, split);
      var item = Catalog.variant(objectId, canonical);
      if (!item) return null;
      return isObjectAvailable(objectId) ? freeze({ locked: false, id: item.id,
        objectId: item.objectId, variantId: item.variantId,
        displayName: item.displayName, color: item.color, ariaLabel: item.displayName }) : lockedView();
    }
    function arenaView(entry) {
      if (!isArenaAvailable(entry.id)) return lockedView();
      return freeze({ locked: false, id: entry.id, displayName: entry.displayName,
        ariaLabel: entry.displayName });
    }
    function viewArena(id) {
      var entry = Catalog.arena(id);
      return entry ? arenaView(entry) : null;
    }
    function listArenas() {
      return freeze(Catalog.arenaIds.map(function (id) { return arenaView(Catalog.arena(id)); }));
    }
    function viewFeature(id) {
      var featureId = String(id || '');
      if (!FEATURE_NAMES[featureId]) return null;
      if (!isFeatureAvailable(featureId)) return lockedView();
      return freeze({ locked: false, id: featureId, displayName: FEATURE_NAMES[featureId],
        ariaLabel: FEATURE_NAMES[featureId] });
    }
    function viewStore() {
      var state = earnedSnapshot();
      return freeze(Catalog.storeCosmetics.map(function (item) {
        var owned = isCosmeticAvailable(item.id);
        return freeze({ id: item.id, type: item.type, displayName: item.displayName,
          price: item.price, currency: item.currency, owned: owned,
          affordable: ownerActive || owned || state.fcBalance >= item.price });
      }));
    }
    function ownerProjection() {
      if (!ownerActive) return null;
      var variantsByObject = {};
      var variantIds = [];
      Catalog.objectIds.forEach(function (id) {
        variantsByObject[id] = Catalog.variantIdsFor(id);
        variantIds = variantIds.concat(variantsByObject[id]);
      });
      return freeze({ schema: 'OwnerTestProjectionV1', version: 1,
        active: true, ephemeral: true, testData: true, rewardsEligible: false,
        statisticsDefaultIncluded: false, achievementPreviewOnly: true,
        objectIds: Catalog.objectIds.slice(), variantIds: variantIds,
        variantsByObject: variantsByObject, arenaIds: Catalog.arenaIds.slice(),
        cosmeticIds: Catalog.storeCosmetics.map(function (item) { return item.id; }),
        featureIds: ['physics-lab', 'alien', 'insane-mode'],
        counts: { objects: Catalog.objectIds.length, variants: variantIds.length,
          arenas: Catalog.arenaIds.length, cosmetics: Catalog.storeCosmetics.length },
      });
    }
    function activityPolicy(input) {
      var source = input && typeof input === 'object' ? clone(input) : {};
      if (!ownerActive) return freeze(source);
      return freeze(Object.assign(source, {
        activityId: source.activityId || 'owner-test',
        ownerTest: true, ownerTestMode: true, testData: true,
        rewardsEligible: false, progressionEligible: false,
        achievementsEligible: false, statisticsDefaultIncluded: false,
      }));
    }
    function emit(event) {
      var snapshot = effectiveSnapshot();
      listeners.forEach(function (listener) {
        try { listener(snapshot, freeze(Object.assign({ ownerTestMode: ownerActive }, event))); }
        catch (_) {}
      });
    }
    function subscribe(listener, options) {
      if (typeof listener !== 'function') throw new TypeError('progression subscriber must be a function');
      listeners.add(listener);
      if (!options || options.emitCurrent !== false) {
        listener(effectiveSnapshot(), freeze({ type: 'current', ownerTestMode: ownerActive }));
      }
      return function () { listeners.delete(listener); };
    }
    function activateOwnerTestMode(value) {
      if (typeof value !== 'string' || value !== OWNER_CODE) {
        return freeze({ activated: false, reason: 'exact-code-required', active: ownerActive });
      }
      if (!ownerActive) { ownerActive = true; emit({ type: 'owner-test-activated' }); }
      return freeze({ activated: true, active: true, projection: ownerProjection() });
    }
    function deactivateOwnerTestMode() {
      var changed = ownerActive;
      ownerActive = false;
      if (changed) emit({ type: 'owner-test-deactivated' });
      return freeze({ deactivated: changed, active: false });
    }
    function blocked() { return noMutation(earnedSnapshot(), 'owner-test-mode'); }
    function claimMatch(matchId, rewardInput) {
      return ownerActive ? blocked() : store.claimMatch(matchId, rewardInput);
    }
    function claimAchievement(id, rarity) {
      return ownerActive ? blocked() : store.claimAchievement(id, rarity);
    }
    function claimRivalVictory(id, claimId) {
      return ownerActive ? blocked() : store.claimRivalVictory(id, claimId);
    }
    function claimStoryAct(id, noteId, claimId) {
      return ownerActive ? blocked() : store.claimStoryAct(id, noteId, claimId);
    }
    function claimStoryReward(reward) {
      return ownerActive ? blocked() : store.claimStoryReward(reward);
    }
    function claimStoryMatchResolution(resolution) {
      return ownerActive ? blocked() : store.claimStoryMatchResolution(resolution);
    }
    function purchaseCosmetic(id) {
      return ownerActive ? blocked() : store.purchaseCosmetic(id);
    }
    function revealDescriptor(id) {
      var value = String(id || '');
      var match = /^level\.(\d+)\.fc$/.exec(value);
      if (match) return freeze({ id: value, type: 'fc', level: Number(match[1]),
        amount: Catalog.levelFc[match[1]] || 0, displayName: 'Flip Credits' });
      if (value.indexOf('object.') === 0) {
        var object = Catalog.object(value.slice(7));
        return object ? freeze({ id: value, type: 'object', contentId: object.id,
          level: object.level, displayName: object.displayName }) : null;
      }
      if (value.indexOf('arena.') === 0) {
        var arena = Catalog.arena(value.slice(6));
        return arena ? freeze({ id: value, type: 'arena', contentId: arena.id,
          level: arena.level, displayName: arena.displayName }) : null;
      }
      if (value.indexOf('feature.') === 0) {
        var featureId = value.slice(8);
        return FEATURE_NAMES[featureId] ? freeze({ id: value, type: 'feature',
          contentId: featureId, level: featureId === 'physics-lab' ? 50 : 100,
          displayName: FEATURE_NAMES[featureId] }) : null;
      }
      if (value.indexOf('achievement.') === 0) return freeze({ id: value,
        type: 'achievement', contentId: value.slice(12), displayName: 'Achievement earned' });
      if (value.indexOf('store.') === 0) {
        var cosmetic = Catalog.storeCosmetic(value.slice(6));
        return cosmetic ? freeze({ id: value, type: 'store', contentId: cosmetic.id,
          displayName: cosmetic.displayName }) : null;
      }
      return freeze({ id: value, type: 'reward', displayName: 'Reward available' });
    }
    function pendingReveals() {
      var state = earnedSnapshot();
      return freeze(state.pendingRevealIds.map(revealDescriptor).filter(Boolean));
    }
    function dismissReveal(id) {
      if (ownerActive) return blocked();
      return store.dismissReveals([String(id || '')]);
    }
    function dismissAllReveals() {
      if (ownerActive) return blocked();
      return store.dismissReveals();
    }
    function exportBackup(setupSelection, options) {
      if (!backup || typeof backup.serialize !== 'function') throw new Error('v1.12 profile backup is unavailable');
      return backup.serialize(store, setupSelection, options);
    }
    function importBackup(value, currentSetup, options) {
      if (ownerActive) return blocked();
      if (!backup || typeof backup.importInto !== 'function') throw new Error('v1.12 profile backup is unavailable');
      return backup.importInto(value, store, currentSetup, options);
    }
    function close() {
      if (typeof detach === 'function') detach();
      listeners.clear(); ownerActive = false;
    }

    return freeze({
      schema: 'ProgressionRuntimeV1', version: 1,
      snapshot: effectiveSnapshot, earnedSnapshot: earnedSnapshot,
      refresh: store.refresh, subscribe: subscribe, close: close,
      listObjects: listObjects, viewObject: viewObject, viewVariant: viewVariant,
      listArenas: listArenas, viewArena: viewArena, viewFeature: viewFeature,
      viewStore: viewStore, isObjectAvailable: isObjectAvailable,
      isArenaAvailable: isArenaAvailable, isCosmeticAvailable: isCosmeticAvailable,
      isFeatureAvailable: isFeatureAvailable,
      activateOwnerTestMode: activateOwnerTestMode,
      deactivateOwnerTestMode: deactivateOwnerTestMode,
      ownerProjection: ownerProjection, activityPolicy: activityPolicy,
      claimMatch: claimMatch, claimAchievement: claimAchievement,
      claimRivalVictory: claimRivalVictory, claimStoryAct: claimStoryAct,
      claimStoryReward: claimStoryReward,
      claimStoryMatchResolution: claimStoryMatchResolution,
      purchaseCosmetic: purchaseCosmetic,
      pendingReveals: pendingReveals, dismissReveal: dismissReveal,
      dismissAllReveals: dismissAllReveals,
      exportState: earnedSnapshot, exportBackup: exportBackup, importBackup: importBackup,
    });
  }

  var defaultRuntime = createRuntime({ profileStore: Profile.defaultStore, backupAdapter: Backup });
  return freeze({
    schema: 'ProgressionRuntimeV1', version: 1,
    createRuntime: createRuntime, defaultRuntime: defaultRuntime,
  });
});
