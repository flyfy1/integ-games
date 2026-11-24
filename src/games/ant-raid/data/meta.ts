import type { Loc, MetaState } from '../types';

/** Nest upgrades bought with Sugar Crystals between levels. Capped ranks, refundable (respec). */
export type MetaUpgradeDef = { id: keyof MetaState; name: Loc; blurb: Loc; costs: number[] };
export const META_UPGRADES: MetaUpgradeDef[] = [
  { id: 'scent', name: { en: 'Stronger Scent', zh: '浓郁气味' }, blurb: { en: '+3 trail cells per rank.', zh: '每级路线长度 +3。' }, costs: [3, 5, 8] },
  { id: 'hatch', name: { en: 'Warm Brood Chamber', zh: '温暖育婴室' }, blurb: { en: 'Hatch 15% faster per rank.', zh: '每级孵化快 15%。' }, costs: [2, 4, 7] },
  { id: 'sugar', name: { en: 'Sugar Cellar', zh: '糖窖' }, blurb: { en: '+15 starting Sugar per rank.', zh: '每级开局糖 +15。' }, costs: [2, 4, 6] },
  { id: 'queen', name: { en: 'Queen\'s Voice', zh: '蚁后之声' }, blurb: { en: 'Queen calls recharge 12% faster per rank.', zh: '每级蚁后号令冷却快 12%。' }, costs: [3, 5, 8] },
  { id: 'slot', name: { en: 'Sixth Card', zh: '第六张牌' }, blurb: { en: 'Bring six cards instead of five.', zh: '可以带六张牌。' }, costs: [6] }
];
/** Crystals for the first time each star is earned; bosses pay double for the clear. */
export const CRYSTALS = { star: 1, boss: 2 };
