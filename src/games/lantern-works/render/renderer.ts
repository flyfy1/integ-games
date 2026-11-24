import { codeOf } from '../goods';
import { DX, DY, T, itemsOf, sorterSide, splitterSides, type Sim } from '../sim';
import type { Dir, Good, Item, PartKind, SimEvent } from '../types';
import { COLOR_HEX, drawCat, drawGood, drawPart, drawPaw, type PartAnim } from './art';

/**
 * Lantern Works renderer: the workshop floor, belts, machines, goods sliding between cells on the beat, the dusk
 * light (lit lanterns and working machines light the floor around them), Inspector Mittens, and the celebration.
 * It only reads the sim; `beforeStep` / `afterStep` let it interpolate each item from where it was to where it is.
 */
export type Layout = { cell: number; ox: number; oy: number; w: number; h: number; width: number; height: number };
export type Tool = PartKind | 'erase' | null;
export type ViewState = {
  sim: Sim | null;
  /** 0..1 progress through the current beat (for sliding goods). */
  beatT: number;
  time: number;
  running: boolean;
  cursor: { x: number; y: number } | null;
  hover: { x: number; y: number } | null;
  selected: { x: number; y: number } | null;
  tool: Tool;
  glyphs: boolean;
  /** Night darkness 0..1 (chapters get later in the evening). */
  dusk: number;
  /** Cells to flash as a gentle hint (the first level's path). */
  ghost: { x: number; y: number; dir: Dir }[];
};

type Pos = { x: number; y: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; kind: 'spark' | 'note' | 'puff' | 'rise'; glyph?: string; good?: Good };
type Flyer = { good: Good; from: Pos; to: Pos; t: number; dur: number; wrong: boolean };

const NOTE_COLORS = ['#ffd36b', '#ffb36b', '#ff8f7a', '#9fd8ff', '#c6a8ff'];

