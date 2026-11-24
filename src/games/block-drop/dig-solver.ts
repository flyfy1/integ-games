/**
 * Reference solver for the Dig puzzles. Not imported by the game (so it never ships in the cabinet bundle): the unit
 * test uses it to prove every authored puzzle can be cleared within its three-star par using only straight drops
 * (turn at the top, slide, hard drop) plus hold, so no tucks or spins are ever required.
 */
import { COLS, GARBAGE, ROWS, SHAPES, collides, createGame, newBag, type PieceType } from './logic';
import { DIG_PUZZLES, digRandom } from './modes';

/** One straight-drop placement: optionally hold first, then turn `rot` times clockwise and slide so the piece's left edge is at `left`. */
export type Placement = { hold: boolean; rot: number; left: number };

type Node = { board: number[][]; hold: PieceType | null; garbage: number; moves: Placement[] };

const minX = (type: PieceType, rot: number) => Math.min(...SHAPES[type][rot].map(([x]) => x));
const spawnY = (type: PieceType) => (type === 0 ? 0 : 1);

function place(board: number[][], type: PieceType, rot: number, left: number): number[][] | null {
  const x = left - minX(type, rot);
  let y = spawnY(type);
  const piece = { type, rot, x, y };
  if (collides(board, piece)) return null;
  while (!collides(board, { ...piece, y: y + 1 })) y++;
  const next = board.map((row) => [...row]);
  for (const [cx, cy] of SHAPES[type][rot]) { if (y + cy < 2) return null; next[y + cy][x + cx] = type + 1; }
  const kept = next.filter((row) => !row.every(Boolean));
  return [...Array.from({ length: ROWS - kept.length }, () => Array<number>(COLS).fill(0)), ...kept];
}

function evaluate(board: number[][], garbage: number): number {
  let holes = 0, height = 0, bump = 0, prev = -1;
  for (let x = 0; x < COLS; x++) {
    let top = ROWS;
    for (let y = 0; y < ROWS; y++) if (board[y][x]) { top = y; break; }
    const h = ROWS - top; height += h;
    for (let y = top + 1; y < ROWS; y++) if (!board[y][x]) holes++;
    if (prev >= 0) bump += Math.abs(h - prev);
    prev = h;
  }
  const garbageRows = board.filter((row) => row.includes(GARBAGE)).length;
  return garbage * 4 + garbageRows * 30 + holes * 6 + height * 0.6 + bump * 0.8;
}

/** The whole piece order of a puzzle: the game draws 7-bags from the puzzle's random stream and nothing else. */
export function digSequence(index: number, count: number): PieceType[] {
  const random = digRandom(index), out: PieceType[] = [];
  while (out.length < count) out.push(...newBag(random));
  return out;
}

/** Beam search for the fewest pieces that clear every garbage cell. Returns the placements, or null. */
export function solveDig(index: number, maxPieces = 40, beam = 160): Placement[] | null {
  const start = createGame(digRandom(index), { garbage: DIG_PUZZLES[index].rows });
  const sequence = digSequence(index, maxPieces + 10);
  const garbageOf = (b: number[][]) => b.reduce((sum, row) => sum + row.filter((v) => v === GARBAGE).length, 0);
  let layer: Node[] = [{ board: start.board.map((r) => [...r]), hold: null, garbage: garbageOf(start.board), moves: [] }];
  for (let depth = 0; depth < maxPieces; depth++) {
    const seen = new Set<string>();
    const next: Array<Node & { value: number }> = [];
    for (const node of layer) {
      // Pieces drawn so far: one per placement, plus one extra for the first hold (it pulls in the next piece).
      const held = node.hold !== null ? 1 : 0, active = sequence[depth + held];
      const options: Array<{ type: PieceType; hold: boolean; keep: PieceType | null }> = [{ type: active, hold: false, keep: node.hold }];
      if (node.hold === null) options.push({ type: sequence[depth + 1], hold: true, keep: active });
      else if (node.hold !== active) options.push({ type: node.hold, hold: true, keep: active });
      for (const option of options) {
        for (let rot = 0; rot < (option.type === 1 ? 1 : 4); rot++) {
          for (let left = 0; left < COLS; left++) {
            const board = place(node.board, option.type, rot, left);
            if (!board) continue;
            const garbage = garbageOf(board);
            const moves = [...node.moves, { hold: option.hold, rot, left }];
            if (garbage === 0) return moves;
            const key = board.map((r) => r.map((v) => (v ? 1 : 0)).join('')).join('|') + ':' + option.keep;
            if (seen.has(key)) continue;
            seen.add(key);
            next.push({ board, hold: option.keep, garbage, moves, value: evaluate(board, garbage) });
          }
        }
      }
    }
    next.sort((a, b) => a.value - b.value);
    layer = next.slice(0, beam);
    if (!layer.length) return null;
  }
  return null;
}
