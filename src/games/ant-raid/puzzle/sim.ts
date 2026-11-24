import {
  BITE, BRIDGE, CARRY, GAP, MAX_TICKS, PCELLS, PCOLS, PROWS, WALK,
  type AntKind, type PFood, type PlanScript, type PTerrain, type PuzzleLevel
} from './types';

/**
 * The puzzle rules, pure and deterministic: no randomness, no clock, integer ticks. Two halves:
 *
 * Plan: the trail is a tree rooted at the nest (`parent[cell]` is the cell one step closer to the nest), plus any
 * Digger tokens. `assign` turns a plan into every ant's job, exactly as the badges show it:
 *   - every water cell on the trail takes the next three ants in leaving order as a bridge (R7);
 *   - every other ant, in order, takes the food nearest by trail length that still needs ants; ties go to the food
 *     listed first (R4). Jobs are fixed at GO and never reassigned: a lost ant's job is simply not done.
 * Run: `createRun` + `stepRun` play the plan out tick by tick. The run ends the moment the goal is met (won) or the
 * moment it can no longer be met (lost, with a reason the board can show).
 */
export const idx = (x: number, y: number) => y * PCOLS + x;
export const cx = (cell: number) => cell % PCOLS;
export const cy = (cell: number) => Math.floor(cell / PCOLS);
export const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < PCOLS && y < PROWS;
const DIRS: [number, number][] = [[1, 0], [0, -1], [-1, 0], [0, 1]];
export function neighbours(cell: number): number[] {
  const out: number[] = [];
  for (const [dx, dy] of DIRS) { const x = cx(cell) + dx, y = cy(cell) + dy; if (inside(x, y)) out.push(idx(x, y)); }
  return out;
}
const adjacent = (a: number, b: number) => Math.abs(cx(a) - cx(b)) + Math.abs(cy(a) - cy(b)) === 1;
const cheb = (a: number, x: number, y: number) => Math.max(Math.abs(cx(a) - x), Math.abs(cy(a) - y));

const TERRAIN: Record<string, PTerrain> = { '.': 'grass', '#': 'wall', '~': 'water', c: 'chalk', o: 'hole', O: 'hole', t: 'tape' };

// ------------------------------------------------------------------ plan
export type Dig = { at: number; dir: number; cells: number[] };
export type Plan = {
  level: PuzzleLevel;
  terrain: PTerrain[];
  /** -1 not trail, -2 the nest (root), else the parent cell. */
  parent: Int16Array;
  /** Scent spent (trail cells, the nest and free twin-hole exits not counted). */
  cost: number;
  digs: Dig[];
  nest: number;
  /** Cells nothing can be drawn on: the nest's neighbours are fine, a spider's or a toad's own cell is not. */
  blocked: Uint8Array;
  /** Twin hole of each hole cell, -1 otherwise. */
  twin: Int16Array;
  version: number;
};

export type PaintFail = 'scent' | 'adjacent' | 'terrain' | 'trail';
export type PaintResult = { ok: true } | { ok: false; reason: PaintFail };

export function createPlan(level: PuzzleLevel): Plan {
  const terrain: PTerrain[] = [];
  const twin = new Int16Array(PCELLS).fill(-1);
  const holes: Record<string, number[]> = {};
  for (let y = 0; y < PROWS; y++) for (let x = 0; x < PCOLS; x++) {
    const ch = level.grid[y]?.[x] ?? '.';
    terrain.push(TERRAIN[ch] ?? 'grass');
    if (ch === 'o' || ch === 'O') (holes.o ??= []).push(idx(x, y));
  }
  for (const pair of Object.values(holes)) if (pair.length === 2) { twin[pair[0]] = pair[1]; twin[pair[1]] = pair[0]; }
  const nest = idx(level.nest[0], level.nest[1]);
  const parent = new Int16Array(PCELLS).fill(-1);
  parent[nest] = -2;
  const blocked = new Uint8Array(PCELLS);
  for (const s of level.spiders ?? []) blocked[idx(s.x, s.y)] = 1;
  for (const t of level.toads ?? []) blocked[idx(t.x, t.y)] = 1;
  return { level, terrain, parent, cost: 0, digs: [], nest, blocked, twin, version: 0 };
}

