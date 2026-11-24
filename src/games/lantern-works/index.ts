import type { GameController, GameModule, GameServices } from '../../core/game-types';
import { dailyKey, dailySeed, dailyShareText, readDaily, recordDaily } from '../_shared/daily';
import { createAudio } from './audio';
import { CHAPTERS, LEVELS, NIGHT_LEVEL, levelById, nextLevelId } from './data/levels';
import { createI18n, defaultLang, type Key, type Lang } from './i18n';
import { DIAL_NAMES, PARTS, PART_ORDER, dialOptions } from './parts';
import { createRenderer, type Tool, type ViewState } from './render/renderer';
import { isUnlocked, loadSave, nightUnlocked, recordWin, totalStars, writeSave, type Save } from './save';
import { DX, DY, T, applyEdit, buildOf, createSim, loadBuild, partAt, partsUsed, resetRun, run, starsOf, step, trayLeft, type Sim } from './sim';
import type { Dir, Edit, LevelDef, Part, PartKind, SimEvent } from './types';
import { dialIcon, goodIcon, partIcon } from './ui/icons';
import { STYLES } from './ui/styles';

/**
 * Lantern Works shell: stage, sizing, frame loop, HUD, menus and input. Rules live in `sim.ts` (pure and
 * deterministic), drawing in `render/`, words in `i18n.ts` and the level data, sound in `audio.ts`.
 * Every build change goes through `applyEdit`, the same reducer the stored solutions are replayed with.
 */
type Pos = { x: number; y: number };
type Mode = 'campaign' | 'night' | 'daily';
type Play = {
  level: LevelDef; mode: Mode; sim: Sim;
  running: boolean; acc: number;
  undo: Part[][];
  tool: Tool; selected: Pos | null; cursor: Pos | null; hover: Pos | null;
  winShown: boolean; endShown: boolean;
  drawFrom: Pos | null;
  daily?: string;
  freshStars?: boolean[];
};

const BEAT = 0.34;
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> | null = null, ...children: (Node | string | null | undefined | false)[]) => {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'disabled' || k === 'hidden') (el as unknown as Record<string, unknown>)[k] = !!v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  if (tag === 'button') el.setAttribute('type', 'button');
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
};
const img = (src: string, alt = '') => h('img', { src, alt, draggable: 'false' });
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const campaignNumber = (id: string) => LEVELS.findIndex(l => l.id === id) + 1;

