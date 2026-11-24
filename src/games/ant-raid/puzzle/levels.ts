import { line } from './sim';
import type { PuzzleLevel, RuleId } from './types';

/**
 * The puzzle campaign. Every level is a plan you check by counting: the reference plan (`solution`) wins and the
 * plans a newcomer tries first (`traps`) fail, which `tests/ant-raid-puzzle.test.ts` proves with the real rules.
 * Board 16 x 9, nest at (1, 4). Scent counts trail cells, not the nest.
 */
const open = '................';
/** Build a grid from an open lawn and a list of [char, x0, y0, x1, y1] rectangles. */
function yard(...rects: [string, number, number, number, number][]): string[] {
  const rows = Array.from({ length: 9 }, () => [...open]);
  for (const [ch, x0, y0, x1, y1] of rects) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) rows[y][x] = ch;
  return rows.map(r => r.join(''));
}
const N: [number, number] = [1, 4];

export const PUZZLES: PuzzleLevel[] = [
  // ---------------------------------------------------------------- chapter 1: the lawn
  {
    id: '1-1', chapter: 1, index: 1, name: { en: 'First Crumbs', zh: '第一口面包屑' },
    grid: yard(), nest: N, squad: 'wwww',
    foods: [{ id: 'cookie', kind: 'cookie', x: 7, y: 4, crumbs: 4 }],
    scent: null, goal: { crumbs: 4, items: [] }, rules: ['trail'],
    solution: { paths: [line(N, [7, 4])] }, traps: [], outro: 'p1-intro'
  },
  {
    id: '1-2', chapter: 1, index: 2, name: { en: 'Round the Plate', zh: '绕过盘子' },
    grid: yard(['#', 4, 2, 4, 5]), nest: N, squad: 'wwww',
    foods: [{ id: 'cookie', kind: 'cookie', x: 7, y: 4, crumbs: 4 }],
    scent: 10, goal: { crumbs: 4, items: [] }, rules: ['scent'],
    solution: { paths: [line(N, [1, 6], [7, 6], [7, 4])] },
    traps: [{ name: 'over the top', plan: { paths: [line(N, [1, 1], [7, 1], [7, 4])] } }]
  },
  {
    id: '1-3', chapter: 1, index: 3, name: { en: 'One Trunk', zh: '一条主干' },
    grid: yard(), nest: N, squad: 'wwwwww',
    foods: [{ id: 'cookie', kind: 'cookie', x: 7, y: 2, crumbs: 3 }, { id: 'bread', kind: 'bread', x: 7, y: 6, crumbs: 3 }],
    scent: 10, goal: { crumbs: 6, items: [] }, rules: ['fork', 'order'],
    solution: { paths: [line(N, [7, 4], [7, 2]), line([7, 4], [7, 6])] },
    traps: [{ name: 'two trails from the nest', plan: { paths: [line(N, [1, 2], [7, 2]), line(N, [1, 6], [7, 6])] } }]
  },
  {
    id: '1-4', chapter: 1, index: 4, name: { en: 'Eight Legs', zh: '八条腿' },
    grid: yard(), nest: N, squad: 'wwwww',
    foods: [{ id: 'cookie', kind: 'cookie', x: 9, y: 4, crumbs: 5 }],
    spiders: [{ x: 5, y: 4 }],
    scent: 12, goal: { crumbs: 5, items: [] }, rules: ['spider'],
    solution: { paths: [line(N, [3, 4], [3, 2], [7, 2], [7, 4], [9, 4])] },
    traps: [
      { name: 'skim the ring along row 3', plan: { paths: [line(N, [1, 3], [9, 3], [9, 4])] } },
      { name: 'skim the ring along row 5', plan: { paths: [line(N, [1, 5], [9, 5], [9, 4])] } }
    ]
  },
  {
    id: '1-5', chapter: 1, index: 5, name: { en: 'Pay the Toll', zh: '过路费' },
    grid: yard(['#', 0, 0, 15, 1], ['#', 0, 7, 15, 8]), nest: N, squad: 'wwwwwww',
    foods: [{ id: 'cookie', kind: 'cookie', x: 9, y: 4, crumbs: 7 }],
    spiders: [{ x: 5, y: 4 }],
    scent: 10, goal: { crumbs: 5, items: [] }, rules: [],
    solution: { paths: [line(N, [1, 3], [9, 3], [9, 4])] },
    traps: [{ name: 'the safe detour of 1-4', plan: { paths: [line(N, [3, 4], [3, 2], [7, 2], [7, 4], [9, 4])] } }]
  },
  {
    id: '1-6', chapter: 1, index: 6, name: { en: 'The Strawberry', zh: '一颗草莓' },
    grid: yard(), nest: N, squad: 'wwwwww',
    // The cookie is listed first: a tie in trail length sends ants to the cookie.
    foods: [{ id: 'cookie', kind: 'cookie', x: 5, y: 4, crumbs: 3 }, { id: 'berry', kind: 'strawberry', x: 6, y: 1, crumbs: 6, lift: 4 }],
    scent: 12, par: 11, goal: { crumbs: 2, items: ['berry'] }, rules: ['big'],
    solution: { paths: [line(N, [1, 1], [6, 1]), line([5, 1], [5, 4])] },
    traps: [
      { name: 'cookie first, then on to the strawberry', plan: { paths: [line(N, [5, 4], [5, 1], [6, 1])] } },
      { name: 'a tie: strawberry and cookie both 8 away', plan: { paths: [line(N, [1, 2], [6, 2], [6, 1]), line([5, 2], [5, 4])] } }
    ],
    outro: 'p1-outro'
  },
  // ---------------------------------------------------------------- chapter 2: the stream and the chalk
  {
    id: '2-1', chapter: 2, index: 1, name: { en: 'Living Bridge', zh: '蚂蚁桥' },
    grid: yard(['~', 6, 0, 6, 8]), nest: N, squad: 'wwwwwwww',
    foods: [{ id: 'cookie', kind: 'cookie', x: 10, y: 4, crumbs: 5 }],
    scent: 9, goal: { crumbs: 5, items: [] }, rules: ['bridge'],
    solution: { paths: [line(N, [10, 4])] }, traps: []
  },
  {
    id: '2-2', chapter: 2, index: 2, name: { en: 'The Long Way', zh: '绕远路' },
    grid: yard(['~', 6, 1, 6, 8]), nest: N, squad: 'wwwwwww',
    foods: [{ id: 'cookie', kind: 'cookie', x: 10, y: 4, crumbs: 6 }],
    scent: 17, goal: { crumbs: 6, items: [] }, rules: [],
    solution: { paths: [line(N, [1, 0], [10, 0], [10, 4])] },
    traps: [{ name: 'straight across with a bridge', plan: { paths: [line(N, [10, 4])] } }]
  },
  {
    id: '2-3', chapter: 2, index: 3, name: { en: 'The White Line', zh: '白线' },
    grid: (() => { const g = yard(['c', 6, 1, 11, 7]); const row = [...g[4]]; row[9] = '.'; g[4] = row.join(''); return g; })(), nest: N, squad: 'wwwww',
    foods: [{ id: 'cube', kind: 'sugarcube', x: 9, y: 4, crumbs: 6, lift: 4 }],
    scent: 22, diggers: 1, goal: { crumbs: 0, items: ['cube'] }, rules: ['digger'],
    solution: { paths: [line(N, [1, 0], [12, 0], [12, 4]), line([12, 4], [9, 4])], digs: [[12, 4]] },
    traps: [
      { name: 'dig from the nest side', plan: { paths: [line(N, [5, 4]), line([5, 4], [9, 4])], digs: [[5, 4]] } },
      { name: 'dig down from the top', plan: { paths: [line(N, [1, 0], [9, 0]), line([9, 0], [9, 4])], digs: [[9, 0]] } }
    ]
  },
  {
    id: '2-4', chapter: 2, index: 4, name: { en: 'Decoys First', zh: '诱饵先走' },
    grid: (() => { const g = yard(['#', 4, 0, 4, 8]); for (const y of [2, 3, 4]) { const row = [...g[y]]; row[4] = '.'; g[y] = row.join(''); } return g; })(), nest: N, squad: 'wwwwwwww',
    // The cube is listed first, so a tie in trail length sends ants to the cube.
    foods: [{ id: 'cube', kind: 'sugarcube', x: 7, y: 3, crumbs: 6, lift: 4 }, { id: 'cookie', kind: 'cookie', x: 8, y: 6, crumbs: 4 }],
    spiders: [{ x: 4, y: 3 }],
    scent: 13, par: 12, goal: { crumbs: 2, items: ['cube'] }, rules: [],
    solution: { paths: [line(N, [7, 4], [7, 5], [8, 5], [8, 6]), line([8, 5], [8, 3], [7, 3])] },
    traps: [
      { name: 'the long way round the top (wins, but over par)', plan: { paths: [line(N, [8, 4], [8, 6]), line([8, 4], [8, 2], [7, 2], [7, 3])] }, wins: true },
      { name: 'the shortest tree', plan: { paths: [line(N, [7, 4], [7, 3]), line([7, 4], [7, 6], [8, 6])] } },
      { name: 'into the cube from below: a tie', plan: { paths: [line(N, [8, 4], [8, 6]), line([8, 4], [8, 3], [7, 3])] } }
    ],
    outro: 'p2-outro'
  }
];

export const PUZZLE_CHAPTERS: { id: number; name: { en: string; zh: string }; levels: string[] }[] = [
  { id: 1, name: { en: 'The Lawn', zh: '草坪' }, levels: PUZZLES.filter(l => l.chapter === 1).map(l => l.id) },
  { id: 2, name: { en: 'Stream and Chalk', zh: '小溪与粉笔线' }, levels: PUZZLES.filter(l => l.chapter === 2).map(l => l.id) }
];

export const puzzleById = (id: string) => PUZZLES.find(l => l.id === id);
export const nextPuzzle = (id: string) => { const i = PUZZLES.findIndex(l => l.id === id); return i >= 0 ? PUZZLES[i + 1]?.id ?? null : null; };
/** The rules a player has met by the time they reach `id` (for the "Rules" sheet). */
export function rulesUpTo(id: string): RuleId[] {
  const out: RuleId[] = [];
  for (const level of PUZZLES) { for (const r of level.rules) if (!out.includes(r)) out.push(r); if (level.id === id) break; }
  return out;
}
