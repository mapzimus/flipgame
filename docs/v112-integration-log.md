# Flipgame v1.12 integration log

This log begins after immutable public v1.11 commit
`947133360d3487a646e04be2b313c577474f54a5`. The v1.11 contract, integration
log, and defect ledger remain release history and are not rewritten.

## Revision 1 — establish v1.12 as the playtest release

- Trigger: the product owner reserved `v2.0` for a version they explicitly
  declare satisfactory.
- New behavior: all work after the v1.11 release is organized as v1.12. Public
  v1.11 remains immutable and no v1.12 deployment occurs without owner approval.
- Migration: stable `v111-*` internal modules/schemas may remain; public/cache,
  export, APK, tag, and provenance identifiers change together at RC activation.
- Required tests: exact version/source parity across both web origins, PWA,
  offline cache, export, release metadata, and signed APK.

## Revision 2 — Practice meter placement and signal

- Trigger: playtesting found the meter over the middle of the Practice arena,
  then showed a roughly quarter-full meter while the launched object received a
  much stronger peak-velocity throw.
- New behavior: the meter is anchored in the bottom table/HUD region and reads
  the exact peak-velocity launch signal with the active pointer-type equalizer.
- Physics impact: ordinary spin is recalibrated so low/quarter-strength input is
  not the normal full-flip window; events are independently requalified.
- Required tests: measured phone/desktop placement, peak-signal parity, input
  calibration corpora, Classic/Alien/event regressions.
- Integration: placement commit `7e27512`; signal/physics work pending.

## Revision 3 — progression ownership and reveal correctness

- Trigger: earned objects were announced but remained absent from Customize
  until reload; a locked/question tile could show the previous object beneath
  it; cosmetic unlocks produced no notification.
- Old behavior: Records created a second in-memory progression store and queued
  only object IDs for the mystery reveal.
- New behavior: Records and Customize share one live store. Every reward type
  receives a clean, reset, accessible queued reveal; locked canvases are never
  painted and never retain old pixels.
- Required tests: each win 1–100, immediate selection, all reward types, queued
  ordering, close/skip, reload, old-save migration, no-relock, and lock secrecy.
- Integration: shared-store correction pending; reveal work not started.

## Revision 4 — hidden owner test view

- Trigger: the product owner needs a way to test all content without destroying
  or fabricating earned progression.
- New behavior: exact case-sensitive `Howe Test Mode` supplies a temporary
  all-content view and marks the complete session as Test Data. It does not
  persist ownership or earned achievements. Achievement detail may be previewed
  but is never marked earned.
- Compatibility: `Mr. Howe` remains only the Normal event-frequency multiplier;
  Practice event names keep their forcing behavior.
- Required tests: exact/case-mismatch activation, immediate deactivation,
  restart, all selectors/modes, Test Data exclusion, and unchanged persisted
  progression before/after.

## Revision 5 — visible authored variant gallery

- Trigger: color-only variant circles hid the actual physical casts until the
  player applied changes and returned to Setup.
- New behavior: the Variant tab paints all available authored object variants
  immediately and gives each a funny color-plus-cast name. Locked variants
  expose no art or name.
- Required tests: all 51 objects, 300 new-object variants, legacy cast families,
  immediate repaint, selection/cancel/apply, responsive layout, accessibility,
  secrecy, and bounded preview caches.

## Revision 6 — longer nine-slot Plinko

- Trigger: playtesting reported a board that appeared to have only seven slots
  and did not begin high enough for the expanded prize layout.
- Clarification: the canonical rules/physics registry contains nine slots; the
  seven-slot impression is a camera/crop presentation defect.
- New behavior: extend the physical peg field well beyond its current eight
  rows and track the object from the top through all nine prize bins without
  shrinking the complete fall into an unreadable overview.
- Required tests: nine physical/visual slots, deterministic seed-to-slot parity,
  longer fall, camera continuity, final-bin legibility, anti-wedge behavior, and
  phone/desktop/smartboard/4K screenshots.

## Revision 7 — public aggregate statistics remain gated

- Trigger: the product owner requested future collection of public gameplay
  data in addition to improved device-local Stats Lab data.
- Boundary: v1.11/v1.12 currently prohibit telemetry and are used around minors.
- New planning requirement: retain the request but require a separately approved
  product/privacy/security data contract before adding any network collection.
  Full-fidelity Stats Lab remains local in the meantime.
- Required tests if later approved: consent/off controls, schema minimization,
  no names/free text/fingerprints/location, aggregation, retention/deletion,
  abuse/rate controls, transport/auth security, and privacy documentation.

## Revision 8 — every event must be obvious and fallible

- Trigger: playtesting found event presentation too subtle and the product owner
  requested a dedicated review of every special event.
- New behavior: all 30 events receive individual physical/visual/audio/camera,
  challenge-bias, miss-path, cleanup, accessibility, and performance review.
  The event set intentionally contains helpful, harmful, and mixed mechanics.
- Contract correction: every event must retain a real non-zero miss path. Life
  Drain's undisclosed magnet remains very strong but no longer guarantees a
  landing. Plinko remains the only event with one Automatic Win slot and is
  still fallible through its two Automatic Loss slots.
- Required tests: broad deterministic make/miss corpora for every event,
  event-specific acceptance seeds, screenshot/motion cues, mode adapters,
  reduced motion, cleanup, and heaviest-event performance.

## Revision 9 — reaction expressions replace rather than overlay

- Trigger: product playtesting showed the generic smile/frown/scared painter
  superimposed over an object's original neutral face, producing doubled and
  broken facial features.
- Old behavior: eligible art paints its complete base sprite first, then the
  shared painter draws another pair of eyes and mouth on top.
- New behavior: every eligible variant exposes replaceable facial features, a
  clean face plate/mask, or an authored expression callback. Exactly one face is
  visible in idle, airborne, make, and miss states; neutral features are restored
  after the reaction beat.
- Required tests: pixel/command assertions for no doubled eyes/mouth, all
  allowlisted variants and legacy objects, idle restoration, repeated flips,
  reduced motion, camera focus, Bottle exclusion, and protected T-Rex invariance.

## Revision 10 — current art and menu direction rejected

- Trigger: the product owner rejected the current new-object artwork and called
  the responsive menu robotic and boring.
- Status correction: structural completeness, 300 render variants, and passing
  art tests do not constitute visual approval. The art/menu gates are failed.
- New process: generate multiple non-shipping concept directions, approve a
  small calibration set and one interactive responsive menu prototype, then
  scale the chosen authored language. Do not bulk-produce variants before base
  object approval.
- Menu direction: lively physical party-game/game-show staging instead of an
  administration dashboard, while retaining smartboard, mobile, accessibility,
  secrecy, performance, and offline requirements.
- Tool boundary: generated raster imagery may be used for concept references;
  the shipped game remains authored HTML/CSS/canvas/SVG with no runtime network
  or generated-raster dependency.
- Required review: product-owner visual approval at 1280×720 and phone size,
  then complete responsive/screenshot/performance/accessibility qualification.

## Revision 11 — phone/desktop flick parity

- Trigger: product playtesting found phone flicking much harder while desktop
  felt nearly ideal.
- Diagnosis boundary: ordinary physics should not intentionally be harder by
  device. Current input uses browser-sampled peak motion plus fixed 1.32 touch
  and 0.92 pointer multipliers; mobile event coalescing/sampling can therefore
  produce different intent-to-speed mapping.
- New behavior: preserve the approved desktop feel and normalize phone gesture
  capture using coalesced timestamped samples and measured device corpora. Do
  not alter competitive collider/tolerance by viewport.
- Required tests: replayable touch/mouse/pen sample streams, phone-through-4K
  power/spin/make-rate bounds, short-fast and long-slow gestures, pointer cancel,
  browser-chrome movement, and Practice meter parity.

## Revision 12 — Alien UFO bank surfaces must be visible

- Trigger: product playtesting no longer showed floating UFOs in Alien or Alien
  Invasion.
- New behavior: every live saucer collider has a synchronized rendered UFO;
  native and temporary Alien share the same obstacle/render contract. Compact
  screens may reduce but never remove the visible saucer set.
- Required tests: body/render counts and positions, collision flash, camera
  inclusion, phone/desktop/4K screenshots, mode cleanup, and no invisible bank.

## Revision 13 — free toolchain selected

- Product decision: use built-in concept generation, authored web/canvas/SVG,
  browser-controlled QA, multi-agent simulations, existing analytics review,
  and existing performance audits. No paid design plugin is required.
- Figma remains optional only; no release gate or source file depends on it.

## Revision 14 — ON FIRE must read as a major game state

- Trigger: product playtesting found ON FIRE far less pronounced than its prior
  presentation.
- New behavior: ignition and each continuing make use bounded escalating object
  flames, aura/table heat, arena treatment, impact/audio beats, and persistent
  run information. Landing pose and turn order remain readable.
