/**
 * Pocket Survivor art kit: an original chibi Three Kingdoms cast, pickups, weapon sprites and icons, all drawn
 * procedurally. Everything here is pure drawing code; `bake` turns a drawing into a cached offscreen sprite so the
 * renderer only blits images in the hot loop.
 */
export const TAU = Math.PI * 2;
export const INK = '#2a1b2b';
export const C = {
  cream: '#fff3d6', parchment: '#f6e6bf', parchmentDark: '#e0c690', wood: '#4a2a1c', woodDark: '#2f190f', woodLight: '#7a4a2c',
  gold: '#ffc94a', goldDark: '#c98a1e', red: '#d8342c', redDark: '#8f1d1d', jade: '#35c79a', jadeDark: '#1f8f6e', sky: '#6fd3ff',
  skin: '#ffd9b0', skinDark: '#eeb98a', steel: '#e8edf2', steelDark: '#a9b4c2', danger: '#ff5a4f', brown: '#6b4630'
};
export type Ctx = CanvasRenderingContext2D;

// ---- path helpers --------------------------------------------------------------------------------------------------------
export function P(c: Ctx, fill: string, lw = 1.5, stroke = INK) { c.fillStyle = fill; c.fill(); if (lw > 0) { c.lineWidth = lw; c.strokeStyle = stroke; c.stroke(); } }
export function E(c: Ctx, x: number, y: number, rx: number, ry: number, rot = 0) { c.beginPath(); c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rot, 0, TAU); }
export function R(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const q = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath(); c.moveTo(x + q, y); c.lineTo(x + w - q, y); c.arcTo(x + w, y, x + w, y + q, q); c.lineTo(x + w, y + h - q); c.arcTo(x + w, y + h, x + w - q, y + h, q);
  c.lineTo(x + q, y + h); c.arcTo(x, y + h, x, y + h - q, q); c.lineTo(x, y + q); c.arcTo(x, y, x + q, y, q); c.closePath();
}
export function L(c: Ctx, points: number[], close = true) { c.beginPath(); for (let i = 0; i < points.length; i += 2) { if (i) c.lineTo(points[i], points[i + 1]); else c.moveTo(points[i], points[i + 1]); } if (close) c.closePath(); }
/** An outlined round stick (spear shafts, poles, limbs). */
export function stick(c: Ctx, x1: number, y1: number, x2: number, y2: number, w: number, color: string, outline = 1.5) {
  c.lineCap = 'round'; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
  if (outline > 0) { c.strokeStyle = INK; c.lineWidth = w + outline * 2; c.stroke(); }
  c.strokeStyle = color; c.lineWidth = w; c.stroke();
}
export function star(c: Ctx, x: number, y: number, outer: number, inner: number, points: number, rot = -Math.PI / 2) {
  c.beginPath(); for (let i = 0; i < points * 2; i++) { const a = rot + i / (points * 2) * TAU, r = i % 2 ? inner : outer; if (i) c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath();
}
/** A wobbly closed blob through `n` points; `rnd` supplies the jitter so shapes stay deterministic. */
export function blob(c: Ctx, x: number, y: number, rx: number, ry: number, n: number, jitter: number, rnd: () => number) {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) { const a = i / n * TAU, k = 1 - jitter + rnd() * jitter * 2; pts.push(x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k); }
  c.beginPath();
  for (let i = 0; i < n; i++) { const j = (i + 1) % n, mx = (pts[i * 2] + pts[j * 2]) / 2, my = (pts[i * 2 + 1] + pts[j * 2 + 1]) / 2; if (!i) c.moveTo(mx, my); const k = (j + 1) % n; c.quadraticCurveTo(pts[j * 2], pts[j * 2 + 1], (pts[j * 2] + pts[k * 2]) / 2, (pts[j * 2 + 1] + pts[k * 2 + 1]) / 2); }
  c.closePath();
}
export const mulberry = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ---- sprite baking -------------------------------------------------------------------------------------------------------
/** `x, y, w, h` are in world units relative to the anchor; `px, py` are the same offset in baked pixels at `res`. */
export type Sprite = { img: HTMLCanvasElement; hit: HTMLCanvasElement | null; x: number; y: number; w: number; h: number; px: number; py: number; res: number };
export function canvasOf(w: number, h: number): { el: HTMLCanvasElement; c: Ctx } | null {
  if (typeof document === 'undefined') return null;
  const el = document.createElement('canvas'); el.width = Math.max(1, Math.ceil(w)); el.height = Math.max(1, Math.ceil(h));
  const c = el.getContext('2d'); if (!c) return null;
  c.lineJoin = 'round'; c.lineCap = 'round';
  return { el, c };
}
/**
 * Renders `draw` (world units, origin at the anchor) into a sprite at `res` px per unit. `box` = [x0, y0, x1, y1] only
 * has to be generous enough to hold the drawing: the result is trimmed to its opaque pixels, so blits never pay for
 * empty margins.
 */
export function bake(res: number, box: readonly number[], draw: (c: Ctx) => void, flash = false): Sprite | null {
  const [x0, y0, x1, y1] = box, made = canvasOf((x1 - x0) * res, (y1 - y0) * res);
  if (!made) return null;
  // the anchor lands on a whole pixel so a 1:1 blit never needs resampling
  const ax = Math.round(-x0 * res), ay = Math.round(-y0 * res);
  made.c.setTransform(res, 0, 0, res, ax, ay); draw(made.c); made.c.setTransform(1, 0, 0, 1, 0, 0);
  let el = made.el, left = 0, top = 0;
  try {
    const { width, height } = el, data = made.c.getImageData(0, 0, width, height).data;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) for (let x = 0, i = y * width * 4 + 3; x < width; x++, i += 4) if (data[i] > 4) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    if (maxX >= minX && (maxX - minX + 3 < width || maxY - minY + 3 < height)) {
      left = Math.max(0, minX - 1); top = Math.max(0, minY - 1);
      const cut = canvasOf(Math.min(width, maxX + 2) - left, Math.min(height, maxY + 2) - top);
      if (cut) { cut.c.drawImage(el, -left, -top); el = cut.el; } else { left = 0; top = 0; }
    }
  } catch { /* a context without pixel access keeps the untrimmed sprite */ }
  let hit: HTMLCanvasElement | null = null;
  if (flash) { const copy = canvasOf(el.width, el.height); if (copy) { copy.c.drawImage(el, 0, 0); copy.c.globalCompositeOperation = 'source-atop'; copy.c.fillStyle = 'rgba(255,255,255,0.5)'; copy.c.fillRect(0, 0, el.width, el.height); hit = copy.el; } }
  return { img: el, hit, x: (left - ax) / res, y: (top - ay) / res, w: el.width / res, h: el.height / res, px: left - ax, py: top - ay, res };
}
/** Soft radial glow sprite, used for light pools and additive bloom. */
export function glowSprite(color: string, size = 64, core = 0): HTMLCanvasElement | null {
  const made = canvasOf(size, size); if (!made) return null;
  const { el, c } = made, g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, color); if (core > 0) g.addColorStop(core, color); g.addColorStop(1, color.length === 7 ? `${color}00` : 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(0, 0, size, size);
  return el;
}

