# v1.12 Arena Select, visual-stage, and arena-progression specification

> **Reference only:** where this draft conflicts with `docs/v112-contract.md`,
> the authoritative contract wins.

**Status:** proposed frozen contract for owner review
**Prepared:** 2026-09-06
**Scope:** current arena audit; dedicated post-character Arena Select; visual-stage catalog/rendering; local modes; Flip Experience Points/Flip Level migration and arena milestones; web/PWA/APK parity
**Out of scope:** implementation, Arena Draft physics tuning, event physics, and the exact non-arena reward sequence

## 1. Decision summary

1. **Use a dedicated full-screen Arena Select.** The route is `Setup/character choices → Arena Select → ready beat → match`. It is one global stage choice, not another per-player customization tab.
2. **Always preselect a legal stage.** A fresh save owns Bottle, the plain personal presentation, and one non-progression **Baseline Table**. Returning play preselects the last used owned/compatible arena. There is no player-facing `None` stage.
3. **Use one primary confirmation.** The persistent primary action is **Play Now · {Arena}** with accessible name `Start match in {Arena}`. This is the Start/Confirm action; do not add a second competing Start button. **Random Unlocked** selects and previews but never starts automatically.
4. **Keep mystery without exposing collection length.** Production Arena Select renders every owned compatible stage plus at most one anonymous `🔒` tile labeled only `Locked`. It does not render one lock per undiscovered arena, because that would reveal the hidden total.
5. **Separate stage art from physics.** A visual arena can change only paint, bounded ambience, audio, and post-verdict camera response. Cup’s **Arena Draft — Physics Modifier** is a separate state and label. Stage selection never changes gravity, collision, scoring, input, timing, event odds, or gameplay RNG.
6. **Adopt device-wide Flip Experience Points (`FXP`) and Flip Level (`FL`).** This is more inclusive than the qualifying-win counter because completed human-played losses contribute. Award match FXP once per completed match, use a capped sublinear human-contributor multiplier and bounded performance multiplier, and exclude CPU/AI-only, Practice, Lab, forced, and Owner Test play. Flip Credits (`FC`) are a separate earn-only personal-cosmetic currency; v1.12 has no payment, ad, loot-box, wagering, conversion, or pay-to-win hook.
7. **Freeze the 1–100 anchors.** A fresh save starts at FL 1 with Bottle and Baseline Table. Full Physics Lab unlocks at FL 50. Alien and INSANE MODE unlock together at FL 100. Main-menu feature cards may say exactly `Locked until FL 50` or `Locked until FL 100`; object and arena selectors still reveal only an anonymous lock.
8. **Put collectible arenas on deterministic FL milestones, not feats.** Preserve the ten inherited arena IDs at FL 9, 19, …, 99. Place the twelve new arenas at FL 5, 13, 17, 25, 35, 45, 55, 65, 75, 85, 93, and 97. Cosmetics leave the level ladder for the FC shop; old feat ideas remain achievement/stat moments, not access gates.
9. **Author all stages; do not upscale the current generic effect.** The current ten names resolve to a shared hashed-color gradient and simple dots/lines. Each inherited and new stage needs an original layered scene, a bounded reaction, a static/reduced-motion state, and a performance tier.
10. **Certify a controlled Battle subset.** All 22 collectible arenas plus Baseline Table work in Classic, Cup, and Team Clash. v1.12 initially qualifies eight stages for both two- and four-lane Battle. Random filters by mode compatibility.
11. **Keep encoded assets offline, decode/render lazily.** PWA install and APK packaging contain every stage asset, but Arena Select runs only one live preview and keeps a bounded thumbnail cache. Starting a match never waits for all 23 scenes to decode.

The interaction research supporting quick, optional, contextual setup and restrained feedback is in [v112-mobile-engagement-research.md](v112-mobile-engagement-research.md). This document turns those principles into an exact Flipgame contract.

## 2. Key conflicts that require the new contract

| Conflict | Current/proposed state | Resolution in this specification |
|---|---|---|
| No legal first-run arena | Current progression awards the first collectible arena at qualifying win 9, while `visualArenaId = null` means generic rendering. The plan requires Arena Select before every new match. | Add `arena.baseline-table` as an always-owned functional default. It is not a progression prize and is excluded from the 22 collectible count. There are therefore 23 renderable visual scenes: one baseline plus 22 collectibles. |
| Old progression text is superseded | `v112-plan.md` currently says the twelve arenas come from hidden feats and mixes cosmetics into a win ladder. | Final owner direction governs: device-wide FXP/FL 1–100, Lab at FL 50, Alien + INSANE at FL 100, deterministic object/arena rewards, and cosmetics purchased only with earned FC. Update the central plan separately; do not implement both systems. |
| Two currencies can be conflated | The latest direction introduces permanent progress (`FXP`) and spendable personal-cosmetic currency (`FC`). | FXP only raises FL and is never spent. FC never raises FL and can buy only previewable personal cosmetics. Objects, arenas, features, performance, and competitive outcomes cannot be bought. There are no real-money, ad, random-purchase, exchange, or store-payment hooks in v1.12. |
| Mystery versus lock count | The plan mentions locked stage tiles while also forbidding disclosure of ladder length. One tile per hidden stage reveals how many remain. | Render one aggregate anonymous lock tile regardless of whether 1 or 22 collectibles remain. It contains no ID, name, image, silhouette, feat, level, ordinal, progress, or data attribute. |
| “22 total” versus baseline | A usable fresh save needs a stage but none of the inherited ten can become free without changing an existing reward. | Define **22 collectible arenas + one non-collectible Baseline Table**. Any document or test saying “22 total renderable stages” must be corrected to this explicit distinction. |
| Space Station wording | The plan calls it a “zero-window-view” stage while also requiring a rotating Earth view. | Freeze it as an **orbital observation bay** with Earth visible through one sealed observation window. If “no physical window” was intended, use a wall-scale external camera display; do not claim both. |
| Cup stage versus Arena Draft | Both currently use “arena” language, and the plan allows a visual change between completed heats while Cup already needs a between-heat physics choice. | Keep the visual stage fixed for the entire Cup. Between heats show only **Arena Draft — Physics Modifier**. Offer Same Arena/New Arena after the overall Cup. Mid-Cup visual changes are rejected for v1.12 because they add a second full-screen choice and make replay/state restoration ambiguous. |
| Visual and physical IDs collapse in statistics | Current records use `visualArenaId || arenaProfileId` as one `arenaId`. | Preserve legacy import, but new runtime/records keep `visualArenaId` and `arenaModifierId` separate. Player-facing “Arena” means visual stage; “Physics modifier” means Arena Draft/event profile. |
| Unsafe catalog dependency | Customize calls the internal cosmetic catalog to recover scope while public views hide thresholds. | The visual arena catalog directly provides a safe player view. Player-facing code never needs the internal reward manifest or milestone fields. |
| APK/PWA asset drift | The service worker precaches a fixed list; the APK workflow copies only `index.html`, `css`, `js`, `icons`, and `manifest.json`. A new `assets/arenas` directory would be omitted. | Generate/verify one release arena-asset manifest. Include every file in the PWA’s atomic cache and APK copy/inventory test. No runtime CDN, live map, or remote audio dependency. |

