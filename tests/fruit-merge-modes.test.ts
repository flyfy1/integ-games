import { describe, expect, it, vi } from 'vitest';
import fruitMerge from '../src/games/fruit-merge';
import { readFileSync, writeFileSync } from 'node:fs';
import { replay, solveJar, puzzleWorld } from '../src/games/fruit-merge/jar-solver';
import { HELPER_CAP, JAR_PUZZLES, JAR_SKINS, MISSION_POOL, jarStars, puzzleBudget, twoStarDrops } from '../src/games/fruit-merge/modes';
import { MAX_DROP_TIER, RADII, TOP_TIER, addBody, createWorld, dropFruit, popSmallest, shake, step } from '../src/games/fruit-merge/sim';

const FIXTURE = `${process.cwd()}/tests/fixtures/fruit-merge-jar-solutions.json`;

describe('fruit orbit jar puzzles', () => {
  it.runIf(process.env.REGEN_JAR)('regenerates the reference solutions (REGEN_JAR=1)', () => {
    const out = JAR_PUZZLES.map((_, i) => solveJar(i, 10, 8));
    out.forEach((s, i) => console.log(i + 1, JAR_PUZZLES[i].name[0], s ? s.length : 'FAIL'));
    writeFileSync(FIXTURE, JSON.stringify(out) + '\n');
  }, 900_000);

  it('has twenty puzzles with small drops only, a fair budget and a start that is not already lost', () => {
    expect(JAR_PUZZLES).toHaveLength(20);
    for (const p of JAR_PUZZLES) {
      expect(p.drops.every((t) => t >= 0 && t <= MAX_DROP_TIER)).toBe(true);
      expect(puzzleBudget(p)).toBeGreaterThanOrEqual(p.par + 2);
      expect(twoStarDrops(p)).toBeGreaterThan(p.par);
      const world = puzzleWorld(p);
      expect(world.over).toBe(false);
      expect(world.score).toBe(0);
    }
    // The last puzzles reach the two top tiers, so tiers 9 and 10 are made in real play.
    expect(JAR_PUZZLES.some((p) => p.goal.kind === 'make' && p.goal.tier === 9)).toBe(true);
    expect(JAR_PUZZLES.at(-1)!.goal).toEqual({ kind: 'make', tier: TOP_TIER });
  });

  it('can meet every goal within three-star par, and the line survives a few pixels of aim error', () => {
    const solutions = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Array<number[] | null>;
    JAR_PUZZLES.forEach((p, i) => {
      const xs = solutions[i];
      expect(xs, p.name[0]).toBeTruthy();
      expect(xs!.length, p.name[0]).toBeLessThanOrEqual(p.par);
      expect(replay(p, xs!), p.name[0]).toBe(xs!.length);
      for (const jitter of [-3, 3]) { const used = replay(p, xs!, jitter); expect(used, `${p.name[0]} ${jitter}`).not.toBeNull(); expect(jarStars(p, used!)).toBeGreaterThan(0); }
    });
  });

  it('scores stars by drops used', () => {
    const p = JAR_PUZZLES[6];
    expect(jarStars(p, p.par)).toBe(3);
    expect(jarStars(p, twoStarDrops(p))).toBe(2);
    expect(jarStars(p, puzzleBudget(p))).toBe(twoStarDrops(p) === puzzleBudget(p) ? 2 : 1);
    expect(jarStars(p, puzzleBudget(p) + 1)).toBe(0);
  });

  it('runs out of drops at the end of the list', () => {
    const world = createWorld(() => 0.5, [0, 1]);
    expect(world.current).toBe(0); expect(world.next).toBe(1);
    expect(dropFruit(world, 100, () => 0.5)).toBe(true);
    for (let i = 0; i < 40; i++) step(world);
    expect(dropFruit(world, 200, () => 0.5)).toBe(true);
    expect(world.current).toBe(-1);
    for (let i = 0; i < 40; i++) step(world);
    expect(dropFruit(world, 200, () => 0.5)).toBe(false);
  });
});

describe('fruit orbit helpers, missions and skins', () => {
  it('pops the smallest fruit and shakes the jar without losing anything', () => {
    const world = createWorld(() => 0.5);
    addBody(world, 3, 100, 400, true); addBody(world, 1, 200, 480, true); addBody(world, 1, 300, 300, true); addBody(world, 5, 250, 420, true);
    const popped = popSmallest(world)!;
    expect(popped.tier).toBe(1); expect(popped.y).toBe(300);
    expect(world.bodies).toHaveLength(3);
    const before = world.bodies.map((b) => b.vy);
    shake(world);
    world.bodies.forEach((b, i) => expect(b.vy).toBeLessThan(before[i]));
    for (let i = 0; i < 240; i++) step(world);
    expect(world.bodies.every((b) => b.x - b.r >= 11.9 && b.x + b.r <= 348.1)).toBe(true);
    expect(popSmallest(createWorld(() => 0.5))).toBeNull();
  });

  it('pays only capped helpers and offers reachable missions', () => {
    expect(HELPER_CAP).toBeLessThanOrEqual(3);
    expect(MISSION_POOL.length).toBeGreaterThanOrEqual(9);
    for (const m of MISSION_POOL) { expect(m.target).toBeGreaterThan(0); if (m.tier !== undefined) expect(m.tier).toBeLessThan(RADII.length); }
  });

  it('unlocks a jar skin per discovery, starting with one free skin', () => {
    expect(JAR_SKINS[0].unlock).toBe(0);
    expect(new Set(JAR_SKINS.map((s) => s.id)).size).toBe(JAR_SKINS.length);
    for (let i = 1; i < JAR_SKINS.length; i++) expect(JAR_SKINS[i].unlock).toBeGreaterThan(JAR_SKINS[i - 1].unlock);
    expect(JAR_SKINS.at(-1)!.unlock).toBe(TOP_TIER);
  });
});

