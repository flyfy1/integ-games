import { afterEach, expect, it, vi } from 'vitest';
import { createAshfall } from '../src/games/ashfall/game.js';
import type { GameController } from '../src/core/game-types';
import { LEVELS } from '../src/games/ashfall/levels.js';
import { loadRecords, medalFor, recordMark, recordTime, rushTargets, stageTargets } from '../src/games/ashfall/challenge.js';
type State = Record<string, any>;
let controller: GameController;
let frames: FrameRequestCallback[] = [];
const flush = () => { for (let i = 0; i < 4; i++) { const f = frames; frames = []; f.forEach(cb => cb(performance.now())); } };
function boot(param: string, stored: State) {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  history.replaceState({}, '', `/play/ashfall?ashfall-debug&ashfall-level=${param}`);
  const host = document.createElement('div'); document.body.append(host);
  controller = createAshfall(host, { random: () => 0.5, isReducedMotion: true,
    storage: { get: (k: string, f: unknown) => stored[k] ?? f, set: (k: string, v: unknown) => { stored[k] = structuredClone(v); }, remove: vi.fn() },
    reportScore: vi.fn(), reportComplete: vi.fn() } as any);
  const d = (globalThis as any).__ashfall; d.manual(true); return d;
}
const select = (control: string, value: string) => {
  const el = document.querySelector(`select[data-control=${control}]`) as HTMLSelectElement;
  el.value = value; el.dispatchEvent(new Event('change', { bubbles: true }));
};
const click = (control: string) => (document.querySelector(`[data-control=${control}]`) as HTMLButtonElement).click();
function slay(d: State) {
  d.warp(d.level.ARENA.trigger + 70); d.step(240); d.enemies.forEach((e: State) => e.dead = true);
  Object.assign(d.boss, { phase: 2, armor: 0, hp: 1, state: 'idle', cd: 100 });
  Object.assign(d.player, { x: d.boss.x - 160, y: d.boss.y, face: 1, ammo: 4, shootCd: 0, invuln: true });
  const m = d.challenge.mutator; d.challenge.mutator = 'none'; // the finishing shot must land even in a no-shotgun replay
  d.press('shoot'); d.step(10); d.challenge.mutator = m; d.step(600);
}
const campaignSave = (): State => ({
  'ashfall-campaign-v3-normal': { version: 3, cleared: [1, 2, 3, 4, 5] },
  'ashfall-bests-v3-normal': { 1: { score: 999, time: 300 } },
  'ashfall-resume-v3-normal': { sentinel: 'keep me' }
});
const v3 = (s: State) => JSON.stringify(Object.keys(s).filter(k => k.includes('-v3-')).sort().map(k => [k, s[k]]));
afterEach(() => { controller?.destroy(); document.body.replaceChildren(); frames = []; vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('time attack and mutator clears record medals and marks under new keys and never touch the campaign save', () => {
  const stored = campaignSave(), before = v3(stored), d = boot('4', stored);
  expect(document.querySelectorAll('[role=radio]')).toHaveLength(4);
  select('mode', 'time'); expect(document.querySelector('[data-control=start]')?.textContent).toContain('TIME ATTACK');
  click('start'); flush(); expect(d.g.mode).toBe('play'); expect(d.challenge.kind).toBe('time');
  slay(d); expect(d.g.mode).toBe('victory'); expect(d.challengeResult.medal).toBeGreaterThan(0);
  expect(stored['ashfall-times-v1-normal']['4']).toBeGreaterThan(0);
  click('menu'); select('mode', 'time'); select('mutator', 'glass'); click('start'); flush();
  expect(d.challenge.mutator).toBe('glass'); slay(d);
  expect(d.challengeResult.mark).toBe('glass'); expect(stored['ashfall-marks-v1-normal']).toEqual({ 4: ['glass'] });
  click('menu'); expect(document.querySelector('[data-level="4"]')?.textContent).toContain('◇');
  expect(v3(stored)).toBe(before);
  // The campaign is the default again on the next visit and still starts a campaign run.
  controller.destroy(); const d2 = boot('4', stored); expect(document.querySelector('select[data-control=mode]') as HTMLSelectElement).toHaveProperty('value', 'campaign');
  d2.start(); expect(d2.challenge).toBeNull();
});
it('boss rush fights the act guardians back to back and records the act time', () => {
  const stored = campaignSave(), before = v3(stored), d = boot('2', stored);
  select('mode', 'rush'); click('start'); flush();
  const ids = LEVELS.filter(l => l.act === 0).map(l => l.id);
  for (const id of ids) {
    expect(d.g.level).toBe(id); expect(d.player.x).toBeGreaterThan(d.level.ARENA.left);
    slay(d); flush();
  }
  expect(d.g.mode).toBe('victory'); expect(d.challengeResult.fights.map((f: State) => f.id)).toEqual(ids);
  expect(document.querySelector('.af-eyebrow')?.textContent).toContain('BOSS RUSH');
  expect(stored['ashfall-rush-v1-normal']['0']).toBeGreaterThan(0); expect(v3(stored)).toBe(before);
  expect(d.g.forge ? JSON.stringify(d.g.forge) : '').not.toContain('3');
});
it('mutators change the rules only inside the replay', () => {
  const stored = campaignSave(), d = boot('4', stored);
  const base = d.enemies.length;
  select('mode', 'time'); select('mutator', 'double'); click('start'); flush();
  expect(d.enemies.length).toBe(base * 2);
  controller.restart(); expect(d.challenge.mutator).toBe('double'); expect(d.enemies.length).toBe(base * 2);
  for (const e of d.enemies) expect(d.level.PITS.some((p: State) => e.x > p.x && e.x < p.x + p.w)).toBe(false);
  d.challenge.mutator = 'noshot'; Object.assign(d.player, { ammo: 4, shootCd: 0 }); d.press('shoot'); d.step(2);
  expect(d.player.ammo).toBe(4);
  // Glass: the same slam that costs 18 health in a normal run fells the rider.
  d.challenge.mutator = 'glass'; d.warp(d.level.ARENA.trigger + 40); d.step(240); d.enemies.forEach((e: State) => e.dead = true);
  Object.assign(d.boss, { state: 'idle', next: 'slam', cd: 0, phase: 1 }); d.step();
  Object.assign(d.player, { x: d.boss.slamX, y: 450, hp: 100, iframe: 0, invuln: false, rolling: false, grounded: true });
  while (d.boss.state === 'windup') d.step();
  expect(d.player.dead).toBe(true);
});
it('modifiers stay locked on stages not yet cleared', () => {
  const d = boot('9', campaignSave()); select('mode', 'time');
  const opts = [...document.querySelectorAll('select[data-control=mutator] option')] as HTMLOptionElement[];
  expect(opts.filter(o => o.disabled).map(o => o.value)).toEqual(['glass', 'double', 'noshot']);
  select('mutator', 'glass'); click('start'); flush(); expect(d.challenge.mutator).toBe('none');
});
it('records keep the faster time, ignore junk and medal thresholds are ordered', () => {
  const s: State = {}, st = { get: (k: string, f: unknown) => s[k] ?? f, set: (k: string, v: unknown) => { s[k] = v; } };
  expect(recordTime(st, 'hard', 'time', 5, 80).improved).toBe(true);
  expect(recordTime(st, 'hard', 'time', 5, 90).improved).toBe(false);
  expect(recordTime(st, 'hard', 'time', 5, 70.04).best).toBe(70);
  expect(recordMark(st, 'hard', 5, 'glass').fresh).toBe(true); expect(recordMark(st, 'hard', 5, 'glass').fresh).toBe(false);
  s['ashfall-marks-v1-hard'] = { 5: ['glass', 'bogus', 'glass'], 99: ['glass'], x: 3 };
  s['ashfall-times-v1-hard'] = { 5: 70, 6: -1, 7: 'fast', 30: 10 };
  expect(loadRecords(st, 'hard')).toEqual({ times: { 5: 70 }, rush: {}, marks: { 5: ['glass'] } });
  expect(loadRecords(st, 'easy')).toEqual({ times: {}, rush: {}, marks: {} });
  for (const l of LEVELS) { const t = stageTargets(l.id); expect(t.gold).toBeLessThan(t.silver); expect(t.silver).toBeLessThan(t.bronze); }
  for (let a = 0; a < 5; a++) { const t = rushTargets(LEVELS.filter(l => l.act === a).map(l => l.id)); expect(t.gold).toBeLessThan(t.silver); }
  expect(medalFor(10, stageTargets(4))).toBe(3); expect(medalFor(9999, stageTargets(4))).toBe(0);
});
