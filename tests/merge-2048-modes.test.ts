import { describe, expect, it, vi } from 'vitest';
import game from '../src/games/merge-2048';
import { dailyKey } from '../src/games/_shared/daily';
import type { GameServices } from '../src/core/game-types';
import { seededRandom } from '../src/core/services';
import { boardFromTiles, canMove, maxTile, resolveMove, restore, seededSpawn, tilesFromBoard, type Board, type Cell } from '../src/games/merge-2048/logic';
import { DIRECTIONS, greedy, optimum, puzzleStep, slide } from '../src/games/merge-2048/puzzle-search';
import { MOVE_PUZZLES, puzzleStars, twoStarMoves } from '../src/games/merge-2048/puzzles';

const ids = () => { let id = 1; return () => id++; };

describe('Merge 2048 sizes and stones', () => {
  it('slides 3×3 and 5×5 boards like the 4×4 one', () => {
    const three: Board = [[2, 2, 2], [0, 4, 4], [8, 0, 8]];
    const next = ids();
    const moved = resolveMove(tilesFromBoard(three, next), 'left', next, 3);
    expect(moved.board).toEqual([[4, 2, 0], [8, 0, 0], [16, 0, 0]]);
    const five: Board = [[2, 2, 2, 2, 2], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 4]];
    const n5 = ids();
    expect(resolveMove(tilesFromBoard(five, n5), 'right', n5, 5).board[0]).toEqual([0, 0, 2, 4, 4]);
    const fresh = restore(null, () => 0.3, 0, 5);
    expect(fresh.board).toHaveLength(5); expect(fresh.board.flat().filter(Boolean)).toHaveLength(2);
    expect(restore({ board: [[2, 0, 0], [0, 0, 0], [0, 0, 0]], score: 4 }, () => 0, 0, 3).score).toBe(4);
    // A 4×4 save never loads into a 3×3 game.
    expect(restore({ board: [[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], score: 9 }, () => 0, 0, 3).score).toBe(0);
  });

  it('stops tiles at a stone and never merges across it', () => {
    const stones: Cell[] = [{ x: 2, y: 0 }];
    const next = ids();
    const r = resolveMove(tilesFromBoard([[0, 2, 0, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], next), 'left', next, 4, stones);
    expect(r.board[0]).toEqual([2, 0, 0, 2]);
    const r2 = resolveMove(tilesFromBoard([[2, 0, 0, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], next), 'left', next, 4, stones);
    expect(r2.changed).toBe(false); expect(r2.board[0]).toEqual([2, 0, 0, 2]);
    // Full board except the stone cell: no space and no partners means no move, even though the stone's cell reads 0.
    const full: Board = [[2, 4, 0, 8], [4, 8, 2, 4], [2, 4, 8, 2], [4, 2, 4, 8]];
    expect(canMove(full, [{ x: 2, y: 0 }])).toBe(false);
    expect(canMove(full)).toBe(true);
    // Two equal tiles with the stone between them are not a move.
    expect(canMove([[2, 0, 2, 4], [4, 8, 16, 8], [2, 4, 8, 2], [4, 2, 4, 8]], [{ x: 1, y: 0 }])).toBe(false);
  });

  it('matches the search slide to the cabinet slide on random boards, stones included', () => {
    const random = seededRandom(77);
    for (let i = 0; i < 300; i++) {
      const size = 3 + (i % 3), stones: Cell[] = i % 4 === 0 ? [{ x: 1, y: 1 }] : [];
      const board: Board = Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => (stones.some((s) => s.x === x && s.y === y) || random() < 0.35 ? 0 : 2 ** (1 + Math.floor(random() * 4)))));
      for (const d of DIRECTIONS) {
        const next = ids();
        const a = resolveMove(tilesFromBoard(board, next), d, next, size, stones), b = slide(board, d, stones);
        expect(b.board).toEqual(a.board); expect(b.gained).toBe(a.gained); expect(b.changed).toBe(a.changed);
      }
    }
    expect(boardFromTiles([], 3)).toEqual([[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
  });

  it('spawns the daily and puzzle tiles from (seed, move, board) only, never on a stone', () => {
    const board: Board = [[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 4]];
    const a = seededSpawn(board, 123, 7), b = seededSpawn(board, 123, 7);
    expect(a).toEqual(b);
    const spots = new Set(Array.from({ length: 40 }, (_, m) => JSON.stringify(seededSpawn(board, 123, m))));
    expect(spots.size).toBeGreaterThan(5);
    for (let m = 0; m < 60; m++) { const s = seededSpawn(board, 9, m, [{ x: 1, y: 0 }, { x: 2, y: 2 }])!; expect([s.x, s.y]).not.toEqual([1, 0]); expect([s.x, s.y]).not.toEqual([2, 2]); expect(board[s.y][s.x]).toBe(0); }
    expect(seededSpawn([[2, 4], [8, 16]], 1, 1)).toBeNull();
  });
});

describe('Merge 2048 move puzzles', () => {
  it('has thirty puzzles whose par is the true optimum, found by exhaustive search', () => {
    expect(MOVE_PUZZLES).toHaveLength(30);
    MOVE_PUZZLES.forEach((p, i) => {
      expect(maxTile(p.rows), `#${i + 1}`).toBeLessThan(p.target);
      const best = optimum(p, p.par);
      expect(best?.moves, `#${i + 1}`).toBe(p.par);
      // Nothing shorter exists: a search one move shallower finds nothing.
      expect(optimum(p, p.par - 1), `#${i + 1}`).toBeNull();
      expect(p.par).toBeGreaterThanOrEqual(4);
      expect(p.moves).toBeGreaterThanOrEqual(p.par + 3);
      // Replaying the found line through the spawn rule lands on the target.
      let board = p.rows;
      best!.line.forEach((d, m) => { board = puzzleStep(p, board, d, m + 1)!; });
      expect(maxTile(board)).toBeGreaterThanOrEqual(p.target);
    });
  }, 120_000);

  it('is not solved at par by just taking the biggest merge every move', () => {
    const beaten = MOVE_PUZZLES.filter((p) => { const g = greedy(p, p.par); return g === null || g > p.par; });
    expect(beaten.length).toBe(MOVE_PUZZLES.length);
  });

  it('scores stars by moves used', () => {
    const p = MOVE_PUZZLES[3];
    expect(puzzleStars(p, p.par)).toBe(3); expect(puzzleStars(p, twoStarMoves(p))).toBe(2); expect(puzzleStars(p, p.moves)).toBe(1); expect(puzzleStars(p, p.moves + 1)).toBe(0);
  });
});


function cabinet(seed: Record<string, unknown> = {}, seat = false, rng = 5) {
  const values = new Map<string, unknown>(Object.entries(seed));
  let n = rng;
  const services: GameServices = {
    storage: { get: <T>(key: string, fallback: T) => (values.has(key) ? values.get(key) as T : fallback), set: (key, value) => { values.set(key, value); }, remove: (key) => { values.delete(key); } },
    sound: { muted: true, setMuted: () => undefined, stop: () => undefined, play: () => undefined },
    random: () => { n = (1664525 * n + 1013904223) >>> 0; return n / 2 ** 32; },
    reportScore: vi.fn(), reportComplete: vi.fn(), isReducedMotion: true
  };
  const parent = document.createElement('div'); if (seat) parent.dataset.versusSeat = ''; document.body.append(parent);
  const host = document.createElement('div'); parent.append(host);
  const controller = game.mount(host, services);
  const press = (key: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  const click = (sel: string) => host.querySelector<HTMLElement>(sel)!.click();
  const done = () => { controller.destroy(); parent.remove(); };
  return { values, services, host, press, click, done };
}
const arrow = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' } as const;

describe('Merge 2048 cabinet modes', () => {
  it('keeps a separate save and best per board size, and only the 4×4 reports to the leaderboard', () => {
    const classicSave = { board: [[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], score: 40 };
    const g = cabinet({ save: classicSave, best: 900, 'best-tile': 256 });
    g.click('[data-mode="small"]');
    expect(g.host.querySelectorAll('.m48-cell')).toHaveLength(9);
    for (const k of ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) g.press(k);
    expect(g.values.get('save-3')).toBeDefined();
    expect((g.values.get('save-3') as { board: number[][] }).board).toHaveLength(3);
    expect(g.services.reportScore).not.toHaveBeenCalled();
    expect(g.values.get('best')).toBe(900); expect(g.values.get('best-tile')).toBe(256);
    g.click('[data-mode="large"]');
    expect(g.host.querySelectorAll('.m48-cell')).toHaveLength(25);
    g.press('ArrowLeft'); g.press('ArrowUp');
    expect((g.values.get('save-5') as { board: number[][] }).board).toHaveLength(5);
    expect(g.services.reportScore).not.toHaveBeenCalled();
    // Back on the classic board the original save is still there and play reports as before.
    g.click('[data-mode="classic"]');
    expect(g.host.querySelector('[data-score]')!.textContent).toBe('40');
    g.press('ArrowLeft');
    expect(g.host.querySelector('[data-score]')!.textContent).toBe('44');
    expect(g.services.reportScore).toHaveBeenCalledWith(44);
    expect(g.values.get('mode')).toBe('classic');
    g.done();
  });

  it('plays a stones board with two fixed stones that survive a reload', () => {
    const g = cabinet({ mode: 'stones' });
    expect(g.host.querySelectorAll('.m48-stone')).toHaveLength(2);
    g.press('ArrowLeft'); g.press('ArrowDown');
    const saved = g.values.get('save-stones') as { stones: Cell[]; board: number[][] };
    expect(saved.stones).toHaveLength(2);
    saved.stones.forEach((c) => expect(saved.board[c.y][c.x]).toBe(0));
    g.done();
    const again = cabinet(Object.fromEntries(g.values));
    const pos = [...again.host.querySelectorAll<HTMLElement>('.m48-stone')].map((e) => `${e.style.getPropertyValue('--x')},${e.style.getPropertyValue('--y')}`);
    expect(pos.sort()).toEqual(saved.stones.map((c) => `${c.x},${c.y}`).sort());
    expect(again.services.reportScore).not.toHaveBeenCalled();
    again.done();
  });

  it('deals the same Daily to every player, ends after 150 moves and records the day off the leaderboard', () => {
    // Different players have different random sources; the Daily must not depend on them.
    const play = (rng: number) => {
      const g = cabinet({ mode: 'daily' }, false, rng);
      const boards: string[] = [];
      const keys = ['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowDown'];
      for (let i = 0; i < 400 && g.host.querySelector<HTMLElement>('[data-panel]')!.hidden; i++) { g.press(keys[i % 4]); if (i < 20) boards.push(JSON.stringify((g.values.get('save-daily') as { board: number[][] } | undefined)?.board)); }
      const save = g.values.get('save-daily') as { moves: number; score: number };
      const result = { boards, moves: save.moves, score: save.score, panel: g.host.querySelector('[data-panel]')!.textContent, daily: g.values.get('daily'), reported: vi.mocked(g.services.reportScore).mock.calls.length };
      g.done(); return result;
    };
    const a = play(5), b = play(987654);
    expect(a.boards).toEqual(b.boards);
    expect(a.score).toBe(b.score);
    expect(a.moves).toBeLessThanOrEqual(150);
    expect(a.panel).toContain('Daily done');
    expect(a.daily).toBeDefined();
    expect(a.reported).toBe(0);
  });

  it('solves a move puzzle with the searched line for three stars, and the next one unlocks', () => {
    const g = cabinet({ mode: 'puzzle', 'puzzle-index': 4 });
    // A stored puzzle resumes straight away; the Puzzles button opens the picker.
    expect(g.host.querySelector<HTMLElement>('[data-panel]')!.hidden).toBe(true);
    expect(g.host.querySelector('[data-score]')!.textContent).toBe(`0/${MOVE_PUZZLES[4].moves}`);
    g.click('[data-modes] [data-mode="puzzle"]');
    expect(g.host.querySelector('[data-panel]')!.textContent).toContain('Move puzzles');
    g.click('[data-puzzle="0"]');
    const p = MOVE_PUZZLES[0], line = optimum(p, p.par)!.line;
    for (const d of line) g.press(arrow[d]);
    expect(g.host.querySelector('[data-panel]')!.textContent).toContain('Puzzle 1 solved');
    expect((g.values.get('puzzle-stars') as number[])[0]).toBe(3);
    expect(g.services.reportScore).not.toHaveBeenCalled();
    expect(g.values.has('save')).toBe(false);
    g.click('[data-m48="next"]');
    expect(g.host.querySelector('[data-score]')!.textContent).toBe(`0/${MOVE_PUZZLES[1].moves}`);
    // Puzzles allow undo as often as you like, and the spawns are the same after an undo.
    g.press('ArrowLeft'); g.press('ArrowUp');
    const after = g.host.querySelector('.merge-board')!.innerHTML;
    g.press('u'); g.press('ArrowUp');
    expect(g.host.querySelector('.merge-board')!.textContent).toBe(new DOMParser().parseFromString(after, 'text/html').body.textContent);
    g.press('u'); g.press('u');
    expect(g.host.querySelector('[data-score]')!.textContent).toBe(`0/${MOVE_PUZZLES[1].moves}`);
    g.done();
  });

  it('M cycles the boards, also out of a finished Daily, so arrow-and-button controllers are never stuck', () => {
    const g = cabinet();
    const order: string[] = [];
    for (let i = 0; i < 6; i++) { g.press('m'); order.push(String(g.values.get('mode'))); }
    expect(order).toEqual(['small', 'large', 'stones', 'daily', 'puzzle', 'classic']);
    g.done();
    const d = cabinet({ mode: 'daily', 'save-daily': { board: [[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]], score: 10, moves: 150, key: dailyKey() } });
    expect(d.host.querySelector('[data-panel]')!.textContent).toContain('Daily done');
    d.press('m');
    expect(d.values.get('mode')).toBe('puzzle');
    expect(d.host.querySelector<HTMLElement>('[data-panel]')!.hidden).toBe(true);
    d.done();
  });

  it('keeps split-screen seats on the classic board whatever mode was last picked', () => {
    const g = cabinet({ mode: 'large', save: { board: [[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], score: 0 } }, true);
    expect(g.host.querySelector<HTMLElement>('[data-modes]')!.hidden).toBe(true);
    expect(g.host.querySelectorAll('.m48-cell')).toHaveLength(16);
    g.press('ArrowLeft');
    expect(g.services.reportScore).toHaveBeenCalledWith(4);
    g.done();
  });
});
