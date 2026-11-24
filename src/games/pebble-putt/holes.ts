/**
 * The eighteen holes, in three gardens of six. Each hole adds exactly one idea (its caption).
 * Every hole's ace and par route are found by scripts/pebble-putt-search.ts and replayed by tests/pebble-putt*.test.ts;
 * they live in proofs.ts so re-running the search never touches the layouts.
 */
import { PROOFS } from './proofs';
import type { Hole, Loc, Pt } from './types';

type Layout = Omit<Hole, 'ace' | 'parRoute'>;

const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];

export type Garden = { id: number; name: Loc; blurb: Loc; holes: number[] };
export const GARDENS: Garden[] = [
  { id: 1, name: { en: 'Sand Garden', zh: '枯山水' }, blurb: { en: 'Raked sand at golden hour.', zh: '夕阳下的耙纹白沙。' }, holes: [1, 2, 3, 4, 5, 6] },
  { id: 2, name: { en: 'Maple Garden', zh: '红枫庭' }, blurb: { en: 'Hollows, springs and bamboo at sunset.', zh: '日落时分的洼地、弹簧竹与竹管。' }, holes: [7, 8, 9, 10, 11, 12] },
  { id: 3, name: { en: 'Moon Garden', zh: '月见庭' }, blurb: { en: 'Moss, water and lanterns after dusk.', zh: '暮色里的青苔、水池与石灯笼。' }, holes: [13, 14, 15, 16, 17, 18] }
];

