/** Pure rules for Merge 2048: sliding, merging, save validation, undo credits and the tile colour ramp. */
export type Board = number[][];
export type Direction = 'up' | 'down' | 'left' | 'right';
export type Tile = { id: number; value: number; x: number; y: number };
export type Motion = { id: number; x: number; y: number };
export type MoveResult = { tiles: Tile[]; board: Board; gained: number; changed: boolean; motions: Motion[]; merges: number[] };
/** One step of history: enough to put the board back exactly as it was before the last move. */
export type Snapshot = { board: Board; score: number; won: boolean };
/**
 * Persisted game. `board` and `score` are the original save shape and stay readable by older builds;
 * everything else is optional so saves written before undo existed still load.
 */
export type SavedState = { board: Board; score: number; won?: boolean; undos?: number; peak?: number; rec?: number; prev?: Snapshot | null };

export const SIZE = 4;
export const WIN_TILE = 2048;
/** Undos a new game starts with, the most that can be banked, and the first best tile that earns another. */
export const UNDO_START = 2;
export const UNDO_CAP = 3;
export const UNDO_REWARD_FROM = 128;
/** New best tiles from here up get the celebration (smaller ones happen every few seconds). */
export const CELEBRATE_FROM = 64;

export const emptyBoard = (): Board => Array.from({ length: SIZE }, () => Array<number>(SIZE).fill(0));
export const cloneBoard = (board: Board): Board => board.map((row) => [...row]);
export const maxTile = (board: Board): number => Math.max(0, ...board.flat());

const isTileValue = (value: unknown): value is number => value === 0 || (typeof value === 'number' && Number.isInteger(value) && value >= 2 && value <= 2 ** 20 && (value & (value - 1)) === 0);
export function isBoard(board: unknown): board is Board {
  return Array.isArray(board) && board.length === SIZE && board.every((row) => Array.isArray(row) && row.length === SIZE && row.every(isTileValue));
}
const count = (value: unknown, fallback: number, cap = Number.MAX_SAFE_INTEGER) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(cap, Math.floor(value)) : fallback);

/** A usable game from whatever was stored: a corrupt or empty board starts a new game, missing extras get defaults. */
export function restore(saved: unknown, random: () => number, record = 0): Required<SavedState> {
  const s = saved as Partial<SavedState> | null;
  if (!s || !isBoard(s.board) || maxTile(s.board) === 0) return { board: addTile(addTile(emptyBoard(), random), random), score: 0, won: false, undos: UNDO_START, peak: 0, rec: record, prev: null };
  const prev = s.prev && isBoard(s.prev.board) && maxTile(s.prev.board) > 0 ? { board: cloneBoard(s.prev.board), score: count(s.prev.score, 0), won: s.prev.won === true } : null;
  const top = maxTile(s.board);
  return {
    board: cloneBoard(s.board), score: count(s.score, 0), won: typeof s.won === 'boolean' ? s.won : top >= WIN_TILE,
    undos: count(s.undos, UNDO_START, UNDO_CAP), peak: Math.max(top, count(s.peak, 0)), rec: count(s.rec, record), prev
  };
}

