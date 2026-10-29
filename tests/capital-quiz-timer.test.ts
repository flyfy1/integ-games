import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import game from '../src/games/capital-quiz';
import { COUNTRIES } from '../src/games/capital-quiz/data';
import { BASE_POINTS, MAX_CLOCK_STEP_MS, MIN_TIME_FACTOR, QuestionClock, TIME_GRACE, TIME_LIMIT_MS, pointsFor, timedBase, timedPointsFor } from '../src/games/capital-quiz/logic';
import { EN, ZH, t } from '../src/games/capital-quiz/i18n';
import type { GameServices } from '../src/core/game-types';

const capitals = new Map(COUNTRIES.map((c) => [c.country, c.capital]));
const seeded = (seed: number) => () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
function services(values = new Map<string, unknown>(), reduced = true): GameServices {
  return {
    storage: { get: <T>(key: string, fallback: T) => (values.get(key) as T | undefined) ?? fallback, set: (key, value) => values.set(key, value), remove: (key) => values.delete(key) },
    sound: { muted: true, setMuted: () => undefined, stop: () => undefined, play: () => undefined },
    random: seeded(7), reportScore: () => undefined, reportComplete: () => undefined, isReducedMotion: reduced
  };
}

describe('time-decayed scoring', () => {
  it('gives longer clocks to easier questions, all with ample reading time', () => {
    expect(TIME_LIMIT_MS[1]).toBeGreaterThan(TIME_LIMIT_MS[2]);
    expect(TIME_LIMIT_MS[2]).toBeGreaterThan(TIME_LIMIT_MS[3]);
    expect(TIME_LIMIT_MS[3]).toBeGreaterThanOrEqual(12000);
  });

  it('pays full base during the grace slice, then falls linearly to 40% at zero', () => {
    for (const d of [1, 2, 3] as const) {
      const limit = TIME_LIMIT_MS[d], base = BASE_POINTS[d];
      expect(timedBase(d, limit)).toBe(base);
      expect(timedBase(d, limit * (1 - TIME_GRACE))).toBe(base);
      expect(timedBase(d, 0)).toBe(Math.round(base * MIN_TIME_FACTOR));
      expect(timedBase(d, -500)).toBe(Math.round(base * MIN_TIME_FACTOR));
      expect(timedBase(d, limit * 5)).toBe(base);
      let prev = Infinity;
      for (let ms = limit; ms >= 0; ms -= limit / 40) { const v = timedBase(d, ms); expect(v).toBeLessThanOrEqual(prev); prev = v; }
    }
    expect(timedBase(1, 10000)).toBeLessThan(timedBase(1, 18000));
    expect(timedBase(1, 10000)).toBeGreaterThan(timedBase(1, 2000));
  });

  it('applies decay to the base only; the streak bonus is unchanged', () => {
    expect(timedPointsFor(2, 1, TIME_LIMIT_MS[2])).toBe(pointsFor(2, 1));
    expect(timedPointsFor(2, 4, TIME_LIMIT_MS[2])).toBe(pointsFor(2, 4));
    expect(timedPointsFor(2, 4, 0)).toBe(timedBase(2, 0) + 75);
    expect(timedPointsFor(3, 99, 0)).toBe(timedBase(3, 0) + 100);
  });
});

describe('QuestionClock', () => {
  it('only counts time while running and never past its limit', () => {
    const c = new QuestionClock(1000);
    c.tick(100);
    expect(c.remainingMs).toBe(1000); // not started
    c.resume(100); c.tick(200); c.tick(300);
    expect(c.remainingMs).toBe(800);
    c.pause(350);
    expect(c.remainingMs).toBe(750);
    c.tick(10_000); // paused: nothing
    expect(c.remainingMs).toBe(750);
    c.resume(20_000); c.tick(20_200);
    expect(c.remainingMs).toBe(550);
    for (let n = 20_400; n < 22_000; n += 200) c.tick(n);
    expect(c.remainingMs).toBe(0);
    expect(c.expired).toBe(true);
  });

  it('caps a single step so a throttled tab cannot burn time unseen', () => {
    const c = new QuestionClock(10_000);
    c.resume(0);
    c.tick(60_000);
    expect(c.remainingMs).toBe(10_000 - MAX_CLOCK_STEP_MS);
  });
});

