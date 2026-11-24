import type { LevelDef } from '../types';
import { LEVELS } from './levels';

/**
 * Chef's Challenge: once a campaign night is won, it can be replayed with a restricted kit for a fourth star.
 * Two restrictions, alone or together: a smaller hand (`slots` cards) and no tier upgrades during the night
 * (permanent upgrades from the shop still apply, so the shop keeps a late purpose). Always on Standard, no Granny.
 *
 * Each night's rule is the hardest of "3 cards + no upgrades", "4 cards + no upgrades", "3 cards", "4 cards" and
 * "no upgrades" that the savvy autoplay bot still wins at least half the time with a sensible hand and no shop
 * upgrades (measured with 8 seeds; see tests/midnight-kitchen-challenges.test.ts for the pinned sample).
 */
export type ChefChallenge = { slots?: number; noUpgrades?: boolean };

export const CHALLENGES: Record<string, ChefChallenge> = {
  // The first lesson's hand is fixed at two cards, so its challenge is just "no upgrades".
  'c1-1': { noUpgrades: true },
  'c1-2': { slots: 3, noUpgrades: true }, 'c1-3': { slots: 3, noUpgrades: true }, 'c1-4': { slots: 3, noUpgrades: true }, 'c1-5': { slots: 3, noUpgrades: true },
  'c2-1': { slots: 3, noUpgrades: true }, 'c2-2': { slots: 3, noUpgrades: true }, 'c2-3': { slots: 3, noUpgrades: true }, 'c2-4': { slots: 4, noUpgrades: true }, 'c2-5': { slots: 3, noUpgrades: true },
  'c3-1': { slots: 3, noUpgrades: true }, 'c3-2': { slots: 3, noUpgrades: true }, 'c3-3': { slots: 4, noUpgrades: true }, 'c3-4': { slots: 4, noUpgrades: true },
  // The Stove boss needs its upgrades (no hand without them came close), so it is a three-card night instead.
  'c3-5': { slots: 3 },
  'c4-1': { slots: 3, noUpgrades: true }, 'c4-2': { slots: 3, noUpgrades: true }, 'c4-3': { slots: 4, noUpgrades: true }, 'c4-4': { slots: 3, noUpgrades: true }, 'c4-5': { slots: 3, noUpgrades: true },
  'c5-1': { slots: 3, noUpgrades: true }, 'c5-2': { slots: 3, noUpgrades: true }, 'c5-3': { slots: 3, noUpgrades: true }, 'c5-4': { slots: 3, noUpgrades: true }, 'c5-5': { slots: 3, noUpgrades: true }
};

/** Crumbs for the first win of a night's Chef's Challenge. */
export const CRUMBS_CHALLENGE = 40;

export const challengeOf = (levelId: string): ChefChallenge | undefined => (LEVELS[levelId] ? CHALLENGES[levelId] : undefined);

/**
 * The night as its challenge plays it: same id, board and waves, the smaller hand and the no-upgrades rule, and no
 * tutorial, story scenes or "new" tags. One place builds it for the game and the bot proofs alike.
 */
export function challengeLevel(level: LevelDef): LevelDef | null {
  const rule = challengeOf(level.id);
  if (!rule) return null;
  return {
    ...level,
    slots: level.cards ? level.slots : Math.min(level.slots, rule.slots ?? level.slots),
    rules: { ...level.rules, ...(rule.noUpgrades ? { noUpgrades: true } : {}) },
    // A replay: nothing is new any more, so the suggested hand is about tonight's pests, not tonight's lesson.
    tutorial: undefined, intro: undefined, outro: undefined, introduces: undefined
  };
}
