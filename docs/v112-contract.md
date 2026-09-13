# Flipgame v1.12 authoritative contract — Pressure Signal

Status: implementation authority
Baseline: public v1.11 commit `947133360d3487a646e04be2b313c577474f54a5`
Release: `v1.12`; Android `versionName 1.12`, `versionCode 112`
Approval: no deployment before explicit product-owner approval of one candidate SHA

This document supersedes every earlier `v112-*` planning draft where they
conflict. The Program Integrator owns revisions. A rule or interface change is
invalid until it is recorded in the integration log, broadcast to affected
owners, accompanied by migration/test changes, and acknowledged before merge.

## 1. Product and canon invariants

- The public v1.11 tag, cache and deployment remain immutable.
- GitHub Pages, `mapzimus.com/flipgame`, the PWA and APK come from the same
  approved SHA and visibly report `v1.12`.
- v1.12 is local/pass-and-play. Online UI, transports, rooms, boot resources and
  cached resources do not ship. Legacy online record fields may remain inert for
  lossless imports only.
- Present-day **Urth** is our planet after a tiny unexplained spacetime
  divergence. Faces, living mascots, peculiar institutions and occasional odd
  spellings are normal to residents and never explained with a wink.
- Friendly, sentient dinosaurs returned for an unknown reason and live alongside
  humans as ordinary neighbors, spectators, workers, officials and fans. They
  appear as restrained everyday cameos, never monsters or the theme of every
  scene.
- Flipgame is Urth's dominant pressure sport. Its premier event is the
  **Wurld Flip Championship** (WFC); **WFC Standard** is Normal physics,
  eight entries and ten lives. Refrain: **Ten lives. Try not to yeet it.**
- `Urth` and `Wurld` are fixed canon spellings. In the championship name,
  `Wurld` is the only altered word: `Flip Championship` uses normal spelling.
  Other altered spellings use one narrow timeline quirk: a word whose standard
  spelling represents the /ɜr/ sound without `ur` may occasionally spell that
  sound with `ur` in authored flavor copy (for example `first` → `furst` or
  `perfect` → `purfect`). They come only from `UrthLexiconV1`, at most one per
  short flavor unit. The quirk is never applied as a text transform. Rules,
  controls, errors, stats, exports and accessibility copy use conventional
  spelling except for fixed proper nouns such as Urth and Wurld.
- Player-facing selection is **Choose Your Flipper**. Living mascots are willing
  competitors who become `available` or `join the roster`; they are never owned
  in lore-facing copy.
- Bottle has no face. The playable T-Rex remains a vintage molded competition
  figure and its existing art, proportions, animation, physics and collider are
  immutable. Living dinosaur cameos never replace it.
- Replace Tall Buildings with `mechanical-metronome` and Giraffe with
  `desk-gyroscope`. New IDs are never aliases for historical stats.

### WFC broadcast vocabulary

- The **Wurld Flip Federation** (**WFF**) sanctions organized play; the **Wurld
  Flip Championship** (**WFC**) is its premier event. **Fair-Form Certified** is
  the equipment badge for compliance with the shared competitive physics rule.
- A **Flipper** is the selected competition object or character; an **Entry** is
  the player and Flipper presented together; the **Lineup** is every active Entry.
- The **Table** is the regulation field of play. A **Lane** is one isolated play
  zone on a multi-Entry Battle table.
- The physical call sequence is **Set → Release → Flight → Contact → Settle**.
  **Set** is never used as the name of a match segment.
- A valid make is a **Hold**; upright is a **Stand**; cap is a **Crown**; a miss
  is **No Hold**. A first-contact landing with no bounce or slide is a **Clean
  Hold**; a valid landing recovered after physical movement is a **Recovery
  Hold**. Clean/Recovery are replay tags, not replacements for the existing
  Perfect Landing statistic. Functional and accessible surfaces always retain
  the plain make/miss meaning alongside broadcast flavor.
- **Stake** is the exact number of lives currently at risk. **Pressure** is the
  broadcast condition created by that risk, especially near elimination. A
  potentially eliminating attempt is a **Pressure Shot**; making it is a
  **Pressure Save**. Sudden Death may be introduced as **Sudden Death · Rising
  Stake**. Once a plain winner result is confirmed, the broadcast may call
  `{Winner} Takes the Table`.
