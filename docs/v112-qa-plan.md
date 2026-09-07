# Flipgame v1.12 master QA plan

> **Reference only:** counts, caps, Story, Battle, progression and release gates
> are governed by `docs/v112-contract.md`.

- Status: active qualification contract
- Baseline: immutable public v1.11 commit
  `947133360d3487a646e04be2b313c577474f54a5`
- Target: `v1.12`, released only after explicit product-owner approval

## 1. QA authority and release rule

The QA Program Manager is read-only. It owns requirement traceability, case
IDs, fixture versions, evidence standards, independent assignments, defect
routing, and the final gate report. It never fixes defects or changes an
expected outcome after seeing a failure. The Program Integrator alone merges,
resolves shared interfaces, activates release identity, and publishes.
Subsystem owners fix their own defects; independent QA verifies the fixes.

No v1.12 tag or deployment is allowed until one clean candidate SHA has:

- complete Q00–Q16 evidence with no missing, skipped, stale, or unexplained
  results;
- zero known open P0, P1, or P2 defects;
- matching source/build identity across both web origins, PWA cache, GitHub
  release, and signed APK;
- explicit product-owner approval of the exact candidate; and
- an independently verified post-release result.

Public aggregate telemetry remains off unless its separate privacy/data
contract is approved. Online play is removed completely from the shipped
v1.12 build: it has no menu, route, room flow, loaded or cached runtime module,
reachable code path, socket/fetch connection, background worker, or service-
worker asset. Inert legacy Stats/save/import fields may remain solely to read
older local data; they cannot activate networking or expose an online surface.
The original Bottle retains its style and never receives a face.
The original T-Rex is immutable in art, animation, physics, collider, scoring,
and style.

### Provisional v1.12 player-cap contract

- Local Classic and both Cup formats support every player count from 2 through
  16.
- Local Team Clash supports every even player count from 2 through 16.
- Local Battle Mode supports Duel 1v1, Doubles 2v2, and equal Team Battle
  rosters from 3v3 through 8v8, plus Four-Way Free-for-All (1v1v1v1).
- There is no Online mode at any player count. Historical records that say
  `online` remain inert data and never become playable sessions.
- Active play always keeps Current, On Deck, and After That visible.
- Setup, active roster, score/history, Stats, Game Over, and rematch surfaces
  use paging or bounded virtualization for large rosters. Off-page players
  remain in rules, order, accessibility, stats, and rematch state.

Because this cap is provisional, Wave 0 must freeze it into the authoritative
v1.12 contract before implementation is judged.

### Battle Mode contract gate

Battle Mode is required in v1.12. Duel activates one flipper per side (two
simultaneous lanes/contacts). On a calibrated large screen, Doubles activates
both members per side (four lanes/contacts). Team Battle supports three through
eight players per side and activates at most two representatives per team
(four total); active pairs rotate only after each completed volley. Four-Way
Free-for-All activates four independent players, lanes, scores, and power
meters. Four active objects is the universal runtime cap. Team score and charge
are shared only in team formats, while every launch and outcome remains
attributed to the individual flipper.

Any targeted sabotage requires the acting player to select a valid opponent
before the effect can arm. No rule, CPU helper, UI default, stale selection, or
tie breaker may automatically target the leader. A symmetrical Chaos effect
targets no individual and applies the same lane-normalized magnitude, duration,
timing, and eligibility to all four active objects.

Runtime calibration may unlock only a simultaneous-contact count it actually
observes; reported device capability or viewport width alone is insufficient.
A device calibrated for two or three contacts retains Duel and runs larger
Battles as a two-lane relay with one representative per team. A one-contact or
keyboard-only device receives the frozen accessible sequential fallback.
Native Four-Way Free-for-All and four-lane team play unlock only after four
simultaneous contacts are observed on a large screen; an ineligible device
receives the frozen, clearly announced fallback/format choice rather than a
false four-lane surface. Four-lane play must sustain at least 45 FPS.

Wave 0 still must freeze lane geometry, isolated-world versus inter-object
collision policy, volley start/completion, unequal settle timing, same-frame
verdict/scoring order, tie/terminal precedence, event concurrency, rematches,
CPU policy, calibration persistence/invalidation, and adaptation of Current/On
Deck/After That before Battle implementation merges. Freeze FFA eligibility and
fallback, the exact large-screen threshold, sabotage target validity/expiry,
and Chaos symmetry in the same gate.
No specialist may infer these rules. More than four active flippers, phantom
calibrated contacts, leader auto-targeting, asymmetric Chaos, a half-enabled
fallback, or results dependent on pointer callback order block release.

## 2. Evidence ledger

Every assertion receives an immutable ledger row:

| Field | Required value |
|---|---|
| `caseId` | Stable `V112-Qnn-xxxx` ID |
| `requirement` | Exact contract section/revision |
| `risk` | P0, P1, P2, or P3 |
| `owner` | Implementation subsystem owner |
| `candidateSha` | Full clean Git SHA tested |
| `environment` | OS, browser/WebView, device, viewport, DPR, input type |
| `fixture` | Versioned fixture and seed corpus |
| `dimensions` | Exact mode/player/lives/direction/object/event/etc. values |
| `procedure` | Versioned command or manual protocol |
| `expected` | Frozen before execution |
| `actual` | Machine-readable result and concise observation |
| `artifact` | Durable path and SHA-256 |
| `executor` / `verifier` | Tester identities and UTC timestamp |
| `status` | `PASS`, `FAIL`, `BLOCKED`, or `NOT-RUN` |
| `defect` | Defect ID, owner, fix SHA, and retest SHA |

A console “passed” line is not sufficient. Preserve structured test output,
logs, state/physics traces, screenshot manifests, performance traces,
accessibility reports, origin byte manifests, and APK identity evidence under
an immutable root such as `artifacts/v112/<full-sha>/`. A row without the exact
SHA, frozen expected result, fixture version, and artifact digest is `NOT-RUN`.
Random tests count only when the generator, seed range, and sample size replay
exactly. Retries, skips, timeouts, quarantines, or missing devices never count
as passes.

Any candidate change invalidates directly and transitively affected rows. A
shared-interface change invalidates every producer and consumer. Human visual
or feel approval is SHA-bound.