## 3. Current-state audit

### 3.1 Catalog and ownership

`js/v111-cosmetic-catalog.js` interleaves ten global arena rewards among forty personal cosmetics. The stable arena IDs, names, and current qualifying-win milestones are:

| Current milestone | Stable ID | Current name | v1.12 ownership rule |
|---:|---|---|---|
| 9 | `arena.rooftop` | Rooftop | Keep ID and FL 9 milestone; preserve existing ownership |
| 19 | `arena.arcade` | Arcade | Keep ID and Level 19 milestone; preserve existing ownership |
| 29 | `arena.moon-deck` | Moon Deck | Keep ID and Level 29 milestone; preserve existing ownership |
| 39 | `arena.ice-cave` | Ice Cave | Keep ID and Level 39 milestone; preserve existing ownership |
| 49 | `arena.neon-grid` | Neon Grid | Keep ID and Level 49 milestone; preserve existing ownership |
| 59 | `arena.garden` | Garden | Keep ID and Level 59 milestone; preserve existing ownership |
| 69 | `arena.space-station` | Space Station | Keep ID and Level 69 milestone; preserve existing ownership; replace generic art |
| 79 | `arena.volcano` | Volcano | Keep ID and Level 79 milestone; preserve existing ownership |
| 89 | `arena.storm-table` | Storm Table | Keep ID and Level 89 milestone; preserve existing ownership |
| 99 | `arena.aurora-stage` | Aurora Stage | Keep ID and Level 99 milestone; preserve existing ownership |

The player view currently hides each locked entry correctly, but Customize collapses all remaining locks to one generic tile only after calling `internalCatalog()` to filter global scope. v1.12 should retain the single-lock privacy behavior without exposing the internal manifest to the view layer.

### 3.2 Selection and setup

Current behavior in `index.html`, `css/style.css`, and `js/main.js`:

- Arena is the fourth tab inside the per-player Customize route even though it applies globally.
- Arena cards are generic stars with names; they have no scene thumbnail or live preview.
- A selectable `None` card maps to `visualArenaId = null`.
- Selection is held in a confusing local variable called `arenaDraft`, then copied into `visualArenaId`; a separate `arenaDraftOffer` means the Cup physics feature.
- Setup’s Start button validates the roster and launches gameplay directly. There is no pending-start state, Arena Select route, or ready input fence.
- `visualArenaId` is saved in `flipgame.setup.v2`, but load does not validate that the stage is still owned, exists, or supports the chosen format.
- Game Over has one **Same Setup** action. It has no Same Arena/New Arena branch.
- Escape closes Customize, but the Android hardware Back action relies on WebView history; the current screen-swapping routes do not establish a complete Arena Select history contract.

### 3.3 Rendering

`drawVisualArena()` in `js/renderer.js` currently:

- accepts any ID beginning `arena.`;
- hashes the ID into a color;
- paints one generic vertical gradient;
- distinguishes Volcano and Ice Cave only by gradient color;
- uses squares for Arcade/Neon Grid and dots for everything else;
- uses diagonal table lines for Neon Grid/Storm Table/Aurora Stage and a straight line for the rest;
- draws no authored venue, preview, stage-specific reaction, audio scene, Battle composition, or separate reduced-motion art state.

This proves the paint-only data path but does not meet the requested 22-stage art scope. It also means screenshots alone can look superficially different while every stage still reads as the same generic environment.

### 3.4 Offline packaging

- `service-worker.js` atomically precaches the current shell and JavaScript graph. New standalone art/audio files will not be offline unless added to its versioned manifest.
- `.github/workflows/build-apk.yml` copies only the existing top-level web files/directories into `android/app/src/main/assets`. A new top-level arena asset folder is not currently copied.
- The APK WebView loads `file:///android_asset/index.html`; it cannot rely on a service worker or remote fallback. Every encoded arena asset must be inside the APK.

## 4. Terminology and data contract

### 4.1 Names that must not be conflated

| Concept | Player label | Internal example | May change physics? |
|---|---|---|---|
| Visual location | Arena / Stage | `visualArenaId = "arena.stadium-at-night"` | No |
| Cup between-heat choice | Arena Draft — Physics Modifier | `arenaModifierId = "crosswind"` | Yes, symmetrically |
| Temporary physical event | Event | `eventId = "wind-tunnel"` | Yes, under event rules |
| Functional default | Baseline Table | `visualArenaId = "arena.baseline-table"` | No |

Do not reuse `arenaDraft` for a visual-selection draft. Recommended state names are `arenaSelectionDraft`, `visualArenaId`, `arenaModifierOffer`, and `arenaModifierId`.

### 4.2 Visual arena definition

Every renderable scene has one immutable definition with these responsibilities:

- stable ID and post-unlock display name;
- `collectible` boolean (`false` only for Baseline Table);
- internal Mastery milestone for collectible entries, held outside the player view;
- ownership source and legacy ID aliases, if any;
- mode compatibility: `standard`, `battle2`, and `battle4`;
- art direction, palette, lighting, foreground exclusion zones, and preview framing;
- selected-scene asset list with hashes/sizes;
- static thumbnail renderer/resource;
- full scene renderer/resource;
- bounded idle, impact, make, miss, match-point, and victory reactions;
- reduced-motion substitutions;
- audio loop/sting IDs and mute behavior;
- cache/performance tier and cleanup hook.

The player-safe view of a locked arena is exactly:

```text
{ locked: true, symbol: "🔒", ariaLabel: "Locked" }
```

It contains no stable ID or compatibility hint. The player-safe view of an owned arena may contain only the fields required to identify, preview, select, and describe already-owned content. Milestones and future entries never cross this boundary.

### 4.3 Paint-only invariant

With the same match config, normalized inputs, gameplay seed, and event seed, changing only `visualArenaId` must produce identical:

- initial and per-frame physics state;
- collision bodies and categories;
- legal input windows;
- target/landing geometry;
- RNG calls and resolved event;
- verdict, score, lives, turn order, and match result;
- Arena Draft offer and selection.

Arena presentation randomness uses a separate deterministic presentation seed derived without consuming gameplay/event RNG. It may choose which spectator, light, fish, leaf, or prop reacts; it cannot choose whether a shot makes, misses, or unlocks something.

## 5. Exact Arena Select flow

### 5.1 Entry state

New match:

1. The player completes Setup and per-seat object/variant/personal-cosmetic choices.
2. Setup’s Start action validates all names, roster, mode, teams, and required touch capability.
3. The app creates an immutable `PendingMatchStart` snapshot but does **not** initialize physics or consume any seed.
4. Arena Select opens with source `new-match` and a return target of Setup.
5. The screen preselects a legal stage using the algorithm below.
6. **Play Now · {Arena}** commits the visual stage, prepares only that scene, runs the ready beat, then initializes the match exactly once.

