import { COUNTRIES, SHAPE_COUNTRIES, type CountryEntry, type Difficulty } from './data';

/** capital: country -> capital; flag: flag -> country; shape: outline -> country. */
export type Mode = 'capital' | 'flag' | 'shape';
export const MODES: readonly Mode[] = ['capital', 'flag', 'shape'];
export const isMode = (m: unknown): m is Mode => m === 'capital' || m === 'flag' || m === 'shape';
/** Countries a mode may ask about. */
export const poolFor = (mode: Mode): readonly CountryEntry[] => (mode === 'shape' ? SHAPE_COUNTRIES : COUNTRIES);
/** The text of the correct option. */
export const answerOf = (entry: CountryEntry, mode: Mode): string => (mode === 'capital' ? entry.capital : entry.country);

export type Question = { entry: CountryEntry; options: string[]; answerIndex: number };

export const ROUND_LENGTH = 10;
/** Difficulty ramp across a round: 3 easy, 4 medium, 3 hard. */
export const ROUND_PLAN: readonly Difficulty[] = [1, 1, 1, 2, 2, 2, 2, 3, 3, 3];
export const BASE_POINTS: Record<Difficulty, number> = { 1: 100, 2: 150, 3: 200 };
export const STREAK_STEP = 25;
export const STREAK_CAP = 100;

/** Seconds allowed per question: easy questions get the most reading time, hard ones the least (still ample for 4 options on a phone). */
export const TIME_LIMIT_MS: Record<Difficulty, number> = { 1: 20000, 2: 16000, 3: 12000 };
/** Share of the base points still on offer when the clock is about to run out. */
export const MIN_TIME_FACTOR = 0.4;
/** The first slice of the clock is free so reading the question never costs points. */
export const TIME_GRACE = 0.15;

/** Base points left after `remainingMs` of the question's clock: full during the grace slice, then falling linearly to MIN_TIME_FACTOR at zero. */
export function timedBase(difficulty: Difficulty, remainingMs: number): number {
  const limit = TIME_LIMIT_MS[difficulty];
  const frac = Math.max(0, Math.min(1, remainingMs / limit));
  const live = Math.min(1, frac / (1 - TIME_GRACE));
  return Math.round(BASE_POINTS[difficulty] * (MIN_TIME_FACTOR + (1 - MIN_TIME_FACTOR) * live));
}

/** Points for a correct answer given at `remainingMs`: time-decayed base plus the unchanged streak bonus. */
export function timedPointsFor(difficulty: Difficulty, streak: number, remainingMs: number): number {
  return pointsFor(difficulty, streak) - BASE_POINTS[difficulty] + timedBase(difficulty, remainingMs);
}

/**
 * A question's countdown. It only advances while running, and a single step is capped so a frozen or
 * throttled tab can never burn time the player could not see.
 */
export const MAX_CLOCK_STEP_MS = 250;
export class QuestionClock {
  private spent = 0;
  private last = 0;
  running = false;
  constructor(readonly limitMs: number) {}
  /** Fold the time since the previous call into the clock (no-op while paused). */
  tick(now: number) {
    if (this.running) this.spent = Math.min(this.limitMs, this.spent + Math.max(0, Math.min(MAX_CLOCK_STEP_MS, now - this.last)));
    this.last = now;
  }
  resume(now: number) { if (!this.running) { this.last = now; this.running = true; } }
  pause(now: number) { this.tick(now); this.running = false; }
  get remainingMs() { return this.limitMs - this.spent; }
  get expired() { return this.spent >= this.limitMs; }
}

type Random = () => number;
const pick = (rand: Random, count: number) => Math.floor(rand() * count);

export function shuffle<T>(items: readonly T[], rand: Random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) { const j = pick(rand, i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/** Points for a correct answer; `streak` counts this answer (first correct in a row = 1). */
export function pointsFor(difficulty: Difficulty, streak: number): number {
  return BASE_POINTS[difficulty] + Math.min(STREAK_CAP, STREAK_STEP * Math.max(0, streak - 1));
}

/** Correct answer + 3 distractors (real answers of other countries), 2 from the same region when possible. */
export function buildQuestion(entry: CountryEntry, rand: Random, pool: readonly CountryEntry[] = COUNTRIES, mode: Mode = 'capital'): Question {
  const others = pool.filter((c) => c.country !== entry.country && c.capital !== entry.capital);
  const near = shuffle(others.filter((c) => c.region === entry.region), rand).slice(0, 2);
  const used = new Set(near.map((c) => c.country));
  const far = shuffle(others.filter((c) => !used.has(c.country)), rand);
  const distractors = [...near, ...far].slice(0, 3).map((c) => answerOf(c, mode));
  const correct = answerOf(entry, mode);
  const options = shuffle([correct, ...distractors], rand);
  return { entry, options, answerIndex: options.indexOf(correct) };
}

/** A round of unique countries following ROUND_PLAN, falling back to neighbouring difficulties if a tier runs dry. Distractors come from `distractors`. */
export function buildRound(rand: Random, pool: readonly CountryEntry[] = COUNTRIES, mode: Mode = 'capital', distractors: readonly CountryEntry[] = COUNTRIES): Question[] {
  const taken = new Set<string>();
  return ROUND_PLAN.map((want) => {
    const order = [want, ...([1, 2, 3] as Difficulty[]).filter((d) => d !== want).sort((a, b) => Math.abs(a - want) - Math.abs(b - want))];
    for (const d of order) {
      const candidates = pool.filter((c) => c.difficulty === d && !taken.has(c.country));
      if (candidates.length) { const entry = candidates[pick(rand, candidates.length)]; taken.add(entry.country); return buildQuestion(entry, rand, distractors, mode); }
    }
    throw new Error('Geo Quiz pool is too small for a round');
  });
}
