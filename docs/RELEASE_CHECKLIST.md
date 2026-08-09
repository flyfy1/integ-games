# Integ Games Release Checklist

Target: `https://games.integ.life`

## Repository

- Create or select a GitHub repository for this directory (recommended name: `integ-games`).
- Initialize the directory as a Git repository only after the target remote is known.
- Default branch: `main`.
- Commit the complete project, including `.github/workflows/deploy.yml` and `public/CNAME`.
- Do not commit `node_modules`, `dist`, Playwright output, or Lighthouse reports.

## Pre-push gates

Run from the project root:

```bash
npm ci
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run test:lighthouse
```

Expected catalog count: exactly 20 unique game routes.

## GitHub Pages

- Push `main` to the selected GitHub repository.
- In repository Settings → Pages, set Source to **GitHub Actions**.
- Confirm the `Deploy games.integ.life` workflow completes successfully.
- Confirm the Pages environment reports the generated deployment URL.
- Verify the published artifact includes `index.html`, `404.html`, `CNAME`, `sw.js`, and all lazy game chunks.

## DNS

At the authoritative DNS provider for `integ.life`:

- Add a `CNAME` record for host `games` pointing to `<github-owner>.github.io`.
- Remove conflicting `A`, `AAAA`, or `CNAME` records for the same `games` host.
- Use DNS-only mode until GitHub provisions the certificate if the provider supports proxying.
- Verify the GitHub account/organization owns `integ.life` where domain verification is available.

Do not guess `<github-owner>`; derive it from the final repository remote.

## HTTPS and production acceptance

- Wait for GitHub Pages to recognize `games.integ.life`.
- Enable **Enforce HTTPS**.
- Open `https://games.integ.life` in a private browser session.
- Confirm there is no certificate warning and HTTP redirects to HTTPS.
- Open at least one deep link directly, such as `/play/arena`, and refresh it.
- Run through all 20 routes at desktop and mobile viewports.
- Confirm no console errors, missing chunks, cross-origin failures, or unexpected horizontal scrolling.
- Confirm a played score remains after reload.
- Confirm sound starts only after user interaction and mute persists.
- Confirm the service worker updates after a subsequent deployment.

## Rollback

- Keep the last known-good commit SHA from the successful Pages deployment.
- For a failed release, revert the release commit on `main` and push normally; do not rewrite published branch history.
- Re-run the Pages workflow and verify the deployment points to the reverted commit.
