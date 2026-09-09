'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const Preview = require('../js/v112-arena-preview.js');
const Catalog = require('../js/v112-progression-catalog.js');
const source = fs.readFileSync(path.join(__dirname, '../js/v112-arena-preview.js'), 'utf8');

function context() {
  const calls = [], props = { globalAlpha: .4, lineWidth: 9 }, stack = [];
  const methods = {};
  for (const method of ['fillRect', 'strokeRect', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'fill', 'stroke', 'ellipse', 'arc', 'rect', 'clip', 'translate', 'scale', 'rotate', 'bezierCurveTo', 'fillText']) {
    methods[method] = function (...args) {
      args.forEach(arg => { if (typeof arg === 'number') assert.ok(Number.isFinite(arg), method + ' has finite geometry'); });
      calls.push([method, ...args]);
    };
  }
  methods.save = () => { stack.push({ ...props }); calls.push(['save']); };
  methods.restore = () => { assert.ok(stack.length, 'balanced Canvas state'); const old = stack.pop(); Object.keys(props).forEach(k => delete props[k]); Object.assign(props, old); calls.push(['restore']); };
  methods.createLinearGradient = (...args) => {
    calls.push(['gradient', ...args]);
    return { addColorStop(...stop) { calls.push(['stop', ...stop]); } };
  };
  const ctx = new Proxy(methods, {
    get(target, key) { return key in target ? target[key] : props[key]; },
    set(target, key, value) { if (key in target) target[key] = value; else props[key] = value; if (typeof value !== 'object') calls.push(['set', key, value]); return true; },
  });
  return { ctx, calls, props, stack };
}
function render(id, timeMs, reducedMotion, width = 960, height = 540) {
  const output = context();
  assert.equal(Preview.draw(output.ctx, { arenaId: id, width, height, timeMs, reducedMotion }), id);
  assert.deepEqual(output.props, { globalAlpha: .4, lineWidth: 9 }, 'restore all caller state');
  assert.equal(output.stack.length, 0);
  return output.calls;
}
assert.equal(Preview.list().length, 23);
assert.deepEqual(Preview.list().map(a => a.id), Catalog.arenaIds);
const geometries = new Set();
let animated = 0;
for (const venue of Preview.list()) {
  assert.equal(Preview.label(venue.id), Catalog.arena(venue.id).displayName);
  assert.equal(Preview.label('arena.' + venue.id), venue.displayName);
  assert.ok(Object.isFrozen(venue));
  assert.deepEqual(Object.keys(venue), ['id', 'displayName'], 'no unlock metadata');
  const initial = render(venue.id, 0, false);
  const moving = render(venue.id, 3100, false);
  assert.deepEqual(render(venue.id, 3100, true), initial, venue.id + ' reduced motion freezes secondary movement');
  assert.deepEqual(render(venue.id, 3100, false), moving, venue.id + ' deterministic frame');
  if (JSON.stringify(initial) !== JSON.stringify(moving)) animated++;
  // Removing paint and text still leaves a distinct architectural silhouette.
  const geometry = initial.filter(call => !['set', 'stop', 'fillText'].includes(call[0]));
  geometries.add(JSON.stringify(geometry));
  assert.ok(initial.length < 1800, venue.id + ' bounded drawing workload');
  for (const dimensions of [[320, 180], [360, 740], [768, 1024], [3840, 2160]]) render(venue.id, 10, true, ...dimensions);
}
assert.equal(geometries.size, 23, 'settings differ in geometry, not just palette');
assert.ok(animated >= 14, 'outdoor and ambient venues have subtle movement');
assert.ok(Object.isFrozen(Preview));
assert.ok(Object.isFrozen(Preview.list()));
for (const id of [null, {}, '__proto__', 'constructor', 'not-a-venue']) {
  const output = context();
  assert.equal(Preview.draw(output.ctx, { arenaId: id, width: 960, height: 540 }), 'baseline-table');
}
for (const [width, height] of [[0, 4], [-1, 5], [NaN, 9], [12, Infinity], [undefined, 5]]) {
  const output = context();
  assert.equal(Preview.draw(output.ctx, { width, height }), false);
  assert.equal(output.calls.length, 0);
}
assert.throws(() => Preview.draw(null, {}), TypeError);
const failing = context();
failing.ctx.fillRect = () => { throw new Error('paint failure'); };
assert.throws(() => Preview.draw(failing.ctx, { width: 960, height: 540 }), /paint failure/);
assert.equal(failing.stack.length, 0, 'restores state if paint throws');
const browser = vm.createContext({});
vm.runInContext(source, browser);
assert.deepEqual(Object.keys(browser), ['FlipgameV112ArenaPreview']);
assert.equal(browser.FlipgameV112ArenaPreview.label('arena.aquarium-tunnel'), 'Aquarium Tunnel');
console.log('Arena preview: all 23 catalog IDs, distinct geometry, deterministic/reduced motion, responsive scaling and state isolation passed.');

// Optional real Chromium render: NODE_PATH may point to a bundled Playwright
// install. Output is review evidence, never a game asset or runtime dependency.
async function browserReview(directory) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.FLIP_PREVIEW_BROWSER_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1848 }, deviceScaleFactor: 1 });
    await page.setContent('<style>body{margin:0;background:#222731;font-family:system-ui;color:#ece6d6}main{display:grid;grid-template-columns:repeat(4,480px)}article{height:308px}h2{font-size:16px;font-weight:500;margin:8px 14px}canvas{display:block}</style><main></main>');
    await page.addScriptTag({ content: source });
    const result = await page.evaluate(() => {
      const api = globalThis.FlipgameV112ArenaPreview, main = document.querySelector('main');
      const results = [];
      for (const arena of api.list()) {
        const article = document.createElement('article'), canvas = document.createElement('canvas'), title = document.createElement('h2');
        canvas.width = 480; canvas.height = 270; title.textContent = arena.displayName;
        article.append(canvas, title); main.append(article);
        const ctx = canvas.getContext('2d');
        api.draw(ctx, { arenaId: arena.id, width: 480, height: 270, timeMs: 1500, reducedMotion: true });
        const initial = canvas.toDataURL();
        api.draw(ctx, { arenaId: arena.id, width: 480, height: 270, timeMs: 9500, reducedMotion: true });
        const pixels = ctx.getImageData(0, 0, 480, 270).data, colors = new Set();
        for (let i = 0; i < pixels.length; i += 16) colors.add(pixels[i] + ',' + pixels[i + 1] + ',' + pixels[i + 2]);
        results.push({ id: arena.id, stable: initial === canvas.toDataURL(), colorCount: colors.size });
      }
      return results;
    });
    result.forEach(row => { assert.ok(row.stable, row.id); assert.ok(row.colorCount > 80, row.id + ' rendered nonblank detail'); });
    fs.mkdirSync(directory, { recursive: true });
    await page.screenshot({ path: path.join(directory, 'arena-contact-sheet.png'), fullPage: true });
    console.log('Chromium rendered 23 detailed previews; reduced-motion pixels stable. Contact sheet: ' + path.join(directory, 'arena-contact-sheet.png'));
  } finally { await browser.close(); }
}
const output = process.argv.find(arg => arg.startsWith('--render-directory='));
if (output) browserReview(path.resolve(output.slice('--render-directory='.length))).catch(error => { console.error(error); process.exitCode = 1; });
