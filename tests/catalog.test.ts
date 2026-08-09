import { describe, expect, it } from 'vitest';
import { catalog, categoryInfo, findGame, recommendationsFor } from '../src/core/catalog';

describe('arcade catalog', () => {
  it('contains exactly the 20 launch cabinets with unique slugs', () => {
    expect(catalog).toHaveLength(20);
    expect(new Set(catalog.map((game) => game.slug)).size).toBe(20);
  });

  it('finds the reference game by route slug', () => {
    expect(findGame('merge-2048')?.title).toBe('Merge 2048');
  });

  it('gives every game one balanced category, two traits, and four valid editorial recommendations', () => {
    const slugs = new Set(catalog.map((game) => game.slug));
    for (const game of catalog) {
      expect(categoryInfo[game.primaryCategory]).toBeDefined();
      expect(game.traits).toHaveLength(2);
      expect(new Set(game.traits).size).toBe(2);
      expect(game.recommendations).toHaveLength(4);
      expect(new Set(game.recommendations).size).toBe(4);
      expect(game.recommendations).not.toContain(game.slug);
      expect(game.recommendations.every((slug) => slugs.has(slug))).toBe(true);
      expect(recommendationsFor(game).map((item) => item.slug)).toEqual(game.recommendations);
    }
    for (const category of Object.keys(categoryInfo)) {
      expect(catalog.filter((game) => game.primaryCategory === category).length).toBeGreaterThanOrEqual(4);
    }
  });
});