// ---- chibi parts (facing right, origin at the feet) ------------------------------------------------------------------------
const STEP = [1, 0, -1, 0], BOB = [0, -1.1, 0, -1.1];
function feet(c: Ctx, step: number, color: string, spread = 3.2, size = 1) {
  E(c, -spread - step * 2.8, -2.3 * size - Math.max(0, -step) * 1.8, 3.6 * size, 2.5 * size); P(c, color);
  E(c, spread + step * 2.8, -2.3 * size - Math.max(0, step) * 1.8, 3.6 * size, 2.5 * size); P(c, color);
}
type Mood = 'hero' | 'angry' | 'grin' | 'calm' | 'mean';
function face(c: Ctx, x: number, y: number, s: number, mood: Mood) {
  const ex = 2.75 * s;
  c.fillStyle = INK; for (const side of [-1, 1]) { E(c, x + side * ex, y, 1.35 * s, 2.05 * s); c.fill(); }
  c.fillStyle = '#ffffff'; for (const side of [-1, 1]) { E(c, x + side * ex + 0.45 * s, y - 0.85 * s, 0.6 * s, 0.6 * s); c.fill(); }
  c.strokeStyle = INK; c.lineWidth = 1.25 * s; c.lineCap = 'round'; c.beginPath();
  const slant = mood === 'hero' ? 0.5 : mood === 'calm' ? 0 : 1.5;
  c.moveTo(x - ex - 1.9 * s, y - 3.1 * s - slant * s); c.lineTo(x - ex + 1.5 * s, y - 3.1 * s);
  c.moveTo(x + ex + 1.9 * s, y - 3.1 * s - slant * s); c.lineTo(x + ex - 1.5 * s, y - 3.1 * s); c.stroke();
  if (mood === 'angry') { E(c, x + 0.3 * s, y + 4.3 * s, 1.7 * s, 1.25 * s); P(c, '#8a2030', s); }
  else if (mood === 'grin' || mood === 'mean') { R(c, x - 2.2 * s, y + 3.2 * s, 4.8 * s, 2 * s, 0.9 * s); P(c, '#ffffff', 0.9 * s); }
  else { c.lineWidth = 1.1 * s; c.beginPath(); c.arc(x + 0.3 * s, y + 2.9 * s, 1.7 * s, 0.12 * Math.PI, 0.88 * Math.PI); c.stroke(); }
  if (mood === 'hero' || mood === 'calm') { c.fillStyle = 'rgba(255,110,110,0.42)'; E(c, x - ex - 1.6 * s, y + 2.7 * s, 1.7 * s, 1 * s); c.fill(); E(c, x + ex + 1.9 * s, y + 2.7 * s, 1.5 * s, 1 * s); c.fill(); }
}
/** The officer's back banner, which marks every elite. */
function backBanner(c: Ctx, x: number, y: number, wave: number, color = C.red) {
  stick(c, x, y, x - 3, y - 31, 1.3, C.woodLight, 1.2);
  L(c, [x - 3.2, y - 31, x - 17, y - 29.5 + wave, x - 15.5, y - 17 + wave * 1.4, x - 2.2, y - 19]); P(c, color);
  c.strokeStyle = C.gold; c.lineWidth = 1; L(c, [x - 5, y - 28.6, x - 14.4, y - 27.4 + wave, x - 13.4, y - 19.4 + wave * 1.3, x - 4.4, y - 21], true); c.stroke();
  E(c, x - 9.3, y - 24.2 + wave * 0.8, 2, 2); c.fillStyle = C.gold; c.fill();
  E(c, x - 3, y - 31.6, 1.7, 1.7); P(c, C.gold, 1.1);
}
/** Shared head-wrap: covers the top of a head ellipse down to a brow line. */
function cap(c: Ctx, cx: number, cy: number, rx: number, ry: number, brow: number, fill: string) {
  c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, Math.PI + brow, TAU - brow * 0.7);
  c.quadraticCurveTo(cx + rx * 0.2, cy - ry * 0.05, cx - Math.cos(brow) * rx, cy - Math.sin(brow) * ry); c.closePath(); P(c, fill);
}