- A **Lineup Rotation** gives every active Entry one allocated turn; retained ON
  FIRE attempts do not advance it. **Object Rotations** are physical revolutions
  of a Flipper, keeping the two statistics unambiguous. ON FIRE presentation may call its start
  **Ignition**, reaching the additive cap **Full Burn**, and a miss-ending run
  **Burnout**.
- Rare physical events are **Signal Events**, announced with **Signal
  Detected**. Their ordinary event names remain visible and no odds appear.
- **Recent Form** is the recent result strip; **Arc Trace** is trajectory replay;
  **Hold Rate**, **Crown Rate**, and **Pressure Save Rate** are plain observed
  broadcast-overlay statistics. Stats Lab, exports, instructions, and accessible
  names retain conventional labels such as Make Rate and Cap Landing Rate.
  **Table Judge**, **Replay Desk**, and **Trajectory Analyst** are presentation roles
  only. **Hold** is never used as an input instruction because it could be
  mistaken for a press-and-hold gesture.
- WFF appears in Story, signage, and sanctioning flavor; WFC remains the primary
  public acronym. Battle power cards are never described as Signal Events.
- The **Fair-Form Standard** is the in-world rule explaining the shared
  competitive collider/contact plane. It never implies that visual variants or
  internal secondary motion change gameplay physics.

## 2. Core physics and mode rules

- Normalize touch, pen, mouse and smartboard gestures in lane-relative CSS
  coordinates using coalesced pointer samples and pointer capture. An identical
  normalized gesture differs by no more than 2% launch velocity and `0.03 rad/s`
  spin across supported viewports.
- Feel changes only prelaunch transfer: Forgiving compresses near-miss input
  toward the playable band by at most 8%; Standard is canonical; Pro is raw.
  Postlaunch physics, scoring, tolerances and odds are shared.
- Practice's meter sits on the bottom table edge and displays the exact launch
  signal.
- Landing lifecycle is `airborne -> contact -> settling -> resolved`; first
  contact cannot resolve a miss. Settle limits: ordinary 4s, Wind/Moon 5s,
  Ice/Bouncy 6s. Resize rendering immediately but defer flight-geometry reflow.
- ON FIRE upright makes add one life and caps add two. Streaks continue beyond
  three. A miss ends the run and passes the turn without an additional stake,
  life, sudden-death or elimination charge. Additive rewards cap at
  `ceil(startingLives * 1.5)`; explicit multipliers bypass it.
- Opponent halving is `max(1, ceil(lives / 2))`. Forced eliminations store and
  display zero. Every sudden-death escalation receives a complete rotation.
- CPU physical-make targets are Easy 30–40%, Medium 45–55%, Hard 60–70%; no
  forced verdicts, adaptive difficulty, hidden mercy or rubber-banding.
- Alien and Alien Invasion use the full arena, visible UFOs, viewport-scaled
  geometry and a sidewall/deflector/UFO bank followed by tractor-ring entry.
  Rates stay within ±10 percentage points of matched Classic at each viewport
  and within ten points across viewports.
- Classic supports 2–16. Short Cup supports 2–12, best-of-three, three lives,
  sudden death after three rotations. Full Cup supports 2–8, best-of-three, ten
  lives, sudden death after five rotations. Team Clash supports even 2–16,
  three alternating flips/team, upright/cap one, Golden two, cancellation and
  first to 11 without win-by-two.
- Practice is immediate. Physics Lab unlocks at FL50, is Test Data and supports
  event forcing, Flipper switching, seed replay, ghosts, slow motion, landing
  reasons and viewport presets. Alien and `INSANE MODE` require FL100 plus the
  Alien-defeated flag. No player-facing surface states Insane's probability.

## 3. Story and rival contract

`STORY — PRESSURE SIGNAL` is optional, available on a fresh save and replayable.
It has four acts, twelve ordered chapters, five WFC Standard matches and
twelve signature encounters:

