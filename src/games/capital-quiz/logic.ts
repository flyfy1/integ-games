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
