# Flipgame v111 Integration Log

## Revision 1 - contract freeze

- Baseline commit: `3a3ace0`
- Baseline regression tests: pass
- Baseline version tests: pass (`v110`)
- Baseline service-worker tests: pass
- Integration branch: `codex/v111-integration`
- Concurrency: Program Integrator plus at most three specialists
- Work policy: isolated worktrees, exclusive ownership, coordinator-only merge
- Current contract: `docs/v111-contract.md`, revision 1

No implementation deviations are approved. Specialists must report proposed
interface or behavior changes to the Program Integrator before proceeding.

## Revision 2 - canonical art/physics mapping

- Trigger: the Art Platform specialist found that revision 1 named
  `RenderVariant` without freezing its exact SVG-to-world pivot.
- Old contract: integration layer chose the mapping.
- New contract: viewBox `300 x 420`, SVG ground `376`, art scale `0.74`, local
  contact `+39`, shared SVG pivot `{150, 323.297297...}`.
- Migration: Coffee Mug reference and all Wave 2 art must use the shared pivot.
- Tests: assert pivot/baseline mapping for every object and variant.
- Affected owners: Art Platform, all three Art Production agents, UI/Renderer.

## Revision 3 - canonical content IDs

- Trigger: Wave 1 review found the art registry using kebab-case while the data
  manifest used underscore IDs for the same new objects and variants.
- Old contract: stable IDs were required but their spelling convention was not
  explicit.
- New contract: all new object/variant IDs use lowercase kebab-case end to end;
  persisted variant IDs are `<object-id>.<variant-id>`.
- Migration: no released build contains these new IDs, so Wave 1 normalizes the
  manifest before integration. Display label `Piñata` keeps its accent.
- Tests: manifest/art ID parity and canonical-ID regex are mandatory.
- Affected owners: Object Manifest, Art Platform, Art Production, Progression,
  Stats, and UI/Renderer.

## Wave 1 integrated

- Art platform/reference: integration commit `2d613ed`, corrected by `da2550e`.
- Object/variant manifest: integration commit `2ebff10`, corrected by `174e548`.
- Smartboard UX specification: integration commit `74bedb9`.
- Gates: art-platform, 25/300 manifest, baseline regression, version, and
  service-worker tests pass.

## Wave 2 integrated

- Art Pack A (objects 1-8): `f8fddb5`, 96 canonical variants.
- Art Pack B (objects 9-16): `91400d0`, 96 canonical variants.
- Art Pack C (objects 17-25): `f8b8456`, 108 canonical variants.
- Gates: all 300 variants pass ID parity, lazy-build, mapping, nonblank paint,
  reduced-motion, source-safety, and baseline regression checks.
- Visual screenshot inspection remains assigned to independent browser QA.

## Wave 3 integrated

- Architecture seams: `5970204`.
- Added versioned interfaces, runtime/outcome hub, mode adapters, stats/name
  install points, lifecycle bridge, and verified lazy art catalog.
- Shared edits were limited to loader ordering and passive `main.js` hooks.
- Gates: all nine Node suites and localhost Start Game smoke pass.
- Release action: coordinator must precache all v111 runtime/art scripts when
  the final service-worker cache key is bumped.

## Revision 4 - mode edge cases and adapters

- Trigger: Rules/Modes found undefined multiplayer Cup ties, an unnamed Arena
  Draft pool, and incomplete Team event scoring.
- Cup: after three tied regulation heats, tied leaders use an events-disabled
  one-flip-per-player shootout until exactly one makes; opener rotates.
- Arena Draft pool: Crosswind, Moon Gravity, Gravity Slam, Spring Table, Slick
  Table, all reward-free and symmetrical for the entire heat.
- Team: exact event raw-score adapters are now frozen in the contract.
- Physics metadata required by Rules/UI: canonical event ID, cap flag, Plinko
  prize, Mitosis landed count, Roulette multiplier/slot, automatic outcome.
- Affected owners notified: Physics/Events and Rules/Modes.

## Revision 5 - Mirror copy isolation

- Trigger: Rules/Modes found ambiguity over whether Team Mirror should copy an
  event-adjusted score or side effect.