export function clonePlan(plan: Plan): Plan {
  return { ...plan, terrain: [...plan.terrain], parent: plan.parent.slice(), digs: plan.digs.map(d => ({ ...d, cells: [...d.cells] })) };
}
export const isTrail = (plan: Plan, cell: number) => cell >= 0 && cell < PCELLS && plan.parent[cell] !== -1;
export const budget = (plan: Plan) => plan.level.scent ?? Infinity;
export const scentLeft = (plan: Plan) => budget(plan) - plan.cost;

/** Whether the trail may be drawn on `cell` (terrain only). */
export function drawable(plan: Plan, cell: number): boolean {
  if (cell < 0 || cell >= PCELLS || cell === plan.nest || plan.blocked[cell]) return false;
  const t = plan.terrain[cell];
  return t === 'grass' || t === 'water' || t === 'dug' || t === 'hole' || t === 'tape';
}

export function paintCheck(plan: Plan, cell: number, from: number): PaintResult {
  if (isTrail(plan, cell)) return { ok: false, reason: 'trail' };
  if (!drawable(plan, cell)) return { ok: false, reason: 'terrain' };
  if (!isTrail(plan, from) || !adjacent(cell, from)) return { ok: false, reason: 'adjacent' };
  if (scentLeft(plan) < 1) return { ok: false, reason: 'scent' };
  return { ok: true };
}

/** Add `cell` to the trail as a child of `from`. A hole pulls its twin in for free (R10). */
export function paint(plan: Plan, cell: number, from: number): PaintResult {
  const check = paintCheck(plan, cell, from);
  if (!check.ok) return check;
  plan.parent[cell] = from;
  plan.cost++;
  const twin = plan.twin[cell];
  if (twin >= 0 && !isTrail(plan, twin)) plan.parent[twin] = cell;
  plan.version++;
  return { ok: true };
}

/** Cells of the subtree hanging from `cell` (inclusive). */
export function subtree(plan: Plan, cell: number): number[] {
  if (!isTrail(plan, cell) || cell === plan.nest) return [];
  const doomed = new Uint8Array(PCELLS);
  doomed[cell] = 1;
  const out = [cell];
  // Parents always come before children in a walk that repeats until nothing new is found; trees are tiny.
  for (let changed = true; changed;) {
    changed = false;
    for (let c = 0; c < PCELLS; c++) {
      const p = plan.parent[c];
      if (p >= 0 && !doomed[c] && doomed[p]) { doomed[c] = 1; out.push(c); changed = true; }
    }
  }
  return out;
}

/** Remove `cell` and everything hanging off it; Digger tunnels whose token stood there close again. */
export function cut(plan: Plan, cell: number): number[] {
  const removed = subtree(plan, cell);
  for (const c of removed) {
    const p = plan.parent[c];
    // A free twin-hole exit refunds nothing.
    const free = p >= 0 && plan.twin[c] === p;
    plan.parent[c] = -1;
    if (!free) plan.cost--;
  }
  if (removed.length) {
    plan.version++;
    for (const dig of [...plan.digs]) if (removed.includes(dig.at)) removeDig(plan, dig.at);
  }
  return removed;
}

export function depthOf(plan: Plan, cell: number): number {
  let d = 0, c = cell;
  while (c >= 0 && plan.parent[c] >= 0 && d < 400) { c = plan.parent[c]; d++; }
  return d;
}
/** Cells from the nest to `cell` inclusive, along the tree. */
export function routeTo(plan: Plan, cell: number): number[] {
  const out: number[] = [];
  let c = cell, guard = 0;
  while (c >= 0 && guard++ < 400) { out.push(c); if (plan.parent[c] === -2) break; c = plan.parent[c]; }
  return out.reverse();
}
export const trailCells = (plan: Plan) => { const out: number[] = []; for (let c = 0; c < PCELLS; c++) if (plan.parent[c] >= 0) out.push(c); return out; };
/** Trail cells with more than one child: where the trail forks (R3). */
export function forks(plan: Plan): number[] {
  const kids = new Uint8Array(PCELLS);
  for (let c = 0; c < PCELLS; c++) { const p = plan.parent[c]; if (p >= 0 && plan.twin[c] !== p) kids[p]++; }
  const out: number[] = [];
  for (let c = 0; c < PCELLS; c++) if (kids[c] > 1 && c !== plan.nest) out.push(c);
  return out;
}

