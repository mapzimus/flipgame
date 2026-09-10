# v1.12 release-gap audit — 10 September 2026

## Decision

**Not release ready.** This independent, tests/docs-only audit used integration
commit `c831ece`. It does not modify the authoritative contract or close the
integrator's existing defects. Subsequent Plinko work is outside this snapshot.

The largest gap is **tested modules versus the actual player-facing runtime**.
The repository contains substantial working Story, Battle, economy, progression,
achievement and training modules. The normal `index.html` boot path does not run
the private v1.12 application: it still loads legacy `game.js`, progression,
achievements and `main.js`. Even when independently instantiated, the private
facade currently accepts only Normal Classic and ordinary Practice.

The new acceptance suite reports **5 passing / 18 failing checks**. Those are
check counts, not 18 unique defects or a completion percentage. One failure is
the intentionally deferred release identity gate. Run it alone to see its
nonzero exit status:

```text
node scripts/v112-release-gap-qualification-tests.js
```

The test prints the actual tested HEAD and classifies module, live integration,
content, data, safety, packaging and release-gate evidence separately. Its
metadata-only Skin probe does not claim image decoding or artwork approval.

## Executable gaps and triage

Local audit IDs below are proposed triage references, not replacements for
integrator-owned `V112-*` IDs. Existing authority/UI/art defects should be linked
or updated rather than duplicated.

| Audit ID | Priority / owner | Exact evidence at this commit |
|---|---|---|
| RG-01 | P1 — Integration / main | Evaluate boot `SCRIPT_URLS`: `v112-browser-bundle.js` is absent. `main.js` has no `FlipgameV112.beginSession` or `.attachPhysics` call. Live end-game still calls `Records.recordWin`; selection reads V111 progression. New FXP/FC, Store, authoritative receipts and post-match resolution do not become live merely because their isolated tests pass. |
| RG-02 | P1 — Mode adapters | Instantiate generated bundle with a fresh profile and call `beginSession({formatId:'cup',roster:[{name:'One'},{name:'Two'}]})`: throws `This browser bridge currently supports Classic and ordinary Practice`. Team Clash has the same guard. Owner-testing Alien/Insane requests are rejected by that guard too. Legacy Cup/Team/Alien can exist separately; this finding is about the required single v1.12 authority path. |
| RG-03 | P1 — Story / Training / UI | Public `supported.activities` contains only `free-play,practice`. Story exposes hub data/request creation but no playable session start. No Story, Rival, or Tutorial route is present in `index.html`; main never connects their runners. Required first-clear/checkpoint/co-op flows cannot be accepted through the current UI. |
| RG-04 | P1 — Battle / lane adapters / UI | Public `supported.formats` is only `classic`; Battle has no UI route. The simultaneous runtime and multipointer modules are not in the normal boot graph. Their abstract adapter tests cannot establish real two/four-touch hardware fairness, independent physical worlds or frame budgets. |
| RG-05 | P2 — Roster UI | `main.js` add-player guard still returns at `playerCount >= 8`; saved setup uses `s.rows.slice(0,8)`. Classic 9–16 and larger Team rosters are inaccessible/truncated at this boundary. |
| RG-06 | P1 — Art integration | Load the same art packs/Cast/Skins used by boot, then call `Skins.hasDraw(id)` for every canonical object. `mechanical-metronome` and `desk-gyroscope` return false. Their V2 calibration art exists but is not connected to the shipped Skin registry. |
| RG-07 | P2 — Progression / Arena UI | `availableArenaChoices()` calls V111 cosmetic views. That catalog has ten collectible arenas, giving **11 including Baseline**, not 23. The new preview module independently contains all 23; preview availability is not selection/unlock reachability. |
| RG-08 | P2 — Achievements / UI | Live gallery calls `Achievements.list()` from boot's legacy `achievements.js`; `Achievements.total()` returns **100**, while private V112 catalog returns 120. Battle/Story/Store additions and their rewards require the new authoritative evaluator and view path. |
| RG-09 | P1 — Stats / activity adapters | Feed a `FlipRecordV2` with `activityId:'story'`, `formatId:'classic'`, `storyChapterId:'first-broadcast'` into the live normalizer. Output is `FlipRecordV1`, with the new activity/chapter fields absent. There is no V2 path for authoritative Story/Battle context yet. This probe is not a claim that current UI already emits V2 records. |
| RG-10 | P2 — Stats Lab | `Stats.exportCSV({flips:[],matches:[],rollups:[]},'story')` and `'battle'` both throw `CSV type must be flip, match, player, or event`. Stats mode options omit Battle and player-count options stop at eight. Required Story/Battle views and exports remain implementation work. |
| RG-11 | P1 — Release packaging | Workflow APK copy lists `index.html css js icons manifest.json`; Pages copy lists `index.html service-worker.js manifest.json css js icons`. Both omit `data/`, including `data/v112-globe/natural-earth-land-110m.geojson`. The worker precaches that exact geography and uses atomic `Promise.all(cache.add(...))`: the declared Pages artifact would fail fresh worker installation because this asset is absent. APK loses the bundled geography needed by the real Globe surface. |
| RG-12 | P1 — PWA / Release | Compare actual boot dependencies with actual precache entries. Missing: `v112-cpu.js`, `v112-variant-names.js`, `v112-arena-preview.js`, `v112-easter-eggs.js`, `v112-easter-presentation.js`, and `css/v112-broadcast.css`. A worker-only fresh precache is not a complete offline boot. A prior online session may opportunistically cache these; that does not satisfy fresh/offline qualification. |
| RG-13 | Deferred release gate — Integrator | Interfaces/boot/SW remain v1.11 and Android remains `versionName 1.11`, `versionCode 111`. This is consistent with withholding a release, not a request to bump early. Approved candidate must atomically change identity/provenance/cache/APK metadata and pass both-origin checks. |

