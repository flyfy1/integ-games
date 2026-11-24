import { CASTES } from './data/castes';
import {
  assignJob, becomeLost, BITE_TIME, BRIDGE_NEED, cellAt, cutSubtree, cx, cy, deliver, depthOf, dist, emit, foodCell, foodReachable, idx, inside, isTrail,
  liveAnts, neighbours, nextHop, passable, RALLY_TIME, releaseJob, SCATTER_TIME, STEP, terrainOf, ITEM_SPEED, densest, antsIn, killAnt, trailChanged
} from './core';
import { blockedCells, exposedCount, HANDLERS, lampPull, stepRivals, stepStores } from './hazards';
import { stepEndless } from './data/endless';
import {
  CELLS, COLS, ROWS, type Ant, type Card, type CasteId, type DenyReason, type Food, type Hazard, type LevelDef, type MetaState, type QueenCall, type Sim, type SimEvent, type SimOptions
} from './types';

/**
 * Crumb Raiders rules. Headless and deterministic: no DOM, no timers, no Math.random. Drive it with the commands
 * (`paint`, `erase`, `playCard`, `cyclePriority`, `queenCall`, `toggleBridge`) and `step`; read state directly and
 * drain `sim.events` to react. The same code runs in the browser, in unit tests, under the greedy bot and the stored
 * reference scripts.
 */
export { STEP } from './core';
export type ActionResult = { ok: true } | { ok: false; reason: DenyReason };
const OK: ActionResult = { ok: true };
const deny = (reason: DenyReason): ActionResult => ({ ok: false, reason });

export const QUEEN_COOLDOWN: Record<QueenCall, number> = { scatter: 20, rally: 26, recall: 16 };
export const BASE_HATCH = 0.32;
export const DEFAULT_CAP = 200;

