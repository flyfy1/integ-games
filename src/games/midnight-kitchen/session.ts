import type { ViewState } from './render/renderer';
import { canPlace, createSim, defenderAt, drainEvents, place, remove, step, STEP, upgrade } from './sim';
import type { ActionResult, LevelDef, MetaState, RecipeDef, Sim, SimEvent, TutorialStep } from './types';

/**
 * One night on the counter: the sim plus everything about how the player is touching it (selected card, spatula
 * mode, cursor, open popover, tutorial step, game speed, placement preview). Input and the HUD call the methods
 * here; the renderer reads `view`. No DOM in this file, so the whole interaction model is unit-testable.
 */
export type DenyReason = Extract<ActionResult, { ok: false }>['reason'];
export type Preview = NonNullable<ViewState['preview']>;
export type Session = {
  readonly sim: Sim;
  readonly level: LevelDef;
  readonly view: ViewState;
  speed: 1 | 2;
  /** Current coach mark from the level script, or null. */
  readonly tutorial: TutorialStep | null;
  /** Index of the current tutorial step (steps.length when finished). */
  readonly tutorialIndex: number;
  selectCard(def: string | null): void;
  /** Q / E: move the selection to the previous / next card in the hand (wraps; starts from the first card). */
  cycleCard(direction: 1 | -1): void;
  toggleSpatula(force?: boolean): void;
  setHover(cell: { col: number; lane: number } | null): void;
  /** Tap / click / confirm on a cell: place, remove, or open the defender's popover depending on the mode. */
  tapCell(col: number, lane: number): void;
  /** Keyboard cursor. `dx`, `dy` are in board terms: +col is toward the enemies, +lane is the next lane. */
  moveCursor(dCol: number, dLane: number): void;
  confirm(): void;
  upgradeAt(col: number, lane: number): void;
  removeAt(col: number, lane: number): void;
  /** Upgrade / remove whatever is selected or under the cursor. */
  upgradeTarget(): void;
  removeTarget(): void;
  /** Close the popover, drop the card, leave spatula mode. Returns false when there was nothing to cancel. */
  cancel(): boolean;
  hideCursor(): void;
  /** Skip the rest of the level's scripted coach marks. */
  skipTutorial(): void;
  /** Advance by real seconds (scaled by speed); returns the sim events produced. */
  advance(seconds: number): SimEvent[];
};

export type SessionOptions = {
  random: () => number; loadout: string[]; meta: MetaState; speed?: 1 | 2; onDeny?: (reason: DenyReason) => void;
  /** First tutorial step to show (steps already completed in an earlier attempt are not repeated). */
  tutorialFrom?: number;
  /** Called with the new index whenever a tutorial step completes. */
  onTutorial?: (index: number) => void;
};

/**
 * Recipes that putting `def` on (col, lane) would newly complete. Mirrors the sim's matcher (orthogonal neighbours;
 * pairs side by side, triples as a chain or L with any member in the middle) on a board that includes the ghost.
 */
export function recipesIfPlaced(sim: Sim, def: string, col: number, lane: number): { recipe: RecipeDef; cells: [number, number][] }[] {
  type Piece = { def: string; col: number; lane: number; ghost: boolean };
  const at = new Map<number, Piece>();
  for (const d of sim.defenders) at.set(d.lane * 100 + d.col, { def: d.def, col: d.col, lane: d.lane, ghost: false });
  const ghost: Piece = { def, col, lane, ghost: true };
  at.set(lane * 100 + col, ghost);
  const neighbours = (p: Piece, id: string): Piece[] => [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dc, dl]) => at.get((p.lane + dl) * 100 + p.col + dc)).filter((n): n is Piece => !!n && n.def === id);
  const out: { recipe: RecipeDef; cells: [number, number][] }[] = [];
  for (const recipe of sim.content.recipes) {
    if (!recipe.parts.includes(def)) continue;
    let found: Piece[] | null = null;
    const [a, b, c] = recipe.parts;
    const pieces = [...at.values()];
    if (recipe.parts.length === 2) {
      for (const p of pieces) { if (p.def !== a) continue; for (const n of neighbours(p, b)) if (p !== n && (p.ghost || n.ghost)) { found = [p, n]; break; } if (found) break; }
    } else if (recipe.parts.length === 3) {
      outer: for (const [mid, x, y] of [[a, b, c], [b, a, c], [c, a, b]]) for (const p of pieces) {
        if (p.def !== mid) continue;
        for (const n1 of neighbours(p, x)) for (const n2 of neighbours(p, y)) if (n1 !== n2 && n1 !== p && n2 !== p && (p.ghost || n1.ghost || n2.ghost)) { found = [p, n1, n2]; break outer; }
      }
    }
    if (found) out.push({ recipe, cells: found.map(p => [p.col, p.lane] as [number, number]) });
  }
  return out;
}

