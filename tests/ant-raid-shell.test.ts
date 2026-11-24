import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameServices, GameStorage } from '../src/core/game-types';
import { antRaid } from '../src/games/ant-raid';
import { CASTES, LEVEL_LIST, META_UPGRADES } from '../src/games/ant-raid/data';
import { makeEndlessLevel } from '../src/games/ant-raid/data/endless';
import { applyOutcome, buyUpgrade, defaultSave, isUnlocked, loadSave, migrate, respec, SAVE_KEY, writeSave } from '../src/games/ant-raid/save';
import { createSim, mulberry32, paint, playCard, step } from '../src/games/ant-raid/sim';
import { idx } from '../src/games/ant-raid/core';
import { createSession } from '../src/games/ant-raid/session';
import { levelById } from '../src/games/ant-raid/data';

const storage = (): GameStorage & { values: Map<string, unknown> } => {
  const values = new Map<string, unknown>();
  return { values, get: <T>(key: string, fallback: T) => (values.get(key) as T | undefined) ?? fallback, set: (key, value) => { values.set(key, value); }, remove: (key) => { values.delete(key); } };
};
const services = (store = storage()) => ({
  storage: store, sound: { muted: true, setMuted: vi.fn(), stop: vi.fn(), play: vi.fn() }, random: mulberry32(7),
  reportScore: vi.fn(), reportComplete: vi.fn(), isReducedMotion: true
}) satisfies GameServices;

const originalRaf = globalThis.requestAnimationFrame, originalCancel = globalThis.cancelAnimationFrame;
let frames: FrameRequestCallback[] = [];
const pump = (seconds: number) => { let now = performance.now(); for (let i = 0; i < seconds * 20; i++) { const next = frames; frames = []; now += 50; for (const cb of next) cb(now); } };
afterEach(() => { globalThis.requestAnimationFrame = originalRaf; globalThis.cancelAnimationFrame = originalCancel; frames = []; });
const mount = (svc = services()) => {
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => { frames.push(cb); return frames.length; }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame;
  const host = document.createElement('div');
  document.body.append(host);
  const controller = antRaid.mount(host, svc);
  const root = host.querySelector('[data-ant-raid]') as HTMLElement & { __ar: any };
  return { host, controller, root, ar: root.__ar, svc };
};

describe('ant-raid save', () => {
  it('migrates junk to a clean v1 save and round-trips', () => {
    expect(migrate(null)).toEqual(defaultSave());
    expect(migrate({ v: 1, crystals: -5, owned: ['worker', 'dragon'], levels: { '1-1': { win: 'yes' } } }).owned).toEqual(['worker']);
    const store = storage();
    const save = defaultSave(); save.crystals = 7; save.levels['1-1'] = { win: true, bonus: false, par: true, bestTime: 30, fails: 0 };
    expect(writeSave(store, save)).toBe(true);
    expect(store.values.has(SAVE_KEY)).toBe(true);
    expect(loadSave(store)).toEqual(save);
  });
  it('pays crystals once per star, counts boss fails for mercy and unlocks the next level', () => {
    const save = defaultSave();
    const [first, second] = LEVEL_LIST;
    expect(isUnlocked(save, second.id)).toBe(false);
    expect(applyOutcome(save, first, { won: true, bonus: true, par: false, time: 40 }).crystals).toBe(2);
    expect(applyOutcome(save, first, { won: true, bonus: true, par: true, time: 30 }).crystals).toBe(1);
    expect(save.levels[first.id].bestTime).toBe(30);
    expect(isUnlocked(save, second.id)).toBe(true);
    const boss = LEVEL_LIST.find(l => l.boss)!;
    applyOutcome(save, boss, { won: false, bonus: false, par: false, time: 100 });
    applyOutcome(save, boss, { won: false, bonus: false, par: false, time: 100 });
    expect(save.levels[boss.id].fails).toBe(2);
  });
  it('buys upgrades and refunds them on respec', () => {
    const save = defaultSave(); save.crystals = 100;
    expect(buyUpgrade(save, META_UPGRADES[0])).toBe(true);
    const spent = 100 - save.crystals;
    expect(respec(save)).toBe(spent);
    expect(save.crystals).toBe(100);
  });
});

