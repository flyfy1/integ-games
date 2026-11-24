import { readDaily, dailyKey, dailyShareText } from '../../_shared/daily';
import type { GameStorage } from '../../../core/game-types';
import type { Audio } from '../audio';
import { CASTE_ORDER, CASTES, CHAPTERS, DAILY_HAND, ENDLESS_UNLOCK, levelById, LEVEL_LIST, META_UPGRADES } from '../data';
import type { I18n, Lang } from '../i18n';
import { isUnlocked, slotsOf, starsOf, totalStars, upgradeCost, type Reward, type Save, type Settings } from '../save';
import { SCENES } from '../story';
import type { BonusDef, CasteId, GoalDef, LevelDef } from '../types';
import { casteIcon, h, stars } from './dom';

/** Menus. One function per screen; each returns a fresh element the shell puts in front of the canvas. */
export type ScreenName = 'title' | 'map' | 'loadout' | 'shop' | 'settings' | 'results' | 'pause';
export type ResultsData = {
  level: LevelDef; won: boolean; flags: { win: boolean; bonus: boolean; par: boolean }; reward: Reward; time: number; crumbs: number; lost: number;
  nextLevel: string | null; chapterOpened: number | null; endlessOpened: boolean; colonySpent: boolean; mercy: boolean; best?: number; streak?: number;
};
export type ScreenParams = { chapter?: number; level?: string; results?: ResultsData; from?: ScreenName };
export type UiContext = {
  i18n: I18n; save: Save; audio: Audio; reduced: boolean; storage: GameStorage;
  go(name: ScreenName, params?: ScreenParams): void;
  openLevel(id: string): void;
  startRaid(id: string, loadout: CasteId[]): void;
  startEndless(daily: boolean): void;
  afterResults(choice: 'next' | 'retry' | 'map' | 'endless'): void;
  resume(): void; restart(): void; quit(): void;
  setLang(lang: Lang): void;
  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void;
  setTips(on: boolean): void;
  buy(id: string): boolean;
  respec(): number;
  resetProgress(): void;
  replayScene(id: string, then: ScreenName, params?: ScreenParams): void;
};

const back = (ui: UiContext, to: () => void) => h('button', { class: 'ar-btn ghost small', 'data-action': 'back', onclick: to }, '‹ ', ui.i18n.t('common.back'));
const head = (ui: UiContext, title: string, onBack: (() => void) | null, ...extra: (HTMLElement | null)[]) => h('header', { class: 'ar-head' }, onBack ? back(ui, onBack) : null, h('h2', null, title), ...extra);
const purse = (ui: UiContext) => h('span', { class: 'ar-purse', 'aria-label': `${ui.i18n.t('common.crystals')} ${ui.save.crystals}` }, h('i', { 'aria-hidden': 'true' }), String(ui.save.crystals));
const screen = (name: string, ...children: (HTMLElement | null)[]) => h('div', { class: 'ar-screen', 'data-screen': name }, ...children);

export function goalText(ui: UiContext, goal: GoalDef, level?: LevelDef): string {
  const t = ui.i18n.t;
  if (goal.kind === 'crumbs') return t('goal.crumbs', { n: goal.n });
  if (goal.kind === 'item') { const food = level?.foods.find(f => f.id === goal.food); return t('goal.item', { food: food ? t(`food.${food.kind}` as never) : '' }); }
  if (goal.kind === 'defend') return t('goal.defend', { n: goal.n });
  return t('goal.race', { n: goal.n });
}
export function bonusText(ui: UiContext, bonus: BonusDef): string {
  const t = ui.i18n.t;
  switch (bonus.kind) {
    case 'maxLost': return t('bonus.maxLost', { n: bonus.n });
    case 'noAlarm': return t('bonus.noAlarm');
    case 'scent': return t('bonus.scent', { n: bonus.n });
    case 'crumbs': return t('bonus.crumbs', { n: bonus.n });
    case 'maxScatter': return t('bonus.maxScatter', { n: bonus.n });
    case 'noCaste': return t('bonus.noCaste', { c: ui.i18n.tr(CASTES[bonus.caste].name) });
    case 'hp': return t('bonus.hp', { n: bonus.n });
    case 'cut': return t('bonus.cut');
  }
}