- Decision: Mirror copies physical input/profile only; copied flips have events
  disabled and score base 1/0 in Team. Rewards and side effects never nest.
- Affected owner notified: Rules/Modes. UI/Renderer must pass copied launch
  metadata while suppressing event selection.

## Revision 6 - deterministic mode event exclusions

- Trigger: UI integration found that Rules/Modes exposed Team Life Drain
  exclusion and Cup shootout event suppression without a physics roll input.
- Old interface: event selection accepted only mode, odds profile, and seed.
- New interface: `EventRegistry.roll` and the final optional policy argument of
  `Physics.applyFlick` accept `excludedEventIds`. Definitions are filtered
  before the single deterministic roll; there is no reroll. Disabled modes
  suppress forced events too.
- Migration: UI passes the mode adapter's exclusions in the final policy
  argument and uses event mode `disabled` for Cup shootouts.
- Tests: direct registry exclusions, all-events exclusion, forced Life Drain
  exclusion, and forced Plinko suppression in disabled mode.
- Affected owners notified: Physics/Events, Rules/Modes, UI/Renderer.

## Revision 7 - reconnect state convergence

- Trigger: Network/Platform found that protocol reconnection alone cannot
  recover lives and turn order after missed accepted flips.
- Old behavior: a reconnect could resume after transport identity validation
  without an authoritative gameplay snapshot.
- New behavior: UI binds JSON-safe capture/restore callbacks with
  `Net.bindMatchState({ capture, restore })`. The host sends a targeted opaque
  snapshot, the peer restores it before `resumed`, and play remains blocked
  with `resume-state-missing` when authoritative state is unavailable.
- Snapshot scope: roster/lives/elimination/order, current state/seat/turn,
  stake, ON FIRE, sudden death, selected settings, and active mode state. DOM,
  canvas, and physics bodies are excluded.
- Affected owners notified: Network/Platform and UI/Renderer.

## Revision 8 - detached full statistics payload

- Trigger: Stats/UI integration found that the lifecycle bridge's fixed
  payload omitted dimensions required by `FlipRecordV1` and `MatchRecordV1`.
- New behavior: flip and match resolution bridge calls preserve a detached,
  opaque `record` object on the versioned outcome. The Stats store consumes it
  asynchronously; gameplay code cannot read it back or be blocked by writes.
- Migration: UI emits the complete per-flip and per-match fields in `record`;
  Stats normalizes, stores, aggregates, filters, and exports them.
- Tests: nested mutation after emission cannot alter the observed record.
- Affected owners notified: Architecture/Refactor, UI/Renderer, Stats/Name Safety.

## Revision 9 - deterministic Arena Draft offers

- Trigger: Wave 5 UI review found the five physics profiles existed but there
  was no three-choice between-heat draft boundary.
- New behavior: each non-final regulation Cup heat produces an immutable,
  save-safe `ArenaDraftOfferV1` containing exactly three distinct choices from
  the frozen symmetric pool. An explicit draft seed plus Cup state determines
  the offer without touching gameplay/event RNG.
- Migration: UI renders only `cupState.arenaDraft.choices` and submits the
  selected ID as `arenaDraftSelectionId`; arbitrary `arenaProfileId` values are
  rejected between heats. No draft/profile survives into a shootout.
- Tests: all player counts/Cup lengths, replay/reconnect, forged/stale offers,
  exact choice count/pool membership, and RNG isolation.
- Affected owners notified: Rules/Modes and UI/Renderer.

## Revision 10 - exact achievement catalog restoration

- Trigger: integration review found the 70 added achievement definitions did
  not match the frozen Classic, Cup, Team, collection, and Lab/stat list.
- New behavior: the 30 legacy IDs remain intact and the other 70 now match the
  contract exactly: 30 event, 10 Classic, 8 Cup, 8 Team, 8 collection, and 6
  Lab/stat achievements.
- Eligibility: ordinary Practice/Lab/forced/test/AI-only outcomes remain
  excluded. Only the two explicit Lab actions can qualify in advanced Lab,
  without awarding progression.
- Tests: exact IDs/counts, every matcher, legacy migration, eligibility,
  lock-only secrecy, and RNG isolation.
