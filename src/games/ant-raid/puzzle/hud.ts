import { h } from '../ui/dom';
import type { I18n } from './i18n';
import type { Session, SessionEvent } from './session';
import { diggersLeft, scentLeft, type FailReason, type PaintFail } from './sim';
import type { PuzzleLevel } from './types';

/**
 * The puzzle HUD: at most seven things, every control with a word on it (no icon-only buttons on a phone).
 *   top:    goal chip (goal + squad, progress during a run) · Scent pips · Rules · Menu
 *   bottom: Undo (hold to clear) · Digger token tray (levels that have one) · GO (Retry during a run)
 * 1-1 shows only the goal chip and, once the trail reaches the cookie, GO.
 * A fail puts a one-line reason on a banner over the board; it is not a dialog, the trail stays editable under it.
 */
export type HudActions = { go(): void; retry(): void; undo(): void; clear(): void; rules(): void; menu(): void; digger(): void; hint(): void };
export type PuzzleHud = { element: HTMLElement; update(): void; onEvent(event: SessionEvent): void; insets(): { top: number; right: number; bottom: number; left: number }; setHint(on: boolean): void };

export function goalText(i18n: I18n, level: PuzzleLevel): string {
  const items = level.goal.items.map(id => level.foods.find(f => f.id === id)!).map(f => i18n.t(`food.${f.kind}` as never));
  if (items.length && level.goal.crumbs > 0) return i18n.t('hud.goalBoth', { food: items.join(' + '), n: level.goal.crumbs });
  if (items.length) return i18n.t('hud.goalItem', { food: items.join(' + ') });
  return i18n.t('hud.goalCrumbs', { n: level.goal.crumbs });
}

export function failText(i18n: I18n, level: PuzzleLevel, reason: FailReason): string {
  const food = (f: number) => i18n.t(`food.${level.foods[f].kind}` as never);
  switch (reason.kind) {
    case 'reach': return i18n.t('fail.reach', { food: food(reason.food) });
    case 'short': return i18n.t(level.squad.includes('p') ? 'fail.shortPower' : 'fail.short', { have: reason.have, need: reason.need, food: food(reason.food) });
    case 'bridge': return i18n.t('fail.bridge', { have: reason.have });
    case 'crumbs':
      if (reason.lost > 0) return i18n.t('fail.eaten', { lost: reason.lost, have: reason.have, need: reason.need });
      if (reason.bridge > 0) return i18n.t('fail.bridged', { b: reason.bridge, have: reason.have, need: reason.need });
      return i18n.t('fail.crumbs', { have: reason.have, need: reason.need });
    case 'time': return i18n.t('fail.time');
  }
}

