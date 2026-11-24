/**
 * Chef's Challenge: a won campaign night replays with a restricted kit (smaller hand and / or no upgrades) for a
 * fourth star. Rules, save effects, the menus, and a bot-measured sample proving the challenges are winnable
 * (the full table is `npx vite-node scripts/midnight-kitchen-challenges.ts`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameServices, GameStorage } from '../src/core/game-types';
import midnightKitchen from '../src/games/midnight-kitchen';
import { BOT_PROFILES, botLoadout, measureLevel } from '../src/games/midnight-kitchen/bot';
import { CHALLENGES, challengeLevel, challengeOf, CONTENT, CRUMBS_CHALLENGE, LEVEL_LIST, LEVELS, nextLevelId, ownedAt } from '../src/games/midnight-kitchen/data';
import { EN, ZH } from '../src/games/midnight-kitchen/i18n';
import { allStars, applyChallenge, challengeOpen, defaultSave, loadSave, SAVE_KEY } from '../src/games/midnight-kitchen/save';
import { createSim, mulberry32, place, upgrade } from '../src/games/midnight-kitchen/sim';

const memory = (initial: Record<string, unknown> = {}): GameStorage & { values: Map<string, unknown> } => {
  const values = new Map<string, unknown>(Object.entries(initial));
  return { values, get: <T>(key: string, fallback: T) => (values.has(key) ? values.get(key) as T : fallback), set: (key, value) => { values.set(key, JSON.parse(JSON.stringify(value))); }, remove: key => { values.delete(key); } };
};
const services = (storage: GameStorage = memory()): GameServices => ({
  storage, sound: { muted: true, setMuted: vi.fn(), stop: vi.fn(), play: vi.fn() }, random: mulberry32(5), reportScore: vi.fn(), reportComplete: vi.fn(), isReducedMotion: true
});
/** Everything a player owns when replaying a won night. */
const ownedAfter = (id: string) => [...new Set([...ownedAt(nextLevelId(id) ?? id), ...(LEVELS[id].unlocks ?? [])])];
// Bot play is synchronous; hand the event loop a turn between tests (see midnight-kitchen-content.test.ts).
afterEach(() => new Promise<void>(resolve => { setImmediate(resolve); }));

describe("Chef's Challenge rules", () => {
  it('every campaign night has one, and it really restricts the kit', () => {
    expect(Object.keys(CHALLENGES).sort()).toEqual(LEVEL_LIST.map(level => level.id).sort());
    for (const night of LEVEL_LIST) {
      const rule = challengeOf(night.id)!, level = challengeLevel(night)!;
      expect(rule.slots !== undefined || rule.noUpgrades, night.id).toBeTruthy();
      expect(level.id).toBe(night.id);
      expect(level.waves).toBe(night.waves);
      expect(level.tutorial).toBeUndefined();
      if (rule.slots && !night.cards) expect(level.slots, night.id).toBeLessThan(night.slots);
      const sim = createSim(level, { random: mulberry32(1), loadout: Object.keys(CONTENT.defenders) });
      expect(sim.cards.length, night.id).toBeLessThanOrEqual(night.cards?.length ?? level.slots);
    }
    expect(challengeOf('endless')).toBeUndefined();
    expect(challengeOf('ah-1')).toBeUndefined();
  });

  it('a no-upgrades night refuses upgrades with its own reason and shows no upgrade price', () => {
    const level = challengeLevel(LEVELS['c2-1'])!;
    const sim = createSim(level, { random: mulberry32(1), loadout: ['burner', 'pepper', 'egg'] });
    sim.heat = 999;
    expect(place(sim, 'pepper', 2, 2).ok).toBe(true);
    expect(upgrade(sim, 2, 2)).toEqual({ ok: false, reason: 'challenge' });
    expect(EN['fail.challenge']).toBeTruthy();
    expect(ZH['fail.challenge']).toBeTruthy();
  });
});

