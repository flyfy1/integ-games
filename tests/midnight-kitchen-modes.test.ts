import { afterEach, describe, expect, it } from 'vitest';
import { BOT_PROFILES, botLoadout, measureLevel, runBot } from '../src/games/midnight-kitchen/bot';
import { DEFENDERS, LEVELS, LEVEL_LIST, ownedAt } from '../src/games/midnight-kitchen/data';
import { GRANNY_AFTER, SAVE_VERSION, applyOutcome, defaultSave, grannyOffered, migrate, type Outcome } from '../src/games/midnight-kitchen/save';
import { CAKE_X, DIFFICULTY, canPlace, createSim, defenderAt, mulberry32, place, spawnEnemy, step } from '../src/games/midnight-kitchen/sim';
import type { LevelDef } from '../src/games/midnight-kitchen/types';

/**
 * Difficulty (Gentle / Standard / Chef), the Gentle Oven Mitt, Granny's help and the v4 save. Standard must stay
 * exactly the tuned campaign, so the balance floors in midnight-kitchen-content keep measuring the same game.
 */
const BOT_TIMEOUT = 120_000;
afterEach(() => new Promise<void>(resolve => { setImmediate(resolve); }));
const loadoutFor = (id: string) => botLoadout(LEVELS[id], ownedAt(id));
const ALL = Object.keys(DEFENDERS);
const sandbox = (patch: Partial<LevelDef> = {}): LevelDef => ({
  id: 'test', chapter: 0, index: 1, name: { en: 'Test', zh: '测试' }, blurb: { en: '', zh: '' },
  cols: 9, lanes: 5, startHeat: 5000, slices: 3, cards: ALL, slots: 6,
  waves: [{ after: 99999, spawns: [] }], bonus: { kind: 'noRemove' }, reward: 0, backdrop: 'countertop', ...patch
});
const outcome = (patch: Partial<Outcome> = {}): Outcome => ({ won: false, flawless: false, bonus: false, time: 120, score: 0, wave: 5, recipes: [], enemiesSeen: [], defendersUsed: [], ...patch });

