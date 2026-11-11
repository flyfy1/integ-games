import { BARKS } from '../story';
import type { ChapterDef, LevelDef, SpawnRow, WaveDef } from '../types';
import { CAMPAIGN, tuned } from './campaign';
import { STARTING_DEFENDERS } from './defenders';
import { endlessWave } from './endless';

/**
 * Campaign levels. A level is a row: board, economy, a wave script, a bonus goal and its story hooks.
 * Waves: `wave(after, spawns, big?)` where `after` is seconds since the previous wave started and each spawn is
 * `[t, enemy, lane, count?, gap?]` (lane = index into the level's active lanes, or '*' for a random lane).
 * Balance with `bot.ts` (`measureLevel`) before shipping a change: see tests/midnight-kitchen-balance.test.ts.
 */
const wave = (after: number, spawns: SpawnRow[], big = false): WaveDef => ({ after, spawns, big });
const base = { cols: 9, lanes: 5, slices: 3, slots: 6, backdrop: 'countertop', music: 'countertop' } as const;

const CHAPTER_ONE: LevelDef[] = [
  {
    ...base, id: 'c1-1', chapter: 1, index: 1,
    name: { en: 'Midnight', zh: '午夜' },
    blurb: { en: 'Light a Burner, load the Pepper Mill, and keep the ants off the cake.', zh: '点起炉头，装好胡椒，别让蚂蚁碰到蛋糕。' },
    activeLanes: [1, 2, 3], startHeat: 150, trickle: { amount: 10, interval: 4 },
    cards: ['burner', 'pepper'],
    intro: 'c1-1-intro', outro: 'c1-1-outro', unlocks: ['dough'], reward: 40,
    introduces: { defenders: ['burner', 'pepper'], enemies: ['ant'] },
    bonus: { kind: 'heatBank', n: 100 },
    barks: BARKS['c1-1'],
    tutorial: [
      { text: { en: 'Tap the Burner card, then tap a cell next to the cake.', zh: '点一下“小炉头”卡牌，再点蛋糕旁边的一格。' }, focus: { card: 'burner' }, until: { on: 'place', def: 'burner' } },
      { text: { en: 'Burners make Heat. Now put a Pepper Mill in the middle lane.', zh: '炉头会产生火候。现在在中间那一路放一个胡椒研磨瓶。' }, focus: { card: 'pepper' }, until: { on: 'place', def: 'pepper' } },
      { text: { en: 'Ants come from the right. A mill only guards its own lane, so save Heat for more.', zh: '蚂蚁从右边过来。研磨瓶只守自己那一路，攒火候多放几个。' }, focus: { hud: 'heat' }, until: { on: 'waveStart' } },
      { text: { en: 'More Burners mean more Heat. Keep the cake safe until the wave bar fills.', zh: '炉头越多，火候越多。守住蛋糕，直到波次进度条走完。' }, focus: { hud: 'waves' }, until: { time: 46 } }
    ],
    waves: [
      wave(24, [[0, 'ant', 1]]),
      wave(22, [[0, 'ant', 0], [9, 'ant', 2]]),
      wave(24, [[0, 'ant', 1], [5, 'ant', 2], [10, 'ant', 0]]),
      wave(24, [[0, 'ant', 0, 2, 5], [3, 'ant', 2, 2, 5], [7, 'ant', 1]]),
      wave(26, [[0, 'ant', 0, 3, 4], [1, 'ant', 1, 3, 4], [2, 'ant', 2, 3, 4]], true)
    ]
  },
  {
    ...base, id: 'c1-2', chapter: 1, index: 2,
    name: { en: 'The Soft Wall', zh: '软软的墙' },
    blurb: { en: 'All five lanes are open. Dough holds them up; spare Heat upgrades your guards.', zh: '五路全开。面团负责挡路，多余的火候用来升级守卫。' },
    startHeat: 200, trickle: { amount: 10, interval: 4 },
    intro: 'c1-2-intro', outro: 'c1-2-outro', unlocks: ['egg'], reward: 50,
    introduces: { defenders: ['dough'], enemies: ['roach'] },
    bonus: { kind: 'tier3', n: 1 },
    barks: BARKS['c1-2'],
    tutorial: [
      { text: { en: 'Five lanes now. Start with Burners near the cake, then a Pepper Mill where ants appear.', zh: '现在有五路了。先在蛋糕旁放炉头，蚂蚁从哪一路来就在哪一路放研磨瓶。' }, until: { on: 'waveStart' } },
      { text: { en: 'Tap a placed defender to upgrade it (or remove it with the spatula).', zh: '点一下已放置的守卫可以升级（也可以用锅铲铲走）。' }, focus: { defender: 'pepper' }, until: { on: 'upgrade' } }
    ],
    waves: [
      wave(22, [[0, 'ant', 2], [8, 'ant', 0]]),
      wave(22, [[0, 'ant', 4], [4, 'ant', 1], [9, 'ant', 3], [13, 'ant', 2]]),
      wave(24, [[0, 'roach', 2], [3, 'ant', 0, 2, 6], [5, 'ant', 4, 2, 6], [10, 'ant', 1]]),
      wave(25, [[0, 'ant', 1, 3, 4], [1, 'ant', 3, 3, 4], [6, 'roach', 0], [10, 'roach', 4], [12, 'ant', 2, 2, 4]]),
      wave(26, [[0, 'ant', '*', 6, 2.5], [3, 'roach', 1], [7, 'roach', 3], [12, 'roach', 2]]),
      wave(26, [[0, 'roach', 0], [4, 'roach', 4], [5, 'ant', 1, 3, 3.5], [6, 'ant', 2, 3, 3.5], [7, 'ant', 3, 3, 3.5], [16, 'roach', '*', 1]]),
      wave(28, [[0, 'ant', 0, 4, 3.5], [1, 'ant', 1, 4, 3.5], [2, 'ant', 2, 4, 3.5], [3, 'ant', 3, 4, 3.5], [4, 'ant', 4, 4, 3.5], [5, 'roach', 1], [8, 'roach', 3], [13, 'roach', 2], [18, 'roach', '*', 2, 3]], true)
    ]
  },
  {
    ...base, id: 'c1-3', chapter: 1, index: 3,
    name: { en: 'Crumb Shields', zh: '饼干盾牌' },
    blurb: { en: 'Shields stop pepper. Lob eggs over them, and stand neighbours together to cook Recipes.', zh: '盾牌挡得住胡椒。把鸡蛋抛过去，再让守卫挨在一起做出食谱。' },
    startHeat: 200, trickle: { amount: 10, interval: 4 },
    intro: 'c1-3-intro', outro: 'c1-3-outro', unlocks: ['ice', 'chili'], reward: 60,
    introduces: { defenders: ['egg'], enemies: ['shieldant'] },
    bonus: { kind: 'recipes', n: 2 },
    barks: BARKS['c1-3'],
    tutorial: [
      { text: { en: 'Recipes: place two matching neighbours side by side. Try an Egg Lobber next to Dough, or a Pepper Mill next to a Burner.', zh: '食谱：把合适的两个守卫挨着放。试试抛蛋手挨着面团，或者研磨瓶挨着炉头。' }, until: { on: 'recipe' } }
    ],
    waves: [
      wave(22, [[0, 'ant', 1], [5, 'ant', 3], [10, 'ant', 2]]),
      wave(22, [[0, 'shieldant', 2], [5, 'ant', 0, 2, 5], [8, 'ant', 4, 2, 5]]),
      wave(24, [[0, 'shieldant', 0], [3, 'shieldant', 4], [7, 'ant', 2, 3, 4], [12, 'roach', 1]]),
      wave(25, [[0, 'ant', '*', 5, 3], [2, 'shieldant', 1, 2, 6], [5, 'shieldant', 3, 2, 6], [12, 'roach', 2]]),
      wave(26, [[0, 'shieldant', 0, 2, 5], [1, 'shieldant', 4, 2, 5], [2, 'shieldant', 2, 2, 5], [8, 'roach', 1], [9, 'roach', 3], [12, 'ant', '*', 5, 2]]),
      wave(26, [[0, 'roach', '*', 3, 3], [3, 'shieldant', '*', 4, 3], [6, 'ant', 0, 3, 3], [7, 'ant', 4, 3, 3], [14, 'shieldant', 2, 2, 3]]),
      wave(27, [[0, 'shieldant', 1, 3, 4], [1, 'shieldant', 3, 3, 4], [4, 'ant', '*', 8, 2], [8, 'roach', 0, 2, 5], [9, 'roach', 4, 2, 5], [16, 'roach', 2, 2, 3]]),
      wave(28, [[0, 'shieldant', '*', 8, 2.5], [2, 'ant', 0, 4, 3], [3, 'ant', 2, 4, 3], [4, 'ant', 4, 4, 3], [8, 'roach', 1, 2, 5], [9, 'roach', 3, 2, 5], [15, 'shieldant', 2, 3, 3], [18, 'ant', '*', 8, 1.5], [22, 'roach', '*', 3, 2]], true)
    ]
  },
  {
    ...base, id: 'c1-4', chapter: 1, index: 4,
    name: { en: 'Something in the Air', zh: '空中来客' },
    blurb: { en: 'Fruit flies ignore walls and a slug leaves a fast trail. Chill them, and save the Chili.', zh: '果蝇不理会墙，鼻涕虫会留下加速的黏液。让它们慢下来，把辣椒留到关键时刻。' },
    startHeat: 225, trickle: { amount: 10, interval: 4 },
    intro: 'c1-4-intro', outro: 'c1-4-outro', unlocks: ['onion', 'whisk'], reward: 70,
    introduces: { defenders: ['ice', 'chili'], enemies: ['fruitfly', 'slug'] },
    bonus: { kind: 'noDefenderLost' },
    barks: BARKS['c1-4'],
    waves: [
      wave(22, [[0, 'ant', 2], [4, 'ant', 0], [8, 'ant', 4], [12, 'ant', 1]]),
      wave(22, [[0, 'fruitfly', 3], [4, 'ant', 1, 2, 5], [6, 'ant', 3, 2, 5], [10, 'fruitfly', 4], [13, 'fruitfly', 0]]),
      wave(24, [[0, 'slug', 2], [3, 'ant', 0, 3, 4], [5, 'shieldant', 4], [9, 'fruitfly', 0], [12, 'ant', 2, 3, 2.5]]),
      wave(25, [[0, 'roach', 1], [2, 'fruitfly', 3], [5, 'ant', 2, 4, 3], [8, 'shieldant', 0, 2, 5], [12, 'fruitfly', '*', 2, 3], [14, 'roach', 4]]),
      wave(26, [[0, 'slug', 0], [4, 'slug', 4], [5, 'ant', 0, 3, 3.5], [8, 'ant', 4, 3, 3.5], [9, 'fruitfly', '*', 3, 3], [14, 'roach', 2]]),
      wave(26, [[0, 'shieldant', 1, 2, 5], [1, 'shieldant', 3, 2, 5], [5, 'roach', 0], [8, 'roach', 4], [9, 'slug', 2], [12, 'fruitfly', '*', 3, 3], [14, 'ant', '*', 5, 2.5]]),
      wave(27, [[0, 'slug', 1], [1, 'slug', 3], [4, 'roach', '*', 3, 4], [6, 'fruitfly', '*', 4, 3], [10, 'ant', 1, 3, 3], [11, 'ant', 3, 3, 3], [16, 'shieldant', '*', 2, 4]]),
      wave(30, [[0, 'slug', 2], [1, 'slug', 0], [2, 'slug', 4], [3, 'ant', '*', 10, 1.8], [5, 'fruitfly', '*', 6, 2.5], [8, 'roach', 1, 2, 4], [9, 'roach', 3, 2, 4], [12, 'shieldant', 0, 3, 3], [13, 'shieldant', 4, 3, 3], [18, 'roach', '*', 4, 2], [20, 'fruitfly', '*', 5, 1.5]], true)
    ]
  },
  {
    ...base, id: 'c1-5', chapter: 1, index: 5,
    name: { en: 'Queen Crumb', zh: '碎屑女王' },
    blurb: { en: 'The Queen comes herself. She summons, hops lanes and stuns your guards. Pick your six cards well.', zh: '女王亲自驾临。她会召唤、换路、砸晕守卫。好好挑选你的六张牌。' },
    startHeat: 250, trickle: { amount: 10, interval: 4 },
    intro: 'c1-5-intro', outro: 'c1-5-outro', unlocks: ['kettle'], reward: 120, boss: 'queen',
    introduces: { defenders: ['onion', 'whisk'], enemies: ['spore', 'queen'] },
    bonus: { kind: 'timeUnder', seconds: 330 },
    barks: BARKS['c1-5'], music: 'boss',
    waves: [
      wave(22, [[0, 'ant', 1], [4, 'ant', 3], [9, 'ant', 2], [14, 'ant', 4]]),
      wave(22, [[0, 'spore', 2], [4, 'ant', 0, 2, 5], [6, 'ant', 4, 2, 5], [12, 'fruitfly', 3]]),
      wave(24, [[0, 'roach', 3], [3, 'spore', 0], [7, 'shieldant', 4], [10, 'fruitfly', 1], [12, 'ant', '*', 4, 3]]),
      wave(25, [[0, 'slug', 1], [3, 'shieldant', 3, 2, 5], [7, 'spore', '*', 2, 5], [10, 'roach', 0], [14, 'fruitfly', '*', 2, 4]]),
      wave(26, [[0, 'spore', '*', 3, 4], [2, 'shieldant', '*', 3, 4], [5, 'roach', '*', 2, 5], [8, 'ant', '*', 6, 2.5], [15, 'fruitfly', '*', 2, 3]]),
      // `bossScale` (here and on every boss night) sets the boss's own health apart from its escort: a savvy hand
      // finishes a boss night in 3-4.5 minutes.
      { ...wave(26, [[0, 'queen', 2], [4, 'ant', '*', 6, 3], [12, 'spore', '*', 3, 5], [20, 'fruitfly', '*', 4, 3], [28, 'shieldant', '*', 4, 4], [38, 'spore', '*', 3, 5], [46, 'roach', '*', 4, 4], [58, 'slug', '*', 2, 6], [66, 'fruitfly', '*', 5, 3], [80, 'roach', '*', 5, 3], [95, 'ant', '*', 12, 1.5]], true), bossScale: 0.8 }
    ]
  }
];

