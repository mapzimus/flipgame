# v111 art pack B

`js/v111-art-pack-b.js` registers production Canvas 2D artwork for roster
objects 9–16. The shard is paint-only: it creates no game objects, changes no
rules, and declares no collision or body data.

## Contents

| Roster | Object ID | Display label | Main animated detail | Reduced-motion pose |
| ---: | --- | --- | --- | --- |
| 9 | `desk-globe` | Desk Globe | real orthographic Earth rotation and inertial counterspin | fixed variant longitude |
| 10 | `microphone-stand` | Microphone on a Stand | sound-ring pulse and cable curl | compact static rings and cable |
| 11 | `potted-plants` | Potted Plants | leaf, stem, frond, or tendril motion | fixed foliage |
| 12 | `penguin` | Penguin | flipper sweep and soft body bob | neutral flippers and body |
| 13 | `owl` | Owl | eye tracking and feather ruffle | centered eyes and fixed feathers |
| 14 | `giraffe` | Giraffe | neck flex and ear/ossicone twitch | straight neck and neutral ears |
| 15 | `red-panda` | Red Panda | striped-tail curl and ear twitch | fixed tail and ears |
| 16 | `trophy-cup` | Trophy Cup | surface gleam and handle/ribbon motion | fixed gleam and ribbons |

Each object registers all twelve canonical local variant IDs from the manifest:
`blue-steel`, `sucker-punch`, `lime-light`, `orange-crush`,
`grape-expectations`, `ice-ice-baby`, `apple-solutely`, `berry-nice`,
`making-waves`, `lemon-aid`, `very-cherry`, and `pink-fluff`. Persisted IDs use
`<object-id>.<variant-id>`, producing 96 stable IDs in this shard.

## Authored cast variation

Variants share the standard competitive envelope but do not share a single
recolored drawing. Every painter switches structural geometry and detail by
the manifest cast index. Examples include a crescent-supported floating globe,
a boom microphone, a heart-faced barn owl, a telescoping robot giraffe, and a
shield trophy. Palette, material finish, silhouette description, cast label,
and dynamic-art metadata are preserved in the immutable registry tokens.

### Desk Globe geography

Desk Globe renders a complete 360-degree, border-free physical Earth rather
than sliding decorative blobs across the sphere. The painter projects compact
longitude/latitude land rings onto an orthographic globe, culls the rear
hemisphere, clips coastlines at the horizon, handles the antimeridian through
spherical sine/cosine projection, draws a curved graticule, and deterministically
rotates through every longitude. The sphere counterspins against the host
object's angle/accessory lag when that render state is available. Reduced-motion
mode selects a stable variant-specific longitude and removes continuous spin.
Because the geographic sphere itself is the Desk Globe's animated focal
surface, this object explicitly publishes `face: null` and
`supportsEmotion: false`. The shared renderer therefore skips both character
expressions and result face zoom for Desk Globe while keeping a stable nullable
metadata contract.

The embedded land rings are a half-degree-quantized, 1.2-degree simplified
derivative of Natural Earth's `ne_110m_land` physical layer. Natural Earth
declares its raster and vector map data public domain. The checked-in painter
contains only the compact derived coordinates: it performs no tile, image,
library, or other network request at runtime.

- Source: `https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_land.geojson`
- Terms: `https://www.naturalearthdata.com/about/terms-of-use/`

The downloaded `globe-maps` skill describes a full MapLibre GL v5 application
stack. Its globe projection guidance informed this painter, but the game does
not vendor MapLibre, WebGL workers, or online basemap tiles. Those dependencies
would be disproportionate for a small animated object and would weaken offline
PWA/APK behavior.

Potted Plants has a fully distinct plant drawing for every variant:

| Variant | Manifest cast | Authored structure |
| --- | --- | --- |
| `blue-steel` | Cactus | tall round trunk with two raised arms and soft dots |
| `sucker-punch` | Fern | radiating fronds with paired leaflets |
| `lime-light` | Snake Plant | eight tall overlapping blade leaves |
| `orange-crush` | Succulent | three-layer rosette of thick leaves |
| `grape-expectations` | Monstera | broad leaves, split marks, and long stems |
| `ice-ice-baby` | Bonsai | branching trunk and clipped foliage clouds |
| `apple-solutely` | Hanging Vine | elevated pot with two long wrapped vines |
| `berry-nice` | Sunflower | tall stem, leaves, ray petals, and seed center |
| `making-waves` | Mushroom Garden | five cap/stem sizes in a deep pot |
| `lemon-aid` | Air Plant | thirteen arcing spikes in a geometric holder |
| `very-cherry` | Palm | short trunk beneath a radial frond crown |
| `pink-fluff` | Alien Plant | curling luminous tendrils and translucent bubbles |

All motion is derived only from render-state `time`. With `reducedMotion: true`,
the same painter returns a deliberate fixed composition rather than dropping
the detail entirely.

## Loading and use

Browser load order is:

1. `js/v111-art-platform.js`
2. `js/v111-object-manifest.js`
3. `js/v111-art-pack-b.js`

The shard publishes `globalThis.FlipArtV111PackB`; Node consumers can require
the file directly. The API contains immutable `objectIds`, `definitions`, and
the flattened `variantIds` list. Registration remains lazy: no palette or
painter is built until `FlipArtV111.getRenderVariant()` or a render method first
requests that variant.

```js
FlipArtV111.renderGameplay(ctx, {
  objectId: 'potted-plants',
  variantId: 'potted-plants.pink-fluff',
  x: object.position.x,
  y: object.position.y,
  angle: object.angle,
  time: seconds,
  reducedMotion: prefersReducedMotion,
});
```

Every definition uses the revision-3 mapping: a `300 × 420` view box, pivot
`{ x: 150, y: 323.2972972973 }`, baseline `376`, art scale `0.74`, and local
contact offset `39`. Bounds end exactly on the shared baseline and remain
inside the view box. Cast details never override those values.

## Validation

Run:

```text
node scripts/v111-art-pack-b-tests.js
```

The suite validates the eight-object roster, all 96 manifest-compatible IDs,
labels/colors/cast tokens, canonical mapping, in-bounds baseline contact,
immutable metadata, lazy builds, local/canonical cache equivalence, substantial
nonblank vector painting, finite coordinates, twelve distinct geometric
signatures per object, active-versus-reduced-motion poses, browser globals, and
the absence of raster, glyph, or gameplay-engine calls.
