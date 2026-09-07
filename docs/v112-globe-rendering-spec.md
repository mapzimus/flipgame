# Flipgame v1.12 Desk Globe rendering specification

> Supporting rendering design. `docs/v112-contract.md` remains authoritative;
> this document may refine implementation but cannot change gameplay or release
> rules.

Status: implementation-ready design and release gate. This document audits the
current tree and specifies the rendering architecture; it does not change code,
assets, rules, or release state.

## Decision

Build a small, Flipgame-owned WebGL 1 sphere renderer that paints one textured
ray-cast sphere into a private canvas, then composites that sphere into the
existing Canvas 2D Desk Globe painter. Keep the authored 2D stand, external
meridian, base, variant structures, shared pivot, and competitive physics
unchanged. Retain the current Natural-Earth vector orthographic renderer as the
automatic no-WebGL/context-loss fallback.

Do **not** embed MapLibre and do not request maps, tiles, styles, fonts, APIs, or
imagery at runtime. The two checked-in Earth textures and the renderer are part
of the atomic PWA/APK release.

This is a deliberately hybrid result:

- realistic, shaded, fully rotating Earth **sphere**;
- authored Flipgame 2D frame, stand, meridian, stem, base, and variant accents;
- one unchanged Matter body, landing envelope, mass, pivot, and score path;
- deterministic presentation inputs with a separate cosmetic RNG domain; and
- a complete Canvas 2D fallback instead of a black or missing globe.

## How the downloaded `globe-maps` skill influenced this design

The complete downloaded skill and its `references/starter.html` were read
before this audit. They established that MapLibre GL JS v5 can turn an ordinary
map into a globe through `projection: { type: "globe" }`, and highlighted four
important constraints: globe projection and antimeridian handling, the roughly
900 KB MapLibre runtime, worker/CSP requirements, and the need to vendor all
code/data for a strict offline deployment. The starter also demonstrates why a
normal MapLibre example is unsuitable here: it loads the library from a CDN and
OpenStreetMap raster tiles from a network host.

Those lessons directly shaped the solution:

- use true spherical longitude/latitude mapping rather than sliding a flat map
  behind a circular clip;
- keep the antimeridian continuous and test a full 360-degree cycle;
- vendor immutable, licensed source imagery and require zero runtime requests;
- avoid a worker-driven map engine for a sphere that is only about 125–200
  gameplay pixels across; and
- in headless WebGL tests, use SwiftShader flags and explicitly fail any
  unexpected external request, as the skill recommends.

The skill therefore supports MapLibre as a good *map application* solution but
also makes the custom sphere the proportionate choice for this embedded game
object. No code or external URLs from the starter should ship.

## Current-state audit

