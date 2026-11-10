import { describe, expect, it } from 'vitest';
import { SCENE_SECONDS, hash, sceneIndex } from '../src/games/arena/scenes';
import { ENEMY_NAME, createRenderer } from '../src/games/arena/render';
import { ENEMIES } from '../src/games/arena/data';
import { createState, step } from '../src/games/arena/sim';

describe('Pocket Survivor art pass', () => {
  it('walks the four battlegrounds by run time and reaches the fortress before the warlord', () => {
    expect(sceneIndex(0, false, 0)).toBe(0);
    expect(sceneIndex(SCENE_SECONDS, false, 0)).toBe(1);
    expect(sceneIndex(SCENE_SECONDS * 2 + 1, false, 0)).toBe(2);
    expect(sceneIndex(299, false, 0)).toBe(3);
    expect(sceneIndex(900, false, 0)).toBe(3);
    const after = [0, 80, 160, 240, 320].map(extra => sceneIndex(330 + extra, true, 330));
    expect(after).toEqual([0, 1, 2, 3, 0]);
  });

  it('places props from a stable integer hash instead of a random stream', () => {
    expect(hash(3, -7, 11)).toBe(hash(3, -7, 11));
    expect(hash(3, -7, 11)).not.toBe(hash(4, -7, 11));
    expect(new Set(Array.from({ length: 200 }, (_, index) => hash(index, index * 3, 5) % 100)).size).toBeGreaterThan(60);
  });

  it('names every enemy kind and never touches the simulation when fed events', () => {
    for (const kind of Object.keys(ENEMIES)) expect(ENEMY_NAME[kind]).toBeTruthy();
    const seeded = () => { let seed = 9; return () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; }; };
    const plain = createState(seeded()), watched = createState(seeded()), renderer = createRenderer(true);
    for (let tick = 0; tick < 1200; tick++) {
      const input = { mx: Math.cos(tick / 40), my: Math.sin(tick / 40), burst: false };
      step(plain, input); step(watched, input);
      for (const event of watched.events) renderer.onEvent(event, watched);
      plain.events.length = 0; watched.events.length = 0;
    }
    expect([watched.px, watched.py, watched.kills, watched.xp, watched.enemies.length]).toEqual([plain.px, plain.py, plain.kills, plain.xp, plain.enemies.length]);
  });
});
