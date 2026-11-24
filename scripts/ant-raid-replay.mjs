#!/usr/bin/env node
/**
 * Crumb Raiders (puzzle mode) first-timer replay, after the 2026-11-24 pivot audit. Plays page open -> title -> Play
 * -> every level through the real UI: mouse drags on the canvas lay the trail, real clicks on GO / rule cards /
 * results / story Skip. The page hook `__ar` is used READ-ONLY (session state for timing, layout for cell maths).
 *
 * Run: node scripts/ant-raid-replay.mjs [device=pixel7|iphone|desktop] [lang=zh|en] [mode=competent|realistic] [base] [outdir]
 *   competent: the reference plan on every level (acceptance A12).
 *   realistic: the first "obvious plan" (a trap) first on levels that have one, then the reference plan (A5 timing).
 * Writes <outdir>/run-<device>-<lang>-<mode>.json and screenshots; prints a summary.
 */
import { chromium, devices } from '@playwright/test';
import fs from 'fs';

const [dev = 'pixel7', lang = 'zh', mode = 'competent', base = 'http://127.0.0.1:5173', out = '/tmp/ant-raid-replay'] = process.argv.slice(2);
fs.mkdirSync(`${out}/shots`, { recursive: true });
const tag = `${dev}-${lang}-${mode}`;
const locale = lang === 'zh' ? 'zh-CN' : 'en-US';
const browser = await chromium.launch();
const context = await browser.newContext(dev === 'pixel7' ? { ...devices['Pixel 7'], locale } : dev === 'iphone' ? { ...devices['iPhone 13'], locale } : { viewport: { width: 1280, height: 800 }, locale });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
const T0 = Date.now();
const wall = () => +((Date.now() - T0) / 1000).toFixed(2);
const report = { tag, timeline: [], levels: [], errors };
const mark = (what, extra = {}) => { report.timeline.push({ t: wall(), what, ...extra }); console.log(wall(), what, JSON.stringify(extra)); };
const shot = (name) => page.screenshot({ path: `${out}/shots/${tag}-${name}.png` }).catch(() => {});
const R = '[data-ant-raid]';

const state = () => page.evaluate(() => {
  const root = document.querySelector('[data-ant-raid]'); const ar = root?.__ar; if (!ar) return null;
  const s = ar.session, L = ar.renderer.layout, rect = root.querySelector('canvas').getBoundingClientRect();
  return {
    screen: ar.screen, dialogue: ar.dialogue, level: s?.level.id ?? null, mode: s?.mode ?? null, canGo: !!s?.canGo, ticks: s?.run?.tick ?? null, last: s?.lastRunTicks ?? 0,
    cost: s?.plan.cost ?? 0, fail: s?.fail ? s.fail.reason : null, banner: root.querySelector('.ar-banner:not([hidden]) p')?.textContent ?? '',
    layout: { rot: L.rot, cell: L.cell, ox: L.ox, oy: L.oy, w: L.width }, rect: { l: rect.left, t: rect.top, w: rect.width },
    hud: [...root.querySelectorAll('.ar-hud .ar-top > *, .ar-hud .ar-bottom > *')].filter(el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 2 && r.height > 2 && cs.display !== 'none' && !el.closest('[hidden]'); })
      .map(el => ({ ui: el.dataset.ui, text: el.textContent.trim().slice(0, 40), button: el.tagName === 'BUTTON', w: Math.round(el.getBoundingClientRect().width) })),
    plan: s ? { solution: s.level.solution, traps: s.level.traps } : null
  };
});
const pt = (st, x, y) => { const L = st.layout, k = st.rect.w / L.w; const sx = L.rot ? L.ox + (y + 0.5) * L.cell : L.ox + (x + 0.5) * L.cell; const sy = L.rot ? L.oy + (16 - (x + 0.5)) * L.cell : L.oy + (y + 0.5) * L.cell; return { x: st.rect.l + sx * k, y: st.rect.t + sy * k }; };
const waitFor = async (pred, ms = 8000) => { const t = Date.now(); for (;;) { const st = await state(); if (st && pred(st)) return st; if (Date.now() - t > ms) return st; await page.waitForTimeout(25); } };

/** Draw a plan with real drags (a dig is a tap on the Digger tray, then a tap on the cell). */
async function draw(plan) {
  const digs = [...(plan.digs ?? [])];
  for (const path of plan.paths) {
    const st = await state();
    const a = pt(st, ...path[0]);
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    for (const c of path.slice(1)) { const q = pt(st, ...c); await page.mouse.move(q.x, q.y, { steps: 2 }); await page.waitForTimeout(16); }
    await page.mouse.up();
    for (const d of [...digs]) {
      const on = await page.evaluate(([x, y]) => document.querySelector('[data-ant-raid]').__ar.session.plan.parent[y * 16 + x] !== -1, d);
      if (!on) continue;
      digs.splice(digs.indexOf(d), 1);
      await page.locator(`${R} [data-ui=digger]`).click();
      const q = pt(await state(), ...d); await page.mouse.click(q.x, q.y);
    }
  }
}
const think = (ms) => page.waitForTimeout(ms);