export function createPuzzleHud(i18n: I18n, session: Session, actions: HudActions, opts: { tutorial: boolean }): PuzzleHud {
  const t = i18n.t, level = session.level;
  const first = opts.tutorial;
  const goalLabel = h('span', { class: 'lbl' }), goalSub = h('small');
  const goal = h('div', { class: 'ar-pill goal', 'data-ui': 'goal', role: 'status' }, goalLabel, goalSub);
  const pips = h('span', { class: 'pips', 'aria-hidden': 'true' }), scentNum = h('b');
  const scent = h('div', { class: 'ar-pill scent', 'data-ui': 'scent', hidden: level.scent === null }, h('span', { class: 'lbl' }, t('hud.scent')), pips, scentNum);
  const rules = h('button', { class: 'ar-btn small ghost', 'data-ui': 'rules', hidden: first, onclick: () => actions.rules() }, t('hud.rules'));
  const menu = h('button', { class: 'ar-btn small ghost', 'data-ui': 'menu', hidden: first, onclick: () => actions.menu() }, t('hud.menu'));
  const top = h('div', { class: 'ar-top' }, goal, scent, rules, menu);

  let holdTimer: ReturnType<typeof setTimeout> | null = null, held = false;
  const undo = h('button', { class: 'ar-btn small paper', 'data-ui': 'undo', hidden: first }, h('span', null, t('hud.undo')), h('small', { class: 'ar-sub' }, t('hud.undoHold')));
  undo.addEventListener('pointerdown', () => { held = false; holdTimer = setTimeout(() => { held = true; holdTimer = null; actions.clear(); }, 600); });
  const endHold = () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } };
  undo.addEventListener('pointerup', endHold); undo.addEventListener('pointerleave', endHold); undo.addEventListener('pointercancel', endHold);
  undo.addEventListener('click', () => { if (held) { held = false; return; } actions.undo(); });
  const tokenCount = h('b');
  const digger = h('button', { class: 'ar-btn small honey', 'data-ui': 'digger', hidden: !level.diggers, 'aria-pressed': 'false', onclick: () => actions.digger() }, h('span', null, t('hud.digger')), tokenCount);
  const goLabel = h('span');
  const go = h('button', { class: 'ar-btn primary big', 'data-ui': 'go', hidden: true, onclick: () => (session.mode === 'plan' ? actions.go() : actions.retry()) }, goLabel);
  const bottom = h('div', { class: 'ar-bottom' }, undo, digger, go);

  const reason = h('p'), retryNote = h('small');
  const hint = h('button', { class: 'ar-btn small honey', 'data-ui': 'hint', hidden: true, onclick: () => actions.hint() }, t('hud.hint'));
  const banner = h('div', { class: 'ar-banner', role: 'alert', hidden: true }, reason, retryNote, hint);
  const element = h('div', { class: 'ar-hud' }, top, banner, bottom);

  let shown = '';
  // The last refused paint, shown for a moment so a refused drag always says why.
  let denied: { key: `deny.${PaintFail}`; at: number } | null = null;
  const hud: PuzzleHud = {
    element,
    setHint(on) { hint.hidden = !on; if (on) hint.textContent = t('hud.hintAsk'); },
    update() {
      const run = session.run, mode = session.mode;
      const goalStr = goalText(i18n, level);
      const sub = mode === 'run' ? t('hud.running') : t('hud.squad', { n: level.squad.length });
      const key = [goalStr, run?.crumbs ?? -1, sub, session.plan.cost, mode, session.canGo, session.canUndo, session.tool, diggersLeft(session.plan), !!session.fail, session.connected].join('|');
      if (key === shown) return;
      shown = key;
      goalLabel.textContent = goalStr + (run && level.goal.crumbs ? ` · ${Math.min(run.crumbs, level.goal.crumbs)}/${level.goal.crumbs}` : '');
      goalSub.textContent = sub;
      if (level.scent !== null) {
        const left = Math.max(0, scentLeft(session.plan));
        scentNum.textContent = t('hud.scentLeft', { n: left });
        const total = level.scent;
        if (pips.childElementCount !== total) pips.replaceChildren(...Array.from({ length: total }, () => h('i')));
        [...pips.children].forEach((pip, k) => pip.classList.toggle('on', k < left));
        scent.classList.toggle('empty', left === 0);
      }
      const planning = mode === 'plan';
      go.hidden = !(session.connected || !planning);
      go.disabled = planning && !session.canGo;
      goLabel.textContent = planning ? t('hud.go') : t('hud.retry');
      go.classList.toggle('pulse', planning && session.canGo && first);
      go.classList.toggle('running', !planning);
      if (!first) { undo.disabled = !session.canUndo; }
      tokenCount.textContent = ` ×${diggersLeft(session.plan)}`;
      digger.disabled = !planning || diggersLeft(session.plan) <= 0;
      digger.setAttribute('aria-pressed', String(session.tool === 'digger'));
      if (session.fail && planning) { banner.hidden = false; reason.textContent = failText(i18n, level, session.fail.reason); retryNote.textContent = t('fail.retry'); }
      else if (session.tool === 'digger' && planning) { banner.hidden = false; reason.textContent = t('hud.diggerHint'); retryNote.textContent = ''; }
      // Out of Scent before the trail is useful: a dead end unless it says what to do, so it stays up until it is fixed.
      else if (planning && !session.canGo && session.plan.cost > 0 && scentLeft(session.plan) <= 0) { banner.hidden = false; reason.textContent = t('deny.scentStuck'); retryNote.textContent = t('deny.scentFix'); }
      else if (planning && denied && Date.now() - denied.at < 1800) { banner.hidden = false; reason.textContent = t(denied.key); retryNote.textContent = ''; }
      else banner.hidden = true;
      banner.classList.toggle('info', !session.fail);
      if (!session.fail) hint.hidden = true;
    },
    onEvent(event) {
      if (event.type === 'deny') denied = { key: `deny.${event.reason}`, at: Date.now() };
      if (event.type === 'paint' || event.type === 'erase' || event.type === 'go') denied = null;
      if (event.type === 'deny' && event.reason === 'scent') { scent.classList.remove('shake'); void scent.offsetWidth; scent.classList.add('shake'); }
    },
    insets() {
      const r = element.getBoundingClientRect?.();
      const tr = top.getBoundingClientRect?.(), br = bottom.getBoundingClientRect?.();
      if (!r || !tr || !br || r.height === 0) return { top: 56, right: 0, bottom: 76, left: 0 };
      // The bottom row is reserved even while GO is still hidden, so the board never jumps when it appears.
      return { top: Math.max(0, tr.bottom - r.top), right: 0, bottom: Math.max(72, r.bottom - br.top), left: 0 };
    }
  };
  hud.update();
  return hud;
}
