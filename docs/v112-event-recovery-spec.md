# Flipgame v1.12 Event Recovery and Owner-Playtest Calibration

> Supporting implementation detail only. `docs/v112-contract.md` supersedes
> conflicts, including the now-final decision that Battle ships in v1.12 and
> uses only its curated compatible power catalog.

Status: implementation specification, prepared 2026-09-06 from the read-only
audit in `docs/v112-event-audit.md` and the product-owner playtest feedback.

## 1. Decision and scope

Trampoline, Wind Tunnel, Mitosis, and Plinko are the first recovery set. They
must become understandable physical set pieces, not a generic tint plus a rare
event label. This document freezes their intended prelaunch cue, physics,
selected-object presentation, sound, camera, result, cleanup, reduced-motion,
test, and proposed Battle Mode behavior.

The current implementation is not approval evidence:

| Event | Current failure to recover | v1.12 owner-playtest target |
|---|---|---|
| Trampoline | The real one-time relaunch exists, but the painted trampoline pulses independently of the collision and every phase uses generic event audio. | The table visibly compresses at the exact first contact, throws the object into one readable return arc, and judges only the return landing. |
| Wind Tunnel | A real off-center gust exists, but the streaks do not read the authoritative gust vector and there is no directional pre-cue or spatial wind treatment. | The player sees the wind direction before aiming; force, streamlines, object response, sound, and camera all agree. |
| Mitosis | Physics creates a second compound object, but rendering substitutes a cyan circle. This can read as a bottle cap splitting off and is nonsensical for non-bottle selections. | Mitosis duplicates the **entire selected object**. Both full copies retain the selected art and then acquire independent physical and visual dynamics. No cap or generic stand-in is created. |
| Plinko | The eight-row board is too short, camera cropping can imply seven slots, and peg contacts have no event sound. | A genuinely taller physical board produces a 12-second median drop, normally 10–15 seconds, while a tracking camera reveals upcoming pegs and finishes on all nine slots. |

This specification does not by itself approve Battle Mode for v1.12. The
ship/defer decision, two-pointer input contract, scoring, lane layout, and
fallback remain Wave 0 product decisions under `docs/v112-qa-plan.md`. The
eligibility rules below become binding only if Battle Mode ships. No partial
Battle control or route may ship when the mode is deferred.

| Event | Live Battle eligibility | Target and competitive form |
|---|---|---|
| Trampoline | Eligible | Self-assist; one fallible rebound, reward-free |
| Wind Tunnel | Eligible | Opponent attack; direction shown before input, reward-free |
| Mitosis | Eligible | Self-assist; either whole copy may make, no multi-copy bonus |
| Plinko | Ineligible | No live-lane use; any future between-round gamble needs a separate contract |

## 2. Shared event contract

### 2.1 Pre-bind and actionable telegraph

The event ID, event seed, target lane/player, selected-object appearance, and
all seeded parameters are committed before the player can begin the gesture.
Release velocity, pointer event ordering, frame rate, sound state, and camera
state cannot select or alter an event.

Every event uses this 900 ms ready sequence:

1. At `t=0`, input is temporarily gated and the event name plus a unique
   color-independent glyph appears in both the arena and accessible status.
2. By `t=150 ms`, the real affected surface or field and any seeded direction
   are visible. The selected object remains stationary at its normal launcher.
3. From `t=300–900 ms`, one short mechanic instruction remains visible.
4. At `t=900 ms`, the status changes to `READY — FLIP`, a small ready tick may
   sound, and input becomes active. CPU input cannot start earlier. In a shipped
   Battle Mode both lanes open on the same simulation tick after both cues are
   ready.

Pointer activity during the gated interval neither launches nor contributes to
power. It is announced as “Wait for ready,” then ignored. The event cue remains
identifiable during the full flight. Reduced motion uses the same timing with
static state changes; mute affects sound only. Practice and Physics Lab forcing
must go through the same sequence unless an explicit QA-only `skipTelegraph`
flag is recorded in Test Data.