describe("Chef's Challenge save", () => {
  it('a win adds only the fourth star and its crumbs; the night record, losses and Chef wins stay put', () => {
    const save = defaultSave();
    save.levels['c1-3'] = { win: true, flawless: false, bonus: false, bestTime: 200 };
    save.losses['c1-3'] = 1;
    expect(challengeOpen(save, 'c1-3')).toBe(true);
    expect(challengeOpen(save, 'c1-4')).toBe(false);
    const before = JSON.stringify({ levels: save.levels, losses: save.losses, chefWins: save.chefWins, owned: save.owned, loadout: save.loadout });
    const stars = allStars(save);
    const lost = applyChallenge(save, LEVELS['c1-3'], { won: false, recipes: [], enemiesSeen: [], defendersUsed: [] });
    expect(lost.crumbs).toBe(0);
    expect(save.challenges).toEqual([]);
    const won = applyChallenge(save, LEVELS['c1-3'], { won: true, recipes: [], enemiesSeen: ['ant'], defendersUsed: ['burner'] });
    expect(won).toMatchObject({ crumbs: CRUMBS_CHALLENGE, newStars: 1, firstClear: true });
    expect(save.challenges).toEqual(['c1-3']);
    expect(allStars(save)).toBe(stars + 1);
    expect(JSON.stringify({ levels: save.levels, losses: save.losses, chefWins: save.chefWins, owned: save.owned, loadout: save.loadout })).toBe(before);
    const again = applyChallenge(save, LEVELS['c1-3'], { won: true, recipes: [], enemiesSeen: [], defendersUsed: [] });
    expect(again.crumbs).toBe(0);
    expect(save.challenges).toEqual(['c1-3']);
  });
});

