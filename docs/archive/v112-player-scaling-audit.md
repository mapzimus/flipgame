# Flipgame v1.12 Player-Scaling Audit

> Supporting audit only. `docs/v112-contract.md` is the final authority for
> supported modes, counts, progression, and release scope.

Status: read-only audit of the current non-release-candidate tree. No implementation changes were made by this specialist.

Contract revision received during the audit: Online is removed from the v1.12 build. This report therefore recommends no Online player count. Historical/imported `online` statistics remain valid inert data.

## Recommendation

Sixteen is the highest player count I recommend certifying for v1.12. The game-state and physics costs are small enough to go higher, but 24 or 32 players would make setup, turn handoff, the live HUD, results, and match duration materially worse on phones and 720p smartboards.

Use mode-specific certified limits:

| Mode | Certified count | Recommendation |
|---|---:|---|
| Classic | 2–16 | Hard maximum 16. Show a neutral “Long match” note, without blocking, for 13–16 players combined with 20 or 100 lives. |
| Short Cup | 2–12 | Best-of-three already multiplies match length; 12 is a practical classroom/party ceiling. |
| Full Cup | 2–8 | Ten-life best-of-three at 10+ players is too long for the stated high-school audience. Keep the current ceiling for this submode. |
| Team Clash | even counts 2–16 | The six-flip round stays constant and the existing teammate-offset algorithm can cover an eight-person team by round three. |
| Practice | exactly 1 | Practice is a solo trainer and should not inherit the setup roster. |
| Physics Lab | exactly 1 | Lab is a solo, non-progression test environment. |

This gives the owner a clear answer: **16 is realistic**, chiefly for Classic and Team Clash. The code can technically store and iterate many more players, but that is not the same as a shippable experience.

## Why computation is not the ceiling

- `js/game.js` stores players in ordinary arrays and performs O(n) loops only for turn traversal and opponent-wide rewards. It does not impose an eight-player maximum.
- Ordinary physics renders and simulates one active flippable. Increasing the roster does not multiply the normal Matter.js scene.
- A local Node benchmark of 10,000 cycles consisting of init, Double Flip, Life Drain, and a full turn traversal measured about 0.0023 ms per cycle at 16 players. Even 64 players remained below 0.02 ms per cycle in that synthetic rules-only test. This is not a browser/frame benchmark, but it establishes that rules-array iteration is negligible.
- The renderer preloads the selected object/variant pairs once at match start. Sixteen selected pairs and sixteen static setup preview canvases are reasonable; they are not per-frame active bodies.
- Local records and raw statistics already model arbitrary participant arrays before the retention-rollup path truncates them.

The practical constraints are human and visual: two-digit seat management, a 12-color differentiation palette, pass-screen friction, a bottom HUD that cannot show 16 cards at 1280px, and very long elimination/Cup formats.

## Existing eight-player blockers

### P0 — rules and special-event correctness

1. `js/v111-modes.js:18,65–72` freezes Team Clash counts to `[2,4,6,8]` and rejects every Cup/Team roster over eight. Classic bypasses this pure-mode assertion, but Cup and Team cannot start above eight.
2. `js/v111-mirror-match.js:96–120,220` limits player indexes to 0–7, rosters to eight, and Mirror targets to seven. A 9–16 player Classic match could start, but Mirror Match would fail to arm or restore. The bounds must become 0–15, roster maximum 16, and target maximum 15.
3. All opponent-wide effects other than Mirror already iterate the roster and are structurally scalable: Double Flip, Life Drain, Plinko win, Plinko halve, and elimination. They still need explicit 9/12/16-player tests because a mistake affects up to 15 opponents.
4. Sudden death uses a fixed Classic threshold of 70 flips and fixed escalation bands of 20 flips (`js/game.js:17–18,243–253`). At larger counts—and already at eight—those boundaries can fall mid-rotation, so later seats face a different penalty level before everyone has received the same number of turns. For any expanded roster, derive fair boundaries by rounding up to a whole starting-roster rotation:
   - Classic start: `ceil(70 / N) × N` flips.
   - Escalation band: `ceil(20 / N) × N` flips.
   - Cup start remains its explicit `rotations × N` rule, but its escalation band should also use the rounded whole-rotation size.
   - Use the starting roster size, not changing active-player count, so eliminations cannot move a previously announced boundary.

