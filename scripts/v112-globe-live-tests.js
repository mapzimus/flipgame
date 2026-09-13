'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Root = path.resolve(__dirname, '..');
const Globe = require('../js/v112-globe.js');
const Live = require('../js/v112-globe-live.js');
const source = fs.readFileSync(path.join(Root, 'js/v112-globe-live.js'), 'utf8');
const geo = JSON.parse(fs.readFileSync(path.join(Root, Live.DATA_URL), 'utf8'));
function fixture(options = {}) {
  const canvases = [], renders = [], fetches = [], destructions = [];
  const doc = { createElement(tag) {
    assert.equal(tag, 'canvas');
    const canvas = { listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; },
      getContext() { return { clearRect() {}, drawImage() {} }; } };
    canvases.push(canvas); return canvas;
  } };
  const globe = { ...Globe, getBundledGeography: () => null, setBundledGeography(data) { Globe.prepareGeography(data); },
    createSharedSurface(canvas, config) {
      if (options.failCreation && !config.forceCanvas) throw new Error('GPU missing');
      return { info: () => ({ rendererKind: config.forceCanvas ? 'canvas' : 'webgl' }), destroy() { destructions.push(canvas); },
        render(request) { renders.push(request); if (options.failRender && !config.forceCanvas) throw new Error('lost GPU');
          if (options.failAll) throw new Error('no rendering'); return { canvas, rendererKind: config.forceCanvas ? 'canvas' : 'webgl' }; } };
    } };
  const fetch = async (...args) => { fetches.push(args); if (options.failFetch) throw new Error('offline'); return { ok: true, json: async () => geo }; };
  return { controller: Live.create({ globe, document: doc, fetch, ...(options.seeded ? { geography: geo } : {}) }), canvases, renders, fetches, destructions };
}
const paint = { save() {}, restore() {}, drawImage() {} };
const request = { state: { time: 2, flipSeed: 25 }, dynamics: { angle: .4, accessoryLag: .2 }, variantIndex: 2, centerX: 150, centerY: 150, radius: 80 };
async function checks() {
  const f = fixture(); assert.equal(f.canvases.length, 0); assert.equal(f.fetches.length, 0);
  assert.equal(f.controller.drawSphere(paint, request).handled, false);
  const pending = f.controller.prewarm(); assert.equal(f.controller.prewarm(), pending);
  assert.equal(await pending, true); assert.equal(f.fetches.length, 1); assert.equal(f.canvases.length, 1);
  assert.deepEqual(f.fetches[0], [Live.DATA_URL, { redirect: 'error', credentials: 'same-origin' }]);
  for (let i = 0; i < 100; i++) assert.equal(f.controller.drawSphere(paint, request).handled, true);
  assert.equal(f.canvases.length, 1); assert.deepEqual(f.controller.currentOrientation(), Live.orientationFor(request));
  assert.equal(f.controller.drawSphere({ ...paint, drawImage() { throw new Error('context unavailable'); } }, request).handled, false);
  for (let i = 0; i < 100; i++) {
    const focus = f.controller.focusView({ seed: i, elapsedMs: 650 });
    assert.ok(focus.point.facing >= Math.cos(55 * Math.PI / 180) - 1e-9);
    assert.equal(focus.globeSurface, f.controller.sharedSurface()); assert.equal(focus.globeRequest.zoom, 2.65);
    assert.ok(focus.globeSurface.render(focus.globeRequest).canvas);
  }
  assert.equal(f.canvases.length, 2, 'only one optional bounded focus canvas');
  const end = f.controller.focusView({ elapsedMs: 1300 }); assert.equal(end.globeRequest.zoom, 1);
  assert.deepEqual({ centerLon: end.globeRequest.centerLon, centerLat: end.globeRequest.centerLat }, f.controller.currentOrientation());
  const proxy = f.controller.sharedSurface(); f.canvases[0].listeners.webglcontextlost({ preventDefault() {} });
  assert.equal(f.controller.drawSphere(paint, request).handled, true); assert.equal(f.controller.info().status, 'canvas');
  assert.equal(f.controller.info().surfaceCreations, 2); assert.equal(f.controller.sharedSurface(), proxy);
  f.controller.dispose(); assert.equal(f.controller.drawSphere(paint, request).handled, false); assert.equal(f.controller.focusView({}), null);
  for (const setting of [{ seeded: true }, { failCreation: true }, { failRender: true }, { failAll: true }]) {
    const item = fixture(setting); await item.controller.prewarm();
    assert.equal(item.controller.drawSphere(paint, request).handled, !setting.failAll);
    for (let i = 0; i < 30; i++) item.controller.drawSphere(paint, request);
    assert.ok(item.canvases.length <= 2); if (setting.seeded) assert.equal(item.fetches.length, 0);
  }
  const offline = fixture({ failFetch: true }); assert.equal(await offline.controller.prewarm(), false);
  for (let i = 0; i < 30; i++) offline.controller.drawSphere(paint, request);
  assert.equal(offline.fetches.length, 1, 'failed fetch never retried by frames');
  const disposed = fixture(); const loading = disposed.controller.prewarm(); disposed.controller.dispose();
  assert.equal(await loading, false); assert.equal(disposed.canvases.length, 0);
  const orientation = Live.orientationFor({ state: { time: 0 } });
  const period = Live.orientationFor({ state: { time: Live.rotationPeriodSeconds } });
  assert.ok(Math.abs(orientation.centerLon - period.centerLon) < 1e-12);
  const hemispheres = new Set(Array.from({ length: 8 }, (_, i) => Live.orientationFor({ state: { time: i * Live.rotationPeriodSeconds / 8 } }).centerLon.toFixed(3)));
  assert.equal(hemispheres.size, 8);
  assert.equal(new Set(Array.from({ length: 20 }, (_, flipSeed) => Live.orientationFor({ state: { flipSeed } }).centerLon)).size, 20);
  assert.deepEqual(Live.orientationFor({ state: { reducedMotion: true, time: 0 } }), Live.orientationFor({ state: { reducedMotion: true, time: 900, angle: 4 } }));
  const browserGlobal = vm.createContext({}); vm.runInContext(source, browserGlobal);
  assert.equal(browserGlobal.FlipgameV112GlobeLive.drawSphere(paint, request).handled, false, 'missing optional dependency cannot break art');
  assert.ok(Object.isFrozen(Live)); assert.ok(Object.isFrozen(f.controller));
  console.log('Globe live passed: lazy local data, offline injection, bounded GPU/focus surfaces, failure/context loss, real visible-hemisphere focus, deterministic full rotation and reduced motion.');
}
async function review(directory) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.FLIP_PREVIEW_BROWSER_PATH || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 760 } });
    let requests = 0; page.on('request', () => requests++);
    await page.setContent('<style>body{margin:0;background:#222e37;color:#e4d6bb;font:14px system-ui}main{display:grid;grid-template-columns:repeat(4,350px)}article{height:250px}p{margin:0 12px}</style><main></main>');
    await page.addScriptTag({ content: fs.readFileSync(path.join(Root, 'js/v112-globe.js'), 'utf8') });
    await page.addScriptTag({ content: source });
    const result = await page.evaluate(async geography => {
      const services = [];
      for (const forceCanvas of [false, true]) {
        const service = FlipgameV112GlobeLive.create({ document, geography, forceCanvas });
        if (!await service.prewarm()) throw new Error('surface unavailable'); services.push(service);
      }
      const hashes = [];
      for (let i = 0; i < 12; i++) {
        const service = i < 8 ? services[0] : services[1];
        const article = document.createElement('article'), canvas = document.createElement('canvas'), text = document.createElement('p');
        canvas.width = 350; canvas.height = 225; article.append(canvas, text); document.querySelector('main').append(article);
        const ctx = canvas.getContext('2d'), radians = i < 8 ? i * Math.PI / 4 : (i - 8) * Math.PI / 2;
        if (!service.drawSphere(ctx, { state: { globePhaseRad: radians }, centerX: 175, centerY: 112, radius: 98 }).handled) throw new Error('paint failed');
        text.textContent = (i < 8 ? 'GPU' : 'Canvas fallback') + ' · ' + Math.round(radians * 180 / Math.PI) + '°';
        const data = ctx.getImageData(0, 0, 350, 225).data; let hash = 2166136261, opaque = 0;
        for (let j = 0; j < data.length; j += 4) { hash = Math.imul(hash ^ data[j], 16777619); if (data[j + 3] > 128) opaque++; }
        if (opaque < 20000) throw new Error('blank hemisphere'); hashes.push(hash);
      }
      return { hashes, kinds: services.map(s => s.info().status) };
    }, geo);
    assert.equal(new Set(result.hashes.slice(0, 8)).size, 8, 'eight distinct genuine GPU hemispheres');
    assert.equal(new Set(result.hashes.slice(8)).size, 4, 'four distinct Canvas hemispheres');
    assert.deepEqual(result.kinds, ['webgl', 'canvas']); assert.equal(requests, 0, 'fully offline after bundled geography injection');
    fs.mkdirSync(directory, { recursive: true }); await page.screenshot({ path: path.join(directory, 'globe-hemispheres.png'), fullPage: true });
    console.log('Real Chromium: WebGL + Canvas hemispheres, zero network, ' + directory);
  } finally { await browser.close(); }
}
checks().then(() => { const arg = process.argv.find(v => v.startsWith('--render-directory=')); return arg ? review(path.resolve(arg.slice(19))) : null; })
  .catch(error => { console.error(error); process.exitCode = 1; });
