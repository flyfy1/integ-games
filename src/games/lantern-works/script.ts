import { applyEdit, createSim, run, step, type Sim } from './sim';
import type { Dir, Edit, LevelDef, PartKind } from './types';

/**
 * A tiny text form for builds, used by the stored reference solutions (tests) and the authoring lab:
 *   belt 1,2 >>>v        belts from (1,2): each arrow is one belt cell pointing that way, then the next cell
 *   folder 4,2 > square  a part at (4,2) facing east with its dial set
 *   sorter 5,3 v lotus R a sorter facing south that turns matches to its right (default left)
 *   @40 dial 4,2 round   timed edits: applied when the run reaches beat 40 (also remove x,y / rotate x,y)
 */
const DIRS: Record<string, Dir> = { '>': 0, v: 1, '<': 2, '^': 3 };
export const DIR_CHARS = ['>', 'v', '<', '^'] as const;

export type TimedEdit = { at: number; edit: Edit };

export function parseScript(lines: readonly string[]): TimedEdit[] {
  const out: TimedEdit[] = [];
  for (const raw of lines) {
    let line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    let at = 0;
    const timed = /^@(\d+)\s+(.*)$/.exec(line);
    if (timed) { at = Number(timed[1]); line = timed[2]; }
    const [word, pos, ...rest] = line.split(/\s+/);
    const m = /^(\d+),(\d+)$/.exec(pos ?? '');
    if (!m) throw new Error(`bad position in "${raw}"`);
    let x = Number(m[1]), y = Number(m[2]);
    if (word === 'belt') {
      for (const ch of rest.join('')) {
        const dir = DIRS[ch];
        if (dir === undefined) throw new Error(`bad belt arrow "${ch}" in "${raw}"`);
        out.push({ at, edit: { op: 'place', kind: 'belt', x, y, dir } });
        x += [1, 0, -1, 0][dir]; y += [0, 1, 0, -1][dir];
      }
    } else if (word === 'remove' || word === 'rotate') out.push({ at, edit: { op: word, x, y } });
    else if (word === 'dial') out.push({ at, edit: { op: 'dial', x, y, value: rest[0] } });
    else {
      const dir = DIRS[rest[0]];
      if (dir === undefined) throw new Error(`missing direction in "${raw}"`);
      const extra = rest.slice(1);
      const flip = extra.includes('R');
      const dial = extra.find(t => t !== 'R' && t !== 'L');
      out.push({ at, edit: { op: 'place', kind: word as PartKind, x, y, dir, dial, flip } });
    }
  }
  return out;
}

export type ScriptResult = { sim: Sim; won: boolean; wonAt: number | null; maxParts: number; spoiled: boolean; errors: string[] };

/** Builds the tick-0 edits, presses Run, applies timed edits on their beats, and runs until filled or `maxBeats`. */
export function runScript(level: LevelDef, lines: readonly string[], maxBeats = 1500, seed = 1): ScriptResult {
  const sim = createSim(level, seed);
  const edits = parseScript(lines);
  const errors: string[] = [];
  const apply = (t: TimedEdit) => { const fail = applyEdit(sim, t.edit); if (fail) errors.push(`@${t.at} ${JSON.stringify(t.edit)}: ${fail}`); };
  edits.filter(e => e.at === 0).forEach(apply);
  run(sim);
  while (sim.status === 'run' && sim.beat < maxBeats) {
    edits.filter(e => e.at > 0 && e.at === sim.beat).forEach(apply);
    step(sim);
  }
  return { sim, won: sim.wonAt !== null, wonAt: sim.wonAt, maxParts: sim.maxParts, spoiled: sim.status === 'spoiled', errors };
}