// ------------------------------------------------------------------ Digger tokens (R8)
export const diggersLeft = (plan: Plan) => (plan.level.diggers ?? 0) - plan.digs.length;
/** Where a Digger on `at` would dig: the chalk neighbour straight ahead of the trail if there is one, else the first. */
export function digPreview(plan: Plan, at: number): Dig | null {
  if (!isTrail(plan, at) || plan.digs.some(d => d.at === at)) return null;
  const p = plan.parent[at];
  const options: number[] = [];
  if (p >= 0) { const ahead = DIRS.findIndex(([dx, dy]) => cx(at) - cx(p) === dx && cy(at) - cy(p) === dy); if (ahead >= 0) options.push(ahead); }
  for (let d = 0; d < 4; d++) if (!options.includes(d)) options.push(d);
  for (const dir of options) {
    const [dx, dy] = DIRS[dir];
    const x1 = cx(at) + dx, y1 = cy(at) + dy;
    if (!inside(x1, y1) || plan.terrain[idx(x1, y1)] !== 'chalk') continue;
    const cells = [idx(x1, y1)];
    if (inside(x1 + dx, y1 + dy)) cells.push(idx(x1 + dx, y1 + dy));
    return { at, dir, cells };
  }
  return null;
}
export function placeDig(plan: Plan, at: number): boolean {
  if (diggersLeft(plan) <= 0) return false;
  const dig = digPreview(plan, at);
  if (!dig) return false;
  for (const c of dig.cells) if (plan.terrain[c] === 'chalk') plan.terrain[c] = 'dug';
  plan.digs.push(dig);
  plan.version++;
  return true;
}
export function removeDig(plan: Plan, at: number): boolean {
  const i = plan.digs.findIndex(d => d.at === at);
  if (i < 0) return false;
  const [dig] = plan.digs.splice(i, 1);
  for (const c of dig.cells) if (plan.terrain[c] === 'dug') { if (isTrail(plan, c)) cut(plan, c); plan.terrain[c] = 'chalk'; }
  plan.version++;
  return true;
}

// ------------------------------------------------------------------ assignment (R4, R7)
export type Job = { kind: 'food'; food: number; load: number } | { kind: 'bridge'; cell: number } | { kind: 'none' };
export type Assignment = {
  jobs: Job[];
  /** Ant numbers (1-based) per food. */
  foodAnts: number[][];
  /** Water cells on the trail, nearest first, and the ants each one takes. */
  bridges: { cell: number; ants: number[] }[];
  /** Trail distance per food, -1 when the trail does not reach it. */
  dist: number[];
};
export const antPower = (kind: AntKind) => (kind === 'p' ? 2 : 1);
export const foodCell = (food: PFood) => idx(food.x, food.y);

export function assign(plan: Plan): Assignment {
  const level = plan.level, squad = [...level.squad] as AntKind[];
  const jobs: Job[] = squad.map(() => ({ kind: 'none' }));
  const foodAnts = level.foods.map(() => [] as number[]);
  const dist = level.foods.map(food => (isTrail(plan, foodCell(food)) ? depthOf(plan, foodCell(food)) : -1));
  const water = trailCells(plan).filter(c => plan.terrain[c] === 'water').sort((a, b) => depthOf(plan, a) - depthOf(plan, b) || a - b);
  const bridges = water.map(cell => ({ cell, ants: [] as number[] }));
  let next = 0;
  for (const bridge of bridges) for (let k = 0; k < BRIDGE && next < squad.length; k++) { jobs[next] = { kind: 'bridge', cell: bridge.cell }; bridge.ants.push(next + 1); next++; }
  const need = level.foods.map(food => (food.lift ? food.lift : food.crumbs));
  for (let a = next; a < squad.length; a++) {
    let best = -1;
    for (let f = 0; f < level.foods.length; f++) {
      if (dist[f] < 0 || need[f] <= 0) continue;
      if (best < 0 || dist[f] < dist[best]) best = f;
    }
    if (best < 0) break;
    const power = antPower(squad[a]);
    const food = level.foods[best];
    const load = food.lift ? 0 : Math.min(power, need[best]);
    need[best] -= food.lift ? power : load;
    jobs[a] = { kind: 'food', food: best, load };
    foodAnts[best].push(a + 1);
  }
  return { jobs, foodAnts, bridges, dist };
}

