import type { CasteId, FoodKind } from '../types';

/**
 * Procedural sprites, drawn in board pixels around (x, y). Storybook look: chunky ink outlines, flat fills, one
 * highlight. Ants are three ellipses and six leg strokes; caste reads by one feature (jaws, big head, leaf, wings,
 * amber belly...), so the colony is legible at 10 px.
 */
export const INK = '#2b1d14';
type C = CanvasRenderingContext2D;

const CASTE_BODY: Record<CasteId, string> = {
  worker: '#4a2c1c', porter: '#5d321b', soldier: '#7c2617', digger: '#6b4a2a', leafcutter: '#5a4220', bridger: '#3b2a22', spitter: '#6a5a1a', flyer: '#3a2c3c', scout: '#2f4460', honeypot: '#4a2c1c'
};

export function drawAnt(ctx: C, x: number, y: number, len: number, dir: number, caste: CasteId, phase: number, opts: { load?: number; rival?: boolean; alpha?: number; stuck?: boolean } = {}): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(dir);
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  const s = len / 10;
  const body = opts.rival ? '#c9361f' : CASTE_BODY[caste];
  ctx.lineCap = 'round';
  // Legs: three per side from the thorax, swinging in a tripod gait.
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(0.8, s * 0.7);
  const swing = opts.stuck ? 0 : Math.sin(phase) * 0.45;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const base = -0.6 + i * 0.6, sw = (i % 2 ? -swing : swing);
    for (const side of [-1, 1]) {
      const ang = (Math.PI / 2 + (i - 1) * 0.55 + sw * side) * side;
      ctx.moveTo(base * s, 0);
      const kx = base * s + Math.cos(ang) * 2.4 * s, ky = Math.sin(ang) * 2.4 * s;
      ctx.lineTo(kx, ky);
      ctx.lineTo(kx + Math.cos(ang + side * 0.6 - (i - 1) * 0.4 * side) * 1.8 * s, ky + Math.sin(ang + side * 0.6) * 1.6 * s);
    }
  }
  ctx.stroke();
  // Wings under everything else.
  if (caste === 'flyer') {
    ctx.fillStyle = 'rgba(220,240,255,.75)';
    ctx.strokeStyle = 'rgba(43,29,20,.5)';
    ctx.lineWidth = s * 0.4;
    const flap = 0.25 + Math.abs(Math.sin(phase * 2.6)) * 0.35;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(-0.8 * s, side * 2.6 * s, 3.2 * s, 1.3 * s, side * flap, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
  }
  ctx.lineWidth = Math.max(1, s * 0.8);
  ctx.strokeStyle = INK;
  // Abdomen.
  const honey = caste === 'honeypot';
  ctx.fillStyle = honey ? '#f0a92a' : body;
  ctx.beginPath(); ctx.ellipse(-3.4 * s, 0, (honey ? 3.4 : 2.6) * s, (honey ? 3 : 1.9) * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  if (honey) { ctx.fillStyle = 'rgba(255,240,180,.8)'; ctx.beginPath(); ctx.ellipse(-4 * s, -1.1 * s, 1.2 * s, 0.7 * s, 0, 0, Math.PI * 2); ctx.fill(); }
  if (caste === 'spitter') { ctx.fillStyle = '#e8d43a'; ctx.beginPath(); ctx.arc(-5.6 * s, 0, 0.9 * s, 0, Math.PI * 2); ctx.fill(); }
  // Thorax.
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.ellipse(-0.2 * s, 0, 1.5 * s, 1.1 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // Head.
  const head = caste === 'porter' ? 2.3 : caste === 'soldier' ? 2 : 1.6;
  ctx.beginPath(); ctx.ellipse(2.4 * s, 0, head * s, head * 0.9 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // Highlight.
  ctx.fillStyle = 'rgba(255,255,255,.28)';
  ctx.beginPath(); ctx.ellipse(-3.8 * s, -0.8 * s, 1.1 * s, 0.6 * s, 0, 0, Math.PI * 2); ctx.fill();
  // Antennae.
  ctx.lineWidth = Math.max(0.7, s * 0.5);
  const ant = caste === 'scout' ? 4.2 : 3;
  ctx.beginPath();
  for (const side of [-1, 1]) { ctx.moveTo((2.4 + head * 0.6) * s, side * 0.6 * s); ctx.quadraticCurveTo((3.6 + head) * s, side * (1.6 + Math.sin(phase * 0.7) * 0.3) * s, (3.4 + head + ant * 0.5) * s, side * ant * 0.8 * s); }
  ctx.stroke();
  // Soldier jaws / digger clump.
  if (caste === 'soldier') {
    ctx.lineWidth = Math.max(1, s * 0.9);
    ctx.beginPath();
    for (const side of [-1, 1]) { ctx.moveTo((2.4 + head) * s, side * 0.7 * s); ctx.quadraticCurveTo((4.6 + head) * s, side * 1.6 * s, (4.8 + head) * s, side * 0.2 * s); }
    ctx.stroke();
  }
  if (caste === 'digger') { ctx.fillStyle = '#a07a4a'; ctx.beginPath(); ctx.arc((3.6 + head) * s, 0, 1.1 * s, 0, Math.PI * 2); ctx.fill(); }
  // Load in the jaws.
  if (opts.load) {
    ctx.fillStyle = '#f3d79b'; ctx.strokeStyle = INK; ctx.lineWidth = s * 0.5;
    ctx.beginPath(); ctx.arc((3.2 + head) * s, 0, (opts.load > 1 ? 1.9 : 1.5) * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  // Leafcutter's leaf umbrella.
  if (caste === 'leafcutter') {
    ctx.fillStyle = '#5fbf4a'; ctx.strokeStyle = '#2f6b24'; ctx.lineWidth = s * 0.6;
    ctx.beginPath();
    ctx.moveTo(4.5 * s, 0);
    ctx.quadraticCurveTo(0, -5.2 * s, -4.5 * s, -0.4 * s);
    ctx.quadraticCurveTo(0, 4.6 * s, 4.5 * s, 0);
    ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4.5 * s, 0); ctx.lineTo(-4 * s, -0.2 * s); ctx.stroke();
  }
  ctx.restore();
}

/** One food item, shrinking as it is eaten (`frac` = crumbs left / crumbs). */
export function drawFood(ctx: C, kind: FoodKind, x: number, y: number, r: number, frac: number, t: number, wobble = 0): void {
  const k = 0.45 + 0.55 * Math.sqrt(Math.max(0, Math.min(1, frac)));
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(t * 18) * wobble * 0.08);
  ctx.scale(k, k);
  // Soft drop shadow.
  ctx.fillStyle = 'rgba(30,40,10,.22)';
  ctx.beginPath(); ctx.ellipse(r * 0.08, r * 0.62, r * 0.9, r * 0.32, 0, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.09);
  ctx.strokeStyle = INK; ctx.lineJoin = 'round';
  switch (kind) {
    case 'cookie': {
      blob(ctx, r * 0.85, '#d9a45b', 9, 0.06);
      ctx.fillStyle = '#5a321c';
      for (const [a, d] of [[0.3, 0.4], [2.1, 0.5], [3.9, 0.35], [5.1, 0.55], [1.2, 0.1]]) { ctx.beginPath(); ctx.arc(Math.cos(a) * d * r, Math.sin(a) * d * r, r * 0.11, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'bread': {
      ctx.fillStyle = '#c9843d';
      roundRect(ctx, -r * 0.8, -r * 0.7, r * 1.6, r * 1.4, r * 0.45); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f6e2b0'; roundRect(ctx, -r * 0.6, -r * 0.5, r * 1.2, r * 1.05, r * 0.32); ctx.fill();
      break;
    }
    case 'strawberry': {
      ctx.fillStyle = '#e8423a';
      ctx.beginPath(); ctx.moveTo(0, r * 0.95); ctx.bezierCurveTo(-r * 1.1, r * 0.2, -r * 0.8, -r * 0.8, 0, -r * 0.6); ctx.bezierCurveTo(r * 0.8, -r * 0.8, r * 1.1, r * 0.2, 0, r * 0.95); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffe36b';
      for (let i = 0; i < 9; i++) { const a = i * 2.4, d = 0.2 + (i % 3) * 0.17; ctx.beginPath(); ctx.ellipse(Math.cos(a) * d * r, Math.sin(a) * d * r + r * 0.1, r * 0.04, r * 0.07, a, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#4caf3d';
      ctx.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.5; ctx.moveTo(0, -r * 0.6); ctx.lineTo(Math.cos(a) * r * 0.55, -r * 0.6 + Math.sin(a) * r * 0.3 + r * 0.15); } ctx.fill(); ctx.stroke();
      break;
    }
    case 'sugarcube': {
      ctx.fillStyle = '#fbfbf6'; ctx.beginPath(); ctx.moveTo(0, -r * 0.8); ctx.lineTo(r * 0.75, -r * 0.4); ctx.lineTo(r * 0.75, r * 0.45); ctx.lineTo(0, r * 0.85); ctx.lineTo(-r * 0.75, r * 0.45); ctx.lineTo(-r * 0.75, -r * 0.4); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#dfe2e8'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r * 0.75, -r * 0.4); ctx.lineTo(r * 0.75, r * 0.45); ctx.lineTo(0, r * 0.85); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-r * 0.75, -r * 0.4); ctx.lineTo(0, 0); ctx.lineTo(r * 0.75, -r * 0.4); ctx.moveTo(0, 0); ctx.lineTo(0, r * 0.85); ctx.stroke();
      break;
    }
    case 'cake': {
      ctx.fillStyle = '#f7d9a8'; ctx.beginPath(); ctx.moveTo(-r * 0.9, r * 0.6); ctx.lineTo(r * 0.9, r * 0.6); ctx.lineTo(r * 0.2, -r * 0.85); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff9fc6'; ctx.beginPath(); ctx.moveTo(-r * 0.62, r * 0.05); ctx.lineTo(r * 0.68, r * 0.05); ctx.lineTo(r * 0.55, -r * 0.22); ctx.lineTo(-r * 0.45, -r * 0.22); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d4232f'; ctx.beginPath(); ctx.arc(r * 0.2, -r * 0.85, r * 0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      break;
    }
    case 'melon': {
      ctx.fillStyle = '#3e9a3a'; ctx.beginPath(); ctx.arc(0, -r * 0.35, r * 1.2, Math.PI * 0.18, Math.PI * 0.82); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f2545b'; ctx.beginPath(); ctx.arc(0, -r * 0.35, r * 1.02, Math.PI * 0.2, Math.PI * 0.8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2b1d14'; for (let i = 0; i < 6; i++) { const a = Math.PI * (0.32 + i * 0.07); ctx.beginPath(); ctx.ellipse(Math.cos(a) * r * 0.6, -r * 0.35 + Math.sin(a) * r * 0.6, r * 0.05, r * 0.09, a, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'icecream': {
      ctx.fillStyle = '#e8b46a'; ctx.beginPath(); ctx.moveTo(-r * 0.45, -r * 0.05); ctx.lineTo(0, r * 0.95); ctx.lineTo(r * 0.45, -r * 0.05); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffc3dc'; ctx.beginPath(); ctx.arc(0, -r * 0.3, r * 0.58, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffc3dc'; ctx.beginPath(); ctx.ellipse(r * 0.4, r * 0.2 + Math.sin(t * 2) * r * 0.05, r * 0.12, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'grape': {
      ctx.fillStyle = '#8b4fc0';
      for (const [gx, gy] of [[-0.35, -0.3], [0.35, -0.3], [0, -0.35], [-0.18, 0.15], [0.2, 0.15], [0, 0.55]]) { ctx.beginPath(); ctx.arc(gx * r, gy * r, r * 0.34, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      break;
    }
    case 'cheese': {
      ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.moveTo(-r * 0.9, r * 0.55); ctx.lineTo(r * 0.9, r * 0.55); ctx.lineTo(r * 0.9, -r * 0.1); ctx.lineTo(-r * 0.6, -r * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e7a92c'; for (const [hx, hy, hr] of [[-0.2, 0.2, 0.15], [0.45, 0.25, 0.12], [0.3, -0.05, 0.08]]) { ctx.beginPath(); ctx.arc(hx * r, hy * r, hr * r, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'marshmallow': {
      ctx.fillStyle = '#fff8f0'; roundRect(ctx, -r * 0.7, -r * 0.6, r * 1.4, r * 1.2, r * 0.5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f2c38a'; roundRect(ctx, -r * 0.7, r * 0.05, r * 1.4, r * 0.55, r * 0.3); ctx.fill();
      break;
    }
    case 'biscuit': {
      ctx.fillStyle = '#e3a55a';
      ctx.beginPath(); ctx.ellipse(-r * 0.1, 0, r * 0.8, r * 0.48, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r * 0.6, 0); ctx.lineTo(r * 1.05, -r * 0.4); ctx.lineTo(r * 1.05, r * 0.4); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-r * 0.55, -r * 0.1, r * 0.08, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'jam': {
      ctx.fillStyle = '#f0d39a'; roundRect(ctx, -r * 0.8, -r * 0.65, r * 1.6, r * 1.3, r * 0.3); ctx.fill(); ctx.stroke();
      blob(ctx, r * 0.5, '#c2264a', 7, 0.18, false);
      break;
    }
    case 'candy': {
      ctx.fillStyle = '#ff8fb1';
      ctx.beginPath(); ctx.moveTo(-r * 0.4, 0); ctx.lineTo(-r * 0.95, -r * 0.4); ctx.lineTo(-r * 0.95, r * 0.4); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r * 0.4, 0); ctx.lineTo(r * 0.95, -r * 0.4); ctx.lineTo(r * 0.95, r * 0.4); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(0, 0, r * 0.48, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      break;
    }
  }
  // Highlight.
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 0.35, r * 0.2, r * 0.1, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function blob(ctx: C, r: number, fill: string, points: number, wobble: number, stroke = true): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  for (let i = 0; i <= points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2, d = r * (1 + Math.sin(i * 2.7) * wobble);
    if (i === 0) ctx.moveTo(Math.cos(a) * d, Math.sin(a) * d); else ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
  }
  ctx.closePath(); ctx.fill(); if (stroke) ctx.stroke();
}

export function roundRect(ctx: C, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export function drawNest(ctx: C, x: number, y: number, r: number, t: number, pulse: number, rival = false): void {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = 'rgba(30,40,10,.25)'; ctx.beginPath(); ctx.ellipse(r * 0.1, r * 0.25, r * 1.15, r * 0.85, 0, 0, Math.PI * 2); ctx.fill();
  const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.1, 0, 0, r * 1.1);
  grad.addColorStop(0, rival ? '#e0865a' : '#d6a46a'); grad.addColorStop(1, rival ? '#9a3e22' : '#8a5a2e');
  ctx.fillStyle = grad; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, r * 0.08);
  ctx.beginPath(); ctx.ellipse(0, 0, r * (1 + pulse * 0.06), r * 0.82 * (1 + pulse * 0.06), 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,240,210,.35)';
  for (let i = 0; i < 9; i++) { const a = i * 2.1 + 0.4, d = 0.35 + (i % 3) * 0.18; ctx.beginPath(); ctx.arc(Math.cos(a) * d * r, Math.sin(a) * d * r * 0.8, r * 0.06, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#2b1a10'; ctx.beginPath(); ctx.ellipse(0, -r * 0.05, r * 0.32, r * 0.24, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,200,120,.25)'; ctx.beginPath(); ctx.ellipse(0, -r * 0.08, r * 0.18 + Math.sin(t * 3) * r * 0.02, r * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function drawSpider(ctx: C, x: number, y: number, r: number, t: number, angle: number, fighting: boolean): void {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1.4, r * 0.1);
  const twitch = fighting ? Math.sin(t * 30) * 0.15 : Math.sin(t * 3) * 0.06;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) for (const side of [-1, 1]) {
    const a = side * (0.6 + i * 0.55 + twitch * (i % 2 ? 1 : -1));
    const kx = Math.cos(a) * r * 0.75, ky = Math.sin(a) * r * 0.75;
    ctx.moveTo(0, 0); ctx.lineTo(kx, ky); ctx.lineTo(kx + Math.cos(a + side * 0.7) * r * 0.55, ky + Math.sin(a + side * 0.7) * r * 0.55);
  }
  ctx.stroke();
  ctx.fillStyle = '#3a2e3a'; ctx.lineWidth = Math.max(1.4, r * 0.08);
  ctx.beginPath(); ctx.ellipse(-r * 0.35, 0, r * 0.45, r * 0.38, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e9d36a'; ctx.beginPath(); ctx.ellipse(-r * 0.42, 0, r * 0.18, r * 0.08, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4b3b4a'; ctx.beginPath(); ctx.arc(r * 0.18, 0, r * 0.28, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // Big jumping-spider eyes.
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(r * 0.36, side * r * 0.11, r * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(r * 0.39, side * r * 0.11, r * 0.06, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export function drawToad(ctx: C, x: number, y: number, r: number, t: number, angle: number, napping: boolean, tongue: number): void {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  const breathe = 1 + Math.sin(t * (napping ? 1.4 : 2.6)) * 0.04;
  ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, r * 0.07);
  ctx.fillStyle = '#5f8f3a';
  for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(-r * 0.35, side * r * 0.62, r * 0.42, r * 0.22, side * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  ctx.fillStyle = '#7aa84a';
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.78 * breathe, r * 0.68 * breathe, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#9cc46a'; ctx.beginPath(); ctx.ellipse(-r * 0.05, 0, r * 0.45, r * 0.38, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5c7f36'; for (const [wx, wy] of [[-0.4, -0.3], [-0.2, 0.35], [-0.5, 0.15], [0.05, -0.45]]) { ctx.beginPath(); ctx.arc(wx * r, wy * r, r * 0.07, 0, Math.PI * 2); ctx.fill(); }
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#7aa84a'; ctx.beginPath(); ctx.arc(r * 0.42, side * r * 0.3, r * 0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (napping) { ctx.beginPath(); ctx.moveTo(r * 0.32, side * r * 0.3); ctx.lineTo(r * 0.52, side * r * 0.3); ctx.stroke(); }
    else { ctx.fillStyle = '#ffe36b'; ctx.beginPath(); ctx.arc(r * 0.45, side * r * 0.3, r * 0.12, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = INK; ctx.fillRect(r * 0.43, side * r * 0.3 - r * 0.1, r * 0.05, r * 0.2); }
  }
  if (tongue > 0) {
    ctx.strokeStyle = '#e25a7a'; ctx.lineWidth = r * 0.14;
    ctx.beginPath(); ctx.moveTo(r * 0.7, 0); ctx.lineTo(r * 0.7 + tongue, 0); ctx.stroke();
    ctx.fillStyle = '#e25a7a'; ctx.beginPath(); ctx.arc(r * 0.7 + tongue, 0, r * 0.12, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export function drawSparrow(ctx: C, x: number, y: number, r: number, t: number, shadowOnly: boolean): void {
  ctx.save(); ctx.translate(x, y);
  const flap = Math.sin(t * 9) * 0.35;
  ctx.fillStyle = shadowOnly ? 'rgba(20,25,10,.28)' : '#a8794a';
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.55, r * 0.3, 0, 0, Math.PI * 2);
  for (const side of [-1, 1]) { ctx.moveTo(0, 0); ctx.quadraticCurveTo(r * 0.1, side * r * (0.9 + flap), -r * 0.45, side * r * (1.1 + flap)); ctx.lineTo(-r * 0.25, side * r * 0.2); }
  ctx.moveTo(-r * 0.5, 0); ctx.lineTo(-r * 0.95, -r * 0.2); ctx.lineTo(-r * 0.95, r * 0.2); ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawSprinkler(ctx: C, x: number, y: number, r: number, angle: number, spraying: boolean, t: number): void {
  ctx.save(); ctx.translate(x, y);
  ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, r * 0.1);
  ctx.fillStyle = '#4a8fd0'; ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#d8e8f4'; ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(angle);
  ctx.fillStyle = '#ffd24a'; ctx.fillRect(r * 0.1, -r * 0.08, r * 0.55, r * 0.16); ctx.strokeRect(r * 0.1, -r * 0.08, r * 0.55, r * 0.16);
  if (spraying) {
    ctx.fillStyle = 'rgba(150,210,255,.75)';
    for (let i = 0; i < 14; i++) { const d = ((t * 6 + i * 0.37) % 1) * r * 3.6 + r * 0.6, sp = Math.sin(i * 7.1) * 0.18; ctx.beginPath(); ctx.arc(Math.cos(sp) * d, Math.sin(sp) * d, r * 0.07 + (i % 3) * r * 0.02, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}

export function drawMower(ctx: C, x: number, y: number, r: number, t: number, dir: number): void {
  ctx.save(); ctx.translate(x, y); if (dir < 0) ctx.scale(-1, 1);
  ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, r * 0.06);
  ctx.fillStyle = 'rgba(30,40,10,.3)'; ctx.beginPath(); ctx.ellipse(r * 0.05, r * 0.12, r * 0.95, r * 0.75, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8573a'; roundRect(ctx, -r * 0.85, -r * 0.7, r * 1.7, r * 1.4, r * 0.4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffd9a0'; roundRect(ctx, -r * 0.5, -r * 0.45, r * 0.9, r * 0.9, r * 0.25); ctx.fill(); ctx.stroke();
  // Face: a cheerful, oblivious robot.
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.arc(r * 0.15, -r * 0.18, r * 0.08, 0, Math.PI * 2); ctx.arc(r * 0.15, r * 0.18, r * 0.08, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(-r * 0.02, 0, r * 0.18, -1, 1); ctx.stroke();
  ctx.fillStyle = '#3a3a3a';
  for (const side of [-1, 1]) { roundRect(ctx, -r * 0.6, side * r * 0.72 - r * 0.12, r * 0.5, r * 0.24, r * 0.1); ctx.fill(); roundRect(ctx, r * 0.15, side * r * 0.72 - r * 0.12, r * 0.5, r * 0.24, r * 0.1); ctx.fill(); }
  ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = r * 0.05;
  ctx.beginPath(); ctx.arc(r * 0.95, 0, r * 0.25, t * 20, t * 20 + 1.2); ctx.stroke();
  ctx.restore();
}

export function drawKingfisher(ctx: C, x: number, y: number, r: number, t: number, diving: number): void {
  ctx.save(); ctx.translate(x, y);
  const s = 1 + diving * 0.6;
  ctx.scale(s, s);
  const flap = Math.sin(t * 12) * 0.3;
  ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, r * 0.06);
  ctx.fillStyle = '#2f8fd8';
  for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-r * 0.1, side * r * (0.9 + flap), -r * 0.6, side * r * (1 + flap)); ctx.lineTo(-r * 0.3, side * r * 0.15); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  ctx.fillStyle = '#3aa7f0'; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.55, r * 0.3, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f08a3a'; ctx.beginPath(); ctx.ellipse(-r * 0.05, 0, r * 0.3, r * 0.18, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(r * 0.5, -r * 0.06); ctx.lineTo(r * 1.05, 0); ctx.lineTo(r * 0.5, r * 0.06); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(r * 0.36, -r * 0.1, r * 0.07, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function drawLamp(ctx: C, x: number, y: number, r: number, t: number, on: boolean): void {
  ctx.save(); ctx.translate(x, y);
  if (on) {
    const glow = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 3.4);
    glow.addColorStop(0, 'rgba(190,140,255,.55)'); glow.addColorStop(1, 'rgba(190,140,255,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, r * 3.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, r * 0.08);
  ctx.fillStyle = '#5a5f6a'; roundRect(ctx, -r * 0.45, -r * 0.6, r * 0.9, r * 1.2, r * 0.15); ctx.fill(); ctx.stroke();
  ctx.fillStyle = on ? `rgba(200,160,255,${0.8 + Math.sin(t * 20) * 0.15})` : '#3a3550';
  roundRect(ctx, -r * 0.3, -r * 0.45, r * 0.6, r * 0.9, r * 0.1); ctx.fill();
  ctx.strokeStyle = 'rgba(40,40,50,.8)'; ctx.lineWidth = r * 0.05;
  for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.12, -r * 0.45); ctx.lineTo(i * r * 0.12, r * 0.45); ctx.stroke(); }
  ctx.restore();
}

export function drawShoe(ctx: C, x: number, y: number, w: number, h: number, k: number): void {
  // A growing, darkening shadow, then the sole itself at the last instant.
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = `rgba(20,15,30,${0.15 + k * 0.45})`;
  ctx.beginPath(); ctx.ellipse(0, 0, w * (0.55 + k * 0.45), h * (0.55 + k * 0.45), 0, 0, Math.PI * 2); ctx.fill();
  if (k > 0.82) {
    ctx.fillStyle = 'rgba(60,45,70,.85)'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 0, w * 0.95, h * 0.85, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2;
    for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * w * 0.2, -h * 0.6); ctx.lineTo(i * w * 0.2, h * 0.6); ctx.stroke(); }
  }
  ctx.restore();
}
