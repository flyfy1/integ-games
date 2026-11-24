import { describe, expect, it } from 'vitest';
import { cx, cy, idx, isTrail } from '../src/games/ant-raid/core';
import { levelById } from '../src/games/ant-raid/data';
import { computeLayout, toGrid, toScreen } from '../src/games/ant-raid/render/layout';
import { createSim, drainEvents, erase, mulberry32, paint, playCard, queenCall, step } from '../src/games/ant-raid/sim';
import type { LevelDef, Sim } from '../src/games/ant-raid/types';

const base = (patch: Partial<LevelDef> = {}): LevelDef => ({
  id: 't', chapter: 1, index: 1, name: { en: 't', zh: 't' }, blurb: { en: '', zh: '' }, type: 'haul', introduces: { en: '', zh: '' },
  grid: ['................', '................', '................', '......bbbb......', '.N....bbbb......', '......bbbb......', '................', '................', '................'],
  nest: [1, 4], foods: [{ id: 'f', kind: 'cookie', x: 8, y: 4, crumbs: 30 }], hazards: [], scent: 20, startSugar: 100, cards: ['worker', 'porter', 'soldier'],
  sundown: 200, par: 100, goal: { kind: 'crumbs', n: 999 }, bonus: { kind: 'maxLost', n: 0 }, ...patch
});
const run = (sim: Sim, seconds: number) => { for (let i = 0; i < seconds * 30 && sim.status === 'playing'; i++) step(sim); };
const line = (sim: Sim, y: number, x0: number, x1: number) => { let prev = sim.nest; for (let x = x0; x <= x1; x++) { expect(paint(sim, idx(x, y), prev).ok).toBe(true); prev = idx(x, y); } };

describe('ant-raid sim: trails', () => {
  it('only grows from the nest or the trail, and spends Scent', () => {
    const sim = createSim(base(), { random: mulberry32(1) });
    expect(paint(sim, idx(5, 4))).toEqual({ ok: false, reason: 'adjacent' });
    expect(paint(sim, idx(2, 4)).ok).toBe(true);
    expect(sim.scent).toBe(19);
    expect(paint(sim, idx(3, 4)).ok).toBe(true);
    expect(sim.trailParent[idx(3, 4)]).toBe(idx(2, 4));
  });
  it('refuses walls and water and stops at zero Scent', () => {
    const sim = createSim(base({ grid: ['................', '................', '................', '................', '.N#~............', '................', '................', '................', '................'], scent: 2 }), { random: mulberry32(1) });
    expect(paint(sim, idx(2, 4)).ok).toBe(false);
    expect(paint(sim, idx(1, 3)).ok).toBe(true);
    expect(paint(sim, idx(2, 3)).ok).toBe(true);
    expect(paint(sim, idx(3, 3))).toEqual({ ok: false, reason: 'scent' });
  });
  it('cutting a cell removes its whole branch and refunds the Scent', () => {
    const sim = createSim(base(), { random: mulberry32(1) });
    line(sim, 4, 2, 8);
    expect(sim.scent).toBe(13);
    expect(erase(sim, idx(4, 4)).ok).toBe(true);
    expect(isTrail(sim, idx(8, 4))).toBe(false);
    expect(isTrail(sim, idx(3, 4))).toBe(true);
    expect(sim.scent).toBe(18);
    expect(erase(sim, sim.nest).ok).toBe(false);
  });
});

