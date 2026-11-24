import type { CellList, LevelDef, SpawnRow, WaveDef } from '../types';

/**
 * After Hours / 加班夜: ten side nights, each with one rule that changes how the counter plays (a conveyor hand, a
 * cramped counter, double time, one slice...). They open by total stars, not in a chain, so a player who is stuck in
 * the campaign still has something new to try. Each keeps the usual three stars (win, no slice lost, bonus goal).
 *
 * They are deliberately not in `LEVEL_LIST`: campaign order, campaign stars and the arcade's progress number stay as
 * they were. Balance with the bot (`tests/midnight-kitchen-afterhours.test.ts` pins that each night is winnable).
 */
const wave = (after: number, spawns: SpawnRow[], big = false, hpMul?: number): WaveDef => ({ after, spawns, big, ...(hpMul ? { hpMul } : {}) });
const night = { chapter: 0, lanes: 5, cols: 9, slices: 3, slots: 6, music: 'endless' } as const;

/** Lanterns for the Lamplight night: two pools of light near the cake and two out on the counter. */
const LAMPLIGHT: CellList = [[0, 1], [0, 3], [2, 0], [2, 2], [2, 4], [5, 1], [5, 3]];

const RAW: LevelDef[] = [
  {
    ...night, id: 'ah-1', index: 1, backdrop: 'countertop',
    name: { en: 'Conveyor Belt', zh: '传送带' },
    blurb: { en: 'No Heat tonight. Cards ride in on a belt: place them as they come, and do not let the belt fill up.', zh: '今晚没有火候。卡牌坐着传送带过来：来一张放一张，别让传送带堆满。' },
    activeLanes: [1, 2, 3], startHeat: 0,
    rules: { conveyor: { every: 3.2, first: 1, max: 6, pool: ['pepper', 'dough', 'pepper', 'pepper', 'egg', 'pepper', 'dough', 'ice', 'pepper', 'egg'] } },
    bonus: { kind: 'maxDefenders', n: 9 }, reward: 0,
    waves: [
      wave(14, [[0, 'ant', 1], [5, 'ant', 0], [9, 'ant', 2]]),
      wave(18, [[0, 'ant', '*', 4, 2.5], [6, 'roach', 1]]),
      wave(20, [[0, 'shieldant', 0], [2, 'shieldant', 2], [5, 'ant', '*', 4, 2]]),
      wave(20, [[0, 'roach', '*', 3, 3], [4, 'ant', '*', 5, 1.6]]),
      wave(22, [[0, 'ant', 0, 4, 1.5], [1, 'ant', 1, 4, 1.5], [2, 'ant', 2, 4, 1.5], [8, 'roach', '*', 3, 2], [12, 'shieldant', '*', 3, 2.5]], true)
    ]
  },
  {
    ...night, id: 'ah-2', index: 2, backdrop: 'countertop', cols: 4, slots: 6,
    name: { en: 'The Narrow Counter', zh: '窄台面' },
    blurb: { en: 'Somebody left the chopping boards out: only four columns of counter. Every Burner takes a guard\'s spot.', zh: '有人把砧板摊在台面上：只剩四列能站。每放一个炉头，就少一个守卫的位置。' },
    startHeat: 350, trickle: { amount: 15, interval: 4 },
    cards: ['burner', 'pepper', 'dough', 'egg', 'ice', 'chili'],
    bonus: { kind: 'maxDefenders', n: 14 }, reward: 0,
    waves: [
      wave(18, [[0, 'ant', 2], [6, 'ant', 0], [10, 'ant', 4]]),
      wave(20, [[0, 'ant', 1, 2, 3], [3, 'ant', 3, 2, 3], [8, 'roach', 2]]),
      wave(22, [[0, 'shieldant', '*', 2, 4], [4, 'ant', '*', 5, 2], [12, 'roach', '*', 2, 3]]),
      wave(22, [[0, 'slug', 2], [4, 'ant', '*', 6, 1.6], [10, 'fruitfly', '*', 2, 3]]),
      wave(24, [[0, 'roach', '*', 4, 2], [3, 'shieldant', '*', 3, 2.5], [8, 'ant', '*', 8, 1.2]]),
      wave(26, [[0, 'ant', '*', 10, 1], [4, 'roach', '*', 4, 2], [10, 'slug', 1], [11, 'slug', 3], [14, 'shieldant', '*', 4, 2]], true)
    ]
  },
  {
    ...night, id: 'ah-3', index: 3, backdrop: 'countertop',
    name: { en: 'Double Time', zh: '双倍速' },
    blurb: { en: 'The kitchen clock is running fast: pests hurry, waves come quick, and your cards recharge twice as fast.', zh: '厨房的钟走快了：害虫跑得急，波次来得快，你的卡牌冷却也快一倍。' },
    startHeat: 250, trickle: { amount: 20, interval: 4 },
    rules: { pace: { enemySpeed: 1.5, cooldown: 0.5 } },
    cards: ['burner', 'pepper', 'dough', 'egg', 'ice', 'chili'],
    bonus: { kind: 'timeUnder', seconds: 170 }, reward: 0,
    waves: [
      wave(14, [[0, 'ant', 2], [3, 'ant', 0], [6, 'ant', 4]]),
      wave(14, [[0, 'ant', '*', 5, 1.5], [4, 'roach', 2]]),
      wave(15, [[0, 'roach', '*', 2, 2], [2, 'shieldant', '*', 2, 2], [5, 'ant', '*', 5, 1]]),
      wave(15, [[0, 'fruitfly', '*', 3, 1.5], [3, 'ant', '*', 6, 1], [6, 'roach', '*', 2, 2]]),
      wave(16, [[0, 'shieldant', '*', 4, 1.5], [3, 'roach', '*', 3, 1.5], [6, 'ant', '*', 8, 0.8]]),
      wave(16, [[0, 'ant', '*', 12, 0.7], [3, 'roach', '*', 4, 1.2], [6, 'slug', 2], [8, 'fruitfly', '*', 4, 1]], true)
    ]
  },
  {
    ...night, id: 'ah-4', index: 4, backdrop: 'sink', slices: 1,
    name: { en: 'One Bite', zh: '一口定生死' },
    blurb: { en: 'One slice left on the plate, and a crowd of hungry little pests at half strength. Not one of them may get through.', zh: '盘子里只剩一块蛋糕，来的是一大群只有一半血量的小害虫。一只都不能放过去。' },
    startHeat: 250, trickle: { amount: 10, interval: 4 },
    rules: { fixedSlices: true },
    cards: ['burner', 'pepper', 'dough', 'ice', 'kettle', 'chili'],
    bonus: { kind: 'tier3', n: 2 }, reward: 0,
    waves: [
      wave(18, [[0, 'ant', '*', 6, 2]], false, 0.5),
      wave(18, [[0, 'ant', '*', 10, 1.2], [6, 'roach', '*', 2, 3]], false, 0.5),
      wave(20, [[0, 'fruitfly', '*', 6, 1.4], [4, 'ant', '*', 10, 0.9]], false, 0.5),
      wave(20, [[0, 'roach', '*', 6, 1.4], [3, 'shieldant', '*', 4, 2], [8, 'ant', '*', 12, 0.7]], false, 0.5),
      wave(22, [[0, 'ant', '*', 20, 0.5], [3, 'roach', '*', 8, 1], [6, 'fruitfly', '*', 8, 0.9], [10, 'shieldant', '*', 6, 1.2]], true, 0.5)
    ]
  },
  {
    ...night, id: 'ah-5', index: 5, backdrop: 'stove',
    name: { en: 'The Big One', zh: '大家伙' },
    blurb: { en: 'Something enormous is lumbering down the middle lane. Build that lane deep, but the others still need guarding.', zh: '有个庞然大物正沿着中间那一路慢慢挪过来。把中路守得厚厚的，可别的路也不能空着。' },
    startHeat: 300, trickle: { amount: 10, interval: 4 },
    cards: ['burner', 'pepper', 'dough', 'egg', 'ice', 'chili', 'onion', 'whisk'], slots: 8,
    bonus: { kind: 'noRemove' }, reward: 0,
    waves: [
      wave(20, [[0, 'ant', 0], [5, 'ant', 4], [10, 'ant', 1], [14, 'ant', 3]]),
      wave(18, [[0, 'brute', 2], [4, 'ant', 0, 3, 3], [8, 'ant', 4, 3, 3]], true, 2),
      wave(24, [[0, 'roach', 1], [4, 'roach', 3], [8, 'ant', '*', 4, 2]]),
      wave(24, [[0, 'shieldant', 0, 2, 3], [2, 'shieldant', 4, 2, 3], [8, 'roach', '*', 3, 2]]),
      wave(28, [[0, 'brute', 2], [6, 'ant', '*', 8, 1.5], [12, 'roach', 1], [14, 'roach', 3]], true, 2.5)
    ]
  },
  {
    ...night, id: 'ah-6', index: 6, backdrop: 'stove',
    name: { en: 'Spoils', zh: '以战养战' },
    blurb: { en: 'The Burners are out for cleaning. Every pest you send home pays Heat instead, so the first ones count most.', zh: '炉头都拿去洗了。每送走一只害虫就能换来火候，所以开头那几只最要紧。' },
    startHeat: 400,
    rules: { bounty: { per: 28, min: 25 } },
    cards: ['pepper', 'dough', 'egg', 'ice', 'onion', 'kettle', 'chili'], slots: 7,
    bonus: { kind: 'heatBank', n: 300 }, reward: 0,
    waves: [
      wave(12, [[0, 'ant', 2], [3, 'ant', 1], [6, 'ant', 3]]),
      wave(16, [[0, 'ant', '*', 5, 1.8], [6, 'roach', 2]]),
      wave(18, [[0, 'shieldant', '*', 3, 2.5], [4, 'ant', '*', 5, 1.5]]),
      wave(20, [[0, 'roach', '*', 4, 2], [5, 'ant', '*', 6, 1.2], [10, 'fruitfly', '*', 2, 2]]),
      wave(22, [[0, 'slug', 1], [1, 'slug', 3], [5, 'ant', '*', 8, 1], [10, 'shieldant', '*', 3, 2]]),
      wave(24, [[0, 'roach', '*', 6, 1.4], [4, 'shieldant', '*', 5, 1.6], [8, 'ant', '*', 12, 0.8], [14, 'slug', 2]], true)
    ]
  },
  {
    ...night, id: 'ah-7', index: 7, backdrop: 'sink',
    name: { en: 'The Plughole', zh: '下水口' },
    blurb: { en: 'The drain in the middle of the counter is open: every fourth pest climbs out of it, already halfway to the cake.', zh: '台面中间的下水口开着：每四只害虫就有一只从那里钻出来，一出来就走了一半的路。' },
    startHeat: 275, trickle: { amount: 10, interval: 4 },
    rules: { plughole: { col: 5, every: 4 } },
    cards: ['burner', 'pepper', 'dough', 'egg', 'ice', 'kettle', 'honey'], slots: 7,
    bonus: { kind: 'recipes', n: 3 }, reward: 0,
    waves: [
      wave(18, [[0, 'ant', 2], [4, 'ant', 0], [8, 'ant', 4]]),
      wave(20, [[0, 'ant', '*', 6, 2], [6, 'roach', 2]]),
      wave(22, [[0, 'roach', '*', 3, 2.5], [4, 'shieldant', '*', 3, 2.5], [8, 'ant', '*', 4, 1.5]]),
      wave(22, [[0, 'weevil', '*', 3, 2.5], [5, 'ant', '*', 6, 1.4], [10, 'roach', '*', 2, 2]]),
      wave(24, [[0, 'slug', 2], [3, 'roach', '*', 4, 1.8], [6, 'ant', '*', 9, 1], [12, 'weevil', '*', 3, 2]]),
      wave(26, [[0, 'ant', '*', 12, 0.9], [4, 'roach', '*', 6, 1.4], [8, 'shieldant', '*', 4, 1.8], [12, 'slug', 1], [13, 'slug', 3]], true)
    ]
  },
  {
    ...night, id: 'ah-8', index: 8, backdrop: 'pantry',
    name: { en: 'Leftovers', zh: '剩菜' },
    blurb: { en: 'Whatever is left in the fridge: six cards dealt at random from everything you own (always a Burner). Make it work.', zh: '冰箱里剩什么就用什么：从你拥有的卡牌里随机发六张（一定有炉头）。凑合着守吧。' },
    startHeat: 300, trickle: { amount: 10, interval: 4 },
    rules: { leftovers: 6 },
    bonus: { kind: 'recipes', n: 1 }, reward: 0,
    waves: [
      wave(20, [[0, 'ant', 2], [5, 'ant', 0], [9, 'ant', 4]]),
      wave(22, [[0, 'ant', '*', 5, 2], [6, 'roach', '*', 2, 3]]),
      wave(24, [[0, 'shieldant', '*', 3, 3], [5, 'ant', '*', 5, 1.6], [10, 'fruitfly', '*', 2, 3]]),
      wave(24, [[0, 'roach', '*', 4, 2], [5, 'spore', '*', 2, 3], [8, 'ant', '*', 6, 1.4]]),
      wave(26, [[0, 'slug', 2], [3, 'shieldant', '*', 4, 2], [6, 'ant', '*', 8, 1.2], [12, 'roach', '*', 3, 2]]),
      wave(28, [[0, 'ant', '*', 12, 0.9], [3, 'roach', '*', 5, 1.5], [7, 'shieldant', '*', 4, 1.8], [12, 'fruitfly', '*', 4, 1.5], [15, 'slug', '*', 2, 4]], true)
    ]
  },
  {
    ...night, id: 'ah-9', index: 9, backdrop: 'fridge',
    name: { en: 'Recipe Night', zh: '只认食谱' },
    blurb: { en: 'Tonight the guards only fight as a team: a defender that is not part of a Recipe just stands there. Burners still cook Heat.', zh: '今晚守卫们只肯组队干活：不在食谱里的守卫只会站着发呆。炉头照样产火候。' },
    startHeat: 300, trickle: { amount: 10, interval: 4 },
    rules: { recipesOnly: true },
    cards: ['burner', 'pepper', 'dough', 'egg', 'ice', 'onion', 'kettle'], slots: 7,
    bonus: { kind: 'recipes', n: 4 }, reward: 0,
    waves: [
      wave(22, [[0, 'ant', 2], [6, 'ant', 0], [10, 'ant', 4]]),
      wave(22, [[0, 'ant', '*', 5, 2], [6, 'roach', '*', 1]]),
      wave(24, [[0, 'shieldant', '*', 3, 3], [5, 'ant', '*', 5, 1.6]]),
      wave(24, [[0, 'roach', '*', 4, 2], [6, 'ant', '*', 6, 1.4], [10, 'fruitfly', '*', 2, 3]]),
      wave(26, [[0, 'slug', 2], [3, 'shieldant', '*', 4, 2], [6, 'ant', '*', 8, 1.2], [12, 'roach', '*', 3, 2]], true)
    ]
  },
  {
    ...night, id: 'ah-10', index: 10, backdrop: 'pantry', music: 'pantry',
    name: { en: 'Lamplight', zh: '只有灯' },
    blurb: { en: 'The power is out and the Burners are too low to see by. Only the lanterns light the counter: guards and Burners must share the lit spots.', zh: '停电了，炉头的火太小照不亮。只有灯笼能照亮台面：守卫和炉头只能挤在亮处。' },
    startHeat: 300, trickle: { amount: 15, interval: 4 },
    terrain: { dark: true, lamps: LAMPLIGHT },
    rules: { lampsOnly: true },
    cards: ['burner', 'pepper', 'dough', 'kettle', 'whisk', 'chili', 'egg'], slots: 7,
    bonus: { kind: 'noDefenderLost' }, reward: 0,
    waves: [
      wave(20, [[0, 'ant', 1], [5, 'ant', 3], [9, 'ant', 2]]),
      wave(22, [[0, 'ant', '*', 5, 2], [6, 'roach', '*', 2, 3]]),
      wave(24, [[0, 'shieldant', '*', 3, 3], [5, 'ant', '*', 5, 1.6], [10, 'moth', '*', 2, 3]]),
      wave(24, [[0, 'roach', '*', 4, 2], [5, 'ant', '*', 6, 1.4], [10, 'weevil', '*', 2, 3]]),
      wave(26, [[0, 'slug', 2], [3, 'shieldant', '*', 4, 2], [6, 'ant', '*', 8, 1.2], [12, 'roach', '*', 3, 2], [16, 'moth', '*', 3, 2]], true)
    ]
  }
];

