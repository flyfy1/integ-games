#!/usr/bin/env node
/**
 * Shove Pond online acceptance: three Playwright contexts (Pixel 7, desktop, iPhone 13) play a full match through
 * a local room relay; one is closed mid-round (a bot plays it at once) and rejoins with its stored seat token; every
 * client must end on the same state hash. Then a one-tap rematch, a fourth player joining mid-match, and a round
 * that ends on the timer.
 *
 * Run (from the repo root):
 *   (cd backend && go build -o /tmp/integ-games-local .)
 *   GAMES_ADDR=127.0.0.1:8231 GAMES_DB_PATH=/tmp/games-local.db GAMES_EXTRA_ORIGINS=http://127.0.0.1:5231 /tmp/integ-games-local &
 *   VITE_GAMES_API=http://127.0.0.1:8231 npm run dev -- --host 127.0.0.1 --port 5231 &
 *   OUT=/tmp/shots node scripts/shove-pond-online-acceptance.mjs
 */
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(process.cwd() + '/')('@playwright/test');
const out = process.env.OUT ?? '/tmp';
const BASE = process.env.BASE ?? 'http://127.0.0.1:5231/play/shove-pond/';
const browser = await chromium.launch();
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a);
const T0 = Date.now();
const errors = [];
async function open(name, ctxOpts, url) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${name} pageerror ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/discuss\.integ|ERR_FAILED/.test(m.text())) errors.push(`${name} console ${m.text()}`); });
  const t = Date.now();
  await page.goto(url);
  await page.waitForSelector('button:has-text("Start game"), .sp-pad .u', { state: 'visible' });
  const start = page.getByRole('button', { name: 'Start game' });
  if (await start.isVisible().catch(() => false)) await start.click();
  await page.waitForSelector('.sp-pad .u', { state: 'visible' });
  log(name, 'first input ready ms', Date.now() - t);
  return { name, ctx, page };
}
const attr = (p, a) => p.page.locator('[data-shove-pond]').getAttribute(a);
async function waitAttr(p, a, pred, timeout = 30000) {
  const t = Date.now();
  while (Date.now() - t < timeout) { const v = await attr(p, a); if (pred(v)) return v; await p.page.waitForTimeout(100); }
  throw new Error(`${p.name}: timed out waiting on ${a} (last ${await attr(p, a)})`);
}
// Host: creates a room from the menu.
const A = await open('A', { ...devices['Pixel 7'] }, BASE);
await A.page.getByRole('button', { name: /Menu/ }).click();
const onlineBtn = A.page.getByRole('button', { name: /Play online/ });
await A.page.waitForFunction(() => [...document.querySelectorAll('.sp-card button')].some(b => /Play online/.test(b.textContent) && !b.disabled), null, { timeout: 5000 });
await onlineBtn.click();
await A.page.locator('input.name').fill('Ana');
await A.page.getByRole('button', { name: /Create a room/ }).click();
await A.page.waitForSelector('.sp-lobby');
const url = new URL(A.page.url());
const code = url.searchParams.get('room');
log('room', code);
await A.page.screenshot({ path: `${out}/online-lobby-host.png` });
const B = await open('B', { viewport: { width: 1100, height: 820 } }, `${BASE}?room=${code}`);
const C = await open('C', { ...devices['iPhone 13'] }, `${BASE}?room=${code}`);
await A.page.waitForFunction(() => document.querySelectorAll('.sp-lobby .sp-chip').length >= 3);
await C.page.screenshot({ path: `${out}/online-lobby-guest.png` });
await A.page.getByRole('button', { name: /Start match/ }).click();
const all = [A, B, C];
const dirs = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'];
async function plan(p, r) {
  await p.page.locator('[data-shove-pond]').focus();
  for (let k = 0; k < 3; k++) await p.page.keyboard.press(dirs[(r * 5 + k * 3 + p.name.charCodeAt(0)) % 4]);
  await p.page.keyboard.press('Enter');
}
let killedAt = 0, rejoined = false, round = 0;
const reveals = [];
while (true) {
  // Wait until everyone alive is planning (or the match is over).
  const live = all.filter(p => !p.dead);
  const scenes = await Promise.all(live.map(p => waitAttr(p, 'data-phase', v => v === 'plan' || v === 'card', 40000).then(() => attr(p, 'data-scene'))));
  if (scenes.some(s => s?.includes('over')) || (await Promise.all(live.map(p => attr(p, 'data-phase')))).includes('card')) break;
  round++;
  log('round', round, scenes.join(' '));
  if (round === 1) await A.page.screenshot({ path: `${out}/online-round1-host.png` });
  if (round === 2 && !killedAt) {
    // C dies mid-round, before planning.
    killedAt = Date.now();
    await C.page.close(); C.dead = true;
    log('C killed mid-round');
    await Promise.all([plan(A, round), plan(B, round)]);
    const t = Date.now();
    await waitAttr(A, 'data-phase', v => v === 'reveal');
    log('reveal after kill came', Date.now() - t, 'ms after A+B were ready');
    await A.page.waitForTimeout(600);
    await A.page.screenshot({ path: `${out}/online-bot-takeover.png` });
    continue;
  }
  if (round === 3 && C.dead && !rejoined) {
    // C comes back in the same browser profile (token kept), mid-match.
    const t = Date.now();
    C.page = await C.ctx.newPage();
    C.page.on('pageerror', e => errors.push(`C2 pageerror ${e.message}`));
    await C.page.goto(`${BASE}?room=${code}`);
    await C.page.waitForSelector('button:has-text("Start game"), .sp-pad .u', { state: 'visible' });
    const start = C.page.getByRole('button', { name: 'Start game' });
    if (await start.isVisible().catch(() => false)) await start.click();
    await waitAttr(C, 'data-scene', v => v?.startsWith('online-'), 15000);
    await waitAttr(C, 'data-phase', v => v === 'plan', 15000);
    log('C rejoined and is planning after', Date.now() - t, 'ms; scene', await attr(C, 'data-scene'));
    C.dead = false; rejoined = true;
    await C.page.screenshot({ path: `${out}/online-rejoined.png` });
  }
  const rs = Date.now();
  await Promise.all(all.filter(p => !p.dead).map(p => plan(p, round)));
  await waitAttr(A, 'data-phase', v => v === 'reveal');
  reveals.push(Date.now() - rs);
  await Promise.all(all.filter(p => !p.dead).map(p => waitAttr(p, 'data-phase', v => v === 'reveal' || v === 'card')));
  const hashes = await Promise.all(all.filter(p => !p.dead).map(p => attr(p, 'data-hash')));
  log('hashes after reveal', hashes.join(' '));
  if (new Set(hashes).size !== 1) errors.push(`hash mismatch round ${round}: ${hashes}`);
  if (round > 12) break;
}
await A.page.waitForTimeout(500);
const finals = await Promise.all(all.map(async p => [await attr(p, 'data-scene'), await attr(p, 'data-hash'), (await p.page.locator('.sp-card').innerText().catch(() => '')).replace(/\n+/g, ' | ')]));
for (const f of finals) log('final', f.join(' :: '));
if (new Set(finals.map(f => f[1])).size !== 1) errors.push('final hash mismatch');
await A.page.screenshot({ path: `${out}/online-end-host.png` });
await C.page.screenshot({ path: `${out}/online-end-rejoined.png` });
log('rounds', round, 'ready->reveal ms', reveals.join(','), 'match s', ((Date.now() - T0) / 1000).toFixed(1));
// Rematch is one tap; a fourth player joins mid-match and takes over the bot frog; one player lets the timer run out.
await A.page.locator('.sp-card button.primary').click();
await Promise.all(all.map(p => waitAttr(p, 'data-scene', v => v === 'online-r1')));
log('rematch started on all three');
const D = await open('D', { viewport: { width: 1280, height: 860 } }, `${BASE}?room=${code}`);
await waitAttr(D, 'data-scene', v => v?.startsWith('online-'), 10000);
await waitAttr(D, 'data-phase', v => v === 'plan', 10000);
log('late joiner D is planning in', await attr(D, 'data-scene'));
await D.page.screenshot({ path: `${out}/online-late-joiner.png` });
const r1 = Date.now();
await Promise.all([plan(A, 1), plan(C, 1), plan(D, 1)]);
await B.page.locator('[data-shove-pond]').focus();
await B.page.keyboard.press('ArrowLeft'); await B.page.keyboard.press('ArrowLeft'); // drafts, never taps Ready
await waitAttr(A, 'data-phase', v => v === 'reveal', 30000);
log('timer-expiry reveal came', Date.now() - r1, 'ms after the others were ready (round 1 limit 15 s)');
const four = [A, B, C, D];
await Promise.all(four.map(p => waitAttr(p, 'data-phase', v => v === 'plan' || v === 'card', 20000)));
const h2 = await Promise.all(four.map(p => attr(p, 'data-hash')));
log('hashes after rematch round 1', h2.join(' '));
if (new Set(h2).size !== 1) errors.push('rematch hash mismatch');
console.log(errors.join('\n') || 'no errors');
await browser.close();
