import type { GameController, GameModule } from '../../core/game-types';
import {
  CELEBRATE_FROM, SIZE, TILE_STYLES, TOP_TILE_STYLE, UNDO_REWARD_FROM, WIN_TILE,
  boardFromTiles, canMove, cloneBoard, maxTile, nextGoal, resolveMove, restore, spawnTile, tileStyle, tilesFromBoard, undosAfterPeak,
  type Direction, type SavedState, type Snapshot, type Tile
} from './logic';

const MOTION_MS = 150;
/** A swipe fires as soon as the finger has travelled this far, without waiting for it to lift. */
const SWIPE_PX = 26;
/** A quick flick that ends before SWIPE_PX still counts from this distance. */
const FLICK_PX = 14;
/** How long a freshly shown panel ignores movement keys, so a held or mashed key cannot dismiss it unseen. */
const PANEL_LOCK_MS = 700;

const STYLE_ID = 'merge-2048-style';
const CELL = '((100% - 5 * var(--g)) / 4)';
const CSS = `
.merge-game{--g:9px;align-content:center;justify-items:center;gap:12px}
.merge-game>.game-hud,.merge-game>.m48-bar,.merge-game>.game-status{width:min(100%,440px)}
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
.merge-game .merge-tile{z-index:1;line-height:1;letter-spacing:-.04em;box-shadow:inset 0 -3px 0 #00000022;font-size:clamp(1.15rem,7vw,2.4rem);font-size:10.5cqw;user-select:none;-webkit-user-select:none}
.merge-game .merge-tile.merge-merge{z-index:2}
.merge-game .merge-tile.d3{font-size:clamp(1rem,6vw,2rem);font-size:8.4cqw}
.merge-game .merge-tile.d4{font-size:clamp(.9rem,4.8vw,1.6rem);font-size:6.7cqw}
.merge-game .merge-tile.d5{font-size:clamp(.8rem,4vw,1.3rem);font-size:5.5cqw}
.merge-game .merge-tile.d6{font-size:clamp(.72rem,3.4vw,1.1rem);font-size:4.6cqw}
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
@media(max-height:640px){.game-stage.is-immersive.merge-game>.game-hud{padding-left:54px}}
`;

