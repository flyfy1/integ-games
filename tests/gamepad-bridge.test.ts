import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalog } from '../src/core/catalog';
import { codeForKey, createGamepadBridge, gamepadProfiles, heldKeys } from '../src/games/_shared/gamepad-bridge';
import { BUTTON_INDEX, type PadState } from '../src/games/_shared/gamepad-kit';

const pad = (patch: Partial<PadState>): PadState => ({ x: 0, y: 0, hx: 0, hy: 0, rx: 0, ry: 0, buttons: [], justPressed: [], dirPressed: null, btn: false, pressed: false, ...patch });
const on = (...names: Array<keyof typeof BUTTON_INDEX>) => { const buttons: boolean[] = []; names.forEach((name) => { buttons[BUTTON_INDEX[name]] = true; }); return buttons; };

describe('gamepad bridge mapping', () => {
  it('covers every cabinet except Pad Pals, which reads the kit itself', () => {
    expect(Object.keys(gamepadProfiles).sort()).toEqual(catalog.map((game) => game.slug).filter((slug) => slug !== 'pad-pals').sort());
  });
  it('turns stick and buttons into held keys, joining keys shared by two controls', () => {
    const keys = heldKeys(gamepadProfiles['block-drop'], pad({ x: 1, buttons: on('south', 'east', 'west') }));
    expect([...keys].sort()).toEqual([' ', 'ArrowRight', 'ArrowUp']);
    expect(heldKeys(gamepadProfiles.snake, pad({ x: 0.3 })).size).toBe(0);
  });
  it('gives solitaire all seven columns and sudoku all nine digits', () => {
    expect(new Set(Object.values(gamepadProfiles.solitaire).filter((key) => /\d/.test(key))).size).toBe(7);
    expect(new Set(Object.values(gamepadProfiles.sudoku).filter((key) => /\d/.test(key))).size).toBe(9);
  });
  it('names key codes the way a real keyboard does', () => {
    expect([' ', 'r', '3', 'ArrowUp', 'Enter'].map(codeForKey)).toEqual(['Space', 'KeyR', 'Digit3', 'ArrowUp', 'Enter']);
  });
});

describe('gamepad bridge lifecycle', () => {
  const realGetGamepads = navigator.getGamepads;
  const realRaf = globalThis.requestAnimationFrame;
  afterEach(() => { Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: realGetGamepads }); globalThis.requestAnimationFrame = realRaf; });
  function rig(slug: string) {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
    const axes = [0, 0, 0, 0];
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [{ id: 'Test (STANDARD GAMEPAD)', axes, buttons }] });
    let frame: FrameRequestCallback = () => undefined;
    globalThis.requestAnimationFrame = ((fn: FrameRequestCallback) => { frame = fn; return 1; }) as typeof requestAnimationFrame;
    const target = document.createElement('canvas'), log: string[] = [];
    ['keydown', 'keyup'].forEach((type) => target.addEventListener(type, (e) => log.push(`${type}:${(e as KeyboardEvent).key}`)));
    const state = { paused: false, toggles: 0 };
    const bridge = createGamepadBridge({ slug, target: () => target, isPaused: () => state.paused, togglePause: () => { state.toggles++; } });
    let now = 0;
    return { buttons, axes, log, state, bridge, step: () => { now += 16; frame(now); } };
  }
  it('sends one keydown for a hold and a keyup on release', () => {
    const { buttons, axes, log, step, bridge } = rig('snake');
    axes[0] = 1; step(); step(); step(); axes[0] = 0; step();
    expect(log).toEqual(['keydown:ArrowRight', 'keyup:ArrowRight']);
    buttons[0].pressed = true; step(); buttons[0].pressed = false; step();
    expect(log.slice(2)).toEqual(['keydown: ', 'keyup: ']);
    bridge.destroy();
  });
  it('Start toggles pause once, and a pause releases held keys', () => {
    const { buttons, log, state, step, bridge } = rig('flap');
    buttons[0].pressed = true; step();
    buttons[9].pressed = true; step(); step(); buttons[9].pressed = false;
    expect(state.toggles).toBe(1);
    state.paused = true; step();
    expect(log).toEqual(['keydown: ', 'keyup: ']);
    bridge.destroy();
  });
  it('releases keys on destroy so nothing sticks after leaving a game', () => {
    const { buttons, log, step, bridge } = rig('invaders');
    buttons[0].pressed = true; step(); bridge.destroy();
    expect(log).toEqual(['keydown: ', 'keyup: ']);
  });
  it('hides nothing behind a missing target', () => {
    const fn = vi.fn();
    const bridge = createGamepadBridge({ slug: 'snake', target: () => null, isPaused: () => false, togglePause: fn });
    expect(() => bridge.destroy()).not.toThrow();
  });
});
