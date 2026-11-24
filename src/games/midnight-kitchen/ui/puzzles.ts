import { PUZZLES } from '../data';
import { isUnlocked, PUZZLES_OPEN_AFTER } from '../save';
import type { Screen } from './context';
import { crumbs, h, head } from './dom';

/** Chef's Table: twelve set puzzles in order; each opens when the one before it is solved. */
export const puzzlesScreen: Screen = ui => {
  const { t, tr } = ui.i18n, save = ui.save, solved = PUZZLES.filter(item => save.puzzles.includes(item.level.id)).length;
  const list = h('div', { class: 'mk-ah-list', 'data-puzzles': '' }, PUZZLES.map(({ level }, i) => {
    const open = isUnlocked(save, level.id), done = save.puzzles.includes(level.id);
    const lock = i === 0 ? t('pz.lockFirst', { n: PUZZLES_OPEN_AFTER.replace('c', '').replace('-', '–') }) : t('pz.lock');
    return h('button', { class: `mk-ah${open ? '' : ' locked'}${done ? ' done' : ''}`, 'data-level': level.id, disabled: !open,
      'aria-label': `${tr(level.name)}. ${done ? t('pz.solved') : open ? '' : lock}`, onclick: () => ui.openLevel(level.id) },
      h('span', { class: 'mk-node-num', 'aria-hidden': 'true' }, String(level.index)),
      h('span', { class: 'mk-ah-text' }, h('b', null, tr(level.name)), h('small', null, open ? tr(level.blurb) : lock)),
      done ? h('em', { class: 'mk-pz-done' }, '✓') : open ? null : h('em', { class: 'mk-ah-lock' }, '🔒'));
  }));
  return h('div', { class: 'mk-screen', 'data-screen': 'puzzles' },
    head(ui, t('pz.title'), () => ui.go('map'), h('span', { class: 'mk-chip', 'data-solved': String(solved) }, t('pz.count', { n: solved, total: PUZZLES.length })), crumbs(ui)),
    h('div', { class: 'mk-body' }, h('p', { class: 'mk-lead mk-ah-intro' }, t('pz.intro')), list));
};
