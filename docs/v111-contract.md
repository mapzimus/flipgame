# Flipgame v1.11 Contract

Contract revision: 48
Baseline commit: `3a3ace0`
Public release version: `v1.11`

Internal module filenames, JavaScript namespaces, defect IDs, Android
`versionCode 111`, and cache-query build number `111` remain stable implementation
identifiers; none is presented as the public version name.

This file is the implementation source of truth. Any behavior or interface
change must be approved and broadcast by the Program Integrator before an
affected specialist continues.

## Release invariants

- Ordinary Classic physics and rules do not change except for the approved
  settling, ON FIRE, life-cap, sudden-death, resize, and Alien corrections.
- The web build and offline APK are produced from the same commit and display
  `v1.11` on every screen.
- The same approved web tree is published to both
  `https://mapzimus.github.io/flipgame/` and the canonical
  `https://mapzimus.com/flipgame/`. The latter is built by the separate
  `mapzimus/lab` Cloudflare Pages repository; legacy `/flip-game/` aliases
  redirect to `/flipgame/`.
- A successful approved `master` release synchronizes an allowlisted web-runtime
  snapshot into `mapzimus/lab` with its exact source SHA and public version.
  The cross-repository credential is a write-enabled deploy key scoped only to
  `mapzimus/lab` and stored solely as an encrypted Actions secret. A stale,
  dirty, failed, mismatched, or unqualified source never updates the lab repo.
- GitHub Pages publishes through its Actions deployment only after the complete
  qualification/APK job and the exact-SHA Cloudflare publication succeed. The
  release then reconciles provenance and every allowlisted runtime byte at both
  public origins. A runtime-changing commit may not reuse an existing public
  version/tag/cache/build identity, and stale production-branch checks are
  repeated immediately before no-op, push, and Pages publication boundaries.
- The v1.11 HTML loads only its version-unique boot script. On remote HTTP(S),
  that boot script installs and verifies the v1.11 service worker as the current
  controller before loading any mutable application script. A v110 controller
  can never satisfy a v1.11 runtime request through an ignore-search fallback;
  an interrupted upgrade shows a retryable update message instead of mixing
  release assets. Localhost and the bundled APK load directly.
- A page already controlled by the matching v1.11 worker boots entirely from
  that release's cache while offline and never forces a network update check.
  The HTML itself contains a visible, dependency-free loading/retry surface so
  failure to fetch the sole boot script cannot leave a blank page.
  Before boot completes, including every failure path, all application screens
  remain hidden and only that recovery surface is visible. Architecture and
  release gates validate ordered runtime dependencies from the boot graph.
  A runtime script counts as loaded only when both its resource load and its
  synchronous execution succeed. Any execution error before boot-ready aborts
  the ordered graph, leaves all later scripts unloaded, and keeps the release
  in the isolated recovery state.
- Player-facing UI never reveals unlock thresholds, wins remaining, locked
  names, programmed event odds, or the Insane Mode occurrence rate.
- Responsive Setup and Stats use one column below 768px, a compact two-column
  composition throughout 768-1099px, and the 12-column desktop shell beginning
  at 1100px. Desktop Setup assigns Players seven columns and Match five.
- Locked objects, cosmetics, achievements, Alien, Insane, and Physics Lab show
  only a lock symbol with accessible label `Locked`.
- No public telemetry or third-party analytics ships in v1.11. Detailed stats
  are device-local and exportable.
- Forced/test play never awards progression or achievements and is excluded
  from default statistics. Once any event is forced, Test Data status remains
  latched for the whole match/session and its MatchRecord.
- Online remains inaccessible in v1.11 unless sender identity is authenticated
  independently of fields asserted by the incoming envelope.
- Post-release verification checks both public web origins independently for
  `v1.11`, exact source metadata, atomic cache upgrade, offline reload, and core
  gameplay parity before the release is complete.
