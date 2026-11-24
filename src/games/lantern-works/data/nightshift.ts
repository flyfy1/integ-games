import { parseSpec } from '../goods';
import type { LevelDef, Order, PartKind } from '../types';

/**
 * Night Shift: the order queue. Orders arrive on a seeded queue (the Daily Order uses the date as the seed), each
 * for a few lanterns at one of the two stalls, with a patience bar measured in beats. They get harder as the shift
 * goes on: plain shells first, then coloured lanterns, then lit, mixed-colour and 福 lanterns.
 */
export const FIRST_ORDER = 4;
export const MAX_ORDERS = 3;
export const ORDER_GAP = (served: number) => Math.max(30, 70 - served * 3);

export const TIERS: string[][] = [
  ['shell round', 'shell square', 'lantern round', 'lantern square'],
  ['lantern red', 'lantern yellow', 'lantern blue', 'lantern lotus', 'shell red', 'shell blue'],
  ['lantern lit', 'lantern orange', 'lantern green', 'lantern purple', 'lantern red lit', 'lantern lotus yellow'],
  ['lantern fu red', 'lantern blue lit', 'lantern orange lit', 'lantern square green lit', 'lantern purple fu']
];

/** Can a workshop whose tray holds these parts make this good from the Night Shift chutes (paper, hoops, candles)? */
export function makeable(good: string, tray: LevelDef['tray']): boolean {
  const has = (k: PartKind) => tray[k] !== undefined;
  const s = parseSpec(good);
  if (!has('folder')) return false;
  if (s.kind === 'lantern' && !has('joiner')) return false;
  if (s.color && s.color !== 'plain' && (!has('vat') || (['orange', 'green', 'purple'].includes(s.color) && !has('mixer')))) return false;
  if (s.lit && !has('wick')) return false;
  if (s.stamp && !has('stamp')) return false;
  return true;
}

/**
 * The next order. `tray` limits the queue to goods the shift's tray can make (Night Shift only offers the parts of
 * cleared chapters); a tier with nothing makeable falls back to the one below. With a full tray (the Daily Order)
 * every good is makeable, so the draws and the shared queue are exactly what they were.
 */
export function nextOrder(rng: () => number, index: number, beat: number, id: number, stall: number, tray?: LevelDef['tray']): Order {
  const top = Math.min(TIERS.length - 1, Math.floor(index / 3));
  // Mostly the newest tier, sometimes an easier one so the board's older lines stay useful.
  let tier = rng() < 0.6 ? top : Math.floor(rng() * (top + 1));
  const poolOf = (k: number) => (tray ? TIERS[k].filter(g => makeable(g, tray)) : TIERS[k]);
  let pool = poolOf(tier);
  while (!pool.length && tier > 0) pool = poolOf(--tier);
  const good = pool[Math.floor(rng() * pool.length)];
  const n = 2 + Math.floor(rng() * (tier >= 2 ? 2 : 3));
  return { id, good, n, got: 0, born: beat, patience: 70 + n * 16 + tier * 22, stall, value: n * (10 + tier * 6) };
}
