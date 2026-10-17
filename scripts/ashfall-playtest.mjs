#!/usr/bin/env node
/**
 * Ashfall end-to-end playtest: boots the real cabinet in Chromium, lets the debug bot
 * play through every area and the boss using the same input buffers as a human, and
 * writes screenshots plus a JSON log to test-results/ashfall-level{1,2,3}/.
 *
 * Run: node scripts/ashfall-playtest.mjs [--level=1|2|3] [--single-level] [--shots] [--mobile] [--seed=1234] [--label=name] [--max-minutes=20]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const level = Number(process.argv.find(a => a.startsWith('--level='))?.split('=')[1] || 1);
if (![1, 2, 3].includes(level)) throw new Error('Level must be 1, 2 or 3');
const single = process.argv.includes('--single-level');
const mobile = process.argv.includes('--mobile');
const label = process.argv.find((a) => a.startsWith('--label='))?.split('=')[1] || '';
const out = path.join(root, 'test-results', `ashfall-level${level}${mobile ? '-mobile' : ''}${label ? '-' + label : ''}`);
const shots = process.argv.includes('--shots');
const maxMinutes = Number(process.argv.find((a) => a.startsWith('--max-minutes='))?.split('=')[1] || 20);
await mkdir(out, { recursive: true });

const server = await createServer({ root, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: mobile ? { width: 900, height: 450 } : { width: 1280, height: 800 }, hasTouch: mobile, isMobile: mobile });
// Seed the random stream; frame/render timing can still vary between browser runs.
const seed = Number(process.argv.find((a) => a.startsWith('--seed='))?.split('=')[1] || 1234);
await page.addInitScript((seed) => { let s = seed; Math.random = () => ((s = (s * 16807) % 2147483647) / 2147483647); }, seed);
// The external comments widget is unrelated to the cabinet and disallows localhost CORS.
await page.route('https://discuss.integ.life/sdk/v1/comments.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: '/* comments disabled in game verification */' }));
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await page.goto(`${origin}/play/ashfall?ashfall-debug&ashfall-level=${level}`, { waitUntil: 'networkidle' });
  if (mobile) await page.locator('[data-action="start-game"]').tap();
  await page.waitForFunction(() => !!globalThis.__ashfall, null, { timeout: 30000 });
  await page.waitForTimeout(600);
  const canvas = page.locator('.ashfall');

  const snap = async (name) => { if (shots) await canvas.screenshot({ path: path.join(out, `${name}.png`) }); };
  await page.evaluate(() => { __ashfall.manual(true); __ashfall.step(120); __ashfall.render(); });
  await snap('00-title');
  await page.evaluate(() => { __ashfall.start(); __ashfall.bot(true); __ashfall.step(150); __ashfall.render(); });
  await snap('01-intro-card');
  const log = [];
  const shotAt = new Set();
  const marks = [[1500, '02-zone-one'], [2500, '03-first-pits'], [4300, '04-zone-two'], [5900, '05-upper-route'], [8300, '06-zone-three'], [9300, '07-catwalk'], [10500, '08-final-seal']];
  let simSeconds = 0, done = false;
  const bossShots = { 1: 0, 2: 0, 3: 0 };
  const completed = [];
  while (!done && simSeconds < maxMinutes * 60) {
    const st = await page.evaluate(() => {
      __ashfall.step(30);
      const { g, player: p, boss: b, enemies } = __ashfall;
      return { level: g.level, mode: g.mode, ambushes: [...g.ambushDone], upgrades: [...g.upgrades], x: Math.round(p.x), y: Math.round(p.y), flood: g.flood ? { y: Math.round(g.flood.y), distance: Math.round(g.flood.y - p.y), held: g.flood.held, grace: g.flood.grace } : null, floodRescues: g.floodRescues || 0, hp: Math.round(p.hp), deaths: g.deaths, kills: g.kills, score: g.score, cp: g.cpIdx,
        boss: b.state, bossPhase: b.phase, armor: Math.round(b.armor), bossHp: Math.round(b.hp), attack: b.attack, alive: enemies.filter((e) => !e.dead).length, t: Math.round(g.playT) };
    });
    simSeconds += 0.5;
    if (simSeconds % 2 === 0) log.push(st);
    const moments = [
      [st.level === 2 && st.x > 1200 && st.x < 3000 && st.flood?.distance < 180 && !st.flood?.held, 'water-chase-IV'],
      [st.flood?.held === 'gate', 'gate-hold'],
      [st.bossPhase === 1 && st.flood?.held === 'arena', 'boss-phase1-water-lock']
    ];
    for (const [ready, name] of moments) if (ready && !shotAt.has(name)) { shotAt.add(name); await page.evaluate(() => __ashfall.render()); await snap(name); }

    for (const [x, name] of marks) if (st.x >= x && !shotAt.has(`${st.level}-${name}`)) { shotAt.add(`${st.level}-${name}`); await page.evaluate(() => __ashfall.render()); await snap(`level${st.level}-${name}`); }
    if (st.boss !== 'dormant' && st.boss !== 'intro' && simSeconds % 4 === 0 && bossShots[st.level] < 10) { bossShots[st.level]++; await page.evaluate(() => __ashfall.render()); await snap(`09-level${st.level}-boss-${String(bossShots[st.level]).padStart(2, '0')}-${st.bossPhase}-${st.boss}-${st.attack}`); }
    if (simSeconds % 30 === 0) console.log(JSON.stringify(st));
    if (st.mode === 'interlude' || st.mode === 'victory') {
      if (!completed.some(c => c.level === st.level)) { completed.push(st); await page.evaluate(() => { __ashfall.step(180); __ashfall.render(); }); await snap(`complete-level${st.level}`); }
      if (single || st.mode === 'victory') done = true;
      else await page.keyboard.press('Enter');
    }
  }
  await page.evaluate(() => { __ashfall.step(200); __ashfall.render(); });
  await snap('10-victory');
  const final = await page.evaluate(() => ({ level: __ashfall.g.level, mode: __ashfall.g.mode, ambushes: [...__ashfall.g.ambushDone], upgrades: [...__ashfall.g.upgrades], score: __ashfall.g.score, kills: __ashfall.g.kills, deaths: __ashfall.g.deaths, time: Math.round(__ashfall.g.playT), floodRescues: __ashfall.g.floodRescues || 0, ascent: 450 - (__ashfall.level.ARENA.floor ?? 450), results: __ashfall.g.results }));
  await writeFile(path.join(out, 'playtest.json'), JSON.stringify({ final, completed, errors, seed, moments: [...shotAt], log }, null, 2));
  console.log('FINAL', JSON.stringify(final), 'errors:', errors.length);
  if (errors.length) console.log(errors.slice(0, 10).join('\n'));
  if (errors.length || !done || completed.length !== (single ? 1 : 4 - level) || completed.some(c => c.ambushes.length !== 3 || (c.level === 2 && c.upgrades.length !== 2))) process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
