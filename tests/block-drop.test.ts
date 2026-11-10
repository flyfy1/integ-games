import { describe, expect, it, vi } from 'vitest';
import blockDrop from '../src/games/block-drop';
import { COLS, HIDDEN, ROWS, SHAPES, cellsOf, collides, createGame, finishClear, ghostY, gravityMs, holdPiece, lockPiece, newBag, rotate, shift, spawn, stackHeight, type Game, type PieceType } from '../src/games/block-drop/logic';
import { computeLayout } from '../src/games/block-drop/render';
import type { GameServices } from '../src/core/game-types';

const lcg = (seed = 7) => () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
/** A game whose active piece is `type`, on a board described bottom-up with '#' for filled cells. */
function setup(type: PieceType, bottomRows: string[] = []): Game {
  const game = createGame(lcg());
  bottomRows.forEach((row, i) => { game.board[ROWS - bottomRows.length + i] = [...row].map((ch) => (ch === '#' ? 1 : 0)); });
  spawn(game, type);
  return game;
}
const dropAndLock = (game: Game) => { while (shift(game, 0, 1)) undefined; return lockPiece(game)!; };

describe('block drop pieces', () => {
  it('gives every piece four cells in each of four rotations', () => {
    expect(SHAPES).toHaveLength(7);
    SHAPES.forEach((rotations) => { expect(rotations).toHaveLength(4); rotations.forEach((cells) => expect(cells).toHaveLength(4)); });
  });

  it('deals each of the seven pieces exactly once per bag, from the supplied random source', () => {
    const random = lcg(42);
    for (let i = 0; i < 20; i++) expect([...newBag(random)].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(newBag(lcg(3))).toEqual(newBag(lcg(3)));
    expect(newBag(() => 0.999999)).toHaveLength(7);
    const game = createGame(lcg(9));
    const seen: number[] = [game.active!.type];
    for (let i = 0; i < 13; i++) { dropAndLock(game); game.board.forEach((row) => row.fill(0)); seen.push(game.active!.type); }
    expect([...seen.slice(0, 7)].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect([...seen.slice(7, 14)].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('spawns inside the well, visible, with three pieces queued', () => {
    for (const type of [0, 1, 2, 3, 4, 5, 6] as PieceType[]) {
      const game = setup(type);
      expect(collides(game.board, game.active!)).toBe(false);
      expect(Math.max(...cellsOf(game.active!).map(([, y]) => y))).toBeGreaterThanOrEqual(HIDDEN);
      expect(game.queue.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('block drop movement', () => {
  it('stops at walls and the floor, and the ghost marks the landing row', () => {
    const game = setup(1);
    let steps = 0; while (shift(game, -1, 0)) steps++;
    expect(steps).toBe(4);
    expect(Math.min(...cellsOf(game.active!).map(([x]) => x))).toBe(0);
    const landing = ghostY(game);
    while (shift(game, 0, 1)) undefined;
    expect(game.active!.y).toBe(landing);
    expect(Math.max(...cellsOf(game.active!).map(([, y]) => y))).toBe(ROWS - 1);
  });

  it('kicks a turn off the wall instead of refusing it', () => {
    const game = setup(0);
    expect(rotate(game, 1)).toBe(true); // vertical I
    while (shift(game, 1, 0)) undefined; // hug the right wall
    expect(Math.max(...cellsOf(game.active!).map(([x]) => x))).toBe(COLS - 1);
    expect(rotate(game, 1)).toBe(true); // back to flat needs a kick
    const xs = cellsOf(game.active!).map(([x]) => x);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0); expect(Math.max(...xs)).toBeLessThan(COLS);
    expect(collides(game.board, game.active!)).toBe(false);
  });

  it('returns to the start after four turns either way in open space', () => {
    for (const type of [0, 2, 3, 4, 5, 6] as PieceType[]) {
      const game = setup(type); shift(game, 0, 5);
      const start = JSON.stringify(cellsOf(game.active!));
      for (let i = 0; i < 4; i++) rotate(game, 1);
      expect(JSON.stringify(cellsOf(game.active!))).toBe(start);
      rotate(game, 1); rotate(game, -1);
      expect(JSON.stringify(cellsOf(game.active!))).toBe(start);
    }
  });

  it('holds once per piece and swaps back the held piece', () => {
    const game = setup(2);
    const upcoming = game.queue[0];
    expect(holdPiece(game)).toBe(true);
    expect(game.hold).toBe(2); expect(game.active!.type).toBe(upcoming);
    expect(holdPiece(game)).toBe(false);
    dropAndLock(game);
    expect(game.canHold).toBe(true);
    const current = game.active!.type;
    expect(holdPiece(game)).toBe(true);
    expect(game.active!.type).toBe(2); expect(game.hold).toBe(current);
  });
});

describe('block drop scoring', () => {
  const almost = '#########.';
  it('keeps full rows until finishClear, then collapses them and brings the next piece', () => {
    const game = setup(0, [almost, almost, almost, almost]);
    rotate(game, 1); while (shift(game, 1, 0)) undefined;
    const result = dropAndLock(game);
    expect(result.rows).toEqual([ROWS - 4, ROWS - 3, ROWS - 2, ROWS - 1]);
    expect(result.gained).toBe(800 + 2000); // four rows, and the well is empty afterwards
    expect(result.perfect).toBe(true);
    expect(game.active).toBeNull(); expect(game.clearing).toHaveLength(4);
    expect(game.board[ROWS - 1].every(Boolean)).toBe(true);
    finishClear(game);
    expect(stackHeight(game)).toBe(0); expect(game.lines).toBe(4); expect(game.active).not.toBeNull();
  });

  it('scores 100 / 300 / 500 for one to three rows at level 1', () => {
    [1, 2, 3].forEach((count) => {
      const game = setup(0, ['#.........', ...Array<string>(count).fill(almost)]);
      rotate(game, 1); while (shift(game, 1, 0)) undefined;
      expect(dropAndLock(game).gained).toBe([0, 100, 300, 500][count]);
    });
  });

  it('adds a combo bonus for consecutive clears and resets it on a miss', () => {
    const simple = setup(1, ['########..', '########..', '########..', '########..']);
    while (shift(simple, 1, 0)) undefined;
    const first = dropAndLock(simple); finishClear(simple);
    expect(first.rows).toHaveLength(2); expect(first.gained).toBe(300); expect(first.combo).toBe(0);
    spawn(simple, 1); while (shift(simple, 1, 0)) undefined;
    const second = dropAndLock(simple); finishClear(simple);
    expect(second.gained).toBe(300 + 50 + 2000); expect(second.combo).toBe(1);
    spawn(simple, 1);
    expect(dropAndLock(simple).combo).toBe(0); expect(simple.combo).toBe(-1);
  });

  it('pays back-to-back four-row clears one and a half times', () => {
    const rows = ['#.........', almost, almost, almost, almost];
    const game = setup(0, rows);
    rotate(game, 1); while (shift(game, 1, 0)) undefined;
    expect(dropAndLock(game).gained).toBe(800); finishClear(game);
    for (let i = 0; i <= 4; i++) game.board[ROWS - 1 - i] = [...almost].map((ch) => (ch === '#' ? 1 : 0));
    spawn(game, 0); rotate(game, 1); while (shift(game, 1, 0)) undefined;
    const second = dropAndLock(game);
    expect(second.backToBack).toBe(true);
    expect(second.gained).toBe(1200 + 50);
  });

  it('recognises a T turned into a three-corner slot and pays it as a spin', () => {
    const fill = (row: string) => [...row].map((ch) => (ch === '#' ? 1 : 0));
    const game = setup(2);
    game.board[ROWS - 3] = fill('#.........'); // overhang above the slot
    game.board[ROWS - 2] = fill('...#######');
    game.board[ROWS - 1] = fill('#.########');
    game.active = { type: 2, rot: 2, x: 0, y: ROWS - 3 }; // stem down in the gap
    expect(collides(game.board, game.active)).toBe(false);
    game.turnedLast = true;
    const result = lockPiece(game)!;
    expect(result.spin).toBe(true); expect(result.rows).toHaveLength(2); expect(result.gained).toBe(1200);
    // Slid in rather than turned in: an ordinary double.
    const slid = setup(2);
    slid.board[ROWS - 3] = fill('#.........'); slid.board[ROWS - 2] = fill('...#######'); slid.board[ROWS - 1] = fill('#.########');
    slid.active = { type: 2, rot: 2, x: 0, y: ROWS - 3 }; slid.turnedLast = false;
    expect(lockPiece(slid)!.gained).toBe(300);
  });

  it('levels up every ten lines and speeds gravity up monotonically', () => {
    const game = setup(0, ['#.........', almost, almost, almost, almost]);
    game.lines = 8;
    rotate(game, 1); while (shift(game, 1, 0)) undefined;
    const result = dropAndLock(game);
    expect(result.levelUp).toBe(true); expect(game.level).toBe(2);
    expect(gravityMs(1)).toBe(1000);
    for (let level = 1; level < 25; level++) expect(gravityMs(level + 1)).toBeLessThanOrEqual(gravityMs(level));
    expect(gravityMs(40)).toBeGreaterThanOrEqual(20);
  });

  it('ends the run when the entry cells are blocked', () => {
    const game = setup(1);
    for (let y = 0; y < 6; y++) game.board[y] = Array(COLS).fill(1).map((v, x) => (x === 0 ? 0 : v));
    expect(spawn(game, 2)).toBe(false);
    expect(game.over).toBe(true); expect(game.active).toBeNull();
    expect(shift(game, 1, 0)).toBe(false); expect(lockPiece(game)).toBeNull();
  });
});

describe('block drop layout', () => {
  it('fits a phone and a desktop stage without overflowing, with a readable well', () => {
    for (const [w, h] of [[374, 470], [374, 520], [320, 400], [1010, 590], [480, 600], [1400, 900]] as const) {
      const layout = computeLayout(w, h);
      expect(layout.w).toBeLessThanOrEqual(w);
      expect(layout.well.w).toBe(layout.cell * COLS); expect(layout.well.h).toBe(layout.cell * 20);
      expect(layout.next.x + layout.next.w).toBeLessThanOrEqual(layout.w);
      if (h >= 470) { expect(layout.h).toBeLessThanOrEqual(h); expect(layout.cell).toBeGreaterThanOrEqual(20); }
    }
    expect(computeLayout(374, 470).compact).toBe(true);
    expect(computeLayout(1010, 590).compact).toBe(false);
  });
});

describe('block drop module', () => {
  const services = (): GameServices => {
    const values = new Map<string, unknown>();
    return {
      storage: { get: <T>(key: string, fallback: T) => (values.get(key) as T | undefined) ?? fallback, set: (key, value) => { values.set(key, value); }, remove: (key) => { values.delete(key); } },
      sound: { muted: false, play: vi.fn(), stop: vi.fn(), setMuted: vi.fn() }, random: lcg(5), reportScore: vi.fn(), reportComplete: vi.fn(), isReducedMotion: true
    };
  };
  const press = (root: Element, key: string) => { root.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); root.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true })); };

  it('plays to a game over from key events on the canvas, saves the best score, and retries on R', () => {
    const host = document.createElement('div'); document.body.append(host);
    const s = services(), controller = blockDrop.mount(host, s);
    const canvas = host.querySelector('canvas')!;
    for (let i = 0; i < 60; i++) press(canvas, ' ');
    expect(vi.mocked(s.sound.play).mock.calls.some(([kind]) => kind === 'fail')).toBe(true);
    const panel = host.querySelector<HTMLElement>('[role=dialog]')!;
    expect(panel.hidden).toBe(false); expect(panel.querySelector('[data-retry]')).not.toBeNull();
    const score = vi.mocked(s.reportScore).mock.calls.at(-1)![0];
    expect(score).toBeGreaterThan(0); expect(s.storage.get('block-drop-best', 0)).toBe(score);
    press(canvas, 'r');
    expect(panel.hidden).toBe(true);
    controller.destroy(); expect(host.childElementCount).toBe(0);
  });

  it('ignores input while paused', () => {
    const host = document.createElement('div'); document.body.append(host);
    const s = services(), controller = blockDrop.mount(host, s);
    controller.pause(); vi.mocked(s.sound.play).mockClear();
    for (let i = 0; i < 5; i++) press(host.querySelector('canvas')!, ' ');
    expect(s.sound.play).not.toHaveBeenCalled();
    controller.resume(); press(host.querySelector('canvas')!, ' ');
    expect(s.sound.play).toHaveBeenCalledWith('tap');
    controller.destroy();
  });
});
