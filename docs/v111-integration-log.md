# Flipgame v1.11 Integration Log

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
- Web: public badge/release/Android identifiers are unified at v1.11/1.11;
  internal query and Android build identifiers remain 111;
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
- Integration commit: `5637886`.
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
- Integration commits: `eb99a64`, `8a1d3fa`, `9909e95`, and `7e02a8b`.
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
- Integration commit: `06da1c9`.
- Affected owner notified: UI/Renderer. Browser/Release QA must restart its
  settings checks after integration; Stats corrective work is unaffected.

## Revision 22 - offline-safe boot and dependency-free recovery shell

- Trigger: Browser/Release QA rejected the first atomic boot candidate because
  it forced `registration.update()` even under an already-matching controller,
  and because failure to fetch the sole boot script left all body content
  hidden with no code available to expose recovery UI.
- Old behavior: a cold offline reload under the installed v111 worker could
  reject the forced update and refuse to load the cached game. On first upgrade,
  failure of `v111-boot.js` itself could leave a permanently blank screen.
- New behavior: an exact v111 controller is accepted before any registration or
  update request, so its cached release boots offline. The HTML ships an
  initially visible status/retry surface requiring no external CSS or script;
  successful boot removes it and boot failures replace it with the detailed
  recovery message.
- Migration action: short-circuit the controller gate, remove the redundant
  forced update, and make the recovery shell part of versioned HTML.
- Required tests: controlled-v111 cold offline boot with registration/update
  network failure, first-upgrade boot-script fetch failure with visible working
  reload link, ordinary old-controller activation, and no partial runtime.
- Integration commit: `8a1d3fa`.
- Affected owners notified: Release Engineering and Browser/Release QA. UI
  settings and Stats corrective work are unaffected.

## Revision 23 - isolated failure shell and boot-graph gate

- Trigger: Browser/Release QA showed that adding the boot-failed class disabled
  the shell's pre-CSS hiding selector, revealing every raw application screen
  beside the retry notice. The complete integration run also proved that the
  architecture gate still inspected direct index script tags removed by the
  approved atomic loader.
- Old behavior: runtime or controller failure exposed unstyled setup, game,
  Stats, Lab, and game-over markup. The architecture suite falsely failed the
  valid boot graph while no longer checking its actual dependency order.
- New behavior: every application child except the boot status remains hidden
  until boot-ready, regardless of failure state. The architecture gate extracts
  and validates the ordered runtime graph from `v111-boot.js`.
- Migration action: strengthen dependency-free shell CSS and move loader-order
  assertions from removed index tags to the boot asset list.
- Required tests: controller failure, stylesheet/runtime failure and missing
  boot script each expose only the recovery surface; architecture order remains
  interfaces, runtime, art packs, bootstrap, then main.
- Integration commit: `9909e95`.
- Affected owners notified: Release Engineering and Browser/Release QA. Other
  active corrective work is unaffected.

## Revision 24 - authoritative v110 preference migration

- Trigger: integrator review found that v110's failed `window.Settings` guards
  prevented feel, Flick feedback, and reduced-motion setters from running, but
  setup persistence still stored those visible selections. An unrelated mute
  change could write a complete canonical object containing stale defaults.
- Old assumption: an existing canonical field always won over the legacy setup
  copy, which could silently discard the user's visibly saved selections during
  upgrade.
- New behavior: on the one-time v110-to-v111 migration, valid setup values for
  feel, feedback, and reduced motion override those three canonical fields.
  Sound remains canonical. The obsolete setup keys are then removed, making
  subsequent v111 loads canonical-only.
- Migration action: detect the presence of each valid legacy setup preference,
  apply it before cleanup, save the canonical object once, and preserve all
  unrelated setup fields.
- Required tests: a complete stale canonical object plus divergent valid v110
  setup choices migrates the visible choices exactly once; after cleanup,
  subsequent canonical changes survive reload without being overridden.
- Integration commit: `06da1c9`.
- Affected owner notified: the active Settings specialist was paused and given
  the revised precedence before merge. Other active work is unaffected.

