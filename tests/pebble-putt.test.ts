import { describe, expect, it, vi } from 'vitest';
import { mulberry, pathField, phasesFor, sloppyRound } from '../src/games/pebble-putt/bot';
import { GARDENS, HOLES } from '../src/games/pebble-putt/holes';
import { createWorld, simulateShot, step, strike } from '../src/games/pebble-putt/physics';
import { PROOFS } from '../src/games/pebble-putt/proofs';
import { blankSave, isUnlocked, loadSave, recordHole } from '../src/games/pebble-putt/save';
import type { Hole, Shot } from '../src/games/pebble-putt/types';
import pebblePutt from '../src/games/pebble-putt/index';
import type { GameServices } from '../src/core/game-types';

/** Replays a stored route from the tee; returns strokes taken (penalties included) or Infinity if it never holes out. */
function replay(hole: Hole, shots: readonly Shot[]) {
  let x = hole.tee[0], y = hole.tee[1], strokes = 0;
  for (const s of shots) {
    const r = simulateShot(hole, x, y, s.angle, s.power, s.at ?? 0);
    strokes += r.water ? 2 : 1;
    if (r.sunk) return strokes;
    if (!r.water) { x = r.x; y = r.y; }
  }
  return Infinity;
}

describe('Pebble Putt course', () => {
  it('has eighteen holes in three gardens of six, each with a short caption', () => {
    expect(HOLES).toHaveLength(18);
    expect(GARDENS.map(g => g.holes.length)).toEqual([6, 6, 6]);
    expect(GARDENS.flatMap(g => g.holes)).toEqual(HOLES.map(h => h.id));
    for (const h of HOLES) {
      expect(h.caption.en.split(/\s+/).length, `hole ${h.id} caption`).toBeLessThanOrEqual(3);
      expect(h.caption.zh.length).toBeGreaterThan(0);
      expect(h.par).toBeGreaterThanOrEqual(2);
    }
  });

  it.each(HOLES.map(h => [h.id, h] as const))('hole %i: the stored ace sinks in one and the par route holes out within par', (_id, hole) => {
    expect(PROOFS[hole.id], 'run scripts/pebble-putt-search.ts --write').toBeDefined();
    const ace = simulateShot(hole, hole.tee[0], hole.tee[1], hole.ace.angle, hole.ace.power, hole.ace.at ?? 0);
    expect(ace.sunk).toBe(true);
    expect(replay(hole, hole.parRoute)).toBeLessThanOrEqual(hole.par);
    // the par route is a different plan from the ace (it never holes out on its first shot)
    expect(hole.parRoute.length).toBeGreaterThan(1);
  });

  it.each(HOLES.filter(h => h.id > 1).map(h => [h.id, h] as const))('hole %i: aiming straight at the cup (±1°, any power, any gate time) never aces', (_id, hole) => {
    const direct = Math.atan2(hole.cup[1] - hole.tee[1], hole.cup[0] - hole.tee[0]) * 180 / Math.PI;
    const times = hole.gates?.length ? phasesFor(hole, 0.1) : [0];
    for (const d of [-1, -0.5, 0, 0.5, 1]) for (let p = 1; p <= 40; p++) for (const at of times) {
      expect(simulateShot(hole, hole.tee[0], hole.tee[1], direct + d, p / 40, at).sunk, `angle ${d} power ${p}/40 at ${at}`).toBe(false);
    }
  });

  it('every full-power shot rests within six seconds', () => {
    for (const hole of HOLES) for (let a = 0; a < 360; a += 15) {
      const r = simulateShot(hole, hole.tee[0], hole.tee[1], a, 1, 0);
      expect(r.t, `hole ${hole.id} angle ${a}`).toBeLessThanOrEqual(6.01);
    }
  });

  it('is deterministic: the same shot gives the same rest spot', () => {
    const hole = HOLES[3];
    const a = simulateShot(hole, hole.tee[0], hole.tee[1], 71.3, 0.83, 0.4);
    const b = simulateShot(hole, hole.tee[0], hole.tee[1], 71.3, 0.83, 0.4);
    expect(a).toEqual(b);
  });

  it('knocks a resting pebble when another rolls into it', () => {
    const hole = HOLES[0];
    const w = createWorld(hole, 2);
    for (const b of w.balls) b.onCourse = true;
    w.balls[1].x = hole.tee[0]; w.balls[1].y = hole.tee[1] + 2;
    strike(w, 0, 90, 0.6);
    for (let i = 0; i < 120 * 6 && w.balls.some(b => b.moving); i++) step(w);
    expect(w.balls[1].y).toBeGreaterThan(hole.tee[1] + 2.5);
  });

  it.each(GARDENS.map(g => [g.id, g] as const))('garden %i: a sloppy bot (±3°) finishes each hole within par + 2 (sample)', (_id, garden) => {
    const rng = mulberry(4242 + garden.id);
    for (const id of garden.holes) {
      const hole = HOLES.find(h => h.id === id)!;
      const r = sloppyRound(hole, rng, pathField(hole), { angleStep: 3, powers: 16 });
      expect(r.strokes, `hole ${id}`).toBeLessThanOrEqual(hole.par + 2);
    }
  }, 120_000);
});

describe('Pebble Putt saves', () => {
  it('ignores junk and keeps the best record', () => {
    const store = new Map<string, unknown>([['save', { v: 1, holes: { 1: { best: 3, stars: [true, false, false] }, 99: { best: 1 }, 2: 'x' }, settings: { sfx: 7 }, lang: 'fr' }]]);
    const storage = { get: <T>(k: string, d: T) => (store.get(k) as T) ?? d, set: vi.fn(), remove: vi.fn() };
    const save = loadSave(storage);
    expect(Object.keys(save.holes)).toEqual(['1']);
    expect(save.settings.sfx).toBe(0.8);
    expect(save.lang).toBeUndefined();
    const fresh = recordHole(save, 1, 2, 1, true);
    expect(fresh).toEqual([false, true, true]);
    expect(save.holes[1]).toEqual({ best: 1, stars: [true, true, true] });
    recordHole(save, 1, 2, 4, true);
    expect(save.holes[1].best).toBe(1);
    expect(isUnlocked(save, 2)).toBe(true);
    expect(isUnlocked(blankSave(), 2)).toBe(false);
  });
});

describe('Pebble Putt shell', () => {
  it('shows a plain message when WebGL is unavailable', async () => {
    const services: GameServices = {
      storage: { get: <T>(_k: string, d: T) => d, set: vi.fn(), remove: vi.fn() },
      sound: { muted: true, setMuted: vi.fn(), stop: vi.fn(), play: vi.fn() }, random: () => 0.5, reportScore: vi.fn(), reportComplete: vi.fn(), isReducedMotion: true
    };
    const host = document.createElement('div');
    const ctl = pebblePutt.mount(host, services);
    await (host.querySelector('[data-pebble-putt]') as unknown as { __pp: { glReady: Promise<void> } }).__pp.glReady;
    expect(host.querySelector('.pp-fallback')?.textContent).toContain('WebGL');
    ctl.destroy();
    expect(host.childElementCount).toBe(0);
  });
});
