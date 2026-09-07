# Flipgame v1.12 defect ledger

The release gate is zero known open P0/P1/P2 defects. `Pending` means the item
is part of v1.12 and is not yet eligible for release.

| ID | Severity | Subsystem | Reproduction | Status | Verification required |
|---|---|---|---|---|---|
| V112-001 | P1 | Progression/UI | Win and receive an object reveal, then open Customize without reloading; the item can remain absent | Fixed in recovery baseline (`4349a62`); independent QA pending | Shared live state, FL1–100 migration/no-relock |
| V112-002 | P1 | Input/Physics | A short fast flick displays near 25% while launching with peak velocity/full rotation | Fixed (`d765973`, `193f819`); independent QA pending | Meter/launch signal parity across pointer types |
| V112-003 | P1 | Physics | Ordinary playtest objects rotate substantially faster and feel harder than intended | Fixed (`d765973`); independent QA pending | Deterministic low/mid/high calibration and event regression |
| V112-004 | P2 | Unlock UI | Locked/reveal tile retains the prior selected object's pixels beneath `?`/`🔒` | Pending | Clean canvas lifecycle, queue, secrecy screenshots |
| V112-005 | P2 | Progression/UI | Odd-win visual/cosmetic reward is persisted but produces no reveal notification | Pending | All five cosmetic types and queued mixed rewards |
| V112-006 | P2 | Customize | Variant tab shows color dots/generic names; actual cast appears only after returning to Setup | Pending | All objects/variants, names, immediate art preview |
| V112-007 | P2 | Owner testing | No safe way exists to preview all locked content without changing earned progression | Pending | Exact temporary code and Test Data boundaries |
| V112-008 | P2 | Plinko | Playtest view appears seven slots wide and the fall is too short for the expanded board | Pending | Nine-slot render, longer board, tracked camera, deterministic outcomes |
| V112-009 | P1 | Physics/Alien | Classic calibrates near 32.5% while temporary Alien is near 68% and native Alien reaches about 82% before dropping at 4K | Fixed (`d765973`, `2996a8c`); independent QA pending | Alien within ±10pp of matched Classic per viewport; Alien viewport spread ≤10pp; CPU bands ordered |
| V112-010 | P1 | Events | Some events are visually too subtle to understand during play | Audit assigned | 30-event physical/visual/audio/camera matrix and owner approval |
| V112-011 | P1 | Events | Earlier assistance profiles may be guaranteed or effectively automatic over broad inputs | Audit assigned | Non-zero miss path and mixed-outcome deterministic corpus per event |
| V112-012 | P1 | Art/Renderer | Smile/frown/scared overlay is painted over the authored neutral face, doubling facial features | Pending | Single-face states across every allowlisted variant/legacy object; Bottle/T-Rex exclusions |
| V112-013 | P1 | Art | Product owner rejected the current new-object artwork as substantially below the v1.12 quality bar | Seven-Flipper calibration implemented (`0561188`); owner approval and full roster pending | Approved calibration set, 25-object gallery, 300-variant motion/screenshot review |
| V112-014 | P1 | UI/UX | Product owner rejected the responsive menu as robotic and boring | Open | Approved concept direction and code-native phone/smartboard prototype before rollout |
| V112-015 | P1 | Input/Physics | Equivalent intentional flicks feel much harder on phone than desktop | Fixed (`d765973`, `193f819`); independent QA pending | Timestamped/coalesced gesture replay and bounded cross-device make-rate parity |
| V112-016 | P1 | Alien/Renderer | Floating UFO bank surfaces are missing in observed Alien and Alien Invasion play | Open | Physics/render obstacle parity and phone/desktop/4K browser evidence |
| V112-017 | P2 | UI/Renderer/Audio | ON FIRE is no longer visually pronounced enough to read as a major momentum state | Open | Escalating lifecycle, cleanup, reduced-motion, phone/smartboard evidence |
| V112-018 | P1 | Events/Renderer | Mitosis shows a generic/cap-like secondary body instead of two complete selected-object clones | Open | All objects/variants, independent dynamics, conserved physics, one/both/neither outcomes |
| V112-019 | P1 | Platform/UI | Online UI and runtime networking remain in the v1.11-derived shipped graph despite the v1.12 offline-only decision | Open | No route, loaded/cached module, socket/transport, or reachable state path; legacy imports preserved |
| V112-020 | P2 | Player scaling | Setup, modes, Mirror Match, saves, stats, and HUD contain hard-coded eight-player bounds or truncation | Open | Central limits and exhaustive supported-count lifecycle tests |
| V112-021 | P1 | Battle/Input | The current singleton input/physics model ignores additional pointers and cannot isolate simultaneous Battle lanes | Implemented (`36a3b70`, `c2c78e9`); hardware and independent QA pending | Two/four-contact calibration, lane isolation, simultaneous settlement, performance, and fallback |
| V112-022 | P1 | CPU/Difficulty | Classic Medium/Hard CPUs make about 73%/84%; Alien can reach about 85% on Easy and reverse tier ordering | Open | Easy 30–40%, Medium 45–55%, Hard 60–70%; ordered make/cap bands across modes/events/viewports |
| V112-023 | P1 | Art/Globe | Desk Globe can appear as a fixed Africa-facing illustrated disc rather than a visibly complete rotating real Earth sphere | Calibration implemented (`0561188`, `da218f8`, `634c21a`); integration/QA pending | Realistic literal sphere only; 360° cycle, focus detail, offline/cache/APK, performance, unchanged collider |
| V112-024 | P2 | UX/Arenas | Arena choice lacks the required dedicated fighter-then-stage screen and the collection has only the ten inherited themes | Planned | Full Arena Select flow, 22-stage ownership/migration/reveals, hidden locks, rematches, responsive/Battle evidence |
| V112-025 | P1 | Battle/Fairness | Rush power offers use the global result count, so reversing simultaneous lane settlement can change which cards each competitor receives | Routed to Battle owner | Per-competitor deterministic offer streams invariant to launch/settle/callback order |
| V112-026 | P1 | Battle/Powers | A symmetric Round card is queued once per team and can be consumed by only the first of two simultaneously active teammates | Routed to Battle owner | All active eligible representatives receive the same round effect exactly once; relay semantics covered |
| V112-027 | P1 | Battle/Sudden Death | A tied four-way heat can re-admit players who were behind when paired sudden death begins | Routed to Battle owner | Only tied leaders enter paired sudden death; repeated ties and two/four/relay hardware covered |
| V112-028 | P2 | Battle/Powers | A targeted card cannot be selected and stored while its target is aiming, although only deployment should be time-gated | Routed to Battle owner | Selection remains legal; deployment after any affected pointerdown remains rejected |
| V112-029 | P1 | Battle/Runtime | Adapter launch/promise/callback failures can leave lanes or synchronized gates permanently inflight | Routed to Battle owner | Deterministic error cleanup for synchronous throws, rejected promises and observer callbacks without double resolution |
| V112-030 | P1 | Battle/Rotation | Larger teams can finish a 2–0 Battle before several teammates are ever assigned because the rotation cursor advances by one even when two representatives play | Routed to Battle owner | Coverage/fairness matrices for 3v3–8v8 on one-, two- and four-touch hardware across Volley/Rush and heat starts |
| V112-031 | P1 | Battle/Input | A Rush player can hold an aim across 15-second rotation boundaries, launch after losing the seat, and starve later teammates | Routed to Battle owner | Unlaunched aim cancellation/reassignment at every rotation boundary with power restoration |
| V112-032 | P2 | Battle/Clock | Horn eligibility depends on delayed `tick()` ordering instead of the pointer release timestamp, allowing late releases or rejecting timely ones | Routed to Battle owner | Absolute heat deadline and pre-/post-horn release races under delayed event-loop delivery |
| V112-033 | P2 | Battle/CPU | Runtime recognizes `cpu`/`isCpu` but not the current setup model's `ai` flag | Routed to Battle owner | Mixed human/CPU normalization and launch routing from legacy/current setup shapes |
| V112-034 | P1 | Battle/Relay | One-touch 1v1 Timed Rush marks both duelists active while only the first has a physical lane, so the second cannot flip | Routed to Battle owner | Alternating one-lane duel assignments, equal clock exposure and complete runtime heat |

Art directions listed in `docs/v112-plan.md` are product-approval tasks rather
than defects until an implementation violates a frozen invariant. The original
Bottle/no-face and original T-Rex/no-change rules are release-blocking invariants.