New Arena rematch:

1. The completed result remains persisted and its rematch draft is frozen.
2. **New Arena** opens Arena Select with source `new-arena-rematch` and a return target of Game Over.
3. Roster, teams, order/rotation decision, mode, Cup length, lives, difficulty, feel, objects, variants, and personal cosmetics remain unchanged.
4. Back returns to the still-complete result screen. Play Now starts the rematch with only `visualArenaId` changed.

### 5.2 Preselection algorithm

Resolve in this order, with no RNG:

1. When source is Same Arena, retain the completed match’s visual arena if it remains owned and compatible.
2. Otherwise use `lastUsedVisualArenaByLayoutClass[standard|battle2|battle4]` if it is still owned and compatible.
3. Otherwise use `arena.baseline-table`.

Update last-used state only after Play Now successfully commits a match start. Browsing, Random, Back, a failed asset load, or Owner Test preview does not overwrite it. Store layout-class history so a four-lane choice does not erase a player’s ordinary preferred stage.

If a formerly selected arena becomes unavailable because Owner Test ended, Battle capability changed, a save import removed a corrupt unknown ID, or a definition was withdrawn, fall back silently to Baseline Table and announce `Baseline Table selected`. Never substitute an undiscovered collectible.

### 5.3 Screen composition

The visual design is an original **tabletop venue board**, not a copy of any existing fighting-game stage grid. Inspiration is limited to the understandable sequence “fighters first, stage second.” Do not copy another game’s hand cursor, card silhouette, selection stamp, announcer wording, typography, grid proportions, transition, sound, or branded scene composition.

Persistent regions:

- **Header:** Back, `ARENA SELECT`, and a concise already-known match context such as `Team Clash · 4 players` or `Battle · Four-Way`.
- **Hero preview:** one live selected arena, stage name, and compatibility/format note only when needed. It is noninteractive except for an explicit muted preview control if sound preview is ever approved.
- **Owned grid:** static/lazy thumbnails for every owned stage compatible with the pending mode, then at most one anonymous lock tile. The selected card shows text and shape/outline, not color alone.
- **Footer:** secondary **Random Unlocked** and primary **Play Now · {Arena}**. Back remains in the header; do not duplicate it in the footer.

Do not add filters, sorting, favorites, lore, feat hints, completion counts, or a second detail page in v1.12. Twenty-three maximum render definitions do not justify a settings-heavy browser.

### 5.4 Control behavior

- Selecting a card updates the hero preview and Play Now label; it never launches.
- Random Unlocked selects from the set of currently owned and compatible collectibles plus Baseline Table. With more than one candidate it excludes the current selection for that invocation, then chooses uniformly from the remainder.
- Random uses its own UI RNG/injectable QA source and never consumes gameplay, event, Cup Draft, Alien, or presentation reaction seeds.
- Random never selects a lock, unknown ID, withdrawn asset, non-Battle stage in Battle, or temporary Owner Test stage after test mode ends.
- Play Now is enabled from the first rendered frame because Baseline Table is always valid. Scene preview failure cannot strand the route; announce the failure and retain/fall back to Baseline Table.
- A pointer that selected or confirmed a stage must reach `pointerup`/`pointercancel` before gameplay accepts a new gesture. The ready beat then arms input only on a new pointer/key action.
- Back/Escape/Android hardware Back returns to the recorded origin and restores focus to its opener. It never discards setup or silently exits the APK.

### 5.5 Keyboard and assistive technology

- On route entry, focus the `ARENA SELECT` heading; returning from a preview error may focus its status message.
- Tab order is Back → owned grid → Random Unlocked → Play Now. The hero art is skipped unless it exposes a real control.
- The owned grid uses one roving tab stop. Arrow keys move spatially, Home/End move to first/last owned item, and Enter/Space selects without starting.
- The anonymous Locked tile is not selectable and is skipped by roving focus, but remains exposed to virtual cursor reading as exactly `Locked`.
- A polite live region announces `{Arena} selected`; do not announce every animation frame or repeat the full scene description.
- Every enabled action is at least 48×48 CSS px; primary controls are at least 64×64 at the 3840×2160 layout.
- Selection state has visible text/icon/outline, at least 3:1 non-text contrast, and is comprehensible in forced colors. Text meets 4.5:1 unless it qualifies as large text, then 3:1.
- At 200% text zoom, stage names wrap to two lines without hiding the selected state or actions. Longer localized names may wrap to three lines in the hero, not in a fixed-height inaccessible crop.

### 5.6 Ready beat

- Standard motion duration is **700 ms**; reduced motion duration is **250 ms**.
- It shows the owned stage name and match identity; Team/Battle additionally show team/lane ownership. With more than eight players, show team/group marks plus the full roster in accessible text rather than squeezing sixteen figures across the frame.
- Any local asset preparation lasting more than 100 ms is exposed as `Preparing {Arena}`. Loading cannot be hidden behind a longer cinematic.
- Once the selected scene is prepared, Enter/Space/tap may skip the remaining presentation but cannot become the first flip.
- No game/event/CPU RNG is consumed until the ready state commits. The ready state has no physics bodies and cannot accept a launch.

## 6. Responsive layout

| Viewport | Exact layout | Grid and actions | Preview budget |
|---|---|---|---|
| 360×740 phone | 56 px header, vertically scrolling main, 16:9 hero no taller than 184 px, safe-area-aware 72 px footer | Two columns; full card is a target; Random and Play Now each at least 48 px tall; footer never covers the last row | One live preview; static thumbnails enter within one viewport of scroll |
| 768×1024 tablet | 64 px header, hero above grid in portrait or 52/48 split in landscape | Four columns when width permits; 80 px footer | Same renderer, larger hero framing; no extra animation loops |
| 1280×720 smartboard | 56 px header, 72 px footer, body split 58% hero / 42% scrollable directory | Three columns in the directory; Back, Random, and Play Now reachable without body scroll | Hero remains at least 16:9; selected name and context readable at arm’s length |
| 1366×768 / 1920×1080 | Centered split with maximum readable measures; no full-page scroll outside the owned grid | Three/four columns respectively | Preview is capped independently from gameplay resolution |
| 3840×2160 | 104 px header, 112 px footer, content width capped at 2560 px and centered | Four columns; 64 px primary targets; 24 px body type | Preview backing store no larger than 2560×1440; do not allocate a second 4K canvas |

At every size the selected name and Play Now action remain visible while the grid scrolls. Horizontal carousel gestures are optional decoration only; all owned stages must be discoverable by vertical scrolling, pointer, wheel/trackpad, touch, and keyboard.

## 7. Mode and rematch behavior

### 7.1 Classic and Team Clash

- Every visual stage, including Baseline Table, is eligible because play uses the standard single arena composition.
- Team Clash stage palettes cannot reuse the active team colors as large competing score bands. Team/lane identity remains a HUD layer with stronger contrast than scenery.
- Game Over shows **Same Arena**, **New Arena**, **Change Setup**, and **Finish**. Same Arena is the fast rematch path; New Arena goes directly to Arena Select. Neither path changes the fair opener/rotation rule.

