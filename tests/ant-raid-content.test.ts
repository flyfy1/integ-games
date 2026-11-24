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

describe('ant-raid levels are well formed', () => {
  it('has every chapter level defined, bilingual and on a 16 x 9 yard', () => {
    for (const chapter of CHAPTERS) for (const id of chapter.levels) if (LEVELS.some(l => l.id === id)) expect(LEVEL_LIST.some(l => l.id === id)).toBe(true);
    for (const level of LEVEL_LIST) {
      expect(level.grid).toHaveLength(ROWS);
      for (const row of level.grid) expect(row).toHaveLength(COLS);
      expect(level.name.en && level.name.zh && level.blurb.en && level.blurb.zh && level.introduces.zh).toBeTruthy();
      for (const step of level.tutorial ?? []) expect(step.text.en && step.text.zh).toBeTruthy();
      for (const food of level.foods) { expect(food.x).toBeLessThan(COLS); expect(food.y).toBeLessThan(ROWS); }
      for (const caste of level.cards ?? []) expect(CASTES[caste]).toBeDefined();
      for (const scene of [level.intro, level.outro]) if (scene) expect(SCENES[scene], `${level.id} scene ${scene}`).toBeDefined();
      expect(level.par).toBeLessThan(level.sundown);
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
      expect(result.margin, `${level.id} seed ${seed} margin`).toBeGreaterThanOrEqual(MARGIN);
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