- `window.Settings` is the single shared settings instance used by setup,
  persistence, audio, gameplay, and the renderer. A visible setup control and
  its saved value must never diverge from the effective runtime preference.
  Reduced motion is active when either the persisted explicit preference or
  the operating-system preference requests it; sound, physics feel, and flick
  feedback likewise survive reload through that same shared instance.
  During the one-time v110 migration, valid `feel`, `feedback`, and
  `reduceMotion` values saved in `flipgame.setup.v2` override those three
  canonical fields because v110's guarded canonical setters never executed.
  Sound remains canonical. The migrated setup copies are then removed so this
  precedence applies exactly once.

## Gameplay contracts

- Landing lifecycle: `airborne -> contact -> settling -> resolved`. A contact
  is never an immediate miss. Settle limits are 4 seconds normally, 5 for Wind
  and Moon, and 6 for Ice and Bouncy.
- A settle limit is a hard deadline measured from first scoring-plane contact.
  Event relaunch, bounce, slide, or temporary loss of grounded contact never
  pauses or resets that deadline; the event-specific verdict is evaluated no
  later than its limit.
- A deadline can award a make only while the scoring body is grounded on the
  active landing plane within its contact tolerance. A body suspended on an Ice
  bumper, obstacle, or other off-plane geometry resolves as a miss (or performs
  an explicitly contracted event recovery); upright tilt alone is never a
  landing.
- Physics geometry is frozen during an airborne viewport resize. Canvas pixels
  may resize immediately; world reflow waits until the flip resolves.
- ON FIRE upright makes add 1 life and cap makes add 2. The streak continues
  above three. An ON FIRE miss ends the run and advances the turn without a
  second stake, sudden-death, life, or elimination penalty.
- Additive life awards cap at `ceil(startingLives * 1.5)`. Explicit life
  multipliers bypass the cap. Opponent-halving uses
  `max(1, ceil(lives / 2))`.
- Cup is best-of-three. Short uses 3 lives with sudden death after 3 rotations;
  Full uses 10 lives with sudden death after 5 rotations. Lives reset and the
  opener rotates between heats.
- Cup is first to two with at most three regulation heats. If multiple players
  tie for the most heat wins after heat three, only those leaders enter an
  events-disabled standard-physics shootout. Each receives one flip per round;
  exactly one maker wins, otherwise the opener rotates and another round runs.
- After each non-final regulation Cup heat, an immutable
  `ArenaDraftOfferV1` presents exactly three distinct choices from the frozen
  symmetric pool. Offers are deterministic from an explicit draft seed and
  Cup state, persist across save/reconnect, and never consume gameplay/event
  RNG. The next heat accepts only `arenaDraftSelectionId` from the current
  offer. Shootouts have no draft or arena profile.
- Arena Draft's reward-free, all-player pool is exactly: Crosswind, Moon
  Gravity, Gravity Slam, Spring Table, and Slick Table. These are symmetric
  persistent physics profiles, not reward events.
- Team Clash supports 2, 4, 6, or 8 players, three alternating flips per team,
  cancellation scoring, and first to 11 without win-by-two.
- Team raw scoring is upright/cap 1 and Golden 2. Event adapters are: Rainbow 2;
  Shrink 2 upright/3 cap; Mitosis 1 for one/3 for both; Roulette multiplies base
  raw score by 1-4; Cap Toss 5; Heart 4; Double 2 plus halving the opponent's
  uncancelled current-round subtotal with ceiling; Rewind uses only the final
  result; Mirror copies the action; Plinko double pays 2, halve ceilings the
  opponent match score, magnet persists personally, and win/loss resolves the
  match. Other valid event makes pay 1. Life Drain is excluded.
- Mirror copies only normalized launch/spin/seed/physics-profile input. A copied
  flip cannot carry, repeat, or nest the source event or any reward/side effect.
  Team scores the copied outcome as base 1 for a valid make and 0 for a miss.
- Basic Practice is immediately available. Alien, Insane Mode, and advanced
  Physics Lab unlock together internally at qualifying win 100.
