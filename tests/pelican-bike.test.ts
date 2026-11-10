import { describe, expect, it, vi } from 'vitest';
import { pelicanBike } from '../src/games/pelican-bike';
import { LEVELS } from '../src/games/pelican-bike/levels';
import { cloneSim, createSim, medalsFor, mergeBest, noInput, respawn, STEP, stepSim } from '../src/games/pelican-bike/sim';
import type { Input, Sim } from '../src/games/pelican-bike/sim';
import { PH } from '../src/games/pelican-bike/theme';
import type { GameServices } from '../src/core/game-types';

const services = (stored: Record<string, unknown> = {}): GameServices => ({
  storage: { get: <T>(k: string, fb: T) => (k in stored ? stored[k] as T : fb), set: vi.fn(), remove: vi.fn() },
  sound: { muted: true, setMuted: vi.fn(), stop: vi.fn(), play: vi.fn() },
  random: () => 0.5,
  reportScore: vi.fn(),
  reportComplete: vi.fn(),
  isReducedMotion: false
});

function run(s: Sim, seconds: number, set: Partial<Input>, pressJump = false) {
  const inp: Input = { ...noInput(), ...set };
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i++) { inp.jumpPressed = pressJump && i === 0; stepSim(s, inp, STEP); }
}
const settle = (s: Sim) => run(s, 0.3, {});
const feet = (s: Sim) => s.P.y + PH;

describe('pelican-bike module', () => {
  it('mounts, pauses, restarts and cleans up safely', () => {
    const host = document.createElement('div');
    const controller = pelicanBike.mount(host, services());
    expect(host.querySelector('canvas')).not.toBeNull();
    expect(() => {
      controller.pause();
      controller.resume();
      controller.restart();
      controller.destroy();
    }).not.toThrow();
    expect(host.childElementCount).toBe(0);
  });

  it('survives stored progress from an older or damaged save', () => {
    const host = document.createElement('div');
    for (const stages of [undefined, 'nope', [null, { time: 'x' }], [{ time: 31.2, fish: 40, stars: 3, medals: 7 }]]) {
      const controller = pelicanBike.mount(host, services({ hiscore: 1200, stages }));
      controller.destroy();
    }
  });

  it('ignores keys typed into a text field elsewhere on the page', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const s = services();
    const controller = pelicanBike.mount(host, s);
    const field = document.createElement('textarea');
    document.body.append(field);
    const typed = new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true });
    field.dispatchEvent(typed);
    expect(typed.defaultPrevented).toBe(false);
    expect(host.querySelector<HTMLElement>('[data-pelican-bike]')!.dataset.state ?? 'title').not.toBe('playing');
    const real = new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true });
    window.dispatchEvent(real);
    expect(real.defaultPrevented).toBe(true);
    expect(s.reportScore).toHaveBeenCalled(); // the stage started
    controller.destroy(); field.remove(); host.remove();
  });
});