/** Small seeded generator for tests, the bot and daily seeds. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const EMPTY_META: MetaState = { scent: 0, hatch: 0, sugar: 0, queen: 0, slot: 0 };

export function handFor(level: LevelDef, loadout: CasteId[] | undefined): CasteId[] {
  if (level.cards) return [...level.cards];
  const hand = [...(loadout ?? ['worker'])];
  for (const caste of level.required ?? []) if (!hand.includes(caste)) hand.push(caste);
  if (!hand.includes('worker') && !level.fixedAnts) hand.unshift('worker');
  return hand;
}

export function createSim(level: LevelDef, options: SimOptions): Sim {
  const meta: MetaState = { ...EMPTY_META, ...(options.meta ?? {}) };
  const terrain = Array.from({ length: CELLS }, (_, c) => terrainOf(level.grid[Math.floor(c / COLS)]?.[c % COLS] ?? '.'));
  const nest = idx(level.nest[0], level.nest[1]);
  terrain[nest] = 'grass';
  const tapeNeed = new Int16Array(CELLS);
  for (let c = 0; c < CELLS; c++) if (terrain[c] === 'tape') tapeNeed[c] = 4;
  const trailParent = new Int16Array(CELLS).fill(-1);
  trailParent[nest] = -2;
  const hand = handFor(level, options.loadout);
  const sim: Sim = {
    level, random: options.random, terrain,
    seen: new Uint8Array(CELLS).fill(level.night ? 0 : 1),
    bridge: new Int8Array(CELLS), bridged: new Uint8Array(CELLS), tapeNeed, tapeAcid: new Float32Array(CELLS), dug: new Float32Array(CELLS),
    trailParent, trailCount: 0, trailVersion: 0, traffic: new Float32Array(CELLS), nest,
    scent: level.scent + meta.scent * 3, scentMax: level.scent + meta.scent * 3,
    sugar: level.startSugar + meta.sugar * 15, crumbs: 0,
    ants: [], nextAntId: 1, foods: [], hazards: [], rivals: [], rivalCrumbs: 0, rivalRoutes: [],
    nestHp: level.goal.kind === 'defend' ? level.goal.hp : level.goal.kind === 'race' ? level.goal.hp ?? 0 : 0,
    cards: hand.map((caste): Card => ({ caste, cooldown: 0, stock: 0 })),
    queue: [], hatchT: 0, hatchTime: BASE_HATCH * (1 - 0.15 * meta.hatch),
    alarm: 0, shoe: { left: 0, t: 0, cells: [], warn: 0, x: 0, y: 0, first: true },
    queen: {
      scatter: { cd: 0, max: QUEEN_COOLDOWN.scatter * (1 - 0.12 * meta.queen), active: 0 },
      rally: { cd: 0, max: QUEEN_COOLDOWN.rally * (1 - 0.12 * meta.queen), active: 0 },
      recall: { cd: 0, max: QUEEN_COOLDOWN.recall * (1 - 0.12 * meta.queen), active: 0 }
    },
    time: 0, sundown: level.sundown, status: 'playing', events: [],
    stats: { hatched: 0, lost: 0, scatters: 0, maxAlarmHits: 0, scentPeak: 0, crumbs: 0, casteUsed: [], cutWin: false, bites: 0 },
    cap: options.cap ?? DEFAULT_CAP, mercy: Math.max(0, Math.min(2, options.mercy ?? 0)), speedMul: 1, modifiers: [],
    endless: level.endless ? { next: 90, wave: 0, extend: 0.55, respawn: 0 } : null,
    stores: [], meta
  };
  level.foods.forEach((def, index) => addFood(sim, def, index));
  for (const def of level.hazards) addHazard(sim, def);
  for (const [caste, n] of Object.entries(level.fixedAnts ?? {}) as [CasteId, number][]) {
    if (CASTES[caste].kind === 'post') { const card = cardFor(sim, caste); if (card) card.stock = n; continue; }
    for (let i = 0; i < n; i++) spawnAnt(sim, caste, -1, true);
  }
  for (const [caste, n] of Object.entries(level.stock ?? {}) as [CasteId, number][]) { const card = cardFor(sim, caste); if (card) card.stock += n; }
  if (level.night) refreshSeen(sim);
  return sim;
}

export function addFood(sim: Sim, def: LevelDef['foods'][number], index = sim.foods.length): Food {
  const cell = idx(def.x, def.y);
  const food: Food = {
    ...def, index, left: def.crumbs, claims: 0, priority: 1, px: def.x, py: def.y, at: cell, to: cell, moving: false, home: false, power: 0,
    visible: !def.hidden && !def.appear, meltT: 0, stun: 0, floating: sim.terrain[cell] === 'lily'
  };
  sim.foods[index] = food;
  return food;
}

let hazardId = 1;
export function addHazard(sim: Sim, def: LevelDef['hazards'][number]): Hazard {
  const h: Hazard = { ...def, id: hazardId++, active: !def.at, t: 0, phase: 0, cd: 0, angle: 0, hp: 0, cells: [], warn: 0, px: def.x, py: def.y, dir: 1, count: 0, speed: 0 };
  sim.hazards.push(h);
  if (h.active) HANDLERS[h.kind].init?.(sim, h);
  return h;
}

export function drainEvents(sim: Sim): SimEvent[] { const events = sim.events; sim.events = []; return events; }

// ------------------------------------------------------------------ queries
export const cardFor = (sim: Sim, caste: CasteId) => sim.cards.find(card => card.caste === caste);
export const goalTarget = (sim: Sim): number => {
  const goal = sim.level.goal;
  if (goal.kind === 'item') return goal.n ?? 1;
  return goal.n;
};
/** 0..1 progress toward the level goal. */
export function goalProgress(sim: Sim): number {
  const goal = sim.level.goal;
  if (goal.kind === 'item') { const food = sim.foods.find(f => f.id === goal.food); if (!food) return 0; if (food.home) return 1; return Math.min(0.95, 1 - depthOf(sim, food.at) / Math.max(1, depthOf(sim, idx(food.x, food.y)) || 1)); }
  return Math.min(1, sim.crumbs / Math.max(1, goal.n));
}
const PAINTABLE = new Set(['grass', 'blanket', 'sand', 'tunnel', 'tape']);
export function paintCheck(sim: Sim, cell: number, from = -1): { ok: true; parent: number } | { ok: false; reason: DenyReason } {
  if (sim.status !== 'playing') return { ok: false, reason: 'ended' };
  if (cell < 0 || cell >= CELLS) return { ok: false, reason: 'terrain' };
  if (isTrail(sim, cell)) return { ok: false, reason: cell === sim.nest ? 'nest' : 'nothing' };
  const t = sim.terrain[cell];
  const ok = PAINTABLE.has(t) || (t === 'water' && sim.bridge[cell] >= BRIDGE_NEED);
  if (!ok || blockedCells(sim).has(cell)) return { ok: false, reason: 'terrain' };
  if (sim.level.night && !sim.seen[cell]) return { ok: false, reason: 'fog' };
  const options = neighbours(cell).filter(n => isTrail(sim, n));
  if (!options.length) return { ok: false, reason: 'adjacent' };
  if (sim.scent <= 0) return { ok: false, reason: 'scent' };
  let parent = options.includes(from) ? from : -1;
  if (parent < 0) { let best = Infinity; for (const n of options) { const d = depthOf(sim, n); if (d < best) { best = d; parent = n; } } }
  return { ok: true, parent };
}

// ------------------------------------------------------------------ commands
export function paint(sim: Sim, cell: number, from = -1): ActionResult {
  const check = paintCheck(sim, cell, from);
  if (!check.ok) return deny(check.reason);
  sim.trailParent[cell] = check.parent;
  sim.trailCount++;
  sim.scent--;
  sim.stats.scentPeak = Math.max(sim.stats.scentPeak, sim.trailCount);
  sim.trailVersion++;
  emit(sim, { type: 'paint', cell });
  for (const food of sim.foods) if (!food.home && foodCell(food) === cell && food.visible) emit(sim, { type: 'connect', food: food.index });
  return OK;
}

export function erase(sim: Sim, cell: number): ActionResult {
  if (sim.status !== 'playing') return deny('ended');
  if (cell === sim.nest) return deny('nest');
  if (!isTrail(sim, cell)) return deny('nothing');
  const cells = cutSubtree(sim, cell);
  emit(sim, { type: 'erase', cells, refund: cells.length });
  return OK;
}

export function cyclePriority(sim: Sim, food: number): ActionResult {
  const f = sim.foods[food];
  if (!f || f.home) return deny('target');
  f.priority = f.priority === 1 ? 2 : f.priority === 2 ? 0 : 1;
  emit(sim, { type: 'priority', food, priority: f.priority });
  return OK;
}

