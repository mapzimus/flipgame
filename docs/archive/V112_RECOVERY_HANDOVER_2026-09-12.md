# Flipgame v1.12 recovery handover — 12 September 2026

## Executive summary

The interrupted Codex task was recovered from the archived task **Flipgame
v1.12 Plan & Recovery** and its local Git worktrees. The task stopped because
the account usage limit was reached. The five-minute status automation no
longer exists, and no agent or scheduled implementation work remains active.

The public release is still the frozen v1.11 commit
`947133360d3487a646e04be2b313c577474f54a5`. The recovered v1.12 integration
branch is `codex/v112-integration` at
`c67d1e95ecafcd03aca6573dbe2ada402a89e84a` before this handover commit. It is
132 commits ahead of the public baseline, with 150 changed paths, about 77,000
insertions, and about 2,600 deletions.

**v1.12 is not release-ready and must not be merged to `master`, deployed, or
packaged as the public APK yet.** The current executable release-gap audit has
14 passing checks and 9 failing checks. Plinko is now independently green, but
the player-facing game still does not route every real session through the one
private v1.12 rules/progression authority.

Three interrupted code slices were also preserved as explicit WIP commits on
separate branches. They are not part of the integration branch and should be
reviewed or repaired before cherry-picking.

## Recovered locations and refs

- Repository: <https://github.com/mapzimus/flipgame>
- Released branch: `master`
- Released v1.11 baseline: `947133360d3487a646e04be2b313c577474f54a5`
- Recovered integration branch: `codex/v112-integration`
- Recovered integration SHA before this handover: `c67d1e95ecafcd03aca6573dbe2ada402a89e84a`
- Original shared task: <https://chatgpt.com/s/cx_6aa4a78ddb088191a1ebf71fe11bdd40>
- Local integration checkout at recovery time:
  `C:\Users\HoweM\Documents\Codex\2026-09-02\github-plugin-github-openai-curated-remote\work\flipgame`

The root `HANDOFF.md` remains the v1.11 maintainer handoff and is still correct
for the live release. This file is the recovery handoff for the unfinished
v1.12 development branch.

## What is integrated on `codex/v112-integration`

### Release and architecture foundations

- The public v1.11 tag and baseline remain untouched.
- The private v1.12 browser application is included in the shipped boot graph.
- The generated browser composition matches its 26 source modules.
- Browser authority boundaries remain fail-closed against ambient/global
  lookalikes; the focused authority-boundary suite passes.
- Online lobby and peer-transport code are absent from the actual boot graph
  and UI. Historical record fields remain only where needed for safe imports.
- Pages and APK packaging now include the bundled Globe geography and required
  offline boot dependencies. Service-worker cache qualification passes.
- Release identity is intentionally still v1.11/111. The v1.12/112 bump is a
  final approved-candidate action, not something to do early.

### Rules, physics, and events

- Cross-device input and landing-verdict foundations are integrated, including
  the four-second ordinary-settle authority and deadline reconciliation.
- ON FIRE, sudden-death, cap, elimination, and resolving-player HUD projections
  are backed by immutable v1.12 projections.
- The rules-owned event kernel and its authority chain are integrated.
- Authored Alien event adapters and the deterministic Easter-egg registry are
  present, but their complete live session path and device playtest are not.
- The live Plinko path now uses the selected compound Flipper, a physical
  trampoline, 24 rows / 252 pegs, nine sensor-owned prize slots, tracked camera,
  deterministic replay, and complete cleanup. The old eight-row generic-circle
  substitution, teleport recovery, and horizontal-position prize guess are no
  longer the qualified live path.

Current Plinko evidence:

- Independent qualification: 12/12 checks pass.
- All 51 competitive envelopes are preserved; renderer dispatch covers all 612
  selections/variants. This is identity coverage, not owner approval of every
  artwork pixel.
- The current nine-run live timing sample has a 14.37-second median and a
  9.93–16.52-second range.
- The live bridge's focused corpus reports an 11.38-second median.
- Every reward requires settled physical sensor evidence; time alone cannot
  award a prize.
- Camera coverage, resize determinism, reduced motion, and cleanup checks pass.

### Content, presentation, progression, and data

- Canonical module counts are present: 51 Flippers, 612 variants, 23 arenas,
  40 Store cosmetics, and 120 achievements.
- All canonical objects have a shipped draw path, and every gallery has twelve
  distinct safe color-correlated names.