A Battle power-up selected while another gesture or flight is active queues for
the target’s next eligible ready phase. Target, event, seed, and direction lock
before that target’s `pointerdown`; no power-up can appear mid-gesture,
mid-flight, or after seeing a release vector. Only one event may affect a lane
for a flip, and ordinary random events are disabled for the whole Battle round.

The event-specific copy is:

| Event | Glyph | Prelaunch title | Mechanic instruction |
|---|---|---|---|
| Trampoline | spring-deck icon | `TRAMPOLINE` | `One big rebound — land the return.` |
| Wind Tunnel | arrow plus three wind bars | `WIND TUNNEL ←` or `WIND TUNNEL →` | `The gust keeps blowing this way.` |
| Mitosis | one full silhouette becoming two | `MITOSIS` | `Your whole object becomes two — land either.` |
| Plinko | nine-bin icon numbered 1–9 | `PLINKO DROP` | `Nine slots — aim the entry and watch the full drop.` |

### 2.2 One authoritative selected-object snapshot

At event bind, gameplay captures an immutable appearance snapshot containing
at least `objectId`, `variantId`, authored cast/parts, selected palette and
material, cosmetic ID, reaction eligibility, physics-profile ID, and a stable
`appearanceRevision`. Every rendered event entity references this snapshot.
Changing Customize state, loading art, or advancing another player cannot
change an airborne object.

Physics exposes stable event entities rather than anonymous decorative bodies:

```
entityId, role, bodyId, appearanceRef, transform, bounds,
linearVelocity, angularVelocity, contactState, visualStateId
```

`transform` is the single source for the selected art, shadow, contact flash,
positional sound, camera bounds, and test telemetry. Physics-only geometry such
as pegs and the trampoline surface likewise exposes a stable body ID and exact
transform. An interactive collider that is absent from render state, or art
whose bounds do not correspond to its collider, fails the event gate.

“Entire selected object” means its complete authored silhouette and all
non-detached authored parts, its chosen variant/color/material, and its allowed
cosmetic. Original Bottle and T-Rex protection rules remain intact; cloning an
object does not add a face or redraw protected art. A universal circle, bottle,
cap, color blob, or emoji is never an acceptable substitute.

Each independently moving selected-object entity owns its own visual state.
At a split, causal values such as liquid level, globe rotation, hinge position,
cloth pose, and authored moving-part phase copy continuously from the parent.
After the split, each state advances from that entity’s velocity, angular
velocity, contacts, and deterministic visual sub-seed
`hash(eventSeed, entityId, "visual")`. Slosh, appendage motion, shadows,
reactions, impact deformation, particles, and trails may then diverge. No clone
may read or overwrite another clone’s mutable visual state. Decorative sub-seed
use never feeds physics or scoring.

### 2.3 Presentation, outcome, and cleanup invariants

- Event sound is phase-specific. The generic `ignite` cue is not the launch
  sound for these events. Continuous sounds are pooled, have a documented
  maximum lifetime, and stop on every cleanup route. Positional pan comes from
  the authoritative entity/contact position and clamps to `[-0.8, 0.8]`.
- Camera transforms are render-only. They cannot mutate bodies, consume the
  gameplay RNG, defer a verdict, or change a seed-to-result mapping. Camera
  easing advances from fixed simulation time, not `requestAnimationFrame`
  timing.
- Trampoline, Wind Tunnel, and Mitosis remain fallible. No landing magnet,
  snap-to-upright, hidden result override, or minimum-spin floor may erase an
  ordinary and an extreme miss path. Plinko is the sole event whose physical
  slot produces an automatic result, and its two Automatic Loss slots are real
  miss paths.
- Rewards are applied only after the final physical verdict. A first contact,
  split, anti-wedge nudge, camera transition, audio cue, or result preview never
  mutates lives, points, streaks, turns, achievements, or Stats.
- Cleanup is idempotent and lane-scoped. It runs after result exit, next-turn
  reset, replay replacement, rematch, return to menu, mode change, abandonment,
  pause cancellation, deferred resize/reflow, object replacement, and any
  Battle lane cancellation. It removes event bodies, sensors, constraints,
  collision filters, render entities, trails, timers, audio nodes, and camera
  state; restores ground/wall masks, gravity, mass, density, inertia, friction,
  restitution, scale, ordinary landing clocks, and the selected appearance; and
  leaves the other Battle lane untouched.