/** The level to play next: the first unlocked level not yet won (else the last). */
export function nextUp(save: Save): string {
  return LEVEL_LIST.find(level => isUnlocked(save, level.id) && !save.levels[level.id]?.win)?.id ?? LEVEL_LIST[LEVEL_LIST.length - 1].id;
}

function title(ui: UiContext): HTMLElement {
  const t = ui.i18n.t, save = ui.save;
  const started = Object.keys(save.levels).length > 0;
  const endlessOpen = !!save.levels[ENDLESS_UNLOCK]?.win;
  const daily = readDaily(ui.storage, 'daily');
  const today = dailyKey();
  return h('div', { class: 'ar-screen ar-title', 'data-screen': 'title' },
    h('div', null, h('div', { class: 'ar-logo' }, ui.i18n.lang === 'zh' ? '蚂蚁进攻' : 'Crumb Raiders'), h('div', { class: 'ar-logo-zh' }, ui.i18n.lang === 'zh' ? 'CRUMB RAIDERS' : '蚂 蚁 进 攻')),
    h('p', { class: 'ar-tag' }, t('title.tag')),
    h('div', { class: 'ar-menu' },
      h('button', { class: 'ar-btn primary big wide', 'data-action': 'play', onclick: () => ui.openLevel(nextUp(save)) }, started ? t('title.continue') : t('title.play')),
      h('button', { class: 'ar-btn', 'data-action': 'chapters', onclick: () => ui.go('map', {}) }, t('title.chapters')),
      h('button', { class: 'ar-btn', 'data-action': 'shop', onclick: () => ui.go('shop', {}) }, t('title.nest'), ' ', purse(ui)),
      h('button', { class: 'ar-btn honey', 'data-action': 'endless', disabled: !endlessOpen, title: endlessOpen ? '' : t('title.endlessLocked'), onclick: () => ui.startEndless(false) },
        h('span', null, t('title.endless'), h('br'), h('span', { class: 'ar-sub' }, endlessOpen ? t('endless.best', { n: save.endless.best }) : t('title.endlessLocked')))),
      h('button', { class: 'ar-btn honey', 'data-action': 'daily', disabled: !endlessOpen, onclick: () => ui.startEndless(true) },
        h('span', null, t('title.daily'), h('br'), h('span', { class: 'ar-sub' }, daily.lastKey === today ? t('daily.played', { n: daily.scores[today] ?? 0 }) : t('daily.today', { d: today })))),
      h('button', { class: 'ar-btn', 'data-action': 'settings', onclick: () => ui.go('settings', { from: 'title' }) }, t('title.settings')),
      h('div', { class: 'ar-lang', role: 'group', 'aria-label': t('settings.lang') },
        h('button', { 'aria-pressed': String(ui.i18n.lang === 'en'), onclick: () => ui.setLang('en') }, 'EN'),
        h('button', { 'aria-pressed': String(ui.i18n.lang === 'zh'), onclick: () => ui.setLang('zh') }, '中文')))
  );
}

