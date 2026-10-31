/**
 * Lets a controller play the keyboard-driven cabinets. Each game keeps its own input code: the bridge reads the
 * Gamepad Kit once per frame and sends the matching key events, like the mobile controls do for touch.
 * Pad Pals reads the kit directly because it needs every stick and trigger, so it stays out of this list.
 */
import { BUTTON_INDEX, createInput, startLoop, syntheticKeys, type ButtonName, type Direction, type PadState, type PadStatus } from './gamepad-kit';

export type BridgeControl = Exclude<ButtonName, 'start'> | Direction;
export type BridgeProfile = Partial<Record<BridgeControl, string>>;
type Label = readonly [en: string, zh: string];
type Repeat = { delay: number; every: number };

const ARROWS: BridgeProfile = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
const ACTION: BridgeProfile = { ...ARROWS, south: ' ', select: 'r' };
const CHOICES: BridgeProfile = { ...ACTION, west: '1', north: '2', east: '3' };
export const gamepadProfiles: Record<string, BridgeProfile> = {
  'merge-2048': { ...ARROWS }, 'block-drop': { ...ARROWS, south: 'ArrowUp', east: 'ArrowUp', north: ' ', r1: ' ', select: 'r' }, snake: { ...ARROWS, select: 'r' }, mines: { ...ACTION, south: 'Enter', east: 'f' },
  // Solitaire picks columns by number, so the seven columns sit across the buttons from left to right.
  solitaire: { l2: '1', l1: '2', west: '3', north: '4', east: '5', r1: '6', r2: '7', south: 'd', up: 'w', down: 'Enter', select: 'r' },
  sudoku: { ...ARROWS, south: '1', east: '2', west: '3', north: '4', l1: '5', r1: '6', l2: '7', r2: '8', select: '9', l3: 'Backspace', r3: 'r' },
  'word-grid': { ...ACTION, east: 'Enter' }, memory: { ...ACTION, south: 'Enter' }, stack: { south: ' ', select: 'r' }, flap: { south: ' ', select: 'r' }, breakout: { left: 'ArrowLeft', right: 'ArrowRight', south: ' ' }, invaders: { left: 'ArrowLeft', right: 'ArrowRight', south: ' ' },
  runner: { ...ACTION }, platformer: { ...ACTION }, drive: { left: 'ArrowLeft', right: 'ArrowRight', south: 'ArrowRight', west: 'ArrowLeft' }, 'fruit-merge': { left: 'ArrowLeft', right: 'ArrowRight', south: ' ', select: 'r' }, bubble: { ...ACTION }, 'hex-puzzle': { ...CHOICES }, knife: { south: ' ' }, arena: { ...CHOICES },
  'capital-quiz': { north: '1', east: '2', south: '3', west: '4', r1: 'Enter', l1: 'Enter' },
  ashfall: { ...ARROWS, south: ' ', west: 'j', north: 'k', east: 'l', r1: 'r', l1: 'Enter', select: 'p' }
};

/** Games that act once per key event need a held pad to repeat the way a keyboard does. Held-key games must not repeat. */
const CURSOR: Repeat = { delay: 0.26, every: 0.11 };
const cursorKeys = { ArrowUp: CURSOR, ArrowDown: CURSOR, ArrowLeft: CURSOR, ArrowRight: CURSOR };
export const gamepadRepeat: Record<string, Record<string, Repeat>> = {
  'block-drop': { ArrowLeft: { delay: 0.14, every: 0.04 }, ArrowRight: { delay: 0.14, every: 0.04 }, ArrowDown: { delay: 0.05, every: 0.04 } },
  mines: cursorKeys, memory: cursorKeys, sudoku: cursorKeys, 'word-grid': cursorKeys, 'hex-puzzle': cursorKeys,
  bubble: { ArrowUp: { delay: 0.12, every: 0.04 }, ArrowDown: { delay: 0.12, every: 0.04 }, ArrowLeft: { delay: 0.12, every: 0.04 }, ArrowRight: { delay: 0.12, every: 0.04 } }
};

