import type { GameController, GameModule } from '../../core/game-types';

type Board = number[][];
type Direction = 'up' | 'down' | 'left' | 'right';
type SavedState = { board: Board; score: number };
type Tile = { id: number; value: number; x: number; y: number };
type Motion = { id: number; x: number; y: number };
type MoveResult = { tiles: Tile[]; board: Board; gained: number; changed: boolean; motions: Motion[]; merges: number[] };

const SIZE = 4;
const MOTION_MS = 150;
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
    let nextTileId = 1;
    let state = restore(services.storage.get<SavedState | null>('save', null), services.random);
    let tiles = tilesFromBoard(state.board, () => nextTileId++);
    let paused = false, completed = false, lost = false, animating = false, destroyed = false;
    let touchStart: { x: number; y: number } | undefined;
    let transitionTimer: number | undefined;
    let feedbackTimer: number | undefined;
    let activeAnimations: Animation[] = [];
    host.classList.add('merge-game');
    host.innerHTML = `
      <div class="game-hud" aria-live="polite"><span>Score <strong data-score></strong><i data-delta aria-hidden="true"></i></span><span>Best <strong data-best></strong></span></div>
      <div class="merge-board" role="application" aria-label="Merge 2048 board. Use arrow keys or swipe to move tiles." tabindex="0"></div>
      <p class="game-status" data-status></p>`;
    const boardEl = requireElement(host, '.merge-board');
    const scoreEl = requireElement(host, '[data-score]');
    const bestEl = requireElement(host, '[data-best]');
    const deltaEl = requireElement(host, '[data-delta]');
    const statusEl = requireElement(host, '[data-status]');
    const reduced = services.isReducedMotion;
    boardEl.style.position = 'relative';

    const stopVisuals = () => {
      if (transitionTimer !== undefined) window.clearTimeout(transitionTimer);
      if (feedbackTimer !== undefined) window.clearTimeout(feedbackTimer);
      transitionTimer = feedbackTimer = undefined;
      activeAnimations.forEach((animation) => animation.cancel()); activeAnimations = [];
      animating = false;
    };
    const animate = (element: Element | null, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
      if (reduced || !element || !('animate' in element)) return;
      const animation = (element as HTMLElement).animate(keyframes, options);
      activeAnimations.push(animation);
      animation.onfinish = animation.oncancel = () => { activeAnimations = activeAnimations.filter((item) => item !== animation); };
    };
    const place = (element: HTMLElement, x: number, y: number) => {
      element.style.left = `calc(9px + ${x} * ((100% - 45px) / 4))`;
      element.style.top = `calc(9px + ${y} * ((100% - 45px) / 4))`;
    };
    const tileElement = (tile: Tile, marker?: 'merge' | 'spawn') => {
      const element = document.createElement('div');
      element.className = `merge-tile tile-${tile.value}${marker ? ` merge-${marker}` : ''}`;
      element.dataset.tileId = String(tile.id); element.textContent = String(tile.value);
      element.style.position = 'absolute'; element.style.width = 'calc((100% - 45px) / 4)'; element.style.height = 'calc((100% - 45px) / 4)';
      place(element, tile.x, tile.y); return element;
    };
    const renderTiles = (spawnId?: number, mergeIds: number[] = []) => {
      boardEl.replaceChildren(...tiles.map((tile) => tileElement(tile, tile.id === spawnId ? 'spawn' : mergeIds.includes(tile.id) ? 'merge' : undefined)));
      if (!reduced) {
        if (spawnId) animate(boardEl.querySelector(`[data-tile-id="${spawnId}"]`), [{ transform: 'scale(.58)', opacity: .25 }, { transform: 'scale(1)', opacity: 1 }], { duration: 140, easing: 'cubic-bezier(.2,1.45,.35,1)' });
        mergeIds.forEach((id) => animate(boardEl.querySelector(`[data-tile-id="${id}"]`), [{ transform: 'scale(.78)' }, { transform: 'scale(1.14)', offset: .45 }, { transform: 'scale(1)' }], { duration: 160, easing: 'ease-out' }));
      }
    };
    const renderHud = (gain = 0) => {
      scoreEl.textContent = String(state.score);
      bestEl.textContent = String(Math.max(state.score, services.storage.get('best', 0)));
      deltaEl.textContent = gain ? `+${gain}` : '';
      if (gain && !reduced) animate(deltaEl, [{ transform: 'translateY(8px)', opacity: 0 }, { transform: 'translateY(-7px)', opacity: 1, offset: .35 }, { transform: 'translateY(-15px)', opacity: 0 }], { duration: 420, easing: 'ease-out' });
      if (completed) statusEl.textContent = '2048 reached — keep building!';
      else if (lost) statusEl.textContent = 'No moves left. Restart to try again.';
      else statusEl.textContent = '';
      boardEl.dataset.state = completed ? 'won' : lost ? 'lost' : '';
    };
    const render = (gain = 0, spawnId?: number, merges: number[] = []) => { renderTiles(spawnId, merges); renderHud(gain); };
    const persist = () => { services.storage.set('save', state); services.storage.set('best', Math.max(state.score, services.storage.get('best', 0))); services.reportScore(state.score); };
    const terminalFeedback = (won: boolean, gameOver: boolean) => {
      if (won) { services.sound.play('success'); animate(boardEl, [{ boxShadow: '0 0 0 #70f0c200' }, { boxShadow: '0 0 38px #70f0c2' }, { boxShadow: '0 0 0 #70f0c200' }], { duration: 520 }); }
      if (gameOver) { services.sound.play('fail'); animate(boardEl, [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 180 }); }
    };
    const noOp = () => {
      boardEl.dataset.state = 'noop';
      if (!reduced) animate(boardEl, [{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }], { duration: 120 });
      if (feedbackTimer !== undefined) window.clearTimeout(feedbackTimer);
      feedbackTimer = window.setTimeout(() => { if (!destroyed && !completed && !lost) boardEl.dataset.state = ''; }, reduced ? 0 : 130);
    };
    const finishMove = (gain: number, spawnId: number | undefined, merges: number[], won: boolean, gameOver: boolean) => {
      if (destroyed) return;
      transitionTimer = undefined; animating = false; render(gain, spawnId, merges); terminalFeedback(won, gameOver);
    };
    const move = (direction: Direction) => {
      if (paused || lost) return;
      if (animating) return;
      if (!canMove(state.board)) { lost = true; services.sound.play('fail'); render(); return; }
      const result = resolveMove(tiles, direction, () => nextTileId++);
      if (!result.changed) { noOp(); return; }
      const spawned = spawnTile(result.tiles, services.random, () => nextTileId++);
      tiles = result.tiles; state = { board: boardFromTiles(tiles), score: state.score + result.gained };
      const won = !completed && tiles.some((tile) => tile.value >= 2048);
      const gameOver = !canMove(state.board);
      completed ||= won; lost ||= gameOver; persist(); renderHud(result.gained);
      if (result.gained) services.sound.play('merge'); else services.sound.play('move');
      if (reduced) { finishMove(result.gained, spawned.id, result.merges, won, gameOver); return; }
      animating = true;
      result.motions.forEach((motion) => {
        const element = boardEl.querySelector<HTMLElement>(`[data-tile-id="${motion.id}"]`);
        if (!element) return;
        element.style.transition = `left ${MOTION_MS}ms cubic-bezier(.2,.8,.25,1), top ${MOTION_MS}ms cubic-bezier(.2,.8,.25,1)`;
        place(element, motion.x, motion.y);
      });
      transitionTimer = window.setTimeout(() => finishMove(result.gained, spawned.id, result.merges, won, gameOver), MOTION_MS);
    };
    const onKey = (event: KeyboardEvent) => {
      const directions: Record<string, Direction | undefined> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
      const direction = directions[event.key]; if (!direction) return; event.preventDefault(); move(direction);
    };
    const onPointerDown = (event: PointerEvent) => { touchStart = { x: event.clientX, y: event.clientY }; };
    const onPointerUp = (event: PointerEvent) => { if (!touchStart) return; const dx = event.clientX - touchStart.x, dy = event.clientY - touchStart.y; touchStart = undefined; if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return; move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')); };
    window.addEventListener('keydown', onKey, { passive: false }); boardEl.addEventListener('pointerdown', onPointerDown); boardEl.addEventListener('pointerup', onPointerUp);
    render(); boardEl.focus();
    return {
      pause() { paused = true; stopVisuals(); render(); },
      resume() { paused = false; boardEl.focus(); },
      restart() { stopVisuals(); state = restore(null, services.random); tiles = tilesFromBoard(state.board, () => nextTileId++); completed = false; lost = false; paused = false; persist(); render(); boardEl.focus(); },
      destroy() { destroyed = true; stopVisuals(); window.removeEventListener('keydown', onKey); boardEl.removeEventListener('pointerdown', onPointerDown); boardEl.removeEventListener('pointerup', onPointerUp); host.classList.remove('merge-game'); host.replaceChildren(); }
    };
  }
};

