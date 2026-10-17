# Ashfall — Level II: The Storm Below

## Design and flow

The Warden's destruction opens a second 12,000px descent with three new chapters:

- **IV · THE DROWNED AQUEDUCT / 沉 没 水 道** — jade flood arches, sluice gates, reeds and dark water; introduces mixed ground/air encounters early.
- **V · THE GLASS ARCHIVE / 琉 璃 秘 库** — violet vaulted stacks, luminous obelisks, broken-glass pits and optional elevated medical supplies.
- **VI · THE STORM CROWN / 风 暴 王 冠** — blue needle towers, electrical coils, charged chasms and the final sealed approach.

The layout includes five pits, alternate platforms, 23 placed enemies, three gate-locked waves containing 10 additional enemies, eight medical supplies, seven checkpoints and 18 world lights. More brutes and drones increase encounter pressure; extra checkpoints limit repeat travel. Existing enemy health, player movement, shotgun, slash combos and roll timing remain unchanged.

The **Tempest Warden** has 460 armor and 560 core health, a distinct steel-blue body and insulator crown. Its new **conduit grid** locks vertical lightning columns when the warning begins. Step sideways between them; jumping does not avoid lightning. Phase two adds a second, shifted discharge with a 1.1-second warning. Both pulses leave a damage-free gap between them. Existing Warden attacks remain in the mix.

At the archive checkpoint, **Salvaged Edge** adds 15% melee damage. At the crown checkpoint, **Storm Mantle** reduces combat damage received by 15%. Cards explain these automatic upgrades; they survive checkpoint respawns and reset on a new run. The original checkout had chapter cards but no upgrade selection system, so neither input bindings nor Level 1 balance was changed to accommodate them.

After Level 1's original death cinematic, a five-second interlude automatically starts Level 2 (input can advance it after 2.5 seconds). Health and shells refill. Score, elapsed play time, kills and deaths carry forward; checkpoint and encounter state reset. Time bonuses and death penalties are applied once per level. Only the final victory reports campaign completion. Restart returns to the level selected when the cabinet was opened.

## Starting and verifying

Normal campaign: `/play/ashfall`.

Direct Level 2: `/play/ashfall?ashfall-level=2`.

Debug Level 2: `/play/ashfall?ashfall-level=2&ashfall-debug`.

```sh
npm run build
npm test
node scripts/ashfall-playtest.mjs --level=2 --shots --max-minutes=20
node scripts/ashfall-playtest.mjs --level=1 --max-minutes=20
node scripts/ashfall-shots.mjs --level=2
node scripts/ashfall-shots.mjs crown,roll,conduit --level=2 --mobile
```

`--level=1` runs the entire two-level campaign. Both browser scripts accept the existing `CHROMIUM_PATH` environment override; this workspace needed it because the installed browser revision differed from Playwright's default. No npm dependencies were added.

Browser scripts use dynamically assigned local ports and replace only the external comments SDK with an empty script, avoiding unrelated localhost CORS failures. Game runtime errors still fail verification. Screenshots and JSON logs go to ignored `test-results/ashfall-level{1,2}/` and `test-results/ashfall-shots-level2/` directories; mobile captures have a `-mobile` suffix.

## Implementation boundaries

`level.js` is unchanged. `levels.js` wraps the original exports and the new `level2.js` data. Level-specific values and art are selected per mounted game instance. `art2.js` builds the new scenery, props, textures and palettes with the existing canvas asset pipeline. The boss renderer changes only for the Tempest variant. Level 1 retains its original layout, placements, checkpoints, boss statistics, attack weights and timing; the intentional flow change occurs after its boss falls.

## Self-iteration

The first full screenshot-enabled playtest cleared all three seals and the boss, but spent excessive time chasing the last drone at the first and final seals. Screenshot review also showed blue lightning warnings blending into the storm backdrop.

The concrete improvement pass:

- Constrains Level 2 ambush drones' retreat targets and movement inside the seal, leaving room to close distance. The input-only test bot now jumps to line up horizontal shotgun shots against high drones; no combat assistance is enabled for human play.
- Changes pre-strike columns to amber, adds floor charge indicators, and moves the instruction into a dark HUD panel above the lighting pass. Live lightning remains blue-white. Phase two explicitly cues the second sidestep.
- Removes duplicate edge columns in the second pulse and plays one discharge sound per pulse instead of one per column.
- Narrows the first storm-zone gap from 170px to 150px after a held-jump regression exposed a tight landing. Raised pit-edge markers now follow actual takeoff height. Archive pits use glass shards rather than water-shaped ripples.
- Resets Level 2's safe fall-return position at respawn, preventing a later fall from returning to a location from the previous life.

Regression coverage exercises campaign handoff and one-time completion, reset behavior, retained upgrades, failed/retried ambushes, drone containment, lightning lock-in, damage and safe gaps in both phases, every pit with normal jump input, pause and touch controls.

## Verification results

- `npm run build`: passed after the improvement pass (TypeScript, Vite, PWA generation and 21 share pages).
- `npm test`: all 74 tests across 16 files passed after the improvement pass, including ten dedicated Level 2 tests covering all five physical pit crossings and both lightning pulses. One earlier concurrent run hit the existing catalog import test's five-second timeout; the final unmodified suite passed in 9.73 seconds once the browser workload finished.
- Direct Level 2 browser playtest: victory in 177 simulated seconds, 33 kills, 2 deaths, all three seals and both upgrades; zero console/runtime errors.
- Full campaign browser playtest: Level 1 → Level 2 → victory in 328 simulated seconds, 69 kills, 3 deaths; zero console/runtime errors.
- Desktop screenshot script passed for all three zones, combos, shotgun, both boss phases and the conduit attack. Mobile screenshot checks passed for the crown, roll and both conduit pulses, including the shell's real Start game flow and all five touch action buttons.
- The original `level.js` has no diff.

## Known limitations

- The finale deliberately reworks the Warden rig and existing sound library; it is not a new skeleton or soundtrack.
- Checkpoint and upgrade progress lasts for the current mounted run, matching the original game; refreshing starts over.
- Automated combat uses normal input buffers but is not a substitute for broad human difficulty testing. Outcomes vary with combat randomness.
- Browser artifacts are local verification output, not committed assets. The external comments service is outside this game verification.
