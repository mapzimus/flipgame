const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');

function runtimeDigest(files, bytes) {
  const hash = crypto.createHash('sha256');
  for (const relative of files) {
    hash.update(relative, 'utf8');
    hash.update('\0');
    hash.update(bytes.get(relative));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

(async () => {
  const { verifyDualDeployment } = await import('./verify-dual-deployment.mjs');
  const sha = 'a'.repeat(40);
  const runtimeFiles = [
    'css/style.css', 'icons/icon.svg', 'index.html', 'js/app.js',
    'manifest.json', 'service-worker.js',
  ];
  const canonical = new Map([
    ['css/style.css', Buffer.from('body{color:#fff}')],
    ['icons/icon.svg', Buffer.from('<svg/>')],
    ['index.html', Buffer.from('<div id="version-badge">v1.12</div>')],
    ['js/app.js', Buffer.from('window.ready=true;')],
    ['manifest.json', Buffer.from('{"start_url":"./"}')],
    ['service-worker.js', Buffer.from("const CACHE_NAME='flipgame-v1-12';")],
  ]);
  const metadata = {
    schema: 'MapzimusVendorSnapshotV1', snapshotVersion: 1,
    upstream: { repository: 'mapzimus/flipgame', sourceSha: sha, releaseVersion: 'v1.12' },
    runtimeFiles, contentSha256: runtimeDigest(runtimeFiles, canonical),
  };
  let corruptSecondOrigin = false;
  let injectBeaconSecondOrigin = false;
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const segments = url.pathname.split('/').filter(Boolean);
    const origin = segments.shift();
    const relative = segments.join('/');
    if (origin !== 'a' && origin !== 'b') {
      response.writeHead(404).end(); return;
    }
    if (!relative) {
      if (origin === 'b' && injectBeaconSecondOrigin) {
        response.end(Buffer.from('<div id="version-badge">v1.12</div><script src="https://static.cloudflareinsights.com/beacon.min.js"></script>'));
        return;
      }
      response.end(canonical.get('index.html')); return;
    }
    if (relative === 'index.html') {
      response.writeHead(308, { location: `/${origin}/` }).end(); return;
    }
    if (relative === 'release-provenance.json') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(metadata)); return;
    }
    if (!canonical.has(relative)) { response.writeHead(404).end(); return; }
    if (origin === 'b' && corruptSecondOrigin && relative === 'js/app.js') {
      response.end('window.ready=false;'); return;
    }
    response.end(canonical.get(relative));
  });
  const port = await listen(server);
  const origins = [new URL(`http://127.0.0.1:${port}/a/`), new URL(`http://127.0.0.1:${port}/b/`)];
  try {
    const snapshots = await verifyDualDeployment({ sha, origins, retries: 1, retryMs: 0 });
    assert.equal(snapshots.length, 2);
    assert.equal(snapshots[0].actualDigest, metadata.contentSha256);
    injectBeaconSecondOrigin = true;
    await assert.rejects(
      verifyDualDeployment({ sha, origins, retries: 1, retryMs: 0 }),
      /runtime digest mismatch/,
    );
    injectBeaconSecondOrigin = false;
    corruptSecondOrigin = true;
    await assert.rejects(
      verifyDualDeployment({ sha, origins, retries: 1, retryMs: 0 }),
      /runtime digest mismatch/,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  console.log('Dual-origin byte reconciliation tests passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
