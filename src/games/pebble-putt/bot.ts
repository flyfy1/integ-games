/**
 * Pebble Putt bots. Pure functions over `physics.ts`, used by the tests and by scripts/pebble-putt-search.ts.
 *  - `gridSearch`: every angle (1°) × 40 power steps from one spot (and, for gated holes, several launch times).
 *  - `pathField`: walking distance to the cup around boards, stones and water, the "obvious route" heuristic.
 *  - `sloppyRound`: a planner that picks the shot whose ±3° neighbours also go well, then misses by up to ±3°.
 */
import { BALL_R, compile, pointInPoly, simulateShot, type ShotResult } from './physics';
import type { Hole, Pt } from './types';

export const ANGLES = 360, POWERS = 40;
export const powerAt = (i: number) => (i + 1) / POWERS;

export type Cell = { angle: number; power: number; at: number; r: ShotResult };

/** Simulate every grid shot from (x, y); `phases` lists launch times (hole clock) to try. */
export function gridSearch(hole: Hole, from: Pt, phases: readonly number[] = [0], angleStep = 1, powers = POWERS): Cell[] {
  const out: Cell[] = [];
  for (const at of phases) for (let a = 0; a < 360; a += angleStep) for (let p = 0; p < powers; p++) {
    const power = (p + 1) / powers;
    out.push({ angle: a, power, at, r: simulateShot(hole, from[0], from[1], a, power, at) });
  }
  return out;
}

/** Launch times worth searching: a hole without gates has one; a gated hole is sampled every 0.1 s over its period. */
export function phasesFor(hole: Hole, step = 0.1): number[] {
  const gates = hole.gates ?? [];
  if (!gates.length) return [0];
  const period = gates.reduce((p, g) => Math.max(p, g.period), 0);
  const n = Math.round(period / step);
  return Array.from({ length: n }, (_, i) => +(i * step).toFixed(3));
}

/** Groups of acing cells that touch on the grid (angle ±1 step, power ±1 step, same launch time). */
export function clusters(cells: readonly Cell[], angleStep = 1, powers = POWERS): Cell[][] {
  const key = (c: Cell) => `${c.at}|${Math.round(c.angle / angleStep)}|${Math.round(c.power * powers)}`;
  const map = new Map(cells.map(c => [key(c), c]));
  const seen = new Set<string>(), groups: Cell[][] = [];
  for (const c of cells) {
    const k0 = key(c);
    if (seen.has(k0)) continue;
    const group: Cell[] = [], stack = [c]; seen.add(k0);
    while (stack.length) {
      const cur = stack.pop()!; group.push(cur);
      const ai = Math.round(cur.angle / angleStep), pi = Math.round(cur.power * powers);
      for (const [da, dp] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const steps = 360 / angleStep;
        const k = `${cur.at}|${((ai + da) % steps + steps) % steps}|${pi + dp}`;
        const n = map.get(k);
        if (n && !seen.has(k)) { seen.add(k); stack.push(n); }
      }
    }
    groups.push(group);
  }
  return groups.sort((a, b) => b.length - a.length);
}

// ------------------------------------------------------------------ walking distance to the cup
export type Field = { x0: number; y0: number; res: number; w: number; h: number; d: Float64Array };

export function pathField(hole: Hole, res = 0.1): Field {
  const c = compile(hole);
  const [bx0, by0, bx1, by1] = hole.bounds;
  const x0 = bx0 - 0.5, y0 = by0 - 0.5;
  const w = Math.ceil((bx1 - bx0 + 1) / res), h = Math.ceil((by1 - by0 + 1) / res);
  const blocked = new Uint8Array(w * h);
  const clear = BALL_R + 0.06;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = x0 + (i + 0.5) * res, y = y0 + (j + 0.5) * res;
    let bad = false;
    for (const s of c.segs) {
      if (s.gate >= 0) continue; // gates open, so the walking route may pass them
      let t = ((x - s.ax) * s.dx + (y - s.ay) * s.dy) / s.len2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      if (Math.hypot(x - (s.ax + s.dx * t), y - (s.ay + s.dy * t)) < clear) { bad = true; break; }
    }
    if (!bad) for (const st of c.stones) if (Math.hypot(x - st.x, y - st.y) < st.r + BALL_R) { bad = true; break; }
    if (!bad) for (const p of c.water) if (pointInPoly(p.poly, x, y)) { bad = true; break; }
    blocked[j * w + i] = bad ? 1 : 0;
  }
  const d = new Float64Array(w * h).fill(Infinity);
  const ci = Math.floor((hole.cup[0] - x0) / res), cj = Math.floor((hole.cup[1] - y0) / res);
  // Dijkstra on an 8-neighbour grid with a binary heap
  const heap: number[] = [], hd: number[] = [];
  const push = (idx: number, dist: number) => {
    heap.push(idx); hd.push(dist);
    let k = heap.length - 1;
    while (k > 0) { const p = (k - 1) >> 1; if (hd[p] <= hd[k]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; [hd[p], hd[k]] = [hd[k], hd[p]]; k = p; }
  };
  const pop = () => {
    const top = heap[0], td = hd[0], li = heap.pop()!, ld = hd.pop()!;
    if (heap.length) {
      heap[0] = li; hd[0] = ld; let k = 0;
      for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && hd[l] < hd[m]) m = l; if (r < heap.length && hd[r] < hd[m]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; [hd[m], hd[k]] = [hd[k], hd[m]]; k = m; }
    }
    return [top, td] as const;
  };
  const start = cj * w + ci; d[start] = 0; push(start, 0);
  const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  while (heap.length) {
    const [idx, dist] = pop();
    if (dist > d[idx]) continue;
    const i = idx % w, j = (idx / w) | 0;
    for (const [di, dj, cost] of nb) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
      const n = nj * w + ni;
      if (blocked[n] && n !== start) continue;
      const nd = dist + cost * res;
      if (nd < d[n]) { d[n] = nd; push(n, nd); }
    }
  }
  return { x0, y0, res, w, h, d };
}

