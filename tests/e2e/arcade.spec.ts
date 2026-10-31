import { expect, test } from '@playwright/test';
const continuous = ['block-drop', 'snake', 'stack', 'flap', 'breakout', 'invaders', 'runner', 'platformer', 'drive', 'fruit-merge', 'bubble', 'knife', 'arena', 'ashfall'];
test('all catalog routes render without a page error', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const routes = await page.locator('article.game-card a').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  expect(routes).toHaveLength(23);
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
  await expect(page.locator('[data-grid] .game-card')).toHaveCount(8);
});

test('game navigation updates canonical and social metadata', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'metadata behavior is device-independent');
  await page.goto('/play/arena/');
  await expect(page).toHaveTitle('Pocket Survivor · Integ Games');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://games.integ.life/play/arena/');
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'Pocket Survivor · Integ Games');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://games.integ.life/game-art/arena-cover.jpg');
  await page.getByRole('link', { name: 'All games' }).click();
  await expect(page).toHaveTitle('Integ Games');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://games.integ.life/');
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

test('mobile start enters immersive mode even without the native fullscreen API', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'mobile-only immersive launch');
  await page.addInitScript(() => { Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { value: undefined, configurable: true }); });
  await page.goto('/play/merge-2048');
  await page.locator('[data-action="start-game"]').click();
  await expect(page.locator('[data-stage]')).toHaveClass(/is-immersive/);
  await expect(page.getByRole('button', { name: 'Exit full screen' })).toBeVisible();
  await page.getByRole('button', { name: 'Exit full screen' }).click();
  await expect(page.locator('[data-stage]')).not.toHaveClass(/is-immersive/);
  await expect(page.getByRole('button', { name: 'Exit full screen' })).toBeHidden();
});

test('every cabinet can pause, restart, and accept its primary keyboard input', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop keyboard lifecycle coverage');
  const primaryKey: Record<string, string> = {
    'merge-2048': 'ArrowLeft', 'block-drop': 'ArrowDown', snake: 'ArrowDown', mines: 'Enter', solitaire: 'd', sudoku: '4',
    'word-grid': 'Space', memory: 'Enter', stack: 'Space', flap: 'Space', breakout: 'ArrowLeft', invaders: 'Space', runner: 'ArrowUp',
    platformer: 'ArrowUp', drive: 'ArrowRight', 'fruit-merge': 'Space', bubble: 'Space', 'hex-puzzle': '1', knife: 'Space', arena: 'ArrowRight', 'capital-quiz': '1', 'pad-pals': 'Space'
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

test('system sharing sends the canonical game payload and confirms success', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser project is enough for share API behavior');
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: ShareData) => { (window as Window & { capturedShare?: ShareData }).capturedShare = data; } });
  });
  await page.goto('/play/merge-2048');
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(page.locator('[data-share-status]')).toHaveText('Game shared.');
  await expect.poll(() => page.evaluate(() => (window as Window & { capturedShare?: ShareData }).capturedShare)).toEqual({
    title: 'Merge 2048 · Integ Games',
    text: 'Play Merge 2048 with me on Integ Games.',
    url: 'https://games.integ.life/play/merge-2048/'
  });
});

test('cancelling the system share leaves the page quiet', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser project is enough for share API behavior');
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('Cancelled', 'AbortError'); } });
  });
  await page.goto('/play/snake');
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(page.locator('[data-share-status]')).toBeEmpty();
  await expect(page.locator('[data-share-fallback]')).toBeHidden();
});

test('sharing copies the canonical link when Web Share is unavailable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser project is enough for share API behavior');
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (url: string) => { (window as Window & { copiedShareLink?: string }).copiedShareLink = url; } } });
  });
  await page.goto('/play/flap');
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(page.locator('[data-share-status]')).toHaveText('Game link copied.');
  await expect.poll(() => page.evaluate(() => (window as Window & { copiedShareLink?: string }).copiedShareLink)).toBe('https://games.integ.life/play/flap/');
});

test('sharing exposes a selectable manual link after API and clipboard failure', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser project is enough for share API behavior');
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('Blocked', 'NotAllowedError'); } });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  });
  await page.goto('/play/arena');
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(page.locator('[data-share-fallback]')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Game link' })).toHaveValue('https://games.integ.life/play/arena/');
  await expect(page.locator('[data-share-status]')).toHaveText('Select the link and copy it manually.');
});

