import { crownOf, hash32, type RoundResult } from './sim';

/**
 * Cosmetic banter, pure and deterministic. A bot's reaction to a round depends only on the match seed, the round
 * and the seat, so every client in an online room shows the same bubble without sending anything. The pond report
 * titles depend only on per-seat counts every client keeps from the same rounds.
 */
export type Reaction = { seat: number; emote: number } | { seat: number; bark: number };
type Event = 'shovedIn' | 'dealt' | 'ownGoal' | 'crown' | 'bounce';

/** Per event: emote index (into emote.0-3) and its chance, then the bark keys and their total chance. */
const TABLE: Record<Event, { emote: number; pe: number; barks: number[]; pb: number }> = {
  shovedIn: { emote: 1, pe: 0.4, barks: [1, 2], pb: 0.35 },
  dealt: { emote: 0, pe: 0.5, barks: [0], pb: 0.25 },
  ownGoal: { emote: -1, pe: 0, barks: [3], pb: 0.6 },
  crown: { emote: 2, pe: 0.4, barks: [4], pb: 0.2 },
  bounce: { emote: 3, pe: 0.2, barks: [5], pb: 0.2 }
};
export const BARKS = 6;

/** What happened to this seat this round, most important first. */
export function seatEvent(r: RoundResult, seat: number): Event | null {
  let dealt = false, shovedIn = false, ownGoal = false, bounce = false;
  for (const e of r.events) {
    if (e.k === 'splash' && e.s === seat) { if (e.by >= 0 && e.by !== seat) shovedIn = true; else if (e.why === 'hop') ownGoal = true; }
    if (e.k === 'splash' && e.by === seat && e.s !== seat) dealt = true;
    if (e.k === 'bounce' && (e.s === seat || e.wall === seat)) bounce = true;
  }
  if (shovedIn) return 'shovedIn';
  if (dealt) return 'dealt';
  if (ownGoal) return 'ownGoal';
  if (crownOf(r.state) === seat && r.crown !== seat && !r.state.over) return 'crown';
  if (bounce) return 'bounce';
  return null;
}

/** One reaction or none for this seat, from a hash of (seed, round, seat): the same on every client. */
export function reactionFor(r: RoundResult, seat: number): Reaction | null {
  const ev = seatEvent(r, seat);
  if (!ev) return null;
  const row = TABLE[ev];
  const h = hash32(r.state.seed, r.state.round, seat, 0x5b0d);
  const u = (h % 10000) / 10000;
  if (u < row.pe && row.emote >= 0) return { seat, emote: row.emote };
  if (u < row.pe + row.pb) return { seat, bark: row.barks[(h >>> 16) % row.barks.length] };
  return null;
}

/** Reactions for the bot seats, at most two, louder events first (a splash beats a bounce). */
export function botReactions(r: RoundResult, bots: readonly number[]): Reaction[] {
  const rank: Event[] = ['shovedIn', 'dealt', 'ownGoal', 'crown', 'bounce'];
  return bots
    .map(seat => ({ seat, ev: seatEvent(r, seat), re: reactionFor(r, seat) }))
    .filter((x): x is { seat: number; ev: Event; re: Reaction } => x.re !== null && x.ev !== null)
    .sort((a, b) => rank.indexOf(a.ev) - rank.indexOf(b.ev) || a.seat - b.seat)
    .slice(0, 2)
    .map(x => x.re);
}

/** Seats that were shoved into the water this round (they carry a grudge mark next round). */
export function grudges(r: RoundResult): number[] {
  const out = new Set<number>();
  for (const e of r.events) if (e.k === 'splash' && e.by >= 0 && e.by !== e.s) out.add(e.s);
  return [...out];
}

// ------------------------------------------------------------------ pond report
export type SeatStats = { dealt: number; wet: number; braced: number };
export type Title = 'boss' | 'shover' | 'fish' | 'dry' | 'rock' | 'there';

export function emptyStats(n: number): SeatStats[] { return Array.from({ length: n }, () => ({ dealt: 0, wet: 0, braced: 0 })); }

/** Adds one round to the per-seat counts: splashes dealt, times in the water, rounds braced. */
export function countRound(stats: SeatStats[], r: RoundResult) {
  const braced = new Set<number>();
  for (const e of r.events) {
    if (e.k === 'splash') { if (stats[e.s]) stats[e.s].wet += 1; if (e.by >= 0 && e.by !== e.s && stats[e.by]) stats[e.by].dealt += 1; }
    if (e.k === 'brace') braced.add(e.s);
  }
  for (const s of braced) if (stats[s]) stats[s].braced += 1;
}

/** One title per frog; the first rule that matches wins. Ties share a title. */
export function titlesFor(stats: readonly SeatStats[], winners: readonly number[]): Title[] {
  const most = (k: keyof SeatStats) => Math.max(0, ...stats.map(s => s[k]));
  const maxDealt = most('dealt'), maxWet = most('wet'), maxBraced = most('braced');
  return stats.map((s, seat) => {
    if (winners.includes(seat)) return 'boss';
    if (s.dealt >= 2 && s.dealt === maxDealt) return 'shover';
    if (s.wet >= 2 && s.wet === maxWet) return 'fish';
    if (s.wet === 0) return 'dry';
    if (s.braced >= 2 && s.braced === maxBraced) return 'rock';
    return 'there';
  });
}
