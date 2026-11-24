import { CASTES } from './data/castes';
import { COLS, ROWS, type Ant, type CasteId, type Food, type Sim, type SimEvent, type Terrain } from './types';

/**
 * Low-level state helpers shared by the sim (`sim.ts`) and the hazard handlers (`hazards.ts`). Pure functions on a
 * `Sim`; no DOM, no Math.random (only `sim.random`).
 */
export const STEP = 1 / 30;
export const SUGAR_PER_CRUMB = 3;
export const BITE_TIME = 0.45;
export const LOST_TIME = 3;
export const BRIDGE_NEED = 3;
export const SCATTER_TIME = 2;
export const RALLY_TIME = 5;
export const ITEM_SPEED = 0.55;

export const idx = (x: number, y: number) => y * COLS + x;
export const cx = (cell: number) => cell % COLS;
export const cy = (cell: number) => Math.floor(cell / COLS);
export const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
export const cellAt = (x: number, y: number) => { const gx = Math.round(x), gy = Math.round(y); return inside(gx, gy) ? idx(gx, gy) : -1; };
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
export const NEIGHBOURS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export function neighbours(cell: number): number[] {
  const x = cx(cell), y = cy(cell), out: number[] = [];
  for (const [dx, dy] of NEIGHBOURS) if (inside(x + dx, y + dy)) out.push(idx(x + dx, y + dy));
  return out;
}

export const TERRAIN_CHARS: Record<string, Terrain> = { '.': 'grass', b: 'blanket', s: 'sand', '~': 'water', '#': 'wall', c: 'chalk', t: 'tape', o: 'pit', u: 'tunnel', l: 'lily' };
export const terrainOf = (ch: string): Terrain => TERRAIN_CHARS[ch] ?? 'grass';

export function emit(sim: Sim, event: SimEvent): void { sim.events.push(event); }

export const isTrail = (sim: Sim, cell: number) => cell >= 0 && sim.trailParent[cell] !== -1;
/** A trail cell ants can stand on right now (a lifted bridge is still trail but blocked). */
export const passable = (sim: Sim, cell: number) => sim.terrain[cell] !== 'water' || sim.bridged[cell] === 1;

export function depthOf(sim: Sim, cell: number): number {
  let d = 0, c = cell;
  while (c >= 0 && sim.trailParent[c] >= 0 && d < 200) { c = sim.trailParent[c]; d++; }
  return d;
}

/** Cover hides ants from the Alarm, the Shoe and the sparrow. */
export function covered(sim: Sim, cell: number, shade?: Uint8Array): boolean {
  if (cell < 0) return false;
  const t = sim.terrain[cell];
  return t === 'grass' || t === 'tunnel' || (!!shade && shade[cell] === 1);
}

// ------------------------------------------------------------------ routing
let cacheVersion = -1;
let cacheSim: Sim | null = null;
const pathCache = new Map<number, Int16Array>();
/** Next cell from `from` toward `target` along the trail tree; -1 when already there or unreachable. */
export function nextHop(sim: Sim, from: number, target: number): number {
  if (from === target) return -1;
  if (cacheSim !== sim || cacheVersion !== sim.trailVersion) { pathCache.clear(); cacheSim = sim; cacheVersion = sim.trailVersion; }
  let child = pathCache.get(target);
  if (!child) {
    child = new Int16Array(COLS * ROWS).fill(-1);
    let c = target, guard = 0;
    while (c >= 0 && guard++ < 300) { const p = sim.trailParent[c]; if (p < 0) break; child[p] = c; c = p; }
    pathCache.set(target, child);
  }
  const down = child[from];
  if (down >= 0) return down;
  const up = sim.trailParent[from];
  return up >= 0 ? up : -1;
}

/** Whether `cell` is reachable from the nest along the trail (always true for trail cells: it is a tree). */
export const connected = (sim: Sim, cell: number) => isTrail(sim, cell);

// ------------------------------------------------------------------ trail edits
/** Remove `cell` and every trail cell hanging off it. Returns the removed cells. Never removes the nest. */
export function cutSubtree(sim: Sim, cell: number): number[] {
  if (!isTrail(sim, cell) || cell === sim.nest) return [];
  const removed: number[] = [];
  const doomed = new Uint8Array(COLS * ROWS);
  doomed[cell] = 1;
  // Walk every trail cell up to the root; anything that passes through a doomed cell is doomed too.
  for (let c = 0; c < COLS * ROWS; c++) {
    if (!isTrail(sim, c) || doomed[c]) continue;
    const chain: number[] = [];
    let p = c, hit = false, guard = 0;
    while (p >= 0 && guard++ < 300) {
      if (doomed[p]) { hit = true; break; }
      chain.push(p);
      p = sim.trailParent[p];
    }
    if (hit) for (const q of chain) doomed[q] = 1;
  }
  for (let c = 0; c < COLS * ROWS; c++) if (doomed[c]) { sim.trailParent[c] = -1; removed.push(c); }
  sim.trailCount -= removed.length;
  sim.scent += removed.length;
  trailChanged(sim);
  return removed;
}

