import { describe, expect, it } from 'vitest';
import { botPlan, type BotLevel } from '../src/games/shove-pond/bot';
import {
  ALL_PLANS, BRACE, DOWN, LEFT, LEGAL_PLANS, RIGHT, SIT, UP, createMatch, crownOf, moveOrder, normalizePlan, planFromString, planToString,
  resolveRound, rngNext, stateHash, type Plan, type State
} from '../src/games/shove-pond/sim';

const S: Plan = [SIT, SIT, SIT];
/** A 7x7 match state with frogs placed by hand (scores optional). */
function pond(frogs: [number, number, number?][], round = 1): State {
  const s = createMatch(1, Math.max(2, frogs.length));
  s.n = frogs.length;
  s.frogs = frogs.map(([x, y, score = 0]) => ({ x, y, score, wet: false }));
  s.round = round;
  return s;
}

describe('shove pond rules', () => {
  it('has 125 choosable plans, 112 legal ones, and a three-letter wire format', () => {
    expect(ALL_PLANS).toHaveLength(125);
    expect(LEGAL_PLANS).toHaveLength(112);
    expect(normalizePlan([BRACE, BRACE, UP])).toEqual([BRACE, SIT, UP]);
    expect(normalizePlan([UP])).toEqual([UP, SIT, SIT]);
    expect(normalizePlan([9, -1, 2.5] as number[])).toEqual([SIT, SIT, SIT]);
    expect(planToString([UP, BRACE, LEFT])).toBe('UBL');
    expect(planFromString('UBL')).toEqual([UP, BRACE, LEFT]);
    expect(planFromString('UBX')).toBeNull();
    expect(planFromString({})).toBeNull();
  });

  it('shoves a whole line one pad and splashes the frog pushed off the end', () => {
    const s = pond([[3, 0], [4, 0], [5, 0], [6, 0]]);
    const r = resolveRound(s, [[RIGHT, SIT, SIT], S, S, S]);
    expect(r.state.frogs.slice(0, 3).map(f => [f.x, f.y])).toEqual([[4, 0], [5, 0], [6, 0]]);
    expect(r.splashed).toEqual([3]);
    expect(r.state.frogs[0].score).toBe(1);
    expect(r.events.find(e => e.k === 'shove')).toMatchObject({ s: 0, line: [1, 2, 3] });
  });

  it('a braced frog anywhere in the line stops the shove and the hopper bounces back', () => {
    const s = pond([[3, 3], [4, 3], [5, 3]]);
    const r = resolveRound(s, [[RIGHT, SIT, SIT], S, [SIT, SIT, SIT].map((a, i) => (i === 0 ? BRACE : a))]);
    expect(r.state.frogs.map(f => [f.x, f.y])).toEqual([[3, 3], [4, 3], [5, 3]]);
    expect(r.events.some(e => e.k === 'bounce' && e.s === 0 && e.wall === 2)).toBe(true);
  });

  it('acts in printed order: lowest score first, ties rotating with the round', () => {
    expect(moveOrder(pond([[1, 1, 2], [2, 2, 0], [3, 3, 1]]))).toEqual([1, 2, 0]);
    const tied = (round: number) => moveOrder(pond([[1, 1], [2, 2], [3, 3], [4, 4]], round));
    expect(new Set([1, 2, 3, 4].map(r => tied(r)[0])).size).toBe(4);
    // Order decides a head-on meeting: the first to act shoves the other.
    const s = pond([[0, 3, 1], [1, 3, 0]]);
    const r = resolveRound(s, [[RIGHT, SIT, SIT], [LEFT, SIT, SIT]]);
    expect(r.splashed).toEqual([0]);
    expect(r.state.frogs[1].score).toBe(2); // the victim led alone, so it wore the crown
  });

  it('a frog that hops into the water by itself scores nobody, unless someone shoved it this round', () => {
    const alone = resolveRound(pond([[0, 3], [5, 5]]), [[LEFT, SIT, SIT], S]);
    expect(alone.splashed).toEqual([0]);
    expect(alone.state.frogs.map(f => f.score)).toEqual([0, 0]);
    // Seat 0 shoves seat 1 down; seat 1's own planned hop then carries it into the water: seat 0 scores.
    const s = pond([[3, 4], [3, 5]]);
    const r = resolveRound(s, [[DOWN, SIT, SIT], [SIT, DOWN, SIT]]);
    expect(r.splashed).toEqual([1]);
    expect(r.events.find(e => e.k === 'splash')).toMatchObject({ s: 1, by: 0, pts: 1, why: 'hop' });
  });

  it('crown is worth double and only sits on a single leader', () => {
    expect(crownOf(pond([[1, 1, 2], [2, 2, 2]]))).toBe(-1);
    expect(crownOf(pond([[1, 1, 0], [2, 2, 0]]))).toBe(-1);
    const s = pond([[5, 3, 0], [6, 3, 3]]);
    expect(crownOf(s)).toBe(1);
    const r = resolveRound(s, [[RIGHT, SIT, SIT], S]);
    expect(r.state.frogs[0].score).toBe(2);
  });

  it('one Brace per round: a second Brace is played as Sit and can be shoved', () => {
    const s = pond([[3, 6], [3, 5]]);
    const r = resolveRound(s, [[BRACE, BRACE, SIT], [SIT, DOWN, SIT]]);
    expect(r.splashed).toEqual([0]);
    expect(r.state.frogs[1].score).toBe(1);
  });

  it('the outer ring wobbles in round 3 and sinks at its end, splashing frogs standing on it', () => {
    let s = createMatch(5, 4);
    for (let i = 0; i < 2; i++) s = resolveRound(s, s.frogs.map(() => S)).state;
    expect(s.round).toBe(3);
    expect(s.pads.filter(v => v === 2)).toHaveLength(24);
    s.frogs[0] = { x: 0, y: 0, score: 0, wet: false };
    const r = resolveRound(s, s.frogs.map(() => S));
    expect(r.events.find(e => e.k === 'splash')).toMatchObject({ s: 0, why: 'sink', pts: 0 });
    expect(r.state.pads.filter(v => v === 1)).toHaveLength(25);
    // It returns on a steady edge pad of the 5x5 pond.
    const f = r.state.frogs[0];
    expect(f.wet).toBe(false);
    expect(Math.min(f.x, f.y, 6 - f.x, 6 - f.y)).toBe(1);
    // Round 5 wobbles the next ring; the pond ends as 3x3.
    let t = r.state;
    while (t.round < 6) t = resolveRound(t, t.frogs.map(() => S)).state;
    expect(t.pads.filter(v => v > 0)).toHaveLength(9);
  });

  it('first to 6 wins at the end of a round; a tie at the top plays on; round 10 shares the win', () => {
    const s = pond([[5, 3, 5], [6, 3, 0], [1, 1, 0]]);
    const r = resolveRound(s, [[RIGHT, SIT, SIT], S, S]);
    expect(r.state.over).toBe(true);
    expect(r.state.winners).toEqual([0]);
    const tie = pond([[2, 2, 4], [4, 4, 4]], 8);
    const t = resolveRound(tie, [S, S]);
    expect(t.state.over).toBe(false);
    expect(t.state.round).toBe(9);
    const late = pond([[2, 2, 4], [4, 4, 4]], 10);
    expect(resolveRound(late, [S, S]).state.winners).toEqual([0, 1]);
  });
});

