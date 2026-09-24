// v111-boot.js -- atomic release controller gate and ordered runtime loader.
(function () {
  'use strict';

  var VERSION = '113';
  var WORKER_URL = 'service-worker.js?v=113';
  var STYLE_URLS = ['css/style.css?v=113', 'css/v112-broadcast.css?v=113'];
  var SCRIPT_URLS = [
    'js/vendor/matter.min.js?v=113',
    'js/polyfills.js?v=113',
    'js/v111-interfaces.js?v=113',
    'js/v111-runtime.js?v=113',
    'js/v111-name-policy.js?v=113',
    'js/v111-save-backup.js?v=113',
    'js/v111-stats.js?v=113',
    // The private v1.12 authority captures the already-loaded shared Stats
    // writer. Its readiness gate must resolve before legacy presentation boots.
    'js/v112-browser-bundle.js?v=113',
    'js/v111-platform.js?v=113',
    'js/v111-art-platform.js?v=113',
    'js/v111-object-manifest.js?v=113',
    'js/v111-art-reference.js?v=113',
    // Optional, local-only sphere renderer. It must load before art pack B so
    // the existing Desk Globe stand can delegate its sphere without changing
    // any competitive art or physics.
    'js/v112-globe.js?v=113',
    'js/v112-globe-live.js?v=113',
    'js/v112-art-system.js?v=113',
    'js/v111-art-pack-a.js?v=113',
    'js/v111-art-pack-b.js?v=113',
    'js/v111-art-pack-c.js?v=113',
    'js/v111-legacy-object-dynamics.js?v=113',
    'js/v111-reaction-renderer.js?v=113',
    'js/v111-bootstrap.js?v=113',
    'js/v111-content-catalog.js?v=113',
    'js/v111-cosmetic-catalog.js?v=113',
    'js/v111-progression.js?v=113',
    'js/v111-modes.js?v=113',
    'js/v111-physics-events.js?v=113',
    'js/v111-mirror-match.js?v=113',
    'js/game.js?v=113',
    // Canonical v1.12 Plinko authority. The Matter host and live bridge must
    // load before physics.js so Plinko cannot fall back to the retired path.
    'js/v112-plinko-matter.js?v=113',
    'js/v112-plinko-live.js?v=113',
    'js/physics.js?v=113',
    'js/v112-physics-driver.js?v=113',
    'js/v112-hud-projection.js?v=113',
    // Staged v1.12 development dependency. The release integrator will fold
    // this into the v1.12 cache identity and precache at the release gate.
    'js/v112-cpu.js?v=113',
    'js/input.js?v=113',
    'js/v112-plinko-presentation.js?v=113',
    'js/renderer.js?v=113',
    'js/audio.js?v=113',
    'js/settings.js?v=113',
    'js/records.js?v=113',
    'js/achievements.js?v=113',
    'js/cast25.js?v=113',
    'js/v112-variant-names.js?v=113',
    'js/v112-arena-preview.js?v=113',
    'js/v112-easter-eggs.js?v=113',
    'js/v112-easter-presentation.js?v=113',
    'js/v112-journey-routes.js?v=113',
    'js/v112-journey-host.js?v=113',
    // Battle plays its series in the page, because only the page owns pointers,
    // lanes and physics. These are the rules, input router and coordinator it
    // needs; the private application still owns the reward for a finished one.
    'js/v112-battle.js?v=113',
    'js/v112-activity.js?v=113',
    'js/v112-multipointer.js?v=113',
    'js/v112-battle-runtime.js?v=113',
    'js/v112-battle-host.js?v=113',
    'js/v112-battle-routes.js?v=113',
    'js/skins.js?v=113',
    'js/main.js?v=113',
  ];
  var started = false;
  var bootFailure = null;

  window.__FLIPGAME_BOOT_VERSION__ = 'v1.13';
  window.__FLIPGAME_BOOT_ASSETS__ = Object.freeze({
    styles: Object.freeze(STYLE_URLS.slice()),
    scripts: Object.freeze(SCRIPT_URLS.slice()),
  });

  function versionOfWorker(worker) {
    if (!worker || !worker.scriptURL) return null;
    try { return new URL(worker.scriptURL, location.href).searchParams.get('v'); }
    catch (_) { return null; }
  }

  function controlledByThisRelease() {
    return versionOfWorker(navigator.serviceWorker && navigator.serviceWorker.controller) === VERSION;
  }

  function productionHttp() {
    return /^https?:$/.test(location.protocol) &&
      location.hostname !== 'localhost' && location.hostname !== '127.0.0.1';
  }

  function loadStyle(url) {
    return new Promise(function (resolve, reject) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.onload = resolve;
      link.onerror = function () { reject(new Error('Could not load ' + url)); };
      document.head.appendChild(link);
    });
  }

  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = url;
      script.async = false;
      script.onload = function () {
        if (bootFailure) reject(bootFailure); else resolve();
      };
      script.onerror = function () { reject(new Error('Could not load ' + url)); };
      document.body.appendChild(script);
    });
  }

  function waitForReleaseController(registration) {
    if (controlledByThisRelease()) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () { finish(new Error('The v1.13 offline update did not finish.')); }, 30000);
      var workers = [registration.installing, registration.waiting, registration.active].filter(Boolean);

      function cleanup() {
        clearTimeout(timer);
        navigator.serviceWorker.removeEventListener('controllerchange', check);
        workers.forEach(function (worker) { worker.removeEventListener('statechange', check); });
      }
      function finish(error) {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error); else resolve();
      }
      function check() {
        if (controlledByThisRelease()) finish();
        else if (workers.some(function (worker) {
          return versionOfWorker(worker) === VERSION && worker.state === 'redundant';
        })) finish(new Error('The v1.13 offline update was rejected.'));
      }

      navigator.serviceWorker.addEventListener('controllerchange', check);
      workers.forEach(function (worker) { worker.addEventListener('statechange', check); });
      check();
    });
  }

  async function ensureReleaseController() {
    if (!productionHttp() || !('serviceWorker' in navigator)) return;
    // A matching controller owns a complete, atomically installed release.
    // Accept it before touching the network so a cold installed PWA can boot
    // entirely from that worker's cache while the device is offline.
    if (controlledByThisRelease()) return;
    var registration = await navigator.serviceWorker.register(WORKER_URL, {
      scope: './', updateViaCache: 'none',
    });
    await waitForReleaseController(registration);
    if (!controlledByThisRelease()) throw new Error('The v1.13 worker is not controlling this page.');
  }

  async function start() {
    if (started) return;
    started = true;
    await ensureReleaseController();
    for (var style of STYLE_URLS) await loadStyle(style);
    for (var script of SCRIPT_URLS) {
      await loadScript(script);
      if (script.indexOf('js/v112-browser-bundle.js') === 0) {
        var application = window.FlipgameV112;
        if (!application || !application.ready || typeof application.ready.then !== 'function') {
          throw new Error('The v1.12 application authority did not initialize.');
        }
        await application.ready;
      }
    }
    var status = document.getElementById('flipgame-boot-status');
    if (status && status.parentNode) status.parentNode.removeChild(status);
    document.body.classList.add('flipgame-boot-ready');
  }

  function showFailure(error) {
    document.body.classList.add('flipgame-boot-failed');
    var status = document.getElementById('flipgame-boot-status');
    if (!status) {
      status = document.createElement('div');
      status.id = 'flipgame-boot-status';
      status.setAttribute('role', 'alert');
      document.body.appendChild(status);
    }
    status.textContent = '';
    var title = document.createElement('strong');
    title.textContent = 'Flipgame v1.13 update paused';
    var message = document.createElement('p');
    message.textContent = 'Reconnect to the internet, then retry. Your local game data is safe.';
    var retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Retry update';
    retry.addEventListener('click', function () { location.reload(); });
    status.appendChild(title);
    status.appendChild(message);
    status.appendChild(retry);
    try { console.error(error); } catch (_) {}
  }

  window.addEventListener('error', function (event) {
    if (!document.body.classList.contains('flipgame-boot-ready')) {
      bootFailure = event.error || new Error(event.message || 'A v1.13 runtime script could not execute.');
      showFailure(bootFailure);
    }
  });
  window.__FLIPGAME_BOOT_PROMISE__ = start().then(function () { return true; }, function (error) {
    showFailure(error);
    return false;
  });
})();
