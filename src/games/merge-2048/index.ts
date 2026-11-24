import type { GameController, GameModule } from '../../core/game-types';
import { dailyKey, dailySeed, dailyShareText, readDaily, recordDaily } from '../_shared/daily';
import {
  CELEBRATE_FROM, SIZE, TILE_STYLES, TOP_TILE_STYLE, UNDO_REWARD_FROM, WIN_TILE,
  boardFromTiles, canMove, cloneBoard, emptyBoard, maxTile, nextGoal, resolveMove, restore, seededSpawn, spawnTile, tileStyle, tilesFromBoard, undosAfterPeak,
  type Cell, type Direction, type SavedState, type Snapshot, type Tile
} from './logic';
import { MOVE_PUZZLES, puzzleStars, twoStarMoves } from './puzzles';

/** English or Chinese, picked from the browser language like the other cabinets; evaluated at render time. */
const zh = () => /^zh\b/i.test(globalThis.navigator?.language || '');
const tr = (en: string, cn: string) => (zh() ? cn : en);

type ModeId = 'classic' | 'small' | 'large' | 'stones' | 'daily' | 'puzzle';
/** Each board keeps its own save and best; only the classic 4×4 keeps the original keys and reports to the leaderboard. */
const MODES: Record<ModeId, { label: readonly [string, string]; size: number; save: string; best: string }> = {
  classic: { label: ['4×4', '4×4'], size: 4, save: 'save', best: 'best' },
  small: { label: ['3×3', '3×3'], size: 3, save: 'save-3', best: 'best-3' },
  large: { label: ['5×5', '5×5'], size: 5, save: 'save-5', best: 'best-5' },
  stones: { label: ['Stones', '石块'], size: 4, save: 'save-stones', best: 'best-stones' },
  daily: { label: ['Daily', '每日'], size: 4, save: 'save-daily', best: 'best-daily' },
  puzzle: { label: ['Puzzles', '谜题'], size: 4, save: '', best: '' }
};
const MODE_ORDER: readonly ModeId[] = ['classic', 'small', 'large', 'stones', 'daily', 'puzzle'];
const DAILY_MOVES = 150;
/** Stones variant: two blockers on inner cells, never touching each other, picked per game. */
function pickStones(random: () => number): Cell[] {
  const inner = [1, 2].flatMap((y) => [0, 1, 2, 3].map((x) => ({ x, y })));
  const first = inner[Math.floor(random() * inner.length)];
  const rest = inner.filter((c) => Math.abs(c.x - first.x) + Math.abs(c.y - first.y) > 1);
  return [first, rest[Math.floor(random() * rest.length)]];
}
type PanelId = 'none' | 'won' | 'lost' | 'daily' | 'solved' | 'failed' | 'picker';
type ModeSave = SavedState & { stones?: Cell[]; moves?: number; key?: string };

const MOTION_MS = 150;
/** A swipe fires as soon as the finger has travelled this far, without waiting for it to lift. */
const SWIPE_PX = 26;
/** A quick flick that ends before SWIPE_PX still counts from this distance. */
const FLICK_PX = 14;
/** How long a freshly shown panel ignores movement keys, so a held or mashed key cannot dismiss it unseen. */
const PANEL_LOCK_MS = 700;

