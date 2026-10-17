// Ashfall art: every background, texture and prop is painted procedurally once at mount
// with seeded brush strokes, so the three areas share one hand-painted language.

import { VIEW_W, VIEW_H } from './level.js';

export const LAYER_W = 2048;

export function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const ctxOf = (c) => c.getContext('2d');

// ---------- brushes ----------
function strokes(c, R, o) {
  // Scatter short directional strokes: the basic "painted" texture.
  const { x = 0, y = 0, w, h, n, colors, len = 10, angle = -0.6, spread = 0.6, width = 1.2, alpha = [0.06, 0.2] } = o;
  c.save(); c.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const px = x + R() * w, py = y + R() * h, a = angle + (R() - 0.5) * spread, l = len * (0.4 + R());
    c.globalAlpha = alpha[0] + R() * (alpha[1] - alpha[0]); c.strokeStyle = colors[(R() * colors.length) | 0]; c.lineWidth = width * (0.5 + R());
    c.beginPath(); c.moveTo(px, py); c.quadraticCurveTo(px + Math.cos(a) * l * 0.5 + (R() - 0.5) * 3, py + Math.sin(a) * l * 0.5 + (R() - 0.5) * 3, px + Math.cos(a) * l, py + Math.sin(a) * l); c.stroke();
  }
  c.restore();
}
function dabs(c, R, o) {
  const { x = 0, y = 0, w, h, n, colors, r = [2, 6], alpha = [0.04, 0.14] } = o;
  c.save();
  for (let i = 0; i < n; i++) { c.globalAlpha = alpha[0] + R() * (alpha[1] - alpha[0]); c.fillStyle = colors[(R() * colors.length) | 0]; c.beginPath(); c.ellipse(x + R() * w, y + R() * h, r[0] + R() * (r[1] - r[0]), (r[0] + R() * (r[1] - r[0])) * 0.6, R() * 3, 0, 7); c.fill(); }
  c.restore();
}
function hazeAtop(c, top, bottom, color, a0, a1) {
  c.save(); c.globalCompositeOperation = 'source-atop';
  const gr = c.createLinearGradient(0, top, 0, bottom); gr.addColorStop(0, rgba(color, a0)); gr.addColorStop(1, rgba(color, a1));
  c.fillStyle = gr; c.fillRect(0, 0, c.canvas.width, c.canvas.height); c.restore();
}
function rimAtop(c, R, color, n, dir = 1) {
  // Warm rim strokes only where paint already exists: a cheap "lit from the side" look.
  c.save(); c.globalCompositeOperation = 'source-atop';
  strokes(c, R, { w: c.canvas.width, h: c.canvas.height, n, colors: [color], len: 18, angle: dir > 0 ? -1.4 : -1.7, spread: 0.3, width: 1.6, alpha: [0.04, 0.12] });
  c.restore();
}
export function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function wrap(W, x, ext, fn) { fn(x); if (x - ext < 0) fn(x + W); if (x + ext > W) fn(x - W); }

function branch(c, R, x, y, a, len, w, depth) {
  const bend = (R() - 0.5) * len * 0.35;
  const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
  c.lineWidth = Math.max(0.6, w); c.beginPath(); c.moveTo(x, y);
  c.quadraticCurveTo((x + x2) / 2 + Math.cos(a + 1.57) * bend, (y + y2) / 2 + Math.sin(a + 1.57) * bend, x2, y2); c.stroke();
  if (depth <= 0 || len < 6) return;
  const kids = R() < 0.35 ? 3 : 2;
  for (let i = 0; i < kids; i++) branch(c, R, x2, y2, a + (R() - 0.5) * 1.3 + (i - (kids - 1) / 2) * 0.35, len * (0.58 + R() * 0.22), w * 0.62, depth - 1);
}
function deadTree(c, R, x, base, h, tw, color, depth = 5, lean = 0) {
  c.save(); c.fillStyle = color; c.strokeStyle = color; c.lineCap = 'round';
  const topX = x + lean * h;
  c.beginPath(); c.moveTo(x - tw * 0.75, base + 4);
  c.bezierCurveTo(x - tw * 0.5, base - h * 0.15, topX - tw * 0.3, base - h * 0.6, topX - tw * 0.12, base - h);
  c.lineTo(topX + tw * 0.12, base - h);
  c.bezierCurveTo(topX + tw * 0.35, base - h * 0.6, x + tw * 0.55, base - h * 0.15, x + tw * 0.8, base + 4); c.closePath(); c.fill();
  // roots
  for (let i = 0; i < 4; i++) { c.lineWidth = tw * 0.25; c.beginPath(); c.moveTo(x + (R() - 0.5) * tw, base - 6); c.quadraticCurveTo(x + (i < 2 ? -1 : 1) * tw * (0.8 + R()), base - 2, x + (i < 2 ? -1 : 1) * tw * (1.3 + R() * 1.2), base + 6); c.stroke(); }
  const nb = 3 + ((R() * 3) | 0);
  for (let i = 0; i < nb; i++) {
    const t = 0.35 + R() * 0.6, bx = x + (topX - x) * t, by = base - h * t, side = R() < 0.5 ? -1 : 1;
    branch(c, R, bx, by, -1.57 + side * (0.45 + R() * 0.7), h * (0.18 + R() * 0.16) * (1.1 - t * 0.5), tw * 0.32 * (1.2 - t), depth - 1);
  }
  branch(c, R, topX, base - h, -1.57 + (R() - 0.5) * 0.5, h * 0.18, tw * 0.22, depth - 2);
  c.restore();
}

// ---------- sky + layers ----------
function sky(R, stops, glow, clouds) {
  const cv = makeCanvas(VIEW_W, VIEW_H), c = ctxOf(cv);
  const gr = c.createLinearGradient(0, 0, 0, VIEW_H); stops.forEach(([p, col]) => gr.addColorStop(p, col));
  c.fillStyle = gr; c.fillRect(0, 0, VIEW_W, VIEW_H);
  const rg = c.createRadialGradient(glow.x, glow.y, 0, glow.x, glow.y, glow.r); rg.addColorStop(0, glow.c); rg.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = rg; c.fillRect(0, 0, VIEW_W, VIEW_H);
  strokes(c, R, { y: 20, w: VIEW_W, h: 320, n: 520, colors: clouds, len: 120, angle: 0, spread: 0.08, width: 6, alpha: [0.03, 0.1] });
  strokes(c, R, { y: 60, w: VIEW_W, h: 280, n: 300, colors: clouds, len: 60, angle: 0.05, spread: 0.1, width: 2.5, alpha: [0.05, 0.14] });
  return cv;
}

function woodsLayers(R) {
  const far = makeCanvas(LAYER_W, VIEW_H), fc = ctxOf(far);
  fc.fillStyle = '#2a3437'; fc.beginPath(); fc.moveTo(0, VIEW_H);
  for (let x = 0; x <= LAYER_W; x += 32) fc.lineTo(x, 365 + Math.sin(x * 0.004) * 14 + Math.sin(x * 0.013) * 6);
  fc.lineTo(LAYER_W, VIEW_H); fc.fill();
  for (let i = 0; i < 46; i++) { const x = R() * LAYER_W; wrap(LAYER_W, x, 90, (xx) => deadTree(fc, rng((i + 1) * 97), xx, 372, 110 + R() * 140, 3 + R() * 4, '#2a3437', 4, (R() - 0.5) * 0.1)); }
  hazeAtop(fc, 150, 420, '#55605e', 0.55, 0.15);
  const mid = makeCanvas(LAYER_W, VIEW_H), mc = ctxOf(mid);
  mc.fillStyle = '#171f21'; mc.beginPath(); mc.moveTo(0, VIEW_H);
  for (let x = 0; x <= LAYER_W; x += 24) mc.lineTo(x, 412 + Math.sin(x * 0.006 + 1) * 10);
  mc.lineTo(LAYER_W, VIEW_H); mc.fill();
  for (let i = 0; i < 16; i++) { const x = (i / 16) * LAYER_W + R() * 80; wrap(LAYER_W, x, 160, (xx) => deadTree(mc, rng(i * 31 + 7), xx, 418, 220 + R() * 160, 9 + R() * 9, '#171f21', 5, (R() - 0.5) * 0.12)); }
  strokes(mc, R, { w: LAYER_W, h: VIEW_H, n: 1600, colors: ['#2b3433', '#0c1112'], len: 12, angle: -1.57, spread: 0.2, width: 1.4 });
  hazeAtop(mc, 100, 450, '#46504f', 0.32, 0.08);
  const near = makeCanvas(LAYER_W, VIEW_H), nc = ctxOf(near);
  for (let i = 0; i < 6; i++) {
    const x = (i / 6) * LAYER_W + R() * 140, w = 40 + R() * 36;
    wrap(LAYER_W, x, 200, (xx) => {
      deadTree(nc, rng(i * 13 + 3), xx, 520, 640, w, '#0d1213', 5, (R() - 0.5) * 0.06);
      // hanging moss
      nc.strokeStyle = '#1d2622'; nc.lineWidth = 1.2;
      for (let m = 0; m < 10; m++) { const mx = xx + (R() - 0.5) * 220, my = 40 + R() * 200; nc.globalAlpha = 0.5; nc.beginPath(); nc.moveTo(mx, my); nc.quadraticCurveTo(mx + 4, my + 30, mx - 2, my + 40 + R() * 70); nc.stroke(); }
      nc.globalAlpha = 1;
    });
  }
  nc.save(); nc.globalCompositeOperation = 'source-atop';
  strokes(nc, R, { w: LAYER_W, h: VIEW_H, n: 3800, colors: ['#273029', '#1a1f1d', '#3a3a30'], len: 16, angle: -1.57, spread: 0.25, width: 1.6, alpha: [0.1, 0.3] });
  nc.restore();
  rimAtop(nc, R, '#c27a3e', 900, 1);
  const fg = makeCanvas(LAYER_W, VIEW_H), gc = ctxOf(fg);
  gc.strokeStyle = '#040606'; gc.fillStyle = '#040606'; gc.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const x = R() * LAYER_W;
    wrap(LAYER_W, x, 120, (xx) => { for (let b = 0; b < 26; b++) { gc.lineWidth = 2 + R() * 3; gc.beginPath(); gc.moveTo(xx + (R() - 0.5) * 120, 545); gc.quadraticCurveTo(xx + (R() - 0.5) * 140, 500, xx + (R() - 0.5) * 170, 455 + R() * 50); gc.stroke(); } });
  }
  for (let i = 0; i < 3; i++) { const x = (i + 0.3) * LAYER_W / 3; wrap(LAYER_W, x, 200, (xx) => branch(gc, rng(i + 50), xx, -30, 0.5 + R() * 0.3, 95, 12, 4)); }
  return { far, mid, near, fg };
}

