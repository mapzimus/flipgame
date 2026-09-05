#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const normalizeAsset = (value) => './' + value.replace(/^\.\//, '').split(/[?#]/, 1)[0];

const index = read('index.html');
const manifestText = read('manifest.json');
const manifest = JSON.parse(manifestText);
const worker = read('service-worker.js');
const gradle = read('android/app/build.gradle');
const workflow = read('.github/workflows/build-apk.yml');
const interfaces = require(path.join(root, 'js/v111-interfaces.js'));

assert.equal(interfaces.RELEASE_VERSION, 'v111');
assert.match(index, /id="version-badge"[^>]*aria-label="[^"]*version 111"[^>]*>v111</);
assert.match(worker, /CACHE_NAME\s*=\s*'flipgame-v111'/);
assert.match(gradle, /versionCode\s+111\b/);
assert.match(gradle, /versionName\s+'1\.1\.1'/);
assert.match(workflow, /assembleRelease/);
assert.match(workflow, /ANDROID_KEYSTORE_BASE64/);
assert.match(workflow, /apksigner verify --verbose --print-certs/);
assert.doesNotMatch(workflow, /assembleDebug/);

for (const [file, html] of [['index.html', index]]) {
  const versions = [...html.matchAll(/\?v=(\d+)/g)].map((match) => match[1]);
  assert.ok(versions.length > 0, `${file} has no versioned local assets`);
  assert.deepEqual([...new Set(versions)], ['111'], `${file} contains stale or mixed query versions`);
}

const precached = new Set([...worker.matchAll(/['"](\.\/[^'"]+)['"]/g)]
  .map((match) => normalizeAsset(match[1])));
const referenced = new Set();
for (const html of [index]) {
  for (const match of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) {
    const value = match[1];
    if (/^(?:https?:|data:|#)/i.test(value)) continue;
    referenced.add(normalizeAsset(value));
  }
}
for (const icon of manifest.icons || []) referenced.add(normalizeAsset(icon.src));

for (const asset of referenced) {
  const relative = asset.slice(2);
  assert.ok(fs.existsSync(path.join(root, relative)), `referenced local asset is missing: ${asset}`);
  assert.ok(precached.has(asset), `referenced local asset is not precached: ${asset}`);
}

const runtimeModules = fs.readdirSync(path.join(root, 'js'))
  .filter((name) => /^v111-.*\.js$/.test(name))
  .map((name) => './js/' + name);
for (const asset of runtimeModules) {
  const indexPath = asset.replace(/^\.\//, '');
  assert.match(index, new RegExp(indexPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\?v=111'),
    `index does not load ${asset}`);
  assert.ok(precached.has(asset), `runtime module is not precached: ${asset}`);
}

assert.doesNotMatch(worker, /Promise\.allSettled\s*\(/,
  'critical precache must fail atomically instead of activating a partial release');
assert.match(worker, /Promise\.all\s*\(/,
  'critical precache must complete before the new worker activates');

const retiredRasterRoot = path.join(root, 'icons', 'skins');
const retiredRasterFiles = fs.existsSync(retiredRasterRoot)
  ? fs.readdirSync(retiredRasterRoot, { recursive: true }).filter((name) => /\.png$/i.test(name))
  : [];
assert.equal(retiredRasterFiles.length, 0, 'retired generated raster skins must not ship');

console.log(`v111 release tests passed (${referenced.size} referenced assets, ${runtimeModules.length} runtime modules).`);
