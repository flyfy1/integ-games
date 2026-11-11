import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameServices, GameStorage } from '../src/core/game-types';
import midnightKitchen, { campaignNumber } from '../src/games/midnight-kitchen';
import { createAudio } from '../src/games/midnight-kitchen/audio';
import { CONTENT, ENDLESS_LEVEL, LEVEL_LIST, LEVELS, META_UPGRADES, RECIPES } from '../src/games/midnight-kitchen/data';
import { createI18n, EN, ZH } from '../src/games/midnight-kitchen/i18n';
import { SAVE_KEY, SAVE_VERSION, applyOutcome, buyUpgrade, canBuy, defaultSave, isUnlocked, loadSave, migrate, resetSave, respec, respecValue, starsOf, totalStars, upgradePrice, writeSave, type Outcome } from '../src/games/midnight-kitchen/save';
import { createSession, recipesIfPlaced } from '../src/games/midnight-kitchen/session';
import { createSim, defenderAt, mulberry32, place, spawnEnemy } from '../src/games/midnight-kitchen/sim';
import type { ChapterDef, LevelDef } from '../src/games/midnight-kitchen/types';
import { nearestInDirection } from '../src/games/midnight-kitchen/ui/dom';
import { createHud, stackLabel } from '../src/games/midnight-kitchen/ui/hud';
import { recommend } from '../src/games/midnight-kitchen/ui/loadout';
import { chapterModel } from '../src/games/midnight-kitchen/ui/map';
import { metaEffect, tierStats, upgradeDiff } from '../src/games/midnight-kitchen/ui/stats';

const memory = (initial: Record<string, unknown> = {}): GameStorage & { values: Map<string, unknown> } => {
  const values = new Map<string, unknown>(Object.entries(initial));
  return { values, get: <T>(key: string, fallback: T) => (values.has(key) ? values.get(key) as T : fallback), set: (key, value) => { values.set(key, JSON.parse(JSON.stringify(value))); }, remove: key => { values.delete(key); } };
};
const services = (storage: GameStorage = memory(), muted = false): GameServices & { sound: { play: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; muted: boolean } } => ({
  storage, sound: { muted, setMuted: vi.fn(), stop: vi.fn(), play: vi.fn() }, random: mulberry32(5), reportScore: vi.fn(), reportComplete: vi.fn(), isReducedMotion: true
});
const outcome = (patch: Partial<Outcome> = {}): Outcome => ({ won: true, flawless: true, bonus: false, time: 120, score: 0, wave: 5, recipes: [], enemiesSeen: ['ant'], defendersUsed: ['burner', 'pepper'], ...patch });

describe('midnight kitchen save', () => {
  it('starts from a valid default and round-trips through storage', () => {
    const storage = memory();
    const save = loadSave(storage);
    expect(save).toEqual(defaultSave());
    expect(save.v).toBe(SAVE_VERSION);
    save.crumbs = 77; save.lang = 'zh'; save.levels['c1-1'] = { win: true, flawless: false, bonus: true, bestTime: 90 };
    writeSave(storage, save);
    expect(loadSave(storage)).toEqual(save);
  });

  it('migrates the v1 prototype shape', () => {
    const save = migrate({ version: 1, stars: { 'c1-1': 3, 'c1-2': 1, 'c1-3': 0 }, coins: 120, unlocked: ['burner', 'pepper', 'dough', 'gone'], lang: 'zh' });
    expect(save.v).toBe(SAVE_VERSION);
    expect(save.crumbs).toBe(120);
    expect(save.lang).toBe('zh');
    expect(save.owned).toEqual(['burner', 'pepper', 'dough']);
    expect(save.levels['c1-1']).toEqual({ win: true, flawless: true, bonus: true, bestTime: null });
    expect(save.levels['c1-2']).toEqual({ win: true, flawless: false, bonus: false, bestTime: null });
    expect(save.levels['c1-3']).toBeUndefined();
    expect(isUnlocked(save, 'c1-3')).toBe(true);
    expect(isUnlocked(save, 'c1-4')).toBe(false);
  });

  it.each([
    ['null', null], ['a string', 'corrupt'], ['a number', 42], ['an array', [1, 2]], ['an empty object', {}],
    ['wrong field types', { v: 2, lang: 7, crumbs: 'lots', owned: 'burner', loadout: [3, null], upgrades: [], levels: 'x', cookbook: 5, scenes: {}, endless: null, speed: 9 }],
    ['hostile values', { v: 2, crumbs: -50, owned: ['__proto__', 'nope'], levels: { 'c1-1': null, 'c1-2': { win: 'yes' } }, upgrades: { 'pilot-light': 999, nope: 3 }, endless: { bestScore: NaN, bestWave: Infinity } }]
  ])('repairs %s into a playable save', (_name, raw) => {
    const save = migrate(raw);
    expect(save.v).toBe(SAVE_VERSION);
    expect(save.crumbs).toBeGreaterThanOrEqual(0);
    expect(save.owned).toEqual(expect.arrayContaining(['burner', 'pepper']));
    expect(save.loadout.length).toBeGreaterThan(0);
    expect(save.loadout.every(id => save.owned.includes(id))).toBe(true);
    expect(Object.values(save.levels).every(record => record.win === true)).toBe(true);
    expect(save.speed === 1 || save.speed === 2).toBe(true);
    expect(Number.isFinite(save.endless.bestScore) && Number.isFinite(save.endless.bestWave)).toBe(true);
    for (const upgrade of META_UPGRADES) expect(save.upgrades[upgrade.id] ?? 0).toBeLessThanOrEqual(upgrade.costs.length);
    expect(isUnlocked(save, 'c1-1')).toBe(true);
    expect(totalStars(save)).toBeGreaterThanOrEqual(0);
  });

  it('survives storage that throws', () => {
    const broken: GameStorage = { get: () => { throw new Error('denied'); }, set: () => { throw new Error('full'); }, remove: () => undefined };
    expect(loadSave(broken)).toEqual(defaultSave());
    expect(() => writeSave(broken, defaultSave())).not.toThrow();
  });

  it('a first win pays out, unlocks cards and the next level; a replay only pays for new stars', () => {
    const save = defaultSave(), level = LEVELS['c1-1'];
    expect(isUnlocked(save, 'c1-2')).toBe(false);
    const first = applyOutcome(save, level, outcome({ recipes: ['toasted-pepper'] }));
    expect(first).toMatchObject({ firstClear: true, newStars: 2, unlocked: ['dough'], newRecipes: ['toasted-pepper'] });
    expect(first.crumbs).toBe(level.reward + 30);
    expect(save.crumbs).toBe(first.crumbs);
    expect(save.owned).toContain('dough');
    expect(isUnlocked(save, 'c1-2')).toBe(true);
    expect(starsOf(save.levels['c1-1'])).toBe(2);

    const worse = applyOutcome(save, level, outcome({ flawless: false, time: 300 }));
    expect(worse).toMatchObject({ firstClear: false, newStars: 0, unlocked: [], newBest: false });
    expect(starsOf(save.levels['c1-1'])).toBe(2);
    expect(save.levels['c1-1'].bestTime).toBe(120);

    const better = applyOutcome(save, level, outcome({ bonus: true, time: 100 }));
    expect(better).toMatchObject({ newStars: 1, newBest: true });
    expect(starsOf(save.levels['c1-1'])).toBe(3);
  });

  it('a loss changes nothing but the cookbook', () => {
    const save = defaultSave();
    const reward = applyOutcome(save, LEVELS['c1-2'], outcome({ won: false, flawless: false, enemiesSeen: ['ant', 'roach'] }));
    expect(reward.crumbs).toBe(0);
    expect(save.levels['c1-2']).toBeUndefined();
    expect(save.cookbook.enemies).toEqual(['ant', 'roach']);
  });

  it('endless keeps the best score and wave', () => {
    const save = defaultSave();
    expect(applyOutcome(save, ENDLESS_LEVEL, outcome({ won: false, score: 2500, wave: 12 }))).toMatchObject({ newBest: true, crumbs: 25 });
    expect(applyOutcome(save, ENDLESS_LEVEL, outcome({ won: false, score: 900, wave: 14 })).newBest).toBe(false);
    expect(save.endless).toEqual({ bestScore: 2500, bestWave: 14, runs: 2 });
  });

  it('the shop charges crumbs, stops at the max level and needs the defender owned', () => {
    const save = defaultSave(), general = META_UPGRADES.find(upgrade => !upgrade.defender)!, locked = META_UPGRADES.find(upgrade => upgrade.defender && !save.owned.includes(upgrade.defender))!;
    expect(canBuy(save, general)).toBe(false);
    expect(buyUpgrade(save, general)).toBe(false);
    save.crumbs = 100000;
    expect(canBuy(save, locked)).toBe(false);
    for (const cost of general.costs) { const before = save.crumbs; expect(upgradePrice(save, general)).toBe(cost); expect(buyUpgrade(save, general)).toBe(true); expect(save.crumbs).toBe(before - cost); }
    expect(upgradePrice(save, general)).toBeNull();
    expect(buyUpgrade(save, general)).toBe(false);
    expect(save.upgrades[general.id]).toBe(general.costs.length);
  });
});

