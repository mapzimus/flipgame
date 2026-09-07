# Flipgame v1.12 working plan

> **Superseded:** `docs/v112-contract.md` is the implementation authority. This
> document is retained only as planning history and must not drive behavior.

Status: draft and active implementation contract
Baseline: immutable public v1.11 commit `947133360d3487a646e04be2b313c577474f54a5`
Release name: `v1.12`
Future `v2.0`: reserved until the product owner explicitly declares a build satisfactory

## 1. Release intent and invariants

v1.12 is the playtest-and-polish release after v1.11. It inherits every v1.11
game rule, event, object, progression, privacy, accessibility, deployment, and
APK requirement except where this document explicitly changes behavior.

- Never mutate or replace the public v1.11 release/tag/cache.
- Do not publish v1.12 until the product owner explicitly approves the release.
- The in-progress release must identify itself as `v1.12` once its release
  identity is activated. Stable internal `v111-*` module names and schemas may
  remain unchanged where renaming would create migration risk.
- GitHub Pages, `mapzimus.com/flipgame`, the PWA/offline cache, and the APK must
  all be built from one approved commit and report the same version and source.
- The original Bottle keeps its existing style and never receives a face.
- The original T-Rex/dinosaur is protected: no artwork, animation, physics,
  collider, scoring, or style change is permitted.
- Object artwork and moving contents remain visual only. Every competitive
  object uses the same physics profile, collider, landing plane, and scoring
  tolerance unless a selected physical event temporarily changes them.
- Level-gated selection catalogs remain mysterious: a locked object, arena, or
  achievement shows only `🔒` with accessible label `Locked`; it exposes no
  name, art/silhouette, requirement, progress, or relationship. Once an object
  is owned, all of its authored variants are visible in its variant gallery.
- The cosmetic Store is not a mystery catalog: every purchasable personal
  cosmetic shows its real name, live preview, owned state, and exact FC price
  before purchase. Gameplay advantages are never sold there.
- Major features represented by their own main-menu cards are the narrow
  exception. A locked feature may name itself and show its exact Flip Level
  requirement: Physics Lab says `Locked until FL 50`; Alien and `INSANE MODE`
  say `Locked until FL 100`. These cards do not reveal catalog rewards between
  those milestones.
- v1.12 is a local/pass-and-play game. Online play, rooms, network transports,
  multiplayer UI, and dormant online entry points are removed from the shipped
  page, boot graph, and offline cache. Inert legacy record fields may remain
  only where required to import older local statistics safely.

## 2. Progression and unlock repair

### FXP, Flip Level 100, and spendable Flip Credits

Raw qualifying wins no longer drive new unlocks. v1.12 uses a device-local
progression score named **Flip Experience Points (`FXP`)** and a **Flip Level
(`FL`)**. FXP is earned, cumulative, and non-spendable: it cannot be purchased,
lost, exchanged, or used for random rewards. The deterministic level ladder
runs from FL 1 through FL 100.

**Flip Credits (`FC`)** are a second, spendable, device-local currency. v1.12
awards FC only through legitimate play, level milestones, and achievements;
there is no real-money purchase, ad, loot box, random shop roll, premium track,
or pay-to-win item. FC buys personal visual cosmetics only and can never buy an
object, arena, mode, event, physics/tolerance change, score/life effect, FXP, or
FL. The current FXP, FL, and FC balance are visible; level-gated selection
catalogs never expose their reward order or requirements. Only explicit main-
menu feature cards may show `FL 50` or `FL 100` before discovery.

- A fresh save begins with Bottle as its only selectable object. One plain
  personal style and one baseline arena remain available as functional defaults
  so Customize and Arena Select can operate; they are not advertised as earned
  progression rewards.
- FL 2 through FL 99 interleave all 49 non-Alien objects and the 21 arenas
  beyond the functional default, with Physics Lab fixed at FL 50. The remaining
  non-content levels award a clearly stated FC stipend rather than inventing
  filler cosmetics or flooding the player with a new selection after every
  match. The exact 70 content placements and FC-stipend levels are frozen as one
  pacing timeline before implementation.
- Personal visual rewards are removed from the FL ladder. Existing and new
  finishes, trails, bursts, and nameplates live in the FC Store; one plain set
  remains free. Existing legitimately owned cosmetics stay owned after
  migration and are never charged for retroactively.
- Flip Level 50 unlocks the full Physics Lab as the deliberate
  mastery/training tool for
  the remainder of the climb. Lab play remains Test Data and cannot itself earn
  FXP. Its main-menu card visibly says `Locked until FL 50` beforehand.
- Flip Level 100 is the capstone and unlocks Alien and `INSANE MODE`
  together. Their main-menu cards visibly say `Locked until FL 100`; the Alien
  object's tile inside object selection remains an anonymous `🔒` until owned.
- The mixed order creates a deliberate desirability curve across objects and
  arenas. Familiar objects/stages lead into stranger silhouettes, richer
  motion/materials, and cinematic arenas; the
  final stretch must feel unmistakably stronger than the first. `Better` means
  art, motion, identity, and presentation only—never different mass, collider,
  tolerance, scoring, odds, or competitive advantage.
- Spacing is an acceptance criterion: no more than two adjacent content
  milestones may share a category, every ten-level band contains multiple
  objects plus at least one arena, and object progression retains a readable
  familiar-to-extraordinary rise. FC-only level-ups prevent overcrowding and
  become more generous later without making store completion automatic. The
  exact order is reviewed as a complete contact sheet/timeline rather than
  accepted one ID at a time.
- FXP is earned from completed, legitimate human matches. Completion is
  the largest component; the winning side receives a modest bonus, while a loss
  still earns approximately 70–80% of an equivalent win. Capped bonuses may
  recognize makes, caps, perfect landings, and explicitly selected CPU
  difficulty, but cannot make rare-event luck or one unusually long match the
  dominant route.
- Mode duration, human/CPU composition, roster size, and match configuration are
  normalized and capped so 100-life games, large rosters, repeated easy-CPU
  farming, or a deliberately prolonged turn do not accelerate the ladder.
  Practice, Physics Lab, forced events, Owner Test Mode, incomplete/debug
  sessions, and AI-only play award zero FXP and zero FC.
- Legitimate larger-roster and team matches are worth more FXP because they take
  more coordination and time. The multiplier is sublinear, counts participating
  humans rather than seats filled by CPUs, and has a firm cap. Team modes add a
  bounded teamwork bonus when every human teammate contributes; longer Cup
  formats receive a duration-normalized premium without becoming the only
  efficient progression route.
