# Parrot Flip — Handover

**Read this first if you have zero context.** This is a spin-off of Flip Game, not a rewrite of its physics.

| | |
|---|---|
| **What it is** | A pirate-parrot reskin of the bottle-flip party game |
| **Repo** | https://github.com/mapzimus/flipgame |
| **Folder** | `parrot-flip/` (sibling to the original game at repo root) |
| **Live demo** | https://mapzimus.github.io/flipgame/parrot-flip/?v=6 |
| **Parent game** | https://mapzimus.github.io/flipgame/ (original Gatorade bottle flip) |
| **Intended home** | Eventually [whydahstory.com](https://whydahstory.com) / [Whydah-Unit](https://github.com/mapzimus/Whydah-Unit) as a classroom game |
| **Stack** | Vanilla JS + Canvas 2D + Matter.js 0.19 (vendored). No build step, no npm. |
| **Branch that shipped this** | `cursor/parrott-flip-dacf` (also pushed to `master` for GitHub Pages) |

---

## One-sentence pitch

Same flick-to-flip Matter.js physics as Flip Game; instead of a bottle you see a colored pirate parrot (eye patch on every bird), each with a silly name and personality.

---

## Why this exists

1. Max has Flip Game (bottle flip) in `mapzimus/flipgame`.
2. Wanted a pirate-themed copy for the Whydah / Caribbean classroom unit (`whydahstory.com`).
3. First attempt (“Grog Flip” — rum bottle) was rejected.
4. Final direction: **Parrot Flip** — pick colored Caribbean macaws/parrots; physics unchanged; menu labels stay normal (Easy / Medium / Hard).

Spelling note: **parrot** (one *t*). “Parrott” was a typo. Historically sailors traded New World parrots (including macaws); “parrot” is the umbrella word they used.

---

## How to run it locally

```bash
cd parrot-flip
python3 -m http.server 8080
# open http://localhost:8080/
```

Or open `parrot-flip/index.html` directly (some browsers are fine with `file://`).

No install. No bundler. Edit a file → refresh.

---

## File map

```
parrot-flip/
  index.html          UI shells (setup, game, tutorial, game-over)
  css/style.css       Setup + HUD styles (Whydah-ish navy/gold palette)
  manifest.json       PWA manifest
  service-worker.js   Offline cache (network-first for HTML/JS/CSS as of v4)
  icons/              PWA icons (still Flip Game icons — not parrot-branded yet)
  js/
    vendor/matter.min.js   Physics engine (do not edit)
    physics.js             Bottle compound body + flick + landing judge  ← DO NOT CHANGE for art work
    game.js                Lives, streaks, ON FIRE, turns, AI difficulty
    input.js               Pointer flick → velocity
    renderer.js            ★ Draws the parrot (authored SVG sprite, baked per color) ← ART LIVES HERE
    audio.js               WebAudio SFX
    main.js                Wires UI + loop; PARROTS roster (names/colors/vibes)
```

**Critical split:** `physics.js` still thinks it’s a bottle. `renderer.js` paints a parrot on top of that body. Do not retune physics to “feel more like a bird” unless product asks for that — the design brief was *same physics, different paint*.

---

## Game rules (unchanged from Flip Game)

- Players take turns flicking the upright object up; hard flick = more spin.
- Land upright after ~one full flip → **MAKE**. Else → **MISS** (lose lives; stake escalates).
- Streaks → “heating up” → **ON FIRE** (bonus lives on makes; miss ends fire with no penalty).
- CPU difficulties: Easy / Medium / Hard. Feel: Forgiving / Standard / Pro.
- Practice mode: solo, no lives.

---

## The parrot roster

Defined in `js/main.js` as `PARROTS` (also aliased as `FLAVORS` for leftover bottle-era variable names):

| Name | Color | Theme | Vibe |
|---|---|---|---|
| Captain Squawk | `#d62828` | Scarlet macaw | Bossy. Claims every make was intentional. |
| Pegleg Polly | `#ff4d8d` | Drama macaw | Dramatic. Screams on every miss. |
| Doubloon Dave | `#e9c46a` | Gold-feather macaw | Greedy. Only flips for gold. |
| Stormy Beak | `#457b9d` | Blue macaw | Gloomy. Predicted this miss yesterday. |
| Barnacle Bill | `#2a9d8f` | Sea-green macaw | Salty. Has notes on your flick form. |
| Sir Chirpsalot | `#7b2cbf` | Royal macaw | Posh. Tips a tiny hat after makes. |
| Cannonball Carl | `#f4a261` | Sunrise macaw | Explosive. Zero chill, maximum spin. |
| Whisper Wing | `#2ec4b6` | Teal macaw | Mysterious. Knows what the bottle knows. |
| Hardtack Helen | `#bc6c25` | Amber macaw | Hungry. Flips better after crackers. |

**Every bird must keep an eye patch** (product request).

Setup UI: color swatches + personality line. Choosing a parrot auto-fills the player name unless they typed a custom one.

---

## Physics ↔ art contract (read before changing drawing)

The Matter.js body is a **compound bottle**:

- Heavy wide base + lighter body + neck
- CG at `bottle.position`
- Renderer local space: ground-contact plane at `y ≈ +39` (foot soles), head top near `y ≈ -119`, tail draping to `y ≈ +52` behind the feet
- Function is still named `drawBottle(...)` in `renderer.js` — rename only if you update the call site in `frame()`

If the drawn parrot’s **visual base** drifts away from the physics feet, landings look wrong (hovering or sinking). Keep the silhouette roughly bottle-tall and feet-on-ground when `angle ≈ 0`.

`liquid.slosh` / `liquid.vel` still run (bottle-era oscillator). Today they’re only used to flap the wing and spit feather particles. You can keep that or ignore it.

---

## Art pipeline: authored SVG sprites (Option C — shipped)

The old “quick procedural ellipses” complaint is resolved. The bird is now a
**hand-authored SVG macaw illustration** living entirely inside
`js/renderer.js` — no asset files, no network, still offline-safe:

- `parrotBodySVG(palette)` / `parrotWingSVG(palette)` return SVG documents in a
  300×420 viewBox (side profile facing right, foot soles on svg y=376).
- `parrotPalette(color)` derives each player's full plumage from their roster
  color: crown/chest/deep shades plus two real-macaw accents — a **golden
  greater-covert wing band** (`mix(color, gold)`) and **blue-slate primaries/
  tail** (`mix(color, navy)`). Beak/eye/feet/patch tones are fixed (`ANAT`) so
  they read as anatomy on every plumage, including the gold + amber birds.
- Each color's two layers are baked once into `Image`s via
  `data:image/svg+xml` URIs and cached (`getParrotSprite`); the wing layer is
  drawn on top, rotated a few degrees by `liquid.slosh` so the bird flaps.
- `SPR` maps the svg ground line to **local y=+39** — the physics contact
  plane (base bottom 73px under the spawn anchor, CG 34px under that). If you
  re-author the SVG, keep foot soles on svg y=376 or landings will look like
  hovering/sinking.
- `Renderer.preloadParrots(colors)` (called from `startGame` in `main.js`)
  warms the cache; an unloaded color falls back to a simple silhouette for the
  1–2 frames the Image needs to decode.
- `Renderer.drawBottle` is exported for the art-iteration harness: render one
  bird per pose/color to a canvas grid, screenshot, adjust paths, repeat.

**To tweak the art:** edit the path data in `parrotBodySVG`/`parrotWingSVG`
(plain SVG), bump `?v=` + `CACHE_NAME`, and eyeball a grid of all 9 roster
colors at several angles before shipping — a shape that reads at scale 1 can
break at phone size or mid-tumble.

### What *not* to do

- Don’t change `physics.js` spin/landing constants to “fix” bad art.
- Don’t draw a huge bird whose feet float above the deck — players judge uprightness visually.
- Don’t remove eye patches.

### Small immediate wins (if you only have an hour)

1. Replace setup swatches with mini sprite thumbnails (the SVG images already
   exist per color — `getParrotSprite(color).body` is a ready `Image`).
2. Use each parrot’s `accent` color somewhere visible (it’s still unused).
3. A second wing pose (spread) swapped in while airborne would sell the flip.

---

## Deploy / GitHub Pages

- Pages source branch: **`master`**
- URL path: `/flipgame/parrot-flip/`
- Old experiments redirect:
  - `/flipgame/grog-flip/` → parrot-flip
  - `/flipgame/parrott-flip/` → parrot-flip

After changing JS/CSS:

1. Commit + push to `master` (or merge a PR into `master`).
2. Bump `CACHE_NAME` in `service-worker.js` (e.g. `parrot-flip-v6`).
3. Bump `?v=` query on script/link tags in `index.html` (currently `?v=6`).
4. Wait ~30s for Pages; if a phone still shows old bugs, open with a fresh query:  
   `https://mapzimus.github.io/flipgame/parrot-flip/?v=6`

**Bug history:** An early build called `Physics.resizeWorld` but physics only exports `reflow`. Fixed on the server; phones still showed the error because the **service worker cache-first** served stale `main.js`. Mitigation in place: network-first for HTML/JS/CSS + `?v=` script queries. (An emergency on-load cache-wipe + SW-unregister hack from that incident survived until v6 — it deleted the *current* cache and killed the SW on every visit, breaking offline support. Removed; the SW's activate handler already cleans old caches.)

---

## Whydah-Unit port (not done in that repo yet)

Goal: ship at `https://whydahstory.com/parrot-flip/`.

Whydah-Unit uses a **whitelist `.gitignore`** (`*` then `!folder/**`). To publish:

```
!parrot-flip/
!parrot-flip/**
```

Also link from homepage / dashboard Games section (same pattern as `navigator/` and `black-sam/`).

**Access note:** The cloud agent that built this could push to `flipgame` but got **403** writing to `mapzimus/Whydah-Unit`. A human (or an agent with Whydah write access) must copy `parrot-flip/` over and open the PR there.

Earlier “Grog Flip” patch artifacts may exist on older branches; ignore them — product direction is Parrot Flip only.

---

## Parent Flip Game vs this folder

| | Repo root (Flip Game) | `parrot-flip/` |
|---|---|---|
| Object | Gatorade bottle + liquid | Parrot paint over same body |
| Roster | Flavors | Named macaws + vibes |
| Continues to evolve? | Yes (root has newer files like `settings.js`, `records.js`) | Snapshot/port; **not automatically synced** from root |

If you improve physics in the parent game and want Parrot Flip to match, copy `physics.js` / `game.js` / `input.js` carefully and re-test — then re-check `main.js` still calls the current Physics API (`reflow`, `getLastLandingInfo`, `getLastFlickInfo`, etc.).

---

## Suggested next tasks (priority order)

1. ~~Replace procedural parrot with real art~~ **DONE (v6)** — authored SVG
   sprites; see “Art pipeline” above.
2. Custom PWA icons (parrot, not bottle).
3. Port folder into Whydah-Unit + link from whydahstory.com.
4. Optional: mute bandana/eye-patch variants per bird for more personality without new physics.
5. Optional: sync gameplay fixes from parent Flip Game.

---

## Quick test checklist

- [ ] Setup: two default parrots with names + vibe lines
- [ ] Start game → parrot appears on deck, no red error overlay
- [ ] Flick up → spins → MAKE or MISS
- [ ] Eye patch visible when upright and when tumbling
- [ ] Practice mode + CPU medium still work
- [ ] Phone: hard-refresh or `?v=N` after deploys

---

## Contacts / ownership

- Repo owner: **mapzimus** (Max Howe)
- Classroom context: Whydah / LEAP4Ed Salem Summer 2026 unit
- This handover written for whoever picks up **parrot art + Whydah publish** next