## Revision 25 - runtime execution is part of atomic boot

- Trigger: integrator browser probing demonstrated that a dynamically loaded
  script can fire its element `load` event after throwing during execution.
  The first loader candidate displayed recovery but continued the dependency
  graph and eventually added boot-ready.
- Old behavior: a synchronous runtime exception could leave both failure and
  ready states present and execute later modules against a partial runtime.
- New behavior: any global execution error observed before boot-ready is stored
  as the boot failure. The active script rejects on load completion, no later
  script is appended, boot-ready is never added, and the recovery shell remains
  the only visible UI.
- Migration action: propagate pre-ready execution errors through the ordered
  loader promise rather than treating resource delivery as execution success.
- Required tests: inject a synchronous error from a middle runtime script,
  assert the boot promise fails, no later dependency loads, failure remains
  isolated, and boot-ready is absent.
- Integration commit: `7e02a8b`.
- Affected owners notified: Release Engineering and Browser/Release QA. The
  integrated Settings implementation itself is unchanged.

## Revision 26 - hard settle deadlines and exact compact-layout band

- Trigger: exact-candidate Simulation QA found a forced Ice Slide seed resolving
  more than ten seconds after first contact because the six-second check was
  skipped while the object was temporarily ungrounded. Browser/Release QA also
  found Setup and Stats remained single-column at 768px because their column
  breakpoint began at 900px rather than the frozen compact band.
- Old behavior: landing timeout evaluation was nested under grounded contact,
  allowing event relaunch to pause it. Setup/Stats used one column from
  768-899px and the desktop 12-column split began before 1100px.
- New behavior: the event settle deadline is absolute from first scoring-plane
  contact and is evaluated even during a temporary relaunch. Setup and Stats use
  compact two-column composition throughout 768-1099px; the 12-column 7/5
  desktop shell begins only at 1100px.
- Migration action: move deadline handling ahead of grounded-only stability
  checks while preserving each event's verdict logic; split responsive CSS into
  exact compact and desktop bands without changing phone layout.
- Required tests: Ice seed `3668341011` at 360x640 resolves by approximately
  7000ms simulation time; Wind/Moon/ordinary/Bouncy boundaries regress; Setup
  and Stats compute two columns at 768 and 1099, then 12-column/7:5 at 1100, for
  two and eight players with no horizontal overflow.
- Integration commits: `1559761` (responsive UI) and `f9f9250` (physics).
- Affected owners notified: Physics/Events and UI/Renderer. The final candidate
  is rejected; all three independent gates restart after both fixes integrate.

## Revision 27 - native Alien calibration joins the shared viewport profile

- Trigger: continuing Simulation QA proved the temporary Alien Invasion event
  was calibrated but native Alien mode was not. The same 300-shot input corpus
  ranged from 71.0% makes on phone to 52.0% on tablet while Classic remained
  63.0%, a nineteen-point native viewport spread.
- Old behavior: native Alien applied additional layout/profile coupling outside
  the calibrated event path; seed 3 (`vx=-603`, `vy=-951`) made on 360x640 and
  3840x2160 but hit the flight limit on 768x1024.
- New behavior: native Alien and Alien Invasion share calibrated arena, launch,
  ring, attraction, and timeout scaling while retaining native Alien's required
  bank-then-tractor-ring scoring.
- Migration action: remove or normalize the native-only viewport distortion,
  without making object choice affect Alien difficulty or changing event cleanup.
- Required tests: seed 3 has a comparable outcome path at 360x640, 768x1024,
  and 3840x2160; the independent 300-input native corpus has a small viewport
  spread and remains near the 63.0% Classic baseline; temporary Alien Invasion
  calibration continues to pass.
- Integration commit: `f9f9250`.
- Affected owner notified: Physics/Events paused its revision-26 work,
  acknowledged revision 27, received exact seeds, and expanded its isolated test.

## Revision 28 - Wind Tunnel remains a physical skill event

- Trigger: continuing Simulation QA found forced Wind Tunnel made 3,000 of
  3,000 extremely broad deterministic inputs while the ordinary profile made
  668, making Wind a de facto automatic win despite Plinko's exclusive rule.
