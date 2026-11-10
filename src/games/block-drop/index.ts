import type { GameModule, GameServices } from '../../core/game-types';
import { best } from '../_shared/game-ui';
import { attachKeyboardMobileControls } from '../_shared/mobile-controls';
import { createGame, finishClear, ghostY, gravityMs, holdPiece, isGrounded, lockPiece, rotate, shift, HIDDEN, type Game, type LockResult } from './logic';
import { ACCENT, LEVEL_MS, LOCK_MS, POPUP_MS, THUD_MS, TRAIL_MS, createRenderer, newEffects } from './render';

const BEST_KEY = 'block-drop-best';
/** Held-key timing: one step at once, a short wait, then a fast slide. */
const DAS_MS = 150, ARR_MS = 34, SOFT_MS = 38;
/** A resting piece locks after this long; moving it resets the timer a limited number of times. */
const LOCK_DELAY_MS = 500, MAX_LOCK_RESETS = 15;
const CLEAR_MS = 300, CLEAR_MS_REDUCED = 150;
/** Space is the hard-drop key, so a player mashing it at the end must not skip the result panel. */
const RETRY_GUARD_MS = 300, RETRY_GUARD_SPACE_MS = 1100;

const zh = () => /^zh\b/i.test(globalThis.navigator?.language || '');
const tr = (en: string, cn: string) => (zh() ? cn : en);
const css = (element: HTMLElement, styles: Partial<CSSStyleDeclaration>) => Object.assign(element.style, styles);
type Cue = Parameters<GameServices['sound']['play']>[0];