- Reduced motion preserves the event seed, physics steps, forces, contacts,
  timings, verdict, and reward. It removes shake, sway, elastic overshoot,
  flashing, and continuous particle motion while retaining a static glyph,
  named text, physical geometry, direction, contact state, and selected object.

## 3. Trampoline

### 3.1 Physical behavior

Trampoline is a helpful-but-mixed second-arc event. The ordinary table collision
surface becomes the visible spring deck for the whole landing width. It may
relaunch exactly once.

The trigger is the first downward contact after the selected object has been
fully airborne. Let the pre-solver center-of-mass velocity be `vIn` and angular
velocity be `wIn`. On that contact, the event applies this single spring result
in the game’s current Matter.js world units:

```
vOut.x = clamp(0.82 * vIn.x, -18, 18)
vOut.y = -clamp(1.55 * abs(vIn.y), 30, 42)
wOut   = clamp(0.90 * wIn, -0.35, 0.35)
```

The contact solver may separate penetration along the table normal by at most
4 world pixels. It may not move the object a fixed distance, change its
horizontal position, add an alignment torque, inject an extra turn, or rewrite
its accumulated rotation. A 120 ms collision cooldown prevents the recoil
frame from retriggering the spring; after that, the surface is an ordinary
table for this flip.

The first impact records `springContactMs`, `springContactX`, pre/post velocity,
impulse, and `relaunchCount=1`, but is not a landing contact for scoring. It
clears the ordinary settle window and begins a new airborne phase. Only the
return contact starts the normal 4,000 ms settle window and can produce MAKE or
MISS. Leaving the physical arena before spring contact, leaving after the
relaunch, under-rotating, or returning in an invalid pose are genuine misses.

### 3.2 Rendering, sound, and camera

The spring deck is registered before launch and spans exactly the physics
landing surface. Its mesh has a high-contrast spring pattern in addition to
color. At contact it depresses locally around `springContactX` in proportion to
the authoritative normal impulse, reaches maximum compression within 70 ms,
and returns over 140 ms. The selected object never visually penetrates an
undeformed deck. Reduced motion replaces this with one compressed frame until
release and one released frame afterward.

Sound phases are `trampoline-ready` (short coil tick),
`trampoline-compress` (low spring sound scaled by impact speed), and
`trampoline-release` (rising twang at the contact pan). They are distinct from
the ordinary result sound.

At compression the camera enters `trampoline-return`: it fits both the spring
deck and selected object with `0.82 <= zoom <= 1`, follows the object upward
without bounce, and returns to ordinary landing framing after the return apex.
Normal motion may add one camera dip of at most 10 screen pixels for at most
180 ms. Reduced motion removes the dip and uses the same fitted bounds.

### 3.3 Result, reward, and Battle eligibility

- A valid return landing is an ordinary MAKE; an alternate-end/cap pose is
  valid only when the selected object’s ordinary profile permits it. There is
  no event-specific life or point bonus.
- Classic, Cup, Team, Practice, and Lab use their existing ordinary MAKE/MISS
  adapter after the return. Cup shootouts continue to disable events.
- If Battle Mode ships, Trampoline is eligible as a **self-assist** power-up.
  It affects only the owner’s lane, remains one-relaunch/fallible, gives no
  bonus points or lives, and cannot stack with another lane event. Random rare
  events are disabled while a Battle power-up is armed.

### 3.4 Deterministic acceptance

Tests must prove a valid return MAKE, an invalid-pose return MISS, an
under-rotated MISS, and an extreme horizontal MISS. The audit’s `B(2)` make,
`B(1)` miss, and rejected poor input `B(5)` remain migration probes, not final
release fixtures. Final numeric seeds are frozen in `V112-EVENT-1` after tuning.

Runtime assertions require one and only one impulse, no verdict/reward at first
contact, continuous rotation accounting across both arcs, a fresh settle clock,
rendered deck/contact agreement within 2 world pixels, identical full selected
art before and after the bounce, and complete cleanup from every shared route.