- Old behavior: launch spin assistance plus continuing alignment/stabilization
  overrode even downward and severely underrotated input; seed 5 (`vx=9594`,
  `vy=+647`) changed from an ordinary underrotated miss into an upright make.
- New behavior: Wind keeps strong visible lateral and rotational gust physics,
  its five-second hard deadline, and valid settled cap scoring, but does not
  guarantee alignment or a make. Both success and failure remain possible.
- Migration action: remove guaranteed stabilization/alignment from the Wind
  profile without reducing its physical/visual impact or changing other events.
- Required tests: exact seeds 5 and 3 remain skill-dependent misses for their
  documented inputs; a broad deterministic Wind corpus contains both makes and
  misses; ordinary and settled-cap regressions pass.
- Integration commit: `f9f9250`.
- Affected owner notified: Physics/Events paused its combined corrective work
  and received the exact corpus evidence before commit.

## Revision 29 - physical assistance cannot normalize arbitrary input

- Trigger: the same continuing 3,000-input QA corpus found Power Launch,
  Trampoline, and Heart Rush also produced 3,000 upright makes each, including
  downward, severely underrotated input.
- Old behavior: event launch/spin/alignment tuning drove all three toward a
  canonical upright pose regardless of player input; seed 5 (`vx=9594`,
  `vy=+647`) became a make in each while ordinary play missed underrotated.
- New behavior: Power's impulse, Trampoline's dramatic return relaunch, and
  Heart's three stabilizing impulses remain extreme and visible but preserve
  skill-dependent failure. Heart rewards only a valid landing and Trampoline
  waits for the return landing.
- Migration action: remove outcome-normalizing assistance from these profiles
  while preserving their distinct physical signatures and settle lifecycles.
- Required tests: seed 5 remains a miss for documented invalid input; each
  broad deterministic corpus includes makes and misses; valid intended-input
  seeds remain playable and event-specific visual/physics metadata persists.
- Integration commit: `f9f9250`.
- Affected owner notified: Physics/Events paused again and is holding its
  isolated commit until QA completes the full non-Plinko corpus.

## Revision 30 - imported snapshots and names are atomic safety boundaries

- Trigger: exact-candidate State/Data QA reproduced three boundary failures. A
  destination imported a two-flip export and then a later 100-flip export from
  the same source but reported only three total flips; checksummed saved setup
  `rows[]` retained a blocked name; and direct Greek, Cherokee, and Cyrillic
  lookalikes bypassed the partial confusable fold.
- Old behavior: every export received a content-derived import partition, an
  existing rollup UUID was treated as a duplicate even when its aggregate had
  grown, and earlier raw records remained when a newer rollup absorbed them.
  Save sanitization did not classify `rows[]` as player context. Name screening
  relied on an incomplete hand-maintained lookalike map.
- New behavior: exports carry a stable source-archive lineage and monotonic
  snapshot identity. A newer snapshot atomically replaces the destination's
  complete prior imported contribution from that same lineage; identical or
  older snapshots are no-ops and independent lineages remain additive. Setup
  rows are sanitized before serialization, parsing, and persistence. The
  deterministic screening skeleton covers direct Greek, Cyrillic, Cherokee,
  full-width, and common modifier lookalikes without transliterating accepted
  display names.
- Migration action: preserve version-1 import compatibility while adding the
  lineage metadata needed for new exports; never partially mutate memory or
  IndexedDB if reconciliation fails. Route setup rows through `NamePolicy` at
  both backup and apply boundaries, and extend the screening-only confusable
  mapping with innocent-name regressions.
- Required tests: import source snapshots at totals 2 then 100 and observe
  exactly 100; re-import the same and then older snapshot without change; import
  two independent sources additively; force backend failure and retain prior
  state. Round-trip a blocked setup row without persisting it. Reject
  `fu\u03f2k`, `f\u13ccck`, and `\u0455\u04bb\u0456t` while retaining ordinary
  accented names, innocent substrings, exact `Mr. Howe`, and every event QA
  name.
