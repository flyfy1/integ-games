# Ashfall Level II — The Rising Deep

Implemented from `BRIEF-L2A.md` on `ashfall-level2-codex`, based on `d30de29`.

## Mechanical changes

Level II now climbs 2,240 world pixels: the Drowned Aqueduct starts at y=450,
then the Glass Archive and Storm Crown rise to the Tempest Warden at y=-1790.
The 12,000-pixel route has 32 rises of 70 pixels, normally 250 pixels apart,
with wide, flat refuge platforms for the three seals. Broken spans have short
20–80-pixel gaps, including an intermediate aqueduct catwalk. Every rise and
every gap was exercised with ordinary jump inputs in the live simulation.
The movement constants remain 300 px/s running, 730 px/s initial jump velocity,
and 2050 px/s² gravity; neither jump assistance nor new movement abilities were added.

The vertical camera, enemy/drone placement, shrines, pickups, lights, scenery,
boss attacks, telegraphs and collision queries now respect the local elevation.
`art2.js` and the existing palettes, props, textures and lighting assets are reused.
The roster remains 23 placed enemies plus 10 seal-wave enemies. There are seven
checkpoints, eight placed medkits, Salvaged Edge and Storm Mantle.

A dark, continuous flood surface crosses the viewport, with three foam/ripple
lines. Level II alone has a slim HUD showing clearance in pixels and the current
rise/pause/gate/summit state. Cyan screen-edge warning tint and a two-tone audio
cue warn of nearby rising water. The warning is suppressed during a safe hold.

## Water tuning

| Setting | Value |
| --- | --- |
| Zone IV rise | 22 world px/s |
| Zone V rise | 28 world px/s |
| Zone VI rise | 34 world px/s |
| Start and respawn baseline | 150 px below the checkpoint floor |
| Initial grace | 5 seconds |
| Checkpoint activation / respawn grace | 3 seconds |
| Threatened gate exit grace, added in the iteration | 5 seconds |
| Active seal / phase-one arena cap | 18 px below that refuge's floor |
| Warning distance / sound interval | 180 px / 1.5 seconds |
| Water contact damage | 60 HP |

Rates use simulation time, including the existing shared hit-stop/slow-motion
rules. A steady staircase climb is faster than the flood. Activating a checkpoint
pauses the water without lowering it; respawning resets its checkpoint baseline.
Water contact immediately returns the player to the last checkpoint, clears
hazards and counts a fall. Nonlethal contact retains HP after the 60-point hit;
lethal contact uses the normal full-health respawn. Combat invulnerability, rolls
and Storm Mantle cannot evade the flood. Dying to enemies resets the water too.

While a seal is active, the flood can approach but cannot cover its floor.
Phase one similarly caps it under the summit, and phase two locks its height;
the existing conduit-grid lightning, second pulse and safe gaps remain intact.

## Verification and the one self-iteration round

The first completed implementation passed the build and all 80 tests. Real
Chromium runs then completed:

| Before the iteration | Play time | Kills | Falls / flood rescues | Runtime errors |
| --- | ---: | ---: | ---: | ---: |
| Direct Level II, desktop | 167s | 26 | 2 / 2 | 0 |
| Direct Level II, mobile | 172s | 27 | 3 / 3 | 0 |
| Full Level I → II campaign | 302s | 61 | 1 / 1 | 0 |

Reviewing the logs and desktop/mobile screenshots exposed the biggest feel
problem: after winning a fully flooded seal, its 18-pixel clearance lasted only
0.53–0.82 seconds. Players could be swept back before reaching the next stair.
The single self-iteration adds five seconds of exit grace when a cleared seal's
water is within warning range. The HUD counts down `EXIT`, and the clear message
says `GATE OPEN · CLIMB`. Water stays at its existing height. Checkpoint activation
cannot shorten an exit grace already in progress. This gives room to cross even
the widest refuge from its far end at the normal running speed.

During initial implementation, the browser also caught an input-bot navigation
bug: it stopped horizontal movement to aim at drones while crossing shafts. Its
Level II navigation now commits to landing before resuming combat. It still only
sets the same held inputs and action buffers as a player; completion runs never
warp, change health, alter velocities, kill enemies, or use invulnerability.

The completion runner advances the real game at fixed 60 Hz, samples at half-
second intervals and writes two-second state logs. Simulated play time is
reported above, not wall-clock execution time. `--mobile` opens the shell through
its real Start game button and checks all five touch actions. Rendering timing
can change random outcomes even with the same initial `--seed`.

