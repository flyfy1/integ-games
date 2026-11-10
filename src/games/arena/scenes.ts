/**
 * Pocket Survivor battlegrounds. Each scene is a seamless painted ground tile plus decals and props that are placed
 * from world coordinates by an integer hash, so the endless field never needs storage and never touches the
 * simulation's random stream. Ground art deliberately has no ink outlines so the outlined cast pops against it.
 */
import { bake, blob, canvasOf, E, L, mulberry, R, star, TAU, type Ctx, type Sprite } from './art';

export type Glow = { x: number; y: number; r: number; warm: boolean };
export type Prop = Sprite & { glow?: Glow };
export type Scene = {
  id: string; name: string; tile: HTMLCanvasElement | null; patches: Prop[]; small: Prop[]; big: Prop[];
  mote: 'leaf' | 'petal' | 'ember' | 'maple'; vignette: string; shade: number;
};
export const TILE = 256;
/** Scene order: the run walks from the bamboo grove to the fortress, where the warlord waits. */
export const SCENE_SECONDS = 72;
export function sceneIndex(time: number, won: boolean, wonAt: number) { return won ? (4 + Math.floor((time - wonAt) / 75)) % 4 : Math.min(3, Math.floor(time / SCENE_SECONDS)); }

export const hash = (x: number, y: number, salt: number) => { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(salt, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };

const Q = (c: Ctx, fill: string, edge = '', lw = 1.2) => { c.fillStyle = fill; c.fill(); if (edge) { c.strokeStyle = edge; c.lineWidth = lw; c.stroke(); } };
const pole = (c: Ctx, x1: number, y1: number, x2: number, y2: number, w: number, color: string, edge: string) => { c.lineCap = 'round'; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.strokeStyle = edge; c.lineWidth = w + 2; c.stroke(); c.strokeStyle = color; c.lineWidth = w; c.stroke(); };
const ground = (c: Ctx, w: number, alpha = 0.16) => { c.fillStyle = `rgba(40,25,30,${alpha})`; E(c, 0, 0, w, w * 0.3); c.fill(); };

// ---- seamless base tiles ------------------------------------------------------------------------------------------------------
function wrapped(_c: Ctx, x: number, y: number, reach: number, draw: (x: number, y: number) => void) {
  for (const dx of [-TILE, 0, TILE]) for (const dy of [-TILE, 0, TILE]) { const px = x + dx, py = y + dy; if (px > -reach && px < TILE + reach && py > -reach && py < TILE + reach) draw(px, py); }
}
function paintedTile(res: number, seed: number, base: string, blots: readonly string[], ticks: string, dots: string): HTMLCanvasElement | null {
  const made = canvasOf(TILE * res, TILE * res); if (!made) return null;
  const { el, c } = made, rnd = mulberry(seed); c.scale(res, res);
  c.fillStyle = base; c.fillRect(0, 0, TILE, TILE);
  for (let i = 0; i < 46; i++) { const x = rnd() * TILE, y = rnd() * TILE, rx = 16 + rnd() * 34, ry = rx * (0.45 + rnd() * 0.35), color = blots[i % blots.length], s = Math.floor(rnd() * 1e6); wrapped(c, x, y, 60, (px, py) => { c.globalAlpha = 0.55; blob(c, px, py, rx, ry, 9, 0.22, mulberry(s)); c.fillStyle = color; c.fill(); }); }
  c.globalAlpha = 0.8; c.strokeStyle = ticks; c.lineWidth = 1.1; c.lineCap = 'round';
  for (let i = 0; i < 120; i++) { const x = rnd() * TILE, y = rnd() * TILE, lean = (rnd() - 0.5) * 3; wrapped(c, x, y, 6, (px, py) => { c.beginPath(); c.moveTo(px - 1.8, py); c.lineTo(px - 2.4 + lean, py - 3.6); c.moveTo(px + 1.4, py); c.lineTo(px + 2 + lean, py - 4.4); c.stroke(); }); }
  c.globalAlpha = 0.7; c.fillStyle = dots;
  for (let i = 0; i < 70; i++) { const x = rnd() * TILE, y = rnd() * TILE, r = 0.8 + rnd() * 1.2; wrapped(c, x, y, 3, (px, py) => { E(c, px, py, r * 1.3, r); c.fill(); }); }
  c.globalAlpha = 1;
  return el;
}
function stoneTile(res: number): HTMLCanvasElement | null {
  const made = canvasOf(TILE * res, TILE * res); if (!made) return null;
  const { el, c } = made, rnd = mulberry(77); c.scale(res, res);
  c.fillStyle = '#948a80'; c.fillRect(0, 0, TILE, TILE);
  const slab = 64, tones = ['#cfc6b4', '#c6bca9', '#d6cdbb', '#c0b6a4', '#cbc1ae'];
  for (let row = 0; row < 4; row++) for (let col = -1; col < 4; col++) {
    const x = col * slab + (row % 2 ? 32 : 0), y = row * slab, tone = tones[Math.floor(rnd() * tones.length)];
    for (const dx of [0, TILE]) { R(c, x + dx + 1.2, y + 1.2, slab - 2.4, slab - 2.4, 3); c.fillStyle = tone; c.fill(); c.fillStyle = 'rgba(255,255,255,0.22)'; R(c, x + dx + 2.4, y + 2.4, slab - 4.8, 3, 1.5); c.fill(); c.fillStyle = 'rgba(70,50,50,0.13)'; R(c, x + dx + 2.4, y + slab - 5.6, slab - 4.8, 3, 1.5); c.fill(); }
  }
  c.globalAlpha = 0.35;
  for (let i = 0; i < 26; i++) { const x = rnd() * TILE, y = rnd() * TILE, rx = 6 + rnd() * 14, s = Math.floor(rnd() * 1e6); wrapped(c, x, y, 24, (px, py) => { blob(c, px, py, rx, rx * 0.6, 7, 0.3, mulberry(s)); c.fillStyle = i % 2 ? '#b3a996' : '#ddd5c4'; c.fill(); }); }
  c.globalAlpha = 0.5; c.strokeStyle = '#857b70'; c.lineWidth = 0.9;
  for (let i = 0; i < 9; i++) { let x = rnd() * TILE, y = rnd() * TILE; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 3; k++) { x += (rnd() - 0.5) * 16; y += 3 + rnd() * 7; c.lineTo(x, y); } c.stroke(); }
  c.globalAlpha = 1;
  return el;
}

