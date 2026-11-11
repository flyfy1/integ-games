import type { I18n, Key } from '../i18n';
import type { BoardLayout, Rect } from '../render/layout';
import type { Session } from '../session';
import { upgradeCost } from '../sim';
import type { SimEvent } from '../types';
import { h } from './dom';

/**
 * Coach marks: one short sentence in a bubble, a pointing hand and a pulsing ring on whatever it is about. Never
 * modal: the bubble is the only thing that takes taps, and the board stays live underneath.
 *
 * Two sources, one at a time:
 *  - the level's scripted `tutorial` steps (data/levels.ts), which wait until the player does what they ask;
 *  - contextual tips, each shown once per save when its moment first comes up (first big wave, first affordable
 *    upgrade, first possible Recipe, first slice lost, ...). Doing the thing also retires the tip.
 * "Skip tips" turns both off (Settings can turn them back on and reset them).
 */
export type CoachStore = { seen(id: string): boolean; see(id: string): void; off(): boolean; skipAll(): void };
export type CoachAnchors = { card(def: string): HTMLElement | null; heat: HTMLElement; waves: HTMLElement; slices: HTMLElement; hand: HTMLElement; speed: HTMLElement; boss(): HTMLElement | null };
type Target = { card: string } | { hud: 'heat' | 'waves' | 'cake' | 'hand' | 'speed' | 'boss' } | { cell: [number, number] } | { defender: string } | { cakeBoard: true } | null;
type Mark = { id: string; text: string; target: Target; scripted: boolean; ttl: number; step?: [number, number] };

export type Coach = {
  element: HTMLElement;
  update(dt: number, layout: BoardLayout | null): void;
  onEvent(event: SimEvent): void;
  /** A refused action, so the matching tip can explain it. */
  onDeny(reason: string): void;
  /** Hide the bubble without retiring it (popover open, level ending). */
  readonly visible: boolean;
};

const TIP_GAP = 7;

