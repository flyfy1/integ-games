/** Static tuning tables for Pocket Survivor. Pure data: no DOM, no randomness. */

export type WeaponId = 'bolt' | 'blades' | 'pulse' | 'lance' | 'meteor';
export type PassiveId = 'might' | 'haste' | 'vitality' | 'magnet' | 'quick' | 'regen';
export type EnemyKind = 'grub' | 'skitter' | 'brute' | 'spitter' | 'charger' | 'warden';

export const WEAPON_IDS: readonly WeaponId[] = ['bolt', 'blades', 'pulse', 'lance', 'meteor'];
export const PASSIVE_IDS: readonly PassiveId[] = ['might', 'haste', 'vitality', 'magnet', 'quick', 'regen'];
export const MAX_LEVEL = 5;

export type EnemyDef = { hp: number; speed: number; dmg: number; r: number; xp: number; score: number; mass: number };
export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  grub: { hp: 10, speed: 58, dmg: 7, r: 10, xp: 1, score: 1, mass: 1 },
  skitter: { hp: 7, speed: 110, dmg: 5, r: 7, xp: 1, score: 1, mass: 0.6 },
  brute: { hp: 110, speed: 42, dmg: 15, r: 17, xp: 6, score: 5, mass: 4 },
  spitter: { hp: 26, speed: 48, dmg: 6, r: 11, xp: 3, score: 3, mass: 1.2 },
  charger: { hp: 40, speed: 64, dmg: 13, r: 12, xp: 4, score: 4, mass: 1.6 },
  warden: { hp: 6000, speed: 42, dmg: 22, r: 36, xp: 0, score: 250, mass: 60 }
};

/** Index 0 is "not owned"; indices 1-5 are weapon levels. Level 5 is the evolved form. */
export const BOLT = { dmg: [0, 10, 13, 13, 16, 20], count: [0, 1, 1, 2, 2, 3], cd: [0, 0.62, 0.58, 0.58, 0.52, 0.45], pierce: [0, 0, 0, 0, 1, 2], speed: 470, range: 250, blast: 38 };
export const BLADES = { count: [0, 2, 3, 3, 4, 6], dmg: [0, 8, 9, 13, 15, 20], radius: [0, 56, 58, 64, 68, 78], spin: [0, 2.8, 2.9, 3.1, 3.3, 4.2], rehit: 0.4 };
export const PULSE = { dmg: [0, 12, 16, 21, 27, 36], radius: [0, 78, 90, 102, 116, 140], cd: [0, 2.8, 2.6, 2.35, 2.1, 1.7], knock: 250, grow: 0.3 };
export const LANCE = { dmg: [0, 24, 32, 40, 52, 70], cd: [0, 1.9, 1.75, 1.6, 1.45, 1.2], width: [0, 14, 16, 18, 20, 26], length: 260, angles: [[], [0], [0], [0, Math.PI], [0, Math.PI], [0, Math.PI, Math.PI / 2, -Math.PI / 2]] as readonly (readonly number[])[] };
export const METEOR = { dmg: [0, 30, 40, 52, 66, 90], cd: [0, 2.6, 2.4, 2.2, 1.9, 1.5], count: [0, 1, 1, 2, 2, 3], radius: [0, 48, 52, 56, 62, 76], delay: 0.55, range: 230 };

export type CardInfo = { name: string; color: string; levels: readonly string[] };
export const WEAPON_CARDS: Record<WeaponId, CardInfo> = {
  bolt: { name: 'Spark Bolt', color: '#7fd8ff', levels: ['Homing bolt at the nearest foe', 'More damage, faster fire', 'Fires 2 bolts', 'Bolts pierce 1 foe', 'EVOLVE: Storm Bolts, 3 exploding bolts'] },
  blades: { name: 'Orbit Blades', color: '#ffd166', levels: ['2 blades circle you and block shots', 'A third blade', 'Sharper, wider orbit', 'A fourth blade', 'EVOLVE: Halo Saw, 6 fast blades'] },
  pulse: { name: 'Pulse Ring', color: '#70f0c2', levels: ['Shockwave that shoves foes back', 'Bigger, stronger wave', 'Bigger wave, faster recharge', 'Bigger, stronger wave', 'EVOLVE: Tidal Pulse, huge wave that slows'] },
  lance: { name: 'Sun Lance', color: '#ff9f6b', levels: ['Piercing beam through the thickest crowd', 'More damage, wider beam', 'Also fires behind', 'More damage, faster', 'EVOLVE: Sun Cross, beams in 4 directions'] },
  meteor: { name: 'Meteor Drop', color: '#c4a1ff', levels: ['Drops a blast on a nearby foe', 'Bigger, stronger blast', 'Drops 2 meteors', 'Stronger, faster', 'EVOLVE: Starfall, 3 giant meteors'] }
};
export const PASSIVE_CARDS: Record<PassiveId, CardInfo & { each: string }> = {
  might: { name: 'Might', color: '#ff6b7a', each: '+15% damage', levels: [] },
  haste: { name: 'Swift Feet', color: '#8be9fd', each: '+8% move speed', levels: [] },
  vitality: { name: 'Vitality', color: '#ff8fab', each: '+25 max HP and heal 25', levels: [] },
  magnet: { name: 'Magnet', color: '#9aa7ff', each: '+35% pickup range', levels: [] },
  quick: { name: 'Quickcast', color: '#ffe08a', each: 'Weapons recharge 8% faster', levels: [] },
  regen: { name: 'Regrowth', color: '#9be36d', each: '+0.5 HP per second', levels: [] }
};

/** XP needed to go from `level` to `level + 1`. */
export const xpNeed = (level: number) => Math.floor(3 + level * 2.4 + level * level * 0.4);