const HINT = 'Swipe or press the arrow keys. Matching tiles merge.';
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
    let state = restore(services.storage.get<SavedState | null>('save', null), services.random, services.storage.get('best', 0));
    let tiles = tilesFromBoard(state.board, nextId);
    let paused = false, completed = state.won, lost = !canMove(state.board), animating = false, destroyed = false;
    let panel: 'none' | 'won' | 'lost' = lost ? 'lost' : 'none', shownPanel = '', panelAt = 0;
    /** One-line message under the board for the thing that just happened; cleared by the next move. */
    let note = '';
    /** A move asked for while the previous slide is still animating; it runs the moment that slide lands. */
    let queued: Direction | undefined;
    let touchStart: { x: number; y: number; id: number } | undefined;
    let transitionTimer: number | undefined;
    let feedbackTimer: number | undefined;
    let activeAnimations: Animation[] = [];
    const reduced = services.isReducedMotion;
    /** Split-screen versus mounts two boards; a seat has no pointer of its own, so it gets keyboard-only shortcuts. */
    const inVersus = () => Boolean(host.closest('[data-versus-seat]'));
    host.classList.add('merge-game'); host.classList.toggle('is-motion', !reduced);
    host.innerHTML = `
      <div class="game-hud" aria-live="polite"><span>Score <strong data-score></strong><i data-delta aria-hidden="true"></i></span><span data-best-box>Best <strong data-best></strong></span></div>
      <div class="m48-bar"><span class="m48-goal">Next goal <b data-goal></b></span><button type="button" class="m48-undo" data-m48="undo">${UNDO_ICON} Undo <b data-undos></b></button></div>
      <div class="m48-wrap"><div class="merge-board" role="application" aria-label="Merge 2048 board. Use arrow keys or swipe to move tiles. Press U to undo." tabindex="0"></div><div class="m48-fx" aria-hidden="true"></div><div class="m48-panel" data-panel hidden></div></div>
      <p class="game-status" data-status role="status"></p>`;
    const boardEl = requireElement(host, '.merge-board');
    const scoreEl = requireElement(host, '[data-score]');
    const bestEl = requireElement(host, '[data-best]');
    const bestBox = requireElement(host, '[data-best-box]');
    const deltaEl = requireElement(host, '[data-delta]');
    const statusEl = requireElement(host, '[data-status]');
    const goalEl = requireElement(host, '[data-goal]');
    const undoEl = requireElement(host, '[data-m48="undo"]') as HTMLButtonElement;
    const undosEl = requireElement(host, '[data-undos]');
    const fxEl = requireElement(host, '.m48-fx');
    const panelEl = requireElement(host, '[data-panel]');
    const cells = Array.from({ length: SIZE * SIZE }, (_, index) => { const cell = document.createElement('div'); cell.className = 'm48-cell'; place(cell, index % SIZE, Math.floor(index / SIZE)); return cell; });

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
    const renderPanel = () => {
      const key = panel === 'none' ? '' : `${panel}:${state.score}:${state.undos}:${Boolean(state.prev)}`;
      if (key === shownPanel) return;
      const opening = !shownPanel.startsWith(panel); shownPanel = key;
      panelEl.hidden = panel === 'none';
      if (panel === 'none') { panelEl.replaceChildren(); return; }
      panelEl.className = `m48-panel is-${panel}`;
      const best = Math.max(state.score, services.storage.get('best', 0)), top = maxTile(state.board), canUndo = Boolean(state.prev) && state.undos > 0;
      if (panel === 'won') {
        panelEl.innerHTML = `<div class="m48-card"><h2>${WIN_TILE}!</h2><p>You built the ${WIN_TILE} tile with ${fmt(state.score)} points.<br>How much further can you take it?</p><div class="m48-actions"><button type="button" class="m48-btn" data-m48="keep">Keep going</button><button type="button" class="m48-btn is-alt" data-m48="retry">New game</button></div></div>`;
      } else {
        const record = state.score > state.rec && state.score > 0;
        panelEl.innerHTML = `<div class="m48-card"><h2>No moves left</h2><p>Score ${fmt(state.score)} · biggest tile ${top}</p><p class="${record ? 'is-record' : ''}">${record ? 'New best score!' : `Best ${fmt(best)} · ${fmt(best - state.score)} more to beat it`}</p><div class="m48-actions"><button type="button" class="m48-btn" data-m48="retry">Try again</button>${canUndo ? `<button type="button" class="m48-btn is-alt" data-m48="undo">${UNDO_ICON} Undo (${state.undos})</button>` : ''}</div>${inVersus() ? '<p>Or move to start a new board.</p>' : ''}</div>`;
      }
      if (opening) { panelAt = performance.now(); if (!inVersus() && !paused) panelEl.querySelector<HTMLElement>('.m48-btn')?.focus({ preventScroll: true }); }
    };
    const renderHud = (gain = 0) => {
      const best = Math.max(state.score, services.storage.get('best', 0)), goal = nextGoal(maxTile(state.board)), goalStyle = tileStyle(goal);
      scoreEl.textContent = fmt(state.score);
      bestEl.textContent = fmt(best);
      bestBox.classList.toggle('is-record', state.rec > 0 && state.score > state.rec);
      deltaEl.textContent = gain ? `+${gain}` : '';
      if (gain && !reduced) animate(deltaEl, [{ transform: 'translateY(8px)', opacity: 0 }, { transform: 'translateY(-7px)', opacity: 1, offset: .35 }, { transform: 'translateY(-15px)', opacity: 0 }], { duration: 420, easing: 'ease-out' });
      if (goalEl.textContent !== String(goal)) {
        const first = goalEl.textContent === '';
        goalEl.textContent = String(goal); goalEl.style.background = goalStyle.bg; goalEl.style.color = goalStyle.fg;
        if (!first) animate(goalEl, [{ transform: 'scale(1)' }, { transform: 'scale(1.3)', offset: .4 }, { transform: 'scale(1)' }], { duration: 360, easing: 'ease-out' });
      }
      undosEl.textContent = `×${state.undos}`;
      undoEl.disabled = !state.prev || state.undos <= 0;
      undoEl.setAttribute('aria-label', `Undo last move, ${state.undos} left`);
      undoEl.title = `Take back your last move (U). New best tiles from ${UNDO_REWARD_FROM} up earn another.`;
      if (lost) statusEl.textContent = 'No moves left. Restart to try again.';
      else if (note) statusEl.textContent = note;
      else if (completed) statusEl.textContent = '2048 reached — keep building!';
      else statusEl.textContent = state.score === 0 ? HINT : '';
      boardEl.dataset.state = completed ? 'won' : lost ? 'lost' : '';
      if (lost) boardEl.dataset.state = 'lost';
      renderPanel();
    };
    const render = (gain = 0, spawnId?: number, merges: number[] = [], starId?: number) => { renderTiles(spawnId, merges, starId); renderHud(gain); };
    const persist = () => {
      services.storage.set('save', state); services.storage.set('best', Math.max(state.score, services.storage.get('best', 0)));
      if (state.peak > services.storage.get('best-tile', 0)) services.storage.set('best-tile', state.peak);
      services.reportScore(state.score);
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
    type Landing = { gain: number; spawnId: number; merges: number[]; won: boolean; gameOver: boolean; starId?: number };
    const finishMove = (landing: Landing) => {
      if (destroyed) return;
      transitionTimer = undefined; animating = false;
      if (landing.won) panel = 'won'; else if (landing.gameOver) panel = 'lost';
      render(landing.gain, landing.spawnId, landing.merges, landing.starId); terminalFeedback(landing.won, landing.gameOver);
      if (landing.starId && !landing.won && !landing.gameOver) services.sound.play('upgrade');
      const next = queued; queued = undefined;
      if (next && panel === 'none') move(next);
    };
    const newGame = () => {
      stopVisuals(); state = restore(null, services.random, services.storage.get('best', 0)); tiles = tilesFromBoard(state.board, nextId);
      completed = false; lost = false; paused = false; panel = 'none'; note = ''; touchStart = undefined; persist(); render(); boardEl.focus({ preventScroll: true });
    };
    function move(direction: Direction) {
      // In split-screen there is no pointer for the second seat: once the "no moves" panel has been seen, a move starts a new board.
      if (lost && !paused && panel === 'lost' && inVersus() && performance.now() - panelAt > PANEL_LOCK_MS) { newGame(); return; }
      if (paused || lost) return;
      if (animating) { queued = direction; return; }
      if (panel === 'won') { if (performance.now() - panelAt < PANEL_LOCK_MS) return; panel = 'none'; renderPanel(); }
      if (!canMove(state.board)) { lost = true; services.sound.play('fail'); render(); return; }
      const result = resolveMove(tiles, direction, nextId);
      if (!result.changed) { noOp(); return; }
      const prev: Snapshot = { board: state.board, score: state.score, won: completed };
      const spawned = spawnTile(result.tiles, services.random, nextId);
      tiles = result.tiles;
      const board = boardFromTiles(tiles), top = maxTile(board), undos = undosAfterPeak(state.undos, state.peak, top);
      const star = top > state.peak && top >= CELEBRATE_FROM ? tiles.find((tile) => tile.value === top && result.merges.includes(tile.id)) : undefined;
      const won = !completed && top >= WIN_TILE;
      const gameOver = !canMove(board);
      note = star ? `New best tile: ${top}!${undos > state.undos ? ' +1 undo' : ''}` : result.merges.length >= 3 ? `${result.merges.length} merges in one move!` : '';
      completed ||= won; lost ||= gameOver;
      state = { ...state, board, score: state.score + result.gained, won: completed, undos, peak: Math.max(state.peak, top), prev };
      persist(); renderHud(result.gained);
      if (result.gained) services.sound.play('merge'); else services.sound.play('move');
      const landing: Landing = { gain: result.gained, spawnId: spawned.id, merges: result.merges, won, gameOver, starId: star?.id };
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
    /** Puts the board back to how it was before the last move. Costs one undo; the spawn that follows the redo is rolled again. */
    const undo = () => {
      if (paused || animating) return;
      if (!state.prev || state.undos <= 0) {
        if (!lost) { note = state.undos <= 0 ? `No undos left — a new best tile (${UNDO_REWARD_FROM}+) earns one.` : 'Nothing to undo yet.'; renderHud(); }
        return;
      }
      stopVisuals();
      const previous = state.prev;
      state = { ...state, board: cloneBoard(previous.board), score: previous.score, won: previous.won, undos: state.undos - 1, prev: null };
      completed = previous.won; lost = false; panel = 'none';
      tiles = tilesFromBoard(state.board, nextId);
      note = `Move undone · ${state.undos} undo${state.undos === 1 ? '' : 's'} left`;
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
      // Undo: only for a solo board, or a seat that was addressed directly (a bare key press would hit both seats).
      if ((key === 'u' || key === 'z' || key === 'Backspace') && !event.altKey && (seat || !inVersus())) { event.preventDefault(); undo(); }
    };
    const swipe = (dx: number, dy: number) => move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    const onPointerDown = (event: PointerEvent) => {
      if (paused) return;
      if ((event.target as Element | null)?.closest?.('button,a')) return;
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
      const action = (event.target as Element | null)?.closest?.<HTMLElement>('[data-m48]')?.dataset.m48;
      if (!action || paused) return;
      if (action === 'undo') undo();
      else if (action === 'retry') { services.sound.play('tap'); newGame(); }
      else if (action === 'keep') { services.sound.play('tap'); panel = 'none'; note = ''; renderHud(); boardEl.focus({ preventScroll: true }); }
    };
    window.addEventListener('keydown', onKey, { passive: false });
    host.addEventListener('pointerdown', onPointerDown); host.addEventListener('pointermove', onPointerMove); host.addEventListener('pointerup', onPointerUp); host.addEventListener('pointercancel', onPointerCancel);
    host.addEventListener('click', onClick);
    render(); if (panel === 'none') boardEl.focus({ preventScroll: true });
    return {
      pause() { paused = true; touchStart = undefined; stopVisuals(); render(); },
      resume() { paused = false; if (panel === 'none') boardEl.focus({ preventScroll: true }); },
      restart() { newGame(); },
      destroy() {
        destroyed = true; stopVisuals(); window.removeEventListener('keydown', onKey);
        host.removeEventListener('pointerdown', onPointerDown); host.removeEventListener('pointermove', onPointerMove); host.removeEventListener('pointerup', onPointerUp); host.removeEventListener('pointercancel', onPointerCancel);
        host.removeEventListener('click', onClick); host.classList.remove('merge-game', 'is-motion'); host.replaceChildren();
      }
    };
  }
};

function requireElement(parent: HTMLElement, selector: string): HTMLElement { const element = parent.querySelector<HTMLElement>(selector); if (!element) throw new Error(`Missing game element: ${selector}`); return element; }
/** Board coordinates go in as custom properties; the stylesheet turns them into left/top so the gap can change with the viewport. */
function place(element: HTMLElement, x: number, y: number) { element.style.setProperty('--x', String(x)); element.style.setProperty('--y', String(y)); }

export default game;
