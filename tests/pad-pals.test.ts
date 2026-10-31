import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyDeadzone, BUTTON_INDEX, clampToCircle, createInput, DEFAULT_KEYBOARD, hatToDirection, twinUsb, type ButtonName, type Direction, type PadState } from '../src/games/_shared/gamepad-kit';
import { ALL_LEVELS, bestStars, DIFFICULTIES, emptyProgress, isOpen, isProgress, LEVELS, maxScore, PARTY_LEVEL, recordResult, starsFor, totalScore, type Difficulty } from '../src/games/pad-pals/levels';
import { SPOKEN, t } from '../src/games/pad-pals/i18n';
import { createMini, type BotMove, type MiniEnv } from '../src/games/pad-pals/minis';

const report = (bytes: number[]) => new DataView(Uint8Array.from(bytes).buffer);

describe('gamepad kit', () => {
  it('reads a Twin USB report into sticks, D-pad and raw buttons', () => {
    const pad = twinUsb.parse(report([0x7f, 0x7f, 0xff, 0x00, 0x12, 0x81, 0]), 0.25);
    expect(pad.x).toBe(1); expect(pad.y).toBe(-1); expect(pad.hx).toBe(1); expect(pad.hy).toBe(0);
    expect(pad.buttons.flatMap((on, i) => (on ? [i] : []))).toEqual([0, 4, 11]);
  });
  it('treats a centered report as idle', () => {
    const pad = twinUsb.parse(report([0x7f, 0x7f, 0x80, 0x7f, 0x0f, 0x00, 0]), 0.25);
    expect([pad.x, pad.y, pad.rx, pad.ry, pad.hx, pad.hy]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(pad.buttons.some(Boolean)).toBe(false);
  });
  it('keeps diagonals at unit speed and applies the deadzone', () => {
    expect(Math.hypot(...clampToCircle(1, 1))).toBeCloseTo(1);
    expect(applyDeadzone(0.2, 0.25)).toBe(0);
    expect(hatToDirection(3)).toEqual([1, 1]); expect(hatToDirection(15)).toEqual([0, 0]);
  });
  it('maps the raw Twin USB button order one-to-one onto the standard order', () => {
    expect([...twinUsb.buttonMap].sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => i));
  });
  it('reports a key as pressed for one read, then held, and stops listening after destroy', () => {
    const input = createInput();
    expect(DEFAULT_KEYBOARD[0].buttons[0]).toContain('Space');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyL' }));
    const first = input.read()[0], second = input.read()[0];
    expect(first.justPressed[BUTTON_INDEX.east]).toBe(true);
    expect(second.justPressed[BUTTON_INDEX.east]).toBe(false);
    expect(second.buttons[BUTTON_INDEX.east]).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyL' }));
    input.destroy();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyL' }));
    expect(input.read()[0].btn).toBe(false);
  });
  it('fires a direction once until the stick returns', () => {
    let x = 0;
    const input = createInput({ keyboard: [], virtual: (player) => (player === 0 ? { x, y: 0, hx: 0, hy: 0, rx: 0, ry: 0, buttons: [] } : undefined) });
    input.read(); x = 1;
    expect(input.read()[0].dirPressed).toBe('right');
    expect(input.read()[0].dirPressed).toBe(null);
    x = 0; input.read(); x = 1;
    expect(input.read()[0].dirPressed).toBe('right');
    input.destroy();
  });
  it('splits a Twin USB receiver into two players over WebHID, then forgets them on unplug', async () => {
    const device = Object.assign(new EventTarget(), { opened: false, vendorId: 0x0810, productId: 0x0001, open: async () => undefined, close: async () => undefined });
    const hid = Object.assign(new EventTarget(), { requestDevice: async () => [device], getDevices: async () => [] });
    Object.defineProperty(navigator, 'hid', { configurable: true, value: hid });
    const events: string[] = [];
    const input = createInput({ onChange: (event, player) => events.push(`${event}${player ?? ''}`) });
    expect(await input.connect()).toEqual({ ok: true });
    const send = (reportId: number, bytes: number[]) => device.dispatchEvent(Object.assign(new Event('inputreport'), { reportId, data: report(bytes) }));
    send(2, [0x7f, 0x7f, 0x80, 0x7f, 0x4f, 0x00, 0]); // Raw button 3 on the second pad: the usual bottom button.
    const [first, second] = input.read();
    expect(first.btn).toBe(false);
    expect(second.justPressed[BUTTON_INDEX.south]).toBe(true);
    input.setButtonMap('hid', [0, 1, 2, 3]);
    expect(input.read()[1].buttons[2]).toBe(true);
    hid.dispatchEvent(Object.assign(new Event('disconnect'), { device }));
    expect(input.read()[1].btn).toBe(false);
    expect(events).toEqual(['connected', 'seen1', 'disconnected']);
    input.destroy();
    Reflect.deleteProperty(navigator, 'hid');
  });
  it('asks for a browser with WebHID instead of throwing', async () => {
    const input = createInput();
    expect((await input.connect()).ok).toBe(false);
    input.destroy();
  });
});

