import { describe, expect, it } from 'vitest';
import { catalog } from '../src/core/catalog';
import midnightKitchen from '../src/games/midnight-kitchen';
import { BOT_PROFILES, botLoadout, measureLevel, runBot } from '../src/games/midnight-kitchen/bot';
import { CHAPTERS, DEFENDERS, DEFENDER_LIST, ENDLESS_LEVEL, ENDLESS_UNLOCK, ENEMIES, ENEMY_LIST, LEVELS, LEVEL_LIST, META_UPGRADES, RECIPES, STARTING_DEFENDERS, levelById, nextLevelId, ownedAt } from '../src/games/midnight-kitchen/data';
import { ENDLESS_POOL, ENDLESS_THEMES, LATE_MODIFIERS, endlessBudget, endlessWave } from '../src/games/midnight-kitchen/data/endless';
import { BACKDROPS } from '../src/games/midnight-kitchen/render/board';
import { EN, ZH, createI18n } from '../src/games/midnight-kitchen/i18n';
import { DEFENDER_SPRITES, ENEMY_SPRITES, CHARACTER_SPRITES } from '../src/games/midnight-kitchen/render/sprites';
import { createSim, mulberry32 } from '../src/games/midnight-kitchen/sim';
import { BARKS, CHARACTERS, SCENES } from '../src/games/midnight-kitchen/story';
import type { Loc } from '../src/games/midnight-kitchen/types';

const bilingual = (text: Loc, where: string) => {
  expect(text.en.trim().length, `${where} en`).toBeGreaterThan(0);
  expect(text.zh.trim().length, `${where} zh`).toBeGreaterThan(0);
  expect(/[一-鿿]/.test(text.zh), `${where} zh should contain Chinese`).toBe(true);
};
/** The hand a sensible player brings when they first reach each level: only cards owned by then. */
const loadoutFor = (id: string) => botLoadout(LEVELS[id], ownedAt(id));
/** Bot measurements play whole nights; give them room beyond vitest's 5 s default. */
const BOT_TIMEOUT = 120_000;
const IDS = {
  defenders: ['burner', 'pepper', 'dough', 'ice', 'egg', 'chili', 'onion', 'whisk', 'kettle', 'honey', 'garlic', 'toaster', 'salt', 'ricecooker'],
  enemies: ['ant', 'shieldant', 'fruitfly', 'roach', 'slug', 'spore', 'weevil', 'mouse', 'moth', 'brute'],
  bosses: ['queen', 'drainking', 'greasegolem', 'baron', 'bloom'],
  characters: ['pip', 'ladle', 'grind', 'bun', 'shelly', 'frost', 'scout', 'queen', 'drainking', 'greasegolem', 'baron', 'bloom', 'granny', 'stew'],
  backdrops: ['countertop', 'sink', 'stove', 'pantry', 'fridge']
};