- Rules boundary: no ON FIRE scoring, life cap, penalty, turn, or sudden-death
  behavior changes in this presentation pass.
- Required tests: ignition/continuation/cap/end lifecycle, long runs, cap makes,
  eight players, all objects/cosmetics/events, reduced motion, cleanup, and
  phone/smartboard performance/screenshots.

## Revision 15 — mature menu direction

- Trigger: the first lively concept was polished but too arcadey and immature.
- New direction: premium tabletop sport plus modern game-broadcast energy,
  restrained color/materials, strong hierarchy, and selective earned humor.
- Avoid: candy color, toy/bubble UI, casino motifs, pixel-arcade ornament, and
  mobile-shell composition on desktop.
- Approval remains required for a code-native 1280×720 and phone prototype.

## Revision 16 — local player expansion

- Product request: support more than eight local players.
- New policy: Classic 2–16, Short Cup 2–12, Full Cup 2–8, Team Clash every even
  count 2–16, and Practice/Alien/Physics Lab solo.
- Migration: replace subsystem-specific bounds and silent eight-entry slices
  with one player-limit contract. Setup pages eight visible seats; gameplay
  emphasizes Current/On Deck/After That and rotates the complete roster.
- Required tests: every supported count, order/direction/sudden-death/rematch,
  saves/results/stats/exports, 1280×720 through 4K, and no data truncation.

## Revision 17 — remove Online from the build

- Product decision: v1.12 ships no Online mode, including hidden or beta entry
  points.
- Remove Online UI/routes, room flows, transport/runtime dependencies, network
  modules from boot/cache, reachable network state paths, and online release
  claims/tests as a supported feature.
- Compatibility boundary: inert `online` fields may remain solely to import and
  classify older local records. They cannot activate networking or appear as a
  player-facing feature.
- Required verification: no shipped route/button/module load/cache entry/socket
  or transport request; offline PWA and legacy local imports still work.

## Revision 18 — simultaneous local Battle formats

- Product concept: simultaneous physical competition on a shared wide screen.
- Formats: 1v1 Duel uses two active lanes; 2v2 Doubles and 1v1v1v1 Free-for-All
  use four; larger teams rotate up to two active representatives per side after
  each completed volley. Four active objects is the universal ceiling.
- Input contract: observe the required concurrent pointer streams in a runtime
  capability check; maintain independent pointer-ID keyed trackers, coalesced
  samples, captures, meters, physics lanes, and landing lifecycles. Do not
  filter to `isPrimary`.
- Fairness boundary: v1.12 uses adjacent but physically independent lanes. A
  cross-lane collision arena is deferred. Shared team scores preserve individual
  attribution; Free-for-All powers require explicit target selection.
- Initial scoring proposal: best-of-three timed heats, repeat after settlement,
  upright 1, cap 2, miss 0; duration/rotation/tiebreak require owner prototype
  approval.
- Power-up contract: charge comes from valid landings; one stored physical,
  telegraphed, fallible power at a time; self, targeted sabotage, or symmetrical
  Chaos adapter. Existing events use a curated allowlist and new Battle-only
  powers may be added. Life Drain is excluded. Plinko/Roulette can run only
  between heats.

## Revision 19 — Mitosis is whole-object duplication

- Trigger: a cap-like split is nonsensical for non-bottle objects.
- New behavior: duplicate the complete selected object and variant into two
  recognizable clones with independent dynamics and conserved combined mass and
  angular momentum. Never create a cap for Mitosis.
- Cap Toss remains the only standalone-cap event and requires an appropriate
  per-object equivalent when the selected object has no cap.
- Required tests: all objects/variants, selected-art parity, independent
  contents, one/both/neither outcomes, reward, determinism, cleanup, and 4K.

## Revision 20 — Plinko long-drop timing

- Product decision: target a 12-second median and a 10–15 second normal drop
  band.
- A physically active drop may run longer than the normal band. Recovery and
  no-contest handling are reserved for measured wedges/stalls, never used to
  shorten a dramatic legitimate fall.
- Duration must come from a genuinely taller physical peg field, not slow
  motion, an invisible delay, or fake repeated bounces.
- Required tests: fixed-seed duration distribution, all nine slot outcomes,
  tracked camera, readable upcoming pegs, anti-wedge recovery, abnormal-stall
  failsafe, reduced motion, and phone-through-4K performance.

## Revision 21 — CPU difficulty recalibration

- Trigger: owner playtesting found CPUs almost never miss; simulation confirms
  current Standard Classic rates near 49% Easy, 73% Medium, and 84% Hard, with
  Alien sometimes near 85% even on Easy and non-monotonic across viewports.
- New targets: Easy 30–40%, Medium 45–55%, Hard 60–70%, with rarer ordered cap
  rates, measured over frozen deterministic corpora.
- Fairness boundary: difficulty changes CPU launch input only. It cannot modify
  human physics, landing verdicts, results, or secretly adapt during a match.
- Required tests: ordered make/cap bands across Feel settings, local modes,
  Alien, compatible events, and every viewport, plus plausible input variance.

## Revision 22 — Alien difficulty parity

- Trigger: owner requires Alien difficulty to remain comparable with ordinary
  flips; current simulation shows Classic near 32.5%, temporary Alien near 68%,
  and native Alien near 82% phone/desktop versus 60% at 4K.
- New acceptance: matched human-skill Alien corpora remain within 10 percentage
  points of Classic at every viewport, and Alien's phone-to-4K spread remains
  within 10 points. CPU tiers use the ordinary frozen target bands.
- Rules boundary: scoring still requires at least one visible UFO bank then
  tractor-ring entry. Calibration changes geometry/forces/scaling, never a
  hidden verdict override; native and Invasion share the normalized contract.

## Revision 23 — realistic rotating Desk Globe sphere

- Product decision: only the literal Urth sphere on Desk Globe is realistic
  and visibly three-dimensional. The stand, meridian, base, and surrounding art
  remain in the shared authored Flipgame style.
- New behavior: a complete offline world surface rotates through all 360
  degrees in previews and play, with curvature, directional light, atmosphere,
  limb shading, and sufficient detail for a brief close view. It cannot remain
  a fixed Africa-facing decal.
- Runtime boundary: no map tiles, external API, telemetry, or network fallback;
  sphere rendering is visual only and cannot change the shared collider/mass.
- Required tests: full-longitude cycle, deterministic motion/replay, reduced
  motion, offline/cache/APK availability, phone/4K performance, art-layer
  isolation, and protected Bottle/T-Rex invariance.

## Revision 24 — Desk Globe post-make focus Easter egg

- Product decision: a legitimate physical make with Desk Globe has a 1/100
  chance of a brief geographic camera focus; exact case-sensitive `Mr. Howe`
  raises only this showcase chance to 1/10.
- New behavior: select a point inside the currently visible hemisphere, push
  into its real geography, then restore the normal result camera before input.
  Physics Lab exposes a force control for direct review.
- Rules boundary: separate deterministic presentation RNG, misses and automatic
  outcomes excluded, no event-roll consumption, no score/reward/progression
  effect. Reduced motion uses a stationary magnified inset/crossfade.
- Required tests: exact rates, case sensitivity, hemisphere bounds, no gameplay
  RNG drift, miss/automatic exclusions, repeat determinism, cleanup, and all
  supported viewports.

## Revision 25 — dedicated stage selection and expanded arenas

- Product decision: after all player/object/variant/personal-cosmetic choices,
  the game opens a separate full-screen `ARENA SELECT` immediately before play,
  using a fighter-then-stage local-party-game rhythm.
- New behavior: one global arena, large live preview, unlocked grid, Random
  Unlocked, Back, explicit Start, and Same Arena/New Arena rematch paths. Locked
  tiles remain anonymous `🔒` only.
- Content revision: retain/review the ten migrated arenas and add School
  Cafeteria, Sports Locker Room, Mars Outpost, Grand Library, Island Beach,
  Pirate Ship Deck, Aquarium Tunnel, Skate Park at Sunset, Rainforest
  Treehouse, Haunted Hall, Stadium at Night, and Movie Soundstage. Upgrade the
  existing Space Station rather than duplicating it.
- Unlock boundary: the twelve additions are hidden deterministic feat rewards
  outside the fixed 1–100 ladder. No rare-event-only, daily-login, paid, online,
  or unbounded-grind requirement. Owner Test Mode temporarily exposes all 22.
- Physics boundary: arena ambience is visual/audio/camera-only. Battle receives
  only qualified lane-readable compositions; explicit Arena Draft/event
  modifiers remain a separate system.
- Required tests: state flow/back/rematch/random, migration/ownership/reveals,
  secret locks, all 22 animated previews, Battle lanes, reduced motion,
  accessibility, offline assets, and phone-through-4K performance.

## Revision 26 — mixed Level-200 progression supersedes feat arenas

- Owner correction: do not group objects early and arenas/visuals late. The
  complete sequence must interleave object, arena, and personal visual rewards
  with a rising desirability curve.
