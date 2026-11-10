import { COUNTRIES, SHAPE_COUNTRIES, type CountryEntry, type Difficulty } from './data';

/** capital: country -> capital; flag: flag -> country; shape: outline -> country. */
export type Mode = 'capital' | 'flag' | 'shape';
export const MODES: readonly Mode[] = ['capital', 'flag', 'shape'];
export const isMode = (m: unknown): m is Mode => m === 'capital' || m === 'flag' || m === 'shape';
/** Countries a mode may ask about. */
export const poolFor = (mode: Mode): readonly CountryEntry[] => (mode === 'shape' ? SHAPE_COUNTRIES : COUNTRIES);
/** The text of the correct option. */
export const answerOf = (entry: CountryEntry, mode: Mode): string => (mode === 'capital' ? entry.capital : entry.country);

/** What a round asks: one kind of question throughout, or 'mix' where every question brings its own kind. */
export type Play = Mode | 'mix';
export const PLAYS: readonly Play[] = ['capital', 'flag', 'shape', 'mix'];
export const isPlay = (p: unknown): p is Play => p === 'mix' || isMode(p);

/** `kind` is only set in a mixed round; everywhere else the round's mode is the kind of every question. */
export type Question = { entry: CountryEntry; options: string[]; answerIndex: number; kind?: Mode };

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
export function buildRound(rand: Random, pool: readonly CountryEntry[] = COUNTRIES, mode: Mode = 'capital', distractors: readonly CountryEntry[] = COUNTRIES, weigh?: Weigh): Question[] {
  const taken = new Set<string>();
  return ROUND_PLAN.map((want) => {
    const entry = draw(rand, pool, want, taken, weigh && ((c) => weigh(c, mode)));
    return buildQuestion(entry, rand, distractors, mode);
  });
}

/** A weight per country and question kind; heavier countries are asked more often. */
export type Weigh = (entry: CountryEntry, mode: Mode) => number;

/** One not-yet-taken country of the wanted difficulty (neighbouring difficulties if that tier ran dry), marked as taken. Uniform unless `weight` is given. */
function draw(rand: Random, pool: readonly CountryEntry[], want: Difficulty, taken: Set<string>, weight?: (entry: CountryEntry) => number): CountryEntry {
  const order = [want, ...([1, 2, 3] as Difficulty[]).filter((d) => d !== want).sort((a, b) => Math.abs(a - want) - Math.abs(b - want))];
  for (const d of order) {
    const candidates = pool.filter((c) => c.difficulty === d && !taken.has(c.country));
    if (!candidates.length) continue;
    let entry = candidates[0];
    if (!weight) entry = candidates[pick(rand, candidates.length)];
    else {
      const weights = candidates.map((c) => Math.max(0, weight(c))), total = weights.reduce((a, b) => a + b, 0);
      let roll = rand() * total, at = total > 0 ? candidates.length - 1 : pick(rand, candidates.length);
      if (total > 0) for (let i = 0; i < candidates.length; i++) { roll -= weights[i]; if (roll < 0) { at = i; break; } }
      entry = candidates[at];
    }
    taken.add(entry.country); return entry;
  }
  throw new Error('Geo Quiz pool is too small for a round');
}

/** A round that mixes the three kinds (each at least three times) along the same easy-to-hard ramp, with ten different countries. */
export function buildMixRound(rand: Random, weigh?: Weigh): Question[] {
  const kinds = shuffle([...MODES, ...MODES, ...MODES, MODES[pick(rand, MODES.length)]], rand);
  const taken = new Set<string>();
  return ROUND_PLAN.map((want, i) => {
    const kind = kinds[i], entry = draw(rand, poolFor(kind), want, taken, weigh && ((c) => weigh(c, kind)));
    return { ...buildQuestion(entry, rand, COUNTRIES, kind), kind };
  });
}

/**
 * The player's atlas: per kind, the ISO codes answered correctly at least once. The same shape is used for the
 * "review" list (missed and not yet put right), which makes those countries come back sooner.
 */
export type Atlas = Record<Mode, string[]>;
export const emptyAtlas = (): Atlas => ({ capital: [], flag: [], shape: [] });
/** A stored atlas with anything unknown, duplicated or malformed dropped. */
export function cleanAtlas(raw: unknown): Atlas {
  const out = emptyAtlas(), src = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<Mode, unknown>>;
  for (const mode of MODES) {
    const valid = new Set(poolFor(mode).map((c) => c.iso)), list = src[mode];
    if (Array.isArray(list)) out[mode] = [...new Set(list.filter((x): x is string => typeof x === 'string' && valid.has(x)))];
  }
  return out;
}
export const atlasTotal = (mode: Mode): number => poolFor(mode).length;
/** Missed-and-unresolved countries come back about six times as often as ones already in the atlas, new ones three times. */
export const WEIGHTS = { review: 6, fresh: 3, known: 1 } as const;
export const weigher = (known: Atlas, review: Atlas): Weigh => (entry, mode) => (review[mode].includes(entry.iso) ? WEIGHTS.review : known[mode].includes(entry.iso) ? WEIGHTS.known : WEIGHTS.fresh);
