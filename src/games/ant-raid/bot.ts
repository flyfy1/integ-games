import { CASTES } from './data/castes';
import { cx, cy, depthOf, dist, foodCell, idx, inside, isTrail, liveAnts, NEIGHBOURS } from './core';
import { blockedCells } from './hazards';
import { canPlay, createSim, cyclePriority, erase, mulberry32, paint, playCard, postTarget, queenCall, step, toggleBridge } from './sim';
import { CELLS, COLS, ROWS, type CasteId, type LevelDef, type MetaState, type QueenCall, type Sim } from './types';

/**
 * Two ways to play a level without a person:
 *
 * - `runScript`: a stored reference solution (`data/solutions.ts`): timed commands plus standing orders ("keep N
 *   Workers alive", "keep this path painted", "Scatter when a shoe shadow is about to land"). These are what a
 *   competent player does, written down; the content test replays one per level to prove it is winnable.
 * - `greedyBot`: a generic player with no level knowledge: hazard-weighted shortest trails, Workers plus whatever the
 *   level's new caste is for, re-lays cut trail. It must clear chapters 1 and 2.
 */
export type Cell = [number, number];
export type ScriptOp =
  | { t: number; paint: Cell[]; keep?: boolean }
  | { t: number; erase: Cell }
  | { t: number; play: CasteId; at?: Cell; n?: number }
  | { t: number; keep: CasteId; ants: number; until?: number; reserve?: number }
  | { t: number; priority: string; level: 0 | 1 | 2 }
  | { t: number; queen: QueenCall }
  | { t: number; bridge: Cell }
  | { t: number; react: 'scatter-shoe' | 'scatter-peck' | 'lift-dive' | 'rally-nap' };
export type Script = { loadout?: CasteId[]; ops: ScriptOp[] };
export type RunResult = { won: boolean; time: number; crumbs: number; lost: number; scatters: number; margin: number; sim: Sim };

const c = ([x, y]: Cell) => idx(x, y);

export function runScript(level: LevelDef, script: Script, opts: { seed?: number; mercy?: number; meta?: Partial<MetaState>; maxTime?: number } = {}): RunResult {
  const sim = createSim(level, { random: mulberry32(opts.seed ?? 1), loadout: script.loadout, mercy: opts.mercy ?? 0, meta: opts.meta });
  const ops = [...script.ops].sort((a, b) => a.t - b.t);
  let next = 0, tick = 0;
  const keeps: Extract<ScriptOp, { keep: CasteId }>[] = [];
  const paths: Cell[][] = [];
  const reacts = new Set<string>();
  const liftedByUs = new Set<number>();
  const limit = opts.maxTime ?? level.sundown + 5;
  while (sim.status === 'playing' && sim.time < limit) {
    while (next < ops.length && ops[next].t <= sim.time) {
      const op = ops[next++];
      if ('paint' in op) { paintPath(sim, op.paint); if (op.keep) paths.push(op.paint); }
      else if ('erase' in op) erase(sim, c(op.erase));
      else if ('play' in op) { for (let i = 0; i < (op.n ?? 1); i++) playCard(sim, op.play, op.at ? c(op.at) : -1); }
      else if ('keep' in op && typeof op.keep === 'string' && 'ants' in op) keeps.push(op);
      else if ('priority' in op) { const food = sim.foods.find(f => f.id === op.priority); if (food) { let guard = 0; while (food.priority !== op.level && guard++ < 3) cyclePriority(sim, food.index); } }
      else if ('queen' in op) queenCall(sim, op.queen);
      else if ('bridge' in op) toggleBridge(sim, c(op.bridge));
      else if ('react' in op) reacts.add(op.react);
    }
    // Standing orders, checked about four times a second.
    if (tick++ % 8 === 0) {
      for (const path of paths) paintPath(sim, path);
      for (const keep of keeps) {
        if (keep.until !== undefined && sim.time > keep.until) continue;
        if (liveAnts(sim, keep.keep) + queued(sim, keep.keep) < keep.ants && sim.sugar - CASTES[keep.keep].cost >= (keep.reserve ?? 0)) playCard(sim, keep.keep);
      }
    }
    if (reacts.size) react(sim, reacts, liftedByUs);
    step(sim);
  }
  const won = sim.status === 'won';
  return { won, time: sim.time, crumbs: sim.crumbs, lost: sim.stats.lost, scatters: sim.stats.scatters, margin: won ? (level.sundown - sim.time) / level.sundown : 0, sim };
}

