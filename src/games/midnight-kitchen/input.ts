import type { BoardLayout } from './render/layout';
import type { Session } from './session';

/**
 * Player input for a level, in one place: pointer / touch on the board, tap, drag or long-press on the card hand,
 * hover for the card info, and the keyboard map (which is also what the arcade's shared gamepad bridge drives).
 * It only ever calls `Session` methods plus a few HUD hooks, so every interaction rule stays testable.
 *
 * Keys: 1-9 pick a card · Q / E previous / next card · arrows move the cell cursor · Space / Enter place or confirm ·
 * U upgrade · X remove (or toggle the spatula) · F speed · P pause · Esc cancel, then pause.
 */
export type InputHost = {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  session(): Session | null;
  layout(): BoardLayout | null;
  /** True while a menu, a dialogue or a pause is in front of the board. */
  blocked(): boolean;
  pause(): void;
  toggleSpeed(): void;
  /** UI blip for selection changes. */
  blip(kind: 'select' | 'deny'): void;
  /** Card info card (hover on desktop, long-press on touch); null hides it. */
  info?(def: string | null): void;
  /** Drag ghost under the finger / mouse; null hides it. */
  drag?(state: { def: string; x: number; y: number } | null): void;
  /** A card was picked without looking at the hand (keys, pad): say which. */
  announce?(def: string | null): void;
};

const DRAG_START = 12;
const LONG_PRESS = 420;
const HOVER_DELAY = 350;

