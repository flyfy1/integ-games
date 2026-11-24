import type { GameController, GameModule, GameServices } from '../../core/game-types';
import { createAudio } from './audio';
import { cellUnder, toScreen } from './render/layout';
import { createDialogue, type Dialogue } from './ui/dialogue';
import { FOCUSABLE, h, nearestInDirection } from './ui/dom';
import { STYLES } from './ui/styles';
import type { I18n as ClassicI18n } from './i18n';
import { createI18n, defaultLang, type Lang } from './puzzle/i18n';
import { createPuzzleHud, type PuzzleHud } from './puzzle/hud';
import { nextPuzzle, PUZZLES, puzzleById, rulesUpTo } from './puzzle/levels';
import { createPuzzleRenderer } from './puzzle/render';
import { loadPuzzle, recordRun, resetPuzzle, writePuzzle, type PuzzleSave } from './puzzle/save';
import { PSCREENS, type PParams, type PResults, type PScreen, type PUi } from './puzzle/screens';
import { createSession, type Session, type SessionEvent } from './puzzle/session';
import { applyScript, simulate } from './puzzle/sim';
import { PUZZLE_SCENES } from './puzzle/story';
import { PUZZLE_STYLES } from './puzzle/styles';
import type { PuzzleLevel, RuleId } from './puzzle/types';

/** Position in the puzzle campaign (1..n), which the arcade records as progress. */
export const campaignNumber = (levelId: string): number => PUZZLES.findIndex(level => level.id === levelId) + 1;

/**
 * Crumb Raiders shell (puzzle mode, 2026-11-24): stage, sizing, the frame loop and which screen is in front.
 * Rules in `puzzle/sim.ts` (pure, deterministic), interaction in `puzzle/session.ts`, drawing in `puzzle/render.ts`,
 * menus in `puzzle/screens.ts`, HUD in `puzzle/hud.ts`. Each level: plan with the clock stopped, press GO, watch a
 * few seconds, win or see why it failed with the trail kept. The old real-time campaign lives in `classic.ts`,
 * out of the build path.
 */
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
const HAND_SVG = '<svg viewBox="0 0 64 64" width="54" height="54" aria-hidden="true"><path d="M24 6c3 0 5 2 5 5v17l2-1c2-6 9-5 10 0 2-4 9-3 9 2 2-2 8-1 8 4v12c0 9-6 15-15 15h-6c-5 0-9-2-12-6L14 41c-2-3 1-7 5-5l2 2V11c0-3 1-5 3-5z" fill="#fff6e3" stroke="#2b1d14" stroke-width="3.5" stroke-linejoin="round"/></svg>';

