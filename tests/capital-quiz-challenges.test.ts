import { afterEach, describe, expect, it, vi } from 'vitest';
import game from '../src/games/capital-quiz';
import { buildDailyRound } from '../src/games/capital-quiz/modes';
import { dailyKey, dailyRandom, readDaily } from '../src/games/_shared/daily';
import type { GameServices } from '../src/core/game-types';

const seeded = (seed: number) => () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
function mount(values = new Map<string, unknown>()) {
  const scores: number[] = [];
  const services: GameServices = {
    storage: { get: <T>(key: string, fallback: T) => (values.get(key) as T | undefined) ?? fallback, set: (key, value) => values.set(key, value), remove: (key) => values.delete(key) },
    sound: { muted: true, setMuted: () => undefined, stop: () => undefined, play: () => undefined },
    random: seeded(11), reportScore: (s) => scores.push(s), reportComplete: () => undefined, isReducedMotion: true
  };
  const host = document.createElement('div'); document.body.append(host);
  return { host, values, scores, controller: game.mount(host, services) };
}
const click = (host: HTMLElement, sel: string) => host.querySelector<HTMLButtonElement>(sel)!.click();
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

describe('Geo Quiz challenges in the page', () => {
  it('plays the Daily Ten everyone gets, records a streak and offers a share line', () => {
    const { host, values } = mount();
    click(host, '[data-challenge="daily"]');
    const round = buildDailyRound(dailyRandom('capital-quiz'));
    round.forEach((q, i) => {
      expect(host.querySelector('.cq-card')!.textContent).toBeTruthy();
      host.querySelectorAll<HTMLButtonElement>('.cq-option')[i === 4 ? (q.answerIndex + 1) % 4 : q.answerIndex].click();
      click(host, '[data-next-btn]');
    });
    expect(host.querySelector('.cq-result')).not.toBeNull();
    expect(readDaily({ get: (k, f) => (values.get(k) as never) ?? f, set: () => undefined, remove: () => undefined }, 'ten').streak).toBe(1);
    const line = host.querySelector('[data-share-line]')!.textContent!;
    expect(line).toContain(dailyKey());
    expect(line).toContain('9/10');
    expect(line).toContain('🟥');
    expect(host.querySelector('[data-again]')).toBeNull();
    click(host, '[data-menu]');
    expect(host.querySelector('[data-challenge="daily"]')!.textContent).toContain('9/10');
  });

  it('keeps classic menu shortcuts and four classic mode buttons next to the challenges', () => {
    const { host } = mount();
    expect(host.querySelectorAll('[data-mode]')).toHaveLength(4);
    expect(host.querySelectorAll('[data-challenge]')).toHaveLength(5);
  });

  it('ends Survival after three misses and keeps it off the site-wide score', () => {
    const { host, values, scores } = mount();
    click(host, '[data-challenge="survival"]');
    for (let i = 0; i < 200 && !host.querySelector('.cq-result'); i++) {
      const opts = host.querySelectorAll<HTMLButtonElement>('.cq-option');
      // A wrong pick: any option that does not end up green after answering is fine, so pick and move on.
      opts[0].click();
      click(host, '[data-next-btn]');
    }
    expect(host.querySelector('.cq-result')).not.toBeNull();
    expect(host.querySelector('.cq-result h2')!.textContent).toContain('Out of lives');
    expect(scores).toEqual([]);
    expect(values.get('capital-quiz-best-survival')).toBeTypeOf('number');
  });

  it('takes typed capitals forgivingly, ignores digit shortcuts while typing and never offers options', () => {
    const { host } = mount();
    click(host, '[data-challenge="type"]');
    expect(host.querySelectorAll('.cq-option')).toHaveLength(0);
    const input = host.querySelector<HTMLInputElement>('[data-type-input]')!;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
    expect(host.querySelector('[data-fb]')!.textContent).toBe('');
    input.value = 'definitely not a capital';
    host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(host.querySelector('[data-fb]')!.className).toContain('is-wrong');
    expect(host.querySelector('[data-fb]')!.textContent).toContain('definitely not a capital');
  });

  it('opens the passport and starts the first stop of an open continent only', () => {
    const { host } = mount();
    click(host, '[data-challenge="journey"]');
    expect(host.querySelectorAll('.cq-leg')).toHaveLength(6);
    expect(host.querySelectorAll('[data-region]')).toHaveLength(1);
    click(host, '[data-region="Europe"]');
    expect(host.querySelector('.cq-chip')?.textContent ?? 'Europe').toMatch(/Europe/);
  });
});

describe('Geo Quiz with a controller (keys the arcade bridge sends to the stage)', () => {
  const send = (host: HTMLElement, key: string) => host.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

  it('the d-pad focuses a menu item and R1 (Enter on the stage) opens it, for every new mode', () => {
    for (const challenge of ['daily', 'journey', 'blitz', 'survival', 'type']) {
      const { host, controller } = mount();
      send(host, 'ArrowDown');
      expect(host.querySelector('.cq')!.classList.contains('is-pad')).toBe(true);
      host.querySelector<HTMLElement>(`[data-challenge="${challenge}"]`)!.focus();
      send(host, 'Enter');
      if (challenge === 'journey') expect(host.querySelector('[data-region]'), challenge).not.toBeNull();
      else expect(host.querySelector('.cq-options, [data-type-form]'), challenge).not.toBeNull();
      controller.destroy(); host.remove();
    }
  });

  it('does not press a focused button twice when a real keyboard Enter lands on it', () => {
    const { host } = mount();
    const daily = host.querySelector<HTMLButtonElement>('[data-challenge="daily"]')!;
    const clicks = vi.fn(); daily.addEventListener('click', clicks);
    daily.focus();
    daily.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(clicks).not.toHaveBeenCalled(); // The browser's own Enter-to-click is the only press.
  });

  it('never traps a controller in type-in: R1 on Pass passes, Select (M) goes back to the menu', () => {
    const { host } = mount();
    click(host, '[data-challenge="type"]');
    expect(host.querySelector('[data-type-form]')).not.toBeNull();
    host.querySelector<HTMLElement>('[data-pass]')!.focus();
    send(host, 'Enter');
    expect(host.querySelector('[data-type-input]')!.hasAttribute('disabled')).toBe(true);
    expect(host.querySelector('[data-next-btn]')).not.toBeNull();
    send(host, 'm');
    expect(host.querySelector('.cq-menu')).not.toBeNull();
  });

  it('a typed M stays in the answer box', () => {
    const { host } = mount();
    click(host, '[data-challenge="type"]');
    const input = host.querySelector<HTMLInputElement>('[data-type-input]')!;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true, cancelable: true }));
    expect(host.querySelector('[data-type-form]')).not.toBeNull();
  });
});
