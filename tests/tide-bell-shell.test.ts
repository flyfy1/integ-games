import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameServices, GameStorage } from '../src/core/game-types';
import { actionsFor, gamepadProfiles, gamepadRepeat } from '../src/games/_shared/gamepad-bridge';
import tideBell, { dailyDef, unlockedIds, walkPath } from '../src/games/tide-bell';
import { dailyLevel, generate } from '../src/games/tide-bell/generate';
import { LEVELS } from '../src/games/tide-bell/levels';
import { initialState, parseBoard, replay, solveLevel } from '../src/games/tide-bell/rules';

function storage(): GameStorage & { values: Map<string, unknown> } {
  const values = new Map<string, unknown>();
  return { values, get: <T>(k: string, f: T) => (values.has(k) ? (values.get(k) as T) : f), set: (k, v) => void values.set(k, v), remove: (k) => void values.delete(k) };
}
function services(store = storage()): GameServices {
  return { storage: store, sound: { muted: true, setMuted: vi.fn(), stop: vi.fn(), play: vi.fn() }, random: () => 0.5, reportScore: vi.fn(), reportComplete: vi.fn(), isReducedMotion: true };
}
type Handle = { level: string; moves: number; won: boolean; state: { pos: number; tide: number }; start(id: string): void; screen: string };
const raf = globalThis.requestAnimationFrame;
afterEach(() => { globalThis.requestAnimationFrame = raf; document.body.replaceChildren(); vi.useRealTimers(); });

function mount(store = storage()) {
  globalThis.requestAnimationFrame = (() => 1) as typeof requestAnimationFrame;
  const host = document.createElement('div'); document.body.append(host);
  const svc = services(store);
  const ctl = tideBell.mount(host, svc);
  const root = host.querySelector<HTMLElement>('[data-tide-bell]')!;
  const tb = (root as unknown as { __tb: Handle }).__tb;
  const key = (k: string) => root.querySelector('canvas')!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  return { host, root, tb, key, ctl, svc, store };
}

describe('tide bell shell', () => {
  it('opens straight into level 1 and takes a move from the first key', () => {
    const { tb, key } = mount();
    expect(tb.level).toBe('1-1');
    key('ArrowRight');
    expect(tb.moves).toBe(1);
  });

  it('undoes instantly, and reset is itself undoable', () => {
    const { tb, key } = mount();
    key('ArrowRight'); key('ArrowUp');
    expect(tb.state.tide).toBe(0); // the bell lowered the sea
    key('z');
    expect(tb.moves).toBe(1); expect(tb.state.tide).toBe(1);
    key('r');
    expect(tb.moves).toBe(0);
    key('z');
    expect(tb.moves).toBe(1);
  });

  it('plays a stored solution from keys (as the gamepad bridge sends them), saves the clear and unlocks the next level', () => {
    vi.useFakeTimers();
    const { tb, key, store, svc } = mount();
    for (const d of LEVELS[0].solution) key({ U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight' }[d]!);
    expect(tb.won).toBe(true);
    const save = store.values.get('save') as { best: Record<string, number> };
    expect(save.best['1-1']).toBe(LEVELS[0].par);
    expect(svc.reportScore).toHaveBeenCalledWith(2); // cleared and shortest
    vi.advanceTimersByTime(1000);
    expect(tb.screen).toBe('win');
    key('Enter'); // a synthetic Enter presses Next
    expect(tb.level).toBe('1-2');
    expect(unlockedIds(save.best).has('1-2')).toBe(true);
    expect(unlockedIds(save.best).has('1-3')).toBe(false);
  });

  it('says when the flag is out of reach and offers undo', () => {
    const { tb, key, root } = mount();
    tb.start('1-2');
    for (const k of ['ArrowRight', 'ArrowUp', 'ArrowRight', 'ArrowDown']) key(k); // pushes the log the wrong way
    key('h');
    const banner = root.querySelector<HTMLElement>('.tb-banner')!;
    expect(banner.hidden).toBe(false);
    expect(banner.querySelector('[data-act=undo]')).not.toBeNull();
  });

  it('keeps old progress readable and ignores junk in the save', () => {
    const store = storage();
    store.set('save', { v: 1, best: { '1-1': 8, '1-2': 5, 'zz-9': 3 }, ghosts: ['1-1'], last: '1-3' });
    const { tb } = mount(store);
    expect(tb.level).toBe('1-3');
  });

  it('mounts, pauses, restarts and destroys cleanly', () => {
    const { host, ctl } = mount();
    expect(() => { ctl.pause(); ctl.resume(); ctl.restart(); ctl.destroy(); }).not.toThrow();
    expect(host.childElementCount).toBe(0);
  });

  it('tap-to-walk only walks: it never shoves wood or rings a bell on the way', () => {
    const lv = LEVELS.find(l => l.id === '1-5')!;
    const b = parseBoard(lv.rows, lv.tide), s = initialState(b);
    expect(walkPath(b, s, 2)).toEqual(['R', 'U', 'R']); // from (0,1) to (2,0) around the bell at (0,0), not through it
    expect(walkPath(b, s, b.goal)).toBeNull();
  });

  it('has a controller profile with single-axis repeat and labelled undo / hint', () => {
    const p = gamepadProfiles['tide-bell'];
    expect(p.up).toBe('ArrowUp'); expect(p.south).toBe('Enter'); expect(p.east).toBe('z'); expect(p.north).toBe('h');
    expect(gamepadRepeat['tide-bell'].ArrowLeft).toBeDefined();
    const labels = Object.fromEntries(actionsFor('tide-bell').map(a => [a.key, a.label[0]]));
    expect(labels.z).toBe('Undo'); expect(labels.h).toBe('Hint');
  });
});

describe('tide bell daily cove', () => {
  it('is deterministic per seed and passes the solver filter', () => {
    const a = dailyLevel(12345), b = dailyLevel(12345);
    expect(a).not.toBeNull();
    expect(a).toEqual(b);
    const sol = solveLevel(a!.rows, a!.tide);
    expect(sol.moves?.length).toBe(a!.par);
    expect(a!.par).toBeGreaterThanOrEqual(10);
    expect(a!.par).toBeLessThanOrEqual(24);
    const def = dailyDef(a!, '2026-11-24');
    expect(replay(parseBoard(def.rows, def.tide), def.solution).pos).toBe(parseBoard(def.rows, def.tide).goal);
  });

  it('finds a level for a run of dates', () => {
    for (let s = 1; s <= 4; s++) expect(dailyLevel((s * 2654435761) >>> 0, 2500)).not.toBeNull();
    expect(generate(7, 50)).toBeDefined(); // a tiny budget may come back empty, never throws
  });
});
