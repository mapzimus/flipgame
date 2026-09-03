# Flip Game — Handover & Project Guide

A browser-based bottle-flip party game (a digital version of Max's college "bottle
game"), built as an installable, offline PWA and headed for a classroom **Android
smartboard panel**.

| | |
|---|---|
| **Repo** | https://github.com/mapzimus/flipgame (public, branch `master`) |
| **Live site** | https://mapzimus.github.io/flipgame/ (GitHub Pages, HTTPS) |
| **Local path (this machine)** | `C:\Users\HoweM\repos\flipgame` |
| **Stack** | Vanilla JS + HTML5 Canvas, Matter.js 0.19 (vendored), Pointer Events, PWA |
| **No build step** | Plain files served statically. No npm, no bundler. |

---

# PART 1 — GET THE APK (do this first)

The target is an **Android panel** (standalone Android, runs apps). The game is
already a PWA and the live site is already PWABuilder-ready (manifest + icons +
service worker all serving).

## ⚠️ About the school WiFi (why it didn't work, and the fix)

Two different network steps can get blocked:

1. **Building the APK** (PWABuilder must fetch `mapzimus.github.io/flipgame`).
   → **Do this step at home / on open WiFi.** It has nothing to do with the panel.
2. **The panel loading the game.** The PWABuilder APK is a "Trusted Web Activity" —
   it loads the **live site at runtime**, and the service worker caches it for
   offline use *after the first successful load*. So the panel needs to reach
   `github.io` **once**. If the school network blocks GitHub entirely, see
   **Option C (fully offline)** below.

**Simplest reliable plan:** build + install the APK at home, **launch it once on
open WiFi** so the service worker caches everything, then it runs offline at school
even if the network blocks it.

## Option A — Generate a real .apk with PWABuilder (recommended)

Do this on any computer with normal internet (not the school WiFi):

1. Go to **https://www.pwabuilder.com**, paste `https://mapzimus.github.io/flipgame/`,
   click **Start**. It scans the manifest/service worker (should be all green).
2. **Package For Stores → Android → Generate Package.**
3. Signing key = **New** ← important: gives a **signed, installable** APK. Write
   down the keystore password/alias it shows.
4. **Download the zip.** Inside:
   - `*.apk` ← **this is the one you install** (signed test build)
   - `*.aab` ← ignore (Google Play only, can't sideload)
   - `signing.keystore` + `signing-key-info.txt` ← **save these** (needed to ship updates)
   - `assetlinks.json` ← optional (see step 7)
5. Get the `.apk` onto the panel: email it to yourself / Google Drive / USB stick,
   then open it on the panel.
6. On the panel: **Settings → Apps → Special access → Install unknown apps** →
   enable for the browser/file-manager you used → tap the `.apk` → **Install**.
   - ⚠️ Managed/school panels sometimes block this by policy. If the toggle is
     greyed out, use **Option B**.
7. *(Optional, removes the little address bar)* commit the zip's `assetlinks.json`
   to `/.well-known/assetlinks.json` in this repo, push, reinstall.

## Option B — Install as a PWA from the panel's browser (zero APK)

On the panel, open `https://mapzimus.github.io/flipgame/` in Chrome →
**⋮ menu → Install app** (or "Add to Home Screen"). Launches fullscreen, works
offline after first load, auto-updates. Try this first — it's 10 seconds and needs
no sideloading permission.

## Option C — Fully self-contained offline APK (school-network-proof) ✅ READY

This APK has the game files **bundled inside** (a native WebView wrapper), so it
**never touches the network** — immune to any school-WiFi block. It's auto-built in
the cloud (GitHub Actions, no local Android SDK).

**Download the latest build (do this at home / on open WiFi):**
> https://github.com/mapzimus/flipgame/releases/download/apk-latest/flipgame-offline.apk

Then sideload it onto the panel (email/Drive/USB → enable "Install unknown apps" →
tap the `.apk`). It's debug-signed, which is fine for sideloading. It launches
fullscreen, landscape, and keeps the screen awake.

**How it rebuilds:** every push to `master` re-runs the build (or trigger it manually
from the repo's **Actions → Build offline APK → Run workflow**). The download link
above always points at the newest build (`apk-latest` release). Source lives in
`android/` and `.github/workflows/build-apk.yml`.

**This is the most robust option for a locked-down school network** — prefer it if
you're unsure whether the panel can reach the internet.

## After it's installed — TEST THE FLICK ON THE PANEL

The flick reads your gesture's **peak velocity**. The sweet spot was tuned on a
mouse/touchpad. Big IR/infrared touch panels sample touch more coarsely, which can
shift the feel. **Do a few test flips first.** If flips consistently *under-* or
*over-rotate* on the panel, that's a one-number tune — see `POWER_SPEED` /
`SPIN_RANGE` in Part 6.

---

# PART 2 — WHAT THE GAME IS

A bottle is flicked with a wrist-flick gesture (flick **up**). A clean **360° flip
landing upright = MAKE**. Rules (Max's own, not standard bottle-flip):

- **2–8 players**, **10 lives** each, pass-and-play on one device.
- **Point count** stacks +1 on every make (shared stake). A **miss costs `pointCount`
  lives**, then resets the count to 1.
- **Personal streak:** 2 consecutive makes = **Heating Up**; 3 = **ON FIRE**.
- **ON FIRE:** that player keeps flipping; each make = **+1 life** (no stake), a miss
  just ends the run with **no penalty**.
- **Elimination** at 0 lives; **last player standing wins**; winner starts next game.
- **Modes:** local pass-and-play, **vs CPU** (Easy/Med/Hard), and **Practice** (solo).

---

# PART 3 — RUN IT LOCALLY (on your other computer)

```bash
# 1. Clone
git clone https://github.com/mapzimus/flipgame.git
cd flipgame

# 2. Serve it (any static server; Python is simplest)
python -m http.server 5174
#   → open http://localhost:5174

# 3. Set your git identity (so commits aren't tagged with the school account)
git config user.name  "mapzimus"
git config user.email "mhowe.gis@gmail.com"
```

- **No install/build needed** — it's plain files. Matter.js is vendored at
  `js/vendor/matter.min.js` (no CDN, no internet needed to run).
- The **service worker does NOT register on localhost** (by design), so local edits
  show on a normal reload — but the dev server doesn't send cache headers, so if you
  see a stale file, **hard-reload** (Ctrl+Shift+R).

---

# PART 4 — ARCHITECTURE & FILE MAP

```
flipgame/
├── index.html          Setup + game + game-over screens; loads scripts + SW registration
├── manifest.json       PWA manifest (name, icons, standalone, orientation:any)
├── service-worker.js   Offline precache. BUMP CACHE_NAME on every release (see Part 7)
├── .nojekyll           Tells GitHub Pages to serve files as-is
├── css/style.css       All styling (setup, HUD, player cards, flavor swatches, animations)
├── icons/              icon-192/512 + 512-maskable (drawn with GDI+, not photos)
└── js/
    ├── game.js         RULES + state machine (SETUP→TURN_START→EVALUATING→RESULT→…). Pure logic.
    ├── physics.js      Matter.js world, bottle body, flick→launch, landing detection, liquid sim
    ├── input.js        Pointer flick capture (peak-velocity, robust to pause-before-release)
    ├── renderer.js     All canvas drawing (bottle, world-level liquid, walls, HUD glow, particles)
    ├── audio.js        Synthesized WebAudio SFX (no asset files)
    ├── main.js         Game loop + wiring: setup UI, state callbacks, HUD, AI turns, sound triggers
    └── vendor/matter.min.js   Matter.js 0.19 (pinned/vendored for offline + determinism)
```

**Load order (in index.html):** matter → game → physics → input → renderer → audio → main.

**Design boundary that matters:** `game.js` is pure serializable state/rules with **no
rendering or DOM**. That's deliberate — it's what makes online multiplayer (Part 9)
a thin add-on rather than a rewrite.

---

# PART 5 — FEATURES & WHERE THEY LIVE

| Feature | Files | Notes |
|---|---|---|
| Flick input | `input.js`, `physics.js applyFlick` | peak gesture velocity → launch + spin |
| Landing detection | `physics.js checkLanding` | waits for a TRUE full stop (see Part 6) |
| 360° requirement | `physics.js step` | tracks angle traveled since launch (`hasFlipped`) |
| World-level liquid | `renderer.js drawBottle` | clip to tilted bottle, counter-rotate, fill world-horizontal |
| Per-player flavors | `main.js FLAVORS`, `renderer.js`, `game.js` | 9 colors; liquid = current player's color |
| Practice mode | `game.js` (`practice`), `main.js` | solo, stats HUD, never ends |
| AI opponents | `main.js aiFlick` + `onTurnStart`/`onOnFire` | CPU aims near sweet spot; difficulty = error |
| Audio | `audio.js`, triggers in `main.js` | unlocks on first user gesture (start/flick) |
| Big lives HUD | `main.js updateHUD`, `css .p-lives-num` | red at ≤3 lives; classroom-readable |
| Crisp on big screens | `main.js resize` | devicePixelRatio scaling (cap 2) |
| Walls | `physics.js init`, `renderer.js drawWalls` | side walls; bottle caroms off them |

---

# PART 6 — PHYSICS TUNING REFERENCE (the knobs)

All in `js/physics.js` unless noted. These are the dials for "feel":

**Flick → launch (`applyFlick`)**
- `POWER_SPEED = 4000` — flick px/s that maps to full power. **Sweet spot ≈ 2100 px/s
  peak (~95% make); usable window ~1800–2400.** Raise this if arm-swings on the panel
  overshoot (maps a faster flick to the same power).
- `SPIN_BASE = 0.140`, `SPIN_RANGE = 0.100` — spin from soft→hard flick (~0.8→~1.35
  turns). Lower `SPIN_RANGE` to flatten the difficulty curve (wider make window).
- `launchY = -(16 + power*5)` — fairly steady airtime so the skill is *spin*, not height.

**Randomness (`applyFlick`)** — "slightly more, anyone's game"
- `jSpin` ±12% (the `0.24`), `jLaunch` ±6% (the `0.12`), `jDrift` ±1.2px.
- **Landing kick** (in `step`): on first ground contact the sloshing liquid nudges the
  bottle — `liquid.vel*0.06 + ±0.16`. This is the "almost stuck then falls" drama.

**Landing detection (`checkLanding`)** — the false-miss fix
- Judges **only** when stopped: `angVel < 0.010` AND `linSpeed < 7`, held for a
  **22-frame window**, AND the **angle range across that window < 0.03 rad** (so it
  never judges mid-righting). Then: must have flipped 360° (`hasFlipped`) AND final
  angle within **±0.61 rad (±35°)** = MAKE. Timeout 600 frames → MISS.
- Verified **0% false-miss / 0% false-make** over 300 realistic flicks.

**360° check (`step`)** — `hasFlipped` true when `|angle - launchAngle| ≥ 5.6` rad (~320°).

**Bottle body (`createBottle`)** — low CG = "bowling pin" that rights itself
- liquid base 74×70 @ density 0.018 (heavy), body 70×50 @ 0.0015, neck 44×36 @ 0.0004.
- `frictionAir 0.025`, `friction 0.85`, `restitution 0.02`. Gravity y=1.5, scale 0.001.
- Spawns resting on the table (`cy = groundY - 76`).

**AI (`main.js aiFlick`)** — aims at upSpeed 2100 + Gaussian error; `sigma`:
`{ easy: 650, medium: 400, hard: 220 }`. Bigger sigma = more misses.

**How to re-test tuning:** open the live engine in the browser console (or via the
preview eval) and run flicks in a loop measuring make rate — e.g. reset bottle, step
~20 frames, `Physics.applyFlick(0,-up)`, step until `Physics.checkLanding()` returns,
tally MAKE. That's how every number above was calibrated.

---

# PART 7 — DEPLOY (GitHub Pages)

Pages auto-builds from `master` (root). Push and it's live in ~1 minute at
`https://mapzimus.github.io/flipgame/`.

**The one ritual you must not forget:**
> When you change ANY game file, **bump `CACHE_NAME` in `service-worker.js`**
> (`flipgame-v3` → `flipgame-v4`). Otherwise installed copies serve the old cached
> build forever. (Currently at **v105**.)

**Gotchas baked into the project (don't undo these):**
- **All asset paths are RELATIVE.** The site lives at the `/flipgame/` subpath;
  root-absolute `/...` paths 404.
- **`service-worker.js` sits at repo root** so its scope is `/flipgame/`.
- **SW registration is gated to non-localhost** so local dev never serves stale files.
- **`.nojekyll`** must exist (stops Pages from munging files).

To enable Pages on a fresh fork: repo **Settings → Pages → Deploy from a branch →
`master` / root**.

---

# PART 8 — KNOWN ISSUES & DEFERRED BACKLOG

Recommended by a multi-agent review; intentionally NOT done yet:

- **Fullscreen + Screen Wake Lock on start** — so the panel doesn't sleep mid-game and
  the browser chrome doesn't eat space. *(High value for the panel — do next.)*
- **Multi-touch / phantom-flick hardening** (`input.js`) — uses one global pointer with
  no `pointerId`; two simultaneous touches can corrupt a flick, and `pointercancel`
  (palm rejection) can fire a phantom flick. *(Matters for pass-and-play on a touch panel.)*
- Giant "PASS TO {name} →" turn-handoff overlay (readability across a room).
- Penalty cap / death-spiral softening (a 4-streak miss = −4 lives can feel swingy).
- MAKE celebration particle burst + result "pop" animation; MISS screen shake.
- Mute toggle + honor `prefers-reduced-motion`.
- `roundRect` polyfill (older embedded browsers throw → blanks the canvas).
- Flavor uniqueness isn't enforced (defaults are distinct; duplicates allowed).

**Unverified risk:** the flick feel on the actual panel's touch hardware (see Part 1).

---

# PART 9 — ROADMAP: ONLINE MULTIPLAYER (Phase 2)

**Decision (Max's call): Approach B — deterministic lockstep replay.** Everyone sees
the *same* bottle tumble live on their own screen; one tiny message per flip
(`{seed, vx, vy}`).

**Critical:** to avoid cross-device float divergence forking the verdict, use the
hybrid — **replay is for visuals, the flicking player's device is authoritative for
the MAKE/MISS result.**

**Status (v42):**
1. Seeded RNG — **DONE ✓** `physics.js` reseeds a mulberry32 stream per flick.
2. Fixed-timestep accumulator — **DONE ✓** physics steps at fixed 60Hz.
3. Rooms + lockstep client — **DONE ✓** (`js/net.js`, Online button on setup).
   - Default transport: MQTT over WSS to the public EMQX broker (school-WiFi friendly).
   - Optional self-hosted relay: `relay/server.mjs` then `?relay=ws://host:8787`.
   - Same-browser testing: `?net=local` (BroadcastChannel).

**Design that fits the classroom:** create a room code on the smartboard or a phone;
students join and take turns flicking on their own device. Pass-and-play handoff is
skipped online — only the current peer can flick.

---

# PART 10 — QUICK GOTCHAS / TIPS

- **Git identity:** commits on this machine are tagged `howem@lynnschools.org`. Set
  `user.name`/`user.email` on the new machine (Part 3) if you want them under your
  personal account.
- **Stale local files:** dev server sends no cache headers → hard-reload (Ctrl+Shift+R)
  if an edit doesn't show.
- **Updating the installed app/APK:** push to `master` (Pages rebuilds) + bump
  `CACHE_NAME`. PWA installs and the TWA APK both load the live site, so they pick up
  updates automatically (the APK file itself doesn't need rebuilding for content changes).
- **`gh` CLI** is authenticated as `mapzimus` on this machine; on the new machine run
  `gh auth login` if you want to manage Pages/releases from the terminal.

---

# PART 11 — SESSION UPDATE (current state: v105)

Everything below was added after the original guide above; on conflicts, THIS wins.

## Gameplay mechanics now in effect
- **Stake (pointCount) starts at 0.** A make raises it +1; a miss costs the current stake then resets to 0. With no buildup, a miss costs nothing. High stake swing is **intentional** (players knocked out one by one) — do NOT clamp it.
- **Big scary stake display** (`renderer.js drawStake`): a large canvas number that grows/reddens/shakes as the stake climbs. Replaced the small top-bar text.
- **ON FIRE:** +1 life per flip, bounded by the match life cap (at least 20 and always five above the selected starting-lives preset) — EXCEPT in lobbies with **>4 players**, where a run caps at **+5 lives** then passes on gracefully (no penalty). Constants `ONFIRE_CAP_PLAYERS=4`, `ONFIRE_CAP_LIVES=5` in `game.js`.
- **SUDDEN DEATH** after `SD_THRESHOLD=70` flips (`game.js`): ordinary misses take an escalating extra penalty (`SD_STEP=20` flips/level). ON FIRE remains protected: makes add lives and the ending miss is free. In lobbies over four players the existing +5 fire-gain cap passes the turn before a run can stall the table.
- **Seeded rare-event ladder** (`physics.js`, mutually exclusive per flick): Rainbow Trail 1/50 (bright aura + dense glowing wake), Power Launch 1/100, Moon Gravity 1/200, Ice Slide 1/300 (≥18 lateral speed and >400 px travel in regression), Gravity Slam 1/400, Trampoline Table 1/500, Wind Tunnel 1/600, Double Flip 1/700, Magnet Landing 1/800, Heart Rush 1/900, and Life Drain 1/2000. Double Flip now physically completes and requires two full rotations; a successful upright or cap landing doubles the flipper and halves every active opponent. Wind Tunnel cap-first arrivals get the normal cap-settle assist. Life Drain uses a hidden strong magnet, sets every active opponent to one life on its successful landing, and leaves a green tint for the rest of the match.
- **PLINKO DROP** remains 1/1000 and the only automatic-win mechanic. Its extended eight-row board pays double the flipper's lives in the outer slots, halves every opponent's lives (round down) in the middle slots, and awards the instant win only in the center.
- **Special-event testing:** exact case-sensitive player name `Mr. Howe` multiplies every rare roll by 10 (for example 1/50 → 1/5 and Plinko 1/1000 → 1/100); it no longer guarantees an event every flip. Offline keyboard commands force the next flip: type an event name without spaces (`rainbowtrail`, `powerlaunch`, `moongravity`, `iceslide`, `gravityslam`, `trampoline`, `windtunnel`, `doubleflip`, `magnet`, `heartrush`, `lifedrain`, or `plinko`). A player named `plinko` still forces Plinko every flip.
- **Visible version badge:** the lower-right corner always shows the running release (`v105`) on setup, gameplay, overlays, and game-over screens so stale installs are immediately obvious.
- **"Make it or break it" intense finale** when a miss would eliminate the current player (`game.missWouldEliminate()`): slow-mo flight (airborne dt×0.4 in the loop), red vignette + banner, tension sound + haptic.
- **Per-turn flip countdown:** 10s (4s ON FIRE), human turns only; timeout = forfeited miss. Bar in the HUD.
- **CPU players:** toggle Human/CPU per row; difficulty easy/med/hard. Two CPUs auto-play — great for watching/bug-hunting.
- **Player names default to the chosen flavor** (12-flavor list in `main.js FLAVORS`, names twisted off Gatorade), follow the flavor unless customized.
- **Multi-game scoreboard** on the game-over screen (persists across Play Again via `matchWins` by index; resets on a new match from setup).
- **Audio + haptics:** synthesized WebAudio SFX (`audio.js`) + `navigator.vibrate` patterns (distinct for ON FIRE). No-op on desktop/most panels.

## New files since the original guide
`js/audio.js` (SFX + haptics). Everything else is the same file set.

## Dev/verify workflow used this session (IMPORTANT)
- Run the dev server (`python -m http.server 5174` / launch.json "flipgame"), open in the **Claude preview**, and verify with `preview_eval`. Game logic + physics are tested **headlessly** by driving `game.resolveFlip`/`advanceTurn` + `Physics.applyFlick`/`step`/`checkLanding` directly (set `game.callbacks = {}` to isolate from the UI). This is how all balance/landing numbers were measured.
- **Feel-dependent things (slow-mo, audio, haptics, the live countdown drain) only run in a real focused tab** — the preview throttles `requestAnimationFrame`/timers, so they can't be exercised headlessly. Playtest those on a real device.
- **Stale-cache gotcha:** scripts/CSS carry a `?v=N` query (currently **v105**) — **bump it on every change** with the matching `CACHE_NAME` in `service-worker.js` and visible `#version-badge` in `index.html`. Version misses are network-first and fall back to the bare precache only when offline; `controllerchange` reloads an open tab once after an updated worker claims it.
- **Deploy:** push to `master` → GitHub Pages + the offline APK (GitHub Actions) rebuild automatically.

## Tuning knobs quick map (all in `js/game.js` unless noted)
`SD_THRESHOLD`/`SD_STEP` (ordinary-turn sudden-death penalty), `ONFIRE_CAP_PLAYERS`/`ONFIRE_CAP_LIVES` (big-lobby fire cap), `pointCount` semantics (start 0). Flick feel in `js/physics.js`: `POWER_SPEED=4000`, settle detection requires angVel<0.010, linSpeed<7, a 22-frame/0.030-rad stable window, and at least 30 grounded frames; the fallback waits 600 grounded frames and honors an upright final pose. Turn clock `TURN_SECONDS=10`/`FIRE_SECONDS=4`.

## Phase 2 (not started): online multiplayer — Approach B
Deterministic lockstep replay: broadcast `{seed, vx, vy}` per flip; every device replays the seeded sim. CRITICAL: the flicking player's device is **authoritative for the verdict** (replay is visual only) to avoid cross-device float divergence. Prep needed: seed the RNG (replace `Math.random` in `physics.js` jitter + landing kick with a seeded PRNG) and switch the loop to a fixed-timestep accumulator. Transport: Supabase Realtime (connected) or PartyKit over wss://; NOT WebRTC (school networks block it).


## Art style (v75)
Flat **cartoony SVG** casts only in-game. AI PNG casts under `icons/skins/` are
retired. Mid-ladder packs (pets, garden, robots, ocean, snacks, cryptids) live
in `js/cartoon-casts.js` as SVG silhouettes — same toy-box look as People/Aliens.

## Progress gating (v66)
- **Unlocks + achievements only count when ≥1 human is in the lobby** (`main.js` `progressCounts()` / `humansPlayed`). AI-only games show a toast and skip `Records.recordWin`, skin unlocks, `Records.recordFlip` lifetime counters, and `Achievements.check`.
- Practice counts (solo human). Secret: tap title **Bottle → Game → Bottle → Game → Bottle → Game** to unlock everything (or wipe if already unlocked).

## Character unlocks (v72)

**Roster gallery:** open `/roster.html` for every character with a live render.

Setup: **character chips + independent color**. Cadence: bottle free, then
**every 3 wins**; **Alien species are last**. Live roster: classics → people →
buildings → gods → pets → garden → robots → ocean → snacks → cryptids → aliens.
Color recolors / swaps cast variants. Secret unlock: Bottle/Game alternating.

Legacy edition unlocks in localStorage expand into their character ids on boot.

---

*Maintained with Claude Code. To pick up on another machine: clone the repo, read this
file (incl. Part 11), run Part 3, and you're current.*
