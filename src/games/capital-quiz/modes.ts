/**
 * Geo Quiz challenge modes (pure rules, no DOM): the border question kind, Daily Ten, the continent Journey,
 * the endless Blitz 60 / Survival stream, and forgiving type-in matching for capitals.
 */
import { COUNTRIES, type CountryEntry, type Difficulty, type Region } from './data';
import { BORDER_ROWS, UNSURE_PAIRS } from './borders';
import { NAMES_ZH } from './names-zh';
import { ROUND_PLAN, answerOf, poolFor, shuffle, type Kind, type Question } from './logic';

type Random = () => number;
const pick = (rand: Random, n: number) => Math.floor(rand() * n);
const byIso = new Map(COUNTRIES.map((c) => [c.iso, c]));

// ---------------------------------------------------------------------------------------------------------------
// Borders: "Which of these borders X?"

const NEIGHBOURS = new Map<string, readonly string[]>(Object.entries(BORDER_ROWS).map(([iso, row]) => [iso, row.split(' ')]));
const UNSURE = new Set(UNSURE_PAIRS);
const pairKey = (a: string, b: string) => [a, b].sort().join('-');
export const neighboursOf = (iso: string): readonly string[] => NEIGHBOURS.get(iso) ?? [];
export const isNeighbour = (a: string, b: string) => neighboursOf(a).includes(b);
/** Pairs that must never be offered as a wrong option: real neighbours and the pairs the sources disagree on. */
export const mightBorder = (a: string, b: string) => a === b || isNeighbour(a, b) || UNSURE.has(pairKey(a, b));
/** Countries a border question can be asked about (at least one neighbour in the bank). */
export const BORDER_POOL: readonly CountryEntry[] = COUNTRIES.filter((c) => neighboursOf(c.iso).length > 0);

/** Options are country names; the right one is a random neighbour, the three others certainly do not touch X (two from its region when possible). */
export function buildBorderQuestion(entry: CountryEntry, rand: Random, nearCount = 2): Question {
  const near = neighboursOf(entry.iso), answer = byIso.get(near[pick(rand, near.length)])!;
  const safe = COUNTRIES.filter((c) => !mightBorder(entry.iso, c.iso));
  const distractors = pickDistractors(safe, entry.region, rand, nearCount).map((c) => c.country);
  const options = shuffle([answer.country, ...distractors], rand);
  return { entry, options, answerIndex: options.indexOf(answer.country), kind: 'border' };
}

function pickDistractors(others: readonly CountryEntry[], region: Region, rand: Random, nearCount: number): CountryEntry[] {
  const near = shuffle(others.filter((c) => c.region === region), rand).slice(0, nearCount);
  const used = new Set(near.map((c) => c.iso));
  return [...near, ...shuffle(others.filter((c) => !used.has(c.iso)), rand)].slice(0, 3);
}

/** A question of any kind with distractors from the whole bank, `nearCount` of them from the same region when possible. */
export function buildKindQuestion(entry: CountryEntry, kind: Kind, rand: Random, nearCount = 2): Question {
  if (kind === 'border') return buildBorderQuestion(entry, rand, nearCount);
  const others = COUNTRIES.filter((c) => c.country !== entry.country && c.capital !== entry.capital);
  const correct = answerOf(entry, kind), distractors = pickDistractors(others, entry.region, rand, nearCount).map((c) => answerOf(c, kind));
  const options = shuffle([correct, ...distractors], rand);
  return { entry, options, answerIndex: options.indexOf(correct), kind };
}

/** Which countries a kind may ask about. Outline entries carry the outline difficulty. */
export const kindPool = (kind: Kind): readonly CountryEntry[] => (kind === 'border' ? BORDER_POOL : poolFor(kind));
/** The option that is right, recomputed from stored options (used when a saved round comes back). */
export function answerIndexOf(entry: CountryEntry, kind: Kind, options: readonly string[]): number {
  if (kind !== 'border') return options.indexOf(answerOf(entry, kind));
  const hits = options.map((o, i) => [o, i] as const).filter(([o]) => { const c = COUNTRIES.find((x) => x.country === o); return !!c && isNeighbour(entry.iso, c.iso); });
  return hits.length === 1 ? hits[0][1] : -1;
}

