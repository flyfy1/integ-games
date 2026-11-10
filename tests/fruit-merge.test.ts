import { describe, expect, it } from 'vitest';
import { BOUNDS, DANGER_LIMIT, RADII, STEP, TIER_COUNT, TOP_TIER, addBody, canMergeFruitTier, chainMultiplier, clampAim, createWorld, dropFruit, landingY, maxOverlap, mergePoints, pickTier, step, type World } from '../src/games/fruit-merge/sim';

const lcg = (seed = 1) => () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
const run = (world: World, seconds: number) => { for (let i = 0; i < Math.round(seconds / STEP); i++) step(world); };
const speedOf = (world: World) => Math.max(0, ...world.bodies.map(b => Math.hypot(b.vx, b.vy)));

describe('fruit orbit tiers and scoring', () => {
  it('has eleven strictly growing tiers and stops merging at the top one', () => {
    expect(RADII).toHaveLength(TIER_COUNT);
    RADII.forEach((r, i) => { if (i) expect(r).toBeGreaterThan(RADII[i - 1]); });
    expect(canMergeFruitTier(0)).toBe(true);
    expect(canMergeFruitTier(TOP_TIER - 1)).toBe(true);
    expect(canMergeFruitTier(TOP_TIER)).toBe(false);
    expect(canMergeFruitTier(-1)).toBe(false);
    expect(canMergeFruitTier(1.5)).toBe(false);
  });

  it('rewards bigger merges and longer chains', () => {
    expect(mergePoints(1)).toBe(2);
    expect(mergePoints(2)).toBe(6);
    expect(mergePoints(TOP_TIER)).toBeGreaterThan(mergePoints(TOP_TIER - 1));
    expect([1, 2, 3, 9].map(chainMultiplier)).toEqual([1, 1.5, 2, 4]);
  });

  it('only hands out small fruit, and eases a new run in', () => {
    const random = lcg(7);
    for (let i = 0; i < 40; i++) expect(pickTier(random, 0)).toBeLessThanOrEqual(1);
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) seen.add(pickTier(random, 50));
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('fruit orbit physics', () => {
  it('is deterministic for the same seed and inputs', () => {
    const play = () => {
      const random = lcg(42), world = createWorld(random);
      for (let i = 0; i < 30; i++) { dropFruit(world, 40 + (i * 53) % 280, random); run(world, 0.7); }
      return JSON.stringify(world.bodies.map(b => [b.tier, b.x, b.y])) + world.score;
    };
    expect(play()).toBe(play());
  });

  it('settles a pile without sinking, tunnelling or jitter', () => {
    const random = lcg(3), world = createWorld(random);
    // Mixed sizes that cannot merge with each other in sequence, stacked into a tall heap.
    const tiers = [6, 2, 4, 0, 5, 1, 3, 7, 0, 2, 4, 1, 3, 0, 5, 2];
    tiers.forEach((tier, i) => { addBody(world, tier, clampAim(60 + (i * 97) % 240, tier), BOUNDS.spawnY); run(world, 0.6); });
    run(world, 6);
    for (const b of world.bodies) {
      expect(b.x - b.r).toBeGreaterThanOrEqual(BOUNDS.left - 0.01);
      expect(b.x + b.r).toBeLessThanOrEqual(BOUNDS.right + 0.01);
      expect(b.y + b.r).toBeLessThanOrEqual(BOUNDS.floor + 0.01);
    }
    expect(maxOverlap(world)).toBeLessThan(1.5);
    expect(speedOf(world)).toBeLessThan(6);
    const before = world.bodies.map(b => [b.x, b.y]);
    run(world, 2);
    world.bodies.forEach((b, i) => expect(Math.hypot(b.x - before[i][0], b.y - before[i][1])).toBeLessThan(1));
  });

  it('does not tunnel a small fast fruit through the floor or a resting fruit', () => {
    const world = createWorld(lcg());
    addBody(world, 0, 180, BOUNDS.floor - RADII[0], true);
    const falling = addBody(world, 1, 180.5, -4000);
    falling.vy = 5000;
    run(world, 4);
    expect(world.bodies.every(b => b.y + b.r <= BOUNDS.floor + 0.01)).toBe(true);
    expect(maxOverlap(world)).toBeLessThan(1);
  });

  it('rolls a fruit off a bigger one instead of balancing on it', () => {
    const world = createWorld(lcg());
    addBody(world, 7, 180, BOUNDS.floor - RADII[7], true);
    const small = addBody(world, 1, 186, 300);
    run(world, 4);
    expect(small.y).toBeGreaterThan(BOUNDS.floor - RADII[1] - 2);
    expect(Math.abs(small.angle)).toBeGreaterThan(0.5);
  });
});

describe('fruit orbit rules', () => {
  it('merges two touching fruit of one tier into the next and scores it', () => {
    const world = createWorld(lcg());
    addBody(world, 2, 150, BOUNDS.floor - RADII[2], true);
    addBody(world, 2, 150 + RADII[2] * 2, BOUNDS.floor - RADII[2], true);
    step(world);
    expect(world.bodies.map(b => b.tier)).toEqual([3]);
    expect(world.score).toBe(mergePoints(3));
    expect(world.events.some(e => e.type === 'merge' && e.tier === 3 && e.chain === 1 && e.newBiggest)).toBe(true);
    run(world, 1);
    expect(world.bodies[0].r).toBe(RADII[3]);
  });

  it('chains merges for a multiplier and leaves two top-tier fruit alone', () => {
    const world = createWorld(lcg());
    // Two stacked 1s become a 2 that drops beside a waiting 2 and becomes a 3.
    addBody(world, 2, 120, BOUNDS.floor - RADII[2], true);
    addBody(world, 1, 120 + RADII[2] + RADII[1], BOUNDS.floor - RADII[1], true);
    addBody(world, 1, 120 + RADII[2] + RADII[1], BOUNDS.floor - RADII[1] * 3, true);
    run(world, 2);
    expect(world.bodies.map(b => b.tier)).toEqual([3]);
    expect(world.bestChain).toBe(2);
    expect(world.score).toBe(mergePoints(2) + Math.round(mergePoints(3) * chainMultiplier(2)));
    expect(world.chain).toBe(0);

    const giants = createWorld(lcg());
    addBody(giants, TOP_TIER, 110, BOUNDS.floor - RADII[TOP_TIER], true);
    addBody(giants, TOP_TIER, 250, BOUNDS.floor - RADII[TOP_TIER], true);
    run(giants, 2);
    expect(giants.bodies).toHaveLength(2);
    expect(giants.score).toBe(0);
  });

  it('gates drops behind a cooldown and predicts where the fruit lands', () => {
    const random = lcg(5), world = createWorld(random);
    const first = world.current, upcoming = world.next;
    expect(landingY(world, 180, RADII[first])).toBe(BOUNDS.floor - RADII[first]);
    expect(dropFruit(world, -500, random)).toBe(true);
    expect(world.bodies[0].x).toBe(BOUNDS.left + RADII[first]);
    expect(world.current).toBe(upcoming);
    expect(dropFruit(world, 180, random)).toBe(false);
    run(world, 2);
    expect(dropFruit(world, 180, random)).toBe(true);
    const resting = world.bodies[0];
    expect(landingY(world, resting.x, 20)).toBeCloseTo(resting.y - resting.r - 20, 3);
  });

  it('ends the run only after fruit stays above the line for the whole grace period', () => {
    const world = createWorld(lcg());
    // More big, unmergeable fruit than the jar can hold below the line.
    [10, 9, 8, 7, 6, 5].forEach((tier) => { addBody(world, tier, 180, BOUNDS.spawnY); run(world, 0.25); });
    expect(world.over).toBe(false);
    world.danger = 0;
    run(world, DANGER_LIMIT - 0.5);
    expect(world.overflowing).toBe(true);
    expect(world.danger).toBeGreaterThan(1);
    expect(world.over).toBe(false);
    run(world, 0.6);
    expect(world.over).toBe(true);
    expect(world.events.filter(e => e.type === 'over')).toHaveLength(1);
  });

  it('forgives a fruit that only passes the line on its way down', () => {
    const random = lcg(9), world = createWorld(random);
    for (let i = 0; i < 6; i++) { dropFruit(world, 60 + i * 48, random); run(world, 1); }
    expect(world.danger).toBe(0);
    expect(world.over).toBe(false);
  });
});

describe('fruit orbit full runs', () => {
  it('always ends a careless run, with every fruit still inside the jar', () => {
    for (const seed of [1, 2, 3]) {
      const random = lcg(seed), aim = lcg(seed + 100), world = createWorld(random);
      let guard = 0;
      while (!world.over && guard++ < 60 * 60 * 20) { if (world.cooldown === 0) dropFruit(world, BOUNDS.left + aim() * (BOUNDS.right - BOUNDS.left), random); step(world); }
      expect(world.over).toBe(true);
      expect(world.score).toBeGreaterThan(0);
      expect(world.bodies.every(b => b.x - b.r >= BOUNDS.left - 0.01 && b.x + b.r <= BOUNDS.right + 0.01 && b.y + b.r <= BOUNDS.floor + 0.01)).toBe(true);
      expect(maxOverlap(world)).toBeLessThan(3);
    }
  });
});
