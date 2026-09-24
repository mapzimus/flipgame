#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const index = read('index.html');
const worker = read('service-worker.js');
const interfaces = require(path.join(root, 'js', 'v111-interfaces.js'));

const publicVersion = interfaces.RELEASE_VERSION;
const cacheMatch = worker.match(/CACHE_NAME\s*=\s*'flipgame-v(\d+)-(\d+)'/);
const badgeMatch = index.match(/id="version-badge"[^>]*>(v\d+\.\d+)</);
assert.ok(cacheMatch, 'service-worker cache version is missing');
assert.ok(badgeMatch, 'visible version badge is missing');

assert.equal(publicVersion, 'v1.13');
assert.equal(badgeMatch[1], publicVersion, 'visible badge and release metadata differ');
assert.equal(`v${cacheMatch[1]}.${cacheMatch[2]}`, publicVersion,
  'service-worker cache and public versions differ');
assert.ok(index.includes('version 1.13'), 'version badge accessibility label is stale');

for (const [file, html] of [['index.html', index]]) {
  const versions = [...html.matchAll(/\?v=(\d+)/g)].map((match) => match[1]);
  assert.ok(versions.length > 0, `${file} has no versioned assets`);
  assert.deepEqual([...new Set(versions)], ['113'], `${file} has mixed asset build identifiers`);
}

console.log(`Version consistency tests passed (${publicVersion}, build 113).`);
