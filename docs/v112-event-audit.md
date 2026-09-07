# Flipgame v1.12 Special-Event Audit

> Historical recovery audit only. `docs/v112-contract.md` governs current
> behavior; in particular, Online is removed and Battle is required in v1.12.

Status: read-only audit of the current integration worktree, prepared 2026-09-06.

## Audit boundary

This audit was performed against committed HEAD `7e2751254a3a17cbec38e1f40cfba1cd855d0cb3` plus the existing uncommitted changes in `js/input.js`, `js/main.js`, `js/physics.js`, `js/records.js`, and `scripts/v111-progression-tests.js`. The worktree also contains untracked v1.12 planning documents.

The current dirty tree is not a release candidate. No qualification result in this document should be represented as release evidence until the integrator creates a clean, immutable release-candidate commit and reruns every affected test against that exact SHA.

The immutable public v1.11 baseline remains `947133360d3487a646e04be2b313c577474f54a5`.

At the time of audit:

- `node scripts/regression-tests.js` passed.
- `node scripts/v111-progression-tests.js` passed.
- `node scripts/v111-physics-corrective-tests.js` failed Alien viewport calibration: Alien made `68.3333%` versus Classic `32.5%` at 360×640.
- The existing Life Drain regression intentionally requires all 48 tested launches to make, which conflicts with the v1.12 requirement for a genuine extreme-miss path.
- The existing Plinko regression requires exactly eight peg rows, which conflicts with the v1.12 requirement for a substantially longer board.

## Methodology and fixture notation

The audit examined the canonical registry, event controller hooks, physics handlers, landing resolver, renderer and HUD, sound and camera paths, Classic/Cup/Team reward adapters, Practice and Physics Lab forcing, Alien and Insane handling, online result validation, reduced-motion metadata, and the existing event test suites.

The current-tree empirical corpus used 1280×720 and 40 deterministic seeds per event across three input bands:

- `S`: a fixed standard vector, `(vx=320, vy=-2500)`, across 40 seeds.
- `B`: a broad adversarial corpus where `vx=((seed×7919)%20001)-10000` and `vy=800-((seed×271)%4801)`.
- `R`: a low-to-moderate reasonable-input corpus used to expose response-band discontinuities after the unfinished input/physics retune.

The table reports `S/B/R` as makes out of 40. The no-event Classic comparison was `36/10/0`. These rates are diagnostic rather than balance approval because the worktree contains unfinished physics changes.

In the acceptance column, `M#` and `X#` identify the first observed make and miss using broad fixture `B(seed)`. Each current fixture must be preserved only long enough to characterize the current behavior; v1.12 qualification must freeze a new `V112-EVENT-1` corpus containing, for every non-Plinko event, at least one canonical make, ordinary miss, extreme miss, cleanup/interruption case, and representative viewport case.

Performance labels are relative Canvas/Matter.js risks:

- `Low`: no extra dynamic body or large retained history.
- `Medium`: extra bodies, many particles, masks, or camera work requiring pooling/culling.
- `High`: long-lived large geometry or significant retained state.

The shared reduced-motion baseline currently suppresses particles and camera shake while retaining physical geometry and outcomes. Every event still needs a distinct, static, color-independent cue and must preserve identical mechanics and deterministic result under reduced motion.

## System-wide findings

### 1. Random-event cues are not actionable

Events are selected inside `Physics.applyFlick()` after the player releases the gesture. The active event is then read and announced by the HUD. Although all 30 receive the smaller `<display name> active` status, the player cannot adapt power or direction to the event.

v1.12 should bind the event and seed before input, display a short prelaunch cue, and then enable the gesture. This requires an explicit deterministic contract for local play, CPU play, Mirror Match, Practice/Lab forcing, and any future network authority. The reveal should be short enough not to stall ordinary turns.

### 2. Life Drain is effectively automatic

Life Drain made 40/40 standard, 40/40 broad-adversarial, and 40/40 low/moderate attempts. No miss appeared in broad seeds 1–100. The existing regression also requires 48/48 makes across four power levels and twelve seeds. Its minimum-spin floor, stronger centering force, and strong angular damping remove meaningful failure across broad inputs.

Plinko is the only event allowed to choose an automatic outcome. Life Drain must remain strongly assisted but permit clearly bad power, direction, or rotation to miss.

### 3. Physical bodies and rendered objects disagree

Fizz Jet's cap, Earthquake debris, Ice Slide bumpers, and Cap Toss's detached cap are physical but not rendered as such. Mitosis and Mirror Match use generic cyan circles rather than the selected object. Shrink Ray scales the collider without scaling the selected artwork. Roulette's rendered sectors do not share the authoritative wheel center or angle.