### P0 — persistence and statistics integrity

1. `js/main.js:1094` silently truncates a saved setup with `s.rows.slice(0, 8)`. This would make seats 9–16 disappear after reload. Replace it with one central roster sanitizer and never silently change a valid supported roster.
2. `js/v111-stats.js:618,623,655–666` bins seats above 7 and player counts above 8 as `other` in permanent rollups.
3. `js/v111-stats.js:1038` truncates match participants to eight when aggregating completed matches. `js/v111-stats.js:2288` repeats the same truncation while importing aggregate dimensions. At 16 players, this loses half the participant attribution during retention/import aggregation.
4. `js/main.js:3488` labels every seat above P8 as `Other`, and `index.html:118` offers only 1–8 in the Stats player-count filter.
5. Raw `FlipRecordV1` and `MatchRecordV1` normalization does not intrinsically truncate the roster, and CSV export iterates participant arrays. Preserve that good behavior. Expand supported rollup bounds to seats 0–15 and counts 1–16, and dynamically populate Stats filters from supported plus observed values.
6. Existing v1.11 `other` rollup cells cannot be losslessly split back into seats/counts, but ordinary v1.11 data never exceeded eight through the public UI. Preserve those old cells as legacy `other`; do not reinterpret them.
7. `.flipgame-save` validation sanitizes names but does not currently validate a roster count. On import/restore:
   - preserve a valid 2–16 setup;
   - never delete extra seats merely because the currently selected format has a smaller cap;
   - block Start with a specific format/count message until the user changes the format or removes seats;
   - reject or explicitly stage a setup over 16 rather than silently slicing it;
   - keep historical statistics with counts over 16 importable as archive data, even though they cannot become a playable setup.

### P1 — setup and customization UI

1. `js/main.js:518–546` disables Add Player at eight and hard-codes the “Up to 8 players”/“8 player maximum” copy. The limit must come from one policy module, not repeated literals.
2. At 1280px+, `css/style.css:251` fixes the setup roster to two columns and four rows inside an overflow-hidden player panel. A ninth row is clipped; 12 or 16 cannot work by only changing the JavaScript limit.
3. The current full player card is too wide/dense for a 4×4 grid in the seven-column setup panel. The v1.12 menu redesign should use compact roster cards—preview, P-number, name, Human/CPU, and a single Customize/Edit action—with the detailed controls in the wide customization modal.
4. Recommended roster layouts:
   - 1280×720 and wider: 4×4 compact grid for 13–16, 4×3 for 9–12, and 2×4 for 2–8.
   - 768–1099px: two columns with explicit pages of four or eight seats; no nested horizontal scroll.
   - below 768px: one-column roster with four-seat pages or collapsible summaries. Do not make a phone user scroll past sixteen fully expanded editors.
5. The player customization Previous/Next logic is array-based and should scale, but must expose “P13 of 16” and retain unsaved draft state across every seat. Verify keyboard focus after paging.
6. There are only 12 flavor colors. Seats 13–16 can therefore duplicate a selected color/variant on a first-run device. Seat number, name, shape/pattern, and team mark must remain visible; color can never be the sole identifier. Fresh default names must also avoid repeating the first twelve flavor names verbatim—append a short seat-aware suffix or use a separate safe default-name pool.

### P1 — in-game HUD and handoff

1. `#player-list` is one horizontally scrolling row of cards (`css/style.css:191–194`). Sixteen minimum-width cards require roughly 1,650px before safe-area padding, so they do not all fit at 1280×720, 1366×768, tablets, or phones. `updateHUD()` replaces its contents but does not focus/scroll the active card into view.
2. Replace the all-player bottom strip at 9+ players with a focus HUD that always shows:
   - Current (large),
   - On Deck,
   - After That,
   - active/total count and a roster drawer/button.
   A smartboard-only compact 4×4 overview may be shown in the drawer, not over the play area.
