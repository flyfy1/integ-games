import type { LevelDef } from '../types';

/**
 * The twenty campaign levels. One new problem per level, with at most one new tool that answers it. Levels x-1 to
 * x-3 use a fixed hand; from x-4 the player's loadout applies. Every level ships with a reference script
 * (`data/solutions.ts`) that the content test replays to prove it can be won with a margin.
 *
 * Grid legend: see `types.ts`. Rows are 16 characters, 9 rows. `N` marks the nest.
 */
const L = (text: string) => text.trim().split('\n').map(row => row.trim());
const t = (en: string, zh: string) => ({ en, zh });

// ---------------------------------------------------------------- chapter 1: the backyard blanket
export const CHAPTER1: LevelDef[] = [
  {
    id: '1-1', chapter: 1, index: 1, name: t('First Crumbs', '第一口面包屑'), blurb: t('A cookie fell off the blanket. Lay a trail and bring it home.', '一块饼干掉到了野餐垫外。铺条路线，把它搬回家。'),
    type: 'haul', introduces: t('Scent trails and Workers', '气味路线和工蚁'),
    grid: L(`
      ................
      ................
      ......bbbb......
      ......bbbb......
      .N....bbbb......
      ......bbbb......
      ................
      ................
      ................`),
    nest: [1, 4], foods: [{ id: 'cookie', kind: 'cookie', x: 11, y: 4, crumbs: 40 }], hazards: [],
    scent: 28, startSugar: 50, cards: ['worker'], sundown: 150, par: 50,
    goal: { kind: 'crumbs', n: 20 }, bonus: { kind: 'scent', n: 10 },
    tutorial: [
      { text: t('Drag from the anthill to the cookie to lay a scent trail.', '从蚁丘拖到饼干，铺一条气味路线。'), cells: [[2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4]], until: { event: 'connect' } },
      { text: t('Tap Workers to hatch a brood of three.', '点「工蚁」孵出一窝三只。'), ui: 'worker', until: { event: 'hatch', n: 2 } },
      { text: t('Every crumb home is Sugar. Spend it on more Workers.', '每搬回一粒就是糖。用糖孵更多工蚁。'), ui: 'goal', until: { event: 'deliver', n: 6 } },
      { text: t('A straight trail costs less Scent. That is the bonus star.', '路线越直越省气味，这就是额外的星。'), ui: 'scent', until: { time: 40 } }
    ],
    intro: 'c1-intro'
  },
  {
    id: '1-2', chapter: 1, index: 2, name: t('The Strawberry', '一颗草莓'), blurb: t('A whole strawberry. Too heavy for one ant: it needs eight carriers to lift.', '一整颗草莓。一只蚂蚁搬不动：要八只一起抬。'),
    type: 'heist', introduces: t('Big food and the Porter', '大件食物和大力蚁'),
    grid: L(`
      ................
      ..........bbbb..
      ..........bbbb..
      ................
      .N..............
      ................
      .....bbbb.......
      .....bbbb.......
      ................`),
    nest: [1, 4], foods: [{ id: 'berry', kind: 'strawberry', x: 12, y: 2, crumbs: 20, lift: 9 }, { id: 'bread', kind: 'bread', x: 7, y: 7, crumbs: 30 }], hazards: [],
    scent: 26, startSugar: 60, cards: ['worker', 'porter'], sundown: 170, par: 80,
    goal: { kind: 'item', food: 'berry' }, bonus: { kind: 'crumbs', n: 32 },
    tutorial: [
      { text: t('Run a trail to the bread first. It pays for the heavy lifting.', '先铺路到面包，用它攒糖。'), cells: [[2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [7, 5], [7, 6], [7, 7]], until: { event: 'connect' } },
      { text: t('Now branch the trail to the strawberry. Trails can fork.', '再从路线上分叉到草莓。路线可以分岔。'), cells: [[8, 4], [9, 4], [10, 4], [11, 4], [12, 4], [12, 3], [12, 2]], until: { event: 'connect', n: 2 } },
      { text: t('A Porter lifts like three Workers. The strawberry needs 9 power.', '一只大力蚁顶三只工蚁。草莓要 9 点力气。'), ui: 'porter', until: { event: 'hatch', caste: 'porter' } },
      { text: t('Tap a food to change its priority: more ants go to the starred one.', '点食物可以改优先级：带星的会去更多蚂蚁。'), ui: 'food', until: { event: 'priority' } }
    ]
  },
  {
    id: '1-3', chapter: 1, index: 3, name: t('Eight Legs', '八条腿'), blurb: t('A jumping spider sits on the short way. The long way costs Scent.', '近路上蹲着一只跳蛛。绕远路要多花气味。'),
    type: 'haul', introduces: t('The spider and the Soldier', '跳蛛和兵蚁'),
    grid: L(`
      ................
      ................
      ......bbbbb.....
      ......bbbbb.....
      .N....bbbbb.....
      ......bbbbb.....
      ......bbbbb.....
      ................
      ................`),
    nest: [1, 4], foods: [{ id: 'cookie', kind: 'cookie', x: 13, y: 4, crumbs: 45 }],
    hazards: [{ kind: 'spider', x: 8, y: 4, params: { r: 2.3, period: 2.4, hp: 30 } }],
    scent: 20, startSugar: 60, cards: ['worker', 'soldier'], sundown: 170, par: 75,
    goal: { kind: 'crumbs', n: 25 }, bonus: { kind: 'maxLost', n: 4 },
    tutorial: [
      { text: t('The ring is the spider\'s reach. Every few seconds it eats an ant inside.', '圆圈是跳蛛的范围。每隔几秒它就吃掉一只圈里的蚂蚁。'), until: { time: 5 } },
      { text: t('Go around it, or send a Soldier: pick the card, then a trail cell next to the spider.', '可以绕开，也可以派兵蚁：选牌，再点跳蛛旁的路线格。'), ui: 'soldier', until: { event: 'post', caste: 'soldier' } }
    ]
  },
  {
    id: '1-4', chapter: 1, index: 4, name: t('Do Not Look Down', '别低头'), blurb: t('Picnickers on the blanket. Too many ants in plain sight and someone notices.', '有人在野餐垫上。露面的蚂蚁太多，就会被发现。'),
    type: 'stealth', introduces: t('Alarm, the Shoe, and Scatter', '警觉、大脚和散开'),
    grid: L(`
      ................
      ...bbbbbbbbbb...
      ...bbbbbbbbbb...
      ...bbbbbbbbbb...
      .N.bbbbbbbbbb...
      ...bbbbbbbbbb...
      ...bbbbbbbbbb...
      ...bbbbbbbbbb...
      ................`),
    nest: [1, 4], foods: [{ id: 'pie', kind: 'jam', x: 14, y: 4, crumbs: 45 }, { id: 'cookie', kind: 'cookie', x: 8, y: 8, crumbs: 25 }],
    hazards: [], alarm: true,
    scent: 24, startSugar: 60, sundown: 210, par: 85,
    goal: { kind: 'crumbs', n: 40 }, bonus: { kind: 'noAlarm' },
    tutorial: [
      { text: t('Ants on the blanket raise Alarm (the eye). Ants on grass are hidden.', '垫子上的蚂蚁会让警觉（眼睛）上升，草地上的看不见。'), ui: 'alarm', until: { time: 7 } },
      { text: t('Cross the blanket fast, or go the long way round on the grass.', '可以快速横穿垫子，也可以沿草地绕远路。'), until: { time: 16 } },
      { text: t('When a shoe shadow appears, press Scatter so the ants dive aside.', '鞋子的影子出现时，按「散开」，蚂蚁会闪到一边。'), ui: 'scatter', until: { event: 'strike', n: 1 } }
    ]
  },
  {
    id: '1-5', chapter: 1, index: 5, name: t('Old Gulp', '老咕'), blurb: t('A toad guards the last slice of cake. He turns toward the biggest crowd and snaps up the nearest ant in front of him.', '一只蟾蜍守着最后一块蛋糕。他会转向蚂蚁最多的地方，卷走正前方最近的那只。'),
    type: 'boss', boss: 'toad', introduces: t('Boss: decoys and timing', 'Boss：诱饵和时机'),
    grid: L(`
      ......####......
      ......####......
      ................
      ................
      .N..............
      ................
      ................
      ......####......
      ......####......`),
    nest: [1, 4], foods: [{ id: 'cake', kind: 'cake', x: 13, y: 2, crumbs: 30, lift: 15 }, { id: 'crust', kind: 'bread', x: 8, y: 6, crumbs: 70 }, { id: 'cookie', kind: 'cookie', x: 3, y: 8, crumbs: 50 }],
    hazards: [{ kind: 'toad', x: 8, y: 4, params: { r: 3.6, period: 2.1, nap: 6, cone: 0.6, spin: 1.1, angle: Math.PI / 2 } }],
    scent: 30, startSugar: 80, sundown: 240, par: 110,
    goal: { kind: 'item', food: 'cake' }, bonus: { kind: 'maxLost', n: 15 },
    tutorial: [
      { text: t('Old Gulp turns toward the biggest crowd and eats the nearest ant he faces. Three gulps, then a nap.', '老咕会转向蚂蚁最多的地方，吃掉面前最近的一只。连吃三口就打盹。'), until: { time: 7 } },
      { text: t('Keep a busy trail to the crust as a decoy, then carry the cake past his other side. Rally while he naps.', '让去面包皮的路线热闹起来当诱饵，再从另一边把蛋糕抬过去。趁他打盹按「集结」。'), ui: 'rally', until: { time: 20 } }
    ],
    intro: 'boss-toad', outro: 'c1-outro', music: 'boss'
  }
];

export const LEVELS: LevelDef[] = [...CHAPTER1];
