import { boardTransform, computeLayout, toScreen, type Insets, type Layout } from '../render/layout';
import { drawAnt, drawFood, drawNest, drawSpider, drawToad, INK, roundRect } from '../render/sprites';
import type { I18n } from './i18n';
import { pill } from './rules';
import type { Session, SessionEvent } from './session';
import { antPose, cx, cy, digPreview, diggersLeft, forks, foodCell, idx, isTrail, itemPose, type Plan, type Run } from './sim';
import { BRIDGE, PCELLS, PCOLS, PROWS, type PuzzleLevel } from './types';

/**
 * Draws a puzzle level. Ground is baked once per level and size; the live layer is the trail, the badges that show
 * who will go where (the whole point of the Plan phase), the hazards and, during a run, the ants. Board pixels go
 * through `boardTransform`, so portrait phones get the yard turned a quarter, nest at the bottom near the thumb.
 */
type Fx = { kind: 'pop' | 'ring' | 'poof' | 'x' | 'splash' | 'crumbs'; x: number; y: number; t: number; life: number; text?: string; color?: string };
export type PuzzleRenderer = {
  readonly layout: Layout;
  resize(width: number, height: number, pr: number, insets: Insets, level: PuzzleLevel | null): void;
  draw(ctx: CanvasRenderingContext2D, session: Session | null, t: number, i18n: I18n): void;
  onEvent(event: SessionEvent, session: Session): void;
  update(dt: number): void;
  reset(): void;
  /** Art capture: hide badges and counters so a close-up reads as a picture. */
  clean: boolean;
};

const PALETTES: Record<number, { grass: string; grass2: string }> = {
  1: { grass: '#8fcf5f', grass2: '#7cbf4e' }, 2: { grass: '#9ad06a', grass2: '#86c058' }, 3: { grass: '#7cc46a', grass2: '#69b05a' }, 4: { grass: '#6fa760', grass2: '#5f9552' }
};
const rand = (seed: number) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const range = (ants: number[]) => {
  if (!ants.length) return '';
  const parts: string[] = [];
  let a = ants[0], b = ants[0];
  for (let k = 1; k <= ants.length; k++) {
    if (ants[k] === b + 1) { b = ants[k]; continue; }
    parts.push(a === b ? `${a}` : b === a + 1 ? `${a},${b}` : `${a}-${b}`);
    a = b = ants[k];
  }
  return parts.join(',');
};