// ------------------------------------------------------------------ the run
export type Phase = 'wait' | 'out' | 'bite' | 'home' | 'lift' | 'carry' | 'bridge' | 'done' | 'dead' | 'stuck' | 'idle';
export type RunAnt = {
  n: number;
  kind: AntKind;
  job: Job;
  /** Nest .. target. */
  route: number[];
  /** Index in `route` of the cell last reached; `t` ticks walked toward the next one. */
  i: number;
  t: number;
  phase: Phase;
  depart: number;
  load: number;
  work: number;
  /** Where and why it was lost (for the fail markers). */
  lost: { cell: number; cause: 'spider' | 'toad' | 'tape' } | null;
  /** Whether the ant is currently inside each toad's reach (to count entries). */
  inToad: boolean[];
};
export type RunItem = { food: number; route: number[]; i: number; t: number; power: number; carriers: number[]; moving: boolean; home: boolean; stalled: boolean };
export type FailReason =
  | { kind: 'reach'; food: number }
  | { kind: 'short'; food: number; have: number; need: number }
  | { kind: 'bridge'; cell: number; have: number }
  | { kind: 'crumbs'; have: number; need: number; lost: number; bridge: number }
  | { kind: 'time' };
export type RunEvent =
  | { type: 'depart'; ant: number }
  | { type: 'bite'; ant: number; food: number }
  | { type: 'deliver'; ant: number; n: number; total: number; big?: boolean }
  | { type: 'eaten'; ant: number; cell: number; cause: 'spider' | 'toad' | 'tape' }
  | { type: 'bridge'; cell: number; n: number; up: boolean }
  | { type: 'lift'; food: number }
  | { type: 'stall'; food: number }
  | { type: 'toadwake'; toad: number }
  | { type: 'end'; won: boolean };

export type Run = {
  plan: Plan;
  assignment: Assignment;
  tick: number;
  ants: RunAnt[];
  items: RunItem[];
  /** Crumbs left on each pile. */
  left: number[];
  crumbs: number;
  bridge: Int8Array;
  bridged: Uint8Array;
  spiderEaten: number[];
  toadPasses: number[];
  tapeUsed: Uint8Array;
  status: 'running' | 'won' | 'lost';
  reason: FailReason | null;
  events: RunEvent[];
};

const spiderRing = (plan: Plan, s: number, cell: number) => {
  const sp = plan.level.spiders![s];
  const d = cheb(cell, sp.x, sp.y);
  return d >= 1 && d <= (sp.r ?? 1);
};
const toadReach = (plan: Plan, k: number, cell: number) => {
  const td = plan.level.toads![k];
  const d = cheb(cell, td.x, td.y);
  return d >= 1 && d <= (td.r ?? 1);
};

export function createRun(source: Plan): Run {
  const plan = clonePlan(source);
  const assignment = assign(plan);
  const level = plan.level;
  const ants: RunAnt[] = [...level.squad].map((kind, a) => {
    const job = assignment.jobs[a];
    const target = job.kind === 'food' ? foodCell(level.foods[job.food]) : job.kind === 'bridge' ? job.cell : -1;
    return {
      n: a + 1, kind: kind as AntKind, job, route: target >= 0 ? routeTo(plan, target) : [plan.nest], i: 0, t: 0,
      phase: job.kind === 'none' ? 'idle' : 'wait', depart: a * GAP, load: 0, work: 0, lost: null, inToad: (level.toads ?? []).map(() => false)
    };
  });
  const items: RunItem[] = level.foods.map((food, f) => ({ food: f, route: food.lift && isTrail(plan, foodCell(food)) ? routeTo(plan, foodCell(food)).reverse() : [], i: 0, t: 0, power: 0, carriers: [], moving: false, home: false, stalled: false }));
  const run: Run = {
    plan, assignment, tick: 0, ants, items, left: level.foods.map(f => (f.lift ? 0 : f.crumbs)), crumbs: 0,
    bridge: new Int8Array(PCELLS), bridged: new Uint8Array(PCELLS), spiderEaten: (level.spiders ?? []).map(() => 0), toadPasses: (level.toads ?? []).map(() => 0),
    tapeUsed: new Uint8Array(PCELLS), status: 'running', reason: null, events: []
  };
  judge(run);
  return run;
}

