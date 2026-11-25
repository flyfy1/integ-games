/**
 * Pebble Putt shot-search lab: proves every hole has a one-stroke ace and a par route, and measures the sloppy bot.
 *   npx vite-node scripts/pebble-putt-search.ts                 all holes: grid search + par route + 10 sloppy rounds
 *   npx vite-node scripts/pebble-putt-search.ts 4 5 --sloppy 40 two holes, 40 sloppy rounds each
 *   ... --svg DIR                                                also draw each hole (ace + par route) as SVG into DIR
 *   ... --write                                                  store the found aces and par routes in src/games/pebble-putt/proofs.ts
 *   ... --json FILE                                              write the per-hole numbers as JSON
 * Grid: 360 angles (1°) × 40 power steps, and for gated holes every 0.1 s of the gate period.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { clusters, fieldAt, gridSearch, mulberry, pathField, phasesFor, planShot, sloppyRound, type Cell } from '../src/games/pebble-putt/bot';
import { CUP_R, height, simulateShot } from '../src/games/pebble-putt/physics';
import { HOLES } from '../src/games/pebble-putt/holes';
import { PROOFS } from '../src/games/pebble-putt/proofs';
import type { Hole, Shot } from '../src/games/pebble-putt/types';

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const ids = args.filter((a, i) => /^\d+$/.test(a) && !['--sloppy', '--seed'].includes(args[i - 1])).map(Number);
const holes = ids.length ? HOLES.filter(h => ids.includes(h.id)) : HOLES;
const sloppyN = Number(flag('--sloppy') ?? 10);
const svgDir = flag('--svg');
const jsonOut = flag('--json');
const write = args.includes('--write');
const seed0 = Number(flag('--seed') ?? 1);

const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

function parRoute(hole: Hole, field = pathField(hole)) {
  let x = hole.tee[0], y = hole.tee[1], t = 0;
  const shots: Shot[] = [];
  const gated = !!hole.gates?.length;
  for (let n = 0; n < hole.par + 3; n++) {
    const plan = planShot(hole, field, x, y, t, { angleStep: 1, powers: 40, spread: 3, phases: gated ? phasesFor(hole, 0.25) : [0], noSink: n === 0 });
    const at = round(t + plan.wait, 3);
    const r = simulateShot(hole, x, y, plan.angle, plan.power, at);
    shots.push({ angle: plan.angle, power: round(plan.power), ...(gated ? { at } : {}) });
    t = round(at + r.t + 1, 3);
    if (r.sunk) return { shots, strokes: shots.length, holed: true };
    if (!r.water) { x = r.x; y = r.y; }
  }
  return { shots, strokes: shots.length, holed: false };
}

/**
 * Aces are narrow (well under a degree), so a 1° grid cell can sit on the window's edge. Scan 0.1° × 0.005 power around
 * it and keep the shot with the most sinking neighbours (±0.3°, ±0.015), so the stored proof is in the middle of its window.
 */
function centreAce(hole: Hole, s: Shot): Shot {
  const at = s.at ?? 0, A = 15, P = 12;
  const sink = new Map<string, boolean>();
  const key = (i: number, j: number) => `${i},${j}`;
  for (let i = -A; i <= A; i++) for (let j = -P; j <= P; j++) {
    const p = s.power + j * 0.005;
    sink.set(key(i, j), p > 0 && p <= 1 && simulateShot(hole, hole.tee[0], hole.tee[1], s.angle + i * 0.1, p, at).sunk);
  }
  let bestScore = -1, bi = 0, bj = 0;
  for (let i = -A; i <= A; i++) for (let j = -P; j <= P; j++) {
    if (!sink.get(key(i, j))) continue;
    let score = 0;
    for (let di = -3; di <= 3; di++) for (let dj = -3; dj <= 3; dj++) if (sink.get(key(i + di, j + dj))) score++;
    if (score > bestScore) { bestScore = score; bi = i; bj = j; }
  }
  if (bestScore < 0) return { angle: s.angle, power: round(s.power), ...(s.at !== undefined ? { at: s.at } : {}) };
  return { angle: round(s.angle + bi * 0.1, 2), power: round(s.power + bj * 0.005), ...(s.at !== undefined ? { at: s.at } : {}) };
}

