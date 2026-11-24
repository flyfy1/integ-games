import type { GameStorage } from '../../core/game-types';
import { AFTER_HOURS, AFTER_HOURS_STARS, DEFENDERS, ENDLESS_LEVEL, LEVEL_LIST, META_UPGRADES, STARTING_DEFENDERS } from './data';
import { isLang, type Lang } from './i18n';
import { isDifficulty } from './sim';
import type { Difficulty, LevelDef, MetaState, MetaUpgradeDef } from './types';

/**
 * Persistent progress. One JSON blob under `SAVE_KEY` in the per-game storage the arcade hands us.
 * Every load goes through `migrate`, which upgrades older shapes and repairs anything malformed field by field, so
 * a corrupt or hand-edited save degrades to defaults instead of crashing the menus.
 *
 * To change the schema: bump `SAVE_VERSION`, add the old shape to `migrate`, and extend tests/midnight-kitchen-shell.
 */
export const SAVE_KEY = 'save';
export const SAVE_VERSION = 4;

export type LevelRecord = { win: boolean; flawless: boolean; bonus: boolean; bestTime: number | null };
export type Save = {
  v: typeof SAVE_VERSION;
  /** null = follow the browser language. */
  lang: Lang | null;
  crumbs: number;
  /** Defender ids the player can bring. */
  owned: string[];
  /** Last hand picked on the loadout screen. */
  loadout: string[];
  /** Permanent upgrade id -> level. */
  upgrades: Record<string, number>;
  levels: Record<string, LevelRecord>;
  cookbook: { defenders: string[]; enemies: string[]; recipes: string[] };
  /** Story scenes already watched (they still replay from the map, but stop auto-playing on retries). */
  scenes: string[];
  endless: { bestScore: number; bestWave: number; runs: number };
  speed: 1 | 2;
  /** Coach marks already shown (ids such as `c1-1:0` or `tip.heat`), and the "no more tips" switch. */
  coach: { seen: string[]; off: boolean };
  /** Player preferences. Volumes are 0..1. */
  settings: Settings;
  /** v4: difficulty picked on the briefing (applies to campaign and After Hours nights). */
  difficulty: Difficulty;
  /** v4: losses in a row per night since its last win (two or more: Granny offers her help). */
  losses: Record<string, number>;
  /** v4: nights won on Chef difficulty. */
  chefWins: string[];
  /** v4: Chef's Table puzzles solved. */
  puzzles: string[];
  /** v4: nights whose Chef's Challenge (the fourth star) has been won. */
  challenges: string[];
  /** Bumped on every write so a silent storage failure can be detected by reading the value back. */
  w: number;
};
export type Settings = { music: number; sfx: number; reducedFx: boolean; autoAdvance: boolean };
export const defaultSettings = (): Settings => ({ music: 0.7, sfx: 0.8, reducedFx: false, autoAdvance: false });

export function defaultSave(): Save {
  return {
    v: SAVE_VERSION, lang: null, crumbs: 0, owned: [...STARTING_DEFENDERS], loadout: [...STARTING_DEFENDERS], upgrades: {}, levels: {},
    cookbook: { defenders: [...STARTING_DEFENDERS], enemies: [], recipes: [] }, scenes: [], endless: { bestScore: 0, bestWave: 0, runs: 0 }, speed: 1,
    coach: { seen: [], off: false }, settings: defaultSettings(), difficulty: 'standard', losses: {}, chefWins: [], puzzles: [], challenges: [], w: 0
  };
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const count = (value: unknown, max = 1e9): number => (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : 0);
const strings = (value: unknown): string[] => (Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length < 64))] : []);

/**
 * v1 was the first prototype: `{ version: 1, stars: { levelId: 0..3 }, coins, unlocked: [defender ids], lang }`.
 * Stars were a plain count, so 1 = win, 2 = win + flawless, 3 = all three.
 */
