import { CHAPTERS, DEFENDERS, ENDLESS_LEVEL, RECIPES } from '../data';
import { clock, type Key } from '../i18n';
import { spriteIcon } from '../render/sprites';
import type { Screen, UiContext } from './context';
import { crumbs, h, head } from './dom';
import { bonusText } from './loadout';
import { helpPanel, settingsBody } from './settings';

const TIPS: Key[] = ['tip.burners', 'tip.lanes', 'tip.walls', 'tip.upgrade', 'tip.recipes'];

/** Plays the star chimes in step with the CSS pop-in (no-ops once the screen is gone). */
function chime(ui: UiContext, element: HTMLElement, delays: number[]): void {
  if (ui.reduced) return;
  for (const delay of delays) setTimeout(() => { if (element.isConnected) ui.audio.sfx('star'); }, delay * 1000 + 120);
}

const stat = (label: string, value: string | number) => h('div', { class: 'mk-stat' }, h('b', null, String(value)), h('small', null, label));

/** After a level: the star ceremony, what was earned and unlocked, and where to go next. Endless gets a run summary. */
export const resultsScreen: Screen = (ui, params) => {
  const { t, tr } = ui.i18n, data = params.results;
  if (!data) return h('div', { class: 'mk-screen', 'data-screen': 'results' });
  const { level, won, flags, reward } = data, endless = level.id === ENDLESS_LEVEL.id, stats = data.stats;
  const box = h('div', { class: `mk-results${won || endless ? '' : ' lost'}`, 'data-result': endless ? 'endless' : won ? 'won' : 'lost' });
  const element = h('div', { class: 'mk-screen', 'data-screen': 'results' }, box);
  let d = 0.35;
  const next = () => (d += 0.18).toFixed(2);

  if (endless) {
    const best = reward.newBest || reward.newBestWave;
    box.append(
      h('div', { class: 'mk-eyebrow' }, tr(level.name)),
      h('h2', null, t('results.endless', { n: data.wave })),
      best ? h('div', { class: 'mk-pb', role: 'status' }, '★ ', t('results.pb')) : '',
      h('div', { class: 'mk-panel', style: 'width:100%' },
        h('div', { class: 'mk-eyebrow' }, t('hud.score')), h('div', { class: 'mk-bigscore' }, String(data.score)),
        h('p', { style: 'margin-top:4px' }, reward.newBest && reward.prevBest?.score ? t('results.beat', { n: reward.prevBest.score }) : reward.newBest ? t('results.first') : t('results.bestWas', { n: ui.save.endless.bestScore }))),
      h('div', { class: 'mk-statgrid' }, stat(t('results.waves'), data.wave), stat(t('results.kills'), data.kills), stat(t('results.recipesCooked'), stats?.recipes.length ?? 0), stat(t('results.heatSpent'), stats?.heatSpent ?? 0), stat(t('results.time'), clock(data.time))));
    if (best) chime(ui, element, [0.3]);
  } else if (won) {
    // The campaign's last level gets its own heading; remembering the Bloom (not beating it) gets its own line.
    const last = !data.nextLevel, head = last ? t('results.finaleHead') : t('results.win'), sub = last && stats?.remembered ? t('results.rememberedSub') : t('results.winSub');
    const before = reward.prior ?? [false, false, false], list: [boolean, string][] = [[flags.win, t('results.star.win')], [flags.flawless, t('results.star.flawless')], [flags.bonus, bonusText(ui, level.bonus)]];
    // Stars already earned on an earlier run sit still; the new ones pop in one by one with a chime.
    const delays: number[] = [];
    box.append(
      h('div', { class: 'mk-eyebrow' }, `${t('map.chapter', { n: level.chapter })} · ${tr(level.name)}`),
      h('h2', null, head), h('p', { class: 'mk-tag' }, sub),
      h('div', { class: 'mk-bigstars', role: 'img', 'aria-label': t('results.starsAria', { n: list.filter(([on], i) => on || before[i]).length }) }, list.map(([on, label], i) => {
        if (on && !before[i]) {
          const delay = 0.35 + delays.length * 0.32; delays.push(delay);
          return h('div', { class: 'mk-bigstar on', style: `--d:${delay}s` }, h('i', { class: 'g' }, '★'), h('span', null, label), h('i', { class: 'mk-tagnew', style: `--d:${delay + 0.25}s` }, t('common.new')));
        }
        return h('div', { class: `mk-bigstar${on || before[i] ? ' on had' : ''}` }, h('i', { class: 'g' }, '★'), h('span', null, label));
      })));
    chime(ui, element, delays);
    if (delays.length) d = delays[delays.length - 1] + 0.2;
  } else {
    // An early loss is nearly always an economy problem, so say that first; later losses rotate through the rest.
    box.append(h('div', { class: 'mk-eyebrow' }, tr(level.name)), h('h2', null, t('results.lose')), h('p', { class: 'mk-tag' }, t('results.loseSub')),
      h('div', { class: 'mk-panel paper', style: 'width:100%;text-align:left' }, h('p', { class: 'mk-lead' }, t(data.kills < 20 ? 'tip.burners' : TIPS[Math.floor(data.time) % TIPS.length]))));
  }

  if (!endless) box.append(h('div', { class: 'mk-statgrid' }, stat(t('results.time'), clock(data.time)), stat(t('results.kills'), data.kills),
    stats ? stat(t('results.heatSpent'), stats.heatSpent) : null, stats ? stat(t('results.recipesCooked'), stats.recipes.length) : null));
  if (reward.crumbs > 0) box.append(h('div', { class: 'mk-row center', style: `animation:mk-rise .4s backwards;animation-delay:${next()}s` }, h('span', { class: 'mk-eyebrow' }, t('results.earned')), crumbs(ui, reward.crumbs), h('span', { class: 'mk-chip' }, t('results.purse', { n: ui.save.crumbs }))));
  for (const id of reward.unlocked) {
    const def = DEFENDERS[id];
    if (!def) continue;
    box.append(h('div', { class: 'mk-panel paper mk-reward', style: `--d:${next()}s` }, spriteIcon('defender', id, 72),
      h('div', null, h('div', { class: 'mk-eyebrow' }, t('results.newDefender')), h('h3', null, tr(def.name)), h('p', null, tr(def.desc)))));
  }
  if (reward.newRecipes.length) box.append(h('div', { class: 'mk-panel mk-reward', style: `--d:${next()}s` },
    h('span', { class: 'mk-recipe-parts' }, (RECIPES.find(r => r.id === reward.newRecipes[0])?.parts ?? []).map(part => spriteIcon('defender', part, 40))),
    h('div', null, h('div', { class: 'mk-eyebrow' }, t('results.recipes')), h('h3', null, reward.newRecipes.map(id => { const recipe = RECIPES.find(r => r.id === id); return recipe ? tr(recipe.name) : id; }).join(' · ')))));
  if (data.endlessUnlocked) box.append(h('div', { class: 'mk-panel mk-reward', style: `--d:${next()}s` }, h('span', { class: 'mk-door-ico', style: 'font-size:28px' }, '∞'), h('div', null, h('h3', null, t('results.endlessUnlocked')))));
  if (data.chapterOpened) {
    const plan = CHAPTERS.find(chapter => chapter.id === data.chapterOpened);
    box.append(h('div', { class: 'mk-panel mk-reward', style: `--d:${next()}s` }, h('span', { class: 'mk-door-ico', style: 'font-size:26px;font-weight:900' }, String(data.chapterOpened)),
      h('div', null, h('div', { class: 'mk-eyebrow' }, t('results.chapterOpen')), h('h3', null, plan ? tr(plan.name) : t('map.chapter', { n: data.chapterOpened })))));
  }
  // The campaign's last level: a proper ending line and a door straight into Endless Night.
  const finale = won && !endless && !data.nextLevel;
  if (finale) box.append(h('div', { class: 'mk-panel paper mk-reward mk-finale', style: `--d:${next()}s` }, h('span', { class: 'mk-door-ico', style: 'font-size:28px' }, '☀'),
    h('div', null, h('h3', null, t('results.finaleTitle')), h('p', null, t('results.finale')))));

  box.append(h('div', { class: 'mk-results-actions' },
    won && data.nextLevel ? h('button', { class: 'mk-btn primary big', 'data-action': 'next', onclick: () => ui.afterResults(data, 'next') }, `${t('results.next')} ›`) : null,
    finale ? h('button', { class: 'mk-btn primary big', 'data-action': 'endless', onclick: () => ui.afterResults(data, 'endless') }, `∞ ${t('results.toEndless')}`) : null,
    h('button', { class: `mk-btn${(won && data.nextLevel) || finale ? '' : ' primary big'}`, 'data-action': 'retry', onclick: () => ui.afterResults(data, 'retry') }, `↻ ${won || endless ? t('results.replay') : t('results.retry')}`),
    h('button', { class: 'mk-btn', 'data-action': 'map', onclick: () => ui.afterResults(data, 'map') }, t('results.map'))));
  return element;
};

