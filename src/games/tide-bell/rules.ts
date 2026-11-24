/**
 * Tide Bell rules: pure, deterministic, and shared by the game, the hint, the stuck check, the level tests and the
 * authoring lab. One input is one move, however far the wood drifts afterwards.
 *
 * Legend (one character per tile, rows top to bottom):
 *   R rock (always dry)      S sand (water from tide 1)   T high sand (water at tide 2)   D deep water   X cliff
 *   B bell (rock; flips tide 0 <-> 1)   U up bell (+1, max 2)   N down bell (-1, min 0)   G flag (rock)   P you (on rock)
 *   r / s / t driftwood on rock / sand / high sand        o driftwood floating on deep water
 *   C sandcastle on sand, K sandcastle on high sand: a wall until the tide first covers it, then plain sand for good
 *   ^ v < > current (deep water that carries floating wood, and you on it, in its direction)
 *   A Y { }  driftwood resting on a ^ v < > current
 *
 * Moves: walk one tile onto dry ground or onto floating wood. Walking into wood on dry ground pushes it one tile;
 * pushed into water it drifts straight on until it bumps something (a current turns it). Stepping onto a bell rings
 * it after the push has resolved. Wood that drifts onto a current turns with it; wood resting on a current stays
 * until you step onto it, then it flows on with you aboard until it bumps something.
 */
export type Dir = 'U' | 'D' | 'L' | 'R';
export const DIRS: readonly Dir[] = ['U', 'D', 'L', 'R'];
export const DXY: Record<Dir, readonly [number, number]> = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };

export const enum K { Rock, Sand, High, Deep, Cliff, Bell, Up, Down, Goal, Current }
export type Board = {
  w: number; h: number;
  kind: Uint8Array;
  /** Height at which a tile is under water: rock never, sand 1, high sand 2, deep 0. Castles keep their base height. */
  height: Uint8Array;
  /** Castle base height per tile (0 = no castle). A castle stands while the highest tide so far is below it. */
  castle: Uint8Array;
  /** Current direction index into DIRS, or 255. */
  flow: Uint8Array;
  start: number; goal: number;
  rafts: number[];
  tide: number; maxTide: number;
  hasCastles: boolean; hasCurrents: boolean;
};
export type State = { pos: number; rafts: number[]; tide: number; peak: number };
/** What a move did, for the renderer and the sound. Positions are tile indices. */
export type MoveEvent =
  | { type: 'walk'; from: number; to: number }
  | { type: 'push'; raft: number; from: number; to: number; path: number[] }
  | { type: 'ring'; bell: number; from: number; to: number }
  | { type: 'wash'; tiles: number[] }
  | { type: 'flow'; from: number; to: number; path: number[]; rider: boolean }
  | { type: 'win' };
/**
 * Ways to switch one idea off, for proving a level needs it: bells / up / down ring without moving the sea, currents
 * stand still, castles never wash away, `castleless` levels the castles to plain sand, `high` turns high sand into
 * ordinary sand, `bellwood` stops wood from being pushed onto a bell, and `raft:i` removes the i-th log.
 */
export type Ablation = 'bells' | 'up' | 'down' | 'currents' | 'castles' | 'castleless' | 'high' | 'bellwood' | `raft:${number}`;
export type Rules = { bells: boolean; up: boolean; down: boolean; currents: boolean; castles: boolean; bellwood: boolean };
export const ALL_RULES: Rules = { bells: true, up: true, down: true, currents: true, castles: true, bellwood: true };

const HEIGHT_DRY = 9;
const TILE: Record<string, { kind: K; height: number; raft?: boolean; castle?: number; flow?: number; player?: boolean; goal?: boolean }> = {
  R: { kind: K.Rock, height: HEIGHT_DRY }, S: { kind: K.Sand, height: 1 }, T: { kind: K.High, height: 2 }, D: { kind: K.Deep, height: 0 },
  X: { kind: K.Cliff, height: HEIGHT_DRY }, B: { kind: K.Bell, height: HEIGHT_DRY }, U: { kind: K.Up, height: HEIGHT_DRY }, N: { kind: K.Down, height: HEIGHT_DRY },
  G: { kind: K.Goal, height: HEIGHT_DRY, goal: true }, P: { kind: K.Rock, height: HEIGHT_DRY, player: true },
  r: { kind: K.Rock, height: HEIGHT_DRY, raft: true }, s: { kind: K.Sand, height: 1, raft: true }, t: { kind: K.High, height: 2, raft: true }, o: { kind: K.Deep, height: 0, raft: true },
  C: { kind: K.Sand, height: 1, castle: 1 }, K: { kind: K.High, height: 2, castle: 2 },
  A: { kind: K.Current, height: 0, flow: 0, raft: true }, Y: { kind: K.Current, height: 0, flow: 1, raft: true }, '{': { kind: K.Current, height: 0, flow: 2, raft: true }, '}': { kind: K.Current, height: 0, flow: 3, raft: true },
  '^': { kind: K.Current, height: 0, flow: 0 }, v: { kind: K.Current, height: 0, flow: 1 }, '<': { kind: K.Current, height: 0, flow: 2 }, '>': { kind: K.Current, height: 0, flow: 3 }
};