function randomPlan(rng: number): [Plan, number] {
  const out: number[] = [];
  for (let i = 0; i < 3; i++) { let v: number; [v, rng] = rngNext(rng); out.push(v % 6); }
  return [normalizePlan(out), rng];
}

describe('shove pond determinism and bots', () => {
  it('1,000 random matches are hash-identical across two runs and after a replay of the wire log', () => {
    for (let m = 0; m < 1000; m++) {
      const n = 2 + (m % 5);
      let a = createMatch(m * 7919 + 1, n), b = createMatch(m * 7919 + 1, n);
      let rng = m + 1;
      const log: string[][] = [];
      const hashes: number[] = [];
      while (!a.over) {
        const plans: Plan[] = [];
        for (let i = 0; i < n; i++) { let p: Plan; [p, rng] = randomPlan(rng); plans.push(p); }
        log.push(plans.map(planToString));
        a = resolveRound(a, plans).state;
        b = resolveRound(b, plans.map(p => [...p])).state;
        hashes.push(stateHash(a));
        expect(stateHash(b)).toBe(stateHash(a));
      }
      let replay = createMatch(m * 7919 + 1, n);
      log.forEach((round, i) => { replay = resolveRound(replay, round.map(planFromString)).state; expect(stateHash(replay)).toBe(hashes[i]); });
    }
  });

  it('bots are deterministic and legal', () => {
    const s = createMatch(42, 4);
    for (const level of [1, 2, 3] as BotLevel[]) for (let seat = 0; seat < 4; seat++) {
      const p = botPlan(s, seat, level);
      expect(botPlan(s, seat, level)).toEqual(p);
      expect(p.filter(x => x === BRACE).length).toBeLessThanOrEqual(1);
    }
  });

  it('bot fairness: in 2,000 four-bot matches no seat wins more than 30%', () => {
    const wins = [0, 0, 0, 0];
    let rounds = 0;
    for (let m = 0; m < 2000; m++) {
      let s = createMatch(1000 + m, 4);
      while (!s.over) s = resolveRound(s, s.frogs.map((_, i) => botPlan(s, i, 2))).state;
      rounds += s.round;
      for (const w of s.winners) wins[w] += 1 / s.winners.length;
    }
    for (const w of wins) expect(w / 2000).toBeLessThan(0.3);
    expect(rounds / 2000).toBeLessThanOrEqual(10);
  }, 60000);

  it('the ladder climbs: a Bullfrog beats three Pollywogs far more often than its fair share', () => {
    let won = 0;
    const N = 160;
    for (let m = 0; m < N; m++) {
      let s = createMatch(5000 + m, 4);
      const hero = m % 4;
      while (!s.over) s = resolveRound(s, s.frogs.map((_, i) => botPlan(s, i, i === hero ? 3 : 1))).state;
      if (s.winners.includes(hero)) won++;
    }
    expect(won / N).toBeGreaterThan(0.4);
  }, 60000);
});