Every interactive event body needs one authoritative transform consumed by physics, renderer, audio/contact feedback, telemetry, and tests.

### 4. Launch telegraphs, audio, and cameras are inconsistent

Eleven canonical IDs have a named entry in the large launch-banner allowlist, Moon Gravity is named through a special branch, and Plinko has its own branch. The remaining 18 events show generic `✦ RARE EVENT!` in the large banner even though the smaller status line names them. Canonical Rainbow Corkscrew misses the legacy `rainbow-trail` banner key.

All non-Plinko events play the same generic `ignite` cue. There are no event-specific loops, impulses, or positional sounds. Only Plinko owns a dedicated event camera; other apparent camera effects are renderer overlays or the separate result-reaction camera.

The registry should expose canonical launch copy, sound phases, camera policy, color-independent glyph, and reduced-motion fallback for every event.

### 5. Current tests prove hooks more often than player experience

Existing tests strongly cover registry membership, deterministic odds, metadata shape, handler flags, and several reward adapters. Many visual tests are structural rather than pixel/contact-sheet validation. A forced event can therefore pass while its physical body is invisible, its visual transform is wrong, its cue arrives too late, or its make-rate band is pathological.

Every non-Plinko event needs broad make and miss evidence, an extreme miss, physical-runtime assertions, render-state agreement, reward/adaptor tests, cleanup after resolution/interruption/rematch/resize, all supported viewport buckets, reduced-motion parity, and human visual/feel approval.

## Individual event audit