function ruin(c, R, x, base, w, h, color, windows) {
  c.fillStyle = color; c.beginPath(); c.moveTo(x, base); c.lineTo(x, base - h);
  const steps = 3 + ((R() * 4) | 0);
  for (let i = 1; i <= steps; i++) c.lineTo(x + (w * i) / steps, base - h + (R() < 0.55 ? R() * h * 0.28 : 0));
  c.lineTo(x + w, base); c.fill();
  if (!windows) return;
  const cols = Math.max(2, (w / 22) | 0), rows = Math.max(2, (h / 30) | 0);
  for (let i = 0; i < cols; i++) for (let j = 1; j < rows; j++) {
    const wx = x + 8 + i * (w - 12) / cols, wy = base - h + 18 + j * (h - 24) / rows;
    if (R() < windows.lit) { c.fillStyle = rgba('#ffae5a', 0.25 + R() * 0.5); c.fillRect(wx, wy, 6, 9); }
    else if (R() < 0.7) { c.fillStyle = windows.hole; c.fillRect(wx, wy, 7, 10); }
  }
}

function quarterLayers(R) {
  const far = makeCanvas(LAYER_W, VIEW_H), fc = ctxOf(far);
  for (let i = 0; i < 34; i++) { const x = R() * LAYER_W, w = 50 + R() * 110, h = 110 + R() * 210; wrap(LAYER_W, x, w, (xx) => ruin(fc, rng(i * 7 + 1), xx, 392, w, h, '#252a30', { lit: 0.03, hole: '#1a1d22' })); }
  fc.fillStyle = '#252a30'; fc.fillRect(0, 388, LAYER_W, 200);
  hazeAtop(fc, 120, 420, '#6b5547', 0.5, 0.18);
  const mid = makeCanvas(LAYER_W, VIEW_H), mc = ctxOf(mid);
  for (let i = 0; i < 12; i++) {
    const x = (i / 12) * LAYER_W + R() * 60, w = 150 + R() * 150, h = 200 + R() * 170;
    wrap(LAYER_W, x, w, (xx) => {
      ruin(mc, rng(i * 17 + 5), xx, 432, w, h, '#15181c', { lit: 0.05, hole: '#0b0d10' });
      mc.strokeStyle = '#0b0d10'; mc.lineWidth = 2;
      for (let f = 0; f < 3; f++) { const fy = 432 - h * (0.25 + f * 0.22); mc.beginPath(); mc.moveTo(xx + w * 0.62, fy); mc.lineTo(xx + w * 0.9, fy); mc.moveTo(xx + w * 0.62, fy); mc.lineTo(xx + w * 0.9, fy - h * 0.2); mc.stroke(); }
    });
  }
  // power poles and sagging wires
  mc.strokeStyle = '#0e1013'; mc.lineWidth = 6;
  const poles = []; for (let x = 60; x < LAYER_W; x += 340) poles.push(x);
  poles.forEach((x) => { mc.lineWidth = 6; mc.beginPath(); mc.moveTo(x, 440); mc.lineTo(x + 6, 150); mc.stroke(); mc.lineWidth = 4; mc.beginPath(); mc.moveTo(x - 30, 170); mc.lineTo(x + 40, 162); mc.stroke(); });
  mc.lineWidth = 1.3;
  poles.forEach((x, i) => { const nx = poles[i + 1] ?? LAYER_W + 60; for (let k = 0; k < 3; k++) { mc.beginPath(); mc.moveTo(x - 24 + k * 30, 168); mc.quadraticCurveTo((x + nx) / 2, 230 + k * 8, nx - 24 + k * 30, 168); mc.stroke(); } });
  strokes(mc, R, { w: LAYER_W, h: VIEW_H, n: 1800, colors: ['#2a2d31', '#08090b'], len: 10, angle: -1.57, spread: 0.1, width: 1.3 });
  hazeAtop(mc, 100, 460, '#5a4a40', 0.3, 0.06);
  const near = makeCanvas(LAYER_W, VIEW_H), nc = ctxOf(near);
  for (let i = 0; i < 8; i++) {
    const x = R() * LAYER_W, w = 120 + R() * 200, h = 260 + R() * 260;
    wrap(LAYER_W, x, w, (xx) => {
      nc.fillStyle = '#0c0d0f'; nc.beginPath(); nc.moveTo(xx, 560); nc.lineTo(xx + 8, 560 - h);
      for (let s = 1; s <= 5; s++) nc.lineTo(xx + w * s / 5, 560 - h + R() * 90);
      nc.lineTo(xx + w, 560); nc.fill();
      nc.strokeStyle = '#0c0d0f'; nc.lineWidth = 2;
      for (let r = 0; r < 6; r++) { const rx = xx + R() * w; nc.beginPath(); nc.moveTo(rx, 560 - h + 40); nc.lineTo(rx + (R() - 0.5) * 40, 560 - h - 20 - R() * 40); nc.stroke(); }
    });
  }
  nc.save(); nc.globalCompositeOperation = 'source-atop';
  strokes(nc, R, { w: LAYER_W, h: VIEW_H, n: 3000, colors: ['#24262a', '#16171a', '#38302a'], len: 14, angle: -0.2, spread: 1.2, width: 1.6, alpha: [0.1, 0.3] });
  nc.restore(); rimAtop(nc, R, '#d0773a', 900, 1);
  const fg = makeCanvas(LAYER_W, VIEW_H), gc = ctxOf(fg);
  gc.fillStyle = '#040405'; gc.strokeStyle = '#040405';
  for (let i = 0; i < 8; i++) { const x = R() * LAYER_W; wrap(LAYER_W, x, 140, (xx) => { gc.beginPath(); gc.moveTo(xx - 120, 545); for (let s = 0; s <= 8; s++) gc.lineTo(xx - 120 + s * 30, 500 - R() * 40 + Math.abs(s - 4) * 9); gc.lineTo(xx + 120, 545); gc.fill(); }); }
  gc.lineWidth = 2; for (let i = 0; i < 4; i++) { const x = R() * LAYER_W; gc.beginPath(); gc.moveTo(x, -5); gc.quadraticCurveTo(x + 90, 120 + R() * 60, x + 260, -5); gc.stroke(); }
  return { far, mid, near, fg };
}

