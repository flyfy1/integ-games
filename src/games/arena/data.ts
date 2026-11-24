/** Static tuning tables for Pocket Survivor. Pure data: no DOM, no randomness. */

export type WeaponId = 'bolt' | 'blades' | 'pulse' | 'lance' | 'meteor' | 'crossbow' | 'firepot' | 'whirl';
export type PassiveId = 'might' | 'haste' | 'vitality' | 'magnet' | 'quick' | 'regen' | 'armor' | 'fortune';
export type EnemyKind = 'grub' | 'skitter' | 'brute' | 'spitter' | 'charger' | 'warden';

export const WEAPON_IDS: readonly WeaponId[] = ['bolt', 'blades', 'pulse', 'lance', 'meteor', 'crossbow', 'firepot', 'whirl'];
export const PASSIVE_IDS: readonly PassiveId[] = ['might', 'haste', 'vitality', 'magnet', 'quick', 'regen', 'armor', 'fortune'];
/** The arsenal every new player starts with; the rest are unlocked by feats. */
export const BASE_WEAPONS: readonly WeaponId[] = ['bolt', 'blades', 'pulse', 'lance', 'meteor'];
export const BASE_PASSIVES: readonly PassiveId[] = ['might', 'haste', 'vitality', 'magnet', 'quick', 'regen'];
export const MAX_LEVEL = 5;
/** Highest level a weapon reaches without its partner passive; the last step is the evolution. */
export const PRE_EVOLVE = MAX_LEVEL - 1;
/** Build slots: a run can carry this many different weapons and passives, so pairing is a real decision. */
export const WEAPON_SLOTS = 4, PASSIVE_SLOTS = 4;

/** Each weapon evolves only while its partner passive is owned (shown on both cards). */
export const PARTNER: Record<WeaponId, PassiveId> = {
  bolt: 'haste', blades: 'vitality', pulse: 'regen', lance: 'might', meteor: 'quick', crossbow: 'fortune', firepot: 'armor', whirl: 'magnet'
};
export const partnerOf = (passive: PassiveId): WeaponId | undefined => WEAPON_IDS.find(id => PARTNER[id] === passive);

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
/** Repeating crossbow: a quick fan of bolts in the direction you last moved, so aiming is steering. */
export const CROSSBOW = { dmg: [0, 7, 9, 10, 12, 15], count: [0, 2, 3, 3, 4, 7], cd: [0, 0.55, 0.5, 0.46, 0.42, 0.3], pierce: [0, 0, 0, 1, 1, 3], spread: [0, 0.16, 0.16, 0.14, 0.14, 0.11], speed: 560, life: 0.6 };
/** Oil pots: lobbed at a crowd, they leave a burning patch that ticks damage. */
export const FIREPOT = { dmg: [0, 6, 8, 10, 13, 17], radius: [0, 40, 44, 48, 54, 74], burn: [0, 2.6, 2.9, 3.2, 3.5, 4.6], cd: [0, 3.1, 2.9, 2.6, 2.4, 2], count: [0, 1, 1, 2, 2, 3], flight: 0.6, tick: 0.4, range: 220 };
/** Wind scroll: whirlwinds that drift outward, drag foes into their eye and keep cutting. */
export const WHIRL = { dmg: [0, 6, 8, 10, 12, 16], radius: [0, 30, 34, 38, 42, 62], life: [0, 2.6, 2.8, 3.1, 3.4, 4.6], cd: [0, 3.2, 3, 2.8, 2.5, 2.1], count: [0, 1, 1, 2, 2, 3], speed: 70, pull: 110, rehit: 0.3 };