| # | Event | Current physical behavior and reward | Current telegraph, visual, audio, and camera impact | Bias and current failure evidence | Specific v1.12 upgrade and acceptance | Performance and reduced-motion requirement |
|---:|---|---|---|---|---|---|
| 1 | Rainbow Corkscrew | Launch height ×1.18, spin ×0.94, then a real off-center sinusoidal horizontal/upward force. A valid landing grants one capped life; Team translates it to two raw points. | Rainbow border and trajectory trail are visible, but the large banner is generic because the canonical ID is absent from the legacy banner map. Generic `ignite`; no event camera. | Easier: `40/16/6`. Current `M10/X1`; weak/downward inputs can fail. | Pre-bind and show rainbow pre-glow before input. Render a clearly helical six-band path driven by `corkscrewForce`, add a spatial corkscrew whoosh, and keep bad power/direction missable. Accept with `M10/X1`, force-vector/trail agreement, capped reward, Team 2, cleanup, and all viewport directions. | Low–medium. Pool trail segments. Reduced motion: static six-band curved path and glow, identical force/outcome. |
| 2 | Half Full | A time-varying center-of-mass force destabilizes flight; base contact activates stabilizing torque. No special reward. | Renderer shows a blue strip across the table rather than liquid inside the current object. Large banner generic; generic audio; no camera. | Strong and non-monotonic assistance: `40/25/40`. Current `M5/X1`. It is not broad-input automatic, but the low/moderate band is effectively over-assisted. | Show fluid clipped inside compatible silhouettes or a transparent event chamber around incompatible objects, with level/tilt driven by `liquidShift` and `liquidVelocity`. Rebalance the unusually easy input band. Accept with `M5/X1`, moving-COM evidence, base-stabilization evidence, visual/physics phase agreement, and no reward. | Medium because of per-object masking. Cache silhouettes. Reduced motion: fixed tilted fluid surface plus static COM marker; physical shift remains. |
| 3 | Power Launch | Vertical launch ×1.72 and spin ×1.34; a small landing assist is available only when gesture power is at least 0.55. No special reward. | Bright vertical contrails and named banner, but no true launch shock ring, pad deformation, or camera response. Generic audio. | Easier: `40/22/31`. Current `M6/X1`; current rejected fixture `B5` also demonstrates an extreme poor-input miss. | Add visible launch-pad compression, expanding shock ring, longer contrails tied to velocity, bounded pullback, and power-launch audio. Do not normalize inputs into makes. Accept `M6/X1`, weak-power rejection, strong-power assist threshold, and result parity under camera/reduced motion. | Medium. Cap rings/trail count. Reduced motion: one static shock ring and velocity streak; no camera punch. |
| 4 | Fizz Jet | After about 90 ms, a separate collidable cap ejects and a pressurized thrust vector follows the object's rotating axis. Launch height ×1.12 and spin ×1.08. No reward. | Spray bubbles exist near the primary object, but the physical cap is invisible and the stream is only loosely aligned with the authoritative thrust. Generic banner/audio; no camera. | Near-neutral: `26/10/22`. Current `M8/X1`. | Draw the cap at its real body transform, render a continuous nozzle-aligned spray from `thrustVector`, and add pop/hiss audio that pans with the object. Accept `M8/X1`, cap-body existence/contact/cleanup, thrust-axis rotation, visible cap detachment, and no hidden collision. | Medium: one body plus spray pool. Reduced motion: visible detached cap and short static thrust vector; same physics. |
| 5 | Golden Flip | Mass rises 35%, restitution becomes almost zero, and late balance becomes more stable. A make counts as Golden/2-value; Team awards two. | Gold tint and border communicate rarity, but weight and impact are not visually physical. Generic banner/audio; no dedicated camera. | Easier on broad inputs but discontinuous elsewhere: `40/16/0`. Current `M10/X1`. | Add visibly heavier fall, deeper shadow, table dent/deformation, metal impact wave, and low-pitched thud driven by contact speed. Preserve an ordinary miss path. Accept `M10/X1`, mass/restition restoration after cleanup, Golden score in every mode, and no additive-cap confusion. | Low. Reduced motion: static heavy shadow/dent and one impact ring. |
| 6 | Bouncy Bottle | Restitution steps through approximately 0.88, 0.58, and 0.26 for up to three shrinking contacts; scoring waits up to six seconds. | Concentric landing rings show the theme, but the selected object does not squash/stretch and no bounce counter is synchronized to runtime. Generic banner/audio. | Hard: `11/7/3`. Current `M7/X1`. | Drive squash/stretch and sound pitch from contact speed, show three diminishing pulses, and retune final damping so skilled makes remain practical without auto-settling. Accept `M7/X1`, exactly bounded bounce progression, scoring only after final settle, timeout, and cleanup. | Low–medium. Reduced motion: discrete contact rings/count with no elastic animation; restitution unchanged. |
| 7 | Earthquake | Ground oscillates horizontally and vertically, near-table forces act on the object, and five debris bodies collide physically. | A zigzag line appears, but the table does not visibly track its physics offset, debris is invisible, and there is no quake camera or rumble. Generic banner. | Slightly easier: `22/11/17`. Current `M1/X2`. | Render all five debris bodies and table from authoritative transforms, add bounded camera shake and low rumble, and make debris contacts audible without becoming terminal. Accept `M1/X2`, real table displacement, visible collision agreement, both direction signs, cleanup/reflow, and reduced-motion parity. | Medium: five bodies plus camera/debris. Pool/cull debris. Reduced motion suppresses camera shake while the physical table/debris and a static quake border remain visible. |
| 8 | Moon Gravity | Gravity is 0.28×, spin is 0.76×, airtime is long, and settling may take five seconds. No reward. | Named banner and star field clearly change the mood, but stars are static and there are no low-gravity particles, debris, spatial audio, or long-arc camera. | Slightly easier broad, hard in the retuned low band: `38/12/0`. Current `M12/X1`. | Add slowly drifting particles/debris governed by the same gravity direction, widened camera framing, and airy audio. Accept `M12/X1`, gravity restoration, valid cap/upright outcomes, five-second boundary, viewport flight containment, and no result change from camera. | Low–medium. Reduced motion: fixed star/debris field and wide framing without animated drift. |
| 9 | Ice Slide | First touchdown produces an extended lateral slide and small relaunch; friction starts near zero and returns gradually over the final two seconds; two soft physical end bumpers and late stabilizing torque allow settling. | Long frost surface is visible, but the bumpers are invisible. No synchronized friction-return cue or long-slide camera. Named banner, generic audio. | Easier: `40/27/25`. Current `M2/X1`. | Render both bumpers from their bodies, add frost trail/skid audio, communicate friction return, and pan enough to retain the object and table target. Accept `M2/X1`, bumper contacts, nonautomatic miss, settle after friction returns, six-second boundary, and cleanup. | Medium. Reduced motion: fixed frost strip/bumpers and discrete contact flash; same slide/friction. |
| 10 | Alien Invasion | Temporarily applies 0.08 gravity to any selected object. A make requires at least one bank followed by tractor-ring entry; target and arena metrics scale by viewport. | Stars, obstacles, tractor ring, and bank challenge are visible. The ring state and completed-bank requirement could be clearer. | Miscalibrated: `17/25/24`. Current `M1/X2`; `X2` resolves by alien-flight limit. The corrective suite currently fails at 360×640: Alien `0.6833`, Classic `0.325`. | Recalibrate ring radius, attraction, bank distance, and timeout for every supported viewport. Show a bank counter and activate the tractor beam only after a bank. Accept make/miss/bank-timeout fixtures per viewport, difficulty confidence bounds versus Classic, arbitrary object/profile restoration, and interruption cleanup. | Medium: obstacles/target/camera. Reduced motion: static ring/beam/bank indicator; identical no-gravity challenge. |
| 11 | Gravity Slam | Gravity is 2.55×, spin is 1.72×, and bounded late alignment helps after a completed rotation. Runtime calculates contact-proximity compression. | Named banner and strong red downward streaks, but calculated `compression` is never applied to selected-object art. Generic audio; no camera punch. | Easier: `40/19/15`. Current `M9/X1`. | Drive real squash, shadow tightening, dust and impact wave from runtime compression/contact speed; add a short bounded camera punch and slam audio. Accept `M9/X1`, gravity/spin restoration, compression visual agreement, extreme miss, and no first-contact early verdict. | Medium. Reduced motion: one static compression frame/impact wave and no camera punch. |
| 12 | Trampoline | First table contact performs a real dramatic relaunch around `vy=-32`, preserves/adds spin, clears settling state, and waits for the return landing. | A large trampoline graphic is clear, but its deformation is not driven by actual contact/relaunch state. Named banner; generic audio/camera. | Easier: `40/24/36`. Current `M2/X1`; rejected poor-input fixture `B5`. | Deform and recoil the surface at exact contact, add spring audio and tracked framing for the return arc, and preserve weak/underrotated misses. Accept `M2/X1`, `B5` miss, exactly one relaunch, return-landing judgment, no stake/result on first contact, and cleanup. | Medium. Reduced motion: discrete depressed/released surface states without camera bounce. |
| 13 | Wind Tunnel | Sustained mass-scaled lateral force is applied off-center, generating translation and rotation; spin ×1.42; valid cap landings and a five-second settle are supported. | Named banner and moving wind streaks; streaks are not driven by the authoritative `gustVector`, and there is no spatial pan/camera sway. | Easier: `40/26/17`. Current `M3/X1`; `M3` provides a current valid cap make. | Align visual gusts and object lean to `gustVector`, add spatial wind audio and bounded camera sway. Accept `M3/X1`, cap validity, force-vector/visual agreement, both wind directions, five-second boundary, and camera/RM outcome parity. | Low. Reduced motion: static directional streamlines and glyph; force remains active. |
| 14 | Shrink Ray | After about 240 ms the collider scales to 0.62 and angular momentum conservation visibly accelerates rotation. Upright grants capped +2, cap grants capped +3; Team awards 2/3. | Rings imply a ray, but selected-object artwork and shadow remain full size while the collider is small. Generic banner/audio. | Highly input-sensitive: `0/12/8`. Current `M1/X2`; the standard vector failed 40/40. | Scale art, shadow and contact representation from the authoritative body transform, add ray beam and clear upright/cap payout cue, and recalibrate overrotation. Accept `M1/X2`, collider/art bounds agreement at every frame, angular-speed increase, both reward poses, cleanup scale restoration, and arbitrary object. | Low–medium. Reduced motion: static before/after silhouette with authoritative final scale; same inertia/result. |
| 15 | Portal Pair | Two linked portals are created. Crossing the entry teleports the object to the exit with speed and spin conserved while velocity direction rotates. Missing the portal leaves an essentially ordinary trajectory. | Portal rings are clear and attractive, but they are only revealed after launch. Generic banner/audio; no entry/exit camera or spatial cue. | Neutral: `40/10/4`. Current `M10/X1`. A separate handler fixture must prove teleportation because a make or miss alone does not prove entry. | Bind/reveal portals before input, ensure both reachable and intentionally avoidable paths, add entry distortion, exit flash, spatial audio, and a short camera handoff. Accept `M10/X1`, explicit entered and avoided seeds, speed/spin conservation tolerance, direction rotation, cleanup, and viewport containment. | Medium. Reduced motion: static high-contrast portal rings and instantaneous transfer without camera warp. |
| 16 | Tether Swing | The object is repositioned onto a nearly rigid cable, swings as a pendulum, and releases near the low point. Original launch is largely replaced by a tangent derived from event direction and power. | A dashed cable makes the mechanism visible, but tension, input mapping, and release timing are weakly communicated. Generic banner/audio. | Hard: `21/6/7`. Current `M9/X1`. | Map player power/direction predictably into amplitude and tangent speed, visualize cable tension and release flash, and add a creak/snap cue. Accept `M9/X1`, cable-length tolerance, low-point release, both directions, weak-input miss, constraint cleanup, and no ordinary parabola before release. | Low. Reduced motion: static cable/tension bar and discrete release marker; constraint physics unchanged. |
| 17 | Mitosis | At about 240 ms the object splits into two half-mass bodies with conserved angular momentum and opposed lateral velocities. Either copy may count; landing both grants capped +3. Team awards one or three. | The second body is a cyan circle rather than a copy of the selected object. Generic banner/audio; separate landing states are not clearly shown. | Slightly easier: `32/12/0`. Current `M8/X1`; `X1` demonstrates neither copy landing. | Render two true selected-object copies with authoritative transforms, separate shadows and landing indicators, plus a division flash/audio. Accept `M8/X1`, one-land and both-land fixtures, mass/angular-momentum tolerances, Classic/Team reward mapping, arbitrary variants, and cleanup. | Medium: second detailed object. Cache art layers. Reduced motion: instantaneous split and static glow, same two-body physics. |
| 18 | Double Flip | Requires two rotations. On first descent it provides a relaunch and angular assistance. A valid upright/cap landing doubles the flipper and halves active opponents with `max(1,ceil(lives/2))`. Team gives two and halves the opposing round. | Named banner, contrails, and ×2 marker are visible, but there is no authoritative two-rotation progress cue. Generic audio. | Easier: `40/16/4`. Current `M10/X1`. | Add `1/2 → 2/2` rotation indicator and double-helix path driven by actual accumulated rotation; make the reward transition explicit. Accept `M10/X1`, `<2` rotations rejected, upright/cap accepted after `≥2`, multiplier cap bypass, opponent rounding, Team adapter, and no duplicate relaunch. | Low. Reduced motion: static twin arcs and numeric progress; identical rotation threshold. |
| 19 | Ceiling Flip | Ground collision is disabled, gravity inverts, ceiling collision becomes active, and bounded torque helps align after a completed rotation. The ceiling is the validated landing plane. | A ceiling stripe and label are clear, but there is little inverted-world atmosphere or physical debris. Generic banner/audio/camera. | Slightly easier broad but hard in low band: `40/14/0`. Current `M11/X1`. | Add upward-falling debris/dust, ceiling impact FX/audio, and camera framing that keeps the ceiling target visible. Accept `M11/X1`, correct ceiling upright/cap definitions, floor non-resolution, inverted gravity/debris, timeout, and full collision-mask restoration. | Medium. Reduced motion: fixed inverted debris and ceiling target; no animated camera inversion. |
| 20 | Meteor Shower | Three collidable meteors fall and recycle. Contact deflects the object and is explicitly nonterminal. | Meteors render as simple orange circles. Meteor collision handling records the hit and immediately exits, so it never emits the normal impact sound/flash. Generic banner. | Neutral/slightly easier: `40/12/0`. Current `M10/X1`. | Render recognizable pooled meteors with authoritative transforms/trails and add throttled collision flash/audio without declaring failure. Accept `M10/X1`, hit and no-hit paths, deflection evidence, nonterminal contact, three-body cap, recycle bounds, and cleanup. | Medium. Reduced motion: real bodies with static trails and discrete contact ring; no particle shower. |
| 21 | Magnet | After a completed rotation, lateral force pulls toward center and late angular damping aligns the descent. It is assisted but not specified as guaranteed. | Named banner and strong concentric field rings clearly communicate magnetism. Generic audio; no source/polarity cue. | Easier: `40/16/0`. Current `M10/X1`. | Add visible magnet source/poles, authoritative field-direction cue, object torque reaction, and magnetic audio while retaining off-power/off-angle misses. Accept `M10/X1`, make/miss across both directions, force only after rotation, no result guarantee, always-magnet distinction, and cleanup. | Low. Reduced motion: static field lines/source; same force. |
| 22 | Heart Rush | Three timed impulses lift/steer the object and progressively damp spin. A valid landing grants capped +3; Team awards four raw points. | Four looping decorative hearts are not synchronized to `heartbeatCount`. Generic banner and activation audio, not three physical pulse sounds. | Easier: `40/16/0`. Current `M10/X1`; current rejected poor-input fixture `B5`. | Synchronize exactly three visible and audible pulses to runtime, draw each applied impulse on the trajectory, and stop FX after the third. Accept `M10/X1`, `B5` miss, heartbeat count/timing, +3 cap, Team 4, no fourth impulse, and cleanup. | Low. Reduced motion: three discrete static rings/counter changes, no pulsing animation; same impulses. |
| 23 | Black Hole | For up to 2.2 seconds a seeded singularity applies inverse-square attraction capped by distance. No reward. | A radial black/purple disk is visible, but no lensing, accretion, force-vector trail, or camera curvature communicates the partial orbit. Generic banner/audio. | Pathological response bands: `0/8/40`. Current `M7/X1`; standard failed 40/40 while low/moderate made 40/40. | Tune singularity placement and force across power/direction/viewports; add curved accretion particles and a path-bend trail from `attractionVector`. Accept `M7/X1`, near/far pull bounds, both orbit directions, broad make/miss distributions, performance cap, and cleanup. | Medium. Reduced motion: fixed concentric distortion rings and a static predicted curve; force unchanged. |
| 24 | Boomerang | Force carries the object outward and then toward a seeded target behind its origin. Runtime records `returned` when it comes within 55 px of the target. | A dashed arc is centered on the moving object. Origin and target are not marked; no return audio or camera cue. Generic banner. | Neutral: `40/10/0`. Current `M11/X1`. Critical defect: landing validation never requires `returned` or proximity to `targetX`. | Preveal and mark origin/target, render the authoritative outbound/return route, add spatial return whoosh, and require the returned/target condition in the verdict. Accept `M11/X1` only after fixtures are migrated to target semantics, plus off-target upright rejection and both directions. | Low. Reduced motion: static origin-to-target arc and markers; same curved force and target verdict. |
| 25 | Roulette Table | A static sensor circle below the ground tracks `wheelAngle`; while touching the ordinary floor, lateral force approximates wheel motion. Landing x relative to angle selects ×1/×2/×3/×4; multipliers bypass the additive cap. | Sectors are centered on current bottle `p.x`, do not rotate with `wheelAngle`, and show slot zero until resolution. The visible wheel and physical model disagree. Generic banner/audio; no tracked wheel camera. | Slightly easier: `39/13/4`. Current `M10/X1`. | Create one authoritative rotating landing platform or documented segmented approximation with friction transfer; freeze center, render sectors from the same angle, and keep camera on the platform. Accept `M10/X1`, every sector/multiplier, platform contact transfer, exact visual/physics angle agreement, cap bypass, Team multiplier, and cleanup. | Medium–high physics risk. Reduced motion may use slower/stepped visual rotation only if deterministic physical angle and payout remain identical. |
| 26 | Rewind | Retains up to 900 snapshots. The first failed verdict is suppressed, the object reverses to apex, and one corrected replay occurs; only the final verdict is charged. | A static reverse arrow appears, but snapshot reversal, apex, correction, and one-retry state are not strongly communicated. Generic banner/audio/camera. | Neutral with a bounded second chance: `36/12/0`. Current `M12/X1`. | Render ghosted snapshot trail/time smear, apex marker, reverse audio, and a one-use state indicator. Accept saved-first-failure, double-failure, first-success/no-rewind, final-only stats/reward/stake, snapshot cap, interruption cleanup, and `M12/X1`. | High retained-state risk. Cap/circular-buffer snapshots. Reduced motion: jump to apex with a static timeline cue instead of reverse animation; same final outcome. |
| 27 | Plinko | Arena floor/walls are disabled, the selected object becomes a radius-34 circle, and it falls through exactly eight staggered peg rows to nine slots. Anti-wedge nudges and a vertical tracking camera are implemented. Slot alone chooses automatic outcome/reward. | The board/camera are the strongest event presentation, but peg contacts lack dedicated sounds and the eight-row field no longer meets v1.12 length intent. Object identity is reduced while curled into a ball. | Intentionally automatic: `25/28/23`. Current `M1/X2`, meaning non-loss versus automatic-loss slot. It is the sole allowed automatic event. | Extend substantially beyond eight rows, retain nine-slot order, throttle peg sounds, keep object identity visible, cull off-camera geometry, and keep labels/camera readable to the bottom. Accept at least two deterministic seeds per slot, long-board camera continuity, anti-wedge recovery, Cup heat and Team match terminal behavior, permanent magnet, and exact outcome provenance. | Highest event cost. Pool/cull pegs and labels by camera window. Reduced motion: static peg-contact flashes and smooth non-bouncy camera; physics and slot result identical. |
| 28 | Mirror Match | Current flip receives a noncolliding reflected presentation. Opponents' next flips copy normalized launch, spin, seed, and profile once with nested events/rewards disabled. | A reflective midline and cyan circle appear rather than reflected selected-object art. Armed opponents do not receive a sufficiently persistent/clear cue. Generic banner/audio. | Neutral: `36/10/0`. Current `M12/X1`. | Render the actual selected object and variant reflected at the authoritative transform; badge each armed opponent until consumed and show copied direction/power without exposing seeds. Accept `M12/X1`, multi-opponent consumption order, exact normalized replay, no nesting, object-profile policy, rematch/elim cleanup, and Team one-point behavior. | Medium: second detailed object and persistent state. Reduced motion: static reflected silhouette/badges; replay mechanics unchanged. |
| 29 | Cap Toss | After about 210 ms a light independent cap separates. The main object and cap have separate landing trackers and both must land correctly. A make grants capped +5; Team gives five. | The detached cap is not rendered from its body, the primary art can still appear capped, and the ground ring is not a substitute for the second target. Generic banner/audio. | Easier broad but genuinely fallible: `40/26/6`. Current `M2/X1`; `X1` is a `cap-toss-incomplete` failure. | Render capless primary art and the cap from authoritative transforms with separate shadows, contact sounds, and two-state landing indicator. Accept `M2/X1`, body-only and cap-only failures, both-body success, +5 cap, Team 5, arbitrary object adaptation, and cleanup. | Medium. Reduced motion: both bodies and static status indicators remain visible; no looping particles. |
| 30 | Life Drain | A stronger center magnet, strong angular damping, and a minimum spin floor guide the object. On success every active opponent is set to one life and the arena remains green. Team excludes the event. | Strong green transformation is visible, but concentric magnetic rings disclose the magnet that metadata says should remain hidden. Named banner; generic audio/camera. | Effectively automatic: `40/40/40`; current `M1`, no `X` in broad seeds 1–100. Existing regression enforces 48/48 makes. | Remove minimum-spin guarantee and reduce alignment to strong-but-fallible assistance. Keep the toxic-green arena but replace magnetic rings with nondisclosing drain distortion. Freeze a real extreme-miss seed. Accept broad makes and misses, bad-direction miss, reward only on make, active-opponent targeting, Team exclusion, green persistence, and cleanup. | Medium PvP/UI risk. Reduced motion: static green distortion and opponent-state cue, hidden assist and outcome unchanged. |

