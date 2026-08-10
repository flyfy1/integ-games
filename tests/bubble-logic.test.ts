import { describe, expect, it } from 'vitest';
import { connectedSameColor, findUnsupported, NEIGHBOR_DISTANCE, type Bubble } from '../src/games/bubble';

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
