import { describe, expect, it } from 'vitest';
import { CHAPTERS, LEVELS } from '../src/games/tide-bell/levels';
import { DIRS, initialState, isWet, parseBoard, replay, solveLevel, stateKey, step, type Board, type MoveEvent, type State } from '../src/games/tide-bell/rules';
import { analyze, distanceOf, hintFrom } from '../src/games/tide-bell/solver';

/** The designer's reference solver (tide_solver.py) printed these; the port must agree move for move. */
const REFERENCE: [string, number, string[], string, number][] = [
  ['The Bell', 1, ['XBXXXXX', 'PRSSSRG'], 'RUDRRRRR', 11],
  ['Driftwood', 0, ['XRRXXX', 'PRrDRG', 'XRRXXX'], 'RRRRR', 28],
  ['Stopper', 0, ['XRRXXXX', 'XRrXXXX', 'PRrDDRG', 'XRRXXXX'], 'RRLUURDLDRRRRR', 52],
  ['High and Low', 0, ['BRRXXXXXX', 'PRrSDSDRG', 'XrRXXXXXX', 'XRRXXXXXX'], 'UDRRDDLURUULLDRRRRRRRR', 750],
  ['Do Not Push', 0, ['XBRXXX', 'PRRsGX', 'XXXXXX'], 'RUDRRR', 18]
];

/** Small seeded walk, so the hint test visits the same 200 states every run. */
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }

describe('tide bell rules: port of the reference solver', () => {
  it.each(REFERENCE)('%s solves exactly like the reference', (_name, tide, rows, moves, states) => {
    const sol = solveLevel(rows, tide);
    expect(sol.moves).toBe(moves);
    expect(sol.states).toBe(states);
  });

  it('keeps the reference answers without the bell (the reference made the bell impassable; here it is inert rock)', () => {
    expect(solveLevel(REFERENCE[0][2], 1, ['bells']).moves).toBeNull();
    expect(solveLevel(REFERENCE[1][2], 0, ['bells']).moves).toBe('RRRRR');
    expect(solveLevel(REFERENCE[3][2], 0, ['bells']).moves).toBeNull();
    expect(solveLevel(REFERENCE[4][2], 0, ['bells']).moves).toBeNull();
  });

  it('pushes wood one tile on land, lets it drift on water until it bumps, and floats it under you', () => {
    const b = parseBoard(['PrRDDDRG'], 0);
    const events: MoveEvent[] = [];
    const s1 = step(b, initialState(b), 'R', undefined, events)!;
    expect(s1.rafts).toEqual([2]);
    const s2 = step(b, s1, 'R', undefined, events)!;
    expect(s2.rafts).toEqual([5]); // drifted across all three deep tiles and stopped at the rock
    expect(events.find(e => e.type === 'push' && e.to === 5)).toBeTruthy();
    expect(step(b, s2, 'R')).toBeNull(); // the gap in front is open water
    // Sand at high tide is water; the bell flips the tide after the move resolves.
    const c = parseBoard(['PBSG'], 0);
    const c1 = step(c, initialState(c), 'R')!;
    expect(c1.tide).toBe(1);
    expect(isWet(c, c1, 2)).toBe(true);
  });

  it('washes a sandcastle the first time the tide covers it, for good', () => {
    const b = parseBoard(['PBCG'], 0);
    const s0 = initialState(b);
    expect(step(b, step(b, s0, 'R')!, 'R')).toBeNull(); // high tide: the castle is gone but its sand is water
    let s = step(b, s0, 'R')!; // ring: high tide, castle washed
    expect(s.peak).toBe(1);
    s = step(b, step(b, s, 'L')!, 'R')!; // ring again: low tide
    expect(s.tide).toBe(0);
    expect(solveLevel(['PBCG'], 0).moves).toBe('RLRRR');
    expect(solveLevel(['PBCG'], 0, ['castles']).moves).toBeNull();
  });

  it('carries floating wood along a current, and you with it', () => {
    // Floating wood on still water stays put under you.
    const b = parseBoard(['PoDvX', 'XXX>G'], 0);
    const s1 = step(b, initialState(b), 'R')!;
    expect(s1.pos).toBe(1);
    expect(s1.rafts).toEqual([1]);
    const c = parseBoard(['PrvX', 'XX>G'], 0);
    const events: MoveEvent[] = [];
    const c1 = step(c, initialState(c), 'R', undefined, events)!; // push into the down current: flows down, then right
    expect(c1.rafts).toEqual([c.w + 2]);
    expect(events.some(e => e.type === 'push')).toBe(true);
    const ride = parseBoard(['PvXX', 'X>>G', 'XXXX'], 0);
    const r0 = { ...initialState(ride), rafts: [1] };
    const r1 = step(ride, r0, 'R')!; // step on, ride down and along until the flag's rock stops the log
    expect(r1.pos).toBe(ride.w + 2);
    expect(r1.rafts).toEqual([ride.w + 2]);
  });

  it('the hint lowers the distance to the flag by exactly one, and dead states say so', () => {
    const b = parseBoard(REFERENCE[3][2], 0);
    const a = analyze(b);
    const states = [...a.ids.keys()];
    expect(states.length).toBeGreaterThan(500);
    expect(a.dead).toBeGreaterThan(0);
    const all = new Map<string, State>();
    const q = [initialState(b)]; all.set(stateKey(q[0]), q[0]);
    for (let i = 0; i < q.length; i++) for (const d of DIRS) { const n = step(b, q[i], d); if (n && !all.has(stateKey(n))) { all.set(stateKey(n), n); q.push(n); } }
    for (const s of q.slice(0, 80)) {
      const h = hintFrom(b, s, a);
      const here = distanceOf(a, s)!;
      if (here > 0) expect(distanceOf(a, step(b, s, h.move!)!)).toBe(here - 1);
      if (here < 0) expect(h.move).toBeNull();
    }
  });
});