| Surface | Current behavior | Consequence for v1.12 |
|---|---|---|
| `js/v111-art-pack-b.js` | The Desk Globe uses 65 packed Natural Earth `ne_110m_land` rings (763 points, 4,943 packed bytes), a mathematical orthographic projection, rear-hemisphere culling, a 12° center latitude, and `0.34 rad/s` rotation. The data spans longitude −180° through 180° and latitude −90° through 83.5°. | The source data is worldwide and the projection is a useful fallback, but flat palette fills and gradients do not meet the requested realistic relief, atmosphere, and ocean response. Partial polygons also close visible runs with a straight chord rather than a horizon arc, so the fallback needs a clipping correctness pass. |
| Desk Globe layer order | Each variant paints rear rings/stand, the sphere, and then stem/base details. All variants retain the canonical `300×420` view box, pivot `{150, 323.2972972973}`, baseline `376`, art scale `0.74`, and local contact offset `39`. | This is the correct seam for a hybrid renderer. Refactor only into explicit `frameBack → sphere → frameFront/base` phases; do not move or replace the competitive mapping. |
| `js/v111-art-platform.js` | A lazy, synchronous Canvas 2D registry normalizes render state and shares the same painter between preview and gameplay. Missing `time` becomes `0`. It rejects physics declarations. | Preserve the synchronous public paint contract. The WebGL surface must be an internal `CanvasImageSource`; asynchronous texture readiness may only invalidate/repaint a preview, never block a flip or change art metrics. |
| `js/skins.js` and `js/renderer.js` | Gameplay passes art `time`, angle, velocity, impact, `flipSeed`, and `motionSeed`; the v1.11 artist is scaled inside the same object transform. The main scene is a single Canvas 2D canvas. | Use a singleton auxiliary WebGL canvas and immediately `drawImage` it into the active 2D painter. Never create one WebGL context per player, tile, variant, or Battle lane. |
| Picker previews | `Renderer.drawPreview()` calls `FlipArtV111.renderPreview()` without a `time`, and the setup/picker canvases repaint only on setup changes or image-load callbacks. | This is the confirmed default-picker fixed-view defect. Add a bounded picker animation controller that passes explicit time to only the selected/focused visible Desk Globe preview and stops when the route is hidden. |
| Gameplay clock | `renderer.js` resets `motionElapsed` whenever the bound `flipSeed` changes, then supplies this frame-time accumulator to art. The default Blue Steel globe starts at −25° and advances about 19.48°/s. | Every new flip begins near the same Atlantic/Africa-facing longitude and most flips end long before a complete 18.48-second turn. Replace the fixed start with a seed-derived phase and feed recorded/fixed presentation elapsed time for replay. |
| Result camera | The renderer already owns a smoothed world camera and a result window of 1,500 ms. Reaction focus is disabled for Desk Globe because `supportsEmotion` is false. | Keep face focus disabled. Add an independent Desk-Globe showcase controller that completes inside the existing result window and composes with, rather than masquerades as, reaction-face focus. |
| Physics Lab | Lab already selects object/variant/event/seed/viewport, records successful paths, and replays a successful seed. | Add a three-state Desk Globe showcase control (`Normal`, `Force on eligible make`, `Off`) visible only for Desk Globe. Force bypasses the chance roll, not physical-make eligibility. |
| Boot and offline | `v111-boot.js` loads versioned classic scripts in order. `service-worker.js` atomically precaches an explicit list. APK `file:///android_asset/` boot skips the service worker; CI currently copies only `index.html`, `css`, `js`, `icons`, and `manifest.json`. | Load the sphere module before art pack B, precache both textures, and add the new `assets` directory to APK and both web-publication manifests. A missing texture must fail PWA installation atomically, while runtime decode/WebGL failure falls back locally. |
| Current tests | `v111-art-pack-b-tests.js` verifies four distinct quarter-turn command signatures, period wrap, stable reduced motion, packed source presence, no network calls, and a broad CPU timing ceiling. It uses a fake 2D context and has no browser pixels, picker animation, context-loss, camera, odds, or release-asset coverage. | Keep the valuable state/physics assertions, but add real-browser pixel tests, app-route tests, probability/eligibility tests, offline/APK tests, and measured phone/4K performance gates. The present passing tests do not disprove the reported Africa-only experience. |

### Root cause of the Africa-only observation

The default picker cause is determinable, and it is wiring rather than missing
world data:

1. Blue Steel has variant index `0`, so its initial central longitude is −25°,
   visually centering the Atlantic/Africa/Europe region.
2. `Renderer.drawPreview()` supplies no `time`; the art platform normalizes it
   to zero.
3. Picker canvases have no animation loop, so that initial frame remains fixed.
4. Gameplay technically rotates, but a new `flipSeed` resets its visual elapsed
   time. At 0.34 rad/s, a typical short flip/result reveals only a fraction of
   the 18.48-second full turn before the next flip again starts near −25°.

The packed data itself spans the full longitude range, and direct unit calls at
quarter periods produce different command signatures. The current tests bypass
the actual preview scheduler and do not inspect rendered geography, which is
why they pass while the user can still see an apparently fixed Africa view.

## Options evaluated