## Cross-mode requirements

### Classic and Cup

- The same physical event and reward contract must apply in ordinary Classic and Cup heats.
- Cup shootouts must keep events disabled.
- Plinko automatic win/loss resolves only the current Cup heat, then the series continues or ends according to heat score.
- Additive rewards use the 1.5× starting-life cap; explicit multipliers bypass it.
- Double Flip opponent halving and Life Drain affect only active opponents.
- Rewind must charge lives, stake, sudden death, ON FIRE, statistics, and achievements only once, from its final outcome.

### Team Clash

The authoritative Team adapter must retain these mappings:

- Rainbow Corkscrew: two raw points on make.
- Golden Flip: two raw points.
- Shrink Ray: two upright, three cap.
- Mitosis: one for one landed copy, three for both.
- Double Flip: two plus halve the opposing round.
- Heart Rush: four.
- Roulette Table: multiply the ordinary raw score by the landed sector.
- Cap Toss: five.
- Mirror Match: copied result scores once, with no nested reward.
- Plinko automatic win/loss resolves the match; double/halve/magnet use Team semantics.
- Life Drain remains excluded.

Each adapter needs positive, miss, malformed-metadata, duplicate-resolution, and replay/idempotence tests.

### Practice and Physics Lab

- Exact allowlisted event display names may force their event only in Practice/advanced Lab.
- Forced sessions remain Test Data and are excluded from progression, achievements, mastery, and default statistics.
- Physics Lab must expose the canonical event ID, seed, landing reason, runtime metrics, cleanup result, and successful-shot ghost without changing gameplay state.
- Practice and Lab should be the primary source for the human visual/feel approval seeds.
- Plinko permanent magnet is temporary to the practice session and must not persist into a real match.

