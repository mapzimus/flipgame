# Flipgame v1.12 party-game research

> Research reference only. Product and implementation decisions are frozen in
> `docs/v112-contract.md`.

## Decision headline

Keep **four simultaneous players as the Battle ceiling**, with four clear formats:

- **Duel:** 1v1, two active lanes.
- **Doubles:** 2v2, four active lanes and a shared team result.
- **Four-Way:** 1v1v1v1, four independent scores.
- **Team Relay:** larger rosters, but no more than four active players; rotate representatives on an equal-attempt schedule.

The four-player limit is a sound product hypothesis for reach, screen readability, touch isolation, and performance. It is **not** a research-proven universal maximum. It must be validated on the actual smartboard with the intended high-school and adult groups. Keep roster size separate from simultaneous lane count so larger groups can still play.

The strongest evidence does not support making the game “addictive” through more rewards. It supports making it **voluntarily replayable** through mastery, autonomy, relatedness, close-but-earned outcomes, short readable rounds, and memorable reactions from the room. Battle should therefore deepen the one-flick physics rather than cover it with progression systems.

## What the evidence supports

The labels below separate research findings from their application. “Evidence” summarizes the source; “Flipgame implication” is a design inference unless the source tested that exact feature.

### 1. Competence, autonomy, and relatedness are stronger foundations than compulsion

