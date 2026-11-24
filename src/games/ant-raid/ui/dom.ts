import { drawAnt } from '../render/sprites';
import type { CasteId } from '../types';

/** Tiny DOM builder for the menus: `h('button', { class: 'ar-btn', onclick }, 'Play')`. */
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

export const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), [tabindex="0"]';

/** Index of the nearest rect in a direction from `from` (or -1). */
export function nearestInDirection(from: DOMRect, rects: DOMRect[], dx: number, dy: number): number {
  const fx = from.left + from.width / 2, fy = from.top + from.height / 2;
  let best = -1, bestScore = Infinity;
  rects.forEach((r, i) => {
    const x = r.left + r.width / 2 - fx, y = r.top + r.height / 2 - fy;
    const along = x * dx + y * dy;
    if (along <= 4) return;
    const across = Math.abs(x * dy) + Math.abs(y * dx);
    const score = along + across * 2.2;
    if (score < bestScore) { bestScore = score; best = i; }
  });
  return best;
}

/** A small canvas with one ant of a caste, for cards. */
export function casteIcon(caste: CasteId, size = 44): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const pr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
  canvas.width = size * pr; canvas.height = size * pr;
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (ctx && typeof ctx.setTransform === 'function') { ctx.setTransform(pr, 0, 0, pr, 0, 0); drawAnt(ctx, size / 2, size / 2 + 2, size * (caste === 'porter' || caste === 'honeypot' ? 0.78 : 0.7), -Math.PI / 2 + 0.5, caste, 1.2); }
  return canvas;
}

export function stars(count: number, total = 3): HTMLElement {
  return h('span', { class: 'ar-stars', role: 'img', 'aria-label': `${count}/${total}` }, Array.from({ length: total }, (_, i) => h('i', { class: i < count ? 'on' : '' }, '★')));
}