### Alien and Alien Invasion

- Native Alien mode and Alien Invasion share scalable no-gravity/bank/tractor primitives but have separate lifecycle ownership.
- Alien Invasion must temporarily override any selected object's profile and restore it after make, miss, timeout, interruption, rematch, or viewport reflow.
- An event forced while already in native Alien requires an explicit policy; it must never leave doubled no-gravity or stale targets.
- Random events in native Alien need an allowlist or defined composition contract. Unsupported nested landing-plane events should be rejected deterministically rather than silently combining.

### Insane and `Mr. Howe`

- Insane must continue to use at most one event, exclude Life Drain, and weight Plinko at 1.25 relative units.
- Exact `Mr. Howe` multiplies Normal event weights by ten but must not stack with Insane.
- Player-facing UI, Stats Lab, and exports must not disclose programmed odds or say “1 in 3.”
- The prelaunch reveal must not change the already-bound seed/event when an input is cancelled or retried; define whether cancellation consumes the bound event.

### Mirror, Arena Draft, and event composition

- Mirror Match copies normalized launch/spin/seed/profile once; copied flips disable nested events and event rewards.
- Arena Draft currently forces the selected symmetric physics profile and therefore suppresses a random event on that flip. Its canonical reward ID is stripped when the forced profile matches the arena profile.
- Add explicit Arena Draft tests proving there are no event rewards, event achievements, programmed-event statistics, or nested random events unless the v1.12 contract deliberately changes that policy.
- Every event must clean bodies, constraints, collision masks, forces, camera state, renderer state, audio loops, pending rewards, and profile overrides on every terminal path.

