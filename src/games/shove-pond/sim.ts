/**
 * Shove Pond rules: a pure, integer-only function from a state and every frog's three-step plan to the next state
 * plus the events the renderer plays back. No DOM, no Math.random, no floats: every client that starts from the
 * same seed and applies the same revealed plans reaches a byte-identical state.
 *
 * Rules pinned here (and in tests/shove-pond-sim.test.ts):
 * - Actions: hop up/right/down/left, Brace, and Sit (the filler for an unplanned slot; never chosen by a player).
 *   One Brace per round: any later Brace in the same plan is played as Sit.
 * - Steps resolve 1, 2, 3 for everyone. Within a step frogs act in their printed order (lowest score first;
 *   ties rotate with the round so no seat always goes first). A braced frog is braced for the whole step.
 * - Hopping into a frog shoves the whole line one pad. If any frog in that line is braced, nothing moves and the
 *   hopper bounces back. The frog pushed off the end of the line splashes.
 * - A splash scores 1 for whoever last shoved the victim this round (2 if the victim wore the crown), whether the
 *   shove itself knocked it in, it later hopped in from the wrong pad, or its pad sank under it. Nobody else scores.
 * - The crown sits on the single leader (score at least 1) at the start of a round.
 * - From round 3 the outer ring wobbles and sinks at the end of that round; round 5 the next ring: 7x7 -> 5x5 -> 3x3.
 * - Splashed frogs return next round on an empty edge pad. First to 6 at the end of a round wins; otherwise the
 *   leader after round 8. A tie at the top plays on (up to round 10), then the tied leaders share the win.
 */
export const SIZE = 7;
export const UP = 0, RIGHT = 1, DOWN = 2, LEFT = 3, BRACE = 4, SIT = 5;
export type Action = 0 | 1 | 2 | 3 | 4 | 5;
export type Plan = [Action, Action, Action];
export const DX: readonly number[] = [0, 1, 0, -1];
export const DY: readonly number[] = [-1, 0, 1, 0];
export const TARGET = 6, MAX_ROUNDS = 8, HARD_STOP = 10;
/** Round in which each ring wobbles (it sinks at the end of that round). */
export const WOBBLE_ROUND: Record<number, number> = { 3: 0, 5: 1 };

export type Frog = { x: number; y: number; score: number; wet: boolean };
export type State = {
  n: number;
  size: number;
  /** Row-major: 0 water, 1 pad, 2 wobbling pad (sinks at the end of this round). */
  pads: number[];
  frogs: Frog[];
  round: number;
  seed: number;
  /** Respawn tie-break PRNG state (uint32). */
  rng: number;
  over: boolean;
  winners: number[];
  /** Scenario extras (lessons and puzzles): a fly to eat, a fixed move order and crown, no sinking or respawn. */
  scenario?: { fly?: [number, number]; order?: number[]; crown?: number };
};

export type SimEvent =
  | { k: 'hop'; s: number; step: number; fx: number; fy: number; tx: number; ty: number }
  | { k: 'shove'; s: number; step: number; line: number[] }
  | { k: 'pushed'; s: number; by: number; step: number; fx: number; fy: number; tx: number; ty: number }
  | { k: 'bounce'; s: number; step: number; x: number; y: number; dir: number; wall: number }
  | { k: 'brace'; s: number; step: number }
  | { k: 'splash'; s: number; step: number; x: number; y: number; by: number; pts: number; why: 'shove' | 'hop' | 'sink' }
  | { k: 'eat'; s: number; step: number }
  | { k: 'sink'; cells: number[] }
  | { k: 'respawn'; s: number; x: number; y: number }
  | { k: 'end'; winners: number[] };

export type RoundResult = {
  state: State;
  events: SimEvent[];
  /** Order the frogs acted in (seat numbers). */
  order: number[];
  /** Crowned seat during this round, or -1. */
  crown: number;
  /** Seats that splashed this round, in the order they fell. */
  splashed: number[];
  /** Fly eaten by this seat, or -1. */
  ate: number;
};

const idx = (x: number, y: number, size = SIZE) => y * size + x;
const ring = (x: number, y: number, size = SIZE) => Math.min(x, y, size - 1 - x, size - 1 - y);
export const isPad = (s: State, x: number, y: number) => x >= 0 && y >= 0 && x < s.size && y < s.size && s.pads[idx(x, y, s.size)] > 0;
export const frogAt = (s: State, x: number, y: number) => s.frogs.findIndex(f => !f.wet && f.x === x && f.y === y);

/** mulberry32 step on a uint32 state: returns [value in 0..2^32-1, next state]. */
export function rngNext(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0), next];
}
export function hash32(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) { h ^= p >>> 0; h = Math.imul(h, 0x01000193) >>> 0; h ^= h >>> 13; }
  return h >>> 0;
}