Across the controlled calibration corpus, target a `55–80%` make rate, no more
than `60%` in the low/poor-input band, and at least `25%` misses in the extreme
band. Mirrored directions may differ by no more than 5 percentage points.

## 4. Wind Tunnel

### 4.1 Physical behavior

Wind Tunnel is a mixed/challenging continuous-force event. The direction `d`
is `-1` or `+1`, derived from `hash(eventSeed, "wind-direction")`, and is shown
before input. Its phase `phi` is independently derived from
`hash(eventSeed, "wind-phase")` in `[0, 2π)`.

The ordinary launch spin multiplier is `1.0`; Wind Tunnel does not secretly
grant the current unconditional `1.42×` spin. From release until the first
landing-plane contact, or for at most 5,000 ms, the force is:

```
pulse = 0.80 + 0.20 * sin(2π * 0.85 * elapsedSeconds + phi)
Fx    = d * selectedObject.mass * 0.00155 * pulse
Fy    = 0
```

It is applied at the horizontal center and `0.32 * physicalHeight` above the
center of mass. Force therefore produces visible translation and a predictable
torque from wind direction, not from a branch that reinforces the player’s
current spin. No gust force applies while grounded. `gustVector` exposes
direction, pulse, force, application point, and active interval every physics
step. Mass scaling keeps acceleration comparable across object profiles.

The seeded gust can be planned around but cannot align the object. Poor aim can
be blown beyond the useful landing area; under-rotation and over-rotation remain
misses. Upright and object-supported alternate-end/cap landings remain valid,
with the normal 5,000 ms settle boundary.

### 4.2 Rendering, sound, and camera

The prelaunch arena shows fixed streamlines, arrowheads, the textual direction,
and a windsock aligned with `d`. During flight, every streamline travels in the
sign of the current `gustVector`; density/length may map to `pulse`, but cannot
reverse or invent gusts. A short force arrow at the authoritative application
point makes the torque legible in Practice/Lab and may be omitted from ordinary
play after owner approval. Selected-object loose parts, liquid, shadows, and
cosmetic trails respond from that object’s real transform and velocity.

Sound phases are `wind-ready` (directional rush), one pooled `wind-loop` whose
gain follows `pulse`, and `wind-contact` when the object leaves the airstream.
The loop pans with the object and crossfades out within 120 ms of contact or
cleanup.

Normal motion allows camera sway of at most 12 screen pixels in direction `d`,
low-pass filtered so it cannot oscillate faster than 1 Hz. The camera must keep
the landing surface and selected object visible and may zoom no farther than
`0.80`. Reduced motion removes sway, retains fitted framing, and replaces moving
streaks with static streamlines and arrowheads.

### 4.3 Result, reward, and Battle eligibility

- Wind Tunnel has no event-specific reward. Ordinary pose and mode adapters
  decide the result after the force ends.
- If Battle Mode ships, Wind Tunnel is eligible as a telegraphed **opponent
  attack**. The target sees direction and mechanic for the full 900 ms before
  their gesture unlocks. Direction is expressed in target-lane coordinates and
  mirrors exactly when lanes swap; it never depends on which pointer event was
  received first. It affects no body, audio loop, camera, or result in the
  attacker’s lane and cannot stack with another event.

### 4.4 Deterministic acceptance

Freeze left/right valid-cap-or-alternate-end MAKEs, ordinary misses, and
extreme blown-off-target misses. The audit’s current `B(3)` make and `B(1)` miss
are migration probes only. Assert the force formula at fixed simulation times,
mass-normalized acceleration, application point, force/render direction,
audio-pan sign, 5,000 ms boundary, mirrored direction behavior, and unchanged
outcome with camera, mute, or reduced motion toggled.

For the controlled calibration corpus, left/right mirrored make rates differ by
no more than 5 percentage points and neither direction may exceed an 80% make
rate or fall below 20%. A corpus containing no miss, no make, or a result whose
direction changes merely by swapping lane identity fails.

## 5. Mitosis

### 5.1 Non-negotiable object rule

