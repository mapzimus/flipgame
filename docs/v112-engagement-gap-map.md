# Flipgame v1.12 engagement gap map

> Reference audit only. `docs/v112-contract.md` is the implementation authority
> wherever this earlier analysis differs from the frozen Pressure Signal plan.

Status: read-only product audit of the current v1.11-derived tree and the active
v1.12 plan. This document recommends product priorities; it does not change a
game rule or authorize release.

## Product stance

The goal is a game people *want* to replay because it is quick to understand,
fair, funny in a group, and full of stories worth retelling. It should not be
made “addictive” through compulsion, pressure, or obscured odds.

The best fit for this game is a four-layer engagement loop:

1. **Flip:** an input feels physical and the result is instantly legible.
2. **Heat:** tension rises, everybody stays involved, and the outcome feels fair.
3. **Rematch:** the same group can run it back in seconds with a fair opener.
4. **Session:** the game remembers positive rivalries, discoveries, and funny
   moments locally without turning play into a grind.

The v1.12 audience and platform boundaries remain firm: local/offline play,
high-school and adult visual tone, no more than four simultaneous flippables on
a smartboard, accessible alternatives for motion/color/sound, and no online or
public-data dependency.

## What exists and what is missing

| Area | Already in the current tree | Planned or in progress for v1.12 | Engagement gap |
|---|---|---|---|
| Core play | Classic elimination; Short/Full Cup; Team Clash; Practice; Physics Lab; Normal/Insane event profiles; cap lands; stake escalation; sudden death; ON FIRE | Larger local rosters and whole-rotation fairness | No quick-first party preset or duration signal. The default 10-life Classic plus per-turn handoffs can make the first session feel long before the group learns why it is fun. |
| Battle | No Battle runtime, setup, lanes, or rules are implemented; input/physics/rendering are singletons | Duel 1v1, Doubles 2v2, Four-Way FFA 1v1v1v1, and rotating two-team Battle, with a universal four-active-object ceiling | The highest-value party feature is still a design gate. Heat duration, tiebreak, re-fire/volley timing, team setup, power cadence, and fallback copy are not frozen. |
| Fairness and trust | Deterministic physics, visible results, separate CPU setting, three Feel settings, local stats | Input calibration is active; CPU bands and Alien parity are specified | Current measured CPUs are about 49%/73%/84% in Standard Classic, and Alien can approach 85% even on Easy. Matched human Alien performance is also far above Classic and varies by viewport. A loss that feels pre-decided destroys rematch intent. |
| Setup | Saved roster, automatic safe defaults, Human/CPU toggle, object preview, customization, mode summaries | Full creative redesign and paged rosters up to 16 | Current menu reads as an admin form, exposes many choices before play, and still caps at eight. Team assignment is implicit rather than a clear party roster moment. |
| Arena selection | Visual arena is currently buried as a global tab inside per-player Customize; Cup Arena Draft is a separate between-heat physics choice | A required full-screen Arena Select immediately before play; 22 visual arenas (10 inherited plus 12 new), Random Unlocked, live preview, Same Arena/New Arena rematch paths | The fighter-then-stage rhythm is party-friendly, but an unconditional extra screen can hurt time-to-first-fun. Catalog ownership, hidden-feat awards, Battle-compatible subsets, migration, and the distinction from Arena Draft all need one frozen contract. |
| Onboarding | Persistent “Flick up” hint, optional flick feedback, Practice meter, and one-time Alien bank-shot toast | Input meter correction | There is no first-run guided flip, always-available How to Play route, or visual explanation of stake/ON FIRE/Cup/Team/Battle. Battle calibration has not yet been designed as teaching. |
| Turn pacing | A result is shown for 1.5 seconds; an elimination adds 1.8 seconds; CPUs fast-forward; a pass gate prevents accidental input with more than two active humans | Current/On Deck/After That focus HUD for larger rosters | Every human turn in a 3+ player game still needs a separate Ready action after the result beat. There is no measured active-play ratio, wait-time budget, quick skip, or smartboard-specific handoff treatment. |
| Result/rematch | Winner hero, full scoreboard, per-player make rate and streak, Cup next heat/New Cup, Same Setup, Rotate, Shuffle, Swap Teams, and rules-owned Cup/Team proposals | Results must scale to 16 | The primary copy says “Same Setup,” not “Rematch,” and Classic silently gives the previous winner the next opener unless the group separately proposes a rotation. There is no visible “moment of the match,” explicit session score, or fast positive recap. |
| Feedback | Make/miss/near-miss banners, event labels, particles, camera nudge, impact sounds, haptics, tension pulse, cap/Great Save/win stingers, and reaction focus | ON FIRE restoration and a 30-event physical/visual/audio audit | The foundation is unusually strong, but important states currently compete for one banner/audio channel. ON FIRE is underpowered, many events are generic/subtle, and four-lane audio/visual priority is undefined. |
| Variety | Thirty physical events, rare rewards, Arena Draft between Cup heats, 51 objects, twelve variants per object, cosmetics, and 10 current visual arenas | Event requalification, full variant gallery, longer Plinko, and 12 new authored locations for 22 total arenas | Variety is broad but not reliably understandable. Sending all events into Battle would create noise and fairness risk; new players also cannot preview the actual variant or arena they select. Twenty-two reactive stages are a substantial art/performance scope, not a menu-data change. |
| Long-term progression | Deterministic 100-win reward ladder, local Hall-of-Fame data, 100 achievements, local save backup | Shared live-store repair, full reward reveals, owner test view, and 12 deterministic hidden-feat arena unlocks outside the 1–100 ladder | Unlock notification/picker disagreement and missing cosmetic reveals break trust. A single result may now earn ladder, achievement, and feat rewards, so ordering/idempotence must be explicit. Reward reveals can also interrupt the rematch moment. Hall-of-Fame rendering exists in code, but the current page has no `#records-panel`, so it is not visibly part of the party loop. |
| Desk Globe delight | Current authored Desk Globe art/motion exists as a visual object | Only the literal Urth sphere becomes realistic 3D, rotates through all 360°, and can trigger a post-make visible-hemisphere showcase at 1/100 normally or 1/10 for exact `Mr. Howe` | This is a strong earned surprise if it fits inside the result beat. It becomes pacing and determinism debt if it extends turns, consumes event RNG, relies on online geography, or makes the whole stylized object photorealistic. |
| Stats | Rich device-local/session filters and records for results, timing, events, streaks, objects, players, teams, and performance | 16-player/Battle schema expansion | Stats is a deep analysis destination, not a quick “tonight” story. It does not currently turn a finished match into positive shared bragging rights. |
| Spectators | Waiting players can watch; the pass gate names the next player | Team Battle will show active and queued representatives | Eliminated players and off-rotation teammates have no bounded, non-disruptive participation. Any solution must avoid stealing active touch pointers or changing physics. |
| Privacy/offline | Full-fidelity data stays local; Test Data is segregated; reduced motion and mute exist | Online removal and public telemetry gate | This is a strength to preserve. A remote retention/analytics system is neither needed nor approved. |

