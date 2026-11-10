import { afterEach, describe, expect, it, vi } from 'vitest';
import game from '../src/games/merge-2048';
import type { GameServices } from '../src/core/game-types';
import {
  TILE_STYLES, TOP_TILE_STYLE, UNDO_CAP, UNDO_START, canMove, maxTile, nextGoal, resolveMove, restore, tileStyle, tilesFromBoard, undosAfterPeak,
  type Board, type Direction, type SavedState
} from '../src/games/merge-2048/logic';

const ids = () => { let id = 1; return () => id++; };
const slide = (board: Board, direction: Direction) => { const next = ids(); return resolveMove(tilesFromBoard(board, next), direction, next); };

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

function services(save?: unknown): GameServices & { values: Map<string, unknown>; cues: string[] } {
  const values = new Map<string, unknown>(), cues: string[] = [];
  if (save !== undefined) values.set('save', save);
  return {
    values, cues,
    storage: { get: <T>(key: string, fallback: T) => (values.get(key) as T | undefined) ?? fallback, set: (key, value) => values.set(key, value), remove: (key) => values.delete(key) },
    sound: { muted: true, setMuted: () => undefined, stop: () => undefined, play: (kind) => { cues.push(kind); } },
    random: () => 0, reportScore: () => undefined, reportComplete: () => undefined, isReducedMotion: true
  };
}
const press = (key: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
const mount = (svc: GameServices) => { const host = document.createElement('div'); document.body.append(host); return { host, controller: game.mount(host, svc) }; };
const boardOf = (svc: { values: Map<string, unknown> }) => (svc.values.get('save') as SavedState).board;

describe('Merge 2048 rules', () => {
  it('merges each tile at most once per move and scores the merged values', () => {
    const result = slide([[2, 2, 2, 2], [4, 0, 4, 8], [2, 4, 8, 16], [0, 0, 0, 0]], 'left');
    expect(result.board).toEqual([[4, 4, 0, 0], [8, 8, 0, 0], [2, 4, 8, 16], [0, 0, 0, 0]]);
    expect(result.gained).toBe(16);
    expect(result.merges).toHaveLength(3);
    expect(slide([[2, 4, 8, 16], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], 'left').changed).toBe(false);
  });

  it('knows when a full board still has a move', () => {
    expect(canMove([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]])).toBe(false);
    expect(canMove([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 4]])).toBe(true);
  });

  it('loads saves from before undo existed and rejects corrupt boards', () => {
    const old = restore({ board: [[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 2048, 0, 0]], score: 40 }, () => 0, 900);
    expect(old).toMatchObject({ score: 40, won: true, undos: UNDO_START, peak: 2048, rec: 900, prev: null });
    for (const bad of [null, {}, { board: [[3, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], score: 1 }, { board: [[2, 2], [2, 2]], score: 1 }, { board: 'x' }]) {
      const fresh = restore(bad, () => 0);
      expect(fresh.score).toBe(0);
      expect(fresh.board.flat().filter(Boolean)).toHaveLength(2);
    }
    expect(restore({ board: [[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], score: 4, undos: 99 }, () => 0).undos).toBe(UNDO_CAP);
  });

  it('awards an undo only for a new best tile of 128 or more, up to the cap', () => {
    expect(undosAfterPeak(1, 32, 64)).toBe(1);
    expect(undosAfterPeak(1, 64, 128)).toBe(2);
    expect(undosAfterPeak(1, 128, 128)).toBe(1);
    expect(undosAfterPeak(UNDO_CAP, 128, 256)).toBe(UNDO_CAP);
    expect(nextGoal(2)).toBe(16);
    expect(nextGoal(64)).toBe(128);
    expect(nextGoal(2048)).toBe(4096);
    expect(maxTile([[2, 0, 0, 0], [0, 512, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])).toBe(512);
  });

  it('keeps every tile digit readable on its background (WCAG 4.5:1)', () => {
    for (let value = 2; value <= 2 ** 17; value *= 2) {
      const style = tileStyle(value);
      expect(contrast(style.bg, style.fg), `tile ${value}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(Object.keys(TILE_STYLES).map(Number)).toContain(32768);
    expect(tileStyle(65536)).toBe(TOP_TILE_STYLE);
  });
});

describe('Merge 2048 play', () => {
  it('undoes the last move once, restores the score and spends an undo', () => {
    const svc = services({ board: [[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], score: 0 });
    const { host, controller } = mount(svc);
    const undo = host.querySelector<HTMLButtonElement>('[data-m48="undo"]')!;
    expect(undo.disabled).toBe(true);
    press('ArrowLeft');
    expect(host.querySelector('[data-score]')?.textContent).toBe('4');
    expect(undo.disabled).toBe(false);
    undo.click();
    expect(host.querySelector('[data-score]')?.textContent).toBe('0');
    expect(boardOf(svc)).toEqual([[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
    expect(host.querySelector('[data-undos]')?.textContent).toBe(`×${UNDO_START - 1}`);
    expect(undo.disabled).toBe(true); // only one step of history
    press('u');
    expect(host.querySelector('[data-score]')?.textContent).toBe('0');
    controller.destroy(); host.remove();
  });

  it('shows the no-moves panel with an instant retry and lets an undo rescue the game', () => {
    // Left merges the two 4s on the bottom row; the 2 that spawns (random 0 -> only free cell) leaves no move.
    const svc = services({ board: [[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [8, 16, 4, 4]], score: 100 });
    svc.random = () => 0.5;
    const { host, controller } = mount(svc);
    press('ArrowLeft');
    const panel = host.querySelector<HTMLElement>('[data-panel]')!;
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain('No moves left');
    expect(svc.cues).toContain('fail');
    press('ArrowUp'); // ignored while lost
    panel.querySelector<HTMLButtonElement>('[data-m48="undo"]')!.click();
    expect(panel.hidden).toBe(true);
    expect(boardOf(svc)[3]).toEqual([8, 16, 4, 4]);
    press('ArrowLeft');
    expect(panel.hidden).toBe(false);
    panel.querySelector<HTMLButtonElement>('[data-m48="retry"]')!.click();
    expect(panel.hidden).toBe(true);
    expect(host.querySelector('[data-score]')?.textContent).toBe('0');
    expect(host.querySelectorAll('.merge-tile')).toHaveLength(2);
    controller.destroy(); host.remove();
  });

  it('celebrates 2048 once, then keeps going; a reload does not celebrate again', () => {
    const svc = services({ board: [[1024, 1024, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], score: 5000 });
    let now = 1000; vi.spyOn(performance, 'now').mockImplementation(() => now);
    const first = mount(svc);
    press('ArrowLeft');
    const panel = first.host.querySelector<HTMLElement>('[data-panel]')!;
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain('2048!');
    expect(svc.cues).toContain('success');
    expect(first.host.querySelector('[data-goal]')?.textContent).toBe('4096');
    press('ArrowRight'); // still locked: a mashed key must not dismiss the panel
    expect(panel.hidden).toBe(false);
    now += 1000; press('ArrowRight');
    expect(panel.hidden).toBe(true);
    expect((svc.values.get('save') as SavedState).won).toBe(true);
    first.controller.destroy(); first.host.remove();
    svc.cues.length = 0;
    const second = mount(svc);
    expect(second.host.querySelector<HTMLElement>('[data-panel]')!.hidden).toBe(true);
    press('ArrowLeft');
    expect(svc.cues).not.toContain('success');
    second.controller.destroy(); second.host.remove();
  });

  it('earns an undo and announces a new best tile', () => {
    const svc = services({ board: [[64, 64, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], score: 300, undos: 1 });
    const { host, controller } = mount(svc);
    press('ArrowLeft');
    expect(host.querySelector('[data-status]')?.textContent).toBe('New best tile: 128! +1 undo');
    expect(host.querySelector('[data-undos]')?.textContent).toBe('×2');
    expect(svc.cues).toContain('upgrade');
    expect(svc.values.get('best-tile')).toBe(128);
    expect(host.querySelector('.merge-tile.tile-128.d3')).not.toBeNull();
    controller.destroy(); host.remove();
  });

  it('runs a move queued during a slide as soon as the slide lands', () => {
    vi.useFakeTimers();
    const svc = services({ board: [[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], score: 0 }); svc.isReducedMotion = false;
    const { host, controller } = mount(svc);
    press('ArrowLeft'); press('ArrowDown');
    vi.advanceTimersByTime(150);
    vi.advanceTimersByTime(150);
    expect(boardOf(svc)[3][0]).toBe(4);
    controller.pause(); press('ArrowUp');
    expect(boardOf(svc)[3][0]).toBe(4);
    controller.destroy(); host.remove();
  });
});

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
