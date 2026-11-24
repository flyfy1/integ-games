import { FILTERS, SHAPES, STAMPS } from './goods';
import type { LevelDef, Loc, PartKind } from './types';

/** Tray order (also the number keys 1..9, 0, -, =). */
export const PART_ORDER: readonly PartKind[] = ['belt', 'folder', 'vat', 'joiner', 'splitter', 'mixer', 'sorter', 'bin', 'bridge', 'wick', 'gate', 'stamp', 'bundler'];

export type PartInfo = { kind: PartKind; name: Loc; does: Loc; /** Scale degree of the note it plays (0..4 of a pentatonic scale) and octave offset. */ note: [number, number] };

export const PARTS: Record<PartKind, PartInfo> = {
  belt: { kind: 'belt', name: { en: 'Belt', zh: '传送带' }, does: { en: 'Carries one item per cell. Drag to draw.', zh: '每格运一件。拖动来铺。' }, note: [0, -1] },
  folder: { kind: 'folder', name: { en: 'Folder', zh: '折纸机' }, does: { en: 'Paper in, lantern shell out. The dial picks the shape.', zh: '纸进去，灯笼壳出来。拨盘选形状。' }, note: [0, 0] },
  vat: { kind: 'vat', name: { en: 'Dye vat', zh: '染缸' }, does: { en: 'Colours a shell. Feed dye into its side, or set a colour.', zh: '给灯笼壳上色。从侧面喂染料，或设定颜色。' }, note: [2, 0] },
  joiner: { kind: 'joiner', name: { en: 'Joiner', zh: '组装台' }, does: { en: 'Shell plus bamboo hoop makes a lantern. Waits for both.', zh: '灯笼壳加竹圈，组成灯笼。两样都到才开工。' }, note: [4, 0] },
  splitter: { kind: 'splitter', name: { en: 'Splitter', zh: '分流器' }, does: { en: 'Sends items left and right in turn. If one side is blocked, the other.', zh: '左右轮流分送。一边堵了就走另一边。' }, note: [1, 1] },
  mixer: { kind: 'mixer', name: { en: 'Mixer', zh: '调色盘' }, does: { en: 'Two dyes in, one mixed dye out. Red and yellow make orange.', zh: '两份染料进，一份混色出。红加黄是橙。' }, note: [3, 0] },
  sorter: { kind: 'sorter', name: { en: 'Sorter', zh: '分拣器' }, does: { en: 'Items matching its setting turn aside; the rest go straight on.', zh: '符合设定的转向，其余直行。' }, note: [2, 1] },
  bin: { kind: 'bin', name: { en: 'Bin', zh: '废纸篓' }, does: { en: 'Takes away whatever reaches it.', zh: '收走送来的一切。' }, note: [0, -2] },
  bridge: { kind: 'bridge', name: { en: 'Bridge', zh: '天桥' }, does: { en: 'Lets one belt cross another. Items go straight over.', zh: '让两条带子交叉，物件直行通过。' }, note: [3, -1] },
  wick: { kind: 'wick', name: { en: 'Wick', zh: '点灯台' }, does: { en: 'Lantern plus candle makes a lit lantern.', zh: '灯笼加蜡烛，点亮灯笼。' }, note: [4, 1] },
  gate: { kind: 'gate', name: { en: 'Gate', zh: '闸门' }, does: { en: 'Lets one item through every few beats. The dial sets how many.', zh: '每隔几拍放行一件，拨盘设定拍数。' }, note: [1, 0] },
  stamp: { kind: 'stamp', name: { en: 'Stamp', zh: '印章' }, does: { en: 'Presses a pattern onto a shell: fish, cloud or 福.', zh: '在灯笼壳上盖图案：鱼、云或福。' }, note: [3, 1] },
  bundler: { kind: 'bundler', name: { en: 'Bundler', zh: '捆扎机' }, does: { en: 'Ties three lanterns into a string, in the order they arrive.', zh: '把三盏灯笼按到达顺序串成一串。' }, note: [0, 1] }
};

export const GATE_BEATS = ['1', '2', '3', '4', '6'] as const;

/** Settings a part's dial offers on a level (empty: the part has no dial). */
export function dialOptions(kind: PartKind, level: Pick<LevelDef, 'vatColors'>): readonly string[] {
  switch (kind) {
    case 'folder': return SHAPES;
    case 'vat': return ['fed', ...(level.vatColors ?? [])];
    case 'sorter': return FILTERS;
    case 'gate': return GATE_BEATS;
    case 'stamp': return STAMPS;
    default: return [];
  }
}
export function defaultDial(kind: PartKind, level: Pick<LevelDef, 'vatColors'>): string | undefined {
  if (kind === 'vat') return level.vatColors?.[0] ?? 'fed';
  if (kind === 'gate') return '2';
  if (kind === 'stamp') return 'fu';
  if (kind === 'sorter') return 'lotus';
  return dialOptions(kind, level)[0];
}

export const DIAL_NAMES: Record<string, Loc> = {
  round: { en: 'Round', zh: '圆形' }, square: { en: 'Square', zh: '方形' }, lotus: { en: 'Lotus', zh: '莲花' },
  fed: { en: 'Fed dye', zh: '喂染料' }, plain: { en: 'Plain', zh: '素色' }, red: { en: 'Red', zh: '红' }, yellow: { en: 'Yellow', zh: '黄' }, blue: { en: 'Blue', zh: '蓝' },
  orange: { en: 'Orange', zh: '橙' }, green: { en: 'Green', zh: '绿' }, purple: { en: 'Purple', zh: '紫' }, muddy: { en: 'Muddy', zh: '浑色' },
  lit: { en: 'Lit', zh: '已点亮' }, fu: { en: '福', zh: '福' }, fish: { en: 'Fish', zh: '鱼' }, cloud: { en: 'Cloud', zh: '云' },
  paper: { en: 'Paper', zh: '纸' }, shell: { en: 'Shell', zh: '灯笼壳' }, hoop: { en: 'Hoop', zh: '竹圈' }, candle: { en: 'Candle', zh: '蜡烛' }, dye: { en: 'Dye', zh: '染料' }, lantern: { en: 'Lantern', zh: '灯笼' },
  '1': { en: 'Every beat', zh: '每拍' }, '2': { en: 'Every 2 beats', zh: '每 2 拍' }, '3': { en: 'Every 3 beats', zh: '每 3 拍' }, '4': { en: 'Every 4 beats', zh: '每 4 拍' }, '6': { en: 'Every 6 beats', zh: '每 6 拍' }
};
