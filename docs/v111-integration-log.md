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
