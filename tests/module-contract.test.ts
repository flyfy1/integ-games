import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalog, gameLoader, loadGame } from '../src/core/catalog';
import type { GameServices, GameStorage } from '../src/core/game-types';

const storage = (): GameStorage => {
  const values = new Map<string, unknown>();
  return {
    get: <T>(key: string, fallback: T) => (values.get(key) as T | undefined) ?? fallback,
    set: (key, value) => values.set(key, value),
    remove: (key) => values.delete(key)
  };
};

function services(): GameServices {
  let randomState = 0x12345678;
  return {
    storage: storage(),
    sound: { muted: true, setMuted: vi.fn(), play: vi.fn() },
    random: () => {
      randomState = (1664525 * randomState + 1013904223) >>> 0;
      return randomState / 2 ** 32;
    },
    reportScore: vi.fn(),
    reportComplete: vi.fn(),
    isReducedMotion: true
  };
}

const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

describe('game module contract', () => {
  afterEach(() => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  it('has exactly twenty unique, importable catalog modules whose metadata matches', async () => {
    expect(catalog).toHaveLength(20);
    expect(new Set(catalog.map((game) => game.slug)).size).toBe(20);
    const loaded = [];
    for (const item of catalog) {
      expect(gameLoader(item.slug), `missing loader for ${item.slug}`).toBeTypeOf('function');
      const module = await loadGame(item.slug);
      loaded.push(module.meta);
      expect(module.meta.instructions.trim().length, `${item.slug} must explain controls`).toBeGreaterThan(12);
      expect(module.meta.accent).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(loaded).toEqual(catalog);
  });

  it.each(catalog.map((game) => [game.slug]))('%s mounts and has a safe lifecycle', async (slug) => {
    globalThis.requestAnimationFrame = (() => 1) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame;
    const module = await loadGame(slug);
    const host = document.createElement('div');
    const controller = module.mount(host, services());
    expect(host.childElementCount, `${slug} should render into its host`).toBeGreaterThan(0);
    expect(() => { controller.pause(); controller.resume(); controller.restart(); controller.destroy(); }).not.toThrow();
    expect(host.childElementCount, `${slug} destroy should clear its host`).toBe(0);
  });
});
