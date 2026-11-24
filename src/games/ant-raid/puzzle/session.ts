import {
  assign, clonePlan, createPlan, createRun, cut, cx, cy, diggersLeft, drainRun, explain, idx, inside, isTrail, paint, placeDig, removeDig,
  routeTo, stepRun, walking, foodCell, type Assignment, type FailReason, type PaintFail, type Plan, type Run, type RunEvent
} from './sim';
import { PCOLS, TPS, type PuzzleLevel } from './types';

/**
 * One level being played: the plan being drawn, its live assignment (the badges), and the run once GO is pressed.
 * Input and the HUD call methods here; the renderer reads it. No DOM.
 *
 * Modes: `plan` (clock stopped, edit freely) -> GO -> `run` (ticks play; hold for 3x) -> `won` (a short beat, then
 * the shell shows results) or, on a fail, `coast` (the run keeps moving a moment so the board shows why) -> `beat`
 * -> back to `plan` with the trail kept and the loss marked where it happened.
 */
export type Mode = 'plan' | 'run' | 'coast' | 'beat' | 'won';
export type FailMark = { reason: FailReason; lost: { cell: number; cause: string }[]; version: number };
export type SessionEvent = RunEvent | { type: 'deny'; reason: PaintFail; cell: number } | { type: 'paint'; cell: number } | { type: 'erase'; n: number } | { type: 'go' } | { type: 'fail'; reason: FailReason } | { type: 'won' } | { type: 'connect'; food: number } | { type: 'dig'; cell: number };

export type Session = {
  readonly level: PuzzleLevel;
  readonly plan: Plan;
  readonly assignment: Assignment;
  readonly run: Run | null;
  readonly mode: Mode;
  readonly fail: FailMark | null;
  readonly canGo: boolean;
  readonly canUndo: boolean;
  readonly connected: boolean;
  /** Seconds since the run started (sim time). */
  readonly runSeconds: number;
  /** The plan's tool: drawing trail, or placing the Digger token. */
  tool: 'trail' | 'digger';
  hold: boolean;
  cursor: { x: number; y: number } | null;
  hover: { x: number; y: number } | null;
  /** Cells the hint has drawn as ghost dots, and the 1-1 tutorial path. */
  ghost: [number, number][];
  /** The last refused cell, for a red blink. */
  denied: { cell: number; t: number } | null;
  dragStart(x: number, y: number): void;
  dragTo(x: number, y: number): void;
  dragEnd(): void;
  /** Keyboard: move the cursor; with `paint` the move draws (or walks back along the trail, erasing). */
  moveCursor(dx: number, dy: number, paint?: boolean): void;
  /** Space / A: place a token at the cursor, or start drawing from it. */
  confirm(): void;
  undo(): void;
  clear(): void;
  go(): void;
  /** Leave a run early (Retry). */
  stop(): void;
  advance(seconds: number): SessionEvent[];
  /** Ticks of the most recent run (for the measurement scripts). */
  readonly lastRunTicks: number;
  /** Seconds left in the win beat (results show at 0). */
  readonly beatLeft: number;
};

