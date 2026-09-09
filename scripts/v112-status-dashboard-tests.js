#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const dashboard = path.join(root, 'tools', 'v112-status');
const status = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'v112-status.json'), 'utf8'));
const html = fs.readFileSync(path.join(dashboard, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(dashboard, 'style.css'), 'utf8');
const app = fs.readFileSync(path.join(dashboard, 'app.js'), 'utf8');

assert.strictEqual(status.schema, 'FlipgameReleaseStatusV1');
assert.strictEqual(status.release, 'v1.12');
assert.strictEqual(status.ownerApproval, false);
assert.strictEqual(status.publicBaseline, '947133360d3487a646e04be2b313c577474f54a5');
assert.strictEqual(status.waves.length, 11);
assert.strictEqual(status.gates.length, 10);
assert.match(status.candidateState, /NOT RELEASE READY/);

for (const id of ['waves', 'workstreams', 'gates', 'tests', 'commits', 'defects']) {
  assert.match(html, new RegExp(`id="${id}"`), `missing dashboard region ${id}`);
}
assert.match(css, /@media \(max-width: 760px\)/);
assert.match(css, /prefers-reduced-motion/);
assert.match(app, /setInterval\(\(\) => void refresh\(\), 4000\)/);
assert.doesNotMatch(app, /innerHTML|outerHTML|document\.write/);

execFileSync(process.execPath, ['--check', path.join(dashboard, 'server.mjs')], { cwd: root, stdio: 'pipe' });
execFileSync(process.execPath, ['--check', path.join(dashboard, 'app.js')], { cwd: root, stdio: 'pipe' });

const snapshotText = execFileSync(process.execPath, [path.join(dashboard, 'server.mjs'), '--snapshot'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 8 * 1024 * 1024
});
const snapshot = JSON.parse(snapshotText);
assert.strictEqual(snapshot.config.release, 'v1.12');
assert.strictEqual(snapshot.integration.branch, 'codex/v112-integration');
assert.match(snapshot.integration.head, /^[0-9a-f]{40}$/);
assert(snapshot.integration.latestRevision.number >= 51);
assert(snapshot.defects.length >= 100);
assert(snapshot.counts.p1 > 0, 'release ledger must expose unresolved P1 blockers');
assert(Array.isArray(snapshot.worktrees));
assert(snapshot.worktrees.some((item) => item.branch === 'codex/v112-integration'));
assert.strictEqual(snapshot.tests.state, 'waiting');

console.log('v1.12 status dashboard tests passed');
