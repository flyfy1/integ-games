import { describe, expect, it } from 'vitest';
import { buildRows, CHUNKS, LEVELS, ROWS } from '../src/games/pelican-bike/levels';
import { cloneSim, createSim, noInput, STEP, stepSim } from '../src/games/pelican-bike/sim';
import type { Input, Sim } from '../src/games/pelican-bike/sim';

/**
 * Proves every stage can be finished, and every fish and star collected, with ordinary input and without taking
 * a single hit. It explores the real physics breadth-first: each move is one of a few button combinations held
 * for a tenth of a second (about as fast as a person changes their mind), and states that die or get hurt are dropped.
 */
type Act = { left?: boolean; right?: boolean; jump?: boolean; turbo?: boolean };
const ACTS: Act[] = [
  { right: true }, { right: true, jump: true }, { right: true, turbo: true }, { right: true, jump: true, turbo: true },
  {}, { jump: true }, { left: true }, { left: true, jump: true }
];
const HOLD = 12;
const TAU = Math.PI * 2;

type Node = { sim: Sim; jump: boolean };

/**
 * `full` explores everything in time order (finds the fastest clear and which items can be reached); otherwise it
 * dives for the lighthouse, always expanding the state that has ridden furthest, and stops when it gets there.
 */
export function explore(lv: number, full: boolean, budget = 4000000) {
  const start = createSim(lv);
  const got = new Set<number>();
  const visits = new Map<number, { n: number; t: number; shapes: number }>();
  let queue: Node[] = [{ sim: start, jump: false }];
  let clearTime = Infinity, expanded = 0;
  const inp: Input = noInput();
  const expand = (node: Node, out: Node[]) => {
    for (const a of ACTS) {
      expanded++;
      const s = cloneSim(node.sim);
      inp.left = !!a.left; inp.right = !!a.right; inp.jump = !!a.jump; inp.turbo = !!a.turbo; inp.down = false;
      const before = s.fishGot + s.starGot;
      let ok = true;
      for (let i = 0; i < HOLD; i++) {
        inp.jumpPressed = i === 0 && !!a.jump && !node.jump;
        stepSim(s, inp, STEP);
        if (s.P.dead || s.hits > 0) { ok = false; break; }
        if (s.cleared) break;
      }
      if (!ok) continue;
      if (s.fishGot + s.starGot !== before) s.items.forEach((it, i) => { if (it.got) got.add(i); });
      if (s.cleared) { clearTime = Math.min(clearTime, s.time); continue; }
      const P = s.P;
      // Near a ferry or lift the same spot is a different situation at each point of the platform's cycle.
      const near = s.movers.find((m) => Math.abs(m.ox - P.x) < 520);
      const phase = near ? Math.floor(((near.t % TAU) / TAU) * 6) : 0;
      const key = ((Math.floor(P.x / 32) * 32 + Math.floor((P.y + 200) / 32)) * 12 + P.jumps * 4 + (P.vy < 0 ? 2 : 0) + (a.jump ? 1 : 0)) * 6 + phase;
      // Speed and sprint energy matter at long gaps, so a spot is revisited when it is reached in a new shape.
      const shape = 1 << ((P.vx < -100 ? 0 : P.vx < 100 ? 1 : P.vx < 340 ? 2 : 3) * 2 + (P.stamina >= 0.3 ? 1 : 0));
      const seen = visits.get(key);
      if (seen) {
        if (seen.n >= 4 || ((seen.shapes & shape) !== 0 && s.time - seen.t < 0.5)) continue;
        seen.n++; seen.t = s.time; seen.shapes |= shape;
      } else visits.set(key, { n: 1, t: s.time, shapes: shape });
      out.push({ sim: s, jump: !!a.jump });
    }
  };
  if (full) {
    while (queue.length && expanded < budget) {
      const next: Node[] = [];
      for (const node of queue) expand(node, next);
      queue = next;
    }
  } else {
    // Furthest-first: buckets of 32px, always pop from the right-most non-empty one.
    const buckets: Node[][] = [];
    const push = (n: Node) => { (buckets[Math.floor(n.sim.P.x / 32)] ??= []).push(n); };
    push(queue[0]);
    let top = Math.floor(start.P.x / 32);
    const out: Node[] = [];
    while (clearTime === Infinity && expanded < budget) {
      while (top >= 0 && !(buckets[top]?.length)) top--;
      if (top < 0) break;
      out.length = 0;
      expand(buckets[top].pop()!, out);
      for (const n of out) { push(n); top = Math.max(top, Math.floor(n.sim.P.x / 32)); }
    }
    queue = [];
  }
  const missing = start.items.map((it, i) => ({ it, i })).filter(({ i }) => !got.has(i)).map(({ it }) => `${it.type}@${Math.round(it.x)},${Math.round(it.y)}`);
  return { clearTime, missing, expanded, exhausted: queue.length === 0, total: start.items.length };
}

describe('pelican-bike level data', () => {
  it('builds rectangular rows with a start, a lighthouse, checkpoints and exactly three stars per stage', () => {
    LEVELS.forEach((lv, i) => {
      const rows = buildRows(i);
      expect(rows).toHaveLength(ROWS);
      rows.forEach((r) => expect(r.length).toBe(rows[0].length));
      const all = rows.join('');
      expect(all.split('P').length - 1).toBe(1);
      expect(all.split('F').length - 1).toBe(1);
      expect(all.split('*').length - 1).toBe(3);
      expect(all.split('C').length - 1).toBe(Math.floor((lv.seq.length - 1) / 4));
      expect(all.split('o').length - 1).toBeGreaterThan(30);
      lv.seq.forEach((key) => expect(CHUNKS[key], key).toBeDefined());
      expect(/^[#B=^xo*SCFPcgjhv.]+$/.test(all)).toBe(true);
    });
  });

  it('uses every chunk in at least one stage', () => {
    const used = new Set(LEVELS.flatMap((l) => l.seq));
    Object.keys(CHUNKS).forEach((key) => expect(used.has(key), key).toBe(true));
  });
});

describe('pelican-bike stages are completable without taking damage', () => {
  LEVELS.forEach((lv, i) => {
    it(`${lv.nameEn}: the lighthouse can be reached with ordinary input and no hits`, () => {
      const res = explore(i, false);
      if (process.env.PELICAN_DEBUG) console.log(lv.nameEn, res.clearTime, res.expanded);
      expect(res.clearTime).toBeLessThan(Infinity);
    }, 60000);
  });
});

// The exhaustive pass takes from half a minute to over a minute, so it runs on request: PELICAN_FULL=1 npx vitest run tests/pelican-bike-levels.test.ts
describe.skipIf(!process.env.PELICAN_FULL)('pelican-bike exhaustive reachability', () => {
  LEVELS.forEach((lv, i) => {
    it(`${lv.nameEn}: every fish and star can be collected, and par leaves fair slack over a perfect sprint`, () => {
      const res = explore(i, true);
      console.log(lv.nameEn, JSON.stringify(res));
      expect(res.missing).toEqual([]);
      expect(lv.par).toBeGreaterThan(res.clearTime * 1.45);
      expect(lv.par).toBeLessThan(res.clearTime * 2);
    }, 300000);
  });
});
