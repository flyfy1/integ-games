#!/usr/bin/env node
// Compare gameplay-region pixels against the original Codex checkout, not generated snapshots.
// Deliberate DOM/canvas identity changes are excluded; the same seeded scene is rendered by both engines.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
const baseline = process.argv.find(a => a.startsWith('--baseline='))?.split('=')[1] || 'ab048a4';
const files = ['level.js', 'level2.js', 'art.js', 'art2.js', 'audio.js', 'sprites.js', 'levels.js', 'game.js'];
const sources = files.map(file => [file, execFileSync('git', ['show', `${baseline}:src/games/ashfall/${file}`], { encoding: 'utf8' })]);
const out = 'test-results/ashfall-regression'; await mkdir(out, { recursive: true });
const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0 } }); await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(String(e)));
try {
  await page.goto(origin);
  const result = await page.evaluate(async ({ sources }) => {
    const urls = {};
    for (const [file, code] of sources) urls[file] = URL.createObjectURL(new Blob([code.replace(/from '\.\/(.*?)'/g, (all, name) => urls[name] ? `from '${urls[name]}'` : all)], { type: 'text/javascript' }));
    const before = await import(urls['game.js']), after = await import('/src/games/ashfall/game.js');
    const hash = async data => [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(v => v.toString(16).padStart(2, '0')).join('');
    const captures = [];
    for (const level of [1, 2]) for (const x of [2050, 4500, 8150, 11250]) {
      const pair = [];
      for (const [name, engine] of [['baseline', before], ['current', after]]) {
        let seed = 1234; Math.random = () => ((seed = seed * 16807 % 2147483647) / 2147483647);
        history.replaceState({}, '', `/?ashfall-debug&ashfall-level=${level}`);
        const host = document.createElement('div'); host.style.width = '960px'; document.body.replaceChildren(host);
        const controller = engine.createAshfall(host, { random: Math.random, isReducedMotion: true, storage: { get: (_k,f) => f, set() {} } });
        const d = globalThis.__ashfall; d.manual(true); d.start(); d.warp(x); d.step(x > 11000 ? 240 : 90); d.g.cards = []; d.g.hintT = 30;
        seed = 9921; d.render();
        const cv = host.querySelector('canvas'), ctx = cv.getContext('2d');
        // Normalize to world pixels so browser CSS DPR does not change the comparison.
        const normalized = document.createElement('canvas'); normalized.width = 960; normalized.height = 540;
        const nc = normalized.getContext('2d'); nc.drawImage(cv, 0, 0, 960, 540);
        const pixels = nc.getImageData(0, 120, 960, x > 11000 ? 320 : 350).data;
        pair.push({ name, hash: await hash(pixels), width: cv.width, height: cv.height });
        controller.destroy();
      }
      captures.push({ level, x, pair, identical: pair[0].hash === pair[1].hash });
    }
    for (const url of Object.values(urls)) URL.revokeObjectURL(url);
    return captures;
  }, { sources });
  await writeFile(`${out}/pixels.json`, JSON.stringify({ baseline, errors, captures: result }, null, 2));
  assert.equal(errors.length, 0); assert.ok(result.every(r => r.identical), JSON.stringify(result.filter(r => !r.identical)));
  console.log(`PASS ${result.length} seeded I/II gameplay-region pixel comparisons against ${baseline}`);
} finally { await browser.close(); await server.close(); }