Two contract conflicts should be closed before implementation is judged:

- `docs/v112-plan.md` and the player-scaling audit cap Short Cup at 12 and Full
  Cup at 8, while the Q02 table in `docs/v112-qa-plan.md` currently lists both
  Cup lengths through 16. The lower duration-aware caps are the party-friendly
  choice unless the owner explicitly changes them after timing tests.
- The working plan calls Battle a prototype gate that may or may not ship, while
  the QA plan calls Battle required in v1.12. Ship/no-ship authority must be
  explicit. The product scope itself—1v1, 2v2, 1v1v1v1, and rotating two-team
  play with at most four active objects—is otherwise aligned with the owner’s
  latest direction.
- The QA plan still enumerates 10 arenas and 50 cosmetics. The new catalog is
  22 arenas: the 10 inherited arena entries plus 12 feat-awarded entries outside
  the 1–100 ladder. Freeze whether totals are expressed as 40 personal ladder
  cosmetics + 10 inherited ladder arenas + 12 feat arenas (62 cosmetic entries,
  22 of arena type), then update every manifest, migration, owner-test, Stats,
  achievement, save, screenshot, and performance expectation together.

The new arena/globe scope should follow dependency order rather than being
painted in bulk:

1. Freeze stable IDs, ownership/migration semantics, exact hidden-feat
   eligibility, simultaneous-reward ordering, and the always-available fallback
   arena. Define whether Short/Full Cup and each Battle format count separately
   toward the five-format feat so an unlock cannot depend on deferred content.
