import type { EmitOptions, FxRecipe } from '../_shared/fx';

/**
 * Bubble Pop feedback: soft round puffs, no gravity, quick fade. Every popped bubble gets its own pop, rippling outward
 * from the shot by distance; detached bubbles get a gold "unhook" ring and a small splash where they leave the board.
 */
export const pop: FxRecipe = {
  id: 'bubble.pop',
  layers: [
    { kind: 'core', radius: 15, life: 90, color: '#f7f9ff', alpha: .5 },
    { kind: 'ring', from: 14, to: 27, width: 3, life: 210, color: '#70f0c2', tint: true },
    { kind: 'shards', count: [5, 6], speed: [120, 210], spread: Math.PI * 2, gravity: 0, drag: 3, size: [3, 5], shape: 'circle', life: [180, 300], colors: ['#70f0c2'] }
  ],
  reduced: { kind: 'outline', radius: 19, life: 150, color: '#70f0c2', tint: true }
};

export const stick: FxRecipe = {
  id: 'bubble.stick',
  layers: [{ kind: 'ring', from: 18, to: 23, width: 2, life: 140, color: '#70f0c2', tint: true }],
  reduced: 'none'
};

export const launch: FxRecipe = {
  id: 'bubble.launch',
  layers: [{ kind: 'shards', count: [3, 4], speed: [60, 110], spread: 1.6, gravity: 0, drag: 4, size: [4, 5], shape: 'circle', life: [140, 200], colors: ['#70f0c2'] }],
  reduced: 'none'
};

export const unhook: FxRecipe = {
  id: 'bubble.unhook',
  layers: [{ kind: 'ring', from: 18, to: 24, width: 2, life: 180, color: '#ffcb6b' }],
  reduced: { kind: 'outline', radius: 19, life: 140, color: '#ffcb6b' }
};

export const splash: FxRecipe = {
  id: 'bubble.splash',
  layers: [{ kind: 'shards', count: [5, 6], speed: [130, 210], spread: 1.4, gravity: 420, drag: 1.5, size: [4, 5], shape: 'circle', life: [260, 380], colors: ['#ffcb6b'] }],
  reduced: 'none'
};

/** Dev contact-sheet samples only (scripts/fx-contact-sheet.mjs); production code never imports this. */
export const preview: ReadonlyArray<{ recipe: FxRecipe; options: EmitOptions; label: string }> = [
  { recipe: launch, options: { dir: Math.PI / 2, colors: ['#ffcb6b'] }, label: 'launch' },
  { recipe: stick, options: { colors: ['#8b7cff'] }, label: 'stick (no match)' },
  { recipe: pop, options: { colors: ['#ff6b7a'] }, label: 'pop, 1st of group' },
  { recipe: pop, options: { colors: ['#ff6b7a'], delay: 60 }, label: 'pop, 3rd of group (delayed)' },
  { recipe: unhook, options: {}, label: 'detached bubble unhook' },
  { recipe: splash, options: { dir: -Math.PI / 2, colors: ['#8b7cff'] }, label: 'detached bubble leaves board' }
];