- Arena previews, the sports-broadcast Home/Ready presentation, the real
  offline rotating Desk Globe, and its visible-hemisphere event focus are
  integrated.
- The profile/data module supports durable FL/FXP/FC/store state, v1.11
  migration, single-writer ownership, V2 Story/Battle fields, 16-seat records,
  Story/Battle CSV, retention filters, and reload persistence in its focused
  suites.
- Classic setup now permits 16 entries and no longer truncates a saved roster
  to eight.
- Story, Battle, Tutorial, Training, achievements, and progression have large
  tested modules and/or vertical slices in the repository. Their existence is
  not equivalent to complete player-facing gameplay.

## Current executable release blockers

Run `node scripts/v112-release-gap-qualification-tests.js` to reproduce the
current 14-pass / 9-fail result. The command intentionally exits nonzero while
any gate remains open.

1. `js/main.js` does not yet consume the private application session and
   physics connection for actual player-facing play. This is the central risk:
   do not run private and legacy scoring/reward writers in parallel.
2. The browser application currently rejects Cup and Team Clash.
3. The browser application currently rejects physical Alien and Insane
   sessions.
4. Story cannot yet start and complete an executable fresh-save activity
   through the public application.
5. Battle rules/runtime exist, but Battle does not reach the playable
   application on the integration branch.
6. Player routes are still missing for Battle, Store, and Tutorial.
7. Live Arena Select still consumes the legacy arena catalog (11 including
   Baseline), not all 23 v1.12 arenas.
8. The shipped achievement gallery still consumes the legacy 100-entry
   provider, not the 120-entry v1.12 provider.
9. Release identity remains deliberately at v1.11/111 until one candidate SHA
   passes every gate and receives explicit owner approval.

The release-gap audit is intentionally narrower than the full release
contract. Additional open gates include:

- Independent re-audit of the final private Rules/Activity/Profile path.
- Store/reveal/post-match UI and exactly-once reward behavior through real play.
- Complete Story, Rival, Tutorial/Training, Cup, Team Clash, and Battle vertical
  slices through the same physical match runner.
- All 23 live arena consumers and all 120 live achievement consumers.
- Full Alien/Insane/event live wiring and playtesting.
- Owner approval of final artwork and the mature broadcast UI.
- Phone, desktop, real smartboard/multi-touch, accessibility, performance, and
  six-viewport browser qualification.
- Fresh-install PWA/cache upgrade verification.
- A reproducible signed Android v1.12 APK from the exact approved web SHA,
  including certificate continuity and offline device launch.
- Zero open release-blocking P0/P1/P2 defects and explicit owner approval.

## Preserved unmerged WIP

These commits were created during recovery to save exact uncommitted work. They
are intentionally not merged into `codex/v112-integration`.

### `codex/v112-battle-routes` — `35db1f0`

Commit: `wip(recovery): preserve Battle routes and roster paging`

Contains:

- A Battle screen and route controller.
- Battle setup/HUD/power-card presentation.
- Eight-at-a-time paging that retains all 16 setup/ready entries.
- Unit and browser-oriented qualification scripts.

Evidence:

- `node scripts/v112-battle-routes-tests.js` passes all 9 formats × 6
  viewports, including real Rules score/charge/offer projections, relay
  qualification, invalid host/roster handling, and no UI outcome authority.
- `node scripts/v112-battle-roster-browser-tests.js` timed out in Chrome during
  recovery. Treat this slice as WIP until the timeout is diagnosed and the real
  application host is connected.
- This branch started from older integration commit `1299ad2`; cherry-picking
  onto current integration may conflict in `index.html`, `js/main.js`, and
  `css/v112-broadcast.css`. Reconcile rather than force-applying it.

### `codex/v112-journey-authority` — `b0e4942`

Commit: `wip(recovery): preserve expanded journey authority`

Contains an unfinished expansion of the private browser application toward
Cup, Team Clash, Alien, Insane, Training, events, and Story state.

Evidence:

- The branch is based directly on recovered integration SHA `c67d1e9`.
- `node scripts/build-v112-browser.mjs --check` fails at the Tutorial module
  factory signature (`v112-tutorial: factory signature changed: Events`).
- The generated bundle was not updated. Fix the source-module declaration and
  add focused mode/Story/Training tests before considering a merge.

### `codex/v112-plinko-no-contest` — `df9330e`