2. Replace the Customize arena tab with a durable pre-match route/state contract:
   customization → Arena Select → ready beat → match; Back preserves drafts;
   Same Arena bypasses reselection on rematch; New Arena returns directly to it.
3. Approve three representative calibration stages before producing all 12:
   one familiar layered location (School Cafeteria), one atmosphere-heavy scene
   (Aquarium Tunnel or Mars Outpost), and one four-lane stress scene (Stadium at
   Night). Prove readability, tone, reduced motion, and cache/frame budgets.
4. Implement and test hidden feat awards/reveals against legitimate local play,
   Test Data/AI-only exclusions, save migration, and multiple rewards from one
   result. Only then scale the remaining arena art and reactive details.
5. Build the Desk Globe sphere and its deterministic camera beat behind an
   isolated cosmetic RNG/state interface. It must not share event RNG or delay
   the input/physics/progression critical path.

## Now — highest-value v1.12 work

### 1. Restore competitive trust before adding retention features

Fix CPU and Alien balance as release blockers, not polish.

- Keep the frozen ordinary CPU targets: Easy 30–40%, Medium 45–55%, Hard
  60–70%, with ordered, rarer cap rates.
- Apply difficulty only through visible, physically plausible launch inputs.
  Do not change human tolerances, force verdicts, adapt secretly, cap CPU
  streaks, or grant hidden mercy.
- Hold native Alien and Alien Invasion within ±10 percentage points of the
  matched Classic human corpus at each viewport, with no more than a ten-point
  Alien spread from phone through 4K.
- Preserve Alien’s identity: at least one visible UFO bank followed by tractor
  ring entry. Comparable success rate does not mean identical physics.
- Finish pointer-type/cross-device input parity so the same intended gesture is
  not punished on phones or hybrid smartboards.

Why now: party players accept losing to skill and visible chaos; they do not
accept an opponent that almost never misses or a character whose difficulty is
secretly different.

### 2. Freeze and prototype the four-player Battle core

Battle should be the flagship shared-screen mode, with **four simultaneous
objects as an absolute ceiling** even if hardware reports more contacts.

- **Duel:** 1v1, two independent scores and two active lanes.
- **Doubles:** 2v2, four active lanes and one shared score/charge per team.
- **Four-Way:** 1v1v1v1, four independent scores/meters and explicit targets.
- **Team Battle:** 3v3 through 8v8, two teams, at most two representatives per
  team, rotating only after every active representative’s one-attempt volley
  resolves. A two-contact board uses one representative per team.
- Use a lane-local Ready state and one shared 3-2-1 start. After GO, Duel,
  Doubles, and FFA lanes may re-arm independently after their own result;
  rotating Team Battle waits for the final lane in the volley before changing
  representatives. This resolves the current plan’s tension between continuous
  re-fire and fair pair rotation.
- Prove a skill-only ruleset first. Then enable a small, named “Party Powers”
  ruleset using only curated, obvious, fallible adapters. Keep skill-only Battle
  selectable. Life Drain stays excluded; Plinko/Roulette stay between heats.
- Test 30-, 45-, and 60-second heat prototypes and freeze one after owner/group
  playtesting. Do not choose duration from implementation convenience.
- Keep lanes physically isolated in v1.12. Shared collisions are a different
  game and should not be bundled into the first Battle release.

