/**
 * Drawing kit shared by every sprite. Sprites draw in a 100-unit box: (0, 0) is the feet centre, up is negative y,
 * and a body should stay roughly inside x -48..48, y -100..6.
 *
 * Art direction ("moonlit kitchen"): one chunky ink outline colour, flat fills with a soft cel shadow that leans
 * moon-violet on the lower right (light comes from the upper left), a small warm highlight, big expressive eyes.
 * The cel shadow is automatic: every outlined `oval` / `box` / `shape` gets it, so a sprite only picks its colours.
 * Pantry Guard (defenders) are light, warm and saturated; Midnight Crumbs (pests) are darker and cooler, so the two
 * factions separate by value on every chapter's ground.
 *
 * Facing: `dir` 0 is the wide board (defenders face right, pests face left); 1 is the tall phone board (defenders
 * aim up the screen, pests come down toward the camera). Sprites use `aim()` and `facing()` to turn their business
 * end, never a blanket 90-degree rotation.
 */
export type Mood = 'neutral' | 'happy' | 'worried' | 'angry' | 'sad' | 'smug' | 'hurt' | 'dead';

export type SpriteParams = {
  /** Looping idle frame 0..7 (legs, blinks, flickers). Smooth bobbing and squash are applied by the renderer. */
  frame: number;
  /** Attack pose: 0 idle, 1 wind-up, 2 strike, 3 follow-through. */
  act: number;
  /** 0, 1, 2 (bosses: phase). */
  tier: number;
  mood?: Mood;
  /** 0..1 health and shield left, for sprites that show damage. */
  hp?: number; shield?: number;
  /** Sim state for enemies ('walk', 'bite', 'flee', ...), plus 'hurt' and 'dead' from the renderer. */
  state?: string;
  /** 0 wide board (side view), 1 tall board (defenders aim up, pests face the camera). */
  dir?: number;
};
export type SpriteDraw = (ctx: CanvasRenderingContext2D, p: SpriteParams) => void;

export const INK = '#2a1810';
export const LINE = 5;
type Ctx = CanvasRenderingContext2D;

// ---------------------------------------------------------------- colour

const SHADOW_TINT = [44, 36, 88];
const shadeCache = new Map<string, string>();
const parseHex = (hex: string): [number, number, number] | null => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const s = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};
const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
/** The cel-shadow colour for a fill: darker and pulled toward moonlit violet. */
export function shadeOf(fill: string, amount = 0.3): string {
  const key = fill + amount, hit = shadeCache.get(key);
  if (hit) return hit;
  const rgb = parseHex(fill);
  const out = rgb ? toHex(...(rgb.map((v, i) => v * (1 - amount) * 0.86 + SHADOW_TINT[i] * amount) as [number, number, number])) : fill;
  shadeCache.set(key, out);
  return out;
}
/** Mix two hex colours. */
export function mix(a: string, b: string, k: number): string {
  const x = parseHex(a), y = parseHex(b);
  if (!x || !y) return a;
  return toHex(x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k);
}

let shading = true;
/** Turn the automatic cel shadow off for a block (flat icons, decals). */
export function withoutShading(fn: () => void): void { const was = shading; shading = false; try { fn(); } finally { shading = was; } }

type Rebuild = (dx: number, dy: number) => void;
/**
 * Fill, cel-shade and outline the current path. `rebuild` re-traces the same path offset by (dx, dy) and `size` is
 * the shape's rough extent; together they carve the lit area out of the shadow.
 */
