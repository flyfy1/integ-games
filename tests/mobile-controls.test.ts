import { afterEach, describe, expect, it, vi } from 'vitest';
import { continuousSlugs, createMobileControls, mobileProfiles } from '../src/games/_shared/mobile-controls';

const originalMatchMedia = globalThis.matchMedia;
afterEach(() => { globalThis.matchMedia = originalMatchMedia; document.body.replaceChildren(); });

describe('shared mobile controls', () => {
  it('has profiles for exactly the thirteen continuous cabinets', () => {
    expect(continuousSlugs).toHaveLength(13);
    expect(new Set(continuousSlugs).size).toBe(13);
    continuousSlugs.forEach((slug) => expect(mobileProfiles[slug]).toBeDefined());
    expect(mobileProfiles.arena.shape).toBe('stick-action');
  });

  it('releases held state on blur and removes controls on destroy', () => {
    globalThis.matchMedia = vi.fn(() => ({ matches: true })) as unknown as typeof matchMedia;
    const changes: Array<[string, boolean]> = [];
    const host = document.createElement('div'); document.body.append(host);
    const controls = createMobileControls(host, { shape: 'single-action', labels: ['Throw'], onChange: (action, held) => changes.push([action, held]) });
    const button = host.querySelector<HTMLButtonElement>('.mobile-control')!;
    button.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    window.dispatchEvent(new Event('blur'));
    expect(changes).toEqual([['throw', true], ['throw', false]]);
    controls.destroy();
    expect(host.querySelector('.mobile-controls')).toBeNull();
  });

  it('clears a dragged stick direction on blur', () => {
    globalThis.matchMedia = vi.fn(() => ({ matches: true })) as unknown as typeof matchMedia;
    const changes: Array<[string, boolean]> = [];
    const host = document.createElement('div'); document.body.append(host);
    createMobileControls(host, { shape: 'stick-action', labels: [], onChange: (action, held) => changes.push([action, held]) });
    const stick = host.querySelector<HTMLElement>('.mobile-stick')!;
    Object.defineProperty(stick, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 100, height: 100 }) });
    const down = new Event('pointerdown', { bubbles: true, cancelable: true }); Object.defineProperty(down, 'clientX', { value: 95 }); Object.defineProperty(down, 'clientY', { value: 50 }); Object.defineProperty(down, 'pointerId', { value: 1 });
    stick.dispatchEvent(down); window.dispatchEvent(new Event('blur'));
    expect(changes).toEqual([['right', true], ['right', false]]);
  });

  it('keeps an action held until every pointer on that action is released', () => {
    globalThis.matchMedia = vi.fn(() => ({ matches: true })) as unknown as typeof matchMedia;
    const changes: Array<[string, boolean]> = [];
    const host = document.createElement('div'); document.body.append(host);
    createMobileControls(host, { shape: 'single-action', labels: ['Drop'], onChange: (action, held) => changes.push([action, held]) });
    const button = host.querySelector<HTMLButtonElement>('.mobile-control')!;
    const pointer = (type: string, id: number) => { const event = new Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(event, 'pointerId', { value: id }); return event; };
    button.dispatchEvent(pointer('pointerdown', 1)); button.dispatchEvent(pointer('pointerdown', 2));
    expect(button.classList.contains('is-held')).toBe(true);
    button.dispatchEvent(pointer('pointerup', 1));
    expect(changes).toEqual([['drop', true]]);
    button.dispatchEvent(pointer('pointerup', 2));
    expect(changes).toEqual([['drop', true], ['drop', false]]);
    expect(button.classList.contains('is-held')).toBe(false);
  });
});