describe('midnight kitchen save v3', () => {
  it('migrates a v2 save: progress kept, coach and settings get defaults', () => {
    const v2 = { v: 2, lang: 'en', crumbs: 90, owned: ['burner', 'pepper', 'dough'], loadout: ['burner'], upgrades: {}, levels: { 'c1-1': { win: true, flawless: false, bonus: false, bestTime: 80 } }, cookbook: { defenders: [], enemies: ['ant'], recipes: [] }, scenes: ['c1-1-intro'], endless: { bestScore: 10, bestWave: 2 }, speed: 2 };
    const save = migrate(v2);
    expect(save.v).toBe(3);
    expect(save.crumbs).toBe(90);
    expect(save.levels['c1-1'].win).toBe(true);
    expect(save.speed).toBe(2);
    expect(save.endless).toEqual({ bestScore: 10, bestWave: 2, runs: 0 });
    expect(save.coach).toEqual({ seen: [], off: false });
    expect(save.settings).toEqual({ music: 0.7, sfx: 0.8, reducedFx: false, autoAdvance: false });
  });

  it('clamps hostile settings and coach data', () => {
    const save = migrate({ v: 3, settings: { music: 7, sfx: -1, reducedFx: 'yes', autoAdvance: true }, coach: { seen: ['a', 4, 'a'], off: 1 } });
    expect(save.settings).toEqual({ music: 1, sfx: 0, reducedFx: false, autoAdvance: true });
    expect(save.coach).toEqual({ seen: ['a'], off: false });
  });

  it('detects a storage that swallows writes, and reports real writes as saved', () => {
    const silent: GameStorage = { get: <T>(_key: string, fallback: T) => fallback, set: () => undefined, remove: () => undefined };
    expect(writeSave(silent, defaultSave())).toBe(false);
    const storage = memory();
    expect(writeSave(storage, defaultSave())).toBe(true);
  });

  it('reset keeps language and sound, wipes progress', () => {
    const storage = memory(), save = defaultSave();
    save.lang = 'zh'; save.settings.music = 0.2; save.crumbs = 500; save.levels['c1-1'] = { win: true, flawless: true, bonus: true, bestTime: 1 };
    writeSave(storage, save);
    const fresh = resetSave(storage, save);
    expect(fresh.lang).toBe('zh'); expect(fresh.settings.music).toBe(0.2);
    expect(fresh.crumbs).toBe(0); expect(fresh.levels).toEqual({});
    expect(storage.values.has(SAVE_KEY)).toBe(false);
  });

  it('respec refunds every crumb spent', () => {
    const save = defaultSave();
    save.crumbs = 10000; save.owned = [...new Set([...save.owned, ...META_UPGRADES.map(u => u.defender).filter((d): d is string => !!d)])];
    for (const upgrade of META_UPGRADES.slice(0, 3)) buyUpgrade(save, upgrade);
    const spent = 10000 - save.crumbs;
    expect(respecValue(save, META_UPGRADES)).toBe(spent);
    expect(respec(save, META_UPGRADES)).toBe(spent);
    expect(save.crumbs).toBe(10000);
    expect(save.upgrades).toEqual({});
  });

  it('records which stars were already owned, for the results ceremony', () => {
    const save = defaultSave(), level = LEVELS['c1-1'];
    applyOutcome(save, level, outcome({ flawless: false }));
    const again = applyOutcome(save, level, outcome({ flawless: true, bonus: true }));
    expect(again.prior).toEqual([true, false, false]);
    expect(again.newStars).toBe(2);
  });
});