/** Hazards for an ant that just stepped onto `cell`. Returns false when the ant is lost there. */
function enter(run: Run, ant: RunAnt, cell: number): boolean {
  const plan = run.plan, level = plan.level;
  const lose = (cause: 'spider' | 'toad' | 'tape') => {
    ant.phase = cause === 'tape' ? 'stuck' : 'dead';
    ant.lost = { cell, cause };
    run.events.push({ type: 'eaten', ant: ant.n, cell, cause });
    return false;
  };
  if (plan.terrain[cell] === 'tape' && !run.tapeUsed[cell]) { run.tapeUsed[cell] = 1; return lose('tape'); }
  for (let s = 0; s < (level.spiders?.length ?? 0); s++) {
    if (run.spiderEaten[s] < (level.spiders![s].eat ?? 2) && spiderRing(plan, s, cell)) { run.spiderEaten[s]++; return lose('spider'); }
  }
  for (let k = 0; k < (level.toads?.length ?? 0); k++) {
    const inside = toadReach(plan, k, cell), was = ant.inToad[k];
    ant.inToad[k] = inside;
    if (!inside || was) continue;
    if (run.toadPasses[k] < level.toads![k].sleep) { run.toadPasses[k]++; if (run.toadPasses[k] === level.toads![k].sleep) run.events.push({ type: 'toadwake', toad: k }); continue; }
    return lose('toad');
  }
  return true;
}

const passable = (run: Run, ant: RunAnt, cell: number) => run.plan.terrain[cell] !== 'water' || run.bridged[cell] === 1 || (ant.job.kind === 'bridge' && ant.job.cell === cell);

function arriveOut(run: Run, ant: RunAnt): void {
  const level = run.plan.level;
  if (ant.i < ant.route.length - 1) return;
  if (ant.job.kind === 'bridge') {
    const cell = ant.job.cell;
    ant.phase = 'bridge';
    run.bridge[cell]++;
    const up = run.bridge[cell] >= BRIDGE;
    if (up) run.bridged[cell] = 1;
    run.events.push({ type: 'bridge', cell, n: run.bridge[cell], up });
    return;
  }
  if (ant.job.kind !== 'food') return;
  const food = level.foods[ant.job.food];
  if (!food.lift) { ant.phase = 'bite'; ant.work = BITE; return; }
  const item = run.items[ant.job.food];
  ant.phase = 'lift';
  item.power += antPower(ant.kind);
  item.carriers.push(ant.n);
  if (item.power >= food.lift && !item.moving) { item.moving = true; item.stalled = false; run.events.push({ type: 'lift', food: ant.job.food }); }
}

function stepAnt(run: Run, ant: RunAnt): void {
  switch (ant.phase) {
    case 'wait':
      if (run.tick < ant.depart) return;
      ant.phase = 'out';
      run.events.push({ type: 'depart', ant: ant.n });
      // The ant takes its first step on the tick it leaves.
      stepAnt(run, ant);
      return;
    case 'out': {
      if (ant.i >= ant.route.length - 1) { arriveOut(run, ant); return; }
      const next = ant.route[ant.i + 1];
      if (ant.t === 0 && !passable(run, ant, next)) return;
      if (++ant.t < WALK) return;
      ant.t = 0; ant.i++;
      if (!enter(run, ant, ant.route[ant.i])) return;
      if (ant.i >= ant.route.length - 1) arriveOut(run, ant);
      return;
    }
    case 'bite': {
      if (--ant.work > 0) return;
      const f = (ant.job as { food: number }).food;
      const take = Math.min((ant.job as { load: number }).load, run.left[f]);
      run.left[f] -= take;
      ant.load = take;
      ant.phase = 'home';
      run.events.push({ type: 'bite', ant: ant.n, food: f });
      return;
    }
    case 'home': {
      if (ant.i <= 0) { deliverAnt(run, ant); return; }
      const next = ant.route[ant.i - 1];
      if (ant.t === 0 && !passable(run, ant, next)) return;
      if (++ant.t < WALK) return;
      ant.t = 0; ant.i--;
      if (ant.i === 0) { deliverAnt(run, ant); return; }
      enter(run, ant, ant.route[ant.i]);
      return;
    }
    default: return;
  }
}