| # | Act | Chapter | Preliminary match | Rival / callsign | Flipper | Tier |
|---:|---|---|---|---|---|---:|
| 1 | I | The First Broadcast | WFC Qualifier | Mara Venn / First Light | Coffee Mug | 1 |
| 2 | I | Scatterline | — | Ivo Bell / Scatterline | Gumball Machine | 2 |
| 3 | I | Lane 09 | — | Safiya Rowan / Meridian | Desk Globe | 2 |
| 4 | II | Under the Lights | WFC Broadcast Heat | Jules Mercer / Cold Read | Penguin | 3 |
| 5 | II | True Axis | — | Niko Arden / True Axis | Desk Gyroscope | 3 |
| 6 | II | Standard Bearer | — | Reina Sol / Standard Bearer | Trophy Cup | 4 |
| 7 | III | Case 50-A | Instrumented WFC Heat | Dr. Arun Vale / Fine Point | Microscope | 5 |
| 8 | III | White Noise | — | Inez Park / White Noise | Snow Globe | 5 |
| 9 | III | High Water | — | Beck Holloway / High Water | Huge Rubber Duck | 6 |
| 10 | IV | Nine Tracks | WFC Semifinal | Ren Damar / Ensemble | Action Figures | 6 |
| 11 | IV | Deep Time | WFC Final | Talia Quill / Deep Time | protected T-Rex | 7 |
| 12 | IV | Visitor Zero | — | Veyr / Visitor Zero | Alien | 8 |

- Solo preliminaries: one human + seven CPUs, ten lives, Normal events. Solo
  signature encounters: 1v1, three lives, Normal events.
- Co-op uses two allied humans + six CPUs for every required match, including
  signature encounters. Humans have separate lives/turns; either human winning
  clears. The match ends when every survivor belongs to that human alliance.
  Opponent-targeted effects protect only a target allied with the acting
  Flipper; CPU actors may affect either human normally.
- First clears use prescribed arenas. Checkpoints exist between matches only;
  abandon/interruption grants no clear or reward.
- Story and Rival Board share rival defeat and the object grant. A Board clear
  may skip the signature encounter, but a chapter's preliminary WFC match still
  gates campaign completion.
- Normal Story odds and exact `Mr. Howe` boosting apply. Native Alien suppresses
  nested events. Rival tiers map to CPU profiles `1,2,2,3,3,4,5,5,6,6,7,8`
  with physical target rates of roughly 32–60%.
- Eligible Story matches receive ordinary FXP/FC once. First Urth-rival defeat
  grants its Flipper +25 FXP/+15 FC; Alien +75/+50. Each act first clear grants
  +50 FXP/+25 FC and an optional Field Note.
- Story may finish before FL100. Early Alien victory is banked. Fresh saves make
  Alien and Insane selectable only when `alienDefeated && FL >= 100`; v1.11
  legitimate ownership is grandfathered. At FL100 without victory show
  `Final Challenger waiting`.
- Rival Board invitations: FL5 Coffee Mug, 13 Gumball Machine, 21 Desk Globe,
  29 Penguin, 37 Desk Gyroscope, 45 Trophy Cup, 50 Microscope, 61 Snow Globe,
  71 Huge Rubber Duck, 81 Action Figures, 91 T-Rex, 100 Alien. Urth challenges
  are permanent, free, solo three-life duels. Attempts grant no ordinary FXP/FC.
- Narrative is short broadcast cards, signage, replay monitors, environmental
  detail and optional Field Notes—no required voice or long cutscenes. Veyr has
  amplified existing anomalies to locate Urth's best pressure player, not to
  create Flipgame or conquer Urth. Canon clues include `LANE 09 — RETURN
  RECEIVED`, `EIGHT ENTRIES. NINE RETURNS.`, `MASS VERIFIED. TRAJECTORY DID NOT
  COMPLY.`, and `NO SEED / NO FEDERATION / SIGNAL VERIFIED.`

## 4. Battle contract

- Battle is a v1.12 release requirement. Formats are 1v1, 2v2, 1v1v1v1 and
  equal rotating teams 3v3–8v8, with at most four active lanes.
- Equal Volley: best of three heats, five synchronized volleys per heat;
  upright=1, cap=2, miss=0; ties use paired sudden-death volleys.