export const lanternWorks: GameModule = {
  meta: {
    slug: 'lantern-works', title: 'Lantern Works', category: 'puzzle',
    description: 'Lay belts, fold, dye and light: build a little workshop that fills every festival order.',
    instructions: 'Pick a part from the tray and tap the floor to place it; drag to draw belts. Tap a machine to rotate it or change its setting. Press Run and watch: every machine plays a note on the beat. Keys: arrows, 1-9, Space, R, T, X, Z, Enter, F.',
    accent: '#ffb347', mechanic: 'Build conveyor factories that fill orders'
  },
  mount(host: HTMLElement, services: GameServices): GameController {
    let save: Save = loadSave(services.storage);
    let i18n = createI18n(save.lang ?? defaultLang());
    const reducedNow = () => services.isReducedMotion || save.settings.reduced;
    const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

    const root = h('div', { class: `lw${reducedNow() ? ' reduced' : ''}`, tabindex: '0', role: 'application', 'aria-label': 'Lantern Works', 'data-lantern-works': '' });
    const style = h('style'); style.textContent = STYLES;
    // The canvas stays the first <canvas> in the stage: the arcade's gamepad bridge sends its keys there.
    const canvas = h('canvas', { class: 'lw-canvas', 'aria-hidden': 'true' });
    root.append(style, canvas);
    host.replaceChildren(root);
    const ctx = canvas.getContext('2d');

    const audio = createAudio(services, { sfx: save.settings.sfx, music: save.settings.music });
    let renderer = createRenderer(reducedNow());
    let play: Play | null = null;
    let screen: HTMLElement | null = null, screenName = '';
    let card: HTMLElement | null = null;
    let hud: ReturnType<typeof buildHud> | null = null;
    let pop: HTMLElement | null = null;
    let externalPause = false, destroyed = false, raf = 0, last = 0, clock = 0, storageWarned = false, drawFailed = false;
    const toast = h('div', { class: 'lw-toast', role: 'status' }); toast.style.opacity = '0';
    let toastTimer: ReturnType<typeof setTimeout> | null = null;
    root.append(toast);
    const say = (text: string, ms = 1600) => {
      toast.textContent = text; toast.style.opacity = '1';
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, ms);
    };
    const persist = () => {
      const ok = writeSave(services.storage, save);
      if (!ok && !storageWarned) { storageWarned = true; const n = h('div', { class: 'lw-notice', role: 'status', text: i18n.t('common.storage') }); root.append(n); setTimeout(() => n.remove(), 6000); }
    };
    const t = (k: Key, v?: Record<string, string | number>) => i18n.t(k, v);

    // ------------------------------------------------------------ sizing
    const layout = () => {
      if (destroyed) return;
      const immersive = host.classList.contains('is-immersive') || (typeof document !== 'undefined' && document.fullscreenElement === host);
      root.classList.toggle('is-immersive', immersive);
      const css = getComputedStyle(host), pad = (a: string, b: string) => (parseFloat(a) || 0) + (parseFloat(b) || 0);
      const hw = host.clientWidth - pad(css.paddingLeft, css.paddingRight);
      const width = hw > 40 ? hw : 360;
      let height: number;
      if (immersive && host.clientHeight > 0) height = host.clientHeight - pad(css.paddingTop, css.paddingBottom);
      else if (width < 560) height = clamp(window.innerHeight - 140, 500, width * 1.9);
      else height = clamp(window.innerHeight - 190, 460, Math.min(760, width * 0.72));
      height = Math.floor(height);
      root.style.setProperty('--lw-h', `${height}px`);
      root.classList.toggle('compact', width < 420 || height < 520);
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const pw = Math.round(width * ratio), ph = Math.round(height * ratio);
      if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
      const top = hud ? hud.top.offsetHeight : 0, bottom = hud ? hud.bottom.offsetHeight : 0;
      renderer.resize(width, height, ratio, { top: top + 4, bottom: bottom + 2, left: 6, right: 6 }, play?.sim ?? null);
      placePop();
    };
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(layout);
    observer?.observe(host);
    window.addEventListener('resize', layout);

    // ------------------------------------------------------------ screens
    const closeScreen = () => { screen?.remove(); screen = null; screenName = ''; };
    const showScreen = (name: string, el: HTMLElement) => {
      closeScreen(); closeCard();
      screen = el; screenName = name;
      root.insertBefore(el, toast);
      root.dataset.state = name;
      (el.querySelector<HTMLElement>('.lw-btn.primary:not(:disabled), .lw-node.current, .lw-btn:not(:disabled)') ?? root).focus({ preventScroll: true });
    };
    const lanternRow = () => h('div', { class: 'lanterns', 'aria-hidden': 'true' }, img(goodIcon('lantern round red lit')), img(goodIcon('lantern lotus yellow lit')), img(goodIcon('lantern square orange lit')));

    function titleScreen() {
      leaveLevel();
      const stars = totalStars(save), total = LEVELS.length * 3;
      const next = LEVELS.find(l => isUnlocked(save, l.id) && !save.levels[l.id]?.stars[0]);
      const nightOk = nightUnlocked(save);
      const daily = readDaily(services.storage);
      const el = h('div', { class: 'lw-screen' },
        h('div', { class: 'lw-hero' }, lanternRow(), h('h1', { text: t('title.name') }), h('p', { text: t('title.tag') })),
        h('div', { class: 'lw-menu' },
          h('button', { class: 'lw-btn primary', onclick: () => { audio.unlock(); audio.ui(); if (next && stars > 0) openLevel(next.id); else if (stars === 0) openLevel(LEVELS[0].id); else mapScreen(); } },
            stars > 0 && next ? `${t('title.continue')} · ${next.id} ${i18n.tr(next.name)}` : stars > 0 ? t('title.campaign') : `${t('title.start')} · ${i18n.tr(LEVELS[0].name)}`),
          h('button', { class: 'lw-btn', onclick: () => { audio.unlock(); audio.ui(); mapScreen(); } }, `${t('title.campaign')} · `, h('small', { text: t('title.stars', { n: stars, total }) })),
          h('button', { class: 'lw-btn', disabled: !nightOk, onclick: () => { audio.unlock(); audio.ui(); openNight('night'); } }, t('title.night'), ' ', h('small', { text: nightOk ? t('night.best', { n: save.night.best }) : t('title.nightLocked') })),
          h('button', { class: 'lw-btn', disabled: !nightOk, onclick: () => { audio.unlock(); audio.ui(); openNight('daily'); } }, t('title.daily'), ' ', h('small', { text: nightOk ? (daily.streak ? t('daily.streak', { n: daily.streak }) : dailyKey()) : t('title.nightLocked') })),
          h('button', { class: 'lw-btn ghost', onclick: () => { audio.unlock(); audio.ui(); settingsScreen(); } }, t('title.settings')),
          h('button', { class: 'lw-btn ghost', onclick: () => setLang(i18n.lang === 'zh' ? 'en' : 'zh') }, i18n.lang === 'zh' ? 'English' : '中文')
        ),
        touch ? null : h('p', { class: 'lw-keys', text: t('keys') })
      );
      showScreen('title', el);
    }

    function mapScreen(focus?: string) {
      leaveLevel();
      const el = h('div', { class: 'lw-screen' },
        h('header', null, h('button', { class: 'lw-btn ghost', 'data-action': 'back', onclick: () => { audio.ui(); titleScreen(); } }, '‹ ', t('common.back')), h('h2', { text: t('title.campaign') }), h('span', { class: 'lw-chip', text: `★ ${totalStars(save)}/${LEVELS.length * 3}` })),
        ...CHAPTERS.map(ch => h('section', { class: 'lw-chapter' },
          h('h3', { text: `${t('map.chapter', { n: ch.id })} · ${i18n.tr(ch.name)}` }), h('p', { text: i18n.tr(ch.blurb) }),
          h('div', { class: 'lw-nodes' }, ...ch.levels.map(id => {
            const lv = levelById(id)!, rec = save.levels[id], open = isUnlocked(save, id);
            const current = open && !rec?.stars[0];
            return h('button', { class: `lw-node${lv.rush ? ' rush' : ''}${(focus ? focus === id : current) ? ' current' : ''}`, disabled: !open, 'aria-label': `${id} ${i18n.tr(lv.name)}`, onclick: () => { audio.ui(); openLevel(id); } },
              h('span', { class: 'id', text: id }), h('span', { class: 'nm', text: i18n.tr(lv.name) }),
              h('span', { class: 'st' }, ...[0, 1, 2].map(k => h('span', { class: rec?.stars[k] ? 'on' : '', text: '★' }))));
          }))))
      );
      showScreen('map', el);
      el.querySelector<HTMLElement>('.lw-node.current')?.focus({ preventScroll: true });
      el.querySelector<HTMLElement>('.lw-node.current')?.scrollIntoView?.({ block: 'nearest' });
    }

    function settingsScreen() {
      const s = save.settings;
      const toggle = (label: string, on: boolean, set: (v: boolean) => void) => h('div', { class: 'lw-set' }, h('span', { text: label }),
        h('button', { class: `lw-btn${on ? ' on' : ''}`, role: 'switch', 'aria-checked': String(on), onclick: () => { set(!on); persist(); settingsScreen(); } }, on ? t('common.on') : t('common.off')));
      const slider = (label: string, value: number, set: (v: number) => void) => {
        const input = h('input', { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(value * 100)), 'aria-label': label }) as HTMLInputElement;
        input.addEventListener('input', () => { set(Number(input.value) / 100); persist(); });
        return h('div', { class: 'lw-set' }, h('span', { text: label }), input);
      };
      const el = h('div', { class: 'lw-screen' },
        h('header', null, h('button', { class: 'lw-btn ghost', 'data-action': 'back', onclick: () => { audio.ui(); titleScreen(); } }, '‹ ', t('common.back')), h('h2', { text: t('settings.title') })),
        h('div', { class: 'lw-set' }, h('span', { text: t('settings.lang') }), h('button', { class: 'lw-btn', onclick: () => { setLang(i18n.lang === 'zh' ? 'en' : 'zh'); settingsScreen(); } }, i18n.lang === 'zh' ? '中文' : 'English')),
        slider(t('settings.sound'), s.sfx, v => { s.sfx = v; audio.setVolumes({ sfx: v }); audio.ui('place'); }),
        slider(t('settings.music'), s.music, v => { s.music = v; audio.setVolumes({ music: v }); }),
        toggle(t('settings.glyphs'), s.glyphs, v => { s.glyphs = v; }),
        toggle(t('settings.reduced'), s.reduced, v => { s.reduced = v; root.classList.toggle('reduced', reducedNow()); renderer = createRenderer(reducedNow()); layout(); }),
        h('div', { class: 'lw-set' }, h('span', { text: t('settings.reset') }), h('button', { class: 'lw-btn', onclick: () => {
          if (typeof confirm === 'function' && !confirm(t('settings.resetConfirm'))) return;
          const lang = save.lang, settings = save.settings;
          save = loadSave({ get: <T>(_k: string, d: T) => d, set() {}, remove() {} }); save.lang = lang; save.settings = settings; persist(); say(t('settings.resetDone')); titleScreen();
        } }, t('settings.reset')))
      );
      showScreen('settings', el);
    }

    function setLang(lang: Lang) {
      save.lang = lang; persist(); i18n = createI18n(lang); audio.ui();
      if (play) { rebuildHud(); }
      if (screenName === 'title') titleScreen(); else if (screenName === 'map') mapScreen();
    }

    // ------------------------------------------------------------ cards (intro, win, spoiled, shift over)
    function closeCard() { card?.remove(); card = null; }
    function showCard(el: HTMLElement) {
      closeCard();
      card = h('div', { class: 'lw-card-wrap', onpointerdown: (e: Event) => { if (e.target === card) { const b = card!.querySelector<HTMLElement>('[data-dismiss]'); b?.click(); } } }, el);
      root.insertBefore(card, toast);
      (card.querySelector<HTMLElement>('.lw-btn.primary') ?? card.querySelector<HTMLElement>('.lw-btn'))?.focus({ preventScroll: true });
    }
    const orderChips = (level: LevelDef) => h('div', { class: 'lw-want' }, ...level.stalls.flatMap((st, si) => st.wants.map((w, wi) => h('span', { class: 'lw-order' },
      level.stalls.length > 1 ? h('span', { class: 'stall', text: String.fromCharCode(65 + si) }) : null,
      wi > 0 && st.sequential ? h('span', { class: 'stall', text: t('hud.then') }) : null,
      img(goodIcon(w.good)), `×${w.n}`))));

    function introCard(level: LevelDef) {
      const intro = level.introduces && level.introduces !== 'belt' ? level.introduces : null;
      const recipe = intro ? partRecipe(intro) : null;
      showCard(h('div', { class: 'lw-card', role: 'dialog', 'aria-label': i18n.tr(level.name) },
        h('h2', null, h('small', { text: level.endless ? t(play?.mode === 'daily' ? 'daily.title' : 'night.title') : `${t('card.intro', { id: level.id })}${level.rush ? ` · ${t('map.rush')}` : ''}` }), i18n.tr(level.name)),
        intro && recipe ? h('div', null, h('p', { text: `${t('hud.new')}: ${i18n.tr(PARTS[intro].name)}` }), recipe) : null,
        level.endless ? h('p', { text: t(play?.mode === 'daily' ? 'daily.sub' : 'night.sub') }) : orderChips(level),
        h('p', { text: i18n.tr(level.hint) }),
        h('div', { class: 'row' }, h('button', { class: 'lw-btn primary', 'data-dismiss': '', onclick: () => { audio.unlock(); audio.ui(); closeCard(); root.focus({ preventScroll: true }); } }, t('card.start')))
      ));
    }
    /** Show, don't tell: what goes in and what comes out of the new part. */
    function partRecipe(kind: PartKind): HTMLElement {
      const R: Partial<Record<PartKind, [string[], string]>> = {
        folder: [['paper'], 'shell round'], vat: [['shell round', 'dye red'], 'shell round red'], joiner: [['shell round', 'hoop'], 'lantern round'],
        splitter: [['shell round'], 'shell round'], mixer: [['dye red', 'dye yellow'], 'dye orange'], sorter: [['shell lotus'], 'shell lotus'], bin: [['shell square'], ''],
        bridge: [['hoop'], 'hoop'], wick: [['lantern round red', 'candle'], 'lantern round red lit'], gate: [['shell round'], 'shell round'], stamp: [['shell round red'], 'shell round red fu'], bundler: [['lantern red lit', 'lantern orange lit', 'lantern yellow lit'], 'string red orange yellow']
      };
      const [ins, out] = R[kind] ?? [[], ''];
      return h('div', { class: 'lw-recipe' }, ...ins.flatMap((c, i) => [i ? '+' : null, img(goodIcon(c))]), '→', h('span', { class: 'part' }, img(partIcon(kind))), out ? '→' : null, out ? img(goodIcon(out)) : null);
    }

    function winCard() {
      if (!play) return;
      const { sim, level } = play, stars = starsOf(sim), rec = save.levels[level.id];
      const fresh = play.freshStars ?? [false, false, false];
      const next = nextLevelId(level.id), chapterEnd = level.index === 5, final = level.id === '4-5';
      const star = (on: boolean, isNew: boolean, label: string) => h('div', { class: `lw-star${on ? ' on' : ''}${isNew ? ' new' : ''}` }, h('i', { text: '★' }), h('span', { text: label }));
      showCard(h('div', { class: 'lw-card', role: 'dialog' },
        h('h2', null, h('small', { text: `${level.id} · ${i18n.tr(level.name)}` }), t('win.title')),
        h('p', { text: final ? t('win.final') : chapterEnd ? t('win.chapter') : t('win.sub') }),
        h('div', { class: 'lw-stars' },
          star(stars.delivered, fresh[0], t('win.delivered')),
          star(stars.tidy, fresh[1], t('win.tidy', { n: sim.maxParts, par: level.parTidy })),
          star(stars.swift, fresh[2], t('win.swift', { n: sim.wonAt ?? 0, par: level.parSwift }))),
        rec && rec.bestParts !== null ? h('p', { text: t('win.best', { parts: rec.bestParts, beats: rec.bestBeats ?? 0 }) }) : null,
        h('div', { class: 'row' },
          next && !final ? h('button', { class: 'lw-btn primary', onclick: () => { audio.ui(); openLevel(next); } }, t('win.next')) : h('button', { class: 'lw-btn primary', onclick: () => { audio.ui(); mapScreen(level.id); } }, t('win.map')),
          h('button', { class: 'lw-btn', 'data-dismiss': '', onclick: () => { audio.ui(); closeCard(); root.focus({ preventScroll: true }); } }, t('win.stay')),
          next && !final ? h('button', { class: 'lw-btn ghost', onclick: () => { audio.ui(); mapScreen(level.id); } }, t('win.map')) : null)
      ));
    }
    function spoilCard() {
      showCard(h('div', { class: 'lw-card', role: 'dialog' },
        h('h2', { text: t('spoil.title') }), h('p', { text: t('spoil.sub') }),
        h('div', { class: 'row' }, h('button', { class: 'lw-btn primary', 'data-dismiss': '', onclick: () => { audio.ui(); doReset(); closeCard(); root.focus({ preventScroll: true }); } }, t('spoil.reset')))));
    }
    function shiftCard(score: number, served: number, newBest: boolean) {
      if (!play) return;
      const daily = play.mode === 'daily';
      const rec = daily ? readDaily(services.storage) : null;
      const share = daily ? dailyShareText(i18n.lang === 'zh' ? '灯笼工坊' : 'Lantern Works', score, rec?.streak ?? 1, play.daily, i18n.lang === 'zh') : '';
      showCard(h('div', { class: 'lw-card', role: 'dialog' },
        h('h2', null, h('small', { text: daily ? `${t('daily.title')} · ${play.daily}` : t('night.title') }), t('night.over')),
        h('p', { text: `${t('night.score', { n: score })} · ${t('night.served', { n: served })}` }),
        h('p', { text: newBest ? t('night.newBest') : t('night.best', { n: save.night.best }) }),
        daily && rec ? h('p', { text: t('daily.streak', { n: rec.streak }) }) : null,
        h('div', { class: 'row' },
          h('button', { class: 'lw-btn primary', onclick: () => { audio.ui(); openNight(play!.mode as 'night' | 'daily'); } }, t('night.again')),
          daily ? h('button', { class: 'lw-btn brass', onclick: (e: Event) => { void navigator.clipboard?.writeText(share).then(() => { (e.target as HTMLElement).textContent = t('daily.copied'); }).catch(() => say(share, 4000)); } }, t('daily.share')) : null,
          h('button', { class: 'lw-btn ghost', onclick: () => { audio.ui(); titleScreen(); } }, t('common.back')))));
    }

    // ------------------------------------------------------------ a level
    function newPlay(level: LevelDef, mode: Mode, seed = 1, build?: Part[]): Play {
      const sim = createSim(level, seed);
      if (build) loadBuild(sim, build);
      return { level, mode, sim, running: false, acc: 0, undo: [], tool: 'belt', selected: null, cursor: null, hover: null, winShown: false, endShown: false, drawFrom: null };
    }
    function enterLevel(p: Play) {
      closeScreen(); closeCard(); closePop();
      play = p;
      renderer.reset();
      rebuildHud();
      root.dataset.state = 'level';
      audio.hum(true);
      introCard(p.level);
    }
    function openLevel(id: string) {
      const level = levelById(id);
      if (!level || !isUnlocked(save, id)) return;
      enterLevel(newPlay(level, 'campaign', 1, save.levels[id]?.build));
    }
    function nightLevel(): LevelDef {
      const unlocked = new Set<PartKind>(['belt']);
      for (const l of LEVELS) if (save.levels[l.id]?.stars[0] && l.introduces) unlocked.add(l.introduces);
      for (const l of LEVELS) if (save.levels[l.id]?.stars[0]) for (const k of Object.keys(l.tray) as PartKind[]) unlocked.add(k);
      const tray: LevelDef['tray'] = {};
      for (const [k, n] of Object.entries(NIGHT_LEVEL.tray) as [PartKind, number][]) if (unlocked.has(k)) tray[k] = n;
      return { ...NIGHT_LEVEL, tray };
    }
    function openNight(mode: 'night' | 'daily') {
      if (!nightUnlocked(save)) return;
      const key = dailyKey();
      const seed = mode === 'daily' ? dailySeed('lantern-works', key) : (Math.floor(services.random() * 2 ** 31) || 7);
      const p = newPlay(nightLevel(), mode, seed, save.night.build);
      p.daily = mode === 'daily' ? key : undefined;
      enterLevel(p);
    }
    function leaveLevel() {
      if (!play) return;
      saveBuild();
      play = null; hud?.top.remove(); hud?.bottom.remove(); hud = null; closePop(); closeCard();
      audio.hum(false);
      renderer.reset();
      layout();
    }
    function saveBuild() {
      if (!play) return;
      const build = buildOf(play.sim);
      if (play.mode === 'campaign') { const rec = save.levels[play.level.id] ?? { stars: [false, false, false], bestParts: null, bestBeats: null }; rec.build = build; save.levels[play.level.id] = rec; }
      else save.night.build = build;
      persist();
    }
    let buildTimer: ReturnType<typeof setTimeout> | null = null;
    const saveBuildSoon = () => { if (buildTimer) clearTimeout(buildTimer); buildTimer = setTimeout(() => { buildTimer = null; saveBuild(); }, 600); };

    // ------------------------------------------------------------ HUD
    function buildHud() {
      const p = play!;
      const top = h('div', { class: 'lw-top' });
      const bottom = h('div', { class: 'lw-bottom' });
      const titleRow = h('div', { class: 'lw-row' },
        h('button', { class: 'lw-btn ghost', 'aria-label': t('hud.menu'), style: 'min-height:34px;padding:2px 10px', onclick: () => { audio.ui(); if (p.mode === 'campaign') mapScreen(p.level.id); else titleScreen(); } }, '≡'),
        h('div', { class: 'lw-title' }, p.level.endless ? null : h('small', { text: p.level.id }), i18n.tr(p.level.name)));
      const orders = h('div', { class: 'lw-orders', 'aria-live': 'polite' });
      titleRow.append(orders);
      const chips = h('div', { class: 'lw-chips' });
      top.append(titleRow, chips);
      const tray = h('div', { class: 'lw-tray', role: 'toolbar', 'aria-label': 'Parts' });
      const tools: { kind: Tool; el: HTMLButtonElement; count?: HTMLElement }[] = [];
      const kinds = PART_ORDER.filter(k => p.level.tray[k] !== undefined);
      kinds.forEach((kind, i) => {
        const count = h('b');
        const fresh = p.level.introduces === kind && kind !== 'belt';
        const el = h('button', { class: `lw-tool${fresh ? ' fresh' : ''}`, 'aria-label': i18n.tr(PARTS[kind].name), title: `${i18n.tr(PARTS[kind].name)}: ${i18n.tr(PARTS[kind].does)}`, onclick: () => { audio.unlock(); selectTool(kind); } },
          img(partIcon(kind)), h('i', { text: String(i + 1) }), count) as HTMLButtonElement;
        tools.push({ kind, el, count }); tray.append(el);
      });
      const eraseEl = h('button', { class: 'lw-tool', 'aria-label': t('hud.erase'), title: t('hud.erase'), onclick: () => selectTool('erase') }, h('span', { style: 'font-size:1.5rem', text: '✕' })) as HTMLButtonElement;
      tools.push({ kind: 'erase', el: eraseEl }); tray.append(eraseEl);
      const runBtn = h('button', { class: 'lw-btn primary run', onclick: () => { audio.unlock(); toggleRun(); } }) as HTMLButtonElement;
      const speedBtn = h('button', { class: 'lw-btn', 'aria-label': t('hud.speed'), onclick: () => cycleSpeed() }) as HTMLButtonElement;
      const controls = h('div', { class: 'lw-controls' },
        h('button', { class: 'lw-btn', 'aria-label': t('hud.undo'), onclick: () => doUndo() }, '↶ ', t('hud.undo')),
        runBtn,
        h('button', { class: 'lw-btn', 'aria-label': t('hud.reset'), onclick: () => { audio.ui(); doReset(); } }, '⟲ ', t('hud.reset')),
        speedBtn);
      bottom.append(tray, controls);
      root.insertBefore(top, toast); root.insertBefore(bottom, toast);
      let lastOrders = '';
      const update = () => {
        if (!play) return;
        const { sim, level } = play;
        for (const tl of tools) {
          tl.el.classList.toggle('on', play.tool === tl.kind);
          if (tl.count && tl.kind && tl.kind !== 'erase') { const n = trayLeft(sim, tl.kind); tl.count.textContent = n > 40 ? '∞' : String(n); tl.el.classList.toggle('empty', n <= 0); }
        }
        const running = sim.status === 'run' || sim.status === 'won';
        runBtn.textContent = !running ? `▶ ${t('hud.run')}` : play.running ? `❚❚ ${t('hud.pause')}` : `▶ ${t('hud.resume')}`;
        speedBtn.textContent = `${save.speed}×`;
        // orders
        let key = '';
        if (level.endless) key = sim.orders.map(o => `${o.id}:${o.got}:${Math.floor((sim.beat - o.born) / o.patience * 20)}`).join('|');
        else key = sim.stalls.map(s => s.wants.map(w => w.got).join(',')).join('|');
        if (key !== lastOrders) {
          lastOrders = key;
          orders.replaceChildren();
          if (level.endless) {
            for (const o of sim.orders) {
              const el = h('span', { class: 'lw-order' }, h('span', { class: 'stall', text: String.fromCharCode(65 + o.stall) }), img(goodIcon(o.good)), `${o.got}/${o.n}`);
              const bar = h('span', { class: 'bar' }); bar.style.width = `${Math.max(0, 100 - (sim.beat - o.born) / o.patience * 100)}%`;
              el.append(bar); orders.append(el);
            }
          } else sim.stalls.forEach((st, si) => {
            const firstOpen = st.wants.findIndex(w => w.got < w.n);
            st.wants.forEach((w, wi) => orders.append(h('span', { class: `lw-order${w.got >= w.n ? ' done' : ''}${st.sequential && wi > firstOpen && firstOpen >= 0 ? ' later' : ''}` },
              sim.stalls.length > 1 ? h('span', { class: 'stall', text: String.fromCharCode(65 + si) }) : null, img(goodIcon(w.good)), `${Math.min(w.got, w.n)}/${w.n}`)));
          });
        }
        // chips
        const used = partsUsed(sim), parts = running ? Math.max(used, sim.maxParts) : used;
        const list: [string, string][] = [];
        if (level.endless) {
          list.push([t('hud.score', { n: sim.score }), 'good'], [t('hud.strikes', { n: sim.strikes }), sim.strikes ? 'bad' : ''], [t('hud.beat', { n: sim.beat }), 'dim']);
        } else {
          list.push([t('hud.beat', { n: sim.beat }), running && sim.wonAt === null && sim.beat > level.parSwift ? 'dim' : '']);
          list.push([`${t('hud.parts', { n: parts })} · ${t('hud.tidy', { n: level.parTidy })}`, parts <= level.parTidy ? 'good' : 'dim']);
          list.push([t('hud.swift', { n: level.parSwift }), sim.wonAt !== null ? (sim.wonAt <= level.parSwift ? 'good' : 'dim') : '']);
          if (sim.wrong) list.push([t('hud.wrong', { n: sim.wrong }), 'bad']);
          if (running && !play.running) list.push([t('hud.paused'), '']);
        }
        const chipKey = list.map(x => x.join(':')).join('|');
        if (chips.dataset.k !== chipKey) { chips.dataset.k = chipKey; chips.replaceChildren(...list.map(([text, cls]) => h('span', { class: `lw-chip ${cls}`, text }))); }
      };
      update();
      return { top, bottom, update };
    }
    function rebuildHud() {
      hud?.top.remove(); hud?.bottom.remove();
      hud = play ? buildHud() : null;
      layout();
    }

    // ------------------------------------------------------------ popover for a selected machine
    function closePop() { pop?.remove(); pop = null; }
    function placePop() {
      if (!pop || !play?.selected) return;
      const c = renderer.center(play.selected.x, play.selected.y), s = renderer.layout.cell;
      const w = pop.offsetWidth || 220, ph = pop.offsetHeight || 120;
      const left = clamp(c.x - w / 2, 4, renderer.layout.width - w - 4);
      let top = c.y - s * 0.6 - ph;
      const minTop = (hud?.top.offsetHeight ?? 0) + 2;
      if (top < minTop) top = c.y + s * 0.6;
      if (top + ph > renderer.layout.height - (hud?.bottom.offsetHeight ?? 0)) top = Math.max(minTop, c.y - ph / 2);
      pop.style.left = `${left}px`; pop.style.top = `${top}px`;
    }
    function openPop(pos: Pos) {
      closePop();
      if (!play) return;
      const part = partAt(play.sim, pos.x, pos.y);
      if (!part) return;
      play.selected = pos;
      const options = dialOptions(part.kind, play.level);
      const info = PARTS[part.kind];
      const dials = options.length ? h('div', { class: 'lw-dials', role: 'radiogroup', 'aria-label': t('hud.dial') }, ...options.map(v => h('button', {
        class: `lw-dial${part.dial === v ? ' on' : ''}`, role: 'radio', 'aria-checked': String(part.dial === v), 'aria-label': DIAL_NAMES[v] ? i18n.tr(DIAL_NAMES[v]) : v, title: DIAL_NAMES[v] ? i18n.tr(DIAL_NAMES[v]) : v,
        onclick: () => { edit({ op: 'dial', x: pos.x, y: pos.y, value: v }); openPop(pos); }
      }, img(dialIcon(part.kind, v))))) : null;
      pop = h('div', { class: 'lw-pop', role: 'dialog', 'aria-label': i18n.tr(info.name) },
        h('div', { class: 'head', text: `${i18n.tr(info.name)}${part.fixed ? ` · ${t('hud.fixed')}` : ''}` }),
        h('div', { class: 'does', text: i18n.tr(info.does) }),
        dials,
        h('div', { class: 'acts' },
          part.fixed || part.kind === 'bin' || part.kind === 'bridge' ? null : h('button', { class: 'lw-btn', onclick: () => { edit({ op: 'rotate', x: pos.x, y: pos.y }); } }, '⟳ ', t('hud.rotate')),
          part.fixed ? null : h('button', { class: 'lw-btn', onclick: () => { edit({ op: 'remove', x: pos.x, y: pos.y }); closePop(); if (play) play.selected = null; } }, '✕ ', t('hud.remove')),
          h('button', { class: 'lw-btn ghost', onclick: () => { closePop(); if (play) play.selected = null; root.focus({ preventScroll: true }); } }, t('hud.close'))));
      root.insertBefore(pop, toast);
      placePop();
    }

    // ------------------------------------------------------------ edits, undo, run
    function snapshot() { if (!play) return; play.undo.push(buildOf(play.sim)); if (play.undo.length > 80) play.undo.shift(); }
    function edit(e: Edit, record = true, quiet = false): boolean {
      if (!play) return false;
      if (record) snapshot();
      const events: SimEvent[] = [];
      const fail = applyEdit(play.sim, e, events);
      if (fail) {
        if (record) play.undo.pop();
        if (!quiet) { say(t(`fail.${fail}` as Key)); audio.ui('deny'); }
        return false;
      }
      renderer.onEvents(play.sim, events);
      if (!quiet) audio.ui(e.op === 'remove' ? 'remove' : 'place');
      saveBuildSoon(); hud?.update();
      if (pop && play.selected) { const sel = play.selected; if (partAt(play.sim, sel.x, sel.y)) openPop(sel); else { closePop(); play.selected = null; } }
      return true;
    }
    function doUndo() {
      if (!play) return;
      const prev = play.undo.pop();
      if (!prev) { audio.ui('deny'); return; }
      loadBuild(play.sim, prev);
      audio.ui('remove'); saveBuildSoon(); closePop(); play.selected = null; hud?.update();
    }
    function toggleRun() {
      if (!play) return;
      const sim = play.sim;
      if (sim.status === 'spoiled' || sim.status === 'over') { doReset(); }
      if (sim.status === 'build') { run(sim); play.running = true; play.acc = BEAT / save.speed * 0.6; audio.ui('run'); }
      else { play.running = !play.running; audio.ui(); }
      hud?.update();
    }
    function doReset() {
      if (!play) return;
      resetRun(play.sim); play.running = false; play.acc = 0; play.winShown = false; play.endShown = false;
      renderer.reset(); hud?.update();
    }
    function cycleSpeed() { save.speed = save.speed === 1 ? 2 : save.speed === 2 ? 4 : 1; persist(); audio.ui(); hud?.update(); }
    function selectTool(tool: Tool) {
      if (!play) return;
      play.tool = play.tool === tool && tool !== 'belt' ? 'belt' : tool;
      closePop(); play.selected = null;
      audio.ui(); hud?.update();
      if (tool && tool !== 'erase' && tool !== 'belt' && !touch) say(`${i18n.tr(PARTS[tool].name)}: ${i18n.tr(PARTS[tool].does)}`, 2200);
    }

    /** The way a new part should face: along a belt already there, or onward from whatever feeds this cell. */
    function smartDir(pos: Pos): Dir {
      const sim = play!.sim;
      const here = partAt(sim, pos.x, pos.y);
      if (here) return here.dir;
      for (const d of [0, 1, 2, 3] as Dir[]) {
        const nx = pos.x - DX[d], ny = pos.y - DY[d];
        if (nx < 0 || ny < 0 || nx >= sim.w || ny >= sim.h) continue;
        const cell = ny * sim.w + nx;
        if (sim.terrain[cell] === T.Source && sim.sources.some(s => s.x === nx && s.y === ny && s.dir === d)) return d;
        const p = sim.parts[cell];
        if (p && p.kind !== 'bin' && p.kind !== 'bridge' && p.dir === d) return d;
      }
      // otherwise toward a stall in a straight line, else east
      for (const st of sim.stalls) {
        if (st.y === pos.y) return st.x > pos.x ? 0 : 2;
        if (st.x === pos.x) return st.y > pos.y ? 1 : 3;
      }
      return 0;
    }
    const floorAt = (pos: Pos) => { const sim = play!.sim; return sim.terrain[pos.y * sim.w + pos.x] === T.Floor; };

    function placeTool(pos: Pos) {
      if (!play) return;
      const tool = play.tool, here = partAt(play.sim, pos.x, pos.y);
      if (tool === 'erase') { if (here && !here.fixed) edit({ op: 'remove', x: pos.x, y: pos.y }); return; }
      if (!tool) return;
      if (here && here.kind !== 'belt') { if (play.selected && play.selected.x === pos.x && play.selected.y === pos.y && !here.fixed && here.kind !== 'bin' && here.kind !== 'bridge') edit({ op: 'rotate', x: pos.x, y: pos.y }); else openPop(pos); return; }
      if (tool === 'belt' && here?.kind === 'belt') { edit({ op: 'rotate', x: pos.x, y: pos.y }); return; }
      if (!floorAt(pos)) return;
      if (edit({ op: 'place', kind: tool, x: pos.x, y: pos.y, dir: smartDir(pos) }) && tool !== 'belt') { openPop(pos); }
    }
    /** One step of a belt drawn from `a` to the neighbouring cell `b`. */
    function drawStep(a: Pos, b: Pos, first: boolean) {
      if (!play) return;
      const sim = play.sim;
      const d = ([0, 1, 2, 3] as Dir[]).find(k => a.x + DX[k] === b.x && a.y + DY[k] === b.y);
      if (d === undefined) return;
      const pa = partAt(sim, a.x, a.y);
      if (floorAt(a) && (!pa || pa.kind === 'belt') && (!pa || pa.dir !== d)) edit({ op: 'place', kind: 'belt', x: a.x, y: a.y, dir: d }, first, true);
      const pb = partAt(sim, b.x, b.y);
      if (floorAt(b) && !pb) edit({ op: 'place', kind: 'belt', x: b.x, y: b.y, dir: d }, false, true);
      audio.ui('tap');
    }

    // ------------------------------------------------------------ pointer input
    let drag: { start: Pos; last: Pos; moved: boolean; id: number; snap: boolean } | null = null;
    const toCell = (e: PointerEvent): Pos | null => {
      const r = canvas.getBoundingClientRect();
      return renderer.cellAt((e.clientX - r.left) * (renderer.layout.width / r.width), (e.clientY - r.top) * (renderer.layout.height / r.height));
    };
    const blocked = () => externalPause || !!screen || !!card || !play;
    canvas.addEventListener('pointerdown', e => {
      if (blocked()) return;
      audio.unlock();
      const pos = toCell(e);
      if (!pos) { closePop(); if (play) play.selected = null; return; }
      e.preventDefault();
      canvas.setPointerCapture?.(e.pointerId);
      drag = { start: pos, last: pos, moved: false, id: e.pointerId, snap: false };
      if (play!.tool === 'erase') { const here = partAt(play!.sim, pos.x, pos.y); if (here && !here.fixed) edit({ op: 'remove', x: pos.x, y: pos.y }); drag.moved = true; drag.snap = true; }
    });
    canvas.addEventListener('pointermove', e => {
      if (blocked()) { if (play) play.hover = null; return; }
      const pos = toCell(e);
      if (!drag) { if (play) play.hover = e.pointerType === 'mouse' ? pos : null; return; }
      if (!pos || (pos.x === drag.last.x && pos.y === drag.last.y)) return;
      // walk cell by cell so a fast swipe still lays a continuous belt
      let cur = drag.last;
      while (cur.x !== pos.x || cur.y !== pos.y) {
        const next = cur.x !== pos.x ? { x: cur.x + Math.sign(pos.x - cur.x), y: cur.y } : { x: cur.x, y: cur.y + Math.sign(pos.y - cur.y) };
        if (play!.tool === 'erase') { const here = partAt(play!.sim, next.x, next.y); if (here && !here.fixed) edit({ op: 'remove', x: next.x, y: next.y }, true, true); }
        else { drawStep(cur, next, !drag.snap); drag.snap = true; }
        cur = next;
      }
      if (play!.tool !== 'erase' && !drag.moved) closePop();
      drag.moved = true; drag.last = pos;
    });
    const endDrag = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag; drag = null;
      if (blocked()) return;
      if (!d.moved) placeTool(d.start);
      else if (play?.tool !== 'erase') hud?.update();
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', () => { drag = null; });
    canvas.addEventListener('pointerleave', () => { if (play) play.hover = null; });

    // ------------------------------------------------------------ keyboard (and the gamepad bridge)
    let spaceHeld = false;
    const onKey = (e: KeyboardEvent) => {
      if (externalPause || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      if (card) {
        if (k === 'Enter' || k === ' ') { e.preventDefault(); if (!e.repeat) (document.activeElement && card.contains(document.activeElement) ? document.activeElement as HTMLElement : card.querySelector<HTMLElement>('.lw-btn.primary'))?.click(); }
        else if (k === 'Escape' || k === 'x') { const b = card.querySelector<HTMLElement>('[data-dismiss]'); if (b) { e.preventDefault(); e.stopPropagation(); b.click(); } }
        else if (k.startsWith('Arrow')) { e.preventDefault(); moveFocus(card, k); }
        return;
      }
      if (screen) {
        if (k === 'Escape' || k === 'x') { const back = screen.querySelector<HTMLElement>('[data-action=back]'); if (back) { e.preventDefault(); e.stopPropagation(); back.click(); } return; }
        if (k.startsWith('Arrow')) { e.preventDefault(); moveFocus(screen, k); return; }
        if ((k === 'Enter' || k === ' ') && !e.repeat) {
          const a = document.activeElement as HTMLElement | null;
          e.preventDefault();
          if (a && screen.contains(a) && a.matches('button')) a.click(); else screen.querySelector<HTMLElement>('.lw-btn.primary:not(:disabled), .lw-btn:not(:disabled)')?.click();
        }
        return;
      }
      if (!play) return;
      if (pop && document.activeElement && pop.contains(document.activeElement)) {
        if (k === 'Escape' || k === 'x') { e.preventDefault(); e.stopPropagation(); closePop(); play.selected = null; root.focus({ preventScroll: true }); return; }
        if (k.startsWith('Arrow')) { e.preventDefault(); moveFocus(pop, k); return; }
        if ((k === 'Enter' || k === ' ') && !e.repeat) { e.preventDefault(); (document.activeElement as HTMLElement).click(); return; }
      }
      const sim = play.sim;
      const cur = play.cursor ?? { x: Math.floor(sim.w / 2), y: Math.floor(sim.h / 2) };
      const dirKey: Record<string, Dir> = { ArrowRight: 0, ArrowDown: 1, ArrowLeft: 2, ArrowUp: 3 };
      if (k in dirKey) {
        e.preventDefault();
        const d = dirKey[k];
        const next = { x: clamp(cur.x + DX[d], 0, sim.w - 1), y: clamp(cur.y + DY[d], 0, sim.h - 1) };
        if (!play.cursor) { play.cursor = cur; return; }
        if (spaceHeld && play.tool === 'belt' && (next.x !== cur.x || next.y !== cur.y)) drawStep(cur, next, true);
        play.cursor = next;
        if (pop) { closePop(); play.selected = null; }
        return;
      }
      if (k === ' ') { e.preventDefault(); if (!e.repeat) { spaceHeld = true; play.cursor ??= cur; placeTool(play.cursor); } return; }
      const lower = k.length === 1 ? k.toLowerCase() : k;
      const kinds = PART_ORDER.filter(p => play!.level.tray[p] !== undefined);
      if (/^[1-9]$/.test(k)) { const kind = kinds[Number(k) - 1]; if (kind) { e.preventDefault(); selectTool(kind); } return; }
      if (k === '0') { selectTool(kinds[9] ?? 'erase'); return; }
      const at = play.cursor ?? play.selected;
      switch (lower) {
        case 'q': case 'e': {
          e.preventDefault();
          const list: Tool[] = [...kinds, 'erase'];
          const i = Math.max(0, list.indexOf(play.tool));
          selectTool(list[(i + (lower === 'e' ? 1 : list.length - 1)) % list.length]);
          return;
        }
        case 'r': if (at) { e.preventDefault(); edit({ op: 'rotate', x: at.x, y: at.y }); } return;
        case 't': if (at) { e.preventDefault(); edit({ op: 'dial', x: at.x, y: at.y }); } return;
        case 'x': case 'Delete': if (at) { e.preventDefault(); const p = partAt(sim, at.x, at.y); if (p && !p.fixed) edit({ op: 'remove', x: at.x, y: at.y }); closePop(); play.selected = null; } return;
        case 'z': case 'u': e.preventDefault(); doUndo(); return;
        case 'Enter': e.preventDefault(); if (!e.repeat) toggleRun(); return;
        case 'Backspace': e.preventDefault(); doReset(); return;
        case 'f': e.preventDefault(); cycleSpeed(); return;
        case 'Escape':
          if (pop) { e.preventDefault(); e.stopPropagation(); closePop(); play.selected = null; }
          else if (play.cursor) { e.preventDefault(); e.stopPropagation(); play.cursor = null; }
          return;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === ' ') { spaceHeld = false; if (screen || card) e.preventDefault(); } };
    function moveFocus(container: HTMLElement, key: string) {
      const items = [...container.querySelectorAll<HTMLElement>('button:not(:disabled), input')].filter(el => el.offsetParent !== null || el.getClientRects().length > 0);
      if (!items.length) return;
      const a = document.activeElement as HTMLElement | null;
      if (!a || !items.includes(a)) { items[0].focus(); return; }
      const ar = a.getBoundingClientRect();
      const [dx, dy] = key === 'ArrowRight' ? [1, 0] : key === 'ArrowLeft' ? [-1, 0] : key === 'ArrowDown' ? [0, 1] : [0, -1];
      if (a instanceof HTMLInputElement && dx) { a.value = String(clamp(Number(a.value) + dx * 10, 0, 100)); a.dispatchEvent(new Event('input')); return; }
      let best: HTMLElement | null = null, bestScore = Infinity;
      for (const el of items) {
        if (el === a) continue;
        const r = el.getBoundingClientRect();
        const vx = r.left + r.width / 2 - (ar.left + ar.width / 2), vy = r.top + r.height / 2 - (ar.top + ar.height / 2);
        const along = vx * dx + vy * dy;
        if (along <= 1) continue;
        const score = along + Math.abs(vx * dy + vy * dx) * 2.5;
        if (score < bestScore) { bestScore = score; best = el; }
      }
      if (!best) { const i = items.indexOf(a); best = items[(i + (dx + dy > 0 ? 1 : items.length - 1)) % items.length]; }
      best.focus(); best.scrollIntoView?.({ block: 'nearest' });
    }
    root.addEventListener('keydown', onKey);
    root.addEventListener('keyup', onKeyUp);

    // ------------------------------------------------------------ sim events -> save, arcade, cards
    function handle(events: SimEvent[]) {
      if (!play) return;
      const p = play as Play;
      for (const e of events) {
        if (e.type === 'won' && p.mode === 'campaign') {
          const st = starsOf(p.sim);
          p.freshStars = recordWin(save, p.level.id, [st.delivered, st.tidy, st.swift], p.sim.maxParts, p.sim.wonAt ?? 0);
          saveBuild();
          services.reportComplete(campaignNumber(p.level.id));
          renderer.celebrate(p.sim, p.level.id === '4-5' || p.level.index === 5);
          setTimeout(() => { if (play === p && !p.winShown && !card) { p.winShown = true; winCard(); } }, reducedNow() ? 600 : 1900);
        } else if (e.type === 'spoiled') { p.running = false; setTimeout(() => { if (play === p && !card) spoilCard(); }, 700); }
        else if (e.type === 'shiftOver') {
          p.running = false;
          const newBest = e.score > save.night.best;
          if (p.mode === 'night') { save.night.best = Math.max(save.night.best, e.score); save.night.shifts++; }
          else recordDaily(services.storage, e.score);
          saveBuild();
          services.reportScore(e.score);
          setTimeout(() => { if (play === p && !p.endShown) { p.endShown = true; shiftCard(e.score, p.sim.served, newBest && p.mode === 'night'); } }, 900);
        } else if (e.type === 'orderNew') say(`${String.fromCharCode(65 + e.order.stall)}: ${e.order.n} ×`, 900);
      }
    }

    // ------------------------------------------------------------ frame loop
    const frame = (now: number) => {
      raf = 0;
      if (destroyed || externalPause) return;
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000) || 0);
      last = now; clock += dt;
      let beatT = 0;
      if (play) {
        const sim = play.sim, beatDur = BEAT / save.speed;
        const live = play.running && (sim.status === 'run' || sim.status === 'won') && !card && !screen;
        if (live) {
          play.acc += dt;
          let guard = 0;
          while (play.acc >= beatDur && guard++ < 4) {
            play.acc -= beatDur;
            renderer.beforeStep(sim);
            const events = step(sim);
            renderer.onEvents(sim, events);
            audio.beat(events, beatDur);
            handle(events);
          }
          if (play.acc > beatDur) play.acc = 0;
          beatT = play.acc / beatDur;
        } else beatT = 1;
        hud?.update();
      }
      renderer.update(dt);
      const view: ViewState = {
        sim: play?.sim ?? null, beatT, time: clock, running: !!play?.running && !card,
        cursor: play?.cursor ?? null, hover: play?.hover ?? null, selected: play?.selected ?? null, tool: play?.tool ?? null,
        glyphs: save.settings.glyphs, dusk: play ? (play.level.endless ? 0.85 : 0.15 + (play.level.chapter - 1) * 0.2 + (play.level.index - 1) * 0.03) : 0.4,
        ghost: play && play.level.id === '1-1' && partsUsed(play.sim) === 0 ? [1, 2, 3, 4, 5].map(x => ({ x, y: 1, dir: 0 as Dir })).concat([{ x: 6, y: 1, dir: 1 as Dir }]) : []
      };
      if (ctx) { try { renderer.draw(ctx, view); } catch (err) { if (!drawFailed) { drawFailed = true; console.error('[lantern-works] draw failed', err); } } }
      raf = requestAnimationFrame(frame);
    };
    const startLoop = () => { if (!raf && !destroyed && !externalPause) { last = typeof performance !== 'undefined' ? performance.now() : 0; raf = requestAnimationFrame(frame); } };

    Object.defineProperty(root, '__lw', { configurable: true, value: {
      get play() { return play; }, get save() { return save; }, get layout() { return renderer.layout; }, get screen() { return screenName; }, get card() { return !!card; },
      openLevel, openNight, mapScreen, titleScreen, closeCard, edit: (e: Edit) => edit(e), run: () => toggleRun(), levels: LEVELS.map(l => l.id),
      unlockAll() { for (const l of LEVELS) save.levels[l.id] ??= { stars: [true, false, false], bestParts: null, bestBeats: null }; persist(); }
    } });

    layout();
    titleScreen();
    startLoop();

    return {
      pause() { if (destroyed || externalPause) return; externalPause = true; if (raf) { cancelAnimationFrame(raf); raf = 0; } audio.pause(); },
      resume() { if (destroyed || !externalPause) return; externalPause = false; audio.resume(); startLoop(); },
      restart() {
        if (destroyed) return;
        if (externalPause) { externalPause = false; audio.resume(); startLoop(); }
        // Restart keeps the build: it clears the goods and the beat counter, like the Reset button.
        if (play) { doReset(); closeCard(); root.focus({ preventScroll: true }); }
        else titleScreen();
      },
      destroy() {
        if (destroyed) return;
        if (play) saveBuild();
        destroyed = true;
        if (raf) cancelAnimationFrame(raf);
        if (toastTimer) clearTimeout(toastTimer);
        if (buildTimer) clearTimeout(buildTimer);
        observer?.disconnect();
        window.removeEventListener('resize', layout);
        root.removeEventListener('keydown', onKey);
        root.removeEventListener('keyup', onKeyUp);
        audio.dispose();
        play = null;
        root.remove();
      }
    };
  }
};

export default lanternWorks;
