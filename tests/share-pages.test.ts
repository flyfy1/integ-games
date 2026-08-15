import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import catalogRows from '../src/core/catalog-data.json';

const output = mkdtempSync(join(tmpdir(), 'integ-games-share-pages-'));
cpSync(resolve('index.html'), join(output, 'index.html'));
execFileSync(process.execPath, [resolve('scripts/generate-share-pages.mjs'), output]);

afterAll(() => rmSync(output, { recursive: true, force: true }));

describe('static social preview pages', () => {
  it('generates one crawlable page per catalog game', () => {
    expect(catalogRows).toHaveLength(20);
    for (const [rawSlug] of catalogRows) {
      const slug = String(rawSlug);
      expect(readFileSync(join(output, 'play', slug, 'index.html'), 'utf8')).toContain(`https://games.integ.life/play/${slug}/`);
    }
  });

  it('renders game-specific Open Graph and Twitter metadata', () => {
    const page = readFileSync(join(output, 'play', 'arena', 'index.html'), 'utf8');
    expect(page).toContain('<title>Pocket Survivor · Integ Games</title>');
    expect(page).toContain('<meta property="og:title" content="Pocket Survivor · Integ Games" />');
    expect(page).toContain('<meta property="og:image" content="https://games.integ.life/game-art/arena-cover.jpg" />');
    expect(page).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(page).toContain('<link rel="canonical" href="https://games.integ.life/play/arena/" />');
  });
});
