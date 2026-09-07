# Flipgame v1.12 defect ledger

The release gate is zero known open P0/P1/P2 defects. `Pending` means the item
is part of v1.12 and is not yet eligible for release.

| ID | Severity | Subsystem | Reproduction | Status | Verification required |
|---|---|---|---|---|---|
| V112-001 | P1 | Progression/UI | Win and receive an object reveal, then open Customize without reloading; the item can remain absent | Fixed in recovery baseline (`4349a62`); independent QA pending | Shared live state, FL1–100 migration/no-relock |
| V112-002 | P1 | Input/Physics | A short fast flick displays near 25% while launching with peak velocity/full rotation | Fix in progress | Meter/launch signal parity across pointer types |
| V112-003 | P1 | Physics | Ordinary playtest objects rotate substantially faster and feel harder than intended | Fix in progress | Deterministic low/mid/high calibration and event regression |
| V112-004 | P2 | Unlock UI | Locked/reveal tile retains the prior selected object's pixels beneath `?`/`🔒` | Pending | Clean canvas lifecycle, queue, secrecy screenshots |
| V112-005 | P2 | Progression/UI | Odd-win visual/cosmetic reward is persisted but produces no reveal notification | Pending | All five cosmetic types and queued mixed rewards |
| V112-006 | P2 | Customize | Variant tab shows color dots/generic names; actual cast appears only after returning to Setup | Pending | All objects/variants, names, immediate art preview |
| V112-007 | P2 | Owner testing | No safe way exists to preview all locked content without changing earned progression | Pending | Exact temporary code and Test Data boundaries |
| V112-008 | P2 | Plinko | Playtest view appears seven slots wide and the fall is too short for the expanded board | Pending | Nine-slot render, longer board, tracked camera, deterministic outcomes |
| V112-009 | P1 | Physics/Alien | Classic calibrates near 32.5% while temporary Alien is near 68% and native Alien reaches about 82% before dropping at 4K | Open | Alien within ±10pp of matched Classic per viewport; Alien viewport spread ≤10pp; CPU bands ordered |
| V112-010 | P1 | Events | Some events are visually too subtle to understand during play | Audit assigned | 30-event physical/visual/audio/camera matrix and owner approval |
| V112-011 | P1 | Events | Earlier assistance profiles may be guaranteed or effectively automatic over broad inputs | Audit assigned | Non-zero miss path and mixed-outcome deterministic corpus per event |
| V112-012 | P1 | Art/Renderer | Smile/frown/scared overlay is painted over the authored neutral face, doubling facial features | Pending | Single-face states across every allowlisted variant/legacy object; Bottle/T-Rex exclusions |
| V112-013 | P1 | Art | Product owner rejected the current new-object artwork as substantially below the v1.12 quality bar | Open | Approved calibration set, 25-object gallery, 300-variant motion/screenshot review |
| V112-014 | P1 | UI/UX | Product owner rejected the responsive menu as robotic and boring | Open | Approved concept direction and code-native phone/smartboard prototype before rollout |
| V112-015 | P1 | Input/Physics | Equivalent intentional flicks feel much harder on phone than desktop | Audit active | Timestamped/coalesced gesture replay and bounded cross-device make-rate parity |
| V112-016 | P1 | Alien/Renderer | Floating UFO bank surfaces are missing in observed Alien and Alien Invasion play | Open | Physics/render obstacle parity and phone/desktop/4K browser evidence |
| V112-017 | P2 | UI/Renderer/Audio | ON FIRE is no longer visually pronounced enough to read as a major momentum state | Open | Escalating lifecycle, cleanup, reduced-motion, phone/smartboard evidence |
| V112-018 | P1 | Events/Renderer | Mitosis shows a generic/cap-like secondary body instead of two complete selected-object clones | Open | All objects/variants, independent dynamics, conserved physics, one/both/neither outcomes |
| V112-019 | P1 | Platform/UI | Online UI and runtime networking remain in the v1.11-derived shipped graph despite the v1.12 offline-only decision | Open | No route, loaded/cached module, socket/transport, or reachable state path; legacy imports preserved |
| V112-020 | P2 | Player scaling | Setup, modes, Mirror Match, saves, stats, and HUD contain hard-coded eight-player bounds or truncation | Open | Central limits and exhaustive supported-count lifecycle tests |
| V112-021 | P1 | Battle/Input | The current singleton input/physics model ignores additional pointers and cannot isolate simultaneous Battle lanes | Design gate | Two/four-contact calibration, lane isolation, simultaneous settlement, performance, and fallback |
| V112-022 | P1 | CPU/Difficulty | Classic Medium/Hard CPUs make about 73%/84%; Alien can reach about 85% on Easy and reverse tier ordering | Open | Easy 30–40%, Medium 45–55%, Hard 60–70%; ordered make/cap bands across modes/events/viewports |
| V112-023 | P1 | Art/Globe | Desk Globe can appear as a fixed Africa-facing illustrated disc rather than a visibly complete rotating real Earth sphere | Open | Realistic literal sphere only; 360° cycle, focus detail, offline/cache/APK, performance, unchanged collider |
| V112-024 | P2 | UX/Arenas | Arena choice lacks the required dedicated fighter-then-stage screen and the collection has only the ten inherited themes | Planned | Full Arena Select flow, 22-stage ownership/migration/reveals, hidden locks, rematches, responsive/Battle evidence |

Art directions listed in `docs/v112-plan.md` are product-approval tasks rather
than defects until an implementation violates a frozen invariant. The original
Bottle/no-face and original T-Rex/no-change rules are release-blocking invariants.
