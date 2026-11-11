import type { BoardLayout } from './layout';
import { CAKE_CELLS, ENTRY_CELLS } from './layout';

/**
 * Static scenery (painted once per layout into an offscreen canvas) and the cake. One painter per backdrop id
 * (`countertop`, `sink`, `stove`, `pantry`, `fridge`); an unknown id falls back to the countertop.
 *
 * Every chapter is built from the same layers so they read as one game: a night wall, a slab, the lane surface
 * (painted in "board space", so wood grain and brushed steel run along the lanes on both the wide and the tall
 * board), soft cell insets for readability, the cake's corner, the dark entry the pests come from, a foreground
 * lip and baked moonlight. Upright props (jars, knobs, drains, lanterns) are painted in screen space so they never
 * lie on their side on a phone.
 */
export type BoardInfo = {
  activeLanes: number[]; blocked: [number, number][];
  /** Static terrain baked into the backdrop (read once from the sim's cells). */
  hobs?: [number, number][]; frost?: [number, number][]; lamps?: [number, number][]; dark?: boolean;
};
type Ctx = CanvasRenderingContext2D;
type Painter = (ctx: Ctx, layout: BoardLayout, info: BoardInfo) => void;
const INK = '#2a1810';

/** Deterministic noise so grain and speckles do not shimmer between repaints. */
function noise(seed: number): () => number { let a = seed >>> 0; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }

/**
 * Board space: u runs along the lanes in pixels (0 = column 0, toward the pests), v across them (0 = lane 0 edge).
 * On the tall board this is a quarter turn, so a painter written once works for both orientations.
 */
function boardSpace(ctx: Ctx, L: BoardLayout, fn: () => void): void {
  ctx.save();
  if (L.vertical) ctx.transform(0, -1, 1, 0, L.board.x, L.board.y + L.cols * L.along);
  else ctx.translate(L.board.x, L.board.y);
  fn();
  ctx.restore();
}
/** Field extent in board space. */
const span = (L: BoardLayout) => ({ u0: -CAKE_CELLS * L.along, u1: (L.cols + ENTRY_CELLS) * L.along, v1: L.lanes * L.across });

type Theme = {
  wall: [string, string]; tile: string; tileSize: number;
  slab: string; slabEdge: string; laneA: string; laneB: string; seam: string;
  cellLight: string; cellDark: string; cellLine: string;
  entryShade: string; moon: string;
  surface?: (ctx: Ctx, L: BoardLayout, rand: () => number) => void;
  wallProps?: (ctx: Ctx, L: BoardLayout, rand: () => number) => void;
  entry?: (ctx: Ctx, L: BoardLayout, rand: () => number) => void;
  cakeCorner?: (ctx: Ctx, L: BoardLayout) => void;
  blocked?: (ctx: Ctx, x: number, y: number, s: number) => void;
  inactive?: string;
};

// ---------------------------------------------------------------- shared layers

function wall(ctx: Ctx, L: BoardLayout, t: Theme): void {
  const g = ctx.createLinearGradient(0, 0, 0, L.h);
  g.addColorStop(0, t.wall[0]); g.addColorStop(1, t.wall[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, L.w, L.h);
  ctx.strokeStyle = t.tile; ctx.lineWidth = 2;
  const tile = Math.max(28, L.unit * t.tileSize);
  ctx.beginPath();
  for (let y = tile * 0.5, row = 0; y < L.h; y += tile * 0.6, row++) {
    ctx.moveTo(0, y); ctx.lineTo(L.w, y);
    for (let x = (row % 2) * tile * 0.5; x < L.w; x += tile) { ctx.moveTo(x, y); ctx.lineTo(x, y + tile * 0.6); }
  }
  ctx.stroke();
  // moonlight from the upper right, and a soft vignette
  const moon = ctx.createRadialGradient(L.w * 0.85, -L.h * 0.12, 10, L.w * 0.85, -L.h * 0.12, Math.max(L.w, L.h) * 0.95);
  moon.addColorStop(0, t.moon); moon.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = moon; ctx.fillRect(0, 0, L.w, L.h);
}

/** A window with the moon, if the wall shows above the field. */
function moonWindow(ctx: Ctx, x: number, y: number, w: number, h: number, frame = '#3a2a24'): void {
  if (w < 30 || h < 24) return;
  ctx.save();
  ctx.fillStyle = frame; ctx.beginPath(); ctx.roundRect(x - 5, y - 5, w + 10, h + 10, 8); ctx.fill();
  const sky = ctx.createLinearGradient(0, y, 0, y + h); sky.addColorStop(0, '#1a2a6a'); sky.addColorStop(1, '#3a4f9a');
  ctx.fillStyle = sky; ctx.beginPath(); ctx.roundRect(x, y, w, h, 5); ctx.fill();
  ctx.save(); ctx.clip();
  const r = Math.min(w, h) * 0.22, mx = x + w * 0.7, my = y + h * 0.4;
  const halo = ctx.createRadialGradient(mx, my, r * 0.5, mx, my, r * 3); halo.addColorStop(0, 'rgba(255,248,214,0.45)'); halo.addColorStop(1, 'rgba(255,248,214,0)');
  ctx.fillStyle = halo; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#fff6d6'; ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(200,190,150,0.5)'; ctx.beginPath(); ctx.arc(mx - r * 0.3, my + r * 0.1, r * 0.2, 0, Math.PI * 2); ctx.arc(mx + r * 0.25, my - r * 0.3, r * 0.13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  const rand = noise(5);
  for (let i = 0; i < 9; i++) { ctx.globalAlpha = 0.4 + rand() * 0.6; ctx.fillRect(x + rand() * w, y + rand() * h * 0.8, 1.6, 1.6); }
  ctx.globalAlpha = 1;
  ctx.restore();
  ctx.strokeStyle = frame; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); ctx.stroke();
  ctx.restore();
}

