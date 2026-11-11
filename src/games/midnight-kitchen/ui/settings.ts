import { LANGS, type Key } from '../i18n';
import type { Screen, UiContext } from './context';
import { h, head, slider, toggle } from './dom';

/** Key list and the rules in a sentence; shared by the pause menu and Settings. */
export function helpPanel(ui: UiContext): HTMLElement {
  const { t } = ui.i18n;
  const keys: [string, Key][] = [['1-8', 'keys.cards'], ['Q / E', 'keys.cycle'], ['← ↑ → ↓', 'keys.move'], [ui.i18n.lang === 'zh' ? '空格' : 'Space', 'keys.place'], ['U', 'keys.upgrade'], ['X', 'keys.remove'], ['F', 'keys.speed'], ['P / Esc', 'keys.pause']];
  return h('div', { class: 'mk-panel', 'data-panel': 'help' }, h('h3', null, t('settings.howTitle')), h('p', { class: 'mk-lead' }, t('settings.how')),
    h('div', { class: 'mk-keys' }, keys.flatMap(([key, label]) => [h('span', null, h('kbd', null, key)), h('span', null, t(label))])));
}

/** Language, sound, comfort and tips. `inGame` hides what must not change mid-level (progress reset). */
export function settingsBody(ui: UiContext, inGame: boolean): HTMLElement[] {
  const { t } = ui.i18n, s = ui.save.settings;
  const language = h('div', { class: 'mk-panel' }, h('div', { class: 'mk-setting' }, h('div', { class: 'mk-setting-text' }, h('b', null, t('settings.language'))),
    h('div', { class: 'mk-lang', role: 'group', 'aria-label': t('settings.language') }, LANGS.map(lang => h('button', { 'aria-pressed': String(ui.i18n.lang === lang), 'data-lang': lang, onclick: () => ui.setLang(lang) }, t(lang === 'en' ? 'lang.en' : 'lang.zh'))))));
  const sound = h('div', { class: 'mk-panel' }, h('h3', null, t('settings.sound')),
    slider(t('settings.music'), s.music, value => ui.setSetting('music', value), 'music'),
    slider(t('settings.sfx'), s.sfx, value => ui.setSetting('sfx', value), 'sfx'),
    h('p', { style: 'font-size:var(--fs-xs);margin-top:6px' }, t('settings.muteHint')));
  const comfort = h('div', { class: 'mk-panel' }, h('h3', null, t('settings.comfort')),
    toggle(t('settings.reduced'), s.reducedFx || ui.reduced, value => ui.setSetting('reducedFx', value), 'reduced', t('settings.reducedHint')),
    toggle(t('settings.auto'), s.autoAdvance, value => ui.setSetting('autoAdvance', value), 'auto-advance', t('settings.autoHint')),
    toggle(t('settings.tips'), !ui.save.coach.off, value => ui.setTips(value), 'tips', t('settings.tipsHint')),
    h('div', { class: 'mk-setting' }, h('div', { class: 'mk-setting-text' }, h('b', null, t('settings.tipsReset')), h('small', null, t('settings.tipsResetHint'))),
      h('button', { class: 'mk-btn small', 'data-action': 'tips-reset', onclick: (event: Event) => { ui.setTips(true, true); (event.currentTarget as HTMLButtonElement).textContent = `✓ ${t('common.done')}`; } }, t('settings.tipsResetGo'))));
  const out: HTMLElement[] = [language, sound, comfort];
  if (!inGame) {
    let armed = false;
    const reset = h('button', { class: 'mk-btn small danger', 'data-action': 'reset', onclick: () => {
      if (!armed) { armed = true; reset.textContent = t('settings.resetConfirm'); warn.hidden = false; return; }
      ui.resetProgress();
    } }, t('settings.reset'));
    const warn = h('p', { hidden: true, role: 'alert', style: 'color:#ffc4ba;margin-top:6px' }, t('settings.resetWarn'));
    out.push(helpPanel(ui), h('div', { class: 'mk-panel' }, h('div', { class: 'mk-setting' }, h('div', { class: 'mk-setting-text' }, h('b', null, t('settings.reset')), h('small', null, t('settings.resetHint'))), reset), warn));
  }
  return out;
}

/** Settings screen from the title or the map. */
export const settingsScreen: Screen = (ui, params) => {
  const back = params.from ?? 'title';
  return h('div', { class: 'mk-screen', 'data-screen': 'settings' }, head(ui, ui.i18n.t('settings.title'), () => ui.go(back)),
    h('div', { class: 'mk-body', style: 'max-width:640px' }, settingsBody(ui, false)));
};