export function fieldAt(f: Field, x: number, y: number): number {
  const i = Math.floor((x - f.x0) / f.res), j = Math.floor((y - f.y0) / f.res);
  if (i < 0 || j < 0 || i >= f.w || j >= f.h) return 99;
  let v = f.d[j * f.w + i];
  if (!Number.isFinite(v)) { // a pebble resting against a board sits in a blocked cell: use the best neighbour
    for (let r = 1; r <= 3 && !Number.isFinite(v); r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const ni = i + di, nj = j + dj;
      if (ni >= 0 && nj >= 0 && ni < f.w && nj < f.h) v = Math.min(v, f.d[nj * f.w + ni] + Math.hypot(di, dj) * f.res);
    }
  }
  return Number.isFinite(v) ? v : 99;
}

/** Expected strokes still needed from a spot, by walking distance (a rough, monotonic estimate). */
export const strokesFrom = (d: number) => d < 0.05 ? 0 : 1 + 1.6 * (1 - Math.exp(-d / 3.5));

// ------------------------------------------------------------------ the sloppy bot
export type Rng = () => number;
export function mulberry(seed: number): Rng {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

type PlanOpts = { angleStep?: number; powers?: number; spread?: number; phases?: number[]; noSink?: boolean };
/** Pick a shot from (x, y) at clock t: the one whose outcomes across ±spread degrees are best on average. */
export function planShot(hole: Hole, field: Field, x: number, y: number, t: number, o: PlanOpts = {}) {
  const angleStep = o.angleStep ?? 1.5, powers = o.powers ?? 24, spread = o.spread ?? 3;
  const steps = Math.round(360 / angleStep), k = Math.round(spread / angleStep);
  const phases = o.phases ?? [0];
  let best = { angle: 0, power: 0.5, wait: 0, value: Infinity };
  for (const wait of phases) {
    const vals = new Float64Array(steps * powers);
    for (let a = 0; a < steps; a++) for (let p = 0; p < powers; p++) {
      const r = simulateShot(hole, x, y, a * angleStep, (p + 1) / powers, t + wait);
      vals[a * powers + p] = r.sunk ? (o.noSink ? 9 : 0) : r.water ? 1 + strokesFrom(fieldAt(field, x, y)) : strokesFrom(fieldAt(field, r.x, r.y));
    }
    for (let a = 0; a < steps; a++) for (let p = 0; p < powers; p++) {
      let sum = 0;
      for (let da = -k; da <= k; da++) sum += vals[(((a + da) % steps + steps) % steps) * powers + p];
      const v = sum / (2 * k + 1) + wait * 0.01;
      if (v < best.value) best = { angle: a * angleStep, power: (p + 1) / powers, wait, value: v };
    }
  }
  return best;
}

/**
 * One sloppy round: plan with `planShot`, then miss the angle by a uniform ±3° (and the power by ±3%).
 * Returns the strokes taken (penalties included), capped at `cap`.
 */
export function sloppyRound(hole: Hole, rng: Rng, field = pathField(hole), o: PlanOpts & { cap?: number; noise?: number } = {}) {
  const cap = o.cap ?? hole.par + 5, noise = o.noise ?? 3;
  const gated = !!hole.gates?.length;
  let x = hole.tee[0], y = hole.tee[1], t = rng() * 2, strokes = 0;
  const shots: { angle: number; power: number; at: number }[] = [];
  while (strokes < cap) {
    const plan = planShot(hole, field, x, y, t, { ...o, phases: gated ? [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75] : [0] });
    const angle = plan.angle + (rng() * 2 - 1) * noise;
    const power = Math.max(0.01, Math.min(1, plan.power * (1 + (rng() * 2 - 1) * 0.03)));
    const at = t + plan.wait + (gated ? (rng() * 2 - 1) * 0.05 : 0);
    const r = simulateShot(hole, x, y, angle, power, at);
    shots.push({ angle, power, at });
    strokes += r.water ? 2 : 1;
    t = at + r.t + 0.8;
    if (r.sunk) return { strokes, shots, holed: true };
    if (!r.water) { x = r.x; y = r.y; }
  }
  return { strokes: cap, shots, holed: false };
}
