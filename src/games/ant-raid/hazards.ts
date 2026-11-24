import { CASTES } from './data/castes';
import {
  antsIn, BRIDGE_NEED, cellAt, covered, cutSubtree, cx, cy, deliver, densest, dist, dropOffBridge, emit, idx, inside, isTrail, killAnt, shade
} from './core';
import { COLS, ROWS, type Ant, type Hazard, type HazardKind, type Rival, type Sim } from './types';

/**
 * Hazard handlers ("the towers"). Each kind registers `init` and `step`; the sim loop only calls through this table,
 * so a new chapter adds a handler and data, never a branch in the core loop. All timing scales with `sim.mercy`
 * (failed attempts on a boss): slower cycles and longer warnings.
 */
type Handler = { init?(sim: Sim, h: Hazard): void; step(sim: Sim, h: Hazard, dt: number): void; blocks?: boolean };

const num = (h: Hazard, key: string, fallback: number) => { const v = h.params?.[key]; return typeof v === 'number' ? v : fallback; };
const slow = (sim: Sim) => 1 + 0.25 * sim.mercy;
const extraWarn = (sim: Sim) => 0.5 * sim.mercy;

const targetable = (sim: Sim, ant: Ant) => ant.alive && ant.state !== 'idle' && ant.state !== 'fly' && sim.queen.scatter.active <= 0 && sim.terrain[cellAt(ant.x, ant.y)] !== 'tunnel' && cellAt(ant.x, ant.y) !== sim.nest;
const posted = (sim: Sim, caste: string, x: number, y: number, r: number) => sim.ants.filter(a => a.alive && a.caste === caste && a.state === 'post' && dist(a.x, a.y, x, y) <= r);

function nearestIn(sim: Sim, x: number, y: number, r: number, accept: (ant: Ant) => boolean = () => true): Ant | null {
  let best: Ant | null = null, bd = r;
  for (const ant of sim.ants) {
    if (!targetable(sim, ant) || !accept(ant)) continue;
    const d = dist(ant.x, ant.y, x, y);
    if (d <= bd) { bd = d; best = ant; }
  }
  return best;
}

/** A jumping spider guards a radius and eats one ant every few seconds. Posted Soldiers fight it off. */
const spider: Handler = {
  blocks: true,
  init(sim, h) { h.hp = num(h, 'hp', 30); h.cd = num(h, 'period', 2.6) * slow(sim); },
  step(sim, h, dt) {
    const r = num(h, 'r', 1.8);
    const soldiers = posted(sim, 'soldier', h.x, h.y, r + 0.7);
    const spitters = posted(sim, 'spitter', h.x, h.y, 2.6);
    if (soldiers.length || spitters.length) {
      h.hp -= (soldiers.length * 7 + spitters.length * 4) * dt;
      h.phase = 1;
      if (soldiers.length) {
        const victim = soldiers[0];
        victim.hp -= 3.2 * dt;
        if (victim.hp <= 0) killAnt(sim, victim, 'spider');
      }
      if (h.hp <= 0) { h.active = false; emit(sim, { type: 'boss', what: 'spider-flee' }); emit(sim, { type: 'strike', kind: 'flee', cells: [], x: h.x, y: h.y, hits: 0 }); }
      return;
    }
    h.phase = 0;
    h.cd -= dt;
    if (h.cd > 0) return;
    // Soldiers and Spitters march in to fight; the spider only snatches the rest.
    const prey = nearestIn(sim, h.x, h.y, r, ant => ant.caste !== 'soldier' && ant.caste !== 'spitter');
    if (prey) {
      h.angle = Math.atan2(prey.y - h.y, prey.x - h.x);
      killAnt(sim, prey, 'spider');
      emit(sim, { type: 'strike', kind: 'spider', cells: [], x: prey.x, y: prey.y, hits: 1 });
    }
    h.cd = num(h, 'period', 2.6) * slow(sim);
  }
};

