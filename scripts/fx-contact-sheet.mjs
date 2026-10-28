#!/usr/bin/env node
/**
 * Dev-only FX contact sheets: render every pilot recipe through the real shared interpreter (src/games/_shared/fx.ts)
 * at fixed times with a fixed emit sequence, next to the effect the game used before. Same recipe → same image;
 * change a number in a game's fx-recipes.ts and rerun to get the variant.
 *
 * No browser and no dependencies: a tiny software 2D context (fillRect/strokeRect/arc, globalAlpha, 4×4 supersampling)
 * stands in for canvas, and PNGs are written with node:zlib. Real-canvas antialiasing will differ slightly.
 * Needs Node ≥ 22.18 / 23.6 (built-in TypeScript type stripping). Output goes to the gitignored test-results/.
 *
 * Run: node scripts/fx-contact-sheet.mjs [outputDir]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';
import { createFx } from '../src/games/_shared/fx.ts';
import * as blockDrop from '../src/games/block-drop/fx-recipes.ts';
import * as breakout from '../src/games/breakout/fx-recipes.ts';
import * as bubble from '../src/games/bubble/fx-recipes.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.resolve(process.argv[2] ?? path.join(root, 'test-results', 'fx-contact-sheet'));
const TIMES = [0, 33, 66, 100, 150, 220, 320, 450, 650];
const REDUCED_TIMES = [0, 100, 170];

const parse = color => {
  const rgba = /rgba?\(([^)]+)\)/.exec(color);
  if (rgba) { const [r, g, b, a = 1] = rgba[1].split(',').map(Number); return [r, g, b, a]; }
  const hex = color.slice(1), full = hex.length <= 4 ? [...hex].map(c => c + c).join('') : hex;
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)).concat(full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1);
};

/** Just enough of CanvasRenderingContext2D for fx.ts and the backdrops, rasterised into an RGBA buffer. */
class Raster {
  constructor(width, height, scale) { Object.assign(this, { width, height, scale, globalAlpha: 1, lineWidth: 1, fillStyle: '#000', strokeStyle: '#000', path: [], offset: [0, 0] }); this.data = new Float32Array(width * height * 3); }
  paint(x0, y0, x1, y1, inside, color) {
    const [r, g, b, a] = parse(color), alpha = a * this.globalAlpha, s = this.scale, [ox, oy] = this.offset;
    const px0 = Math.max(0, Math.floor((x0 + ox) * s)), py0 = Math.max(0, Math.floor((y0 + oy) * s)), px1 = Math.min(this.width, Math.ceil((x1 + ox) * s)), py1 = Math.min(this.height, Math.ceil((y1 + oy) * s));
    for (let py = py0; py < py1; py++) for (let px = px0; px < px1; px++) {
      let hit = 0; for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) if (inside((px + (sx + .5) / 4) / s - ox, (py + (sy + .5) / 4) / s - oy)) hit++;
      if (!hit) continue; const k = alpha * hit / 16, i = (py * this.width + px) * 3;
      this.data[i] += (r - this.data[i]) * k; this.data[i + 1] += (g - this.data[i + 1]) * k; this.data[i + 2] += (b - this.data[i + 2]) * k;
    }
  }
  fillRect(x, y, w, h) { this.paint(x, y, x + w, y + h, () => true, this.fillStyle); }
  strokeRect(x, y, w, h) { const l = this.lineWidth / 2; this.paint(x - l, y - l, x + w + l, y + h + l, (px, py) => !(px > x + l && px < x + w - l && py > y + l && py < y + h - l), this.strokeStyle); }
  beginPath() { this.path = []; }
  arc(x, y, r) { this.path.push([x, y, r]); }
  fill() { for (const [x, y, r] of this.path) this.paint(x - r, y - r, x + r, y + r, (px, py) => (px - x) ** 2 + (py - y) ** 2 <= r * r, this.fillStyle); }
  stroke() { const l = this.lineWidth / 2; for (const [x, y, r] of this.path) this.paint(x - r - l, y - r - l, x + r + l, y + r + l, (px, py) => Math.abs(Math.hypot(px - x, py - y) - r) <= l, this.strokeStyle); }
}

