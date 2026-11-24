/**
 * Reference solver for the jar puzzles. Test-only (the cabinet never imports it): beam search over drop positions,
 * letting the jar settle between drops the way an unhurried player would. Used to set each puzzle's par and to prove
 * every goal is reachable inside its drop list.
 */
import { BOUNDS, RADII, createWorld, dropFruit, isOverLine, isSettled, prefill, step, type World } from './sim';
import { JAR_PUZZLES, goalMet, type JarGoal, type JarPuzzle } from './modes';

const noRandom = () => 0.5;

/** A fresh puzzle jar, exactly as the cabinet builds it. */
export function puzzleWorld(p: JarPuzzle): World {
  const world = createWorld(noRandom, p.drops);
  prefill(world, p.fill);
  return world;
}

/** Steps until the jar settles (or the goal is met, or `limit` seconds pass). Returns false if the run was lost. */
export function settle(world: World, goal: JarGoal, limit = 3.5): boolean {
  let t = 0;
  // Never judge before the drop cooldown is over, so the next drop is always allowed.
  while (t < limit && !world.over && (t < 0.5 || !isSettled(world))) { step(world); t += 1 / 60; if (goalMet(goal, world)) return true; }
  return !world.over;
}

/** Plays a list of drop positions; returns the drop count at which the goal was met, or null. */
export function replay(p: JarPuzzle, xs: readonly number[], jitter = 0): number | null {
  const world = puzzleWorld(p);
  for (let i = 0; i < xs.length; i++) {
    if (!dropFruit(world, xs[i] + jitter, noRandom)) return null;
    if (!settle(world, p.goal)) return null;
    if (goalMet(p.goal, world)) return i + 1;
  }
  return null;
}

function clone(world: World): World { return structuredClone(world); }

function value(world: World, goal: JarGoal): number {
  if (world.over) return -1e9;
  let v = 0;
  for (const b of world.bodies) v += 3 ** b.tier;
  const bodies = world.bodies;
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
    const a = bodies[i], b = bodies[j];
    if (a.tier !== b.tier) continue;
    const gap = Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
    v += 3 ** a.tier * 1.2 * Math.max(0, 1 - gap / 60);
  }
  for (const b of bodies) if (isOverLine(b) || b.y - b.r < BOUNDS.lineY + 20) v -= 3 ** 6;
  if (goal.kind === 'chain') v += world.bestChain * 3 ** 7;
  if (goal.kind === 'score') v += world.score * 30;
  return v;
}

/** Beam search for the fewest drops that meet the goal. Returns the drop x positions, or null. */
export function solveJar(index: number, beam = 4, stepPx = 12): number[] | null {
  const p = JAR_PUZZLES[index];
  let layer: Array<{ world: World; xs: number[] }> = [{ world: puzzleWorld(p), xs: [] }];
  for (let d = 0; d < p.drops.length; d++) {
    const next: Array<{ world: World; xs: number[]; v: number }> = [];
    for (const node of layer) {
      const r = RADII[node.world.current];
      for (let x = BOUNDS.left + r; x <= BOUNDS.right - r + 0.1; x += stepPx) {
        const world = clone(node.world);
        if (!dropFruit(world, x, noRandom)) continue;
        const alive = settle(world, p.goal);
        const xs = [...node.xs, Math.round(x)];
        if (alive && goalMet(p.goal, world)) {
          // Only accept lines that survive a few pixels of aim error; a pixel-perfect drop is not a fair puzzle.
          if (replay(p, xs, 3) !== null && replay(p, xs, -3) !== null && replay(p, xs) !== null) return xs;
          continue;
        }
        if (alive) next.push({ world, xs, v: value(world, p.goal) });
      }
    }
    next.sort((a, b) => b.v - a.v);
    layer = next.slice(0, beam);
    if (!layer.length) return null;
  }
  return null;
}