function deliverAnt(run: Run, ant: RunAnt): void {
  ant.phase = 'done';
  if (ant.load > 0) { run.crumbs += ant.load; run.events.push({ type: 'deliver', ant: ant.n, n: ant.load, total: run.crumbs }); }
}

function stepItem(run: Run, item: RunItem): void {
  if (!item.moving || item.home) return;
  const food = run.plan.level.foods[item.food];
  if (item.power < (food.lift ?? 0)) { if (!item.stalled) { item.stalled = true; item.moving = false; run.events.push({ type: 'stall', food: item.food }); } return; }
  if (++item.t < CARRY) return;
  item.t = 0; item.i++;
  const cell = item.route[item.i];
  if (item.i >= item.route.length - 1) {
    item.home = true; item.moving = false;
    for (const n of item.carriers) { const ant = run.ants[n - 1]; if (ant.phase === 'carry' || ant.phase === 'lift') ant.phase = 'done'; }
    run.events.push({ type: 'deliver', ant: 0, n: food.crumbs, total: run.crumbs, big: true });
    return;
  }
  // Every carrier steps into the new cell with the item.
  for (const n of [...item.carriers]) {
    const ant = run.ants[n - 1];
    if (ant.phase !== 'lift' && ant.phase !== 'carry') continue;
    ant.phase = 'carry';
    if (!enter(run, ant, cell)) { item.power -= antPower(ant.kind); item.carriers = item.carriers.filter(m => m !== n); }
  }
}

const alive = (ant: RunAnt) => ant.phase !== 'dead' && ant.phase !== 'stuck';

/** Win the moment the goal is met; lose the moment it cannot be. */
function judge(run: Run): void {
  if (run.status !== 'running') return;
  const verdict = assess(run);
  if (verdict === 'won') finish(run, true, null);
  else if (verdict) finish(run, false, verdict);
}

