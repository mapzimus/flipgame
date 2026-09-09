# Flipgame v1.12 EasterEggRegistryV1

Status: registry, reducer API and contract tests implemented. Live renderer/audio/
camera composition remains an integration-owner task. Nothing in this document
authorizes a release, cache bump or deployment.

## Boundary

An Easter egg in v1.12 is a rare, authored presentation reaction to a physical
gameplay circumstance. It runs only after the authoritative flip result has
been committed. It may request local Canvas/SVG art, a short local sound, a
lane-scoped camera lease or flavor text. It cannot:

- influence the launch, forces, colliders, settling or landing verdict;
- change lives, stake, score, turn order, match state or an event result;
- award FXP, FC, ownership, Store items or achievements;
- alter event selection, event probability or any gameplay random stream;
- enter default statistics, probability graphs or public progression surfaces;
- fetch a network asset, write storage or call an online service; or
- interrupt an active gameplay/event camera.

The implementation is `js/v112-easter-eggs.js`. Its definition array is deeply
frozen, JSON-serializable data. The evaluator has no imports and uses neither
`Math.random` nor time. All chance, presentation selection and camera lease IDs
come from namespaced hashes of a presentation seed. A caller must provide that
seed separately from every physics/event RNG stream.

The registry is hidden infrastructure. Odds, definitions and undiscovered
names must never be rendered as a catalog. A presentation becomes known only
when it happens in play.

## Existing-secret inventory

| Existing behavior | v1.12 classification | Owner / action |
|---|---|---|
| A physical Desk Globe make may briefly focus a deterministic point on its currently visible hemisphere; default internal rate 1/100, exact case-sensitive `Mr. Howe` rate 1/10 | Presentation Easter egg | Preserved as `desk-globe-visible-wurld`; its decision hash is tested seed-for-seed against `FlipGlobeV112.focusDecision()` |
| Exact `Mr. Howe` multiplies Normal Signal Event weights by ten; Insane overrides it | Gameplay/event profile, not presentation | Remains exclusively owned by EventRegistry; this module neither reads nor changes event weights |
| Exact `Howe Test Mode` exposes content temporarily and makes the activity Test Data | Owner/QA feature, not a player secret | Never listed as an Easter egg and never converted into a progression unlock |
| Plinko | Signal Event, not an Easter egg | Remains in EventRegistry with its physical trampoline/board/result authority |
| Legacy `party`/`disco`, `ghost`/`boo`, `tiny`/`smol`, `giant`/`jumbo`/`biggie`, `ninja`/`shadow`, `rainbow`/`unicorn` names and the Konami party toggle in `main.js` | Unreviewed v1.11 cosmetic shortcuts | Quarantined from EasterEggRegistryV1. They lack the required physical circumstance and should not silently become v1.12 canon; a UI owner must remove or explicitly reapprove them during live composition |

## Authored registry

All rates below are implementation data and must remain absent from
player-facing UI, accessibility output, Stats Lab and exports.

| ID | Internal eligibility and rate | Presentation-only result |
|---|---|---|
| `desk-globe-visible-wurld` | Desk Globe, any arena, physical make; 1/100 or 1/10 for exact `Mr. Howe` | Brief focus on a deterministic visible-hemisphere point; static magnified inset under reduced motion |
| `baseline-return-signal` | Bottle on Baseline Table, clean two-or-more-rotation cap make; 1/64 | A replay monitor catches `SIGNAL RECEIVED` |
| `cafeteria-clean-hold-inspection` | Milk Carton in School Cafeteria, clean bounce-free upright make; 1/48 | A triceratops cafeteria table judge raises a clean-hold paddle |
| `library-quiet-table` | Owl in Grand Library, physical miss after at least two rotations and one bounce; 1/40 | A dinosaur archivist quietly shushes the replay desk |
| `pirate-buoy-crown-bell` | Buoy on Pirate Ship Deck, recovered cap make after a bounce; 1/55 | The ship bell marks the Crown |
| `volcano-molten-echo` | Lava Lamp at Volcano, recovered upright make after a bounce and at least 700 ms settling; 1/52 | Lamp and crater pulse together |
| `space-station-fine-point` | Microscope at Space Station, clean bounce-free upright make with at least two rotations; 1/75 | Its lens shows a tiny replay of the completed flight |
| `stadium-deep-time-salute` | Protected T-Rex at Stadium at Night, two-or-more-rotation cap make; 1/91 | Living dinosaur spectators salute the vintage figure; the T-Rex asset is never modified |
| `aquarium-high-water-review` | Huge Rubber Duck in Aquarium Tunnel, physical miss after at least two bounces; 1/60 | A hadrosaur attendant checks a playful splash gauge twice |
| `arcade-scatterline-trace` | Gumball Machine at Arcade, cap make with at least three rotations; 1/50 | Eight cabinet lights replay the rotation pattern |
| `haunted-thirteenth-tick` | Mechanical Metronome in Haunted Hall, clean upright make settling from 1,050–1,450 ms; 1/66 | The hall clock adds a thirteenth tick |
| `mars-ninth-return` | Alien at Mars Outpost, physical Alien-ring make after at least two banks; 1/80 | UFOs form an eight-entry ring with one open light |

