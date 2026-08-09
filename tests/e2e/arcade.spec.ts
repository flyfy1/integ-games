import { expect, test } from '@playwright/test';
test('all catalog routes render without a page error', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const routes = await page.locator('article.game-card a').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  expect(routes).toHaveLength(20);
  for (const gameRoute of routes) {
    await page.goto(gameRoute ?? '/');
    await expect(page.locator('.game-stage')).toBeVisible();
    await page.locator('.game-stage').click({ position: { x: 8, y: 8 } });
  }
  expect(errors).toEqual([]);
});
