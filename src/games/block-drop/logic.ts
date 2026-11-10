/**
 * Block Drop rules, free of DOM and time so they can be unit tested.
 * The well is 10 wide and 20 tall, plus two hidden rows above it where pieces enter.
 */
export const COLS = 10;
export const HIDDEN = 2;
export const ROWS = 20 + HIDDEN;
export const NEXT_COUNT = 3;

/** 0 I, 1 O, 2 T, 3 S, 4 Z, 5 J, 6 L. */
export type PieceType = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type Cell = readonly [x: number, y: number];
export type Piece = { type: PieceType; rot: number; x: number; y: number };

const BASE: readonly (readonly string[])[] = [
  ['....', '####', '....', '....'],
  ['##', '##'],
  ['.#.', '###', '...'],
  ['.##', '##.', '...'],
  ['##.', '.##', '...'],
  ['#..', '###', '...'],
  ['..#', '###', '...']
];
const turnCw = (grid: boolean[][]) => grid.map((_, y) => grid.map((__, x) => grid[grid.length - 1 - x][y]));
/** SHAPES[type][rotation] lists the filled cells inside the piece's bounding box. */
export const SHAPES: readonly (readonly (readonly Cell[])[])[] = BASE.map((rows) => {
  let grid = rows.map((row) => [...row].map((ch) => ch === '#'));
  return [0, 1, 2, 3].map(() => {
    const cells: Cell[] = [];
    grid.forEach((row, y) => row.forEach((on, x) => { if (on) cells.push([x, y]); }));
    grid = turnCw(grid);
    return cells;
  });
});

// Wall kicks tried in order when a turn is blocked, keyed by "from>to". y grows downward here.
const KICKS_3: Record<string, readonly Cell[]> = {
  '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]], '1>0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '1>2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]], '2>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '2>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]], '3>2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '3>0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]], '0>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]]
};
const KICKS_I: Record<string, readonly Cell[]> = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]], '1>0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]], '2>1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]], '3>2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]], '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]]
};

export type Game = {
  /** ROWS x COLS; 0 is empty, otherwise piece type + 1. */
  board: number[][];
  active: Piece | null;
  queue: PieceType[];
  hold: PieceType | null;
  canHold: boolean;
  score: number;
  lines: number;
  level: number;
  /** -1 when the last piece cleared nothing; 1 or more means consecutive clears. */
  combo: number;
  backToBack: boolean;
  over: boolean;
  pieces: number;
  /** True when the last successful action on the active piece was a turn. */
  turnedLast: boolean;
  /** Rows waiting to be removed by `finishClear`. */
  clearing: number[];
  random: () => number;
};

export type LockResult = {
  type: PieceType;
  cells: Cell[];
  rows: number[];
  spin: boolean;
  gained: number;
  combo: number;
  backToBack: boolean;
  perfect: boolean;
  levelUp: boolean;
  over: boolean;
};

const emptyRow = () => Array<number>(COLS).fill(0);