// ---- the rank and file ----------------------------------------------------------------------------------------------------
/** Grub: a yellow-scarf foot soldier with a short spear. */
export function drawSoldier(c: Ctx, f: number, elite: boolean) {
  const step = STEP[f & 3], bob = BOB[f & 3];
  if (elite) backBanner(c, -4.5, -13 + bob, step * 0.9);
  c.beginPath(); c.moveTo(-6.5, -26 + bob); c.quadraticCurveTo(-13, -26 + bob - step, -15.5, -20 + bob + step * 1.6); c.quadraticCurveTo(-11, -22.5 + bob, -7.5, -21 + bob); c.closePath(); P(c, '#e2a21e');
  feet(c, step, '#5a3a28');
  R(c, -6.6, -15.2 + bob, 13.2, 12.4, 5); P(c, '#b9773f');
  c.fillStyle = '#9c5f2f'; R(c, -5.8, -8.2 + bob, 11.6, 4.4, 2.4); c.fill();
  R(c, -6.9, -9.4 + bob, 13.8, 2.6, 1.2); P(c, '#f1c232', 1.2);
  E(c, 0.8, -21.6 + bob, 9.6, 8.8); P(c, C.skin);
  cap(c, 0.8, -21.6 + bob, 9.9, 9.1, 0.42, '#ffcd38');
  c.strokeStyle = '#d99a17'; c.lineWidth = 1.1; c.beginPath(); c.moveTo(-6.5, -27 + bob); c.quadraticCurveTo(1, -30.4 + bob, 8, -26.2 + bob); c.stroke();
  face(c, 3.6, -20 + bob, 1, 'angry');
  stick(c, 8.6, -1.5, 12.2, -29 + bob, 1.5, '#8a5a36');
  L(c, [12.3, -36 + bob, 14.7, -30.2 + bob, 12.4, -28.2 + bob, 10.3, -30 + bob]); P(c, C.steel, 1.3);
  E(c, 9.9, -11 + bob, 2.4, 2.4); P(c, C.skin, 1.3);
}
/** Skitter: a small hooded bandit scout, sprinting low with twin daggers and a long red scarf. */
export function drawBandit(c: Ctx, f: number, elite: boolean) {
  const step = STEP[f & 3], bob = BOB[f & 3] * 0.8;
  c.save(); c.scale(0.8, 0.8);
  if (elite) backBanner(c, -4, -12 + bob, step * 0.9, '#3d4fa0');
  c.beginPath(); c.moveTo(-5, -17 + bob); c.quadraticCurveTo(-13, -18 + bob + step * 2, -20, -14 + bob - step * 2.2); c.quadraticCurveTo(-13, -13.4 + bob + step, -6, -13.5 + bob); c.closePath(); P(c, '#e4483c');
  E(c, -4.2 - step * 4.4, -2.3 - Math.max(0, -step) * 2.4, 3.7, 2.5); P(c, '#2c2f4a'); E(c, 4.2 + step * 4.4, -2.3 - Math.max(0, step) * 2.4, 3.7, 2.5); P(c, '#2c2f4a');
  c.rotate(0.2);
  E(c, -9.5, -9 + bob, 2.2, 2.2); P(c, C.skin, 1.3); L(c, [-10.5, -10 + bob, -16.5, -13.5 + bob, -11.3, -7.4 + bob]); P(c, C.steel, 1.2);
  R(c, -6.2, -15 + bob, 12.4, 11.8, 5); P(c, '#4a5cae');
  R(c, -6.4, -8.6 + bob, 12.8, 2.4, 1.1); P(c, '#2c2f4a', 1.1);
  E(c, 0.8, -21 + bob, 9.3, 8.5); P(c, '#3c4d99');
  L(c, [-7.6, -25.5 + bob, -11.5, -31.5 + bob, -3.5, -29 + bob]); P(c, '#3c4d99');
  c.beginPath(); c.ellipse(2.6, -20.4 + bob, 6.6, 3.5, 0.05, 0, TAU); P(c, C.skin, 1.2);
  c.fillStyle = INK; E(c, 0.6, -20.2 + bob, 1.3, 1.9); c.fill(); E(c, 5.8, -20.2 + bob, 1.3, 1.9); c.fill();
  c.strokeStyle = INK; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-1.6, -23.6 + bob); c.lineTo(2, -22.2 + bob); c.moveTo(8, -23.6 + bob); c.lineTo(4.6, -22.2 + bob); c.stroke();
  c.beginPath(); c.ellipse(1.6, -16.2 + bob, 8, 3.2, 0, 0, Math.PI); c.closePath(); P(c, '#e4483c', 1.2);
  E(c, 9.6, -10 + bob, 2.2, 2.2); P(c, C.skin, 1.3); L(c, [10.4, -11.4 + bob, 17.6, -13 + bob, 11.4, -8.2 + bob]); P(c, C.steel, 1.2);
  c.restore();
}
/** Brute: a heavy bruiser behind a round shield, war hammer on the shoulder. */
export function drawBruiser(c: Ctx, f: number, elite: boolean) {
  const step = STEP[f & 3], bob = BOB[f & 3] * 0.9;
  if (elite) backBanner(c, -10, -26 + bob, step * 0.9, '#7b3fb0');
  stick(c, -5, -14 + bob, -15, -38 + bob, 2.2, '#8a5a36');
  R(c, -24.5, -47 + bob, 17, 11.5, 2.6); P(c, '#8d94a6'); c.fillStyle = '#b9bfce'; R(c, -23.2, -45.8 + bob, 14.4, 3.2, 1.4); c.fill();
  E(c, -6.2 - step * 2.6, -2.8 - Math.max(0, -step) * 1.6, 5.4, 3.3); P(c, '#3b2a3f'); E(c, 6.2 + step * 2.6, -2.8 - Math.max(0, step) * 1.6, 5.4, 3.3); P(c, '#3b2a3f');
  E(c, 0, -17 + bob, 15, 14); P(c, '#8757c9');
  c.fillStyle = '#6d42ad'; c.beginPath(); c.ellipse(0, -13.6 + bob, 13.4, 10.2, 0, 0, Math.PI); c.fill();
  R(c, -14.2, -12.6 + bob, 28.4, 3.6, 1.6); P(c, '#3b2a3f', 1.3); E(c, -1, -10.8 + bob, 2.3, 2.3); P(c, C.gold, 1.2);
  E(c, -11.5, -25.5 + bob, 6, 4.6, -0.4); P(c, '#8d94a6');
  E(c, 2.2, -33 + bob, 8.6, 7.8); P(c, C.skinDark);
  cap(c, 2.2, -33 + bob, 8.9, 8.1, 0.3, '#7d8598');
  L(c, [-5, -38 + bob, -9.5, -45 + bob, -2.4, -40.4 + bob]); P(c, C.cream, 1.3); L(c, [9, -38.6 + bob, 13.4, -45.4 + bob, 6.6, -40.6 + bob]); P(c, C.cream, 1.3);
  face(c, 4.6, -31.2 + bob, 0.86, 'mean');
  E(c, 12.5, -14 + bob, 10.4, 11.4); P(c, '#a8693c'); E(c, 12.5, -14 + bob, 7.6, 8.6); c.strokeStyle = '#7d4a26'; c.lineWidth = 1.2; c.stroke();
  c.strokeStyle = '#8d94a6'; c.lineWidth = 2; E(c, 12.5, -14 + bob, 9.3, 10.3); c.stroke(); E(c, 12.5, -14 + bob, 10.4, 11.4); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke();
  E(c, 12.5, -14 + bob, 3.2, 3.5); P(c, '#c9cfdb', 1.3);
}
/** Spitter: a straw-hat archer in a green robe. Frame 4 is the drawn-bow tell before a shot. */
export function drawArcher(c: Ctx, f: number, elite: boolean) {
  const aim = f === 4, step = aim ? 0 : STEP[f & 3], bob = aim ? -0.6 : BOB[f & 3];
  if (elite) backBanner(c, -5, -14 + bob, step * 0.9, '#2f8f4e');
  R(c, -10.5, -19 + bob, 4.6, 11, 2); P(c, '#8a5a36', 1.3); stick(c, -9.4, -19 + bob, -10.6, -23.5 + bob, 0.9, C.cream, 0.8); stick(c, -7.4, -19 + bob, -7.2, -24 + bob, 0.9, C.cream, 0.8);
  feet(c, step, '#3d2f25', 3);
  L(c, [-5.6, -15.5 + bob, 5.6, -15.5 + bob, 8.2, -2.6, -8.2, -2.6]); P(c, '#3fa565');
  c.fillStyle = '#2f8750'; L(c, [-7.6, -5.6, 7.6, -5.6, 8.2, -2.6, -8.2, -2.6]); c.fill();
  R(c, -6.6, -10.4 + bob, 13.2, 2.4, 1.1); P(c, '#f3e2a8', 1.1);
  E(c, 0.8, -21.4 + bob, 9.2, 8.4); P(c, C.skin);
  face(c, 3.6, -19.6 + bob, 0.95, 'calm');
  c.beginPath(); c.moveTo(1.2, -37.5 + bob); c.quadraticCurveTo(9, -31 + bob, 15, -25.6 + bob); c.quadraticCurveTo(1, -21.6 + bob, -13, -25.6 + bob); c.quadraticCurveTo(-6.6, -31 + bob, 1.2, -37.5 + bob); c.closePath(); P(c, '#f1d27a');
  c.strokeStyle = '#c9a54c'; c.lineWidth = 1; c.beginPath(); c.moveTo(1.2, -36 + bob); c.lineTo(-6, -25.4 + bob); c.moveTo(1.2, -36 + bob); c.lineTo(1.6, -24.4 + bob); c.moveTo(1.2, -36 + bob); c.lineTo(8.6, -25.6 + bob); c.stroke();
  const bx = aim ? 11.5 : 10.5, by = -13.5 + bob;
  c.strokeStyle = INK; c.lineWidth = 4; c.beginPath(); c.arc(bx - 6, by, 10.5, -1.05, 1.05); c.stroke(); c.strokeStyle = '#a8693c'; c.lineWidth = 1.8; c.stroke();
  const sx = bx - 6 + Math.cos(1.05) * 10.5, sy = Math.sin(1.05) * 10.5, pull = aim ? bx - 9 : sx;
  c.strokeStyle = C.cream; c.lineWidth = 0.8; c.beginPath(); c.moveTo(sx, by - sy); c.lineTo(pull, by); c.lineTo(sx, by + sy); c.stroke();
  if (aim) { stick(c, pull, by, bx + 9, by, 1, '#8a5a36', 0.9); L(c, [bx + 12.5, by, bx + 8, by - 2.6, bx + 8, by + 2.6]); P(c, '#ff7a2e', 1.1); E(c, pull + 0.6, by, 2.2, 2.2); P(c, C.skin, 1.2); }
  E(c, bx + 4.4, by, 2.3, 2.3); P(c, C.skin, 1.3);
}
/** Charger: a lancer on a stout war horse. Frames 0-3 trot, 4 rears up (the tell), 5-6 gallop flat out. */
export function drawRider(c: Ctx, f: number, elite: boolean) {
  const rear = f === 4, dash = f >= 5, k = f & 3, bob = rear ? 0 : dash ? (f === 5 ? -1.5 : 0) : BOB[k] * 0.8;
  c.save(); c.scale(0.88, 0.88);
  if (rear) { c.translate(-4, 0); c.rotate(-0.34); }
  const leg = (x: number, swing: number, lift: number) => { stick(c, x, -9 + bob, x + swing, -2.6 - lift, 3, '#8a5632'); E(c, x + swing + 0.4, -1.8 - lift, 2.4, 1.8); P(c, '#3a2418', 1.2); };
  const s = dash ? (f === 5 ? 1 : -1) * 6 : STEP[k] * 2.6;
  leg(-9, -s, dash && f === 5 ? 2.5 : 0); leg(9, s, rear ? 5 : 0);
  c.beginPath(); c.moveTo(-13, -17 + bob); c.quadraticCurveTo(-21 - (dash ? 5 : 0), -17 + bob - (dash ? 3 : 0), -20 - (dash ? 6 : 0), -8 + bob - (dash ? 6 : 0)); c.quadraticCurveTo(-16, -11 + bob, -12, -12 + bob); c.closePath(); P(c, '#3a2418');
  if (elite) backBanner(c, -5, -28 + bob, dash ? 2 : STEP[k] * 0.9, '#b3262b');
  E(c, 0, -14 + bob, 14, 8.4); P(c, '#a8693c');
  leg(-5.5, s, rear ? 0 : dash && f === 6 ? 2.5 : 0); leg(5.5, -s, rear ? 6 : 0);
  c.fillStyle = '#c98a55'; c.beginPath(); c.ellipse(-1, -17 + bob, 10, 3.6, 0, Math.PI, TAU); c.fill();
  L(c, [7, -20 + bob, 14.5, -31 + bob, 21, -27 + bob, 13, -11 + bob]); P(c, '#a8693c');
  E(c, 20, -28 + bob, 6.6, 4.6, 0.5); P(c, '#a8693c'); E(c, 23.6, -25.6 + bob, 3.2, 2.6, 0.5); P(c, '#d9a877', 1.2);
  L(c, [14.5, -32 + bob, 15.6, -37 + bob, 18.2, -32.4 + bob]); P(c, '#a8693c', 1.2);
  c.beginPath(); c.moveTo(8, -21 + bob); c.quadraticCurveTo(9, -29 + bob, 15, -33 + bob); c.quadraticCurveTo(12.5, -26 + bob, 11, -19 + bob); c.closePath(); P(c, '#3a2418', 1.2);
  c.fillStyle = INK; E(c, 20.4, -29.4 + bob, 1.1, 1.5); c.fill();
  c.strokeStyle = C.red; c.lineWidth = 1.2; c.beginPath(); c.moveTo(16.5, -24 + bob); c.lineTo(22.6, -30 + bob); c.stroke();
  R(c, -6.5, -22.5 + bob, 12, 6, 2.4); P(c, C.red, 1.3);
  // the rider
  E(c, 0.5, -17 + bob, 3, 2.3); P(c, '#3a2418', 1.2);
  R(c, -5.6, -33.5 + bob, 11.2, 12.4, 4.4); P(c, '#d8423a'); R(c, -5.8, -27 + bob, 11.6, 2.2, 1); P(c, C.gold, 1.1);
  E(c, 0.6, -39.4 + bob, 8, 7.4); P(c, C.skin);
  cap(c, 0.6, -39.4 + bob, 8.3, 7.7, 0.36, '#b8c0cc');
  c.beginPath(); c.moveTo(-1, -47 + bob); c.quadraticCurveTo(-9, -52 + bob, -12.5, -45 + bob); c.quadraticCurveTo(-7, -47 + bob, -2.2, -44.8 + bob); c.closePath(); P(c, '#ffffff', 1.2);
  face(c, 3, -37.8 + bob, 0.82, 'angry');
  const tilt = dash || rear ? 0.05 : -0.62;
  c.save(); c.translate(7, -27 + bob); c.rotate(tilt); stick(c, -13, 0, 22, 0, 1.5, '#8a5a36'); L(c, [30, 0, 22, -2.8, 22, 2.8]); P(c, C.steel, 1.3); L(c, [21, -1, 16, -4.6, 17, 0]); P(c, C.red, 1.1); c.restore();
  E(c, 7, -27 + bob, 2.3, 2.3); P(c, C.skin, 1.3);
  c.restore();
}

