/**
 * Lantern Works authoring lab: replays the stored solutions (or one level's) and prints the outcome and the board.
 *   npx vite-node scripts/lantern-works-lab.ts            every level
 *   npx vite-node scripts/lantern-works-lab.ts 2-3 -v     one level, with the final board drawn
 */
import { LEVELS } from '../src/games/lantern-works/data/levels';
import { runScript } from '../src/games/lantern-works/script';
import { T, type Sim } from '../src/games/lantern-works/sim';
import { SOLUTIONS } from '../tests/lantern-works-solutions';

const ARROW = ['>', 'v', '<', '^'];
const LETTER: Record<string, string> = { folder: 'F', vat: 'V', joiner: 'J', splitter: 'Y', mixer: 'M', sorter: 'S', bin: 'B', bridge: '+', wick: 'W', gate: 'G', stamp: 'P', bundler: 'U' };
function draw(sim: Sim): string {
  const rows: string[] = [];
  for (let y = 0; y < sim.h; y++) {
    let row = '';
    for (let x = 0; x < sim.w; x++) {
      const c = y * sim.w + x, p = sim.parts[c], t = sim.terrain[c], s = sim.slots[c];
      let ch = t === T.Pillar ? '##' : t === T.Source ? 'S' + ARROW[sim.sources.find(q => q.x === x && q.y === y)!.dir] : t === T.Stall ? '[]' : ' .';
      if (p) ch = (p.kind === 'belt' ? ARROW[p.dir] : LETTER[p.kind]) + (p.kind === 'belt' ? (s.out ? '*' : ' ') : ARROW[p.dir]);
      row += ch + ' ';
    }
    rows.push(row);
  }
  return rows.join('\n');
}
const [only, flag] = process.argv.slice(2);
for (const level of LEVELS) {
  if (only && level.id !== only) continue;
  const sols = SOLUTIONS[level.id] ?? {};
  if (!Object.keys(sols).length) { console.log(`${level.id}: NO SOLUTIONS`); continue; }
  for (const [name, lines] of Object.entries(sols)) {
    const r = runScript(level, lines, 3000);
    const st = r.sim.stalls.map(s => s.wants.map(w => `${w.got}/${w.n}`).join(',')).join(' | ');
    console.log(`${level.id} ${name.padEnd(10)} won=${r.won} beat=${r.wonAt ?? r.sim.beat} parts=${r.maxParts} (tidy<=${level.parTidy} ${r.maxParts <= level.parTidy ? 'Y' : 'n'}, swift<=${level.parSwift} ${r.wonAt !== null && r.wonAt <= level.parSwift ? 'Y' : 'n'}) wrong=${r.sim.wrong} stalls=${st}${r.errors.length ? ' ERR ' + r.errors.join('; ') : ''}`);
    if (flag === '-v') console.log(draw(r.sim));
  }
}