/** Fisher–Yates over the seven pieces: every piece arrives once per bag, so droughts stay short. */
export function newBag(random: () => number): PieceType[] {
  const bag: PieceType[] = [0, 1, 2, 3, 4, 5, 6];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

export const cellsOf = (piece: Piece): Cell[] => SHAPES[piece.type][piece.rot].map(([x, y]) => [piece.x + x, piece.y + y] as const);

export function collides(board: number[][], piece: Piece): boolean {
  return cellsOf(piece).some(([x, y]) => x < 0 || x >= COLS || y >= ROWS || (y >= 0 && board[y][x] !== 0));
}

const spawnPiece = (type: PieceType): Piece => ({ type, rot: 0, x: type === 1 ? 4 : 3, y: type === 0 ? 0 : 1 });

function refill(game: Game) {
  while (game.queue.length < NEXT_COUNT + 1) game.queue.push(...newBag(game.random));
}

/** Brings in a piece (the next one unless `type` is given). Ends the run when the entry cells are taken. */
export function spawn(game: Game, type?: PieceType): boolean {
  refill(game);
  const piece = spawnPiece(type ?? game.queue.shift()!);
  refill(game);
  game.turnedLast = false;
  if (collides(game.board, piece)) { game.active = null; game.over = true; return false; }
  // Step into view straight away when there is room, so the player always sees the new piece.
  const lower = { ...piece, y: piece.y + 1 };
  game.active = collides(game.board, lower) ? piece : lower;
  return true;
}

export function createGame(random: () => number): Game {
  const game: Game = {
    board: Array.from({ length: ROWS }, emptyRow), active: null, queue: [], hold: null, canHold: true,
    score: 0, lines: 0, level: 1, combo: -1, backToBack: false, over: false, pieces: 0, turnedLast: false, clearing: [], random
  };
  spawn(game);
  return game;
}

/** Moves the active piece; returns false (and changes nothing) when blocked. */
export function shift(game: Game, dx: number, dy: number): boolean {
  if (!game.active || game.over) return false;
  const next = { ...game.active, x: game.active.x + dx, y: game.active.y + dy };
  if (collides(game.board, next)) return false;
  game.active = next;
  game.turnedLast = false;
  return true;
}

/** Turns the active piece (1 clockwise, -1 counter-clockwise), nudging it off walls and blocks when needed. */
export function rotate(game: Game, dir: 1 | -1): boolean {
  const piece = game.active;
  if (!piece || game.over) return false;
  if (piece.type === 1) return true;
  const to = (piece.rot + dir + 4) % 4;
  const kicks = (piece.type === 0 ? KICKS_I : KICKS_3)[`${piece.rot}>${to}`];
  for (const [kx, ky] of kicks) {
    const next = { ...piece, rot: to, x: piece.x + kx, y: piece.y + ky };
    if (!collides(game.board, next)) { game.active = next; game.turnedLast = true; return true; }
  }
  return false;
}

export const isGrounded = (game: Game) => !!game.active && collides(game.board, { ...game.active, y: game.active.y + 1 });

/** The row the active piece would land on if dropped now. */
export function ghostY(game: Game): number {
  if (!game.active) return 0;
  let y = game.active.y;
  while (!collides(game.board, { ...game.active, y: y + 1 })) y++;
  return y;
}

/** Swaps the active piece with the held one. Allowed once per piece. */
export function holdPiece(game: Game): boolean {
  if (!game.active || game.over || !game.canHold) return false;
  const previous = game.hold;
  game.hold = game.active.type;
  spawn(game, previous ?? undefined);
  game.canHold = false;
  return true;
}

/** Milliseconds per row of gravity. Level 1 is a calm second; it tightens steadily to a 20 ms floor. */
export function gravityMs(level: number): number {
  const n = Math.min(Math.max(level, 1), 20) - 1;
  return Math.max(20, 1000 * (0.8 - n * 0.007) ** n);
}

export const LINE_POINTS = [0, 100, 300, 500, 800] as const;
export const SPIN_POINTS = [400, 800, 1200, 1600] as const;

/** A T that was turned into a slot with three of its four corners blocked. */
function isSpin(game: Game, piece: Piece): boolean {
  if (piece.type !== 2 || !game.turnedLast) return false;
  const corners: Cell[] = [[0, 0], [2, 0], [0, 2], [2, 2]];
  const blocked = corners.filter(([cx, cy]) => {
    const x = piece.x + cx, y = piece.y + cy;
    return x < 0 || x >= COLS || y >= ROWS || (y >= 0 && game.board[y][x] !== 0);
  });
  return blocked.length >= 3;
}

/**
 * Fixes the active piece into the well and scores it. Full rows stay on the board (listed in `rows`) until
 * `finishClear`, so the renderer can animate them; with no full rows the next piece arrives at once.
 */
export function lockPiece(game: Game): LockResult | null {
  const piece = game.active;
  if (!piece || game.over) return null;
  const spin = isSpin(game, piece);
  const cells = cellsOf(piece);
  cells.forEach(([x, y]) => { if (y >= 0) game.board[y][x] = piece.type + 1; });
  game.active = null;
  game.pieces++;
  game.canHold = true;

  const rows: number[] = [];
  game.board.forEach((row, y) => { if (row.every(Boolean)) rows.push(y); });
  const count = rows.length;
  const levelBefore = game.level;
  const difficult = count === 4 || (spin && count > 0);
  const backToBack = difficult && game.backToBack;
  let gained = (spin ? SPIN_POINTS[count] : LINE_POINTS[count]) * levelBefore;
  if (backToBack) gained = Math.round(gained * 1.5);
  if (count > 0) {
    game.combo = game.combo < 0 ? 0 : game.combo + 1;
    gained += 50 * game.combo * levelBefore;
    game.backToBack = difficult;
  } else game.combo = -1;
  const perfect = count > 0 && game.board.every((row, y) => rows.includes(y) || row.every((v) => v === 0));
  if (perfect) gained += 2000 * levelBefore;
  game.score += gained;
  game.lines += count;
  game.level = Math.max(game.level, 1 + Math.floor(game.lines / 10));

  // A piece that settles entirely above the visible well ends the run.
  const lockedOut = cells.every(([, y]) => y < HIDDEN);
  if (lockedOut) game.over = true;
  game.clearing = lockedOut ? [] : rows;
  if (!lockedOut && count === 0) spawn(game);
  return { type: piece.type, cells, rows, spin, gained, combo: Math.max(game.combo, 0), backToBack, perfect, levelUp: game.level > levelBefore, over: game.over };
}

/** Removes the rows `lockPiece` left marked and brings in the next piece. */
export function finishClear(game: Game): void {
  if (!game.clearing.length) return;
  const gone = new Set(game.clearing);
  const kept = game.board.filter((_, y) => !gone.has(y));
  game.board = [...Array.from({ length: ROWS - kept.length }, emptyRow), ...kept];
  game.clearing = [];
  if (!game.over) spawn(game);
}

/** How tall the stack is, in visible rows (0 for an empty well). */
export function stackHeight(game: Game): number {
  const top = game.board.findIndex((row) => row.some(Boolean));
  return top < 0 ? 0 : ROWS - top;
}