- Timed Rush: best of three 60-second gameplay-clock heats; lanes re-arm
  independently; launches released before the horn finish; ties use a paired
  sudden-death volley. Horn eligibility uses the monotonic input timestamp and
  absolute deadline rather than depending on animation-frame delivery.
- Every Timed Rush result must consume a unique launch lease created at
  `markLaunch`. The lease binds the attempt and owner to the exact heat, clock
  bucket, rotation, volley and sudden-death state. A pre-horn flight may settle
  after a handoff or horn using its original lease; an unmarked, duplicated,
  wrong-owner, wrong-bucket or post-horn launch is invalid. One player/lane can
  hold at most one pending attempt.
- A Battle series contains at most three heats. A competitor or team reaching
  two heat wins clinches immediately and no later heat is legal. In a
  multi-competitor series where nobody has two wins after Heat 3, Heat 3 is the
  announced **Pressure Heat** and its winner wins the series; no unbounded
  fourth heat or arbitrary score tiebreak is added.
- Larger Volley teams rotate after each volley; Rush teams every 15 seconds.
  Verified four-touch displays may run two representatives/team, two-touch
  displays one/team, and unsupported or <768px layouts announce a fair
  alternating relay. Relay time advances only while the assigned participant
  has a ready/aiming lane. An outgoing cross-boundary flight may finish, but it
  pauses the gameplay clock and cannot consume the incoming side's allocation.
  Batched timer delivery stops at the first handoff so every assigned side gets
  an interactive frame before it can rotate away.
- Each qualified manual launch grants one charge. At three charges offer two
  deterministic compatible cards; one may be stored without pausing play.
- Sport cards: Magnet Pulse, Heartbeat Brace, Power Launch, Moon Round, Bouncy
  Round, Wind Round, Trampoline Round. Mayhem adds manually targeted Ice Patch,
  Crosswind, Earthquake, Gravity Slam and Fizz Jet. No automatic leader target.
- Powers are visible, physical, fallible and affect only not-yet-armed launches.
  A recipient may have at most one pending physical modifier; conflicting
  deployment rejects atomically without consuming the stored card. In a
  one-lane Equal Volley the opener rotates and offers earned during a logical
  paired volley cannot be deployed until both sides have resolved that volley.
  Ordinary rare-event rolls are disabled. Plinko, Roulette, Life Drain, Mirror
  Match, Cap Toss, Double Flip and other terminal/long events do not run.
- Pointer, physics, camera, reaction and audio state are lane-local. Cross-lane
  collisions are out of scope.

## 5. Physical event registry

All events bind and telegraph before input, are mutually exclusive and consume
only on a qualified launch. Cancelled prelaunch gestures retain the event;
leaving discards it.

| Rate | Class | ID | Required behavior |
|---:|---|---|---|
| 1/90 | Assist | rainbow-corkscrew | force corkscrew/trail; make +1 capped life |
| 1/110 | Assist | half-full | dynamic COM wobble and base stabilization |
| 1/140 | Assist | power-launch | dramatic controlled impulse/contrails/shock ring |
| 1/170 | Hazard | fizz-jet | authored top ejects; rotating spray thrust |
| 1/210 | Assist | golden-flip | increased stability and existing two-credit result |
| 1/250 | Hazard | bouncy-bottle | rubber restitution, deformation, up to three bounces |
| 1/290 | Hazard | earthquake | physical table oscillation, debris and collisions |
| 1/340 | Wildcard | moon-gravity | strong low gravity and long trajectory |
| 1/450 | Hazard | ice-slide | extended low friction, bumpers, gradual friction return |
| 1/550 | Wildcard | alien-invasion | bank-and-ring Alien physics for current Flipper |
| 1/650 | Hazard | gravity-slam | rapid high-gravity descent and impact wave |
| 1/750 | Assist | trampoline | deforming table/relaunch; judge return landing |
| 1/850 | Hazard | wind-tunnel | strong lateral/rotational gusts; cap can score |
| 1/950 | Wildcard | shrink-ray | inertia reduction; upright two/cap three |
| 1/1100 | Wildcard | portal-pair | conserve speed/spin with rotated exit |
| 1/1250 | Wildcard | tether-swing | visible pendulum cable and low-point release |
| 1/1400 | Assist | mitosis | two full selected-Flipper clones; either/both scoring |
| 1/1550 | Wildcard | double-flip | >=2 rotations; make doubles user/halves opponents |
| 1/1750 | Hazard | ceiling-flip | inverted gravity and ceiling verdict plane |
| 1/1950 | Hazard | meteor-shower | collidable debris deflects without instant failure |
| 1/2200 | Assist | magnet | strong visible but fallible attraction |
| 1/2450 | Assist | heart-rush | three impulses; make +3 capped lives |
| 1/2700 | Hazard | black-hole | inverse-square orbit/lensing/accretion |
| 1/3000 | Wildcard | boomerang | curving return toward marked origin |
| 1/3400 | Wildcard | roulette-table | tracked 1/2/3/4/4/3/2/1 sectors |
| 1/3800 | Assist | rewind | first miss rewinds for one fallible replay |
| 1/4500 | Wildcard | plinko | tracked nine-slot physical drop |
| 1/5000 | Wildcard | mirror-match | normalized next-flip copy, no nested event |
| 1/5500 | Hazard | cap-toss | body + authored detachable top both land |
| 1/6000 | Assist | life-drain | green arena/hidden fallible magnet; make sets opponents 1 |

