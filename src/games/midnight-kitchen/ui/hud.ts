import type { Audio } from '../audio';
import type { I18n, Key } from '../i18n';
import type { BoardLayout } from '../render/layout';
import { spriteIcon } from '../render/sprites';
import { flame } from '../render/sprites/kit';
import type { DenyReason, Session } from '../session';
import { enemyDef, refundFor, upgradeCost, waveProgress } from '../sim';
import { CHARACTERS } from '../story';
import type { SimEvent } from '../types';
import { createCoach, type Coach, type CoachStore } from './coach';
import { h } from './dom';
import { tierStats, upgradeDiff } from './stats';

/**
 * In-level HUD, all DOM on top of the canvas.
 *
 * Top bar: Heat (with +/- floaters), the wave bar (big-wave and boss markers), Endless score, cake slices, speed,
 * pause. Under it: the boss bar while a boss is on the counter, then ONE banner slot (wave warnings, recipes).
 * Bottom, just above the hand: ONE message slot (refusals > barks), so nothing ever stacks over the middle of the
 * board. The hand: card art, cost, a radial cooldown sweep with seconds, affordability, "new" badges, a hover /
 * long-press info card with stats. Floating over the board: the tap-a-defender popover (upgrade before -> after,
 * remove with refund), the placement chip (why not / which Recipe it would cook), recipe toasts, the drag ghost
 * and the coach marks. `update` runs every frame and only touches the DOM when a value actually changed.
 */
export type Hud = {
  element: HTMLElement;
  update(layout: BoardLayout | null): void;
  onEvent(event: SimEvent): void;
  deny(reason: DenyReason): void;
  tick(dt: number): void;
  /** Centre of the Heat counter relative to the stage, where embers fly to. */
  heatAnchor(): { x: number; y: number };
  /** Space the HUD covers, so the board can be laid out around it. */
  insets(): { top: number; right: number; bottom: number; left: number };
  /** Card info card: show for a card element (hover / long-press), or hide with null. */
  info(def: string | null): void;
  /** Touch drag ghost at client coordinates, or null to hide it. */
  drag(state: { def: string; x: number; y: number } | null): void;
  /** Short "selected: Pepper Mill · 100" note when a card is picked by key or pad. */
  announceCard(def: string | null): void;
};
export type HudActions = { pause(): void; toggleSpeed(): void };
export type HudDeps = { i18n: I18n; audio: Audio; touch: boolean; coach: CoachStore };

