# Audio and mobile controls

## Goal

Give every cabinet clear, restrained feedback and make every real-time game comfortable on a phone. The implementation must be shared infrastructure rather than twenty unrelated button systems.

## Shared sound system

Expose semantic cues through `GameSound.play`: `tap`, `move`, `merge`, `collect`, `clear`, `jump`, `shoot`, `hit`, `upgrade`, `success`, and `fail`.

- Generate sound locally with Web Audio; no downloaded audio assets and no network dependency.
- Each cue may layer oscillators/noise and use a short envelope, but ordinary actions should remain under 140 ms. Success/fail may be longer.
- Give games a lightweight sound theme selected by slug: puzzle (soft/sine), arcade (bright/square), action (punchy/triangle plus restrained noise), calm/cards (soft/triangle).
- Rate-limit repeat cues so held controls and collision loops cannot produce harsh audio.
- Resume a suspended AudioContext on the first user gesture. Respect the existing global mute state and `prefers-reduced-motion` does not affect audio.
- Use appropriate semantics in all 20 games: movement is quiet; collect/merge/clear is rewarding; jump/shoot is distinct; damage/failure is unmistakable; completion uses success.

## Shared mobile-control library

Add one reusable library under `src/games/_shared/` that owns creation, pointer capture, held-state, accessibility labels, optional haptics, viewport detection, and cleanup.

Supported declarative control shapes:

- `dpad`: four directions.
- `horizontal`: left/right.
- `single-action`: one large action button.
- `dual-action`: two named actions.
- `stick-action`: virtual stick plus action.

The library must expose pressed/held state and callbacks, support simultaneous pointers, cancel stuck input on blur/visibility change, use `navigator.vibrate` only when available, and remove every listener during destroy. Controls render only for coarse pointers/narrow mobile viewports and do not block the game canvas.

## Cabinet control mapping

| Game | Mobile control treatment |
| --- | --- |
| Merge 2048 | Native swipe; no redundant buttons |
| Block Drop | D-pad plus Rotate and Drop |
| Neon Snake | D-pad; retain swipe |
| Pocket Mines | Native tap/hold |
| Daily Solitaire | Native tap |
| Calm Sudoku | Existing number pad/native tap |
| Word Trail | Native drag |
| Memory Flip | Native tap |
| Perfect Stack | One large Drop button |
| Sky Flap | One large Flap button |
| Brick Pulse | Horizontal controls; retain paddle drag |
| Pixel Defense | Horizontal controls plus Fire |
| Metro Dash | D-pad labelled lane/jump/slide; retain swipe |
| Trap Trail | Horizontal controls plus Jump |
| Tiny Wheels | Brake and Drive, positioned left/right |
| Fruit Orbit | Horizontal controls plus Drop; retain drag |
| Bubble Pop | Horizontal Aim plus Shoot; retain drag aiming |
| Hexa Fit | Native piece/cell tap; no redundant buttons |
| Orbit Knife | One large Throw button |
| Pocket Survivor | Virtual stick; retain current stick behavior but move it into the shared library |

## Pause behavior

The continuously advancing games are Block Drop, Neon Snake, Perfect Stack, Sky Flap, Brick Pulse, Pixel Defense, Metro Dash, Trap Trail, Tiny Wheels, Fruit Orbit, Bubble Pop, Orbit Knife, and Pocket Survivor.

- Add a compact in-stage pause button to those games. It sits in the safe-area-aware top-right corner of the stage and remains above the canvas.
- The shell owns the pause overlay and controller lifecycle. Both the header action and in-stage button call the same pause/resume path.
- On mobile, automatically pause a running game when the document becomes hidden or the window loses focus. Never auto-resume.
- Turn-based games retain the existing page-level Pause action but do not need the in-stage shortcut.
- Pause clears held virtual controls and audio tails. Restart clears pause state and control state.

## Layout and accessibility

- Put controls below the visible playfield, inside the stage, with safe-area padding and a maximum reachable height. Do not overlay critical HUD or game cells.
- Buttons are at least 52×52 px, action buttons at least 64 px, with visible pressed state and `aria-label` text.
- Landscape phones may place movement left and actions right; portrait phones use a bottom control row.
- Desktop layout and keyboard controls remain unchanged.

## Acceptance

- All 20 games emit at least one action cue and success/failure cues where those states exist.
- Every mapped real-time game is fully playable with the shared mobile controls without relying on keyboard events.
- All 13 continuous games expose an in-stage pause shortcut; all others do not.
- Pause, restart, route navigation, blur, and destroy cannot leave a held input, RAF, timer, listener, or sound active.
- Unit tests cover cue synthesis/rate limiting and mobile-control held-state/cleanup. Playwright covers representative d-pad, single-action, dual-action, pause, blur, desktop-hidden, portrait, and landscape flows.