const STYLE_ID = 'merge-2048-style';
const CELL = '((100% - (var(--n, 4) + 1) * var(--g)) / var(--n, 4))';
const CSS = `
.merge-game{--g:9px;align-content:center;justify-items:center;gap:12px}
.merge-game>.game-hud,.merge-game>.m48-bar,.merge-game>.game-status,.merge-game>.m48-modes{width:min(100%,440px)}
.merge-game .m48-modes{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}
.merge-game .m48-modes button{flex:1 1 0;min-height:38px;min-width:0;padding:4px 3px;border:1px solid #273149;border-radius:10px;background:#12192A;color:#A8B1C5;font-weight:800;font-size:.74rem;touch-action:manipulation}
@media(pointer:coarse){.merge-game .m48-modes{padding:0 54px}.merge-game .m48-modes button{flex:1 1 28%;min-height:34px}}
.merge-game .m48-modes button[aria-pressed=true]{background:#70F0C2;border-color:#70F0C2;color:#071712}
.merge-game .m48-modes button:focus-visible{outline:3px solid #70F0C2;outline-offset:2px}
.merge-game .m48-stone{position:absolute;width:calc(${CELL});height:calc(${CELL});left:calc(var(--g) + var(--x) * (${CELL} + var(--g)));top:calc(var(--g) + var(--y) * (${CELL} + var(--g)));border-radius:10px;z-index:1;background:repeating-linear-gradient(135deg,#3a4566 0 6px,#323c5a 6px 12px);box-shadow:inset 0 0 0 2px #52617f}
.merge-game .m48-panel.is-picker .m48-card{max-height:100%;overflow:auto;padding:10px 12px;gap:6px}.merge-game .m48-panel.is-picker h2{font-size:1.3rem}.merge-game .m48-panel.is-picker p{font-size:.8rem}
.merge-game .m48-picker{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;width:100%}
/* On a small board the picker card scrolls; Back stays pinned to its bottom edge so it never needs a scroll to reach. */
.merge-game .m48-panel.is-picker .m48-actions{position:sticky;bottom:-10px;z-index:1;width:calc(100% + 24px);margin:2px -12px -10px;padding:6px 12px 10px;background:#12192A;border-top:1px solid #273149}
.merge-game .m48-panel.is-picker .m48-actions .m48-btn{min-height:40px;padding:6px 18px}
@media(max-width:400px){.merge-game .m48-picker{gap:4px}.merge-game .m48-picker button{min-height:34px}.merge-game .m48-panel.is-picker p{font-size:.72rem}}
.merge-game .m48-picker button{scroll-margin:8px 0 72px}
.merge-game .m48-picker button{min-height:40px;padding:2px 0;border:1px solid #52617f;border-radius:10px;background:#182039;color:#F7F9FF;font-weight:900;line-height:1.1}
.merge-game .m48-picker button small{display:block;font-size:.62rem;color:#FFDA74;letter-spacing:-.05em}
.merge-game .m48-picker button:disabled{opacity:.4}
.merge-game .m48-picker button:focus-visible,.merge-game .m48-picker button.is-current{outline:3px solid #70F0C2;outline-offset:1px}
.merge-game .m48-stars{font-size:2.2rem;line-height:1;color:#FFD34D;letter-spacing:.05em}.merge-game .m48-stars span{color:#273149}
.merge-game>.game-hud>span{position:relative}
.merge-game>.game-hud strong{font-variant-numeric:tabular-nums}
.merge-game [data-delta]{position:absolute;left:100%;bottom:3px;margin-left:8px;color:#70F0C2;font-style:normal;font-weight:800;font-size:1rem;letter-spacing:0;white-space:nowrap;pointer-events:none}
.merge-game [data-best-box].is-record strong{color:#FFDA74}
.merge-game .m48-bar{display:flex;justify-content:space-between;align-items:center;gap:12px}
.merge-game .m48-goal{display:inline-flex;align-items:center;gap:8px;color:#A8B1C5;font-size:.78rem;text-transform:uppercase;letter-spacing:.1em}
.merge-game .m48-goal b{min-width:2.7em;padding:5px 9px;border-radius:8px;font-size:1.02rem;font-weight:900;letter-spacing:-.02em;text-align:center}
.merge-game .m48-undo{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:6px 12px 6px 14px;border:1px solid #52617f;border-radius:12px;background:#182039;color:#F7F9FF;font-weight:800;font-size:.95rem;touch-action:manipulation}
.merge-game .m48-undo b{min-width:1.9em;padding:2px 7px;border-radius:99px;background:#70F0C2;color:#071712;font-size:.85rem;text-align:center}
.merge-game .m48-undo:disabled{color:#A8B1C5;border-color:#273149;cursor:default}
.merge-game .m48-undo:disabled b{background:#273149;color:#A8B1C5}
.merge-game .m48-undo:not(:disabled):active{background:#273149}
.merge-game .m48-undo:focus-visible,.merge-game .m48-btn:focus-visible{outline:3px solid #70F0C2;outline-offset:2px}
.merge-game .m48-wrap{position:relative;width:min(100%,440px)}
.game-stage.is-immersive.merge-game{touch-action:none}
.game-stage.is-immersive.merge-game .m48-wrap{width:min(100%,440px,max(200px,100dvh - 250px))}
.merge-game .merge-board{display:block;position:relative;width:100%;padding:0;container-type:inline-size}
.merge-game .m48-cell,.merge-game .merge-tile{position:absolute;width:calc(${CELL});height:calc(${CELL});left:calc(var(--g) + var(--x) * (${CELL} + var(--g)));top:calc(var(--g) + var(--y) * (${CELL} + var(--g)));border-radius:10px}
.merge-game .m48-cell{background:#1c2542}
.merge-game .merge-tile{z-index:1;line-height:1;letter-spacing:-.04em;box-shadow:inset 0 -3px 0 #00000022;font-size:clamp(1.15rem,7vw,2.4rem);font-size:calc(42cqw / var(--n, 4));user-select:none;-webkit-user-select:none}
.merge-game .merge-tile.merge-merge{z-index:2}
.merge-game .merge-tile.d3{font-size:clamp(1rem,6vw,2rem);font-size:calc(33.6cqw / var(--n, 4))}
.merge-game .merge-tile.d4{font-size:clamp(.9rem,4.8vw,1.6rem);font-size:calc(26.8cqw / var(--n, 4))}
.merge-game .merge-tile.d5{font-size:clamp(.8rem,4vw,1.3rem);font-size:calc(22cqw / var(--n, 4))}
.merge-game .merge-tile.d6{font-size:clamp(.72rem,3.4vw,1.1rem);font-size:calc(18.4cqw / var(--n, 4))}
${Object.entries(TILE_STYLES).map(([value, s]) => `.merge-game .tile-${value}{background:${s.bg};color:${s.fg}${s.glow ? `;box-shadow:inset 0 -3px 0 #00000022,0 0 16px ${s.glow}88` : ''}}`).join('\n')}
.merge-game .tile-top{background:${TOP_TILE_STYLE.bg};color:${TOP_TILE_STYLE.fg};box-shadow:inset 0 0 0 2px ${TOP_TILE_STYLE.fg},0 0 16px ${TOP_TILE_STYLE.glow}88}
.merge-game .merge-board[data-state=lost] .merge-tile{filter:saturate(.6) brightness(.85)}
.merge-game .m48-fx{position:absolute;inset:0;z-index:3;pointer-events:none}
.merge-game .m48-fx i{position:absolute;width:12px;height:12px;margin:-6px;border-radius:50%}
.merge-game .m48-panel{position:absolute;inset:0;z-index:4;display:grid;place-items:center;padding:10px;border-radius:18px;background:#090d18a6;text-align:center}
.merge-game .m48-card{display:grid;justify-items:center;gap:8px;max-width:100%;padding:16px 18px;border:1px solid #52617f;border-radius:16px;background:#12192Af5;box-shadow:0 14px 40px #000a}
.merge-game .m48-panel h2{margin:0;font-size:clamp(1.45rem,7vw,2.1rem);letter-spacing:-.03em;color:#F7F9FF}
.merge-game .m48-panel.is-won h2{color:#FFD34D}
.merge-game .m48-panel p{margin:0;color:#C5CDE0;font-size:.95rem;line-height:1.35}
.merge-game .m48-panel p.is-record{color:#FFDA74;font-weight:800}
.merge-game .m48-actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:6px}
.merge-game .m48-btn{display:inline-flex;align-items:center;gap:8px;min-height:46px;padding:10px 18px;border:1px solid transparent;border-radius:12px;background:#70F0C2;color:#071712;font-weight:900;font-size:1rem;touch-action:manipulation}
.merge-game .m48-btn.is-alt{background:#182039;color:#F7F9FF;border-color:#52617f}
.merge-game.is-motion .m48-panel{animation:m48-in .3s ease both}
.merge-game.is-motion .m48-panel.is-lost{animation-delay:.45s}
.merge-game>.game-status{min-height:2.5em;line-height:1.25}
@keyframes m48-in{from{opacity:0;transform:scale(.96)}}
@media(max-width:380px){.merge-game{--g:6px}}
@media(max-height:640px){.game-stage.is-immersive.merge-game>.game-hud{padding-left:54px}.game-stage.is-immersive.merge-game>.m48-modes:not([hidden])+.game-hud{padding-left:0}}
`;

const hint = () => tr('Swipe or press the arrow keys. Matching tiles merge.', '滑动或按方向键，相同的数字会合并。');
const UNDO_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>';
const fmt = (n: number) => n.toLocaleString('en-US');