/**
 * In-game pause menu (the P key, Esc or the pause button; the arcade's own Pause shows its overlay instead). Settings
 * and the key list open inside it, so the night behind stays alive.
 */
export const pauseScreen: Screen = (ui, params) => {
  const { t } = ui.i18n;
  const panel = params.panel;
  const back = () => ui.go('pause', {});
  if (panel === 'settings' || panel === 'help') {
    const body = panel === 'help' ? helpPanel(ui) : settingsBody(ui, true);
    return h('div', { class: 'mk-screen', 'data-screen': 'pause', 'data-panel': panel }, head(ui, panel === 'help' ? t('settings.howTitle') : t('settings.title'), back), h('div', { class: 'mk-body', style: 'max-width:620px' }, body));
  }
  return h('div', { class: 'mk-screen', 'data-screen': 'pause' }, h('div', { class: 'mk-pause' },
    h('h2', null, t('pause.title')), params.level ? h('p', { class: 'mk-sub' }, params.level) : null,
    h('button', { class: 'mk-btn primary big', 'data-action': 'resume', onclick: () => ui.resume() }, `▶ ${t('pause.resume')}`),
    h('button', { class: 'mk-btn', 'data-action': 'retry', onclick: () => ui.retry() }, `↻ ${t('pause.retry')}`),
    h('div', { class: 'mk-row', style: 'flex-wrap:nowrap' },
      h('button', { class: 'mk-btn mk-grow', 'data-action': 'pause-settings', onclick: () => ui.go('pause', { panel: 'settings' }) }, `⚙ ${t('title.settings')}`),
      h('button', { class: 'mk-btn mk-grow', 'data-action': 'pause-help', onclick: () => ui.go('pause', { panel: 'help' }) }, `? ${t('pause.help')}`)),
    h('button', { class: 'mk-btn ghost', 'data-action': 'map', onclick: () => ui.quitToMap() }, t('pause.map')),
    h('p', { class: 'mk-sub', style: 'font-size:var(--fs-xs)' }, t('pause.lost'))));
};