function map(ui: UiContext, params: ScreenParams): HTMLElement {
  const t = ui.i18n.t, save = ui.save;
  const current = nextUp(save);
  const chapterOf = levelById(current)?.chapter ?? 1;
  const active = params.chapter ?? chapterOf;
  const chapter = CHAPTERS.find(ch => ch.id === active) ?? CHAPTERS[0];
  const tabs = h('div', { class: 'ar-tabs', role: 'tablist' }, CHAPTERS.map(ch => {
    const open = !!ch.levels[0] && isUnlocked(save, ch.levels[0]) && !!levelById(ch.levels[0]);
    return h('button', { class: 'ar-tab', role: 'tab', 'aria-selected': String(ch.id === chapter.id), disabled: !open, onclick: () => ui.go('map', { chapter: ch.id }) }, `${ch.id}. ${ui.i18n.tr(ch.name)}`);
  }));
  const nodes = h('div', { class: 'ar-nodes' }, chapter.levels.map(id => {
    const level = levelById(id);
    if (!level) return null;
    const open = isUnlocked(save, id), record = save.levels[id];
    return h('button', { class: `ar-node${level.boss ? ' boss' : ''}${id === current ? ' current' : ''}`, 'data-level': id, disabled: !open, onclick: () => ui.openLevel(id) },
      h('span', { class: 'id' }, `${id}${level.boss ? ` · ${t('map.boss')}` : ''}`), h('b', null, ui.i18n.tr(level.name)),
      open ? stars(starsOf(record)) : h('span', { class: 'ar-sub' }, t('map.locked')),
      record?.bestTime ? h('span', { class: 'ar-sub' }, t('map.best', { t: Math.round(record.bestTime) })) : null);
  }));
  const storyIds = [`c${chapter.id}-intro`, chapter.levels.map(id => levelById(id)?.intro).find(s => s?.startsWith('boss')), `c${chapter.id}-outro`].filter((id): id is string => !!id && !!SCENES[id] && save.scenes.includes(id));
  return screen('map', head(ui, t('title.chapters'), () => ui.go('title'), h('span', { class: 'ar-purse' }, '★ ', String(totalStars(save)))),
    h('div', { class: 'ar-body' }, tabs,
      h('div', { class: 'ar-panel ar-chapter-head' }, h('div', null, h('h3', null, ui.i18n.tr(chapter.name)), h('p', null, ui.i18n.tr(chapter.place))),
        storyIds.length ? h('div', { class: 'ar-actions' }, storyIds.map(id => h('button', { class: 'ar-btn paper small', onclick: () => ui.replayScene(id, 'map', { chapter: chapter.id }) }, `▶ ${t('map.replayIntro')}`))) : null),
      nodes));
}

function loadout(ui: UiContext, params: ScreenParams): HTMLElement {
  const t = ui.i18n.t, save = ui.save;
  const level = levelById(params.level ?? '') ?? LEVEL_LIST[0];
  const max = level.slots ?? slotsOf(save);
  const required = new Set<CasteId>(['worker', ...(level.required ?? [])]);
  let picked: CasteId[] = level.cards ? [...level.cards] : [...new Set([...save.loadout.filter(id => save.owned.includes(id)), ...required])].slice(0, Math.max(max, required.size));
  const owned = CASTE_ORDER.filter(id => save.owned.includes(id) || required.has(id));
  const count = h('span', { class: 'ar-sub' });
  const start = h('button', { class: 'ar-btn primary big', 'data-action': 'start', onclick: () => ui.startRaid(level.id, picked) }, t('loadout.start'));
  const grid = h('div', { class: 'ar-cards' });
  const render = () => {
    grid.replaceChildren(...owned.map(id => {
      const def = CASTES[id], on = picked.includes(id), locked = !!level.cards || required.has(id);
      return h('button', { class: 'ar-cardpick', 'aria-pressed': String(on), disabled: locked && !level.cards ? false : !!level.cards, onclick: () => {
        if (required.has(id)) return;
        picked = on ? picked.filter(x => x !== id) : picked.length < max ? [...picked, id] : picked;
        ui.audio.sfx('select'); render();
      } }, casteIcon(id), h('span', null, h('b', null, ui.i18n.tr(def.name)), ' ', h('span', { class: 'ar-sub' }, `${def.cost}`), h('small', null, required.has(id) && id !== 'worker' ? t('loadout.required') : ui.i18n.tr(def.blurb))));
    }));
    count.textContent = t('loadout.slots', { n: picked.length, max });
  };
  render();
  const facts = h('dl', { class: 'ar-facts' },
    h('dt', null, t('loadout.goal')), h('dd', null, goalText(ui, level.goal, level)),
    h('dt', null, '★'), h('dd', null, bonusText(ui, level.bonus)),
    h('dt', null, '★'), h('dd', null, t('loadout.par', { t: level.par })),
    h('dt', null, t('loadout.new')), h('dd', null, ui.i18n.tr(level.introduces)));
  return screen('loadout', head(ui, `${level.id} ${ui.i18n.tr(level.name)}`, () => ui.go('map', { chapter: level.chapter })),
    h('div', { class: 'ar-body' },
      h('div', { class: 'ar-panel' }, h('p', null, ui.i18n.tr(level.blurb)), h('div', { style: 'height:8px' }), facts),
      h('div', { class: 'ar-panel' }, h('div', { class: 'ar-row' }, h('h3', null, t('loadout.title')), count), grid),
      h('div', { class: 'ar-actions' }, start)));
}