function slab(ctx: Ctx, L: BoardLayout, t: Theme): number {
  const { field } = L, pad = Math.min(L.along, L.across) * 0.16;
  ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.beginPath(); ctx.roundRect(field.x - pad, field.y - pad + 10, field.w + pad * 2, field.h + pad * 2 + 6, 18); ctx.fill();
  ctx.fillStyle = t.slabEdge; ctx.beginPath(); ctx.roundRect(field.x - pad, field.y - pad + 4, field.w + pad * 2, field.h + pad * 2 + 4, 18); ctx.fill();
  ctx.fillStyle = t.slab; ctx.beginPath(); ctx.roundRect(field.x - pad, field.y - pad, field.w + pad * 2, field.h + pad * 2 + 2, 18); ctx.fill();
  return pad;
}

function lanes(ctx: Ctx, L: BoardLayout, t: Theme, rand: () => number): void {
  const { u0, u1, v1 } = span(L);
  boardSpace(ctx, L, () => {
    for (let lane = 0; lane < L.lanes; lane++) { ctx.fillStyle = lane % 2 ? t.laneB : t.laneA; ctx.fillRect(u0, lane * L.across, u1 - u0, L.across); }
    t.surface?.(ctx, L, rand);
    ctx.strokeStyle = t.seam; ctx.lineWidth = 2;
    ctx.beginPath(); for (let lane = 1; lane < L.lanes; lane++) { ctx.moveTo(u0, lane * L.across); ctx.lineTo(u1, lane * L.across); } ctx.stroke();
    // cells: a soft checker plus a rounded inset so every square reads as a place to stand
    const r = Math.min(L.along, L.across) * 0.14;
    for (let lane = 0; lane < L.lanes; lane++) for (let col = 0; col < L.cols; col++) {
      const x = col * L.along, y = lane * L.across;
      ctx.fillStyle = (col + lane) % 2 ? t.cellLight : t.cellDark;
      ctx.beginPath(); ctx.roundRect(x + 3, y + 3, L.along - 6, L.across - 6, r); ctx.fill();
      ctx.strokeStyle = t.cellLine; ctx.lineWidth = 1.5; ctx.stroke();
    }
    // a soft light falling across the near half, dark toward the entry
    const shade = ctx.createLinearGradient(u0, 0, u1, 0);
    shade.addColorStop(0, 'rgba(255,230,190,0.08)'); shade.addColorStop(0.55, 'rgba(0,0,0,0)'); shade.addColorStop(0.86, t.entryShade); shade.addColorStop(1, t.entryShade);
    ctx.fillStyle = shade; ctx.fillRect(u0, 0, u1 - u0, v1);
  });
}

function inactiveLanes(ctx: Ctx, L: BoardLayout, info: BoardInfo, t: Theme): void {
  boardSpace(ctx, L, () => {
    for (let lane = 0; lane < L.lanes; lane++) {
      if (info.activeLanes.includes(lane)) continue;
      const y = lane * L.across, x0 = -0.05 * L.along, w = (L.cols + 1.2) * L.along;
      ctx.fillStyle = t.inactive ?? '#39456e'; ctx.beginPath(); ctx.roundRect(x0 + 3, y + 3, w - 6, L.across - 6, 10); ctx.fill();
      ctx.save(); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = Math.max(3, L.across * 0.07);
      const step = L.across * 0.36;
      ctx.beginPath();
      for (let x = x0; x < x0 + w; x += step) { ctx.moveTo(x, y); ctx.lineTo(x, y + L.across); }
      for (let yy = y; yy < y + L.across; yy += step) { ctx.moveTo(x0, yy); ctx.lineTo(x0 + w, yy); }
      ctx.stroke(); ctx.restore();
      ctx.strokeStyle = 'rgba(15,20,48,0.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(x0 + 3, y + 3, w - 6, L.across - 6, 10); ctx.stroke();
    }
  });
}

function blockedCells(ctx: Ctx, L: BoardLayout, info: BoardInfo, t: Theme): void {
  for (const [col, lane] of info.blocked) {
    const c = L.cellRect(col, lane), s = L.unit * 0.3;
    (t.blocked ?? sugarBowl)(ctx, c.x + c.w / 2, c.y + c.h / 2, s);
  }
}
function sugarBowl(ctx: Ctx, cx: number, cy: number, s: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.8, s * 1.1, s * 0.35, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8edf7'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.2, s, s * 0.75, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(cx, cy - s * 0.1, s * 0.8, s * 0.35, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#4f7fd0'; ctx.fillRect(cx - s * 0.7, cy + s * 0.25, s * 1.4, s * 0.12);
}