/** Canonical plan: exactly three actions in 0..5, braces after the first become Sit. */
export function normalizePlan(raw: readonly number[] | undefined | null): Plan {
  const out: Action[] = [SIT, SIT, SIT];
  let braced = false;
  for (let i = 0; i < 3; i++) {
    const v = raw?.[i];
    let a: Action = typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 5 ? v as Action : SIT;
    if (a === BRACE) { if (braced) a = SIT; braced = true; }
    out[i] = a;
  }
  return out as Plan;
}
const CODE = 'URDLB-';
export const planToString = (p: readonly number[]) => normalizePlan(p).map(a => CODE[a]).join('');
export function planFromString(text: unknown): Plan | null {
  if (typeof text !== 'string' || text.length !== 3) return null;
  const raw = [...text].map(c => CODE.indexOf(c));
  return raw.some(v => v < 0) ? null : normalizePlan(raw);
}
/** All 125 player-choosable plans (hops and Brace), in index order s1*25 + s2*5 + s3. */
export const ALL_PLANS: Plan[] = Array.from({ length: 125 }, (_, i) => [Math.floor(i / 25), Math.floor(i / 5) % 5, i % 5] as Plan);
/** The 112 distinct plans that obey one Brace per round. */
export const LEGAL_PLANS: Plan[] = ALL_PLANS.filter(p => p.filter(a => a === BRACE).length <= 1);

const SPAWNS: [number, number][] = [[1, 1], [5, 5], [5, 1], [1, 5], [3, 1], [3, 5]];