export function createSession(level: LevelDef, options: SessionOptions): Session {
  const sim = createSim(level, { random: options.random, loadout: options.loadout, meta: options.meta });
  const view: ViewState = { sim, time: 0, card: null, spatula: false, hover: null, cursor: null, selected: null, focusCell: null, focusDefender: null, preview: null, dragging: false };
  const steps = level.tutorial ?? [];
  let tutorialIndex = Math.max(0, Math.min(steps.length, options.tutorialFrom ?? 0)), accumulator = 0;
  let previewKey = '';
  const deny = (reason: DenyReason) => options.onDeny?.(reason);

  const syncTutorial = () => {
    const current = steps[tutorialIndex] ?? null, focus = current?.focus;
    view.focusCell = focus && 'cell' in focus ? { col: focus.cell[0], lane: focus.cell[1] } : null;
    view.focusDefender = focus && 'defender' in focus ? focus.defender : null;
  };
  const advanceTutorial = (events: SimEvent[]) => {
    const start = tutorialIndex;
    for (;;) {
      const current = steps[tutorialIndex];
      if (!current) break;
      const until = current.until;
      const done = 'time' in until ? sim.time >= until.time : events.some(event => event.type === until.on && (until.def === undefined || (event as { def?: string }).def === until.def));
      if (!done) break;
      tutorialIndex++;
    }
    if (tutorialIndex !== start) options.onTutorial?.(tutorialIndex);
    syncTutorial();
  };
  syncTutorial();

  /** Recomputes `view.preview` when the held card, the target cell or the board changes. */
  const syncPreview = () => {
    const target = view.hover ?? view.cursor;
    if (!view.card || !target || sim.status !== 'playing') { view.preview = null; previewKey = ''; return; }
    const card = sim.cards.find(item => item.def === view.card);
    const key = `${view.card}:${target.col},${target.lane}:${sim.defenders.length}:${sim.links.length}:${sim.heat >= (sim.content.defenders[view.card]?.cost ?? 0)}:${(card?.cooldown ?? 0) > 0}:${sim.cells[target.lane]?.[target.col]?.mold > 0}`;
    if (key === previewKey && view.preview) return;
    previewKey = key;
    const check = canPlace(sim, view.card, target.col, target.lane);
    const geometryOk = check.ok || check.reason === 'heat' || check.reason === 'cooldown';
    const recipes = geometryOk ? recipesIfPlaced(sim, view.card, target.col, target.lane).map(({ recipe, cells }) => ({ recipe: recipe.id, color: recipe.color, cells })) : [];
    view.preview = { col: target.col, lane: target.lane, ok: check.ok, reason: check.ok ? null : check.reason, recipes };
  };

  const session: Session = {
    sim, level, view, speed: options.speed ?? 1,
    get tutorial() { return steps[tutorialIndex] ?? null; },
    get tutorialIndex() { return tutorialIndex; },
    selectCard(def) {
      view.card = def && sim.cards.some(card => card.def === def) && view.card !== def ? def : null;
      view.spatula = false; view.selected = null;
      syncPreview();
    },
    cycleCard(direction) {
      const cards = sim.cards;
      if (!cards.length) return;
      const index = cards.findIndex(card => card.def === view.card);
      const next = index < 0 ? (direction > 0 ? 0 : cards.length - 1) : (index + direction + cards.length) % cards.length;
      view.card = cards[next].def; view.spatula = false; view.selected = null;
      syncPreview();
    },
    toggleSpatula(force) { view.spatula = force ?? !view.spatula; view.card = null; view.selected = null; syncPreview(); },
    setHover(cell) { view.hover = cell; syncPreview(); },
    tapCell(col, lane) {
      if (sim.status !== 'playing') return;
      if (view.card) {
        const result = place(sim, view.card, col, lane);
        if (result.ok) view.card = null; else deny(result.reason);
        syncPreview();
        return;
      }
      const here = defenderAt(sim, col, lane);
      if (view.spatula) { if (here) { remove(sim, col, lane); view.spatula = false; } else deny('empty'); return; }
      view.selected = here && view.selected !== here.id ? here.id : null;
    },
    moveCursor(dCol, dLane) {
      const lanes = sim.activeLanes, start = view.cursor ?? view.hover ?? { col: 1, lane: lanes[Math.floor(lanes.length / 2)] };
      if (!view.cursor) { view.cursor = { col: Math.max(0, Math.min(level.cols - 1, start.col)), lane: lanes.includes(start.lane) ? start.lane : lanes[0] }; view.hover = null; syncPreview(); return; }
      const index = Math.max(0, Math.min(lanes.length - 1, lanes.indexOf(view.cursor.lane) + dLane));
      view.cursor = { col: Math.max(0, Math.min(level.cols - 1, view.cursor.col + dCol)), lane: lanes[index] };
      view.hover = null;
      if (view.selected !== null) view.selected = null;
      syncPreview();
    },
    confirm() { if (!view.cursor) { session.moveCursor(0, 0); return; } session.tapCell(view.cursor.col, view.cursor.lane); },
    upgradeAt(col, lane) { const result = upgrade(sim, col, lane); if (!result.ok) deny(result.reason); },
    removeAt(col, lane) { const result = remove(sim, col, lane); if (!result.ok) deny(result.reason); else view.selected = null; },
    upgradeTarget() { const d = target(); if (d) session.upgradeAt(d.col, d.lane); else deny('empty'); },
    removeTarget() { const d = target(); if (d) session.removeAt(d.col, d.lane); else session.toggleSpatula(); },
    cancel() {
      if (view.selected === null && !view.card && !view.spatula) return false;
      view.selected = null; view.card = null; view.spatula = false;
      syncPreview();
      return true;
    },
    hideCursor() { view.cursor = null; syncPreview(); },
    skipTutorial() { if (tutorialIndex < steps.length) { tutorialIndex = steps.length; options.onTutorial?.(tutorialIndex); syncTutorial(); } },
    advance(seconds) {
      accumulator = Math.min(accumulator + seconds * session.speed, 0.25);
      while (accumulator >= STEP && sim.status === 'playing') { step(sim); accumulator -= STEP; }
      const events = drainEvents(sim);
      if (view.selected !== null && !sim.defenders.some(d => d.id === view.selected)) view.selected = null;
      advanceTutorial(events);
      if (view.card) syncPreview();
      return events;
    }
  };
  /** The defender an Upgrade / Remove key press means: the open popover first, then the cursor cell. */
  function target() {
    const selected = view.selected === null ? undefined : sim.defenders.find(d => d.id === view.selected);
    return selected ?? (view.cursor ? defenderAt(sim, view.cursor.col, view.cursor.lane) : undefined);
  }
  return session;
}
