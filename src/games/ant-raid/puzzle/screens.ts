import { h } from '../ui/dom';
import type { I18n, Lang } from './i18n';
import { PUZZLE_CHAPTERS, PUZZLES, puzzleById } from './levels';
import { RULES } from './rules';
import { isOpen, nextUp, type PuzzleSave, type PuzzleSettings } from './save';
import type { RuleId } from './types';

/** Menus for the puzzle mode. One function per screen; each returns a fresh element the shell puts over the canvas. */
export type PScreen = 'title' | 'levels' | 'settings' | 'pause' | 'results' | 'rule';
export type PResults = { level: string; first: boolean; elegant: boolean; got: boolean; cost: number; par?: number; next: string | null };
export type PParams = { results?: PResults; rules?: RuleId[]; all?: boolean; from?: PScreen; chapter?: number };
export type PUi = {
  i18n: I18n; save: PuzzleSave;
  go(name: PScreen, params?: PParams): void;
  play(id: string): void;
  next(): void; replay(): void; levels(): void;
  resume(): void; clear(): void; title(): void; closeRules(): void;
  setLang(lang: Lang): void;
  setSetting<K extends keyof PuzzleSettings>(key: K, value: PuzzleSettings[K]): void;
  resetProgress(): void;
};

const screen = (name: string, cls: string, ...children: (HTMLElement | null)[]) => h('div', { class: `ar-screen ${cls}`, 'data-screen': name }, ...children);
const head = (ui: PUi, title: string, back: (() => void) | null) => h('header', { class: 'ar-head' }, back ? h('button', { class: 'ar-btn ghost small', 'data-action': 'back', onclick: back }, '‹ ', ui.i18n.t('common.back')) : null, h('h2', null, title));
const langToggle = (ui: PUi) => h('div', { class: 'ar-lang', role: 'group', 'aria-label': ui.i18n.t('settings.lang') },
  h('button', { 'aria-pressed': String(ui.i18n.lang === 'en'), 'data-lang': 'en', onclick: () => ui.setLang('en') }, 'English'),
  h('button', { 'aria-pressed': String(ui.i18n.lang === 'zh'), 'data-lang': 'zh', onclick: () => ui.setLang('zh') }, '中文'));

function title(ui: PUi): HTMLElement {
  const t = ui.i18n.t, save = ui.save;
  const started = Object.values(save.levels).some(r => r.win);
  const next = nextUp(save);
  return screen('title', 'ar-title',
    h('div', null, h('div', { class: 'ar-logo' }, ui.i18n.lang === 'zh' ? '蚂蚁进攻' : 'Crumb Raiders'), h('div', { class: 'ar-logo-zh' }, ui.i18n.lang === 'zh' ? 'CRUMB RAIDERS' : '蚂 蚁 进 攻')),
    h('p', { class: 'ar-tag' }, t('title.tag')),
    h('div', { class: 'ar-menu' },
      h('button', { class: 'ar-btn primary big wide', 'data-action': 'play', onclick: () => ui.play(next) }, started ? t('title.continue', { id: next }) : t('title.play')),
      h('button', { class: 'ar-btn', 'data-action': 'levels', onclick: () => ui.go('levels') }, t('title.levels')),
      h('button', { class: 'ar-btn', 'data-action': 'settings', onclick: () => ui.go('settings', { from: 'title' }) }, t('title.settings'))),
    langToggle(ui));
}

function levels(ui: PUi): HTMLElement {
  const t = ui.i18n.t, save = ui.save;
  const cleared = PUZZLES.filter(l => save.levels[l.id]?.win).length;
  const current = nextUp(save);
  return screen('levels', '', head(ui, t('levels.title'), () => ui.go('title')),
    h('div', { class: 'ar-body' },
      h('p', { class: 'ar-sub' }, t('levels.stars', { n: cleared, max: PUZZLES.length })),
      ...PUZZLE_CHAPTERS.map(ch => h('section', { class: 'ar-panel ar-chapter' },
        h('h3', null, `${ch.id}. ${ui.i18n.tr(ch.name)}`),
        h('div', { class: 'ar-nodes' }, ...ch.levels.map(id => {
          const level = puzzleById(id)!, rec = save.levels[id], open = isOpen(save, id);
          return h('button', { class: `ar-node${id === current ? ' current' : ''}${rec?.win ? ' won' : ''}`, 'data-level': id, disabled: !open, onclick: () => ui.play(id) },
            h('span', { class: 'id' }, id), h('b', null, ui.i18n.tr(level.name)),
            h('small', null, !open ? t('levels.locked') : rec?.win ? `✓ ${t('levels.cleared')}${level.par !== undefined ? (rec.elegant ? ' · ★' : ' · ☆') : ''}` : ''));
        }))))));
}

