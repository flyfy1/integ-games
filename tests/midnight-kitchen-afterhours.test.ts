import { afterEach, describe, expect, it } from 'vitest';
import { BOT_PROFILES, measureLevel, runBot } from '../src/games/midnight-kitchen/bot';
import { AFTER_HOURS, AFTER_HOURS_STARS, DEFENDERS, LEVEL_LIST, levelById, modeOf } from '../src/games/midnight-kitchen/data';
import { allStars, defaultSave, isUnlocked, totalStars } from '../src/games/midnight-kitchen/save';
import { canPlace, createSim, defenderAt, mulberry32, place, placeCost, run, spawnEnemy, step } from '../src/games/midnight-kitchen/sim';
import type { LevelDef } from '../src/games/midnight-kitchen/types';

/** After Hours: ten side nights with one special rule each (see data/afterhours.ts). */
const BOT_TIMEOUT = 120_000;
afterEach(() => new Promise<void>(resolve => { setImmediate(resolve); }));
const ALL = Object.keys(DEFENDERS);
const sandbox = (patch: Partial<LevelDef> = {}): LevelDef => ({
  id: 'test', chapter: 0, index: 1, name: { en: 'Test', zh: '测试' }, blurb: { en: '', zh: '' },
  cols: 9, lanes: 5, startHeat: 5000, slices: 3, cards: ALL, slots: 6,
  waves: [{ after: 99999, spawns: [] }], bonus: { kind: 'noRemove' }, reward: 0, backdrop: 'countertop', ...patch
});
const ruleOf = (level: LevelDef) => Object.keys(level.rules ?? {}).join(',') || (level.cols < 9 ? 'narrow' : level.waves.some(w => w.spawns.some(s => s[1] === 'brute')) ? 'giant' : 'none');

describe('midnight kitchen After Hours content', () => {
  it('ten nights, each with a different rule, bilingual, outside the campaign list', () => {
    expect(AFTER_HOURS).toHaveLength(10);
    const rules = AFTER_HOURS.map(ruleOf);
    expect(new Set(rules).size, rules.join(' ')).toBe(10);
    for (const level of AFTER_HOURS) {
      expect(levelById(level.id)).toBe(level);
      expect(modeOf(level)).toBe('afterhours');
      expect(LEVEL_LIST.some(other => other.id === level.id)).toBe(false);
      for (const text of [level.name, level.blurb]) { expect(text.en.length).toBeGreaterThan(3); expect(/[一-鿿]/.test(text.zh)).toBe(true); }
      for (const id of level.cards ?? []) expect(DEFENDERS[id], `${level.id} ${id}`).toBeDefined();
    }
  });

  it('nights open by total stars, in order, the first one early', () => {
    const needs = AFTER_HOURS.map(level => AFTER_HOURS_STARS[level.id]);
    expect(needs[0]).toBeLessThanOrEqual(3);
    for (let i = 1; i < needs.length; i++) expect(needs[i]).toBeGreaterThan(needs[i - 1]);
    expect(needs[needs.length - 1]).toBeLessThan(LEVEL_LIST.length * 3);
    const save = defaultSave();
    expect(isUnlocked(save, 'ah-1')).toBe(false);
    save.levels['c1-1'] = { win: true, flawless: true, bonus: true, bestTime: 60 };
    expect(isUnlocked(save, 'ah-1')).toBe(true);
    expect(isUnlocked(save, 'ah-2')).toBe(false);
    // After Hours stars count toward the next night but never toward the campaign's own total.
    save.levels['ah-1'] = { win: true, flawless: true, bonus: true, bestTime: 60 };
    expect(totalStars(save)).toBe(3);
    expect(allStars(save)).toBe(6);
    expect(isUnlocked(save, 'ah-2')).toBe(true);
  });

  // Measured over 12 seeds, savvy: ah-1 1.00, ah-2 0.83, ah-3 0.75, ah-4 1.00, ah-5 0.92, ah-6 0.75, ah-7 1.00, ah-8 0.75, ah-9 1.00, ah-10 1.00.
  it.each(AFTER_HOURS.map(level => [level.id]))('%s is winnable by a strong player and lost by doing nothing', id => {
    const level = levelById(id)!;
    const report = measureLevel(level, 12, { ...BOT_PROFILES.savvy });
    expect(report.winRate, `${id} savvy`).toBeGreaterThanOrEqual(0.58);
    expect(runBot(level, { seed: 1, loadout: [], sloppy: 1 }).lost).toBe(true);
    const bonus = (['planner', 'casual'] as const).some(name => measureLevel(level, 6, { ...BOT_PROFILES[name] }).bonusRate > 0);
    expect(bonus, `${id} bonus star earnable`).toBe(true);
  }, BOT_TIMEOUT);
});

