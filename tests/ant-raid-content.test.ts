import { describe, expect, it } from 'vitest';
import { greedyBot, runScript } from '../src/games/ant-raid/bot';
import { CASTES, CHAPTERS, LEVEL_LIST, LEVELS } from '../src/games/ant-raid/data';
import { SOLUTIONS } from '../src/games/ant-raid/data/solutions';
import { SCENES } from '../src/games/ant-raid/story';
import { COLS, ROWS } from '../src/games/ant-raid/types';

/**
 * Content proofs. Every campaign level ships with a stored reference script that must win with a margin on several
 * seeds (bosses with at most three Scatters, at full difficulty), and a generic greedy bot that knows nothing about
 * the levels must clear chapters 1 and 2. Boss win rates for the bot are reported, not hidden.
 */
const SEEDS = [1, 2, 3];
const MARGIN = 0.12;
/** Raised as each chapter lands; never lowered. */
const SHIPPED_CHAPTERS = 4;

describe('ant-raid levels are well formed', () => {
  it('ships whole chapters, bilingual and on a 16 x 9 yard', () => {
    const shipped = CHAPTERS.filter(chapter => chapter.levels.some(id => LEVELS.some(l => l.id === id)));
    expect(shipped.length).toBeGreaterThanOrEqual(SHIPPED_CHAPTERS);
    for (const chapter of shipped) for (const id of chapter.levels) expect(LEVEL_LIST.some(l => l.id === id), `${id} missing`).toBe(true);
    expect(LEVEL_LIST).toHaveLength(shipped.length * 5);
    for (const level of LEVEL_LIST) {
      expect(level.grid).toHaveLength(ROWS);
      for (const row of level.grid) expect(row).toHaveLength(COLS);
      expect(level.name.en && level.name.zh && level.blurb.en && level.blurb.zh && level.introduces.zh).toBeTruthy();
      for (const step of level.tutorial ?? []) expect(step.text.en && step.text.zh).toBeTruthy();
      for (const food of level.foods) { expect(food.x).toBeLessThan(COLS); expect(food.y).toBeLessThan(ROWS); }
      for (const caste of level.cards ?? []) expect(CASTES[caste]).toBeDefined();
      for (const scene of [level.intro, level.outro]) if (scene) expect(SCENES[scene], `${level.id} scene ${scene}`).toBeDefined();
      // A defence level is won by holding out until sundown, so par is sundown itself there.
      if (level.goal.kind === 'defend') expect(level.par).toBe(level.sundown); else expect(level.par).toBeLessThan(level.sundown);
      if (level.goal.kind === 'item') expect(level.foods.some(f => f.id === (level.goal as { food: string }).food && f.lift)).toBe(true);
    }
  });
});

describe('ant-raid reference scripts win every level with a margin', () => {
  it.each(LEVEL_LIST.map(level => [level.id, level] as const))('%s', (_id, level) => {
    const script = SOLUTIONS[level.id];
    expect(script, `missing reference script for ${level.id}`).toBeDefined();
    for (const seed of SEEDS) {
      const result = runScript(level, script, { seed });
      expect(result.won, `${level.id} seed ${seed}: crumbs ${result.crumbs}, t ${result.time.toFixed(0)}`).toBe(true);
      // Holding out until sundown has no time margin: there the margin is the share of hearts left.
      const margin = level.goal.kind === 'defend' ? result.sim.nestHp / level.goal.hp : result.margin;
      expect(margin, `${level.id} seed ${seed} margin`).toBeGreaterThanOrEqual(MARGIN);
      if (level.boss) expect(result.scatters).toBeLessThanOrEqual(3);
    }
  });
});

describe('a greedy bot with no level knowledge clears chapters 1 and 2', () => {
  const report: string[] = [];
  it.each(LEVEL_LIST.filter(level => level.chapter <= 2).map(level => [level.id, level] as const))('%s', (_id, level) => {
    const wins = [1, 2, 3, 4].map(seed => greedyBot(level, { seed }).won).filter(Boolean).length;
    report.push(`${level.id}: ${wins}/4`);
    expect(wins, `${level.id} bot wins`).toBeGreaterThanOrEqual(level.boss ? 2 : 3);
  });
  it('reports boss win rates', () => { console.info(`[ant-raid] greedy bot: ${report.join(', ')}`); expect(report.length).toBeGreaterThan(0); });
});

describe('ant-raid newcomer pacing', () => {
  // A newcomer spends the opening Sugar on Workers the moment the first bridge stands. Before the bridges were free
  // this left them waiting ~45 s on the trickle for the second Bridger play, with every Worker idle at the nest.
  it('3-1: hatching Workers before the second bridge does not stall the raid', () => {
    const level = LEVEL_LIST.find(l => l.id === '3-1')!;
    const row = (y: number, x0: number, x1: number): [number, number][] => Array.from({ length: x1 - x0 + 1 }, (_, i) => [x0 + i, y]);
    const result = runScript(level, { ops: [
      { t: 0, paint: row(4, 2, 4) },
      { t: 0, play: 'bridger', at: [5, 4] },
      { t: 1, keep: 'worker', ants: 30 },
      { t: 2, paint: row(4, 2, 9), keep: true },
      { t: 9, play: 'bridger', at: [10, 4] },
      { t: 10, paint: row(4, 2, 14), keep: true }
    ] }, { seed: 1 });
    expect(result.won).toBe(true);
    expect(result.time).toBeLessThanOrEqual(level.par);
  });
});
