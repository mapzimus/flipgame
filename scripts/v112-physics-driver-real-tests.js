'use strict';
// Real-browser smoke for the original game Physics engine + new private rules.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const browser = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome',
].find(candidate => fs.existsSync(candidate));
if (!browser) throw new Error('Set CHROME_PATH to a Chromium browser');
const assets = ['vendor/matter.min.js', 'v111-interfaces.js', 'v111-physics-events.js',
  'physics.js', 'v112-browser-bundle.js', 'v112-physics-driver.js'];
async function scenario() {
  const app = FlipgameV112; await app.ready;
  if (!app.snapshot().writer.writable) throw new Error('Native profile writer unavailable');
  Physics.init(1280, 720); Physics.setProfile(null);
  const driver = FlipgameV112PhysicsDriver.create(Physics); app.attachPhysics(driver);
  let state; app.subscribe(value => { state = value; });
  app.beginSession({ startingLives: 3, roster: [{ name: 'One' }, { name: 'Two' }] });
  let flips = 0, makes = 0, misses = 0;
  for (let index = 0; index < 100 && state.session.status === 'active'; index++) {
    Physics.resetBottle(); Physics.seedTurn(index + 1); driver.armLaunch({ manual: true });
    Physics.applyFlick(0, -(1400 + index % 9 * 300), index + 1, 1, 'disabled');
    let verdict;
    for (let tick = 0; tick < 1500; tick++) {
      Physics.step(1 / 60); verdict = Physics.checkLanding();
      if (verdict) break;
    }
    if (!verdict || driver.status().warning || state.warning) throw new Error(driver.status().warning || state.warning || 'Unresolved flight');
    if (state.session.lastLanding.result !== verdict) throw new Error('Engine/rules disagreement');
    flips++; if (verdict === 'MAKE') makes++; else misses++;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  if (state.session.status !== 'completed' || state.profile.fxp <= 0 || !makes || !misses) throw new Error('Physical match did not complete/reward');
  const earned = state.profile.fxp;
  await app.retryFinalization();
  if (app.snapshot().profile.fxp !== earned) throw new Error('Duplicate reward');
  const result = { browser: navigator.userAgent, engine: 'js/physics.js',
    nativeWebLocks: true, flips, makes, misses, fxp: earned,
    level: state.profile.flipLevel, revealCount: state.pendingReveals.length };
  app.close(); driver.close();
  await fetch('/result', { method: 'POST', body: JSON.stringify(result) });
}
(async function () {
  let receive; const result = new Promise(resolve => { receive = resolve; });
  const requests = [];
  const server = http.createServer((request, response) => {
    requests.push(request.url);
    if (request.url === '/result' && request.method === 'POST') {
      let body = ''; request.on('data', chunk => { body += chunk; });
      request.on('end', () => { response.end('ok'); receive(JSON.parse(body)); }); return;
    }
    const asset = assets.find(file => request.url === '/' + file);
    if (asset) { response.setHeader('Content-Type', 'text/javascript');
      response.end(fs.readFileSync(path.join(root, 'js', asset))); return; }
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><title>Actual engine qualification</title>' +
      '<script>addEventListener("error",e=>fetch("/result",{method:"POST",body:JSON.stringify({error:e.message})}));</script>' +
      assets.map(file => '<script src="/' + file + '"></script>').join('') +
      '<script>(' + scenario.toString() + ')().catch(error => fetch("/result",{method:"POST",body:JSON.stringify({error:error.stack})}));</script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'flipgame-engine-'));
  const child = spawn(browser, ['--headless=new', '--no-first-run', '--disable-extensions',
    '--disable-background-networking', '--no-default-browser-check', '--disable-sync',
    '--user-data-dir=' + profile, 'http://127.0.0.1:' + server.address().port],
  { windowsHide: true, stdio: 'ignore' });
  let timeout;
  try {
    const report = await Promise.race([result, new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('Browser engine qualification timed out; requests: ' + requests.join(', '))), 45000);
      child.once('error', reject);
    })]);
    assert.equal(report.error, undefined, report.error); console.log(JSON.stringify(report, null, 2));
  } finally { clearTimeout(timeout); child.kill(); server.closeAllConnections(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