### 3. Create a fast path from launch to fun and back to rematch

Do this mostly by packaging existing rules, not adding another complex mode.

- Make a visually dominant **Quick Match** preset for a new party: Classic,
  three lives, Standard Feel, Normal events, and the current roster. Keep every
  advanced control available under Match Options.
- Remember the last valid roster and expose a one-action “Play again” path.
  Replace ambiguous “Same Setup” copy with `Rematch`, plus a concise sublabel
  that names the next opener and any team rotation.
- For Classic, show the opener consequence before the rematch begins. Prototype
  automatic rotation against the current winner-starts-next behavior; freeze
  the fair rule with owner approval rather than silently advantaging either.
- Keep exactly one Ready action between human turns. Let experienced groups
  shorten a completed result beat after its essential announcement, while
  reduced-motion/screen-reader users still receive the complete result.
- Move 20/100 lives and otherwise long roster/life combinations behind clear
  `Long match` treatment. Never remove them or use a fake countdown.
- Unlock/achievement presentation must never disable the Rematch action.
  Persist immediately, show a compact earned notice, and allow the full reveal
  after the group chooses to view it.

### 4. Make Arena Select feel like anticipation, not setup tax

The dedicated full-screen Arena Select is required immediately before play. It
should be one vivid decision and one confirmation, not a second settings page.

- Present one large animated preview and a lazy/static grid of available tiles;
  do not animate 22 previews at once. The selection is global for the match.
- Include all 10 inherited arenas plus these 12 new locations: School Cafeteria,
  Sports Locker Room, Mars Outpost, Grand Library, Island Beach, Pirate Ship
  Deck, Aquarium Tunnel, Skate Park at Sunset, Rainforest Treehouse, Haunted
  Hall, Stadium at Night, and Movie Soundstage.
- Preselect the last valid unlocked arena, or an approved default on first run,
  so a player can confirm immediately. `Random Unlocked` is explicit and never
  chooses locked or format-incompatible content.
- Keep locked tiles fully mysterious (`🔒`, accessible `Locked`); do not reveal
  their names, scenery, silhouettes, feat, or progress before discovery.
- Make stage reactions cosmetic and bounded. They may answer an impact/result,
  but never alter gravity, collision, visibility, input, score, RNG, or timing.
- Keep visual Arena Select distinct in name and presentation from Cup’s Arena
  Draft physics modifier. Both selections must remain legible when active.
- Rematch offers `Same Arena` as the fast primary path and `New Arena` as the
  direct return to Arena Select. Cup retains its visual arena across its series;
  Battle lists only stages with qualified two-/four-lane compositions.
- Hidden feat awards live outside the fixed win ladder. Preserve already owned
  inherited arenas on migration, award each feat once, queue simultaneous
  rewards deterministically, and reveal only newly earned arenas. No feat is
  based solely on random-event occurrence, date/login, spending, or online play.

### 5. Teach by play, then get out of the way

- On first launch, offer a skippable 15–20 second guided Practice flip using
  the real input and meter. Finish with a direct `Start a match` action.
- Add an always-available How to Play surface with one visual card per format:
  objective, players active at once, score, approximate duration once measured,
  and the one unusual rule that matters.
- Teach stake, ON FIRE, cap lands, and the first rare event contextually only
  when first relevant. Store “seen” locally and provide `Replay tips`.
- Make Battle’s contact calibration do double duty as onboarding: each required
  player holds a marked lane, the screen confirms only contacts observed in
  that run, and unsupported formats explain the exact two-lane/sequential
  fallback before setup continues.
- Do not require players to customize, create profiles, or read every rule
  before their first flip.

### 6. Turn results into a shared story

Keep the existing winner, scoreboard, match stats, and fair rematch proposals,
then add a concise, positive recap generated from facts already recorded.

- Show at most three `Match Moments`: for example Clutch Save, Longest Run,
  Cap Master, Comeback, Event Magnet, or Every Teammate Scored.
