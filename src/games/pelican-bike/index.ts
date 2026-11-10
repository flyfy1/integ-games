import type { GameController, GameModule, GameServices } from '../../core/game-types';
import { createPelicanAudio } from './audio';
import { LEVELS, ROWS } from './levels';
import { drawBackground, drawEntities, drawHUD, drawOverlay, drawPelican, drawTile, drawWater, setView } from './render';
import type { Hit, UiResult } from './render';
import { createSim, medalsFor, mergeBest, noInput, respawn, STEP, stepSim } from './sim';
import type { Sim, SimEvent, StageBest } from './sim';
import { H, PH, PW, T, THEMES, W } from './theme';
import type { Particle, Popup } from './types';

const ACCENT = '#ff9f1c';
const zh = () => /^zh\b/i.test(navigator.language || '');

function clamp(v: number, a: number, b: number) { return v < a ? a : v > b ? b : v; }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
// Cosmetic only (particles, shake): gameplay itself is deterministic and lives in sim.ts.
function rand(a: number, b: number) { return a + Math.random() * (b - a); }

type EmitOpt = { ang?: number; sp?: number; v0?: number; v1?: number; vx?: number; vy?: number; g?: number; s0?: number; s1?: number; d0?: number; d1?: number; col?: string | string[] };
type State = 'title' | 'playing' | 'levelclear' | 'victory';