function shop(ui: UiContext): HTMLElement {
  const t = ui.i18n.t, save = ui.save;
  return screen('shop', head(ui, t('shop.title'), () => ui.go('title'), purse(ui)),
    h('div', { class: 'ar-body' }, h('p', null, t('shop.hint')),
      ...META_UPGRADES.map(upgrade => {
        const rank = save.upgrades[upgrade.id] ?? 0, cost = upgradeCost(save, upgrade);
        return h('div', { class: 'ar-panel ar-row' }, h('div', null, h('h3', null, ui.i18n.tr(upgrade.name)), h('p', null, ui.i18n.tr(upgrade.blurb)), h('span', { class: 'ar-sub' }, t('shop.rank', { r: rank, max: upgrade.costs.length }))),
          h('button', { class: 'ar-btn honey', 'data-upgrade': upgrade.id, disabled: cost === null || save.crystals < cost, onclick: () => { if (ui.buy(upgrade.id)) ui.go('shop'); } }, cost === null ? t('shop.max') : t('shop.buy', { c: cost })));
      }),
      h('div', { class: 'ar-actions' }, h('button', { class: 'ar-btn paper', onclick: () => { ui.respec(); ui.go('shop'); } }, t('shop.respec')))));
}

function settings(ui: UiContext, params: ScreenParams): HTMLElement {
  const t = ui.i18n.t, s = ui.save.settings;
  const slider = (key: 'music' | 'sfx') => { const input = h('input', { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(s[key] * 100)), 'aria-label': t(`settings.${key}`) }) as HTMLInputElement; input.addEventListener('input', () => ui.setSetting(key, Number(input.value) / 100)); return input; };
  const toggle = (on: boolean, change: (v: boolean) => void, label: string) => { const b = h('button', { class: 'ar-switch', role: 'switch', 'aria-checked': String(on), 'aria-label': label }); b.addEventListener('click', () => { const next = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', String(next)); change(next); }); return b; };
  let confirming = false;
  const reset = h('button', { class: 'ar-btn paper small', onclick: () => { if (!confirming) { confirming = true; reset.textContent = t('settings.resetConfirm'); return; } ui.resetProgress(); } }, t('settings.reset'));
  const from = params.from === 'pause' ? 'pause' : 'title';
  return screen('settings', head(ui, t('title.settings'), () => ui.go(from)),
    h('div', { class: 'ar-body' }, h('div', { class: 'ar-panel' },
      h('div', { class: 'ar-row' }, h('span', null, t('settings.lang')), h('div', { class: 'ar-lang' }, h('button', { 'aria-pressed': String(ui.i18n.lang === 'en'), onclick: () => ui.setLang('en') }, 'EN'), h('button', { 'aria-pressed': String(ui.i18n.lang === 'zh'), onclick: () => ui.setLang('zh') }, '中文'))),
      h('div', { class: 'ar-row' }, h('span', null, t('settings.music')), slider('music')),
      h('div', { class: 'ar-row' }, h('span', null, t('settings.sfx')), slider('sfx')),
      h('div', { class: 'ar-row' }, h('span', null, t('settings.reduced')), toggle(s.reducedFx, v => ui.setSetting('reducedFx', v), t('settings.reduced'))),
      h('div', { class: 'ar-row' }, h('span', null, t('settings.tips')), toggle(!ui.save.coach.off, v => ui.setTips(v), t('settings.tips'))),
      from === 'title' ? h('div', { class: 'ar-row' }, h('span', null, ''), reset) : null)));
}

function results(ui: UiContext, params: ScreenParams): HTMLElement {
  const t = ui.i18n.t, r = params.results!;
  const endless = !!r.level.endless;
  const flags = r.flags;
  const starBox = (on: boolean, label: string) => h('div', { class: on ? 'on' : '' }, h('span', null, '★'), label);
  const shareBtn: HTMLButtonElement = h('button', { class: 'ar-btn paper', onclick: async () => {
    const line = dailyShareText(ui.i18n.lang === 'zh' ? '蚂蚁进攻' : 'Crumb Raiders', r.crumbs, r.streak ?? 1, dailyKey(), ui.i18n.lang === 'zh');
    try { await navigator.clipboard?.writeText(line); shareBtn.textContent = t('results.copied'); } catch { shareBtn.textContent = line; }
  } }, t('results.share'));
  const share = endless && r.level.endless?.daily ? shareBtn : null;
  const notes: (HTMLElement | null)[] = [
    r.reward.crystals ? h('p', null, t('results.crystals', { n: r.reward.crystals })) : null,
    ...r.reward.unlocked.map(id => h('p', null, t('results.unlocked', { c: ui.i18n.tr(CASTES[id].name) }))),
    r.chapterOpened ? h('p', null, t('results.chapter', { c: ui.i18n.tr(CHAPTERS.find(c => c.id === r.chapterOpened)!.name) })) : null,
    r.endlessOpened ? h('p', null, t('results.endlessOpen')) : null,
    !r.won && r.mercy ? h('p', { class: 'ar-sub' }, t('results.mercy')) : null
  ];
  const titleText = endless ? t('results.ended') : r.won ? t('results.won') : r.colonySpent ? t('results.lostColony') : t('results.lost');
  return h('div', { class: 'ar-screen clear', 'data-screen': 'results' }, h('div', { class: 'ar-result' },
    h('h2', null, titleText),
    endless ? h('div', { class: 'ar-statrow' }, h('div', null, h('b', null, String(r.crumbs)), t('results.crumbs')), h('div', null, h('b', null, String(r.best ?? 0)), t('results.best', { n: '' })), r.streak ? h('div', null, h('b', null, String(r.streak)), t('results.streak', { n: '' })) : null)
      : h('div', { class: 'ar-bigstars' }, starBox(flags.win, t('results.star1')), starBox(flags.bonus, bonusText(ui, r.level.bonus)), starBox(flags.par, t('results.star3', { t: r.level.par }))),
    !endless ? h('div', { class: 'ar-statrow' }, h('div', null, h('b', null, `${Math.round(r.time)}s`), t('results.time')), h('div', null, h('b', null, String(r.crumbs)), t('results.crumbs')), h('div', null, h('b', null, String(r.lost)), t('results.lostAnts'))) : null,
    ...notes,
    h('div', { class: 'ar-actions' },
      r.won && r.nextLevel ? h('button', { class: 'ar-btn primary big', 'data-action': 'next', onclick: () => ui.afterResults('next') }, t('results.next')) : null,
      h('button', { class: `ar-btn ${r.won && r.nextLevel ? '' : 'primary big'}`, 'data-action': 'retry', onclick: () => ui.afterResults('retry') }, t('results.retry')),
      r.endlessOpened ? h('button', { class: 'ar-btn honey', onclick: () => ui.afterResults('endless') }, t('results.endless')) : null,
      share,
      h('button', { class: 'ar-btn ghost', 'data-action': 'map', onclick: () => ui.afterResults('map') }, endless ? t('common.back') : t('results.map')))));
}

function pause(ui: UiContext, params: ScreenParams): HTMLElement {
  const t = ui.i18n.t;
  const level = levelById(params.level ?? '');
  return h('div', { class: 'ar-screen clear', 'data-screen': 'pause' }, h('div', { class: 'ar-result' },
    h('h2', null, t('pause.title')),
    level ? h('div', { class: 'ar-panel' }, h('p', null, h('b', null, `${t('pause.goal')}: `), goalText(ui, level.goal, level)), h('p', null, '★ ', bonusText(ui, level.bonus))) : null,
    h('div', { class: 'ar-actions' },
      h('button', { class: 'ar-btn primary big', 'data-action': 'resume', onclick: () => ui.resume() }, t('pause.resume')),
      h('button', { class: 'ar-btn', 'data-action': 'restart', onclick: () => ui.restart() }, t('pause.restart')),
      h('button', { class: 'ar-btn', onclick: () => ui.go('settings', { from: 'pause', level: params.level }) }, t('title.settings')),
      h('button', { class: 'ar-btn ghost', 'data-action': 'back', onclick: () => ui.quit() }, t('pause.quit')))));
}

export const SCREENS: Record<ScreenName, (ui: UiContext, params: ScreenParams) => HTMLElement> = { title, map, loadout, shop, settings, results, pause };
export const DAILY_CARDS = DAILY_HAND;