const COMMON_LABELS: Record<string, Label> = { ArrowUp: ['Up', '上'], ArrowDown: ['Down', '下'], ArrowLeft: ['Left', '左'], ArrowRight: ['Right', '右'], ' ': ['Action', '动作'], Enter: ['Confirm', '确认'], r: ['Restart', '重新开始'] };
const JUMP: Record<string, Label> = { ' ': ['Jump', '跳'], ArrowUp: ['Jump', '跳'] };
const numbered = (keys: string, label: Label) => Object.fromEntries([...keys].map((key) => [key, [`${label[0]} ${key}`, `${label[1]} ${key}`] as Label]));
const GAME_LABELS: Record<string, Record<string, Label>> = {
  'block-drop': { ArrowUp: ['Rotate', '旋转'], ArrowDown: ['Soft drop', '加速下落'], ' ': ['Hard drop', '直接落下'] },
  mines: { Enter: ['Reveal', '翻开'], f: ['Flag', '插旗'] }, solitaire: { ...numbered('1234567', ['Column', '牌列']), d: ['Draw', '翻牌'], w: ['Waste pile', '废牌堆'], Enter: ['To foundation', '收牌'] },
  sudoku: { ...numbered('123456789', ['Number', '数字']), Backspace: ['Erase', '擦除'] }, 'word-grid': { ' ': ['Pick letter', '选字母'], Enter: ['Submit word', '提交单词'] }, memory: { Enter: ['Flip', '翻牌'] },
  stack: { ' ': ['Drop', '落下'] }, flap: { ' ': ['Flap', '扇翅膀'] }, breakout: { ' ': ['Restart', '重新开始'] }, invaders: { ' ': ['Fire', '发射'] }, runner: { ...JUMP, ArrowDown: ['Duck', '下蹲'] }, platformer: JUMP,
  drive: { ArrowRight: ['Drive', '前进'], ArrowLeft: ['Brake', '刹车'] }, 'fruit-merge': { ' ': ['Drop', '落下'] }, bubble: { ' ': ['Shoot', '发射'] }, 'hex-puzzle': { ...numbered('123', ['Piece', '方块']), ' ': ['Place', '放置'] },
  knife: { ' ': ['Throw', '投掷'] }, arena: { ...numbered('123', ['Upgrade', '升级']), ' ': ['Restart', '重新开始'] }, 'capital-quiz': { ...numbered('1234', ['Answer', '答案']), Enter: ['Next', '下一题'] },
  ashfall: { ...JUMP, j: ['Slash', '斩击'], k: ['Shotgun', '霰弹枪'], l: ['Roll', '翻滚'], r: ['Reload', '换弹'], p: ['Pause', '暂停'] }
};
export type GameAction = { key: string; label: Label };
/** Everything a game can be told to do, whether or not a player has left it bound. */
export function actionsFor(slug: string): GameAction[] {
  return [...new Set(Object.values(gamepadProfiles[slug] ?? ACTION))].map((key) => ({ key, label: GAME_LABELS[slug]?.[key] ?? COMMON_LABELS[key] ?? [key, key] }));
}

export const codeForKey = (key: string) => (key === ' ' ? 'Space' : /^[a-z]$/.test(key) ? `Key${key.toUpperCase()}` : /^\d$/.test(key) ? `Digit${key}` : key);

/** Which of a profile's keys the pad is holding now. A key shared by two controls stays held until both let go. */
export function heldKeys(profile: BridgeProfile, pad: PadState, singleAxis = false) {
  const keys = new Set<string>();
  const add = (control: BridgeControl, on: boolean) => { const key = profile[control]; if (on && key) keys.add(key); };
  // A thumb is rarely straight: games that step on each event should only hear the stronger axis.
  const useX = !singleAxis || Math.abs(pad.x) >= Math.abs(pad.y), useY = !singleAxis || !useX;
  add('left', useX && pad.x < -0.5); add('right', useX && pad.x > 0.5); add('up', useY && pad.y < -0.5); add('down', useY && pad.y > 0.5);
  (Object.keys(BUTTON_INDEX) as ButtonName[]).forEach((name) => { if (name !== 'start') add(name, pad.buttons[BUTTON_INDEX[name]]); });
  return keys;
}

