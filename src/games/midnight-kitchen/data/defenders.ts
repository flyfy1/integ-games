import type { AttackDef, DefenderDef, TierDef } from '../types';

/**
 * The Pantry Guard. To add a defender: add a row here, a sprite in `render/sprites/` (registered in
 * `render/sprites/index.ts`), and list it in a level's `unlocks`. Nothing else needs to change.
 *
 * `tiers3` builds the usual three tiers from a base attack and per-tier patches so rows stay short.
 */
type AttackOf<K extends AttackDef['kind']> = Extract<AttackDef, { kind: K }>;
function tiers3<K extends AttackDef['kind']>(hp: [number, number, number], costs: [number, number], base: AttackOf<K>, t2: Partial<AttackOf<K>>, t3: Partial<AttackOf<K>>): TierDef[] {
  return [
    { hp: hp[0], attack: base },
    { hp: hp[1], attack: { ...base, ...t2 } as AttackDef, upgradeCost: costs[0] },
    { hp: hp[2], attack: { ...base, ...t2, ...t3 } as AttackDef, upgradeCost: costs[1] }
  ];
}

export const DEFENDER_LIST: DefenderDef[] = [
  {
    id: 'burner', role: 'generator', cost: 50, cooldown: 6, startReady: 1, light: 2.4, glow: 2, warm: 1.5, heatproof: true,
    name: { en: 'Burner', zh: '小炉头' },
    desc: { en: 'Makes Heat. Everything else runs on it.', zh: '产生火候。其他一切都靠它。' },
    tiers: tiers3([90, 120, 160], [75, 125],
      { kind: 'generate', amount: 25, interval: 12, firstDelay: 6 }, { amount: 40 }, { amount: 60 })
  },
  {
    id: 'pepper', role: 'shooter', cost: 100, cooldown: 6, startReady: 1,
    name: { en: 'Pepper Mill', zh: '胡椒研磨瓶' },
    desc: { en: 'Fires peppercorns down its lane.', zh: '沿着所在的一路发射胡椒粒。' },
    tiers: tiers3([110, 140, 180], [90, 150],
      { kind: 'shoot', damage: 20, interval: 1.35, speed: 7, tag: 'pepper', projectile: 'peppercorn' }, { damage: 32 }, { damage: 34, count: 2 })
  },
  {
    id: 'dough', role: 'wall', cost: 50, cooldown: 18, startReady: 0.4,
    name: { en: 'Dough', zh: '面团' },
    desc: { en: 'A soft wall. Left alone, it slowly rises back.', zh: '一堵软软的墙。没人咬它时会慢慢发回来。' },
    tiers: [
      { hp: 520, attack: { kind: 'none' }, regen: { rate: 14, delay: 4 } },
      { hp: 900, attack: { kind: 'none' }, regen: { rate: 24, delay: 3.5 }, upgradeCost: 60 },
      { hp: 1400, attack: { kind: 'none' }, regen: { rate: 40, delay: 3 }, upgradeCost: 100 }
    ]
  },
  {
    id: 'ice', role: 'slow', cost: 125, cooldown: 8, startReady: 0.5,
    name: { en: 'Ice Cube', zh: '冰块' },
    desc: { en: 'Chilly shots that slow whatever they hit.', zh: '冷冰冰的子弹，打中谁谁就变慢。' },
    tiers: tiers3([100, 130, 170], [100, 160],
      { kind: 'shoot', damage: 12, interval: 1.5, speed: 6.5, tag: 'ice', projectile: 'icechip', effects: [{ kind: 'slow', duration: 3.5, power: 0.5 }] },
      { damage: 20, effects: [{ kind: 'slow', duration: 4.5, power: 0.45 }] },
      { damage: 30, pierce: 1, effects: [{ kind: 'slow', duration: 5.5, power: 0.4 }] })
  },
  {
    id: 'egg', role: 'lobber', cost: 125, cooldown: 8, startReady: 0.5,
    name: { en: 'Egg Lobber', zh: '抛蛋手' },
    desc: { en: 'Lobs eggs over shields. They splash.', zh: '把鸡蛋抛过盾牌，落地会溅开。' },
    tiers: tiers3([110, 140, 180], [110, 170],
      { kind: 'lob', damage: 36, interval: 2.6, splash: 0.9, flight: 0.9, tag: 'egg', projectile: 'egg' }, { damage: 58, splash: 1.05 }, { damage: 88, splash: 1.25, interval: 2.3 })
  },
  {
    id: 'chili', role: 'oneshot', cost: 125, cooldown: 32, startReady: 0.3,
    name: { en: 'Chili', zh: '小辣椒' },
    desc: { en: 'One use. Sets its whole lane on fire.', zh: '一次性。把整整一路都点着。' },
    tiers: [{ hp: 400, attack: { kind: 'lanefire', damage: 320, fuse: 0.9, zone: 2.5, burn: { dps: 30, duration: 3 }, tag: 'fire' } }]
  },
  {
    id: 'onion', role: 'stun', cost: 100, cooldown: 14, startReady: 0.4,
    name: { en: 'Onion', zh: '洋葱' },
    desc: { en: 'Makes everyone nearby cry. Stuns in an area, then recharges.', zh: '让附近的家伙哭个不停。范围眩晕，然后重新蓄力。' },
    tiers: tiers3([160, 210, 270], [90, 140],
      { kind: 'burst', damage: 10, interval: 11, radius: 1.9, trigger: 1.6, tag: 'gas', effects: [{ kind: 'stun', duration: 2.6 }] },
      { interval: 9, radius: 2.2, effects: [{ kind: 'stun', duration: 3.2 }] },
      { damage: 40, interval: 7.5, radius: 2.5, effects: [{ kind: 'stun', duration: 3.8 }] })
  },
  {
    id: 'whisk', role: 'melee', cost: 100, cooldown: 9, startReady: 0.5,
    name: { en: 'Whisk', zh: '打蛋器' },
    desc: { en: 'Spins up close. Hits everything in front of it at once.', zh: '近身旋转，面前的敌人一起挨打。' },
    tiers: tiers3([260, 340, 440], [90, 150],
      { kind: 'melee', damage: 16, interval: 0.45, range: 1.6, tag: 'blade' }, { damage: 26 }, { damage: 36, range: 2.3 })
  },
  // ---- Chapter 2 onward ----
  {
    id: 'kettle', role: 'cone', cost: 150, cooldown: 10, startReady: 0.4, heatproof: true,
    name: { en: 'Kettle', zh: '水壶' },
    desc: { en: 'A short burst of steam that goes through everyone in reach.', zh: '短促的蒸汽，穿透射程内的所有敌人。' },
    tiers: tiers3([140, 180, 230], [120, 180],
      { kind: 'cone', damage: 22, interval: 1.6, range: 2.6, spread: 0, tag: 'steam' }, { damage: 34 }, { damage: 46, spread: 1 })
  },
  {
    id: 'honey', role: 'trap', cost: 50, cooldown: 12, startReady: 0.5, passable: true,
    name: { en: 'Honey Jar', zh: '蜂蜜罐' },
    desc: { en: 'Sticky ground. Whoever walks in gets stuck.', zh: '黏糊糊的地面，谁踩进来谁就走不动。' },
    tiers: [
      { hp: 60, attack: { kind: 'trap', damage: 0, uses: 5, tag: 'honey', effects: [{ kind: 'sticky', duration: 4, power: 0.2 }] } },
      { hp: 60, attack: { kind: 'trap', damage: 10, uses: 9, tag: 'honey', effects: [{ kind: 'sticky', duration: 5, power: 0.15 }] }, upgradeCost: 50 },
      { hp: 60, attack: { kind: 'trap', damage: 25, uses: 14, tag: 'honey', effects: [{ kind: 'sticky', duration: 6, power: 0.1 }] }, upgradeCost: 80 }
    ]
  },
  {
    id: 'garlic', role: 'push', cost: 75, cooldown: 12, startReady: 0.5,
    name: { en: 'Garlic', zh: '大蒜' },
    desc: { en: 'Puffs a stink cloud ahead. Whatever walks into it staggers into the better-guarded lane next door.', zh: '朝前方喷一团臭气。走进去的家伙会被熏到隔壁、守得更严的那一路。' },
    tiers: tiers3([200, 260, 340], [70, 120],
      { kind: 'stink', damage: 8, interval: 5, range: 1.8, tag: 'stink' }, { damage: 14, interval: 4.2 }, { damage: 22, interval: 3.5, range: 2.6 })
  },
  {
    id: 'toaster', role: 'shooter', cost: 150, cooldown: 9, startReady: 0.4, heatproof: true, glow: 1, light: 1.2,
    name: { en: 'Toaster', zh: '烤面包机' },
    desc: { en: 'Pops two hot slices at a time. Slow, but each slice knocks its target back.', zh: '一次弹出两片热吐司。慢，但每一片都能把敌人撞退。' },
    tiers: tiers3([130, 170, 220], [110, 170],
      { kind: 'shoot', damage: 30, interval: 3, speed: 6, tag: 'toast', projectile: 'toast', count: 2, knockback: 0.55 }, { damage: 44, knockback: 0.7 }, { damage: 58, interval: 2.5, pierce: 1 })
  },
  {
    id: 'salt', role: 'shooter', cost: 100, cooldown: 8, startReady: 0.5,
    name: { en: 'Salt Shaker', zh: '盐罐' },
    desc: { en: 'Shakes salt down its lane: murder on slugs and mold, and it scrubs moldy cells clean.', zh: '沿着这一路撒盐：鼻涕虫和霉菌的克星，还能把发霉的格子擦干净。' },
    tiers: tiers3([100, 130, 170], [90, 140],
      { kind: 'shoot', damage: 14, interval: 1.5, speed: 7, tag: 'salt', projectile: 'salt', cleanse: true }, { damage: 22 }, { damage: 30, pierce: 1 })
  },
  {
    id: 'ricecooker', role: 'support', cost: 125, cooldown: 14, startReady: 0.4, heatproof: true, warm: 1.5, light: 1,
    name: { en: 'Rice Cooker', zh: '电饭煲' },
    desc: { en: 'Keeps everyone around it warm and patched up. On frost, warmth is everything.', zh: '让身边的伙伴保持温暖，顺手修修补补。在结霜的地方，温暖就是一切。' },
    tiers: tiers3([200, 260, 340], [100, 160],
      { kind: 'aura', heal: 22, interval: 2, radius: 1.5, tag: 'warm' }, { heal: 34 }, { heal: 50 })
  }
];

export const DEFENDERS: Record<string, DefenderDef> = Object.fromEntries(DEFENDER_LIST.map(def => [def.id, def]));
/** The two cards every save starts with. */
export const STARTING_DEFENDERS = ['burner', 'pepper'];
