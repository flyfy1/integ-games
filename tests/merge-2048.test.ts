import { describe, expect, it } from 'vitest';
import game from '../src/games/merge-2048';
import type { GameServices } from '../src/core/game-types';

function testServices(): GameServices {
  const values = new Map<string, unknown>();
  values.set('save', { board: [[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], score: 0 });
  return {
    storage: { get: <T>(key: string, fallback: T) => (values.get(key) as T | undefined) ?? fallback, set: (key, value) => values.set(key, value), remove: (key) => values.delete(key) },
    sound: { muted: true, setMuted: () => undefined, play: () => undefined },
    random: () => 0,
    reportScore: () => undefined,
    reportComplete: () => undefined,
    isReducedMotion: true
  };
}

describe('Merge 2048', () => {
  it('mounts and an arrow input changes state', () => {
    const host = document.createElement('div');
    const controller = game.mount(host, testServices());
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(host.querySelector('[data-score]')?.textContent).toBe('4');
    expect(host.querySelectorAll('.merge-tile.tile-4')).toHaveLength(1);
    controller.destroy();
    expect(host.childElementCount).toBe(0);
  });
});
