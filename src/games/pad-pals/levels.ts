/** Level data and the pure progress rules for Pad Pals. Nobody can lose a level: misses only cost stars. */
import type { ButtonName } from '../_shared/gamepad-kit';

export type Difficulty = 0 | 1 | 2;
export const DIFFICULTIES: readonly Difficulty[] = [0, 1, 2];
export const DIFFICULTY_ICONS = ['🐣', '🐰', '🐯'] as const;

export type LevelKind = 'press' | 'maze' | 'roam' | 'flick' | 'catch' | 'hold' | 'simon' | 'aim' | 'hop' | 'rhythm' | 'boss' | 'tug';
export type Level = {
  id: string; kind: LevelKind; world: number; icon: string;
  /** What to do, per difficulty, usually a number of targets. */
  goal: readonly [number, number, number];
  /** Seconds a target waits before it counts as a miss. Infinity lets the player take all the time they need. */
  wait: readonly [number, number, number];
  buttons?: readonly ButtonName[];
};

const FACE: readonly ButtonName[] = ['south', 'east', 'west', 'north'];
export const LEVELS: readonly Level[] = [
  { id: 'hello', kind: 'press', world: 0, icon: '🌷', goal: [5, 8, 12], wait: [Infinity, Infinity, 2] },
  { id: 'two', kind: 'press', world: 0, icon: '🐸', goal: [6, 10, 14], wait: [Infinity, 3, 1.6], buttons: ['south', 'east'] },
  { id: 'mole', kind: 'press', world: 0, icon: '🐹', goal: [8, 12, 18], wait: [Infinity, 2.4, 1.2], buttons: FACE },
  { id: 'maze', kind: 'maze', world: 1, icon: '🥕', goal: [3, 5, 7], wait: [Infinity, Infinity, Infinity] },
  { id: 'roam', kind: 'roam', world: 1, icon: '⭐', goal: [6, 10, 14], wait: [Infinity, Infinity, Infinity] },
  { id: 'flick', kind: 'flick', world: 1, icon: '🎈', goal: [6, 10, 14], wait: [Infinity, 3, 1.5] },
  { id: 'catch', kind: 'catch', world: 2, icon: '🍎', goal: [6, 10, 14], wait: [Infinity, 2.2, 1.5], buttons: ['l1', 'r1'] },
  { id: 'hold', kind: 'hold', world: 2, icon: '🎀', goal: [3, 5, 7], wait: [Infinity, Infinity, Infinity], buttons: ['l2', 'r2'] },
  { id: 'simon', kind: 'simon', world: 2, icon: '🦜', goal: [3, 4, 6], wait: [Infinity, Infinity, 6], buttons: FACE },
  { id: 'aim', kind: 'aim', world: 3, icon: '🎯', goal: [5, 8, 12], wait: [Infinity, Infinity, Infinity] },
  { id: 'hop', kind: 'hop', world: 3, icon: '🦘', goal: [5, 8, 12], wait: [Infinity, Infinity, Infinity] },
  { id: 'rhythm', kind: 'rhythm', world: 3, icon: '🎵', goal: [10, 16, 24], wait: [Infinity, 1.8, 1.1], buttons: FACE },
  { id: 'boss', kind: 'boss', world: 3, icon: '🤖', goal: [8, 12, 18], wait: [Infinity, 3.5, 2.2] }
];
/** Open from the start so a first-time family can play together straight away. */
export const PARTY_LEVEL: Level = { id: 'tug', kind: 'tug', world: 4, icon: '🪢', goal: [1, 1, 1], wait: [1.3, 0.95, 0.6], buttons: FACE };
export const ALL_LEVELS: readonly Level[] = [...LEVELS, PARTY_LEVEL];
export const WORLD_COUNT = 4;

export type Progress = { stars: Record<string, number>; open: number };
export const emptyProgress = (): Progress => ({ stars: {}, open: 0 });
const key = (id: string, difficulty: Difficulty) => `${id}:${difficulty}`;

export function isProgress(value: unknown): value is Progress {
  const candidate = value as Progress | null;
  return Boolean(candidate) && typeof candidate?.open === 'number' && typeof candidate?.stars === 'object' && candidate.stars !== null;
}

export function starsFor(misses: number, goal: number): 1 | 2 | 3 {
  const rate = misses / Math.max(1, goal);
  if (rate <= 0.1) return 3;
  return rate <= 0.4 ? 2 : 1;
}

export const bestStars = (progress: Progress, id: string, difficulty: Difficulty) => progress.stars[key(id, difficulty)] ?? 0;
export const levelStars = (progress: Progress, id: string) => Math.max(...DIFFICULTIES.map((d) => bestStars(progress, id, d)));

export function isOpen(progress: Progress, level: Level) {
  if (level.kind === 'tug') return true;
  return LEVELS.indexOf(level) <= progress.open;
}

/** Clearing a level on any difficulty opens the next. A skip opens it too, without any stars. */
export function recordResult(progress: Progress, level: Level, difficulty: Difficulty, stars: number): Progress {
  const index = LEVELS.indexOf(level), id = key(level.id, difficulty);
  return {
    stars: stars ? { ...progress.stars, [id]: Math.max(progress.stars[id] ?? 0, stars) } : progress.stars,
    open: index < 0 ? progress.open : Math.max(progress.open, Math.min(LEVELS.length - 1, index + 1))
  };
}

/** Harder difficulties are worth more, so a leaderboard score keeps growing as a child moves up. */
export const totalScore = (progress: Progress) => ALL_LEVELS.reduce((sum, level) => sum + DIFFICULTIES.reduce<number>((inner, d) => inner + bestStars(progress, level.id, d) * (d + 1) * 10, 0), 0);
export const maxScore = ALL_LEVELS.length * 3 * (1 + 2 + 3) * 10;