- New structure: fresh saves have Bottle as the only selectable object plus a
  functional plain style/default arena. Every even level 2–198 grants one entry:
  49 non-Alien objects, 21 additional arenas, 28 personal visual entries, and
  the Physics Lab milestone. No more than two adjacent entries share a category.
- Revision 25's proposed feat-based arena awards are superseded; arenas now live
  in the main deterministic ladder. Existing owned IDs remain grandfathered.
- Quality boundary: later rewards must be visually richer/more surprising, but
  no content receives stronger physics, scoring, odds, or tolerances.

## Revision 27 — Physics Lab at 50; Alien and Insane at 200

- Owner decision: Physics Lab unlocks at internal Level 50 so players can train
  and replay mechanics during the longer mastery climb.
- Alien object and `INSANE MODE` unlock together as the Level-200 capstone.
  The prior win-100/Level-100 triple is superseded.
- Practice remains immediately available; Lab/Test play earns no ordinary
  progression. Existing legitimate Alien/Insane/Lab ownership is never revoked.
- No player-facing surface exposes either requirement, their relationship, or
  the ladder endpoint before discovery.

## Revision 28 — Flip Credits progression

- Owner decision: raw qualifying wins are replaced by earned, non-spendable
  Flip Credits (`FC`) that advance a device-local Flip Level. FC can never be
  bought, lost, exchanged, or used for random rewards.
- Legitimate completed human losses earn meaningful FC—targeting roughly
  70–80% of an equivalent win—while wins, makes, caps, perfects, and explicit
  CPU difficulty supply bounded transparent bonuses.
- Larger-human-roster, Team, Battle, and longer Cup formats earn more through
  sublinear/capped participation, teamwork, and duration factors. Added CPUs,
  100-life farming, rare-event luck, or deliberate delay cannot dominate.
- Achievements award one-time rarity-scaled FC after legitimate discovery.
  Bonuses are idempotent and bounded; locked entries remain anonymous.
- Migration maps legacy qualifying wins/ownership/achievements to a no-relock
  FC floor and one-time claims. UI may show current Flip Level and `+N FC`, but
  never future IDs, level requirements, FC remaining, or Level 200.

## Revision 29 — First Flip Tour

- Owner request: new players receive an optional playable tutorial covering the
  real flick, meter, landing/settling, make/miss/cap, lives, and turn basics.
- Sequence: two ordinary Bottle teaching shots, a protected original-T-Rex guest
  transformation, then forced physical Rainbow Corkscrew and Trampoline demos.
  T-Rex is neither modified nor unlocked and its future requirement is not
  disclosed.
- Fairness boundary: tutorial physics/events remain physical and fallible. A
  ghost may demonstrate or explain after repeated misses but cannot rewrite a
  result or change competitive tolerance.
- Data boundary: all attempts are tutorial Test Data and award no FC,
  achievement, discovery, ownership, or default statistics; tutorial RNG cannot
  perturb the first real match.
- UX boundary: skippable at every step, replayable from How to Play, successful
  target duration 45–75 seconds, touch/mouse/pen/keyboard support, reduced-motion
  crossfade/static alternative, and no odds/locked-catalog disclosure.

## Revision 30 — visible main-menu Flip Level milestones

- Owner correction: secrecy is relaxed only for major unlocks represented by
  their own top-level menu cards. Physics Lab names itself and says
  `Locked until FL 50`; Alien and `INSANE MODE` name themselves and say
  `Locked until FL 200`.
- Selection-menu behavior is unchanged: locked objects (including Alien),
  variants, cosmetics, arenas, and achievements show only an accessible `🔒`,
  with no name, preview, silhouette, requirement, progress, or relationship.
- Current FL may be shown globally. Main-menu milestone cards cannot enumerate
  or hint at the anonymous rewards between those levels.
- This visibility rule supersedes only the conflicting secrecy sentences in
  Revisions 27 and 28; their unlock levels, migration, and progression rules
  remain in force.
- Required tests: exact strings/casing and unlock boundaries at FL 49/50 and
  199/200; selection-surface secrecy; keyboard/screen-reader clarity; migration
  ownership; owner-test behavior; and no stale win-based copy.

## Revision 31 — post-match progression report and performance multiplier

- Owner decision: Game Over becomes an original Flipgame count-up that itemizes
  participation/completion, legitimate match/mode/roster bonuses, win,
  performance, and newly earned achievement bonuses before showing FL growth.
- A bounded performance multiplier rewards better match-adjusted statistics and
  modestly reduces the variable portion for weaker statistics. Initial tuning
  envelope is approximately `0.85×–1.25×`, regresses to neutral for small
  samples, excludes automatic/forced/test outcomes, and never reduces the
  guaranteed completion floor. Legitimate losses always advance.
- Achievement progression awards are applied afterward and never multiplied.
  CPU-filled seats, stalling, extremely long/lucky events, repeats, reloads,
  and incomplete sessions cannot inflate or duplicate the award.
- The screen animates the earned progression into the current FL meter and
  queues each crossed level/reward reveal. Presentation is skippable,
  reduced-motion safe, screen-reader summarized, and persisted atomically
  before animation.
- Required tests: exact formula fixtures, poor/neutral/excellent and small-
  sample cases, win/loss and all formats/difficulties, roster/CPU abuse,
  achievements, multi-level crossings, max FL, skip/reload/background,
  idempotence, secrecy, accessibility, and immediate reward selection.

## Revision 32 — FXP terminology; Flip Credits reserved

- Owner correction: earned leveling points are **Flip Experience Points
  (`FXP`)**, and the visible progression number remains **Flip Level (`FL`)**.
  Every `FC` reference in Revisions 28–31 is superseded by `FXP` where it means
  earned leveling progress.
- The name **Flip Credits (`FC`)** is reserved for a possible future spendable
  mobile-game currency. v1.12 does not create an FC balance, grant FC, display
  FC, sell FC, or include a store, purchase, payment, ad, or monetization hook.
- Post-match presentation therefore shows `+N FXP`, the transparent bonus and
  performance rows, and FL advancement. Save fields, records, imports, exports,
  UI copy, accessibility text, and tests use `fxp`/`FXP`, not `fc`/`FC`.
- Required tests: repository/runtime scan for accidental FC economy surfaces;
  FXP persistence and idempotence; migration from qualifying wins without
  inventing a spendable balance; and exact `FXP`/`FL` copy in every locale-free
  player-facing surface.

## Revision 33 — final Pressure Signal contract

- `docs/v112-contract.md` is now the sole implementation authority and
  supersedes conflicting working-plan, arena and QA drafts.
- Progression returns to FL1–100 with separate FXP and spendable, earn-only FC.
  Physics Lab is FL50. Fresh saves require both FL100 and an Alien victory for
  Alien and `INSANE MODE`; legitimate v1.11 ownership remains grandfathered.
- Story Mode `Pressure Signal` ships in v1.12 with four acts, twelve chapters,
  shared Rival Board clears, solo and two-human co-op, and the Wurld Flip
  Championship canon on present-day Urth.
- Canon additions: friendly sentient dinosaurs live normally alongside humans;
  the protected playable T-Rex remains a vintage molded figure; flavor-only
  altered spellings come from an authored lexicon and never affect functional
  or accessible text.
- Tall Buildings is replaced by Mechanical Metronome and Giraffe by Desk
  Gyroscope. Entitlements/selections migrate; historical stats retain legacy IDs.
- Battle is required, supports up to four active lanes, and disables normal
  event rolls in favor of curated physical powers.
- The catalog is frozen at 51 Flippers, 612 variants, 23 arenas, 40 Store
  cosmetics and 120 achievements. Online is removed from the shipped product.
- Migration action: reconcile v1.11 against its frozen catalogs before the V4
  profile transaction migrates FXP, FC, entitlements, Story/rival flags and
  idempotency claims.
- Test action: replace obsolete exact-seed/every-event-makes fixtures with the
  final rate, parity, fallibility and Story/Battle qualification gates without
  dropping their underlying landing/deadline invariants.

## Revision 34 — Wave 1 contracts integrated

- Integrated the versioned activity/session contracts in commit `e3d21f3`.
  Activity, format, and physics-mode identity are now independent; match
  finalization has an exactly-once transaction boundary and statistics remain
  asynchronous and non-authoritative.
- Integrated the Story/Urth domain core in commit `dc9a1c7`. The twelve-chapter
  catalog, shared Rival Board clears, early Alien victory banking, solo/co-op
  requests, authored Urth lexicon, first-clear rewards, and final feature gate
  are covered by deterministic tests.
- Integrated the Battle rules core in commit `deaeb24`. Equal Volley, Timed
  Rush, 1v1/2v2/four-way/larger-team rotation, hardware lane limits, charges,
  deterministic Sport/Mayhem offers, horn handling, and terminal-event
  exclusion are covered by deterministic tests.