3. The pass gate runs before every human turn whenever more than two players remain. At 16 this is useful protection against accidental touches, but it adds significant dead time. Keep one required tap, show Current/On Deck/After That on the handoff card, and avoid a second confirmation.
4. CPU turns bypass the pass gate and run at 4×; all-CPU finishes run at 25×. These paths are structurally scalable but need mixed 16-seat human/CPU tests to ensure a CPU is never presented as a physical pass target.
5. Cup’s current series string joins one value per player with separators. A 12-seat Cup requires responsive markers or a compact leaderboard; a single line will overflow.

### P1 — results and rematches

1. Game Over maps every player twice: scoreboard and per-game statistics. Sixteen rows fit only if the desktop layout remains two columns and uses compact rows. The current `overflow: hidden` desktop main area must not clip the last rows at 1280×720.
2. On mobile, make results one scrollable document (not nested scrolling regions), with a sticky rematch action and collapsible per-player detail.
3. Rotate, Shuffle, Same Setup, and Team Swap operate on arrays and can scale. The proposed setup preview is currently one long `<ol>`; use the same compact/paged roster component as Setup.
4. Rematches must preserve all 9–16 stable player IDs, object variants, cosmetics, Human/CPU flags, teams, and seat order. No path may regenerate IDs merely because the UI page is not mounted.

### P2 — tests and product text

1. `tests/v111-rules-modes.test.js` repeatedly qualifies only 2–8 and asserts Team counts exactly `[2,4,6,8]`.
2. `scripts/v111-mirror-match-tests.js` explicitly tests only 2–8.
3. Current responsive qualification uses two- and eight-player screenshots. It needs 12 and 16 player fixtures.
4. Eight-player achievement names may remain historical achievements rather than maxima. Preserve exact semantics for “Win an eight-player Cup/Team Clash” unless product explicitly changes them. The existing general “Full House” condition already accepts eight or more.
5. Update every public “Up to 8,” “8 player maximum,” and “2/4/6/8” string. Do not expose different limits only after Start is pressed.

## Central policy and validation seam

Create one non-UI source of truth, consumed by setup, modes, save restore, tests, and accessibility copy. Suggested shape:

```js
PLAYER_LIMITS = {
  classic: { min: 2, max: 16, step: 1 },
  cupShort: { min: 2, max: 12, step: 1 },
  cupFull: { min: 2, max: 8, step: 1 },
  teamClash: { min: 2, max: 16, step: 2 },
  practice: { min: 1, max: 1 },
  physicsLab: { min: 1, max: 1 }
};
```

The exact module/file name is an integrator decision. Required behavior:

- Add Player follows the broad playable maximum of 16.
- Format selection validates without removing players.
- An invalid selection is visibly disabled or produces inline guidance, e.g. “Full Cup supports up to 8 players. Choose Short Cup or remove players.”
- Changing Short/Full Cup revalidates immediately.
- Team Clash accepts every even count through 16, rejects odd counts, and never silently adds/removes a seat.
- Practice and Lab construct a one-player definition from the selected setup seat and ignore the remainder without mutating it.
- Restore/import applies the same validation and produces a visible recovery message rather than truncating data.

## Team Clash scalability detail

The current Team Clash round has three flips per team and advances each team’s teammate offset by three. This scales to teams of eight without changing the rule:

- Team size 8: rounds begin at offsets 0, 3, 6; the first three rounds include all eight teammates at least once.
- An ordinary team cannot reach 11 with base one-point makes in fewer than four perfect uncancelled rounds, so every teammate gets an ordinary opportunity before an ordinary match can end.
- A rare automatic/multiplier result can end sooner; this is already true at smaller sizes and should be accepted as event behavior, not “fixed” by nesting more flips.

Tests must nevertheless prove the coverage property for team sizes 1–8, both starting teams, rematches, and team swaps. Do not replace the offset algorithm with random teammate choice.

## Proposed wide-screen simultaneous two-player duel

A local two-player simultaneous duel is possible, but it is not a small player-limit change. The current runtime is deliberately single-turn and single-object:

- `js/input.js` owns one `activePointerId` and explicitly ignores every additional finger while a gesture is active.
- `js/main.js` has one `currentPlayerIndex`, one `evaluating` gate, one active launch/event/telemetry record, and rejects another launch after the first begins.
- `js/physics.js` is a singleton centered on one primary `bottle`, one landing lifecycle, one event runtime, and one set of camera/view hints.
- `js/renderer.js` draws one active flippable and applies global reaction zoom, event camera, HUD, trail, and result state.

A robust duel therefore needs two isolated lanes, not two calls into the current singleton. Each lane needs its own pointer gesture, body/liquid/internal dynamics, physics/event controller, landing state, telemetry, selected art, and reaction state, while one coordinator starts both lanes on the same fixed-timestep frame and waits until both are resolved. Prevent cross-lane collision unless the product explicitly chooses a shared-arena collision mode; isolated mirrored lanes are far easier to keep fair.

Smartboard support must be capability-tested rather than assumed:

- Require Pointer Events plus `navigator.maxTouchPoints >= 2`, then run a short pre-match calibration asking users to hold two marked targets at once. Some boards expose touch as one mouse pointer or serialize contacts despite reporting touch support.
- Replace the singleton pointer fields with a bounded `Map<pointerId, lane>`; assign a pointer only when it begins inside that lane, capture it on the canvas, and cancel only that lane on `pointercancel`.
- Use a visible shared countdown/ready window, buffer both valid flicks, and launch them on the same simulation frame. The first player must not receive extra airtime or settle time while waiting for the second.
- If two independent contacts are not observed, fall back cleanly to an alternating two-player duel with the same scoring. Mouse-only desktop, single-touch phones, remote desktop, and incompatible smartboards must never present a broken simultaneous option.
- Recheck capability after fullscreen/orientation changes and define what happens when one touch is cancelled. Recommended: cancel and reset both lanes before launch; after launch, input cancellation is irrelevant.

The renderer/physics qualification cost is meaningful: two animated authored objects, two internal-liquid systems, and potentially two event FX stacks can approximately double the heaviest scene. Require 60 FPS at 1080p and 45 FPS on the target smartboard with both lanes active. For an initial version, use one shared, symmetrical physical event per duel or no events; do not allow independently rolled asymmetric rewards to decide a supposedly simultaneous skill contest.

This mode should **not change the 16-player cap**. Simultaneous Duel itself is exactly two active players. A tournament/rotation wrapper may select pairs from a roster of up to 16, but only two physics lanes exist at once and the ordinary roster/setup/HUD limits still apply.

## Online removal and legacy-data boundary

The owner revised the v1.12 contract to remove Online completely. Player scaling must not extend or preserve a playable Online mode.

Remove from the shipped build:

- the Online navigation button and `#online-screen` markup in `index.html`;
- Online-only CSS;
- `js/v111-network-protocol.js` and `js/net.js` from the boot list and service-worker precache;
- room/relay UI handlers, network capture/restore, authoritative flick/result branches, forfeit-on-disconnect, and brand/query switches in `js/main.js`;
- runtime references whose only consumer is Online;
- Online/relay release tests as active product qualification (they may be archived as historical tests, not loaded product code);
- the optional relay from deployment/package artifacts if it is currently published.

Preserve for compatibility:

- `online: boolean` in `FlipRecordV1`, `MatchRecordV1`, aggregate schemas, JSON import/export, CSV export, and filters/internal query logic;
- names and records from old Online sessions;
- imported `NetworkEnvelopeV2`-shaped material only if it is nested inside an old backup and treated as inert data. It must never reactivate networking.

The safest removal sequence is to lock `onlineMode` to false locally, delete the online UI/handlers and network boot assets, prove all local modes, then remove dead branches. Do not mechanically delete every line containing `online`, because the records schema must remain backward compatible.

## Acceptance tests

### Rules and rewards