- Affected owners notified: Progression/Achievements and UI/Renderer.

## Revision 11 - rules-owned rematch proposals

- Trigger: UI review found tested Cup/Team rematch rotation helpers were not
  reachable through the normalized mode adapter boundary.
- New behavior: Cup snapshots include immutable `newCupOptions`; Team snapshots
  include immutable `rematchOptions` and `swapTeamOptions`.
- Migration: UI merges the selected proposal rather than deriving opener,
  team, or teammate offsets. This preserves fair rematch rotation for every
  supported player count.
- Tests: adapter snapshot immutability and exact proposed openers/offsets.
- Affected owners notified: Rules/Modes and UI/Renderer.

## Revision 12 - persistent Mirror Match queue

- Trigger: integration review found the event's visual clone did not schedule
  opponents' later turns or survive reconnect.
- New behavior: a resolved Mirror source, whether MAKE or MISS, arms one copied
  flip for every other active opponent. Each target receives the same normalized
  launch vector, spin, seed, and JSON-safe physics profile exactly once.
- Isolation: copied flips disable events, rewards, side effects, and nesting;
  they resolve from their own base landing verdict. Eliminated targets are
  skipped without reordering the remaining queue.
- Migration: UI claims the queued launch at turn start, consumes it only after
  final MAKE/MISS, synchronizes eliminations, and includes the opaque snapshot
  in save/reconnect state.
- Tests: 12 deterministic cases cover 2-8 players, order independence,
  idempotent claims, reconnect, elimination, cleanup, malformed snapshots, and
  zero RNG use.
- Integration commit: `1fbd493`.
- Affected owner notified: UI/Renderer.

## Revision 13 - physical event resolution metadata

- Trigger: event-by-event audit found several effects had presentation labels
  but lacked the full physical resolution required by the product contract.
- New behavior: Rewind is failure-triggered and resolves only its replay;
  Portal conserves speed/spin across a rotated exit; Ceiling uses the inverted
  plane; Fizz has a rotating-axis jet and detached cap; Half Full shifts center
  of mass; Tether uses a constraint and low-point release; Mitosis and Cap Toss
  resolve independent bodies; Roulette derives its sector from physical landing
  position and wheel angle. Ice, Bouncy, Trampoline, and Meteor now wait for
  their event-specific settlement paths.
- Interface: existing rules/reward fields are unchanged. Optional JSON-safe
  render/result metadata exposes physical phase and body outcomes.
- Tests: expanded deterministic physics suite plus every previously integrated
  suite and all 30 rules/modes cases pass.
- Integration commit: `357caf7`.
- Affected owners notified: Physics/Events and UI/Renderer.

## Revision 14 - signed Android storage parity and release shell

- Trigger: release preflight found ephemeral debug signing, missing WebView
  document transfer, incomplete precaching, and split v110/v111 identifiers.
- Android: trusted local file inputs use `ACTION_OPEN_DOCUMENT`; bounded Blob
  exports use a chunked native bridge and `ACTION_CREATE_DOCUMENT`. Content URIs,
  cancellation, lifecycle cleanup, and Internet permission are covered without
  broad storage permissions.
- Signing: one protected persistent PKCS12 key is stored in four repository
  Actions secrets and decoded only in the ephemeral runner. The workflow builds
  `assembleRelease`, verifies its certificate, package version, embedded source
  commit, and SHA-256, then publishes immutable `v111` plus `apk-latest`.
- Web: badge/query/cache/Android identifiers are unified at v111/111/1.1.1;
  critical PWA precaching is atomic and includes the complete runtime graph.
- Cleanup: retired generated raster skins and the public threshold-leaking roster
  gallery are removed. Maintainer/install documentation now reflects v111.
- Tests: Android storage, release inventory, atomic cache failure, exact version,
  UI load order, and all prior suites pass on the candidate.
- Integration commits: `75b353c`, `c399091`, plus coordinator release commit.
- Affected owners notified: Android Platform, UI/Renderer, Release Engineering.

## Wave 5 integrated

