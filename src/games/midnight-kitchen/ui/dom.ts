import type { UiContext } from './context';

/** Tiny DOM builder for the menus. `h('button', { class: 'mk-btn', onclick }, 'Play')`. */
type Child = Node | string | number | null | undefined | false;
type Props = { class?: string; text?: string; [key: string]: unknown };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (props) for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') element.className = String(value);
    else if (key === 'text') element.textContent = String(value);
    else if (key.startsWith('on') && typeof value === 'function') element.addEventListener(key.slice(2), value as EventListener);
    else if (key === 'disabled' || key === 'hidden') (element as unknown as Record<string, unknown>)[key] = !!value;
    else element.setAttribute(key, value === true ? '' : String(value));
  }
  if (tag === 'button' && !(props && 'type' in props)) element.setAttribute('type', 'button');
  for (const child of children.flat()) if (child !== null && child !== undefined && child !== false) element.append(child instanceof Node ? child : String(child));
  return element;
}

/** Star row such as ★★☆. */
export function stars(count: number, total = 3): HTMLElement {
  return h('span', { class: 'mk-stars', role: 'img', 'aria-label': `${count}/${total} ★` }, Array.from({ length: total }, (_, i) => h('i', { class: i < count ? 'on' : '' }, '★')));
}

/** The crumbs purse shown in screen headers. */
export function crumbs(ui: UiContext, amount = ui.save.crumbs): HTMLElement {
  return h('span', { class: 'mk-purse', title: ui.i18n.t('common.crumbs'), 'aria-label': `${ui.i18n.t('common.crumbs')}: ${amount}` }, h('i', { class: 'mk-crumb', 'aria-hidden': 'true' }), h('b', null, String(amount)));
}
export function starPurse(ui: UiContext, count: number): HTMLElement {
  return h('span', { class: 'mk-purse stars', 'aria-label': `${ui.i18n.t('common.stars')}: ${count}` }, h('i', { class: 'mk-staricon', 'aria-hidden': 'true' }, '★'), h('b', null, String(count)));
}

/** Screen header: Back, a title, and anything else on the right. */
export function head(ui: UiContext, title: string, back: (() => void) | null, ...extra: (HTMLElement | null)[]): HTMLElement {
  return h('header', { class: 'mk-screen-head' },
    back ? h('button', { class: 'mk-btn ghost back', 'data-action': 'back', 'aria-label': ui.i18n.t('common.back'), onclick: back }, h('span', { 'aria-hidden': 'true' }, '‹'), h('span', { class: 'mk-back-label' }, ui.i18n.t('common.back'))) : null,
    h('h2', null, title), h('div', { class: 'mk-head-extra' }, ...extra));
}

/** A screen shell: header + scrolling body. */
export function screen(name: string, header: HTMLElement | null, ...body: (Child | Child[])[]): HTMLElement {
  return h('div', { class: 'mk-screen', 'data-screen': name, role: 'region' }, header, h('div', { class: 'mk-body' }, ...body));
}

/** On/off switch built on a button (works with the pad: Space toggles). */
export function toggle(label: string, on: boolean, onChange: (value: boolean) => void, action: string, hint?: string): HTMLElement {
  const button = h('button', { class: 'mk-switch', role: 'switch', 'aria-checked': String(on), 'data-action': action, 'aria-label': label }, h('i', { 'aria-hidden': 'true' }));
  button.addEventListener('click', () => { const next = button.getAttribute('aria-checked') !== 'true'; button.setAttribute('aria-checked', String(next)); onChange(next); });
  // The whole row is the touch target: a tap on the label or hint flips the switch too.
  const row = h('div', { class: 'mk-setting has-switch' }, h('div', { class: 'mk-setting-text' }, h('b', null, label), hint ? h('small', null, hint) : null), button);
  row.addEventListener('click', event => { if (!button.contains(event.target as Node)) button.click(); });
  return row;
}

/** 0..1 slider with a percentage readout. */
export function slider(label: string, value: number, onChange: (value: number) => void, action: string): HTMLElement {
  const out = h('output', null, `${Math.round(value * 100)}%`);
  const input = h('input', { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(value * 100)), 'data-action': action, 'aria-label': label }) as HTMLInputElement;
  const paint = () => { input.style.setProperty('--fill', `${input.value}%`); out.textContent = `${input.value}%`; };
  input.addEventListener('input', () => { paint(); onChange(Number(input.value) / 100); });
  paint();
  return h('label', { class: 'mk-setting slider' }, h('div', { class: 'mk-setting-text' }, h('b', null, label), out), input);
}

type Box = { left: number; top: number; right: number; bottom: number };
/**
 * Spatial navigation for arrows / d-pad: the index of the box to move to from `from` in direction (dx, dy), or -1.
 * The nearest row (or column) in that direction wins first, then the one most in line with `from`, so Down from a
 * centred button lands on the pair of buttons right under it rather than skipping to a centred one further down.
 */
export function nearestInDirection(from: Box, boxes: Box[], dx: number, dy: number): number {
  const cx = (from.left + from.right) / 2, cy = (from.top + from.bottom) / 2;
  let best = -1, bestScore = Infinity;
  boxes.forEach((box, index) => {
    const bx = (box.left + box.right) / 2, by = (box.top + box.bottom) / 2;
    if ((bx - cx) * dx + (by - cy) * dy <= 4) return;
    const gap = Math.max(0, dx > 0 ? box.left - from.right : dx < 0 ? from.left - box.right : dy > 0 ? box.top - from.bottom : from.top - box.bottom);
    const across = dx !== 0 ? Math.abs(by - cy) : Math.abs(bx - cx);
    const score = gap * 4 + across;
    if (score < bestScore) { bestScore = score; best = index; }
  });
  return best;
}

/** Every element the menu keys can land on, in document order. */
export const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), [tabindex="0"]';