| Option | What it does well | Costs and mismatches | Decision |
|---|---|---|---|
| MapLibre GL JS v5 globe | Mature globe projection, atmosphere, camera, tiled raster/vector sources, and geographic layer APIs. BSD-3-Clause permits redistribution when its notices are retained. | The supplied skill estimates about 900 KB for the library before style/data; it owns another canvas and render loop, creates workers, needs CSS/CSP accommodation, and normally fetches a style/tile pyramid. Fully offline use would require vendoring the library, worker, style, fonts/sprites, and tiles or another archive/protocol. That is disproportionate for one tiny noninteractive sphere and is awkward under the current synchronous Canvas 2D artist and `file:///android_asset/` restrictions. Its zoom-to-flat-map behavior is also not wanted for the close-up. | Reject for v1.12. Reconsider only if Flipgame later builds a genuinely interactive atlas screen with map layers. |
| Minimal custom WebGL sphere | One full-screen quad and one fragment shader can ray-cast a mathematically round sphere, wrap a 2:1 texture through all longitudes, add light/limb/atmosphere/ocean specular, and render arbitrary deterministic orientations at small cost. No worker, CSS, tile system, map controls, or network is needed. | Requires a second canvas/context, texture provenance, explicit context-loss handling, and a Canvas 2D fallback. GPU pixels are not guaranteed bit-identical across vendors, so replay determinism must be defined at the logical-state level with tolerant visual references. | **Primary architecture.** It best meets visual quality, payload, integration, and offline requirements. |
| Canvas 2D orthographic vector/texture | Current vector approach is dependency-free, synchronous, deterministic, compact, and already shares the painter/collider contract. | Vector fills lack terrain/land-cover detail and convincing ocean response. CPU texture reprojection through `ImageData` each frame is expensive; a pre-rendered frame atlas makes arbitrary close-up focus coarse and inflates payload. A shifted equirectangular image clipped to a circle is cylindrical fakery, not a globe. | Keep the corrected vector projection as fallback only. Do not use a sliding texture or large frame atlas as the primary. |

