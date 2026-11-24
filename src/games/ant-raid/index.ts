import type { GameController, GameModule, GameServices } from '../../core/game-types';
import { dailyRandom, recordDaily } from '../_shared/daily';
import { createAudio } from './audio';
import { CHAPTERS, ENDLESS_UNLOCK, levelById, LEVEL_LIST, makeEndlessLevel, META_UPGRADES, nextLevelId } from './data';
import { createI18n, defaultLang, type Lang } from './i18n';
import { attachInput } from './input';
import { createRenderer, type ViewState } from './render/renderer';
import { applyOutcome, buyUpgrade, isUnlocked, loadSave, metaOf, resetSave, respec, writeSave, type Save } from './save';
import { createSession, type Session } from './session';
import { starFlags } from './sim';
import { SCENES } from './story';
import type { CasteId, LevelDef } from './types';
import { createDialogue, type Dialogue } from './ui/dialogue';
import { FOCUSABLE, h, nearestInDirection } from './ui/dom';
import { createHud, type Hud } from './ui/hud';
import { SCREENS, type ResultsData, type ScreenName, type ScreenParams, type UiContext } from './ui/screens';
import { STYLES } from './ui/styles';

/** Position in the whole campaign (1..20), which the arcade records as progress. */
export const campaignNumber = (levelId: string): number => LEVEL_LIST.findIndex(level => level.id === levelId) + 1;

/**
 * Crumb Raiders shell: owns the stage, sizing, the frame loop and which screen is in front. Rules in `sim.ts`,
 * interaction in `session.ts`, drawing in `render/`, menus in `ui/`, words in `i18n.ts` / `story.ts` / `data/`.
 * A finished raid is written to the save the moment the sim decides it (before the results beat), so leaving or
 * restarting during the ending cannot lose a win.
 */
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

