'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const Driver = require('../js/v112-physics-driver.js');
const root = path.resolve(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));
function load(withComposition = false) {
  const storage = new Map();
  const context = vm.createContext({ console, crypto: webcrypto, AbortController,
    window: { matchMedia: () => ({ matches: false }) },
    localStorage: { getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    navigator: { locks: { request(_name, options, callback) {
      if (options.ifAvailable && options.signal) throw new Error('invalid native lock options');
      return Promise.resolve().then(() => callback({ name: 'writer' }));
    } } },
  });
  for (const name of ['vendor/matter.min.js', 'v111-interfaces.js', 'v111-physics-events.js', 'v112-plinko-matter.js', 'v112-plinko-live.js', 'physics.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'js', name), 'utf8'), context, { filename: name });
  }
  const physics = vm.runInContext('Physics', context);
  physics.init(1280, 720); physics.setProfile(null);
  if (withComposition) vm.runInContext(fs.readFileSync(path.join(root, 'js/v112-browser-bundle.js'), 'utf8'), context);
  return { context, physics, app: context.FlipgameV112 };
}
function launch(h, driver, seed, power = 2400, dt = 1 / 60, event = null) {
  h.physics.resetBottle(); h.physics.seedTurn(seed);
  if (event) h.physics.forceSpecialEvent(event);
  if (driver) driver.armLaunch({ manual: true });
  h.physics.applyFlick(0, -power, seed, 1, event ? 'normal' : 'disabled');
  const trace = [];
  for (let tick = 0; tick < 3600; tick++) {
    h.physics.step(dt);
    const body = h.physics.getBottle();
    if (tick % 30 === 0) trace.push([body.position.x, body.position.y, body.angle,
      body.velocity.x, body.velocity.y, body.angularVelocity]);
    const result = h.physics.checkLanding();
    if (result) return { result, ticks: tick + 1, trace, info: plain(h.physics.getLastLandingInfo()) };
  }
  throw new Error('Physics shot did not finish');
}

(async()=>{
 const failures=[],reports=[];
 const events=require('../js/v112-events.js').definitions;
 for(const event of events){
  const h=load(true);await h.app.ready;const driver=Driver.create(h.physics);h.app.attachPhysics(driver);
  h.app.beginSession({activityId:'practice',roster:[{name:'Player'}]});
  for(let seed=1;seed<=3;seed++){
   try{
    const shot=launch(h,driver,7000+seed,1800+seed*300,1/60,event.id);
    const current=h.app.snapshot();
    assert.equal(current.session.performanceSample.eligibleShots,0,'Forced event payouts cannot inflate ordinary performance');
    assert.equal(current.session.flipPhase,'resolved',event.id+': '+current.warning);
    assert.equal(current.session.lastLanding.result,shot.result,event.id+' verdict parity');
    assert.equal(current.warning,null,event.id+' has no deferred/error evidence');
    reports.push({event:event.id,seed,result:shot.result});
   }catch(error){failures.push({event:event.id,seed,error:error.message,evidence:driver.snapshot()?.eventEvidence});break;}
  }
  try{h.app.close();}catch(_){}driver.close();
 }
 const native=load(true);await native.app.ready;
 const nativeDriver=Driver.create(native.physics);native.app.attachPhysics(nativeDriver);
 native.app.beginSession({activityId:'practice',roster:[{name:'Player'}]});
 native.physics.setProfile({floorResolve:true,alienPortal:true,landOnTarget:true,keepWalls:true,wallBounce:.86,saucerCount:6});
 const cpu=require('../js/v112-cpu.js');let nativeMakes=0;
 for(let seed=1;seed<=12;seed++){
  native.physics.resetBottle();native.physics.seedTurn(seed);
  const target=native.physics.alienTargetForSeed(seed);
  const intent=cpu.createLaunch({seed,difficulty:'hard',physicsModeId:'alien',target,
   arena:{worldW:target.worldW,viewW:1280,viewH:720}});
  nativeDriver.armLaunch({manual:true});native.physics.applyFlick(intent.vx,intent.vy,seed,1,'disabled');
  let result;
  for(let tick=0;tick<3600;tick++){native.physics.step(1/60);result=native.physics.checkLanding();if(result)break;}
  assert.ok(result,'Native Alien physically resolves');
  assert.equal(native.app.snapshot().session.flipPhase,'resolved',native.app.snapshot().warning);
  assert.equal(native.app.snapshot().session.lastLanding.result,result);
  if(result==='MAKE')nativeMakes++;
 }
 assert.ok(nativeMakes>0,'Airborne native bank-and-ring MAKE reaches private rules');
 assert.equal(native.app.snapshot().session.performanceSample.eligibleShots,12,'All genuine native Alien attempts enter the ordinary performance sample');
 native.app.close();nativeDriver.close();
 console.log(JSON.stringify({shots:reports.length,nativeAlienShots:12,nativeMakes,failures},null,2));assert.equal(failures.length,0);
})().catch(error=>{console.error(error);process.exitCode=1;});