export function createSession(level: PuzzleLevel, options: { reduced?: boolean } = {}): Session {
  let plan = createPlan(level);
  let assignment = assign(plan), assignedAt = plan.version, assignedPlan = plan;
  let run: Run | null = null, mode: Mode = 'plan', fail: FailMark | null = null;
  let history: Plan[] = [];
  let drag: { last: number; moved: boolean; start: number; snap: Plan | null; tap: boolean; done?: boolean } | null = null;
  let failPlan: Plan | null = null;
  let acc = 0, beat = 0, coastTicks = 0, lastRunTicks = 0;
  const events: SessionEvent[] = [];
  const reduced = !!options.reduced;

  const refresh = () => { if (assignedPlan !== plan || assignedAt !== plan.version) { assignment = assign(plan); assignedAt = plan.version; assignedPlan = plan; } return assignment; };
  const reached = () => level.foods.map(f => isTrail(plan, foodCell(f)));
  const deny = (reason: PaintFail, cell: number) => { session.denied = { cell, t: 0 }; events.push({ type: 'deny', reason, cell }); };
  const snapshot = () => clonePlan(plan);
  const commit = (snap: Plan | null) => { if (snap && snap.version !== plan.version) { history.push(snap); if (history.length > 80) history.shift(); } };

  /** Leaf-first: a press next to the trail extends the nearest trail end rather than a cell in the middle. */
  function anchorFor(cell: number): number {
    if (isTrail(plan, cell)) return cell;
    let best = -1, bestScore = -1;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = cx(cell) + dx, y = cy(cell) + dy;
      if (!inside(x, y)) continue;
      const n = idx(x, y);
      if (!isTrail(plan, n)) continue;
      const leaf = !plan.parent.some(p => p === n);
      const score = (leaf ? 1000 : 0) + routeTo(plan, n).length;
      if (score > bestScore) { bestScore = score; best = n; }
    }
    return best;
  }

  function stepTo(next: number): boolean {
    if (!drag) return false;
    const last = drag.last;
    if (isTrail(plan, next)) {
      // Walking back onto the parent erases the cell just left, if nothing hangs off it: drag back to undo.
      if (plan.parent[last] === next && !plan.parent.some(p => p === last) && plan.digs.every(d => d.at !== last)) {
        cut(plan, last); events.push({ type: 'erase', n: 1 });
      }
      drag.last = next;
      return true;
    }
    const before = reached();
    const result = paint(plan, next, last);
    if (!result.ok) { deny(result.reason, next); return false; }
    events.push({ type: 'paint', cell: next });
    const after = reached();
    after.forEach((r, f) => { if (r && !before[f]) events.push({ type: 'connect', food: f }); });
    const jumped = plan.twin[next] >= 0 && plan.parent[plan.twin[next]] === next;
    drag.last = jumped ? plan.twin[next] : next;
    drag.moved = true;
    // Through a twin hole the gesture ends: the next drag starts from the exit.
    if (jumped) { drag.done = true; return false; }
    return true;
  }
  function clearFailIfEdited() { if (fail && (failPlan !== plan || fail.version !== plan.version)) fail = null; }

  const session: Session = {
    level,
    get plan() { return plan; },
    get assignment() { return refresh(); },
    get run() { return run; },
    get mode() { return mode; },
    get fail() { return fail; },
    get connected() { return reached().some(Boolean); },
    get canGo() { return mode === 'plan' && reached().some(Boolean); },
    get canUndo() { return mode === 'plan' && history.length > 0; },
    get runSeconds() { return run ? run.tick / TPS : 0; },
    get lastRunTicks() { return lastRunTicks; },
    get beatLeft() { return mode === 'won' ? Math.max(0, beat) : 0; },
    tool: 'trail', hold: false, cursor: null, hover: null, ghost: [], denied: null,
    dragStart(x, y) {
      if (mode !== 'plan' || !inside(x, y)) return;
      const cell = idx(x, y);
      if (session.tool === 'digger' || plan.digs.some(d => d.at === cell)) { drag = { last: cell, moved: false, start: cell, snap: null, tap: true }; return; }
      const anchor = anchorFor(cell);
      if (anchor < 0) { deny('adjacent', cell); drag = null; return; }
      drag = { last: anchor, moved: false, start: cell, snap: snapshot(), tap: false };
      if (anchor !== cell) stepTo(cell);
      clearFailIfEdited();
    },
    dragTo(x, y) {
      if (!drag || drag.done || mode !== 'plan' || !inside(x, y)) return;
      const target = idx(x, y);
      // A press on a Digger token is a tap (remove it) unless the finger moves on: then it draws on from there.
      if (drag.tap) {
        if (session.tool === 'digger' || target === drag.start) return;
        drag = { last: drag.start, moved: false, start: drag.start, snap: snapshot(), tap: false };
      }
      let guard = 0;
      while (drag.last !== target && guard++ < 40) {
        const lx = cx(drag.last), ly = cy(drag.last);
        const dx = Math.sign(x - lx), dy = Math.sign(y - ly);
        const nx = Math.abs(x - lx) >= Math.abs(y - ly) ? lx + dx : lx, ny = Math.abs(x - lx) >= Math.abs(y - ly) ? ly : ly + dy;
        if (!stepTo(idx(nx, ny))) break;
      }
      clearFailIfEdited();
    },
    dragEnd() {
      if (!drag) return;
      if (drag.tap) {
        const cell = drag.start, snap = snapshot();
        if (plan.digs.some(d => d.at === cell)) { removeDig(plan, cell); commit(snap); }
        else if (session.tool === 'digger') {
          if (placeDig(plan, cell)) { commit(snap); events.push({ type: 'dig', cell }); if (diggersLeft(plan) <= 0) session.tool = 'trail'; }
          else deny('terrain', cell);
        }
        drag = null; clearFailIfEdited();
        return;
      }
      commit(drag.snap);
      drag = null;
      clearFailIfEdited();
    },
    moveCursor(dx, dy, painting = false) {
      if (!session.cursor) { session.cursor = { x: cx(plan.nest), y: cy(plan.nest) }; session.hover = null; return; }
      const from = idx(session.cursor.x, session.cursor.y);
      const nx = Math.max(0, Math.min(PCOLS - 1, session.cursor.x + dx)), ny = Math.max(0, Math.min(8, session.cursor.y + dy));
      session.cursor = { x: nx, y: ny }; session.hover = null;
      if (!painting || mode !== 'plan' || session.tool !== 'trail') return;
      const to = idx(nx, ny);
      if (!isTrail(plan, from) && !isTrail(plan, to)) return;
      const snap = snapshot();
      drag = { last: isTrail(plan, from) ? from : anchorFor(to), moved: false, start: from, snap, tap: false };
      if (drag.last >= 0) stepTo(to);
      commit(snap);
      // Through a hole the cursor follows the trail out of the twin.
      if (drag.last >= 0 && drag.last !== to) session.cursor = { x: cx(drag.last), y: cy(drag.last) };
      drag = null;
      clearFailIfEdited();
    },
    confirm() {
      if (!session.cursor) { session.moveCursor(0, 0); return; }
      const cell = idx(session.cursor.x, session.cursor.y);
      if (session.tool === 'digger' || plan.digs.some(d => d.at === cell)) { session.dragStart(session.cursor.x, session.cursor.y); session.dragEnd(); }
    },
    undo() {
      if (mode !== 'plan') return;
      const prev = history.pop();
      if (!prev) return;
      plan = prev; events.push({ type: 'erase', n: 1 }); clearFailIfEdited();
    },
    clear() {
      if (mode !== 'plan') return;
      const fresh = createPlan(level);
      if (fresh.cost === plan.cost && plan.digs.length === 0) return;
      history.push(snapshot()); plan = fresh;
      events.push({ type: 'erase', n: 99 }); clearFailIfEdited();
    },
    go() {
      if (!session.canGo) return;
      run = createRun(plan); fail = null; acc = 0; coastTicks = 0;
      mode = run.status === 'lost' ? 'coast' : 'run';
      events.push({ type: 'go' });
      events.push(...drainRun(run));
    },
    stop() {
      if (mode === 'run' || mode === 'coast' || mode === 'beat') { lastRunTicks = run?.tick ?? 0; run = null; mode = 'plan'; session.hold = false; }
    },
    advance(seconds) {
      if (mode === 'run' || mode === 'coast') {
        let speed = session.hold ? 3 : 1;
        if (mode === 'coast') speed = 2;
        // The winning crumb plays in slow motion.
        else if (!reduced && run && nearWin(run)) speed = Math.min(speed, 0.4);
        acc = Math.min(acc + seconds * TPS * speed, TPS * 0.5);
        while (acc >= 1 && run) {
          acc -= 1;
          if (mode === 'run') {
            stepRun(run);
            events.push(...drainRun(run));
            if (run.status === 'won') { mode = 'won'; beat = 0.45; lastRunTicks = run.tick; events.push({ type: 'won' }); break; }
            if (run.status === 'lost') { mode = 'coast'; coastTicks = 0; lastRunTicks = run.tick; }
          } else {
            // Coast at most 0.4 s of sim time, then show the verdict.
            if (coastTicks++ >= TPS * 0.4 || !walking(run)) { explain(run); mode = 'beat'; beat = 0.25; break; }
            stepRun(run, true);
            events.push(...drainRun(run).filter(e => e.type !== 'end'));
          }
        }
        if (mode === 'coast' && run && (!walking(run) || coastTicks >= TPS * 0.4)) { explain(run); mode = 'beat'; beat = 0.25; }
      } else if (mode === 'beat') {
        beat -= seconds;
        if (beat <= 0 && run) {
          const reason = run.reason ?? { kind: 'time' as const };
          fail = { reason, lost: run.ants.filter(a => a.lost).map(a => ({ cell: a.lost!.cell, cause: a.lost!.cause })), version: plan.version }; failPlan = plan;
          events.push({ type: 'fail', reason });
          run = null; mode = 'plan'; session.hold = false;
        }
      } else if (mode === 'won') {
        beat -= seconds;
        // The rest of the colony keeps walking home while the win sinks in.
        if (run) { acc = Math.min(acc + seconds * TPS, TPS * 0.5); while (acc >= 1) { acc -= 1; stepRun(run, true); } drainRun(run).forEach(e => { if (e.type === 'deliver') events.push(e); }); }
      }
      if (session.denied) { session.denied.t += seconds; if (session.denied.t > 0.6) session.denied = null; }
      return events.splice(0);
    }
  };
  /** One delivery (or one big item a cell from home) from winning. */
  function nearWin(r: Run): boolean {
    const goal = level.goal;
    const itemsLeft = goal.items.filter(id => !r.items[level.foods.findIndex(f => f.id === id)].home);
    const crumbsLeft = goal.crumbs - r.crumbs;
    if (itemsLeft.length === 0 && crumbsLeft > 0) return r.ants.some(a => a.phase === 'home' && a.load >= crumbsLeft && a.i <= 1);
    if (itemsLeft.length === 1 && crumbsLeft <= 0) { const item = r.items[level.foods.findIndex(f => f.id === itemsLeft[0])]; return item.moving && item.i >= item.route.length - 3; }
    return false;
  }
  return session;
}
