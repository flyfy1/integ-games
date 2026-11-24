import { describe, expect, it } from 'vitest';
import { nextInCoast, stageOpen } from '../src/games/pelican-bike';
import { COASTS, LEVELS, ORDER } from '../src/games/pelican-bike/levels';

const best = { time: 30, fish: 40, stars: 3, medals: 7 };

describe('pelican-bike coasts', () => {
  it('lists every stage exactly once, three per coast, with the original four ids unmoved at the head of their coasts', () => {
    expect([...ORDER].sort((a, b) => a - b)).toEqual(LEVELS.map((_l, i) => i));
    COASTS.forEach((c, i) => { expect(c.stages).toHaveLength(3); expect(c.stages[0]).toBe(i); });
    COASTS.forEach((c) => expect(LEVELS[c.stages[2]].chase, c.nameEn).toBeDefined());
  });

  it('opens stages along the coasts and keeps saves from the four-stage days fully playable', () => {
    expect(ORDER.filter((id) => stageOpen(id, []))).toEqual([0]);
    // Old save: the first two original stages beaten. The third opens from the old chain, as does 1-2.
    const legacy = [best, best];
    expect(stageOpen(1, legacy, true)).toBe(true);
    expect(stageOpen(2, legacy, true)).toBe(true);
    expect(stageOpen(3, legacy, true)).toBe(false);
    expect(stageOpen(COASTS[0].stages[1], legacy, true)).toBe(true);
    const all4 = [best, best, best, best];
    [0, 1, 2, 3].forEach((id) => expect(stageOpen(id, all4, true)).toBe(true));
    COASTS.forEach((c) => expect(stageOpen(c.stages[1], all4, true)).toBe(true));
    COASTS.forEach((c) => expect(stageOpen(c.stages[2], all4, true)).toBe(false));
    // A new rider goes coast by coast: clearing 1-1 opens 1-2, not the next coast.
    expect(stageOpen(1, [best])).toBe(false);
    expect(stageOpen(COASTS[0].stages[1], [best])).toBe(true);
  });

  it('carries the run along a coast and stops after its finale', () => {
    COASTS.forEach((c) => {
      expect(nextInCoast(c.stages[0])).toBe(c.stages[1]);
      expect(nextInCoast(c.stages[1])).toBe(c.stages[2]);
      expect(nextInCoast(c.stages[2])).toBe(-1);
    });
  });
});

