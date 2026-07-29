// service-worker.js — offline precache for Bottle Game.
// Bump CACHE_NAME on every release so stale caches are purged and users get
// the fresh build. All paths are RELATIVE so they resolve under /flipgame/
// on GitHub Pages (the SW lives at repo root → scope is /flipgame/).
const CACHE_NAME = 'flipgame-v71';

const PRECACHE_URLS = [
  './',
  './index.html',
  './roster.html',
  './css/style.css',
  './js/polyfills.js',
  './js/game.js',
  './js/physics.js',
  './js/input.js',
  './js/renderer.js',
  './js/audio.js',
  './js/settings.js',
  './js/records.js',
  './js/achievements.js',
  './js/skins.js',
  './js/net.js',
  './js/main.js',
  './js/vendor/matter.min.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/skins/cryptids/1f9bff.png',
  './icons/skins/cryptids/3fae1a.png',
  './icons/skins/cryptids/4f63e0.png',
  './icons/skins/cryptids/5fcfe6.png',
  './icons/skins/cryptids/8a3ffc.png',
  './icons/skins/cryptids/8ed11a.png',
  './icons/skins/cryptids/c8203a.png',
  './icons/skins/cryptids/e3263c.png',
  './icons/skins/cryptids/ff5b86.png',
  './icons/skins/cryptids/ff7a00.png',
  './icons/skins/cryptids/ff9ecf.png',
  './icons/skins/cryptids/ffc233.png',
  './icons/skins/pets/1f9bff.png',
  './icons/skins/pets/3fae1a.png',
  './icons/skins/pets/4f63e0.png',
  './icons/skins/pets/5fcfe6.png',
  './icons/skins/pets/8a3ffc.png',
  './icons/skins/pets/8ed11a.png',
  './icons/skins/pets/c8203a.png',
  './icons/skins/pets/e3263c.png',
  './icons/skins/pets/ff5b86.png',
  './icons/skins/pets/ff7a00.png',
  './icons/skins/pets/ff9ecf.png',
  './icons/skins/pets/ffc233.png',
  './icons/skins/people/1f9bff.png',
  './icons/skins/people/3fae1a.png',
  './icons/skins/people/4f63e0.png',
  './icons/skins/people/5fcfe6.png',
  './icons/skins/people/8a3ffc.png',
  './icons/skins/people/8ed11a.png',
  './icons/skins/people/c8203a.png',
  './icons/skins/people/e3263c.png',
  './icons/skins/people/ff5b86.png',
  './icons/skins/people/ff7a00.png',
  './icons/skins/people/ff9ecf.png',
  './icons/skins/people/ffc233.png',
  './icons/skins/gods/1f9bff.png',
  './icons/skins/gods/3fae1a.png',
  './icons/skins/gods/4f63e0.png',
  './icons/skins/gods/5fcfe6.png',
  './icons/skins/gods/8a3ffc.png',
  './icons/skins/gods/8ed11a.png',
  './icons/skins/gods/c8203a.png',
  './icons/skins/gods/e3263c.png',
  './icons/skins/gods/ff5b86.png',
  './icons/skins/gods/ff7a00.png',
  './icons/skins/gods/ff9ecf.png',
  './icons/skins/gods/ffc233.png',
  './icons/skins/buildings/1f9bff.png',
  './icons/skins/buildings/3fae1a.png',
  './icons/skins/buildings/4f63e0.png',
  './icons/skins/buildings/5fcfe6.png',
  './icons/skins/buildings/8a3ffc.png',
  './icons/skins/buildings/8ed11a.png',
  './icons/skins/buildings/c8203a.png',
  './icons/skins/buildings/e3263c.png',
  './icons/skins/buildings/ff5b86.png',
  './icons/skins/buildings/ff7a00.png',
  './icons/skins/buildings/ff9ecf.png',
  './icons/skins/buildings/ffc233.png',
  './icons/skins/alien/1f9bff.png',
  './icons/skins/alien/3fae1a.png',
  './icons/skins/alien/4f63e0.png',
  './icons/skins/alien/5fcfe6.png',
  './icons/skins/alien/8a3ffc.png',
  './icons/skins/alien/8ed11a.png',
  './icons/skins/alien/c8203a.png',
  './icons/skins/alien/e3263c.png',
  './icons/skins/alien/ff5b86.png',
  './icons/skins/alien/ff7a00.png',
  './icons/skins/alien/ff9ecf.png',
  './icons/skins/alien/ffc233.png',
  './icons/skins/garden/1f9bff.png',
  './icons/skins/garden/3fae1a.png',
  './icons/skins/garden/4f63e0.png',
  './icons/skins/garden/5fcfe6.png',
  './icons/skins/garden/8a3ffc.png',
  './icons/skins/garden/8ed11a.png',
  './icons/skins/garden/c8203a.png',
  './icons/skins/garden/e3263c.png',
  './icons/skins/garden/ff5b86.png',
  './icons/skins/garden/ff7a00.png',
  './icons/skins/garden/ff9ecf.png',
  './icons/skins/garden/ffc233.png',
  './icons/skins/robots/1f9bff.png',
  './icons/skins/robots/3fae1a.png',
  './icons/skins/robots/4f63e0.png',
  './icons/skins/robots/5fcfe6.png',
  './icons/skins/robots/8a3ffc.png',
  './icons/skins/robots/8ed11a.png',
  './icons/skins/robots/c8203a.png',
  './icons/skins/robots/e3263c.png',
  './icons/skins/robots/ff5b86.png',
  './icons/skins/robots/ff7a00.png',
  './icons/skins/robots/ff9ecf.png',
  './icons/skins/robots/ffc233.png',
  './icons/skins/ocean/1f9bff.png',
  './icons/skins/ocean/3fae1a.png',
  './icons/skins/ocean/4f63e0.png',
  './icons/skins/ocean/5fcfe6.png',
  './icons/skins/ocean/8a3ffc.png',
  './icons/skins/ocean/8ed11a.png',
  './icons/skins/ocean/c8203a.png',
  './icons/skins/ocean/e3263c.png',
  './icons/skins/ocean/ff5b86.png',
  './icons/skins/ocean/ff7a00.png',
  './icons/skins/ocean/ff9ecf.png',
  './icons/skins/ocean/ffc233.png',
  './icons/skins/snacks/1f9bff.png',
  './icons/skins/snacks/3fae1a.png',
  './icons/skins/snacks/4f63e0.png',
  './icons/skins/snacks/5fcfe6.png',
  './icons/skins/snacks/8a3ffc.png',
  './icons/skins/snacks/8ed11a.png',
  './icons/skins/snacks/c8203a.png',
  './icons/skins/snacks/e3263c.png',
  './icons/skins/snacks/ff5b86.png',
  './icons/skins/snacks/ff7a00.png',
  './icons/skins/snacks/ff9ecf.png',
  './icons/skins/snacks/ffc233.png',
];

self.addEventListener('install', (event) => {
  // Cache entries INDIVIDUALLY (not addAll, which is atomic). A single 404 or
  // flaky fetch must not abort the whole precache and leave us with no offline
  // cache at all — better a partial cache than none.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(PRECACHE_URLS.map((u) => cache.add(u)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// HTML/navigation is network-first so the main game URL updates as soon as a
// deploy finishes. Other assets stay stale-while-revalidate for fast offline
// starts, with query-string asset bumps pulling the matching release files.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const req = event.request;
  const isPage = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isPage) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        fetch(req).then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        }).catch(() => cache.match(req).then((cached) => cached || cache.match('./')))
      )
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(req).then((cached) => {
        // HTML uses ?v=N cache-busting; precache stores bare paths — ignore the
        // query when looking up so offline still hits the precache.
        const lookup = cached || cache.match(req, { ignoreSearch: true });
        return Promise.resolve(lookup).then((hit) => {
          const fromNetwork = fetch(req).then((res) => {
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          }).catch(() => hit);
          return hit || fromNetwork;
        });
      })
    )
  );
});
