import type { Color, Dir, Good, PartKind } from '../types';

/**
 * Lantern Works art: every good and machine drawn from paths, at any size. A warm wooden workshop at dusk: brass
 * machines with one moving part each, paper lanterns in bold flat colours, bamboo hoops, candles. Functions draw
 * centred on (x, y) inside a cell of size `s`.
 */
type Ctx = CanvasRenderingContext2D;

export const COLOR_HEX: Record<Color, string> = {
  plain: '#f4ead2', red: '#e2412f', yellow: '#f4c430', blue: '#3f7fd8', orange: '#f28a26', green: '#43ad5c', purple: '#9353cc', muddy: '#806d4e'
};
/** A small shape per colour so colours never have to be told apart by hue alone. */
export const COLOR_GLYPH: Record<Color, string> = { plain: '', red: '▲', yellow: '●', blue: '■', orange: '◆', green: '✚', purple: '★', muddy: '~' };

const shade = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

export function brass(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fixed = false) {
  const g = ctx.createLinearGradient(x, y, x + w * 0.4, y + h);
  if (fixed) { g.addColorStop(0, '#c9c2b4'); g.addColorStop(0.5, '#8f8778'); g.addColorStop(1, '#5d564c'); }
  else { g.addColorStop(0, '#ffe7a6'); g.addColorStop(0.35, '#e0ad4e'); g.addColorStop(1, '#8c5a1e'); }
  ctx.fillStyle = 'rgba(20,10,4,0.45)';
  ctx.beginPath(); ctx.roundRect(x + w * 0.05, y + h * 0.09, w, h, r); ctx.fill();
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
  ctx.strokeStyle = fixed ? '#3d3830' : '#5a3510'; ctx.lineWidth = Math.max(1, w * 0.04); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,248,220,0.55)'; ctx.lineWidth = Math.max(1, w * 0.025);
  ctx.beginPath(); ctx.roundRect(x + w * 0.07, y + h * 0.07, w * 0.86, h * 0.86, r * 0.7); ctx.stroke();
  // rivets
  ctx.fillStyle = fixed ? '#4a443b' : '#6b4313';
  for (const [rx, ry] of [[0.14, 0.14], [0.86, 0.14], [0.14, 0.86], [0.86, 0.86]]) { ctx.beginPath(); ctx.arc(x + w * rx, y + h * ry, w * 0.035, 0, 7); ctx.fill(); }
}

function shellPath(ctx: Ctx, shape: string, r: number) {
  ctx.beginPath();
  if (shape === 'square') ctx.roundRect(-r * 0.82, -r * 0.9, r * 1.64, r * 1.8, r * 0.28);
  else if (shape === 'lotus') {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.72 : r * 1.02;
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr * 1.04;
      if (i === 0) ctx.moveTo(px, py); else ctx.quadraticCurveTo(Math.cos(a - Math.PI / 16) * rr * 1.1, Math.sin(a - Math.PI / 16) * rr * 1.1, px, py);
    }
    ctx.closePath();
  } else ctx.ellipse(0, 0, r * 0.92, r, 0, 0, Math.PI * 2);
}

const STAMP_GLYPH: Record<string, string> = { fu: '福', fish: '🐟', cloud: '☁' };

