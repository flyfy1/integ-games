import { ALL_RULES, DIRS, initialState, isWon, solveFrom, stateKey, step, type Board, type Dir, type Rules, type State } from './rules';

/**
 * Whole-level analysis: every reachable state and its distance to the flag (backwards breadth-first search).
 * The game uses it for the hint and the "stuck" notice; the lab and the tests use it to grade levels.
 */
export type Analysis = {
  ids: Map<string, number>;
  /** Moves to the flag per state id; -1 means the flag can no longer be reached from there. */
  dist: Int32Array;
  states: number; dead: number; par: number | null;
  /** False when the cap stopped the search; then distances are not trusted. */
  complete: boolean;
};

export function analyze(b: Board, from: State = initialState(b), rules: Rules = ALL_RULES, cap = 150_000): Analysis {
  const ids = new Map<string, number>(); const won: number[] = []; const preds: number[][] = []; const queue: State[] = [];
  const add = (s: State) => {
    const k = stateKey(s); let id = ids.get(k);
    if (id === undefined) { id = queue.length; ids.set(k, id); preds.push([]); queue.push(s); if (isWon(b, s)) won.push(id); }
    return id;
  };
  add(from);
  let complete = true;
  for (let i = 0; i < queue.length; i++) {
    if (queue.length > cap) { complete = false; break; }
    const s = queue[i]; if (isWon(b, s)) continue;
    for (const d of DIRS) { const n = step(b, s, d, rules); if (n) preds[add(n)].push(i); }
  }
  const dist = new Int32Array(queue.length).fill(-1);
  let q = won.slice(); won.forEach(id => { dist[id] = 0; });
  for (let depth = 1; q.length; depth++) {
    const next: number[] = [];
    for (const id of q) for (const p of preds[id]) if (dist[p] < 0) { dist[p] = depth; next.push(p); }
    q = next;
  }
  let dead = 0; for (const d of dist) if (d < 0) dead++;
  return { ids, dist, states: queue.length, dead, par: dist[0] >= 0 ? dist[0] : null, complete };
}

/** Distance to the flag: a number, -1 for a dead state, or undefined when the analysis cannot tell. */
export function distanceOf(a: Analysis | null | undefined, s: State): number | undefined {
  if (!a?.complete) return undefined;
  const id = a.ids.get(stateKey(s));
  return id === undefined ? undefined : a.dist[id];
}

export type Hint = { move: Dir; left: number } | { move: null; left: null };

/** The next move of a shortest solution from here, or null when the flag can no longer be reached. */
export function hintFrom(b: Board, s: State, analysis?: Analysis | null, rules: Rules = ALL_RULES): Hint {
  const here = distanceOf(analysis, s);
  if (here !== undefined) {
    if (here <= 0) return { move: null, left: null };
    for (const d of DIRS) { const n = step(b, s, d, rules); if (n && distanceOf(analysis, n) === here - 1) return { move: d, left: here }; }
  }
  const sol = solveFrom(b, s, rules);
  return !sol.moves ? { move: null, left: null } : { move: sol.moves[0] as Dir, left: sol.moves.length };
}
