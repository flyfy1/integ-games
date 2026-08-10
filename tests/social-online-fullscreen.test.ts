import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

describe('social, online scores, and mobile launch', () => {
  const main = read('src/main.ts');
  it('offers system sharing with a clipboard fallback', () => {
    expect(main).toContain('navigator.share');
    expect(main).toContain('navigator.clipboard.writeText');
  });
  it('defers mobile gameplay to native or CSS immersive fullscreen', () => {
    expect(main).toContain("matchMedia('(hover: none), (pointer: coarse)')");
    expect(main).toContain('navigator.maxTouchPoints');
    expect(main).toContain('await stage.requestFullscreen');
    expect(main).toContain('webkitRequestFullscreen');
    expect(main).toContain("classList.add('is-immersive')");
    expect(main).toContain('data-action="start-game"');
  });
  it('connects login, score submission, and the overall leaderboard', () => {
    expect(main).toContain('submitScore(slug, score)');
    expect(main).toContain('data-leaderboard');
    expect(read('src/core/online.ts')).toContain('https://games-api.integ.life');
    expect(read('src/core/online.ts')).toContain('/api/auth/integ/start');
  });
});