/** Old Gulp's tongue: the nearest ant inside a slowly turning cone. Three tongues, then a nap. */
const toad: Handler = {
  blocks: true,
  init(sim, h) { h.angle = num(h, 'angle', Math.PI); h.cd = num(h, 'period', 2.4) * slow(sim); h.dir = 1; },
  step(sim, h, dt) {
    const r = num(h, 'r', 3.6), cone = num(h, 'cone', 0.7), spin = num(h, 'spin', 0.42) / slow(sim);
    if (h.phase === 1) { // napping
      h.t -= dt;
      if (h.t <= 0) { h.phase = 0; h.count = 0; h.cd = 1.2; emit(sim, { type: 'boss', what: 'wake' }); }
      return;
    }
    // The toad turns its head toward the biggest crowd in reach: decoys pull its gaze.
    let sx = 0, sy = 0, n = 0;
    for (const ant of sim.ants) if (targetable(sim, ant) && dist(ant.x, ant.y, h.x, h.y) <= r) { const w = 1 / Math.max(0.6, dist(ant.x, ant.y, h.x, h.y)); sx += (ant.x - h.x) * w; sy += (ant.y - h.y) * w; n++; }
    if (n) {
      let diff = Math.atan2(sy, sx) - h.angle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      h.angle += Math.max(-spin * dt, Math.min(spin * dt, diff));
    }
    const before = h.cd;
    h.cd -= dt;
    const warnAt = 0.6 + extraWarn(sim) * 0.5;
    if (before > warnAt && h.cd <= warnAt) emit(sim, { type: 'warn', kind: 'tongue', cells: [], x: h.x, y: h.y, time: warnAt });
    if (h.cd > 0) return;
    const inCone = (ant: Ant) => {
      let d = Math.atan2(ant.y - h.y, ant.x - h.x) - h.angle;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      return Math.abs(d) <= cone;
    };
    // Carriers under a moving item are hidden by it; the tongue knocks the item loose instead.
    const shielded = (ant: Ant) => ant.state === 'lift' && !!sim.foods[ant.job]?.moving;
    const prey = nearestIn(sim, h.x, h.y, r, ant => inCone(ant) && !shielded(ant));
    const item = sim.foods.find(f => f.lift && f.moving && dist(f.px, f.py, h.x, h.y) <= r && inCone({ x: f.px, y: f.py } as Ant));
    h.cd = num(h, 'period', 2.4) * slow(sim);
    if (item && (!prey || dist(item.px, item.py, h.x, h.y) < dist(prey.x, prey.y, h.x, h.y))) {
      item.stun = 1.6; item.moving = false;
      emit(sim, { type: 'strike', kind: 'tongue', cells: [], x: item.px, y: item.py, hits: 0 });
      emit(sim, { type: 'drop', food: item.index });
      h.count++;
      if (h.count >= num(h, 'tongues', 3)) { h.phase = 1; h.t = num(h, 'nap', 6) + sim.mercy * 1.5; emit(sim, { type: 'boss', what: 'nap' }); }
      return;
    }
    if (!prey) { h.cd = 0.5; return; }
    killAnt(sim, prey, 'tongue');
    emit(sim, { type: 'strike', kind: 'tongue', cells: [], x: prey.x, y: prey.y, hits: 1 });
    h.count++;
    if (h.count >= num(h, 'tongues', 3)) { h.phase = 1; h.t = num(h, 'nap', 6) + sim.mercy * 1.5; emit(sim, { type: 'boss', what: 'nap' }); }
  }
};