function gear(c, x, y, r, teeth, color) {
  c.fillStyle = color; c.beginPath();
  for (let i = 0; i < teeth * 2; i++) { const a = (i / (teeth * 2)) * Math.PI * 2, rr = i % 2 ? r : r * 1.14; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  c.closePath(); c.fill();
  c.save(); c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(x, y, r * 0.22, 0, 7); c.fill();
  for (let i = 0; i < 5; i++) { const a = i * 1.2566; c.beginPath(); c.arc(x + Math.cos(a) * r * 0.58, y + Math.sin(a) * r * 0.58, r * 0.18, 0, 7); c.fill(); }
  c.restore();
}
function truss(c, x1, y1, x2, h, color) {
  c.strokeStyle = color; c.lineWidth = 3; c.strokeRect(x1, y1, x2 - x1, h);
  c.lineWidth = 2; c.beginPath(); for (let x = x1; x < x2; x += h) { c.moveTo(x, y1); c.lineTo(x + h, y1 + h); c.moveTo(x + h, y1); c.lineTo(x, y1 + h); } c.stroke();
}

function foundryLayers(R) {
  const far = makeCanvas(LAYER_W, VIEW_H), fc = ctxOf(far);
  fc.fillStyle = '#26191a';
  for (let i = 0; i < 18; i++) { const x = R() * LAYER_W, w = 80 + R() * 140, h = 70 + R() * 90; wrap(LAYER_W, x, w, (xx) => { fc.beginPath(); fc.moveTo(xx, 400); fc.lineTo(xx, 400 - h); const n = 3 + ((R() * 3) | 0); for (let s = 0; s < n; s++) { fc.lineTo(xx + (w / n) * (s + 0.7), 400 - h - 22); fc.lineTo(xx + (w / n) * (s + 1), 400 - h); } fc.lineTo(xx + w, 400); fc.fill(); }); }
  for (let i = 0; i < 9; i++) {
    const x = R() * LAYER_W, w = 16 + R() * 14, h = 200 + R() * 140;
    wrap(LAYER_W, x, 120, (xx) => {
      fc.fillStyle = '#26191a'; fc.fillRect(xx, 400 - h, w, h);
      fc.fillStyle = 'rgba(255,120,50,0.35)'; fc.fillRect(xx - 1, 400 - h + 14, w + 2, 3);
      dabs(fc, R, { x: xx - 60, y: 400 - h - 160, w: 140, h: 170, n: 60, colors: ['#3a2a28', '#2a1e1d'], r: [14, 34], alpha: [0.08, 0.2] });
    });
  }
  fc.fillStyle = '#26191a'; fc.fillRect(0, 396, LAYER_W, 200);
  hazeAtop(fc, 100, 420, '#7a3a22', 0.45, 0.2);
  const mid = makeCanvas(LAYER_W, VIEW_H), mc = ctxOf(mid);
  for (let i = 0; i < 8; i++) {
    const x = (i / 8) * LAYER_W + R() * 80, w = 220 + R() * 120, h = 160 + R() * 120;
    wrap(LAYER_W, x, w, (xx) => {
      mc.fillStyle = '#161010'; mc.fillRect(xx, 432 - h, w, h);
      for (let k = 0; k < 4; k++) { mc.fillStyle = rgba('#ff7a32', 0.2 + R() * 0.45); mc.fillRect(xx + 20 + k * (w - 40) / 4, 432 - h + 30, 18, 26); }
      mc.fillStyle = '#161010'; mc.beginPath(); mc.ellipse(xx + w * 0.75, 432 - h - 30, 38, 46, 0, 0, 7); mc.fill();
    });
  }
  truss(mc, 0, 120, LAYER_W, 28, '#120c0c'); truss(mc, 0, 236, LAYER_W, 18, '#140e0d');
  mc.strokeStyle = '#140e0d'; mc.lineWidth = 12;
  for (let i = 0; i < 6; i++) { const x = R() * LAYER_W; mc.beginPath(); mc.moveTo(x, 440); mc.lineTo(x, 300 - R() * 80); mc.quadraticCurveTo(x, 250, x + 60 + R() * 60, 250); mc.lineTo(x + 260, 250); mc.stroke(); }
  strokes(mc, R, { w: LAYER_W, h: VIEW_H, n: 1800, colors: ['#2d1f1b', '#080505'], len: 10, angle: 0, spread: 0.2, width: 1.3 });
  hazeAtop(mc, 80, 460, '#7a3a24', 0.42, 0.18);
  const near = makeCanvas(LAYER_W, VIEW_H), nc = ctxOf(near);
  for (let i = 0; i < 5; i++) { const x = (i / 5) * LAYER_W + R() * 200, r = 90 + R() * 110; wrap(LAYER_W, x, r * 1.2, (xx) => gear(nc, xx, 360 + R() * 160, r, 12 + ((R() * 8) | 0), '#0e0a0a')); }
  nc.strokeStyle = '#0e0a0a'; nc.lineCap = 'round';
  for (let i = 0; i < 9; i++) { const x = R() * LAYER_W, len = 120 + R() * 220; nc.lineWidth = 5; nc.setLineDash([9, 5]); nc.beginPath(); nc.moveTo(x, -5); nc.lineTo(x + (R() - 0.5) * 20, len); nc.stroke(); nc.setLineDash([]); nc.lineWidth = 3; nc.beginPath(); nc.arc(x, len + 10, 9, -1.2, 3.6); nc.stroke(); }
  nc.fillStyle = '#0e0a0a'; for (let i = 0; i < 4; i++) { const x = R() * LAYER_W; nc.fillRect(x, 300, 50, 260); nc.fillRect(x - 12, 290, 74, 18); }
  nc.save(); nc.globalCompositeOperation = 'source-atop';
  strokes(nc, R, { w: LAYER_W, h: VIEW_H, n: 2600, colors: ['#2a1c18', '#160e0c', '#3d2418'], len: 12, angle: 0.3, spread: 1.4, width: 1.5, alpha: [0.1, 0.3] });
  nc.restore(); rimAtop(nc, R, '#ff7a32', 1300, 1);
  const fg = makeCanvas(LAYER_W, VIEW_H), gc = ctxOf(fg);
  gc.strokeStyle = '#030202'; gc.lineCap = 'round';
  for (let i = 0; i < 6; i++) { const x = R() * LAYER_W, len = 60 + R() * 140; gc.lineWidth = 7; gc.setLineDash([12, 6]); gc.beginPath(); gc.moveTo(x, -5); gc.lineTo(x, len); gc.stroke(); gc.setLineDash([]); gc.lineWidth = 5; gc.beginPath(); gc.arc(x, len + 14, 13, -1.2, 3.8); gc.stroke(); }
  gc.lineWidth = 28; for (let i = 0; i < 3; i++) { const x = R() * LAYER_W; gc.beginPath(); gc.moveTo(x, 560); gc.quadraticCurveTo(x + 80, 500, x + 280, 520); gc.lineTo(x + 520, 560); gc.stroke(); }
  return { far, mid, near, fg };
}

// ---------- ground textures ----------
function groundTile(R, zone) {
  const cv = makeCanvas(512, 256), c = ctxOf(cv);
  const base = ['#15191a', '#191a1d', '#1a1412'][zone];
  const gr = c.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, ['#262b26', '#2a2a2c', '#2c201a'][zone]); gr.addColorStop(0.3, base); gr.addColorStop(1, '#070808');
  c.fillStyle = gr; c.fillRect(0, 0, 512, 256);
  if (zone === 0) {
    strokes(c, R, { w: 512, h: 256, n: 1400, colors: ['#2e2a22', '#0b0d0c', '#3a3328', '#1d2420'], len: 12, angle: 0.2, spread: 1, width: 1.6, alpha: [0.15, 0.4] });
    c.strokeStyle = '#2b2219'; c.lineWidth = 3; for (let i = 0; i < 9; i++) { const x = R() * 512, y = 20 + R() * 120; c.globalAlpha = 0.6; c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + 30, y + 20, x + 60, y - 10, x + 110, y + 30); c.stroke(); }
    c.globalAlpha = 1; dabs(c, R, { w: 512, h: 220, n: 70, colors: ['#3a3a36', '#2a2c2a'], r: [3, 9], alpha: [0.3, 0.6] });
  } else if (zone === 1) {
    strokes(c, R, { w: 512, h: 256, n: 1200, colors: ['#303034', '#0c0c0e', '#3a3530'], len: 8, angle: 0, spread: 3, width: 1.4, alpha: [0.15, 0.35] });
    c.strokeStyle = '#0a0a0b'; c.lineWidth = 1.5; for (let i = 0; i < 14; i++) { let x = R() * 512, y = R() * 200; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (R() - 0.3) * 30; y += R() * 18; c.lineTo(x, y); } c.stroke(); }
    c.fillStyle = 'rgba(0,0,0,0.35)'; for (let x = 0; x < 512; x += 128) c.fillRect(x, 0, 2, 256);
  } else {
    c.strokeStyle = '#0b0807'; c.lineWidth = 2; for (let x = 0; x < 512; x += 128) { c.strokeRect(x + 1, 1, 126, 62); c.strokeRect(x + 65, 65, 126, 62); }
    c.fillStyle = '#3a2c26'; for (let x = 0; x < 512; x += 128) for (const y of [8, 56]) { c.beginPath(); c.arc(x + 8, y, 2.4, 0, 7); c.arc(x + 120, y, 2.4, 0, 7); c.fill(); }
    strokes(c, R, { w: 512, h: 256, n: 1300, colors: ['#4a2618', '#0b0807', '#3a2a22', '#5a3020'], len: 10, angle: 1.57, spread: 0.4, width: 1.5, alpha: [0.1, 0.32] });
  }
  return cv;
}
function lipStrip(R, zone) {
  const cv = makeCanvas(512, 44), c = ctxOf(cv);
  if (zone === 0) {
    c.fillStyle = '#1d231d'; c.fillRect(0, 18, 512, 8);
    c.lineCap = 'round';
    for (let i = 0; i < 260; i++) { const x = R() * 512, h = 4 + R() * 14; c.strokeStyle = ['#2a3326', '#3a3a28', '#1b2219', '#4a4030'][(R() * 4) | 0]; c.lineWidth = 1 + R() * 1.4; c.beginPath(); c.moveTo(x, 24); c.quadraticCurveTo(x + (R() - 0.5) * 6, 24 - h / 2, x + (R() - 0.5) * 10, 24 - h); c.stroke(); }
  } else if (zone === 1) {
    c.fillStyle = '#34353a'; c.fillRect(0, 18, 512, 6); c.fillStyle = '#15161a'; c.fillRect(0, 24, 512, 4);
    for (let i = 0; i < 70; i++) { c.fillStyle = ['#2a2b2f', '#3b3631', '#1c1c20'][(R() * 3) | 0]; const x = R() * 512, w = 3 + R() * 10; c.beginPath(); c.moveTo(x, 20); c.lineTo(x + w / 2, 20 - 2 - R() * 7); c.lineTo(x + w, 20); c.fill(); }
  } else {
    c.fillStyle = '#2e2420'; c.fillRect(0, 16, 512, 8);
    for (let x = 0; x < 512; x += 32) { c.fillStyle = '#c7902e'; c.beginPath(); c.moveTo(x, 24); c.lineTo(x + 14, 24); c.lineTo(x + 22, 30); c.lineTo(x + 8, 30); c.fill(); }
    c.fillStyle = '#120d0c'; c.fillRect(0, 24, 512, 1); c.fillStyle = 'rgba(255,150,80,0.35)'; c.fillRect(0, 16, 512, 1.5);
  }
  return cv;
}

