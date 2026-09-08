// v112-profile.js -- canonical transactional local profile and v1.11 migration.
(function (root, factory) {
  'use strict';
  if (root && root.FlipgameV112Profile &&
      root.FlipgameV112Profile.schema === 'ProgressionStateV4') {
    if (typeof module === 'object' && module.exports) module.exports = root.FlipgameV112Profile;
    return;
  }
  var Catalog = root && root.FlipgameV112ProgressionCatalog;
  var Economy = root && root.FlipgameV112Economy;
  var LegacyProgression = root && root.FlipgameV111Progression;
  if (typeof module === 'object' && module.exports) {
    Catalog = require('./v112-progression-catalog.js');
    Economy = require('./v112-economy.js');
    LegacyProgression = require('./v111-progression.js');
  }
  var api = factory(Catalog, Economy, LegacyProgression, root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV112Profile = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (Catalog, Economy, LegacyProgression, root) {
  'use strict';
  if (!Catalog || !Economy || !LegacyProgression) {
    throw new Error('v1.12 catalog, economy, and frozen v1.11 progression must load before profile');
  }

  var KEY = 'flipgame.profile.v4';
  var LEGACY_KEYS = Object.freeze({
    progression: 'flipgame.progression.v3', recordsV2: 'flipgame.records.v2',
    recordsV1: 'flipgame.records.v1', achievementsV3: 'flipgame.achievements.v3',
    achievementsV1: 'flipgame.achievements.v1', setupV2: 'flipgame.setup.v2',
  });
  var FC_KINDS = new Set(['earn', 'spend', 'migration']);
  var FC_SOURCES = new Set(['match', 'achievement', 'level', 'cosmetic-purchase', 'migration', 'rival', 'story-act']);
  var STORY_ACT_IDS = Object.freeze(['1', '2', '3', '4']);

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }
  function parse(value, fallback) {
    if (value == null || value === '') return fallback;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }
  function finiteInteger(value) {
    var number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(number)));
  }
  function signedInteger(value) {
    var number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(-Number.MAX_SAFE_INTEGER, Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(number)));
  }
  function uniqueStrings(values, mapper) {
    var output = [];
    var seen = new Set();
    (Array.isArray(values) ? values : []).forEach(function (entry) {
      var value = mapper ? mapper(entry) : String(entry || '');
      value = String(value || '');
      if (!value || seen.has(value)) return;
      seen.add(value); output.push(value);
    });
    return output;
  }
  function addUnique(array, value) {
    var id = String(value || '');
    if (id && array.indexOf(id) < 0) array.push(id);
  }
  function validId(value, label) {
    var id = String(value || '');
    if (!id || id.length > 180 || /[\u0000-\u001f\u007f]/.test(id)) {
      throw new TypeError((label || 'id') + ' must be a non-empty safe identifier');
    }
    return id;
  }
  function exactId(value, label) {
    if (typeof value !== 'string' || value !== value.trim()) {
      throw new TypeError((label || 'id') + ' must be an exact string identifier');
    }
    return validId(value, label);
  }
  function storyActId(value) {
    var id = String(value == null ? '' : value);
    if (STORY_ACT_IDS.indexOf(id) < 0) throw new RangeError('Unknown Story act: ' + id);
    return id;
  }
  function timestamp(value) {
    var number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
  }

  function FcTransactionV1(value) {
    var source = value && typeof value === 'object' ? value : {};
    var kind = String(source.kind || '');
    var sourceType = String(source.sourceType || '');
    var amount = signedInteger(source.signedAmount);
    var balance = finiteInteger(source.balanceAfter);
    if (!FC_KINDS.has(kind)) throw new RangeError('Unknown FC transaction kind');
    if (!FC_SOURCES.has(sourceType)) throw new RangeError('Unknown FC transaction source');
    if (!amount) throw new RangeError('FC transaction amount cannot be zero');
    if (kind === 'earn' && amount < 0) throw new RangeError('FC earn transaction must be positive');
    if (kind === 'spend' && amount > 0) throw new RangeError('FC spend transaction must be negative');
    return freeze({
      schema: 'FcTransactionV1', version: 1,
      txId: validId(source.txId, 'FcTransactionV1.txId'),
      idempotencyKey: validId(source.idempotencyKey || source.txId, 'FcTransactionV1.idempotencyKey'),
      kind: kind, sourceType: sourceType,
      sourceId: validId(source.sourceId, 'FcTransactionV1.sourceId'),
      signedAmount: amount, balanceAfter: balance, timestamp: timestamp(source.timestamp),
    });
  }

  function normalizeTransactions(values, declaredBalance) {
    var output = [];
    var txIds = new Set();
    var keys = new Set();
    var balance = 0;
    (Array.isArray(values) ? values : []).forEach(function (entry) {
      try {
        var raw = Object.assign({}, entry, { balanceAfter: balance + signedInteger(entry.signedAmount) });
        if (raw.balanceAfter < 0) return;
        var tx = FcTransactionV1(raw);
        if (txIds.has(tx.txId) || keys.has(tx.idempotencyKey)) return;
        txIds.add(tx.txId); keys.add(tx.idempotencyKey);
        balance = tx.balanceAfter; output.push(tx);
      } catch (_) {}
    });
    var requested = finiteInteger(declaredBalance);
    if (!output.length && requested > 0) {
      output.push(FcTransactionV1({
        txId: 'migration:unledgered-fc', idempotencyKey: 'migration:unledgered-fc',
        kind: 'migration', sourceType: 'migration', sourceId: 'profile-v4-balance',
        signedAmount: requested, balanceAfter: requested, timestamp: 0,
      }));
      balance = requested;
    }
    return { transactions: output, balance: balance };
  }

  function ProgressionStateV4(value) {
    var source = value && typeof value === 'object' ? value : {};
    var ledger = normalizeTransactions(source.fcTransactions, source.fcBalance);
    var objects = uniqueStrings(['bottle'].concat(source.ownedObjectIds || []), Catalog.canonicalObjectId);
    if (objects.indexOf('bottle') < 0) objects.unshift('bottle');
    var arenas = uniqueStrings(['baseline-table'].concat(source.ownedArenaIds || []), Catalog.canonicalArenaId);
    if (arenas.indexOf('baseline-table') < 0) arenas.unshift('baseline-table');
    var defeated = uniqueStrings(source.defeatedRivalIds);
    var fxp = finiteInteger(source.fxp);
    var legacySource = source.legacy && typeof source.legacy === 'object' ? source.legacy : {};
    var reconciledV111 = !!legacySource.reconciledV111;
    var grandfatheredAlien = Object.prototype.hasOwnProperty.call(legacySource, 'grandfatheredAlien')
      ? !!legacySource.grandfatheredAlien
      : reconciledV111 && objects.indexOf('alien') >= 0;
    var featureIds = uniqueStrings(source.featureIds);
    var grandfatheredInsane = Object.prototype.hasOwnProperty.call(legacySource, 'grandfatheredInsane')
      ? !!legacySource.grandfatheredInsane
      : reconciledV111 && featureIds.indexOf('insane-mode') >= 0;
    if (grandfatheredAlien) addUnique(objects, 'alien');
    if (grandfatheredInsane) addUnique(featureIds, 'insane-mode');
    return freeze({
      schema: 'ProgressionStateV4', version: 4,
      revision: finiteInteger(source.revision),
      fxp: fxp, flipLevel: Economy.flipLevelForFxp(fxp), fcBalance: ledger.balance,
      ownedObjectIds: objects,
      ownedArenaIds: arenas,
      ownedCosmeticIds: uniqueStrings(source.ownedCosmeticIds),
      featureIds: featureIds,
      achievementIds: uniqueStrings(source.achievementIds),
      defeatedRivalIds: defeated,
      completedActIds: uniqueStrings(source.completedActIds),
      fieldNoteIds: uniqueStrings(source.fieldNoteIds),
      claimedRewardIds: uniqueStrings(source.claimedRewardIds),
      processedClaimIds: uniqueStrings(source.processedClaimIds),
      pendingRevealIds: uniqueStrings(source.pendingRevealIds),
      fcTransactions: ledger.transactions,
      legacy: freeze({
        reconciledV111: reconciledV111,
        qualifyingWins: finiteInteger(legacySource.qualifyingWins),
        sourceRelease: String(legacySource.sourceRelease || ''),
        grandfatheredAlien: grandfatheredAlien,
        grandfatheredInsane: grandfatheredInsane,
      }),
    });
  }

  function alienGateSatisfied(value) {
    var state = ProgressionStateV4(value);
    return state.flipLevel >= 100 && state.defeatedRivalIds.indexOf('visitor-zero') >= 0;
  }
  function isAlienUsable(value) {
    var state = ProgressionStateV4(value);
    return state.legacy.grandfatheredAlien || alienGateSatisfied(state);
  }
  function isInsaneUsable(value) {
    var state = ProgressionStateV4(value);
    return state.legacy.grandfatheredInsane || alienGateSatisfied(state);
  }

  function createMemoryStorage(seed) {
    var values = Object.assign({}, seed || {});
    var failNext = false;
    return {
      getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
      setItem: function (key, value) {
        if (failNext) { failNext = false; throw new Error('simulated storage failure'); }
        values[key] = String(value);
      },
      removeItem: function (key) { delete values[key]; },
      failNextWrite: function () { failNext = true; },
      dump: function () { return clone(values); },
    };
  }

  function readStorage(storage, key, fallback) {
    if (!storage || typeof storage.getItem !== 'function') return fallback;
    try { return parse(storage.getItem(key), fallback); } catch (_) { return fallback; }
  }
  function legacyInputs(input) {
    var source = input || {};
    var storage = source.storage || null;
    function choose(name, key, fallback) {
      if (Object.prototype.hasOwnProperty.call(source, name)) return parse(source[name], fallback);
      return readStorage(storage, key, fallback);
    }
    return {
      progression: choose('progression', LEGACY_KEYS.progression, {}),
      recordsV2: choose('recordsV2', LEGACY_KEYS.recordsV2, {}),
      recordsV1: choose('recordsV1', LEGACY_KEYS.recordsV1, {}),
      achievementsV3: choose('achievementsV3', LEGACY_KEYS.achievementsV3, {}),
      achievementsV1: choose('achievementsV1', LEGACY_KEYS.achievementsV1, []),
      setupV2: choose('setupV2', LEGACY_KEYS.setupV2, {}),
    };
  }
  function achievementIds(v3, v1) {
    var ids = [];
    (Array.isArray(v1) ? v1 : []).forEach(function (id) { addUnique(ids, id); });
    var current = v3 && typeof v3 === 'object' ? v3 : {};
    (Array.isArray(current.earned) ? current.earned : []).forEach(function (entry) {
      if (entry && entry.id) addUnique(ids, entry.id);
    });
    return ids;
  }
  function migrateSetupSelection(setup) {
    var output = clone(setup && typeof setup === 'object' ? setup : {});
    function migrateParticipant(row) {
      if (!row || typeof row !== 'object') return row;
      var next = Object.assign({}, row);
      if (next.charId != null) next.charId = Catalog.canonicalObjectId(next.charId);
      if (next.objectId != null) next.objectId = Catalog.canonicalObjectId(next.objectId);
      if (next.skin != null) next.skin = Catalog.canonicalObjectId(next.skin);
      if (next.variantId != null) next.variantId = Catalog.canonicalVariantId(next.variantId);
      return next;
    }
    if (Array.isArray(output.rows)) output.rows = output.rows.map(migrateParticipant);
    if (Array.isArray(output.players)) output.players = output.players.map(migrateParticipant);
    if (Array.isArray(output.roster)) output.roster = output.roster.map(migrateParticipant);
    if (output.selectedObjectId != null) output.selectedObjectId = Catalog.canonicalObjectId(output.selectedObjectId);
    if (output.selectedSkin != null) output.selectedSkin = Catalog.canonicalObjectId(output.selectedSkin);
    if (output.selectedVariantId != null) output.selectedVariantId = Catalog.canonicalVariantId(output.selectedVariantId);
    if (output.visualArenaId != null) output.visualArenaId = Catalog.canonicalArenaId(output.visualArenaId);
    if (output.arenaId != null) output.arenaId = Catalog.canonicalArenaId(output.arenaId);
    return freeze(output);
  }

  function appendFc(draft, value) {
    var amount = signedInteger(value.signedAmount);
    if (!amount) return null;
    var nextBalance = draft.fcBalance + amount;
    if (nextBalance < 0) throw new RangeError('Insufficient Flip Credits');
    if (!Number.isSafeInteger(nextBalance)) throw new RangeError('Flip Credit balance exceeds the supported range');
    var tx = FcTransactionV1(Object.assign({}, value, { balanceAfter: nextBalance }));
    if (draft.fcTransactions.some(function (entry) {
      return entry.txId === tx.txId || entry.idempotencyKey === tx.idempotencyKey;
    })) return null;
    draft.fcTransactions.push(tx);
    draft.fcBalance = nextBalance;
    return tx;
  }
  function grantAlienGate(draft, reveal) {
    if (draft.flipLevel < 100 || draft.defeatedRivalIds.indexOf('visitor-zero') < 0) return [];
    var granted = [];
    if (draft.ownedObjectIds.indexOf('alien') < 0) {
      draft.ownedObjectIds.push('alien'); granted.push('object.alien');
    }
    if (draft.featureIds.indexOf('insane-mode') < 0) {
      draft.featureIds.push('insane-mode'); granted.push('feature.insane-mode');
    }
    addUnique(draft.claimedRewardIds, 'condition.alien-defeated-at-level-100');
    if (reveal) granted.forEach(function (id) { addUnique(draft.pendingRevealIds, id); });
    return granted;
  }
  function grantLevel(draft, level, options) {
    var opts = options || {};
    var granted = [];
    Catalog.rewardsAtLevel(level).forEach(function (reward) {
      if (draft.claimedRewardIds.indexOf(reward.id) >= 0) return;
      addUnique(draft.claimedRewardIds, reward.id);
      if (reward.type === 'object') {
        addUnique(draft.ownedObjectIds, reward.contentId); granted.push('object.' + reward.contentId);
      } else if (reward.type === 'arena') {
        addUnique(draft.ownedArenaIds, reward.contentId); granted.push('arena.' + reward.contentId);
      } else if (reward.type === 'feature') {
        addUnique(draft.featureIds, reward.contentId); granted.push('feature.' + reward.contentId);
      } else if (reward.type === 'fc') {
        appendFc(draft, {
          txId: 'level:' + level + ':fc', idempotencyKey: 'level:' + level + ':fc',
          kind: opts.migration ? 'migration' : 'earn', sourceType: 'level', sourceId: 'level:' + level,
          signedAmount: reward.amount, timestamp: opts.now,
        });
        granted.push(reward.id);
      }
    });
    draft.flipLevel = Economy.flipLevelForFxp(draft.fxp);
    if (opts.reveal) granted.forEach(function (id) { addUnique(draft.pendingRevealIds, id); });
    return granted;
  }
  function grantLevelsCrossed(draft, previousLevel, options) {
    var granted = [];
    for (var level = Math.max(2, finiteInteger(previousLevel) + 1); level <= draft.flipLevel; level++) {
      granted = granted.concat(grantLevel(draft, level, options));
    }
    return granted;
  }

  function migrateV111(input) {
    var legacy = legacyInputs(input);
    var ids = achievementIds(legacy.achievementsV3, legacy.achievementsV1);
    var v3 = legacy.progression && typeof legacy.progression === 'object' ? clone(legacy.progression) : {};
    var wins = Math.max(finiteInteger(v3.qualifyingWins), finiteInteger(legacy.recordsV2.qualifyingWins),
      finiteInteger(legacy.recordsV1.totalWins));
    v3.qualifyingWins = wins;
    var legacyRecords = Object.assign({}, legacy.recordsV1, {
      totalWins: wins,
      unlockedSkins: uniqueStrings((legacy.recordsV1.unlockedSkins || []).concat(v3.ownedObjectIds || [])),
    });
    var reconciled = LegacyProgression.migrate({
      progression: v3, legacyRecords: legacyRecords,
      legacyAchievements: uniqueStrings(ids.concat(v3.achievementIds || [])),
    });
    var reconciledObjects = uniqueStrings(reconciled.ownedObjectIds, Catalog.canonicalObjectId);
    var reconciledClaims = uniqueStrings(reconciled.claimedRewardIds);
    var grandfatheredAlien = reconciledObjects.indexOf('alien') >= 0 ||
      reconciledClaims.indexOf('object.alien') >= 0;
    var grandfatheredInsane = reconciledClaims.indexOf('feature.insane-mode') >= 0;
    var draft = clone(ProgressionStateV4({
      fxp: Economy.fxpThresholdForLevel(Math.max(1, Math.min(100, wins))),
      ownedObjectIds: reconciledObjects,
      achievementIds: uniqueStrings((reconciled.achievementIds || []).concat(ids)),
      claimedRewardIds: reconciledClaims,
      legacy: { reconciledV111: true, qualifyingWins: wins, sourceRelease: 'v1.11',
        grandfatheredAlien: grandfatheredAlien, grandfatheredInsane: grandfatheredInsane },
    }));

    (reconciled.claimedRewardIds || []).forEach(function (claim) {
      var id = String(claim || '');
      if (id.indexOf('object.') === 0) addUnique(draft.ownedObjectIds, Catalog.canonicalObjectId(id.slice(7)));
      else if (id.indexOf('feature.') === 0) addUnique(draft.featureIds, id.slice(8));
    });
    (reconciled.ownedCosmeticIds || []).forEach(function (id) {
      var value = String(id || '');
      if (value.indexOf('arena.') === 0) addUnique(draft.ownedArenaIds, Catalog.canonicalArenaId(value));
      else addUnique(draft.ownedCosmeticIds, value);
    });
    draft.ownedObjectIds = uniqueStrings(draft.ownedObjectIds, Catalog.canonicalObjectId);
    draft.flipLevel = Economy.flipLevelForFxp(draft.fxp);
    for (var level = 2; level <= draft.flipLevel; level++) grantLevel(draft, level, { migration: true, reveal: false, now: 0 });
    draft.pendingRevealIds = [];
    draft.processedClaimIds = uniqueStrings(draft.processedClaimIds.concat(['migration:v111-to-v4']));
    return ProgressionStateV4(draft);
  }

  function validateImportedState(value) {
    var source = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    if (!source || source.schema !== 'ProgressionStateV4' || source.version !== 4 ||
        source.ownerTestMode === true || source.testData === true) {
      throw new TypeError('Imported profile must use ProgressionStateV4');
    }
    ['revision', 'fxp', 'fcBalance'].forEach(function (key) {
      if (!Number.isSafeInteger(source[key]) || source[key] < 0) {
        throw new TypeError('Imported profile has an invalid ' + key);
      }
    });
    var arrays = [
      'ownedObjectIds', 'ownedArenaIds', 'ownedCosmeticIds', 'featureIds',
      'achievementIds', 'defeatedRivalIds', 'completedActIds', 'fieldNoteIds',
      'claimedRewardIds', 'processedClaimIds', 'pendingRevealIds',
    ];
    arrays.forEach(function (key) {
      if (!Array.isArray(source[key]) || source[key].length > 25000) {
        throw new TypeError('Imported profile has an invalid ' + key);
      }
      var seen = new Set();
      source[key].forEach(function (id) {
        var valid = exactId(id, 'Imported ' + key + ' entry');
        if (seen.has(valid)) throw new TypeError('Imported profile has duplicate ' + key + ' entries');
        seen.add(valid);
      });
    });
    if (!Array.isArray(source.fcTransactions) || source.fcTransactions.length > 100000) {
      throw new TypeError('Imported profile has an invalid FC ledger');
    }
    var txIds = new Set();
    var keys = new Set();
    var balance = 0;
    source.fcTransactions.forEach(function (entry) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
          entry.schema !== 'FcTransactionV1' || entry.version !== 1 ||
          !Number.isSafeInteger(entry.timestamp) || entry.timestamp < 0) {
        throw new TypeError('Imported profile contains an invalid FC transaction');
      }
      exactId(entry.txId, 'Imported FC transaction ID');
      exactId(entry.idempotencyKey, 'Imported FC idempotency key');
      exactId(entry.sourceId, 'Imported FC source ID');
      var tx = FcTransactionV1(entry);
      if (txIds.has(tx.txId) || keys.has(tx.idempotencyKey)) {
        throw new TypeError('Imported profile contains a duplicate FC transaction');
      }
      txIds.add(tx.txId); keys.add(tx.idempotencyKey);
      balance += tx.signedAmount;
      if (balance < 0 || tx.balanceAfter !== balance) {
        throw new TypeError('Imported profile FC ledger is inconsistent');
      }
    });
    if (balance !== source.fcBalance) {
      throw new TypeError('Imported profile FC balance does not match its ledger');
    }
    if (source.flipLevel != null && source.flipLevel !== Economy.flipLevelForFxp(source.fxp)) {
      throw new TypeError('Imported profile Flip Level does not match FXP');
    }
    return ProgressionStateV4(source);
  }

  function createStore(options) {
    var opts = options || {};
    var storage = opts.storage || null;
    var now = typeof opts.now === 'function' ? opts.now : function () { return Date.now(); };
    var listeners = new Set();
    var persisted = readStorage(storage, KEY, null);
    if (persisted && persisted.schema === 'ProgressionStateV4' && persisted.version !== 4) {
      throw new RangeError('Unsupported persisted ProgressionStateV4 version');
    }
    var loadedV4 = !!(persisted && persisted.schema === 'ProgressionStateV4' && persisted.version === 4);
    var state = loadedV4 ? ProgressionStateV4(persisted)
      : migrateV111(Object.assign({}, opts.legacy || {}, { storage: storage }));
    var persistenceError = null;

    function persist(candidate) {
      if (!storage || typeof storage.setItem !== 'function') return true;
      var previous = null;
      var wrote = false;
      try {
        previous = typeof storage.getItem === 'function' ? storage.getItem(KEY) : null;
        var encoded = JSON.stringify(candidate);
        storage.setItem(KEY, encoded);
        wrote = true;
        if (typeof storage.getItem === 'function' && storage.getItem(KEY) !== encoded) {
          throw new Error('Profile persistence verification failed');
        }
        persistenceError = null;
        return true;
      } catch (error) {
        if (wrote) {
          try {
            if (previous == null && typeof storage.removeItem === 'function') storage.removeItem(KEY);
            else storage.setItem(KEY, previous);
          } catch (_) {}
        }
        persistenceError = error;
        return false;
      }
    }
    if (!loadedV4 || JSON.stringify(persisted) !== JSON.stringify(state)) persist(state);

    function snapshot() { return ProgressionStateV4(state); }
    function notify(result) {
      listeners.forEach(function (listener) {
        try { listener(result.state, result); } catch (_) {}
      });
    }
    function result(applied, claimId, extra) {
      return freeze(Object.assign({ applied: applied, duplicate: !applied && !!claimId,
        claimId: claimId || null, state: snapshot() }, extra || {}));
    }
    function refresh() {
      var external = readStorage(storage, KEY, null);
      if (external && external.schema === 'ProgressionStateV4' && external.version === 4 &&
          finiteInteger(external.revision) > state.revision) state = ProgressionStateV4(external);
      return snapshot();
    }
    function commit(claimId, updater) {
      var id = validId(claimId, 'profile claimId');
      refresh();
      if (state.processedClaimIds.indexOf(id) >= 0) return result(false, id, { reason: 'duplicate' });
      var draft = clone(state);
      var details = updater(draft) || {};
      addUnique(draft.processedClaimIds, id);
      draft.revision = Math.max(state.revision + 1, finiteInteger(draft.revision) + 1);
      draft.flipLevel = Economy.flipLevelForFxp(draft.fxp);
      var next = ProgressionStateV4(draft);
      if (!persist(next)) return result(false, null, { duplicate: false, reason: 'persistence-failed' });
      state = next;
      var committed = result(true, id, details);
      notify(committed);
      return committed;
    }
    function claimBundle(bundle) {
      var source = bundle && typeof bundle === 'object' ? bundle : {};
      var claimId = validId(source.claimId, 'claimBundle.claimId');
      return commit(claimId, function (draft) {
        var beforeLevel = draft.flipLevel;
        var beforeBalance = draft.fcBalance;
        var granted = [];
        var fxp = finiteInteger(source.fxp);
        var fc = signedInteger(source.fc);
        var sourceType = String(source.sourceType || 'match');
        if (fc < 0 && sourceType !== 'cosmetic-purchase') {
          throw new RangeError('Flip Credits may only be spent on a cosmetic purchase');
        }
        draft.fxp = Math.min(Number.MAX_SAFE_INTEGER, draft.fxp + fxp);
        draft.flipLevel = Economy.flipLevelForFxp(draft.fxp);
        if (fc) appendFc(draft, {
          txId: 'claim:' + claimId + ':fc', idempotencyKey: 'claim:' + claimId + ':fc',
          kind: fc < 0 ? 'spend' : (source.sourceType === 'migration' ? 'migration' : 'earn'),
          sourceType: sourceType,
          sourceId: String(source.sourceId || claimId), signedAmount: fc, timestamp: now(),
        });
        uniqueStrings(source.objectIds, Catalog.canonicalObjectId).forEach(function (id) {
          if (draft.ownedObjectIds.indexOf(id) < 0) { draft.ownedObjectIds.push(id); granted.push('object.' + id); }
        });
        uniqueStrings(source.arenaIds, Catalog.canonicalArenaId).forEach(function (id) {
          if (draft.ownedArenaIds.indexOf(id) < 0) { draft.ownedArenaIds.push(id); granted.push('arena.' + id); }
        });
        uniqueStrings(source.cosmeticIds).forEach(function (id) {
          if (draft.ownedCosmeticIds.indexOf(id) < 0) { draft.ownedCosmeticIds.push(id); granted.push('cosmetic.' + id); }
        });
        uniqueStrings(source.featureIds).forEach(function (id) {
          if (draft.featureIds.indexOf(id) < 0) { draft.featureIds.push(id); granted.push('feature.' + id); }
        });
        uniqueStrings(source.achievementIds).forEach(function (id) { addUnique(draft.achievementIds, id); });
        uniqueStrings(source.rivalIds).forEach(function (id) { addUnique(draft.defeatedRivalIds, id); });
        uniqueStrings(source.actIds).forEach(function (id) { addUnique(draft.completedActIds, id); });
        uniqueStrings(source.fieldNoteIds).forEach(function (id) { addUnique(draft.fieldNoteIds, id); });
        granted = granted.concat(grantLevelsCrossed(draft, beforeLevel, { reveal: source.reveal !== false, now: now() }));
        granted = granted.concat(grantAlienGate(draft, source.reveal !== false));
        var feedback = uniqueStrings(source.feedbackIds);
        if (source.reveal !== false) granted.concat(feedback).forEach(function (id) {
          addUnique(draft.pendingRevealIds, id);
        });
        return { fxpAwarded: fxp, fcAwarded: draft.fcBalance - beforeBalance,
          baseFcAwarded: fc, levelsCrossed: Math.max(0, draft.flipLevel - beforeLevel),
          granted: uniqueStrings(granted), feedback: feedback };
      });
    }
    function claimMatch(matchId, rewardInput) {
      var id = exactId(matchId, 'matchId');
      var reward = Economy.calculateMatchReward(rewardInput || {});
      if (!reward.eligible) return result(false, null, { duplicate: false, reason: reward.reason, reward: reward });
      var claimed = claimBundle({ claimId: 'match:' + id, sourceType: 'match', sourceId: id,
        fxp: reward.fxp, fc: reward.fc, reveal: true });
      return freeze(Object.assign({}, claimed, { reward: reward }));
    }
    function claimAchievement(id, rarity) {
      var achievementId = validId(id, 'achievementId');
      var reward = Economy.achievementReward(rarity);
      return claimBundle({ claimId: 'achievement:' + achievementId, sourceType: 'achievement',
        sourceId: achievementId, fxp: reward.fxp, fc: reward.fc,
        achievementIds: [achievementId], feedbackIds: ['achievement.' + achievementId], reveal: true });
    }
    function claimRivalVictory(idOrObjectId, immutableClaimId) {
      refresh();
      var rival = Catalog.rival(idOrObjectId);
      if (!rival) throw new RangeError('Unknown rival: ' + idOrObjectId);
      var expectedClaimId = 'rival.' + rival.id + '.first-clear';
      var claimId = immutableClaimId == null ? expectedClaimId : validId(immutableClaimId, 'rival claimId');
      if (claimId !== expectedClaimId) throw new RangeError('Rival claim ID does not match StoryCatalogV1');
      if (state.defeatedRivalIds.indexOf(rival.id) >= 0) return result(false, claimId, { reason: 'duplicate' });
      var alien = rival.id === 'visitor-zero';
      return claimBundle({ claimId: claimId, sourceType: 'rival', sourceId: rival.id,
        fxp: alien ? 75 : 25, fc: alien ? 50 : 15,
        objectIds: alien ? [] : [rival.objectId], rivalIds: [rival.id], reveal: true });
    }
    function claimStoryAct(actId, fieldNoteId, immutableClaimId) {
      refresh();
      var id = storyActId(actId);
      var expectedClaimId = 'story.act.' + id + '.first-clear';
      var claimId = immutableClaimId == null ? expectedClaimId : validId(immutableClaimId, 'Story act claimId');
      var expectedFieldNoteId = 'field-note-act-' + id;
      var noteId = fieldNoteId == null ? expectedFieldNoteId : validId(fieldNoteId, 'fieldNoteId');
      if (claimId !== expectedClaimId) throw new RangeError('Story act claim ID does not match StoryCatalogV1');
      if (noteId !== expectedFieldNoteId) throw new RangeError('Story field note ID does not match StoryCatalogV1');
      if (state.completedActIds.indexOf(id) >= 0) return result(false, claimId, { reason: 'duplicate' });
      return claimBundle({ claimId: claimId, sourceType: 'story-act', sourceId: id,
        fxp: 50, fc: 25, actIds: [id], fieldNoteIds: [noteId], reveal: false });
    }
    function normalizeStoryReward(rewardInput) {
      var reward = rewardInput && typeof rewardInput === 'object' ? rewardInput : {};
      var type = String(reward.type || '');
      if (type === 'rival-first-clear') {
        var rival = Catalog.rival(reward.rivalId);
        if (!rival || String(reward.objectId || '') !== rival.objectId) {
          throw new RangeError('Story rival reward does not match StoryCatalogV1');
        }
        var alien = rival.id === 'visitor-zero';
        if (finiteInteger(reward.fxp) !== (alien ? 75 : 25) ||
            finiteInteger(reward.fc) !== (alien ? 50 : 15)) {
          throw new RangeError('Story rival reward amount does not match StoryCatalogV1');
        }
        var rivalClaimId = validId(reward.claimId, 'Story rival reward claimId');
        if (rivalClaimId !== 'rival.' + rival.id + '.first-clear') {
          throw new RangeError('Rival claim ID does not match StoryCatalogV1');
        }
        return freeze({ claimId: rivalClaimId, type: type, rivalId: rival.id,
          objectId: rival.objectId, fxp: alien ? 75 : 25, fc: alien ? 50 : 15,
          alien: alien });
      }
      if (type === 'act-first-clear') {
        var id = storyActId(reward.actId);
        if (finiteInteger(reward.fxp) !== 50 || finiteInteger(reward.fc) !== 25) {
          throw new RangeError('Story act reward amount does not match StoryCatalogV1');
        }
        var actClaimId = validId(reward.claimId, 'Story act reward claimId');
        var expectedClaimId = 'story.act.' + id + '.first-clear';
        var expectedFieldNoteId = 'field-note-act-' + id;
        if (actClaimId !== expectedClaimId) {
          throw new RangeError('Story act claim ID does not match StoryCatalogV1');
        }
        if (String(reward.fieldNoteId || '') !== expectedFieldNoteId) {
          throw new RangeError('Story field note ID does not match StoryCatalogV1');
        }
        return freeze({ claimId: actClaimId, type: type, actId: id,
          fieldNoteId: expectedFieldNoteId, fxp: 50, fc: 25 });
      }
      throw new RangeError('Unknown Story reward type: ' + type);
    }
    function claimStoryReward(rewardInput) {
      var reward = normalizeStoryReward(rewardInput);
      if (reward.type === 'rival-first-clear') {
        return claimRivalVictory(reward.rivalId, reward.claimId);
      }
      return claimStoryAct(reward.actId, reward.fieldNoteId, reward.claimId);
    }
    function claimStoryMatchResolution(input) {
      var source = input && typeof input === 'object' ? input : {};
      var matchId = exactId(source.matchId, 'Story matchId');
      var componentRewards = (Array.isArray(source.rewards) ? source.rewards : [])
        .map(normalizeStoryReward);
      var componentIds = new Set();
      componentRewards.forEach(function (reward) {
        if (componentIds.has(reward.claimId)) {
          throw new RangeError('Duplicate Story component reward: ' + reward.claimId);
        }
        componentIds.add(reward.claimId);
      });
      var ordinaryReward = source.ordinaryRewardsEligible === true
        ? Economy.calculateMatchReward(source.rewardInput || {}) : null;
      var outerClaimId = 'story-match:' + matchId;
      return commit(outerClaimId, function (draft) {
        var beforeLevel = draft.flipLevel;
        var beforeBalance = draft.fcBalance;
        var totalFxp = 0;
        var granted = [];
        var appliedComponents = [];
        var skippedComponents = [];

        if (ordinaryReward && ordinaryReward.eligible) {
          totalFxp += ordinaryReward.fxp;
          if (ordinaryReward.fc) appendFc(draft, {
            txId: outerClaimId + ':ordinary:fc',
            idempotencyKey: outerClaimId + ':ordinary:fc',
            kind: 'earn', sourceType: 'match', sourceId: matchId,
            signedAmount: ordinaryReward.fc, timestamp: now(),
          });
        }

        componentRewards.forEach(function (reward) {
          var alreadyApplied = draft.processedClaimIds.indexOf(reward.claimId) >= 0;
          if (reward.type === 'rival-first-clear') {
            alreadyApplied = alreadyApplied || draft.defeatedRivalIds.indexOf(reward.rivalId) >= 0;
          } else {
            alreadyApplied = alreadyApplied || draft.completedActIds.indexOf(reward.actId) >= 0;
          }
          addUnique(draft.processedClaimIds, reward.claimId);
          addUnique(draft.claimedRewardIds, reward.claimId);
          if (alreadyApplied) {
            skippedComponents.push(reward.claimId);
            return;
          }
          totalFxp += reward.fxp;
          appendFc(draft, {
            txId: outerClaimId + ':' + reward.claimId + ':fc',
            idempotencyKey: reward.claimId + ':fc',
            kind: 'earn',
            sourceType: reward.type === 'rival-first-clear' ? 'rival' : 'story-act',
            sourceId: reward.type === 'rival-first-clear' ? reward.rivalId : reward.actId,
            signedAmount: reward.fc, timestamp: now(),
          });
          if (reward.type === 'rival-first-clear') {
            addUnique(draft.defeatedRivalIds, reward.rivalId);
            if (!reward.alien && draft.ownedObjectIds.indexOf(reward.objectId) < 0) {
              draft.ownedObjectIds.push(reward.objectId);
              granted.push('object.' + reward.objectId);
            }
          } else {
            addUnique(draft.completedActIds, reward.actId);
            addUnique(draft.fieldNoteIds, reward.fieldNoteId);
          }
          appliedComponents.push(reward.claimId);
        });

        draft.fxp = Math.min(Number.MAX_SAFE_INTEGER, draft.fxp + totalFxp);
        draft.flipLevel = Economy.flipLevelForFxp(draft.fxp);
        granted = granted.concat(grantLevelsCrossed(draft, beforeLevel, {
          reveal: true, now: now(),
        }));
        granted = granted.concat(grantAlienGate(draft, true));
        granted.forEach(function (id) { addUnique(draft.pendingRevealIds, id); });
        return {
          fxpAwarded: totalFxp,
          fcAwarded: draft.fcBalance - beforeBalance,
          levelsCrossed: Math.max(0, draft.flipLevel - beforeLevel),
          granted: uniqueStrings(granted),
          ordinaryReward: ordinaryReward,
          appliedStoryClaimIds: appliedComponents,
          skippedStoryClaimIds: skippedComponents,
        };
      });
    }
    function purchaseCosmetic(cosmeticId) {
      refresh();
      var cosmetic = Catalog.storeCosmetic(cosmeticId);
      if (!cosmetic) return result(false, null, { duplicate: false, reason: 'unknown-cosmetic' });
      if (state.ownedCosmeticIds.indexOf(cosmetic.id) >= 0) {
        return result(false, 'cosmetic-purchase:' + cosmetic.id, { reason: 'already-owned' });
      }
      if (state.fcBalance < cosmetic.price) return result(false, null, { duplicate: false, reason: 'insufficient-fc' });
      return claimBundle({ claimId: 'cosmetic-purchase:' + cosmetic.id,
        sourceType: 'cosmetic-purchase', sourceId: cosmetic.id,
        fc: -cosmetic.price, cosmeticIds: [cosmetic.id],
        feedbackIds: ['store.' + cosmetic.id], reveal: true });
    }
    function mergeImportedState(importedState, immutableImportId) {
      var incoming = validateImportedState(importedState);
      var importId = exactId(immutableImportId, 'importId');
      var outerClaimId = 'profile-import:' + importId;
      return commit(outerClaimId, function (draft) {
        var beforeLevel = draft.flipLevel;
        var beforeBalance = draft.fcBalance;
        function sameTransaction(a, b) {
          var compatibleKind = a.kind === b.kind ||
            (a.kind !== 'spend' && b.kind !== 'spend');
          return a.txId === b.txId && a.idempotencyKey === b.idempotencyKey &&
            compatibleKind && a.sourceType === b.sourceType &&
            a.sourceId === b.sourceId && a.signedAmount === b.signedAmount;
        }
        draft.fxp = Math.max(draft.fxp, incoming.fxp);
        draft.flipLevel = Economy.flipLevelForFxp(draft.fxp);
        // Reconcile the canonical level ladder from FXP before accepting claim
        // evidence from the imported file.  A partial or old V4 snapshot can
        // therefore add ownership but can never suppress an earned level grant.
        var granted = grantLevelsCrossed(draft, beforeLevel, { reveal: false, now: now() });

        var importedTransactions = [];
        var txById = new Map();
        var txByKey = new Map();
        draft.fcTransactions.forEach(function (tx) {
          txById.set(tx.txId, tx); txByKey.set(tx.idempotencyKey, tx);
        });
        incoming.fcTransactions.forEach(function (tx) {
          var idMatch = txById.get(tx.txId);
          var keyMatch = txByKey.get(tx.idempotencyKey);
          if (idMatch || keyMatch) {
            if (!idMatch || !keyMatch || idMatch !== keyMatch || !sameTransaction(idMatch, tx)) {
              throw new TypeError('Imported profile conflicts with the local FC ledger');
            }
            return;
          }
          importedTransactions.push(tx);
          txById.set(tx.txId, tx); txByKey.set(tx.idempotencyKey, tx);
        });

        var prefix = 0;
        var minimumPrefix = 0;
        importedTransactions.forEach(function (tx) {
          prefix += tx.signedAmount;
          minimumPrefix = Math.min(minimumPrefix, prefix);
        });
        var targetFloor = Math.max(beforeBalance, incoming.fcBalance);
        var floorAmount = Math.max(0, targetFloor - (draft.fcBalance + prefix),
          -(draft.fcBalance + minimumPrefix));
        if (floorAmount) appendFc(draft, {
          txId: outerClaimId + ':balance-floor',
          idempotencyKey: outerClaimId + ':balance-floor',
          kind: 'migration', sourceType: 'migration', sourceId: importId,
          signedAmount: floorAmount, timestamp: now(),
        });
        importedTransactions.forEach(function (tx) {
          appendFc(draft, {
            txId: tx.txId, idempotencyKey: tx.idempotencyKey,
            kind: tx.kind, sourceType: tx.sourceType, sourceId: tx.sourceId,
            signedAmount: tx.signedAmount, timestamp: tx.timestamp,
          });
        });

        [
          ['ownedObjectIds', Catalog.canonicalObjectId],
          ['ownedArenaIds', Catalog.canonicalArenaId],
          ['ownedCosmeticIds', null], ['featureIds', null],
          ['achievementIds', null], ['defeatedRivalIds', null],
          ['completedActIds', null], ['fieldNoteIds', null],
          ['claimedRewardIds', null], ['processedClaimIds', null],
          ['pendingRevealIds', null],
        ].forEach(function (definition) {
          uniqueStrings(incoming[definition[0]], definition[1]).forEach(function (id) {
            addUnique(draft[definition[0]], id);
          });
        });
        draft.legacy = {
          reconciledV111: !!(draft.legacy.reconciledV111 || incoming.legacy.reconciledV111),
          qualifyingWins: Math.max(finiteInteger(draft.legacy.qualifyingWins),
            finiteInteger(incoming.legacy.qualifyingWins)),
          sourceRelease: draft.legacy.sourceRelease || incoming.legacy.sourceRelease,
          grandfatheredAlien: !!(draft.legacy.grandfatheredAlien || incoming.legacy.grandfatheredAlien),
          grandfatheredInsane: !!(draft.legacy.grandfatheredInsane || incoming.legacy.grandfatheredInsane),
        };
        draft.revision = Math.max(draft.revision, incoming.revision);
        granted = granted.concat(grantAlienGate(draft, false));
        return {
          imported: true,
          importedRevision: incoming.revision,
          fxpAdded: draft.fxp - state.fxp,
          fcAdded: draft.fcBalance - beforeBalance,
          granted: uniqueStrings(granted),
        };
      });
    }
    function dismissReveals(ids) {
      refresh();
      var values = ids == null ? state.pendingRevealIds.slice() : uniqueStrings(ids);
      if (!values.length) return result(false, null, { duplicate: false, reason: 'empty' });
      return commit('reveal-dismiss:' + state.revision, function (draft) {
        var removed = new Set(values);
        draft.pendingRevealIds = draft.pendingRevealIds.filter(function (id) { return !removed.has(id); });
        return { dismissed: values };
      });
    }
    function subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('profile subscriber must be a function');
      listeners.add(listener);
      return function () { listeners.delete(listener); };
    }
    function exportState() { return snapshot(); }
    function lastPersistenceError() { return persistenceError; }

    return freeze({
      snapshot: snapshot, refresh: refresh, subscribe: subscribe, exportState: exportState,
      claimBundle: claimBundle, claimMatch: claimMatch, claimAchievement: claimAchievement,
      claimRivalVictory: claimRivalVictory, claimStoryAct: claimStoryAct,
      claimStoryReward: claimStoryReward, claimStoryMatchResolution: claimStoryMatchResolution,
      purchaseCosmetic: purchaseCosmetic, mergeImportedState: mergeImportedState,
      dismissReveals: dismissReveals,
      lastPersistenceError: lastPersistenceError,
    });
  }

  var browserStorage = null;
  try { browserStorage = root && root.localStorage ? root.localStorage : null; } catch (_) {}
  var defaultStore = createStore({ storage: browserStorage });

  return freeze({
    schema: 'ProgressionStateV4', version: 4, storageKey: KEY, legacyKeys: clone(LEGACY_KEYS),
    ProgressionStateV4: ProgressionStateV4, FcTransactionV1: FcTransactionV1,
    validateImportedState: validateImportedState,
    migrateV111: migrateV111, migrateSetupSelection: migrateSetupSelection,
    storyActIds: STORY_ACT_IDS.slice(), alienGateSatisfied: alienGateSatisfied,
    isAlienUsable: isAlienUsable, isInsaneUsable: isInsaneUsable,
    createMemoryStorage: createMemoryStorage, createStore: createStore,
    snapshot: defaultStore.snapshot, refresh: defaultStore.refresh, subscribe: defaultStore.subscribe,
    exportState: defaultStore.exportState, claimBundle: defaultStore.claimBundle,
    claimMatch: defaultStore.claimMatch, claimAchievement: defaultStore.claimAchievement,
    claimRivalVictory: defaultStore.claimRivalVictory, claimStoryAct: defaultStore.claimStoryAct,
    claimStoryReward: defaultStore.claimStoryReward,
    claimStoryMatchResolution: defaultStore.claimStoryMatchResolution,
    purchaseCosmetic: defaultStore.purchaseCosmetic,
    mergeImportedState: defaultStore.mergeImportedState,
    dismissReveals: defaultStore.dismissReveals,
    lastPersistenceError: defaultStore.lastPersistenceError,
    defaultStore: defaultStore,
  });
});