Commit: `wip(recovery): preserve Plinko resolution authority`

Contains a separate Plinko resolution driver, its tests, and a contract/kernel
change that treats the 10–15-second range as an experience target rather than
reward authority.

Evidence:

- `node scripts/v112-plinko-resolution-driver-tests.js` currently fails because
  `v112-plinko-live.js` reports `Live Plinko is not active` on the first step.
- The branch started from older integration commit `c831ece`; current
  integration already includes later live Plinko work. Review this branch as a
  source of missing no-contest/Rules semantics. Do not blindly cherry-pick it
  over the green live Plinko bridge.

### Apparent dirty progression worktree

`codex/v112-progression-runtime` reported three modified paths, but Git showed
identical index/worktree blob IDs and no textual or numeric diff. This appears
to be line-ending/stat-cache noise, not lost source. No recovery commit was
created for it.

## Verification run during recovery

Passing on integration SHA `c67d1e9`:

```text
node scripts/build-v112-browser.mjs --check
node scripts/v112-browser-composition-tests.js
node scripts/v112-browser-authority-boundary-tests.js
node scripts/v112-plinko-qualification-tests.js
node scripts/v112-plinko-live-bridge-tests.js
node scripts/v112-plinko-renderer-tests.js
node scripts/v112-plinko-renderer-browser-tests.js
node scripts/v112-live-profile-data-tests.js
node scripts/v112-status-dashboard-tests.js
node scripts/v111-boot-tests.js
node scripts/service-worker-tests.js
```

Expected nonzero release audit:

```text
node scripts/v112-release-gap-qualification-tests.js
# 14 passing, 9 failing; see blocker list above
```

Browser checks that did not produce a pass:

```text
node scripts/v112-browser-composition-real-tests.js
# timed out

node scripts/v112-live-data-browser-tests.js
# timed out after CHROME_PATH was supplied

# On codex/v112-battle-routes:
node scripts/v112-battle-roster-browser-tests.js
# timed out
```

These timeouts are not proof of a product failure, but they are also not passing
evidence. Diagnose browser startup/page completion before using those gates.

## Recommended continuation order

1. Start a fresh branch from `origin/codex/v112-integration`; do not work from
   `master` and do not bump release identity.
2. Reproduce the 14/9 release-gap result and the focused green suites above.
3. Repair `b0e4942` in isolation: correct the bundle module signature, generate
   the bundle, and add Cup/Team/Alien/Insane/Story/Training application tests.
4. Connect real `js/main.js` launches, landings, turn advancement, finalization,
   HUD, post-match progression, and V2 statistics to one private application
   authority. Remove or bypass legacy writers for those sessions; never double
   score or double award.
5. Rebase/reconcile `35db1f0` onto that host, diagnose its browser timeout, and
   connect real two-lane Battle before expanding to four-lane hardware work.
6. Review `df9330e` only for semantics not already present in current Plinko.
   Preserve the current 12/12 live qualification and sensor-owned outcomes.
7. Move Arena Select and the achievement gallery to the canonical v1.12
   providers; connect Store, Tutorial/Training, Story, and Rival routes.
8. Run the full automated suite, then independent adversarial and real-browser
   qualification. A focused pass must not close an independent defect.
9. Obtain owner approval for physics feel, artwork, interface, and one exact
   candidate SHA on phone, desktop, and the classroom smartboard.
10. Only then bump every web/PWA/Android identity together, build the signed APK
    from that SHA, merge/deploy, and verify both sites plus offline/APK parity.

## Quick start for the next maintainer

```powershell
git clone https://github.com/mapzimus/flipgame.git
Set-Location flipgame
git fetch origin --prune
git switch --create continue-v112 origin/codex/v112-integration

node scripts/v112-release-gap-qualification-tests.js
node scripts/build-v112-browser.mjs --check
node scripts/v112-plinko-qualification-tests.js
```

Inspect, but do not automatically merge, the recovery commits:

```powershell
git show origin/codex/v112-journey-authority
git show origin/codex/v112-battle-routes
git show origin/codex/v112-plinko-no-contest
```

## Release safety note

The recovered integration branch is suitable for preservation, review, and
continued development. It is not suitable for the live app today. Opening a
draft PR is the correct recovery action because it makes the 132-commit state,
this handover, CI results, and review discussion durable without implying that
v1.12 should ship.