export function createRenderer(reduced: boolean) {
  let layout: Layout = { cell: 40, ox: 0, oy: 0, w: 1, h: 1, width: 360, height: 560 };
  let dpr = 1;
  let staticLayer: HTMLCanvasElement | null = null, staticKey = '';
  let dark: HTMLCanvasElement | null = null;
  const prev = new Map<number, { pos: Pos; look: Good; small: boolean }>();
  const anims = new Map<number, number>();
  const pulses = new Map<number, number>();
  const particles: Particle[] = [];
  const flyers: Flyer[] = [];
  let shake = 0;

  const center = (x: number, y: number): Pos => ({ x: layout.ox + (x + 0.5) * layout.cell, y: layout.oy + (y + 0.5) * layout.cell });

  function slotPos(sim: Sim, cell: number, slot: string, index: number): { pos: Pos; small: boolean } {
    const x = cell % sim.w, y = Math.floor(cell / sim.w), c = center(x, y), s = layout.cell;
    if (slot === 'in') {
      const off = [[-0.2, -0.24], [0.2, -0.24], [0, 0.26]][index] ?? [0, 0];
      return { pos: { x: c.x + off[0] * s, y: c.y + off[1] * s }, small: true };
    }
    return { pos: c, small: false };
  }

  function resize(width: number, height: number, ratio: number, insets: { top: number; bottom: number; left?: number; right?: number }, sim: Sim | null) {
    dpr = ratio;
    const w = sim?.w ?? 8, h = sim?.h ?? 6;
    const left = insets.left ?? 0, right = insets.right ?? 0;
    const availW = width - left - right, availH = height - insets.top - insets.bottom;
    const cell = Math.max(18, Math.floor(Math.min(availW / (w + 0.7), availH / (h + 1.5), 92)));
    layout = { cell, w, h, width, height, ox: Math.round(left + (availW - cell * w) / 2), oy: Math.round(insets.top + (availH - cell * (h + 0.8)) / 2 + cell * 0.8) };
    staticKey = '';
  }

  function cellAt(px: number, py: number): Pos | null {
    const x = Math.floor((px - layout.ox) / layout.cell), y = Math.floor((py - layout.oy) / layout.cell);
    return x >= 0 && y >= 0 && x < layout.w && y < layout.h ? { x, y } : null;
  }

  /** Remember where every good is and what it looks like before the beat moves it. */
  function beforeStep(sim: Sim) {
    prev.clear();
    for (const { item, cell, slot, index } of itemsOf(sim)) {
      if (slot === 'tank') continue;
      const p = slotPos(sim, cell, slot, index);
      prev.set(item.id, { pos: p.pos, look: { ...item, seq: item.seq ? [...item.seq] : undefined }, small: p.small });
    }
  }

  function onEvents(sim: Sim, events: SimEvent[]) {
    const s = layout.cell;
    for (const e of events) {
      if (e.type === 'work') {
        const cell = e.y * sim.w + e.x;
        anims.set(cell, 1); pulses.set(cell, 1);
        if (!reduced || particles.length < 30) {
          const c = center(e.x, e.y);
          particles.push({ x: c.x + s * 0.2, y: c.y - s * 0.3, vx: s * 0.2, vy: -s * 0.9, life: 1.1, max: 1.1, color: NOTE_COLORS[(e.x + e.y * 2) % 5], size: s * 0.3, kind: 'note', glyph: (e.x + e.y) % 2 ? '♪' : '♫' });
        }
      } else if (e.type === 'route') anims.set(e.y * sim.w + e.x, 1);
      else if (e.type === 'emit') pulses.set(e.y * sim.w + e.x, 1);
      else if (e.type === 'deliver' || e.type === 'wrong' || e.type === 'bin') {
        const from = prev.get(e.item.id)?.pos ?? center(e.x, e.y);
        flyers.push({ good: { ...e.item }, from, to: center(e.x, e.y), t: 0, dur: 1, wrong: e.type === 'wrong' });
        const c = center(e.x, e.y);
        if (e.type === 'deliver') {
          pulses.set(e.y * sim.w + e.x, 1);
          for (let i = 0; i < (reduced ? 3 : 9); i++) {
            const a = (i / 9) * Math.PI * 2;
            particles.push({ x: c.x, y: c.y, vx: Math.cos(a) * s * 1.4, vy: Math.sin(a) * s * 1.4 - s * 0.6, life: 0.7, max: 0.7, color: e.item.color ? COLOR_HEX[e.item.color] : '#ffe9a8', size: s * 0.06, kind: 'spark' });
          }
        } else if (e.type === 'wrong') {
          shake = reduced ? 0 : 0.3;
          particles.push({ x: c.x, y: c.y - s * 0.4, vx: 0, vy: -s * 0.5, life: 1.2, max: 1.2, color: '#ff6b5a', size: s * 0.42, kind: 'note', glyph: '✕' });
        } else {
          for (let i = 0; i < 4; i++) particles.push({ x: c.x, y: c.y, vx: (i - 1.5) * s * 0.4, vy: -s * 0.6, life: 0.5, max: 0.5, color: '#e9dcc0', size: s * 0.08, kind: 'puff' });
        }
      } else if (e.type === 'lost') {
        const c = center(e.x, e.y);
        for (let i = 0; i < 5; i++) particles.push({ x: c.x, y: c.y, vx: (i - 2) * s * 0.4, vy: -s * 0.4, life: 0.5, max: 0.5, color: '#d8c8a8', size: s * 0.08, kind: 'puff' });
      } else if (e.type === 'jam') {
        const c = center(e.x, e.y);
        particles.push({ x: c.x, y: c.y - s * 0.35, vx: 0, vy: -s * 0.3, life: 1.4, max: 1.4, color: '#ff9b6b', size: s * 0.36, kind: 'note', glyph: '!' });
      }
    }
  }

  /** Paper lanterns drift up into the night sky from every stall (the level's reward image). */
  function celebrate(sim: Sim, grand = false) {
    const s = layout.cell;
    const spots: Pos[] = sim.stalls.map(st => center(st.x, st.y));
    for (const { item, cell } of itemsOf(sim)) if (item.kind === 'lantern' || item.kind === 'string') spots.push(center(cell % sim.w, Math.floor(cell / sim.w)));
    const n = reduced ? 6 : grand ? 70 : 22;
    const colors = ['red', 'red', 'orange', 'yellow', 'red', 'purple', 'green', 'blue'] as const;
    for (let i = 0; i < n; i++) {
      const at = spots[i % spots.length];
      particles.push({
        x: at.x + (Math.random() - 0.5) * s * (grand ? 6 : 1.5), y: at.y + (Math.random() - 0.2) * s * (grand ? 4 : 1), vx: (Math.random() - 0.5) * s * 0.3, vy: -s * (0.5 + Math.random() * 0.6),
        life: 4 + Math.random() * 3 + i * (grand ? 0.06 : 0.12), max: 7 + i * 0.12, color: '#ffcf70', size: s * (0.5 + Math.random() * 0.4), kind: 'rise',
        good: { kind: 'lantern', shape: i % 5 === 0 ? 'lotus' : 'round', color: colors[i % colors.length], stamp: i % 7 === 0 ? 'fu' : 'none', lit: true }
      });
    }
  }

  function update(dt: number) {
    for (const [k, v] of anims) { const n = v - dt * 3.2; if (n <= 0) anims.delete(k); else anims.set(k, n); }
    for (const [k, v] of pulses) { const n = v - dt * 2.2; if (n <= 0) pulses.delete(k); else pulses.set(k, n); }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 'spark') { p.vy += layout.cell * 3 * dt; p.vx *= 0.96; }
      else if (p.kind === 'rise') { p.vx = Math.sin(p.life * 1.3 + p.y * 0.01) * layout.cell * 0.25; }
    }
    for (let i = flyers.length - 1; i >= 0; i--) { flyers[i].t += dt * 3.4; if (flyers[i].t >= flyers[i].dur) flyers.splice(i, 1); }
    shake = Math.max(0, shake - dt);
  }

  // ------------------------------------------------------------------ static layer: floor, walls, pillars
  function paintStatic(sim: Sim | null) {
    const key = `${layout.width}x${layout.height}@${dpr}:${layout.cell}:${sim?.level.id ?? '-'}`;
    if (staticLayer && key === staticKey) return staticLayer;
    staticKey = key;
    staticLayer ??= document.createElement('canvas');
    staticLayer.width = Math.round(layout.width * dpr); staticLayer.height = Math.round(layout.height * dpr);
    const ctx = staticLayer.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { width, height, cell: s, ox, oy, w, h } = layout;
    // Workshop: dark timber walls all round.
    const wall = ctx.createLinearGradient(0, 0, 0, height);
    wall.addColorStop(0, '#2a1a12'); wall.addColorStop(1, '#170e09');
    ctx.fillStyle = wall; ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
    for (let x = -20; x < width; x += 46) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
    // Floor planks under the board, with seams, grain and nails (seeded so it never shimmers).
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const fx = ox - s * 0.3, fy = oy - s * 0.3, fw = w * s + s * 0.6, fh = h * s + s * 0.6;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.roundRect(fx - 6, fy - 2, fw + 12, fh + 14, 12); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.roundRect(fx, fy, fw, fh, 8); ctx.clip();
    const plank = s * 0.5;
    for (let row = 0, py = fy; py < fy + fh; row++, py += plank) {
      let px = fx - rnd() * s * 2;
      while (px < fx + fw) {
        const len = s * (1.5 + rnd() * 2.5);
        const tone = 0.85 + rnd() * 0.3;
        const r = Math.round(118 * tone), g = Math.round(80 * tone), b = Math.round(50 * tone);
        const grad = ctx.createLinearGradient(px, py, px, py + plank);
        grad.addColorStop(0, `rgb(${r + 14},${g + 10},${b + 6})`); grad.addColorStop(1, `rgb(${r - 10},${g - 8},${b - 6})`);
        ctx.fillStyle = grad; ctx.fillRect(px, py, len, plank);
        ctx.strokeStyle = `rgba(60,36,18,0.35)`; ctx.lineWidth = 1;
        for (let k = 0; k < 3; k++) { const gy = py + plank * (0.2 + rnd() * 0.6); ctx.beginPath(); ctx.moveTo(px + 2, gy); ctx.bezierCurveTo(px + len * 0.3, gy + (rnd() - 0.5) * 4, px + len * 0.6, gy + (rnd() - 0.5) * 4, px + len - 2, gy); ctx.stroke(); }
        if (rnd() < 0.15) { ctx.fillStyle = 'rgba(60,34,16,0.5)'; ctx.beginPath(); ctx.ellipse(px + len * rnd(), py + plank / 2, s * 0.08, s * 0.05, 0, 0, 7); ctx.fill(); }
        ctx.fillStyle = 'rgba(30,18,10,0.9)'; ctx.fillRect(px + len - 1, py, 2, plank);
        ctx.fillStyle = '#3d2a1a'; ctx.beginPath(); ctx.arc(px + s * 0.12, py + plank * 0.5, 1.4, 0, 7); ctx.arc(px + len - s * 0.12, py + plank * 0.5, 1.4, 0, 7); ctx.fill();
        px += len;
      }
      ctx.fillStyle = 'rgba(25,14,8,0.85)'; ctx.fillRect(fx, py + plank - 1, fw, 1.5);
    }
    // faint chalk grid so builders can count cells
    ctx.strokeStyle = 'rgba(255,240,210,0.07)'; ctx.lineWidth = 1;
    for (let x = 0; x <= w; x++) { ctx.beginPath(); ctx.moveTo(ox + x * s, oy); ctx.lineTo(ox + x * s, oy + h * s); ctx.stroke(); }
    for (let y = 0; y <= h; y++) { ctx.beginPath(); ctx.moveTo(ox, oy + y * s); ctx.lineTo(ox + w * s, oy + y * s); ctx.stroke(); }
    ctx.restore();
    // Frame
    ctx.strokeStyle = '#4b2f1a'; ctx.lineWidth = Math.max(4, s * 0.14); ctx.beginPath(); ctx.roundRect(fx, fy, fw, fh, 8); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,210,150,0.18)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(fx + 3, fy + 3, fw - 6, fh - 6, 6); ctx.stroke();
    if (sim) {
      for (let y = 0; y < sim.h; y++) for (let x = 0; x < sim.w; x++) if (sim.terrain[y * sim.w + x] === T.Pillar) drawPillar(ctx, center(x, y), s);
    }
    return staticLayer;
  }

  function drawPillar(ctx: CanvasRenderingContext2D, c: Pos, s: number) {
    ctx.fillStyle = 'rgba(10,5,2,0.5)'; ctx.beginPath(); ctx.ellipse(c.x + s * 0.08, c.y + s * 0.1, s * 0.42, s * 0.4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#6d6259'; ctx.beginPath(); ctx.roundRect(c.x - s * 0.44, c.y - s * 0.44, s * 0.88, s * 0.88, s * 0.12); ctx.fill();
    ctx.fillStyle = '#857a70'; ctx.beginPath(); ctx.roundRect(c.x - s * 0.4, c.y - s * 0.4, s * 0.8, s * 0.8, s * 0.1); ctx.fill();
    const g = ctx.createRadialGradient(c.x - s * 0.1, c.y - s * 0.1, s * 0.05, c.x, c.y, s * 0.34);
    g.addColorStop(0, '#9b6a3e'); g.addColorStop(0.7, '#6e4524'); g.addColorStop(1, '#4a2c15');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y, s * 0.32, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(40,22,10,0.55)'; ctx.lineWidth = 1;
    for (const r of [0.08, 0.16, 0.24]) { ctx.beginPath(); ctx.arc(c.x + s * 0.02, c.y + s * 0.01, s * r, 0, 7); ctx.stroke(); }
  }

  // ------------------------------------------------------------------ belts
  const feeds = (sim: Sim, fromX: number, fromY: number, toward: Dir): boolean => {
    if (fromX < 0 || fromY < 0 || fromX >= sim.w || fromY >= sim.h) return false;
    const cell = fromY * sim.w + fromX, p = sim.parts[cell];
    if (sim.terrain[cell] === T.Source) return sim.sources.some(src => src.x === fromX && src.y === fromY && src.dir === toward);
    if (!p) return false;
    if (p.kind === 'belt' || (p.kind !== 'splitter' && p.kind !== 'sorter' && p.kind !== 'bin' && p.kind !== 'bridge')) return p.dir === toward;
    if (p.kind === 'splitter') return splitterSides(p).includes(toward);
    if (p.kind === 'sorter') return p.dir === toward || sorterSide(p) === toward;
    if (p.kind === 'bridge') return true;
    return false;
  };

  function drawBelt(ctx: CanvasRenderingContext2D, sim: Sim, x: number, y: number, dir: Dir, phase: number, ghost = false) {
    const s = layout.cell, c = center(x, y);
    const back = ((dir + 2) % 4) as Dir;
    const straightIn = feeds(sim, x + DX[back], y + DY[back], dir);
    const sideIns = ([((dir + 1) % 4), ((dir + 3) % 4)] as Dir[]).filter(side => feeds(sim, x + DX[side], y + DY[side], ((side + 2) % 4) as Dir));
    const bw = s * 0.62;
    ctx.save();
    if (ghost) ctx.globalAlpha = 0.4;
    if (!straightIn && sideIns.length === 1) {
      // A corner: a quarter ring around the cell corner shared by the entry side and the exit side.
      const entry = sideIns[0];
      const cx = c.x + (DX[entry] + DX[dir]) * s * 0.5, cy = c.y + (DY[entry] + DY[dir]) * s * 0.5;
      const a0 = Math.atan2(c.y + DY[entry] * s * 0.5 - cy, c.x + DX[entry] * s * 0.5 - cx);
      const a1 = Math.atan2(c.y + DY[dir] * s * 0.5 - cy, c.x + DX[dir] * s * 0.5 - cx);
      let sweep = a1 - a0; while (sweep > Math.PI) sweep -= 2 * Math.PI; while (sweep < -Math.PI) sweep += 2 * Math.PI;
      const r0 = s * 0.5 - bw / 2, r1 = s * 0.5 + bw / 2;
      ctx.beginPath(); ctx.arc(cx, cy, r1 + s * 0.04, a0, a0 + sweep, sweep < 0); ctx.arc(cx, cy, Math.max(0, r0 - s * 0.04), a0 + sweep, a0, sweep > 0); ctx.closePath();
      ctx.fillStyle = '#b8873c'; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, r1, a0, a0 + sweep, sweep < 0); ctx.arc(cx, cy, r0, a0 + sweep, a0, sweep > 0); ctx.closePath();
      ctx.fillStyle = '#2f2622'; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.strokeStyle = '#4c3f36'; ctx.lineWidth = s * 0.06;
      const n = 4, off = (phase % 1);
      for (let i = -1; i < n; i++) {
        const k = (i + off) / n, a = a0 + sweep * k;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.stroke();
      }
      ctx.restore();
    } else {
      ctx.translate(c.x, c.y); ctx.rotate(dir * Math.PI / 2);
      const x0 = straightIn ? -s * 0.5 : -s * 0.42;
      ctx.fillStyle = '#b8873c'; ctx.fillRect(x0, -bw / 2 - s * 0.04, s * 0.5 - x0, bw + s * 0.08);
      ctx.fillStyle = '#2f2622'; ctx.fillRect(x0, -bw / 2, s * 0.5 - x0, bw);
      ctx.save(); ctx.beginPath(); ctx.rect(x0, -bw / 2, s * 0.5 - x0, bw); ctx.clip();
      ctx.strokeStyle = '#4c3f36'; ctx.lineWidth = s * 0.06;
      const gap = s / 4, off = (phase % 1) * s;
      for (let k = -s; k < s; k += gap) { const px = k + (off % gap); ctx.beginPath(); ctx.moveTo(px, -bw / 2); ctx.lineTo(px, bw / 2); ctx.stroke(); }
      ctx.restore();
      if (!straightIn) { ctx.fillStyle = '#8a6128'; ctx.fillRect(x0 - s * 0.03, -bw / 2 - s * 0.04, s * 0.06, bw + s * 0.08); }
      // direction chevron
      ctx.fillStyle = 'rgba(255,214,140,0.28)';
      ctx.beginPath(); ctx.moveTo(s * 0.16, 0); ctx.lineTo(-s * 0.04, -s * 0.14); ctx.lineTo(-s * 0.04, s * 0.14); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ sources and stalls
  function drawSource(ctx: CanvasRenderingContext2D, sim: Sim, i: number, time: number) {
    const src = sim.sources[i], s = layout.cell, c = center(src.x, src.y);
    const pulse = pulses.get(src.y * sim.w + src.x) ?? 0;
    ctx.save(); ctx.translate(c.x, c.y);
    ctx.fillStyle = 'rgba(10,5,2,0.5)'; ctx.fillRect(-s * 0.42 + s * 0.06, -s * 0.42 + s * 0.08, s * 0.84, s * 0.84);
    ctx.fillStyle = '#5b3a1f'; ctx.beginPath(); ctx.roundRect(-s * 0.44, -s * 0.44, s * 0.88, s * 0.88, s * 0.08); ctx.fill();
    ctx.strokeStyle = '#8b6234'; ctx.lineWidth = s * 0.05;
    ctx.beginPath(); ctx.moveTo(-s * 0.4, -s * 0.4); ctx.lineTo(s * 0.4, s * 0.4); ctx.moveTo(s * 0.4, -s * 0.4); ctx.lineTo(-s * 0.4, s * 0.4); ctx.stroke();
    ctx.fillStyle = '#2a1a0e'; ctx.beginPath(); ctx.arc(0, 0, s * 0.3 + pulse * s * 0.04, 0, 7); ctx.fill();
    ctx.restore();
    const next = src.goods[src.k % src.goods.length];
    drawGood(ctx, goodOf(next), c.x, c.y - pulse * s * 0.05, s * 0.75, time);
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(src.dir * Math.PI / 2);
    ctx.fillStyle = '#ffd98a'; ctx.beginPath(); ctx.moveTo(s * 0.5, 0); ctx.lineTo(s * 0.36, -s * 0.12); ctx.lineTo(s * 0.36, s * 0.12); ctx.closePath(); ctx.fill();
    ctx.restore();
    // The chute's rhythm: one pip per beat of its cycle, the lit one is now.
    if (src.every > 1) {
      const offset = src.offset ?? 1, phase = sim.beat >= offset ? (sim.beat - offset) % src.every : -1;
      for (let k = 0; k < src.every; k++) {
        ctx.fillStyle = k === phase && sim.status !== 'build' ? '#ffd36b' : 'rgba(255,220,160,0.35)';
        ctx.beginPath(); ctx.arc(c.x + (k - (src.every - 1) / 2) * s * 0.14, c.y - s * 0.36, s * 0.045, 0, 7); ctx.fill();
      }
    }
    if (src.goods.length > 1) {
      // A chute that alternates goods shows what comes after the next one.
      const after = src.goods[(src.k + 1) % src.goods.length];
      drawGood(ctx, goodOf(after), c.x + s * 0.3, c.y + s * 0.3, s * 0.36, time);
    }
  }

  const goodCache = new Map<string, Good>();
  function goodOf(code: string): Good {
    let g = goodCache.get(code);
    if (!g) {
      const [kind, ...rest] = code.split(' ');
      g = { kind: kind as Good['kind'] };
      for (const t of rest) {
        if (['round', 'square', 'lotus'].includes(t)) g.shape = t as Good['shape'];
        else if (t in COLOR_HEX) g.color = t as Good['color'];
        else if (['fu', 'fish', 'cloud'].includes(t)) g.stamp = t as Good['stamp'];
        else if (t === 'lit') g.lit = true;
      }
      if (g.kind === 'dye') g.color ??= 'red';
      if (g.kind === 'string') g.seq = rest as Good['seq'];
      goodCache.set(code, g);
    }
    return g;
  }

  function drawStall(ctx: CanvasRenderingContext2D, sim: Sim, i: number, time: number) {
    const st = sim.stalls[i], s = layout.cell, c = center(st.x, st.y);
    const pulse = pulses.get(st.y * sim.w + st.x) ?? 0;
    ctx.save(); ctx.translate(c.x, c.y);
    ctx.fillStyle = 'rgba(10,5,2,0.5)'; ctx.fillRect(-s * 0.44 + s * 0.06, -s * 0.44 + s * 0.1, s * 0.88, s * 0.88);
    ctx.fillStyle = '#7b4b26'; ctx.beginPath(); ctx.roundRect(-s * 0.46, -s * 0.46, s * 0.92, s * 0.92, s * 0.1); ctx.fill();
    ctx.fillStyle = '#a46b38'; ctx.fillRect(-s * 0.42, -s * 0.1, s * 0.84, s * 0.5);
    // striped awning
    for (let k = 0; k < 6; k++) { ctx.fillStyle = k % 2 ? '#f3e3c3' : '#c7271b'; ctx.fillRect(-s * 0.46 + k * s * 0.153, -s * 0.46, s * 0.155, s * 0.32); }
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-s * 0.46, -s * 0.14, s * 0.92, s * 0.04);
    ctx.restore();
    // the stall's lantern sign
    drawGood(ctx, { kind: 'lantern', shape: 'round', color: 'red', stamp: 'none', lit: true }, c.x, c.y + s * 0.12 + Math.sin(time * 2) * s * 0.02, s * (0.55 + pulse * 0.12), time);
    if (sim.stalls.length > 1) {
      ctx.fillStyle = '#ffe9b8'; ctx.font = `800 ${Math.round(s * 0.24)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String.fromCharCode(65 + i), c.x + s * 0.32, c.y + s * 0.32);
    }
  }

  // ------------------------------------------------------------------ draw
  function draw(ctx: CanvasRenderingContext2D, view: ViewState) {
    const { sim, time } = view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sx = shake > 0 ? Math.sin(time * 80) * shake * 6 : 0;
    ctx.save(); ctx.translate(sx, 0);
    ctx.drawImage(paintStatic(sim), 0, 0, layout.width, layout.height);
    if (!sim) { ctx.restore(); return; }
    const s = layout.cell;
    const t = view.running ? easeBeat(view.beatT) : 1;
    const phase = reduced ? 0 : view.running ? sim.beat + view.beatT : 0;

    // ghosts (hint path)
    for (const g of view.ghost) if (!sim.parts[g.y * sim.w + g.x]) drawBelt(ctx, sim, g.x, g.y, g.dir, time * 0.6, true);
    // belts first, then sources, stalls and machines
    sim.parts.forEach(p => { if (p?.kind === 'belt') drawBelt(ctx, sim, p.x, p.y, p.dir, phase); });
    sim.sources.forEach((_, i) => drawSource(ctx, sim, i, time));
    sim.stalls.forEach((_, i) => drawStall(ctx, sim, i, time));
    sim.parts.forEach((p, cell) => {
      if (!p || p.kind === 'belt') return;
      const slots = sim.slots[cell];
      const anim: PartAnim = { work: anims.get(cell) ?? 0, toggle: slots.toggle, tank: slots.tank?.color ?? null, ins: slots.ins.map(Boolean), ready: p.kind === 'gate' ? Math.min(1, slots.t / Number(p.dial ?? 2)) : 1 };
      const c = center(p.x, p.y);
      drawPart(ctx, p, c.x, c.y, s, anim, time);
    });

    // goods
    const items = itemsOf(sim);
    for (const { item, cell, slot, index } of items) {
      if (slot === 'tank') continue;
      const now = slotPos(sim, cell, slot, index);
      const was = prev.get(item.id);
      const from = was?.pos ?? sourceOrigin(sim, item) ?? now.pos;
      let x = from.x + (now.pos.x - from.x) * t, y = from.y + (now.pos.y - from.y) * t;
      const look = was && t < 0.5 ? was.look : item;
      const small = (was?.small ?? now.small) && (t < 0.5 ? (was?.small ?? now.small) : now.small);
      if (item.still >= 4 && !reduced) { x += Math.sin(time * 30 + item.id) * s * 0.025; }
      drawGood(ctx, look, x, y, small ? s * 0.58 : s, reduced ? 0 : time, view.glyphs);
    }
    // goods flying into stalls / bins
    for (const f of flyers) {
      const k = Math.min(1, f.t / f.dur), e = k * k;
      const x = f.from.x + (f.to.x - f.from.x) * Math.min(1, k * 1.6), y = f.from.y + (f.to.y - f.from.y) * Math.min(1, k * 1.6) - Math.sin(k * Math.PI) * s * 0.3;
      ctx.save(); ctx.globalAlpha = 1 - e;
      drawGood(ctx, f.good, x, y, s * (1 - e * 0.6), time);
      if (f.wrong) { ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - s * 0.2, y - s * 0.2); ctx.lineTo(x + s * 0.2, y + s * 0.2); ctx.moveTo(x + s * 0.2, y - s * 0.2); ctx.lineTo(x - s * 0.2, y + s * 0.2); ctx.stroke(); }
      ctx.restore();
    }

    // Inspector Mittens
    drawCatLayer(ctx, sim, view);
    const garland = drawGarland(ctx, sim, time);

    // dusk and lamplight
    drawLight(ctx, sim, view, items, garland);

    // particles above the light
    for (const p of particles) {
      const a = Math.min(1, p.life / p.max * 1.5);
      if (p.kind === 'rise' && p.good) {
        ctx.save(); ctx.globalAlpha = Math.min(1, p.life / 1.2);
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 1.4); g.addColorStop(0, 'rgba(255,190,90,0.5)'); g.addColorStop(1, 'rgba(255,140,40,0)');
        ctx.fillStyle = g; ctx.fillRect(p.x - p.size * 1.4, p.y - p.size * 1.4, p.size * 2.8, p.size * 2.8);
        ctx.restore();
        ctx.save(); ctx.globalAlpha = Math.min(1, p.life / 1.2);
        drawGood(ctx, p.good, p.x, p.y, p.size * 1.6, time + p.x);
        ctx.restore();
        continue;
      }
      ctx.globalAlpha = a;
      if (p.kind === 'note') { ctx.fillStyle = p.color; ctx.font = `800 ${Math.round(p.size)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.glyph ?? '♪', p.x, p.y); }
      else { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (p.kind === 'puff' ? 1 + (1 - a) : 1), 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
    }

    // cursor / hover / selection
    const mark = (pos: Pos | null, color: string, dash: number[]) => {
      if (!pos) return;
      const c = center(pos.x, pos.y);
      ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.setLineDash(dash);
      ctx.beginPath(); ctx.roundRect(c.x - s * 0.47, c.y - s * 0.47, s * 0.94, s * 0.94, s * 0.14); ctx.stroke(); ctx.setLineDash([]);
    };
    mark(view.hover, 'rgba(255,230,170,0.45)', []);
    mark(view.cursor, '#ffd36b', [5, 4]);
    mark(view.selected, '#fff2c4', []);
    ctx.restore();
  }

  /**
   * A string of paper lanterns across the top of the workshop. They light up one by one as the order fills (in
   * Night Shift, with each order served), so the room gets brighter the closer the job is to done.
   */
  function drawGarland(ctx: CanvasRenderingContext2D, sim: Sim, time: number): Pos[] {
    const s = layout.cell, n = Math.max(3, Math.round(sim.w * 0.8));
    const x0 = layout.ox - s * 0.25, x1 = layout.ox + sim.w * s + s * 0.25, y0 = layout.oy - s * 0.9;
    let want = 0, got = 0;
    for (const st of sim.stalls) for (const w of st.wants) { want += w.n; got += Math.min(w.got, w.n); }
    const lit = sim.level.endless ? Math.min(n, sim.served % (n + 1)) : want ? Math.round(n * got / want) : 0;
    ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = Math.max(1.5, s * 0.03);
    ctx.beginPath(); ctx.moveTo(x0, y0);
    const sag = (k: number) => y0 + Math.sin(k * Math.PI) * s * 0.18;
    for (let i = 1; i <= 20; i++) ctx.lineTo(x0 + (x1 - x0) * i / 20, sag(i / 20));
    ctx.stroke();
    const glow: Pos[] = [];
    const colors = ['red', 'red', 'orange', 'red', 'yellow'] as const;
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n, x = x0 + (x1 - x0) * k, y = sag(k) + s * 0.2;
      const on = i < lit;
      ctx.save(); ctx.translate(x, y - s * 0.2); ctx.rotate(reduced ? 0 : Math.sin(time * 1.3 + i) * 0.06);
      ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, s * 0.1); ctx.stroke();
      ctx.globalAlpha = on ? 1 : 0.8;
      drawGood(ctx, { kind: 'lantern', shape: i % 4 === 3 ? 'lotus' : 'round', color: on ? colors[i % colors.length] : 'muddy', stamp: 'none', lit: on }, 0, s * 0.3, s * 0.62, time + i);
      ctx.restore();
      if (on) glow.push({ x, y });
    }
    return glow;
  }

  function sourceOrigin(sim: Sim, item: Item): Pos | null {
    // A good that has just come out of a chute slides out of it.
    for (const src of sim.sources) {
      const tx = src.x + DX[src.dir], ty = src.y + DY[src.dir];
      const cell = ty * sim.w + tx;
      if (tx >= 0 && ty >= 0 && tx < sim.w && ty < sim.h && sim.slots[cell].out?.id === item.id) return center(src.x, src.y);
      if (tx >= 0 && ty >= 0 && tx < sim.w && ty < sim.h && sim.slots[cell].ins.some(i => i?.id === item.id)) return center(src.x, src.y);
    }
    return null;
  }

  function catState(sim: Sim, beatF: number): { pos: Pos; sit: number; facing: number } | null {
    const cat = sim.level.cat;
    if (!cat || !cat.stops.length) return null;
    const phase = ((beatF % cat.period) + cat.period) % cat.period;
    const stops = [...cat.stops].sort((a, b) => a.at - b.at);
    for (let i = 0; i < stops.length; i++) {
      const st = stops[i];
      if (phase >= st.at && phase < st.at + st.for) return { pos: center(st.x, st.y), sit: Math.min(1, (phase - st.at) / 1.5, (st.at + st.for - phase) / 1.5), facing: Math.PI / 2 };
    }
    // walking between stops
    let from = stops[stops.length - 1], to = stops[0], fromEnd = from.at + from.for - cat.period, toAt = to.at;
    for (let i = 0; i < stops.length; i++) {
      const a = stops[i], b = stops[(i + 1) % stops.length];
      const aEnd = a.at + a.for, bAt = b.at + (i + 1 >= stops.length ? cat.period : 0);
      if (phase >= aEnd && phase < bAt) { from = a; to = b; fromEnd = aEnd; toAt = bAt; break; }
    }
    let ph = phase; if (ph < fromEnd) ph += cat.period;
    const k = Math.max(0, Math.min(1, (ph - fromEnd) / Math.max(1, toAt - fromEnd)));
    const p0 = center(from.x, from.y), p1 = center(to.x, to.y);
    // stroll out along the bottom edge of the board in between
    const lift = Math.sin(k * Math.PI) * layout.cell * 1.2;
    return { pos: { x: p0.x + (p1.x - p0.x) * k, y: p0.y + (p1.y - p0.y) * k + lift }, sit: 0, facing: Math.atan2(p1.y - p0.y, p1.x - p0.x || 0.001) };
  }

  function drawCatLayer(ctx: CanvasRenderingContext2D, sim: Sim, view: ViewState) {
    const cat = sim.level.cat;
    if (!cat) return;
    const s = layout.cell, beatF = sim.beat + (view.running ? view.beatT : 0);
    const phase = ((beatF % cat.period) + cat.period) % cat.period;
    // paw prints warn where she will sit next, growing darker as she gets close
    for (const st of cat.stops) {
      let until = st.at - phase; if (until < 0) until += cat.period;
      const sitting = phase >= st.at && phase < st.at + st.for;
      if (sitting || until > 14) continue;
      const c = center(st.x, st.y), a = 0.25 + 0.55 * (1 - until / 14);
      drawPaw(ctx, c.x - s * 0.15, c.y + s * 0.1, s * 0.8, a);
      drawPaw(ctx, c.x + s * 0.15, c.y - s * 0.12, s * 0.8, a);
    }
    const st = catState(sim, beatF);
    if (st) drawCat(ctx, st.pos.x, st.pos.y, s * 1.45, st.facing, st.sit, view.time);
  }

  function drawLight(ctx: CanvasRenderingContext2D, sim: Sim, view: ViewState, items: ReturnType<typeof itemsOf>, garland: Pos[]) {
    const dusk = view.dusk;
    if (dusk <= 0.01) return;
    const W = Math.ceil(layout.width / 2), H = Math.ceil(layout.height / 2);
    dark ??= document.createElement('canvas');
    if (dark.width !== W || dark.height !== H) { dark.width = W; dark.height = H; }
    const d = dark.getContext('2d')!;
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, W, H);
    d.fillStyle = `rgba(14,12,38,${0.32 + dusk * 0.48})`; d.fillRect(0, 0, W, H);
    d.globalCompositeOperation = 'destination-out';
    const s = layout.cell;
    const lights: { x: number; y: number; r: number; a: number }[] = [];
    for (const { item, cell, slot } of items) {
      if (slot === 'tank') continue;
      if ((item.kind === 'lantern' && item.lit) || item.kind === 'string') { const c = center(cell % sim.w, Math.floor(cell / sim.w)); lights.push({ x: c.x, y: c.y, r: s * 2, a: 0.95 }); }
    }
    for (const st of sim.stalls) { const c = center(st.x, st.y); lights.push({ x: c.x, y: c.y, r: s * (1.3 + (pulses.get(st.y * sim.w + st.x) ?? 0) * 0.6), a: 0.85 }); }
    for (const [cell, v] of pulses) { if (sim.parts[cell]) { const c = center(cell % sim.w, Math.floor(cell / sim.w)); lights.push({ x: c.x, y: c.y, r: s * (0.8 + v * 0.6), a: 0.6 * v }); } }
    sim.parts.forEach(p => { if (p?.kind === 'wick') { const c = center(p.x, p.y); lights.push({ x: c.x, y: c.y, r: s * 1.1, a: 0.6 }); } });
    for (const g of garland) lights.push({ x: g.x, y: g.y + s * 0.4, r: s * 1.6, a: 0.8 });
    for (const p of particles) if (p.kind === 'rise') lights.push({ x: p.x, y: p.y, r: p.size * 2.2, a: Math.min(1, p.life / 1.2) * 0.7 });
    for (const l of lights) {
      const x = l.x / 2, y = l.y / 2, r = l.r / 2;
      const g = d.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(0,0,0,${l.a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = g; d.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.drawImage(dark, 0, 0, layout.width, layout.height);
    // warm glow on top
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r * 0.8);
      g.addColorStop(0, `rgba(255,170,70,${0.22 * l.a})`); g.addColorStop(1, 'rgba(255,120,30,0)');
      ctx.fillStyle = g; ctx.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    ctx.restore();
  }

  return {
    get layout() { return layout; },
    resize, cellAt, center, beforeStep, onEvents, celebrate, update, draw,
    reset() { prev.clear(); anims.clear(); pulses.clear(); particles.length = 0; flyers.length = 0; },
    goodOf, codeOf
  };
}

const easeBeat = (t: number) => { const k = Math.max(0, Math.min(1, t)); return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; };
export type Renderer = ReturnType<typeof createRenderer>;