Mitosis never detaches, manufactures, or substitutes a cap. At the split it
creates two complete instances of the selected object, regardless of whether
that selection is Bottle, T-Rex, a mug, globe, snack box, transparent object,
or any other catalog item. If an authored cap/nozzle is an inseparable part of
the selected art, each full copy contains its own; neither part flies away.
Cap Toss and Fizz Jet remain the only mechanics in this area allowed to create
their specifically contracted detached part.

The render-entity roles for Mitosis are exactly `copy-a` and `copy-b`. A
`cap`, `secondary-cap`, `generic-circle`, or missing `appearanceRef` role is a
release-blocking error.

### 5.2 Physical behavior

At exactly 240 ms of airborne simulation time, the parent state becomes two
full-size copies using the selected object’s complete compound collider. Let
the original mass, inertia, center velocity, and angular velocity be
`m`, `I`, `v`, and `w`.

- Each copy has the full geometry at half density, giving mass `m/2` and
  inertia `I/2` within numeric tolerance.
- The center offsets are symmetric on the horizontal axis. Per-copy offset is
  `clamp(0.52 * physicalWidth + 6, 30, 72)` world pixels.
- Copy velocities are `(v.x - 2.6, v.y)` and `(v.x + 2.6, v.y)`; both begin at
  angular velocity `w`. This preserves center linear momentum and total spin
  angular momentum. Any collision correction during creation is recorded and
  bounded to 2 pixels.
- Mutual copy collision is disabled for the first 120 ms after division, then
  enabled. Both copies otherwise collide independently with the normal arena.
- Rotation completed before division is inherited by both landing trackers.
  Each tracker then accumulates only its own physical angular path.
- Each copy gets its own first-contact and 4,000 ms settle window. The event
  waits until both trackers resolve. A tracker still outside the landing plane
  at the global 12,000 ms post-split boundary resolves as an off-field MISS.

There is no upright correction, shared torque, copied verdict, or rule saying
the secondary follows the primary. Zero valid copies is a genuine MISS.

### 5.3 Rendering, sound, and camera

For the first 150 ms after division, a bright division seam and two labeled
outlines (`A` and `B`, also distinguishable by dash pattern) make the new bodies
readable. Both entities use the immutable selected appearance and their own
authoritative transform and shadow. The division can squash/stretch only the
art, for at most 90 ms, and must return to exact `1.0` scale; colliders remain
full-size throughout. Reduced motion performs an instantaneous split with a
static seam and outlines.

Independent visual-state behavior is required, not optional. A liquid object
whose copies hit at different times must show different slosh; a globe whose
copies acquire different angular velocities must rotate its internal map
differently; separate impacts must deform, react, emit, and settle only the
copy that experienced them. A renderer that calls the selected-art pipeline
once and mirrors/reuses its mutable output for the other copy fails.

Sound phases are `mitosis-ready` (two-note widening cue), `mitosis-split`
(centered division pop), and one positional `mitosis-contact-a/b` tick per
copy’s first contact. The ordinary result sound follows only the final combined
verdict.

The camera fits the bounding union of both full art bounds plus the landing
surface, clamped to `0.72 <= zoom <= 1`. It never chooses one copy and clips the
other. Normal motion may use one 140 ms outward ease at split; reduced motion
cuts directly to the fitted union with no zoom overshoot.

### 5.4 Result and rewards

| Valid full copies | Flip result | Classic/Cup | Team | Practice/Lab |
|---:|---|---|---|---|
| 0 | MISS | Ordinary miss consequence; no event reward | 0 points | Record `0/2`; no persistent reward |
| 1 | MAKE | Ordinary make economy; no Mitosis bonus | 1 raw point | Record `1/2`; no persistent reward |
| 2 | MAKE | Ordinary make economy plus `+3` lives through the existing additive 150%-of-starting-lives cap | 3 raw points total | Record `2/2`; preview the +3 without persisting it |

Copy count is the sole Mitosis bonus axis. Multiple cap/alternate-end bonuses
do not compound, and a one-copy result is not upgraded because the other copy
briefly touched the table. Telemetry records each copy’s pose, contact time,
settle time, rotation, reason, and final validity.

