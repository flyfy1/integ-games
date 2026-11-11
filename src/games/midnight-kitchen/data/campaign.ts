import { BARKS } from '../story';
import type { CellList, LevelDef, SpawnRow, TerrainDef, WaveDef } from '../types';

/**
 * Chapters 2-5. Each chapter has a board gimmick (see the contract in `types.ts`) taught one rule per level by a
 * bark, a boss that uses it, and story scenes from `story.ts`. Balance with `bot.ts` (`measureLevel`).
 */
const wave = (after: number, spawns: SpawnRow[], big = false): WaveDef => ({ after, spawns, big });
/** Every cell in columns c0..c1 of the given lanes. */
export const rect = (c0: number, c1: number, lanes: number[]): CellList => lanes.flatMap(lane => Array.from({ length: c1 - c0 + 1 }, (_, i) => [c0 + i, lane] as [number, number]));
const terrain = (t: TerrainDef) => t;

const sink = { cols: 9, lanes: 5, slices: 3, slots: 6, backdrop: 'sink', music: 'sink', trickle: { amount: 10, interval: 4 } } as const;
const stove = { cols: 9, lanes: 5, slices: 3, slots: 7, backdrop: 'stove', music: 'stove', trickle: { amount: 10, interval: 4 } } as const;
const pantry = { cols: 9, lanes: 5, slices: 3, slots: 7, backdrop: 'pantry', music: 'pantry', trickle: { amount: 10, interval: 4 } } as const;
const fridge = { cols: 9, lanes: 5, slices: 3, slots: 8, backdrop: 'fridge', music: 'fridge', trickle: { amount: 10, interval: 4 } } as const;

/** Sink: the cold-water corner by the cake is wet, so Burners must stand on the dry tiles. */
const SINK_WET = [...rect(0, 2, [0]), ...rect(0, 2, [4]), [0, 2] as [number, number]];
const SINK_DRIPS: CellList = [[4, 1], [5, 3], [3, 2], [6, 0], [4, 4], [6, 2]];
/** Stove: four hobs. The near pair is where Burners love to stand; the far pair scorches the queue. */
const HOBS: CellList = [[1, 1], [1, 3], [6, 1], [6, 3]];
/** Pantry lamps: a crack of light by the cake and two candle stubs on the shelves. */
const PANTRY_LAMPS: CellList = [[0, 0], [0, 2], [0, 4], [5, 1], [5, 3]];

/**
 * Difficulty knob per level: every enemy in its waves gets this health multiplier (bosses included, and whatever a
 * boss summons). Tuned with the bot (12-24 seeds) so that savvy wins >= 0.9 everywhere, casual >= 0.75 on regular
 * nights and >= 0.6 on boss nights, and the naive hand's win rate falls smoothly from chapter to chapter (the hobs'
 * double Heat lifts a Burner-capped player most, hence chapter 3's higher numbers). Responses are steep: a 0.03 step
 * can move a profile by 0.3, so re-measure after any change (`tests/midnight-kitchen-content.test.ts` locks floors).
 */
export const TUNE: Record<string, number> = {
  'c1-1': 1, 'c1-2': 1, 'c1-3': 1, 'c1-4': 0.85, 'c1-5': 0.8,
  'c2-1': 0.77, 'c2-2': 0.8, 'c2-3': 0.93, 'c2-4': 0.67, 'c2-5': 0.72,
  'c3-1': 1.32, 'c3-2': 1.5, 'c3-3': 1.27, 'c3-4': 1.15, 'c3-5': 0.8,
  'c4-1': 0.8, 'c4-2': 0.85, 'c4-3': 0.85, 'c4-4': 0.8, 'c4-5': 0.53,
  'c5-1': 0.8, 'c5-2': 0.6, 'c5-3': 0.68, 'c5-4': 0.5, 'c5-5': 0.6
};
/**
 * Boss health on each boss night, on top of TUNE (`WaveDef.bossScale`): keeps the fight itself to a few minutes
 * without making the escort trivial.
 */
export const BOSS_SCALE: Record<string, number> = { 'c2-5': 0.6, 'c3-5': 0.9, 'c4-5': 0.9, 'c5-5': 0.75 };
export const tuned = (level: LevelDef, k = TUNE[level.id] ?? 1): LevelDef => (k === 1 ? level : { ...level, waves: level.waves.map(w => ({ ...w, hpMul: Math.round((w.hpMul ?? 1) * k * 100) / 100 })) });

