import { CASTES } from '../data/castes';
import { CHAPTERS } from '../data/campaign';
import { cx, cy, idx, isTrail } from '../core';
import { paintCheck, postTarget } from '../sim';
import { CELLS, COLS, ROWS, type CasteId, type Hazard, type LevelDef, type Sim, type SimEvent } from '../types';
import { boardTransform, computeLayout, toScreen, type Insets, type Layout } from './layout';
import { drawAnt, drawFood, drawKingfisher, drawLamp, drawMower, drawNest, drawShoe, drawSparrow, drawSpider, drawSprinkler, drawToad, INK, roundRect } from './sprites';

/**
 * Draws the yard. Three layers: a baked ground (grass, gingham, sand, water, chalk...), the live board (trail,
 * food, ants, hazards) and effects (crumb pops, dust, splashes, shoe shadows). Everything on the board is drawn in
 * board pixels through `boardTransform`, so a portrait phone gets the same drawing rotated a quarter turn.
 */
export type ViewState = {
  sim: Sim | null;
  time: number;
  card: CasteId | null;
  eraser: boolean;
  cursor: { x: number; y: number } | null;
  hover: { x: number; y: number } | null;
  ghost: [number, number][];
  /** Menu backdrop: a demo colony marching. */
  demo?: boolean;
};

type Fx = { kind: 'pop' | 'dust' | 'splash' | 'poof' | 'ring' | 'crumbs' | 'text' | 'zap'; x: number; y: number; t: number; life: number; text?: string; color?: string; n?: number };

export type Renderer = {
  readonly layout: Layout;
  resize(width: number, height: number, pr: number, insets: Insets, level: LevelDef | null): void;
  draw(ctx: CanvasRenderingContext2D, view: ViewState): void;
  onEvent(event: SimEvent, sim: Sim): void;
  update(dt: number): void;
  reset(): void;
  /** Screen shake amount (0 when reduced motion). */
  readonly shake: number;
};

const rand = (seed: number) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