describe('midnight kitchen content tables', () => {
  it('module meta matches its catalog row', () => {
    const row = catalog.find(game => game.slug === 'midnight-kitchen');
    expect(row).toBeDefined();
    const { primaryCategory: _category, traits: _traits, recommendations: _recommendations, ...meta } = row!;
    expect(midnightKitchen.meta).toEqual(meta);
  });

  it('ships exactly the roster the art, audio and UI agreed on', () => {
    expect(DEFENDER_LIST.map(d => d.id).sort()).toEqual([...IDS.defenders].sort());
    expect(ENEMY_LIST.filter(e => !e.boss).map(e => e.id).sort()).toEqual([...IDS.enemies].sort());
    expect(ENEMY_LIST.filter(e => e.boss).map(e => e.id).sort()).toEqual([...IDS.bosses].sort());
    expect(RECIPES.length).toBeGreaterThanOrEqual(14);
    expect(RECIPES.some(r => r.parts.length === 3 && r.special)).toBe(true);
    expect(new Set(RECIPES.map(r => r.id)).size).toBe(RECIPES.length);
    for (const id of IDS.characters) expect(CHARACTERS[id], `character ${id}`).toBeDefined();
    for (const def of DEFENDER_LIST) expect(def.tiers, def.id).toHaveLength(def.role === 'oneshot' ? def.tiers.length : 3);
  });

  it('every boss has several phases, each with a telegraphed or answerable attack', () => {
    for (const id of IDS.bosses) {
      const boss = ENEMIES[id].boss!;
      expect(boss.phases.length, id).toBeGreaterThanOrEqual(3);
      for (const phase of boss.phases) {
        expect(phase.attacks.length, `${id} phase`).toBeGreaterThan(0);
        for (const attack of phase.attacks) if ('warn' in attack) expect(attack.warn, `${id} ${attack.kind} warns`).toBeGreaterThanOrEqual(2);
      }
    }
    expect(ENEMIES.bloom.boss!.remember).toBeDefined();
  });

  it('every row is bilingual and has a sprite', () => {
    for (const def of DEFENDER_LIST) { bilingual(def.name, def.id); bilingual(def.desc, def.id); expect(DEFENDER_SPRITES[def.id], `sprite ${def.id}`).toBeTypeOf('function'); expect(def.tiers.length).toBeGreaterThan(0); expect(def.cost).toBeGreaterThan(0); }
    for (const def of ENEMY_LIST) { bilingual(def.name, def.id); bilingual(def.desc, def.id); expect(ENEMY_SPRITES[def.id], `sprite ${def.id}`).toBeTypeOf('function'); }
    for (const recipe of RECIPES) { bilingual(recipe.name, recipe.id); bilingual(recipe.desc, recipe.id); }
    for (const upgrade of META_UPGRADES) { bilingual(upgrade.name, upgrade.id); bilingual(upgrade.desc, upgrade.id); expect(upgrade.costs.length).toBeGreaterThan(0); }
    for (const level of [...LEVEL_LIST, ENDLESS_LEVEL]) { bilingual(level.name, level.id); bilingual(level.blurb, level.id); }
  });

  it('recipes and upgrades only reference real defenders', () => {
    for (const recipe of RECIPES) {
      expect(recipe.parts.length).toBeGreaterThanOrEqual(2);
      for (const part of recipe.parts) expect(DEFENDERS[part], `${recipe.id} part ${part}`).toBeDefined();
      for (const bonus of recipe.bonuses) if (bonus.target !== 'all') expect(recipe.parts).toContain(bonus.target);
    }
    for (const upgrade of META_UPGRADES) if (upgrade.defender) expect(DEFENDERS[upgrade.defender]).toBeDefined();
  });

  it('five chapters of five levels, each ending in its boss, with the agreed backdrops and music', () => {
    expect(CHAPTERS.map(c => c.backdrop)).toEqual(IDS.backdrops);
    CHAPTERS.forEach((chapter, i) => {
      expect(chapter.levels).toEqual([1, 2, 3, 4, 5].map(n => `c${chapter.id}-${n}`));
      bilingual(chapter.name, `chapter ${chapter.id}`); bilingual(chapter.blurb, `chapter ${chapter.id}`);
      expect(BACKDROPS[chapter.backdrop], chapter.backdrop).toBeTypeOf('function');
      const boss = LEVELS[chapter.levels[4]];
      expect(boss.boss).toBe(IDS.bosses[i]);
      expect(boss.music).toBe(i === 4 ? 'finale' : 'boss');
      for (const id of chapter.levels) {
        const level = LEVELS[id];
        expect(level.chapter).toBe(chapter.id);
        expect(level.backdrop).toBe(chapter.backdrop);
        if (id !== boss.id) expect(level.music ?? chapter.backdrop, id).toBe(chapter.backdrop);
      }
      if (chapter.opener) expect(SCENES[chapter.opener], chapter.opener).toBeDefined();
    });
    expect(LEVEL_LIST).toHaveLength(25);
  });

  it('every level references real content, and its fixed cards and new toys are owned when it is reached', () => {
    LEVEL_LIST.forEach((level, index) => {
      expect(level.id).toBe(`c${level.chapter}-${level.index}`);
      expect(level.waves.length).toBeGreaterThan(0);
      const owned = new Set(ownedAt(level.id));
      for (const wave of level.waves) for (const [time, enemy, lane, count, gap] of wave.spawns) {
        expect(ENEMIES[enemy], `${level.id} spawns ${enemy}`).toBeDefined();
        expect(time).toBeGreaterThanOrEqual(0);
        if (lane !== '*') { expect(lane).toBeGreaterThanOrEqual(0); expect(lane, `${level.id} lane ${lane}`).toBeLessThan((level.activeLanes ?? [0, 1, 2, 3, 4]).length); }
        if (count !== undefined) expect(count).toBeGreaterThan(0);
        if (gap !== undefined) expect(gap).toBeGreaterThan(0);
      }
      for (const card of level.cards ?? []) expect(owned.has(card), `${level.id} fixed card ${card} is owned by then`).toBe(true);
      for (const id of level.introduces?.defenders ?? []) expect(owned.has(id), `${level.id} introduces ${id}, owned by then`).toBe(true);
      for (const id of level.unlocks ?? []) expect(DEFENDERS[id]).toBeDefined();
      for (const id of level.introduces?.enemies ?? []) expect(ENEMIES[id]).toBeDefined();
      expect(nextLevelId(level.id)).toBe(LEVEL_LIST[index + 1]?.id);
      expect(levelById(level.id)).toBe(level);
      // Every board must build: terrain and hazards stay on the board.
      const sim = createSim(level, { random: mulberry32(1), loadout: loadoutFor(level.id) });
      expect(sim.cells.length).toBe(level.lanes);
    });
    expect(LEVELS[ENDLESS_UNLOCK]).toBeDefined();
    expect(levelById(ENDLESS_LEVEL.id)).toBe(ENDLESS_LEVEL);
    expect(levelById('nope')).toBeUndefined();
  });

  it('the unlock graph reaches every defender, about one new toy every level or two', () => {
    const owned = ownedAt('nope');
    expect(new Set(owned)).toEqual(new Set(DEFENDER_LIST.map(d => d.id)));
    expect(STARTING_DEFENDERS.length).toBeLessThanOrEqual(3);
    let gap = 0;
    for (const level of LEVEL_LIST) {
      const fresh = (level.unlocks?.length ?? 0) + (level.introduces?.defenders?.length ?? 0) + (level.introduces?.enemies?.length ?? 0);
      gap = fresh ? 0 : gap + 1;
      expect(gap, `${level.id}: too long without anything new`).toBeLessThanOrEqual(2);
    }
  });

  it('every recipe can be formed by the level that hints at it, and is hinted somewhere', () => {
    for (const recipe of RECIPES) {
      expect(recipe.hint, recipe.id).toBeDefined();
      expect(LEVELS[recipe.hint!], `${recipe.id} hint level`).toBeDefined();
      const owned = ownedAt(recipe.hint!);
      for (const part of recipe.parts) expect(owned, `${recipe.id} needs ${part} by ${recipe.hint}`).toContain(part);
      expect(recipe.parts.length).toBeLessThanOrEqual(LEVELS[recipe.hint!].slots);
      if (recipe.clue) bilingual(recipe.clue, `${recipe.id} clue`);
    }
  });

  it('tutorial steps and barks are bilingual and point at real things', () => {
    for (const level of LEVEL_LIST) {
      for (const step of level.tutorial ?? []) {
        bilingual(step.text, `${level.id} tutorial`);
        if (step.focus && 'cell' in step.focus) { expect(step.focus.cell[0]).toBeLessThan(level.cols); expect(level.activeLanes ?? [0, 1, 2, 3, 4]).toContain(step.focus.cell[1]); }
      }
      for (const bark of level.barks ?? []) { bilingual(bark.line, `${level.id} bark`); expect(CHARACTERS[bark.speaker], `speaker ${bark.speaker}`).toBeDefined(); }
    }
    for (const list of Object.values(BARKS)) for (const bark of list) { bilingual(bark.line, 'bark'); expect(CHARACTERS[bark.speaker]).toBeDefined(); }
  });

  it('every level has an intro and outro scene with known, drawable speakers', () => {
    for (const level of LEVEL_LIST) {
      for (const id of [level.intro, level.outro]) {
        expect(id, `${level.id} scene`).toBeTruthy();
        const scene = SCENES[id!];
        expect(scene, `scene ${id}`).toBeDefined();
        expect(scene.lines.length).toBeGreaterThan(0);
        for (const line of scene.lines) { bilingual(line.text, id!); expect(CHARACTERS[line.who], `${id} speaker ${line.who}`).toBeDefined(); expect(CHARACTER_SPRITES[line.who], `portrait ${line.who}`).toBeTypeOf('function'); }
      }
    }
    for (const character of Object.values(CHARACTERS)) bilingual(character.name, character.id);
    const speakers = new Set(Object.values(SCENES).flatMap(scene => scene.lines.map(line => line.who)));
    for (const id of ['drainking', 'greasegolem', 'baron', 'bloom', 'granny', 'stew']) expect(speakers.has(id), `${id} speaks in a scene`).toBe(true);
    for (const scene of Object.values(SCENES)) expect(BACKDROPS[scene.backdrop] ?? scene.backdrop === 'story', `scene ${scene.id} backdrop ${scene.backdrop}`).toBeTruthy();
  });

  it('the story carries its clues to the finale, in both languages', () => {
    const text = (ids: string[], lang: 'en' | 'zh') => ids.flatMap(id => SCENES[id]?.lines ?? []).map(line => line.text[lang]).join(' ').toLowerCase();
    const chapter = (n: number) => [1, 2, 3, 4, 5].flatMap(i => [`c${n}-${i}-intro`, `c${n}-${i}-outro`]);
    expect(text(chapter(2), 'en')).toMatch(/recipe card/);
    expect(text(chapter(3), 'en')).toMatch(/bowl/);
    expect(text(chapter(4), 'en')).toMatch(/photo/);
    expect(text(['c5-5-outro'], 'en')).toMatch(/dawn|morning|sun/);
    expect(text(['c5-5-outro'], 'zh')).toMatch(/奶奶/);
  });

  it('interface strings exist in both languages with the same placeholders', () => {
    const keys = Object.keys(EN) as (keyof typeof EN)[];
    expect(Object.keys(ZH).sort()).toEqual([...keys].sort());
    const holes = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
    for (const key of keys) { expect(ZH[key].length, key).toBeGreaterThan(0); expect(holes(ZH[key]), key).toEqual(holes(EN[key])); }
    const zh = createI18n('zh'), en = createI18n('en');
    expect(zh.tr({ en: 'Ant', zh: '蚂蚁' })).toBe('蚂蚁');
    expect(en.tr({ en: 'Ant', zh: '蚂蚁' })).toBe('Ant');
    expect(en.t('hud.cost', { n: 50 })).toContain('50');
  });
});

