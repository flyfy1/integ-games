import type { EmitOptions, FxRecipe } from '../_shared/fx';

/**
 * Brick Pulse feedback: hard-edged square chips in the brick's own colour. A hit only chips the brick (few, fast, no
 * gravity, short); a break throws heavy shards that fall back down plus a brick-shaped white core and a thin ring.
 */
export const brickChip: FxRecipe = {
  id: 'breakout.brick-chip',
  layers: [
    { kind: 'core', radius: 7, life: 90, color: '#f7f9ff', alpha: .7 },
    { kind: 'shards', count: [4, 5], speed: [70, 140], spread: 1.3, gravity: 0, drag: 4, size: [3, 4], shape: 'square', life: [200, 280], colors: ['#8b7cff'] }
  ],
  reduced: { kind: 'outline', radius: 8, life: 120, color: '#8b7cff', tint: true }
};

export const brickShatter: FxRecipe = {
  id: 'breakout.brick-shatter',
  layers: [
    { kind: 'core', radius: 3, life: 110, color: '#f7f9ff', alpha: .85 },
    { kind: 'ring', from: 12, to: 34, width: 2, life: 220, color: '#70f0c2', tint: true },
    { kind: 'shards', count: [11, 14], speed: [70, 210], spread: 2.4, gravity: 620, drag: 1.4, size: [3, 6], shape: 'square', life: [420, 640], colors: ['#70f0c2'] }
  ],
  reduced: { kind: 'outline', radius: 2, life: 150, color: '#70f0c2', tint: true }
};

export const paddleKiss: FxRecipe = {
  id: 'breakout.paddle-kiss',
  layers: [{ kind: 'shards', count: [5, 6], speed: [60, 120], spread: 1.2, gravity: 0, drag: 4, size: [3, 3], shape: 'square', life: [180, 260], colors: ['#f7f9ff'] }],
  reduced: { kind: 'outline', radius: 10, life: 110, color: '#f7f9ff' }
};

/** Dev contact-sheet samples only (scripts/fx-contact-sheet.mjs); production code never imports this. */
export const preview: ReadonlyArray<{ recipe: FxRecipe; options: EmitOptions; label: string }> = [
  { recipe: paddleKiss, options: { dir: -Math.PI / 2 }, label: 'paddle hit' },
  { recipe: brickChip, options: { dir: Math.PI / 2, colors: ['#8b7cff'] }, label: 'tough brick hit (hp 2 -> 1)' },
  { recipe: brickShatter, options: { dir: -Math.PI / 2, colors: ['#70f0c2'], w: 36, h: 18 }, label: 'brick break, ball rising' },
  { recipe: brickShatter, options: { dir: Math.PI / 2, colors: ['#70f0c2'], w: 36, h: 18 }, label: 'brick break, ball falling' }
];
