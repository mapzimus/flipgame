# v1.12 mobile engagement and party-game research

> Research reference only. Product and implementation decisions are frozen in
> `docs/v112-contract.md`.

**Status:** research brief and test plan  
**Prepared:** 2026-09-06  
**Scope:** Flipgame web/PWA/APK; phone, desktop, and smartboard; local and pass-and-play only  
**Primary concern:** make play voluntarily replayable, socially lively, fair, and polished without designing for compulsion

## Executive recommendation

Flipgame should not optimize for being “addicting.” It should optimize for a fast first success, understandable skill growth, fair uncertainty, memorable shared moments, and an easy stopping point. Those qualities are compatible with a successful party game and a highly rated app; compulsive retention mechanics are not required.

The highest-value v1.12 work is:

1. **Restore credible fairness.** CPU players must miss in understandable, human-like ways, and Alien must not be a disguised difficulty spike. Calibrate CPU and mode outcomes from fixed test corpora, never by changing a live result after the shot.
2. **Make the first minute self-teaching.** Let a player reach a real flip quickly, teach through interaction, make the tutorial skippable, and keep help available later.
3. **Give every action a clear response.** Use one restrained visual/audio/haptic language for input, contact, success, failure, turns, and team outcomes. Haptics supplement rather than carry information.
4. **Build a party loop, not a retention loop.** Minimize setup and between-turn dead time, make whose turn it is unmistakable, celebrate the table rather than humiliating the loser, and put **Play again**, **Change setup**, and **Finish** on equal footing.
5. **Reward mastery and exploration without pressure.** Achievements and cosmetics should be permanent, personal, earned through meaningful play, and never expire, punish absence, sell power, or expose hidden progression.
6. **Treat installability, offline reliability, resume behavior, accessibility, and frame pacing as game features.** A store-quality game feels trustworthy before it asks for anything.

The new full-screen **Arena Select** can strengthen identity and anticipation, but only if repeat players can pass through it quickly. Fighter choice should be explicit; stage choice should be preselected and skippable, with **Use last** and player-initiated **Random** routes. A short Desk Globe geographic showcase can be a memorable make celebration if it remains truthful, locally available, interruptible, and proportional to the play.

No research can guarantee App Store success. The evidence below supports design principles; the specific interface, match-length, and rate targets are hypotheses or existing product constraints that must be tested.

## How to read this brief

- **[Evidence]** A finding or recommendation directly supported by a linked source.
- **[Inference]** A Flipgame-specific design conclusion drawn from that evidence.
- **[Constraint]** A v1.12 product requirement, not a research finding.
- **[Hypothesis]** A measurable starting target whose value has not been established by the cited research.

Platform guidance is normative rather than causal evidence. Laboratory studies may use different games, adult samples, or short sessions. Observational work can identify associations but not prove that a feature caused them. Those limits are called out rather than hidden.

Unless a recommendation is explicitly labeled **[Evidence]**, **[Constraint]**, or **[Hypothesis]**, treat it as **[Inference]**—a proposed application to Flipgame that still requires validation.

## What the evidence says