/** Where a post ant would stand to work on `cell`, or a reason it cannot. */
export function postTarget(sim: Sim, caste: CasteId, cell: number): { stand: number } | { reason: DenyReason } {
  if (cell < 0 || cell >= CELLS) return { reason: 'target' };
  if (sim.level.night && !sim.seen[cell] && caste !== 'scout') return { reason: 'fog' };
  const t = sim.terrain[cell];
  const bestNeighbour = () => {
    let best = -1, bd = Infinity;
    for (const n of neighbours(cell)) if (isTrail(sim, n) && passable(sim, n)) { const d = depthOf(sim, n); if (d < bd) { bd = d; best = n; } }
    return best;
  };
  switch (caste) {
    case 'soldier': case 'spitter': case 'honeypot':
      if (!isTrail(sim, cell) || cell === sim.nest || !passable(sim, cell)) return { reason: 'target' };
      if (caste === 'honeypot' && sim.stores.some(s => s.cell === cell && s.ant >= 0)) return { reason: 'target' };
      return { stand: cell };
    case 'digger': {
      if (t !== 'chalk' && t !== 'sand') return { reason: 'target' };
      const stand = bestNeighbour();
      return stand >= 0 ? { stand } : { reason: 'adjacent' };
    }
    case 'bridger': {
      if (t !== 'water' || sim.bridge[cell] >= BRIDGE_NEED) return { reason: 'target' };
      const stand = bestNeighbour();
      return stand >= 0 ? { stand } : { reason: 'adjacent' };
    }
    case 'scout': return { stand: cell };
    default: return { reason: 'target' };
  }
}

export function canPlay(sim: Sim, caste: CasteId, cell = -1): ActionResult {
  if (sim.status !== 'playing') return deny('ended');
  const card = cardFor(sim, caste);
  if (!card) return deny('target');
  if (sim.level.fixedAnts && card.stock <= 0) return deny('nohatch');
  if (card.cooldown > 0) return deny('cooldown');
  const def = CASTES[caste];
  if (card.stock <= 0 && sim.sugar < def.cost) return deny('sugar');
  if (liveAnts(sim) + sim.queue.length + def.brood > sim.cap) return deny('cap');
  if (def.kind === 'post') { const target = postTarget(sim, caste, cell); if ('reason' in target) return deny(target.reason); }
  return OK;
}

export function playCard(sim: Sim, caste: CasteId, cell = -1): ActionResult {
  const check = canPlay(sim, caste, cell);
  if (!check.ok) return check;
  const card = cardFor(sim, caste)!, def = CASTES[caste];
  if (card.stock > 0) card.stock--; else sim.sugar -= def.cost;
  card.cooldown = def.cooldown;
  for (let i = 0; i < def.brood; i++) sim.queue.push({ caste, post: def.kind === 'post' ? cell : -1 });
  if (!sim.stats.casteUsed.includes(caste)) sim.stats.casteUsed.push(caste);
  emit(sim, { type: 'hatch', caste, n: def.brood });
  return OK;
}

export function queenCall(sim: Sim, call: QueenCall): ActionResult {
  if (sim.status !== 'playing') return deny('ended');
  const q = sim.queen[call];
  if (q.cd > 0) return deny('cooldown');
  q.cd = q.max;
  if (call === 'scatter') { q.active = SCATTER_TIME; sim.stats.scatters++; }
  if (call === 'rally') q.active = RALLY_TIME;
  if (call === 'recall') {
    for (const ant of sim.ants) {
      if (!ant.alive || CASTES[ant.caste].kind !== 'stream') continue;
      if (ant.state === 'lift') { releaseJob(sim, ant); ant.state = 'home'; ant.at = ant.to = nearestTrail(sim, ant.x, ant.y); continue; }
      if (ant.load > 0 && ant.job >= 0) { const f = sim.foods[ant.job]; if (f && !f.lift) f.left += ant.load; ant.load = 0; }
      if (ant.state === 'out' || ant.state === 'fly') { releaseJob(sim, ant); ant.state = ant.state === 'fly' ? 'fly' : 'home'; ant.goal = -1; }
    }
    for (const food of sim.foods) if (food.lift) { food.moving = false; food.power = 0; }
  }
  emit(sim, { type: 'queen', call });
  return OK;
}

/** Lift a living bridge out of the water (Bridgers step onto the bank) or lower it again. */
export function toggleBridge(sim: Sim, cell: number): ActionResult {
  if (sim.status !== 'playing') return deny('ended');
  if (sim.terrain[cell] !== 'water' || sim.bridge[cell] < BRIDGE_NEED) return deny('target');
  sim.bridged[cell] = sim.bridged[cell] ? 0 : 1;
  if (!sim.bridged[cell]) {
    // Anyone on the bridge hops back to the cell they came from.
    for (const ant of sim.ants) {
      if (!ant.alive || ant.caste === 'bridger') continue;
      if (cellAt(ant.x, ant.y) === cell && (ant.state === 'out' || ant.state === 'home')) {
        const back = ant.at === cell ? (sim.trailParent[cell] >= 0 ? sim.trailParent[cell] : sim.nest) : ant.at;
        ant.at = ant.to = back; ant.x = cx(back); ant.y = cy(back);
      }
    }
  }
  emit(sim, { type: 'bridge', cell, up: !!sim.bridged[cell] });
  return OK;
}

