// The floodworks climb from the fallen Warden to the storm engine.
// 70px rises leave ~55px of headroom under the unchanged held-jump apex.
export { VIEW_W, VIEW_H, FLOOR } from './level.js';
export const WORLD_END = 12000;
export const RISES = [
  400, 650, 900, 1150, 1400, 1650, 1900, 2150, 2400, 2650, 2900,
  4000, 4250, 4500, 4750, 5000, 5250, 5500, 5750, 6000, 6250, 6500,
  7900, 8150, 8400, 8650, 8900, 9150, 9400, 9650, 9900, 10900
];
export const floorAt = (x) => 450 - 70 * RISES.filter((edge) => x >= edge).length;
export const ARENA = { left: 11000, right: 12000, trigger: 11180, floor: floorAt(11200) };
export const FLOOD = { speeds: [22, 28, 34], baseline: 150, startGrace: 5, checkpointGrace: 3, exitGrace: 5, damage: 60, warning: 180, lockOffset: 18 };
export const ZONES = [
  { id: 'aqueduct', name: 'THE DROWNED AQUEDUCT', sub: '沉 没 水 道', start: 0, end: 3900, chapter: 'IV', music: 'woods', palette: ['#071c21', '#28575a', '#73dbc4'], fog: '90,180,166' },
  { id: 'archive', name: 'THE GLASS ARCHIVE', sub: '琉 璃 秘 库', start: 3900, end: 7900, chapter: 'V', music: 'quarter', palette: ['#171027', '#554363', '#d3a9ef'], fog: '164,124,190' },
  { id: 'crown', name: 'THE STORM CROWN', sub: '风 暴 王 冠', start: 7900, end: 12000, chapter: 'VI', music: 'foundry', palette: ['#0d182c', '#3a5473', '#a8dfff'], fog: '116,156,205' }
];
export function zoneIndexAt(x) {
  for (let i = ZONES.length - 1; i >= 0; i--) if (x >= ZONES[i].start) return i;
  return 0;
}
// Broken spans retain generous intermediate landings, never a max-range leap.
export const PITS = [
  { x: 1510, w: 80, zone: 0 }, { x: 2010, w: 60, zone: 0 }, { x: 2130, w: 20, zone: 0 },
  { x: 5620, w: 80, zone: 1 }, { x: 9010, w: 80, zone: 2 }
];
export function buildSolids() {
  const edges = [-400, ...RISES, 12400], result = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const a = edges[i], b = edges[i + 1], y = floorAt(a);
    let cursor = a;
    for (const pit of PITS.filter((p) => p.x >= a && p.x < b)) {
      result.push({ x: cursor, y, w: pit.x - cursor, h: 700 - y, kind: 'step' });
      cursor = pit.x + pit.w;
    }
    result.push({ x: cursor, y, w: b - cursor, h: 700 - y, kind: 'step' });
  }
  // A visible catwalk bridges the middle of the aqueduct's broken span.
  const mid = result.find((s) => s.x === 2070);
  Object.assign(mid, { kind: 'catwalk', oneway: true, h: 14 });
  return result;
}
export const ENEMIES = [
  ['husk', 660], ['hound', 920], ['husk', 1450], ['drone', 1850], ['hound', 2210], ['brute', 2450], ['husk', 2940], ['hound', 3120],
  ['hound', 4200], ['husk', 4610], ['brute', 5050], ['drone', 5660], ['hound', 6000], ['husk', 6400], ['brute', 6830], ['drone', 7490],
  ['drone', 8140], ['hound', 8490], ['husk', 8950], ['drone', 9380], ['brute', 9770], ['hound', 10300], ['drone', 10670]
];
export const MEDKITS = [1990, 2960, 3810, 6130, 6570, 7770, 9310, 10920].map((x) => [x, floorAt(x) - 20]);
export const CHECKPOINTS = [60, 2830, 3970, 6590, 7970, 10200, 10900];
export const LIGHTS = [
  ...[300, 1020, 1500, 2220, 2900, 3760].map((x) => ({ x, y: floorAt(x) - 100, r: 260, c: [115, 219, 196], f: 0.2, tint: 'cool', kind: 'beacon' })),
  ...[4080, 4650, 5620, 6460, 7620].map((x) => ({ x, y: floorAt(x) - 100, r: 260, c: [211, 169, 239], f: 0.15, tint: 'violet', kind: 'beacon' })),
  ...[8100, 8600, 9060, 9600, 10320, 11060, 11940].map((x) => ({ x, y: floorAt(x) - 100, r: 290, c: [168, 223, 255], f: 0.35, tint: 'cool', kind: 'beacon' }))
];
export const PROPS = [
  ['sluice', 180], ['reed', 790], ['sluice', 1460], ['reed', 2170], ['sluice', 2870], ['reed', 3240], ['sluice', 3790],
  ['obelisk', 4090], ['shelf', 4530], ['obelisk', 5130], ['shelf', 5580], ['obelisk', 6290], ['shelf', 6720], ['obelisk', 7650],
  ['coil', 8020], ['spire', 8540], ['coil', 9050], ['spire', 9500], ['coil', 10260], ['spire', 10760], ['coil', 11050], ['coil', 11950]
];
// High refuge floors inside each seal; wave spawns leave room to react.
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
