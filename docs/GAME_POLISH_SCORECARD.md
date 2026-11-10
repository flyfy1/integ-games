# Game polish scorecard

Review date: 2026-08-10. Scores reflect the current implementation, checked against the seven dimensions in `GAME_POLISH_EVALUATION.md`: Input / Motion / Audio / State / Reward / Mobile / Resilience. “Before” remains `n/a`: there is no preserved, independently reviewable pre-polish build, so historical scores would be fabricated. Scores are deliberately code-evidence based, not claims of visual playtesting.

| Game | Before → after | Key finding and verified improvement | Disposition |
|---|---|---|---|
| Merge 2048 | n/a → 5/5/4/5/5/4/5 | Tiles retain `data-tile-id` identities; a 150 ms slide, merge pulse, spawn animation, score delta, no-op shake, terminal feedback, and an animation input lock are implemented. Reduced motion renders state immediately and pause/destroy cancel timers and WAAPI animations. | Flagship-ready; move/merge cues are grouped rather than a separate spawn cue. |
| Block Drop | n/a → 4/4/4/4/4/4/5 | Active drop/rotate controls, line-clear flash and clear/fail audio are visible; RAF and mobile held input are cleared on lifecycle changes. | Meets floor |
| Neon Snake | n/a → 4/4/4/4/4/4/5 | Queued turns, food pickup pulse, collect/fail cues and safe RAF/mobile cleanup are implemented. | Meets floor |
| Pocket Mines | n/a → 4/3/4/4/3/4/4 | Tap/hold reveal and flag actions, reveal cascade, terminal mine reveal, and success/fail state are explicit; long-press timer is cancelled on pause/destroy. | Meets floor |
| Daily Solitaire | n/a → 3/3/4/4/3/3/4 | Selection, legal moves, foundation progress and completion messaging are clear; it deliberately remains a calm, mostly state-based card interaction. | Meets floor (already meets target for turn-based play) |
| Calm Sudoku | n/a → 4/3/4/4/3/4/4 | Keyboard/keypad entry, error cue, scoring and completion state are clear; it is intentionally restrained rather than animated. | Meets floor (already meets target for turn-based play) |
| Word Trail | n/a → 4/3/4/4/4/4/4 | Drag-path input, found-word collection, score/best updates and completion feedback are explicit. | Meets floor |
| Memory Flip | n/a → 4/3/4/4/4/4/5 | Match collection and mismatch hit feedback are explicit; the mismatch lock/timer honours reduced motion and is cancelled safely on pause/destroy. | Meets floor |
| Perfect Stack | n/a → 4/3/4/4/4/4/5 | One-action mobile control, perfect-catch upgrade cue, score, fail and completion feedback are present; continuous motion is lifecycle-safe. | Meets floor |
| Sky Flap | n/a → 4/3/4/4/4/4/5 | Responsive flap input, gate-clear and fail cues, score progression, stage pause and continuous-loop cleanup are present. | Meets floor |
| Brick Pulse | n/a → 4/4/4/4/4/4/4 | Paddle/brick hits burst through shared FX, cleared bricks and level transitions use distinct clear/upgrade cues, and loss is flashed. | Meets floor |
| Pixel Defense | n/a → 4/4/4/4/4/4/4 | Shots create a muzzle burst, enemy hits burst, wave clears flash, and shoot/hit/clear/fail cues map to those events. | Meets floor |
| Metro Dash | n/a → 5/4/4/4/4/4/4 | Lane shifts, jump and duck each have distinct feedback; jump/shift bursts, failure flash and milestone upgrade feedback are implemented. | Meets floor |
| Trap Trail | n/a → 4/4/4/4/4/4/4 | Jump, landing, hazard fail and exit clear each have an appropriate cue and shared FX feedback. | Meets floor |
| Tiny Wheels | n/a → 4/4/4/4/4/4/4 | Pedal engagement bursts, crash flash and milestone upgrade feedback make the driving state legible. | Meets floor |
| Fruit Orbit | n/a → 4/4/4/4/4/4/4 | Drop and merge bursts, overflow flash, and merge/collect/upgrade/fail cues are present; FX clears on reset. | Meets floor |
| Bubble Pop | n/a → 4/4/4/4/4/4/4 | Aim and launch are visible, launches/attachments burst, groups clear audibly, and full-board/loss and level feedback are distinct. | Meets floor |
| Hexa Fit | n/a → 4/4/4/4/4/4/4 | Placement preview, invalid-placement flash, placement burst and line-clear flash/cue all exist; effects are stepped and reset safely. | Meets floor |
| Orbit Knife | n/a → 4/4/4/4/4/4/4 | Throw burst and visible flight trail, impact burst, collision fail flash, and round-clear feedback are implemented. | Meets floor |
| Pocket Survivor | n/a → 4/4/4/4/4/4/4 | The canvas stick has visible direction feedback; attacks/damage burst, kills collect, upgrades flash, and fail state is explicit. | Meets floor |

