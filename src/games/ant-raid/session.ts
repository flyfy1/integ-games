import { CASTES } from './data/castes';
import { idx, inside, isTrail } from './core';
import type { ViewState } from './render/renderer';
import { createSim, cyclePriority, drainEvents, erase, paint, playCard, queenCall, step, STEP, toggleBridge, type ActionResult } from './sim';
import { COLS, type CasteId, type DenyReason, type LevelDef, type MetaState, type QueenCall, type Sim, type SimEvent, type TutorialStep } from './types';

/**
 * One raid: the sim plus how the player is touching it (selected card, eraser, cursor, drag-painting, tutorial step,
 * game speed). Input and the HUD call the methods here; the renderer reads `view`. No DOM in this file.
 */
export type Session = {
  readonly sim: Sim;
  readonly level: LevelDef;
  readonly view: ViewState;
  speed: 1 | 2;
  readonly tutorial: TutorialStep | null;
  readonly tutorialIndex: number;
  /** Stream card: hatch now. Post card: select it (tap a lit cell next). Same card again: deselect. */
  pressCard(caste: CasteId): void;
  /** Q / E: move the highlighted card. */
  cycleCard(direction: 1 | -1): void;
  /** Play the highlighted card (stream: hatch; post: at the cursor). */
  playSelected(): void;
  readonly highlighted: CasteId | null;
  toggleEraser(force?: boolean): void;
  tapCell(x: number, y: number): void;
  dragStart(x: number, y: number): void;
  dragTo(x: number, y: number): void;
  dragEnd(): void;
  setHover(cell: { x: number; y: number } | null): void;
  moveCursor(dx: number, dy: number, painting?: boolean): void;
  confirm(): void;
  eraseAtCursor(): void;
  /** Tab: cycle the priority of the food under the cursor, or jump the cursor to the next food. */
  priorityAtCursor(): void;
  queen(call: QueenCall): void;
  /** What the contextual bridge button would do now: lift the bridge a dive is aimed at, or lower lifted bridges. */
  readonly bridgeHint: 'lift' | 'lower' | null;
  /** L / the bridge button: do what `bridgeHint` says. */
  bridgeAction(): void;
  cancel(): boolean;
  hideCursor(): void;
  skipTutorial(): void;
  advance(seconds: number): SimEvent[];
};

export type SessionOptions = {
  random: () => number; loadout?: CasteId[]; meta?: Partial<MetaState>; mercy?: number; speed?: 1 | 2; cap?: number;
  onDeny?: (reason: DenyReason) => void;
  tutorialFrom?: number;
  onTutorial?: (index: number) => void;
};