- Alien calibration retains the frozen tractor-ring size. The first qualifying
  bank preserves full energy; later sidewall/deflector/UFO contacts receive
  progressive linear and angular damping. This is an input/trajectory cleanup,
  not a smaller scoring target.
- Migration action: the pending V4 profile store will consume the activity and
  Story result contracts by immutable match ID. UI/runtime integration must not
  bypass that transaction boundary.
- Test action: keep the Story, Battle, and activity suites mandatory after every
  subsequent integration merge.

## Revision 35 — Wave 1 foundation gate passed

- Core input/physics landed in `d765973`, with canonical lane-relative launch
  sampling, coalesced-pointer handling, aborted-gesture cleanup, exact Practice
  meter parity, prelaunch-only Physics Feel, restored ordinary spin, and shared
  Alien/Alien Invasion trajectory rules.
- Follow-up `193f819` removed viewport-dependent raw-pixel launch thresholds and
  equal-timestamp velocity spikes. Equivalent gestures now use the same
  canonical threshold and transfer signal from phone through 4K.
- The Alien target ring remains unchanged. Its first qualifying bank conserves
  energy; repeated wall, deflector, or UFO banks progressively damp translation
  and spin. The deterministic corpus reports Classic at 32.1% and Alien between
  24.2% and 31.3% across supported viewports, with native and Invasion parity
  and no bankless makes.
- Transactional progression/profile work landed in `93f4c55`, with the frozen
  FL1–100 curve, 51-object/23-arena/40-cosmetic catalog, v1.11 reconciliation,
  Story rewards and final Alien gate. Follow-up `c1fba1b` ensures draws do not
  receive the win-only bonus; `193f819` gives Standard and Pro the same raw
  performance baseline.
- The reward-free First Flip Tour landed in `4c62a34`; the complete prelaunch
  event registry landed in `81e402f`; event/Alien metadata was aligned in
  `2996a8c`.
- Foundation verification: the inherited Node suite passes 49/49 and every
  integrated v1.12 activity, Story, Battle, input/physics, Alien, event,
  tutorial, economy, migration, and profile suite passes. Independent QA is
  still required before any defect or release gate closes.

## Revision 36 — Wave 2 vertical slices integrated

- The executable Story/Rival slice landed in `f4e7189`. It builds valid
  activity requests, enforces WFC-before-signature chapter order, supports
  solo/co-op and Rival Board attempts, and exposes replay, abandonment, early
  Alien victory and final-gate views without leaking undiscovered rivals.
- Follow-up `1db090b` moved match, rival, act, Field Note, ownership, FXP and FC
  effects into one profile transaction. An injected storage failure now leaves
  the entire clear unclaimed, and retry applies every effect exactly once.
- The seven-Flipper authored-art and Globe calibration landed in `0561188`.
  `da218f8` made the shared WebGL sphere reachable from preview/gameplay paint;
  `634c21a` permanently fails over to deterministic Canvas geography after a
  lost context. The protected Bottle and T-Rex remain outside this system.
- The simultaneous Battle lane runtime landed in `36a3b70`. It owns concurrent
  pointer capture, isolated lane resources, Volley synchronization, Rush
  re-arming, pre-horn airborne leases and pre-input power targeting without
  enabling ordinary/terminal events or cross-lane collisions.
- Follow-up `c2c78e9` replaced Battle-only raw-pixel qualification with the
  canonical 1280×720 gesture signal, radial deadzone, chronological coalesced
  samples and identical touch/pen/mouse transfer used by core input.
- Integrated verification passes Battle two/four-pointer, relay, resize,
  power, horn and input-parity tests; all inherited Node tests remain 49/49.
  Actual smartboard contact hardware, full UI wiring, complete 51-Flipper art,
  owner art approval and independent QA remain open release gates.

## Revision 37 — Battle relay fairness contract

- Affected interfaces: `BattleStateV1`, `BattleRuntimeV1`, Timed Rush clock,
  one-lane Equal Volley scheduling, and pending Battle power delivery.
- Old behavior: a one-lane shot could remain airborne across a relay boundary
  while the incoming side's clock continued; a batched tick could cycle past a
  side before it received an interactive frame; one-lane Volley always exposed
  the same first mover's newly earned card before its opponent acted; multiple
  physical modifiers could stack on one next launch.
- New behavior: the Rush 60 seconds are controllable gameplay-clock time.
  Cross-boundary flight pauses at the handoff until the incoming player owns a
  ready/aiming lane, and a batched update cannot skip that player. One-lane
  Volley rotates its opener and releases newly earned offers only after the
  complete paired volley. Each next launch accepts at most one pending physical
  modifier; conflicts reject atomically and preserve the stored card.
- Migration action: Battle state is match-ephemeral, so no persisted profile or
  save migration is required. Any future resumable Battle snapshot must carry
  opportunity-clock, handoff, paired-volley, and pending-recipient state.
- Required tests: long cross-boundary flights, multi-boundary delayed ticks,
  exact per-side opportunity totals, absolute horn/CPU cutoffs, rotating Volley
  openers, delayed offer visibility, atomic power conflicts, stale callbacks,
  destruction, and two-/four-lane parity.

## Revision 38 — Match integrity and dynamic activity state

- Affected interfaces: `MatchOutcomeV2`, `MatchSessionCoordinator`, Training
  activity adapters, Physics Lab authorization, rules resolution identity, and
  Story co-op targeting/completion.
- Old behavior: helper-level checks could be bypassed at the shared outcome
  constructor; dynamically forced Practice state could disagree with the
  opening request during finalize/abandon; Lab authority was self-attested; an
  ever-growing replay-ID array made long rules sessions quadratic; ally
  protection was target-only rather than actor-scoped and co-op allies could be
  forced to eliminate each other after every CPU left.
- New behavior: the shared outcome boundary enforces status/phase agreement,
  the coordinator queries current activity state on both terminal paths, and
  only issuer/profile-backed Lab authority is valid. Rules use bounded,
  namespaced monotonic resolution identity with compact final metadata. Story
  completes when all survivors are in the human alliance, and opponent effects
  protect only targets sharing the actor's alliance.
- Migration action: existing v1.12 development snapshots are disposable and
  must be regenerated. v1.11 saves contain none of these ephemeral match fields
  and require no new persistent migration.
- Required tests: direct outcome-constructor spoofing; completed/non-completed
  state/status cross-product; dynamic force/clear/mixed finalize and abandon;
  forged Lab tokens/direct Activity entry; restored Tutorial seeds; 10,000
  monotonic resolutions without growing payload; stale/duplicate callbacks;
  human- and CPU-actor co-op effects; and two-allies-surviving Story clear.

## Revision 39 — WFC name and broadcast language

- Affected interfaces: `UrthLexiconV1`, Story broadcast cards, future menu/HUD,
  commentary, replays, and Stats presentation labels.
- Old behavior: the event name was `Whirled Flip Champyunship`, with additional
  alterations inside the official title, and the sport had no frozen vocabulary
  separating physical phases, landing calls, pressure, or broadcast roles. The
  prior flavor lexicon also used unrelated phonetic joke spellings.
- New behavior: the exact name is **Wurld Flip Championship** and the format is
  **WFC Standard**. `Wurld` is the title's only altered word. The authored
  only optional spelling pattern is the /ɜr/ sound rendered as `ur` when standard
  spelling uses another form; unrelated joke spellings are removed. The authored
  broadcast terms cover Flipper/Entry/Lineup/Table/Lane; Set/Release/Flight/
  Contact/Settle; Hold/Stand/Crown/No Hold/
  Clean Hold/Recovery Hold; Stake/Pressure/Pressure Shot/Pressure Save;
  Lineup Rotation/Object Rotations; Ignition/Full Burn/Burnout; Signal Event/Signal Detected; Recent Form/
  Arc Trace; Hold Rate/Crown Rate/Pressure Save Rate; Table Judge/Replay Desk/
  Trajectory Analyst; Rising Stake/Takes the Table; and Fair-Form Standard/Certified. The
  Wurld Flip Federation (WFF) sanctions the sport; WFC names its premier event.
- Migration action: this is presentation-only. Persisted IDs, Story progress,
  statistics keys, WFC abbreviation, rules, and physics do not change. Replace
  old title strings in authored copy; never rewrite imported historical text.
- Required tests: exact canon string, absence of prior title in shipped authored
  surfaces, one-to-one term definitions, conventional functional/accessibility
  copy, and unchanged IDs/rules/physics.

## Revision 40 — Wave 3 integrity closure

- Affected interfaces: `MatchSessionCoordinator`, Training activity-state hooks,
  Physics Lab authorization, Story co-op request/target policy, Battle relay
  leases and launch adapters, `MatchOutcomeV2`, Classic/Cup/Team validators, and
  `ResolutionIdentityV1`.
- Old behavior: adversarial callers could omit a dynamic Practice provider,
  retain a held Battle aim across a full-cycle batched relay tick, strand a lane
  with a hostile thenable, submit contradictory or forged match states, rebind a
  resolution caller ID, or grow replay identity history without a bound.
