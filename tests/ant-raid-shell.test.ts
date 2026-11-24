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
let now = 0;
const pump = (seconds: number) => { for (let i = 0; i < seconds * 20; i++) { const next = frames; frames = []; now += 50; for (const cb of next) cb(now); } };
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
  it('Bluestreak: the first dive only grazes a lowered bridge, then the Lift / Lower button saves it', () => {
    const session = createSession(levelById('3-5')!, { random: mulberry32(1), loadout: ['worker', 'porter', 'bridger'] });
    const sim = session.sim, bridge = idx(5, 4);
    for (let x = 2; x <= 4; x++) paint(sim, idx(x, 4));
    playCard(sim, 'bridger', bridge);
    const bridgers = () => sim.ants.filter(a => a.alive && a.caste === 'bridger').length;
    const until = (ok: () => boolean, limit = 60) => { const events = []; for (let t = 0; t < limit && !ok(); t += 0.1) events.push(...session.advance(0.1)); return events; };
    until(() => !!sim.bridged[bridge]);
    expect(sim.bridged[bridge]).toBe(1);
    for (let x = 5; x <= 9; x++) paint(sim, idx(x, 4));
    const dive = sim.hazards.find(h => h.kind === 'kingfisher')!;
    // First dive: the shadow is long, the button says Lift, and a newcomer who ignores it loses nobody.
    until(() => dive.phase === 1);
    expect(dive.warn).toBeGreaterThan(4);
    expect(session.bridgeHint).toBe('lift');
    const before = bridgers();
    const events = until(() => dive.phase === 0, 10);
    expect(events.some(e => e.type === 'boss' && e.what === 'graze')).toBe(true);
    expect(bridgers()).toBe(before);
    expect(sim.bridged[bridge]).toBe(1);
    // Second dive: Lift from the button, the dive misses, and Lower puts the bridge back.
    until(() => dive.phase === 1);
    session.bridgeAction();
    expect(sim.bridged[bridge]).toBe(0);
    until(() => dive.phase === 0, 10);
    expect(bridgers()).toBe(before);
    expect(session.bridgeHint).toBe('lower');
    session.bridgeAction();
    expect(sim.bridged[bridge]).toBe(1);
  });
  it('a tap on a starred food cycles its priority', () => {
    const session = createSession(levelById('1-2')!, { random: mulberry32(1) });
    session.dragStart(1, 4); for (let x = 2; x <= 7; x++) session.dragTo(x, 4); for (let y = 5; y <= 7; y++) session.dragTo(7, y); session.dragEnd();
    const bread = session.sim.foods.find(f => f.id === 'bread')!;
    session.dragStart(7, 7); session.dragEnd();
    expect(bread.priority).toBe(2);
  });
});