// ---- hero and warlord (drawn live into a small buffer each frame) ------------------------------------------------------------
/** The hero: an original chibi spear general - silver armour, jade sash, red cape and helmet tassel. */
export function drawHero(c: Ctx, t: number, moving: boolean, reduced: boolean, thrust = 0) {
  const run = moving && !reduced, ph = t * 12;
  const step = run ? Math.sin(ph) : 0, bob = run ? -Math.abs(Math.cos(ph)) * 1.7 : reduced ? 0 : Math.sin(t * 2.6) * 0.7;
  const sway = reduced ? 0 : Math.sin(t * 3.3), flow = run ? 6 : 1.5;
  c.save(); if (run) c.rotate(0.09);
  // cape
  c.beginPath(); c.moveTo(-3, -17.5 + bob); c.quadraticCurveTo(-10 - flow, -17 + bob + sway * 0.8, -13.5 - flow * 1.4, -5 + sway * 1.6 + bob * 0.4 - flow * 0.5);
  c.quadraticCurveTo(-9.5 - flow * 0.6, -6.4 - flow * 0.2, -7 - flow * 0.3, -3 - flow * 0.2); c.quadraticCurveTo(-3.5, -7, 3, -6 + bob); c.closePath(); P(c, '#e23c3a');
  c.strokeStyle = '#b3262b'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-5, -14.5 + bob); c.quadraticCurveTo(-9 - flow * 0.8, -11 + bob + sway * 0.6, -10.5 - flow, -6.5 + sway - flow * 0.3); c.stroke();
  feet(c, step, '#3b3350');
  // armour
  R(c, -6.9, -16 + bob, 13.8, 12.8, 5.2); P(c, '#f4f6f9');
  c.fillStyle = '#cfd8e3'; R(c, -6, -7 + bob, 12, 3.2, 1.6); c.fill();
  L(c, [-5.5, -8 + bob, -0.6, -8 + bob, -1.2, -3.6 + bob, -5.9, -4.4 + bob]); P(c, C.jade, 1.2); L(c, [0.6, -8 + bob, 5.6, -8 + bob, 5.9, -4.4 + bob, 1.2, -3.6 + bob]); P(c, C.jade, 1.2);
  R(c, -7.1, -9.8 + bob, 14.2, 2.8, 1.3); P(c, C.jade, 1.2); E(c, 1.4, -8.4 + bob, 1.7, 1.7); P(c, C.gold, 1.1);
  c.strokeStyle = '#b9c4d2'; c.lineWidth = 1; c.beginPath(); c.moveTo(-3.6, -13.6 + bob); c.lineTo(4.6, -13.6 + bob); c.moveTo(-3, -11.6 + bob); c.lineTo(4, -11.6 + bob); c.stroke();
  E(c, -5.2, -14.6 + bob, 3.5, 2.7, -0.3); P(c, C.gold, 1.3);
  // head and helmet
  E(c, 0.8, -23.2 + bob, 9.8, 9); P(c, C.skin);
  c.fillStyle = '#4a2f2a'; c.beginPath(); c.ellipse(0.8, -23.2 + bob, 9.6, 8.8, 0, Math.PI * 0.72, Math.PI * 1.28); c.fill();
  cap(c, 0.8, -23.2 + bob, 10.1, 9.3, 0.3, '#eef2f6');
  c.fillStyle = '#cfd8e3'; c.beginPath(); c.ellipse(0.8, -23.2 + bob, 9.4, 8.6, 0, Math.PI * 1.12, Math.PI * 1.5); c.lineTo(-3, -27 + bob); c.closePath(); c.fill();
  c.strokeStyle = C.gold; c.lineWidth = 2; c.beginPath(); c.moveTo(-8.2, -26.3 + bob); c.quadraticCurveTo(1.4, -24.2 + bob, 10.1, -26.4 + bob); c.stroke();
  c.strokeStyle = INK; c.lineWidth = 1; c.beginPath(); c.moveTo(-8.4, -25.2 + bob); c.quadraticCurveTo(1.4, -23.1 + bob, 10.2, -25.3 + bob); c.stroke();
  L(c, [3.6, -27.6 + bob, 5.4, -25.4 + bob, 3.6, -23.4 + bob, 1.8, -25.4 + bob]); P(c, C.jade, 1.1);
  E(c, 0.8, -32.6 + bob, 2.1, 1.9); P(c, C.gold, 1.2);
  c.beginPath(); c.moveTo(0.2, -34 + bob); c.quadraticCurveTo(-1.5, -41 + bob, -8 - flow * 0.7, -39.5 + bob + sway); c.quadraticCurveTo(-11 - flow, -36.5 + bob + sway * 1.4, -9.5 - flow, -33 + bob + sway * 1.4);
  c.quadraticCurveTo(-6, -36.4 + bob + sway, 1.6, -33.8 + bob); c.closePath(); P(c, '#f0463f');
  face(c, 3.9, -20.6 + bob, 1.02, 'hero');
  // spear, with a short jab whenever a volley leaves
  const jab = thrust * 5;
  c.save(); c.translate(10.4 + jab * 0.5, -11 + bob - jab); c.rotate(0.09 + thrust * 0.25);
  stick(c, 0, 12, 0, -22, 1.6, '#7a3b2a');
  L(c, [0, -33.5, 3.1, -26.4, 0, -22, -3.1, -26.4]); P(c, '#f7fbff', 1.3);
  c.strokeStyle = '#b9c4d2'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(0, -32); c.lineTo(0, -23.4); c.stroke();
  c.beginPath(); c.moveTo(-1.6, -21.6); c.quadraticCurveTo(-5.6 - sway, -19.6, -4.4 - sway * 1.2, -15); c.quadraticCurveTo(-1.5, -18.2, 1.6, -21.6); c.closePath(); P(c, '#f0463f', 1.2);
  R(c, -1.9, -22.6, 3.8, 2, 0.8); P(c, C.gold, 1);
  c.restore();
  E(c, 10.5 + jab * 0.5, -10.4 + bob - jab, 2.5, 2.5); P(c, C.skin, 1.3);
  c.restore();
}
/** The Warden, re-imagined as a towering warlord with a wolf-tooth mace. `mode` 1 = winding up a charge, 2 = charging. */
export function drawWarlord(c: Ctx, t: number, mode: number, reduced: boolean) {
  const live = reduced ? 0 : 1, breathe = Math.sin(t * 2.2) * 1.2 * live, step = mode === 2 ? Math.sin(t * 22) * live : Math.sin(t * 4.4) * live, sway = Math.sin(t * 2.8) * live;
  const bob = breathe - (mode === 1 ? -4 : 0);
  c.save(); if (mode === 2) c.rotate(0.16); else if (mode === 1) c.rotate(-0.07);
  // cloak
  c.beginPath(); c.moveTo(-16, -64 + bob); c.quadraticCurveTo(-40, -56 + bob + sway * 2, -50, -10 + sway * 3);
  for (let i = 0; i < 5; i++) c.lineTo(-44 + i * 9, (i % 2 ? -13 : -3) + sway * (2 - i * 0.3)); c.lineTo(8, -16 + bob); c.closePath(); P(c, '#4b2a63', 2);
  c.strokeStyle = C.gold; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-22, -58 + bob); c.quadraticCurveTo(-38, -44 + bob + sway * 2, -44, -14 + sway * 3); c.stroke();
  // boots
  R(c, -19 - step * 3, -13 - Math.max(0, -step) * 3, 15, 13, 5); P(c, '#2b2233', 2); R(c, 3 + step * 3, -13 - Math.max(0, step) * 3, 15, 13, 5); P(c, '#2b2233', 2);
  c.fillStyle = C.gold; R(c, -8.5 - step * 3, -6.5 - Math.max(0, -step) * 3, 4, 5.2, 1.6); c.fill(); R(c, 13.5 + step * 3, -6.5 - Math.max(0, step) * 3, 4, 5.2, 1.6); c.fill();
  // mace arm behind the body
  c.save(); c.translate(27, -42 + bob); c.rotate(0.16 + sway * 0.05 + (mode === 1 ? -0.5 : mode === 2 ? 0.7 : 0));
  stick(c, 0, 26, 0, -40, 3.4, '#5b3a2a', 2);
  for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + 0.2, ca = Math.cos(a), sa = Math.sin(a), bx = ca * 8.5, by = -52 + sa * 13; L(c, [ca * 15.5, -52 + sa * 20, bx - sa * 2.8, by + ca * 2.8, bx + sa * 2.8, by - ca * 2.8]); P(c, C.steel, 1.5); }
  E(c, 0, -52, 9.5, 14); P(c, '#4a4658', 2); c.fillStyle = '#6b6780'; E(c, -3, -55, 3.4, 8); c.fill();
  for (const [dx, dy] of [[2.6, -58], [-2, -49], [3.4, -46]]) { L(c, [dx, dy - 2.6, dx + 2.4, dy + 1.6, dx - 2.4, dy + 1.6]); P(c, C.steel, 1.2); }
  R(c, -4, -40.5, 8, 4, 1.6); P(c, C.gold, 1.5);
  c.restore();
  // body
  R(c, -25, -68 + bob, 50, 53, 17); P(c, '#3a2f4a', 2);
  c.beginPath(); c.ellipse(1, -46 + bob, 17, 15, 0, 0, TAU); P(c, '#b3262b', 1.8);
  c.fillStyle = '#8f1d1d'; c.beginPath(); c.ellipse(1, -42.5 + bob, 15, 11, 0, 0, Math.PI); c.fill();
  for (const [x, y] of [[-9, -51], [11, -51], [1, -56], [-6, -42], [8, -42]]) { E(c, x, y + bob, 1.9, 1.9); c.fillStyle = C.gold; c.fill(); }
  for (let i = 0; i < 3; i++) { R(c, -22 + i * 15.5, -22 + bob * 0.5, 13.5, 13, 3.5); P(c, i === 1 ? '#b3262b' : '#3a2f4a', 1.8); c.fillStyle = C.gold; R(c, -20 + i * 15.5, -12.6 + bob * 0.5, 9.5, 1.8, 0.9); c.fill(); }
  R(c, -25.5, -27 + bob, 51, 7, 3); P(c, '#2b2233', 1.8);
  E(c, 1, -23.5 + bob, 6.4, 5.8); P(c, C.gold, 1.6); L(c, [1, -27 + bob, 4.4, -23.5 + bob, 1, -20 + bob, -2.4, -23.5 + bob]); P(c, '#b3262b', 1.1);
  // pauldrons
  for (const side of [-1, 1]) { const x = side * 24 + 1; E(c, x, -62 + bob, 12.5, 10); P(c, '#b3262b', 2); c.strokeStyle = C.gold; c.lineWidth = 1.8; c.beginPath(); c.ellipse(x, -62 + bob, 9.4, 7, 0, Math.PI * 0.05, Math.PI * 0.95); c.stroke(); L(c, [x + side * 6, -70 + bob, x + side * 17, -78 + bob, x + side * 11.5, -64 + bob]); P(c, C.steel, 1.6); }
  // head
  E(c, 4, -80 + bob, 15, 13.6); P(c, '#e0916a', 2);
  c.beginPath(); c.moveTo(-8.6, -77 + bob); c.quadraticCurveTo(-8, -62 + bob, 6, -58.5 + bob); c.quadraticCurveTo(19, -63 + bob, 18.6, -78 + bob); c.quadraticCurveTo(12, -70.5 + bob, 5.6, -73 + bob); c.quadraticCurveTo(-2, -70.5 + bob, -8.6, -77 + bob); c.closePath(); P(c, '#2b2233', 1.8);
  c.strokeStyle = '#f7e9d6'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(1.5, -68.6 + bob); c.quadraticCurveTo(6, -66.4 + bob, 11.5, -68.8 + bob); c.stroke();
  cap(c, 4, -80 + bob, 15.6, 14.2, 0.2, '#3a3548');
  c.strokeStyle = C.gold; c.lineWidth = 2.4; c.beginPath(); c.moveTo(-10.6, -83.6 + bob); c.quadraticCurveTo(5, -79.6 + bob, 19, -83.8 + bob); c.stroke();
  const glow = mode === 1 ? '#fff3a0' : '#ffd23a';
  L(c, [-3.4, -79.4 + bob, 3.6, -77.2 + bob, 3, -74.6 + bob, -3, -75.6 + bob]); P(c, glow, 1.4); L(c, [16.4, -79.4 + bob, 9.6, -77.2 + bob, 10.2, -74.6 + bob, 16, -75.6 + bob]); P(c, glow, 1.4);
  c.strokeStyle = INK; c.lineWidth = 2.6; c.beginPath(); c.moveTo(-5.6, -82.4 + bob); c.lineTo(4.4, -78.4 + bob); c.moveTo(18.6, -82.4 + bob); c.lineTo(8.8, -78.4 + bob); c.stroke();
  // crest and plume
  c.beginPath(); c.moveTo(4, -90 + bob); c.quadraticCurveTo(-7, -93 + bob, -13, -108 + bob); c.quadraticCurveTo(-3, -100 + bob, 4, -98.5 + bob); c.quadraticCurveTo(11, -100 + bob, 21, -108 + bob); c.quadraticCurveTo(15, -93 + bob, 4, -90 + bob); c.closePath(); P(c, C.gold, 1.8);
  c.beginPath(); c.moveTo(2, -95 + bob); c.quadraticCurveTo(-4, -112 + bob, -22, -108 + bob + sway * 2); c.quadraticCurveTo(-34, -102 + bob + sway * 3, -34, -88 + bob + sway * 3); c.quadraticCurveTo(-24, -98 + bob + sway * 2, 6, -94 + bob); c.closePath(); P(c, '#e23c3a', 1.8);
  E(c, 4, -93.4 + bob, 3.4, 3); P(c, '#b3262b', 1.5);
  // gauntlet over the shaft
  E(c, 28, -40 + bob, 6.4, 6); P(c, '#2b2233', 1.8); c.fillStyle = C.gold; E(c, 28, -40 + bob, 2.4, 2.2); c.fill();
  c.restore();
}

