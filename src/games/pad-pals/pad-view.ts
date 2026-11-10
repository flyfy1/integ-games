/** The big controller drawn under every screen: it mirrors the real pad, shows what to press, and works as a touch pad. */
import { BUTTON_INDEX, type ButtonName, type PadState, type VirtualPad } from '../_shared/gamepad-kit';

export const WIDTH = 1280, HEIGHT = 720, PLAY_HEIGHT = 490;
export type Highlight = ButtonName | 'dpad' | 'stick' | 'rstick';
export type GlyphSet = 'ps' | 'xbox' | 'keys';

const LABELS: Record<GlyphSet, Partial<Record<ButtonName, string>>> = {
  ps: { south: '✕', east: '○', west: '□', north: '△', l1: 'L1', r1: 'R1', l2: 'L2', r2: 'R2', select: 'SEL', start: 'START' },
  xbox: { south: 'A', east: 'B', west: 'X', north: 'Y', l1: 'LB', r1: 'RB', l2: 'LT', r2: 'RT', select: 'BACK', start: 'START' },
  keys: { south: 'K', east: 'L', west: 'J', north: 'I', l1: 'Q', r1: 'E', l2: 'Z', r2: 'C', select: '1', start: '2' }
};
export const glyphFor = (set: GlyphSet, button: ButtonName) => LABELS[set][button] ?? '';

/** Colors follow the button's position, so the words and the picture always agree whatever the pad prints on it. */
export const BUTTON_COLORS: Partial<Record<ButtonName, string>> = { south: '#3ecf7a', east: '#ff5d6c', west: '#4a9bff', north: '#ffc93c', l1: '#b38cff', r1: '#b38cff', l2: '#ff9a4a', r2: '#ff9a4a', select: '#9aa7c7', start: '#9aa7c7' };

type Round = { x: number; y: number; r: number };
type Tab = { x: number; y: number; w: number; h: number };
const FACE_X = 1065, FACE_Y = 606, DPAD_X = 215, DPAD_Y = 606, STICK_R = 62;
const ROUND: Partial<Record<ButtonName, Round>> = {
  north: { x: FACE_X, y: FACE_Y - 56, r: 36 }, south: { x: FACE_X, y: FACE_Y + 56, r: 36 },
  west: { x: FACE_X - 66, y: FACE_Y, r: 36 }, east: { x: FACE_X + 66, y: FACE_Y, r: 36 }
};
const TABS: Partial<Record<ButtonName, Tab>> = {
  l2: { x: 104, y: 494, w: 146, h: 44 }, l1: { x: 262, y: 494, w: 146, h: 44 },
  r1: { x: 872, y: 494, w: 146, h: 44 }, r2: { x: 1030, y: 494, w: 146, h: 44 },
  select: { x: 520, y: 566, w: 104, h: 40 }, start: { x: 656, y: 566, w: 104, h: 40 }
};
const LEFT_STICK = { x: 430, y: 646 }, RIGHT_STICK = { x: 850, y: 646 };
/** A small chip in the empty middle of the pad. In full screen it opens the game's own buttons. */
const MENU = { x: 588, y: 640, w: 104, h: 48 };
/** Shoulder tabs are thin, so touches count from a little above them: small fingers aim badly. */
const TAB_REACH = 40;
const STICK_KEYS = { left: ['W', 'A', 'S', 'D'], right: ['T', 'F', 'G', 'H'] } as const;

/** What a helping hand shows: buttons to press and where to push each stick. It is drawn, never fed to the game. */
export type Demo = { press?: readonly ButtonName[]; hold?: boolean; x?: number; y?: number; rx?: number; ry?: number };
export type PadExtras = { demo?: Demo; menu?: boolean };
export const hitsMenu = (x: number, y: number) => x >= MENU.x - 8 && x <= MENU.x + MENU.w + 8 && y >= MENU.y - 8 && y <= MENU.y + MENU.h + 8;

const pulse = (time: number) => 0.5 + 0.5 * Math.sin(time * 7);

function ring(g: CanvasRenderingContext2D, x: number, y: number, r: number, time: number) {
  g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.globalAlpha = 0.45 + 0.55 * pulse(time);
  g.beginPath(); g.arc(x, y, r + 8 + 6 * pulse(time), 0, Math.PI * 2); g.stroke();
  g.globalAlpha = 1;
}