export function createPuzzleRenderer(reduced: boolean): PuzzleRenderer {
  let layout = computeLayout(360, 560, 1, { top: 0, right: 0, bottom: 0, left: 0 });
  let level: PuzzleLevel | null = null;
  let ground: HTMLCanvasElement | null = null, groundKey = '';
  let fx: Fx[] = [];
  let shake = 0, nestPulse = 0;
  const traffic = new Float32Array(PCELLS);
  const P = (v: number) => (v + 0.5) * layout.cell;
  const add = (item: Fx) => { if (fx.length > 120) fx.shift(); fx.push(item); };

  function bake(plan: Plan | null): void {
    const cs = layout.cell, pr = layout.pr;
    const key = `${cs}:${pr}:${level?.id ?? 'menu'}`;
    if (key === groundKey && ground) return;
    groundKey = key;
    ground ??= document.createElement('canvas');
    ground.width = Math.ceil(PCOLS * cs * pr); ground.height = Math.ceil(PROWS * cs * pr);
    const g = ground.getContext('2d');
    if (!g) return;
    g.setTransform(pr, 0, 0, pr, 0, 0);
    const pal = PALETTES[level?.chapter ?? 1] ?? PALETTES[1];
    const terrain = (x: number, y: number) => (plan ? plan.terrain[idx(x, y)] : 'grass');
    const level0 = plan?.level;
    const r = rand(level0 ? level0.id.charCodeAt(0) * 31 + level0.id.charCodeAt(2) * 7 : 7);
    g.fillStyle = pal.grass; g.fillRect(0, 0, PCOLS * cs, PROWS * cs);
    for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,200' : '40,90,20'},${0.05 + r() * 0.06})`; g.beginPath(); g.ellipse(r() * PCOLS * cs, r() * PROWS * cs, cs * (0.8 + r() * 1.6), cs * (0.5 + r()), r() * 3, 0, Math.PI * 2); g.fill(); }
    // Faint cell grid: the player counts cells, so the cells should be countable.
    g.strokeStyle = 'rgba(30,70,20,.12)'; g.lineWidth = 1;
    g.beginPath();
    for (let x = 1; x < PCOLS; x++) { g.moveTo(x * cs, 0); g.lineTo(x * cs, PROWS * cs); }
    for (let y = 1; y < PROWS; y++) { g.moveTo(0, y * cs); g.lineTo(PCOLS * cs, y * cs); }
    g.stroke();
    for (let y = 0; y < PROWS; y++) for (let x = 0; x < PCOLS; x++) {
      const t = terrain(x, y), px = x * cs, py = y * cs, mx = px + cs / 2, my = py + cs / 2;
      if (t === 'grass' || t === 'tape' || t === 'hole') {
        g.strokeStyle = pal.grass2; g.lineWidth = Math.max(1, cs * 0.04); g.lineCap = 'round';
        g.beginPath();
        for (let k = 0; k < 5; k++) { const bx = px + r() * cs, by = py + r() * cs, h = cs * (0.1 + r() * 0.12); g.moveTo(bx, by); g.quadraticCurveTo(bx + h * 0.3, by - h * 0.6, bx + (r() - 0.5) * h, by - h); }
        g.stroke();
      }
      if (t === 'water') {
        const grad = g.createLinearGradient(px, py, px, py + cs);
        grad.addColorStop(0, '#5fb6e0'); grad.addColorStop(1, '#3d93c8');
        g.fillStyle = grad; g.fillRect(px, py, cs, cs);
        g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = Math.max(1, cs * 0.04);
        const wet = (ax: number, ay: number) => ax < 0 || ay < 0 || ax >= PCOLS || ay >= PROWS || terrain(ax, ay) === 'water';
        g.beginPath();
        if (!wet(x - 1, y)) { g.moveTo(px + 2, py); g.lineTo(px + 2, py + cs); }
        if (!wet(x + 1, y)) { g.moveTo(px + cs - 2, py); g.lineTo(px + cs - 2, py + cs); }
        g.stroke();
      }
      if (t === 'wall') {
        g.fillStyle = 'rgba(30,40,10,.25)'; g.beginPath(); g.ellipse(mx + cs * 0.05, my + cs * 0.12, cs * 0.46, cs * 0.34, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#a7a39a'; g.strokeStyle = INK; g.lineWidth = Math.max(1.5, cs * 0.05);
        g.beginPath(); g.ellipse(mx, my, cs * 0.45, cs * 0.38, r() * 0.6, 0, Math.PI * 2); g.fill(); g.stroke();
        g.fillStyle = 'rgba(255,255,255,.3)'; g.beginPath(); g.ellipse(px + cs * 0.38, py + cs * 0.36, cs * 0.14, cs * 0.08, -0.4, 0, Math.PI * 2); g.fill();
      }
      if (t === 'chalk') {
        g.fillStyle = 'rgba(250,250,244,.78)'; g.fillRect(px, py, cs, cs);
        g.strokeStyle = 'rgba(200,200,190,.6)'; g.lineWidth = Math.max(1, cs * 0.04); g.lineCap = 'round';
        for (let k = 0; k < 3; k++) { const sx = px + r() * cs, sy = py + r() * cs; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + (r() - 0.5) * cs * 0.6, sy + (r() - 0.5) * cs * 0.3); g.stroke(); }
      }
      if (t === 'tape') {
        g.fillStyle = 'rgba(255,214,60,.85)'; g.fillRect(px + cs * 0.06, py + cs * 0.06, cs * 0.88, cs * 0.88);
        g.strokeStyle = 'rgba(180,130,20,.6)'; g.lineWidth = Math.max(1, cs * 0.04);
        for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(px + cs * 0.1, py + cs * (0.2 + k * 0.2)); g.lineTo(px + cs * 0.9, py + cs * (0.2 + k * 0.2)); g.stroke(); }
      }
      if (t === 'hole') {
        g.fillStyle = '#2b1a10'; g.strokeStyle = '#d6a46a'; g.lineWidth = Math.max(2, cs * 0.07);
        g.beginPath(); g.ellipse(mx, my, cs * 0.36, cs * 0.26, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      }
    }
  }

  function badge(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, bg?: string, fg?: string): void {
    ctx.save();
    ctx.translate(x, y);
    if (layout.rot) ctx.rotate(Math.PI / 2);
    pill(ctx, text, 0, 0, size, bg, fg);
    ctx.restore();
  }
  /** Board offset that reads as "above" on screen whichever way the board is turned. */
  const up = (k: number) => (layout.rot ? { dx: k * layout.cell, dy: 0 } : { dx: 0, dy: -k * layout.cell });

  function drawTrail(ctx: CanvasRenderingContext2D, plan: Plan, t: number, running: boolean): void {
    const cs = layout.cell;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,214,120,.42)'; ctx.lineWidth = cs * 0.36;
    ctx.beginPath();
    for (let c = 0; c < PCELLS; c++) {
      const p = plan.parent[c];
      if (p < 0 || plan.twin[c] === p) continue;
      ctx.moveTo(P(cx(p)), P(cy(p))); ctx.lineTo(P(cx(c)), P(cy(c)));
    }
    ctx.stroke();
    const spacing = 0.34, flow = reduced || !running ? 0 : (t * 1.6) % spacing;
    for (let c = 0; c < PCELLS; c++) {
      const p = plan.parent[c];
      if (p < 0 || plan.twin[c] === p) continue;
      const k = Math.min(1, (traffic[c] + traffic[p]) / 4);
      ctx.fillStyle = `rgba(255,${235 + k * 20},${170 + k * 85},${0.75 + k * 0.25})`;
      for (let d = flow; d < 1; d += spacing) {
        const x = cx(p) + (cx(c) - cx(p)) * d, y = cy(p) + (cy(c) - cy(p)) * d;
        ctx.beginPath(); ctx.arc(P(x), P(y), cs * (0.06 + k * 0.03), 0, Math.PI * 2); ctx.fill();
      }
    }
    // Forks get a small ring (R3): this is where ants split.
    if (!renderer.clean) for (const f of forks(plan)) { ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = Math.max(1.5, cs * 0.05); ctx.beginPath(); ctx.arc(P(cx(f)), P(cy(f)), cs * 0.2, 0, Math.PI * 2); ctx.stroke(); }
  }

  function drawDug(ctx: CanvasRenderingContext2D, plan: Plan): void {
    const cs = layout.cell;
    for (let c = 0; c < PCELLS; c++) if (plan.terrain[c] === 'dug') {
      ctx.fillStyle = 'rgba(250,250,244,.35)'; ctx.fillRect(cx(c) * cs, cy(c) * cs, cs, cs);
      ctx.fillStyle = 'rgba(90,60,30,.75)'; roundRect(ctx, cx(c) * cs + cs * 0.1, cy(c) * cs + cs * 0.2, cs * 0.8, cs * 0.6, cs * 0.25); ctx.fill();
    }
  }

  function arrow(ctx: CanvasRenderingContext2D, from: number, cells: number[], color: string): void {
    const cs = layout.cell, last = cells[cells.length - 1];
    ctx.strokeStyle = color; ctx.lineWidth = cs * 0.12; ctx.lineCap = 'round';
    const ax = P(cx(from)), ay = P(cy(from)), bx = P(cx(last)), by = P(cy(last));
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
    const a = Math.atan2(by - ay, bx - ax);
    ctx.moveTo(bx, by); ctx.lineTo(bx - Math.cos(a - 0.6) * cs * 0.3, by - Math.sin(a - 0.6) * cs * 0.3);
    ctx.moveTo(bx, by); ctx.lineTo(bx - Math.cos(a + 0.6) * cs * 0.3, by - Math.sin(a + 0.6) * cs * 0.3);
    ctx.stroke();
  }

  function drawHazards(ctx: CanvasRenderingContext2D, s: Session, run: Run | null, t: number): void {
    const cs = layout.cell, lvl = s.level;
    (lvl.spiders ?? []).forEach((sp, k) => {
      const r = sp.r ?? 1, eat = sp.eat ?? 2, eaten = run ? run.spiderEaten[k] : 0, full = eaten >= eat;
      ctx.fillStyle = full ? 'rgba(120,120,120,.12)' : 'rgba(150,40,100,.18)'; ctx.strokeStyle = full ? 'rgba(80,80,80,.4)' : 'rgba(120,20,70,.75)';
      ctx.lineWidth = Math.max(1.5, cs * 0.05); ctx.setLineDash([cs * 0.14, cs * 0.1]);
      ctx.beginPath(); ctx.rect((sp.x - r) * cs + 1, (sp.y - r) * cs + 1, (2 * r + 1) * cs - 2, (2 * r + 1) * cs - 2); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
      drawSpider(ctx, P(sp.x), P(sp.y), cs * 0.5, reduced ? 0 : t, layout.rot ? -Math.PI / 2 : 0, false);
      // Belly pips over the spider: one slot per ant it will eat; a slot fills red when it eats.
      if (!renderer.clean) {
        const o = up(0.82), cxp = P(sp.x) + o.dx, cyp = P(sp.y) + o.dy, gap = cs * 0.3;
        ctx.save(); ctx.translate(cxp, cyp); if (layout.rot) ctx.rotate(Math.PI / 2);
        ctx.fillStyle = 'rgba(60,20,50,.9)'; roundRect(ctx, -gap * eat / 2 - cs * 0.08, -cs * 0.17, gap * eat + cs * 0.16, cs * 0.34, cs * 0.17); ctx.fill();
        for (let i = 0; i < eat; i++) {
          const x = -gap * (eat - 1) / 2 + i * gap;
          ctx.lineWidth = Math.max(1.5, cs * 0.04); ctx.strokeStyle = '#fff6e3';
          ctx.fillStyle = i < eaten ? '#ff5a4a' : 'rgba(255,246,227,.15)';
          ctx.beginPath(); ctx.arc(x, 0, cs * 0.1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        ctx.restore();
      }
    });
    (lvl.toads ?? []).forEach((td, k) => {
      const r = td.r ?? 1, passes = run ? run.toadPasses[k] : 0, awake = passes >= td.sleep;
      ctx.fillStyle = awake ? 'rgba(230,80,60,.2)' : 'rgba(255,220,90,.16)'; ctx.strokeStyle = awake ? 'rgba(190,40,30,.7)' : 'rgba(150,120,20,.6)';
      ctx.lineWidth = Math.max(1.5, cs * 0.05); ctx.setLineDash([cs * 0.14, cs * 0.1]);
      ctx.beginPath(); ctx.rect((td.x - r) * cs + 1, (td.y - r) * cs + 1, (2 * r + 1) * cs - 2, (2 * r + 1) * cs - 2); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
      drawToad(ctx, P(td.x), P(td.y), cs * 0.7, reduced ? 0 : t, layout.rot ? -Math.PI / 2 : Math.PI / 2, !awake, 0);
      if (!renderer.clean) { const o = up(0.62); badge(ctx, awake ? '!' : `z ${Math.max(0, td.sleep - passes)}`, P(td.x) + o.dx, P(td.y) + o.dy, cs * 0.26, awake ? 'rgba(170,30,20,.92)' : undefined); }
    });
  }

  function drawPlanBadges(ctx: CanvasRenderingContext2D, s: Session, i18n: I18n, t: number): void {
    const cs = layout.cell, plan = s.plan, a = s.assignment, lvl = s.level;
    lvl.foods.forEach((food, f) => {
      const ants = a.foodAnts[f], x = P(food.x), y = P(food.y), reached = a.dist[f] >= 0;
      const o = up(0.66);
      if (food.lift) {
        const power = ants.reduce((sum, n) => sum + (lvl.squad[n - 1] === 'p' ? 2 : 1), 0);
        const ok = power >= food.lift;
        const below = up(-0.7);
        badge(ctx, `${power}/${food.lift}`, x + below.dx, y + below.dy, cs * 0.27, ok ? 'rgba(40,110,40,.92)' : reached ? 'rgba(190,40,30,.94)' : 'rgba(43,29,20,.8)');
      }
      if (!reached) return;
      const label = ants.length === 0 ? i18n.t('badge.none') : ants.length === 1 ? i18n.t('badge.ant', { a: ants[0] }) : i18n.t('badge.ants', { a: range(ants) });
      badge(ctx, label, x + o.dx, y + o.dy, cs * 0.25);
    });
    for (const bridge of a.bridges) {
      const x = P(cx(bridge.cell)), y = P(cy(bridge.cell));
      ctx.globalAlpha = 0.55 + (reduced ? 0 : Math.sin(t * 4) * 0.15);
      for (let k = 0; k < BRIDGE; k++) drawAnt(ctx, x + (layout.rot ? (k - 1) * cs * 0.28 : 0), y + (layout.rot ? 0 : (k - 1) * cs * 0.28), cs * 0.36, 0, 'worker', 0, { alpha: 0.6 });
      ctx.globalAlpha = 1;
      const o = up(0.66);
      const short = bridge.ants.length < BRIDGE;
      badge(ctx, i18n.t('badge.bridge', { a: range(bridge.ants) || '-' }), x + o.dx, y + o.dy, cs * 0.25, short ? 'rgba(190,40,30,.94)' : 'rgba(30,80,140,.92)');
    }
    // Digger tokens and, with the token in hand, where it can go.
    for (const dig of plan.digs) { drawAnt(ctx, P(cx(dig.at)), P(cy(dig.at)), cs * 0.5, 0, 'digger', 0); arrow(ctx, dig.at, dig.cells, 'rgba(255,210,74,.95)'); }
    if (s.tool === 'digger' && diggersLeft(plan) > 0) {
      for (let c = 0; c < PCELLS; c++) {
        if (!isTrail(plan, c)) continue;
        const dig = digPreview(plan, c);
        if (!dig) continue;
        ctx.fillStyle = `rgba(255,210,74,${0.3 + (reduced ? 0 : Math.sin(t * 5) * 0.12)})`;
        roundRect(ctx, cx(c) * cs + 3, cy(c) * cs + 3, cs - 6, cs - 6, cs * 0.2); ctx.fill();
        arrow(ctx, c, dig.cells, 'rgba(255,255,255,.7)');
      }
    }
  }

  function drawFoods(ctx: CanvasRenderingContext2D, s: Session, run: Run | null, t: number): void {
    const cs = layout.cell, lvl = s.level;
    lvl.foods.forEach((food, f) => {
      if (food.lift) {
        const item = run?.items[f];
        if (item?.home) return;
        const pose = run && item ? itemPose(run, item) : { x: food.x, y: food.y, dir: 0 };
        const k = item ? Math.min(1, item.power / food.lift) : 0;
        drawFood(ctx, food.kind, P(pose.x), P(pose.y), cs * 0.56, 1, t, item?.moving ? 1 : 0);
        if (run && item && !renderer.clean) {
          ctx.lineWidth = cs * 0.08; ctx.strokeStyle = 'rgba(43,29,20,.55)';
          ctx.beginPath(); ctx.arc(P(pose.x), P(pose.y), cs * 0.66, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = k >= 1 ? '#8fe08a' : '#ffd24a';
          ctx.beginPath(); ctx.arc(P(pose.x), P(pose.y), cs * 0.66, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
          const below = up(-0.7);
          badge(ctx, `${item.power}/${food.lift}`, P(pose.x) + below.dx, P(pose.y) + below.dy, cs * 0.27, k >= 1 ? 'rgba(40,110,40,.92)' : item.stalled || run.status === 'lost' ? 'rgba(190,40,30,.94)' : undefined);
        }
        return;
      }
      const left = run ? run.left[f] : food.crumbs;
      if (left <= 0) return;
      const reached = isTrail(s.plan, foodCell(food));
      if (reached && !run) { ctx.fillStyle = 'rgba(255,220,120,.28)'; ctx.beginPath(); ctx.arc(P(food.x), P(food.y), cs * 0.5, 0, Math.PI * 2); ctx.fill(); }
      drawFood(ctx, food.kind, P(food.x), P(food.y), cs * 0.44, left / Math.max(1, food.crumbs), t);
      if (!renderer.clean) { const below = up(-0.62); badge(ctx, `${left}`, P(food.x) + below.dx, P(food.y) + below.dy, cs * 0.22, 'rgba(255,246,227,.92)', INK); }
    });
  }

  function drawAnts(ctx: CanvasRenderingContext2D, run: Run, t: number): void {
    const cs = layout.cell;
    traffic.fill(0);
    for (const ant of run.ants) {
      const pose = antPose(run, ant);
      if (!pose || ant.phase === 'dead') continue;
      const cell = idx(Math.round(pose.x), Math.round(pose.y));
      if (cell >= 0 && cell < PCELLS) traffic[cell] += 1;
      let { x, y } = pose;
      if (ant.phase === 'out' || ant.phase === 'home') {
        // Two lanes: out on one side of the trail, home on the other.
        const side = (ant.phase === 'out' ? 1 : -1) * 0.13;
        x += Math.cos(pose.dir + Math.PI / 2) * side; y += Math.sin(pose.dir + Math.PI / 2) * side;
      }
      drawAnt(ctx, P(x), P(y), cs * (ant.kind === 'p' ? 0.6 : 0.46), pose.dir, ant.kind === 'p' ? 'porter' : 'worker', reduced ? 0 : t * 18 + ant.n, { load: ant.load, stuck: ant.phase === 'stuck', alpha: ant.phase === 'stuck' ? 0.85 : undefined });
    }
  }

  const renderer: PuzzleRenderer = {
    clean: false,
    get layout() { return layout; },
    resize(width, height, pr, insets, lvl) {
      const next = computeLayout(width, height, pr, insets);
      if (next.cell !== layout.cell || next.pr !== layout.pr || lvl !== level) groundKey = '';
      layout = next; level = lvl;
    },
    reset() { fx = []; shake = 0; nestPulse = 0; traffic.fill(0); groundKey = ''; },
    onEvent(event, s) {
      const lvl = s.level, nest = s.plan.nest;
      switch (event.type) {
        case 'deliver': nestPulse = 1; add({ kind: 'pop', x: cx(nest), y: cy(nest) - 0.4, t: 0, life: 0.8, text: `+${event.n}`, color: event.big ? '#ffd24a' : '#fff' }); if (event.big) { add({ kind: 'ring', x: cx(nest), y: cy(nest), t: 0, life: 0.7, color: '#ffd24a' }); shake = Math.max(shake, 4); } break;
        case 'bite': { const f = lvl.foods[event.food]; add({ kind: 'crumbs', x: f.x, y: f.y, t: 0, life: 0.4 }); break; }
        case 'eaten': add({ kind: 'poof', x: cx(event.cell), y: cy(event.cell), t: 0, life: 0.7 }); add({ kind: 'x', x: cx(event.cell), y: cy(event.cell), t: 0, life: 0.9 }); shake = Math.max(shake, 5); break;
        case 'bridge': add({ kind: 'splash', x: cx(event.cell), y: cy(event.cell), t: 0, life: 0.5 }); break;
        case 'lift': { const f = lvl.foods[event.food]; add({ kind: 'ring', x: f.x, y: f.y, t: 0, life: 0.6, color: '#8fe08a' }); break; }
        case 'paint': add({ kind: 'ring', x: cx(event.cell), y: cy(event.cell), t: 0, life: 0.3, color: '#ffe9a8' }); break;
        case 'connect': { const f = lvl.foods[event.food]; add({ kind: 'ring', x: f.x, y: f.y, t: 0, life: 0.6, color: '#8fe08a' }); break; }
        case 'dig': add({ kind: 'crumbs', x: cx(event.cell), y: cy(event.cell), t: 0, life: 0.5, color: '#a07a4a' }); break;
        case 'fail': shake = Math.max(shake, 3); break;
      }
    },
    update(dt) {
      for (const item of fx) item.t += dt;
      fx = fx.filter(item => item.t < item.life);
      shake = Math.max(0, shake - dt * 30); nestPulse = Math.max(0, nestPulse - dt * 4);
    },
    draw(ctx, s, t, i18n) {
      const { width, height, pr } = layout, cs = layout.cell;
      ctx.setTransform(pr, 0, 0, pr, 0, 0);
      ctx.fillStyle = '#3f6b34'; ctx.fillRect(0, 0, width, height);
      bake(s?.plan ?? null);
      boardTransform(ctx, layout);
      if (shake > 0 && !reduced) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.25)'; roundRect(ctx, -4, -2, PCOLS * cs + 8, PROWS * cs + 10, cs * 0.4); ctx.fill();
      roundRect(ctx, 0, 0, PCOLS * cs, PROWS * cs, cs * 0.35); ctx.clip();
      if (ground) ctx.drawImage(ground, 0, 0, PCOLS * cs, PROWS * cs);
      if (!s) { drawNest(ctx, P(1), P(4), cs * 0.6, t, 0); for (let i = 0; i < 10; i++) { const d = (t * 0.12 + i / 10) % 1; drawAnt(ctx, P(1.6 + d * 11), P(4 + Math.sin(d * 7) * 1.4), cs * 0.4, Math.atan2(Math.cos(d * 7) * 9.8, 11), 'worker', t * 16 + i, { load: i % 2 }); } drawFood(ctx, 'strawberry', P(13), P(3.6), cs * 0.6, 1, t); ctx.restore(); return; }
      const run = s.run, plan = run?.plan ?? s.plan;
      if (!reduced) {
        ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 1.5;
        for (let c = 0; c < PCELLS; c++) if (plan.terrain[c] === 'water') { const ox = cx(c) * cs, oy = cy(c) * cs, k = (t * 0.5 + (c % 7) * 0.13) % 1; ctx.beginPath(); ctx.moveTo(ox + cs * 0.15, oy + cs * (0.2 + k * 0.6)); ctx.lineTo(ox + cs * 0.45, oy + cs * (0.2 + k * 0.6)); ctx.stroke(); }
      }
      drawDug(ctx, plan);
      drawTrail(ctx, plan, t, !!run);
      // Living bridges.
      if (run) for (let c = 0; c < PCELLS; c++) if (plan.terrain[c] === 'water' && run.bridge[c] > 0 && run.bridge[c] < BRIDGE && !renderer.clean) { const o = up(0.66); badge(ctx, `${run.bridge[c]}/${BRIDGE}`, P(cx(c)) + o.dx, P(cy(c)) + o.dy, cs * 0.25, 'rgba(30,80,140,.92)'); }
      drawHazards(ctx, s, run, t);
      drawNest(ctx, P(cx(plan.nest)), P(cy(plan.nest)), cs * 0.62, t, nestPulse);
      drawFoods(ctx, s, run, t);
      if (run) drawAnts(ctx, run, t);
      if (!run && !renderer.clean) drawPlanBadges(ctx, s, i18n, t);
      if (!renderer.clean) {
        const home = run ? run.ants.filter(a => a.phase === 'wait' || a.phase === 'idle').length : s.level.squad.length;
        const below = up(-0.72);
        badge(ctx, i18n.t('badge.nest', { n: home }), P(cx(plan.nest)) + below.dx, P(cy(plan.nest)) + below.dy, cs * 0.25, 'rgba(255,246,227,.94)', INK);
      }
      // Ghost dots: the 1-1 path to drag, or a hint.
      if (s.ghost.length && !run) {
        ctx.strokeStyle = `rgba(255,255,255,${0.6 + (reduced ? 0 : Math.sin(t * 4) * 0.25)})`; ctx.lineWidth = 2.5; ctx.setLineDash([4, 4]);
        for (const [gx, gy] of s.ghost) if (!isTrail(plan, idx(gx, gy))) { ctx.beginPath(); ctx.arc(P(gx), P(gy), cs * 0.26, 0, Math.PI * 2); ctx.stroke(); }
        ctx.setLineDash([]);
      }
      // Where the last run lost ants, and the refused cell.
      if (s.fail && !run) {
        const counts = new Map<number, number>();
        for (const lost of s.fail.lost) counts.set(lost.cell, (counts.get(lost.cell) ?? 0) + 1);
        for (const [cell, n] of counts) { drawX(ctx, P(cx(cell)), P(cy(cell)), cs * 0.26, 1); if (n > 1) { const o = up(-0.45); badge(ctx, `×${n}`, P(cx(cell)) + cs * 0.3 + o.dx, P(cy(cell)) + o.dy, cs * 0.24, 'rgba(170,30,20,.94)'); } }
      }
      if (s.denied) { const k = 1 - s.denied.t / 0.6; ctx.strokeStyle = `rgba(255,90,74,${k})`; ctx.lineWidth = 3; roundRect(ctx, cx(s.denied.cell) * cs + 3, cy(s.denied.cell) * cs + 3, cs - 6, cs - 6, cs * 0.2); ctx.stroke(); }
      const target = s.cursor ?? s.hover;
      if (target && !run) {
        const c = idx(target.x, target.y);
        ctx.strokeStyle = isTrail(plan, c) ? 'rgba(255,255,255,.9)' : '#ffe9a8'; ctx.lineWidth = s.cursor ? 3 : 2;
        roundRect(ctx, target.x * cs + 2, target.y * cs + 2, cs - 4, cs - 4, cs * 0.2); ctx.stroke();
      }
      for (const item of fx) {
        const k = item.t / item.life, x = P(item.x), y = P(item.y);
        ctx.globalAlpha = 1 - k;
        if (item.kind === 'pop') { const o = up(k * 0.8); badge(ctx, item.text ?? '', x + o.dx, y + o.dy, cs * 0.34, 'rgba(0,0,0,0)', item.color); }
        else if (item.kind === 'ring') { ctx.strokeStyle = item.color ?? '#fff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, cs * (0.2 + k * 0.5), 0, Math.PI * 2); ctx.stroke(); }
        else if (item.kind === 'x') drawX(ctx, x, y, cs * 0.28 * (1 + (1 - k) * 0.4), 1);
        else if (item.kind === 'poof') { ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(x, y - k * cs * 0.4, cs * 0.18 * (1 - k * 0.5), 0, Math.PI * 2); ctx.fill(); }
        else { ctx.fillStyle = item.kind === 'splash' ? '#bfe6ff' : item.color ?? '#f3d79b'; for (let i = 0; i < 6; i++) { const a = i * 1.05 + item.x, d = cs * (0.15 + k * 0.4); ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, cs * 0.05, 0, Math.PI * 2); ctx.fill(); } }
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  };
  function drawX(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number): void {
    ctx.save(); ctx.globalAlpha *= alpha; ctx.lineCap = 'round';
    ctx.strokeStyle = INK; ctx.lineWidth = r * 0.55;
    ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); ctx.stroke();
    ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = r * 0.32; ctx.stroke();
    ctx.restore();
  }
  return renderer;
}

/** Screen position (CSS px within the stage) of a cell centre, for DOM overlays such as the 1-1 hand. */
export const cellOnScreen = (layout: Layout, x: number, y: number) => toScreen(layout, x, y);