export const pelicanBike: GameModule = {
  meta: {
    slug: 'pelican-bike',
    title: 'Pelican Pedal',
    category: 'action',
    description: 'Pedal a breezy pelican along four coasts, from dawn beach to storm reef, hopping, gliding and sprinting to each lighthouse.',
    instructions: 'A/D or Arrows ride; Space/W/Up hops, press again to flap, hold to glide. Shift sprints. Find 3 stars per stage and beat the par time for medals.',
    accent: ACCENT,
    mechanic: 'Pedal, flap jump, glide and dash'
  },
  mount(host: HTMLElement, services: GameServices): GameController {
    const isZh = zh();
    const inVersus = !!host.closest?.('[data-versus-seat]');
    const root = document.createElement('div');
    root.dataset.pelicanBike = '';
    root.style.cssText = 'position:relative;width:100%;min-width:0;max-width:1400px;margin:0 auto;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;';

    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-label', isZh ? '鹈鹕骑行记' : 'Pelican Pedal');
    canvas.style.cssText = 'display:block;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,0.45);outline:none;background:#0b1020;touch-action:none;';
    root.append(canvas);

    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    // Input state
    const keys = noInput();
    let jumpQueued = false;
    const releaseAll = () => { keys.left = keys.right = keys.down = keys.jump = keys.turbo = false; jumpQueued = false; };

    // On-screen controls: a slide pad for left/right, sprint and hop buttons, and a pause button.
    let touchControls: HTMLDivElement | null = null;
    let padEl: HTMLDivElement | null = null;
    const touchCleanups: (() => void)[] = [];
    if (isTouchDevice && !inVersus) {
      touchControls = document.createElement('div');
      const round = 'border-radius:50%;border:2px solid rgba(255,255,255,0.5);color:#fff;touch-action:none;display:flex;align-items:center;justify-content:center;padding:0;font-weight:800;-webkit-tap-highlight-color:transparent;';
      touchControls.innerHTML = `
        <div data-pad role="group" aria-label="${isZh ? '左右骑行' : 'Ride left or right'}" style="pointer-events:auto;position:relative;width:150px;height:76px;border-radius:38px;flex:none;background:rgba(255,255,255,0.16);border:2px solid rgba(255,255,255,0.5);display:flex;touch-action:none;overflow:hidden;">
          <span data-half="left" style="flex:1;display:flex;align-items:center;justify-content:center;color:#fff;font-size:30px;">◀</span>
          <span style="width:2px;background:rgba(255,255,255,0.35);margin:14px 0;"></span>
          <span data-half="right" style="flex:1;display:flex;align-items:center;justify-content:center;color:#fff;font-size:30px;">▶</span>
        </div>
        <button type="button" data-btn="pause" aria-label="${isZh ? '暂停' : 'Pause'}" style="${round}pointer-events:auto;flex:none;width:40px;height:40px;background:rgba(255,255,255,0.12);font-size:16px;">Ⅱ</button>
        <div style="display:flex;gap:8px;align-items:center;pointer-events:auto;flex:none;">
          <button type="button" data-btn="turbo" aria-label="${isZh ? '冲刺' : 'Sprint'}" style="${round}width:58px;height:58px;background:rgba(255,255,255,0.16);color:#ffe66d;font-size:24px;">⚡</button>
          <button type="button" data-btn="jump" aria-label="${isZh ? '跳跃' : 'Hop'}" style="${round}width:80px;height:80px;background:rgba(255,159,28,0.5);font-size:32px;">⤒</button>
        </div>`;
      root.append(touchControls);
      padEl = touchControls.querySelector<HTMLDivElement>('[data-pad]');
    }

    host.replaceChildren(root);
    canvas.focus({ preventScroll: true });

    const ctx = canvas.getContext('2d');
    const audio = createPelicanAudio(() => services.sound.muted);

    // ---- Layout: world zoom and UI scale are separate so the HUD stays readable on a phone ----
    let SC = 1, VW = W, UI = 1, uw = W, uh = H, portrait = false, padL = 0, frame = 0;
    function layout() {
      const availW = Math.max(240, Math.min(root.clientWidth || W, host.clientWidth || W, (document.documentElement.clientWidth || W)));
      const vh = window.innerHeight || 800;
      const immersive = !!root.closest('.is-immersive');
      const seatH = inVersus ? host.clientHeight : 0;
      portrait = isTouchDevice && !inVersus && availW < 640 && vh > availW * 1.15;
      let cssW: number, cssH: number;
      if (portrait || (inVersus && availW < 640)) {
        // A narrow screen (or a split-screen seat) zooms in: fewer tiles across, bigger pelican.
        VW = clamp(availW / 0.65, 560, 760);
        cssW = availW; cssH = Math.round(availW * H / VW);
      } else if (isTouchDevice && immersive && !inVersus) {
        cssH = Math.min(vh, availW * H / 800);
        VW = clamp(availW / cssH * H, 800, 1120);
        cssW = Math.round(cssH * VW / H);
      } else {
        const maxH = seatH > 120 ? seatH : immersive ? vh : Math.max(240, vh - 150);
        VW = W;
        cssH = Math.min(availW * H / W, maxH); cssW = cssH * W / H;
      }
      canvas.style.width = `${Math.round(cssW)}px`;
      canvas.style.height = `${Math.round(cssH)}px`;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const pw = Math.max(1, Math.round(cssW * dpr)), ph = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== pw) canvas.width = pw;
      if (canvas.height !== ph) canvas.height = ph;
      SC = canvas.height / H;
      VW = canvas.width / SC;
      const k = clamp(cssW / 960, 1, 2);
      UI = dpr * k; uw = canvas.width / UI; uh = canvas.height / UI;
      // The shell's full-screen close button sits over the top-left corner: slide the hearts out from under it.
      const exit = document.querySelector('.immersive-exit');
      padL = 0;
      if (exit && immersive) {
        const er = exit.getBoundingClientRect(), cr = canvas.getBoundingClientRect();
        if (er.width > 0 && er.bottom > cr.top + 4 && er.right > cr.left + 4 && er.left < cr.right) padL = Math.max(0, (er.right - cr.left + 6) / k);
      }
      if (touchControls) {
        touchControls.style.cssText = portrait
          ? 'display:flex;justify-content:space-between;align-items:center;width:100%;box-sizing:border-box;padding:16px 4px 4px;gap:4px;'
          : 'position:absolute;inset:auto 0 10px 0;display:flex;justify-content:space-between;align-items:flex-end;padding:0 14px;pointer-events:none;z-index:10;opacity:0.7;';
      }
    }
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(layout) : null;
    ro?.observe(root);
    window.addEventListener('resize', layout);
    layout();

    // ---- Progress ----
    let hiScore = services.storage.get<number>('hiscore', 0);
    const storedBests = services.storage.get<(StageBest | null)[]>('stages', []);
    const bests: (StageBest | null)[] = LEVELS.map((_l, i) => {
      const b = Array.isArray(storedBests) ? storedBests[i] : null;
      return b && typeof b.time === 'number' ? b : null;
    });
    const unlocked = () => { let n = 0; while (n < LEVELS.length - 1 && bests[n]) n++; return n; };

    let state: State = 'title';
    let paused = false, userPaused = false, stateT = 0;
    let sel = Math.min(unlocked(), LEVELS.length - 1);
    let sim: Sim = createSim(0);
    let baseScore = 0, result: UiResult | null = null;
    let particles: Particle[] = [], popups: Popup[] = [];
    let camX = 0, lookDir = 1, shakeT = 0, shakeM = 0, bannerT = 0, gtime = 0, acc = 0;
    let hits: Hit[] = [];
    let reported = 0;

    function shake(mag: number, dur: number) { if (services.isReducedMotion) return; shakeM = Math.max(shakeM, mag); shakeT = Math.max(shakeT, dur); }
    function addPopup(x: number, y: number, txt: string, col = '#fff', sz = 18) { popups.push({ x, y, vy: -55, txt, col, sz, t: 0, d: 0.9 }); }
    function emit(x: number, y: number, n: number, opt: EmitOpt) {
      if (particles.length > 260) return;
      for (let i = 0; i < n; i++) {
        const a = (opt.ang ?? 0) + rand(-(opt.sp ?? Math.PI), opt.sp ?? Math.PI);
        const v = rand(opt.v0 ?? 40, opt.v1 ?? 160);
        particles.push({
          x: x + rand(-4, 4), y: y + rand(-4, 4),
          vx: Math.cos(a) * v + (opt.vx || 0), vy: Math.sin(a) * v + (opt.vy || 0),
          g: opt.g ?? 420, sz: rand(opt.s0 ?? 3, opt.s1 ?? 7),
          col: Array.isArray(opt.col) ? opt.col[i % opt.col.length] : (opt.col || '#fff'),
          t: 0, d: rand(opt.d0 ?? 0.3, opt.d1 ?? 0.65)
        });
      }
    }

    const camTarget = () => clamp(sim.P.x + PW / 2 - VW * 0.4 + lookDir * VW * 0.1 + sim.P.vx * 0.16, 0, Math.max(0, sim.worldW - VW));
    function snapCamera() { lookDir = 1; camX = camTarget(); }

    function startStage(idx: number, carry: number) {
      baseScore = carry;
      sim = createSim(idx, carry);
      audio.setTheme(LEVELS[idx].theme);
      particles = []; popups = []; result = null; acc = 0;
      releaseHeldJump();
      snapCamera();
      bannerT = 2.4; state = 'playing'; stateT = 0; userPaused = false;
      reported = sim.score;
      services.reportScore(sim.score);
    }
    function releaseHeldJump() { jumpQueued = false; }
    function toTitle() {
      state = 'title'; stateT = 0; userPaused = false;
      sim = createSim(sel); audio.setTheme(LEVELS[sel].theme);
      particles = []; popups = []; camX = 0;
    }
    function pickStage(i: number) {
      if (i < 0 || i > unlocked() || i === sel) return;
      sel = i; audio.click();
      sim = createSim(sel); audio.setTheme(LEVELS[sel].theme); camX = 0;
    }

    function finishStage(e: SimEvent) {
      audio.win();
      addPopup(e.x, e.y, isZh ? `过关! +${e.n}` : `CLEAR! +${e.n}`, '#ffe66d', 20);
      emit(e.x, e.y - 60, 30, { col: ['#ffe66d', '#fff', '#ff9f1c', '#7ae582'], v0: 90, v1: 280, d0: 0.5, d1: 1 });
      const medals = medalsFor(sim);
      const run: StageBest = { time: Math.round(sim.time * 10) / 10, fish: sim.fishGot, stars: sim.starGot, medals };
      const prev = bests[sim.lv];
      const merged = mergeBest(prev, run);
      const newBest = !!prev && (run.time < prev.time || (merged.medals !== prev.medals));
      bests[sim.lv] = merged;
      services.storage.set('stages', bests);
      result = { medals, newBest, timeBonus: sim.timeBonus };
      state = 'levelclear'; stateT = 0;
      releaseAll();
      services.reportComplete(sim.lv + 1);
    }

    function onEvent(e: SimEvent) {
      switch (e.k) {
        case 'jump':
          audio.jump();
          emit(e.x, e.y, 7, { col: ['#fff', '#f2d49b'], ang: -Math.PI / 2, sp: 1.1, v0: 40, v1: 110, g: 260, d0: 0.2, d1: 0.4 });
          break;
        case 'flap':
          audio.jump(); audio.flap();
          emit(e.x, e.y, 9, { col: ['#fff', '#cde8ff'], ang: Math.PI / 2, sp: 0.9, v0: 60, v1: 150, g: 120, d0: 0.25, d1: 0.45 });
          break;
        case 'land':
          emit(e.x, e.y, 5, { col: ['#fff', '#e5bb7b'], ang: -Math.PI / 2, sp: 1.2, v0: 25, v1: 80, g: 240, d0: 0.15, d1: 0.3 });
          break;
        case 'fish':
          audio.fish();
          addPopup(e.x, e.y - 10, e.s ? `+${e.n} ${e.s}` : `+${e.n}`, '#ffe66d', e.s ? 19 : 17);
          emit(e.x, e.y, 9, { col: ['#ff9f1c', '#ffbf69', '#ffffff'], v0: 50, v1: 150, d0: 0.2, d1: 0.45 });
          break;
        case 'star':
          audio.star();
          addPopup(e.x, e.y - 14, isZh ? `金星 ${sim.starGot}/${sim.starTot}  +500` : `STAR ${sim.starGot}/${sim.starTot}  +500`, '#ffe66d', 21);
          emit(e.x, e.y, 24, { col: ['#ffe66d', '#fff', '#ff9f1c'], v0: 80, v1: 260, d0: 0.4, d1: 0.8 });
          break;
        case 'stomp':
          audio.stomp(); shake(5, 0.14);
          addPopup(e.x, e.y - 14, isZh ? '踩扁! +200' : 'STOMP! +200', '#ffe66d', 18);
          emit(e.x, e.y, 14, { col: ['#ff6b6b', '#ffd166', '#fff'], v0: 70, v1: 200 });
          break;
        case 'crate':
          audio.stomp();
          addPopup(e.x, e.y - 20, '+50', '#ffe66d', 17);
          emit(e.x, e.y, 14, { col: ['#d99b52', '#a46830', '#ffe1a8'], v0: 60, v1: 200 });
          break;
        case 'spring':
          audio.spring(); shake(4, 0.12);
          emit(e.x, e.y, 12, { col: ['#ff6b6b', '#ffd166', '#fff'], ang: -Math.PI / 2, sp: 0.8, v0: 80, v1: 220 });
          break;
        case 'hurt':
          audio.hurt(); shake(8, 0.25);
          addPopup(e.x, e.y - 26, isZh ? '好痛！' : 'OUCH!', '#ff8a8a', 19);
          emit(e.x, e.y, 12, { col: ['#fff', '#f4d35e', '#ee6c4d'], s0: 4, s1: 8, v0: 70, v1: 210 });
          break;
        case 'die':
          shake(10, 0.3);
          if (e.s === 'water') {
            audio.splash();
            addPopup(e.x, e.y - 40, isZh ? '落水啦！' : 'SPLASH!', '#bfe9ff', 21);
            emit(e.x, e.y, 26, { col: ['#9fe6ff', '#ffffff', '#3aa8dd'], ang: -Math.PI / 2, sp: 0.9, v0: 120, v1: 320, g: 520 });
          } else {
            audio.over();
            addPopup(e.x, e.y - 40, isZh ? '摔车了！' : 'WIPEOUT!', '#ff8a8a', 21);
            emit(e.x, e.y, 22, { col: ['#fff', '#ff6b6b', '#ffd166'], v0: 90, v1: 280 });
          }
          break;
        case 'check':
          audio.check();
          addPopup(e.x, e.y - 10, isZh ? '存档点！生命回满' : 'CHECKPOINT! FULL HP', '#7ae582', 18);
          emit(e.x, e.y + 10, 18, { col: ['#7ae582', '#ffd166', '#fff'], v0: 60, v1: 200 });
          break;
        case 'oneup':
          audio.oneup(); addPopup(e.x, e.y, isZh ? '生命 +1' : 'HP +1', '#ff8a8a', 20);
          break;
        case 'crumble':
          audio.crumble();
          emit(e.x, e.y, 12, { col: ['#c9935b', '#9e6b3b', '#e5bb7b'], v0: 40, v1: 150 });
          break;
        case 'jelly':
          if (e.x > camX - 40 && e.x < camX + VW + 40) {
            audio.splash();
            emit(e.x, e.y, 8, { col: ['#9fe6ff', '#ffffff'], ang: -Math.PI / 2, sp: 0.6, v0: 80, v1: 200, g: 520 });
          }
          break;
        case 'respawn':
          snapCamera(); releaseHeldJump();
          break;
        case 'clear':
          finishStage(e);
          break;
      }
    }

    // ---- Actions shared by keyboard, pad and touch ----
    function primaryAction() {
      if (paused) return;
      if (userPaused) { userPaused = false; audio.click(); return; }
      if (state === 'title') { audio.click(); startStage(sel, 0); }
      else if (state === 'levelclear') {
        if (stateT < 0.7) return; // a hop mashed at the finish line must not skip the results
        audio.click();
        if (sim.lv + 1 < LEVELS.length) { sel = sim.lv + 1; startStage(sim.lv + 1, sim.score); }
        else { state = 'victory'; stateT = 0; audio.win(); }
      } else if (state === 'victory') {
        if (stateT < 0.7) return;
        audio.click(); toTitle();
      }
    }
    function retryAction() {
      if (paused) return;
      if (state === 'playing' && !sim.P.dead) { audio.click(); userPaused = false; respawn(sim); }
      else if (state === 'levelclear' && stateT >= 0.4) { audio.click(); startStage(sim.lv, baseScore); }
    }
    function togglePause() {
      if (state !== 'playing' || paused) return;
      userPaused = !userPaused; audio.click(); releaseAll();
    }

    /** Keys from the other seat in split-screen, or typed into a text field, are not ours. */
    function foreign(e: KeyboardEvent): boolean {
      const t = (e.composedPath?.()[0] ?? e.target) as Element | null;
      if (!t || !(t instanceof Element)) return false;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t as HTMLElement).isContentEditable) return true;
      const tgt = e.target instanceof Element ? e.target : t;
      const seat = tgt.closest('[data-versus-seat]');
      return !!seat && !seat.contains(root);
    }

    const onKey = (e: KeyboardEvent, down: boolean) => {
      if (foreign(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const c = e.code || '', k = e.key;
      const isLeft = c === 'ArrowLeft' || c === 'KeyA' || k === 'ArrowLeft';
      const isRight = c === 'ArrowRight' || c === 'KeyD' || k === 'ArrowRight';
      const isDown = c === 'ArrowDown' || c === 'KeyS' || k === 'ArrowDown';
      const isTurbo = c === 'ShiftLeft' || c === 'ShiftRight' || k === 'Shift' || c === 'KeyX' || c === 'KeyJ';
      const isJump = c === 'Space' || k === ' ' || c === 'ArrowUp' || k === 'ArrowUp' || c === 'KeyW' || c === 'KeyZ' || c === 'KeyK';
      const isEnter = c === 'Enter' || c === 'NumpadEnter' || k === 'Enter';
      if (isLeft) keys.left = down;
      if (isRight) keys.right = down;
      if (isDown) keys.down = down;
      if (isTurbo) keys.turbo = down;
      if (isJump) {
        if (down && !keys.jump && !e.repeat) jumpQueued = true;
        keys.jump = down;
      }
      if (isLeft || isRight || isDown || isJump) e.preventDefault();
      if (!down || e.repeat) return;
      if (state === 'title' && !paused) {
        if (isLeft) pickStage(sel - 1);
        if (isRight) pickStage(sel + 1);
        if (/^Digit[1-9]$/.test(c)) pickStage(Number(c.slice(5)) - 1);
      }
      if (c === 'KeyR' || k === 'r' || k === 'R') retryAction();
      if (c === 'KeyP') togglePause();
      if (isEnter || c === 'Space' || k === ' ') primaryAction();
    };
    const keydownHandler = (e: KeyboardEvent) => onKey(e, true);
    const keyupHandler = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener('keydown', keydownHandler);
    window.addEventListener('keyup', keyupHandler);
    window.addEventListener('blur', releaseAll);

    // Touch controls binding
    if (touchControls && padEl) {
      const pad = padEl;
      const halves = { left: pad.querySelector<HTMLElement>('[data-half="left"]'), right: pad.querySelector<HTMLElement>('[data-half="right"]') };
      let padPointer = -1;
      const paintPad = () => {
        if (halves.left) halves.left.style.background = keys.left ? 'rgba(255,255,255,0.4)' : 'transparent';
        if (halves.right) halves.right.style.background = keys.right ? 'rgba(255,255,255,0.4)' : 'transparent';
      };
      const padMove = (e: PointerEvent) => {
        const r = pad.getBoundingClientRect();
        const dir = e.clientX < r.left + r.width / 2 ? -1 : 1;
        if (state === 'title') { keys.left = keys.right = false; return; }
        keys.left = dir < 0; keys.right = dir > 0; paintPad();
      };
      const padDown = (e: PointerEvent) => {
        e.preventDefault();
        padPointer = e.pointerId;
        try { pad.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
        if (state === 'title' && !paused) {
          const r = pad.getBoundingClientRect();
          pickStage(sel + (e.clientX < r.left + r.width / 2 ? -1 : 1));
          return;
        }
        padMove(e);
      };
      const padUp = (e: PointerEvent) => { if (e.pointerId !== padPointer) return; padPointer = -1; keys.left = keys.right = false; paintPad(); };
      pad.addEventListener('pointerdown', padDown);
      pad.addEventListener('pointermove', (e) => { if (e.pointerId === padPointer) padMove(e); });
      pad.addEventListener('pointerup', padUp);
      pad.addEventListener('pointercancel', padUp);
      pad.addEventListener('contextmenu', (e) => e.preventDefault());

      const bindBtn = (name: string, onDown: () => void, onUp: () => void) => {
        const b = touchControls!.querySelector<HTMLButtonElement>(`[data-btn="${name}"]`);
        if (!b) return;
        const base = b.style.background;
        let id = -1;
        b.addEventListener('pointerdown', (e) => {
          e.preventDefault(); id = e.pointerId;
          try { b.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
          b.style.background = 'rgba(255,255,255,0.5)'; onDown();
        });
        const up = (e: PointerEvent) => { if (e.pointerId !== id) return; id = -1; b.style.background = base; onUp(); };
        b.addEventListener('pointerup', up);
        b.addEventListener('pointercancel', up);
        b.addEventListener('contextmenu', (e) => e.preventDefault());
      };
      bindBtn('turbo', () => { keys.turbo = true; }, () => { keys.turbo = false; });
      bindBtn('jump', () => {
        if (state !== 'playing' || userPaused) { primaryAction(); return; }
        if (!keys.jump) jumpQueued = true;
        keys.jump = true;
      }, () => { keys.jump = false; });
      bindBtn('pause', () => {
        if (state === 'playing' && !paused) host.dispatchEvent(new CustomEvent('integ:pause-request', { bubbles: true }));
      }, () => undefined);
      touchCleanups.push(() => { padPointer = -1; });
    }

    const pointerHandler = (e: PointerEvent) => {
      if (paused) return;
      canvas.focus({ preventScroll: true });
      if (state === 'playing' && !userPaused) return;
      const r = canvas.getBoundingClientRect();
      const ux = (e.clientX - r.left) / Math.max(1, r.width) * uw, uy = (e.clientY - r.top) / Math.max(1, r.height) * uh;
      const hit = hits.find((h) => ux >= h.x && ux <= h.x + h.w && uy >= h.y && uy <= h.y + h.h);
      if (hit?.act.startsWith('stage:')) {
        const i = Number(hit.act.slice(6));
        if (i === sel) primaryAction(); else pickStage(i);
      } else if (hit?.act === 'retry') retryAction();
      else if (hit || state === 'title' || userPaused) primaryAction();
    };
    canvas.addEventListener('pointerdown', pointerHandler);

    function updateFx(dt: number) {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.t += dt; if (p.t >= p.d) { particles.splice(i, 1); continue; }
        p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      }
      for (let i = popups.length - 1; i >= 0; i--) {
        const p = popups[i];
        p.t += dt; if (p.t >= p.d) { popups.splice(i, 1); continue; }
        p.y += p.vy * dt; p.vy *= Math.pow(0.94, dt * 60);
      }
    }

    function update(dt: number) {
      gtime += dt; stateT += dt;
      audio.step(state === 'playing' && userPaused ? 'paused' : state === 'playing' || state === 'title' ? state : 'idle');
      if (shakeT > 0) shakeT = Math.max(0, shakeT - dt);
      updateFx(dt);

      if (state === 'title') {
        camX = (gtime * 45) % Math.max(1, sim.worldW - VW);
        jumpQueued = false;
        return;
      }
      if (state !== 'playing' || userPaused) { jumpQueued = false; return; }
      if (bannerT > 0) bannerT = Math.max(0, bannerT - dt);

      acc = Math.min(acc + dt, 0.1);
      while (acc >= STEP && state === 'playing') {
        acc -= STEP;
        keys.jumpPressed = jumpQueued; jumpQueued = false;
        stepSim(sim, keys, STEP);
        keys.jumpPressed = false;
        if (sim.events.length) {
          const evs = sim.events; sim.events = [];
          evs.forEach(onEvent);
        }
        if (sim.score !== reported) {
          reported = sim.score;
          services.reportScore(sim.score);
          if (sim.score > hiScore) { hiScore = sim.score; services.storage.set('hiscore', hiScore); }
        }
      }

      const P = sim.P;
      if (!P.dead) {
        if (P.turbo && Math.random() < dt * 34) emit(P.x + (P.dir > 0 ? 0 : PW), P.y + PH - 6, 1, { col: ['#ffd166', '#ff8c42', '#fff'], s0: 3, s1: 6, v0: 20, v1: 60, g: -40, d0: 0.18, d1: 0.32 });
        if (P.gliding && Math.random() < dt * 18) emit(P.x + PW / 2, P.y + 20, 1, { col: '#fff', s0: 2, s1: 4, v0: 10, v1: 35, g: 30, d0: 0.25, d1: 0.45 });
        lookDir = lerp(lookDir, P.dir, 1 - Math.exp(-dt * 3.2));
        camX = lerp(camX, camTarget(), 1 - Math.exp(-dt * 7));
      }
    }

    function render() {
      if (!ctx) return;
      setView(VW);
      ctx.setTransform(SC, 0, 0, SC, 0, 0);
      const curTheme = LEVELS[sim.lv].theme;
      const th = THEMES[curTheme];
      drawBackground(ctx, curTheme, camX, gtime);

      ctx.save();
      const sx = shakeT > 0 ? (Math.random() - 0.5) * shakeM * 2 : 0;
      const sy = shakeT > 0 ? (Math.random() - 0.5) * shakeM * 2 : 0;
      const cam = Math.round(camX * SC) / SC; // snap to device pixels: no shimmer between tiles
      ctx.translate(-cam + sx, sy);

      const c0 = Math.max(0, Math.floor(camX / T) - 1);
      const c1 = Math.min(sim.cols - 1, Math.ceil((camX + VW) / T) + 1);
      for (let r = 0; r < ROWS; r++) {
        for (let c = c0; c <= c1; c++) {
          const ch = sim.grid[r][c];
          if (ch !== '.' && ch !== 'x') drawTile(ctx, sim.grid, r, c, c * T, r * T, th, gtime);
        }
      }

      drawEntities(ctx, sim.goal, sim.checks, sim.springs, sim.movers, sim.crumbles, sim.items, sim.enemies, camX, gtime, isZh);
      if (state !== 'title') drawPelican(ctx, sim.P, gtime);

      for (const p of particles) {
        ctx.globalAlpha = 1 - p.t / p.d;
        ctx.fillStyle = p.col;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.sz * (1 - p.t / p.d * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      const popScale = Math.max(1, UI / SC * 0.82); // keep score pop-ups readable when the world is zoomed out
      for (const p of popups) {
        ctx.globalAlpha = Math.min(1, (1 - p.t / p.d) * 2);
        ctx.font = `800 ${Math.round(p.sz * popScale)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#141b2d';
        ctx.lineWidth = 4;
        ctx.lineJoin = 'round';
        const px = clamp(p.x, camX + 70, camX + VW - 70);
        ctx.strokeText(p.txt, px, p.y);
        ctx.fillStyle = p.col;
        ctx.fillText(p.txt, px, p.y);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      drawWater(ctx, th, camX, gtime);

      ctx.setTransform(UI, 0, 0, UI, 0, 0);
      const ui = {
        uw, uh, padL, touch: isTouchDevice, isZh, gtime,
        state: (state === 'playing' && userPaused ? 'paused' : state) as 'title' | 'playing' | 'paused' | 'levelclear' | 'victory',
        P: sim.P, lv: state === 'title' ? sel : sim.lv,
        progress: sim.P.x / Math.max(1, sim.goal.x), time: sim.time, deaths: sim.deaths, bannerT,
        fishGot: sim.fishGot, fishTot: sim.fishTot, starGot: sim.starGot, starTot: sim.starTot,
        score: sim.score, hiScore, sel, unlocked: unlocked(), bests, result
      };
      if (state !== 'title') drawHUD(ctx, ui);
      hits = drawOverlay(ctx, ui);
      if (root.dataset.state !== ui.state) {
        root.dataset.state = ui.state;
        const pauseBtn = touchControls?.querySelector<HTMLElement>('[data-btn="pause"]');
        if (pauseBtn) pauseBtn.style.visibility = ui.state === 'playing' ? 'visible' : 'hidden';
      }
      root.dataset.pelicanStage = String(sim.lv + 1);
    }

    // Read-only handle for automated play-tests.
    Object.defineProperty(root, '__sim', { get: () => sim, configurable: true });

    let raf = 0;
    let lastT = performance.now();
    function loop(now: number) {
      const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
      lastT = now;
      if (!paused) update(dt);
      if (++frame % 45 === 0 && isTouchDevice) layout();
      render();
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    return {
      pause() { paused = true; releaseAll(); },
      resume() { paused = false; lastT = performance.now(); },
      restart() {
        paused = false;
        releaseAll();
        startStage(state === 'title' || state === 'victory' ? sel : sim.lv, 0);
      },
      destroy() {
        cancelAnimationFrame(raf);
        ro?.disconnect();
        window.removeEventListener('resize', layout);
        window.removeEventListener('keydown', keydownHandler);
        window.removeEventListener('keyup', keyupHandler);
        window.removeEventListener('blur', releaseAll);
        canvas.removeEventListener('pointerdown', pointerHandler);
        touchCleanups.forEach((fn) => fn());
        audio.destroy();
        host.replaceChildren();
      }
    };
  }
};

export default pelicanBike;
