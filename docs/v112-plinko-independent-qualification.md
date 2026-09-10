# Independent Plinko qualification — 2026-09-10

## Scope and result

Source under test: `7c552d1` (development integration, not a release approval).
No production files were changed. Run:

```text
node scripts/v112-plinko-qualification-tests.js
node scripts/v112-plinko-matter-tests.js
```

The new live-path acceptance suite has **4 passing checks and 8 failing checks**.
It intentionally exits nonzero while these production defects remain. Failures
must not be hidden by excluding this suite from qualification. The existing
standalone Matter adapter suite passes, but that adapter is not yet called by
the live Physics singleton at this commit.

The test loads the actual bundled Matter, Physics, event metadata, renderer,
Skin profiles and observation driver in an isolated JavaScript VM. It runs real
60 Hz physics, not fake verdicts or fabricated collision callbacks. The renderer
dispatch check intercepts paint dispatch only; it is not screenshot approval.

## Confirmed failures

| Finding | Severity / existing owner | Reproduction and evidence |
|---|---|---|
| Old eight-row board remains live | P1, V112-111 / live physics | `Physics.init(1280,720)`, force Plinko, `applyFlick(-350,-2500,500)`. `getPlinko().pegs` contains eight distinct row Y coordinates, not 24. Nine mirrored prize entries themselves are correct. |
| Selected compound is replaced with a circle | P1, V112-111 / live physics | Compare `getBottle()` identity, parts and circle radius before/after the forced launch. All 51 canonical object profiles fail preservation. `startPlinko()` removes the selected compound and creates `Bodies.circle(...,34)`. |
| No trampoline launch or phase snapshots | P1, V112-111 / live physics + renderer | Same launch: live board has no opening trampoline/spring state; no trampoline lock, spring ascent or apex handoff. |
| Full live event is shorter than the intended board descent alone | P2, V112-008 / live physics | Seeds 500–508, horizontal input `-350 + i*90`, vertical -2500. Total event durations in ms, sorted: 7483.3, 7533.3, 8083.3, 8100, 8400, 8416.7, 8600, 9633.3, 9633.3. Median **8.4 seconds**, including launch. This is not a board-only duration measurement. |
| Final camera crops prize bins | P2, V112-110 / camera | Seed 500, -350/-2500, 1280×720. At resolution, derive visible horizontal bounds from `camX ± width/(2*zoom)`; these do not encompass the board. Live camera keeps following the off-center object instead of fitting the prize band. |
| Driver rejects Plinko as unsupported | P1 / event bridge | Reset, `driver.armLaunch({manual:true})`, then force/launch Plinko. `driver.snapshot().supported` is false and warning is `event-adapter-required`. This is not evidence that the private rules authority receives the legacy payout. |
| Artificial prize/position paths remain | P1 / live physics | `checkLanding()` contains `flightFrames > 3000 -> plinkoVerdict()`, a first-contact settle-limit call to `plinkoVerdict()`, and a `plinkoNudges > 700` position jump into the prize band. These are source-confirmed unsafe paths, not claims that the nine ordinary sampled shots executed all three paths. |
| Prize lacks settled sensor evidence | P1, V112-073 / event bridge | Seed 500 resolves at tick 516 as automatic loss in slot 5. Output includes generic contact count 1, but no slot sensor reference or physical slot-settlement evidence. `plinkoVerdict()` derives the index from horizontal position. |

## Passing checks

- Seed 9123 with horizontal 37 / vertical -2500 replays exactly at sampled ticks
  and resolves at tick 525, slot 5. Resizing to 360×740 at tick 100 leaves this
  flight and its result unchanged (deferred geometry).
- Mid-drop reset removes live board bodies, restores ordinary selected-body
  collision state, leaves no event constraints, and permits a normal next flip.
- All nine mirrored Classic reward slots, both ordinary and ON FIRE states,
  produce correct legacy life effects: doubles bypass the additive cap, halving
  rounds up with a minimum of one, magnet persists, and forced eliminations
  store zero lives. This does **not** qualify the private Cup/Team bridge.
- The actual renderer dispatches each of 51 object IDs × 12 variant IDs to the
  selected art path during Plinko. Bottle uses its existing dedicated drawing
  path. No non-Bottle selection is dispatched as Bottle. This verifies identity
  handoff, not rendered visual quality or secondary-motion behavior.

## Standalone adapter evidence, kept separate

The existing 81-run real-Matter corpus passes at this same commit:

- 81/81 physically settled; all nine slots reached.
- Board-drop median 12,783.3 ms; observed range 7,983.3–17,383.3 ms.
- Actual sensor contacts, deterministic replay, unchanged selected compound,
  tether/chassis removal and collision-mask restoration pass.

That corpus uses one Bottle-scale compound envelope with varying launch inputs.
It does not establish live wiring, native Alien cleanup, all selected render
states, phone/4K camera framing, or private rules/reward integration. A normal
duration band is statistical, not a rule to hold an already-settled body until
ten seconds or to end a moving body at fifteen seconds.

## Required next qualification

1. Rerun this suite against the actual live bridge commit; map its documented
   camera and sensor-evidence fields explicitly, without weakening assertions.
2. Add real browser screenshots across the six contracted viewport presets,
   all camera phases, eight/sixteen-player HUDs, and representative selected art
   with moving contents. Validate reduced motion and prize-label visibility.
3. Run at least the adapter corpus through the live bridge and separate ascent,
   physical descent and settlement durations. Check unresolved no-contest
   retries without rewards, penalties, progression or rotation advances.
4. Exercise authoritative Classic/Cup/Team terminal transitions, permanent
   magnet and cleanup after normal outcome, timeout, reset and abandonment.
5. Verify every physical object envelope, active variant/cosmetic and native
   Alien scene restores correctly after Plinko; no event-only contact chassis
   may be drawn as a generic replacement object.

No release approval or claim of complete Plinko qualification is made here.
