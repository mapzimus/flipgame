'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '../js/v112-browser-bundle.js'), 'utf8');
function environment(storage = new Map()) {
  const context = vm.createContext({ console, crypto: webcrypto, AbortController,
    localStorage: { getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    navigator: { locks: { request(_name, options, callback) {
      if (options.ifAvailable && options.signal) throw new TypeError('signal and ifAvailable cannot be combined');
      return Promise.resolve().then(() => callback({ name: 'writer' }));
    } } },
  });
  vm.runInContext(source, context);
  return { context, storage, app: context.FlipgameV112,
    run: text => vm.runInContext(text, context) };
}
async function run() {
  const h = environment(); await h.app.ready;
  assert.equal(h.app.snapshot().writer.writable, true);
  assert.deepEqual(Object.keys(h.context).filter(key => /Flipgame|Authority|Profile|process|module|require/.test(key)), ['FlipgameV112']);
  assert.equal(Object.isFrozen(h.app), true);
  assert.equal(h.app.claimMatch, undefined); assert.equal(h.app.submitResult, undefined);
  assert.throws(() => vm.runInContext(source, h.context), /already installed/);
  h.run(`var wake; var frame; var serial = 0;
    FlipgameV112.attachPhysics({ snapshot: function () { return frame; },
      subscribe: function (listener) { wake = listener; return function () { wake = null; }; } });
    function sample(input) { frame = Object.assign({}, frame, input); wake(); }
    function shot(angle, flipped) {
      frame = { launchId: 'launch-' + (++serial), qualified: true, manual: true,
        atMs: 0, grounded: false, angle: 0, speed: 1, angularVelocity: 0.1, hasFlipped: false };
      wake(); sample({ atMs: 700, grounded: true, angle: angle, speed: 0,
        angularVelocity: 0, hasFlipped: flipped !== false });
      if (FlipgameV112.snapshot().session.lastLanding &&
          FlipgameV112.snapshot().session.lastLanding.flipId === frame.launchId) throw new Error('First contact resolved');
      for (var i = 1; i <= 38; i++) sample({ atMs: 700 + i * 17 });
      sample({atMs:1350, landing:{result:angle === Math.PI / 2 ? 'MISS' : 'MAKE',
        pose:angle === Math.PI ? 'cap' : 'upright', reason:'engine-settled',stableForMs:600}});
    }
  `);
  h.run(`FlipgameV112.beginSession({ startingLives: 3, roster: [{name:'One'}, {name:'Two'}] });`);
  const fxpBefore = h.app.snapshot().profile.fxp;
  for (let index = 0; index < 6 && h.app.snapshot().session.status === 'active'; index++) h.run(index % 2 ? 'shot(Math.PI / 2);' : 'shot(Math.PI);');
  await new Promise(resolve => setImmediate(resolve));
  let snapshot = h.app.snapshot();
  assert.equal(snapshot.warning, null, snapshot.warning);
  assert.equal(snapshot.session.status, 'completed');
  assert(snapshot.profile.fxp > fxpBefore, 'Real branded settled rules outcomes earned progression');
  assert(snapshot.pendingReveals.length > 0, 'Crossed levels reveal content');
  const rewarded = snapshot.profile.fxp;
  await h.app.retryFinalization(); await h.app.retryFinalization();
  h.run('wake(); wake();');
  assert.equal(h.app.snapshot().profile.fxp, rewarded, 'Repeated finalization cannot reward twice');
  assert.doesNotMatch(JSON.stringify(h.app.snapshot()), /MatchClaimTokenV1|bearerNonce|reservedAt|"nonce"/);
  h.run(`FlipgameV112.beginSession({ activityId:'practice', roster:[{name:'One'}] }); shot(0); shot(Math.PI);`);
  snapshot = h.app.snapshot();
  assert.equal(snapshot.session.practice.makes, 2);
  assert.equal(snapshot.session.practice.caps, 1);
  assert.equal(snapshot.profile.fxp, rewarded, 'Practice cannot award progression');
  h.app.abandonSession();
  h.app.enableOwnerTesting('Howe Test Mode');
  assert.equal(h.app.objects().filter(object => !object.locked).length, 51);
  h.run(`FlipgameV112.beginSession({ startingLives: 1, roster:[{name:'One'}, {name:'Two'}] }); shot(Math.PI); shot(Math.PI / 2);`);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.app.snapshot().profile.fxp, rewarded, 'Owner testing cannot award progression');
  h.app.disableOwnerTesting();
  assert(h.app.objects().filter(object => !object.locked).length < 51);
  const storyViews = h.app.storyViews(); assert(storyViews.hub);
  h.app.close();
  const reloaded = environment(h.storage); await reloaded.app.ready;
  assert.equal(reloaded.app.snapshot().profile.fxp, rewarded, 'Production profile survives reload');
  reloaded.app.close();
  console.log('Browser composition: private loading, real Rules/Landing→Profile, reveal, retry, Practice, owner testing and reload passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