// ---- props (origin at the base centre) ---------------------------------------------------------------------------------------------
const tuft = (blade: string, tip: string) => (c: Ctx) => { c.lineCap = 'round'; for (const [x, lean, h] of [[-4, -3, 7], [-1, -0.5, 10], [2.6, 2, 8], [5, 4.4, 5.6]]) { c.beginPath(); c.moveTo(x, 0); c.quadraticCurveTo(x + lean * 0.3, -h * 0.6, x + lean, -h); c.strokeStyle = blade; c.lineWidth = 2.2; c.stroke(); } c.fillStyle = tip; E(c, -1.4, -9.6, 0.9, 0.9); c.fill(); };
const flowers = (petal: string, heart: string) => (c: Ctx) => { for (const [x, y, s] of [[-6, -3, 1], [3, -6, 1.15], [7, 0, 0.85]]) { c.fillStyle = petal; for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; E(c, x + Math.cos(a) * 1.9 * s, y + Math.sin(a) * 1.9 * s, 1.5 * s, 1.5 * s); c.fill(); } c.fillStyle = heart; E(c, x, y, 1.15 * s, 1.15 * s); c.fill(); } };
const pebbles = (a: string, b: string) => (c: Ctx) => { E(c, -5, -2, 4.4, 2.8); Q(c, a, b, 1); E(c, 3, -1.4, 3, 2); Q(c, a, b, 1); E(c, 0.6, -5, 2.2, 1.5); Q(c, b); c.fillStyle = 'rgba(255,255,255,0.4)'; E(c, -6, -3, 1.8, 0.8); c.fill(); };
const mushrooms = (c: Ctx) => { for (const [x, s] of [[-4, 1], [4.4, 0.72]]) { R(c, x - 1.5 * s, -5 * s, 3 * s, 5 * s, 1.2); Q(c, '#fff3d6', '#c9b58a', 1); c.beginPath(); c.ellipse(x, -5 * s, 5 * s, 4.2 * s, 0, Math.PI, TAU); c.closePath(); Q(c, '#e8533f', '#a8322a', 1); c.fillStyle = '#fff3d6'; E(c, x - 1.8 * s, -7 * s, 1 * s, 0.8 * s); c.fill(); E(c, x + 1.8 * s, -6.4 * s, 0.8 * s, 0.6 * s); c.fill(); } };
const shoot = (c: Ctx) => { L(c, [-4, 0, 0, -12, 4, 0]); Q(c, '#c79a5a', '#8f6a38', 1); L(c, [-3, -2.6, 0, -8.4, 1, -2.6]); Q(c, '#e2bd7c'); L(c, [0.4, -5.4, 2, -9.4, 3, -4]); Q(c, '#a87c44'); };
const stuckArrows = (c: Ctx) => { for (const [x, lean] of [[-3, -4], [4, 3]]) { pole(c, x, 0, x + lean, -12, 1, '#8a5a36', '#5a3a28'); L(c, [x + lean, -14, x + lean - 2.4, -9.4, x + lean + 2.4, -9.6]); Q(c, '#e4483c', '#8f1d1d', 0.8); } };
const hay = (c: Ctx) => { c.lineCap = 'round'; for (let i = 0; i < 7; i++) { const x = -6 + i * 2, lean = (i - 3) * 1.1; c.beginPath(); c.moveTo(x * 0.5, 0); c.lineTo(x + lean, -6 - (i % 3) * 1.6); c.strokeStyle = i % 2 ? '#e8c36a' : '#c99f4a'; c.lineWidth = 1.6; c.stroke(); } };
const brokenShield = (c: Ctx) => { c.beginPath(); c.ellipse(0, -3, 7.6, 5, 0.1, Math.PI * 0.1, Math.PI * 1.25); c.closePath(); Q(c, '#a8693c', '#6b4630', 1.1); E(c, -1, -3.2, 1.8, 1.3); Q(c, '#b9bfce', '#7d8598', 0.8); };
const maple = (c: Ctx) => { for (const [x, y, r, color, rot] of [[-6, -2, 3.4, '#e8533f', 0.3], [2, -5, 3, '#f08a2e', 1.1], [7, -1, 2.6, '#d8342c', 2], [-1, 0, 2.4, '#f2b03a', 0.7]] as const) { star(c, x, y, r, r * 0.45, 5, rot); c.fillStyle = color; c.fill(); } };
const crack = (c: Ctx) => { c.strokeStyle = 'rgba(90,75,70,0.55)'; c.lineWidth = 1; L(c, [-9, -6, -3, -3, -4, 1, 3, 3, 8, 0], false); c.stroke(); L(c, [-3, -3, 1, -7], false); c.stroke(); };
const reedsSmall = (c: Ctx) => { c.lineCap = 'round'; for (const [x, lean, h] of [[-3, -2, 13], [1, 1, 16], [4, 3.6, 11]]) { c.beginPath(); c.moveTo(x, 0); c.quadraticCurveTo(x, -h * 0.6, x + lean, -h); c.strokeStyle = '#7fa64e'; c.lineWidth = 1.6; c.stroke(); } };

