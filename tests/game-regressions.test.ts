import { describe, expect, it } from 'vitest';
import { canMergeFruitTier } from '../src/games/fruit-merge';
import { snakeCollision } from '../src/games/snake';
import { sudokuBox } from '../src/games/sudoku';

describe('gameplay regressions', () => {
  it('allows snake to move into the tail cell when the tail moves away', () => {
    const snake = [[2, 1], [2, 2], [1, 2], [1, 1]] as const;
    expect(snakeCollision(snake, [1, 1], false)).toBe(false);
    expect(snakeCollision(snake, [1, 1], true)).toBe(true);
    expect(snakeCollision(snake, [2, 2], false)).toBe(true);
  });

  it('does not consume two fruits that are already at the maximum tier', () => {
    expect(canMergeFruitTier(5)).toBe(true);
    expect(canMergeFruitTier(6)).toBe(false);
  });

  it('maps every Sudoku cell to the correct 3 by 3 box', () => {
    expect([0, 10, 20].map(sudokuBox)).toEqual([0, 0, 0]);
    expect([27, 40, 53].map(sudokuBox)).toEqual([3, 4, 5]);
    expect([54, 67, 80].map(sudokuBox)).toEqual([6, 7, 8]);
  });
});