export function trailChanged(sim: Sim): void {
  sim.trailVersion++;
  let lost = 0;
  for (const ant of sim.ants) {
    if (!ant.alive) continue;
    if (ant.state === 'out' || ant.state === 'home') {
      if (!isTrail(sim, ant.at) || !isTrail(sim, ant.to)) { becomeLost(sim, ant); lost++; }
    } else if (ant.state === 'post' && CASTES[ant.caste].kind === 'post' && ant.caste !== 'scout' && ant.caste !== 'bridger') {
      if (!isTrail(sim, ant.at)) { becomeLost(sim, ant); lost++; }
    }
  }
  for (const food of sim.foods) {
    if (food.lift && food.moving && !isTrail(sim, food.at)) { food.moving = false; emit(sim, { type: 'drop', food: food.index }); }
  }
  // Jobs whose food fell off the trail: ants not yet carrying look for other work.
  for (const ant of sim.ants) {
    if (!ant.alive || ant.state !== 'out' || ant.job < 0) continue;
    const food = sim.foods[ant.job];
    if (!foodReachable(sim, food)) { releaseJob(sim, ant); ant.goal = -1; }
  }
  if (lost) emit(sim, { type: 'lost', n: lost });
}

export function becomeLost(_sim: Sim, ant: Ant): void {
  if (ant.state === 'lift') return;
  ant.state = 'lost';
  ant.lostT = LOST_TIME;
  ant.work = 0;
}

// ------------------------------------------------------------------ food & jobs
export const foodCell = (food: Food) => (food.lift ? food.at : idx(food.x, food.y));
export function foodReachable(sim: Sim, food: Food): boolean {
  if (food.home || !food.visible || food.floating) return false;
  return isTrail(sim, foodCell(food));
}
export function foodNeed(food: Food): number {
  if (food.home || food.priority === 0) return 0;
  if (food.lift) return Math.max(0, food.lift * 2 - food.claims);
  return Math.max(0, food.left - food.claims);
}

export function releaseJob(sim: Sim, ant: Ant): void {
  if (ant.job < 0) return;
  const food = sim.foods[ant.job];
  if (food) {
    const caste = CASTES[ant.caste];
    food.claims = Math.max(0, food.claims - (food.lift ? caste.power : (ant.load > 0 ? 0 : caste.bite)));
    if (ant.state === 'lift') food.power = Math.max(0, food.power - caste.power);
  }
  ant.job = -1;
}

/** Pick work for a carrier ant. Weighted round robin: the food with the fewest claims per priority weight wins. */
export function assignJob(sim: Sim, ant: Ant): boolean {
  const caste = CASTES[ant.caste];
  if (caste.kind !== 'stream') return false;
  const flyer = ant.caste === 'flyer';
  let best: Food | null = null, bestScore = Infinity;
  const wantsBig = caste.power >= 3 && sim.foods.some(f => f.lift && !f.home && foodNeed(f) > 0 && foodReachable(sim, f));
  for (const food of sim.foods) {
    if (!food.visible || food.home || foodNeed(food) <= 0) continue;
    if (flyer) { if (food.lift) continue; }
    else if (!foodReachable(sim, food)) continue;
    if (wantsBig && !food.lift) continue;
    const weight = food.priority === 2 ? 3 : 1;
    const share = food.lift ? food.claims / Math.max(1, food.lift) * 4 : food.claims;
    const score = (share + 1) / weight + (flyer ? dist(cx(ant.at), cy(ant.at), food.x, food.y) * 0.01 : depthOf(sim, foodCell(food)) * 0.001);
    if (score < bestScore) { bestScore = score; best = food; }
  }
  if (!best) return false;
  ant.job = best.index;
  best.claims += best.lift ? caste.power : caste.bite;
  ant.goal = flyer ? idx(best.x, best.y) : foodCell(best);
  ant.state = flyer ? 'fly' : 'out';
  return true;
}

export function deliver(sim: Sim, n: number, x: number, y: number, big = false): void {
  if (n <= 0) return;
  sim.crumbs += n;
  sim.stats.crumbs += n;
  sim.sugar += n * SUGAR_PER_CRUMB;
  if (sim.endless) sim.sundown += n * sim.endless.extend;
  emit(sim, { type: 'deliver', n, total: sim.crumbs, x, y, big });
}

