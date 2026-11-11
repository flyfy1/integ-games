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

/**
 * The eleven cabinets the arcade lists, in display order. Every other catalog entry stays installed and playable
 * from its direct link, but is hidden from the home grid, search, category counts and recommendations.
 */
export const featuredSlugs = ['midnight-kitchen', 'ashfall', 'pelican-bike', 'tank-brawl-opus', 'arena', 'block-drop', 'fruit-merge', 'merge-2048', 'capital-quiz', 'tank-clash', 'pad-pals'] as const;
const featuredSet = new Set<string>(featuredSlugs);

export function isListed(slug: string): boolean { return featuredSet.has(slug); }

/** The visible arcade: the featured cabinets in display order. */
export const arcade: readonly CatalogGame[] = featuredSlugs.map((slug) => {
  const game = catalog.find((entry) => entry.slug === slug);
  if (!game) throw new Error(`Featured game missing from catalog: ${slug}`);
  return game;
});

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
  return arcade.filter((game) => game.primaryCategory === category);
}

/** Up to four listed games to try next: the editorial picks that are still listed, topped up in arcade order. */
export function recommendationsFor(game: CatalogGame): readonly CatalogGame[] {
  const picks = game.recommendations.map((slug) => findGame(slug)).filter((item): item is CatalogGame => item !== undefined && item.slug !== game.slug && isListed(item.slug));
  for (const candidate of arcade) {
    if (picks.length >= 4) break;
    if (candidate.slug !== game.slug && !picks.includes(candidate)) picks.push(candidate);
  }
  return picks.slice(0, 4);
}