describe('ant-raid sim: colony', () => {
  it('Workers hatch, walk the trail, bite crumbs and bring them home for Sugar', () => {
    const sim = createSim(base(), { random: mulberry32(2) });
    line(sim, 4, 2, 8);
    expect(playCard(sim, 'worker').ok).toBe(true);
    const sugar = sim.sugar;
    run(sim, 20);
    expect(sim.crumbs).toBeGreaterThan(3);
    expect(sim.sugar).toBeGreaterThan(sugar);
    expect(sim.foods[0].left).toBe(30 - sim.crumbs - sim.ants.reduce((s, a) => s + (a.alive ? a.load : 0), 0));
  });
  it('ants on a cut piece get lost, then walk back to the trail and keep their crumb', () => {
    const sim = createSim(base(), { random: mulberry32(3) });
    line(sim, 4, 2, 8);
    playCard(sim, 'worker'); playCard(sim, 'worker');
    run(sim, 6);
    erase(sim, idx(5, 4));
    const lost = sim.ants.filter(a => a.state === 'lost');
    expect(lost.length).toBeGreaterThan(0);
    line(sim, 4, 5, 8);
    run(sim, 8);
    expect(sim.ants.filter(a => a.alive && a.state === 'lost').length).toBe(0);
  });
  it('a big item waits for enough lifting power, then moves home', () => {
    const sim = createSim(base({ foods: [{ id: 'b', kind: 'strawberry', x: 6, y: 4, crumbs: 20, lift: 9 }], goal: { kind: 'item', food: 'b' } }), { random: mulberry32(4) });
    line(sim, 4, 2, 6);
    playCard(sim, 'worker');
    run(sim, 8);
    expect(sim.foods[0].moving).toBe(false);
    expect(sim.foods[0].at).toBe(idx(6, 4));
    for (let i = 0; i < 2; i++) { playCard(sim, 'porter'); run(sim, 2.2); }
    run(sim, 30);
    expect(sim.status).toBe('won');
    expect(sim.crumbs).toBeGreaterThanOrEqual(20);
  });
  it('a spider eats ants in reach until a posted Soldier drives it off', () => {
    const level = base({ hazards: [{ kind: 'spider', x: 6, y: 3, params: { r: 2, period: 1.5, hp: 20 } }], foods: [{ id: 'f', kind: 'cookie', x: 10, y: 4, crumbs: 99 }] });
    const sim = createSim(level, { random: mulberry32(5) });
    line(sim, 4, 2, 10);
    playCard(sim, 'worker'); run(sim, 1); playCard(sim, 'worker');
    run(sim, 12);
    expect(sim.stats.lost).toBeGreaterThan(0);
    expect(playCard(sim, 'soldier', idx(6, 4)).ok).toBe(true);
    run(sim, 15);
    expect(sim.hazards[0].active).toBe(false);
  });
  it('full Alarm brings the Shoe, and Scatter at the shadow saves the ants', () => {
    const grid = ['................', 'bbbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbbb', 'bNbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbbbb', '................'];
    const mk = () => { const sim = createSim(base({ grid, alarm: true, foods: [{ id: 'f', kind: 'cookie', x: 12, y: 4, crumbs: 400 }], startSugar: 400, scent: 30 }), { random: mulberry32(6) }); line(sim, 4, 2, 12); for (let i = 0; i < 8; i++) playCard(sim, 'worker'), run(sim, 1); return sim; };
    // Without Scatter: the stomps land on ants.
    const a = mk();
    let hitAt = -1, warned = false;
    for (let i = 0; i < 60 * 30 && hitAt < 0; i++) {
      step(a);
      for (const e of drainEvents(a)) { if (e.type === 'warn' && e.kind === 'shoe') warned = true; if (e.type === 'strike' && e.kind === 'stomp' && e.hits > 0) hitAt = a.time; }
    }
    expect(warned).toBe(true);
    expect(hitAt).toBeGreaterThan(0);
    expect(a.stats.lost).toBeGreaterThan(0);
    // Same seed, but Scatter just before that stomp: nobody is under the shoe.
    const b = mk();
    while (b.time < hitAt - 0.8) { step(b); drainEvents(b); }
    expect(queenCall(b, 'scatter').ok).toBe(true);
    let hits = -1;
    for (let i = 0; i < 60 && hits < 0; i++) { step(b); for (const e of drainEvents(b)) if (e.type === 'strike' && e.kind === 'stomp') hits = e.hits; }
    expect(b.time).toBeGreaterThan(hitAt - 0.1);
    expect(hits).toBe(0);
  });
  it('is deterministic for a seed', () => {
    const play = () => { const sim = createSim(levelById('1-5')!, { random: mulberry32(9), loadout: ['worker', 'porter'] }); line(sim, 4, 2, 7); for (let i = 0; i < 6; i++) { playCard(sim, 'worker'); run(sim, 2); } run(sim, 30); return [sim.crumbs, sim.stats.lost, sim.ants.length, Math.round(sim.sugar * 100)]; };
    expect(play()).toEqual(play());
  });
});

