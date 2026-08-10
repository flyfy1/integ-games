# Game polish evaluation

## Review rubric

Each cabinet is reviewed from 1–5 on seven dimensions. A release-ready game should have no dimension below 3; flagship games should average at least 4.

1. **Input response** — the first visible/audio response follows input immediately and repeated input is controlled.
2. **Motion clarity** — movement, spawning, merging, impact, and removal can be visually followed.
3. **Audio fit** — action, reward, damage, success, and failure cues are distinct and not noisy.
4. **Game-state feedback** — start, pause, progression, win, failure, and restart are unambiguous.
5. **Juice and reward** — important moments receive proportionate emphasis without obscuring play.
6. **Mobile feel** — touch targets, controls, orientation, safe areas, and held-state cleanup are comfortable.
7. **Resilience** — reduced motion, pause, visibility changes, restart, and destroy leave no stale animation/input/audio.

## Flagship target: Merge 2048

- Tiles retain stable identities long enough to animate from old cells to new cells.
- A valid move uses a short directional slide; merged tiles use a scale pulse; the spawned tile uses a pop/fade.
- Score gain appears as a brief `+N` near the score and the score count updates with the animation.
- A no-op move gives restrained board feedback without spawning a tile or repeating failure audio.
- Reaching 2048 gets a clear celebration; no-moves gets a distinct game-over treatment.
- Motion is 120–180 ms, queues or locks conflicting input safely, and collapses to immediate state updates under reduced motion.
- Slide, merge, spawn, 2048, and game-over each have an appropriate semantic cue. Audio must remain synchronized with the visible event.

## Catalog audit targets

| Game | Primary polish focus |
| --- | --- |
| Merge 2048 | Slide/merge/spawn animation, score delta, win/loss treatment |
| Block Drop | Piece lock, line-clear flash, hard-drop trail |
| Neon Snake | Turn responsiveness, food pickup pulse, death trail |
| Pocket Mines | Reveal cascade, flag state, mine detonation |
| Daily Solitaire | Card selection, legal move, foundation reward |
| Calm Sudoku | Selection peers, correct/error entry, completion sweep |
| Word Trail | Path glow, valid-word capture, invalid-path reset |
| Memory Flip | Card flip, match hold, mismatch return |
| Perfect Stack | Drop impact, cutoff fragment, perfect streak |
| Sky Flap | Flap squash/stretch, gate score, collision |
| Brick Pulse | Paddle/ball hit, brick damage, row clear |
| Pixel Defense | Muzzle flash, enemy hit, wave transition |
| Metro Dash | Lane transition, jump/duck silhouettes, near-miss/hit |
| Trap Trail | Jump/landing, trap reveal, exit celebration |
| Tiny Wheels | Suspension/tilt readability, throttle feedback, crash |
| Fruit Orbit | Drop ghost, collision, merge burst, danger line |
| Bubble Pop | Aim guide, launch, cluster pop, board pressure |
| Hexa Fit | Placement preview, invalid placement, line clear |
| Orbit Knife | Throw trail, impact, collision, round clear |
| Pocket Survivor | Attack readability, damage feedback, XP/upgrade choice |

## Implementation constraints

- Prefer shared helpers for transient particles, flashes, easing, and timing where both canvas game stacks benefit.
- Do not import animation libraries or external assets.
- Preserve deterministic game rules and saved progress.
- Never couple gameplay state progression to a CSS `animationend`; timers must have safe fallbacks.
- All transient effects must pause, restart, and destroy cleanly.
- `prefers-reduced-motion` must suppress nonessential translation, shake, particles, and counting animations while keeping state feedback visible.
- Keep the existing comments-related working-tree changes untouched and outside this feature commit.

## Acceptance

- Merge 2048 passes focused tests for slide lock, merge/spawn markers, score delta, reduced motion, restart, and destroy.
- Every catalog game has a written evaluation row with before/after scores, findings, and disposition.
- Every game receives at least one verified polish improvement or an explicit “already meets target” justification.
- Typecheck, unit tests, desktop/mobile Playwright, build, and Lighthouse pass.
