#!/usr/bin/env node
// Real DOM interaction and responsive acceptance. Combat completion evidence lives in
// ashfall-playtest; explicitly manipulated scenes here verify lifecycle/UI boundaries.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
const out = 'test-results/ashfall-acceptance'; await mkdir(out, { recursive: true });
const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0 } }); await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [], checks = [], audio = [];
const check = (ok, name) => { assert.ok(ok, name); checks.push(name); };
try {
  for (const [name, viewport, mobile] of [['desktop', { width: 1280, height: 800 }, false], ['portrait', { width: 390, height: 844 }, true], ['small-portrait', { width: 320, height: 568 }, true], ['landscape', { width: 900, height: 450 }, true]]) {
    const only = process.argv.find(a => a.startsWith('--viewport='))?.split('=')[1]; if (only && only !== name) continue;
    const page = await browser.newPage({ viewport, hasTouch: mobile, isMobile: mobile });
    page.on('pageerror', e => errors.push(`${name}: ${e}`)); page.on('console', m => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
    await page.route('https://discuss.integ.life/sdk/v1/comments.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: '' }));
    await page.addInitScript(() => { const Native = window.AudioContext; window.__audio = []; if (Native) window.AudioContext = class extends Native { constructor(...args) { super(...args); window.__audio.push(this); } }; });
    const open = async (value = '1') => {
      await page.goto(`${origin}/play/ashfall?ashfall-debug&keep=yes&ashfall-level=${value}`, { waitUntil: 'networkidle' });
      if (mobile) await page.locator('[data-action=start-game]').tap();
      await page.waitForFunction(() => !!globalThis.__ashfall);
      await page.evaluate(() => { __ashfall.manual(true); __ashfall.render(); });
    };
    const mode = () => page.evaluate(() => __ashfall.g.mode);
    const ribbon = () => page.locator('.ashfall-ribbon strong').textContent();
    await open('3');
    check(await mode() === 'title', `${name}: no shell/mobile autoplay`);
    if (mobile) {
      const clear = await page.evaluate(() => {
        const a = document.querySelector('.ashfall-ribbon').getBoundingClientRect();
        return [...document.querySelectorAll('.stage-pause,.immersive-exit')].every(el => { const b = el.getBoundingClientRect(); return a.bottom <= b.top || a.top >= b.bottom || a.right <= b.left || a.left >= b.right; });
      });
      check(clear, `${name}: menu ribbon clears shell exit/pause buttons`);
    }
    check(await ribbon() === 'LEVEL III', `${name}: URL preselection`);
    check(await page.locator('[role=radio]').count() === 3, `${name}: all levels open`);
    for (const b of await page.locator('.ashfall-overlay button').all()) { const r = await b.boundingBox(); check(r.width >= 44 && r.height >= 44, `${name}: 44px menu target`); }
    check(!await page.locator('.ashfall-touch').isVisible(), `${name}: touch pads hidden in menu`);
    await page.locator('.af-eyebrow').click(); await page.keyboard.press('j'); await page.keyboard.press('Space');
    check(await mode() === 'title', `${name}: background/ordinary input inert`);
    await page.keyboard.press('1'); await page.keyboard.press('ArrowRight');
    check(await ribbon() === 'LEVEL II', `${name}: numeric and arrow selection`);
    check(new URL(page.url()).searchParams.get('keep') === 'yes', `${name}: unrelated URL preserved`);
    await page.keyboard.press('Tab'); check(await page.locator('[data-control=start]').evaluate(el => el === document.activeElement), `${name}: Tab reaches Start`);
    await page.keyboard.press('Enter'); await page.waitForFunction(() => __ashfall.g.mode === 'play');
    check(await page.evaluate(() => __ashfall.g.level) === 2, `${name}: Enter starts selection`);
    audio.push({ viewport: name, contexts: await page.evaluate(() => __audio.map(a => a.state)) });
    check(audio.at(-1).contexts.includes('running'), `${name}: gesture unlocks audio context`);
    await page.evaluate(() => { __ashfall.step(300); __ashfall.render(); });
    await page.locator('.ashfall').screenshot({ path: `${out}/${name}-hud-II.png` });
    // Ribbon persists independently of canvas death/pause/cinematic HUD opacity.
    await page.keyboard.press('p'); const pausedT = await page.evaluate(() => { const t = __ashfall.g.time; __ashfall.step(60); __ashfall.render(); return [t, __ashfall.g.time]; });
    check(pausedT[0] === pausedT[1] && await ribbon() === 'LEVEL II', `${name}: pause freezes simulation and keeps identity`); await page.keyboard.press('p');
    if (mobile) await page.locator('.stage-pause').tap(); else await page.locator('[data-action=pause]').click();
    await page.waitForFunction(() => !document.querySelector('[data-overlay]').hidden);
    const shellPause = await page.evaluate(() => { const t = __ashfall.g.time; __ashfall.step(60); __ashfall.render(); return [t, __ashfall.g.time]; });
    await page.screenshot({ path: `${out}/${name}-shell-pause.png` });
    check(shellPause[0] === shellPause[1] && await page.locator('.ashfall-ribbon').isVisible(), `${name}: shell pause freezes simulation and keeps ribbon ${JSON.stringify(shellPause)}`);
    await page.locator('[data-action=resume]').click();
    await page.evaluate(() => { __ashfall.player.dead = true; __ashfall.player.deadT = 1; __ashfall.render(); });
    check(await page.locator('.ashfall-ribbon').isVisible(), `${name}: death keeps ribbon`);
    await page.locator('.ashfall').screenshot({ path: `${out}/${name}-death-II.png` });
    await open('unknown'); check(await ribbon() === 'LEVEL I', `${name}: unknown URL falls back to I`);
    await page.locator('[data-level="3"]')[mobile ? 'tap' : 'click']();
    check(await mode() === 'title', `${name}: pointer selection does not start`);
    await page.locator('.ashfall').screenshot({ path: `${out}/${name}-menu.png` });
    await page.locator('[data-control=start]')[mobile ? 'tap' : 'click'](); await page.waitForFunction(() => __ashfall.g.mode === 'play');
    check(await page.evaluate(() => [__ashfall.g.level, __ashfall.player.hp, __ashfall.player.ammo].join()) === '3,100,4', `${name}: Start gives fresh III`);
    if (mobile) {
      // Actual touch handlers, no actor manipulation: hold jump through the real button.
      const jump = page.locator('[aria-label=jump]'); const r = await jump.boundingBox();
      await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); await page.evaluate(() => __ashfall.step(5));
      check(await page.evaluate(() => __ashfall.player.y < 450), `${name}: touch jump input moves player`);
    }
    await page.evaluate(() => __ashfall.render());
    await page.locator('.ashfall').screenshot({ path: `${out}/${name}-hud-III.png` });
    const geometry = await page.evaluate(() => {
      const a = document.querySelector('.ashfall-ribbon').getBoundingClientRect(), b = document.querySelector('.ashfall canvas').getBoundingClientRect();
      return { ribbon: { x:a.x,y:a.y,w:a.width,h:a.height }, canvas: { x:b.x,y:b.y,w:b.width,h:b.height }, levelWidth: document.querySelector('.ashfall-ribbon strong').getBoundingClientRect().width, font: parseFloat(getComputedStyle(document.querySelector('.ashfall-ribbon strong')).fontSize) };
    });
    check(geometry.font >= 16 && geometry.ribbon.y + geometry.ribbon.h <= geometry.canvas.y + 1, `${name}: reserved ribbon height and 16px label`);
    check(geometry.ribbon.x >= 0 && geometry.ribbon.x + geometry.ribbon.w <= viewport.width + 1, `${name}: ribbon fits viewport`);
    if (!mobile) {
      await page.locator('[data-action=fullscreen]').click();
      await page.waitForFunction(() => document.querySelector('.game-stage').classList.contains('is-immersive'));
      await page.evaluate(() => __ashfall.render());
      const fullscreen = await page.evaluate(() => {
        const a = document.querySelector('.ashfall-ribbon').getBoundingClientRect(), b = document.querySelector('.immersive-exit').getBoundingClientRect();
        return { native: !!document.fullscreenElement, clear: a.bottom <= b.top || a.top >= b.bottom || a.right <= b.left || a.left >= b.right };
      });
      check(fullscreen.clear, 'desktop: fullscreen ribbon clears exit button');
      check(await ribbon() === 'LEVEL III', 'desktop: fullscreen retains level identity');
      await page.locator('.game-stage').screenshot({ path: `${out}/desktop-fullscreen.png` });
      await page.locator('[data-action=exit-fullscreen]').click();
    }
    // Storage migration through the actual cabinet storage adapter.
    await page.evaluate(() => { localStorage.setItem('integ-games:v1:game:ashfall:ashfall-level2', 'true'); localStorage.setItem('integ-games:v1:game:ashfall:ashfall-progress-v2', '{bad'); });
    await open('2');
    check((await page.locator('[data-level="1"]').textContent()).includes('CLEARED') && !(await page.locator('[data-level="2"]').textContent()).includes('CLEARED'), `${name}: legacy flag credits I only`);
    await page.close();
  }
  check(errors.length === 0, 'zero runtime errors');
  console.log(`PASS ${checks.length} browser assertions; zero runtime errors`);
} finally {
  await writeFile(`${out}/acceptance.json`, JSON.stringify({ checks, errors, audio }, null, 2));
  await browser.close(); await server.close();
}