export const game: GameModule = {
  meta: { slug: 'block-drop', title: 'Block Drop', category: 'arcade', description: 'Build glowing rows before the well fills.', instructions: 'Arrows move and turn, Space drops, C holds. On touch: drag to move, tap to turn, flick down to drop.', accent: '#8B7CFF', mechanic: 'Rotate, drop, clear' },
  mount(host, services) {
    const reduced = services.isReducedMotion;
    const coarse = !!globalThis.matchMedia?.('(pointer: coarse)').matches;

    // --- DOM: one canvas, a hint line, the game-over panel and (on touch) the shared on-screen buttons. ---
    const root = document.createElement('div');
    root.tabIndex = 0; root.setAttribute('aria-label', 'Block Drop');
    // Not positioned on purpose: the shared pause button anchors to the stage corner, clear of the side panels.
    css(root, { width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#F7F9FF', fontFamily: 'system-ui, sans-serif', outline: 'none', userSelect: 'none', touchAction: 'none' });
    root.style.setProperty('-webkit-user-select', 'none'); root.style.setProperty('-webkit-tap-highlight-color', 'transparent');
    const board = document.createElement('div');
    css(board, { position: 'relative', lineHeight: '0' });
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'application');
    css(canvas, { display: 'block', touchAction: 'none' });
    const panel = document.createElement('div');
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', tr('Game over', '游戏结束')); panel.hidden = true;
    css(panel, { position: 'absolute', display: 'none', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', lineHeight: '1.25', textAlign: 'center', padding: '14px 10px', boxSizing: 'border-box', background: 'rgba(9,12,28,.9)', borderRadius: '6px' });
    const hintLine = document.createElement('div');
    css(hintLine, { color: '#A8B1C5', fontSize: '14px', lineHeight: '1.4', textAlign: 'center', padding: '8px 6px 0', maxWidth: '640px' });
    const status = document.createElement('div');
    status.setAttribute('aria-live', 'polite');
    css(status, { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clipPath: 'inset(50%)' });
    board.append(canvas, panel, status); root.append(board, hintLine); host.replaceChildren(root);
    root.focus({ preventScroll: true });

    const renderer = createRenderer(canvas);
    const abort = new AbortController(), signal = abort.signal;

    // --- State. ---
    let state!: Game; // Dealt in restart(), so the random source is consumed once per run.
    let fx = newEffects();
    let stopped = false, paused = false, raf = 0, last = 0;
    let carry = 0, lockTimer = 0, lockResets = 0, lowest = 0, clearTimer = 0, softCarry = 0;
    let shownScore = 0, overAt = 0, clock = 0, hintAlpha = 1, bestAtStart = 0;
    const held = { left: false, right: false, down: false };
    let slideDir = 0, slideTime = 0, slideNext = DAS_MS;
    let cues: Array<{ at: number; kind: Cue }> = [];
    const cue = (kind: Cue, delay = 0) => { if (delay <= 0) services.sound.play(kind); else cues.push({ at: clock + delay, kind }); };

    const labels = { hold: tr('HOLD', '暂存'), next: tr('NEXT', '下一个'), score: tr('SCORE', '得分'), level: tr('LEVEL', '等级'), lines: tr('LINES', '消行'), best: tr('BEST', '最高'), levelUp: tr('LEVEL', '等级'), faster: tr('Speed up!', '加速！') };
    // Split-screen seats have their own keys (shown in the versus lobby), so the single-player hints stay out.
    const versus = !!host.closest?.('[data-versus-seat]');
    const hint = versus ? [] : coarse
      ? [tr('Drag ← → to move', '左右拖动：移动'), tr('Tap to turn', '轻点：旋转'), tr('Drag ↓ soft · flick ↓ drop', '下拖：加速 · 下滑：落到底'), tr('Flick ↑ to hold', '上滑：暂存')]
      : [tr('← → move   ↑ turn', '← → 移动   ↑ 旋转'), tr('↓ soft drop', '↓ 加速下落'), tr('Space hard drop', '空格 直接落下'), tr('C hold', 'C 暂存')];
    hintLine.textContent = coarse || versus ? '' : tr('← → move · ↑ or X turn · Z turn back · ↓ soft drop · Space hard drop · C hold · R restart', '← → 移动 · ↑ 或 X 旋转 · Z 反向旋转 · ↓ 加速 · 空格 直接落下 · C 暂存 · R 重新开始');

    // --- Touch buttons: the shared profile's keys, laid out for two thumbs, plus Hold. ---
    const mobile = attachKeyboardMobileControls(root, 'block-drop', root);
    const pad = root.querySelector<HTMLElement>('.mobile-controls');
    if (pad) {
      const face: Record<string, [area: string, text: string, size: string]> = { Left: ['left', '←', '26px'], Right: ['right', '→', '26px'], Down: ['down', '↓', '26px'], Rotate: ['rotate', `↻ ${tr('Turn', '旋转')}`, '18px'], Drop: ['drop', tr('Drop', '落下'), '16px'] };
      pad.querySelectorAll<HTMLButtonElement>('.mobile-control').forEach((button) => {
        const spec = face[button.getAttribute('aria-label') ?? ''];
        if (!spec) { button.style.display = 'none'; return; } // "Up" repeats Rotate.
        button.textContent = spec[1]; css(button, { gridArea: spec[0], minHeight: '54px', minWidth: '0', fontSize: spec[2], padding: '0' });
      });
      const holdButton = document.createElement('button');
      holdButton.type = 'button'; holdButton.className = 'mobile-control'; holdButton.textContent = tr('Hold', '暂存'); holdButton.setAttribute('aria-label', tr('Hold', '暂存'));
      css(holdButton, { gridArea: 'hold', minHeight: '54px', minWidth: '0', fontSize: '16px', padding: '0' });
      holdButton.addEventListener('pointerdown', (event) => { event.preventDefault(); root.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true })); }, { signal });
      pad.append(holdButton);
    }

    // --- Layout: size the canvas to the space the stage really has. ---
    const padGrid = { display: 'grid', gridTemplateColumns: '1fr 1fr 10px 1fr 1fr', gridTemplateAreas: '"left right . hold drop" "down down . rotate rotate"', gap: '8px', width: '100%', maxWidth: '460px', padding: '10px 4px max(4px, env(safe-area-inset-bottom))', boxSizing: 'border-box' } as const;
    function fit() {
      const immersive = host.classList.contains('is-immersive') || !!host.closest?.('.is-immersive');
      const viewW = globalThis.innerWidth || 800, viewH = globalThis.innerHeight || 800;
      // A phone on its side has no room under the well, so the buttons move to either side of it.
      const sideways = !!pad && viewW > viewH && viewH < 560;
      if (pad) {
        if (sideways) { css(pad, { display: 'contents' }); css(root, { display: 'grid', gridTemplateColumns: '1fr 1fr auto 1fr 1fr', gridTemplateRows: '1fr auto auto', gridTemplateAreas: '". . board . ." "left right board hold drop" "down down board rotate rotate"', gap: '8px', alignItems: 'stretch' }); board.style.gridArea = 'board'; }
        else { css(pad, padGrid); css(root, { display: 'flex', gridTemplateColumns: '', gridTemplateRows: '', gridTemplateAreas: '', gap: '', alignItems: 'center' }); board.style.gridArea = ''; }
      }
      const width = Math.max(240, (root.clientWidth || host.clientWidth || 600) - (sideways ? 300 : 0));
      const chrome = sideways ? 0 : (pad?.offsetHeight ?? 0) + hintLine.offsetHeight + 4;
      const style = globalThis.getComputedStyle?.(host);
      const inner = host.clientHeight - (parseFloat(style?.paddingTop ?? '0') || 0) - (parseFloat(style?.paddingBottom ?? '0') || 0);
      const top = (root.getBoundingClientRect?.().top ?? 0) + (globalThis.scrollY || 0);
      const height = immersive && inner > 0 ? inner - chrome : Math.min(760, Math.max(340, viewH - top - chrome - 12));
      const layout = renderer.resize(width, Math.max(240, height));
      css(panel, { left: `${layout.well.x}px`, top: `${layout.well.y}px`, width: `${layout.well.w}px`, height: `${layout.well.h}px` });
    }
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => { fit(); draw(); });
    observer?.observe(host);
    globalThis.addEventListener?.('resize', () => { fit(); draw(); }, { signal });

    const bestScore = () => services.storage.get<number>(BEST_KEY, 0);
    function draw() {
      renderer.draw({
        game: state, ghost: ghostY(state), fx, reduced, shownScore, best: bestScore(), hint: hintAlpha > 0 && !stopped ? hint : [], hintAlpha,
        lockProgress: state.active && isGrounded(state) ? Math.min(1, lockTimer / LOCK_DELAY_MS) : 0, labels
      });
    }

    // --- Game-over panel. ---
    function showPanel() {
      const record = state.score > bestAtStart && state.score > 0;
      const stat = (label: string, value: number) => `<div style="min-width:0"><div style="font-size:13px;font-weight:800;letter-spacing:.06em;color:#A8B1C5">${label}</div><div style="font-size:19px;font-weight:800">${value}</div></div>`;
      panel.innerHTML = `<div style="font-size:15px;font-weight:800;letter-spacing:.08em;color:#FF8195">${tr('WELL FULL', '堆到顶了')}</div>`
        + `<div style="font-size:14px;color:#C9D1E6">${tr('The stack reached the top.', '方块堆到了顶端。')}</div>`
        + `<div style="font-size:44px;font-weight:900;line-height:1.05">${state.score}</div>`
        + (record ? `<div style="font-size:15px;font-weight:800;color:#FFCF57">★ ${tr('New best!', '新纪录！')}</div>` : '')
        + `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;width:100%;max-width:260px">${stat(labels.lines, state.lines)}${stat(labels.level, state.level)}${stat(labels.best, Math.max(bestAtStart, state.score))}</div>`
        + `<button type="button" data-retry style="margin-top:6px;min-height:50px;min-width:150px;padding:0 20px;border:0;border-radius:14px;background:${ACCENT};color:#0B0D1E;font:800 17px system-ui,sans-serif;cursor:pointer;touch-action:manipulation">${tr('Play again', '再来一局')}</button>`
        + (coarse ? '' : `<div style="font-size:14px;color:#A8B1C5">${tr('Space, Enter or R', '空格、回车或 R')}</div>`);
      panel.hidden = false; panel.style.display = 'flex';
      status.textContent = tr(`Game over. Score ${state.score}, ${state.lines} lines, level ${state.level}.`, `游戏结束。得分 ${state.score}，消 ${state.lines} 行，等级 ${state.level}。`);
    }
    panel.addEventListener('click', (event) => { if ((event.target as HTMLElement).closest('[data-retry]') && clock - overAt > 250) { restart(); root.focus({ preventScroll: true }); } }, { signal });

    // --- Actions. ---
    /** A successful slide or turn buys the resting piece more time, up to a limit so it cannot stall forever. */
    const nudged = () => { if (lockResets < MAX_LOCK_RESETS) { lockTimer = 0; lockResets++; } };
    const endRun = () => {
      if (state.over && !stopped) {
        stopped = true; services.sound.play('fail');
        overAt = clock; cues = []; held.left = held.right = held.down = false; slideDir = 0;
        best(services, BEST_KEY, state.score); services.reportScore(state.score); showPanel();
      }
    };
    const move = (dx: number, dy: number, audible = true) => {
      if (stopped || paused || !state.active) return false;
      if (!shift(state, dx, dy)) return false;
      if (dx) { nudged(); if (audible) services.sound.play('move'); }
      if (dy && state.active.y > lowest) { lowest = state.active.y; lockResets = 0; lockTimer = 0; }
      return true;
    };
    const turn = (dir: 1 | -1 = 1) => {
      if (paused || stopped || !state.active) return;
      if (rotate(state, dir)) { nudged(); services.sound.play('tap'); }
    };
    const fresh = () => { carry = 0; softCarry = 0; lockTimer = 0; lockResets = 0; lowest = state.active?.y ?? 0; };
    const popup = (result: LockResult) => {
      const count = result.rows.length;
      if (!count && !result.spin) return;
      const names = [tr('T-SPIN', 'T 旋'), tr('SINGLE', '单行'), tr('DOUBLE', '双行'), tr('TRIPLE', '三行'), tr('QUAD!', '四行！')];
      let title = result.spin ? (count ? `${names[0]} ${names[count]}` : names[0]) : names[count];
      if (result.perfect) title = tr('PERFECT CLEAR', '全清！');
      const extras = [result.backToBack ? tr('Back-to-back', '连续大消') : '', result.combo > 0 ? tr(`Combo ×${result.combo + 1}`, `连击 ×${result.combo + 1}`) : ''].filter(Boolean);
      const color = result.perfect || count === 4 ? '#FFCF57' : result.spin ? '#D9B8FF' : count >= 2 ? '#8EF0D0' : '#F7F9FF';
      const row = count ? result.rows[Math.floor(count / 2)] : Math.max(...result.cells.map(([, y]) => y));
      fx.popups = []; // One call-out at a time keeps the well readable during quick chains.
      fx.popups.push({ title, sub: [`+${result.gained}`, ...extras].join(' · '), row: Math.max(row, HIDDEN + 3), t: 0, color });
    };
    /** Fixes the piece in place, scores it and starts the row-clear animation when rows are full. */
    const settle = (dropped = 0) => {
      const before = state.active;
      const result = lockPiece(state);
      if (!result || !before) return;
      fx.locks.push({ cells: result.cells, t: 0 });
      if (dropped > 1) { fx.trails.push({ cells: result.cells, from: Math.min(dropped, 8), type: result.type, t: 0 }); fx.thud = THUD_MS; }
      const count = result.rows.length;
      services.sound.play('hit');
      if (count) {
        fx.clear = { rows: result.rows, t: 0, dur: reduced ? CLEAR_MS_REDUCED : CLEAR_MS }; clearTimer = 0;
        // Bigger clears climb further up the cue ladder.
        cue('clear', 40); if (count >= 2) cue('collect', 110); if (count >= 3 || result.spin) cue('upgrade', 180); if (count === 4 || result.perfect) cue('success', 260);
        services.reportScore(state.score);
        if (coarse) globalThis.navigator?.vibrate?.(count === 4 ? [12, 30, 24] : 12);
      } else if (result.spin) cue('collect', 60);
      popup(result);
      if (result.levelUp) { fx.levelUp = LEVEL_MS; cue('upgrade', count === 4 ? 380 : 300); cue('success', count === 4 ? 470 : 390); }
      canvas.setAttribute('aria-label', tr(`Block Drop. Score ${state.score}, level ${state.level}, ${state.lines} lines.`, `方块下落。得分 ${state.score}，等级 ${state.level}，消 ${state.lines} 行。`));
      fresh(); endRun();
    };
    const drop = () => {
      if (paused || stopped || !state.active) return;
      services.sound.play('tap');
      let rows = 0;
      while (move(0, 1, false)) rows++;
      state.score += rows * 2;
      settle(rows);
    };
    const hold = () => {
      if (paused || stopped || !state.active) return;
      if (holdPiece(state)) { services.sound.play('collect'); fresh(); endRun(); } else services.sound.play('hit');
    };
    const releaseInput = () => { held.left = held.right = held.down = false; slideDir = 0; gesture = null; };
    const restart = () => {
      mobile?.clear(); services.sound.stop(); releaseInput();
      paused = false; stopped = false; cues = []; fx = newEffects(); shownScore = 0; hintAlpha = 1; clearTimer = 0;
      bestAtStart = bestScore();
      state = createGame(services.random); fresh();
      panel.hidden = true; panel.style.display = 'none'; status.textContent = '';
      last = performance.now(); draw();
      // The shell's Restart and Resume buttons take focus; take it back so the keyboard keeps working.
      root.focus({ preventScroll: true });
    };

    // --- Frame loop: gravity, held keys, lock delay, effects. ---
    const loop = (time: number) => {
      const dt = Math.min(100, Math.max(0, time - last)); last = time;
      raf = requestAnimationFrame(loop);
      if (paused) return;
      clock += dt;
      for (let i = cues.length - 1; i >= 0; i--) if (cues[i].at <= clock) { services.sound.play(cues[i].kind); cues.splice(i, 1); }
      if (!stopped) {
        if (fx.clear) {
          clearTimer += dt; fx.clear.t = clearTimer;
          if (clearTimer >= fx.clear.dur) { fx.clear = null; finishClear(state); fresh(); endRun(); }
        } else if (state.active) {
          if (slideDir) { slideTime += dt; while (slideTime >= slideNext) { slideNext += ARR_MS; if (!move(slideDir, 0)) break; } }
          const interval = gravityMs(state.level);
          if (held.down) {
            softCarry += dt;
            const every = Math.min(SOFT_MS, interval);
            while (softCarry >= every) { softCarry -= every; if (move(0, 1, false)) { state.score += 1; carry = 0; } else { softCarry = 0; break; } }
          }
          carry += dt;
          while (carry >= interval) { carry -= interval; if (!move(0, 1, false)) { carry = 0; break; } }
          if (isGrounded(state)) { lockTimer += dt; if (lockTimer >= LOCK_DELAY_MS) settle(); } else lockTimer = 0;
        }
      }
      // Effects and the score counter keep running after the run ends so the last lock still lands visibly.
      fx.locks = fx.locks.filter((item) => (item.t += dt) < LOCK_MS);
      fx.trails = fx.trails.filter((item) => (item.t += dt) < TRAIL_MS);
      fx.popups = fx.popups.filter((item) => (item.t += dt) < POPUP_MS);
      fx.levelUp = Math.max(0, fx.levelUp - dt); fx.thud = Math.max(0, fx.thud - dt);
      if (state.pieces > 0) hintAlpha = Math.max(0, hintAlpha - dt / 400);
      shownScore = state.score - shownScore < 2 ? state.score : Math.min(state.score, Math.ceil(shownScore + (state.score - shownScore) * Math.min(1, dt / 110)));
      draw();
    };

    // --- Keyboard (also what the on-screen buttons and the gamepad bridge send). ---
    const GAME_KEYS = new Set(['arrowleft', 'arrowright', 'arrowdown', 'arrowup', ' ', 'r', 'x', 'z', 'c', 'shift', 'enter', 'a', 'd', 's', 'w']);
    const slide = (dir: number) => { slideDir = dir; slideTime = 0; slideNext = DAS_MS; move(dir, 0); };
    const onKeyDown = (event: KeyboardEvent) => {
      if (paused || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (!GAME_KEYS.has(key)) return;
      if (key !== 'enter' || stopped) event.preventDefault();
      // Held keys are timed here, so the same feel reaches keyboard, touch buttons and controllers alike.
      if (event.repeat) return;
      if (key === 'r') { restart(); return; }
      if (stopped) { if ((key === 'enter' && clock - overAt > RETRY_GUARD_MS) || (key === ' ' && clock - overAt > RETRY_GUARD_SPACE_MS)) restart(); return; }
      if (key === 'arrowleft' || key === 'a') { held.left = true; slide(-1); }
      else if (key === 'arrowright' || key === 'd') { held.right = true; slide(1); }
      else if (key === 'arrowdown' || key === 's') {
        // A fresh press on a piece that is already resting confirms it at once.
        if (state.active && !fx.clear && isGrounded(state)) settle();
        else { held.down = true; softCarry = 0; if (move(0, 1, false)) { state.score += 1; carry = 0; } }
      }
      else if (key === 'arrowup' || key === 'x' || key === 'w') turn(1);
      else if (key === 'z') turn(-1);
      else if (key === ' ') drop();
      else if (key === 'c' || key === 'shift') hold();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === 'arrowleft' || key === 'a') { held.left = false; if (slideDir < 0) { slideDir = 0; if (held.right && !paused) slide(1); } }
      if (key === 'arrowright' || key === 'd') { held.right = false; if (slideDir > 0) { slideDir = 0; if (held.left && !paused) slide(-1); } }
      if (key === 'arrowdown' || key === 's') held.down = false;
    };
    root.addEventListener('keydown', onKeyDown, { signal });
    root.addEventListener('keyup', onKeyUp, { signal });
    // Clicking a shell button (Full screen, Share…) leaves focus there and the keyboard dead. An arrow key, or Space
    // away from a button, pressed anywhere else on the page comes back to the game. Split-screen seats get their keys
    // from the versus wrapper instead.
    if (!versus && typeof document !== 'undefined') {
      const stray = (event: KeyboardEvent) => {
        const target = event.target as HTMLElement | null, key = event.key;
        if (paused || !target?.closest || root.contains(target) || !root.isConnected) return false;
        if (target.closest('input, textarea, select, [contenteditable="true"], dialog[open], .pad-panel')) return false;
        if (key === ' ') return !target.closest('button, a, summary, [role="button"]');
        return key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowDown' || key === 'ArrowUp';
      };
      document.addEventListener('keydown', (event) => { if (stray(event)) { root.focus({ preventScroll: true }); onKeyDown(event); } }, { signal });
      document.addEventListener('keyup', (event) => { if (!root.contains(event.target as Node)) onKeyUp(event); }, { signal });
    }
    root.addEventListener('blur', releaseInput, { signal });

    // --- Touch and mouse on the board: drag to slide, tap to turn, drag down to speed up, flick down to drop, flick up to hold. ---
    type Gesture = { id: number; x: number; y: number; ax: number; ay: number; at: number; axis: '' | 'h' | 'v'; moved: boolean; lastY: number; lastAt: number; speed: number };
    let gesture: Gesture | null = null;
    canvas.addEventListener('pointerdown', (event) => {
      root.focus({ preventScroll: true });
      if (paused || stopped || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault();
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, ax: event.clientX, ay: event.clientY, at: event.timeStamp, axis: '', moved: false, lastY: event.clientY, lastAt: event.timeStamp, speed: 0 };
      canvas.setPointerCapture?.(event.pointerId);
    }, { signal });
    canvas.addEventListener('pointermove', (event) => {
      const g = gesture;
      if (!g || g.id !== event.pointerId || paused || stopped) return;
      const step = Math.max(16, renderer.layout.cell * 0.92), dx = event.clientX - g.x, dy = event.clientY - g.y;
      if (!g.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 10) g.axis = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
      const elapsed = event.timeStamp - g.lastAt;
      if (elapsed > 0) { g.speed = g.speed * 0.5 + ((event.clientY - g.lastY) / elapsed) * 0.5; g.lastY = event.clientY; g.lastAt = event.timeStamp; }
      if (g.axis === 'h') {
        while (Math.abs(event.clientX - g.ax) >= step) { const dir = event.clientX > g.ax ? 1 : -1; g.ax += dir * step; g.moved = true; move(dir, 0); }
      } else if (g.axis === 'v') {
        while (event.clientY - g.ay >= step) { g.ay += step; g.moved = true; if (move(0, 1, false)) { state.score += 1; carry = 0; } }
      }
    }, { signal });
    const endGesture = (event: PointerEvent, cancelled: boolean) => {
      const g = gesture;
      if (!g || g.id !== event.pointerId) return;
      gesture = null;
      if (cancelled || paused || stopped) return;
      const dy = event.clientY - g.y, time = event.timeStamp - g.at;
      if (!g.axis) { if (time < 400) turn(1); return; }
      if (g.axis !== 'v') return;
      // A quick downward flick is a hard drop; a slow drag has already stepped the piece down.
      if (dy > 36 && (g.speed > 0.55 || (time < 260 && dy > 48))) drop();
      else if (dy < -36 && time < 500) hold();
    };
    canvas.addEventListener('pointerup', (event) => endGesture(event, false), { signal });
    canvas.addEventListener('pointercancel', (event) => endGesture(event, true), { signal });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault(), { signal });

    fit(); restart(); last = performance.now(); raf = requestAnimationFrame(loop);
    return {
      pause: () => { paused = true; releaseInput(); mobile?.clear(); services.sound.stop(); },
      resume: () => { paused = false; last = performance.now(); root.focus({ preventScroll: true }); },
      restart,
      destroy: () => { cancelAnimationFrame(raf); observer?.disconnect(); abort.abort(); cues = []; services.sound.stop(); mobile?.destroy(); root.remove(); }
    };
  },
};
export default game;
