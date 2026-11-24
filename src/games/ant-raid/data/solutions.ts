import type { Cell, Script } from '../bot';

/**
 * Reference solutions: one stored script per campaign level, replayed by `tests/ant-raid-content.test.ts` to prove the
 * level can be won with a margin (and bosses without more than three Scatters). They are written the way a careful
 * player would play: a trail, a few standing hatch orders, reactions to telegraphed attacks.
 */
const row = (y: number, x0: number, x1: number): Cell[] => { const out: Cell[] = []; const s = Math.sign(x1 - x0) || 1; for (let x = x0; x !== x1 + s; x += s) out.push([x, y]); return out; };
const col = (x: number, y0: number, y1: number): Cell[] => { const out: Cell[] = []; const s = Math.sign(y1 - y0) || 1; for (let y = y0; y !== y1 + s; y += s) out.push([x, y]); return out; };
const path = (...parts: Cell[][]): Cell[] => { const out: Cell[] = []; for (const part of parts) for (const c of part) if (!out.some(o => o[0] === c[0] && o[1] === c[1])) out.push(c); return out; };

export const SOLUTIONS: Record<string, Script> = {
  '1-1': { ops: [
    { t: 0, paint: row(4, 2, 11) },
    { t: 0.5, keep: 'worker', ants: 15 }
  ] },
  '1-2': { ops: [
    { t: 0, paint: path(row(4, 2, 7), col(7, 5, 7)) },
    { t: 0.5, keep: 'worker', ants: 9 },
    { t: 6, paint: path(row(4, 2, 12), col(12, 3, 2)) },
    { t: 6, priority: 'berry', level: 2 },
    { t: 6, keep: 'porter', ants: 3 }
  ] },
  '1-3': { ops: [
    { t: 0, paint: path(row(4, 2, 7), [[7, 5], [8, 5], [9, 5], [9, 4]], row(4, 10, 13)) },
    { t: 0, play: 'soldier', at: [7, 5] },
    { t: 2, keep: 'worker', ants: 18 }
  ] },
  '1-4': { loadout: ['worker', 'porter', 'soldier'], ops: [
    { t: 0, paint: path(col(1, 5, 8), row(8, 2, 8)) },
    { t: 0, keep: 'worker', ants: 12 },
    { t: 0, react: 'scatter-shoe' },
    { t: 10, paint: row(4, 2, 14) },
    { t: 10, keep: 'worker', ants: 24 }
  ] },
  '1-5': { loadout: ['worker', 'porter', 'soldier'], ops: [
    { t: 0, paint: path(col(1, 5, 8), row(8, 2, 3)) },
    { t: 0, keep: 'worker', ants: 12, until: 14 },
    { t: 12, paint: path(row(6, 1, 8)) },
    { t: 14, paint: path(col(1, 3, 2), row(2, 2, 13)) },
    { t: 14, priority: 'cake', level: 2 },
    { t: 14, keep: 'porter', ants: 2 },
    { t: 14, keep: 'worker', ants: 26 },
    { t: 14, react: 'rally-nap' }
  ] }
};