/** Sprinkler: rests, warns, then sweeps an arc, washing away trail cells and knocking ants loose. */
const sprinkler: Handler = {
  blocks: true,
  init(_sim, h) { h.t = num(h, 'offset', 0); },
  step(sim, h, dt) {
    const on = num(h, 'on', 4), off = num(h, 'off', 6) * slow(sim), r = num(h, 'r', 3.5);
    const a0 = num(h, 'a0', -Math.PI / 2), a1 = num(h, 'a1', Math.PI / 2);
    const before = h.t;
    h.t = (h.t + dt) % (on + off);
    const warnAt = off - 1.8 - extraWarn(sim);
    if (before < warnAt && h.t >= warnAt) {
      h.cells = arcCells(h, r, a0, a1);
      emit(sim, { type: 'warn', kind: 'sprinkler', cells: h.cells, x: h.x, y: h.y, time: off - warnAt });
    }
    if (h.t < off) { h.phase = 0; return; }
    if (h.phase === 0) { h.phase = 1; h.cells = arcCells(h, r, a0, a1); emit(sim, { type: 'strike', kind: 'sprinkler', cells: [], x: h.x, y: h.y, hits: 0 }); }
    const k = (h.t - off) / on;
    h.angle = a0 + (a1 - a0) * (h.dir < 0 ? 1 - k : k);
    if (h.t + dt >= on + off) h.dir = h.dir < 0 ? 1 : -1;
    const sh = shade(sim);
    const hit: number[] = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const d = dist(x, y, h.x, h.y);
      if (d > r || d < 0.5) continue;
      let diff = Math.atan2(y - h.y, x - h.x) - h.angle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (Math.abs(diff) > 0.24) continue;
      const c = idx(x, y);
      if (sim.terrain[c] === 'tunnel' || sh[c] || c === sim.nest) continue;
      hit.push(c);
    }
    if (!hit.length) return;
    const set = new Set(hit);
    for (const ant of sim.ants) {
      if (!ant.alive || ant.state === 'idle' || ant.state === 'fly' || ant.state === 'lift') continue;
      if (!set.has(cellAt(ant.x, ant.y))) continue;
      const a = Math.atan2(ant.y - h.y, ant.x - h.x);
      ant.x = Math.max(0, Math.min(COLS - 1, ant.x + Math.cos(a) * 0.5));
      ant.y = Math.max(0, Math.min(ROWS - 1, ant.y + Math.sin(a) * 0.5));
      if (ant.state === 'out' || ant.state === 'home' || ant.state === 'post') { ant.state = 'lost'; ant.lostT = 1.5; }
    }
    const washed: number[] = [];
    for (const c of hit) if (isTrail(sim, c)) washed.push(...cutSubtree(sim, c));
    if (washed.length) emit(sim, { type: 'washed', cells: washed });
  }
};

function arcCells(h: Hazard, r: number, a0: number, a1: number): number[] {
  const out: number[] = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const d = dist(x, y, h.x, h.y);
    if (d > r || d < 0.5) continue;
    const a = Math.atan2(y - h.y, x - h.x);
    const lo = Math.min(a0, a1) - 0.2, hi = Math.max(a0, a1) + 0.2;
    const wrapped = [a, a + Math.PI * 2, a - Math.PI * 2].some(v => v >= lo && v <= hi);
    if (wrapped) out.push(idx(x, y));
  }
  return out;
}

/** A magnifying-glass hot spot crawling along a line. Ants caught in it too long are toast; leaves shade them. */
const sunbeam: Handler = {
  init(_sim, h) { h.px = h.x; h.py = h.y; h.dir = 1; h.t = num(h, 'offset', 0); },
  step(sim, h, dt) {
    const x2 = num(h, 'x2', h.x), y2 = num(h, 'y2', h.y), speed = num(h, 'speed', 0.5) / slow(sim), r = num(h, 'r', 0.85);
    const len = Math.max(0.01, dist(h.x, h.y, x2, y2));
    h.t += h.dir * speed * dt / len;
    if (h.t >= 1) { h.t = 1; h.dir = -1; } else if (h.t <= 0) { h.t = 0; h.dir = 1; }
    h.px = h.x + (x2 - h.x) * h.t; h.py = h.y + (y2 - h.y) * h.t;
    const sh = shade(sim);
    for (const ant of sim.ants) {
      if (!ant.alive || ant.state === 'idle') continue;
      const c = cellAt(ant.x, ant.y);
      if (dist(ant.x, ant.y, h.px, h.py) <= r && !sh[c] && sim.terrain[c] !== 'tunnel' && c !== sim.nest) {
        ant.heat += dt;
        if (ant.heat > 0.75) { killAnt(sim, ant, 'sun'); emit(sim, { type: 'strike', kind: 'sun', cells: [], x: ant.x, y: ant.y, hits: 1 }); }
      } else ant.heat = Math.max(0, ant.heat - dt * 0.5);
    }
  }
};