const FONT = { A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010', Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110', 4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001110', '-': '000000111000000', '.': '000000000000010', ',': '000000000010100', '(': '010100100100010', ')': '010001001001010', '>': '100010001010100', '/': '001001010100100', ':': '000010000010000', '=': '000111000111000', '+': '000010111010000', '#': '101111101111101', ' ': '000000000000000' };
const label = (raster, text, x, y, color = '#a8b1c5', px = 2) => {
  const saved = [raster.scale, raster.offset, raster.globalAlpha]; Object.assign(raster, { scale: 1, offset: [0, 0], globalAlpha: 1 }); raster.fillStyle = color;
  [...text.toUpperCase()].forEach((ch, n) => [...(FONT[ch] ?? FONT[' '])].forEach((bit, i) => { if (bit === '1') raster.fillRect(x + n * 4 * px + (i % 3) * px, y + Math.floor(i / 3) * px, px, px); }));
  [raster.scale, raster.offset, raster.globalAlpha] = saved;
};

const png = (raster) => {
  const { width, height, data } = raster, rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) { rows[y * (width * 3 + 1)] = 0; for (let x = 0; x < width * 3; x++) rows[y * (width * 3 + 1) + 1 + x] = Math.max(0, Math.min(255, Math.round(data[y * width * 3 + x]))); }
  const chunk = (type, body) => { const head = Buffer.alloc(8); head.writeUInt32BE(body.length); head.write(type, 4); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), body]))); return Buffer.concat([head, body, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr.writeUInt8(8, 8); ihdr.writeUInt8(2, 9);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
};

/**
 * Per game: canvas size, crop around the event, background, a backdrop of neighbouring game objects, and a "before"
 * renderer reproducing what the game drew for the same event on main (legacy burst, or Block Drop's well flash).
 */
const sheets = {
  breakout: {
    canvas: [360, 560], cell: [150, 120], scale: 2, at: [75, 60], background: '#0e1730', module: breakout,
    backdrop: c => { [[12, 40], [54, 40], [96, 40], [12, 65], [96, 65]].forEach(([x, y]) => { c.fillStyle = y === 40 ? '#8b7cff' : '#70f0c2'; c.fillRect(x, y - 9, 36, 18); }); },
    before: [{ label: 'before: paddle hit (legacy burst x4)', run: (fx, x, y) => fx.burst(x, y, '#f7f9ff', 4) }, { label: 'before: any brick hit or break (burst x7)', run: (fx, x, y) => fx.burst(x, y, '#70f0c2') }]
  },
  bubble: {
    canvas: [360, 560], cell: [150, 120], scale: 2, at: [75, 60], background: '#12192a', module: bubble,
    backdrop: c => { [[32, 23, '#8b7cff'], [118, 23, '#ffcb6b'], [32, 97, '#70f0c2'], [118, 97, '#8b7cff']].forEach(([x, y, color]) => { c.fillStyle = color; c.beginPath(); c.arc(x, y, 18); c.fill(); }); },
    before: [{ label: 'before: stick (burst x7)', run: (fx, x, y) => fx.burst(x, y, '#ff6b7a') }, { label: 'before: whole group, once (burst x9)', run: (fx, x, y) => fx.burst(x, y, '#ff6b7a', 9) }]
  },
  'block-drop': {
    canvas: [600, 600], cell: [340, 150], scale: 1, at: [170, 75], background: '#0C1020', module: blockDrop,
    backdrop: c => { c.fillStyle = '#171C31'; c.fillRect(20, 0, 300, 150); const colors = ['#59C9FF', '#FFDA74', '#B18CFF', '#6DE0C2', '#6D91FF', '#74E28B', '#FF8195']; for (let x = 0; x < 10; x++) for (const y of [105, 135]) if ((x * 3 + y) % 4) { c.fillStyle = colors[(x + y) % 7]; c.fillRect(22 + x * 30, y - 13, 26, 26); } },
    before: [{ label: 'before: whole-well flash (55% white, x.82/frame)', well: true }]
  }
};

const renderSheet = (slug, sheet) => {
  const rows = [...sheet.before.map(item => ({ ...item, kind: 'before' })), ...sheet.module.preview.map(item => ({ ...item, kind: 'recipe' }))];
  const cols = TIMES.length + 1 + REDUCED_TIMES.length, [cw, ch] = sheet.cell, s = sheet.scale, pad = 8, top = 34, labelH = 22;
  const width = cols * (cw * s + pad) + pad, rowH = ch * s + labelH + pad, height = top + rows.length * rowH + 24;
  const out = new Raster(width, height, 1); out.fillStyle = '#05070d'; out.fillRect(0, 0, width, height);
  label(out, `${slug} fx contact sheet - cols: ms after event (normal) | reduced motion`, pad, 10, '#f7f9ff');
  rows.forEach((row, r) => {
    const y0 = top + r * rowH;
    label(out, `${row.kind === 'before' ? '' : row.recipe.id + ' - '}${row.label}`, pad, y0, row.kind === 'before' ? '#ff8195' : '#70f0c2');
    const columns = [...TIMES.map(t => ({ t, reduced: false })), null, ...REDUCED_TIMES.map(t => ({ t, reduced: true }))];
    columns.forEach((col, c) => {
      const x0 = pad + c * (cw * s + pad), cy = y0 + labelH;
      if (!col) return;
      label(out, `${col.reduced ? 'R ' : ''}${col.t}`, x0, cy + ch * s - 14, '#566079');
      if (row.kind === 'before' && col.reduced && !row.well) { label(out, 'nothing', x0 + 4, cy + 6, '#ff8195'); return; }
      // Each cell is a fresh fx run with a fixed clock: identical inputs give identical pixels.
      const cell = new Raster(cw * s, ch * s, s); cell.fillStyle = sheet.background; cell.fillRect(0, 0, cw, ch); sheet.backdrop(cell);
      let time = 0; const fx = createFx(cell, sheet.canvas[0], sheet.canvas[1], { reducedMotion: col.reduced, now: () => time });
      const [ax, ay] = sheet.at;
      if (row.kind === 'before' && row.well) { // block-drop main: clearFlash = 1, then *= .82 per frame, drawn at 55% over the whole well
        const level = .55 * .82 ** Math.round(col.t / (1000 / 60)); cell.fillStyle = `rgba(247,249,255,${level})`; cell.fillRect(20, 0, 300, 150);
      } else if (row.kind === 'before') {
        row.run(fx, ax, ay); for (let f = 0, frames = Math.round(col.t / (1000 / 60)); f < frames; f++) { fx.step(); }
        fx.draw();
      } else {
        fx.emit(row.recipe, ax, ay, row.options); for (let t = 0; t < col.t; t += 1000 / 60) { time = Math.min(col.t, t + 1000 / 60); fx.step(); }
        cell.offset = [0, 0]; fx.draw();
      }
      for (let py = 0; py < cell.height; py++) out.data.set(cell.data.subarray(py * cell.width * 3, (py + 1) * cell.width * 3), ((cy + py) * width + x0) * 3);
    });
  });
  label(out, 'generated by scripts/fx-contact-sheet.mjs from src/games/' + slug + '/fx-recipes.ts', pad, height - 16, '#566079');
  return out;
};

await mkdir(outputDir, { recursive: true });
for (const [slug, sheet] of Object.entries(sheets)) {
  const file = path.join(outputDir, `${slug}-fx.png`);
  await writeFile(file, png(renderSheet(slug, sheet)));
  console.log(path.relative(root, file));
}