If Battle Mode ships, Mitosis is eligible as a **self-assist**. Either full
copy making produces the lane’s one ordinary success; both making still awards
only that one Battle success and no +3/life/point multiplier. Both bodies and
their cameras remain inside the owner’s isolated lane. Qualification must cover
both players activating Mitosis simultaneously: four selected objects render
and resolve without cross-lane state or frame-rate bias.

### 5.5 Deterministic acceptance

Freeze at least one seed for each `0/2`, `1/2`, and `2/2` result, plus
off-field and interrupted split seeds. The audit’s current `B(8)` make and
`B(1)` no-copy miss are migration probes only. At division, relative error for
mass, center linear momentum, and total angular momentum is at most `1e-6`;
both full collider signatures match the selected physics profile.

Run the rendering contract across all 51 objects and every selected variant
that changes geometry or moving parts. Pixel/contact-sheet evidence must show
two complete recognizable objects, two shadows, and distinct `A/B` state. For
all 612 variants, structural assertions require both entities to carry the
same requested `objectId`, `variantId`, material, and cosmetic and never fall
back to a bottle, cap, or circle. A forced unequal-contact fixture must prove
the two visual-state objects diverge and clean up independently.

Across the controlled calibration corpus, target `55–80%` for at least one
copy valid, `15–35%` for both valid, `25–55%` for exactly one valid, and
`15–35%` for neither valid. These are event-level tuning bands, not permission
to vary the result by object artwork or viewport.

## 6. Plinko

### 6.1 Physical board and object

Plinko keeps exactly nine physical prize slots in this fixed order:

```
LIVES ×2 | HALVE OTHERS | ALWAYS MAGNET | AUTO LOSS | AUTO WIN |
AUTO LOSS | ALWAYS MAGNET | HALVE OTHERS | LIVES ×2
```

The v1.12 board uses a canonical 1,080-world-pixel inner width, 24 staggered
peg rows, 92-pixel row spacing, 9-pixel peg radius, a 150-pixel slot band, and
120-pixel slots. Rows alternate 11 and 10 pegs and use mirrored half-cell/full-
cell offsets. Side rails and all eight slot dividers remain physical. The row
count is three times the current eight-row board and the first-to-last-row span
is more than three times as tall; shortening it and compensating with slower
time, invisible geometry, or a scripted wait is forbidden.

The event is bound before input and shows the top of the board and nine-slot
prize ribbon during the cue. The ordinary gesture still supplies the physical
entry velocity; the event does not preselect a slot. On release, the table
opening and board are live immediately.

For reliable peg collision, physics may use the existing radius-34 circular
Plinko envelope with density `0.008`, friction `0.15`, air friction `0.004`,
and restitution `0.5`. Rendering must make that mapping honest: the complete
selected object is uniformly scaled to fit inside a visible transparent bumper
capsule no larger than 56×56 world pixels, retaining its silhouette, selected
variant, palette/material, and moving parts. It tumbles at the envelope’s real
angle. The capsule is never rendered as a generic puck, cropped bottle, cap,
or identity-free ball.

Peg collision and gravity are authoritative. Seeded parameters may set only
documented entry jitter and anti-wedge recovery direction; they cannot map a
seed directly to a prize, steer toward a prize, or rewrite final `x`. The slot
is computed from the settled physical envelope center.

### 6.2 Twelve-second timing and recovery

`dropMs` is measured from release/input application to the first stable
physical slot verdict. The 900 ms prelaunch telegraph and post-verdict result
hold are excluded. On the frozen clean-drop corpus:

- median `dropMs` is `12,000 ± 500 ms`;
- at least 80% of drops finish from `10,000–15,000 ms`;
- at least 95% finish from `9,000–18,000 ms`; and
- no clean drop may use the anti-wedge or abnormal-stall path.

The timing must come from traversal of the visible 24-row physical field.
Physics time scale stays at `1.0`; there is no slow motion, off-camera descent,
fixed pause, fake collision, repeated scripted bounce, or delayed verdict.