const queued = (sim: Sim, caste: CasteId) => sim.queue.filter(q => q.caste === caste).length;

function paintPath(sim: Sim, path: Cell[]): void {
  let prev = sim.nest;
  for (const cell of path) {
    const k = c(cell);
    if (!isTrail(sim, k)) { if (!paint(sim, k, prev).ok) return; }
    prev = k;
  }
}

function react(sim: Sim, reacts: Set<string>, lifted: Set<number>): void {
  if (reacts.has('scatter-shoe') && sim.shoe.left > 0 && sim.shoe.warn > 0 && sim.shoe.warn < 0.5) queenCall(sim, 'scatter');
  for (const h of sim.hazards) {
    if (!h.active) continue;
    if (reacts.has('rally-nap') && h.kind === 'toad' && h.phase === 1 && sim.foods.some(f => f.lift && f.moving)) queenCall(sim, 'rally');
    if (reacts.has('scatter-peck') && h.kind === 'sparrow' && h.phase === 1 && h.warn < 0.5) queenCall(sim, 'scatter');
    if (reacts.has('lift-dive') && h.kind === 'kingfisher') {
      if (h.phase === 1 && h.warn < 1.2) for (const cell of h.cells) if (sim.bridged[cell]) { toggleBridge(sim, cell); lifted.add(cell); }
      if (h.phase === 0) for (const cell of [...lifted]) { if (!sim.bridged[cell]) toggleBridge(sim, cell); lifted.delete(cell); }
    }
  }
}

// ------------------------------------------------------------------ greedy bot
const PAINTABLE = new Set(['grass', 'blanket', 'sand', 'tunnel', 'tape']);

/** Danger of standing in a cell, from the hazards the bot can see. */
function dangerMap(sim: Sim): Float32Array {
  const d = new Float32Array(CELLS);
  for (const h of sim.hazards) {
    if (!h.active) continue;
    const r = typeof h.params?.r === 'number' ? h.params.r : h.kind === 'spider' ? 1.8 : h.kind === 'toad' ? 3.6 : h.kind === 'sprinkler' ? 3.5 : 1;
    for (let k = 0; k < CELLS; k++) {
      const dd = dist(cx(k), cy(k), h.x, h.y);
      if (h.kind === 'spider' && dd <= r + 0.3) d[k] += 5;
      if (h.kind === 'toad' && dd <= r) d[k] += 1.5;
      if (h.kind === 'sprinkler' && dd <= r) d[k] += sim.terrain[k] === 'tunnel' ? 0 : 1.2;
      if (h.kind === 'sunbeam') {
        const x2 = Number(h.params?.x2 ?? h.x), y2 = Number(h.params?.y2 ?? h.y);
        if (segDist(cx(k), cy(k), h.x, h.y, x2, y2) < 1.1) d[k] += 2.5;
      }
    }
  }
  for (let k = 0; k < CELLS; k++) {
    if (sim.level.alarm && sim.terrain[k] !== 'grass' && sim.terrain[k] !== 'tunnel') d[k] += 0.6;
    if (sim.terrain[k] === 'tape') d[k] += 3;
    if (sim.terrain[k] === 'sand' && neighbourPit(sim, k)) d[k] += 6;
  }
  return d;
}
const segDist = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const vx = bx - ax, vy = by - ay, len = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
};
function neighbourPit(sim: Sim, k: number): boolean {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = cx(k) + dx, y = cy(k) + dy; if (inside(x, y) && sim.terrain[idx(x, y)] === 'pit') return true; }
  return false;
}