export function paint(ctx: Ctx, fill: string | null, stroke: string | null = INK, width = LINE, rebuild?: Rebuild, size = 0): void {
  if (fill) {
    if (shading && rebuild && stroke && width >= 3.5 && size >= 9 && fill.startsWith('#')) {
      ctx.fillStyle = shadeOf(fill); ctx.fill();
      ctx.save(); ctx.clip();
      rebuild(-size * 0.16, -size * 0.2); ctx.fillStyle = fill; ctx.fill();
      ctx.restore();
      rebuild(0, 0);
    } else { ctx.fillStyle = fill; ctx.fill(); }
  }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
}
export function oval(ctx: Ctx, x: number, y: number, rx: number, ry: number, fill: string | null, stroke: string | null = INK, width = LINE, rotation = 0): void {
  const trace = (dx: number, dy: number) => { ctx.beginPath(); ctx.ellipse(x + dx, y + dy, Math.max(0.1, rx), Math.max(0.1, ry), rotation, 0, Math.PI * 2); };
  trace(0, 0); paint(ctx, fill, stroke, width, (dx, dy) => trace(dx * rx / Math.max(rx, ry), dy * ry / Math.max(rx, ry)), Math.max(rx, ry));
}
export function box(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string | null, stroke: string | null = INK, width = LINE): void {
  const trace = (dx: number, dy: number) => { ctx.beginPath(); ctx.roundRect(x + dx, y + dy, w, h, Math.max(0, Math.min(r, w / 2, h / 2))); };
  trace(0, 0); paint(ctx, fill, stroke, width, (dx, dy) => trace(dx * w / Math.max(w, h), dy * h / Math.max(w, h)), Math.max(w, h) / 2);
}
/** Closed smooth-ish polygon from points; `curve` rounds the corners through midpoints. */
export function shape(ctx: Ctx, points: number[], fill: string | null, stroke: string | null = INK, width = LINE, curve = true): void {
  const n = points.length / 2;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) { x0 = Math.min(x0, points[i * 2]); x1 = Math.max(x1, points[i * 2]); y0 = Math.min(y0, points[i * 2 + 1]); y1 = Math.max(y1, points[i * 2 + 1]); }
  const trace = (dx: number, dy: number) => {
    ctx.beginPath();
    if (!curve) { ctx.moveTo(points[0] + dx, points[1] + dy); for (let i = 1; i < n; i++) ctx.lineTo(points[i * 2] + dx, points[i * 2 + 1] + dy); }
    else {
      const mid = (i: number): [number, number] => { const j = (i + 1) % n; return [(points[i * 2] + points[j * 2]) / 2 + dx, (points[i * 2 + 1] + points[j * 2 + 1]) / 2 + dy]; };
      const start = mid(n - 1); ctx.moveTo(start[0], start[1]);
      for (let i = 0; i < n; i++) { const m = mid(i); ctx.quadraticCurveTo(points[i * 2] + dx, points[i * 2 + 1] + dy, m[0], m[1]); }
    }
    ctx.closePath();
  };
  trace(0, 0);
  const w = x1 - x0, h = y1 - y0, size = Math.max(w, h) / 2;
  paint(ctx, fill, stroke, width, (dx, dy) => trace(dx * w / Math.max(w, h, 1), dy * h / Math.max(w, h, 1)), size);
}
export function line(ctx: Ctx, points: number[], stroke: string = INK, width = LINE): void {
  ctx.beginPath(); ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  paint(ctx, null, stroke, width);
}
/** A quadratic curve stroke: start, control, end. */
export function curve(ctx: Ctx, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, stroke: string = INK, width = LINE): void {
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1); paint(ctx, null, stroke, width);
}
export function arc(ctx: Ctx, x: number, y: number, r: number, from: number, to: number, stroke: string = INK, width = LINE): void {
  ctx.beginPath(); ctx.arc(x, y, r, from, to); paint(ctx, null, stroke, width);
}
/** Soft white highlight. */
export function shine(ctx: Ctx, x: number, y: number, rx: number, ry: number, alpha = 0.45, rotation = -0.5): void {
  ctx.save(); ctx.globalAlpha *= alpha; oval(ctx, x, y, rx, ry, '#ffffff', null, 0, rotation); ctx.restore();
}
/** Rosy cheeks. */
export function blush(ctx: Ctx, x: number, y: number, gap: number, r: number, color = '#ff8fa3', alpha = 0.55): void {
  ctx.save(); ctx.globalAlpha *= alpha; oval(ctx, x - gap, y, r, r * 0.6, color, null); oval(ctx, x + gap, y, r, r * 0.6, color, null); ctx.restore();
}
/** A little 5-point star (tier badges, sparkles). */
export function star(ctx: Ctx, x: number, y: number, r: number, fill = '#ffd24a', stroke: string | null = INK, width = 2.5): void {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); paint(ctx, fill, stroke, width);
}

// ---------------------------------------------------------------- facing