- Use transparent eligibility and minimum samples; show ties rather than making
  an arbitrary player “best.” Never create Worst Player, Biggest Choke, or
  other humiliation awards.
- In team modes, include at least one individual contribution when one exists
  so a shared team win does not erase the flippers who produced it.
- In Battle, show heat markers, final score, each player’s contribution, and the
  next matchup/representatives without forcing entry into the full Stats Lab.
- Surface the existing Hall of Fame inside Stats or a session recap; do not
  leave the renderer and data orphaned behind a missing page element.

### 7. Finish the feedback hierarchy and progression repair

- Complete the existing ON FIRE restoration and event audit. Feedback priority
  should be: terminal/heat win, cap or extraordinary save, event result, ordinary
  make/miss, then ambient effects.
- Define a Battle mix: lane-local launch/impact cues may overlap, but one global
  verdict/win sting owns the foreground at a time. Do not play four full make
  melodies simultaneously. Spatial cues may help but never carry meaning alone.
- Keep near-miss copy factual and rare. Never exaggerate a miss as “almost” to
  provoke another attempt.
- Fix live progression state, clean reveal canvases, and all cosmetic notices.
  The existing deterministic collection and 100 achievements are enough for
  v1.12; adding more goals before these work reliably would dilute them.

### 8. Keep the Desk Globe Easter egg delightful and cheap

- Only the literal Urth sphere becomes realistic 3D. The stand, meridian, base,
  and surrounding object art stay in the approved Flipgame style.
- Show recognizable offline geography, curvature, atmosphere, directional
  light, limb shading, ocean response, and a true continuous 360° rotation. No
  map API, tile request, tracking, or network fallback is permitted.
- On a successful physical Desk Globe landing only, roll the cosmetic showcase
  at exactly 1/100 normally and 1/10 for the exact case-sensitive active name
  `Mr. Howe`. Misses and automatic outcomes are ineligible. This additional
  roll does not replace or modify the name's existing 10× event-weight behavior.
- Domain-separate the roll from event, trajectory, result, and progression RNG.
  The selected point must be safely inside the *currently visible* hemisphere
  and deterministic for the same eligible replay state.
- Fit the camera push/return inside the existing result window so it never adds
  turn or rematch delay. Let the ordinary result remain readable over it.
  Reduced motion uses a stationary magnified inset/crossfade; Physics Lab can
  force it as Test Data.

## Next — after the core proves fun and fair

### Session hub, not an account system

Add an explicit local `New party session` and a fast session board showing
matches played, wins by named local player, make rate with attempts, cap lands,
best run, and team contributions. Use the existing local Stats foundation. A
session is a convenience boundary, not a login, streak, or expiring challenge.

### Bounded spectator participation

Give queued teammates and eliminated players cosmetic-only participation
between volleys/results: one throttled cheer/reaction per beat, a visible next-
pair Ready control, and a way to inspect the session board. Reaction touches are
disabled inside active launch zones and never alter charge, physics, camera,
RNG, or score. Provide a host toggle to turn reactions off.

### Faster party setup

Add one-tap balanced teams, a clear manual side toggle, saved local roster
presets, and `Surprise me` for already-owned objects/cosmetics. Randomization
must never reveal locked content or change competitive physics. The mode card
should immediately show whether the current count is valid.

### Opt-in sets and rivalries

For groups that rematch, offer an explicit first-to-two/first-to-three set with
automatic opener rotation and a final set champion. Cup and Battle already own
their heat structure; do not nest another series inside them. The ordinary
single-match path stays primary.

### Audio identity

After four-lane mixing is safe, test a restrained original/offline menu and
Battle-bed loop with separate Music and SFX controls. It must never autoplay
before consent, mask classroom conversation, or replace visible cues.

## Later — useful experiments, not v1.12 blockers

- A rotation/tournament wrapper for 5–16 people that guarantees participation
  rather than using an exclusionary winner-stays-on queue.
- Deterministic, local highlight replays built from existing seeds and state,
  only if every event can replay accurately without storing video.
