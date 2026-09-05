# Flipgame v111 Defect Ledger

| ID | Severity | Subsystem | Reproduction | Owner | Status | Verification |
|---|---|---|---|---|---|---|
| V111-001 | P1 | Physics/resize | Resize a valid airborne seed; world reflow changes MAKE to MISS | Physics | Fixed; QA pending | Frozen geometry and replay tests pass |
| V111-002 | P1 | Alien | Same normalized input becomes harder as viewport width increases | Physics | Fixed; QA pending | Viewport-normalized arena/ring profile tests pass |
| V111-003 | P1 | Online | Peer can send stale/unauthorized flick or result without turn identity | Network | Fixed; QA pending | V2 forged/stale/duplicate/reconnect suite passes |
| V111-004 | P2 | ON FIRE | Streak stops at 3 and ending miss can receive another penalty | Rules | Fixed; QA pending | Eight-player three-life and every preset tests pass |
| V111-005 | P2 | Plinko | Forced eliminations can retain positive displayed lives | Rules | Fixed; QA pending | All nine prizes and 2-8 player tests pass |
| V111-006 | P2 | Performance | Match start decodes all families for every selected color | Rendering | Fixed; QA pending | Selected-pair preload and bounded lazy caches implemented |
| V111-007 | P2 | Name safety | Stored player name is interpolated into Hall of Fame HTML | Name/UI | Fixed; QA pending | Shared policy and safe text-path tests pass |
| V111-008 | P3 | Sudden death | First escalation level lasts 19 turns instead of 20 | Rules | Fixed; QA pending | Exact 20-flip band test passes |
| V111-009 | P3 | Wake lock | Rematches reacquire locks and menu exit does not release | Platform | Fixed; QA pending | Single-lock lifecycle suite passes |
| V111-010 | P0 | Browser boot | Missing v111 loader modules crash `records.js` | UI | Fixed; QA pending | Load-order and DOM smoke tests pass |
| V111-011 | P1 | APK signing | Ephemeral debug key prevents upgrades | Release | Fixed; QA pending | Persistent secrets/release signing configured; legacy uninstall documented |
| V111-012 | P1 | Offline cache | Partial install deletes the last complete cache | Release | Fixed; QA pending | Atomic-failure test preserves old worker |
| V111-013 | P1 | Android files | WebView cannot import or export local save/stats files | Android | Fixed; QA pending | SAF bridge suite passes |
| V111-014 | P1 | Artwork | Retired generated PNG pack ships in APK/Pages | Art/Release | Fixed; QA pending | 120 files removed; zero-raster release assertion passes |
| V111-015 | P2 | Progression secrecy | Public roster page exposes names and win thresholds | UI/Release | Fixed; QA pending | Gallery removed; player-facing leak scan passes |