**Evidence.** Across four studies, perceived competence and autonomy were associated with enjoyment, preference, and wellbeing; in the multiplayer study, competence, autonomy, and relatedness independently predicted enjoyment and intended future play. Intuitive controls were also related to competence and autonomy. This establishes motivational correlates, not a guaranteed recipe for commercial success. [Ryan, Rigby, and Przybylski (2006)](https://selfdeterminationtheory.org/SDT/documents/2006_RyanRigbyPrzybylski_MandE.pdf)

**Flipgame implication.** Preserve a consistent gesture-to-physics relationship that players can learn. Give players quick choices over format, lane identity, object, and optional rules. Make Doubles and Team Relay create real teammate communication. Do not use daily streaks, forced notifications, energy timers, FOMO, loot boxes, or pay-to-win as substitutes for a satisfying match.

### 2. Suspenseful close contests can be more enjoyable than easy dominance

**Evidence.** In two studies, greater score parity in a competitive game increased enjoyment through suspense; participants later chose games they had rated as more suspenseful even when those games produced less perceived competence. This supports meaningful outcome uncertainty, not hidden score correction. [Abuhamdeh, Csikszentmihalyi, and Jalal (2015)](https://scholar.usuhs.edu/en/publications/enjoying-the-possibility-of-defeat-outcome-uncertainty-suspense-a/)

**Flipgame implication.** Preserve the possibility of a late comeback through bounded scoring, equal opportunities, and a fair tie-break. Never secretly alter a landing, steal points, or guarantee a comeback. A match that is mathematically decided should end or advance instead of making players complete dead time.

### 3. Balancing works best when victory still feels earned and players retain control

**Evidence.** A CHI 2024 mixed-method study had eight pairs experience seven balancing mechanics. Participants generally favored skill-dependent assistance, temporary opportunities that still required execution, and control over activation. Forced control changes and effects detached from performance threatened agency and the sense of a merited victory. The small two-player racing study limits generalization. [Gonçalves et al. (2024)](https://techandpeople.github.io/downloads/2024_chi_balancing.pdf)

**Flipgame implication.** If an assist is needed, make it an explicit **Party Assist** chosen before a match or between heats—for example, a visible trajectory guide or broader timing guidance that still requires the player to flip. Do not silently rubber-band physics, punish the leader, or award an automatic make. Keep every power player-triggered, telegraphed, temporary, and avoidable or playable around.

### 4. More visual “juice” is not automatically more motivating

**Evidence.** A preregistered experiment with 1,699 participants found curiosity to be the strongest enjoyment predictor and the only voluntary-playtime predictor in its model. Success-dependent feedback supported competence; simply amplifying feedback unexpectedly reduced competence and effectance, plausibly because it obscured action-to-outcome causality. The result concerns a purpose-built action RPG, not party games specifically. [Kao et al. (2024)](https://people.csail.mit.edu/dkao/pdf/3613904.3642656.pdf)

**Flipgame implication.** Give launch, contact, settling, upright, cap, miss, and power activation distinct readable feedback. Reserve the largest sound, motion, and celebration for an earned result or decisive moment. Do not fire confetti, shake the board, and stack loud effects on every touch. Variation should reveal learnable interactions between object, force, spin, and modifier—not replace them with arbitrary outcomes.

### 5. Genuine team play needs interdependence without taking away individual control

**Evidence.** A co-located multiplayer experiment found that greater player interdependence produced more communication and less frustration, while shared control reduced perceived competence and autonomy. [Emmerich and Masuch (2017)](https://doi.org/10.1145/3116595.3116606)

**Practitioner evidence.** *Overcooked* co-creator Phil Duncan describes building cooperation around simple equal controls, more work than one player can cover, disruptions that require adaptation, and repeated playtests. The team replaced a constant-failure/lives model with positive timed scoring, which their tests found more fun and better for coordination. They also replaced text-heavy status with icons and guardrails against trivial errors. This is a developer account, not a controlled comparison that transfers automatically to Flipgame. [Ghost Town Games design deep dive](https://www.gamedeveloper.com/design/game-design-deep-dive-building-truly-cooperative-play-in-i-overcooked-i-)

**Flipgame implication.** In Doubles, each person must own a lane, object, gesture, and attempt, while the team shares the score and one bounded charge meter. Prototype a small **Sync** reward when both teammates make a valid landing in the same volley, preferably shared charge rather than a large score bonus. The scoring choice—one player aiming for a reliable upright while the other risks a cap—then becomes a conversation, not a hard-coded role. Never give teammates unequal physics stats.

### 6. Co-located audiences are part of the experience

**Evidence.** An exploratory CHI PLAY study using a two-player co-located gesture game found that active positive and negative audience responses increased player engagement, while a silent audience felt unnerving and less engaging. Its small, demographically narrow sample and staged audience conditions mean it should guide prototypes, not justify artificial crowd manipulation. [Kappen et al. (2014)](https://hcigames.com/content/files/2024/08/Engaged-by-Boos-and-Cheers-The-Effect-of-Co-Located-Game-Audiences-on-Social-Player-Experience.pdf)

**Practitioner evidence.** Nintendo’s *Wii Party* developers emphasized immediate accessibility, occasional novice wins, fairness across abilities, and play that is enjoyable to watch. *WarioWare: Smooth Moves* developers designed instructions players could understand within about five seconds and expected other people in the room to watch the performance. [Wii Party interview](https://iwataasks.nintendo.com/interviews/wii/wiiparty/0/0/) and [WarioWare interview](https://iwataasks.nintendo.com/interviews/wii/warioware_smooth_moves/0/1/)

**Flipgame implication.** A person standing back should instantly know who is playing, the score, the current modifier, and why a flip earned 0, 1, or 2. Use large lane names, color-plus-pattern identity, team grouping, heat pips, and a brief result hold. Prototype a very short “photo finish” recap only for a deciding or near-simultaneous landing; it must never obscure a still-live lane. Let the room create the cheering rather than adding a fake hostile audience.

### 7. Successful compact games protect a simple core and put depth in combinations

**Practitioner evidence.** In Apple’s interview about award-winning *MARVEL SNAP*, Ben Brode describes a simple surface—one card type, three locations, six turns, matches lasting minutes—with depth coming from combinations of rules, randomness, and skill. A loss should leave the player able to identify a different choice. This is a successful design precedent, not evidence that its monetization or wager-like “Snap” mechanic should be copied. [Apple Behind the Design](https://developer.apple.com/news/?id=sosm2p7q)

**Practitioner evidence.** Jackbox directors describe pruning features around whole-session pacing, rapidly testing whether a premise produces clear and funny social moments, and retaining both a shared objective and personal points in *Dodo Re Mi*. [Jackbox Party Pack 10 interview](https://www.jackboxgames.com/blog/behind-the-scenes-of-pp10-directing)

**Flipgame implication.** Keep one control grammar—drag/flick/release—and create depth through object physics, risk between upright and cap, shared modifiers, and one tactical power choice. After a miss, show an actionable cause such as excess spin or insufficient height rather than only “MISS.” Make rematch and format swap one tap; the game should earn another round through a clear “I can do better” thought.

### 8. Competition and reward systems do not work equally for everyone

**Evidence.** In an exergame experiment, competition improved intrinsic motivation and mood for more competitive participants but harmed the experience for less competitive participants. The exercise setting limits transfer, but it cautions against making high-pressure competition the only route. [Song et al. (2013)](https://www.sciencedirect.com/science/article/pii/S0747563213000459)

**Evidence.** In another experiment, points, levels, and leaderboards increased task quantity but did not significantly improve competence or intrinsic motivation. The task was image annotation, not entertainment play, so the result is a warning against assuming that metagame elements create fun. [Mekler et al. (2017)](https://research.aalto.fi/en/publications/towards-understanding-the-effects-of-individual-gamification-elem/)

**Flipgame implication.** Keep Duel and Four-Way for highly competitive groups, Doubles and Team Relay for socially cooperative groups, and the existing turn-based experience for people who prefer lower pressure or whose hardware cannot support simultaneous play. Cosmetics, achievements, and records can recognize play, but they should not carry stat advantages, expiring tasks, grind, or shame for coming fourth.

## Recommended Battle shape

Everything in this section is an **inference to prototype**, not an established finding.

### Entry and onboarding

- Lead with social intent rather than technical mode names: **Face Off** (1v1), **Team Up** (2v2), **Everyone** (1v1v1v1), and **Big Teams** (rotating relay). The results screen can swap formats without returning through setup.
- Before the first scored attempt, loop one silent animation showing finger path, release, and the 0/1/2 scoring icons. Require one unscored practice flip in every active lane; this doubles as a real simultaneous-touch check.
- Give each player a large name, color-plus-pattern, and selected object. Cosmetic choices must not change collision, stability, power, cooldown, or score potential.

### Fair, readable round cadence

The current continuous “flip again when your object settles” proposal risks rewarding short settling time, object-specific resolution speed, frantic input, or more attempts rather than better flipping. It may also make four simultaneous outcomes difficult for players and spectators to parse.

Test these two versions before freezing Battle rules:

1. **Synchronized volleys — recommended first prototype.** A common cue opens one short attempt window; every active player gets one attempt; all results resolve; the board holds the outcome briefly; then the next volley begins. Team representatives rotate only after a completed volley or fixed equal number of volleys.
2. **Timed rush.** Players may act continuously, but launches occur in fixed shared slots or with an equal cooldown that begins at launch, not at physical settle. The score report must include attempts so unequal opportunities are visible.

Use positive scoring (upright 1, cap 2, miss 0), a short best-of-three session, and a one-tap rematch. A tie-break should grant one equal attempt to each tied player or team per sudden-death volley. Exact heat length, number of volleys, result-hold duration, and mercy rule require playtesting; no source establishes the right values for Flipgame.

### Powers and events

- Start the competitive default as **Sport** rules: self-powers and symmetric, pre-telegraphed table modifiers. Offer targetable sabotage only in an explicit **Mayhem** rules toggle.
- Targeted powers are structurally clean in Duel and team-vs-team play. In Four-Way they enable pile-ons and kingmaking even if the target is explicit; the default Four-Way playlist should therefore avoid them.
- A valid-landing-only charge meter creates potential positive feedback: the player already scoring also earns more power. First test equal charge per completed attempt, with one stored power maximum. If skill contributes bonus charge, measure whether it causes runaway leads.
- A power should create a temporary physical problem or opportunity that still has to be played. It must never write a score, force a miss, choose a hidden target, or override a resolved landing.
- Announce a shared event before the next volley, apply the same rule to every affected lane, and keep its action-outcome relationship learnable. Randomness should pose a new decision, not decide the winner.

### Team-specific social design

- Doubles shares score and charge but preserves one gesture/object/lane per person.
- Prototype one bounded Sync benefit for two valid teammate landings in a volley. Shared charge is safer to test than a large score multiplier because it rewards coordination without sharply widening the lead.
- Let teammates choose the next shared power between volleys. Do not interrupt live flips with menus.
- Team Relay can support larger rosters while preserving the four-player physical ceiling. Show **Now flipping** and **Up next**, rotate on equal attempts, and prevent the fastest or loudest teammate from taking extra turns.

### Spectator and result design

- From across the room, expose only the match essentials: lane/player identity, score, heat state, current event, and stored power. Defer records and detailed statistics to the result screen.
- Give every landing a short, causal sequence: contact, settle, ruling, score change. Use the largest celebration only for caps, lead changes, tied final volleys, and match wins.
- Show one earned, non-shaming post-heat highlight per player where data supports it, such as “cleanest landing,” “cap made,” or “closest comeback.” Treat this as a prototype; no reviewed source tests these labels.
- Non-active teammates and spectators should not touch the same board during a live volley. Their role is to watch, coach, and react; extra audience controls would compete with lane input and screen space.

## Ethical engagement guardrails

“Successful” should mean players choose another fair round and leave satisfied, not that the game obstructs stopping.

- No daily streak, expiring reward, loss aversion prompt, energy system, loot box, random paid reward, pay-to-win object, or hidden engagement manipulation.
- No artificial wait before a rematch and no nagging when a group chooses to stop.
- No disguised bots or fabricated social activity.
- No permanent reward that changes competitive physics. Cosmetic identity and locally stored records are sufficient.
- Do not optimize total minutes alone. A confusing setup or hard-to-exit loop can increase time without increasing enjoyment.

## Prototype plan and success measures

Run staged tests with the actual display and mixed-skill members of the intended high-school/adult audience. Follow the project’s consent and privacy process; do not record minors or identifiable video without the required permission.

Test one variable at a time:

1. Synchronized volleys versus equal-cooldown timed rush.
2. Sport powers versus opt-in Mayhem targeting.
3. Shared team score/charge alone versus a small Sync charge reward.
4. Party Assist off versus visible, player-chosen guidance.
5. Candidate heat lengths or first-to-score rules only after the cadence is understandable.

Measure:

- time from mode selection to every player’s first valid flip;
- missed, duplicate, cancelled, and cross-lane contacts;
- attempt parity, score margin, lead changes, and how often the outcome stays live;
- voluntary rematch and voluntary format-swap rates, with a clearly available exit;
- perceived fairness, control/autonomy, competence, and teammate connection;
- observed team talk, laughter/cheers, and periods when a player is disengaged;
- whether a new spectator can identify the leader, explain 0/1/2 scoring, and name the winner;
- abandoned heats, setup corrections, and time between matches;
- frame rate and touch reliability at two and four simultaneous players.

Use current Flipgame as the baseline. Ship a change only when it improves replay intent and social energy **without reducing fairness, input clarity, or ability to stop**. Voluntary rematch is a better primary behavioral signal than raw session duration, but it should be interpreted together with the experience measures rather than treated as proof by itself.

## Claims this research does not establish

- Four players is not a scientifically established smartboard maximum; it is a constraint to validate on target hardware and in the room.
- No source establishes Flipgame’s ideal heat duration, score target, number of volleys, power frequency, or comeback strength.
- A Sync reward, photo-finish recap, actionable miss hint, Sport/Mayhem split, and synchronized cadence are informed prototypes, not proven wins.
- Successful-game interviews explain creator intent and iteration; they do not show that one cited feature caused sales, retention, or awards.
- Research on two-player racing, exergames, action RPGs, and other contexts should guide—not replace—Flipgame playtests with its intended audience.