describe('midnight kitchen night rules', () => {
  it('conveyor: cards ride in for free, stack up to the belt limit, and leave the hand when used', () => {
    const sim = createSim(sandbox({ startHeat: 0, cards: undefined, rules: { conveyor: { every: 1, first: 0.5, max: 3, pool: ['pepper', 'dough'] } } }), { random: mulberry32(1), loadout: ALL });
    expect(sim.cards).toEqual([]);
    run(sim, 0.6);
    expect(sim.cards).toEqual([{ def: 'pepper', cooldown: 0, total: 0, stock: 1 }]);
    expect(placeCost(sim, 'pepper')).toBe(0);
    run(sim, 3);
    expect(sim.cards.reduce((n, c) => n + (c.stock ?? 0), 0)).toBe(3);
    const version = sim.handVersion;
    expect(place(sim, 'dough', 4, 2).ok).toBe(true);
    expect(sim.cards.some(c => c.def === 'dough')).toBe(false);
    expect(sim.handVersion).toBeGreaterThan(version);
    expect(sim.heat).toBe(0);
  });

  it('lamps only: a Burner gives no light, so nothing can stand beyond the lanterns', () => {
    const level = sandbox({ terrain: { dark: true, lamps: [[0, 2]] } });
    const lit = createSim(level, { random: mulberry32(1) }), dark = createSim({ ...level, rules: { lampsOnly: true } }, { random: mulberry32(1) });
    for (const sim of [lit, dark]) { for (const c of sim.cards) c.cooldown = 0; expect(place(sim, 'burner', 1, 2).ok).toBe(true); }
    expect(canPlace(lit, 'pepper', 2, 2).ok).toBe(true);
    expect(canPlace(dark, 'pepper', 2, 2)).toEqual({ ok: false, reason: 'dark' });
  });

  it('recipes only: a lone guard stands idle, the same guard in a Recipe fights', () => {
    const shots = (pair: boolean) => {
      const sim = createSim(sandbox({ rules: { recipesOnly: true } }), { random: mulberry32(1) });
      for (const c of sim.cards) c.cooldown = 0;
      place(sim, 'pepper', 2, 2);
      if (pair) place(sim, 'burner', 1, 2);
      spawnEnemy(sim, 'ant', 2, 6);
      run(sim, 3);
      return sim.events.filter(e => e.type === 'attack' && e.def === 'pepper').length;
    };
    expect(shots(false)).toBe(0);
    expect(shots(true)).toBeGreaterThan(0);
  });

  it('bounty: every pest sent home pays Heat', () => {
    const sim = createSim(sandbox({ startHeat: 0, rules: { bounty: { per: 20, min: 15 } } }), { random: mulberry32(1) });
    const ant = spawnEnemy(sim, 'ant', 2, 5)!;
    ant.hp = 0; step(sim);
    expect(sim.heat).toBe(20);
  });

  it('plughole: every n-th pest of a wave climbs out mid-counter', () => {
    const sim = createSim(sandbox({ rules: { plughole: { col: 4, every: 2 } }, waves: [{ after: 0.1, spawns: [[0, 'ant', 0, 4, 0.1]] }, { after: 9999, spawns: [] }] }), { random: mulberry32(1) });
    run(sim, 1);
    const xs = sim.enemies.map(e => Math.round(e.x));
    expect(xs.filter(x => x <= 5)).toHaveLength(2);
    expect(xs.filter(x => x >= 8)).toHaveLength(2);
  });

  it('leftovers: deals the stated number from the cards brought, a Burner first, the same for the same seed', () => {
    const level = sandbox({ cards: undefined, rules: { leftovers: 6 } });
    const a = createSim(level, { random: mulberry32(9), loadout: ALL }).cards.map(c => c.def), b = createSim(level, { random: mulberry32(9), loadout: ALL }).cards.map(c => c.def);
    expect(a).toHaveLength(6); expect(a[0]).toBe('burner'); expect(a).toEqual(b);
    expect(createSim(level, { random: mulberry32(10), loadout: ALL }).cards.map(c => c.def)).not.toEqual(a);
  });

  it('pace speeds pests up and recharges cards faster; fixed slices ignore Gentle', () => {
    const fast = createSim(sandbox({ rules: { pace: { enemySpeed: 2, cooldown: 0.5 } } }), { random: mulberry32(1) });
    const plain = createSim(sandbox(), { random: mulberry32(1) });
    expect(fast.cards[0].total).toBe(plain.cards[0].total / 2);
    const ea = spawnEnemy(fast, 'ant', 2, 8)!, eb = spawnEnemy(plain, 'ant', 2, 8)!;
    run(fast, 2); run(plain, 2);
    expect(8 - ea.x).toBeCloseTo((8 - eb.x) * 2, 1);
    expect(createSim(sandbox({ slices: 1, rules: { fixedSlices: true } }), { random: mulberry32(1), difficulty: 'gentle' }).slices).toBe(1);
    expect(defenderAt(fast, 0, 0)).toBeUndefined();
  });
});