function iconCanvas(size: number, paint: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const canvas = document.createElement('canvas'), ratio = Math.min(3, (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) || 1);
  canvas.width = canvas.height = Math.round(size * ratio); canvas.style.width = canvas.style.height = `${size}px`; canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (ctx) { ctx.scale(canvas.width / 100, canvas.height / 100); paint(ctx); }
  return canvas;
}
export const flameIcon = (size: number) => iconCanvas(size, ctx => { ctx.translate(50, 92); flame(ctx, 0, 0, 56, 0); });
const spatulaIcon = (size: number) => iconCanvas(size, ctx => {
  ctx.translate(50, 50); ctx.rotate(0.6); ctx.lineJoin = 'round'; ctx.strokeStyle = '#2a1a12'; ctx.lineWidth = 6;
  ctx.fillStyle = '#b8743f'; ctx.beginPath(); ctx.roundRect(-6, 0, 12, 44, 5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e3e6ee'; ctx.beginPath(); ctx.roundRect(-18, -42, 36, 44, 7); ctx.fill(); ctx.stroke();
  ctx.lineWidth = 4; for (const x of [-7, 0, 7]) { ctx.beginPath(); ctx.moveTo(x, -34); ctx.lineTo(x, -12); ctx.stroke(); }
});
const SVG_NS = 'http://www.w3.org/2000/svg';
const svgIcon = (paths: string): SVGSVGElement => {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20'); svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = paths;
  return svg;
};
const PAUSE_ICON = '<rect x="4" y="3" width="4.5" height="14" rx="1.5" fill="currentColor"/><rect x="11.5" y="3" width="4.5" height="14" rx="1.5" fill="currentColor"/>';

/**
 * Centre y for a new floating label of size `w` x `h` at (`x`, `y`) so it clears every label already on screen
 * (`taken`, centre-based boxes): it steps up by one label height until it no longer overlaps any of them.
 */
export function stackLabel(taken: { x: number; y: number; w: number; h: number }[], x: number, y: number, w: number, h: number): number {
  const gap = 4;
  for (let guard = 0; guard < 8; guard++) {
    const hit = taken.find(box => Math.abs(box.x - x) < (box.w + w) / 2 && Math.abs(box.y - y) < (box.h + h) / 2 + gap);
    if (!hit) return y;
    y = hit.y - (hit.h + h) / 2 - gap;
  }
  return y;
}

export function createHud(root: HTMLElement, deps: HudDeps, session: Session, actions: HudActions): Hud {
  const { i18n } = deps, { t, tr } = i18n, sim = session.sim, view = session.view, level = sim.level;
  const endless = !Number.isFinite(sim.totalWaves);
  const fresh = new Set(level.introduces?.defenders ?? []);

  // ---- top bar ----
  const heatValue = h('b', null, String(sim.heat));
  const heat = h('div', { class: 'mk-heat', role: 'status', 'aria-live': 'off', 'aria-label': `${t('hud.heat')} ${sim.heat}`, 'data-hud': 'heat' }, flameIcon(30), heatValue);
  const fill = h('div', { class: 'mk-waves-fill' }), label = h('span', { class: 'mk-waves-label' }, t('hud.ready'));
  const flags: HTMLElement[] = [], marks: { el: HTMLElement; wave: number }[] = [];
  if (!endless) level.waves.forEach((wave, index) => {
    if (index > 0) flags.push(h('i', { class: `mk-flag${wave.big ? ' big' : ''}`, style: `left:${index / level.waves.length * 100}%` }));
    const boss = !!level.boss && index === level.waves.length - 1;
    if (wave.big || boss) marks.push({ wave: index, el: h('i', { class: `mk-mark${boss ? ' boss' : ''}`, style: `left:${Math.max(4, index / level.waves.length * 100)}%`, title: boss ? t('hud.bossWave') : t('hud.bigWave') }, boss ? '♛' : '!') });
  });
  const waves = h('div', { class: 'mk-waves', role: 'progressbar', 'aria-label': t('hud.waves'), 'aria-valuemin': '0', 'aria-valuemax': '100', 'data-hud': 'waves' },
    h('div', { class: 'mk-waves-track' }, fill, flags, label), marks.map(mark => mark.el));
  const sliceIcons = Array.from({ length: sim.maxSlices }, () => h('i', { class: 'mk-slice' }));
  const slices = h('div', { class: 'mk-slices', role: 'status', 'data-hud': 'cake' }, sliceIcons);
  const scoreValue = h('b', null, '0');
  const score = h('div', { class: 'mk-score', hidden: !endless, 'aria-label': t('hud.score') }, scoreValue, h('small', null, t('hud.score')));
  const speed = h('button', { class: 'mk-icon-btn', 'data-action': 'speed', 'aria-label': t('hud.speed'), title: `${t('hud.speed')} (F)`, onclick: () => actions.toggleSpeed() }, '×1');
  const pause = h('button', { class: 'mk-icon-btn', 'data-action': 'pause-game', 'aria-label': t('hud.pause'), title: `${t('hud.pause')} (P)`, onclick: () => actions.pause() }, svgIcon(PAUSE_ICON));
  // ---- boss bar: takes the wave bar's place while a boss is on the counter ----
  const bossName = h('b'), bossFill = h('i'), bossPips = h('span', { class: 'mk-pips', 'aria-hidden': 'true' }), bossFace = h('span');
  const bossTicks = h('span');
  const boss = h('div', { class: 'mk-boss', hidden: true, role: 'status', 'data-hud': 'boss' }, bossFace, h('div', { class: 'mk-boss-main' }, bossName, h('div', { class: 'mk-boss-bar' }, bossFill, bossTicks)), bossPips);
  let bossId = -1, bossKey = '';
  const top = h('div', { class: 'mk-top' }, heat, waves, boss, score, slices, speed, pause);

  // ---- hand ----
  type CardView = { def: string; button: HTMLButtonElement; sweep: HTMLElement; secs: HTMLElement; state: string; secsText: string };
  const cards: CardView[] = sim.cards.map((card, index) => {
    const def = sim.content.defenders[card.def], sweep = h('div', { class: 'mk-card-cd' }), secs = h('div', { class: 'mk-card-cdtext' });
    const button = h('button', { class: 'mk-card', 'data-card': card.def, 'aria-label': `${tr(def.name)}. ${t('hud.cost', { n: def.cost })}. ${tr(def.desc)}` },
      deps.touch ? null : h('span', { class: 'mk-card-key', 'aria-hidden': 'true' }, String(index + 1)),
      fresh.has(card.def) ? h('i', { class: 'mk-tagnew' }, t('common.new')) : null,
      spriteIcon('defender', card.def, 54), sweep, secs, h('span', { class: 'mk-card-cost' }, String(def.cost)));
    return { def: card.def, button, sweep, secs, state: '', secsText: '' };
  });
  const spatula = h('button', { class: 'mk-card spatula', 'data-action': 'spatula', 'aria-label': `${t('hud.spatula')}. ${t('hud.spatulaHint')}`, title: `${t('hud.spatula')} (X)` },
    deps.touch ? null : h('span', { class: 'mk-card-key', 'aria-hidden': 'true' }, 'X'), spatulaIcon(54), h('span', { class: 'mk-card-cost' }, t('hud.spatula')));
  const hand = h('div', { class: 'mk-hand', role: 'toolbar', 'aria-label': t('hud.hand') }, cards.map(card => card.button), spatula);
  // A portrait phone with a big hand keeps it on one row that scrolls sideways (a second row would steal the height
  // the tall board needs): the side with more cards fades out, and a card picked by key or pad is scrolled into view.
  const handEdges = () => {
    const more = hand.scrollWidth - hand.clientWidth;
    hand.style.setProperty('--fl', more > 1 && hand.scrollLeft > 2 ? '26px' : '0px');
    hand.style.setProperty('--fr', more > 1 && hand.scrollLeft < more - 2 ? '26px' : '0px');
  };
  const revealInHand = (button: HTMLElement) => {
    if (hand.scrollWidth <= hand.clientWidth + 1) return;
    const left = button.offsetLeft, right = left + button.offsetWidth, pad = 30;
    if (left - pad < hand.scrollLeft) hand.scrollLeft = left - pad;
    else if (right + pad > hand.scrollLeft + hand.clientWidth) hand.scrollLeft = right + pad - hand.clientWidth;
  };
  hand.addEventListener('scroll', handEdges, { passive: true });

  // ---- overlays ----
  const banner = h('div', { class: 'mk-banner', role: 'status', hidden: true });
  const notes = h('div', { class: 'mk-notes' }, banner);
  const barkFace = h('span'), barkText = h('span');
  const bark = h('div', { class: 'mk-bark', hidden: true, role: 'log' }, barkFace, barkText);
  const toast = h('div', { class: 'mk-toast', role: 'alert', hidden: true });
  const bottom = h('div', { class: 'mk-bottom' }, toast, bark);
  const pop = h('div', { class: 'mk-pop', hidden: true, role: 'dialog', 'aria-label': t('hud.defender') });
  const info = h('div', { class: 'mk-info', hidden: true, role: 'tooltip' });
  const chip = h('div', { class: 'mk-chipfloat', hidden: true, 'aria-hidden': 'true' });
  const toasts = h('div', { class: 'mk-toasts', 'aria-hidden': 'true' });
  const ghost = h('div', { class: 'mk-ghost', hidden: true });
  const element = h('div', { class: 'mk-hud', 'data-level': level.id }, top, notes, bottom, hand, chip, toasts, pop, info, ghost);
  const coach: Coach = createCoach(i18n, session, deps.coach, {
    // A coach mark on a card scrolls a sideways-scrolling hand to it first, so the ring never lands off the tray.
    card: def => { const button = cards.find(card => card.def === def)?.button ?? null; if (button) revealInHand(button); return button; }, heat, waves, slices, hand, speed, boss: () => (boss.hidden ? null : boss)
  }, () => root, deps.touch);
  element.append(coach.element);

  let bannerTime = 0, barkTime = 0, toastTime = 0, bumpTime = 0, sliceHitTime = 0, deltaSum = 0, deltaTime = 0;
  let lastHeat = sim.heat, lastSlices = -1, lastLabel = '', lastFill = -1, lastSpeed = 0, lastScore = -1, popKey = '', chipKey = '', infoDef: string | null = null, lastHandH = -1;
  let ghostDef = '';
  let currentLayout: BoardLayout | null = null;

  const showBanner = (text: string, tone: '' | 'warn' | 'good' | 'boss', seconds: number, priority = 1) => {
    if (!banner.hidden && bannerTime > 0.6 && Number(banner.dataset.priority ?? 0) > priority) return;
    banner.textContent = text; banner.className = `mk-banner ${tone}`; banner.hidden = false; banner.dataset.priority = String(priority); bannerTime = seconds;
    banner.style.animation = 'none'; void banner.offsetWidth; banner.style.animation = '';
  };
  let mercyBarked = false, queuedBark: [string, string] | null = null;
  /**
   * Boss nights go easier once the cake has lost a slice (the sim's hidden "mercy"). Say so once a night, as soon as a
   * slice is gone with the boss on the counter (a slice lost earlier counts when it arrives), so the slower boss reads
   * as something the player can use. Queued: the boss's own gloat or entrance line plays first, then Grind answers it.
   */
  const checkMercy = () => {
    const live = session.sim;
    if (mercyBarked || !live.level.boss || live.stats.slicesLost < 1) return;
    if (!live.enemies.some(e => e.def === live.level.boss && !e.calm && e.hp > 0)) return;
    mercyBarked = true; queuedBark = ['grind', t('bark.mercy')];
  };
  const showBark = (speaker: string, line: string) => {
    const who = CHARACTERS[speaker];
    barkFace.replaceChildren(spriteIcon('character', speaker, 40));
    barkText.replaceChildren(h('b', null, who ? tr(who.name) : speaker), line);
    bark.hidden = false; barkTime = Math.min(6, 2.8 + line.length * (i18n.lang === 'zh' ? 0.12 : 0.045));
    bark.style.animation = 'none'; void bark.offsetWidth; bark.style.animation = '';
  };
  const showToast = (text: string, tone: '' | 'info' = '', seconds = 1.6) => { toast.textContent = text; toast.className = `mk-toast ${tone}`; toast.hidden = false; toastTime = seconds; bark.hidden = true; };
  const floatDelta = (amount: number) => {
    if (!amount) return;
    const node = h('span', { class: `mk-delta ${amount > 0 ? 'up' : 'down'}`, 'aria-hidden': 'true' }, `${amount > 0 ? '+' : '−'}${Math.abs(amount)}`);
    heat.append(node);
    setTimeout(() => node.remove(), 1000);
  };
  const stageRect = () => root.getBoundingClientRect();

  function statRows(def: string, tier: number, diff = false): HTMLElement {
    const data = sim.content.defenders[def], rows = h('div', { class: 'mk-statrows' });
    if (diff) for (const row of upgradeDiff(i18n, data, tier)) rows.append(h('span', null, row.label), h('b', null, row.now, h('span', { class: 'arrow' }, '→'), h('span', { class: row.up ? 'up' : '' }, row.next)));
    else for (const row of tierStats(i18n, data, tier)) rows.append(h('span', null, row.label), h('b', null, row.value));
    return rows;
  }

  function updatePopover(layout: BoardLayout | null): void {
    const d = view.selected === null ? undefined : sim.defenders.find(item => item.id === view.selected);
    if (!d || !layout) { if (!pop.hidden) { pop.hidden = true; popKey = ''; } return; }
    const def = sim.content.defenders[d.def], cost = upgradeCost(sim, d), refund = refundFor(sim, d), poor = cost !== null && sim.heat < cost;
    const key = `${d.id}:${d.tier}:${poor}:${refund}:${d.recipes.join(',')}:${i18n.lang}`;
    if (key !== popKey) {
      popKey = key;
      const recipeChips = d.recipes.map(id => sim.content.recipes.find(r => r.id === id)).filter(r => !!r).map(r => h('span', { class: 'mk-chip', style: `border-color:${r!.color}` }, `◆ ${tr(r!.name)}`));
      pop.replaceChildren(
        h('h4', null, tr(def.name), h('span', { class: 'mk-pop-stars', 'aria-label': t('hud.tier', { n: d.tier + 1, max: def.tiers.length }) }, '★'.repeat(d.tier + 1) + '☆'.repeat(Math.max(0, def.tiers.length - d.tier - 1)))),
        recipeChips.length ? h('div', { class: 'mk-chips' }, recipeChips) : '',
        cost === null ? statRows(d.def, d.tier) : statRows(d.def, d.tier, true),
        h('div', { class: 'mk-pop-row' },
          cost === null ? h('button', { class: 'mk-btn good', disabled: true }, h('b', null, t('hud.max')))
            : h('button', { class: `mk-btn good${poor ? ' is-poor' : ''}`, 'data-action': 'upgrade', 'aria-label': `${t('hud.upgrade')} ${cost}`, onclick: () => session.upgradeAt(d.col, d.lane) }, h('b', null, `▲ ${t('hud.upgrade')}`), h('span', null, `♨ ${cost}`)),
          h('button', { class: 'mk-btn danger', 'data-action': 'remove', 'aria-label': `${t('hud.remove')} +${refund}`, onclick: () => session.removeAt(d.col, d.lane) }, h('b', null, t('hud.remove')), h('span', null, `+${refund}`))));
      pop.hidden = false;
    }
    const insets = hudInsets(), rect = layout.cellRect(d.col, d.lane), width = pop.offsetWidth || 250, height = pop.offsetHeight || 150;
    const minY = insets.top, maxY = layout.h - insets.bottom - height - 4;
    let x = rect.x + rect.w / 2 - width / 2, y = rect.y - height - 10;
    if (y < minY) y = rect.y + rect.h + 10;
    if (y > maxY) { y = Math.max(minY, Math.min(maxY, rect.y + rect.h / 2 - height / 2)); x = rect.x + rect.w + 10; if (x + width > layout.w - 6) x = rect.x - width - 10; }
    pop.style.left = `${Math.max(6 + insets.left, Math.min(layout.w - width - 6, x))}px`; pop.style.top = `${Math.max(6, Math.min(layout.h - height - 6, y))}px`;
  }

  function updateChip(layout: BoardLayout | null): void {
    const p = view.preview;
    if (!p || !layout || !view.card) { if (!chip.hidden) { chip.hidden = true; chipKey = ''; } return; }
    const key = `${p.col},${p.lane}:${p.ok}:${p.reason}:${p.recipes.map(r => r.recipe).join(',')}:${i18n.lang}`;
    if (key !== chipKey) {
      chipKey = key;
      if (p.recipes.length) {
        const recipe = sim.content.recipes.find(r => r.id === p.recipes[0].recipe);
        chip.className = 'mk-chipfloat recipe';
        chip.replaceChildren(h('i', { style: `background:${p.recipes[0].color}` }), recipe ? t('hud.cooks', { name: tr(recipe.name) }) : '');
      } else if (!p.ok && p.reason && p.reason !== 'over') {
        chip.className = 'mk-chipfloat bad';
        const card = sim.cards.find(c => c.def === view.card);
        chip.textContent = p.reason === 'cooldown' && card ? t('hud.readyIn', { s: Math.ceil(card.cooldown) }) : t(`fail.${p.reason}` as Key);
      } else { chip.hidden = true; return; }
      chip.hidden = false;
    }
    if (chip.hidden) return;
    const r = layout.cellRect(p.col, p.lane), above = r.y > hudInsets().top + 30;
    // Centred on the cell, but kept inside the board's box so a chip over an edge column stays readable.
    const half = chip.offsetWidth / 2, width = element.clientWidth || 0;
    const x = width ? Math.max(half + 6, Math.min(width - half - 6, r.x + r.w / 2)) : r.x + r.w / 2;
    chip.style.left = `${x}px`; chip.style.top = `${above ? r.y - 4 : r.y + r.h + 30}px`;
  }

  function updateBoss(): void {
    const enemy = sim.enemies.find(e => enemyDef(sim, e)?.boss && !e.gone);
    if (!enemy) { if (!boss.hidden) { boss.hidden = true; waves.hidden = false; bossId = -1; } return; }
    const def = enemyDef(sim, enemy), phases = def.boss!.phases;
    if (enemy.id !== bossId) {
      bossId = enemy.id;
      bossFace.replaceChildren(spriteIcon('enemy', enemy.def, 28));
      bossName.textContent = tr(def.name);
      bossTicks.replaceChildren(...phases.slice(1).map(phase => h('u', { style: `left:${phase.below * 100}%` })));
      boss.hidden = false; waves.hidden = true;
    }
    // The finale boss can stop fighting: then the bar becomes a warmth meter that fills as warm guards stand near it.
    const calm = !!enemy.calm, frac = calm ? Math.min(1, enemy.warmth ?? 0) : Math.max(0, enemy.hp / enemy.maxHp), key = `${calm}:${Math.round(frac * 200)}:${enemy.phase}`;
    if (key !== bossKey) {
      bossKey = key;
      boss.classList.toggle('warm', calm);
      bossName.textContent = calm ? `${tr(def.name)} · ${t('hud.warmth')}` : tr(def.name);
      bossFill.style.width = `${frac * 100}%`;
      bossPips.replaceChildren(...(calm ? [] : phases.map((_, i) => h('i', { class: i >= enemy.phase ? 'on' : '' }))));
      boss.setAttribute('aria-label', `${bossName.textContent} ${Math.round(frac * 100)}%`);
    }
  }

  const hudInsets = () => {
    const stage = stageRect(), side = root.classList.contains('hand-side');
    const topEdge = top.getBoundingClientRect().bottom - stage.top;
    const tray = hand.getBoundingClientRect();
    return side ? { top: topEdge + 6, bottom: 6, left: tray.right - stage.left + 6 } : { top: topEdge + 6, bottom: stage.bottom - tray.top + 6, left: 0 };
  };

  function showInfo(def: string | null): void {
    infoDef = def;
    if (!def) { info.hidden = true; return; }
    const data = sim.content.defenders[def], card = cards.find(c => c.def === def);
    if (!data || !card) { info.hidden = true; return; }
    const recipes = sim.content.recipes.filter(r => r.parts.includes(def) && r.parts.every(part => sim.cards.some(c => c.def === part)));
    info.replaceChildren(
      h('h4', null, tr(data.name), h('span', { class: 'mk-chip' }, t(`role.${data.role}` as Key))),
      h('p', null, tr(data.desc)),
      h('div', { class: 'mk-statrows' }, h('span', null, t('stat.cost')), h('b', null, `♨ ${data.cost}`), h('span', null, t('stat.cooldown')), h('b', null, `${Math.round(data.cooldown * 10) / 10}s`)),
      statRows(def, 0),
      recipes.length ? h('p', { style: 'margin:6px 0 0' }, `◆ ${recipes.map(r => tr(r.name)).join(' · ')}`) : '');
    info.hidden = false;
    const stage = stageRect(), b = card.button.getBoundingClientRect(), side = root.classList.contains('hand-side');
    const w = info.offsetWidth || 280, hh = info.offsetHeight || 160;
    if (side) { info.style.left = `${b.right - stage.left + 12}px`; info.style.top = `${Math.max(6, Math.min(stage.height - hh - 6, b.top - stage.top + b.height / 2 - hh / 2))}px`; }
    else { info.style.left = `${Math.max(6, Math.min(stage.width - w - 6, b.left - stage.left + b.width / 2 - w / 2))}px`; info.style.top = `${Math.max(6, hand.getBoundingClientRect().top - stage.top - hh - 12)}px`; }
  }

  /** Places a recipe label clear of the others still floating; boxes are kept in data attributes (the CSS animation moves them). */
  function stackToast(node: HTMLElement, x: number, y: number): number {
    const taken = [...toasts.children].filter(other => other !== node).map(other => {
      const el = other as HTMLElement;
      return { x: Number(el.dataset.x), y: Number(el.dataset.y), w: Number(el.dataset.w), h: Number(el.dataset.h) };
    }).filter(box => Number.isFinite(box.y));
    const w = node.offsetWidth || 120, height = node.offsetHeight || 32, top = stackLabel(taken, x, y, w, height);
    Object.assign(node.dataset, { x: String(x), y: String(top), w: String(w), h: String(height) });
    return top;
  }

  function recipeToast(event: Extract<SimEvent, { type: 'recipe' }>): void {
    const recipe = sim.content.recipes.find(r => r.id === event.recipe);
    if (!recipe || !currentLayout || !event.cells.length) return;
    let x = 0, y = 0;
    for (const [col, lane] of event.cells) { const p = currentLayout.point(col + 0.5, lane); x += p.x; y += p.y; }
    x /= event.cells.length; y /= event.cells.length;
    const node = h('div', { class: `mk-recipe-toast${event.first ? ' first' : ''}`, style: `left:${x}px;top:${y - currentLayout.unit * 0.45}px` }, `${event.first ? '✦ ' : '◆ '}${tr(recipe.name)}`);
    // Several Recipes can form in the same instant: keep the newest three, and keep each label inside the board.
    while (toasts.childElementCount >= 3) toasts.firstElementChild?.remove();
    toasts.append(node);
    const half = node.offsetWidth / 2, width = element.clientWidth;
    if (width && half) node.style.left = `${Math.max(half + 6, Math.min(width - half - 6, x))}px`;
    // Labels that would land on top of one another (two Recipes sharing a cell) step upward instead.
    node.style.top = `${stackToast(node, Number.parseFloat(node.style.left) || x, y - currentLayout.unit * 0.45)}px`;
    setTimeout(() => node.remove(), 1900);
  }

  const update = (layout: BoardLayout | null): void => {
    currentLayout = layout;
    if (sim.heat !== lastHeat) {
      const delta = sim.heat - lastHeat;
      if (delta > 0) { heat.classList.add('is-bump'); bumpTime = 0.25; }
      deltaSum += delta; if (deltaTime <= 0) deltaTime = 0.3;
      lastHeat = sim.heat; heatValue.textContent = String(sim.heat); heat.setAttribute('aria-label', `${t('hud.heat')} ${sim.heat}`);
    }
    if (sim.slices !== lastSlices) {
      if (lastSlices > sim.slices) { slices.classList.add('is-hit'); sliceHitTime = 0.4; }
      lastSlices = sim.slices; sliceIcons.forEach((icon, index) => icon.classList.toggle('gone', index >= sim.slices)); slices.setAttribute('aria-label', t('hud.cake', { n: sim.slices, max: sim.maxSlices }));
    }
    const progress = Math.round(waveProgress(sim) * 200) / 2;
    if (progress !== lastFill) { lastFill = progress; fill.style.width = `${progress}%`; waves.setAttribute('aria-valuenow', String(Math.round(progress))); for (const mark of marks) mark.el.classList.toggle('done', sim.wave >= mark.wave); }
    // Endless: the board rule in force rides along in the wave label (its description is the tooltip).
    const rule = endless && sim.modifier ? ` · ${tr(sim.modifier.name)}` : '';
    const text = sim.wave < 0 ? (sim.nextWave ? t('hud.firstIn', { s: Math.max(0, Math.ceil(sim.waveTimer)) }) : t('hud.ready')) : endless ? t('hud.waveEndless', { n: sim.wave + 1 }) + rule : sim.wave >= sim.totalWaves - 1 ? t('hud.final') : t('hud.wave', { n: sim.wave + 1, total: sim.totalWaves });
    if (text !== lastLabel) { lastLabel = text; label.textContent = text; waves.setAttribute('aria-valuetext', text); waves.title = endless && sim.modifier ? tr(sim.modifier.desc) : ''; }
    if (endless && sim.score !== lastScore) { lastScore = sim.score; scoreValue.textContent = String(sim.score); }
    if (session.speed !== lastSpeed) { lastSpeed = session.speed; speed.textContent = `×${session.speed}`; speed.classList.toggle('is-on', session.speed === 2); speed.setAttribute('aria-pressed', String(session.speed === 2)); }
    for (const card of cards) {
      const state = sim.cards.find(item => item.def === card.def)!, def = sim.content.defenders[card.def];
      const cooling = state.cooldown > 0, poor = sim.heat < def.cost, selected = view.card === card.def;
      const key = `${cooling}:${poor}:${selected}`;
      if (key !== card.state) {
        card.state = key;
        card.button.classList.toggle('is-cooling', cooling); card.button.classList.toggle('is-poor', poor); card.button.classList.toggle('is-selected', selected);
        card.button.setAttribute('aria-pressed', String(selected));
        if (selected) revealInHand(card.button);
      }
      card.sweep.style.setProperty('--cd', cooling ? String(Math.min(1, state.cooldown / Math.max(0.01, state.total))) : '0');
      const secs = cooling && state.cooldown >= 1 ? String(Math.ceil(state.cooldown)) : '';
      if (secs !== card.secsText) { card.secsText = secs; card.secs.textContent = secs; }
    }
    spatula.classList.toggle('is-selected', view.spatula);
    spatula.setAttribute('aria-pressed', String(view.spatula));
    updateBoss();
    const tray = hand.getBoundingClientRect(), handH = Math.round(tray.height), handKey = handH * 10000 + Math.round(tray.width);
    if (handKey !== lastHandH) { lastHandH = handKey; handEdges(); root.style.setProperty('--mk-hand', `${handH + 12}px`); root.style.setProperty('--mk-side', `${Math.round(tray.width) + 14}px`); }
    updatePopover(layout);
    updateChip(layout);
    if (view.spatula && toast.hidden) showToast(t('hud.spatulaHint'), 'info', 0.2);
    // The bark yields to the popover and to a coach mark sitting at the bottom; it comes back on its own timer.
    // ...and to the card info card, which opens right above the hand where the bark sits.
    bark.style.visibility = !pop.hidden || !info.hidden || (coach.visible && !toast.hidden) ? 'hidden' : '';
    if (infoDef) showInfo(infoDef);
  };

  return {
    element,
    update,
    onEvent(event) {
      coach.onEvent(event);
      switch (event.type) {
        case 'telegraph': showBanner(level.boss && event.wave === sim.totalWaves - 1 ? t('hud.bossIn') : t('hud.big'), level.boss && event.wave === sim.totalWaves - 1 ? 'boss' : 'warn', 4, 3); break;
        case 'waveStart': if (!endless && event.wave === event.total - 1 && !level.boss) showBanner(t('hud.final'), 'warn', 3, 2); else if (endless && event.big) showBanner(t('hud.bigEndless', { n: event.wave + 1 }), 'warn', 3, 2); break;
        case 'recipe': recipeToast(event); if (event.first) { const recipe = sim.content.recipes.find(r => r.id === event.recipe); if (recipe) showBanner(t('toast.recipeNew', { name: tr(recipe.name) }), 'good', 2.6, 1); } break;
        case 'slice': {
          showBanner(t('toast.slice'), 'warn', 2.2, 2);
          checkMercy();
          break;
        }
        case 'sliceRestored': showBanner(t('toast.sliceBack'), 'good', 2.5, 2); break;
        case 'steal': if (event.def) showBanner(t('toast.stolen'), 'warn', 2.2, 2); break;
        case 'recovered': showBanner(t('toast.recovered'), 'good', 1.8, 1); break;
        case 'bossPhase': showBanner(t('hud.bossPhase'), 'boss', 2.4, 3); break;
        // The name only: Ladle's bark right under it (sent by the sim with the rule) explains what it does.
        case 'modifier': showBanner(t('hud.rule', { name: tr(event.name) }), 'warn', 4.5, 2); break;
        case 'remembered': showBanner(t('hud.remembered'), 'good', 4, 3); break;
        case 'heat': break;
        case 'cardReady': { const card = cards.find(item => item.def === event.def); if (card) { card.button.classList.remove('is-ready-flash'); void card.button.offsetWidth; card.button.classList.add('is-ready-flash'); } break; }
        case 'bark': showBark(event.speaker, tr(event.line)); break;
        default: break;
      }
    },
    deny(reason) { coach.onDeny(reason); const key = `fail.${reason}` as Key; showToast(t(key)); },
    tick(dt) {
      if (bannerTime > 0 && (bannerTime -= dt) <= 0) banner.hidden = true;
      // A bark waiting behind a popover or coach mark keeps its time, so it is still read once they close.
      if (barkTime > 0 && bark.style.visibility !== 'hidden' && (barkTime -= dt) <= 0) bark.hidden = true;
      checkMercy();
      if (queuedBark && barkTime <= 0) { const [speaker, line] = queuedBark; queuedBark = null; showBark(speaker, line); }
      if (toastTime > 0 && (toastTime -= dt) <= 0) toast.hidden = true;
      if (bumpTime > 0 && (bumpTime -= dt) <= 0) heat.classList.remove('is-bump');
      if (sliceHitTime > 0 && (sliceHitTime -= dt) <= 0) slices.classList.remove('is-hit');
      if (deltaTime > 0 && (deltaTime -= dt) <= 0) { floatDelta(deltaSum); deltaSum = 0; }
      coach.update(dt, currentLayout);
    },
    heatAnchor() {
      const a = heat.getBoundingClientRect(), b = root.getBoundingClientRect();
      return { x: a.left - b.left + 20, y: a.top - b.top + a.height / 2 };
    },
    insets() {
      const stage = root.getBoundingClientRect(), bar = top.getBoundingClientRect(), tray = hand.getBoundingClientRect(), side = root.classList.contains('hand-side');
      const topInset = (bar.height ? bar.bottom - stage.top : 52) + 8;
      return side ? { top: topInset, right: 6, bottom: 6, left: (tray.width ? tray.right - stage.left : 130) + 8 } : { top: topInset, right: 4, bottom: (stage.height && tray.height ? stage.bottom - tray.top : 100) + 8, left: 4 };
    },
    info: showInfo,
    drag(state) {
      if (!state) { ghost.hidden = true; ghostDef = ''; return; }
      if (state.def !== ghostDef) { ghostDef = state.def; ghost.replaceChildren(spriteIcon('defender', state.def, 64)); }
      const b = stageRect();
      ghost.hidden = false;
      ghost.classList.toggle('bad', !!view.preview && !view.preview.ok);
      ghost.style.left = `${state.x - b.left}px`; ghost.style.top = `${state.y - b.top}px`;
    },
    announceCard(def) {
      if (!def) return;
      const data = sim.content.defenders[def];
      if (data) showToast(`${tr(data.name)} · ♨ ${data.cost}`, 'info', 1.4);
    }
  };
}
