/** Solo Tour / 巡回赛: twelve fixed stops, each an arena, a twist, a bot with a personality and a star goal. Pure data and rules. */
import type { BotStyle } from './bot';

export type TourGoal = 'hearts' | 'fast' | 'pit' | 'power';
export type TourStop = { arena: string; twist: string; style: BotStyle; skill: number; goal: TourGoal };

/** Rounds to win a tour match (best of three). */
export const TOUR_TARGET = 2;
/** The "quick" goal: win a round inside this many seconds. */
export const FAST_ROUND = 20;

export const TOUR: readonly TourStop[] = [
  { arena: 'garden', twist: 'classic', style: 'camper', skill: 0, goal: 'hearts' },
  { arena: 'pinball', twist: 'rubber', style: 'bouncer', skill: 0, goal: 'fast' },
  { arena: 'volcano', twist: 'pow', style: 'rammer', skill: 0, goal: 'pit' },
  { arena: 'rink', twist: 'turbo', style: 'rammer', skill: 1, goal: 'pit' },
  { arena: 'lab', twist: 'crates', style: 'camper', skill: 1, goal: 'power' },
  { arena: 'mirrorhall', twist: 'moon', style: 'bouncer', skill: 1, goal: 'hearts' },
  { arena: 'bridges', twist: 'mirror', style: 'rammer', skill: 1, goal: 'pit' },
  { arena: 'factory', twist: 'bigduck', style: 'camper', skill: 2, goal: 'fast' },
  { arena: 'bumperrink', twist: 'thief', style: 'bouncer', skill: 1, goal: 'hearts' },
  { arena: 'warehouse', twist: 'fog', style: 'camper', skill: 2, goal: 'power' },
  { arena: 'volcano', twist: 'crumble', style: 'rammer', skill: 2, goal: 'pit' },
  { arena: 'mirrorhall', twist: 'tiny', style: 'bouncer', skill: 3, goal: 'fast' }
];

export const BOT_NAMES: Record<BotStyle, readonly [string, string]> = {
  camper: ['The Camper', '蹲点王'],
  rammer: ['The Rammer', '莽撞王'],
  bouncer: ['The Bouncer', '弹墙王']
};
export const BOT_BLURB: Record<BotStyle, readonly [string, string]> = {
  camper: ['digs in at home and banks shots off the walls', '守在老家，专打反弹球'],
  rammer: ['charges straight at you and dashes on sight', '一看见你就冲过来撞'],
  bouncer: ['keeps its distance and plays the walls', '保持距离，最会打墙'],
};
export const GOAL_TEXT: Record<TourGoal, readonly [string, string]> = {
  hearts: ['Win a round without losing a heart', '一局里一颗心都不丢'],
  fast: [`Win a round in under ${FAST_ROUND} seconds`, `${FAST_ROUND} 秒内拿下一局`],
  pit: ['Knock the bot into a pit or the lava', '把电脑撞进坑里或岩浆'],
  power: ['Win a round after grabbing a power-up', '吃到道具后拿下一局']
};

/** What happened in one round, as far as the star goals care. */
export type RoundStats = { won: boolean; heroHp: number; heroMax: number; time: number; botFell: boolean; grabbed: boolean };

export function goalMet(goal: TourGoal, round: RoundStats): boolean {
  if (!round.won) return false;
  if (goal === 'hearts') return round.heroHp >= round.heroMax;
  if (goal === 'fast') return round.time <= FAST_ROUND;
  if (goal === 'pit') return round.botFell;
  return round.grabbed;
}

/** Stars for a finished stop: win the match, win it without dropping a round, and meet the stop's goal in a won round. */
export function tourStars(stop: TourStop, rounds: readonly RoundStats[], matchWon: boolean): [boolean, boolean, boolean] {
  if (!matchWon) return [false, false, false];
  return [true, rounds.every((round) => round.won), rounds.some((round) => goalMet(stop.goal, round))];
}

/** Stop 1 is always open; every later stop opens when the one before it has been won. */
export const tourUnlocked = (stars: readonly number[], index: number) => index === 0 || (stars[index - 1] ?? 0) > 0;