| Topic | Evidence and limits | Flipgame inference |
|---|---|---|
| Motivation | **[Evidence]** Across four game studies, Ryan, Rigby, and Przybylski found that experiences of autonomy and competence were associated with enjoyment and future-play preference; relatedness also mattered in multiplayer play. Intuitive controls were associated with competence and immersion. This is motivational evidence, not a recipe for a particular retention rate. ([paper](https://doi.org/10.1007/s11031-006-9051-8), [author PDF](https://selfdeterminationtheory.org/SDT/documents/2006_RyanRigbyPrzybylski_MandE.pdf)) | **[Inference]** Prioritize meaningful choices, learnable controls, visible improvement, and co-located social play over points inflation or login pressure. |
| Healthy versus compulsive engagement | **[Evidence]** Przybylski and colleagues distinguished harmonious from obsessive game engagement: better basic-need satisfaction related to enjoyment and energy, while poorer need satisfaction related to obsessive passion, tension, and more time played. The study does not establish that any single interface prevents problematic play. ([paper](https://doi.org/10.1089/cpb.2009.0083)) | **[Inference]** “Minutes played” is not a success metric by itself. Pair replay metrics with autonomy, exit satisfaction, and ease-of-stopping guardrails. |
| Challenge and uncertainty | **[Evidence]** Malone’s foundational model identifies challenge, curiosity, and fantasy as contributors to intrinsic motivation; uncertain outcomes can make clear goals challenging. Later game research also associates enjoyably challenging play with positive experience, although effects are genre- and player-dependent. ([Malone](https://doi.org/10.1016/S0364-0213%2881%2980017-1), [Corcos](https://pmc.ncbi.nlm.nih.gov/articles/PMC5954478/)) | **[Inference]** Preserve uncertainty in physics, player decisions, and match situations. Do not convert uncertainty into random rewards, engineered near-misses, opaque punishment, or odds-based monetization. |
| Dynamic difficulty | **[Evidence]** A comparison of dynamic difficulty approaches found experience benefits in some conditions but also reduced perceived control for some players. Results do not justify covert outcome control in every game. ([Ang and Mitchell](https://doi.org/10.1145/3116595.3116623)) | **[Inference]** Use explicit, player-chosen CPU levels and honest post-match suggestions. Do not secretly alter live shots, grant mercy, or rubber-band scores. |
| Onboarding | **[Evidence]** Apple recommends learning by doing; when onboarding is needed it should be fast, fun, optional, contextual, and available again later rather than requiring memorization. UNICEF’s RITEC materials similarly recommend clear, succinct onboarding introduced gradually in play. ([Apple onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding), [RITEC card deck, pp. 57–60](https://www.unicef.org/childrightsandbusiness/media/1146/file/RDT-cardsmobile-small.pdf)) | **[Inference]** A playable first-flip sequence is more appropriate than a multi-page rules carousel. Teach only the next action, then reveal advanced controls at the moment they become useful. |
| Feedback | **[Evidence]** Apple recommends clear, proportional, contextual feedback across multiple modalities. In two haptics studies, adding well-synchronized vibrotactile embellishment improved reported enjoyability, aesthetics, immersion, and meaning; “more” haptic detail was not uniformly better. Visual “juice” studies also found gains in appeal, with competence effects dependent on context. ([Apple feedback](https://developer.apple.com/design/human-interface-guidelines/feedback), [Apple haptics](https://developer.apple.com/design/human-interface-guidelines/playing-haptics), [Singhal and Schneider](https://doi.org/10.1145/3411764.3445463), [Hicks et al.](https://doi.org/10.1145/3311350.3347171)) | **[Inference]** Establish a small feedback grammar and synchronize it precisely. A restrained contact pulse is more credible than constant vibration or celebration. Visual and audio alternatives must convey the same state. |
| Controls and accessibility | **[Evidence]** Apple calls for immediate gesture feedback, visible button states, and generally at least 44×44 pt hit regions. Android recommends 48 dp touch targets, alternatives to gesture-only flows, and support for touch, mouse, stylus, keyboard, and controllers across form factors. ([Apple gestures](https://developer.apple.com/design/human-interface-guidelines/gestures), [Apple buttons](https://developer.apple.com/design/human-interface-guidelines/buttons), [Apple game controls](https://developer.apple.com/design/human-interface-guidelines/game-controls), [Android accessibility](https://developer.android.com/design/ui/mobile/guides/foundations/accessibility), [Android natural input](https://developer.android.com/games/develop/multiplatform/enable-natural-input-on-all-form-factors)) | **[Inference]** Every action needs an obvious press/capture state and a keyboard-accessible equivalent. Competitive rules stay identical across devices even when feedback presentation differs. |
| Breaks and stopping | **[Evidence]** In a controlled action-game study, spaced practice with breaks improved performance, especially for novices. An observational casual-game study found sessions often ended after a personal performance peak. Neither establishes one ideal match length. ([Johanson et al.](https://doi.org/10.1145/3311350.3347195), [Agarwal et al.](https://doi.org/10.1609/icwsm.v11i1.14939)) | **[Inference]** End on a satisfying, complete match; provide a clear pause and an equally easy exit. A short-match preset should be tested, not assumed to increase enjoyment. |
| Achievements | **[Evidence]** Achievement systems can define optional, session-independent goals, but experimental gamification evidence shows that points, levels, or leaderboards can increase activity without necessarily improving intrinsic motivation. Much of this literature concerns non-game tasks, limiting direct transfer. ([Hamari and Eranti](https://doi.org/10.26503/dl.v2011i1.545), [Mekler et al.](https://doi.org/10.1016/j.chb.2015.08.048)) | **[Inference]** Make achievements evidence of real mastery, experimentation, or shared moments—not an attendance calendar. Avoid public ranking, filler counters, expiring tasks, and locked-content teasers. |
| Child well-being | **[Evidence]** UNICEF’s RITEC work, including validation with 787 children ages 8–12 across 18 countries, organizes responsible game design around safety, autonomy, competence, relationships, creativity, identity, inclusion, and emotional regulation. Its design materials recommend control over tempo, graceful failure, gradual challenge, breaks without losing progress, and shared goals. ([RITEC toolbox](https://www.unicef.org/childrightsandbusiness/workstreams/responsible-technology/online-gaming/ritec-design-toolbox), [RITEC research](https://www.unicef.org/innocenti/reports/responsible-innovation-technology-children), [card deck](https://www.unicef.org/childrightsandbusiness/media/1146/file/RDT-cardsmobile-small.pdf)) | **[Inference]** Co-located play, roles, rematches, and earned mastery can be energetic without exploiting absence, spending, or social comparison. Failure should explain what happened and immediately offer a fair retry or exit. |
| Manipulative design | **[Evidence]** UNICEF recommends scrutinizing play-extending nudges, avoiding disadvantages for time away, and supporting reasonable sessions and breaks. OECD describes dark commercial patterns as interfaces that subvert decisions to extract money, data, or attention. Regulators and platform policies identify particular risks for children around loot boxes, disguised costs, deceptive pressure, privacy, and advertising. ([UNICEF recommendations](https://www.unicef.org/childrightsandbusiness/media/1511/file/Recommendations-for-Online-Gaming-Industry.pdf), [OECD](https://www.oecd.org/en/topics/dark-commercial-patterns.html), [FTC loot-box workshop report](https://www.ftc.gov/news-events/news/press-releases/2020/08/ftc-staff-issue-perspective-paper-video-game-loot-boxes-workshop), [Google Play Families policy](https://support.google.com/googleplay/android-developer/answer/9893335), [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/)) | **[Inference]** Flipgame’s offline, purchase-free model is an advantage. Keep it: no scarcity timers, loss streaks, random rewards, fake urgency, outcome-conditioned prompts, ads, or pay-for-power. |
| Reliability and polish | **[Evidence]** Android’s quality guidance emphasizes preserving state through interruptions, adaptive layouts, predictable navigation, and stable performance. Its frame-pacing guidance explains that inconsistent presentation creates stutter and additional input latency. PWAs should be reliable, responsive, installable, and usable offline, with install prompts placed in an appropriate context. ([Android core quality](https://developer.android.com/docs/quality-guidelines/core-app-quality), [frame pacing](https://developer.android.com/games/sdk/frame-pacing), [PWA characteristics](https://web.dev/articles/what-are-pwas), [install strategy](https://web.dev/articles/define-install-strategy), [offline cookbook](https://web.dev/articles/offline-cookbook)) | **[Inference]** Cold start, resume, offline start, and consistent input latency affect perceived fairness. Test them alongside game balance, not after it. |

## Product thesis: one complete, replayable party loop

The ideal loop is small enough to understand and rich enough to repeat:

1. **Choose quickly.** Start from remembered local preferences, with one obvious default and optional deeper setup.
2. **Know the turn.** The active player, goal, and available input are unambiguous before the board accepts a gesture.
3. **Commit a skillful action.** Input capture is immediate and predictable; practice may explain power or spin, but competitive play does not aim for the player.
4. **Read the result.** Contact, success, miss, special event, and elimination use distinct but restrained feedback.
5. **Share the moment.** A short result beat supports laughter, team recognition, and replay without delaying the next turn.
6. **Choose freely.** Replay, adjust the setup, or finish are all easy. Nothing is lost by stopping.

This loop should survive every supported device. Phone presentation can be compact and haptic; a smartboard can use larger lane-local animation and spatial audio cues. The rules, physics, RNG sequence, eligible actions, and outcome distributions must remain equivalent.

### Arena Select within the loop

The full-screen order is **fighter, then stage**, but both steps do not need to demand a fresh decision every match.

- **[Evidence]** Apple’s onboarding guidance recommends allowing people to experience the app quickly and deferring detail until it is relevant; RITEC recommends gradual, succinct onboarding and meaningful choice that supports autonomy. ([Apple onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding), [RITEC card deck, pp. 12–16 and 57–60](https://www.unicef.org/childrightsandbusiness/media/1146/file/RDT-cardsmobile-small.pdf))
- **[Inference] First play:** require only the identity choice that is necessary to understand ownership. Preselect a clear starter stage and place a prominent **Play with this stage** action on the stage screen. Do not require reading every arena card before the first flip.
- **[Inference] Returning play:** remember the last locally selected fighter/stage where that is unambiguous, land with those cards selected, and allow one confirmation to continue. Do not force two changed selections just because the screens exist.
- **[Inference] Stage escape routes:** provide **Use last** and a player-initiated **Random** option. If product structure permits, **Play now** after fighter selection may accept the preselected stage without an extra decision; otherwise the stage screen must already have a valid selection and immediate confirm action.
- **[Inference] Rematches:** **Play again** keeps the same fighter/stage by default. **Change setup** reopens Arena Select. A normal rematch must not traverse both selection screens again.
- **[Inference] Party variety:** Random can be a remembered opt-in for a Party preset, but it should never secretly change because players are disengaging, winning, losing, or returning after an absence. It draws only from eligible, already-visible arenas.
- **[Constraint] Hidden feat-unlocked arenas:** do not show locked silhouettes, mystery counts, names, feat thresholds, wins remaining, or a total arena/progression denominator. Reveal an arena only after its qualifying feat is legitimately completed. The reveal is permanent, locally saved, dismissible, and never says “play now or lose it.”
- **[Inference] Unlock interruption:** show a newly earned arena in the post-match flow or collection surface, not between fighter and stage on a first-time setup and not before a result is safely committed. The next match may offer it as an explicit new choice, but must not silently equip it.

**[Hypothesis]** A returning player using defaults should reach gameplay with no more than one confirmation after opening Arena Select, while a first-time player should reach a valid flip within the broader 30-second target. This is a test target, not a published standard.

## Recommendations

### P0 — fairness, control, and trust

#### 1. Recalibrate CPU skill as execution quality, not omniscience

- **[Constraint]** Target aggregate CPU success bands are Easy **30–40%**, Medium **45–55%**, and Hard **60–70%**, with strict ordering across supported modes.
- **[Inference]** A CPU miss should emerge from a plausible decision made before the simulation: bounded aim, power, timing, or spin error appropriate to the selected tier. Do not directly choose “make” or “miss,” alter a body after release, or inspect the future outcome and correct it.
- **[Inference]** Calibrate against a fixed, versioned corpus containing simple, medium, and difficult states. Report both aggregate and difficulty-bucket rates so a favorable state mix cannot conceal near-perfect aim.
- **[Inference]** Keep per-turn randomness seeded and reproducible in QA. Production players should experience varied but credible opponents, not an opponent that repeats an identical miss pattern.
- **[Inference]** Show the chosen tier plainly. If the result screen suggests another tier, make it optional and explain that it changes future opponents only.
- **[Constraint]** Never use hidden mercy, rubber-banding, post-release correction, or player-history-based outcome overrides.

These exact percentages are product calibration targets, not values established by motivation research. Their purpose is to make Easy and Medium visibly fallible while preserving a credible challenge on Hard.

#### 2. Make Alien different in expression, comparable in fairness

- **[Constraint]** For matched conditions, Alien success must be within **±10 percentage points** of Classic and have no more than a **10-point spread across supported viewport classes**.
- **[Inference]** Compare Alien and Classic using the same player/CPU tier, state-difficulty bucket, seed family, input policy, and sample count. Report a confidence interval for the paired rate difference.
- **[Inference]** If Alien changes geometry, timing, or force, tune those parameters before the turn begins. Never compensate after observing whether a shot will land.
- **[Inference]** Alien can feel surprising through art, sound, motion, or clearly signaled rule variation while retaining a comparable skill curve. “Different” should not mean “CPU almost never misses.”
- **[Constraint]** Do not reveal programmed event odds, hidden names, unlock thresholds, wins remaining, or total progression length in player-facing explanations.

The parity bounds are product acceptance criteria, not research-derived universal constants.

#### 3. Ship a first-minute playable onboarding

- **[Hypothesis]** Aim for a first valid, player-controlled flip within **30 seconds at the 75th percentile** for a new player on a reference phone.
- Begin with a real board and one sentence/action at a time: touch or focus, drag/aim, release, observe.
- Let players skip once and continue; keep **How to play** available from setup, pause, and post-match screens.
- Use contextual tips only when a player reaches the relevant mechanic or repeatedly makes the same input error.
- Do not require an account, network request, notification consent, install prompt, rating prompt, or settings tour before play.
- Respect reduced-motion, muted-audio, keyboard, and non-haptic use from the first interaction.

#### 4. Define one multimodal feedback grammar

Create distinct, synchronized cues for:

- pointer/finger capture and release;
- legal versus cancelled input;
- first meaningful contact;
- successful make, cap, or objective completion;
- miss or invalid result;
- active-turn handoff;
- elimination/match point;
- individual victory and shared team victory.

**[Inference]** Use the smallest cue that communicates the event. Reserve the strongest visual/audio/haptic combination for rare, important outcomes. Haptics must be optional and can never be the only signal; smartboards and many desktop devices need equivalent visual/audio cues. Avoid fake “near win” effects on ordinary misses.

#### 5. Treat performance and restoration as fairness requirements

- Preserve an active local match through backgrounding, screen rotation, sleep, and ordinary app interruption.
- Cache the critical shell and assets required to launch and play offline; failure should degrade clearly rather than strand the user behind a spinner.
- Test frame pacing and input-to-feedback latency on representative low, middle, and large-display hardware. A median frame rate can hide disruptive stalls; inspect long frames and input outliers.
- Keep the phone composition designed rather than merely scaled, and preserve the v1.12 minimum **48 px** interactive target requirement.
- Make every primary flow usable by touch and keyboard; support mouse/stylus naturally where present.

#### 5a. Make full-screen Arena Select phone-native

- Use a stable, scrollable grid/list rather than a gesture-only carousel; cards need visible names, selected state, and a clear confirmation control.
- Keep **Back** and the selected fighter/stage context visible. A sticky safe-area-aware footer can hold the single primary action without covering the final row.
- Meet the v1.12 48 px minimum for cards and controls; allow the whole card to activate, maintain visible focus, and avoid tiny favorite/random affordances inside it.
- Keep the first useful choices and the current selection above the fold. Rich preview art can load after the selected label and primary action; it must not delay first play or offline use.
- Do not make horizontal swiping the only way to discover stages. Support touch, wheel/trackpad, pointer, and keyboard with a predictable focus order.
- If a stage changes rules rather than presentation alone, summarize the already-visible rule difference in one short line before confirmation. Never disclose programmed event odds or hidden requirements.

### P1 — party energy and mastery

#### 6. Make local multiplayer ceremonially clear and mechanically quick

- Stage the roster on one screen and remember safe local defaults.
- Give each player/team a stable color plus shape/name cue; color cannot be the only identifier.
- Announce the active player before input is accepted, then use a lane-local turn pulse rather than a full-screen interruption every turn.
- Keep normal between-turn animation short. Use a longer beat only for match point, elimination, comeback, or final victory.
- Rotate the opening player across rematches or use an explicit fair/random opener; do not quietly advantage the previous winner.
- For 2v2, celebrate shared contributions and the team result. Avoid intra-team rankings that turn cooperation into blame.
- For 1v1v1v1, keep every player’s status readable at a glance and minimize the time eliminated players wait without agency.
- Offer a clean spectator-readable display state on smartboards without creating different rules from phone play.

#### 6a. Use the Desk Globe showcase as a proportional party beat

- **[Evidence]** Platform guidance recommends proportional, contextual, multimodal feedback, while “juicy” visual/haptic research supports synchronized embellishment but does not show that more spectacle is always better. ([Apple feedback](https://developer.apple.com/design/human-interface-guidelines/feedback), [Singhal and Schneider](https://doi.org/10.1145/3411764.3445463), [Hicks et al.](https://doi.org/10.1145/3311350.3347171))
- **[Inference]** Trigger the geographic showcase only after a valid Desk Globe make and after the result/state has been committed. It should celebrate the actual resolved location or rule outcome, not fabricate a near miss or random prize.
- **[Hypothesis]** Start with **1.0–1.8 seconds** for the full make beat, including transition in/out. Test rather than treating that range as a platform rule.
- Make the first showcase understandable, then allow touch/click/keyboard to advance it. Provide a Short/Off presentation preference where appropriate; reduced-motion uses a static location card or gentle crossfade.
- Keep the next player, score consequence, and geographic label understandable when the beat ends. On a smartboard, make the place name readable at distance; on a phone, avoid an interaction-sized map or dense trivia panel.
- Bundle/cache the required geography text and art for offline use. Do not call a live map service, transmit a location, or imply the device/player is at the showcased place.
- Use concise, verified place labels. If enrichment text cannot be sourced and maintained accurately, show only the resolved label and visual rather than generated trivia.
- Repetition should shorten gracefully within a match; it must not become a blocking interstitial after every routine action. Reserve the richer version for a make, first occurrence, match point, or similarly meaningful event.

#### 7. Test a short-match preset rather than an endless mode

- **[Hypothesis]** Test a **3–7 minute** Quick Match/Party preset against the current default. There is no source establishing this as a universal ideal; it is a starting range for a pass-and-play game.
- Measure completion, turn downtime, voluntary rematch, exit satisfaction, and group preference—not only total minutes.
- End each match completely. Do not autoplay a rematch or make the exit visually subordinate.
- On the result screen, present **Play again**, **Change setup**, and **Finish** with equal clarity. Preserve progress immediately before the choice.
- Provide pause/resume without spending currency, losing a streak, or forfeiting an achievement.

#### 8. Make improvement legible without solving the game

- Show a compact post-match recap of actions the player can understand: personal best, accuracy or control trend where valid, discovered technique, or one optional practice suggestion.
- Keep deep diagnostic overlays in Practice or Lab. Competitive modes should confirm input capture and outcome, not reveal a perfect solution.
- Prefer skill-specific practice challenges with graceful retry over a generic experience bar.
- Let players compare with their own previous local performance. Make any same-device social comparison opt-in and avoid permanent public leaderboards, especially for children.
- Use encouraging, specific language (“your releases were more consistent”) rather than unconditional praise or shame.

#### 9. Use the 100 achievements as a quiet mastery map

- **[Constraint]** The implementation contains exactly 100 achievements, but player-facing UI must not expose total progression length, undiscovered locked names, hidden thresholds, or wins remaining.
- Show earned achievements and contextual, already-discovered goals; do not show an empty 100-slot wall or “37/100.”
- Favor meaningful categories: control mastery, mode exploration, recovery, team contribution, creative play, accessibility/input variety, and rare but skill-readable feats.
- Keep achievements permanent and local. No daily/weekly expiry, loss streak, decay, attendance gate, or “come back before midnight.”
- Avoid filler achievements for raw session time or compulsive repetition. Do not make achievements a prerequisite for core local play.
- Pair important achievements with a cosmetic or presentation choice only when it has no competitive effect and never expires.

#### 10. Add expressive choice without monetized pressure

- Let players choose from earned, already-visible table themes, player markers, trails, victory poses, or sound sets.
- Save favorites locally and make defaults easy to restore.
- Ensure cosmetics do not obscure hit areas, active turns, physics, or accessibility cues.
- Never attach power, better odds, paid rerolls, purchasable currency, random reward containers, scarcity countdowns, or real-money value.
- If gameplay uses randomness, it should vary fair play states—not determine a monetized or expiring reward. Clearly signal the active rule or event even when its programmed odds remain hidden.

### P2 — distribution and durable polish

#### 11. Ask for installation only after demonstrated value

- Keep browser play complete; installation is an optional convenience, not a gate.
- **[Hypothesis]** Try a single contextual install affordance after a completed match or from settings, not on first launch or during a turn.
- Respect dismissal and leave a stable manual install route. Do not use fake urgency or repeated interruption.
- Verify installed PWA and APK cold start, offline start, resume, orientation, safe areas, and local-data preservation independently.

#### 12. Keep ratings and promotion outcome-neutral

- Use only the platform-provided review flow where applicable and trigger it after a meaningful amount of use, never only after a win.
- Never ask “Do you love it?” before routing favorable players to a store review, or pressure an unhappy player to keep playing.
- Do not include third-party ads, behavioral identifiers, or analytics merely to increase store metrics. Any future data change requires a separate privacy and youth-safety review.

## Phone/smartboard parity

| Concern | Phone/PWA/APK | Smartboard/desktop | Invariant |
|---|---|---|---|
| Primary input | Single-touch direct manipulation; visible capture beneath/around the finger; optional haptic cue | Touch, mouse, stylus, and keyboard; validate two/four simultaneous lane contacts only where a mode needs them | Same legal actions, timing windows, and physics result for equivalent input |
| Target size | At least the v1.12 48 px minimum, with safe-area clearance | Scale for viewing distance and reach, not merely CSS minimums | No platform gets smaller effective targets or hidden controls |
| Turn ownership | Compact banner plus player color/shape/name | Lane-local highlight visible to players and spectators | Input is rejected or safely cancelled until ownership is unambiguous |
| Feedback | Visual + audio, optional synchronized haptic | Larger visual/spatial cue + audio; never depend on vibration | Same semantic event and relative significance |
| Layout | Deliberate portrait/landscape composition; controls reachable without covering state | Board and status readable from farther away; avoid edge-only controls | Same game information and no viewport-specific strategic advantage |
| Performance | Test representative lower-tier Android/WebView hardware and interruption/resume | Test large canvas, 4K scaling, and multi-contact load | Stable simulation, bounded input latency, no device-dependent RNG |
| Accessibility | Keyboard fallback, reduced motion, mute/captions/text alternatives, high contrast | Same, plus large focus/turn indicators | No essential information encoded only by color, sound, motion, or haptic |

## Priority matrix

Impact and confidence are relative planning judgments, not research effect sizes.

| Initiative | Priority | Expected impact | Effort | Evidence confidence | Coverage | Primary metric | Guardrail |
|---|---:|---:|---:|---:|---|---|---|
| CPU pre-release error model and rate calibration | P0 | Very high | Medium | High for fairness principle; target bands are constraints | All | Success rate and 95% CI by tier/state bucket | Perceived fairness; no post-release override |
| Alien matched-rate calibration | P0 | Very high | Medium | Product acceptance criterion | All | Alien–Classic paired rate difference | Viewport spread; mode still feels distinct |
| Interactive, skippable first-flip onboarding | P0 | High | Medium | High platform/child-design guidance | Phone first, then all | Time to first valid flip; unassisted next-turn success | Skip/help discoverability; accessibility |
| Unified input/feedback grammar | P0 | High | Medium | Moderate experimental + high platform guidance | All | Input error attribution; perceived control | Reduced-motion/mute/no-haptic comprehension |
| Offline, resume, and frame-pacing hardening | P0 | High | Medium–high | High platform guidance | PWA/APK/all | Successful resume; cold/offline start; long-frame rate | No match/data loss |
| Arena Select fast path and hidden-unlock behavior | P0 | High | Medium | High onboarding guidance; exact flow is a hypothesis | All, especially phone | Setup-to-first-flip; selection abandonment | No hidden progression leak; choice remains reversible |
| Turn ownership and fast local handoff | P1 | High | Medium | Moderate motivational/child-design evidence | Pass-and-play/smartboard | Between-turn dead time; wrong-player inputs | All-player comprehension |
| Equal-choice result/rematch screen | P1 | Medium–high | Low | Moderate ethical/stopping evidence | All | Voluntary rematch and exit satisfaction | Exit discoverability; no prompt pressure |
| Quick Match/Party preset | P1 | Medium–high | Medium | Low for exact duration | All local modes | Completion, rematch, group preference | No rise in confusion or rushed play |
| Personal mastery recap and practice suggestion | P1 | Medium | Medium | Moderate competence evidence | All | Practice uptake and later skill improvement | Autonomy; recap can be skipped |
| Achievement quality/pass over all 100 | P1 | Medium | Medium | Moderate; causal evidence limited | All | Meaningful-achievement recall/opt-in | No total/threshold leak, expiry, or grind |
| Desk Globe geographic make showcase | P1 | Medium | Low–medium | Moderate feedback evidence; duration is a hypothesis | All | Celebration appeal; added handoff delay | Skip/reduced motion; factual/offline integrity |
| Earned cosmetic expression | P1 | Medium | Medium | Moderate autonomy/identity rationale | All | Customization use and satisfaction | Zero gameplay advantage; readability |
| Contextual install affordance | P2 | Medium | Low | High platform guidance, uncertain game effect | PWA | Install acceptance after value; dismissals | No repeated prompt; browser remains complete |
| Outcome-neutral platform review prompt | P2 | Low–medium | Low | High platform/policy guidance | APK/store builds | Prompt completion when platform reports it | Never conditioned on win or sentiment |

## Experiments and metrics

### Research operating rules

- Production remains local-only. Experiments run in explicit QA/research builds with informed adult consent; research involving minors requires the project’s approved guardian/assent and school or organizational procedure.
- Keep raw test records on the test device where practical. Export only the minimum aggregate or de-identified session data needed for analysis, then delete it on the declared schedule.
- Pre-register the primary measure, comparison, exclusion rules, state/seed corpus, and stopping rule. Determine sample size from pilot variance and the minimum meaningful effect; do not stop when a desirable result first appears.
- Counterbalance within-subject conditions when learning could bias later variants. Report confidence intervals and both absolute and relative results.
- Segment at least novice/experienced and phone/smartboard. For CPU and Alien, also stratify by state-difficulty bucket.
- A variant does not ship solely because it increases play time or rematches. Guardrails—fairness, autonomy, comprehension, accessibility, exit ease, and well-being—have equal decision weight.

### E1 — first-play comprehension

**Comparison:** current first-run flow versus interactive, skippable first-flip onboarding.  
**Primary:** time from launch to first valid intentional release.  
**Secondary:** first-attempt gesture success, unassisted correct action on the next turn, rules recall after one match, help use, skip use, and self-reported control/competence.  
**Guardrails:** keyboard completion, reduced-motion comprehension, accidental input rate, and percentage able to find help again.  
**Decision:** ship only if first play is faster or clearer without reducing later rules comprehension.

### E2 — feedback dosage

**Comparison:** baseline visual feedback; synchronized visual+audio; synchronized visual+audio+available haptic, counterbalanced within subject.  
**Primary:** perceived control and correct explanation of why a shot was accepted/cancelled.  
**Secondary:** enjoyability, aesthetic appeal, immersion/meaning, input errors, and event-recognition accuracy.  
**Guardrails:** discomfort, startle, audio-off/no-haptic comprehension, reduced-motion mode, battery/performance, and no information advantage by device.  
**Decision:** choose the smallest feedback set that produces a meaningful clarity/experience improvement.

### E3 — CPU fairness calibration

**Method:** run the versioned state corpus at each tier with fixed seed families; repeat on supported modes and viewport classes. Follow with blinded player sessions in which participants rate tier identity, fairness, and desire for a rematch.  
**Primary:** aggregate success rate with Wilson 95% confidence interval against the **30–40 / 45–55 / 60–70%** constraints.  
**Secondary:** strict tier ordering in every major state bucket, distribution of miss direction/magnitude, player tier identification, perceived outcome explainability, and human win rate.  
**Guardrails:** no post-release changes, no dependence on recent player losses, no implausible repeated miss signature, and no viewport advantage.  
**Decision:** a passing aggregate is insufficient if Easy remains perfect on common states or tiers invert within a mode.

### E4 — Alien parity

**Method:** paired Classic/Alien simulations and human sessions matched on initial state family, tier, input policy, and viewport.  
**Primary:** paired difference in success rate and its confidence interval; acceptance constraint is within **±10 percentage points**.  
**Secondary:** no more than **10 points** between viewport classes, perceived fairness, perceived distinctiveness, error comprehension, and turn duration.  
**Guardrails:** no live outcome correction and no player-facing disclosure of programmed odds or hidden progression.  
**Decision:** Alien must pass statistical parity and still be described as meaningfully different; parity alone cannot justify a confusing reskin.

### E5 — party pacing

**Comparison:** current match format versus the proposed Quick Match/Party preset in intact local groups.  
**Primary:** match completion and group-rated pace.  
**Secondary:** setup-to-first-turn time, median/p95 between-turn dead time, voluntary rematch choice, total matches by free choice, exit satisfaction, and observed participation by every player. A lightweight observational code can count shared laughter/cheering only with consent; it should never infer emotion from cameras or microphones.  
**Guardrails:** rules comprehension, perceived rush, eliminated-player idle time, equal access to **Finish**, and no automatic continuation.  
**Decision:** prefer the format groups choose and complete while retaining an easy, satisfying stop; do not select it merely for longer sessions.

### E6 — mastery recap

**Comparison:** plain result screen versus one optional, specific personal-improvement card with a link to relevant practice.  
**Primary:** competence/control rating after the match.  
**Secondary:** voluntary practice uptake, improvement on the same skill in a later block, recap recall, and achievement quality rating.  
**Guardrails:** dismissibility, no shame language, no inaccurate causal advice, no hidden requirement/threshold leak, and no reduction in immediate exit ease.  
**Decision:** retain only cards that players understand and that predict measurable skill improvement or clearer strategy.

### E7 — party turn and team feedback

**Comparison:** current turn transition versus stable player identity + lane-local turn pulse + shared team result cue.  
**Primary:** wrong-player/early input rate and active-player identification accuracy.  
**Secondary:** handoff time, relatedness/team-coordination rating, contribution recall, and smartboard spectator comprehension.  
**Guardrails:** color-independent identification, no intra-team blame/ranking, motion/accessibility comfort, and no slower normal turns.  
**Decision:** ship if ownership errors fall and group clarity improves without adding ceremony to every ordinary turn.

### E8 — install, offline, and resume

**Comparison:** no contextual prompt versus one dismissible post-match/settings install affordance; independently run interruption and offline matrices.  
**Primary:** successful cold/offline launch and exact match restoration after supported interruptions.  
**Secondary:** install acceptance, dismissal, repeated-prompt count, load time, local-data preservation, frame-time outliers, and input-to-feedback latency.  
**Guardrails:** browser version remains complete, dismissal persists, no first-run interruption, zero match loss in supported resume cases, and no new transmitted identifier.  
**Decision:** distribution polish cannot ship over a restoration or privacy regression.

### E9 — Arena Select setup cost

**Comparison:** full fighter→stage selection with no defaults; valid starter/last-used stage preselected; and, if technically/product-appropriate, a fighter-screen **Play now** fast path that accepts the preselection. Test first-time and returning players separately.  
**Primary:** Arena Select entry to gameplay-ready time and launch-to-first-valid-flip time.  
**Secondary:** number of taps/confirmations, backtracks, selection errors, setup abandonment, percentage intentionally changing a stage, Random use, and recall of selected fighter/stage.  
**Guardrails:** every participant can find stage customization later; a default is never mistaken for a locked choice; keyboard/focus order works; hidden arenas, totals, and thresholds never appear; and Random never includes an ineligible/undiscovered arena.  
**Decision:** default or skip stage selection when it reduces setup cost without reducing comprehension or later discoverability. Do not preserve an extra screen interaction merely to increase feature exposure.

### E10 — Desk Globe make-beat duration

**Comparison:** static/short card, 1.0-second animated beat, and 1.8-second animated beat, with reduced-motion and manual-advance paths. Counterbalance within intact groups.  
**Primary:** celebration appeal and added result-to-next-player time.  
**Secondary:** place-label recall, next-player identification, manual skips, repeated-event annoyance, group preference, and performance on phone/smartboard.  
**Guardrails:** the make is committed before animation; no wrong or ambiguous geographic claim; offline behavior is complete; mute/reduced-motion paths preserve meaning; and repeated showcases do not block play.  
**Decision:** choose the shortest treatment that clearly improves the shared moment. If it harms pacing after repetition, keep the richer beat only for the first occurrence or high-significance makes.

## Metric definitions

| Metric | Definition | Why it matters |
|---|---|---|
| Time to first valid flip | Launch/Play activation to the first accepted player-controlled release, excluding forced automation | Tests whether the game teaches itself quickly |
| Unassisted next-turn success | Player completes the next eligible action without a prompt or facilitator | Distinguishes learning from following a one-time instruction |
| Input error attribution | Player correctly identifies why an input was accepted, cancelled, or invalid | Measures clarity and perceived fairness |
| Between-turn dead time | Result settlement to the next player’s first accepted input; report median and p95 | Captures party pacing without deleting meaningful celebration |
| Arena setup cost | Arena Select entry to gameplay-ready state, plus taps, backtracks, and abandonment | Detects when expressive choice becomes a pre-play tax |
| Stage-choice intentionality | Player can identify the selected stage and whether it was chosen, reused, or randomized | Distinguishes a useful default from an unnoticed decision |
| Showcase added delay | Desk Globe result commit to next eligible input minus the equivalent non-showcase transition | Keeps spectacle proportional to party pacing |
| Voluntary rematch | Group chooses replay when replay, setup change, and finish are equally visible | More ethical signal than an autoplay continuation |
| Exit satisfaction | Short post-session rating that the session felt complete and stopping was easy | Guards against compulsive-flow optimization |
| Competence/autonomy/relatedness | Short, consistently worded items adapted from validated game-experience need-satisfaction work | Tests the motivational qualities implicated by the evidence |
| CPU success rate | Successful attempts divided by eligible attempts, with confidence interval, reported overall and by state bucket | Prevents “almost never misses” from hiding in averages |
| Alien parity difference | Alien success rate minus matched Classic rate, preferably paired by state/seed family | Direct v1.12 fairness criterion |
| Completion | Started matches reaching a valid terminal result, excluding forced/test flows | Reveals confusion, length, and reliability problems |
| State restoration | Supported interruption cases that return to the exact legal match state | Trust and mobile quality |
| Long-frame/input outlier rate | Share of frames or input events beyond device-specific QA thresholds | Averages can conceal visible stutter and unfair-feeling input |
| Prompt burden | Install/review/help interruptions per session and repeat prompts after dismissal | Prevents polish features from becoming pressure |
| Absence penalty | Progress, access, or earned value lost because the player did not return | Must remain exactly zero |
| Transmitted child/player data | Identifiers, behavior, voice/image, or gameplay data sent off device | Must remain exactly zero under the local-only product scope |

Session duration is descriptive, not a north-star metric. Report it beside completion, exit satisfaction, breaks, autonomy, and rematch choice.

## Release gates

A candidate build should not be called more engaging unless it passes all applicable gates:

1. CPU bands and ordering pass the fixed corpus, with no forbidden outcome manipulation.
2. Alien–Classic parity and cross-viewport spread pass their stated constraints.
3. New-player comprehension improves or remains intact across touch and keyboard.
4. First-time and returning Arena Select flows meet their setup targets without leaking hidden arenas/progression or burying later customization.
5. The Desk Globe showcase remains skippable, accessible, offline-complete, factually sound, and within its tested pacing budget.
6. No supported interruption loses a match or local progression.
7. Haptic-, audio-, reduced-motion-, and color-independent paths communicate all essential events.
8. Finish/pause/help remain easy to find; no absence penalty or expiring reward is introduced.
9. The change improves at least one player-centered outcome—fairness, control, competence, relatedness, clarity, or satisfaction—not merely time spent.

## Do-not-ship list

- Daily check-ins, login chains, streak loss, achievement decay, or punishment for time away
- Energy timers, wait-to-play gates, infinite autoplay, or an intentionally obscured exit
- Loot boxes, mystery rewards with economic value, paid rerolls, paid odds, or pay-to-win advantages
- Countdown stores, fake scarcity, fake social proof, engineered near-miss celebrations, or fear-of-missing-out copy
- Multi-currency obfuscation, spending prompts aimed at children, ads, or behavioral profiling
- Review prompts gated on a win, a favorable sentiment question, or repeated after dismissal
- Hidden dynamic difficulty, mercy, rubber-banding, post-release physics correction, or outcome selection disguised as skill
- Public rank/shame mechanics, intra-team blame scores, or notifications saying others passed the player
- Player-facing leaks of programmed event odds, hidden names, unlock thresholds, wins remaining, or total progression length
- Mandatory re-selection of a fighter/stage on every rematch, Random that draws hidden/ineligible stages, or a newly unlocked arena silently equipped to exploit novelty
- Unskippable or factually unreliable Desk Globe interstitials, remote map dependencies, or spectacle that delays ordinary handoffs
- Online mode, chat, voice capture, camera-based emotion inference, or new telemetry under the v1.12 local-only scope

Gameplay randomness is not inherently a loot box. It is acceptable when it creates fair, understandable match variation, has no monetary or expiring reward leverage, is determined independently of whether a player recently won/lost, and does not conceal outcome manipulation.

## Suggested implementation/test sequence

1. **Fairness baseline:** freeze the state corpus and measurement definitions; calibrate CPU and Alien before judging new party features.
2. **Control baseline:** validate input capture, minimum targets, frame pacing, offline launch, and exact resume on reference devices.
3. **First-play and feedback:** implement the interactive onboarding and minimal feedback grammar; run E1/E2.
4. **Selection and celebration:** implement Arena Select defaults/fast path and the shortest viable Desk Globe beat; run E9/E10 before expanding either presentation.
5. **Party loop:** reduce handoff time, add clear turn/team cues, and prototype Quick Match; run E5/E7 with intact groups.
6. **Mastery layer:** audit the 100 achievements and test one accurate, optional post-match mastery card; run E6.
7. **Distribution polish:** validate installed PWA/APK parity, then test a respectful contextual install affordance; run E8.

## Source notes

### Platform and distribution

- Apple, [Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding), [Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback), [Playing haptics](https://developer.apple.com/design/human-interface-guidelines/playing-haptics), [Gestures](https://developer.apple.com/design/human-interface-guidelines/gestures), [Game controls](https://developer.apple.com/design/human-interface-guidelines/game-controls), [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons), and [Designing for games](https://developer.apple.com/design/human-interface-guidelines/designing-for-games).
- Apple, [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) and [Kids](https://developer.apple.com/kids/).
- Android, [Accessibility](https://developer.android.com/design/ui/mobile/guides/foundations/accessibility), [Natural input on all form factors](https://developer.android.com/games/develop/multiplatform/enable-natural-input-on-all-form-factors), [Core app quality](https://developer.android.com/docs/quality-guidelines/core-app-quality), [Adaptive app quality](https://developer.android.com/docs/quality-guidelines/adaptive-app-quality/tier-2), and [Frame Pacing](https://developer.android.com/games/sdk/frame-pacing).
- Google, [Play Families policy](https://support.google.com/googleplay/android-developer/answer/9893335).
- web.dev, [What are PWAs?](https://web.dev/articles/what-are-pwas), [Define an install strategy](https://web.dev/articles/define-install-strategy), and [The offline cookbook](https://web.dev/articles/offline-cookbook).

### Peer-reviewed research

- Ryan, R. M., Rigby, C. S., & Przybylski, A. (2006). [The Motivational Pull of Video Games: A Self-Determination Theory Approach](https://doi.org/10.1007/s11031-006-9051-8).
- Przybylski, A. K., Weinstein, N., Ryan, R. M., & Rigby, C. S. (2009). [Having to versus Wanting to Play: Background and Consequences of Harmonious versus Obsessive Engagement in Video Games](https://doi.org/10.1089/cpb.2009.0083).
- Malone, T. W. (1981). [Toward a Theory of Intrinsically Motivating Instruction](https://doi.org/10.1016/S0364-0213%2881%2980017-1).
- Corcos, A. (2018). [Being enjoyably challenged is the key to an enjoyable gaming experience: an experimental approach in a first-person shooter game](https://pmc.ncbi.nlm.nih.gov/articles/PMC5954478/).
- Ang, D., & Mitchell, A. (2017). [Comparing Effects of Dynamic Difficulty Adjustment Systems on Video Game Experience](https://doi.org/10.1145/3116595.3116623).
- Singhal, S., & Schneider, O. S. (2021). [Juicy Haptic Design: Vibrotactile Embellishments Can Improve Player Experience in Games](https://doi.org/10.1145/3411764.3445463).
- Hicks, K., Gerling, K., Dickinson, P., & Vanden Abeele, V. (2019). [Juicy Game Design: Understanding the Impact of Visual Embellishments on Player Experience](https://doi.org/10.1145/3311350.3347171).
- Johanson, C., Gutwin, C., Bowey, J. T., & Mandryk, R. L. (2019). [Press Pause when You Play: Comparing Spaced Practice Intervals for Skill Development in Games](https://doi.org/10.1145/3311350.3347195).
- Agarwal, T., Burghardt, K., & Lerman, K. (2017). [On Quitting: Performance and Practice in Online Game Play](https://ojs.aaai.org/index.php/ICWSM/article/view/14939).
- Hamari, J., & Eranti, V. (2011). [Framework for Designing and Evaluating Game Achievements](https://doi.org/10.26503/dl.v2011i1.545).
- Mekler, E. D., Brühlmann, F., Tuch, A. N., & Opwis, K. (2017). [Towards understanding the effects of individual gamification elements on intrinsic motivation and performance](https://doi.org/10.1016/j.chb.2015.08.048).

### Youth well-being and ethical design

- UNICEF, [Responsible Innovation in Technology for Children](https://www.unicef.org/innocenti/reports/responsible-innovation-technology-children), [RITEC Design Toolbox](https://www.unicef.org/childrightsandbusiness/workstreams/responsible-technology/online-gaming/ritec-design-toolbox), and [RITEC game-design card deck](https://www.unicef.org/childrightsandbusiness/media/1146/file/RDT-cardsmobile-small.pdf).
- UNICEF, [Recommendations for the Online Gaming Industry on Assessing Impact on Children](https://www.unicef.org/childrightsandbusiness/media/1511/file/Recommendations-for-Online-Gaming-Industry.pdf).
- UK Information Commissioner’s Office, [Nudge techniques](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/13-nudge-techniques/).
- OECD, [Dark commercial patterns](https://www.oecd.org/en/topics/dark-commercial-patterns.html).
- US Federal Trade Commission, [Loot-box workshop perspective paper announcement](https://www.ftc.gov/news-events/news/press-releases/2020/08/ftc-staff-issue-perspective-paper-video-game-loot-boxes-workshop).

All web sources were accessed on 2026-09-06. Exact feature effects should be re-tested in Flipgame rather than inferred from citation count or transferred uncritically across genres and populations.