After the iteration, `npm run build` passed and `npm test` passed all **80 tests
in 16 files**. All three fresh browser runs reached final victory, cleared all
three seals, retained both upgrades, and recorded zero console/runtime errors:

| After the iteration | Play time | Kills | Falls / flood rescues | Runtime errors |
| --- | ---: | ---: | ---: | ---: |
| Direct Level II, desktop | 155s | 26 | 0 / 0 | 0 |
| Direct Level II, mobile | 154s | 24 | 0 / 0 | 0 |
| Full Level I → II campaign | 293s | 60 | 0 / 0 | 0 |

The post-gate rescues disappeared in these runs. The final campaign log contains
both levels and the interlude; its final score was 25,285. All six requested final
visual fixtures were regenerated and visually inspected. `git diff --check`
passed, and Level I layout, `art2.js`, package manifest and lockfile have no diff.


Regression tests cover rise bands, start/checkpoint grace, combat-death reset,
nonlethal and lethal flood rescue, iframe/roll bypass, all three gate caps and
exit grace, both boss-phase flood locks, every rise and gap, carry-over totals,
one-time final completion, restart selection, upgrades, failed/retried waves,
drone containment, lightning timing/damage/safe gaps, pause and touch jumping.

Level I's `level.js` is byte-identical to `d30de29` (SHA-256:
`1d3fba5768ba79189f45f742754f8f9054bc5d23505c7d86a0d3b13fd05416fb`).
A temporary differential Vitest audit also passed: the committed pre-ascent game
and the new game produced identical per-frame Level I player, boss, enemy,
checkpoint, camera, combat totals and timing states all the way to the interlude.
Its normal handoff, carry-over stats, final score settlement and restart contracts
remain covered by the committed tests. The handoff text now introduces the ascent.

## Reproduce and inspect

No npm dependencies were added. This workspace uses the existing ARM64 Chromium:

```sh
export CHROMIUM_PATH=/home/songyy/.cache/ms-playwright/chromium-1248/chrome-linux-arm64/chrome
npm run build
npm test
node scripts/ashfall-playtest.mjs --level=2 --shots --label=final --max-minutes=8
node scripts/ashfall-playtest.mjs --level=1 --shots --label=final --max-minutes=12
node scripts/ashfall-playtest.mjs --level=2 --mobile --shots --label=final --max-minutes=8
node scripts/ashfall-shots.mjs water,gate-hold,flood-boss --level=2 --label=final
node scripts/ashfall-shots.mjs water,gate-hold,flood-boss --level=2 --mobile --label=final
```

Use your own installed browser path, or omit `CHROMIUM_PATH` when Playwright's
default browser is installed. Direct entry remains `/play/ashfall?ashfall-level=2`;
`/play/ashfall` starts the full campaign.

Logs and natural gameplay captures are in:

- `test-results/ashfall-level2-final/`
- `test-results/ashfall-level1-final/`
- `test-results/ashfall-level2-mobile-final/`

The three requested visual scenes, captured and inspected at desktop 1280×800
and mobile landscape 900×450, are:

| Scene | Desktop | Mobile, including controls |
| --- | --- | --- |
| Mid-aqueduct water chase | [water](test-results/ashfall-shots-level2-final/water.png) | [water](test-results/ashfall-shots-level2-mobile-final/water.png) |
| Flood held at a seal | [gate](test-results/ashfall-shots-level2-final/gate-hold.png) | [gate](test-results/ashfall-shots-level2-mobile-final/gate-hold.png) |
| Phase-one summit flood lock | [boss](test-results/ashfall-shots-level2-final/flood-boss.png) | [boss](test-results/ashfall-shots-level2-mobile-final/flood-boss.png) |

These named visual fixtures deliberately position actors and water to inspect
specific scenes; they are separate from the input-only completion runs. Fast
play can keep the flood off-screen in the aqueduct, so a natural run does not
always produce a close-chase screenshot there. `*-initial/` directories retain
the pre-iteration evidence. Artifacts are local, ignored verification output.

## Known limits

- This is an ascending terrace route, with horizontal combat refuges, rather than
  a narrow vertical tower. Progress follows the existing left-to-right campaign.
- Automated completion and mobile emulation do not replace broader human or
  physical-device difficulty testing. The warning sound is implemented; headless
  Chromium runs do not establish its subjective audibility on a phone speaker.
- The comments SDK is stubbed only in the local browser harness to avoid its
  unrelated localhost CORS errors. Game console/runtime errors still fail runs.
- Checkpoints and upgrades remain in-memory for the mounted run, as before.
- No push or deployment was performed.
