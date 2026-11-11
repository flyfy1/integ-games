import { ENDLESS_LEVEL, ENDLESS_UNLOCK, LEVEL_LIST, levelById } from '../data';
import { LANGS } from '../i18n';
import { isUnlocked, totalStars } from '../save';
import type { Screen, UiContext } from './context';
import { crumbs, h, starPurse } from './dom';

/** The level "Continue" should open: the first unlocked level not yet won, else the last one. */
export function continueLevel(ui: UiContext): string {
  const open = LEVEL_LIST.filter(level => isUnlocked(ui.save, level.id));
  return (open.find(level => !ui.save.levels[level.id]?.win) ?? open[open.length - 1] ?? LEVEL_LIST[0]).id;
}

/** Title: logo over the lit counter, Continue (or Play), then the doors: chapters, Endless, Cookbook, Upgrades, Settings. */
export const titleScreen: Screen = ui => {
  const { t, tr } = ui.i18n, save = ui.save, started = Object.keys(save.levels).length > 0;
  const next = levelById(continueLevel(ui)), endlessOpen = !!save.levels[ENDLESS_UNLOCK]?.win;
  // Once every kitchen is safe there is nothing to "continue": the big button opens Endless Night instead.
  const complete = LEVEL_LIST.every(level => save.levels[level.id]?.win);
  const main = complete
    ? h('button', { class: 'mk-btn primary big', 'data-action': 'play', onclick: () => ui.openLevel(ENDLESS_LEVEL.id) }, `∞ ${t('map.endless')}`, h('span', { class: 'mk-sub' }, t('title.allDone')))
    : started && next
    ? h('button', { class: 'mk-btn primary big', 'data-action': 'play', onclick: () => ui.openLevel(next.id) }, t('title.continue'), h('span', { class: 'mk-sub' }, `${t('map.chapter', { n: next.chapter })} · ${next.index}  ${tr(next.name)}`))
    : h('button', { class: 'mk-btn primary big', 'data-action': 'play', onclick: () => ui.openLevel(LEVEL_LIST[0].id) }, t('title.play'));
  const door = (action: string, icon: string, label: string, onclick: () => void, disabled = false, title = '') =>
    h('button', { class: 'mk-btn', 'data-action': action, disabled, title: title || null, onclick }, h('span', { class: 'mk-ico', 'aria-hidden': 'true' }, icon), label);
  return h('div', { class: 'mk-screen clear', 'data-screen': 'title' },
    h('div', { class: 'mk-title' },
      h('div', { class: 'mk-title-head' },
        h('div', { class: 'mk-moon', 'aria-hidden': 'true', style: 'margin:0 auto' }),
        h('h1', { class: 'mk-logo' }, ui.i18n.lang === 'zh' ? '深夜厨房' : 'Midnight Kitchen', h('small', null, ui.i18n.lang === 'zh' ? 'MIDNIGHT KITCHEN' : '深夜厨房'))),
      h('p', { class: 'mk-tag' }, t('title.tag')),
      h('div', { class: 'mk-title-main' }, main),
      h('div', { class: 'mk-title-grid' },
        door('chapters', '☾', t('title.chapters'), () => ui.go('map')),
        door('endless', '∞', t('map.endless'), () => ui.openLevel(ENDLESS_LEVEL.id), !endlessOpen, endlessOpen ? '' : t('map.endlessLocked', { n: levelById(ENDLESS_UNLOCK)?.index ?? 3 })),
        door('cookbook', '✎', t('title.cookbook'), () => ui.go('cookbook', { from: 'title' })),
        door('shop', '▲', t('title.shop'), () => ui.go('shop', { from: 'title' })),
        door('settings', '⚙', t('title.settings'), () => ui.go('settings', { from: 'title' })),
        h('div', { class: 'mk-lang', role: 'group', 'aria-label': t('settings.language') },
          LANGS.map(lang => h('button', { 'aria-pressed': String(ui.i18n.lang === lang), 'data-lang': lang, style: 'flex:1', onclick: () => ui.setLang(lang) }, t(lang === 'en' ? 'lang.en' : 'lang.zh'))))),
      started ? h('div', { class: 'mk-title-foot' }, starPurse(ui, totalStars(save)), crumbs(ui)) : null));
};
