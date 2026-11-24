import type { ChapterDef, LevelDef } from '../types';

/**
 * The campaign: four chapters of five levels. Each level introduces one new problem and at most one new part that
 * answers it. Every level ships with stored reference solutions (tests/lantern-works-solutions.ts) that the content
 * test replays; the Tidy (parts) and Swift (beats) pars are set from them.
 */
const L = (def: LevelDef) => def;

export const LEVELS: LevelDef[] = [
  // ---------------------------------------------------------------- Chapter 1: Paper Lane
  L({
    id: '1-1', chapter: 1, index: 1, introduces: 'belt',
    name: { en: 'First Belt', zh: '第一条带子' },
    hint: { en: 'Drag from the paper chute to the stall to lay a belt, then press Run.', zh: '从纸槽拖到摊位铺一条传送带，然后按“开工”。' },
    grid: ['.......', '.......', '.......', '.......'],
    sources: [{ x: 0, y: 1, dir: 0, goods: ['paper'], every: 2 }],
    stalls: [{ x: 6, y: 2, wants: [{ good: 'paper', n: 5 }] }],
    tray: { belt: 14 }, parTidy: 6, parSwift: 16
  }),
  L({
    id: '1-2', chapter: 1, index: 2, introduces: 'folder',
    name: { en: 'Fold', zh: '折一折' },
    hint: { en: 'Paper that rides through a Folder comes out as a lantern shell.', zh: '纸经过折纸机，就变成灯笼壳。' },
    grid: ['.......', '.......', '...#...', '...#...', '.......'],
    sources: [{ x: 0, y: 2, dir: 0, goods: ['paper'], every: 2 }],
    stalls: [{ x: 6, y: 3, wants: [{ good: 'shell round', n: 6 }] }],
    tray: { belt: 14, folder: 1 }, parTidy: 8, parSwift: 20
  }),
  L({
    id: '1-3', chapter: 1, index: 3, introduces: 'vat',
    name: { en: 'Red', zh: '一抹红' },
    hint: { en: 'The Dye vat colours shells. Only shells take dye: what has to come first?', zh: '染缸只给灯笼壳上色。哪台机器该排在前面？' },
    grid: ['.......', '.......', '.......', '.......', '.......'],
    sources: [{ x: 0, y: 1, dir: 0, goods: ['paper'], every: 2 }],
    stalls: [{ x: 6, y: 3, wants: [{ good: 'shell round red', n: 6 }] }],
    tray: { belt: 14, folder: 1, vat: 1 }, vatColors: ['red'], parTidy: 7, parSwift: 20
  }),
  L({
    id: '1-4', chapter: 1, index: 4, introduces: 'joiner',
    name: { en: 'Hoop and Shell', zh: '竹圈与纸' },
    hint: { en: 'A Joiner waits for one shell and one bamboo hoop, then makes a lantern.', zh: '组装台等一个壳和一个竹圈到齐，就做出一盏灯笼。' },
    grid: ['........', '........', '........', '..#.....', '........', '........'],
    sources: [{ x: 0, y: 1, dir: 0, goods: ['paper'], every: 2 }, { x: 7, y: 4, dir: 2, goods: ['hoop'], every: 2 }],
    stalls: [{ x: 4, y: 5, wants: [{ good: 'lantern', n: 6 }] }],
    tray: { belt: 18, folder: 1, joiner: 1 }, parTidy: 9, parSwift: 21
  }),
  L({
    id: '1-5', chapter: 1, index: 5, introduces: null, rush: true,
    name: { en: 'Eve of the Fair', zh: '庙会前夜' },
    hint: { en: 'Two orders, one paper chute. Fill one, then change the line while it runs (Space or the pause button stops the clock).', zh: '两张订单，一个纸槽。先做完一张，再趁运行时改线（空格或暂停可以先停表）。' },
    grid: ['.........', '.........', '.........', '.........', '.........', '.........'],
    sources: [{ x: 0, y: 1, dir: 0, goods: ['paper'], every: 2 }, { x: 0, y: 4, dir: 0, goods: ['hoop'], every: 2 }],
    stalls: [{ x: 8, y: 3, wants: [{ good: 'lantern round red', n: 10 }, { good: 'lantern square plain', n: 10 }] }],
    tray: { belt: 24, folder: 1, vat: 1, joiner: 1 }, vatColors: ['red'], parTidy: 14, parSwift: 54
  })
];

export const CHAPTERS: ChapterDef[] = [
  { id: 1, name: { en: 'Paper Lane', zh: '纸巷' }, blurb: { en: 'A quiet lane of paper and bamboo. Learn the belts.', zh: '一条安静的纸巷。先学会铺带子。' }, levels: ['1-1', '1-2', '1-3', '1-4', '1-5'] }
];

/** Night Shift / Daily Order board: chutes for paper, hoops and candles, two stalls, a seeded order queue. */
export const NIGHT_LEVEL: LevelDef = {
  id: 'night', chapter: 0, index: 0, introduces: null, endless: true,
  name: { en: 'Night Shift', zh: '夜班' },
  hint: { en: 'Orders arrive at stalls A and B. Fill them before their bars run out; three missed orders end the shift.', zh: '订单送到 A、B 两个摊位。进度条走完前做好；误了三单就收工。' },
  grid: ['..........', '..........', '..........', '..........', '..........', '..........', '..........'],
  sources: [
    { x: 0, y: 1, dir: 0, goods: ['paper'], every: 2 }, { x: 0, y: 5, dir: 0, goods: ['paper'], every: 2 },
    { x: 3, y: 0, dir: 1, goods: ['hoop'], every: 2 }, { x: 3, y: 6, dir: 3, goods: ['hoop'], every: 2 },
    { x: 6, y: 0, dir: 1, goods: ['candle'], every: 3 }
  ],
  stalls: [{ x: 9, y: 2, wants: [] }, { x: 9, y: 5, wants: [] }],
  tray: { belt: 70, folder: 4, vat: 6, joiner: 4, splitter: 4, sorter: 3, bin: 2, bridge: 3, wick: 3, gate: 2, stamp: 2, mixer: 2 },
  vatColors: ['red', 'yellow', 'blue'], parTidy: 0, parSwift: 0
};

export const levelById = (id: string) => LEVELS.find(l => l.id === id);
export const LEVEL_IDS = LEVELS.map(l => l.id);
export const nextLevelId = (id: string) => { const i = LEVEL_IDS.indexOf(id); return i >= 0 ? LEVEL_IDS[i + 1] : undefined; };