- Alien success requires at least one bank followed by tractor-ring entry.
  Arena, ring, attraction, timeout, and launch normalization scale across
  supported viewports. Both native Alien mode and the temporary Alien Invasion
  event use calibrated profiles whose deterministic make-rate corpus remains
  comparable to ordinary Classic and does not materially diverge by viewport.

## Event contracts

Normal event denominators, in registry order:

`rainbow-corkscrew:90, half-full:110, power-launch:140, fizz-jet:170,
golden-flip:210, bouncy-bottle:250, earthquake:290, moon-gravity:340,
ice-slide:450, alien-invasion:550, gravity-slam:650, trampoline:750,
wind-tunnel:850, shrink-ray:950, portal-pair:1100, tether-swing:1250,
mitosis:1400, double-flip:1550, ceiling-flip:1750, meteor-shower:1950,
magnet:2200, heart-rush:2450, black-hole:2700, boomerang:3000,
roulette-table:3400, rewind:3800, plinko:4500, mirror-match:5000,
cap-toss:5500, life-drain:6000`.

- Exactly one event may be active on a flip.
- Exact `Mr. Howe` multiplies Normal weights by ten. Insane overrides it.
- Insane rolls an event on one third of flips, excludes Life Drain, weights
  other eligible events equally, and gives Plinko 1.25 times their weight.
- Every event is physical/gameplay-affecting and must implement prepare,
  physics, contact, resolution, cleanup, visual, and reduced-motion behavior.
- Double Flip guarantees at least two rotations; any valid upright/cap landing
  doubles the flipper and halves active opponents.
- Rainbow grants 1 capped life on success; Heart grants 3 capped lives;
  Shrink pays 2 upright/3 cap; Mitosis pays 1 for one landing/3 for both;
  Cap Toss pays 5; Roulette uses 1/2/3/4/4/3/2/1 multipliers.
- Life Drain uses an undisclosed magnet and, on success, leaves opponents at 1.
- Plinko is the only automatic-win event. Its slots are:
  `Lives Doubled | Everyone Else Halved | Always Magnet | Automatic Loss |
  Automatic Win | Automatic Loss | Always Magnet | Everyone Else Halved |
  Lives Doubled`.
- Wind Tunnel remains skill-dependent. It applies strong lateral and rotational
  gust forces and accepts stable base or cap landings, but it never aligns or
  stabilizes every trajectory into a make; deterministic input coverage must
  contain both makes and misses.
- Power Launch, Trampoline, and Heart Rush are likewise skill-dependent. Their
  impulses, relaunches, and heartbeat stabilization may strongly reshape a
  trajectory, but may not normalize arbitrary spin/launch input into a make.
  Heart's reward remains conditional on a valid landing and Trampoline is not
  scored until its return landing resolves.

## Progression and content contracts

- Bottle is free. New objects occupy wins 2, 6, 10, ... 98; existing objects
  remain at 4, 8, 12, ... 100 with Alien at 100.
- New objects, in order: Coffee Mug, Milk Carton, Teapot, Salt/Pepper Shaker,
  Soup Can, Smoothie, Gumball Machine, Microscope, Desk Globe, Microphone on a
  Stand, Potted Plants, Penguin, Owl, Giraffe, Red Panda, Trophy Cup, Snow
  Globe, Eyeball Monster, Soda Can, Watering Can, Pinata, Huge Rubber Duck,
  Action Figures, Tall Buildings, Box of Snacks.
- New object and variant IDs use canonical lowercase kebab-case consistently in
  the manifest, art registry, progression, saves, statistics, and UI. Examples:
  `coffee-mug`, `salt-pepper-shaker`, and `coffee-mug.blue-steel`. Display text
  preserves the selected name `Piñata` while its stable ID is `pinata`.
- Odd qualifying wins 1-99 award the frozen 50-item cosmetic sequence. Even
  wins award objects. Existing saves migrate without relocking.
- A player selects one object, one of its 12 immediately available variants,
  and one personal cosmetic. A global non-physical arena is separate.
