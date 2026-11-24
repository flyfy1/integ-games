#!/usr/bin/env node
/**
 * Crumb Raiders UI replay: plays a level's stored reference script (src/games/ant-raid/data/solutions.ts) through the
 * real input path — mouse or touch drags to lay trail, taps on cards, food and Queen buttons — against a running dev
 * server, and prints the outcome. The sim is only read, never written, so a win proves the UI can do what the script does.
 *
 * Run: node scripts/ant-raid-replay.mjs <level> [device] [base-url] [shot-dir]
 *   e.g. node scripts/ant-raid-replay.mjs 1-5 "iPhone 13" http://127.0.0.1:5173 /tmp/shots
 */
import { chromium, devices } from '@playwright/test';

const [levelId = '1-1', device = 'desktop', base = 'http://127.0.0.1:5173', shots = ''] = process.argv.slice(2);
const browser = await chromium.launch();
const context = await browser.newContext(device === 'desktop' ? { viewport: { width: 1280, height: 860 } } : devices[device]);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
const touch = device !== 'desktop';
const cdp = touch ? await context.newCDPSession(page) : null;
const tag = `${device.replace(/\s+/g, '_')}-${levelId}`;
const shot = async (name) => { if (shots) await page.screenshot({ path: `${shots}/${tag}-${name}.png` }); };