- Hazard rates must be 0.45–0.75x matched Classic but at least 10% makes;
  Wildcards 0.8–1.2x; Assists 1.2–1.65x, capped at 85%, and strongest assists
  retain at least 5% misses.
- Mitosis uses complete selected-Flipper clones. Cap Toss uses an authored
  object part; living Flippers toss WFC headgear, never body parts.
- Plinko begins on a visibly deforming trampoline. The selected Flipper
  compresses it, receives a real upward spring impulse, and remains centered by
  a continuous camera through the apex before entering the top of the physical
  board. The spring preserves the selected object/variant and its internal
  dynamics, affects entry position/spin, and cannot preselect or favor a slot.
- During the peg descent, the selected Flipper remains the visible, moving
  Matter body with its authored parts and internal dynamics. A shared rounded
  event chassis is physically tethered inside it for peg contact so tall or
  irregular silhouettes cannot bridge rows or gain an advantage. The chassis
  is identical for every Flipper, never appears as another object, cannot
  encode a slot, and is removed before ordinary physics resumes.
- After the apex handoff, Plinko has 24 peg rows, a normal 10–15s board descent
  with a 12s median, object tracking, deterministic anti-wedge impulses and
  slots. A physically active drop may continue beyond that normal band; timing
  never converts a moving Flipper into a prize or loss:
  `Lives Doubled | Everyone Else Halved | Always Magnet | Automatic Loss |
  Automatic Win | Automatic Loss | Always Magnet | Everyone Else Halved |
  Lives Doubled`. It remains the only automatic-win event.
- A Plinko Automatic Win ends the current Classic match, Cup heat or Team Clash
  match for the flipper's side. Classic Automatic Loss eliminates the flipper;
  Cup Automatic Loss awards that heat to the next surviving seat in the
  configured rotation; Team Clash Automatic Loss awards the match to the other
  team. A 30-second unresolved anti-wedge timeout is a no-contest: it advances
  only replay-protection/diagnostic accounting and retries the same competitive
  turn without changing lives, stake, score, rotation or sudden death.
- Exact `Mr. Howe` multiplies Normal weights tenfold. Insane overrides it, rolls
  internally one-in-three, weights eligible events equally except Plinko 1.25x,
  and excludes Life Drain. Programmed values never appear player-facing.
- Every event display name is a Practice force-name. Forced play is Test Data.

### Alien event compatibility

- Free-play Alien uses Normal event odds and the exact `Mr. Howe` boost; it may
  not blanket-disable events or silently reuse an Earth-gravity implementation.
  Veyr's native Story encounter still suppresses nested events so the final
  signature challenge remains a stable authored test.
- Every one of the 30 events has an explicit `AlienEventAdapterV1` classified
  as `adapted`, `self-contained`, or `excluded-with-authored-replacement`.
  Selection occurs only from the resulting compatible registry, preserves one
  event maximum and never changes the combined roll probability merely because
  the base mode is Alien.
