# FX recipes — shared TransientFeedback + three pilots

Implemented locally on `fx/recipe-interpreter-pilot` from `main` = `58626b7`, following the approved design discussion and implementation brief kept outside the repository (`~/vfx-work/DESIGN-DISCUSSION.md` and `~/vfx-work/IMPLEMENTATION-BRIEF.md`; the full report is `~/vfx-work/IMPLEMENTATION-OUT.md`). Nothing was pushed or deployed. Ashfall is untouched.

## Layers

- **Step 0, `94bcf23`**: `src/games/_shared/fx.ts` replaces the inline arcade-kit fx. Legacy `burst`/`flash` issue the original draw calls (proved against a verbatim copy of the old implementation in `tests/fx.test.ts`). `draw()` advances effects when a game stopped calling `step()`, so game-over flashes fade instead of freezing. Kit pause freezes fx. Under reduced motion, burst becomes a static ≤160ms outline at the event and flash becomes a short edge outline; there is no full-canvas fill and no displacement. Snake's pickup ring is static under reduced motion. The other 7 kit games and hex-puzzle look unchanged in normal motion.
- **Pilots**: each game owns its recipes in `src/games/<slug>/fx-recipes.ts` (there is no shared preset library):
  - **breakout**: a hit only chips the brick (violet chips, no gravity, white pinpoint). A break throws mint shards that fall, with a brick-shaped white core and a ring, aimed along the ball's incoming path. The paddle gets small white sparks along the outgoing ball.
  - **bubble**: every popped bubble gets its own round pop, rippling outward by distance from the shot. Detached bubbles get a gold unhook ring and a splash where they leave the board. There are no squares.
  - **block-drop**: each cleared row gets a local flash plus pixel chunks in that row's real cell colours. More rows means more and faster chunks, staggered bottom-up, and four lines add a gold ring. The old whole-well flash and its hand-written decay (which never reached zero and kept the loop redrawing) are gone.

## Review loop

`npm run fx:sheet` (no browser, no dependencies; Node ≥ 22.18 for type stripping) renders every pilot recipe through the real interpreter, at fixed times with a fixed clock and seed, next to what the game drew before. It writes `test-results/fx-contact-sheet/<slug>-fx.png`. To make a variant, edit a number in `fx-recipes.ts` and rerun.

## Not verified here

This machine has no `node_modules` and the brief forbids installing packages. `tsc`, `vitest` (jsdom), `vite build` and Playwright therefore have **not** been run. `tests/fx.test.ts` and the pure source-level suites were executed through a node:test shim outside the repo. Real-device feel and real-canvas antialiasing have not been checked.