// ---------------------------------------------------------------------------------------------------------------
// Slot-based rounds: each slot names a kind and a wanted difficulty.

export type Slot = { kind: Kind; want: Difficulty };
/** The usual mix for a challenge round: three capitals, three flags, two outlines and two border questions. */
export const CHALLENGE_KINDS: readonly Kind[] = ['capital', 'capital', 'capital', 'flag', 'flag', 'flag', 'shape', 'shape', 'border', 'border'];

const diffOrder = (want: Difficulty): Difficulty[] => [want, ...([1, 2, 3] as Difficulty[]).filter((d) => d !== want).sort((a, b) => Math.abs(a - want) - Math.abs(b - want))];

/**
 * Fill the slots in order. Each country is asked once while that is possible; a small pool (Oceania) then falls back to
 * new (country, kind) pairs and finally to another kind, so a round never fails to build.
 */
export function buildSlotRound(rand: Random, slots: readonly Slot[], region?: Region, nearCount = 2): Question[] {
  const countries = new Set<string>(), pairs = new Set<string>();
  const inRegion = (c: CountryEntry) => !region || c.region === region;
  const kindsByPreference = (k: Kind): Kind[] => [k, ...(['capital', 'flag', 'shape', 'border'] as Kind[]).filter((x) => x !== k)];
  return slots.map(({ kind, want }) => {
    for (const fresh of [true, false]) for (const k of kindsByPreference(kind)) for (const d of diffOrder(want)) {
      const candidates = kindPool(k).filter((c) => inRegion(c) && c.difficulty === d && !pairs.has(`${c.iso}:${k}`) && (!fresh || !countries.has(c.iso)));
      if (!candidates.length) continue;
      const entry = candidates[pick(rand, candidates.length)];
      countries.add(entry.iso); pairs.add(`${entry.iso}:${k}`);
      return buildKindQuestion(entry, k, rand, nearCount);
    }
    throw new Error('Geo Quiz: no question left for this round');
  });
}

/** Today's ten: the same for everyone on the date (the caller passes dailyRandom). No player history is used. */
export function buildDailyRound(rand: Random): Question[] {
  const kinds = shuffle(CHALLENGE_KINDS, rand);
  return buildSlotRound(rand, ROUND_PLAN.map((want, i) => ({ kind: kinds[i], want })));
}

// ---------------------------------------------------------------------------------------------------------------
// Journey: six continents, two stops and an exam each.

export const JOURNEY: readonly Region[] = ['Europe', 'North America', 'South America', 'Asia', 'Africa', 'Oceania'];
export const STOPS = 3;
/** The exam is the last stop of a continent and must be passed with this many right out of ten. */
export const EXAM_PASS = 8;
const STOP_PLANS: readonly (readonly Difficulty[])[] = [[1, 1, 1, 1, 1, 2, 2, 2, 2, 2], [1, 2, 2, 2, 2, 2, 3, 3, 3, 3], ROUND_PLAN];
export const isExam = (stop: number) => stop === STOPS - 1;

/** A stop of a continent: every question about that continent, wrong options mostly from it too. */
export function buildJourneyRound(rand: Random, region: Region, stop: number): Question[] {
  const kinds = shuffle(CHALLENGE_KINDS, rand), plan = STOP_PLANS[Math.max(0, Math.min(STOPS - 1, stop))];
  return buildSlotRound(rand, plan.map((want, i) => ({ kind: kinds[i], want })), region, 3);
}