function fromV1(raw: Record<string, unknown>): Record<string, unknown> {
  const levels: Record<string, LevelRecord> = {};
  if (isObject(raw.stars)) for (const [id, value] of Object.entries(raw.stars)) { const n = count(value, 3); if (n > 0) levels[id] = { win: true, flawless: n >= 2, bonus: n >= 3, bestTime: null }; }
  return { v: 2, lang: raw.lang, crumbs: raw.coins, owned: raw.unlocked, loadout: raw.unlocked, levels };
}
const unit = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback);

/** Turns anything (old version, partial object, garbage, null) into a valid current save. */
export function migrate(raw: unknown): Save {
  const save = defaultSave();
  if (!isObject(raw)) return save;
  let data = raw;
  if (data.v === undefined && data.version === 1) data = fromV1(data);
  // A save from a newer build than this one: keep what we understand rather than wiping it.
  save.lang = isLang(data.lang) ? data.lang : null;
  save.crumbs = count(data.crumbs, 1e7);
  const owned = strings(data.owned).filter(id => DEFENDERS[id]);
  save.owned = [...new Set([...STARTING_DEFENDERS, ...owned])];
  const loadout = strings(data.loadout).filter(id => save.owned.includes(id));
  save.loadout = loadout.length ? loadout : [...save.owned].slice(0, 6);
  if (isObject(data.upgrades)) for (const upgrade of META_UPGRADES) { const level = count(data.upgrades[upgrade.id], upgrade.costs.length); if (level) save.upgrades[upgrade.id] = level; }
  if (isObject(data.levels)) for (const [id, value] of Object.entries(data.levels)) {
    if (!isObject(value) || id.length > 32) continue;
    const win = value.win === true, time = typeof value.bestTime === 'number' && Number.isFinite(value.bestTime) && value.bestTime > 0 ? value.bestTime : null;
    if (win) save.levels[id] = { win, flawless: value.flawless === true, bonus: value.bonus === true, bestTime: time };
  }
  const book = isObject(data.cookbook) ? data.cookbook : {};
  save.cookbook = { defenders: [...new Set([...save.owned, ...strings(book.defenders)])], enemies: strings(book.enemies), recipes: strings(book.recipes) };
  save.scenes = strings(data.scenes);
  const endless = isObject(data.endless) ? data.endless : {};
  save.endless = { bestScore: count(endless.bestScore), bestWave: count(endless.bestWave, 9999), runs: count(endless.runs, 1e6) };
  save.speed = data.speed === 2 ? 2 : 1;
  // v2 -> v3: coach marks and settings are new. A v2 player has already been through the first level, so they
  // only get the tips for things they have not met yet.
  const coach = isObject(data.coach) ? data.coach : {};
  save.coach = { seen: strings(coach.seen).slice(0, 400), off: coach.off === true };
  const settings = isObject(data.settings) ? data.settings : {}, fallback = defaultSettings();
  save.settings = { music: unit(settings.music, fallback.music), sfx: unit(settings.sfx, fallback.sfx), reducedFx: settings.reducedFx === true, autoAdvance: settings.autoAdvance === true };
  // v3 -> v4: difficulty, Granny's loss counter, Chef wins, puzzles and challenges are new; a v3 save starts them empty.
  save.difficulty = isDifficulty(data.difficulty) ? data.difficulty : 'standard';
  if (isObject(data.losses)) for (const [id, value] of Object.entries(data.losses)) { const n = count(value, 99); if (n && id.length <= 32) save.losses[id] = n; }
  save.chefWins = strings(data.chefWins).slice(0, 200);
  save.puzzles = strings(data.puzzles).slice(0, 200);
  save.challenges = strings(data.challenges).slice(0, 200);
  save.w = count(data.w);
  return save;
}

export function loadSave(storage: GameStorage): Save {
  try { return migrate(storage.get<unknown>(SAVE_KEY, null)); } catch { return defaultSave(); }
}
/**
 * Writes the save and reports whether it really landed. The arcade's storage swallows quota / privacy-mode errors,
 * so the only honest check is to read the write counter back. On failure the game keeps playing from memory.
 */
