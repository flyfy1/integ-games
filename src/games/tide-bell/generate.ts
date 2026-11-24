import { DIRS, initialState, parseBoard, solveLevel, stateKey, step, type State } from './rules';
import { analyze } from './solver';

/**
 * Daily cove generator. A seeded random grid of one theme's tiles is annealed towards a better puzzle, judged by
 * the solver: it must be solvable in 10-24 moves, every log and bell must matter, and it scores higher for more
 * places to go wrong (dead-end share and tempting traps beside the solution) on fewer open tiles.
 * Deterministic for a seed, so every player gets the same cove on the same day.
 */
export type Theme = { name: string; palette: string; tide: number };
export const THEMES: Theme[] = [
  { name: 'driftwood', palette: 'RRRRSSSDDXXXXXrsB', tide: 0 },
  { name: 'three waters', palette: 'RRRSSTTDDXXXXXrstUN', tide: 0 },
  { name: 'sandcastles', palette: 'RRRSSSDDXXXXXrsBCC', tide: 0 },
  { name: 'currents', palette: 'RRRSSDDXXXXXXrsB><v^}Y', tide: 0 }
];
export type Generated = { rows: string[]; tide: number; par: number; solution: string; theme: string; score: number };

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

type Score = { score: number; ok: boolean; par: number; solution: string };
export function scoreGrid(rows: string[], tide: number, par: [number, number] = [10, 24]): Score | null {
  let b; try { b = parseBoard(rows, tide); } catch { return null; }
  if (b.rafts.length > 3) return null;
  for (let i = 0; i < b.castle.length; i++) if (b.castle[i] && b.castle[i] <= tide) return null;
  const a = analyze(b, initialState(b), undefined, 20_000);
  if (!a.complete || a.par === null) return null;
  const sol = solveLevel(rows, tide);
  if (!sol.moves) return null;
  let idle = 0;
  for (let i = 0; i < b.rafts.length; i++) { const s = solveLevel(rows, tide, [`raft:${i}`]); if (s.moves !== null && s.moves.length <= a.par) idle++; }
  rows.forEach((r, y) => [...r].forEach((c, x) => {
    if (!'BUN'.includes(c)) return;
    const s = solveLevel(rows.map((rr, yy) => (yy === y ? rr.slice(0, x) + 'R' + rr.slice(x + 1) : rr)), tide);
    if (s.moves !== null && s.moves.length <= a.par!) idle++;
  }));
  let traps = 0, s: State = initialState(b);
  for (const m of sol.moves) {
    for (const d of DIRS) { if (d === m) continue; const n = step(b, s, d); if (!n) continue; const id = a.ids.get(stateKey(n)); if (id !== undefined && a.dist[id] < 0) traps++; }
    s = step(b, s, m as never)!;
  }
  let rings = 0, rev = 0; s = initialState(b);
  for (const m of sol.moves) { s = step(b, s, m as never)!; if (b.kind[s.pos] === 5 || b.kind[s.pos] === 6 || b.kind[s.pos] === 7) rings++; }
  for (let i = 1; i < sol.moves.length; i++) if (['UD', 'DU', 'LR', 'RL'].includes(sol.moves[i - 1] + sol.moves[i])) rev++;
  const open = b.kind.reduce((n, k) => n + (k === 4 ? 0 : 1), 0);
  const off = Math.max(0, par[0] - a.par, a.par - par[1]);
  const score = Math.min(a.par, par[1]) - open * 1.3 + (a.dead / a.states) * 12 + Math.min(traps, 12) * 1.5 - idle * 10 - off * 3 - Math.max(0, rings - 3) * 2 - rev;
  return { score, ok: idle === 0 && off === 0, par: a.par, solution: sol.moves };
}

/** Anneal from a seeded random grid. `budget` is the number of candidates tried (each is one solver pass or so). */
export function generate(seed: number, budget = 900, size: [number, number] = [7, 4]): Generated | null {
  const rand = mulberry(seed);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const theme = THEMES[Math.floor(rand() * THEMES.length)];
  const [w, h] = size;
  const fresh = () => {
    const g = Array.from({ length: h }, () => Array.from({ length: w }, () => pick([...theme.palette])));
    g[Math.floor(rand() * h)][0] = 'P'; g[Math.floor(rand() * h)][w - 1] = 'G';
    return g.map(r => r.join(''));
  };
  const mutate = (rows: string[]) => {
    const g = rows.map(r => [...r]);
    for (let n = 1 + Math.floor(rand() * 2); n > 0; n--) {
      let x = 0, y = 0;
      do { x = Math.floor(rand() * w); y = Math.floor(rand() * h); } while ('PG'.includes(g[y][x]));
      g[y][x] = pick([...theme.palette]);
    }
    return g.map(r => r.join(''));
  };
  let cur = fresh(), cs = scoreGrid(cur, theme.tide);
  let tries = 0;
  while (!cs && tries < budget) { tries++; cur = tries % 60 === 0 ? fresh() : mutate(cur); cs = scoreGrid(cur, theme.tide); }
  if (!cs) return null;
  let best: Generated | null = cs.ok ? { rows: cur, tide: theme.tide, par: cs.par, solution: cs.solution, theme: theme.name, score: cs.score } : null;
  for (let i = tries; i < budget; i++) {
    const temp = 2.5 * (1 - i / budget) + 0.05;
    const cand = mutate(cur); const sc = scoreGrid(cand, theme.tide); if (!sc) continue;
    if (sc.score >= cs!.score || rand() < Math.exp((sc.score - cs!.score) / temp)) {
      cur = cand; cs = sc;
      if (sc.ok && (!best || sc.score > best.score)) best = { rows: cand, tide: theme.tide, par: sc.par, solution: sc.solution, theme: theme.name, score: sc.score };
    }
  }
  return best;
}

/** Today's cove: tries a few seeds from the date until one yields a level (in practice the first almost always does). */
export function dailyLevel(seed: number, budget = 5000): Generated | null {
  let fallback: Generated | null = null;
  for (let k = 0; k < 4; k++) {
    const g = generate((seed + k * 7919) >>> 0, budget);
    if (g && g.score >= 6) return g;
    if (g && (!fallback || g.score > fallback.score)) fallback = g;
  }
  return fallback;
}