// ---------- props ----------
function prop(w, h, fn) { const cv = makeCanvas(w, h); fn(ctxOf(cv), w, h); return cv; }
function buildProps(R) {
  const P = {};
  P.tree = prop(320, 460, (c) => { deadTree(c, rng(901), 160, 452, 400, 26, '#0b0f10', 6, 0.03); c.globalCompositeOperation = 'source-atop'; strokes(c, R, { w: 320, h: 460, n: 900, colors: ['#2a2f2a', '#3b3426'], len: 14, angle: -1.57, spread: 0.3, width: 1.4, alpha: [0.1, 0.3] }); strokes(c, R, { x: 165, w: 50, h: 460, n: 200, colors: ['#b0703a'], len: 16, angle: -1.57, spread: 0.2, width: 1.2, alpha: [0.08, 0.2] }); });
  P.grave = prop(70, 80, (c) => { c.fillStyle = '#1d2122'; c.beginPath(); c.moveTo(14, 80); c.lineTo(16, 24); c.quadraticCurveTo(35, 2, 54, 24); c.lineTo(56, 80); c.fill(); c.globalCompositeOperation = 'source-atop'; strokes(c, R, { w: 70, h: 80, n: 120, colors: ['#3a403c', '#0e1010'], len: 8, angle: 0.4, spread: 1, width: 1.2, alpha: [0.2, 0.4] }); c.globalCompositeOperation = 'source-over'; c.strokeStyle = '#0c0e0e'; c.lineWidth = 2; c.beginPath(); c.moveTo(35, 30); c.lineTo(35, 54); c.moveTo(27, 38); c.lineTo(43, 38); c.stroke(); });
  P.sign = prop(90, 120, (c) => { c.fillStyle = '#16120f'; c.fillRect(42, 20, 7, 100); c.save(); c.translate(45, 34); c.rotate(-0.12); c.fillStyle = '#2a2018'; c.fillRect(-38, -12, 76, 24); c.fillStyle = '#5a4630'; c.font = '700 11px Georgia, serif'; c.textAlign = 'center'; c.fillText('NO RETURN', 0, 4); c.restore(); });
  P.lantern = prop(60, 110, (c) => { c.strokeStyle = '#121212'; c.lineWidth = 5; c.beginPath(); c.moveTo(18, 110); c.lineTo(18, 14); c.lineTo(40, 14); c.stroke(); c.lineWidth = 1.5; c.beginPath(); c.moveTo(40, 14); c.lineTo(40, 22); c.stroke(); c.fillStyle = '#1a1612'; c.fillRect(33, 22, 14, 4); c.fillStyle = '#ffcf8a'; c.fillRect(35, 26, 10, 14); c.fillStyle = '#1a1612'; c.fillRect(33, 40, 14, 4); });
  P.campfire = prop(90, 30, (c) => { c.fillStyle = '#1a120c'; c.save(); c.translate(45, 22); [-0.4, 0.4, 0.05].forEach((a) => { c.save(); c.rotate(a); c.fillRect(-34, -4, 68, 8); c.restore(); }); c.restore(); c.fillStyle = '#2a2622'; for (let i = 0; i < 9; i++) { c.beginPath(); c.arc(8 + i * 9.4, 26, 5, 0, 7); c.fill(); } });
  P.pole = prop(80, 330, (c) => { c.fillStyle = '#121214'; c.fillRect(36, 10, 9, 320); c.fillRect(10, 26, 62, 6); c.fillStyle = '#26262a'; c.fillRect(14, 20, 6, 8); c.fillRect(60, 20, 6, 8); });
  P.wreck = prop(220, 90, (c) => { c.fillStyle = '#121315'; c.beginPath(); c.moveTo(6, 84); c.lineTo(14, 52); c.lineTo(58, 44); c.lineTo(88, 16); c.lineTo(150, 14); c.lineTo(182, 44); c.lineTo(214, 52); c.lineTo(214, 84); c.fill(); c.fillStyle = '#060607'; c.beginPath(); c.arc(54, 84, 18, 0, 7); c.arc(170, 84, 18, 0, 7); c.fill(); c.fillStyle = '#1f2226'; c.fillRect(94, 22, 50, 22); c.globalCompositeOperation = 'source-atop'; strokes(c, R, { w: 220, h: 90, n: 300, colors: ['#5a3020', '#2a2a2e'], len: 10, angle: 0, spread: 2, width: 1.4, alpha: [0.15, 0.35] }); });
  P.hydrant = prop(30, 44, (c) => { c.fillStyle = '#3a1c18'; c.fillRect(8, 10, 14, 34); c.beginPath(); c.arc(15, 10, 8, Math.PI, 0); c.fill(); c.fillRect(3, 20, 24, 6); });
  P.rubble = prop(200, 60, (c) => { for (let i = 0; i < 26; i++) { c.fillStyle = ['#18191c', '#222327', '#121214'][(R() * 3) | 0]; const x = 10 + R() * 170, w = 10 + R() * 30, h = 8 + R() * (40 - Math.abs(x - 100) * 0.3); c.beginPath(); c.moveTo(x, 60); c.lineTo(x + w * 0.2, 60 - h); c.lineTo(x + w * 0.8, 60 - h * 0.8); c.lineTo(x + w, 60); c.fill(); } c.strokeStyle = '#3a2a22'; c.lineWidth = 2; for (let i = 0; i < 5; i++) { const x = 30 + R() * 140; c.beginPath(); c.moveTo(x, 40); c.lineTo(x + (R() - 0.5) * 40, 5); c.stroke(); } });
  P.barrel = prop(44, 56, (c) => { c.fillStyle = '#251812'; c.fillRect(4, 6, 36, 50); c.fillStyle = '#3a2418'; c.fillRect(2, 14, 40, 4); c.fillRect(2, 40, 40, 4); c.globalCompositeOperation = 'source-atop'; strokes(c, R, { w: 44, h: 56, n: 120, colors: ['#7a3a18', '#120a08'], len: 8, angle: 1.57, spread: 0.6, width: 1.3, alpha: [0.2, 0.45] }); });
  P.lamp = prop(100, 260, (c) => { c.strokeStyle = '#121315'; c.lineWidth = 6; c.beginPath(); c.moveTo(30, 260); c.lineTo(30, 30); c.quadraticCurveTo(30, 10, 56, 12); c.lineTo(68, 14); c.stroke(); c.fillStyle = '#16171a'; c.beginPath(); c.moveTo(56, 12); c.lineTo(84, 12); c.lineTo(78, 24); c.lineTo(62, 24); c.fill(); });
  P.sign2 = prop(140, 200, (c) => { c.fillStyle = '#121214'; c.fillRect(20, 60, 6, 140); c.fillRect(114, 60, 6, 140); c.fillStyle = '#1e1c1c'; c.save(); c.translate(70, 60); c.rotate(0.05); c.fillRect(-64, -46, 128, 56); c.fillStyle = '#5c2e20'; c.font = '700 15px Georgia, serif'; c.textAlign = 'center'; c.fillText('FOUNDRY', 0, -20); c.fillStyle = '#4a4440'; c.font = '600 10px Georgia, serif'; c.fillText('EAST GATE  →', 0, -2); c.restore(); });
  P.pipe = prop(120, 360, (c) => { c.fillStyle = '#140e0d'; c.fillRect(20, 0, 26, 360); c.fillRect(70, 60, 18, 300); c.fillRect(12, 120, 42, 12); c.fillRect(62, 200, 34, 10); c.fillStyle = '#3a1a10'; c.beginPath(); c.arc(33, 180, 12, 0, 7); c.fill(); c.globalCompositeOperation = 'source-atop'; strokes(c, R, { w: 120, h: 360, n: 400, colors: ['#ff7a32', '#2a1a14'], len: 12, angle: 1.57, spread: 0.2, width: 1.2, alpha: [0.05, 0.2] }); });
  P.vat = prop(170, 200, (c) => { c.fillStyle = '#130e0d'; c.beginPath(); c.ellipse(85, 40, 70, 26, 0, 0, 7); c.fill(); c.fillRect(15, 40, 140, 150); c.fillRect(25, 186, 14, 14); c.fillRect(131, 186, 14, 14); c.fillStyle = '#2a1812'; for (let y = 70; y < 190; y += 40) c.fillRect(15, y, 140, 5); c.fillStyle = 'rgba(255,120,40,0.55)'; c.fillRect(70, 110, 30, 6); c.globalCompositeOperation = 'source-atop'; strokes(c, R, { w: 170, h: 200, n: 350, colors: ['#5a2c18', '#0a0606'], len: 12, angle: 1.4, spread: 0.6, width: 1.4, alpha: [0.1, 0.3] }); });
  P.gear = prop(220, 220, (c) => { gear(c, 110, 110, 92, 14, '#120c0b'); c.globalCompositeOperation = 'source-atop'; strokes(c, R, { w: 220, h: 220, n: 300, colors: ['#ff7a32', '#3a2018'], len: 10, angle: 0.8, spread: 2, width: 1.2, alpha: [0.05, 0.22] }); });
  P.furnace = prop(240, 260, (c) => { c.fillStyle = '#120c0b'; c.beginPath(); c.moveTo(10, 260); c.lineTo(30, 80); c.lineTo(90, 40); c.lineTo(90, 0); c.lineTo(130, 0); c.lineTo(130, 40); c.lineTo(210, 80); c.lineTo(230, 260); c.fill(); c.fillStyle = '#1f0f0a'; c.beginPath(); c.moveTo(70, 260); c.lineTo(70, 170); c.quadraticCurveTo(120, 120, 170, 170); c.lineTo(170, 260); c.fill(); c.globalCompositeOperation = 'source-atop'; strokes(c, R, { w: 240, h: 260, n: 500, colors: ['#ff7a32', '#2a1810', '#5a2c18'], len: 12, angle: -1.2, spread: 1, width: 1.4, alpha: [0.06, 0.25] }); });
  P.brazier = prop(70, 110, (c) => { c.fillStyle = '#140d0b'; c.beginPath(); c.moveTo(6, 30); c.lineTo(64, 30); c.lineTo(52, 54); c.lineTo(18, 54); c.fill(); c.fillRect(31, 54, 8, 56); c.fillRect(16, 104, 38, 6); });
  P.car = prop(130, 48, (c) => { c.fillStyle = '#16171a'; c.beginPath(); c.moveTo(0, 48); c.lineTo(4, 20); c.lineTo(30, 14); c.lineTo(46, 0); c.lineTo(96, 0); c.lineTo(112, 14); c.lineTo(130, 20); c.lineTo(130, 48); c.fill(); c.fillStyle = '#0a0a0c'; c.fillRect(52, 4, 38, 12); c.beginPath(); c.arc(26, 46, 11, 0, 7); c.arc(104, 46, 11, 0, 7); c.fill(); c.globalCompositeOperation = 'source-atop'; strokes(c, R, { w: 130, h: 48, n: 260, colors: ['#6a3420', '#2c2c32', '#8a5030'], len: 9, angle: 0, spread: 2, width: 1.3, alpha: [0.15, 0.4] }); c.fillStyle = 'rgba(255,170,100,0.35)'; c.fillRect(0, 20, 130, 1.5); });
  P.crate = prop(80, 80, (c) => { c.fillStyle = ['#1c1511'][0]; c.fillRect(0, 0, 80, 80); c.strokeStyle = '#0c0907'; c.lineWidth = 3; c.strokeRect(2, 2, 76, 76); c.beginPath(); c.moveTo(2, 2); c.lineTo(78, 78); c.stroke(); c.globalCompositeOperation = 'source-atop'; strokes(c, R, { w: 80, h: 80, n: 200, colors: ['#4a3420', '#0c0907', '#6a4a2a'], len: 14, angle: 0, spread: 0.2, width: 1.4, alpha: [0.15, 0.35] }); c.fillStyle = 'rgba(255,170,100,0.3)'; c.fillRect(0, 0, 80, 1.5); });
  return P;
}