/** A sparrow circles, marks the busiest exposed patch, then pecks it. Grass, tunnels and Scatter save the ants. */
const sparrow: Handler = {
  init(sim, h) { h.cd = num(h, 'first', 8) * slow(sim); },
  step(sim, h, dt) {
    if (h.phase === 0) {
      h.cd -= dt;
      h.px = h.x + Math.cos(sim.time * 0.7) * 2; h.py = h.y + Math.sin(sim.time * 0.7) * 1.2;
      if (h.cd > 0) return;
      const spot = densest(sim, 2, 2, true, true);
      if (spot.n < 1) { h.cd = 1.5; return; }
      h.cells = spot.cells; h.px = spot.x; h.py = spot.y; h.phase = 1; h.warn = num(h, 'warn', 2.4) + extraWarn(sim);
      emit(sim, { type: 'warn', kind: 'sparrow', cells: h.cells, x: spot.x, y: spot.y, time: h.warn });
      return;
    }
    h.warn -= dt;
    if (h.warn > 0) return;
    const victims = antsIn(sim, new Set(h.cells), { flyers: true, cover: true }).slice(0, num(h, 'max', 6));
    for (const ant of victims) killAnt(sim, ant, 'peck');
    emit(sim, { type: 'strike', kind: 'sparrow', cells: h.cells, x: h.px, y: h.py, hits: victims.length });
    h.phase = 0; h.cd = num(h, 'period', 12) * slow(sim); h.cells = [];
  }
};

/** Rumble the robot mower: sweeps a two-row lane, eating trail and ants; the next lane is drawn on the grass. */
const mower: Handler = {
  blocks: false,
  init(sim, h) { h.phase = 0; h.t = num(h, 'first', 6); h.speed = num(h, 'speed', 1.6); h.count = 0; pickLane(sim, h); },
  step(sim, h, dt) {
    const frac = sim.time / Math.max(1, sim.level.sundown);
    const gear = frac > 0.66 ? 2 : frac > 0.33 ? 1 : 0;
    if (gear > h.count) { h.count = gear; emit(sim, { type: 'boss', what: 'gear' }); }
    if (h.phase === 0) {
      h.t -= dt;
      if (h.t > 0) return;
      h.phase = 1; h.px = h.dir > 0 ? -0.8 : COLS - 0.2;
      emit(sim, { type: 'strike', kind: 'mower', cells: [], x: h.px, y: h.py, hits: 0 });
      return;
    }
    const slowed = posted(sim, 'spitter', h.px, h.py + 0.5, 2.6).length > 0;
    const speed = h.speed * (1 + 0.3 * h.count) * (slowed ? 0.5 : 1) / slow(sim);
    h.px += h.dir * speed * dt;
    const col = Math.round(h.px);
    const rows = [h.py, h.py + 1].filter(r => r < ROWS);
    if (col >= 0 && col < COLS) {
      const cells = new Set(rows.map(r => idx(col, r)).filter(c => c !== sim.nest && sim.terrain[c] !== 'tunnel'));
      let hits = 0;
      for (const ant of sim.ants) {
        if (!ant.alive || ant.state === 'idle' || ant.state === 'fly') continue;
        if (cells.has(cellAt(ant.x, ant.y))) { killAnt(sim, ant, 'mower'); hits++; }
      }
      for (const food of sim.foods) if (food.lift && !food.home && cells.has(food.at)) { food.moving = false; }
      const cut: number[] = [];
      for (const c of cells) if (isTrail(sim, c)) cut.push(...cutSubtree(sim, c));
      if (cut.length) emit(sim, { type: 'washed', cells: cut });
      if (hits) emit(sim, { type: 'strike', kind: 'chew', cells: [...cells], x: col, y: h.py + 0.5, hits });
    }
    if ((h.dir > 0 && h.px > COLS + 0.5) || (h.dir < 0 && h.px < -1.2)) {
      h.phase = 0; h.t = num(h, 'rest', 3.2) + extraWarn(sim) * 2; pickLane(sim, h);
    }
  }
};

function pickLane(sim: Sim, h: Hazard): void {
  const lanes = [0, 2, 4, 6, 7];
  let best = lanes[0], bestScore = -1;
  for (const lane of lanes) {
    let score = sim.random() * 1.5;
    for (let x = 0; x < COLS; x++) for (const r of [lane, lane + 1]) if (r < ROWS) { const c = idx(x, r); if (isTrail(sim, c) && sim.terrain[c] !== 'tunnel') score += 1; }
    if (lane === h.py && h.phase === 0 && sim.time > 1) score -= 4;
    if (score > bestScore) { bestScore = score; best = lane; }
  }
  h.py = best;
  h.dir = sim.random() < 0.5 ? 1 : -1;
  h.cells = [];
  for (let x = 0; x < COLS; x++) for (const r of [best, best + 1]) if (r < ROWS) h.cells.push(idx(x, r));
  emit(sim, { type: 'warn', kind: 'mower', cells: h.cells, x: h.dir > 0 ? 0 : COLS - 1, y: best + 0.5, time: h.t });
}