- Responsive UI/Renderer, full Stats Lab surface, safe names, local records,
  online protocol hardening, platform lifecycle, Mirror runtime, Physics Lab,
  cosmetics/arenas, and Android document parity are integrated.
- UI focused suite: 13 cases. Mirror queue: 12 cases. Android storage and network
  platform suites pass. Full candidate gate: all 16 script suites and 43 Node
  test cases pass before independent QA.

## Revision 15 - blocked-name feedback reset

- Trigger: coordinator browser smoke found the generic blocked-name alert stayed
  active after the player replaced the value with a safe name.
- New behavior: editing a highlighted local name clears only the stale inline and
  assertive error presentation. Match start still runs the shared NamePolicy and
  blocks any invalid replacement.
- Migration/interface: none.
- Tests: browser reproduction plus full UI/name/release gates must rerun.
- Affected owners notified: all three active independent QA specialists; their
  audit baseline advances to the new candidate commit.

## Revision 16 - independent QA rejection and corrective wave

- Trigger: Simulation, State/Data, and Browser/Release QA rejected candidate
  `58b623b6ccd5a9c1f24fa6f373c48e14c3262f47` with reproducible P1/P2 defects.
- Release state: deployment is frozen. Revision 15 is not release-eligible.
- Clarifications: forced-event status is match-latched; stats retention uses
  bounded aggregate dimensions; NamePolicy guards every data boundary; online
  stays inaccessible without identity authentication; Practice event-name
  forcing is complete and Practice-only; Cup Plinko resolves the current heat
  and permanent magnet survives heat resets.
- Corrective ownership: Physics/Events owns only physics and registry files;
  State/Data/Safety owns stats, names, records, and protocol files; UI/Rules
  owns main/game/modes/progression/styles. Each owner adds adversarial tests in
  its own suite and reports any required cross-owner interface change.
- Required test changes: add the exact QA repros for event makeability, Mirror
  collision isolation, Golden duplication, Cup Plinko, event weighting, Alien
  viewport calibration, bounded rollups, session Test Data, all NamePolicy
  boundaries/evasions, online identity, save backup, achievement wiring,
  secrecy, Stats Lab completeness, touch sizes, and input activation.
- Integration commits: `f57de17`, `62c5d1b`, `4136ded`, `ab922f6`, and
  `8212984`.
- Affected owners notified: Physics/Events, State/Data/Safety, UI/Rules, and all
  three independent QA specialists.

## Revision 17 - corrective data boundary interfaces

- Trigger: the State/Data corrective owner needed explicit UI boundaries for
  storage degradation, contracted Stats Lab fields, save backups, and the
  unauthenticated online transport.
- Old behavior: fallback failure had no warning interface; summary coverage was
  partial; `.flipgame-save` had no implementation; built-in online envelopes
  treated self-asserted fields as sender identity.
- New behavior: `StatsStore.getWarning()/onWarning()` and the
  `flipgame:stats-warning` event expose `{code,message}`; summary/filter fields
  follow revision 17 of the contract; `FlipgameV111SaveBackup` owns checksummed
  save serialization/import/migration/name sanitization; online is fail-closed
  without an independently authenticated sender adapter.
- Migration action: UI adds a non-blocking warning surface, the missing Stats
  fields/seat filter, save export/import controls and loader, and removes every
  built-in online exposure path.
- Required tests: warning event/display, fallback reload, Stats inventory and
  hidden test names, checksum corruption/migration, name sanitization, and
  online query/transport fail-closed behavior.
- Integration commits: `62c5d1b`, `ab922f6`, and `8212984`.
- Affected owners notified: State/Data/Safety and UI/Rules; UI acknowledged
  revision 17 before integrating the new boundary.

## Revision 18 - calibrated Alien viewport metrics

- Trigger: independent simulation found Alien outcomes varied drastically from
  phone to 4K and were much easier than ordinary Classic flips.
- Old behavior: `alienMetricsForViewport` returned under-calibrated arena
  values and the launch vector was not normalized for the full viewport span.
- New behavior: the existing read-only metrics retain their fields, recalibrate
  ring/attraction/timeout, and add `launchScale` constrained to `0.65..2.7`.
  Tether and Ceiling receive internal event tuning only; registry and outcome
  method signatures remain unchanged.
