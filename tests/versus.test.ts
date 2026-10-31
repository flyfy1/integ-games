import { describe, expect, it, vi } from 'vitest';
import { catalog, loadGame } from '../src/core/catalog';
import type { GameModule, GameServices } from '../src/core/game-types';
import { createKeySender, gamepadProfiles } from '../src/games/_shared/gamepad-bridge';
import { createInput, syntheticKeys, VERSUS_KEYBOARD } from '../src/games/_shared/gamepad-kit';
import { decideWinner, isVersusGame, versusRules, wrapVersus, type VersusRule } from '../src/games/_shared/versus';

const services = (): GameServices => ({
  storage: { get: <T>(_key: string, fallback: T) => fallback, set: vi.fn(), remove: vi.fn() },
  sound: { muted: true, setMuted: vi.fn(), stop: vi.fn(), play: vi.fn() }, random: () => 0.5, reportScore: vi.fn(), reportComplete: vi.fn(), isReducedMotion: true
});
const seat = (best: number, progress = 0, finished = false) => ({ best, progress, finished });
const timedRule: VersusRule = { finish: 'timed', seconds: 60, rank: 'score' };

describe('versus rules', () => {
  it('covers every game except Pad Pals, which has its own, and Ashfall, which reports no score', () => {
    expect(catalog.map((game) => game.slug).filter((slug) => !isVersusGame(slug)).sort()).toEqual(['ashfall', 'pad-pals']);
    expect(Object.keys(versusRules).every((slug) => gamepadProfiles[slug])).toBe(true);
  });
  it('picks the higher score, and the finisher over the score', () => {
    expect(decideWinner(timedRule, [seat(5), seat(9)])).toBe(1);
    expect(decideWinner(timedRule, [seat(5), seat(5)])).toBe(-1);
    expect(decideWinner({ ...timedRule, finish: 'race' }, [seat(1, 1, true), seat(99)])).toBe(0);
  });
  it('counts milestones first for games that report their score late', () => {
    expect(decideWinner({ ...timedRule, rank: 'progress' }, [seat(0, 3), seat(500, 2)])).toBe(0);
    expect(decideWinner({ ...timedRule, rank: 'progress' }, [seat(10, 2), seat(50, 2)])).toBe(1);
  });
});

describe('versus input', () => {
  it('gives both keyboard seats every control a game maps', () => {
    VERSUS_KEYBOARD.forEach((map) => {
      expect(map.buttons).toHaveLength(12);
      map.buttons.forEach((slot, index) => { if (index !== 9) expect([slot].flat().length, `button ${index}`).toBe(1); });
    });
    const codes = VERSUS_KEYBOARD.flatMap((map) => [map.up, map.down, map.left, map.right, ...map.buttons.flat()]);
    expect(new Set(codes).size).toBe(codes.length);
  });
  it('keeps real keys from the page but lets Escape through, and ignores made-up keys', () => {
    const input = createInput({ keyboard: VERSUS_KEYBOARD, exclusiveKeyboard: true });
    const reached: string[] = [];
    const listener = (event: Event) => reached.push((event as KeyboardEvent).code);
    window.addEventListener('keydown', listener);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', key: 'a' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));
    const fake = new KeyboardEvent('keydown', { code: 'ArrowUp', key: 'ArrowUp' });
    syntheticKeys.add(fake);
    window.dispatchEvent(fake);
    const [first, second] = input.read();
    expect(first.x).toBe(-1); expect(second.y).toBe(0);
    expect(reached).toEqual(['Escape', 'ArrowUp']);
    window.removeEventListener('keydown', listener); input.destroy();
  });
  it('tap sends a full key press at its own target', () => {
    const target = document.createElement('div'), log: string[] = [];
    ['keydown', 'keyup'].forEach((type) => target.addEventListener(type, (event) => log.push(`${type}:${(event as KeyboardEvent).key}`)));
    createKeySender('capital-quiz', () => target).tap('1');
    expect(log).toEqual(['keydown:1', 'keyup:1']);
  });
});

describe('wrapVersus', () => {
  const fake = () => {
    const mounted: Array<{ seat: HTMLElement; services: GameServices; pause: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }> = [];
    const module: GameModule = {
      meta: { slug: 'snake', title: 't', category: 'arcade', description: '', instructions: '', accent: '#000000', mechanic: '' },
      mount(seat, seatServices) { const entry = { seat, services: seatServices, pause: vi.fn(), destroy: vi.fn() }; mounted.push(entry); return { pause: entry.pause, resume: vi.fn(), restart: vi.fn(), destroy: entry.destroy }; }
    };
    return { module, mounted };
  };
  it('gives both seats the same random sequence with private storage, and never reports to the shell', () => {
    const { module, mounted } = fake();
    const shell = services(), host = document.createElement('div');
    const controller = wrapVersus(module, { slug: 'snake', togglePause: vi.fn() }).mount(host, shell);
    expect(mounted).toHaveLength(2);
    expect(mounted[0].services.random()).toBe(mounted[1].services.random());
    mounted[0].services.storage.set('k', 1);
    expect(mounted[1].services.storage.get('k', 0)).toBe(0);
    mounted[0].services.reportScore(50); mounted[1].services.reportScore(20); mounted[0].services.reportScore(10);
    expect(shell.reportScore).not.toHaveBeenCalled();
    expect(host.querySelector('[data-seat-1]')?.textContent).toContain('50');
    expect(mounted[0].pause).toHaveBeenCalled();
    controller.destroy();
    expect(mounted[0].destroy).toHaveBeenCalled(); expect(host.childElementCount).toBe(0);
  });
  it.each(Object.keys(versusRules))('%s mounts twice with a safe lifecycle', async (slug) => {
    const module = await loadGame(slug), host = document.createElement('div');
    const controller = wrapVersus(module, { slug, togglePause: vi.fn() }).mount(host, services());
    expect(host.querySelectorAll('[data-versus-seat]')).toHaveLength(2);
    host.querySelectorAll('[data-versus-seat]').forEach((seatEl) => expect(seatEl.childElementCount).toBeGreaterThan(0));
    expect(() => { controller.pause(); controller.resume(); controller.restart(); controller.destroy(); }).not.toThrow();
  });
});