## 3. Coverage method

### Mandatory full enumeration

- qualifying-win snapshots 0–101;
- all 100 achievements, each with a positive and nearest negative trigger;
- 51 objects × 12 variants = 612 stable variants;
- all 40 personal cosmetics, 22 arenas, and 30 events;
- all nine Plinko slots;
- Classic counts 2–16, Short Cup 2–12, Full Cup 2–8, Team even counts 2–16,
  and Battle rosters 1v1,
  2v2, 3v3, 4v4, 5v5, 6v6, 7v7, 8v8, and 1v1v1v1;
- lives 3, 5, 10, 20, and 100 wherever supported;
- both directions, all three CPU difficulties, and all three Physics Feel
  settings;
- observed contact-calibration cases 0, 1, 2, 3, 4, and 5+, including false
  device reports and lost capability; and
- all supported input types, filters, imports/exports, migrations, screens,
  breakpoints, runtime files, and APK assets.

### Mandatory Cartesian coverage

- mode × every legal player count × both directions × every applicable life
  preset × roster class;
- event × all 51 objects × four physics viewports × both directions × low,
  controlled, and extreme power, using one representative variant only after
  all 612 variants prove physics identity;
- Feel × input power × direction × mouse/touch/pen trace;
- CPU difficulty × direction × viewport × player-count class, including 16;
- Plinko slot × relevant mode adapter × viewport;
- name corpus × every ingress/egress boundary;
- save version × payload class × storage backend; and
- Battle format/roster × calibrated tier (sequential, two-lane, four-lane) ×
  active representative/pair × direction × outcome order × rematch;
- two- and four-pointer source tuple × lane assignment × launch offset ×
  outcome tuple × capability/fallback class × eligible large viewport; and
- targeted sabotage × each acting lane × every legal opponent ×
  leader/nonleader/tied state × valid/stale/invalid selection, plus symmetric
  Chaos × all four lane assignments and both directions; and
- all legal and illegal local player-cap boundaries: 1, 2, 8, 9, 15, 16, 17
  plus every odd Team count.

### Pairwise reduction

Pairwise reduction is allowed only for visual composition after proving that
variants, cosmetics, and arenas are paint-only and all individual values pass
full enumeration. The generator must cover every pair among object family,
variant index, cosmetic, arena, viewport, mode, reduced-motion, event overlay,
and reaction state, and report zero uncovered pairs. Add targeted triples for
transparent/liquid art, tall/wide objects, animated cosmetics, event overlays,
and 16-player roster previews. A failure promotes affected dimensions to full
Cartesian testing.

Rules, rewards, progression, achievement eligibility, event/object
compatibility, player caps/order, names, saves, offline/network-surface
security, simultaneous-Battle rules/input/fairness, and release identity may not
use pairwise reduction.

## 4. Frozen fixtures

| Fixture | Contents |
|---|---|
| `V112-ROSTER-1` | Stable P1–P16 IDs; all-human, one-CPU, alternating mixed, and all-CPU rosters; balanced Team and Battle assignments; off-page-current/on-deck cases |
| `V112-MODE-1` | Classic, Short/Full Cup, shootout, Arena Draft, Team Clash, Battle Duel/Doubles/3v3–8v8/Four-Way FFA, Practice, Lab, native Alien, Insane; explicit absence of Online |
| `V112-SETTINGS-1` | Lives `3,5,10,20,100`; directions `+1,-1`; CPU `easy,medium,hard`; feel `forgiving,standard,pro` |
| `V112-INPUT-1` | Mirrored mouse/touch/pen traces at quarter, controlled, high, one-jump, cancel, multitouch, and lost capture |
| `V112-BATTLE-1` | Two- and four-pointerId traces with 0/1/8/16/33 ms launch offsets; all outcome/settle orders; crossed drags; cancellation/lost capture; sequential/two-lane/four-lane calibration and fallback; pair rotation; shared-team and four independent score states; sabotage targets; symmetric Chaos; 1080p/4K corpus |
| `V112-VIEWPORT-1` | `360×740`, `768×1024`, `1280×720`, `1366×768`, `1920×1080`, `3840×2160`; representative DPR; airborne resize pairs |
| `V112-EVENT-1` | Each event's canonical make, miss, extreme miss, cleanup and reduced-motion seeds; at least two seeds per Plinko slot |
| `V112-ODDS-1` | At least five million fixed rolls each for Normal, exact `Mr. Howe`, and Insane |
| `V112-ALIEN-1` | Shared 300-shot ordinary/Alien corpus plus bank, no-bank, ring, edge, and timeout cases |
| `V112-PROGRESSION-1` | Wins 0–101; v110/v111/public-v1.11 migrations; queued/partially announced rewards |
| `V112-ART-1` | All 612 variants; four animation phases; idle/airborne/contact/impact/settled/reduced states and fixed flip seeds |
| `V112-DATA-1` | Exact 2-, 8-, 9-, and 16-player Classic/Cup/Team sessions; Test Data; 100,001 flips; hostile cardinality; chained/malformed archives |
| `V112-NAMES-1` | Safe accents/punctuation, blocked words, substitutions/repeats/separators, controls/bidi, full-width and Unicode confusables, QA allowlists |
| `V112-OFFLINE-1` | Fresh, upgraded, cached and APK runtime graphs; menu/route probes; socket/fetch/EventSource/WebRTC traps; CSP capture; inert legacy online-shaped Stats/save/import records |
| `V112-RELEASE-1` | v1.11 installed PWA/APK, clean v1.12, interrupted cache, stale assets, dual-origin manifests, signing certificate |

Fixtures and expected results are committed before execution. A fixture change
requires a reason and invalidates every dependent row.

## 5. Q00–Q16 qualification matrix

### Q00 — identity and provenance

- Clean candidate, expected ancestry, no secrets, exact dependency inventory.
- v1.12 on every screen, export, manifest, cache, APK, tag, and release asset.
- GitHub Pages, mapzimus, PWA, APK, and source publish identical runtime bytes
  except documented environment-bound files and carry the same full SHA.
- Public v1.11 tag, cache, release, and artifacts remain immutable.

