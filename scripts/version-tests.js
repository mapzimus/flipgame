#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const index = read('index.html');
const roster = read('roster.html');
const worker = read('service-worker.js');

const cacheMatch = worker.match(/CACHE_NAME\s*=\s*'flipgame-v(\d+)'/);
const badgeMatch = index.match(/id="version-badge"[^>]*>v(\d+)</);
assert.ok(cacheMatch, 'service-worker cache version is missing');
assert.ok(badgeMatch, 'visible version badge is missing');

const expected = cacheMatch[1];
assert.equal(badgeMatch[1], expected, 'visible badge and service-worker versions differ');
assert.ok(index.includes(`version ${expected}`), 'version badge accessibility label is stale');

for (const [file, html] of [['index.html', index], ['roster.html', roster]]) {
  const versions = [...html.matchAll(/\?v=(\d+)/g)].map((match) => match[1]);
  assert.ok(versions.length > 0, `${file} has no versioned assets`);
  assert.deepEqual([...new Set(versions)], [expected], `${file} has mixed asset versions`);
}

console.log(`Version consistency tests passed (v${expected}).`);