function bambooClump(c: Ctx) {
  ground(c, 20);
  for (const [x, lean, h, w] of [[-10, -3, 44, 4.4], [8, 4, 50, 5], [-1, 0.6, 58, 5.6]]) {
    pole(c, x, 0, x + lean, -h, w, '#6fba4e', '#3f7f36');
    c.strokeStyle = '#3f7f36'; c.lineWidth = 1.1; for (let y = 10; y < h - 4; y += 11) { const k = y / h; c.beginPath(); c.moveTo(x + lean * k - w / 2, -y); c.lineTo(x + lean * k + w / 2, -y); c.stroke(); }
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1.1; c.beginPath(); c.moveTo(x - w * 0.2, -3); c.lineTo(x + lean - w * 0.2, -h + 3); c.stroke();
    for (const [dx, dy, rot] of [[7, -h + 4, 0.5], [-7, -h + 9, -0.6], [6, -h + 16, 0.2], [-2, -h - 3, -1.3]]) { E(c, x + lean + dx, dy, 6.4, 2.2, rot); Q(c, '#8fd45f', '#4f9a3c', 0.9); }
  }
}
function rock(body: string, edge: string, moss: string) { return (c: Ctx) => { ground(c, 17); blob(c, 0, -8, 15, 9.4, 8, 0.14, mulberry(5)); Q(c, body, edge, 1.4); c.fillStyle = 'rgba(60,40,50,0.16)'; c.beginPath(); c.ellipse(0, -5, 13, 5.4, 0, 0, Math.PI); c.fill(); if (moss) { c.beginPath(); c.ellipse(-2, -13, 9.4, 4, -0.1, Math.PI, TAU); c.closePath(); c.fillStyle = moss; c.fill(); } c.fillStyle = 'rgba(255,255,255,0.4)'; E(c, -6, -11.6, 3.4, 1.4, -0.3); c.fill(); }; }
function log(c: Ctx) { ground(c, 22, 0.14); R(c, -20, -10, 38, 10, 5); Q(c, '#9a6a44', '#5f3f28', 1.4); E(c, 17, -5, 4, 5); Q(c, '#e2c08a', '#5f3f28', 1.3); E(c, 17, -5, 1.8, 2.3); c.strokeStyle = '#b99562'; c.lineWidth = 1; c.stroke(); c.strokeStyle = '#7d5434'; c.lineWidth = 1; c.beginPath(); c.moveTo(-14, -7); c.lineTo(-4, -7); c.moveTo(-9, -3.6); c.lineTo(4, -3.6); c.stroke(); E(c, -8, -10.4, 5, 1.8); c.fillStyle = '#8fd45f'; c.fill(); }
function reeds(c: Ctx) {
  ground(c, 14, 0.12); c.lineCap = 'round';
  for (const [x, lean, h] of [[-8, -5, 26], [-3, -1, 36], [3, 2, 31], [8, 6, 24]]) { c.beginPath(); c.moveTo(x, 0); c.quadraticCurveTo(x, -h * 0.6, x + lean, -h); c.strokeStyle = '#6f9a48'; c.lineWidth = 1.8; c.stroke(); R(c, x + lean - 1.7, -h - 7, 3.4, 9, 1.7); Q(c, '#8a5a36', '#5a3a28', 0.9); }
  for (const [x, lean] of [[-11, -9], [11, 10], [0, -6]]) { c.beginPath(); c.moveTo(x * 0.4, 0); c.quadraticCurveTo(x * 0.7, -12, x + lean * 0.4, -17); c.quadraticCurveTo(x * 0.5, -9, x * 0.4 + 2, 0); c.closePath(); Q(c, '#93c263', '#5f8a40', 0.9); }
}
function post(c: Ctx) { ground(c, 12); pole(c, -9, 0, -9, -22, 3.6, '#9a6a44', '#5f3f28'); pole(c, 9, 0, 9, -18, 3.6, '#9a6a44', '#5f3f28'); c.strokeStyle = '#e2c08a'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-9, -18); c.quadraticCurveTo(0, -9, 9, -14.6); c.stroke(); R(c, -11.6, -20.4, 5.2, 3, 1); Q(c, '#d8342c'); }
function driftwood(c: Ctx) { ground(c, 18, 0.12); c.beginPath(); c.moveTo(-18, -4); c.quadraticCurveTo(-4, -11, 16, -7.6); c.lineTo(19, -4); c.quadraticCurveTo(0, -1, -17, -0.6); c.closePath(); Q(c, '#c9b08a', '#8a7454', 1.2); pole(c, 2, -8, 8, -15, 1.6, '#c9b08a', '#8a7454'); }
function tent(c: Ctx) {
  ground(c, 30, 0.18);
  L(c, [-26, 0, 0, -40, 26, 0]); Q(c, '#f6e9c8', '#a88a5a', 1.6); L(c, [0, -40, 26, 0, 8, 0]); c.fillStyle = '#e6d3a6'; c.fill();
  L(c, [-8, 0, 0, -23, 8, 0]); Q(c, '#5a3a28', '#3a2418', 1.2); L(c, [-8, 0, 0, -23, -2.6, 0]); c.fillStyle = '#7a523a'; c.fill();
  L(c, [-26, 0, -22.4, -5.6, 22.4, -5.6, 26, 0]); c.fillStyle = '#d8342c'; c.fill(); c.fillStyle = '#ffc94a'; for (let x = -18; x <= 18; x += 9) { if (Math.abs(x) > 8) { E(c, x, -2.8, 1.5, 1.5); c.fill(); } }
  L(c, [-26, 0, 0, -40, 26, 0]); c.strokeStyle = '#a88a5a'; c.lineWidth = 1.6; c.stroke();
  pole(c, 0, -40, 0, -50, 1.4, '#8a5a36', '#5a3a28'); L(c, [0.6, -50, 11, -47.4, 0.6, -44]); Q(c, '#d8342c', '#8f1d1d', 1);
}
function flagPole(color: string, dark: string) { return (c: Ctx) => { ground(c, 9); E(c, 0, -1.6, 5.4, 2.8); Q(c, '#b9b7ad', '#85827a', 1); pole(c, 0, -2, 0, -52, 2, '#9a6a44', '#5f3f28'); c.beginPath(); c.moveTo(1, -51); c.quadraticCurveTo(12, -54, 23, -49); c.lineTo(21, -31); c.quadraticCurveTo(11, -35, 1, -32); c.closePath(); Q(c, color, dark, 1.4); c.strokeStyle = '#ffc94a'; c.lineWidth = 1.2; E(c, 11.4, -41.6, 4.6, 4.6); c.stroke(); L(c, [11.4, -45, 14, -39.6, 8.8, -39.6]); c.fillStyle = '#ffc94a'; c.fill(); E(c, 0, -53, 2.2, 2.2); Q(c, '#ffc94a', '#c98a1e', 1); }; }
function campfire(c: Ctx) {
  ground(c, 16, 0.2);
  for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; E(c, Math.cos(a) * 12, -3 + Math.sin(a) * 4.6, 3.2, 2.2); Q(c, '#b9b7ad', '#85827a', 0.9); }
  pole(c, -8, -2, 7, -6, 2.6, '#7a4a2c', '#4a2a1c'); pole(c, 8, -2, -7, -6, 2.6, '#8a5a36', '#4a2a1c');
  c.beginPath(); c.moveTo(0, -25); c.quadraticCurveTo(9, -14, 6.4, -6.4); c.quadraticCurveTo(0, -1.6, -6.4, -6.4); c.quadraticCurveTo(-9.6, -13, -3.4, -17); c.quadraticCurveTo(-3, -21, 0, -25); c.closePath(); Q(c, '#ff7a2e', '#c2401c', 1.3);
  c.beginPath(); c.moveTo(0.6, -17); c.quadraticCurveTo(5, -10.6, 3, -6.6); c.quadraticCurveTo(0, -4, -3, -6.6); c.quadraticCurveTo(-4.4, -11, 0.6, -17); c.closePath(); c.fillStyle = '#ffe27a'; c.fill();
}
function rack(c: Ctx) { ground(c, 20); pole(c, -15, 0, -13, -22, 2.2, '#8a5a36', '#4a2a1c'); pole(c, 15, 0, 13, -22, 2.2, '#8a5a36', '#4a2a1c'); pole(c, -15, -17, 15, -17, 2, '#9a6a44', '#4a2a1c'); for (const x of [-8, 0, 8]) { pole(c, x - 2, 0, x + 2.4, -33, 1.3, '#7a4a2c', '#4a2a1c'); L(c, [x + 3, -39.6, x + 5, -33.4, x + 0.4, -32.8]); Q(c, '#e8edf2', '#7d8598', 0.9); } }
function crates(c: Ctx) {
  ground(c, 20);
  R(c, -18, -17, 18, 17, 2); Q(c, '#c79a5a', '#7d5434', 1.4); c.strokeStyle = '#7d5434'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-18, -17); c.lineTo(0, 0); c.moveTo(0, -17); c.lineTo(-18, 0); c.stroke();
  R(c, 3, -20, 14, 20, 5); Q(c, '#a8693c', '#5f3f28', 1.4); E(c, 10, -20, 7, 2.6); Q(c, '#c98a55', '#5f3f28', 1.2); c.strokeStyle = '#4a4658'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(3.6, -14); c.lineTo(16.4, -14); c.moveTo(3.6, -6); c.lineTo(16.4, -6); c.stroke();
}
function lantern(c: Ctx) {
  ground(c, 13, 0.2);
  R(c, -9, -5, 18, 5, 1.6); Q(c, '#b9b3a4', '#7d776c', 1.3); R(c, -3.4, -16, 6.8, 12, 1.4); Q(c, '#c9c3b4', '#7d776c', 1.3);
  R(c, -8, -29, 16, 13.4, 2); Q(c, '#b9b3a4', '#7d776c', 1.3); R(c, -4.8, -26.4, 9.6, 8.4, 1.4); Q(c, '#ffe27a', '#c98a1e', 1);
  c.strokeStyle = '#c98a1e'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(0, -26.4); c.lineTo(0, -18); c.stroke();
  c.beginPath(); c.moveTo(-14, -28.4); c.quadraticCurveTo(-7, -31, 0, -39); c.quadraticCurveTo(7, -31, 14, -28.4); c.quadraticCurveTo(0, -31.6, -14, -28.4); c.closePath(); Q(c, '#5f6878', '#3a4150', 1.3); E(c, 0, -40, 2, 2); Q(c, '#5f6878', '#3a4150', 1);
}
function brazier(c: Ctx) {
  ground(c, 13, 0.2);
  pole(c, -8, 0, -4, -14, 1.8, '#4a4658', '#2b2233'); pole(c, 8, 0, 4, -14, 1.8, '#4a4658', '#2b2233'); pole(c, 0, -1, 0, -13, 1.8, '#4a4658', '#2b2233');
  c.beginPath(); c.moveTo(-11, -20); c.quadraticCurveTo(-9, -11, 0, -11); c.quadraticCurveTo(9, -11, 11, -20); c.closePath(); Q(c, '#5f6878', '#2b2233', 1.4);
  c.beginPath(); c.moveTo(0, -38); c.quadraticCurveTo(8, -28, 7, -20.4); c.lineTo(-7, -20.4); c.quadraticCurveTo(-9.6, -27, -3.4, -31); c.quadraticCurveTo(-3, -35, 0, -38); c.closePath(); Q(c, '#ff7a2e', '#c2401c', 1.2);
  c.beginPath(); c.moveTo(0.6, -31); c.quadraticCurveTo(4.6, -25, 3.6, -20.6); c.lineTo(-3.6, -20.6); c.quadraticCurveTo(-4.4, -25, 0.6, -31); c.closePath(); c.fillStyle = '#ffe27a'; c.fill();
}
function pine(c: Ctx) {
  ground(c, 13);
  L(c, [-9, -12, 9, -12, 7, 0, -7, 0]); Q(c, '#f4f6f9', '#7d8598', 1.3); c.strokeStyle = '#4a7fc9'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-8, -8); c.lineTo(8, -8); c.moveTo(-7.4, -4); c.lineTo(7.4, -4); c.stroke();
  pole(c, 0, -12, 3, -24, 2.2, '#7a4a2c', '#4a2a1c'); pole(c, 2, -19, -8, -27, 1.6, '#7a4a2c', '#4a2a1c');
  for (const [x, y, rx] of [[-10, -29, 9], [6, -27, 8], [1, -37, 10]]) { blob(c, x, y, rx, rx * 0.55, 8, 0.16, mulberry(rx)); Q(c, '#4f9a5a', '#2f6a3c', 1.2); c.fillStyle = '#7cc47a'; E(c, x - 2, y - 2, rx * 0.5, rx * 0.2); c.fill(); }
}
function drum(c: Ctx) {
  ground(c, 16, 0.2);
  pole(c, -11, 0, -6, -16, 2, '#7a4a2c', '#4a2a1c'); pole(c, 11, 0, 6, -16, 2, '#7a4a2c', '#4a2a1c'); pole(c, -10, -5, 10, -5, 1.6, '#8a5a36', '#4a2a1c');
  E(c, 0, -24, 15, 13); Q(c, '#d8342c', '#8f1d1d', 1.5); E(c, 0, -24, 11, 9.6); Q(c, '#fff3d6', '#c9b58a', 1.2);
  c.fillStyle = '#ffc94a'; for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; E(c, Math.cos(a) * 13, -24 + Math.sin(a) * 11.2, 1, 1); c.fill(); }
  c.strokeStyle = '#e0c690'; c.lineWidth = 1; E(c, 0, -24, 5, 4.4); c.stroke();
}
function pillar(c: Ctx) {
  ground(c, 14, 0.2);
  R(c, -11, -6, 22, 6, 1.6); Q(c, '#b9b3a4', '#7d776c', 1.3); R(c, -7.4, -40, 14.8, 35, 3); Q(c, '#c9342c', '#7a1a18', 1.5);
  c.fillStyle = 'rgba(255,255,255,0.22)'; R(c, -5.2, -38, 3, 31, 1.5); c.fill(); R(c, -8.4, -12, 16.8, 3.6, 1.2); Q(c, '#ffc94a', '#c98a1e', 1); R(c, -9.4, -44, 18.8, 5, 1.6); Q(c, '#ffc94a', '#c98a1e', 1.1);
}