- Integration commit: `ab3e270` (revisions 30-32 and 34).
- Affected owner notified: State/Data/Safety. Exact candidate `17b16e1` is
  rejected and deployment remains frozen until correction and all three
  independent gates restart on one new commit.

## Revision 31 - flight duration includes settling

- Trigger: continuing State/Data QA found the live outcome adapter assigns
  first-contact time to both `flightMs` and `firstContactMs`, so device metrics
  silently omit the entire settling interval.
- Old behavior: an 800ms first contact followed by 300ms settling emitted
  `flightMs=800`, `firstContactMs=800`, and `settleMs=300`.
- New behavior: the same lifecycle emits `flightMs=1100`,
  `firstContactMs=800`, and `settleMs=300`; total flight is measured through
  final resolution and the three fields retain distinct meanings.
- Migration action: correct only the outcome instrumentation boundary. Do not
  alter landing timing, physics integration, rules, or previously stored data.
- Required tests: an exact synthetic 800+300ms lifecycle produces 1100/800/300,
  zero-contact and timeout paths remain finite/non-negative, and Stats summary
  averages consume full-flight values.
- Integration commit: `ab3e270`.
- Affected owners notified: UI/Stats instrumentation and State/Data QA.

## Revision 32 - fallback match rollups preserve Stats Lab filters

- Trigger: continuing State/Data QA recorded one filtered Cup match while
  IndexedDB was unavailable. Before reopening, the matching mode/player/seat
  query returned one; after reopening the same fallback store, unfiltered totals
  remained one but the identical filter and an online filter returned zero.
- Old behavior: fallback `aggregateMatches` retained only day, mode, and Test
  Data, so reopening silently discarded every other match-filter dimension.
- New behavior: fallback match aggregates preserve all bounded Stats Lab match
  dimensions and participant aliases required to answer the same categorical
  queries before and after reload.
- Migration action: expand only match-rollup dimensions and matching semantics;
  preserve non-blocking fallback writes, bounded storage, pseudonymization, and
  existing aggregate totals.
- Required tests: with IndexedDB unavailable, record a Cup match and query by
  player, seat, mode, online, type/team, object, variant, cosmetic, arena,
  player count, and viewport; reopen the same local store and obtain identical
  totals for every individual and representative combined filter.
- Integration commit: `ab3e270`.
- Affected owner notified: State/Data/Safety; revision must be acknowledged and
  included in its active isolated correction before merge.

## Revision 33 - deadline verdicts require the scoring plane

- Trigger: continuing Simulation QA replayed Ice seed `3668341011` after the
  absolute-deadline correction. It resolves at the intended six-second deadline
  but receives `upright-settle-limit` while almost motionless on an Ice bumper,
  with its bottom approximately 95px above the scoring ground. A four-viewport
  Earthquake corpus found the same shared defect. The production-valid tablet
  seed `27` makes about 12px above the static scoring plane at its four-second
  deadline (about 9px above the physically oscillating table).
- Old behavior: the deadline check runs before the grounded check and awards a
  make from current tilt alone, so off-plane suspension can count as a landing.
- New behavior: the deadline remains absolute from first scoring-plane contact,
  but a make requires the scoring body to be grounded within tolerance of the
  active landing plane. An off-plane body resolves as a miss unless an event has
  an explicit recovery contract; tilt alone never qualifies.
- Migration action: preserve the deadline ordering and all event-specific
  settle durations, then gate the deadline pose verdict on scoring-plane contact.
  Do not restore the earlier unbounded wait or make Ice an automatic miss.
- Required tests: exact Ice seed `3668341011` resolves at frame 420 as MISS while
  off-plane; Earthquake seed `27` at 768x1024 is also MISS; a deadline-bound
  grounded upright seed remains MAKE; settled cap, Wind, Moon, Bouncy,
  Trampoline return-landing, ceiling-plane, and ordinary timing regressions pass.
