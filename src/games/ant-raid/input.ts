import type { Session } from './session';
import { cellUnder, type Layout } from './render/layout';
import type { QueenCall } from './types';

/**
 * In-raid input. Touch / mouse: drag from the anthill or the trail to paint; tap a food to change its priority; with
 * a post card selected, tap a lit cell. Keyboard (and the gamepad bridge): arrows move the cursor, Space paints
 * (hold it while moving to draw), X cuts, 1-6 or Q/E + Enter play cards, T or Tab cycles food priority, S / R / H
 * are the Queen calls, F speed, P or Esc pause. In portrait the yard is rotated, so arrows follow the screen.
 */
export type InputDeps = {
  root: HTMLElement; canvas: HTMLCanvasElement;
  session(): Session | null; layout(): Layout;
  blocked(): boolean;
  pause(): void; toggleSpeed(): void;
};

export function attachInput(deps: InputDeps): () => void {
  const { root, canvas } = deps;
  let pointer: number | null = null, spaceHeld = false;
  const local = (event: PointerEvent) => { const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };

  const onDown = (event: PointerEvent) => {
    const session = deps.session();
    if (!session || deps.blocked()) return;
    const p = local(event), cell = cellUnder(deps.layout(), p.x, p.y);
    if (!cell) return;
    event.preventDefault();
    root.focus({ preventScroll: true });
    session.hideCursor();
    pointer = event.pointerId;
    try { canvas.setPointerCapture(event.pointerId); } catch { /* synthetic events */ }
    session.dragStart(cell.x, cell.y);
  };
  const onMove = (event: PointerEvent) => {
    const session = deps.session();
    if (!session) return;
    const p = local(event), cell = cellUnder(deps.layout(), p.x, p.y);
    if (pointer === event.pointerId) { if (cell) session.dragTo(cell.x, cell.y); return; }
    if (event.pointerType === 'mouse') session.setHover(cell);
  };
  const onUp = (event: PointerEvent) => {
    if (pointer !== event.pointerId) return;
    pointer = null;
    deps.session()?.dragEnd();
  };
  const onLeave = () => deps.session()?.setHover(null);

  const QUEEN: Record<string, QueenCall> = { s: 'scatter', r: 'rally', h: 'recall' };
  const onKey = (event: KeyboardEvent) => {
    const session = deps.session();
    if (!session || deps.blocked() || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const rot = deps.layout().rot;
    const arrows: Record<string, [number, number]> = rot
      ? { ArrowUp: [1, 0], ArrowDown: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
      : { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (arrows[key]) { event.preventDefault(); session.moveCursor(arrows[key][0], arrows[key][1], spaceHeld); return; }
    if (key === ' ') { event.preventDefault(); if (!event.repeat) { spaceHeld = true; session.confirm(); } return; }
    if (key === 'Enter') { event.preventDefault(); if (!event.repeat) session.playSelected(); return; }
    if (/^[1-9]$/.test(key)) { const card = session.sim.cards[Number(key) - 1]; if (card) { event.preventDefault(); session.pressCard(card.caste); } return; }
    if (key === 'q' || key === 'e') { event.preventDefault(); session.cycleCard(key === 'e' ? 1 : -1); return; }
    if (key === 'x') { event.preventDefault(); session.eraseAtCursor(); return; }
    if (key === 't' || key === 'Tab') { event.preventDefault(); session.priorityAtCursor(); return; }
    if (QUEEN[key]) { event.preventDefault(); if (!event.repeat) session.queen(QUEEN[key]); return; }
    if (key === 'f') { event.preventDefault(); if (!event.repeat) deps.toggleSpeed(); return; }
    if (key === 'p' || key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      if (key === 'Escape' && session.cancel()) return;
      deps.pause();
    }
  };
  const onKeyUp = (event: KeyboardEvent) => { if (event.key === ' ') spaceHeld = false; };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onLeave);
  root.addEventListener('keydown', onKey);
  root.addEventListener('keyup', onKeyUp);
  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    canvas.removeEventListener('pointerleave', onLeave);
    root.removeEventListener('keydown', onKey);
    root.removeEventListener('keyup', onKeyUp);
  };
}
