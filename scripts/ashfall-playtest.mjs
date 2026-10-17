#!/usr/bin/env node
/**
 * Ashfall end-to-end playtest: boots the real cabinet in Chromium, lets the debug bot
 * play through every area and the boss using the same input buffers as a human, and
 * writes screenshots plus a JSON log to test-results/ashfall-level{1,2}/.
 *
 * Run: node scripts/ashfall-playtest.mjs [--level=1|2] [--shots] [--max-minutes=20]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const level = process.argv.includes('--level=2') ? 2 : 1;
const out = path.join(root, 'test-results', `ashfall-level${level}`);
const shots = process.argv.includes('--shots');
const maxMinutes = Number(process.argv.find((a) => a.startsWith('--max-minutes='))?.split('=')[1] || 20);
await mkdir(out, { recursive: true });

const server = await createServer({ root, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
// The external comments widget is unrelated to the cabinet and disallows localhost CORS.
await page.route('https://discuss.integ.life/sdk/v1/comments.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: '/* comments disabled in game verification */' }));
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await page.goto(`${origin}/play/ashfall?ashfall-debug&ashfall-level=${level}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!globalThis.__ashfall, null, { timeout: 30000 });
  await page.waitForTimeout(600);
  const canvas = page.locator('.ashfall canvas');
  const snap = async (name) => { if (shots) await canvas.screenshot({ path: path.join(out, `${name}.png`) }); };
  await page.evaluate(() => { __ashfall.manual(true); __ashfall.step(120); __ashfall.render(); });
  await snap('00-title');
  await page.evaluate(() => { __ashfall.start(); __ashfall.bot(true); __ashfall.step(150); __ashfall.render(); });
  await snap('01-intro-card');
  const log = [];
  const shotAt = new Set();
  const marks = [[1500, '02-zone-one'], [2500, '03-first-pits'], [4300, '04-zone-two'], [5900, '05-upper-route'], [8300, '06-zone-three'], [9300, '07-catwalk'], [10500, '08-final-seal']];
  let simSeconds = 0, done = false;
  const bossShots = { 1: 0, 2: 0 };
  while (!done && simSeconds < maxMinutes * 60) {
    const st = await page.evaluate(() => {
      __ashfall.step(60);
      const { g, player: p, boss: b, enemies } = __ashfall;
      return { level: g.level, mode: g.mode, ambushes: [...g.ambushDone], upgrades: [...g.upgrades], x: Math.round(p.x), hp: Math.round(p.hp), deaths: g.deaths, kills: g.kills, score: g.score, cp: g.cpIdx,
        boss: b.state, bossPhase: b.phase, armor: Math.round(b.armor), bossHp: Math.round(b.hp), attack: b.attack, alive: enemies.filter((e) => !e.dead).length, t: Math.round(g.playT) };
    });
    simSeconds++;
    if (simSeconds % 5 === 0) log.push(st);
    for (const [x, name] of marks) if (st.x >= x && !shotAt.has(`${st.level}-${name}`)) { shotAt.add(`${st.level}-${name}`); await page.evaluate(() => __ashfall.render()); await snap(`level${st.level}-${name}`); }
    if (st.boss !== 'dormant' && st.boss !== 'intro' && simSeconds % 4 === 0 && bossShots[st.level] < 10) { bossShots[st.level]++; await page.evaluate(() => __ashfall.render()); await snap(`09-level${st.level}-boss-${String(bossShots[st.level]).padStart(2, '0')}-${st.bossPhase}-${st.boss}-${st.attack}`); }
    if (simSeconds % 30 === 0) console.log(JSON.stringify(st));
    if (st.mode === 'victory' && st.level === 2) done = true;
  }
  await page.evaluate(() => { __ashfall.step(200); __ashfall.render(); });
  await snap('10-victory');
  const final = await page.evaluate(() => ({ level: __ashfall.g.level, mode: __ashfall.g.mode, ambushes: [...__ashfall.g.ambushDone], upgrades: [...__ashfall.g.upgrades], score: __ashfall.g.score, kills: __ashfall.g.kills, deaths: __ashfall.g.deaths, time: Math.round(__ashfall.g.playT) }));
  await writeFile(path.join(out, 'playtest.json'), JSON.stringify({ final, errors, log }, null, 2));
  console.log('FINAL', JSON.stringify(final), 'errors:', errors.length);
  if (errors.length) console.log(errors.slice(0, 10).join('\n'));
  if (errors.length || final.mode !== 'victory' || final.level !== 2 || final.ambushes.length !== 3 || final.upgrades.length !== 2) process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