Evidence: tree/commit manifests, secret scan, version inventory, runtime
SHA-256 reconciliation, APK `aapt`/`apksigner` results, independent verifier.

### Q01 — landing, lives, ON FIRE, and lifecycle

- `airborne → contact → settling → resolved`, one verdict, no first-contact
  miss, correct ordinary/event deadlines, relaunch and timeout boundaries.
- Upright, cap, perfect, edge, moving, side, off-plane, and every event-specific
  plane; mirrored direction results and airborne resize invariance.
- ON FIRE +1 upright/+2 cap, streak beyond three, free ending miss, retained
  stake/lives, clean cap termination, exact 8-player/3-life reproduction and
  repeat at 9 and 16 players.
- Additive cap `ceil(start×1.5)`, multiplier bypass, opponent floor
  `max(1,ceil(lives/2))`, elimination stored/displayed zero.
- Every sudden-death level gives all 2–16 players a full turn before escalation.
- One wake lock, release on menu, reacquire only on resumed active play.
- In Battle, all two/four objects own independent lifecycle state and exactly
  one verdict. A volley cannot resolve, score terminal state, or rotate a relay
  until its final active object resolves; identical-timestamp verdicts use the
  frozen deterministic order without suppressing or double-charging a result.

Evidence: per-frame physics traces, verdict reasons, state snapshots, complete
turn sequences, mocked resource-call ledger.

### Q02 — modes and scoring

| Surface | Counts | Required coverage |
|---|---:|---|
| Classic Normal/Insane | 2–16 | all lives/directions/roster classes; elimination, sudden death, terminal win, all rematches |
| Short Cup | 2–12 | fixed 3 lives, 3 rotations, 2–0/2–1/reverse sweep/tied shootout, heat reset/starter rotation |
| Full Cup | 2–8 | fixed 10 lives, 5 rotations, same series/tie/rematch coverage |
| Arena Draft | matching Cup roster cap | three symmetric physics-only offers, selection, invalid/asymmetric rejection |
| Team Clash | even 2–16 | three alternating flips/team, 1/2 scoring, cancellation, first 11, teammate/starter fairness, Swap Teams |
| Battle Duel | 1v1 | two simultaneous lanes, individual outcomes, same-frame/tie rules, sequential fallback and rematch |
| Battle Doubles | 2v2 | four active lanes when calibrated/large; two-lane relay fallback; shared team score/charge and individual attribution |
| Team Battle | 3v3–8v8 | at most two active representatives/team; pair rotation after a completed volley; shared score/charge, full relay fairness |
| Four-Way FFA | 1v1v1v1 | four independent lanes/scores/meters; explicit sabotage target; symmetric all-four Chaos; no leader auto-targeting |
| Practice/Lab/Alien | one active | availability/unlock, no progression, forcing/replay, bank then ring |

Cup shootouts disable events. Team event adapters convert additive/multiplier
effects correctly, exclude Life Drain, and resolve Plinko at match level. Cup
Plinko resolves its heat. Rules-owned rematch proposals—not UI calculations—
drive Same Setup, Rotate First, Shuffle, and Swap Teams.

For Battle, run no-event and every eligible event in every lane, every ordered
cross-lane event pair, and targeted four-lane stress tuples. Cover all outcome
tuples, identical and staggered contact/verdict timestamps, simultaneous
terminal results, and cancellation/lost capture in each lane. One player's
physics, camera, audio, particles, event cleanup, outcome, power meter, or input
state may never mutate another's except through an explicitly frozen collision,
team, sabotage, or symmetric-Chaos rule. Team reward/charge and FFA independent
score or target effects receive full Cartesian rules coverage.

### Q03 — 2–16 order, caps, paging, and fairness

- Full local Cartesian matrix for every Classic count 2–16, Short Cup 2–12,
  Full Cup 2–8, and Team even count 2–16, every Battle format/roster, both
  directions, applicable lives, and roster classes.
- Every seat can start, receives the correct number of turns, can become
  Current/On Deck/After That, can win, and rotates fairly across Cup heats,
  Team rounds, and rematches.
- Team membership remains equal; teammates alternate fairly at 2, 4, 6, 8,
  10, 12, 14, and 16. Odd counts and duplicate/invalid seat IDs fail closed.
- Battle rejects unequal teams, 0v/9v rosters, malformed Doubles, and any FFA
  roster other than four distinct players without partial state mutation.
- In Battle Doubles/Team, enumerate every one- and two-representative starting
  set. A relay advances only after every attempt in the current volley resolves;
  no early-settling lane starts the next volley. Four-lane team play rotates an
  entire pair per team, and two-lane fallback rotates one representative per
  team, until every member has equal exposure before reuse.
- Four-Way FFA keeps four independent identities/order slots and never routes
  another player's score, meter, verdict, or selected sabotage target into the
  wrong lane. Shuffle/rematch rotates physical lanes without changing ownership.
- Local boundaries 1 and 17 reject without partial roster, records,
  progression, storage, or UI mutation.
- Paging/virtualization never changes rules order. Move Current across every
  page boundary and wrap 16→1 in both directions. Current, On Deck, and After
  That remain simultaneously visible even when their full cards occupy other
  pages.
- Same Setup, Rotate First, Shuffle, and Swap Teams preserve all 16 players,
  stable IDs, human/CPU type, object/variant/cosmetic, and fair proposals.

Evidence: generated expected/actual turn and Battle-volley sequences, active-
cap assertions, fairness/exposure tables per seat, team/individual state hashes,
page-transition hashes, invalid-boundary atomicity snapshots, and videos for
8→9, 16→1, two→four-lane calibration, and pair rotation.

### Q04 — mouse, touch, pen, and keyboard

- Low/quarter, controlled and high pointer traces produce meter/launch parity;
  one-jump distance is only the matching fallback.
- Active pointer type controls equalization; screen-size media queries do not.
- Cancel, multitouch, wrong pointer, lost capture, resize, and rapid repeat
  cannot double-launch or corrupt the next turn.
- In Battle, bind each active lane to its initiating `pointerId` and keep
  capture, meter, power/direction sampling, cancellation, and release independent
  when two or four touch/pen pointers move, cross, lift, cancel, or lose capture
  in any order. Document whether mixed mouse/touch, multiple pens, and assistive
  pointer sources are supported; never assign by event arrival order after
  gesture start.
