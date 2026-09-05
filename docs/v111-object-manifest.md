# v111 object manifest

`js/v111-object-manifest.js` is the data-only source of truth for v111's 25 new
flippable objects and their 12 art variants. It gives artwork, progression, and
menu work stable IDs and ordering without adding render code or changing game
physics.

Load the script in a browser to read `globalThis.FLIP_V111_OBJECT_MANIFEST`, or
use `require('../js/v111-object-manifest.js')` from Node-based tools and tests.
The schema name is `FlipgameObjectManifestV1`.

## Object roster

The win gates below are internal progression data. They must not be shown in the
player-facing mystery roster before an object is owned. The values interleave
with the existing object gates at 4, 8, ... 100 exactly as specified in
`docs/v111-contract.md`.

| Order | Stable ID | Display name | Wins | Broad family | Shell/material | Contents mode |
| ---: | --- | --- | ---: | --- | --- | --- |
| 1 | `coffee_mug` | Coffee Mug | 2 | drinkware | ceramic | open liquid |
| 2 | `milk_carton` | Milk Carton | 6 | cartons | paperboard | closed liquid |
| 3 | `teapot` | Teapot | 10 | teaware | ceramic | closed liquid |
| 4 | `salt_pepper_shaker` | Salt/Pepper Shaker | 14 | table shakers | glass and metal | granular |
| 5 | `soup_can` | Soup Can | 18 | food cans | tinplate | closed liquid |
| 6 | `smoothie` | Smoothie | 22 | drink cups | clear cup | closed liquid |
| 7 | `gumball_machine` | Gumball Machine | 26 | candy machines | glass and painted metal | granular |
| 8 | `microscope` | Microscope | 30 | lab instruments | painted metal and glass | none |
| 9 | `desk_globe` | Desk Globe | 34 | globes | painted sphere and metal | none |
| 10 | `microphone_stand` | Microphone on a Stand | 38 | stage microphones | metal and rubber | none |
| 11 | `potted_plants` | Potted Plants | 42 | houseplants | terracotta and foliage | granular |
| 12 | `penguin` | Penguin | 46 | penguin characters | plush toy | none |
| 13 | `owl` | Owl | 50 | owl characters | plush and feather toy | none |
| 14 | `giraffe` | Giraffe | 54 | giraffe characters | plush toy | none |
| 15 | `red_panda` | Red Panda | 58 | red-panda characters | plush toy | none |
| 16 | `trophy_cup` | Trophy Cup | 62 | trophies | metal | none |
| 17 | `snow_globe` | Snow Globe | 66 | snow globes | glass and resin | closed liquid |
| 18 | `eyeball_monster` | Eyeball Monster | 70 | friendly monsters | soft rubber | closed liquid |
| 19 | `soda_can` | Soda Can | 74 | drink cans | aluminum | closed liquid |
| 20 | `watering_can` | Watering Can | 78 | garden cans | painted metal | open liquid |
| 21 | `pinata` | Pinata | 82 | party pinatas | paper and cardboard | granular |
| 22 | `huge_rubber_duck` | Huge Rubber Duck | 86 | rubber-duck characters | soft vinyl | none |
| 23 | `action_figures` | Action Figures | 90 | original action figures | molded plastic | none |
| 24 | `tall_buildings` | Tall Buildings | 94 | fictional towers | masonry and glass model | none |
| 25 | `box_of_snacks` | Box of Snacks | 98 | generic snack boxes | cardboard | none |

## Variant contract

Each object owns exactly 12 variants. A variant ID is always
`<object_id>_<flavor_id>`; for example, `coffee_mug_blue`. Its display name also
identifies the physical-looking cast, for example `Coffee Mug — Blue Diner`.
These IDs and the order below are stable integration keys.

| Index | Flavor ID | Display label | Base color |
| ---: | --- | --- | --- |
| 1 | `blue` | Blue | `#1f9bff` |
| 2 | `red` | Red | `#e3263c` |
| 3 | `lime` | Lime | `#8ed11a` |
| 4 | `orange` | Orange | `#ff7a00` |
| 5 | `purple` | Purple | `#8a3ffc` |
| 6 | `ice` | Ice | `#5fcfe6` |
| 7 | `green` | Green | `#3fae1a` |
| 8 | `berry` | Berry | `#ff5b86` |
| 9 | `indigo` | Indigo | `#4f63e0` |
| 10 | `yellow` | Yellow | `#ffc233` |
| 11 | `cherry` | Cherry | `#c8203a` |
| 12 | `pink` | Pink | `#ff9ecf` |

The color is only a palette anchor. Every entry also has an authored
`castLabel`, `silhouette`, and `finish`, so the variants read as visibly
different physical casts rather than simple hue swaps. Casts stay within the
object's broad family: a mug remains drinkware, a tower remains fictional
architecture, and an action figure remains an original brand-free toy.

All 12 variants have `availability: "with-object"`. Owning the object makes its
complete variant set available immediately; variants have no independent win
thresholds.

## Consumer fields

Each object record provides:

- stable identity and progression: `id`, `displayName`, `emoji`, `rosterOrder`,
  `unlockAtWins`, and `visibility`;
- classification and visual behavior: `broadFamily`, `material`, optional
  `liquid`, `dynamicArt`, and `safety`;
- invariant integration flags: `collisionProfile` and
  `variantsAvailableWithObject`;
- its 12 ordered `variants`.

The manifest also exposes a flattened `variants` array in roster/flavor order
for asset pipelines and uniqueness checks. `dynamicArt` describes ambient,
flight, impact, and reduced-motion art cues. It does not authorize extra game
state, particles without a reduced-motion fallback, or physics forces.

## Non-negotiable integration rules

- Every new object and every variant uses
  `collisionProfile: "standard-competitive-v1"`.
- Silhouette, moving parts, liquid, and granular-content effects are visual
  only. They must not affect mass, collision geometry, friction, restitution,
  launch force, torque, gravity, landing judgment, or scoring.
- No variant gets a gameplay advantage or a separate unlock gate.
- Names, casts, signage, packages, and characters remain fictional,
  brand-free, classroom-safe, and free of health claims or eating challenges.
- `reducedMotion` is a required cue for every object's dynamic artwork.
- Consumer code should treat IDs as durable keys and display names as UI copy.

## Validation

Run:

```text
node scripts/v111-manifest-tests.js
```

The validator checks the exact roster and gate sequence, exact 25 × 12 counts,
stable identifier shape, global ID/name uniqueness, ordered flavors, all-at-once
variant availability, required art/safety metadata, brand-free copy, and the
absence of object-specific physics-tuning fields.