### 7.2 Cup

- Arena Select runs once before heat 1.
- The visual stage remains fixed through the whole Cup, including shootouts.
- Between heats, if enabled, the separate panel is titled **ARENA DRAFT — PHYSICS MODIFIER** and describes the symmetric physical effect. The selected visual stage remains named as `Stage: {Arena}`.
- A physics modifier may add an accessible overlay/telegraph on top of the scene, but it cannot replace `visualArenaId`, borrow stage ownership, or appear in Random Unlocked.
- Same Arena/New Arena appear after the overall Cup, not between heats. This intentionally rejects the current plan sentence permitting mid-Cup New Arena; the cost and ambiguity outweigh the limited variety benefit.

### 7.3 Battle

The v1.12 qualified set for both two- and four-lane Battle is exactly:

- `arena.baseline-table`
- `arena.rooftop`
- `arena.arcade`
- `arena.neon-grid`
- `arena.space-station`
- `arena.school-cafeteria`
- `arena.sports-locker-room`
- `arena.stadium-at-night`
- `arena.movie-soundstage`

Baseline Table is functional, so the collectible Battle subset contains eight stages. Other owned stages are omitted—not shown disabled—from Battle’s picker. The helper text may say `Battle shows lane-ready arenas`; it cannot name an undiscovered arena.

Battle-certified scenes provide:

- explicit two- and four-lane compositions, not one standard scene scaled into strips;
- identical lane width, launch zone, landing plane, meter area, camera scale, and foreground exclusion region;
- lane boundaries with at least 3:1 contrast against both adjacent scene regions;
- no moving prop crossing a launch, flight, meter, score, power-up, target, or sabotage-selection region;
- equal visual energy and particle density in every lane;
- no scene light or scoreboard that can be mistaken for a team, charge, or result indicator;
- a shared result reaction that cannot mask independent/same-frame verdicts.

Random Unlocked in Battle samples only this qualified set intersected with ownership. If only Baseline Table is eligible, Random keeps it and announces `Only Baseline Table is available for this Battle setup` without exposing why other content is hidden.

## 8. Art and ambient direction

### 8.1 Shared visual language

The target is premium high-school/adult tabletop sport: cinematic environmental illustration, tactile materials, restrained saturation, confident type, and broadcast-like clarity. Playfulness comes from credible environmental reactions, not elementary clip art, toy-like mascots, casino glitter, or constant confetti.

Every stage uses four independently bounded layers:

1. **Far atmosphere:** sky, horizon, exterior view, or deep architecture; slow/static and never information-bearing.
2. **Venue layer:** the location-defining props and architecture, kept outside the flight/HUD exclusion zones.
3. **Competition layer:** a consistently readable table edge, landing plane, walls/target when present, and neutral local lighting.
4. **Reaction layer:** one-shot responses to impact/result/victory, capped and cleared on route/match change.

Do not include real school/team logos, film properties, branded products, recognizable posters, copyrighted characters, real student likenesses, or faux gambling signage. Any diegetic scoreboard uses generic symbols or live game data and remains subordinate to the accessible HUD.

Arena Select itself is silent by default. Ambient audio begins in the user-initiated ready beat/match, respects mute immediately, and uses at most one looping bed plus three resident short reactions for the selected stage. No non-game screen autoplays a crowd or music loop.

### 8.2 Inherited arenas

| Arena | Authored upgrade | Bounded reaction | Competitive/reduced-motion rule | Battle |
|---|---|---|---|---|
| Baseline Table | Neutral competition studio, warm practical lights, dark acoustic wall, regulation table silhouette | One scoreboard tick and soft light lift on make | No particles or parallax; static state is nearly identical | Yes |
| Rooftop | Twilight city roof with parapet, HVAC forms, antenna silhouettes, and distant office windows | A few windows/light strips answer a result; distant fabric moves once | Skyline never crosses object silhouette; reduced motion freezes fabric | Yes |
| Arcade | Sophisticated after-hours arcade with cabinet rows, CRT bloom, carpet geometry, and a distant score wall | Cabinets ripple once from the impact point; make lights a short high-score motif | Avoid rapid flicker and casino styling; static cabinet glow in reduced motion | Yes |
| Moon Deck | Open lunar research platform with regolith, equipment shadows, and distant Earth | Fine dust puffs outside the table and a rover status light answers a make | Earth and dust are static in reduced motion; visual art never implies lower gravity | No |
| Ice Cave | Layered blue ice arches, mineral inclusions, and reflected cold light | A restrained sparkle travels through a distant ice seam | No falling shards, flash storms, or low-contrast white landing plane | No |
| Neon Grid | Abstract tournament volume with perspective grid, dark void, and controlled magenta/cyan accents | Grid energy travels away from the resolved lane | Lane/HUD colors override scenery; no pulsing faster than 3 Hz | Yes |
| Garden | Evening conservatory/courtyard with stone, mature plants, glass, and practical café lighting | Leaves move locally and one path light warms after a make | No cartoon flowers/insects; reduced motion uses a static light change | No |
| Space Station | Orbital observation bay, sealed Earth window, structural ribs, equipment rails, and neutral task lighting | Earth rotates extremely slowly; one equipment indicator and window reflection answer results | No floating prop in the flight path; static Earth in reduced motion; distinct from surface-based Mars | Yes |
| Volcano | Basalt competition platform with a distant caldera, ash-lit clouds, and heat-safe industrial railings | Caldera glow rises briefly and a far vent exhales after a major result | No full-screen red flash, foreground ash, or heat distortion over the object/landing plane | No |
| Storm Table | Sheltered broadcast platform during a distant storm with rain beyond glass and cloud depth | One distant lightning branch after a major result, never synchronized as a fake hit cue | No flash over 3 Hz; reduced motion uses a static cloud/light state | No |
| Aurora Stage | Arctic glass pavilion with dark snowfield, low architecture, and broad aurora bands | Aurora brightens and drifts once on victory | Distinct from Neon Grid/Ice Cave; reduced motion uses fixed layered bands | No |

### 8.3 Twelve new arenas

