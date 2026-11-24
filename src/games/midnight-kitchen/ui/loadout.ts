import { DEFENDERS, ENDLESS_LEVEL, ENEMIES, levelById, RECIPES } from '../data';
import * as ENDLESS from '../data/endless';
import { clock, type Key } from '../i18n';
import { spriteIcon } from '../render/sprites';
import { CRUMBS_CHEF, grannyOffered } from '../save';
import type { BonusGoal, DefenderDef, Difficulty, EnemyDef, LevelDef } from '../types';
import type { Screen, UiContext } from './context';
import { h, head } from './dom';

export function bonusText(ui: UiContext, goal: BonusGoal): string {
  const { t } = ui.i18n;
  switch (goal.kind) {
    case 'maxDefenders': return t('bonus.maxDefenders', { n: goal.n });
    case 'noRemove': return t('bonus.noRemove');
    case 'noDefenderLost': return t('bonus.noDefenderLost');
    case 'recipes': return t('bonus.recipes', { n: goal.n });
    case 'tier3': return t('bonus.tier3', { n: goal.n });
    case 'heatBank': return t('bonus.heatBank', { n: goal.n });
    case 'timeUnder': return t('bonus.timeUnder', { t: clock(goal.seconds) });
    default: return '';
  }
}

/** Enemy ids a level's script can send, in first-appearance order. */
export function visitors(level: LevelDef): string[] {
  const ids: string[] = [];
  for (const wave of level.waves) for (const spawn of wave.spawns) if (!ids.includes(spawn[1])) ids.push(spawn[1]);
  return ids;
}

const attacks = (def: DefenderDef) => def.tiers.map(tier => tier.attack);
/** How well a defender answers a pest, 0..3. Read from the data, so new rows rate themselves. */
function answers(def: DefenderDef, enemy: EnemyDef): number {
  let score = 0;
  for (const a of attacks(def)) {
    if (enemy.flying && ((a.kind === 'shoot' && a.hitsFlying) || a.kind === 'burst' || a.kind === 'cone')) score = Math.max(score, 3);
    if (enemy.shield && (a.kind === 'lob' || a.kind === 'lanefire' || a.kind === 'cone')) score = Math.max(score, 2);
    if ((enemy.armor || enemy.hp >= 300) && (a.kind === 'lanefire' || ('damage' in a && a.damage >= 40))) score = Math.max(score, 2);
    if ((enemy.slime || enemy.moldOnDeath) && 'tag' in a && enemy.weak && (enemy.weak[a.tag] ?? 1) > 1) score = Math.max(score, 3);
    if (enemy.speed >= 0.33 && a.kind === 'shoot' && a.effects?.some(e => e.kind === 'slow')) score = Math.max(score, 2);
  }
  return score;
}
/** A suggested hand: Heat first, tonight's new cards, answers to tonight's pests, a wall, then the strongest rest. */
export function recommend(level: LevelDef, pool: string[]): string[] {
  const pests = visitors(level).map(id => ENEMIES[id]).filter((def): def is EnemyDef => !!def);
  const fresh = new Set(level.introduces?.defenders ?? []);
  const scored = pool.filter(id => DEFENDERS[id]).map(id => {
    const def = DEFENDERS[id];
    let score = def.role === 'generator' ? 100 : 0;
    if (fresh.has(id)) score += 40;
    score += pests.reduce((sum, pest) => sum + answers(def, pest) * (pest.boss ? 2 : 1), 0) * 4;
    if (def.role === 'wall') score += 14;
    if (def.role === 'shooter') score += 12;
    score += Math.min(10, def.cost / 20);
    return { id, score };
  }).sort((a, b) => b.score - a.score);
  return scored.slice(0, level.slots).map(item => item.id);
}

