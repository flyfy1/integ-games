# Ashfall three-level merge

Implemented locally on `ashfall-three-levels`, starting at Codex `ab048a4`, using the approved `../DESIGN-MERGE.md` and `BRIEF-MERGE.md`. The source checkout at `../source-claude` remains unchanged. Nothing was pushed or deployed.

## Implementation

- One registry and engine now serve **I · THE FIRST DESCENT**, **II · THE RISING DEEP**, and **III · THE LAST DESCENT**. The typed contract in `levels.d.ts` separates terrain, flood, upgrades, containment, enemy HP, boss variant, art builder, atmosphere and completion copy. Numeric level IDs are used for selection, identity, records and reporting, not mechanics.
- Original `level.js`, `level2.js` and `art2.js` are unchanged. Original art seeds remain 7 and 23. The mutable arena floor is explicitly separate from local placement and collision queries; II's −1790 summit resets to III's 450 floor.
- Ported III geometry and content: 13,000px world; arena 12000–13000, trigger 12180; 31 placed enemies plus 13 across three seals; seven pits, five checkpoints, eight medkits. All ten geometry/content collections, including generated solids, were compared directly with the source and match. Chapters alone become VII–IX. Raised-ground placement fixes the husk at x=5800 to y=342 without changing I's placement rules.
- Added the complete railyard/wastes/cathedral art family, static water/glass/abyss rendering, props, lighting, particles and 84/90/94 BPM audio. III uses its own fresh props dictionary, preserving the different II/III spires. Only the active art set is retained; Start/Continue display a loading state before rebuilding canvases, with simulation frozen.
- Added the Reforged palette, names, 460 armor / 560 core, alternating 115px pillar waves and chain hook. Pillars retain 0.9/0.75s warnings, 0.34s active duration and 14 damage. Hook retains locked direction, 980px/s flight, 8 damage, 640px/s pull, retraction and telegraphed slam follow-up. Cleanup covers capture, hazards and scheduled events on death, respawn, transform, boss death and handoff. Bot avoidance is additive to the existing ascent/conduit logic.
- III enemy HP is rounded once at shared spawn, including ambushes and respawn `maxHp`: husk 39, hound 28, brute 138, drone 30. Damage, movement, scoring and boss HP are not multiplied.
- Open DOM level selection supports 1/2/3, arrows, Tab, Enter, mouse and touch. Choice alone never starts. Background taps and ordinary title keys do nothing. The shell's mobile Start opens this selector. URLs preselect without autoplay; unknown values select I; selection preserves unrelated query parameters.
- A separate run object retains totals and per-level results. Handoffs reset level state, HP/ammo, camera, pickups, enemies and hazards; II upgrades expire before III. Interludes wait for explicit Continue after the existing 2.5s guard. Restart returns to the run's selected starting level. Results show the route, each level and totals, with Replay and Level select controls.
- Only a genuine I→II→III finale calls `reportScore` and `reportComplete(1)`, once per run. Shorter routes save local records only. Progress uses `ashfall-progress-v2`; local bests use `ashfall-bests-v2` per starting level. The legacy unlock credits I only; legacy scores remain historical. Missing, malformed or denied storage cannot block play.
- The persistent DOM ribbon identifies the level and chapter during gameplay, death, pause, cinematics and interludes. Cards, boss bars and results carry level labels. The old II-only canvas caption is removed. Catalog/help copy now describes all three levels and selection.

## Verification actually run

Final build and tests:

| Check | Result |
| --- | --- |
| `npm run build` | Pass: TypeScript, Vite, PWA generation and 21 share pages |
| `npm test` | **107 passed**, 19 files |
| Shared `npm run test:e2e` | **15 passed**, 9 existing device-specific skips; zero failures |
| `scripts/ashfall-acceptance.mjs` | **101 assertions passed**, zero runtime errors |
| `scripts/ashfall-regression.mjs` | **8/8 pixel-identical** seeded I/II gameplay-region comparisons against `ab048a4` |
| Pre-refactor simulation snapshots | Both I/II SHA-256 traces remain unchanged |
| Source geometry/content comparison | All 10 collections match |

The pixel comparisons cover all three zones and the boss arena for both original levels. They exclude intentional HUD/card changes: zones compare y=120–470; boss scenes stop at y=440 above the changed boss-bar band. The simulation traces cover exploration, checkpoints, death/respawn, seals and both boss phases.

New tests exercise actual held-jump traversal of every III pit, both intermediate ledges, all checkpoints/seals, raised enemy spawns, HP scaling, pillar warnings/damage/evasion, hook capture/pull/slam and actual jump/roll evasion. Campaign tests cover all starts, frozen interludes, upgrade expiry, cleared hazards/camera, restart, URL/storage behavior and exactly-once reporting.

Browser acceptance uses desktop 1280×800, portrait 390×844, small portrait 320×568 and landscape touch 900×450. It exercises real DOM keyboard/pointer/touch controls, audio-context unlock, native/CSS fullscreen, shell pause/resume, death identity, URL preservation, legacy storage and minimum 44px menu targets. All four audio contexts reached `running` after Start.

### Input-only completion runs

These use the real cabinet and bot input buffers. They do **not** warp, change HP, kill enemies or force boss attacks. I/II single-level checks stop at their completion interludes; the shipped run still continues forward to III.