describe('timer copy', () => {
  it('is present and placeholder-compatible in both languages', () => {
    const keys = (Object.keys(EN) as Array<keyof typeof EN>).filter((k) => k.startsWith('timer.') || k.startsWith('fb.timeout') || k === 'menu.timer' || k === 'result.timeLoss');
    expect(keys.length).toBeGreaterThanOrEqual(10);
    for (const k of keys) expect(ZH[k]).toMatch(/\S/);
    expect(t('zh', 'timer.expired')).toBe('时间到');
    expect(t('en', 'timer.expired')).toBe("Time's up");
  });
});

describe('Geo Quiz timer in the game', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] }); });
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

  const mount = (values = new Map<string, unknown>(), reduced = true) => {
    const host = document.createElement('div');
    document.body.append(host);
    return { host, values, controller: game.mount(host, services(values, reduced)) };
  };
  const startCapital = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('[data-mode="capital"]')!.click();
  const clockText = (host: HTMLElement) => host.querySelector('[data-clock]')!.textContent;
  const worth = (host: HTMLElement) => Number(host.querySelector('[data-worth]')!.textContent!.replace('+', ''));
  it('shows the hourglass, a ticking countdown and a live worth that drops over time', () => {
    const { host, controller } = mount();
    startCapital(host);
    expect(host.querySelector('svg.cq-glass')).not.toBeNull();
    expect(clockText(host)).toBe('20s');
    expect(worth(host)).toBe(100);
    vi.advanceTimersByTime(12_000);
    expect(clockText(host)).toBe('8s');
    expect(worth(host)).toBeLessThan(100);
    const mid = worth(host);
    vi.advanceTimersByTime(4_000);
    expect(worth(host)).toBeLessThan(mid);
    controller.destroy();
  });

  it('keeps the countdown and the numbers with reduced motion, and follows the language', () => {
    const { host, controller } = mount(new Map<string, unknown>([['lang', 'zh']]), true);
    startCapital(host);
    expect(host.querySelector('.cq')!.classList.contains('is-motion')).toBe(false);
    expect(clockText(host)).toBe('20 秒');
    vi.advanceTimersByTime(3_000);
    expect(clockText(host)).toBe('17 秒');
    host.querySelector<HTMLButtonElement>('[data-lang="en"]')!.click();
    expect(clockText(host)).toBe('17s'); // the clock keeps running across a language switch
    expect(host.querySelector('[data-clock-label]')!.textContent).toBe('Time left');
    controller.destroy();
  });

  it.each([['en', "Time's up", 'Not quite'], ['zh', '时间到', '差一点']])('counts a timeout as wrong in %s: streak reset, answer revealed, Next needed, no auto-advance', (lang, upText) => {
    const { host, controller } = mount(new Map<string, unknown>([['lang', lang]]));
    startCapital(host);
    vi.advanceTimersByTime(21_000);
    expect(host.querySelector('.cq-feedback')!.textContent).toContain(upText);
    expect(clockText(host)).toBe(upText);
    expect(host.querySelector('.cq-option.is-right')).not.toBeNull();
    expect(host.querySelector('.cq-option.is-wrong')).toBeNull(); // nothing was picked
    expect([...host.querySelectorAll<HTMLButtonElement>('.cq-option')].every((b) => b.disabled)).toBe(true);
    expect(host.querySelector('[data-score]')!.textContent).toBe('0');
    expect(host.querySelector('[data-q]')!.textContent).toBe('1/10');
    expect(host.querySelector('.cq-segs i.is-bad')).not.toBeNull();
    vi.advanceTimersByTime(30_000); // a miss waits for Next
    expect(host.querySelector('[data-q]')!.textContent).toBe('1/10');
    host.querySelector<HTMLButtonElement>('[data-next-btn]')!.click();
    expect(host.querySelector('[data-q]')!.textContent).toBe('2/10');
    expect(clockText(host)).toMatch(/^1[56]|^20/); // fresh clock for the next question (easy, 20 s)
    controller.destroy();
  });

  it('does not take away points already earned when a later question times out, and ends the streak', () => {
    const { host, controller } = mount();
    startCapital(host);
    const label = host.querySelector('.cq-card h2')!.textContent!;
    const idx = [...host.querySelectorAll('.cq-option')].findIndex((b) => b.textContent === capitals.get(label));
    host.querySelectorAll<HTMLButtonElement>('.cq-option')[idx].click();
    expect(host.querySelector('[data-score]')!.textContent).toBe('100');
    expect(host.querySelector('[data-streak] b')!.textContent).toBe('1');
    vi.advanceTimersByTime(1_200); // auto-advance after a right answer
    vi.advanceTimersByTime(21_000); // second question times out
    expect(host.querySelector('[data-score]')!.textContent).toBe('100');
    expect(host.querySelector('[data-streak] b')!.textContent).toBe('0');
    controller.destroy();
  });

  it('scores a fast answer higher than a slow one', async () => {
    const play = (waitMs: number) => {
      const { host, controller } = mount();
      startCapital(host);
      vi.advanceTimersByTime(waitMs);
      const label = host.querySelector('.cq-card h2')!.textContent!;
      const idx = [...host.querySelectorAll('.cq-option')].findIndex((b) => b.textContent === capitals.get(label));
      host.querySelectorAll<HTMLButtonElement>('.cq-option')[idx].click();
      const gained = Number(host.querySelector('[data-score]')!.textContent);
      const fb = host.querySelector('.cq-feedback small')!.textContent!;
      controller.destroy();
      return { gained, fb };
    };
    const fast = play(500), slow = play(17_000), edge = play(19_900);
    expect(fast.gained).toBe(100);
    expect(slow.gained).toBeLessThan(fast.gained);
    expect(slow.gained).toBeGreaterThan(edge.gained);
    expect(edge.gained).toBeGreaterThanOrEqual(40);
    expect(slow.fb).toMatch(/base 100 → \d+ with [\d.]+s left/); // the breakdown shows the time factor
  });

  it('stops the clock while paused, hidden, in the menu or on the result, and resumes where it left off', () => {
    const { host, controller } = mount();
    startCapital(host);
    vi.advanceTimersByTime(5_000);
    expect(clockText(host)).toBe('15s');
    controller.pause();
    vi.advanceTimersByTime(60_000);
    expect(clockText(host)).toBe('15s');
    expect(host.querySelector('.cq-feedback')!.textContent).toBe(''); // a pause is not a timeout
    controller.resume();
    vi.advanceTimersByTime(2_000);
    expect(clockText(host)).toBe('13s');
    // Answering (wrongly, so no auto-advance timer is involved) stops the clock for good.
    const label = host.querySelector('.cq-card h2')!.textContent!;
    [...host.querySelectorAll<HTMLButtonElement>('.cq-option')].find((b) => b.textContent !== capitals.get(label))!.click();
    const frozen = clockText(host);
    expect(vi.getTimerCount()).toBe(0); // a miss leaves no running interval and nothing to auto-advance
    vi.advanceTimersByTime(5_000);
    expect(clockText(host)).toBe(frozen);
    controller.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('restarts the current question with a full clock when a save is restored', () => {
    const first = mount();
    startCapital(first.host);
    vi.advanceTimersByTime(9_000);
    first.controller.destroy();
    const again = mount(first.values);
    expect(clockText(again.host)).toBe('20s');
    expect(worth(again.host)).toBe(100);
    again.controller.destroy();
  });

  it('plays a whole round of timeouts into the result screen with the time penalty row', () => {
    const { host, controller } = mount();
    startCapital(host);
    for (let i = 0; i < 10; i++) { vi.advanceTimersByTime(21_000); host.querySelector<HTMLButtonElement>('[data-next-btn]')!.click(); }
    expect(host.querySelector('.cq-result')).not.toBeNull();
    expect(host.querySelector('.cq-total strong')!.textContent).toBe('0');
    expect(host.querySelectorAll('.cq-break div')).toHaveLength(5);
    expect(host.querySelector('.cq-missed li')).not.toBeNull();
    controller.destroy();
  });
});