// ---------- Level III: storm aftermath ----------
function railyardLayers(R) {
  const far = makeCanvas(LAYER_W, VIEW_H), fc = ctxOf(far);
  fc.fillStyle = '#1c2a34';
  for (let i = 0; i < 30; i++) { const x = R() * LAYER_W, w = 40 + R() * 90, h = 60 + R() * 150; wrap(LAYER_W, x, w, (xx) => ruin(fc, rng(i * 11 + 4), xx, 380, w, h, '#1c2a34', { lit: 0.02, hole: '#141f27' })); }
  for (let i = 0; i < 3; i++) { const x = R() * LAYER_W; wrap(LAYER_W, x, 60, (xx) => { fc.fillStyle = '#1c2a34'; fc.fillRect(xx - 3, 250, 6, 130); fc.fillRect(xx + 30, 250, 6, 130); fc.beginPath(); fc.ellipse(xx + 16, 238, 34, 22, 0, 0, 7); fc.fill(); }); }
  fc.fillStyle = '#1c2a34'; fc.fillRect(0, 376, LAYER_W, 200);
  // standing floodwater catching the moon
  fc.fillStyle = 'rgba(150,190,210,0.12)'; for (let i = 0; i < 90; i++) fc.fillRect(R() * LAYER_W, 384 + R() * 40, 20 + R() * 60, 1.2);
  hazeAtop(fc, 120, 420, '#4a6878', 0.5, 0.15);
  const mid = makeCanvas(LAYER_W, VIEW_H), mc = ctxOf(mid);
  for (let i = 0; i < 9; i++) {
    const x = (i / 9) * LAYER_W + R() * 60, w = 150 + R() * 60, h = 70 + R() * 20, tilt = (R() - 0.5) * 0.08;
    wrap(LAYER_W, x, w, (xx) => {
      mc.save(); mc.translate(xx, 430); mc.rotate(tilt); mc.fillStyle = '#111a20'; mc.fillRect(0, -h, w, h);
      mc.fillStyle = '#0a1015'; for (let k = 1; k < 5; k++) mc.fillRect(k * w / 5 - 2, -h, 4, h);
      mc.beginPath(); mc.arc(w * 0.2, 2, 12, 0, 7); mc.arc(w * 0.8, 2, 12, 0, 7); mc.fill(); mc.restore();
    });
  }
  // catenary masts and sagging wires
  const masts = []; for (let x = 100; x < LAYER_W; x += 400) masts.push(x);
  mc.strokeStyle = '#0d151a';
  masts.forEach((x) => { mc.lineWidth = 7; mc.beginPath(); mc.moveTo(x, 440); mc.lineTo(x, 130); mc.stroke(); mc.lineWidth = 4; mc.beginPath(); mc.moveTo(x, 150); mc.lineTo(x + 90, 150); mc.moveTo(x, 190); mc.lineTo(x + 70, 150); mc.stroke(); });
  mc.lineWidth = 1.2; masts.forEach((x, i) => { const nx = masts[i + 1] ?? LAYER_W + 100; for (let k = 0; k < 2; k++) { mc.beginPath(); mc.moveTo(x + 40 + k * 40, 152); mc.quadraticCurveTo((x + nx) / 2 + 40, 200 + k * 10, nx + 40 + k * 40, 152); mc.stroke(); } });
  strokes(mc, R, { w: LAYER_W, h: VIEW_H, n: 1700, colors: ['#22323a', '#060a0c'], len: 10, angle: -1.57, spread: 0.12, width: 1.3 });
  hazeAtop(mc, 100, 460, '#3a5462', 0.32, 0.08);
  const near = makeCanvas(LAYER_W, VIEW_H), nc = ctxOf(near);
  for (let i = 0; i < 4; i++) {
    const x = (i / 4) * LAYER_W + R() * 160;
    wrap(LAYER_W, x, 260, (xx) => {
      nc.fillStyle = '#081014'; nc.fillRect(xx - 12, 60, 24, 500); nc.fillRect(xx + 228, 60, 24, 500);
      nc.fillRect(xx - 20, 50, 280, 30); truss(nc, xx, 80, xx + 240, 36, '#081014');
      for (let s = 0; s < 3; s++) { nc.fillStyle = '#081014'; nc.fillRect(xx + 40 + s * 70, 116, 30, 24); nc.fillStyle = s === 1 ? 'rgba(160,230,200,0.5)' : 'rgba(255,90,60,0.35)'; nc.beginPath(); nc.arc(xx + 55 + s * 70, 128, 6, 0, 7); nc.fill(); }
    });
  }
  nc.save(); nc.globalCompositeOperation = 'source-atop';
  strokes(nc, R, { w: LAYER_W, h: VIEW_H, n: 2600, colors: ['#1a2a30', '#0e161a', '#3a3028'], len: 14, angle: -1.57, spread: 0.3, width: 1.5, alpha: [0.1, 0.3] });
  nc.restore(); rimAtop(nc, R, '#8ac0d8', 900, 1);
  const fg = makeCanvas(LAYER_W, VIEW_H), gc = ctxOf(fg);
  gc.strokeStyle = '#030506'; gc.lineCap = 'round';
  for (let i = 0; i < 10; i++) { const x = R() * LAYER_W; wrap(LAYER_W, x, 80, (xx) => { for (let b = 0; b < 18; b++) { gc.lineWidth = 1.5 + R() * 2; gc.beginPath(); gc.moveTo(xx + (R() - 0.5) * 80, 545); gc.quadraticCurveTo(xx + (R() - 0.5) * 50, 500, xx + (R() - 0.5) * 70, 440 + R() * 60); gc.stroke(); } }); }
  gc.lineWidth = 2; for (let i = 0; i < 4; i++) { const x = R() * LAYER_W; gc.beginPath(); gc.moveTo(x, -5); gc.quadraticCurveTo(x + 120, 80 + R() * 60, x + 320, -5); gc.stroke(); }
  return { far, mid, near, fg };
}
function shard(c, x, base, w, h, lean, color) {
  c.fillStyle = color; c.beginPath(); c.moveTo(x - w / 2, base); c.lineTo(x + lean * h - w * 0.1, base - h); c.lineTo(x + lean * h + w * 0.12, base - h * 0.92); c.lineTo(x + w / 2, base); c.closePath(); c.fill();
}
function wastesLayers(R) {
  const far = makeCanvas(LAYER_W, VIEW_H), fc = ctxOf(far);
  fc.fillStyle = '#2a1e34'; fc.beginPath(); fc.moveTo(0, VIEW_H);
  for (let x = 0; x <= LAYER_W; x += 32) fc.lineTo(x, 372 + Math.sin(x * 0.003) * 22 + Math.sin(x * 0.011) * 7);
  fc.lineTo(LAYER_W, VIEW_H); fc.fill();
  for (let i = 0; i < 26; i++) { const x = R() * LAYER_W; wrap(LAYER_W, x, 40, (xx) => shard(fc, xx, 380, 12 + R() * 20, 60 + R() * 170, (R() - 0.5) * 0.3, '#2a1e34')); }
  hazeAtop(fc, 140, 420, '#7a5280', 0.5, 0.15);
  const mid = makeCanvas(LAYER_W, VIEW_H), mc = ctxOf(mid);
  mc.fillStyle = '#170f1e'; mc.beginPath(); mc.moveTo(0, VIEW_H);
  for (let x = 0; x <= LAYER_W; x += 24) mc.lineTo(x, 418 + Math.sin(x * 0.005 + 2) * 12);
  mc.lineTo(LAYER_W, VIEW_H); mc.fill();
  for (let i = 0; i < 14; i++) {
    const x = (i / 14) * LAYER_W + R() * 90;
    wrap(LAYER_W, x, 120, (xx) => { const n = 2 + ((R() * 3) | 0); for (let k = 0; k < n; k++) shard(mc, xx + (k - n / 2) * 26, 424, 26 + R() * 30, 110 + R() * 200, (R() - 0.5) * 0.5, '#170f1e'); mc.fillStyle = 'rgba(210,150,255,0.28)'; mc.fillRect(xx - 2, 300 + R() * 60, 3, 50); });
  }
  strokes(mc, R, { w: LAYER_W, h: VIEW_H, n: 1600, colors: ['#2e2238', '#08060a'], len: 12, angle: -1.2, spread: 0.3, width: 1.3 });
  hazeAtop(mc, 100, 460, '#5a3a66', 0.32, 0.08);
  const near = makeCanvas(LAYER_W, VIEW_H), nc = ctxOf(near);
  for (let i = 0; i < 6; i++) {
    const x = (i / 6) * LAYER_W + R() * 140;
    wrap(LAYER_W, x, 220, (xx) => { for (let k = 0; k < 4; k++) shard(nc, xx + (k - 2) * 50, 560, 60 + R() * 50, 300 + R() * 260, (R() - 0.5) * 0.35, '#0c0812'); });
  }
  nc.save(); nc.globalCompositeOperation = 'source-atop';
  strokes(nc, R, { w: LAYER_W, h: VIEW_H, n: 3000, colors: ['#241a2e', '#120c18', '#3a2a40'], len: 18, angle: -1.4, spread: 0.3, width: 1.6, alpha: [0.1, 0.3] });
  nc.restore(); rimAtop(nc, R, '#d08aff', 1000, 1);
  const fg = makeCanvas(LAYER_W, VIEW_H), gc = ctxOf(fg);
  // kept low and sparse: tall foreground glass hid the floor line and the fighters behind it
  for (let i = 0; i < 6; i++) { const x = R() * LAYER_W; wrap(LAYER_W, x, 120, (xx) => { for (let k = 0; k < 3; k++) shard(gc, xx + (R() - 0.5) * 160, 545, 10 + R() * 16, 24 + R() * 34, (R() - 0.5) * 0.8, '#040306'); }); }
  return { far, mid, near, fg };
}
function arch(c, x, base, w, h, color) {
  c.fillStyle = color; c.beginPath(); c.moveTo(x, base); c.lineTo(x, base - h + w / 2); c.quadraticCurveTo(x, base - h - w * 0.15, x + w / 2, base - h - w * 0.35); c.quadraticCurveTo(x + w, base - h - w * 0.15, x + w, base - h + w / 2); c.lineTo(x + w, base); c.closePath(); c.fill();
}
function cathedralLayers(R) {
  const far = makeCanvas(LAYER_W, VIEW_H), fc = ctxOf(far);
  for (let i = 0; i < 12; i++) {
    const x = R() * LAYER_W, w = 40 + R() * 50, h = 120 + R() * 180;
    wrap(LAYER_W, x, w + 20, (xx) => { fc.fillStyle = '#2a2622'; fc.fillRect(xx, 390 - h, w, h); fc.beginPath(); fc.moveTo(xx - 4, 390 - h); fc.lineTo(xx + w / 2, 390 - h - 60 - R() * 70); fc.lineTo(xx + w + 4, 390 - h); fc.fill(); fc.fillStyle = 'rgba(255,190,110,0.18)'; fc.fillRect(xx + w / 2 - 3, 390 - h + 20, 6, 16); });
  }
  fc.fillStyle = '#2a2622'; fc.fillRect(0, 386, LAYER_W, 200);
  hazeAtop(fc, 100, 420, '#6a5a42', 0.5, 0.18);
  const mid = makeCanvas(LAYER_W, VIEW_H), mc = ctxOf(mid);
  for (let i = 0; i < 8; i++) {
    const x = (i / 8) * LAYER_W, w = 150;
    wrap(LAYER_W, x, w + 40, (xx) => {
      mc.fillStyle = '#16130f'; mc.fillRect(xx - 20, 80, 40, 360);
      arch(mc, xx + 20, 432, w - 40, 260, '#16130f');
      mc.save(); mc.globalCompositeOperation = 'destination-out'; arch(mc, xx + 40, 300, w - 80, 120, '#000'); mc.restore();
      // stained glass, half shattered
      const cols = ['rgba(255,170,90,0.4)', 'rgba(120,170,255,0.32)', 'rgba(255,90,70,0.3)', 'rgba(255,220,150,0.36)'];
      for (let k = 0; k < 14; k++) { if (R() < 0.35) continue; mc.fillStyle = cols[(R() * cols.length) | 0]; mc.fillRect(xx + 44 + R() * (w - 96), 196 + R() * 100, 8 + R() * 10, 10 + R() * 14); }
    });
  }
  mc.fillStyle = '#16130f'; mc.fillRect(0, 60, LAYER_W, 24);
  strokes(mc, R, { w: LAYER_W, h: VIEW_H, n: 1700, colors: ['#2e2820', '#070605'], len: 10, angle: -1.57, spread: 0.1, width: 1.3 });
  hazeAtop(mc, 80, 460, '#5a4a34', 0.34, 0.1);
  const near = makeCanvas(LAYER_W, VIEW_H), nc = ctxOf(near);
  for (let i = 0; i < 5; i++) {
    const x = (i / 5) * LAYER_W + R() * 120, w = 70 + R() * 30;
    wrap(LAYER_W, x, w + 60, (xx) => {
      nc.fillStyle = '#0c0a08'; nc.fillRect(xx, -10, w, 580); nc.fillRect(xx - 16, 380, w + 32, 30); nc.fillRect(xx - 10, 30, w + 20, 24);
      for (let k = 0; k < 4; k++) { nc.fillStyle = '#060504'; nc.fillRect(xx + 10 + k * (w - 20) / 4, 60, 4, 320); }
      if (R() < 0.6) { nc.fillStyle = '#0c0a08'; nc.beginPath(); nc.moveTo(xx + w, 260); nc.lineTo(xx + w + 60, 300); nc.lineTo(xx + w + 60, 470); nc.lineTo(xx + w, 470); nc.fill(); }
    });
  }
  nc.save(); nc.globalCompositeOperation = 'source-atop';
  strokes(nc, R, { w: LAYER_W, h: VIEW_H, n: 2600, colors: ['#2a241c', '#141210', '#3a3024'], len: 14, angle: -1.57, spread: 0.4, width: 1.5, alpha: [0.1, 0.3] });
  nc.restore(); rimAtop(nc, R, '#e0b070', 1000, 1);
  const fg = makeCanvas(LAYER_W, VIEW_H), gc = ctxOf(fg);
  gc.strokeStyle = '#030202'; gc.lineCap = 'round';
  for (let i = 0; i < 7; i++) { const x = R() * LAYER_W, len = 80 + R() * 160; gc.lineWidth = 5; gc.setLineDash([10, 5]); gc.beginPath(); gc.moveTo(x, -5); gc.lineTo(x, len); gc.stroke(); gc.setLineDash([]); gc.fillStyle = '#030202'; gc.beginPath(); gc.moveTo(x - 22, len + 8); gc.lineTo(x + 22, len + 8); gc.lineTo(x + 12, len + 26); gc.lineTo(x - 12, len + 26); gc.fill(); }
  gc.fillStyle = '#030202'; for (let i = 0; i < 6; i++) { const x = R() * LAYER_W; gc.beginPath(); gc.moveTo(x - 90, 545); for (let s = 0; s <= 6; s++) gc.lineTo(x - 90 + s * 30, 500 - R() * 30); gc.lineTo(x + 90, 545); gc.fill(); }
  return { far, mid, near, fg };
}
function groundTile3(R, zone) {
  const cv = makeCanvas(512, 256), c = ctxOf(cv);
  const gr = c.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, ['#24303a', '#33263a', '#3a332a'][zone]); gr.addColorStop(0.3, ['#141c22', '#1a1220', '#1c1814'][zone]); gr.addColorStop(1, '#060708');
  c.fillStyle = gr; c.fillRect(0, 0, 512, 256);
  if (zone === 0) {
    dabs(c, R, { w: 512, h: 240, n: 500, colors: ['#3a4248', '#20282c', '#4a4a44'], r: [2, 5], alpha: [0.3, 0.6] });
    c.fillStyle = '#1a140f'; for (let x = 6; x < 512; x += 42) c.fillRect(x, 6, 26, 9);
    c.fillStyle = '#5a6a72'; c.fillRect(0, 2, 512, 3); c.fillStyle = 'rgba(180,220,240,0.25)'; c.fillRect(0, 2, 512, 1);
  } else if (zone === 1) {
    strokes(c, R, { w: 512, h: 256, n: 1100, colors: ['#4a3458', '#0c0810', '#6a4a7a'], len: 9, angle: 0.4, spread: 2.5, width: 1.3, alpha: [0.15, 0.35] });
    c.strokeStyle = 'rgba(220,170,255,0.25)'; c.lineWidth = 1; for (let i = 0; i < 18; i++) { let x = R() * 512, y = R() * 180; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (R() - 0.5) * 40; y += R() * 20; c.lineTo(x, y); } c.stroke(); }
  } else {
    c.strokeStyle = '#0a0806'; c.lineWidth = 2; for (let x = 0; x < 512; x += 96) { c.strokeRect(x + 1, 1, 94, 46); c.strokeRect(x + 49, 49, 94, 46); }
    c.fillStyle = 'rgba(200,160,90,0.18)'; for (let x = 0; x < 512; x += 96) c.fillRect(x + 4, 4, 88, 1.5);
    strokes(c, R, { w: 512, h: 256, n: 1200, colors: ['#4a3e30', '#0a0806', '#5a4a38'], len: 10, angle: 1.57, spread: 0.5, width: 1.4, alpha: [0.1, 0.3] });
  }
  return cv;
}
function lipStrip3(R, zone) {
  const cv = makeCanvas(512, 44), c = ctxOf(cv);
  if (zone === 0) {
    c.fillStyle = '#2a3238'; c.fillRect(0, 18, 512, 7);
    for (let i = 0; i < 120; i++) { c.fillStyle = ['#3a4248', '#1c2226', '#4a4a42'][(R() * 3) | 0]; c.beginPath(); c.arc(R() * 512, 19 + R() * 3, 1.5 + R() * 2.5, 0, 7); c.fill(); }
    c.fillStyle = 'rgba(170,215,235,0.3)'; c.fillRect(0, 18, 512, 1.2);
  } else if (zone === 1) {
    c.fillStyle = '#2e2236'; c.fillRect(0, 18, 512, 7);
    for (let i = 0; i < 60; i++) { const x = R() * 512, h = 4 + R() * 12; c.fillStyle = R() < 0.3 ? 'rgba(220,170,255,0.5)' : '#3e2c4a'; c.beginPath(); c.moveTo(x - 3, 20); c.lineTo(x + (R() - 0.5) * 4, 20 - h); c.lineTo(x + 3, 20); c.fill(); }
  } else {
    c.fillStyle = '#3a3226'; c.fillRect(0, 16, 512, 9); c.fillStyle = '#120e0a'; c.fillRect(0, 25, 512, 2);
    c.fillStyle = '#7a6036'; for (let x = 0; x < 512; x += 64) c.fillRect(x + 4, 18, 56, 1.5);
    c.fillStyle = 'rgba(255,210,150,0.3)'; c.fillRect(0, 16, 512, 1.2);
  }
  return cv;
}
function buildProps3(R) {
  const P = {};
  P.boxcar = prop(180, 68, (c) => { c.fillStyle = '#141c22'; c.fillRect(0, 0, 180, 60); c.fillStyle = '#0a1014'; for (let x = 12; x < 180; x += 28) c.fillRect(x, 4, 3, 52); c.fillRect(70, 8, 40, 48); c.beginPath(); c.arc(36, 62, 9, 0, 7); c.arc(144, 62, 9, 0, 7); c.fill(); c.globalCompositeOperation = 'source-atop'; strokes(c, R, { w: 180, h: 68, n: 300, colors: ['#6a3a22', '#2a3a44', '#8a5030'], len: 10, angle: 1.57, spread: 0.4, width: 1.3, alpha: [0.15, 0.4] }); c.fillStyle = 'rgba(170,215,235,0.35)'; c.fillRect(0, 0, 180, 1.5); });
  P.crystal = prop(90, 60, (c) => { [[20, 30, 42, -0.2], [46, 36, 60, 0.05], [70, 26, 38, 0.25]].forEach(([x, w, h, l]) => shard(c, x, 60, w, h, l, '#2a1a38')); c.globalCompositeOperation = 'source-atop'; strokes(c, R, { w: 90, h: 60, n: 160, colors: ['#c08aff', '#4a2a5a', '#1a0e22'], len: 10, angle: -1.4, spread: 0.4, width: 1.3, alpha: [0.15, 0.45] }); c.fillStyle = 'rgba(230,190,255,0.5)'; c.fillRect(0, 0, 90, 1.5); });
  P.pillar = prop(80, 70, (c) => { c.fillStyle = '#2a241e'; c.fillRect(0, 0, 80, 70); c.fillStyle = '#1a1612'; for (let x = 8; x < 80; x += 16) c.fillRect(x, 0, 5, 70); c.fillStyle = '#3a3228'; c.fillRect(-2, 0, 84, 8); c.globalCompositeOperation = 'source-atop'; strokes(c, R, { w: 80, h: 70, n: 160, colors: ['#5a4a38', '#0c0a08'], len: 9, angle: 0.4, spread: 2, width: 1.3, alpha: [0.15, 0.4] }); c.fillStyle = 'rgba(255,210,150,0.3)'; c.fillRect(0, 0, 80, 1.5); });
  P.tower = prop(110, 300, (c) => { c.fillStyle = '#0e161a'; c.fillRect(20, 110, 8, 190); c.fillRect(82, 110, 8, 190); c.strokeStyle = '#0e161a'; c.lineWidth = 3; for (let y = 130; y < 300; y += 50) { c.beginPath(); c.moveTo(24, y); c.lineTo(86, y + 40); c.moveTo(86, y); c.lineTo(24, y + 40); c.stroke(); } c.beginPath(); c.ellipse(55, 70, 50, 46, 0, 0, 7); c.fill(); c.fillRect(5, 70, 100, 44); c.globalCompositeOperation = 'source-atop'; strokes(c, R, { w: 110, h: 300, n: 300, colors: ['#5a3420', '#2a3a44'], len: 12, angle: 1.57, spread: 0.3, width: 1.4, alpha: [0.1, 0.35] }); });
  P.ties = prop(240, 26, (c) => { c.fillStyle = '#1a140f'; for (let x = 4; x < 240; x += 26) { c.save(); c.translate(x, 18); c.rotate((R() - 0.5) * 0.3); c.fillRect(0, -4, 18, 8); c.restore(); } c.fillStyle = '#3a444a'; c.save(); c.translate(0, 12); c.rotate(-0.04); c.fillRect(0, 0, 200, 3); c.restore(); });
  P.wagon = prop(230, 120, (c) => { c.save(); c.translate(115, 120); c.rotate(-0.12); c.fillStyle = '#0e1418'; c.fillRect(-105, -96, 210, 86); c.fillStyle = '#081014'; c.fillRect(-90, -84, 40, 30); c.fillRect(-30, -84, 40, 30); c.fillRect(30, -84, 40, 30); c.beginPath(); c.arc(-70, -6, 14, 0, 7); c.arc(70, -6, 14, 0, 7); c.fill(); c.restore(); c.globalCompositeOperation = 'source-atop'; strokes(c, R, { w: 230, h: 120, n: 300, colors: ['#5a3420', '#2a3a44'], len: 10, angle: 0, spread: 2, width: 1.3, alpha: [0.12, 0.35] }); });
  P.spire = prop(120, 260, (c) => { shard(c, 50, 260, 40, 250, 0.05, '#1c1226'); shard(c, 80, 260, 30, 160, 0.2, '#160e1e'); shard(c, 26, 260, 22, 110, -0.25, '#160e1e'); c.globalCompositeOperation = 'source-atop'; strokes(c, R, { w: 120, h: 260, n: 360, colors: ['#c08aff', '#3a2448', '#0a0610'], len: 16, angle: -1.5, spread: 0.2, width: 1.3, alpha: [0.08, 0.32] }); });
  P.bones = prop(160, 50, (c) => { c.strokeStyle = '#3a3430'; c.lineCap = 'round'; c.lineWidth = 5; c.beginPath(); c.moveTo(20, 46); c.quadraticCurveTo(80, 0, 140, 46); c.stroke(); c.lineWidth = 3; for (let i = 0; i < 7; i++) { const x = 34 + i * 15; c.beginPath(); c.moveTo(x, 20 + Math.abs(i - 3) * 4); c.quadraticCurveTo(x + 6, 36, x + 2, 48); c.stroke(); } c.fillStyle = '#3a3430'; c.beginPath(); c.ellipse(146, 40, 12, 9, 0.3, 0, 7); c.fill(); });
  P.statue = prop(120, 230, (c) => { c.fillStyle = '#16120e'; c.fillRect(20, 190, 80, 40); c.fillRect(30, 180, 60, 12); c.beginPath(); c.moveTo(38, 180); c.lineTo(44, 80); c.lineTo(76, 80); c.lineTo(84, 180); c.fill(); c.beginPath(); c.arc(60, 64, 16, 0, 7); c.fill(); c.beginPath(); c.moveTo(44, 96); c.lineTo(8, 40); c.lineTo(14, 36); c.lineTo(52, 88); c.fill(); c.beginPath(); c.moveTo(76, 96); c.lineTo(112, 52); c.lineTo(104, 46); c.lineTo(70, 88); c.fill(); c.globalCompositeOperation = 'source-atop'; strokes(c, R, { w: 120, h: 230, n: 400, colors: ['#5a4a36', '#0a0806', '#8a7050'], len: 10, angle: -1.57, spread: 0.6, width: 1.3, alpha: [0.1, 0.35] }); });
  P.pew = prop(200, 50, (c) => { c.fillStyle = '#140f0b'; c.fillRect(0, 10, 200, 8); c.fillRect(0, 26, 200, 6); c.fillRect(6, 10, 8, 40); c.fillRect(186, 10, 8, 40); c.save(); c.translate(100, 40); c.rotate(0.15); c.fillRect(-60, -3, 120, 6); c.restore(); });
  P.signal = prop(60, 160, (c) => { c.fillStyle = '#0e1418'; c.fillRect(26, 30, 7, 130); c.fillRect(14, 10, 32, 44); c.fillStyle = '#9fe8c8'; c.beginPath(); c.arc(30, 22, 6, 0, 7); c.fill(); c.fillStyle = '#3a1410'; c.beginPath(); c.arc(30, 40, 6, 0, 7); c.fill(); });
  P.cluster = prop(90, 80, (c) => { [[24, 26, 60, -0.25], [48, 30, 78, 0.02], [70, 22, 50, 0.3]].forEach(([x, w, h, l]) => shard(c, x, 80, w, h, l, '#6a3a9a')); c.globalCompositeOperation = 'source-atop'; strokes(c, R, { w: 90, h: 80, n: 200, colors: ['#e8c8ff', '#9a5ad0', '#3a1a5a'], len: 12, angle: -1.45, spread: 0.3, width: 1.3, alpha: [0.2, 0.55] }); });
  P.candles = prop(80, 120, (c) => { c.fillStyle = '#18120c'; c.fillRect(37, 30, 6, 90); c.fillRect(22, 112, 36, 8); c.fillRect(10, 40, 60, 5); [14, 40, 66].forEach((x) => { c.fillRect(x - 3, 26, 6, 16); c.fillStyle = '#d8c8a8'; c.fillRect(x - 2, 14, 4, 13); c.fillStyle = '#18120c'; }); });
  return P;
}
export function buildLevel3Art(seed = 7) {
  const R = rng(seed + 200), glow = glowSprite(128);
  return {
    skies: [
      sky(R, [[0, '#060b10'], [0.42, '#14212a'], [0.64, '#2c4250'], [0.73, '#3e5662'], [1, '#0c1216']], { x: 640, y: 210, r: 300, c: 'rgba(200,230,255,0.2)' }, ['#22323c', '#34485a', '#121c24', '#4a5a64']),
      sky(R, [[0, '#0a0610'], [0.42, '#22142e'], [0.63, '#52304e'], [0.73, '#8a4a62'], [1, '#100a12']], { x: 400, y: 340, r: 440, c: 'rgba(230,130,200,0.24)' }, ['#2a1c34', '#4a2a4a', '#140c1a', '#7a4a6a']),
      sky(R, [[0, '#0a0908'], [0.42, '#1e1a16'], [0.64, '#4a3c2a'], [0.73, '#6e5534'], [1, '#0e0c0a']], { x: 560, y: 320, r: 420, c: 'rgba(255,200,120,0.22)' }, ['#2a2620', '#3e3628', '#16130f', '#6a5638'])
    ],
    layers: [railyardLayers(rng(seed * 11 + 5)), wastesLayers(rng(seed * 13 + 6)), cathedralLayers(rng(seed * 17 + 7))],
    ground: [0, 1, 2].map((z) => groundTile3(rng(seed + 140 + z), z)),
    lips: [0, 1, 2].map((z) => lipStrip3(rng(seed + 160 + z), z)),
    fog: [fogSprite(rng(181), '#7a98a8'), fogSprite(rng(182), '#9a7aa8'), fogSprite(rng(183), '#a8987a')],
    props: { ...buildProps(rng(seed + 99)), ...buildProps3(rng(seed + 299)) },
    glow, grain: grainTile(rng(5)), vignette: vignette(),
    warmGlow: tintedGlow(glow, '#ff9a4a'), coolGlow: tintedGlow(glow, '#8fd8ff'), redGlow: tintedGlow(glow, '#ff3a2a'), violetGlow: tintedGlow(glow, '#c58aff'), whiteGlow: glow
  };
}

