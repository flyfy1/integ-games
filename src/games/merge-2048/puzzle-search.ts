/**
 * Exhaustive search for the move puzzles. Test-only (the cabinet never imports it). Spawns follow `seededSpawn`, the
 * same pure rule the cabinet uses, so the breadth-first search sees exactly the boards a player will see and its
 * depth is the true optimum.
 */
import { cloneBoard, maxTile, seededSpawn, type Board, type Cell, type Direction } from './logic';
import type { MovePuzzle } from './puzzles';

export const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'];

/** The same slide as `resolveMove`, on a plain board (no tile ids), with stones splitting lines. */
export function slide(board: Board, direction: Direction, stones: readonly Cell[] = []): { board: Board; changed: boolean; gained: number } {
  const size = board.length, out = board.map((row) => row.map(() => 0));
  const isStone = (x: number, y: number) => stones.some((s) => s.x === x && s.y === y);
  let gained = 0;
  for (let line = 0; line < size; line++) {
    const cells = Array.from({ length: size }, (_, i) => (direction === 'left' || direction === 'right' ? { x: i, y: line } : { x: line, y: i }));
    if (direction === 'right' || direction === 'down') cells.reverse();
    let run: Cell[] = [];
    const flush = () => {
      const values = run.map((c) => board[c.y][c.x]).filter(Boolean);
      let t = 0;
      for (let i = 0; i < values.length; i++, t++) {
        if (values[i + 1] === values[i]) { out[run[t].y][run[t].x] = values[i] * 2; gained += values[i] * 2; i++; }
        else out[run[t].y][run[t].x] = values[i];
      }
      run = [];
    };
    for (const c of cells) { if (isStone(c.x, c.y)) flush(); else run.push(c); }
    flush();
  }
  const changed = out.some((row, y) => row.some((v, x) => v !== board[y][x]));
  return { board: out, changed, gained };
}

/** Plays one puzzle move: slide, then the seeded spawn for move number `move` (1-based). Null if the move does nothing. */
export function puzzleStep(p: MovePuzzle, board: Board, direction: Direction, move: number): Board | null {
  const r = slide(board, direction, p.stones ?? []);
  if (!r.changed) return null;
  const spawn = seededSpawn(r.board, p.seed, move, p.stones ?? [], 0);
  if (spawn) r.board[spawn.y][spawn.x] = spawn.value;
  return r.board;
}

/** Fewest moves to make a tile of at least `p.target`, by breadth-first search, or null within `maxDepth`. */
export function optimum(p: MovePuzzle, maxDepth = 14): { moves: number; line: Direction[] } | null {
  let frontier = new Map<string, { board: Board; line: Direction[] }>([[key(p.rows), { board: cloneBoard(p.rows), line: [] }]]);
  for (let depth = 0; depth < maxDepth; depth++) {
    const next = new Map<string, { board: Board; line: Direction[] }>();
    for (const { board, line } of frontier.values()) {
      for (const d of DIRECTIONS) {
        const after = puzzleStep(p, board, d, depth + 1);
        if (!after) continue;
        const path = [...line, d];
        if (maxTile(after) >= p.target) return { moves: depth + 1, line: path };
        const k = key(after);
        if (!next.has(k)) next.set(k, { board: after, line: path });
      }
    }
    if (!next.size) return null;
    frontier = next;
  }
  return null;
}

/** Moves a "merge whatever pays most right now" player needs (ties broken up, left, down, right), or null. */
export function greedy(p: MovePuzzle, limit: number): number | null {
  let board = cloneBoard(p.rows);
  for (let move = 1; move <= limit; move++) {
    let best: { board: Board; gain: number } | null = null;
    for (const d of ['up', 'left', 'down', 'right'] as const) {
      const r = slide(board, d, p.stones ?? []);
      if (r.changed && (!best || r.gained > best.gain)) best = { board: puzzleStep(p, board, d, move)!, gain: r.gained };
    }
    if (!best) return null;
    board = best.board;
    if (maxTile(board) >= p.target) return move;
  }
  return null;
}

const key = (board: Board) => board.map((row) => row.join(',')).join('/');