- Calibration must observe concurrent contacts. Exercise reported capability
  0–5+ against observed 0–5+, partial/cancelled calibration, reboot, orientation,
  display change, and device reconnect. Never unlock four lanes from
  `maxTouchPoints`, viewport width, prior hardware, or synthetic single-pointer
  input alone; never activate more than four objects.
- A large screen with four observed contacts enables four lanes. Two observed
  contacts retain Duel and two-lane relay for larger teams; three observed
  contacts cannot unlock a phantom fourth lane. A narrow display,
  one-contact/keyboard-only device, denied pointer capture, or lost calibration
  gets the frozen announced fallback before Battle starts and cannot strand or
  disadvantage any participant mid-match.
- Freeze `touch-action`, scrolling, zoom, edge-swipe, and browser-gesture policy
  for all active lanes. Two or four gestures cannot pan/zoom the page, steal
  another lane's capture, or trigger navigation.
- Keyboard covers every menu, roster page, Customize tab/tile, modal, start,
  pause, game-over, rematch, Stats filter, and import/export control with
  correct focus trap and restoration.

Evidence: replayable traces with pointer IDs, timestamps, peak signal,
displayed power and final vector; capture/touch-action ledger; capability and
fallback matrix; keyboard/focus transcript and device video.

### Q05 — ordinary physics, Feel, CPU, and Alien

- Forgiving/Standard/Pro share the same ideal launch; only off-speed tolerance
  differs monotonically. Quarter strength is not the normal full-flip route and
  controlled middle input retains a broad make window.
- Direction pairs are symmetric at every viewport.
- Every Battle lane uses either an isolated physics world or the exact frozen
  collision policy. Replay every two- and four-lane assignment, launch order,
  and 0/1/8/16/33 ms offset. With equal inputs, lane/team identity and callback
  order cannot create a statistically or deterministically different
  trajectory, settle deadline, verdict, reward, score, or charge.
- At least 10,000 bound seeds for each CPU difficulty × direction × viewport ×
  player-count class, including 2, 8, 9, and 16. On the frozen ordinary-physics
  corpus, Easy must make 30–40%, Medium 45–55%, and Hard 60–70% at every
  supported viewport and direction. No CPU is perfect; all-CPU 16-player
  matches finish without timing starvation.
- Replay the matched human-skill corpus through Classic, native Alien, and Alien
  Invasion at every supported viewport. Each Alien form's make rate must be
  within ±10 percentage points of Classic at that viewport, and its own
  phone-to-4K spread must be at most 10 percentage points.
- Native Alien and Alien Invasion score only after the object visibly banks off
  the UFO and then enters the tractor ring. Geometry, forces, and viewport
  scaling may create that path; no verdict override, hidden auto-make, skipped
  bank, or ring-only entry can pass. Event profiles restore for every object.

Evidence: input, rotation, apex, CPU-band and matched Classic/Alien make-rate
tables with sample size/confidence summary, viewport-spread calculation, bank/
ring contact traces, verdict call graph, exact edge traces, and product-owner
playtest approval.

### Q06 — every physical event

Enumerate all 30: Rainbow Corkscrew, Half Full, Power Launch, Fizz Jet, Golden
Flip, Bouncy Bottle, Earthquake, Moon Gravity, Ice Slide, Alien Invasion,
Gravity Slam, Trampoline, Wind Tunnel, Shrink Ray, Portal Pair, Tether Swing,
Mitosis, Double Flip, Ceiling Flip, Meteor Shower, Magnet, Heart Rush, Black
Hole, Boomerang, Roulette Table, Rewind, Plinko, Mirror Match, Cap Toss, and
Life Drain.

For every event require a unique telegraph; materially distinct physics;
coherent visual/audio/camera/HUD; color-independent cue; documented bias and
skill tradeoff; broad fixed corpus containing a make, miss, and extreme miss;
  correct reward; all 51 objects; Normal/`Mr. Howe`/Insane/forced/Cup/Team/
  Battle adapters; cleanup after verdict/rematch/resize/interruption/replay;
  reduced-motion equivalence; and 1080p/4K performance. No event may be
  guaranteed.

Special assertions include Wind cap validity, Bouncy/Ice settling, Portal
conservation, Double Flip two rotations plus compound reward, Ceiling plane,
Roulette settled sector, Rewind final-only verdict, Mirror non-nesting, Cap
Toss dual targets, Life Drain strong-but-fallible assistance, and Plinko's nine
ordered slots, substantially longer peg field, anti-wedge recovery, tracked
camera, readable prize band, and unchanged seed-to-slot result.

Alien Invasion repeats Q05's matched-human ±10-point Classic parity and
≤10-point phone-to-4K spread within the event controller. Its visible UFO bank
must precede tractor-ring entry, with both contacts present in the physics trace;
the event cannot replace the landing verdict, grant a synthetic make, or retain
Alien geometry/forces after cleanup.

Run at least five million fixed seeds for Normal, exact `Mr. Howe` 10× weights,
and Insane. Verify mutual exclusion, Insane one-third activation, equal eligible
weights with Plinko 1.25×, Life Drain exclusion, and no player-facing odds.
All event names force only in Practice/Lab and latch Test Data for the session.

Battle adds a concurrency layer after every event passes its full solo matrix:
run each event in each lane while the others are ordinary, every ordered event
pair across distinct lanes, an interaction covering array with zero uncovered
pairs across four lane positions, and targeted worst-case four-event tuples for
camera replacement, arena mutation, multiple bodies, rewind, Plinko, and
opponent effects. This reduction applies only to cross-lane concurrency; event
physics, rewards, sabotage targets, team/FFA adapters, and cleanup stay fully
enumerated. Targeted sabotage cannot arm without an explicit current opponent
selection and never defaults to the leader. Symmetric Chaos applies identical
lane-normalized parameters to all four objects and cannot read rank. Plinko or
another tracked-camera event cannot hide or pause an unrelated live lane unless
the frozen Battle contract explicitly pauses the whole volley.

### Q07 — 51 objects, 612 variants, cosmetics, arenas, and roster art

