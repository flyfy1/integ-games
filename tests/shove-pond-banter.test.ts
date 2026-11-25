import { describe, expect, it } from 'vitest';
import { botPlan } from '../src/games/shove-pond/bot';
import { BARKS, botReactions, countRound, emptyStats, grudges, reactionFor, seatEvent, titlesFor } from '../src/games/shove-pond/banter';
import { EN, ZH } from '../src/games/shove-pond/i18n';
import { RIGHT, SIT, createMatch, resolveRound, type Plan, type RoundResult } from '../src/games/shove-pond/sim';

const S: Plan = [SIT, SIT, SIT];
/** Seat 0 hops right into seat 1 on the right edge: seat 1 splashes, shoved by seat 0. */
function shoveRound(seed = 7, round = 1): RoundResult {
  const s = createMatch(seed, 4);
  s.round = round;
  s.frogs = [{ x: 5, y: 3, score: 0, wet: false }, { x: 6, y: 3, score: 0, wet: false }, { x: 0, y: 0, score: 0, wet: false }, { x: 0, y: 6, score: 0, wet: false }];
  return resolveRound(s, [[RIGHT, SIT, SIT], S, S, S]);
}
/** A whole bot-only match, round by round. */
function botMatch(seed: number): RoundResult[] {
  let s = createMatch(seed, 4);
  const out: RoundResult[] = [];
  while (!s.over && out.length < 12) { const r = resolveRound(s, s.frogs.map((_, i) => botPlan(s, i, 2))); out.push(r); s = r.state; }
  return out;
}

describe('shove pond banter', () => {
  it('reads what happened to each seat from the round', () => {
    const r = shoveRound();
    expect(seatEvent(r, 1)).toBe('shovedIn');
    expect(seatEvent(r, 0)).toBe('dealt');
    expect(seatEvent(r, 2)).toBeNull();
    expect(grudges(r)).toEqual([1]);
  });

  it('picks the same reaction on every client: a pure function of seed, round and seat', () => {
    for (const seed of [1, 2, 3, 99, 12345]) for (const round of [1, 2, 5]) {
      const a = shoveRound(seed, round), b = shoveRound(seed, round);
      expect(reactionFor(a, 1)).toEqual(reactionFor(b, 1));
      expect(botReactions(a, [0, 1, 2, 3])).toEqual(botReactions(b, [0, 1, 2, 3]));
    }
    const rounds = botMatch(42);
    expect(rounds.map(r => botReactions(r, [1, 2, 3]))).toEqual(botMatch(42).map(r => botReactions(r, [1, 2, 3])));
  });

  it('reacts sometimes, never more than two bots a round, and only with keys that exist', () => {
    let any = 0;
    for (let seed = 1; seed <= 40; seed++) for (const r of botMatch(seed)) {
      const re = botReactions(r, [1, 2, 3]);
      expect(re.length).toBeLessThanOrEqual(2);
      for (const x of re) {
        expect([1, 2, 3]).toContain(x.seat);
        if ('bark' in x) expect(x.bark).toBeLessThan(BARKS); else expect(x.emote).toBeLessThan(4);
      }
      any += re.length;
    }
    expect(any).toBeGreaterThan(20);
  });

  it('keeps every bark short (16 characters in Chinese)', () => {
    for (let i = 0; i < BARKS; i++) {
      const key = `bark.${i}` as keyof typeof EN;
      expect(EN[key].length).toBeLessThanOrEqual(22);
      expect([...ZH[key]].length).toBeLessThanOrEqual(16);
    }
  });

  it('hands out one pond-report title per frog, first rule wins', () => {
    const stats = emptyStats(4);
    stats[0] = { dealt: 3, wet: 0, braced: 0 };
    stats[1] = { dealt: 0, wet: 3, braced: 2 };
    stats[2] = { dealt: 1, wet: 0, braced: 0 };
    stats[3] = { dealt: 0, wet: 1, braced: 2 };
    expect(titlesFor(stats, [2])).toEqual(['shover', 'fish', 'boss', 'rock']);
    expect(titlesFor(emptyStats(2).map(() => ({ dealt: 0, wet: 1, braced: 0 })), [])).toEqual(['there', 'there']);
    expect(titlesFor(emptyStats(2), [0, 1])).toEqual(['boss', 'boss']);
  });

  it('counts splashes dealt, times in the water and rounds braced', () => {
    const stats = emptyStats(4);
    countRound(stats, shoveRound());
    expect(stats[0]).toEqual({ dealt: 1, wet: 0, braced: 0 });
    expect(stats[1]).toEqual({ dealt: 0, wet: 1, braced: 0 });
  });
});
