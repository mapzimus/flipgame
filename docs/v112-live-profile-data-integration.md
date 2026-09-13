# Live profile and local data integration

Bounded production slice based on `ce97bdf`. No UI, renderer, physics, Story/Battle engine, boot, service worker, or release identity files changed.

## Integrator-owned boot seam

Keep the existing `v111-stats.js` load before `v112-browser-bundle.js`. Add exactly one browser script entry:

```js
'js/v112-browser-bundle.js'
```

Load it before `main.js`; await `FlipgameV112.ready` before main initializes profile-dependent views. Read `snapshot().writer` rather than treating readiness as write permission: readiness also resolves for a queued or unavailable Web Locks writer, so a second tab is not left on an endless loading screen. The existing runtime owns the single durable profile writer and publishes subsequent lock changes.

Do not separately load `v112-data.js` or the private profile/economy modules. The reproducible bundle lexically includes them and exposes only `FlipgameV112`. Its data adapter captures the existing Stats module/default store as diagnostics; it does not create another IndexedDB/cache writer. A missing or stale Stats module produces a non-blocking statistics warning, not a replacement rules authority.

Rebuild after any bundled-source edit:

```text
node scripts/build-v112-browser.mjs
node scripts/build-v112-browser.mjs --check
```

The integrator must include the generated bundle in offline packaging/cache inventory. This change does not alter those inventories.

## Live consumer API

- `snapshot()` / `subscribe(listener)` are the authoritative profile, writer, reveal, session, and post-match stream.
- `objects()` returns 51 roster views; `arenas()` returns 23 arena views; `store()` returns 40 cosmetic offers; `achievements()` returns 120 achievement views. Locked roster/arena/achievement views retain their opaque lock-only representation.
- `object(id)`, `arena(id)`, `variant(fullVariantId)`, and `feature(id)` query individual views.
- `isObjectAvailable`, `isArenaAvailable`, `isCosmeticAvailable`, and `isFeatureAvailable` query the same store as every picker view.
- `purchaseCosmetic(id)` uses the existing durable FC transaction path. Repeat purchases do not spend again. Legacy ownership is never repurchased or reannounced.
- `enableOwnerTesting('Howe Test Mode')` remains ephemeral. It does not change earned progression, and its sessions are captured as Test Data.
- `beginSession` accepts an owned arena, optional viewport, and roster cosmetics. Variants accept palette index, flavor ID, or full canonical ID; the stored request normalizes to `object.flavor`. Renderers should resolve that canonical variant to its color/index rather than passing a string into a numeric palette API.

The existing private engine observer bridge still supports **ordinary Classic and Practice only**. Its `supported` flags remain truthful. Story request/view APIs are present, but this slice does not start Story, Battle, Cup, Team, Alien, or random-event gameplay through that bridge. These need their dedicated adapters.

For a session routed through this bridge, do not also execute legacy scoring, achievement/progression claims, or legacy statistics outcome emission. A completed Rules match is claimed once through the coordinator, then diagnostic V2 records are queued. Abandonment records a non-completed match without ordinary rewards. Stats import can never change profile ownership or rewards.

## Local V2 records

`v111-stats.js` remains the backward-compatible store module and existing IndexedDB database. V1 inputs remain V1; V2 raw records retain V2 across normalization, import/export, pruning, reload, and fallback. Future/mismatched record versions are rejected. `FLIP_RECORD_V2_FIELDS` and `MATCH_RECORD_V2_FIELDS` expose the extended field contracts without changing V1 field lists.

V2 records preserve independent `activityId`, `formatId`, and `physicsModeId`; Story chapter/rival, Battle format/lane, and launch-lease identifiers; Story/Battle summary objects; and existing landing/lifecycle/player/result fields. V2 records are offline. Historical Giraffe/Tall Buildings IDs remain historical while current Gyroscope/Metronome IDs and all 23 arenas/40 cosmetics remain filterable.

Retention supports 16 seats and participants. Activity, format, physics mode, Story chapter/rival, and Battle format have bounded categorical retention dimensions, with new filters `activityIds`, `formatIds`, `physicsModeIds`, `storyChapterIds`, `rivalIds`, and `battleFormatIds`. No unbounded identifiers were added to rollup keys. Existing rollup cell and lineage limits remain in force.

`FlipgameV112.statistics` exposes `query`, `datasets`, `summary`, `exportJSON`, `exportCSV`, `importJSON`, `warning`, and `flush`. It does not expose a record/outcome writer. A query waits for already queued private diagnostic records; gameplay does not wait for those writes. Existing name sanitization, pseudonymous CSV defaults, UUID deduplication, import provenance, and default Test Data exclusion are retained.

CSV types now include `story` (Story and Rival Board matches) and `battle` (Battle matches), in addition to `flip`, `match`, `player`, and `event`. JSON uses the existing lossless archive envelope containing versioned raw records. Programmed probabilities are not added to exports.

The physics observer may supply `power`, `direction`, `rotations`, `contacts`, `bounces`, `banks`, `eventSeed`, `trajectorySeed`, and `oddsProfile` for diagnostics. The bridge records immutable launch time separately from its latest sample time, first-contact time, settled result, lives/stake/streak/ON FIRE/sudden-death transitions, and the Rules-owned effect. Missing measurements remain unavailable rather than invented.

## Executed qualification

All passed:

- New `v112-live-profile-data-tests.js`: canonical content queries; V4 legacy migration without relocking; replacement aliases; grandfathered features; FC Store purchase/repeat/reload; validation; private Rules outcomes; Test Data isolation; V2 records and UUID import dedup; all current/historical object, arena, and Store rollup IDs; 16-player retention; activity/chapter filters; Story/Battle CSV; asynchronous storage failure isolation.
- New `v112-live-data-browser-tests.js`: real Chromium native Web Locks and IndexedDB, shared legacy/new statistics writer, immediate-after-resolve query, actual reload, V2 persistence, purchased cosmetic persistence, and native-store import deduplication.
- Existing `v112-browser-composition-tests.js` and `v112-browser-composition-real-tests.js` (native Chromium + Matter simulation).
- Existing `v112-profile-tests.js` (21 groups), `v112-progression-runtime-tests.js` (31 groups), `v112-profile-backup-integrity-tests.js` (2 groups), `v112-achievement-tests.js` (11 groups).
- Existing `v111-stats-name-tests.js`, `v111-data-corrective-tests.js`, `v111-data-qa2-tests.js`, `v111-final-data-safety-tests.js`.
- Reproducible bundle check and `git diff --check`.

Browser test runners require an installed Chromium selected with `CHROME_PATH`. They create isolated temporary browser profiles, never use a personal browser profile, and leave those profiles available for failure diagnostics.

This is not a release approval or a claim that the production main menu/mode adapters have been connected. The integrator owns that connection and must rerun full merged-candidate gates afterward.