describe('ant-raid shell (puzzle mode)', () => {
  const visible = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.ar-hud .ar-top > *, .ar-hud .ar-bottom > *')].filter(el => !el.hidden && !el.closest('[hidden]'));
  it('mounts on the title, survives the lifecycle and clears its host', () => {
    const { host, controller, ar } = mount();
    expect(ar.screen).toBe('title');
    controller.pause(); controller.resume(); controller.restart();
    controller.destroy();
    expect(host.childElementCount).toBe(0);
  });
  it('Play goes straight into 1-1 with no dialogue and no rule card; only the goal chip shows until the trail connects', () => {
    const { ar, root, controller } = mount();
    (root.querySelector('[data-action=play]') as HTMLButtonElement).click();
    expect(ar.screen).toBeNull();
    expect(ar.dialogue).toBe(false);
    expect(ar.session.level.id).toBe('1-1');
    expect(visible(root).map(el => el.dataset.ui)).toEqual(['goal']);
    const s = ar.session;
    s.dragStart(1, 4); for (let x = 2; x <= 7; x++) s.dragTo(x, 4); s.dragEnd();
    pump(0.1);
    expect(visible(root).map(el => el.dataset.ui)).toEqual(['goal', 'go']);
    controller.destroy();
  });
  it('A6: no more than seven HUD elements on any chapter 1-2 level, every control labelled with words', () => {
    const { ar, root, controller } = mount();
    ar.save.levels['1-1'] = { win: true, elegant: false, fails: 0, best: 6 };
    for (const id of ['1-2', '1-3', '1-4', '1-5', '1-6', '2-1', '2-2', '2-3', '2-4']) {
      ar.play(id);
      ar.go('title'); ar.play(id);
      if (ar.screen === 'rule') (root.querySelector('[data-action=ok]') as HTMLButtonElement).click();
      ar.session.dragStart(1, 4); ar.session.dragTo(2, 4); ar.session.dragEnd();
      pump(0.1);
      const items = visible(root);
      expect(items.length, id).toBeLessThanOrEqual(7);
      for (const el of items) if (el.tagName === 'BUTTON') expect(el.textContent!.trim().length, `${id} ${el.dataset.ui}`).toBeGreaterThan(1);
    }
    controller.destroy();
  });
  it('reports a win by level number, saves it under its own key and leaves the old save alone', () => {
    const store = storage();
    store.set('save', { v: 1, levels: { '1-1': { win: true } }, lang: 'zh', settings: { music: 0.2, sfx: 0.3, reducedFx: false } });
    const svc = services(store);
    const { ar, controller, root } = mount(svc);
    expect(root.querySelector('.ar-notice')!.textContent).toContain('解谜');
    ar.play('1-1');
    const s = ar.session;
    s.dragStart(1, 4); for (let x = 2; x <= 7; x++) s.dragTo(x, 4); s.dragEnd();
    s.go();
    pump(4);
    expect(svc.reportComplete).toHaveBeenCalledWith(1);
    expect(ar.screen).toBe('results');
    const saved = store.values.get('puzzle') as { levels: Record<string, { win: boolean }>; lang: string; settings: { music: number } };
    expect(saved.levels['1-1'].win).toBe(true);
    expect(saved.lang).toBe('zh');
    expect(saved.settings.music).toBe(0.2);
    expect((store.values.get('save') as { levels: Record<string, unknown> }).levels['1-1']).toEqual({ win: true });
    controller.destroy();
  });
  it('survives junk saves', () => {
    for (const junk of [42, 'x', [1, 2], { levels: 7, rules: 'no', settings: null }, { levels: { '1-1': { win: 'yes' }, '9-9': { win: true } } }]) {
      const store = storage(); store.set('puzzle', junk); store.set('save', junk);
      const { ar, controller } = mount(services(store));
      expect(ar.screen).toBe('title');
      expect(ar.save.levels['9-9']).toBeUndefined();
      controller.destroy();
    }
  });
  it('A5: a failed run is back in Plan within 0.5 s of the verdict, trail kept, reason on the board', () => {
    const { ar, root, controller } = mount();
    ar.save.levels['1-3'] = { win: true, elegant: false, fails: 0, best: 10 };
    ar.play('1-4');
    if (ar.screen === 'rule') (root.querySelector('[data-action=ok]') as HTMLButtonElement).click();
    const s = ar.session;
    s.dragStart(1, 4); s.dragTo(1, 3); for (let x = 2; x <= 9; x++) s.dragTo(x, 3); s.dragTo(9, 4); s.dragEnd();
    const cost = s.plan.cost;
    s.go();
    let verdictAt = -1, planAt = -1;
    for (let k = 0; k < 400 && planAt < 0; k++) {
      pump(0.05);
      if (verdictAt < 0 && s.run && s.run.status === 'lost') verdictAt = k;
      if (verdictAt >= 0 && s.mode === 'plan') planAt = k;
    }
    expect(planAt).toBeGreaterThan(0);
    expect((planAt - verdictAt) * 0.05).toBeLessThanOrEqual(0.5 + 0.05);
    expect(s.plan.cost).toBe(cost);
    expect(root.querySelector('.ar-banner')!.textContent).toMatch(/spider|lost/i);
    controller.destroy();
  });
  it('every rule card has a picture and at most twelve words', async () => {
    const { RULES, wordCount } = await import('../src/games/ant-raid/puzzle/rules');
    for (const card of Object.values(RULES)) {
      expect(wordCount(card.text.en), card.id).toBeLessThanOrEqual(12);
      expect(card.text.zh.length, card.id).toBeLessThanOrEqual(28);
      expect(typeof card.draw).toBe('function');
    }
  });
});

describe('ant-raid classic data (kept out of the build path)', () => {
  it('every caste has bilingual names', () => {
    for (const caste of Object.values(CASTES)) expect(caste.name.en && caste.name.zh && caste.blurb.zh).toBeTruthy();
  });
});
