/**
 * Grades one Tide Bell level for the lab and the search: par, state count, dead-end share, tempting traps next to
 * the solution, whether each listed idea is needed, and whether every log and bell earns its place.
 */
import { DIRS, initialState, parseBoard, solveLevel, stateKey, step, type Ablation, type State } from '../src/games/tide-bell/rules';
import { analyze } from '../src/games/tide-bell/solver';

export type Grade = { rings: number; reversals: number; par: number; moves: string; states: number; deadRatio: number; traps: number; open: number; idle: number; need: Record<string, string>; idleLogs: number; idleBells: number };

export function grade(rows: string[], tide: number, need: readonly Ablation[], o: { maxRafts?: number; soft?: boolean } = {}): (Grade & { unmet: number }) | null {
  let b; try { b = parseBoard(rows, tide); } catch { return null; }
  if (o.maxRafts !== undefined && b.rafts.length > o.maxRafts) return null;
  // Castles must start dry, and currents must not loop.
  for (let i = 0; i < b.castle.length; i++) if (b.castle[i] && b.castle[i] <= tide) return null;
  const a = analyze(b, initialState(b), undefined, 60_000);
  if (!a.complete || a.par === null) return null;
  const sol = solveLevel(rows, tide);
  if (!sol.moves) return null;
  const par = sol.moves.length;
  const needOut: Record<string, string> = {};
  let unmet = 0;
  for (const ab of need) {
    const s = solveLevel(rows, tide, [ab]);
    if (s.moves !== null && s.moves.length <= par) { if (!o.soft) return null; unmet++; needOut[ab] = 'NOT NEEDED'; continue; }
    needOut[ab] = s.moves === null ? 'unsolvable' : `longer (${s.moves.length})`;
  }
  // Logs and bells that do not matter (without them the level is as short or shorter). Obstacle logs count here too.
  let idleLogs = 0, idleBells = 0;
  for (let i = 0; i < b.rafts.length; i++) { const s = solveLevel(rows, tide, [`raft:${i}`]); if (s.moves !== null && s.moves.length <= par) idleLogs++; }
  // Every bell must matter: as plain rock the level is unsolvable or longer.
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) if ('BUN'.includes(rows[y][x])) {
    const r2 = rows.map((r, yy) => (yy === y ? r.slice(0, x) + 'R' + r.slice(x + 1) : r));
    const s = solveLevel(r2, tide); if (s.moves !== null && s.moves.length <= par) idleBells++;
  }
  // Traps: from each state on the solution, moves that lead somewhere the flag can no longer be reached.
  let s: State = initialState(b), traps = 0, idle = 0;
  for (const m of sol.moves) {
    for (const d of DIRS) { if (d === m) continue; const n = step(b, s, d); if (!n) continue; const id = a.ids.get(stateKey(n)); if (id !== undefined && a.dist[id] < 0) traps++; }
    s = step(b, s, m as never)!;
  }
  // Idle: open floor tiles the solution never visits and no log ever crosses (decoration the player must read).
  const used = new Set<number>(); s = initialState(b); used.add(s.pos); s.rafts.forEach(r => used.add(r));
  for (const m of sol.moves) { s = step(b, s, m as never)!; used.add(s.pos); s.rafts.forEach(r => used.add(r)); }
  let rings = 0, reversals = 0;
  { let q: State = initialState(b); for (const m of sol.moves) { q = step(b, q, m as never)!; if (b.kind[q.pos] === 5 || b.kind[q.pos] === 6 || b.kind[q.pos] === 7) rings++; } }
  for (let i = 1; i < sol.moves.length; i++) if ('UD DU LR RL'.includes(sol.moves[i - 1] + sol.moves[i])) reversals++;
  let open = 0;
  for (let i = 0; i < b.kind.length; i++) if (b.kind[i] !== 4 /* cliff */) { open++; if (!used.has(i) && !'BUNTSDvo^<>CK'.includes(rows[Math.floor(i / b.w)][i % b.w])) idle++; }
  return { rings, reversals, par, moves: sol.moves, states: a.states, deadRatio: a.dead / a.states, traps, open, idle, need: needOut, idleLogs, idleBells, unmet };
}