describe('Pad Pals progress', () => {
  it('awards stars by mistakes and never less than one', () => {
    expect(starsFor(0, 10)).toBe(3); expect(starsFor(1, 10)).toBe(3); expect(starsFor(3, 10)).toBe(2); expect(starsFor(50, 10)).toBe(1);
  });
  it('opens levels in order, keeps the party level open, and lets a skip unlock without stars', () => {
    let progress = emptyProgress();
    expect(isOpen(progress, LEVELS[0])).toBe(true); expect(isOpen(progress, LEVELS[1])).toBe(false); expect(isOpen(progress, PARTY_LEVEL)).toBe(true);
    progress = recordResult(progress, LEVELS[0], 0, 2);
    expect(isOpen(progress, LEVELS[1])).toBe(true);
    progress = recordResult(progress, LEVELS[1], 1, 0);
    expect(isOpen(progress, LEVELS[2])).toBe(true); expect(bestStars(progress, LEVELS[1].id, 1)).toBe(0);
  });
  it('keeps the best result and weights harder difficulties', () => {
    let progress = recordResult(emptyProgress(), LEVELS[0], 2, 3);
    progress = recordResult(progress, LEVELS[0], 2, 1);
    expect(bestStars(progress, LEVELS[0].id, 2)).toBe(3); expect(totalScore(progress)).toBe(90);
    expect(maxScore).toBe(ALL_LEVELS.length * 180);
  });
  it('does not unlock past the last level or accept corrupt saves', () => {
    expect(recordResult(emptyProgress(), LEVELS[LEVELS.length - 1], 0, 3).open).toBe(LEVELS.length - 1);
    expect(isProgress(null)).toBe(false); expect(isProgress({ open: 'x' })).toBe(false);
  });
  it('gets harder as difficulty rises', () => {
    LEVELS.forEach((level) => { expect(level.goal[0]).toBeLessThanOrEqual(level.goal[1]); expect(level.goal[1]).toBeLessThanOrEqual(level.goal[2]); });
    expect(LEVELS.map((level) => level.world)).toEqual([...LEVELS.map((level) => level.world)].sort());
  });
});

/** Drives a level with its bot through real update calls, releasing a tapped button every other frame as fingers do. */
function play(level: typeof ALL_LEVELS[number], difficulty: Difficulty, players = 1, seed = 42) {
  let state = seed;
  const random = () => { state = (1664525 * state + 1013904223) >>> 0; return state / 2 ** 32; };
  const env: MiniEnv = { difficulty, random, players, glyphs: () => 'ps', good() {}, bad() {}, tick() {}, note() {}, say() {} };
  const mini = createMini(level, env);
  let was: boolean[] = [], wasDirection: Direction | null = null, tapped = false, frames = 0;
  const toState = (move: BotMove): PadState => {
    const buttons = Array.from({ length: 12 }, () => false);
    move.hold?.forEach((button) => { buttons[BUTTON_INDEX[button]] = true; });
    const press: ButtonName | undefined = tapped ? undefined : move.press;
    if (press) buttons[BUTTON_INDEX[press]] = true;
    tapped = Boolean(press);
    const justPressed = buttons.map((down, i) => down && !was[i]);
    const x = move.x ?? 0, y = move.y ?? 0;
    const direction: Direction | null = Math.max(Math.abs(x), Math.abs(y)) < 0.5 ? null : Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : y > 0 ? 'down' : 'up';
    const dirPressed = direction !== wasDirection ? direction : null;
    was = buttons; wasDirection = direction;
    return { x, y, hx: 0, hy: 0, rx: move.rx ?? 0, ry: move.ry ?? 0, buttons, justPressed, dirPressed, btn: buttons.some(Boolean), pressed: justPressed.some(Boolean) };
  };
  while (!mini.done && frames < 60 * 300) {
    const pad = toState(mini.bot());
    // A stick must recentre between steps, so step-based levels get a neutral frame.
    mini.update(1 / 60, { any: pad, pads: [pad, toState({})] });
    if (level.kind === 'maze') mini.update(1 / 60, { any: toState({}), pads: [] });
    frames++;
  }
  return { mini, seconds: frames / 60 };
}