// ---- large ground decals ---------------------------------------------------------------------------------------------------------------
function soft(seed: number, rx: number, ry: number, fill: string, rim: string) { return (c: Ctx) => { blob(c, 0, 0, rx, ry, 11, 0.16, mulberry(seed)); c.fillStyle = rim; c.fill(); blob(c, 0, 0, rx - 5, ry - 4, 11, 0.16, mulberry(seed)); c.fillStyle = fill; c.fill(); }; }
function pond(seed: number, rx: number, ry: number) {
  return (c: Ctx) => {
    blob(c, 0, 0, rx, ry, 12, 0.14, mulberry(seed)); c.fillStyle = '#ecdca4'; c.fill();
    blob(c, 0, 0, rx - 6, ry - 5, 12, 0.14, mulberry(seed)); c.fillStyle = '#6dbfe0'; c.fill();
    blob(c, 0, 2.4, rx - 9, ry - 8.6, 12, 0.14, mulberry(seed)); c.fillStyle = '#8fd6ee'; c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 1.6; c.lineCap = 'round'; const rnd = mulberry(seed + 9);
    for (let i = 0; i < 7; i++) { const x = (rnd() - 0.5) * rx * 1.1, y = (rnd() - 0.5) * ry * 0.9, w = 6 + rnd() * 8; c.beginPath(); c.moveTo(x - w, y); c.quadraticCurveTo(x - w / 2, y - 2.4, x, y); c.quadraticCurveTo(x + w / 2, y + 2.4, x + w, y); c.stroke(); }
    for (let i = 0; i < 3; i++) { const x = (rnd() - 0.5) * rx, y = (rnd() - 0.5) * ry * 0.8; c.beginPath(); c.moveTo(x, y); c.arc(x, y, 5.4, 0.5, TAU - 0.2); c.closePath(); c.fillStyle = '#5fae58'; c.fill(); c.strokeStyle = '#3f8a44'; c.lineWidth = 1; c.stroke(); if (i === 0) { c.fillStyle = '#ffb3c8'; star(c, x + 1, y - 1, 3.2, 1.6, 6); c.fill(); c.fillStyle = '#ffe27a'; E(c, x + 1, y - 1, 1, 1); c.fill(); } c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 1.6; }
  };
}
function tracks(c: Ctx) { c.strokeStyle = 'rgba(150,105,60,0.5)'; c.lineWidth = 4; c.lineCap = 'round'; c.setLineDash([10, 6]); for (const off of [-9, 9]) { c.beginPath(); c.moveTo(-100, 26 + off); c.bezierCurveTo(-40, -10 + off, 30, 34 + off, 100, -20 + off); c.stroke(); } c.setLineDash([]); }
function mat(c: Ctx) { c.save(); c.rotate(-0.08); R(c, -46, -28, 92, 56, 4); c.fillStyle = '#e6c98a'; c.fill(); c.strokeStyle = '#c9a25a'; c.lineWidth = 1.2; for (let y = -22; y <= 22; y += 6.4) { c.beginPath(); c.moveTo(-44, y); c.lineTo(44, y); c.stroke(); } R(c, -46, -28, 92, 56, 4); c.strokeStyle = '#a8763c'; c.lineWidth = 3; c.stroke(); c.restore(); }
function carpet(c: Ctx) {
  R(c, -84, -44, 168, 88, 4); c.fillStyle = '#c9342c'; c.fill(); R(c, -84, -44, 168, 88, 4); c.strokeStyle = '#8f1d1d'; c.lineWidth = 2.4; c.stroke();
  R(c, -76, -36, 152, 72, 3); c.strokeStyle = '#ffc94a'; c.lineWidth = 2.4; c.stroke(); R(c, -70, -30, 140, 60, 2); c.strokeStyle = '#e09a22'; c.lineWidth = 1; c.stroke();
  c.fillStyle = '#e04a3c'; star(c, 0, 0, 24, 15, 8, 0); c.fill(); c.strokeStyle = '#ffc94a'; c.lineWidth = 1.6; E(c, 0, 0, 13, 13); c.stroke(); E(c, 0, 0, 6, 6); c.fillStyle = '#ffc94a'; c.fill();
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) { L(c, [sx * 66, sy * 26, sx * 56, sy * 26, sx * 66, sy * 16]); c.fillStyle = '#ffc94a'; c.fill(); }
}
function medallion(c: Ctx) {
  E(c, 0, 0, 58, 40); c.fillStyle = '#a9a090'; c.fill(); E(c, 0, 0, 53, 36); c.fillStyle = '#d9d0be'; c.fill();
  c.strokeStyle = '#a9a090'; c.lineWidth = 2; E(c, 0, 0, 40, 27); c.stroke(); E(c, 0, 0, 20, 13.6); c.stroke();
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; c.beginPath(); c.moveTo(Math.cos(a) * 20, Math.sin(a) * 13.6); c.lineTo(Math.cos(a) * 40, Math.sin(a) * 27); c.stroke(); }
  E(c, 0, 0, 8, 5.4); c.fillStyle = '#b9b09e'; c.fill();
}

