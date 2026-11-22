import { describe, expect, it } from 'vitest';
import { connectedSameColor, findUnsupported, LAUNCHER, NEIGHBOR_DISTANCE, traceShot, type Bubble } from '../src/games/bubble';

const bubble = (x: number, y: number, color: number): Bubble => ({ x, y, color });

describe('Bubble Pop graph rules', () => {
  it('clears a four-bubble same-color chain at the horizontal 43px boundary', () => {
    const chain = [bubble(20, 55, 1), bubble(63, 55, 1), bubble(106, 55, 1), bubble(149, 55, 1)];
    expect(NEIGHBOR_DISTANCE).toBeGreaterThanOrEqual(43);
    expect(connectedSameColor(chain, chain[0])).toHaveLength(4);
  });

  it('drops a different-color island after its three-bubble bridge is removed', () => {
    const anchored = bubble(20, 55, 0);
    const bridge = [bubble(63, 55, 1), bubble(106, 55, 1), bubble(149, 55, 1)];
    const island = [bubble(149, 92, 2), bubble(192, 92, 2)];
    const remaining = [anchored, ...island];
    expect(connectedSameColor([anchored, ...bridge, ...island], bridge[0])).toHaveLength(3);
    expect(findUnsupported(remaining)).toEqual(island);
  });

  it('keeps an island supported by a diagonal hex neighbour', () => {
    const top = bubble(20, 55, 0);
    const diagonal = bubble(52, 82, 2);
    expect(Math.hypot(top.x - diagonal.x, top.y - diagonal.y)).toBeLessThanOrEqual(NEIGHBOR_DISTANCE);
    expect(findUnsupported([top, diagonal])).toEqual([]);
  });
});

describe('bubble aim guide', () => {
  it('runs straight up to the bubble it will stick to', () => {
    const path = traceShot([bubble(180, 55, 0)], 0);
    expect(path).toHaveLength(2);
    expect(path[0]).toEqual(LAUNCHER);
    expect(path[1].x).toBeCloseTo(180);
    expect(path[1].y).toBeGreaterThan(55 + 30);
  });

  it('shows the wall bounce for a steep shot', () => {
    const path = traceShot([], -1.2);
    expect(path.length).toBeGreaterThan(2);
    expect(path[1].x).toBeLessThan(18);
    expect(path[path.length - 1].x).toBeGreaterThan(path[1].x);
  });
});