export const LEVEL_LIST: LevelDef[] = [...CHAPTER_ONE.map(level => tuned(level)), ...CAMPAIGN];

export const LEVELS: Record<string, LevelDef> = Object.fromEntries(LEVEL_LIST.map(level => [level.id, level]));

export const CHAPTERS: ChapterDef[] = [
  {
    id: 1, backdrop: 'countertop', levels: ['c1-1', 'c1-2', 'c1-3', 'c1-4', 'c1-5'],
    name: { en: 'Countertop', zh: '台面' },
    blurb: { en: 'Midnight. The cake is out, and the walls are awake.', zh: '午夜。蛋糕摆在台面上，墙缝里的家伙们醒了。' }
  },
  {
    id: 2, backdrop: 'sink', levels: ['c2-1', 'c2-2', 'c2-3', 'c2-4', 'c2-5'], opener: 'c2-1-intro',
    name: { en: 'Sink', zh: '水槽' },
    blurb: { en: 'Something is climbing up through the plughole, and it wears a crown.', zh: '有什么东西正顺着下水口往上爬，头上还戴着王冠。' }
  },
  {
    id: 3, backdrop: 'stove', levels: ['c3-1', 'c3-2', 'c3-3', 'c3-4', 'c3-5'], opener: 'c3-1-intro',
    name: { en: 'Stove', zh: '灶台' },
    blurb: { en: 'The pilot lights are still burning. So is something older, under the grease.', zh: '长明火还亮着。油垢底下，还有个更老的东西也在烧。' }
  },
  {
    id: 4, backdrop: 'pantry', levels: ['c4-1', 'c4-2', 'c4-3', 'c4-4', 'c4-5'], opener: 'c4-1-intro',
    name: { en: 'Pantry', zh: '储物柜' },
    blurb: { en: 'Dark shelves, a mouse with a crown, and a photo nobody has looked at in a year.', zh: '漆黑的架子，一只戴王冠的老鼠，还有一张一年没人看过的照片。' }
  },
  {
    id: 5, backdrop: 'fridge', levels: ['c5-1', 'c5-2', 'c5-3', 'c5-4', 'c5-5'], opener: 'c5-1-intro',
    name: { en: 'Inside the Fridge', zh: '冰箱深处' },
    blurb: { en: 'Where it all started. At the very back, behind the jam, a pot with a lid on it.', zh: '一切开始的地方。最里面，果酱罐后头，有一口盖着盖子的锅。' }
  }
];
/** Chapters that exist in the story but are not built yet; the map shows them as "coming soon". All five are built now. */
export const UPCOMING_CHAPTERS: { id: number; name: ChapterDef['name'] }[] = [];

