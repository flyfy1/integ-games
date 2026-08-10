import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { catalog } from '../src/core/catalog';

describe('game card art mapping', () => {
  it('derives a cover and icon contract path for every catalog game', () => {
    const source = readFileSync('src/main.ts', 'utf8');
    expect(source).toContain('game-art/${slug}-${kind}.jpg');
    expect(source).toContain('alt="${game.title} gameplay screenshot"');
    expect(source).toContain('width="640" height="360" loading="lazy" decoding="async"');
    expect(source).toContain('class="game-logo"');
    const paths = catalog.flatMap((game) => [`/game-art/${game.slug}-cover.jpg`, `/game-art/${game.slug}-icon.jpg`]);
    expect(paths).toHaveLength(40);
    expect(new Set(paths)).toHaveLength(40);
  });
});