- Integration commit: `6488066`.
- Affected owner: Physics/Events. Exact candidate remains rejected and physics
  may not merge until it acknowledges this revision and supplies both negative
  and positive scoring-plane fixtures.

## Revision 34 - retention cardinality is explicitly finite

- Trigger: State/Data QA aggregated 500 same-day flips whose ordinary short
  session, player, team, object, variant, cosmetic, arena, event, and viewport
  IDs were all distinct. All passed the character/length regex and produced 500
  permanent cells; only 300-character hostile IDs exercised the existing
  `other` path.
- Old behavior: categorical values were described as bounded but most IDs were
  accepted by an open regex, allowing imports or repeated sessions to restore
  one-cell-per-flip permanent growth.
- New behavior: static categories are checked against frozen catalogs.
  Open-ended identities use finite trusted-local dictionaries per source
  lineage, imported values cannot populate those dictionaries, and a fixed
  per-day/per-lineage cell budget coalesces excess tuples into lossless overflow
  aggregates.
- Migration action: validate dimensions before constructing the rollup key;
  preserve aggregate totals/counters and filter semantics for known catalog and
  trusted-local values. Existing unbounded cells coalesce the next time they are
  rewritten. Do not key or display names.
- Required tests: 500 distinct valid-looking short hostile tuples produce a
  documented bounded cell count with exactly 500 flips and correct totals;
  every canonical catalog value and trusted current player/seat filter remains
  distinguishable; unknown imported values group as `other`; representative
  combined filters, fallback reload, snapshot replacement, and v1/v2/v3 rollup
  migrations remain lossless.
- Integration commit: `ab3e270`.
- Affected owner notified: State/Data/Safety; revision must be acknowledged and
  integrated with revisions 30-32 before merge.

## Revision 35 - public release name is v1.11

- Trigger: the product owner renamed the release from `v111` to `v1.11` during
  the final correction wave.
- Old behavior: the visible footer, boot messages, record metadata, Android
  version name, install documentation, and immutable GitHub release used
  `v111` (with Android version name `1.1.1`).
- New behavior: every player-facing surface and release artifact uses `v1.11`.
  Android uses `versionName 1.11`; the immutable GitHub release/tag is `v1.11`;
  exports and embedded build metadata report `v1.11`.
- Migration action: the Program Integrator updates version-owned surfaces,
  cache identity, automated assertions, and release documentation together.
  Stable internal module filenames/namespaces, `V111-*` defect IDs, query build
  number `111`, and Android `versionCode 111` remain implementation identifiers
  to avoid a risky namespace migration and preserve Android upgrade ordering.
- Required tests: no player-facing surface, APK metadata, export, install guide,
  live footer, boot/recovery message, or GitHub release title/tag says `v111` or
  `1.1.1`; all report `v1.11`/`1.11`. Web and APK still embed one exact commit,
  stale-cache upgrade remains atomic, and existing saved data is not re-keyed.
- Integration commits: `d7730d6`, `0196606`, and `ee5799f`.
- Affected owners notified: State/Data/Safety and Physics/Events acknowledged
  the rename and will not make independent version edits. All independent QA
  gates will verify the new public identity on the final exact commit.

## Revision 36 - dual-origin automatic web release

- Trigger: the product owner requires the release to remain on GitHub Pages and
  also auto-deploy to `mapzimus.com/flipgame` through `mapzimus/lab`, with every
  future approved update triggering the same downstream refresh.
- Old behavior: Flipgame deployed only from its own `master` branch to GitHub
  Pages. The lab repository carried an old manual snapshot at `/flip-game/` and
  redirected `/flipgame` away from the newly requested canonical path.
- New behavior: both public origins serve the exact approved v1.11 web tree.
  `mapzimus/lab` builds the vendored app at `/flipgame/`; old hyphenated and
  bottle-game aliases redirect forward. After the complete Flipgame release job
  succeeds, a repository-scoped deploy key updates only the lab app snapshot,
  records the upstream SHA/version, validates the full lab build, and pushes its
  production branch for the existing Cloudflare Pages Git integration.