try {
  await page.goto(`${base}/play/ant-raid/`);
  const gate = page.getByRole('button', { name: 'Start game' });
  await page.waitForTimeout(1200);
  if (await gate.count()) await gate.click();
  await page.waitForFunction(() => !!document.querySelector('[data-ant-raid]')?.__ar);
  const script = await page.evaluate(async (id) => {
    const { SOLUTIONS } = await import('/src/games/ant-raid/data/solutions.ts');
    const ar = document.querySelector('[data-ant-raid]').__ar;
    const solution = SOLUTIONS[id];
    ar.start(id, solution.loadout);
    return solution;
  }, levelId);
  await page.waitForFunction(() => !!document.querySelector('[data-ant-raid]').__ar.session);

  const read = () => page.evaluate(() => {
    const ar = document.querySelector('[data-ant-raid]').__ar;
    const sim = ar.session?.sim;
    if (!sim) return null;
    const L = ar.renderer.layout;
    const rect = document.querySelector('[data-ant-raid] canvas').getBoundingClientRect();
    const counts = {};
    for (const ant of sim.ants) if (ant.alive) counts[ant.caste] = (counts[ant.caste] ?? 0) + 1;
    return {
      t: sim.time, status: sim.status, sugar: sim.sugar, crumbs: sim.crumbs, lost: sim.stats.lost, counts,
      trail: Array.from(sim.trailParent, (p) => p !== -1), nest: sim.nest,
      foods: sim.foods.map((f) => ({ id: f.id, at: f.at, priority: f.priority })),
      nap: sim.hazards.some((h) => h.kind === 'toad' && h.phase === 1) && sim.foods.some((f) => f.lift && f.moving), rally: sim.queen.rally.cd,
      shoe: sim.shoe.left > 0 && sim.shoe.warn > 0 ? sim.shoe.warn : 0,
      cards: Object.fromEntries(sim.cards.map((c) => [c.caste, c.cooldown])),
      layout: { rot: L.rot, ox: L.ox, oy: L.oy, cell: L.cell, left: rect.left, top: rect.top }
    };
  });
  const screen = (s, x, y) => s.layout.rot
    ? { x: s.layout.left + s.layout.ox + (y + 0.5) * s.layout.cell, y: s.layout.top + s.layout.oy + (16 - (x + 0.5)) * s.layout.cell }
    : { x: s.layout.left + s.layout.ox + (x + 0.5) * s.layout.cell, y: s.layout.top + s.layout.oy + (y + 0.5) * s.layout.cell };
  const tap = async (pt) => {
    if (!touch) { await page.mouse.click(pt.x, pt.y); return; }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const drag = async (points) => {
    if (!touch) {
      await page.mouse.move(points[0].x, points[0].y); await page.mouse.down();
      for (const pt of points.slice(1)) await page.mouse.move(pt.x, pt.y, { steps: 3 });
      await page.mouse.up(); return;
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]] });
    for (let i = 1; i < points.length; i += 1) for (let k = 1; k <= 3; k += 1) {
      const a = points[i - 1], b = points[i];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + (b.x - a.x) * k / 3, y: a.y + (b.y - a.y) * k / 3 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const id = (x, y) => y * 16 + x;
  const paintPath = async (s, cells) => {
    const todo = cells.filter(([x, y]) => !s.trail[id(x, y)]);
    if (!todo.length) return;
    const [fx, fy] = todo[0];
    const start = [[fx - 1, fy], [fx + 1, fy], [fx, fy - 1], [fx, fy + 1]].find(([x, y]) => x >= 0 && x < 16 && y >= 0 && y < 9 && (s.trail[id(x, y)] || id(x, y) === s.nest));
    await drag([start, ...todo].map(([x, y]) => screen(s, x, y)));
  };

  const keeps = [], keepPaths = [];
  let lastRepaint = 0;
  const reacts = new Set();
  const ops = [...script.ops].sort((a, b) => a.t - b.t);
  let next = 0, half = false, lastTap = 0, last = null;
  if (process.env.FAST) await page.locator('[data-ant-raid] [data-ui="speed"]').click().catch(() => {});
  for (let guard = 0; guard < 6000; guard += 1) {
    const s = await read();
    if (!s) { console.error('session vanished at', last?.t, 'screen', await page.evaluate(() => document.querySelector('[data-ant-raid]').__ar.screen)); break; }
    last = s;
    if (s.status !== 'playing') break;
    while (next < ops.length && ops[next].t <= s.t) {
      const op = ops[next++];
      if (op.paint) { await paintPath(await read(), op.paint); if (op.keep) keepPaths.push(op.paint); }
      else if (op.play) { await page.locator(`[data-ant-raid] [data-card="${op.play}"]`).click(); await tap(screen(s, op.at[0], op.at[1])); }
      else if (op.keep) keeps.push(op);
      else if (op.react) reacts.add(op.react);
      else if (op.priority) {
        for (let i = 0; i < 3; i += 1) {
          const now = await read(); const food = now.foods.find((f) => f.id === op.priority);
          if (!food || food.priority === op.level) break;
          await tap(screen(now, food.at % 16, Math.floor(food.at / 16))); await page.waitForTimeout(60);
        }
      } else if (op.queen) await page.locator(`[data-ant-raid] [data-queen="${op.queen}"]`).click();
    }
    if (keepPaths.length && s.t - lastRepaint > 1) { lastRepaint = s.t; for (const cells of keepPaths) await paintPath(await read(), cells); }
    if (reacts.has('rally-nap') && s.nap && s.rally <= 0) await page.locator('[data-ant-raid] [data-queen="rally"]').click();
    if (reacts.has('scatter-shoe') && s.shoe > 0 && s.shoe < 1.2) await page.locator('[data-ant-raid] [data-queen="scatter"]').click();
    if (s.t - lastTap > 0.4) for (const keep of keeps) {
      if (keep.until !== undefined && s.t > keep.until) continue;
      if ((s.counts[keep.keep] ?? 0) >= keep.ants || s.cards[keep.keep] > 0) continue;
      await page.locator(`[data-ant-raid] [data-card="${keep.keep}"]`).click(); lastTap = s.t; break;
    }
    if (!half && s.t > 25) { half = true; await shot('mid'); }
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(600);
  await shot('end');
  await page.waitForTimeout(2400);
  await shot('results');
  const outcome = await page.evaluate(() => { const ar = document.querySelector('[data-ant-raid]').__ar; return { screen: ar.screen, status: ar.session?.sim.status, crumbs: ar.session?.sim.crumbs, lost: ar.session?.sim.stats.lost, t: ar.session?.sim.time }; });
  console.log(JSON.stringify({ level: levelId, device, final: last && { status: last.status, t: Math.round(last.t), crumbs: last.crumbs, lost: last.lost }, ...outcome, errors: errors.slice(0, 3) }));
} finally {
  await browser.close();
}