### Online beta

- Online remains hidden/fail-closed until sender identity and host authority are implemented.
- The internal authority harness must validate every event-specific metadata shape, reject forged or incomplete Plinko/Roulette/Cap Toss/Mitosis/Mirror/Rewind results, and prove duplicate/stale/late messages cannot resolve rewards twice.
- Prelaunch event binding must become part of the authoritative seed envelope before online can be exposed.

## Acceptance matrix for every event

No event is qualified until its evidence row contains:

1. Exact clean RC SHA, browser/device, viewport and direction.
2. Immutable event/input seed-corpus version.
3. Canonical make, ordinary miss, and extreme miss for every non-Plinko event.
4. Physical-handler evidence tied to the event's defining mechanic.
5. Authoritative body/constraint transform matched by renderer and contact feedback.
6. Prelaunch telegraph, active-state cue, result cue, sound phases, camera policy, and reduced-motion fallback.
7. Ordinary, cap, timeout and event-specific landing-reason behavior where applicable.
8. Reward/effect tests in Classic, Cup and Team or an explicit exclusion.
9. Practice/Lab Test Data marking and default-statistics exclusion.
10. Cleanup after make, miss, timeout, interruption, rematch, menu exit, and deferred viewport reflow.
11. Representative phone, tablet, desktop, smartboard and 4K evidence.
12. Performance trace for the event's worst case and memory stability after repeated forcing.
13. Color-independent and keyboard/screen-reader announcement evidence.
14. Human approval of spectacle, clarity, fairness, and fun.

