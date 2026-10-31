# Integ Games

A static, touch-friendly browser arcade with 23 original games. It has no account system or backend; scores, settings, saves, and recently played games stay in local storage.

## Games

Merge 2048, Block Drop, Neon Snake, Pocket Mines, Daily Solitaire, Calm Sudoku, Word Trail, Memory Flip, Geo Quiz, Pad Pals, Perfect Stack, Sky Flap, Brick Pulse, Pixel Defense, Metro Dash, Trap Trail, Tiny Wheels, Fruit Orbit, Bubble Pop, Hexa Fit, Orbit Knife, Pocket Survivor, and Ashfall (a cinematic side-scrolling action game with a two-phase boss).

## Development

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run test:lighthouse
```

`npm run test:e2e` uses Playwright; install its Chromium browser once with `npx playwright install chromium` when needed.

## Game controllers

`src/games/_shared/gamepad-kit.ts` reads standard pads through the Gamepad API and the Twin USB 2-in-1 receiver through WebHID (desktop Chrome or Edge; use the Connect button once, then it reconnects by itself). `gamepad-bridge.ts` turns a pad into key events for every keyboard-driven game, with one mapping per game in `gamepadProfiles`; Start pauses and resumes. Games that step once per key event also get keyboard-style repeat (`gamepadRepeat`), and players can rebind any game from the controller button on its page; bindings stay in this browser. Pad Pals reads the kit directly and teaches the whole controller. Its spoken lines are recorded mp3s in `public/pad-pals-voice`; after changing a line in `SPOKEN`, rerun `node scripts/generate-pad-pals-voice.mjs` (needs `uv`, and `ONLY=key` limits it to one line).

## Two players

`src/games/_shared/versus.ts` adds split-screen versus to any game module without changing the game: it mounts the game twice with one seed, keeps both off the leaderboard and away from saved progress, and decides the winner from `versusRules` (timed best score, or first to finish). Seat 1 is controller 1 or WASD + Space, seat 2 is controller 2 or arrows + Enter, so any mix works. To add a game, give it a line in `versusRules` and a mapping in `gamepadProfiles`. Desktop only; Ashfall stays single-player and Pad Pals has its own two-player modes.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` installs dependencies, runs type/unit/end-to-end/Lighthouse checks, builds the site, and deploys Pages from `dist/`. `public/CNAME` configures `games.integ.life`. Set the `PAGES_BASE_PATH` repository variable when deploying to a project-page preview path; leave it unset for the custom domain root.

## Google Analytics page counts

The **Integ Games** GA4 property has its own production web stream
`G-FZ76Z2ZFKD`. Pageviews count the catalog and known game routes, including
client-side navigation. Query strings, login fragments, referrers, player
names and scores are excluded; unknown paths become `/not-found`. The tag
only loads on `games.integ.life` in the top-level window. Enhanced
measurement, Google signals and ad personalization are disabled.

## Ashfall campaign

Ashfall has 20 stages across five acts, with Easy/Normal/Hard, twenty named boss
encounters using three animated chassis, bilingual story and controls, momentum
and Overdrive, and capped forge upgrades. Clears and stage-boundary resumes are
stored locally per difficulty; old three-level records are preserved. Campaign
scores remain local rather than mixing with historical leaderboard scores.

```bash
node scripts/ashfall-acceptance.mjs
node scripts/ashfall-playtest.mjs --level=1 --max-minutes=65
node scripts/ashfall-playtest.mjs --level=20 --difficulty=hard --single-level
```

See [design decisions](docs/ashfall/design-contract.md),
[content and play evidence](docs/ashfall/content-matrix.md), and
[verification limits](docs/ashfall/verification.md).
