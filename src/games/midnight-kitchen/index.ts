import type { GameController, GameModule, GameServices } from '../../core/game-types';
import { createAudio } from './audio';
import { CHAPTERS, DEFENDERS, ENDLESS_LEVEL, ENDLESS_UNLOCK, LEVEL_LIST, levelById, META_UPGRADES, nextLevelId } from './data';
import { createI18n, defaultLang, type Lang } from './i18n';
import { attachInput } from './input';
import { createRenderer, type ViewState } from './render/renderer';
import { applyOutcome, buyUpgrade, isUnlocked, loadSave, metaOf, resetSave, respec, writeSave, type Save } from './save';
import { createSession, type Session } from './session';
import { starFlags } from './sim';
import { SCENES } from './story';
import { createDialogue, type Dialogue } from './ui/dialogue';
import { FOCUSABLE, h, nearestInDirection } from './ui/dom';
import { createHud, type Hud } from './ui/hud';
import { SCREENS, type ResultsData, type ScreenName, type ScreenParams, type UiContext } from './ui';
import { STYLES } from './ui/styles';

/** Position in the whole campaign (1..25 with five chapters of five), which the arcade records as progress. */
export const campaignNumber = (levelId: string): number => (CHAPTERS.flatMap(chapter => chapter.levels).indexOf(levelId) + 1) || (levelById(levelId)?.index ?? 1);

/**
 * Midnight Kitchen shell: owns the stage element, sizing, the frame loop and which screen is in front. The rules
 * are in `sim.ts`, the interaction model in `session.ts`, drawing in `render/`, menus in `ui/`, words in
 * `i18n.ts` / `story.ts` / `data/`, sound behind `audio.ts`.
 *
 * Robustness rules kept here: a finished night is written to the save the moment the sim decides it (before the
 * results animation), so Restart / leaving / destroy during the ending cannot lose a win; storage failures are
 * detected (read-back) and the game keeps playing from memory with a one-time notice; every screen can be left with
 * Esc / Back and navigated with arrows + Space / Enter (also what the arcade's gamepad bridge sends).
 */
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

