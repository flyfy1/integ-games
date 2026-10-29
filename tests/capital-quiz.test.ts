import { describe, expect, it } from 'vitest';
import { COUNTRIES, flagEmoji } from '../src/games/capital-quiz/data';
import { ROUND_LENGTH, buildQuestion, buildRound, pointsFor } from '../src/games/capital-quiz/logic';

const seeded = (seed: number) => () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };

describe('capital quiz question bank', () => {
  it('has a broad bank with unique countries and capitals across every region and difficulty', () => {
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(100);
    expect(new Set(COUNTRIES.map((c) => c.country)).size).toBe(COUNTRIES.length);
    expect(new Set(COUNTRIES.map((c) => c.capital)).size).toBe(COUNTRIES.length);
    expect(new Set(COUNTRIES.map((c) => c.iso)).size).toBe(COUNTRIES.length);
    expect(new Set(COUNTRIES.map((c) => c.region))).toEqual(new Set(['Europe', 'Asia', 'Africa', 'North America', 'South America', 'Oceania']));
    for (const d of [1, 2, 3]) expect(COUNTRIES.filter((c) => c.difficulty === d).length, `difficulty ${d}`).toBeGreaterThanOrEqual(ROUND_LENGTH);
    for (const c of COUNTRIES) { expect(c.iso).toMatch(/^[A-Z]{2}$/); expect(flagEmoji(c.iso)).toHaveLength(4); }
  });

  it('builds questions with 4 distinct options, the answer included, and distractors from other countries', () => {
    const capitals = new Set(COUNTRIES.map((c) => c.capital));
    for (let seed = 1; seed <= 5; seed++) {
      const rand = seeded(seed);
      for (const entry of COUNTRIES) {
        const q = buildQuestion(entry, rand);
        expect(q.options).toHaveLength(4);
        expect(new Set(q.options).size).toBe(4);
        expect(q.options[q.answerIndex]).toBe(entry.capital);
        const owners = q.options.filter((o) => o !== entry.capital).map((o) => COUNTRIES.find((c) => c.capital === o));
        for (const [i, o] of q.options.filter((x) => x !== entry.capital).entries()) {
          expect(capitals.has(o)).toBe(true);
          expect(owners[i]!.country).not.toBe(entry.country);
        }
      }
    }
  });

  it('builds rounds of ten unique countries and shuffles answer positions', () => {
    const positions = new Set<number>();
    for (let seed = 1; seed <= 50; seed++) {
      const round = buildRound(seeded(seed));
      expect(round).toHaveLength(ROUND_LENGTH);
      expect(new Set(round.map((q) => q.entry.country)).size).toBe(ROUND_LENGTH);
      round.forEach((q) => positions.add(q.answerIndex));
    }
    expect(positions.size).toBe(4);
  });

  it('scores by difficulty with a capped streak bonus', () => {
    expect(pointsFor(1, 1)).toBe(100);
    expect(pointsFor(2, 2)).toBe(175);
    expect(pointsFor(3, 3)).toBe(250);
    expect(pointsFor(3, 99)).toBe(300);
  });
});