describe('midnight kitchen difficulty', () => {
  it('Standard is the tuned game: an explicit Standard run is identical to the default one', () => {
    for (const id of ['c1-5', 'c3-2', 'c4-5']) {
      const options = { ...BOT_PROFILES.casual, seed: 4, loadout: loadoutFor(id) };
      expect(runBot(LEVELS[id], { ...options, difficulty: 'standard' }), id).toEqual(runBot(LEVELS[id], options));
    }
    expect(DIFFICULTY.standard).toMatchObject({ slices: 0, heat: 0, pest: 1, boss: 1, speed: 1, mitts: 0 });
  });

  it('Gentle adds a slice, Heat and one Oven Mitt per lane in play; Chef makes pests hardier and has no mitts', () => {
    const level = LEVELS['c1-1'];
    const standard = createSim(level, { random: mulberry32(1), loadout: [] });
    const gentle = createSim(level, { random: mulberry32(1), loadout: [], difficulty: 'gentle' });
    const chef = createSim(level, { random: mulberry32(1), loadout: [], difficulty: 'chef' });
    expect(gentle.slices).toBe(standard.slices + 1);
    expect(gentle.heat).toBe(standard.heat + DIFFICULTY.gentle.heat);
    expect(gentle.mitts).toEqual([0, 1, 1, 1, 0]);
    expect(standard.mitts).toEqual([]); expect(chef.mitts).toEqual([]);
    const ant = (sim: ReturnType<typeof createSim>) => spawnEnemy(sim, 'ant', 2)!.maxHp;
    expect(ant(gentle)).toBeLessThan(ant(standard));
    expect(ant(chef)).toBeGreaterThan(ant(standard));
  });

  it('the Oven Mitt saves the slice and sweeps the whole lane once; the next pest eats a slice', () => {
    const sim = createSim(sandbox(), { random: mulberry32(2), difficulty: 'gentle' });
    const first = spawnEnemy(sim, 'ant', 1, 0.2)!, behind = spawnEnemy(sim, 'roach', 1, 4)!, other = spawnEnemy(sim, 'ant', 2, 6)!;
    const slices = sim.slices;
    for (let i = 0; i < 600 && sim.mitts[1] > 0; i++) step(sim);
    expect(sim.mitts[1]).toBe(0);
    expect(sim.slices).toBe(slices);
    expect(sim.events.some(e => e.type === 'mitt' && e.lane === 1 && e.swept === 2)).toBe(true);
    step(sim);
    expect(sim.enemies.includes(first)).toBe(false); expect(sim.enemies.includes(behind)).toBe(false);
    expect(sim.enemies.includes(other)).toBe(true);
    spawnEnemy(sim, 'ant', 1, 0.1);
    for (let i = 0; i < 600 && sim.slices === slices; i++) step(sim);
    expect(sim.slices).toBe(slices - 1);
  });

  it('a mitt never sweeps a boss: it is batted back and the night goes on', () => {
    const sim = createSim(sandbox({ boss: 'queen' }), { random: mulberry32(3), difficulty: 'gentle' });
    const queen = spawnEnemy(sim, 'queen', 2, CAKE_X + 0.05)!;
    for (let i = 0; i < 600 && sim.mitts[2] > 0; i++) step(sim);
    expect(sim.mitts[2]).toBe(0);
    expect(sim.enemies.includes(queen)).toBe(true);
    expect(queen.x).toBeGreaterThan(1);
    expect(sim.status).toBe('playing');
  });

  // Measured over 12 seeds: naive wins 0.83-1.00 of every boss night on Gentle (Standard: 0.00 from the Stove on).
  it.each(LEVEL_LIST.filter(level => level.boss).map(level => [level.id]))('a careless player clears boss night %s on Gentle', id => {
    const report = measureLevel(LEVELS[id], 12, { ...BOT_PROFILES.naive, loadout: loadoutFor(id), difficulty: 'gentle' });
    expect(report.winRate, `${id} gentle naive`).toBeGreaterThanOrEqual(0.75);
  }, BOT_TIMEOUT);

  // Measured: naive >= 0.67 on every regular night on Gentle (Sticky Fingers and Midnight Supper are the hardest).
  it('Gentle carries a careless player through every regular night most of the time', async () => {
    for (const level of LEVEL_LIST.filter(l => !l.boss)) {
      const report = measureLevel(level, 12, { ...BOT_PROFILES.naive, loadout: loadoutFor(level.id), difficulty: 'gentle' });
      expect(report.winRate, `${level.id} gentle naive`).toBeGreaterThanOrEqual(0.5);
      await new Promise(resolve => setImmediate(resolve));
    }
  }, BOT_TIMEOUT);

  it('Chef is harder than Standard for an average player, yet a strong one beats every boss', async () => {
    let standard = 0, chef = 0;
    for (const level of LEVEL_LIST.filter(l => l.chapter >= 3)) {
      standard += measureLevel(level, 6, { ...BOT_PROFILES.casual, loadout: loadoutFor(level.id) }).winRate;
      chef += measureLevel(level, 6, { ...BOT_PROFILES.casual, loadout: loadoutFor(level.id), difficulty: 'chef' }).winRate;
      await new Promise(resolve => setImmediate(resolve));
    }
    expect(chef).toBeLessThan(standard - 1.5);
    for (const level of LEVEL_LIST.filter(l => l.boss)) expect(measureLevel(level, 6, { ...BOT_PROFILES.savvy, loadout: loadoutFor(level.id), difficulty: 'chef' }).winRate, level.id).toBeGreaterThan(0.5);
  }, BOT_TIMEOUT);
});

