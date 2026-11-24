/**
 * Tide Bell level search: anneals a hand-drawn seed grid towards a tighter puzzle and prints the best few.
 * A candidate must stay solvable, keep its par in range, need every listed idea (turning it off makes the level
 * unsolvable or longer), and use every log and bell. It scores higher for a longer par on fewer open tiles and for
 * more tempting dead ends next to the solution. The designer still picks and polishes by hand.
 *
 *   npx vite-node scripts/tide-bell-search.ts -- '<json>'
 *   json: { "seed": ["XBXX", "PRSG"], "tide": 0, "palette": "RRSSDX", "need": ["bells"], "par": [8, 30],
 *           "iters": 4000, "rng": 1, "maxRafts": 3, "lock": [[x, y], ...] }
 */
import { parseBoard, solveLevel, type Ablation } from '../src/games/tide-bell/rules';
import { analyze } from '../src/games/tide-bell/solver';
import { grade } from './tide-bell-grade';

type Opts = { seed?: string[]; size?: [number, number]; tide: number; palette: string; need: Ablation[]; par: [number, number]; iters?: number; rng?: number; maxRafts?: number; lock?: [number, number][]; top?: number; obstacles?: number; w?: Partial<Record<'par' | 'open' | 'dead' | 'traps' | 'idle', number>> };
const opts = JSON.parse(process.argv.slice(2).find(a => a.trim().startsWith('{')) ?? '{}') as Opts;
let seed = (opts.rng ?? 1) >>> 0;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];

const locked = new Set((opts.lock ?? []).map(([x, y]) => `${x},${y}`));
function mutate(rows: string[]): string[] {
  const g = rows.map(r => [...r]);
  const h = g.length, w = g[0].length;
  const cells: [number, number][] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!'PG'.includes(g[y][x]) && !locked.has(`${x},${y}`)) cells.push([x, y]);
  const n = 1 + Math.floor(rand() * 2);
  for (let i = 0; i < n; i++) {
    if (rand() < 0.25) { const [ax, ay] = pick(cells), [bx, by] = pick(cells); [g[ay][ax], g[by][bx]] = [g[by][bx], g[ay][ax]]; }
    else { const [x, y] = pick(cells); g[y][x] = pick([...opts.palette]); }
  }
  return g.map(r => r.join(''));
}

function score(rows: string[]): { score: number; info: string } | null {
  const g = grade(rows, opts.tide, opts.need, { maxRafts: opts.maxRafts });
  if (!g) return null;
  if (g.idleBells || (g.idleLogs > (opts.obstacles ?? 0))) return null;
  if (g.par < opts.par[0] || g.par > opts.par[1]) return null;
  const w = { par: 1, open: 0.7, dead: 18, traps: 1.2, idle: 6, ...opts.w };
  const s = g.par * w.par - g.open * w.open + g.deadRatio * w.dead + Math.min(g.traps, 12) * w.traps - g.idle * w.idle;
  return { score: s, info: `par ${g.par} open ${g.open} states ${g.states} dead ${(g.deadRatio * 100).toFixed(0)}% traps ${g.traps} idle ${g.idle} ${g.moves}` };
}

if (!opts.seed) {
  // No sketch: a random grid of the palette with you on the left edge and the flag on the right.
  const [w, h] = opts.size ?? [7, 4];
  const g = Array.from({ length: h }, () => Array.from({ length: w }, () => pick([...opts.palette])));
  g[Math.floor(rand() * h)][0] = 'P'; g[Math.floor(rand() * h)][w - 1] = 'G';
  opts.seed = g.map(r => r.join(''));
}
let cur = opts.seed, curScore = score(cur);
// An unsolvable seed is a sketch: wander from it until something passes the filters.
for (let i = 0; !curScore && i < 20000; i++) { const c = mutate(i % 50 === 0 ? opts.seed! : cur); cur = c; curScore = score(c); }
if (!curScore) { console.log('no start');process.exit(1);console.log('seed fails the filters:', JSON.stringify(solveLevel(cur, opts.tide)), analyze(parseBoard(cur, opts.tide)).par); process.exit(1); }
const best = new Map<string, { rows: string[]; score: number; info: string }>();
best.set(cur.join('/'), { rows: cur, ...curScore });
const iters = opts.iters ?? 3000;
for (let i = 0; i < iters; i++) {
  const temp = 2.5 * (1 - i / iters) + 0.05;
  const cand = mutate(cur);
  const sc = score(cand); if (!sc) continue;
  if (sc.score >= curScore.score || rand() < Math.exp((sc.score - curScore.score) / temp)) {
    cur = cand; curScore = sc;
    best.set(cand.join('/'), { rows: cand, ...sc });
  }
}
const top = [...best.values()].sort((a, b) => b.score - a.score).slice(0, opts.top ?? 6);
for (const t of top) { console.log(`score ${t.score.toFixed(1)}  ${t.info}`); console.log('  ' + t.rows.join('\n  ')); console.log(`  "${t.rows.join('/')}"`); }