/** Replays a stored route from the tee and returns the strokes it takes (Infinity if it never holes out). */
export function replay(hole: Hole, shots: readonly Shot[]) {
  let x = hole.tee[0], y = hole.tee[1], strokes = 0;
  for (const s of shots) {
    const r = simulateShot(hole, x, y, s.angle, s.power, s.at ?? 0);
    strokes += r.water ? 2 : 1;
    if (r.sunk) return strokes;
    if (!r.water) { x = r.x; y = r.y; }
  }
  return Infinity;
}

function svg(hole: Hole, routes: { shots: readonly Shot[]; color: string }[]) {
  const [x0, y0, x1, y1] = hole.bounds, pad = 0.6, k = 40;
  const W = (x1 - x0 + 2 * pad) * k, H = (y1 - y0 + 2 * pad) * k;
  const X = (x: number) => ((x - x0 + pad) * k).toFixed(1), Y = (y: number) => ((y1 + pad - y) * k).toFixed(1);
  const parts: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#e9dcc0"/>`];
  // height shading
  for (let gx = x0; gx < x1; gx += 0.2) for (let gy = y0; gy < y1; gy += 0.2) {
    const h = height(hole.slopes, gx + 0.1, gy + 0.1);
    if (Math.abs(h) > 0.01) parts.push(`<rect x="${X(gx)}" y="${Y(gy + 0.2)}" width="${0.2 * k}" height="${0.2 * k}" fill="${h > 0 ? '#a0522d' : '#1e3a8a'}" fill-opacity="${Math.min(0.6, Math.abs(h) * 0.8).toFixed(2)}"/>`);
  }
  for (const z of hole.zones ?? []) parts.push(`<polygon points="${z.poly.map(p => `${X(p[0])},${Y(p[1])}`).join(' ')}" fill="${z.kind === 'gravel' ? '#888' : '#3a7d44'}" fill-opacity="0.5"/>`);
  for (const w of hole.water ?? []) parts.push(`<polygon points="${w.map(p => `${X(p[0])},${Y(p[1])}`).join(' ')}" fill="#3b82f6"/>`);
  for (const w of hole.walls) parts.push(`<polyline points="${w.map(p => `${X(p[0])},${Y(p[1])}`).join(' ')}" fill="none" stroke="#5b3a1a" stroke-width="5"/>`);
  for (const g of hole.gates ?? []) parts.push(`<line x1="${X(g.a[0])}" y1="${Y(g.a[1])}" x2="${X(g.b[0])}" y2="${Y(g.b[1])}" stroke="#65a30d" stroke-width="6" stroke-dasharray="6 4"/>`);
  for (const s of hole.stones ?? []) parts.push(`<circle cx="${X(s.x)}" cy="${Y(s.y)}" r="${s.r * k}" fill="${s.spring ? '#65a30d' : '#555'}"/>`);
  for (const p of hole.pipes ?? []) parts.push(`<circle cx="${X(p.a[0])}" cy="${Y(p.a[1])}" r="${0.3 * k}" fill="#166534"/><circle cx="${X(p.b[0])}" cy="${Y(p.b[1])}" r="${0.3 * k}" fill="#4ade80"/>`);
  parts.push(`<circle cx="${X(hole.cup[0])}" cy="${Y(hole.cup[1])}" r="${CUP_R * k}" fill="#111"/><circle cx="${X(hole.tee[0])}" cy="${Y(hole.tee[1])}" r="${0.16 * k}" fill="#fff" stroke="#000"/>`);
  for (const route of routes) {
    let x = hole.tee[0], y = hole.tee[1];
    for (const s of route.shots) {
      const r = simulateShot(hole, x, y, s.angle, s.power, s.at ?? 0, { path: true });
      const pts: string[] = [];
      for (let i = 0; i < r.path!.length; i += 2) pts.push(`${X(r.path![i])},${Y(r.path![i + 1])}`);
      parts.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${route.color}" stroke-width="2.5" stroke-opacity="0.85"/>`);
      if (r.sunk) break;
      if (!r.water) { x = r.x; y = r.y; }
    }
  }
  parts.push(`<text x="6" y="16" font-size="14" font-family="sans-serif">${hole.id} ${hole.name.en} par ${hole.par}</text></svg>`);
  return parts.join('');
}

