/**
 * Fruit Orbit simulation: deterministic circle physics plus the merge, chain and overflow rules.
 * No DOM and no randomness of its own (the caller passes `random`), so it runs the same in tests and in versus seats.
 *
 * Physics is position-based with small substeps: integrate, push overlapping circles apart by inverse mass, derive
 * velocity from the corrected positions, then remove approach speed and apply Coulomb friction with spin. That keeps
 * piles from jittering or sinking while still letting fruit roll into gaps.
 */

export const TIER_COUNT = 11;
/** Collision radius per tier, in canvas units. */
export const RADII: readonly number[] = [13, 18, 24, 31, 38, 46, 55, 65, 75, 86, 98];
export const TOP_TIER = TIER_COUNT - 1;
/** Two fruit of the top tier stay as they are: there is nothing bigger to become. */
export const canMergeFruitTier = (tier: number) => Number.isInteger(tier) && tier >= 0 && tier < TOP_TIER;

export const STEP = 1 / 60;
export const SUBSTEPS = 8;
export const GRAVITY = 1700;
const MAX_SPEED = 1500;
const RESTITUTION = 0.18;
const BOUNCE_SPEED = 140;
const FRICTION = 0.32;
const ROLL_DRAG = 1.6;
const AIR_DRAG = 0.06;
const GROW_TIME = 0.14;
const TOUCH_SLOP = 0.75;

export const BOUNDS = { left: 12, right: 348, floor: 536, lineY: 124, spawnY: 88 } as const;
export const DROP_COOLDOWN = 0.48;
export const CHAIN_WINDOW = 1.15;
/** Seconds a settled fruit may stay above the line before the run ends. */
export const DANGER_LIMIT = 3;
/** A fruit does not count against the line until it has been in play this long. */
export const DANGER_GRACE_AGE = 1;
/** The biggest tier a drop can be. */
export const MAX_DROP_TIER = 4;

/** Points for creating a fruit of `tier`: 2, 6, 12, 20 ... 110, so big merges matter far more than small ones. */
export const mergePoints = (tier: number) => tier * (tier + 1);
/** Chain multiplier: x1, x1.5, x2 ... capped at x4. */
export const chainMultiplier = (chain: number) => Math.min(4, 1 + Math.max(0, chain - 1) * 0.5);

export type Body = {
  id: number; tier: number;
  x: number; y: number; px: number; py: number;
  vx: number; vy: number; pvx: number; pvy: number;
  angle: number; spin: number;
  /** Current collision radius; a freshly merged fruit grows into its full size. */
  r: number; fromR: number; grow: number;
  age: number; touched: boolean; pop: number; dead: boolean;
};

export type SimEvent =
  | { type: 'merge'; x: number; y: number; tier: number; points: number; chain: number; newBiggest: boolean }
  | { type: 'land'; x: number; y: number; tier: number; speed: number }
  | { type: 'over' };

export type World = {
  bodies: Body[]; events: SimEvent[];
  time: number; nextId: number;
  score: number; chain: number; chainTimer: number; bestChain: number;
  /** Seconds of continuous overflow; the run ends at DANGER_LIMIT. */
  danger: number; overflowing: boolean; over: boolean;
  /** Biggest tier made this run (-1 before the first drop). */
  biggest: number; merges: number; drops: number;
  current: number; next: number; cooldown: number;
};

const DROP_WEIGHTS = [6, 5, 4, 3, 2];
/** Early drops stay small so a new player meets the chain one tier at a time. */
export function pickTier(random: () => number, drops: number): number {
  const max = Math.min(MAX_DROP_TIER, 1 + Math.floor(drops / 3));
  let total = 0;
  for (let i = 0; i <= max; i++) total += DROP_WEIGHTS[i];
  let roll = random() * total;
  for (let i = 0; i <= max; i++) { roll -= DROP_WEIGHTS[i]; if (roll < 0) return i; }
  return max;
}

export function createWorld(random: () => number): World {
  const current = pickTier(random, 0), next = pickTier(random, 1);
  return { bodies: [], events: [], time: 0, nextId: 1, score: 0, chain: 0, chainTimer: 0, bestChain: 0, danger: 0, overflowing: false, over: false, biggest: -1, merges: 0, drops: 0, current, next, cooldown: 0 };
}

export const clampAim = (x: number, tier: number) => Math.max(BOUNDS.left + RADII[tier], Math.min(BOUNDS.right - RADII[tier], x));

export function addBody(world: World, tier: number, x: number, y: number, settled = false): Body {
  const r = RADII[tier];
  const body: Body = { id: world.nextId++, tier, x, y, px: x, py: y, vx: 0, vy: 0, pvx: 0, pvy: 0, angle: 0, spin: 0, r, fromR: r, grow: 1, age: settled ? DANGER_GRACE_AGE : 0, touched: settled, pop: 0, dead: false };
  world.bodies.push(body);
  world.biggest = Math.max(world.biggest, tier);
  return body;
}

