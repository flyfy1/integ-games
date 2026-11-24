import { describe, expect, it } from 'vitest';
import { COUNTRIES } from '../src/games/capital-quiz/data';
import { NAMES_ZH } from '../src/games/capital-quiz/names-zh';
import { BORDER_ROWS, UNSURE_PAIRS } from '../src/games/capital-quiz/borders';
import { ROUND_PLAN } from '../src/games/capital-quiz/logic';
import {
  BORDER_POOL, EXAM_PASS, JOURNEY, STOPS, answerIndexOf, buildBorderQuestion, buildDailyRound, buildJourneyRound, cleanJourney, continentOpen,
  emptyJourney, isNeighbour, matchCapital, mightBorder, nextEndless, nextStop, recordStop, stampCount
} from '../src/games/capital-quiz/modes';
import { dailyRandom } from '../src/games/_shared/daily';

const seeded = (seed: number) => () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
const iso = (name: string) => COUNTRIES.find((c) => c.country === name)!.iso;
const byIso = (code: string) => COUNTRIES.find((c) => c.iso === code)!;

describe('Geo Quiz border data', () => {
  it('is symmetric and only names countries in the bank', () => {
    const bank = new Set(COUNTRIES.map((c) => c.iso));
    for (const [a, row] of Object.entries(BORDER_ROWS)) {
      expect(bank.has(a)).toBe(true);
      for (const b of row.split(' ')) { expect(bank.has(b)).toBe(true); expect(isNeighbour(b, a)).toBe(true); }
    }
    for (const pair of UNSURE_PAIRS) { const [a, b] = pair.split('-'); expect(isNeighbour(a, b)).toBe(false); expect(mightBorder(a, b)).toBe(true); }
  });

  it('matches a hand-checked sample of borders and non-borders', () => {
    const yes = [['FR', 'ES'], ['FR', 'DE'], ['DE', 'PL'], ['CN', 'MN'], ['CN', 'AF'], ['IN', 'NP'], ['US', 'CA'], ['US', 'MX'], ['BR', 'AR'], ['BR', 'VE'],
      ['EG', 'LY'], ['EG', 'SD'], ['KE', 'ET'], ['RU', 'NO'], ['RU', 'KP'], ['TH', 'KH'], ['PE', 'EC'], ['HT', 'DO'], ['AT', 'CH'], ['ZM', 'ZW'], ['KE', 'SO']];
    const no = [['FR', 'PT'], ['DE', 'IT'], ['CN', 'JP'], ['US', 'CU'], ['GB', 'FR'], ['ES', 'IT'], ['IN', 'LK'], ['AU', 'NZ'], ['BR', 'CL'], ['EG', 'IL'],
      ['NO', 'DK'], ['SE', 'DK'], ['MX', 'CU'], ['TH', 'VN'], ['AR', 'PE'], ['CA', 'RU'], ['IR', 'SA'], ['PL', 'AT'], ['GR', 'IT']];
    for (const [a, b] of yes) expect(isNeighbour(a, b), `${a}-${b}`).toBe(true);
    for (const [a, b] of no) expect(isNeighbour(a, b), `${a}-${b}`).toBe(false);
    // Short or disputed land borders stay out of the wrong options.
    for (const [a, b] of [['BW', 'ZM'], ['ES', 'MA'], ['FR', 'BR']]) expect(mightBorder(a, b)).toBe(true);
  });

  it('builds border questions with exactly one neighbour among four distinct options', () => {
    for (let seed = 1; seed <= 30; seed++) for (const entry of BORDER_POOL) {
      const q = buildBorderQuestion(entry, seeded(seed * 97 + entry.iso.charCodeAt(0)));
      expect(new Set(q.options).size).toBe(4);
      expect(q.options).not.toContain(entry.country);
      const touching = q.options.filter((o) => mightBorder(entry.iso, iso(o)));
      expect(touching).toEqual([q.options[q.answerIndex]]);
      expect(isNeighbour(entry.iso, iso(q.options[q.answerIndex]))).toBe(true);
      expect(answerIndexOf(entry, 'border', q.options)).toBe(q.answerIndex);
    }
  });
});

describe('Geo Quiz Daily Ten', () => {
  it('is the same ten for everyone on a date and different the next day', () => {
    const a = buildDailyRound(dailyRandom('capital-quiz', '2026-11-24')), b = buildDailyRound(dailyRandom('capital-quiz', '2026-11-24'));
    const c = buildDailyRound(dailyRandom('capital-quiz', '2026-11-25'));
    expect(a.map((q) => [q.entry.iso, q.kind, q.options])).toEqual(b.map((q) => [q.entry.iso, q.kind, q.options]));
    expect(a.map((q) => q.entry.iso)).not.toEqual(c.map((q) => q.entry.iso));
  });

  it('asks ten different countries with every kind, borders included, along the ramp', () => {
    for (let day = 1; day <= 60; day++) {
      const round = buildDailyRound(dailyRandom('capital-quiz', `2027-01-${String((day % 28) + 1).padStart(2, '0')}x${day}`));
      expect(round).toHaveLength(10);
      expect(new Set(round.map((q) => q.entry.iso)).size).toBe(10);
      expect(new Set(round.map((q) => q.kind))).toEqual(new Set(['capital', 'flag', 'shape', 'border']));
      round.forEach((q, i) => { expect(Math.abs(q.entry.difficulty - ROUND_PLAN[i])).toBeLessThanOrEqual(1); expect(q.answerIndex).toBeGreaterThanOrEqual(0); });
    }
  });
});

