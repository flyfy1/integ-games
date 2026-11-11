import type { MetaUpgradeDef } from '../types';

/**
 * Permanent upgrades bought with crumbs in the shop. `perLevel` patches multiply per level owned
 * (two levels of damage 1.08 = 1.1664). To add one: add a row; the shop lists it and the sim applies it.
 */
const seasoning = (defender: string, en: string, zh: string, descEn: string, descZh: string, perLevel: MetaUpgradeDef['perLevel']): MetaUpgradeDef => ({
  id: `season-${defender}`, defender, costs: [40, 80, 140], perLevel,
  name: { en, zh }, desc: { en: descEn, zh: descZh }
});

export const META_UPGRADES: MetaUpgradeDef[] = [
  {
    id: 'pilot-light', defender: null, costs: [60, 120, 240], startHeat: 25,
    name: { en: 'Pilot Light', zh: '长明火' },
    desc: { en: '+25 starting Heat per level.', zh: '每级让开局火候 +25。' }
  },
  {
    id: 'thick-frosting', defender: null, costs: [220, 520], slices: 1,
    name: { en: 'Thick Frosting', zh: '厚厚的奶油' },
    desc: { en: 'The cake starts every night with one extra slice per level.', zh: '每级让蛋糕每晚多一块。' }
  },
  {
    id: 'good-spatula', defender: null, costs: [50, 100], refund: 0.15,
    name: { en: 'Good Spatula', zh: '顺手的锅铲' },
    desc: { en: 'Removing a defender refunds 15% more Heat per level.', zh: '每级让铲走守卫时多返还 15% 火候。' }
  },
  {
    id: 'family-cookbook', defender: null, costs: [150, 300], recipeHeat: 15,
    name: { en: 'Family Cookbook', zh: '家传菜谱' },
    desc: { en: 'The first time each recipe forms in a night, gain 15 Heat per level.', zh: '每晚每道食谱第一次做成时，每级多得 15 火候。' }
  },
  {
    id: 'cast-iron', defender: null, costs: [200, 360, 560], perLevel: { hp: 1.06 },
    name: { en: 'Cast Iron', zh: '铸铁底子' },
    desc: { en: 'Every defender has 6% more health per level.', zh: '每级让所有守卫生命 +6%。' }
  },
  seasoning('burner', 'Blue Flame', '蓝焰', 'Burners make 8% more Heat per level.', '每级让炉头多产 8% 火候。', { gen: 1.08 }),
  seasoning('pepper', 'Coarse Grind', '粗磨', 'Pepper Mill deals 8% more damage per level.', '每级让研磨瓶伤害 +8%。', { damage: 1.08 }),
  seasoning('dough', 'Long Proof', '慢发酵', 'Dough has 10% more health per level.', '每级让面团生命 +10%。', { hp: 1.1 }),
  seasoning('ice', 'Deep Freeze', '深度冷冻', 'Ice Cube deals 8% more damage per level.', '每级让冰块伤害 +8%。', { damage: 1.08 }),
  seasoning('egg', 'Free Range', '散养蛋', 'Egg Lobber deals 8% more damage per level.', '每级让抛蛋手伤害 +8%。', { damage: 1.08 }),
  seasoning('chili', 'Extra Hot', '特辣', 'Chili deals 10% more damage per level.', '每级让小辣椒伤害 +10%。', { damage: 1.1 }),
  seasoning('onion', 'Sharp Layers', '层层辛辣', 'Onion recharges 8% faster per level.', '每级让洋葱蓄力快 8%。', { rate: 1.08 }),
  seasoning('whisk', 'Steel Wires', '钢丝', 'Whisk deals 8% more damage per level.', '每级让打蛋器伤害 +8%。', { damage: 1.08 }),
  seasoning('kettle', 'Rolling Boil', '大滚开', 'Kettle steam deals 8% more damage per level.', '每级让水壶蒸汽伤害 +8%。', { damage: 1.08 }),
  seasoning('honey', 'Wildflower Honey', '百花蜜', 'Honey Jar holds one more enemy per level.', '每级让蜂蜜罐多粘住一个敌人。', { uses: 1 }),
  seasoning('garlic', 'Aged Garlic', '陈年老蒜', 'Garlic puffs its stink 8% more often per level.', '每级让大蒜喷臭气快 8%。', { rate: 1.08 }),
  seasoning('toaster', 'Wide Slots', '宽槽', 'Toaster deals 8% more damage per level.', '每级让烤面包机伤害 +8%。', { damage: 1.08 }),
  seasoning('salt', 'Sea Salt', '海盐', 'Salt Shaker deals 8% more damage per level.', '每级让盐罐伤害 +8%。', { damage: 1.08 }),
  seasoning('ricecooker', 'Keep Warm', '保温档', 'Rice Cooker heals 10% more per level.', '每级让电饭煲治疗 +10%。', { damage: 1.1 })
];
