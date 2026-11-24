import type { Order } from '../types';

/**
 * Night Shift: the order queue. Orders arrive on a seeded queue (the Daily Order uses the date as the seed), each
 * for a few lanterns at one of the two stalls, with a patience bar measured in beats. They get harder as the shift
 * goes on: plain shells first, then coloured lanterns, then lit, mixed-colour and 福 lanterns.
 */
export const FIRST_ORDER = 4;
export const MAX_ORDERS = 3;
export const ORDER_GAP = (served: number) => Math.max(30, 70 - served * 3);

const TIERS: string[][] = [
  ['shell round', 'shell square', 'lantern round', 'lantern square'],
  ['lantern red', 'lantern yellow', 'lantern blue', 'lantern lotus', 'shell red', 'shell blue'],
  ['lantern lit', 'lantern orange', 'lantern green', 'lantern purple', 'lantern red lit', 'lantern lotus yellow'],
  ['lantern fu red', 'lantern blue lit', 'lantern orange lit', 'lantern square green lit', 'lantern purple fu']
];

export function nextOrder(rng: () => number, index: number, beat: number, id: number, stall: number): Order {
  const top = Math.min(TIERS.length - 1, Math.floor(index / 3));
  // Mostly the newest tier, sometimes an easier one so the board's older lines stay useful.
  const tier = rng() < 0.6 ? top : Math.floor(rng() * (top + 1));
  const pool = TIERS[tier];
  const good = pool[Math.floor(rng() * pool.length)];
  const n = 2 + Math.floor(rng() * (tier >= 2 ? 2 : 3));
  return { id, good, n, got: 0, born: beat, patience: 70 + n * 16 + tier * 22, stall, value: n * (10 + tier * 6) };
}
