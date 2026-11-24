import { AFTER_HOURS_BY_ID, CHAPTERS, DEFENDERS, ENDLESS_LEVEL, LEVEL_LIST, modeOf, PUZZLES, RECIPES } from '../data';
import { clock, type Key } from '../i18n';
import { dailyShareText } from '../../_shared/daily';
import { spriteIcon } from '../render/sprites';
import type { Screen, UiContext } from './context';
import { crumbs, h, head } from './dom';
import { bonusText } from './loadout';
import { challengeOpen, grannyOffered, hintOffered } from '../save';
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
  const { level, won, flags, reward } = data, mode = modeOf(level), endless = level.id === ENDLESS_LEVEL.id || mode === 'daily', stats = data.stats;
  /** The campaign's very last night gets the dawn ending; side nights never do. */
  const lastNight = mode === 'campaign' && LEVEL_LIST[LEVEL_LIST.length - 1]?.id === level.id;
  const eyebrow = mode === 'afterhours' ? t('ah.eyebrow', { n: level.index }) : mode === 'puzzle' ? t('pz.eyebrow', { n: level.index }) : t('map.chapter', { n: level.chapter });
  const box = h('div', { class: `mk-results${won || endless ? '' : ' lost'}`, 'data-result': endless ? 'endless' : won ? 'won' : 'lost' });
  const element = h('div', { class: 'mk-screen', 'data-screen': 'results' }, box);
  let d = 0.35;
  const next = () => (d += 0.18).toFixed(2);

  if (data.daily) {
    // Daily Night: today's score against today's best, the streak, and a line to share.
    const day = data.daily, share = dailyShareText(t('title.name'), data.score, day.streak, day.key, ui.i18n.lang === 'zh');
    const status = h('span', { role: 'status', 'aria-live': 'polite', class: 'mk-sub' });
    box.append(
      h('div', { class: 'mk-eyebrow' }, `☀ ${tr(level.name)} · ${day.key}`),
      h('h2', null, t('results.endless', { n: data.wave })),
      day.newBest ? h('div', { class: 'mk-pb', role: 'status' }, '★ ', t('daily.newBest')) : '',
      h('div', { class: 'mk-panel', style: 'width:100%', 'data-daily-result': '' },
        h('div', { class: 'mk-eyebrow' }, t('hud.score')), h('div', { class: 'mk-bigscore' }, String(data.score)),
        h('p', { style: 'margin-top:4px' }, t('daily.todayBest', { n: day.best }), ' · ', t('daily.streakN', { n: day.streak })),
        h('div', { class: 'mk-row center', style: 'margin-top:8px' },
          h('button', { class: 'mk-btn small', 'data-action': 'share', onclick: async () => { status.textContent = (await ui.copy(share)) ? t('daily.copied') : share; } }, `⧉ ${t('daily.share')}`), status)),
      h('div', { class: 'mk-statgrid' }, stat(t('results.waves'), data.wave), stat(t('results.kills'), data.kills), stat(t('results.recipesCooked'), stats?.recipes.length ?? 0), stat(t('results.time'), clock(data.time))));
    if (day.newBest) chime(ui, element, [0.3]);
  } else if (endless) {
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
  } else if (data.challenge) {
    // Chef's Challenge: one star at stake, the fourth. Won before? It stays lit without the ceremony.
    const fresh = won && reward.firstClear;
    box.append(h('div', { class: 'mk-eyebrow' }, `♛ ${t('ch.title')} · ${eyebrow} · ${tr(level.name)}`),
      h('h2', null, won ? t('ch.winHead') : t('ch.loseHead')), h('p', { class: 'mk-tag' }, won ? t(fresh ? 'ch.winSub' : 'ch.againSub') : t('ch.loseSub')),
      h('div', { class: 'mk-bigstars', 'data-challenge-star': won ? 'won' : 'lost', role: 'img', 'aria-label': `${t('ch.star')}: ${won || ui.save.challenges.includes(level.id) ? '★' : '☆'}` },
        h('div', { class: `mk-bigstar${won || ui.save.challenges.includes(level.id) ? ` on${fresh ? '' : ' had'}` : ''}`, style: fresh ? '--d:.35s' : '' }, h('i', { class: 'g' }, '♛'), h('span', null, t('ch.star')),
          fresh ? h('i', { class: 'mk-tagnew', style: '--d:.6s' }, t('common.new')) : null)));
    if (fresh) chime(ui, element, [0.35]);
  } else if (mode === 'puzzle') {
    // Chef's Table: solved or not, no stars. A second miss in a row brings the hint (also shown on the counter).
    const puzzle = PUZZLES.find(item => item.level === level);
    box.append(h('div', { class: 'mk-eyebrow' }, `${eyebrow} · ${tr(level.name)}`), h('h2', null, won ? t('pz.solvedHead') : t('pz.missHead')), h('p', { class: 'mk-tag' }, won ? t(reward.firstClear ? 'pz.solvedSub' : 'pz.againSub') : t('pz.missSub')),
      !won && puzzle && hintOffered(ui.save, level.id) ? h('div', { class: 'mk-panel paper', 'data-hint': '', style: 'width:100%;text-align:left' }, h('p', { class: 'mk-lead' }, `💡 ${tr(puzzle.hint)}`)) : '');
    if (won && reward.firstClear) chime(ui, element, [0.3]);
  } else if (won) {
    // The campaign's last level gets its own heading; remembering the Bloom (not beating it) gets its own line.
    const last = lastNight, head = last ? t('results.finaleHead') : t('results.win'), sub = last && stats?.remembered ? t('results.rememberedSub') : t('results.winSub');
    const before = reward.prior ?? [false, false, false], list: [boolean, string][] = [[flags.win, t('results.star.win')], [flags.flawless, t('results.star.flawless')], [flags.bonus, bonusText(ui, level.bonus)]];
    // Stars already earned on an earlier run sit still; the new ones pop in one by one with a chime.
    const delays: number[] = [];
    box.append(
      h('div', { class: 'mk-eyebrow' }, `${eyebrow} · ${tr(level.name)}`),
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
    if (reward.chefWin) box.append(h('div', { class: 'mk-pb', role: 'status', 'data-chef-win': '' }, '♛ ', t('results.chefWin')));
  } else {
    // An early loss is nearly always an economy problem, so say that first; later losses rotate through the rest.
    box.append(h('div', { class: 'mk-eyebrow' }, tr(level.name)), h('h2', null, t('results.lose')), h('p', { class: 'mk-tag' }, t('results.loseSub')),
      h('div', { class: 'mk-panel paper', style: 'width:100%;text-align:left' }, h('p', { class: 'mk-lead' }, t(data.kills < 20 ? 'tip.burners' : TIPS[Math.floor(data.time) % TIPS.length]))));
    // Two losses in a row: Granny offers a free tier-2 guard on the briefing screen.
    if (grannyOffered(ui.save, level.id)) box.append(h('div', { class: 'mk-panel paper mk-granny-head', 'data-granny-offer': '', style: 'width:100%;text-align:left' }, spriteIcon('character', 'granny', 48),
      h('div', { class: 'mk-grow' }, h('b', null, t('granny.title')), h('p', { style: 'margin:2px 0 6px' }, t('granny.askHint')),
        h('button', { class: 'mk-btn primary', 'data-action': 'granny', onclick: () => ui.go('loadout', { level: level.id }) }, t('granny.ask')))));
  }

  if (!endless) box.append(h('div', { class: 'mk-statgrid' }, stat(t('results.time'), clock(data.time)), stat(t('results.kills'), data.kills),
    stats && mode !== 'puzzle' ? stat(t('results.heatSpent'), stats.heatSpent) : null, stats ? stat(t('results.recipesCooked'), stats.recipes.length) : null));
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
  for (const id of data.ahOpened ?? []) {
    const night = AFTER_HOURS_BY_ID[id];
    if (night) box.append(h('div', { class: 'mk-panel mk-reward', 'data-ah-opened': id, style: `--d:${next()}s` }, h('span', { class: 'mk-door-ico', style: 'font-size:26px' }, '☾'),
      h('div', null, h('div', { class: 'mk-eyebrow' }, t('ah.title')), h('h3', null, t('ah.opened', { name: tr(night.name) })))));
  }
  const finale = won && lastNight;
  if (finale) box.append(h('div', { class: 'mk-panel paper mk-reward mk-finale', style: `--d:${next()}s` }, h('span', { class: 'mk-door-ico', style: 'font-size:28px' }, '☀'),
    h('div', null, h('h3', null, t('results.finaleTitle')), h('p', null, t('results.finale')))));

  box.append(h('div', { class: 'mk-results-actions' },
    won && data.nextLevel ? h('button', { class: 'mk-btn primary big', 'data-action': 'next', onclick: () => ui.afterResults(data, 'next') }, `${t('results.next')} ›`) : null,
    finale ? h('button', { class: 'mk-btn primary big', 'data-action': 'endless', onclick: () => ui.afterResults(data, 'endless') }, `∞ ${t('results.toEndless')}`) : null,
    h('button', { class: `mk-btn${(won && data.nextLevel) || finale ? '' : ' primary big'}`, 'data-action': 'retry', onclick: () => ui.afterResults(data, 'retry') }, `↻ ${won || endless ? t('results.replay') : t('results.retry')}`),
    // A won night offers its Chef's Challenge (a replay with a restricted kit for a fourth star) until that star is won.
    won && !data.challenge && mode === 'campaign' && challengeOpen(ui.save, level.id) && !ui.save.challenges.includes(level.id)
      ? h('button', { class: 'mk-btn', 'data-action': 'challenge', onclick: () => ui.afterResults(data, 'challenge') }, `♛ ${t('ch.title')}`) : null,
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
