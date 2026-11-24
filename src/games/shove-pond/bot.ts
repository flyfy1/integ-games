import { BRACE, LEGAL_PLANS, SIT, cellIndex, crownOf, hash32, resolveRound, rngNext, type Plan, type State } from './sim';

/**
 * Deterministic bots. A bot's plan depends only on the state, its seat and its level, so every client in a room
 * computes the same plan for a seat whose player is missing. Levels:
 * 1 Pollywog: assumes everyone sits still, picks among the better plans with a lot of slack.
 * 2 Croaker: assumes everyone sits still, small slack. (Also the stand-in for a missing online player.)
 * 3 Bullfrog: predicts each rival with a Croaker plan, and weighs that against the rivals sitting still.
 */
export type BotLevel = 1 | 2 | 3;
const SITTING: Plan = [SIT, SIT, SIT];

function centre(s: State, x: number, y: number): number {
  const c = (s.size - 1) / 2;
  return Math.abs(x - c) + Math.abs(y - c);
}

/** How good the end of a round is for `seat`: points won, staying dry, standing safe and central. */
function evaluate(before: State, seat: number, plans: Plan[]): number {
  const r = resolveRound(before, plans);
  const me = r.state.frogs[seat];
  let v = (me.score - before.frogs[seat].score) * 100;
  if (r.splashed.includes(seat)) v -= 140;
  if (!me.wet) {
    v -= centre(r.state, me.x, me.y) * 6;
    const pad = r.state.pads[cellIndex(me.x, me.y, r.state.size)];
    if (pad === 2) v -= 40; // standing on a pad that will sink next round
    // Rivals in line with me but further from the centre are shove targets next round.
    for (let o = 0; o < r.state.n; o++) {
      if (o === seat || r.state.frogs[o].wet) continue;
      const f = r.state.frogs[o];
      const d = Math.abs(f.x - me.x) + Math.abs(f.y - me.y);
      if (d === 1) v += centre(r.state, f.x, f.y) > centre(r.state, me.x, me.y) ? 8 : -8;
    }
  }
  return v;
}

function pick(scored: { plan: Plan; v: number }[], slack: number, rng: number): Plan {
  const best = Math.max(...scored.map(c => c.v));
  const pool = scored.filter(c => c.v >= best - slack);
  const [value] = rngNext(rng);
  return pool[value % pool.length].plan;
}

export function botPlan(s: State, seat: number, level: BotLevel = 2, salt = 0): Plan {
  if (s.over || s.frogs[seat]?.wet) return SITTING;
  const rng = hash32(s.seed, s.round, seat, level, salt, s.frogs[seat].x, s.frogs[seat].y) || 7;
  const base: Plan[] = s.frogs.map(() => SITTING);
  if (level === 3) {
    const predicted = s.frogs.map((_, o) => (o === seat ? SITTING : botPlan(s, o, 2, 99)));
    const crown = crownOf(s);
    const scored = LEGAL_PLANS.map(plan => {
      const still = base.slice(); still[seat] = plan;
      const guess = predicted.slice(); guess[seat] = plan;
      let v = evaluate(s, seat, guess) * 0.6 + evaluate(s, seat, still) * 0.4;
      if (crown === seat && plan.includes(BRACE)) v += 4;
      return { plan, v };
    });
    return pick(scored, 6, rng);
  }
  const scored = LEGAL_PLANS.map(plan => { const p = base.slice(); p[seat] = plan; return { plan, v: evaluate(s, seat, p) }; });
  return pick(scored, level === 1 ? 70 : 14, rng);
}
