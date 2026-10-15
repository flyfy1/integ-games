#!/usr/bin/env node
/**
 * Ashfall visual spot-checks: warps to named moments and captures canvas frames.
 * Run: CHROMIUM_PATH=... node scripts/ashfall-shots.mjs [scene,...]
 * Scenes: woods, quarter, foundry, combo, shotgun, roll, boss, phase2
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'test-results', 'ashfall-shots');
await mkdir(out, { recursive: true });
const wanted = (process.argv[2] || 'woods,quarter,foundry,combo,shotgun,boss,phase2').split(',');

const server = await createServer({ root, logLevel: 'error', server: { port: 5197, host: '127.0.0.1' } });
await server.listen();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e)));
try {
  const fresh = async () => {
    await page.goto('http://127.0.0.1:5197/play/ashfall?ashfall-debug', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!globalThis.__ashfall);
    await page.evaluate(() => { __ashfall.manual(true); __ashfall.start(); __ashfall.step(400); });
  };
  const canvas = page.locator('.ashfall canvas');
  const snap = async (name) => { await page.evaluate(() => __ashfall.render()); await canvas.screenshot({ path: path.join(out, `${name}.png`) }); };
  const run = (fn, arg) => page.evaluate(fn, arg);
  for (const scene of wanted) {
    await fresh();
    if (['woods', 'quarter', 'foundry'].includes(scene)) {
      const x = { woods: 2050, quarter: 4500, foundry: 8150 }[scene];
      await run((x) => { __ashfall.warp(x); __ashfall.bot(true); __ashfall.step(200); }, x);
      await snap(scene);
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
