import { afterEach, describe, expect, it, vi } from 'vitest';
import game from '../src/games/merge-2048';
import type { GameServices } from '../src/core/game-types';

function testServices(): GameServices {
  const values = new Map<string, unknown>();
  values.set('save', { board: [[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], score: 0 });
  return {
    storage: { get: <T>(key: string, fallback: T) => (values.get(key) as T | undefined) ?? fallback, set: (key, value) => values.set(key, value), remove: (key) => values.delete(key) },
    sound: { muted: true, setMuted: () => undefined, stop: () => undefined, play: () => undefined },
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

  it('locks a slide until its merge and spawn markers are committed, then cleans pending work', () => {
    vi.useFakeTimers();
    const services = testServices(); services.isReducedMotion = false;
    const host = document.createElement('div'); const controller = game.mount(host, services);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(host.querySelectorAll('.merge-tile.tile-2')).toHaveLength(2);
    expect(host.querySelector('[data-delta]')?.textContent).toBe('+4');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    vi.advanceTimersByTime(149); expect(host.querySelectorAll('.merge-tile.tile-2')).toHaveLength(2);
    vi.advanceTimersByTime(1); expect(host.querySelector('.merge-tile.merge-merge')).not.toBeNull();
    expect(host.querySelector('.merge-tile.merge-spawn')).not.toBeNull();
    controller.destroy(); vi.runOnlyPendingTimers();
    expect(host.childElementCount).toBe(0);
  });
});

afterEach(() => vi.useRealTimers());
