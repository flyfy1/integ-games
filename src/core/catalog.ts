import type { GameCategory, GameMeta, GameModule, GameModuleLoader } from './game-types';

type CatalogGame = GameMeta;

export const catalog: readonly CatalogGame[] = [
  ['merge-2048', 'Merge 2048', 'puzzle', 'Slide, combine, and build your biggest number.', 'Swipe the board or use arrow keys to merge equal tiles.', '#70F0C2', 'Slide & merge'],
  ['block-drop', 'Block Drop', 'arcade', 'Build glowing rows before the well fills.', 'Use arrows to move and rotate; swipe on the board on touch.', '#8B7CFF', 'Rotate, drop, clear'],
  ['snake', 'Neon Snake', 'arcade', 'Guide a growing neon trail through a tiny starfield.', 'Swipe or use arrow keys to eat sparks; avoid your own trail.', '#70F0C2', 'Grow, turn, survive'],
  ['mines', 'Pocket Mines', 'puzzle', 'A compact field of risky crystals.', 'Tap to reveal. Hold a cell or right-click to plant a flag.', '#FF6B7A', 'Reveal, flag, deduce'],
  ['solitaire', 'Daily Solitaire', 'cards-logic', 'A calm original Klondike table with midnight cards.', 'Tap a face-up card, then a destination column or foundation.', '#FFDA74', 'Sort cards into foundations'],
  ['sudoku', 'Calm Sudoku', 'cards-logic', 'A quiet, focused number grid with gentle feedback.', 'Select a square, then tap a number or use your keyboard.', '#70F0C2', 'Fill a valid 9×9 grid'],
  ['word-grid', 'Word Trail', 'puzzle', 'Trace hidden words through a glowing letter trail.', 'Drag through adjacent letters to spell every word.', '#B18CFF', 'Connect adjacent letters'],
  ['memory', 'Memory Flip', 'puzzle', 'Turn over starlit cards and find every twin.', 'Tap cards to reveal pairs. Match them all in as few turns as possible.', '#59C9FF', 'Match every pair'],
  ['stack', 'Perfect Stack', 'arcade', 'Catch a moving neon slab exactly over your tower.', 'Tap or press Space to drop each moving block.', '#FF9F6E', 'Time precise overlaps'],
  ['flap', 'Sky Flap', 'action', 'A tiny comet bird races through the twilight gates.', 'Tap the stage or press Space to flap through each gap.', '#59C9FF', 'Flap through moving gates'],
  ['breakout', 'Brick Pulse', 'arcade', 'A luminous brick breaker with escalating pulse rows.', 'Drag the paddle or use arrow keys; clear every brick.', '#70f0c2', 'Bounce ball and clear bricks'],
  ['invaders', 'Pixel Defense', 'action', 'Defend the signal beacon from advancing pixel swarms.', 'Move with arrows or drag; tap or Space fires.', '#8b7cff', 'Shoot waves and dodge fire'],
  ['runner', 'Metro Dash', 'action', 'Sprint the glowing rails as traffic closes in.', 'Swipe lanes, swipe up to jump, down to slide; arrows also work.', '#ffcb6b', 'Switch lanes, jump, duck'],
  ['platformer', 'Trap Trail', 'action', 'Navigate a tiny temple whose floor has opinions.', 'Use arrows or touch sides to move; tap upper screen to jump.', '#70f0c2', 'Reach exit through surprise traps'],
  ['drive', 'Tiny Wheels', 'arcade', 'Balance a tiny rover over a hand-drawn test track.', 'Hold DRIVE to climb and BRAKE to slow; use left and right keys too.', '#ffcb6b', 'Physics driving'],
  ['fruit-merge', 'Fruit Orbit', 'puzzle', 'Drop orbiting fruit and grow them into stellar giants.', 'Drag across the rim and release to drop; use arrows and Space too.', '#ff8f70', 'Drop and merge fruit tiers'],
  ['bubble', 'Bubble Pop', 'puzzle', 'Aim charged bubbles into matching clusters.', 'Drag from the launcher and release to shoot; arrows and Space also work.', '#70f0c2', 'Match colored bubbles'],
  ['hex-puzzle', 'Hexa Fit', 'puzzle', 'Fit shifting hex fragments and clear radiant axes.', 'Tap a tray piece, then a board cell; use 1–3, arrows, and Space.', '#8b7cff', 'Place pieces and clear lines'],
  ['knife', 'Orbit Knife', 'arcade', 'Thread throws through a spinning neon core.', 'Tap or press Space to throw; avoid knives already embedded.', '#ff6b7a', 'Time throws without collisions'],
  ['arena', 'Pocket Survivor', 'action', 'Survive a pocket swarm and choose your evolution.', 'Move with WASD, arrows, or the virtual stick; choose an upgrade each level.', '#70f0c2', 'Move, auto-attack, choose upgrades']
].map(([slug, title, category, description, instructions, accent, mechanic]) => ({
  slug, title, category: category as GameCategory, description, instructions, accent, mechanic
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

export const categoryLabels: Record<GameCategory, string> = {
  puzzle: 'Puzzle', arcade: 'Arcade', action: 'Action', 'cards-logic': 'Cards & Logic'
};