describe('pelican-bike simulation', () => {
  it('is deterministic: the same inputs give the same ride', () => {
    const a = createSim(0), b = createSim(0);
    for (const s of [a, b]) { run(s, 1.2, { right: true }); run(s, 0.5, { right: true, jump: true }, true); run(s, 1, { right: true, turbo: true }); }
    expect(a.P.x).toBe(b.P.x);
    expect(a.P.y).toBe(b.P.y);
    expect(a.score).toBe(b.score);
  });

  it('starts every stage standing on the ground with full health', () => {
    LEVELS.forEach((_l, i) => {
      const s = createSim(i);
      settle(s);
      expect(s.P.ground).toBe(true);
      expect(s.P.hp).toBe(3);
      expect(s.starTot).toBe(3);
      expect(s.fishTot).toBeGreaterThan(30);
    });
  });

  it('gives a short hop for a tap and a higher one for a held button', () => {
    const tap = createSim(0), hold = createSim(0);
    settle(tap); settle(hold);
    const ground = feet(tap);
    let tapTop = ground, holdTop = ground;
    run(tap, 0.05, { jump: true }, true);
    for (let i = 0; i < 100; i++) { run(tap, STEP, {}); tapTop = Math.min(tapTop, feet(tap)); }
    run(hold, 0.02, { jump: true }, true);
    for (let i = 0; i < 100; i++) { run(hold, STEP, { jump: true }); holdTop = Math.min(holdTop, feet(hold)); }
    expect(ground - tapTop).toBeGreaterThan(15);
    expect(ground - holdTop).toBeGreaterThan(85);
    expect(ground - holdTop).toBeGreaterThan((ground - tapTop) * 1.6);
  });

  it('allows one extra flap in the air, then no more', () => {
    const s = createSim(0);
    settle(s);
    run(s, 0.3, { jump: true }, true);
    run(s, 0.05, {});
    run(s, 0.05, { jump: true }, true);
    expect(s.P.jumps).toBe(2);
    const vy = s.P.vy;
    run(s, 0.02, {});
    run(s, 0.02, { jump: true }, true);
    expect(s.P.vy).toBeGreaterThan(vy); // still falling off the same flap, no third jump
  });

  it('forgives a jump pressed just after rolling off a ledge and one pressed just before landing', () => {
    const s = createSim(0);
    settle(s);
    s.P.ground = false; s.P.coyote = 0.08; // just left the edge
    run(s, STEP, { jump: true }, true);
    expect(s.P.vy).toBeLessThan(-400);
    const b = createSim(0);
    settle(b);
    b.P.y -= 12; b.P.ground = false; b.P.coyote = 0; b.P.jumps = 2; b.P.vy = 200; // about to land, no flap left
    run(b, STEP, { jump: true }, true);
    run(b, 0.1, { jump: true });
    expect(b.P.vy).toBeLessThan(-300); // the buffered press fired on touchdown
  });

  it('glides: holding the button while falling slows the fall and spends energy', () => {
    const fall = createSim(0), glide = createSim(0);
    for (const s of [fall, glide]) { settle(s); s.P.y -= 200; s.P.ground = false; s.P.coyote = 0; s.P.jumps = 2; }
    run(fall, 0.3, {});
    run(glide, 0.3, { jump: true });
    expect(glide.P.vy).toBeLessThanOrEqual(125);
    expect(fall.P.vy).toBeGreaterThan(300);
    expect(glide.P.stamina).toBeLessThan(fall.P.stamina);
  });

  it('launches off a spring at full height even when the jump button is not held', () => {
    const s = createSim(1);
    const sp = s.springs[0];
    s.P.x = sp.x; s.P.y = sp.y - PH + 6; s.P.vy = 50; s.P.ground = false;
    const start = feet(s);
    let top = start;
    for (let i = 0; i < 200; i++) { run(s, STEP, {}); top = Math.min(top, feet(s)); }
    expect(start - top).toBeGreaterThan(200);
  });

  it('sprints faster than it pedals and runs out of breath', () => {
    const walk = createSim(0), sprint = createSim(0);
    settle(walk); settle(sprint);
    run(walk, 0.6, { right: true });
    run(sprint, 0.6, { right: true, turbo: true });
    expect(walk.P.vx).toBeCloseTo(300, 0);
    expect(sprint.P.vx).toBeCloseTo(435, 0);
    expect(sprint.P.stamina).toBeLessThan(walk.P.stamina);
  });

  it('collects a head-height fish just by riding under it', () => {
    const s = createSim(0);
    settle(s);
    const before = s.fishGot;
    run(s, 3.2, { right: true });
    expect(s.fishGot).toBeGreaterThan(before);
    expect(s.score).toBeGreaterThanOrEqual(100);
  });

  it('kills in water, respawns at the checkpoint and keeps what was collected', () => {
    const s = createSim(0);
    settle(s);
    s.items[0] = { ...s.items[0], got: true }; s.fishGot = 1;
    const ck = s.checks[0];
    s.P.x = ck.x; s.P.y = ck.y;
    run(s, STEP, {});
    expect(s.checks[0].active).toBe(true);
    s.P.y = 600; // into the sea
    run(s, STEP, {});
    expect(s.P.dead).toBe(true);
    expect(s.deaths).toBe(1);
    run(s, 1, {});
    expect(s.P.dead).toBe(false);
    expect(s.P.hp).toBe(3);
    expect(Math.abs(s.P.x - ck.x)).toBeLessThan(40);
    expect(s.items[0].got).toBe(true);
    expect(s.fishGot).toBe(1);
    expect(s.fishGot).toBeLessThanOrEqual(s.fishTot);
  });

  it('brings enemies and crumbling blocks back on respawn', () => {
    const s = createSim(1);
    s.enemies[0].dead = true;
    const cr = s.crumbles[0];
    s.grid[cr.r][cr.c] = '.'; s.crumbles[0] = { ...cr, state: 2, t: 3 };
    respawn(s);
    expect(s.enemies[0].dead).toBe(false);
    expect(s.grid[cr.r][cr.c]).toBe('x');
    expect(s.crumbles[0].state).toBe(0);
  });

  it('takes a heart off for an enemy bump, then grants a moment of mercy', () => {
    const s = createSim(0);
    settle(s);
    const crab = s.enemies.find((e) => e.type === 'crab')!;
    s.P.x = crab.x - 10; s.P.y = crab.y + crab.h - PH; s.P.ground = true; s.P.vy = 0;
    run(s, STEP * 2, {});
    expect(s.P.hp).toBe(2);
    expect(s.P.inv).toBeGreaterThan(1);
    s.P.x = crab.x; s.P.y = crab.y + crab.h - PH;
    run(s, STEP * 2, {});
    expect(s.P.hp).toBe(2);
  });

  it('stomps a crab from above for points and a bounce', () => {
    const s = createSim(0);
    settle(s);
    const crab = s.enemies.find((e) => e.type === 'crab')!;
    s.P.x = crab.x; s.P.y = crab.y - PH - 4; s.P.vy = 300; s.P.ground = false;
    const before = s.score;
    run(s, 0.05, {});
    expect(crab.dead || s.enemies.find((e) => e.type === 'crab' && e.dead)).toBeTruthy();
    expect(s.score).toBe(before + 200);
    expect(s.P.hp).toBe(3);
  });

  it('a clone can be stepped without disturbing the original', () => {
    const s = createSim(1);
    settle(s);
    const snap = JSON.stringify({ P: s.P, items: s.items, grid: s.grid, enemies: s.enemies, crumbles: s.crumbles });
    const c = cloneSim(s);
    run(c, 4, { right: true, jump: true, turbo: true }, true);
    expect(JSON.stringify({ P: s.P, items: s.items, grid: s.grid, enemies: s.enemies, crumbles: s.crumbles })).toBe(snap);
    expect(c.P.x).toBeGreaterThan(s.P.x);
  });

  it('awards medals for par time, all stars and a 90% fish haul, and keeps the best of each', () => {
    const base = { lv: 0, starTot: 3, fishTot: 40 };
    expect(medalsFor({ ...base, time: LEVELS[0].par + 5, starGot: 2, fishGot: 20 })).toBe(0);
    expect(medalsFor({ ...base, time: LEVELS[0].par, starGot: 2, fishGot: 20 })).toBe(1);
    expect(medalsFor({ ...base, time: 999, starGot: 3, fishGot: 35 })).toBe(2);
    expect(medalsFor({ ...base, time: 999, starGot: 0, fishGot: 36 })).toBe(4);
    expect(medalsFor({ ...base, time: 10, starGot: 3, fishGot: 40 })).toBe(7);
    expect(mergeBest(null, { time: 50, fish: 30, stars: 1, medals: 4 })).toEqual({ time: 50, fish: 30, stars: 1, medals: 4 });
    expect(mergeBest({ time: 50, fish: 30, stars: 1, medals: 4 }, { time: 38, fish: 12, stars: 3, medals: 3 })).toEqual({ time: 38, fish: 30, stars: 3, medals: 7 });
    expect(mergeBest({ time: 38, fish: 30, stars: 3, medals: 7 }, { time: 60, fish: 5, stars: 0, medals: 0 })).toEqual({ time: 38, fish: 30, stars: 3, medals: 7 });
  });

  it('counts the lighthouse at any height, so gliding over the top still finishes the stage', () => {
    const s = createSim(0);
    settle(s);
    s.P.x = s.goal.x - 60; s.P.y = 40; s.P.vx = 300; s.P.vy = 0; s.P.ground = false;
    run(s, 0.4, { right: true, jump: true });
    expect(s.cleared).toBe(true);
  });

  it('finishes a stage at the lighthouse and pays a time bonus under par', () => {
    const s = createSim(0);
    settle(s);
    s.P.x = s.goal.x - 10; s.P.y = s.goal.y - PH;
    run(s, STEP, {});
    expect(s.cleared).toBe(true);
    expect(s.timeBonus).toBeGreaterThan(0);
    expect(s.score).toBe(1000 + s.timeBonus);
    const frozen = s.time;
    run(s, 0.5, { right: true });
    expect(s.time).toBe(frozen);
  });
});
