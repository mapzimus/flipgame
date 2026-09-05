# Flipgame v111 Contract

Contract revision: 13
Baseline commit: `3a3ace0`
Release version: `v111`

This file is the implementation source of truth. Any behavior or interface
change must be approved and broadcast by the Program Integrator before an
affected specialist continues.

## Release invariants

- Ordinary Classic physics and rules do not change except for the approved
  settling, ON FIRE, life-cap, sudden-death, resize, and Alien corrections.
- The web build and offline APK are produced from the same commit and display
  `v111` on every screen.
- Player-facing UI never reveals unlock thresholds, wins remaining, locked
  names, programmed event odds, or the Insane Mode occurrence rate.
- Locked objects, cosmetics, achievements, Alien, Insane, and Physics Lab show
  only a lock symbol with accessible label `Locked`.
- No public telemetry or third-party analytics ships in v111. Detailed stats
  are device-local and exportable.
- Forced/test play never awards progression or achievements and is excluded
  from default statistics.

## Gameplay contracts

- Landing lifecycle: `airborne -> contact -> settling -> resolved`. A contact
  is never an immediate miss. Settle limits are 4 seconds normally, 5 for Wind
  and Moon, and 6 for Ice and Bouncy.
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
  Arena, ring, attraction, and timeout scale across supported viewports.

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
- Stats Lab shows observed counts, fractions, percentages, and distributions
  only. It does not show theoretical odds or undiscovered event names.
- `.flipstats.json` imports deduplicate by UUID. CSV pseudonymizes players by
  default; including display names is an explicit export choice.
- `NamePolicy` is local and deterministic. It performs NFKC normalization,
  removes controls/bidi overrides, collapses whitespace, limits to 14 grapheme
  clusters, checks obfuscations, and returns a generic rename error. Exact
  `Mr. Howe` and event test names are allowlisted.
- Player names are rendered through text nodes or escaping, never unsafe HTML.

## Shared interfaces

- `EventDefinition` and
  `EventRegistry.roll({ mode, oddsProfile, seed, excludedEventIds? })`.
  Exclusions are applied before the deterministic selection; they never cause
  a second roll. `Physics.applyFlick` accepts the same exclusions as its final
  optional event-policy argument. An events-disabled mode also suppresses a
  pending forced event.
- `EventController.prepare/applyPhysics/onContact/resolve/cleanup`
- `LandingVerdict`
- `ProgressionStateV3`
- `StatsStore`, `FlipRecordV1`, and `MatchRecordV1`
- `NamePolicy.validate()`
- `NetworkEnvelopeV2`; reconnect convergence uses the opaque, JSON-safe match
  snapshot registered by `Net.bindMatchState({ capture, restore })`. A peer is
  blocked rather than resumed when authoritative state is unavailable.
- `RenderVariant` is immutable
  `{ id, objectId, variantId, label, color, metrics, renderLocal }`; metrics use
  the canonical viewBox, pivot, baseline, and collision mapping above.
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
