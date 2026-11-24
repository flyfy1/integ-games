import { CASTES } from '../data/castes';
import { MODIFIERS } from '../data/endless';
import type { Audio } from '../audio';
import { denyKey, type I18n } from '../i18n';
import type { Session } from '../session';
import { goalProgress, goalTarget } from '../sim';
import type { CasteId, DenyReason, QueenCall, SimEvent } from '../types';
import { casteIcon, h } from './dom';

/**
 * In-raid HUD (DOM over the canvas). Top: Sugar, Scent, the goal, Alarm, the sun-arc clock, speed and pause.
 * Bottom: the hand of cards, the trail cutter and the three Queen calls. Plus the coach bubble and toasts.
 */
export type CoachStore = { seen(id: string): boolean; see(id: string): void; off(): boolean; skipAll(): void };
export type Hud = {
  element: HTMLElement;
  insets(): { top: number; right: number; bottom: number; left: number };
  tick(dt: number): void;
  onEvent(event: SimEvent): void;
  deny(reason: DenyReason): void;
  toast(text: string, kind?: 'bad' | 'good' | ''): void;
};
type Ctx = { i18n: I18n; audio: Audio; touch: boolean; coach: CoachStore };

const QUEEN_GLYPH: Record<QueenCall, string> = { scatter: '✺', rally: '➶', recall: '⌂' };
const QUEEN_KEY: Record<QueenCall, string> = { scatter: 'S', rally: 'R', recall: 'H' };

