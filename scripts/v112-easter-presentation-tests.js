'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Root = path.resolve(__dirname, '..');
const Eggs = require('../js/v112-easter-eggs.js');
const Paint = require('../js/v112-easter-presentation.js');
const source = fs.readFileSync(path.join(Root, 'js/v112-easter-presentation.js'), 'utf8');
function presentation(entry, reduced = false, muted = false) {
  const c = entry.criteria;
  const context = {
    schema: 'EasterEggOutcomeContextV1', matchId: 'paint-review', flipId: entry.id, sequence: 1,
    presentationSeed: 'paint-seed', objectId: c.objectIds[0], variantId: null,
    arenaId: c.arenaIds ? c.arenaIds[0] : 'baseline-table', playerName: 'Player',
    physicsModeId: c.physicsModeIds ? c.physicsModeIds[0] : 'normal', eventId: null,
    outcomePhase: 'committed', verdict: c.verdicts[0], physical: true, automatic: false,
    landingClass: c.landingClasses ? c.landingClasses[0] : 'upright',
    rotationCount: c.minRotationCount || 1, bounceCount: c.minBounceCount || 0,
    bankCount: c.minBankCount || 0, settleMs: c.minSettleMs || 800,
    clean: c.clean === undefined ? true : c.clean, recovery: c.recovery || false,
    pressureShot: false, matchTerminal: false, testData: true, reducedMotion: reduced,
    audioMuted: muted, laneId: 'lane-2', storyChapterId: null,
  };
  const result = Eggs.evaluate(Eggs.createMatchState('paint-review'), context, { forceId: entry.id });
  assert.ok(result.presentation, entry.id + ' real registry fixture'); return result.presentation;
}
function context() {
  const calls = [], props = { globalAlpha: .7 }, stack = [], methods = {};
  for (const method of ['beginPath', 'closePath', 'moveTo', 'lineTo', 'fillRect', 'fill', 'stroke', 'arc', 'ellipse', 'rect', 'clip', 'translate', 'rotate', 'scale', 'fillText', 'drawImage']) {
    methods[method] = (...args) => { args.forEach(v => { if (typeof v === 'number') assert.ok(Number.isFinite(v), 'finite paint geometry'); }); calls.push([method, ...args]); };
  }
  methods.save = () => { stack.push({ ...props }); calls.push(['save']); };
  methods.restore = () => { assert.ok(stack.length); const previous = stack.pop(); Object.keys(props).forEach(k => delete props[k]); Object.assign(props, previous); calls.push(['restore']); };
  const ctx = new Proxy(methods, { get: (t, k) => k in t ? t[k] : props[k], set(t, k, v) { props[k] = v; calls.push(['set', k, v]); return true; } });
  return { ctx, calls, props, stack };
}
const fixtures = Eggs.definitions.map(e => presentation(e));
assert.deepEqual(Paint.cueIds, Eggs.definitions.map(e => e.presentation.cueId));
const geometry = new Set();
for (let i = 1; i < fixtures.length; i++) {
  const p = fixtures[i], original = JSON.stringify(p), a = context();
  assert.equal(Paint.draw(a.ctx, { presentation: p, width: 640, height: 480, elapsedMs: 400 }), true);
  assert.deepEqual(a.props, { globalAlpha: .7 }); assert.equal(a.stack.length, 0);
  geometry.add(JSON.stringify(a.calls.filter(v => !['set', 'fillText'].includes(v[0]))));
  const repeated = context(); Paint.draw(repeated.ctx, { presentation: p, width: 640, height: 480, elapsedMs: 400 });
  assert.deepEqual(a.calls, repeated.calls);
  const reduced = presentation(Eggs.definitions[i], true, true), early = context(), late = context();
  Paint.draw(early.ctx, { presentation: reduced, width: 360, height: 740, elapsedMs: 100 });
  Paint.draw(late.ctx, { presentation: reduced, width: 360, height: 740, elapsedMs: 800 });
  assert.deepEqual(early.calls, late.calls, p.cue.id + ' reduced motion frozen');
  assert.equal(Paint.audioCue(reduced), null, 'muted request has no sound mapping');
  assert.equal(JSON.stringify(p), original, 'presentation unchanged');
  for (const elapsedMs of [-1, NaN, Infinity, p.visual.durationMs, p.visual.durationMs + 1]) {
    const expired = context(); assert.equal(Paint.draw(expired.ctx, { presentation: p, width: 640, height: 480, elapsedMs }), false); assert.equal(expired.calls.length, 0);
  }
  const sound = Paint.audioCue(p);
  assert.ok(sound && new RegExp('\\b' + sound + ':').test(fs.readFileSync(path.join(Root, 'js/audio.js'), 'utf8')));
}
assert.equal(geometry.size, 11, 'eleven distinct miniature scenes');
const globe = fixtures[0], missing = context();
assert.equal(Paint.draw(missing.ctx, { presentation: globe, width: 640, height: 480, elapsedMs: 400 }), false);
assert.equal(missing.calls.length, 0, 'no fake globe on missing surface');
const surface = { canvas: { width: 200, height: 200 } }, requests = [], current = { centerLon: 1.2, centerLat: .1 };
const complete = context();
assert.equal(Paint.draw(complete.ctx, { presentation: globe, width: 640, height: 480, elapsedMs: 400,
  globeSurface: { render(request) { requests.push(request); return surface; } }, globeRequest: current }), true);
