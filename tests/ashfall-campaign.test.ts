import { afterEach, expect, it, vi } from 'vitest';
import { createAshfall } from '../src/games/ashfall/game.js';
import type { GameController } from '../src/core/game-types';
import { LEVELS } from '../src/games/ashfall/levels.js';
type State = Record<string, any>;
let controller: GameController;
const reportScore = vi.fn(), complete = vi.fn();
function boot(param = '1', stored: State = {}, unavailable = false) {
  history.replaceState({}, '', `/play/ashfall?keep=yes&ashfall-debug&ashfall-level=${param}`);
  const host = document.createElement('div'); document.body.append(host);
  controller = createAshfall(host, { random: () => 0.5, isReducedMotion: true,
    storage: { get: (k: string, f: unknown) => { if (unavailable) throw Error('Storage denied'); return stored[k] ?? f; }, set: (k: string, v: unknown) => { if (unavailable) throw Error('Storage denied'); stored[k] = v; }, remove: vi.fn() },
    reportScore, reportComplete: complete } as any);
  return (globalThis as any).__ashfall;
}
function finish(d: State) {
  d.warp(d.level.ARENA.trigger + 70); d.step(240); d.enemies.forEach((e: State) => e.dead = true);
  Object.assign(d.boss, { phase: 2, armor: 0, hp: 1, state: 'idle', cd: 100 });
  Object.assign(d.player, { x: d.boss.x - 160, y: d.boss.y, face: 1, ammo: 4, shootCd: 0, invuln: true });
  d.press('shoot'); d.step(400);
}
function key(key: string) { window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); }
afterEach(() => { controller?.destroy(); document.body.replaceChildren(); vi.clearAllMocks(); vi.restoreAllMocks(); });
it.each(['1','2','3','unknown','0',''])('preselects %s without autoplay and leaves background taps inert', param => {
  const d = boot(param); const id = ['1','2','3'].includes(param) ? Number(param) : 1;
  expect(d.g.mode).toBe('title'); expect(document.querySelector('[role=radio][aria-checked=true]')?.textContent).toContain(`LEVEL ${LEVELS[id - 1].numeral}`);
  expect(document.querySelectorAll('[role=radio]')).toHaveLength(4);
  document.querySelector('canvas')!.dispatchEvent(new Event('pointerdown')); key('j'); key(' '); d.step(300);
  expect(d.g.mode).toBe('title'); expect(d.g.score).toBe(0);
});
it('supports numeric, arrow and pointer selection while retaining unrelated URL parameters', () => {
  const d = boot(); key('3'); expect(location.search).toContain('ashfall-level=3'); expect(location.search).toContain('keep=yes'); expect(d.g.mode).toBe('title');
  expect(document.activeElement?.getAttribute('data-level')).toBe('3'); key('ArrowRight'); expect(location.search).toContain('ashfall-level=4');
  (document.querySelector('[data-level="2"]') as HTMLButtonElement).click();
  expect(document.querySelector('[data-control=start]')?.textContent).toBe('START LEVEL II');
  expect(document.querySelector('.af-route')?.textContent).toContain('II → XX'); d.start(); expect(d.g.level).toBe(2);
  expect(d.runStartLevelId).toBe(2); expect(d.player.hp).toBe(100); expect(d.player.ammo).toBe(4);
});
it('opens the menu with hidden gameplay pads on coarse pointers', () => {
  vi.spyOn(globalThis, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
  const d = boot('3'); expect(d.g.mode).toBe('title'); expect(document.querySelector('.ashfall-touch.on')).toBeNull();
  d.start(); expect(document.querySelector('.ashfall-touch.on')).not.toBeNull();
});
it.each([1,2,3])('settles the route from %i once and restarts the chosen run', start => {
  const stored: State = {}, d = boot(String(start), stored); d.start();
  for (let id = start; id <= 20; id++) {
    expect(d.g.level).toBe(id); d.g.score += 100; d.g.kills += 2;
    if (id === 2) { d.g.upgrades.add('edge'); d.g.upgrades.add('guard'); }
    finish(d); const score = d.g.score, time = d.g.playT;
    expect(d.g.results).toHaveLength(id - start + 1); expect(d.g.results.at(-1).id).toBe(id);
    d.step(600); expect(d.g.score).toBe(score); expect(d.g.playT).toBe(time);
    if (id < 20) {
      expect(d.g.mode).toBe('interlude'); expect(complete).not.toHaveBeenCalled();
      expect(document.querySelector('.af-eyebrow')?.textContent).toContain(`LEVEL ${LEVELS[id - 1].numeral} COMPLETE → LEVEL ${LEVELS[id].numeral}`);
      d.g.conduits.push({}); d.g.pillars.push({}); d.g.hooks.push({ state: 'pull' }); d.player.hooked = true;
      d.continue(); d.continue(); expect(d.g.level).toBe(id + 1);
      expect(d.g.score).toBe(score); expect(d.g.playT).toBe(time); expect(d.player.hp).toBe(100); expect(d.player.ammo).toBe(4);
      expect(d.g.upgrades.size).toBe(0); expect(d.g.pillars).toHaveLength(0); expect(d.g.hooks).toHaveLength(0); expect(d.g.conduits).toHaveLength(0); expect(d.player.hooked).toBe(false);
      expect(d.g.cpIdx).toBe(0); expect(d.g.cam.x).toBe(0); expect(d.g.cam.y).toBe(0);
      if (id === 2) { expect(d.g.flood).toBeUndefined(); expect(d.boss.y).toBe(450); }
    }
  }
  expect(d.g.mode).toBe('victory'); expect(complete).toHaveBeenCalledTimes(start === 1 ? 1 : 0); expect(reportScore).not.toHaveBeenCalled();
  expect(d.g.results.reduce((s: number,r: State) => s + r.score,0)).toBe(d.g.score);
  expect(stored['ashfall-bests-v3-normal'][start]).toBe(d.g.score); expect(stored['ashfall-best']).toBeUndefined();
  const route = LEVELS.slice(start - 1).map(l => l.id); expect(stored['ashfall-campaign-v3-normal'].cleared).toEqual(route);
  expect(document.querySelectorAll('tbody tr')).toHaveLength(route.length);
  d.step(300); d.continue(); expect(complete).toHaveBeenCalledTimes(start === 1 ? 1 : 0);
  controller.restart(); expect(d.g.level).toBe(start); expect(d.g.score).toBe(0); expect(d.g.kills).toBe(0); expect(d.g.deaths).toBe(0); expect(d.g.playT).toBe(0); expect(d.g.results).toHaveLength(0);
});
it('returns to open selection after results and starts a fresh chosen route', () => {
  const d = boot('3'); d.start(); finish(d); (document.querySelector('[data-control=menu]') as HTMLButtonElement).click();
  expect(d.g.mode).toBe('title'); expect(d.g.score).toBe(0); key('2'); d.start(); expect(d.g.level).toBe(2); expect(d.g.upgrades.size).toBe(0); expect(d.g.results).toHaveLength(0);
  expect(document.querySelector('.ashfall-ribbon strong')?.textContent).toBe('LEVEL II');
});
it('migrates legacy unlock only to I, ignores malformed records and survives denied storage', () => {
  const d = boot('2', { 'ashfall-level2': true, 'ashfall-best': 999999, 'ashfall-bests-v2': { 2: 'bad' }, 'ashfall-progress-v2': { version: 2, cleared: [3,99,'2'] } });
  const cards = [...document.querySelectorAll('[role=radio]')];
  expect(cards[0].textContent).toContain('CLEARED'); expect(cards[1].textContent).not.toContain('CLEARED'); expect(cards[2].textContent).toContain('CLEARED');
  expect(document.querySelector('.af-route')?.textContent).not.toContain('BEST'); d.start(); controller.destroy();
  const denied = boot('3', {}, true); denied.start(); finish(denied); expect(denied.g.mode).toBe('interlude'); expect(complete).not.toHaveBeenCalled();
});