export function drawChip(g: CanvasRenderingContext2D, button: ButtonName, x: number, y: number, r: number, glyphs: GlyphSet, down = false) {
  g.fillStyle = BUTTON_COLORS[button] ?? '#c7d0e4'; g.globalAlpha = down ? 1 : 0.86;
  g.beginPath(); g.arc(x, y + (down ? 3 : 0), r, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
  g.fillStyle = '#1a2036'; g.font = `800 ${Math.round(r * 0.8)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(glyphFor(glyphs, button), x, y + (down ? 3 : 0) + 1);
}

function hand(g: CanvasRenderingContext2D, x: number, y: number, lift: number) {
  // Tilted so the fingertip lands on the control while the hand stays clear of it, and of the bottom edge.
  g.save(); g.translate(x, y + lift); g.rotate(-0.5);
  g.font = '54px system-ui, "Apple Color Emoji", "Segoe UI Emoji"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#000';
  g.fillText('👆', 3, 30);
  g.restore();
}
/** A finger that taps the right button or pushes the right stick, so nobody has to read to know what to do. */
function drawDemo(g: CanvasRenderingContext2D, demo: Demo, highlights: readonly Highlight[], time: number) {
  const beat = (time * 1.5) % 1, lift = demo.hold ? 0 : beat < 0.55 ? 16 * (1 - beat / 0.55) : 0;
  for (const name of demo.press ?? []) {
    if (!highlights.includes(name)) continue;
    const round = ROUND[name], tab = TABS[name];
    if (round) hand(g, round.x, round.y, lift);
    else if (tab) hand(g, tab.x + tab.w / 2, tab.y + tab.h / 2, lift);
  }
  const push = Math.min(1, ((time * 0.9) % 1) * 2.2);
  const stick = (at: { x: number; y: number }, x: number, y: number) => hand(g, at.x + x * 34 * push, at.y + y * 34 * push, 0);
  const x = demo.x ?? 0, y = demo.y ?? 0, rx = demo.rx ?? 0, ry = demo.ry ?? 0;
  if ((x || y) && highlights.includes('dpad') && !highlights.includes('stick')) {
    const flat = Math.abs(x) > Math.abs(y);
    hand(g, DPAD_X + (flat ? Math.sign(x) * 48 : 0), DPAD_Y + (flat ? 0 : Math.sign(y) * 48), lift);
  } else if ((x || y) && highlights.includes('stick')) stick(LEFT_STICK, x, y);
  if ((rx || ry) && highlights.includes('rstick')) stick(RIGHT_STICK, rx, ry);
}

export function drawPad(g: CanvasRenderingContext2D, pad: PadState, highlights: readonly Highlight[], time: number, glyphs: GlyphSet, extras: PadExtras = {}) {
  const lit = (name: Highlight) => highlights.includes(name);
  const down = (name: ButtonName) => pad.buttons[BUTTON_INDEX[name]];
  (Object.entries(TABS) as Array<[ButtonName, Tab]>).filter(([name]) => name[0] === 'l' || name[0] === 'r').forEach(([name, tab]) => drawTab(g, name, tab, down(name), lit(name), time, glyphs));
  g.fillStyle = '#2b3350';
  g.beginPath(); g.roundRect(60, 530, 1160, 182, 72); g.fill();
  g.fillStyle = '#343e60';
  g.beginPath(); g.roundRect(72, 540, 1136, 162, 64); g.fill();
  (['select', 'start'] as const).forEach((name) => drawTab(g, name, TABS[name]!, down(name), lit(name), time, glyphs));

  g.fillStyle = '#20263d';
  g.fillRect(DPAD_X - 72, DPAD_Y - 24, 144, 48); g.fillRect(DPAD_X - 24, DPAD_Y - 72, 48, 144);
  g.fillStyle = '#ffffff33';
  if (pad.hx) g.fillRect(DPAD_X + (pad.hx > 0 ? 24 : -72), DPAD_Y - 24, 48, 48);
  if (pad.hy) g.fillRect(DPAD_X - 24, DPAD_Y + (pad.hy > 0 ? 24 : -72), 48, 48);
  g.fillStyle = '#ffffff'; g.font = '700 22px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
  [['▲', 0, -48], ['▼', 0, 48], ['◀', -48, 0], ['▶', 48, 0]].forEach(([arrow, dx, dy]) => g.fillText(arrow as string, DPAD_X + (dx as number), DPAD_Y + (dy as number)));
  if (lit('dpad')) ring(g, DPAD_X, DPAD_Y, 78, time);

  drawStick(g, LEFT_STICK, pad.hx || pad.hy ? 0 : pad.x, pad.hx || pad.hy ? 0 : pad.y, lit('stick'), time, glyphs === 'keys' ? STICK_KEYS.left : undefined);
  drawStick(g, RIGHT_STICK, pad.rx, pad.ry, lit('rstick'), time, glyphs === 'keys' ? STICK_KEYS.right : undefined);
  if (extras.menu) {
    g.fillStyle = '#20263d'; g.beginPath(); g.roundRect(MENU.x, MENU.y, MENU.w, MENU.h, 16); g.fill();
    g.fillStyle = '#c7d0e4'; g.font = '800 28px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('☰', MENU.x + MENU.w / 2, MENU.y + MENU.h / 2 + 1);
  }

  (Object.entries(ROUND) as Array<[ButtonName, Round]>).forEach(([name, round]) => {
    drawChip(g, name, round.x, round.y, round.r, glyphs, down(name));
    if (lit(name)) ring(g, round.x, round.y, round.r, time);
  });
  if (extras.demo) drawDemo(g, extras.demo, highlights, time);
}

function drawTab(g: CanvasRenderingContext2D, name: ButtonName, tab: Tab, isDown: boolean, isLit: boolean, time: number, glyphs: GlyphSet) {
  g.fillStyle = BUTTON_COLORS[name] ?? '#c7d0e4'; g.globalAlpha = isDown ? 1 : 0.8;
  g.beginPath(); g.roundRect(tab.x, tab.y + (isDown ? 4 : 0), tab.w, tab.h, 14); g.fill(); g.globalAlpha = 1;
  g.fillStyle = '#1a2036'; g.font = '800 20px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(glyphFor(glyphs, name), tab.x + tab.w / 2, tab.y + tab.h / 2 + (isDown ? 4 : 0));
  if (isLit) {
    g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.globalAlpha = 0.45 + 0.55 * pulse(time);
    g.beginPath(); g.roundRect(tab.x - 6, tab.y - 6, tab.w + 12, tab.h + 12, 18); g.stroke(); g.globalAlpha = 1;
  }
}

function drawStick(g: CanvasRenderingContext2D, at: { x: number; y: number }, x: number, y: number, isLit: boolean, time: number, keys?: readonly string[]) {
  g.fillStyle = '#20263d';
  g.beginPath(); g.arc(at.x, at.y, STICK_R, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#596587';
  g.beginPath(); g.arc(at.x + x * 28, at.y + y * 28, 38, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#7382aa';
  g.beginPath(); g.arc(at.x + x * 32, at.y + y * 32, 22, 0, Math.PI * 2); g.fill();
  if (keys) {
    // Keyboard players cannot guess which keys stand in for a stick, so the stick says so.
    g.fillStyle = '#ffffff'; g.font = '800 17px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
    [[0, -50], [-50, 0], [0, 50], [50, 0]].forEach(([dx, dy], i) => g.fillText(keys[i], at.x + dx, at.y + dy + 1));
  }
  if (isLit) ring(g, at.x, at.y, STICK_R, time);
}

/** Turns pointers on the drawn pad into a pad source, so phones and mice can play with no hardware. */
/** A tap can start and end between two frames. It stays down this long so the game always sees it once. */
const MIN_TAP_MS = 70;
export function createTouchPad(now: () => number = () => performance.now()) {
  type Hit = ({ kind: 'button'; button: ButtonName } | { kind: 'dpad' | 'stick' | 'rstick'; x: number; y: number }) & { since?: number; until?: number };
  const pointers = new Map<number, Hit>();
  function locate(x: number, y: number): Hit | null {
    for (const [name, round] of Object.entries(ROUND) as Array<[ButtonName, Round]>) if (Math.hypot(x - round.x, y - round.y) <= round.r + 10) return { kind: 'button', button: name };
    for (const [name, tab] of Object.entries(TABS) as Array<[ButtonName, Tab]>) if (x >= tab.x - 6 && x <= tab.x + tab.w + 6 && y >= tab.y - (tab.y < 520 ? TAB_REACH : 10) && y <= tab.y + tab.h + 8) return { kind: 'button', button: name };
    if (Math.hypot(x - DPAD_X, y - DPAD_Y) <= 90) return { kind: 'dpad', x, y };
    if (Math.hypot(x - LEFT_STICK.x, y - LEFT_STICK.y) <= STICK_R + 26) return { kind: 'stick', x, y };
    if (Math.hypot(x - RIGHT_STICK.x, y - RIGHT_STICK.y) <= STICK_R + 26) return { kind: 'rstick', x, y };
    return null;
  }
  return {
    /** Returns true when the pointer landed on the pad. */
    down(id: number, x: number, y: number) { const hit = locate(x, y); if (hit) pointers.set(id, { ...hit, since: now() }); return Boolean(hit); },
    move(id: number, x: number, y: number) { const hit = pointers.get(id); if (hit && hit.kind !== 'button') { hit.x = x; hit.y = y; } },
    up(id: number) {
      const hit = pointers.get(id);
      if (hit && now() - (hit.since ?? 0) < MIN_TAP_MS) hit.until = (hit.since ?? 0) + MIN_TAP_MS; else pointers.delete(id);
    },
    clear() { pointers.clear(); },
    read(): VirtualPad {
      const pad: VirtualPad = { x: 0, y: 0, hx: 0, hy: 0, rx: 0, ry: 0, buttons: [] };
      pointers.forEach((hit, id) => { if (hit.until !== undefined && now() >= hit.until) pointers.delete(id); });
      pointers.forEach((hit) => {
        if (hit.kind === 'button') pad.buttons[BUTTON_INDEX[hit.button]] = true;
        else if (hit.kind === 'dpad') {
          const dx = hit.x - DPAD_X, dy = hit.y - DPAD_Y;
          if (Math.abs(dx) > Math.abs(dy)) pad.hx = Math.sign(dx); else pad.hy = Math.sign(dy);
        } else {
          const at = hit.kind === 'stick' ? LEFT_STICK : RIGHT_STICK;
          const dx = (hit.x - at.x) / STICK_R, dy = (hit.y - at.y) / STICK_R;
          if (hit.kind === 'stick') { pad.x = dx; pad.y = dy; } else { pad.rx = dx; pad.ry = dy; }
        }
      });
      return pad;
    }
  };
}
