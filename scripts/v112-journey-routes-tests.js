'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const Routes=require('../js/v112-journey-routes.js');
const Profile=require('../js/v112-profile.js'),Story=require('../js/v112-story.js');
const Runtime=require('../js/v112-story-runtime.js'),View=require('../js/v112-story-view.js');
const Rules=require('../js/v112-rules.js'),Training=require('../js/v112-training.js');
const humans=[{id:'human-1',displayName:'Mr. Howe',flipperId:'bottle'},
  {id:'human-2',displayName:'Second',flipperId:'bottle'}];
const storage=Profile.createMemoryStorage(),profile=Profile.createTestStore({storage,now:()=>112});
const storyStore=Runtime.createStoryStateStore({storage,initialState:Story.defaultState()});
const runtime=Runtime.createStoryRuntime({profileStore:profile,storyStore});
let active=null,tour=null,lastLaunch=null,status=null,wake=()=>{},serial=0,plays=0;
const handles=new WeakMap(),inputs=[];
const host={schema:'FlipgameV112JourneyHostV1',storyViews:()=>runtime.views(),
  prepareStory(input){inputs.push(input);const session=runtime.start({...input,matchId:'routes-'+(++serial)});
    const handle=Object.freeze({});handles.set(handle,session);
    return {handle,request:session.request,card:View.broadcastCard({chapterId:session.request.activityContext.chapterId,
      attempt:session.request.activityContext.attempt})};},
  startPreparedStory(handle){assert.ok(handles.has(handle));active=handles.get(handle);status={kind:'story',status:'playing'};},
  cancelPreparedStory(handle){const session=handles.get(handle);assert.ok(session);runtime.abandon(session.request.matchId,'back');handles.delete(handle);},
  activitySnapshot:()=>status,subscribe(fn){wake=fn;return()=>{wake=()=>{};};},
  retryFinalization(){throw new Error('No captured terminal outcome');},
  startTour({human}){tour=Training.createTutorialSession({sessionId:'tour-'+(++serial),roster:[human],seed:42});status={kind:'tour',status:'settled',tour:tour.snapshot()};},
  acknowledgeTour(){tour.acknowledge();status={kind:'tour',status:'settled',tour:tour.snapshot()};wake();},
  launchTourAttempt(){const pending=tour.prepareAttempt();lastLaunch=pending;
    status={kind:'tour',status:'playing',tour:tour.snapshot()};wake();},
  skipTour(){tour.skip();status={kind:'tour',status:'settled',tour:tour.snapshot()};},
};
const controller=Routes.create({getHost:()=>host,getHumans:count=>humans.slice(0,count),onPlay(){plays++;}});
async function finishStory(){
  const r=active.request;
  let rules=Rules.createClassicState({matchId:r.matchId,players:r.roster,startingLives:r.rulesOptions.startingLives,
    opponentTargeting:r.rulesOptions.opponentTargeting,clearCondition:r.rulesOptions.clearCondition});
  for(let i=0;i<1000&&rules.phase!=='complete';i++){
    rules=Rules.resolveClassicFlip(rules,{result:rules.players[rules.currentPlayerIndex].id==='human-1'?'MAKE':'MISS'}).state;
  }
  assert.equal(rules.phase,'complete');
  const captured=Rules.toMatchOutcomeV2(rules,{telemetry:{qualifiedManualHumanFlips:4}});
  const before=storyStore.snapshot();status={kind:'story',status:'finalizing'};wake();
  assert.deepEqual(storyStore.snapshot(),before,'route cannot advance checkpoint before finalization');
  assert.equal(controller.snapshot().route,'pending-result');
  const result=await runtime.finalize(captured);
  status={kind:'story',status:'settled',message:'Saved'};wake();active=null;return result;
}
(async()=>{
  const denied=Routes.create({getHost:()=>null,getHumans:()=>humans});
  await denied.openStory();assert.match(denied.snapshot().message,/not connected/);
  await denied.startTour();assert.match(denied.snapshot().message,/not connected/);
  const before=profile.snapshot();
  await controller.openStory();assert.equal(controller.snapshot().items[0].chapterId,'first-broadcast');
  assert.equal(controller.snapshot().items.filter(item=>item.locked).length,11);
  await controller.choose('visitor-zero');assert.match(controller.snapshot().message,/not available/);
  assert.deepEqual(profile.snapshot(),before);
  await controller.choose('first-broadcast',true);
  assert.equal(controller.snapshot().request.roster.length,8);
  assert.equal(inputs.at(-1).humans.length,2);
  assert.equal(controller.snapshot().request.startingLives,10);
  assert.equal(controller.snapshot().request.arenaId,'rooftop');
  assert.equal(storyStore.snapshot().clearedChapterIds.length,0);
  await controller.close();assert.equal(storyStore.snapshot().defeatedRivalIds.length,0);
  await controller.openStory();await controller.choose('first-broadcast');await controller.enter();
  assert.equal(plays,1);await finishStory();
  assert.ok(storyStore.snapshot().clearedPreliminaryIds.includes('wfc-qualifier'));
  assert.equal(storyStore.snapshot().defeatedRivalIds.length,0);
  await controller.choose('first-broadcast');assert.equal(controller.snapshot().request.roster.length,2);
  assert.equal(controller.snapshot().request.startingLives,3);await controller.enter();await finishStory();
  assert.ok(storyStore.snapshot().defeatedRivalIds.includes('first-light'));
  await controller.openRivals();assert.equal(controller.snapshot().items[0].defeated,true);
  const earned=JSON.stringify(profile.snapshot()),checkpoint=JSON.stringify(storyStore.snapshot());
  await controller.choose('first-light');await controller.enter();await finishStory();
  assert.equal(JSON.stringify(profile.snapshot()),earned,'rival replay cannot repeat first-clear reward');
  assert.equal(JSON.stringify(storyStore.snapshot()),checkpoint,'rival replay cannot rewrite checkpoint');

  // Actual training runtime; only this HOST test fixture supplies input and
  // landing evidence. No route method accepts these values or fabricated wins.
  await controller.startTour();const shots=[];
  for(let i=0;i<20&&!tour.snapshot().state.completed;i++){
    const step=tour.snapshot().step;
    if(step.kind==='card'){await controller.continueTour();continue;}
    await controller.continueTour();assert.equal(tour.snapshot().activeAttempt.phase,'prepared');
    const attempt=lastLaunch;
    const launch=tour.qualifyLaunch(attempt.attemptId,{qualifiedManual:true,normalizedPower:.6,normalizedDirection:0,pointerType:'touch'},10000);
    shots.push({object:launch.flipperId,event:launch.eventSelection&&launch.eventSelection.eventId});
    assert.equal(launch.testData,true);assert.equal(launch.progressionEligible,false);
    const demonstration=!!launch.eventSelection;
    const outcome=tour.resolveAttempt(attempt.attemptId,{phase:'resolved',result:demonstration?'MISS':'MAKE',pose:step.id==='cap'?'cap':'upright'});
    assert.deepEqual(outcome.resolution.awards,[]);
    status={kind:'tour',status:'settled',tour:tour.snapshot()};wake();
  }
  assert.equal(tour.snapshot().state.completed,true);
  assert.ok(shots.some(s=>s.object==='bottle'));
  assert.ok(shots.some(s=>s.object==='trex'&&s.event==='rainbow-corkscrew'));
  assert.ok(shots.some(s=>s.object==='trex'&&s.event==='trampoline'));
  assert.equal(JSON.stringify(profile.snapshot()),earned);
  assert.equal(JSON.stringify(storyStore.snapshot()),checkpoint);
  await controller.startTour();assert.equal(tour.snapshot().state.stepId,'welcome');
  await controller.close();assert.equal(tour.snapshot().skipped,true);
  for(const forbidden of ['resolve','resolveAttempt','finalize','claim','grant','setCheckpoint'])assert.equal(controller[forbidden],undefined);
  const source=fs.readFileSync(require.resolve('../js/v112-journey-routes.js'),'utf8');
  assert.ok(!/\.innerHTML\s*=|localStorage\.|\.claimStoryMatchResolution\(/.test(source));
  // Execute DOM mount as well as the controller. Locked cards carry no rival
  // names/IDs, and unavailable hosts leave a usable Back route.
  function element(tag){
    const classes=new Set();return {tag,children:[],textContent:'',attributes:{},events:{},disabled:false,
      classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)},
      append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;},
      setAttribute(key,value){this.attributes[key]=value;},addEventListener(key,fn){this.events[key]=fn;},focus(){}};
  }
  const ids=Object.fromEntries(['journey-screen','journey-title','journey-body','journey-message','journey-back','journey-story','journey-rivals','journey-tour'].map(id=>[id,element('div')]));
  const document={createElement:element,getElementById:id=>ids[id]};
  const mounted=Routes.mount({document,getHost:()=>host,getHumans:count=>humans.slice(0,count)});
  await mounted.openRivals();
  const grid=ids['journey-body'].children.find(child=>child.className==='journey-grid');
  assert.ok(grid);
  const locks=grid.children.filter(child=>child.attributes['aria-label']==='Locked');
  assert.ok(locks.length);assert.ok(locks.every(child=>child.textContent==='🔒'&&child.children.length===0));
  await mounted.close();assert.equal(ids['journey-screen'].classList.contains('hidden'),true);
  console.log('Journey controller passed: real Story reservations/Rules finalization/shared clears/replay; real Training isolation and fallible event steps. Live engine host still required.');
})().catch(error=>{console.error(error);process.exitCode=1;});
