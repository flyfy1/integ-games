import { describe, expect, it } from 'vitest';
import { catalog, findGame } from '../src/core/catalog';

describe('arcade catalog', () => {
  it('contains exactly the 20 launch cabinets with unique slugs', () => {
    expect(catalog).toHaveLength(20);
    expect(new Set(catalog.map((game) => game.slug)).size).toBe(20);
  });

  it('finds the reference game by route slug', () => {
    expect(findGame('merge-2048')?.title).toBe('Merge 2048');
  });
});