- Each legitimately discovered achievement grants additional deterministic,
  one-time FXP and FC bonuses based on its revealed rarity. Both awards are
  idempotent and bounded so a luck-driven rare-event achievement cannot skip a
  large portion of the ladder or buy out the Store. Locked achievements still
  expose only `🔒`; name, rarity, description, FXP, and FC values appear only
  after discovery.
  Migration grants the appropriate bonus once for previously earned legitimate
  achievements and summarizes batches instead of forcing a long reveal queue.
- The post-match screen runs the Flip Report specified below. It separately
  shows earned FXP, FL progress, earned FC, and the resulting wallet balance.
  It never previews the identity or requirement of a level-gated selection-
  catalog reward. Outside the named main-menu feature cards, it does not expose
  future requirements or an `XP remaining` tease.
- Existing saves retain every legitimately owned object, mode, Lab entitlement,
  cosmetic, and arena even if it was earned under v1.11's former sequence or
  win-100 Alien rule. Migration maps the old qualifying-win count to at least
  the equivalent Flip Level/FXP floor, retains all owned IDs, and grants any
  newly satisfied v1.12 milestone once; nothing is revoked or repeatedly
  announced.
- The exact FL 2–99 object/arena/FC-stipend timeline, FL curve, FXP/FC earning
  formulas, full cosmetic inventory, and FC prices are frozen by the economy/art
  contract before implementation. Placeholder, duplicated, or visibly weaker
  late content and grind-heavy prices fail the content gate.

### Post-match Flip Report

Every completed eligible match ends with a polished, game-show-style FXP
report. Its information rhythm may take inspiration from modern multiplayer
score tallies, but Flipgame uses its own visual language, sounds, terminology,
layout, and assets.

1. Freeze the final match result and show one concise positive Match Moment.
2. Count in base completion/participation FXP.
3. Add clearly labeled match bonuses, such as legitimate human-roster scale,
   mode/format, teamwork, and win. CPU-filled seats cannot inflate these rows.
4. Show a performance card based on enough eligible attempts, then apply a
   bounded performance multiplier to match-earned FXP. It compares make quality,
   cap/perfect landings, sustained ordinary streaks, clutch results, and team
   contribution against the selected difficulty and format rather than using a
   single raw make rate. Automatic outcomes, forced/test shots, event jackpots,
   deliberate stalling, and duplicate actions cannot improve it.
5. Add newly completed achievement FXP as separate one-time line items after
   the match multiplier; achievement awards are never multiplied.
6. Animate total FXP into an FL meter. Each crossed level receives a short
   level-up beat, then owned rewards reveal in deterministic order. Once
   revealed, each reward is immediately selectable. Selection-catalog rewards
   reveal their identity only after ownership; Physics Lab, Alien, and
   `INSANE MODE` may use their already named main-menu cards.

- The initial tuning envelope is intentionally narrow: approximately `0.85×`
  for a statistically meaningful weak performance through `1.25×` for an
  exceptional one, with `1.00×` as the broad center. Small samples regress
  toward `1.00×`; a match with too few eligible attempts stays neutral.
- The multiplier changes only the bounded match-performance portion. A
  completed legitimate loss always retains a meaningful completion floor and
  advances FXP; poor play can never produce zero or negative FXP.
- Every row has an info affordance explaining what it measured without exposing
  hidden event odds, undiscovered content, or opponent-negative shaming.
- The full count-up can be tapped/clicked to finish instantly. A second action
  continues; one input can never accidentally do both. Reduced Motion replaces
  flying counters/shakes with short fades and immediate numerals, and screen
  readers receive one ordered summary rather than dozens of live announcements.
- FXP calculation and ownership persist atomically before presentation.
  Closing, reloading, backgrounding, or skipping cannot duplicate or lose FXP,
  level-ups, achievements, or reveals.

### Release-blocking defects

- Records and Customize must consume the same live progression store. When a
  Flip Level increase awards an item, it must be selectable without reloading the
  page or starting another match.
- An unlock notification and the resulting picker state must always agree.
- The locked `🔒` tile must be a clean independent tile. It must never retain,
  paint, or reveal the previously selected object beneath the lock before,
  during, or after an unlock animation.
- Object reveals must clear all previous canvas pixels before painting the new
  item and must reset completely between queued rewards.
- Every cosmetic reward—finish, trail, burst, nameplate, and arena—receives a
  visible, accessible unlock reveal. Cosmetic reveals name the type and item,
  show a representative live preview where applicable, and state where it was
  added without exposing future rewards.
- Multiple rewards are queued in earned order and acknowledged one at a time.
  Closing or skipping presentation never loses an already persisted reward.
- Existing v1.11 saves migrate without relocking, duplicating, re-announcing,
  or deleting earned content.

### Hidden owner test unlock

Typing the exact case-sensitive player name `Howe Test Mode` activates a local,
temporary owner test session.

- It makes every object, all 12 variants, every personal visual reward, all 22
  arenas, Alien, `INSANE MODE`, and Physics Lab selectable immediately.
- It does not add FXP/levels, add claimed reward IDs, permanently own
  content, rewrite achievements, or alter the player's real progression.
- The Achievements screen may expose all 100 entries as an explicitly marked
  preview while the mode is active, but none is recorded as earned and the
  normal locked view returns as soon as the mode deactivates.
- Removing or changing the exact name immediately returns the UI to the earned
  state without deleting legitimate unlocks.
- Matches launched while it is active are Test Data and are excluded from FXP,
  achievements, mastery statistics, and default statistics.
- The phrase is allowlisted by the shared offline NamePolicy but is never shown
  as a hint, setting, button, tooltip, or locked-content explanation.
- `Mr. Howe` keeps only its documented event-frequency behavior and does not
  become an unlock code.

## 3. Input feedback and ordinary flip physics

### First Flip Tour

A fresh save offers a short, playable tutorial before Setup. It is optional,
skippable at every step, and replayable from an always-available How to Play
surface. It uses the real input estimator, physics, landing lifecycle, and
bottom-table meter rather than a fake gesture minigame.

- Shot 1 teaches press/drag/flick/release with a silent finger/keyboard ghost,
  then lets the player act. Shot 2 connects power/spin to contact, settling, and
  MAKE/MISS feedback. Concise contextual cards explain lives, upright, cap, turn
  handoff, and that the bottle must settle before the ruling.
- After repeated misses, offer an optional successful-shot ghost and actionable
  reason such as too little height or too much spin. Never secretly overwrite a
  live result or teach a different competitive tolerance.