export function writeSave(storage: GameStorage, save: Save): boolean {
  save.w = (save.w + 1) % 1e9;
  try {
    storage.set(SAVE_KEY, save);
    const back = storage.get<unknown>(SAVE_KEY, null);
    return isObject(back) && back.w === save.w;
  } catch { return false; }
}
/** Erases progress but keeps preferences (language, volumes). */
export function resetSave(storage: GameStorage, keep: Save): Save {
  try { storage.remove(SAVE_KEY); } catch { /* nothing to remove */ }
  const fresh = defaultSave();
  fresh.lang = keep.lang; fresh.settings = { ...keep.settings }; fresh.speed = keep.speed;
  return fresh;
}

// ---------------------------------------------------------------- progress queries

export const starsOf = (record: LevelRecord | undefined): number => (record ? Number(record.win) + Number(record.flawless) + Number(record.bonus) : 0);
export const totalStars = (save: Save): number => LEVEL_LIST.reduce((sum, level) => sum + starsOf(save.levels[level.id]), 0);
/** Stars from the side nights (After Hours) plus a fourth star per Chef's Challenge won. */
export const afterHoursStars = (save: Save): number => AFTER_HOURS.reduce((sum, level) => sum + starsOf(save.levels[level.id]), 0);
/** Every star the player owns: what opens the After Hours nights. */
export const allStars = (save: Save): number => totalStars(save) + afterHoursStars(save) + save.challenges.length;
/** A level opens once the one before it has been won. */
export function isUnlocked(save: Save, levelId: string): boolean {
  if (levelId in AFTER_HOURS_STARS) return allStars(save) >= AFTER_HOURS_STARS[levelId];
  const index = LEVEL_LIST.findIndex(level => level.id === levelId);
  return index <= 0 ? index === 0 : !!save.levels[LEVEL_LIST[index - 1].id]?.win;
}
export const metaOf = (save: Save): MetaState => ({ upgrades: save.upgrades });
/** Two losses in a row on a night: Granny offers a free tier-2 guard. */
export const GRANNY_AFTER = 2;
export const grannyOffered = (save: Save, levelId: string): boolean => (save.losses[levelId] ?? 0) >= GRANNY_AFTER;

// ---------------------------------------------------------------- progress updates

export const CRUMBS_PER_STAR = 15;
export const CRUMBS_REPLAY = 5;
/** First win of a night on Chef difficulty. */
export const CRUMBS_CHEF = 25;

export type Outcome = {
  won: boolean; flawless: boolean; bonus: boolean; time: number; score: number; wave: number; recipes: string[]; enemiesSeen: string[]; defendersUsed: string[];
  /** Difficulty the night was played on (default Standard). */
  difficulty?: Difficulty;
};
export type Reward = {
  crumbs: number; newStars: number; unlocked: string[]; newRecipes: string[]; firstClear: boolean; newBest: boolean;
  /** Endless only. */
  newBestWave?: boolean; prevBest?: { score: number; wave: number };
  /** Stars on this level before the run (for the results ceremony). */
  priorStars?: number;
  /** Which of the three stars were already earned before this run. */
  prior?: [boolean, boolean, boolean];
  /** First win of this night on Chef difficulty. */
  chefWin?: boolean;
};

