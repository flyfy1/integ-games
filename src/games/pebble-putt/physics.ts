/**
 * Pebble Putt physics: a pebble rolling on an analytic height field, bouncing off board segments and round stones,
 * with a fixed 1/120 s step. Pure and deterministic (no DOM, no Three.js), so the shot-search bot in Node and the
 * renderer in the browser step exactly the same world.
 *
 * Plane coordinates: x to the right, y up the hole (away from the tee). Height h(x, y) is in the same units.
 */
import type { Hole, Pt, Slope } from './types';

export const DT = 1 / 120;
export const BALL_R = 0.16;
export const CUP_R = 0.3;
const WALL_HALF = 0.06;
const G = 6;              // effective gravity for a rolling ball (units/s²)
const ROLL = 1.25;        // rolling resistance (units/s²)
const DRAG = 0.32;        // speed-proportional drag (1/s)
const STATIC = 1.05;      // slope acceleration the sand can hold a resting pebble against
const REST_SPEED = 0.06;
const MAX_SPEED = 12.5;   // v·dt stays below the pebble radius, so nothing tunnels
export const V_MIN = 0.7, V_MAX = 12;
const CUP_SPEED = 2.3;    // slower than this over the cup drops in
const CUP_CENTRE_SPEED = 3.9; // a dead-centre hit drops in a little faster
const SETTLE_AT = 4.6, REST_BY = 6; // every shot is at rest within six seconds
const PIPE_R = 0.3;

export const shotSpeed = (power: number) => V_MIN + Math.max(0, Math.min(1, power)) * (V_MAX - V_MIN);

// ------------------------------------------------------------------ height field
export function height(slopes: readonly Slope[], x: number, y: number): number {
  let h = 0;
  for (const s of slopes) {
    if (s.kind === 'plane') h += s.ax * x + s.ay * y;
    else if (s.kind === 'bump') {
      const dx = x - s.x, dy = y - s.y, c = s.cos ?? 1, sn = s.sin ?? 0;
      const u = (dx * c + dy * sn) / s.sx, v = (-dx * sn + dy * c) / s.sy;
      h += s.a * Math.exp(-0.5 * (u * u + v * v));
    } else {
      const u = ((x - s.x) * s.nx + (y - s.y) * s.ny) / s.w;
      const c = u < -1 ? -1 : u > 1 ? 1 : u;
      h += s.a * (0.5 + 0.75 * c - 0.25 * c * c * c);
    }
  }
  return h;
}

/** Gradient of the height field, written into `out`. */
export function gradient(slopes: readonly Slope[], x: number, y: number, out: { gx: number; gy: number }) {
  let gx = 0, gy = 0;
  for (const s of slopes) {
    if (s.kind === 'plane') { gx += s.ax; gy += s.ay; }
    else if (s.kind === 'bump') {
      const dx = x - s.x, dy = y - s.y, c = s.cos ?? 1, sn = s.sin ?? 0;
      const u = (dx * c + dy * sn) / s.sx, v = (-dx * sn + dy * c) / s.sy;
      const e = s.a * Math.exp(-0.5 * (u * u + v * v));
      if (e === 0) continue;
      const du = -u / s.sx * e, dv = -v / s.sy * e; // dh/du', dh/dv' in plane units
      gx += du * c - dv * sn; gy += du * sn + dv * c;
    } else {
      const u = ((x - s.x) * s.nx + (y - s.y) * s.ny) / s.w;
      if (u <= -1 || u >= 1) continue;
      const d = s.a * 0.75 * (1 - u * u) / s.w;
      gx += d * s.nx; gy += d * s.ny;
    }
  }
  out.gx = gx; out.gy = gy;
}