export type CardInfo = { name: string; zh: string; color: string; levels: readonly string[]; zhLevels: readonly string[]; evolved?: string; evolvedZh?: string };
export const WEAPON_CARDS: Record<WeaponId, CardInfo> = {
  bolt: { name: 'Flying Spear', zh: '飞枪', color: '#4aa8e0', evolved: 'Thunder Spears', evolvedZh: '雷霆飞枪', levels: ['Hurls a homing spear at the nearest foe', 'More damage, faster throws', 'Throws 2 spears', 'Spears pierce 1 foe', 'EVOLVE: Thunder Spears, 3 exploding spears'], zhLevels: ['向最近的敌人投出追踪飞枪', '伤害提升，投掷更快', '一次投出 2 支', '飞枪可穿透 1 个敌人', '进化：雷霆飞枪，3 支爆裂飞枪'] },
  blades: { name: 'Crescent Blades', zh: '月牙刃', color: '#e6a81e', evolved: 'Blazing Halo', evolvedZh: '烈焰光环', levels: ['2 blades circle you and block arrows', 'A third blade', 'Sharper, wider orbit', 'A fourth blade', 'EVOLVE: Blazing Halo, 6 fast blades'], zhLevels: ['2 把刀刃环绕身边并挡下箭矢', '第 3 把刀刃', '更锋利，环绕更宽', '第 4 把刀刃', '进化：烈焰光环，6 把高速刀刃'] },
  pulse: { name: 'War Drum', zh: '战鼓', color: '#d8342c', evolved: 'Thunder Drum', evolvedZh: '雷鸣战鼓', levels: ['Drumbeat shockwave that shoves foes back', 'Bigger, stronger wave', 'Bigger wave, faster beat', 'Bigger, stronger wave', 'EVOLVE: Thunder Drum, huge wave that slows'], zhLevels: ['鼓声冲击波击退敌人', '冲击波更大更强', '更大，节奏更快', '冲击波更大更强', '进化：雷鸣战鼓，巨大冲击波并减速'] },
  lance: { name: 'Dragon Lance', zh: '龙焰枪', color: '#f0802e', evolved: 'Azure Dragons', evolvedZh: '青龙四焰', levels: ['Piercing dragon flame through the thickest crowd', 'More damage, wider flame', 'Also strikes behind', 'More damage, faster', 'EVOLVE: Azure Dragons, flames in 4 directions'], zhLevels: ['龙焰贯穿最密集的敌群', '伤害提升，火焰更宽', '同时向身后喷射', '伤害提升，更快', '进化：青龙四焰，四个方向喷火'] },
  meteor: { name: 'Fire Arrows', zh: '火箭雨', color: '#e0522e', evolved: 'Skyfire', evolvedZh: '天火', levels: ['Rains fire arrows on a nearby foe', 'Bigger, stronger volley', 'Calls 2 volleys', 'Stronger, faster', 'EVOLVE: Skyfire, 3 giant volleys'], zhLevels: ['向附近敌人降下火箭雨', '箭雨更大更强', '一次 2 轮箭雨', '更强，更快', '进化：天火，3 轮巨型箭雨'] },
  crossbow: { name: 'Repeating Crossbow', zh: '连弩', color: '#8a6ad8', evolved: 'Hundred-Bolt Crossbow', evolvedZh: '百矢连弩', levels: ['Fans bolts the way you move - steer to aim', 'A third bolt', 'Bolts pierce 1 foe', 'A fourth bolt, faster', 'EVOLVE: Hundred-Bolt, 7 piercing bolts'], zhLevels: ['向移动方向扇形连射，走位即瞄准', '第 3 支弩箭', '弩箭穿透 1 个敌人', '第 4 支弩箭，更快', '进化：百矢连弩，7 支穿透弩箭'] },
  firepot: { name: 'Oil Pots', zh: '火油罐', color: '#e8742a', evolved: 'Inferno Pots', evolvedZh: '烈焰油罐', levels: ['Lobs a pot that leaves a burning patch', 'Hotter, longer fire', 'Throws 2 pots', 'Wider, hotter fire', 'EVOLVE: Inferno, 3 huge fires'], zhLevels: ['投出火油罐，留下燃烧区域', '火更旺，烧得更久', '一次投 2 个', '火焰更宽更旺', '进化：烈焰油罐，3 片巨大火海'] },
  whirl: { name: 'Wind Scroll', zh: '风卷轴', color: '#4cc0b0', evolved: 'Eastern Gale', evolvedZh: '东风', levels: ['Whirlwinds drag foes in and keep cutting', 'Stronger winds', 'Two whirlwinds', 'Wider, longer winds', 'EVOLVE: Eastern Gale, 3 great storms that pull loot'], zhLevels: ['旋风把敌人卷进来持续切割', '风力更强', '两道旋风', '更宽更持久', '进化：东风，3 道大风暴并吸取战利品'] }
};
export const PASSIVE_CARDS: Record<PassiveId, CardInfo & { each: string; zhEach: string }> = {
  might: { name: 'Might', zh: '神力', color: '#d8342c', each: '+15% damage', zhEach: '伤害 +15%', levels: [], zhLevels: [] },
  haste: { name: 'Swift Boots', zh: '疾风靴', color: '#4aa8e0', each: '+8% move speed', zhEach: '移动速度 +8%', levels: [], zhLevels: [] },
  vitality: { name: 'Peach of Vigor', zh: '仙桃', color: '#f07a8a', each: '+25 max HP and heal 25', zhEach: '生命上限 +25 并回复 25', levels: [], zhLevels: [] },
  magnet: { name: 'Lodestone Talisman', zh: '磁石符', color: '#e6a81e', each: '+35% pickup range', zhEach: '拾取范围 +35%', levels: [], zhLevels: [] },
  quick: { name: 'War Fan', zh: '军扇', color: '#35c79a', each: 'Weapons recharge 8% faster', zhEach: '武器冷却 -8%', levels: [], zhLevels: [] },
  regen: { name: 'Herb Gourd', zh: '药葫芦', color: '#6cbf4a', each: '+0.5 HP per second', zhEach: '每秒回复 0.5 生命', levels: [], zhLevels: [] },
  armor: { name: 'Lamellar Armor', zh: '鳞甲', color: '#7d8598', each: 'Take 7% less damage', zhEach: '受到伤害 -7%', levels: [], zhLevels: [] },
  fortune: { name: 'Fortune Coin', zh: '福钱', color: '#d9a520', each: '+4% critical hits, +8% jade', zhEach: '暴击率 +4%，玉石 +8%', levels: [], zhLevels: [] }
};

