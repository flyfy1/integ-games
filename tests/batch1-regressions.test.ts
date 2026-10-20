import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { makeKit } from '../src/games/arcade-kit';
import hexPuzzle from '../src/games/hex-puzzle';
import type { GameServices } from '../src/core/game-types';

const services = (): GameServices => ({
  storage: { get: (_key, fallback) => fallback, set: vi.fn(), remove: vi.fn() },
  sound: { muted: false, play: vi.fn(), stop: vi.fn(), setMuted: vi.fn() },
  random: () => 0, reportScore: vi.fn(), reportComplete: vi.fn(), isReducedMotion: true
});
afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

describe('batch 1 lifecycle regressions', () => {
  it('mounts Hexa Fit with 49 cells and three tray pieces, immediately accepts a legal placement, and resets identically', () => {
    const calls: unknown[][] = [];
    const ctx = new Proxy({}, { get: (_target, key) => (...args: unknown[]) => { if (key === 'moveTo') calls.push(args); }, set: () => true });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as CanvasRenderingContext2D);
    const host = document.createElement('div'), gameServices = services(); document.body.append(host);
    const controller = hexPuzzle.mount(host, gameServices);
    // Each hex begins with one moveTo: 49 board cells and three single-cell tray pieces.
    expect(calls).toHaveLength(52);
    const canvas = host.querySelector('canvas')!;
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(gameServices.reportScore).toHaveBeenLastCalledWith(1);
    calls.length = 0; controller.restart();
    // Restart initializes state without drawing; the next animation frame renders it.
    const draw = vi.mocked(requestAnimationFrame).mock.calls.at(-1)![0]; draw(0);
    expect(calls).toHaveLength(52);
    controller.destroy();
  });

  it('blocks Kit keyboard and pointer handlers while paused and releases held input before resuming', () => {
    const kit = makeKit(document.createElement('div'), services(), 'arena');
    const keyboard = vi.fn(), pointer = vi.fn(), release = vi.fn();
    kit.on('keydown', keyboard); kit.on('pointerdown', pointer); kit.on('pointercancel', release);
    kit.canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(kit.keys.has('ArrowRight')).toBe(true);
    kit.setPaused(true); expect(kit.keys.size).toBe(0); expect(release).toHaveBeenCalledOnce();
    kit.canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    kit.canvas.dispatchEvent(new Event('pointerdown'));
    expect(keyboard).toHaveBeenCalledOnce(); expect(pointer).not.toHaveBeenCalled(); expect(kit.keys.size).toBe(0);
    kit.setPaused(false); kit.canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(keyboard).toHaveBeenCalledTimes(2); kit.dispose();
  });

  it('keeps mute in place, places pause controls inside every mounted fullscreen stage, and offers SW updates only from the catalog', () => {
    const main = readFileSync('src/main.ts', 'utf8');
    const mute = main.slice(main.indexOf("if (action === 'mute')"), main.indexOf("if (action === 'update'"));
    expect(mute).toContain('shell.setMuted'); expect(mute).toContain("'aria-pressed'"); expect(mute).toContain("'aria-label'");
    expect(mute).not.toMatch(/render\(|destroy\(|mount\(/);
    expect(main).toContain('stage.append(overlay)'); expect(main).not.toContain("querySelector<HTMLElement>('.ashfall-screen')");
    expect(main).not.toContain('continuousGames.has');
    const refresh = main.slice(main.indexOf('onNeedRefresh()'));
    expect(refresh).not.toContain('updateSW(true)');
    expect(main).toContain("action === 'update' && !activeSlug && updateReady");
    expect(main).toContain('setGameActions(false)');
  });
});