// ------------------------------------------------------------------ ants
function spawnAnt(sim: Sim, caste: CasteId, post: number, fixed = false): Ant {
  const x = cx(sim.nest), y = cy(sim.nest);
  const ant: Ant = { id: sim.nextAntId++, caste, x, y, at: sim.nest, to: sim.nest, state: 'idle', job: -1, goal: -1, load: 0, hp: caste === 'soldier' ? 20 : 4, work: 0, lostT: 0, dir: 0, post: -1, slot: 0, heat: 0, slip: 0, alive: true };
  sim.ants.push(ant);
  if (!fixed) sim.stats.hatched++;
  if (CASTES[caste].kind === 'post' && post >= 0) {
    const target = postTarget(sim, caste, post);
    if ('stand' in target) { ant.post = post; ant.goal = target.stand; ant.state = 'out'; }
    else { cardFor(sim, caste) && (cardFor(sim, caste)!.stock++); ant.alive = false; }
  } else if (CASTES[caste].kind === 'stream') {
    ant.work = (sim.random() * 0.4);
  }
  emit(sim, { type: 'spawn', caste, id: ant.id });
  return ant;
}

function nearestTrail(sim: Sim, x: number, y: number): number {
  let best = sim.nest, bd = Infinity;
  for (let c = 0; c < CELLS; c++) {
    if (!isTrail(sim, c) || !passable(sim, c)) continue;
    const d = dist(cx(c), cy(c), x, y);
    if (d < bd - 1e-6) { bd = d; best = c; }
  }
  return best;
}

function moveToward(ant: Ant, tx: number, ty: number, step: number): boolean {
  const d = dist(ant.x, ant.y, tx, ty);
  if (d <= step) { ant.x = tx; ant.y = ty; return true; }
  ant.dir = Math.atan2(ty - ant.y, tx - ant.x);
  ant.x += (tx - ant.x) / d * step; ant.y += (ty - ant.y) / d * step;
  return false;
}

function retire(sim: Sim, ant: Ant): void {
  // Post ants that come home unused return to their card as free stock.
  const card = cardFor(sim, ant.caste);
  if (card && ant.caste !== 'digger' && ant.caste !== 'scout') card.stock++;
  ant.alive = false;
}

/** At a cell: choose what to do next. */
function decide(sim: Sim, ant: Ant): void {
  const def = CASTES[ant.caste];
  if (ant.state === 'home') {
    if (ant.at === sim.nest) {
      if (ant.load > 0) { deliver(sim, ant.load, ant.x, ant.y); ant.load = 0; }
      if (ant.job >= 0) releaseJob(sim, ant);
      if (def.kind === 'post') { retire(sim, ant); return; }
      ant.state = 'idle'; ant.work = 0;
      return;
    }
    if (ant.load > 0) {
      const store = sim.stores.find(s => s.cell === ant.at && s.ant >= 0);
      if (store && ant.job >= 0 && !sim.foods[ant.job].lift) {
        store.crumbs += ant.load; ant.load = 0;
        const food = sim.foods[ant.job];
        if (food.left - food.claims > 0 && foodReachable(sim, food) && food.priority > 0) { food.claims += def.bite; ant.state = 'out'; ant.goal = foodCell(food); }
        else { releaseJob(sim, ant); if (!assignJob(sim, ant)) ant.state = 'home'; }
        if (ant.state === 'out') { const n = nextHopSafe(sim, ant.at, ant.goal); if (n >= 0) ant.to = n; }
        return;
      }
    }
    const p = sim.trailParent[ant.at];
    ant.to = p >= 0 ? p : sim.nest;
    return;
  }
  if (ant.state === 'out') {
    if (ant.goal < 0) { if (!assignJob(sim, ant)) { ant.state = 'home'; decide(sim, ant); } return; }
    if (ant.job >= 0 && sim.foods[ant.job].lift && !sim.foods[ant.job].home) ant.goal = sim.foods[ant.job].at;
    if (ant.at === ant.goal) { arrive(sim, ant); return; }
    const next = nextHopSafe(sim, ant.at, ant.goal);
    if (next < 0) { releaseJob(sim, ant); ant.goal = -1; ant.state = 'home'; decide(sim, ant); return; }
    ant.to = next;
  }
}

function nextHopSafe(sim: Sim, from: number, to: number): number {
  if (!isTrail(sim, to)) return -1;
  return nextHop(sim, from, to);
}

function arrive(sim: Sim, ant: Ant): void {
  const def = CASTES[ant.caste];
  if (def.kind === 'post') {
    ant.state = 'post'; ant.work = 0;
    if (ant.caste === 'bridger') { ant.x = cx(ant.post); ant.y = cy(ant.post); }
    if (ant.caste === 'honeypot') {
      const store = sim.stores.find(s => s.cell === ant.at);
      if (store) store.ant = ant.id; else sim.stores.push({ cell: ant.at, crumbs: 0, t: 0, ant: ant.id });
    }
    if (ant.caste === 'bridger') {
      sim.bridge[ant.post]++;
      if (sim.bridge[ant.post] >= BRIDGE_NEED && !sim.bridged[ant.post]) { sim.bridged[ant.post] = 1; emit(sim, { type: 'bridge', cell: ant.post, up: true }); }
    }
    emit(sim, { type: 'post', caste: ant.caste, cell: ant.post >= 0 ? ant.post : ant.at });
    return;
  }
  const food = ant.job >= 0 ? sim.foods[ant.job] : null;
  if (!food || food.home) { releaseJob(sim, ant); ant.goal = -1; if (!assignJob(sim, ant)) ant.state = 'home'; return; }
  if (food.lift) {
    if (food.at !== ant.at) { ant.goal = food.at; return; }
    ant.state = 'lift';
    food.power += def.power;
    ant.slot = sim.random() * Math.PI * 2;
    return;
  }
  ant.work = 0.0001; // start biting (handled in stepAnt)
}

