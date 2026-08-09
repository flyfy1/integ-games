# Integ Games — Product and Design Specification

## Product goal

Build a static browser arcade at `https://games.integ.life` containing 20 complete games. Every game must work without accounts or a backend, support both touch and keyboard/pointer input, persist progress locally, and be deployable to GitHub Pages.

“Replication” means high-fidelity recreation of a popular gameplay pattern and its expected feel. Names, code, graphics, audio, copy, characters, level data, and branding must be original.

## Launch catalog

| ID | Slug | Display name | Popular pattern | Core loop | Primary input |
|---:|---|---|---|---|---|
| 01 | `merge-2048` | Merge 2048 | 2048 | Slide and merge equal tiles | Swipe / arrows |
| 02 | `block-drop` | Block Drop | Tetris | Rotate and clear rows | Touch controls / keys |
| 03 | `snake` | Neon Snake | Snake | Eat, grow, avoid collision | Swipe / arrows |
| 04 | `mines` | Pocket Mines | Minesweeper | Reveal safe cells, flag mines | Tap/hold / mouse |
| 05 | `solitaire` | Daily Solitaire | Klondike | Sort cards into foundations | Drag / tap |
| 06 | `sudoku` | Calm Sudoku | Sudoku | Complete a valid number grid | Tap keypad / keys |
| 07 | `word-grid` | Word Trail | Word search | Connect adjacent letters | Drag pointer |
| 08 | `memory` | Memory Flip | Concentration | Match card pairs | Tap / click |
| 09 | `stack` | Perfect Stack | Stack | Stop moving blocks accurately | Tap / space |
| 10 | `flap` | Sky Flap | Flappy-style | Fly through gaps | Tap / space |
| 11 | `breakout` | Brick Pulse | Breakout | Bounce ball and clear bricks | Drag / arrows |
| 12 | `invaders` | Pixel Defense | Space Invaders | Shoot waves and dodge fire | Touch controls / keys |
| 13 | `runner` | Metro Dash | Endless runner | Switch lanes, jump, duck | Swipe / keys |
| 14 | `platformer` | Trap Trail | Trap platformer | Reach exit through surprise traps | Touch controls / keys |
| 15 | `drive` | Tiny Wheels | Physics driving | Balance vehicle over obstacles | Touch pedals / keys |
| 16 | `fruit-merge` | Fruit Orbit | Suika-style merge | Drop and merge fruit tiers | Drag + release |
| 17 | `bubble` | Bubble Pop | Bubble shooter | Match colored bubbles | Aim + release |
| 18 | `hex-puzzle` | Hexa Fit | Block fitting | Place pieces and clear lines | Drag / click |
| 19 | `knife` | Orbit Knife | Knife hit | Time throws without collisions | Tap / space |
| 20 | `arena` | Pocket Survivor | Survivor-like arena | Move, auto-attack, choose upgrades | Virtual stick / WASD |

## Definition of complete

Every catalog entry must include:

- A start state explaining controls in one short sentence.
- A real game loop with win/lose or endless scoring state.
- Pause, resume, restart, mute, and return-to-arcade actions.
- Score or progress, locally persisted personal best, and meaningful difficulty progression.
- Touch targets at least 44 CSS px; no hover-only controls.
- Keyboard support on desktop and prevention of page scrolling while game keys are active.
- Responsive play at 320×568 through desktop widescreen; safe-area support on notched phones.
- Original vector/canvas art and generated Web Audio effects; no remote runtime assets.
- Deterministic cleanup when leaving the route: animation frames, timers, audio, and listeners.
- A smoke test that proves the module mounts and its primary input changes game state.

## Arcade information architecture

- `/`: featured rail, all-games grid, category filters, search, recently played.
- `/play/:slug`: focused game page with title bar, responsive stage, help sheet, related games.
- Static fallback compatible with GitHub Pages deep links.
- Categories: Puzzle, Arcade, Action, Cards & Logic.
- Game cards show title, concise mechanic label, best score/progress, and original cover art.

## Visual direction

The arcade should feel like a coherent modern collection, not 20 embedded projects.

- Mood: playful, crisp, calm between games; energetic inside the stage.
- Canvas: deep ink background `#090D18`; raised surfaces `#12192A`; borders `#273149`.
- Brand accent: electric mint `#70F0C2`; secondary violet `#8B7CFF`; warning coral `#FF6B7A`.
- Text: near-white `#F7F9FF`; secondary `#A8B1C5`.
- Typography: system UI stack; large round display weights, highly legible game HUD.
- Cards: 18 px radius, subtle border, colored game-specific thumbnail, restrained shadow.
- Motion: 120–220 ms UI transitions; gameplay may use stronger squash, particles, and shake. Respect `prefers-reduced-motion`.
- Each game gets a distinct accent palette while sharing chrome, dialogs, HUD spacing, buttons, and icon language.

## Interaction contract

The shell owns navigation, settings, pause overlay, and persistence. Game modules own simulation and rendering.

Each game exports metadata plus a mount function:

```ts
type GameModule = {
  meta: {
    slug: string;
    title: string;
    category: 'puzzle' | 'arcade' | 'action' | 'cards-logic';
    description: string;
    instructions: string;
    accent: string;
  };
  mount(host: HTMLElement, services: GameServices): GameController;
};

type GameController = {
  pause(): void;
  resume(): void;
  restart(): void;
  destroy(): void;
};
```

`GameServices` provides scoped storage, sound, score reporting, completion reporting, and a seeded random helper. Games must not modify global UI directly.

## Technical constraints

- Vite + TypeScript, with no runtime backend and no runtime CDN dependency.
- Prefer Canvas 2D and DOM; use a physics library only if bundled and justified.
- Lazy-load each game so the landing page does not download all game code.
- Store settings, recent games, best scores, and saves in local storage under versioned keys.
- Use a generated service worker or equivalent PWA strategy with safe update behavior.
- Build output must work at the custom-domain root and GitHub Pages preview paths.
- GitHub Actions performs install, typecheck, tests, production build, and Pages deployment.

## Quality gates

- `npm run typecheck`, `npm test`, and `npm run build` pass.
- Automated catalog check confirms exactly 20 unique slugs and importable modules.
- Playwright smoke coverage at desktop and mobile viewports for all 20 routes.
- No uncaught console errors during route cycling through all games.
- Lighthouse targets: Performance ≥ 85, Accessibility ≥ 90, Best Practices ≥ 90 on the arcade home page.
- Manual verification on current Chrome and Safari, including touch audio activation and orientation changes.

## Delivery sequence

1. Platform shell, module contract, design tokens, services, deployment, and one reference game.
2. Remaining games in isolated module directories, continuously integrated against the contract.
3. Catalog-wide keyboard/touch, cleanup, persistence, and responsive QA.
4. Production build, GitHub Pages publication, DNS `CNAME`, HTTPS, and final acceptance pass.
