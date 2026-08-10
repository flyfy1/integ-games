import { expect, test } from '@playwright/test';
const continuous = ['block-drop', 'snake', 'stack', 'flap', 'breakout', 'invaders', 'runner', 'platformer', 'drive', 'fruit-merge', 'bubble', 'knife', 'arena'];
test('all catalog routes render without a page error', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const routes = await page.locator('article.game-card a').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  expect(routes).toHaveLength(20);
  for (const gameRoute of routes) {
    await page.goto(gameRoute ?? '/');
    await expect(page.locator('.game-stage')).toBeVisible();
    await expect(page.locator('.breadcrumb')).toBeVisible();
    await expect(page.locator('.game-kicker .trait-chip')).toHaveCount(2);
    await expect(page.locator('.related .game-card')).toHaveCount(4);
  }
  expect(errors).toEqual([]);
});

test('category filters persist in the URL and search stays within the active category', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Match & Build 4/ }).click();
  await expect(page).toHaveURL(/\?category=match-build$/);
  await expect(page.getByRole('heading', { name: 'Match & Build' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Match & Build 4/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-grid] .game-card')).toHaveCount(4);
  await page.getByRole('searchbox', { name: 'Search Match & Build' }).fill('no-match-here');
  await expect(page.getByText('No games matched')).toBeVisible();
  await expect(page.locator('[data-results]')).toHaveText('0 games in Match & Build');
  await page.reload();
  await expect(page.getByRole('button', { name: /Match & Build 4/ })).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/play/merge-2048');
  await page.getByRole('link', { name: 'Puzzle & Strategy', exact: true }).click();
  await expect(page).toHaveURL(/\?category=puzzle-strategy$/);
  await expect(page.locator('[data-grid] .game-card')).toHaveCount(7);
});

test('continuous cabinets expose the shared in-stage pause shortcut on mobile', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'mobile-only touch controls');
  for (const slug of continuous) {
    await page.goto(`/play/${slug}`);
    await page.locator('[data-action="start-game"]').click();
    await expect(page.locator('.stage-pause')).toHaveCount(1);
  }
});

test('arena renders a reachable virtual stick on mobile', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'mobile-only touch controls');
  await page.goto('/play/arena');
  await page.locator('[data-action="start-game"]').click();
  const stick = page.locator('.mobile-stick');
  await expect(stick).toBeVisible();
  const box = await stick.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(110);
  expect(box?.height).toBeGreaterThanOrEqual(110);
});

test('every cabinet can pause, restart, and accept its primary keyboard input', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop keyboard lifecycle coverage');
  const primaryKey: Record<string, string> = {
    'merge-2048': 'ArrowLeft', 'block-drop': 'ArrowDown', snake: 'ArrowDown', mines: 'Enter', solitaire: 'd', sudoku: '4',
    'word-grid': 'Space', memory: 'Enter', stack: 'Space', flap: 'Space', breakout: 'ArrowLeft', invaders: 'Space', runner: 'ArrowUp',
    platformer: 'ArrowUp', drive: 'ArrowRight', 'fruit-merge': 'Space', bubble: 'Space', 'hex-puzzle': '1', knife: 'Space', arena: 'ArrowRight'
  };
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const [slug, key] of Object.entries(primaryKey)) {
    await page.goto(`/play/${slug}`);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(page.locator('[data-overlay]')).toBeVisible();
    await page.locator('[data-overlay]').getByRole('button', { name: 'Restart' }).click();
    await expect(page.locator('[data-overlay]')).toBeHidden();
    await page.locator('[data-stage]').press(key);
    await expect(page.locator('[data-stage]')).toBeVisible();
  }
  expect(errors).toEqual([]);
});