// ---------- atmosphere ----------
function fogSprite(R, color) {
  const cv = makeCanvas(640, 240), c = ctxOf(cv);
  for (let i = 0; i < 46; i++) {
    const x = 80 + R() * 480, y = 70 + R() * 100, r = 40 + R() * 90;
    const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(color, 0.12 + R() * 0.1)); g.addColorStop(1, rgba(color, 0));
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return cv;
}
function grainTile(R) {
  const cv = makeCanvas(256, 256), c = ctxOf(cv), img = c.createImageData ? c.createImageData(256, 256) : null;
  if (!img || !img.data || !img.data.length) return cv;
  for (let i = 0; i < img.data.length; i += 4) { const v = (R() * 255) | 0; img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255; }
  c.putImageData(img, 0, 0); return cv;
}
function vignette() {
  const cv = makeCanvas(VIEW_W, VIEW_H), c = ctxOf(cv);
  const g = c.createRadialGradient(VIEW_W / 2, VIEW_H * 0.48, VIEW_H * 0.3, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.68);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.7, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0.85)');
  c.fillStyle = g; c.fillRect(0, 0, VIEW_W, VIEW_H); return cv;
}
export function glowSprite(size = 128) {
  const cv = makeCanvas(size, size), c = ctxOf(cv), h = size / 2;
  const g = c.createRadialGradient(h, h, 0, h, h, h); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, size, size); return cv;
}
// Colour-tinted copies of the glow so additive lights avoid per-frame gradients.
export function tintedGlow(base, color) {
  const cv = makeCanvas(base.width, base.height), c = ctxOf(cv);
  c.drawImage(base, 0, 0); c.globalCompositeOperation = 'source-in'; c.fillStyle = color; c.fillRect(0, 0, cv.width, cv.height); return cv;
}

