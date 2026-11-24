/** Level data and the pure progress rules for Pad Pals. Nobody can lose a level: misses only cost stars. */
import type { ButtonName } from '../_shared/gamepad-kit';

export type Difficulty = 0 | 1 | 2;
export const DIFFICULTIES: readonly Difficulty[] = [0, 1, 2];
export const DIFFICULTY_ICONS = ['🐣', '🐰', '🐯'] as const;

export type LevelKind = 'press' | 'maze' | 'roam' | 'flick' | 'catch' | 'hold' | 'simon' | 'aim' | 'hop' | 'rhythm' | 'boss' | 'tug' | 'combo' | 'carry' | 'race';
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
  { id: 'simon', kind: 'simon', world: 2, icon: '🦜', goal: [3, 4, 5], wait: [Infinity, Infinity, 6], buttons: FACE },
  { id: 'aim', kind: 'aim', world: 3, icon: '🎯', goal: [5, 8, 12], wait: [Infinity, Infinity, Infinity] },
  { id: 'hop', kind: 'hop', world: 3, icon: '🦘', goal: [5, 8, 12], wait: [Infinity, Infinity, Infinity] },
  { id: 'rhythm', kind: 'rhythm', world: 3, icon: '🎵', goal: [10, 16, 24], wait: [Infinity, 1.8, 1.1], buttons: FACE },
  { id: 'boss', kind: 'boss', world: 3, icon: '🤖', goal: [8, 12, 18], wait: [Infinity, 3.5, 2.2] }
];
/**
 * World 5, Combos: two inputs at once (stick plus button, hold plus tap, two sticks). A bonus world after the journey:
 * it opens once the robot has a star, and it is not part of "Controller Master", so nobody loses a trophy they earned.
 */
export const COMBO_LEVELS: readonly Level[] = [
  { id: 'rocket', kind: 'combo', world: 4, icon: '🚀', goal: [4, 6, 8], wait: [Infinity, Infinity, 5] },
  { id: 'surf', kind: 'combo', world: 4, icon: '🏄', goal: [4, 6, 8], wait: [Infinity, 5, 3.2] },
  { id: 'paint', kind: 'combo', world: 4, icon: '🎨', goal: [4, 6, 8], wait: [Infinity, Infinity, 4] },
  { id: 'disco', kind: 'combo', world: 4, icon: '🪩', goal: [5, 8, 10], wait: [Infinity, 5, 3.2] }
];
export const COMBO_WORLD = 4;
/** Open from the start so a first-time family can play together straight away. */
export const PARTY_LEVEL: Level = { id: 'tug', kind: 'tug', world: 5, icon: '🪢', goal: [1, 1, 1], wait: [1.3, 0.95, 0.6], buttons: FACE };
/** Co-op: keep a balloon up together all the way home. Alone, the bunny takes the other side. */
export const CARRY_LEVEL: Level = { id: 'carry', kind: 'carry', world: 5, icon: '🎈', goal: [10, 14, 18], wait: [Infinity, Infinity, Infinity] };
/** Race: press the glowing button to run; it changes every few steps. Alone, the bunny runs at the chosen pace. */
export const RACE_LEVEL: Level = { id: 'race', kind: 'race', world: 5, icon: '🏁', goal: [16, 22, 28], wait: [0.8, 0.5, 0.32], buttons: FACE };
export const PARTY_LEVELS: readonly Level[] = [PARTY_LEVEL, CARRY_LEVEL, RACE_LEVEL];
export const ALL_LEVELS: readonly Level[] = [...LEVELS, ...COMBO_LEVELS, ...PARTY_LEVELS];
export const WORLD_COUNT = 5;
export const isParty = (level: Level) => PARTY_LEVELS.includes(level);
/** A Surprise Remix round: the same level with half its usual goal, never less than two. */
export const shortLevel = (level: Level): Level => ({ ...level, goal: level.goal.map((n) => Math.max(2, Math.ceil(n / 2))) as unknown as Level['goal'] });

/** `combo` counts the combo levels opened beyond the first (absent in saves from before World 5). */
export type Progress = { stars: Record<string, number>; open: number; combo?: number };
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

/** World 5 opens once the journey's last level (the robot) has a star on any difficulty. */
export const combosOpen = (progress: Progress) => levelStars(progress, LEVELS[LEVELS.length - 1].id) > 0;
export function isOpen(progress: Progress, level: Level) {
  if (isParty(level)) return true;
  const combo = COMBO_LEVELS.indexOf(level);
  if (combo >= 0) return combosOpen(progress) && combo <= (progress.combo ?? 0);
  return LEVELS.indexOf(level) <= progress.open;
}

/** Clearing a level on any difficulty opens the next. A skip opens it too, without any stars. */
export function recordResult(progress: Progress, level: Level, difficulty: Difficulty, stars: number): Progress {
  const index = LEVELS.indexOf(level), combo = COMBO_LEVELS.indexOf(level), id = key(level.id, difficulty);
  const next: Progress = {
    stars: stars ? { ...progress.stars, [id]: Math.max(progress.stars[id] ?? 0, stars) } : progress.stars,
    open: index < 0 ? progress.open : Math.max(progress.open, Math.min(LEVELS.length - 1, index + 1))
  };
  const comboOpen = combo < 0 ? progress.combo : Math.max(progress.combo ?? 0, Math.min(COMBO_LEVELS.length - 1, combo + 1));
  if (comboOpen !== undefined) next.combo = comboOpen;
  return next;
}

/** Harder difficulties are worth more, so a leaderboard score keeps growing as a child moves up. */
export const totalScore = (progress: Progress) => ALL_LEVELS.reduce((sum, level) => sum + DIFFICULTIES.reduce<number>((inner, d) => inner + bestStars(progress, level.id, d) * (d + 1) * 10, 0), 0);
export const maxScore = ALL_LEVELS.length * 3 * (1 + 2 + 3) * 10;

/** Every star ever earned, over all levels and difficulties. This is the number shown on the map. */
export const starCount = (progress: Progress) => ALL_LEVELS.reduce((sum, level) => sum + DIFFICULTIES.reduce<number>((inner, d) => inner + bestStars(progress, level.id, d), 0), 0);

/** Stars buy stickers: three stars, the price of one clean level, for each. The book is full well before every star is found. */
export const STICKERS = ['🦊', '🐼', '🦄', '🐙', '🦖', '🐳', '🦋', '🐞', '🚀', '🌈', '🍦', '🎸', '🐧', '🦁', '🐢', '🍓', '⚽', '🚂', '🐝', '🎨', '🦉', '🍩', '🪁', '👑', '🐬', '🦒', '🌻', '🍉', '🚁', '🐸', '🧁', '🦕'] as const;
export const STARS_PER_STICKER = 3;
export const stickerCount = (progress: Progress) => Math.min(STICKERS.length, Math.floor(starCount(progress) / STARS_PER_STICKER));
/** Stars still missing for the next sticker, or 0 when the book is full. */
export const starsToNextSticker = (progress: Progress) => (stickerCount(progress) >= STICKERS.length ? 0 : STARS_PER_STICKER - (starCount(progress) % STARS_PER_STICKER));

/** A difficulty is mastered when every level of the journey has at least one star on it. The party level is optional. */
export const isMastered = (progress: Progress, difficulty: Difficulty) => LEVELS.every((level) => bestStars(progress, level.id, difficulty) > 0);
export const masteredCount = (progress: Progress) => DIFFICULTIES.filter((d) => isMastered(progress, d)).length;