/** 'won', the reason the goal can no longer be met, or null while it still can. */
export function assess(run: Run): 'won' | FailReason | null {
  const level = run.plan.level, goal = level.goal;
  const itemsHome = goal.items.every(id => run.items[level.foods.findIndex(f => f.id === id)]?.home);
  if (run.crumbs >= goal.crumbs && itemsHome) return 'won';
  const fail = (reason: FailReason) => reason;
  // Water crossings that can never finish their bridge block everyone behind them.
  const doomed = new Set<number>();
  for (const bridge of run.assignment.bridges) {
    if (run.bridged[bridge.cell]) continue;
    const coming = bridge.ants.filter(n => { const a = run.ants[n - 1]; return a.phase === 'wait' || a.phase === 'out'; }).length;
    if (run.bridge[bridge.cell] + coming < BRIDGE) doomed.add(bridge.cell);
  }
  const blockedAhead = (ant: RunAnt) => {
    if (ant.phase === 'wait' || ant.phase === 'out') { for (let i = ant.i + 1; i < ant.route.length; i++) if (doomed.has(ant.route[i])) return true; }
    if (ant.phase === 'home' || ant.phase === 'bite') { for (let i = ant.i - 1; i >= 0; i--) if (doomed.has(ant.route[i])) return true; }
    return false;
  };
  const enRoute = (ant: RunAnt) => alive(ant) && (ant.phase === 'wait' || ant.phase === 'out') && !blockedAhead(ant);
  for (const id of goal.items) {
    const f = level.foods.findIndex(food => food.id === id), item = run.items[f], food = level.foods[f];
    if (item.home) continue;
    if (run.assignment.dist[f] < 0) return fail({ kind: 'reach', food: f });
    const firstDoomed = [...doomed].find(c => routeTo(run.plan, foodCell(food)).includes(c));
    if (firstDoomed !== undefined && !item.moving && item.power === 0) return fail({ kind: 'bridge', cell: firstDoomed, have: run.bridge[firstDoomed] });
    const coming = run.assignment.foodAnts[f].map(n => run.ants[n - 1]).filter(enRoute).reduce((s, a) => s + antPower(a.kind), 0);
    if (item.power + (item.moving ? 0 : coming) < food.lift!) return fail({ kind: 'short', food: f, have: item.power + (item.moving ? 0 : coming), need: food.lift! });
  }
  if (goal.crumbs > 0) {
    let potential = run.crumbs;
    for (const ant of run.ants) {
      if (!alive(ant) || ant.job.kind !== 'food' || blockedAhead(ant)) continue;
      if (ant.phase === 'wait' || ant.phase === 'out' || ant.phase === 'bite') potential += ant.job.load;
      else if (ant.phase === 'home') potential += ant.load;
    }
    if (potential < goal.crumbs) {
      const firstDoomed = [...doomed][0];
      if (firstDoomed !== undefined) return fail({ kind: 'bridge', cell: firstDoomed, have: run.bridge[firstDoomed] });
      const unreached = level.foods.findIndex((food, f) => !food.lift && run.assignment.dist[f] < 0 && level.foods.some(g => !g.lift));
      const reachable = level.foods.reduce((s, food, f) => s + (!food.lift && run.assignment.dist[f] >= 0 ? food.crumbs : 0), 0);
      if (reachable < goal.crumbs && unreached >= 0) return fail({ kind: 'reach', food: unreached });
      return fail({ kind: 'crumbs', have: Math.min(potential, goal.crumbs), need: goal.crumbs, lost: run.ants.filter(a => !alive(a)).length, bridge: run.assignment.bridges.reduce((s, b) => s + b.ants.length, 0) });
    }
  }
  if (run.tick >= MAX_TICKS) return fail({ kind: 'time' });
  return null;
}

/** After a lost run has coasted, describe the board as it now stands (two ants eaten, not just the first). */
export function explain(run: Run): void {
  if (run.status !== 'lost') return;
  const verdict = assess(run);
  if (verdict && verdict !== 'won') run.reason = verdict;
}
/** Coast a lost run until nobody is still walking out (at most `limit` ticks), then explain it. */
export function settle(run: Run, limit: number): void {
  for (let k = 0; k < limit && run.status === 'lost' && walking(run); k++) stepRun(run, true);
  explain(run);
}

function finish(run: Run, won: boolean, reason: FailReason | null): void {
  run.status = won ? 'won' : 'lost';
  run.reason = reason;
  run.events.push({ type: 'end', won });
}

/** One tick. `coast` keeps a finished run moving (no judging) so the board can show why it failed. */
export function stepRun(run: Run, coast = false): void {
  if (run.status !== 'running' && !coast) return;
  run.tick++;
  for (const ant of run.ants) stepAnt(run, ant);
  for (const item of run.items) stepItem(run, item);
  judge(run);
}
/** Ants still on their way out (a failed run coasts until they get somewhere). */
export const walking = (run: Run) => run.ants.some(a => a.phase === 'wait' || a.phase === 'out');

export function drainRun(run: Run): RunEvent[] { const out = run.events; run.events = []; return out; }

/** Play a plan to the end. */
export function simulate(plan: Plan): Run {
  const run = createRun(plan);
  while (run.status === 'running') stepRun(run);
  return run;
}

