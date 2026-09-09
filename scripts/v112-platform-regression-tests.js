'use strict';

// Active local-platform coverage extracted from the retired mixed network suite.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const Platform = require('../js/v111-platform.js');

async function testWakeLockLifecycle() {
  const visibilityListeners = [];
  const nativeStates = [];
  let requests = 0;
  let releases = 0;
  let currentSentinel;
  const documentRef = {
    visibilityState: 'visible',
    fullscreenElement: null,
    documentElement: { requestFullscreen: async () => {} },
    addEventListener(type, listener) { if (type === 'visibilitychange') visibilityListeners.push(listener); },
  };
  const navigatorRef = {
    wakeLock: {
      async request(type) {
        assert.equal(type, 'screen');
        requests++;
        const listeners = [];
        currentSentinel = {
          released: false,
          addEventListener(type, listener) { if (type === 'release') listeners.push(listener); },
          async release() {
            if (this.released) return;
            this.released = true;
            releases++;
            listeners.splice(0).forEach((listener) => listener());
          },
        };
        return currentSentinel;
      },
    },
  };
  const lifecycle = new Platform.constructors.WakeLockLifecycle({
    document: documentRef,
    navigator: navigatorRef,
    androidBridge: { setMatchActive(active) { nativeStates.push(active); } },
  });
  await Promise.all([lifecycle.enterMatch({ fullscreen: true }), lifecycle.enterMatch({ fullscreen: true })]);
  assert.equal(requests, 1, 'concurrent starts acquire one wake lock');
  assert.deepEqual(nativeStates, [true]);
  assert.equal(lifecycle.snapshot().lockHeld, true);

  await currentSentinel.release(); // browser auto-release while hidden
  documentRef.visibilityState = 'visible';
  visibilityListeners.forEach((listener) => listener());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests, 2, 'visibility restores a released active-match lock');

  await lifecycle.leaveMatch();
  assert.deepEqual(nativeStates, [true, false]);
  assert.equal(releases, 2);
  visibilityListeners.forEach((listener) => listener());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests, 2, 'menu visibility never restores an inactive match');
  assert.equal(lifecycle.snapshot().matchActive, false);
}

function testOfflineAndroidAndArtifactMetadata() {
  const workflow = read('.github/workflows/build-apk.yml');
  assert.match(workflow, /cp -r index\.html css js icons manifest\.json android\/app\/src\/main\/assets\//,
    'the whole js directory is bundled, including new v111 modules');
  assert.match(workflow, /git rev-parse HEAD/);
  assert.match(workflow, /test "\$source_commit" = "\$GITHUB_SHA"/);
  assert.match(workflow, /assets\/build-metadata\.json/);
  assert.match(workflow, /unzip -p flipgame-offline\.apk assets\/build-metadata\.json/);
  assert.match(workflow, /sha256sum flipgame-offline\.apk/);

  const activity = read('android/app/src/main/java/com/mapzimus/flipgame/MainActivity.java');
  assert.match(activity, /addJavascriptInterface\(new PlatformBridge\(\), "FlipgamePlatform"\)/);
  assert.match(activity, /public void setMatchActive\(boolean active\)/);
  const onCreate = activity.slice(activity.indexOf('protected void onCreate'), activity.indexOf('private final class PlatformBridge'));
  assert.doesNotMatch(onCreate, /FLAG_KEEP_SCREEN_ON/, 'Android no longer stays awake on menus');

  const platformSource = read('js/v111-platform.js');
  assert.match(platformSource, /setMatchActive/);
  assert.match(platformSource, /match\.abandoned\.v1/);
  assert.match(platformSource, /lifecycle\.menu-entered\.v1/);
}

(async () => {
  await testWakeLockLifecycle();
  testOfflineAndroidAndArtifactMetadata();
  console.log('v1.12 local platform regression passed: wake lock, Android bridge and APK provenance.');
})().catch(error => { console.error(error); process.exitCode = 1; });