export function buildScenes(res: number): Scene[] {
  const r = Math.min(2, res), small = (draw: (c: Ctx) => void): Prop | null => bake(r, [-16, -20, 16, 6], draw);
  const big = (draw: (c: Ctx) => void, glow?: Glow): Prop | null => { const made = bake(r, [-36, -60, 36, 12], draw) as Prop | null; if (made && glow) made.glow = glow; return made; };
  const patch = (draw: (c: Ctx) => void): Prop | null => bake(Math.min(1.5, r), [-112, -66, 112, 66], draw);
  const all = (list: (Prop | null)[]) => list.filter((item): item is Prop => !!item);
  return [
    {
      id: 'bamboo', name: 'Bamboo Grove', mote: 'leaf', vignette: '#17361f', shade: 0.3,
      tile: paintedTile(r, 11, '#a2d06c', ['#94c660', '#b0da7a', '#9acb66', '#a9d674'], '#7fb556', '#c4e690'),
      patches: all([patch(soft(3, 96, 46, '#dcc98e', '#c9b47a')), patch(soft(8, 80, 52, '#8fc25c', '#98c964')), patch(soft(15, 70, 40, '#b6de80', '#acd676'))]),
      small: all([small(tuft('#6fae48', '#c4e690')), small(tuft('#7fb94f', '#c4e690')), small(flowers('#ffffff', '#ffd23a')), small(flowers('#ffd9ec', '#ff8fb0')), small(pebbles('#c2c0b6', '#9a988e')), small(mushrooms), small(shoot)]),
      big: all([big(bambooClump), big(bambooClump), big(rock('#bdbbb0', '#8d8a80', '#7cc25a')), big(log)])
    },
    {
      id: 'river', name: 'River Plain', mote: 'petal', vignette: '#173a4a', shade: 0.28,
      tile: paintedTile(r, 23, '#c6dc8c', ['#b8d27e', '#d4e49c', '#c0d886', '#dfe0a0'], '#9dbb62', '#e6efb4'),
      patches: all([patch(pond(31, 100, 52)), patch(pond(44, 76, 44)), patch(soft(52, 84, 44, '#ecdca4', '#dfd098'))]),
      small: all([small(tuft('#9dbb62', '#e6efb4')), small(reedsSmall), small(flowers('#ffb3c8', '#ffe27a')), small(pebbles('#d9d2bd', '#b3ab94')), small(pebbles('#c2c0b6', '#9a988e')), small(flowers('#ffffff', '#ffd23a'))]),
      big: all([big(reeds), big(reeds), big(rock('#d2ccb8', '#a39c86', '')), big(post), big(driftwood)])
    },
    {
      id: 'camp', name: 'War Camp', mote: 'ember', vignette: '#4a2412', shade: 0.32,
      tile: paintedTile(r, 37, '#ddb880', ['#d2ab72', '#e6c490', '#d8b078', '#cba56c'], '#b88c52', '#f0d6a6'),
      patches: all([patch(soft(61, 90, 48, '#cfa468', '#c79c60')), patch(tracks), patch(mat)]),
      small: all([small(pebbles('#c9b9a0', '#a08f76')), small(hay), small(stuckArrows), small(brokenShield), small(tuft('#b3a05a', '#e8d68a')), small(hay)]),
      big: all([big(tent), big(flagPole('#d8342c', '#8f1d1d')), big(campfire, { x: 0, y: -10, r: 58, warm: true }), big(rack), big(crates), big(flagPole('#3f6fc9', '#27488a'))])
    },
    {
      id: 'fortress', name: 'Fortress Courtyard', mote: 'maple', vignette: '#2a1838', shade: 0.4,
      tile: stoneTile(r),
      patches: all([patch(carpet), patch(medallion), patch(soft(83, 60, 34, '#bdb3a0', '#c6bcaa'))]),
      small: all([small(maple), small(crack), small(pebbles('#b9b3a4', '#8d877a')), small(maple), small(crack)]),
      big: all([big(lantern, { x: 0, y: -22, r: 64, warm: true }), big(pillar), big(brazier, { x: 0, y: -26, r: 60, warm: true }), big(pine), big(drum), big(lantern, { x: 0, y: -22, r: 64, warm: true })])
    }
  ];
}

