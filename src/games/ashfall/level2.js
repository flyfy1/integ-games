// Beyond the foundry: the floodworks feed an archive and the storm engine above it.
// All distances use the same movement envelope as Level 1 (a held jump spans ~210px).
export { VIEW_W, VIEW_H, FLOOR } from './level.js';
export const WORLD_END = 12000;
export const ARENA = { left: 11000, right: 12000, trigger: 11180 };
export const ZONES = [
  { id: 'aqueduct', name: 'THE DROWNED AQUEDUCT', sub: '沉 没 水 道', start: 0, end: 3900, chapter: 'IV', music: 'woods', palette: ['#071c21', '#28575a', '#73dbc4'], fog: '90,180,166' },
  { id: 'archive', name: 'THE GLASS ARCHIVE', sub: '琉 璃 秘 库', start: 3900, end: 7900, chapter: 'V', music: 'quarter', palette: ['#171027', '#554363', '#d3a9ef'], fog: '164,124,190' },
  { id: 'crown', name: 'THE STORM CROWN', sub: '风 暴 王 冠', start: 7900, end: 12000, chapter: 'VI', music: 'foundry', palette: ['#0d182c', '#3a5473', '#a8dfff'], fog: '116,156,205' }
];
export function zoneIndexAt(x) {
  for (let i = ZONES.length - 1; i >= 0; i--) if (x >= ZONES[i].start) return i;
  return 0;
}
const ground = (a, b, y = 450) => ({ x: a, y, w: b - a, h: 700 - y, kind: y === 450 ? 'ground' : 'step' });
const plank = (a, b, y) => ({ x: a, y, w: b - a, h: 14, kind: 'catwalk', oneway: true });
const crate = (x, y, w = 65) => ({ x, y, w, h: 450 - y, kind: 'crate' });
export function buildSolids() {
  return [
    ground(-400, 1180), ground(1340, 2320), plank(1610, 1810, 365), plank(1890, 2090, 290),
    ground(2320, 2600, 410), ground(2770, 3900),
    ground(3900, 4780), crate(4350, 400), ground(4780, 5330, 406), ground(5500, 6540),
    plank(5730, 5940, 360), plank(6030, 6230, 285), ground(6540, 7900),
    ground(7900, 8720), crate(8300, 398), ground(8870, 9670), plank(9120, 9440, 338),
    ground(9670, 9980, 406), ground(10150, 12400)
  ];
}
export const PITS = [
  { x: 1180, w: 160, zone: 0 }, { x: 2600, w: 170, zone: 0 },
  { x: 5330, w: 170, zone: 1 }, { x: 8720, w: 150, zone: 2 }, { x: 9980, w: 170, zone: 2 }
];
export const ENEMIES = [
  ['husk', 660], ['hound', 920], ['husk', 1500], ['drone', 1850], ['hound', 2210], ['brute', 2450], ['husk', 2940], ['hound', 3120],
  ['hound', 4200], ['husk', 4610], ['brute', 5050], ['drone', 5660], ['hound', 6000], ['husk', 6400], ['brute', 6830], ['drone', 7490],
  ['drone', 8140], ['hound', 8490], ['husk', 8990], ['drone', 9380], ['brute', 9770], ['hound', 10300], ['drone', 10670]
];
export const MEDKITS = [[1990, 270], [2960, 430], [3810, 430], [6130, 265], [6570, 430], [7770, 430], [9310, 318], [10920, 430]];
export const CHECKPOINTS = [60, 2830, 3970, 6590, 7970, 10200, 10900];
export const LIGHTS = [
  ...[300, 1020, 1500, 2220, 2900, 3760].map((x) => ({ x, y: 350, r: 260, c: [115, 219, 196], f: 0.2, tint: 'cool', kind: 'beacon' })),
  ...[4080, 4650, 5620, 6460, 7620].map((x) => ({ x, y: 350, r: 260, c: [211, 169, 239], f: 0.15, tint: 'violet', kind: 'beacon' })),
  ...[8100, 8600, 9060, 9600, 10320, 11060, 11940].map((x) => ({ x, y: 350, r: 290, c: [168, 223, 255], f: 0.35, tint: 'cool', kind: 'beacon' }))
];
export const PROPS = [
  ['sluice', 180], ['reed', 790], ['sluice', 1460], ['reed', 2170], ['sluice', 2870], ['reed', 3240], ['sluice', 3790],
  ['obelisk', 4090], ['shelf', 4530], ['obelisk', 5130], ['shelf', 5580], ['obelisk', 6290], ['shelf', 6720], ['obelisk', 7650],
  ['coil', 8020], ['spire', 8540], ['coil', 9050], ['spire', 9500], ['coil', 10260], ['spire', 10760], ['coil', 11050], ['coil', 11950]
];
// Flat, uninterrupted floors inside each seal; wave spawns leave room to react.
export const AMBUSHES = [
  { x: 3410, l: 3160, r: 3730, wave: [['husk', 3190], ['hound', 3690], ['drone', 3650]] },
  { x: 7080, l: 6760, r: 7580, wave: [['hound', 6800], ['brute', 7510], ['husk', 7540], ['drone', 6820]] },
  { x: 10460, l: 10230, r: 10850, wave: [['hound', 10270], ['brute', 10800], ['drone', 10750]] }
];
export const UPGRADES = [
  { checkpoint: 2, id: 'edge', title: 'SALVAGED EDGE', sub: '刃 锋 重 铸', detail: 'Slash damage +15%' },
  { checkpoint: 4, id: 'guard', title: 'STORM MANTLE', sub: '风 暴 护 衣', detail: 'Incoming damage −15%' }
];
export const BOSS = { armor: 460, hp: 560, w: 140, h: 220, variant: 'tempest', name: 'THE TEMPEST WARDEN', unbound: 'TEMPEST · UNBOUND', sub: '风 暴 守 卫' };