- Migration action: add a deterministic allowlisted sync script to the lab
  repository, install a write deploy key scoped only to that repository, store
  its private half as a Flipgame Actions secret, and add an ordered downstream
  publish job with concurrency/stale-SHA protection. Preserve all unrelated lab
  content and never commit credentials or Android/signing material.
- Required tests: hermetic sync rejects dirty, wrong-version, wrong-SHA, missing,
  and path-escape sources; removes stale app files; copies every required runtime
  asset and no release secrets; lab build maps to `/flipgame/`; legacy redirects
  point forward. Release automation runs only after qualification/APK success
  and only for current `master`. Independent post-release checks confirm both
  origins show v1.11, embed the same source SHA, upgrade caches atomically, work
  offline, and exercise equivalent core play.
- Flipgame integration commits: `0196606` and `ee5799f`; the Lab integration
  commit remains pending until the exact release candidate is approved and
  snapshotted.
- Credential state: write deploy key `flipgame-production-sync-v1` is installed
  only on `mapzimus/lab`; its private key exists only as the encrypted
  `LAB_DEPLOY_KEY` secret in `mapzimus/flipgame` Actions.
- Affected owners notified: Network/Platform specialist owns isolated lab paths;
  Program Integrator alone owns Flipgame workflow credentials, merges, pushes,
  Cloudflare release observation, and dual-origin approval.

## Revision 37 - bounded statistics remain lossless and filter-exact

- Trigger: independent State/Data QA chained two bounded 80-flip archives
  through a hub and a leaf. Nineteen flips disappeared, while separate
  high-cardinality fixtures retained unfiltered totals but lost object, event,
  arena, and player-filtered samples. Adversarial imports also accepted negative
  and impossible aggregate counts, three direct Unicode evasions remained, and
  stats setup rows without seat markers retained blocked names.
- Old behavior: overflow rows were keyed only by Test Data status after lineage
  stripping and differing categorical dimensions collapsed to `__unknown__`.
  That bounded top-level cells but could overwrite history and could not answer
  exact filtered queries. Aggregate schema/counter relationships were trusted.
- New behavior: a finite validated aggregate index within overflow cells keeps
  exact categorical subtotals while top-level rollup cardinality remains
  bounded. Chained exports remain lossless, every supported filter reconciles,
  and malformed/inconsistent aggregates fail atomically. The shared name policy
  covers the newly proven code points and every `startingSettings.rows[]` item is
  treated as player context regardless of optional seat fields.
- Required tests: A80+B80→hub160→leaf160, repeated/newer snapshot replacement,
  >60-combination flip/match filter truth before and after fallback reopen,
  hostile aggregate schemas/counts/counters with rollback, exact mixed-script
  probes, and `{id,name}` setup-row sanitation at every stats boundary.
- Integration commit: `148963f`.
- Affected owner: State/Data/Safety acknowledged. Public StatsStore methods stay
  unchanged; aggregate overflow schema gains the bounded validated index.

## Revision 38 - authoritative special-event results synchronize as final facts

- Trigger: independent Simulation QA found a hidden-beta observer can intercept
  an authoritative Rewind MISS as a local first attempt, obtain `null`, and
  crash during resolution. Plinko deterministically loses its slot/prize, and
  Roulette, Mitosis, Cap Toss, and other stateful event outcomes can diverge when
  observers recompute them from local timing.
- Old behavior: result packets carry only base MAKE/MISS and pose/tilt fields;
  observers rerun event resolution against their own partial physical state.
- New behavior: `NetworkEnvelopeV2` result payloads may carry one validated
  JSON-safe `eventResult` containing the matching event ID, authoritative
  final/replay state, and event-owned resolved metadata. An observer applies the
  final authority result without rerunning stateful physics or rewards.
  Stateful/automatic event results with missing, incomplete, or mismatched
  metadata fail closed. Ordinary offline play and hidden/fail-closed public
  online exposure do not change.
- Required tests: authority/observer state equality for all 30 events, explicit
  first-failure Rewind replay/finality, all nine Plinko slots, Roulette sector,
  Mitosis landed count, Cap Toss bodies, malformed/mismatched/missing payloads,
  and unchanged ordinary/legacy-safe verdict behavior.