- All non-Alien objects share the standard competitive collision envelope.
  Variant silhouettes and moving parts do not alter physics.
- Applicable internal contents are paint-only deterministic simulations driven
  by existing flip state: open liquids may spill under inversion/outward motion;
  sealed liquids slosh but never spill; snow, sand, granules, steam, foliage,
  and loose parts respond where physically appropriate; rigid objects remain
  rigid. Reduced motion retains a stable representative state. These visuals
  never change mass, collider, landing tolerance, RNG outcome, or scoring.
- Only an explicit allowlist of silly/character-like objects that lack a more
  distinctive physical mover exposes an active face anchor. Objects whose
  personality is already conveyed by liquid, lava, sand/granules, snow, steam,
  foliage, globe rotation, or comparable dynamics do not receive a generic
  pasted-on face. Eligible objects show scared while airborne and smile/frown
  after a resolved make/miss. Renderer owns this mapping and a brief responsive
  face-focus camera beat; safe default is `supportsEmotion:false`. Art never
  infers results, and the beat never delays or changes physics, resolution,
  scoring, or turn order.
- The original Bottle explicitly has `supportsEmotion:false`; its water/slosh
  remains its only character motion and it never receives face-focus treatment.
- The new-object emotion allowlist is Penguin, Owl, Giraffe, Red Panda,
  Eyeball Monster, Huge Rubber Duck, and Action Figures. The legacy allowlist is
  Bowling Pin, Traffic Cone, Chess Pawn, Whipped Cream, Lawn Chair, and Alien.
  Every other object, including Desk Globe and T-Rex, is explicitly unsupported.
- The original T-Rex/dinosaur artwork and style are a protected invariant and
  must not be redrawn, restyled, or physically altered by the v1.11 art pass.
- The Desk Globe is a detailed, offline, full-360-degree rotating sphere with
  embedded original geography and no runtime network dependency. Smoothie
  liquid color is selected deterministically from a fixed palette by the bound
  per-flip trajectory seed and remains stable throughout that flip and replay.
- Object-specific review requirements include responsive Teapot steam; a tall
  Milk Carton with an original cow illustration; a clearly readable Soup Can;
  upgraded Smoothie, Microscope with flat base, Penguin, Owl, Giraffe, Red
  Panda, Huge Rubber Duck, Action Figures, Tall Buildings, and Box of Snacks;
  a tall Microphone on a Stand; a dramatic large championship-style Trophy;
  and moving snow with an anchored interior house in the Snow Globe. Giraffe is
  the tallest roster object. All artwork remains brand-free.
- Canonical art mapping is fixed to the existing cast pipeline: SVG viewBox
  `300 x 420`, SVG ground `y=376`, art scale `0.74`, and local physics contact
  `y=+39`. Therefore the shared SVG-space rotation pivot is
  `{ x:150, y:323.297297... }`. A renderer painting directly in projected world
  space uses `0.74 * bottleDrawScale`; a renderer already inside the existing
  object-local transform uses only the `0.74` art transform. Object variants
  may not override this pivot, baseline, scale, or contact plane.
- The achievement catalog contains exactly 100 entries: the existing 30 plus
  30 event, 10 Classic, 8 Cup, 8 Team, 8 collection, and 6 Lab/stat entries.

## Data and safety contracts

- `FlipRecordV1` and `MatchRecordV1` are stored in IndexedDB. Existing totals
  migrate non-destructively. The latest 100,000 flip records remain raw; older
  detail is rolled into permanent aggregates before pruning.
- Stats instrumentation observes results and never advances RNG or affects
  physics, scoring, or turn order.
- `FlipRecordV1.flightMs` is the full airborne-to-resolution duration,
  `firstContactMs` is the airborne-to-first-contact duration, and `settleMs` is
  the first-contact-to-resolution duration. For ordinary single-contact
  resolution, `flightMs` is at least `firstContactMs + settleMs`; the fields are
  never aliases.