## Priority and risk ranking

### P0 — contract or gameplay correctness

1. Bind and telegraph the event before accepting the flip input.
2. Make Life Drain genuinely fallible; replace the contradictory 48/48 regression with make and extreme-miss fixtures.
3. Fix Alien viewport calibration before any RC qualification.
4. Enforce Boomerang's returned/target condition in the landing verdict.
5. Rebuild Roulette around one authoritative physical and visual wheel.
6. Render every physical cap, debris body, bumper, split copy and mirror copy.
7. Make Shrink Ray art, shadow and collider share one scale.
8. Migrate Plinko's exact-eight-row regression to the longer v1.12 board contract.

### P1 — balance, clarity, and event identity

1. Rebalance Half Full, Black Hole, Shrink Ray, Bouncy Bottle and Tether Swing across low/mid/high power and supported viewports.
2. Replace all 18 generic big banners with registry-owned canonical names and icons.
3. Add registry-owned event sound and camera policies instead of a universal `ignite` cue.
4. Render Mitosis, Mirror Match and Cap Toss using the actual selected object/variant.
5. Synchronize Bouncy, Heart Rush, Gravity Slam, Trampoline, Wind and Meteor FX to runtime state.
6. Add clear, persistent pending-effect UI for Mirror Match and Always Magnet.

### P2 — spectacle and performance polish

1. Add bounded deformation, trails, particles, impacts and camera response to remaining events.
2. Pool transient bodies/particles and cull off-camera Plinko geometry.
3. Replace purely color-based cues with glyph, motion/shape, sound and text combinations.
4. Create per-event reduced-motion contact sheets and performance traces.
5. Require human approval for all 30 event presentations before release.

## Release blockers identified by this audit

The event system cannot pass the v1.12 release gate while any of the following remains true:

- The candidate worktree is dirty or lacks an exact immutable RC SHA.
- Any non-Plinko event is guaranteed or effectively automatic across broad inputs.
- Alien calibration fails against Classic at a supported viewport.
- Boomerang can make without returning to its target.
- Roulette physics and rendered wheel disagree.
- An invisible body can affect an outcome.
- Shrink Ray's visual and collision sizes disagree.
- Plinko remains fixed to the obsolete exact-eight-row test contract.
- Event selection is announced only after input while events are described as skill-based.
- A reward/effect can resolve twice or differ across Classic, Cup, Team, replay, or authority paths.
- Reduced motion changes mechanics/outcomes or removes the only understandable cue.
- Worst-case event performance misses the release target.
- Human visual/feel approval is incomplete.