- Integration commit: `898e4c3`.
- Affected owners: UI/Network/Physics owner acknowledged; State/Data/Safety and
  active QA were notified and reported no conflicting interface work.

## Revision 39 - qualification-gated dual-origin publication

- Trigger: adversarial release review proved legacy branch-mode GitHub Pages
  could publish before APK, Lab, or Cloudflare qualification, while stale
  branch checks and a reused version/cache identity could leave origins split.
- New behavior: GitHub Pages is an Actions artifact deployed only after the
  exact-SHA Cloudflare publication succeeds. Existing release tags at another
  SHA fail the build; both production branches are refetched at every publish
  boundary; a final job compares provenance and every allowlisted runtime byte
  across both public origins.
- Required tests: injected qualification failure advances neither origin;
  same-version descendant rejects before publication; concurrent branch
  advances fail closed; mismatched public bytes fail reconciliation.
- Integration commit: `af33537`.

## Revision 40 - internal dynamics render bridge

- Trigger: the v1.11 art pipeline already computed angle/slosh state but the
  skin adapter discarded it before authored object renderers could consume it.
- New behavior: the adapter forwards existing paint-only motion fields without
  changing physics, results, or the shared collision envelope.
- Migration/tests: deterministic previews remain stable and every affected art
  renderer receives equivalent state. Integration commits: `6d5b38a`, `d6db565`.

## Revision 41 - universal reaction faces and open-liquid spill

- Trigger: product review requested expressive objects and visible coffee spill.
- New behavior: all objects expose immutable local face anchors; renderer-owned
  state maps airborne to scared and final make/miss to smile/frown. A brief
  face-focus camera beat follows resolution without delaying gameplay. Open
  liquids spill only under inversion/outward motion; sealed contents never do.
- Required tests: 51-object anchor coverage, every emotion, reduced motion,
  responsive camera framing, sealed/open boundaries, and unchanged verdicts.
- Integration commits: `6d5b38a`, `d6db565`.

## Revision 42 - product-owner artwork review

- Trigger: first 25-object gallery review identified insufficient silhouettes,
  detail, scale, and internal behavior.
- New behavior: Teapot steam responds physically; Milk Carton is tall with an
  original cow illustration; Soup Can clearly reads as soup; Smoothie,
  Microscope, Penguin, Owl, Giraffe, Red Panda, Rubber Duck, Action Figures,
  Tall Buildings, and Box of Snacks receive major authored upgrades; Microphone
  is tall; Trophy is large and dramatic; Snow Globe has moving snow around an
  anchored house. Giraffe is tallest. Gumball Machine, Salt Shaker, and cactus
  direction are retained. The original T-Rex is permanently excluded from art
  and physics changes.
- Required tests: refreshed 25-object/12-variant screenshot matrix, silhouette
  bounds, internal dynamics, brand-free details, and T-Rex invariance.

## Revision 43 - isolated legacy-object dynamics

- Trigger: applicable dynamics were requested for old objects without creating
  concurrent ownership conflicts in the shared skin/renderer files.
- New interface: `v111-legacy-object-dynamics.js` exposes immutable
  `profileFor`, `faceFor`, `normalizeState`, `paintUnderlay`, and `paintOverlay`.
  Existing object art consumes paint-only dynamics while T-Rex remains passive.
- Required tests: all 26 legacy IDs, deterministic/reduced-motion state,
  applicable loose/internal behavior, and protected T-Rex hash/invariance.

## Revision 44 - restore locked broad-family cast matrices

- Trigger: integrated Potted Plants, Action Figures, and Tall Buildings names
  drifted from the product-owner-approved 12-cast matrices.
- New behavior: names/order and geometry remapping return to the frozen matrices;
  missing Orchid/Flytrap and required family detail are authored without any
  ID, unlock, physics, or scoring change.
- Required tests: exact manifest names/order, all 36 renders, stable IDs, and
  unchanged progression. Integration commit: `6d5b38a`.