export function buildArt(seed = 7) {
  const R = rng(seed);
  const skies = [
    sky(R, [[0, '#0a1114'], [0.42, '#1b272b'], [0.63, '#3a3a33'], [0.72, '#4b3c2f'], [1, '#121515']], { x: 690, y: 300, r: 380, c: 'rgba(255,186,120,0.22)' }, ['#2c3a3e', '#3e4a4a', '#1a2427', '#5a4c40']),
    sky(R, [[0, '#0c0f13'], [0.45, '#242128'], [0.66, '#4f362a'], [0.74, '#6a4430'], [1, '#110e0f']], { x: 300, y: 330, r: 420, c: 'rgba(255,140,70,0.24)' }, ['#2a2730', '#3a3034', '#1a171c', '#6a4a38']),
    sky(R, [[0, '#110908'], [0.42, '#2a1410'], [0.64, '#6a2c14'], [0.73, '#8a3a16'], [1, '#120a08']], { x: 520, y: 340, r: 460, c: 'rgba(255,110,40,0.3)' }, ['#2a1612', '#4a2216', '#160c0a', '#7a3a1c'])
  ];
  const layers = [woodsLayers(rng(seed * 3 + 1)), quarterLayers(rng(seed * 5 + 2)), foundryLayers(rng(seed * 7 + 3))];
  const ground = [0, 1, 2].map((z) => groundTile(rng(seed + 40 + z), z));
  const lips = [0, 1, 2].map((z) => lipStrip(rng(seed + 60 + z), z));
  const fog = [fogSprite(rng(81), '#8a9894'), fogSprite(rng(82), '#8c7a70'), fogSprite(rng(83), '#a0705a')];
  const glow = glowSprite(128);
  return {
    skies, layers, ground, lips, fog, glow,
    props: buildProps(rng(seed + 99)), grain: grainTile(rng(5)), vignette: vignette(),
    warmGlow: tintedGlow(glow, '#ff9a4a'), coolGlow: tintedGlow(glow, '#8fd8ff'), redGlow: tintedGlow(glow, '#ff3a2a'), whiteGlow: glow
  };
}