describe('fruit orbit cabinet modes', () => {
  const make = (seed: Record<string, unknown> = {}, seat = false) => {
    const values = new Map<string, unknown>(Object.entries(seed));
    let n = 9;
    const services = {
      storage: { get: <T>(key: string, fallback: T) => (values.has(key) ? values.get(key) as T : fallback), set: (key: string, value: unknown) => { values.set(key, value); }, remove: (key: string) => { values.delete(key); } },
      sound: { muted: true, play: vi.fn(), stop: vi.fn(), setMuted: vi.fn() }, random: () => { n = (1664525 * n + 1013904223) >>> 0; return n / 2 ** 32; }, reportScore: vi.fn(), reportComplete: vi.fn(), isReducedMotion: true
    };
    const parent = document.createElement('div'); if (seat) parent.dataset.versusSeat = ''; document.body.append(parent);
    const host = document.createElement('div'); parent.append(host);
    const controller = fruitMerge.mount(host, services);
    const frame = vi.mocked(requestAnimationFrame).mock.calls.at(-1)![0];
    let t = performance.now();
    const run = (seconds: number) => { for (let i = 0; i < seconds * 20; i++) { t += 50; frame(t); } };
    const canvas = host.querySelector('canvas')!;
    const key = (k: string) => { canvas.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); canvas.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true })); };
    return { services, values, host, controller, run, key };
  };

  it('classic still reports merges to the leaderboard and keeps its best', () => {
    const g = make();
    for (let i = 0; i < 12; i++) { g.key(' '); g.run(0.7); }
    expect(g.services.reportScore).toHaveBeenCalled();
    expect(g.values.get('fruit-merge-best')).toBeGreaterThan(0);
    g.controller.destroy();
  });

  it('a jar puzzle is won with the stored line, earns stars and never touches the best score or leaderboard', () => {
    const g = make({ mode: 'puzzle', 'puzzle-index': 0 });
    const xs = (JSON.parse(readFileSync(FIXTURE, 'utf8')) as number[][])[0];
    const canvas = g.host.querySelector('canvas')!;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 360, height: 580, right: 360, bottom: 580, x: 0, y: 0, toJSON: () => ({}) });
    g.run(0.2);
    for (const x of xs) {
      const pointer = (type: string) => Object.assign(new MouseEvent(type, { clientX: x, clientY: 100, bubbles: true }), { pointerId: 1, pointerType: 'mouse' });
      canvas.dispatchEvent(pointer('pointerdown')); canvas.dispatchEvent(pointer('pointerup'));
      g.run(3);
    }
    expect((g.values.get('puzzle-stars') as number[])[0]).toBe(3);
    expect(g.services.reportScore).not.toHaveBeenCalled();
    expect(g.values.has('fruit-merge-best')).toBe(false);
    g.controller.destroy();
  });

  it('the daily jar deals the same drops for everyone today and stays off the leaderboard', () => {
    const a = make({ mode: 'daily' });
    for (let i = 0; i < 10; i++) { a.key(' '); a.run(0.6); }
    expect(a.services.reportScore).not.toHaveBeenCalled();
    expect(a.host.querySelector('.fo-bar')!.textContent).toMatch(/Daily/);
    a.controller.destroy();
  });

  it('opens the mode menu with M and keeps split-screen seats classic', () => {
    const g = make();
    g.key('m');
    const panel = g.host.querySelector<HTMLElement>('.fo-panel')!;
    expect(panel.hidden).toBe(false);
    expect(panel.querySelectorAll('[data-mode]')).toHaveLength(3);
    g.key('ArrowDown'); g.key(' ');
    expect(g.values.get('mode')).toBe('daily');
    g.controller.destroy();
    const seat = make({ mode: 'puzzle', 'puzzle-index': 4 }, true);
    expect(seat.host.querySelector<HTMLElement>('.fo-bar')!.hidden).toBe(true);
    for (let i = 0; i < 12; i++) { seat.key(' '); seat.run(0.7); }
    expect(seat.services.reportScore).toHaveBeenCalled();
    seat.controller.destroy();
  });
});