export const midnightKitchen: GameModule = {
  meta: {
    slug: 'midnight-kitchen', title: 'Midnight Kitchen', category: 'action',
    description: 'After the fridge door closes, ingredients and utensils defend the birthday cake from hungry pests and creeping mold until dawn.',
    instructions: 'Tap a card, then a counter cell to place a defender (or drag the card there); tap a placed one to upgrade it. Burners make Heat, neighbours combine into Recipes, and the cake must keep a slice until dawn. Keys: 1-8 or Q/E pick a card, arrows move, Space places, U upgrades, X removes, F speed, P pause.',
    accent: '#ffb454', mechanic: 'Place, upgrade and combine kitchen defenders'
  },
  mount(host: HTMLElement, services: GameServices): GameController {
    const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    let save: Save = loadSave(services.storage);
    const reducedNow = () => services.isReducedMotion || save.settings.reducedFx;
    const root = document.createElement('div');
    root.className = `mk${reducedNow() ? ' reduced' : ''}`;
    root.tabIndex = 0;
    root.setAttribute('data-midnight-kitchen', '');
    root.setAttribute('role', 'application');
    root.setAttribute('aria-label', 'Midnight Kitchen');
    const style = document.createElement('style');
    style.textContent = STYLES;
    // The canvas must stay the first <canvas> in the stage: the arcade's gamepad bridge sends its keys there.
    const canvas = document.createElement('canvas');
    canvas.className = 'mk-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    root.append(style, canvas);
    host.replaceChildren(root);
    const ctx = canvas.getContext('2d')!;

    const audio = createAudio(services, { volumes: { music: save.settings.music, sfx: save.settings.sfx } });
    let renderer = createRenderer(reducedNow());
    const menuView: ViewState = { sim: null, time: 0, card: null, spatula: false, hover: null, cursor: null, selected: null, focusCell: null, focusDefender: null };

    let session: Session | null = null, hud: Hud | null = null, dialogue: Dialogue | null = null;
    let screen: { name: ScreenName; params: ScreenParams; element: HTMLElement } | null = null;
    let night: { level: string; loadout: string[] } | null = null;
    let pendingResults: ResultsData | null = null;
    let externalPause = false, destroyed = false, raf = 0, last = 0, clock = 0, endTimer = 0, ending = false, pixelRatio = 1;
    let storageWarned = false, drawFailed = false, noticeTimer: ReturnType<typeof setTimeout> | null = null;
    const notice = h('div', { class: 'mk-notice', role: 'status', hidden: true });
    root.append(notice);

    const setState = (value: string) => { root.dataset.state = value; };
    const showNotice = (text: string, ms = 4500) => {
      notice.textContent = text; notice.hidden = false;
      if (noticeTimer) clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => { noticeTimer = null; notice.hidden = true; }, ms);
    };
    const persist = () => {
      const ok = writeSave(services.storage, save);
      if (!ok && !storageWarned) { storageWarned = true; showNotice(ui.i18n.t('common.storage'), 6000); }
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
      else if (width < 560) height = clamp(window.innerHeight - 150, 480, width * 1.9);
      else height = clamp(window.innerHeight - 200, 440, Math.min(780, width * 0.7));
      height = Math.floor(height);
      root.style.setProperty('--mk-h', `${height}px`);
      root.classList.toggle('compact', width < 520 || height < 470);
      root.classList.toggle('narrow', width < 480);
      root.classList.toggle('hand-side', !!session && height < 470 && width > height * 1.35);
      pixelRatio = Math.min(2, window.devicePixelRatio || 1);
      const pw = Math.round(width * pixelRatio), ph = Math.round(height * pixelRatio);
      if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
      const insets = hud ? hud.insets() : NO_INSETS;
      root.style.setProperty('--mk-top', `${insets.top}px`);
      renderer.resize(width, height, pixelRatio, insets, session?.level ?? null);
      if (hud) renderer.effects.heatAnchor = hud.heatAnchor();
    };
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(layout);
    observer?.observe(host);
    window.addEventListener('resize', layout);
    document.addEventListener('fullscreenchange', layout);

    // ------------------------------------------------------------ screens
    // The in-game pause menu silences the kitchen (music and all) like the arcade's own pause does. The arcade can pause
    // on top of it; its resume must not bring the sound back while this menu is still up, hence the flag.
    let menuMuted = false;
    const setMenuMute = (on: boolean) => {
      if (on === menuMuted) return;
      menuMuted = on;
      if (on) audio.pause(); else if (!externalPause) audio.resume();
    };
    const closeScreen = (next?: ScreenName) => { if (screen?.name === 'pause' && next !== 'pause') setMenuMute(false); screen?.element.remove(); screen = null; };
    const focusScreen = (element: HTMLElement) => {
      // The main button; on the map, the level to play next (so Enter means "keep going", not "back").
      const target = element.querySelector<HTMLElement>('.mk-node.current:not(:disabled)') ?? element.querySelector<HTMLElement>('.mk-btn.primary:not(:disabled)')
        ?? element.querySelector<HTMLElement>('[aria-selected=true]') ?? element.querySelector<HTMLElement>(FOCUSABLE);
      (target ?? root).focus({ preventScroll: true });
    };
    const go = (name: ScreenName, params: ScreenParams = {}) => {
      if (destroyed) return;
      // Re-rendering the same screen (a purchase, a tab, a language switch) keeps the scroll position.
      const scroll = screen && screen.name === name ? screen.element.scrollTop : 0;
      closeScreen(name);
      if (name !== 'pause' && name !== 'results' && session) endNight();
      const element = SCREENS[name](ui, params);
      screen = { name, params, element };
      root.insertBefore(element, notice);
      element.scrollTop = scroll;
      setState(name);
      if (name === 'pause') setMenuMute(true);
      if (name !== 'pause' && name !== 'results') audio.music('menu');
      focusScreen(element);
    };

    const playScene = (sceneId: string | undefined, then: () => void, onlyFirstTime = true) => {
      const scene = sceneId ? SCENES[sceneId] : undefined;
      if (!scene || !scene.lines.length || (onlyFirstTime && save.scenes.includes(scene.id))) { then(); return; }
      closeScreen();
      audio.music('story');
      const done = () => {
        dialogue?.element.remove(); dialogue = null;
        if (!save.scenes.includes(scene.id)) { save.scenes.push(scene.id); persist(); }
        then();
      };
      dialogue = createDialogue({ i18n: ui.i18n, audio, reduced: reducedNow(), auto: save.settings.autoAdvance, setAuto: on => { save.settings.autoAdvance = on; persist(); } }, scene, done);
      root.insertBefore(dialogue.element, notice); setState('dialogue'); root.focus({ preventScroll: true });
    };

    // ------------------------------------------------------------ a night
    const coachStore = {
      seen: (id: string) => save.coach.seen.includes(id),
      see: (id: string) => { if (!save.coach.seen.includes(id)) { save.coach.seen.push(id); persist(); } },
      off: () => save.coach.off,
      skipAll: () => { save.coach.off = true; persist(); }
    };
    /** First scripted tutorial step not yet completed on an earlier attempt (all of them once the level is won). */
    const tutorialFrom = (levelId: string, steps: number) => {
      if (save.levels[levelId]?.win || save.coach.off) return steps;
      let index = 0;
      while (index < steps && save.coach.seen.includes(`${levelId}:${index}`)) index++;
      return index;
    };
    const buildHud = () => {
      if (!session) return;
      hud?.element.remove();
      hud = createHud(root, { i18n: ui.i18n, audio, touch, coach: coachStore }, session, { pause: pauseGame, toggleSpeed });
      root.insertBefore(hud.element, canvas.nextSibling);
    };
    function endNight(): void {
      hud?.element.remove(); hud = null; session = null; ending = false; endTimer = 0; pendingResults = null;
      renderer.reset();
      root.classList.remove('hand-side');
      layout();
    }
    function startNight(levelId: string, loadout: string[]): void {
      const level = levelById(levelId);
      if (!level || destroyed) return;
      closeScreen();
      if (session) endNight();
      if (!level.cards) { save.loadout = [...loadout]; persist(); }
      night = { level: levelId, loadout: [...loadout] };
      const steps = level.tutorial?.length ?? 0;
      session = createSession(level, {
        random: services.random, loadout, meta: metaOf(save), speed: save.speed, tutorialFrom: tutorialFrom(level.id, steps),
        onDeny: reason => { hud?.deny(reason); audio.sfx('deny'); },
        onTutorial: index => { for (let i = 0; i < index; i++) coachStore.see(`${level.id}:${i}`); }
      });
      buildHud();
      renderer.reset();
      layout();
      audio.music(level.music ?? 'countertop');
      setState('level');
      root.focus({ preventScroll: true });
    }
    /** Folds the finished night into the save right away; the results screen follows after the ending beat. */
    function commitNight(): void {
      if (!session || pendingResults) return;
      const sim = session.sim, level = session.level, flags = starFlags(sim), endless = level.id === ENDLESS_LEVEL.id;
      const hadEndless = !!save.levels[ENDLESS_UNLOCK]?.win;
      const openChapters = new Set(CHAPTERS.filter(chapter => chapter.levels[0] && isUnlocked(save, chapter.levels[0])).map(chapter => chapter.id));
      const reward = applyOutcome(save, level, { won: flags.win, flawless: flags.flawless, bonus: flags.bonus, time: sim.time, score: sim.score, wave: sim.wave + 1, recipes: sim.stats.recipes, enemiesSeen: sim.stats.enemiesSeen, defendersUsed: sim.stats.defendersUsed });
      if (flags.win && level.tutorial) for (let i = 0; i < level.tutorial.length; i++) if (!save.coach.seen.includes(`${level.id}:${i}`)) save.coach.seen.push(`${level.id}:${i}`);
      persist();
      if (endless) services.reportScore(sim.score);
      // The arcade wants one campaign-wide number (1..25), not the 1..5 that repeats in every chapter.
      else if (flags.win) services.reportComplete(campaignNumber(level.id));
      const opened = CHAPTERS.find(chapter => chapter.levels[0] && !openChapters.has(chapter.id) && isUnlocked(save, chapter.levels[0]));
      pendingResults = {
        level, won: flags.win, flags, reward, time: sim.time, kills: sim.stats.kills, score: sim.score, wave: sim.wave + 1, stats: { ...sim.stats, recipes: [...sim.stats.recipes] },
        nextLevel: flags.win ? nextLevelId(level.id) ?? null : null, endlessUnlocked: !hadEndless && !!save.levels[ENDLESS_UNLOCK]?.win, chapterOpened: opened?.id ?? null
      };
    }
    function finishNight(): void {
      if (!session) return;
      commitNight();
      const results = pendingResults!;
      hud?.element.remove(); hud = null;
      audio.music(results.won || results.level.id === ENDLESS_LEVEL.id ? 'victory' : 'defeat');
      if (results.reward.unlocked.length) audio.sfx('unlock');
      go('results', { results });
    }
    function pauseGame(): void {
      if (!session || session.sim.status !== 'playing' || screen || dialogue) return;
      audio.sfx('ui');
      go('pause', { level: ui.i18n.tr(session.level.name) });
    }
    function toggleSpeed(): void {
      if (!session) return;
      session.speed = session.speed === 1 ? 2 : 1;
      save.speed = session.speed; persist();
      audio.sfx('ui');
    }
    const resumeLevel = () => { if (screen?.name === 'pause') { closeScreen(); setState('level'); root.focus({ preventScroll: true }); } };

    const ui: UiContext = {
      i18n: createI18n(save.lang ?? defaultLang()), save, audio, reduced: reducedNow(),
      get inLevel() { return !!session; },
      go: (name, params) => { audio.sfx('ui'); go(name, params); },
      openLevel(levelId) {
        const level = levelById(levelId);
        if (!level) return;
        audio.sfx('ui');
        // A fixed-hand lesson nobody has won yet goes straight onto the counter: no picker to understand first.
        const direct = !!level.cards && !save.levels[level.id]?.win;
        playScene(level.intro, () => (direct ? startNight(levelId, level.cards!) : go('loadout', { level: levelId })));
      },
      startNight(levelId, loadout) { audio.sfx('ui'); startNight(levelId, loadout); },
      afterResults(results, choice) {
        audio.sfx('ui');
        const proceed = () => {
          if (choice === 'retry' && night) startNight(night.level, night.loadout);
          else if (choice === 'next' && results.nextLevel) { endNight(); ui.openLevel(results.nextLevel); }
          else if (choice === 'endless') { endNight(); ui.openLevel(ENDLESS_LEVEL.id); }
          // A boss win that opened the next kitchen lands on that kitchen's tab.
          else go('map', { chapter: results.chapterOpened ?? (results.level.chapter || undefined) });
        };
        // The outro belongs to the first win; retrying a won level should not sit through it again.
        if (results.won && choice !== 'retry') playScene(results.level.outro, proceed); else proceed();
      },
      resume() { resumeLevel(); audio.sfx('ui'); },
      retry() { if (night) startNight(night.level, night.loadout); },
      quitToMap() { go('map', { chapter: session?.level.chapter || undefined }); },
      setLang(lang: Lang) {
        save.lang = lang; persist();
        ui.i18n = createI18n(lang);
        audio.sfx('ui');
        if (session) buildHud();
        if (screen) go(screen.name, screen.params);
      },
      resetProgress() {
        save = resetSave(services.storage, save); ui.save = save; persist();
        go('title');
        showNotice(ui.i18n.t('settings.resetDone'));
      },
      buy(upgradeId) {
        const upgrade = META_UPGRADES.find(item => item.id === upgradeId);
        if (!upgrade || !buyUpgrade(save, upgrade)) { audio.sfx('deny'); return false; }
        persist(); audio.sfx('buy');
        return true;
      },
      respec() { const back = respec(save, META_UPGRADES); persist(); audio.sfx('buy'); if (back) showNotice(ui.i18n.t('shop.respecDone', { n: back })); return back; },
      setSetting(key, value) {
        save.settings[key] = value;
        persist();
        if (key === 'music' || key === 'sfx') { audio.setVolumes({ [key]: value as number }); if (key === 'sfx') audio.sfx('select'); }
        if (key === 'reducedFx') {
          const reduced = reducedNow();
          ui.reduced = reduced; root.classList.toggle('reduced', reduced);
          renderer = createRenderer(reduced); layout();
        }
      },
      setTips(on, reset = false) {
        save.coach.off = !on;
        if (reset) save.coach.seen = save.coach.seen.filter(id => id.startsWith('chapter:'));
        persist();
      },
      replayScene(sceneId, then, params) { audio.sfx('ui'); playScene(sceneId, () => go(then, params ?? {}), false); },
      markSeen(id) { if (!save.coach.seen.includes(id)) { save.coach.seen.push(id); persist(); } }
    };

    // ------------------------------------------------------------ input
    const detachInput = attachInput({
      root, canvas,
      session: () => session, layout: () => renderer.layout,
      blocked: () => externalPause || !!screen || !!dialogue || ending,
      pause: pauseGame, toggleSpeed,
      blip: kind => audio.sfx(kind === 'deny' ? 'deny' : 'select'),
      info: def => hud?.info(def), drag: state => hud?.drag(state), announce: def => hud?.announceCard(def)
    });
    /** Arrow-key focus move: the nearest focusable in that direction (falls back to document order). */
    const moveFocus = (container: HTMLElement, dx: number, dy: number) => {
      const all = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => !el.closest('[hidden]'));
      const laidOut = all.filter(el => el.offsetParent !== null || el.getClientRects().length > 0);
      const items = laidOut.length ? laidOut : all;
      if (!items.length) return;
      const current = document.activeElement as HTMLElement | null;
      if (!current || !items.includes(current)) { items[0].focus(); return; }
      const others = items.filter(el => el !== current);
      let best: HTMLElement | null = others[nearestInDirection(current.getBoundingClientRect(), others.map(el => el.getBoundingClientRect()), dx, dy)] ?? null;
      if (!best) { const index = items.indexOf(current), step = dx + dy > 0 ? 1 : -1; best = items[(index + step + items.length) % items.length]; }
      best.focus();
      best.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    };
    // Menus and dialogue: arrows walk the controls, Space / Enter press, Esc goes back. Synthetic key events from the
    // gamepad bridge do not trigger a native click, so activation is done here (and the native one suppressed).
    const onMenuKey = (event: KeyboardEvent) => {
      if (externalPause || event.ctrlKey || event.metaKey || event.altKey) return;
      if (dialogue) {
        const onButton = (document.activeElement as HTMLElement | null)?.closest?.('.mk-dialogue button');
        if ((event.key === ' ' || event.key === 'Enter') && !onButton) { event.preventDefault(); if (!event.repeat) dialogue.advance(); }
        else if ((event.key === ' ' || event.key === 'Enter') && onButton) { event.preventDefault(); if (!event.repeat) (onButton as HTMLElement).click(); }
        // The arcade pauses the game on any Escape that reaches the window; one we used (skip / back) must stop here.
        else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dialogue.back(); }
        return;
      }
      if (!screen) return;
      const container = screen.element;
      if (event.key === 'Escape' || ((event.key === 'p' || event.key === 'P') && screen.name === 'pause' && !screen.params.panel)) {
        const back = container.querySelector<HTMLElement>('[data-action=back]');
        if (screen.name === 'pause' && !screen.params.panel) ui.resume();
        else if (back) back.click();
        else return; // Nothing to go back to (title, results): let the arcade have the Escape.
        event.preventDefault(); event.stopPropagation();
        return;
      }
      const active = document.activeElement as HTMLElement | null, inside = !!active && container.contains(active);
      const dir = event.key === 'ArrowDown' ? [0, 1] : event.key === 'ArrowUp' ? [0, -1] : event.key === 'ArrowRight' ? [1, 0] : event.key === 'ArrowLeft' ? [-1, 0] : null;
      if (!inside && (dir || event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault(); focusScreen(container);
        // Enter / Space with nothing focused means "the main thing on this screen" (Play, Start, Resume…), not just "focus it".
        const target = document.activeElement as HTMLElement | null;
        if (!dir && !event.repeat && target && container.contains(target) && target.matches('.mk-btn.primary, .mk-node.current')) target.click();
        return;
      }
      if (active instanceof HTMLInputElement && active.type === 'range' && dir && dir[0] !== 0) {
        event.preventDefault();
        const step = Number(active.step) || 5, value = clamp(Number(active.value) + dir[0] * step * 2, Number(active.min) || 0, Number(active.max) || 100);
        active.value = String(value); active.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      if (dir) { event.preventDefault(); moveFocus(container, dir[0], dir[1]); return; }
      if ((event.key === ' ' || event.key === 'Enter') && inside && active && active.matches('button, [role=tab], [role=switch]')) {
        event.preventDefault();
        if (!event.repeat) active.click();
      }
    };
    // A real Space keyup would click the focused button a second time; we already did it on keydown.
    const onMenuKeyUp = (event: KeyboardEvent) => { if (event.key === ' ' && (screen || dialogue)) event.preventDefault(); };
    root.addEventListener('keydown', onMenuKey);
    root.addEventListener('keyup', onMenuKeyUp);

    // ------------------------------------------------------------ loop
    const frame = (now: number) => {
      raf = 0;
      if (destroyed || externalPause) return;
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000) || 0);
      last = now; clock += dt;
      if (dialogue) dialogue.update(dt);
      else if (session && !screen) {
        const events = session.advance(dt);
        for (const event of events) { renderer.onEvent(event, session.sim); audio.handle(event); hud?.onEvent(event); }
        if (session.sim.status !== 'playing' && !ending) { ending = true; endTimer = session.sim.status === 'won' ? 1.6 : 1.3; session.cancel(); commitNight(); }
        if (ending && (endTimer -= dt) <= 0) { ending = false; finishNight(); }
      }
      renderer.update(dt);
      if (hud) { hud.tick(screen ? 0 : dt); hud.update(renderer.layout); }
      const view = session?.view ?? menuView;
      view.time = clock;
      // A drawing bug must not freeze the night (the sim, HUD and menus keep running); it is reported once.
      try { renderer.draw(ctx, view); } catch (error) { if (!drawFailed) { drawFailed = true; console.error('[midnight-kitchen] draw failed', error); } }
      raf = requestAnimationFrame(frame);
    };
    const startLoop = () => { if (!raf && !destroyed && !externalPause) { last = typeof performance !== 'undefined' ? performance.now() : 0; raf = requestAnimationFrame(frame); } };

    Object.defineProperty(root, '__mk', { configurable: true, value: { get session() { return session; }, get save() { return save; }, get renderer() { return renderer; }, get screen() { return screen?.name ?? null; }, get menuMuted() { return menuMuted; }, go: (name: ScreenName, params?: ScreenParams) => go(name, params), levels: LEVEL_LIST.map(level => level.id), defenders: DEFENDERS } });

    layout();
    go('title');
    startLoop();

    return {
      pause() { if (destroyed || externalPause) return; externalPause = true; if (raf) { cancelAnimationFrame(raf); raf = 0; } audio.pause(); },
      resume() { if (destroyed || !externalPause) return; externalPause = false; if (!menuMuted) audio.resume(); startLoop(); },
      restart() {
        if (destroyed) return;
        // The arcade's Restart hides its pause overlay without calling resume(): a restart is also a resume.
        if (externalPause) { externalPause = false; if (!menuMuted) audio.resume(); startLoop(); }
        dialogue?.element.remove(); dialogue = null;
        if (session && ending) commitNight();
        if (night && (session || screen?.name === 'results' || screen?.name === 'pause')) startNight(night.level, night.loadout);
        else go('title');
      },
      destroy() {
        if (destroyed) return;
        if (session && ending) commitNight();
        destroyed = true;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (noticeTimer) clearTimeout(noticeTimer);
        observer?.disconnect();
        window.removeEventListener('resize', layout);
        document.removeEventListener('fullscreenchange', layout);
        root.removeEventListener('keydown', onMenuKey);
        root.removeEventListener('keyup', onMenuKeyUp);
        detachInput();
        audio.dispose();
        session = null; hud = null; dialogue = null; screen = null;
        root.remove();
      }
    };
  }
};

export default midnightKitchen;
