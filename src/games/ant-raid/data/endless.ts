import { emit, idx, isTrail } from '../core';
import { addFood, addHazard } from '../sim';
import { COLS, ROWS, type CasteId, type FoodKind, type HazardDef, type LevelDef, type Loc, type Sim } from '../types';

/**
 * Endless Summer and the Daily Raid. A random yard; food keeps arriving; every 90 seconds a new hazard and a new
 * modifier. The sun sets on a clock, and every crumb home pushes sundown back a little, so the run ends when the
 * colony can no longer out-haul the yard. Score = crumbs hauled.
 */
export const ENDLESS_ID = 'endless';
export const DAILY_ID = 'daily';
export const DAILY_HAND: CasteId[] = ['worker', 'porter', 'soldier', 'leafcutter', 'digger'];

export type ModifierDef = { id: string; name: Loc };
export const MODIFIERS: ModifierDef[] = [
  { id: 'feast', name: { en: 'Feast: new food is twice as big', zh: '盛宴：新食物翻倍' } },
  { id: 'heatwave', name: { en: 'Heatwave: ants walk 15% slower', zh: '热浪：蚂蚁慢 15%' } },
  { id: 'breeze', name: { en: 'Breeze: +5 Scent', zh: '微风：气味 +5' } },
  { id: 'picnic', name: { en: 'Picnic: people are watching (Alarm on)', zh: '野餐：有人在看（警觉开启）' } },
  { id: 'sugarrush', name: { en: 'Sugar rush: +60 Sugar now', zh: '糖分爆发：立刻 +60 糖' } },
  { id: 'drought', name: { en: 'Drought: no free Sugar', zh: '干旱：没有自然糖分' } }
];
const HAZARD_POOL: HazardDef['kind'][] = ['spider', 'sprinkler', 'sunbeam', 'sparrow', 'spider', 'toad', 'mower', 'sparrow'];
const PILES: FoodKind[] = ['cookie', 'bread', 'cheese', 'grape', 'jam', 'candy'];
const BIGS: FoodKind[] = ['strawberry', 'sugarcube', 'cake', 'marshmallow'];

export function makeEndlessLevel(random: () => number, daily: boolean): LevelDef {
  const rows = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => '.'));
  const patches = 3 + Math.floor(random() * 3);
  for (let i = 0; i < patches; i++) {
    const w = 2 + Math.floor(random() * 4), h = 2 + Math.floor(random() * 3);
    const x0 = 3 + Math.floor(random() * (COLS - 3 - w)), y0 = Math.floor(random() * (ROWS - h));
    const ch = random() < 0.7 ? 'b' : 's';
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) rows[y][x] = ch;
  }
  for (let i = 0; i < 2; i++) { const x = 5 + Math.floor(random() * 9), y = Math.floor(random() * ROWS); if (y !== 4) rows[y][x] = '#'; }
  rows[4][1] = 'N'; rows[4][2] = '.';
  const grid = rows.map(r => r.join(''));
  const foods = [0, 1, 2].map(i => {
    const x = 6 + Math.floor(random() * 9), y = Math.floor(random() * ROWS);
    if (grid[y][x] === '#') rows[y][x] = '.';
    return { id: `f${i}`, kind: PILES[Math.floor(random() * PILES.length)], x, y, crumbs: 25 + Math.floor(random() * 15) };
  });
  return {
    id: daily ? DAILY_ID : ENDLESS_ID, chapter: 0, index: 0,
    name: daily ? { en: 'Daily Raid', zh: '每日突袭' } : { en: 'Endless Summer', zh: '无尽夏日' },
    blurb: daily ? { en: 'Same yard for everyone today. Haul as much as you can.', zh: '今天所有人同一片院子。能搬多少搬多少。' } : { en: 'Food keeps coming. So do the hazards.', zh: '食物源源不断，危险也是。' },
    type: 'endless', grid: rows.map(r => r.join('')), nest: [1, 4], foods, hazards: [],
    scent: 30, startSugar: 70, cards: daily ? DAILY_HAND : undefined, sundown: 120, par: 9999,
    goal: { kind: 'crumbs', n: 1e9 }, bonus: { kind: 'crumbs', n: 1e9 }, introduces: { en: '', zh: '' },
    endless: { daily }, music: 'endless'
  };
}

