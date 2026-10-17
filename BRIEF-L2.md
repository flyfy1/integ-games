# Task: Build Level 2 for Ashfall (integ-games)

You are working in a fresh clone of the integ-games repo (Vite + TypeScript site).
The game is **Ashfall**, source in `src/games/ashfall/`:

- `index.ts` — game module registration (meta + mount)
- `game.js` — the engine (~1500 lines): player, combat (slash combo / shotgun / roll),
  enemies (`husk`, `hound`, `brute`, `drone`), boss ("the Warden"), checkpoints,
  gate-locked ambushes, upgrade cards, HUD, touch controls
- `level.js` — Level 1 data: one continuous 12000px descent through 3 zones
  (THE DEAD WOODS / THE HOLLOW QUARTER / THE IRON FOUNDRY) ending in the boss arena.
  Exports: `VIEW_W/VIEW_H/FLOOR/WORLD_END/ARENA/ZONES/zoneIndexAt/buildSolids/PITS/
  ENEMIES/MEDKITS/CHECKPOINTS/LIGHTS/PROPS/AMBUSHES`
- `art.js` / `sprites.js` / `audio.js` — rendering, sprites, sound

## Your mission

Design and implement a **complete, playable Level 2** for Ashfall that begins after
the Warden falls in Level 1. You have creative freedom on theme and encounters,
within these requirements:

1. **A new world**: 3 new zones with their own visual identity (palette, lighting,
   props, pit hazards). Zone titles follow the existing pattern: English name +
   Chinese sub (e.g. `sub: '阴 暗 死 林'`). Level data goes through the same data
   model as Level 1 — generalize `level.js` / the engine wiring as needed so both
   levels are data-driven, with **zero behavior change to Level 1**.
2. **Full layout**: solids/platforms, pits, enemy placements, medkits, checkpoints,
   world lights, props, and at least 2 gate-locked ambushes — a complete descent
   comparable in scope to Level 1, with a difficulty ramp above Level 1.
3. **A finale**: a boss encounter in a closing arena — either a new boss or a
   substantially reworked Warden variant with **at least one attack pattern that
   does not exist in Level 1**.
4. **Flow**: clearing Level 1 transitions into Level 2; clearing Level 2 reaches a
   proper victory/completion state. Also add a direct way to start Level 2 for
   testing (level select, URL param, or equivalent — follow codebase patterns),
   without breaking the normal Level 1 start.
5. **Compatibility**: existing systems keep working in Level 2 — combat, upgrade
   cards, checkpoints/respawn, HUD, pause, touch controls. No new npm dependencies.
   Match the existing code style.

## Process (all four phases, autonomously — do not stop to ask questions)

1. **Implement** Level 2.
2. **Verify**: run `npm install` if needed, then `npm run build` and `npm test`
   must pass. Run the existing Ashfall playtest/screenshot scripts
   (`scripts/ashfall-playtest.mjs`, `scripts/ashfall-shots.mjs`) adapted to reach
   Level 2 where practical; fix what fails.
3. **Self-iteration round**: review your own Level 2 critically — play it via the
   playtest/screenshots, look for pacing, difficulty, readability, visual and
   fairness problems — then make **one concrete improvement pass** and re-run the
   build + tests.
4. **Commit** everything on your assigned branch (see your run instructions) with
   commit messages carrying the line `Built-By: <your agent + model>` (exact value
   in your run instructions), and write `NOTES-L2.md` at the repo root: design
   summary, how to start Level 2, what you changed in the self-iteration round,
   and known issues.

## Hard boundaries

- Do NOT push anything, do NOT deploy, do NOT touch `main`.
- Do NOT change Level 1's gameplay, layout or balance.
- Leave the working tree clean with all work committed when you finish.