/** Static terrain: hob rings, frosted cells, fixed lanterns. Dynamic states (lit, wet, grease) are drawn per frame. */
function terrain(ctx: Ctx, L: BoardLayout, info: BoardInfo): void {
  for (const [col, lane] of info.hobs ?? []) {
    const p = L.point(col + 0.5, lane), r = Math.min(L.along, L.across) * 0.38;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(p.x, p.y + 2, r * 1.05, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2b2a30'; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#4a4850'; ctx.lineWidth = 2;
    for (const k of [0.75, 0.5, 0.25]) { ctx.beginPath(); ctx.arc(p.x, p.y, r * k, 0, Math.PI * 2); ctx.stroke(); }
    ctx.strokeStyle = '#17161a'; ctx.lineWidth = Math.max(3, r * 0.12); ctx.beginPath();
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; ctx.moveTo(p.x + Math.cos(a) * r * 0.2, p.y + Math.sin(a) * r * 0.2); ctx.lineTo(p.x + Math.cos(a) * r * 1.05, p.y + Math.sin(a) * r * 1.05); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, r, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
  }
  for (const [col, lane] of info.frost ?? []) {
    const c = L.cellRect(col, lane), rand = noise(col * 31 + lane * 7 + 1);
    ctx.fillStyle = 'rgba(235,248,255,0.32)'; ctx.beginPath(); ctx.roundRect(c.x + 4, c.y + 4, c.w - 8, c.h - 8, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const x = c.x + c.w * (0.2 + rand() * 0.6), y = c.y + c.h * (0.2 + rand() * 0.6), r = Math.min(c.w, c.h) * (0.08 + rand() * 0.08);
      ctx.beginPath(); for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3; ctx.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.stroke();
    }
  }
  for (const [col, lane] of info.lamps ?? []) {
    const c = L.cellRect(col, lane), s = L.unit * 0.16, x = c.x + c.w * 0.82, y = c.y + c.h * 0.3;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y + s * 1.6, s * 0.9, s * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a2a24'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x - s * 0.7, y - s * 0.2, s * 1.4, s * 1.6, s * 0.3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.roundRect(x - s * 0.45, y + s * 0.05, s * 0.9, s * 1.05, s * 0.2); ctx.fill();
    ctx.fillStyle = '#3a2a24'; ctx.beginPath(); ctx.arc(x, y - s * 0.35, s * 0.35, Math.PI, 0); ctx.fill(); ctx.stroke();
  }
}

function lip(ctx: Ctx, L: BoardLayout, pad: number, t: Theme): void {
  const { field } = L;
  ctx.strokeStyle = 'rgba(255,230,190,0.2)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(field.x - pad, field.y - pad, field.w + pad * 2, field.h + pad * 2 + 2, 18); ctx.stroke();
  // foreground edge: the near lip catches the light
  ctx.fillStyle = t.slabEdge; ctx.fillRect(field.x - pad + 10, field.y + field.h + pad - 2, field.w + pad * 2 - 20, 4);
  ctx.fillStyle = 'rgba(255,230,190,0.22)'; ctx.fillRect(field.x - pad + 10, field.y + field.h + pad - 3, field.w + pad * 2 - 20, 1.5);
}

/** The strip pests walk in from: a rect in screen space plus whether it runs vertically (wide board). */
function entryRect(L: BoardLayout) {
  const r0 = L.laneRect(0, L.cols, L.cols + ENTRY_CELLS), r1 = L.laneRect(L.lanes - 1, L.cols, L.cols + ENTRY_CELLS);
  const x = Math.min(r0.x, r1.x), y = Math.min(r0.y, r1.y);
  return { x, y, w: Math.max(r0.x + r0.w, r1.x + r1.w) - x, h: Math.max(r0.y + r0.h, r1.y + r1.h) - y, alongX: L.vertical };
}
/** Evenly spaced points along the entry strip. */
function entryPoints(L: BoardLayout, n: number): { x: number; y: number }[] {
  const e = entryRect(L), out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) { const k = (i + 0.5) / n; out.push(e.alongX ? { x: e.x + e.w * k, y: e.y + e.h * 0.5 } : { x: e.x + e.w * 0.5, y: e.y + e.h * k }); }
  return out;
}
/** Visible wall above the field, for window and rail props. */
const wallBand = (L: BoardLayout) => ({ x: L.field.x, y: 0, w: L.field.w, h: Math.max(0, L.field.y - Math.min(L.along, L.across) * 0.2) });

function paint(t: Theme, seed: number): Painter {
  return (ctx, L, info) => {
    const rand = noise(seed);
    wall(ctx, L, t);
    t.wallProps?.(ctx, L, rand);
    const pad = slab(ctx, L, t);
    ctx.save();
    ctx.beginPath(); ctx.roundRect(L.field.x - pad * 0.4, L.field.y - pad * 0.4, L.field.w + pad * 0.8, L.field.h + pad * 0.8, 12); ctx.clip();
    ctx.fillStyle = t.laneA; ctx.fillRect(L.field.x - pad, L.field.y - pad, L.field.w + pad * 2, L.field.h + pad * 2);
    lanes(ctx, L, t, rand);
    t.entry?.(ctx, L, rand);
    t.cakeCorner?.(ctx, L);
    terrain(ctx, L, info);
    inactiveLanes(ctx, L, info, t);
    blockedCells(ctx, L, info, t);
    ctx.restore();
    lip(ctx, L, pad, t);
  };
}

// ---------------------------------------------------------------- chapter 1: countertop