test('merge-2048 HUD spans the board so Score and Best never touch (UX-20261014-13)', async ({ page }, testInfo) => {
  await page.goto('/play/merge-2048');
  const start = page.locator('[data-action="start-game"]');
  if (await start.count()) await start.click();
  const hud = page.locator('.game-hud');
  await expect(hud).toBeVisible();
  const m = await hud.evaluate(el => {
    const [score, best] = Array.from(el.children).map(c => c.getBoundingClientRect());
    return { hud: el.getBoundingClientRect().width, board: document.querySelector('.merge-board')!.getBoundingClientRect().width, gap: best.left - score.right };
  });
  expect(m.hud).toBeGreaterThanOrEqual(m.board - 1);
  expect(m.gap).toBeGreaterThanOrEqual(24);
  await hud.screenshot({ path: testInfo.outputPath('merge-2048-hud.png') });
});

test('Pad Pals plays through its first level with a standard controller', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop controller coverage');
  await page.addInitScript(() => {
    const pad = { id: 'Test Pad (STANDARD GAMEPAD)', mapping: 'standard', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) };
    (window as Window & { testPad?: typeof pad }).testPad = pad;
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] });
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/play/pad-pals');
  await expect(page.locator('[data-pad-pals] canvas')).toBeVisible();
  const tap = async () => {
    await page.evaluate(() => { (window as unknown as { testPad: { buttons: Array<{ pressed: boolean }> } }).testPad.buttons[0].pressed = true; });
    await page.waitForTimeout(80);
    await page.evaluate(() => { (window as unknown as { testPad: { buttons: Array<{ pressed: boolean }> } }).testPad.buttons[0].pressed = false; });
    await page.waitForTimeout(80);
  };
  await tap(); await tap();
  await expect(page.locator('[data-pad=skip]')).toBeVisible();
  await page.waitForTimeout(1800);
  const saved = () => page.evaluate(() => localStorage.getItem('integ-games:v1:game:pad-pals:progress'));
  await expect.poll(async () => { await tap(); await page.waitForTimeout(350); return saved(); }, { timeout: 15000 }).toContain('hello:0');
  await expect(page.locator('[data-pad=skip]')).toBeHidden();
  expect(errors).toEqual([]);
});

test('a controller drives keyboard cabinets through the bridge and Start pauses', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop controller coverage');
  await page.addInitScript(() => {
    const pad = { id: 'Test Pad (STANDARD GAMEPAD)', mapping: 'standard', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) };
    (window as unknown as { testPad: typeof pad }).testPad = pad;
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] });
    (window as unknown as { keysSeen: string[] }).keysSeen = [];
    window.addEventListener('keydown', (event) => (window as unknown as { keysSeen: string[] }).keysSeen.push(event.key));
  });
  await page.goto('/play/snake');
  await expect(page.locator('[data-stage] canvas')).toBeVisible();
  const setButton = (index: number, pressed: boolean) => page.evaluate(([i, on]) => { (window as unknown as { testPad: { buttons: Array<{ pressed: boolean }> } }).testPad.buttons[i as number].pressed = on as boolean; }, [index, pressed]);
  await setButton(13, true); await page.waitForTimeout(100); await setButton(13, false);
  await expect.poll(() => page.evaluate(() => (window as unknown as { keysSeen: string[] }).keysSeen)).toContain('ArrowDown');
  await page.waitForTimeout(100);
  await setButton(9, true); await page.waitForTimeout(100); await setButton(9, false);
  await expect(page.locator('[data-overlay]')).toBeVisible();
  await page.waitForTimeout(100);
  await setButton(9, true); await page.waitForTimeout(100); await setButton(9, false);
  await expect(page.locator('[data-overlay]')).toBeHidden();
});

test('Pad Pals fills a 16:10 screen in full screen and keeps the shell controls on top', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop full-screen layout');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/play/pad-pals');
  await page.getByRole('button', { name: 'Play in full screen' }).click();
  const canvas = page.locator('[data-pad-pals] canvas');
  await expect.poll(async () => (await canvas.boundingBox())?.width).toBe(1440);
  expect(await canvas.boundingBox()).toEqual({ x: 0, y: 0, width: 1440, height: 900 });
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Exit full screen' }).click({ trial: true });
  await page.getByRole('button', { name: 'Exit full screen' }).click();
  await expect.poll(async () => (await canvas.boundingBox())?.width).toBeLessThan(1000);
});