export const antRaid: GameModule = {
  meta: {
    slug: 'ant-raid', title: 'Crumb Raiders', category: 'puzzle',
    description: 'Command an ant colony on a summer picnic: lay scent trails, hatch the right ants and haul the food home past shoes, spiders and sprinklers before sundown.',
    instructions: 'Drag from the anthill to lay a scent trail to food; tap Workers to hatch them and they carry crumbs home for Sugar. Post cards (Soldier, Digger...) go on a lit cell. Keys: arrows move, Space paints (hold to draw), X cuts trail, 1-6 or Q/E + Enter play cards, T food priority, S Scatter, R Rally, H Recall, F speed, P pause.',
    accent: '#e8574a', mechanic: 'Lay trails, hatch castes, haul the picnic home'
  },
  mount(host: HTMLElement, services: GameServices): GameController {
    const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    let save: Save = loadSave(services.storage);
    const reducedNow = () => services.isReducedMotion || save.settings.reducedFx;
    const root = document.createElement('div');
    root.className = `ar${reducedNow() ? ' reduced' : ''}`;
    root.tabIndex = 0;
    root.setAttribute('data-ant-raid', '');
    root.setAttribute('role', 'application');
    root.setAttribute('aria-label', 'Crumb Raiders');
    const style = document.createElement('style');
    style.textContent = STYLES;
    // The canvas stays the first <canvas> in the stage: the arcade's gamepad bridge sends its keys there.
    const canvas = document.createElement('canvas');
    canvas.className = 'ar-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    root.append(style, canvas);
    host.replaceChildren(root);
    const ctx = canvas.getContext('2d')!;

    const audio = createAudio(services, { music: save.settings.music, sfx: save.settings.sfx });
    let renderer = createRenderer(reducedNow());
    const menuView: ViewState = { sim: null, time: 0, card: null, eraser: false, cursor: null, hover: null, ghost: [] };
    let session: Session | null = null, hud: Hud | null = null, dialogue: Dialogue | null = null;
    let screen: { name: ScreenName; params: ScreenParams; element: HTMLElement } | null = null;
    let raid: { level: LevelDef; loadout: CasteId[] } | null = null;
    let pending: ResultsData | null = null;
    let externalPause = false, destroyed = false, raf = 0, last = 0, clock = 0, endTimer = 0, ending = false;
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
      else if (width < 560) height = clamp(window.innerHeight - 150, 500, width * 2);
      else height = clamp(window.innerHeight - 200, 440, Math.min(760, width * 0.66));
      height = Math.floor(height);
      root.style.setProperty('--ar-h', `${height}px`);
      root.classList.toggle('compact', width < 640 || height < 480);
      root.classList.toggle('narrow', width < 520);
      // Short landscape (a phone on its side): the hand and the Queen calls stand in the side margins, so the
      // yard gets the full height instead of sharing it with a bottom bar.
      root.classList.toggle('side', height < 520 && width > height * 1.6);
      const pr = Math.min(2, window.devicePixelRatio || 1);
      const pw = Math.round(width * pr), ph = Math.round(height * pr);
      if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
      const insets = hud ? hud.insets() : NO_INSETS;
      root.style.setProperty('--ar-bottom', `${insets.bottom + 8}px`);
      root.style.setProperty('--ar-top', `${insets.top + 8}px`);
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
    const closeScreen = (next?: ScreenName) => { if (screen?.name === 'pause' && next !== 'pause' && next !== 'settings') setMenuMute(false); screen?.element.remove(); screen = null; };
    const focusScreen = (element: HTMLElement) => {
      const target = element.querySelector<HTMLElement>('.ar-node.current:not(:disabled)') ?? element.querySelector<HTMLElement>('.ar-btn.primary:not(:disabled)') ?? element.querySelector<HTMLElement>(FOCUSABLE);
      (target ?? root).focus({ preventScroll: true });
    };
    const keepsRaid = (name: ScreenName, params: ScreenParams) => name === 'pause' || name === 'results' || (name === 'settings' && params.from === 'pause');
    function go(name: ScreenName, params: ScreenParams = {}): void {
      if (destroyed) return;
      const scroll = screen && screen.name === name ? screen.element.scrollTop : 0;
      closeScreen(name);
      if (!keepsRaid(name, params) && session) endRaid();
      const element = SCREENS[name](ui, params);
      screen = { name, params, element };
      root.insertBefore(element, notice);
      element.scrollTop = scroll;
      setState(name);
      if (name === 'pause') setMenuMute(true);
      if (!keepsRaid(name, params)) audio.music('menu');
      focusScreen(element);
    }
    const playScene = (sceneId: string | undefined, then: () => void, onlyFirst = true) => {
      const scene = sceneId ? SCENES[sceneId] : undefined;
      if (!scene || (onlyFirst && save.scenes.includes(scene.id))) { then(); return; }
      closeScreen();
      audio.music('story');
      dialogue = createDialogue({ i18n: ui.i18n, audio, reduced: reducedNow() }, scene, () => {
        dialogue?.element.remove(); dialogue = null;
        if (!save.scenes.includes(scene.id)) { save.scenes.push(scene.id); persist(); }
        then();
      });
      root.insertBefore(dialogue.element, notice); setState('dialogue'); root.focus({ preventScroll: true });
    };

    // ------------------------------------------------------------ a raid
    const coachStore = {
      seen: (id: string) => save.coach.seen.includes(id),
      see: (id: string) => { if (!save.coach.seen.includes(id)) { save.coach.seen.push(id); persist(); } },
      off: () => save.coach.off,
      skipAll: () => { save.coach.off = true; persist(); }
    };
    const tutorialFrom = (level: LevelDef) => {
      const steps = level.tutorial?.length ?? 0;
      if (save.levels[level.id]?.win || save.coach.off) return steps;
      let i = 0;
      while (i < steps && save.coach.seen.includes(`${level.id}:${i}`)) i++;
      return i;
    };
    function endRaid(): void {
      hud?.element.remove(); hud = null; session = null; ending = false; endTimer = 0; pending = null;
      renderer.reset();
      layout();
    }
    function startRaid(level: LevelDef, loadout: CasteId[]): void {
      if (destroyed) return;
      closeScreen();
      if (session) endRaid();
      if (!level.cards && !level.endless) { save.loadout = [...loadout]; persist(); }
      raid = { level, loadout: [...loadout] };
      const mercy = level.boss ? Math.min(2, save.levels[level.id]?.fails ?? 0) : 0;
      const random = level.endless?.daily ? dailyRandom('ant-raid-sim') : services.random;
      session = createSession(level, {
        random, loadout, meta: level.endless?.daily ? undefined : metaOf(save), mercy, speed: save.speed, tutorialFrom: tutorialFrom(level),
        onDeny: reason => { hud?.deny(reason); audio.sfx('deny'); },
        onTutorial: index => { for (let i = 0; i < index; i++) coachStore.see(`${level.id}:${i}`); }
      });
      hud = createHud({ i18n: ui.i18n, audio, touch, coach: coachStore }, session, { pause: pauseGame, toggleSpeed });
      root.insertBefore(hud.element, canvas.nextSibling);
      renderer.reset();
      layout();
      // HUD sizes are only known after insertion; lay out once more next frame.
      requestAnimationFrame?.(() => layout());
      audio.music(level.music ?? (level.night ? 'night' : level.endless ? 'endless' : 'level'));
      setState('level');
      root.focus({ preventScroll: true });
    }
    function commitRaid(): void {
      if (!session || pending) return;
      const sim = session.sim, level = session.level, flags = starFlags(sim);
      if (level.endless) {
        const daily = !!level.endless.daily;
        save.endless.runs++;
        if (!daily) save.endless.best = Math.max(save.endless.best, sim.crumbs);
        persist();
        const record = daily ? recordDaily(services.storage, sim.crumbs, 'daily') : null;
        if (!daily) services.reportScore(sim.crumbs);
        pending = { level, won: false, flags, reward: { crystals: 0, unlocked: [] }, time: sim.time, crumbs: sim.crumbs, lost: sim.stats.lost, nextLevel: null, chapterOpened: null, endlessOpened: false, colonySpent: false, mercy: false,
          best: daily ? record!.scores[Object.keys(record!.scores).sort().pop()!] : save.endless.best, streak: record?.streak };
        return;
      }
      const hadEndless = !!save.levels[ENDLESS_UNLOCK]?.win;
      const openChapters = new Set(CHAPTERS.filter(ch => ch.levels[0] && isUnlocked(save, ch.levels[0])).map(ch => ch.id));
      const reward = applyOutcome(save, level, { won: flags.win, bonus: flags.bonus, par: flags.par, time: sim.time });
      if (flags.win && level.tutorial) for (let i = 0; i < level.tutorial.length; i++) if (!save.coach.seen.includes(`${level.id}:${i}`)) save.coach.seen.push(`${level.id}:${i}`);
      persist();
      if (flags.win) services.reportComplete(campaignNumber(level.id));
      const opened = CHAPTERS.find(ch => ch.levels[0] && !openChapters.has(ch.id) && isUnlocked(save, ch.levels[0]) && levelById(ch.levels[0]));
      pending = {
        level, won: flags.win, flags, reward, time: sim.time, crumbs: sim.crumbs, lost: sim.stats.lost,
        nextLevel: flags.win ? nextLevelId(level.id) ?? null : null, chapterOpened: opened?.id ?? null,
        endlessOpened: !hadEndless && !!save.levels[ENDLESS_UNLOCK]?.win, colonySpent: !flags.win && sim.time < sim.sundown - 0.1, mercy: !!level.boss && (save.levels[level.id]?.fails ?? 0) <= 2
      };
    }
    function finishRaid(): void {
      if (!session) return;
      commitRaid();
      const results = pending!;
      hud?.element.remove(); hud = null;
      if (results.reward.unlocked.length) audio.sfx('unlock');
      audio.music('menu');
      go('results', { results });
    }
    function pauseGame(): void {
      if (!session || session.sim.status !== 'playing' || screen || dialogue) return;
      audio.sfx('ui');
      go('pause', { level: session.level.id });
    }
    function toggleSpeed(): void {
      if (!session) return;
      session.speed = session.speed === 1 ? 2 : 1;
      save.speed = session.speed; persist();
      audio.sfx('ui');
    }
    const resumeRaid = () => { if (screen?.name === 'pause' || screen?.name === 'settings') { closeScreen(); setMenuMute(false); setState('level'); root.focus({ preventScroll: true }); } };

    const ui: UiContext = {
      i18n: createI18n(save.lang ?? defaultLang()), save, audio, reduced: reducedNow(), storage: services.storage,
      go: (name, params) => { audio.sfx('ui'); go(name, params); },
      openLevel(id) {
        const level = levelById(id);
        if (!level) return;
        audio.sfx('ui');
        const chapter = CHAPTERS.find(ch => ch.levels[0] === id);
        const intro = chapter && !level.intro ? `c${chapter.id}-intro` : level.intro;
        const direct = !!level.cards && !save.levels[id]?.win;
        const launch = () => (direct ? startRaid(level, level.cards!) : go('loadout', { level: id }));
        // Chapter openers play their chapter intro, then (for bosses) the boss intro.
        const chapterIntro = chapter ? `c${chapter.id}-intro` : undefined;
        if (chapterIntro && chapterIntro !== intro) playScene(chapterIntro, () => playScene(intro, launch)); else playScene(intro, launch);
      },
      startRaid(id, loadout) { const level = levelById(id); if (level) { audio.sfx('ui'); startRaid(level, loadout); } },
      startEndless(daily) {
        audio.sfx('ui');
        const level = makeEndlessLevel(daily ? dailyRandom('ant-raid') : services.random, daily);
        startRaid(level, daily ? level.cards! : save.loadout);
      },
      afterResults(choice) {
        audio.sfx('ui');
        const results = pending ?? (screen?.params.results ?? null);
        const proceed = () => {
          if (choice === 'retry' && raid) { if (raid.level.endless) ui.startEndless(!!raid.level.endless.daily); else startRaid(raid.level, raid.loadout); }
          else if (choice === 'next' && results?.nextLevel) { endRaid(); ui.openLevel(results.nextLevel); }
          else if (choice === 'endless') { endRaid(); ui.startEndless(false); }
          else if (results?.level.endless) go('title');
          else go('map', { chapter: results?.chapterOpened ?? results?.level.chapter });
        };
        if (results?.won && choice !== 'retry' && results.level.outro) playScene(results.level.outro, proceed); else proceed();
      },
      resume() { resumeRaid(); audio.sfx('ui'); },
      restart() { if (raid) { if (raid.level.endless) ui.startEndless(!!raid.level.endless.daily); else startRaid(raid.level, raid.loadout); } },
      quit() { const level = session?.level; go(level?.endless ? 'title' : 'map', { chapter: level?.chapter || undefined }); },
      setLang(lang: Lang) {
        save.lang = lang; persist();
        ui.i18n = createI18n(lang);
        audio.sfx('ui');
        if (session && hud) { hud.element.remove(); hud = createHud({ i18n: ui.i18n, audio, touch, coach: coachStore }, session, { pause: pauseGame, toggleSpeed }); root.insertBefore(hud.element, canvas.nextSibling); layout(); }
        if (screen) go(screen.name, screen.params);
      },
      setSetting(key, value) {
        save.settings[key] = value as never;
        persist();
        if (key === 'music' || key === 'sfx') { audio.setVolumes({ [key]: value as number }); if (key === 'sfx') audio.sfx('select'); }
        if (key === 'reducedFx') { const reduced = reducedNow(); ui.reduced = reduced; root.classList.toggle('reduced', reduced); renderer = createRenderer(reduced); layout(); }
      },
      setTips(on) { save.coach.off = !on; if (on) save.coach.seen = []; persist(); },
      buy(id) { const upgrade = META_UPGRADES.find(u => u.id === id); if (!upgrade || !buyUpgrade(save, upgrade)) { audio.sfx('deny'); return false; } persist(); audio.sfx('unlock'); return true; },
      respec() { const back = respec(save); persist(); audio.sfx('ui'); if (back) showNotice(ui.i18n.t('shop.respecDone', { n: back })); return back; },
      resetProgress() { save = resetSave(services.storage, save); ui.save = save; persist(); go('title'); showNotice(ui.i18n.t('settings.resetDone')); },
      replayScene(id, then, params) { audio.sfx('ui'); playScene(id, () => go(then, params ?? {}), false); }
    };

    // ------------------------------------------------------------ input
    const detachInput = attachInput({
      root, canvas, session: () => session, layout: () => renderer.layout,
      blocked: () => externalPause || !!screen || !!dialogue || ending,
      pause: pauseGame, toggleSpeed
    });
    const moveFocus = (container: HTMLElement, dx: number, dy: number) => {
      const items = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => !el.closest('[hidden]'));
      if (!items.length) return;
      const current = document.activeElement as HTMLElement | null;
      if (!current || !items.includes(current)) { items[0].focus(); return; }
      const others = items.filter(el => el !== current);
      let best: HTMLElement | null = others[nearestInDirection(current.getBoundingClientRect(), others.map(el => el.getBoundingClientRect()), dx, dy)] ?? null;
      if (!best) { const index = items.indexOf(current), stepDir = dx + dy > 0 ? 1 : -1; best = items[(index + stepDir + items.length) % items.length]; }
      best.focus();
      best.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    };
    const onMenuKey = (event: KeyboardEvent) => {
      if (externalPause || event.ctrlKey || event.metaKey || event.altKey) return;
      if (dialogue) {
        const onButton = (document.activeElement as HTMLElement | null)?.closest?.('.ar-dialogue button');
        if ((event.key === ' ' || event.key === 'Enter') && !onButton) { event.preventDefault(); if (!event.repeat) dialogue.advance(); }
        else if ((event.key === ' ' || event.key === 'Enter') && onButton) { event.preventDefault(); if (!event.repeat) (onButton as HTMLElement).click(); }
        else if (event.key === 'Escape' || event.key === 'x') { event.preventDefault(); event.stopPropagation(); dialogue.back(); }
        return;
      }
      if (!screen) return;
      const container = screen.element;
      if (event.key === 'Escape' || event.key === 'x' || ((event.key === 'p' || event.key === 'P') && screen.name === 'pause')) {
        const backBtn = container.querySelector<HTMLElement>('[data-action=back]');
        if (screen.name === 'pause') ui.resume();
        else if (backBtn && screen.name !== 'results') backBtn.click();
        else return;
        event.preventDefault(); event.stopPropagation();
        return;
      }
      const active = document.activeElement as HTMLElement | null, inside = !!active && container.contains(active);
      const dir = event.key === 'ArrowDown' ? [0, 1] : event.key === 'ArrowUp' ? [0, -1] : event.key === 'ArrowRight' ? [1, 0] : event.key === 'ArrowLeft' ? [-1, 0] : null;
      if (!inside && (dir || event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault(); focusScreen(container);
        const target = document.activeElement as HTMLElement | null;
        if (!dir && !event.repeat && target && container.contains(target) && target.matches('.ar-btn.primary, .ar-node.current')) target.click();
        return;
      }
      if (active instanceof HTMLInputElement && active.type === 'range' && dir && dir[0] !== 0) {
        event.preventDefault();
        const value = clamp(Number(active.value) + dir[0] * 10, 0, 100);
        active.value = String(value); active.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      if (dir) { event.preventDefault(); moveFocus(container, dir[0], dir[1]); return; }
      if ((event.key === ' ' || event.key === 'Enter') && inside && active && active.matches('button, [role=switch]')) { event.preventDefault(); if (!event.repeat) active.click(); }
    };
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
        const sim = session.sim;
        audio.setColony(sim.ants.length, sim.level.alarm ? sim.alarm / 100 : 0);
        if (sim.status !== 'playing' && !ending) { ending = true; endTimer = sim.status === 'won' ? 1.8 : 1.4; commitRaid(); }
        if (ending && (endTimer -= dt) <= 0) { ending = false; finishRaid(); }
      }
      renderer.update(dt);
      if (hud && session) hud.tick(screen ? 0 : dt);
      const view = session?.view ?? menuView;
      view.time = clock;
      try { renderer.draw(ctx, view); } catch (error) { if (!drawFailed) { drawFailed = true; console.error('[ant-raid] draw failed', error); } }
      raf = requestAnimationFrame(frame);
    };
    const startLoop = () => { if (!raf && !destroyed && !externalPause) { last = typeof performance !== 'undefined' ? performance.now() : 0; raf = requestAnimationFrame(frame); } };

    Object.defineProperty(root, '__ar', { configurable: true, value: {
      get session() { return session; }, get save() { return save; }, get screen() { return screen?.name ?? null; }, get renderer() { return renderer; },
      go: (name: ScreenName, params?: ScreenParams) => go(name, params), start: (id: string, loadout?: CasteId[]) => { const level = levelById(id); if (level) startRaid(level, loadout ?? level.cards ?? save.loadout); },
      endless: (daily: boolean) => ui.startEndless(daily), persist, levels: LEVEL_LIST.map(level => level.id)
    } });

    layout();
    go('title');
    startLoop();

    return {
      pause() { if (destroyed || externalPause) return; externalPause = true; if (raf) { cancelAnimationFrame(raf); raf = 0; } audio.pause(); },
      resume() { if (destroyed || !externalPause) return; externalPause = false; if (!menuMuted) audio.resume(); startLoop(); },
      restart() {
        if (destroyed) return;
        if (externalPause) { externalPause = false; if (!menuMuted) audio.resume(); startLoop(); }
        dialogue?.element.remove(); dialogue = null;
        if (session && ending) commitRaid();
        if (raid && (session || screen?.name === 'results' || screen?.name === 'pause')) ui.restart();
        else go('title');
      },
      destroy() {
        if (destroyed) return;
        if (session && ending) commitRaid();
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

export default antRaid;
