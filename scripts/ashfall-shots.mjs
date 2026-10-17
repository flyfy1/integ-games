#!/usr/bin/env node
/**
 * Ashfall visual spot-checks: warps to named moments and captures canvas frames.
 * Run: CHROMIUM_PATH=... node scripts/ashfall-shots.mjs [scene,...] [--level=2] [--mobile]
 * Scenes: woods, quarter, foundry, aqueduct, archive, crown, combo, shotgun, roll, boss, phase2, conduit
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const level = process.argv.includes('--level=2') ? 2 : 1;
const mobile = process.argv.includes('--mobile');
const out = path.join(root, 'test-results', `ashfall-shots-level${level}${mobile ? '-mobile' : ''}`);
await mkdir(out, { recursive: true });
const wanted = (process.argv.slice(2).find((a) => !a.startsWith('--')) || (level === 2 ? 'aqueduct,archive,crown,combo,shotgun,boss,phase2,conduit' : 'woods,quarter,foundry,combo,shotgun,boss,phase2')).split(',');

const server = await createServer({ root, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: mobile ? { width: 900, height: 450 } : { width: 1280, height: 800 }, hasTouch: mobile, isMobile: mobile });
// The external comments widget is unrelated to the cabinet and disallows localhost CORS.
await page.route('https://discuss.integ.life/sdk/v1/comments.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: '/* comments disabled in game verification */' }));
page.on('pageerror', (e) => { console.error('PAGEERROR', String(e)); process.exitCode = 1; });
try {
  const fresh = async () => {
    await page.goto(`${origin}/play/ashfall?ashfall-debug&ashfall-level=${level}`, { waitUntil: 'networkidle' });
    if (mobile) await page.locator('[data-action="start-game"]').tap();
    await page.waitForFunction(() => !!globalThis.__ashfall);
    await page.evaluate(() => { __ashfall.manual(true); __ashfall.start(); __ashfall.step(400); });
    if (mobile && await page.locator('.ashfall-touch.on button').count() !== 5) throw new Error('Missing mobile actions');
  };
  const canvas = page.locator(mobile ? '.ashfall' : '.ashfall canvas');
  const snap = async (name) => { await page.evaluate(() => __ashfall.render()); await canvas.screenshot({ path: path.join(out, `${name}.png`) }); };
  const run = (fn, arg) => page.evaluate(fn, arg);
  for (const scene of wanted) {
    await fresh();
    if (['woods', 'quarter', 'foundry', 'aqueduct', 'archive', 'crown'].includes(scene)) {
      const x = { woods: 2050, quarter: 4500, foundry: 8150, aqueduct: 2050, archive: 4500, crown: 8150 }[scene];
      await run((x) => { __ashfall.warp(x); __ashfall.step(90); }, x);
      await snap(scene);
    } else if (scene === 'conduit') {
      await run(() => { __ashfall.warp(11250); __ashfall.step(300); const b = __ashfall.boss; b.phase = 2; b.armor = 0; b.plates.forEach((p) => p.gone = true); b.state = 'idle'; b.next = 'conduit'; b.cd = 0; __ashfall.step(50); });
      await snap('conduit-warning');
      await run(() => { const b = __ashfall.boss; let n = 0; while (b.state === 'windup' && n++ < 150) __ashfall.step(1); if (b.state === 'windup') throw new Error('Conduit never discharged'); });
      await snap('conduit-first-strike');
      await run(() => __ashfall.step(35)); await snap('conduit-second-warning');
      await run(() => { let n = 0; while (!__ashfall.g.conduits.some((c) => c.t >= 0 && c.t < 0.3) && n++ < 120) __ashfall.step(1); if (n >= 120) throw new Error('Second conduit pulse never discharged'); });
      await snap('conduit-second-strike');
    } else if (scene === 'combo') {
      await run(() => { __ashfall.warp(760); __ashfall.step(30); const e = __ashfall.enemies[0]; e.x = __ashfall.player.x + 55; e.state = 'chase'; e.cd = 5; });
      const ticks = [0, 4, 7, 9, 13, 19, 22, 26, 34, 38, 41, 46];
      let t = 0;
      for (const at of ticks) {
        await run(([from, to]) => { for (let i = from; i < to; i++) { if (i === 0 || i === 11 || i === 24) __ashfall.press('attack'); __ashfall.step(1); } }, [t, at]);
        t = at; await snap(`combo-${String(at).padStart(2, '0')}`);
      }
    } else if (scene === 'shotgun') {
      await run(() => { __ashfall.warp(8150); __ashfall.step(10); __ashfall.press('shoot'); __ashfall.step(3); });
      await snap('shotgun-a');
      await run(() => { __ashfall.step(4); }); await snap('shotgun-b');
    } else if (scene === 'roll') {
      await run(() => { __ashfall.warp(700); __ashfall.press('roll'); __ashfall.step(8); }); await snap('roll');
    } else if (scene === 'boss' || scene === 'phase2') {
      await run(() => { __ashfall.warp(11250); __ashfall.step(230); });
      await snap('boss-intro');
      await run(() => { __ashfall.step(60); });
      if (scene === 'phase2') { await run(() => { const b = __ashfall.boss; b.armor = 1; __ashfall.press('shoot'); }); await run(() => { __ashfall.player.x = __ashfall.boss.x - 160; __ashfall.player.face = 1; __ashfall.press('shoot'); __ashfall.step(20); }); await snap('transform-a'); await run(() => __ashfall.step(90)); await snap('transform-b'); await run(() => __ashfall.step(200)); }
      // slam impact frame (hammer head must meet the floor at the danger bar)
      await run(() => { const b = __ashfall.boss; let n = 0; while (n++ < 900 && !(b.attack === 'slam' && b.state === 'recover' && b.t > 0.02)) { if (b.state === 'idle' && b.cd < 0.2) { b.cd = 0; } __ashfall.step(1); __ashfall.player.hp = 100; } });
      await snap(`${scene}-slam-impact`);
      for (let i = 0; i < 6; i++) { await run(() => { const b = __ashfall.boss; let n = 0; while (n++ < 400 && !(b.state === 'windup' && b.t > b.windup * 0.7)) __ashfall.step(1); }); const st = await run(() => __ashfall.boss.attack); await snap(`${scene}-tele-${i}-${st}`); await run(() => __ashfall.step(40)); }
    }
    console.log('shot', scene);
  }
} finally { await browser.close(); await server.close(); }