test('controller entry points: home strip, play-bar pill and saved per-game bindings', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop controller coverage');
  await page.addInitScript(() => {
    const pad = { id: 'Test Pad (STANDARD GAMEPAD)', mapping: 'standard', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) };
    (window as unknown as { testPad: typeof pad }).testPad = pad;
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] });
    (window as unknown as { keysSeen: string[] }).keysSeen = [];
    window.addEventListener('keydown', (event) => (window as unknown as { keysSeen: string[] }).keysSeen.push(event.key));
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Connect controller' })).toBeVisible();
  await page.goto('/play/block-drop');
  const pill = page.locator('[data-action=gamepad]');
  await expect(pill).toBeVisible();
  const setButton = (index: number, on: boolean) => page.evaluate(([i, value]) => { (window as unknown as { testPad: { buttons: Array<{ pressed: boolean }> } }).testPad.buttons[i as number].pressed = value as boolean; }, [index, on]);
  const seen = () => page.evaluate(() => (window as unknown as { keysSeen: string[] }).keysSeen);
  await setButton(2, true); await page.waitForTimeout(80); await setButton(2, false); await page.waitForTimeout(80);
  expect(await seen()).not.toContain(' ');
  await pill.click();
  await page.getByRole('button', { name: /Hard drop/ }).click();
  await setButton(2, true); await page.waitForTimeout(80); await setButton(2, false); await page.waitForTimeout(150);
  await expect(page.locator('.pad-panel [data-unbind=west]')).toBeVisible();
  await setButton(2, true); await page.waitForTimeout(80); await setButton(2, false);
  await expect.poll(seen).toContain(' ');
  await page.reload();
  await expect(pill).toBeVisible();
  await pill.click();
  await expect(page.locator('.pad-panel [data-unbind=west]')).toBeVisible();
  await page.getByRole('button', { name: 'Reset to default' }).click();
  await expect(page.locator('.pad-panel [data-unbind=west]')).toHaveCount(0);
});

test('every versus game starts split-screen, and each keyboard seat drives only its own board', async ({ page }, testInfo) => {
  test.setTimeout(240000);
  test.skip(testInfo.project.name !== 'desktop', 'desktop versus coverage');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const slug of ['merge-2048', 'block-drop', 'snake', 'mines', 'solitaire', 'sudoku', 'word-grid', 'memory', 'stack', 'flap', 'breakout', 'invaders', 'runner', 'platformer', 'drive', 'fruit-merge', 'bubble', 'hex-puzzle', 'knife', 'arena', 'capital-quiz']) {
    await page.goto(`/play/${slug}`);
    await page.locator('[data-action=versus]').click();
    await expect(page.locator('[data-versus-seat]')).toHaveCount(2);
    await page.keyboard.press('Space'); await page.keyboard.press('Enter');
    await expect(page.locator('.versus-count')).toBeVisible();
    await expect(page.locator('[data-versus-overlay]')).toBeHidden({ timeout: 5000 });
    await page.keyboard.press('KeyD'); await page.keyboard.press('ArrowRight');
    await page.locator('[data-action=versus]').click();
    await expect(page.locator('[data-versus-seat]')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
  await page.goto('/play/merge-2048');
  await page.locator('[data-action=versus]').click();
  await expect(page.locator('[data-versus-seat]')).toHaveCount(2);
  await page.keyboard.press('Space'); await page.keyboard.press('Enter');
  await expect(page.locator('.versus-count')).toBeVisible();
  await expect(page.locator('[data-versus-overlay]')).toBeHidden({ timeout: 5000 });
  const seats = page.locator('[data-versus-seat]');
  const board = (index: number) => seats.nth(index).evaluate((seat) => seat.innerHTML);
  const second = await board(1);
  let moved = false;
  for (const key of ['KeyA', 'KeyW', 'KeyD', 'KeyS']) { const before = await board(0); await page.keyboard.press(key, { delay: 60 }); await page.waitForTimeout(250); moved ||= before !== await board(0); }
  expect(moved).toBe(true);
  expect(await board(1)).toBe(second);
});