export function addTile(board: Board, random: () => number): Board {
  const copy = cloneBoard(board);
  const empty = copy.flatMap((row, y) => row.map((value, x) => (value === 0 ? { x, y } : undefined)).filter(Boolean)) as { x: number; y: number }[];
  if (empty.length) { const spot = empty[Math.floor(random() * empty.length)]; copy[spot.y][spot.x] = random() < .9 ? 2 : 4; }
  return copy;
}
export function tilesFromBoard(board: Board, nextId: () => number): Tile[] { return board.flatMap((row, y) => row.flatMap((value, x) => (value ? [{ id: nextId(), value, x, y }] : []))); }
export function boardFromTiles(tiles: Tile[]): Board { const board = emptyBoard(); tiles.forEach((tile) => { board[tile.y][tile.x] = tile.value; }); return board; }
export function spawnTile(tiles: Tile[], random: () => number, nextId: () => number): Tile {
  const open = emptyBoard().flatMap((row, y) => row.map((_, x) => (tiles.some((tile) => tile.x === x && tile.y === y) ? undefined : { x, y })).filter(Boolean)) as { x: number; y: number }[];
  const point = open[Math.floor(random() * open.length)];
  const tile = { id: nextId(), value: random() < .9 ? 2 : 4, ...point };
  tiles.push(tile); return tile;
}
function lineCells(direction: Direction, line: number): Array<{ x: number; y: number }> {
  const cells = Array.from({ length: SIZE }, (_, index) => (direction === 'left' || direction === 'right' ? { x: index, y: line } : { x: line, y: index }));
  return direction === 'right' || direction === 'down' ? cells.reverse() : cells;
}
/** Slides every line towards `direction`; each tile merges at most once per move. Merged tiles get a fresh id, movers keep theirs. */
export function resolveMove(source: Tile[], direction: Direction, nextId: () => number): MoveResult {
  const tiles: Tile[] = [], motions: Motion[] = [], merges: number[] = []; let gained = 0;
  for (let line = 0; line < SIZE; line++) {
    const cells = lineCells(direction, line);
    const current = cells.map((cell) => source.find((tile) => tile.x === cell.x && tile.y === cell.y)).filter((tile): tile is Tile => Boolean(tile));
    let targetIndex = 0;
    for (let index = 0; index < current.length; index++, targetIndex++) {
      const first = current[index], target = cells[targetIndex], second = current[index + 1];
      if (second && second.value === first.value) {
        const value = first.value * 2, merged = { id: nextId(), value, x: target.x, y: target.y };
        tiles.push(merged); merges.push(merged.id); motions.push({ id: first.id, ...target }, { id: second.id, ...target }); gained += value; index++;
      } else { tiles.push({ ...first, x: target.x, y: target.y }); motions.push({ id: first.id, ...target }); }
    }
  }
  const changed = motions.some((motion) => { const old = source.find((tile) => tile.id === motion.id)!; return old.x !== motion.x || old.y !== motion.y; }) || gained > 0;
  return { tiles, board: boardFromTiles(tiles), gained, changed, motions, merges };
}
export function canMove(board: Board): boolean { return board.some((row, y) => row.some((value, x) => value === 0 || value === row[x + 1] || value === board[y + 1]?.[x])); }

/** The tile to aim for next: double the biggest one on the board (never less than 16, so the first goal is not trivial). */
export const nextGoal = (top: number): number => Math.max(16, top * 2);
/** Undos after the best tile of this game rose from `peak` to `top`: one more for each new best from UNDO_REWARD_FROM up, capped. */
export function undosAfterPeak(undos: number, peak: number, top: number): number {
  return top > peak && top >= UNDO_REWARD_FROM ? Math.min(UNDO_CAP, undos + 1) : undos;
}

/** Background and digit colour per tile value. Every pair keeps a WCAG contrast of at least 4.5:1 (checked by the unit test). */
export type TileStyle = { bg: string; fg: string; glow?: string };
export const TILE_STYLES: Readonly<Record<number, TileStyle>> = {
  2: { bg: '#E8F9F1', fg: '#17241F' }, 4: { bg: '#BAF4DF', fg: '#17241F' }, 8: { bg: '#70F0C2', fg: '#10231C' }, 16: { bg: '#A2D4FF', fg: '#17243C' },
  32: { bg: '#A193FF', fg: '#15103D' }, 64: { bg: '#CDB2FF', fg: '#23133F' }, 128: { bg: '#FFE08A', fg: '#3A2500' }, 256: { bg: '#FFB86B', fg: '#3F1B05' },
  512: { bg: '#FF9670', fg: '#3D1208' }, 1024: { bg: '#FF7A88', fg: '#3A0A12' }, 2048: { bg: '#FFD34D', fg: '#3A2400', glow: '#FFD34D' },
  4096: { bg: '#C2187E', fg: '#FFFFFF', glow: '#FF5FB7' }, 8192: { bg: '#6A35D6', fg: '#FFFFFF', glow: '#A78BFF' }, 16384: { bg: '#1668C7', fg: '#FFFFFF', glow: '#6DB6FF' },
  32768: { bg: '#0E7C66', fg: '#FFFFFF', glow: '#70F0C2' }
};
/** Anything past the named ramp: near-black with gold digits. */
export const TOP_TILE_STYLE: TileStyle = { bg: '#10131F', fg: '#FFDA74', glow: '#FFDA74' };
export const tileStyle = (value: number): TileStyle => TILE_STYLES[value] ?? TOP_TILE_STYLE;
