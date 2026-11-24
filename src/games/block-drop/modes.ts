/** Block Drop modes and the authored Dig puzzles. Data only; the cabinet in index.ts runs them. */
import { seededRandom } from '../../core/services';

export type ModeId = 'marathon' | 'sprint' | 'ultra' | 'zen' | 'dig' | 'daily';

/** Lines to finish a Sprint, and the clock for Ultra and the Daily. */
export const SPRINT_LINES = 40;
export const ULTRA_MS = 120_000;
/** Timed modes open with a short count-in so the clock never starts before the player is ready. */
export const COUNT_IN_MS = 1500;

export const MODE_NAMES: Record<ModeId, [en: string, zh: string]> = {
  marathon: ['Marathon', '马拉松'],
  sprint: ['Sprint 40', '竞速四十行'],
  ultra: ['Ultra 2:00', '两分钟'],
  zen: ['Zen', '禅'],
  dig: ['Dig puzzles', '挖掘关'],
  daily: ['Daily', '每日']
};
export const MODE_BLURBS: Record<ModeId, [en: string, zh: string]> = {
  marathon: ['Endless. Speeds up every 10 lines.', '无尽模式，每 10 行加速。'],
  sprint: ['Clear 40 lines as fast as you can.', '尽快消除 40 行。'],
  ultra: ['Score as much as you can in two minutes.', '两分钟内尽量多得分。'],
  zen: ['No speed-up, no game over. Just stack.', '不加速，不会输，安心堆叠。'],
  dig: ['Clear the grey garbage within a piece budget.', '在限定方块数内挖光灰色垃圾行。'],
  daily: ['Two minutes, the same pieces for everyone today.', '两分钟，今天所有人方块顺序相同。']
};

export type DigPuzzle = {
  name: [en: string, zh: string];
  /** Garbage rows bottom-up: '#' filled, '.' open. */
  rows: readonly string[];
  /** Pieces for three stars: the reference solver's count (straight drops and hold only). */
  par: number;
  /** Pieces allowed in total; finishing inside it earns one star. */
  budget: number;
};

/** Two stars sit halfway between par and the budget. */
export const twoStarLimit = (p: DigPuzzle) => p.par + Math.ceil((p.budget - p.par) / 2);
export function digStars(p: DigPuzzle, pieces: number): 0 | 1 | 2 | 3 {
  if (pieces <= p.par) return 3;
  if (pieces <= twoStarLimit(p)) return 2;
  return pieces <= p.budget ? 1 : 0;
}
/** Each puzzle has its own fixed piece order, so a retry is the same puzzle. */
export const digRandom = (index: number) => seededRandom(0xd16 + index * 7919);

export const DIG_PUZZLES: readonly DigPuzzle[] = [
  { name: ['Open seam', '一道缝'], rows: ['####.#####', '####.#####'], par: 1, budget: 4 },
  { name: ['Corner', '墙角'], rows: ['#########.', '########..'], par: 1, budget: 4 },
  { name: ['T slot', 'T 形槽'], rows: ['####.#####', '###...####'], par: 2, budget: 5 },
  { name: ['Two wells', '两口井'], rows: ['##.#######', '#######.##'], par: 2, budget: 5 },
  { name: ['Twin notch', '双凹口'], rows: ['###..#####', '###..#####', '#####..###'], par: 2, budget: 5 },
  { name: ['Ladder', '梯子'], rows: ['#.########', '#.########', '########.#', '########.#'], par: 4, budget: 7 },
  { name: ['Pockets', '口袋'], rows: ['###.######', '##...#####', '#####.####', '####...###'], par: 3, budget: 6 },
  { name: ['First cheese', '初尝奶酪'], rows: ['####.#####', '#.########', '#######.##', '###.######'], par: 4, budget: 7 },
  { name: ['Double holes', '双孔'], rows: ['##..######', '######..##', '#..#######', '#######..#'], par: 5, budget: 8 },
  { name: ['Canyon', '峡谷'], rows: ['#####.####', '####..####', '###...####', '##....####'], par: 3, budget: 6 },
  { name: ['Staircase', '台阶'], rows: ['#.########', '##.#######', '###.######'], par: 3, budget: 6 },
  { name: ['Split well', '分岔井'], rows: ['####..####', '####..####', '#.######.#', '#.######.#'], par: 3, budget: 6 },
  { name: ['Pillars', '立柱'], rows: ['##.####.##', '##.####.##', '##.####.##'], par: 6, budget: 10 },
  { name: ['Six slices', '六片奶酪'], rows: ['######.###', '##.#######', '########.#', '.#########', '#####.####', '###.######'], par: 7, budget: 12 },
  { name: ['Ridge', '山脊'], rows: ['.#########', '#########.', '.#########', '#########.'], par: 8, budget: 13 },
  { name: ['Zigzag', '之字'], rows: ['#..#######', '##..######', '###..#####', '####..####', '#####..###'], par: 7, budget: 12 },
  { name: ['Deep cheese', '深层奶酪'], rows: ['###.######', '#######.##', '.#########', '#####.####', '##.#######', '#########.', '####.#####', '#.########', '######.###'], par: 12, budget: 20 },
  { name: ['Eight slices', '八片奶酪'], rows: ['#######.##', '#.########', '#####.####', '##.#######', '########.#', '####.#####', '.#########', '######.###'], par: 10, budget: 16 },
  { name: ['Rubble', '碎石'], rows: ['#.####.###', '###.######', '#####..###', '.########.', '##.#######', '#######.##', '###..#####', '#.########', '######.###', '####.#####'], par: 19, budget: 31 },
  { name: ['The quarry', '采石场'], rows: ['####.#####', '#.######.#', '###.######', '######..##', '#.########', '#####.####', '########.#', '##.#######', '#######.##', '.#########', '####.#####', '##.####.##'], par: 27, budget: 44 }
];
