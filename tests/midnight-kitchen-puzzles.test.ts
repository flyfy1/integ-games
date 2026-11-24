import { describe, expect, it } from 'vitest';
import { PUZZLES, PUZZLE_SEED } from '../src/games/midnight-kitchen/data/puzzles';
import { DEFENDERS, ENEMIES, LEVEL_LIST, levelById, modeOf } from '../src/games/midnight-kitchen/data';
import { canPlace, cook, createSim, mulberry32, place, remove, step, upgrade } from '../src/games/midnight-kitchen/sim';
import { allStars, applyOutcome, defaultSave, grannyOffered, hintOffered, isUnlocked, migrate, totalStars } from '../src/games/midnight-kitchen/save';
import type { LevelDef } from '../src/games/midnight-kitchen/types';

/** Chef's Table: every stored answer is replayed in the real sim. */
type Moves = [string, number, number][];
function play(level: LevelDef, moves: Moves, difficulty?: 'gentle' | 'chef') {
  const sim = createSim(level, { random: mulberry32(PUZZLE_SEED), difficulty });
  // A move can become illegal once an earlier piece is gone (a dark cell nobody lights): that board is simply short a piece.
  for (const move of moves) place(sim, ...move);
  cook(sim);
  while (sim.status === 'playing' && sim.time < 600) step(sim);
  return sim;
}

describe('midnight kitchen Chef\'s Table puzzles', () => {
  it('twelve puzzles, bilingual, outside the campaign list, each hand fully used by its answer', () => {
    expect(PUZZLES).toHaveLength(12);
    for (const { level, solution, hint } of PUZZLES) {
      expect(levelById(level.id)).toBe(level);
      expect(modeOf(level)).toBe('puzzle');
      expect(LEVEL_LIST.some(other => other.id === level.id)).toBe(false);
      for (const text of [level.name, level.blurb, hint]) { expect(text.en.length).toBeGreaterThan(3); expect(/[一-鿿]/.test(text.zh)).toBe(true); }
      const pieces = level.rules!.puzzle!.pieces, used: Record<string, number> = {};
      for (const [def] of solution) used[def] = (used[def] ?? 0) + 1;
      expect(used, level.id).toEqual(pieces);
      for (const id of Object.keys(pieces)) expect(DEFENDERS[id]).toBeDefined();
      for (const wave of level.waves) for (const row of wave.spawns) expect(ENEMIES[row[1]], `${level.id} ${row[1]}`).toBeDefined();
    }
  });

  it.each(PUZZLES.map(p => [p.level.id, p]))('%s: the stored answer wins, the empty board loses, and every piece is needed', (_id, { level, solution }) => {
    const sim = createSim(level, { random: mulberry32(PUZZLE_SEED) });
    for (const move of solution) expect(place(sim, ...move), `${level.id} ${move}`).toMatchObject({ ok: true });
    expect(play(level, solution).status).toBe('won');
    expect(play(level, []).status).toBe('lost');
    for (let i = 0; i < solution.length; i++) {
      const fewer = solution.filter((_, j) => j !== i);
      expect(play(level, fewer).status, `${level.id} without ${solution[i]}`).toBe('lost');
    }
  });

  it('the answer does not depend on the difficulty picker (puzzles are always Standard)', () => {
    for (const { level, solution } of PUZZLES) {
      const a = play(level, solution), b = play(level, solution, 'gentle');
      expect(b.time).toBe(a.time);
    }
  });

  it('prep rules: free counted pieces, nothing moves until Cook, then pieces are locked in', () => {
    const { level } = PUZZLES[0];
    const sim = createSim(level, { random: mulberry32(PUZZLE_SEED) });
    expect(sim.prep).toBe(true);
    expect(sim.heat).toBe(0);
    expect(sim.slices).toBe(1);
    expect(place(sim, 'pepper', 0, 1).ok).toBe(true);
    expect(sim.cards[0].stock).toBe(2);
    expect(place(sim, 'pepper', 0, 2).ok).toBe(true);
    expect(remove(sim, 0, 2).ok).toBe(true);
    expect(sim.cards[0].stock).toBe(2);
    expect(upgrade(sim, 0, 1).ok).toBe(false);
    for (let i = 0; i < 100; i++) step(sim);
    expect(sim.time).toBe(0);
    expect(sim.enemies).toHaveLength(0);
    place(sim, 'pepper', 0, 2); place(sim, 'pepper', 0, 3);
    expect(canPlace(sim, 'pepper', 1, 1)).toEqual({ ok: false, reason: 'stock' });
    cook(sim);
    expect(sim.prep).toBe(false);
    expect(remove(sim, 0, 1).ok).toBe(false);
    for (let i = 0; i < 100; i++) step(sim);
    expect(sim.time).toBeGreaterThan(0);
  });

  it('placing order does not matter: the answer wins backwards too', () => {
    for (const { level, solution } of PUZZLES) {
      // Burners keep their order (in the dark each one lights the next spot); everything else goes in reverse.
      const backwards = [...solution.filter(m => m[0] === 'burner'), ...solution.filter(m => m[0] !== 'burner').reverse()];
      expect(play(level, backwards).status, level.id).toBe('won');
    }
  });

  it('save: solved puzzles are their own list, open in order, and a hint follows two misses', () => {
    const save = defaultSave(), [p1, p2] = PUZZLES.map(p => p.level);
    const outcome = (won: boolean) => ({ won, flawless: won, bonus: false, time: 30, score: 0, wave: 1, recipes: [], enemiesSeen: [], defendersUsed: [] });
    expect(isUnlocked(save, p1.id)).toBe(false);
    save.levels['c1-1'] = { win: true, flawless: false, bonus: false, bestTime: 60 };
    save.levels['c1-2'] = { win: true, flawless: false, bonus: false, bestTime: 60 };
    expect(isUnlocked(save, p1.id)).toBe(true);
    expect(isUnlocked(save, p2.id)).toBe(false);
    applyOutcome(save, p1, outcome(false));
    applyOutcome(save, p1, outcome(false));
    expect(hintOffered(save, p1.id)).toBe(true);
    expect(grannyOffered(save, p1.id)).toBe(false);
    const stars = allStars(save), crumbs = save.crumbs;
    const reward = applyOutcome(save, p1, outcome(true));
    expect(reward.firstClear).toBe(true);
    expect(save.crumbs).toBeGreaterThan(crumbs);
    expect(save.puzzles).toEqual([p1.id]);
    expect(save.levels[p1.id]).toBeUndefined();
    expect(allStars(save)).toBe(stars);
    expect(totalStars(save)).toBe(2);
    expect(hintOffered(save, p1.id)).toBe(false);
    expect(isUnlocked(save, p2.id)).toBe(true);
    // A replay pays nothing more, and the list survives a round trip through storage.
    expect(applyOutcome(save, p1, outcome(true)).crumbs).toBe(0);
    expect(migrate(JSON.parse(JSON.stringify(save))).puzzles).toEqual([p1.id]);
  });
});