export function pointInPoly(poly: readonly Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ------------------------------------------------------------------ compiled hole
type Seg = { ax: number; ay: number; bx: number; by: number; dx: number; dy: number; len2: number; minx: number; maxx: number; miny: number; maxy: number; gate: number };
type Zone = { poly: readonly Pt[]; mul: number; minx: number; maxx: number; miny: number; maxy: number };
type Poly = { poly: readonly Pt[]; minx: number; maxx: number; miny: number; maxy: number };
export type Course = {
  hole: Hole;
  segs: Seg[];
  stones: { x: number; y: number; r: number; e: number; spring: boolean }[];
  water: Poly[];
  zones: Zone[];
  gates: { period: number; open: number; phase: number }[];
};

const bbox = (poly: readonly Pt[]) => {
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (const [x, y] of poly) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
  return { minx, maxx, miny, maxy };
};

const seg = (a: Pt, b: Pt, gate = -1): Seg => {
  const pad = BALL_R + WALL_HALF + 0.02;
  return { ax: a[0], ay: a[1], bx: b[0], by: b[1], dx: b[0] - a[0], dy: b[1] - a[1], len2: (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2,
    minx: Math.min(a[0], b[0]) - pad, maxx: Math.max(a[0], b[0]) + pad, miny: Math.min(a[1], b[1]) - pad, maxy: Math.max(a[1], b[1]) + pad, gate };
};

const cache = new WeakMap<Hole, Course>();
export function compile(hole: Hole): Course {
  const hit = cache.get(hole);
  if (hit) return hit;
  for (const s of hole.slopes) if (s.kind === 'bump' && s.rot !== undefined) { s.cos = Math.cos(s.rot); s.sin = Math.sin(s.rot); }
  const segs: Seg[] = [];
  for (const line of hole.walls) for (let i = 0; i + 1 < line.length; i++) segs.push(seg(line[i], line[i + 1]));
  (hole.gates ?? []).forEach((g, k) => segs.push(seg(g.a, g.b, k)));
  const course: Course = {
    hole, segs,
    stones: (hole.stones ?? []).map(s => ({ x: s.x, y: s.y, r: s.r, e: s.spring ? 1.22 : 0.62, spring: !!s.spring })),
    water: (hole.water ?? []).map(poly => ({ poly, ...bbox(poly) })),
    zones: (hole.zones ?? []).map(z => ({ poly: z.poly, mul: z.kind === 'gravel' ? 2.6 : 0.45, ...bbox(z.poly) })),
    gates: (hole.gates ?? []).map(g => ({ period: g.period, open: g.open, phase: g.phase ?? 0 }))
  };
  cache.set(hole, course);
  return course;
}

/** A gate is open for `open` seconds at the start of every period (shifted by its phase). */
export function gateOpen(g: { period: number; open: number; phase: number }, t: number): boolean {
  const m = ((t + g.phase) % g.period + g.period) % g.period;
  return m < g.open;
}
/** 0 = closed, 1 = fully lifted; for drawing (the physics only knows open or closed). */
export function gateLift(g: { period: number; open: number; phase: number }, t: number): number {
  const m = ((t + g.phase) % g.period + g.period) % g.period;
  const ramp = 0.12;
  return m < g.open ? Math.min(1, m / ramp, (g.open - m) / ramp) : 0;
}

// ------------------------------------------------------------------ world
export type Ball = {
  x: number; y: number; vx: number; vy: number;
  moving: boolean; sunk: boolean; onCourse: boolean;
  /** Where the pebble last came to rest (water sends it back here). */
  restX: number; restY: number;
  /** Rolled distance, for drawing the spin. */
  roll: number;
  lip: boolean; inPipe: number;
};
export type World = { course: Course; t: number; shotT: number; balls: Ball[]; settling: boolean };
export type SimEvent =
  | { kind: 'wall' | 'stone' | 'spring' | 'ball' | 'gate-hit'; ball: number; speed: number; x: number; y: number }
  | { kind: 'cup' | 'lip' | 'water' | 'pipe' | 'rest'; ball: number; x: number; y: number; speed: number };

export function newBall(x: number, y: number, onCourse = true): Ball {
  return { x, y, vx: 0, vy: 0, moving: false, sunk: false, onCourse, restX: x, restY: y, roll: 0, lip: false, inPipe: -1 };
}

export function createWorld(hole: Hole, balls = 1, t = 0): World {
  const course = compile(hole);
  return { course, t, shotT: 0, settling: false, balls: Array.from({ length: balls }, () => newBall(hole.tee[0], hole.tee[1], balls === 1)) };
}

export function strike(world: World, index: number, angleDeg: number, power: number) {
  const b = world.balls[index];
  const v = shotSpeed(power), a = angleDeg * Math.PI / 180;
  b.onCourse = true; b.sunk = false;
  b.restX = b.x; b.restY = b.y;
  b.vx = Math.cos(a) * v; b.vy = Math.sin(a) * v; b.moving = true; b.lip = false;
  world.shotT = 0; world.settling = true;
}

export const anyMoving = (w: World) => w.balls.some(b => b.moving);

const grad = { gx: 0, gy: 0 };

/** Advance one fixed step. Events are appended to `events` when given. */
export function step(w: World, events?: SimEvent[]) {
  const c = w.course, hole = c.hole, dt = DT;
  w.t += dt;
  if (!w.settling) return;
  w.shotT += dt;
  const settle = w.shotT > SETTLE_AT ? 1 + (w.shotT - SETTLE_AT) * 5 : 1;
  const forceStop = w.shotT >= REST_BY;
  const n = w.balls.length;
  for (let i = 0; i < n; i++) {
    const b = w.balls[i];
    if (!b.moving) continue;
    if (forceStop) { stop(w, i, events); continue; }
    gradient(hole.slopes, b.x, b.y, grad);
    const ax = -G * grad.gx, ay = -G * grad.gy;
    let mul = 1;
    for (const z of c.zones) if (b.x >= z.minx && b.x <= z.maxx && b.y >= z.miny && b.y <= z.maxy && pointInPoly(z.poly, b.x, b.y)) { mul = z.mul; break; }
    const sp = Math.hypot(b.vx, b.vy);
    const fr = (ROLL * mul + DRAG * sp) * settle;
    const slopeA = Math.hypot(ax, ay);
    if (sp < REST_SPEED && slopeA < STATIC * mul * settle) { stop(w, i, events); continue; }
    b.vx += ax * dt; b.vy += ay * dt;
    const sp2 = Math.hypot(b.vx, b.vy);
    if (sp2 > 0) {
      const k = Math.max(0, sp2 - fr * dt) / sp2;
      b.vx *= k; b.vy *= k;
    }
    const s3 = Math.hypot(b.vx, b.vy);
    if (s3 > MAX_SPEED) { b.vx *= MAX_SPEED / s3; b.vy *= MAX_SPEED / s3; }
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.roll += Math.min(s3, MAX_SPEED) * dt;
    collide(w, i, events);
    if (!b.moving) continue;
    // cup: slow enough over the hole drops in; a dead-centre hit forgives a little more speed; a gentle funnel
    const cdx = hole.cup[0] - b.x, cdy = hole.cup[1] - b.y, cd = Math.hypot(cdx, cdy);
    if (cd < CUP_R + 0.1 && cd > 1e-6) {
      const pull = 1.6 * dt / cd;
      b.vx += cdx * pull; b.vy += cdy * pull;
    }
    if (cd < CUP_R) {
      const s = Math.hypot(b.vx, b.vy);
      if (s < CUP_SPEED || (s < CUP_CENTRE_SPEED && cd < 0.11)) {
        b.sunk = true; b.moving = false; b.vx = b.vy = 0; b.x = hole.cup[0]; b.y = hole.cup[1];
        events?.push({ kind: 'cup', ball: i, x: b.x, y: b.y, speed: s });
        continue;
      }
      if (!b.lip) { b.lip = true; b.vx *= 0.8; b.vy *= 0.8; events?.push({ kind: 'lip', ball: i, x: b.x, y: b.y, speed: s }); }
    } else if (cd > CUP_R + 0.05) b.lip = false;
    // water returns the pebble to its last resting place
    for (const p of c.water) if (b.x >= p.minx && b.x <= p.maxx && b.y >= p.miny && b.y <= p.maxy && pointInPoly(p.poly, b.x, b.y)) {
      events?.push({ kind: 'water', ball: i, x: b.x, y: b.y, speed: Math.hypot(b.vx, b.vy) });
      b.x = b.restX; b.y = b.restY; b.vx = b.vy = 0; b.moving = false; b.lip = false;
      break;
    }
    if (!b.moving) continue;
    // bamboo pipes carry the pebble under the sand to their exit
    const pipes = hole.pipes;
    if (pipes) for (let k = 0; k < pipes.length; k++) {
      const p = pipes[k];
      if (b.inPipe === k) { if (Math.hypot(b.x - p.b[0], b.y - p.b[1]) > PIPE_R + BALL_R + 0.05) b.inPipe = -1; continue; }
      if (Math.hypot(b.x - p.a[0], b.y - p.a[1]) < PIPE_R) {
        const s = Math.max(2.4, Math.hypot(b.vx, b.vy) * 0.92), a = p.out * Math.PI / 180;
        events?.push({ kind: 'pipe', ball: i, x: b.x, y: b.y, speed: s });
        b.x = p.b[0]; b.y = p.b[1]; b.vx = Math.cos(a) * s; b.vy = Math.sin(a) * s; b.inPipe = k;
        break;
      }
    }
  }
  // a gate that drops onto a resting pebble nudges it clear
  if (c.gates.length) for (let i = 0; i < n; i++) { const b = w.balls[i]; if (!b.moving && b.onCourse && !b.sunk) pushOutOfGates(w, b); }
  if (!w.balls.some(b => b.moving)) w.settling = false;
}

function stop(w: World, i: number, events?: SimEvent[]) {
  const b = w.balls[i];
  b.moving = false; b.vx = b.vy = 0; b.lip = false;
  b.restX = b.x; b.restY = b.y;
  events?.push({ kind: 'rest', ball: i, x: b.x, y: b.y, speed: 0 });
}

function pushOutOfGates(w: World, b: Ball) {
  const R = BALL_R + WALL_HALF;
  for (const s of w.course.segs) {
    if (s.gate < 0 || gateOpen(w.course.gates[s.gate], w.t)) continue;
    const q = closest(s, b.x, b.y), dx = b.x - q.x, dy = b.y - q.y, d = Math.hypot(dx, dy);
    if (d < R) { const nx = d > 1e-6 ? dx / d : -s.dy / Math.sqrt(s.len2), ny = d > 1e-6 ? dy / d : s.dx / Math.sqrt(s.len2); b.x = q.x + nx * R; b.y = q.y + ny * R; b.restX = b.x; b.restY = b.y; }
  }
}

const cq = { x: 0, y: 0 };
function closest(s: Seg, px: number, py: number) {
  let t = ((px - s.ax) * s.dx + (py - s.ay) * s.dy) / s.len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  cq.x = s.ax + s.dx * t; cq.y = s.ay + s.dy * t;
  return cq;
}

function collide(w: World, i: number, events?: SimEvent[]) {
  const b = w.balls[i], c = w.course;
  const R = BALL_R + WALL_HALF;
  for (const s of c.segs) {
    if (b.x < s.minx || b.x > s.maxx || b.y < s.miny || b.y > s.maxy) continue;
    if (s.gate >= 0 && gateOpen(c.gates[s.gate], w.t)) continue;
    const q = closest(s, b.x, b.y), dx = b.x - q.x, dy = b.y - q.y, d2 = dx * dx + dy * dy;
    if (d2 >= R * R || d2 < 1e-12) continue;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
    b.x = q.x + nx * R; b.y = q.y + ny * R;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      const e = 0.62;
      const tx = b.vx - vn * nx, ty = b.vy - vn * ny;
      b.vx = tx * 0.96 - e * vn * nx; b.vy = ty * 0.96 - e * vn * ny;
      events?.push({ kind: s.gate >= 0 ? 'gate-hit' : 'wall', ball: i, speed: -vn, x: q.x, y: q.y });
    }
  }
  for (const st of c.stones) {
    const dx = b.x - st.x, dy = b.y - st.y, R2 = st.r + BALL_R, d2 = dx * dx + dy * dy;
    if (d2 >= R2 * R2 || d2 < 1e-12) continue;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
    b.x = st.x + nx * R2; b.y = st.y + ny * R2;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      let kick = -(1 + st.e) * vn;
      if (st.spring) kick = Math.max(kick, 4.5 - vn); // a springy bamboo post always sends it away briskly
      b.vx += kick * nx; b.vy += kick * ny;
      events?.push({ kind: st.spring ? 'spring' : 'stone', ball: i, speed: -vn, x: st.x + nx * st.r, y: st.y + ny * st.r });
    }
  }
  // other pebbles: equal masses, slightly inelastic; a resting one is knocked into motion
  for (let j = 0; j < w.balls.length; j++) {
    if (j === i) continue;
    const o = w.balls[j];
    if (!o.onCourse || o.sunk) continue;
    const dx = b.x - o.x, dy = b.y - o.y, d2 = dx * dx + dy * dy, R2 = 2 * BALL_R;
    if (d2 >= R2 * R2 || d2 < 1e-12) continue;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, overlap = R2 - d;
    b.x += nx * overlap * 0.5; b.y += ny * overlap * 0.5; o.x -= nx * overlap * 0.5; o.y -= ny * overlap * 0.5;
    const rel = (b.vx - o.vx) * nx + (b.vy - o.vy) * ny;
    if (rel < 0) {
      const jimp = -(1 + 0.9) * rel / 2;
      b.vx += jimp * nx; b.vy += jimp * ny; o.vx -= jimp * nx; o.vy -= jimp * ny;
      if (!o.moving) { o.moving = true; o.restX = o.x; o.restY = o.y; }
      events?.push({ kind: 'ball', ball: i, speed: -rel, x: o.x + nx * BALL_R, y: o.y + ny * BALL_R });
    }
  }
}