- New behavior: dynamic activity requests require their live provider before a
  session opens; Battle invalidates an aim at the first crossed assignment lease
  and safely assimilates launch promises; Story allies are exact and actor
  scoped; match states are reachable and parent-consistent; resolution identity
  is caller-bound, monotonic, compact, and rejects stale/foreign/tampered input.
- Migration action: no v1.11 persistent record contains these ephemeral runtime
  fields. Development-only match snapshots from before this revision are
  discarded. Runtime callers issue identities through
  `Rules.nextResolutionIdentity(state, callerId)` and submit the returned token.
- Integrated commits: Training/Story `4cd20be`, `604f15b`, `e709044`; Battle
  `b956db2`, `3652061`; Rules `fc8d56a`, `61ac9b0`.
- Verification: all 45 repository script suites and all 49 inherited node tests
  pass. Independent re-audits cover dynamic finalize/abandon, hostile launch
  thenables, 18 multi-lane relay-cycle cases, exactly-once power restoration,
  status/phase cross-products, exact Story alliances, forged Classic/Cup/Team
  states, and 10,000 resolutions with only 96 bytes of payload growth.

## Revision 41 — calibrated Alien physics and CPU integration boundary

- Affected interfaces: core input transfer, Alien and Alien Invasion arena
  geometry, UFO bank response, `CpuLaunchIntentV1`, live CPU launch routing and
  renderer transforms for physical bank surfaces.
- Old behavior: Alien success varied sharply by viewport and native versus
  Invasion paths; repeated banks could preserve excessive motion. The shipped
  CPU path still used unseeded `Math.random()` aim and inherited the player's
  Physics Feel. UFO artwork also rotated at 35 percent of its authoritative
  collider angle.
- New behavior in `af6c4c4`: native Alien and Alien Invasion share one
  viewport-scaled target, obstacle and capture contract. The first bank keeps
  full energy and later banks progressively damp linear and angular motion. A
  deterministic, result-blind CPU intent module targets Easy 30–40 percent,
  Medium 45–55 percent and Hard 60–70 percent under Standard input transfer.
- Independent evidence: player-input defects V112-002, V112-003 and V112-015
  pass. In a 240-seed corpus at each supported viewport, matched Classic is
  32.1 percent and Alien is 30.8–40.4 percent; native and Invasion sequences
  are identical, no scored attempt is bankless, and cross-viewport spread is
  9.6 percentage points.
- Integration boundary: the CPU module is calibrated but not yet release-safe
  until the browser boot graph and live `aiFlick` path consume its seeded
  intent and pass `inputFeelMode: 'standard'`. UFO rendering must consume the
  exact authoritative angle and vertices. Final v1.12 cache/version identity
  remains intentionally release-owned and is not changed in this wave.
- Required follow-up: live boot/main integration tests, exact physics/render
  transform parity, strict primitive uint32 seed validation, direct Alien
  cleanup telemetry reset, in-flight resize/reflow tests, and larger
  non-prefix calibration windows before V112-016/V112-022 may close.

## Revision 42 — live CPU routing and authoritative UFO rendering

- Affected interfaces: development boot order, `aiFlick`, `onFlick`,
  `Physics.applyFlick` launch policy, and Alien obstacle rendering.
- Old behavior: `v112-cpu.js` passed isolated tests but was absent from the
  browser graph. Live CPUs used `Math.random()`, inherited human Physics Feel,
  and could choose a different Alien target from the launched seed. UFO art
  used only 35 percent of the physical collider's angle.
- New behavior in `e938af2`: the development boot loads the deterministic CPU
  module after Physics and before main. A single turn seed now drives event
  prediction, native or Invasion target preview, CPU intent and the final
  physics launch. CPU input always uses Standard transfer. UFO art consumes
  the exact authoritative obstacle position and angle.
- Independent verification: focused live boot/runtime tests plus Alien,
  input, boot, release, architecture, service-worker, version and regression
  suites pass. The re-audit found no random fallback and no hidden/filtered UFO
  path. V112-016 is closed.
- Calibration remains separate: diverse seed windows exposed a Hard Alien
  phone-rate deficit that the old sequential 240-seed corpus hid. V112-022
  therefore remains open until the representative phone retune and full
  viewport qualification pass. The final v1.12 service-worker/cache/version
  update remains release-owned and intentionally deferred.

## Revision 43 — one live V4 progression and variant namespace

- Affected interfaces: browser boot order, progression ownership checks,
  `ProgressionStateV4`, setup migration, reward reveals, Customize variants,
  save backup/import, and exact owner-test classification.
- Audit evidence at `e938af2`: the V4 catalog, economy, profile and art modules
  pass isolated tests but are absent from the browser graph. Live gameplay and
  Customize still read the V3 win store. A deterministic reproduction can own
  Milk Carton in V4 while the live V3 picker continues to show it locked.
- The V3 recovery fix remains valid for v1.11 state, but it is a migration
  source only. Once V4 is connected, all rewards and reads must use one live V4
  store; no dual writes or fallback ownership decisions are allowed.
- The twelve-variant art calibration and live flavor map currently disagree on
  eleven IDs and all twelve colors. Before renderer/UI rollout, the art owner
  and Customize owner must consume one frozen canonical variant ID, palette,
  authored display-name and migration mapping. A color index is not identity.
- Confirmed UI gaps: the closed reveal does not clear/hide prior canvas pixels;
  notifications filter to objects only; variants are swatches rather than live
  previews; exact `Howe Test Mode` has no implementation; V4/setup migrations
  are omitted from the current save surface.
- Required ownership order: progression runtime and backup adapter first;
  canonical art/variant mapping second; Customize/reveal/owner-test UI third;
  then integrator-owned boot insertion. Owner Test Mode is ephemeral, exact and
  case-sensitive, makes all resulting activity Test Data, grants nothing, and
  leaves the serialized earned profile unchanged.

## Revision 44 — bounded Battle series and Pressure Heat

- Affected interfaces: `BattleConfigV1`, `BattleStateV1`, Battle terminal
  validation, `MatchOutcomeV2.completionReason`, series presentation and all
  Equal Volley/Timed Rush multi-competitor tests.
- Old behavior: “best of three” did not define the reachable 1–1–1 or similar
  multi-competitor result after three completed heats, leaving implementations
  free to add an unbounded heat or choose an unrelated aggregate tiebreak.
- New behavior: every Battle series has a hard three-heat ceiling. Two heat wins
  clinch immediately. If nobody has two after Heat 3, Heat 3 is an announced
  **Pressure Heat** and its winner wins the series; its terminal reason is
  `battle-pressure-heat`. A normal two-win clinch remains
  `battle-heat-target`, and any post-clinch history is invalid.
- Timed Rush evidence now starts at `markLaunch`, not at settlement. One
  `BattleLaunchLeaseV1` binds a unique pending attempt/player to the exact heat,
  elapsed clock bucket, rotation, volley and sudden-death state. Settlement
  consumes that lease even after a later handoff or the horn; direct unmarked
  results, post-horn launches, duplicate pending attempts for one lane and
  altered lease facts fail closed.
- Migration action: Battle state is match-ephemeral and v1.12 is unreleased, so
  no persisted-state migration is permitted or required. Older structural test
  fixtures must be rebuilt through the canonical Battle transition API.
- Required verification: 1v1v1v1 and rotating-team sequences in both Equal
  Volley and Timed Rush; a Pressure Heat result; an earlier two-win clinch;
  cross-bucket and pre-horn-through-settlement launches; human/CPU leases; and
  rejection of unmarked, post-horn, duplicate-lane, wrong-bucket, post-clinch,
  forged-winner and non-final-heat winner histories.
- Integration commit: pending the isolated Battle outcome-integrity gate.

## Revision 45 — fail-closed browser reward authority

- Affected interfaces: `FlipgameV112Achievements`, `FlipgameV112Profile`,
  `FlipgameV112ProgressionRuntime`, browser boot/composition, writer locking,
  Profile import validation and the exact match/achievement receipt ledgers.
- Audit evidence: the earlier browser scripts exposed a one-shot Profile bridge
  carrying the raw store/writer toggle and a public evaluator capable of
  issuing genuine reward evidence from caller-supplied facts. The default live
  Runtime also failed to install its private reward authority, so the unsafe
  path was writable while the intended path was unusable.
- Immediate rule: standalone browser globals are frozen read-only facades. They
  expose no evaluator, reward authority, raw store, writer toggle, constructor,
  production connector or mutation verb. Duplicate/preseeded globals fail
  closed. A temporary `liveAvailable: false` is correct until the trusted
  composition gate lands; a fake or partially connected live runtime is not.
- Required live composition: bundle Profile, Progression Runtime, Achievement
  evaluator and Activity/Story coordinators in one lexical scope. Publish only
  redacted UI projections. Prove one real match reservation/finalization and
  achievement claim travel through the private authority before live V4 boot.
