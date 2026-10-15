#!/usr/bin/env node
/**
 * Ashfall end-to-end playtest: boots the real cabinet in Chromium, lets the debug bot
 * play through every area and the boss using the same input buffers as a human, and
 * writes screenshots plus a JSON log to test-results/ashfall/.
 *
 * Run: node scripts/ashfall-playtest.mjs [--shots] [--max-minutes=20]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'test-results', 'ashfall');
const shots = process.argv.includes('--shots');
const maxMinutes = Number(process.argv.find((a) => a.startsWith('--max-minutes='))?.split('=')[1] || 20);
await mkdir(out, { recursive: true });

const server = await createServer({ root, logLevel: 'error', server: { port: 5199, host: '127.0.0.1' } });
await server.listen();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await page.goto('http://127.0.0.1:5199/play/ashfall?ashfall-debug', { waitUntil: 'networkidle' });
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
  const marks = [[1500, '02-woods'], [2500, '03-woods-mound'], [4300, '04-quarter'], [5900, '05-quarter-awning'], [8300, '06-foundry'], [9300, '07-foundry-catwalk'], [10500, '08-foundry-end']];
  let simSeconds = 0, done = false, bossShots = 0;
  while (!done && simSeconds < maxMinutes * 60) {
    const st = await page.evaluate(() => {
      __ashfall.step(60);
      const { g, player: p, boss: b, enemies } = __ashfall;
      return { mode: g.mode, x: Math.round(p.x), hp: Math.round(p.hp), deaths: g.deaths, kills: g.kills, score: g.score, cp: g.cpIdx,
        boss: b.state, bossPhase: b.phase, armor: Math.round(b.armor), bossHp: Math.round(b.hp), attack: b.attack, alive: enemies.filter((e) => !e.dead).length, t: Math.round(g.playT) };
    });
    simSeconds++;
    if (simSeconds % 5 === 0) log.push(st);
    for (const [x, name] of marks) if (st.x >= x && !shotAt.has(name)) { shotAt.add(name); await page.evaluate(() => __ashfall.render()); await snap(name); }
    if (st.boss !== 'dormant' && st.boss !== 'intro' && simSeconds % 4 === 0 && bossShots < 10) { bossShots++; await page.evaluate(() => __ashfall.render()); await snap(`09-boss-${String(bossShots).padStart(2, '0')}-${st.bossPhase}-${st.boss}-${st.attack}`); }
    if (simSeconds % 30 === 0) console.log(JSON.stringify(st));
    if (st.mode === 'victory') done = true;
  }
  await page.evaluate(() => { __ashfall.step(200); __ashfall.render(); });
  await snap('10-victory');
  const final = await page.evaluate(() => ({ mode: __ashfall.g.mode, score: __ashfall.g.score, kills: __ashfall.g.kills, deaths: __ashfall.g.deaths, time: Math.round(__ashfall.g.playT) }));
  await writeFile(path.join(out, 'playtest.json'), JSON.stringify({ final, errors, log }, null, 2));
  console.log('FINAL', JSON.stringify(final), 'errors:', errors.length);
  if (errors.length) console.log(errors.slice(0, 10).join('\n'));
  if (final.mode !== 'victory') process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
