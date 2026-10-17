// Ashfall level III: below the broken storm crown, a final descent through a flooded railyard,
// a desert of fused glass and a burnt cathedral, ending with the Warden reforged.
// Same data model as level.js; FLOOR / VIEW_W / VIEW_H are shared.

import { FLOOR } from './level.js';
const g = (x1, x2, top, kind = 'ground') => ({ x: x1, y: top, w: x2 - x1, h: 700 - top, kind });
const box = (x1, x2, top, bottom, kind) => ({ x: x1, y: top, w: x2 - x1, h: bottom - top, kind });
const plank = (x1, x2, top, kind = 'oneway') => ({ x: x1, y: top, w: x2 - x1, h: 14, kind, oneway: true });

export const WORLD_END = 13000;
export const ARENA = { left: 12000, right: 13000, trigger: 12180 };

export const ZONES = [
  { id: 'railyard', name: 'THE DROWNED RAILYARD', sub: '沉 没 车 场', start: 0, end: 4200, chapter: 'VII', pit: 'flood', fog: '120,150,165', grade: '#1e3a4e', ambient: 0.52 },
  { id: 'wastes', name: 'THE GLASS WASTES', sub: '琉 璃 荒 原', start: 4200, end: 8400, chapter: 'VIII', pit: 'glass', fog: '150,120,170', grade: '#4a2a5a', ambient: 0.44 },
  { id: 'cathedral', name: 'THE ASH CATHEDRAL', sub: '灰 烬 圣 殿', start: 8400, end: 13000, chapter: 'IX', pit: 'abyss', fog: '150,140,120', grade: '#4a3a24', ambient: 0.5, hotAsh: true }
];

export function zoneIndexAt(x) {
  for (let i = ZONES.length - 1; i >= 0; i--) if (x >= ZONES[i].start) return i;
  return 0;
}

// Flat pits stay within level I's 160px; drops off raised steps run wider, and the two widest
// chasms carry a single ledge to land on halfway across.
// Ambush floors stay flat: walkers cannot climb blocks, so a block inside a sealed ambush could strand one.
export function buildSolids() {
  return [
    // VII · Drowned Railyard
    g(-400, 1100, FLOOR), box(700, 880, 382, FLOOR, 'boxcar'),
    g(1260, 2200, FLOOR), plank(1500, 1700, 362, 'girder'), plank(1780, 1980, 296, 'girder'), box(2010, 2190, 382, FLOOR, 'boxcar'),
    g(2200, 2500, 404, 'step'),
    g(2680, 3500, FLOOR),
    plank(3600, 3720, 400, 'girder'),
    g(3820, 4200, FLOOR),
    // VIII · Glass Wastes
    g(4200, 5200, FLOOR), box(4700, 4780, 396, FLOOR, 'crystal'),
    g(5200, 5700, 396, 'step'), g(5700, 5900, 342, 'step'),
    g(6080, 7000, FLOOR), plank(6300, 6520, 350, 'shard'), plank(6600, 6800, 280, 'shard'),
    g(7160, 8400, FLOOR),
    // IX · Ash Cathedral
    g(8400, 9300, FLOOR), plank(8700, 8900, 350, 'ledge'),
    g(9460, 10200, FLOOR), box(9800, 9880, 380, FLOOR, 'pillar'),
    g(10200, 10500, 400, 'step'), plank(10620, 10740, 384, 'ledge'),
    g(10850, 13400, FLOOR)
  ];
}

export const PITS = [
  { x: 1100, w: 160, zone: 0 }, { x: 2500, w: 180, zone: 0 }, { x: 3500, w: 320, zone: 0 },
  { x: 5900, w: 180, zone: 1 }, { x: 7000, w: 160, zone: 1 },
  { x: 9300, w: 160, zone: 2 }, { x: 10500, w: 350, zone: 2 }
];

export const ENEMIES = [
  ['husk', 600], ['hound', 960], ['husk', 1420], ['drone', 1650], ['husk', 1900], ['hound', 2100], ['brute', 2350], ['husk', 2840], ['husk', 3920], ['hound', 4060],
  ['drone', 4500], ['husk', 4620], ['brute', 5000], ['hound', 5400], ['drone', 5600], ['husk', 5800], ['husk', 6200], ['hound', 6420], ['drone', 6700], ['brute', 6900], ['husk', 7520],
  ['husk', 8600], ['drone', 8820], ['brute', 9100], ['hound', 9600], ['husk', 9720], ['drone', 9950], ['husk', 10100], ['brute', 10350], ['drone', 10700], ['husk', 11000]
];

