#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8');

function loadWorker(overrides = {}) {
  const handlers = {};
  const context = vm.createContext({
    console,
    Promise,
    caches: overrides.caches || {
      open: async () => ({ add: async () => {}, match: async () => null, put: async () => {} }),
      keys: async () => [],
      delete: async () => true,
    },
    fetch: overrides.fetch || (async () => response('network')),
    self: {
      addEventListener: (type, handler) => { handlers[type] = handler; },
      skipWaiting: overrides.skipWaiting || (() => {}),
      clients: { claim: overrides.claim || (() => {}) },
    },
  });
  vm.runInContext(source, context, { filename: 'service-worker.js' });
  return handlers;
}

async function dispatchInstall(options = {}) {
  let skipped = 0;
  const added = [];
  const handlers = loadWorker({
    caches: {
      open: async () => ({
        add: async (url) => {
          added.push(url);
          if (url === options.failOn) throw new Error('simulated precache failure');
        },
      }),
      keys: async () => ['flipgame-v110'],
      delete: async () => { throw new Error('install must not delete old caches'); },
    },
    skipWaiting: () => { skipped++; },
  });
  let pending;
  handlers.install({ waitUntil: (promise) => { pending = promise; } });
  try {
    await pending;
    return { rejected: false, skipped, added };
  } catch (error) {
    return { rejected: true, skipped, added, error };
  }
}

async function dispatchAssetFetch({ exact = null, fallback = null, network = null, offline = false }) {
  const handlers = {};
  const writes = [];
  const cache = {
    match: async (_request, options) => options && options.ignoreSearch ? fallback : exact,
    put: async (request, response) => writes.push({ request, response }),
  };
  const context = vm.createContext({
    console,
    Promise,
    caches: {
      open: async () => cache,
      keys: async () => [],
      delete: async () => true,
    },
    fetch: async () => {
      if (offline) throw new Error('offline');
      return network;
    },
    self: {
      addEventListener: (type, handler) => { handlers[type] = handler; },
      skipWaiting: () => {},
      clients: { claim: () => {} },
    },
  });
  vm.runInContext(source, context, { filename: 'service-worker.js' });

  let responsePromise;
  handlers.fetch({
    request: {
      method: 'GET',
      mode: 'cors',
      headers: { get: () => 'application/javascript' },
    },
    respondWith: (promise) => { responsePromise = promise; },
  });
  return { response: await responsePromise, writes };
}

function response(label) {
  return { label, status: 200, clone() { return this; } };
}

async function main() {
  const completeInstall = await dispatchInstall();
  assert.equal(completeInstall.rejected, false, 'complete critical precache should install');
  assert.equal(completeInstall.skipped, 1, 'worker activates only after all critical assets cache');
  assert.ok(completeInstall.added.includes('./index.html'));
  assert.ok(completeInstall.added.includes('./js/v111-boot.js'));
  assert.ok(completeInstall.added.includes('./js/main.js'));

  const failedInstall = await dispatchInstall({ failOn: './js/main.js' });
  assert.equal(failedInstall.rejected, true, 'a missing critical asset must reject installation');
  assert.equal(failedInstall.skipped, 0, 'a partial release must not replace the active worker');

  // The v111 boot gate guarantees this fetch handler cannot run until the v111
  // worker controls the page, so its bare fallback belongs to the same release.
  const v111BareAsset = response('v111 bare fallback');
  const freshAsset = response('v111 network');

  const online = await dispatchAssetFetch({ fallback: v111BareAsset, network: freshAsset });
  assert.equal(online.response, freshAsset,
    'a versioned cache miss must use the network instead of the old bare asset');
  assert.equal(online.writes.length, 1, 'the fresh version must be cached');

  const offline = await dispatchAssetFetch({ fallback: v111BareAsset, offline: true });
  assert.equal(offline.response, v111BareAsset,
    'the same-release bare precache must remain available when the device is offline');

  const exactAsset = response('exact version');
  const cached = await dispatchAssetFetch({ exact: exactAsset, fallback: v111BareAsset, network: freshAsset });
  assert.equal(cached.response, exactAsset, 'an exact version hit remains immediately cacheable');

  console.log('Service-worker cache tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
