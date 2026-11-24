import { describe, expect, it } from 'vitest';
import { BUTTON_INDEX, type ButtonName, type PadState } from '../src/games/_shared/gamepad-kit';
import { CARRY_LEVEL, COMBO_LEVELS, combosOpen, emptyProgress, isMastered, isOpen, LEVELS, PARTY_LEVELS, RACE_LEVEL, recordResult, STICKERS, type Difficulty } from '../src/games/pad-pals/levels';
import { SPOKEN } from '../src/games/pad-pals/i18n';
import { createMini, type MiniEnv } from '../src/games/pad-pals/minis';

const env = (difficulty: Difficulty, players = 1): MiniEnv => {
  let state = 5;
  return { difficulty, random: () => { state = (1664525 * state + 1013904223) >>> 0; return state / 2 ** 32; }, players, glyphs: () => 'keys', good() {}, bad() {}, tick() {}, note() {}, say() {} };
};
const pad = (press: ButtonName[] = [], hold: ButtonName[] = [], extra: Partial<PadState> = {}): PadState => {
  const buttons = Array.from({ length: 12 }, () => false), justPressed = Array.from({ length: 12 }, () => false);
  hold.forEach((b) => { buttons[BUTTON_INDEX[b]] = true; });
  press.forEach((b) => { buttons[BUTTON_INDEX[b]] = true; justPressed[BUTTON_INDEX[b]] = true; });
  return { x: 0, y: 0, hx: 0, hy: 0, rx: 0, ry: 0, buttons, justPressed, dirPressed: null, btn: buttons.some(Boolean), pressed: justPressed.some(Boolean), ...extra };
};
const idle = pad();

describe('Pad Pals World 5 (Combos)', () => {
  it('opens after the robot has a star, one level at a time, and keeps old saves and trophies as they were', () => {
    let progress = emptyProgress();
    for (const level of LEVELS.slice(0, -1)) progress = recordResult(progress, level, 0, 3);
    expect(combosOpen(progress)).toBe(false);
    expect(isOpen(progress, COMBO_LEVELS[0])).toBe(false);
    progress = recordResult(progress, LEVELS[LEVELS.length - 1], 0, 1);
    expect(isMastered(progress, 0)).toBe(true); // World 5 is a bonus: no trophy is taken away.
    expect(isOpen(progress, COMBO_LEVELS[0])).toBe(true); expect(isOpen(progress, COMBO_LEVELS[1])).toBe(false);
    progress = recordResult(progress, COMBO_LEVELS[0], 0, 0);
    expect(isOpen(progress, COMBO_LEVELS[1])).toBe(true);
    expect(progress.open).toBe(LEVELS.length - 1);
    // A save from before World 5 has no combo field and still loads.
    expect(isOpen({ stars: { 'boss:2': 2 }, open: 12 }, COMBO_LEVELS[0])).toBe(true);
    PARTY_LEVELS.forEach((level) => expect(isOpen(emptyProgress(), level)).toBe(true));
  });

  it('needs the hold part on before the tap, and forgives an early tap on Chick only', () => {
    const rocket = COMBO_LEVELS.find((l) => l.id === 'rocket')!;
    for (const d of [0, 1] as Difficulty[]) {
      const mini = createMini(rocket, env(d));
      mini.update(0.5, { any: idle, pads: [] });
      const move = mini.bot(), tap = move.press!, hold = move.hold![0];
      mini.update(1 / 60, { any: pad([tap]), pads: [] });
      expect(mini.progress()).toBe(d === 0 ? 0 : 1);
      expect(mini.misses).toBe(d === 0 ? 0 : 1);
      mini.update(0.5, { any: idle, pads: [] });
      const next = mini.bot();
      mini.update(1 / 60, { any: pad([next.press!], [next.hold![0]]), pads: [] });
      expect(mini.misses).toBe(d === 0 ? 0 : 1);
      expect(mini.progress()).toBe(d === 0 ? 1 : 2);
      expect(hold === 'l2' || hold === 'r2').toBe(true);
    }
  });

  it('asks Twin Painter for both sticks together, held for a moment', () => {
    const mini = createMini(COMBO_LEVELS.find((l) => l.id === 'paint')!, env(0));
    mini.update(0.5, { any: idle, pads: [] });
    const move = mini.bot();
    mini.update(0.2, { any: pad([], [], { x: move.x, y: move.y }), pads: [] });
    mini.update(0.2, { any: pad([], [], { x: move.x, y: move.y }), pads: [] });
    expect(mini.progress()).toBe(0);
    for (let i = 0; i < 20; i++) mini.update(1 / 60, { any: pad([], [], { x: move.x, y: move.y, rx: move.rx, ry: move.ry }), pads: [] });
    expect(mini.progress()).toBe(1);
  });
});

describe('Pad Pals party games', () => {
  it('keeps the balloon up with a patient bunny when alone, and lets a dropped balloon cost only a star', () => {
    const mini = createMini(CARRY_LEVEL, env(0));
    let frames = 0;
    while (!mini.done && frames < 60 * 120) { const move = mini.bot(); mini.update(1 / 60, { any: move.press ? pad([move.press]) : idle, pads: [] }); frames++; }
    expect(mini.done).toBe(true); expect(mini.misses).toBe(0); expect(mini.versus).toBe(false);
    const lazy = createMini(CARRY_LEVEL, env(0));
    for (let i = 0; i < 60 * 8; i++) lazy.update(1 / 60, { any: idle, pads: [] });
    expect(lazy.misses).toBeGreaterThan(0); expect(lazy.done).toBe(false);
  });

  it('lets a second player join the balloon carry and the race from the arrow keys', () => {
    for (const level of [CARRY_LEVEL, RACE_LEVEL]) {
      const mini = createMini(level, env(1));
      mini.update(1 / 60, { any: idle, pads: [idle, pad([], [], { dirPressed: 'up' })] });
      if (level === RACE_LEVEL) expect(mini.versus).toBe(true);
      // Joined: the bunny no longer moves by itself.
      const before = mini.progress();
      for (let i = 0; i < 60 * 3; i++) mini.update(1 / 60, { any: idle, pads: [idle, idle] });
      expect(mini.done).toBe(false); expect(mini.progress()).toBe(before);
    }
  });

  it('races the bunny: a quick child wins, a still one loses', () => {
    const fast = createMini(RACE_LEVEL, env(2));
    for (let i = 0; i < 60 * 60 && !fast.done; i++) fast.update(1 / 60, { any: i % 2 ? idle : pad([fast.bot().press!]), pads: [] });
    expect(fast.winner).toBe(0);
    const still = createMini(RACE_LEVEL, env(0));
    for (let i = 0; i < 60 * 60 && !still.done; i++) still.update(1 / 60, { any: idle, pads: [] });
    expect(still.winner).toBe(1); expect(still.misses).toBeGreaterThan(0);
  });
});

describe('Pad Pals stickers and voice', () => {
  it('adds new stickers at the end so earned ones never change', () => {
    expect(STICKERS.slice(0, 24)).toEqual(['🦊', '🐼', '🦄', '🐙', '🦖', '🐳', '🦋', '🐞', '🚀', '🌈', '🍦', '🎸', '🐧', '🦁', '🐢', '🍓', '⚽', '🚂', '🐝', '🎨', '🦉', '🍩', '🪁', '👑']);
    expect(new Set(STICKERS).size).toBe(STICKERS.length);
  });
  it('speaks a hint for every new level', () => {
    for (const id of [...COMBO_LEVELS, CARRY_LEVEL, RACE_LEVEL].map((l) => l.id)) expect(SPOKEN).toContain(`hint.${id}`);
  });
});
