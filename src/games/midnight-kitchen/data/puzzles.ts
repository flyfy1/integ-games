import type { CellList, LevelDef, Loc, SpawnRow, TerrainDef, WaveDef } from '../types';

/**
 * Chef's Table / 主厨考题: twelve set puzzles. A fixed board, a fixed hand of pieces (a count of each card, no Heat),
 * and a fixed crowd of pests. Place everything first, then press Cook: the night runs on its own and one slice is all
 * there is. The sim is deterministic (fixed seed, no upgrades, Standard difficulty), so a stored solution either
 * wins or it does not: `tests/midnight-kitchen-puzzles.test.ts` replays every one and checks the empty board loses.
 */
export type PuzzleDef = {
  level: LevelDef;
  /** A known answer: `[card, col, lane]` in placing order (Burners first where they light the dark). */
  solution: [def: string, col: number, lane: number][];
  /** Hint shown after two failed attempts. */
  hint: Loc;
};

/** Every puzzle runs on this seed (the sim's own stream: pest wobble and the like). */
export const PUZZLE_SEED = 20261124;

const wave = (after: number, spawns: SpawnRow[], hpMul?: number): WaveDef => ({ after, spawns, ...(hpMul ? { hpMul } : {}) });

export type Spec = {
  n: number; name: Loc; blurb: Loc; hint: Loc;
  cols: number; lanes: number[]; pieces: Record<string, number>;
  waves: WaveDef[]; terrain?: TerrainDef; preset?: LevelDef['preset']; blocked?: CellList; backdrop?: string;
  solution: PuzzleDef['solution'];
  /** Pest health multiplier, set just under what the stored answer can hold (see the test). */
  hp: number;
};

export function puzzle(spec: Spec): PuzzleDef {
  const level: LevelDef = {
    id: `p${spec.n}`, chapter: 0, index: spec.n, name: spec.name, blurb: spec.blurb,
    cols: spec.cols, lanes: 5, activeLanes: spec.lanes, blocked: spec.blocked, startHeat: 0, slices: 1, slots: 99,
    cards: Object.keys(spec.pieces), waves: spec.waves.map(w => ({ ...w, hpMul: Math.round((w.hpMul ?? 1) * spec.hp * 100) / 100 })), terrain: spec.terrain, preset: spec.preset,
    rules: { puzzle: { pieces: spec.pieces }, fixedSlices: true },
    bonus: { kind: 'noRemove' }, reward: 0, backdrop: spec.backdrop ?? 'countertop', music: 'countertop'
  };
  return { level, solution: spec.solution, hint: spec.hint };
}

const L = (en: string, zh: string): Loc => ({ en, zh });
const rect = (c0: number, c1: number, lanes: number[]): CellList => lanes.flatMap(lane => Array.from({ length: c1 - c0 + 1 }, (_, i) => [c0 + i, lane] as [number, number]));