export function createRenderer(reduced: boolean): Renderer {
  let layout = computeLayout(360, 560, 1, { top: 0, right: 0, bottom: 0, left: 0 });
  let ground: HTMLCanvasElement | null = null;
  let groundKey = '';
  let fog: HTMLCanvasElement | null = null;
  let fx: Fx[] = [];
  let shake = 0, dip = 0, nestPulse = 0;
  const warns = new Map<string, { total: number }>();
  let tongue: { x: number; y: number; t: number } | null = null;
  let level: LevelDef | null = null;
  let terrainDirty = true;

  const palette = () => CHAPTERS.find(ch => ch.id === level?.chapter)?.palette ?? CHAPTERS[0].palette;

  function bake(sim: Sim | null): void {
    const cs = layout.cell, pr = layout.pr;
    const key = `${cs}:${pr}:${level?.id ?? 'menu'}`;
    if (!terrainDirty && key === groundKey && ground) return;
    groundKey = key; terrainDirty = false;
    ground ??= document.createElement('canvas');
    ground.width = Math.ceil(COLS * cs * pr); ground.height = Math.ceil(ROWS * cs * pr);
    const g = ground.getContext('2d');
    if (!g) return;
    g.setTransform(pr, 0, 0, pr, 0, 0);
    const pal = palette();
    const terrain = (x: number, y: number) => (sim ? sim.terrain[idx(x, y)] : 'grass');
    const r = rand(level ? level.id.charCodeAt(0) * 31 + level.id.charCodeAt(2) : 7);
    // Grass everywhere first.
    g.fillStyle = pal.grass; g.fillRect(0, 0, COLS * cs, ROWS * cs);
    for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,200' : '40,90,20'},${0.05 + r() * 0.06})`; g.beginPath(); g.ellipse(r() * COLS * cs, r() * ROWS * cs, cs * (0.8 + r() * 1.6), cs * (0.5 + r()), r() * 3, 0, Math.PI * 2); g.fill(); }
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const t = terrain(x, y), px = x * cs, py = y * cs;
      if (t === 'grass' || t === 'chalk' || t === 'tunnel') {
        g.strokeStyle = pal.grass2; g.lineWidth = Math.max(1, cs * 0.04); g.lineCap = 'round';
        g.beginPath();
        for (let k = 0; k < 7; k++) { const bx = px + r() * cs, by = py + r() * cs, h = cs * (0.12 + r() * 0.14); g.moveTo(bx, by); g.quadraticCurveTo(bx + h * 0.3, by - h * 0.6, bx + (r() - 0.5) * h, by - h); }
        g.stroke();
        if (r() < 0.08) { g.fillStyle = r() < 0.5 ? '#fff6c8' : '#ffd0e0'; for (let p = 0; p < 5; p++) { const a = p * 1.26; g.beginPath(); g.arc(px + cs * 0.5 + Math.cos(a) * cs * 0.07, py + cs * 0.5 + Math.sin(a) * cs * 0.07, cs * 0.05, 0, Math.PI * 2); g.fill(); } g.fillStyle = '#ffc93a'; g.beginPath(); g.arc(px + cs * 0.5, py + cs * 0.5, cs * 0.04, 0, Math.PI * 2); g.fill(); }
      }
      if (t === 'blanket' || t === 'tape') {
        g.fillStyle = '#fbf3e4'; g.fillRect(px, py, cs, cs);
        g.fillStyle = 'rgba(214,72,64,.55)';
        g.fillRect(px, py, cs / 2, cs); g.fillRect(px, py, cs, cs / 2);
        g.fillStyle = 'rgba(214,72,64,.35)'; g.fillRect(px, py, cs / 2, cs / 2);
      }
      if (t === 'sand' || t === 'pit') {
        g.fillStyle = '#ecd39a'; g.fillRect(px, py, cs, cs);
        g.fillStyle = 'rgba(150,110,50,.35)';
        for (let k = 0; k < 8; k++) { g.beginPath(); g.arc(px + r() * cs, py + r() * cs, cs * 0.025, 0, Math.PI * 2); g.fill(); }
      }
      if (t === 'water' || t === 'lily') {
        const grad = g.createLinearGradient(px, py, px, py + cs);
        grad.addColorStop(0, '#5fb6e0'); grad.addColorStop(1, '#3d93c8');
        g.fillStyle = grad; g.fillRect(px, py, cs, cs);
      }
      if (t === 'wall') {
        g.fillStyle = pal.grass; g.fillRect(px, py, cs, cs);
        g.fillStyle = 'rgba(30,40,10,.25)'; g.beginPath(); g.ellipse(px + cs * 0.55, py + cs * 0.62, cs * 0.46, cs * 0.34, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#a7a39a'; g.strokeStyle = INK; g.lineWidth = Math.max(1.5, cs * 0.05);
        g.beginPath(); g.ellipse(px + cs * 0.5, py + cs * 0.5, cs * 0.44, cs * 0.36, r() * 0.6, 0, Math.PI * 2); g.fill(); g.stroke();
        g.fillStyle = 'rgba(255,255,255,.3)'; g.beginPath(); g.ellipse(px + cs * 0.38, py + cs * 0.38, cs * 0.14, cs * 0.08, -0.4, 0, Math.PI * 2); g.fill();
      }
    }
    // Blanket edges: a stitched hem around each blanket region.
    g.strokeStyle = 'rgba(150,40,36,.7)'; g.lineWidth = Math.max(1.5, cs * 0.06);
    g.beginPath();
    const isBlanket = (x: number, y: number) => x >= 0 && y >= 0 && x < COLS && y < ROWS && (terrain(x, y) === 'blanket' || terrain(x, y) === 'tape');
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (!isBlanket(x, y)) continue;
      if (!isBlanket(x, y - 1)) { g.moveTo(x * cs, y * cs); g.lineTo((x + 1) * cs, y * cs); }
      if (!isBlanket(x, y + 1)) { g.moveTo(x * cs, (y + 1) * cs); g.lineTo((x + 1) * cs, (y + 1) * cs); }
      if (!isBlanket(x - 1, y)) { g.moveTo(x * cs, y * cs); g.lineTo(x * cs, (y + 1) * cs); }
      if (!isBlanket(x + 1, y)) { g.moveTo((x + 1) * cs, y * cs); g.lineTo((x + 1) * cs, (y + 1) * cs); }
    }
    g.stroke();
    // Water banks, lily pads, chalk, tape, pits.
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const t = terrain(x, y), px = x * cs, py = y * cs, mx = px + cs / 2, my = py + cs / 2;
      if (t === 'water' || t === 'lily') {
        g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = Math.max(1, cs * 0.04);
        const wet = (ax: number, ay: number) => ax < 0 || ay < 0 || ax >= COLS || ay >= ROWS || terrain(ax, ay) === 'water' || terrain(ax, ay) === 'lily';
        g.beginPath();
        if (!wet(x, y - 1)) { g.moveTo(px, py + 2); g.lineTo(px + cs, py + 2); }
        if (!wet(x, y + 1)) { g.moveTo(px, py + cs - 2); g.lineTo(px + cs, py + cs - 2); }
        if (!wet(x - 1, y)) { g.moveTo(px + 2, py); g.lineTo(px + 2, py + cs); }
        if (!wet(x + 1, y)) { g.moveTo(px + cs - 2, py); g.lineTo(px + cs - 2, py + cs); }
        g.stroke();
      }
      if (t === 'lily') {
        g.fillStyle = '#5cb04a'; g.strokeStyle = '#2f6b24'; g.lineWidth = Math.max(1.2, cs * 0.04);
        g.beginPath(); g.moveTo(mx, my); g.arc(mx, my, cs * 0.44, 0.35, Math.PI * 2 - 0.1); g.closePath(); g.fill(); g.stroke();
      }
      if (t === 'chalk') {
        // A dusty band: a pale wash with a few strokes, and a crisp line only along the band's outer edges.
        const chalk = (ax: number, ay: number) => ax >= 0 && ay >= 0 && ax < COLS && ay < ROWS && terrain(ax, ay) === 'chalk';
        g.fillStyle = 'rgba(250,250,244,.62)'; g.fillRect(px, py, cs, cs);
        g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = Math.max(1, cs * 0.05); g.lineCap = 'round';
        for (let k = 0; k < 3; k++) { const sx = px + r() * cs, sy = py + r() * cs; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + (r() - 0.5) * cs * 0.6, sy + (r() - 0.5) * cs * 0.3); g.stroke(); }
        g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = Math.max(1.5, cs * 0.07);
        g.beginPath();
        if (!chalk(x, y - 1)) { g.moveTo(px, py); g.lineTo(px + cs, py); }
        if (!chalk(x, y + 1)) { g.moveTo(px, py + cs); g.lineTo(px + cs, py + cs); }
        if (!chalk(x - 1, y)) { g.moveTo(px, py); g.lineTo(px, py + cs); }
        if (!chalk(x + 1, y)) { g.moveTo(px + cs, py); g.lineTo(px + cs, py + cs); }
        g.stroke();
      }
      if (t === 'tape') {
        g.fillStyle = 'rgba(255,214,60,.82)'; g.fillRect(px + cs * 0.06, py + cs * 0.06, cs * 0.88, cs * 0.88);
        g.strokeStyle = 'rgba(180,130,20,.6)'; g.lineWidth = Math.max(1, cs * 0.04);
        for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(px + cs * 0.1, py + cs * (0.2 + k * 0.2)); g.lineTo(px + cs * 0.9, py + cs * (0.2 + k * 0.2)); g.stroke(); }
        g.fillStyle = 'rgba(255,255,255,.4)'; g.fillRect(px + cs * 0.12, py + cs * 0.12, cs * 0.3, cs * 0.08);
      }
      if (t === 'sand') {
        // Sliding sand beside an antlion pit: ripples curving toward the hole.
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if ((dx || dy) && x + dx >= 0 && y + dy >= 0 && x + dx < COLS && y + dy < ROWS && terrain(x + dx, y + dy) === 'pit') {
            g.strokeStyle = 'rgba(120,80,30,.4)'; g.lineWidth = Math.max(1, cs * 0.04);
            const ax = mx + dx * cs, ay = my + dy * cs, base = Math.atan2(-dy, -dx);
            for (const rad of [0.75, 0.95]) { g.beginPath(); g.arc(ax, ay, cs * rad, base - 0.35, base + 0.35); g.stroke(); }
          }
        }
      }
      if (t === 'pit') {
        const grad = g.createRadialGradient(mx, my, cs * 0.02, mx, my, cs * 0.55);
        grad.addColorStop(0, '#4a3420'); grad.addColorStop(0.5, '#a5844e'); grad.addColorStop(1, 'rgba(236,211,154,0)');
        g.fillStyle = grad; g.beginPath(); g.arc(mx, my, cs * 0.55, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(80,50,20,.5)'; g.lineWidth = Math.max(1, cs * 0.03);
        g.beginPath(); for (let a = 0; a < 12; a += 0.2) { const d = cs * 0.5 * (1 - a / 12); g.lineTo(mx + Math.cos(a) * d, my + Math.sin(a) * d); } g.stroke();
      }
    }
  }

  function bakeFog(sim: Sim): void {
    fog ??= document.createElement('canvas');
    fog.width = COLS; fog.height = ROWS;
    const f = fog.getContext('2d');
    if (!f) return;
    const img = f.createImageData ? f.createImageData(COLS, ROWS) : null;
    if (!img || !img.data || img.data.length < CELLS * 4) return;
    for (let c = 0; c < CELLS; c++) { img.data[c * 4] = 10; img.data[c * 4 + 1] = 12; img.data[c * 4 + 2] = 34; img.data[c * 4 + 3] = sim.seen[c] ? 0 : 235; }
    f.putImageData(img, 0, 0);
  }

  const P = (v: number) => (v + 0.5) * layout.cell;
  const add = (item: Fx) => { if (fx.length > 160) fx.shift(); fx.push(item); };

  function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color = '#fff', stroke = INK): void {
    ctx.save();
    ctx.translate(x, y);
    if (layout.rot) ctx.rotate(Math.PI / 2);
    ctx.font = `800 ${size}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(2, size * 0.22); ctx.strokeStyle = stroke; ctx.lineJoin = 'round';
    ctx.strokeText(text, 0, 0); ctx.fillStyle = color; ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  function drawTrail(ctx: CanvasRenderingContext2D, sim: Sim, t: number): void {
    const cs = layout.cell;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,214,120,.28)'; ctx.lineWidth = cs * 0.34;
    ctx.beginPath();
    for (let c = 0; c < CELLS; c++) {
      const p = sim.trailParent[c];
      if (p < 0) continue;
      ctx.moveTo(P(cx(p)), P(cy(p))); ctx.lineTo(P(cx(c)), P(cy(c)));
    }
    ctx.stroke();
    // Flowing dots, brighter with traffic.
    const spacing = 0.34, flow = reduced ? 0 : (t * 0.9) % spacing;
    for (let c = 0; c < CELLS; c++) {
      const p = sim.trailParent[c];
      if (p < 0) continue;
      const traffic = Math.min(1, (sim.traffic[c] + sim.traffic[p]) / 3);
      const blocked = sim.terrain[c] === 'water' && !sim.bridged[c];
      ctx.fillStyle = blocked ? 'rgba(255,255,255,.35)' : `rgba(255,${200 + traffic * 40},${110 + traffic * 80},${0.6 + traffic * 0.4})`;
      for (let d = flow; d < 1; d += spacing) {
        const x = cx(p) + (cx(c) - cx(p)) * d, y = cy(p) + (cy(c) - cy(p)) * d;
        ctx.beginPath(); ctx.arc(P(x), P(y), cs * (0.055 + traffic * 0.03), 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawHazard(ctx: CanvasRenderingContext2D, sim: Sim, h: Hazard, t: number): void {
    const cs = layout.cell, x = P(h.x), y = P(h.y);
    const num = (key: string, fb: number) => (typeof h.params?.[key] === 'number' ? h.params[key] as number : fb);
    switch (h.kind) {
      case 'spider': {
        if (!h.active) return;
        const r = num('r', 1.8) * cs;
        ctx.fillStyle = h.phase === 1 ? 'rgba(255,90,60,.12)' : 'rgba(120,40,90,.12)'; ctx.strokeStyle = 'rgba(120,30,60,.5)';
        ctx.lineWidth = 2; ctx.setLineDash([cs * 0.15, cs * 0.1]);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
        // Silk lines to the corners of its patch.
        drawSpider(ctx, x, y, cs * 0.55, t, h.angle, h.phase === 1);
        if (h.phase === 1) { const k = Math.max(0, h.hp / num('hp', 30)); ctx.fillStyle = INK; ctx.fillRect(x - cs * 0.4, y - cs * 0.62, cs * 0.8, cs * 0.12); ctx.fillStyle = '#ff7a6b'; ctx.fillRect(x - cs * 0.38, y - cs * 0.6, cs * 0.76 * k, cs * 0.08); }
        return;
      }
      case 'toad': {
        const r = num('r', 3.6) * cs, cone = num('cone', 0.7);
        if (h.phase !== 1) {
          const warn = sim.hazards.length && h.cd < 0.7;
          ctx.fillStyle = warn ? 'rgba(255,90,120,.22)' : 'rgba(255,240,120,.13)';
          ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, h.angle - cone, h.angle + cone); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = warn ? 'rgba(220,60,90,.6)' : 'rgba(120,100,20,.35)'; ctx.lineWidth = 2; ctx.stroke();
        }
        let tl = 0;
        if (tongue && tongue.t > 0) tl = Math.hypot(tongue.x - x, tongue.y - y) * Math.sin(Math.min(1, tongue.t / 0.25) * Math.PI);
        drawToad(ctx, x, y, cs * 0.95, t, tongue && tongue.t > 0 ? Math.atan2(tongue.y - y, tongue.x - x) : h.angle, h.phase === 1, tl);
        if (h.phase === 1) label(ctx, 'z z z', x + cs * 0.6, y - cs * 0.8 - Math.sin(t * 2) * 3, cs * 0.34, '#e8f0ff');
        return;
      }
      case 'sprinkler': {
        if (h.cells.length && (h.phase === 1 || warns.has(`sprinkler:${h.id}`))) {
          // The reach as a soft wedge: readable at a glance, unlike a staircase of cells.
          const rr = (num('r', 3.5) + 0.5) * cs;
          ctx.fillStyle = h.phase === 1 ? 'rgba(90,170,255,.16)' : `rgba(90,170,255,${0.1 + Math.abs(Math.sin(t * 8)) * 0.12})`;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, rr, num('a0', -Math.PI / 2), num('a1', Math.PI / 2)); ctx.closePath(); ctx.fill();
          ctx.setLineDash([cs * 0.12, cs * 0.12]); ctx.strokeStyle = 'rgba(200,235,255,.7)'; ctx.lineWidth = Math.max(1, cs * 0.04); ctx.stroke(); ctx.setLineDash([]);
        }
        drawSprinkler(ctx, x, y, cs * 0.6, h.phase === 1 ? h.angle : num('a0', 0), h.phase === 1, t);
        if (h.phase === 1) {
          ctx.strokeStyle = 'rgba(200,235,255,.65)'; ctx.lineWidth = cs * 0.22; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(h.angle) * num('r', 3.5) * cs, y + Math.sin(h.angle) * num('r', 3.5) * cs); ctx.stroke();
        }
        return;
      }
      case 'sunbeam': {
        const x2 = P(num('x2', h.x)), y2 = P(num('y2', h.y));
        ctx.strokeStyle = 'rgba(255,240,150,.35)'; ctx.lineWidth = cs * 0.12; ctx.setLineDash([cs * 0.1, cs * 0.18]);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
        const px = P(h.px), py = P(h.py), r = num('r', 0.85) * cs;
        const glow = ctx.createRadialGradient(px, py, 1, px, py, r * 1.6);
        glow.addColorStop(0, 'rgba(255,255,230,.95)'); glow.addColorStop(0.35, 'rgba(255,220,90,.7)'); glow.addColorStop(1, 'rgba(255,180,40,0)');
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(px, py, r * 1.6, 0, Math.PI * 2); ctx.fill();
        if (!reduced) { ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.5; for (let i = 0; i < 6; i++) { const a = t * 2 + i * 1.05; ctx.beginPath(); ctx.moveTo(px + Math.cos(a) * r * 0.5, py + Math.sin(a) * r * 0.5); ctx.lineTo(px + Math.cos(a) * r * 0.9, py + Math.sin(a) * r * 0.9); ctx.stroke(); } }
        return;
      }
      case 'sparrow': {
        if (h.phase === 1) {
          const total = warns.get(`sparrow:${h.id}`)?.total ?? 2.4, k = 1 - Math.max(0, h.warn) / total;
          ctx.strokeStyle = `rgba(200,40,40,${0.4 + k * 0.5})`; ctx.lineWidth = 2;
          for (const c of h.cells) { roundRect(ctx, cx(c) * cs + 3, cy(c) * cs + 3, cs - 6, cs - 6, cs * 0.2); ctx.stroke(); }
          drawSparrow(ctx, P(h.px), P(h.py), cs * (1.6 - k * 0.6), t, true);
        } else drawSparrow(ctx, P(h.px), P(h.py), cs * 0.9, t, true);
        return;
      }
      case 'mower': {
        if (h.phase === 0 && h.cells.length) {
          ctx.fillStyle = `rgba(255,120,60,${0.1 + Math.abs(Math.sin(t * 5)) * 0.1})`;
          for (const c of h.cells) ctx.fillRect(cx(c) * cs, cy(c) * cs, cs, cs);
          const ay = P(h.py + 0.5), ax = h.dir > 0 ? P(0.3) : P(COLS - 1.3);
          ctx.fillStyle = 'rgba(200,60,30,.6)';
          for (let i = 0; i < 3; i++) { const bx = ax + h.dir * (i * cs * 0.4 + ((t * 2) % 1) * cs * 0.4); ctx.beginPath(); ctx.moveTo(bx, ay - cs * 0.3); ctx.lineTo(bx + h.dir * cs * 0.3, ay); ctx.lineTo(bx, ay + cs * 0.3); ctx.closePath(); ctx.fill(); }
        }
        if (h.phase === 1) drawMower(ctx, P(h.px), P(h.py + 0.5), cs * 1.05, t, h.dir);
        return;
      }
      case 'kingfisher': {
        const diving = h.phase === 1 ? 1 - Math.max(0, h.warn) / (warns.get(`dive:${h.id}`)?.total ?? 3) : 0;
        if (h.phase === 1) {
          const c = h.cells[0];
          ctx.fillStyle = `rgba(20,30,60,${0.15 + diving * 0.4})`;
          ctx.beginPath(); ctx.ellipse(P(cx(c)), P(cy(c)), cs * (0.9 - diving * 0.4), cs * (0.6 - diving * 0.2), 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = `rgba(230,40,40,${0.5 + diving * 0.5})`; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(P(cx(c)), P(cy(c)), cs * 0.45, 0, Math.PI * 2); ctx.stroke();
          // A lowered bridge under the shadow gets a bouncing "lift me" arrow: the answer, drawn on the target.
          if (sim.bridged[c]) {
            const lift = cs * 0.85 + (reduced ? 0 : Math.abs(Math.sin(t * 6)) * cs * 0.15);
            label(ctx, '⤒', P(cx(c)) + (layout.rot ? lift : 0), P(cy(c)) - (layout.rot ? 0 : lift), cs * 0.7, '#ffe36b');
          }
        }
        drawKingfisher(ctx, P(h.px), P(h.py) - cs * (1 - diving) * 0.6, cs * 0.8, t, diving);
        return;
      }
      case 'lamp': {
        const px = P(num('plugX', h.x)), py = P(num('plugY', h.y));
        ctx.strokeStyle = 'rgba(30,30,30,.7)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo((x + px) / 2, Math.max(y, py) + cs * 0.6, px, py); ctx.stroke();
        ctx.fillStyle = h.active ? '#f2f2f2' : '#888'; ctx.strokeStyle = INK; roundRect(ctx, px - cs * 0.18, py - cs * 0.14, cs * 0.36, cs * 0.28, cs * 0.06); ctx.fill(); ctx.stroke();
        drawLamp(ctx, x, y, cs * 0.55, t, h.active);
        return;
      }
      case 'rival': {
        for (const route of sim.rivalRoutes) {
          ctx.strokeStyle = route.cut ? 'rgba(120,120,120,.3)' : 'rgba(220,60,40,.35)'; ctx.lineWidth = cs * 0.12; ctx.setLineDash([cs * 0.12, cs * 0.14]);
          ctx.beginPath(); route.cells.forEach((c, i) => (i ? ctx.lineTo(P(cx(c)), P(cy(c))) : ctx.moveTo(P(cx(c)), P(cy(c))))); ctx.stroke(); ctx.setLineDash([]);
          if (route.cut) { const m = route.cells[Math.floor(route.cells.length / 2)]; label(ctx, '✂', P(cx(m)), P(cy(m)), cs * 0.45, '#fff'); }
        }
        drawNest(ctx, x, y, cs * 0.6, t, 0, true);
        return;
      }
    }
  }

  function drawFoods(ctx: CanvasRenderingContext2D, sim: Sim, t: number): void {
    const cs = layout.cell;
    for (const food of sim.foods) {
      if (!food.visible || food.home) continue;
      if (!food.lift && food.left <= 0) continue;
      const x = P(food.lift ? food.px : food.x), y = P(food.lift ? food.py : food.y);
      const big = !!food.lift;
      const frac = big ? 1 : food.left / Math.max(1, food.crumbs);
      const connected = isTrail(sim, big ? food.at : idx(food.x, food.y));
      if (connected && !big) { ctx.fillStyle = 'rgba(255,220,120,.25)'; ctx.beginPath(); ctx.arc(x, y, cs * 0.5, 0, Math.PI * 2); ctx.fill(); }
      drawFood(ctx, food.kind, x, y, cs * (big ? 0.5 + Math.min(0.25, food.lift! / 60) : 0.42), frac, t, food.moving ? 1 : food.power > 0 ? 0.4 : 0);
      if (big) {
        const k = Math.min(1, food.power / food.lift!);
        ctx.lineWidth = cs * 0.09; ctx.strokeStyle = 'rgba(43,29,20,.55)';
        ctx.beginPath(); ctx.arc(x, y, cs * 0.72, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = k >= 1 ? '#8fe08a' : '#ffd24a';
        ctx.beginPath(); ctx.arc(x, y, cs * 0.72, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
        label(ctx, `${food.power}/${food.lift}`, x, y + cs * 0.78, cs * 0.26, k >= 1 ? '#c9f5b8' : '#fff');
      } else if (food.melt) {
        label(ctx, `${food.left}`, x, y - cs * 0.55, cs * 0.26, '#ffd0e0');
      }
      if (food.priority === 2) label(ctx, '★', x + cs * 0.36, y - cs * 0.36, cs * 0.36, '#ffd24a');
      if (food.priority === 0) label(ctx, '✕', x + cs * 0.36, y - cs * 0.36, cs * 0.32, '#ccc');
    }
  }

  function drawAnts(ctx: CanvasRenderingContext2D, sim: Sim, t: number): void {
    const cs = layout.cell;
    const scatter = sim.queen.scatter.active > 0;
    for (const ant of sim.ants) {
      if (!ant.alive || ant.state === 'idle') continue;
      let x = P(ant.x), y = P(ant.y);
      const def = CASTES[ant.caste];
      if (scatter && ant.state !== 'fly') { const a = ant.id * 2.4; x += Math.cos(a) * cs * 0.32; y += Math.sin(a) * cs * 0.32; }
      if (ant.caste === 'bridger' && ant.state === 'post' && ant.post >= 0) {
        if (!sim.bridged[ant.post]) { x = P(cx(ant.at)) + Math.cos(ant.id) * cs * 0.25; y = P(cy(ant.at)) + Math.sin(ant.id) * cs * 0.25; }
        else { const k = (ant.id % 3) - 1, horiz = cx(ant.post) !== cx(ant.at); const dir = horiz ? 0 : Math.PI / 2; drawAnt(ctx, P(cx(ant.post)) + (horiz ? k * cs * 0.3 : 0), P(cy(ant.post)) + (horiz ? 0 : k * cs * 0.3), cs * 0.5, dir + (k ? 0 : Math.PI), 'bridger', 0); continue; }
      }
      const moving = ant.state === 'out' || ant.state === 'home' || ant.state === 'fly' || ant.state === 'lost' || (ant.state === 'lift');
      // Two-lane ant highway: outbound on one side of the trail, loaded ants coming home on the other.
      if ((ant.state === 'out' || ant.state === 'home') && !scatter) {
        const side = (ant.state === 'out' ? 1 : -1) * cs * 0.13 + (((ant.id * 37) % 11) / 11 - 0.5) * cs * 0.12;
        x += Math.cos(ant.dir + Math.PI / 2) * side; y += Math.sin(ant.dir + Math.PI / 2) * side;
      }
      const phase = moving ? t * 16 + ant.id : ant.id;
      const len = cs * (def.size >= 3 ? 0.6 : def.size === 2 ? 0.52 : 0.46);
      if (ant.state === 'fly') { ctx.fillStyle = 'rgba(30,40,10,.18)'; ctx.beginPath(); ctx.ellipse(x + cs * 0.15, y + cs * 0.3, len * 0.35, len * 0.18, 0, 0, Math.PI * 2); ctx.fill(); y -= cs * 0.15; }
      drawAnt(ctx, x, y, len, ant.dir, ant.caste, phase, { load: ant.load, alpha: ant.state === 'lost' ? 0.75 + Math.sin(t * 10 + ant.id) * 0.2 : undefined });
      if (ant.state === 'lost') label(ctx, '?', x, y - cs * 0.3, cs * 0.24, '#fff');
      if (ant.caste === 'digger' && ant.state === 'post' && ant.post >= 0) {
        const k = sim.dug[ant.post];
        ctx.fillStyle = 'rgba(110,70,30,.8)';
        for (let i = 0; i < 3; i++) { const a = t * 9 + i * 2.1; ctx.beginPath(); ctx.arc(P(cx(ant.post)) + Math.cos(a) * cs * 0.2, P(cy(ant.post)) + Math.sin(a) * cs * 0.2, cs * 0.04, 0, Math.PI * 2); ctx.fill(); }
        ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(P(cx(ant.post)), P(cy(ant.post)), cs * 0.4, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
      }
      if (ant.caste === 'soldier' && ant.state === 'post') { ctx.strokeStyle = 'rgba(200,60,40,.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, cs * 0.45, 0, Math.PI * 2); ctx.stroke(); }
      if (ant.caste === 'spitter' && ant.state === 'post' && !reduced && Math.sin(t * 4 + ant.id) > 0.6) { ctx.fillStyle = 'rgba(230,220,60,.7)'; for (let i = 0; i < 3; i++) { const a = ant.dir + (i - 1) * 0.4, d = ((t * 3 + i * 0.3) % 1) * cs * 2; ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 2, 0, Math.PI * 2); ctx.fill(); } }
      if (ant.caste === 'scout' && ant.state === 'post') { const glow = ctx.createRadialGradient(x, y, 1, x, y, cs * 1.2); glow.addColorStop(0, 'rgba(200,230,255,.35)'); glow.addColorStop(1, 'rgba(200,230,255,0)'); ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, cs * 1.2, 0, Math.PI * 2); ctx.fill(); }
    }
    for (const r of sim.rivals) if (r.alive && r.i >= 0) drawAnt(ctx, P(r.x), P(r.y), cs * 0.4, r.dir, 'worker', t * 16 + r.id, { rival: true, load: r.load });
    // Stuck ants on tape.
    for (let c = 0; c < CELLS; c++) if (sim.terrain[c] === 'tape' && sim.tapeNeed[c] < 4) for (let i = 0; i < 4 - sim.tapeNeed[c]; i++) drawAnt(ctx, P(cx(c)) + (i % 2 - 0.5) * cs * 0.4, P(cy(c)) + (i < 2 ? -0.2 : 0.2) * cs, cs * 0.34, i * 1.7, 'worker', 0, { stuck: true, alpha: 0.85 });
  }

  function drawOverlays(ctx: CanvasRenderingContext2D, view: ViewState, sim: Sim, t: number): void {
    const cs = layout.cell;
    // Tunnels (dug at run time) and bridges.
    for (let c = 0; c < CELLS; c++) {
      if (sim.terrain[c] === 'tunnel') { ctx.fillStyle = 'rgba(70,45,20,.55)'; roundRect(ctx, cx(c) * cs + cs * 0.12, cy(c) * cs + cs * 0.22, cs * 0.76, cs * 0.56, cs * 0.25); ctx.fill(); ctx.strokeStyle = 'rgba(40,25,10,.6)'; ctx.lineWidth = 2; ctx.stroke(); }
      if (sim.terrain[c] === 'water' && sim.bridge[c] > 0 && sim.bridge[c] < 3) label(ctx, `${sim.bridge[c]}/3`, P(cx(c)), P(cy(c)), cs * 0.28, '#fff');
    }
    // Ghost cells from the tutorial: where to drag.
    if (view.ghost.length) {
      ctx.strokeStyle = `rgba(255,255,255,${0.55 + Math.sin(t * 4) * 0.25})`; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
      for (const [gx, gy] of view.ghost) if (!isTrail(sim, idx(gx, gy))) { ctx.beginPath(); ctx.arc(P(gx), P(gy), cs * 0.3, 0, Math.PI * 2); ctx.stroke(); }
      ctx.setLineDash([]);
    }
    // Post-card targets light up.
    if (view.card && CASTES[view.card].kind === 'post') {
      ctx.fillStyle = `rgba(143,224,138,${0.22 + Math.sin(t * 5) * 0.08})`;
      for (let c = 0; c < CELLS; c++) if ('stand' in postTarget(sim, view.card, c)) { roundRect(ctx, cx(c) * cs + 3, cy(c) * cs + 3, cs - 6, cs - 6, cs * 0.2); ctx.fill(); }
    }
    // Hover / cursor.
    const target = view.cursor ?? view.hover;
    if (target) {
      const c = idx(target.x, target.y);
      let color = 'rgba(255,255,255,.85)';
      if (view.eraser) color = isTrail(sim, c) && c !== sim.nest ? '#ff7a6b' : 'rgba(255,255,255,.5)';
      else if (view.card && CASTES[view.card].kind === 'post') color = 'stand' in postTarget(sim, view.card, c) ? '#8fe08a' : '#ff7a6b';
      else if (!isTrail(sim, c)) color = paintCheck(sim, c).ok ? '#ffe9a8' : 'rgba(255,122,107,.8)';
      ctx.strokeStyle = color; ctx.lineWidth = view.cursor ? 3 : 2;
      roundRect(ctx, target.x * cs + 2, target.y * cs + 2, cs - 4, cs - 4, cs * 0.2); ctx.stroke();
      if (view.cursor) { ctx.fillStyle = color; for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { ctx.beginPath(); ctx.arc(target.x * cs + 2 + sx * (cs - 4), target.y * cs + 2 + sy * (cs - 4), 3, 0, Math.PI * 2); ctx.fill(); } }
    }
    // The Shoe.
    if (sim.shoe.left > 0 && sim.shoe.warn > 0) {
      const total = warns.get('shoe')?.total ?? 1.5, k = 1 - sim.shoe.warn / total;
      drawShoe(ctx, P(sim.shoe.x), P(sim.shoe.y), cs * 1.6, cs * 1.05, k);
    }
  }

  function drawDemo(ctx: CanvasRenderingContext2D, t: number): void {
    const cs = layout.cell;
    drawNest(ctx, P(1), P(4), cs * 0.6, t, 0);
    for (let i = 0; i < 14; i++) {
      const d = ((t * 0.12 + i / 14) % 1);
      const x = 1.6 + d * 11, y = 4 + Math.sin(d * 7) * 1.4;
      const dir = Math.atan2(Math.cos(d * 7) * 1.4 * 7, 11);
      drawAnt(ctx, P(x), P(y), cs * 0.4, dir, i % 5 === 0 ? 'porter' : 'worker', t * 16 + i, { load: i % 2 });
    }
    drawFood(ctx, 'strawberry', P(13), P(3.6), cs * 0.6, 1, t);
    drawFood(ctx, 'cookie', P(10.5), P(6.8), cs * 0.45, 0.7, t);
  }

  const renderer: Renderer = {
    get layout() { return layout; },
    get shake() { return reduced ? 0 : shake; },
    resize(width, height, pr, insets, lvl) {
      const next = computeLayout(width, height, pr, insets);
      if (next.cell !== layout.cell || next.pr !== layout.pr || lvl !== level) terrainDirty = true;
      layout = next; level = lvl;
    },
    reset() { fx = []; warns.clear(); tongue = null; shake = 0; dip = 0; terrainDirty = true; },
    onEvent(event, sim) {
      const cs = layout.cell;
      switch (event.type) {
        case 'deliver': nestPulse = 1; add({ kind: 'pop', x: cx(sim.nest), y: cy(sim.nest) - 0.4, t: 0, life: 0.9, text: `+${event.n}`, color: event.big ? '#ffd24a' : '#fff' }); if (event.big) { add({ kind: 'ring', x: cx(sim.nest), y: cy(sim.nest), t: 0, life: 0.7, color: '#ffd24a' }); shake = Math.max(shake, 4); } break;
        case 'bite': add({ kind: 'crumbs', x: event.x, y: event.y, t: 0, life: 0.5, n: 3 }); break;
        case 'death': add({ kind: 'poof', x: event.x, y: event.y, t: 0, life: 0.8, color: event.cause === 'water' || event.cause === 'dive' ? '#bfe6ff' : '#fff' }); break;
        case 'warn': warns.set(event.kind === 'shoe' ? 'shoe' : `${event.kind}:${sim.hazards.find(h => h.x === event.x && h.y === event.y)?.id ?? sim.hazards.find(h => h.kind === (event.kind === 'dive' ? 'kingfisher' : event.kind))?.id}`, { total: event.time }); break;
        case 'strike':
          if (event.kind === 'stomp') { shake = 9; dip = 1; add({ kind: 'dust', x: event.x, y: event.y, t: 0, life: 0.7, n: 10 }); }
          if (event.kind === 'tongue') { const toad = sim.hazards.find(h => h.kind === 'toad'); if (toad) tongue = { x: P(event.x), y: P(event.y), t: 0.5 }; }
          if (event.kind === 'sparrow') { shake = Math.max(shake, 4); add({ kind: 'dust', x: event.x, y: event.y, t: 0, life: 0.5, n: 6 }); }
          if (event.kind === 'dive') { shake = Math.max(shake, 5); add({ kind: 'splash', x: event.x, y: event.y, t: 0, life: 0.8, n: 12 }); }
          if (event.kind === 'sun' || event.kind === 'zap') add({ kind: 'zap', x: event.x, y: event.y, t: 0, life: 0.5 });
          if (event.kind === 'chew') add({ kind: 'dust', x: event.x, y: event.y, t: 0, life: 0.5, n: 6, color: '#7cbf4e' });
          if (event.kind === 'flee') add({ kind: 'text', x: event.x, y: event.y - 0.5, t: 0, life: 1.2, text: '!', color: '#ffd24a' });
          break;
        case 'washed': for (const c of event.cells.slice(0, 8)) add({ kind: 'splash', x: cx(c), y: cy(c), t: 0, life: 0.6, n: 4 }); break;
        case 'erase': for (const c of event.cells.slice(0, 10)) add({ kind: 'dust', x: cx(c), y: cy(c), t: 0, life: 0.4, n: 2, color: '#ffe9a8' }); break;
        case 'paint': add({ kind: 'ring', x: cx(event.cell), y: cy(event.cell), t: 0, life: 0.35, color: '#ffe9a8' }); break;
        case 'connect': add({ kind: 'ring', x: sim.foods[event.food].x, y: sim.foods[event.food].y, t: 0, life: 0.6, color: '#8fe08a' }); break;
        case 'lift': add({ kind: 'text', x: sim.foods[event.food].px, y: sim.foods[event.food].py - 0.7, t: 0, life: 1, text: '⬆', color: '#8fe08a' }); break;
        case 'dig': add({ kind: 'dust', x: cx(event.cell), y: cy(event.cell), t: 0, life: 0.6, n: 8, color: '#a07a4a' }); terrainDirty = true; break;
        case 'tape': terrainDirty = true; add({ kind: 'ring', x: cx(event.cell), y: cy(event.cell), t: 0, life: 0.5, color: '#e8d43a' }); break;
        case 'bridge': add({ kind: 'splash', x: cx(event.cell), y: cy(event.cell), t: 0, life: 0.5, n: 6 }); break;
        case 'rival': if (event.what === 'killed') add({ kind: 'poof', x: event.x, y: event.y, t: 0, life: 0.6, color: '#ff9a7a' }); if (event.what === 'cut') add({ kind: 'ring', x: event.x, y: event.y, t: 0, life: 0.8, color: '#ff7a6b' }); break;
        case 'nest': shake = Math.max(shake, 6); add({ kind: 'ring', x: cx(sim.nest), y: cy(sim.nest), t: 0, life: 0.6, color: '#ff7a6b' }); break;
        case 'reveal': for (const c of event.cells.slice(0, 1)) add({ kind: 'ring', x: cx(c), y: cy(c), t: 0, life: 0.8, color: '#c8e6ff' }); break;
        case 'lamp': add({ kind: 'zap', x: 0, y: 0, t: 0, life: 0.01 }); break;
      }
      void cs;
    },
    update(dt) {
      for (const item of fx) item.t += dt;
      fx = fx.filter(item => item.t < item.life);
      shake = Math.max(0, shake - dt * 30); dip = Math.max(0, dip - dt * 3); nestPulse = Math.max(0, nestPulse - dt * 4);
      if (tongue) { tongue.t -= dt; if (tongue.t <= 0) tongue = null; }
    },
    draw(ctx, view) {
      const { width, height, pr } = layout, t = view.time, cs = layout.cell;
      ctx.setTransform(pr, 0, 0, pr, 0, 0);
      const sim = view.sim;
      // Backdrop around the board: a darker lawn.
      const pal = palette();
      ctx.fillStyle = sim?.level.night ? '#1d2a2a' : '#3f6b34';
      ctx.fillRect(0, 0, width, height);
      bake(sim);
      boardTransform(ctx, layout);
      if (shake > 0 && !reduced) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      // Rounded board frame with a soft shadow.
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.25)'; roundRect(ctx, -4, -2, COLS * cs + 8, ROWS * cs + 10, cs * 0.4); ctx.fill();
      roundRect(ctx, 0, 0, COLS * cs, ROWS * cs, cs * 0.35); ctx.clip();
      if (ground) ctx.drawImage(ground, 0, 0, COLS * cs, ROWS * cs);
      if (!sim) { drawDemo(ctx, t); ctx.restore(); return; }
      // Water shimmer.
      if (!reduced) {
        ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 1.5;
        for (let c = 0; c < CELLS; c++) if (sim.terrain[c] === 'water') { const ox = cx(c) * cs, oy = cy(c) * cs, k = (t * 0.5 + (c % 7) * 0.13) % 1; ctx.beginPath(); ctx.moveTo(ox + cs * 0.15 + k * cs * 0.4, oy + cs * (0.3 + (c % 3) * 0.2)); ctx.lineTo(ox + cs * 0.45 + k * cs * 0.4, oy + cs * (0.3 + (c % 3) * 0.2)); ctx.stroke(); }
      }
      drawTrail(ctx, sim, t);
      drawNest(ctx, P(cx(sim.nest)), P(cy(sim.nest)), cs * 0.62, t, nestPulse);
      for (const h of sim.hazards) if (h.kind === 'sunbeam' || h.kind === 'rival' || h.kind === 'sprinkler' || h.kind === 'mower') drawHazard(ctx, sim, h, t);
      drawFoods(ctx, sim, t);
      drawAnts(ctx, sim, t);
      for (const h of sim.hazards) if (!(h.kind === 'sunbeam' || h.kind === 'rival' || h.kind === 'sprinkler' || h.kind === 'mower') && (h.active || h.kind === 'lamp')) drawHazard(ctx, sim, h, t);
      // Effects.
      for (const item of fx) {
        const k = item.t / item.life, x = P(item.x), y = P(item.y);
        ctx.globalAlpha = 1 - k;
        if (item.kind === 'pop' || item.kind === 'text') label(ctx, item.text ?? '', x + (layout.rot ? -k * cs * 0.8 : 0), y - (layout.rot ? 0 : k * cs * 0.8), cs * (item.kind === 'pop' ? 0.36 : 0.5), item.color);
        else if (item.kind === 'ring') { ctx.strokeStyle = item.color ?? '#fff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, cs * (0.2 + k * 0.5), 0, Math.PI * 2); ctx.stroke(); }
        else if (item.kind === 'dust' || item.kind === 'splash' || item.kind === 'crumbs') {
          ctx.fillStyle = item.kind === 'splash' ? '#bfe6ff' : item.kind === 'crumbs' ? '#f3d79b' : item.color ?? '#e8dcc0';
          const n = item.n ?? 4;
          for (let i = 0; i < n; i++) { const a = i * (Math.PI * 2 / n) + item.x, d = cs * (0.15 + k * (item.kind === 'crumbs' ? 0.35 : 0.7)); ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d - (item.kind === 'splash' ? Math.sin(k * Math.PI) * cs * 0.3 : 0), cs * (item.kind === 'crumbs' ? 0.05 : 0.08) * (1 - k * 0.5), 0, Math.PI * 2); ctx.fill(); }
        } else if (item.kind === 'poof') { ctx.strokeStyle = item.color ?? '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(x, y - k * cs * 0.5, cs * 0.12, cs * 0.05, 0, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(x, y - k * cs * 0.4, cs * 0.06 * (1 - k), 0, Math.PI * 2); ctx.fill(); }
        else if (item.kind === 'zap') { ctx.fillStyle = '#fff6b0'; ctx.beginPath(); ctx.arc(x, y, cs * 0.3 * (1 - k), 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
      drawOverlays(ctx, view, sim, t);
      // Day palette: noon, then gold, then dusk.
      const p = Math.min(1, sim.time / Math.max(1, sim.sundown));
      if (sim.level.night) { ctx.fillStyle = 'rgba(20,25,70,.35)'; ctx.fillRect(0, 0, COLS * cs, ROWS * cs); }
      else if (p > 0.45) { ctx.fillStyle = p > 0.85 ? `rgba(110,50,140,${(p - 0.85) * 1.6})` : `rgba(255,160,50,${(p - 0.45) * 0.3})`; ctx.fillRect(0, 0, COLS * cs, ROWS * cs); }
      if (sim.level.night) { bakeFog(sim); if (fog) { ctx.imageSmoothingEnabled = true; ctx.drawImage(fog, 0, 0, COLS * cs, ROWS * cs); } }
      if (dip > 0 && !reduced) { ctx.fillStyle = `rgba(0,0,0,${dip * 0.25})`; ctx.fillRect(0, 0, COLS * cs, ROWS * cs); }
      ctx.restore();
      void pal; void toScreen;
    }
  };
  return renderer;
}