function stepAnt(sim: Sim, ant: Ant, dt: number): void {
  const def = CASTES[ant.caste];
  const rally = sim.queen.rally.active > 0 ? 1.5 : 1;
  const speed = def.speed * (ant.load > 0 ? 0.85 : 1) * rally * sim.speedMul;
  if (sim.queen.scatter.active > 0 && ant.state !== 'idle' && ant.state !== 'fly') return;
  switch (ant.state) {
    case 'idle': {
      ant.x = cx(sim.nest); ant.y = cy(sim.nest);
      ant.work -= dt;
      if (ant.work > 0) return;
      ant.work = 0.5;
      if (def.kind === 'stream' && assignJob(sim, ant)) {
        ant.at = ant.to = sim.nest;
        if ((ant.state as string) === 'out') decide(sim, ant);
      }
      return;
    }
    case 'out': case 'home': {
      if (ant.caste === 'scout') { stepScout(sim, ant, speed * dt); return; }
      // Biting at a pile.
      if (ant.state === 'out' && ant.at === ant.goal && ant.to === ant.at && ant.work > 0 && ant.job >= 0) {
        ant.work += dt;
        if (ant.work < BITE_TIME) return;
        ant.work = 0;
        const food = sim.foods[ant.job];
        const take = Math.min(def.bite, food.left);
        food.claims = Math.max(0, food.claims - def.bite);
        if (take <= 0) { ant.job = -1; ant.goal = -1; if (!assignJob(sim, ant)) ant.state = 'home'; decide(sim, ant); return; }
        food.left -= take; ant.load = take;
        sim.stats.bites++;
        emit(sim, { type: 'bite', food: food.index, x: food.x, y: food.y });
        if (food.left <= 0) emit(sim, { type: 'empty', food: food.index });
        ant.state = 'home';
        decide(sim, ant);
        return;
      }
      if (ant.to === ant.at) { decide(sim, ant); if (ant.to === ant.at) return; }
      if (!passable(sim, ant.to)) return; // waiting for a lowered bridge
      const tx = cx(ant.to), ty = cy(ant.to);
      if (moveToward(ant, tx, ty, speed * dt)) {
        ant.at = ant.to;
        sim.traffic[ant.at] = Math.min(4, sim.traffic[ant.at] + 0.35);
        // Sticky tape catches the first few ants across it.
        if (sim.terrain[ant.at] === 'tape' && sim.tapeNeed[ant.at] > 0) {
          sim.tapeNeed[ant.at]--;
          killAnt(sim, ant, 'tape');
          if (sim.tapeNeed[ant.at] === 0) emit(sim, { type: 'tape', cell: ant.at });
          return;
        }
        decide(sim, ant);
      }
      return;
    }
    case 'lost': {
      if (ant.lostT > 0) {
        ant.lostT -= dt;
        ant.dir += (sim.random() - 0.5) * 6 * dt;
        const nx = ant.x + Math.cos(ant.dir) * 0.35 * dt, ny = ant.y + Math.sin(ant.dir) * 0.35 * dt;
        if (inside(Math.round(nx), Math.round(ny))) { ant.x = nx; ant.y = ny; }
        if (ant.lostT <= 0) ant.goal = nearestTrail(sim, ant.x, ant.y);
        return;
      }
      if (!isTrail(sim, ant.goal)) ant.goal = nearestTrail(sim, ant.x, ant.y);
      if (moveToward(ant, cx(ant.goal), cy(ant.goal), speed * 0.8 * dt)) {
        ant.at = ant.to = ant.goal;
        if (def.kind === 'post') {
          if (ant.post >= 0) { const target = postTarget(sim, ant.caste, ant.post); if ('stand' in target) { ant.goal = target.stand; ant.state = 'out'; return; } }
          ant.state = 'home'; ant.goal = -1; return;
        }
        if (ant.load > 0) { ant.state = 'home'; return; }
        ant.goal = -1; ant.state = 'out';
        if (ant.job >= 0) { const food = sim.foods[ant.job]; if (foodReachable(sim, food)) ant.goal = foodCell(food); else releaseJob(sim, ant); }
      }
      return;
    }
    case 'post': {
      stepPost(sim, ant, dt);
      return;
    }
    case 'lift': {
      const food = sim.foods[ant.job];
      if (!food || food.home) { ant.state = 'idle'; ant.job = -1; return; }
      ant.x = food.px + Math.cos(ant.slot) * 0.3; ant.y = food.py + Math.sin(ant.slot) * 0.24;
      ant.dir = food.moving ? Math.atan2(cy(food.to) - food.py, cx(food.to) - food.px) : ant.slot + Math.PI;
      return;
    }
    case 'fly': stepFlyer(sim, ant, speed * dt, dt); return;
  }
}

function stepScout(sim: Sim, ant: Ant, step: number): void {
  if (ant.state === 'out') {
    if (moveToward(ant, cx(ant.post), cy(ant.post), step)) {
      ant.state = 'post'; ant.at = ant.to = ant.post;
      revealAround(sim, ant.x, ant.y, 2.6, true);
      emit(sim, { type: 'post', caste: 'scout', cell: ant.post });
    }
  } else if (moveToward(ant, cx(sim.nest), cy(sim.nest), step)) ant.alive = false;
}

