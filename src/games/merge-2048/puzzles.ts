/** Merge 2048 move puzzles: a set board, a target tile and a move limit. Spawns are seeded (always a 2), so each puzzle is fixed. */
import type { Board, Cell } from './logic';

export type MovePuzzle = {
  rows: Board;
  stones?: Cell[];
  target: number;
  /** Fewest moves that make the target, found by exhaustive search (three stars). */
  par: number;
  /** Move limit. */
  moves: number;
  seed: number;
};

export const twoStarMoves = (p: MovePuzzle) => p.par + 2;
export function puzzleStars(p: MovePuzzle, used: number): 0 | 1 | 2 | 3 {
  if (used <= p.par) return 3;
  if (used <= twoStarMoves(p)) return 2;
  return used <= p.moves ? 1 : 0;
}

/**
 * Thirty puzzles from a seeded generator, kept only when exhaustive search found an optimum of at least four moves
 * and a "take the biggest merge now" player could not match it. Grouped: 3×3, 4×4, then stones and 512.
 */
export const MOVE_PUZZLES: readonly MovePuzzle[] = [
  { rows: [[8,16,0],[4,4,32],[0,2,2]], target: 64, par: 4, moves: 8, seed: 6 },
  { rows: [[2,2,32],[4,0,0],[8,16,0]], target: 64, par: 5, moves: 9, seed: 2 },
  { rows: [[0,16,0],[2,4,4],[0,8,32]], target: 64, par: 5, moves: 9, seed: 5 },
  { rows: [[8,16,32],[0,0,2],[0,4,8]], target: 64, par: 6, moves: 10, seed: 4 },
  { rows: [[32,0,16],[4,0,8],[0,0,0]], target: 64, par: 7, moves: 11, seed: 3 },
  { rows: [[0,0,0,64],[0,0,32,0],[0,8,4,4],[0,2,16,0]], target: 128, par: 5, moves: 9, seed: 6 },
  { rows: [[0,64,0,16],[4,0,8,0],[4,32,0,0],[0,2,0,0]], target: 128, par: 6, moves: 10, seed: 2 },
  { rows: [[0,0,0,32],[0,2,0,4],[0,0,8,2],[64,16,0,0]], target: 128, par: 7, moves: 11, seed: 1 },
  { rows: [[0,0,0,0],[16,0,4,0],[4,32,2,64],[0,0,8,0]], target: 128, par: 7, moves: 11, seed: 5 },
  { rows: [[0,32,0],[64,16,4],[0,8,4]], target: 128, par: 6, moves: 10, seed: 1 },
  { rows: [[2,64,8],[16,8,4],[0,0,32]], target: 128, par: 7, moves: 11, seed: 4 },
  { rows: [[2,8,4],[4,0,64],[32,16,0]], target: 128, par: 7, moves: 11, seed: 6 },
  { rows: [[2,2,32],[8,64,4],[16,4,0]], target: 128, par: 8, moves: 12, seed: 2 },
  { rows: [[4,128,0,2],[0,0,0,0],[0,16,64,8],[0,32,0,8]], target: 256, par: 6, moves: 10, seed: 13 },
  { rows: [[0,64,0,0],[0,0,0,16],[32,4,0,0],[128,4,8,0]], target: 256, par: 7, moves: 11, seed: 2 },
  { rows: [[4,8,0,0],[8,16,2,4],[0,0,0,0],[32,64,128,0]], target: 256, par: 8, moves: 12, seed: 5 },
  { rows: [[16,0,8,64],[0,0,0,0],[0,4,32,0],[0,0,0,128]], target: 256, par: 9, moves: 13, seed: 7 },
  { rows: [[16,0,4,0],[128,0,0,0],[0,0,32,0],[8,8,0,64]], stones: [{ x: 2, y: 1 }], target: 256, par: 6, moves: 10, seed: 9 },
  { rows: [[0,0,0,0],[64,8,16,0],[0,0,32,0],[2,4,128,0]], stones: [{ x: 1, y: 2 }], target: 256, par: 8, moves: 12, seed: 1 },
  { rows: [[0,64,0,0],[0,0,0,16],[32,4,0,0],[128,2,8,0]], stones: [{ x: 3, y: 2 }], target: 256, par: 9, moves: 13, seed: 2 },
  { rows: [[0,128,4,0],[2,0,0,16],[64,8,0,0],[32,8,0,0]], stones: [{ x: 3, y: 2 }, { x: 2, y: 3 }], target: 256, par: 7, moves: 11, seed: 2 },
  { rows: [[0,0,0,0],[128,16,32,4],[0,0,64,0],[8,8,0,0]], stones: [{ x: 1, y: 2 }, { x: 2, y: 3 }], target: 256, par: 8, moves: 12, seed: 1 },
  { rows: [[4,2,0,0],[0,0,0,64],[4,128,32,0],[0,8,0,16]], stones: [{ x: 2, y: 1 }, { x: 2, y: 3 }], target: 256, par: 9, moves: 13, seed: 4 },
  { rows: [[256,0,8,64],[32,0,4,0],[0,0,4,0],[8,16,0,128]], target: 512, par: 9, moves: 13, seed: 2 },
  { rows: [[128,0,16,64],[2,0,0,4],[0,256,32,8],[0,8,2,0]], target: 512, par: 10, moves: 14, seed: 1 },
  { rows: [[32,128,256,4],[64,16,0,0],[2,0,8,0],[0,0,0,0]], target: 512, par: 11, moves: 15, seed: 5 },
  { rows: [[128,256,0,4],[64,8,16,32],[0,8,0,2],[0,0,0,4]], stones: [{ x: 2, y: 2 }, { x: 1, y: 3 }], target: 512, par: 7, moves: 11, seed: 11 },
  { rows: [[256,0,16,128],[64,0,8,0],[0,0,4,0],[8,0,4,32]], stones: [{ x: 3, y: 1 }, { x: 1, y: 3 }], target: 512, par: 9, moves: 13, seed: 2 },
  { rows: [[0,4,0,0],[64,2,128,8],[0,0,0,16],[0,0,256,32]], stones: [{ x: 2, y: 2 }, { x: 1, y: 3 }], target: 512, par: 10, moves: 14, seed: 4 },
  { rows: [[0,0,0,32],[8,16,64,0],[0,4,0,0],[0,128,4,256]], stones: [{ x: 2, y: 0 }, { x: 1, y: 0 }], target: 512, par: 11, moves: 15, seed: 6 }
];
