'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const Stats = require('../js/v111-stats.js');
const Data = require('../js/v112-data.js');
const Catalog = require('../js/v112-progression-catalog.js');
const bundle = fs.readFileSync(path.join(__dirname, '../js/v112-browser-bundle.js'), 'utf8');
const row = (id, overrides = {}) => Object.assign({ schema:'FlipRecordV2', version:2,
  id, matchId:'match-a', timestamp:1800000000000, activityId:'story', formatId:'classic',
  physicsModeId:'normal', storyChapterId:'first-broadcast', rivalId:'first-light',
  result:'MAKE', pose:'upright', playerId:'seat-16', displayName:'Mara', seat:15,
  playerCount:16, objectId:'desk-gyroscope', variantId:'desk-gyroscope.blue-steel',
  arenaId:'school-cafeteria', cosmeticId:'trail.sparks' }, overrides);
async function dataRoundTrip() {
  const input = row('one');
  const normalized = Stats.normalizeFlipRecord(input);
  assert.equal(normalized.schema, 'FlipRecordV2'); assert.equal(normalized.activityId, 'story');
  assert.equal(normalized.storyChapterId, input.storyChapterId);
  assert.equal(normalized.objectId, 'desk-gyroscope');
  assert.equal(Stats.normalizeFlipRecord({result:'MISS'}).schema, 'FlipRecordV1');
  assert.throws(() => Stats.normalizeFlipRecord(row('bad',{version:3})), /version/);
  assert.throws(() => Stats.normalizeMatchRecord({schema:'MatchRecordV3',version:3}), /version/);
  assert.equal(Stats.normalizeFlipRecord(row('offline',{online:true})).online, false);
  const store = Stats.createStore({backend:Stats.createMemoryBackend(), maxRawFlips:1});
  await store.recordFlip(input); await store.recordFlip(row('two',{timestamp:1800000000100}));
  await store.recordFlip(row('three',{timestamp:1800000000200,activityId:'free-play'}));
  const filtered = await store.query({activityIds:['story'],playerCounts:[16],seats:[15]});
  assert(filtered.rollups.length > 0, 'Pruning retains activity and 16th seat');
  const storyTotal = await store.summary({activityIds:['story']});
  assert.equal(storyTotal.flips, 2, 'Pruned activity totals remain filterable');
  assert.equal((await store.summary({activityIds:['story'],storyChapterIds:['first-broadcast']})).flips,2);
  assert.equal((await store.summary({storyChapterIds:['visitor-zero']})).flips,0);
  const participants = Array.from({length:16},(_,seat)=>({id:'seat-'+(seat+1), name:'Player '+(seat+1),seat,objectId:'bottle'}));
  await store.recordMatch({schema:'MatchRecordV2',version:2,id:'story-match',matchId:'story-match',
    activityId:'story',formatId:'classic',physicsModeId:'normal',storyChapterId:'first-broadcast',
    players:participants, winnerIds:['seat-16'], story:{chapterId:'first-broadcast',cleared:true}});
  await store.recordMatch({schema:'MatchRecordV2',version:2,id:'battle-match',matchId:'battle-match',
    activityId:'free-play',formatId:'battle',physicsModeId:'normal',battleFormatId:'timed-rush',
    players:participants,battle:{heats:[{score:[12,10]}]}});
  const storyCsv = await store.exportCSV('story');
  const battleCsv = await store.exportCSV('battle');
  assert.match(storyCsv,/first-broadcast/); assert.doesNotMatch(storyCsv,/battle-match/);
  assert.match(battleCsv,/timed-rush/); assert.doesNotMatch(battleCsv,/story-match/);
  assert.doesNotMatch(storyCsv,/Mara/);
  const archive = await store.exportJSON({includeTestData:true});
  const imported = Stats.createStore({backend:Stats.createMemoryBackend()});
  await imported.importJSON(archive); const first = await imported.summary();
  await imported.importJSON(archive); const second = await imported.summary();
  assert.equal(second.flips, first.flips); assert.equal(second.matches, 2);
  const rows = await imported.query({activityIds:['story']});
  assert.equal(rows.matches[0].schema,'MatchRecordV2');
  assert.equal(rows.matches[0].players.length,16); assert.equal(rows.matches[0].story.cleared,true);
  assert.equal((await imported.summary({activityIds:['story']})).flips,2);
  for (const id of Catalog.objectIds.concat(['giraffe','tall-buildings'])) {
    const cell = Stats.aggregateRecords([Stats.normalizeFlipRecord(row(id,{objectId:id}))])[0];
    assert.equal(cell.dimensions.objectId,id,'Canonical and historical object preserved: '+id);
  }
  for (const id of Catalog.arenaIds) {
    const cell = Stats.aggregateRecords([Stats.normalizeFlipRecord(row(id,{arenaId:id}))])[0];
    assert.equal(cell.dimensions.arenaId,id,'Arena preserved: '+id);
  }
  for (const cosmetic of Catalog.storeCosmetics) {
    const cell = Stats.aggregateRecords([Stats.normalizeFlipRecord(row(cosmetic.id,{cosmeticId:cosmetic.id}))])[0];
    assert.equal(cell.dimensions.cosmeticId,cosmetic.id,'Store cosmetic preserved: '+cosmetic.id);
  }
  await store.close(); await imported.close();
}
function browser(storage = new Map(), statsStore) {
  const context = vm.createContext({ console, crypto:webcrypto, AbortController,
    FlipgameV111Stats:Object.freeze(Object.assign({},Stats,{defaultStore:statsStore})),
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},
    navigator:{locks:{request:(_name,_options,callback)=>Promise.resolve().then(()=>callback({name:'writer'}))}},
  });
  vm.runInContext(bundle,context);
  return {app:context.FlipgameV112,storage,run:code=>vm.runInContext(code,context)};
}
async function browserAuthority() {
  const store = Stats.createStore({backend:Stats.createMemoryBackend()});
  const h = browser(new Map(),store); await h.app.ready;
  assert.equal(h.app.objects().length,51); assert.equal(h.app.arenas().length,23);
  assert.equal(h.app.store().length,40); assert.equal(h.app.achievements().length,120);
  assert.equal(h.app.objects().filter(item=>!item.locked).length,1);
  assert.equal(h.app.arenas().filter(item=>!item.locked).length,1);
  assert.equal(h.app.statistics.recordFlip,undefined); assert.equal(h.app.statistics.recordMatch,undefined);
  assert.equal(h.app.claimMatch,undefined); assert.equal(h.app.claimAchievement,undefined);
  assert.throws(()=>h.app.beginSession({roster:[{name:'One',variantId:999},{name:'Two'}]}),/variant/);
  assert.throws(()=>h.app.beginSession({arenaId:'space-station',roster:[{name:'One'},{name:'Two'}]}),/arena/);
  assert.throws(()=>h.app.beginSession({roster:[{name:'One',cosmeticId:'finish.chrome'},{name:'Two'}]}),/cosmetic/);
  h.run(`var frame, wake, launch = 0;
    FlipgameV112.attachPhysics({snapshot:function(){return frame;},subscribe:function(fn){wake=fn;return function(){};}});
    function shot(made){
      frame={launchId:'shot-'+(++launch),qualified:true,manual:true,atMs:0,grounded:false,landing:null};wake();
      frame=Object.assign({},frame,{atMs:700,grounded:true});wake();
      frame=Object.assign({},frame,{atMs:720});wake();
      frame=Object.assign({},frame,{atMs:1400,power:.5,direction:1,rotations:1,contacts:1,
        landing:{result:made?'MAKE':'MISS',pose:made?'cap':'miss',reason:'engine-settled',stableForMs:600}});wake();
    }
    FlipgameV112.beginSession({startingLives:1,roster:[{name:'One'},{name:'Two'}]});
    shot(true);shot(false);`);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.app.snapshot().warning,null);
  assert.equal(h.app.snapshot().session.status,'completed');
  await h.app.statistics.flush();
  let records = await h.app.statistics.query();
  assert.equal(records.flips.length,2); assert.equal(records.matches.length,1);
  assert(records.flips.every(flip=>flip.schema==='FlipRecordV2' && flip.objectId==='bottle'));
  assert(records.flips.every(flip=>flip.flightMs===1400 && flip.firstContactMs===700 && flip.settleMs===700));
  assert.equal(records.flips[0].onFireBefore,false);
  assert.equal(records.flips[0].variantId,'bottle.blue-steel');
  assert.equal(records.matches[0].schema,'MatchRecordV2');
  const earned = h.app.snapshot().profile.fxp;
  await h.app.retryFinalization(); await h.app.statistics.flush();
  assert.equal((await store.query()).matches.length,1); assert.equal(h.app.snapshot().profile.fxp,earned);
  h.run(`FlipgameV112.beginSession({activityId:'practice',roster:[{name:'One'}]});shot(true);`);
  h.app.abandonSession(); await h.app.statistics.flush();
  assert.equal((await store.query()).flips.length,2);
  assert.equal((await store.query({includeTestData:true})).flips.length,3);
  h.app.enableOwnerTesting('Howe Test Mode');
  h.run(`FlipgameV112.beginSession({startingLives:1,roster:[{name:'One'},{name:'Two'}]});shot(true);shot(false);`);
  await new Promise(resolve=>setImmediate(resolve)); await h.app.statistics.flush();
  assert.equal((await store.query()).flips.length,2,'Owner testing excluded by default');
  assert.equal(h.app.snapshot().profile.fxp,earned); h.app.disableOwnerTesting();
  h.app.close(); await store.close();
}
async function migration() {
  const storage = new Map([['flipgame.progression.v3',JSON.stringify({schema:'ProgressionStateV3',version:3,
    qualifyingWins:100,ownedObjectIds:['bottle','giraffe','tall-buildings'],
    ownedCosmeticIds:['finish.chrome','arena.rooftop'],achievementIds:['first_flip'],
    claimedRewardIds:['feature.insane-mode','feature.physics-lab']})]]);
  const store=Stats.createStore({backend:Stats.createMemoryBackend()});
  const h=browser(storage,store); await h.app.ready;
  const snapshot=h.app.snapshot();
  assert.equal(snapshot.profile.flipLevel,100); assert.equal(h.app.objects().filter(x=>!x.locked).length,51);
  assert(h.app.isObjectAvailable('desk-gyroscope')); assert(h.app.isObjectAvailable('mechanical-metronome'));
  assert(h.app.isCosmeticAvailable('finish.chrome')); assert(h.app.isArenaAvailable('rooftop'));
  assert(h.app.isFeatureAvailable('insane-mode')); assert.equal(snapshot.profile.defeatedRivalIds.length,0);
  assert.equal(snapshot.pendingReveals.length,0,'Migration does not reannounce ownership');
  assert.equal(h.app.achievements().filter(x=>!x.locked).length,1);
  const before=snapshot.profile.fcBalance;
  h.app.purchaseCosmetic('trail.sparks'); assert.equal(h.app.snapshot().profile.fcBalance,before,'Migrated owned cosmetics cost nothing');
  h.app.close();
  const reload=browser(storage,store); await reload.app.ready;
  assert.equal(reload.app.snapshot().profile.fcBalance,before); assert(reload.app.isCosmeticAvailable('trail.sparks'));
  reload.app.close();
  const shop=browser(new Map([['flipgame.progression.v3',JSON.stringify({qualifyingWins:20})]]),store);
  await shop.app.ready;
  const balance=shop.app.snapshot().profile.fcBalance;
  assert(!shop.app.isCosmeticAvailable('finish.porcelain'));
  shop.app.purchaseCosmetic('finish.porcelain'); assert.equal(shop.app.snapshot().profile.fcBalance,balance-225);
  shop.app.purchaseCosmetic('finish.porcelain'); assert.equal(shop.app.snapshot().profile.fcBalance,balance-225);
  shop.app.close();
  const shopReload=browser(shop.storage,store);await shopReload.app.ready;
  assert(shopReload.app.isCosmeticAvailable('finish.porcelain'));assert.equal(shopReload.app.snapshot().profile.fcBalance,balance-225);
  shopReload.app.close(); await store.close();
}
async function failureIsolation() {
  let writes=0;
  const pipeline=Data.createDataPipeline({store:{recordMatch(){writes++;throw new Error('disk full');},flush(){return Promise.resolve();}}});
  const request={matchId:'failed',activityId:'free-play',formatId:'classic',physicsModeId:'normal',roster:[],rulesOptions:{}};
  pipeline.recordMatch({request,startedAt:Date.now()});
  assert.equal(writes,0,'Diagnostics are scheduled after synchronous rules work');
  await pipeline.view.flush(); assert.equal(writes,1); assert.match(pipeline.view.warning(),/unavailable/);
}
(async()=>{await dataRoundTrip();await browserAuthority();await migration();await failureIsolation();
  console.log('v1.12 live profile/data: canonical content, migration, ownership, Store dedup, private outcome recording, V2 archives, 16 seats, retention filters, Story/Battle CSV and storage isolation passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
