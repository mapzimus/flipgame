#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8');

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
  const oldBareAsset = response('v101 bare fallback');
  const freshAsset = response('v102 network');

  const online = await dispatchAssetFetch({ fallback: oldBareAsset, network: freshAsset });
  assert.equal(online.response, freshAsset,
    'a versioned cache miss must use the network instead of the old bare asset');
  assert.equal(online.writes.length, 1, 'the fresh version must be cached');

  const offline = await dispatchAssetFetch({ fallback: oldBareAsset, offline: true });
  assert.equal(offline.response, oldBareAsset,
    'the bare precache must remain available when the device is offline');

  const exactAsset = response('exact version');
  const cached = await dispatchAssetFetch({ exact: exactAsset, fallback: oldBareAsset, network: freshAsset });
  assert.equal(cached.response, exactAsset, 'an exact version hit remains immediately cacheable');

  console.log('Service-worker cache tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
