# Integ Games

A static, touch-friendly browser arcade with 21 original games. It has no account system or backend; scores, settings, saves, and recently played games stay in local storage.

## Games

Merge 2048, Block Drop, Neon Snake, Pocket Mines, Daily Solitaire, Calm Sudoku, Word Trail, Memory Flip, Perfect Stack, Sky Flap, Brick Pulse, Pixel Defense, Metro Dash, Trap Trail, Tiny Wheels, Fruit Orbit, Bubble Pop, Hexa Fit, Orbit Knife, Pocket Survivor, and Ashfall (a cinematic side-scrolling action game with a two-phase boss).

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

## GitHub Pages

The workflow in `.github/workflows/pages.yml` installs dependencies, runs type/unit/end-to-end/Lighthouse checks, builds the site, and deploys Pages from `dist/`. `public/CNAME` configures `games.integ.life`. Set the `PAGES_BASE_PATH` repository variable when deploying to a project-page preview path; leave it unset for the custom domain root.

## Google Analytics page counts

The **Integ Games** GA4 property has its own production web stream
`G-FZ76Z2ZFKD`. Pageviews count the catalog and known game routes, including
client-side navigation. Query strings, login fragments, referrers, player
names and scores are excluded; unknown paths become `/not-found`. The tag
only loads on `games.integ.life` in the top-level window. Enhanced
measurement, Google signals and ad personalization are disabled.
