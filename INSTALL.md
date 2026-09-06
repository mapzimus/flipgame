# Install Flipgame v1.11

The web game is available at <https://mapzimus.github.io/flipgame/>. It is an
offline-capable Progressive Web App with no runtime CDN dependency.

## Android smartboard APK

Download `flipgame-offline.apk` from the repository's `v1.11` release or the
`apk-latest` release. Copy it to the smartboard, allow the file manager to
install unknown apps, and open the APK. The game itself is bundled and launches
without a network connection.

The old v110 CI build used a disposable debug signing key. Android therefore
cannot install v1.11 over that particular APK. If v110 is installed, uninstall
it once and then install v1.11. Export any local save or statistics you want to
keep first. v1.11 and future official APKs use the same protected release key,
so later APKs can upgrade in place.

The APK supports local save/statistics export and import through Android's
system document picker. Web and APK data remain separate.

## PWA installation

Open the live site in Chrome or Edge and choose **Install app** or **Add to Home
Screen**. Load the game once while online; its complete release shell is then
available offline. A v1.11 service-worker update installs atomically, so a
failed download cannot replace the last complete offline version.

## Maintainer release path

Every push to `master` runs the full qualification suites, builds the signed
release APK, verifies its signature/version/source metadata, uploads an
immutable `v1.11` release, and refreshes `apk-latest`. GitHub Pages serves the
same commit from the repository root.

Release signing uses the repository Actions secrets
`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and
`ANDROID_KEY_PASSWORD`. Never commit a decoded key. The coordinator-owned key
backup must remain private and outside this repository.