describe('midnight kitchen UI helpers', () => {
  const i18n = createI18n('en');
  it('every interface string exists in both languages and keeps its placeholders', () => {
    for (const key of Object.keys(EN) as (keyof typeof EN)[]) {
      expect(ZH[key], key).toBeTruthy();
      const holes = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort().join();
      expect(holes(ZH[key]), key).toBe(holes(EN[key]));
    }
  });

  it('keys built at run time (defender roles, refusal reasons) exist in both languages, so no raw key reaches the screen', () => {
    const fails = ['unknown-card', 'cooldown', 'heat', 'occupied', 'blocked', 'mold', 'out-of-bounds', 'over', 'wet', 'dark', 'empty', 'max-tier'];
    const keys = [...new Set(Object.values(CONTENT.defenders).map(def => `role.${def.role}`)), ...fails.map(reason => `fail.${reason}`)];
    for (const key of keys) {
      expect((EN as Record<string, string>)[key], key).toBeTruthy();
      expect((ZH as Record<string, string>)[key], key).toBeTruthy();
    }
  });

  it('stacks floating Recipe labels that would overlap, and leaves separate ones alone', () => {
    expect(stackLabel([], 100, 200, 120, 30)).toBe(200);
    expect(stackLabel([{ x: 400, y: 200, w: 120, h: 30 }], 100, 200, 120, 30)).toBe(200);
    const first = { x: 100, y: 200, w: 120, h: 30 };
    const y2 = stackLabel([first], 110, 205, 120, 30);
    expect(y2).toBeLessThanOrEqual(200 - 30 - 4);
    const y3 = stackLabel([first, { x: 110, y: y2, w: 120, h: 30 }], 105, 200, 120, 30);
    expect(y3).toBeLessThanOrEqual(y2 - 30 - 4);
  });

  it('on a boss night the first slice lost with the boss on the counter gets a bark explaining the slower boss (once)', () => {
    for (const lang of ['en', 'zh'] as const) {
      const i18n = createI18n(lang);
      const session = createSession(LEVELS['c1-5'], { random: mulberry32(5), loadout: ['burner', 'pepper'], meta: { upgrades: {} }, onDeny: () => undefined });
      const coach = { seen: () => true, see: () => undefined, off: () => true, skipAll: () => undefined };
      const root = document.createElement('div');
      const hud = createHud(root, { i18n, audio: createAudio(services()), touch: false, coach }, session, { pause: () => undefined, toggleSpeed: () => undefined });
      const bark = hud.element.querySelector<HTMLElement>('.mk-bark')!;
      const slice = { type: 'slice', left: 2, lane: 0, by: 'ant' } as const;
      // A slice lost before the boss arrives: just the banner for now...
      session.sim.stats.slicesLost = 1;
      hud.onEvent(slice);
      hud.tick(0.1);
      expect(bark.hidden).toBe(true);
      // ...and the line comes when she does, after her own entrance bark.
      spawnEnemy(session.sim, LEVELS['c1-5'].boss!, 1);
      hud.onEvent({ type: 'bark', speaker: 'queen', line: { en: 'Children.', zh: '孩子们。' } });
      hud.tick(0.1);
      expect(bark.textContent).not.toContain(i18n.t('bark.mercy'));
      hud.tick(6.5);
      expect(bark.hidden).toBe(false);
      expect(bark.textContent).toContain(i18n.t('bark.mercy'));
      expect(bark.textContent).toContain(lang === 'zh' ? '研磨军士' : 'Sgt. Grind');
      // Only the first time: a later bark from the sim replaces it and the mercy line does not come back.
      hud.onEvent({ type: 'bark', speaker: 'ladle', line: { en: 'Hi', zh: '嗨' } });
      hud.onEvent(slice);
      expect(bark.textContent).not.toContain(i18n.t('bark.mercy'));
    }
  });

  it('arrow navigation goes to the nearest row first (Down from a centred button reaches the pair under it)', () => {
    const box = (left: number, top: number, w = 100, hgt = 48) => ({ left, top, right: left + w, bottom: top + hgt });
    // Pause menu: Resume, Retry (centred), then Settings | Help side by side, then Map (centred).
    const retry = box(100, 60, 200), settings = box(100, 120), help = box(200, 120), map = box(100, 180, 200);
    expect(nearestInDirection(retry, [settings, help, map], 0, 1)).not.toBe(2);
    expect(nearestInDirection(settings, [retry, help, map], 1, 0)).toBe(1);
    expect(nearestInDirection(settings, [retry, help, map], 0, 1)).toBe(2);
    expect(nearestInDirection(map, [retry, settings], 0, 1)).toBe(-1);
    // A grid: Down from the first node lands right under it, not diagonally.
    expect(nearestInDirection(box(0, 0), [box(110, 0), box(0, 60), box(110, 60)], 0, 1)).toBe(1);
  });

  it('describes every defender tier, and the upgrade popover shows what improves', () => {
    for (const def of Object.values(CONTENT.defenders)) {
      for (let tier = 0; tier < def.tiers.length; tier++) expect(tierStats(i18n, def, tier).length, def.id).toBeGreaterThan(0);
      if (def.tiers.length > 1) expect(upgradeDiff(i18n, def, 0).length, def.id).toBeGreaterThan(0);
    }
  });

  it('says what a permanent upgrade does now and next', () => {
    for (const upgrade of META_UPGRADES) {
      expect(metaEffect(i18n, upgrade, 0)).toBe('nothing yet');
      expect(metaEffect(i18n, upgrade, 1)).not.toBe('nothing yet');
    }
  });

  it('builds the chapter map from data: all five kitchens, only the first open on a new save', () => {
    const save = defaultSave();
    const shown = chapterModel(save);
    expect(shown.map(chapter => chapter.id)).toEqual([1, 2, 3, 4, 5]);
    expect(shown.map(chapter => chapter.state)).toEqual(['open', 'locked', 'locked', 'locked', 'locked']);
    expect(shown.every(chapter => chapter.levels.length === 5)).toBe(true);
    // A fake five-chapter campaign: chapter 2 opens once chapter 1's last level is won.
    const levels: Record<string, LevelDef> = {}, chapters: ChapterDef[] = [];
    for (let ch = 1; ch <= 5; ch++) {
      const ids = [1, 2, 3, 4, 5].map(n => `c${ch}-${n}`);
      ids.forEach((id, i) => { levels[id] = { ...LEVELS['c1-2'], id, chapter: ch, index: i + 1, boss: i === 4 ? 'queen' : undefined }; });
      chapters.push({ id: ch, name: { en: `C${ch}`, zh: `C${ch}` }, blurb: { en: '', zh: '' }, levels: ids, backdrop: 'countertop' });
    }
    const model = chapterModel(save, chapters, levels);
    expect(model).toHaveLength(5);
    expect(model.every(chapter => chapter.levels.length === 5)).toBe(true);
  });

  it('reports campaign-wide progress (1..25), not the per-chapter level number', () => {
    expect(campaignNumber('c1-1')).toBe(1);
    expect(campaignNumber('c1-5')).toBe(5);
    expect(campaignNumber('c2-1')).toBe(6);
    expect(campaignNumber('c5-5')).toBe(25);
  });

  it('suggests a hand that starts with Heat and fits the slots', () => {
    const level = LEVELS['c1-4'] ?? LEVEL_LIST[LEVEL_LIST.length - 1];
    const pool = Object.keys(CONTENT.defenders);
    const hand = recommend({ ...level, slots: 5 }, pool);
    expect(hand).toHaveLength(5);
    expect(CONTENT.defenders[hand[0]].role).toBe('generator');
    expect(new Set(hand).size).toBe(5);
  });
});