const report: Record<number, unknown> = {};
const proofs: Record<number, { ace: Shot; parRoute: Shot[] }> = { ...PROOFS };
for (const hole of holes) {
  const t0 = performance.now();
  const phases = phasesFor(hole);
  const cells = gridSearch(hole, hole.tee, phases);
  const aces = cells.filter(c => c.r.sunk);
  const groups = clusters(aces);
  const maxT = cells.reduce((m, c) => Math.max(m, c.r.t), 0);
  const direct = Math.round(Math.atan2(hole.cup[1] - hole.tee[1], hole.cup[0] - hole.tee[0]) * 180 / Math.PI);
  const directAces = aces.filter(c => Math.abs(((c.angle - direct + 540) % 360) - 180) <= 1).length;
  const best = groups[0];
  let ace: Shot | null = null;
  if (best) {
    // the centre of the biggest cluster: the median angle, then the median power at that angle
    const angs = [...new Set(best.map(c => c.angle))].sort((a, b) => a - b);
    const a = angs[Math.floor(angs.length / 2)];
    const col = best.filter(c => c.angle === a).sort((p, q) => p.power - q.power);
    const c = col[Math.floor(col.length / 2)];
    ace = centreAce(hole, { angle: c.angle, power: c.power, ...(hole.gates?.length ? { at: c.at } : {}) });
  }
  const field = pathField(hole);
  const par = parRoute(hole, field);
  const rng = mulberry(seed0 * 7919 + hole.id);
  const strokes: number[] = [];
  for (let i = 0; i < sloppyN; i++) strokes.push(sloppyRound(hole, rng, field).strokes);
  const within = strokes.filter(s => s <= hole.par + 2).length;
  const hist: Record<number, number> = {};
  for (const s of strokes) hist[s] = (hist[s] ?? 0) + 1;
  const ms = Math.round(performance.now() - t0);
  const row = {
    id: hole.id, name: hole.name.en, par: hole.par, shots: cells.length, aceCells: aces.length, clusters: groups.slice(0, 4).map(g => g.length), ace,
    directAces, maxRestS: round(maxT, 2), waterShare: round(cells.filter(c => c.r.water).length / cells.length, 3),
    parRoute: par.shots, parStrokes: par.holed ? replay(hole, par.shots) : Infinity,
    sloppy: { n: sloppyN, withinParPlus2: round(within / Math.max(1, sloppyN), 3), mean: round(strokes.reduce((a, b) => a + b, 0) / Math.max(1, sloppyN), 2), hist },
    teeDistance: round(fieldAt(field, hole.tee[0], hole.tee[1]), 2), ms
  };
  report[hole.id] = row;
  console.log(JSON.stringify(row));
  if (ace && par.holed && row.parStrokes <= hole.par) proofs[hole.id] = { ace, parRoute: par.shots };
  if (svgDir) {
    mkdirSync(svgDir, { recursive: true });
    writeFileSync(`${svgDir}/hole-${hole.id}.svg`, svg(hole, [...(ace ? [{ shots: [ace], color: '#dc2626' }] : []), { shots: par.shots, color: '#2563eb' }]));
  }
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 1));
if (write) {
  const file = new URL('../src/games/pebble-putt/proofs.ts', import.meta.url);
  const head = readFileSync(file, 'utf8').split('export const PROOFS')[0];
  const body = Object.keys(proofs).map(Number).sort((a, b) => a - b).map(id => `  ${id}: ${JSON.stringify(proofs[id])}`).join(',\n');
  writeFileSync(file, `${head}export const PROOFS: Record<number, { ace: Shot; parRoute: Shot[] }> = {\n${body}\n};\n`);
  console.log('proofs.ts updated');
}
// keep `Cell` referenced for readers of the JSON shape
export type { Cell };