export const MEDKITS = [[1880, 276], [3660, 380], [5800, 322], [6700, 260], [8100, 430], [8800, 330], [10680, 364], [11860, 430]];

export const CHECKPOINTS = [60, 4260, 6120, 8460, 11900];

// tint picks the bloom colour (default warm); kinds without fire never shed embers.
export const LIGHTS = [
  { x: 260, y: 300, r: 250, c: [170, 220, 255], f: 0.2, kind: 'signal', tint: 'cool' },
  { x: 520, y: 432, r: 300, c: [255, 140, 60], f: 0.5, kind: 'campfire' },
  { x: 1240, y: 300, r: 230, c: [170, 220, 255], f: 0.2, kind: 'signal', tint: 'cool' },
  { x: 2040, y: 300, r: 240, c: [170, 220, 255], f: 0.2, kind: 'signal', tint: 'cool' },
  { x: 2380, y: 360, r: 260, c: [255, 130, 50], f: 0.55, kind: 'barrel' },
  { x: 2900, y: 300, r: 240, c: [170, 220, 255], f: 0.2, kind: 'signal', tint: 'cool' },
  { x: 3400, y: 420, r: 260, c: [255, 130, 50], f: 0.55, kind: 'barrel' },
  { x: 4000, y: 300, r: 240, c: [170, 220, 255], f: 0.2, kind: 'signal', tint: 'cool' },
  { x: 4420, y: 400, r: 280, c: [200, 140, 255], f: 0.3, kind: 'crystal', tint: 'violet' },
  { x: 5080, y: 400, r: 280, c: [200, 140, 255], f: 0.3, kind: 'crystal', tint: 'violet' },
  { x: 5540, y: 380, r: 260, c: [255, 140, 60], f: 0.5, kind: 'campfire' },
  { x: 6150, y: 400, r: 280, c: [200, 140, 255], f: 0.3, kind: 'crystal', tint: 'violet' },
  { x: 6990, y: 560, r: 280, c: [200, 140, 255], f: 0.35, kind: 'glass', tint: 'violet' },
  { x: 7380, y: 400, r: 280, c: [200, 140, 255], f: 0.3, kind: 'crystal', tint: 'violet' },
  { x: 8020, y: 432, r: 300, c: [255, 140, 60], f: 0.5, kind: 'campfire' },
  { x: 8560, y: 380, r: 260, c: [255, 190, 110], f: 0.35, kind: 'candles' },
  { x: 9100, y: 250, r: 320, c: [255, 210, 160], f: 0.15, kind: 'window' },
  { x: 9560, y: 380, r: 260, c: [255, 190, 110], f: 0.35, kind: 'candles' },
  { x: 10120, y: 250, r: 320, c: [255, 210, 160], f: 0.15, kind: 'window' },
  { x: 10960, y: 380, r: 260, c: [255, 190, 110], f: 0.35, kind: 'candles' },
  { x: 11500, y: 250, r: 320, c: [255, 210, 160], f: 0.15, kind: 'window' },
  { x: 12060, y: 360, r: 300, c: [140, 200, 255], f: 0.5, kind: 'bluefire', tint: 'cool' },
  { x: 12500, y: 220, r: 380, c: [255, 210, 160], f: 0.15, kind: 'window' },
  { x: 12940, y: 360, r: 300, c: [140, 200, 255], f: 0.5, kind: 'bluefire', tint: 'cool' }
];

export const PROPS = [
  ['tower', 140], ['ties', 420], ['wagon', 1000], ['ties', 1600], ['tower', 2620], ['wagon', 2940], ['ties', 3300], ['tower', 3880],
  ['spire', 4380], ['bones', 4900], ['spire', 5320], ['spire', 6260], ['bones', 6560], ['spire', 7260], ['bones', 7840], ['spire', 8260],
  ['statue', 8520], ['pew', 8980], ['statue', 9640], ['pew', 10000], ['statue', 10360], ['pew', 11100], ['statue', 11700]
];

// Level III ambushes field four-to-five foes and always mix in something that flies.
export const AMBUSHES = [
  { x: 3020, l: 2700, r: 3480, wave: [['hound', 2720], ['husk', 3460], ['husk', 2740], ['drone', 3440]] },
  { x: 7740, l: 7240, r: 8300, wave: [['brute', 8260], ['hound', 7260], ['drone', 7300], ['husk', 8280]] },
  { x: 11260, l: 10900, r: 11820, wave: [['brute', 11800], ['drone', 10920], ['drone', 11790], ['husk', 10930], ['hound', 11780]] }
];

