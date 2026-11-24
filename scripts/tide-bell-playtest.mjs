#!/usr/bin/env node
/**
 * Tide Bell browser bot: opens the game on a phone (or desktop) profile, measures time to the first move, then plays
 * every stored solution by tapping the neighbouring tile (touch on phones), and checks each level is won with par moves.
 * It also fires moves faster than the animations to prove input is buffered, and samples frame times under 4x CPU
 * throttling. Needs a running dev server.
 *
 *   BASE=http://127.0.0.1:5232 DEVICE='Pixel 7' SHOTS=/tmp/shots node scripts/tide-bell-playtest.mjs
 */
import { chromium, devices } from '@playwright/test';

const base = process.env.BASE ?? 'http://127.0.0.1:5173';
const device = process.env.DEVICE ?? 'Pixel 7';
const shots = process.env.SHOTS;
const only = process.env.ONLY?.split(',');
const browser = await chromium.launch();
const context = await browser.newContext(device === 'desktop' ? { viewport: { width: 1280, height: 900 } } : { ...devices[device] });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const tb = (fn, arg) => page.evaluate(([f, a]) => { const t = document.querySelector('[data-tide-bell]').__tb; return new Function('t', 'a', `return (${f})(t, a)`)(t, a); }, [fn.toString(), arg]);

const t0 = Date.now();
await page.goto(`${base}/play/tide-bell`);
const start = page.getByRole('button', { name: 'Start game' });
if (await start.isVisible({ timeout: 2500 }).catch(() => false)) await start.click();
await page.waitForSelector('[data-tide-bell] canvas');
await page.waitForTimeout(50);
// First move: tap the tile to the right of you on level 1 (or press the key on desktop).
const touch = device !== 'desktop';
async function move(d) {
  if (!touch) { await page.keyboard.press({ U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight' }[d]); return; }
  const p = await tb((t, a) => t.tapPoint(a), d);
  await page.touchscreen.tap(p.x, p.y);
}
const levels = await page.evaluate(async () => (await import('/src/games/tide-bell/levels.ts')).LEVELS.map((l) => ({ id: l.id, par: l.par, solution: l.solution })));
const first = levels[0];
await move(first.solution[0]);
await page.waitForFunction(() => document.querySelector('[data-tide-bell]').__tb.moves === 1);
const firstMove = Date.now() - t0;
const firstMoveInGame = Number(await page.evaluate(() => document.querySelector('[data-tide-bell]').dataset.firstMoveMs));

const results = [];
let longestCardWait = 0;
for (const lv of levels) {
  if (only && !only.includes(lv.id)) continue;
  await tb((t, a) => t.start(a), lv.id);
  await page.waitForTimeout(80);
  for (const [i, d] of [...lv.solution].entries()) {
    const before = await tb((t) => t.moves);
    await move(d);
    const after = await tb((t) => t.moves);
    if (after !== before + 1) { results.push({ id: lv.id, ok: false, why: `move ${i + 1} (${d}) not taken` }); break; }
    await page.waitForTimeout(touch ? 30 : 20);
  }
  if (results.at(-1)?.id === lv.id) continue;
  const won = await tb((t) => t.won);
  const moves = await tb((t) => t.moves);
  const tc = Date.now();
  await page.waitForFunction(() => document.querySelector('[data-tide-bell]').dataset.screen === 'win', null, { timeout: 4000 }).catch(() => {});
  longestCardWait = Math.max(longestCardWait, Date.now() - tc);
  if (shots) await page.locator('[data-tide-bell]').screenshot({ path: `${shots}/${device.replace(/\s+/g, '-')}-${lv.id}-won.png` });
  results.push({ id: lv.id, ok: won && moves === lv.par, moves, par: lv.par });
}

// Buffered input: fire level 1-5's solution with no waits at all; every move must land.
await tb((t, a) => t.start(a), '1-5');
await page.waitForTimeout(100);
const burst = levels.find((l) => l.id === '1-5').solution;
const tb0 = Date.now();
for (const d of burst) await page.keyboard.press({ U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight' }[d]);
const burstMs = Date.now() - tb0;
const burstWon = await tb((t) => t.won);

// Frame time while things animate, CPU throttled 4x.
const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await tb((t, a) => t.start(a), '4-5');
const frames = await page.evaluate(async () => {
  const el = document.querySelector('[data-tide-bell]');
  const keys = 'DRRDDRUURRLLDLUDDRUULUU'.split('').map((d) => ({ U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight' }[d]));
  const times = []; let last = performance.now(); let running = true;
  const tick = (now) => { times.push(now - last); last = now; if (running) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  for (const key of keys) { el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); await new Promise((r) => setTimeout(r, 120)); }
  await new Promise((r) => setTimeout(r, 400)); running = false;
  times.sort((a, b) => a - b);
  return { n: times.length, median: times[Math.floor(times.length / 2)], p95: times[Math.floor(times.length * 0.95)], max: times.at(-1) };
});
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

console.log(JSON.stringify({ device, firstMoveMsFromNavigation: firstMove, firstMoveMsFromMount: firstMoveInGame, levels: results.length, passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok), longestWinCardWaitMs: longestCardWait, burst: { moves: burst.length, ms: burstMs, won: burstWon }, frameMsAt4xThrottle: frames, errors }, null, 1));
await browser.close();
process.exit(results.every((r) => r.ok) && burstWon && !errors.length ? 0 : 1);