- Halfway through, Bottle transforms into the original protected T-Rex for one
  guest shot to demonstrate that different objects share competitive physics.
  The tutorial does not unlock it, expose its ladder position/requirement, add a
  picker silhouette, rename it, modify its art, or apply a reaction face.
- Rainbow Corkscrew and Trampoline are deliberately forced as the final two
  tutorial demonstrations. They keep their real telegraph/forces, remain
  physically missable, and can be retried or skipped. The tutorial says only
  that surprising physical events can occur; it exposes no programmed odds or
  undiscovered-event catalog.
- Every tutorial attempt is Test Data, consumes a tutorial-owned RNG stream,
  and awards no FXP, achievement, statistics-by-default, event discovery,
  object/cosmetic ownership, or match record. It cannot perturb the next real
  match's event or trajectory seed.
- The target first-run path remains short: a player can skip directly to Setup;
  a normal successful tour should take roughly 45–75 seconds and never require
  a make, cap, or memorized rules quiz to exit.
- Touch, mouse, pen, and keyboard paths are equivalent. Reduced motion replaces
  transformation/camera travel with a clear crossfade and static diagrams;
  mute and screen-reader users receive complete non-audio instruction.

### Cross-device flip calibration

Playtesting found that a short fast flick could read near 25% on the Practice
meter while launching at full power, and that ordinary objects rotated much
more aggressively than expected. v1.12 recalibrates the signal and launch curve
together.

- The Practice meter reads the same pointer-specific peak velocity used by the
  actual launch. Drag distance is only the matching fallback for a one-jump
  pointer gesture.
- Touch and mouse/stylus equalization uses the active pointer type, not a media
  query about the device screen.
- Phone and desktop are calibrated to the same intended skill window. Desktop's
  approved feel is the anchor; phone gesture capture/normalization is corrected
  rather than narrowing the desktop make window.
- Mobile input consumes coalesced pointer samples/timestamps where available and
  uses a stable velocity estimator that is not dependent on a browser's pointer
  event frequency. A fixed touch multiplier alone is not accepted as parity.
- Equivalent normalized gesture corpora on phone, tablet, desktop, and
  smartboard must produce comparable power/spin distributions and make rates.
  Device size may change available gesture distance, never the underlying
  competitive landing tolerance.
- The regular green band represents a genuinely controlled, broadly landable
  one-flip range. A roughly quarter-strength throw must not be the normal route
  to a complete rotation.
- Ordinary rotation must be visibly slower than the v1.11 playtest build while
  retaining a generous middle make window.
- `Forgiving`, `Standard`, and `Pro` pivot through the same intended launch;
  they differ only in off-speed tolerance.
- The approved physics event profiles retain their calibrated spectacle and
  are rechecked after the ordinary curve changes.
- Alien Invasion is recalibrated independently so its bank-and-ring success
  rate remains comparable from phone through 4K without changing native Alien
  rules.
- At each supported viewport, a frozen human-skill corpus for native Alien and
  Alien Invasion must land within 10 percentage points of its matched Classic
  corpus. Alien's own phone-to-4K make-rate spread must remain within 10 points.
  Its Easy/Medium/Hard CPU rates use the ordinary CPU target bands.
- Life Drain retains the undisclosed magnetic assistance required by its
  contract after the ordinary spin retune.
- Practice's compact meter remains anchored over the table/HUD at the bottom,
  never in the flight path, at every supported viewport.

### ON FIRE presentation restoration

ON FIRE retains every approved life, cap, miss, turn, and sudden-death rule, but
its presentation is restored as a major momentum state and grows with the run.

- Use large object-bound flames, a strong but pose-readable aura, heated table
  light, subtle arena heat distortion, and escalating impact rings/embers.
- Keep an unmistakable `ON FIRE` banner plus the current run/lives-earned count
  visible without covering the object, landing plane, or player order.
- Give ignition, each continued make, cap make, cap reached, and run-ending miss
  distinct visual and audio beats; a restrained sustained pulse connects turns
  while the same player keeps flipping.
- Intensity grows in bounded tiers after ignition instead of emitting the same
  small effect forever. Performance caps prevent unbounded particles.
- Reduced motion replaces particles/distortion/camera energy with strong static
  color, outline, icon, type, and audio cues; it never makes the state subtle.
- Presentation resets completely when the run ends, caps, the player is removed,
  the match changes, or the user returns to menu.

Calibration gates use deterministic seed corpora, not hand-picked single
shots. They cover low, controlled, high, mouse, touch, phone, desktop,
smartboard, 4K, Classic, Alien, and every affected physical event.

### Local player-count expansion

The technical game state is not intrinsically limited to eight players. v1.12
uses one centralized player-limit policy and removes silent eight-entry slices.

- Classic supports 2–16 local players.
- Short Cup supports 2–12 local players; Full Cup remains 2–8 so its complete
  match duration stays practical.
- Team Clash supports every even local count from 2–16.
- Practice, Alien, and Physics Lab remain solo activities.
- Setup displays at most eight seats at once and pages the rest without losing
  edits. During play, Current, On Deck, and After That remain prominent while a
  compact rotating roster preserves every other player and elimination state.
- Sudden-death timing scales by completed rotation rather than raw turn count,
  so a larger roster does not receive fewer full opportunities.
- Saves, rematches, Mirror Match, progression, statistics, results, and exports
  preserve all 16 participants without truncation.

### CPU difficulty repair

The current CPU tiers are substantially too accurate for a social party game
and Alien can invert their intended order. v1.12 recalibrates deterministic CPU
launch distributions without changing human physics or secretly adapting during
a match.

- Target ordinary make-rate bands are Easy 30–40%, Medium 45–55%, and Hard
  60–70% across a large frozen seed corpus. Cap frequency remains a smaller,
  ordered subset of each tier rather than an accidental common result.
- `Easy < Medium < Hard` must hold in Classic, Cup, Team, Alien, Insane, Battle
  substitutes, and every compatible event at every supported viewport.
- Physics Feel continues to change the shared physical tolerance curve, but CPU
  input generation is recalibrated per Feel so selecting Forgiving or Pro does
  not collapse or reverse the advertised CPU ordering.
- CPU launches remain physically plausible and visibly varied. No hidden mercy,
  rubber-banding, streak cap, mid-match aim adjustment, or outcome override is
  allowed. Any future adaptive option must be explicit and owner-approved.
- Human and CPU statistics remain separable so the observed bands can be
  audited without contaminating player progression.

### Battle Mode — simultaneous local competition