Shared verification: `tests/polish-shared.test.ts` asserts the reduced-motion override, the 2048 stable-ID/animation contract, and draw/step/reset usage for Metro Dash, Hexa Fit, Orbit Knife and Pocket Survivor. The lifecycle catalog test mounts and destroys all 20 modules with reduced-motion services. Playwright opens all 20 routes on desktop and mobile and fails on page errors. CSS suppresses nonessential animation under `prefers-reduced-motion` while preserving state feedback.

Catalog update (2026-10-20): the current catalog and lifecycle/route test loops include 21 games, including Ashfall; the dated scores above cover the original 20.

## Top-ten pass (2026-11-10)

All 26 cabinets were played in a real browser and screenshotted. Seven already had real depth; most of the rest were 20–30 line prototypes. The arcade now lists ten games (see `CATEGORIES_AND_RECOMMENDATIONS.md`) and hides the other sixteen. The dated scores above are historical for every game named below.

| Game | What changed | Evidence and limits |
|---|---|---|
| Block Drop | Rebuilt: 7-bag, ghost, hold, three-piece next queue, wall kicks, lock delay, in-game key repeat, T-spin/combo/back-to-back scoring, row-local clear animation, game-over panel, touch gestures and a two-thumb button grid. | `tests/block-drop.test.ts`; bot play to level 4 on desktop and iPhone 13 emulation. Not heard by ear; no real controller. |
| Fruit Orbit | Rebuilt: fixed-step circle physics, eleven original drawn fruit with faces, next preview, aim line, chain multiplier, three-second overflow grace, evolution strip, game-over card. Score scale changed (2–110 per merge). | `tests/fruit-merge.test.ts`; touch play to game over. Tiers 9–10 never seen rendered in play. |
| Pocket Survivor | Rebuilt: five evolving auto-weapons, six passives, five enemy types plus elites, Warden boss at 5:00 then endless, XP gems, Burst, large upgrade cards, fail reason on the end panel. | `tests/arena.test.ts`; 217 s keyboard run and 141 s touch run. Balance is bot-tuned; boss kill not human-played. |
| Merge 2048 | Fixed tile gaps and digit overflow, readable colour ramp to 32768 (≥4.5:1, unit-tested), undo, win and no-moves panels, next-goal chip, buffered input. | `tests/merge-2048-logic.test.ts`; ~600 touch swipes to a real game over. |
| Geo Quiz | Per-mode atlas collection, missed countries return sooner, World tour mixed mode, full missed list on the result screen. | `tests/capital-quiz-atlas.test.ts`; rounds played in EN and zh on desktop and phone. |
| Tank Brawl | Phone portrait rotates to fill, solo bot ladder with a Boss, drop-in bot for an idle seat, three new twists, sudden death always ends, co-op rebalanced for one hero. | 46 unit tests; solo, two-player, co-op and touch sessions. Boss and co-op balance not human-measured. |
| Tank Clash | Enemy pathfinding, telegraphed spawns and boss attacks, default of one player plus AI ally, DOM lobby and results, compact phone HUD, chassis rebalance, allies can no longer destroy the base. | `tests/tank-clash-polish.test.ts`; all modes played, stage 6 to victory. Stage 6 and solo remain hard. |
| Pelican Pedal | Fixed stages (no re-roll on death), three reachable stars per stage, new fourth stage, medals and per-stage bests, stage select, phone layout with touch pad, input isolation fixes. | `tests/pelican-bike-levels.test.ts` proves each goal reachable; a bot cleared all four stages by keyboard and by touch. Par times are bot-calibrated. |
| Pad Pals | Portrait phone rotates to fill, helping hand demo, tappable result cards with star animation, sticker book, Controller Master trophy, keyboard-completable Bubble Cannon, two-player Tug of War on one keyboard. | 69 unit tests; all 14 levels played by keyboard. No real controller or iOS device. |
| Ashfall | Start/Continue above the stage grid, larger landscape-phone canvas, skippable death wait, touch wording, first-pit hint, low-vitality cue. No balance or save changes. | 122 Ashfall tests and the campaign acceptance script. |

Shared: touch controls stay visible on wide touch devices (`pointer:fine` gate), the home page puts the game grid before the controller strip and leaderboard, and covers for nine of the ten listed games were recaptured from the new builds.

Not verified anywhere in this pass: audio by ear, physical phones, physical controllers, or human playtests.