Anti-wedge recovery watches a 750 ms rolling window while the object is above
the slot band. A stall requires speed below `1.1` and less than 12 world pixels
of downward progress for the entire window. Recovery is a visible 150 ms
machine shake that applies a bounded alternating lateral velocity increment
of `0.35` per physics step and downward increment of `0.18`; direction comes
from the event recovery sub-seed. There is a 500 ms cooldown, at most four
recovery bursts, and no position teleport. The counter clears after one full
row of downward progress. Reduced motion retains the same physical impulse but
shows a static `SHAKE` glyph and contact outline instead of camera/board shake.

At 22,000 ms, or after four bursts followed by 6,000 ms without one row of
progress, the abnormal-stall failsafe begins. The two currently supporting peg
colliders retract visibly for 300 ms; if that still does not release the
object, a visible jam-clear chute makes only a capsule-width column of pegs
below the current `x` non-colliding until the object enters the slot band.
Rails and dividers stay physical. The object is never repositioned, its current
`x` is not changed, and no prize is selected by the failsafe.

An absolute 30,000 ms engine-safety boundary produces an announced `NO CONTEST
— PLINKO RESET`, restores the same player’s turn, and mutates no lives, points,
streak, turn count, achievements, progression, or qualifying Stats. It records
an abnormal diagnostic. A release candidate hitting this boundary in any
clean, wedge, viewport, reduced-motion, or soak fixture fails even though the
session recovers.

### 6.3 Camera, rendering, and sound

The camera has three deterministic phases:

1. **Entry (`progress < 0.08`)** — show the entry opening, selected object, and
   at least the first three physical rows.
2. **Track (`0.08 <= progress < 0.82`)** — keep the selected object at 38% of
   viewport height so most of the frame reveals upcoming pegs. Horizontal
   tracking keeps both nearby rails visible whenever the viewport permits.
3. **Prize reveal (`progress >= 0.82` or slot-band entry)** — over 600 ms, fit
   the complete nine-slot band, all eight dividers, slot numbers 1–9, and the
   selected object. All nine slots must be visibly present at phone, desktop,
   smartboard, and 4K widths; a minimum zoom clamp may not crop outer slots.
   Compact layouts use screen-space two-line icons/labels and highlight the
   landed slot without hiding its neighbors.

The camera follows the actual body and board geometry. It never outruns the
object, reveals an empty off-camera wait, or affects contacts. Reduced motion
uses non-oscillating 250 ms linear transitions and no shake, while preserving
the same framing and result.

Sound phases are `plinko-ready` (short marquee), throttled `plinko-peg` contact
ticks, `plinko-divider`, and a result sting unique to the landed prize. Peg
ticks derive pan from contact `x`, pitch from contact speed plus row band, and
have a global minimum spacing of 55 ms so a cluster cannot create an audio or
performance storm. Contact audio and light flashes are suppressed only by mute
or reduced-motion presentation respectively; neither changes collision.

### 6.4 Result, reward, and Battle eligibility

The physical slot is the sole result/reward authority:

- `LIVES ×2` doubles the current player’s lives and bypasses only the additive
  cap, as today.
- `HALVE OTHERS` applies `max(1, ceil(value/2))` to every active opponent.
- `ALWAYS MAGNET` grants the current player’s existing match-scoped persistent
  magnet state.
- `AUTO LOSS` is a MISS and applies the mode’s contracted terminal loss.
- `AUTO WIN` is a MAKE and applies the mode’s contracted terminal win.

Classic resolves at match level, Cup resolves the current heat, and Team uses
its frozen match-level adapter (`×2` points, halve opposing score, persistent
magnet, or automatic winner). Practice displays the prize and records its
non-qualifying result without persistent competitive mutation. Prize
provenance records event seed, physical slot index, legacy/canonical prize,
entry state, contact digest, anti-wedge/failsafe counters, and final position.

Plinko is **not eligible in a live simultaneous Battle lane**. A 10–15 second
camera-led random terminal sequence would stall the opponent, compete for the
shared screen, and replace head-to-head physical skill with match-scale chance.
A future between-round optional Plinko gamble may be designed only under a
separate reward, pacing, consent, and camera contract; it is not part of the
v1.12 Battle power-up pool.

### 6.5 Deterministic and distribution acceptance

- Freeze at least two numeric seeds per slot in `V112-EVENT-1`; all 18 replay
  to the same slot, contact digest, reward, and automatic outcome on repeated
  runs and with reduced motion/mute/camera disabled.