describe('midnight kitchen session (interaction model)', () => {
  const start = (id = 'c1-2', loadout = ['burner', 'pepper', 'dough']) => {
    const denied: string[] = [];
    const session = createSession(LEVELS[id], { random: mulberry32(3), loadout, meta: { upgrades: {} }, onDeny: reason => denied.push(reason) });
    session.sim.heat = 1000;
    return { session, denied };
  };

  it('select a card, tap a cell: placed and the card is put down', () => {
    const { session } = start();
    session.selectCard('burner');
    expect(session.view.card).toBe('burner');
    session.tapCell(0, 2);
    expect(defenderAt(session.sim, 0, 2)?.def).toBe('burner');
    expect(session.view.card).toBeNull();
  });

  it('selecting the same card again, or an unknown one, deselects', () => {
    const { session } = start();
    session.selectCard('pepper'); session.selectCard('pepper');
    expect(session.view.card).toBeNull();
    session.selectCard('whisk');
    expect(session.view.card).toBeNull();
  });

  it('a refused placement keeps the card in hand and says why', () => {
    const { session, denied } = start();
    session.selectCard('burner'); session.tapCell(0, 2);
    session.sim.cards.forEach(card => { card.cooldown = 0; });
    session.selectCard('pepper'); session.tapCell(0, 2);
    expect(denied).toEqual(['occupied']);
    expect(session.view.card).toBe('pepper');
    session.sim.heat = 0; session.tapCell(1, 2);
    expect(denied).toEqual(['occupied', 'heat']);
  });

  it('tapping a defender opens its popover; upgrade and remove act on it', () => {
    const { session } = start();
    session.selectCard('pepper'); session.tapCell(2, 2);
    const pepper = defenderAt(session.sim, 2, 2)!;
    session.tapCell(2, 2);
    expect(session.view.selected).toBe(pepper.id);
    session.upgradeTarget();
    expect(pepper.tier).toBe(1);
    session.removeTarget();
    expect(defenderAt(session.sim, 2, 2)).toBeUndefined();
    expect(session.view.selected).toBeNull();
  });

  it('spatula mode removes the tapped defender and then switches off', () => {
    const { session, denied } = start();
    session.selectCard('burner'); session.tapCell(0, 2);
    session.toggleSpatula();
    expect(session.view.spatula).toBe(true);
    session.tapCell(4, 4);
    expect(denied).toEqual(['empty']);
    session.tapCell(0, 2);
    expect(defenderAt(session.sim, 0, 2)).toBeUndefined();
    expect(session.view.spatula).toBe(false);
  });

  it('keyboard cursor stays on active lanes and inside the board, and confirm places', () => {
    const { session } = start('c1-1', []);
    session.moveCursor(0, 0);
    expect(session.view.cursor).not.toBeNull();
    for (let i = 0; i < 12; i++) session.moveCursor(-1, -1);
    expect(session.view.cursor).toEqual({ col: 0, lane: 1 });
    for (let i = 0; i < 12; i++) session.moveCursor(1, 1);
    expect(session.view.cursor).toEqual({ col: LEVELS['c1-1'].cols - 1, lane: 3 });
    session.selectCard('pepper'); session.confirm();
    expect(defenderAt(session.sim, LEVELS['c1-1'].cols - 1, 3)?.def).toBe('pepper');
  });

  it('cancel unwinds one layer of state and reports when there was nothing to cancel', () => {
    const { session } = start();
    expect(session.cancel()).toBe(false);
    session.selectCard('pepper');
    expect(session.cancel()).toBe(true);
    expect(session.view.card).toBeNull();
    session.toggleSpatula();
    expect(session.cancel()).toBe(true);
    expect(session.cancel()).toBe(false);
  });

  it('advance runs the sim at the chosen speed and returns its events', () => {
    const { session } = start();
    session.advance(0.1);
    const slow = session.sim.time;
    session.speed = 2; session.advance(0.1);
    expect(session.sim.time - slow).toBeCloseTo(slow * 2, 1);
    session.selectCard('burner'); session.tapCell(0, 2);
    expect(session.advance(0.02).some(event => event.type === 'place')).toBe(true);
  });

  it('a long frame cannot fast-forward the night', () => {
    const { session } = start();
    session.advance(30);
    expect(session.sim.time).toBeLessThan(0.3);
  });

  it('the tutorial walks its steps as the player does what it asks', () => {
    const { session } = start('c1-1', []);
    const steps = LEVELS['c1-1'].tutorial!;
    expect(session.tutorial).toBe(steps[0]);
    expect(session.view.focusDefender ?? session.view.focusCell ?? session.tutorial?.focus).toBeTruthy();
    session.selectCard('burner'); session.tapCell(0, 2); session.advance(0.02);
    expect(session.tutorial).toBe(steps[1]);
    session.sim.cards.forEach(card => { card.cooldown = 0; });
    session.selectCard('pepper'); session.tapCell(2, 2); session.advance(0.02);
    expect(session.tutorial).toBe(steps[2]);
  });

  it('Q / E cycle through the hand and wrap around', () => {
    const { session } = start('c1-2', ['burner', 'pepper', 'dough']);
    session.cycleCard(1);
    expect(session.view.card).toBe('burner');
    session.cycleCard(1); session.cycleCard(1);
    expect(session.view.card).toBe('dough');
    session.cycleCard(1);
    expect(session.view.card).toBe('burner');
    session.cycleCard(-1);
    expect(session.view.card).toBe('dough');
  });

  it('the placement preview says why a cell is refused and which Recipe it would cook', () => {
    const { session } = start('c1-2', ['burner', 'pepper', 'dough']);
    session.selectCard('burner'); session.tapCell(0, 2);
    session.sim.cards.forEach(card => { card.cooldown = 0; });
    session.selectCard('pepper');
    session.setHover({ col: 0, lane: 2 });
    expect(session.view.preview).toMatchObject({ ok: false, reason: 'occupied' });
    session.setHover({ col: 1, lane: 2 });
    expect(session.view.preview?.ok).toBe(true);
    expect(session.view.preview?.recipes.map(r => r.recipe)).toContain('toasted-pepper');
    session.cancel();
    expect(session.view.preview).toBeNull();
  });

  it('the Recipe preview agrees with the sim for every recipe (pairs, chains and L shapes)', () => {
    for (const recipe of RECIPES) {
      for (const shape of recipe.parts.length === 3 ? ['chain', 'L'] : ['pair']) {
        const level = { ...LEVELS['c1-2'], cards: undefined };
        const sim = createSim(level, { random: mulberry32(1), loadout: [...new Set(recipe.parts)], meta: { upgrades: {} } });
        sim.heat = 99999;
        const cells: [number, number][] = shape === 'pair' ? [[2, 2], [3, 2]] : shape === 'chain' ? [[2, 2], [3, 2], [4, 2]] : [[3, 1], [3, 2], [4, 2]];
        // The middle of a chain / the corner of an L is the second part.
        const order = recipe.parts.length === 3 ? [recipe.parts[1], recipe.parts[0], recipe.parts[2]] : recipe.parts;
        const pieces = shape === 'pair' ? recipe.parts : [order[1], order[0], order[2]];
        pieces.slice(0, -1).forEach((def, i) => { sim.cards.forEach(card => { card.cooldown = 0; }); expect(place(sim, def, cells[i][0], cells[i][1]).ok, `${recipe.id} ${def}`).toBe(true); });
        const last = pieces[pieces.length - 1], at = cells[cells.length - 1];
        const predicted = recipesIfPlaced(sim, last, at[0], at[1]).map(item => item.recipe.id);
        sim.cards.forEach(card => { card.cooldown = 0; });
        expect(place(sim, last, at[0], at[1]).ok).toBe(true);
        const actual = sim.links.map(link => link.recipe);
        expect(predicted.includes(recipe.id), `${recipe.id} ${shape}`).toBe(actual.includes(recipe.id));
        expect(actual.includes(recipe.id), `${recipe.id} ${shape} forms`).toBe(true);
      }
    }
  });

  it('a level lesson resumes from the first step not yet done and reports progress', () => {
    const done: number[] = [];
    const session = createSession(LEVELS['c1-1'], { random: mulberry32(3), loadout: [], meta: { upgrades: {} }, tutorialFrom: 1, onTutorial: index => done.push(index) });
    expect(session.tutorial).toBe(LEVELS['c1-1'].tutorial![1]);
    session.sim.heat = 1000;
    session.selectCard('pepper'); session.tapCell(2, 2); session.advance(0.02);
    expect(done).toEqual([2]);
    session.skipTutorial();
    expect(session.tutorial).toBeNull();
  });

  it('closes the popover when its defender is eaten', () => {
    const { session } = start();
    session.selectCard('burner'); session.tapCell(4, 2); session.tapCell(4, 2);
    expect(session.view.selected).not.toBeNull();
    spawnEnemy(session.sim, 'slug', 2, 5.1);
    for (let i = 0; i < 60 * 12; i++) session.advance(1 / 60);
    expect(defenderAt(session.sim, 4, 2)).toBeUndefined();
    expect(session.view.selected).toBeNull();
  });
});

