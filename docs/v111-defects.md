# Flipgame v111 Defect Ledger

| ID | Severity | Subsystem | Reproduction | Owner | Status | Verification |
|---|---|---|---|---|---|---|
| V111-001 | P1 | Physics/resize | Resize a valid airborne seed; world reflow changes MAKE to MISS | Physics | Fixed; QA pending | Frozen geometry and replay tests pass |
| V111-002 | P1 | Alien | Same normalized input becomes harder as viewport width increases | Physics | Fixed; QA pending | Viewport-normalized arena/ring profile tests pass |
| V111-003 | P1 | Online | Peer can send stale/unauthorized flick or result without turn identity | Network | Fixed; QA pending | V2 forged/stale/duplicate/reconnect suite passes |
| V111-004 | P2 | ON FIRE | Streak stops at 3 and ending miss can receive another penalty | Rules | Fixed; QA pending | Eight-player three-life and every preset tests pass |
| V111-005 | P2 | Plinko | Forced eliminations can retain positive displayed lives | Rules | Fixed; QA pending | All nine prizes and 2-8 player tests pass |
| V111-006 | P2 | Performance | Match start decodes all families for every selected color | Rendering | Fixed; QA pending | Selected-pair preload and bounded lazy caches implemented |
| V111-007 | P2 | Name safety | Stored player name is interpolated into Hall of Fame HTML | Name/UI | Fixed; QA pending | Shared policy and safe text-path tests pass |
| V111-008 | P3 | Sudden death | First escalation level lasts 19 turns instead of 20 | Rules | Fixed; QA pending | Exact 20-flip band test passes |
| V111-009 | P3 | Wake lock | Rematches reacquire locks and menu exit does not release | Platform | Fixed; QA pending | Single-lock lifecycle suite passes |
| V111-010 | P0 | Browser boot | Missing v111 loader modules crash `records.js` | UI | Fixed; QA pending | Load-order and DOM smoke tests pass |
| V111-011 | P1 | APK signing | Ephemeral debug key prevents upgrades | Release | Fixed; QA pending | Persistent secrets/release signing configured; legacy uninstall documented |
| V111-012 | P1 | Offline cache | Partial install deletes the last complete cache | Release | Fixed; QA pending | Atomic-failure test preserves old worker |
| V111-013 | P1 | Android files | WebView cannot import or export local save/stats files | Android | Fixed; QA pending | SAF bridge suite passes |
| V111-014 | P1 | Artwork | Retired generated PNG pack ships in APK/Pages | Art/Release | Fixed; QA pending | 120 files removed; zero-raster release assertion passes |
| V111-015 | P2 | Progression secrecy | Public roster page exposes names and win thresholds | UI/Release | Fixed; QA pending | Gallery removed; player-facing leak scan passes |
| V111-016 | P3 | Name feedback | Generic blocked-name alert persists after the player edits the field | UI | Fixed; QA pending | Input clears stale inline/assertive state; submit still revalidates |
| V111-017 | P1 | Stats retention | Near-unique flip fields create one rollup row per old flip and unbounded rewrites | Stats/Data | Fixed; QA pending | Bounded aggregate-key and prune/reload probes pass |
| V111-018 | P1 | Test eligibility | Forced-event state resets per flip, allowing later match progression/default stats | UI/Rules | Fixed; QA pending | Force then finish ordinarily remains Test Data for the whole match |
| V111-019 | P1 | Name boundaries | Saved setup, records, Stats import/normalization, and named CSV bypass NamePolicy | State/Data/Safety | Fixed; QA pending | Adversarial persistence/import/export probes pass |
| V111-020 | P1 | Online identity | Self-asserted sender fields plus recomputed checksum allow host/player spoofing | Network/Safety | Fixed; QA pending | Built-in transports and UI fail closed without authenticated identity |
| V111-021 | P1 | Event playability | Tether, Mitosis, Heart, Mirror, and Ceiling make rates collapse in fixed matrix | Physics/Events | Fixed; QA pending | Exact seeds and viewport matrix pass |
| V111-022 | P1 | Mirror physics | Overlapping mirror body changes source trajectory while copies omit it | Physics/Events | Fixed; QA pending | Source/copy trajectories match frame-for-frame |
| V111-023 | P1 | Golden Flip | Canonical event is suppressed while leftover independent 1/150 lottery remains | UI/Rules + Physics | Fixed; QA pending | Single registry-owned Golden path and frozen seeds pass |
| V111-024 | P1 | Cup Plinko | Automatic result does not resolve heat and Always Magnet resets between heats | UI/Rules | Fixed; QA pending | Automatic heat resolution and magnet persistence tests pass |
| V111-025 | P1 | Progression migration | `trophy_gold` maps to obsolete `buildings` instead of `tall-buildings` | UI/Rules | Fixed; QA pending | Legacy fixture retains Tall Buildings |
| V111-026 | P2 | Stats fallback | IndexedDB fallback loses matches on reload and exposes no warning | Stats/Data | Fixed; QA pending | Reload persistence and non-blocking warning tests pass |
| V111-027 | P2 | Online names | Rejected peer is briefly added/broadcast before rename-required | Network/Safety | Fixed; QA pending | Blocked peer never enters roster |
| V111-028 | P2 | Name evasions | Unicode lookalikes and repeated separator evasions validate | State/Data/Safety | Fixed; QA pending | Exact QA corpus and innocent-substring regressions pass |
| V111-029 | P2 | Practice forcing | Partial hardcoded map and 14-char input prevent all event test names | UI/Rules | Fixed; QA pending | All 30 allowlisted names force only in Practice |
| V111-030 | P2 | Save backup | Checksummed `.flipgame-save` serializer/importer/UI are absent | State/Data + UI | Fixed; QA pending | Round-trip, checksum, migration, no-relock, and UI tests pass |
| V111-031 | P2 | Achievements | Lab, replay, Cup lifetime, and starter-position signals are inaccurate | UI/Rules | Fixed; QA pending | Exact eligibility and persisted-state probes pass |
| V111-032 | P2 | Progression secrecy | Locked item count and threshold order are exposed in Customize | UI/Rules | Fixed; QA pending | Undiscovered catalogs expose one opaque lock only |
| V111-033 | P2 | Stats Lab | Contracted metrics/seat filter missing; Test Data reveals event names | Stats/Data + UI | Fixed; QA pending | Surface inventory, seat, and discovery-boundary tests pass |
| V111-034 | P2 | Smartboard UI | Setup controls compute to 44px instead of required 48px | UI/Renderer | Fixed; QA pending | 1280x720/8-player browser controls measure at least 48px |
| V111-035 | P2 | Setup controls | Radios and checkboxes do not change under user-style activation | UI/Renderer | Fixed; QA pending | Browser user-style activation passes |
| V111-036 | P2 | Event odds | Normal/boosted frequencies drift; later events are not 10x under Mr. Howe | Physics/Events | Fixed; QA pending | Three-million-roll exact categorical weight test passes |
| V111-037 | P2 | Alien calibration | Make rate varies drastically by viewport and is far easier than Classic | Physics/Events | Fixed; QA pending | 300-shot phone-through-4K calibration spans 61.0-66.3% vs Classic 63.0% |
| V111-038 | P2 | Mitosis reward | One landed body grants bonus instead of counting normally | UI/Rules | Fixed; QA pending | One/both landing reward tests pass |
| V111-039 | P2 | Event forcing scope | Event display names force events in ordinary Classic | UI/Rules | Fixed; QA pending | Non-Practice forcing is rejected |
| V111-040 | P2 | Stats rollup filters | Pruned flips disappear or are misclassified under categorical filters omitted from rollups | Stats/Data | Open | 500-flip one-raw fixture across every individual and combined filter required |