// ---- pickups and projectiles --------------------------------------------------------------------------------------------------
export function drawJade(c: Ctx) { E(c, 0, 0, 5, 5); P(c, '#3fe2b4', 1.3); c.fillStyle = '#b8ffe6'; c.beginPath(); c.ellipse(-1.2, -1.6, 2.6, 1.7, -0.6, 0, TAU); c.fill(); E(c, 0, 0, 1.5, 1.5); P(c, '#1f8f6e', 1); }
export function drawCoin(c: Ctx) { E(c, 0, 0, 6.2, 6.2); P(c, '#ffc94a', 1.4); c.strokeStyle = '#c98a1e'; c.lineWidth = 1; E(c, 0, 0, 4.6, 4.6); c.stroke(); R(c, -1.7, -1.7, 3.4, 3.4, 0.4); P(c, '#8a5a12', 1); c.fillStyle = '#fff3c0'; c.beginPath(); c.ellipse(-2.6, -3, 1.8, 1, -0.7, 0, TAU); c.fill(); }
export function drawIngot(c: Ctx) {
  c.beginPath(); c.moveTo(-9, -2.4); c.quadraticCurveTo(-6, 0.4, -4.4, -1.6); c.quadraticCurveTo(0, -3.4, 4.4, -1.6); c.quadraticCurveTo(6, 0.4, 9, -2.4); c.quadraticCurveTo(8, 5.6, 0, 5.6); c.quadraticCurveTo(-8, 5.6, -9, -2.4); c.closePath(); P(c, '#ffc94a', 1.5);
  c.beginPath(); c.ellipse(0, -2.2, 4.6, 4, 0, Math.PI, TAU); c.closePath(); P(c, '#ffe28a', 1.4);
  c.fillStyle = '#e09a22'; c.beginPath(); c.ellipse(0, 3.2, 6, 1.6, 0, 0, Math.PI); c.fill(); c.fillStyle = '#fff8d8'; c.beginPath(); c.ellipse(-1.6, -4, 1.6, 0.9, -0.4, 0, TAU); c.fill();
}
export function drawPeach(c: Ctx) {
  c.beginPath(); c.moveTo(0, -7.6); c.bezierCurveTo(8.6, -7.4, 9.6, 3, 0, 7.6); c.bezierCurveTo(-9.6, 3, -8.6, -7.4, 0, -7.6); c.closePath(); P(c, '#ffb3a0', 1.5);
  c.fillStyle = '#ff7f8f'; c.beginPath(); c.moveTo(0, -7); c.bezierCurveTo(7.6, -6.6, 8.4, 2.6, 0, 6.8); c.bezierCurveTo(3.6, 2, 3.6, -3, 0, -7); c.fill();
  c.fillStyle = '#fff1e4'; c.beginPath(); c.ellipse(-3.4, -2.6, 1.7, 2.5, 0.5, 0, TAU); c.fill();
  c.beginPath(); c.moveTo(0.4, -7); c.quadraticCurveTo(5, -12.5, 9, -8.6); c.quadraticCurveTo(5, -5.6, 0.4, -7); c.closePath(); P(c, '#6ccf5c', 1.2);
}
export function drawTalisman(c: Ctx) {
  c.save(); c.rotate(-0.16); R(c, -4.6, -8.6, 9.2, 17.2, 1.4); P(c, '#ffe27a', 1.4);
  c.strokeStyle = C.red; c.lineWidth = 1.3; c.beginPath(); c.moveTo(-2.4, -6); c.lineTo(2.4, -6); c.moveTo(0, -6); c.lineTo(0, -2.6); c.moveTo(-2.4, -2.6); c.lineTo(2.4, -2.6); c.lineTo(-2.2, 1); c.lineTo(2.2, 1); c.lineTo(-1.8, 4.4); c.quadraticCurveTo(1.6, 3.6, 2.4, 6.2); c.stroke(); c.restore();
}
/** Thrown spear, tip at the origin, flying right. */
export function drawSpear(c: Ctx, storm: boolean) {
  stick(c, -19, 0, -5, 0, 1.5, storm ? '#c98a1e' : '#8a5a36', 1.2);
  L(c, [1.5, 0, -6, -3.3, -4, 0, -6, 3.3]); P(c, storm ? '#fff3a0' : '#f7fbff', 1.2);
  L(c, [-6, -1.2, -11, -3.6, -9.4, 0, -11, 3.6, -6, 1.2]); P(c, storm ? '#6fd3ff' : C.red, 1);
}
/** Crescent blade, centred on the origin, cutting edge facing up. */
export function drawCrescent(c: Ctx, halo: boolean) {
  c.beginPath(); c.moveTo(-14, 4); c.quadraticCurveTo(0, -17, 14, 4); c.quadraticCurveTo(0, -4.5, -14, 4); c.closePath(); P(c, halo ? '#ffb02e' : '#f4f8fc', 1.5);
  c.beginPath(); c.moveTo(-11, 2.4); c.quadraticCurveTo(0, -7.4, 11, 2.4); c.quadraticCurveTo(0, -3.6, -11, 2.4); c.closePath(); c.fillStyle = halo ? '#e2433a' : '#9fb4cc'; c.fill();
  c.fillStyle = halo ? '#fff3a0' : '#ffffff'; c.beginPath(); c.ellipse(-4.6, -6, 3.4, 1.1, -0.72, 0, TAU); c.fill();
  E(c, 0, -1.4, 1.9, 1.9); P(c, C.gold, 1.1);
}
/** Enemy arrow, tip at the origin, flying right. */
export function drawArrow(c: Ctx, fire: boolean) {
  stick(c, -15, 0, -3, 0, 1.2, '#7a4a2c', 1.1);
  L(c, [-12, 0, -17, -3.4, -14, 0, -17, 3.4]); P(c, fire ? '#ffd23a' : '#ff5a4f', 1);
  L(c, [2, 0, -4, -3, -3, 0, -4, 3]); P(c, fire ? '#ff7a2e' : '#fff3d6', 1.1);
}
export function drawFireball(c: Ctx) {
  c.beginPath(); c.moveTo(7, 0); c.bezierCurveTo(7, 5.4, 1, 7.4, -3, 5.6); c.quadraticCurveTo(-9, 5, -15, 0.6); c.quadraticCurveTo(-9, 1, -8, -1.6); c.quadraticCurveTo(-11, -3.4, -12.6, -6.4); c.quadraticCurveTo(-6, -4, -3, -5.8); c.bezierCurveTo(1, -7.4, 7, -5.4, 7, 0); c.closePath(); P(c, '#ff5a2e', 1.5, '#7a1410');
  E(c, 1.2, 0, 4.6, 4.4); c.fillStyle = '#ffb02e'; c.fill(); E(c, 2, 0, 2.5, 2.4); c.fillStyle = '#fff3a0'; c.fill();
}
/** Dragon lance beam: a 260-long flame with a dragon head at the tip, drawn along +x and centred on y = 0. */
export function drawDragonBeam(c: Ctx, azure: boolean) {
  const outer = azure ? '#2f8fe0' : '#ff7a2e', mid = azure ? '#7fe0ff' : '#ffc94a', dark = azure ? '#15407a' : '#8f1d1d';
  c.beginPath(); c.moveTo(0, 0);
  for (let i = 0; i <= 22; i++) { const x = i * 10, w = 5 + Math.min(1, x / 60) * 6 + (i % 2 ? 3 : 0); c.lineTo(x, -w); }
  c.lineTo(226, -9); c.lineTo(226, 9);
  for (let i = 22; i >= 0; i--) { const x = i * 10, w = 5 + Math.min(1, x / 60) * 6 + (i % 2 ? 0 : 3); c.lineTo(x, w); }
  c.closePath(); P(c, outer, 1.6, dark);
  c.beginPath(); c.moveTo(4, 0); c.lineTo(40, -5); c.lineTo(228, -5); c.lineTo(228, 5); c.lineTo(40, 5); c.closePath(); c.fillStyle = mid; c.fill();
  c.beginPath(); c.moveTo(14, 0); c.lineTo(50, -2); c.lineTo(228, -2); c.lineTo(228, 2); c.lineTo(50, 2); c.closePath(); c.fillStyle = '#ffffff'; c.fill();
  // dragon head
  L(c, [224, -8, 214, -18, 226, -13]); P(c, mid, 1.4, dark); L(c, [224, 8, 214, 18, 226, 13]); P(c, mid, 1.4, dark);
  c.beginPath(); c.moveTo(220, -10); c.quadraticCurveTo(240, -13, 252, -6); c.quadraticCurveTo(262, -3, 260, 0); c.quadraticCurveTo(262, 3, 252, 6); c.quadraticCurveTo(240, 13, 220, 10); c.closePath(); P(c, outer, 1.6, dark);
  c.fillStyle = mid; c.beginPath(); c.ellipse(246, 0, 10, 4.2, 0, 0, TAU); c.fill();
  E(c, 238, -5.4, 2.6, 2); P(c, '#ffffff', 1, dark); E(c, 238, 5.4, 2.6, 2); P(c, '#ffffff', 1, dark); c.fillStyle = dark; E(c, 238.8, -5.4, 1, 1); c.fill(); E(c, 238.8, 5.4, 1, 1); c.fill();
  c.strokeStyle = mid; c.lineWidth = 1.4; c.beginPath(); c.moveTo(256, -3); c.quadraticCurveTo(262, -10, 254, -14); c.moveTo(256, 3); c.quadraticCurveTo(262, 10, 254, 14); c.stroke();
}
/** Cartoon burst used for impacts and explosions; radius 1. */
export function drawBurst(c: Ctx, outer: string, inner: string, edge: string) {
  star(c, 0, 0, 1, 0.62, 9, 0.3); c.fillStyle = outer; c.fill(); c.lineWidth = 0.07; c.strokeStyle = edge; c.stroke();
  star(c, 0, 0, 0.66, 0.4, 9, 0.65); c.fillStyle = inner; c.fill(); E(c, 0, 0, 0.27, 0.27); c.fillStyle = '#ffffff'; c.fill();
}
export function drawPuff(c: Ctx, color: string, shade: string) {
  c.fillStyle = shade; E(c, 0, 0.12, 0.92, 0.82); c.fill(); c.fillStyle = color; E(c, -0.3, -0.05, 0.62, 0.6); c.fill(); E(c, 0.34, -0.12, 0.56, 0.54); c.fill(); E(c, 0.02, -0.36, 0.5, 0.46); c.fill();
}