describe('midnight kitchen audio facade', () => {
  it('plays shared cues, rate-limits repeats, and is silent when muted, paused or disposed', () => {
    const live = services();
    const audio = createAudio(live);
    audio.sfx('place'); audio.sfx('place'); audio.sfx('place');
    expect(live.sound.play).toHaveBeenCalledTimes(1);
    audio.handle({ type: 'win' });
    expect(live.sound.play).toHaveBeenLastCalledWith('success');
    audio.pause();
    expect(live.sound.stop).toHaveBeenCalled();
    audio.sfx('upgrade');
    expect(live.sound.play).toHaveBeenCalledTimes(2);
    audio.resume(); audio.sfx('upgrade');
    expect(live.sound.play).toHaveBeenCalledTimes(3);
    audio.music('boss');
    expect(audio.scene).toBe('boss');
    audio.dispose(); audio.sfx('lose');
    expect(live.sound.play).toHaveBeenCalledTimes(3);

    const quiet = services(memory(), true);
    const muted = createAudio(quiet);
    muted.sfx('place'); muted.handle({ type: 'lose' });
    expect(quiet.sound.play).not.toHaveBeenCalled();
  });
});

describe('midnight kitchen module lifecycle', () => {
  const raf = globalThis.requestAnimationFrame, caf = globalThis.cancelAnimationFrame;
  afterEach(() => { globalThis.requestAnimationFrame = raf; globalThis.cancelAnimationFrame = caf; document.body.innerHTML = ''; });

  /** A hand-cranked animation clock, so frames only run when the test says so. */
  function mount(env: GameServices = services()) {
    let pending: FrameRequestCallback | null = null, now = 0, cancelled = 0;
    globalThis.requestAnimationFrame = (callback => { pending = callback; return 1; }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => { pending = null; cancelled++; }) as typeof cancelAnimationFrame;
    const host = document.createElement('div');
    document.body.append(host);
    const controller = midnightKitchen.mount(host, env);
    const root = host.querySelector<HTMLElement>('[data-midnight-kitchen]')!;
    const frames = (count: number, ms = 16) => { for (let i = 0; i < count; i++) { const callback = pending; if (!callback) return false; pending = null; now += ms; callback(now); } return true; };
    const click = (selector: string) => { const button = root.querySelector<HTMLButtonElement>(selector); expect(button, selector).not.toBeNull(); button!.click(); };
    const debug = () => (root as unknown as { __mk: { session: ReturnType<typeof createSession> | null; save: ReturnType<typeof defaultSave>; menuMuted: boolean } }).__mk;
    return { host, root, controller, env, frames, click, debug, hasFrame: () => pending !== null, cancelled: () => cancelled };
  }
  /** A fresh save: Play goes through the first story scene straight onto the counter (no picker for the lesson). */
  const intoLevel = (game: ReturnType<typeof mount>) => {
    game.click('[data-action=play]');
    if (game.root.dataset.state === 'dialogue') game.click('[data-action=skip]');
    expect(game.root.dataset.state).toBe('level');
  };

  it('first run: Play, the story, and straight into the first level; the map shows the rest locked', () => {
    const game = mount();
    expect(game.root.dataset.state).toBe('title');
    expect(game.frames(3)).toBe(true);
    game.click('[data-action=chapters]');
    expect(game.root.dataset.state).toBe('map');
    expect(game.root.querySelector<HTMLButtonElement>('[data-level=c1-2]')!.disabled).toBe(true);
    expect(game.root.querySelectorAll('[data-chapter]').length).toBeGreaterThanOrEqual(5);
    game.click('[data-action=back]');
    game.click('[data-action=play]');
    expect(game.root.dataset.state).toBe('dialogue');
    game.frames(5);
    game.click('[data-action=skip]');
    expect(game.root.dataset.state).toBe('level');
    expect(game.root.querySelectorAll('.mk-hand [data-card]')).toHaveLength(2);
    // The lesson's first coach mark points at the Burner card.
    game.frames(2);
    expect(game.root.querySelector('[data-coach]:not([hidden])')).not.toBeNull();
    const session = game.debug().session!;
    session.selectCard('burner'); session.tapCell(0, 2);
    game.frames(120);
    expect(session.sim.time).toBeGreaterThan(1.5);
    expect(session.sim.defenders).toHaveLength(1);
  });

  it('external pause stops the loop and the clock; resume restarts it', () => {
    const game = mount();
    intoLevel(game);
    game.frames(30);
    const session = game.debug().session!, time = session.sim.time;
    game.controller.pause();
    expect(game.hasFrame()).toBe(false);
    expect(game.frames(30)).toBe(false);
    expect(session.sim.time).toBe(time);
    game.controller.pause();
    game.controller.resume(); game.controller.resume();
    expect(game.hasFrame()).toBe(true);
    game.frames(30);
    expect(session.sim.time).toBeGreaterThan(time);
  });

  it('the in-game pause screen freezes the night and Resume returns to it', () => {
    const game = mount();
    intoLevel(game);
    game.frames(20);
    const session = game.debug().session!;
    game.click('[data-action=pause-game]');
    expect(game.root.dataset.state).toBe('pause');
    const time = session.sim.time;
    game.frames(30);
    expect(session.sim.time).toBe(time);
    game.click('[data-action=resume]');
    expect(game.root.dataset.state).toBe('level');
    expect(game.debug().session).toBe(session);
  });

  it('restart inside a level starts that level again; on a menu it returns to the title', () => {
    const game = mount();
    game.click('[data-action=chapters]');
    game.controller.restart();
    expect(game.root.dataset.state).toBe('title');
    intoLevel(game);
    game.frames(60);
    const first = game.debug().session!;
    game.controller.restart();
    expect(game.root.dataset.state).toBe('level');
    expect(game.debug().session).not.toBe(first);
    expect(game.debug().session!.sim.time).toBe(0);
    expect(game.root.querySelectorAll('.mk-hand')).toHaveLength(1);
  });

  it('losing shows results, saves nothing as won, and Retry starts over', () => {
    const storage = memory();
    const game = mount(services(storage));
    intoLevel(game);
    const session = game.debug().session!;
    session.sim.slices = 0;
    game.frames(140);
    expect(game.root.dataset.state).toBe('results');
    expect(loadSave(storage).levels['c1-1']).toBeUndefined();
    expect(game.env.reportComplete).not.toHaveBeenCalled();
    game.click('[data-action=retry]');
    expect(game.root.dataset.state).toBe('level');
    expect(game.debug().session!.sim.slices).toBeGreaterThan(0);
  });

  it('winning saves stars, reports completion and offers the next level', () => {
    const storage = memory();
    const game = mount(services(storage));
    intoLevel(game);
    const sim = game.debug().session!.sim;
    sim.heat = 500; sim.wave = sim.totalWaves - 1; sim.nextWave = null; sim.pending = [];
    game.frames(160);
    expect(game.root.dataset.state).toBe('results');
    const saved = loadSave(storage);
    expect(saved.levels['c1-1']).toMatchObject({ win: true, flawless: true, bonus: true });
    expect(saved.owned).toContain('dough');
    expect(saved.crumbs).toBeGreaterThan(0);
    expect(game.env.reportComplete).toHaveBeenCalledWith(1);
    expect(game.root.querySelector('[data-action=next]')).not.toBeNull();
    game.click('[data-action=map]');
    if (game.root.dataset.state === 'dialogue') game.click('[data-action=skip]');
    expect(game.root.dataset.state).toBe('map');
    expect(game.root.querySelector<HTMLButtonElement>('[data-level=c1-2]')!.disabled).toBe(false);
    // A won fixed-hand level now opens its briefing instead of jumping in.
    game.click('[data-level=c1-1]');
    expect(game.root.dataset.state).toBe('loadout');
  });

  it('the finale reports level 25, says the campaign is done and opens Endless Night from the results', () => {
    const save = defaultSave();
    for (const level of LEVEL_LIST) if (level.id !== 'c5-5') save.levels[level.id] = { win: true, flawless: false, bonus: false, bestTime: 300 };
    save.owned = Object.keys(CONTENT.defenders); save.scenes = LEVEL_LIST.flatMap(level => [level.intro, level.outro].filter((id): id is string => !!id));
    const game = mount(services(memory({ [SAVE_KEY]: save })));
    game.click('[data-action=chapters]');
    game.click('[data-chapter="5"]');
    game.click('[data-level=c5-5]');
    if (game.root.dataset.state === 'dialogue') game.click('[data-action=skip]');
    game.click('[data-action=start]');
    if (game.root.dataset.state === 'dialogue') game.click('[data-action=skip]');
    expect(game.root.dataset.state).toBe('level');
    game.debug().session!.sim.status = 'won';
    game.frames(200);
    expect(game.root.dataset.state).toBe('results');
    expect(game.env.reportComplete).toHaveBeenCalledWith(25);
    expect(game.root.querySelector('.mk-finale')).not.toBeNull();
    expect(game.root.querySelector('[data-action=next]')).toBeNull();
    game.click('[data-action=endless]');
    if (game.root.dataset.state === 'dialogue') game.click('[data-action=skip]');
    expect(game.root.dataset.state).toBe('loadout');
    expect(game.root.querySelector('[data-endless]') ?? game.root.querySelector('[data-screen=loadout]')).not.toBeNull();
  });

  it('a win is saved the moment it happens, even if the player restarts during the ending', () => {
    const storage = memory();
    const game = mount(services(storage));
    intoLevel(game);
    const sim = game.debug().session!.sim;
    sim.wave = sim.totalWaves - 1; sim.nextWave = null; sim.pending = [];
    game.frames(5);
    expect(sim.status).toBe('won');
    game.controller.restart();
    expect(loadSave(storage).levels['c1-1']?.win).toBe(true);
    expect(game.root.dataset.state).toBe('level');
  });

  it('pause opens settings and help inside the pause screen without ending the night', () => {
    const game = mount();
    intoLevel(game);
    const session = game.debug().session!;
    game.click('[data-action=pause-game]');
    game.click('[data-action=pause-settings]');
    expect(game.root.querySelector('[data-screen=pause][data-panel=settings]')).not.toBeNull();
    expect(game.debug().session).toBe(session);
    game.click('[data-lang=zh]');
    expect(game.debug().session).toBe(session);
    game.click('[data-action=back]');
    game.click('[data-action=pause-help]');
    game.click('[data-action=back]');
    game.click('[data-action=resume]');
    expect(game.root.dataset.state).toBe('level');
    expect(game.debug().session).toBe(session);
    // The rebuilt HUD speaks Chinese now.
    expect(/[一-鿿]/.test(game.root.querySelector('[data-action=pause-game]')!.getAttribute('aria-label')!)).toBe(true);
  });

  it('gamepad-style synthetic keys drive the menus: arrows move focus, Space presses once, Escape goes back', () => {
    const game = mount();
    const canvas = game.root.querySelector('canvas')!;
    expect(canvas.classList.contains('mk-canvas')).toBe(true);
    const key = (k: string) => canvas.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    game.click('[data-action=settings]');
    expect(game.root.dataset.state).toBe('settings');
    const auto = game.root.querySelector<HTMLElement>('[data-action=auto-advance]')!;
    expect(auto.getAttribute('aria-checked')).toBe('false');
    auto.focus();
    key(' ');
    canvas.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }));
    expect(auto.getAttribute('aria-checked')).toBe('true');
    expect(game.debug().save.settings.autoAdvance).toBe(true);
    const music = game.root.querySelector<HTMLInputElement>('input[data-action=music]')!;
    music.focus(); const before = Number(music.value);
    key('ArrowLeft');
    expect(Number(music.value)).toBeLessThan(before);
    expect(game.debug().save.settings.music).toBeCloseTo(Number(music.value) / 100);
    key('ArrowDown');
    expect(document.activeElement).not.toBe(music);
    key('Escape');
    expect(game.root.dataset.state).toBe('title');
  });

  it('the in-game pause menu silences the audio, and the arcade resume does not bring it back while the menu is up', () => {
    const game = mount();
    intoLevel(game);
    const stop = game.env.sound.stop as ReturnType<typeof vi.fn>;
    stop.mockClear();
    game.click('[data-action=pause-game]');
    expect(game.root.dataset.state).toBe('pause');
    expect(game.debug().menuMuted).toBe(true);
    expect(stop).toHaveBeenCalled();
    game.controller.pause(); game.controller.resume();
    expect(game.debug().menuMuted).toBe(true);
    game.click('[data-action=pause-settings]');
    expect(game.debug().menuMuted).toBe(true);
    game.click('[data-action=back]');
    game.click('[data-action=resume]');
    expect(game.root.dataset.state).toBe('level');
    expect(game.debug().menuMuted).toBe(false);
    game.click('[data-action=pause-game]');
    game.click('[data-action=map]');
    expect(game.debug().menuMuted).toBe(false);
  });

  it('keeps playing from memory with a notice when storage silently refuses writes', () => {
    const storage: GameStorage = { get: <T>(_key: string, fallback: T) => fallback, set: () => undefined, remove: () => undefined };
    const game = mount(services(storage));
    intoLevel(game);
    expect(game.root.querySelector('.mk-notice:not([hidden])')).not.toBeNull();
    game.frames(30);
    expect(game.debug().session!.sim.time).toBeGreaterThan(0.2);
  });

  it('loads an existing save, and switching language rewrites the screen and persists', () => {
    const save = defaultSave();
    save.levels['c1-1'] = { win: true, flawless: true, bonus: true, bestTime: 100 }; save.lang = 'en';
    const storage = memory({ [SAVE_KEY]: save });
    const game = mount(services(storage));
    const english = game.root.querySelector('[data-action=play]')!.textContent;
    game.click('[data-lang=zh]');
    const chinese = game.root.querySelector('[data-action=play]')!.textContent;
    expect(chinese).not.toBe(english);
    expect(/[一-鿿]/.test(chinese!)).toBe(true);
    expect(loadSave(storage).lang).toBe('zh');
    game.click('[data-action=chapters]');
    expect(game.root.querySelector<HTMLButtonElement>('[data-level=c1-2]')!.disabled).toBe(false);
  });

  it('upgrades bought in the shop change the next night (start Heat, extra slice, Defender health)', () => {
    const night = (upgrades: Record<string, number>) => {
      const save = defaultSave();
      save.levels['c1-1'] = { win: true, flawless: true, bonus: true, bestTime: 100 } as typeof save.levels[string];
      save.coach.off = true; save.scenes = ['c1-1-intro', 'c1-1-outro', 'c1-2-intro'];
      save.upgrades = upgrades;
      const game = mount(services(memory({ [SAVE_KEY]: save })));
      game.click('[data-action=play]');
      if (game.root.dataset.state === 'dialogue') game.click('[data-action=skip]');
      if (game.root.dataset.state !== 'level') game.click('[data-action=start]');
      expect(game.root.dataset.state).toBe('level');
      const sim = game.debug().session!.sim;
      const out = { heat: sim.heat, slices: sim.slices, hp: 0 };
      sim.heat = 1000;
      game.debug().session!.selectCard('burner');
      game.debug().session!.tapCell(0, 2);
      out.hp = defenderAt(sim, 0, 2)!.maxHp;
      game.controller.destroy();
      return out;
    };
    const plain = night({}), upgraded = night({ 'pilot-light': 2, 'thick-frosting': 1, 'cast-iron': 1 });
    expect(upgraded.heat - plain.heat).toBe(50);
    expect(upgraded.slices - plain.slices).toBe(1);
    expect(upgraded.hp).toBeCloseTo(plain.hp * 1.06, 0);
  });

  it('boots from a corrupt save', () => {
    const game = mount(services(memory({ [SAVE_KEY]: '{not json' })));
    expect(game.root.dataset.state).toBe('title');
    game.frames(2);
  });

  it('stays silent when the arcade is muted', () => {
    const env = services(memory(), true);
    const game = mount(env);
    intoLevel(game);
    const session = game.debug().session!;
    session.selectCard('burner'); session.tapCell(0, 2);
    game.frames(60);
    expect(env.sound.play).not.toHaveBeenCalled();
  });

  it('destroy clears the host, cancels the loop and detaches every listener', () => {
    const added: string[] = [], removed: string[] = [];
    const targets = [window, document] as EventTarget[];
    const spies = targets.flatMap(target => [
      vi.spyOn(target, 'addEventListener').mockImplementation(function (this: EventTarget, type: string) { added.push(type); }),
      vi.spyOn(target, 'removeEventListener').mockImplementation(function (this: EventTarget, type: string) { removed.push(type); })
    ]);
    try {
      const game = mount();
      intoLevel(game);
      game.frames(10);
      game.controller.destroy();
      expect(game.host.childElementCount).toBe(0);
      expect(game.hasFrame()).toBe(false);
      expect(game.frames(5)).toBe(false);
      expect(added.length).toBeGreaterThan(0);
      expect([...removed].sort()).toEqual([...added].sort());
      expect(() => { game.controller.pause(); game.controller.resume(); game.controller.restart(); game.controller.destroy(); }).not.toThrow();
      expect(game.hasFrame()).toBe(false);
    } finally { for (const spy of spies) spy.mockRestore(); }
  });

  it('five mount / play / destroy cycles leave no window or document listener behind', () => {
    const live = new Map<string, number>();
    const targets = [window, document] as EventTarget[];
    const spies = targets.flatMap(target => [
      vi.spyOn(target, 'addEventListener').mockImplementation(function (this: EventTarget, type: string) { live.set(type, (live.get(type) ?? 0) + 1); }),
      vi.spyOn(target, 'removeEventListener').mockImplementation(function (this: EventTarget, type: string) { live.set(type, (live.get(type) ?? 0) - 1); })
    ]);
    try {
      for (let i = 0; i < 5; i++) {
        const game = mount();
        intoLevel(game);
        game.frames(5);
        game.click('[data-action=pause-game]');
        game.controller.pause();
        game.controller.destroy();
      }
      expect([...live].filter(([, n]) => n !== 0)).toEqual([]);
    } finally { for (const spy of spies) spy.mockRestore(); }
  });

  it("the arcade's Restart while its pause overlay is up also resumes the loop (the shell never calls resume)", () => {
    const game = mount();
    intoLevel(game);
    game.frames(30);
    game.controller.pause();
    expect(game.hasFrame()).toBe(false);
    game.controller.restart();
    expect(game.hasFrame()).toBe(true);
    const session = game.debug().session!;
    game.frames(30);
    expect(session.sim.time).toBeGreaterThan(0);
    // ...and with the in-game pause menu open underneath, the restart closes it and the sound comes back.
    game.click('[data-action=pause-game]');
    expect(game.debug().menuMuted).toBe(true);
    game.controller.pause();
    game.controller.restart();
    expect(game.root.dataset.state).toBe('level');
    expect(game.debug().menuMuted).toBe(false);
    expect(game.hasFrame()).toBe(true);
  });

  it('a drawing error does not freeze the night', () => {
    const game = mount();
    intoLevel(game);
    const renderer = (game.root as unknown as { __mk: { renderer: { draw: () => void } } }).__mk.renderer;
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      renderer.draw = () => { throw new Error('boom'); };
      const session = game.debug().session!, time = session.sim.time;
      expect(game.frames(30)).toBe(true);
      expect(session.sim.time).toBeGreaterThan(time);
      expect(error).toHaveBeenCalledTimes(1);
    } finally { error.mockRestore(); }
  });

  it('a settings switch flips from anywhere on its row (bigger touch target)', () => {
    const game = mount();
    game.click('[data-action=settings]');
    const row = game.root.querySelector<HTMLElement>('[data-action=auto-advance]')!.closest<HTMLElement>('.mk-setting')!;
    expect(game.debug().save.settings.autoAdvance).toBe(false);
    row.querySelector<HTMLElement>('b')!.click();
    expect(game.debug().save.settings.autoAdvance).toBe(true);
    game.root.querySelector<HTMLElement>('[data-action=auto-advance]')!.click();
    expect(game.debug().save.settings.autoAdvance).toBe(false);
  });
});