/** Per continent: how many stops are cleared (0..3, 3 = stamped) and the best exam score in right answers. */
export type Journey = { cleared: Partial<Record<Region, number>>; bestExam: Partial<Record<Region, number>> };
export const emptyJourney = (): Journey => ({ cleared: {}, bestExam: {} });
export function cleanJourney(raw: unknown): Journey {
  const out = emptyJourney(), src = (raw && typeof raw === 'object' ? raw : {}) as Partial<Journey>;
  for (const r of JOURNEY) {
    const c = src.cleared?.[r], b = src.bestExam?.[r];
    if (typeof c === 'number' && Number.isFinite(c)) out.cleared[r] = Math.max(0, Math.min(STOPS, Math.floor(c)));
    if (typeof b === 'number' && Number.isFinite(b)) out.bestExam[r] = Math.max(0, Math.min(10, Math.floor(b)));
  }
  return out;
}
export const stampCount = (j: Journey) => JOURNEY.filter((r) => (j.cleared[r] ?? 0) >= STOPS).length;
/** A continent opens once the one before it is stamped. */
export const continentOpen = (j: Journey, region: Region) => { const i = JOURNEY.indexOf(region); return i <= 0 || (j.cleared[JOURNEY[i - 1]] ?? 0) >= STOPS; };
/** The next stop to play on an open continent (stops are taken in order; a stamped continent can replay its exam). */
export const nextStop = (j: Journey, region: Region) => Math.min(STOPS - 1, j.cleared[region] ?? 0);
/** Finishing a stop: the two travel stops clear on finishing, the exam only at EXAM_PASS right answers or more. */
export function recordStop(j: Journey, region: Region, stop: number, correct: number): { journey: Journey; passed: boolean; stamped: boolean } {
  const passed = !isExam(stop) || correct >= EXAM_PASS;
  const before = j.cleared[region] ?? 0, cleared = passed ? Math.max(before, stop + 1) : before;
  const bestExam = isExam(stop) ? { ...j.bestExam, [region]: Math.max(j.bestExam[region] ?? 0, correct) } : j.bestExam;
  return { journey: { cleared: { ...j.cleared, [region]: cleared }, bestExam }, passed, stamped: cleared >= STOPS && before < STOPS };
}

// ---------------------------------------------------------------------------------------------------------------
// Endless stream for Blitz 60 and Survival.

/** Difficulty climbs with the number of questions already asked. */
export const endlessWant = (n: number): Difficulty => (n < 5 ? 1 : n < 13 ? 2 : 3);
export const BLITZ_MS = 60_000;
/** A wrong answer in Blitz costs this much of the clock, so tapping at random never pays. */
export const BLITZ_PENALTY_MS = 3_000;
export const SURVIVAL_LIVES = 3;

/** The n-th question of an endless run. `asked` holds the ISO codes used so far; it is cleared when a tier runs dry. */
export function nextEndless(rand: Random, n: number, asked: Set<string>): Question {
  const want = endlessWant(n), kind = CHALLENGE_KINDS[pick(rand, CHALLENGE_KINDS.length)];
  for (const k of [kind, 'capital', 'flag'] as Kind[]) for (const d of diffOrder(want)) {
    const candidates = kindPool(k).filter((c) => c.difficulty === d && !asked.has(c.iso));
    if (!candidates.length) continue;
    const entry = candidates[pick(rand, candidates.length)];
    asked.add(entry.iso);
    return buildKindQuestion(entry, k, rand);
  }
  asked.clear();
  return nextEndless(rand, n, asked);
}

// ---------------------------------------------------------------------------------------------------------------
// Type-in capitals: forgiving matching.