function requireElement(parent: HTMLElement, selector: string): HTMLElement { const element = parent.querySelector<HTMLElement>(selector); if (!element) throw new Error(`Missing game element: ${selector}`); return element; }
function restore(saved: SavedState | null, random: () => number): SavedState { if (saved && saved.board.length === SIZE && saved.board.every((row) => row.length === SIZE)) return saved; return { board: addTile(addTile(emptyBoard(), random), random), score: 0 }; }
function addTile(board: Board, random: () => number): Board { const copy = cloneBoard(board); const empty = copy.flatMap((row, y) => row.map((value, x) => value === 0 ? { x, y } : undefined).filter(Boolean)) as { x: number; y: number }[]; if (empty.length) { const spot = empty[Math.floor(random() * empty.length)]; copy[spot.y][spot.x] = random() < .9 ? 2 : 4; } return copy; }
function tilesFromBoard(board: Board, nextId: () => number): Tile[] { return board.flatMap((row, y) => row.flatMap((value, x) => value ? [{ id: nextId(), value, x, y }] : [])); }
function boardFromTiles(tiles: Tile[]): Board { const board = emptyBoard(); tiles.forEach((tile) => { board[tile.y][tile.x] = tile.value; }); return board; }
function spawnTile(tiles: Tile[], random: () => number, nextId: () => number): Tile { const open = emptyBoard().flatMap((row, y) => row.map((_, x) => tiles.some((tile) => tile.x === x && tile.y === y) ? undefined : { x, y }).filter(Boolean)) as { x: number; y: number }[]; const point = open[Math.floor(random() * open.length)]; const tile = { id: nextId(), value: random() < .9 ? 2 : 4, ...point }; tiles.push(tile); return tile; }
function lineCells(direction: Direction, line: number): Array<{ x: number; y: number }> { const cells = Array.from({ length: SIZE }, (_, index) => direction === 'left' || direction === 'right' ? { x: index, y: line } : { x: line, y: index }); return direction === 'right' || direction === 'down' ? cells.reverse() : cells; }
function resolveMove(source: Tile[], direction: Direction, nextId: () => number): MoveResult {
  const tiles: Tile[] = [], motions: Motion[] = [], merges: number[] = []; let gained = 0;
  for (let line = 0; line < SIZE; line++) {
    const cells = lineCells(direction, line); const current = cells.map((cell) => source.find((tile) => tile.x === cell.x && tile.y === cell.y)).filter((tile): tile is Tile => Boolean(tile)); let targetIndex = 0;
    for (let index = 0; index < current.length; index++, targetIndex++) { const first = current[index], target = cells[targetIndex], second = current[index + 1]; if (second && second.value === first.value) { const value = first.value * 2, merged = { id: nextId(), value, x: target.x, y: target.y }; tiles.push(merged); merges.push(merged.id); motions.push({ id: first.id, ...target }, { id: second.id, ...target }); gained += value; index++; } else { tiles.push({ ...first, x: target.x, y: target.y }); motions.push({ id: first.id, ...target }); } }
  }
  const board = boardFromTiles(tiles); return { tiles, board, gained, changed: motions.some((motion) => { const old = source.find((tile) => tile.id === motion.id)!; return old.x !== motion.x || old.y !== motion.y; }) || gained > 0, motions, merges };
}
function canMove(board: Board): boolean { return board.some((row, y) => row.some((value, x) => value === 0 || value === row[x + 1] || value === board[y + 1]?.[x])); }

export default game;
