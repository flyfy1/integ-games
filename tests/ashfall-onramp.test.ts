import { afterEach, expect, it, vi } from 'vitest';
import { createAshfall } from '../src/games/ashfall/game.js';
import type { GameController } from '../src/core/game-types';
type State = Record<string, any>;
let controller: GameController | undefined;
function boot(stored: State = {}, query = 'ashfall-level=1') {
  history.replaceState({}, '', `/play/ashfall?ashfall-debug&${query}`);
  const host = document.createElement('div'); document.body.append(host);
  controller = createAshfall(host, { random: () => 0.5, isReducedMotion: true,
    storage: { get: (k: string, f: unknown) => stored[k] ?? f, set: (k: string, v: unknown) => { stored[k] = v; }, remove: vi.fn() },
    reportScore: vi.fn(), reportComplete: vi.fn() } as any);
  return (globalThis as any).__ashfall;
}
const resumeRecord = { version: 3, difficulty: 'normal', level: 2, start: 1, reward: 'edge',
  run: { score: 900, kills: 4, deaths: 1, playT: 80, forge: { edge: 0, guard: 0, reload: 0 }, results: [{ id: 1, time: 80, kills: 4, falls: 1, score: 900, rank: 'B' }] } };
const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
afterEach(() => { controller?.destroy(); controller = undefined; document.body.replaceChildren(); });

it('puts one primary Start action above the stage grid on a first visit', () => {
  boot();
  const starts = document.querySelectorAll('[data-control=start]'), grid = document.querySelector('.af-levels')!;
  expect(starts).toHaveLength(1); expect(starts[0].className).toBe('af-primary'); expect(starts[0].textContent).toBe('START LEVEL I');
  expect(before(starts[0], grid)).toBe(true); expect(document.querySelector('[data-control=resume]')).toBeNull();
  expect(document.querySelectorAll('.af-primary')).toHaveLength(1);
  expect(document.querySelector('.af-route')?.textContent).toContain('THE FIRST DESCENT');
});

it.each([['en', 'CONTINUE RUN · LEVEL II'], ['zh', '继续挑战 · 第 II 关']])('makes Continue the single primary action when a saved run exists (%s)', (language, label) => {
  const d = boot({ 'ashfall-resume-v3-normal': resumeRecord, 'ashfall-language': language });
  const resume = document.querySelector('[data-control=resume]')!, start = document.querySelector('[data-control=start]')!;
  expect(document.querySelectorAll('[data-control=resume]')).toHaveLength(1);
  expect(resume.textContent).toBe(label); expect(resume.className).toBe('af-primary'); expect(start.className).toBe('af-secondary');
  expect(before(resume, start)).toBe(true); expect(before(start, document.querySelector('.af-levels')!)).toBe(true);
  expect(d.g.mode).toBe('title');
});

it('a fresh press after falling skips the retry wait without leaking the press into play', () => {
  const d = boot(); d.start(); d.step(30);
  Object.assign(d.player, { dead: true, deadT: 0, hp: 0 });
  d.press('attack'); d.step(12); expect(d.player.dead).toBe(true); // too early: the fall has to register first
  d.step(30); expect(d.player.dead).toBe(true);                    // the early press expired and did not queue a skip
  d.press('attack'); d.step(1);
  expect(d.player.dead).toBe(false); expect(d.player.hp).toBe(100); expect(d.player.x).toBe(d.level.CHECKPOINTS[0]);
  d.step(3); expect(d.player.atk).toBeNull();
});

it('still returns to the checkpoint unaided after the original delay', () => {
  const d = boot(); d.start(); d.step(30);
  Object.assign(d.player, { dead: true, deadT: 0, hp: 0 });
  d.step(140); expect(d.player.dead).toBe(true); d.step(10); expect(d.player.dead).toBe(false);
});

it('reports the real pit damage for the difficulty and teaches the jump only once', () => {
  const d = boot({}, 'ashfall-level=1&difficulty=easy'); d.start(); d.step(30);
  d.enemies.forEach((e: State) => e.dead = true);
  const pit = d.level.PITS[0], fall = () => { Object.assign(d.player, { x: pit.x + pit.w / 2, y: 720 + 130, vy: 0, grounded: false, iframe: 0 }); d.step(1); };
  d.g.popups.length = 0; fall();
  expect(d.player.hp).toBeCloseTo(100 - 30 * 0.55); expect(d.player.dead).toBe(false);
  const texts = () => d.g.popups.map((p: State) => p.text);
  expect(texts()).toContain('-17'); expect(texts().filter((t: string) => t.startsWith('JUMP THE GAP'))).toHaveLength(1);
  d.g.popups.length = 0; fall();
  expect(texts()).toContain('-17'); expect(texts().some((t: string) => t.startsWith('JUMP THE GAP'))).toBe(false);
});

it('describes touch controls instead of keys on a touch device', () => {
  const original = globalThis.matchMedia;
  (globalThis as any).matchMedia = (q: string) => ({ matches: q.includes('coarse'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  try {
    const d = boot();
    expect(document.querySelector('.af-panel')?.textContent).toContain('SLASH combo');
    expect(document.querySelector('.af-panel')?.textContent).not.toContain('Enter: start');
    d.start(); d.step(400); d.boss.state = 'idle'; d.render();
    const cue = document.querySelector('.ashfall-pattern')!.textContent!;
    expect(cue).toContain('Build heat'); expect(cue).toContain('SLASH combo'); expect(cue).not.toMatch(/\bJ combo|Shift/);
    Object.assign(d.player, { dead: true, deadT: 0.1, hp: 0 }); d.step(1); d.render();
    expect(document.querySelector('.ashfall-pattern')!.textContent).toContain('tap SLASH');
  } finally { (globalThis as any).matchMedia = original; }
});