## Revision 45 - deterministic per-flip Smoothie color

- Trigger: product review requested a random Smoothie liquid color every flip.
- New interface: renderer forwards the already-bound trajectory seed as
  paint-only `flipSeed`; art hashes it into a fixed 12-color palette. The color
  remains stable throughout that flip/replay and preview seed zero is fixed.
- Required tests: same-seed stability, different-seed palette coverage, replay
  parity, no RNG consumption, and unchanged game outcomes.
- Integration commits: `6d5b38a`, `d6db565`.

## Revision 46 - compatible paint-state superset

- Trigger: art owners used different names for elapsed time, seed, and resolved
  emotions while the camera/renderer integration began.
- New interface: skin paint opts consistently expose `time`, `motionSeed`, bound
  `flipSeed`, angle/slosh/angular velocity/velocity/airborne/contact/impact, and
  renderer-owned `emotion: idle|scared|smile|frown`. Optional immutable face
  metadata is `{anchor, scale, focusRadius, supportsEmotion}` and is
  feature-detected without mutating art.
- Required tests: deterministic forwarding, replay parity, immutable metadata,
  no gameplay mutation, and compatibility across new/legacy art packs.
- Integration commit: `d6db565`.

## Revision 47 - reaction faces are selective, not universal

- Trigger: product review clarified that faces belong only on silly objects
  without another compelling physical mover.
- Old behavior: revision 41 required anchors/reactions for every object except
  the protected T-Rex.
- New behavior: art declares an explicit `supportsEmotion` allowlist. Liquid,
  lava, sand/granule, snow, steam, foliage, globe, and similarly dynamic objects
  use physical motion instead of a generic face. Renderer default is false;
  only declared eligible objects receive scared/smile/frown or face zoom. The
  new-object allowlist is Penguin, Owl, Giraffe, Red Panda, Eyeball Monster,
  Huge Rubber Duck, and Action Figures. The legacy allowlist is Bowling Pin,
  Traffic Cone, Chess Pawn, Whipped Cream, Lawn Chair, and Alien. The original
  Bottle and T-Rex are explicitly false; Bottle keeps water motion and T-Rex
  remains untouched.
- Required tests: exact approved allowlists, no overlay/zoom on unsupported
  objects, correct lifecycle on supported objects, original Bottle exclusion,
  protected T-Rex invariance, and unchanged gameplay.
- Integration commits: `d6db565`, `ff863b5`.

## Revision 46 - compatible paint-state superset

- Trigger: art owners used different names for elapsed time, seed, and resolved
  emotions while the camera/renderer integration began.
- New interface: skin paint opts consistently expose `time`, `motionSeed`, bound
  `flipSeed`, angle/slosh/angular velocity/velocity/airborne/contact/impact, and
  renderer-owned `emotion: idle|scared|smile|frown`. Optional immutable face
  metadata is `{anchor, scale, focusRadius, supportsEmotion}` and is
  feature-detected without mutating art.
- Required tests: deterministic forwarding, replay parity, immutable metadata,
  no gameplay mutation, and compatibility across new/legacy art packs.

## Revision 47 - reaction faces are selective, not universal

- Trigger: product review clarified that faces belong only on silly objects
  without another compelling physical mover.
- Old behavior: revision 41 required anchors/reactions for every object except
  the protected T-Rex.
- New behavior: art declares an explicit `supportsEmotion` allowlist. Liquid,
  lava, sand/granule, snow, steam, foliage, globe, and similarly dynamic objects
  use physical motion instead of a generic face. Renderer default is false;
  only declared eligible objects receive scared/smile/frown or face zoom. The
  new-object allowlist is Penguin, Owl, Giraffe, Red Panda, Eyeball Monster,
  Huge Rubber Duck, and Action Figures. The original Bottle and T-Rex are
  explicitly false; Bottle keeps water motion and T-Rex remains untouched.
- Required tests: exact approved allowlist, no overlay/zoom on unsupported
  objects, correct lifecycle on supported objects, original Bottle exclusion,
  protected T-Rex invariance, and unchanged gameplay.