/** True on the tall board. */
export const tall = (p: SpriteParams): boolean => p.dir === 1;
/** Angle a defender's business end points: right on the wide board, up the screen on the tall one. */
export const aim = (p: SpriteParams): number => (p.dir === 1 ? -Math.PI / 2 : 0);
/** Run `fn` around a pivot rotated by `aim(p)` (plus `extra`), so a nozzle or spout drawn pointing right turns. */
export function aimed(ctx: Ctx, p: SpriteParams, x: number, y: number, fn: () => void, extra = 0): void {
  ctx.save(); ctx.translate(x, y); ctx.rotate(aim(p) + extra); fn(); ctx.restore();
}
/** Where defender eyes look. */
export const lookOf = (p: SpriteParams): [number, number] => (p.dir === 1 ? [0, -0.32] : [0.28, 0]);
/** Where pest eyes look: left on the wide board, at the camera (down) on the tall one. */
export const pestLook = (p: SpriteParams): [number, number] => (p.dir === 1 ? [0, 0.3] : [-0.3, 0.08]);

// ---------------------------------------------------------------- faces

/** A pair of cartoon eyes. `frame` drives an occasional blink; `mood` tilts the brows. */
export function eyes(ctx: Ctx, x: number, y: number, gap: number, r: number, p: { frame: number; mood?: Mood; state?: string }, look: [number, number] = [0.25, 0], white = '#ffffff'): void {
  const mood: Mood = p.state === 'dead' ? 'dead' : p.state === 'hurt' ? 'hurt' : p.mood ?? 'neutral', blink = p.frame === 6;
  for (const side of [-1, 1]) {
    const ex = x + side * gap;
    if (mood === 'dead') { const k = r * 0.7; line(ctx, [ex - k, y - k, ex + k, y + k], INK, LINE * 0.8); line(ctx, [ex - k, y + k, ex + k, y - k], INK, LINE * 0.8); continue; }
    if (mood === 'hurt') { line(ctx, [ex - side * r * 0.9, y - r * 0.6, ex + side * r * 0.6, y, ex - side * r * 0.9, y + r * 0.6], INK, LINE * 0.8); continue; }
    if (blink || mood === 'happy') { arc(ctx, ex, y + (mood === 'happy' ? r * 0.4 : 0), r * 0.8, Math.PI * 1.1, Math.PI * 1.9, INK, LINE * 0.8); if (blink && mood !== 'happy') line(ctx, [ex - r * 0.8, y, ex + r * 0.8, y], INK, LINE * 0.8); continue; }
    oval(ctx, ex, y, r, r * 1.12, white, INK, LINE * 0.7);
    const px = ex + look[0] * r, py = y + look[1] * r + (mood === 'sad' || mood === 'worried' ? r * 0.15 : 0);
    oval(ctx, px, py, r * 0.52, r * 0.6, INK, null);
    oval(ctx, px - r * 0.18, py - r * 0.26, r * 0.18, r * 0.18, '#ffffff', null);
    if (mood === 'sad') { ctx.save(); ctx.globalAlpha *= 0.85; oval(ctx, ex + side * r * 0.2, y + r * 1.5, r * 0.22, r * 0.36, '#8fd3ff', null); ctx.restore(); }
    const brow = mood === 'angry' ? 1 : mood === 'worried' || mood === 'sad' ? -1 : mood === 'smug' ? 0.4 : 0;
    // outer end first, inner end second: angry brows dip toward the nose, worried ones rise
    if (brow) line(ctx, [ex + side * r * 1.1, y - r * 1.5 - brow * r * 0.45, ex - side * r * 0.9, y - r * 1.5 + brow * r * 0.45], INK, LINE * 0.8);
    if (mood === 'smug') line(ctx, [ex - r, y - r * 0.25, ex + r, y - r * 0.25], INK, LINE * 0.6);
  }
}
export function mouth(ctx: Ctx, x: number, y: number, w: number, mood: Mood | undefined, open = false): void {
  if (open) { oval(ctx, x, y, w * 0.5, w * 0.42, '#7a2b2b', INK, LINE * 0.7); oval(ctx, x, y + w * 0.18, w * 0.28, w * 0.14, '#ff8a8a', null); return; }
  switch (mood ?? 'neutral') {
    case 'happy': ctx.beginPath(); ctx.arc(x, y - w * 0.25, w * 0.6, 0.12 * Math.PI, 0.88 * Math.PI); ctx.closePath(); paint(ctx, '#7a2b2b', INK, LINE * 0.7); break;
    case 'sad': case 'worried': arc(ctx, x, y + w * 0.5, w * 0.55, 1.2 * Math.PI, 1.8 * Math.PI, INK, LINE * 0.8); break;
    case 'angry': line(ctx, [x - w * 0.5, y + w * 0.1, x, y - w * 0.15, x + w * 0.5, y + w * 0.1], INK, LINE * 0.8); break;
    case 'smug': arc(ctx, x + w * 0.15, y - w * 0.2, w * 0.5, 0.1 * Math.PI, 0.7 * Math.PI, INK, LINE * 0.8); break;
    case 'hurt': line(ctx, [x - w * 0.5, y, x - w * 0.17, y - w * 0.15, x + w * 0.17, y + w * 0.1, x + w * 0.5, y - w * 0.05], INK, LINE * 0.7); break;
    case 'dead': oval(ctx, x, y, w * 0.32, w * 0.22, '#7a2b2b', INK, LINE * 0.6); break;
    default: arc(ctx, x, y - w * 0.3, w * 0.5, 0.25 * Math.PI, 0.75 * Math.PI, INK, LINE * 0.8);
  }
}
/** Mood with the renderer's transient states folded in. */
export const moodOf = (p: SpriteParams, fallback: Mood = 'neutral'): Mood => (p.state === 'dead' ? 'dead' : p.state === 'hurt' ? 'hurt' : p.mood ?? fallback);
/** Two stubby feet that alternate with the frame (for walkers), or stand still. */
export function feet(ctx: Ctx, x: number, gap: number, r: number, fill: string, frame: number, walking = false): void {
  const lift = walking ? [0, -4, 0, 0, 0, 0, 0, 0][frame % 4] : 0, lift2 = walking ? [0, 0, 0, -4][frame % 4] : 0;
  oval(ctx, x - gap, -r * 0.4 + lift, r, r * 0.6, fill); oval(ctx, x + gap, -r * 0.4 + lift2, r, r * 0.6, fill);
}
/** A cartoon flame whose tip sways with the frame. */
export function flame(ctx: Ctx, x: number, y: number, size: number, frame: number, outer = '#ff8a1f', inner = '#ffe27a'): void {
  const sway = [0, 2, 3, 1, -1, -3, -2, 0][frame % 8] * size / 20;
  withoutShading(() => {
    shape(ctx, [x - size * 0.5, y, x - size * 0.55, y - size * 0.6, x + sway, y - size * 1.5, x + size * 0.55, y - size * 0.6, x + size * 0.5, y], outer, INK, LINE * 0.8);
    shape(ctx, [x - size * 0.25, y - size * 0.05, x - size * 0.28, y - size * 0.4, x + sway * 0.6, y - size * 0.95, x + size * 0.28, y - size * 0.4, x + size * 0.25, y - size * 0.05], inner, null);
  });
}
/** A curling wisp (steam, stink, frost breath). */
export function wisp(ctx: Ctx, x: number, y: number, s: number, frame: number, color = '#ffffff', alpha = 0.8): void {
  const k = (frame % 8) / 8;
  ctx.save(); ctx.globalAlpha *= alpha * (1 - k * 0.6);
  ctx.beginPath(); ctx.moveTo(x, y);
  ctx.bezierCurveTo(x - s * 0.6, y - s * (0.5 + k), x + s * 0.6, y - s * (0.9 + k), x - s * 0.1, y - s * (1.5 + k));
  ctx.strokeStyle = color; ctx.lineWidth = s * 0.28; ctx.lineCap = 'round'; ctx.stroke();
  ctx.restore();
}
/** Gold tier-3 trim: a little crest so a fully upgraded unit reads as proudly upgraded at any size. */
export function crest(ctx: Ctx, x: number, y: number, s = 1): void {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  withoutShading(() => {
    shape(ctx, [-11, 4, -14, -8, -6, -3, 0, -13, 6, -3, 14, -8, 11, 4], '#ffd24a', INK, 3, false);
    oval(ctx, 0, -1, 2.6, 2.6, '#ff5d73', INK, 1.5);
  });
  ctx.restore();
}