- An explicit exportable match card with names off by default, after a separate
  school/minor privacy review. No automatic sharing.
- Additional Battle arenas or cross-lane interactions only after isolated-lane
  balance, clarity, performance, and rematch metrics are healthy. Treat shared
  collisions as a separately named experimental ruleset.
- Locally generated, non-expiring session challenges drawn from existing
  achievements, only if tests show they broaden play instead of creating chores.

## Do not build

- More than four simultaneous flippables, including on hardware that reports
  five or more touches. Larger teams rotate through the same four-player stage.
- Daily login streaks, streak loss, energy/tickets, cooldowns, push-notification
  pressure, timed exclusives, fake scarcity, or “come back now” rewards.
- Loot boxes, paid power, ads between rematches, casino presentation, spinning
  reward wheels used as monetization, or variable-ratio unlock progression.
- Hidden rubber-banding, adaptive CPU aim, outcome overrides, leader targeting,
  post-contact sabotage, fake near misses, or secretly different human physics.
- Public leaderboards, accounts, remote analytics, cloud saves, or online play
  in v1.12. Do not repurpose full-fidelity local Stats as upload telemetry.
- Camera, microphone, face, voice, precise location, or raw-gesture collection.
- Mandatory tutorials, mandatory reward-opening sequences, or auto-rematch
  countdowns. A group must always be able to stop or continue deliberately.
- A Battle adapter for all thirty events. Include only events proven readable,
  symmetric/target-fair, performant, and mechanically fallible in multiple lanes.
- Physical bonuses hidden inside visual arenas, locked-stage hints/silhouettes,
  a random arena that can choose locked/incompatible content, or a full-screen
  selector that downloads/animates all 22 stages at once.
- Online maps/tiles for Desk Globe, photorealism applied to its stand or other
  objects, a showcase roll shared with event RNG, a camera point behind/on the
  limb of the visible globe, or a globe beat that extends the result timer.
- Negative player awards or social mechanics designed to embarrass the loser.
- Childish toy/bubble styling or neon casino noise. Humor should come from
  physical objects, reactions, and outcomes inside the approved mature tabletop-
  sport/broadcast direction.

## Acceptance tests

These product tests supplement the deterministic QA matrix; they do not replace
physics, accessibility, migration, or release qualification.

