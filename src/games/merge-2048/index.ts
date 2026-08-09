import type { GameController, GameModule } from '../../core/game-types';

type Board = number[][];
type Direction = 'up' | 'down' | 'left' | 'right';
type SavedState = { board: Board; score: number };

const SIZE = 4;
const emptyBoard = (): Board => Array.from({ length: SIZE }, () => Array<number>(SIZE).fill(0));
const cloneBoard = (board: Board) => board.map((row) => [...row]);

const game: GameModule = {
  meta: {
    slug: 'merge-2048', title: 'Merge 2048', category: 'puzzle', accent: '#70F0C2',
    description: 'Slide, combine, and build your biggest number.',
    instructions: 'Swipe the board or use arrow keys to merge equal tiles.',
    mechanic: 'Slide & merge'
  },
  mount(host, services): GameController {
    let state = restore(services.storage.get<SavedState | null>('save', null), services.random);
    let paused = false;
    let completed = false;
    let touchStart: { x: number; y: number } | undefined;
    host.classList.add('merge-game');
    host.innerHTML = `
      <div class="game-hud" aria-live="polite"><span>Score <strong data-score></strong></span><span>Best <strong data-best></strong></span></div>
      <div class="merge-board" role="application" aria-label="Merge 2048 board. Use arrow keys or swipe to move tiles." tabindex="0"></div>
      <p class="game-status" data-status></p>`;
    const boardEl = requireElement(host, '.merge-board');
    const scoreEl = requireElement(host, '[data-score]');
    const bestEl = requireElement(host, '[data-best]');
    const statusEl = requireElement(host, '[data-status]');

    const render = () => {
      boardEl.replaceChildren(...state.board.flatMap((row, rowIndex) => row.map((value, colIndex) => {
        const tile = document.createElement('div');
        tile.className = `merge-tile tile-${value || 'empty'}`;
        tile.style.gridArea = `${rowIndex + 1} / ${colIndex + 1}`;
        if (value) tile.textContent = String(value);
        return tile;
      })));
      scoreEl.textContent = String(state.score);
      bestEl.textContent = String(Math.max(state.score, services.storage.get('best', 0)));
      if (completed) statusEl.textContent = '2048 reached — keep building!';
      else if (!canMove(state.board)) statusEl.textContent = 'No moves left. Restart to try again.';
      else statusEl.textContent = '';
    };
    const persist = () => {
      services.storage.set('save', state);
      services.storage.set('best', Math.max(state.score, services.storage.get('best', 0)));
      services.reportScore(state.score);
    };
    const move = (direction: Direction) => {
      if (paused || !canMove(state.board)) return;
      const result = shift(state.board, direction);
      if (!result.changed) return;
      state = { board: addTile(result.board, services.random), score: state.score + result.gained };
      if (result.gained) services.sound.play('merge'); else services.sound.play('move');
      if (!completed && state.board.some((row) => row.some((value) => value >= 2048))) {
        completed = true; services.reportComplete(state.score); services.sound.play('success');
      }
      persist(); render();
    };
    const onKey = (event: KeyboardEvent) => {
      const directions: Record<string, Direction | undefined> = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        w: 'up', s: 'down', a: 'left', d: 'right'
      };
      const direction = directions[event.key];
      if (!direction) return;
      event.preventDefault(); move(direction);
    };
    const onPointerDown = (event: PointerEvent) => { touchStart = { x: event.clientX, y: event.clientY }; };
    const onPointerUp = (event: PointerEvent) => {
      if (!touchStart) return;
      const dx = event.clientX - touchStart.x;
      const dy = event.clientY - touchStart.y;
      touchStart = undefined;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
      move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    };
    window.addEventListener('keydown', onKey, { passive: false });
    boardEl.addEventListener('pointerdown', onPointerDown);
    boardEl.addEventListener('pointerup', onPointerUp);
    render(); boardEl.focus();
    return {
      pause() { paused = true; },
      resume() { paused = false; boardEl.focus(); },
      restart() { state = restore(null, services.random); completed = false; persist(); render(); boardEl.focus(); },
      destroy() {
        window.removeEventListener('keydown', onKey);
        boardEl.removeEventListener('pointerdown', onPointerDown);
        boardEl.removeEventListener('pointerup', onPointerUp);
        host.replaceChildren();
      }
    };
  }
};

function requireElement(parent: HTMLElement, selector: string): HTMLElement {
  const element = parent.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing game element: ${selector}`);
  return element;
}

function restore(saved: SavedState | null, random: () => number): SavedState {
  if (saved && saved.board.length === SIZE && saved.board.every((row) => row.length === SIZE)) return saved;
  return { board: addTile(addTile(emptyBoard(), random), random), score: 0 };
}

function addTile(board: Board, random: () => number): Board {
  const copy = cloneBoard(board);
  const empty = copy.flatMap((row, y) => row.map((value, x) => value === 0 ? { x, y } : undefined).filter(Boolean)) as { x: number; y: number }[];
  if (empty.length) {
    const spot = empty[Math.floor(random() * empty.length)];
    copy[spot.y][spot.x] = random() < 0.9 ? 2 : 4;
  }
  return copy;
}

function shift(board: Board, direction: Direction): { board: Board; gained: number; changed: boolean } {
  const result = emptyBoard(); let gained = 0;
  const coordinates = direction === 'left' || direction === 'right'
    ? Array.from({ length: SIZE }, (_, row) => ({ row, col: undefined }))
    : Array.from({ length: SIZE }, (_, col) => ({ row: undefined, col }));
  for (const line of coordinates) {
    const values = Array.from({ length: SIZE }, (_, index) => direction === 'left' || direction === 'right'
      ? board[line.row as number][index] : board[index][line.col as number]);
    if (direction === 'right' || direction === 'down') values.reverse();
    const compact = values.filter(Boolean);
    const merged: number[] = [];
    for (let index = 0; index < compact.length; index += 1) {
      if (compact[index] === compact[index + 1]) { const value = compact[index] * 2; merged.push(value); gained += value; index += 1; }
      else merged.push(compact[index]);
    }
    while (merged.length < SIZE) merged.push(0);
    if (direction === 'right' || direction === 'down') merged.reverse();
    merged.forEach((value, index) => {
      if (direction === 'left' || direction === 'right') result[line.row as number][index] = value;
      else result[index][line.col as number] = value;
    });
  }
  return { board: result, gained, changed: result.some((row, y) => row.some((value, x) => value !== board[y][x])) };
}

function canMove(board: Board): boolean {
  return board.some((row, y) => row.some((value, x) => value === 0 || value === row[x + 1] || value === board[y + 1]?.[x]));
}

export default game;