export function attachInput(host: InputHost): () => void {
  const { root, canvas } = host;
  const off: (() => void)[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
  const clear = (id: ReturnType<typeof setTimeout> | null) => { if (id !== null) { clearTimeout(id); timers.delete(id); } };
  const on = <T extends Event>(target: EventTarget, type: string, fn: (event: T) => void, options?: AddEventListenerOptions) => {
    const listener = fn as EventListener;
    target.addEventListener(type, listener, options); off.push(() => target.removeEventListener(type, listener, options));
  };
  const active = () => (host.blocked() ? null : host.session());
  const cellAtPoint = (clientX: number, clientY: number) => {
    const layout = host.layout(), rect = canvas.getBoundingClientRect();
    if (!layout || !rect.width) return null;
    return layout.cellAt((clientX - rect.left) * layout.w / rect.width, (clientY - rect.top) * layout.h / rect.height);
  };
  const cellAt = (event: PointerEvent) => cellAtPoint(event.clientX, event.clientY);

  // ---- board ----
  let pressing = false;
  on<PointerEvent>(canvas, 'pointerdown', event => {
    const session = active();
    if (!session) return;
    event.preventDefault();
    root.focus({ preventScroll: true });
    session.hideCursor();
    pressing = true;
    session.setHover(cellAt(event));
    try { canvas.setPointerCapture(event.pointerId); } catch { /* synthetic pointers cannot be captured */ }
  });
  on<PointerEvent>(canvas, 'pointermove', event => {
    const session = active();
    if (!session || drag) return;
    if (pressing || event.pointerType === 'mouse') { if (event.pointerType === 'mouse' && session.view.cursor) session.hideCursor(); session.setHover(cellAt(event)); }
  });
  on<PointerEvent>(canvas, 'pointerup', event => {
    const session = active();
    if (!pressing) return;
    pressing = false;
    if (!session) return;
    const cell = cellAt(event);
    if (cell) session.tapCell(cell.col, cell.lane); else session.cancel();
    if (event.pointerType !== 'mouse') session.setHover(null);
  });
  on<PointerEvent>(canvas, 'pointercancel', () => { pressing = false; host.session()?.setHover(null); });
  on<PointerEvent>(canvas, 'pointerleave', event => { if (!pressing && event.pointerType === 'mouse') host.session()?.setHover(null); });

  // ---- card hand: tap to select, drag a card onto a cell, long-press (touch) or hover (mouse) for its info ----
  let drag: { def: string; x: number; y: number; id: number; moving: boolean; touch: boolean; scrub?: number } | null = null, swallowClick = false;
  let pressTimer: ReturnType<typeof setTimeout> | null = null, hoverTimer: ReturnType<typeof setTimeout> | null = null, infoOpen = false;
  const closeInfo = () => { clear(hoverTimer); hoverTimer = null; if (infoOpen) { infoOpen = false; host.info?.(null); } };
  const cardFrom = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLElement>('.mk-hand [data-card]') : null);

  on<PointerEvent>(root, 'pointerdown', event => {
    const card = cardFrom(event.target);
    if (!card || !active()) return;
    drag = { def: card.dataset.card!, x: event.clientX, y: event.clientY, id: event.pointerId, moving: false, touch: event.pointerType !== 'mouse' };
    swallowClick = false;
    closeInfo();
    clear(pressTimer);
    if (drag.touch) {
      // The card keeps the touch even when the finger leaves it, so the drag can be followed on the window.
      try { card.releasePointerCapture?.(event.pointerId); } catch { /* not captured */ }
      const def = drag.def;
      pressTimer = later(() => { pressTimer = null; if (drag && !drag.moving && drag.def === def) { infoOpen = true; host.info?.(def); } }, LONG_PRESS);
    }
  });
  on<PointerEvent>(window, 'pointermove', event => {
    const session = active();
    if (!drag || !session || event.pointerId !== drag.id) return;
    // A sideways swipe on a hand that scrolls (portrait phone, big hand) scrubs it; a pull up and onto the board drags
    // the card. Done here rather than with touch-action:pan-x, which would let the browser take a diagonal drag.
    const tray = root.querySelector<HTMLElement>('.mk-hand');
    if (drag.scrub === undefined && !drag.moving && drag.touch && tray && tray.scrollWidth > tray.clientWidth + 1) {
      const dx = Math.abs(event.clientX - drag.x), dy = Math.abs(event.clientY - drag.y);
      if (dx > DRAG_START / 2 && dx > dy * 1.2) { clear(pressTimer); pressTimer = null; drag.scrub = tray.scrollLeft + (event.clientX - drag.x); }
    }
    if (drag.scrub !== undefined) {
      if (tray) tray.scrollLeft = drag.scrub - (event.clientX - drag.x);
      if (event.cancelable) event.preventDefault();
      return;
    }
    if (!drag.moving && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < DRAG_START) return;
    if (!drag.moving) {
      if (infoOpen) return; // a long-press is reading the card, not dragging it
      drag.moving = true; clear(pressTimer); pressTimer = null;
      if (session.view.card !== drag.def) session.selectCard(drag.def);
      session.hideCursor(); session.view.dragging = true;
    }
    session.setHover(cellAtPoint(event.clientX, event.clientY));
    host.drag?.({ def: drag.def, x: event.clientX, y: event.clientY });
    if (event.cancelable) event.preventDefault();
  }, { passive: false });
  const endDrag = (event: PointerEvent, cancelled: boolean) => {
    if (!drag || event.pointerId !== drag.id) return;
    const session = active(), wasMoving = drag.moving, scrubbed = drag.scrub !== undefined;
    drag = null;
    if (scrubbed) { swallowClick = true; return; }
    clear(pressTimer); pressTimer = null;
    host.drag?.(null);
    if (infoOpen) { closeInfo(); swallowClick = true; return; }
    if (!wasMoving || !session) return;
    session.view.dragging = false;
    swallowClick = true;
    const cell = cancelled ? null : cellAtPoint(event.clientX, event.clientY);
    if (cell && session.view.card) session.tapCell(cell.col, cell.lane);
    else if (!cell) session.cancel();
    session.setHover(null);
  };
  on<PointerEvent>(window, 'pointerup', event => endDrag(event, false));
  on<PointerEvent>(window, 'pointercancel', event => endDrag(event, true));
  on<PointerEvent>(root, 'pointerover', event => {
    if (event.pointerType !== 'mouse' || drag) return;
    const card = cardFrom(event.target);
    if (!card || !active()) return;
    clear(hoverTimer);
    const def = card.dataset.card!;
    hoverTimer = later(() => { hoverTimer = null; if (active()) { infoOpen = true; host.info?.(def); } }, infoOpen ? 0 : HOVER_DELAY);
  });
  on<PointerEvent>(root, 'pointerout', event => {
    if (event.pointerType !== 'mouse') return;
    const from = cardFrom(event.target), to = cardFrom(event.relatedTarget);
    if (from && from !== to) { if (to) return; closeInfo(); }
  });
  on<Event>(root, 'contextmenu', event => { if (cardFrom(event.target)) event.preventDefault(); });
  on<MouseEvent>(root, 'click', event => {
    const session = active(), target = event.target instanceof Element ? event.target : null;
    if (!session || !target || !target.closest('.mk-hand')) return;
    if (swallowClick) { swallowClick = false; return; }
    const card = target.closest<HTMLElement>('[data-card]');
    if (card) { session.selectCard(card.dataset.card!); host.blip('select'); session.hideCursor(); }
    else if (target.closest('[data-action=spatula]')) { session.toggleSpatula(); host.blip('select'); }
    // Keep keyboard focus on the stage so Space places rather than re-pressing the card.
    root.focus({ preventScroll: true });
  });

  // ---- keyboard ----
  on<KeyboardEvent>(root, 'keydown', event => {
    const session = active();
    if (!session || event.ctrlKey || event.metaKey || event.altKey) return;
    const layout = host.layout(), vertical = !!layout?.vertical, key = event.key;
    let handled = true;
    const picked = () => { host.blip('select'); host.announce?.(session.view.card); if (!session.view.cursor && session.view.card) session.moveCursor(0, 0); };
    if (/^[1-9]$/.test(key)) { const card = session.sim.cards[Number(key) - 1]; if (card) { session.selectCard(card.def); picked(); } }
    else if (key === 'q' || key === 'Q') { session.cycleCard(-1); picked(); }
    else if (key === 'e' || key === 'E') { session.cycleCard(1); picked(); }
    else if (key === 'ArrowRight') session.moveCursor(vertical ? 0 : 1, vertical ? 1 : 0);
    else if (key === 'ArrowLeft') session.moveCursor(vertical ? 0 : -1, vertical ? -1 : 0);
    else if (key === 'ArrowUp') session.moveCursor(vertical ? 1 : 0, vertical ? 0 : -1);
    else if (key === 'ArrowDown') session.moveCursor(vertical ? -1 : 0, vertical ? 0 : 1);
    else if (key === ' ' || key === 'Enter') { if (!event.repeat) session.confirm(); }
    else if (key === 'u' || key === 'U') session.upgradeTarget();
    else if (key === 'x' || key === 'X') session.removeTarget();
    else if (key === 'f' || key === 'F') host.toggleSpeed();
    else if (key === 'p' || key === 'P') host.pause();
    else if (key === 'Escape') { if (!session.cancel()) host.pause(); }
    else handled = false;
    // Immediate: the menu key handler sits on the same element and must not see the key that just opened a menu.
    if (handled) { closeInfo(); event.preventDefault(); event.stopImmediatePropagation(); }
  });

  return () => { off.forEach(remove => remove()); off.length = 0; timers.forEach(id => clearTimeout(id)); timers.clear(); drag = null; pressing = false; };
}
