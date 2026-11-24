import { describe, expect, it } from 'vitest';
import { COSMETICS, cycle, DEFAULT_LOOK, isUnlocked, nextUnlock, sanitizeLook, starTotal } from '../src/games/pelican-bike/cosmetics';
import { LEVELS } from '../src/games/pelican-bike/levels';

const b = (stars: number) => ({ time: 30, fish: 30, stars, medals: 0 });

describe('pelican-bike star unlocks', () => {
  it('unlocks at 6, 12, 20 and 30 stars, with storm-row extras up to every star in the game', () => {
    const steps = [...new Set(COSMETICS.map((c) => c.stars))].sort((x, y) => x - y);
    expect(steps.slice(0, 5)).toEqual([0, 6, 12, 20, 30]);
    expect(Math.max(...steps)).toBe(LEVELS.length * 3 * 2);
    for (const slot of ['hat', 'paint', 'trail']) expect(COSMETICS.filter((c) => c.slot === slot && c.stars === 0)).toHaveLength(1);
  });

  it('counts the best stars of every stage in both rows, ignoring junk', () => {
    expect(starTotal([b(3), null, b(2)], [b(1), undefined])).toBe(6);
    expect(starTotal([{ ...b(9) }, { time: 1 } as never])).toBe(3);
  });

  it('only lets you wear what you have earned, and keeps a saved look valid', () => {
    expect(isUnlocked('straw', 11)).toBe(false);
    expect(isUnlocked('straw', 12)).toBe(true);
    expect(sanitizeLook({ hat: 'crown', paint: 'sunset', trail: 'nope' }, 10)).toEqual({ ...DEFAULT_LOOK, paint: 'sunset' });
    expect(sanitizeLook('junk', 99)).toEqual(DEFAULT_LOOK);
    let look = { ...DEFAULT_LOOK };
    look = cycle(look, 'hat', 1, 12);
    expect(look.hat).toBe('straw');
    look = cycle(look, 'hat', 1, 12);
    expect(look.hat).toBe('cap'); // the beanie (30) is skipped
    expect(cycle(DEFAULT_LOOK, 'hat', -1, 72).hat).toBe('crown');
    expect(nextUnlock(12)?.stars).toBe(20);
    expect(nextUnlock(72)).toBeUndefined();
  });
});