const RAW: LevelDef[] = [
  // ============================================================ Chapter 2: Sink
  {
    ...sink, id: 'c2-1', chapter: 2, index: 1,
    name: { en: 'Wet Tiles', zh: '湿漉漉的地砖' },
    blurb: { en: 'The tiles by the sink are wet: Burners will not light there. Meet the Kettle, whose steam goes through a whole queue.', zh: '水槽边的地砖是湿的：炉头在那儿点不着。认识一下水壶，它的蒸汽能穿透一整排敌人。' },
    startHeat: 225, terrain: terrain({ wet: SINK_WET }),
    intro: 'c2-1-intro', outro: 'c2-1-outro', unlocks: ['honey'], reward: 80,
    introduces: { defenders: ['kettle'] },
    bonus: { kind: 'maxDefenders', n: 18 },
    barks: BARKS['c2-1'],
    tutorial: [
      { text: { en: 'Blue tiles are wet. Burners only light on the dry ones.', zh: '泛蓝的地砖是湿的。炉头只能放在干的地方。' }, focus: { cell: [0, 0] }, until: { on: 'place', def: 'burner' } },
      { text: { en: 'The Kettle\'s steam hits everything in a short line. Put it where enemies bunch up.', zh: '水壶的蒸汽会打中前方一小段里的所有敌人。把它放在敌人扎堆的地方。' }, focus: { card: 'kettle' }, until: { on: 'place', def: 'kettle' } }
    ],
    waves: [
      wave(22, [[0, 'ant', 2], [6, 'ant', 0], [10, 'ant', 4]]),
      wave(22, [[0, 'ant', 1, 3, 2.5], [5, 'ant', 3, 3, 2.5], [10, 'roach', 2]]),
      wave(24, [[0, 'roach', 0], [3, 'ant', 2, 4, 2], [8, 'roach', 4], [12, 'ant', '*', 3, 3]]),
      wave(25, [[0, 'slug', 2], [4, 'ant', 2, 4, 2], [8, 'ant', 1, 3, 2.5], [10, 'ant', 3, 3, 2.5]]),
      wave(25, [[0, 'shieldant', 1, 2, 4], [2, 'shieldant', 3, 2, 4], [6, 'roach', '*', 3, 3], [12, 'ant', 0, 4, 2], [13, 'ant', 4, 4, 2]]),
      wave(26, [[0, 'slug', 0], [2, 'slug', 4], [5, 'ant', 0, 4, 2], [6, 'ant', 4, 4, 2], [10, 'roach', 2, 2, 3], [14, 'fruitfly', '*', 2, 3]]),
      wave(28, [[0, 'ant', 0, 5, 1.8], [1, 'ant', 1, 5, 1.8], [2, 'ant', 2, 5, 1.8], [3, 'ant', 3, 5, 1.8], [4, 'ant', 4, 5, 1.8], [8, 'roach', '*', 4, 2.5], [14, 'slug', 2], [16, 'shieldant', '*', 3, 3]], true)
    ]
  },
  {
    ...sink, id: 'c2-2', chapter: 2, index: 2,
    name: { en: 'Drip, Drip', zh: '滴答，滴答' },
    blurb: { en: 'The tap leaks. A glowing ring shows where the next drop lands: it washes pests back but knocks out whoever stands under it.', zh: '水龙头漏水了。发光的圈标出下一滴落在哪：它会把害虫冲回去，但站在下面的守卫也会被砸晕。' },
    startHeat: 225, terrain: terrain({ wet: SINK_WET }),
    hazards: [{ kind: 'drip', every: 6, first: 26, warn: 2.5, cells: SINK_DRIPS, push: 1.4, stun: 3 }],
    intro: 'c2-2-intro', outro: 'c2-2-outro', reward: 85,
    introduces: { defenders: ['honey'] },
    bonus: { kind: 'recipes', n: 2 },
    barks: BARKS['c2-2'],
    waves: [
      wave(22, [[0, 'ant', 1], [4, 'ant', 3], [8, 'ant', 2, 2, 3]]),
      wave(22, [[0, 'roach', 1], [3, 'ant', 0, 3, 2.5], [6, 'roach', 3], [9, 'ant', 4, 3, 2.5]]),
      wave(24, [[0, 'shieldant', 2], [3, 'roach', '*', 2, 4], [8, 'ant', '*', 6, 1.6]]),
      wave(25, [[0, 'slug', 1], [2, 'slug', 3], [6, 'ant', 1, 3, 2], [7, 'ant', 3, 3, 2], [12, 'roach', 2, 2, 3]]),
      wave(25, [[0, 'roach', 0, 2, 3], [1, 'roach', 4, 2, 3], [6, 'shieldant', 2, 2, 4], [10, 'fruitfly', '*', 3, 2.5]]),
      wave(26, [[0, 'slug', 2], [3, 'roach', '*', 4, 2.5], [6, 'shieldant', 1, 2, 4], [7, 'shieldant', 3, 2, 4], [14, 'ant', '*', 6, 1.5]]),
      wave(26, [[0, 'roach', '*', 3, 2], [4, 'slug', 0], [5, 'slug', 4], [8, 'ant', 2, 5, 1.5], [12, 'fruitfly', '*', 3, 2]]),
      wave(28, [[0, 'roach', 0, 3, 2.5], [1, 'roach', 2, 3, 2.5], [2, 'roach', 4, 3, 2.5], [6, 'slug', 1], [7, 'slug', 3], [10, 'shieldant', '*', 4, 2], [16, 'ant', '*', 10, 1.2], [20, 'fruitfly', '*', 4, 2]], true)
    ]
  },
  {
    ...sink, id: 'c2-3', chapter: 2, index: 3,
    name: { en: 'Under the Plughole', zh: '塞子底下' },
    blurb: { en: 'Weevils tunnel under the first guard they meet and pop up behind it. Honey, which they walk over, is another matter.', zh: '象鼻虫会从遇到的第一个守卫脚下钻过去，在后面冒出来。不过蜂蜜是直接踩上去的，那就是另一回事了。' },
    startHeat: 225, terrain: terrain({ wet: SINK_WET }),
    hazards: [{ kind: 'drip', every: 8, first: 30, warn: 2.5, cells: SINK_DRIPS, push: 1.4, stun: 3 }],
    intro: 'c2-3-intro', outro: 'c2-3-outro', unlocks: ['garlic'], reward: 90,
    introduces: { enemies: ['weevil'] },
    bonus: { kind: 'noDefenderLost' },
    barks: BARKS['c2-3'],
    waves: [
      wave(22, [[0, 'ant', 2], [4, 'ant', 1], [8, 'ant', 3]]),
      wave(22, [[0, 'weevil', 2], [5, 'ant', 0, 2, 3], [7, 'ant', 4, 2, 3]]),
      wave(24, [[0, 'weevil', 1], [3, 'weevil', 3], [7, 'roach', '*', 2, 4], [10, 'ant', '*', 4, 2]]),
      wave(25, [[0, 'slug', 2], [3, 'weevil', 0, 2, 4], [5, 'weevil', 4, 2, 4], [12, 'shieldant', '*', 2, 3]]),
      wave(25, [[0, 'roach', '*', 3, 2.5], [4, 'weevil', '*', 4, 2.5], [10, 'ant', '*', 6, 1.5]]),
      wave(26, [[0, 'shieldant', 1, 2, 3], [1, 'shieldant', 3, 2, 3], [5, 'weevil', 2, 3, 2.5], [9, 'slug', 0], [10, 'slug', 4], [14, 'fruitfly', '*', 3, 2]]),
      wave(26, [[0, 'weevil', '*', 6, 2], [6, 'roach', '*', 4, 2.5], [12, 'ant', '*', 8, 1.2]]),
      wave(30, [[0, 'weevil', 0, 3, 2.5], [1, 'weevil', 2, 3, 2.5], [2, 'weevil', 4, 3, 2.5], [6, 'slug', 1], [7, 'slug', 3], [10, 'roach', '*', 5, 2], [16, 'shieldant', '*', 4, 2], [20, 'ant', '*', 10, 1]], true)
    ]
  },
  {
    ...sink, id: 'c2-4', chapter: 2, index: 4,
    name: { en: 'Detour', zh: '改道' },
    blurb: { en: 'The outer lanes run along the slippery rim, and almost everything comes that way. Garlic\'s stink sends pests next door: choose which door.', zh: '最外两路贴着湿滑的池边，几乎所有家伙都从那里来。大蒜的臭气会把它们熏到隔壁：你来决定是哪个隔壁。' },
    startHeat: 250, terrain: terrain({ wet: [...SINK_WET, ...rect(3, 8, [0]), ...rect(3, 8, [4])] }),
    hazards: [{ kind: 'drip', every: 8, first: 30, warn: 2.5, cells: [[4, 1], [5, 3], [6, 2]], push: 1.4, stun: 3 }],
    intro: 'c2-4-intro', outro: 'c2-4-outro', reward: 95,
    introduces: { defenders: ['garlic'] },
    bonus: { kind: 'recipes', n: 2 },
    barks: BARKS['c2-4'],
    waves: [
      wave(22, [[0, 'ant', 0, 2, 3], [4, 'ant', 4, 2, 3]]),
      wave(22, [[0, 'roach', 0], [3, 'ant', 0, 3, 2], [6, 'roach', 4], [9, 'ant', 4, 3, 2]]),
      wave(24, [[0, 'shieldant', 0, 2, 3], [1, 'shieldant', 4, 2, 3], [6, 'ant', 2, 3, 2], [10, 'weevil', '*', 2, 3]]),
      wave(25, [[0, 'slug', 0], [2, 'slug', 4], [5, 'roach', 0, 2, 3], [6, 'roach', 4, 2, 3], [12, 'ant', '*', 6, 1.5]]),
      wave(25, [[0, 'roach', 0, 4, 2], [1, 'roach', 4, 4, 2], [8, 'weevil', 0, 2, 3], [9, 'weevil', 4, 2, 3], [14, 'fruitfly', '*', 3, 2]]),
      wave(26, [[0, 'shieldant', 0, 3, 2.5], [1, 'shieldant', 4, 3, 2.5], [6, 'slug', 2], [10, 'ant', 0, 5, 1.4], [11, 'ant', 4, 5, 1.4]]),
      wave(26, [[0, 'slug', 0], [1, 'slug', 4], [4, 'roach', '*', 5, 2], [10, 'weevil', '*', 4, 2], [15, 'ant', '*', 8, 1]]),
      wave(30, [[0, 'roach', 0, 5, 1.6], [1, 'roach', 4, 5, 1.6], [6, 'slug', 0], [7, 'slug', 4], [10, 'shieldant', 0, 3, 2], [11, 'shieldant', 4, 3, 2], [16, 'weevil', '*', 4, 2], [20, 'ant', '*', 12, 0.9], [22, 'fruitfly', '*', 4, 2]], true)
    ]
  },
  {
    ...sink, id: 'c2-5', chapter: 2, index: 5,
    name: { en: 'The Drain King', zh: '下水道之王' },
    blurb: { en: 'The King climbs out of the plughole. He floods his lane (Burners there go out), ducks under the water and calls his court. Keep Burners out of his way.', zh: '国王从下水口爬了出来。他会淹掉自己那一路（那里的炉头会熄火），潜进水里，还会召来他的臣子。别让炉头挡他的道。' },
    startHeat: 300, terrain: terrain({ wet: SINK_WET }),
    hazards: [{ kind: 'drip', every: 9, first: 30, warn: 2.5, cells: SINK_DRIPS, push: 1.4, stun: 3 }],
    intro: 'c2-5-intro', outro: 'c2-5-outro', unlocks: ['toaster'], reward: 160, boss: 'drainking', music: 'boss',
    introduces: { enemies: ['drainking'] },
    bonus: { kind: 'timeUnder', seconds: 420 },
    barks: BARKS['c2-5'],
    waves: [
      wave(22, [[0, 'ant', 1], [4, 'ant', 3], [9, 'ant', 0], [13, 'ant', 4]]),
      wave(24, [[0, 'weevil', 2], [5, 'ant', 0, 2, 3], [7, 'ant', 4, 2, 3], [12, 'roach', '*']]),
      wave(25, [[0, 'roach', '*', 2, 4], [5, 'shieldant', 1], [6, 'shieldant', 3], [10, 'weevil', '*', 2, 3]]),
      wave(26, [[0, 'slug', 0], [6, 'slug', 4], [8, 'roach', '*', 2, 3], [12, 'ant', '*', 5, 1.8], [16, 'fruitfly', '*', 2, 3]]),
      wave(30, [[0, 'drainking', 2], [8, 'ant', '*', 5, 3], [20, 'weevil', '*', 3, 4], [32, 'shieldant', '*', 3, 4], [46, 'roach', '*', 3, 4], [60, 'slug', '*', 2, 8], [74, 'fruitfly', '*', 4, 3], [88, 'weevil', '*', 3, 4], [102, 'roach', '*', 4, 3], [116, 'ant', '*', 10, 1.5]], true)
    ]
  },
  // ============================================================ Chapter 3: Stove
  {
    ...stove, id: 'c3-1', chapter: 3, index: 1,
    name: { en: 'Pilot Light', zh: '长明火' },
    blurb: { en: 'Four hobs. A Burner on a hob makes double Heat. Every so often the hobs flare: pests on them burn, and anyone but a Burner, Kettle or Toaster gets singed.', zh: '四个灶眼。炉头放在灶眼上，火候翻倍。灶眼时不时会“呼”地烧起来：站在上面的害虫会着火，除了炉头、水壶和烤面包机，谁站上去都会被燎到。' },
    startHeat: 225, terrain: terrain({ hobs: HOBS }),
    hazards: [{ kind: 'hob', every: 20, first: 28, warn: 3, lit: 5 }],
    intro: 'c3-1-intro', outro: 'c3-1-outro', reward: 100,
    introduces: { defenders: ['toaster'] },
    bonus: { kind: 'heatBank', n: 400 },
    barks: BARKS['c3-1'],
    tutorial: [
      { text: { en: 'Hobs are the round cells. A Burner on a hob makes double Heat.', zh: '圆圆的格子是灶眼。炉头放在灶眼上，火候翻倍。' }, focus: { cell: [1, 1] }, until: { on: 'place', def: 'burner' } },
      { text: { en: 'When a hob glows, it is about to flare. Pests caught on it will burn.', zh: '灶眼发亮，就是要烧起来了。被困在上面的害虫会着火。' }, until: { on: 'hazard', def: 'hobOn' } }
    ],
    waves: [
      wave(22, [[0, 'ant', 1], [4, 'ant', 3], [8, 'ant', 2]]),
      wave(22, [[0, 'roach', 1], [3, 'ant', 3, 3, 2], [7, 'roach', 3], [10, 'ant', 0, 2, 3]]),
      wave(24, [[0, 'shieldant', 1, 2, 3], [1, 'shieldant', 3, 2, 3], [6, 'roach', '*', 2, 3], [10, 'ant', '*', 5, 1.6]]),
      wave(25, [[0, 'slug', 1], [2, 'slug', 3], [5, 'roach', '*', 3, 2.5], [10, 'shieldant', 2, 2, 3]]),
      wave(25, [[0, 'roach', '*', 4, 2], [5, 'weevil', '*', 3, 3], [10, 'ant', '*', 6, 1.4], [14, 'fruitfly', '*', 3, 2]]),
      wave(26, [[0, 'slug', '*', 2, 4], [3, 'shieldant', '*', 4, 2.5], [8, 'roach', 1, 2, 2.5], [9, 'roach', 3, 2, 2.5], [14, 'ant', '*', 6, 1.2]]),
      wave(28, [[0, 'roach', '*', 6, 1.6], [4, 'slug', 1], [5, 'slug', 3], [8, 'shieldant', '*', 4, 2], [12, 'weevil', '*', 3, 2], [16, 'ant', '*', 10, 1], [18, 'fruitfly', '*', 4, 2]], true)
    ]
  },
  {
    ...stove, id: 'c3-2', chapter: 3, index: 2,
    name: { en: 'Moths to the Flame', zh: '飞蛾扑火' },
    blurb: { en: 'Moths fly straight for your Burners and nibble them. Only shots reach them: put a shooter in every lane that has a Burner.', zh: '飞蛾直奔炉头去啃。只有射击打得到它们：凡是有炉头的那一路，都得放个能射的。' },
    startHeat: 225, terrain: terrain({ hobs: HOBS }),
    hazards: [{ kind: 'hob', every: 20, first: 30, warn: 3, lit: 5 }],
    intro: 'c3-2-intro', outro: 'c3-2-outro', reward: 105,
    introduces: { enemies: ['moth'] },
    bonus: { kind: 'noDefenderLost' },
    barks: BARKS['c3-2'],
    waves: [
      wave(22, [[0, 'ant', 2], [4, 'ant', 1], [8, 'ant', 3]]),
      wave(22, [[0, 'moth', 1], [4, 'ant', 2, 3, 2], [8, 'moth', 3]]),
      wave(24, [[0, 'roach', '*', 2, 3], [4, 'moth', '*', 3, 3], [10, 'ant', '*', 4, 1.6]]),
      wave(25, [[0, 'shieldant', 1, 2, 3], [1, 'shieldant', 3, 2, 3], [5, 'moth', '*', 3, 2.5], [10, 'slug', 2]]),
      wave(25, [[0, 'moth', '*', 5, 2], [4, 'roach', '*', 3, 2.5], [10, 'weevil', '*', 2, 3], [14, 'ant', '*', 5, 1.4]]),
      wave(26, [[0, 'slug', 1], [1, 'slug', 3], [4, 'moth', '*', 4, 2], [8, 'shieldant', '*', 4, 2], [14, 'fruitfly', '*', 3, 2]]),
      wave(26, [[0, 'roach', '*', 5, 1.8], [5, 'moth', '*', 5, 1.8], [12, 'ant', '*', 8, 1]]),
      wave(30, [[0, 'moth', '*', 8, 1.5], [4, 'roach', '*', 5, 2], [8, 'slug', 0], [9, 'slug', 4], [12, 'shieldant', '*', 5, 2], [18, 'weevil', '*', 4, 2], [22, 'ant', '*', 10, 1], [24, 'moth', '*', 5, 1.5]], true)
    ]
  },
  {
    ...stove, id: 'c3-3', chapter: 3, index: 3,
    name: { en: 'Grease Fire', zh: '油星四溅' },
    blurb: { en: 'Grease slicks make pests slide faster, but fire turns a slick into a blaze. Set a pest alight and walk it over the grease.', zh: '油渍会让害虫滑得更快，但火一碰到油渍就会烧成一片。先把害虫点着，再让它踩上油渍。' },
    startHeat: 250, terrain: terrain({ hobs: HOBS, grease: [...rect(3, 5, [0]), ...rect(3, 5, [2]), ...rect(3, 5, [4])] }),
    hazards: [{ kind: 'hob', every: 22, first: 30, warn: 3, lit: 5 }],
    intro: 'c3-3-intro', outro: 'c3-3-outro', unlocks: [], reward: 110,
    bonus: { kind: 'recipes', n: 3 },
    barks: BARKS['c3-3'],
    waves: [
      wave(22, [[0, 'ant', 0], [4, 'ant', 2], [8, 'ant', 4]]),
      wave(22, [[0, 'roach', 2], [3, 'ant', 0, 3, 2], [6, 'ant', 4, 3, 2], [10, 'moth', '*']]),
      wave(24, [[0, 'shieldant', 0], [2, 'shieldant', 4], [5, 'roach', 2, 2, 2.5], [10, 'ant', '*', 5, 1.4]]),
      wave(25, [[0, 'slug', 2], [3, 'roach', '*', 3, 2.5], [8, 'moth', '*', 3, 2.5], [12, 'ant', 0, 3, 1.6], [13, 'ant', 4, 3, 1.6]]),
      wave(25, [[0, 'roach', 0, 3, 2], [1, 'roach', 4, 3, 2], [6, 'weevil', 2, 2, 3], [10, 'shieldant', '*', 3, 2]]),
      wave(26, [[0, 'slug', 0], [1, 'slug', 4], [4, 'moth', '*', 4, 2], [8, 'roach', '*', 4, 2], [14, 'ant', '*', 8, 1]]),
      wave(28, [[0, 'roach', '*', 6, 1.5], [5, 'shieldant', '*', 4, 2], [10, 'slug', 2], [12, 'moth', '*', 4, 1.8], [16, 'weevil', '*', 3, 2]]),
      wave(30, [[0, 'roach', 0, 4, 1.6], [1, 'roach', 2, 4, 1.6], [2, 'roach', 4, 4, 1.6], [6, 'slug', 1], [7, 'slug', 3], [10, 'moth', '*', 6, 1.5], [14, 'shieldant', '*', 5, 1.8], [20, 'ant', '*', 12, 0.9]], true)
    ]
  },
  {
    ...stove, id: 'c3-4', chapter: 3, index: 4,
    name: { en: 'Simmer', zh: '小火慢炖' },
    blurb: { en: 'Everything on the stove at once: hobs, grease, moths and a long, slow boil. Plan your neighbours.', zh: '灶台上的一切一起来：灶眼、油渍、飞蛾，还有一锅慢慢熬的长汤。好好安排谁挨着谁。' },
    startHeat: 275, terrain: terrain({ hobs: HOBS, grease: [...rect(4, 6, [2]), [3, 0], [3, 4], [7, 1], [7, 3]] }),
    hazards: [{ kind: 'hob', every: 18, first: 26, warn: 3, lit: 5 }],
    intro: 'c3-4-intro', outro: 'c3-4-outro', reward: 115,
    bonus: { kind: 'tier3', n: 2 },
    barks: BARKS['c3-4'],
    waves: [
      wave(22, [[0, 'ant', 1, 2, 3], [3, 'ant', 3, 2, 3]]),
      wave(22, [[0, 'moth', 1], [2, 'moth', 3], [5, 'roach', 2], [9, 'ant', '*', 4, 1.6]]),
      wave(24, [[0, 'slug', 2], [3, 'shieldant', 0], [4, 'shieldant', 4], [8, 'roach', '*', 3, 2], [12, 'moth', '*', 2, 3]]),
      wave(25, [[0, 'weevil', '*', 4, 2], [5, 'roach', '*', 4, 2], [12, 'ant', '*', 6, 1.2]]),
      wave(25, [[0, 'slug', 1], [1, 'slug', 3], [4, 'moth', '*', 5, 1.8], [10, 'shieldant', '*', 4, 2], [14, 'fruitfly', '*', 4, 1.6]]),
      wave(26, [[0, 'roach', '*', 6, 1.6], [6, 'weevil', '*', 4, 2], [12, 'slug', 2], [14, 'ant', '*', 8, 1]]),
      wave(26, [[0, 'moth', '*', 6, 1.5], [4, 'shieldant', '*', 5, 1.8], [10, 'slug', 0], [11, 'slug', 4], [16, 'roach', '*', 4, 1.6]]),
      wave(28, [[0, 'slug', '*', 3, 3], [4, 'roach', '*', 6, 1.4], [10, 'weevil', '*', 4, 2], [14, 'moth', '*', 5, 1.5], [18, 'shieldant', '*', 4, 2]]),
      wave(30, [[0, 'roach', 0, 4, 1.4], [1, 'roach', 2, 4, 1.4], [2, 'roach', 4, 4, 1.4], [6, 'slug', 1], [7, 'slug', 3], [10, 'moth', '*', 8, 1.2], [16, 'shieldant', '*', 6, 1.5], [22, 'weevil', '*', 5, 1.5], [26, 'ant', '*', 14, 0.8]], true)
    ]
  },
  {
    ...stove, id: 'c3-5', chapter: 3, index: 5,
    name: { en: 'The Grease Golem', zh: '油垢魔像' },
    blurb: { en: 'Old fat, standing up. Its armour shrugs off almost everything, unless it is burning. Splattered grease and flaring hobs are your friends here.', zh: '凝固的老油站了起来。它的护甲几乎什么都挡得住，除非它烧着了。溅出来的油和烧起来的灶眼，在这里都是你的朋友。' },
    startHeat: 300, terrain: terrain({ hobs: HOBS, grease: [...rect(5, 6, [2])] }),
    hazards: [{ kind: 'hob', every: 16, first: 26, warn: 3, lit: 6 }],
    intro: 'c3-5-intro', outro: 'c3-5-outro', unlocks: ['salt'], reward: 180, boss: 'greasegolem', music: 'boss',
    introduces: { enemies: ['greasegolem'] },
    bonus: { kind: 'timeUnder', seconds: 360 },
    barks: BARKS['c3-5'],
    waves: [
      wave(22, [[0, 'ant', 1], [4, 'ant', 3], [8, 'moth', 2]]),
      wave(22, [[0, 'roach', '*', 2, 3], [5, 'moth', '*', 2, 3], [10, 'ant', '*', 4, 1.6]]),
      wave(24, [[0, 'slug', 2], [4, 'shieldant', 0], [5, 'shieldant', 4], [10, 'moth', '*', 3, 2.5]]),
      wave(25, [[0, 'roach', '*', 4, 2], [6, 'weevil', '*', 3, 2.5], [12, 'ant', '*', 6, 1.3]]),
      wave(30, [[0, 'greasegolem', 2], [6, 'ant', '*', 6, 2.5], [16, 'moth', '*', 4, 3], [28, 'shieldant', '*', 4, 3], [40, 'roach', '*', 4, 3], [54, 'slug', '*', 2, 6], [66, 'moth', '*', 5, 2.5], [80, 'weevil', '*', 4, 3], [94, 'roach', '*', 6, 2], [110, 'ant', '*', 14, 1.2]], true)
    ]
  },
  // ============================================================ Chapter 4: Pantry
  {
    ...pantry, id: 'c4-1', chapter: 4, index: 1,
    name: { en: 'Lights Out', zh: '熄灯' },
    blurb: { en: 'The pantry is dark. You can only stand guards where light reaches, and shots cannot aim at what they cannot see. Burners and the old candles push the dark back.', zh: '储物柜里一片漆黑。守卫只能站在有光的地方，射击也瞄不到看不见的东西。炉头和旧蜡烛能把黑暗推开。' },
    startHeat: 250, terrain: terrain({ dark: true, lamps: PANTRY_LAMPS }),
    intro: 'c4-1-intro', outro: 'c4-1-outro', reward: 120,
    introduces: { defenders: ['salt'] },
    bonus: { kind: 'maxDefenders', n: 22 },
    barks: BARKS['c4-1'],
    tutorial: [
      { text: { en: 'Dark cells will not take a guard. A Burner lights the cells around it; light grows with its tier.', zh: '黑着的格子放不了守卫。炉头会照亮周围的格子，升级后照得更远。' }, focus: { card: 'burner' }, until: { on: 'place', def: 'burner' } },
      { text: { en: 'Shooters only aim at lit pests. Close-range guards (Whisk, Onion, Kettle) feel their way in the dark.', zh: '射手只瞄准被照亮的害虫。近身的守卫（打蛋器、洋葱、水壶）在黑暗里也摸得到。' }, until: { time: 50 } }
    ],
    waves: [
      wave(24, [[0, 'ant', 1], [5, 'ant', 3], [10, 'ant', 2]]),
      wave(22, [[0, 'slug', 2], [4, 'ant', 0, 2, 3], [6, 'ant', 4, 2, 3]]),
      wave(24, [[0, 'roach', '*', 2, 3], [4, 'spore', 1], [6, 'spore', 3], [10, 'ant', '*', 4, 1.6]]),
      wave(25, [[0, 'slug', 1], [2, 'slug', 3], [6, 'shieldant', '*', 3, 2.5], [12, 'moth', '*', 2, 3]]),
      wave(25, [[0, 'spore', '*', 3, 2.5], [4, 'roach', '*', 4, 2], [10, 'ant', '*', 6, 1.3], [14, 'fruitfly', '*', 3, 2]]),
      wave(26, [[0, 'slug', 0], [1, 'slug', 4], [3, 'slug', 2], [6, 'weevil', '*', 3, 2], [10, 'shieldant', '*', 4, 2]]),
      wave(28, [[0, 'roach', '*', 5, 1.6], [4, 'spore', '*', 4, 2], [8, 'slug', 1], [9, 'slug', 3], [12, 'moth', '*', 4, 1.8], [16, 'ant', '*', 10, 1]], true)
    ]
  },
  {
    ...pantry, id: 'c4-2', chapter: 4, index: 2,
    name: { en: 'Sticky Fingers', zh: '三只手' },
    blurb: { en: 'Mice! They grab a guard (or a pawful of Heat) and run. Catch them before they reach the edge and you get it all back.', zh: '老鼠！它们抓起一个守卫（或者一把火候）就跑。在它们跑出边缘之前拦住，东西都能拿回来。' },
    startHeat: 250, terrain: terrain({ dark: true, lamps: PANTRY_LAMPS }),
    intro: 'c4-2-intro', outro: 'c4-2-outro', reward: 125,
    introduces: { enemies: ['mouse'] },
    bonus: { kind: 'recipes', n: 3 },
    barks: BARKS['c4-2'],
    waves: [
      wave(24, [[0, 'ant', 1], [4, 'ant', 3], [9, 'ant', 2]]),
      wave(22, [[0, 'mouse', 2], [5, 'ant', '*', 3, 2]]),
      wave(24, [[0, 'roach', '*', 2, 3], [4, 'mouse', 1], [8, 'mouse', 3], [12, 'slug', 2]]),
      wave(25, [[0, 'shieldant', '*', 3, 2.5], [5, 'mouse', '*', 2, 4], [10, 'spore', '*', 2, 3], [14, 'ant', '*', 5, 1.4]]),
      wave(25, [[0, 'slug', 1], [1, 'slug', 3], [5, 'mouse', '*', 3, 3], [10, 'moth', '*', 3, 2]]),
      wave(26, [[0, 'roach', '*', 4, 1.8], [5, 'weevil', '*', 3, 2], [9, 'mouse', '*', 3, 2.5], [14, 'spore', '*', 3, 2]]),
      wave(26, [[0, 'mouse', '*', 4, 2], [5, 'shieldant', '*', 4, 2], [10, 'slug', '*', 2, 3], [14, 'ant', '*', 8, 1]]),
      wave(30, [[0, 'mouse', '*', 5, 1.8], [4, 'roach', '*', 5, 1.6], [8, 'slug', 0], [9, 'slug', 4], [12, 'spore', '*', 4, 2], [16, 'moth', '*', 4, 1.8], [20, 'ant', '*', 10, 1], [24, 'mouse', '*', 3, 2]], true)
    ]
  },
  {
    ...pantry, id: 'c4-3', chapter: 4, index: 3,
    name: { en: 'Narrow Shelves', zh: '窄窄的架子' },
    blurb: { en: 'The middle shelf has fallen, and there are gaps where jars used to stand. Four lanes, fewer spots, the same hungry crowd.', zh: '中间那层架子塌了，原来放罐子的地方空出了几个洞。只剩四路，能站的地方更少，来的还是那么一大群。' },
    activeLanes: [0, 1, 3, 4], blocked: [[3, 1], [6, 3], [4, 0], [5, 4]],
    startHeat: 250, terrain: terrain({ dark: true, lamps: [[0, 0], [0, 4], [0, 1], [0, 3], [5, 1], [5, 3]] }),
    intro: 'c4-3-intro', outro: 'c4-3-outro', unlocks: ['ricecooker'], reward: 130,
    bonus: { kind: 'maxDefenders', n: 20 },
    barks: BARKS['c4-3'],
    waves: [
      wave(24, [[0, 'ant', 0], [4, 'ant', 2], [8, 'ant', 1], [12, 'ant', 3]]),
      wave(22, [[0, 'roach', 1], [3, 'roach', 2], [6, 'moth', '*', 2, 3]]),
      wave(24, [[0, 'slug', 0], [2, 'slug', 3], [6, 'mouse', '*'], [10, 'ant', '*', 5, 1.4]]),
      wave(25, [[0, 'shieldant', '*', 4, 2], [6, 'weevil', '*', 3, 2.5], [12, 'moth', '*', 3, 2]]),
      wave(25, [[0, 'spore', '*', 3, 2.5], [4, 'mouse', '*', 2, 3], [8, 'roach', '*', 4, 1.8], [14, 'ant', '*', 6, 1.2]]),
      wave(26, [[0, 'slug', 1], [1, 'slug', 2], [5, 'moth', '*', 4, 1.8], [10, 'shieldant', '*', 4, 2], [14, 'mouse', '*', 2, 3]]),
      wave(30, [[0, 'roach', '*', 6, 1.4], [4, 'slug', 0], [5, 'slug', 3], [8, 'mouse', '*', 3, 2], [12, 'spore', '*', 4, 2], [16, 'moth', '*', 5, 1.5], [20, 'weevil', '*', 4, 1.6], [24, 'ant', '*', 10, 0.9]], true)
    ]
  },
  {
    ...pantry, id: 'c4-4', chapter: 4, index: 4,
    name: { en: 'Midnight Supper', zh: '夜宵' },
    blurb: { en: 'The Rice Cooker hums awake: it heals everyone around it. The Baron\'s court is out in force tonight; keep your guards patched up.', zh: '电饭煲嗡嗡地醒了：它能治疗身边的所有伙伴。男爵的手下今晚倾巢出动，记得给守卫们补补血。' },
    startHeat: 275, terrain: terrain({ dark: true, lamps: PANTRY_LAMPS }),
    intro: 'c4-4-intro', outro: 'c4-4-outro', reward: 135,
    introduces: { defenders: ['ricecooker'] },
    bonus: { kind: 'noRemove' },
    barks: BARKS['c4-4'],
    waves: [
      wave(24, [[0, 'ant', 1, 2, 3], [4, 'ant', 3, 2, 3]]),
      wave(22, [[0, 'roach', '*', 3, 2.5], [6, 'mouse', 2]]),
      wave(24, [[0, 'slug', 1], [2, 'slug', 3], [6, 'weevil', '*', 2, 3], [10, 'moth', '*', 2, 3]]),
      wave(25, [[0, 'mouse', '*', 3, 2.5], [5, 'shieldant', '*', 3, 2], [10, 'spore', '*', 3, 2]]),
      wave(25, [[0, 'roach', '*', 5, 1.6], [6, 'slug', 2], [10, 'moth', '*', 4, 1.8], [14, 'ant', '*', 6, 1.2]]),
      wave(26, [[0, 'slug', 0], [1, 'slug', 4], [4, 'mouse', '*', 3, 2.5], [10, 'weevil', '*', 4, 2], [14, 'spore', '*', 3, 2]]),
      wave(26, [[0, 'shieldant', '*', 6, 1.6], [6, 'roach', '*', 5, 1.5], [12, 'moth', '*', 5, 1.5], [16, 'mouse', '*', 2, 3]]),
      wave(30, [[0, 'slug', '*', 3, 2.5], [4, 'mouse', '*', 4, 2], [8, 'roach', '*', 6, 1.4], [14, 'spore', '*', 4, 1.8], [18, 'moth', '*', 6, 1.3], [22, 'weevil', '*', 4, 1.6], [26, 'ant', '*', 12, 0.8]], true)
    ]
  },
  {
    ...pantry, id: 'c4-5', chapter: 4, index: 5,
    name: { en: 'The Pantry Baron', zh: '储物柜男爵' },
    blurb: { en: 'The Baron holds court in the dark. He blows out the light around your Burners, sends thieves, and is very hard to hit unless someone lights his way.', zh: '男爵在黑暗中坐朝。他会吹灭炉头周围的光，派出小偷，而且除非有人给他照亮，否则很难打中。' },
    startHeat: 300, terrain: terrain({ dark: true, lamps: [...PANTRY_LAMPS, [7, 2]] }),
    intro: 'c4-5-intro', outro: 'c4-5-outro', reward: 200, boss: 'baron', music: 'boss',
    introduces: { enemies: ['baron'] },
    bonus: { kind: 'timeUnder', seconds: 360 },
    barks: BARKS['c4-5'],
    waves: [
      wave(24, [[0, 'ant', 1], [4, 'ant', 3], [8, 'mouse', 2]]),
      wave(22, [[0, 'roach', '*', 2, 3], [5, 'moth', '*', 2, 3], [10, 'slug', 2]]),
      wave(24, [[0, 'mouse', '*', 2, 3], [5, 'shieldant', '*', 3, 2], [10, 'spore', '*', 2, 3]]),
      wave(25, [[0, 'slug', 1], [1, 'slug', 3], [5, 'weevil', '*', 3, 2], [10, 'moth', '*', 3, 2]]),
      wave(30, [[0, 'baron', 2], [6, 'ant', '*', 6, 2.5], [16, 'mouse', '*', 2, 5], [28, 'shieldant', '*', 4, 3], [40, 'moth', '*', 4, 3], [54, 'slug', '*', 2, 6], [66, 'roach', '*', 5, 2.5], [80, 'mouse', '*', 3, 4], [94, 'weevil', '*', 4, 3], [110, 'ant', '*', 14, 1.2]], true)
    ]
  },
  // ============================================================ Chapter 5: Inside the Fridge
  {
    ...fridge, id: 'c5-1', chapter: 5, index: 1,
    name: { en: 'Cold Open', zh: '冷气扑面' },
    blurb: { en: 'Inside the fridge the shelves are frosted. Pests trudge slower, but guards on frost freeze up to half speed unless a Burner or Rice Cooker keeps them warm.', zh: '冰箱里的架子结满了霜。害虫走得更慢了，可守卫站在霜上也会冻得只剩一半速度，除非有炉头或电饭煲给它们取暖。' },
    startHeat: 275, terrain: terrain({ frost: rect(2, 8, [0, 1, 2, 3, 4]) }),
    intro: 'c5-1-intro', outro: 'c5-1-outro', reward: 140,
    bonus: { kind: 'tier3', n: 2 },
    barks: BARKS['c5-1'],
    tutorial: [
      { text: { en: 'Frosted cells chill guards to half speed. A Burner or Rice Cooker warms the cells around it.', zh: '结霜的格子会把守卫冻得只剩一半速度。炉头和电饭煲能温暖周围的格子。' }, focus: { card: 'ricecooker' }, until: { on: 'place', def: 'ricecooker' } }
    ],
    waves: [
      wave(24, [[0, 'ant', 1], [4, 'ant', 3], [8, 'ant', 2]]),
      wave(22, [[0, 'roach', '*', 2, 3], [5, 'spore', 2], [9, 'ant', '*', 4, 1.6]]),
      wave(24, [[0, 'slug', 1], [2, 'slug', 3], [6, 'shieldant', '*', 3, 2.5], [12, 'fruitfly', '*', 3, 2]]),
      wave(25, [[0, 'spore', '*', 3, 2.5], [4, 'roach', '*', 4, 2], [10, 'weevil', '*', 2, 3], [14, 'ant', '*', 6, 1.2]]),
      wave(25, [[0, 'slug', 0], [1, 'slug', 4], [4, 'mouse', '*', 2, 3], [8, 'moth', '*', 3, 2], [12, 'shieldant', '*', 4, 2]]),
      wave(26, [[0, 'roach', '*', 6, 1.5], [5, 'spore', '*', 4, 2], [10, 'slug', 2], [14, 'fruitfly', '*', 5, 1.4]]),
      wave(30, [[0, 'slug', '*', 3, 2.5], [4, 'shieldant', '*', 5, 1.6], [8, 'roach', '*', 6, 1.4], [14, 'spore', '*', 4, 1.8], [18, 'weevil', '*', 4, 1.6], [22, 'ant', '*', 12, 0.8]], true)
    ]
  },
  {
    ...fridge, id: 'c5-2', chapter: 5, index: 2,
    name: { en: 'Old Leftovers', zh: '陈年剩菜' },
    blurb: { en: 'Mold Brutes: thick-skinned heaps that burst into spores when they fall. Drop them far from your line, and keep the Salt handy.', zh: '霉菌壮汉：皮厚的大坨霉菌，倒下时会炸出霉孢子。离防线远一点把它们放倒，盐罐随时备着。' },
    startHeat: 325, terrain: terrain({ frost: rect(3, 8, [0, 1, 2, 3, 4]) }),
    intro: 'c5-2-intro', outro: 'c5-2-outro', reward: 150,
    introduces: { enemies: ['brute'] },
    bonus: { kind: 'tier3', n: 4 },
    barks: BARKS['c5-2'],
    waves: [
      wave(24, [[0, 'ant', 2, 2, 3], [5, 'spore', 1], [8, 'spore', 3]]),
      wave(24, [[0, 'ant', '*', 3, 2], [8, 'brute', 2]]),
      wave(24, [[0, 'roach', '*', 3, 2.5], [5, 'slug', 1], [7, 'slug', 3], [12, 'spore', '*', 2, 3]]),
      wave(25, [[0, 'brute', 0], [3, 'brute', 4], [8, 'shieldant', '*', 3, 2], [12, 'fruitfly', '*', 3, 2]]),
      wave(25, [[0, 'spore', '*', 4, 2], [5, 'roach', '*', 4, 1.8], [10, 'mouse', '*', 2, 3], [14, 'ant', '*', 6, 1.2]]),
      wave(26, [[0, 'brute', 1], [2, 'brute', 3], [6, 'slug', 2], [10, 'weevil', '*', 3, 2], [14, 'moth', '*', 3, 2]]),
      wave(26, [[0, 'shieldant', '*', 5, 1.6], [5, 'spore', '*', 4, 1.8], [10, 'roach', '*', 5, 1.5], [16, 'brute', 2]]),
      wave(30, [[0, 'brute', 0], [2, 'brute', 4], [4, 'brute', 2], [8, 'slug', 1], [9, 'slug', 3], [12, 'roach', '*', 6, 1.4], [16, 'spore', '*', 5, 1.6], [20, 'shieldant', '*', 4, 1.8], [24, 'ant', '*', 12, 0.8]], true)
    ]
  },
  {
    ...fridge, id: 'c5-3', chapter: 5, index: 3,
    name: { en: 'Spreading', zh: '蔓延' },
    blurb: { en: 'Back here the mold is alive: every few seconds a patch creeps onto the next cell. Salt scrubs cells clean; a Salt Shaker fires at mold even with no pest in sight.', zh: '这里的霉菌是活的：每隔几秒，就有一块爬到隔壁格子上。盐能把格子擦干净；就算看不到害虫，盐罐也会朝霉菌撒盐。' },
    startHeat: 325, terrain: terrain({ frost: rect(4, 8, [0, 1, 2, 3, 4]), mold: [[6, 1], [6, 3], [7, 2]] }),
    hazards: [{ kind: 'moldSpread', every: 7, first: 30 }],
    intro: 'c5-3-intro', outro: 'c5-3-outro', reward: 155,
    bonus: { kind: 'recipes', n: 3 },
    barks: BARKS['c5-3'],
    waves: [
      wave(24, [[0, 'ant', 1], [4, 'ant', 3], [8, 'spore', 2]]),
      wave(22, [[0, 'spore', '*', 2, 3], [5, 'roach', '*', 2, 3], [10, 'ant', '*', 3, 1.6]]),
      wave(24, [[0, 'slug', 2], [3, 'brute', 0], [8, 'spore', '*', 2, 3], [12, 'fruitfly', '*', 3, 2]]),
      wave(25, [[0, 'shieldant', '*', 4, 2], [6, 'spore', '*', 3, 2], [10, 'weevil', '*', 3, 2]]),
      wave(25, [[0, 'brute', 1], [2, 'brute', 3], [6, 'roach', '*', 4, 1.8], [12, 'moth', '*', 3, 2]]),
      wave(26, [[0, 'slug', 0], [1, 'slug', 4], [4, 'spore', '*', 5, 1.6], [10, 'mouse', '*', 2, 3], [14, 'ant', '*', 8, 1]]),
      wave(26, [[0, 'brute', 2], [3, 'shieldant', '*', 5, 1.6], [8, 'roach', '*', 5, 1.5], [14, 'spore', '*', 4, 1.6]]),
      wave(30, [[0, 'brute', 0], [2, 'brute', 4], [5, 'spore', '*', 6, 1.4], [10, 'slug', 1], [11, 'slug', 3], [14, 'roach', '*', 6, 1.3], [20, 'shieldant', '*', 5, 1.6], [26, 'ant', '*', 12, 0.8]], true)
    ]
  },
  {
    ...fridge, id: 'c5-4', chapter: 5, index: 4,
    name: { en: 'The Back of the Fridge', zh: '冰箱最里面' },
    blurb: { en: 'Cold snaps: a ring of frost glows, then every chilled guard freezes solid for a few seconds. Warm guards do not even notice.', zh: '寒流来袭：一圈霜光亮起，随后所有受冻的守卫会被冻住好几秒。暖和的守卫则毫无感觉。' },
    startHeat: 325, terrain: terrain({ frost: rect(1, 8, [0, 1, 2, 3, 4]), mold: [[7, 0], [7, 4]] }),
    hazards: [{ kind: 'coldSnap', every: 30, first: 50, warn: 3, stun: 3.5 }, { kind: 'moldSpread', every: 10, first: 45 }],
    intro: 'c5-4-intro', outro: 'c5-4-outro', reward: 165,
    bonus: { kind: 'recipes', n: 3 },
    barks: BARKS['c5-4'],
    waves: [
      wave(24, [[0, 'ant', 1, 2, 3], [4, 'ant', 3, 2, 3], [9, 'spore', 2]]),
      wave(24, [[0, 'roach', '*', 2, 3], [8, 'ant', '*', 3, 2]]),
      wave(25, [[0, 'brute', 2], [4, 'slug', 1], [8, 'spore', '*', 2, 3], [12, 'moth', '*', 2, 3]]),
      wave(25, [[0, 'brute', 0], [2, 'brute', 4], [6, 'shieldant', '*', 4, 2], [12, 'weevil', '*', 3, 2]]),
      wave(28, [[0, 'brute', 1], [2, 'brute', 3], [5, 'slug', 2], [9, 'spore', '*', 4, 1.6], [14, 'fruitfly', '*', 3, 2], [18, 'ant', '*', 6, 1.2]]),
      wave(26, [[0, 'shieldant', '*', 6, 1.5], [6, 'roach', '*', 6, 1.4], [12, 'moth', '*', 5, 1.4], [16, 'brute', 2]]),
      wave(28, [[0, 'slug', '*', 4, 2], [5, 'brute', '*', 2, 4], [10, 'spore', '*', 6, 1.3], [16, 'mouse', '*', 3, 2], [20, 'weevil', '*', 4, 1.6]]),
      wave(30, [[0, 'brute', 0], [1, 'brute', 2], [2, 'brute', 4], [6, 'roach', '*', 8, 1.2], [12, 'slug', 1], [13, 'slug', 3], [16, 'spore', '*', 6, 1.3], [20, 'shieldant', '*', 6, 1.4], [26, 'moth', '*', 6, 1.2], [30, 'ant', '*', 14, 0.7]], true)
    ]
  },
  {
    ...fridge, id: 'c5-5', chapter: 5, index: 5,
    name: { en: 'The Bloom', zh: '霉华' },
    blurb: { en: 'At the very back, under the frost, something is humming. It rains mold, breathes cold, and calls everything it has. It does not want to fight forever. When it stops, bring it something warm.', zh: '在最里面的霜下面，有什么东西在哼歌。它会降下霉雨，呼出寒气，召唤它的一切。它并不想永远打下去。等它停下来的时候，给它带点暖和的东西。' },
    startHeat: 325, terrain: terrain({ frost: rect(2, 8, [0, 1, 2, 3, 4]) }),
    hazards: [{ kind: 'moldSpread', every: 14, first: 150 }],
    intro: 'c5-5-intro', outro: 'c5-5-outro', reward: 300, boss: 'bloom', music: 'finale',
    introduces: { enemies: ['bloom'] },
    bonus: { kind: 'recipes', n: 2 },
    barks: BARKS['c5-5'],
    waves: [
      wave(24, [[0, 'ant', 1], [4, 'ant', 3], [8, 'spore', 2]]),
      wave(22, [[0, 'roach', '*', 3, 2.5], [6, 'spore', '*', 2, 3], [10, 'slug', 2]]),
      wave(24, [[0, 'brute', 2], [4, 'shieldant', '*', 3, 2], [10, 'moth', '*', 2, 3]]),
      wave(25, [[0, 'slug', 1], [1, 'slug', 3], [5, 'spore', '*', 3, 2.5], [12, 'weevil', '*', 2, 3]]),
      wave(32, [[0, 'bloom', 2], [6, 'ant', '*', 6, 2.5], [18, 'spore', '*', 3, 4], [30, 'shieldant', '*', 4, 3], [42, 'roach', '*', 4, 3], [56, 'slug', '*', 2, 6], [68, 'moth', '*', 5, 2.5], [82, 'spore', '*', 4, 3], [96, 'roach', '*', 6, 2], [112, 'ant', '*', 14, 1.2]], true)
    ]
  }
];

const withBossScale = (level: LevelDef): LevelDef => {
  const k = BOSS_SCALE[level.id];
  return k === undefined ? level : { ...level, waves: level.waves.map(w => (w.spawns.some(row => row[1] === level.boss) ? { ...w, bossScale: k } : w)) };
};
export const CAMPAIGN: LevelDef[] = RAW.map(level => tuned(withBossScale(level)));