/** Releases the held fruit at `x`. Returns false while the dropper is cooling down or the run is over. */
export function dropFruit(world: World, x: number, random: () => number): boolean {
  if (world.over || world.cooldown > 0) return false;
  const tier = world.current;
  const body = addBody(world, tier, clampAim(x, tier), BOUNDS.spawnY);
  // A hair of spin and sideways drift, fixed by the drop count, stops perfectly vertical towers from balancing.
  body.spin = (world.drops % 2 ? 1 : -1) * 0.6;
  world.drops++;
  // A chain belongs to one drop: the cascade it sets off, not a run of quick separate merges.
  world.chain = 0; world.chainTimer = 0;
  world.current = world.next;
  world.next = pickTier(random, world.drops);
  world.cooldown = DROP_COOLDOWN;
  return true;
}

/** Where a fruit of radius `r` released at `x` would first come to rest against the pile or the floor. */
export function landingY(world: World, x: number, r: number): number {
  let y = BOUNDS.floor - r;
  for (const b of world.bodies) {
    if (!b.touched) continue; // still falling: it will not be there when this one arrives
    const dx = Math.abs(x - b.x), reach = r + b.r;
    if (dx < reach) y = Math.min(y, b.y - Math.sqrt(reach * reach - dx * dx));
  }
  return Math.max(y, BOUNDS.spawnY);
}

type Contact = { a: Body; b: Body | null; nx: number; ny: number; lambda: number };

function substep(world: World, h: number, contacts: Contact[]) {
  const bodies = world.bodies, count = bodies.length;
  contacts.length = 0;
  for (let i = 0; i < count; i++) {
    const b = bodies[i];
    if (b.grow < 1) {
      b.grow = Math.min(1, b.grow + h / GROW_TIME);
      const t = 1 - (1 - b.grow) * (1 - b.grow);
      b.r = b.fromR + (RADII[b.tier] - b.fromR) * t;
    }
    b.vy += GRAVITY * h;
    const drag = 1 - AIR_DRAG * h;
    b.vx *= drag; b.vy *= drag;
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > MAX_SPEED) { b.vx *= MAX_SPEED / speed; b.vy *= MAX_SPEED / speed; }
    b.pvx = b.vx; b.pvy = b.vy; b.px = b.x; b.py = b.y;
    b.x += b.vx * h; b.y += b.vy * h; b.angle += b.spin * h;
  }
  for (let i = 0; i < count; i++) {
    const a = bodies[i];
    for (let j = i + 1; j < count; j++) {
      const b = bodies[j], dx = a.x - b.x, dy = a.y - b.y, reach = a.r + b.r;
      if (dx > reach || dx < -reach || dy > reach || dy < -reach) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 >= reach * reach) continue;
      const d = Math.sqrt(d2), nx = d > 1e-6 ? dx / d : 0, ny = d > 1e-6 ? dy / d : -1;
      const wa = 1 / (a.r * a.r), wb = 1 / (b.r * b.r), lambda = (reach - d) / (wa + wb);
      a.x += nx * lambda * wa; a.y += ny * lambda * wa;
      b.x -= nx * lambda * wb; b.y -= ny * lambda * wb;
      contacts.push({ a, b, nx, ny, lambda });
    }
  }
  // Walls go last so nothing ever ends a substep outside the jar.
  for (let i = 0; i < count; i++) {
    const b = bodies[i], mass = b.r * b.r;
    if (b.x - b.r < BOUNDS.left) { contacts.push({ a: b, b: null, nx: 1, ny: 0, lambda: (BOUNDS.left + b.r - b.x) * mass }); b.x = BOUNDS.left + b.r; }
    if (b.x + b.r > BOUNDS.right) { contacts.push({ a: b, b: null, nx: -1, ny: 0, lambda: (b.x + b.r - BOUNDS.right) * mass }); b.x = BOUNDS.right - b.r; }
    if (b.y + b.r > BOUNDS.floor) { contacts.push({ a: b, b: null, nx: 0, ny: -1, lambda: (b.y + b.r - BOUNDS.floor) * mass }); b.y = BOUNDS.floor - b.r; }
  }
  for (let i = 0; i < count; i++) { const b = bodies[i]; b.vx = (b.x - b.px) / h; b.vy = (b.y - b.py) / h; }
  for (let i = 0; i < contacts.length; i++) {
    const { a, b, nx, ny, lambda } = contacts[i];
    const wa = 1 / (a.r * a.r), wb = b ? 1 / (b.r * b.r) : 0, wSum = wa + wb;
    const approach = (a.pvx - (b ? b.pvx : 0)) * nx + (a.pvy - (b ? b.pvy : 0)) * ny;
    if (!a.touched || (b && !b.touched)) {
      const fresh = !a.touched ? a : b!;
      world.events.push({ type: 'land', x: fresh.x, y: fresh.y, tier: fresh.tier, speed: Math.max(0, -approach) });
      a.touched = true; if (b) b.touched = true;
    }
    // Normal: keep only a soft bounce from a real impact, never the speed the position fix invented.
    const vn = (a.vx - (b ? b.vx : 0)) * nx + (a.vy - (b ? b.vy : 0)) * ny;
    const target = approach < -BOUNCE_SPEED ? -RESTITUTION * approach : 0;
    const jn = (target - vn) / wSum;
    a.vx += nx * jn * wa; a.vy += ny * jn * wa;
    if (b) { b.vx -= nx * jn * wb; b.vy -= ny * jn * wb; }
    // Tangent: friction limited by the contact's normal impulse, shared between sliding and spin.
    const tx = -ny, ty = nx;
    const vt = (a.vx * tx + a.vy * ty - a.spin * a.r) - (b ? b.vx * tx + b.vy * ty + b.spin * b.r : 0);
    const limit = FRICTION * lambda / h;
    const jt = Math.max(-limit, Math.min(limit, -vt / (3 * wSum)));
    a.vx += tx * jt * wa; a.vy += ty * jt * wa; a.spin -= 2 * jt * wa / a.r;
    if (b) { b.vx -= tx * jt * wb; b.vy -= ty * jt * wb; b.spin -= 2 * jt * wb / b.r; }
    const roll = 1 - ROLL_DRAG * h;
    a.spin *= roll; if (b) b.spin *= roll;
  }
}