describe('Pad Pals voice', () => {
  it('ships a recorded file for every spoken line in both languages', () => {
    for (const lang of ['en', 'zh'] as const) for (const key of SPOKEN) {
      expect(t(lang, key).length, key).toBeGreaterThan(0);
      expect(existsSync(`public/pad-pals-voice/${lang}/${key}.mp3`), `${lang}/${key}`).toBe(true);
    }
  });
});

describe('Pad Pals levels', () => {
  const cases = ALL_LEVELS.flatMap((level) => DIFFICULTIES.map((difficulty) => [level.id, difficulty, level] as const));
  it.each(cases)('%s on difficulty %i can be finished by real play', (_id, difficulty, level) => {
    const { mini, seconds } = play(level, difficulty);
    expect(mini.done).toBe(true);
    expect(seconds).toBeLessThan(200);
  });
  it('lets patient players finish Chick levels with no time pressure', () => {
    for (const level of LEVELS.filter((item) => item.kind !== 'tug')) expect(level.wait[0]).toBe(Infinity);
  });
  it('rewards a clean Tiger run on the levels with no wall to walk into', () => {
    for (const id of ['mole', 'catch', 'simon', 'boss']) {
      const { mini } = play(ALL_LEVELS.find((level) => level.id === id)!, 2);
      expect(starsFor(mini.misses, mini.goal), id).toBe(3);
    }
  });
  it('grows the parrot tune by one, forgives on Chick and replays on Bunny', () => {
    const run = (difficulty: Difficulty) => {
      const said: string[] = [];
      const mini = createMini(ALL_LEVELS.find((level) => level.id === 'simon')!, { difficulty, random: () => 0.1, players: 1, glyphs: () => 'ps', good() {}, bad() {}, tick() {}, note() {}, say: (key) => said.push(key) });
      const idle: PadState = { x: 0, y: 0, hx: 0, hy: 0, rx: 0, ry: 0, buttons: [], justPressed: [], dirPressed: null, btn: false, pressed: false };
      const step = (seconds: number) => { for (let i = 0; i < seconds * 60; i++) mini.update(1 / 60, { any: idle, pads: [idle] }); };
      const press = (button: ButtonName) => { const justPressed: boolean[] = []; justPressed[BUTTON_INDEX[button]] = true; mini.update(1 / 60, { any: { ...idle, justPressed }, pads: [idle] }); };
      return { mini, said, step, press };
    };
    const chick = run(0);
    chick.step(0.2); chick.press('south'); expect(chick.mini.misses).toBe(0); // Ignored while the parrot is showing.
    chick.step(3);
    expect(chick.mini.caption?.()).toBe('simon.turn');
    const right = chick.mini.bot().press!, wrong = (['south', 'east'] as const).find((button) => button !== right)!;
    chick.press(wrong);
    expect(chick.mini.misses).toBe(1); expect(chick.mini.caption?.()).toBe('simon.again');
    chick.step(1.5);
    expect(chick.mini.caption?.()).toBe('simon.turn'); expect(chick.mini.highlights()).toEqual([right]);
    chick.press(right); chick.step(1.2);
    expect(chick.mini.progress()).toBe(1); expect(chick.mini.caption?.()).toBe('simon.watch');
    chick.step(4);
    expect(chick.said).toContain('simon.turn');
    const bunny = run(1);
    bunny.step(3);
    expect(bunny.mini.caption?.()).toBe('simon.turn');
    const need = bunny.mini.bot().press!;
    bunny.press((['south', 'east', 'west'] as const).find((button) => button !== need)!);
    bunny.step(1.5);
    expect(bunny.mini.caption?.()).toBe('simon.watch');
  });
  it('lets a fast player win the tug of war against the bunny', () => {
    expect(play(PARTY_LEVEL, 2).mini.winner).toBe(0);
  });
  it('draws every level without throwing', () => {
    const g = document.createElement('canvas').getContext('2d')!;
    ALL_LEVELS.forEach((level) => DIFFICULTIES.forEach((difficulty) => {
      const mini = createMini(level, { difficulty, random: () => 0.3, players: 2, glyphs: () => 'xbox', good() {}, bad() {}, tick() {}, note() {}, say() {} });
      expect(() => { mini.draw(g, 1); mini.highlights(); }).not.toThrow();
    }));
  });
});
