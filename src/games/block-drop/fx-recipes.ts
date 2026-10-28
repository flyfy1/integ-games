import type { EmitOptions, FxRecipe } from '../_shared/fx';

/**
 * Block Drop feedback: each cleared row flashes locally (not the whole well) and breaks into pixel chunks in that row's
 * real cell colours. More rows means more and faster chunks, staggered bottom-up; a four-row clear adds a gold ring.
 */
export const lineClear: FxRecipe = {
  id: 'block-drop.line-clear',
  layers: [
    { kind: 'core', radius: 4, life: 200, color: '#F7F9FF', alpha: .6 },
    { kind: 'shards', count: [12, 14], speed: [90, 260], spread: 2.8, gravity: 980, drag: 1.1, size: [5, 9], shape: 'square', life: [420, 700], colors: ['#59C9FF'] }
  ],
  reduced: { kind: 'outline', radius: 1, life: 160, color: '#F7F9FF' }
};

export const quadClear: FxRecipe = {
  id: 'block-drop.quad-clear',
  layers: [{ kind: 'ring', from: 30, to: 150, width: 5, life: 360, color: '#FFDA74' }],
  reduced: 'none'
};

/** 1 row = 1×, each extra row adds 30% to chunk count (√ to speed). */
export const lineScale = (cleared: number) => 1 + (cleared - 1) * .3;

/** Dev contact-sheet samples only (scripts/fx-contact-sheet.mjs); production code never imports this. */
const row = ['#59C9FF', '#FFDA74', '#B18CFF', '#6DE0C2', '#6D91FF', '#74E28B', '#FF8195', '#59C9FF', '#B18CFF', '#FFDA74'];
export const preview: ReadonlyArray<{ recipe: FxRecipe; options: EmitOptions; label: string }> = [
  { recipe: lineClear, options: { colors: row, w: 300, h: 30, scale: lineScale(1) }, label: 'single line' },
  { recipe: lineClear, options: { colors: row, w: 300, h: 30, scale: lineScale(4) }, label: 'one row of a four-line clear' },
  { recipe: quadClear, options: {}, label: 'four-line clear ring' }
];