- Classic initializes and completes deterministic matches at counts 2 through 16 for every life preset, both directions, all three feel settings, and mixed Human/CPU rosters.
- Every seat 0–15 becomes Current in the exact expected order; eliminated seats are skipped; the last active seat wins.
- Sudden-death start and every escalation occur only on a full starting-roster boundary. Test 2, 3, 5, 8, 9, 12, 15, and 16 players, plus eliminations immediately before a boundary.
- ON FIRE continues correctly at 16 players; its miss remains penalty-free and the next active seat is correct.
- Double Flip, Life Drain, Plinko halve, Plinko win/loss, permanent magnet, and forced elimination update all 15 possible opponents exactly once.
- Mirror Match arms 15 targets, survives serialization/restoration, skips eliminated targets, prevents nested events, and consumes each remaining target exactly once.

### Cup

- Short Cup accepts 2–12 and rejects 13–16 without changing the roster.
- Full Cup accepts 2–8 and rejects 9–16 without changing the roster.
- Heat lives reset, every heat opener rotates, persistent magnet survives heat changes, and shootout queues contain the correct eligible players at 9 and 12 seats.
- Arena Draft state and save restoration retain 12 `heatWins` and player IDs.
- Test all player counts at the boundary values 8, 9, 12, and 13 in addition to a representative matrix.

### Team Clash

- Accept exactly 2, 4, 6, 8, 10, 12, 14, and 16; reject 1, every odd count, and 17+.
- Both default and explicit teams contain every player once and have equal size.
- Across enough rounds, each teammate appears in deterministic order and as evenly as mathematically possible; verify both starting teams.
- Rematch rotates opening team and teammate offsets; Swap Teams preserves all players and stable IDs.
- Cancellation, match point, Plinko, multiplier rewards, and Life Drain exclusion remain correct at 16.

### Save, Stats, and migration

- Reload a 16-seat saved setup and compare every field byte-for-byte at the semantic level: ID, safe name, object, variant/color, cosmetic, CPU flag, and order.
- Importing a 17+ playable setup produces a non-destructive, actionable validation result; it never silently slices.
- Raw and retained/rolled-up 16-player matches preserve all participants, seat labels P1–P16, team IDs, and player-count filters.
- JSON export/import remains lossless and deduplicated for 16-player records. CSV includes all participants with anonymized labels unless names are explicitly requested.
- Existing 1–8 v1.11 data produces identical totals after migration. Historical `online: true` data remains queryable/exportable but cannot start a network session.

### UI and accessibility

- Screenshot and interaction fixtures: 2, 8, 9, 12, and 16 players at 360×740, 768×1024, 1280×720, 1366×768, 1920×1080, and 3840×2160.
- At every fixture: no horizontal page scroll, no clipped roster/action, no nested scrolling on phone, and 48px smartboard targets.
- Keyboard-only users can add/remove P16, page through the roster, customize P16, return focus to its card, and start/rematch.
- Screen-reader announcements include current player, player position (“Player 13 of 16”), On Deck, After That, format incompatibility, and safe removal consequences.
- Runtime HUD always exposes Current/On Deck/After That without scrolling, including after eliminations and reverse-direction play.
- Game Over and setup proposals expose all players in semantic seat order and retain sticky/visible actions.
- Repeated colors at seats 13–16 remain distinguishable without color through seat number, name, and team/pattern cues.

### Performance and soak

- Run 16-player Classic and Team Clash for at least 500 scripted flips with every event forceable and no growing DOM/canvas/cache counts.
- Hold the existing 60 FPS 1080p and 45 FPS heaviest-smartboard-event gates; compare 2 versus 16 players to prove roster HUD work does not materially affect frame time.
- Measure setup rendering, customization open, HUD update, game-over rendering, save/reload, Stats filtering, and CSV export with 16 participants.
- Android WebView/PWA smoke: 16-player setup reload, full turn rotation, background/resume, offline reload, and memory pressure during the heaviest event.

## Release decision

Do not advertise more than eight players by changing one button constant. A safe v1.12 expansion requires the mode validators, Mirror Match, save restore, rollups, Stats labels, setup layout, live HUD, results layout, migration tests, and device screenshots to land together.

Once those gates pass, certify 16 as the overall local ceiling, 12 for Short Cup, and 8 for Full Cup. Going above 16 should be a future “large group” design project with a different roster/HUD and match-length model, not an untested numeric increase.
