/**
 * Gamepad Kit, ported from the local-game framework in second-brain (projects/261031-gamepad-kit).
 * Differences from that classic script: everything is removable (games mount and unmount inside the SPA),
 * buttons are normalised to the W3C standard order, and each button can be read as a one-frame press.
 * The Twin USB receiver is one USB device carrying two pads, so the Gamepad API only sees one of them:
 * it has to be read through WebHID, which needs desktop Chrome or Edge and a click to open the chooser.
 */
export const BUTTON_INDEX = { south: 0, east: 1, west: 2, north: 3, l1: 4, r1: 5, l2: 6, r2: 7, select: 8, start: 9, l3: 10, r3: 11 } as const;
export type ButtonName = keyof typeof BUTTON_INDEX;
export const BUTTON_NAMES = Object.keys(BUTTON_INDEX) as ButtonName[];
export type Direction = 'up' | 'down' | 'left' | 'right';

type RawPad = { x: number; y: number; hx: number; hy: number; rx: number; ry: number; buttons: boolean[] };
export type VirtualPad = RawPad;

export type PadState = {
  /** Left stick and D-pad together, clamped to the unit circle. */
  x: number; y: number;
  /** D-pad only, for showing which control moved. */
  hx: number; hy: number;
  rx: number; ry: number;
  /** Standard order, see BUTTON_INDEX. */
  buttons: boolean[];
  /** True for one read, on the press. */
  justPressed: boolean[];
  /** True for one read, when the direction first passes half way. */
  dirPressed: Direction | null;
  btn: boolean;
  pressed: boolean;
};

export type HidProfile = {
  name: string; vendorId: number; productId: number;
  reportToPlayer: Record<number, number>;
  minBytes: number;
  /** Raw button index to standard index. Pads differ, so players can recalibrate with setButtonMap. */
  buttonMap: readonly number[];
  parse(data: DataView, deadzone: number): RawPad;
};

const HAT_DIRECTIONS = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
export const applyDeadzone = (value: number, deadzone: number) => (Math.abs(value) < deadzone ? 0 : value);
export const hatToDirection = (hat: number): number[] => HAT_DIRECTIONS[hat] ?? [0, 0];
export function clampToCircle(x: number, y: number): [number, number] {
  const length = Math.hypot(x, y);
  return length > 1 ? [x / length, y / length] : [x, y];
}

export const twinUsb: HidProfile = {
  name: 'Twin USB Gamepad', vendorId: 0x0810, productId: 0x0001,
  reportToPlayer: { 1: 0, 2: 1 },
  minBytes: 6,
  // Usual PlayStation-style receiver order: triangle, circle, cross, square, L2, R2, L1, R1, select, start, L3, R3.
  buttonMap: [3, 1, 0, 2, 6, 7, 4, 5, 8, 9, 10, 11],
  // Report layout from the HID descriptor: Rz, Z, X, Y, hat + buttons 1-4, buttons 5-12.
  parse(data, deadzone) {
    const axis = (i: number) => applyDeadzone(data.getUint8(i) / 127.5 - 1, deadzone);
    const [hx, hy] = hatToDirection(data.getUint8(4) & 0x0f);
    const bits = (data.getUint8(4) >> 4) | (data.getUint8(5) << 4);
    return { x: axis(2), y: axis(3), hx, hy, rx: axis(1), ry: axis(0), buttons: Array.from({ length: 12 }, (_, i) => Boolean(bits & (1 << i))) };
  }
};

