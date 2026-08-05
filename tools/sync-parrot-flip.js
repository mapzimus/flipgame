#!/usr/bin/env node
// sync-parrot-flip.js — publish the bare-bones Parrot Flip game to WhydahStory.
//
// Source of truth: flipgame/parrot-flip/  (parrots + base party game only —
// no achievements, unlocks, skins catalog, or Hall of Fame).
//
//     node tools/sync-parrot-flip.js
//     node tools/sync-parrot-flip.js /path/to/Whydah-Unit/parrot-flip
//
// Whydah-only differences applied here:
//   • Title "Parrot Flip — WhydahStory"
//   • Injects /games-gate.js (classroom lock)
//   • Back link → /games/
//   • Separate service-worker cache name
//
// Do not hand-edit the Whydah copy; re-run this script to overwrite it.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'parrot-flip');
const DEST = path.resolve(
  process.argv[2] || path.join(ROOT, '../Whydah-Unit/parrot-flip')
);

const COPY_FILES = [
  'css/style.css',
  'js/game.js', 'js/physics.js', 'js/input.js',
  'js/renderer.js', 'js/audio.js', 'js/main.js',
  'js/vendor/matter.min.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-512-maskable.png',
  'manifest.json',
  '.nojekyll',
  'README.md',
];

// Leftovers from the old unlock-heavy Whydah sync — delete on every publish.
const REMOVE_FILES = [
  'js/achievements.js',
  'js/cartoon-casts.js',
  'js/polyfills.js',
  'js/records.js',
  'js/settings.js',
  'js/skins.js',
  'js/net.js',
  'roster.html',
  'HANDOFF.md',
];

function read(p) { return fs.readFileSync(p, 'utf8'); }

function assetVersion() {
  const m = read(path.join(SRC, 'index.html')).match(/\?v=(\d+)/);
  if (!m) throw new Error('could not read ?v= asset version from parrot-flip/index.html');
  return m[1];
}

if (!fs.existsSync(SRC)) {
  console.error('Missing source:', SRC);
  process.exit(1);
}
if (!fs.existsSync(path.dirname(DEST))) {
  console.error('Destination parent missing:', path.dirname(DEST));
  console.error('Clone Whydah-Unit next to flipgame, or pass the parrot-flip path:');
  console.error('  node tools/sync-parrot-flip.js /path/to/Whydah-Unit/parrot-flip');
  process.exit(1);
}

fs.mkdirSync(DEST, { recursive: true });

const V = assetVersion();
let copied = 0;
for (const rel of COPY_FILES) {
  const from = path.join(SRC, rel);
  if (!fs.existsSync(from)) { console.warn('  ! missing, skipped:', rel); continue; }
  const to = path.join(DEST, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  copied++;
}

for (const rel of REMOVE_FILES) {
  const p = path.join(DEST, rel);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    console.log('  - removed stale', rel);
  }
}

const isWhydah = /Whydah-Unit|whydahstory/i.test(DEST);
let html = read(path.join(SRC, 'index.html'));

const gate = isWhydah
  ? `\n  <script src="/games-gate.js" data-enforce="parrot-flip"></script>`
  : '';
const charset = html.match(/^[ \t]*<meta charset=[^>]*>/mi);
if (!charset) throw new Error('could not find <meta charset>');
html = html.replace(charset[0], `${charset[0]}${gate}`);

html = html
  .replace(/<title>[^<]*<\/title>/i, '<title>Parrot Flip — WhydahStory</title>')
  .replace(
    /(<meta name="apple-mobile-web-app-title" content=")[^"]*(")/i,
    '$1Parrot Flip$2'
  )
  .replace(
    /<a class="back-link"[^>]*>[\s\S]*?<\/a>/i,
    '<a class="back-link" href="/games/">← Whydah Games</a>'
  );

// Drop any unlock/achievement scripts if a future source ever reintroduces them.
html = html
  .replace(/^\s*<script src="js\/(?:achievements|records|skins|cartoon-casts|settings|polyfills|net)\.js[^"]*"><\/script>\r?\n/gm, '');

if (/achievements|skins\.js|cartoon-casts|records\.js/.test(html)) {
  throw new Error('unlock scripts survived the strip — aborting');
}
if (isWhydah && !/games-gate\.js/.test(html)) {
  throw new Error('games-gate.js was not injected');
}

fs.writeFileSync(path.join(DEST, 'index.html'), html);

let sw = read(path.join(SRC, 'service-worker.js'))
  .replace(/const CACHE_NAME = '[^']*'/, `const CACHE_NAME = 'whydah-parrot-flip-v${V}'`);
// Precache only bare-bones files (drop any leftover unlock URLs).
sw = sw.replace(
  /const PRECACHE_URLS = \[[\s\S]*?\];/,
  `const PRECACHE_URLS = [
  './',
  './index.html',
  './css/style.css',
  './js/game.js',
  './js/physics.js',
  './js/input.js',
  './js/renderer.js',
  './js/audio.js',
  './js/main.js',
  './js/vendor/matter.min.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];`
);
fs.writeFileSync(path.join(DEST, 'service-worker.js'), sw);

const mf = JSON.parse(read(path.join(SRC, 'manifest.json')));
mf.name = 'Parrot Flip';
mf.short_name = 'Parrot Flip';
mf.description = 'Bare-bones pirate parrot flip for WhydahStory — same physics, eye patches mandatory.';
fs.writeFileSync(path.join(DEST, 'manifest.json'), JSON.stringify(mf, null, 2) + '\n');

console.log(`Synced bare-bones Parrot Flip -> ${DEST}`);
console.log(`  ${copied} files copied from parrot-flip/ (asset version v${V})`);
console.log('  games-gate + Whydah title/back-link applied; unlock extras removed');