Battle Mode is a separate large-touch-display mode. It is local, not
networking, and does not alter ordinary Classic turn-taking. Four simultaneous
flippers is the product and performance ceiling even when hardware advertises
more contacts.

- Duel is 1v1 with two simultaneous lanes. Doubles is 2v2 with four lanes and
  all four players active. Four-Way Free-for-All is 1v1v1v1 with four
  independent scores and targetable powers. Larger Team Battle rosters may use
  up to two active representatives per team—four total—then rotate pairs after
  each completed volley so all players receive equal attempts.
- A short capability check must observe the required two or four genuinely
  simultaneous pointer streams before enabling that format.
  `navigator.maxTouchPoints` is a hint, not sufficient proof. A board that
  verifies only two contacts retains Duel and a two-lane team relay; four-lane
  Doubles remains disabled. Phones do not expose four-lane Battle.
- Every launch zone owns a separate pointer-ID keyed gesture tracker, coalesced
  sample history, power meter, object, physics lane, landing lifecycle, score,
  and camera-safe HUD. A contact that begins in one lane can never mutate
  another lane's input.
- The implementation must not depend on `isPrimary`: every verified active
  contact is valid. Each pointer is captured independently, `pointercancel`
  aborts only its own gesture, and the arena uses `touch-action: none` during
  Battle play.
- The visual scene is one shared table with a restrained center split. v1.12
  keeps the physical lanes independent for deterministic fairness; an optional
  cross-lane collision arena is a later experiment, not a release requirement.
- The initial match shape is best-of-three timed heats. Players continuously
  flip after their own object settles: upright earns one point, cap earns two,
  and a miss earns zero. Faster clean resolution creates more opportunities,
  but an unresolved or missed rush cannot beat a completed make. In team play,
  the score and charge are shared while every attempt remains attributed to its
  flipper. Exact heat length, volley rotation, and tie-break timing require an
  owner-playtested prototype before the rules freeze.
- Valid landings build a bounded Battle charge. At most one stored power-up per
  player may be activated from a large lane-local control. Power-ups are
  physical, obvious, time-bounded, deterministic, and never guarantee a make.
- Self boosts use approved event physics to assist the owner; sabotage powers
  apply a clearly telegraphed Wind/Ice/Gravity/Earthquake-style modifier to the
  opponent's next airborne phase; Chaos powers apply one symmetrical approved
  event to both lanes. An attack cannot be sprung after first contact.
- Existing special events enter Battle only through a curated adapter list.
  Events that assume lives, turn order, a long alternate arena, or an automatic
  result are excluded unless a fair between-heat adapter is explicitly approved.
  Life Drain is excluded. Plinko and Roulette may run only between heats;
  Plinko Automatic Win/Loss resolves only that heat.
- Battle-specific powers may be added where the rare-event registry has no
  clear or fair fit. They use the same telegraph, physics, fallibility, cleanup,
  accessibility, determinism, and performance gates as every other event.
- In Free-for-All, sabotage is explicitly aimed at one opponent before it is
  armed; no hidden automatic target selection or leader-punishing rule is
  allowed. Symmetrical Chaos powers affect all four lanes equally.
- Battle outcomes, power activations, simultaneous inputs, heat results, and
  capability diagnostics are recorded locally using the ordinary Test Data and
  privacy boundaries.
- The four-lane heaviest supported combination must sustain at least 45 FPS on
  the target smartboard; two-lane play targets 60 FPS at 1080p.

### Plinko height and camera correction

The canonical board still has nine physical prize slots. A playtest view that
appears to show only seven is a camera/cropping defect, not a rules change.

- Retain the nine-slot prize order and the single center Automatic Win.
- Extend the peg field substantially beyond the current eight-row board so the
  object begins much higher above the prize bins and has a visibly longer,
  suspenseful physical fall.
- Target a 12-second median physical drop, with most clean deterministic drops
  resolving in 10–15 seconds. The duration comes from real peg-field distance,
  never artificial slow motion, an off-camera wait, or repeated fake bounces.
- Start the tracked shot near the top of the extended board; do not simulate a
  long fall off camera and do not shrink the whole board into one distant view.
- Keep the object readable near the middle of the frame while the board scrolls
  behind it. The camera transitions smoothly from entry, through the long peg
  field, to the complete nine-bin prize band.
- At the prize reveal, all nine dividers/slots and the landed object must be
  unambiguous at phone, desktop, smartboard, and 4K sizes. If the whole board is
  wider than a compact viewport, the final camera must still communicate the
  selected bin and its neighboring symmetry without implying that slots are
  missing.
- Preserve deterministic outcomes, physical peg collisions, and anti-wedge
  recovery. Camera/layout changes may not alter the seed-to-slot result.

## 4. Object and variant selection experience

The Variant tab becomes an artwork gallery rather than a row of color dots.

- Selecting an object immediately renders all 12 of that object's actual
  authored variants in the Variant grid.
- Each tile shows the real silhouette, cast, finish, moving parts, and selected
  color that will appear in play; the player does not have to Apply and return
  to Setup to discover what a blue/red/etc. version looks like.
- Switching objects repaints all variant canvases for that object immediately.
- Switching variants updates the Customize preview immediately while retaining
  Cancel/Apply semantics for the real setup row.
- Each object's 12 variants has 12 distinct, funny, color-correlated names.
  The shared color puns remain recognizable—for example Blue Steel, Orange
  Crush, Grape Expectations, Ice Ice Baby, Lemon Aid, and Very Cherry—and are
  combined with that object's authored cast name so the labels are unique and
  descriptive.
- Accessible names include the object and variant name, selection state, and
  locked state without relying on color alone.
- Locked cast variants never render art or leak names. Owner Test Mode may
  render them because it explicitly supplies a temporary unlocked view.
- Preview rendering is bounded and lazy so 12 animated canvases do not reduce
  smartboard gameplay performance or cause unbounded 4K caches.

### Dedicated Arena Select screen

Arena choice is no longer buried in Setup or Customize. The required pre-match
flow is `players/mode -> object + variant + personal cosmetic -> ARENA SELECT ->
ready beat -> match`, following the clear fighter-then-stage rhythm of a local
party game.

- `ARENA SELECT` is a full-screen destination immediately before play, not a
  dropdown, compact modal, or settings card. It uses a large live, animated
  preview plus a browsable grid of available stages.
- One arena is selected globally for the match. Players still choose their own
  object, variant, and one personal cosmetic independently.
- Include `Random Unlocked`, Back, and an explicit Start/Confirm action. Back
  preserves every player and customization choice. Random never chooses locked
  or mode-incompatible content.