| Stable ID / arena | Premium scene direction | Result reaction | Legibility and reduced motion | Battle |
|---|---|---|---|---|
| `arena.school-cafeteria` — School Cafeteria | Modern secondary-school commons after hours: long laminate tables, stainless service line, campus-neutral pennants, wall clock, and late-day windows | Nearby trays rattle once; a short lunch-bell/crowd swell follows a make | No food fight, child caricatures, school logos, or moving props near lanes; static tray highlight in reduced motion | Yes |
| `arena.sports-locker-room` — Sports Locker Room | Collegiate-style locker room with timber benches, metal lockers, generic jerseys, tape, tactical board, and tunnel light | Locker/task lights chase once and the scoreboard increments | Generic sport identity only; scoreboard cannot resemble team HUD; static light state in reduced motion | Yes |
| `arena.mars-outpost` — Mars Outpost | Surface habitat interior with sealed red-planet windows, rover tracks, weather mast, distant lander, and warm task lights | Exterior dust moves away from impact and a habitat status bar answers the result | Art never changes gravity; no foreground dust; static exterior in reduced motion | No |
| `arena.grand-library` — Grand Library | Monumental but contemporary reading hall with tall shelves, rolling ladders, brass/green lamps, and upper gallery | Page edges lift subtly and one lamp line warms after a make | No loose books crossing play; avoid “magic school” references; static lamp cue in reduced motion | No |
| `arena.island-beach` — Island Beach | Regulation table on a timber pavilion above sand, restrained surf, palms, rock pools, and distant boats at golden hour | A wave line and distant birds answer major results | Horizon stays level; table never appears to move with waves; birds are static/absent in reduced motion | No |
| `arena.pirate-ship-deck` — Pirate Ship Deck | Original age-of-sail competition deck with rigging, canvas, brass instruments, lanterns, and open sea | Sail tension and one restrained cannon-smoke beat celebrate a make | Scoring table remains visually level and physically static; no deck roll, cannon flash, or rigging through the flight path | No |
| `arena.aquarium-tunnel` — Aquarium Tunnel | Curved glass gallery with schools of fish, rays, caustic light, and deep-water silhouettes | A local school parts from the impact vector and returns slowly | No strobing caustics over HUD/table; static fish arrangement in reduced motion | No |
| `arena.skate-park-at-sunset` — Skate Park at Sunset | Concrete bowls/rails beyond a dedicated competition platform, commissioned mural geometry, warm skyline, and distant spectators | One board rolls through the background after resolution; spectators give a short gesture | Board/spectator motion never enters flight path; freeze background action in reduced motion | No |
| `arena.rainforest-treehouse` — Rainforest Treehouse | Mature canopy architecture, timber/steel platforms, mist depth, distant falls, and restrained wildlife silhouettes | Leaves answer locally and one distant bird crosses after victory | No foreground insects/leaves; static mist and wildlife in reduced motion | No |
| `arena.haunted-hall` — Haunted Hall | Elegant old hall with portraits, chandeliers, moonlit windows, deep wood, and restrained uncanny details | One portrait glance/light change and distant thunder answer a major result | No jump scares, gore, sudden face fill, or rapid lightning; static portrait/light cue in reduced motion | No |
| `arena.stadium-at-night` — Stadium at Night | Championship table on a field-level platform with tunnel, stands, restrained ribbon boards, and a live generic scoreboard | Crowd/ribbon wave and score-light burst celebrate makes and victory | Crowd remains texture at distance; lane and score colors dominate; static ribbon in reduced motion | Yes |
| `arena.movie-soundstage` — Movie Soundstage | Visible original flats, practical lighting grid, camera rail, neutral props, and crew silhouettes around a competition set | A clapboard closes after resolution and practical lights shift for a make | No real studio/franchise marks; rail/crew stay outside lanes; static clapboard card in reduced motion | Yes |

The first art-production gate should approve Baseline Table, School Cafeteria, Aquarium Tunnel, and Stadium at Night at phone and 1280×720. Together they test neutral clarity, familiar material depth, atmosphere/transparent layers, and four-lane crowd complexity before the remaining scenes scale out.

## 9. Mastery XP and arena progression

### 9.1 Why Mastery XP is preferable to the qualifying-win ladder

| Model | Strength | Failure mode | Decision |
|---|---|---|---|
| Qualifying wins | Very simple and already persisted | A losing human contributes nothing; players can prefer weak CPUs or short/large-roster configurations; long formats feel disproportionately unrewarded; it measures outcome more than learning | Replace as the active progression input; retain only for migration/audit |
| Hidden arena feats | Strong thematic connection | Several duplicate existing achievements, depend on rare/high-skill conjunctions, cannot be reconstructed reliably from every old save, and can depend on optional modes/hardware | Do not gate arenas with feats |
| Device-wide Mastery XP | Completed losses contribute; bounded skill can matter; one device pool suits local party play; format/roster normalization is explicit | More rules to test; local-only data cannot prevent a determined owner from editing storage; poor formulas can reward idling or long matches | Adopt with the exact bounded formula below |

### 9.2 Eligibility

A session awards Mastery XP only when all are true:

- a recognized local competitive match reaches its legitimate terminal result;
- at least one human-controlled participant resolved a manually launched flip;
- the record has a unique match ID not already credited;
- the session is not Practice, Physics Lab, forced-event, simulated, test data, Owner Test, online/imported-as-new, or AI-only;
- the match was not invalidated by a fatal state or rules error.

Classic/Team/Battle award once at match completion. Cup awards once after the overall series, never per heat, Arena Draft, or shootout turn. A completed human loss qualifies. An abandoned match awards zero because otherwise start/quit becomes the optimal farm.

### 9.3 Exact per-match formula

Let:

- `h` = count of manually launched, human-controlled flips that reached a verdict, capped at 6;
- `a` = `min(1, h / 4)`, the short-match activity factor;
- `m` = ordinary no-event human makes among those flips;
- `c` = ordinary no-event cap makes, a subset of `m`;
- `o` = 10 when a human player/team wins, 5 for a valid draw, otherwise 0.

Then:

```text
completionXP    = round(30 × a)
participationXP = 4 × h
skillXP         = min(16, 2 × m + 2 × c)
resultXP        = round(o × a)
matchXP         = min(80, completionXP + participationXP + skillXP + resultXP)
```

Rules:

- CPU flips never increase `h`, `m`, or `c`.
- Event-modified and automatic outcomes can count as human participation when a human launched them, but add zero skill XP. This prevents rare-event luck from dominating while still crediting the completed match.
- Roster size, AI count, starting lives, elapsed time, turns beyond the first six human flips, Cup heats, Team rounds, Battle heats, rematches, and difficulty do not multiply XP.
- A cap adds only two extra points over the ordinary-make credit and skill is capped at 16; repeatedly engineering cap/event conditions cannot dominate completion.
- Mastery XP is device-wide and credited once, not once per human seat. Every human’s eligible actions may contribute to the same capped `h/m/c` totals.
- The result screen shows only earned components such as `Completed match +30`, `Participation +24`, `Skill +8`, `Result +10`, and `Mastery Level 63`. It does not show a future unlock, endpoint, threshold, XP remaining, or total track length.

Examples:

| Completed outcome | `h / m / c` | XP | Explanation |
|---|---:|---:|---|
| Very short human loss | 2 / 0 / 0 | 23 | 15 completion + 8 participation; still contributes without making instant matches optimal |
| Normal human loss | 6 / 2 / 0 | 58 | 30 + 24 + 4 + 0 |
| Normal human win | 6 / 3 / 0 | 70 | 30 + 24 + 6 + 10 |
| Skilled cap win | 6 / 4 / 2 | 78 | 30 + 24 + 12 + 10 |
| Any very long/large match | any | ≤80 | Hard cap prevents duration/roster farming |

### 9.4 Exact level curve

Fresh saves start at Mastery Level 1 with 0 XP. For current level `L` from 1 through 199:

```text
XP to reach L + 1 = min(55, 30 + 5 × floor((L - 1) / 25))
```

This yields:

| Current levels | XP per next level |
|---|---:|
| 1–25 | 30 |
| 26–50 | 35 |
| 51–75 | 40 |
| 76–100 | 45 |
| 101–125 | 50 |
| 126–199 | 55 |

Level 50 requires 1,590 cumulative XP; Level 200 requires 9,070. A typical completed match in the examples advances roughly one to two levels. These values are product hypotheses and must pass the playtime/anti-farm study before freezing; the formula, not session duration, controls fairness across formats.

At Level 200, XP may continue to be counted for local statistics only if useful, but the UI remains `Mastery Level 200` and never implies a hidden Level 201 reward.

### 9.5 Exact arena milestones

Baseline Table is always available and never produces an unlock reveal. The collectible arena sequence is:

| Mastery Level | Stable ID | Arena | Rationale for interest curve |
|---:|---|---|---|
| 9 | `arena.rooftop` | Rooftop | First vivid venue after the baseline |
| 19 | `arena.arcade` | Arcade | Familiar social energy |
| 29 | `arena.moon-deck` | Moon Deck | First large fantasy jump |
| 39 | `arena.ice-cave` | Ice Cave | Material/lighting contrast |
| 49 | `arena.neon-grid` | Neon Grid | Competitive abstract stage immediately before Lab |
| 59 | `arena.garden` | Garden | Calm reset after the Level 50 training feature |
| 69 | `arena.space-station` | Space Station | Flagship orbital scene |
| 79 | `arena.volcano` | Volcano | Higher spectacle |
| 89 | `arena.storm-table` | Storm Table | Dramatic atmosphere |
| 99 | `arena.aurora-stage` | Aurora Stage | First-century visual peak |
| 104 | `arena.school-cafeteria` | School Cafeteria | Relatable new collection opener, soon after 99 |
| 112 | `arena.sports-locker-room` | Sports Locker Room | Competitive identity |
| 120 | `arena.island-beach` | Island Beach | Bright tonal change |
| 128 | `arena.grand-library` | Grand Library | Quiet architectural contrast |
| 136 | `arena.skate-park-at-sunset` | Skate Park at Sunset | Motion and youth-culture energy without childish art |
| 144 | `arena.movie-soundstage` | Movie Soundstage | Meta theatrical reveal |
| 152 | `arena.pirate-ship-deck` | Pirate Ship Deck | Mid-track adventure peak |
| 160 | `arena.aquarium-tunnel` | Aquarium Tunnel | Atmospheric/depth showcase |
| 168 | `arena.rainforest-treehouse` | Rainforest Treehouse | Organic vertical spectacle |
| 176 | `arena.haunted-hall` | Haunted Hall | Restrained late-track tension |
| 184 | `arena.mars-outpost` | Mars Outpost | Foreshadows the final science-fiction capstone without naming it |
| 192 | `arena.stadium-at-night` | Stadium at Night | Championship-scale final arena before Level 200 |

The remaining reward levels are reserved for the separately frozen object and personal-visual sequence. They must be interleaved so the track does not contain long empty runs or mass-produced filler. This arena spec does not invent those non-arena assets. If the complete mixed sequence cannot meet the same quality bar, reduce/replan scope explicitly rather than shipping recolors or placeholder rewards.

Physics Lab unlocks at Level 50. Alien and INSANE MODE unlock together at Level 200. Those feature anchors are not arena entries and never appear in Arena Select before they are legitimately owned.

### 9.6 Why the old feat mapping should not gate access

| Proposed feat in `v112-plan.md` | Audit | Recommendation |
|---|---|---|
| Complete an 8+ participant match | Bounded, but roster/time-heavy and historical completion may be missing from compact saves | Keep as a party achievement/stat moment; do not gate School Cafeteria |
| Win Team Clash | Fair but duplicates `team-first-win`/Team Debut | Existing achievement is enough; Locker Room uses Level 112 |
| Native-Alien bank-and-ring make | Now circular because Alien is the Level 200 capstone | Invalid as a pre-200 Mars gate; Mars uses Level 184 |
| Complete five modes/formats | Taxonomy is undefined and may depend on optional Battle; old saves cannot always reconstruct it | Do not gate Grand Library; use Level 128 |
| Win Classic after reaching one life | Meaningful, but starting at one is a loophole and it duplicates Iron Will | Preserve/fix the achievement independently; Island Beach uses Level 120 |
| Cap during sudden death | A rare high-skill conjunction that duplicates Sudden Cap and can create grind | Do not gate Pirate Ship |
| Ten lifetime cap landings | Bounded and skill-based but inaccessible for some players and duplicates cap milestones | Keep as local mastery evidence, not Aquarium access |
| Ordinary two-rotation make | Clear and non-random but duplicates Double Rotation | Keep the achievement; Skate Park uses Level 136 |
| Use fifteen objects | Deterministic but depends on another reward sequence and duplicates Object Explorer | Keep the achievement; Rainforest uses Level 168 |
| Cup reverse sweep | Legitimate but long/outcome-dependent and duplicates Reverse Sweep | Keep the achievement; Haunted Hall uses Level 176 |
| Win an overall Cup | Fair but duplicates First Cup | Keep the achievement; Stadium uses Level 192 |
| Four-player match with distinct objects | Social and understandable after discovery, but group/inventory dependent and hard to backfill | Candidate party achievement only; Movie Soundstage uses Level 144 |

Removing feats as gates also eliminates ambiguous cases where one result simultaneously awards an achievement, ladder item, and arena and then competes with the rematch moment. Achievements can still celebrate those plays without controlling access.

### 9.7 Migration and no-relock rules

Migration is monotonic and idempotent:

1. Reconcile the legacy v1.11 state once using its old catalog so any already-earned 1–100 entitlement is repaired before conversion.
2. Preserve the raw legacy `qualifyingWins` count for audit; never reduce it.
3. Set `legacyLevelFloor = clamp(qualifyingWins, 1, 200)` and `masteryXP = max(existingMasteryXP, cumulativeXPRequired(legacyLevelFloor))`.
4. Union every legitimate `ownedObjectId`, `ownedCosmeticId`/arena ID, feature ID, achievement ID, and claimed reward ID into the new state. Unknown future-safe IDs remain preserved even if they cannot render.
5. Grant full Physics Lab when the resulting level is at least 50. Preserve it at any lower level if already legitimately owned.
6. Grant Alien and INSANE MODE only at Level 200 for new progression. If either was legitimately owned under v1.11’s win-100 contract, preserve it individually at the migrated lower level, mark its old claim as grandfathered, and never re-lock or re-announce it.
7. Reconcile all new deterministic rewards at or below the migrated level. Persist them before queuing presentation. A high-count old save may receive several new arenas; show one compact summary and let the owner open/skip individual previews rather than blocking through a long forced queue.
8. Preserve any recognized new arena already legitimately awarded by an interim build, even if its owner’s current level is below the final milestone. Never remove it or force the old feat again.
9. Owner Test exposes all stages/features only through a temporary safe view. It changes no XP, level, ownership, claims, last-used production selection, or migration floor.

