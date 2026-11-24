import { createPlan, cut, cx, cy, drawable, foodCell, idx, inside, isTrail, paint, scentLeft, simulate, type Plan } from '../src/games/ant-raid/puzzle/sim';
import type { PuzzleLevel } from '../src/games/ant-raid/puzzle/types';

/**
 * Exhaustive search over the plans that matter for a Crumb Raiders puzzle: every trail tree whose leaves are food
 * (a dead-end branch changes nothing: no ant walks it and no food's trail distance moves), up to a Scent cost.
 * Used by the puzzle tests to prove "the cheapest connecting trail loses" and "the budget has no slack".
 * Levels with Digger tokens or twin holes are checked by their reference plans instead.
 */
const DIRS: [number, number][] = [[1, 0], [0, -1], [-1, 0], [0, 1]];

/** Every tree connecting the nest to each cell in `targets`, costing at most `maxCost`, each yielded once. */
export function* trees(level: PuzzleLevel, targets: number[], maxCost: number): Generator<Plan> {
  const plan = createPlan(level);
  const cap = Math.min(maxCost, scentLeft(plan));
  const seen = new Set<string>();
  function* rec(k: number): Generator<Plan> {
    if (k === targets.length) {
      const key = Array.from(plan.parent).join(',');
      if (!seen.has(key)) { seen.add(key); yield plan; }
      return;
    }
    const target = targets[k];
    if (isTrail(plan, target)) { yield* rec(k + 1); return; }
    const anchors = [plan.nest];
    for (let c = 0; c < plan.parent.length; c++) if (plan.parent[c] >= 0) anchors.push(c);
    for (const anchor of anchors) yield* walk(anchor, target, k);
  }
  function* walk(from: number, target: number, k: number): Generator<Plan> {
    const left = cap - plan.cost;
    const manhattan = Math.abs(cx(from) - cx(target)) + Math.abs(cy(from) - cy(target));
    if (manhattan > left) return;
    for (const [dx, dy] of DIRS) {
      const x = cx(from) + dx, y = cy(from) + dy;
      if (!inside(x, y)) continue;
      const cell = idx(x, y);
      if (isTrail(plan, cell) || !drawable(plan, cell)) continue;
      if (!paint(plan, cell, from).ok) continue;
      if (cell === target) yield* rec(k + 1);
      else yield* walk(cell, target, k);
      cut(plan, cell);
    }
  }
  yield* rec(0);
}

/** All subsets of the level's foods that include every goal item (the goal crumbs may come from any pile). */
function targetSets(level: PuzzleLevel): number[][] {
  const foods = level.foods.map(foodCell);
  const required = level.foods.map((f, i) => (level.goal.items.includes(f.id) ? i : -1)).filter(i => i >= 0);
  const out: number[][] = [];
  for (let mask = 1; mask < 1 << foods.length; mask++) {
    const picked = foods.map((_, i) => i).filter(i => mask & (1 << i));
    if (required.every(r => picked.includes(r))) out.push(picked.map(i => foods[i]));
  }
  return out;
}

export type SearchReport = { plans: number; wins: number; minWin: number | null; minConnect: number | null; minConnectPlans: number; minConnectWins: number };

/**
 * Search every useful tree up to `maxCost`. `minConnect` is the cheapest tree reaching every goal food (and, for a
 * crumb goal, piles holding enough crumbs), ignoring hazards and ant order; `minConnectWins` counts how many of those win.
 */
export function search(level: PuzzleLevel, maxCost: number): SearchReport {
  const report: SearchReport = { plans: 0, wins: 0, minWin: null, minConnect: null, minConnectPlans: 0, minConnectWins: 0 };
  const done = new Set<string>();
  const connectCosts: { cost: number; won: boolean }[] = [];
  for (const set of targetSets(level)) {
    // A tree for a smaller set can reach more food by accident; the key keeps each tree counted once.
    for (const plan of trees(level, set, maxCost)) {
      const key = Array.from(plan.parent).join(',');
      if (done.has(key)) continue;
      done.add(key);
      report.plans++;
      const won = simulate(plan).status === 'won';
      if (won) { report.wins++; report.minWin = Math.min(report.minWin ?? Infinity, plan.cost); }
      const reachesGoal = level.goal.items.every(id => isTrail(plan, foodCell(level.foods.find(f => f.id === id)!)))
        && level.foods.reduce((n, f) => n + (!f.lift && isTrail(plan, foodCell(f)) ? f.crumbs : 0), 0) >= level.goal.crumbs;
      if (reachesGoal) connectCosts.push({ cost: plan.cost, won });
    }
  }
  if (connectCosts.length) {
    report.minConnect = connectCosts.reduce((m, c) => Math.min(m, c.cost), Infinity);
    const cheapest = connectCosts.filter(c => c.cost === report.minConnect);
    report.minConnectPlans = cheapest.length;
    report.minConnectWins = cheapest.filter(c => c.won).length;
  }
  return report;
}