- The same normalized input and seed produce the same slot at every supported
  viewport. Mirroring input and event recovery direction produces slot
  `8-index` with a mirrored contact path.
- On at least 9,000 consecutive fixed seeds, every slot has probability from
  2–25%, mirrored slot pairs differ by no more than 2 percentage points, center
  Automatic Win is 5–20%, and the two Automatic Loss slots together are
  10–30%. These are reachability/fairness bounds, not a requirement for uniform
  slots.
- Deliberate bridge fixtures at the top, middle, and final peg bands exercise
  ordinary release, all four anti-wedge bursts, supporting-peg retraction, and
  the visible jam-clear chute. They must enter a physical slot by 30 seconds
  without teleport or preselection. A deliberately disabled solver separately
  proves the no-contest boundary and zero mutation.
- Timeline assertions enforce the median/percentile gates and fail if physics
  time scale differs from `1.0`, a row is not rendered, the object leaves the
  tracked view, or any final frame contains fewer than nine visible slots and
  eight dividers.

## 7. Calibration corpus and release evidence

The four events use one frozen, versioned `V112-EVENT-RECOVERY-1` manifest. A
row contains the candidate SHA; event/event seed; object, variant, cosmetic,
and physics-profile IDs; mode and Battle lane/target when applicable; viewport,
DPR, input source, direction and timestamped gesture; reduced-motion/mute
state; expected phase/contact/entity digest; expected result/reward; cleanup
route; and artifact hashes.

Before full 51-object Cartesian qualification, tuning uses five deliberately
different representatives: original Bottle, protected T-Rex, the narrowest
object, the widest/tallest object, and one transparent/liquid or strongly
animated object. It covers `360×740`, `768×1024`, `1280×720`, and `3840×2160`,
both directions, low/controlled/high/extreme inputs, and at least 64 consecutive
seeds per calibration cell. Seeds are never discarded because they fail.

The release suite then reconciles this spec with the full event matrix in
`docs/v112-qa-plan.md`:

- all 51 objects for physics/profile identity at four physics viewports and
  both directions;
- all geometry-changing/moving variants visually, plus structural appearance
  identity for all 612 variants;
- Classic, Cup, Team, Practice/Lab, Insane, and every accepted Battle mapping;
- ordinary make, ordinary miss, extreme miss, interruption, every cleanup
  route, reduced-motion parity, and airborne resize deferral;
- exact force/impulse and conservation assertions from fixed-step simulation;
- render-command/body-transform agreement plus phone, desktop, smartboard, and
  4K screenshot/contact-sheet evidence;
- audio phase, throttling, pan, mute, lifetime, and cleanup instrumentation;
- camera visibility/bounds traces proving no outcome or timing mutation; and
- 1,000-repeat leak tests plus the 60 FPS 1080p and 45 FPS heaviest 4K floor.

No hand-picked make/miss pair substitutes for the consecutive calibration
corpus or Plinko distribution run. A retry does not erase a failure. Expected
fixtures must be updated only with an explained physics change, new candidate
SHA, owner re-review, and preserved before/after evidence.

## 8. Owner-playtest approval gate

Owner Test Mode must make these four events directly forceable with event seed,
object/variant, viewport preset, direction, motion preference, and (only if
shipped) Battle lane/target. It remains Test Data and cannot unlock content,
alter earned defaults, count achievements, or pollute qualifying Stats.

Approval is event-by-event on the exact release-candidate SHA. The owner sees
at least one clean make, one ordinary miss, one extreme miss, one reduced-motion
run, one non-bottle selected object, one strongly animated object, phone and
smartboard framing, and each applicable Battle role. Plinko additionally shows
the timing summary, every slot, an anti-wedge recovery, and the all-nine-slot
final frame. Mitosis additionally shows two complete non-bottle objects with
visibly independent post-split dynamics.

Structural tests cannot approve spectacle or feel. Any event that still reads
as a generic overlay, hides its physical cause, shows the wrong selected
object, loses a slot, feels automatic outside Plinko, or remains disappointing
in owner playtest blocks v1.12.