function settings(ui: PUi, params: PParams): HTMLElement {
  const t = ui.i18n.t, s = ui.save.settings;
  const slider = (key: 'music' | 'sfx') => { const input = h('input', { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(s[key] * 100)), 'aria-label': t(`settings.${key}`) }) as HTMLInputElement; input.addEventListener('input', () => ui.setSetting(key, Number(input.value) / 100)); return input; };
  const reduced = h('button', { class: 'ar-switch', role: 'switch', 'aria-checked': String(s.reducedFx), 'aria-label': t('settings.reduced') });
  reduced.addEventListener('click', () => { const next = reduced.getAttribute('aria-checked') !== 'true'; reduced.setAttribute('aria-checked', String(next)); ui.setSetting('reducedFx', next); });
  let confirming = false;
  const reset = h('button', { class: 'ar-btn paper small', 'data-action': 'reset', onclick: () => { if (!confirming) { confirming = true; reset.textContent = t('settings.resetConfirm'); return; } ui.resetProgress(); } }, t('settings.reset'));
  const from = params.from === 'pause' ? 'pause' : 'title';
  return screen('settings', '', head(ui, t('settings.title'), () => ui.go(from)),
    h('div', { class: 'ar-body' }, h('div', { class: 'ar-panel' },
      h('div', { class: 'ar-row' }, h('span', null, t('settings.lang')), langToggle(ui)),
      h('div', { class: 'ar-row' }, h('span', null, t('settings.music')), slider('music')),
      h('div', { class: 'ar-row' }, h('span', null, t('settings.sfx')), slider('sfx')),
      h('div', { class: 'ar-row' }, h('span', null, t('settings.reduced')), reduced),
      from === 'title' ? h('div', { class: 'ar-row' }, h('span', null, ''), reset) : null)));
}

function pause(ui: PUi): HTMLElement {
  const t = ui.i18n.t;
  return screen('pause', 'clear', h('div', { class: 'ar-result' },
    h('h2', null, t('pause.title')),
    h('div', { class: 'ar-actions col' },
      h('button', { class: 'ar-btn primary big', 'data-action': 'resume', onclick: () => ui.resume() }, t('pause.resume')),
      h('button', { class: 'ar-btn', 'data-action': 'clear', onclick: () => ui.clear() }, t('pause.clear')),
      h('button', { class: 'ar-btn', 'data-action': 'levels', onclick: () => ui.levels() }, t('pause.levels')),
      h('button', { class: 'ar-btn ghost', 'data-action': 'settings', onclick: () => ui.go('settings', { from: 'pause' }) }, t('title.settings')),
      h('button', { class: 'ar-btn ghost', 'data-action': 'title', onclick: () => ui.title() }, t('pause.title2')))));
}

function results(ui: PUi, params: PParams): HTMLElement {
  const t = ui.i18n.t, r = params.results!;
  const level = puzzleById(r.level)!;
  const star = level.par !== undefined
    ? h('p', { class: `ar-par${r.elegant ? ' on' : ''}` }, h('span', null, r.elegant ? '★' : '☆'), ' ', r.elegant ? t('results.parGot') : t('results.par', { n: level.par }), h('small', null, ` · ${t('results.used', { n: r.cost })}`))
    : null;
  return screen('results', 'clear ar-results', h('div', { class: 'ar-result ar-panel' },
    h('h2', null, t('results.cleared')),
    h('p', { class: 'ar-sub' }, `${r.level} · ${ui.i18n.tr(level.name)}`),
    star,
    r.next ? null : h('p', null, t('results.done')),
    h('div', { class: 'ar-actions' },
      r.next ? h('button', { class: 'ar-btn primary big', 'data-action': 'next', onclick: () => ui.next() }, t('results.next')) : null,
      h('button', { class: 'ar-btn', 'data-action': 'retry', onclick: () => ui.replay() }, t('results.replay')),
      h('button', { class: 'ar-btn ghost', 'data-action': 'map', onclick: () => ui.levels() }, t('results.levels')))));
}

/** A rule card: one picture, at most twelve words, one tap to close. `all` shows every rule met so far. */
function rule(ui: PUi, params: PParams): HTMLElement {
  const t = ui.i18n.t, ids = params.rules ?? [];
  const card = (id: RuleId) => {
    const def = RULES[id];
    const canvas = document.createElement('canvas');
    const pr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
    canvas.width = 260 * pr; canvas.height = 110 * pr; canvas.className = 'ar-rulepic'; canvas.setAttribute('aria-hidden', 'true');
    const ctx = canvas.getContext('2d');
    if (ctx && typeof ctx.setTransform === 'function') { ctx.setTransform(pr, 0, 0, pr, 0, 0); try { def.draw(ctx, 260, 110); } catch { /* jsdom */ } }
    return h('div', { class: 'ar-rule', 'data-rule': id }, canvas, h('h3', null, ui.i18n.tr(def.title)), h('p', null, ui.i18n.tr(def.text)));
  };
  const el = screen('rule', 'clear ar-rules', h('div', { class: 'ar-result ar-panel' },
    h('p', { class: 'ar-sub' }, params.all ? t('rule.all') : t('rule.new')),
    ...ids.map(card),
    h('div', { class: 'ar-actions' }, h('button', { class: 'ar-btn primary big', 'data-action': 'ok', onclick: () => ui.closeRules() }, t('rule.ok')))));
  // A tap anywhere closes a single new-rule card.
  if (!params.all) el.addEventListener('click', (event) => { if (!(event.target as HTMLElement).closest('button')) ui.closeRules(); });
  return el;
}

export const PSCREENS: Record<PScreen, (ui: PUi, params: PParams) => HTMLElement> = { title, levels, settings, pause, results, rule };
