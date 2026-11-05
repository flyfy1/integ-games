import { describe, expect, it, vi } from 'vitest';
import { pelicanBike } from '../src/games/pelican-bike';
import { buildRows, LEVELS, ROWS } from '../src/games/pelican-bike/levels';
import type { GameServices } from '../src/core/game-types';

const services = (): GameServices => ({
  storage: { get: <T>(_k: string, fb: T) => fb, set: vi.fn(), remove: vi.fn() },
  sound: { muted: false, setMuted: vi.fn(), stop: vi.fn(), play: vi.fn() },
  random: () => 0.5,
  reportScore: vi.fn(),
  reportComplete: vi.fn(),
  isReducedMotion: false
});

describe('pelican-bike module', () => {
  it('generates valid level grid rows for all 3 levels', () => {
    LEVELS.forEach((_lv, i) => {
      const rows = buildRows(i, () => 0.42);
      expect(rows).toHaveLength(ROWS);
      expect(rows[0].length).toBeGreaterThan(100);
      expect(rows.some(r => r.includes('P'))).toBe(true);
      expect(rows.some(r => r.includes('F'))).toBe(true);
    });
  });

  it('mounts, steps and cleans up safely', () => {
    const host = document.createElement('div');
    const controller = pelicanBike.mount(host, services());
    expect(host.querySelector('canvas')).not.toBeNull();
    expect(() => {
      controller.pause();
      controller.resume();
      controller.restart();
      controller.destroy();
    }).not.toThrow();
    expect(host.childElementCount).toBe(0);
  });
});