/** Draws one scene's ground for the visible world rectangle. The context must already be in world coordinates. */
export function drawGround(c: Ctx, scene: Scene, salt: number, left: number, top: number, width: number, height: number, glow: HTMLCanvasElement | null, flicker: number, alpha = 1) {
  c.globalAlpha = alpha;
  if (scene.tile) for (let tx = Math.floor(left / TILE); tx * TILE < left + width; tx++) for (let ty = Math.floor(top / TILE); ty * TILE < top + height; ty++) c.drawImage(scene.tile, tx * TILE, ty * TILE, TILE + 0.6, TILE + 0.6);
  const cells = (size: number, margin: number, visit: (gx: number, gy: number) => void) => { for (let gx = Math.floor((left - margin) / size); gx * size < left + width + margin; gx++) for (let gy = Math.floor((top - margin) / size); gy * size < top + height + margin; gy++) visit(gx, gy); };
  if (scene.patches.length) cells(300, 120, (gx, gy) => { const h = hash(gx, gy, salt + 1); if (h % 100 >= 62) return; const p = scene.patches[(h >>> 8) % scene.patches.length], x = gx * 300 + 60 + (h >>> 12) % 180, y = gy * 300 + 60 + (h >>> 20) % 180; c.drawImage(p.img, x + p.x, y + p.y, p.w, p.h); });
  if (scene.small.length) cells(64, 20, (gx, gy) => { const h = hash(gx, gy, salt + 2); if (h % 100 >= 58) return; const p = scene.small[(h >>> 8) % scene.small.length], x = gx * 64 + 8 + (h >>> 12) % 48, y = gy * 64 + 12 + (h >>> 20) % 48; c.drawImage(p.img, x + p.x, y + p.y, p.w, p.h); });
  if (scene.big.length) cells(210, 64, (gx, gy) => {
    const h = hash(gx, gy, salt + 3); if (h % 100 >= 55) return;
    const p = scene.big[(h >>> 8) % scene.big.length], x = gx * 210 + 40 + (h >>> 12) % 130, y = gy * 210 + 50 + (h >>> 20) % 130;
    c.drawImage(p.img, x + p.x, y + p.y, p.w, p.h);
    if (p.glow && glow) { const size = p.glow.r * (1 + flicker * 0.08 * (((h >>> 5) & 1) ? 1 : -1)); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5 * alpha; c.drawImage(glow, x + p.glow.x - size, y + p.glow.y - size * 0.8, size * 2, size * 1.6); c.globalAlpha = alpha; c.globalCompositeOperation = 'source-over'; }
  });
  c.globalAlpha = 1;
}