- Adapted events retain the visible UFO field and normally preserve Alien's
  bank-then-tractor-ring scoring goal. Their forces, obstacles, cameras and
  telegraphs are authored for zero gravity, scale with the arena, and remain
  physical, skill-based and missable. Hazards must make the matched Alien shot
  measurably harder; they cannot become disguised auto-align assists.
- Redundant effects receive real Alien variants under the same event IDs:
  Alien Invasion becomes a moving UFO-bank swarm; Moon Gravity becomes a
  rotating gravity tide; Ice Slide creates a low-friction ice rail/deflector;
  Earthquake oscillates the enclosing walls and UFO banks; Trampoline becomes
  a deforming spring wall; Wind Tunnel becomes visible directional plasma jets.
  These are mechanics, not renamed cosmetic overlays.
- Self-contained arena events such as Plinko and Roulette temporarily own their
  complete physical goal, then restore the exact prior Alien profile, UFO state,
  selected Flipper dynamics and camera state during cleanup. Plinko retains its
  trampoline ascent, 24 rows, nine slots and board-only timing contract.
- Each adapter has deterministic replay plus matched Alien make-rate, viewport,
  cleanup, reduced-motion and screenshot/video evidence. Review and acceptance
  occur event by event; a generic shared force multiplier cannot qualify all 30.

## 6. Progression, economy and catalog

- FXP is cumulative/nonspendable; FL is 1–100. Transition costs: FL1–25=30,
  26–50=35, 51–75=40, 76–99=45. Cumulative FL50=1590, FL100=3705.
- FC buys visual cosmetics only. v1.12 has no payment, ads, loot boxes, random
  shop, premium track, wagering or pay-to-win. A future provider-neutral grant
  port may exist but no provider, receipt, UI or external mutation is active.
- Fresh save: Bottle, plain presentation, noncollectible Baseline Table.
- Final catalog: 51 Flippers (Bottle +38 direct +11 Urth-rival +Alien), 23
  arenas (Baseline +22 collectible), 40 Store cosmetics, 120 achievements.
- Direct Flipper levels: FL4 Milk Carton; 6 Ketchup; 8 Soup Can; 10 Soda Can;
  12 Salt/Pepper Shaker; 14 Maple Syrup; 16 Honey Bear; 18 Baby Bottle; 20 Soap
  Pump; 22 Smoothie; 24 Teapot; 26 Hot Sauce; 28 Cola Bottle; 30 Tumbler; 32
  Watering Can; 34 Juice Glass; 36 Lab Flask; 40 Microphone on a Stand; 42
  Bowling Pin; 44 Traffic Cone; 46 Potted Plants; 48 Lawn Chair; 51 Box of
  Snacks; 54 Hourglass; 56 Chess Pawn; 58 Buoy; 60 Extinguisher; 68 Whipped
  Cream; 70 Potion; 74 Owl; 76 Toucan; 78 Red Panda; 84 Piñata; 88 Mechanical
  Metronome; 90 Octopus; 92 Eyeball Monster; 94 Lava Lamp; 96 Artillery Shell.
- Arena levels: FL3 Rooftop; 7 School Cafeteria; 11 Sports Locker Room; 15 Grand
  Library; 21 Garden; 25 Arcade; 29 Island Beach; 35 Skate Park at Sunset; 39
  Pirate Ship Deck; 43 Aquarium Tunnel; 47 Rainforest Treehouse; 55 Movie
  Soundstage; 59 Haunted Hall; 63 Ice Cave; 69 Moon Deck; 73 Neon Grid; 79
  Volcano; 85 Storm Table; 89 Mars Outpost; 93 Stadium at Night; 95 Space
  Station; 99 Aurora Stage.
- Level FC: +50 at 2,5,9,13,17,19,23; +75 at 27,31,33,37,38,41,45,49; +100 at
  52,53,57,61,62,64,65,66,67,71,72,75; +150 at 77,80,81,82,83,86,87,91,97;
  +200 at 98. Total 3700.