Several secrets respond to misses or difficult recovery holds. They are not all
make celebrations, and none makes the next shot easier. Dinosaur characters are
ordinary officials, staff and spectators, consistent with Urth canon. The
protected T-Rex is still the exact vintage competition figure.

## Reducer interface

### `EasterEggOutcomeContextV1`

The integration owner creates this narrow snapshot from an already committed,
branded outcome. The registry is not an outcome authority; `outcomePhase:
"committed"` documents call order but is not a security token.

Required identity and presentation fields are:

- `matchId`, `flipId`, strictly increasing match-wide `sequence`;
- independent `presentationSeed`;
- `objectId`, optional `variantId`, `arenaId`, exact `playerName`;
- `physicsModeId`, optional `eventId`, optional `storyChapterId`, `laneId`;
- `outcomePhase: "committed"`, `verdict: "MAKE" | "MISS"`, `physical: true`,
  and `automatic`;
- `landingClass`, nonnegative `rotationCount`, `bounceCount`, `bankCount` and
  `settleMs`;
- `clean`, `recovery`, `pressureShot`, `matchTerminal`;
- `testData`, `reducedMotion` and `audioMuted`.

Unknown keys, custom prototypes, accessors, nonfinite measurements and
uncommitted/nonphysical input fail closed. In particular, score, life, reward,
progression and statistics objects cannot cross this adapter.

### State and evaluation

```text
state = EasterEggRegistryV1.createMatchState(matchId)
resolution = EasterEggRegistryV1.evaluate(state, committedContext)
state = resolution.state
```

`EasterEggMatchStateV1` provides monotonic ordering, duplicate flip protection,
one-shot-per-match counts and per-definition cooldown metadata. Every definition
is limited to one presentation in a match and also declares a resolved-outcome
cooldown. At most one definition wins deterministic priority arbitration for a
single outcome.

`EasterEggResolutionV1` returns either `presentation: null` or one deeply frozen
`EasterEggPresentationV1`. It never returns a rules command. The presentation
contains only:

- authored cue IDs and safe display/accessibility strings;
- a lane-scoped visual intent and deterministic presentation seed;
- an optional audio intent plus caption and muted visual fallback;
- a request-only, lane-scoped camera lease that never interrupts another owner,
  may wait until the camera is free, expires with the presentation and restores
  the gameplay camera; and
- explicit presentation-diagnostic-only/default-statistics-excluded policy.

With reduced motion, the visual cue switches to an authored still/crossfade,
lasts no more than 1.3 seconds and requests no camera motion. Muted play requests
no audio but retains the caption and visible fallback.

### Test Data

Natural Easter-egg rolls are suppressed in Test Data. A test harness may pass
`{forceId}` only when `testData === true`. Forcing bypasses chance, not physical
eligibility, committed-outcome ordering, duplicate protection or the one-shot
limit. Forced results stay marked Test Data and excluded from default
statistics. Live competitive contexts reject force requests.

## Live-composition acceptance work

The registry intentionally does not edit `main.js`, the live renderer, audio,
camera, service worker or release manifest. The shared renderer owner must:

1. create the narrow context only after the trusted outcome commit;
2. keep a separate presentation seed/domain and persist it for replay;
3. request, rather than seize, a camera lease from the existing camera owner;
4. map every cue ID to authored local Canvas/SVG/audio assets, with no generic
   emoji, remote asset or generic face overlay;
5. keep all reactions lane-local in Battle and never delay the next legal input
   beyond the presentation pacing budget;
6. pass the Globe cue to its existing visible-hemisphere focus-point API using
   the recorded globe orientation;
7. render all text through safe text APIs and keep accessible strings
   conventional; and
8. add screenshot/replay/reduced-motion/mute tests in the live renderer suite.

Until those steps are merged and visually approved, the registry is implemented
and verified but the new secrets are not visible in the playable build.

## Automated evidence

Run:

```text
node scripts/v112-easter-eggs-tests.js
```

The suite checks all twelve positive and negative eligibility paths, exact Globe
compatibility across normal and exact-name cohorts, deterministic replay,
duplicate/one-shot behavior, canonical content IDs, deep immutability, hostile
input, Test Data force rules, natural-rate bands, camera lease safety,
reduced-motion and mute fallbacks, forbidden competitive fields, browser global
loading, no storage/network/physics imports, and no `Math.random` use.