- Persistence rule: consumed match ordinals and compacted rewards retain exact,
  durable, collision-resistant receipts; no imported or higher-revision state
  may erase, skip, duplicate or fabricate that correlation. Multi-tab writer
  handoff must refresh before gaining authority.
- Integration commits: achievement facade candidate `e425747`; Profile/Runtime
  remediation and independent re-audit pending.

## Revision 46 — Plinko trampoline ascent

- Affected interfaces: Plinko event phases/telemetry, event physics controller,
  tracked camera, selected-Flipper rendering, timing tests and reduced-motion
  representation. Slot order and rules-owned rewards are unchanged.
- Old behavior: a qualified gesture entered the tall peg board directly.
- New behavior: Plinko first turns the launch surface into a visibly deforming
  trampoline. The selected object compresses and springs physically upward;
  the camera follows it continuously through the apex, reveals the first board
  rows below, and hands the same body into the 24-row descent. There is no
  bottle substitution, teleport, camera cut, scripted delay or favorable-slot
  steering.
- Timing migration: `transportMs` measures qualified release through board
  entry. The contracted 10–15-second normal band and 12-second median apply to
  `dropMs` from first-row downward entry to stable slot verdict, so the new
  ascent does not shorten the requested visible fall.
- Required tests: compression depth/rebound impulse, positive ascent/apex/
  downward entry, camera continuity, object/variant/collider identity, internal
  dynamics, distribution neutrality, deterministic replay, resize, reduced
  motion, anti-wedge boundaries and exact cleanup.
- Integration commit: pending the isolated Plinko event pass and independent
  simulation review.

## Revision 44 — strict seed and Alien lifecycle hardening

- Affected interfaces: public Physics seed entry points, `CpuLaunchIntentV1`,
  direct event cleanup, Alien bank telemetry, replay/resize qualification and
  CPU calibration methodology.
- New behavior in `e599ce6`: explicit seeds must be primitive uint32 numbers;
  valid zero and maximum seeds remain exact, while an omitted human seed still
  requests local randomness. Alien cleanup immediately clears bank counts,
  step ticks, pending contacts, cooldowns and trace data, and restores the
  temporary Invasion profile before a next shot or replay.
- Independent verification passes hostile seed types, RNG endpoints, same-
  engine next-shot isolation, fresh-engine replay parity, in-flight deferred
  resize, human-trajectory isolation, native/Invasion equality and six-
  viewport Alien calibration. V112-057 and V112-058 are closed.
- CPU calibration uses distributed non-prefix seed streams. The phone Hard and
  portrait-tablet Easy corrections are isolated to CPU intent; player physics,
  the target ring and tractor field do not change. Holdout results are stable,
  but one frozen 4K Hard corpus remains 59.2 percent against the literal
  60-percent floor.
- No confidence-interval overlap may replace the raw contract band. V112-022
  remains open pending a margin-bearing 4K retune, raw-band assertions and the
  release-scale difficulty-by-direction-by-viewport-by-player-count corpus.

## Revision 45 — V4 progression candidate rejected at adversarial gate

- Candidate `3cbf6718` correctly established an isolated V4 runtime, immediate
  same-store ownership views, full reward descriptors, canonical 51-by-12
  variant identity, exact ephemeral owner-test projection and checksummed V4
  backup shape. Existing authored suites remained green.
- It is not eligible to merge. Independent probes reproduced a disk-visible
  ghost commit after write-then-throw storage; revision-regressing reentrant
  notifications; checksummed claim evidence that suppresses later legitimate
  grants; stale-import reveal resurrection; higher-revision refresh relocking;
  unbounded claim/FC growth; coercive public numeric inputs; and prototype-
  bearing direct setup-helper outputs.
- New tracked defects V112-059 through V112-066 own those failures. The domain
  owner must add every reproduction before resubmission. Checksums provide
  corruption detection, not semantic trust; import is a monotonic merge and
  never accepts evidence capable of blocking a future local reward.
- Owner Test Mode remains exact, case-sensitive and ephemeral. Its policy must
  preserve a registered activity identity and attach non-bypassable Test Data,
  zero-reward and preview-only authority for later coordinator integration.
- Live V3-to-V4 wiring, Customize/reveal rendering and boot insertion remain
  deliberately deferred until the corrected domain passes a second independent
  gate. Candidate code remains outside the integration branch.

## Revision 46 — shared event-kernel candidate rejected at second adversarial gate

- Candidates `3e9b324` and `76d5ba7` remain outside the integration branch.
  Their authored suites, syntax checks, regression suite and 49 inherited node
  tests pass, and the second candidate closes the first audit's settling,
  cleanup, resource, contact, resize, schema and Team-mapping defects.
- Independent probes nevertheless found nine release blockers, tracked as
  V112-067 through V112-075. Structural capability lookalikes can authorize a
  cloned outcome; a genuine outcome can be consumed by unrelated adapters;
  format and public checksum identities are not bound to live rules state;
  launch claims collide; and render callbacks can omit or mutate physics while
  advancing the gameplay RNG stream.
- High-value results are also not authoritative yet. Identical Plinko geometry
  can report Lives Doubled or Automatic Win, identical Roulette geometry can
  report 1x or 4x, and Classic/Cup Plinko terminal metadata does not produce a
  real terminal transition through `v112-rules`. The Plinko fact schema omits
  its contracted clean-tail, recovery and no-contest lifecycle.
- Required authority chain: rules-owned namespace and immutable format →
  branded lane capability → branded one-use selection → unique launch
  claim → collider-derived evidence → claim-bound outcome → atomic
  root-level consume with the live `ResolutionIdentityV1` high-water.
- The fixed FNV token remains corruption detection only, never proof of
  issuance. Trusted coordinator ownership is an application boundary; callers
  without the genuine root capability must be distinguishable and rejected.
- Rendering receives one collider-derived mechanics frame. Reduced-motion
  presentation is derived without a second gameplay callback, and visual RNG
  cannot advance physics RNG. Because arbitrary JavaScript closures cannot be
  sandboxed by source inspection, event packs remain authored/trusted modules
  and require deterministic replay plus lint/qualification evidence.
- No hazard, wildcard or assist pack may begin integration until the corrected
  kernel and explicit Classic/Cup/Team terminal-event path pass a third
  independent adversarial audit.

## Revision 47 — exact progression candidate rejected at second adversarial gate

- Candidates `3cbf6718` and `951ca52` remain outside the integration branch.
  The separate Activity/Story reservation wiring at `42cc54b` is also held even
  though its focused and inherited suites pass; it cannot be trusted until the
  profile authority underneath it is accepted.
- The second independent audit confirms that notification ordering, ordinary
  monotonic refresh, consumed-reveal identity, sequential exact retention,
  unsafe-key rejection and wrapper-only Owner Test behavior were repaired.
  Those passes do not override the remaining release blockers.
- V112-059 and V112-061 remain open. A write that stores the candidate and then
  throws can still leave a ghost reward after a failed rollback, while imported
  achievement or rival claim evidence can suppress the corresponding genuine
  reward without carrying its value.
- New defects V112-076 through V112-081 record the additional findings: Store
  purchases create an invalid dual reveal namespace; Rival Board reservations
  can receive ordinary rewards; concurrent writers can issue the same ordinal
  and diverge at one revision; public reward mutators bypass gameplay and Owner
  Test; conflicting reservations leak their bearer token; and unbounded clone
  or array inputs can exhaust the stack or memory.
- Production progression will use one lifetime-held exclusive Web Lock per
  origin. The acquired writer capability is private and branded; a busy or
  unsupported environment remains explicitly read-only for progression rather
  than falling back to a racy localStorage lease. An in-realm storage mutex and
  equal-revision divergence poisoning remain defense-in-depth.
- Achievement rarity must come from the canonical 120-ID catalog, never a
  caller string. Story/rival/achievement rewards require coordinator-bound
  evidence. Raw/default reward mutators are not part of the browser-facing
  profile surface. Reservation activity is immutable, so Rival Board can never
  earn ordinary match FXP or FC.
- The owner must add each independent reproduction before resubmission. A clean
  third audit must cover persistence uncertainty and restart, canonical Store
  round-trips, hostile imports, cross-context writer exclusion, authority
  forgery, Owner Test bypass attempts, exact schemas and bounded traversal
  before any progression or Activity/Story commit is eligible to merge.

## Revision 48 — distributed CPU candidate rejected by unseen corpus

- Candidate `ce41470` remains outside integration. Compatibility, primary 960,
  named holdout 960, aggregate bands, tier ordering and Classic direction cells
  passed, but those authored corpora were not independent after tuning.
- A third disjoint 960-seed corpus contained no overlaps with either named set
  and found two raw directional failures: Native Alien Easy/right at
  1920x1080 was 142/484 (29.34%, below 30%), and Hard/right at 3840x2160 was
  294/494 (59.51%, below 60%). V112-022 therefore remains open.