- Render every variant in picker, upright, quarter-turn, airborne, inverted,
  landing, impact, and reduced-motion states; assert finite commands, no blank,
  clipping, baseline drift, raster/network dependency, or ID mismatch.
- Verify every 16-player roster preview preserves the chosen object, variant,
  cosmetic, nameplate, identity/color cue, and selection after page eviction
  and restoration. Offscreen previews must release or reuse bounded cache
  entries without changing the active gameplay art.
- Render deterministic two- and four-lane Battle frames using every object at
  least once in each lane and targeted tall/wide/liquid/particle/reaction tuples.
  Internal dynamics, face state, camera emphasis, shadows, and event overlays
  remain lane-scoped; no zoom or effect may obscure the other live objects.
- Enumerate all 40 personal cosmetics and 22 arenas, then run the justified visual
  pairwise composition matrix, including 16-player cards/score rows.
- Internal movers replay deterministically and never consume gameplay RNG:
  open spill, sealed slosh, Teapot steam, per-flip Smoothie color, snow/scene,
  real Desk Globe, gumballs, foliage, sand, lava, bubbles, snacks, and parts.
- Desk Globe alone uses a realistic literal sphere: validate all longitudes over
  one complete rotation, offline texture/detail availability, deterministic
  visible-hemisphere focus points, normal 1/100 and exact `Mr. Howe` 1/10
  showcase rolls, miss/automatic-result exclusions, separate RNG, camera return,
  reduced motion, and unchanged competitive geometry.
- Reaction allowlist shows exactly one face in idle/scared/smile/frown and
  restores neutral. Bottle, Desk Globe, nonallowlisted art, and T-Rex have no
  face/camera treatment. T-Rex source/render/physics hashes equal v1.11.
- Product owner dispositions every itemized art direction and all broad-family
  variants; technically passing but unapproved artwork remains blocked.

Evidence: catalog/physics-profile manifests, contact sheets and image/command
hashes, cache measurements, paging videos, deterministic replay traces, golden
T-Rex comparison, and SHA-bound approval ledger.

### Q08 — progression, secrecy, and owner test mode

Simulate wins 0–101. Odd 1–99 awards one fixed cosmetic, even 2–98 one fixed
object, and 100 Alien/Insane/Lab. Persisted, announced, and selectable state
updates immediately and agrees in 2-, 8-, 9-, and 16-player qualifying matches.
Human Classic/Cup and a Team win containing a human qualify once; Practice,
Lab, debug, forced, Test Data, and AI-only do not. Cover queue order, close,
skip, reload, migration, no relock/duplicate/reannounce, and every locked
surface's clean `🔒`/accessible `Locked` secrecy.

Wave 0 freezes whether each Battle format produces a qualifying win. Test the
chosen policy positively and negatively for team-shared and FFA winners so one
match cannot award multiple device wins or silently inherit Team Clash rules.

Exact `Howe Test Mode` is ephemeral, exposes all content locally, marks the
whole match Test Data, and never changes real progression/achievements. Case or
spacing variants do not activate. `Mr. Howe` remains odds-only.

### Q09 — all 100 achievements

Run one positive and nearest negative trigger for every stable ID. Verify the
30 existing, 30 event, 10 Classic, 8 Cup, 8 Team, 8 collection, and 6 Lab/stat
groups; idempotence, counters, migration, persistence, Test Data/AI exclusions,
and locked secrecy. Repeat multiplayer triggers at 8, 9, and 16 players where
roster size/order matters. Owner Test preview never marks earned.

Freeze and test which existing achievement triggers, if any, accept Battle
outcomes. Shared team score, individual flips, FFA placement, sabotage, and
Chaos must not accidentally satisfy Classic, Cup, or Team Clash criteria.

### Q10 — Stats and teaching visualizations

Reconcile scripted 2-, 8-, 9-, and 16-player Classic/Cup/Team sessions and every
Battle format/tier with every FlipRecordV1/MatchRecordV1 field, scope, filter,
summary, chart, and CSV.
Paged/virtualized UI may not omit off-page players or duplicate recycled rows.
Every probability view reports observed count/fraction/percentage/sample size,
never theoretical odds or undiscovered event names.

Exercise IndexedDB, fallback/reopen, nonblocking warning, 100,000-raw pruning,
bounded exact rollups, hostile cardinality, chained archive lineage, UUID
dedup, newer supersession/older no-op, separate archive addition, malformed
atomic rejection, `.flipstats.json`, four CSVs, and pseudonymized default.
Stats writes never block play, consume RNG, or change state.

Record all two or four concurrent Battle flips with distinct IDs, player/team/
lane/volley IDs, input devices, seeds, timestamps, verdicts, and one
deterministic match-order key. Team rows preserve shared score/charge snapshots
and individual attribution; FFA rows preserve four independent scores/meters;
sabotage stores the explicitly selected opponent and Chaos stores an untargeted
all-lane effect. Same-frame outcomes must export/import/reconcile without
overwrite, reversal, double scoring, or dependence on asynchronous Stats write
order.

### Q11 — names and saves

Run the full safe/adversarial Unicode corpus through setup, Practice, saved
`rows[]`, records, Stats, CSV, Hall of Fame, legacy imported online-shaped
records, and every render path. Require one NFKC/confusable policy, 14-grapheme
cap, generic error, safe text nodes, blank unsafe imports, and exact QA
allowlists. Imported legacy fields are inert and never re-enable a room or
network path.

Test every historical `.flipgame-save` version, 2/8/9/16-player rosters,
checksum, corruption, truncation, oversize, malicious names, duplicates,
unknown fields, storage failure, atomic import, migration and round-trip. Save
backups remain separate from Stats archives.

Battle setup/save round-trips preserve teams, individual lane/relay order,
selected sabotage target only while valid, calibrated-tier preference without
claiming unsupported hardware, and separate team/FFA scoring configuration.

### Q12 — offline-only build and absence of network surfaces

- Assert that Setup, mode selection, Customize, active play, pause, Game Over,
  rematch, Practice, Lab, Stats, Achievements, help, and every deep-link/route
  expose no Online label, control, room/join/host flow, QR code, invitation,
  matchmaking state, or network-dependent error.