/** Bluestreak the kingfisher: dives at a bridge after a shadow warning. A lifted bridge is safe. */
const kingfisher: Handler = {
  init(sim, h) { h.cd = num(h, 'first', 9) * slow(sim); },
  step(sim, h, dt) {
    h.px = h.x + Math.cos(sim.time * 0.5) * 1.5; h.py = h.y + Math.sin(sim.time * 0.9) * 0.6;
    if (h.phase === 0) {
      h.cd -= dt;
      if (h.cd > 0) return;
      const bridges: number[] = [];
      for (let c = 0; c < COLS * ROWS; c++) if (sim.terrain[c] === 'water' && sim.bridge[c] > 0) bridges.push(c);
      if (!bridges.length) { h.cd = 2; return; }
      // Busiest bridge first.
      bridges.sort((a, b) => crowd(sim, b) - crowd(sim, a) || a - b);
      h.cells = [bridges[0]];
      h.px = cx(bridges[0]); h.py = cy(bridges[0]);
      // The first dive of the day gives a longer shadow (`firstWarn`): that is when a newcomer learns to lift.
      h.phase = 1; h.warn = (h.count === 0 ? num(h, 'firstWarn', num(h, 'warn', 3)) : num(h, 'warn', 3)) + extraWarn(sim) * 2;
      emit(sim, { type: 'warn', kind: 'dive', cells: h.cells, x: h.px, y: h.py, time: h.warn });
      return;
    }
    h.px = cx(h.cells[0]); h.py = cy(h.cells[0]);
    h.warn -= dt;
    if (h.warn > 0) return;
    const c = h.cells[0];
    let hits = 0;
    h.count++;
    // `grace` dives only graze a lowered bridge: nobody falls and the bridge holds, and the HUD explains the lift.
    if (sim.bridged[c] && h.t < num(h, 'grace', 0)) { h.t++; emit(sim, { type: 'boss', what: 'graze' }); }
    else if (sim.bridged[c]) {
      for (const ant of sim.ants) if (ant.alive && ant.caste === 'bridger' && ant.post === c && ant.state === 'post') { killAnt(sim, ant, 'dive'); hits++; }
      if (sim.bridged[c]) { sim.bridged[c] = 0; emit(sim, { type: 'bridge', cell: c, up: false }); dropOffBridge(sim, c); }
    }
    for (const ant of sim.ants) if (ant.alive && ant.state === 'fly' && dist(ant.x, ant.y, cx(c), cy(c)) < 1.2) { killAnt(sim, ant, 'dive'); hits++; }
    emit(sim, { type: 'strike', kind: 'dive', cells: [c], x: cx(c), y: cy(c), hits });
    h.phase = 0; h.cd = num(h, 'period', 11) * slow(sim); h.cells = [];
  }
};
const crowd = (sim: Sim, cell: number) => sim.ants.filter(a => a.alive && cellAt(a.x, a.y) === cell).length + (isTrail(sim, cell) ? 2 : 0);

/** The bug lamp: lights the dark and pulls Flyers in. A Scout at its plug switches it off. */
const lamp: Handler = {
  blocks: true,
  step(sim, h) {
    if (!h.active) return;
    const px = num(h, 'plugX', h.x), py = num(h, 'plugY', h.y);
    for (const ant of sim.ants) if (ant.alive && ant.caste === 'scout' && dist(ant.x, ant.y, px, py) < 0.6) {
      h.active = false; emit(sim, { type: 'lamp', on: false }); break;
    }
  }
};

/**
 * A rival fire-ant colony. It walks fixed trails to food (stealing crumbs) and, when `raid` routes are set, marches
 * on the player's nest in waves. Soldiers posted next to a rival trail cut it; Queen Cinder loses if all are cut.
 */
