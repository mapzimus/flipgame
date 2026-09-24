# Flipgame v1.13 Maintainer Handoff

Flipgame is a static HTML5 Canvas game built with vanilla JavaScript and a
vendored Matter.js runtime. The public web build and self-contained Android APK
are produced from the same `master` commit and visibly identify themselves as
`v1.13`.

## Release locations

- Repository: <https://github.com/mapzimus/flipgame>
- Live game: <https://mapzimus.github.io/flipgame/>
- APK: the immutable `v1.13` GitHub release and moving `apk-latest` alias

## Local verification

Serve the repository root with any static server, for example:

```powershell
python -m http.server 5174
```

Then open <http://localhost:5174/>. The service worker deliberately does not
register on localhost, and the badge reads `v1.13 · DEV`.

Run all automated qualification suites with:

```powershell
Get-ChildItem scripts -Filter '*test*.js' | Sort-Object Name | ForEach-Object {
  node $_.FullName
  if ($LASTEXITCODE -ne 0) { throw "Failed: $($_.Name)" }
}
node --test tests/*.test.js
```

The `*browser*`, `*-real-tests` and broadcast-layout suites drive a real
Chromium. Set `CHROME_PATH` if Chrome/Edge isn't in a default location. Running
as root (containers) needs a wrapper that adds `--no-sandbox`.

`node scripts/v112-release-gap-qualification-tests.js` is the one-shot release
audit (23 gates). It must be fully green before a release.

## Architecture

- `js/v111-boot.js`: ordered runtime loader and service-worker release gate
- `js/game.js`: serializable Classic state/rules
- `js/physics.js`: fixed-step physics, landing lifecycle, and event bodies
- `js/v111-*.js`: v1.11 foundations (interfaces, modes, stats, names, art packs)
- `js/v112-*.js`: v1.12 sources (rules, profile, story, battle, plinko, globe…)
- `js/v112-browser-bundle.js`: **generated** private v1.12 application
  authority. Never hand-edit it. After touching any bundled source module run
  `node scripts/build-v112-browser.mjs` (CI runs `--check` via the tests).
- `js/main.js`: UI/runtime integration only
- `js/renderer.js`: world, object, cosmetic, arena, event, and HUD rendering
- `android/`: offline WebView wrapper with Storage Access Framework parity

Online multiplayer was removed in v1.12. There is no relay or peer transport.

The authoritative product and interface contracts are `docs/v111-contract.md`
and `docs/v112-contract.md`. Integration decisions are in
`docs/v112-integration-log.md`, and defects are in `docs/v112-defects.md`. Older
plans, research, audits and the Codex recovery handover live in `docs/archive/`
for history only.

## Release invariants

- Never reveal locked content, requirements, progression length, or programmed
  event probabilities in player-facing surfaces.
- Practice/Lab/forced/test play cannot award progression and is excluded from
  default statistics.
- Statistics are local-only and never affect rules, physics, or RNG.
- Object variants and cosmetics never change colliders or scoring.
- The web build and APK must come from one approved commit.
- Preserve the persistent Android release key. v1.11 established the signing
  identity used for all future in-place APK upgrades.

## Bumping the release (e.g. v1.13 → v1.14)

CI refuses to publish a commit under a version tag that already exists, so every
release after a tagged one needs a bump. Change all of these together:

- `js/v111-interfaces.js` `RELEASE_VERSION`, then rebuild the bundle
- `js/v111-boot.js` `VERSION`, `__FLIPGAME_BOOT_VERSION__`, every `?v=` query
- `index.html` boot status, version badge + aria-label, boot `?v=`
- `service-worker.js` `CACHE_NAME`
- `android/app/build.gradle` `versionCode` / `versionName`
- `.github/workflows/build-apk.yml` badging `grep`s
- The version pins in `scripts/version-tests.js`, `v111-release-tests.js`,
  `v111-boot-tests.js`, `v111-architecture-tests.js`,
  `v112-runtime-cpu-wiring-tests.js`, `verify-dual-deployment-tests.js`,
  `v112-release-gap-qualification-tests.js` and `tests/v111-ui-renderer.test.js`

## Deployment

Merge to `master` and push. Confirm both the Pages deployment and the
`Build offline APK` workflow refer to that exact SHA. Download the release APK
and verify its sidecar hash, embedded `build-metadata.json`, certificate report,
offline launch, and version badge before declaring the release complete.