- Build a static import/runtime graph and service-worker precache inventory.
  No room, peer, multiplayer transport, signaling, matchmaking, WebSocket,
  EventSource, WebRTC, online-authority, or remote-state module may be imported,
  bundled, loaded, cached, registered, or dynamically reachable.
- Instrument `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, WebRTC,
  `sendBeacon`, worker creation, and dynamic script/import entry points during
  boot and complete sessions in every shipped mode. Except same-origin static
  asset/update retrieval explicitly allowlisted by the release manifest, the
  trap ledger must be empty with connectivity available or denied. Gameplay
  must remain complete with the network denied.
- Audit CSP, manifest, HTML, service worker, JavaScript bundles, source maps,
  Android WebView configuration, permissions, and native bridge for remote
  origins, socket endpoints, room keys, transport handlers, and dormant UI.
  A hidden but shipped or reachable Online implementation fails.
- Import and display historical Stats/save records that contain legacy
  `online`, room, peer, match-authority, or sender fields. Preserve only the
  documented inert data needed for backward compatibility; sanitise it, never
  execute it, never turn it into a playable setup, and never initiate traffic.
  Export may round-trip those inert fields only when the versioned schema
  requires losslessness and must mark them as legacy/non-playable.
- Test crafted imports, URL fragments/query parameters, storage keys,
  postMessage payloads, custom events, multi-tab broadcasts, and stale PWA
  caches that try to open or reactivate Online. All fail closed without roster,
  progression, Stats, or network mutation.

Evidence: static dependency and dead-code reports, packaged-asset/precache
manifests, CSP/permission audit, instrumented network-call ledger, route/UI
screenshots, hostile legacy-import results, denied-network full-session traces,
and web/APK binary string scans tied to the candidate SHA.

### Q13 — responsive, paged/virtualized UI and accessibility

Test every screen with 2, 8, 9, 15, and 16 local players at all six viewports.
Require one column below 768px, two columns 768–1099px, 12-column/7:5 at
1100px+, no horizontal/nested phone scrolling,
at least 48px smartboard targets, visible start/rematch controls, and contained
variant art.

Large rosters must use bounded paging or virtualization—not sixteen cramped
cards or an unbounded DOM. Verify first/middle/last page, page-count labels,
keyboard/touch next/previous, wrap/no-wrap behavior as designed, focus retention
when rows recycle, selected-player restoration, add/remove at boundaries,
error focus on an off-page name, and no inaccessible hidden duplicate nodes.
Active play always exposes Current, On Deck, and After That with names and
identity cues even across page boundaries. Game Over, Team assignment, Cup
standings, Stats filters, and rematches include all players.

Exercise the complete pre-match path at every viewport: player/mode setup,
object/variant/personal cosmetic, dedicated full-screen Arena Select, ready
beat, and first accepted flip. Arena Select must show a large live preview,
every owned stage, anonymous lock tiles, Random Unlocked, Back, and explicit
Start. Back preserves all setup state; Random never selects locked or
mode-incompatible stages; no pointer from stage selection leaks into gameplay.
Same Arena and New Arena rematches preserve all unrelated match settings, and
New Arena returns directly to stage selection. Validate all 22 stages in normal,
Cup, and qualified two/four-lane Battle compositions.

Battle's two- and four-lane layouts provide equally legible, direction-correct
lanes with every active player's name, object, independent power meter, state,
result, and focus/gesture region visible. Team formats additionally show shared
score/charge plus active and queued representatives; FFA shows four independent
scores. Current/On Deck/After That adapts to the frozen volley contract without
hiding any active flipper or next relay pair.

Sabotage presents an explicit, accessible opponent selector before arming,
shows the chosen identity on the originating lane, requires confirmation after
a target becomes invalid, and has no preselected or leader-derived default.
Symmetric Chaos identifies all four recipients equally. Announcements serialize
readiness and two/four outcomes without hiding any result. Calibration reports
only contacts observed in its current run; two-contact relay and sequential
fallback are announced before play. Color, side, motion, or sound alone cannot
identify a player, team, target, or verdict.

Verify keyboard order/trap/restore, accessible names/states and page position,
live turn/page announcements, contrast, color-independent cues, sound/mute,
OS/explicit reduced motion, and airborne resize invariance. Preserve geometry
JSON, breakpoint screenshots, focus/announcement transcripts, and device video.

### Q14 — PWA, dual deployment, and APK

- Clean PWA install, controlled v1.11→v1.12 atomic cache upgrade, cold offline
  reload, interrupted/corrupt cache recovery, complete runtime graph.
- Workflow-gated GitHub Pages and mapzimus exact SHA; alias/canonical path;
  every runtime byte reconciled with provenance.
- Reproducible release APK, persistent signing identity, v1.11 in-place
  upgrade, clean install, launch/back/orientation/wake behavior, WebView parity,
  Storage Access Framework import/export, and no broad storage permission.
- Smoke local 16-player setup/match/rematch in web and APK; rerun Q12 against
  both packages to prove no Online surface or runtime network code ships.
- Smoke Battle Duel, calibrated four-lane Doubles, 8v8 pair rotation, Four-Way
  FFA, two-contact relay fallback, sabotage selection, and symmetric Chaos in
  both web and APK.

Public release/Pages remain downstream of signed APK qualification and verified
mapzimus publication. A failed downstream check blocks rather than allowing a
partial release.

### Q15 — performance, memory, and virtualization

Measure release builds. Ordinary and normal-event 1080p play target 60 FPS;
the heaviest supported smartboard/4K event must hold at least 45 FPS. Record
p50/p95/worst frame, long tasks, memory, and hardware.

Required loads include 2-, 8-, 9-, and 16-player setup/active/game-over; rapid
roster paging/scrolling; every player becoming Current; 16 unique previews and
cosmetics; 12 animated variant tiles; heaviest event/arena; extended Plinko;
all-CPU 16-player match; Stats writes/import/pruning; 1,000-flip soak; repeated
menu/rematch/resize; and offline boot. Assert bounded DOM nodes and art caches,
offscreen preview eviction/reuse, no stale recycled card data, no unbounded
body/listener/audio growth, no gameplay-blocking storage work, and no uncaught
application error. A page/virtualization mechanism that meets FPS by omitting
players from state, Stats, focus, or rematches fails.

Profile two and four active physics worlds/lanes (or the frozen shared-world
collision policy), simultaneous input sampling, same-frame contacts/verdicts,
all cameras/FX/audio/meters, pair rotation, Four-Way FFA, symmetric Chaos, and
the maximum permitted concurrent event load at every eligible large-screen
viewport. Four-lane Battle must hold at least 45 FPS, including 4K. Freeze a
numeric input-sample and resolution-latency skew limit before execution; every
lane must pass it with no lane/team-specific dropped input, memory, long-task,
or frame-time bias. Assert that runtime active-object count never exceeds four.

### Q16 — human approval

The product owner explicitly approves the exact SHA's ordinary flip curve,
three Feel settings, input feedback, all art/dynamics/reactions, protected
Bottle/T-Rex, every event dossier, extended Plinko, 2–16 setup and turn flow,
large-roster paging/virtualization, variant gallery, unlocks, Stats, menus,
smartboard experience, and final v1.12 release. Preserve dated checklist,
requested changes/re-review, build ID, SHA, and explicit release statement.
Silence or approval of another SHA does not pass.

Owner approval explicitly covers Battle Duel, Doubles, 3v3–8v8 pair relays,
Four-Way FFA, two/four-lane readability and reach, contact calibration,
sequential/two-contact fallbacks, physical fairness, simultaneous-result
clarity, shared versus individual score/charge, sabotage targeting, symmetric
Chaos, and the universal four-object cap.

### Required evidence manifest by Q-row

| Row | Accountable owner | Minimum durable evidence bundle |
|---|---|---|
| Q00 | Integrator/Release | clean-tree and ancestry reports, dependency/SBOM and secret scan, source/origin/APK SHA manifests, signing identity |
| Q01 | Lifecycle/Rules | per-frame traces, verdict/reward state snapshots, full turn timelines, wake-lock call ledger |
| Q02 | Mode owners | generated score/heat/round/volley/rematch oracle results for every mode and legal count; all Battle outcome tuples and effect-target ledger |
| Q03 | Roster/Fairness | expected-versus-actual seat/relay sequences, team/FFA fairness summaries, active-cap and page state hashes, atomic rejection snapshots and boundary videos |
| Q04 | Input/UI | timestamped pointerId trace corpus, capture and `touch-action` log, capability/fallback matrix, keyboard/focus video |
| Q05 | Physics/CPU | exact seed outputs, distribution tables, lane-bias/latency report if applicable, Alien calibration and signed feel approval |
| Q06 | Event owners | 30 event dossiers, seed/reward/cleanup and Battle-concurrency matrices, sabotage/Chaos target assertions, odds output, Plinko traces, reduced-motion and performance captures |
| Q07 | Art/Renderer | 612-variant contact sheets/manifests, render-command hashes, cache traces, T-Rex/Bottle comparison and itemized owner dispositions |
| Q08 | Progression | 0–101 state/reveal snapshots, eligibility negatives, migration/round-trip output and locked-surface screenshot inventory |
| Q09 | Achievements | 100-ID positive/nearest-negative results, idempotence/migration counters and locked/discovered UI captures |
| Q10 | Stats | field-level reconciliation workbook/JSON, chart/filter assertions, pruning/failure logs and hashed exports/imports |
| Q11 | Name/Save | corpus-by-boundary results, DOM-safety capture, versioned migration/checksum matrix and atomic-failure snapshots |
| Q12 | Offline/Security | static/runtime graphs, package/precache manifest, CSP/permission audit, network trap ledger, hostile legacy-input results and binary scans |
| Q13 | Responsive/A11y | breakpoint/lane geometry and screenshots, accessibility tree/audit, focus/live-announcement transcript, paging/calibration/Battle/fallback videos |
| Q14 | Release | PWA/APK install-upgrade-offline logs, reproducibility and signing results, dual-origin byte diff and parity smoke traces |
| Q15 | Performance | machine profile, two/four-lane frame/input/resolve-latency/long-task/memory traces, active-cap and DOM/cache counts, soak and lane-comparison results |
| Q16 | Product owner/Integrator | dated SHA-bound approval checklist, requested-change closures and explicit release authorization |

Every listed bundle is required even when all automated assertions pass. If a
feature is formally deferred, its row includes exact-SHA absence evidence
rather than silently omitting the case.

## 6. Coverage reconciliation

Maintain bidirectional maps from requirement → cases → generated executions →
evidence/digests → defects/fixes/retests → release artifact. There may be no
orphan requirement, case, execution, artifact, defect, catalog ID, player count,
or page boundary. Planned and actual Cartesian counts must match; duplicates do
not offset omissions. Unsupported combinations appear as negative cases.
Suite crashes leave unexecuted rows `NOT-RUN`. Flakiness remains a failure until
root cause is fixed and the frozen corpus passes without retry filtering.

Every merge reruns baseline regression plus all integrated suites. The final
candidate gets three independent audits against the same SHA: Simulation;
State/Data; Browser/Art/Release. The final report gives planned, executed,
passed, failed, blocked, stale, and missing totals for Q00–Q16, catalog-value
coverage, Cartesian counts, pairwise uncovered count, and player/page coverage.

## 7. Specialist waves and boundaries

At most three bounded specialists run concurrently while the coordinator is
active. Each receives an isolated worktree, exclusive owned paths, frozen
interfaces, acceptance rows, and evidence contract. Specialists stage only
owned paths; QA never fixes; only the integrator merges.

| Wave | Concurrent ownership | Entry | Exit |
|---:|---|---|---|
| 0 | Integrator + read-only QA PM | v1.11 baseline | freeze v1.12 delta including local 16-player caps, complete Online removal, Battle lane/collision/volley/calibration/target/fallback interfaces, path/dependency map, fixtures, expected counts, contradictions, defects |
| 1 | Progression/reveals/Owner Test; input/Feel/CPU/contact calibration; Plinko/Alien | Wave 0 freeze | Q04/Q05 foundations, two/four-contact calibration, Q08 and Plinko owned suites pass through 16 players |
| 2 | Core lifecycle; Cup/Arena/rematches; Team/Battle/fairness | shared input/physics interfaces | complete Q01–Q03 Cartesian matrices, Battle score/relay/FFA/target suites, and cap-negative cases pass |
| 3 | Events 1–10; 11–20; 21–30 | registry/controller/reward/render interfaces frozen | all dossiers, make/miss seeds, event/object matrix, odds, adapters, cleanup, performance pass |
| 4 | New art 1–12; new art 13–25/dynamics; legacy/reactions/protected art/gallery | RenderVariant/seed contract frozen | Q07 full catalog plus 16-player preview/cache and owner review candidate |
| 5 | Responsive/virtualized UI/a11y; Stats/achievements/names/saves; offline surface/PWA/Android | gameplay/art interfaces frozen | Q09–Q15 feature suites, including 16-player local and offline-only boundaries, pass |
| 6 | Integrator only | owned suites and acknowledged interfaces | merge with full rerun after each commit; one clean feature-candidate SHA |
| 7 | Simulation QA; State/Data QA; Browser/Art/Release QA | frozen exact SHA/evidence manifest | three independent reconciled audits; every failure routed |
| 8 | Original defect owners, then full QA and owner | assigned defects | zero P0–P2, no missing/stale rows, human visual/feel/large-roster approval |
| 9 | Release Engineering + independent post-release verifier | explicit exact-SHA owner approval | v1.12 identity, signed APK, both origins, cache/upgrade/offline/core 16-player parity verified |

Physics owns forces/profiles and cannot change rewards. Rules owns outcomes and
cannot tune physics. Stats observes asynchronously and cannot affect RNG/state.
Art cannot alter collider, mass, tolerance, or scoring. UI cannot recalculate
turn/rematch rules or omit off-page players. No owner may restore, hide, or
bundle Online/network gameplay without a future contract revision. Release
Engineering cannot publish an unapproved or partially qualified SHA.

## 8. Release gates

1. **Contract gate:** all deltas, interfaces, IDs, local 16-player caps,
   complete Online removal, and Battle lane/collision/volley/calibration/
   fallback/score/charge/target/Chaos rules, fixtures, and expected counts are
   frozen.
2. **Rules gate:** Q01–Q03 fully pass for Classic 2–16, Short Cup 2–12, Full
   Cup 2–8, and Team even 2–16, both directions, applicable lives, CPU classes,
   rematches, and invalid caps.
   Battle Duel/Doubles/3v3–8v8/Four-Way FFA pass every two/four-outcome order,
   shared-team/independent-FFA state, relay, target, Chaos, and four-object-cap
   assertion.
3. **Physics gate:** meter/launch parity, approved Feel, CPU 30–40/45–55/
   60–70% bands, Alien ±10-point Classic parity and ≤10-point viewport spread,
   settling/resize, and event regressions pass.
4. **Event gate:** all 30 are unmistakable, physical, fallible, correct,
   cleanable, reduced-motion safe, mode-adapted, and performant; Alien Invasion
   proves a visible physics-traced UFO bank then ring with no verdict override.
5. **Progression gate:** wins 0–101, immediate selection/reveal, migration,
   Owner Test boundaries, achievements, and secrecy pass at large rosters.
6. **Content gate:** all 612 variants, 40 personal cosmetics, 22 arenas, dynamics,
   reactions, protected T-Rex/Bottle, 16-player previews, and cache bounds pass
   and receive human approval.
7. **UI/accessibility gate:** every screen and roster boundary is usable from
   phone through 4K; paging/virtualization preserves all state, focus, turn
   context and 48px smartboard targets without overflow. Battle also passes
   two/four-pointer calibration, touch-action, lane/meter/score presentation,
   targeting, announcements, relay, and sequential/two-lane fallbacks.
8. **Data/security gate:** Stats, names, saves, achievements, local privacy,
   offline-only/no-network-surface behavior, inert legacy fields,
   imports/exports, pruning and fallback pass.
9. **Performance gate:** 60 FPS 1080p target and 45 FPS heaviest smartboard/4K
   floor pass with 16 players, bounded DOM/cache/memory, and no application
   errors or gameplay-blocking writes. Every four-lane Battle scenario meets a
   45 FPS floor with bounded input/resolve latency skew.
10. **Independent gate:** all three exact-SHA audits reconcile with zero open
    P0/P1/P2 and no missing/stale evidence.
11. **Owner gate:** explicit visual, feel, event, large-roster, and release
    approval names the exact SHA.
12. **Release/post-release gate:** clean reproducible candidate; unique v1.12
    tag/cache/build; signed upgradeable APK; byte/provenance parity; fresh and
    stale-cache installs; offline reload; both origins/APK version and local
    16-player core smoke; Q12 proves Online and its runtime modules are absent.

Any P0–P2, crash, data loss, unsafe name, unauthorized telemetry, wrong rule or
reward, lost/off-page player, cap bypass/truncation, inaccessible large-roster
flow, event without miss path, Plinko/camera mismatch, leaked state, T-Rex or
Bottle invariant change, missing/unapproved art, performance/accessibility
failure, dirty source, mixed build identity, unsigned/non-upgradeable APK,
offline/dual-origin mismatch, shipped Online/network gameplay, unresolved
Battle interface, more than four active objects, false contact calibration,
pointer/lane/relay/fairness/fallback defect, shared/individual score corruption,
leader auto-targeting, asymmetric Chaos, missed CPU/Alien calibration bound,
Alien verdict override or missing bank, or absent exact-SHA approval blocks
release.

## 9. Known prequalification conflicts

The current working tree is not an RC. Exact-SHA qualification begins only
after integration produces a clean candidate.

Two existing regression expectations conflict with frozen v1.12 intent and
must be migrated by their subsystem owners in Wave 0:

1. `scripts/regression-tests.js:testLifeDrainMagnetMakes()` requires all 48 of
   48 tested Life Drain launches to make, but v1.12 requires strong assistance
   plus a real extreme-launch miss path.
2. `scripts/regression-tests.js:testLongPlinkoBoardResolves()` requires exactly
   eight peg rows, but v1.12 requires a substantially longer peg field while
   preserving nine slots and deterministic seed-to-slot results.

The provisional 16-player local contract and complete removal of Online require
new rules, UI, Stats, save, performance, accessibility, packaging, CSP, and
offline/network-surface tests before the next candidate can enter independent
QA.