/** A keyboard stands in for a pad; `buttons` follows the standard order and each slot may list several keys. */
export type KeyboardMap = { up: string; down: string; left: string; right: string; rup?: string; rdown?: string; rleft?: string; rright?: string; buttons: Array<string | readonly string[]> };
export const DEFAULT_KEYBOARD: KeyboardMap[] = [
  { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', rup: 'KeyT', rdown: 'KeyG', rleft: 'KeyF', rright: 'KeyH', buttons: [['KeyK', 'Space'], 'KeyL', 'KeyJ', 'KeyI', 'KeyQ', 'KeyE', 'KeyZ', 'KeyC', 'Digit1', 'Digit2'] },
  { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', buttons: ['Enter'] }
];

/** Two keyboard players sharing one keyboard; every control exists so each game's full mapping works. Escape stays with the shell. */
export const VERSUS_KEYBOARD: KeyboardMap[] = [
  { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', buttons: ['Space', 'KeyF', 'KeyG', 'KeyR', 'KeyQ', 'KeyE', 'KeyZ', 'KeyX', 'Digit1', [], 'Digit2', 'Digit3'] },
  { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', buttons: ['Enter', 'ShiftRight', 'Period', 'Semicolon', 'KeyK', 'KeyL', 'KeyN', 'KeyM', 'Digit0', [], 'Digit9', 'Digit8'] }
];

/** Key events the bridge made up. They reach window like real ones and must never read back as keyboard input. */
export const syntheticKeys = new WeakSet<Event>();

const emptyRaw = (): RawPad => ({ x: 0, y: 0, hx: 0, hy: 0, rx: 0, ry: 0, buttons: [] });
const isActive = (pad: RawPad) => Boolean(pad.x || pad.y || pad.hx || pad.hy || pad.buttons.some(Boolean));
const remap = (buttons: boolean[], map: readonly number[]) => {
  const mapped: boolean[] = [];
  buttons.forEach((down, i) => { const slot = map[i] ?? i; mapped[slot] = mapped[slot] || down; });
  return mapped;
};
function directionOf(x: number, y: number): Direction | null {
  if (Math.max(Math.abs(x), Math.abs(y)) < 0.5) return null;
  if (Math.abs(x) > Math.abs(y)) return x > 0 ? 'right' : 'left';
  return y > 0 ? 'down' : 'up';
}

export type InputEvent = 'connected' | 'seen' | 'disconnected';
export type InputOptions = {
  players?: number; profiles?: readonly HidProfile[]; keyboard?: readonly KeyboardMap[]; deadzone?: number;
  onChange?: (event: InputEvent, player?: number) => void;
  /** An extra source per player, for an on-screen pad. */
  virtual?: (player: number) => VirtualPad | undefined;
  /** Keep real keys from reaching the page, for when they belong to a seat rather than to whatever has focus. */
  exclusiveKeyboard?: boolean;
};
export type PadStatus = { connected: boolean; name: string | null; players: Array<{ seen: boolean }>; standard: number; hidAvailable: boolean; unclaimedProfile: boolean; ids: string[] };
export type RawPress = { kind: string; index: number };

export function createInput(options: InputOptions = {}) {
  const { players = 2, profiles = [twinUsb], keyboard = DEFAULT_KEYBOARD, deadzone = 0.25, onChange = () => undefined, virtual, exclusiveKeyboard = false } = options;
  const hidPads = Array.from({ length: players }, emptyRaw);
  const seen = Array.from({ length: players }, () => false);
  const keys = new Set<string>();
  /** Keys pressed since the last frame, so a tap shorter than a frame still counts. */
  const tapped = new Set<string>();
  const wasDown = Array.from({ length: players + 1 }, () => [] as boolean[]);
  const wasDirection = Array.from({ length: players + 1 }, () => null as Direction | null);
  const maps = new Map<string, readonly number[]>();
  let rawHeld = new Set<string>();
  let device: HIDDevice | null = null, profile: HidProfile | null = null;
  const abort = new AbortController();
  const hid = typeof navigator !== 'undefined' ? navigator.hid : undefined;

  const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
  const claimed = new Set(keyboard.flatMap((map) => [map.up, map.down, map.left, map.right, map.rup, map.rdown, map.rleft, map.rright, ...map.buttons.flat()]));
  if (typeof addEventListener === 'function') {
    const passThrough = (e: KeyboardEvent) => syntheticKeys.has(e) || typing(e.target) || e.metaKey || e.ctrlKey || e.altKey || e.key === 'Escape' || e.key === 'Tab';
    const capture = exclusiveKeyboard; // Window capture runs first, so stopping here covers every other listener.
    addEventListener('keydown', (e) => { if (passThrough(e)) return; keys.add(e.code); tapped.add(e.code); if (claimed.has(e.code)) e.preventDefault(); if (exclusiveKeyboard) e.stopPropagation(); }, { signal: abort.signal, capture });
    addEventListener('keyup', (e) => { if (syntheticKeys.has(e)) return; keys.delete(e.code); if (exclusiveKeyboard && !passThrough(e)) e.stopPropagation(); }, { signal: abort.signal, capture });
    addEventListener('blur', () => keys.clear(), { signal: abort.signal }); // A key released while unfocused would stick.
  }
  const buttonMapFor = (kind: string, fallback: readonly number[] = []) => maps.get(kind) ?? fallback;
  const clearHid = () => { device = null; profile = null; hidPads.forEach((_, i) => { hidPads[i] = emptyRaw(); }); };
  hid?.addEventListener('disconnect', ((e: HIDConnectionEvent) => {
    if (e.device !== device) return;
    clearHid();
    onChange('disconnected');
  }) as EventListener, { signal: abort.signal });
  if (typeof addEventListener === 'function') addEventListener('gamepaddisconnected', () => onChange('disconnected'), { signal: abort.signal });

  function markSeen(player: number, pad: RawPad) {
    if (seen[player] || !isActive(pad)) return;
    seen[player] = true;
    onChange('seen', player);
  }
  function handleReport(e: HIDInputReportEvent) {
    if (!profile) return;
    const player = profile.reportToPlayer[e.reportId];
    if (player === undefined || player >= players || e.data.byteLength < profile.minBytes) return;
    const next = profile.parse(e.data, deadzone);
    hidPads[player] = next;
    markSeen(player, next);
  }
  async function attach(picked: HIDDevice) {
    if (!picked.opened) await picked.open();
    profile = profiles.find((p) => p.vendorId === picked.vendorId && p.productId === picked.productId) ?? null;
    device = picked;
    picked.addEventListener('inputreport', handleReport as EventListener);
    onChange('connected');
  }
  /** Call from a click: the browser requires a user gesture to show the device chooser. */
  async function connect(): Promise<{ ok: boolean; error?: string }> {
    if (!hid) return { ok: false, error: 'WebHID needs desktop Chrome or Edge' };
    try {
      const [picked] = await hid.requestDevice({ filters: profiles.map(({ vendorId, productId }) => ({ vendorId, productId })) });
      if (!picked) return { ok: false, error: 'No device selected' };
      await attach(picked);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }
  /** Reuses a device this site was already allowed to open. Silent when there is none. */
  async function reconnect(): Promise<boolean> {
    if (!hid) return false;
    try {
      const known = await hid.getDevices();
      const match = known.find((d) => profiles.some((p) => p.vendorId === d.vendorId && p.productId === d.productId));
      if (!match) return false;
      await attach(match);
      return true;
    } catch {
      return false;
    }
  }

  const allGamepads = () => (typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()].filter((g): g is Gamepad => Boolean(g)) : []);
  const isProfilePad = (g: Gamepad) => profiles.some((p) => g.id.toLowerCase().includes(`vendor: ${p.vendorId.toString(16).padStart(4, '0')}`));
  const standardPads = () => allGamepads().filter((g) => !isProfilePad(g));
  function fromStandard(g: Gamepad): RawPad {
    const pressed = (i: number) => Boolean(g.buttons[i]?.pressed);
    return {
      x: applyDeadzone(g.axes[0] ?? 0, deadzone), y: applyDeadzone(g.axes[1] ?? 0, deadzone),
      hx: (pressed(15) ? 1 : 0) - (pressed(14) ? 1 : 0), hy: (pressed(13) ? 1 : 0) - (pressed(12) ? 1 : 0),
      rx: applyDeadzone(g.axes[2] ?? 0, deadzone), ry: applyDeadzone(g.axes[3] ?? 0, deadzone),
      buttons: remap(g.buttons.slice(0, 12).map((b) => b.pressed), buttonMapFor('standard'))
    };
  }
  function fromKeyboard(map: KeyboardMap | undefined): RawPad | null {
    if (!map) return null;
    const down = (code?: string) => Boolean(code) && (keys.has(code!) || tapped.has(code!));
    const on = (code?: string) => (down(code) ? 1 : 0);
    return {
      x: on(map.right) - on(map.left), y: on(map.down) - on(map.up), hx: 0, hy: 0,
      rx: on(map.rright) - on(map.rleft), ry: on(map.rdown) - on(map.rup),
      buttons: map.buttons.map((slot) => [slot].flat().some(down))
    };
  }
  function combine(sources: Array<RawPad | null | undefined>, slot: number): PadState {
    const pad = emptyRaw();
    sources.forEach((source) => {
      if (!source) return;
      pad.x += source.x; pad.y += source.y; pad.hx += source.hx; pad.hy += source.hy; pad.rx += source.rx; pad.ry += source.ry;
      source.buttons.forEach((down, i) => { pad.buttons[i] = pad.buttons[i] || down; });
    });
    [pad.x, pad.y] = clampToCircle(pad.x + pad.hx, pad.y + pad.hy);
    [pad.rx, pad.ry] = clampToCircle(pad.rx, pad.ry);
    const buttons = Array.from({ length: 12 }, (_, i) => Boolean(pad.buttons[i]));
    const justPressed = buttons.map((down, i) => down && !wasDown[slot][i]);
    const direction = directionOf(pad.x, pad.y);
    const dirPressed = direction !== wasDirection[slot] ? direction : null;
    wasDown[slot] = buttons; wasDirection[slot] = direction;
    return { x: pad.x, y: pad.y, hx: clampUnit(pad.hx), hy: clampUnit(pad.hy), rx: pad.rx, ry: pad.ry, buttons, justPressed, dirPressed, btn: buttons.some(Boolean), pressed: justPressed.some(Boolean) };
  }
  function sourcesFor(player: number) {
    const standard = standardPads()[player];
    const fromPad = standard ? fromStandard(standard) : undefined;
    if (fromPad) markSeen(player, fromPad);
    const hidPad = { ...hidPads[player], buttons: remap(hidPads[player].buttons, buttonMapFor('hid', profile?.buttonMap)) };
    return [hidPad, fromPad, fromKeyboard(keyboard[player]), virtual?.(player)];
  }
  /** One state per player. Read once per frame. */
  const finishRead = <T>(state: T) => { queueMicrotask(() => tapped.clear()); return state; }; // Every read in this frame sees the tap.
  const read = () => finishRead(hidPads.map((_, i) => combine(sourcesFor(i), i)));
  /** Every controller and keyboard drives one player, for single-player modes. */
  const readMerged = () => finishRead(combine(hidPads.flatMap((_, i) => sourcesFor(i)), players));

  /** The first newly pressed physical button, before remapping. Used to calibrate an unknown pad. */
  function rawPress(): RawPress | null {
    const held = new Set<string>();
    let found: RawPress | null = null;
    const scan = (kind: string, buttons: boolean[]) => buttons.forEach((down, index) => {
      if (!down) return;
      const key = `${kind}:${index}`;
      held.add(key);
      if (!found && !rawHeld.has(key)) found = { kind, index };
    });
    hidPads.forEach((pad) => scan('hid', pad.buttons));
    standardPads().forEach((g) => scan('standard', g.buttons.slice(0, 12).map((b) => b.pressed)));
    rawHeld = held;
    return found;
  }
  const setButtonMap = (kind: string, map: readonly number[] | null) => { if (map) maps.set(kind, map); else maps.delete(kind); };
  function status(): PadStatus {
    const pads = allGamepads();
    return {
      connected: Boolean(device), name: profile?.name ?? null, players: seen.map((value) => ({ seen: value })), standard: standardPads().length,
      hidAvailable: Boolean(hid), unclaimedProfile: !device && pads.some(isProfilePad), ids: pads.map((g) => g.id)
    };
  }
  function destroy() {
    abort.abort();
    device?.removeEventListener('inputreport', handleReport as EventListener);
    void device?.close().catch(() => undefined);
    clearHid();
    keys.clear(); tapped.clear();
  }
  return { connect, reconnect, read, readMerged, rawPress, setButtonMap, status, destroy };
}
export type PadInput = ReturnType<typeof createInput>;

const clampUnit = (value: number) => Math.max(-1, Math.min(1, value));

/** Calls fn(dt) every frame. dt is capped so a background tab does not jump the game forward. */
export function startLoop(fn: (dt: number) => void, { maxDt = 0.05 } = {}) {
  let last = 0, handle = 0, stopped = false;
  const frame = (now: number) => {
    if (stopped) return;
    const dt = Math.min(maxDt, (now - last) / 1000 || 0);
    last = now;
    fn(dt);
    handle = requestAnimationFrame(frame);
  };
  handle = requestAnimationFrame(frame);
  return () => { stopped = true; cancelAnimationFrame(handle); };
}

/** Melodic cues the arcade's single-note GameSound cannot play. Honors the shell's mute through isMuted. */
export function createSound(isMuted: () => boolean, { volume = 0.8 } = {}) {
  let ctx: AudioContext | undefined, master: GainNode | undefined;
  /** Browsers keep audio silent until a click or key; gamepad buttons do not count. */
  function unlock() {
    if (typeof AudioContext === 'undefined') return;
    try {
      if (!ctx) {
        ctx = new AudioContext();
        master = ctx.createGain();
        master.gain.value = volume;
        const limiter = ctx.createDynamicsCompressor(); // Keeps stacked sounds from clipping.
        master.connect(limiter).connect(ctx.destination);
      }
      if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    } catch { /* Audio can be unavailable; the game stays playable. */ }
  }
  function tone(freq: number, dur = 0.18, type: OscillatorType = 'sine', vol = 0.16, delay = 0, slideTo = 0) {
    if (!ctx || !master || isMuted()) return;
    const t = ctx.currentTime + delay, osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }
  function chime(freq: number, vol = 0.14, delay = 0) {
    tone(freq, 0.35, 'sine', vol, delay);
    tone(freq * 2, 0.22, 'sine', vol * 0.35, delay);
  }
  const destroy = () => { void ctx?.close().catch(() => undefined); ctx = undefined; master = undefined; };
  return { unlock, tone, chime, destroy };
}