describe('ant-raid sim: chapter 2 hazards', () => {
  const g = (rows: string[]) => rows;
  it('the sprinkler washes trail cells in its arc and refunds the Scent', () => {
    const sim = createSim(base({ hazards: [{ kind: 'sprinkler', x: 6, y: 2, params: { r: 3, on: 2, off: 2, a0: 0, a1: Math.PI } }] }), { random: mulberry32(1) });
    line(sim, 4, 2, 8);
    const scent = sim.scent;
    let washed = false;
    for (let i = 0; i < 8 * 30 && !washed; i++) { step(sim); washed = drainEvents(sim).some(e => e.type === 'washed'); }
    expect(washed).toBe(true);
    expect(sim.scent).toBeGreaterThan(scent);
  });
  it('chalk blocks the trail until a Digger tunnels two cells through it', () => {
    const sim = createSim(base({ grid: g(['................', '................', '................', '................', '.N....cc........', '................', '................', '................', '................']), cards: ['worker', 'digger'] }), { random: mulberry32(2) });
    line(sim, 4, 2, 5);
    expect(paint(sim, idx(6, 4), idx(5, 4)).ok).toBe(false);
    expect(playCard(sim, 'digger', idx(6, 4)).ok).toBe(true);
    run(sim, 10);
    expect(sim.terrain[idx(6, 4)]).toBe('tunnel');
    expect(sim.terrain[idx(7, 4)]).toBe('tunnel');
    expect(paint(sim, idx(6, 4), idx(5, 4)).ok).toBe(true);
  });
  it('a sunbeam cooks Workers on its line, and a Leafcutter shades the ants beside it', () => {
    const level = base({ hazards: [{ kind: 'sunbeam', x: 4, y: 4, params: { x2: 4, y2: 4, speed: 0, r: 1 } }], cards: ['worker', 'leafcutter'], foods: [{ id: 'f', kind: 'cookie', x: 8, y: 4, crumbs: 99 }] });
    const a = createSim(level, { random: mulberry32(3) });
    line(a, 4, 2, 8); playCard(a, 'worker'); run(a, 8);
    expect(a.stats.lost).toBeGreaterThan(0);
    const b = createSim(level, { random: mulberry32(3) });
    line(b, 4, 2, 8);
    for (let i = 0; i < 6; i++) { playCard(b, 'leafcutter'); run(b, 0.4); }
    const before = b.stats.lost;
    run(b, 1);
    expect(b.ants.filter(a => a.caste === 'leafcutter' && a.alive).length).toBeGreaterThan(0);
    expect(b.stats.lost).toBeLessThanOrEqual(before + 1);
  });
  it('sand beside an antlion pit pulls in ants that linger, but not in a tunnel', () => {
    const grid = g(['................', '................', '................', '................', '.N.ssssss.......', '....ooooo.......', '................', '................', '................']);
    const sim = createSim(base({ grid, foods: [{ id: 'f', kind: 'cookie', x: 10, y: 4, crumbs: 99 }] }), { random: mulberry32(4) });
    line(sim, 4, 2, 10);
    playCard(sim, 'worker'); run(sim, 8);
    expect(sim.stats.lost).toBeGreaterThan(0);
  });
  it('the mower eats ants and trail in its lane, and tunnels under it are safe', () => {
    const grid = g(['................', '................', '................', '................', '.Nssssssss......', '................', '................', '................', '................']);
    const level = base({ grid, hazards: [{ kind: 'mower', x: 0, y: 0, params: { first: 4, speed: 3, rest: 30 } }], foods: [{ id: 'f', kind: 'cookie', x: 11, y: 4, crumbs: 99 }], startSugar: 300, scent: 30 });
    const open = createSim(level, { random: mulberry32(5) });
    line(open, 4, 2, 11);
    for (let i = 0; i < 4; i++) { playCard(open, 'worker'); run(open, 0.5); }
    run(open, 12);
    expect(open.stats.lost).toBeGreaterThan(0);
    const dug = createSim(level, { random: mulberry32(5) });
    for (let x = 2; x <= 9; x++) dug.terrain[idx(x, 4)] = 'tunnel';
    line(dug, 4, 2, 11);
    for (let i = 0; i < 4; i++) { playCard(dug, 'worker'); run(dug, 0.5); }
    run(dug, 12);
    expect(dug.stats.lost).toBeLessThan(open.stats.lost);
  });
});

describe('ant-raid layout', () => {
  it('maps cells to the screen and back in landscape and in rotated portrait', () => {
    for (const [w, h] of [[1000, 600], [400, 800]]) {
      const l = computeLayout(w, h, 2, { top: 50, right: 0, bottom: 90, left: 0 });
      expect(l.rot).toBe(h > w);
      for (const [x, y] of [[0, 0], [15, 8], [7, 3]]) { const s = toScreen(l, x, y); const g = toGrid(l, s.x, s.y); expect(g.x).toBeCloseTo(x); expect(g.y).toBeCloseTo(y); }
      expect(l.ox).toBeGreaterThanOrEqual(0); expect(l.oy).toBeGreaterThanOrEqual(50);
    }
    expect(cx(idx(5, 7))).toBe(5); expect(cy(idx(5, 7))).toBe(7);
  });
});
