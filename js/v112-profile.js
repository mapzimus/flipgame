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
  var MATCH_ACTIVITY_IDS = new Set(['free-play', 'story', 'rival-board']);
  var RETENTION = Object.freeze({
    legacyClaimIds: 4096,
    fcTransactions: 4096,
    pendingReveals: 512,
    consumedRevealIds: 512,
    externalLineages: 128,
    maxDistinctRevealIds: 271,
    canonicalEntitlementClaimIds: 177,
    idempotencePolicy: 'exact finite entitlements plus one lineage-bound reserve-consume match token; no probabilistic identity structures',
    legacyClaimMigration: 'retain canonical finite entitlement identities; quarantine obsolete opaque match/import/reveal identities',
  });
  var STATE_CARDINALITY = Object.freeze({
    ownedObjectIds: 51,
    ownedArenaIds: 23,
    ownedCosmeticIds: 40,
    featureIds: 2,
    achievementIds: 120,
    defeatedRivalIds: 12,
    completedActIds: 4,
    fieldNoteIds: 4,
    claimedRewardIds: 512,
  });
  var UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
  var lineageSequence = 0;

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function safeClone(value, seen) {
    if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new TypeError('Unsafe non-finite number');
      return value;
    }
    if (typeof value !== 'object') throw new TypeError('Unsafe value type');
    var active = seen || new Set();
    if (active.has(value)) throw new TypeError('Cyclic values are not supported');
    active.add(value);
    var output;
    if (Array.isArray(value)) {
      output = value.map(function (entry) { return safeClone(entry, active); });
    } else {
      output = Object.create(null);
      Object.keys(value).forEach(function (key) {
        if (UNSAFE_KEYS.has(key)) throw new TypeError('Unsafe object key: ' + key);
        output[key] = safeClone(value[key], active);
      });
    }
    active.delete(value);
    return output;
  }
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
  function exactUnsignedInteger(value, label) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
      throw new TypeError((label || 'value') + ' must be an exact non-negative integer');
    }
    return value;
  }
  function exactSignedInteger(value, label) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
      throw new TypeError((label || 'value') + ' must be an exact integer');
    }
    return value;
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
  function opaqueIdentity(prefix, timeValue) {
    var cryptoApi = root && root.crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
      return prefix + '-' + cryptoApi.randomUUID();
    }
    if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
      var bytes = new Uint8Array(16);
      cryptoApi.getRandomValues(bytes);
      return prefix + '-' + Array.prototype.map.call(bytes, function (byte) {
        return byte.toString(16).padStart(2, '0');
      }).join('');
    }
    // Legacy WebViews without Web Crypto still receive a non-gameplay opaque
    // identity.  The monotonic cursor remains the authoritative idempotence
    // boundary; this fallback only prevents independent-profile collisions.
    return prefix + '-' + finiteInteger(timeValue).toString(36) + '-' +
      (++lineageSequence).toString(36) + '-' + Math.floor(Math.random() * 0x100000000).toString(36);
  }

  function FcTransactionV1(value) {
    var source = value && typeof value === 'object' ? value : {};
    var kind = String(source.kind || '');
    var sourceType = String(source.sourceType || '');
    var amount = exactSignedInteger(source.signedAmount, 'FcTransactionV1.signedAmount');
    var balance = exactUnsignedInteger(source.balanceAfter, 'FcTransactionV1.balanceAfter');
    if (!FC_KINDS.has(kind)) throw new RangeError('Unknown FC transaction kind');
    if (!FC_SOURCES.has(sourceType)) throw new RangeError('Unknown FC transaction source');
    if (!amount) throw new RangeError('FC transaction amount cannot be zero');
    if (kind === 'earn' && amount < 0) throw new RangeError('FC earn transaction must be positive');
    if (kind === 'spend' && amount > 0) throw new RangeError('FC spend transaction must be negative');
    return freeze({
      schema: 'FcTransactionV1', version: 1,
      txId: exactId(source.txId, 'FcTransactionV1.txId'),
      idempotencyKey: exactId(source.idempotencyKey == null ? source.txId : source.idempotencyKey,
        'FcTransactionV1.idempotencyKey'),
      kind: kind, sourceType: sourceType,
      sourceId: exactId(source.sourceId, 'FcTransactionV1.sourceId'),
      signedAmount: amount, balanceAfter: balance,
      timestamp: exactUnsignedInteger(source.timestamp, 'FcTransactionV1.timestamp'),
    });
  }

  function MatchClaimTokenV1(value) {
    var source = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    if (!source || source.schema !== 'MatchClaimTokenV1' || source.version !== 1) {
      throw new TypeError('Match claim token must use MatchClaimTokenV1');
    }
    return freeze({ schema: 'MatchClaimTokenV1', version: 1,
      lineageId: exactId(source.lineageId, 'MatchClaimTokenV1.lineageId'),
      ordinal: exactUnsignedInteger(source.ordinal, 'MatchClaimTokenV1.ordinal'),
      nonce: exactId(source.nonce, 'MatchClaimTokenV1.nonce'),
      matchId: exactId(source.matchId, 'MatchClaimTokenV1.matchId'),
      activityId: exactId(source.activityId, 'MatchClaimTokenV1.activityId'),
      reservedAt: exactUnsignedInteger(source.reservedAt, 'MatchClaimTokenV1.reservedAt'),
    });
  }

  function normalizeTransactions(values, declaredBalance, rollupValue) {
    var output = [];
    var txIds = new Set();
    var keys = new Set();
    var rollup = normalizeLedgerRollup(rollupValue);
    var balance = rollup.netAmount;
    if (balance < 0) throw new TypeError('FC ledger rollup cannot begin below zero');
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
    if (!output.length && rollup.transactionCount === 0 && requested > 0) {
      output.push(FcTransactionV1({
        txId: 'migration:unledgered-fc', idempotencyKey: 'migration:unledgered-fc',
        kind: 'migration', sourceType: 'migration', sourceId: 'profile-v4-balance',
        signedAmount: requested, balanceAfter: requested, timestamp: 0,
      }));
      balance = requested;
    }
    return { transactions: output, balance: balance, rollup: rollup };
  }
  function normalizeExternalLineages(values) {
    var byId = new Map();
    (Array.isArray(values) ? values : []).forEach(function (entry) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
      var lineageId = exactId(entry.lineageId, 'external lineageId');
      var revision = exactUnsignedInteger(entry.throughRevision, 'external throughRevision');
      byId.set(lineageId, Math.max(revision, byId.get(lineageId) || 0));
    });
    return Array.from(byId, function (entry) {
      return freeze({ lineageId: entry[0], throughRevision: entry[1] });
    }).sort(function (a, b) { return a.lineageId.localeCompare(b.lineageId); })
      .slice(-RETENTION.externalLineages);
  }

  function boundedStateIds(values, field, mapper) {
    var output = uniqueStrings(values, mapper);
    if (output.length > STATE_CARDINALITY[field]) {
      throw new RangeError(field + ' exceeds the canonical v1.12 cardinality');
    }
    return output;
  }

  function ProgressionStateV4(value) {
    var source = value && typeof value === 'object' ? value : {};
    var ledger = normalizeTransactions(source.fcTransactions, source.fcBalance, source.fcTransactionRollup);
    while (ledger.transactions.length > RETENTION.fcTransactions) {
      ledger.rollup = ledgerRollupAdd(ledger.rollup, ledger.transactions.shift());
    }
    var objects = boundedStateIds(['bottle'].concat(source.ownedObjectIds || []),
      'ownedObjectIds', Catalog.canonicalObjectId);
    if (objects.indexOf('bottle') < 0) objects.unshift('bottle');
    var arenas = boundedStateIds(['baseline-table'].concat(source.ownedArenaIds || []),
      'ownedArenaIds', Catalog.canonicalArenaId);
    if (arenas.indexOf('baseline-table') < 0) arenas.unshift('baseline-table');
    var defeated = boundedStateIds(source.defeatedRivalIds, 'defeatedRivalIds');
    var fxp = finiteInteger(source.fxp);
    var legacySource = source.legacy && typeof source.legacy === 'object' ? source.legacy : {};
    var reconciledV111 = !!legacySource.reconciledV111;
    var grandfatheredAlien = Object.prototype.hasOwnProperty.call(legacySource, 'grandfatheredAlien')
      ? !!legacySource.grandfatheredAlien
      : reconciledV111 && objects.indexOf('alien') >= 0;
    var featureIds = boundedStateIds(source.featureIds, 'featureIds');
    var matchClaimCursor = finiteInteger(source.matchClaimCursor);
    var consumedMatchOrdinal = Math.min(matchClaimCursor, finiteInteger(source.consumedMatchOrdinal));
    var activeMatchReservation = source.activeMatchReservation == null
      ? null : MatchClaimTokenV1(source.activeMatchReservation);
    if (activeMatchReservation && (activeMatchReservation.lineageId !==
        (source.lineageId == null ? 'unassigned-v4' : source.lineageId) ||
        activeMatchReservation.ordinal !== matchClaimCursor ||
        activeMatchReservation.ordinal <= consumedMatchOrdinal)) {
      throw new TypeError('Active match reservation is inconsistent with profile lineage/ordinal');
    }
    var grandfatheredInsane = Object.prototype.hasOwnProperty.call(legacySource, 'grandfatheredInsane')
      ? !!legacySource.grandfatheredInsane
      : reconciledV111 && featureIds.indexOf('insane-mode') >= 0;
    if (grandfatheredAlien) addUnique(objects, 'alien');
    if (grandfatheredInsane) addUnique(featureIds, 'insane-mode');
    var processedClaimIds = uniqueStrings(source.processedClaimIds);
    if (processedClaimIds.length > RETENTION.legacyClaimIds) {
      throw new RangeError('Legacy claim capacity exhausted');
    }
    var consumedRevealIds = uniqueStrings(source.consumedRevealIds);
    if (consumedRevealIds.length > RETENTION.consumedRevealIds) throw new RangeError('Consumed reveal capacity exhausted');
    var pendingRevealIds = uniqueStrings(source.pendingRevealIds).filter(function (id) {
      return consumedRevealIds.indexOf(id) < 0;
    });
    if (pendingRevealIds.length > RETENTION.pendingReveals) throw new RangeError('Pending reveal capacity exhausted');
    return freeze({
      schema: 'ProgressionStateV4', version: 4,
      lineageId: source.lineageId == null ? 'unassigned-v4' : exactId(source.lineageId, 'lineageId'),
      revision: finiteInteger(source.revision),
      matchClaimCursor: matchClaimCursor,
      consumedMatchOrdinal: consumedMatchOrdinal,
      activeMatchReservation: activeMatchReservation,
      fxp: fxp, flipLevel: Economy.flipLevelForFxp(fxp), fcBalance: ledger.balance,
      ownedObjectIds: objects,
      ownedArenaIds: arenas,
      ownedCosmeticIds: boundedStateIds(source.ownedCosmeticIds, 'ownedCosmeticIds'),
      featureIds: featureIds,
      achievementIds: boundedStateIds(source.achievementIds, 'achievementIds'),
      defeatedRivalIds: defeated,
      completedActIds: boundedStateIds(source.completedActIds, 'completedActIds'),
      fieldNoteIds: boundedStateIds(source.fieldNoteIds, 'fieldNoteIds'),
      claimedRewardIds: boundedStateIds(source.claimedRewardIds, 'claimedRewardIds'),
      processedClaimIds: processedClaimIds,
      externalClaimEvidence: normalizeExternalLineages(source.externalClaimEvidence),
      pendingRevealIds: pendingRevealIds,
      consumedRevealIds: consumedRevealIds,
      fcTransactions: ledger.transactions,
      fcTransactionRollup: freeze(ledger.rollup),
      legacy: freeze({
        reconciledV111: reconciledV111,
        qualifyingWins: finiteInteger(legacySource.qualifyingWins),
        sourceRelease: String(legacySource.sourceRelease || ''),
        grandfatheredAlien: grandfatheredAlien,
        grandfatheredInsane: grandfatheredInsane,
        quarantinedMatchReservations: finiteInteger(legacySource.quarantinedMatchReservations),
        compactedLegacyClaims: finiteInteger(legacySource.compactedLegacyClaims),
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
    var output = safeClone(setup && typeof setup === 'object' ? setup : Object.create(null));
    function migrateParticipant(row) {
      if (!row || typeof row !== 'object') return row;
      var next = safeClone(row);
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
    var amount = exactSignedInteger(value.signedAmount, 'FC signedAmount');
    if (!amount) return null;
    var nextBalance = draft.fcBalance + amount;
    if (nextBalance < 0) throw new RangeError('Insufficient Flip Credits');
    if (!Number.isSafeInteger(nextBalance)) throw new RangeError('Flip Credit balance exceeds the supported range');
    var tx = FcTransactionV1(Object.assign({}, value, { balanceAfter: nextBalance }));
    if (draft.fcTransactions.some(function (entry) {
      return entry.txId === tx.txId || entry.idempotencyKey === tx.idempotencyKey;
    })) throw new RangeError('FC transaction identity already exists or is present in compacted history');
    draft.fcTransactions.push(tx);
    draft.fcBalance = nextBalance;
    compactLedger(draft);
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
    if (reveal) granted.forEach(function (id) { queueReveal(draft, id); });
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
    if (opts.reveal) granted.forEach(function (id) { queueReveal(draft, id); });
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
    var reconciledObjects = uniqueStrings(reconciled.ownedObjectIds, Catalog.canonicalObjectId)
      .filter(function (id) { return !!Catalog.object(id); });
    var reconciledClaims = uniqueStrings(reconciled.claimedRewardIds);
    var grandfatheredAlien = reconciledObjects.indexOf('alien') >= 0 ||
      reconciledClaims.indexOf('object.alien') >= 0;
    var grandfatheredInsane = reconciledClaims.indexOf('feature.insane-mode') >= 0;
    var draft = clone(ProgressionStateV4({
      fxp: Economy.fxpThresholdForLevel(Math.max(1, Math.min(100, wins))),
      ownedObjectIds: reconciledObjects,
      achievementIds: uniqueStrings((reconciled.achievementIds || []).concat(ids)),
      claimedRewardIds: [],
      legacy: { reconciledV111: true, qualifyingWins: wins, sourceRelease: 'v1.11',
        grandfatheredAlien: grandfatheredAlien, grandfatheredInsane: grandfatheredInsane },
    }));

    (reconciled.claimedRewardIds || []).forEach(function (claim) {
      var id = String(claim || '');
      if (id.indexOf('object.') === 0) {
        var objectId = Catalog.canonicalObjectId(id.slice(7));
        if (Catalog.object(objectId)) {
          addUnique(draft.ownedObjectIds, objectId);
          addUnique(draft.claimedRewardIds, 'object.' + objectId);
        }
      } else if (id.indexOf('feature.') === 0 &&
          ['physics-lab', 'insane-mode'].indexOf(id.slice(8)) >= 0) {
        addUnique(draft.featureIds, id.slice(8));
        addUnique(draft.claimedRewardIds, id);
      } else if (Catalog.storeCosmetic(id)) {
        addUnique(draft.claimedRewardIds, id);
      } else if (id.indexOf('arena.') === 0 && Catalog.arena(Catalog.canonicalArenaId(id))) {
        addUnique(draft.claimedRewardIds, 'arena.' + Catalog.canonicalArenaId(id));
      }
    });
    (reconciled.ownedCosmeticIds || []).forEach(function (id) {
      var value = String(id || '');
      if (value.indexOf('arena.') === 0) {
        var arenaId = Catalog.canonicalArenaId(value);
        if (Catalog.arena(arenaId)) addUnique(draft.ownedArenaIds, arenaId);
      } else if (Catalog.storeCosmetic(value)) addUnique(draft.ownedCosmeticIds, value);
    });
    draft.ownedObjectIds = uniqueStrings(draft.ownedObjectIds, Catalog.canonicalObjectId)
      .filter(function (id) { return !!Catalog.object(id); });
    draft.flipLevel = Economy.flipLevelForFxp(draft.fxp);
    for (var level = 2; level <= draft.flipLevel; level++) grantLevel(draft, level, { migration: true, reveal: false, now: 0 });
    draft.pendingRevealIds = [];
    draft.processedClaimIds = uniqueStrings(draft.processedClaimIds.concat(['migration:v111-to-v4']));
    return ProgressionStateV4(draft);
  }

  function normalizeLedgerRollup(value) {
    var source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    var summary = { schema: 'FcLedgerSummaryV1', version: 1,
      netAmount: signedInteger(source.netAmount),
      transactionCount: finiteInteger(source.transactionCount) };
    if (summary.transactionCount === 0 && summary.netAmount !== 0) throw new TypeError('Invalid FC ledger summary totals');
    return summary;
  }
  function ledgerRollupAdd(value, transaction) {
    var summary = normalizeLedgerRollup(value);
    var net = summary.netAmount + transaction.signedAmount;
    if (!Number.isSafeInteger(net)) throw new RangeError('FC ledger summary exceeds supported range');
    summary.netAmount = net;
    summary.transactionCount = Math.min(Number.MAX_SAFE_INTEGER, summary.transactionCount + 1);
    return summary;
  }

  function compactClaims(draft) {
    if (draft.processedClaimIds.length > RETENTION.legacyClaimIds) {
      throw new RangeError('Legacy claim capacity exhausted; reward-bearing matches require MatchClaimTokenV1');
    }
  }
  function claimWasProcessed(value, id) {
    return value.processedClaimIds.indexOf(id) >= 0;
  }
  function compactLedger(draft) {
    while (draft.fcTransactions.length > RETENTION.fcTransactions) {
      draft.fcTransactionRollup = ledgerRollupAdd(draft.fcTransactionRollup, draft.fcTransactions.shift());
    }
  }
  function revealWasConsumed(value, id) {
    return value.consumedRevealIds.indexOf(id) >= 0;
  }
  function consumeReveal(draft, id) {
    if (revealWasConsumed(draft, id)) return;
    if (draft.consumedRevealIds.length >= RETENTION.consumedRevealIds) {
      throw new RangeError('Consumed reveal capacity exhausted');
    }
    draft.consumedRevealIds.push(id);
  }
  function queueReveal(draft, id) {
    if (!id || revealWasConsumed(draft, id) || draft.pendingRevealIds.indexOf(id) >= 0) return false;
    if (draft.pendingRevealIds.length >= RETENTION.pendingReveals) {
      throw new RangeError('Pending reveal capacity exhausted');
    }
    draft.pendingRevealIds.push(id);
    return true;
  }

  function canonicalEntitlementClaims(value) {
    var source = value || {};
    var achievements = new Set(source.achievementIds || []);
    var rivals = new Set(source.defeatedRivalIds || []);
    var acts = new Set((source.completedActIds || []).map(String));
    var cosmetics = new Set(source.ownedCosmeticIds || []);
    var retained = [];
    uniqueStrings(source.processedClaimIds).forEach(function (id) {
      var keep = id === 'migration:v111-to-v4';
      if (!keep && id.indexOf('achievement:') === 0) keep = achievements.has(id.slice(12));
      var rival = /^rival\.([a-z0-9-]+)\.first-clear$/.exec(id);
      if (!keep && rival) keep = rivals.has(rival[1]);
      var act = /^story\.act\.([1-4])\.first-clear$/.exec(id);
      if (!keep && act) keep = acts.has(act[1]);
      if (!keep && id.indexOf('cosmetic-purchase:') === 0) {
        keep = cosmetics.has(id.slice(18));
      }
      if (keep) retained.push(id);
    });
    if (retained.length > RETENTION.canonicalEntitlementClaimIds) {
      throw new RangeError('Canonical entitlement claims exceed the v1.12 catalog');
    }
    return retained;
  }

  function validateImportedState(value, options) {
    var validationOptions = options || {};
    var source = value && typeof value === 'object' && !Array.isArray(value) ? safeClone(value) : null;
    if (!source || source.schema !== 'ProgressionStateV4' || source.version !== 4 ||
        source.ownerTestMode === true || source.testData === true) {
      throw new TypeError('Imported profile must use ProgressionStateV4');
    }
    ['revision', 'fxp', 'fcBalance'].forEach(function (key) {
      if (!Number.isSafeInteger(source[key]) || source[key] < 0) {
        throw new TypeError('Imported profile has an invalid ' + key);
      }
    });
    if (source.lineageId != null) exactId(source.lineageId, 'Imported lineageId');
    if (source.matchClaimCursor != null) exactUnsignedInteger(source.matchClaimCursor,
      'Imported matchClaimCursor');
    if (source.consumedMatchOrdinal != null) exactUnsignedInteger(source.consumedMatchOrdinal,
      'Imported consumedMatchOrdinal');
    if ((source.consumedMatchOrdinal || 0) > (source.matchClaimCursor || 0)) {
      throw new TypeError('Imported consumed match ordinal exceeds its cursor');
    }
    if (source.activeMatchReservation != null) MatchClaimTokenV1(source.activeMatchReservation);
    if (source.legacy != null) {
      if (!source.legacy || typeof source.legacy !== 'object' || Array.isArray(source.legacy)) {
        throw new TypeError('Imported profile has invalid legacy metadata');
      }
      ['qualifyingWins', 'quarantinedMatchReservations', 'compactedLegacyClaims'].forEach(function (key) {
        if (source.legacy[key] != null) exactUnsignedInteger(source.legacy[key], 'Imported legacy.' + key);
      });
      ['reconciledV111', 'grandfatheredAlien', 'grandfatheredInsane'].forEach(function (key) {
        if (source.legacy[key] != null && typeof source.legacy[key] !== 'boolean') {
          throw new TypeError('Imported legacy.' + key + ' must be boolean');
        }
      });
      if (source.legacy.sourceRelease != null && typeof source.legacy.sourceRelease !== 'string') {
        throw new TypeError('Imported legacy.sourceRelease must be a string');
      }
    }
    var arrayLimits = {
      ownedObjectIds: STATE_CARDINALITY.ownedObjectIds,
      ownedArenaIds: STATE_CARDINALITY.ownedArenaIds,
      ownedCosmeticIds: STATE_CARDINALITY.ownedCosmeticIds,
      featureIds: STATE_CARDINALITY.featureIds,
      achievementIds: STATE_CARDINALITY.achievementIds,
      defeatedRivalIds: STATE_CARDINALITY.defeatedRivalIds,
      completedActIds: STATE_CARDINALITY.completedActIds,
      fieldNoteIds: STATE_CARDINALITY.fieldNoteIds,
      claimedRewardIds: STATE_CARDINALITY.claimedRewardIds,
      processedClaimIds: RETENTION.legacyClaimIds, pendingRevealIds: RETENTION.pendingReveals,
      consumedRevealIds: RETENTION.consumedRevealIds,
    };
    Object.keys(arrayLimits).forEach(function (key) {
      if (!Array.isArray(source[key] || (key.indexOf('consumed') === 0 ? [] : null)) ||
          (source[key] || []).length > arrayLimits[key]) {
        throw new TypeError('Imported profile has an invalid ' + key);
      }
      var seen = new Set();
      (source[key] || []).forEach(function (id) {
        var valid = exactId(id, 'Imported ' + key + ' entry');
        if (seen.has(valid)) throw new TypeError('Imported profile has duplicate ' + key + ' entries');
        seen.add(valid);
      });
    });
    if (source.externalClaimEvidence != null) {
      if (!Array.isArray(source.externalClaimEvidence) ||
          source.externalClaimEvidence.length > RETENTION.externalLineages) {
        throw new TypeError('Imported profile has invalid external claim evidence');
      }
      normalizeExternalLineages(source.externalClaimEvidence);
    }
    var rawSummary = source.fcTransactionRollup;
    if (rawSummary != null && (!rawSummary || typeof rawSummary !== 'object' || Array.isArray(rawSummary) ||
        rawSummary.schema !== 'FcLedgerSummaryV1' || rawSummary.version !== 1 ||
        typeof rawSummary.netAmount !== 'number' || !Number.isSafeInteger(rawSummary.netAmount) ||
        typeof rawSummary.transactionCount !== 'number' ||
        !Number.isSafeInteger(rawSummary.transactionCount) || rawSummary.transactionCount < 0)) {
      throw new TypeError('Imported profile has invalid FC ledger summary');
    }
    var ledgerRollup = normalizeLedgerRollup(rawSummary);
    if (!Array.isArray(source.fcTransactions) || source.fcTransactions.length > RETENTION.fcTransactions) {
      throw new TypeError('Imported profile has an invalid FC ledger');
    }
    var txIds = new Set();
    var keys = new Set();
    var balance = ledgerRollup.netAmount;
    if (balance < 0) throw new TypeError('Imported profile FC rollup starts below zero');
    source.fcTransactions.forEach(function (entry) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
          entry.schema !== 'FcTransactionV1' || entry.version !== 1 ||
          typeof entry.signedAmount !== 'number' || !Number.isSafeInteger(entry.signedAmount) ||
          typeof entry.balanceAfter !== 'number' || !Number.isSafeInteger(entry.balanceAfter) ||
          typeof entry.timestamp !== 'number' || !Number.isSafeInteger(entry.timestamp) || entry.timestamp < 0) {
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
    if (source.activeMatchReservation != null && validationOptions.preserveReservation !== true) {
      source.activeMatchReservation = null;
      source.legacy = safeClone(source.legacy || Object.create(null));
      source.legacy.quarantinedMatchReservations = finiteInteger(
        source.legacy.quarantinedMatchReservations) + 1;
    }
    var normalized = ProgressionStateV4(Object.assign(source, { fcTransactionRollup: ledgerRollup }));
    var objectSet = new Set(normalized.ownedObjectIds);
    var arenaSet = new Set(normalized.ownedArenaIds);
    var cosmeticSet = new Set(normalized.ownedCosmeticIds);
    var featureSet = new Set(normalized.featureIds);
    var achievementSet = new Set(normalized.achievementIds);
    var rivalSet = new Set(normalized.defeatedRivalIds);
    var actSet = new Set(normalized.completedActIds);
    var noteSet = new Set(normalized.fieldNoteIds);
    normalized.ownedObjectIds.forEach(function (id) {
      if (!Catalog.object(id)) throw new TypeError('Imported profile contains an unsupported object');
    });
    normalized.ownedArenaIds.forEach(function (id) {
      if (!Catalog.arena(id)) throw new TypeError('Imported profile contains an unsupported arena');
    });
    normalized.ownedCosmeticIds.forEach(function (id) {
      if (!Catalog.storeCosmetic(id)) {
        throw new TypeError('Imported profile contains an unsupported cosmetic');
      }
    });
    normalized.featureIds.forEach(function (id) {
      if (['physics-lab', 'insane-mode'].indexOf(id) < 0) throw new TypeError('Imported profile contains an unsupported feature');
    });
    normalized.defeatedRivalIds.forEach(function (id) {
      var rival = Catalog.rival(id);
      if (!rival || rival.id !== id) throw new TypeError('Imported profile contains an unsupported rival');
      if (!rival.alien && !objectSet.has(rival.objectId)) throw new TypeError('Imported rival object is missing');
    });
    normalized.completedActIds.forEach(function (id) {
      if (STORY_ACT_IDS.indexOf(id) < 0) throw new TypeError('Imported profile contains an unsupported Story act');
      if (!noteSet.has('field-note-act-' + id)) throw new TypeError('Imported Story field note is missing');
    });
    normalized.fieldNoteIds.forEach(function (id) {
      var match = /^field-note-act-([1-4])$/.exec(id);
      if (!match || !actSet.has(match[1])) throw new TypeError('Imported Story field note is unsupported');
    });

    function assertRewardClaim(id) {
      var levelMatch = /^level\.(\d+)\.(?:object\.[a-z0-9-]+|arena\.[a-z0-9-]+|feature\.[a-z0-9-]+|fc|gate\.alien-insane)$/.exec(id);
      if (levelMatch) {
        var level = Number(levelMatch[1]);
        var reward = Catalog.rewardsAtLevel(level).find(function (entry) { return entry.id === id; });
        if (!reward || level > normalized.flipLevel) throw new TypeError('Imported level reward claim is unsupported');
        if (reward.type === 'object' && !objectSet.has(reward.contentId)) throw new TypeError('Imported object claim lacks ownership');
        if (reward.type === 'arena' && !arenaSet.has(reward.contentId)) throw new TypeError('Imported arena claim lacks ownership');
        if (reward.type === 'feature' && !featureSet.has(reward.contentId)) throw new TypeError('Imported feature claim lacks ownership');
        return;
      }
      var rivalMatch = /^rival\.([a-z0-9-]+)\.first-clear$/.exec(id);
      if (rivalMatch) {
        if (!rivalSet.has(rivalMatch[1])) throw new TypeError('Imported rival claim lacks completion');
        return;
      }
      var actMatch = /^story\.act\.([1-4])\.first-clear$/.exec(id);
      if (actMatch) {
        if (!actSet.has(actMatch[1])) throw new TypeError('Imported Story claim lacks completion');
        return;
      }
      if (id === 'condition.alien-defeated-at-level-100') {
        if (normalized.flipLevel < 100 || !rivalSet.has('visitor-zero')) throw new TypeError('Imported Alien gate claim is unsupported');
        return;
      }
      if (normalized.legacy.reconciledV111) {
        if (id.indexOf('object.') === 0 && objectSet.has(Catalog.canonicalObjectId(id.slice(7)))) return;
        if (id.indexOf('arena.') === 0 && arenaSet.has(Catalog.canonicalArenaId(id.slice(6)))) return;
        if (id.indexOf('feature.') === 0 && featureSet.has(id.slice(8))) return;
        if (cosmeticSet.has(id)) return;
      }
      throw new TypeError('Imported reward claim uses an unsupported namespace or lacks its effect');
    }
    normalized.claimedRewardIds.forEach(assertRewardClaim);
    normalized.processedClaimIds.forEach(function (id) {
      if (id === 'migration:v111-to-v4') return;
      if (id.indexOf('achievement:') === 0) {
        if (!achievementSet.has(id.slice(12))) {
          throw new TypeError('Imported achievement claim lacks achievement state');
        }
        return;
      }
      var rivalClaim = /^rival\.([a-z0-9-]+)\.first-clear$/.exec(id);
      if (rivalClaim) {
        if (!rivalSet.has(rivalClaim[1])) {
          throw new TypeError('Imported processed rival claim lacks completion');
        }
        return;
      }
      var storyClaim = /^story\.act\.([1-4])\.first-clear$/.exec(id);
      if (storyClaim) {
        if (!actSet.has(storyClaim[1])) {
          throw new TypeError('Imported processed Story claim lacks completion');
        }
        return;
      }
      if (id.indexOf('cosmetic-purchase:') === 0) {
        if (!cosmeticSet.has(id.slice(18))) {
          throw new TypeError('Imported cosmetic claim lacks ownership');
        }
        return;
      }
      if (/^(?:match:|story-match:|profile-import:|reveal-dismiss:)/.test(id)) return;
      throw new TypeError('Imported processed claim uses an unsupported namespace');
    });
    Catalog.rewardsThroughLevel(normalized.flipLevel).forEach(function (reward) {
      if (reward.type === 'conditional-feature') return;
      if (normalized.claimedRewardIds.indexOf(reward.id) < 0) {
        throw new TypeError('Imported profile is missing canonical level reward evidence');
      }
    });
    function assertReveal(id) {
      if (id.indexOf('object.') === 0 && objectSet.has(Catalog.canonicalObjectId(id.slice(7)))) return;
      if (id.indexOf('arena.') === 0 && arenaSet.has(Catalog.canonicalArenaId(id.slice(6)))) return;
      if (id.indexOf('feature.') === 0 && featureSet.has(id.slice(8))) return;
      if (/^level\.\d+\.fc$/.test(id) && normalized.claimedRewardIds.indexOf(id) >= 0) return;
      if (id.indexOf('achievement.') === 0 && achievementSet.has(id.slice(12))) return;
      if (id.indexOf('store.') === 0 && cosmeticSet.has(id.slice(6))) return;
      throw new TypeError('Imported reveal is not supported by content state');
    }
    normalized.pendingRevealIds.forEach(function (id) {
      assertReveal(id);
      if (revealWasConsumed(normalized, id)) throw new TypeError('Imported reveal is both pending and consumed');
    });
    normalized.consumedRevealIds.forEach(assertReveal);
    var canonicalProcessed = canonicalEntitlementClaims(normalized);
    if (canonicalProcessed.length !== normalized.processedClaimIds.length) {
      var quarantined = clone(normalized);
      quarantined.processedClaimIds = canonicalProcessed;
      quarantined.legacy.compactedLegacyClaims = Math.min(Number.MAX_SAFE_INTEGER,
        finiteInteger(quarantined.legacy.compactedLegacyClaims) +
        normalized.processedClaimIds.length - canonicalProcessed.length);
      return ProgressionStateV4(quarantined);
    }
    return normalized;
  }

  function isMonotonicExtension(current, incoming) {
    if (incoming.lineageId !== current.lineageId || incoming.revision <= current.revision ||
        incoming.fxp < current.fxp) return false;
    var setFields = ['ownedObjectIds', 'ownedArenaIds', 'ownedCosmeticIds', 'featureIds',
      'achievementIds', 'defeatedRivalIds', 'completedActIds', 'fieldNoteIds', 'claimedRewardIds'];
    for (var index = 0; index < setFields.length; index++) {
      var nextSet = new Set(incoming[setFields[index]]);
      if (current[setFields[index]].some(function (id) { return !nextSet.has(id); })) return false;
    }
    if (current.processedClaimIds.some(function (id) { return !claimWasProcessed(incoming, id); })) return false;
    if (current.consumedRevealIds.some(function (id) { return !revealWasConsumed(incoming, id); })) return false;
    if (incoming.matchClaimCursor < current.matchClaimCursor ||
        incoming.consumedMatchOrdinal < current.consumedMatchOrdinal) return false;
    if (current.activeMatchReservation) {
      var stillActive = incoming.activeMatchReservation &&
        JSON.stringify(incoming.activeMatchReservation) === JSON.stringify(current.activeMatchReservation);
      if (!stillActive && incoming.consumedMatchOrdinal < current.activeMatchReservation.ordinal) return false;
    }
    if (incoming.fcTransactionRollup.transactionCount < current.fcTransactionRollup.transactionCount) return false;
    var absorbed = incoming.fcTransactionRollup.transactionCount -
      current.fcTransactionRollup.transactionCount;
    if (absorbed > current.fcTransactions.length) return false;
    var expectedRollupNet = current.fcTransactionRollup.netAmount;
    current.fcTransactions.slice(0, absorbed).forEach(function (tx) {
      expectedRollupNet += tx.signedAmount;
    });
    if (incoming.fcTransactionRollup.netAmount !== expectedRollupNet) return false;
    var currentRemainder = current.fcTransactions.slice(Math.min(absorbed, current.fcTransactions.length));
    if (currentRemainder.some(function (tx, txIndex) {
      var next = incoming.fcTransactions[txIndex];
      return !next || next.txId !== tx.txId || next.idempotencyKey !== tx.idempotencyKey ||
        next.kind !== tx.kind || next.sourceType !== tx.sourceType || next.sourceId !== tx.sourceId ||
        next.signedAmount !== tx.signedAmount || next.balanceAfter !== tx.balanceAfter ||
        next.timestamp !== tx.timestamp;
    })) return false;
    if (current.pendingRevealIds.some(function (id) {
      return incoming.pendingRevealIds.indexOf(id) < 0 && !revealWasConsumed(incoming, id);
    })) return false;
    if (current.legacy.grandfatheredAlien && !incoming.legacy.grandfatheredAlien) return false;
    if (current.legacy.grandfatheredInsane && !incoming.legacy.grandfatheredInsane) return false;
    var changed = incoming.fxp !== current.fxp || incoming.fcBalance !== current.fcBalance ||
      incoming.pendingRevealIds.join('\u0000') !== current.pendingRevealIds.join('\u0000') ||
      incoming.consumedRevealIds.join('\u0000') !== current.consumedRevealIds.join('\u0000') ||
      incoming.processedClaimIds.join('\u0000') !== current.processedClaimIds.join('\u0000') ||
      incoming.matchClaimCursor !== current.matchClaimCursor ||
      incoming.consumedMatchOrdinal !== current.consumedMatchOrdinal ||
      JSON.stringify(incoming.activeMatchReservation) !== JSON.stringify(current.activeMatchReservation) ||
      incoming.fcTransactions.map(function (tx) { return tx.txId; }).join('\u0000') !==
        current.fcTransactions.map(function (tx) { return tx.txId; }).join('\u0000') ||
      incoming.fcTransactionRollup.transactionCount !== current.fcTransactionRollup.transactionCount ||
      incoming.fcTransactionRollup.netAmount !== current.fcTransactionRollup.netAmount;
    if (!changed) changed = setFields.some(function (field) {
      return incoming[field].length !== current[field].length;
    });
    return changed;
  }

  function compactLegacyLocalClaimHistory(value) {
    if (!value || !Array.isArray(value.processedClaimIds)) return value;
    var source = safeClone(value);
    var seen = new Set();
    source.processedClaimIds.forEach(function (rawId) {
      var id = exactId(rawId, 'Persisted legacy claim ID');
      seen.add(id);
    });
    var retained = canonicalEntitlementClaims(source);
    var removed = seen.size - retained.length;
    if (!removed && retained.length === source.processedClaimIds.length) return value;
    source.processedClaimIds = retained;
    source.legacy = safeClone(source.legacy || Object.create(null));
    source.legacy.compactedLegacyClaims = Math.min(Number.MAX_SAFE_INTEGER,
      finiteInteger(source.legacy.compactedLegacyClaims) + removed);
    source.revision = Math.min(Number.MAX_SAFE_INTEGER, finiteInteger(source.revision) + 1);
    return source;
  }

  function createStore(options) {
    var opts = options || {};
    var storage = opts.storage || null;
    var now = typeof opts.now === 'function' ? opts.now : function () { return Date.now(); };
    var listeners = new Set();
    var notificationQueue = [];
    var deliveringNotifications = false;
    var persistencePoisoned = false;
    var persistedSource = readStorage(storage, KEY, null);
    var persisted = compactLegacyLocalClaimHistory(persistedSource);
    if (persisted && persisted.schema === 'ProgressionStateV4' && persisted.version !== 4) {
      throw new RangeError('Unsupported persisted ProgressionStateV4 version');
    }
    var loadedV4 = !!(persisted && persisted.schema === 'ProgressionStateV4' && persisted.version === 4);
    var state = loadedV4 ? validateImportedState(persisted, { preserveReservation: true })
      : migrateV111(Object.assign({}, opts.legacy || {}, { storage: storage }));
    if (!loadedV4 || state.lineageId === 'unassigned-v4') {
      var initial = clone(state);
      initial.lineageId = exactId(opts.lineageId || opaqueIdentity('local-v4', now()), 'lineageId');
      state = ProgressionStateV4(initial);
    }
    var persistenceError = null;

    function persist(candidate) {
      if (!storage || typeof storage.setItem !== 'function') return true;
      if (persistencePoisoned) return false;
      var previous = null;
      var attempted = false;
      try {
        if (typeof storage.getItem !== 'function') throw new Error('Profile storage cannot verify writes');
        previous = typeof storage.getItem === 'function' ? storage.getItem(KEY) : null;
        var encoded = JSON.stringify(candidate);
        attempted = true;
        storage.setItem(KEY, encoded);
        if (typeof storage.getItem === 'function' && storage.getItem(KEY) !== encoded) {
          throw new Error('Profile persistence verification failed');
        }
        persistenceError = null;
        return true;
      } catch (error) {
        var rollbackFailed = false;
        if (attempted) {
          try {
            var current = typeof storage.getItem === 'function' ? storage.getItem(KEY) : undefined;
            if (current !== previous) {
              if (previous == null) {
                if (typeof storage.removeItem !== 'function') throw new Error('Profile storage cannot roll back insertion');
                storage.removeItem(KEY);
              } else storage.setItem(KEY, previous);
            }
            if (typeof storage.getItem !== 'function' || storage.getItem(KEY) !== previous) {
              throw new Error('Profile persistence rollback verification failed');
            }
          } catch (rollbackError) {
            rollbackFailed = true;
            persistencePoisoned = true;
            error = new Error('Profile persistence rollback failed; store is closed: ' + rollbackError.message);
          }
        }
        persistenceError = error;
        if (rollbackFailed) persistenceError.fatal = true;
        return false;
      }
    }
    if (!loadedV4 || JSON.stringify(persistedSource) !== JSON.stringify(state)) persist(state);

    function snapshot() { return ProgressionStateV4(state); }
    function notify(event) {
      notificationQueue.push(event);
      if (deliveringNotifications) return;
      deliveringNotifications = true;
      try {
        while (notificationQueue.length) {
          var nextEvent = notificationQueue.shift();
          var delivery = Array.from(listeners);
          delivery.forEach(function (listener) {
            try { listener(nextEvent.state, nextEvent); } catch (_) {}
          });
        }
      } finally { deliveringNotifications = false; }
    }
    function result(applied, claimId, extra) {
      return freeze(Object.assign({ applied: applied, duplicate: !applied && !!claimId,
        claimId: claimId || null, state: snapshot() }, extra || {}));
    }
    function refresh() {
      if (persistencePoisoned) return snapshot();
      var external = readStorage(storage, KEY, null);
      if (external && external.schema === 'ProgressionStateV4' && external.version === 4 &&
          external.revision > state.revision) {
        try {
          var validated = validateImportedState(external, { preserveReservation: true });
          if (isMonotonicExtension(state, validated)) {
            state = validated;
            notify(freeze({ applied: true, duplicate: false, claimId: null,
              reason: 'external-extension', type: 'external-refresh', state: snapshot() }));
          }
        } catch (error) { persistenceError = error; }
      }
      return snapshot();
    }
    function commit(claimId, updater) {
      var id = exactId(claimId, 'profile claimId');
      if (persistencePoisoned) return result(false, null, { duplicate: false, reason: 'persistence-closed' });
      refresh();
      if (claimWasProcessed(state, id)) return result(false, id, {
        reason: state.processedClaimIds.indexOf(id) >= 0 ? 'duplicate' : 'duplicate-compacted',
      });
      var draft = clone(state);
      var details = updater(draft) || {};
      addUnique(draft.processedClaimIds, id);
      compactClaims(draft);
      draft.revision = Math.max(state.revision + 1, finiteInteger(draft.revision) + 1);
      draft.flipLevel = Economy.flipLevelForFxp(draft.fxp);
      var next = ProgressionStateV4(draft);
      if (!persist(next)) return result(false, null, { duplicate: false,
        reason: persistencePoisoned ? 'persistence-closed' : 'persistence-failed' });
      state = next;
      var committed = result(true, id, details);
      notify(committed);
      return committed;
    }
    function commitMutation(updater) {
      if (persistencePoisoned) return result(false, null, { duplicate: false, reason: 'persistence-closed' });
      refresh();
      var draft = clone(state);
      var details = updater(draft) || {};
      draft.revision = state.revision + 1;
      var next = ProgressionStateV4(draft);
      if (!persist(next)) return result(false, null, { duplicate: false,
        reason: persistencePoisoned ? 'persistence-closed' : 'persistence-failed' });
      state = next;
      var committed = result(true, null, details);
      notify(committed);
      return committed;
    }
    function sameMatchToken(left, right) {
      return !!left && !!right && left.schema === right.schema && left.version === right.version &&
        left.lineageId === right.lineageId && left.ordinal === right.ordinal &&
        left.nonce === right.nonce && left.matchId === right.matchId &&
        left.activityId === right.activityId && left.reservedAt === right.reservedAt;
    }
    function reserveMatch(matchId, activityId) {
      var immutableMatchId = exactId(matchId, 'matchId');
      var activity = exactId(activityId, 'activityId');
      if (!MATCH_ACTIVITY_IDS.has(activity)) throw new RangeError('Activity cannot reserve reward-bearing matches');
      refresh();
      if (state.activeMatchReservation) {
        if (state.activeMatchReservation.matchId === immutableMatchId &&
            state.activeMatchReservation.activityId === activity) {
          return result(false, null, { duplicate: false, resumed: true,
            reason: 'reservation-active', token: state.activeMatchReservation });
        }
        return result(false, null, { duplicate: false, reason: 'another-match-active',
          token: state.activeMatchReservation });
      }
      if (state.matchClaimCursor >= Number.MAX_SAFE_INTEGER) {
        return result(false, null, { duplicate: false, reason: 'match-ordinal-exhausted' });
      }
      var ordinal = state.matchClaimCursor + 1;
      var reservedAt = finiteInteger(now());
      var token = MatchClaimTokenV1({ schema: 'MatchClaimTokenV1', version: 1,
        lineageId: state.lineageId, ordinal: ordinal,
        nonce: opaqueIdentity('match-nonce-' + ordinal.toString(36), reservedAt),
        matchId: immutableMatchId, activityId: activity, reservedAt: reservedAt });
      return commitMutation(function (draft) {
        if (draft.activeMatchReservation) throw new Error('A reward-bearing match is already reserved');
        draft.matchClaimCursor = ordinal;
        draft.activeMatchReservation = token;
        return { type: 'match-reserved', token: token };
      });
    }
    function resumeMatchReservation() {
      refresh();
      return state.activeMatchReservation;
    }
    function resolveReservationToken(value) {
      var token = MatchClaimTokenV1(value);
      refresh();
      if (token.lineageId !== state.lineageId) throw new RangeError('Match token belongs to another profile lineage');
      if (!state.activeMatchReservation) {
        if (token.ordinal <= state.consumedMatchOrdinal) return { token: token, duplicate: true };
        throw new RangeError('Match token is not the active reservation');
      }
      if (!sameMatchToken(token, state.activeMatchReservation)) {
        throw new RangeError('Match token does not match the active reservation');
      }
      return { token: token, duplicate: false };
    }
    function consumeReservedMatch(tokenInput, rewardInput) {
      var resolved = resolveReservationToken(tokenInput);
      var token = resolved.token;
      var claimId = 'local-match:' + token.lineageId + ':' + token.ordinal;
      if (resolved.duplicate) return result(false, claimId, { reason: 'duplicate' });
      var reward = Economy.calculateMatchReward(rewardInput || {});
      return commitMutation(function (draft) {
        if (!sameMatchToken(token, draft.activeMatchReservation)) {
          throw new RangeError('Match token was superseded before consumption');
        }
        draft.activeMatchReservation = null;
        draft.consumedMatchOrdinal = token.ordinal;
        if (!reward.eligible) return { claimId: claimId, consumed: true,
          reward: reward, reason: reward.reason, fxpAwarded: 0, fcAwarded: 0, granted: [] };
        var beforeLevel = draft.flipLevel;
        var beforeBalance = draft.fcBalance;
        draft.fxp = Math.min(Number.MAX_SAFE_INTEGER, draft.fxp + reward.fxp);
        draft.flipLevel = Economy.flipLevelForFxp(draft.fxp);
        if (reward.fc) appendFc(draft, {
          txId: claimId + ':fc', idempotencyKey: claimId + ':fc',
          kind: 'earn', sourceType: 'match', sourceId: token.matchId,
          signedAmount: reward.fc, timestamp: finiteInteger(now()),
        });
        var granted = grantLevelsCrossed(draft, beforeLevel, { reveal: true, now: finiteInteger(now()) });
        granted = granted.concat(grantAlienGate(draft, true));
        return { claimId: claimId, consumed: true, reward: reward,
          fxpAwarded: reward.fxp, fcAwarded: draft.fcBalance - beforeBalance,
          baseFcAwarded: reward.fc,
          levelsCrossed: Math.max(0, draft.flipLevel - beforeLevel),
          granted: uniqueStrings(granted) };
      });
    }
    function abandonReservedMatch(tokenInput, reasonInput) {
      var resolved = resolveReservationToken(tokenInput);
      var token = resolved.token;
      var claimId = 'local-match:' + token.lineageId + ':' + token.ordinal;
      if (resolved.duplicate) return result(false, claimId, { reason: 'duplicate' });
      var reason = reasonInput == null ? 'abandoned' : exactId(reasonInput, 'abandon reason');
      return commitMutation(function (draft) {
        if (!sameMatchToken(token, draft.activeMatchReservation)) {
          throw new RangeError('Match token was superseded before abandonment');
        }
        draft.activeMatchReservation = null;
        draft.consumedMatchOrdinal = token.ordinal;
        return { claimId: claimId, consumed: true, abandoned: true,
          reason: reason, fxpAwarded: 0, fcAwarded: 0, granted: [] };
      });
    }
    function claimBundle(bundle) {
      var source = bundle && typeof bundle === 'object' ? bundle : {};
      var claimId = exactId(source.claimId, 'claimBundle.claimId');
      var fxpInput = source.fxp == null ? 0 : exactUnsignedInteger(source.fxp, 'claimBundle.fxp');
      var fcInput = source.fc == null ? 0 : exactSignedInteger(source.fc, 'claimBundle.fc');
      var sourceTypeInput = source.sourceType == null ? 'match' : exactId(source.sourceType, 'claimBundle.sourceType');
      if (!FC_SOURCES.has(sourceTypeInput)) throw new RangeError('Unknown claimBundle source type');
      if (sourceTypeInput === 'match') {
        throw new TypeError('Reward-bearing match claims require a reserved MatchClaimTokenV1');
      }
      function exactIds(values, label, mapper) {
        if (values == null) return [];
        if (!Array.isArray(values)) throw new TypeError(label + ' must be an array');
        return uniqueStrings(values.map(function (id) { return exactId(id, label + ' entry'); }), mapper);
      }
      var objectInputs = exactIds(source.objectIds, 'claimBundle.objectIds', Catalog.canonicalObjectId);
      var arenaInputs = exactIds(source.arenaIds, 'claimBundle.arenaIds', Catalog.canonicalArenaId);
      var cosmeticInputs = exactIds(source.cosmeticIds, 'claimBundle.cosmeticIds');
      var featureInputs = exactIds(source.featureIds, 'claimBundle.featureIds');
      var achievementInputs = exactIds(source.achievementIds, 'claimBundle.achievementIds');
      var rivalInputs = exactIds(source.rivalIds, 'claimBundle.rivalIds');
      var actInputs = exactIds(source.actIds, 'claimBundle.actIds');
      var noteInputs = exactIds(source.fieldNoteIds, 'claimBundle.fieldNoteIds');
      var feedbackInputs = exactIds(source.feedbackIds, 'claimBundle.feedbackIds');
      objectInputs.forEach(function (id) { if (!Catalog.object(id)) throw new RangeError('Unknown object: ' + id); });
      arenaInputs.forEach(function (id) { if (!Catalog.arena(id)) throw new RangeError('Unknown arena: ' + id); });
      cosmeticInputs.forEach(function (id) { if (!Catalog.storeCosmetic(id)) throw new RangeError('Unknown cosmetic: ' + id); });
      featureInputs.forEach(function (id) {
        if (['physics-lab', 'insane-mode'].indexOf(id) < 0) throw new RangeError('Unknown feature: ' + id);
      });
      rivalInputs.forEach(function (id) {
        var rival = Catalog.rival(id); if (!rival || rival.id !== id) throw new RangeError('Unknown rival: ' + id);
      });
      actInputs.forEach(storyActId);
      noteInputs.forEach(function (id) {
        if (!/^field-note-act-[1-4]$/.test(id)) throw new RangeError('Unknown field note: ' + id);
      });
      return commit(claimId, function (draft) {
        var beforeLevel = draft.flipLevel;
        var beforeBalance = draft.fcBalance;
        var granted = [];
        var fxp = fxpInput;
        var fc = fcInput;
        var sourceType = sourceTypeInput;
        if (fc < 0 && sourceType !== 'cosmetic-purchase') {
          throw new RangeError('Flip Credits may only be spent on a cosmetic purchase');
        }
        draft.fxp = Math.min(Number.MAX_SAFE_INTEGER, draft.fxp + fxp);
        draft.flipLevel = Economy.flipLevelForFxp(draft.fxp);
        if (fc) appendFc(draft, {
          txId: 'claim:' + claimId + ':fc', idempotencyKey: 'claim:' + claimId + ':fc',
          kind: fc < 0 ? 'spend' : (source.sourceType === 'migration' ? 'migration' : 'earn'),
          sourceType: sourceType,
          sourceId: source.sourceId == null ? claimId : exactId(source.sourceId, 'claimBundle.sourceId'),
          signedAmount: fc, timestamp: finiteInteger(now()),
        });
        objectInputs.forEach(function (id) {
          if (draft.ownedObjectIds.indexOf(id) < 0) { draft.ownedObjectIds.push(id); granted.push('object.' + id); }
        });
        arenaInputs.forEach(function (id) {
          if (draft.ownedArenaIds.indexOf(id) < 0) { draft.ownedArenaIds.push(id); granted.push('arena.' + id); }
        });
        cosmeticInputs.forEach(function (id) {
          if (draft.ownedCosmeticIds.indexOf(id) < 0) { draft.ownedCosmeticIds.push(id); granted.push('cosmetic.' + id); }
        });
        featureInputs.forEach(function (id) {
          if (draft.featureIds.indexOf(id) < 0) { draft.featureIds.push(id); granted.push('feature.' + id); }
        });
        achievementInputs.forEach(function (id) { addUnique(draft.achievementIds, id); });
        rivalInputs.forEach(function (id) { addUnique(draft.defeatedRivalIds, id); });
        actInputs.forEach(function (id) { addUnique(draft.completedActIds, id); });
        noteInputs.forEach(function (id) { addUnique(draft.fieldNoteIds, id); });
        granted = granted.concat(grantLevelsCrossed(draft, beforeLevel, { reveal: source.reveal !== false, now: now() }));
        granted = granted.concat(grantAlienGate(draft, source.reveal !== false));
        var feedback = feedbackInputs;
        feedback.forEach(function (id) {
          if (id.indexOf('achievement.') === 0 && draft.achievementIds.indexOf(id.slice(12)) >= 0) return;
          if (id.indexOf('store.') === 0 && draft.ownedCosmeticIds.indexOf(id.slice(6)) >= 0) return;
          throw new RangeError('Unsupported reward feedback: ' + id);
        });
        if (source.reveal !== false) granted.concat(feedback).forEach(function (id) {
          queueReveal(draft, id);
        });
        return { fxpAwarded: fxp, fcAwarded: draft.fcBalance - beforeBalance,
          baseFcAwarded: fc, levelsCrossed: Math.max(0, draft.flipLevel - beforeLevel),
          granted: uniqueStrings(granted), feedback: feedback };
      });
    }
    function claimMatch(matchToken, rewardInput) {
      return consumeReservedMatch(matchToken, rewardInput);
    }
    function claimAchievement(id, rarity) {
      var achievementId = exactId(id, 'achievementId');
      var reward = Economy.achievementReward(rarity);
      return claimBundle({ claimId: 'achievement:' + achievementId, sourceType: 'achievement',
        sourceId: achievementId, fxp: reward.fxp, fc: reward.fc,
        achievementIds: [achievementId], feedbackIds: ['achievement.' + achievementId], reveal: true });
    }
    function claimRivalVictory(idOrObjectId, immutableClaimId) {
      refresh();
      var requestedRivalId = exactId(idOrObjectId, 'rivalId');
      var rival = Catalog.rival(requestedRivalId);
      if (!rival) throw new RangeError('Unknown rival: ' + idOrObjectId);
      var expectedClaimId = 'rival.' + rival.id + '.first-clear';
      var claimId = immutableClaimId == null ? expectedClaimId : exactId(immutableClaimId, 'rival claimId');
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
      var claimId = immutableClaimId == null ? expectedClaimId : exactId(immutableClaimId, 'Story act claimId');
      var expectedFieldNoteId = 'field-note-act-' + id;
      var noteId = fieldNoteId == null ? expectedFieldNoteId : exactId(fieldNoteId, 'fieldNoteId');
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
        if (exactUnsignedInteger(reward.fxp, 'Story reward FXP') !== (alien ? 75 : 25) ||
            exactUnsignedInteger(reward.fc, 'Story reward FC') !== (alien ? 50 : 15)) {
          throw new RangeError('Story rival reward amount does not match StoryCatalogV1');
        }
        var rivalClaimId = exactId(reward.claimId, 'Story rival reward claimId');
        if (rivalClaimId !== 'rival.' + rival.id + '.first-clear') {
          throw new RangeError('Rival claim ID does not match StoryCatalogV1');
        }
        return freeze({ claimId: rivalClaimId, type: type, rivalId: rival.id,
          objectId: rival.objectId, fxp: alien ? 75 : 25, fc: alien ? 50 : 15,
          alien: alien });
      }
      if (type === 'act-first-clear') {
        var id = storyActId(reward.actId);
        if (exactUnsignedInteger(reward.fxp, 'Story reward FXP') !== 50 ||
            exactUnsignedInteger(reward.fc, 'Story reward FC') !== 25) {
          throw new RangeError('Story act reward amount does not match StoryCatalogV1');
        }
        var actClaimId = exactId(reward.claimId, 'Story act reward claimId');
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
      var ordinaryRequested = source.ordinaryRewardsEligible === true;
      var reservation = null;
      var token = null;
      if (ordinaryRequested) {
        reservation = resolveReservationToken(source.matchClaimToken);
        token = reservation.token;
        if (token.matchId !== matchId || (token.activityId !== 'story' && token.activityId !== 'rival-board')) {
          throw new RangeError('Story match token does not match the Story resolution');
        }
        if (reservation.duplicate) {
          return result(false, 'local-match:' + token.lineageId + ':' + token.ordinal,
            { reason: 'duplicate' });
        }
      }
      var ordinaryReward = ordinaryRequested ? Economy.calculateMatchReward(source.rewardInput || {}) : null;
      var unapplied = componentRewards.filter(function (reward) {
        return reward.type === 'rival-first-clear'
          ? state.defeatedRivalIds.indexOf(reward.rivalId) < 0
          : state.completedActIds.indexOf(reward.actId) < 0;
      });
      if (!token && !unapplied.length) {
        return result(false, null, { duplicate: true, reason: 'duplicate',
          appliedStoryClaimIds: [], skippedStoryClaimIds: componentRewards.map(function (reward) { return reward.claimId; }) });
      }
      var outerClaimId = token ? 'local-match:' + token.lineageId + ':' + token.ordinal
        : 'story-components:' + unapplied.map(function (reward) { return reward.claimId; }).join('+');
      return commitMutation(function (draft) {
        var beforeLevel = draft.flipLevel;
        var beforeBalance = draft.fcBalance;
        var totalFxp = 0;
        var granted = [];
        var appliedComponents = [];
        var skippedComponents = [];

        if (token) {
          if (!sameMatchToken(token, draft.activeMatchReservation)) {
            throw new RangeError('Story match token was superseded before consumption');
          }
          draft.activeMatchReservation = null;
          draft.consumedMatchOrdinal = token.ordinal;
        }

        if (ordinaryReward && ordinaryReward.eligible) {
          totalFxp += ordinaryReward.fxp;
          if (ordinaryReward.fc) appendFc(draft, {
            txId: outerClaimId + ':fc',
            idempotencyKey: outerClaimId + ':fc',
            kind: 'earn', sourceType: 'match', sourceId: matchId,
            signedAmount: ordinaryReward.fc, timestamp: finiteInteger(now()),
          });
        }

        componentRewards.forEach(function (reward) {
          var alreadyApplied = claimWasProcessed(draft, reward.claimId);
          if (reward.type === 'rival-first-clear') {
            alreadyApplied = alreadyApplied || draft.defeatedRivalIds.indexOf(reward.rivalId) >= 0;
          } else {
            alreadyApplied = alreadyApplied || draft.completedActIds.indexOf(reward.actId) >= 0;
          }
          addUnique(draft.processedClaimIds, reward.claimId);
          compactClaims(draft);
          addUnique(draft.claimedRewardIds, reward.claimId);
          if (alreadyApplied) {
            skippedComponents.push(reward.claimId);
            return;
          }
          totalFxp += reward.fxp;
          appendFc(draft, {
            txId: 'component:' + reward.claimId + ':fc',
            idempotencyKey: reward.claimId + ':fc',
            kind: 'earn',
            sourceType: reward.type === 'rival-first-clear' ? 'rival' : 'story-act',
            sourceId: reward.type === 'rival-first-clear' ? reward.rivalId : reward.actId,
            signedAmount: reward.fc, timestamp: finiteInteger(now()),
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
        granted.forEach(function (id) { queueReveal(draft, id); });
        return {
          claimId: outerClaimId,
          consumed: !!token,
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
      var requestedCosmeticId = exactId(cosmeticId, 'cosmeticId');
      var cosmetic = Catalog.storeCosmetic(requestedCosmeticId);
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
      refresh();
      var mergeFields = ['ownedObjectIds', 'ownedArenaIds', 'ownedCosmeticIds', 'featureIds',
        'achievementIds', 'defeatedRivalIds', 'completedActIds', 'fieldNoteIds', 'claimedRewardIds'];
      var incomingEntitlementClaims = canonicalEntitlementClaims(incoming);
      var noNewContent = state.fxp >= incoming.fxp && state.fcBalance >= incoming.fcBalance &&
        mergeFields.every(function (field) {
          var local = new Set(state[field]);
          return incoming[field].every(function (id) { return local.has(id); });
        }) && incomingEntitlementClaims.every(function (id) {
          return state.processedClaimIds.indexOf(id) >= 0;
        }) && incoming.pendingRevealIds.every(function (id) {
          return state.pendingRevealIds.indexOf(id) >= 0 || revealWasConsumed(state, id);
        }) && incoming.consumedRevealIds.every(function (id) { return revealWasConsumed(state, id); });
      if (noNewContent) {
        return result(false, outerClaimId, { reason: 'duplicate', imported: false });
      }
      return commitMutation(function (draft) {
        var beforeLevel = draft.flipLevel;
        var beforeBalance = draft.fcBalance;
        draft.fxp = Math.max(draft.fxp, incoming.fxp);
        draft.flipLevel = Economy.flipLevelForFxp(draft.fxp);
        // Reconcile the canonical level ladder from FXP before accepting claim
        // evidence from the imported file.  A partial or old V4 snapshot can
        // therefore add ownership but can never suppress an earned level grant.
        var granted = grantLevelsCrossed(draft, beforeLevel, { reveal: false, now: now() });

        var targetFloor = Math.max(beforeBalance, incoming.fcBalance);
        var floorAmount = Math.max(0, targetFloor - draft.fcBalance);
        if (floorAmount) appendFc(draft, {
          txId: outerClaimId + ':balance-floor',
          idempotencyKey: outerClaimId + ':balance-floor',
          kind: 'migration', sourceType: 'migration', sourceId: importId,
          signedAmount: floorAmount, timestamp: finiteInteger(now()),
        });

        [
          ['ownedObjectIds', Catalog.canonicalObjectId],
          ['ownedArenaIds', Catalog.canonicalArenaId],
          ['ownedCosmeticIds', null], ['featureIds', null],
          ['achievementIds', null], ['defeatedRivalIds', null],
          ['completedActIds', null], ['fieldNoteIds', null],
          ['claimedRewardIds', null],
        ].forEach(function (definition) {
          uniqueStrings(incoming[definition[0]], definition[1]).forEach(function (id) {
            addUnique(draft[definition[0]], id);
          });
        });
        incomingEntitlementClaims.forEach(function (id) { addUnique(draft.processedClaimIds, id); });
        compactClaims(draft);
        // Raw claim IDs belong to the source profile's namespace.  They are
        // retained only as bounded external evidence and never participate in
        // this device's live match-id idempotence check.
        draft.externalClaimEvidence = normalizeExternalLineages(
          draft.externalClaimEvidence.concat([{ lineageId: incoming.lineageId,
            throughRevision: incoming.revision }]));
        incoming.consumedRevealIds.forEach(function (id) { consumeReveal(draft, id); });
        draft.pendingRevealIds = draft.pendingRevealIds.filter(function (id) {
          return !revealWasConsumed(draft, id);
        });
        incoming.pendingRevealIds.forEach(function (id) { queueReveal(draft, id); });
        draft.legacy = {
          reconciledV111: !!(draft.legacy.reconciledV111 || incoming.legacy.reconciledV111),
          qualifyingWins: Math.max(finiteInteger(draft.legacy.qualifyingWins),
            finiteInteger(incoming.legacy.qualifyingWins)),
          sourceRelease: draft.legacy.sourceRelease || incoming.legacy.sourceRelease,
          grandfatheredAlien: !!(draft.legacy.grandfatheredAlien || incoming.legacy.grandfatheredAlien),
          grandfatheredInsane: !!(draft.legacy.grandfatheredInsane || incoming.legacy.grandfatheredInsane),
          quarantinedMatchReservations: Math.max(
            finiteInteger(draft.legacy.quarantinedMatchReservations),
            finiteInteger(incoming.legacy.quarantinedMatchReservations)),
          compactedLegacyClaims: Math.max(
            finiteInteger(draft.legacy.compactedLegacyClaims),
            finiteInteger(incoming.legacy.compactedLegacyClaims)),
        };
        draft.revision = Math.max(draft.revision, incoming.revision);
        granted = granted.concat(grantAlienGate(draft, false));
        return {
          claimId: outerClaimId,
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
      var requested = ids == null ? state.pendingRevealIds.slice() : (function () {
        if (!Array.isArray(ids)) throw new TypeError('reveal IDs must be an array');
        return uniqueStrings(ids.map(function (id) { return exactId(id, 'reveal ID'); }));
      })();
      var current = new Set(state.pendingRevealIds);
      var values = requested.filter(function (id) { return current.has(id); });
      if (!values.length) return result(false, null, { duplicate: false, reason: 'empty' });
      return commitMutation(function (draft) {
        var removed = new Set(values);
        draft.pendingRevealIds = draft.pendingRevealIds.filter(function (id) { return !removed.has(id); });
        values.forEach(function (id) { consumeReveal(draft, id); });
        return { dismissed: values };
      });
    }
    function subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('profile subscriber must be a function');
      var options = arguments.length > 1 ? arguments[1] : null;
      if (!deliveringNotifications && options && options.emitCurrent !== false) {
        listener(snapshot(), freeze({ type: 'current', applied: false, duplicate: false,
          claimId: null, state: snapshot() }));
      }
      listeners.add(listener);
      return function () { listeners.delete(listener); };
    }
    function exportState() { return snapshot(); }
    function lastPersistenceError() { return persistenceError; }
    function persistenceStatus() {
      return freeze({ closed: persistencePoisoned, error: persistenceError ? persistenceError.message : null });
    }

    return freeze({
      snapshot: snapshot, refresh: refresh, subscribe: subscribe, exportState: exportState,
      reserveMatch: reserveMatch, resumeMatchReservation: resumeMatchReservation,
      consumeReservedMatch: consumeReservedMatch, abandonReservedMatch: abandonReservedMatch,
      claimMatch: claimMatch, claimAchievement: claimAchievement,
      claimRivalVictory: claimRivalVictory, claimStoryAct: claimStoryAct,
      claimStoryReward: claimStoryReward, claimStoryMatchResolution: claimStoryMatchResolution,
      purchaseCosmetic: purchaseCosmetic, mergeImportedState: mergeImportedState,
      dismissReveals: dismissReveals,
      lastPersistenceError: lastPersistenceError, persistenceStatus: persistenceStatus,
    });
  }

  var browserStorage = null;
  try { browserStorage = root && root.localStorage ? root.localStorage : null; } catch (_) {}
  var defaultStore = createStore({ storage: browserStorage });

  return freeze({
    schema: 'ProgressionStateV4', version: 4, storageKey: KEY, legacyKeys: clone(LEGACY_KEYS),
    retentionPolicy: clone(RETENTION),
    ProgressionStateV4: ProgressionStateV4, FcTransactionV1: FcTransactionV1,
    MatchClaimTokenV1: MatchClaimTokenV1,
    validateImportedState: validateImportedState,
    migrateV111: migrateV111, migrateSetupSelection: migrateSetupSelection,
    storyActIds: STORY_ACT_IDS.slice(), alienGateSatisfied: alienGateSatisfied,
    isAlienUsable: isAlienUsable, isInsaneUsable: isInsaneUsable,
    createMemoryStorage: createMemoryStorage, createStore: createStore,
    snapshot: defaultStore.snapshot, refresh: defaultStore.refresh, subscribe: defaultStore.subscribe,
    exportState: defaultStore.exportState,
    reserveMatch: defaultStore.reserveMatch,
    resumeMatchReservation: defaultStore.resumeMatchReservation,
    consumeReservedMatch: defaultStore.consumeReservedMatch,
    abandonReservedMatch: defaultStore.abandonReservedMatch,
    claimMatch: defaultStore.claimMatch, claimAchievement: defaultStore.claimAchievement,
    claimRivalVictory: defaultStore.claimRivalVictory, claimStoryAct: defaultStore.claimStoryAct,
    claimStoryReward: defaultStore.claimStoryReward,
    claimStoryMatchResolution: defaultStore.claimStoryMatchResolution,
    purchaseCosmetic: defaultStore.purchaseCosmetic,
    mergeImportedState: defaultStore.mergeImportedState,
    dismissReveals: defaultStore.dismissReveals,
    lastPersistenceError: defaultStore.lastPersistenceError,
    persistenceStatus: defaultStore.persistenceStatus,
    defaultStore: defaultStore,
  });
});
