import type { EnemyDef } from '../types';

/**
 * The Midnight Crumbs. To add an enemy: add a row, a sprite in `render/sprites/`, and use its id in a wave.
 * Behaviour comes from the optional fields (flying, armor, shield, slime, moldOnDeath, burrow, thief, boss).
 */
export const ENEMY_LIST: EnemyDef[] = [
  {
    id: 'ant', hp: 120, speed: 0.2, damage: 9, biteInterval: 0.5, threat: 1, score: 10,
    name: { en: 'Ant', zh: '蚂蚁' },
    desc: { en: 'Small, polite, relentless. Always brings friends.', zh: '个头小，很有礼貌，没完没了。总是成群结队。' }
  },
  {
    id: 'shieldant', hp: 120, speed: 0.18, damage: 9, biteInterval: 0.5, threat: 2.2, score: 20, shield: 220,
    name: { en: 'Crumb-Shield Ant', zh: '碎屑盾蚁' },
    desc: { en: 'Hides behind a biscuit crumb. Straight shots chip the crumb first; lobbed ones go over.', zh: '躲在一块饼干屑后面。直射要先打碎饼干，抛射能越过去。' }
  },
  {
    id: 'fruitfly', hp: 90, speed: 0.34, damage: 0, biteInterval: 1, threat: 1.2, score: 14, flying: true,
    name: { en: 'Fruit-fly Swarm', zh: '果蝇群' },
    desc: { en: 'Fast and fragile. Flies over walls, so only shots reach them.', zh: '又快又脆。会从墙上飞过去，只有射击打得到。' }
  },
  {
    id: 'roach', hp: 200, speed: 0.38, damage: 12, biteInterval: 0.5, threat: 2.6, score: 25, armor: 5, size: 1.15,
    name: { en: 'Cockroach', zh: '蟑螂' },
    desc: { en: 'Quick, with a hard shell that shrugs off light hits. Slow it or wall it.', zh: '跑得快，硬壳能挡掉轻微的攻击。减速它，或者用墙拦住。' }
  },
  {
    id: 'slug', hp: 820, speed: 0.105, damage: 22, biteInterval: 0.9, threat: 4, score: 40, size: 1.3, weak: { salt: 3 },
    slime: { duration: 14, boost: 1.5 },
    name: { en: 'Slug', zh: '鼻涕虫' },
    desc: { en: 'Slow and very hard to stop. Its slime trail speeds up whoever follows.', zh: '很慢，但很难拦住。它留下的黏液会让后面的家伙跑得更快。' }
  },
  {
    id: 'spore', hp: 210, speed: 0.15, damage: 8, biteInterval: 0.6, threat: 2.4, score: 22, weak: { salt: 2, fire: 1.5 },
    moldOnDeath: { duration: 22 }, immune: ['burn'],
    name: { en: 'Mold Spore', zh: '霉孢子' },
    desc: { en: 'Where it falls, mold grows: nothing can be placed there and whoever stands there weakens.', zh: '它倒在哪里，哪里就长霉：那一格不能放置，站在上面的伙伴会变弱。' }
  },
  {
    id: 'queen', hp: 14000, speed: 0.09, damage: 24, biteInterval: 0.8, threat: 60, score: 600, armor: 3, size: 2.2, immune: ['stun', 'sticky'],
    name: { en: 'Queen Crumb', zh: '碎屑女王' },
    desc: { en: 'Queen of the countertop colony. Calls her workers, hops lanes, throws sugar cubes.', zh: '台面蚁群的女王。会召唤工蚁、换路，还会扔方糖。' },
    boss: {
      retreatTo: 6.5,
      phases: [
        // Her court arrives in pairs (it used to be threes, every 7-8 s: more than a first-time player can answer), and
        // every sugar cube is aimed in plain sight first.
        { below: 1, attacks: [{ kind: 'summon', every: 10, enemy: 'ant', count: 2 }, { kind: 'toss', every: 12, damage: 28, stun: 3.5, aim: 1.6 }] },
        { below: 0.66, speed: 1.2, attacks: [{ kind: 'summon', every: 10, enemy: 'shieldant', count: 2 }, { kind: 'hop', every: 12 }, { kind: 'toss', every: 9, damage: 42, stun: 4, aim: 1.6 }] },
        { below: 0.33, speed: 1.5, attacks: [{ kind: 'summon', every: 9, enemy: 'roach', count: 2 }, { kind: 'hop', every: 9 }, { kind: 'rally', every: 13, boost: 1.6, duration: 6 }, { kind: 'toss', every: 7, damage: 56, stun: 4.5, aim: 1.6 }] }
      ]
    }
  },
  // ---- Chapter 2 onward ----
  {
    id: 'weevil', hp: 150, speed: 0.24, damage: 10, biteInterval: 0.5, threat: 2.8, score: 26, burrow: true,
    name: { en: 'Weevil', zh: '象鼻虫' },
    desc: { en: 'Tunnels under the first defender it meets and comes up behind it.', zh: '会从遇到的第一个守卫脚下钻过去，再从后面冒出来。' }
  },
  {
    id: 'mouse', hp: 240, speed: 0.55, damage: 0, biteInterval: 1, threat: 4.5, score: 45, size: 1.4,
    thief: { heat: 75, grab: 1.3 },
    name: { en: 'Mouse', zh: '小老鼠' },
    desc: { en: 'Grabs a defender (or your Heat) and runs. Stop it before it gets away and you get it back.', zh: '抓起一个守卫（或者你的火候）就跑。在它逃走前拦下，东西就能拿回来。' }
  },
  {
    id: 'moth', hp: 120, speed: 0.3, damage: 10, biteInterval: 0.6, threat: 2.2, score: 20, flying: true, drawnToHeat: true, weak: { fire: 1.5, toast: 1.3 },
    name: { en: 'Moth', zh: '飞蛾' },
    desc: { en: 'Flies to the nearest Burner and nibbles it. Only shots reach it; guard the lanes your Burners stand in.', zh: '直奔最近的炉头去啃。只有射击打得到它，守好炉头所在的那几路。' }
  },
  {
    id: 'brute', hp: 1300, speed: 0.12, damage: 30, biteInterval: 0.9, threat: 7, score: 70, armor: 6, size: 1.6,
    weak: { salt: 1.8, fire: 1.2 }, split: { enemy: 'spore', count: 2 },
    name: { en: 'Mold Brute', zh: '霉菌壮汉' },
    desc: { en: 'A shambling heap of mold with a thick hide. When it finally falls, it bursts into spores.', zh: '一大坨蹒跚的霉菌，皮糙肉厚。好不容易倒下时，还会炸出霉孢子。' }
  },
  // ---- Bosses (one per chapter) ----
  {
    id: 'drainking', hp: 10500, speed: 0.1, damage: 45, biteInterval: 0.8, threat: 60, score: 700, armor: 4, size: 2.3, immune: ['stun', 'sticky'], steadfast: true,
    name: { en: 'The Drain King', zh: '下水道之王' },
    desc: { en: 'A huge roach in a bottle-cap crown. Floods lanes so Burners sputter, and ducks under the water.', zh: '戴着瓶盖王冠的巨型蟑螂。会淹掉整路让炉头熄火，还会潜进水里。' },
    boss: {
      retreatTo: 6.5,
      phases: [
        { below: 1, attacks: [{ kind: 'summon', every: 14, enemy: 'roach', count: 2 }, { kind: 'flood', every: 15, warn: 3, duration: 10, spread: 0 }] },
        { below: 0.66, speed: 1.15, attacks: [{ kind: 'dive', every: 12, duration: 2.5 }, { kind: 'summon', every: 14, enemy: 'weevil', count: 2 }, { kind: 'flood', every: 13, warn: 3, duration: 10, spread: 0 }] },
        { below: 0.33, speed: 1.35, attacks: [{ kind: 'flood', every: 12, warn: 3, duration: 9, spread: 1 }, { kind: 'summon', every: 20, enemy: 'slug', count: 1 }, { kind: 'dive', every: 10, duration: 2.5 }, { kind: 'rally', every: 15, boost: 1.5, duration: 5 }] }
      ]
    }
  },
  {
    id: 'greasegolem', hp: 17000, speed: 0.085, damage: 55, biteInterval: 0.9, threat: 60, score: 800, armor: 10, size: 2.4, meltsInFire: true, immune: ['stun', 'sticky'], steadfast: true, weak: { fire: 1.3 },
    name: { en: 'The Grease Golem', zh: '油垢魔像' },
    desc: { en: 'Years of Sunday frying, standing up. Armour like old fat, unless it is burning: set it alight.', zh: '多年星期天煎炸攒下的油垢，站了起来。护甲像凝固的猪油，除非它烧着了：点燃它。' },
    boss: {
      retreatTo: 6.5,
      phases: [
        { below: 1, attacks: [{ kind: 'splatter', every: 9, warn: 2, count: 3, duration: 30 }, { kind: 'summon', every: 12, enemy: 'moth', count: 2 }] },
        { below: 0.66, speed: 1.15, attacks: [{ kind: 'breath', every: 10, warn: 2.2, damage: 70, reach: 3, status: 'burn', duration: 0 }, { kind: 'splatter', every: 10, warn: 2, count: 4, duration: 30 }, { kind: 'summon', every: 12, enemy: 'roach', count: 2 }] },
        { below: 0.33, speed: 1.3, attacks: [{ kind: 'breath', every: 8, warn: 2.2, damage: 80, reach: 3, status: 'burn', duration: 0, lanes: 1 }, { kind: 'summon', every: 15, enemy: 'slug', count: 1 }, { kind: 'rally', every: 14, boost: 1.5, duration: 5 }] }
      ]
    }
  },
  {
    id: 'baron', hp: 13000, speed: 0.11, damage: 40, biteInterval: 0.8, threat: 60, score: 900, armor: 3, size: 2.1, immune: ['stun', 'sticky'], steadfast: true,
    name: { en: 'The Pantry Baron', zh: '储物柜男爵' },
    desc: { en: 'A mouse lord in a thimble crown. Blows out your lights, sends his thieves, and hides in the dark.', zh: '戴着顶针王冠的鼠老爷。吹灭你的灯，派出小偷，再躲进黑暗里。' },
    boss: {
      retreatTo: 6.5,
      phases: [
        { below: 1, attacks: [{ kind: 'summon', every: 16, enemy: 'mouse', count: 2 }, { kind: 'toss', every: 9, damage: 40, stun: 3.5, aim: 1.6 }] },
        { below: 0.66, attacks: [{ kind: 'lightsOut', every: 14, warn: 2.5, radius: 1.6, duration: 9 }, { kind: 'summon', every: 12, enemy: 'moth', count: 3 }, { kind: 'hop', every: 11 }] },
        { below: 0.33, speed: 1.3, attacks: [{ kind: 'lightsOut', every: 11, warn: 2.5, radius: 2.2, duration: 8 }, { kind: 'summon', every: 10, enemy: 'mouse', count: 2 }, { kind: 'rally', every: 14, boost: 1.5, duration: 5 }, { kind: 'toss', every: 7, damage: 50, stun: 4, aim: 1.6 }] }
      ]
    }
  },
  {
    id: 'bloom', hp: 14000, speed: 0.075, damage: 36, biteInterval: 0.9, threat: 80, score: 1200, armor: 2, size: 2.6, immune: ['stun', 'sticky'], steadfast: true,
    name: { en: 'The Bloom', zh: '霉华' },
    desc: { en: 'What grew from the dish nobody came back for. It hums an old Sunday song. It is cold, and it is so tired of being cold.', zh: '从那盘再也没人回来拿的菜里长出来的东西。它哼着一首星期天的老歌。它很冷，冷得太久了。' },
    boss: {
      retreatTo: 6.5,
      remember: { below: 0.15, need: 14 },
      phases: [
        { below: 1, attacks: [{ kind: 'sporeRain', every: 14, warn: 2.5, count: 2, duration: 12 }, { kind: 'summon', every: 14, enemy: 'spore', count: 2 }, { kind: 'breath', every: 16, warn: 2.5, damage: 20, reach: 4, status: 'chill', duration: 3.5 }] },
        { below: 0.7, speed: 1.1, attacks: [{ kind: 'summon', every: 26, enemy: 'brute', count: 1 }, { kind: 'sporeRain', every: 13, warn: 2.5, count: 3, duration: 12 }, { kind: 'breath', every: 14, warn: 2.5, damage: 25, reach: 4, status: 'chill', duration: 3.5, lanes: 1 }] },
        { below: 0.4, speed: 1.2, attacks: [{ kind: 'rally', every: 15, boost: 1.4, duration: 5 }, { kind: 'summon', every: 13, enemy: 'spore', count: 2 }, { kind: 'sporeRain', every: 12, warn: 2.5, count: 3, duration: 12 }, { kind: 'breath', every: 12, warn: 2.5, damage: 30, reach: 5, status: 'chill', duration: 3.5, lanes: 1 }] }
      ]
    }
  }
];

export const ENEMIES: Record<string, EnemyDef> = Object.fromEntries(ENEMY_LIST.map(def => [def.id, def]));
