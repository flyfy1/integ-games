// Ashfall level layout: one continuous descent through three areas into the boss arena.

export const VIEW_W = 960;
export const VIEW_H = 540;
export const FLOOR = 450;
export const WORLD_END = 12000;
export const ARENA = { left: 11000, right: 12000, trigger: 11180 };

export const ZONES = [
  { id: 'woods', name: 'THE DEAD WOODS', sub: '阴 暗 死 林', start: 0, end: 3900, chapter: 'I' },
  { id: 'quarter', name: 'THE HOLLOW QUARTER', sub: '废 弃 街 区', start: 3900, end: 7900, chapter: 'II' },
  { id: 'foundry', name: 'THE IRON FOUNDRY', sub: '机 械 工 厂', start: 7900, end: 12000, chapter: 'III' }
];

export function zoneIndexAt(x) {
  for (let i = ZONES.length - 1; i >= 0; i--) if (x >= ZONES[i].start) return i;
  return 0;
}

// Solid terrain. kind: ground | step | car | crate | oneway. Ground blocks extend below the screen.
const g = (x1, x2, top, kind = 'ground') => ({ x: x1, y: top, w: x2 - x1, h: 700 - top, kind });
const box = (x1, x2, top, bottom, kind) => ({ x: x1, y: top, w: x2 - x1, h: bottom - top, kind });
const plank = (x1, x2, top, kind = 'oneway') => ({ x: x1, y: top, w: x2 - x1, h: 14, kind, oneway: true });

export function buildSolids() {
  return [
    // I · Dead Woods
    g(-400, 1250, FLOOR), g(1390, 2350, FLOOR), plank(1640, 1830, 362), plank(1890, 2070, 290),
    g(2350, 2650, 410, 'step'), g(2800, 3900, FLOOR),
    // II · Hollow Quarter
    g(3900, 4900, FLOOR), box(4360, 4490, 402, FLOOR, 'car'), g(4900, 5500, 400, 'step'),
    g(5660, 6600, FLOOR), plank(5880, 6080, 335, 'awning'), box(6300, 6380, 386, FLOOR, 'crate'), box(6380, 6440, 418, FLOOR, 'crate'),
    g(6600, 7900, FLOOR),
    // III · Iron Foundry
    g(7900, 8800, FLOOR), box(8300, 8380, 392, FLOOR, 'crate'),
    g(8960, 9700, FLOOR), plank(9140, 9460, 330, 'catwalk'), g(9700, 10000, 408, 'step'),
    g(10140, 12400, FLOOR)
  ];
}

// Pits are the gaps between ground blocks; their floor art (water, rubble, slag) is chosen per area.
export const PITS = [
  { x: 1250, w: 140, zone: 0 }, { x: 2650, w: 150, zone: 0 },
  { x: 5500, w: 160, zone: 1 },
  { x: 8800, w: 160, zone: 2 }, { x: 10000, w: 140, zone: 2 }
];

export const ENEMIES = [
  ['husk', 820], ['husk', 1520], ['hound', 1700], ['husk', 2180], ['husk', 2500], ['hound', 3100], ['husk', 3320], ['hound', 3560],
  ['husk', 4200], ['hound', 4640], ['husk', 4760], ['brute', 5250], ['hound', 5800], ['husk', 6160], ['husk', 6240], ['brute', 7020], ['hound', 7320], ['husk', 7560],
  ['drone', 8200], ['husk', 8420], ['drone', 8620], ['hound', 9100], ['husk', 9500], ['drone', 9560], ['brute', 10320], ['drone', 10560], ['husk', 10700]
];

export const MEDKITS = [[1980, 270], [3720, 430], [5980, 315], [7720, 430], [9300, 310], [10860, 430]];

export const CHECKPOINTS = [60, 3960, 7960, 10900];

// World lights: warm pools that cut through the darkness pass.
export const LIGHTS = [
  { x: 300, y: 372, r: 230, c: [255, 170, 90], f: 0.25, kind: 'lantern' },
  { x: 560, y: 432, r: 330, c: [255, 140, 60], f: 0.5, kind: 'campfire' },
  { x: 1120, y: 372, r: 210, c: [255, 170, 90], f: 0.25, kind: 'lantern' },
  { x: 2020, y: 372, r: 220, c: [255, 170, 90], f: 0.3, kind: 'lantern' },
  { x: 2980, y: 372, r: 230, c: [255, 170, 90], f: 0.25, kind: 'lantern' },
  { x: 3640, y: 432, r: 300, c: [255, 140, 60], f: 0.5, kind: 'campfire' },
  { x: 4120, y: 420, r: 260, c: [255, 130, 50], f: 0.55, kind: 'barrel' },
  { x: 4560, y: 300, r: 260, c: [255, 196, 130], f: 0.9, kind: 'lamp' },
  { x: 5160, y: 370, r: 260, c: [255, 130, 50], f: 0.55, kind: 'barrel' },
  { x: 6220, y: 420, r: 260, c: [255, 130, 50], f: 0.55, kind: 'barrel' },
  { x: 6900, y: 300, r: 260, c: [255, 196, 130], f: 0.9, kind: 'lamp' },
  { x: 7380, y: 420, r: 260, c: [255, 130, 50], f: 0.55, kind: 'barrel' },
  { x: 8120, y: 400, r: 340, c: [255, 110, 40], f: 0.3, kind: 'furnace' },
  { x: 8880, y: 560, r: 300, c: [255, 90, 30], f: 0.35, kind: 'slag' },
  { x: 9600, y: 400, r: 320, c: [255, 110, 40], f: 0.3, kind: 'furnace' },
  { x: 10070, y: 560, r: 280, c: [255, 90, 30], f: 0.35, kind: 'slag' },
  { x: 10520, y: 400, r: 300, c: [255, 110, 40], f: 0.3, kind: 'furnace' },
  { x: 11060, y: 360, r: 300, c: [255, 120, 50], f: 0.5, kind: 'brazier' },
  { x: 11940, y: 360, r: 300, c: [255, 120, 50], f: 0.5, kind: 'brazier' }
];

// Decorative props drawn on the playfield plane (behind actors).
export const PROPS = [
  ['tree', 120], ['grave', 420], ['tree', 700], ['tree', 980], ['sign', 1180], ['tree', 1500], ['grave', 1580], ['tree', 2240], ['tree', 2900], ['grave', 3200], ['tree', 3420], ['sign', 3820],
  ['pole', 4020], ['wreck', 4700], ['hydrant', 5060], ['pole', 5380], ['rubble', 5760], ['pole', 6500], ['wreck', 7150], ['rubble', 7480], ['sign2', 7840],
  ['pipe', 8040], ['vat', 8560], ['pipe', 9040], ['gear', 9250], ['vat', 9860], ['pipe', 10240], ['gear', 10420], ['pipe', 10720]
];

// Gate-locked ambushes: crossing x seals [l, r] behind ember curtains until the wave is ash.
export const AMBUSHES = [
  { x: 3440, l: 3190, r: 3860, wave: [['husk', 3210], ['husk', 3840], ['hound', 3830]] },
  { x: 7060, l: 6700, r: 7400, wave: [['hound', 6720], ['husk', 7380], ['husk', 6740]] },
  { x: 10440, l: 10190, r: 10840, wave: [['drone', 10220], ['husk', 10820], ['hound', 10810]] }
];
