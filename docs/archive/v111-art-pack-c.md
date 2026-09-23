# v111 vector art pack C

`js/v111-art-pack-c.js` registers roster objects 17–25 with the shared
`FlipArtV111` Canvas 2D platform. Load order in a browser is:

1. `js/v111-art-platform.js`
2. `js/v111-object-manifest.js`
3. `js/v111-art-pack-c.js`

The shard also supports CommonJS for headless validation. Loading it registers
nine immutable object definitions but builds no painters. The first preview or
gameplay lookup lazily builds that variant and the platform reuses it thereafter.

## Authored casts

Every object derives its IDs, accessible labels, colors, cast labels,
silhouettes, and finishes from `FLIP_V111_OBJECT_MANIFEST`. Each ordered flavor
is a visibly different physical-looking cast, not a recolor of one outline:

| Object | Twelve casts in canonical flavor order |
| --- | --- |
| Snow Globe | Pine Cabin; City; Mountain; Penguin; Forest; Moon; Castle; Ocean; Robot; Mushroom; Rocket; Aurora |
| Eyeball Monster | Cyclops Blob; Tall Stalk; Three Lash; Goggle; Snail Eye; Robot Eye; Crown Eye; Wing Eye; Flower Eye; Moon Eye; Book Eye; Star Eye |
| Soda Can | Classic; Slim; Stubby; Ribbed; Twist Top; Bubble Can; Rocket Can; Robot Can; Fruit Can; Snow Can; Tall Pop; Mini Keg |
| Watering Can | Garden Classic; Tall Indoor; Elephant; Long Reach; Rose Head; Square Can; Teapot Can; Robot Can; Flower Can; Acorn Can; Boot Can; Rocket Can |
| Piñata | Donkey; Star; Rocket; Cactus; Cupcake; Robot; Moon; Pineapple; Castle; Drum; Cloud; Monster |
| Huge Rubber Duck | Classic; Tall Duck; Round Duck; Sailor; Explorer; Robot; Dinosaur; Unicorn; Astronaut; Raincoat; Crown; Patchwork |
| Action Figures | Space Ranger; Ocean Scout; Forest Guardian; Robot Helper; Sky Pilot; Crystal Hero; Volcano Rescuer; Time Explorer; Garden Giant; Moon Builder; Weather Captain; Star Keeper |
| Tall Buildings | Glass Tower; Brick High-Rise; Clock Tower; Art Deco; Twist Tower; Garden Tower; Robot Tower; Rocket Tower; Castle Keep; Water Tower; Stacked Cubes; Lantern Tower |
| Box of Snacks | Cracker Box; Popcorn Box; Pretzel Carton; Fruit Bites; Trail Mix; Snack Tower; Lunch Pack; Robot Snacks; Rocket Snacks; Puzzle Box; Party Mix; Mystery Pack |

All signage and package decoration uses abstract vector marks rather than text,
logos, or real-world brands. The artwork uses Canvas path and fill operations
only; it has no raster, emoji, DOM, external asset, or game-engine dependency.

## Mapping and motion

All nine definitions use the revision-3 canonical mapping:

- viewBox: `0 0 300 420`
- pivot: `150, 323.2972972973`
- baseline: `y=376`
- art scale: `0.74`
- local contact offset: `39`

Per-object visible bounds terminate at the shared baseline and include the
widest authored cast. The bounds affect preview fitting only. This pack declares
no object-specific gameplay or collision-tuning data.

The normal render uses `renderState.time` for manifest-aligned visual details:
flake drift, eye tracking/gel wobble, bubbles/tab twitch, handle/drop movement,
ribbon movement, wing movement, pose/accessory movement, window/antenna motion,
and package-flap movement. When `renderState.reducedMotion` is true, every one
of those details resolves to a deterministic static pose that remains visually
complete at any time value.

## Validation

Run:

```text
node scripts/v111-art-pack-c-tests.js
node scripts/v111-art-platform-tests.js
node scripts/v111-manifest-tests.js
```

The pack-C validator checks exact manifest parity for all 108 canonical IDs,
immutable metadata, 12 geometrically distinct casts per object, substantial
nonblank Canvas paint, canonical bounds/contact mapping, lazy construction and
cache reuse, shared preview/gameplay variants, dynamic/reduced-motion behavior,
headless browser registration, and absence of raster or object-specific tuning
APIs.
