# Ashfall v3 verification

## Design and accessibility

| Pair | Foreground / background | Contrast |
| --- | --- | --- |
| Core text | #f4e8d5 / #12171b | 14.90:1 |
| Muted text | #b4c4cd / #12171b | 10.07:1 |
| Primary action | #1b1712 / #f0cd96 | 11.78:1 |
| Selected text | #f4e8d5 / #32271b | 12.03:1 |
| Focus | #aee6ff / #12171b | 13.37:1 |
| Warning | #f0cd96 / #090e14 | 12.80:1 |

Ashfall injected CSS: 10819 uncompressed bytes. No new raster/audio/font downloads or third-party dependencies. Five scenery motifs and sound are built locally. Existing shell analytics/comments are unchanged. Gameplay art is allocated for the active level only; invisible DOM-panel canvas rendering is skipped. Audio effects rate-limit burst cues, disconnect completed source graphs, duck music on major events, and close the context on destruction.

## Local evidence

- Baseline 107 unit tests; final suite: 179 passed across 20 files, with typecheck, build and diff checks passing. Expanded suite includes 60 stage/difficulty settlement fixtures, malformed-save/prototype-key regressions, geometry/jump checks, difficulty damage/timing and forge caps. Fixtures force boss HP to isolate lifecycle; they are not combat proof.
- Ordinary-input combat/traversal evidence: [twenty-row matrix](content-matrix.md).
- Browser acceptance: 228 assertions, zero runtime errors, English/Chinese × desktop 1280×900, portrait 390×844, narrow portrait 320×568, landscape 900×450. Uses real DOM controls for selection, difficulty, pause, touch jump and refresh/resume; explicitly manipulated actors only for hit/result/lifecycle scenes.
- Reduced-motion assertions: zero camera shake and full-screen flash on confirmed hits.
- Resume verifies exact score/kills, prior stage results and one chosen forge rank after a fresh document. Denied real localStorage verifies memory-only warning despite the shell adapter swallowing write exceptions.
- Existing arcade E2E: 15 passed, 9 intentionally skipped for nonapplicable device cases; all catalog routes remain reachable.
- Thirty-render active-scene mean: desktop 16.9ms, portrait 3.9ms, narrow 3.2ms, landscape 6.3ms on this Mac/headless Chromium. These are synchronous render measurements, not device FPS or production latency guarantees.

## Review resolutions

Independent final review found null resume result entries could throw; inherited difficulty names could enter numeric tuning; and displayed damage omitted final target modifiers. Regression inputs first reproduced the first two failures, then object guards/own-key validation fixed them. Hit labels now use final upgrade/armor-adjusted damage. Historical three-level snapshot hashes were deliberately refreshed for momentum/overdrive changes after behavioral tests passed; original map modules remain untouched.

## Limits

Actual phone hardware ergonomics and subjective audio/engagement are unverified. Browser audio context/lifecycle checks establish sound execution, not pleasant headphone output. No claim of twenty unique skeletal animation systems: twenty encounters reuse three rigs with distinct scripts, ornaments and acts. Saves are on this device at stage boundaries; exact mid-fight/cloud resume is out of scope. New scoring stays local to avoid mixing difficulty/campaign versions with historical public scores.

## Release

Published gameplay commit `c6ac6cacc8d684411843303f8f2b9bdfaa7366d7` through [Pages run 39119938452](https://github.com/flyfy1/integ-games/actions/runs/39119938452). Both ordinary and cache-busted public `build-version.json` returned this exact commit with `dirty: false`. Public browser acceptance repeated all 228 assertions with zero runtime errors. The returning profile successfully started stage XX on Hard, preserved its storage sentinel, then loaded all five acts offline. Evidence is generated in `test-results/ashfall-release/` and `test-results/ashfall-campaign-acceptance/` by the checked-in scripts. The rollback is the previous Pages commit a33bed5fc4c95c0f2e10eaddf9eb02b1ba64b835; legacy v2 saves remain intact.

Service-worker audit: `https://games.integ.life/sw.js`, root scope `/`, manifest start `.` and scope `/`, Workbox shell/hash-asset precache with `index.html` navigation fallback. Existing shell calls `updateSW(true)` on a waiting update (automatic reload); this release does not change that policy or clear user stores. Public pre-release worker returned 200 JavaScript, `Cache-Control: max-age=14400`, Cloudflare REVALIDATED. A dedicated returning-profile was warmed before publication to test actual update and offline startup. Installed standalone windows and multiple simultaneous tabs are not part of this evidence. Shared arcade CSS is unchanged at 27.57 KB and exceeds the inherited global budget; Ashfall's own CSS is 10.8 KB.

### Publication cache diagnosis

The first returning-profile check timed out while fresh browsers passed. The fast red-capable loop fetched `/sw.js` and `/sw.js?release=c6ac6ca` then compared their bodies: `cmp` exited 1. Their SHA-256 values were respectively `616b4d3a107c6777f12dd23012732e240436d552268897d443f1c31f3133e061` and `30d9bc848d0ee8e6d8c83db2442e52c10bd0f28a3a39caf242e81517d4885880`. Ranked hypotheses were CDN staleness, browser HTTP cache, then worker installation failure. After normal CDN propagation the same unmodified command exited 0. The original returning-profile test then passed without clearing caches or storage, and the visible old IAB tab also showed all 20 stages. This confirms transient stale public worker delivery during rollout; no worker-code fix or CDN purge was needed. A green workflow alone remains insufficient: retain the public body comparison and controlled-profile acceptance on future releases.
