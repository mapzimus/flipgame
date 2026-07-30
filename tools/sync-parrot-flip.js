#!/usr/bin/env node
// sync-parrot-flip.js — publish this game to WhydahStory as "Parrot Flip".
//
// Both sites run the SAME code. Everything that differs is applied here, so a
// future change only ever has to be made once, in flipgame, then synced:
//
//     node tools/sync-parrot-flip.js
//     node tools/sync-parrot-flip.js /path/to/Whydah-Unit/parrot-flip
//
// What the Whydah copy changes, and nothing else:
//   • Named "Parrot Flip", and the parrot is the free edition — the bottle
//     takes the parrot's old unlock slot (window.FLIP_BRAND.baseSkin).
//   • No online multiplayer: net.js is not copied and the entry point is
//     hidden (window.FLIP_BRAND.online = false).
//   • Keeps /games-gate.js, which is WhydahStory hub infrastructure and does
//     not exist in the standalone game.
//   • Its own service-worker cache name, so the two PWAs never share a cache.
//
// Everything else — physics, skins, cartoon casts, achievements, records, CSS —
// is copied byte-for-byte. Do not hand-edit the Whydah copy; it gets overwritten.

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..');
const DEST = path.resolve(
  process.argv[2] || path.join(SRC, '../Whydah-Unit/parrot-flip')
);

// net.js is deliberately absent — the port ships without multiplayer.
const COPY_FILES = [
  'css/style.css',
  'js/polyfills.js', 'js/game.js', 'js/physics.js', 'js/input.js',
  'js/renderer.js', 'js/audio.js', 'js/settings.js', 'js/records.js',
  'js/achievements.js', 'js/cartoon-casts.js', 'js/skins.js', 'js/main.js',
  'js/vendor/matter.min.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-512-maskable.png',
  'roster.html',
  '.nojekyll',
];

function read(p) { return fs.readFileSync(p, 'utf8'); }
function assetVersion() {
  const m = read(path.join(SRC, 'index.html')).match(/\?v=(\d+)/);
  if (!m) throw new Error('could not read ?v= asset version from index.html');
  return m[1];
}

if (!fs.existsSync(path.dirname(DEST))) {
  console.error('Destination parent missing:', path.dirname(DEST));
  console.error('Clone Whydah-Unit next to flipgame, or pass the parrot-flip path:');
  console.error('  node tools/sync-parrot-flip.js /path/to/Whydah-Unit/parrot-flip');
  process.exit(1);
}

// ── 1. Copy the shared files verbatim ───────────────────────────────────────
let copied = 0;
for (const rel of COPY_FILES) {
  const from = path.join(SRC, rel);
  if (!fs.existsSync(from)) { console.warn('  ! missing, skipped:', rel); continue; }
  const to = path.join(DEST, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  copied++;
}

// ── 2. Transform index.html ─────────────────────────────────────────────────
const V = assetVersion();
let html = read(path.join(SRC, 'index.html'));

// Injected immediately AFTER <meta charset> — the charset must stay first in
// <head> for encoding detection, and the brand config must still run before any
// game script reads window.FLIP_BRAND.
const isWhydah = /Whydah-Unit|whydahstory/i.test(DEST);
const brand = `
  ${isWhydah ? '<script src="/games-gate.js" data-enforce="parrot-flip"></script>\n  ' : ''}<!-- Same game as the standalone Bottle Game; only the branding differs.
       parrot is the free edition (it swaps unlock slots with the bottle), and
       this build ships without online multiplayer. See tools/sync-parrot-flip.js
       in the flipgame repo — this folder is generated, do not hand-edit. -->
  <script>window.FLIP_BRAND = { baseSkin: 'parrot', online: false };</script>`;
const charset = html.match(/^[ \t]*<meta charset=[^>]*>/mi);
if (!charset) throw new Error('could not find <meta charset> to anchor the brand config');
html = html.replace(charset[0], `${charset[0]}${brand}`);

html = html
  .replace(/<title>[^<]*<\/title>/i, '<title>Parrot Flip — WhydahStory</title>')
  .replace(/(<meta name="apple-mobile-web-app-title" content=")[^"]*(")/i, '$1Parrot Flip$2')
  // Title uses two tappable words for the secret unlock (Parrot / Flip × 3).
  .replace(
    /<h1\b[^>]*>[\s\S]*?<\/h1>/i,
    '<h1 class="title-secret"><span data-secret="parrot">Parrot</span> <span data-secret="flip">Flip</span></h1>'
  )
  // No multiplayer: drop the script and the lobby markup entirely.
  .replace(/^\s*<script src="js\/net\.js[^"]*"><\/script>\r?\n/m, '')
  .replace(/^\s*<button id="online-btn"[\s\S]*?<\/button>\r?\n/m, '')
  .replace(/<!-- ── Online lobby[\s\S]*?<!-- ── /m, '<!-- ── ');

if (/net\.js|online-btn/.test(html)) throw new Error('multiplayer markup survived the strip');
if (!/FLIP_BRAND/.test(html)) throw new Error('brand config was not injected');
if (!/data-secret="parrot"/.test(html)) throw new Error('parrot title secret spans missing');
fs.writeFileSync(path.join(DEST, 'index.html'), html);

// ── 3. Its own service worker (separate cache from the standalone PWA) ──────
let sw = read(path.join(SRC, 'service-worker.js'))
  .replace(/const CACHE_NAME = '[^']*'/, `const CACHE_NAME = 'parrotflip-v${V}'`)
  .replace(/^\s*'\.\/js\/net\.js',\r?\n/m, '');
fs.writeFileSync(path.join(DEST, 'service-worker.js'), sw);

// ── 4. Manifest ─────────────────────────────────────────────────────────────
const mf = JSON.parse(read(path.join(SRC, 'manifest.json')));
mf.name = 'Parrot Flip';
mf.short_name = 'Parrot Flip';
fs.writeFileSync(path.join(DEST, 'manifest.json'), JSON.stringify(mf, null, 2) + '\n');

// ── 5. Roster page title (optional) ─────────────────────────────────────────
const rosterSrc = path.join(DEST, 'roster.html');
if (fs.existsSync(rosterSrc)) {
  let roster = read(rosterSrc)
    .replace(/<title>[^<]*<\/title>/i, '<title>Parrot Flip — Full Character Roster</title>')
    .replace(/Bottle Game/g, 'Parrot Flip');
  fs.writeFileSync(rosterSrc, roster);
}

console.log(`Synced Parrot Flip -> ${DEST}`);
console.log(`  ${copied} shared files copied verbatim (asset version v${V})`);
console.log('  index.html / service-worker.js / manifest.json rebranded');
console.log('  multiplayer stripped; parrot is the free edition');