export function createMatch(seed: number, n: number): State {
  const count = Math.max(2, Math.min(6, Math.floor(n)));
  let rng = hash32(seed >>> 0, count) || 1;
  const spots = SPAWNS.slice(0, count);
  // Seed-shuffled seat -> spawn mapping (Fisher-Yates on integers).
  for (let i = spots.length - 1; i > 0; i--) {
    let v: number; [v, rng] = rngNext(rng);
    const j = v % (i + 1);
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  return {
    n: count, size: SIZE, pads: new Array(SIZE * SIZE).fill(1),
    frogs: spots.map(([x, y]) => ({ x, y, score: 0, wet: false })),
    round: 1, seed: seed >>> 0, rng, over: false, winners: []
  };
}

export function cloneState(s: State): State {
  return { ...s, pads: s.pads.slice(), frogs: s.frogs.map(f => ({ ...f })), winners: s.winners.slice(), scenario: s.scenario ? { ...s.scenario, order: s.scenario.order?.slice() } : undefined };
}

export function crownOf(s: State): number {
  if (s.scenario) return s.scenario.crown ?? -1;
  let best = 0, who = -1, tie = false;
  s.frogs.forEach((f, i) => { if (f.score > best) { best = f.score; who = i; tie = false; } else if (f.score === best && best > 0) tie = true; });
  return tie ? -1 : who;
}

/** Seats in acting order for this round: lowest score first, ties rotating with the round number. */
export function moveOrder(s: State): number[] {
  if (s.scenario?.order) return s.scenario.order.slice();
  const seats = s.frogs.map((_, i) => i);
  return seats.sort((a, b) => (s.frogs[a].score - s.frogs[b].score) || (((a - s.round) % s.n + s.n) % s.n) - (((b - s.round) % s.n + s.n) % s.n));
}

export function resolveRound(input: State, rawPlans: readonly (readonly number[] | null | undefined)[]): RoundResult {
  const s = cloneState(input);
  const events: SimEvent[] = [];
  const order = moveOrder(s);
  const crown = crownOf(s);
  const plans = s.frogs.map((_, i) => normalizePlan(rawPlans[i]));
  const lastShover = s.frogs.map(() => -1);
  const splashed: number[] = [];
  let ate = -1;
  const fly = s.scenario?.fly;
  if (s.over) return { state: s, events, order, crown, splashed, ate };

  const splash = (victim: number, step: number, x: number, y: number, why: 'shove' | 'hop' | 'sink') => {
    const f = s.frogs[victim];
    f.wet = true;
    const by = lastShover[victim];
    const pts = by >= 0 && by !== victim ? (victim === crown ? 2 : 1) : 0;
    if (pts) s.frogs[by].score += pts;
    splashed.push(victim);
    events.push({ k: 'splash', s: victim, step, x, y, by: pts ? by : -1, pts, why });
  };

  for (let step = 0; step < 3; step++) {
    const braced = new Set<number>();
    for (const seat of order) if (!s.frogs[seat].wet && plans[seat][step] === BRACE) { braced.add(seat); events.push({ k: 'brace', s: seat, step }); }
    for (const seat of order) {
      const me = s.frogs[seat];
      const a = plans[seat][step];
      if (me.wet || a >= BRACE) continue;
      const tx = me.x + DX[a], ty = me.y + DY[a];
      if (!isPad(s, tx, ty)) {
        events.push({ k: 'hop', s: seat, step, fx: me.x, fy: me.y, tx, ty });
        splash(seat, step, tx, ty, 'hop');
        continue;
      }
      const first = frogAt(s, tx, ty);
      if (first < 0) {
        events.push({ k: 'hop', s: seat, step, fx: me.x, fy: me.y, tx, ty });
        me.x = tx; me.y = ty;
      } else {
        const line: number[] = [];
        let cx = tx, cy = ty;
        while (isPad(s, cx, cy)) { const o = frogAt(s, cx, cy); if (o < 0) break; line.push(o); cx += DX[a]; cy += DY[a]; }
        const wall = line.find(o => braced.has(o));
        if (wall !== undefined) { events.push({ k: 'bounce', s: seat, step, x: me.x, y: me.y, dir: a, wall }); continue; }
        events.push({ k: 'shove', s: seat, step, line: line.slice() });
        for (let i = line.length - 1; i >= 0; i--) {
          const o = s.frogs[line[i]];
          const nx = o.x + DX[a], ny = o.y + DY[a];
          lastShover[line[i]] = seat;
          events.push({ k: 'pushed', s: line[i], by: seat, step, fx: o.x, fy: o.y, tx: nx, ty: ny });
          if (isPad(s, nx, ny)) { o.x = nx; o.y = ny; }
          else splash(line[i], step, nx, ny, 'shove');
        }
        events.push({ k: 'hop', s: seat, step, fx: me.x, fy: me.y, tx, ty });
        me.x = tx; me.y = ty;
      }
    }
    if (fly && ate < 0) {
      const eater = order.find(seat => !s.frogs[seat].wet && s.frogs[seat].x === fly[0] && s.frogs[seat].y === fly[1]);
      if (eater !== undefined) { ate = eater; events.push({ k: 'eat', s: eater, step }); }
    }
  }

  if (s.scenario) return { state: s, events, order, crown, splashed, ate };

  // Wobbling pads sink at the end of the round they wobble in.
  const sinking: number[] = [];
  s.pads.forEach((v, i) => { if (v === 2) sinking.push(i); });
  if (sinking.length) {
    for (const i of sinking) s.pads[i] = 0;
    events.push({ k: 'sink', cells: sinking });
    for (const seat of order) {
      const f = s.frogs[seat];
      if (!f.wet && s.pads[idx(f.x, f.y, s.size)] === 0) splash(seat, 3, f.x, f.y, 'sink');
    }
  }

  // Win check at the end of the round.
  const top = Math.max(...s.frogs.map(f => f.score));
  const leaders = s.frogs.map((f, i) => (f.score === top ? i : -1)).filter(i => i >= 0);
  if ((top >= TARGET || s.round >= MAX_ROUNDS) && (leaders.length === 1 || s.round >= HARD_STOP)) {
    s.over = true; s.winners = leaders;
    events.push({ k: 'end', winners: leaders.slice() });
    return { state: s, events, order, crown, splashed, ate };
  }

  s.round += 1;
  const wob = WOBBLE_ROUND[s.round];
  if (wob !== undefined) s.pads.forEach((v, i) => { if (v === 1 && ring(i % s.size, Math.floor(i / s.size), s.size) === wob) s.pads[i] = 2; });

  // Respawn splashed frogs (in acting order) on an empty, steady edge pad far from other frogs.
  for (const seat of order) {
    const f = s.frogs[seat];
    if (!f.wet) continue;
    const spot = respawnSpot(s);
    if (!spot) continue; // the pond is full: stay out a round (cannot happen with at most 6 frogs on 9 pads)
    f.x = spot[0]; f.y = spot[1]; f.wet = false;
    events.push({ k: 'respawn', s: seat, x: f.x, y: f.y });
  }
  return { state: s, events, order, crown, splashed, ate };
}

function respawnSpot(s: State): [number, number] | null {
  const steady = (x: number, y: number) => x >= 0 && y >= 0 && x < s.size && y < s.size && s.pads[idx(x, y, s.size)] === 1;
  const others = s.frogs.filter(f => !f.wet);
  let best: [number, number][] = [], bestScore = -1;
  const consider = (edgeOnly: boolean) => {
    for (let y = 0; y < s.size; y++) for (let x = 0; x < s.size; x++) {
      if (!steady(x, y) || frogAt(s, x, y) >= 0) continue;
      const edge = [0, 1, 2, 3].some(d => !steady(x + DX[d], y + DY[d]));
      if (edgeOnly && !edge) continue;
      const near = others.length ? Math.min(...others.map(o => Math.abs(o.x - x) + Math.abs(o.y - y))) : 9;
      if (near > bestScore) { bestScore = near; best = [[x, y]]; } else if (near === bestScore) best.push([x, y]);
    }
  };
  consider(true);
  if (!best.length) consider(false);
  if (!best.length) return null;
  let v: number; [v, s.rng] = rngNext(s.rng);
  return best[v % best.length];
}

/** Stable digest of a state, for determinism checks and desync detection. */
export function stateHash(s: State): number {
  const parts: number[] = [s.n, s.round, s.rng, s.over ? 1 : 0, ...s.winners, ...s.pads];
  for (const f of s.frogs) parts.push(f.x + 16, f.y + 16, f.score, f.wet ? 1 : 0);
  return hash32(...parts);
}

export const ringOf = ring;
export const cellIndex = idx;