`collection-play-all-arenas` currently says “Play in all ten arenas.” Preserve its ID and earned state; change its future description/logic to **Play in ten collectible arenas** rather than raising the requirement to 22 or counting Baseline Table. Previously earned copies remain earned.

## 10. Offline, cache, and lifecycle contract

- All encoded scene modules, fonts used by the existing app, thumbnails, audio beds/stings, and fallback assets are versioned in one arena asset manifest with byte size and hash.
- PWA installation atomically caches the full manifest so every owned stage remains usable in airplane mode. Runtime decodes only the selected scene and nearby thumbnails.
- The APK build copies and verifies every manifest entry under `android_asset`; unzip/inventory comparison must fail the build when one is missing or has the wrong hash.
- No stage loads a remote map, weather service, geography endpoint, CDN image, web font, analytics beacon, or streaming audio.
- Arena Select has at most one live preview `requestAnimationFrame` loop. It is cancelled on Back, Play Now, page hide, route change, and error.
- The thumbnail cache holds at most eight decoded 320×180-equivalent images plus the selected scene. Least-recently-used eviction clears bitmap/canvas references.
- The live selector preview backing store is capped at 2560×1440 even on a 4K display. Gameplay uses its separately qualified canvas policy.
- The complete compressed arena-specific payload is capped at **12 MiB**, and no single arena’s encoded art/audio exceeds **750 KiB**, absent a written owner waiver backed by load/memory evidence.
- A selected stage asset failure is recoverable: log locally, announce it, switch the pending selection to Baseline Table, and allow Play Now. Do not start a partially rendered named arena.
- Background/resume restores the exact selector origin, pending match snapshot, selection, grid scroll, and focused card without consuming RNG. If ownership changed on import while suspended, rerun the deterministic preselection algorithm.

## 11. Acceptance tests

### 11.1 Catalog, secrecy, and progression

| ID | Test | Pass condition |
|---|---|---|
| `ARENA-CAT-01` | Enumerate internal definitions | Exactly 23 stable unique render definitions: one non-collectible Baseline Table, ten inherited collectibles, twelve new collectibles |
| `ARENA-CAT-02` | Validate inherited IDs | All ten existing IDs remain byte-for-byte stable and retain Levels 9–99; no save loses ownership |
| `ARENA-CAT-03` | Validate new IDs/milestones | The twelve IDs resolve exactly at Levels 104, 112, …, 192 as listed; duplicate claims award nothing |
| `ARENA-CAT-04` | Inspect every locked safe view and rendered DOM/accessibility tree | Only `{locked, symbol, ariaLabel}` crosses the public boundary; rendered text/name is exactly `🔒`/`Locked`; no ID, milestone, future name, image, silhouette, total, ordinal, XP remaining, or endpoint appears |
| `ARENA-CAT-05` | Exercise 0/1/11/22 undiscovered collectibles | Production renders zero or one aggregate lock tile, never a count-equivalent set; Owner Test may show all as explicitly test-only |
| `MASTERY-01` | Evaluate the level curve | Cumulative XP is exactly 1,590 at Level 50 and 9,070 at Level 200; boundary XP advances at the exact threshold, including multi-level awards |
| `MASTERY-02` | Run every eligibility class | Completed human win/loss can award; CPU-only, Practice, Lab, forced, Owner Test, simulated, duplicate match ID, abandoned, and invalid sessions award exactly zero |
| `MASTERY-03` | Formula fixtures | The four examples above resolve to 23/58/70/78 and every legal fixture remains within 0–80 XP |
| `MASTERY-04` | Normalization matrix | Holding `h/m/c/outcome` fixed yields identical XP for 2–16 players, 0–15 CPUs, 3/5/10/20/100 lives, Short/Full Cup, Team round counts, and Battle heat counts |
| `MASTERY-05` | Rare/automatic events | A human-launched event can contribute participation; its make/cap adds zero skill XP; automatic Win/Loss cannot exceed the same completion/participation cap |
| `MASTERY-06` | Crash/import/replay | One match UUID credits once across retry, crash/resume, export/import, and duplicate result delivery |
| `MIGRATE-01` | Migrate wins 0, 1, 8, 9, 49, 50, 99, 100, 150, 199, 200, and >200 | Count is preserved for audit, level floor/XP are monotonic, all old ownership remains, and new milestones at/below level reconcile exactly once |
| `MIGRATE-02` | Migrate legitimate v1.11 Alien/INSANE/Lab at old win 100 | All remain usable at migrated Level 100; no relock/reveal replay; Level 200 supplies no duplicate claim |
| `MIGRATE-03` | Migrate partial/corrupt-but-parseable ownership | Known legitimate owned IDs are unioned, unknown safe IDs preserved but not rendered, invalid stage selection falls back to Baseline without deletion |

### 11.2 Route and control behavior

| ID | Test | Pass condition |
|---|---|---|
| `ARENA-FLOW-01` | New match from every supported Setup mode | Validation creates one pending snapshot; Arena Select opens before physics/RNG; Back restores all setup fields/focus; Play Now starts once |
| `ARENA-FLOW-02` | Fresh save | Bottle and Baseline Table are the only initial selectable object/stage; Play Now is immediately enabled; no collectible name/art leaks |
| `ARENA-FLOW-03` | Last-used matrix | Owned compatible last stage preselects by standard/battle2/battle4 class; unknown, locked, or incompatible last stage deterministically selects Baseline |
| `ARENA-FLOW-04` | Random with 1, 2, and many candidates over fixed injected UI seeds | Only owned compatible candidates occur; current is excluded when alternatives exist; distribution over remainder is uniform within the frozen statistical tolerance; gameplay/event RNG snapshots do not change |
| `ARENA-FLOW-05` | Input handoff | Card pointer/keyboard confirmation never launches; Play Now requires an explicit action; its pointer cannot become a flip; new input is armed only after ready completion and fresh input |
| `ARENA-FLOW-06` | Back methods | Visible Back, Escape, browser history, and Android hardware Back return to the correct source without app exit or state loss; focus returns to opener |
| `ARENA-FLOW-07` | Asset failure | Preview error announces once, cancels its loop, selects Baseline, keeps Play Now usable, records no false ownership, and creates no network retry storm |
| `ARENA-FLOW-08` | Resume/rotation/resize | Pending snapshot, selected arena, scroll, and focus restore exactly; no duplicate listener, ready beat, match, or XP award |

### 11.3 Rematch and mode behavior