describe('midnight kitchen endless generator', () => {
  it('is deterministic for a seed, only uses known enemies, and grows', () => {
    const a = Array.from({ length: 40 }, (_, i) => endlessWave(i, mulberry32(9)));
    const b = Array.from({ length: 40 }, (_, i) => endlessWave(i, mulberry32(9)));
    expect(a).toEqual(b);
    const known = new Set([...ENDLESS_POOL.map(row => row[1]), ...ENDLESS_THEMES.flatMap(theme => theme.pool.map(row => row[0]))]);
    const threat = (index: number) => a[index].spawns.reduce((sum, [, enemy, , count]) => sum + ENEMIES[enemy].threat * (count ?? 1), 0);
    for (const wave of a) { expect(wave.spawns.length).toBeGreaterThan(0); for (const [, enemy] of wave.spawns) expect(known.has(enemy) || !!ENEMIES[enemy].boss, enemy).toBe(true); }
    expect(endlessBudget(20)).toBeGreaterThan(endlessBudget(5));
    expect(threat(31) + threat(32) + threat(33)).toBeGreaterThan(threat(1) + threat(2) + threat(3));
  });

  it('walks through the kitchen: themed stretches, mini-bosses on big waves and a rotating board modifier', () => {
    const waves = Array.from({ length: 40 }, (_, i) => endlessWave(i, mulberry32(4)));
    ENDLESS_THEMES.forEach((theme, stretch) => {
      const big = waves[stretch * 5 + 4];
      expect(big.big).toBe(true);
      expect(big.spawns[0][1], `stretch ${theme.id} mini-boss`).toBe(theme.boss);
      expect(big.bossScale).toBeGreaterThan(0);
      if (stretch > 0) expect(waves[stretch * 5].modifier?.id).toBe(theme.modifier?.id);
      if (theme.modifier) { bilingual(theme.modifier.name, theme.id); bilingual(theme.modifier.desc, theme.id); }
    });
    for (const modifier of LATE_MODIFIERS) bilingual(modifier.name, modifier.id);
    for (let i = 25; i < 40; i += 5) expect(waves[i].modifier, `wave ${i + 1}`).toBeDefined();
    expect(ENDLESS_LEVEL.polish).toBe(true);
  });

  it('eventually ends, and the score reflects how far the bot got', () => {
    const run = runBot(ENDLESS_LEVEL, { seed: 3, maxTime: 240, loadout: loadoutFor('c1-4') });
    expect(run.won).toBe(false);
    expect(run.wave).toBeGreaterThanOrEqual(4);
    expect(run.score).toBeGreaterThan(0);
    const hopeless = runBot(ENDLESS_LEVEL, { seed: 3, maxTime: 2400, loadout: ['burner'] });
    expect(hopeless.lost).toBe(true);
  });

  it('a strong player meets a wall between about 9 and 15 minutes, whatever the hand and seed', () => {
    // Measured (16 seeds each): Chili hand 10.5-13.9 min, Rice Cooker hand 9.4-13.9 min.
    for (const hand of [['burner', 'pepper', 'dough', 'egg', 'ice', 'chili'], ['burner', 'pepper', 'dough', 'egg', 'ice', 'ricecooker']]) {
      const times = Array.from({ length: 8 }, (_, i) => runBot(ENDLESS_LEVEL, { ...BOT_PROFILES.savvy, seed: i + 1, maxTime: 1500, loadout: hand }))
        .map(run => { expect(run.lost, `${hand.join(',')} ends`).toBe(true); return run.time; });
      expect(Math.min(...times), `${hand.join(',')} shortest run`).toBeGreaterThan(9 * 60);
      expect(Math.max(...times), `${hand.join(',')} longest run`).toBeLessThan(15 * 60);
    }
  }, BOT_TIMEOUT);
});