const game: GameModule = {
  meta: {
    slug: 'merge-2048', title: 'Merge 2048', category: 'puzzle', accent: '#70F0C2',
    description: 'Slide, combine, and build your biggest number.',
    instructions: 'Swipe the board or use arrow keys to merge equal tiles. Press U or tap Undo to take back a move — new best tiles from 128 up earn more undos.',
    mechanic: 'Slide & merge'
  },
  mount(host, services): GameController {
    if (!document.getElementById(STYLE_ID)) { const style = document.createElement('style'); style.id = STYLE_ID; style.textContent = CSS; document.head.append(style); }
    let nextTileId = 1;
    const nextId = () => nextTileId++;
    const store = services.storage;
    /** Split-screen versus mounts two boards; a seat has no pointer of its own, so it gets keyboard-only shortcuts. */
    const inVersus = () => Boolean(host.closest('[data-versus-seat]'));
    // Split-screen seats always play the classic 4×4 and never read or write the solo mode settings.
    let mode: ModeId = 'classic';
    if (!inVersus()) { const saved = store.get<string>('mode', 'classic'); if ((MODE_ORDER as readonly string[]).includes(saved)) mode = saved as ModeId; }
    let puzzleIndex = Math.min(MOVE_PUZZLES.length - 1, Math.max(0, Math.floor(store.get<number>('puzzle-index', 0)) || 0));
    let size = SIZE, stones: Cell[] = [], moves = 0, dayKey = dailyKey(), seed = 0;
    /** Puzzles allow any number of undos (spawns are fixed, so nothing can be re-rolled); this is their history. */
    let history: Snapshot[] = [];
    let state = restore(null, services.random, 0);
    let tiles: Tile[] = [];
    let paused = false, completed = false, lost = false, animating = false, destroyed = false;
    let panel: PanelId = 'none', shownPanel = '', panelAt = 0;
    /** One-line message under the board for the thing that just happened; cleared by the next move. */
    let note = '';
    /** A move asked for while the previous slide is still animating; it runs the moment that slide lands. */
    let queued: Direction | undefined;
    let touchStart: { x: number; y: number; id: number } | undefined;
    let transitionTimer: number | undefined;
    let feedbackTimer: number | undefined;
    let activeAnimations: Animation[] = [];
    let shareLine = '';
    const reduced = services.isReducedMotion;
    const seeded = () => mode === 'daily' || mode === 'puzzle';
    const info = () => MODES[mode];
    const bestFor = () => (mode === 'puzzle' ? 0 : mode === 'daily' ? (readDaily(store).scores[dayKey] ?? 0) : store.get(info().best, 0));
    host.classList.add('merge-game'); host.classList.toggle('is-motion', !reduced);
    host.innerHTML = `
      <div class="m48-modes" data-modes${inVersus() ? ' hidden' : ''}>${MODE_ORDER.map((m) => `<button type="button" data-mode="${m}" aria-pressed="false">${tr(...MODES[m].label)}</button>`).join('')}</div>
      <div class="game-hud" aria-live="polite"><span><span data-score-label>${tr('Score', '得分')}</span> <strong data-score></strong><i data-delta aria-hidden="true"></i></span><span data-best-box><span data-best-label>${tr('Best', '最佳')}</span> <strong data-best></strong></span></div>
      <div class="m48-bar"><span class="m48-goal"><span data-goal-label>${tr('Next goal', '下一目标')}</span> <b data-goal></b></span><button type="button" class="m48-undo" data-m48="undo">${UNDO_ICON} ${tr('Undo', '撤销')} <b data-undos></b></button></div>
      <div class="m48-wrap"><div class="merge-board" role="application" aria-label="${tr('Merge 2048 board. Use arrow keys or swipe to move tiles. Press U to undo.', '合并 2048 棋盘。用方向键或滑动移动方块，按 U 撤销。')}" tabindex="0"></div><div class="m48-fx" aria-hidden="true"></div><div class="m48-panel" data-panel hidden></div></div>
      <p class="game-status" data-status role="status"></p>`;
    const boardEl = requireElement(host, '.merge-board');
    const scoreEl = requireElement(host, '[data-score]');
    const scoreLabel = requireElement(host, '[data-score-label]');
    const bestEl = requireElement(host, '[data-best]');
    const bestLabel = requireElement(host, '[data-best-label]');
    const bestBox = requireElement(host, '[data-best-box]');
    const deltaEl = requireElement(host, '[data-delta]');
    const statusEl = requireElement(host, '[data-status]');
    const goalEl = requireElement(host, '[data-goal]');
    const goalLabel = requireElement(host, '[data-goal-label]');
    const undoEl = requireElement(host, '[data-m48="undo"]') as HTMLButtonElement;
    const undosEl = requireElement(host, '[data-undos]');
    const fxEl = requireElement(host, '.m48-fx');
    const panelEl = requireElement(host, '[data-panel]');
    const modesEl = requireElement(host, '[data-modes]');
    let cells: HTMLElement[] = [];
    const buildCells = () => {
      host.style.setProperty('--n', String(size));
      cells = Array.from({ length: size * size }, (_, index) => {
        const x = index % size, y = Math.floor(index / size), stone = stones.some((c) => c.x === x && c.y === y);
        const cell = document.createElement('div'); cell.className = stone ? 'm48-stone' : 'm48-cell';
        if (stone) cell.setAttribute('aria-label', tr('Stone', '石块'));
        place(cell, x, y); return cell;
      });
      boardEl.setAttribute('aria-label', tr(`Merge 2048 board, ${size} by ${size}${stones.length ? ' with two stones' : ''}. Use arrow keys or swipe to move tiles.${seeded() && mode === 'daily' ? '' : ' Press U to undo.'}`,
        `合并 2048 棋盘，${size}×${size}${stones.length ? '，有两块石头' : ''}。用方向键或滑动移动方块。${seeded() && mode === 'daily' ? '' : '按 U 撤销。'}`));
      modesEl.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    };

    /** Loads (or starts) the game for the current mode. Each mode keeps its own save; classic uses the original keys. */
    const loadMode = (fresh = false) => {
      size = mode === 'puzzle' ? MOVE_PUZZLES[puzzleIndex].rows.length : info().size;
      history = []; moves = 0; stones = []; note = ''; shareLine = '';
      if (mode === 'puzzle') {
        const p = MOVE_PUZZLES[puzzleIndex];
        stones = p.stones ? p.stones.map((c) => ({ ...c })) : []; seed = p.seed;
        state = { board: cloneBoard(p.rows), score: 0, won: false, undos: 0, peak: maxTile(p.rows), rec: 0, prev: null };
      } else if (mode === 'daily') {
        dayKey = dailyKey(); seed = dailySeed('merge-2048', dayKey);
        const saved = fresh ? null : store.get<ModeSave | null>(info().save, null);
        if (saved && saved.key === dayKey && Number.isFinite(saved.moves)) { state = restore(saved, services.random, 0, 4); moves = Math.max(0, Math.floor(saved.moves!)); }
        else {
          // The opening two tiles come from the same seeded rule, so the Daily starts identically for everyone.
          let board = emptyBoard(4);
          for (const m of [-2, -1]) { const t = seededSpawn(board, seed, m)!; board = cloneBoard(board); board[t.y][t.x] = t.value; }
          state = { board, score: 0, won: false, undos: 0, peak: maxTile(board), rec: bestFor(), prev: null };
        }
      } else {
        const saved = fresh ? null : store.get<ModeSave | null>(info().save, null);
        if (mode === 'stones') stones = saved?.stones?.length === 2 ? saved.stones.map((c) => ({ x: c.x, y: c.y })) : pickStones(services.random);
        state = restore(saved, services.random, store.get(info().best, 0), size, stones);
        if (stones.length && state.board.some((row, y) => row.some((v, x) => v && stones.some((c) => c.x === x && c.y === y)))) { stones = pickStones(services.random); state = restore(null, services.random, state.rec, size, stones); }
      }
      tiles = tilesFromBoard(state.board, nextId);
      completed = mode === 'puzzle' || mode === 'daily' ? false : state.won;
      lost = !canMove(state.board, stones);
      // Force the panel to redraw (or hide) after a mode change or a new game.
      panel = 'none'; shownPanel = '-';
      if (mode === 'daily' && (moves >= DAILY_MOVES || lost)) panel = 'daily';
      else if (lost) panel = mode === 'puzzle' ? 'failed' : 'lost';
      buildCells();
    };

    const stopVisuals = () => {
      if (transitionTimer !== undefined) window.clearTimeout(transitionTimer);
      if (feedbackTimer !== undefined) window.clearTimeout(feedbackTimer);
      transitionTimer = feedbackTimer = undefined;
      activeAnimations.forEach((animation) => animation.cancel()); activeAnimations = [];
      fxEl.replaceChildren();
      animating = false; queued = undefined;
    };
    const animate = (element: Element | null, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
      if (reduced || !element || !('animate' in element)) return undefined;
      const animation = (element as HTMLElement).animate(keyframes, options);
      activeAnimations.push(animation);
      animation.onfinish = animation.oncancel = () => { activeAnimations = activeAnimations.filter((item) => item !== animation); };
      return animation;
    };
    const tileElement = (tile: Tile, marker?: 'merge' | 'spawn') => {
      const element = document.createElement('div'), digits = String(tile.value).length;
      element.className = `merge-tile tile-${tile.value}${TILE_STYLES[tile.value] ? '' : ' tile-top'}${digits >= 3 ? ` d${Math.min(6, digits)}` : ''}${marker ? ` merge-${marker}` : ''}`;
      element.dataset.tileId = String(tile.id); element.textContent = String(tile.value);
      place(element, tile.x, tile.y); return element;
    };
    /** Sparks flying out of the tile that just became the biggest one of this game. */
    const celebrate = (element: HTMLElement | null, value: number) => {
      if (reduced || !element) return;
      const color = tileStyle(value).glow ?? tileStyle(value).bg, x = element.offsetLeft + element.offsetWidth / 2, y = element.offsetTop + element.offsetHeight / 2, reach = element.offsetWidth * .95;
      animate(element, [{ transform: 'scale(.8)' }, { transform: 'scale(1.26)', offset: .4 }, { transform: 'scale(1)' }], { duration: 420, easing: 'ease-out' });
      for (let i = 0; i < 12; i++) {
        const spark = document.createElement('i'), angle = (Math.PI * 2 * i) / 12 + .26, far = reach * (i % 2 ? 1 : .66);
        spark.style.left = `${x}px`; spark.style.top = `${y}px`; spark.style.background = i % 3 ? color : '#F7F9FF';
        fxEl.append(spark);
        const animation = animate(spark, [{ transform: 'translate(0,0) scale(1.2)', opacity: 1 }, { transform: `translate(${Math.cos(angle) * far}px,${Math.sin(angle) * far}px) scale(.35)`, opacity: 0 }], { duration: 720, easing: 'cubic-bezier(.15,.7,.3,1)', fill: 'forwards' });
        if (animation) animation.addEventListener('finish', () => spark.remove()); else spark.remove();
      }
    };
    const renderTiles = (spawnId?: number, mergeIds: number[] = [], starId?: number) => {
      boardEl.replaceChildren(...cells, ...tiles.map((tile) => tileElement(tile, tile.id === spawnId ? 'spawn' : mergeIds.includes(tile.id) ? 'merge' : undefined)));
      if (!reduced) {
        if (spawnId) animate(boardEl.querySelector(`[data-tile-id="${spawnId}"]`), [{ transform: 'scale(.58)', opacity: .25 }, { transform: 'scale(1)', opacity: 1 }], { duration: 140, easing: 'cubic-bezier(.2,1.45,.35,1)' });
        mergeIds.forEach((id) => { if (id !== starId) animate(boardEl.querySelector(`[data-tile-id="${id}"]`), [{ transform: 'scale(.78)' }, { transform: 'scale(1.14)', offset: .45 }, { transform: 'scale(1)' }], { duration: 160, easing: 'ease-out' }); });
        if (starId) celebrate(boardEl.querySelector<HTMLElement>(`[data-tile-id="${starId}"]`), tiles.find((tile) => tile.id === starId)?.value ?? 0);
      }
    };
    const stars = (n: number) => `<div class="m48-stars" aria-label="${tr(`${n} of 3 stars`, `${n}/3 星`)}">${'★'.repeat(n)}<span>${'★'.repeat(3 - n)}</span></div>`;
    const puzzleStarList = () => { const list = store.get<number[]>('puzzle-stars', []); return MOVE_PUZZLES.map((_, i) => Math.max(0, Math.min(3, Number(list[i]) || 0))); };
    const puzzleOpen = (i: number, list = puzzleStarList()) => i < 3 || list[i - 1] > 0 || list[i] > 0;
    const renderPanel = () => {
      const key = panel === 'none' ? '' : `${panel}:${state.score}:${state.undos}:${Boolean(state.prev)}:${moves}:${puzzleIndex}:${history.length}`;
      if (key === shownPanel) return;
      const opening = !shownPanel.startsWith(panel); shownPanel = key;
      panelEl.hidden = panel === 'none';
      if (panel === 'none') { panelEl.replaceChildren(); return; }
      panelEl.className = `m48-panel is-${panel === 'solved' || panel === 'daily' ? 'won' : panel === 'failed' ? 'lost' : panel}`;
      const best = Math.max(state.score, bestFor()), top = maxTile(state.board), canUndo = Boolean(state.prev) && state.undos > 0;
      if (panel === 'won') {
        panelEl.innerHTML = `<div class="m48-card"><h2>${WIN_TILE}!</h2><p>${tr(`You built the ${WIN_TILE} tile with ${fmt(state.score)} points.<br>How much further can you take it?`, `你用 ${fmt(state.score)} 分拼出了 ${WIN_TILE}！<br>还能走多远？`)}</p><div class="m48-actions"><button type="button" class="m48-btn" data-m48="keep">${tr('Keep going', '继续')}</button><button type="button" class="m48-btn is-alt" data-m48="retry">${tr('New game', '新游戏')}</button></div></div>`;
      } else if (panel === 'lost') {
        const record = state.score > state.rec && state.score > 0;
        panelEl.innerHTML = `<div class="m48-card"><h2>${tr('No moves left', '无路可走')}</h2><p>${tr(`Score ${fmt(state.score)} · biggest tile ${top}`, `得分 ${fmt(state.score)} · 最大方块 ${top}`)}</p><p class="${record ? 'is-record' : ''}">${record ? tr('New best score!', '新纪录！') : tr(`Best ${fmt(best)} · ${fmt(best - state.score)} more to beat it`, `最佳 ${fmt(best)} · 还差 ${fmt(best - state.score)} 分`)}</p><div class="m48-actions"><button type="button" class="m48-btn" data-m48="retry">${tr('Try again', '再来一局')}</button>${canUndo ? `<button type="button" class="m48-btn is-alt" data-m48="undo">${UNDO_ICON} ${tr('Undo', '撤销')} (${state.undos})</button>` : ''}</div>${inVersus() ? `<p>${tr('Or move to start a new board.', '或者移动一下开新的一局。')}</p>` : ''}</div>`;
      } else if (panel === 'daily') {
        const d = readDaily(store);
        panelEl.innerHTML = `<div class="m48-card"><h2>${tr('Daily done', '今日挑战完成')}</h2><p>${tr(`${dayKey} · ${moves} moves · biggest tile ${top}`, `${dayKey} · ${moves} 步 · 最大方块 ${top}`)}</p><p class="is-record">${tr(`Score ${fmt(state.score)} · today's best ${fmt(d.scores[dayKey] ?? state.score)}`, `得分 ${fmt(state.score)} · 今日最佳 ${fmt(d.scores[dayKey] ?? state.score)}`)}</p><p>${tr(`Streak ${d.streak} · played ${d.played}`, `连续 ${d.streak} 天 · 共玩 ${d.played} 次`)}</p><div class="m48-actions"><button type="button" class="m48-btn" data-m48="share">${tr('Copy result', '复制成绩')}</button><button type="button" class="m48-btn is-alt" data-m48="retry">${tr('Replay daily', '重玩今日')}</button><button type="button" class="m48-btn is-alt" data-mode="classic">${tr('Classic', '经典')}</button></div></div>`;
      } else if (panel === 'solved' || panel === 'failed') {
        const p = MOVE_PUZZLES[puzzleIndex], n = panel === 'solved' ? puzzleStars(p, moves) : 0, more = puzzleIndex + 1 < MOVE_PUZZLES.length;
        const heading = panel === 'solved' ? tr(`Puzzle ${puzzleIndex + 1} solved`, `第 ${puzzleIndex + 1} 题完成`) : lost ? tr('Stuck!', '卡住了！') : tr('Out of moves', '步数用完');
        const line = panel === 'solved' ? tr(`${p.target} in ${moves} move${moves === 1 ? '' : 's'}`, `${moves} 步拼出 ${p.target}`) : tr(`Make ${p.target} within ${p.moves} moves`, `${p.moves} 步内拼出 ${p.target}`);
        panelEl.innerHTML = `<div class="m48-card"><h2>${heading}</h2>${stars(n)}<p>${line} · ★★★ ≤ ${p.par} · ★★ ≤ ${twoStarMoves(p)}</p><div class="m48-actions">${panel === 'solved' && more ? `<button type="button" class="m48-btn" data-m48="next">${tr('Next puzzle', '下一题')}</button>` : ''}${panel === 'failed' && history.length ? `<button type="button" class="m48-btn" data-m48="undo">${UNDO_ICON} ${tr('Undo', '撤销')}</button>` : ''}<button type="button" class="m48-btn${panel === 'solved' && more ? ' is-alt' : ''}" data-m48="retry">${tr('Retry', '重试')}</button><button type="button" class="m48-btn is-alt" data-m48="picker">${tr('All puzzles', '全部谜题')}</button></div><p>${panel === 'solved' && more ? tr('Or press an arrow for the next one.', '或按方向键进入下一题。') : tr('U undoes the last move.', '按 U 撤销上一步。')}</p></div>`;
      } else {
        const list = puzzleStarList(), total = list.reduce((a, b) => a + b, 0);
        panelEl.innerHTML = `<div class="m48-card"><h2>${tr('Move puzzles', '步数谜题')}</h2><p>${tr('Make the target tile in as few moves as you can. New tiles always land in the same place.', '用尽量少的步数拼出目标方块。新方块总是落在同样的位置。')} ★ ${total}/${MOVE_PUZZLES.length * 3}</p><div class="m48-picker">${MOVE_PUZZLES.map((p, i) => `<button type="button" data-puzzle="${i}"${puzzleOpen(i, list) ? '' : ' disabled'} class="${i === puzzleIndex ? 'is-current' : ''}" aria-label="${tr(`Puzzle ${i + 1}, make ${p.target}${p.stones ? ', stones' : ''}, ${list[i]} stars`, `第 ${i + 1} 题，拼出 ${p.target}${p.stones ? '，有石块' : ''}，${list[i]} 星`)}">${puzzleOpen(i, list) ? i + 1 : '🔒'}<small>${'★'.repeat(list[i]) || p.target}</small></button>`).join('')}</div><div class="m48-actions"><button type="button" class="m48-btn is-alt" data-m48="close">${tr('Back', '返回')}</button></div></div>`;
      }
      if (opening) {
        panelAt = performance.now();
        if (!inVersus() && !paused) (panelEl.querySelector<HTMLElement>(panel === 'picker' ? '.m48-picker .is-current:not(:disabled), .m48-picker button:not(:disabled)' : '.m48-btn') ?? panelEl.querySelector<HTMLElement>('.m48-btn'))?.focus({ preventScroll: true });
      }
    };
    const renderHud = (gain = 0) => {
      const best = Math.max(state.score, bestFor()), goal = mode === 'puzzle' ? MOVE_PUZZLES[puzzleIndex].target : nextGoal(maxTile(state.board)), goalStyle = tileStyle(goal);
      if (mode === 'puzzle') {
        const p = MOVE_PUZZLES[puzzleIndex];
        scoreLabel.textContent = tr('Moves', '步数'); scoreEl.textContent = `${moves}/${p.moves}`;
        bestLabel.textContent = tr('Puzzle', '谜题'); bestEl.textContent = `${puzzleIndex + 1} · ${'★'.repeat(puzzleStarList()[puzzleIndex]) || '—'}`;
        goalLabel.textContent = tr('Make', '目标');
      } else {
        scoreLabel.textContent = tr('Score', '得分'); scoreEl.textContent = fmt(state.score);
        bestLabel.textContent = mode === 'daily' ? tr('Today', '今日') : tr('Best', '最佳'); bestEl.textContent = fmt(best);
        goalLabel.textContent = mode === 'daily' ? tr(`Moves left ${DAILY_MOVES - moves} · next`, `剩 ${DAILY_MOVES - moves} 步 · 下一目标`) : tr('Next goal', '下一目标');
      }
      bestBox.classList.toggle('is-record', mode !== 'puzzle' && state.rec > 0 && state.score > state.rec);
      deltaEl.textContent = gain && mode !== 'puzzle' ? `+${gain}` : '';
      if (gain && !reduced && mode !== 'puzzle') animate(deltaEl, [{ transform: 'translateY(8px)', opacity: 0 }, { transform: 'translateY(-7px)', opacity: 1, offset: .35 }, { transform: 'translateY(-15px)', opacity: 0 }], { duration: 420, easing: 'ease-out' });
      if (goalEl.textContent !== String(goal)) {
        const first = goalEl.textContent === '';
        goalEl.textContent = String(goal); goalEl.style.background = goalStyle.bg; goalEl.style.color = goalStyle.fg;
        if (!first) animate(goalEl, [{ transform: 'scale(1)' }, { transform: 'scale(1.3)', offset: .4 }, { transform: 'scale(1)' }], { duration: 360, easing: 'ease-out' });
      }
      if (mode === 'puzzle') {
        undosEl.textContent = history.length ? `${history.length}` : ''; undosEl.hidden = !history.length;
        undoEl.disabled = !history.length; undoEl.hidden = false;
        undoEl.setAttribute('aria-label', tr('Undo last move', '撤销上一步')); undoEl.title = tr('Take back a move (U). Puzzles allow any number.', '撤销一步（U）。谜题可以无限撤销。');
      } else {
        undoEl.hidden = mode === 'daily';
        undosEl.textContent = `×${state.undos}`; undosEl.hidden = false;
        undoEl.disabled = !state.prev || state.undos <= 0;
        undoEl.setAttribute('aria-label', tr(`Undo last move, ${state.undos} left`, `撤销上一步，还剩 ${state.undos} 次`));
        undoEl.title = tr(`Take back your last move (U). New best tiles from ${UNDO_REWARD_FROM} up earn another.`, `撤销上一步（U）。拼出 ${UNDO_REWARD_FROM} 以上的新最大方块可再得一次。`);
      }
      if (lost && mode !== 'puzzle') statusEl.textContent = tr('No moves left. Restart to try again.', '无路可走了，重新开始再试一次。');
      else if (note) statusEl.textContent = note;
      else if (mode === 'puzzle') statusEl.textContent = tr(`Puzzle ${puzzleIndex + 1}: make ${MOVE_PUZZLES[puzzleIndex].target} in ${MOVE_PUZZLES[puzzleIndex].par} moves for three stars.`, `第 ${puzzleIndex + 1} 题：${MOVE_PUZZLES[puzzleIndex].par} 步内拼出 ${MOVE_PUZZLES[puzzleIndex].target} 得三星。`);
      else if (mode === 'daily') statusEl.textContent = moves === 0 ? tr(`Daily ${dayKey}: the same tiles for everyone, ${DAILY_MOVES} moves.`, `每日挑战 ${dayKey}：所有人同一套方块，共 ${DAILY_MOVES} 步。`) : '';
      else if (completed) statusEl.textContent = tr('2048 reached — keep building!', '已拼出 2048，继续加油！');
      else statusEl.textContent = state.score === 0 ? (mode === 'stones' ? tr('Stones never move. Tiles stop against them.', '石块不会移动，方块会被它挡住。') : hint()) : '';
      boardEl.dataset.state = completed ? 'won' : lost ? 'lost' : '';
      if (lost) boardEl.dataset.state = 'lost';
      renderPanel();
    };
    const render = (gain = 0, spawnId?: number, merges: number[] = [], starId?: number) => { renderTiles(spawnId, merges, starId); renderHud(gain); };
    const persist = () => {
      if (mode === 'puzzle') return;
      const extra: Partial<ModeSave> = mode === 'stones' ? { stones } : mode === 'daily' ? { moves, key: dayKey } : {};
      store.set(info().save, { ...state, ...extra });
      if (mode === 'daily') return;
      store.set(info().best, Math.max(state.score, store.get(info().best, 0)));
      // The classic 4×4 alone keeps the original best tile and feeds the shared leaderboard; other sizes score on another scale.
      if (mode === 'classic') {
        if (state.peak > store.get('best-tile', 0)) store.set('best-tile', state.peak);
        services.reportScore(state.score);
      }
    };
    const terminalFeedback = (won: boolean, gameOver: boolean) => {
      if (won) { services.sound.play('success'); animate(boardEl, [{ boxShadow: '0 0 0 #70f0c200' }, { boxShadow: '0 0 38px #70f0c2' }, { boxShadow: '0 0 0 #70f0c200' }], { duration: 520 }); }
      if (gameOver) { services.sound.play('fail'); animate(boardEl, [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 180 }); }
    };
    const noOp = () => {
      boardEl.dataset.state = 'noop';
      if (!reduced) animate(boardEl, [{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }], { duration: 120 });
      if (feedbackTimer !== undefined) window.clearTimeout(feedbackTimer);
      feedbackTimer = window.setTimeout(() => { if (!destroyed && !lost) boardEl.dataset.state = completed ? 'won' : ''; }, reduced ? 0 : 130);
    };
    type Landing = { gain: number; spawnId: number; merges: number[]; won: boolean; gameOver: boolean; starId?: number; next?: PanelId };
    const finishMove = (landing: Landing) => {
      if (destroyed) return;
      transitionTimer = undefined; animating = false;
      if (landing.next) panel = landing.next;
      else if (landing.won) panel = 'won'; else if (landing.gameOver) panel = 'lost';
      render(landing.gain, landing.spawnId, landing.merges, landing.starId); terminalFeedback(landing.won || landing.next === 'solved' || landing.next === 'daily', landing.gameOver || landing.next === 'failed');
      if (landing.starId && !landing.won && !landing.gameOver && !landing.next) services.sound.play('upgrade');
      const next = queued; queued = undefined;
      if (next && panel === 'none') move(next);
    };
    const newGame = (fresh = true) => {
      stopVisuals(); loadMode(fresh);
      if (mode !== 'puzzle' && mode !== 'daily') state.rec = store.get(info().best, 0);
      paused = false; touchStart = undefined; persist(); render(); boardEl.focus({ preventScroll: true });
    };
    const switchMode = (next: ModeId, picker = true) => {
      if (inVersus()) return;
      mode = next; store.set('mode', mode);
      services.sound.play('tap');
      if (mode === 'puzzle') { stopVisuals(); loadMode(true); render(); if (picker) { panel = 'picker'; renderPanel(); } return; }
      stopVisuals(); loadMode(false); paused = false; render(); if (panel === 'none') boardEl.focus({ preventScroll: true });
    };
    const startPuzzle = (index: number) => { puzzleIndex = index; store.set('puzzle-index', index); mode = 'puzzle'; store.set('mode', mode); services.sound.play('tap'); newGame(true); };
    function move(direction: Direction) {
      // In split-screen there is no pointer for the second seat: once the "no moves" panel has been seen, a move starts a new board.
      if (lost && !paused && panel === 'lost' && inVersus() && performance.now() - panelAt > PANEL_LOCK_MS) { newGame(); return; }
      // Controllers only send arrows here: after a puzzle result has been seen, an arrow goes on to the next puzzle or retries.
      if (!paused && (panel === 'solved' || panel === 'failed') && performance.now() - panelAt > PANEL_LOCK_MS) {
        startPuzzle(panel === 'solved' && puzzleIndex + 1 < MOVE_PUZZLES.length ? puzzleIndex + 1 : puzzleIndex); return;
      }
      if (panel === 'picker' || panel === 'daily' || panel === 'solved' || panel === 'failed') { if (panel === 'picker') movePickerFocus(direction); return; }
      if (paused || lost) return;
      if (animating) { queued = direction; return; }
      if (panel === 'won') { if (performance.now() - panelAt < PANEL_LOCK_MS) return; panel = 'none'; renderPanel(); }
      // Stones read as 0 here, so this guard is looser on a stones board; the end of every move checks with the stones.
      if (!canMove(state.board)) { lost = true; services.sound.play('fail'); render(); return; }
      const result = resolveMove(tiles, direction, nextId, size, stones);
      if (!result.changed) { noOp(); return; }
      const prev: Snapshot = { board: state.board, score: state.score, won: completed };
      let spawned: Tile;
      if (seeded()) {
        const at = seededSpawn(boardFromTiles(result.tiles, size), seed, moves + 1, stones, mode === 'puzzle' ? 0 : 0.1)!;
        spawned = { id: nextId(), value: at.value, x: at.x, y: at.y }; result.tiles.push(spawned);
      } else spawned = spawnTile(result.tiles, services.random, nextId, size, stones);
      tiles = result.tiles;
      if (mode === 'puzzle') history.push({ board: state.board, score: state.score, won: false });
      moves++;
      const board = boardFromTiles(tiles, size), top = maxTile(board), undos = seeded() ? state.undos : undosAfterPeak(state.undos, state.peak, top);
      const star = top > state.peak && top >= CELEBRATE_FROM ? tiles.find((tile) => tile.value === top && result.merges.includes(tile.id)) : undefined;
      const won = !seeded() && !completed && top >= WIN_TILE;
      const gameOver = !canMove(board, stones);
      let next: Landing['next'];
      if (mode === 'puzzle') {
        const p = MOVE_PUZZLES[puzzleIndex];
        if (top >= p.target) {
          next = 'solved';
          const list = puzzleStarList(), got = puzzleStars(p, moves);
          if (got > list[puzzleIndex]) { list[puzzleIndex] = got; store.set('puzzle-stars', list); }
        } else if (moves >= p.moves || gameOver) next = 'failed';
      } else if (mode === 'daily' && (moves >= DAILY_MOVES || gameOver)) {
        next = 'daily';
        const rec = recordDaily(store, state.score + result.gained, '', dayKey);
        shareLine = dailyShareText('Merge 2048', state.score + result.gained, rec.streak, dayKey, zh());
      }
      note = star && !seeded() ? tr(`New best tile: ${top}!${undos > state.undos ? ' +1 undo' : ''}`, `新的最大方块：${top}！${undos > state.undos ? ' 撤销 +1' : ''}`) : result.merges.length >= 3 ? tr(`${result.merges.length} merges in one move!`, `一步合并 ${result.merges.length} 次！`) : '';
      completed ||= won; lost ||= gameOver && mode !== 'puzzle' && mode !== 'daily';
      if (mode === 'puzzle' && gameOver && next === 'failed') lost = true;
      state = { ...state, board, score: state.score + result.gained, won: completed, undos, peak: Math.max(state.peak, top), prev: seeded() ? null : prev };
      persist(); renderHud(result.gained);
      if (result.gained) services.sound.play('merge'); else services.sound.play('move');
      const landing: Landing = { gain: result.gained, spawnId: spawned.id, merges: result.merges, won, gameOver: gameOver && !next, starId: star?.id, next };
      if (reduced) { finishMove(landing); return; }
      animating = true;
      result.motions.forEach((motion) => {
        const element = boardEl.querySelector<HTMLElement>(`[data-tile-id="${motion.id}"]`);
        if (!element) return;
        element.style.transition = `left ${MOTION_MS}ms cubic-bezier(.2,.8,.25,1), top ${MOTION_MS}ms cubic-bezier(.2,.8,.25,1)`;
        place(element, motion.x, motion.y);
      });
      transitionTimer = window.setTimeout(() => finishMove(landing), MOTION_MS);
    }
    const movePickerFocus = (direction: Direction) => {
      const buttons = [...panelEl.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      if (!buttons.length) return;
      const at = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
      const step = direction === 'left' ? -1 : direction === 'right' ? 1 : direction === 'up' ? -6 : 6;
      const target = buttons[Math.max(0, Math.min(buttons.length - 1, at + step))];
      target.focus({ preventScroll: true });
      // The card scrolls on a small board: keep the focused puzzle clear of the pinned Back bar.
      target.scrollIntoView?.({ block: 'nearest' });
    };
    /** Puts the board back to how it was before the last move. Costs one undo; the spawn that follows the redo is rolled again. */
    const undo = () => {
      if (paused || animating) return;
      if (mode === 'puzzle') {
        const previous = history.pop();
        if (!previous) { note = tr('Nothing to undo yet.', '还没有可撤销的步。'); renderHud(); return; }
        stopVisuals();
        state = { ...state, board: cloneBoard(previous.board), score: previous.score }; moves = Math.max(0, moves - 1);
        lost = false; panel = 'none'; tiles = tilesFromBoard(state.board, nextId); note = tr('Move undone', '已撤销');
        services.sound.play('tap'); render(); boardEl.focus({ preventScroll: true });
        return;
      }
      if (mode === 'daily') { note = tr('The Daily has no undo: everyone plays the same tiles.', '每日挑战不能撤销：所有人用同一套方块。'); renderHud(); return; }
      if (!state.prev || state.undos <= 0) {
        if (!lost) { note = state.undos <= 0 ? tr(`No undos left — a new best tile (${UNDO_REWARD_FROM}+) earns one.`, `撤销次数用完了，拼出新的最大方块（${UNDO_REWARD_FROM} 以上）可再得一次。`) : tr('Nothing to undo yet.', '还没有可撤销的步。'); renderHud(); }
        return;
      }
      stopVisuals();
      const previous = state.prev;
      state = { ...state, board: cloneBoard(previous.board), score: previous.score, won: previous.won, undos: state.undos - 1, prev: null };
      completed = previous.won; lost = false; panel = 'none';
      tiles = tilesFromBoard(state.board, nextId);
      note = tr(`Move undone · ${state.undos} undo${state.undos === 1 ? '' : 's'} left`, `已撤销 · 还剩 ${state.undos} 次`);
      services.sound.play('tap'); persist(); render();
      boardEl.querySelectorAll('.merge-tile').forEach((element) => animate(element, [{ opacity: .35, transform: 'scale(.9)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 160, easing: 'ease-out' }));
      boardEl.focus({ preventScroll: true });
    };
    const onKey = (event: KeyboardEvent) => { if (paused) return;
      // Split-screen versus runs two boards on one window: leave the other seat's keys alone.
      const seat = (event.target as Element | null)?.closest?.('[data-versus-seat]'); if (seat && !seat.contains(host)) return;
      const directions: Record<string, Direction | undefined> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const direction = directions[key];
      if (direction) { event.preventDefault(); move(direction); return; }
      // M steps to the next board (4×4, 3×3, 5×5, Stones, Daily, Puzzles); it works with any panel open, so it is also a way out.
      if (key === 'm' && !inVersus() && !event.altKey && !event.ctrlKey && !event.metaKey) { event.preventDefault(); switchMode(MODE_ORDER[(MODE_ORDER.indexOf(mode) + 1) % MODE_ORDER.length], false); return; }
      if (key === 'Escape' && panel === 'picker') { event.preventDefault(); panel = 'none'; renderPanel(); boardEl.focus({ preventScroll: true }); return; }
      // Undo: only for a solo board, or a seat that was addressed directly (a bare key press would hit both seats).
      if ((key === 'u' || key === 'z' || key === 'Backspace') && !event.altKey && (seat || !inVersus())) { event.preventDefault(); undo(); }
    };
    const swipe = (dx: number, dy: number) => move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    const onPointerDown = (event: PointerEvent) => {
      if (paused) return;
      if ((event.target as Element | null)?.closest?.('button,a,.m48-panel:not([hidden])')) return;
      touchStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
    };
    const onPointerMove = (event: PointerEvent) => {
      if (paused || !touchStart || event.pointerId !== touchStart.id) return;
      const dx = event.clientX - touchStart.x, dy = event.clientY - touchStart.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
      touchStart = undefined; swipe(dx, dy);
    };
    const onPointerUp = (event: PointerEvent) => { if (paused) return; if (!touchStart) return; const dx = event.clientX - touchStart.x, dy = event.clientY - touchStart.y; touchStart = undefined; if (Math.max(Math.abs(dx), Math.abs(dy)) < FLICK_PX) return; swipe(dx, dy); };
    const onPointerCancel = () => { touchStart = undefined; };
    const onClick = (event: MouseEvent) => {
      const target = (event.target as Element | null)?.closest?.<HTMLElement>('[data-m48],[data-mode],[data-puzzle]');
      if (!target || paused) return;
      if (target.dataset.mode) { switchMode(target.dataset.mode as ModeId); return; }
      if (target.dataset.puzzle) { startPuzzle(Number(target.dataset.puzzle)); return; }
      const action = target.dataset.m48;
      if (action === 'undo') undo();
      else if (action === 'retry') { services.sound.play('tap'); newGame(); }
      else if (action === 'keep') { services.sound.play('tap'); panel = 'none'; note = ''; renderHud(); boardEl.focus({ preventScroll: true }); }
      else if (action === 'next') startPuzzle(Math.min(MOVE_PUZZLES.length - 1, puzzleIndex + 1));
      else if (action === 'picker') { services.sound.play('tap'); panel = 'picker'; renderPanel(); }
      else if (action === 'close') { panel = lost ? (mode === 'puzzle' ? 'failed' : 'lost') : 'none'; renderPanel(); boardEl.focus({ preventScroll: true }); }
      else if (action === 'share') void globalThis.navigator?.clipboard?.writeText(shareLine || dailyShareText('Merge 2048', state.score, readDaily(store).streak, dayKey, zh())).then(() => { target.textContent = tr('Copied!', '已复制！'); }, () => { target.textContent = shareLine; });
    };
    window.addEventListener('keydown', onKey, { passive: false });
    host.addEventListener('pointerdown', onPointerDown); host.addEventListener('pointermove', onPointerMove); host.addEventListener('pointerup', onPointerUp); host.addEventListener('pointercancel', onPointerCancel);
    host.addEventListener('click', onClick);
    // A stored puzzle resumes at its start (no picker), so a controller that only sends arrows is never stuck in a menu.
    loadMode(false);
    render(); if (panel === 'none') boardEl.focus({ preventScroll: true });
    return {
      pause() { paused = true; touchStart = undefined; stopVisuals(); render(); },
      resume() { paused = false; if (panel === 'none') boardEl.focus({ preventScroll: true }); },
      restart() { newGame(); },
      destroy() {
        destroyed = true; stopVisuals(); window.removeEventListener('keydown', onKey);
        host.removeEventListener('pointerdown', onPointerDown); host.removeEventListener('pointermove', onPointerMove); host.removeEventListener('pointerup', onPointerUp); host.removeEventListener('pointercancel', onPointerCancel);
        host.removeEventListener('click', onClick); host.classList.remove('merge-game', 'is-motion'); host.style.removeProperty('--n'); host.replaceChildren();
      }
    };
  }
};

function requireElement(parent: HTMLElement, selector: string): HTMLElement { const element = parent.querySelector<HTMLElement>(selector); if (!element) throw new Error(`Missing game element: ${selector}`); return element; }
/** Board coordinates go in as custom properties; the stylesheet turns them into left/top so the gap can change with the viewport. */
function place(element: HTMLElement, x: number, y: number) { element.style.setProperty('--x', String(x)); element.style.setProperty('--y', String(y)); }

export default game;