| ID | Test | Pass condition |
|---|---|---|
| `ARENA-MODE-01` | Classic and Team across all 23 scenes | Every scene is selectable; same normalized match trace is physics-identical; team HUD remains dominant and readable |
| `ARENA-MODE-02` | Short/Full Cup including shootout | One visual stage persists through all heats; between-heat Arena Draft changes only `arenaModifierId`; both names remain unambiguous; Same/New appears only after overall Cup |
| `ARENA-MODE-03` | Same Arena rematch | Selector is bypassed, selected stage and other setup persist, fair opener/rematch rules still apply, and a short ready beat fences input |
| `ARENA-MODE-04` | New Arena rematch then Back/Start | Opens selector directly; Back restores completed result; Play Now changes only visual stage and preserves roster/team/order decision/lives/mode/objects/variants/cosmetics |
| `ARENA-MODE-05` | Battle capability at two and four contacts | Only the nine listed render definitions (Baseline + eight collectible) appear if owned; each has explicit two/four-lane layout; no incompatible stage appears in grid or Random |
| `ARENA-MODE-06` | Battle simultaneous outcome permutations | Every lane retains equal geometry/feedback; same-frame and unequal settle outcomes remain legible; shared reaction cannot hide individual results |
| `ARENA-PHYS-01` | Cross product of all 23 visual IDs with frozen input/game/event seeds | Physics bodies, per-frame numeric trace, RNG cursor, verdict, score, rewards, and Arena Draft offer are byte-equivalent except presentation-only state |

### 11.4 Visual and accessibility evidence

Capture Baseline plus all 22 collectibles at `360×740`, `768×1024`, `1280×720`, `1366×768`, `1920×1080`, and `3840×2160` in:

- Arena Select selected/unselected/lock/Random states;
- standard gameplay idle, airborne, contact, make, miss, match point, and victory;
- reduced motion and muted audio;
- 200% text zoom, forced colors/high contrast, and long localized names;
- two- and four-lane layouts for the nine Battle render definitions;
- representative heavy event/Arena Draft overlay on the heaviest qualified stage.

Pass conditions:

- no horizontal page overflow or footer-obscured final card;
- no HUD, object, target, meter, lane, result, or landing-plane obstruction;
- text contrast meets 4.5:1 normal/3:1 large; selection/lane boundaries meet 3:1 non-text contrast;
- no information uses color, sound, motion, or haptic alone;
- no flash or full-screen contrast reversal exceeds three per second;
- reduced motion removes parallax, camera shake, drifting props, rapid particles, and repeated crowd/fish/wildlife movement while keeping stage identity and result meaning;
- every stage is visually distinguishable in grayscale by silhouette/material/layout, not merely hue;
- owner approves the four-stage art gate before the remaining scenes are produced.

### 11.5 Exact performance and memory gates

Measure release builds on the named reference phone, 1280×720 smartboard, 1080p desktop, and 4K smartboard; record hardware/OS/WebView/browser/build SHA.

| ID | Load | Pass condition |
|---|---|---|
| `ARENA-PERF-01` | Open Arena Select from cached local Setup | Controls and valid Play Now state within 250 ms; selected live preview first frame within 500 ms cold-local and 200 ms warm; no task over 50 ms after the first preview frame |
| `ARENA-PERF-02` | Rapidly select all 23 scenes twice | Selection text/outline/live-region updates within 100 ms p95; exactly one preview RAF loop; no stale frame/name; no uncaught error |
| `ARENA-PERF-03` | Scroll full owned grid on phone/1280/4K | Only selected scene animates; at most eight decoded thumbnails retained; p95 scroll frame ≤22 ms at 1080p and no one-second window below 45 FPS at 4K |
| `ARENA-PERF-04` | Five complete selector sweeps, Back/return, then forced GC where tooling permits | Arena-specific retained heap ≤48 MiB above post-boot baseline and growth from sweep 2 to sweep 5 ≤5 MiB; no retained orphan canvases/audio/listeners |
| `ARENA-PERF-05` | Ordinary selected-stage gameplay | 60 FPS target at 1080p with p50/p95/worst recorded; arena does not increase input-to-feedback p95 by more than 8 ms versus Baseline |
| `ARENA-PERF-06` | Heaviest stage + heaviest eligible event at 4K | At least 45 FPS; no lane-specific frame/input/resolve-latency bias; four-lane active-object ceiling remains four |
| `ARENA-PERF-07` | Ready transition | Standard beat is 700±50 ms, reduced motion 250±50 ms, preparation delay is announced after 100 ms, and no hidden wait extends the beat |
| `ARENA-PERF-08` | Asset budget | Total compressed arena payload ≤12 MiB; each stage ≤750 KiB; preview ≤2560×1440; APK/PWA manifest hashes exactly match release assets |

If a named stage cannot pass its budget without losing the approved art direction, the owner reviews a measured exception. Do not silently lower frame/input gates or preload/decode every stage.

### 11.6 Offline and package tests

1. Install the PWA online, close it, disable all networking, cold-launch, browse/select every owned stage, start/finish/rematch, rotate, and relaunch. Every asset resolves from the release cache with zero network dependency.
2. Interrupt a service-worker update after each arena asset. The previous complete release remains active; no partial catalog or new code/old art combination controls the page.
3. Build the signed APK, unzip it, and compare the arena asset manifest, hashes, count, and source SHA. Any missing/corrupt asset fails the build.
4. On the APK in airplane mode, cold-launch and repeat the full PWA matrix. All requests remain under `file:///android_asset/`; no stage makes an external request.
5. Upgrade a v1.11 PWA and APK save at each migration boundary. Baseline is available, last-owned stage persists, grandfathered features remain, and deferred new reward presentation never blocks Arena Select or rematch.
6. Soak 1,000 match/selector/rematch cycles with every scene and repeated page background/resume. Cache, RAF, listener, audio, and heap counts remain bounded and no match receives duplicate XP.

## 12. Required owner decisions recorded by this spec

The recommended answers are:

- **Progression model:** use bounded device-wide Mastery XP, not raw wins or arena feats.
- **Fresh content:** Bottle + plain personal presentation + Baseline Table only.
- **Feature anchors:** full Physics Lab at Level 50; Alien + INSANE MODE at Level 200; grandfather all legitimate old entitlements.
- **Arena count language:** one functional baseline plus 22 collectible arenas; never call this “22 total renderable stages.”
- **Arena milestone mapping:** the exact 22-level table in §9.5.
- **Hidden feat proposal:** reject as access gates; retain appropriate feats as existing achievements/stat celebrations.
- **Cup visual changes:** visual arena fixed for the whole Cup; physics Arena Draft remains between heats; Same/New only after the overall series.
- **Start action:** one primary **Play Now · {Arena}**, which is the explicit Start/Confirm control.
- **Random:** player-initiated, selection-only, owned+compatible, separate RNG, no automatic start.
- **Battle scope:** Baseline plus the exact eight collectible stages listed in §7.3 are initially certified for two/four lanes; all other scenes remain available in standard turn-taking modes.
- **Space Station:** orbital observation bay with a real sealed Earth-view window, visually and physically distinct from Mars Outpost.
- **Production gate:** approve four representative scenes and the measured cache/render architecture before scaling all 23.

The remaining unresolved dependency is the exact full object/personal-visual Mastery sequence. It must reserve the arena levels above, preserve every legitimate old entitlement, and meet the same secrecy and quality requirements; it should be frozen in the central progression contract before implementation begins.