// ------------------------------------------------------------------ ants
export function killAnt(sim: Sim, ant: Ant, cause: string): void {
  if (!ant.alive) return;
  // A crumb in the jaws is dropped back on the pile it came from.
  if (ant.job >= 0 && ant.load > 0) { const food = sim.foods[ant.job]; if (food && !food.lift) food.left += ant.load; }
  releaseJob(sim, ant);
  if (ant.caste === 'bridger' && ant.post >= 0 && ant.state === 'post') {
    sim.bridge[ant.post] = Math.max(0, sim.bridge[ant.post] - 1);
    if (sim.bridge[ant.post] < BRIDGE_NEED && sim.bridged[ant.post]) { sim.bridged[ant.post] = 0; emit(sim, { type: 'bridge', cell: ant.post, up: false }); dropOffBridge(sim, ant.post); }
  }
  if (ant.caste === 'honeypot') {
    const store = sim.stores.find(s => s.ant === ant.id);
    if (store) { store.ant = -1; }
  }
  ant.alive = false;
  sim.stats.lost++;
  emit(sim, { type: 'death', caste: ant.caste, x: ant.x, y: ant.y, cause });
}

/** A bridge went down: ants on it fall in. */
export function dropOffBridge(sim: Sim, cell: number): void {
  for (const ant of sim.ants) {
    if (!ant.alive || ant.caste === 'bridger') continue;
    if (cellAt(ant.x, ant.y) === cell && ant.state !== 'fly' && ant.state !== 'idle') killAnt(sim, ant, 'water');
  }
}

/** Ants in a cell set that a strike can reach (not scattered, not in a tunnel, not inside the nest, not flying). */
export function antsIn(sim: Sim, cells: Set<number>, opts: { flyers?: boolean; cover?: boolean } = {}): Ant[] {
  const out: Ant[] = [];
  for (const ant of sim.ants) {
    if (!ant.alive || ant.state === 'idle') continue;
    if (ant.state === 'fly' && !opts.flyers) continue;
    if (sim.queen.scatter.active > 0 && ant.state !== 'fly') continue;
    const cell = cellAt(ant.x, ant.y);
    if (!cells.has(cell)) continue;
    if (cell === sim.nest) continue;
    if (sim.terrain[cell] === 'tunnel') continue;
    if (opts.cover && covered(sim, cell, shade(sim)) && ant.state !== 'lost') continue;
    out.push(ant);
  }
  return out;
}

let shadeVersion = -1;
let shadeSim: Sim | null = null;
let shadeMap = new Uint8Array(COLS * ROWS);
/** Cells within one of a Leafcutter (recomputed once per step). */
export function shade(sim: Sim): Uint8Array {
  const stamp = Math.round(sim.time / STEP);
  if (shadeSim === sim && shadeVersion === stamp) return shadeMap;
  shadeSim = sim; shadeVersion = stamp;
  shadeMap = new Uint8Array(COLS * ROWS);
  for (const ant of sim.ants) {
    if (!ant.alive || ant.caste !== 'leafcutter' || ant.state === 'idle') continue;
    const x0 = Math.round(ant.x), y0 = Math.round(ant.y);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inside(x0 + dx, y0 + dy)) shadeMap[idx(x0 + dx, y0 + dy)] = 1;
  }
  return shadeMap;
}

export function liveAnts(sim: Sim, caste?: CasteId): number {
  let n = 0;
  for (const ant of sim.ants) if (ant.alive && (!caste || ant.caste === caste)) n++;
  return n;
}

/** The densest block of exposed ants (w x h cells) for predators that pick a crowd. */
export function densest(sim: Sim, w: number, h: number, exposedOnly: boolean, flyers = false): { cells: number[]; x: number; y: number; n: number } {
  const count = new Float32Array(COLS * ROWS);
  const sh = shade(sim);
  for (const ant of sim.ants) {
    if (!ant.alive || ant.state === 'idle') continue;
    if (ant.state === 'fly' && !flyers) continue;
    const cell = cellAt(ant.x, ant.y);
    if (cell < 0 || cell === sim.nest || sim.terrain[cell] === 'tunnel') continue;
    if (exposedOnly && ant.state !== 'lost' && ant.state !== 'fly' && covered(sim, cell, sh)) continue;
    count[cell] += 1 + CASTES[ant.caste].size * 0.1;
  }
  let best = -1, bx = 0, by = 0;
  for (let y = 0; y <= ROWS - h; y++) for (let x = 0; x <= COLS - w; x++) {
    let n = 0;
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) n += count[idx(x + dx, y + dy)];
    // Deterministic tie-break that prefers blocks away from the nest.
    const score = n + x * 0.001;
    if (score > best) { best = score; bx = x; by = y; }
  }
  const cells: number[] = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) { const c = idx(bx + dx, by + dy); if (c !== sim.nest) cells.push(c); }
  return { cells, x: bx + (w - 1) / 2, y: by + (h - 1) / 2, n: Math.floor(best) };
}
