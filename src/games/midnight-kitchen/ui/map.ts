import { CHAPTERS, ENDLESS_LEVEL, ENDLESS_UNLOCK, LEVELS, META_UPGRADES, RECIPES } from '../data';
import { canBuy, isUnlocked, starsOf, totalStars, type Save } from '../save';
import type { ChapterDef, LevelDef, Loc } from '../types';
import type { Screen } from './context';
import { crumbs, h, head, starPurse, stars } from './dom';
import { continueLevel } from './title';

/** Two-stop gradient per chapter backdrop, for chapter tabs and the hero panel. */
const PALETTE: Record<string, [string, string]> = {
  countertop: ['#9a6332', '#3a2a3f'], sink: ['#2f7a96', '#1d2f50'], stove: ['#b24a2c', '#3a1a28'], pantry: ['#7a7a36', '#2e2a1e'], fridge: ['#5aa8c8', '#1d3a5a']
};

export type ChapterView = {
  id: number; name: Loc; blurb: Loc | null; backdrop: string; levels: LevelDef[];
  state: 'open' | 'locked'; stars: number; total: number; cleared: boolean; fresh: boolean;
};

/** The chapter list as the map shows it, straight from the chapter table (pure, so it can be tested with any table). */
export function chapterModel(save: Save, chapters: ChapterDef[] = CHAPTERS, levels: Record<string, LevelDef> = LEVELS, seen: (id: string) => boolean = () => true): ChapterView[] {
  const out: ChapterView[] = [];
  for (const chapter of chapters) {
    const rows = chapter.levels.map(id => levels[id]).filter((level): level is LevelDef => !!level);
    if (!rows.length) continue;
    const got = rows.reduce((sum, level) => sum + starsOf(save.levels[level.id]), 0), open = isUnlocked(save, rows[0].id);
    out.push({ id: chapter.id, name: chapter.name, blurb: chapter.blurb, backdrop: chapter.backdrop, levels: rows, state: open ? 'open' : 'locked', stars: got, total: rows.length * 3,
      cleared: rows.every(level => save.levels[level.id]?.win), fresh: open && !rows.some(level => save.levels[level.id]?.win) && !seen(`chapter:${chapter.id}`) && chapter.id > 1 });
  }
  return out.sort((a, b) => a.id - b.id);
}

const paint = (backdrop: string) => { const [a, b] = PALETTE[backdrop] ?? PALETTE.countertop; return `--ch1:${a};--ch2:${b}`; };

