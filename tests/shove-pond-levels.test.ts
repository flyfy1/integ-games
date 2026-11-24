import { describe, expect, it } from 'vitest';
import { LESSONS, PUZZLES, buildScenario, playScenario, scenarioWon, type Scenario } from '../src/games/shove-pond/levels';
import { ALL_PLANS, BRACE, planFromString, planToString, type Plan } from '../src/games/shove-pond/sim';

const wins = (sc: Scenario, plans: Plan[] = ALL_PLANS) => plans.filter(p => scenarioWon(sc, playScenario(sc, p)));
const words = (text: string) => text.trim().split(/\s+/).length;

describe('Tadpole School', () => {
  it('has five lessons, each with a caption of 8 words or fewer in both languages', () => {
    expect(LESSONS.map(l => l.id)).toEqual(['hop', 'shove', 'lead', 'brace', 'line']);
    for (const l of LESSONS) {
      expect(words(l.caption.en), l.id).toBeLessThanOrEqual(8);
      expect(l.caption.zh.length, l.id).toBeLessThanOrEqual(16);
    }
  });

  it.each(LESSONS.map(l => [l.id, l]))('%s: solvable, the intended plan wins and the decoy fails', (_id, l) => {
    const sc = l as Scenario;
    expect(wins(sc).length).toBeGreaterThan(0);
    expect(scenarioWon(sc, playScenario(sc, planFromString(sc.solution)!))).toBe(true);
    expect(scenarioWon(sc, playScenario(sc, planFromString(sc.decoy)!))).toBe(false);
  });

  it('lesson 2 (shove): every winning plan shoves', () => {
    const sc = LESSONS[1];
    for (const p of wins(sc)) expect(playScenario(sc, p).events.some(e => e.k === 'shove' && e.s === 0)).toBe(true);
  });

  it('lesson 3 (lead): no plan that beats a still dummy beats the moving one, so you must aim ahead', () => {
    const sc = LESSONS[2];
    const still: Scenario = { ...sc, plans: {} };
    const moving = wins(sc).map(planToString), naive = wins(still).map(planToString);
    expect(naive.length).toBeGreaterThan(0);
    expect(moving.filter(p => naive.includes(p))).toEqual([]);
    expect(naive).toContain(sc.decoy);
  });

  it('lesson 4 (brace): unsolvable without Brace', () => {
    const sc = LESSONS[3];
    expect(wins(sc, ALL_PLANS.filter(p => !p.includes(BRACE)))).toEqual([]);
    expect(buildScenario(sc).scenario?.order?.[0]).toBe(1);
  });

  it('lesson 5 (line): every win shoves a line of two or more and needs the crown', () => {
    const sc = LESSONS[4];
    for (const p of wins(sc)) {
      const r = playScenario(sc, p);
      expect(r.events.some(e => e.k === 'shove' && e.s === 0 && e.line.length >= 2)).toBe(true);
      expect(r.events.some(e => e.k === 'splash' && e.s === buildScenario(sc).scenario?.crown && e.pts === 2)).toBe(true);
    }
    // Without the crown the same shove is worth only 1: not enough.
    expect(wins({ ...sc, crown: undefined })).toEqual([]);
  });
});

describe('Pond Puzzles', () => {
  it('has ten puzzles with unique ids', () => {
    expect(PUZZLES).toHaveLength(10);
    expect(new Set([...LESSONS, ...PUZZLES].map(p => p.id)).size).toBe(15);
  });

  it.each(PUZZLES.map(p => [p.id, p]))('%s: exactly one of 125 plans splashes all three, it is the stored one, and the decoy fails', (_id, p) => {
    const sc = p as Scenario;
    const w = wins(sc).map(planToString);
    expect(w).toEqual([sc.solution]);
    expect(scenarioWon(sc, playScenario(sc, planFromString(sc.decoy)!))).toBe(false);
    // The other frogs do not fall in on their own.
    expect(playScenario(sc, [5, 5, 5]).splashed).toEqual([]);
  });

  it('later puzzles need prediction, Brace and wrong-pad chains', () => {
    const tags = new Set(PUZZLES.flatMap(p => p.tags ?? []));
    for (const t of ['lead', 'line', 'brace', 'wrongpad']) expect(tags.has(t), t).toBe(true);
    for (const p of PUZZLES.filter(q => q.tags?.includes('brace'))) expect(p.solution).toContain('B');
    for (const p of PUZZLES.filter(q => q.tags?.includes('wrongpad'))) {
      expect(playScenario(p, planFromString(p.solution)!).events.some(e => e.k === 'splash' && e.why === 'hop' && e.by === 0), p.id).toBe(true);
    }
  });
});