/** XP needed to go from `level` to `level + 1`. */
export const xpNeed = (level: number) => Math.floor(3 + level * 2.4 + level * level * 0.4);

// ---- generals -------------------------------------------------------------------------------------------------------------
export type GeneralId = 'spear' | 'blades' | 'strategist';
export const GENERAL_IDS: readonly GeneralId[] = ['spear', 'blades', 'strategist'];
export type GeneralDef = { name: string; zh: string; weapon: WeaponId; trait: string; zhTrait: string; hp: number; speed: number; xp: number; armor: number };
export const GENERALS: Record<GeneralId, GeneralDef> = {
  spear: { name: 'Silver Spear', zh: '银枪将军', weapon: 'bolt', trait: 'Fleet: +10% move speed', zhTrait: '迅捷：移动速度 +10%', hp: 120, speed: 0.1, xp: 0, armor: 0 },
  blades: { name: 'Iron Captain', zh: '铁甲校尉', weapon: 'blades', trait: 'Stalwart: +30 HP, 10% less damage', zhTrait: '坚毅：生命 +30，受伤 -10%', hp: 150, speed: 0, xp: 0, armor: 0.1 },
  strategist: { name: 'Fan Strategist', zh: '羽扇军师', weapon: 'meteor', trait: 'Scholar: +20% experience', zhTrait: '博学：经验 +20%', hp: 115, speed: 0, xp: 0.2, armor: 0 }
};