// ------------------------------------------------------------------ one-shot simulation (bot, preview)
export type ShotResult = { sunk: boolean; water: boolean; x: number; y: number; t: number; bounces: number; path?: number[] };

/** Simulate one shot of a lone pebble from (x, y) at hole clock `t0`. */
export function simulateShot(hole: Hole, x: number, y: number, angleDeg: number, power: number, t0 = 0, opts: { path?: boolean; maxBounces?: number } = {}): ShotResult {
  const w = createWorld(hole, 1, t0);
  const b = w.balls[0];
  b.x = x; b.y = y;
  strike(w, 0, angleDeg, power);
  const events: SimEvent[] = [];
  const path: number[] | undefined = opts.path ? [x, y] : undefined;
  let water = false, bounces = 0, n = 0;
  while (b.moving) {
    events.length = 0;
    step(w, events);
    for (const e of events) {
      if (e.kind === 'water') water = true;
      else if (e.kind === 'wall' || e.kind === 'stone' || e.kind === 'spring' || e.kind === 'gate-hit') bounces++;
    }
    if (path && (++n % 4 === 0 || !b.moving)) path.push(b.x, b.y);
    if (opts.maxBounces !== undefined && bounces > opts.maxBounces) break;
    if (water) break;
  }
  return { sunk: b.sunk, water, x: b.x, y: b.y, t: w.shotT, bounces, path };
}