/** Folds a finished level into the save (mutates it) and reports what was gained, for the results screen. */
export function applyOutcome(save: Save, level: LevelDef, outcome: Outcome): Reward {
  const reward: Reward = { crumbs: 0, newStars: 0, unlocked: [], newRecipes: [], firstClear: false, newBest: false };
  for (const id of outcome.recipes) if (!save.cookbook.recipes.includes(id)) { save.cookbook.recipes.push(id); reward.newRecipes.push(id); }
  for (const id of outcome.enemiesSeen) if (!save.cookbook.enemies.includes(id)) save.cookbook.enemies.push(id);
  for (const id of outcome.defendersUsed) if (!save.cookbook.defenders.includes(id)) save.cookbook.defenders.push(id);
  if (level.id === ENDLESS_LEVEL.id) {
    reward.crumbs = Math.floor(outcome.score / 100);
    reward.newBest = outcome.score > save.endless.bestScore;
    reward.newBestWave = outcome.wave > save.endless.bestWave;
    reward.prevBest = { score: save.endless.bestScore, wave: save.endless.bestWave };
    save.endless = { bestScore: Math.max(save.endless.bestScore, outcome.score), bestWave: Math.max(save.endless.bestWave, outcome.wave), runs: save.endless.runs + 1 };
  } else if (outcome.won) {
    const before = save.levels[level.id], prior = starsOf(before);
    reward.priorStars = prior;
    reward.prior = [!!before?.win, !!before?.flawless, !!before?.bonus];
    const record: LevelRecord = { win: true, flawless: !!before?.flawless || outcome.flawless, bonus: !!before?.bonus || outcome.bonus, bestTime: before?.bestTime ? Math.min(before.bestTime, outcome.time) : outcome.time };
    reward.firstClear = !before?.win;
    reward.newBest = !!before?.bestTime && outcome.time < before.bestTime;
    reward.newStars = starsOf(record) - prior;
    reward.crumbs = (reward.firstClear ? level.reward : CRUMBS_REPLAY) + reward.newStars * CRUMBS_PER_STAR;
    save.levels[level.id] = record;
    if (outcome.difficulty === 'chef' && !save.chefWins.includes(level.id)) { save.chefWins.push(level.id); reward.chefWin = true; reward.crumbs += CRUMBS_CHEF; }
    delete save.losses[level.id];
    for (const id of level.unlocks ?? []) if (DEFENDERS[id] && !save.owned.includes(id)) {
      save.owned.push(id); reward.unlocked.push(id);
      if (!save.cookbook.defenders.includes(id)) save.cookbook.defenders.push(id);
    }
  }
  if (!outcome.won && level.id !== ENDLESS_LEVEL.id) save.losses[level.id] = Math.min(99, (save.losses[level.id] ?? 0) + 1);
  save.crumbs += reward.crumbs;
  return reward;
}

export const upgradeLevel = (save: Save, upgrade: MetaUpgradeDef): number => Math.min(upgrade.costs.length, save.upgrades[upgrade.id] ?? 0);
/** Crumbs for the next level of an upgrade, or null when maxed. */
export const upgradePrice = (save: Save, upgrade: MetaUpgradeDef): number | null => upgrade.costs[upgradeLevel(save, upgrade)] ?? null;
export function canBuy(save: Save, upgrade: MetaUpgradeDef): boolean {
  const price = upgradePrice(save, upgrade);
  return price !== null && save.crumbs >= price && (!upgrade.defender || save.owned.includes(upgrade.defender));
}
/** Crumbs that a full respec would hand back. */
export const respecValue = (save: Save, upgrades: MetaUpgradeDef[]): number =>
  upgrades.reduce((sum, upgrade) => sum + upgrade.costs.slice(0, upgradeLevel(save, upgrade)).reduce((a, b) => a + b, 0), 0);
/** Refunds every permanent upgrade in full. Returns the crumbs given back. */
export function respec(save: Save, upgrades: MetaUpgradeDef[]): number {
  const back = respecValue(save, upgrades);
  save.crumbs += back; save.upgrades = {};
  return back;
}
export function buyUpgrade(save: Save, upgrade: MetaUpgradeDef): boolean {
  if (!canBuy(save, upgrade)) return false;
  save.crumbs -= upgradePrice(save, upgrade)!;
  save.upgrades[upgrade.id] = upgradeLevel(save, upgrade) + 1;
  return true;
}