/** Cheapest new trail from the existing tree to `target` (cells to paint, in order), or null. */
export function planPath(sim: Sim, target: number, danger = dangerMap(sim)): number[] | null {
  const cost = new Float32Array(CELLS).fill(Infinity), prev = new Int16Array(CELLS).fill(-1), steps = new Int16Array(CELLS);
  const open: number[] = [];
  for (let k = 0; k < CELLS; k++) if (isTrail(sim, k)) { cost[k] = 0; open.push(k); }
  const blocked = blockedCells(sim);
  const ok = (k: number) => (PAINTABLE.has(sim.terrain[k]) || (sim.terrain[k] === 'water' && sim.bridge[k] >= 3)) && !blocked.has(k) && (!sim.level.night || sim.seen[k] > 0);
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (cost[open[i]] < cost[open[bi]]) bi = i;
    const k = open.splice(bi, 1)[0];
    if (k === target) break;
    for (const [dx, dy] of NEIGHBOURS) {
      const x = cx(k) + dx, y = cy(k) + dy;
      if (!inside(x, y)) continue;
      const n = idx(x, y);
      if (isTrail(sim, n) || !ok(n)) continue;
      const nc = cost[k] + 1 + danger[n];
      if (nc < cost[n]) { cost[n] = nc; prev[n] = k; steps[n] = steps[k] + 1; open.push(n); }
    }
  }
  if (cost[target] === Infinity) return null;
  const out: number[] = [];
  let k = target;
  while (k >= 0 && !isTrail(sim, k)) { out.unshift(k); k = prev[k]; }
  return out;
}

export type BotOptions = { seed?: number; mercy?: number; loadout?: CasteId[]; meta?: Partial<MetaState> };
export function greedyBot(level: LevelDef, opts: BotOptions = {}): RunResult {
  const sim = createSim(level, { random: mulberry32(opts.seed ?? 1), loadout: opts.loadout ?? defaultLoadout(level), mercy: opts.mercy ?? 0, meta: opts.meta });
  let tick = 0;
  const bot = mulberry32((opts.seed ?? 1) * 7 + 3);
  while (sim.status === 'playing' && sim.time < level.sundown + 5) {
    if (tick++ % 6 === 0) botTurn(sim, bot);
    if (sim.shoe.left > 0 && sim.shoe.warn > 0 && sim.shoe.warn < 0.45) queenCall(sim, 'scatter');
    step(sim);
  }
  const won = sim.status === 'won';
  return { won, time: sim.time, crumbs: sim.crumbs, lost: sim.stats.lost, scatters: sim.stats.scatters, margin: won ? (level.sundown - sim.time) / level.sundown : 0, sim };
}

/** "Workers plus the level's new caste". */
export function defaultLoadout(level: LevelDef): CasteId[] {
  if (level.cards) return level.cards;
  const by: Record<number, CasteId[]> = { 1: ['worker', 'porter', 'soldier'], 2: ['worker', 'porter', 'soldier', 'digger', 'leafcutter'], 3: ['worker', 'porter', 'bridger', 'spitter', 'flyer'], 4: ['worker', 'porter', 'soldier', 'scout', 'honeypot'] };
  return by[level.chapter] ?? ['worker', 'porter', 'soldier', 'leafcutter', 'digger'];
}