const countertop = paint({
  wall: ['#121838', '#1d2550'], tile: 'rgba(255,255,255,0.04)', tileSize: 0.9, moon: 'rgba(150,180,255,0.22)',
  slab: '#6b4226', slabEdge: '#4a2c18', laneA: '#ab7c52', laneB: '#a1724a', seam: 'rgba(60,30,12,0.55)',
  cellLight: 'rgba(255,236,200,0.08)', cellDark: 'rgba(40,18,6,0.07)', cellLine: 'rgba(255,236,200,0.1)', entryShade: 'rgba(10,10,30,0.72)',
  surface: (ctx, L, rand) => {
    // butcher-block planks: grain along the lane, a few knots
    const { u0, u1 } = span(L);
    ctx.lineWidth = 1.4;
    for (let lane = 0; lane < L.lanes; lane++) {
      const y = lane * L.across;
      for (let i = 0; i < 6; i++) {
        const off = (0.1 + rand() * 0.8) * L.across, wob = (rand() - 0.5) * L.across * 0.14;
        ctx.strokeStyle = rand() > 0.5 ? 'rgba(70,36,14,0.2)' : 'rgba(255,220,170,0.1)';
        ctx.beginPath(); ctx.moveTo(u0, y + off); ctx.bezierCurveTo(u0 + (u1 - u0) * 0.3, y + off + wob, u0 + (u1 - u0) * 0.7, y + off - wob, u1, y + off); ctx.stroke();
      }
      for (let k = 0; k < 2; k++) {
        const kx = u0 + rand() * (u1 - u0), ky = y + (0.2 + rand() * 0.6) * L.across;
        ctx.strokeStyle = 'rgba(70,36,14,0.25)'; ctx.beginPath(); ctx.ellipse(kx, ky, L.along * 0.09, L.across * 0.04, 0, 0, Math.PI * 2); ctx.stroke();
      }
      // plank butt joints, staggered
      ctx.strokeStyle = 'rgba(60,30,12,0.35)'; ctx.lineWidth = 2;
      const joint = u0 + ((lane * 0.37) % 1) * (u1 - u0) * 0.5 + (u1 - u0) * 0.25;
      ctx.beginPath(); ctx.moveTo(joint, y + 2); ctx.lineTo(joint, y + L.across - 2); ctx.stroke(); ctx.lineWidth = 1.4;
    }
    // flour dust
    ctx.fillStyle = 'rgba(255,250,240,0.12)';
    for (let i = 0; i < 40; i++) { ctx.beginPath(); ctx.arc(u0 + rand() * L.along * 2.2, rand() * L.lanes * L.across, 1 + rand() * 2.5, 0, Math.PI * 2); ctx.fill(); }
  },
  wallProps: (ctx, L) => {
    const band = wallBand(L);
    if (band.h > 40) moonWindow(ctx, band.x + band.w * 0.62, band.h * 0.15, Math.min(band.w * 0.22, band.h * 1.6), band.h * 0.72);
    if (band.h > 30) { // utensil rail
      const y = band.h * 0.3; ctx.strokeStyle = '#8a92a4'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(band.x + band.w * 0.08, y); ctx.lineTo(band.x + band.w * 0.4, y); ctx.stroke();
      for (let i = 0; i < 4; i++) { const x = band.x + band.w * (0.11 + i * 0.08); ctx.strokeStyle = '#5a6072'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + band.h * 0.45); ctx.stroke(); ctx.fillStyle = '#6a7084'; ctx.beginPath(); ctx.ellipse(x, y + band.h * 0.5, 5, 7, 0, 0, Math.PI * 2); ctx.fill(); }
    }
  },
  entry: (ctx, L, rand) => {
    // the backsplash where the counter meets the wall, with the crack the colony lives in
    const e = entryRect(L);
    ctx.fillStyle = 'rgba(30,36,70,0.55)'; ctx.fillRect(e.x, e.y, e.w, e.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 2; const tile = Math.min(L.along, L.across) * 0.45;
    ctx.beginPath(); for (let x = e.x; x < e.x + e.w; x += tile) { ctx.moveTo(x, e.y); ctx.lineTo(x, e.y + e.h); } for (let y = e.y; y < e.y + e.h; y += tile) { ctx.moveTo(e.x, y); ctx.lineTo(e.x + e.w, y); } ctx.stroke();
    for (const p of entryPoints(L, L.lanes)) {
      ctx.fillStyle = 'rgba(8,6,18,0.85)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, L.unit * 0.18, L.unit * 0.12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(210,170,110,0.35)'; for (let i = 0; i < 4; i++) ctx.fillRect(p.x + (rand() - 0.5) * L.unit * 0.6, p.y + (rand() - 0.5) * L.unit * 0.5, 3, 2);
    }
  },
  cakeCorner: (ctx, L) => {
    // a lace doily under the cake
    const { x, y, r } = L.cake;
    ctx.fillStyle = 'rgba(255,250,240,0.18)'; ctx.beginPath();
    for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2, rr = r * (1.42 + (i % 2 ? 0.05 : 0)); ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,250,240,0.22)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r * 1.3, 0, Math.PI * 2); ctx.stroke();
  }
}, 77);

// ---------------------------------------------------------------- chapter 2: sink

