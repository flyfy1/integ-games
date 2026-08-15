import type { GameCatalogEntry, GameCategory, GameModule, GameModuleCategory, GameModuleLoader } from './game-types';
import rawCatalogRows from './catalog-data.json';

type CatalogGame = GameCatalogEntry;
type CatalogRow = [string, string, GameModuleCategory, string, string, string, string, GameCategory, [string, string], [string, string, string, string]];

const catalogRows = rawCatalogRows as unknown as readonly CatalogRow[];

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