export function createHud(ctx: Ctx, session: Session, actions: { pause(): void; toggleSpeed(): void }): Hud {
  const { i18n } = ctx;
  const sim = session.sim, level = session.level;
  const t = i18n.t;
  const text = (el: HTMLElement, value: string) => { if (el.textContent !== value) el.textContent = value; };
  const bar = () => { const fill = h('i'); return { el: h('span', { class: 'bar' }, fill), fill }; };

  // ------------------------------------------------------------ top
  const sugarN = h('b', null, '0');
  const sugar = h('div', { class: 'ar-pill', title: t('hud.sugar'), 'data-ui': 'sugar' }, h('i', { class: 'ar-sugar', 'aria-hidden': 'true' }), sugarN);
  const scentBar = bar(), scentN = h('b', null, '');
  const scent = h('div', { class: 'ar-pill', title: t('hud.scent'), 'data-ui': 'scent' }, h('span', { class: 'lbl' }, t('hud.scent')), scentBar.el, scentN);
  const goalBar = bar(), goalText = h('span', null, '');
  const goal = h('div', { class: 'ar-pill goal', 'data-ui': 'goal' }, goalText, goalBar.el);
  const alarmBar = bar();
  const alarm = h('div', { class: 'ar-pill alarm', title: t('hud.alarm'), 'data-ui': 'alarm', hidden: !level.alarm && !level.endless }, h('i', { class: 'ar-eye', 'aria-hidden': 'true' }), alarmBar.el);
  const hearts = h('div', { class: 'ar-pill', title: t('hud.nest'), hidden: level.goal.kind !== 'defend' }, '');
  const sunDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  const sunSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  sunSvg.setAttribute('viewBox', '0 0 60 34');
  sunSvg.innerHTML = '<path d="M4 31 A26 26 0 0 1 56 31" fill="none" stroke="rgba(255,246,227,.35)" stroke-width="3" stroke-dasharray="3 3"/><line x1="0" y1="32" x2="60" y2="32" stroke="rgba(255,246,227,.5)" stroke-width="2"/>';
  sunDot.setAttribute('r', '6'); sunDot.setAttribute('stroke', '#2b1d14'); sunDot.setAttribute('stroke-width', '2');
  sunSvg.append(sunDot);
  const sun = h('div', { class: 'ar-sun', title: t('hud.sun'), role: 'img', 'aria-label': t('hud.sun') }, sunSvg);
  const speed = h('button', { class: 'ar-icon', 'data-ui': 'speed', 'aria-label': t('hud.speed'), 'aria-pressed': String(session.speed === 2), onclick: () => { actions.toggleSpeed(); speed.setAttribute('aria-pressed', String(session.speed === 2)); speed.textContent = session.speed === 2 ? '»' : '›'; } }, session.speed === 2 ? '»' : '›');
  const pause = h('button', { class: 'ar-icon', 'aria-label': t('hud.pause'), onclick: () => actions.pause() }, 'II');
  const top = h('div', { class: 'ar-top' }, sugar, scent, goal, alarm, hearts, sun, speed, pause);

  // ------------------------------------------------------------ bottom
  const cardEls = new Map<CasteId, { el: HTMLButtonElement; cd: HTMLElement; stock: HTMLElement; cost: HTMLElement }>();
  const hand = h('div', { class: 'ar-hand', role: 'toolbar', 'aria-label': 'cards' });
  sim.cards.forEach((card, i) => {
    const def = CASTES[card.caste];
    const cd = h('i', { class: 'cd' }), stock = h('span', { class: 'stock', hidden: true }, ''), cost = h('span', null, String(def.cost));
    const el = h('button', { class: 'ar-card', 'data-card': card.caste, 'aria-label': `${i18n.tr(def.name)} ${def.cost}`, title: i18n.tr(def.blurb) },
      h('span', { class: 'key' }, String(i + 1)), stock, casteIcon(card.caste, 40), h('b', null, i18n.tr(def.name)), h('span', { class: 'cost' }, cost, def.brood > 1 ? h('small', null, ` ×${def.brood}`) : ''), cd) as HTMLButtonElement;
    let hold: ReturnType<typeof setTimeout> | null = null;
    el.addEventListener('click', () => { session.pressCard(card.caste); ctx.audio.sfx('select'); });
    el.addEventListener('pointerdown', () => {
      if (def.kind !== 'stream') return;
      hold = setTimeout(() => { hold = null; for (let k = 0; k < 4; k++) session.pressCard(card.caste); }, 450);
    });
    const clear = () => { if (hold) { clearTimeout(hold); hold = null; } };
    el.addEventListener('pointerup', clear); el.addEventListener('pointerleave', clear); el.addEventListener('pointercancel', clear);
    cardEls.set(card.caste, { el, cd, stock, cost });
    hand.append(el);
  });
  const eraser = h('button', { class: 'ar-icon', 'data-ui': 'eraser', 'aria-label': t('hud.eraser'), title: `${t('hud.eraser')} (X)`, 'aria-pressed': 'false', onclick: () => { session.toggleEraser(); ctx.audio.sfx('select'); } }, '✂');
  hand.append(eraser);
  const queenEls = new Map<QueenCall, { el: HTMLButtonElement; cd: HTMLElement }>();
  const queens = h('div', { class: 'ar-queens' });
  for (const call of ['scatter', 'rally', 'recall'] as QueenCall[]) {
    const cd = h('i', { class: 'cd' });
    const el = h('button', { class: 'ar-queen', 'data-queen': call, 'aria-label': t(`hud.${call}`), title: `${t(`hud.${call}`)} (${QUEEN_KEY[call]})`, onclick: () => session.queen(call) },
      h('span', { class: 'key' }, ctx.touch ? '' : QUEEN_KEY[call]), h('span', null, h('span', { class: 'glyph' }, QUEEN_GLYPH[call]), h('br'), t(`hud.${call}`)), cd) as HTMLButtonElement;
    queenEls.set(call, { el, cd });
    queens.append(el);
  }
  const bottom = h('div', { class: 'ar-bottom' }, hand, queens);

  // ------------------------------------------------------------ coach + toasts
  const coachText = h('p'), coachCount = h('span'), coach = h('div', { class: 'ar-coach', role: 'status', hidden: true }, coachText,
    h('footer', null, coachCount, h('button', { onclick: () => { session.skipTutorial(); ctx.coach.skipAll(); syncCoach(); } }, t('hud.skip'))));
  const toasts = h('div', { class: 'ar-toasts', 'aria-live': 'polite' });
  const element = h('div', { class: 'ar-hud' }, top, bottom, coach, toasts);

  let coachIndex = -2, lastCoachUi: string | undefined;
  function syncCoach(): void {
    const step = ctx.coach.off() ? null : session.tutorial;
    const index = step ? session.tutorialIndex : -1;
    if (index === coachIndex) return;
    coachIndex = index;
    element.querySelectorAll('.coach').forEach(el => el.classList.remove('coach'));
    if (!step) { coach.hidden = true; return; }
    coach.hidden = false;
    text(coachText, i18n.tr(step.text));
    text(coachCount, t('hud.tip', { i: index + 1, n: level.tutorial?.length ?? 1 }));
    lastCoachUi = step.ui;
    if (step.ui) element.querySelector(`[data-card="${step.ui}"], [data-queen="${step.ui}"], [data-ui="${step.ui}"]`)?.classList.add('coach');
  }

  const toast = (message: string, kind: 'bad' | 'good' | '' = '') => {
    const same = [...toasts.children].find(child => child.textContent === message);
    if (same) same.remove();
    if (toasts.childElementCount > 2) toasts.firstElementChild?.remove();
    const el = h('div', { class: `ar-toast ${kind}` }, message);
    toasts.append(el);
    setTimeout(() => el.remove(), 2200);
  };
  let lastDeny = 0, clock = 0;

  const hud: Hud = {
    element,
    insets() {
      const topH = top.getBoundingClientRect().height || 52, bottomH = bottom.getBoundingClientRect().height || 86;
      return { top: topH + 2, right: 0, bottom: bottomH + 2, left: 0 };
    },
    tick(dt) {
      clock += dt;
      text(sugarN, String(Math.floor(sim.sugar)));
      scentBar.fill.style.width = `${(sim.scent / Math.max(1, sim.scentMax)) * 100}%`;
      text(scentN, String(sim.scent));
      const g = level.goal;
      if (level.endless) text(goalText, t('hud.score', { n: sim.crumbs }));
      else if (g.kind === 'item') { const food = sim.foods.find(f => f.id === g.food); text(goalText, t('hud.item', { food: food ? t(`food.${food.kind}` as never) : '' })); }
      else if (g.kind === 'defend') text(goalText, t('hud.defend', { n: sim.crumbs, goal: g.n }));
      else if (g.kind === 'race') text(goalText, t('hud.race', { n: sim.crumbs, r: sim.rivalCrumbs, goal: g.n }));
      else text(goalText, t('hud.crumbs', { n: sim.crumbs, goal: goalTarget(sim) }));
      goalBar.fill.style.width = `${(level.endless ? Math.min(1, (sim.sundown - sim.time) / 120) : goalProgress(sim)) * 100}%`;
      alarm.hidden = !sim.level.alarm;
      alarmBar.fill.style.width = `${sim.alarm}%`;
      alarm.classList.toggle('hot', sim.alarm > 80 || sim.shoe.left > 0);
      if (level.goal.kind === 'defend') text(hearts, '♥'.repeat(Math.max(0, sim.nestHp)) || '·');
      const p = Math.min(1, sim.time / Math.max(1, sim.sundown)), a = Math.PI * (1 - p);
      sunDot.setAttribute('cx', String(30 + Math.cos(a) * 26)); sunDot.setAttribute('cy', String(31 - Math.sin(a) * 26));
      sunDot.setAttribute('fill', p < 0.5 ? '#ffe36b' : p < 0.85 ? '#ffaa3a' : '#ff6a5a');
      for (const card of sim.cards) {
        const ui = cardEls.get(card.caste)!, def = CASTES[card.caste];
        ui.cd.style.transform = `scaleY(${def.cooldown ? card.cooldown / def.cooldown : 0})`;
        ui.stock.hidden = card.stock <= 0; text(ui.stock, String(card.stock));
        text(ui.cost, card.stock > 0 ? t('hud.free') : sim.level.fixedAnts ? '—' : String(def.cost));
        ui.el.classList.toggle('poor', card.stock <= 0 && (sim.sugar < def.cost || !!sim.level.fixedAnts));
        ui.el.setAttribute('aria-pressed', String(session.view.card === card.caste));
        ui.el.classList.toggle('hl', session.highlighted === card.caste && !ctx.touch);
      }
      eraser.setAttribute('aria-pressed', String(session.view.eraser));
      for (const [call, ui] of queenEls) {
        const q = sim.queen[call];
        const k = q.cd / q.max;
        ui.cd.style.background = k > 0 ? `conic-gradient(rgba(43,29,20,.55) ${k * 360}deg, transparent 0)` : 'none';
        ui.el.classList.toggle('active', q.active > 0);
      }
      syncCoach();
      void lastCoachUi;
    },
    onEvent(event) {
      switch (event.type) {
        case 'alert': toast(t('hud.alert'), 'bad'); break;
        case 'warn':
          if (event.kind === 'shoe') toast(t('hud.warnShoe'), 'bad');
          else if (event.kind === 'sparrow') toast(t('hud.warnSparrow'), 'bad');
          else if (event.kind === 'dive') toast(t('hud.warnDive'), 'bad');
          else if (event.kind === 'sprinkler' && clock > 2) toast(t('hud.warnSprinkler'));
          break;
        case 'boss':
          if (event.what === 'nap') toast(t('hud.nap'), 'good');
          else if (event.what.startsWith('arrive')) toast(t('hud.arrive'));
          break;
        case 'rival': if (event.what === 'raid') toast(t('hud.raid'), 'bad'); if (event.what === 'cut') toast(t('hud.cut'), 'good'); break;
        case 'modifier': { const mod = MODIFIERS.find(m => m.id === event.id); if (mod) toast(t('hud.modifier', { m: i18n.tr(mod.name) })); break; }
      }
    },
    deny(reason) {
      if (clock - lastDeny < 0.6) return;
      lastDeny = clock;
      toast(t(denyKey(reason)), 'bad');
    },
    toast
  };
  hud.tick(0);
  return hud;
}
