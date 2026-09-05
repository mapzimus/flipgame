# Flipgame v111 Integration Log

## Revision 1 - contract freeze

- Baseline commit: `3a3ace0`
- Baseline regression tests: pass
- Baseline version tests: pass (`v110`)
- Baseline service-worker tests: pass
- Integration branch: `codex/v111-integration`
- Concurrency: Program Integrator plus at most three specialists
- Work policy: isolated worktrees, exclusive ownership, coordinator-only merge
- Current contract: `docs/v111-contract.md`, revision 1

No implementation deviations are approved. Specialists must report proposed
interface or behavior changes to the Program Integrator before proceeding.

## Revision 2 - canonical art/physics mapping

- Trigger: the Art Platform specialist found that revision 1 named
  `RenderVariant` without freezing its exact SVG-to-world pivot.
- Old contract: integration layer chose the mapping.
- New contract: viewBox `300 x 420`, SVG ground `376`, art scale `0.74`, local
  contact `+39`, shared SVG pivot `{150, 323.297297...}`.
- Migration: Coffee Mug reference and all Wave 2 art must use the shared pivot.
- Tests: assert pivot/baseline mapping for every object and variant.
- Affected owners: Art Platform, all three Art Production agents, UI/Renderer.

## Revision 3 - canonical content IDs

- Trigger: Wave 1 review found the art registry using kebab-case while the data
  manifest used underscore IDs for the same new objects and variants.
- Old contract: stable IDs were required but their spelling convention was not
  explicit.
- New contract: all new object/variant IDs use lowercase kebab-case end to end;
  persisted variant IDs are `<object-id>.<variant-id>`.
- Migration: no released build contains these new IDs, so Wave 1 normalizes the
  manifest before integration. Display label `Piñata` keeps its accent.
- Tests: manifest/art ID parity and canonical-ID regex are mandatory.
- Affected owners: Object Manifest, Art Platform, Art Production, Progression,
  Stats, and UI/Renderer.

## Wave 1 integrated

- Art platform/reference: integration commit `2d613ed`, corrected by `da2550e`.
- Object/variant manifest: integration commit `2ebff10`, corrected by `174e548`.
- Smartboard UX specification: integration commit `74bedb9`.
- Gates: art-platform, 25/300 manifest, baseline regression, version, and
  service-worker tests pass.

## Wave 2 integrated

- Art Pack A (objects 1-8): `f8fddb5`, 96 canonical variants.
- Art Pack B (objects 9-16): `91400d0`, 96 canonical variants.
- Art Pack C (objects 17-25): `f8b8456`, 108 canonical variants.
- Gates: all 300 variants pass ID parity, lazy-build, mapping, nonblank paint,
  reduced-motion, source-safety, and baseline regression checks.
- Visual screenshot inspection remains assigned to independent browser QA.

## Wave 3 integrated

- Architecture seams: `5970204`.
- Added versioned interfaces, runtime/outcome hub, mode adapters, stats/name
  install points, lifecycle bridge, and verified lazy art catalog.
- Shared edits were limited to loader ordering and passive `main.js` hooks.
- Gates: all nine Node suites and localhost Start Game smoke pass.
- Release action: coordinator must precache all v111 runtime/art scripts when
  the final service-worker cache key is bumped.
