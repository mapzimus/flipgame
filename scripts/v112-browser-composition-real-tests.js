'use strict';
// Real Chromium + native Web Locks/localStorage + bundled Matter simulation.
// No Playwright/package download is needed. Set CHROME_PATH on other systems.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const executable = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome',
].find(candidate => fs.existsSync(candidate));
if (!executable) throw new Error('A real Chromium executable is required (CHROME_PATH)');
const script = async function () {
  const app = FlipgameV112;
  await app.ready;
  if (!app.snapshot().writer.writable) throw new Error('Native Web Lock was not acquired: ' + JSON.stringify(app.snapshot().writer));
  let frame, wake, nextLaunch = 0;
  let current = app.snapshot();
  app.subscribe(state => { current = state; });
  app.attachPhysics({ snapshot: () => frame,
    subscribe(listener) { wake = listener; return () => { wake = null; }; } });
  app.beginSession({ startingLives: 3, roster: [{ name: 'Physics One' }, { name: 'Physics Two' }] });
  const makes = [], misses = [];
  for (let shot = 0; shot < 90 && current.session.status === 'active'; shot++) {
    const engine = Matter.Engine.create();
    const floor = Matter.Bodies.rectangle(400, 560, 2400, 40, { isStatic: true, friction: 0.8 });
    const body = Matter.Bodies.rectangle(400, 350, 38, 86, { friction: 0.6, frictionAir: 0.005, restitution: 0.05 });
    Matter.Composite.add(engine.world, [floor, body]);
    Matter.Body.setVelocity(body, { x: 0, y: -9 });
    Matter.Body.setAngularVelocity(body, 0.11 + (shot % 13) * 0.025);
    frame = { launchId: 'matter-' + (++nextLaunch), atMs: 0, qualified: true, manual: true,
      grounded: false, angle: 0, angularVelocity: body.angularVelocity, speed: body.speed, hasFlipped: false };
    wake();
    let maxAngle = 0, groundedSince = null, contactSince = null, stableSince = null;
    for (let step = 1; step < 900; step++) {
      Matter.Engine.update(engine, 1000 / 60);
      maxAngle = Math.max(maxAngle, Math.abs(body.angle));
      const grounded = Matter.Query.collides(body, [floor]).length > 0 || body.bounds.max.y >= 537;
      const atMs = step * 1000 / 60;
      if (grounded && contactSince == null) contactSince = atMs;
      if (grounded && groundedSince == null) groundedSince = atMs;
      if (!grounded) { groundedSince = null; stableSince = null; }
      if (grounded && body.speed < 7 && Math.abs(body.angularVelocity) < 0.01) {
        if (stableSince == null) stableSince = atMs;
      } else stableSince = null;
      let landing = null;
      if (grounded && groundedSince != null && atMs - groundedSince > 500 &&
          stableSince != null && atMs - stableSince > 400) {
        const tilt = Math.abs(Math.atan2(Math.sin(body.angle), Math.cos(body.angle)));
        const validRotation = maxAngle >= Math.PI * 1.5;
        const pose = validRotation && tilt < 0.63 ? 'upright'
          : validRotation && Math.abs(tilt - Math.PI) < 0.48 ? 'cap' : 'miss';
        landing = { result: pose === 'miss' ? 'MISS' : 'MAKE', pose,
          reason: 'matter-settled', stableForMs: Math.min(atMs - stableSince, atMs - groundedSince - 34) };
      }
      if (contactSince != null && atMs - contactSince >= 4000) {
        landing = {result:'MISS',pose:'miss',reason:'matter-timeout',stableForMs:0};
      }
      frame = { ...frame, atMs: step * 1000 / 60, grounded,
        angle: body.angle, angularVelocity: body.angularVelocity, speed: body.speed,
        hasFlipped: maxAngle >= Math.PI * 1.5, landing };
      wake();
      const state = current;
      if (state.warning) throw new Error(state.warning);
      if (state.session.flipPhase === 'resolved') break;
    }
    const landing = current.session.lastLanding;
    if (!landing || landing.flipId !== frame.launchId) throw new Error('Matter flight did not resolve');
    (landing.result === 'MAKE' ? makes : misses).push(landing);
    Matter.Engine.clear(engine);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  if (current.session.status !== 'completed') throw new Error('Physical match did not finish: ' + JSON.stringify({makes:makes.length,misses:misses.length,sequence:current.session.rules.sequence}));
  const state = app.snapshot();
  if (!makes.length || !misses.length) throw new Error('Physical corpus must produce makes and misses');
  if (state.profile.fxp <= 0 || state.pendingReveals.length === 0) throw new Error('Physical match did not reward/reveal');
  const before = state.profile.fxp;
  await app.retryFinalization();
  if (app.snapshot().profile.fxp !== before) throw new Error('Duplicate completion awarded twice');
  const result = { browser: navigator.userAgent, nativeWebLocks: true,
    makes: makes.length, misses: misses.length, fxp: before, level: state.profile.flipLevel,
    revealCount: state.pendingReveals.length, sourceIdentity: state.sourceIdentity,
    leakedGlobals: Object.keys(globalThis).filter(key => /^Flipgame/.test(key)) };
  app.close();
  await fetch('/result', { method: 'POST', body: JSON.stringify(result) });
};
async function main() {
  let complete;
  const result = new Promise(resolve => { complete = resolve; });
  const server = http.createServer((request, response) => {
    if (request.url === '/result' && request.method === 'POST') {
      let body = ''; request.on('data', chunk => { body += chunk; });
      request.on('end', () => { response.end('ok'); complete(JSON.parse(body)); }); return;
    }
    if (request.url === '/bundle.js' || request.url === '/matter.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(fs.readFileSync(path.join(root, request.url === '/bundle.js'
        ? 'js/v112-browser-bundle.js' : 'js/vendor/matter.min.js'))); return;
    }
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><title>v1.12 browser qualification</title><script src="/matter.js"></script>' +
      '<script src="/bundle.js"></script><script>(' + script.toString() +
      ')().catch(error=>fetch("/result",{method:"POST",body:JSON.stringify({error:error.stack})}));</script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'flipgame-browser-'));
  const child = spawn(executable, ['--headless=new', '--no-first-run', '--disable-extensions',
    '--disable-background-networking', '--no-default-browser-check', '--disable-sync',
    '--user-data-dir=' + directory, 'http://127.0.0.1:' + server.address().port],
  { windowsHide: true, stdio: 'ignore' });
  let timeout;
  try {
    const received = await Promise.race([result, new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('Real browser qualification timed out')), 45000);
      child.once('error', reject);
    })]);
    assert.equal(received.error, undefined, received.error);
    assert.deepEqual(received.leakedGlobals, ['FlipgameV112']);
    console.log(JSON.stringify(received, null, 2));
  } finally {
    clearTimeout(timeout); child.kill(); server.close();
    // Keep the isolated profile for failure diagnostics; never touch a user profile.
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