// ------------------------------------------------------------------ positions (for drawing)
export type Pose = { x: number; y: number; dir: number };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
function along(route: number[], i: number, toward: number, k: number): Pose {
  const a = route[i], b = route[toward] ?? a;
  const dir = Math.atan2(cy(b) - cy(a), cx(b) - cx(a));
  return { x: lerp(cx(a), cx(b), k), y: lerp(cy(a), cy(b), k), dir: a === b ? 0 : dir };
}
export function antPose(run: Run, ant: RunAnt): Pose | null {
  switch (ant.phase) {
    case 'idle': case 'wait': case 'done': return null;
    case 'out': return along(ant.route, ant.i, ant.i + 1, ant.t / WALK);
    case 'home': return along(ant.route, ant.i, ant.i - 1, ant.t / WALK);
    case 'bite': { const p = along(ant.route, ant.i, ant.i - 1, 0); return { ...p, dir: p.dir + Math.PI }; }
    case 'bridge': { const c = ant.route[ant.route.length - 1], k = ((ant.n - 1) % BRIDGE) - 1; const prev = ant.route[ant.route.length - 2] ?? c; const horiz = cy(prev) === cy(c); return { x: cx(c) + (horiz ? 0 : k * 0.3), y: cy(c) + (horiz ? k * 0.3 : 0), dir: horiz ? 0 : Math.PI / 2 }; }
    case 'lift': case 'carry': {
      const f = (ant.job as { food: number }).food, item = run.items[f];
      const p = itemPose(run, item);
      const slot = item.carriers.indexOf(ant.n), count = Math.max(1, item.carriers.length);
      const a = (slot < 0 ? ant.n : slot) / Math.max(count, (run.plan.level.foods[f].lift ?? 4)) * Math.PI * 2 - Math.PI / 2;
      return { x: p.x + Math.cos(a) * 0.42, y: p.y + Math.sin(a) * 0.42, dir: item.moving ? p.dir : a + Math.PI };
    }
    case 'dead': case 'stuck': { const c = ant.lost?.cell ?? ant.route[ant.i]; return { x: cx(c), y: cy(c), dir: 0 }; }
  }
}
export function itemPose(run: Run, item: RunItem): Pose {
  const food = run.plan.level.foods[item.food];
  if (!item.route.length) return { x: food.x, y: food.y, dir: 0 };
  if (item.home) { const c = item.route[item.route.length - 1]; return { x: cx(c), y: cy(c), dir: 0 }; }
  return along(item.route, item.i, item.i + 1, item.t / CARRY);
}

// ------------------------------------------------------------------ scripts (reference plans, tests, hints)
export type ScriptResult = { plan: Plan; ok: boolean; failed: { path: number; cell: [number, number]; reason: PaintFail | 'dig' } | null };
/** Draw a plan script with the same rules the player's finger obeys. Stops at the first refused cell. */
export function applyScript(level: PuzzleLevel, script: PlanScript, onto?: Plan): ScriptResult {
  const plan = onto ?? createPlan(level);
  const digs = [...(script.digs ?? [])];
  const tryDigs = () => {
    for (let k = 0; k < digs.length; k++) {
      const [x, y] = digs[k];
      if (isTrail(plan, idx(x, y)) && placeDig(plan, idx(x, y))) { digs.splice(k, 1); k--; }
    }
  };
  for (let p = 0; p < script.paths.length; p++) {
    const path = script.paths[p];
    let from = idx(path[0][0], path[0][1]);
    if (!isTrail(plan, from)) return { plan, ok: false, failed: { path: p, cell: path[0], reason: 'adjacent' } };
    for (let k = 1; k < path.length; k++) {
      tryDigs();
      const cell = idx(path[k][0], path[k][1]);
      if (isTrail(plan, cell)) { from = cell; continue; }
      const result = paint(plan, cell, from);
      if (!result.ok) return { plan, ok: false, failed: { path: p, cell: path[k], reason: result.reason } };
      // Painting a hole pulls its twin in: the drag carries on from the exit.
      from = plan.twin[cell] >= 0 && plan.parent[plan.twin[cell]] === cell ? plan.twin[cell] : cell;
    }
  }
  tryDigs();
  if (digs.length) return { plan, ok: false, failed: { path: -1, cell: digs[0], reason: 'dig' } };
  return { plan, ok: true, failed: null };
}

/** Straight runs between waypoints: `line([1,4],[1,2],[7,2])` = every cell on the way, both ends included. */
export function line(...points: [number, number][]): [number, number][] {
  const out: [number, number][] = [points[0]];
  for (let k = 1; k < points.length; k++) {
    let [x, y] = out[out.length - 1];
    const [tx, ty] = points[k];
    while (x !== tx || y !== ty) { if (x !== tx) x += Math.sign(tx - x); else y += Math.sign(ty - y); out.push([x, y]); }
  }
  return out;
}
