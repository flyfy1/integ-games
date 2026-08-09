import type { GameCatalogEntry, GameCategory, GameModule, GameModuleCategory, GameModuleLoader } from './game-types';

type CatalogGame = GameCatalogEntry;
type CatalogRow = [string, string, GameModuleCategory, string, string, string, string, GameCategory, [string, string], [string, string, string, string]];

const catalogRows: readonly CatalogRow[] = [
  ['merge-2048', 'Merge 2048', 'puzzle', 'Slide, combine, and build your biggest number.', 'Swipe the board or use arrow keys to merge equal tiles.', '#70F0C2', 'Slide & merge', 'puzzle-strategy', ['Merge', 'Endless'], ['fruit-merge', 'hex-puzzle', 'block-drop', 'sudoku']],
  ['block-drop', 'Block Drop', 'arcade', 'Build glowing rows before the well fills.', 'Use arrows to move and rotate; swipe on the board on touch.', '#8B7CFF', 'Rotate, drop, clear', 'match-build', ['Lines', 'Endless'], ['hex-puzzle', 'fruit-merge', 'merge-2048', 'stack']],
  ['snake', 'Neon Snake', 'arcade', 'Guide a growing neon trail through a tiny starfield.', 'Swipe or use arrow keys to eat sparks; avoid your own trail.', '#70F0C2', 'Grow, turn, survive', 'quick-reflex', ['Classic', 'Endless'], ['flap', 'knife', 'breakout', 'runner']],
  ['mines', 'Pocket Mines', 'puzzle', 'A compact field of risky crystals.', 'Tap to reveal. Hold a cell or right-click to plant a flag.', '#FF6B7A', 'Reveal, flag, deduce', 'puzzle-strategy', ['Logic', 'Calm'], ['sudoku', 'memory', 'word-grid', 'hex-puzzle']],
  ['solitaire', 'Daily Solitaire', 'cards-logic', 'A calm original Klondike table with midnight cards.', 'Tap a face-up card, then a destination column or foundation.', '#FFDA74', 'Sort cards into foundations', 'puzzle-strategy', ['Cards', 'Calm'], ['sudoku', 'mines', 'merge-2048', 'memory']],
  ['sudoku', 'Calm Sudoku', 'cards-logic', 'A quiet, focused number grid with gentle feedback.', 'Select a square, then tap a number or use your keyboard.', '#70F0C2', 'Fill a valid 9×9 grid', 'puzzle-strategy', ['Numbers', 'Calm'], ['mines', 'solitaire', 'word-grid', 'merge-2048']],
  ['word-grid', 'Word Trail', 'puzzle', 'Trace hidden words through a glowing letter trail.', 'Drag through adjacent letters to spell every word.', '#B18CFF', 'Connect adjacent letters', 'puzzle-strategy', ['Words', 'Calm'], ['memory', 'sudoku', 'mines', 'bubble']],
  ['memory', 'Memory Flip', 'puzzle', 'Turn over starlit cards and find every twin.', 'Tap cards to reveal pairs. Match them all in as few turns as possible.', '#59C9FF', 'Match every pair', 'puzzle-strategy', ['Memory', 'Calm'], ['word-grid', 'mines', 'sudoku', 'stack']],
  ['stack', 'Perfect Stack', 'arcade', 'Catch a moving neon slab exactly over your tower.', 'Tap or press Space to drop each moving block.', '#FF9F6E', 'Time precise overlaps', 'match-build', ['Timing', 'Endless'], ['block-drop', 'knife', 'flap', 'fruit-merge']],
  ['flap', 'Sky Flap', 'action', 'A tiny comet bird races through the twilight gates.', 'Tap the stage or press Space to flap through each gap.', '#59C9FF', 'Flap through moving gates', 'quick-reflex', ['One-touch', 'Endless'], ['snake', 'knife', 'stack', 'runner']],
  ['breakout', 'Brick Pulse', 'arcade', 'A luminous brick breaker with escalating pulse rows.', 'Drag the paddle or use arrow keys; clear every brick.', '#70f0c2', 'Bounce ball and clear bricks', 'quick-reflex', ['Classic', 'Aim'], ['invaders', 'bubble', 'snake', 'knife']],
  ['invaders', 'Pixel Defense', 'action', 'Defend the signal beacon from advancing pixel swarms.', 'Move with arrows or drag; tap or Space fires.', '#8b7cff', 'Shoot waves and dodge fire', 'action-adventure', ['Shooter', 'Waves'], ['arena', 'breakout', 'runner', 'platformer']],
  ['runner', 'Metro Dash', 'action', 'Sprint the glowing rails as traffic closes in.', 'Swipe lanes, swipe up to jump, down to slide; arrows also work.', '#ffcb6b', 'Switch lanes, jump, duck', 'action-adventure', ['Runner', 'Endless'], ['platformer', 'flap', 'snake', 'drive']],
  ['platformer', 'Trap Trail', 'action', 'Navigate a tiny temple whose floor has opinions.', 'Use arrows or touch sides to move; tap upper screen to jump.', '#70f0c2', 'Reach exit through surprise traps', 'action-adventure', ['Platformer', 'Levels'], ['runner', 'arena', 'drive', 'invaders']],
  ['drive', 'Tiny Wheels', 'arcade', 'Balance a tiny rover over a hand-drawn test track.', 'Hold DRIVE to climb and BRAKE to slow; use left and right keys too.', '#ffcb6b', 'Physics driving', 'action-adventure', ['Driving', 'Physics'], ['runner', 'platformer', 'fruit-merge', 'stack']],
  ['fruit-merge', 'Fruit Orbit', 'puzzle', 'Drop orbiting fruit and grow them into stellar giants.', 'Drag across the rim and release to drop; use arrows and Space too.', '#ff8f70', 'Drop and merge fruit tiers', 'match-build', ['Merge', 'Physics'], ['merge-2048', 'bubble', 'hex-puzzle', 'drive']],
  ['bubble', 'Bubble Pop', 'puzzle', 'Aim charged bubbles into matching clusters.', 'Drag from the launcher and release to shoot; arrows and Space also work.', '#70f0c2', 'Match colored bubbles', 'match-build', ['Aim', 'Match'], ['fruit-merge', 'hex-puzzle', 'breakout', 'word-grid']],
  ['hex-puzzle', 'Hexa Fit', 'puzzle', 'Fit shifting hex fragments and clear radiant axes.', 'Tap a tray piece, then a board cell; use 1–3, arrows, and Space.', '#8b7cff', 'Place pieces and clear lines', 'puzzle-strategy', ['Spatial', 'Lines'], ['merge-2048', 'block-drop', 'bubble', 'fruit-merge']],
  ['knife', 'Orbit Knife', 'arcade', 'Thread throws through a spinning neon core.', 'Tap or press Space to throw; avoid knives already embedded.', '#ff6b7a', 'Time throws without collisions', 'quick-reflex', ['Timing', 'One-touch'], ['stack', 'flap', 'breakout', 'snake']],
  ['arena', 'Pocket Survivor', 'action', 'Survive a pocket swarm and choose your evolution.', 'Move with WASD, arrows, or the virtual stick; choose an upgrade each level.', '#70f0c2', 'Move, auto-attack, choose upgrades', 'action-adventure', ['Survival', 'Upgrades'], ['invaders', 'platformer', 'runner', 'knife']]
];