/** Health knob per night (every wave's pests), tuned with the bot like the campaign's `TUNE`. */
export const AFTER_HOURS_TUNE: Record<string, number> = {
  'ah-1': 1.6, 'ah-2': 0.6, 'ah-3': 0.8, 'ah-4': 1, 'ah-5': 1, 'ah-6': 0.8, 'ah-7': 0.8, 'ah-8': 1, 'ah-9': 1, 'ah-10': 1
};
export const AFTER_HOURS: LevelDef[] = RAW.map(level => {
  const k = AFTER_HOURS_TUNE[level.id] ?? 1;
  return k === 1 ? level : { ...level, waves: level.waves.map(w => ({ ...w, hpMul: Math.round((w.hpMul ?? 1) * k * 100) / 100 })) };
});

/** Total stars (campaign plus After Hours) that open each night. */
export const AFTER_HOURS_STARS: Record<string, number> = {
  'ah-1': 3, 'ah-2': 6, 'ah-3': 9, 'ah-4': 12, 'ah-5': 16, 'ah-6': 20, 'ah-7': 25, 'ah-8': 30, 'ah-9': 36, 'ah-10': 42
};
export const AFTER_HOURS_BY_ID: Record<string, LevelDef> = Object.fromEntries(AFTER_HOURS.map(level => [level.id, level]));