| Goal | Acceptance |
|---|---|
| First-session comprehension | In at least five fresh-group tests, four groups can choose the intended format, identify who is active, and complete a valid first human flip without facilitator explanation. Median time from finished name entry to first flip is at most 45 seconds; the guided Practice offer is always skippable. |
| Arena Select flow | Every non-rematch start follows customization → full-screen Arena Select → ready beat → play. Back preserves every roster/customization field. An already selected valid arena can be confirmed with one action; Same Arena rematch does not reopen selection, while New Arena opens it directly. Visual Arena and Cup Arena Draft are named separately. |
| Arena catalog and secrecy | Exactly 22 stable arenas resolve: all 10 inherited plus all 12 named v1.12 stages. Each new hidden feat has one positive and nearest-negative test, awards once in legitimate local play, survives save/export/import, and remains outside wins 1–100. Locked tiles expose only `Locked`; Owner Test exposes all without earning. Multiple same-result rewards persist before their deterministic, deferable reveals. |
| Arena rendering | One selected preview may animate; offscreen/grid previews are bounded and lazy. Each stage passes landing-plane/HUD contrast, reduced motion, cosmetic-only state hashes, cleanup, 360×740 through 4K screenshots, and Battle two-/four-lane qualification where eligible. Heaviest arena plus heaviest allowed effect holds the release FPS/memory gates. |
| Quick-match length | Across representative four-human local sessions, the three-life Quick Match targets a 4–8 minute median and a 10-minute 90th percentile. If it misses, retune presentation/preset packaging before changing core physics. |
| Rematch loop | From result visibility, one activation starts the same-format rematch/next heat; the ready state appears within five seconds on target hardware, all roster/customization fields survive, and the next opener/representatives are named before play. Awards never block it. |
| Sequential downtime | After the first rotation, median resolved-result-to-next-gesture time is at most three seconds for an attentive smartboard group. There is no second handoff confirmation and no non-terminal unskippable presentation longer than 1.5 seconds. |
| Result readability | Four of five blind-test groups can name the winner/team, final score, and why the featured Match Moment was selected within five seconds. Color and audio are not required to answer. |
| Battle scope | Exact positive cases are 1v1, 2v2, 1v1v1v1, and equal 3v3–8v8 Team Battle. Invalid/unequal shapes fail before play. No state or render path can activate a fifth object. |
| Battle capability | Four-lane play unlocks only after four concurrent contacts are observed; two contacts retain Duel/two-lane relay; zero/one/three contacts never imply four. Cancellation, crossed drags, and lost capture affect only the owned lane and never strand a heat. |
| Battle fairness | Mirrored fixed inputs across lane, side, direction, pointer order, and 0/1/8/16/33 ms launch offsets produce equivalent outcome distributions and deterministic ownership. Team exposure differs by at most one attempt until all members cycle. FFA sabotage always displays and affects the confirmed target. |
| Battle pacing | Prototype 30/45/60-second heats with real groups. Freeze a duration only when a best-of-three match normally completes in 3–6 minutes, players can read all four lanes, and waiting representatives can predict when they enter. |
| CPU credibility | At least 10,000 frozen seeds per difficulty/direction/viewport/player-count class meet Easy 30–40%, Medium 45–55%, Hard 60–70%; ordered cap rates are smaller, and no supported cell reaches perfect play. Human physics hashes are identical across CPU settings. |
| Alien credibility | At every supported viewport, native Alien and Alien Invasion are each within ±10 points of matched Classic human make rate; Alien’s viewport spread is at most ten points; every make contains a rendered UFO bank then ring entry. CPU tiers meet the ordinary bands. |
| Feedback clarity | For ON FIRE and every Battle-enabled event, four of five first-view testers identify whether the effect is helpful, harmful, or symmetric and identify the final result. Reduced motion conveys the same state. The four-lane mix has no clipping/cacophony and only one foreground victory sting. |
| Positive recap | Every displayed Match Moment can be reproduced from the stored match/flip facts, handles ties, meets its minimum sample, and never labels a player negatively. Team recaps preserve individual attribution. |
| Progression flow | Wins 1–100 and the 12 separate feat arenas keep persisted, announced, and selectable rewards synchronized without changing ladder positions. Compact notices do not steal focus from Rematch; full reveals are optional and survive defer/reload. Locked content remains secret. |
| Desk Globe art | Only the Urth sphere uses realistic 3D treatment; its styled stand/base and competitive collider remain unchanged. A deterministic rotation corpus exposes every longitude, geography remains recognizable at picker/gameplay sizes, and the sphere requires no network resource. |
| Desk Globe showcase | Eligibility is successful physical Desk Globe makes only. Boundary tests prove 1/100 normal and 1/10 exact-case `Mr. Howe`; a predeclared million-seed corpus lies inside the 99% binomial interval and replays identically. Every chosen point is safely inside the then-visible hemisphere. Event/trajectory/result/progression RNG and stats hashes are unchanged, the beat fits within the result timer, and reduced motion uses the stationary inset. |
| Spectator safety | If reactions ship, touches in reaction regions cannot claim/cancel a launch pointer, reactions are throttled and muteable, and disabling them changes no seed, trajectory, result, charge, or score. |
| Accessibility/performance/privacy | All new actions are keyboard reachable and at least 48 px on smartboard; screen-reader announcements serialize simultaneous results; reduced motion preserves rules; four-lane worst case holds the existing 45 FPS smartboard gate; all engagement data remains local and deletable. |

## Local instrumentation ideas

The current Stats store already captures most gameplay facts: mode, player,
team, object/variant/cosmetic/arena/event, result, input power/direction,
rotations/contacts, flight/contact/settle times, lives, stake, streak/ON FIRE,
match duration, participants, and performance buckets. Reuse it without letting
instrumentation consume RNG or block play.

