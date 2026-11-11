import { DEFENDER_LIST, DEFENDERS, ENEMY_LIST, LEVEL_LIST, RECIPES } from '../data';
import type { Key } from '../i18n';
import { spriteIcon } from '../render/sprites';
import { SCENES } from '../story';
import type { EnemyDef } from '../types';
import type { Screen } from './context';
import { h, head } from './dom';
import { tierStats } from './stats';

/** Short trait chips derived from an enemy row, so new enemies describe themselves. */
export function enemyTraits(def: EnemyDef): Key[] {
  const out: Key[] = [];
  if (def.boss) out.push('trait.boss');
  if (def.flying) out.push('trait.flying');
  if (def.shield) out.push('trait.shield');
  if (def.armor && !def.boss) out.push('trait.armor');
  if (def.speed >= 0.33) out.push('trait.fast'); else if (def.speed <= 0.12 && !def.boss) out.push('trait.slow');
  if (def.hp >= 400 && !def.boss) out.push('trait.tank');
  if (def.slime) out.push('trait.slime');
  if (def.moldOnDeath) out.push('trait.mold');
  if (def.burrow) out.push('trait.burrow');
  if (def.thief) out.push('trait.thief');
  return out;
}

const TABS = ['defenders', 'enemies', 'recipes', 'stories'] as const;
type Tab = typeof TABS[number];

