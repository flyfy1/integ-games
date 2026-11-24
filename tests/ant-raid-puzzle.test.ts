import { describe, expect, it } from 'vitest';
import { PUZZLES, puzzleById } from '../src/games/ant-raid/puzzle/levels';
import { applyScript, createRun, settle, simulate, stepRun, type Run } from '../src/games/ant-raid/puzzle/sim';
import { PCOLS, PROWS, TPS } from '../src/games/ant-raid/puzzle/types';
import { search } from './ant-raid-puzzle-solver';

/**
 * Crumb Raiders puzzle acceptance (spec 2026-11-24, section 6). These are the bot-measurable halves of "clearing a
 * level makes you feel clever": the reference plan wins, every first-idea plan fails, the cheapest connecting trail
 * loses where the level is about something else, and the same plan always plays out the same way.
 */
const run = (id: string, script = puzzleById(id)!.solution) => {
  const level = puzzleById(id)!;
  const drawn = applyScript(level, script);
  return { drawn, result: drawn.ok ? simulate(drawn.plan) : null };
};

describe('ant-raid puzzles are well formed', () => {
  it('has the ten chapter 1-2 levels with sane data', () => {
    for (const id of ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '2-1', '2-2', '2-3', '2-4']) expect(puzzleById(id), id).toBeTruthy();
    for (const level of PUZZLES) {
      expect(level.grid).toHaveLength(PROWS);
      for (const row of level.grid) expect(row).toHaveLength(PCOLS);
      expect(level.name.en && level.name.zh).toBeTruthy();
      for (const id of level.goal.items) expect(level.foods.some(f => f.id === id && f.lift), `${level.id} ${id}`).toBe(true);
    }
  });
});

describe('A8: every reference plan wins within its budget and par', () => {
  for (const level of PUZZLES) it(level.id, () => {
    const { drawn, result } = run(level.id);
    expect(drawn.failed).toBeNull();
    expect(result!.status).toBe('won');
    if (level.scent !== null) expect(drawn.plan.cost).toBeLessThanOrEqual(level.scent);
    if (level.par !== undefined) expect(drawn.plan.cost).toBeLessThanOrEqual(level.par);
  });
});

describe('A3: GO to result is short', () => {
  it('median 5 s or less, never over 9 s, for the reference plans', () => {
    const seconds = PUZZLES.map(level => run(level.id).result!.tick / TPS).sort((a, b) => a - b);
    const median = seconds[Math.floor(seconds.length / 2)];
    console.info(`[ant-raid puzzle] run seconds: ${PUZZLES.map(l => `${l.id} ${(run(l.id).result!.tick / TPS).toFixed(2)}`).join(', ')}; median ${median.toFixed(2)}`);
    expect(median).toBeLessThanOrEqual(5);
    expect(seconds[seconds.length - 1]).toBeLessThanOrEqual(9);
  });
});

describe('A9: every obvious plan fails (undrawable within the budget, or loses)', () => {
  for (const level of PUZZLES) for (const trap of level.traps) it(`${level.id}: ${trap.name}`, () => {
    const { drawn, result } = run(level.id, trap.plan);
    if (trap.wins) { expect(result!.status).toBe('won'); expect(drawn.plan.cost).toBeGreaterThan(level.par!); return; }
    if (drawn.ok) expect(result!.status, `${trap.name} should lose`).toBe('lost');
    else expect(drawn.failed!.reason).not.toBe('adjacent');
  });
});

describe('A10: the cheapest connecting trail loses where the level is about something else', () => {
  // Exhaustive over every tree whose leaves are food, up to the cost given (see ant-raid-puzzle-solver.ts).
  for (const [id, upTo] of [['1-4', 12], ['1-6', 12], ['2-2', 9], ['2-4', 13]] as const) it(`${id}: every cheapest tree loses`, () => {
    const report = search(puzzleById(id)!, upTo);
    expect(report.minConnectPlans).toBeGreaterThan(0);
    expect(report.minConnectWins, JSON.stringify(report)).toBe(0);
    expect(report.minConnect!).toBeLessThan(puzzleById(id)!.scent!);
  });
  for (const id of ['1-2', '1-3', '1-5']) it(`${id}: no slack, the budget is the cheapest winning trail`, () => {
    const level = puzzleById(id)!;
    const report = search(level, level.scent!);
    expect(report.minWin).toBe(level.scent);
  });
  it('1-6 and 2-4: par is the cheapest win, and the budget leaves room above it', () => {
    for (const id of ['1-6', '2-4']) {
      const level = puzzleById(id)!;
      const report = search(level, level.scent!);
      expect(report.minWin, id).toBe(level.par);
      expect(level.scent!, id).toBeGreaterThan(level.par!);
    }
  });
});

describe('A7: the same plan always plays out the same way', () => {
  const fingerprint = (r: Run) => JSON.stringify({ tick: r.tick, status: r.status, reason: r.reason, crumbs: r.crumbs, ants: r.ants.map(a => [a.phase, a.i, a.t, a.load, a.lost]) });
  for (const level of PUZZLES) it(level.id, () => {
    const plans = [level.solution, ...level.traps.map(t => t.plan)];
    for (const script of plans) {
      const drawn = applyScript(level, script);
      if (!drawn.ok) continue;
      const first = fingerprint(simulate(drawn.plan));
      for (let k = 0; k < 20; k++) expect(fingerprint(simulate(drawn.plan))).toBe(first);
    }
  });
});

describe('fail reasons say what went wrong', () => {
  const lose = (id: string, trap: number): Run => { const level = puzzleById(id)!; const drawn = applyScript(level, level.traps[trap].plan); expect(drawn.ok).toBe(true); const r = createRun(drawn.plan); while (r.status === 'running') stepRun(r); settle(r, TPS); return r; };
  it('1-4: the spider ate two, three crumbs can get home', () => {
    const r = lose('1-4', 0);
    expect(r.reason).toMatchObject({ kind: 'crumbs', have: 3, need: 5, lost: 2 });
    expect(r.ants.filter(a => a.lost?.cause === 'spider')).toHaveLength(2);
  });
  it('1-6: only three ants reach the strawberry; it needs four', () => {
    expect(lose('1-6', 0).reason).toMatchObject({ kind: 'short', have: 3, need: 4 });
  });
  it('2-2: the bridge takes three ants, four crumbs are not six', () => {
    expect(lose('2-2', 0).reason).toMatchObject({ kind: 'crumbs', have: 4, need: 6, bridge: 3 });
  });
  it('2-4: the first two cube ants are eaten, the cube never lifts', () => {
    expect(lose('2-4', 1).reason).toMatchObject({ kind: 'short', have: 2, need: 4 });
  });
  it('fails early: the run stops the moment the goal is out of reach', () => {
    const level = puzzleById('1-4')!, r = createRun(applyScript(level, level.traps[0].plan).plan);
    while (r.status === 'running') stepRun(r);
    // Lost the moment the first ant is eaten: five crumbs are no longer possible.
    expect(r.tick / TPS).toBeLessThan(1);
    expect(r.ants.filter(a => a.lost)).toHaveLength(1);
  });
});
