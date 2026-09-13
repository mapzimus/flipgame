'use strict';
const assert=require('node:assert/strict');
const Routes=require('../js/v112-battle-routes.js');
const Battle=require('../js/v112-battle.js');
const roster=count=>Array.from({length:count},(_,i)=>({id:`p${i+1}`,displayName:`Entry ${i+1}`,flipperId:'bottle',type:'human'}));
function fixture(count=2, hardware={width:1280,verifiedContacts:4}) {
  let state=null, wake=()=>{}, status='playing', prepared=null, launches=0, choices=0, cancels=0;
  const host={schema:'FlipgameV112BattleHostV1',capabilities:()=>Battle.hardwareProfile(hardware),
    prepare:async request=>{prepared=request;return {handle:'private-handle'};},
    start:async(handle,view)=>{assert.equal(handle,'private-handle');assert.equal(view.stage,'stage');launches++;
      state=Battle.startHeat(Battle.createState({...prepared,matchId:'route-match',seed:91,hardware}));},
    snapshot:()=>({status,state,lanes:state.activePlayerIds.map((id,i)=>({laneId:`lane${i}`,playerId:id,status:'Ready'}))}),
    subscribe:fn=>{wake=fn;return()=>{wake=()=>{};};},cancel:async()=>{cancels++;},
    choosePower:async input=>{choices++;const player=state.config.players.find(p=>p.id===input.playerId), key=player.teamId||player.id;
      state=Battle.choosePower(state,{playerId:input.playerId,index:state.powerOffers[key].findIndex(c=>c.id===input.cardId),targetId:input.targetId});wake();},
    abandon:async()=>{status='settled';wake();},retryFinalization:async()=>{status='settled';wake();},
  };
  const route=Routes.create({getHost:()=>host,getPlayers:()=>roster(count),getStage:()=>'stage'});
  return {route,host,get state(){return state;},get prepared(){return prepared;},get launches(){return launches;},get choices(){return choices;},get cancels(){return cancels;},
    status(value){status=value;wake();},attempt(playerId,pose,id){
      if(state.config.paceId==='rush')state=Battle.markLaunch(state,{attemptId:id,playerId});
      state=Battle.recordAttempt(state,{attemptId:id,playerId,pose,qualifiedManual:true});wake();},
  };
}
(async()=>{
  const missing=Routes.create({getHost:()=>null,getPlayers:()=>roster(2)});
  missing.open();assert.equal(await missing.start(),false);assert.match(missing.snapshot().message,/not connected/);
  for(const format of Routes.formats) for(const width of [360,768,1280,1366,1920,3840]) {
    const f=fixture(format.count,{width,verifiedContacts:4});f.route.open();f.route.configure({formatId:format.id});
    assert.equal(await f.route.start(),true);assert.equal(f.prepared.players.length,format.count);
    assert(f.route.snapshot().hud.lanes.length<=4);assert.equal(f.launches,1);
    assert.equal(await f.route.start(),false,'Cannot start twice');
    if(width<768)assert.equal(f.route.snapshot().hardware.fallback,'alternating-relay');
    if(['doubles','team'].includes(format.formatId))assert.deepEqual(f.prepared.players.slice(0,4).map(p=>p.teamId),['team-a','team-b','team-a','team-b']);
    await f.route.close();
  }
  const mismatch=fixture(2);mismatch.route.open();mismatch.route.configure({formatId:'team-8'});
  assert.equal(await mismatch.route.start(),false);assert.equal(mismatch.launches,0);
  const f=fixture();f.route.open();f.route.configure({paceId:'rush',powerProfileId:'mayhem'});await f.route.start();
  assert.equal(await f.route.choosePower({playerId:'p1',cardId:'plinko'}),false);
  for(let i=0;i<3;i++)f.attempt('p1','miss',`miss-${i}`);
  const hud=f.route.snapshot().hud, owner=hud.scores[0];
  assert.equal(owner.score,0);assert.equal(owner.offers.length,2,'Actual Rules offers after three qualified misses');
  const offered=owner.offers.find(c=>c.scope==='target')||owner.offers[0];
  if(offered.scope==='target')assert.equal(await f.route.choosePower({playerId:'p1',cardId:offered.id,targetId:'p1'}),false);
  assert.equal(await f.route.choosePower({playerId:'p1',cardId:offered.id,targetId:'p2'}),true);
  assert.equal(f.choices,1);assert.equal(f.route.snapshot().hud.scores[0].stored.id,offered.id);
  assert.equal(await f.route.choosePower({playerId:'p1',cardId:offered.id,targetId:'p2'}),false);
  f.attempt('p2','cap','cap-1');assert.equal(f.route.snapshot().hud.scores[1].score,2);
  assert(Object.isFrozen(f.route.snapshot().hud));
  f.status('finalizing');assert.equal(await f.route.close(),false);
  f.status('retryable');assert.equal(await f.route.retry(),true);assert.equal(f.route.snapshot().hud.status,'settled');
  assert.equal(await f.route.close(),true);
  for(const name of ['resolve','finalize','grant','recordAttempt','advanceClock','consumePower']) assert.equal(f.route[name],undefined);
  // A heat that will not open sends the player back to the lineup. The real host
  // drops its own reservation when start() fails, so the cancel this screen tries
  // next is refused -- and that refusal must not become the player's problem.
  const broken=fixture();
  broken.host.start=async()=>{throw new Error('the table would not open');};
  broken.host.cancel=async()=>{throw new Error('That Battle reservation is not current');};
  broken.host.snapshot=()=>null;
  broken.route.open();
  assert.equal(await broken.route.start(),false,'A heat that cannot open does not start');
  assert.equal(broken.route.snapshot().route,'setup','A failed heat returns to the lineup');
  assert.equal(broken.route.snapshot().hud,null,'A failed heat leaves no scoreboard');
  assert.equal(await broken.route.close(),true,'Leaving is never a dead end');
  assert.equal(broken.route.snapshot().route,'closed');

  const invalid=fixture();invalid.host.capabilities=()=>({width:360,verifiedContacts:4,activeLaneLimit:4,simultaneous:true});invalid.route.open();
  assert.equal(await invalid.route.start(),false,'Phone cannot claim four qualified lanes');
  assert.throws(()=>Routes.project({...f.host.snapshot(),lanes:Array.from({length:5},(_,i)=>({laneId:String(i),playerId:'p1'}))}),/invalid/);
  console.log('Battle route tests passed: all 9 formats × 6 viewports, real Rules score/charge/offer projections, relay qualification, invalid host/roster, no UI outcome authority.');
})().catch(error=>{console.error(error);process.exitCode=1;});