describe("Chef's Challenge in the menus", () => {
  const raf = globalThis.requestAnimationFrame, caf = globalThis.cancelAnimationFrame;
  afterEach(() => { globalThis.requestAnimationFrame = raf; globalThis.cancelAnimationFrame = caf; document.body.innerHTML = ''; });
  function mount(storage: GameStorage) {
    let pending: FrameRequestCallback | null = null, now = 0;
    globalThis.requestAnimationFrame = (callback => { pending = callback; return 1; }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => { pending = null; }) as typeof cancelAnimationFrame;
    const host = document.createElement('div'); document.body.append(host);
    const env = services(storage), controller = midnightKitchen.mount(host, env);
    const root = host.querySelector<HTMLElement>('[data-midnight-kitchen]')!;
    const frames = (count: number) => { for (let i = 0; i < count; i++) { const callback = pending; if (!callback) return; pending = null; now += 16; callback(now); } };
    const click = (selector: string) => { const button = root.querySelector<HTMLButtonElement>(selector); expect(button, selector).not.toBeNull(); button!.click(); };
    const debug = () => (root as unknown as { __mk: { session: { sim: { status: string; cards: unknown[]; difficulty: string; rules: { noUpgrades?: boolean } } } | null } }).__mk;
    return { root, env, controller, frames, click, debug };
  }

  it('a won night offers its challenge; playing it uses the small hand, keeps the normal loadout, and a win lights the fourth star', () => {
    const save = defaultSave();
    save.levels['c1-2'] = { win: true, flawless: true, bonus: false, bestTime: 180 };
    save.levels['c1-3'] = { win: true, flawless: false, bonus: true, bestTime: 240 };
    save.owned = ownedAfter('c1-3'); save.loadout = ['burner', 'pepper', 'dough', 'egg', 'ice'];
    save.difficulty = 'chef';
    save.scenes = LEVEL_LIST.flatMap(level => [level.intro, level.outro].filter((id): id is string => !!id));
    const storage = memory({ [SAVE_KEY]: save });
    const game = mount(storage);
    game.click('[data-action=chapters]');
    game.click('[data-level=c1-3]');
    expect(game.root.dataset.state).toBe('loadout');
    game.click('[data-action=challenge]');
    const panel = game.root.querySelector('[data-challenge="c1-3"]')!;
    expect(panel.textContent).toContain('3');
    expect(game.root.querySelectorAll('.mk-pick[aria-pressed=true]')).toHaveLength(3);
    // The suggested hand is the one the bot proof below is measured with.
    expect([...game.root.querySelectorAll<HTMLElement>('.mk-pick[aria-pressed=true]')].map(button => button.dataset.card).sort()).toEqual(botLoadout(challengeLevel(LEVELS['c1-3'])!, save.owned).sort());
    // Choosing a fourth card is refused: the hand is full.
    game.root.querySelector<HTMLButtonElement>('.mk-pick[aria-pressed=false]')!.click();
    expect(game.root.querySelectorAll('.mk-pick[aria-pressed=true]')).toHaveLength(3);
    game.click('[data-action=start]');
    expect(game.root.dataset.state).toBe('level');
    const sim = game.debug().session!.sim;
    expect(sim.cards).toHaveLength(3);
    expect(sim.rules.noUpgrades).toBe(true);
    expect(sim.difficulty).toBe('standard'); // Always Standard, whatever the briefing was set to.
    expect(loadSave(storage).loadout).toEqual(save.loadout);
    sim.status = 'won';
    game.frames(200);
    expect(game.root.dataset.state).toBe('results');
    expect(game.root.querySelector('[data-challenge-star=won]')).not.toBeNull();
    const after = loadSave(storage);
    expect(after.challenges).toEqual(['c1-3']);
    expect(after.levels['c1-3']).toEqual(save.levels['c1-3']);
    expect(after.crumbs).toBe(save.crumbs + CRUMBS_CHALLENGE);
    expect(game.env.reportComplete).not.toHaveBeenCalled();
    expect(game.root.querySelector('[data-action=next]')).toBeNull();
    // Replay stays in the challenge.
    game.click('[data-action=retry]');
    expect(game.debug().session!.sim.cards).toHaveLength(3);
    expect(game.debug().session!.sim.rules.noUpgrades).toBe(true);
    game.controller.destroy();
    // The map marks the fourth star.
    const back = mount(storage);
    back.click('[data-action=chapters]');
    expect(back.root.querySelector('[data-level=c1-3] [data-chef-star]')).not.toBeNull();
    expect(back.root.querySelector('[data-level=c1-2] [data-chef-star]')).toBeNull();
  });

  it('a normal win offers the challenge on the results screen; a locked night has none', () => {
    const save = defaultSave();
    save.levels['c1-2'] = { win: true, flawless: false, bonus: false, bestTime: 180 };
    save.owned = ownedAfter('c1-2');
    save.scenes = LEVEL_LIST.flatMap(level => [level.intro, level.outro].filter((id): id is string => !!id));
    const game = mount(memory({ [SAVE_KEY]: save }));
    game.click('[data-action=chapters]');
    game.click('[data-level=c1-3]');
    expect(game.root.querySelector('[data-action=challenge]')).toBeNull(); // Not won yet: no challenge.
    game.click('[data-action=start]');
    game.debug().session!.sim.status = 'won';
    game.frames(200);
    expect(game.root.dataset.state).toBe('results');
    game.click('[data-action=challenge]');
    expect(game.root.dataset.state).toBe('loadout');
    expect(game.root.querySelector('[data-challenge="c1-3"]')).not.toBeNull();
  });
});

describe("Chef's Challenge is winnable (bot-measured sample)", () => {
  // The hardest-looking rules from the full table: boss nights, the 4-card nights and late chapters.
  const SAMPLE = ['c1-5', 'c2-2', 'c3-3', 'c3-5', 'c4-5', 'c5-5'];
  it.each(SAMPLE)('%s: the savvy bot wins its challenge with the briefing\'s suggested hand and no shop upgrades', id => {
    const level = challengeLevel(LEVELS[id])!;
    const report = measureLevel(level, 4, { ...BOT_PROFILES.savvy, loadout: botLoadout(level, ownedAfter(id)) });
    expect(report.winRate, id).toBeGreaterThan(0);
  }, 120_000);
});
