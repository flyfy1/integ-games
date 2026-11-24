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
    slopes: [{ kind: 'plane', ax: 0.07, ay: 0 }],
    decor: [{ kind: 'maple', x: -3.5, y: 4 }, { kind: 'bamboo', x: 3.6, y: 9 }]
  },
  {
    id: 4, name: { en: 'The Gap', zh: '缺口' }, caption: { en: 'One-stroke line', zh: '一杆之路' }, par: 3,
    tee: [-1.6, 1.3], cup: [2.2, 12.9], bounds: [-3, 0, 3, 14],
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
  }
];

const BLANK = { ace: { angle: 90, power: 0.5 }, parRoute: [] };
export const HOLES: Hole[] = LAYOUTS.map(l => ({ ...l, ...(PROOFS[l.id] ?? BLANK) }));
export const holeById = (id: number) => HOLES.find(h => h.id === id);
export const gardenOf = (id: number) => GARDENS.find(g => g.holes.includes(id))!;
