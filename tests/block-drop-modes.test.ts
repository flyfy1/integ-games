import { describe, expect, it, vi } from 'vitest';
import blockDrop from '../src/games/block-drop';
import type { GameServices } from '../src/core/game-types';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { COLS, GARBAGE, SHAPES, cellsOf, createGame, finishClear, garbageLeft, holdPiece, lockPiece, rotate, shift, zenRelief, type Game } from '../src/games/block-drop/logic';
import { DIG_PUZZLES, digRandom, digStars, twoStarLimit } from '../src/games/block-drop/modes';
import { solveDig, type Placement } from '../src/games/block-drop/dig-solver';

const FIXTURE = `${process.cwd()}/tests/fixtures/block-drop-dig-solutions.json`;

/** Plays one straight-drop placement with the real controls: hold, turn at the top, slide, hard drop. */
function play(game: Game, move: Placement) {
  if (move.hold) expect(holdPiece(game)).toBe(true);
  for (let i = 0; i < move.rot; i++) expect(rotate(game, 1)).toBe(true);
  const left = () => Math.min(...cellsOf(game.active!).map(([x]) => x));
  while (left() > move.left) expect(shift(game, -1, 0)).toBe(true);
  while (left() < move.left) expect(shift(game, 1, 0)).toBe(true);
  while (shift(game, 0, 1)) undefined;
  const result = lockPiece(game)!;
  if (result.rows.length) finishClear(game);
}