const sink = paint({
  wall: ['#0f2034', '#18324e'], tile: 'rgba(200,230,255,0.07)', tileSize: 0.55, moon: 'rgba(140,200,255,0.24)',
  slab: '#5a6678', slabEdge: '#39424f', laneA: '#8e9bb0', laneB: '#8593a8', seam: 'rgba(30,40,56,0.6)',
  cellLight: 'rgba(230,245,255,0.09)', cellDark: 'rgba(20,30,50,0.08)', cellLine: 'rgba(230,245,255,0.14)', entryShade: 'rgba(6,14,30,0.72)', inactive: '#3a5a7a',
  surface: (ctx, L, rand) => {
    const { u0, u1 } = span(L);
    // brushed steel along the lanes and draining-board ridges at the lane edges
    ctx.lineWidth = 1;
    for (let i = 0; i < L.lanes * 14; i++) { const v = rand() * L.lanes * L.across; ctx.strokeStyle = rand() > 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(20,30,50,0.07)'; ctx.beginPath(); ctx.moveTo(u0, v); ctx.lineTo(u1, v); ctx.stroke(); }
    for (let lane = 0; lane <= L.lanes; lane++) {
      const v = lane * L.across;
      ctx.fillStyle = 'rgba(20,30,50,0.25)'; ctx.fillRect(u0, v - 3, u1 - u0, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(u0, v - 3, u1 - u0, 1.5);
    }
    // water sheen streaks and droplets
    for (let i = 0; i < 7; i++) {
      const u = u0 + rand() * (u1 - u0), v = rand() * L.lanes * L.across, len = L.along * (0.4 + rand() * 0.9);
      const g = ctx.createLinearGradient(u, 0, u + len, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(220,240,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(u, v, len, 3);
    }
    for (let i = 0; i < 26; i++) {
      const u = u0 + rand() * (u1 - u0), v = rand() * L.lanes * L.across, r = 1.5 + rand() * 3;
      ctx.fillStyle = 'rgba(40,70,110,0.25)'; ctx.beginPath(); ctx.arc(u + 0.8, v + 0.8, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(235,248,255,0.5)'; ctx.beginPath(); ctx.arc(u, v, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(u - r * 0.4, v - r * 0.5, r * 0.5, r * 0.4);
    }
  },
  wallProps: (ctx, L) => {
    const band = wallBand(L);
    if (band.h > 40) moonWindow(ctx, band.x + band.w * 0.15, band.h * 0.15, Math.min(band.w * 0.2, band.h * 1.5), band.h * 0.72, '#cfd8e6');
    if (band.h > 30) { // faucet arc
      const x = band.x + band.w * 0.7, y = band.h;
      ctx.strokeStyle = '#2a3442'; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - band.h * 0.55); ctx.quadraticCurveTo(x, y - band.h * 0.85, x + band.h * 0.5, y - band.h * 0.8); ctx.stroke();
      ctx.strokeStyle = '#b8c4d6'; ctx.lineWidth = 7; ctx.stroke(); ctx.lineCap = 'butt';
    }
  },
  entry: (ctx, L) => {
    // the basin edge and drain holes the pests climb out of
    const e = entryRect(L);
    const g = e.alongX ? ctx.createLinearGradient(0, e.y + e.h, 0, e.y) : ctx.createLinearGradient(e.x, 0, e.x + e.w, 0);
    g.addColorStop(0, 'rgba(30,50,80,0.2)'); g.addColorStop(1, 'rgba(10,20,40,0.85)');
    ctx.fillStyle = g; ctx.fillRect(e.x, e.y, e.w, e.h);
    const pts = entryPoints(L, L.lanes), mid = pts[Math.floor(pts.length / 2)], r = Math.min(e.w, e.h) * 0.36;
    ctx.fillStyle = '#c4ccd8'; ctx.beginPath(); ctx.arc(mid.x, mid.y, r * 1.15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0a0e18'; ctx.beginPath(); ctx.arc(mid.x, mid.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8a96a8'; ctx.lineWidth = Math.max(2, r * 0.12); ctx.beginPath();
    for (const k of [-0.5, 0, 0.5]) { ctx.moveTo(mid.x - r * 0.9, mid.y + k * r); ctx.lineTo(mid.x + r * 0.9, mid.y + k * r); ctx.moveTo(mid.x + k * r, mid.y - r * 0.9); ctx.lineTo(mid.x + k * r, mid.y + r * 0.9); }
    ctx.stroke();
    for (const p of pts) { if (p === mid) continue; ctx.fillStyle = 'rgba(160,210,255,0.18)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, L.unit * 0.3, L.unit * 0.12, 0, 0, Math.PI * 2); ctx.fill(); }
  },
  cakeCorner: (ctx, L) => {
    // a folded tea towel under the plate
    const { x, y, r } = L.cake;
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.12);
    ctx.fillStyle = '#e8eef6'; ctx.beginPath(); ctx.roundRect(-r * 1.5, -r * 1.35, r * 3, r * 2.7, 8); ctx.fill();
    ctx.strokeStyle = '#d9534f'; ctx.lineWidth = Math.max(2, r * 0.08);
    ctx.beginPath(); ctx.moveTo(-r * 1.5, -r * 1.05); ctx.lineTo(r * 1.5, -r * 1.05); ctx.moveTo(-r * 1.5, r * 1.05); ctx.lineTo(r * 1.5, r * 1.05); ctx.stroke();
    ctx.restore();
  },
  blocked: (ctx, cx, cy, s) => { // an upturned cup
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.8, s * 1.1, s * 0.35, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f0f4fa'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx - s, cy + s * 0.7); ctx.lineTo(cx - s * 0.75, cy - s * 0.6); ctx.lineTo(cx + s * 0.75, cy - s * 0.6); ctx.lineTo(cx + s, cy + s * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#4f7fd0'; ctx.beginPath(); ctx.moveTo(cx - s * 0.85, cy + s * 0.2); ctx.lineTo(cx + s * 0.85, cy + s * 0.2); ctx.stroke();
  }
}, 202);

// ---------------------------------------------------------------- chapter 3: stove

const stove = paint({
  wall: ['#1e1418', '#2e1c1c'], tile: 'rgba(255,170,120,0.05)', tileSize: 0.5, moon: 'rgba(255,170,120,0.12)',
  slab: '#3b4a4c', slabEdge: '#263234', laneA: '#5e9089', laneB: '#578780', seam: 'rgba(200,215,220,0.5)',
  cellLight: 'rgba(230,255,250,0.08)', cellDark: 'rgba(10,30,30,0.08)', cellLine: 'rgba(230,255,250,0.12)', entryShade: 'rgba(20,8,8,0.72)', inactive: '#2f4446',
  surface: (ctx, L, rand) => {
    const { u0, u1 } = span(L);
    // vintage enamel: a gloss band along each lane, chrome strips between lanes, a few chips
    for (let lane = 0; lane < L.lanes; lane++) {
      const v = lane * L.across;
      ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(u0, v + L.across * 0.12, u1 - u0, L.across * 0.12);
    }
    for (let lane = 0; lane <= L.lanes; lane++) {
      const v = lane * L.across;
      ctx.fillStyle = '#9aa6aa'; ctx.fillRect(u0, v - 2.5, u1 - u0, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(u0, v - 2.5, u1 - u0, 1.5);
    }
    for (let i = 0; i < 10; i++) { ctx.fillStyle = 'rgba(30,30,30,0.35)'; ctx.beginPath(); ctx.arc(u0 + rand() * (u1 - u0), rand() * L.lanes * L.across, 1 + rand() * 2, 0, Math.PI * 2); ctx.fill(); }
    // old scorch rings
    for (let i = 0; i < 3; i++) { ctx.strokeStyle = 'rgba(60,30,10,0.12)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(u0 + rand() * (u1 - u0), rand() * L.lanes * L.across, L.across * (0.2 + rand() * 0.2), 0, Math.PI * 2); ctx.stroke(); }
  },
  wallProps: (ctx, L) => {
    const band = wallBand(L);
    if (band.h > 30) { // copper pans on hooks
      for (let i = 0; i < 4; i++) {
        const x = band.x + band.w * (0.12 + i * 0.1), r = band.h * (0.22 + (i % 2) * 0.06), y = band.h * 0.55;
        ctx.strokeStyle = '#4a3a30'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, y - r); ctx.stroke();
        ctx.fillStyle = '#b8683a'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,200,150,0.35)'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2); ctx.fill();
      }
      if (band.h > 40) moonWindow(ctx, band.x + band.w * 0.7, band.h * 0.15, Math.min(band.w * 0.18, band.h * 1.4), band.h * 0.7, '#3a2a24');
    }
  },
  entry: (ctx, L) => {
    // the back guard of the stove: knobs and a clock face
    const e = entryRect(L);
    ctx.fillStyle = '#2a3436'; ctx.fillRect(e.x, e.y, e.w, e.h);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; if (e.alongX) ctx.fillRect(e.x, e.y + e.h - 3, e.w, 2); else ctx.fillRect(e.x + 1, e.y, 2, e.h);
    const pts = entryPoints(L, L.lanes), r = Math.min(e.w, e.h) * 0.2;
    pts.forEach((p, i) => {
      if (i === Math.floor(pts.length / 2)) {
        ctx.fillStyle = '#e8e0cc'; ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - r); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + r * 0.7, p.y); ctx.stroke();
        return;
      }
      ctx.fillStyle = '#d6dadc'; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#2a1810'; ctx.fillRect(p.x - r * 0.15, p.y - r * 0.9, r * 0.3, r * 0.9);
    });
  },
  cakeCorner: (ctx, L) => {
    // a quilted oven mitt as a trivet
    const { x, y, r } = L.cake;
    ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.ellipse(x, y, r * 1.45, r * 1.35, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,220,200,0.35)'; ctx.lineWidth = 1.5;
    ctx.save(); ctx.beginPath(); ctx.ellipse(x, y, r * 1.45, r * 1.35, 0, 0, Math.PI * 2); ctx.clip();
    ctx.beginPath(); for (let k = -3; k <= 3; k++) { ctx.moveTo(x + k * r * 0.4 - r * 2, y - r * 2); ctx.lineTo(x + k * r * 0.4 + r * 2, y + r * 2); ctx.moveTo(x + k * r * 0.4 + r * 2, y - r * 2); ctx.lineTo(x + k * r * 0.4 - r * 2, y + r * 2); } ctx.stroke();
    ctx.restore();
  },
  blocked: (ctx, cx, cy, s) => { // a heavy cast-iron pot
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.8, s * 1.2, s * 0.35, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2b2a30'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(cx - s, cy - s * 0.5, s * 2, s * 1.3, s * 0.4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#3c3b44'; ctx.beginPath(); ctx.ellipse(cx, cy - s * 0.5, s, s * 0.3, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(cx - s * 0.7, cy - s * 0.2, s * 0.25, s * 0.8);
  }
}, 303);

// ---------------------------------------------------------------- chapter 4: pantry

const pantry = paint({
  wall: ['#1a120e', '#261a12'], tile: 'rgba(0,0,0,0.25)', tileSize: 1.4, moon: 'rgba(255,200,120,0.08)',
  slab: '#5a3a22', slabEdge: '#3a2414', laneA: '#c7a27c', laneB: '#bf9a74', seam: 'rgba(90,56,30,0.5)',
  cellLight: 'rgba(255,240,215,0.08)', cellDark: 'rgba(60,30,10,0.07)', cellLine: 'rgba(255,240,215,0.1)', entryShade: 'rgba(14,8,6,0.78)', inactive: '#5a3a28',
  surface: (ctx, L, rand) => {
    const { u0, u1 } = span(L);
    // gingham shelf paper: faint red bands both ways, kept quiet so units stay readable
    const step = Math.min(L.along, L.across) / 4;
    ctx.fillStyle = 'rgba(200,60,50,0.07)';
    for (let u = u0; u < u1; u += step * 2) ctx.fillRect(u, 0, step, L.lanes * L.across);
    for (let v = 0; v < L.lanes * L.across; v += step * 2) ctx.fillRect(u0, v, u1 - u0, step);
    // spilled flour and rice
    ctx.fillStyle = 'rgba(255,250,240,0.4)';
    for (let i = 0; i < 30; i++) { const u = u0 + rand() * (u1 - u0), v = rand() * L.lanes * L.across; ctx.beginPath(); ctx.ellipse(u, v, 2.2, 1.2, rand() * 3, 0, Math.PI * 2); ctx.fill(); }
  },
  wallProps: (ctx, L) => {
    const band = wallBand(L);
    if (band.h > 28) { // a shelf of jars
      ctx.fillStyle = '#4a3020'; ctx.fillRect(band.x, band.h - 8, band.w, 8);
      const n = Math.max(3, Math.floor(band.w / 70));
      for (let i = 0; i < n; i++) {
        const x = band.x + (i + 0.5) * band.w / n, h = band.h * (0.5 + ((i * 37) % 3) * 0.12), w = Math.min(band.w / n * 0.55, h * 0.8);
        ctx.fillStyle = ['#e8d8b0', '#d9a35a', '#f4f0e6', '#c46a3a'][i % 4]; ctx.beginPath(); ctx.roundRect(x - w / 2, band.h - 8 - h, w, h, 6); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x - w * 0.35, band.h - 8 - h * 0.85, w * 0.15, h * 0.6);
        ctx.fillStyle = '#7a4a2e'; ctx.fillRect(x - w * 0.55, band.h - 8 - h - 6, w * 1.1, 7);
      }
    }
  },
  entry: (ctx, L, rand) => {
    // the dark gap between sacks and jars at the back of the shelf
    const e = entryRect(L);
    ctx.fillStyle = 'rgba(10,6,4,0.7)'; ctx.fillRect(e.x, e.y, e.w, e.h);
    const pts = entryPoints(L, L.lanes * 2 - 1);
    pts.forEach((p, i) => {
      if (i % 2 === 0) return;
      const s = Math.min(e.w, e.h) * 0.42;
      ctx.fillStyle = i % 4 === 1 ? '#6a4a30' : '#5a4a3a';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, s * 0.8, s * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,230,190,0.12)'; ctx.beginPath(); ctx.ellipse(p.x - s * 0.2, p.y - s * 0.25, s * 0.3, s * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = 'rgba(240,230,210,0.35)'; for (let i = 0; i < 16; i++) ctx.fillRect(e.x + rand() * e.w, e.y + rand() * e.h, 2, 1.5);
  },
  cakeCorner: (ctx, L) => {
    // a wooden crate lid
    const { x, y, r } = L.cake;
    ctx.fillStyle = '#8a5a34'; ctx.beginPath(); ctx.roundRect(x - r * 1.4, y - r * 1.35, r * 2.8, r * 2.7, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(40,20,8,0.4)'; ctx.lineWidth = 2; ctx.beginPath();
    for (let k = 1; k < 4; k++) { ctx.moveTo(x - r * 1.4, y - r * 1.35 + k * r * 0.675); ctx.lineTo(x + r * 1.4, y - r * 1.35 + k * r * 0.675); }
    ctx.stroke();
  },
  blocked: (ctx, cx, cy, s) => { // a flour sack
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.85, s * 1.1, s * 0.35, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8dcc0'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx - s, cy + s * 0.8); ctx.quadraticCurveTo(cx - s * 1.2, cy - s * 0.4, cx - s * 0.4, cy - s * 0.8); ctx.lineTo(cx + s * 0.4, cy - s * 0.8); ctx.quadraticCurveTo(cx + s * 1.2, cy - s * 0.4, cx + s, cy + s * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c0392b'; ctx.fillRect(cx - s * 0.5, cy - s * 0.1, s, s * 0.35);
  }
}, 404);

// ---------------------------------------------------------------- chapter 5: fridge

const fridge = paint({
  wall: ['#6f95b4', '#41658a'], tile: 'rgba(255,255,255,0.1)', tileSize: 2.2, moon: 'rgba(230,245,255,0.3)',
  slab: '#a9c2d6', slabEdge: '#7a93ab', laneA: '#7fa3c0', laneB: '#789cba', seam: 'rgba(255,255,255,0.6)',
  cellLight: 'rgba(255,255,255,0.12)', cellDark: 'rgba(60,100,140,0.07)', cellLine: 'rgba(255,255,255,0.3)', entryShade: 'rgba(40,70,110,0.55)', inactive: '#6a8cac',
  surface: (ctx, L, rand) => {
    const { u0, u1 } = span(L);
    // frosted glass: a cool sheen and ice crystals creeping in from the lane edges
    for (let lane = 0; lane < L.lanes; lane++) {
      const v = lane * L.across;
      const g = ctx.createLinearGradient(0, v, 0, v + L.across); g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(0.4, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(120,160,200,0.12)');
      ctx.fillStyle = g; ctx.fillRect(u0, v, u1 - u0, L.across);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 26; i++) {
      const u = u0 + rand() * (u1 - u0), v = Math.round(rand() * L.lanes) * L.across + (rand() - 0.5) * 8, r = 3 + rand() * 6;
      ctx.beginPath(); for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3 + rand(); ctx.moveTo(u - Math.cos(a) * r, v - Math.sin(a) * r); ctx.lineTo(u + Math.cos(a) * r, v + Math.sin(a) * r); } ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let i = 0; i < 40; i++) ctx.fillRect(u0 + rand() * (u1 - u0), rand() * L.lanes * L.across, 1.5, 1.5);
  },
  wallProps: (ctx, L) => {
    const band = wallBand(L);
    if (band.h > 28) { // magnets and a child's drawing on the fridge door (seen from inside: the light strip)
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(band.x, band.h * 0.25, band.w, 3);
      for (let i = 0; i < 3; i++) { const x = band.x + band.w * (0.2 + i * 0.3); ctx.fillStyle = ['#ff8fa3', '#ffd24a', '#7ec8ff'][i]; ctx.beginPath(); ctx.arc(x, band.h * 0.6, Math.min(10, band.h * 0.2), 0, Math.PI * 2); ctx.fill(); }
    }
  },
  entry: (ctx, L) => {
    // the frosted back wall of the fridge, where forgotten things live
    const e = entryRect(L);
    const g = e.alongX ? ctx.createLinearGradient(0, e.y + e.h, 0, e.y) : ctx.createLinearGradient(e.x, 0, e.x + e.w, 0);
    g.addColorStop(0, 'rgba(220,240,255,0.3)'); g.addColorStop(1, 'rgba(60,90,130,0.75)');
    ctx.fillStyle = g; ctx.fillRect(e.x, e.y, e.w, e.h);
    const pts = entryPoints(L, L.lanes);
    pts.forEach((p, i) => {
      if (i % 2) return;
      const s = Math.min(e.w, e.h) * 0.36;
      ctx.fillStyle = 'rgba(40,60,90,0.4)'; ctx.beginPath(); ctx.roundRect(p.x - s, p.y - s * 0.7, s * 2, s * 1.4, s * 0.3); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(p.x - s * 0.8, p.y - s * 0.5, s * 1.6, s * 0.15);
    });
  },
  cakeCorner: (ctx, L) => {
    const { x, y, r } = L.cake;
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(x, y, r * 1.45, r * 1.38, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.stroke();
  },
  blocked: (ctx, cx, cy, s) => { // a milk carton
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.85, s * 0.9, s * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx - s * 0.6, cy + s * 0.8); ctx.lineTo(cx - s * 0.6, cy - s * 0.4); ctx.lineTo(cx, cy - s); ctx.lineTo(cx + s * 0.6, cy - s * 0.4); ctx.lineTo(cx + s * 0.6, cy + s * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#4f7fd0'; ctx.fillRect(cx - s * 0.6, cy + s * 0.05, s * 1.2, s * 0.35);
  }
}, 505);

export const BACKDROPS: Record<string, Painter> = { countertop, sink, stove, pantry, fridge };

export function paintBackdrop(ctx: Ctx, layout: BoardLayout, id: string, info: BoardInfo): void {
  (BACKDROPS[id] ?? countertop)(ctx, layout, info);
}

/**
 * Per-chapter mood for the lighting pass: the night tint over everything, the colour of the moon wash and the
 * warm-pool colour. The fridge is lit from inside, so its night is thin and cold.
 */
export type Mood = { night: [number, number, number, number]; warm: string; ambient: 'dust' | 'drips' | 'heat' | 'moths' | 'frost' };
export const MOODS: Record<string, Mood> = {
  countertop: { night: [12, 16, 58, 0.5], warm: '#ffaa46', ambient: 'dust' },
  sink: { night: [8, 26, 60, 0.5], warm: '#ffb05a', ambient: 'drips' },
  stove: { night: [30, 10, 36, 0.52], warm: '#ff8a30', ambient: 'heat' },
  pantry: { night: [18, 10, 20, 0.6], warm: '#ffb85a', ambient: 'moths' },
  fridge: { night: [24, 44, 100, 0.4], warm: '#ffc070', ambient: 'frost' }
};
export const moodFor = (id: string | undefined): Mood => MOODS[id ?? ''] ?? MOODS.countertop;

/**
 * The birthday cake seen from above, the glowing focal point: a lace plate, one wedge per slice with cream piping
 * and a strawberry, and Mei's number-seven candle in the middle. Eaten slices leave crumbs.
 */
export function drawCake(ctx: Ctx, layout: BoardLayout, slices: number, maxSlices: number, time: number, flinch: number, reduced: boolean): void {
  const { x, y, r } = layout.cake, shake = reduced ? 0 : Math.sin(time * 60) * flinch * r * 0.06;
  ctx.save(); ctx.translate(x + shake, y);
  // plate
  ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.beginPath(); ctx.ellipse(r * 0.06, r * 0.14, r * 1.2, r * 1.15, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#eef2fa'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2.5, r * 0.05);
  ctx.beginPath(); ctx.arc(0, 0, r * 1.12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(150,170,210,0.35)'; ctx.beginPath(); ctx.arc(r * 0.08, r * 0.1, r * 1.02, 0, Math.PI * 2); ctx.arc(0, 0, r * 0.94, 0, Math.PI * 2, true); ctx.fill();
  ctx.strokeStyle = 'rgba(120,140,190,0.5)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.arc(0, 0, r * 1.03, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  const wedge = Math.PI * 2 / maxSlices, start = -Math.PI / 2;
  for (let i = 0; i < maxSlices; i++) {
    const a0 = start + i * wedge, a1 = a0 + wedge, mid = (a0 + a1) / 2;
    if (i >= slices) {
      ctx.fillStyle = '#d9b98a';
      for (let c = 0; c < 5; c++) { const a = a0 + wedge * (0.15 + c * 0.17), d = r * (0.3 + ((c * 37) % 5) * 0.11); ctx.fillRect(Math.cos(a) * d - 2, Math.sin(a) * d - 2, 4, 3); }
      ctx.fillStyle = 'rgba(255,159,198,0.5)'; ctx.beginPath(); ctx.arc(Math.cos(mid) * r * 0.55, Math.sin(mid) * r * 0.55, r * 0.06, 0, Math.PI * 2); ctx.fill();
      continue;
    }
    const gap = maxSlices > 1 ? 0.035 : 0, ox = Math.cos(mid) * r * 0.03, oy = Math.sin(mid) * r * 0.03;
    // sponge side peeking out at the cut faces (shadow side of the wedge)
    ctx.beginPath(); ctx.moveTo(ox + r * 0.03, oy + r * 0.05); ctx.arc(r * 0.03, r * 0.05, r * 0.9, a0 + gap, a1 - gap); ctx.closePath();
    ctx.fillStyle = '#e8b878'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.arc(0, 0, r * 0.9, a0 + gap, a1 - gap); ctx.closePath();
    ctx.fillStyle = '#fff5ea'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2.5, r * 0.05); ctx.lineJoin = 'round'; ctx.fill(); ctx.stroke();
    // cream piping
    ctx.beginPath(); ctx.arc(0, 0, r * 0.75, a0 + gap * 2, a1 - gap * 2); ctx.strokeStyle = '#ff9fc6'; ctx.lineWidth = r * 0.13; ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.75, a0 + gap * 2, a1 - gap * 2); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = r * 0.04; ctx.stroke();
    const sx = Math.cos(mid) * r * 0.46, sy = Math.sin(mid) * r * 0.46;
    ctx.fillStyle = '#e5484d'; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, r * 0.14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(sx - r * 0.04, sy - r * 0.05, r * 0.035, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6fbb5c'; ctx.beginPath(); ctx.arc(sx, sy - r * 0.11, r * 0.055, 0, Math.PI * 2); ctx.fill();
  }
  if (slices > 0) {
    // the number-seven candle
    const s = r * 0.32;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = INK; ctx.lineWidth = s * 0.42; ctx.beginPath(); ctx.moveTo(-s * 0.45, -s * 0.9); ctx.lineTo(s * 0.45, -s * 0.9); ctx.lineTo(-s * 0.1, s * 0.6); ctx.stroke();
    ctx.strokeStyle = '#7ec8ff'; ctx.lineWidth = s * 0.26; ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = s * 0.07; ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.95); ctx.lineTo(s * 0.3, -s * 0.95); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(s * 0.35, -s * 0.95); ctx.lineTo(s * 0.35, -s * 1.15); ctx.stroke();
    const flicker = reduced ? 0 : Math.sin(time * 9) * r * 0.02, fx = s * 0.35 + flicker, fy = -s * 1.4;
    ctx.fillStyle = '#ff9a3a'; ctx.beginPath(); ctx.ellipse(fx, fy, r * 0.08, r * 0.15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.ellipse(fx, fy + r * 0.03, r * 0.04, r * 0.08, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