function stepFlyer(sim: Sim, ant: Ant, step: number, dt: number): void {
  if (ant.load === 0 && ant.work === 0 && (ant.job < 0 || sim.foods[ant.job].left <= 0)) { releaseJob(sim, ant); assignJob(sim, ant); }
  const food = ant.job >= 0 ? sim.foods[ant.job] : null;
  const homeBound = ant.load > 0 || !food;
  const tx = homeBound ? cx(sim.nest) : food!.x, ty = homeBound ? cy(sim.nest) : food!.y;
  const pull = lampPull(sim, ant);
  if (pull.zap) { killAnt(sim, ant, 'lamp'); emit(sim, { type: 'strike', kind: 'zap', cells: [], x: ant.x, y: ant.y, hits: 1 }); return; }
  if (pull.x || pull.y) {
    const d = dist(ant.x, ant.y, tx, ty) || 1;
    const vx = (tx - ant.x) / d + pull.x, vy = (ty - ant.y) / d + pull.y, len = Math.hypot(vx, vy) || 1;
    ant.x += vx / len * step; ant.y += vy / len * step; ant.dir = Math.atan2(vy, vx);
    return;
  }
  if (ant.work > 0) {
    ant.work += dt;
    if (ant.work < BITE_TIME) return;
    ant.work = 0;
    if (food && food.left > 0) { food.left--; food.claims = Math.max(0, food.claims - 1); ant.load = 1; sim.stats.bites++; emit(sim, { type: 'bite', food: food.index, x: food.x, y: food.y }); if (food.left <= 0) emit(sim, { type: 'empty', food: food.index }); }
    else { releaseJob(sim, ant); if (!assignJob(sim, ant)) ant.job = -1; }
    return;
  }
  if (moveToward(ant, tx, ty, step)) {
    if (homeBound) {
      if (ant.load) { deliver(sim, ant.load, ant.x, ant.y); ant.load = 0; }
      releaseJob(sim, ant);
      ant.state = 'idle'; ant.at = ant.to = sim.nest; ant.work = 0;
    } else ant.work = 0.0001;
  }
}

function stepPost(sim: Sim, ant: Ant, dt: number): void {
  if (ant.caste === 'digger') {
    const target = ant.post;
    if (target < 0) { ant.state = 'home'; return; }
    sim.dug[target] += dt / 2.2;
    ant.dir = Math.atan2(cy(target) - ant.y, cx(target) - ant.x);
    if (sim.dug[target] >= 1) {
      sim.terrain[target] = 'tunnel';
      emit(sim, { type: 'dig', cell: target });
      ant.work++;
      const nx = cx(target) * 2 - cx(ant.at), ny = cy(target) * 2 - cy(ant.at);
      const next = inside(nx, ny) ? idx(nx, ny) : -1;
      if (ant.work < 2 && next >= 0 && (sim.terrain[next] === 'chalk' || sim.terrain[next] === 'sand') && Math.abs(nx - cx(target)) + Math.abs(ny - cy(target)) === 1) {
        ant.post = next;
      } else { ant.post = -1; ant.state = 'home'; ant.to = ant.at; }
    }
    return;
  }
  if (ant.caste === 'spitter') {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = Math.round(ant.x) + dx, y = Math.round(ant.y) + dy;
      if (!inside(x, y) || dist(x, y, ant.x, ant.y) > 2.3) continue;
      const c = idx(x, y);
      if (sim.terrain[c] !== 'tape') continue;
      sim.tapeAcid[c] += dt / 3;
      if (sim.tapeAcid[c] >= 1) { sim.terrain[c] = 'blanket'; sim.tapeNeed[c] = 0; emit(sim, { type: 'tape', cell: c }); }
    }
    return;
  }
  if (ant.caste === 'bridger') {
    // Lifted bridges: Bridgers wait on the bank, drawn by the renderer.
    return;
  }
  if (ant.caste === 'scout') {
    ant.work += dt;
    if (ant.work > 14) { ant.state = 'home'; }
  }
}

// ------------------------------------------------------------------ world
function revealAround(sim: Sim, x: number, y: number, r: number, persist: boolean): void {
  const fresh: number[] = [];
  for (let gy = Math.max(0, Math.floor(y - r)); gy <= Math.min(ROWS - 1, Math.ceil(y + r)); gy++)
    for (let gx = Math.max(0, Math.floor(x - r)); gx <= Math.min(COLS - 1, Math.ceil(x + r)); gx++) {
      if (dist(gx, gy, x, y) > r) continue;
      const c = idx(gx, gy);
      if (!sim.seen[c]) fresh.push(c);
      sim.seen[c] |= persist ? 2 : 1;
    }
  if (persist && fresh.length) emit(sim, { type: 'reveal', cells: fresh });
}

