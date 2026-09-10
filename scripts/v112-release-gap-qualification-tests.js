'use strict';
// Release acceptance, not a claim that isolated module success implies live
// readiness. Tests/docs only: no runtime patching, version bump or deployment.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const Root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(Root, file), 'utf8');
const Catalog = require('../js/v112-progression-catalog.js');
const Stats = require('../js/v111-stats.js');
const Names = require('../js/v111-name-policy.js');
const main = read('js/main.js'), html = read('index.html'), boot = read('js/v111-boot.js');
const declaration = boot.match(/var SCRIPT_URLS = \[[\s\S]*?\n  \];/)[0];
const bootAssets = Array.from(vm.runInNewContext('var VERSION="111";' + declaration + '\nSCRIPT_URLS;'), p => p.split('?')[0]);
const outcomes = [];
async function test(name, classification, run) {
  try { const detail = await run(); outcomes.push({ name, classification, pass: true, detail }); }
  catch (error) { outcomes.push({ name, classification, pass: false, error: error.message }); }
}
async function application(run) {
  const store = new Map();
  const context = vm.createContext({ console, crypto: webcrypto, AbortController,
    localStorage: { getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    navigator: { locks: { request(_name, _options, callback) { return Promise.resolve().then(() => callback({ name: 'audit-writer' })); } } },
  });
  vm.runInContext(read('js/v112-browser-bundle.js'), context);
  const app = context.FlipgameV112; await app.ready;
  try { return await run(app, context); } finally { app.close(); }
}
function skinEnvironment() {
  // Sprite prewarm may allocate Image asynchronously; this metadata-only probe
  // deliberately does not claim to decode/raster-approve those image assets.
  const context = vm.createContext({ console, setTimeout, clearTimeout, Image: class Image {} }); context.window = context;
  for (const file of ['js/v111-art-platform.js', 'js/v111-object-manifest.js', 'js/v111-art-reference.js',
    'js/v111-art-pack-a.js', 'js/v111-art-pack-b.js', 'js/v111-art-pack-c.js', 'js/cast25.js', 'js/v112-variant-names.js', 'js/skins.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  return context.Skins;
}
function optionValues(id) {
  const body = html.match(new RegExp('<select[^>]+id="' + id + '"[^>]*>([\\s\\S]*?)</select>'));
  return body ? Array.from(body[1].matchAll(/<option(?:[^>]*value="([^"]*)")?[^>]*>([^<]*)<\/option>/g), m => m[1] == null ? m[2] : m[1]) : [];
}
async function run() {
  await test('canonical content counts and FL thresholds', 'module-contract', () => {
    assert.equal(Catalog.objectIds.length, 51); assert.equal(Catalog.arenaIds.length, 23);
    assert.equal(Catalog.storeCosmetics.length, 40); assert.equal(Catalog.variantCount, 612);
    const Achievements = require('../js/v112-achievements.js'); assert.equal(Achievements.catalogSummary().total, 120);
    const Economy = require('../js/v112-economy.js');
    assert.equal(Economy.fxpThresholdForLevel(50), 1590); assert.equal(Economy.fxpThresholdForLevel(100), 3705);
    return { objects: 51, arenas: 23, storeCosmetics: 40, variants: 612, achievements: 120 };
  });
  await test('fresh private profile and ephemeral owner testing', 'module-contract', () => application(app => {
    assert.deepEqual(Array.from(app.objects().filter(o => !o.locked), o => o.id), ['bottle']);
    const before = JSON.stringify(app.snapshot().profile);
    app.enableOwnerTesting('Howe Test Mode'); assert.equal(app.objects().filter(o => !o.locked).length, 51);
    app.disableOwnerTesting(); assert.equal(JSON.stringify(app.snapshot().profile), before);
  }));
  await test('shipped boot actually loads private v1.12 application', 'live-integration', () => {
    assert.ok(bootAssets.includes('js/v112-browser-bundle.js'), 'boot loads legacy main/game/progression but omits v112-browser-bundle.js');
  });
  await test('live main consumes private session/progression authority', 'live-integration', () => {
    assert.match(main, /\bFlipgameV112\.(?:beginSession|attachPhysics)/, 'main has no private application session/physics connection');
  });
  await test('browser application accepts Cup and Team Clash', 'live-integration', () => application(app => {
    for (const formatId of ['cup', 'team-clash']) {
      app.beginSession({ formatId, roster: [{ name: 'One' }, { name: 'Two' }] }); app.abandonSession();
    }
  }));
  await test('browser application supports physical Alien and Insane sessions', 'live-integration', () => application(app => {
    app.enableOwnerTesting('Howe Test Mode');
    for (const physicsModeId of ['alien', 'insane']) {
      app.beginSession({ physicsModeId, roster: [{ name: 'One' }, { name: 'Two' }] }); app.abandonSession();
    }
  }));
  await test('Story is an executable fresh-save activity, not only a view/request', 'live-integration', () => application(app => {
    assert.ok(app.storyViews().hub, 'Story hub data available');
    assert.ok(Array.from(app.supported.activities).includes('story'), 'public app only supports ' + JSON.stringify(app.supported));
  }));
  await test('Battle reaches the playable application', 'live-integration', () => application(app => {
    assert.ok(Array.from(app.supported.formats).includes('battle'), 'Battle rules/runtime exist but application does not expose Battle');
  }));
  await test('Story, Rival, Battle, Store and Tutorial have player routes', 'live-integration', () => {
    const missing = ['story', 'rival', 'battle', 'store', 'tutorial'].filter(term => !new RegExp('(?:id|data-route)="[^"]*' + term + '[^"]*"').test(html));
    assert.deepEqual(missing, [], 'missing routes: ' + missing.join(', '));
  });
  await test('Classic setup permits 16 entries and does not truncate legacy save roster', 'live-integration', () => {
    assert.doesNotMatch(main, /if\s*\(playerCount\s*>=\s*8\)/, 'add-player remains capped at eight');
    assert.doesNotMatch(main, /s\.rows\.slice\(0,\s*8\)/, 'saved setup silently truncates to eight');
  });
  await test('every canonical object is drawable by shipped art registry', 'live-content', () => {
    const skins = skinEnvironment();
    const missing = Catalog.objectIds.filter(id => id !== 'bottle' && !skins.hasDraw(id));
    assert.deepEqual(missing, [], 'no live draw path: ' + missing.join(', '));
  });
  await test('every gallery has twelve distinct safe color-correlated names', 'live-content', () => {
    const skins = skinEnvironment(), bad = [];
    for (const id of Catalog.objectIds) {
      const names = Catalog.variantFlavors.map(v => skins.nameFor(id, v.color));
      if (new Set(names).size !== 12 || names.some(n => !Names.validate(n).ok)) bad.push({ id, unique: new Set(names).size });
    }
    assert.deepEqual(bad, [], 'gallery names incomplete/invalid: ' + JSON.stringify(bad));
  });
  await test('all 23 arenas are reachable from live Arena Select', 'live-content', () => {
    const old = require('../js/v111-cosmetic-catalog.js').internalCatalog().filter(c => c.type === 'arena');
    if (/function availableArenaChoices\(\)[\s\S]{0,450}FlipgameV111Cosmetics/.test(main)) {
      assert.equal(old.length + 1, 23, 'live selector uses legacy cosmetic arenas; count including Baseline=' + (old.length + 1));
    }
    assert.equal(require('../js/v112-arena-preview.js').list().length, 23);
  });
  await test('shipped achievement gallery contains all 120 entries', 'live-content', () => {
    const legacy = require('../js/achievements.js');
    if (/Achievements\.list\(/.test(main)) assert.equal(legacy.total(), 120, 'live gallery reads old achievement provider');
  });
  await test('Story/Battle stats have lossless versioned activity fields', 'data', () => {
    const output = Stats.normalizeFlipRecord({ schema: 'FlipRecordV2', version: 2,
      uuid: '00000000-0000-4000-8000-000000000001', timestamp: 1000, matchId: 'audit-match',
      activityId: 'story', formatId: 'classic', physicsModeId: 'normal',
      storyChapterId: 'first-broadcast', laneId: 'lane-1', launchLeaseId: 'launch-1', result: 'MAKE' });
    assert.equal(output.schema, 'FlipRecordV2', 'normalizer downgrades the new record schema');
    assert.equal(output.activityId, 'story'); assert.equal(output.storyChapterId, 'first-broadcast');
  });
  for (const type of ['story', 'battle']) await test(type + ' CSV export exists', 'data', () => {
    const csv = Stats.exportCSV({ flips: [], matches: [], rollups: [] }, type);
    assert.equal(typeof csv, 'string');
  });
  await test('Stats UI can filter Battle and 16-player sessions', 'data', () => {
    assert.ok(optionValues('stats-format').includes('battle'), 'Battle absent from Stats mode selector');
    assert.ok(optionValues('stats-player-count').includes('16'), 'Stats player-count selector ends at eight');
  });
  await test('offline names retain safe accents/QA names and reject markup/evasions', 'safety', () => {
    for (const name of ['Mr. Howe', 'Howe Test Mode', 'Élodie', 'Class', 'Scunthorpe']) assert.ok(Names.validate(name).ok, name);
    for (const name of ['<img onerror=x>', 'f.u.c.k', 'sh1t']) assert.equal(Names.validate(name).ok, false);
    assert.equal(Names.validate('A\u202eB').value, 'AB');
    assert.equal(Stats.MAX_RAW_FLIPS, 100000);
  });
  await test('Online transports are absent from actual boot graph and UI', 'safety', () => {
    assert.ok(!fs.existsSync(path.join(Root, 'js/net.js')));
    assert.ok(!fs.existsSync(path.join(Root, 'js/v111-network-protocol.js')));
    assert.ok(!bootAssets.some(p => /(?:^|\/)(?:net|v111-network-protocol)\.js$/.test(p)));
    assert.doesNotMatch(html, /id="(?:online|lobby|host-room|join-room)[^"]*"/);
  });
  await test('both APK and Pages packaging include offline Globe geography', 'packaging', () => {
    const workflow = read('.github/workflows/build-apk.yml');
    const apk = workflow.match(/cp -r ([^\r\n]+)android\/app\/src\/main\/assets\//);
    const pages = workflow.match(/cp -R ([^\r\n]+)pages-site\//);
    assert.ok(apk && /\bdata\b/.test(apk[1]), 'APK copy omits data/; bundled real Globe geography is not packaged');
    assert.ok(pages && /\bdata\b/.test(pages[1]), 'GitHub Pages copy omits data/');
  });
  await test('service-worker precache includes every required shipped boot dependency', 'packaging', () => {
    const worker = read('service-worker.js');
    const precacheDeclaration = worker.match(/const PRECACHE_URLS = \[[\s\S]*?\n\];/)[0];
    const cache = new Set(Array.from(vm.runInNewContext(precacheDeclaration + '\nPRECACHE_URLS;'), p => p.replace(/^\.\//, '').split('?')[0]));
    const styles = vm.runInNewContext('var VERSION="111";' + boot.match(/var STYLE_URLS = \[[^;]*;/)[0] + '\nSTYLE_URLS;');
    const missing = [...bootAssets, ...Array.from(styles, p => p.split('?')[0])].filter(p => !cache.has(p));
    assert.deepEqual(missing, [], 'fresh offline precache omits required boot dependencies: ' + missing.join(', '));
  });
  await test('release identities are v1.12/112 when candidate is approved', 'release-gate', () => {
    assert.equal(require('../js/v111-interfaces.js').RELEASE_VERSION, 'v1.12', 'deliberately deferred identity bump still required');
    const gradle = read('android/app/build.gradle');
    assert.match(gradle, /versionCode\s+112\b/); assert.match(gradle, /versionName\s+['"]1\.12['"]/);
  });
  const report = { schema: 'ReleaseGapQualificationV1', qualificationBaseline: 'c831ece',
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: Root, encoding: 'utf8' }).trim(),
    passing: outcomes.filter(x => x.pass).length, failing: outcomes.filter(x => !x.pass).length, outcomes };
  console.log(JSON.stringify(report, null, 2));
  if (report.failing) process.exitCode = 1;
}
run().catch(error => { console.error(error); process.exitCode = 1; });
