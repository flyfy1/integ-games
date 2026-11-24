/**
 * Tide Bell authoring lab: grades every stored level (par, states, dead-end share, traps, idea check, trap check),
 * or one level / one ad-hoc grid with its solution drawn step by step.
 *   npx vite-node scripts/tide-bell-lab.ts               every level
 *   npx vite-node scripts/tide-bell-lab.ts 2-3           one level, solution drawn
 *   npx vite-node scripts/tide-bell-lab.ts 'XBXX/PRSG' 1 an ad-hoc grid at start tide 1
 */
import { LEVELS } from '../src/games/tide-bell/levels';
import { initialState, isWet, parseBoard, replay, step, type Board, type Dir, type State } from '../src/games/tide-bell/rules';
import { analyze, distanceOf } from '../src/games/tide-bell/solver';
import { grade } from './tide-bell-grade';

export function draw(b: Board, s: State): string {
  const rows: string[] = [];
  for (let y = 0; y < b.h; y++) {
    let row = '';
    for (let x = 0; x < b.w; x++) {
      const i = y * b.w + x;
      const base = '.,;~#BUNG~'[b.kind[i]];
      let ch = b.castle[i] && s.peak < b.castle[i] ? 'C' : b.flow[i] !== 255 ? '^v<>'[b.flow[i]] : b.kind[i] === 1 || b.kind[i] === 2 ? (isWet(b, s, i) ? '~' : b.kind[i] === 1 ? ',' : ';') : base;
      if (s.rafts.includes(i)) ch = isWet(b, s, i) ? '=' : 'o';
      if (s.pos === i) ch = '@';
      row += ch + ' ';
    }
    rows.push(row);
  }
  return rows.join('\n');
}

function show(rows: string[], tide: number, moves: string) {
  const b = parseBoard(rows, tide); let s = initialState(b);
  console.log(`tide ${s.tide}\n${draw(b, s)}`);
  for (const [i, m] of [...moves].entries()) { s = step(b, s, m as Dir)!; console.log(`\n${i + 1}. ${m}  tide ${s.tide}\n${draw(b, s)}`); }
}

/** The shortest move strings that end where the flag can no longer be reached: candidates for the stored trap. */
function deadEnds(b: Board, limit = 12): string[] {
  const a = analyze(b); const out: string[] = [];
  const seen = new Set<string>(); let layer: [State, string][] = [[initialState(b), '']];
  while (layer.length && out.length < limit) {
    const next: [State, string][] = [];
    for (const [s, path] of layer) for (const d of 'UDLR') {
      const n = step(b, s, d as Dir); if (!n) continue;
      const k = JSON.stringify(n); if (seen.has(k)) continue; seen.add(k);
      if (distanceOf(a, n) === -1) { if (out.length < limit) out.push(path + d); } else next.push([n, path + d]);
    }
    layer = next;
  }
  return out;
}

const arg = process.argv[2];
if (arg && arg.includes('/')) {
  const rows = arg.split('/'), tide = Number(process.argv[3] ?? 0);
  const g = grade(rows, tide, []);
  console.log(JSON.stringify(g));
  if (g) show(rows, tide, g.moves);
} else {
  for (const lv of LEVELS) {
    if (arg && lv.id !== arg) continue;
    const g = grade(lv.rows, lv.tide, lv.ablate);
    const b = parseBoard(lv.rows, lv.tide);
    let trap = 'none';
    if (lv.trap) {
      try { const s = replay(b, lv.trap); const a = analyze(b, s); trap = a.par === null ? 'dead' : `ALIVE (${distanceOf(analyze(b), s)})`; } catch (e) { trap = (e as Error).message.startsWith('blocked') ? 'blocked' : `bad: ${(e as Error).message}`; }
    }
    const ok = g && g.par === lv.par ? 'ok ' : 'BAD';
    console.log(`${ok} ${lv.id.padEnd(4)} ${lv.name.en.padEnd(18)} par ${String(g?.par).padStart(2)} / stored ${String(lv.par).padStart(2)}  states ${String(g?.states).padStart(6)}  dead ${((g?.deadRatio ?? 0) * 100).toFixed(0).padStart(3)}%  traps ${String(g?.traps).padStart(2)}  need ${JSON.stringify(g?.need)}  trap ${trap}  ${g?.moves}`);
    if (arg) { show(lv.rows, lv.tide, g?.moves ?? ''); console.log('\nshortest dead ends:', deadEnds(b).join(' ')); }
  }
}
