import { describe, expect, it } from 'vitest';
import { BOT_PROFILES, runBot } from '../src/games/midnight-kitchen/bot';
import { DAILY_ID, dailyLevel, dailyPlan, DEFENDERS, LEVEL_LIST, levelById, modeOf } from '../src/games/midnight-kitchen/data';
import { applyOutcome, defaultSave } from '../src/games/midnight-kitchen/save';

/** Daily Night: one seeded Endless per date, the same for everyone. */
const DAYS = ['2026-11-24', '2026-11-25', '2026-12-31', '2027-01-01', '2027-06-15'];
const wavesOf = (key: string, n: number) => { const level = dailyLevel(key); return Array.from({ length: n }, (_, i) => JSON.stringify(level.waveGen!(i, () => 0.5))); };

describe('midnight kitchen Daily Night', () => {
  it('a date always gives the same hand and rules; different dates differ', () => {
    for (const key of DAYS) {
      const plan = dailyPlan(key);
      expect(dailyPlan(key)).toEqual(plan);
      expect(plan.cards).toHaveLength(7);
      expect(new Set(plan.cards).size).toBe(7);
      expect(plan.cards[0]).toBe('burner');
      expect(plan.cards.some(id => ['pepper', 'salt', 'toaster', 'ice'].includes(id))).toBe(true);
      for (const id of plan.cards) expect(DEFENDERS[id]).toBeDefined();
      expect(plan.modifiers[0].id).not.toBe(plan.modifiers[1].id);
    }
    expect(new Set(DAYS.map(key => dailyPlan(key).cards.join())).size).toBeGreaterThan(1);
  });

  it('the pests come from the date alone: what happens on the counter never changes them', () => {
    const key = DAYS[0], level = dailyLevel(key);
    expect(levelById(DAILY_ID)).toBe(level);
    expect(modeOf(level)).toBe('daily');
    expect(LEVEL_LIST.includes(level)).toBe(false);
    const before = wavesOf(key, 12);
    // A played night pulls on the sim's own stream; the waves of a fresh copy of the same date stay identical.
    runBot(level, { seed: 7, loadout: level.cards!, ...BOT_PROFILES.casual, maxTime: 240 });
    expect(wavesOf(key, 12)).toEqual(before);
    expect(wavesOf(DAYS[1], 12)).not.toEqual(before);
  });

  it('the two house rules take turns every five waves, from the first wave', () => {
    const key = DAYS[2], plan = dailyPlan(key), level = dailyLevel(key);
    const rules = [0, 5, 10, 15].map(i => level.waveGen!(i, Math.random).modifier?.id);
    expect(rules).toEqual([plan.modifiers[0].id, plan.modifiers[1].id, plan.modifiers[0].id, plan.modifiers[1].id]);
    expect(level.waveGen!(3, Math.random).modifier).toBeUndefined();
  });

  it('a strong player gets well into the night; doing nothing does not', () => {
    for (const key of DAYS.slice(0, 3)) {
      const level = dailyLevel(key);
      expect(runBot(level, { seed: 1, loadout: level.cards!, ...BOT_PROFILES.savvy, maxTime: 300 }).wave, key).toBeGreaterThanOrEqual(8);
      expect(runBot(dailyLevel(key), { seed: 1, loadout: [], sloppy: 1, maxTime: 300 }).lost, key).toBe(true);
    }
  }, 120_000);

  it('save: no Endless record, no loss count, crumbs only for the first run of the day', () => {
    const save = defaultSave(), level = dailyLevel(DAYS[0]);
    const run = (firstToday: boolean) => applyOutcome(save, level, { won: false, flawless: false, bonus: false, time: 300, score: 2500, wave: 12, recipes: [], enemiesSeen: [], defendersUsed: [], firstToday });
    expect(run(true).crumbs).toBe(25);
    expect(run(false).crumbs).toBe(0);
    expect(save.crumbs).toBe(25);
    expect(save.endless).toEqual(defaultSave().endless);
    expect(save.losses).toEqual({});
  });
});
