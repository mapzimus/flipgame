#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const activity = read('android/app/src/main/java/com/mapzimus/flipgame/MainActivity.java');
const manifest = read('android/app/src/main/AndroidManifest.xml');

function testStoragePermissionBoundary() {
  assert.match(manifest, /<uses-permission android:name="android\.permission\.INTERNET"\s*\/>/,
    'Online beta has the Android network permission it requires');
  assert.doesNotMatch(manifest, /READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|MANAGE_EXTERNAL_STORAGE/,
    'imports and exports must not request broad storage access');
  assert.doesNotMatch(manifest, /requestLegacyExternalStorage|preserveLegacyExternalStorage/);
}

function testFileChooserUsesSaf() {
  assert.match(activity, /new WebChromeClient\(\)/);
  assert.match(activity, /boolean onShowFileChooser\s*\(/);
  assert.match(activity, /new Intent\(Intent\.ACTION_OPEN_DOCUMENT\)/);
  assert.match(activity, /Intent\.CATEGORY_OPENABLE/);
  assert.match(activity, /Intent\.EXTRA_MIME_TYPES/);
  assert.match(activity, /FileChooserParams\.MODE_OPEN_MULTIPLE/);
  assert.match(activity, /data\.getClipData\(\)/);
  assert.match(activity, /callback\.onReceiveValue\(resultCode == RESULT_OK \? selectedUris\(data\) : null\)/,
    'canceling a picker resolves the WebView callback instead of leaving it pending');
  assert.match(activity, /\.flipstats\.json/);
  assert.match(activity, /\.flipgame-save/);
  assert.match(activity, /if \(extension\.endsWith\("\.flipgame-save"\)\) return "application\/octet-stream"/);
  assert.match(activity, /text\/csv/);
}

function testBlobDownloadUsesBoundedStagingAndSaf() {
  assert.match(activity, /setDownloadListener/);
  assert.match(activity, /onPageFinished\(WebView view, String url\)/);
  assert.match(activity, /__flipgameNativeBlobs/,
    'blob objects remain available even when the web exporter revokes its URL immediately');
  assert.match(activity, /__flipgameNativeDownloadNames/,
    'the HTML download filename is retained for the Android save picker');
  assert.match(activity, /web\.evaluateJavascript\(script, null\)/);
  assert.match(activity, /await fetch\(/);
  assert.match(activity, /FileReader\(\)/);
  assert.match(activity, /v\.slice\(o,Math\.min/,
    'the page sends bounded slices rather than one giant base64 payload');
  assert.match(activity, /MAX_EXPORT_CHUNK_BASE64/);
  assert.match(activity, /MAX_EXPORT_BYTES/);
  assert.match(activity, /Base64\.decode\(encoded, Base64\.DEFAULT\)/);
  assert.match(activity, /receivedBytes != expectedBytes/,
    'a partial or reordered export is rejected before the save picker');
  assert.match(activity, /File\.createTempFile\("flipgame-", "\.part", directory\)/,
    'untrusted names are never used as cache paths');
  assert.match(activity, /new Intent\(Intent\.ACTION_CREATE_DOCUMENT\)/);
  assert.match(activity, /getContentResolver\(\)\.openOutputStream\(destination, "w"\)/);
  assert.match(activity, /new Thread\(\(\) -> copyExport/,
    'large content URI writes do not block the WebView UI thread');
  assert.doesNotMatch(activity, /Environment\.getExternalStorageDirectory|DownloadManager/);
}

function testLifecycleAndOfflineBoundaries() {
  assert.match(activity, /web\.loadUrl\(ASSET_ORIGIN \+ "index\.html"\)/,
    'APK launch remains bundled and offline');
  assert.match(activity, /ws\.setAllowUniversalAccessFromFileURLs\(false\)/);
  assert.match(activity, /request\.isForMainFrame\(\) && !url\.startsWith\(ASSET_ORIGIN\)/,
    'external top-level navigation stays blocked');
  assert.match(activity, /protected void onPause\(\)/);
  assert.match(activity, /protected void onResume\(\)/);
  assert.match(activity, /cancelFileChooser\(\)/);
  assert.match(activity, /exportTransfers\.clear\(\)/);
  assert.match(activity, /exportQueue\.clear\(\)/);
  assert.match(activity, /purgeStaleExportCache\(\)/,
    'interrupted private-cache transfers are removed on the next launch');
  assert.match(activity, /web\.removeJavascriptInterface\(FILE_BRIDGE\)/);
}

testStoragePermissionBoundary();
testFileChooserUsesSaf();
testBlobDownloadUsesBoundedStagingAndSaf();
testLifecycleAndOfflineBoundaries();
console.log('v111 Android storage tests passed.');