- Locked stage tiles show only `🔒` with accessible label `Locked`; names,
  scenery, requirements, silhouettes, and unlock progress remain secret.
- The ready beat names the chosen unlocked arena, stages the selected objects,
  and lasts only long enough to establish the match. It cannot hide loading,
  alter a seed, or accept an accidental launch.
- Rematch offers Same Arena and New Arena. New Arena returns directly to Arena
  Select without discarding teams, order, lives, objects, variants, or
  cosmetics.
- Cup keeps the chosen visual arena for the series unless New Arena is selected
  between completed heats. The existing Arena Draft remains a separately named
  physics-modifier decision and may not silently replace the visual stage.
- Battle shows only arenas with qualified two- and four-lane compositions; its
  stage art must preserve lane boundaries, meters, targets, and simultaneous
  touch readability.

### Expanded arena collection and hidden unlocks

The ten existing arenas remain owned for migrated saves and receive the same
visual-art-direction review as the menu. v1.12 adds twelve authored arenas for
22 total. Each is a lively place with depth and bounded ambient reactions, not
a flat wallpaper or a sterile settings theme.

| New arena | Scene and reactive identity |
|---|---|
| School Cafeteria | Long lunch tables, trays, wall clock, and windows; a strong landing rattles trays and earns a brief lunch-bell/crowd reaction. |
| Sports Locker Room | Benches, lockers, jerseys, tape, and a tactical board; makes pulse the scoreboard and locker lights. |
| Mars Outpost | Pressurized habitat windows, rover tracks, red dust, and a distant lander; impacts kick up exterior dust without changing gravity. |
| Grand Library | Tall shelves, rolling ladders, lamps, and a reading gallery; nearby books and page edges react subtly to impact. |
| Island Beach | A stable competition table above sand with surf, palms, rock pools, and distant boats; waves and birds react to big moments. |
| Pirate Ship Deck | Rigging, sails, cannons, lanterns, and ocean horizon; the surrounding ship breathes and celebrates while the scoring table remains visually level. |
| Aquarium Tunnel | Curved glass, schools of fish, rays, caustic light, and deep-water silhouettes; fish scatter from hard impacts. |
| Skate Park at Sunset | Concrete bowls, rails, murals, and a warm skyline; boards roll past and spectators react after results, never through the flight path. |
| Rainforest Treehouse | Canopy platforms, vines, mist, birds, and distant falls; leaves and wildlife answer the result without obscuring play. |
| Haunted Hall | Old portraits, chandeliers, moonlit windows, and restrained supernatural details; lightning and portraits react without jump scares. |
| Stadium at Night | A championship table on the field with stands, tunnel lights, ribbon boards, and a live scoreboard celebration. |
| Movie Soundstage | Visible flats, practical lights, camera rails, props, and crew silhouettes; successful shots cue a clapboard and lighting change. |

- The existing Space Station is upgraded as the flagship zero-window-view
  stage with a rotating Earth view, station structure, moving equipment, and
  physically readable table lighting; it is not duplicated by Mars Outpost.
- Arena animation, sound, and camera response may celebrate or react, but cannot
  alter gravity, collision, input, scoring, visibility of the landing plane, or
  competitive timing. Any physical arena modifier belongs to the explicit
  Arena Draft/event system instead.
- The 21 unlockable arenas are interleaved with object and personal visual
  rewards across the fixed 2–198 sequence; the baseline arena is available on a
  fresh save. They do not arrive as an early or late block. A newly earned arena
  gets the same queued visual/accessibility reveal as every other reward.
- No arena or personal visual unlock depends on a random event, real-world date,
  daily login, spending, online play, or an unbounded grind.
- Owner Test Mode temporarily exposes all 22 arenas without earning them.

### Full menu creative redesign

The existing Setup/Customize/Stats shell is functionally responsive but has
been rejected as robotic and boring. v1.12 replaces the visual language and
interaction hierarchy rather than applying a superficial recolor.

- The menu should feel like entering the same lively physical game as the play
  arena: large object/player staging, playful depth, expressive motion, bold
  focal actions, and an illustrated environment that continues behind the UI.
- Replace the repeated admin-dashboard card grid with a premium tabletop-sport
  and modern game-broadcast composition. Settings remain easy to find but are
  secondary to players, objects, modes, and the Start action.
- Player seats behave like a party-game roster with large live object previews,
  identity/color/cosmetic cues, and clear Current/Next flow—not form rows.
- Mode selection uses physically illustrated choices and short playful copy;
  the selected mode changes the scene without exposing hidden probabilities.
- Customize feels like a character/object stage or workshop. The selected item
  remains large while the real variant gallery is browsed around it.
- Stats and Achievements inherit the same personality while keeping charts,
  labels, filters, and discovered/locked boundaries readable.
- Motion is purposeful and brief: object idle motion, selection reactions,
  panel transitions, and physical button feedback. Reduced motion retains the
  visual personality without large movement.
- Desktop/smartboard uses the full landscape canvas; phone receives a designed
  mobile composition, not a desktop board squeezed into a narrow column.
- Preserve 48px touch targets, keyboard/focus support, no horizontal overflow,
  paged 16-player setup and eight-visible-seat 1280×720 viability, readable 4K
  scaling, and fast first load.
- The presentation must feel appropriate for high-school students and adults:
  confident, tactile, and playful, but never candy-colored, casino-like,
  toy-like, or dependent on childish arcade ornament.

Before implementation, produce at least three clearly different concept boards
and one interactive code-native prototype of the chosen direction. The product
owner approves the direction at 1280×720 and phone size before any full menu
rollout. Generated imagery is reference only; shipped UI/art remains original,
authored, offline-capable HTML/CSS/canvas/SVG with no generated raster or online
runtime dependency.

## 5. Artwork and object-specific physical motion

All 25 new objects and all applicable legacy objects receive a visual-quality
and internal-motion review. Internal motion is deterministic from the bound
flip seed and physics state, does not consume gameplay RNG, and replays exactly.

### Contents and object motion

- Open liquid reacts to angle, angular velocity, and acceleration and can pour
  when the opening is inverted or the liquid is carried outward. Coffee in the
  Coffee Mug visibly falls out upside down. Water in applicable open legacy
  objects receives the same treatment.
- Sealed liquids visibly slosh with a believable surface, lag, and viscosity
  but never leave the object. This applies to the original Bottle and every
  applicable old/new sealed container.
- Teapot steam responds to flight, rotation, and reduced-motion settings.
- Smoothie liquid uses a deterministic random color on every flip, remains
  stable during that flip/replay, and visibly behaves like a thick liquid.