export function parseBoard(rows: readonly string[], tide: number): Board {
  const h = rows.length, w = Math.max(...rows.map(r => r.length));
  const n = w * h;
  const kind = new Uint8Array(n).fill(K.Cliff), height = new Uint8Array(n).fill(HEIGHT_DRY), castle = new Uint8Array(n), flow = new Uint8Array(n).fill(255);
  let start = -1, goal = -1; const rafts: number[] = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const def = TILE[ch]; if (!def) throw new Error(`Unknown tile '${ch}' at ${x},${y}`);
    const i = y * w + x;
    kind[i] = def.kind; height[i] = def.height; castle[i] = def.castle ?? 0; flow[i] = def.flow ?? 255;
    if (def.raft) rafts.push(i);
    if (def.player) start = i;
    if (def.goal) goal = i;
  }));
  if (start < 0 || goal < 0) throw new Error('Level needs P and G');
  const maxTide = [...kind].some(k => k === K.High || k === K.Up || k === K.Down) ? 2 : 1;
  return { w, h, kind, height, castle, flow, start, goal, rafts: rafts.sort((a, b) => a - b), tide, maxTide, hasCastles: castle.some(c => c > 0), hasCurrents: flow.some(f => f !== 255) };
}

/** `peak` (the highest tide so far) only matters where castles stand; elsewhere it stays 0 so equal positions share one state. */
export const initialState = (b: Board): State => ({ pos: b.start, rafts: [...b.rafts], tide: b.tide, peak: b.hasCastles ? b.tide : 0 });
export const stateKey = (s: State) => `${s.pos},${s.tide},${s.peak}:${s.rafts.join(',')}`;
export const isWon = (b: Board, s: State) => s.pos === b.goal;

export function neighbour(b: Board, i: number, d: Dir): number {
  const x = i % b.w + DXY[d][0], y = Math.floor(i / b.w) + DXY[d][1];
  return x < 0 || y < 0 || x >= b.w || y >= b.h ? -1 : y * b.w + x;
}
export const castleStanding = (b: Board, s: State, i: number, rules: Rules = ALL_RULES) => b.castle[i] > 0 && (!rules.castles || s.peak < b.castle[i]);
/** Under water right now (a standing castle keeps its tile dry). */
export const isWet = (b: Board, s: State, i: number, rules: Rules = ALL_RULES) => !castleStanding(b, s, i, rules) && s.tide >= b.height[i];
const open = (b: Board, s: State, i: number, rules: Rules) => i >= 0 && b.kind[i] !== K.Cliff && !castleStanding(b, s, i, rules);
const flowAt = (b: Board, i: number, rules: Rules): Dir | null => (rules.currents && b.flow[i] !== 255 ? DIRS[b.flow[i]] : null);

/** Slide a log that has just entered water at `at` moving `d`, or is resting on a current. Returns the tiles it passes. */
function drift(b: Board, s: State, rafts: Set<number>, at: number, d: Dir, rules: Rules): number[] {
  const path = [at]; const seen = new Set<string>();
  let pos = at, dir = d;
  for (;;) {
    dir = flowAt(b, pos, rules) ?? dir;
    const key = `${pos}${dir}`; if (seen.has(key)) break; seen.add(key);
    const next = neighbour(b, pos, dir);
    if (open(b, s, next, rules) && !rafts.has(next) && isWet(b, s, next, rules)) { pos = next; path.push(pos); } else break;
  }
  return path;
}

function ruleFor(rules: Rules, k: K) { return k === K.Bell ? rules.bells : k === K.Up ? rules.up : k === K.Down ? rules.down : false; }

