# Integ Games

A static, touch-friendly browser arcade with 20 original games. It has no account system or backend; scores, settings, saves, and recently played games stay in local storage.

## Games

Merge 2048, Block Drop, Neon Snake, Pocket Mines, Daily Solitaire, Calm Sudoku, Word Trail, Memory Flip, Perfect Stack, Sky Flap, Brick Pulse, Pixel Defense, Metro Dash, Trap Trail, Tiny Wheels, Fruit Orbit, Bubble Pop, Hexa Fit, Orbit Knife, and Pocket Survivor.

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