export function refreshSeen(sim: Sim): void {
  for (let c = 0; c < CELLS; c++) sim.seen[c] &= 2;
  revealAround(sim, cx(sim.nest), cy(sim.nest), 2.3, false);
  for (let c = 0; c < CELLS; c++) if (isTrail(sim, c)) revealAround(sim, cx(c), cy(c), 1.5, false);
  for (const h of sim.hazards) if (h.kind === 'lamp' && h.active) revealAround(sim, h.x, h.y, 3.2, false);
  for (const ant of sim.ants) if (ant.alive && (ant.caste === 'scout' || ant.state === 'fly')) revealAround(sim, ant.x, ant.y, ant.caste === 'scout' ? 2.6 : 1.2, false);
  for (const food of sim.foods) if (!food.visible && !food.appear && sim.seen[idx(food.x, food.y)]) { food.visible = true; emit(sim, { type: 'reveal', cells: [idx(food.x, food.y)] }); }
}

function stepItems(sim: Sim, dt: number): void {
  const rally = sim.queen.rally.active > 0 ? 1.5 : 1;
  for (const food of sim.foods) {
    if (!food.lift || food.home) continue;
    // Recount carriers each step (deaths, recalls).
    let power = 0;
    for (const ant of sim.ants) if (ant.alive && ant.state === 'lift' && ant.job === food.index) power += CASTES[ant.caste].power;
    food.power = power;
    if (food.stun > 0) { food.stun -= dt; food.moving = false; continue; }
    const canMove = power * rally >= food.lift && isTrail(sim, food.at) && sim.queen.scatter.active <= 0;
    if (!canMove) { if (food.moving) { food.moving = false; } continue; }
    if (!food.moving) { food.moving = true; emit(sim, { type: 'lift', food: food.index }); }
    if (food.to === food.at) {
      const p = sim.trailParent[food.at];
      food.to = p >= 0 ? p : sim.nest;
    }
    if (!passable(sim, food.to)) continue;
    const speed = ITEM_SPEED * Math.min(2, Math.pow(power * rally / food.lift, 0.8)) * sim.speedMul;
    const tx = cx(food.to), ty = cy(food.to), d = dist(food.px, food.py, tx, ty);
    if (d <= speed * dt) {
      food.px = tx; food.py = ty; food.at = food.to;
      if (food.at === sim.nest) {
        food.home = true; food.moving = false;
        deliver(sim, food.crumbs, food.px, food.py, true);
        for (const ant of sim.ants) if (ant.alive && ant.state === 'lift' && ant.job === food.index) { ant.job = -1; ant.state = 'idle'; ant.at = ant.to = sim.nest; ant.work = 0.3; }
        food.claims = 0;
      }
    } else { food.px += (tx - food.px) / d * speed * dt; food.py += (ty - food.py) / d * speed * dt; }
  }
}

function stepAlarm(sim: Sim, dt: number): void {
  if (!sim.level.alarm) return;
  const shoe = sim.shoe;
  if (shoe.left > 0) {
    if (shoe.warn > 0) {
      shoe.warn -= dt;
      if (shoe.warn <= 0) {
        const victims = antsIn(sim, new Set(shoe.cells), { cover: true });
        for (const ant of victims) killAnt(sim, ant, 'stomp');
        emit(sim, { type: 'strike', kind: 'stomp', cells: shoe.cells, x: shoe.x, y: shoe.y, hits: victims.length });
        shoe.left--; shoe.t = 0.9;
        if (shoe.left === 0) { sim.alarm = 30; shoe.cells = []; }
      }
      return;
    }
    shoe.t -= dt;
    if (shoe.t <= 0) aimShoe(sim);
    return;
  }
  let rise = exposedCount(sim) * 0.8;
  for (const food of sim.foods) if (food.lift && food.moving) rise += 3.5;
  sim.alarm = Math.max(0, Math.min(100, sim.alarm + (rise - 5) * dt));
  if (sim.alarm >= 100) {
    sim.stats.maxAlarmHits++;
    shoe.left = 3;
    emit(sim, { type: 'alert' });
    aimShoe(sim);
  }
}

function aimShoe(sim: Sim): void {
  const spot = densest(sim, 3, 2, true);
  const shoe = sim.shoe;
  shoe.cells = spot.cells; shoe.x = spot.x; shoe.y = spot.y;
  shoe.warn = (shoe.first ? 3 : 1.5) + sim.mercy * 0.4;
  shoe.first = false;
  emit(sim, { type: 'warn', kind: 'shoe', cells: shoe.cells, x: shoe.x, y: shoe.y, time: shoe.warn });
}

function checkEnd(sim: Sim): void {
  const goal = sim.level.goal;
  let won = false, lost = false;
  if (goal.kind === 'crumbs' || goal.kind === 'race') won = sim.crumbs >= goal.n;
  if (goal.kind === 'race') { if (sim.stats.cutWin) won = true; if (sim.rivalCrumbs >= goal.n || (goal.hp && sim.nestHp <= 0)) lost = true; }
  if (goal.kind === 'item') { const food = sim.foods.find(f => f.id === goal.food); won = !!food?.home && sim.crumbs >= (goal.n ?? 0); }
  if (goal.kind === 'defend') {
    if (sim.nestHp <= 0) lost = true;
    else if (sim.time >= sim.sundown) { if (sim.crumbs >= goal.n) won = true; else lost = true; }
  }
  if (!won && sim.time >= sim.sundown) lost = true;
  // A colony that can no longer act has lost early (no ants out, nothing hatching, no sugar for a brood, and no
  // trickle to wait for). With a trickle the player can always wait for the next brood, so it never ends early.
  if (!won && !lost && sim.time > 3 && (sim.level.fixedAnts || (sim.level.trickle ?? 1) <= 0)) {
    const alive = sim.ants.some(a => a.alive && CASTES[a.caste].kind === 'stream');
    const canHatch = !sim.level.fixedAnts && sim.cards.some(card => CASTES[card.caste].kind === 'stream' && (sim.sugar >= CASTES[card.caste].cost || card.stock > 0));
    const pending = sim.queue.length > 0 || sim.stores.some(s => s.crumbs > 0);
    if (!alive && !canHatch && !pending) lost = true;
  }
  if (won || lost) {
    sim.status = sim.endless ? 'lost' : won ? 'won' : 'lost';
    emit(sim, { type: 'end', won: !!won && !sim.endless });
  }
}

