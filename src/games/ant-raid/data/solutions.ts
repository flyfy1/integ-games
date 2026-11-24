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
    { t: 0, paint: row(4, 2, 10) },
    { t: 0, keep: 'worker', ants: 24 },
    { t: 0, react: 'scatter-shoe' }
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
  ] },
  '2-1': { ops: [
    { t: 0, paint: path(col(1, 3, 0), row(0, 2, 14), col(14, 1, 4)) },
    { t: 0, keep: 'worker', ants: 18 },
    { t: 10, keep: 'porter', ants: 2 }
  ] },
  '2-2': { ops: [
    { t: 0, paint: path(row(4, 2, 7), col(5, 5, 7)) },
    { t: 0, play: 'digger', at: [8, 4] },
    { t: 0.5, keep: 'worker', ants: 9 },
    { t: 4, paint: path(row(4, 2, 11)), keep: true },
    { t: 4, priority: 'cube', level: 2 },
    { t: 4, keep: 'porter', ants: 2 }
  ] },
  '2-3': { ops: [
    { t: 0, paint: row(4, 2, 14) },
    { t: 0, keep: 'leafcutter', ants: 4 },
    { t: 1, keep: 'worker', ants: 15 }
  ] },
  '2-4': { ops: [
    { t: 0, paint: path(col(1, 3, 2), row(2, 2, 5)) },
    { t: 0, play: 'digger', at: [6, 2] },
    { t: 3, paint: path(col(1, 3, 2), row(2, 2, 7)), keep: true },
    { t: 9, play: 'digger', at: [8, 2] },
    { t: 9, paint: path(col(1, 3, 2), row(2, 2, 14), col(14, 3, 4)), keep: true }
  ] },
  '2-5': { loadout: ['worker', 'porter', 'digger', 'leafcutter', 'soldier'], ops: [
    { t: 0, paint: path(row(4, 2, 13), col(13, 3, 1), row(1, 14, 14)), keep: true },
    ...[2, 4, 6, 8, 10].map((x, i) => ({ t: i * 4.1, play: 'digger' as const, at: [x, 4] as Cell })),
    { t: 0, keep: 'worker', ants: 3, until: 25 },
    { t: 25, keep: 'worker', ants: 25 },
    { t: 40, paint: path(row(4, 2, 12), col(12, 5, 7), row(7, 13, 14)), keep: true }
  ] },
  '3-1': { ops: [
    { t: 0, paint: row(4, 2, 4) },
    { t: 0, play: 'bridger', at: [5, 4] },
    { t: 0.5, paint: row(4, 2, 14), keep: true },
    { t: 1, keep: 'worker', ants: 15, reserve: 45, until: 12 },
    { t: 12, play: 'bridger', at: [10, 4] },
    { t: 12.5, keep: 'worker', ants: 15 }
  ] },
  '3-2': { ops: [
    { t: 0, paint: row(4, 2, 14) },
    { t: 0, play: 'spitter', at: [7, 4] },
    { t: 5, keep: 'worker', ants: 15 }
  ] },
  '3-3': { ops: [
    { t: 0, paint: path(col(1, 5, 7), row(7, 2, 14), col(14, 6, 4)) },
    { t: 0, keep: 'flyer', ants: 4 },
    { t: 0, keep: 'worker', ants: 15 }
  ] },
  '3-4': { loadout: ['worker', 'porter', 'bridger'], ops: [
    { t: 0, paint: path(col(1, 5, 7), row(7, 2, 4)) },
    { t: 0, keep: 'worker', ants: 6, until: 12 },
    { t: 4, paint: row(4, 2, 6) },
    { t: 4, play: 'bridger', at: [7, 4] },
    { t: 5, paint: row(4, 2, 7), keep: true },
    { t: 14, play: 'bridger', at: [8, 4] },
    { t: 11, paint: row(4, 2, 13), keep: true },
    { t: 14, priority: 'melon', level: 2 },
    { t: 14, keep: 'porter', ants: 6 },
    { t: 14, keep: 'worker', ants: 16 }
  ] },
  '3-5': { loadout: ['worker', 'porter', 'bridger'], ops: [
    { t: 0, paint: path(col(1, 5, 7), row(7, 2, 3)) },
    { t: 0, keep: 'worker', ants: 9 },
    { t: 0, react: 'lift-dive' },
    { t: 5, paint: row(4, 2, 4) },
    { t: 5, play: 'bridger', at: [5, 4] },
    { t: 9, paint: row(4, 2, 9), keep: true },
    { t: 12, play: 'bridger', at: [10, 4] },
    { t: 12, paint: path(row(4, 2, 13), col(13, 3, 1), row(1, 14, 14)), keep: true },
    { t: 14, priority: 'biscuit', level: 2 },
    { t: 14, keep: 'porter', ants: 3 },
    { t: 14, keep: 'worker', ants: 16 }
  ] },
  '4-1': { ops: [
    { t: 0, paint: path(row(4, 2, 6), col(6, 3, 3), row(3, 7, 12), col(12, 2, 2), row(2, 13, 13)), keep: true },
    { t: 0, play: 'scout', at: [10, 3] },
    { t: 0.5, keep: 'worker', ants: 15 },
    { t: 3, play: 'scout', at: [13, 2] },
    { t: 20, paint: path(row(4, 2, 6), col(6, 5, 5), row(5, 7, 9), col(9, 6, 7), row(7, 10, 12)), keep: true }
  ] },
  '4-2': { ops: [
    { t: 0, paint: path(col(1, 5, 8), row(8, 2, 6), col(6, 7, 0), row(0, 7, 11), col(11, 1, 4), row(4, 12, 14)) },
    { t: 0, play: 'honeypot', at: [11, 2] },
    { t: 1, keep: 'worker', ants: 20 }
  ] },
  '4-3': { ops: [
    { t: 0, paint: path(row(4, 2, 5), col(5, 3, 2), row(2, 6, 9)) },
    { t: 0, play: 'soldier', at: [9, 2] },
    { t: 1, keep: 'worker', ants: 18 },
    { t: 8, paint: path(row(4, 2, 5), col(5, 5, 6), row(6, 6, 9)) },
    { t: 8, play: 'soldier', at: [9, 6] }
  ] },
  '4-4': { loadout: ['worker', 'soldier', 'porter'], ops: [
    { t: 0, paint: path(row(4, 2, 4), col(4, 3, 1), row(1, 5, 8)) },
    { t: 0, keep: 'worker', ants: 14 },
    { t: 20, play: 'soldier', at: [2, 4] },
    { t: 24, play: 'soldier', at: [4, 4] },
    { t: 60, play: 'soldier', at: [3, 4] },
    { t: 64, play: 'soldier', at: [4, 3] }
  ] },
  '4-5': { loadout: ['worker', 'soldier', 'porter'], ops: [
    { t: 0, paint: path(row(4, 2, 8)) },
    { t: 0, play: 'soldier', at: [8, 4] },
    { t: 0, paint: path(row(4, 2, 4), col(4, 3, 1), row(1, 5, 9)) },
    { t: 0, paint: path(row(4, 2, 4), col(4, 5, 7), row(7, 5, 9)) },
    { t: 3.1, play: 'soldier', at: [9, 1] },
    { t: 6.2, play: 'soldier', at: [9, 7] },
    { t: 7, keep: 'worker', ants: 12 },
    { t: 15, play: 'soldier', at: [2, 4] },
    { t: 18.2, play: 'soldier', at: [3, 4] },
    { t: 40, play: 'soldier', at: [4, 4] }
  ] }
};
