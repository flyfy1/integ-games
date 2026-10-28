import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');
const catalog = (JSON.parse(read('src/core/catalog-data.json')) as string[][]).map((row) => row[0]).sort();

describe('game slug consistency', () => {
  it('keeps the backend validGames whitelist in sync with the catalog', () => {
    const line = read('backend/main.go').split('\n').find((l) => l.startsWith('var validGames'));
    expect(line).toBeDefined();
    const backend = [...line!.matchAll(/"([a-z0-9-]+)": true/g)].map((m) => m[1]).sort();
    expect(backend).toEqual(catalog);
  });

  it('gives every catalog game a cover glyph in the shell', () => {
    const line = read('src/main.ts').split('\n').find((l) => l.includes('const glyphs: Record<string, string>'));
    expect(line).toBeDefined();
    const glyphs = [...line!.matchAll(/(?:'([a-z0-9-]+)'|\b([a-z0-9]+)):\s*'/g)].map((m) => m[1] ?? m[2]).sort();
    expect(glyphs).toEqual(catalog);
  });
});