describe('ant-raid endless and daily', () => {
  it('builds the same yard for the same seed and runs until the colony is spent', () => {
    const a = makeEndlessLevel(mulberry32(42), true), b = makeEndlessLevel(mulberry32(42), true);
    expect(a).toEqual(b);
    const level = makeEndlessLevel(mulberry32(5), false);
    const sim = createSim(level, { random: mulberry32(5), loadout: ['worker', 'porter', 'soldier'] });
    let prev = sim.nest;
    const food = sim.foods[0];
    for (let x = level.nest[0] + 1; x <= food.x && x < 16; x++) { if (paint(sim, idx(x, level.nest[1]), prev).ok) prev = idx(x, level.nest[1]); }
    for (let i = 0; i < 400 * 30 && sim.status === 'playing'; i++) { if (i % 60 === 0) playCard(sim, 'worker'); step(sim); }
    expect(sim.status).not.toBe('playing');
    expect(sim.time).toBeGreaterThan(60);
  });
});

describe('ant-raid session input', () => {
  it('drags paint a trail, and a press on a cell with a post card in hand sends that ant there', () => {
    const session = createSession(levelById('1-3')!, { random: mulberry32(1) });
    session.dragStart(1, 4); for (let x = 2; x <= 6; x++) session.dragTo(x, 4); session.dragEnd();
    expect(session.sim.trailParent[idx(6, 4)]).not.toBe(-1);
    session.pressCard('soldier');
    expect(session.view.card).toBe('soldier');
    session.dragStart(5, 4); session.dragEnd();
    expect(session.view.card).toBeNull();
    expect(session.sim.queue.some(q => q.caste === 'soldier' && q.post === idx(5, 4))).toBe(true);
  });
  it('a tap on a starred food cycles its priority', () => {
    const session = createSession(levelById('1-2')!, { random: mulberry32(1) });
    session.dragStart(1, 4); for (let x = 2; x <= 7; x++) session.dragTo(x, 4); for (let y = 5; y <= 7; y++) session.dragTo(7, y); session.dragEnd();
    const bread = session.sim.foods.find(f => f.id === 'bread')!;
    session.dragStart(7, 7); session.dragEnd();
    expect(bread.priority).toBe(2);
  });
});

describe('ant-raid shell', () => {
  it('mounts on the title, survives the lifecycle and clears its host', () => {
    const { host, controller, ar } = mount();
    expect(ar.screen).toBe('title');
    controller.pause(); controller.resume(); controller.restart();
    controller.destroy();
    expect(host.childElementCount).toBe(0);
  });
  it('reports a campaign win by level number and saves it', () => {
    const svc = services();
    const { ar, controller } = mount(svc);
    ar.start('1-1');
    const sim = ar.session.sim;
    sim.crumbs = 999;
    pump(4);
    expect(svc.reportComplete).toHaveBeenCalledWith(1);
    expect(svc.reportScore).not.toHaveBeenCalled();
    expect(ar.screen).toBe('results');
    expect(loadSave(svc.storage).levels['1-1'].win).toBe(true);
    controller.destroy();
  });
  it('reports Endless crumbs as the score, and keeps a destroyed raid from reporting twice', () => {
    const svc = services();
    const { ar, controller } = mount(svc);
    ar.save.levels['1-5'] = { win: true, bonus: false, par: false, bestTime: 100, fails: 0 };
    ar.endless(false);
    pump(1);
    const sim = ar.session.sim;
    sim.crumbs = 37; sim.status = 'lost';
    pump(3);
    expect(svc.reportScore).toHaveBeenCalledTimes(1);
    expect(svc.reportScore).toHaveBeenCalledWith(37);
    expect(svc.reportComplete).not.toHaveBeenCalled();
    controller.destroy();
    expect(svc.reportScore).toHaveBeenCalledTimes(1);
  });
  it('every caste has bilingual names', () => {
    for (const caste of Object.values(CASTES)) expect(caste.name.en && caste.name.zh && caste.blurb.zh).toBeTruthy();
  });
});