export const antRaid: GameModule = {
  meta: {
    slug: 'ant-raid', title: 'Crumb Raiders', category: 'puzzle',
    description: 'A planning puzzle on a summer lawn: draw one scent trail, press GO, and watch the colony carry the picnic home in seconds. Count the cells, read the spider, choose who leaves first.',
    instructions: 'Drag from the anthill to food to lay a scent trail (each cell costs Scent). Ants leave in order and each takes the nearest food by trail; the badges show who goes where before you press GO. If a run fails, the board says why and your trail is kept. Undo (hold to clear). Keys: arrows move, hold Space while moving to draw, Enter GO, Backspace undo, E Digger, H rules, F hold to speed up, P pause.',
    accent: '#e8574a', mechanic: 'Plan a scent trail, press GO, watch it work'
  },
  mount(host: HTMLElement, services: GameServices): GameController {
    const loaded = loadPuzzle(services.storage);
    let save: PuzzleSave = loaded.save;
    const reducedNow = () => services.isReducedMotion || save.settings.reducedFx;
    const root = document.createElement('div');
    root.className = `ar${reducedNow() ? ' reduced' : ''}`;
    root.tabIndex = 0;
    root.setAttribute('data-ant-raid', '');
    root.setAttribute('role', 'application');
    root.setAttribute('aria-label', 'Crumb Raiders');
    const style = document.createElement('style');
    style.textContent = STYLES + PUZZLE_STYLES;
    // The canvas stays the first <canvas> in the stage: the arcade's gamepad bridge sends its keys there.
    const canvas = document.createElement('canvas');
    canvas.className = 'ar-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    const hand = h('div', { class: 'ar-finger', hidden: true });
    hand.innerHTML = HAND_SVG;
    root.append(style, canvas, hand);
    host.replaceChildren(root);
    const ctx = canvas.getContext('2d')!;

    const audio = createAudio(services, { music: save.settings.music, sfx: save.settings.sfx });
    let renderer = createPuzzleRenderer(reducedNow());
    let i18n = createI18n(save.lang ?? defaultLang());
    let session: Session | null = null, hud: PuzzleHud | null = null, dialogue: Dialogue | null = null;
    let screen: { name: PScreen; params: PParams; element: HTMLElement } | null = null;
    let current: PuzzleLevel | null = null, resultsShown = false, touched = false;
    let externalPause = false, destroyed = false, raf = 0, last = 0, clock = 0, frozen = false;
    let storageWarned = false, drawFailed = false, noticeTimer: ReturnType<typeof setTimeout> | null = null;
    const notice = h('div', { class: 'ar-notice', role: 'status', hidden: true });
    root.append(notice);
    const setState = (value: string) => { root.dataset.state = value; };
    const showNotice = (text: string, ms = 4500) => {
      notice.textContent = text; notice.hidden = false;
      if (noticeTimer) clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => { noticeTimer = null; notice.hidden = true; }, ms);
    };
    const persist = () => {
      const ok = writePuzzle(services.storage, save);
      if (!ok && !storageWarned) { storageWarned = true; showNotice(i18n.t('common.storage'), 6000); }
      return ok;
    };

    // ------------------------------------------------------------ sizing
    const layout = () => {
      if (destroyed) return;
      const immersive = host.classList.contains('is-immersive') || (typeof document !== 'undefined' && document.fullscreenElement === host);
      root.classList.toggle('is-immersive', immersive);
      const css = getComputedStyle(host), pad = (a: string, b: string) => (parseFloat(a) || 0) + (parseFloat(b) || 0);
      const hostWidth = host.clientWidth - pad(css.paddingLeft, css.paddingRight);
      const width = hostWidth > 40 ? hostWidth : 360;
      let height: number;
      if (immersive && host.clientHeight > 0) height = host.clientHeight - pad(css.paddingTop, css.paddingBottom);
      else if (width < 560) height = clamp(window.innerHeight - 150, 500, width * 2);
      else height = clamp(window.innerHeight - 200, 440, Math.min(760, width * 0.66));
      height = Math.floor(height);
      root.style.setProperty('--ar-h', `${height}px`);
      root.classList.toggle('compact', width < 640 || height < 480);
      root.classList.toggle('narrow', width < 520);
      const pr = Math.min(2, window.devicePixelRatio || 1);
      const pw = Math.round(width * pr), ph = Math.round(height * pr);
      if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
      const insets = hud ? hud.insets() : NO_INSETS;
      root.style.setProperty('--ar-bottom', `${insets.bottom + 8}px`);
      root.style.setProperty('--ar-top', `${insets.top + 6}px`);
      renderer.resize(width, height, pr, insets, session?.level ?? null);
      root.classList.toggle('rot', renderer.layout.rot);
    };
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(layout);
    observer?.observe(host);
    window.addEventListener('resize', layout);
    document.addEventListener('fullscreenchange', layout);

    // ------------------------------------------------------------ screens
    let menuMuted = false;
    const setMenuMute = (on: boolean) => { if (on === menuMuted) return; menuMuted = on; if (on) audio.pause(); else if (!externalPause) audio.resume(); };
    const keepsLevel = (name: PScreen, params: PParams) => name === 'pause' || name === 'results' || name === 'rule' || (name === 'settings' && params.from === 'pause');
    const focusScreen = (element: HTMLElement) => {
      const target = element.querySelector<HTMLElement>('.ar-node.current:not(:disabled)') ?? element.querySelector<HTMLElement>('.ar-btn.primary:not(:disabled)') ?? element.querySelector<HTMLElement>(FOCUSABLE);
      (target ?? root).focus({ preventScroll: true });
    };
    const closeScreen = () => { if (screen?.name === 'pause') setMenuMute(false); screen?.element.remove(); screen = null; };
    function go(name: PScreen, params: PParams = {}): void {
      if (destroyed) return;
      const scroll = screen && screen.name === name ? screen.element.scrollTop : 0;
      closeScreen();
      if (!keepsLevel(name, params) && session) endLevel();
      const element = PSCREENS[name](ui, params);
      screen = { name, params, element };
      root.insertBefore(element, notice);
      element.scrollTop = scroll;
      setState(name);
      if (name === 'pause') setMenuMute(true);
      if (!keepsLevel(name, params)) audio.music('menu');
      focusScreen(element);
    }
    const playScene = (sceneId: string | undefined, then: () => void) => {
      const scene = sceneId ? PUZZLE_SCENES[sceneId] : undefined;
      if (!scene || save.scenes.includes(scene.id)) { then(); return; }
      closeScreen();
      if (session) endLevel();
      audio.music('story');
      dialogue = createDialogue({ i18n: i18n as unknown as ClassicI18n, audio, reduced: reducedNow() }, scene, () => {
        dialogue?.element.remove(); dialogue = null;
        if (!save.scenes.includes(scene.id)) { save.scenes.push(scene.id); persist(); }
        then();
      });
      root.insertBefore(dialogue.element, notice); setState('dialogue'); root.focus({ preventScroll: true });
    };

    // ------------------------------------------------------------ a level
    const tutorial = (level: PuzzleLevel) => level.id === '1-1' && !save.levels['1-1']?.win;
    function endLevel(): void {
      hud?.element.remove(); hud = null; session = null; current = null; resultsShown = false;
      hand.hidden = true;
      renderer.reset();
      layout();
    }
    const hudActions = {
      go: () => { if (!session?.canGo) return; touched = true; hand.hidden = true; session.go(); setState('run'); },
      retry: () => { session?.stop(); setState('level'); },
      undo: () => { session?.undo(); },
      clear: () => { session?.clear(); },
      rules: () => { if (current) { audio.sfx('ui'); go('rule', { rules: rulesUpTo(current.id), all: true }); } },
      menu: () => pauseGame(),
      digger: () => { if (session && session.mode === 'plan') { session.tool = session.tool === 'digger' ? 'trail' : 'digger'; audio.sfx('select'); } },
      hint: () => showHint()
    };
    function mountHud(): void {
      if (!session || !current) return;
      hud?.element.remove();
      hud = createPuzzleHud(i18n, session, hudActions, { tutorial: tutorial(current) });
      root.insertBefore(hud.element, hand);
      if ((save.levels[current.id]?.fails ?? 0) >= 3) hud.setHint(true);
      layout();
      requestAnimationFrame?.(() => layout());
    }
    function play(id: string): void {
      const level = puzzleById(id);
      if (!level || destroyed) return;
      closeScreen();
      if (dialogue) { dialogue.element.remove(); dialogue = null; }
      if (session) endLevel();
      current = level; resultsShown = false; touched = false; frozen = false;
      session = createSession(level, { reduced: reducedNow() });
      if (tutorial(level)) session.ghost = level.solution.paths[0].slice(1);
      mountHud();
      renderer.reset();
      layout();
      audio.music('level');
      setState('level');
      root.focus({ preventScroll: true });
      // New rules open as cards (never on the 1-1 tutorial, where the hand does the explaining).
      const fresh = level.rules.filter(r => !save.rules.includes(r));
      if (fresh.length && !tutorial(level)) go('rule', { rules: fresh });
    }
    function showHint(): void {
      if (!session || !current) return;
      const path = current.solution.paths.flat();
      session.ghost = path.slice(1, Math.max(2, Math.ceil(path.length / 3)));
      audio.sfx('select');
    }
    function pauseGame(): void {
      if (!session || screen || dialogue) return;
      audio.sfx('ui');
      if (session.mode !== 'plan' && session.mode !== 'won') session.stop();
      go('pause');
    }
    const resumeLevel = () => { if (screen && keepsLevel(screen.name, screen.params)) { closeScreen(); setMenuMute(false); setState('level'); root.focus({ preventScroll: true }); } };

    function onSessionEvent(event: SessionEvent): void {
      if (!session || !current) return;
      renderer.onEvent(event, session);
      hud?.onEvent(event);
      switch (event.type) {
        case 'paint': audio.sfx('paint', 0.9 + (event.cell % 5) * 0.06); if (tutorial(current)) touched = true; break;
        case 'erase': audio.sfx('erase'); break;
        case 'connect': audio.sfx('connect'); break;
        case 'deny': audio.sfx('deny'); break;
        case 'go': audio.sfx('hatch'); break;
        case 'bite': audio.sfx('bite'); break;
        case 'deliver': audio.sfx(event.big ? 'bigpop' : 'pop', Math.pow(2, Math.min(12, event.total) / 12)); break;
        case 'eaten': audio.sfx('death'); break;
        case 'bridge': audio.sfx('bridge'); break;
        case 'lift': audio.sfx('lift'); break;
        case 'dig': audio.sfx('dig'); break;
        case 'won': {
          audio.sfx('win');
          const cost = session.plan.cost;
          const outcome = recordRun(save, current.id, true, cost, current.par);
          for (const r of current.rules) if (!save.rules.includes(r)) save.rules.push(r);
          persist();
          services.reportComplete(campaignNumber(current.id));
          pendingResults = { level: current.id, first: outcome.first, elegant: outcome.elegant || !!save.levels[current.id]?.elegant, got: outcome.elegant, cost, par: current.par, next: nextPuzzle(current.id) };
          break;
        }
        case 'fail': {
          audio.sfx('lose');
          recordRun(save, current.id, false, session.plan.cost, current.par);
          persist();
          if ((save.levels[current.id]?.fails ?? 0) >= 3) hud?.setHint(true);
          setState('level');
          break;
        }
      }
    }
    let pendingResults: PResults | null = null;

    const ui: PUi = {
      get i18n() { return i18n; }, get save() { return save; },
      go: (name, params) => { audio.sfx('ui'); go(name, params); },
      play: (id) => { audio.sfx('ui'); play(id); },
      next() {
        audio.sfx('ui');
        const r = (screen?.params.results ?? pendingResults);
        const level = r ? puzzleById(r.level) : null;
        const then = () => { if (r?.next) play(r.next); else go('levels'); };
        if (level?.outro && r?.first) playScene(level.outro, then); else then();
      },
      replay() { audio.sfx('ui'); if (current) { const id = current.id; play(id); } },
      levels() { audio.sfx('ui'); go('levels'); },
      resume() { audio.sfx('ui'); resumeLevel(); },
      clear() { audio.sfx('erase'); session?.clear(); resumeLevel(); },
      title() { audio.sfx('ui'); go('title'); },
      closeRules() {
        audio.sfx('ui');
        if (screen?.name === 'rule' && !screen.params.all) { for (const r of screen.params.rules ?? []) if (!save.rules.includes(r as RuleId)) save.rules.push(r as RuleId); persist(); }
        resumeLevel();
      },
      setLang(lang: Lang) {
        save.lang = lang; persist();
        i18n = createI18n(lang);
        audio.sfx('ui');
        if (session) mountHud();
        if (screen) go(screen.name, screen.params);
      },
      setSetting(key, value) {
        save.settings[key] = value as never;
        persist();
        if (key === 'music' || key === 'sfx') { audio.setVolumes({ [key]: value as number }); if (key === 'sfx') audio.sfx('select'); }
        if (key === 'reducedFx') { const reduced = reducedNow(); root.classList.toggle('reduced', reduced); renderer = createPuzzleRenderer(reduced); layout(); }
      },
      resetProgress() { save = resetPuzzle(services.storage, save); persist(); go('title'); showNotice(i18n.t('settings.resetDone')); }
    };

    // ------------------------------------------------------------ input
    const blocked = () => externalPause || !!screen || !!dialogue;
    let pointer: number | null = null;
    const cellAt = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect(), L = renderer.layout;
      const k = rect.width > 0 ? L.width / rect.width : 1;
      return cellUnder(L, (event.clientX - rect.left) * k, (event.clientY - rect.top) * k);
    };
    const onDown = (event: PointerEvent) => {
      if (blocked() || !session) return;
      event.preventDefault();
      root.focus({ preventScroll: true });
      session.cursor = null;
      if (session.mode === 'run') { session.hold = true; pointer = event.pointerId; return; }
      if (session.mode !== 'plan') return;
      const cell = cellAt(event);
      if (!cell) return;
      pointer = event.pointerId;
      canvas.setPointerCapture?.(event.pointerId);
      touched = true; hand.hidden = true;
      session.dragStart(cell.x, cell.y);
      root.classList.add('touching');
    };
    const onMove = (event: PointerEvent) => {
      if (!session) return;
      const cell = cellAt(event);
      if (pointer === null || event.pointerId !== pointer) { if (event.pointerType === 'mouse') session.hover = cell; return; }
      if (cell && session.mode === 'plan') session.dragTo(cell.x, cell.y);
    };
    const onUp = (event: PointerEvent) => {
      if (pointer === null || event.pointerId !== pointer) return;
      pointer = null;
      root.classList.remove('touching');
      if (!session) return;
      session.hold = false;
      if (session.mode === 'plan') session.dragEnd();
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', (event) => { if (session && event.pointerType === 'mouse' && pointer === null) session.hover = null; });

    let spaceDown = false;
    const moveFocus = (container: HTMLElement, dx: number, dy: number) => {
      const items = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => !el.closest('[hidden]'));
      if (!items.length) return;
      const active = document.activeElement as HTMLElement | null;
      if (!active || !items.includes(active)) { items[0].focus(); return; }
      const others = items.filter(el => el !== active);
      let best: HTMLElement | null = others[nearestInDirection(active.getBoundingClientRect(), others.map(el => el.getBoundingClientRect()), dx, dy)] ?? null;
      if (!best) { const index = items.indexOf(active), step = dx + dy > 0 ? 1 : -1; best = items[(index + step + items.length) % items.length]; }
      best.focus();
    };
    const dirOf = (key: string) => (key === 'ArrowDown' ? [0, 1] : key === 'ArrowUp' ? [0, -1] : key === 'ArrowRight' ? [1, 0] : key === 'ArrowLeft' ? [-1, 0] : null);
    const onKey = (event: KeyboardEvent) => {
      if (externalPause || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key;
      if (dialogue) {
        if (key === ' ' || key === 'Enter') { event.preventDefault(); if (!event.repeat) dialogue.advance(); }
        else if (key === 'Escape' || key === 'x') { event.preventDefault(); event.stopPropagation(); dialogue.back(); }
        return;
      }
      if (screen) {
        const container = screen.element;
        if (key === 'Escape' || key === 'x' || ((key === 'p' || key === 'P') && screen.name === 'pause')) {
          event.preventDefault(); event.stopPropagation();
          if (screen.name === 'pause' || screen.name === 'rule') ui.closeRules();
          else container.querySelector<HTMLElement>('[data-action=back]')?.click();
          return;
        }
        const dir = dirOf(key);
        const active = document.activeElement as HTMLElement | null, inside = !!active && container.contains(active);
        if (!inside && (dir || key === 'Enter' || key === ' ')) {
          event.preventDefault(); focusScreen(container);
          const target = document.activeElement as HTMLElement | null;
          if (!dir && !event.repeat && target && container.contains(target) && target.matches('.ar-btn.primary, .ar-node.current')) target.click();
          return;
        }
        if (active instanceof HTMLInputElement && active.type === 'range' && dir && dir[0] !== 0) {
          event.preventDefault();
          active.value = String(clamp(Number(active.value) + dir[0] * 10, 0, 100)); active.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
        if (dir) { event.preventDefault(); moveFocus(container, dir[0], dir[1]); return; }
        if ((key === ' ' || key === 'Enter') && inside && active?.matches('button, [role=switch]')) { event.preventDefault(); if (!event.repeat) active.click(); }
        return;
      }
      if (!session) return;
      const dir = dirOf(key);
      if (dir) { event.preventDefault(); touched = true; hand.hidden = true; session.moveCursor(dir[0], dir[1], spaceDown && session.mode === 'plan'); return; }
      switch (key) {
        case ' ':
          event.preventDefault();
          if (session.mode === 'run') { session.hold = true; return; }
          if (!event.repeat) { spaceDown = true; session.confirm(); }
          return;
        case 'Enter':
          event.preventDefault();
          if (event.repeat) return;
          if (session.mode === 'plan') hudActions.go(); else if (session.mode !== 'won') hudActions.retry();
          return;
        case 'Backspace': case 'z': case 'Z': case 'q': case 'Q': event.preventDefault(); if (event.shiftKey) session.clear(); else session.undo(); return;
        case 'c': case 'C': event.preventDefault(); session.clear(); return;
        case 'e': case 'E': case 'd': case 'D': event.preventDefault(); hudActions.digger(); return;
        case 'h': case 'H': case '?': event.preventDefault(); hudActions.rules(); return;
        case 'f': case 'F': case 'Shift': event.preventDefault(); session.hold = true; return;
        case 'x': case 'X': case 'Escape':
          event.preventDefault();
          if (session.mode === 'run' || session.mode === 'coast' || session.mode === 'beat') { hudActions.retry(); return; }
          if (session.tool === 'digger') { session.tool = 'trail'; return; }
          if (key === 'Escape') pauseGame();
          return;
        case 'p': case 'P': event.preventDefault(); pauseGame(); return;
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === ' ') { spaceDown = false; if (session) session.hold = false; if (screen || dialogue) event.preventDefault(); }
      if ((event.key === 'f' || event.key === 'F' || event.key === 'Shift') && session) session.hold = false;
    };
    root.addEventListener('keydown', onKey);
    root.addEventListener('keyup', onKeyUp);

    // ------------------------------------------------------------ loop
    let handT = 0;
    const placeHand = (dt: number) => {
      if (!session || !current || !tutorial(current) || screen || dialogue) { hand.hidden = true; return; }
      const L = renderer.layout, rect = canvas.getBoundingClientRect(), rootRect = root.getBoundingClientRect();
      const k = L.width > 0 && rect.width > 0 ? rect.width / L.width : 1;
      if (session.mode === 'plan' && session.canGo) {
        // The trail reaches the cookie: the hand moves to GO and taps it.
        const goBtn = root.querySelector<HTMLElement>('[data-ui=go]');
        if (!goBtn || goBtn.hidden) { hand.hidden = true; return; }
        const r = goBtn.getBoundingClientRect();
        handT += dt;
        hand.hidden = false;
        hand.style.left = `${r.left - rootRect.left + r.width * 0.55}px`;
        hand.style.top = `${r.top - rootRect.top + r.height * 0.45 + (reducedNow() ? 0 : Math.abs(Math.sin(handT * 4)) * 8)}px`;
        return;
      }
      if (touched || session.mode !== 'plan') { hand.hidden = true; return; }
      // Loop: drag from the nest along the ghost dots to the cookie, rest, again.
      handT = (handT + dt) % 2.4;
      const path = [current.solution.paths[0][0], ...session.ghost];
      const p = Math.min(1, handT / 1.8) * (path.length - 1), i = Math.floor(p), f = p - i;
      const a = path[i], b = path[Math.min(path.length - 1, i + 1)];
      const pos = toScreen(L, a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f);
      hand.hidden = false;
      hand.style.left = `${rect.left - rootRect.left + pos.x * k}px`;
      hand.style.top = `${rect.top - rootRect.top + pos.y * k}px`;
      hand.style.opacity = handT > 2.0 ? '0.4' : '1';
    };
    const frame = (now: number) => {
      raf = 0;
      if (destroyed || externalPause) return;
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000) || 0);
      last = now; clock += dt;
      if (dialogue) dialogue.update(dt);
      else if (session && !frozen && (!screen || screen.name === 'results')) {
        const events = session.advance(dt);
        for (const event of events) onSessionEvent(event);
        if (session.mode === 'won' && session.beatLeft <= 0 && !resultsShown && pendingResults) { resultsShown = true; go('results', { results: pendingResults }); }
      }
      renderer.update(dt);
      hud?.update();
      placeHand(dt);
      try { renderer.draw(ctx, session, clock, i18n); } catch (error) { if (!drawFailed) { drawFailed = true; console.error('[ant-raid] draw failed', error); } }
      raf = requestAnimationFrame(frame);
    };
    const startLoop = () => { if (!raf && !destroyed && !externalPause) { last = typeof performance !== 'undefined' ? performance.now() : 0; raf = requestAnimationFrame(frame); } };

    Object.defineProperty(root, '__ar', { configurable: true, value: {
      get session() { return session; }, get save() { return save; }, get screen() { return screen?.name ?? null; }, get renderer() { return renderer; },
      get dialogue() { return !!dialogue; }, levels: PUZZLES.map(level => level.id),
      go: (name: PScreen, params?: PParams) => go(name, params), play: (id: string) => play(id), start: (id: string) => play(id), persist,
      /** Art capture: draw a level's reference plan and play its run forward `seconds`, frozen there (until the next level opens). */
      stage(id: string, seconds: number) {
        play(id);
        closeScreen();
        const level = puzzleById(id)!, s = session!;
        const drawn = applyScript(level, level.solution, s.plan);
        if (!drawn.ok) return false;
        s.go();
        for (let k = 0; k < seconds * 120 && s.run; k++) s.advance(1 / 120);
        frozen = true;
        return true;
      },
      /** Page-space square of `cells` cells around yard point (x, y), for the art capture's icon close-up. */
      clip(x: number, y: number, cells: number) {
        const rect = canvas.getBoundingClientRect(), L = renderer.layout, k = rect.width / L.width;
        const c = toScreen(L, x, y), half = (cells * L.cell) / 2;
        return { x: rect.left + window.scrollX + (c.x - half) * k, y: rect.top + window.scrollY + (c.y - half) * k, width: 2 * half * k, height: 2 * half * k };
      },
      /** Bots: simulate a level's reference plan headlessly (no UI) and return its outcome. */
      check(id: string) { const level = puzzleById(id)!; const r = simulate(applyScript(level, level.solution).plan); return { status: r.status, ticks: r.tick }; }
    } });

    layout();
    go('title');
    if (loaded.hadCampaign && !save.noticed) { save.noticed = true; persist(); showNotice(i18n.t('title.reset'), 7000); }
    startLoop();

    return {
      pause() { if (destroyed || externalPause) return; externalPause = true; if (raf) { cancelAnimationFrame(raf); raf = 0; } audio.pause(); },
      resume() { if (destroyed || !externalPause) return; externalPause = false; if (!menuMuted) audio.resume(); startLoop(); },
      restart() {
        if (destroyed) return;
        if (externalPause) { externalPause = false; if (!menuMuted) audio.resume(); startLoop(); }
        dialogue?.element.remove(); dialogue = null;
        if (current) play(current.id); else go('title');
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (noticeTimer) clearTimeout(noticeTimer);
        observer?.disconnect();
        window.removeEventListener('resize', layout);
        document.removeEventListener('fullscreenchange', layout);
        root.removeEventListener('keydown', onKey);
        root.removeEventListener('keyup', onKeyUp);
        audio.dispose();
        session = null; hud = null; dialogue = null; screen = null;
        root.remove();
      }
    };
  }
};

export default antRaid;