const LAYOUTS: Layout[] = [
  {
    id: 1, name: { en: 'Straight', zh: '直道' }, caption: { en: 'Pull is power', zh: '拉多远，打多远' }, par: 2,
    tee: [0, 1.4], cup: [0, 8.6], bounds: [-2, 0, 2, 10],
    walls: [rect(-2, 0, 2, 10)], slopes: [],
    decor: [{ kind: 'lantern', x: -3, y: 8 }, { kind: 'maple', x: 3.4, y: 6, s: 1.1 }, { kind: 'rock', x: -2.8, y: 2.5 }]
  },
  {
    id: 2, name: { en: 'Bank', zh: '借边' }, caption: { en: 'Use the board', zh: '借边反弹' }, par: 2,
    tee: [0, 1.2], cup: [0, 9.8], bounds: [-2.5, 0, 2.5, 11],
    walls: [rect(-2.5, 0, 2.5, 11)], slopes: [],
    stones: [{ x: 0, y: 5.4, r: 0.95 }],
    decor: [{ kind: 'pine', x: -3.6, y: 7 }, { kind: 'lantern', x: 3.4, y: 2 }]
  },
  {
    id: 3, name: { en: 'Lean', zh: '斜坡' }, caption: { en: 'Aim uphill', zh: '往高处瞄' }, par: 2,
    tee: [0, 1.2], cup: [-0.4, 9.6], bounds: [-2.5, 0, 2.5, 11],
    walls: [rect(-2.5, 0, 2.5, 11)],
    slopes: [{ kind: 'plane', ax: 0.12, ay: 0 }],
    decor: [{ kind: 'maple', x: -3.5, y: 4 }, { kind: 'bamboo', x: 3.6, y: 9 }]
  },
  {
    id: 4, name: { en: 'The Gap', zh: '缺口' }, caption: { en: 'One-stroke line', zh: '一杆之路' }, par: 3,
    tee: [-1.6, 1.3], cup: [2.25, 12.95], bounds: [-3, 0, 3, 14],
    walls: [rect(-3, 0, 3, 14), [[-3, 4.6], [-1.0, 4.6]], [[-0.3, 4.6], [1.6, 4.6]], [[3, 9.4], [1.0, 9.4]], [[0.3, 9.4], [-1.6, 9.4]]],
    slopes: [{ kind: 'bump', x: 0, y: 7, sx: 9, sy: 0.7, a: 0.35 }],
    decor: [{ kind: 'rock', x: -3.8, y: 11 }, { kind: 'lantern', x: 3.8, y: 5 }, { kind: 'pine', x: -3.9, y: 3 }]
  },
  {
    id: 5, name: { en: 'Deer Scarer', zh: '惊鹿' }, caption: { en: 'Time the gate', zh: '看准竹门' }, par: 3,
    tee: [0, 1.2], cup: [-1.4, 11.6], bounds: [-2.5, 0, 2.5, 13],
    walls: [rect(-2.5, 0, 2.5, 13), [[-2.5, 6.5], [-0.7, 6.5]], [[0.7, 6.5], [2.5, 6.5]]],
    slopes: [],
    gates: [{ a: [-0.7, 6.5], b: [0.7, 6.5], period: 2, open: 0.7 }],
    decor: [{ kind: 'bamboo', x: -3.4, y: 6.5 }, { kind: 'maple', x: 3.5, y: 10 }]
  },
  {
    id: 6, name: { en: 'Koi Pond', zh: '锦鲤池' }, caption: { en: 'Water costs one', zh: '落水罚一杆' }, par: 3,
    tee: [0, 1.2], cup: [0, 11.6], bounds: [-3, 0, 3, 13],
    walls: [rect(-3, 0, 3, 13)], slopes: [],
    water: [[[-1.4, 4.4], [1.4, 4.4], [1.75, 6.5], [1.4, 8.6], [-1.4, 8.6], [-1.75, 6.5]]],
    decor: [{ kind: 'lantern', x: -3.8, y: 6.5 }, { kind: 'pine', x: 3.8, y: 3 }]
  },
  // ------------------------------------------------------------------ Maple Garden
  {
    id: 7, name: { en: 'Hollow', zh: '洼地' }, caption: { en: 'Hollows bend', zh: '洼地会拐弯' }, par: 2,
    tee: [0, 1.2], cup: [1.3, 10.6], bounds: [-2.5, 0, 2.5, 12],
    walls: [rect(-2.5, 0, 2.5, 12)],
    slopes: [{ kind: 'bump', x: 1.5, y: 6, sx: 1.4, sy: 1.7, a: -0.55 }],
    decor: [{ kind: 'maple', x: -3.6, y: 9 }, { kind: 'maple', x: 3.6, y: 4, s: 0.9 }, { kind: 'lantern', x: -3.4, y: 2.5 }]
  },
  {
    id: 8, name: { en: 'Spring Post', zh: '弹簧竹' }, caption: { en: 'Springs kick back', zh: '竹桩会弹' }, par: 3,
    tee: [0, 1.2], cup: [-0.35, 11.65], bounds: [-3, 0, 3, 13],
    walls: [rect(-3, 0, 3, 13), [[-3, 9], [0.8, 9]]], slopes: [],
    stones: [{ x: 2.1, y: 6.2, r: 0.32, spring: true }, { x: -1.4, y: 5.4, r: 0.32, spring: true }, { x: 2.3, y: 11.6, r: 0.32, spring: true }],
    decor: [{ kind: 'maple', x: 3.8, y: 9.5 }, { kind: 'bamboo', x: -3.8, y: 4 }, { kind: 'rock', x: 3.8, y: 2 }]
  },
  {
    id: 9, name: { en: 'Terrace', zh: '台地' }, caption: { en: 'Climb the step', zh: '冲上台阶' }, par: 3,
    tee: [-1.2, 1.2], cup: [1.0, 10.8], bounds: [-2.5, 0, 2.5, 13],
    walls: [rect(-2.5, 0, 2.5, 13)],
    slopes: [{ kind: 'step', x: 0, y: 7, nx: 0.5, ny: 0.866, w: 0.5, a: 0.7 }],
    stones: [{ x: 0.72, y: 9.8, r: 0.4 }],
    decor: [{ kind: 'pine', x: -3.7, y: 10 }, { kind: 'maple', x: 3.6, y: 6 }, { kind: 'lantern', x: 3.4, y: 11.5 }]
  },
  {
    id: 10, name: { en: 'Gravel', zh: '砂砾' }, caption: { en: 'Gravel slows', zh: '砂砾会减速' }, par: 3,
    tee: [0.6, 1.2], cup: [-1.2, 11], bounds: [-2.5, 0, 2.5, 13],
    walls: [rect(-2.5, 0, 2.5, 13)], slopes: [],
    zones: [{ kind: 'gravel', poly: [[-2.5, 5.2], [1.3, 5.2], [1.3, 8.8], [-2.5, 8.8]] }],
    stones: [{ x: -0.85, y: 9.7, r: 0.4 }],
    decor: [{ kind: 'rock', x: -3.5, y: 6.8, s: 1.3 }, { kind: 'maple', x: 3.7, y: 11 }]
  },
  {
    id: 11, name: { en: 'Bamboo Pipe', zh: '竹管' }, caption: { en: 'Pipes carry', zh: '竹管会送' }, par: 3,
    tee: [0, 1.2], cup: [0.45, 12.05], bounds: [-3, 0, 3, 13],
    walls: [rect(-3, 0, 3, 13), [[-1.8, 6.5], [3, 6.5]]], slopes: [],
    pipes: [{ a: [1.9, 4.4], b: [-1.7, 11], out: 15 }],
    decor: [{ kind: 'bamboo', x: 3.8, y: 5 }, { kind: 'bamboo', x: -3.8, y: 10 }, { kind: 'lantern', x: -3.6, y: 3 }]
  },
  {
    id: 12, name: { en: 'Maple Run', zh: '枫林道' }, caption: { en: 'Put it together', zh: '融会贯通' }, par: 3,
    tee: [-1.8, 1.2], cup: [-0.15, 14.45], bounds: [-3, 0, 3, 15],
    walls: [rect(-3, 0, 3, 15), [[-3, 5], [0.6, 5]], [[3, 10], [-0.6, 10]]],
    slopes: [{ kind: 'bump', x: 1.2, y: 7.5, sx: 1.4, sy: 1.3, a: -0.5 }],
    stones: [{ x: -2.3, y: 8.2, r: 0.32, spring: true }],
    pipes: [{ a: [2.3, 2.6], b: [-2.2, 12.6], out: 16 }],
    zones: [{ kind: 'gravel', poly: [[0.4, 11.4], [3, 11.4], [3, 12.4], [0.4, 12.4]] }],
    decor: [{ kind: 'maple', x: -3.8, y: 3 }, { kind: 'maple', x: 3.8, y: 8, s: 1.2 }, { kind: 'maple', x: -3.7, y: 13 }]
  },
  // ------------------------------------------------------------------ Moon Garden
  {
    id: 13, name: { en: 'Moss', zh: '青苔' }, caption: { en: 'Moss runs fast', zh: '青苔很滑' }, par: 2,
    tee: [0, 1.2], cup: [-0.8, 10.8], bounds: [-2.5, 0, 2.5, 12.5],
    walls: [rect(-2.5, 0, 2.5, 12.5)], slopes: [{ kind: 'plane', ax: 0, ay: -0.03 }],
    zones: [{ kind: 'moss', poly: [[-2.5, 4], [2.5, 4], [2.5, 9.2], [-2.5, 9.2]] }],
    stones: [{ x: -0.3, y: 6.4, r: 0.6 }, { x: -0.7, y: 9.5, r: 0.35 }],
    decor: [{ kind: 'lantern', x: -3.4, y: 6 }, { kind: 'lantern', x: 3.4, y: 10 }, { kind: 'pine', x: 3.8, y: 3 }]
  },
  {
    id: 14, name: { en: 'Twin Gates', zh: '双竹门' }, caption: { en: 'Two rhythms', zh: '两种节奏' }, par: 3,
    tee: [0, 1.2], cup: [1.25, 11.65], bounds: [-2.5, 0, 2.5, 14],
    walls: [rect(-2.5, 0, 2.5, 14), [[-2.5, 5], [-0.6, 5]], [[0.6, 5], [2.5, 5]], [[-2.5, 9.4], [0.2, 9.4]], [[1.6, 9.4], [2.5, 9.4]]],
    slopes: [],
    gates: [{ a: [-0.6, 5], b: [0.6, 5], period: 2, open: 0.8 }, { a: [1.6, 9.4], b: [0.2, 9.4], period: 2, open: 0.8, phase: 1 }],
    decor: [{ kind: 'bamboo', x: -3.5, y: 5 }, { kind: 'bamboo', x: 3.5, y: 9.4 }, { kind: 'lantern', x: 3.4, y: 2 }]
  },
  {
    id: 15, name: { en: 'Island', zh: '小岛' }, caption: { en: 'Cross the bridge', zh: '走过小桥' }, par: 3,
    tee: [0, 1.2], cup: [0.85, 11.35], bounds: [-3, 0, 3, 13.5],
    walls: [rect(-3, 0, 3, 13.5), [[-0.65, 4.2], [-0.65, 9]], [[0.65, 4.2], [0.65, 9]]],
    slopes: [{ kind: 'bump', x: 0, y: 11.2, sx: 1.3, sy: 1.0, a: 0.22 }],
    water: [[[-3, 4.2], [-0.65, 4.2], [-0.65, 9], [-3, 9]], [[0.65, 4.2], [3, 4.2], [3, 9], [0.65, 9]], [[-3, 9], [-1.6, 9], [-2.2, 11], [-3, 11.6]], [[3, 9], [2.0, 9], [2.6, 10.4], [3, 10.8]]],
    decor: [{ kind: 'lantern', x: -3.5, y: 10 }, { kind: 'pine', x: 3.8, y: 12 }, { kind: 'rock', x: -3.8, y: 2 }]
  },
  {
    id: 16, name: { en: 'Ripples', zh: '涟漪石' }, caption: { en: 'Stone field', zh: '石阵' }, par: 3,
    tee: [0, 1.2], cup: [0.2, 11.4], bounds: [-3, 0, 3, 13],
    walls: [rect(-3, 0, 3, 13)], slopes: [],
    stones: [{ x: -1.6, y: 4.6, r: 0.42 }, { x: 0.2, y: 4.2, r: 0.5 }, { x: 1.8, y: 5.0, r: 0.4 }, { x: -0.8, y: 6.9, r: 0.45 }, { x: 1.0, y: 7.2, r: 0.42 }, { x: -2.1, y: 8.6, r: 0.38 }, { x: 0.1, y: 9.3, r: 0.5 }, { x: 2.0, y: 9.2, r: 0.4 }],
    decor: [{ kind: 'lantern', x: 3.5, y: 6 }, { kind: 'pine', x: -3.8, y: 11 }]
  },
  {
    id: 17, name: { en: 'Saddle', zh: '马鞍' }, caption: { en: 'Read the saddle', zh: '看懂马鞍' }, par: 3,
    tee: [-0.4, 1.2], cup: [-0.65, 10.25], bounds: [-3, 0, 3, 13.5],
    walls: [rect(-3, 0, 3, 13.5)],
    slopes: [{ kind: 'bump', x: -1.8, y: 6.8, sx: 1.3, sy: 1.6, a: 0.55 }, { kind: 'bump', x: 1.5, y: 7.4, sx: 1.3, sy: 1.6, a: 0.55 }, { kind: 'bump', x: 0, y: 4.4, sx: 1.4, sy: 1.0, a: -0.4 }, { kind: 'bump', x: 0, y: 9.2, sx: 1.4, sy: 1.0, a: -0.4 }],
    decor: [{ kind: 'lantern', x: -3.5, y: 7 }, { kind: 'lantern', x: 3.5, y: 7 }, { kind: 'rock', x: 3.8, y: 2 }]
  },
  {
    id: 18, name: { en: 'Moon Bridge', zh: '月桥' }, caption: { en: 'Everything at once', zh: '一切合一' }, par: 4,
    tee: [-2, 1.2], cup: [-0.15, 13.05], bounds: [-3, 0, 3, 17],
    walls: [rect(-3, 0, 3, 17), [[-3, 5.4], [1.2, 5.4]], [[-0.5, 9.6], [-0.5, 12]], [[0.5, 9.6], [0.5, 12]]],
    slopes: [{ kind: 'bump', x: 1.9, y: 3, sx: 1.0, sy: 1.6, a: 0.35 }],
    water: [[[-3, 9.6], [-0.5, 9.6], [-0.5, 12], [-3, 12]], [[0.5, 9.6], [3, 9.6], [3, 12], [0.5, 12]]],
    gates: [{ a: [-0.5, 12], b: [0.5, 12], period: 2, open: 0.8 }],
    zones: [{ kind: 'moss', poly: [[-3, 5.4], [3, 5.4], [3, 9.6], [-3, 9.6]] }],
    stones: [{ x: 2.4, y: 13.6, r: 0.3, spring: true }],
    pipes: [{ a: [-2.4, 7.6], b: [2.3, 16.4], out: 234 }],
    decor: [{ kind: 'lantern', x: -3.6, y: 10.8 }, { kind: 'lantern', x: 3.6, y: 10.8 }, { kind: 'pine', x: -3.9, y: 15 }, { kind: 'bamboo', x: 3.8, y: 3 }]
  }
];

const BLANK = { ace: { angle: 90, power: 0.5 }, parRoute: [] };
export const HOLES: Hole[] = LAYOUTS.map(l => ({ ...l, ...(PROOFS[l.id] ?? BLANK) }));
export const holeById = (id: number) => HOLES.find(h => h.id === id);
export const gardenOf = (id: number) => GARDENS.find(g => g.holes.includes(id))!;