MapLibre’s official documentation describes it as an interactive WebGL map
renderer and documents its worker/CSP needs; its repository is BSD-3-Clause.
Natural Earth states that all of its raster and vector map data is public
domain. See [MapLibre GL JS documentation](https://maplibre.org/maplibre-gl-js/docs),
[MapLibre license](https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt),
[Natural Earth II](https://www.naturalearthdata.com/downloads/10m-raster-data/10m-natural-earth-2/),
and [Natural Earth terms](https://www.naturalearthdata.com/about/terms-of-use/).

## Exact architecture

### 1. Static assets and provenance

Create these release assets during implementation:

- `assets/globe/earth-ne2-2048x1024.webp`
- `assets/globe/earth-ne2-1024x512.webp`
- `assets/globe/README.md`

Generate both 2:1, power-of-two textures offline from Natural Earth II with
shaded relief and water. The RGB channels contain a restrained, brand-free
physical Earth albedo. The alpha channel is a binary/soft ocean mask derived
from Natural Earth land/ocean geometry; the shader consumes it for ocean
specular and writes its own circular output alpha. Do not put labels, borders,
logos, flags, ads, or user data on the texture. All twelve Desk Globe variants
share this same true-color Earth; variant colors affect only authored frame and
base art.

The asset README must record source product/version, source URLs, processing
steps, output dimensions/encoder settings, SHA-256 hashes, and the Natural
Earth public-domain terms. Include the courteous `Made with Natural Earth`
credit even though Natural Earth does not require attribution. Source masters
need not ship in the app, but the derivation must be reproducible.

### 2. `FlipGlobeSurfaceV112`

Add one classic-script module, loaded before `v111-art-pack-b.js`, with no
Matter, rules, event, stats, storage, network, DOM-injection, or map-library
dependency. It owns:

- one lazily created private canvas;
- one WebGL 1 context requested with alpha and premultiplied alpha, no depth or
  stencil buffer, antialias off, `powerPreference: "low-power"`,
  `failIfMajorPerformanceCaveat: true`, and `preserveDrawingBuffer: true` so
  each sequential sphere remains defined until its immediate Canvas-2D
  `drawImage` copy;
- one shared texture selected before decode (2K normally, 1K when the context
  cannot support 2K or the selected render tier is low);
- one vertex buffer containing two triangles (six vertices);
- one vertex shader and one fragment shader; and
- the existing packed-vector orthographic painter as a separately testable
  fallback path.

The fragment shader draws a sphere by mapping each pixel of a normalized square
to `(x, y, sqrt(1-x²-y²))`, discarding pixels outside the unit disc, applying
the supplied axial/view rotation, converting the resulting unit normal to
equirectangular longitude/latitude, and sampling the local texture with
horizontal repeat and vertical clamp. Work in approximate linear color for
lighting, then convert back for output. Apply bounded ambient plus directional
diffuse light, ocean-mask specular, subtle atmosphere, and antialiased limb
falloff. Lighting may make the sphere dimensional but must not hide an entire
continent or turn the night side black.

Use no mesh, map labels, user interaction, depth buffer, map camera, or tile
loader. A ray-cast quad is smaller and avoids latitude-pole mesh density while
remaining a true spherical projection.

The module exposes a synchronous paint operation and pure state helpers. Its
logical request contains only finite, bounded values such as output diameter,
center longitude/latitude or orientation matrix, variant/flip presentation
seed, reduced-motion flag, and quality tier. It returns `webgl`, `fallback`, or
`pending`; it never changes the request or gameplay state. Asset decode is
lazy. Until ready, or after any shader/texture/context failure, the same call
paints the vector fallback. A readiness callback may request one UI repaint.

### 3. Canvas 2D composition

Keep `drawDeskGlobe()` in the authored art pack as the owner of all twelve
variant structures. Split its paint order explicitly:

1. rear stand/ring and rear variant accents in Canvas 2D;
2. realistic sphere from `FlipGlobeSurfaceV112` via one immediate `drawImage`;
3. front meridian/ring clips and glass accents in Canvas 2D; and
4. stem, plaque, base, and foreground variant details in Canvas 2D.

Wrap the composite in `ctx.save()/restore()` and never leak filters, blend
modes, transforms, or alpha. The sphere output is circular and transparent, so
no rectangular WebGL background may cover the authored art. The surface module
must be reusable sequentially for one to four visible Desk Globes; it must not
allocate a context or texture per object.

Do not change the registered bounds, pivot, baseline, `artScale`, contact
offset, body vertices, mass, friction, restitution, landing tolerances, or
score code. Keep Desk Globe `face: null` and `supportsEmotion: false`.

### 4. Rotation and replay state

Preserve the current readable rate of `0.34 rad/s` (one turn in approximately
18.48 seconds), but stop resetting every normal flip to the same −25° view.

- Picker: the active/focused Desk Globe preview receives route-local elapsed
  time and a stable variant phase. It animates at a capped 24 surface updates
  per second while visible. Static grid thumbnails and offscreen canvases do
  not run animation loops.
- Gameplay with a bound flip: base longitude is a pure hash of
  `(flipSeed, variantId, "desk-globe-orientation/v1")`; advancement uses a
  physics/replay elapsed value, not `Date.now()`, `performance.now()`, or an
  unrecorded render-frame count. Object-angle/accessory lag may add the current
  bounded deterministic counterspin.
- Idle gameplay before a bound flip may use a visual clock, but launch latches
  the seeded phase and the result latches the exact orientation used by the
  showcase.
- Replay metadata carries the latched `globePhaseRad` and presentation elapsed
  value. Replaying the same shot supplies those values verbatim. Logical
  orientation, focus point, fallback choice input, and camera curve are exact;
  cross-GPU pixel comparisons use tolerance rather than byte equality.
- Reduced motion freezes a stable seed/variant-derived orientation. It does not
  delete geography or substitute the Africa start frame.

The controller, not the painter, owns time. No renderer should infer globe
phase from whatever wall-clock value happens to be available.

### 5. Resource lifetime

Prewarm the chosen local texture after a player selects Desk Globe or when a
Desk Globe preview becomes active. Match start may await local decode during
the existing ready transition, but an error immediately selects the fallback;
it must never leave the start button or game loop waiting. Suspend picker
updates when hidden, offscreen, or `document.hidden`. Release transient
showcase-sized buffers after the result; keep at most the shared texture,
program, and ordinary render target for the session.

On `webglcontextlost`, call `preventDefault`, mark the surface degraded, and
paint the vector fallback from the next synchronous call. Attempt one restore
outside an active flip; never retry in a per-frame loop. A restored context must
recreate programs/buffers/textures from checked-in assets before being marked
ready.

## Post-make geographic showcase

### Eligibility

Evaluate once when a result is committed. The roll is eligible only when all
of these are true:

- active `objectId === "desk-globe"`;
- committed result is `MAKE`;
- the result came from evaluated physical landing/contact evidence; and
- no event/result metadata marks it automatic.

Physical cap lands and physically resolved event-modified landings remain
eligible. Misses, Plinko automatic wins/losses, synthetic/administrative
results, unresolved results, and missing flip seeds are ineligible. Human and
CPU physical makes use the same visual rule. Eligibility observes the already
committed result and cannot influence it.

Physics Lab adds `Normal`, `Force on eligible make`, and `Off`. `Force` bypasses
only the chance comparison; it still requires a physical Desk Globe make and
marks the session Test Data under the existing Lab contract. A known successful
seed/replay is the direct review path.

### Exact chance and RNG isolation

Use a pure project-owned 32-bit mixing function with named, frozen presentation
salts. Do not call `Math.random`, the event registry, physics RNG, arena RNG,
reward RNG, or a shared mutable PRNG. Derive independent words for:

- `desk-globe-showcase/decision/v1`;
- `desk-globe-showcase/focus-angle/v1`; and
- `desk-globe-showcase/focus-radius/v1`.

The active stored display name is compared with exact JavaScript equality to
`Mr. Howe`; case, spacing, punctuation, and Unicode lookalikes do not match.
Use denominator 10 for that exact value and 100 for every other name. Convert a
32-bit word to an unbiased integer with rejection against the largest multiple
of the denominator below `2^32`, and trigger only on bucket zero. If a word is
in the rejected tail, derive the next candidate from the same immutable flip
seed, decision salt, and an incrementing local retry counter until one is
accepted. The retry is a pure local calculation and no shared stream is
advanced. This defines an exact 1/10 or 1/100 discrete probability rather than
a modulo-biased approximation. The existing `Mr. Howe` event-frequency
behavior remains a separate event-domain rule and is neither consumed nor
modified.

### Visible-hemisphere focus point

Latch the sphere orientation actually drawn for the committed result. From two
independent presentation words, sample a camera-space unit vector uniformly in
a spherical cap no more than 55° from the view center:

- `cos(theta) = 1 - u × (1 - cos(55°))`;
- `phi = 2πv`; and
- transform that camera-space vector through the inverse latched globe
  orientation to obtain deterministic world latitude/longitude.

This guarantees view-space `z ≥ cos(55°) ≈ 0.574` and projected radius
`≤ sin(55°) ≈ 0.819`, safely away from the limb. It needs no rejection loop,
geolocation, lookup service, place-name database, or stored coordinates. Keep
the sphere orientation fixed during the close-up; the camera targets the
selected point on the geography that was already visible rather than rotating
a hidden point into view.

### Camera, HUD, skip, and reduced motion

The showcase is a presentation overlay/controller inside the existing 1,500 ms
result state. Recommended fixed timeline:

- `0–150 ms`: ordinary MAKE presentation establishes the verdict;
- `150–500 ms`: cubic ease toward the projected surface point;
- `500–900 ms`: brief geographic hold;
- `900–1,250 ms`: ease back to the normal result camera; and
- by `1,300 ms`: dispose showcase state, leaving at least 200 ms of margin.

Never add time to the turn, cancel the result banner, obscure the winner/score,
or delay input beyond the ordinary result transition. Render the sphere at the
larger showcase tier from the same texture/orientation instead of magnifying a
small cached gameplay bitmap. A visible, keyboard-reachable, minimum-48-pixel
`Skip close-up` action ends the camera motion immediately but does not alter the
result timer or advance the turn.

With reduced motion, do not pan, zoom, rotate, shake, or spring. Crossfade a
stationary magnified circular inset centered on the same deterministic point,
hold it briefly, and remove it by the same 1,300 ms deadline. Announce at most
`Desk Globe close-up` in the polite status region; do not synthesize a place
name or make sound/color necessary to understand the MAKE.

Cleanup is mandatory on skip, timeout, route exit, rematch, interruption,
resize/orientation change, visibility loss, context loss, and any state change
away from the owning result. Cleanup never advances any RNG stream.

## Offline, release, licensing, security, and privacy

### Release graph

Implementation must update the v1.12 equivalents of all of these as one atomic
change:

- load `js/v112-globe-surface.js?v=112` after the art platform and before art
  pack B;
- list the module and both textures in the service-worker precache;
- bump boot, public, service-worker, manifest, and Android version identity
  together;
- copy the root `assets` directory into `android/app/src/main/assets/` and the
  GitHub Pages artifact;
- permit `assets/...` in the dual-origin provenance path allowlist and include
  both texture bytes in its digest; and
- assert the exact files and SHA-256 values inside the signed APK.

PWA install remains all-or-nothing: failure to fetch either required texture
rejects the new worker and preserves the previous complete cache. After a
successful install, a cold offline launch must render the globe without a
request escaping the app origin. APK file-origin boot must render directly from
bundled assets with airplane mode enabled and without weakening
`setAllowFileAccessFromFileURLs(false)` or
`setAllowUniversalAccessFromFileURLs(false)`.

### Licensing

Natural Earth raster and vector data is public domain and permits modification,
redistribution, and commercial use. Preserve source/version/hash provenance in
the asset README. The shader and glue code should be original Flipgame code.
Because MapLibre is not included, no MapLibre runtime or third-party notices are
added; if a future prototype vendors it, its BSD-3-Clause license text and all
bundled third-party notices must accompany the binary/source distribution.

Do not use OpenStreetMap tiles, MapTiler styles, unpkg/CDN scripts, Google/Bing
imagery, remote fonts, or any source whose offline redistribution rights are
unclear. “Free to view” is not the same as licensed to bundle.

### Security and privacy

- Asset URLs are compile-time constants under `assets/globe/`; display names,
  save data, or focus coordinates never form a path or shader source.
- Compile fixed shader strings only. Do not use `eval`, dynamic imports, HTML
  injection, remote workers, blob workers, or runtime style JSON.
- Add no new `connect-src`, `worker-src`, cross-origin, cleartext, or Android
  WebView permission. The design works with self-only app updates and requires
  no worker for rendering.
- Bound texture dimensions, render-target size, context restore attempts, and
  every numeric input before allocating or calling WebGL.
- No geolocation, IP lookup, map search, coordinates from the user, telemetry,
  or network fallback. The focus point is synthetic. Ordinary local diagnostics
  may store `eligible`, `shown`, renderer tier/fallback, and duration, but not
  latitude/longitude or a copy of the player name.
- A sphere/shader/asset failure degrades appearance only. It cannot throw out of
  the main frame loop, alter physics, or suppress the result.

## Budgets

These are release ceilings, not targets to spend:

| Resource | Ceiling |
|---|---:|
| 2K WebP texture | 700 KiB compressed |
| 1K WebP texture | 250 KiB compressed |
| Globe asset README/provenance | 8 KiB |
| New unminified sphere module including shaders/fallback glue | 36 KiB |
| Total compressed release/download delta | 1.0 MiB |
| One decoded 2K RGBA texture | 8 MiB |
| Globe-owned measured peak GPU allocation, including showcase target | 20 MiB |
| Ordinary render target | maximum 512×512 physical pixels |
| Showcase render target | maximum 1024×1024 physical pixels |
| Picker surface cadence | maximum 24 Hz, one active preview |
| Gameplay surface cadence | maximum 30 Hz per visible sphere; main scene/HUD remains at normal cadence |
| One-globe p95 render + composite overhead | ≤1.5 ms on release reference hardware |
| Four-globe p95 aggregate overhead | ≤4.0 ms and no fifth context/texture |
| Showcase p95 render + composite overhead | ≤4.0 ms at 4K |
| Target frame rate | existing ≥45 FPS worst-case smartboard gate; ≥50 FPS p95 in representative phone gameplay |
| Texture prewarm | asynchronous; no >50 ms main-thread long task and no active-flip decode |

Quantize requested targets instead of resizing the private canvas every frame.
Use 128/256/384/512 ordinary tiers and 512/768/1024 showcase tiers. Choose a
tier before a match/close-up from displayed physical diameter and tested
capability; quality changes may affect pixels but never logical orientation,
odds, camera timing, or gameplay. In four-lane Battle, reuse one context and
texture sequentially. If measured gates fail, lower surface cadence/resolution
or use the vector fallback; never reduce the game simulation rate.

## Implementation gates

1. **Asset/legal gate:** produce the two deterministic textures, README,
   hashes, seam/pole inspection, and public-domain provenance. Product owner
   approves the same sphere at picker size, normal gameplay size, phone
   close-up, and 4K close-up before integration continues.
2. **Surface gate:** ship the standalone shader harness plus corrected vector
   fallback. Prove complete longitude coverage, dimensional lighting, context
   loss, bounded allocation, and no network before touching result flow.
3. **Art integration gate:** composite the surface between explicit 2D frame
   layers for all twelve variants. Lock canonical art metrics and compare
   physics/result hashes to the pre-change build.
4. **Picker/gameplay gate:** add one scoped preview animator and deterministic
   gameplay phase. Prove that the actual picker changes view and that replay
   restores the same orientation; command-only quarter-turn tests are
   insufficient.
5. **Showcase gate:** implement eligibility, exact domain-separated odds,
   visible-cap sampling, camera/skip/reduced motion, Lab force, and cleanup.
6. **Release gate:** pass offline PWA upgrade/rollback, airplane-mode APK,
   dual-origin byte reconciliation, phone/4K/Battle performance, accessibility,
   and product-owner visual review.

No bulk art or camera rollout should bypass a failed earlier gate.

## Required tests and acceptance evidence

| Area | Required acceptance |
|---|---|
| Source coverage | Parse the shipped source/texture manifest and prove a 2:1 complete Earth, longitude seam continuity, both polar rows, and known visible features in Africa/Europe, the Americas, Asia-Pacific, Australia, and Antarctica. No quadrant may be blank or a duplicate of another. |
| Full turn | At 0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°, and 360°, compare the logical orientation and approved screenshots. `360°` equals `0°` within visual tolerance; every longitude crosses the center meridian during one approximately 18.48-second cycle. |
| Actual picker | Open the real object and variant picker on phone and 4K layouts. The selected/focused Desk Globe preview changes at two sampled timestamps without input, completes a turn, stops when hidden, and remains pixel-stable under reduced motion. Static/offscreen tiles schedule no frame work. |
| Gameplay/replay | Fixed flip seeds at upright, quarter-turn, inverted, airborne, impact, settle, and result states produce identical logical globe phases/focus states on replay. Vary browser frame cadence while keeping recorded physics/presentation elapsed input fixed; orientation does not drift. |
| Art boundary | All twelve variants use the same untinted Earth and retain distinct authored 2D frames. Only the sphere has realistic raster/shader treatment. Desk Globe keeps `face: null`; Bottle and T-Rex source/render/physics golden hashes remain unchanged. |
| Physics isolation | Before/after fixed corpora have identical body vertices, mass, friction, restitution, pivot/contact offset, trajectories, contacts, landing metadata, MAKE/MISS, score, life, reward, event, progression, and stats hashes with the sphere enabled, disabled, skipped, reduced, context-lost, and fallback. |
| WebGL fallback | Simulate unavailable WebGL, major-performance-caveat rejection, shader compile/link error, 1K/2K texture decode error, `webglcontextlost`, failed restore, and mid-showcase loss. Every case paints complete vector geography, keeps the result readable, emits no uncaught error, and never retries per frame. |
| Shader pixels | In headless Chromium run with `--use-angle=swiftshader --enable-unsafe-swiftshader`; block all non-app requests. Capture approved pixel references for the eight longitudes, limb, atmosphere, daylight, ocean highlight, alpha edge, seam, both texture tiers, and showcase zoom. Use perceptual/tolerance comparison, not cross-GPU byte equality. |
| Eligibility | Positive: committed physical Desk Globe MAKE, including physical cap/event-modified makes. Negative: other object, MISS, automatic win/loss, missing seed, unresolved/admin result. Lab `Force` changes only an otherwise eligible decision; `Off` suppresses it. CPU and human physical makes share eligibility. |
| Exact odds | Unit-test unbiased bucket boundaries and rejection values for denominators 100 and 10. Over at least one million predeclared unique seeds per cohort, observed rates fall in a predeclared 99% binomial interval. Exact `Mr. Howe` uses 1/10; `mr. howe`, `MR. HOWE`, `Mr. Howe `, `Mr Howe`, and Unicode lookalikes use 1/100. Reordering event definitions does not change showcase outcomes. |
| RNG separation | For every seed in the deterministic corpus, enabling/disabling/forcing/skipping the showcase leaves event selection, event-call counts, trajectory, result, rewards, progression, arena, and stats hashes identical. Stub `Math.random` to throw throughout the decision and focus paths. |
| Hemisphere safety | For a large orientation/seed corpus, every focus has finite normalized coordinates, view-space `z ≥ cos(55°)`, projected radius `≤ sin(55°)`, and remains within the visible textured disc at every target aspect ratio. The chosen point matches replay exactly. |
| Camera timing | At 360×740, 768×1024, 1280×720, 1366×768, 1920×1080, and 3840×2160, camera starts after the MAKE is readable, returns by 1,300 ms, never extends the 1,500 ms result, preserves HUD/score, and leaves the next input state/camera identical. Skip is 48 px, keyboard/touch operable, immediate, and does not alter the turn timer. |
| Reduced motion | The same focus appears in a stationary magnified inset/crossfade with no pan, zoom, rotation, shake, or spring. It ends by 1,300 ms, has equivalent status text, and changes no eligibility or RNG output. |
| Cleanup | Verify skip, normal timeout, menu, rematch, resize/orientation change, background/foreground, context loss, forced Lab replay, and unexpected interruption. No stale overlay, transform, rAF, texture-sized transient, input block, or camera state survives. |
| Performance | Profile one Desk Globe and four simultaneous Desk Globes in the heaviest qualified arena/event at phone, 1080p smartboard, and 4K. Meet every budget above for at least five minutes, with memory plateauing after warmup and no repeated texture decode/context creation. |
| PWA/offline/APK | Assert module/textures in boot/precache/provenance and their SHA-256 hashes. A simulated missing texture rejects the new PWA install without deleting the old cache. After one successful install, cold launch offline. Build/sign APK, assert texture bytes inside it, then launch from `file:///android_asset/` in airplane mode with zero outbound requests. |
| Security/privacy | Static scan finds no external globe URL, MapLibre, tile template, geolocation, remote font, dynamic shader source, `eval`, or new Android/network permission. Runtime network interception observes no globe request outside the local release. Diagnostics contain no name or coordinates. |

## Explicit non-goals

- No interactive atlas, drag-to-spin control, place search, labels, popups,
  routes, political borders, live weather, day/night service, or geolocation.
- No MapLibre, Three.js, globe.gl, Cesium, Turf, PMTiles, tile server, CDN, API
  key, remote style, or runtime data fetch.
- No realistic treatment for the stand, meridian, base, plaque, other objects,
  arena, or HUD.
- No fifth Battle globe/context, per-player texture copy, per-frame allocation,
  or full-resolution 4K render target.
- No odds display, unlock, reward, score effect, hidden aim assistance, result
  override, or use of the exact name for anything beyond its already specified
  event weighting and this showcase denominator.
- No camera beat after a miss or automatic outcome, and no showcase that extends
  the result state or prevents a player from skipping it.