/** Chapter map: the five kitchens as tabs, the chosen one's levels as a path of recipe cards, then the side doors. */
export const mapScreen: Screen = (ui, params) => {
  const { t, tr } = ui.i18n, save = ui.save;
  const model = chapterModel(save, CHAPTERS, LEVELS, id => save.coach.seen.includes(id));
  const current = continueLevel(ui), currentChapter = LEVELS[current]?.chapter ?? 1;
  const chosen = model.find(chapter => chapter.id === params.chapter) ?? model.find(chapter => chapter.id === currentChapter && chapter.state === 'open') ?? model.find(chapter => chapter.state === 'open') ?? model[0];

  const tabs = h('div', { class: 'mk-chapters', role: 'tablist', 'aria-label': t('map.chapters') }, model.map(chapter => {
    const label = chapter.state === 'locked' ? `🔒 ${t('map.tabLocked')}` : `★ ${chapter.stars}/${chapter.total}`;
    return h('button', { class: `mk-chapter${chapter.state === 'locked' ? ' locked' : ''}`, role: 'tab', 'aria-selected': String(chapter === chosen), 'data-chapter': String(chapter.id), style: paint(chapter.backdrop),
      onclick: () => ui.go('map', { chapter: chapter.id }) },
      chapter.fresh ? h('i', { class: 'mk-tagnew' }, t('common.new')) : null,
      h('small', null, t('map.chapter', { n: chapter.id })), h('b', null, tr(chapter.name)), h('small', null, label));
  }));
  if (chosen.fresh) ui.markSeen(`chapter:${chosen.id}`);
  // On a phone the tab strip scrolls: bring the chosen chapter into view once the screen is laid out.
  queueMicrotask(() => {
    const tab = tabs.querySelector<HTMLElement>('[aria-selected=true]');
    if (tab && tabs.scrollWidth > tabs.clientWidth) tabs.scrollLeft = Math.max(0, tab.offsetLeft - tabs.offsetLeft - (tabs.clientWidth - tab.offsetWidth) / 2);
  });

  const hero = h('div', { class: 'mk-panel mk-chapter-hero', style: paint(chosen.backdrop) },
    h('div', { class: 'mk-hero-num', 'aria-hidden': 'true' }, String(chosen.id)),
    h('div', { class: 'mk-grow' },
      h('div', { class: 'mk-eyebrow' }, t('map.chapter', { n: chosen.id })), h('h3', null, tr(chosen.name)),
      h('p', null, chosen.state === 'locked' ? t('map.chapterLocked', { n: chosen.id - 1 }) : chosen.blurb ? tr(chosen.blurb) : '')),
    chosen.state === 'open' ? h('span', { class: 'mk-chip' }, `★ ${chosen.stars}/${chosen.total}`) : null,
    chosen.fresh ? h('span', { class: 'mk-ribbon', 'aria-hidden': 'true' }, t('map.newChapter')) : null);

  const path = h('div', { class: 'mk-path', 'data-chapter-levels': String(chosen.id) });
  for (const level of chosen.levels) {
    const open = isUnlocked(save, level.id), got = starsOf(save.levels[level.id]);
    path.append(h('button', { class: `mk-node${level.boss ? ' boss' : ''}${level.id === current && open ? ' current' : ''}`, 'data-level': level.id, disabled: !open,
      'aria-label': `${level.boss ? t('map.boss') : t('map.level', { n: level.index })}: ${tr(level.name)}. ${open ? `${got}/3 ★` : t('map.locked')}`, onclick: () => ui.openLevel(level.id) },
      h('span', { class: 'mk-node-num', 'aria-hidden': 'true' }, level.boss ? '♛' : String(level.index)),
      h('b', null, tr(level.name)),
      open ? stars(got) : h('em', null, `🔒 ${t('map.locked')}`)));
  }

  const endlessOpen = !!save.levels[ENDLESS_UNLOCK]?.win, shopReady = META_UPGRADES.some(upgrade => canBuy(save, upgrade));
  const extra = h('div', { class: 'mk-map-extra' },
    h('button', { class: 'mk-door endless', 'data-level': ENDLESS_LEVEL.id, disabled: !endlessOpen, onclick: () => ui.openLevel(ENDLESS_LEVEL.id) },
      h('span', { class: 'mk-door-ico', 'aria-hidden': 'true' }, '∞'),
      h('span', null, h('b', null, tr(ENDLESS_LEVEL.name)), h('small', null, !endlessOpen ? `🔒 ${t('map.endlessLocked', { n: LEVELS[ENDLESS_UNLOCK]?.index ?? 3 })}` : save.endless.bestScore ? t('map.endlessBest', { score: save.endless.bestScore, wave: save.endless.bestWave }) : t('map.endlessNew')))),
    h('button', { class: 'mk-door', 'data-action': 'cookbook', onclick: () => ui.go('cookbook', { from: 'map' }) },
      h('span', { class: 'mk-door-ico', 'aria-hidden': 'true' }, '✎'), h('span', null, h('b', null, t('title.cookbook')), h('small', null, `${t('cookbook.recipes')} ${save.cookbook.recipes.length}/${RECIPES.length}`))),
    h('button', { class: 'mk-door', 'data-action': 'shop', onclick: () => ui.go('shop', { from: 'map' }) },
      h('span', { class: 'mk-door-ico', 'aria-hidden': 'true' }, '▲'), h('span', null, h('b', null, t('title.shop')), h('small', null, shopReady ? t('map.shopReady') : `${save.crumbs} ${t('common.crumbs')}`)),
      shopReady ? h('i', { class: 'mk-tagnew' }, '!') : null));

  return h('div', { class: 'mk-screen', 'data-screen': 'map' },
    head(ui, t('map.title'), () => ui.go('title'), starPurse(ui, totalStars(save)), crumbs(ui),
      h('button', { class: 'mk-icon-btn', 'data-action': 'settings', 'aria-label': t('title.settings'), title: t('title.settings'), onclick: () => ui.go('settings', { from: 'map' }) }, h('span', { class: 'mk-gear', 'aria-hidden': 'true' }, '⚙'))),
    h('div', { class: 'mk-body' }, tabs, hero, path, extra));
};