- Retention rollups contain the bounded categorical dimensions required to
  preserve every Stats Lab filter and aggregate counters. They include day,
  scope/device/session, stable local player reference/seat/type/team, mode,
  object/variant/cosmetic/arena/event, player count, viewport bucket, result,
  online, and Test Data. Display names, per-flip/match IDs, seeds, precise
  timestamps/timings, trajectories, lives, stake, and mutable game state never
  become rollup keys.
- Rollup dimensions are cardinality-bounded, not merely length-checked.
  Catalog-backed values use the frozen mode/object/variant/cosmetic/arena/event
  and viewport allowlists. Open-ended device, session, player, and team values
  use a finite trusted-local identity dictionary per source lineage; imported
  values cannot expand that dictionary and overflow maps to fixed `other`
  buckets. A fixed per-day/per-lineage cell budget merges excess combinations
  into lossless aggregate overflow cells. No valid-looking arbitrary short-ID
  corpus may create one permanent cell per observation.
- Match rollups written by the local-storage fallback preserve the same
  filterable match dimensions and participant aliases needed by Stats Lab,
  including mode, online/Test Data, player/seat/type/team, object, variant,
  cosmetic, arena, player count, and viewport. Reopening the fallback store
  cannot change a result solely because a matching filter is applied.
- Stats Lab shows observed counts, fractions, percentages, and distributions
  only. It does not show theoretical odds or undiscovered event names.
- `.flipstats.json` imports deduplicate by UUID. Repeated snapshots from one
  source archive form a monotonic lineage: importing a newer snapshot
  atomically supersedes the complete contribution of an older imported
  snapshot from that lineage. Re-importing the same or an older snapshot is a
  no-op; imports from different source archives remain additive. Reconciliation
  must not lose a growing retention rollup or double-count raw records that a
  later snapshot has absorbed into that rollup. CSV pseudonymizes players by
  default; including display names is an explicit export choice.
- `NamePolicy` is local and deterministic. It performs NFKC normalization,
  removes controls/bidi overrides, collapses whitespace, limits to 14 grapheme
  clusters, checks obfuscations, and returns a generic rename error. Exact
  `Mr. Howe` and event test names are allowlisted.
- Every persistence, import, export, record, network, Hall of Fame, Stats, and
  `.flipgame-save` setup-row path consumes the same `NamePolicy`; invalid input
  is never persisted. `rows[]` inside saved setup data is player context, so a
  blocked imported row name is replaced with the import-boundary empty value
  before any local-storage write.
- Name screening uses a deterministic Unicode confusable skeleton broad enough
  to reject direct Greek, Cyrillic, Cherokee, full-width, and common modifier
  lookalike spellings of blocked English terms while retaining ordinary
  accented names and the exact QA allowlist.
- Editing a highlighted blocked name clears only its stale error presentation;
  match start validates the replacement again before persistence or play.
- Player names are rendered through text nodes or escaping, never unsafe HTML.

## Shared interfaces

- `EventDefinition` and
  `EventRegistry.roll({ mode, oddsProfile, seed, excludedEventIds? })`.
  Exclusions are applied before the deterministic selection; they never cause
  a second roll. `Physics.applyFlick` accepts the same exclusions as its final
  optional event-policy argument. An events-disabled mode also suppresses a
  pending forced event.
- `EventController.prepare/applyPhysics/onContact/resolve/cleanup`
- `Physics.alienMetricsForViewport(width, height)` returns read-only calibrated
  `ringRadius`, `attractionPerStep`, `timeoutFrames`, and `launchScale`
  (`0.65..2.7`) values. UI never derives or overrides Alien metrics.
- `LandingVerdict`
- `ProgressionStateV3`
- `StatsStore`, `FlipRecordV1`, and `MatchRecordV1`
- Bounded `FlipAggregateV1` and `MatchAggregateV1` overflow cells preserve exact
  categorical filter totals in a finite validated aggregate index. Chained
  export/import/export operations are lossless; malformed or internally
  inconsistent aggregate counts are rejected atomically.