- Snow Globe snow responds to flight/impact and settles around an anchored,
  working miniature scene. The house does not float as a loose particle.
- Desk Globe contains recognizable real-world geography and a full 360-degree
  rotating globe. Only the literal Earth sphere uses realistic three-dimensional
  rendering: complete high-detail geography, curvature, atmosphere, directional
  light, limb shading, and specular ocean response. Its stand, meridian, base,
  and all surrounding object art retain the approved authored Flipgame style.
  The sphere remains self-contained, deterministic, brand-free, and offline;
  no runtime map tiles, APIs, tracking, or network fallback are permitted.
- The gameplay sphere rotates continuously rather than presenting a fixed
  Africa-facing decal. All longitudes must become visible during a full cycle,
  rotation remains legible in picker previews and live play, and object motion
  may add deterministic inertial lag without changing the collider or score.
- A Desk-Globe-only post-make showcase rolls on successful physical landings:
  1/100 normally and 1/10 when the exact case-sensitive active player name is
  `Mr. Howe`. It selects a deterministic random point safely inside the
  currently visible hemisphere, briefly pushes the result camera into the real
  globe surface, shows the local geography, and returns before normal input.
  It is cosmetic, uses a separate RNG stream, never changes or consumes event
  RNG/results/progression, and does not run for misses or automatic outcomes.
  Physics Lab can force the showcase. Reduced motion uses a stationary magnified
  inset/crossfade instead of camera travel.
- Sand, gumballs, snacks, leaves, flexible stems, lava, bubbles, loose parts,
  lids, handles, and similar applicable components react physically and settle
  plausibly without affecting competitive outcomes.

### Product-owner visual review list

- Coffee Mug: retain approved silhouette; add correct upside-down spill.
- Milk Carton: tall, unmistakably large carton with an original brand-free cow
  illustration on the side.
- Teapot: responsive working steam.
- Salt/Pepper Shaker: retain the approved direction.
- Soup Can: clearly reads as soup with stronger food-can storytelling; replace
  the object only if the next authored review still cannot meet that bar.
- Smoothie: stronger cup/liquid rendering plus per-flip liquid color.
- Gumball Machine: retain approved direction and working contents.
- Microscope: significant visual upgrade and a flat, readable base.
- Desk Globe: only its literal Earth sphere is realistically rendered in 3D;
  it shows the complete rotating world and supports the post-make globe-focus
  showcase while its stable stand stays in the shared illustrated style.
- Microphone on a Stand: unmistakably tall with a weighted landing base.
- Potted Plants: retain the approved cactus direction and all twelve required
  plant/pot casts.
- Penguin, Owl, Giraffe, and Red Panda: major character-art upgrades; Owl may
  not have a detached/floating face; Giraffe must be the tallest object.
- Trophy Cup: larger and more dramatic, using a tall championship-cup presence
  without copying a trademarked real trophy.
- Snow Globe: working snow and miniature-scene dynamics.
- Huge Rubber Duck: fix awkward anatomy/silhouette and improve expression.
- Action Figures: substantially more authored detail across all twelve
  original, brand-free characters.
- Tall Buildings: substantially more architectural detail across all twelve
  required casts.
- Box of Snacks: full redesign with clear box construction and multiple
  readable, generic moving snack contents; no low-detail placeholder art.
- Original T-Rex: protected and unchanged.

### Selective reaction faces

Faces are not universal. Only silly character-like objects without a stronger
physical mover use the reaction system. The approved new-object allowlist is
Penguin, Owl, Giraffe, Red Panda, Eyeball Monster, Huge Rubber Duck, and Action
Figures. The legacy allowlist is Bowling Pin, Traffic Cone, Chess Pawn, Whipped
Cream, Lawn Chair, and Alien.

- Allowlisted objects show scared while airborne, then smile after a make or
  frown after a miss.
- Every eligible variant has exactly one visible face. Its authored neutral
  eyes/mouth are replaceable expression layers, not permanent marks beneath a
  second generic face. While scared/smile/frown is active, neutral facial
  features are suppressed or cleanly repainted before the new expression;
  afterward the single neutral face is restored.
- The reaction painter must not add a generic white eye plate, smile, or frown
  over baked eyes, beaks, mouths, visors, or other existing facial geometry.
  Each variant supplies anchors/masks or an authored expression callback that
  respects its own anatomy and style.
- A brief non-blocking camera focus frames the face after resolution; it never
  changes the verdict, turn timing, or input availability.
- Liquid-, steam-, snow-, globe-, foliage-, lava-, sand-, or granule-led
  objects use their physical mover instead of an added face.
- Original Bottle and T-Rex never receive a face or face-camera treatment.

## 6. Special-event spectacle and challenge audit

Every one of the 30 physical events receives an individual design and code
review in v1.12: Rainbow Corkscrew, Half Full, Power Launch, Fizz Jet, Golden
Flip, Bouncy Bottle, Earthquake, Moon Gravity, Ice Slide, Alien Invasion,
Gravity Slam, Trampoline, Wind Tunnel, Shrink Ray, Portal Pair, Tether Swing,
Mitosis, Double Flip, Ceiling Flip, Meteor Shower, Magnet, Heart Rush, Black
Hole, Boomerang, Roulette Table, Rewind, Plinko, Mirror Match, Cap Toss, and
Life Drain.

### Shared event rules

- The event must be unmistakable before or at launch through a unique telegraph
  and must remain visually legible while it is affecting the object or arena.
- Each event needs a distinct physical silhouette: forces, collisions, moving
  geometry, mass/inertia, gravity, restitution, friction, tethering, splitting,
  portals, or another observable mechanic—not only a tint, label, or particles.
- Visuals, sound, camera, HUD copy, and physical behavior must tell the same
  story. Important effects cannot depend on color alone.
- Events are not generic assistance. The set deliberately includes helpful,
  harmful, mixed, and skill-transforming challenges; no global stabilizer or
  auto-alignment may flatten them into easy guaranteed makes.
- Every event retains a genuine, non-zero miss path. Strong assistance may make
  failure very rare for some inputs, but no event may guarantee the landing.
  This supersedes the earlier Life Drain wording that its hidden magnet lands
  every time: the magnet remains undisclosed and very strong, but an extreme or
  badly directed launch must still be able to miss.
- Plinko remains the only event containing an Automatic Win result, but the
  event itself can fail because its physical nine-slot board also contains two
  Automatic Loss slots. No other event creates an automatic win.