| Starting route / check | Seed | Score | Kills | Falls | Simulation seconds | Runtime errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Direct I, stop at I completion | 1234 | 12816 | 36 | 0 | 142 | 0 |
| Direct II, stop at II completion | 1234 | 12131 | 25 | 1 | 181 | 0 |
| Direct III finale | 2468 | 13218 | 44 | 4 | 251 | 0 |
| Full I→II→III | 1234 | 39258 | 104 | 2 | 513 | 0 |
| Full I→II→III | 777 | 36734 | 105 | 10 | 599 | 0 |
| II→III, landscape touch | 777 | 25365 | 68 | 5 | 416 | 0 |

Every completed level cleared all three seals. II collected both upgrades; III had none. Per-level records are retained before handoffs. Seeded browser rendering consumes some random values, so wall-clock rendering differences can change later bot outcomes; the fixed-step unit traces are the deterministic regression proof.

### Evidence files

Generated evidence is intentionally gitignored under `test-results/`, and is present locally:

- [Verification summary](test-results/ashfall-verification/summary.json) and [logs](test-results/ashfall-verification/logs/).
- [Browser assertions/audio states](test-results/ashfall-acceptance/acceptance.json) and [baseline pixel hashes](test-results/ashfall-regression/pixels.json).
- Completion logs: `ashfall-level1-final-direct`, `ashfall-level2-final-direct`, `ashfall-level3-final-direct`, `ashfall-level1-final-campaign`, `ashfall-level1-final-campaign777`, and `ashfall-level2-mobile-final-route`, each containing `playtest.json`.
- **303 PNG captures**, including desktop/portrait menus, HUD in each level, all nine chapter intros, all three bosses and phase-II cards, flood/conduit scenes, pillar future/imminent/active waves, hook telegraph/flight, both interludes, final results, death, pause and fullscreen.
- Desktop/portrait visual fixtures: `ashfall-shots-level{1,2,3}` and `ashfall-shots-level{1,2,3}-mobile-portrait`; III also has landscape-touch fixtures in `ashfall-shots-level3-mobile`.
- [Full campaign results](test-results/ashfall-level1-final-campaign/10-victory.png), [II→III interlude](test-results/ashfall-shots-level2/interlude.png), [portrait pillar warning](test-results/ashfall-shots-level3-mobile-portrait/pillars-imminent.png), [landscape hook warning](test-results/ashfall-shots-level3-mobile/hook-telegraph.png), and [mobile shell pause](test-results/ashfall-acceptance/portrait-shell-pause.png).

`ashfall-shots.mjs` uses deliberately manipulated visual fixtures. Those images are separate from the input-only completion evidence above.

## One self-iteration round

Reviewing the first desktop and phone captures showed that III's attacks communicated geometry better than the required response, especially when the canvas shrank in portrait. Added a reserved, fixed-CSS-size DOM cue row: **PILLARS · STEP ASIDE, THEN SWITCH LANES** and **CHAIN HOOK · JUMP OR ROLL**, plus a pull/slam cue. Attack geometry, timing and damage remain unchanged.

The same clarity pass fixed ribbon overlap with shell controls in 320px portrait menus and desktop fullscreen. Expanded acceptance also exposed a pre-existing mobile pause omission: Ashfall was absent from the shell's continuous-game registration, and the shared pause overlay was outside native fullscreen. Added only Ashfall's registration and placed its pause overlay inside the canvas container, leaving the ribbon visible. Paused keyboard/touch input no longer buffers an unintended action for Resume.

Re-ran affected unit/build/browser checks, pattern captures, all viewport acceptance, the shared E2E suite and campaign/short-route playtests during this round. The final validation results above include these fixes.

## Reproduction

```sh
npm ci
npm test
npm run build
export CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
npm run test:e2e
node scripts/ashfall-acceptance.mjs
node scripts/ashfall-regression.mjs
node scripts/ashfall-playtest.mjs --level=1 --single-level --label=direct
node scripts/ashfall-playtest.mjs --level=2 --single-level --label=direct
node scripts/ashfall-playtest.mjs --level=3 --seed=2468 --label=direct
node scripts/ashfall-playtest.mjs --level=1 --seed=1234 --shots --label=campaign
node scripts/ashfall-playtest.mjs --level=1 --seed=777 --label=campaign777
node scripts/ashfall-playtest.mjs --level=2 --seed=777 --mobile --shots --label=route
node scripts/ashfall-shots.mjs menu,intro1,intro2,intro3,boss,phase2,pillars,hook,final --level=3
node scripts/ashfall-shots.mjs menu,intro1,intro2,intro3,pillars,hook,final --level=3 --mobile --portrait
```

The Playwright configuration honors `CHROMIUM_PATH` and keeps its output in `test-results/e2e` so shared-suite cleanup cannot erase Ashfall captures. A test-only Storage fallback fixes Node 26's undefined native `localStorage`; the four baseline leaderboard failures now pass without changing production storage behavior.

## Limits and local handoff

- Browser bot success and automated touch input are not human difficulty or physical-device ergonomics validation. No physical iPhone/Android or Safari run was performed. Audio unlock/running state was verified; speaker output was not assessed by a human listener.
- Tiny portrait screens may scroll the menu; landscape remains the roomier gameplay presentation. Level identity and attack instructions stay at readable DOM sizes.
- Historical leaderboard scores may cover the old campaign length. They were neither deleted nor claimed comparable. Browser tests used fresh, unauthenticated contexts; no production scores were submitted.
- No source checkout edits, push, deployment, production data changes or dependency upgrades. Task-owned Vite/browser processes close in script `finally` blocks. `BRIEF-MERGE.md` remains the user's original untracked file.

Implementation commits: `1acde73` (capabilities), `54cebb4` (III port), `68ebdd5` (selection/campaign/ribbon), `be1db1d` (self-iteration and final acceptance). All commits, including this notes handoff, end with `Built-By: Codex (gpt-6-astra)`.