describe("midnight kitchen Granny's help", () => {
  it('the gift card goes down free, ignores the recharge, starts at tier 2, and only once', () => {
    const sim = createSim(sandbox({ startHeat: 0, cards: ['burner', 'pepper'] }), { random: mulberry32(1), gift: 'pepper' });
    const card = sim.cards.find(c => c.def === 'pepper')!;
    card.cooldown = 5;
    expect(canPlace(sim, 'pepper', 3, 2).ok).toBe(true);
    expect(place(sim, 'pepper', 3, 2).ok).toBe(true);
    expect(defenderAt(sim, 3, 2)!.tier).toBe(1);
    expect(sim.heat).toBe(0);
    expect(card.gift).toBe(0);
    expect(canPlace(sim, 'pepper', 3, 3)).toEqual({ ok: false, reason: 'cooldown' });
  });

  it('a gift card that was not in the hand joins it', () => {
    const sim = createSim(sandbox({ cards: undefined }), { random: mulberry32(1), loadout: ['burner'], gift: 'dough' });
    expect(sim.cards.map(c => c.def)).toEqual(['burner', 'dough']);
  });

  it('two losses in a row on a night bring Granny; a win sends her home', () => {
    const save = defaultSave(), level = LEVELS['c3-5'];
    applyOutcome(save, level, outcome());
    expect(grannyOffered(save, level.id)).toBe(false);
    applyOutcome(save, level, outcome());
    expect(save.losses[level.id]).toBe(GRANNY_AFTER);
    expect(grannyOffered(save, level.id)).toBe(true);
    expect(grannyOffered(save, 'c3-4')).toBe(false);
    applyOutcome(save, level, outcome({ won: true }));
    expect(grannyOffered(save, level.id)).toBe(false);
  });
});

describe('midnight kitchen save v4', () => {
  it('migrates a v3 save untouched and starts the new fields empty', () => {
    const v3 = { v: 3, lang: 'zh', crumbs: 240, owned: ['burner', 'pepper', 'dough', 'egg'], loadout: ['burner', 'egg'], upgrades: {}, speed: 2,
      levels: { 'c1-1': { win: true, flawless: true, bonus: false, bestTime: 80 }, 'c1-2': { win: true, flawless: false, bonus: true, bestTime: 200 } },
      cookbook: { defenders: ['burner'], enemies: ['ant', 'roach'], recipes: ['hotpepper'] }, scenes: ['c1-1-intro'], endless: { bestScore: 900, bestWave: 7, runs: 3 },
      coach: { seen: ['c1-1:0'], off: false }, settings: { music: 0.4, sfx: 0.6, reducedFx: true, autoAdvance: false }, w: 17 };
    const save = migrate(v3);
    expect(save.v).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(4);
    expect(save.levels).toEqual(v3.levels);
    expect(save.crumbs).toBe(240); expect(save.lang).toBe('zh'); expect(save.speed).toBe(2);
    expect(save.endless).toEqual(v3.endless); expect(save.settings).toEqual(v3.settings);
    expect(save.difficulty).toBe('standard');
    expect(save.losses).toEqual({}); expect(save.chefWins).toEqual([]); expect(save.puzzles).toEqual([]); expect(save.challenges).toEqual([]);
  });

  it('keeps and cleans the v4 fields', () => {
    const save = migrate({ v: 4, difficulty: 'chef', losses: { 'c2-3': 2, bad: -4, 'c1-1': 'x' }, chefWins: ['c1-1', 3], puzzles: ['p1'], challenges: ['c1-2'] });
    expect(save.difficulty).toBe('chef');
    expect(save.losses).toEqual({ 'c2-3': 2 });
    expect(save.chefWins).toEqual(['c1-1']); expect(save.puzzles).toEqual(['p1']); expect(save.challenges).toEqual(['c1-2']);
    expect(migrate({ v: 4, difficulty: 'insane' }).difficulty).toBe('standard');
  });

  it('a first Chef win is recorded and pays a bonus', () => {
    const save = defaultSave();
    const plain = applyOutcome(defaultSave(), LEVELS['c1-2'], outcome({ won: true }));
    const chef = applyOutcome(save, LEVELS['c1-2'], outcome({ won: true, difficulty: 'chef' }));
    expect(chef.chefWin).toBe(true);
    expect(chef.crumbs).toBeGreaterThan(plain.crumbs);
    expect(save.chefWins).toEqual(['c1-2']);
    expect(applyOutcome(save, LEVELS['c1-2'], outcome({ won: true, difficulty: 'chef' })).chefWin).toBeUndefined();
  });
});