- Mitosis duplicates the complete currently selected object into two visibly
  recognizable scaled clones. It never detaches or substitutes a bottle cap.
  The clones share the original mass, preserve combined angular momentum, use
  the selected variant/cosmetic, and receive independent visual-content state.
  Either valid landing counts and both valid landings pay the approved bonus.
  Cap Toss is the only event allowed to create a standalone cap and must define
  an anatomy-appropriate equivalent for an object that genuinely has no cap.
- Rewards are applied only after the physical verdict and never retroactively
  turn an invalid landing into a make unless that event's explicit mechanic is
  the Plinko result or Rewind's one visible replay.
- Helpful events must have a skill or risk tradeoff; hostile events must remain
  difficult but playable. Broad deterministic input corpora must contain both
  makes and misses for each event, with calibrated exceptions documented when
  one outcome is intentionally rare.
- Event physics and presentation clean up completely on verdict, rematch, mode
  transition, resize, interruption, and replay. No force, camera transform,
  body, tint, sound loop, or reward leaks into the next flip.
- Reduced-motion mode keeps the event mechanically equivalent and replaces
  excessive motion with clear static/low-motion cues rather than hiding it.
- Smartboard spectacle must not violate the 45 FPS heaviest-event floor; normal
  event play targets 60 FPS at 1080p.

### Individual audit deliverable

For each event the dedicated reviewer records its current behavior, telegraph,
physics, visual/audio/camera treatment, helpful/harmful/mixed bias, exact miss
path, recommended upgrades, performance/reduced-motion fallback, mode-specific
adapter concerns, and deterministic acceptance seeds. Any event that is outcome
guaranteed or effectively automatic across broad input is a release-blocking
defect and is recalibrated by its owning subsystem.

### Alien presentation restoration

- Native Alien and temporary Alien Invasion both visibly include the floating
  UFO/saucer bank surfaces promised by their physics. An invisible saucer body
  is forbidden because it makes a collision look random.
- The two modes share one obstacle-state/render interface so temporary Alien
  cannot configure zero-gravity walls/ring while omitting the UFO list.
- Saucers have obvious depth, motion, collision flashes, and a readable bank
  surface without obscuring the tractor ring or object.
- Compact screens may use fewer saucers for clarity, but never zero; the camera
  must keep them inside the playable view. Desktop/smartboard uses the full
  calibrated set.
- Tests compare physics obstacle bodies with rendered obstacle entries before
  launch and during motion for both modes and every supported viewport.
- Alien remains a different physical skill, not a different difficulty. A valid
  score requires at least one visible UFO/saucer bank followed by tractor-ring
  entry; tuning ring capture, attraction, bank placement, and world scale may
  equalize difficulty, but the verdict cannot be secretly loosened.
- Desktop/smartboard uses the complete available arena rather than a reduced
  phone-sized play space. Native Alien and Alien Invasion share the same
  normalized geometry and success-rate contract before their source object's
  ordinary profile is restored.

## 7. Statistics and test-data boundaries

- All v1.11 local-only Stats Lab, export/import, privacy, retention, and name
  safety guarantees remain in force.
- Unlock/reveal events gain deterministic local diagnostics sufficient to
  reconcile `earned`, `announced`, and `selectable` states without recording
  locked content names.
- Owner Test Mode and forced-event sessions are clearly stored as Test Data and
  excluded by default from graphs, achievements, progression, and mastery.
- No cloud telemetry, public aggregate, fingerprinting, location collection,
  third-party analytics, or cross-device synchronization is introduced.

### Requested public aggregate data: separate design gate

The product owner also requested collecting and storing statistics from public
gameplay going forward. That request is retained in v1.12 planning, but it may
not be silently combined with the existing private Stats Lab. The current game
is intentionally device-local and will be used by minors in a school setting.

Before any public collection is enabled, a separate written data contract must
be approved covering purpose, explicit notice/consent, data fields, anonymous
aggregation, child/student privacy, retention/deletion, abuse controls, hosting,
access, breach handling, export, and an off switch. At minimum it must exclude
display names, exact location, raw IP/device fingerprints, free text, and stable
cross-site identifiers. Until that gate is approved and independently reviewed,
v1.12 keeps public telemetry off and retains all full-fidelity data locally.

## 8. Implementation and approval waves

1. **Contract/status freeze** — preserve v1.11 history, adopt this v1.12 delta,
   enumerate current commits, and open v1.12 defect IDs.
2. **Progression repair** — one live store, owner test view, safe migration,
   clean reveal lifecycle, and complete cosmetic notifications.
3. **Input/physics calibration** — align meter and launch signal, retune ordinary
   spin, recalibrate Alien/events, and extend/requalify Plinko with deterministic
   simulations.
4. **Offline-only and local scale** — remove Online from UI/boot/cache/runtime,
   centralize local player limits, and eliminate silent eight-seat truncation.
5. **Battle prototype gate** — prove isolated two- and four-contact input,
   two/four physics lanes, Duel/Doubles/Free-for-All/Team rotation, performance,
   and hardware fallback before deciding whether Battle ships in v1.12.
6. **Event design audit** — complete the 30-event matrix, freeze approved
   spectacle/challenge upgrades, and route physical/renderer/rules changes to
   their owners without changing unrelated Classic behavior.
7. **Creative direction approval** — compare at least three genuinely distinct
   menu/art directions and approve one code-native responsive prototype before
   scaling it across routes or object variants.
8. **Variant gallery** — actual 12-art preview tiles, funny cast-aware names,
   immediate repaint, secrecy, accessibility, and cache bounds.
9. **Art/dynamics review** — inspect all 25 new objects and every applicable
   legacy object against the itemized owner feedback and protected invariants.
10. **Interactive product review** — provide object/variant gallery and physics
   build for the owner to playtest; rejected visual directions return to their
   subsystem before release QA.
11. **Independent qualification** — progression/migration, physics simulation,
   screenshot matrix, responsive browser, performance, accessibility,
   PWA/offline, Android, and deployment audits against one exact commit.
12. **Release candidate identity** — activate all player-facing `v1.12`
   identifiers and a new atomic cache key only after feature qualification.
13. **Owner release approval** — no deployment until explicit approval.
14. **Dual deployment and APK** — publish the same approved commit to GitHub
    Pages and `mapzimus.com/flipgame`, create the signed upgradeable APK, then
    independently verify both origins, stale-cache upgrade, offline reload,
    version badge, provenance, and gameplay parity.

## 9. v1.12 release gates

