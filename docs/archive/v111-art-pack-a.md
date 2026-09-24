# v111 art production pack A

`js/v111-art-pack-a.js` is the authored Canvas 2D art shard for manifest
objects 1–8:

1. Coffee Mug
2. Milk Carton
3. Teapot
4. Salt/Pepper Shaker
5. Soup Can
6. Smoothie
7. Gumball Machine
8. Microscope

The shard covers the exact 96 canonical variant IDs in
`FLIP_V111_OBJECT_MANIFEST`. It reads the manifest for stable IDs, accessible
labels, colors, and cast metadata. It does not copy progression data or define
collision behavior.

## Load order and exports

Load these scripts in order:

```html
<script src="js/v111-art-platform.js"></script>
<script src="js/v111-object-manifest.js"></script>
<script src="js/v111-art-reference.js"></script>
<script src="js/v111-art-pack-a.js"></script>
```

The final script publishes `globalThis.FlipArtV111PackA` and also supports
CommonJS. Its immutable public record contains:

```js
{
  contractRevision: 3,
  objectIds,            // eight manifest IDs
  canonicalVariantIds, // 96 persisted IDs
  definitions,         // eight FlipArtV111 definitions
  coffeeMugSource: 'v111-art-reference'
}
```

Coffee Mug remains owned by the golden-reference shard. Pack A validates its
ordered IDs and colors against the manifest and reuses the existing immutable
definition. It never attempts a second registration. The remaining seven
objects are registered by Pack A.

## Art behavior

Every Pack A painter is assembled lazily on the first
`getRenderVariant()`/render request. Registration performs no painter build or
canvas work. All artwork uses Canvas 2D paths, gradients, fills, strokes, and
local transforms; there are no raster images, emoji glyphs, text logos, or
brand marks.

Each manifest cast has authored geometry rather than only a color swap. Examples
include carton gables, windows, caps, and handles; round, square, cloud, and
house teapots; glass, ceramic, mill, and drum shakers; can ribs, handles, safe
tabs, and sleeves; domes, jars, layered cups, and blender bases; vendor globes,
spiral chutes, and pedestals; and school, digital, binocular, field, and space
microscopes. Variant color remains the palette anchor while the cast index
selects silhouette and surface detail.

Dynamic cues are paint-only:

| Object | Animated cues | Reduced-motion fallback |
| --- | --- | --- |
| Coffee Mug | steam curl | fixed steam |
| Milk Carton | straw flex, gable ease, bubbles | fixed straw and bubbles |
| Teapot | lid/handle motion, spout steam | fixed lid, handle, and steam |
| Salt/Pepper Shaker | grain shift, cap rattle | fixed grains and cap |
| Soup Can | tab twitch, label glint | fixed tab and glint |
| Smoothie | straw whip, dome wobble, fruit-speck drift | fixed straw, lid, and specks |
| Gumball Machine | gumball tumble, handle turn | fixed balls and handle |
| Microscope | focus-knob turn, stage spring, lens glint | fixed controls and glint |

`reducedMotion: true` removes all time dependence without deleting important
silhouette or material cues.

## Mapping invariant

Every definition uses the revision-3 canonical mapping:

```text
viewBox 300 × 420
pivot  (150, 323.2972972973)
ground 376
scale  0.74
local contact +39
```

The test suite checks
`abs((376 - 323.2972972973) * 0.74 - 39) < 1e-9` for every object.
Visual silhouettes and moving pieces stay paint-only and cannot alter the
shared competitive envelope.

## Validation

Run:

```text
node scripts/v111-art-pack-a-tests.js
```

The suite validates Coffee Mug coordination, zero eager builds, exact manifest
and registry parity, all 96 IDs, bounds and contact mapping, nonblank authored
paint operations, 12 distinct geometries for every Pack A-owned object,
time-stable reduced motion, animated dynamic cues, preview/gameplay transforms,
browser globals, and the absence of raster/text/emoji or object-specific
physics declarations.