function freeCell(sim: Sim, minX = 5): number {
  for (let tries = 0; tries < 60; tries++) {
    const x = minX + Math.floor(sim.random() * (COLS - minX)), y = Math.floor(sim.random() * ROWS);
    const c = idx(x, y), t = sim.terrain[c];
    if (t === 'wall' || t === 'water' || t === 'pit' || t === 'lily' || t === 'chalk') continue;
    if (isTrail(sim, c) || sim.hazards.some(h => h.x === x && h.y === y) || sim.foods.some(f => !f.home && f.left > 0 && f.x === x && f.y === y)) continue;
    return c;
  }
  return idx(COLS - 2, 1 + Math.floor(sim.random() * (ROWS - 2)));
}

export function stepEndless(sim: Sim, dt: number): void {
  const state = sim.endless!;
  const live = sim.foods.filter(f => f.visible && !f.home && (f.lift ? true : f.left > 0)).length;
  if (live < 3) {
    state.respawn += dt;
    if (state.respawn > 4) {
      state.respawn = 0;
      const c = freeCell(sim), feast = sim.modifiers.includes('feast') ? 2 : 1;
      const big = sim.foods.length % 4 === 3;
      const kind = big ? BIGS[Math.floor(sim.random() * BIGS.length)] : PILES[Math.floor(sim.random() * PILES.length)];
      addFood(sim, { id: `f${sim.foods.length}`, kind, x: c % COLS, y: Math.floor(c / COLS), crumbs: (big ? 18 : 22 + Math.floor(sim.random() * 16)) * feast, lift: big ? 8 + Math.floor(sim.random() * 6) : undefined });
      emit(sim, { type: 'reveal', cells: [c] });
    }
  } else state.respawn = 0;
  if (sim.time < state.next) return;
  state.next += 90;
  state.wave++;
  const kind = HAZARD_POOL[(state.wave - 1 + Math.floor(sim.random() * 3)) % HAZARD_POOL.length];
  const c = freeCell(sim, 4);
  const x = c % COLS, y = Math.floor(c / COLS);
  const params: Record<string, number> =
    kind === 'sprinkler' ? { r: 3.2, a0: -Math.PI, a1: Math.PI, on: 4, off: 7 } :
    kind === 'sunbeam' ? { x2: Math.min(COLS - 1, x + 4), y2: Math.max(0, Math.min(ROWS - 1, y + (sim.random() < 0.5 ? -3 : 3))), speed: 0.5 } :
    kind === 'toad' ? { r: 3, spin: 0.5, angle: Math.PI } : kind === 'mower' ? { first: 5, speed: 1.4 } : {};
  if (kind !== 'mower' || !sim.hazards.some(h => h.kind === 'mower')) addHazard(sim, { kind, x, y, params });
  emit(sim, { type: 'boss', what: `arrive-${kind}` });
  const mod = MODIFIERS[(state.wave - 1) % MODIFIERS.length];
  sim.modifiers = [mod.id];
  sim.speedMul = mod.id === 'heatwave' ? 0.85 : 1;
  if (mod.id === 'breeze') { sim.scent += 5; sim.scentMax += 5; }
  if (mod.id === 'sugarrush') sim.sugar += 60;
  (sim.level as { trickle?: number }).trickle = mod.id === 'drought' ? 0 : 1;
  (sim.level as { alarm?: boolean }).alarm = mod.id === 'picnic';
  if (mod.id !== 'picnic') sim.alarm = 0;
  emit(sim, { type: 'modifier', id: mod.id });
}
