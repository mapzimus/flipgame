# v111 vector-art platform

The platform is a paint-only registry for v111 objects. It creates no physics
bodies, reads no game state, and does not depend on Matter.js. Load
`js/v111-art-platform.js` before any object registration file. The Coffee Mug
golden reference lives in `js/v111-art-reference.js` and registers all twelve
standard color variants.

## Browser globals

- `FlipArtV111` — registry, lazy cache, and render entry points.
- `FlipArtV111Reference` — Coffee Mug definition and its canonical variant IDs.

Both files also export CommonJS modules for headless tests. Loading either file
does not require a DOM, `Image`, `Path2D`, or a canvas. A canvas-compatible 2D
context is required only when a render call is made.

## Registration contract

```js
FlipArtV111.registerObject({
  id: 'object-id',
  label: 'Object label',
  metrics: {
    viewBox: { x: 0, y: 0, width: 300, height: 420 },
    bounds: { x: 54, y: 60, width: 222, height: 316 },
    pivot: { x: 150, y: 232 },
    baselineY: 376,
  },
  variants: [{
    id: 'stable-local-id',
    label: 'Accessible label',
    color: '#1f9bff',
    tokens: {},
  }],
  buildVariant(variant, objectDefinition) {
    return function paintLocal(ctx, renderState) {};
  },
});
```

Object and local variant IDs are lowercase kebab-case. A persisted canonical
variant ID is `<object-id>.<variant-id>`. Registration validates that bounds,
pivot, and baseline are internally consistent and rejects physics-oriented
fields. Definitions and public metadata are immutable.

`buildVariant` is lazy: it is not called by registration or catalog listing.
The platform calls it once on the first lookup/render of a canonical variant,
then reuses that `RenderVariant` until `clearRenderCache()` is called. It must
return a local-coordinate paint function (or `{ paint }`) and must not change
game state.

## RenderVariant

`getRenderVariant(objectId, variantId)` accepts a local or canonical variant ID
and returns:

```js
{
  id, objectId, variantId, label, color, metrics,
  renderLocal(ctx, { mode, time, reducedMotion, selected })
}
```

The metadata and object identity are stable. The painter is shared by preview
and gameplay calls, preventing the setup tile from showing different art than
the object used in a match.

## Rendering

```js
FlipArtV111.renderPreview(ctx, {
  objectId: 'coffee-mug',
  variantId: 'blue-steel',
  box: { x: 0, y: 0, width: 200, height: 280 },
  padding: 0.08,
  time: seconds,
  reducedMotion: false,
});

FlipArtV111.renderGameplay(ctx, {
  objectId: 'coffee-mug',
  variantId: 'coffee-mug.blue-steel',
  x: bottle.position.x,
  y: bottle.position.y,
  angle: bottle.angle,
  scale: 1,
  time: seconds,
  reducedMotion: false,
});
```

Preview mode fits the declared visible bounds inside the requested box.
Gameplay mode places the declared pivot at `(x, y)`, then applies the supplied
rotation and scale. The integration layer remains responsible for choosing the
visual scale that maps the shared art baseline and standard collision envelope;
the art platform never reads or alters that envelope.

The Coffee Mug uses the same silhouette, bounds, pivot, and baseline in every
variant. Its steam animation freezes when `reducedMotion` is true.