describe('Geo Quiz Journey', () => {
  it('builds every stop of every continent over many seeds, all about that continent', () => {
    for (let seed = 1; seed <= 40; seed++) for (const region of JOURNEY) for (let stop = 0; stop < STOPS; stop++) {
      const round = buildJourneyRound(seeded(seed), region, stop);
      expect(round).toHaveLength(10);
      expect(round.every((q) => q.entry.region === region)).toBe(true);
      expect(new Set(round.map((q) => `${q.entry.iso}:${q.kind}`)).size).toBe(10);
      for (const q of round) expect(new Set(q.options).size).toBe(4);
    }
  });

  it('opens continents in order, clears stops in order and stamps only on an exam of 8/10 or better', () => {
    let j = emptyJourney();
    expect(continentOpen(j, 'Europe')).toBe(true);
    expect(continentOpen(j, 'North America')).toBe(false);
    j = recordStop(j, 'Europe', 0, 2).journey; expect(nextStop(j, 'Europe')).toBe(1);
    j = recordStop(j, 'Europe', 1, 5).journey; expect(nextStop(j, 'Europe')).toBe(2);
    const fail = recordStop(j, 'Europe', 2, EXAM_PASS - 1);
    expect(fail.passed).toBe(false); expect(fail.stamped).toBe(false); expect(stampCount(fail.journey)).toBe(0);
    const pass = recordStop(fail.journey, 'Europe', 2, EXAM_PASS);
    expect(pass.passed).toBe(true); expect(pass.stamped).toBe(true); expect(stampCount(pass.journey)).toBe(1);
    expect(continentOpen(pass.journey, 'North America')).toBe(true);
    expect(pass.journey.bestExam.Europe).toBe(EXAM_PASS);
    expect(recordStop(pass.journey, 'Europe', 2, 10).stamped).toBe(false);
    expect(cleanJourney({ cleared: { Europe: 9, Mars: 2 }, bestExam: { Asia: 'x' } })).toEqual({ cleared: { Europe: 3 }, bestExam: {} });
  });
});

describe('Geo Quiz endless stream', () => {
  it('ramps difficulty and never repeats a country until the pool runs dry', () => {
    const rand = seeded(3), asked = new Set<string>(), seen: string[] = [];
    for (let n = 0; n < 60; n++) { const q = nextEndless(rand, n, asked); seen.push(q.entry.iso); expect(q.answerIndex).toBeGreaterThanOrEqual(0); }
    expect(new Set(seen).size).toBe(60);
    expect(seen.slice(0, 5).every((c) => byIso(c).difficulty <= 2)).toBe(true);
  });
});

describe('Geo Quiz type-in matching', () => {
  const entry = (code: string) => byIso(code);
  it('forgives case, accents, spacing, "City", aliases and Chinese names', () => {
    expect(matchCapital('paris', entry('FR'))).toBe('exact');
    expect(matchCapital('BOGOTA', entry('CO'))).toBe('exact');
    expect(matchCapital('  san jose ', entry('CR'))).toBe('exact');
    expect(matchCapital('Mexico', entry('MX'))).toBe('exact');
    expect(matchCapital('Kiev', entry('UA'))).toBe('exact');
    expect(matchCapital('Washington DC', entry('US'))).toBe('exact');
    expect(matchCapital('washington, d.c.', entry('US'))).toBe('exact');
    expect(matchCapital('Ulan Bator', entry('MN'))).toBe('exact');
    expect(matchCapital('nuku alofa', entry('TO'))).toBe('exact');
    expect(matchCapital('北京', entry('CN'))).toBe('exact');
    expect(matchCapital('科威特', entry('KW'))).toBe('exact');
    expect(matchCapital('Copenhagn', entry('DK'))).toBe('close');
    expect(matchCapital('Ouagadougu', entry('BF'))).toBe('close');
    expect(matchCapital('Helsinky', entry('FI'))).toBe('close');
    expect(matchCapital('', entry('FR'))).toBeNull();
    expect(matchCapital('Lyon', entry('FR'))).toBeNull();
  });

  it('never accepts the name of a different capital, in English or Chinese', () => {
    for (const a of COUNTRIES) for (const b of COUNTRIES) {
      if (a.iso === b.iso || a.capital === b.capital) continue;
      expect(matchCapital(b.capital, a), `${b.capital} for ${a.country}`).toBeNull();
      expect(matchCapital(NAMES_ZH[b.iso][1], a), `${NAMES_ZH[b.iso][1]} for ${a.country}`).toBeNull();
    }
  });

  it('does not forgive typos that land as close to another capital', () => {
    expect(matchCapital('Rome', byIso('TG'))).toBeNull();
    expect(matchCapital('Berlin', byIso('CH'))).toBeNull();
    expect(matchCapital('Dhaka', byIso('SN'))).toBeNull();
    expect(matchCapital('Lome', byIso('IT'))).toBeNull();
  });
});