- Remediation must be minimal and physics-based. Qualification restarts with a
  fourth unseen corpus and ultimately >=10,000 physical shots per direction,
  viewport, difficulty and enumerated player-count cell. Aggregate success may
  not hide a failing directional cell.

## Revision 49 — rules-owned event remediation integrated

- The complete event authority chain is integrated through `61f88c5` after the
  rejected `3e9b324`/`76d5ba7` foundations were rewritten and retested.
  V112-067 through V112-075 now have passing local reproductions; an independent
  post-integration audit is still required before physical event packs may ship.
- The root is Rules-owned and format-bound. Runtime, renderer, selection, launch,
  frame, outcome and terminal evidence use identity-bearing private brands;
  one live high-water transition consumes one claim. Geometry/sensors derive
  Roulette and Plinko results, and rendering cannot advance gameplay RNG.
- Plinko now represents clean 9–18-second drops, recovery beginning at 22
  seconds, and a 30-second same-turn no-contest. Classic, Cup and Team terminal
  paths are explicit. Cup Automatic Loss deterministically awards the heat to
  the next surviving seat in configured rotation; this is now frozen in the
  contract.
- Integrator review found and fixed three additional authority defects:
  V112-082 hid the Rules event capability behind a one-shot handoff; V112-083
  made duplicate deferred outputs inert; V112-084 prevents ordinary live flips
  from supplying event rewards, raw points or forced elimination.
- Candidate evidence: event-kernel adversarial suite, complete Rules suite,
  fourteen subsystem/regression scripts, 49 inherited Node tests, syntax/static
  checks, Alien calibration and the legacy physical CPU calibration all pass.
- Two downstream gates remain explicit: V112-085 requires crash-safe Mirror
  obligation persistence, and V112-086 requires a branded settled
  `LandingVerdict` at the ordinary physics-to-rules boundary.

## Revision 50 — browser authority candidates rejected at independent gate

- Independent review rejected progression candidate `d9f97de` despite all
  focused suites passing. Public `refresh` and mutation/import results can leak
  the active match bearer; notification projection can publish an impossible
  reservation frontier; an unrelated stale token can be mislabeled as the
  consumed receipt; queued Web Locks are not aborted on close; integration
  metadata is only shallow-frozen; and Profile/Runtime still misclassify a
  browser `module` shim as CommonJS. These are V112-094, V112-095 and
  V112-103 through V112-106. The candidate remains outside integration.
- Independent review also rejected Rules candidate `679532d` as a complete
  browser-authority fix. It prevents replacement of a genuinely installed
  Rules object, but a frozen schema-shaped EventKernel preseed can still capture
  the private match capability and force a real terminal Plinko result. A
  frozen Rules preseed can likewise survive a fail-closed load and be consumed
  by another classic script. These are V112-101 and V112-102.
- Separate classic-script globals cannot authenticate one another in an
  attacker-controlled JavaScript realm. The interim browser entries for Rules,
  EventKernel, Activity, Battle and their privileged adapters will therefore be
  inert, deeply frozen facades with `liveAvailable:false`. Trusted CommonJS
  implementations remain private until one generated browser artifact composes
  them inside a lexical closure.
- The future composition must retain the active match adapter and accept only
  its one-use branded terminal outcome. Caller-authored rules state, frozen
  schema lookalikes, pure public converters and ambient globals cannot select a
  winner or receive reward authority.
- Candidate evidence remains valuable but does not close a gate: Rules,
  Activity, event-contract, Profile, Runtime, Story, backup, migration and
  regression suites pass. New browser-authority tests must cover fake
  module/process shims, immutable preseeds, load-order permutations, continued
  loading after an earlier script throws, and replacement before/after trusted
  composition.

## Revision 51 — Alien events require authored zero-gravity variants

- A playtest report says Alien-mode special events are weak. The current v1.12
  selector also blanket-suppresses events whenever `physicsModeId` is `alien`;
  neither behavior is acceptable for free-play Alien.
- Free-play Alien now uses Normal event odds and the exact `Mr. Howe` boost.
  Veyr's native Story encounter continues to suppress nested events. This is an
  explicit activity exception, not a global Alien-mode shortcut.
- `AlienEventAdapterV1` is required for all 30 event IDs. Normal behavior is a
  zero-gravity physical adaptation that retains the visible UFO arena and the
  bank-then-ring goal. Self-contained events own their temporary goal and must
  restore Alien physics, UFOs, camera and Flipper dynamics exactly on cleanup.
- Redundant combinations receive authored mechanics rather than a cosmetic
  rename: moving UFO swarm, rotating gravity tide, ice rail, oscillating walls,
  spring wall and plasma jets cover Alien Invasion, Moon Gravity, Ice Slide,
  Earthquake, Trampoline and Wind Tunnel respectively.
- V112-107 remains open until a specialist reviews and implements each event
  individually, matched physical simulations prove hazards are harder rather
  than easier, and visual/device evidence shows an unmistakable effect without
  hiding the Flipper or tractor ring.

## Revision 52 — local release-control dashboard

- Added a coordinator-owned `FlipgameReleaseStatusV1` manifest and a local-only
  release-control dashboard. It reports the integration SHA, commits since the
  immutable v1.11 baseline, dirty worktrees, branch divergence, contract
  revision, defect-ledger dispositions, delivery waves, gates, recent commits,
  and a curated smoke suite.
- The page polls repository state every four seconds. Smoke checks rerun after
  the integration SHA changes and on a bounded five-minute fallback; users may
  also request an immediate run.
- The server binds only to `127.0.0.1`, uses Node built-ins, and is deliberately
  absent from the game boot graph, service worker, web deploy, and APK. It sends
  a restrictive CSP and renders repository text through safe DOM text nodes.
- Status is conservative: focused test success cannot close an independently
  discovered live-integration or authority defect. `NOT RELEASE READY` remains
  visible until the release gates actually pass and owner approval is recorded.

## Revision 53 — Landing and Profile authority remediations integrated

- Integrated LandingVerdict remediation from `94ba00c` as `791b6ca`. The
  trusted core is CommonJS-only, browser status is a separate inert facade,
  ordinary flips require the exact 4,000 ms limit, Rules issues the one-use
  connector, hostile data structures fail closed, and bounce/recontact resets
  the final stability window without erasing first-contact telemetry.
- Integrated the thirteen-commit Profile/Progression/Activity/Story/Battle
  sequence through remediation `a4af8bb` as integration commit `df6b51b`.
  Public projections recursively redact every match bearer; exact receipts bind
  their private bearer and reservation time; queued Web Lock shutdown aborts;
  notification cursors reconcile; and owner-test integration metadata is
  recursively frozen.
- Story's private finalization reader now accepts legacy six-field
  `MatchReceiptV1` records or the new paired `bearerNonce`/`reservedAt` fields.
  It validates the pair, discards it at the Story boundary, and persists only
  immutable match/activity/ordinal/disposition evidence. Partial or malformed
  pairs fail closed.
- Landing, Rules, browser boundary, events, Activity, Profile, Progression,
  backup, achievements, Story, Battle, v1.11 migration, physics and regression
  suites pass after integration. Independent Landing and Profile re-audits are
  still required; passing focused suites do not close their defects.
- Known residuals remain explicit: the Profile receipt window currently fails
  closed after 4,096 records, Android still needs an authoritative writer, and
  the final private browser composition/live gameplay coordinator is not built.

## Revision 54 — Playable presentation and private browser composition

- Integrated Alien event adapters (`70364da`), all 300 new variant names
  (`923cfd2`), and twelve deterministic Easter-egg definitions (`4c5fd59`).
  Their focused tests pass; event/secret renderer integration remains open.
- Integrated private browser composition (`385e195`, checkout normalization
  `245e0a4`). Real Chrome testing exposed the invalid combination of Web Locks
  `ifAvailable` and `signal`; the production request now omits signal for an
  immediate probe and retains cancellation for queued acquisition.
- The browser entry supports ordinary Classic/Practice observations and owns
  finalization. It must not run alongside legacy scoring for the same match.
  Events, airborne terminals and other formats remain explicit adapter work.
- Root's live picker now renders each variant at its exact color, adds a large
  selected preview, and uses authored names without changing legacy names or
  Bottle/T-Rex artwork. Closed mystery reveals clear and hide the old canvas.
- Venue selection moves out of individual customization into its own pre-match
  route. Back discards the draft; Play saves the selected visual venue. The
  ownership source remains legacy until the authoritative V4 UI is connected.
- Desktop and phone browser checks verify the picker and Arena Select to game
  transition. Full art, accessibility, performance and all-mode QA remain open.
- Program Integrator retains main/index/CSS/renderer ownership. Browser agent
  owns passive physics observation seams only; no force/tolerance changes.
  Arena agent owns a new offline preview module. Plinko agent owns its kernel.
- Nothing deployed; public v1.11 remains unchanged. These are development
  improvements, not a release-candidate declaration.

## Revision 55 — Measured deadline verdict and offline integration

