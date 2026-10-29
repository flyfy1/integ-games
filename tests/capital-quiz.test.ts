import { describe, expect, it } from 'vitest';
import { COUNTRIES, SHAPE_COUNTRIES, flagEmoji } from '../src/games/capital-quiz/data';
import { SHAPE_ROWS, SHAPE_VIEWBOX } from '../src/games/capital-quiz/shapes';
import { MODES, ROUND_LENGTH, answerOf, buildQuestion, buildRound, poolFor, pointsFor } from '../src/games/capital-quiz/logic';

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

describe('geo quiz modes', () => {
  it('maps every outline to exactly one country and every country to at most one outline', () => {
    const isos = new Set(COUNTRIES.map((c) => c.iso));
    expect(SHAPE_ROWS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(SHAPE_ROWS.map((r) => r[0])).size).toBe(SHAPE_ROWS.length);
    expect(SHAPE_COUNTRIES).toHaveLength(SHAPE_ROWS.length);
    for (const [iso, difficulty] of SHAPE_ROWS) { expect(isos.has(iso), iso).toBe(true); expect([1, 2, 3]).toContain(difficulty); }
    for (const d of [1, 2, 3]) expect(SHAPE_COUNTRIES.filter((c) => c.difficulty === d).length, `outline difficulty ${d}`).toBeGreaterThanOrEqual(ROUND_LENGTH);
  });

  it('keeps every outline path non-empty, well-formed and inside the viewbox', () => {
    for (const [iso, , path] of SHAPE_ROWS) {
      expect(path, iso).toMatch(/^(M\d+ \d+( \d+ \d+){2,}Z)+$/);
      const nums = path.match(/\d+/g)!.map(Number);
      expect(Math.max(...nums), iso).toBeLessThanOrEqual(SHAPE_VIEWBOX);
      expect(Math.min(...nums), iso).toBeGreaterThanOrEqual(0);
      expect(nums.length, iso).toBeGreaterThanOrEqual(12);
    }
  });

  it('builds flag and outline questions with four distinct country names including the answer', () => {
    const names = new Set(COUNTRIES.map((c) => c.country));
    for (const mode of ['flag', 'shape'] as const) {
      for (let seed = 1; seed <= 5; seed++) {
        const rand = seeded(seed);
        for (const entry of poolFor(mode)) {
          const q = buildQuestion(entry, rand, COUNTRIES, mode);
          expect(new Set(q.options).size).toBe(4);
          expect(q.options[q.answerIndex]).toBe(entry.country);
          for (const o of q.options) expect(names.has(o)).toBe(true);
        }
      }
    }
  });

  it('builds rounds of ten unique countries for every mode, drawing outlines only from the outline set', () => {
    for (const mode of MODES) {
      for (let seed = 1; seed <= 30; seed++) {
        const round = buildRound(seeded(seed), poolFor(mode), mode);
        expect(round).toHaveLength(ROUND_LENGTH);
        expect(new Set(round.map((q) => q.entry.country)).size).toBe(ROUND_LENGTH);
        for (const q of round) {
          expect(q.options[q.answerIndex]).toBe(answerOf(q.entry, mode));
          if (mode === 'shape') expect(SHAPE_COUNTRIES.some((s) => s.country === q.entry.country)).toBe(true);
        }
      }
    }
  });

  it('uses the same scoring in every mode', () => {
    expect(pointsFor(2, 3)).toBe(200);
  });
});