/** One good. `lantern` and `shell` share the paper body; a lantern gets caps and a tassel, a lit one an inner glow. */
export function drawGood(ctx: Ctx, g: Good, x: number, y: number, s: number, time = 0, glyphs = false) {
  ctx.save(); ctx.translate(x, y);
  const r = s * 0.3;
  switch (g.kind) {
    case 'paper': {
      ctx.rotate(-0.12);
      ctx.fillStyle = 'rgba(30,15,5,0.3)'; ctx.fillRect(-r * 0.85 + r * 0.12, -r + r * 0.14, r * 1.7, r * 2);
      ctx.fillStyle = '#fbf6ea'; ctx.beginPath(); ctx.moveTo(-r * 0.85, -r); ctx.lineTo(r * 0.45, -r); ctx.lineTo(r * 0.85, -r * 0.6); ctx.lineTo(r * 0.85, r); ctx.lineTo(-r * 0.85, r); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#bfb39a'; ctx.lineWidth = Math.max(1, s * 0.02); ctx.stroke();
      ctx.fillStyle = '#e3d8c0'; ctx.beginPath(); ctx.moveTo(r * 0.45, -r); ctx.lineTo(r * 0.45, -r * 0.6); ctx.lineTo(r * 0.85, -r * 0.6); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#d8ccb2'; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-r * 0.55, i * r * 0.4); ctx.lineTo(r * 0.55, i * r * 0.4); ctx.stroke(); }
      break;
    }
    case 'hoop': {
      ctx.lineWidth = r * 0.34; ctx.strokeStyle = 'rgba(30,15,5,0.35)'; ctx.beginPath(); ctx.ellipse(r * 0.1, r * 0.14, r * 0.85, r * 0.85, 0, 0, 7); ctx.stroke();
      ctx.strokeStyle = '#c9a25a'; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.85, r * 0.85, 0, 0, 7); ctx.stroke();
      ctx.lineWidth = r * 0.12; ctx.strokeStyle = '#e9cf8c'; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.85, r * 0.85, 0, 3.6, 5.4); ctx.stroke();
      ctx.strokeStyle = '#7d5c26'; ctx.lineWidth = Math.max(1, r * 0.08);
      for (let i = 0; i < 5; i++) { const a = i * 1.26 + 0.3; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.68, Math.sin(a) * r * 0.68); ctx.lineTo(Math.cos(a) * r * 1.02, Math.sin(a) * r * 1.02); ctx.stroke(); }
      break;
    }
    case 'candle': {
      ctx.fillStyle = 'rgba(30,15,5,0.35)'; ctx.fillRect(-r * 0.3 + r * 0.1, -r * 0.55 + r * 0.12, r * 0.6, r * 1.5);
      const g2 = ctx.createLinearGradient(-r * 0.3, 0, r * 0.3, 0); g2.addColorStop(0, '#f6e6c6'); g2.addColorStop(1, '#d9bd8a');
      ctx.fillStyle = g2; ctx.beginPath(); ctx.roundRect(-r * 0.3, -r * 0.55, r * 0.6, r * 1.5, r * 0.1); ctx.fill();
      ctx.fillStyle = '#fff6df'; ctx.beginPath(); ctx.ellipse(0, -r * 0.55, r * 0.3, r * 0.1, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#3a2412'; ctx.lineWidth = Math.max(1, r * 0.08); ctx.beginPath(); ctx.moveTo(0, -r * 0.6); ctx.lineTo(0, -r * 0.85); ctx.stroke();
      ctx.fillStyle = '#c94a2a'; ctx.fillRect(-r * 0.3, r * 0.6, r * 0.6, r * 0.12);
      break;
    }
    case 'dye': {
      const c = COLOR_HEX[g.color ?? 'red'];
      ctx.fillStyle = 'rgba(30,15,5,0.35)'; ctx.beginPath(); ctx.ellipse(r * 0.1, r * 0.2, r * 0.75, r * 0.8, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#6a4a2c'; ctx.beginPath(); ctx.roundRect(-r * 0.7, -r * 0.55, r * 1.4, r * 1.35, r * 0.35); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, -r * 0.35, r * 0.6, r * 0.3, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(-r * 0.2, -r * 0.42, r * 0.2, r * 0.08, 0, 0, 7); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(-r * 0.45, -r * 0.2); ctx.quadraticCurveTo(-r * 0.5, r * 0.3, -r * 0.35, r * 0.35); ctx.lineTo(-r * 0.25, -r * 0.2); ctx.fill();
      const glyph = COLOR_GLYPH[g.color ?? 'red'];
      if (glyph) { ctx.fillStyle = '#f7ecd2'; ctx.font = `700 ${Math.round(r * 0.62)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(glyph, 0, r * 0.38); }
      break;
    }
    case 'shell':
    case 'lantern': {
      const lantern = g.kind === 'lantern', lit = lantern && g.lit;
      const base = COLOR_HEX[g.color ?? 'plain'];
      const sway = lantern ? Math.sin(time * 2.4 + x * 0.05) * 0.06 : 0;
      ctx.rotate(sway);
      ctx.fillStyle = 'rgba(30,15,5,0.35)'; ctx.save(); ctx.translate(r * 0.12, r * 0.18); shellPath(ctx, g.shape ?? 'round', r); ctx.fill(); ctx.restore();
      const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r * 1.1);
      if (lit) { grad.addColorStop(0, '#fffbe0'); grad.addColorStop(0.35, shade(base, 0.45)); grad.addColorStop(1, base); }
      else { grad.addColorStop(0, shade(base, 0.35)); grad.addColorStop(1, shade(base, -0.12)); }
      ctx.fillStyle = grad; shellPath(ctx, g.shape ?? 'round', r); ctx.fill();
      ctx.strokeStyle = shade(base, -0.45); ctx.lineWidth = Math.max(1, s * 0.022); ctx.stroke();
      // ribs
      ctx.save(); shellPath(ctx, g.shape ?? 'round', r); ctx.clip();
      ctx.strokeStyle = shade(base, -0.3); ctx.globalAlpha = 0.55; ctx.lineWidth = Math.max(1, s * 0.016);
      for (const k of [-0.5, 0, 0.5]) { ctx.beginPath(); ctx.ellipse(0, 0, r * Math.abs(k) * 1.6 + 0.01, r * 1.1, 0, 0, 7); ctx.stroke(); }
      ctx.restore();
      if (g.stamp && g.stamp !== 'none') {
        ctx.fillStyle = g.stamp === 'fu' ? (g.color === 'red' ? '#ffe08a' : '#b8241a') : shade(base, -0.55);
        ctx.font = `800 ${Math.round(r * (g.stamp === 'fu' ? 0.95 : 0.8))}px "Songti SC", "Noto Serif SC", serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (g.stamp === 'fu') { ctx.save(); ctx.rotate(Math.PI / 4); ctx.fillStyle = '#c7271b'; ctx.fillRect(-r * 0.42, -r * 0.42, r * 0.84, r * 0.84); ctx.restore(); ctx.fillStyle = '#ffd772'; }
        if (g.stamp === 'fish') drawFish(ctx, r * 0.55, ctx.fillStyle as string);
        else if (g.stamp === 'cloud') drawCloud(ctx, r * 0.55, ctx.fillStyle as string);
        else ctx.fillText(STAMP_GLYPH[g.stamp], 0, r * 0.05);
      }
      if (glyphs && g.color && COLOR_GLYPH[g.color]) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = `700 ${Math.round(r * 0.5)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(COLOR_GLYPH[g.color], r * 0.55, r * 0.6);
      }
      if (lantern) {
        ctx.fillStyle = '#2c1a10';
        ctx.beginPath(); ctx.roundRect(-r * 0.45, -r * 1.12, r * 0.9, r * 0.26, r * 0.08); ctx.fill();
        ctx.beginPath(); ctx.roundRect(-r * 0.45, r * 0.86, r * 0.9, r * 0.26, r * 0.08); ctx.fill();
        ctx.fillStyle = '#c99a3c'; ctx.fillRect(-r * 0.45, -r * 1.0, r * 0.9, r * 0.05); ctx.fillRect(-r * 0.45, r * 0.95, r * 0.9, r * 0.05);
        ctx.strokeStyle = '#c7271b'; ctx.lineWidth = Math.max(1.2, r * 0.1);
        ctx.beginPath(); ctx.moveTo(0, r * 1.1); ctx.lineTo(Math.sin(time * 3) * r * 0.08, r * 1.45); ctx.stroke();
        ctx.fillStyle = '#e8b23c'; ctx.beginPath(); ctx.arc(Math.sin(time * 3) * r * 0.08, r * 1.45, r * 0.08, 0, 7); ctx.fill();
      }
      break;
    }
    case 'string': {
      const seq = g.seq ?? [];
      ctx.strokeStyle = '#3a2412'; ctx.lineWidth = Math.max(1, s * 0.03);
      ctx.beginPath(); ctx.moveTo(-r * 1.2, -r * 0.7); ctx.quadraticCurveTo(0, -r * 0.2, r * 1.2, -r * 0.7); ctx.stroke();
      seq.forEach((c, i) => drawGood(ctx, { kind: 'lantern', shape: 'round', color: c, stamp: 'none', lit: true }, (i - 1) * r * 0.95, -r * 0.2 + (i === 1 ? r * 0.25 : 0), s * 0.55, time + i));
      break;
    }
  }
  ctx.restore();
}

function drawFish(ctx: Ctx, r: number, fill: string) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(-r * 0.15, 0, r * 0.6, r * 0.36, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(r * 0.35, 0); ctx.lineTo(r * 0.8, -r * 0.35); ctx.lineTo(r * 0.8, r * 0.35); ctx.closePath(); ctx.fill();
}
function drawCloud(ctx: Ctx, r: number, fill: string) {
  ctx.fillStyle = fill; ctx.beginPath();
  ctx.arc(-r * 0.35, r * 0.1, r * 0.3, 0, 7); ctx.arc(0, -r * 0.1, r * 0.38, 0, 7); ctx.arc(r * 0.38, r * 0.1, r * 0.28, 0, 7); ctx.fill();
}

/** Small arrow on a machine's output face. */
function outArrow(ctx: Ctx, s: number, color = '#3b220c') {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(s * 0.47, 0); ctx.lineTo(s * 0.33, -s * 0.11); ctx.lineTo(s * 0.33, s * 0.11); ctx.closePath(); ctx.fill();
}

export type PartLook = { kind: PartKind; dir: Dir; dial?: string; flip?: boolean; fixed?: boolean };
/** Animation state for a machine's one moving part: `work` 1 right after it acted, falling to 0. */
export type PartAnim = { work: number; toggle?: number; tank?: Color | null; ins?: boolean[]; queue?: number; ready?: number };

export function drawPart(ctx: Ctx, p: PartLook, x: number, y: number, s: number, anim: PartAnim, time: number) {
  ctx.save(); ctx.translate(x, y);
  const k = anim.work, bump = Math.sin(Math.min(1, k) * Math.PI);
  if (p.kind === 'bin') {
    ctx.fillStyle = 'rgba(20,10,4,0.45)'; ctx.beginPath(); ctx.ellipse(s * 0.05, s * 0.08, s * 0.36, s * 0.36, 0, 0, 7); ctx.fill();
    const g = ctx.createRadialGradient(0, 0, s * 0.05, 0, 0, s * 0.38); g.addColorStop(0, '#2a1a0e'); g.addColorStop(0.6, '#5c3b1c'); g.addColorStop(1, '#a37a43');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, s * 0.36, 0, 7); ctx.fill();
    ctx.strokeStyle = '#c69a5a'; ctx.lineWidth = Math.max(1, s * 0.035);
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; ctx.beginPath(); ctx.arc(0, 0, s * 0.33, a, a + 0.35); ctx.stroke(); }
    ctx.strokeStyle = '#7a5428'; ctx.lineWidth = Math.max(1, s * 0.05); ctx.beginPath(); ctx.arc(0, 0, s * 0.36, 0, 7); ctx.stroke();
    if (k > 0) { ctx.fillStyle = `rgba(255,240,200,${k * 0.4})`; ctx.beginPath(); ctx.arc(0, 0, s * 0.25 * (1 + (1 - k)), 0, 7); ctx.fill(); }
    ctx.restore(); return;
  }
  if (p.kind === 'bridge') {
    ctx.rotate((p.dir % 2) * Math.PI / 2);
    ctx.fillStyle = 'rgba(20,10,4,0.5)'; ctx.fillRect(-s * 0.5, -s * 0.3 + s * 0.08, s, s * 0.6);
    const g = ctx.createLinearGradient(0, -s * 0.3, 0, s * 0.3); g.addColorStop(0, '#b98a52'); g.addColorStop(1, '#7c5530');
    ctx.fillStyle = g; ctx.fillRect(-s * 0.5, -s * 0.28, s, s * 0.56);
    ctx.strokeStyle = '#4e3219'; ctx.lineWidth = Math.max(1, s * 0.025);
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * s * 0.2, -s * 0.28); ctx.lineTo(i * s * 0.2, s * 0.28); ctx.stroke(); }
    ctx.fillStyle = '#d8ad5a'; ctx.fillRect(-s * 0.5, -s * 0.32, s, s * 0.06); ctx.fillRect(-s * 0.5, s * 0.26, s, s * 0.06);
    ctx.restore(); return;
  }
  const m = s * 0.82;
  brass(ctx, -m / 2, -m / 2, m, m, m * 0.18, p.fixed);
  ctx.save(); ctx.rotate(p.dir * Math.PI / 2); outArrow(ctx, s, p.fixed ? '#2d2a25' : '#4a2a0b'); ctx.restore();
  const inner = m * 0.62;
  switch (p.kind) {
    case 'folder': {
      // A creased paper plate with a folding arm that swings over on every fold.
      ctx.fillStyle = '#f1e7cf'; ctx.beginPath(); ctx.roundRect(-inner / 2, -inner / 2, inner, inner, inner * 0.1); ctx.fill();
      ctx.strokeStyle = '#c8b791'; ctx.lineWidth = Math.max(1, s * 0.02); ctx.beginPath(); ctx.moveTo(-inner / 2, 0); ctx.lineTo(inner / 2, 0); ctx.stroke();
      ctx.save(); ctx.scale(1, Math.cos(bump * Math.PI * 0.9));
      ctx.fillStyle = '#e2d3ad'; ctx.beginPath(); ctx.moveTo(-inner / 2, 0); ctx.lineTo(inner / 2, 0); ctx.lineTo(0, -inner / 2); ctx.closePath(); ctx.fill(); ctx.restore();
      drawGood(ctx, { kind: 'shell', shape: (p.dial as Good['shape']) ?? 'round', color: 'plain' }, 0, inner * 0.18, s * 0.42, 0);
      break;
    }
    case 'vat': {
      const color = anim.tank ?? (p.dial && p.dial !== 'fed' ? p.dial as Color : null);
      ctx.fillStyle = '#3d2814'; ctx.beginPath(); ctx.arc(0, 0, inner * 0.55, 0, 7); ctx.fill();
      ctx.fillStyle = color ? COLOR_HEX[color] : '#2a1d12';
      ctx.beginPath(); ctx.arc(0, 0, inner * 0.46, 0, 7); ctx.fill();
      if (color) {
        ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.ellipse(-inner * 0.12 + Math.sin(time * 1.5) * inner * 0.05, -inner * 0.15, inner * 0.18, inner * 0.07, 0.4, 0, 7); ctx.fill();
        const glyph = COLOR_GLYPH[color]; if (glyph) { ctx.fillStyle = 'rgba(255,250,235,0.8)'; ctx.font = `700 ${Math.round(inner * 0.3)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(glyph, inner * 0.2, inner * 0.18); }
      } else if (p.dial === 'fed') { ctx.strokeStyle = 'rgba(255,230,180,0.35)'; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.arc(0, 0, inner * 0.3, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
      // the dipping basket
      const dip = 1 - bump * 0.35;
      ctx.strokeStyle = '#6b4a22'; ctx.lineWidth = Math.max(1.2, s * 0.03);
      ctx.beginPath(); ctx.arc(0, 0, inner * 0.3 * dip, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-inner * 0.3 * dip, 0); ctx.lineTo(inner * 0.3 * dip, 0); ctx.moveTo(0, -inner * 0.3 * dip); ctx.lineTo(0, inner * 0.3 * dip); ctx.stroke();
      break;
    }
    case 'joiner': case 'wick': case 'mixer': case 'bundler': {
      ctx.fillStyle = '#3b2a1a'; ctx.beginPath(); ctx.roundRect(-inner / 2, -inner / 2, inner, inner, inner * 0.15); ctx.fill();
      const close = bump * inner * 0.12;
      if (p.kind === 'joiner') {
        ctx.fillStyle = '#d6a64a';
        ctx.fillRect(-inner / 2 + close, -inner * 0.38, inner * 0.16, inner * 0.76);
        ctx.fillRect(inner / 2 - inner * 0.16 - close, -inner * 0.38, inner * 0.16, inner * 0.76);
        ctx.strokeStyle = '#c9a25a'; ctx.lineWidth = inner * 0.09; ctx.beginPath(); ctx.arc(0, 0, inner * 0.2, 0, 7); ctx.stroke();
      } else if (p.kind === 'wick') {
        ctx.fillStyle = '#c9a25a'; ctx.fillRect(-inner * 0.06, -inner * 0.05, inner * 0.12, inner * 0.36);
        const f = 0.6 + bump * 0.8 + Math.sin(time * 9) * 0.08;
        const fg = ctx.createRadialGradient(0, -inner * 0.12, 1, 0, -inner * 0.12, inner * 0.28 * f);
        fg.addColorStop(0, '#fffbe6'); fg.addColorStop(0.4, '#ffc24a'); fg.addColorStop(1, 'rgba(255,120,30,0)');
        ctx.fillStyle = fg; ctx.beginPath(); ctx.ellipse(0, -inner * 0.12, inner * 0.16 * f, inner * 0.26 * f, 0, 0, 7); ctx.fill();
      } else if (p.kind === 'mixer') {
        ctx.save(); ctx.rotate(time * (0.6 + bump * 6));
        const cols: Color[] = ['red', 'yellow', 'blue'];
        cols.forEach((c, i) => { ctx.fillStyle = COLOR_HEX[c]; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, inner * 0.38, i * 2.09, i * 2.09 + 2.09); ctx.closePath(); ctx.fill(); });
        ctx.fillStyle = '#efe1c2'; ctx.beginPath(); ctx.arc(0, 0, inner * 0.12, 0, 7); ctx.fill();
        ctx.restore();
      } else {
        ctx.save(); ctx.rotate(time * 0.8 + bump * 3);
        ctx.fillStyle = '#c7271b'; ctx.beginPath(); ctx.arc(0, 0, inner * 0.3, 0, 7); ctx.fill();
        ctx.strokeStyle = '#7a140e'; ctx.lineWidth = Math.max(1, s * 0.02);
        for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(0, 0, inner * (0.1 + i * 0.035), i, i + 2.5); ctx.stroke(); }
        ctx.restore();
      }
      // slot lights: which inputs are already waiting
      const ins = anim.ins ?? [];
      const n = p.kind === 'bundler' ? 3 : 2;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = ins[i] ? '#ffd770' : '#4b3a28';
        ctx.beginPath(); ctx.arc(-inner * 0.3 + i * (inner * 0.6 / (n - 1)), inner * 0.42, inner * 0.07, 0, 7); ctx.fill();
      }
      break;
    }
    case 'splitter': {
      ctx.fillStyle = '#3b2a1a'; ctx.beginPath(); ctx.arc(0, 0, inner * 0.5, 0, 7); ctx.fill();
      ctx.save(); ctx.rotate(p.dir * Math.PI / 2);
      const target = (anim.toggle ?? 0) === 0 ? -1 : 1;
      ctx.rotate(target * 0.9);
      ctx.fillStyle = '#ffe2a0'; ctx.beginPath(); ctx.moveTo(-inner * 0.08, 0); ctx.lineTo(0, -inner * 0.06); ctx.lineTo(inner * 0.46, 0); ctx.lineTo(0, inner * 0.06); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.save(); ctx.rotate(p.dir * Math.PI / 2);
      ctx.fillStyle = '#4a2a0b';
      for (const sgn of [-1, 1]) { ctx.save(); ctx.rotate(sgn * Math.PI / 2); outArrow(ctx, s); ctx.restore(); }
      ctx.restore();
      break;
    }
    case 'sorter': {
      ctx.fillStyle = '#3b2a1a'; ctx.beginPath(); ctx.arc(0, 0, inner * 0.5, 0, 7); ctx.fill();
      ctx.save(); ctx.rotate(p.dir * Math.PI / 2);
      ctx.save(); ctx.rotate((p.flip ? 1 : -1) * Math.PI / 2); outArrow(ctx, s, '#b5321f'); ctx.restore();
      ctx.restore();
      // the filter it looks for, shown on its lens
      drawFilterIcon(ctx, p.dial ?? '', 0, 0, inner * 0.9, time);
      if (k > 0) { ctx.strokeStyle = `rgba(255,230,160,${k})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, inner * 0.5, 0, 7); ctx.stroke(); }
      break;
    }
    case 'gate': {
      ctx.fillStyle = '#3b2a1a'; ctx.beginPath(); ctx.roundRect(-inner / 2, -inner / 2, inner, inner, inner * 0.1); ctx.fill();
      const ready = anim.ready ?? 1;
      ctx.save(); ctx.rotate(p.dir * Math.PI / 2);
      ctx.fillStyle = ready >= 1 ? '#7bd07a' : '#d0683c';
      ctx.fillRect(inner * 0.1, -inner * 0.42 * (1 - bump * 0.8), inner * 0.12, inner * 0.84 * (1 - bump * 0.8));
      ctx.restore();
      ctx.fillStyle = '#ffe9b8'; ctx.font = `800 ${Math.round(inner * 0.42)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(p.dial ?? '2', -inner * 0.1, inner * 0.02);
      break;
    }
    case 'stamp': {
      ctx.fillStyle = '#3b2a1a'; ctx.beginPath(); ctx.roundRect(-inner / 2, -inner / 2, inner, inner, inner * 0.1); ctx.fill();
      const press = 1 - bump * 0.25;
      ctx.fillStyle = '#9b2a1c'; ctx.beginPath(); ctx.roundRect(-inner * 0.34 * press, -inner * 0.34 * press, inner * 0.68 * press, inner * 0.68 * press, inner * 0.08); ctx.fill();
      ctx.fillStyle = '#ffd772'; ctx.font = `800 ${Math.round(inner * 0.46 * press)}px "Songti SC", "Noto Serif SC", serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (p.dial === 'fish') drawFish(ctx, inner * 0.3, '#ffd772'); else if (p.dial === 'cloud') drawCloud(ctx, inner * 0.3, '#ffd772'); else ctx.fillText('福', 0, inner * 0.03);
      break;
    }
  }
  ctx.restore();
}

export function drawFilterIcon(ctx: Ctx, filter: string, x: number, y: number, s: number, time = 0) {
  const colors = Object.keys(COLOR_HEX);
  if (colors.includes(filter)) {
    ctx.fillStyle = COLOR_HEX[filter as Color]; ctx.beginPath(); ctx.arc(x, y, s * 0.28, 0, 7); ctx.fill();
    ctx.strokeStyle = '#f7ecd2'; ctx.lineWidth = Math.max(1, s * 0.05); ctx.stroke();
    const glyph = COLOR_GLYPH[filter as Color];
    if (glyph) { ctx.fillStyle = '#fffbe9'; ctx.font = `700 ${Math.round(s * 0.28)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(glyph, x, y + 1); }
  } else if (['round', 'square', 'lotus'].includes(filter)) drawGood(ctx, { kind: 'shell', shape: filter as Good['shape'], color: 'plain' }, x, y, s * 0.9, time);
  else if (filter === 'lit') drawGood(ctx, { kind: 'lantern', shape: 'round', color: 'yellow', stamp: 'none', lit: true }, x, y, s * 0.8, time);
  else if (filter === 'fu') { ctx.fillStyle = '#c7271b'; ctx.fillRect(x - s * 0.22, y - s * 0.22, s * 0.44, s * 0.44); ctx.fillStyle = '#ffd772'; ctx.font = `800 ${Math.round(s * 0.34)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('福', x, y + 1); }
  else if (filter) drawGood(ctx, filter === 'dye' ? { kind: 'dye', color: 'blue' } : filter === 'lantern' ? { kind: 'lantern', shape: 'round', color: 'red', stamp: 'none' } : filter === 'shell' ? { kind: 'shell', shape: 'round', color: 'plain' } : { kind: filter as Good['kind'] }, x, y, s * 0.9, time);
}

/** Inspector Mittens, seen from above: a grey tabby with a slow tail. `sit` 0..1 eases her from walking to sitting. */
export function drawCat(ctx: Ctx, x: number, y: number, s: number, facing: number, sit: number, time: number) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(facing);
  ctx.fillStyle = 'rgba(15,8,4,0.4)'; ctx.beginPath(); ctx.ellipse(s * 0.04, s * 0.08, s * 0.34, s * 0.24, 0, 0, 7); ctx.fill();
  // tail
  ctx.strokeStyle = '#6f6a66'; ctx.lineCap = 'round'; ctx.lineWidth = s * 0.08;
  const swish = Math.sin(time * (sit > 0.5 ? 1.6 : 4)) * 0.6;
  ctx.beginPath(); ctx.moveTo(-s * 0.26, 0); ctx.quadraticCurveTo(-s * 0.5, swish * s * 0.25, -s * 0.46 + Math.cos(swish) * s * 0.05, swish * s * 0.4); ctx.stroke();
  // body
  const body = ctx.createRadialGradient(-s * 0.05, -s * 0.05, s * 0.02, 0, 0, s * 0.32);
  body.addColorStop(0, '#a8a29c'); body.addColorStop(1, '#6d6762');
  ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(-s * 0.04, 0, s * (0.28 - sit * 0.04), s * (0.18 + sit * 0.04), 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#55504c'; ctx.lineWidth = s * 0.03;
  for (const k of [-0.14, -0.04, 0.06]) { ctx.beginPath(); ctx.moveTo(s * k, -s * 0.16); ctx.quadraticCurveTo(s * (k + 0.03), 0, s * k, s * 0.16); ctx.stroke(); }
  // head
  ctx.fillStyle = '#8f8984'; ctx.beginPath(); ctx.arc(s * 0.24, 0, s * 0.13, 0, 7); ctx.fill();
  ctx.fillStyle = '#7b7570';
  ctx.beginPath(); ctx.moveTo(s * 0.26, -s * 0.1); ctx.lineTo(s * 0.36, -s * 0.16); ctx.lineTo(s * 0.32, -s * 0.04); ctx.fill();
  ctx.beginPath(); ctx.moveTo(s * 0.26, s * 0.1); ctx.lineTo(s * 0.36, s * 0.16); ctx.lineTo(s * 0.32, s * 0.04); ctx.fill();
  // inspector's collar with a little brass tag
  ctx.strokeStyle = '#b5321f'; ctx.lineWidth = s * 0.035; ctx.beginPath(); ctx.arc(s * 0.24, 0, s * 0.12, 2.3, 4); ctx.stroke();
  ctx.fillStyle = '#ffd772'; ctx.beginPath(); ctx.arc(s * 0.15, 0, s * 0.03, 0, 7); ctx.fill();
  ctx.restore();
}

export function drawPaw(ctx: Ctx, x: number, y: number, s: number, alpha: number) {
  ctx.save(); ctx.translate(x, y); ctx.globalAlpha = alpha; ctx.fillStyle = '#2b1a10';
  ctx.beginPath(); ctx.ellipse(0, s * 0.05, s * 0.12, s * 0.1, 0, 0, 7); ctx.fill();
  for (const [dx, dy] of [[-0.12, -0.1], [-0.04, -0.17], [0.05, -0.17], [0.13, -0.1]]) { ctx.beginPath(); ctx.arc(dx * s, dy * s, s * 0.045, 0, 7); ctx.fill(); }
  ctx.restore();
}

/** Cached small icon of a good or a part, as a data URL for the DOM (order cards, tray, dial chips). */
const iconCache = new Map<string, string>();
export function iconURL(key: string, paint: (ctx: Ctx, size: number) => void, size = 64): string {
  const hit = iconCache.get(key);
  if (hit !== undefined) return hit;
  let url = '';
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) { iconCache.set(key, url); return url; }
  try {
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    if (ctx) { paint(ctx, size); url = c.toDataURL('image/png'); }
  } catch { url = ''; }
  iconCache.set(key, url);
  return url;
}