export const PUZZLES: PuzzleDef[] = [
  puzzle({
    n: 1, name: L('Three Plates', '三个盘子'), blurb: L('Three lanes, three Pepper Mills. Where do they go?', '三路，三个胡椒研磨瓶。放哪儿？'),
    hint: L('A mill only guards its own lane.', '研磨瓶只守自己那一路。'),
    cols: 6, lanes: [1, 2, 3], pieces: { pepper: 3 },
    waves: [wave(2, [[0, 'ant', 0], [2, 'ant', 2], [5, 'ant', 1], [8, 'ant', 0], [9, 'ant', 2], [12, 'ant', 1, 2, 2]])],
    hp: 1.5, solution: [["pepper", 0, 1], ["pepper", 0, 2], ["pepper", 0, 3]]
  }),
  puzzle({
    n: 2, name: L('Crumb Shields', '饼干盾牌'), blurb: L('Shields stop peppercorns cold. One Egg Lobber, two mills.', '盾牌能挡住胡椒粒。一个抛蛋手，两个研磨瓶。'),
    hint: L('Eggs fly over shields.', '鸡蛋能飞过盾牌。'),
    cols: 6, lanes: [1, 2, 3], pieces: { egg: 1, pepper: 2 },
    waves: [wave(2, [[0, 'shieldant', 1], [4, 'ant', 0, 2, 3], [6, 'ant', 2, 2, 3], [9, 'shieldant', 1]])],
    hp: 1.65, solution: [["egg", 1, 2], ["pepper", 1, 1], ["pepper", 1, 3]]
  }),
  puzzle({
    n: 3, name: L('Toasted', '烤胡椒'), blurb: L('Two roaches, two mills and one Burner. Plain pepper will not do.', '两只蟑螂，两个研磨瓶，一个炉头。光靠普通胡椒可不够。'),
    hint: L('A Burner next to a mill toasts its peppercorns. It can sit between two.', '炉头挨着研磨瓶，胡椒粒就会被烤热。它可以夹在两个中间。'),
    cols: 6, lanes: [1, 2, 3], pieces: { burner: 1, pepper: 2 },
    waves: [wave(2, [[0, 'roach', 0], [0.5, 'roach', 2], [8, 'roach', 0], [8.5, 'roach', 2]], 1.3)],
    hp: 0.61, solution: [["pepper", 2, 1], ["burner", 2, 2], ["pepper", 2, 3]]
  }),
  puzzle({
    n: 4, name: L('The Soft Wall', '软软的墙'), blurb: L('A slug and a string of ants. One Dough to buy time.', '一只鼻涕虫，一串蚂蚁。一个面团来拖时间。'),
    hint: L('Dough buys the most time where the slowest, toughest pest walks.', '面团要挡在最慢最耐打的那只前面，才最值。'),
    cols: 7, lanes: [1, 2, 3], pieces: { dough: 1, pepper: 3 },
    waves: [wave(2, [[0, 'slug', 1], [3, 'ant', 0, 3, 2.5], [4, 'ant', 2, 3, 2.5]])],
    hp: 1.4, solution: [["dough", 4, 2], ["pepper", 0, 1], ["pepper", 0, 2], ["pepper", 0, 3]]
  }),
  puzzle({
    n: 5, name: L('Wings', '翅膀'), blurb: L('Fruit flies sail over everything; eggs cannot reach them.', '果蝇从头顶飞过；鸡蛋够不着它们。'),
    hint: L('Shooters hit flyers. Lobbers handle the shields.', '射手能打飞虫，抛射手对付盾牌。'),
    cols: 6, lanes: [1, 2, 3], pieces: { egg: 2, pepper: 1, ice: 1 },
    waves: [wave(2, [[0, 'fruitfly', 0, 3, 2], [1, 'shieldant', 1, 2, 4], [2, 'shieldant', 2], [6, 'fruitfly', 2, 2, 2]])],
    hp: 0.72, solution: [["egg", 0, 2], ["egg", 0, 3], ["pepper", 0, 1], ["ice", 1, 3]]
  }),
  puzzle({
    n: 6, name: L('Pepper on Ice', '冰镇胡椒'), blurb: L('Two roaches, two mills and an Ice Cube. Each alone is a little too slow.', '两只蟑螂，两个研磨瓶，一块冰。单打独斗都慢了一点。'),
    hint: L('Pepper and Ice side by side both fire faster. The cube can touch two mills at once.', '胡椒和冰块挨在一起，两边都打得更快。冰块可以同时挨着两个研磨瓶。'),
    cols: 6, lanes: [1, 2, 3], pieces: { pepper: 2, ice: 1 }, backdrop: 'fridge',
    waves: [wave(2, [[0, 'roach', 0], [0.5, 'roach', 2], [3, 'ant', 1, 2, 3], [8, 'roach', 0], [8.5, 'roach', 2]])],
    hp: 0.76, solution: [["pepper", 1, 1], ["ice", 1, 2], ["pepper", 1, 3]]
  }),
  puzzle({
    n: 7, name: L('Grease Fire', '油锅起火'), blurb: L('A queue of roaches on a greasy lane. Two mills, one Burner, one Dough.', '一队蟑螂走在油腻腻的路上。两个研磨瓶，一个炉头，一个面团。'),
    hint: L('A burning pest sets grease alight, and the flames catch the ones behind it.', '身上着火的害虫一踩到油渍就会烧起来，后面的也跑不掉。'),
    cols: 7, lanes: [1, 2, 3], pieces: { burner: 1, pepper: 2, dough: 1 }, backdrop: 'stove',
    terrain: { grease: rect(2, 6, [2]) },
    waves: [wave(2, [[0, 'roach', 1, 6, 1.2], [3, 'ant', 0, 3, 3]])],
    hp: 0.96, solution: [["burner", 0, 2], ["pepper", 1, 2], ["dough", 2, 2], ["pepper", 0, 1]]
  }),
  puzzle({
    n: 8, name: L('Dark Shelf', '黑架子'), blurb: L('Only one lantern. Nothing stands in the dark, and nothing is seen in it.', '只有一盏灯笼。黑暗里站不了人，也看不见东西。'),
    hint: L('Burners glow. Light the way first, then guard it.', '炉头会发光。先照亮，再守住。'),
    cols: 6, lanes: [1, 2, 3], pieces: { burner: 2, pepper: 3 }, backdrop: 'pantry',
    terrain: { dark: true, lamps: [[0, 2]] },
    waves: [wave(3, [[0, 'ant', 0, 2, 3], [1, 'ant', 1, 2, 3], [2, 'ant', 2, 2, 3], [9, 'roach', 1]])],
    hp: 0.91, solution: [["burner", 1, 2], ["burner", 3, 2], ["pepper", 2, 2], ["pepper", 3, 1], ["pepper", 1, 3]]
  }),
  puzzle({
    n: 9, name: L('Shove', '推一把'), blurb: L('Everyone comes down the middle, and the middle has one free spot. Two mills and a clove of Garlic.', '全都从中路过来，中路只空着一格。两个研磨瓶，一瓣大蒜。'),
    hint: L('Garlic shoves pests into a neighbouring lane. Make sure someone is waiting there.', '大蒜会把害虫推到隔壁那一路。记得那边要有人等着。'),
    cols: 6, lanes: [1, 2, 3], pieces: { garlic: 1, pepper: 2 }, blocked: [[0, 2], [1, 2], [2, 2], [4, 2], [5, 2]],
    waves: [wave(2, [[0, 'ant', 1, 8, 1.6]])],
    hp: 0.66, solution: [["garlic", 3, 2], ["pepper", 1, 1], ["pepper", 1, 3]]
  }),
  puzzle({
    n: 10, name: L('Diggers', '挖洞的'), blurb: L('Weevils tunnel under the first guard they meet.', '象鼻虫会从遇到的第一个守卫底下钻过去。'),
    hint: L('Give them something cheap to dig under, and something sticky where they come up.', '给它们一个便宜的东西钻，在它们钻出来的地方放点黏的。'),
    cols: 7, lanes: [1, 2, 3], pieces: { dough: 1, honey: 1, pepper: 3 },
    waves: [wave(2, [[0, 'weevil', 1, 3, 2], [1, 'ant', 0, 2, 3], [2, 'ant', 2, 2, 3]])],
    hp: 1.27, solution: [["dough", 4, 2], ["honey", 3, 2], ["pepper", 0, 1], ["pepper", 0, 2], ["pepper", 0, 3]]
  }),
  puzzle({
    n: 11, name: L('Cold Shelf', '冷架子'), blurb: L('Frost slows every guard that is not kept warm. One Rice Cooker.', '结霜的地方，没被暖到的守卫都会变慢。只有一个电饭煲。'),
    hint: L('The cooker warms the cells around it, diagonals included.', '电饭煲能暖到身边一圈，斜对角也算。'),
    cols: 6, lanes: [1, 2, 3], pieces: { ricecooker: 1, pepper: 3 }, backdrop: 'fridge',
    terrain: { frost: rect(0, 5, [1, 2, 3]) },
    waves: [wave(2, [[0, 'ant', 0, 3, 2], [0.5, 'ant', 1, 3, 2], [1, 'ant', 2, 3, 2], [8, 'roach', '*', 1]], 1.2)],
    hp: 0.62, solution: [["ricecooker", 1, 2], ["pepper", 1, 1], ["pepper", 1, 3], ["pepper", 0, 2]]
  }),
  puzzle({
    n: 12, name: L('Full Course', '全套大餐'), blurb: L('Five lanes, a mixed crowd, and a little of everything.', '五路全开，来客五花八门，每样东西你都有一点。'),
    hint: L('Shields, flyers and a slug: each lane needs its own answer.', '盾牌、飞虫、鼻涕虫：每一路都要对症下药。'),
    cols: 7, lanes: [0, 1, 2, 3, 4], pieces: { pepper: 2, egg: 1, ice: 1, dough: 1 },
    waves: [wave(2, [[0, 'shieldant', 0], [1, 'fruitfly', 4, 2, 2], [2, 'slug', 2], [3, 'ant', 1, 3, 3], [4, 'ant', 3, 3, 3]])],
    hp: 0.77, solution: [["pepper", 0, 0], ["pepper", 4, 4], ["dough", 1, 2], ["ice", 2, 1], ["egg", 2, 2]]
  })
];