- Affected interfaces: engine observation, PhysicsCompositionDriverV1,
  LandingPhysicsLane, private browser entry. Old behavior: the private bridge
  rejected a real engine upright/cap make at the four-second deadline because
  its only deadline path was MISS-only. New behavior: separate private
  `issueDeadlineVerdict` consumes frozen on-plane/completed-rotation evidence
  captured by the existing engine verdict. True timeout remains MISS-only;
  airborne-before-contact terminals remain an explicit unfinished adapter.
- Migration: no save or reward migration and no changes to ordinary input,
  force, plane tolerance or rotation thresholds. The driver forwards the
  existing physical classification and does not independently judge or step.
- Tests: deadline upright/cap make, off-plane/underrotation rejection,
  bounce/recontact absolute clock, same-step observation, Practice exclusion,
  real engine/browser and observer parity at 30/60/120 Hz. Owner acknowledged
  the exact interface before implementation; integrated driver `e6fb869` and
  deadline reconciliation `3a3e9c8`.
- Online removal integrated `e059af5`: lobby, query enabling, peer turns,
  reconnection snapshots and remote verdict code removed, as are the two
  transport source files. Original transport tests are retained as disabled
  historical fixtures; active replacements retain platform, Android and all
  thirty physical event regression checks (`0aa3284`). Root removes boot/cache
  references and updates obsolete mixed UI/CPU assertions, retaining local
  lifecycle, Mirror Match, input and renderer coverage. Deleted source remains
  recoverable through Git. No public deployment occurs.
- Canonical Plinko kernel remediation integrated `9a6b475`. Real Matter adapter
  and measured timing tests are now assigned to its owner. Passing kernel
  tests does not close the live eight-row/circle defect.

## Revision 56 — Safe Globe and HUD composition checkpoints

- Integrated a pure, immutable Rules-to-HUD projection (`6928d43`). It projects
  the resolving actor during results and the authoritative next actor afterward
  without advancing turns, scoring, or writing progression. It deliberately
  leaves unmeasured perfect-landings and unavailable Practice streak totals
  unknown instead of inventing data.
- Integrated the lazy, bundled Desk Globe sphere (`22b1676`) and its staged
  boot/offline registration (`946635d`). The illustrated stand remains in the
  existing art pack; only the sphere renders the rotating bundled geography.
  The service makes no remote request, attempts a bounded WebGL surface once,
  and falls back to Canvas on loss or failure. A Globe Easter focus can share
  the same surface, but is not wired into the live result camera yet.
- The local build, Globe lifecycle suite, service-worker cache suite, HUD
  projection suite, and browser composition identity check pass. These commits
  are development integration only; they do not authorize deployment.
- The standalone Matter Plinko checkpoint `47ad2b7` is stored on the
  integration branch as an unbooted, non-authoritative module only. It still
  needs a measured physical-duration corpus, all-slot reachability,
  recovery/directive adversarial tests, and real runtime coupling before it can
  replace the old live board.

## Revision 57 — Live Globe focus handoff

- The qualifying Desk Globe Easter presentation now captures the already
  painted real-sphere orientation after a committed make and passes it to the
  existing screen-space inset on each result frame (`9f88b9b`). The focus uses
  the same bounded shared surface and the point is selected on the currently
  visible hemisphere.
- This is presentation-only: it adds no second chance roll, does not advance
  gameplay RNG, cannot alter camera ownership, and never changes a result,
  event, reward, or physics state. If the sphere is unavailable, the visual
  cue is silently omitted instead of falling back to a fake map.
- Regression, Easter registry/presentation/live-bridge, Globe lifecycle, and
  fresh local-browser boot checks pass.

## Revision 58 — Plinko preserved-collider qualification finding

- A first 60 Hz Matter qualification corpus was run against the standalone
  adapter using a Bottle-scale compound body rather than the old generic
  circle. It revealed a release-blocking contact issue: the compound can span
  and rest on the 9px upper pegs, reaching no-contest even after the bounded
  recovery impulses.
- This is not being hidden with stronger scripted pushes, artificial slot
  selection, or a time-based verdict. The required remediation is a physical
  contact-geometry design that preserves the selected Flipper while allowing a
  fair descent; it will need its own calibrated all-slot/timing corpus before
  live wiring.

## Revision 59 — Plinko contact chassis and measured anti-balance

- The standalone Matter adapter now keeps the selected compound Flipper in the
  world, with its authored parts and internal dynamics intact, while tethering
  one identical 42x54 rounded physical contact chassis inside it for the peg
  descent. The selected body's ordinary collision mask is restored exactly and
  the chassis/constraint are removed on cleanup.
- Plinko pegs use subtly faceted collision faces to avoid a mathematically
  perfect circular crown. If the chassis nevertheless records 45 consecutive
  near-motionless ticks on upper field geometry, a short deterministic force
  burst dislodges it. The burst acts on velocity through Matter, points inward
  only near rails, cannot encode a destination slot, and is bounded.
- A real 60 Hz corpus of 81 Bottle-scale compound runs resolves 81/81, reaches
  every one of the nine slots, has a 12.783-second median board drop and a
  7.983–17.383-second observed range, replays deterministically, and preserves
  the selected body while removing every event resource. Kernel, event
  contract, local event/UI and baseline regression suites pass.
- This qualifies the isolated adapter design only. Defect V112-111 remains
  open until the old live eight-row/circle path is replaced and browser/camera
  qualification passes.

## Revision 60 — Championship refrain is a heckle, not a civic slogan

- Trigger: the product owner rejected **Ten lives. Every one public.** as
  sounding generated and too solemn for Flipgame.
- New behavior: the official WFC Standard refrain is **Ten lives. Everybody
  saw that.** Flavor only. Lives, stake, scoring, and format rules are
  unchanged. The line is the thing a table yells after a miss, reused as the
  championship slogan.
- Surfaces: `Urth.canon.refrain`, Story broadcast cards, First Flip Tour,
  Home figcaption, and authored arena posters.
- Migration: none. No save, reward, physics, or identity change.
- Required tests: Story broadcast-card copy stays deterministic and reads the
  new refrain; browser bundle is regenerated from source.

## Revision 61 — Owner picked the yeet refrain

- Trigger: after Revision 60, the product owner chose **Try not to yeet it**
  over **Everybody saw that.**
- New behavior: the official WFC Standard refrain is **Ten lives. Try not to
  yeet it.** Flavor only. Same surfaces and no rule change.
- Migration: none.
- Required tests: Story broadcast-card copy stays deterministic and reads the
  yeet refrain; browser bundle is regenerated from source.

## Revision 62 — Journey authority and live private session host

- Trigger: recovery handover required the interrupted journey-authority slice
  to be repaired, then real `main.js` launches connected to one private
  application without parallel reward writers.
- New behavior: the browser application accepts Classic, Cup, and Team Clash,
  plus Normal/Insane/Alien physics. Story, Tutorial, and Battle are advertised
  as supported application routes. Live `main.js` attaches the physics driver
  and calls `FlipgameV112.beginSession` for ordinary matches; Records and
  Achievements writers are skipped while that session owns rewards. Arena
  Select and the achievement gallery consume the canonical v1.12 providers.
- Migration: none. Release identity stays v1.11/111 until a later approved
  candidate.
- Required tests: journey-authority application suite; release-gap
  qualification except the deliberate identity bump; existing composition and
  authority-boundary suites.
## Revision 63 — Battle plays on the live table

- Trigger: the Battle route, rules, runtime and private reward authority all
  existed, but nothing in the page ever launched a bottle, so Battle announced
  itself as unconnected.
- New behavior: three authorities compose without overlapping. The lane runtime
  plays the series in the page, because only the page owns pointers, lanes and
  physics. `js/v112-battle-host.js` carries one reservation from setup to reward
  and satisfies `FlipgameV112BattleHostV1`. The private composition reserves the
  match and rejects any submitted series whose scores, heat wins, winner or
  launch leases do not follow from its own attempt ledger. `js/main.js` supplies
  the lane adapter: it borrows the one physics surface this build has — the real
  table, the real bottle, the real collider — launches only what the runtime
  hands it, and reports only the pose the collider settled into. It never
  chooses a player, a score or a winner. Ordinary random events stay disabled;
  a stored power card is the only event a Battle flick can run.
- Presentation: the game canvas paints under a transparent Battle screen, the
  Battle stage spans the viewport and takes every flick, the canvas itself stops
  listening, and the live scoreboard collapses into a strip so the table keeps
  the lower half of the glass.
- Migration: none. Release identity stays v1.11/111.
- Required tests: Battle host, Battle authority, Battle runtime/routes/outcome
  suites; boot and service-worker precache agreement; the six-viewport Battle
  roster browser suite; and `scripts/v112-battle-live-lane-browser-tests.js`,
  which flicks the real stage in Chromium and requires the shipping bottle to
  move, the relay to advance, the table to be set for whoever is next, and
  leaving to award nothing.