const rival: Handler = {
  blocks: true,
  init(sim, h) {
    h.cd = num(h, 'first', 4);
    h.count = 0; h.t = 0;
    const routes = String(h.params?.routes ?? '').split('|').filter(Boolean);
    for (const route of routes) {
      const cells = polyline(route);
      const end = cells[cells.length - 1];
      const food = sim.foods.findIndex(f => idx(f.x, f.y) === end);
      sim.rivalRoutes.push({ cells, cut: false, food });
    }
  },
  step(sim, h, dt) {
    if (!h.active) return;
    // Cuts: a posted Soldier or Spitter within one cell of any cell of a route (not counting the rival's own nest).
    const guards = sim.ants.filter(a => a.alive && a.state === 'post' && (a.caste === 'soldier' || a.caste === 'spitter'));
    let allCut = sim.rivalRoutes.length > 0;
    sim.rivalRoutes.forEach((route) => {
      const was = route.cut;
      route.cut = route.food >= 0 && guards.some(g => route.cells.slice(1).some(c => dist(g.x, g.y, cx(c), cy(c)) <= 1.05));
      if (route.cut && !was) emit(sim, { type: 'rival', what: 'cut', x: cx(route.cells[Math.floor(route.cells.length / 2)]), y: cy(route.cells[Math.floor(route.cells.length / 2)]) });
      if (!route.cut) allCut = false;
    });
    // Cutting every trail wins only if the cut is held (\`hold\` seconds) while her raiders keep coming.
    if (h.params?.cutWins) {
      h.t = allCut ? h.t + dt : 0;
      if (allCut && h.t >= num(h, 'hold', 0)) sim.stats.cutWin = true;
    }
    // Foragers.
    const every = num(h, 'every', 2.5) * slow(sim);
    h.cd -= dt;
    if (h.cd <= 0 && sim.rivalRoutes.length) {
      h.cd = every;
      for (let tries = 0; tries < sim.rivalRoutes.length; tries++) {
        const k = (h.count++) % sim.rivalRoutes.length, route = sim.rivalRoutes[k];
        if (route.cut || route.food < 0 || sim.foods[route.food].left <= 0) continue;
        spawnRival(sim, route.cells, 'out', k);
        break;
      }
    }
    // Raid waves on the nest.
    const waves = (h.params?.waves as number[] | undefined) ?? [];
    const raids = String(h.params?.raid ?? '').split('|').filter(Boolean);
    for (const time of waves) {
      if (sim.time - dt < time && sim.time >= time && raids.length) {
        const size = num(h, 'wave', 6) + Math.floor(waves.indexOf(time) * num(h, 'grow', 2));
        for (let i = 0; i < size; i++) { const route = polyline(raids[i % raids.length]); spawnRival(sim, route, 'raid', -1, -i * 0.45); }
        emit(sim, { type: 'rival', what: 'raid', x: h.x, y: h.y });
      }
    }
  }
};

export function polyline(spec: string): number[] {
  const points = spec.split('>').map(p => p.split(',').map(Number) as [number, number]);
  const out: number[] = [idx(points[0][0], points[0][1])];
  for (let i = 1; i < points.length; i++) {
    let [px, py] = points[i - 1];
    const [x, y] = points[i];
    while (px !== x) { px += Math.sign(x - px); out.push(idx(px, py)); }
    while (py !== y) { py += Math.sign(y - py); out.push(idx(px, py)); }
  }
  return out;
}

let rivalId = 1;
function spawnRival(sim: Sim, path: number[], state: Rival['state'], route: number, delay = 0): void {
  const start = path[0];
  sim.rivals.push({ id: rivalId++, x: cx(start) - delay * 0.0, y: cy(start), path, i: delay < 0 ? Math.round(delay * 2) : 0, load: 0, state, hp: 2, dir: 0, alive: true, route });
}