export function createCoach(i18n: I18n, session: Session, store: CoachStore, anchors: CoachAnchors, stage: () => HTMLElement, touch: boolean): Coach {
  const { t, tr } = i18n, sim = session.sim, steps = session.level.tutorial ?? [];
  const text = h('p', { role: 'status', 'aria-live': 'polite' });
  const counter = h('span', { class: 'mk-coach-step' });
  const gotIt = h('button', { class: 'mk-btn small primary', 'data-action': 'coach-ok', onclick: () => dismiss() }, t('coach.ok'));
  const skip = h('button', { class: 'mk-btn small ghost', 'data-action': 'coach-skip', onclick: () => { store.skipAll(); session.skipTutorial(); hide(); } }, t('coach.skip'));
  const bubble = h('div', { class: 'mk-coach', hidden: true, 'data-coach': '' }, text, h('div', { class: 'mk-coach-row' }, counter, h('span', { class: 'mk-grow' }), skip, gotIt));
  const pointer = h('div', { class: 'mk-hand-pointer', hidden: true, 'aria-hidden': 'true' }, '👆');
  const ring = h('div', { class: 'mk-ring', hidden: true, 'aria-hidden': 'true' });
  const element = h('div', { class: 'mk-coach-layer' }, ring, pointer, bubble);
  let current: Mark | null = null, shownKey = '', gap = 2.5;
  const pending: Mark[] = [];
  let lastFocusEl: HTMLElement | null = null;

  const queue = (id: string, key: Key, target: Target, ttl = 7, vars?: Record<string, string | number>) => {
    if (store.off() || store.seen(id) || pending.some(mark => mark.id === id) || current?.id === id) return;
    pending.push({ id, text: t(key, vars), target, scripted: false, ttl });
  };
  const retire = (id: string) => { store.see(id); const index = pending.findIndex(mark => mark.id === id); if (index >= 0) pending.splice(index, 1); if (current?.id === id && !current.scripted) hide(); };
  function hide(): void { current = null; shownKey = ''; bubble.hidden = true; pointer.hidden = true; ring.hidden = true; setFocus(null); }
  function dismiss(): void { if (current && !current.scripted) { store.see(current.id); hide(); gap = TIP_GAP; } }
  const setFocus = (el: HTMLElement | null) => { if (lastFocusEl === el) return; lastFocusEl?.classList.remove('mk-is-focus'); lastFocusEl = el; el?.classList.add('mk-is-focus'); };

  const rel = (el: Element): Rect => { const a = el.getBoundingClientRect(), b = stage().getBoundingClientRect(); return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height }; };
  const targetRect = (target: Target, layout: BoardLayout | null): { rect: Rect; el: HTMLElement | null; board: boolean } | null => {
    if (!target) return null;
    if ('card' in target) { const el = anchors.card(target.card); return el ? { rect: rel(el), el, board: false } : null; }
    if ('hud' in target) {
      const el = target.hud === 'heat' ? anchors.heat : target.hud === 'waves' ? anchors.waves : target.hud === 'cake' ? anchors.slices : target.hud === 'speed' ? anchors.speed : target.hud === 'boss' ? anchors.boss() : anchors.hand;
      return el && !el.hidden ? { rect: rel(el), el, board: false } : null;
    }
    if (!layout) return null;
    if ('cakeBoard' in target) { const c = layout.cake; return { rect: { x: c.x - c.r, y: c.y - c.r, w: c.r * 2, h: c.r * 2 }, el: null, board: true }; }
    if ('cell' in target) return { rect: layout.cellRect(target.cell[0], target.cell[1]), el: null, board: true };
    const d = sim.defenders.find(item => item.def === target.defender);
    return d ? { rect: layout.cellRect(d.col, d.lane), el: null, board: true } : null;
  };

  const place = (layout: BoardLayout | null) => {
    if (!current) return;
    const root = stage(), W = root.clientWidth, H = root.clientHeight;
    const found = targetRect(current.target, layout);
    const side = root.classList.contains('hand-side');
    const handRect = rel(anchors.hand), topBar = anchors.waves.getBoundingClientRect().bottom - root.getBoundingClientRect().top;
    const bw = bubble.offsetWidth || 300, bh = bubble.offsetHeight || 90;
    const minY = Math.max(8, topBar + 8), maxY = (side ? H - 8 : handRect.y - 8) - bh;
    let x: number, y: number;
    setFocus(found?.el ?? null);
    if (!found) {
      x = (W - bw) / 2; y = minY + 40;
      pointer.hidden = true; ring.hidden = true;
    } else {
      const r = found.rect, cx = r.x + r.w / 2, below = r.y + r.h / 2 < H * 0.45;
      if (found.board) { ring.hidden = false; Object.assign(ring.style, { left: `${r.x - 3}px`, top: `${r.y - 3}px`, width: `${r.w + 6}px`, height: `${r.h + 6}px` }); } else ring.hidden = true;
      pointer.hidden = false;
      if (side && !found.board && ('card' in (current.target ?? {}) || (current.target && 'hud' in current.target && current.target.hud === 'hand'))) {
        // Hand down the left side: bubble to its right, the hand points left at the card.
        x = handRect.x + handRect.w + 14; y = r.y + r.h / 2 - bh / 2;
        pointer.textContent = '👈'; Object.assign(pointer.style, { left: `${r.x + r.w + 2}px`, top: `${r.y + r.h / 2 - 16}px` });
      } else if (below) {
        x = cx - bw / 2; y = r.y + r.h + 46;
        pointer.textContent = '👆'; Object.assign(pointer.style, { left: `${cx - 8}px`, top: `${r.y + r.h + 2}px` });
      } else {
        x = cx - bw / 2; y = r.y - bh - 46;
        pointer.textContent = '👇'; Object.assign(pointer.style, { left: `${cx - 8}px`, top: `${r.y - 40}px` });
      }
    }
    x = Math.max(8, Math.min(W - bw - 8, x)); y = Math.max(minY, Math.min(Math.max(minY, maxY), y));
    bubble.style.left = `${x}px`; bubble.style.top = `${y}px`;
  };

  const show = (mark: Mark) => {
    current = mark;
    const key = `${mark.id}:${i18n.lang}`;
    if (key !== shownKey) {
      shownKey = key;
      text.textContent = mark.text;
      counter.textContent = mark.step ? t('coach.step', { n: mark.step[0], total: mark.step[1] }) : '';
      gotIt.hidden = mark.scripted;
      bubble.hidden = false;
      // Re-run the entrance animation for a new mark.
      bubble.style.animation = 'none'; void bubble.offsetWidth; bubble.style.animation = '';
    }
  };

  return {
    element,
    get visible() { return !!current; },
    update(dt, layout) {
      if (store.off() || sim.status !== 'playing') { if (current) hide(); return; }
      gap = Math.max(0, gap - dt);
      // Scripted steps first: they are the level's lesson.
      const step = session.tutorial;
      if (step) {
        const index = session.tutorialIndex, f = step.focus;
        const target: Target = !f ? null : 'card' in f ? { card: f.card } : 'cell' in f ? { cell: f.cell } : 'hud' in f ? { hud: f.hud } : { defender: f.defender };
        if (!current || current.id !== `${session.level.id}:${index}`) show({ id: `${session.level.id}:${index}`, text: tr(step.text), target, scripted: true, ttl: Infinity, step: steps.length > 1 ? [index + 1, steps.length] : undefined });
      } else if (current?.scripted) hide();
      // Contextual moments the state reveals on its own.
      if (!step) {
        if (sim.time > 18 && sim.stats.upgrades === 0 && !session.view.card && sim.defenders.length >= 2 && !store.seen('tip.upgrade')) {
          const d = sim.defenders.find(item => { const cost = upgradeCost(sim, item); return cost !== null && cost > 0 && sim.heat >= cost + 25 && item.def !== 'burner'; });
          if (d) queue('tip.upgrade', 'coach.upgrade', { cell: [d.col, d.lane] }, 8);
        }
        const preview = session.view.preview;
        if (preview?.ok && preview.recipes.length && !store.seen('tip.recipe')) {
          const recipe = sim.content.recipes.find(item => item.id === preview.recipes[0].recipe);
          if (recipe) { pending.unshift({ id: 'tip.recipe', text: t('coach.recipe', { name: tr(recipe.name) }), target: { cell: [preview.col, preview.lane] }, scripted: false, ttl: 6 }); gap = 0; }
        }
      }
      if (current && !current.scripted) {
        current.ttl -= dt;
        if (current.ttl <= 0) { store.see(current.id); hide(); gap = TIP_GAP; }
      }
      if (!current && !step && gap <= 0 && sim.time > 2) {
        const next = pending.shift();
        if (next && !store.seen(next.id)) { store.see(next.id); show(next); }
      }
      if (current) place(layout); else setFocus(null);
    },
    onEvent(event) {
      switch (event.type) {
        case 'enemySpawn': if (!event.boss) queue('tip.cake', 'coach.cake', { cakeBoard: true }, 7, { n: sim.slices }); else queue('tip.boss', 'coach.boss', { hud: 'boss' }, 7); break;
        case 'telegraph': queue('tip.big', 'coach.big', { hud: 'waves' }, 6); break;
        case 'slice': queue('tip.slice', 'coach.slice', { cakeBoard: true }, 7); break;
        case 'upgrade': retire('tip.upgrade'); break;
        case 'recipe': retire('tip.recipe'); if (event.first && !store.seen('tip.cookbook')) queue('tip.cookbook', 'coach.cookbook', null, 5); break;
        case 'place': if (touch && sim.stats.placed >= 3) queue('tip.drag', 'coach.drag', { hud: 'hand' }, 6); break;
        default: break;
      }
    },
    onDeny(reason) {
      if (reason === 'heat') queue('tip.heat', 'coach.heat', { hud: 'heat' }, 6);
      else if (reason === 'cooldown' && session.view.card) queue('tip.cooldown', 'coach.cooldown', { card: session.view.card }, 6);
      if (!current) gap = 0;
    }
  };
}