- `StatsStore.getWarning()` / `onWarning(listener)` expose a non-blocking
  `{ code, message }` storage warning; the same detail is dispatched as
  `flipgame:stats-warning`. Summary fields include sample/fraction, upright,
  streak/ON FIRE, Cup/Team/event, and average flight/settle metrics. Seat uses
  the existing `seat`/`seats` filter boundary. Test-event IDs are discoverable
  only with explicit internal `includeTestEventNames: true`.
- `NamePolicy.validate()`
- `NetworkEnvelopeV2`; authoritative result payloads may carry one validated,
  JSON-safe `eventResult` with event ID, final/replay marker, and event-owned
  resolved metadata. Observers apply that final outcome without rerunning
  stateful event physics or rewards; required metadata that is missing,
  incomplete, or mismatched fails closed. Reconnect convergence uses the opaque, JSON-safe match
  snapshot registered by `Net.bindMatchState({ capture, restore })`. A peer is
  blocked rather than resumed when authoritative state is unavailable.
- Built-in v1.11 online transports do not establish independent sender identity
  and therefore remain fail-closed/hidden. A future authenticated sender adapter
  is required before online exposure; envelope fields/checksums are not identity.
- `FlipgameV111SaveBackup.serialize/parse/validate/migratePayload/sanitizeNames`
  owns the checksummed `.flipgame-save` boundary. UI loads the module and offers
  explicit export/import controls without merging save backups into Stats data.
- Android file import/export uses the system Storage Access Framework through
  the local WebView. It accepts trusted page file inputs and bounded Blob
  downloads without broad storage permissions. The APK is release-signed by
  one persistent protected key; v1.11 establishes the identity used for future
  in-place upgrades. The legacy disposable-key v110 APK requires one uninstall.
- `RenderVariant` is immutable
  `{ id, objectId, variantId, label, color, metrics, face, renderLocal }`; metrics
  use the canonical viewBox, pivot, baseline, and collision mapping above.
  Optional `face` contains an immutable local anchor, scale/focus radius, and
  explicit emotion capability. Paint state adds only
  `emotion: idle|scared|smile|frown`, existing
  angle/slosh/motion fields, and the already-bound `flipSeed`. Legacy artwork
  receives safe face/dynamics fallbacks; no art module reads game rules.
- Versioned outcome events consumed by achievements and statistics
- `bridge.flipResolved({ record })` and `bridge.matchResolved({ record })`
  preserve an opaque, detached statistics payload alongside the canonical game,
  landing, flick, and mode snapshots. Stats consumes it asynchronously; rules
  and physics never read it.
- `createArenaDraftOffer(...)`, `CupSeries.arenaDraftOffer()`, and
  `CupSeries.selectArenaDraft(profileId)` expose the between-heat draft without
  disclosing or accepting arbitrary event definitions.
- Completed-mode snapshots expose immutable, rules-owned rematch proposals:
  Cup `newCupOptions`, Team `rematchOptions`, and Team `swapTeamOptions`. UI
  applies these proposals and never recalculates opener/team rotations.
- `FlipgameV111MirrorMatch.create({ matchId?, snapshot? })` owns the persistent
  Mirror copy queue. `arm` records the resolved source launch and every other
  active target; `claim` returns an immutable normalized launch/profile with
  events, rewards, side effects, and nesting disabled; `consume` accepts only a
  final MAKE/MISS; `syncRoster`, `snapshot`, and `cleanup` preserve elimination,
  reconnect, and match-boundary behavior. Source MAKE and MISS both arm copies.
- Event render/result snapshots may add JSON-safe physical metadata without
  changing rules payloads: Rewind phase/replay, portal geometry/conservation,
  tether cable/release, Roulette wheel angle/sector, ceiling landing plane,
  liquid shift, detached Fizz cap/spray, Mitosis copy outcomes, Cap Toss
  body/cap outcomes, and Meteor collision counts. Rewind suppresses its first
  would-be MISS and publishes only the final replay verdict. Roulette derives
  its multiplier from the settled object position and current wheel angle.