function botTurn(sim: Sim, _rand: () => number): void {
  const goal = sim.level.goal;
  const danger = dangerMap(sim);
  const goalItem = goal.kind === 'item' ? sim.foods.find(f => f.id === goal.food) : undefined;
  // 1. Trails: connect the goal item, then the cheapest piles (at most two open piles at a time).
  const open = sim.foods.filter(f => f.visible && !f.home && !f.floating && (f.lift ? true : f.left > 0));
  const connectedPiles = open.filter(f => !f.lift && isTrail(sim, foodCell(f)));
  const wanted = open.filter(f => !isTrail(sim, foodCell(f)));
  wanted.sort((a, b) => (a === goalItem ? -1 : b === goalItem ? 1 : 0) || (a.lift ? 1 : 0) - (b.lift ? 1 : 0) || dist(a.x, a.y, cx(sim.nest), cy(sim.nest)) - dist(b.x, b.y, cx(sim.nest), cy(sim.nest)));
  let budgetPiles = 2 - connectedPiles.length;
  for (const food of wanted) {
    if (!food.lift && budgetPiles <= 0) continue;
    if (food.lift && food !== goalItem && goal.kind === 'item') continue;
    const path = planPath(sim, foodCell(food), danger);
    if (!path) { tryDig(sim, food.x, food.y); continue; }
    if (path.length > sim.scent) { pruneEmpty(sim); continue; }
    let prev = -1;
    for (const k of path) { if (!paint(sim, k, prev).ok) break; prev = k; }
    if (!food.lift) budgetPiles--;
  }
  pruneEmpty(sim);
  // 2. Goal item first.
  if (goalItem && isTrail(sim, foodCell(goalItem)) && goalItem.priority !== 2) cyclePriority(sim, goalItem.index);
  // 3. Posts.
  for (const h of sim.hazards) {
    if (!h.active || h.kind !== 'spider') continue;
    if (sim.ants.some(a => a.alive && a.caste === 'soldier' && a.post >= 0 && dist(cx(a.post), cy(a.post), h.x, h.y) < 2.8)) continue;
    let best = -1, bd = 2.6;
    for (let k = 0; k < CELLS; k++) if (isTrail(sim, k) && k !== sim.nest) { const d = dist(cx(k), cy(k), h.x, h.y); if (d < bd) { bd = d; best = k; } }
    if (best >= 0) playCard(sim, 'soldier', best);
  }
  // 4. Hatching: porters for a big item, a few leafcutters under sunbeams or sprinklers, workers for the rest.
  const big = sim.foods.find(f => f.lift && !f.home && isTrail(sim, f.at) && f.priority > 0);
  const hasCard = (caste: CasteId) => sim.cards.some(card => card.caste === caste);
  if (big && hasCard('porter')) {
    const power = sim.ants.filter(a => a.alive && (a.caste === 'porter' || a.state === 'lift')).reduce((s, a) => s + CASTES[a.caste].power, 0);
    if (power < big.lift! * 1.3) playCard(sim, 'porter');
  }
  const workers = liveAnts(sim, 'worker');
  if (hasCard('leafcutter') && sim.hazards.some(h => h.active && (h.kind === 'sunbeam' || h.kind === 'sprinkler')) && liveAnts(sim, 'leafcutter') < Math.min(5, 1 + workers / 6)) playCard(sim, 'leafcutter');
  const demand = connectedPiles.reduce((s, f) => s + Math.min(f.left, 6 + depthOf(sim, foodCell(f)) * 1.1), 0) + (big ? big.lift! : 0);
  if (workers + sim.queue.length < Math.min(sim.cap - 10, demand + 3)) playCard(sim, 'worker');
}

/** Digger toward a food the trail cannot reach (chalk ring, sand). */
function tryDig(sim: Sim, fx: number, fy: number): void {
  if (!sim.cards.some(card => card.caste === 'digger')) return;
  if (sim.ants.some(a => a.alive && a.caste === 'digger')) return;
  if (sim.queue.some(q => q.caste === 'digger')) return;
  let best = -1, bd = Infinity;
  for (let k = 0; k < CELLS; k++) {
    if (sim.terrain[k] !== 'chalk' && sim.terrain[k] !== 'sand') continue;
    if (!('stand' in postTarget(sim, 'digger', k))) continue;
    const d = dist(cx(k), cy(k), fx, fy);
    if (d < bd) { bd = d; best = k; }
  }
  if (best >= 0 && canPlay(sim, 'digger', best).ok) playCard(sim, 'digger', best);
}

/** Cut branches that lead only to empty piles, refunding their Scent. */
function pruneEmpty(sim: Sim): void {
  for (const food of sim.foods) {
    if (food.lift || food.left > 0 || food.claims > 0) continue;
    let k = idx(food.x, food.y);
    if (!isTrail(sim, k)) continue;
    const children = (cell: number) => { let n = 0; for (let j = 0; j < CELLS; j++) if (sim.trailParent[j] === cell) n++; return n; };
    if (children(k) > 0) continue;
    const isFoodCell = (cell: number) => sim.foods.some(f => f !== food && !f.home && foodCell(f) === cell);
    while (sim.trailParent[k] >= 0 && sim.trailParent[k] !== sim.nest && children(sim.trailParent[k]) === 1 && !isFoodCell(sim.trailParent[k])) k = sim.trailParent[k];
    erase(sim, k);
  }
}

export const BOT_GRID = { COLS, ROWS };
