import type { RecipeDef } from '../types';

/**
 * Recipes: defenders standing orthogonally next to each other combine. A recipe with two parts needs the two side
 * by side; three parts need a connected chain or L. Bonuses are plain modifier patches applied while the link holds.
 * To add one: add a row. The Cookbook, the link drawing and the discovery toast pick it up automatically.
 *
 * `hint` is the level where the story first nudges the player toward the recipe (a bark or tutorial line); a test
 * checks every part is owned by then. `clue` is the cryptic line the Cookbook can show before discovery.
 */
export const RECIPES: RecipeDef[] = [
  {
    id: 'toasted-pepper', parts: ['burner', 'pepper'], color: '#ff9a3c', hint: 'c1-3',
    name: { en: 'Toasted Pepper', zh: '炙烤胡椒' },
    desc: { en: 'Pepper Mill next to a Burner: peppercorns set enemies alight.', zh: '研磨瓶挨着炉头：胡椒粒会把敌人点着。' },
    clue: { en: 'Warm the grinder and the corns come out smoking.', zh: '把研磨瓶焐热，磨出来的胡椒都冒着烟。' },
    bonuses: [{ target: 'pepper', mods: { effects: [{ kind: 'burn', duration: 3, power: 6 }] } }]
  },
  {
    id: 'fresh-bread', parts: ['burner', 'dough'], color: '#f2c98a', hint: 'c1-3',
    name: { en: 'Fresh Bread', zh: '新鲜面包' },
    desc: { en: 'Dough next to a Burner bakes a crust: much tougher, rises back faster.', zh: '面团挨着炉头烤出硬壳：更结实，发回来也更快。' },
    clue: { en: 'Dough by the fire grows a crust.', zh: '面团挨着火，就会长出一层硬壳。' },
    bonuses: [{ target: 'dough', mods: { hp: 1.5, regen: 1.6 } }]
  },
  {
    id: 'egg-noodles', parts: ['egg', 'dough'], color: '#ffe27a', hint: 'c1-3',
    name: { en: 'Egg Noodles', zh: '鸡蛋面' },
    desc: { en: 'Egg Lobber next to Dough: bigger splash, and the splash tangles enemies.', zh: '抛蛋手挨着面团：溅射范围更大，还会缠住敌人。' },
    clue: { en: 'Egg and flour, side by side, make something long and tangly.', zh: '蛋和面挨在一起，会变出又长又缠的东西。' },
    bonuses: [{ target: 'egg', mods: { splash: 1.4, effects: [{ kind: 'slow', duration: 2, power: 0.6 }] } }]
  },
  {
    id: 'pepper-ice', parts: ['pepper', 'ice'], color: '#9fe3ff', hint: 'c1-4',
    name: { en: 'Cracked Pepper Ice', zh: '胡椒碎冰' },
    desc: { en: 'Pepper Mill next to an Ice Cube: both fire faster.', zh: '研磨瓶挨着冰块：两个都射得更快。' },
    clue: { en: 'Cold and spice keep each other awake.', zh: '冷和辣，互相提神。' },
    bonuses: [{ target: 'pepper', mods: { rate: 1.25 } }, { target: 'ice', mods: { rate: 1.25 } }]
  },
  {
    id: 'salsa', parts: ['onion', 'pepper'], color: '#ff6f61', hint: 'c1-5',
    name: { en: 'Salsa', zh: '莎莎酱' },
    desc: { en: 'Onion next to a Pepper Mill: the Onion recharges faster and its gas stings.', zh: '洋葱挨着研磨瓶：洋葱蓄力更快，气体还会刺痛敌人。' },
    clue: { en: 'Tears and pepper: a dip with a temper.', zh: '眼泪加胡椒：一碗脾气很冲的蘸酱。' },
    bonuses: [{ target: 'onion', mods: { rate: 1.4, damage: 4 } }]
  },
  {
    id: 'meringue', parts: ['whisk', 'egg'], color: '#fff3d6', hint: 'c1-5',
    name: { en: 'Meringue', zh: '蛋白霜' },
    desc: { en: 'Whisk next to an Egg Lobber: the Whisk whips foam that slows what it hits.', zh: '打蛋器挨着抛蛋手：打出的泡沫会让敌人变慢。' },
    clue: { en: 'Whip an egg long enough and it turns to cloud.', zh: '把蛋打得够久，它就会变成云。' },
    bonuses: [{ target: 'whisk', mods: { effects: [{ kind: 'slow', duration: 1.5, power: 0.6 }] } }, { target: 'egg', mods: { rate: 1.15 } }]
  },
  {
    id: 'birthday-sponge', parts: ['egg', 'dough', 'burner'], color: '#ff9fc6', special: 'restoreSlice', hint: 'c1-5',
    name: { en: 'Birthday Sponge', zh: '生日海绵蛋糕' },
    desc: { en: 'Egg, Dough and Burner in a row: once per night, bakes back one lost slice of cake.', zh: '鸡蛋、面团、炉头连在一起：每晚一次，烤回一块失去的蛋糕。' },
    clue: { en: 'Egg, flour and fire, all touching: what else would a birthday need?', zh: '蛋、面、火，全都挨着：过生日还缺什么呢？' },
    bonuses: [{ target: 'all', mods: { hp: 1.15 } }]
  },
  // ---- Chapter 2 onward ----
  {
    id: 'iced-tea', parts: ['kettle', 'ice'], color: '#c7e8d8', hint: 'c2-1',
    name: { en: 'Iced Tea', zh: '冰红茶' },
    desc: { en: 'Kettle next to an Ice Cube: the steam comes out cold and slows everyone it touches; ice chips punch through one extra enemy.', zh: '水壶挨着冰块：喷出的蒸汽是冷的，碰到谁谁变慢；冰块的子弹还能多穿透一个敌人。' },
    clue: { en: 'Something hot, something cold, poured together.', zh: '一热一冷，倒在一起。' },
    bonuses: [{ target: 'kettle', mods: { effects: [{ kind: 'slow', duration: 2, power: 0.55 }] } }, { target: 'ice', mods: { pierce: 1 } }]
  },
  {
    id: 'steamed-buns', parts: ['kettle', 'dough'], color: '#f6ead2', hint: 'c2-2',
    name: { en: 'Steamed Buns', zh: '蒸包子' },
    desc: { en: 'Kettle next to Dough: the dough is piping hot, so whoever bites it gets scalded; the steam reaches further.', zh: '水壶挨着面团：面团烫得冒气，谁咬谁被烫；蒸汽也喷得更远。' },
    clue: { en: 'Dough over steam: careful, it bites back.', zh: '面团放在蒸汽上：小心，它会烫嘴。' },
    bonuses: [{ target: 'dough', mods: { thorns: 12 } }, { target: 'kettle', mods: { range: 0.6 } }]
  },
  {
    id: 'honey-garlic', parts: ['honey', 'garlic'], color: '#e6c25a', hint: 'c2-4',
    name: { en: 'Honey Garlic Glaze', zh: '蜜汁蒜香' },
    desc: { en: 'Honey Jar next to Garlic: the jar holds four more enemies, and the stink cloud turns sticky.', zh: '蜂蜜罐挨着大蒜：罐子能多粘住四个敌人，臭气也变得黏糊糊的。' },
    clue: { en: 'Sweet and stinky: a glaze that will not let go.', zh: '又甜又臭：一层甩不掉的酱汁。' },
    bonuses: [{ target: 'honey', mods: { uses: 4 } }, { target: 'garlic', mods: { effects: [{ kind: 'sticky', duration: 2, power: 0.4 }] } }]
  },
  {
    id: 'chili-oil', parts: ['chili', 'garlic'], color: '#e8452c', hint: 'c2-5',
    name: { en: 'Chili Oil', zh: '蒜香辣油' },
    desc: { en: 'Chili next to Garlic: when the Chili goes off, the fire spills into the lanes on either side.', zh: '小辣椒挨着大蒜：辣椒点着的时候，火会烧到两边的路上。' },
    clue: { en: 'Garlic in hot oil: it never stays in one pan.', zh: '蒜下热油：从来不会只待在一口锅里。' },
    bonuses: [{ target: 'chili', mods: { spread: 1, damage: 1.2 } }]
  },
  {
    id: 'honey-toast', parts: ['toaster', 'honey'], color: '#f0b54a', hint: 'c3-1',
    name: { en: 'Honey Toast', zh: '蜂蜜吐司' },
    desc: { en: 'Toaster next to a Honey Jar: the slices come out glazed, sticking whatever they hit and knocking it further.', zh: '烤面包机挨着蜂蜜罐：吐司抹上了蜜，打中谁就粘住谁，还撞得更远。' },
    clue: { en: 'What goes on a slice the moment it pops?', zh: '吐司一弹出来，第一时间该抹什么？' },
    bonuses: [{ target: 'toaster', mods: { knockback: 0.3, effects: [{ kind: 'sticky', duration: 1.5, power: 0.45 }] } }]
  },
  {
    id: 'salted-caramel', parts: ['salt', 'honey', 'burner'], color: '#c98a4a', hint: 'c4-2',
    name: { en: 'Salted Caramel', zh: '海盐焦糖' },
    desc: { en: 'Salt, Honey and a Burner together: the honey cooks into hot caramel that burns what it holds, and the Salt shakes faster.', zh: '盐、蜂蜜和炉头连在一起：蜂蜜熬成滚烫的焦糖，粘住谁就烫谁，盐罐也撒得更快。' },
    clue: { en: 'Melt something sweet over a flame, then season it.', zh: '把甜的放在火上熬化，再撒点什么。' },
    bonuses: [{ target: 'honey', mods: { uses: 3, effects: [{ kind: 'burn', duration: 3, power: 10 }] } }, { target: 'salt', mods: { rate: 1.3 } }]
  },
  {
    id: 'fried-rice', parts: ['ricecooker', 'egg', 'burner'], color: '#f5d36b', hint: 'c4-4',
    name: { en: 'Egg Fried Rice', zh: '蛋炒饭' },
    desc: { en: 'Rice Cooker, Egg Lobber and a Burner together: eggs land sizzling and hit harder; the cooker heals half again as much.', zh: '电饭煲、抛蛋手和炉头连在一起：鸡蛋落地滋滋作响，伤害更高；电饭煲的治疗也多一半。' },
    clue: { en: 'Yesterday\'s rice, an egg, a hot pan. Pip approves.', zh: '隔夜饭、一个蛋、一口热锅。团团表示赞同。' },
    bonuses: [{ target: 'egg', mods: { damage: 1.25, effects: [{ kind: 'burn', duration: 2, power: 8 }] } }, { target: 'ricecooker', mods: { damage: 1.5 } }]
  },
  {
    id: 'sunday-stew', parts: ['ricecooker', 'onion', 'kettle'], color: '#d98b5f', special: 'feast', hint: 'c5-4',
    name: { en: 'Granny\'s Sunday Stew', zh: '奶奶的星期天炖菜' },
    desc: { en: 'Rice Cooker, Onion and Kettle together: once per night, everyone is fed: healed, thawed, and 100 Heat besides. While it stands, all three are a little stronger.', zh: '电饭煲、洋葱和水壶连在一起：每晚一次，大家都吃饱了：回满血、解冻，再送 100 火候。只要它们还挨着，三个都更强一点。' },
    clue: { en: 'Something warm, something that makes you cry, and something that bubbles. Stir it like you mean it.', zh: '暖暖的、让人流泪的、咕嘟冒泡的。搅的时候要用心。' },
    bonuses: [{ target: 'all', mods: { hp: 1.1 } }, { target: 'onion', mods: { rate: 1.2 } }, { target: 'kettle', mods: { damage: 1.2 } }]
  }
];
