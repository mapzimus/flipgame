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
 for(const formatId of ['classic','cup','team-clash']){
  const h=load(true);await h.app.ready;
  const Matter=h.context.Matter;let engine;
  const update=Matter.Engine.update;
  Matter.Engine.update=(value,...args)=>{engine=value;return update(value,...args);};
  const driver=Driver.create(h.physics);h.app.attachPhysics(driver);
  h.app.beginSession({formatId,startingLives:10,roster:Array.from({length:formatId==='team-clash'?4:2},(_,i)=>({name:'Player '+i}))});
  const before=h.app.snapshot();
  h.physics.forceSpecialEvent('plinko');driver.armLaunch({manual:true});h.physics.applyFlick(0,-2400,17);
  for(let i=0;i<150;i++){h.physics.step(1/60);assert.equal(h.physics.checkLanding(),null);}
  // Model an irrecoverable physical jam. The adapter still integrates all ticks,
  // attempts recovery and must not infer a prize from elapsed time or position.
  const chassis=Matter.Composite.allBodies(engine.world).find(b=>b.plugin?.v112Plinko?.ref==='body:plinko-contact-chassis');
  assert(chassis);Matter.Body.setStatic(chassis,true);
  let result;
  for(let i=150;i<2000&&!result;i++){h.physics.step(1/60);result=h.physics.checkLanding();}
  assert.equal(result,'NO_CONTEST');
  const after=h.app.snapshot();
  assert.equal(after.warning,null,JSON.stringify(h.physics.getObservation().eventEvidence));
  assert.equal(after.session.lastRulesOutcome.type,'rules.event-no-contest.v1');
  assert.equal(after.session.play.currentPlayerId,before.session.play.currentPlayerId);
  assert.deepEqual(plain(after.session.play.players),plain(before.session.play.players));
  assert.equal(after.profile.fxp,before.profile.fxp);assert.equal(after.profile.fcBalance,before.profile.fcBalance);
  assert.equal(h.physics.getPlinkoSnapshot().outcome,null,'Timeout cannot invent a slot');
  assert.equal(h.physics.getLastLandingInfo().noContest,true);
  const neutral=plain(after.session.rules);
  for(let i=0;i<3;i++)assert.equal(h.physics.checkLanding(),'NO_CONTEST');
  assert.deepEqual(plain(h.app.snapshot().session.rules),neutral,'Repeated timeout cannot advance twice');
  const next=launch(h,driver,18,2100);
  assert(['MAKE','MISS'].includes(next.result),'A normal real flip follows cleanup');
  assert(!Matter.Composite.allBodies(engine.world).includes(chassis),'Jammed chassis removed before normal play');
  h.app.close();console.log(formatId+': physical Plinko timeout is neutral, one-use, and resumes normal physics');
 }
})().catch(error=>{console.error(error);process.exitCode=1;});