// ---- stages ---------------------------------------------------------------------------------------------------------------
export type StageId = 'march' | 'bamboo' | 'river' | 'camp' | 'fortress';
export const STAGE_IDS: readonly StageId[] = ['bamboo', 'river', 'camp', 'fortress', 'march'];
/** Which final boss a stage ends with; each is a different warlord with its own attack set. */
export type BossVariant = 'king' | 'admiral' | 'marshal' | 'warlord';
export const BOSS_VARIANTS: readonly BossVariant[] = ['king', 'admiral', 'marshal', 'warlord'];
/** Enemy mix: [kind, appears at seconds, base weight, weight gained per minute]. */
export type Mix = readonly (readonly [EnemyKind, number, number, number])[];
export type StageDef = {
  name: string; zh: string; scene: number | null; mix: Mix; hp: number; rate: number;
  mid: { kind: Exclude<EnemyKind, 'warden'>; name: string; zh: string }; boss: BossVariant; elites: readonly EnemyKind[];
};
export const BOSS_NAMES: Record<BossVariant, { name: string; zh: string; hp: number }> = {
  king: { name: 'The Bandit King', zh: '山贼王', hp: 0.55 },
  admiral: { name: 'The River Admiral', zh: '水军都督', hp: 0.75 },
  marshal: { name: 'The Siege Marshal', zh: '攻城元帅', hp: 0.9 },
  warlord: { name: 'The Warlord', zh: '霸王', hp: 1 }
};
/** The classic mix (the original single run). Weights reproduce the original `pickKind` table exactly. */
const CLASSIC: Mix = [['grub', 0, 10, 0], ['skitter', 25, 3, 60 / 70], ['spitter', 70, 1.6, 60 / 140], ['brute', 110, 1.2, 60 / 110], ['charger', 150, 1.6, 60 / 130]];
export const STAGES: Record<StageId, StageDef> = {
  bamboo: { name: 'Bamboo Grove', zh: '竹林', scene: 0, hp: 0.85, rate: 0.95, boss: 'king', elites: ['skitter', 'spitter', 'grub'], mid: { kind: 'skitter', name: 'Bandit Chief', zh: '山贼头目' },
    mix: [['grub', 0, 10, 0], ['skitter', 15, 4, 1.4], ['spitter', 80, 1.2, 0.5], ['brute', 200, 0.8, 0.4]] },
  river: { name: 'River Plain', zh: '河畔平原', scene: 1, hp: 0.95, rate: 1, boss: 'admiral', elites: ['spitter', 'charger', 'grub'], mid: { kind: 'spitter', name: 'River Captain', zh: '水军校尉' },
    mix: [['grub', 0, 10, 0], ['spitter', 30, 2.2, 0.9], ['skitter', 50, 2, 0.6], ['charger', 140, 1.2, 0.5]] },
  camp: { name: 'War Camp', zh: '军营', scene: 2, hp: 1.05, rate: 1, boss: 'marshal', elites: ['brute', 'charger', 'spitter'], mid: { kind: 'brute', name: 'Siege Brute', zh: '攻城力士' },
    mix: [['grub', 0, 10, 0], ['brute', 45, 1.6, 0.7], ['skitter', 30, 2.5, 0.5], ['charger', 100, 1.4, 0.6], ['spitter', 120, 1.2, 0.4]] },
  fortress: { name: 'Fortress Courtyard', zh: '要塞庭院', scene: 3, hp: 1.15, rate: 1.05, boss: 'warlord', elites: ['charger', 'brute', 'spitter', 'grub'], mid: { kind: 'charger', name: 'Iron Cavalry Captain', zh: '铁骑统领' },
    mix: [['grub', 0, 10, 0], ['skitter', 20, 3, 0.8], ['charger', 60, 1.8, 0.7], ['spitter', 70, 1.6, 0.5], ['brute', 90, 1.4, 0.6]] },
  march: { name: 'The Long March', zh: '长征', scene: null, hp: 1, rate: 1, boss: 'warlord', elites: ['brute', 'spitter', 'charger', 'grub'], mid: { kind: 'brute', name: 'Siege Brute', zh: '攻城力士' }, mix: CLASSIC }
};