function resolveMerges(world: World) {
  const bodies = world.bodies, count = bodies.length;
  let merged = false;
  for (let i = 0; i < count; i++) {
    const a = bodies[i];
    if (a.dead || !canMergeFruitTier(a.tier)) continue;
    for (let j = i + 1; j < count; j++) {
      const b = bodies[j];
      if (b.dead || b.tier !== a.tier) continue;
      const reach = a.r + b.r + TOUCH_SLOP, dx = a.x - b.x, dy = a.y - b.y;
      if (dx * dx + dy * dy > reach * reach) continue;
      a.dead = b.dead = true; merged = true;
      const tier = a.tier + 1, newBiggest = tier > world.biggest;
      const born = addBody(world, tier, (a.x + b.x) / 2, (a.y + b.y) / 2);
      born.vx = (a.vx + b.vx) / 2; born.vy = (a.vy + b.vy) / 2; born.spin = (a.spin + b.spin) / 2; born.angle = a.angle;
      born.fromR = born.r = Math.max(a.r, b.r); born.grow = 0; born.pop = 0.32;
      born.age = Math.max(a.age, b.age); born.touched = true;
      world.chain = world.chainTimer > 0 ? world.chain + 1 : 1;
      world.chainTimer = CHAIN_WINDOW;
      world.bestChain = Math.max(world.bestChain, world.chain);
      const points = Math.round(mergePoints(tier) * chainMultiplier(world.chain));
      world.score += points; world.merges++;
      world.events.push({ type: 'merge', x: born.x, y: born.y, tier, points, chain: world.chain, newBiggest });
      break;
    }
  }
  if (merged) world.bodies = world.bodies.filter(b => !b.dead);
}

/** True while a settled fruit pokes above the danger line. */
export const isOverLine = (b: Body) => b.touched && b.age >= DANGER_GRACE_AGE && b.y - b.r < BOUNDS.lineY;

const scratch: Contact[] = [];
/** Advances the world by one fixed step. Events since the last call are appended to `world.events`. */
export function step(world: World, dt = STEP) {
  if (world.over) return;
  const h = dt / SUBSTEPS;
  for (let s = 0; s < SUBSTEPS; s++) substep(world, h, scratch);
  scratch.length = 0;
  world.time += dt;
  for (const b of world.bodies) { b.age += dt; if (b.pop > 0) b.pop = Math.max(0, b.pop - dt); }
  resolveMerges(world);
  if (world.chainTimer > 0) { world.chainTimer -= dt; if (world.chainTimer <= 0) { world.chainTimer = 0; world.chain = 0; } }
  if (world.cooldown > 0) world.cooldown = Math.max(0, world.cooldown - dt);
  world.overflowing = world.bodies.some(isOverLine);
  // The timer drains twice as fast as it fills, so a near miss is forgiven but camping on the line is not.
  world.danger = world.overflowing ? world.danger + dt : Math.max(0, world.danger - dt * 2);
  if (world.danger >= DANGER_LIMIT) { world.over = true; world.events.push({ type: 'over' }); }
}

/** Largest overlap between any two fruit or a fruit and the jar; used by tests to prove nothing sinks. */
export function maxOverlap(world: World): number {
  let worst = 0;
  const bodies = world.bodies;
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    worst = Math.max(worst, BOUNDS.left + a.r - a.x, a.x + a.r - BOUNDS.right, a.y + a.r - BOUNDS.floor);
    for (let j = i + 1; j < bodies.length; j++) { const b = bodies[j]; worst = Math.max(worst, a.r + b.r - Math.hypot(a.x - b.x, a.y - b.y)); }
  }
  return worst;
}
