import { describe, expect, it } from 'vitest';
import { arcade, catalog, categoryInfo, featuredSlugs, findGame, gamesInCategory, isListed, recommendationsFor } from '../src/core/catalog';

describe('arcade catalog', () => {
  it('contains exactly the 26 launch cabinets with unique slugs', () => {
    expect(catalog).toHaveLength(26);
    expect(new Set(catalog.map((game) => game.slug)).size).toBe(26);
  });

  it('finds the reference game by route slug', () => {
    expect(findGame('merge-2048')?.title).toBe('Merge 2048');
  });

  it('lists exactly ten featured cabinets and keeps the rest installed but hidden', () => {
    expect(arcade.map((game) => game.slug)).toEqual([...featuredSlugs]);
    expect(arcade).toHaveLength(10);
    expect(new Set(featuredSlugs).size).toBe(10);
    expect(isListed('ashfall')).toBe(true);
    expect(isListed('snake')).toBe(false);
    expect(findGame('snake')?.title).toBe('Neon Snake');
    const listedByCategory = Object.keys(categoryInfo).flatMap((category) => gamesInCategory(category as keyof typeof categoryInfo));
    expect(listedByCategory.map((game) => game.slug).sort()).toEqual([...featuredSlugs].sort());
    for (const category of Object.keys(categoryInfo)) expect(gamesInCategory(category as keyof typeof categoryInfo).length).toBeGreaterThanOrEqual(2);
  });

  it('only ever recommends listed cabinets, four at a time, even from a hidden game', () => {
    for (const game of catalog) {
      const picks = recommendationsFor(game);
      expect(picks).toHaveLength(4);
      expect(new Set(picks.map((item) => item.slug)).size).toBe(4);
      expect(picks.every((item) => isListed(item.slug) && item.slug !== game.slug)).toBe(true);
    }
    for (const game of arcade) expect(recommendationsFor(game).map((item) => item.slug)).toEqual(game.recommendations);
  });

  it('gives every game one category, two traits, and four valid editorial recommendations', () => {
    const slugs = new Set(catalog.map((game) => game.slug));
    for (const game of catalog) {
      expect(categoryInfo[game.primaryCategory]).toBeDefined();
      expect(game.traits).toHaveLength(2);
      expect(new Set(game.traits).size).toBe(2);
      expect(game.recommendations).toHaveLength(4);
      expect(new Set(game.recommendations).size).toBe(4);
      expect(game.recommendations).not.toContain(game.slug);
      expect(game.recommendations.every((slug) => slugs.has(slug))).toBe(true);
    }
  });
});