/** Rival ants move, steal, raid and fight. Called once per step from the sim. */
export function stepRivals(sim: Sim, dt: number): void {
  if (!sim.rivals.length) return;
  const speed = 1.9 / slow(sim);
  for (const r of sim.rivals) {
    if (!r.alive) continue;
    if (r.i < 0) { r.i += dt * 2; if (r.i >= 0) r.i = 0; else continue; }
    const route = r.route >= 0 ? sim.rivalRoutes[r.route] : null;
    if (route?.cut && r.state === 'out') r.state = 'home';
    const target = r.state === 'home' ? r.path[Math.max(0, Math.floor(r.i) - 1)] : r.path[Math.min(r.path.length - 1, Math.floor(r.i) + 1)];
    const tx = cx(target), ty = cy(target);
    const d = dist(r.x, r.y, tx, ty);
    if (d > 0.02) {
      const move = Math.min(d, speed * dt);
      r.dir = Math.atan2(ty - r.y, tx - r.x);
      r.x += (tx - r.x) / d * move; r.y += (ty - r.y) / d * move;
    }
    if (dist(r.x, r.y, tx, ty) < 0.05) {
      if (r.state === 'home') {
        r.i = Math.max(0, Math.floor(r.i) - 1);
        if (r.i === 0) { if (r.load) { sim.rivalCrumbs += r.load; emit(sim, { type: 'rival', what: 'steal', x: r.x, y: r.y }); } r.alive = false; }
      } else {
        r.i = Math.floor(r.i) + 1;
        if (r.i >= r.path.length - 1) {
          if (r.state === 'raid') {
            sim.nestHp = Math.max(0, sim.nestHp - 1); r.alive = false;
            emit(sim, { type: 'nest', hp: sim.nestHp });
          } else {
            const food = route && route.food >= 0 ? sim.foods[route.food] : null;
            if (food && food.left > 0) { food.left--; r.load = 1; if (food.left <= 0) emit(sim, { type: 'empty', food: food.index }); }
            r.state = 'home';
          }
        }
      }
    }
    // Fights.
    r.hp -= posted(sim, 'spitter', r.x, r.y, 2.4).length * 2.5 * dt;
    const guards = posted(sim, 'soldier', r.x, r.y, 1.6);
    if (guards.length) r.hp -= guards.length * 3.4 * dt;
    let crowdN = 0, victim: Ant | null = null;
    for (const ant of sim.ants) {
      if (!targetable(sim, ant) || ant.caste === 'soldier') continue;
      const dd = dist(ant.x, ant.y, r.x, r.y);
      if (dd < 0.75) crowdN++;
      if (dd < 0.45 && !victim) victim = ant;
    }
    if (crowdN >= 3) r.hp -= 2 * dt;
    if (victim && sim.random() < dt * 0.9) killAnt(sim, victim, 'rival');
    if (r.hp <= 0) { r.alive = false; emit(sim, { type: 'rival', what: 'killed', x: r.x, y: r.y }); if (r.load && route && route.food >= 0) sim.foods[route.food].left += r.load; }
  }
  if (sim.rivals.length > 60) sim.rivals = sim.rivals.filter(r => r.alive);
}

export const HANDLERS: Record<HazardKind, Handler> = { spider, toad, sprinkler, sunbeam, sparrow, mower, kingfisher, lamp, rival };

/** Cells a hazard sits on (not paintable). */
export function blockedCells(sim: Sim): Set<number> {
  const out = new Set<number>();
  for (const h of sim.hazards) if (h.active && HANDLERS[h.kind].blocks && inside(h.x, h.y)) out.add(idx(h.x, h.y));
  return out;
}

/** Flyer steering near an active lamp: returns a pull vector and whether it was zapped. */
export function lampPull(sim: Sim, ant: Ant): { x: number; y: number; zap: boolean } {
  let px = 0, py = 0, zap = false;
  for (const h of sim.hazards) {
    if (h.kind !== 'lamp' || !h.active) continue;
    const d = dist(ant.x, ant.y, h.x, h.y);
    if (d < 0.45) zap = true;
    else if (d < 4.5) { const k = (4.5 - d) / 4.5 * 1.6; px += (h.x - ant.x) / d * k; py += (h.y - ant.y) / d * k; }
  }
  return { x: px, y: py, zap };
}

/** Honeypot bucket chains: each store sends one crumb home every so often. */
export function stepStores(sim: Sim, dt: number): void {
  for (const store of sim.stores) {
    if (store.ant < 0 && store.crumbs <= 0) continue;
    if (store.crumbs <= 0) { store.t = 0; continue; }
    store.t += dt;
    const every = 0.42;
    while (store.t >= every && store.crumbs > 0) { store.t -= every; store.crumbs--; deliver(sim, 1, cx(sim.nest), cy(sim.nest)); }
  }
}

/** Exposed-ant count for the Alarm meter. */
export function exposedCount(sim: Sim): number {
  const sh = shade(sim);
  let n = 0;
  for (const ant of sim.ants) {
    if (!ant.alive || ant.state === 'idle' || ant.state === 'fly') continue;
    const c = cellAt(ant.x, ant.y);
    if (c === sim.nest) continue;
    if (ant.state === 'lost' || !covered(sim, c, sh)) n += CASTES[ant.caste].size >= 3 ? 1.5 : 1;
  }
  return n;
}

export const BRIDGE = BRIDGE_NEED;