/** Apply one move. Returns null when the move is blocked (nothing changes, it costs nothing). */
export function step(b: Board, s: State, d: Dir, rules: Rules = ALL_RULES, events?: MoveEvent[]): State | null {
  const t = neighbour(b, s.pos, d);
  if (!open(b, s, t, rules)) return null;
  const rafts = new Set(s.rafts);
  if (rafts.has(t)) {
    if (!isWet(b, s, t, rules)) {
      let n = neighbour(b, t, d);
      if (!open(b, s, n, rules) || rafts.has(n)) return null;
      if (!rules.bellwood && (b.kind[n] === K.Bell || b.kind[n] === K.Up || b.kind[n] === K.Down)) return null;
      rafts.delete(t);
      let path = [t, n];
      if (isWet(b, s, n, rules)) { path = [t, ...drift(b, s, rafts, n, d, rules)]; n = path[path.length - 1]; }
      rafts.add(n);
      events?.push({ type: 'push', raft: s.rafts.indexOf(t), from: t, to: n, path });
    }
  } else if (isWet(b, s, t, rules)) return null;
  events?.push({ type: 'walk', from: s.pos, to: t });
  let tide = s.tide, peak = s.peak;
  const k = b.kind[t] as K;
  if (ruleFor(rules, k)) {
    const was = tide;
    tide = k === K.Bell ? (tide === 0 ? 1 : 0) : k === K.Up ? Math.min(b.maxTide, tide + 1) : Math.max(0, tide - 1);
    events?.push({ type: 'ring', bell: t, from: was, to: tide });
    if (b.hasCastles && tide > peak) {
      const washed: number[] = [];
      if (rules.castles) for (let i = 0; i < b.castle.length; i++) if (b.castle[i] > peak && b.castle[i] <= tide) washed.push(i);
      peak = tide;
      if (washed.length) events?.push({ type: 'wash', tiles: washed });
    }
  }
  const next: State = { pos: t, rafts: [], tide, peak };
  let pos = t;
  const f = b.hasCurrents && rafts.has(t) ? flowAt(b, t, rules) : null;
  if (f) {
    // Stepping onto wood that rests on a current nudges it free: it flows on, and you ride along.
    rafts.delete(t);
    const path = drift(b, next, rafts, t, f, rules);
    const end = path[path.length - 1];
    rafts.add(end);
    if (end !== t) { pos = end; events?.push({ type: 'flow', from: t, to: end, path, rider: true }); }
  }
  next.pos = pos;
  next.rafts = [...rafts].sort((a, c) => a - c);
  if (pos === b.goal) events?.push({ type: 'win' });
  return next;
}

export function rulesWithout(ablations: readonly Ablation[]): { rules: Rules; dropRafts: number[] } {
  const rules = { ...ALL_RULES }; const dropRafts: number[] = [];
  for (const a of ablations) {
    if (a.startsWith('raft:')) dropRafts.push(Number(a.slice(5)));
    else if (a !== 'castleless' && a !== 'high') rules[a as keyof Rules] = false;
  }
  return { rules, dropRafts };
}

export type Solution = { moves: string; states: number } | { moves: null; states: number };

/** Breadth-first search from a state; moves tried U, D, L, R; a state is tested for the flag when it leaves the queue. */
export function solveFrom(b: Board, start: State, rules: Rules = ALL_RULES, cap = 400_000): Solution {
  const parent = new Map<string, [string, Dir] | null>();
  parent.set(stateKey(start), null);
  const queue: State[] = [start];
  for (let head = 0; head < queue.length; head++) {
    const s = queue[head]; const ks = stateKey(s);
    if (isWon(b, s)) {
      const moves: Dir[] = []; let k: string | undefined = ks;
      for (let p = parent.get(k); p; p = parent.get(k)) { moves.push(p[1]); k = p[0]; }
      return { moves: moves.reverse().join(''), states: parent.size };
    }
    if (parent.size > cap) break;
    for (const d of DIRS) {
      const n = step(b, s, d, rules); if (!n) continue;
      const kn = stateKey(n); if (parent.has(kn)) continue;
      parent.set(kn, [ks, d]); queue.push(n);
    }
  }
  return { moves: null, states: parent.size };
}

export function solveLevel(rows: readonly string[], tide: number, ablations: readonly Ablation[] = []): Solution {
  const swap = (map: Record<string, string>) => (r: string) => [...r].map(c => map[c] ?? c).join('');
  let grid = [...rows];
  if (ablations.includes('castleless')) grid = grid.map(swap({ C: 'S', K: 'T' }));
  if (ablations.includes('high')) grid = grid.map(swap({ T: 'S', t: 's', K: 'C' }));
  const b = parseBoard(grid, tide);
  const { rules, dropRafts } = rulesWithout(ablations);
  const s = initialState(b);
  s.rafts = s.rafts.filter((_, i) => !dropRafts.includes(i));
  return solveFrom(b, s, rules);
}

/** Replay a move string; blocked moves are an error. */
export function replay(b: Board, moves: string, from: State = initialState(b)): State {
  let s = from;
  for (const m of moves) { const n = step(b, s, m as Dir); if (!n) throw new Error(`blocked move ${m}`); s = n; }
  return s;
}

/** All states reachable from the start (for invariants and the hint test). */
export function reachable(b: Board, cap = 200_000): State[] {
  const seen = new Map<string, State>(); const s0 = initialState(b); seen.set(stateKey(s0), s0);
  const q = [s0];
  for (let i = 0; i < q.length && seen.size < cap; i++) {
    if (isWon(b, q[i])) continue;
    for (const d of DIRS) { const n = step(b, q[i], d); if (!n) continue; const k = stateKey(n); if (!seen.has(k)) { seen.set(k, n); q.push(n); } }
  }
  return q;
}
