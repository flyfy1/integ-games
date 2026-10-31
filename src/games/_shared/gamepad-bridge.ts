/**
 * Lets a controller play the keyboard-driven cabinets. Each game keeps its own input code: the bridge reads the
 * Gamepad Kit once per frame and sends the matching key events, like the mobile controls do for touch.
 * Pad Pals reads the kit directly because it needs every stick and trigger, so it stays out of this list.
 */
import { BUTTON_INDEX, createInput, startLoop, type ButtonName, type Direction, type InputEvent, type PadState } from './gamepad-kit';

export type BridgeControl = Exclude<ButtonName, 'start'> | Direction;
export type BridgeProfile = Partial<Record<BridgeControl, string>>;

const ARROWS: BridgeProfile = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
const ACTION: BridgeProfile = { ...ARROWS, south: ' ', select: 'r' };
const CHOICES: BridgeProfile = { ...ACTION, west: '1', north: '2', east: '3' };
export const gamepadProfiles: Record<string, BridgeProfile> = {
  'merge-2048': { ...ACTION }, 'block-drop': { ...ACTION, east: 'ArrowUp', west: 'ArrowUp' }, snake: { ...ACTION }, mines: { ...ACTION, south: 'Enter', east: 'f' },
  // Solitaire picks columns by number, so the seven columns sit across the buttons from left to right.
  solitaire: { l2: '1', l1: '2', west: '3', north: '4', east: '5', r1: '6', r2: '7', south: 'd', up: 'w', down: 'Enter', select: 'r' },
  sudoku: { ...ARROWS, south: '1', east: '2', west: '3', north: '4', l1: '5', r1: '6', l2: '7', r2: '8', select: '9', l3: 'Backspace', r3: 'r' },
  'word-grid': { ...ACTION, east: 'Enter' }, memory: { ...ACTION, south: 'Enter' }, stack: { ...ACTION }, flap: { ...ACTION }, breakout: { ...ACTION }, invaders: { ...ACTION },
  runner: { ...ACTION }, platformer: { ...ACTION }, drive: { ...ACTION, south: 'ArrowRight', west: 'ArrowLeft' }, 'fruit-merge': { ...ACTION }, bubble: { ...ACTION }, 'hex-puzzle': { ...CHOICES }, knife: { ...ACTION }, arena: { ...CHOICES },
  'capital-quiz': { north: '1', east: '2', south: '3', west: '4', r1: 'Enter', l1: 'Enter' },
  ashfall: { ...ARROWS, south: ' ', west: 'j', north: 'k', east: 'l', r1: 'r', l1: 'Enter', select: 'p' }
};

export const codeForKey = (key: string) => (key === ' ' ? 'Space' : /^[a-z]$/.test(key) ? `Key${key.toUpperCase()}` : /^\d$/.test(key) ? `Digit${key}` : key);

/** Which of a profile's keys the pad is holding now. A key shared by two controls stays held until both let go. */
export function heldKeys(profile: BridgeProfile, pad: PadState) {
  const keys = new Set<string>();
  const add = (control: BridgeControl, on: boolean) => { const key = profile[control]; if (on && key) keys.add(key); };
  add('left', pad.x < -0.5); add('right', pad.x > 0.5); add('up', pad.y < -0.5); add('down', pad.y > 0.5);
  (Object.keys(BUTTON_INDEX) as ButtonName[]).forEach((name) => { if (name !== 'start') add(name, pad.buttons[BUTTON_INDEX[name]]); });
  return keys;
}

export type BridgeOptions = {
  slug: string;
  /** The element that receives keys; asked every frame because games replace their content. */
  target(): HTMLElement | null;
  isPaused(): boolean;
  togglePause(): void;
  onChange?(event: InputEvent): void;
};

export function createGamepadBridge({ slug, target, isPaused, togglePause, onChange }: BridgeOptions) {
  const profile = gamepadProfiles[slug] ?? ACTION;
  const input = createInput({ keyboard: [], onChange });
  let held = new Set<string>();
  const send = (type: 'keydown' | 'keyup', key: string) => target()?.dispatchEvent(new KeyboardEvent(type, { key, code: codeForKey(key), bubbles: true, cancelable: true }));
  const sync = (next: Set<string>) => {
    held.forEach((key) => { if (!next.has(key)) send('keyup', key); });
    next.forEach((key) => { if (!held.has(key)) send('keydown', key); });
    held = next;
  };
  const stop = startLoop(() => {
    const pad = input.readMerged();
    if (pad.justPressed[BUTTON_INDEX.start]) togglePause();
    sync(isPaused() ? new Set() : heldKeys(profile, pad));
  });
  void input.reconnect();
  return {
    connect: input.connect,
    status: input.status,
    destroy() { stop(); sync(new Set()); input.destroy(); }
  };
}
export type GamepadBridge = ReturnType<typeof createGamepadBridge>;