async function attempt(id, plan, label) {
  const rec = { label, tPlanStart: wall() };
  await draw(plan);
  rec.drawSeconds = +(wall() - rec.tPlanStart).toFixed(2);
  await shot(`${id}-${label}-plan`);
  if (!(await state()).canGo) { rec.result = 'not drawable (scent ran out / blocked)'; await shot(`${id}-${label}-stuck`); return rec; }
  const tGo = wall();
  await page.locator(`${R} [data-ui=go]`).click({ force: true });
  // Watch: until results (won) or back in plan with a reason (lost).
  let verdictWall = null, st;
  for (;;) {
    st = await state();
    if (verdictWall === null && st.mode && (st.mode === 'won' || st.mode === 'coast' || st.mode === 'beat')) verdictWall = wall();
    if (st.screen === 'results' || (st.mode === 'plan' && st.fail)) break;
    if (wall() - tGo > 30) break;
    await page.waitForTimeout(20);
  }
  rec.result = st.screen === 'results' ? 'won' : 'lost';
  rec.runSim = +(st.last / 120).toFixed(2);
  rec.goToResultWall = +(wall() - tGo).toFixed(2);
  rec.verdictToNextWall = verdictWall === null ? null : +(wall() - verdictWall).toFixed(2);
  rec.reason = st.banner || null;
  await shot(`${id}-${label}-${rec.result}`);
  return rec;
}

// ---------------------------------------------------------------- go
await page.goto(`${base}/play/ant-raid/`, { waitUntil: 'domcontentloaded' });
mark('domcontentloaded');
const gate = page.getByRole('button', { name: /Start game|开始游戏/ });
await Promise.race([gate.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {}), page.waitForFunction(() => !!document.querySelector('[data-ant-raid]')?.__ar, null, { timeout: 15000 }).catch(() => {})]);
if (await gate.count() && await gate.first().isVisible()) { mark('site gate (extra tap)'); await page.waitForTimeout(600); await gate.first().click(); }
await page.waitForFunction(() => !!document.querySelector('[data-ant-raid] [data-action=play]'));
mark('title interactive'); await shot('00-title');
await think(900);
await page.locator(`${R} [data-action=play]`).click();
const tPlay = wall(); mark('Play clicked');
const ready = await waitFor(st => st.level === '1-1' && st.mode === 'plan' && !st.screen && !st.dialogue);
report.A1_playToFirstInput = +(wall() - tPlay).toFixed(2);
mark('1-1 accepts trail input', { A1: report.A1_playToFirstInput, hud: ready.hud.map(h => h.ui) });
await shot('1-1-00-start');

const ORDER = ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '2-1', '2-2', '2-3', '2-4'];
let firstWin = null;
for (const id of ORDER) {
  let st = await waitFor(s => s.level === id && s.mode === 'plan' && (s.screen === null || s.screen === 'rule') && !s.dialogue);
  const rec = { level: id, wallStart: wall(), attempts: [] };
  if (st.screen === 'rule') { rec.ruleCard = true; await shot(`${id}-rule`); await think(1200); await page.locator(`${R} [data-action=ok]`).click(); st = await waitFor(s => !s.screen); }
  rec.hud = st.hud; rec.hudCount = st.hud.length; rec.iconOnly = st.hud.filter(h => h.button && h.text.length < 2).map(h => h.ui);
  await think(id === '1-1' ? 1500 : 1500); // read the board
  const trap = st.plan.traps.find(t => !t.wins);
  if (mode === 'realistic' && trap) {
    rec.attempts.push(await attempt(id, trap.plan, 'trap'));
    if (rec.attempts[0].result !== 'won') { await think(1500); await page.locator(`${R} [data-ui=undo]`).click({ delay: 750 }); await think(300); }
  }
  const won = await attempt(id, st.plan.solution, 'solution');
  rec.attempts.push(won);
  if (won.result === 'won' && firstWin === null) { firstWin = wall(); report.A2_pageToFirstWin = firstWin; mark('first win', { A2: firstWin }); }
  // Read the results, then Next (a story scene after a first clear: one tap on Skip).
  await think(600);
  rec.wallEnd = wall(); rec.wallDur = +(rec.wallEnd - rec.wallStart).toFixed(1);
  report.levels.push(rec);
  mark(`level ${id} ${won.result}`, { run: won.runSim, wall: rec.wallDur, hud: rec.hudCount });
  if (id === ORDER[ORDER.length - 1]) break;
  await page.locator(`${R} [data-screen=results] [data-action=next]`).click();
  await page.waitForTimeout(150);
  if ((await state()).dialogue) { await shot(`${id}-story`); await page.locator(`${R} .ar-dialogue [data-action=skip]`).click(); mark('story skipped (one tap)'); }
}
report.totalWall = wall();
const runs = report.levels.map(l => l.attempts[l.attempts.length - 1].runSim).sort((a, b) => a - b);
report.summary = {
  A1: report.A1_playToFirstInput, A2: report.A2_pageToFirstWin, A3_median: runs[Math.floor(runs.length / 2)], A3_max: runs[runs.length - 1],
  A5_failToPlan: report.levels.flatMap(l => l.attempts).filter(a => a.result === 'lost').map(a => a.verdictToNextWall),
  A6_max: Math.max(...report.levels.map(l => l.hudCount)), A6_1_1: report.levels[0].hudCount, A12_total: report.totalWall,
  iconOnly: report.levels.flatMap(l => l.iconOnly), errors: errors.length
};
fs.writeFileSync(`${out}/run-${tag}.json`, JSON.stringify(report, null, 1));
console.log('SUMMARY', JSON.stringify(report.summary));
await browser.close();