describe('block drop dig puzzles', () => {
  it.runIf(process.env.REGEN_DIG)('regenerates the reference solutions (REGEN_DIG=1)', () => {
    const out = DIG_PUZZLES.map((_, i) => solveDig(i, 48, 800));
    out.forEach((s, i) => console.log(i + 1, DIG_PUZZLES[i].name[0], s ? s.length : 'FAIL'));
    writeFileSync(FIXTURE, JSON.stringify(out.map((s) => s?.map((m) => [m.hold ? 1 : 0, m.rot, m.left]))) + '\n');
  }, 600_000);

  it('has twenty puzzles, each a fair garbage board with a budget above par', () => {
    expect(DIG_PUZZLES).toHaveLength(20);
    DIG_PUZZLES.forEach((p) => {
      expect(p.rows.length).toBeGreaterThan(0);
      p.rows.forEach((row) => { expect(row).toHaveLength(COLS); expect(row).toMatch(/\./); expect(row).toMatch(/#/); });
      expect(p.par).toBeGreaterThan(0);
      expect(p.budget).toBeGreaterThanOrEqual(p.par + 3);
      expect(twoStarLimit(p)).toBeGreaterThan(p.par);
      expect(twoStarLimit(p)).toBeLessThan(p.budget + 1);
    });
    // Difficulty climbs: the last five need more pieces than the first five.
    const avg = (list: readonly { par: number }[]) => list.reduce((s, p) => s + p.par, 0) / list.length;
    expect(avg(DIG_PUZZLES.slice(15))).toBeGreaterThan(avg(DIG_PUZZLES.slice(0, 5)) * 3);
  });

  it('can clear every puzzle within three-star par using only straight drops and hold, played with the real controls', () => {
    expect(existsSync(FIXTURE)).toBe(true);
    const solutions = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Array<Array<[number, number, number]> | null>;
    DIG_PUZZLES.forEach((p, i) => {
      const moves = solutions[i];
      expect(moves, p.name[0]).toBeTruthy();
      expect(moves!.length, p.name[0]).toBeLessThanOrEqual(p.par);
      const game = createGame(digRandom(i), { garbage: p.rows });
      expect(garbageLeft(game)).toBeGreaterThan(0);
      moves!.forEach(([hold, rot, left]) => play(game, { hold: hold === 1, rot, left }));
      expect(garbageLeft(game), p.name[0]).toBe(0);
      expect(game.over).toBe(false);
      expect(digStars(p, moves!.length)).toBe(3);
    });
  });

  it('scores stars by pieces used', () => {
    const p = { name: ['x', 'x'] as [string, string], rows: ['#.'], par: 4, budget: 10 };
    expect(digStars(p, 3)).toBe(3); expect(digStars(p, 4)).toBe(3); expect(digStars(p, 7)).toBe(2); expect(digStars(p, 8)).toBe(1); expect(digStars(p, 10)).toBe(1); expect(digStars(p, 11)).toBe(0);
  });

  it('deals the same pieces on every retry of a puzzle', () => {
    const a = createGame(digRandom(5), { garbage: DIG_PUZZLES[5].rows }), b = createGame(digRandom(5), { garbage: DIG_PUZZLES[5].rows });
    expect([a.active!.type, ...a.queue]).toEqual([b.active!.type, ...b.queue]);
    expect(a.board).toEqual(b.board);
    expect(a.board.flat().filter((v) => v === GARBAGE).length).toBe(DIG_PUZZLES[5].rows.join('').split('#').length - 1);
  });
});

describe('block drop zen', () => {
  it('empties the well instead of ending the run, keeping score and lines', () => {
    const game = createGame(() => 0.3);
    game.score = 1234; game.lines = 17;
    for (let y = 2; y < game.board.length; y++) game.board[y] = Array(COLS).fill(1).map((v, x) => (x === 0 ? 0 : v));
    game.over = true;
    zenRelief(game);
    expect(game.over).toBe(false);
    expect(game.board.flat().every((v) => v === 0)).toBe(true);
    expect(game.active).not.toBeNull();
    expect(game.score).toBe(1234); expect(game.lines).toBe(17);
    void SHAPES;
  });
});

describe('block drop modes in the cabinet', () => {
  const services = (seed: Record<string, unknown> = {}): GameServices => {
    const values = new Map<string, unknown>(Object.entries(seed));
    let n = 5;
    return {
      storage: { get: <T>(key: string, fallback: T) => (values.has(key) ? values.get(key) as T : fallback), set: (key, value) => { values.set(key, value); }, remove: (key) => { values.delete(key); } },
      sound: { muted: true, play: vi.fn(), stop: vi.fn(), setMuted: vi.fn() }, random: vi.fn(() => { n = (1664525 * n + 1013904223) >>> 0; return n / 2 ** 32; }), reportScore: vi.fn(), reportComplete: vi.fn(), isReducedMotion: true
    };
  };
  const press = (root: Element, key: string) => { root.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); root.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true })); };

  it('solves the first dig puzzle with one straight drop, awards three stars and keeps the leaderboard out of it', () => {
    const host = document.createElement('div'); document.body.append(host);
    const s = services({ mode: 'dig', 'dig-index': 0 }), controller = blockDrop.mount(host, s);
    const canvas = host.querySelector('canvas')!;
    press(canvas, 'ArrowUp'); press(canvas, 'ArrowLeft'); press(canvas, ' ');
    // The clear animates over a few frames: run the frame loop the cabinet registered.
    const frame = vi.mocked(requestAnimationFrame).mock.calls.at(-1)![0];
    let t = performance.now();
    for (let i = 0; i < 10; i++) { t += 50; frame(t); }
    expect(s.storage.get<number[]>('dig-stars', [])[0]).toBe(3);
    expect(s.reportScore).not.toHaveBeenCalled();
    expect(s.storage.get('block-drop-best', 0)).toBe(0);
    expect(host.querySelector('[role=dialog]')!.textContent).toMatch(/Next puzzle/);
    controller.destroy();
  });

  it('ends a dig run when the piece budget runs out, without reporting a score', () => {
    const host = document.createElement('div'); document.body.append(host);
    const s = services({ mode: 'dig', 'dig-index': 2 }), controller = blockDrop.mount(host, s);
    const canvas = host.querySelector('canvas')!;
    for (let i = 0; i < DIG_PUZZLES[2].budget + 3; i++) { press(canvas, 'ArrowRight'); press(canvas, ' '); }
    const panel = host.querySelector<HTMLElement>('[role=dialog]')!;
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toMatch(/OUT OF PIECES|WELL FULL/);
    expect(s.reportScore).not.toHaveBeenCalled();
    expect(s.storage.get('block-drop-best', 0)).toBe(0);
    controller.destroy();
  });

  it('opens the mode menu with M, walks it with the arrows and starts a mode with Space', () => {
    const host = document.createElement('div'); document.body.append(host);
    const s = services(), controller = blockDrop.mount(host, s);
    const canvas = host.querySelector('canvas')!;
    press(canvas, 'm');
    const panel = host.querySelector<HTMLElement>('[role=dialog]')!;
    expect(panel.hidden).toBe(false);
    expect(panel.querySelectorAll('[data-mode]')).toHaveLength(6);
    press(canvas, 'ArrowDown'); press(canvas, ' '); // Marathon -> Sprint 40
    expect(panel.hidden).toBe(true);
    expect(s.storage.get('mode', '')).toBe('sprint');
    expect(host.querySelector('[data-mode-bar]')!.textContent).toMatch(/Sprint 40/);
    controller.destroy();
  });

  it('keeps split-screen seats on Marathon whatever the saved mode', () => {
    const seat = document.createElement('div'); seat.dataset.versusSeat = ''; document.body.append(seat);
    const host = document.createElement('div'); seat.append(host);
    const s = services({ mode: 'dig', 'dig-index': 0 }), controller = blockDrop.mount(host, s);
    expect(host.querySelector<HTMLElement>('[data-mode-bar]')!.parentElement!.style.display).toBe('none');
    const canvas = host.querySelector('canvas')!;
    for (let i = 0; i < 60; i++) press(canvas, ' ');
    expect(s.reportScore).toHaveBeenCalled();
    controller.destroy();
  });

  it('runs the two-minute clock after a count-in, then records Ultra and the Daily apart from the leaderboard', () => {
    for (const mode of ['ultra', 'daily']) {
      const host = document.createElement('div'); document.body.append(host);
      const s = services({ mode }), controller = blockDrop.mount(host, s);
      const canvas = host.querySelector('canvas')!;
      const frame = vi.mocked(requestAnimationFrame).mock.calls.at(-1)![0];
      press(canvas, ' '); // ignored during the count-in
      expect(s.sound.play).not.toHaveBeenCalledWith('hit');
      let t = performance.now();
      // Spread the falling pieces across the well (no input at all would stack one tower and top out before 2:00).
      let turn = 0;
      for (let i = 0; i < 1300; i++) {
        t += 100; frame(t);
        if (i > 15 && i % 40 === 0) { const steps = [-5, 5, -3, 3, 0, -5, 5][turn++ % 7]; for (let k = 0; k < Math.abs(steps); k++) press(canvas, steps < 0 ? 'ArrowLeft' : 'ArrowRight'); }
      }
      const panel = host.querySelector<HTMLElement>('[role=dialog]')!;
      expect(panel.hidden).toBe(false);
      expect(panel.textContent, panel.textContent!).toMatch(/TIME'S UP/);
      expect(s.reportScore).not.toHaveBeenCalled();
      if (mode === 'ultra') expect(s.storage.get<{ trace: number[] }>('ultra', { trace: [] }).trace.length).toBeGreaterThanOrEqual(120);
      else {
        expect(s.storage.get<{ played: number }>('daily', { played: 0 }).played).toBe(1); expect(panel.querySelector('[data-share]')).not.toBeNull();
        // The Daily's pieces come from the day's seed only; the player's own random source is never read.
        expect(vi.mocked(s.random)).not.toHaveBeenCalled();
      }
      controller.destroy();
    }
  });
});