Add a small local-only interaction ledger for the gaps Stats cannot answer:

- `party_session_started`, `setup_opened`, `mode_selected`, `match_started`,
  `first_human_flip`, `match_completed`, `match_abandoned`, `result_shown`, and
  `rematch_selected`.
- `turn_announced`, `turn_ready`, and `gesture_started` to measure result dwell,
  pass-gate dwell, per-player wait, and active-play ratio.
- `tip_offered`, `tip_skipped`, `tip_completed`, `help_opened`, and
  `practice_to_match` to test onboarding without forcing it.
- `arena_select_opened`, source (`new-match`/`new-arena-rematch`), unlocked-count
  bucket, `arena_selected`, `random_unlocked_used`, Back, confirmation, and
  ready-beat completion. Record stable arena ID only after discovery; never put
  a locked arena name/feat into player-visible or general diagnostic output.
- Hidden-feat evaluation/award with stable internal feat ID, eligibility reason,
  Test Data status, idempotence outcome, and reveal deferred/viewed. Keep this
  local and bounded; never store a speculative progress percentage.
- `battle_calibration_started/completed`, observed concurrent-contact count,
  selected fallback, `lane_ready`, `heat_started/completed`, representative
  rotation, target confirmation, and power activation/cleanup. Store capability
  buckets, not a hardware fingerprint.
- `match_moment_shown` with its transparent category and eligibility facts,
  plus `session_board_opened` and bounded spectator-reaction counts if built.
- Mute/reduced-motion changes, pointer cancellation, unresolved-settle recovery,
  slow-frame bucket, and unexpected exit as experience guardrails.
- Desk Globe eligible-make count, cosmetic roll bucket, showcase shown/forced,
  duration bucket, reduced-motion path, and camera-validity result. Do not store
  precise geographic coordinates; a coarse visible-region test bucket is enough.

Derive these decision metrics locally:

- time to first fun: setup/name completion → first valid human flip;
- active-play ratio and p50/p90 wait between a player’s opportunities;
- match duration by format/roster/lives and abandonment point;
- result → rematch conversion and consecutive matches with the same roster;
- Arena Select dwell/back-out rate, direct-confirm rate, Same Arena versus New
  Arena rematch choice, and per-arena frame/memory guardrails;
- first-five-flip human make rate, Practice completion, and Practice → match;
- CPU make/cap rates and matched Classic/Alien parity cells;
- Battle side/lane win delta, launch-offset distribution, relay exposure, and
  calibration fallback frequency;
- event clarity proxy (Help opened immediately after an event), event miss path,
  and cleanup failures;
- observed Desk Globe showcase rate by normal/exact-name Test Data cohort and
  whether it added any time beyond the ordinary result window;
- share of matches producing a valid positive recap without repeating the same
  player/category every time.

For owner/group studies, export only a deliberately initiated Test Data bundle
with build/config ID and bucketed timings. Never include display names, free
text, exact raw pointer traces, stable cross-device identifiers, or anything
remotely transmitted. Prototype comparisons such as 30/45/60-second Battle
heats should be explicit playtest configurations, not hidden behavioral A/B
experiments.

## Priority conclusion

Flipgame does not need a larger achievement catalog or a manipulative retention
layer. Its strongest route to repeat play is: make CPU/Alien/input trustworthy,
prove the four-player Battle formats, shorten the setup/result/rematch loop,
teach the first flip in seconds, and turn each match into a fair shared story.
Arena Select and the 22-stage collection can strengthen anticipation and
discovery only if their manifest/migration/reveal foundations land before the
art scale-up and the mandatory screen still meets time-to-fun. The Desk Globe
showcase is a good rare delight only when isolated from gameplay RNG and folded
inside existing result time. Session boards, spectator reactions, and broader
meta systems should follow only after local evidence shows that groups are
already choosing “Rematch.”