describe('midnight kitchen difficulty (autoplay bot)', () => {
  it('the bot is deterministic for a seed', () => {
    const options = { ...BOT_PROFILES.casual, seed: 11, loadout: loadoutFor('c1-2') };
    expect(runBot(LEVELS['c1-2'], options)).toEqual(runBot(LEVELS['c1-2'], options));
  });

  it('the bot only brings cards the player owns by then', () => {
    for (const level of LEVEL_LIST) {
      const owned = ownedAt(level.id), hand = loadoutFor(level.id);
      expect(hand.length).toBeLessThanOrEqual(level.slots);
      for (const id of hand) expect(owned, `${level.id} brings ${id}`).toContain(id);
      for (const id of level.introduces?.defenders ?? []) expect(hand, `${level.id} brings its new card`).toContain(id);
    }
  });

  it('level 1 is easy: even a slow, burner-shy player wins every time without losing a slice', () => {
    for (const profile of [BOT_PROFILES.savvy, BOT_PROFILES.casual, BOT_PROFILES.naive]) {
      const report = measureLevel(LEVELS['c1-1'], 6, { ...profile, loadout: loadoutFor('c1-1') });
      expect(report.winRate).toBe(1);
      expect(report.avgSlicesLost).toBeLessThanOrEqual(0.2);
    }
  });

  // Floors sit below what 12 seeds measure (savvy >= 0.92 everywhere; casual >= 0.83 on regular nights and
  // >= 0.75 on boss nights), so a small data tweak does not trip them but a real regression does.
  it.each(LEVEL_LIST.map(level => [level.id]))('%s is winnable by a savvy player with the cards owned at that point', id => {
    const report = measureLevel(LEVELS[id], 12, { ...BOT_PROFILES.savvy, loadout: loadoutFor(id) });
    expect(report.winRate, `${id} savvy win rate`).toBeGreaterThanOrEqual(0.83);
    expect(report.flawlessRate, `${id} savvy can keep every slice`).toBeGreaterThan(0);
  }, BOT_TIMEOUT);

  it.each(LEVEL_LIST.map(level => [level.id]))('%s is won most nights by a casual player', id => {
    const report = measureLevel(LEVELS[id], 12, { ...BOT_PROFILES.casual, loadout: loadoutFor(id) });
    expect(report.winRate, `${id} casual win rate`).toBeGreaterThanOrEqual(LEVELS[id].boss ? 0.58 : 0.66);
  }, BOT_TIMEOUT);

  it('boss nights take a savvy player about 3 to 4.5 minutes', () => {
    for (const level of LEVEL_LIST.filter(l => l.boss)) {
      const report = measureLevel(level, 6, { ...BOT_PROFILES.savvy, loadout: loadoutFor(level.id) });
      expect(report.avgTime, `${level.id} savvy minutes`).toBeGreaterThan(180);
      expect(report.avgTime, `${level.id} savvy minutes`).toBeLessThan(285);
    }
  }, BOT_TIMEOUT);

  it('difficulty rises smoothly: no regular night is much easier than the one two regular nights before it', () => {
    const regular = LEVEL_LIST.filter(level => !level.boss && level.chapter > 0 && !level.cards);
    for (const name of ['casual', 'naive'] as const) {
      const rates = regular.map(level => measureLevel(level, 12, { ...BOT_PROFILES[name], loadout: loadoutFor(level.id) }).winRate);
      for (let i = 2; i < rates.length; i++) expect(rates[i] - rates[i - 2], `${name}: ${regular[i].id} vs ${regular[i - 2].id}`).toBeLessThanOrEqual(0.35);
    }
  }, BOT_TIMEOUT);

  it.each(LEVEL_LIST.map(level => [level.id]))('%s has a bonus star someone actually earns', id => {
    const earned = (['planner', 'casual'] as const).some(name => measureLevel(LEVELS[id], 6, { ...BOT_PROFILES[name], loadout: loadoutFor(id) }).bonusRate > 0);
    expect(earned, `${id} bonus ${JSON.stringify(LEVELS[id].bonus)}`).toBe(true);
  });

  it('chapter one is a gentle on-ramp: even a careless player clears the regular nights', () => {
    for (const id of ['c1-2', 'c1-3', 'c1-4']) {
      const report = measureLevel(LEVELS[id], 6, { ...BOT_PROFILES.naive, loadout: loadoutFor(id) });
      expect(report.winRate, `${id} naive`).toBeGreaterThanOrEqual(0.66);
    }
  });

  it('later chapters need a plan: a careless player mostly loses from the Pantry on', () => {
    const ids = LEVEL_LIST.filter(level => level.chapter >= 4).map(level => level.id);
    const rate = ids.reduce((sum, id) => sum + measureLevel(LEVELS[id], 3, { ...BOT_PROFILES.naive, loadout: loadoutFor(id) }).winRate, 0) / ids.length;
    expect(rate).toBeLessThanOrEqual(0.35);
  });

  it('doing nothing loses every level', () => {
    for (const level of LEVEL_LIST) expect(runBot(level, { seed: 1, loadout: [], sloppy: 1 }).lost, level.id).toBe(true);
  });

  it('the first boss can be passed by a first-time player, and still bites', () => {
    // Measured: naive 0.58 over 12 seeds (0.63 over 24); before the mercy / aimed-cube / court rework it was 0.
    const naive = measureLevel(LEVELS['c1-5'], 12, { ...BOT_PROFILES.naive, loadout: loadoutFor('c1-5') });
    expect(naive.winRate).toBeGreaterThanOrEqual(0.4);
    // A boss, not a formality: an average hand often loses a slice (casual keeps all three 0.71-0.83 of the time),
    // and even a strong one needs a few minutes.
    const casual = measureLevel(LEVELS['c1-5'], 12, { ...BOT_PROFILES.casual, loadout: loadoutFor('c1-5') });
    expect(casual.flawlessRate).toBeLessThan(0.95);
    const savvy = measureLevel(LEVELS['c1-5'], 6, { ...BOT_PROFILES.savvy, loadout: loadoutFor('c1-5') });
    expect(savvy.avgTime).toBeGreaterThan(180);
    const easy = measureLevel(LEVELS['c1-1'], 3, { ...BOT_PROFILES.savvy, loadout: loadoutFor('c1-1') });
    expect(savvy.avgTime).toBeGreaterThan(easy.avgTime);
  }, BOT_TIMEOUT);

  it('the finale can end in remembering the Bloom', () => {
    const report = measureLevel(LEVELS['c5-5'], 4, { ...BOT_PROFILES.savvy, loadout: loadoutFor('c5-5') });
    expect(report.results.some(r => r.won && r.remembered)).toBe(true);
    for (const r of report.results) if (r.won) expect(r.remembered).toBe(true);
  });
});