- Migration action: none for UI; it must not derive or override these metrics.
- Required tests: exact seed 3 phone/4K parity plus deterministic make-rate
  matrices across every required viewport and ordinary-Classic comparison.
- Integration commit: `4136ded`.
- Affected owners notified: Physics/Events and UI/Rules; UI acknowledged and
  confirmed no local Alien overrides.

## Revision 19 - filter-preserving bounded Stats rollups

- Trigger: independent re-verification showed 499 of 500 rolled-up seat-zero
  flips disappeared from a seat filter even though the unfiltered total was
  correct. Other omitted categorical filters had the same defect.
- Old behavior: rollup keys retained only day, mode, object, event, and Test
  Data; filtering by a missing field silently rejected or misclassified old
  observations.
- New behavior: rollup keys retain every bounded categorical filter dimension
  named by revision 19 of the contract. High-entropy measurement/detail fields
  remain excluded, and persistence writes only changed aggregate cells.
- Migration action: legacy narrow rollups remain readable but may contribute
  only when every requested filter can be evaluated without guessing; newly
  pruned records use the full filter-preserving schema.
- Required tests: a one-raw-record/500-flip fixture must return 500 for each
  matching individual filter and representative combined filters; online/CPU
  values must never coerce from missing data; nonmatching filters return zero;
  rollup-cell writes remain bounded to changed cells.
- Integration commit: pending.
- Affected owner notified: State/Data/Safety. Independent State/Data and Browser
  gates must restart after integration; completed Simulation evidence remains
  provisional until the exact candidate is frozen.

## Revision 20 - controller-gated atomic web upgrade

- Trigger: Browser/Release QA reproduced a first-upgrade race where the active
  v110 worker could serve a bare cached v110 `main.js` for the new HTML's
  `main.js?v=111` request when the network failed.
- Old behavior: new HTML immediately requested mutable scripts, then registered
  the new worker after page load; the v110 ignore-search offline fallback could
  therefore mix releases.
- New behavior: index loads one version-unique `v111-boot.js`. On production
  HTTP(S), the boot script registers `service-worker.js?v=111`, waits until that
  exact worker controls the page, and only then loads the ordered v111 runtime.
  Failure loads no application script and presents a retryable update notice.
  Localhost and `file:`/APK execution continue directly.
- Migration action: the boot asset owns loader order and error capture; the
  service worker precaches it and the full runtime; the old late registration
  block is removed from index.
- Required tests: old-controller delayed activation, install failure/no runtime
  load, controller-version verification, complete ordered runtime graph,
  localhost/APK direct boot, and service-worker precache inventory.
- Integration commit: pending.
- Affected owners notified: Release Engineering and Browser/Release QA. Stats
  corrective work is unaffected.

## Revision 21 - one browser-global settings authority

- Trigger: Browser/Release QA proved that the classic `settings.js` script
  declared a lexical `const Settings` without exposing `window.Settings`.
  Guarded setup handlers therefore skipped persistence while unguarded runtime
  reads happened to reach the lexical binding, allowing the UI and renderer to
  disagree after reload.
- Old behavior: Reduce motion and Flick feedback could appear selected in the
  saved setup while their setters were skipped; the renderer could continue
  with the previous preference. Sound and physics-feel paths relied on the
  same accidental split authority.
- New behavior: one browser-global `window.Settings` object owns all four
  preferences. Setup controls, setup restoration, audio, gameplay, and the
  renderer read and update that exact instance. Explicit reduced motion is
  combined with the operating-system preference.
- Migration action: expose the existing settings object without duplicating
  state, remove divergent guarded behavior, and resynchronize the rendered
  setup state immediately after load and after each control change.
- Required tests: classic-script browser-global availability, toggle-to-runtime
  behavior, localStorage persistence and reload for reduced motion and Flick
  feedback, operating-system reduced-motion fallback, plus mute and physics
  feel regression coverage.
- Integration commit: pending.
- Affected owner notified: UI/Renderer. Browser/Release QA must restart its
  settings checks after integration; Stats corrective work is unaffected.
