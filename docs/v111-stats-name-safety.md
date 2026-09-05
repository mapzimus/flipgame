# v111 local statistics and name safety

This document describes the Wave 5 implementation of the revision 5 data and
safety contract. Both modules are dependency-free browser globals with CommonJS
exports. They make no network requests and contain no telemetry path.

## Loader order

Load these scripts after the architecture seams and before UI consumers:

1. `js/v111-interfaces.js`
2. `js/v111-runtime.js`
3. `js/v111-name-policy.js`
4. `js/v111-stats.js`

The modules install themselves into the existing runtime objects. They do not
replace `FlipgameV111Runtime.namePolicy` or `FlipgameV111Runtime.stats`.

## NamePolicyV1

`FlipgameV111NamePolicy` exposes:

- `validate(input)` -> `{ valid, ok, value, error, code }`
- `normalize(input)` and `graphemes(input)`
- `screen(input)` for a deterministic local moderation decision
- `safeDisplay(input, fallback)` for old or imported names
- `truncate(input, graphemeCount)`
- `install(runtime)`

Validation applies NFKC, removes control and bidirectional formatting
characters, collapses whitespace, accepts Unicode letters/marks/numbers and the
safe punctuation space, period, underscore, hyphen, apostrophe, and curly
apostrophe, and limits ordinary names to 14 grapheme clusters. Screening uses separate
whole-word and high-risk compact rules. Compact screening folds common
lookalike scripts, accents, leetspeak, repeated letters, and separators.

Rejected renames return only `Choose a different name.` as the user-facing
error. `safeDisplay` replaces an invalid legacy/imported value with a neutral
fallback instead of redisplaying it. Exact `Mr. Howe`, the canonical event
catalog QA labels, and the legacy roster QA labels are allowlisted. Allowlisting
is exact and occurs only after control removal, NFKC, and character validation.

## FlipgameStatsModuleV1

`FlipgameV111Stats` exposes pure normalization, filtering, aggregation,
dataset, and export functions, together with storage constructors:

- `normalizeFlipRecord(input, context)` -> `FlipRecordV1`
- `normalizeMatchRecord(input, context)` -> `MatchRecordV1`
- `normalizeFilters(filters)`
- `aggregateRecords(flips, options)`
- `aggregateSummary(data, filters)`
- `buildDatasets(data, filters)`
- `exportDocument(data, options)`, `exportJSON(data, options)`, and
  `parseImportJSON(input)`
- `exportCSV(data, type, options)`
- `createIndexedDBBackend(indexedDB, options)`
- `createMemoryBackend(seed, options)`
- `createStore(options)` and `install(runtime, options)`

The module publishes frozen `FLIP_RECORD_FIELDS`, `MATCH_RECORD_FIELDS`, and
`FILTER_FIELDS` arrays so consumers can feature-detect the exact contract.

`FlipRecordV1` carries release/version identity; date, session, device, match,
heat, round, turn, player-count, seat, and player identity; human/CPU, online,
practice, forced, and Test Data state; object, variant, cosmetic, arena, and
viewport context; result, pose, reason, power, direction, rotations, contacts,
bounces, banks, and flight/contact/settle durations; odds-profile, event, and
trajectory seeds; explicit before/after stake, lives, streak, ON FIRE, and
sudden-death state; applied reward/effect data; and coarse performance buckets.
`stake` and `streak` remain compatibility aliases for their after values.

`MatchRecordV1` carries release/version identity, start/end/duration, starting
settings, participant summaries, player/team winner summaries, heat and round
summaries, total flips, observed event counts, and completion reason. Both
normalizers accept canonical records directly, `payload.record`, and for match
outcomes `payload.match.record`. Unknown forward-compatible fields are retained.

`createStore` returns a `StatsStore` with:

- `recordFlip`, `recordMatch`, and `onOutcome`
- `flush`, `query`, `summary`, and `datasets`
- `exportJSON`, `importJSON`, and `exportCSV`
- `usingFallback`, `getErrors`, and `close`

Writes are serialized on a promise queue and never run durable-storage work in
the gameplay call stack. UUID derivation is deterministic and never reads or
advances a random source. The IndexedDB database contains `flips`, `matches`,
`rollups`, `meta`, and UUID-only `seen` stores in one versioned database.
Pruning and the rollup puts which precede it share one read/write transaction.
The UUID ledger keeps deduplication stable after raw detail is pruned. The newest 100,000
flips remain raw by default. Older flips are grouped into permanent
`FlipAggregateV1` cells that retain the dimensions required by supported
filters and charts.

If IndexedDB cannot open or a write transaction fails, the store switches to a
memory backend and saves aggregate-only recovery data in local storage. This
fallback intentionally does not put raw player history into local storage.
Existing `flipgame.records.v2`/`v1` totals migrate once into a legacy aggregate;
the existing records remain untouched.

Supported filters include date/time range; mode; seat/player; human/CPU;
object, variant, cosmetic, arena, and observed event; player count and viewport;
session/device/team/result/online; and one or more of `all`, `device`, `session`,
or `import` scope. `testData`, forced, and simulated records are excluded unless
`includeTestData: true` is explicit.

Pure datasets cover cumulative make rate, raw sequence strip, power/direction
heatmap, rotation/landing distributions, lives/stake distributions and
timelines, streak distribution/timeline, observed event frequency and success,
object comparison, and Cup/Team timelines. The event dataset is built only
from observed event IDs. It has no event catalog dependency, theoretical odds,
denominators, or undiscovered names.

## Export behavior

`.flipstats.json` uses `FlipStatsExportV1`. Public record fields, including
unknown forward-compatible fields, survive export/import/export. Flip, match,
and aggregate UUIDs deduplicate repeated imports. Import provenance is stored as
internal metadata and omitted from JSON, so import scoping does not alter the
portable data.

CSV types are `flip`, `match`, `player`, and `event`. Player labels and IDs are
pseudonymized by default. Real display names require `includeNames: true`.
Every CSV cell is quoted; line breaks are removed and spreadsheet-formula
prefixes are neutralized. Event CSV contains observed events only.