assert.equal(requests[0], current, 'use caller current visible hemisphere');
assert.ok(complete.calls.some(c => c[0] === 'drawImage' && c[1] === surface.canvas));
assert.equal(Paint.draw(context().ctx, { presentation: globe, width: 640, height: 480, elapsedMs: 400,
  globeSurface: { render() { throw new Error('unavailable'); } }, globeRequest: current }), false);
const invalid = { ...fixtures[1], visual: { ...fixtures[1].visual, scope: 'global' } };
assert.equal(Paint.draw(context().ctx, { presentation: invalid, width: 640, height: 480, elapsedMs: 400 }), false);
assert.equal(Paint.audioCue(null), null);
const browserContext = vm.createContext({}); vm.runInContext(source, browserContext);
assert.deepEqual(Object.keys(browserContext), ['FlipgameV112EasterPresentation']);
assert.ok(Object.isFrozen(Paint)); assert.ok(Object.isFrozen(Paint.cueIds));
console.log('Easter presentation passed: 12 real registry cues, 11 distinct scenes, real Globe handoff, duration, mute/reduced motion, lane scope and state isolation.');

async function renderReview(directory) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.FLIP_PREVIEW_BROWSER_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1680, height: 1116 } });
    await page.setContent('<style>body{margin:0;background:#28323d;color:#dfd5c0;font:13px system-ui}main{display:grid;grid-template-columns:repeat(4,420px)}article{height:372px}h2{margin:8px;font-size:13px}</style><main></main>');
    await page.addScriptTag({ content: fs.readFileSync(path.join(Root, 'js/v112-globe.js'), 'utf8') });
    await page.addScriptTag({ content: source });
    const geography = JSON.parse(fs.readFileSync(path.join(Root, 'data/v112-globe/natural-earth-land-110m.geojson'), 'utf8'));
    const checked = await page.evaluate(({ fixtures, geography }) => {
      const globe = globalThis.FlipGlobeV112; globe.setBundledGeography(geography);
      const gc = document.createElement('canvas'); gc.width = gc.height = 256;
      const globeSurface = globe.createSharedSurface(gc, { forceCanvas: true });
      const api = globalThis.FlipgameV112EasterPresentation;
      let checked = 0;
      for (const p of fixtures) {
        const article = document.createElement('article'), canvas = document.createElement('canvas'), title = document.createElement('h2');
        canvas.width = 420; canvas.height = 330; title.textContent = p.cue.headline; article.append(canvas, title); document.querySelector('main').append(article);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#52616c'; ctx.fillRect(0, 0, 420, 330);
        const okay = api.draw(ctx, { presentation: p, width: 420, height: 330, elapsedMs: 680,
          globeSurface, globeRequest: { centerLon: -.5, centerLat: .15 },
          replayPoints: [{ x: .1, y: .9 }, { x: .24, y: .45 }, { x: .5, y: .15 }, { x: .75, y: .4 }, { x: .92, y: .9 }] });
        if (!okay) throw new Error('failed cue ' + p.cue.id);
        const pixels = ctx.getImageData(0, 0, 420, 330).data, colors = new Set();
        for (let i = 0; i < pixels.length; i += 16) colors.add(pixels[i] + ',' + pixels[i + 1] + ',' + pixels[i + 2]);
        if (colors.size < 60) throw new Error('blank cue ' + p.cue.id); checked++;
      }
      return checked;
    }, { fixtures, geography });
    assert.equal(checked, 12); fs.mkdirSync(directory, { recursive: true });
    await page.screenshot({ path: path.join(directory, 'easter-contact-sheet.png'), fullPage: true });
    console.log('Real Chromium: 12 rendered cues, bundled Globe geography. Contact sheet: ' + directory);
  } finally { await browser.close(); }
}
const arg = process.argv.find(v => v.startsWith('--render-directory='));
if (arg) renderReview(path.resolve(arg.slice(19))).catch(error => { console.error(error); process.exitCode = 1; });