export const catalog: readonly CatalogGame[] = catalogRows.map(([slug, title, category, description, instructions, accent, mechanic, primaryCategory, traits, recommendations]) => ({
  slug, title, category: category as GameModuleCategory, description, instructions, accent, mechanic,
  primaryCategory: primaryCategory as GameCategory,
  traits,
  recommendations
}));

const loaders = import.meta.glob<{ default: GameModule }>('../games/*/index.ts');

export function gameLoader(slug: string): GameModuleLoader | undefined {
  return loaders[`../games/${slug}/index.ts`];
}

export async function loadGame(slug: string): Promise<GameModule> {
  const loader = gameLoader(slug);
  if (!loader) throw new Error(`Game module not installed: ${slug}`);
  const module = await loader();
  if (module.default.meta.slug !== slug) throw new Error(`Game module slug mismatch: ${slug}`);
  return module.default;
}

export function findGame(slug: string): CatalogGame | undefined {
  return catalog.find((game) => game.slug === slug);
}

export const categoryInfo: Record<GameCategory, { label: string; promise: string }> = {
  'puzzle-strategy': { label: 'Puzzle & Strategy', promise: 'Think, plan, remember, or deduce.' },
  'match-build': { label: 'Match & Build', promise: 'Combine pieces, clear patterns, and build upward.' },
  'quick-reflex': { label: 'Quick Reflex', promise: 'Short runs driven by timing and reactions.' },
  'action-adventure': { label: 'Action & Adventure', promise: 'Move through worlds, hazards, and escalating challenges.' }
};

export const categoryLabels: Record<GameCategory, string> = Object.fromEntries(
  Object.entries(categoryInfo).map(([key, value]) => [key, value.label])
) as Record<GameCategory, string>;

export function isGameCategory(value: string | null): value is GameCategory {
  return value !== null && value in categoryInfo;
}

export function gamesInCategory(category: GameCategory): readonly CatalogGame[] {
  return catalog.filter((game) => game.primaryCategory === category);
}

export function recommendationsFor(game: CatalogGame): readonly CatalogGame[] {
  return game.recommendations.map((slug) => findGame(slug)).filter((item): item is CatalogGame => item !== undefined && item.slug !== game.slug);
}