- Match reward formula and setup/performance tables are frozen in the final plan:
  `a=min(6, qualifiedManualHumanFlips)`, `activityScale=min(1,a/4)`,
  `completionFXP=round(30*activityScale)`, `participation=4*a`,
  `variableBase=min(50,participation+min(25,setupBonus))`,
  `winBonus=round(.30*(completionFXP+variableBase))`,
  `matchFXP=completionFXP+round(variableBase*P)+winBonus`,
  `completionFC=round(8*activityScale)`, `variableFC=max(1,round(variableBase/4))`,
  `matchFC=completionFC+variableFC+round(variableFC*(P-1))+round(winBonus/4)`.
  Draws receive half win bonus, CPU victory none; halves round away from zero.
  P uses up to 24 eligible ordinary manual shots, regresses small samples and is
  clamped .85–1.25. Test/forced/automatic/incomplete/imported/AI-only play cannot
  inflate rewards; Practice/Tutorial/Lab/owner/debug grant zero.
- Store tiers: 200 FC Chrome/Sparks/Impact Rings/Clean Flip/Matte/Bubbles/Splash/
  Table Tamer; 225 Porcelain/Leaves/Dust Cloud/Spin Doctor/Woodgrain/Stars/Petals/
  Clutch; 250 Frosted Glass/Pixel/Blocks/Hot Hand/Neon/Confetti/Comic Pop/Chaos
  Pilot; 275 Galaxy/Snow/Music Notes/Cap Collector/Lava/Smoke/Feathers/Orbit
  Breaker; 300 Ice/Lightning/Gears/Crowd Favorite/Holographic/Prism/Aurora/Flip
  Legend.
- Exact `Howe Test Mode` is a temporary Test Data preview/unlock and mutates no
  progression. `Mr. Howe` is not an unlock code.

## 7. Art, presentation, data and safety

- Artwork is authored Canvas/SVG; generated imagery may be reference only. Use
  300x420 design space, ground near y=376, ~.74 scale, rounded `#2a2430` ink,
  grounded saturation and existing shadow language.
- Approve Coffee Mug, Penguin, Action Figures, Desk Globe, Desk Gyroscope,
  Mechanical Metronome and Potted Plants before bulk art.
- All 51 Flippers have 12 authored live-preview variants (612 total), with funny
  color-correlated, brand-free names unique within each gallery. Variants never
  change collider, mass, tolerance, scoring or odds.
- Use one standardized competitive collider/contact plane. Deterministic
  secondary motion visually responds to local gravity, acceleration, rotation,
  viscosity and impacts without changing ordinary outcomes. Open liquids pour;
  sealed liquids slosh; snow/grains/beads/pendulums/foliage/parts/sand/lava move
  and settle. Half Full is the explicit COM-changing exception.
- Required corrections include Coffee spill, tall cow Milk Carton, Teapot steam,
  recognizable Soup Can, seeded per-flip Smoothie color, flat-base Microscope,
  tall Microphone, stronger mascot/trophy/duck/action/snack art, Snow Globe
  contents, Gyroscope gimbals and Metronome pendulum.
- Eligible characters use one integrated reaction rig: scared airborne, smile on
  make, frown on miss. Never overlay a generic face. Bottle, T-Rex, Globe,
  Gyroscope, Metronome and dynamics-led rigid objects have no reaction face.
  Battle reactions are lane-local.
- Only the Desk Globe sphere is realistic 3D: bundled public-domain offline Urth
  texture, true 360° rotation, minimal WebGL with Canvas fallback and stylized
  stand. A physical make triggers isolated cosmetic focus at 1/100 or 1/10 for
  exact `Mr. Howe`, selecting a deterministic point on the visible hemisphere.
- UI is mature sports-broadcast rather than robotic/childish: 12 columns up to
  1480px at >=1100, two columns at 768–1099, single below 768; eight players fit
  2x4 and 9–16 page without nested scrolling; targets >=48px.
- Standard route: Home -> Setup -> Choose Your Flipper -> Arena Select -> Ready
  -> Game. Arena Select has one animated preview, lazy/static tiles, Random
  Unlocked, Back and `Play Now · {Arena}`. Visual arenas never alter physics.
- Arena art may contain subtle ordinary human/dinosaur crowds, staff, ads and
  transit detail. `v1.12` appears at the bottom of every screen.
