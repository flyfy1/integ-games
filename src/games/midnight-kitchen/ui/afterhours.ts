import { AFTER_HOURS, AFTER_HOURS_STARS } from '../data';
import { allStars, isUnlocked, starsOf } from '../save';
import type { Screen } from './context';
import { crumbs, h, head, starPurse, stars } from './dom';

/** After Hours: ten side nights with one odd rule each, opened by total stars. */
export const afterHoursScreen: Screen = ui => {
  const { t, tr } = ui.i18n, save = ui.save, have = allStars(save);
  const list = h('div', { class: 'mk-ah-list', 'data-afterhours': '' }, AFTER_HOURS.map(level => {
    const open = isUnlocked(save, level.id), got = starsOf(save.levels[level.id]), need = AFTER_HOURS_STARS[level.id];
    return h('button', { class: `mk-ah${open ? '' : ' locked'}${got ? ' done' : ''}`, 'data-level': level.id, disabled: !open,
      'aria-label': `${tr(level.name)}. ${open ? `${got}/3 ★` : t('ah.need', { n: need })}`, onclick: () => ui.openLevel(level.id) },
      h('span', { class: 'mk-node-num', 'aria-hidden': 'true' }, String(level.index)),
      h('span', { class: 'mk-ah-text' }, h('b', null, tr(level.name)), h('small', null, open ? tr(level.blurb) : t('ah.need', { n: need }))),
      open ? stars(got) : h('em', { class: 'mk-ah-lock' }, `🔒 ★${need}`));
  }));
  return h('div', { class: 'mk-screen', 'data-screen': 'afterhours' },
    head(ui, t('ah.title'), () => ui.go('map'), starPurse(ui, have), crumbs(ui)),
    h('div', { class: 'mk-body' }, h('p', { class: 'mk-lead mk-ah-intro' }, t('ah.intro')), list));
};