/** Sand beside an antlion pit slides: an ant that lingers on it for more than a second is pulled in. Tunnels are safe. */
export const SLIP_TIME = 1.1;
export function slideCells(sim: Sim): Uint8Array {
  const out = new Uint8Array(CELLS);
  for (let c = 0; c < CELLS; c++) {
    if (sim.terrain[c] !== 'pit') continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = cx(c) + dx, y = cy(c) + dy;
      if (inside(x, y) && sim.terrain[idx(x, y)] === 'sand') out[idx(x, y)] = 1;
    }
  }
  return out;
}
function stepPits(sim: Sim, dt: number): void {
  if (!sim.terrain.includes('pit')) return;
  const slide = slideCells(sim);
  for (const ant of sim.ants) {
    if (!ant.alive || ant.state === 'idle' || ant.state === 'fly') continue;
    if (slide[cellAt(ant.x, ant.y)]) {
      ant.slip += dt;
      if (ant.slip > SLIP_TIME) { killAnt(sim, ant, 'pit'); emit(sim, { type: 'strike', kind: 'pit', cells: [], x: ant.x, y: ant.y, hits: 1 }); }
    } else ant.slip = Math.max(0, ant.slip - dt);
  }
}

export function step(sim: Sim): void {
  if (sim.status !== 'playing') return;
  const dt = STEP;
  sim.time += dt;
  for (const card of sim.cards) card.cooldown = Math.max(0, card.cooldown - dt);
  for (const q of Object.values(sim.queen)) { q.cd = Math.max(0, q.cd - dt); q.active = Math.max(0, q.active - dt); }
  sim.sugar += (sim.level.trickle ?? 1) * dt;
  // Hatching.
  if (sim.queue.length) {
    sim.hatchT += dt;
    while (sim.queue.length && sim.hatchT >= sim.hatchTime && liveAnts(sim) < sim.cap) {
      sim.hatchT -= sim.hatchTime;
      const next = sim.queue.shift()!;
      spawnAnt(sim, next.caste, next.post);
    }
  } else sim.hatchT = 0;
  // Timed food and hazards.
  for (const food of sim.foods) {
    if (food.appear && !food.visible && sim.time >= food.appear) { food.visible = true; emit(sim, { type: 'reveal', cells: [idx(food.x, food.y)] }); }
    if (food.melt && !food.home && food.left > 0 && food.visible) {
      food.meltT += dt;
      if (food.meltT >= food.melt) { food.meltT = 0; food.left--; if (food.left <= 0) emit(sim, { type: 'empty', food: food.index }); }
    }
  }
  for (const h of sim.hazards) {
    if (!h.active && h.at && sim.time >= h.at) {
      h.active = true; h.at = 0; HANDLERS[h.kind].init?.(sim, h); emit(sim, { type: 'boss', what: `arrive-${h.kind}` });
    }
    if (h.active) HANDLERS[h.kind].step(sim, h, dt);
  }
  for (const ant of sim.ants) if (ant.alive) stepAnt(sim, ant, dt);
  stepPits(sim, dt);
  stepItems(sim, dt);
  stepRivals(sim, dt);
  stepStores(sim, dt);
  stepAlarm(sim, dt);
  if (sim.endless) stepEndless(sim, dt);
  if (sim.level.night && Math.round(sim.time / dt) % 8 === 0) refreshSeen(sim);
  for (let c = 0; c < CELLS; c++) if (sim.traffic[c] > 0) sim.traffic[c] = Math.max(0, sim.traffic[c] - dt * 0.6);
  if (sim.ants.length > 400) sim.ants = sim.ants.filter(a => a.alive);
  checkEnd(sim);
}

/** Stars: a clear, the level's named bonus, and par time. */
export function starFlags(sim: Sim): { win: boolean; bonus: boolean; par: boolean } {
  const win = sim.status === 'won';
  return { win, bonus: win && bonusMet(sim), par: win && sim.time <= sim.level.par };
}

export function bonusMet(sim: Sim): boolean {
  const b = sim.level.bonus;
  switch (b.kind) {
    case 'maxLost': return sim.stats.lost <= b.n;
    case 'noAlarm': return sim.stats.maxAlarmHits === 0;
    case 'scent': return sim.stats.scentPeak <= b.n;
    case 'crumbs': return sim.crumbs >= b.n;
    case 'maxScatter': return sim.stats.scatters <= b.n;
    case 'noCaste': return !sim.stats.casteUsed.includes(b.caste);
    case 'hp': return sim.nestHp >= b.n;
    case 'cut': return sim.stats.cutWin;
  }
}

/** Seconds left before sundown. */
export const timeLeft = (sim: Sim) => Math.max(0, sim.sundown - sim.time);
export { becomeLost, trailChanged };
