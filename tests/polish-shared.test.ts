import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('shared polish safeguards', () => {
  it('keeps a reduced-motion override for nonessential UI motion', () => {
    expect(read('src/styles/app.css')).toContain('@media(prefers-reduced-motion:reduce)');
  });

  it('keeps 2048 input gated by pause and terminal state, with deterministic destroy cleanup', () => {
    const source = read('src/games/merge-2048/index.ts');
    expect(source).toContain('if (paused || lost) return;');
    expect(source).toContain("if (!canMove(state.board)) { lost = true; services.sound.play('fail'); render(); return; }");
    expect(source).toContain("window.removeEventListener('keydown', onKey)");
    expect(source).toContain('host.replaceChildren()');
  });

  it('keeps final batch polish effects drawn, stepped, and reset safely', () => {
    const requirements: Record<string, readonly string[]> = {
      runner: ['k.fx.burst', 'k.fx.draw()', 'k.fx.step()', 'k.fx.clear()'],
      'hex-puzzle': ['const preview', 'k.fx.flash', 'k.fx.draw()', 'k.fx.step()', 'k.fx.clear()'],
      knife: ['k.fx.burst', 'k.fx.flash', 'k.fx.draw()', 'k.fx.step()', 'k.fx.clear()'],
      arena: ['k.fx.burst', 'k.fx.flash', 'k.fx.draw()', 'k.fx.step()', 'k.fx.clear()']
    };
    Object.entries(requirements).forEach(([slug, markers]) => {
      const source = read(`src/games/${slug}/index.ts`);
      markers.forEach(marker => expect(source, `${slug}: ${marker}`).toContain(marker));
    });
  });
});
