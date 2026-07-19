# Parrot Flip — Handover

**Read this first if you have zero context.** This is a spin-off of Flip Game, not a rewrite of its physics.

| | |
|---|---|
| **What it is** | A pirate-parrot reskin of the bottle-flip party game |
| **Repo** | https://github.com/mapzimus/flipgame |
| **Folder** | `parrot-flip/` (sibling to the original game at repo root) |
| **Live demo** | https://mapzimus.github.io/flipgame/parrot-flip/?v=5 |
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
    renderer.js            ★ Draws the “parrot” (currently procedural Canvas) ← ART LIVES HERE
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
- Renderer local space: body roughly `y ≈ -72 … +43`, head/hat up near `y ≈ -140`, feet near `y ≈ +40…+54`
- Function is still named `drawBottle(...)` in `renderer.js` — rename only if you update the call site in `frame()`

If the drawn parrot’s **visual base** drifts away from the physics feet, landings look wrong (hovering or sinking). Keep the silhouette roughly bottle-tall and feet-on-ground when `angle ≈ 0`.

`liquid.slosh` / `liquid.vel` still run (bottle-era oscillator). Today they’re only used to flap the wing and spit feather particles. You can keep that or ignore it.

---

## Known issue: the parrots look bad

Honest status: the birds are **quick procedural Canvas ellipses/curves** — readable as “a bird with an eye patch,” not as good character art. This is the #1 open product complaint.

### Recommended ways to make them look better (pick one)

#### Option A — Sprite sheets (best quality / classroom polish) ★ recommended

1. Draw or commission **one macaw pose** per bird (or one master + recolors), facing camera, upright, eye patch on.
2. Export transparent PNGs ~200–300px tall.
3. In `drawBottle`, `ctx.drawImage(img, -w/2, -h/2, w, h)` after `translate`/`rotate`, scaled so feet sit on the physics base.
4. Optional: 2–3 frames (idle / flap / squash) swapped from `liquid.slosh` or angular velocity.

**Pros:** Looks intentional. Easy for a human artist. Recolor via separate assets or `destination-in` masks.  
**Cons:** Asset pipeline; need one image per parrot (or palette-swap).

Suggested layout:

```
parrot-flip/assets/parrots/
  captain-squawk.png
  pegleg-polly.png
  ...
```

Pass `liquidColor` / player id → pick the right image. Preload in `main.js` before `Start Game`.

#### Option B — Better procedural Canvas (no assets)

Stay code-only but stop using plain ellipses:

- Layered feathers (fan of strokes)
- Proper macaw beak (upper/lower mandible)
- Head crest / longer graduated tail
- Outline + inner shade + rim light
- Bandana + eye patch as clear shapes (patch is mandatory)
- Distinct belly / wing / face values per bird (use `accent` from `PARROTS`, currently mostly unused in the draw path)

**Pros:** No binaries. Instant iterate.  
**Cons:** Hard to make *cute*; easy to stay in “programmer art.”

#### Option C — SVG path characters

Author each parrot as SVG (or one SVG with CSS/`currentColor` fills), draw via `Path2D` or offscreen canvas.

**Pros:** Crisp at any size; recolor with fill.  
**Cons:** SVG authoring skill; still art work.

#### Option D — External generator → sprites

Generate macaw PNGs (AI or Figma), then Option A. Keep license/classroom-safe assets only.

### What *not* to do

- Don’t change `physics.js` spin/landing constants to “fix” bad art.
- Don’t draw a huge bird whose feet float above the deck — players judge uprightness visually.
- Don’t remove eye patches.

### Small immediate wins (if you only have an hour)

1. Use each parrot’s `accent` color on wing/tail tips and bandana.
2. Add a dark outline around body/head (`stroke` after fills).
3. Make the beak bigger and more macaw-hook shaped.
4. Stretch the tail longer and use 3 feather layers.
5. Draw a tiny pupil highlight + thicker eye-patch strap so the patch reads at phone size.
6. Replace setup swatches with mini thumbnails once sprites exist.

---

## Deploy / GitHub Pages

- Pages source branch: **`master`**
- URL path: `/flipgame/parrot-flip/`
- Old experiments redirect:
  - `/flipgame/grog-flip/` → parrot-flip
  - `/flipgame/parrott-flip/` → parrot-flip

After changing JS/CSS:

1. Commit + push to `master` (or merge a PR into `master`).
2. Bump `CACHE_NAME` in `service-worker.js` (e.g. `parrot-flip-v5`).
3. Bump `?v=` query on script/link tags in `index.html` (currently `?v=5`).
4. Wait ~30s for Pages; if a phone still shows old bugs, open with a fresh query:  
   `https://mapzimus.github.io/flipgame/parrot-flip/?v=5`

**Bug history:** An early build called `Physics.resizeWorld` but physics only exports `reflow`. Fixed on the server; phones still showed the error because the **service worker cache-first** served stale `main.js`. Mitigations now in place: network-first for HTML/JS/CSS, cache wipe of old `parrot*` / `grog*` caches on load, script `?v=5`.

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

1. **Replace procedural parrot with real art** (Option A sprites) — product blocker for “looks good.”
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
