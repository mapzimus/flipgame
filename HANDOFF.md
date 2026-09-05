# Flipgame v111 Maintainer Handoff

Flipgame is a static HTML5 Canvas game built with vanilla JavaScript and a
vendored Matter.js runtime. The public web build and self-contained Android APK
are produced from the same `master` commit and visibly identify themselves as
`v111`.

## Release locations

- Repository: <https://github.com/mapzimus/flipgame>
- Live game: <https://mapzimus.github.io/flipgame/>
- APK: the immutable `v111` GitHub release and moving `apk-latest` alias

## Local verification

Serve the repository root with any static server, for example:

```powershell
python -m http.server 5174
```

Then open <http://localhost:5174/>. The service worker deliberately does not
register on localhost.

Run all automated qualification suites with:

```powershell
Get-ChildItem scripts -Filter '*test*.js' | Sort-Object Name | ForEach-Object {
  node $_.FullName
  if ($LASTEXITCODE -ne 0) { throw "Failed: $($_.Name)" }
}
node --test tests/*.test.js
```

## Architecture

- `js/game.js`: serializable Classic state/rules
- `js/physics.js`: fixed-step physics, landing lifecycle, and event bodies
- `js/v111-physics-events.js`: immutable physical event registry/metadata
- `js/v111-modes.js`: Cup, Team Clash, Arena Draft, and rematch adapters
- `js/v111-progression.js`: save migration and secret progression state
- `js/v111-stats.js`: device-local IndexedDB records, aggregates, import/export
- `js/v111-name-policy.js`: shared offline name normalization and validation
- `js/v111-network-protocol.js` and `js/net.js`: hidden Online Beta protocol
- `js/v111-art-*.js`: authored SVG/canvas object variants
- `js/v111-mirror-match.js`: persistent isolated copy queue
- `js/main.js`: UI/runtime integration only
- `js/renderer.js`: world, object, cosmetic, arena, event, and HUD rendering
- `android/`: offline WebView wrapper with Storage Access Framework parity

The authoritative product and interface contract is
`docs/v111-contract.md`. Integration decisions are in
`docs/v111-integration-log.md`; release defects are tracked in
`docs/v111-defects.md`.

## Release invariants

- Never reveal locked content, requirements, progression length, or programmed
  event probabilities in player-facing surfaces.
- Practice/Lab/forced/test play cannot award progression and is excluded from
  default statistics.
- Statistics are local-only and never affect rules, physics, or RNG.
- Object variants and cosmetics never change colliders or scoring.
- The web build and APK must come from one approved commit.
- Bump the visible badge, query-string assets, service-worker cache, Android
  version, and release metadata together.
- Preserve the persistent Android release key. v111 establishes the signing
  identity used for all future in-place APK upgrades.

## Deployment

After all gates pass, fast-forward `master` to the approved integration commit
and push. Confirm both the Pages deployment and `Build offline APK` workflow
refer to that exact SHA. Download the release APK and verify its sidecar hash,
embedded `build-metadata.json`, certificate report, offline launch, and version
badge before declaring the release complete.