/** Cookbook: everyone met so far, every Recipe discovered (hints for the rest), and the story scenes to replay. */
export const cookbookScreen: Screen = (ui, params) => {
  const { t, tr } = ui.i18n, book = ui.save.cookbook, back = params.from ?? 'title';
  const list = h('div', { class: 'mk-entries', role: 'tabpanel' });
  const tabButtons = TABS.map(tab => h('button', { role: 'tab', 'data-tab': tab, onclick: () => show(tab) }, ''));
  // Story scenes in campaign order: intro and outro of every level.
  const stories = LEVEL_LIST.flatMap(level => [level.intro, level.outro].filter((id): id is string => !!id && !!SCENES[id]).map(id => ({ id, level })));
  const show = (tab: Tab) => {
    tabButtons.forEach((button, index) => button.setAttribute('aria-selected', String(TABS[index] === tab)));
    list.replaceChildren();
    list.className = tab === 'stories' ? 'mk-lore' : 'mk-entries';
    if (tab === 'defenders') for (const def of DEFENDER_LIST) {
      const known = book.defenders.includes(def.id);
      list.append(h('div', { class: `mk-entry${known ? '' : ' unknown'}`, 'data-entry': def.id }, spriteIcon('defender', def.id, 76, { tier: 0 }, !known),
        h('div', { class: 'mk-grow' }, h('h4', null, known ? tr(def.name) : '???'),
          known ? h('div', { class: 'mk-chips' }, h('span', { class: 'mk-chip' }, t(`role.${def.role}` as Key)), h('span', { class: 'mk-chip' }, `♨ ${def.cost}`), def.tiers.length > 1 ? h('span', { class: 'mk-chip' }, '★★★') : null) : null,
          h('p', null, known ? tr(def.desc) : t('cookbook.unknown')),
          known ? h('div', { class: 'mk-stats-mini' }, tierStats(ui.i18n, def, 0).map(line => h('span', null, `${line.label} `, h('b', null, line.value)))) : null)));
    }
    if (tab === 'enemies') for (const def of ENEMY_LIST) {
      const known = book.enemies.includes(def.id);
      list.append(h('div', { class: `mk-entry${known ? '' : ' unknown'}`, 'data-entry': def.id }, spriteIcon('enemy', def.id, 76, {}, !known),
        h('div', { class: 'mk-grow' }, h('h4', null, known ? tr(def.name) : '???'),
          known ? h('div', { class: 'mk-chips' }, enemyTraits(def).map(key => h('span', { class: 'mk-chip' }, t(key)))) : null,
          h('p', null, known ? tr(def.desc) : t('cookbook.unknownPest')),
          known ? h('div', { class: 'mk-stats-mini' }, h('span', null, `${t('stat.hp')} `, h('b', null, String(def.hp))), h('span', null, `${t('stat.bite')} `, h('b', null, String(def.damage)))) : null)));
    }
    if (tab === 'recipes') for (const recipe of RECIPES) {
      const known = book.recipes.includes(recipe.id);
      const ownsAll = recipe.parts.every(part => ui.save.owned.includes(part));
      const parts = h('div', { class: 'mk-recipe-parts', 'aria-hidden': 'true' });
      // Unknown recipes reveal their first ingredient, so there is always something to try.
      recipe.parts.forEach((id, index) => { if (index) parts.append(h('span', null, '+')); parts.append(spriteIcon('defender', id, 44, {}, !known && index > 0)); });
      const first = DEFENDERS[recipe.parts[0]];
      list.append(h('div', { class: `mk-entry${known ? '' : ' unknown'}`, 'data-entry': recipe.id }, parts,
        known ? h('span', { class: 'mk-recipe-swatch', style: `background:${recipe.color}` }) : null,
        h('div', { class: 'mk-grow' }, h('h4', null, known ? tr(recipe.name) : '???'),
          h('p', null, known ? tr(recipe.desc) : ownsAll ? t('cookbook.recipeHint', { name: first ? tr(first.name) : '?', n: recipe.parts.length }) : t('cookbook.recipeLocked')),
          // CONTENT's cryptic clue, so an undiscovered Recipe always gives the player something to chew on.
          !known && recipe.clue ? h('p', { class: 'mk-clue' }, `“${tr(recipe.clue)}”`) : null)));
    }
    if (tab === 'stories') {
      if (!stories.length) list.append(h('p', null, t('cookbook.noStories')));
      for (const { id, level } of stories) {
        const scene = SCENES[id], seen = ui.save.scenes.includes(id), outro = level.outro === id;
        const first = scene.lines[0];
        list.append(h('div', { class: `mk-lore-item${seen ? '' : ' locked'}`, 'data-scene': id },
          spriteIcon('character', seen ? first?.who ?? 'pip' : 'pip', 56, { mood: first?.mood }, !seen),
          h('div', { class: 'mk-grow' }, h('div', { class: 'mk-eyebrow' }, `${t('map.chapter', { n: level.chapter })} · ${level.index} · ${outro ? t('cookbook.after') : t('cookbook.before')}`),
            h('b', null, tr(level.name)), seen && first ? h('q', null, tr(first.text)) : h('q', null, t('cookbook.storyLocked'))),
          seen ? h('button', { class: 'mk-btn small paper', 'data-action': 'replay', 'aria-label': `${t('cookbook.replay')}: ${tr(level.name)}`, onclick: () => ui.replayScene(id, 'cookbook', { from: back, tab: 'stories' }) }, `▶ ${t('cookbook.replay')}`) : null));
      }
    }
  };
  const counts: Record<Tab, [number, number]> = {
    defenders: [book.defenders.filter(id => DEFENDERS[id]).length, DEFENDER_LIST.length], enemies: [book.enemies.filter(id => ENEMY_LIST.some(e => e.id === id)).length, ENEMY_LIST.length],
    recipes: [book.recipes.filter(id => RECIPES.some(r => r.id === id)).length, RECIPES.length], stories: [stories.filter(s => ui.save.scenes.includes(s.id)).length, stories.length]
  };
  tabButtons.forEach((button, index) => { const tab = TABS[index]; button.replaceChildren(t(`cookbook.${tab}` as Key), h('small', null, `${counts[tab][0]}/${counts[tab][1]}`)); });
  show((TABS as readonly string[]).includes(params.tab ?? '') ? params.tab as Tab : 'defenders');
  return h('div', { class: 'mk-screen', 'data-screen': 'cookbook' }, head(ui, t('cookbook.title'), () => ui.go(back)),
    h('div', { class: 'mk-body' }, h('div', { class: 'mk-tabs', role: 'tablist', 'aria-label': t('cookbook.title') }, tabButtons), list));
};