function endlessPanel(ui: UiContext): HTMLElement {
  const { t } = ui.i18n, best = ui.save.endless, tuning = (ENDLESS as unknown as { ENDLESS_TUNING?: { bossEvery?: number } }).ENDLESS_TUNING;
  const rules: string[] = [t('endless.rule1'), t('endless.rule2', { n: tuning?.bossEvery ?? 10 }), t('endless.rule3')];
  return h('div', { class: 'mk-panel', 'data-endless': '' },
    h('h3', null, '∞ ', t('endless.records')),
    h('div', { class: 'mk-records' },
      h('div', { class: 'mk-record' }, h('b', null, String(best.bestWave || '–')), h('small', null, t('endless.bestWave'))),
      h('div', { class: 'mk-record' }, h('b', null, String(best.bestScore || '–')), h('small', null, t('endless.bestScore'))),
      h('div', { class: 'mk-record' }, h('b', null, String(best.runs ?? 0)), h('small', null, t('endless.runs')))),
    h('ul', { class: 'mk-rules' }, rules.map(rule => h('li', null, rule))));
}

const DIFFICULTIES: Difficulty[] = ['gentle', 'standard', 'chef'];
/** Three-way difficulty switch with a line that says what the current one changes. */
export function difficultyPicker(ui: UiContext, onChange?: () => void): HTMLElement {
  const { t } = ui.i18n;
  const hint = h('p', { class: 'mk-diff-hint', role: 'status' });
  const buttons = DIFFICULTIES.map(d => h('button', { 'data-difficulty': d, 'aria-pressed': String(ui.save.difficulty === d), onclick: () => { ui.setDifficulty(d); sync(); onChange?.(); } }, t(`diff.${d}` as Key)));
  const sync = () => {
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(DIFFICULTIES[i] === ui.save.difficulty)));
    hint.textContent = t(`diff.${ui.save.difficulty}Hint` as Key, { n: CRUMBS_CHEF });
  };
  sync();
  return h('div', { class: 'mk-diff', 'data-diff': '' },
    h('div', { class: 'mk-eyebrow' }, t('diff.label')),
    h('div', { class: 'mk-lang mk-diff-switch', role: 'group', 'aria-label': t('diff.label') }, buttons), hint);
}

/** Granny's offer: pick one card of the hand to arrive free at tier 2 (one-shots cannot be raised, so they are left out). */
function grannyPanel(ui: UiContext, hand: () => string[], picked: { gift: string | null }): HTMLElement {
  const { t, tr } = ui.i18n;
  const row = h('div', { class: 'mk-granny-cards' }), note = h('p', { class: 'mk-granny-note', role: 'status' });
  const render = () => {
    const options = hand().filter(id => (DEFENDERS[id]?.tiers.length ?? 0) > 1);
    if (picked.gift && !options.includes(picked.gift)) picked.gift = null;
    row.replaceChildren(...options.map(id => h('button', { class: 'mk-pick small', 'data-gift': id, 'aria-pressed': String(picked.gift === id), 'aria-label': tr(DEFENDERS[id].name),
      onclick: () => { picked.gift = picked.gift === id ? null : id; ui.audio.sfx('select'); render(); } }, spriteIcon('defender', id, 40), h('b', null, tr(DEFENDERS[id].name)))),
      h('button', { class: 'mk-btn small ghost', 'data-gift': '', 'aria-pressed': String(!picked.gift), onclick: () => { picked.gift = null; render(); } }, t('granny.none')));
    note.textContent = picked.gift ? t('granny.chosen', { name: tr(DEFENDERS[picked.gift].name) }) : '';
  };
  render();
  const panel = h('div', { class: 'mk-panel paper mk-granny', 'data-granny': '' },
    h('div', { class: 'mk-granny-head' }, spriteIcon('character', 'granny', 52), h('div', null, h('h3', null, t('granny.title')), h('p', null, t('granny.text')))), row, note);
  (panel as HTMLElement & { refresh?: () => void }).refresh = render;
  return panel;
}