// ---- icons ------------------------------------------------------------------------------------------------------------------------
/** Weapon, passive and bonus icons, drawn as small coloured illustrations inside a box of half-size `s`. */
export function drawIcon(c: Ctx, key: string, x: number, y: number, s: number, color: string) {
  c.save(); c.translate(x, y); c.scale(s / 10, s / 10); c.lineJoin = 'round'; c.lineCap = 'round';
  switch (key) {
    case 'bolt': c.rotate(-Math.PI / 4); c.translate(9, 0); c.scale(0.92, 0.92); drawSpear(c, false); break;
    case 'blades': c.rotate(-0.5); c.translate(0, 3); c.scale(0.72, 0.72); drawCrescent(c, false); break;
    case 'pulse':
      c.strokeStyle = color; c.lineWidth = 1.4; c.beginPath(); c.arc(0, 0, 10, -2.3, -0.84); c.stroke(); c.beginPath(); c.arc(0, 0, 10, 0.84, 2.3); c.stroke();
      R(c, -6.4, -4.6, 12.8, 9.6, 2.4); P(c, C.red, 1.4); E(c, 0, -4.6, 6.4, 2.6); P(c, C.cream, 1.4); E(c, 0, 5, 6.4, 2.2); c.fillStyle = '#8f1d1d'; c.fill();
      c.fillStyle = C.gold; for (const dx of [-4.4, 0, 4.4]) { E(c, dx, 1.2, 0.9, 0.9); c.fill(); } stick(c, 3, -9.6, 0.6, -5, 1.1, C.woodLight, 0.9); break;
    case 'lance': c.rotate(-Math.PI / 4); stick(c, -11, 0, -2, 0, 1.6, '#8a5a36', 1.2); c.beginPath(); c.moveTo(11.5, 0); c.quadraticCurveTo(4, -6.6, -4.4, -4.8); c.lineTo(-1.6, -1.8); c.lineTo(-6.4, 0); c.lineTo(-1.6, 1.8); c.lineTo(-4.4, 4.8); c.quadraticCurveTo(4, 6.6, 11.5, 0); c.closePath(); P(c, '#ff7a2e', 1.4); L(c, [9, 0, 2, -2.5, -0.4, 0, 2, 2.5]); c.fillStyle = '#ffe27a'; c.fill(); break;
    case 'meteor': c.rotate(Math.PI * 0.72); c.translate(7, 0); drawArrow(c, true); c.translate(1, 0); c.beginPath(); c.moveTo(-2, 0); c.quadraticCurveTo(2, -5, 7, 0); c.quadraticCurveTo(2, 5, -2, 0); c.closePath(); P(c, '#ff7a2e', 1.1); E(c, 2, 0, 2, 1.6); c.fillStyle = '#ffe27a'; c.fill(); break;
    case 'might': L(c, [-1.6, -10, 1.6, -10, 2.6, 2, -2.6, 2]); P(c, C.steel, 1.4); R(c, -5.6, 2, 11.2, 2.6, 1); P(c, C.gold, 1.3); R(c, -1.5, 4.6, 3, 5, 1); P(c, color, 1.3); break;
    case 'haste': c.beginPath(); c.moveTo(-6, -7); c.lineTo(-0.6, -7); c.lineTo(0, 1); c.quadraticCurveTo(8, 1.4, 8.6, 6.6); c.lineTo(-6, 6.6); c.closePath(); P(c, color, 1.4); R(c, -6.6, 5.6, 15.6, 2.6, 1.2); P(c, C.wood, 1.2); L(c, [-7, -3, -11, -5.6, -7, 0]); P(c, C.cream, 1.1); L(c, [-7, 0.6, -10.4, -0.6, -7, 3.2]); P(c, C.cream, 1.1); break;
    case 'vitality': c.scale(1.1, 1.1); c.translate(0, 1.4); drawPeach(c); break;
    case 'magnet': c.scale(1.02, 1.02); drawTalisman(c); break;
    case 'quick': c.beginPath(); c.moveTo(0, 7.6); c.lineTo(-9.6, -2.4); c.quadraticCurveTo(0, -11.6, 9.6, -2.4); c.closePath(); P(c, color, 1.4); c.strokeStyle = INK; c.lineWidth = 1; c.beginPath(); for (const dx of [-5, 0, 5]) { c.moveTo(0, 7.6); c.lineTo(dx, -6.6 + Math.abs(dx) * 0.42); } c.stroke(); E(c, 0, 7.6, 1.6, 1.6); P(c, C.gold, 1.1); break;
    case 'regen': E(c, 0, 3.6, 6.4, 5.8); P(c, color, 1.4); E(c, 0, -3.8, 3.8, 3.6); P(c, color, 1.4); R(c, -1.5, -9.6, 3, 2.8, 0.8); P(c, C.woodLight, 1.1); c.strokeStyle = C.red; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-3.6, -0.6); c.lineTo(3.6, -0.6); c.stroke(); c.fillStyle = '#ffffffaa'; E(c, -2.6, 2.4, 1.3, 2.2, 0.3); c.fill(); break;
    case 'heal': c.scale(1.02, 1.02); c.translate(0, 1.4); drawPeach(c); c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -3); c.lineTo(0, 3.4); c.moveTo(-3.2, 0.2); c.lineTo(3.2, 0.2); c.stroke(); break;
    case 'swords': for (const side of [-1, 1]) { c.save(); c.rotate(side * 0.72); L(c, [-1.3, -10, 1.3, -10, 1.7, 3, -1.7, 3]); P(c, C.steel, 1.3); R(c, -3.8, 3, 7.6, 2, 0.8); P(c, C.gold, 1.1); R(c, -1.1, 5, 2.2, 4, 0.8); P(c, C.wood, 1.1); c.restore(); } break;
    case 'helm': E(c, 0, 1, 8, 7.6); P(c, '#3a3548', 1.4); c.beginPath(); c.moveTo(0, -5); c.quadraticCurveTo(-5, -6.4, -8.6, -11); c.quadraticCurveTo(-2, -9, 0, -8.6); c.quadraticCurveTo(2, -9, 8.6, -11); c.quadraticCurveTo(5, -6.4, 0, -5); c.closePath(); P(c, C.gold, 1.2); L(c, [-5.4, 0.6, -1, 2, -1.4, 3.8, -5, 3.2]); c.fillStyle = '#ffd23a'; c.fill(); L(c, [5.4, 0.6, 1, 2, 1.4, 3.8, 5, 3.2]); c.fill(); break;
    default: c.scale(1.02, 1.02); drawIngot(c);
  }
  c.restore();
}