## What is genuinely implemented and tested

- Canonical catalog counts are correct: 51 Flippers, 612 variants, 23 arenas,
  40 Store cosmetics and 120 achievements. FXP thresholds are 1,590 at FL50 and
  3,705 at FL100.
- Fresh private progression exposes Bottle only. Exact `Howe Test Mode`
  temporarily exposes all 51 without changing the underlying profile.
- All 51 galleries resolve twelve distinct, NamePolicy-safe names against the
  actual Skin naming API. This does not imply all artwork is approved or that
  the two missing draw paths are acceptable.
- Offline NamePolicy checks preserve safe accented names/QA names, remove bidi
  controls and reject tested markup/evasions. Existing detailed safety suites
  pass. No blanket claim of catching every inappropriate name is made.
- Online transport files are removed and no Online route/transport is present
  in the actual boot graph. Historical record fields can remain inert.
- Existing local stats have 100,000-raw-flip retention and tested rollup,
  name-safety and import/export behavior for their existing V1 schema.
- Existing workflow has protected source/provenance checks, signed APK steps,
  Lab synchronization, GitHub Pages deployment and dual-origin verification.
  Those useful foundations do not repair the missing packaged assets or prove
  a signed v1.12 artifact has been built.

Successful isolated/regression commands in this pass:

```text
v112-story-tests                     v112-story-runtime-tests
v112-battle-tests                    v112-battle-runtime-tests
v112-battle-outcome-tests            v112-activity-tests
v112-profile-tests                  v112-progression-runtime-tests
v112-profile-backup-integrity-tests  v112-achievement-tests
v112-art-tests                      v112-variant-names-tests
v112-arena-preview-tests            v112-browser-composition-tests
v112-offline-removal-tests           v112-platform-regression-tests
v111-stats-name-tests                v111-final-data-safety-tests
service-worker-tests                v112-training-tests
v112-tutorial-tests
```

Each name above is `node scripts/{name}.js`. Also passed:
`node scripts/build-v112-browser.mjs --check` (25-source composition matches).
Existing service-worker/platform suites pass their narrower checks despite
RG-11/RG-12; the new closure tests cover those previously unasserted boundaries.

## Next three highest-risk implementation slices after Plinko

### 1. One playable authority + progression/economy/data end-to-end slice

First connect actual launch/landing to private Rules → Activity → Profile and
the live HUD/post-match view, removing parallel legacy scoring/reward writes for
those sessions. Start with real Normal Classic, then complete Cup/Team and
event/Alien/Insane adapters. Connect setup to the same profile, Store purchases,
reveals, 120-achievement evaluation and V2 stats from committed outcomes.

Acceptance: fresh save completes a real match, loss also earns eligible FXP,
levels grant immediately selectable content, Store spend survives reload,
retry cannot duplicate FXP/FC, imported/forced/owner sessions earn nothing, and
one browser tab/device writer owns every mutation. Include the already-open
Android writer gate (V112-098) and receipt-capacity limit (V112-096); do not
mistake current fail-closed capacity behavior for unlimited lifetime support.

### 2. Real Battle lanes, touch capability and fairness vertical slice

Implement lane-local Matter/body/render/audio/event adapters beneath the tested
Battle runtime, connect the actual input surface and route, and test two real
simultaneous contacts before expanding to four. Complete Volley and Rush,
power cards and rotating-team relays with actual pre-horn flights.

Acceptance: physical pointer streams cannot steal another lane; no cross-lane
camera/audio or state mutation; outgoing flights do not consume the incoming
side's relay clock; heat/series rewards finalize once through slice 1. The real
smartboard contact gate and 45 FPS heavy four-lane target cannot be certified
with VM/mocked-pointer tests and remain explicit device work.

### 3. Playable Story/Rival campaign and training onboarding

Connect Story's prescribed requests to the same real match runner, with hub,
rival board, broadcast cards, checkpoints, co-op targeting and signature
encounters. Add the skippable Tour and FL50 Lab authorization through the
Training module, rather than leaving their tested modules unused.

Acceptance: finish a fresh-save chapter and an act in solo/co-op; Board and
Story share exactly one grant; abandon/replay/reload do not duplicate rewards;
early Alien victory banks correctly; FL100 without victory remains gated;
Tutorial/Lab remain Test Data. Then run the entire campaign in real browser.

## Parallel release blockers and limits of this audit

- Artwork approval remains an explicit owner gate: rejected quality is not
  resolved by catalog counts. Review the seven calibration families before
  bulk art, wire both replacement objects, and qualify all 612 authored variants
  including secondary motion/reactions. Original Bottle/no-face and protected
  T-Rex must remain unchanged.
- Fix arena/achievement catalog consumers while wiring progression; a gallery
  should not have its own independent unlock truth.
- Repair package/precache asset closure now, but leave version bumps, signing,
  deployment and approval to the integrator. Do not push this development tree
  as v1.11: the workflow deliberately rejects reuse of its public release tag.
- No signed APK/device launch, real smartboard contacts, six-viewport browser
  screenshots, frame-time benchmarks, live-site deployment or external telemetry
  inspection was performed here. These are unqualified gates, not invented
  passing results.
- Status dashboard notes can lag implementation (for example Online removal
  and Easter/Globe wiring). This report uses executable source at its named
  commit, not those narrative labels, to distinguish implementation from gaps.

Recommendation: keep agent tasks bounded around these three live vertical
slices and their exclusive file interfaces. Do not spend the next wave adding
more disconnected catalogs before the already-tested systems can be played.