- Preserve existing 100 achievement IDs and append 8 Battle, 8 Story/Rival and
  4 Store achievements. Rewards: Common 15 FXP/10 FC, Notable 30/20, Rare 50/30,
  Legendary 75/50. Locked achievements expose only a lock.
- Stats are device-local: newest 100k raw flips, permanent older aggregates,
  UUID-deduplicated JSON import/export, CSV for flips/matches/players/events/
  Story/Battle, separate web/APK stores, no telemetry/account/fingerprinting/
  location/sync. Probability displays show observed count/fraction/percent/n,
  never programmed odds; undiscovered events remain unnamed; Test Data defaults
  excluded.
- One offline NamePolicy guards all boundaries: NFKC, control/bidi removal,
  collapsed whitespace, 14 graphemes, evasion/lookalike detection, safe
  punctuation, blocked text never echoed, safe DOM APIs. Exact `Mr. Howe`,
  `Howe Test Mode` and force/QA names are allowlisted.

## 8. Versioned interfaces, migration and release gates

- Revision 55 landing integration preserves the real engine's deadline pose
  classification. Private `issueDeadlineVerdict` is distinct from the existing
  MISS-only `issueTimeoutVerdict`: after first contact plus 4,000 ms, an explicit
  upright/cap MAKE requires immutable `LandingDeadlineEvidenceV1` captured by
  the engine with `onLandingPlane` and `rotationComplete` both true. Evidence
  uses the existing plane and rotation tests; no force, tolerance or input
  transfer changes. A true timeout stays MISS-only. Bounce/recontact does not
  restart the absolute deadline. Airborne terminal outcomes before any contact
  need their own measured path and cannot fabricate a contact.

- Add `ActivityRegistry`, `MatchRequestV2`, `MatchOutcomeV2`,
  `PostMatchResolutionV1`, `MatchSessionCoordinator`, `LaneRuntime`,
  `BattleStateV1`, `StoryCatalogV1`, `StoryAttemptV1`, `StoryStateV1`,
  `StoryResolutionV1`, `CpuProfileV1`, `ProgressionStateV4`, `FcTransactionV1`,
  `FlipRecordV2`, `MatchRecordV2`, `EventDefinitionV2`, `UrthLexiconV1`, and
  compact monotonic `ResolutionIdentityV1`.
- Separate activity (`free-play|story|rival-board|practice|physics-lab|tutorial`),
  format (`classic|cup|team-clash|battle`) and physics mode
  (`normal|insane|alien`).
- Finalize once before presentation: freeze rules outcome; resolve activity;
  atomically claim progression/story/rival/achievement/economy by immutable
  match ID; queue stats asynchronously; render `PostMatchResolutionV1`.
- `MatchOutcomeV2` enforces rules-phase/status agreement at its shared boundary;
  an active state cannot claim completion and a completed state cannot be
  relabeled abandoned/cancelled. Winner data exists only for completed state.
- `MatchSessionCoordinator` reads a registered activity-state provider at both
  finalize and abandon so a Training session's latest forced/Test Data state
  cannot diverge from its immutable opening request.
- Physics Lab authorization is issued by the Training module or checked through
  an injected current-profile provider. Structurally similar caller objects are
  not authority.
- Rules resolution identity is bounded, namespaced and monotonic. Duplicate or
  stale callbacks reject in O(1), while final outcomes retain only compact
  integrity metadata rather than an unbounded list of prior IDs.
- Reconcile v1.11 through its frozen catalog before V4 migration. Preserve all
  legitimate wins/FXP floor, ownership, modes, arenas, cosmetics and
  achievements without relock/reannouncement. Legacy ownership does not imply
  Story/rival completion. Migrate Tall Buildings selection/entitlement to
  Metronome and Giraffe to Gyroscope; retain historical stat IDs.
- Release requires: frozen contract; tested recovery baseline; core physics and
  input parity; Story/Battle/Globe/art/event vertical slices; 612-variant and
  23-arena art approval; all suites; real smartboard multitouch; 60 FPS 1080p
  and >=45 FPS heaviest four-lane scene; zero open P0/P1/P2; owner phone/desktop/
  board acceptance; reproducible matching web/APK build; independent live,
  stale-cache, offline and APK verification.