/** The next control pressed, for rebinding. Start is left out because it always pauses. */
export function pressedControl(pad: PadState): BridgeControl | null {
  if (pad.dirPressed) return pad.dirPressed;
  const name = (Object.keys(BUTTON_INDEX) as ButtonName[]).find((button) => button !== 'start' && pad.justPressed[BUTTON_INDEX[button]]);
  return name && name !== 'start' ? name : null;
}

/** Turns one player's pad into key events on one target, with the game's repeat rules. Versus runs one per seat. */
export function createKeySender(slug: string, target: () => HTMLElement | null, initial?: BridgeProfile) {
  const repeat = gamepadRepeat[slug] ?? {};
  const singleAxis = slug in gamepadRepeat;
  let profile: BridgeProfile = initial ?? gamepadProfiles[slug] ?? ACTION;
  let held = new Set<string>(), clock = 0;
  const due = new Map<string, number>();
  function send(type: 'keydown' | 'keyup', key: string, isRepeat = false) {
    const event = new KeyboardEvent(type, { key, code: codeForKey(key), repeat: isRepeat, bubbles: true, cancelable: true });
    syntheticKeys.add(event);
    target()?.dispatchEvent(event);
  }
  function sync(next: Set<string>) {
    held.forEach((key) => { if (!next.has(key)) { send('keyup', key); due.delete(key); } });
    next.forEach((key) => {
      if (!held.has(key)) { send('keydown', key); if (repeat[key]) due.set(key, clock + repeat[key].delay); return; }
      const at = due.get(key);
      if (at !== undefined && clock >= at) { send('keydown', key, true); due.set(key, at + repeat[key].every); }
    });
    held = next;
  }
  return {
    step(dt: number, pad: PadState) { clock += dt; sync(heldKeys(profile, pad, singleAxis)); },
    release() { sync(new Set()); },
    tap(key: string) { send('keydown', key); send('keyup', key); },
    setProfile(next: BridgeProfile) { profile = next; }
  };
}

export type BridgeOptions = {
  slug: string;
  /** The element that receives keys; asked every frame because games replace their content. */
  target(): HTMLElement | null;
  isPaused(): boolean;
  togglePause(): void;
  bindings?: BridgeProfile;
  /** Saved pad calibrations, by kind. */
  buttonMaps?: Record<string, number[]>;
  /** Called about twice a second and when a pad connects or goes away. */
  onStatus?(status: PadStatus): void;
};

export function createGamepadBridge({ slug, target, isPaused, togglePause, bindings, buttonMaps, onStatus }: BridgeOptions) {
  const sender = createKeySender(slug, target, bindings);
  let capture: ((control: BridgeControl) => void) | null = null;
  const input = createInput({ keyboard: [], onChange: () => onStatus?.(input.status()) });
  Object.entries(buttonMaps ?? {}).forEach(([kind, map]) => input.setButtonMap(kind, map));
  let statusClock = 0;
  const stop = startLoop((dt) => {
    statusClock -= dt;
    if (statusClock <= 0) { statusClock = 0.5; onStatus?.(input.status()); }
    const pad = input.readMerged();
    if (capture) {
      sender.release();
      const control = pressedControl(pad);
      if (control) { const done = capture; capture = null; done(control); }
      return;
    }
    if (pad.justPressed[BUTTON_INDEX.start]) togglePause();
    if (isPaused()) sender.release(); else sender.step(dt, pad);
  });
  void input.reconnect();
  return {
    connect: input.connect,
    status: input.status,
    setBindings: sender.setProfile,
    /** Sends the next control pressed to `done` instead of the game. Pass null to cancel. */
    capture(done: ((control: BridgeControl) => void) | null) { capture = done; },
    destroy() { stop(); sender.release(); input.destroy(); }
  };
}
export type GamepadBridge = ReturnType<typeof createGamepadBridge>;