export function createSession(level: LevelDef, options: SessionOptions): Session {
  const sim = createSim(level, { random: options.random, loadout: options.loadout, meta: options.meta, mercy: options.mercy, cap: options.cap });
  const view: ViewState = { sim, time: 0, card: null, eraser: false, cursor: null, hover: null, ghost: [] };
  const steps = level.tutorial ?? [];
  let tutorialIndex = Math.max(0, Math.min(steps.length, options.tutorialFrom ?? 0));
  let stepCount = 0, accumulator = 0, highlighted: CasteId | null = null;
  let drag: { last: number; erasing: boolean; moved: boolean; start: number } | null = null;
  const check = (result: ActionResult) => { if (!result.ok) options.onDeny?.(result.reason); return result.ok; };

  const syncTutorial = () => { view.ghost = steps[tutorialIndex]?.cells ?? []; };
  const advanceTutorial = (events: SimEvent[]) => {
    const start = tutorialIndex;
    for (;;) {
      const current = steps[tutorialIndex];
      if (!current) break;
      const until = current.until;
      if ('time' in until) { if (sim.time < until.time) break; }
      else {
        stepCount += events.filter(e => e.type === until.event && (!until.caste || (e as { caste?: string }).caste === until.caste)).length;
        if (stepCount < (until.n ?? 1)) break;
      }
      tutorialIndex++; stepCount = 0;
      events = [];
    }
    if (tutorialIndex !== start) { options.onTutorial?.(tutorialIndex); syncTutorial(); }
  };
  syncTutorial();

  const cellIndex = (x: number, y: number) => idx(x, y);
  /** Finished bridges on the trail that are lifted (ants wait at them). */
  const liftedBridges = () => { const out: number[] = []; for (let c = 0; c < sim.terrain.length; c++) if (sim.terrain[c] === 'water' && sim.bridge[c] >= 3 && !sim.bridged[c] && isTrail(sim, c)) out.push(c); return out; };
  const foodAt = (c: number) => sim.foods.find(f => f.visible && !f.home && (f.lift ? f.at === c : idx(f.x, f.y) === c) && (f.lift || f.left > 0));

  /** Paint a 4-connected run of cells from the last painted cell to (x, y); stops at the first refusal. */
  function paintTo(x: number, y: number): void {
    if (!drag) return;
    const target = cellIndex(x, y);
    let guard = 0;
    while (drag.last !== target && guard++ < 40) {
      const lx = drag.last % COLS, ly = Math.floor(drag.last / COLS);
      const dx = Math.sign(x - lx), dy = Math.sign(y - ly);
      // Step along the longer axis first so diagonal drags make a staircase.
      const nx = Math.abs(x - lx) >= Math.abs(y - ly) ? lx + dx : lx, ny = Math.abs(x - lx) >= Math.abs(y - ly) ? ly : ly + dy;
      const next = cellIndex(nx, ny);
      if (isTrail(sim, next)) { drag.last = next; continue; }
      const result = paint(sim, next, drag.last);
      if (!result.ok) { if (!drag.moved) check(result); else if (result.reason === 'scent') check(result); drag = { ...drag, last: drag.last }; return; }
      drag.last = next; drag.moved = true;
    }
  }

  const session: Session = {
    sim, level, view, speed: options.speed ?? 1,
    get tutorial() { return steps[tutorialIndex] ?? null; },
    get tutorialIndex() { return tutorialIndex; },
    get highlighted() { return highlighted; },
    pressCard(caste) {
      if (!sim.cards.some(card => card.caste === caste)) return;
      highlighted = caste;
      view.eraser = false;
      if (CASTES[caste].kind === 'stream') { view.card = null; check(playCard(sim, caste)); return; }
      view.card = view.card === caste ? null : caste;
    },
    cycleCard(direction) {
      const cards = sim.cards;
      if (!cards.length) return;
      const index = cards.findIndex(card => card.caste === highlighted);
      const next = index < 0 ? (direction > 0 ? 0 : cards.length - 1) : (index + direction + cards.length) % cards.length;
      highlighted = cards[next].caste;
      view.card = CASTES[highlighted].kind === 'post' ? highlighted : null;
      view.eraser = false;
    },
    playSelected() {
      if (!highlighted) { session.cycleCard(1); return; }
      if (CASTES[highlighted].kind === 'stream') { check(playCard(sim, highlighted)); return; }
      view.card = highlighted;
      if (view.cursor) session.tapCell(view.cursor.x, view.cursor.y);
    },
    toggleEraser(force) { view.eraser = force ?? !view.eraser; if (view.eraser) view.card = null; },
    tapCell(x, y) {
      if (sim.status !== 'playing' || !inside(x, y)) return;
      const c = cellIndex(x, y);
      if (view.card && CASTES[view.card].kind === 'post') {
        if (check(playCard(sim, view.card, c))) view.card = null;
        return;
      }
      if (view.eraser) { check(erase(sim, c)); return; }
      const food = foodAt(c);
      if (food && isTrail(sim, c)) { cyclePriority(sim, food.index); return; }
      if (sim.terrain[c] === 'water' && sim.bridge[c] >= 3 && isTrail(sim, c)) { check(toggleBridge(sim, c)); return; }
      if (isTrail(sim, c)) return;
      check(paint(sim, c));
    },
    dragStart(x, y) {
      if (sim.status !== 'playing' || !inside(x, y)) return;
      const c = cellIndex(x, y);
      if (view.eraser) { drag = { last: c, erasing: true, moved: false, start: c }; if (isTrail(sim, c)) erase(sim, c); return; }
      // With a post card in hand, pressing a cell sends that ant there.
      if (view.card) { drag = null; session.tapCell(x, y); return; }
      if (isTrail(sim, c)) { drag = { last: c, erasing: false, moved: false, start: c }; return; }
      const result = paint(sim, c);
      drag = result.ok ? { last: c, erasing: false, moved: true, start: c } : null;
      if (!result.ok && result.reason !== 'adjacent') check(result);
      else if (!result.ok) options.onDeny?.('adjacent');
    },
    dragTo(x, y) {
      if (!drag || !inside(x, y)) return;
      if (drag.erasing) { const c = cellIndex(x, y); if (c !== drag.last) { drag.last = c; if (isTrail(sim, c)) erase(sim, c); } return; }
      paintTo(x, y);
    },
    dragEnd() {
      // A tap (no movement) on a trail cell is a tap: priority, bridges.
      if (drag && !drag.moved && !drag.erasing) { const c = drag.start; drag = null; session.tapCell(c % COLS, Math.floor(c / COLS)); return; }
      drag = null;
    },
    setHover(cell) { view.hover = cell; },
    moveCursor(dx, dy, painting = false) {
      if (!view.cursor) { view.cursor = { x: sim.nest % COLS, y: Math.floor(sim.nest / COLS) }; view.hover = null; return; }
      const from = cellIndex(view.cursor.x, view.cursor.y);
      const nx = Math.max(0, Math.min(COLS - 1, view.cursor.x + dx)), ny = Math.max(0, Math.min(8, view.cursor.y + dy));
      view.cursor = { x: nx, y: ny }; view.hover = null;
      const to = cellIndex(nx, ny);
      if (painting && !view.card) {
        if (view.eraser) { if (isTrail(sim, to)) check(erase(sim, to)); }
        else if (!isTrail(sim, to)) check(paint(sim, to, isTrail(sim, from) ? from : -1));
      }
    },
    confirm() {
      if (!view.cursor) { session.moveCursor(0, 0); return; }
      session.tapCell(view.cursor.x, view.cursor.y);
    },
    eraseAtCursor() {
      if (!view.cursor) { session.toggleEraser(); return; }
      check(erase(sim, cellIndex(view.cursor.x, view.cursor.y)));
    },
    priorityAtCursor() {
      const foods = sim.foods.filter(f => f.visible && !f.home && (f.lift || f.left > 0));
      if (!foods.length) return;
      const here = view.cursor ? foodAt(cellIndex(view.cursor.x, view.cursor.y)) : undefined;
      if (here) { cyclePriority(sim, here.index); return; }
      const next = foods[0];
      view.cursor = { x: Math.round(next.lift ? next.px : next.x), y: Math.round(next.lift ? next.py : next.y) };
    },
    queen(call) { check(queenCall(sim, call)); },
    get bridgeHint() {
      const dive = sim.hazards.find(h => h.active && h.kind === 'kingfisher' && h.phase === 1);
      if (dive) return dive.cells.some(c => sim.bridged[c]) ? 'lift' : null;
      return liftedBridges().length ? 'lower' : null;
    },
    bridgeAction() {
      const dive = sim.hazards.find(h => h.active && h.kind === 'kingfisher' && h.phase === 1);
      if (dive) { for (const c of dive.cells) if (sim.bridged[c]) check(toggleBridge(sim, c)); return; }
      for (const c of liftedBridges()) check(toggleBridge(sim, c));
    },
    cancel() {
      if (!view.card && !view.eraser) return false;
      view.card = null; view.eraser = false;
      return true;
    },
    hideCursor() { view.cursor = null; },
    skipTutorial() { if (tutorialIndex < steps.length) { tutorialIndex = steps.length; options.onTutorial?.(tutorialIndex); syncTutorial(); } },
    advance(seconds) {
      accumulator = Math.min(accumulator + seconds * session.speed, 0.25);
      while (accumulator >= STEP && sim.status === 'playing') { step(sim); accumulator -= STEP; }
      const events = drainEvents(sim);
      advanceTutorial(events);
      return events;
    }
  };
  return session;
}