function invariants(b: Board, s: State) {
  expect(new Set(s.rafts).size).toBe(s.rafts.length);
  expect(b.kind[s.pos]).not.toBe(4);
  // You are never in open water: either on dry ground or on floating wood.
  if (isWet(b, s, s.pos)) expect(s.rafts).toContain(s.pos);
}

describe('tide bell campaign', () => {
  it('has the chapters in order with unique ids', () => {
    expect(new Set(LEVELS.map(l => l.id)).size).toBe(LEVELS.length);
    expect(CHAPTERS.map(c => c.id)).toEqual(CHAPTERS.map((_, i) => i + 1));
  });

  it.each(LEVELS.map(l => [l.id, l] as const))('%s: par is the true shortest (5-40), the stored solution wins, the idea is needed, the trap fails', (_id, lv) => {
    const b = parseBoard(lv.rows, lv.tide);
    expect(b.w).toBeLessThanOrEqual(9);
    const sol = solveLevel(lv.rows, lv.tide);
    expect(sol.moves?.length).toBe(lv.par);
    expect(lv.par).toBeGreaterThanOrEqual(5);
    expect(lv.par).toBeLessThanOrEqual(40);
    expect(lv.solution).toHaveLength(lv.par);
    expect(replay(b, lv.solution).pos).toBe(b.goal);
    expect(lv.ablate.length).toBeGreaterThan(0);
    const without = solveLevel(lv.rows, lv.tide, lv.ablate);
    if (without.moves !== null) expect(without.moves.length).toBeGreaterThan(lv.par);
    // The obvious wrong plan: either a move in it is blocked, or it ends where the flag is out of reach.
    let s = initialState(b), blocked = false;
    for (const m of lv.trap) { const n = step(b, s, m as never); if (!n) { blocked = true; break; } s = n; }
    if (!blocked) expect(analyze(b, s).par).toBeNull();
    expect([...lv.idea.en.split(/\s+/)].length).toBeLessThanOrEqual(12);
  });

  it.each(LEVELS.map(l => [l.id, l] as const))('%s: every reachable state keeps the rules sound, and 200 random states get a correct hint', (_id, lv) => {
    const b = parseBoard(lv.rows, lv.tide);
    const a = analyze(b);
    expect(a.complete).toBe(true);
    const random = rng(lv.id.split('').reduce((h, c) => h * 31 + c.charCodeAt(0), 7));
    let checked = 0;
    for (let walk = 0; checked < 200 && walk < 2000; walk++) {
      let s = initialState(b);
      const len = Math.floor(random() * (lv.par * 2 + 4));
      for (let i = 0; i < len; i++) { const n = step(b, s, DIRS[Math.floor(random() * 4)]); if (n) s = n; if (s.pos === b.goal) break; }
      if (s.pos === b.goal) continue;
      invariants(b, s);
      const here = distanceOf(a, s)!;
      const h = hintFrom(b, s, a);
      if (here > 0) { expect(h.move).not.toBeNull(); expect(distanceOf(a, step(b, s, h.move!)!)).toBe(here - 1); }
      else { expect(h.move).toBeNull(); expect(solveLevel(lv.rows, lv.tide).moves === null || analyze(b, s).par === null).toBe(true); }
      checked++;
    }
    expect(checked).toBe(200);
  });
});