- **Progression gate:** every even Flip Level 2–198 produces exactly one
  correct fixed reward, Level 50 supplies Physics Lab, and Level 200 supplies
  Alien plus `INSANE MODE`; saved, announced, and selectable states agree
  immediately; losses award less but meaningful normalized FXP; the Flip Report
  calculation, multiplier, count-up, multi-level reveal, skip/reload behavior,
  and achievement awards are exact and idempotent; all old saves retain
  ownership; no FC economy exists.
- **Secrecy gate:** selection catalogs do not expose locked names, art, order,
  or requirements, and no locked canvas retains previous or future art. Only
  the Physics Lab, Alien, and `INSANE MODE` main-menu cards show their approved
  `FL 50`/`FL 200` requirements.
- **Owner-test gate:** the exact phrase unlocks only an ephemeral view and every
  resulting match is excluded from earned/default data.
- **Physics gate:** the visible meter matches actual launch power, quarter-bar
  throws do not become ordinary full flips, the controlled range remains fun,
  event/Alien calibration meets cross-viewport bounds, and the extended Plinko
  preserves deterministic nine-slot outcomes with a complete tracked 10–15
  second fall.
- **CPU gate:** Easy/Medium/Hard make and cap rates remain in their frozen,
  strictly ordered bands across Feel settings, local modes, events, Alien, and
  all supported viewports without human-physics or verdict overrides.
- **Local-scale gate:** all supported Classic/Cup/Team counts preserve every
  participant through setup, play, sudden death, rematch, save, results, stats,
  and export with no silent eight-player truncation.
- **Battle gate:** verified two/four contacts remain isolated by pointer and
  lane; all physics lifecycles resolve fairly at performance targets; the
  capability fallback is truthful; and every power is telegraphed, physical,
  fallible, target-correct, and restricted to its approved adapter.
- **Event gate:** every event is unmistakable, physically distinct, produces
  both a skill opportunity and a genuine miss path, and passes its individual
  physics/reward/visual/audio/camera/cleanup/reduced-motion/mode tests.
- **Variant gate:** all 51 objects expose correct available variants; every new
  object has 12 visible, named, art-accurate selections with no delayed reveal.
- **Creative gate:** the owner explicitly approves the menu direction and base
  object style in real 1280×720 and phone prototypes; structural render tests
  alone cannot satisfy this gate.
- **Artwork gate:** all 300 new variants plus applicable legacy dynamics pass
  screenshot, animation, clipping, baseline, reduced-motion, replay, and
  protected-T-Rex checks and receive product-owner visual approval.
- **Offline-only gate:** the shipped UI, boot graph, cache manifest, runtime,
  and reachable routes contain no online-play surface or transport. Legacy
  imports remain readable without activating network behavior.
- **Regression gate:** no approved rule, reward, physics event, mode, stats,
  name-safety, accessibility, responsive, or performance behavior regresses.
- **Release gate:** zero known P0/P1/P2 defects; web and APK build reproducibly
  from one clean approved commit; no stale v1.11 assets or mixed cache identity.
- **Post-release gate:** both public origins and the APK report `v1.12`, publish
  matching provenance, upgrade safely from v1.11, work offline, and pass a
    representative Classic/Practice/customization smoke test.

The public-aggregate statistics design gate is a parallel product/privacy work
item, not permission to delay the local gameplay fixes or silently add network
collection to the release candidate.

## 10. Current implementation status

- Complete locally: Practice meter moved into the bottom table/HUD region.
- In progress: shared live progression-store repair and regression test.
- In progress: Practice meter now consumes actual peak launch velocity.
- In progress: ordinary spin calibration and Alien/event requalification.
- Not started: hidden Owner Test Mode implementation.
- Not started: rendered 12-variant gallery and cast-aware funny tile names.
- Not started: cosmetic unlock presentation and stale reveal-canvas cleanup.
- Not started: longer Plinko peg field and the seven-visible-slot camera/crop
  correction; the rules/physics model already contains all nine prize slots.
- Audit complete: the individual physical, visual, challenge, miss-path,
  cleanup, and accessibility review found major systemic and per-event blockers.
  Trampoline, Wind Tunnel, Mitosis, and Plinko are the first owner-playtested
  calibration set; the remaining events cannot inherit that system until the
  set is approved.
- Existing but awaiting continued owner review: major new-object artwork,
  selective reaction faces, open/sealed internal contents, legacy dynamics,
  Smoothie color, Snow Globe motion, and real rotating Desk Globe.
- Defect confirmed: the current reaction overlay can superimpose a second face
  over authored neutral features; the single replaceable-face pass is pending.
- Rejected: the current menu visual language and the current new-object art pack
  are not approved for v1.12. Concept calibration must precede another bulk pass.
- Defect confirmed: phone input feels materially harder than the approved
  desktop experience; cross-device gesture capture/calibration is pending.
- Defect confirmed: floating UFO bank surfaces are missing in observed Alien
  and Alien Invasion play; physics-state/render/camera parity audit is pending.
- Defect confirmed: ON FIRE has lost its prior visual intensity; an escalating
  cross-turn presentation and cleanup pass is pending.
- Contract changed: Online play must be removed completely from the v1.12 UI,
  runtime dependency graph, and cache; implementation is pending.
- Design gate active: local rosters expand within mode-specific limits up to 16
  total, and Battle prototypes 1v1, 2v2, 1v1v1v1, and rotating Team formats with
  no more than four simultaneous objects.
- Event blocker confirmed: Mitosis currently renders a generic secondary body
  rather than two complete selected-object clones.
- Defect confirmed: current CPU success bands are too high for party play and
  Alien can invert Easy/Medium/Hard ordering; recalibration is pending.

## 11. Free production and QA stack

v1.12 uses the strongest available no-additional-cost workflow:

- Built-in image generation creates non-shipping art and UI concept boards.
- Final assets and interface remain authored canvas/SVG/HTML/CSS so the game is
  crisp, editable, fast, offline-capable, and free of runtime service costs.
- Browser-controlled local/live testing supplies phone, desktop, smartboard,
  keyboard/touch, screenshot, geometry, and console evidence.
- Multi-agent specialists run deterministic simulation and adversarial audits
  in staged waves under one evidence ledger.
- Existing Data Analytics tooling reviews probability/statistical charts.
- Existing Cloudflare performance tooling audits load behavior and Web Vitals;
  it is not a new paid runtime dependency.
- Figma is an optional collaborative plugin, not a required dependency. The
  release can reach the same quality bar with the built-in concept and
  code-native prototype loop.
- Not released: v1.12. Public v1.11 remains the stable baseline.