/** Endless: procedural waves, no dawn. Unlocked by clearing `ENDLESS_UNLOCK`. */
export const ENDLESS_UNLOCK = 'c1-3';
export const ENDLESS_LEVEL: LevelDef = {
  ...base, id: 'endless', chapter: 0, index: 0,
  name: { en: 'Endless Night', zh: '无尽之夜' },
  blurb: { en: 'No dawn. The waves grow until the cake is gone. How long can the counter hold?', zh: '没有天亮。一波比一波强，直到蛋糕被吃光。台面能守多久？' },
  startHeat: 275, trickle: { amount: 10, interval: 4 },
  waves: [], waveGen: endlessWave,
  bonus: { kind: 'noRemove' }, reward: 0, barks: BARKS.endless, music: 'endless', polish: true
};

export const levelById = (id: string): LevelDef | undefined => (id === ENDLESS_LEVEL.id ? ENDLESS_LEVEL : LEVELS[id]);
/** Defender ids a player owns when they first reach `levelId` (starting cards plus every earlier unlock). */
export function ownedAt(levelId: string): string[] {
  const owned = [...STARTING_DEFENDERS];
  for (const level of LEVEL_LIST) {
    if (level.id === levelId) return owned;
    for (const id of level.unlocks ?? []) if (!owned.includes(id)) owned.push(id);
  }
  return owned;
}
/** The level after `id` in campaign order, if any. */
export const nextLevelId = (id: string): string | undefined => { const index = LEVEL_LIST.findIndex(level => level.id === id); return index >= 0 ? LEVEL_LIST[index + 1]?.id : undefined; };