/** Briefing and hand picker. With a fixed hand (tutorial) or fewer cards than slots it is just a briefing. */
export const loadoutScreen: Screen = (ui, params) => {
  const { t, tr } = ui.i18n, level = levelById(params.level ?? '');
  if (!level) return h('div', { class: 'mk-screen', 'data-screen': 'loadout' });
  const endless = level.id === ENDLESS_LEVEL.id;
  const fixed = !!level.cards, pool = fixed ? level.cards!.filter(id => DEFENDERS[id]) : ui.save.owned.filter(id => DEFENDERS[id]);
  const choosing = !fixed && pool.length > level.slots;
  const suggested = recommend(level, pool);
  const remembered = ui.save.loadout.filter(id => pool.includes(id));
  let chosen = !choosing ? [...pool] : [...new Set([...(level.introduces?.defenders ?? []).filter(id => pool.includes(id)), ...remembered, ...suggested])].slice(0, level.slots);
  const ordered = () => pool.filter(id => chosen.includes(id));
  const fresh = new Set(level.introduces?.defenders ?? []), rec = new Set(choosing ? suggested : []);
  const counter = h('span', { class: 'mk-chip' }), note = h('p', { role: 'status', 'aria-live': 'polite' });
  const recipeList = h('div', { class: 'mk-recipe-hints' });
  const granny = !endless && grannyOffered(ui.save, level.id), picked: { gift: string | null } = { gift: null };
  const start = h('button', { class: 'mk-btn primary big', 'data-action': 'start', onclick: () => ui.startNight(level.id, ordered(), granny && picked.gift ? picked.gift : undefined) }, endless ? t('endless.start') : t('loadout.start'));
  const buttons = pool.map(id => {
    const def = DEFENDERS[id];
    return h('button', { class: `mk-pick${rec.has(id) ? ' rec' : ''}`, 'data-card': id, 'aria-pressed': String(chosen.includes(id)), 'aria-label': `${tr(def.name)}, ${def.cost}. ${tr(def.desc)}`, title: tr(def.desc), onclick: () => {
      if (!choosing) { note.textContent = tr(def.desc); return; }
      if (chosen.includes(id)) chosen = chosen.filter(other => other !== id);
      else if (chosen.length < level.slots) chosen.push(id);
      else { note.textContent = t('loadout.full'); ui.audio.sfx('deny'); return; }
      ui.audio.sfx('select'); sync();
      grannyBox?.refresh?.();
      note.textContent = tr(def.desc);
    } }, fresh.has(id) ? h('i', { class: 'mk-tagnew' }, t('common.new')) : null, spriteIcon('defender', id, 60), h('b', null, tr(def.name)),
      h('span', { class: 'mk-role' }, t(`role.${def.role}` as Key)), h('span', { class: 'mk-cost' }, `♨ ${def.cost}`));
  });
  const sync = () => {
    buttons.forEach((button, index) => button.setAttribute('aria-pressed', String(chosen.includes(pool[index]))));
    counter.textContent = t('loadout.slots', { n: chosen.length, max: Math.min(level.slots, pool.length) });
    start.disabled = chosen.length === 0;
    if (chosen.length === 0) note.textContent = t('loadout.need');
    // Recipes this hand can cook: names for the ones in the Cookbook, a teaser for the rest.
    const hand = new Set(chosen), possible = RECIPES.filter(recipe => recipe.parts.every(part => hand.has(part)));
    // Known ones by name; the undiscovered ones fold into a single teaser line so the list stays short.
    const known = possible.filter(recipe => ui.save.cookbook.recipes.includes(recipe.id)), secret = possible.length - known.length;
    recipeList.replaceChildren(...known.map(recipe => h('div', { class: 'mk-recipe-hint' }, h('span', { class: 'mk-parts' }, recipe.parts.map(part => spriteIcon('defender', part, 34))), h('span', null, tr(recipe.name)))),
      ...(secret ? [h('div', { class: 'mk-recipe-hint secret' }, h('span', { class: 'mk-secret-ico', 'aria-hidden': 'true' }, '?'), h('span', null, secret === 1 ? t('loadout.secret') : t('loadout.secrets', { n: secret })))] : []),
      ...(possible.length ? [] : [h('p', null, t('loadout.noRecipes'))]));
  };
  sync();
  const grannyBox = granny ? grannyPanel(ui, ordered, picked) as HTMLElement & { refresh?: () => void } : null;
  const seen = visitors(level), newEnemies = new Set(level.introduces?.enemies ?? []);
  const facts = endless ? [] : [t('loadout.waves', { n: level.waves.length }), t('loadout.lanes', { n: (level.activeLanes ?? Array.from({ length: level.lanes })).length }), t('loadout.heat', { n: level.startHeat }), t('loadout.slicesFact', { n: level.slices })];
  const brief = h('div', { class: 'mk-panel paper' },
    h('div', { class: 'mk-eyebrow' }, endless ? '∞' : level.boss ? `${t('map.chapter', { n: level.chapter })} · ${t('map.boss')}` : `${t('map.chapter', { n: level.chapter })} · ${t('map.level', { n: level.index })}`),
    h('p', { class: 'mk-lead', style: 'margin-top:4px' }, tr(level.blurb)),
    facts.length ? h('div', { class: 'mk-facts' }, facts.map(fact => h('span', { class: 'mk-chip' }, fact))) : null,
    endless ? null : h('div', { class: 'mk-goal', style: 'color:var(--ink);background:rgba(255,180,84,.18);border-color:rgba(181,101,13,.5)' }, `${t('loadout.bonus')}: ${bonusText(ui, level.bonus)}`),
    // What the chosen hand can cook sits on the briefing card, next to the goal, so it updates in view while picking.
    endless ? null : h('div', { class: 'mk-brief-recipes' }, h('div', { class: 'mk-eyebrow' }, t('loadout.recipes')), recipeList),
    endless ? null : difficultyPicker(ui));
  const pests = seen.length ? h('div', { class: 'mk-panel' }, h('h3', null, t('loadout.visitors')),
    h('div', { class: 'mk-visitors' }, seen.map(id => {
      const def = ENEMIES[id];
      if (!def) return null;
      const known = ui.save.cookbook.enemies.includes(id) || newEnemies.has(id);
      return h('div', { class: 'mk-visitor' }, newEnemies.has(id) ? h('i', { class: 'mk-tagnew' }, t('common.new')) : null, spriteIcon('enemy', id, 48, {}, !known),
        h('div', null, h('b', null, known ? tr(def.name) : '???'), newEnemies.has(id) ? h('em', null, tr(def.desc)) : null));
    }))) : null;
  const picker = h('div', { class: 'mk-panel' },
    h('div', { class: 'mk-row', style: 'margin-bottom:10px' }, h('h3', { class: 'mk-grow', style: 'margin:0' }, choosing ? t('loadout.pick') : t('loadout.fixed')), counter,
      choosing ? h('button', { class: 'mk-btn small ghost', 'data-action': 'suggest', onclick: () => { chosen = [...suggested]; ui.audio.sfx('select'); sync(); note.textContent = t('loadout.suggested'); } }, `✦ ${t('loadout.suggest')}`) : null),
    h('div', { class: 'mk-picks' }, buttons),
    endless ? h('div', { style: 'margin-top:10px' }, h('div', { class: 'mk-eyebrow' }, t('loadout.recipes')), recipeList) : null);
  // On a wide stage the picker and Start form a sticky right column (both always in view); on a phone that wrapper
  // dissolves (display:contents) so Start stays a sticky bar across the whole screen.
  return h('div', { class: 'mk-screen', 'data-screen': 'loadout' },
    head(ui, tr(level.name), () => ui.go(endless ? 'title' : 'map', endless ? {} : { chapter: level.chapter })),
    h('div', { class: 'mk-body mk-loadout' },
      h('div', { class: 'mk-brief' }, brief, grannyBox, endless ? endlessPanel(ui) : pests),
      endless ? pests : null,
      h('div', { class: 'mk-loadout-side' }, picker, h('div', { class: 'mk-loadout-foot' }, note, start))));
};
