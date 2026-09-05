# v111 art pack B

`js/v111-art-pack-b.js` registers production Canvas 2D artwork for roster
objects 9–16. The shard is paint-only: it creates no game objects, changes no
rules, and declares no collision or body data.

## Contents

| Roster | Object ID | Display label | Main animated detail | Reduced-motion pose |
| ---: | --- | --- | --- | --- |
| 9 | `desk-globe` | Desk Globe | drifting map/cloud layers and axis bob | fixed clouds and axis |
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