/** Common alternative spellings and native names, by ISO code. Accents, case, spaces and punctuation are ignored anyway. */
export const CAPITAL_ALIASES: Readonly<Record<string, readonly string[]>> = {
  US: ['Washington', 'Washington DC', 'DC'], MX: ['Ciudad de Mexico', 'CDMX', 'Mexico'], UA: ['Kiev'], MN: ['Ulan Bator', 'Ulaan Baatar'],
  MM: ['Nay Pyi Taw', 'Naypyitaw', 'Nay Pyi Daw'], MD: ['Kishinev'], KZ: ['Nur-Sultan', 'Akmola'], TM: ['Ashkhabad'], IN: ['Delhi'],
  VN: ['Ha Noi'], MV: ['Male'], KW: ['Kuwait'], LU: ['Luxembourg'], GT: ['Guatemala'], PA: ['Panama'], DJ: ['Djibouti City'],
  SG: ['Singapore City'], IT: ['Roma'], CZ: ['Praha'], PL: ['Warszawa'], AT: ['Wien'], DK: ['Kobenhavn', 'Kjobenhavn'], PT: ['Lisboa'],
  BE: ['Bruxelles', 'Brussel'], RO: ['Bucuresti'], RS: ['Beograd'], CH: ['Berne'], ET: ['Addis Abeba'], GR: ['Athina'], KP: ['Pyeongyang'],
  BN: ['Bandar'], CV: ['Praia City'], FI: ['Helsingfors'], IS: ['Reykjavík'], GE: ['Tiflis'],
  MK: ['Skopie'], AL: ['Tirane'], MT: ['Valetta'],
  CN: ['Peking', 'Beijing City'], JP: ['Tokio'], TH: ['Krung Thep'], LA: ['Viangchan'], KH: ['Phnum Penh'],
  CM: ['Yaounde'], TD: ['Ndjamena'], TO: ['Nukualofa'], HT: ['Port au Prince'], TT: ['Port-of-Spain'], CR: ['San Jose'], PY: ['Asuncion'],
  CO: ['Bogota', 'Santa Fe de Bogota'], BR: ['Brasilia'], CL: ['Santiago de Chile'], SV: ['San Salvador'], DO: ['Santo Domingo'],
  SA: ['Ar Riyad'], IR: ['Teheran']
};

/** Lower case, accents dropped, everything but letters, digits and Chinese characters removed. */
export function normalizeAnswer(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9一-鿿]/g, '');
}
const withoutSuffix = (s: string) => s.replace(/city$/, '').replace(/市$/, '').replace(/城$/, '');

/** Every accepted spelling of a capital, normalised: English name, with or without "City", aliases, and the Chinese name. */
export function acceptedSpellings(entry: CountryEntry): string[] {
  const zh = NAMES_ZH[entry.iso]?.[1];
  const raw = [entry.capital, ...(CAPITAL_ALIASES[entry.iso] ?? []), ...(zh ? [zh] : [])].map(normalizeAnswer).filter(Boolean);
  return [...new Set(raw.flatMap((s) => [s, withoutSuffix(s)]).filter((s) => s.length > 0))];
}
const SPELLINGS = new Map(COUNTRIES.map((c) => [c.iso, acceptedSpellings(c)]));

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}
/** Typos allowed for a Latin-script spelling of this length: none under 5 letters, one up to 8, two from 9. */
const allowedTypos = (s: string) => (/[一-鿿]/.test(s) ? 0 : s.length >= 9 ? 2 : s.length >= 5 ? 1 : 0);

/**
 * 'exact' when the typed text is an accepted spelling, 'close' for a small typo, otherwise null. A typo is only forgiven
 * when no other capital in the bank is as close, so the name of a different capital is never accepted.
 */
export function matchCapital(typed: string, entry: CountryEntry): 'exact' | 'close' | null {
  const input = normalizeAnswer(typed);
  if (!input) return null;
  const mine = SPELLINGS.get(entry.iso) ?? acceptedSpellings(entry);
  if (mine.includes(input)) return 'exact';
  const best = (list: readonly string[]) => Math.min(...list.map((s) => editDistance(input, s)));
  const own = Math.min(...mine.map((s) => (editDistance(input, s) <= allowedTypos(s) ? editDistance(input, s) : Infinity)));
  if (!Number.isFinite(own)) return null;
  for (const [iso, list] of SPELLINGS) if (iso !== entry.iso && best(list) <= own) return null;
  return 'close';
}

/** Seconds per type-in question: typing on a phone takes longer than a tap. */
export const TYPE_LIMIT_MS: Record<Difficulty, number> = { 1: 30000, 2: 26000, 3: 22000 };
