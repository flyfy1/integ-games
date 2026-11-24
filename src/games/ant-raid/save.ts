import type { GameStorage } from '../../core/game-types';
import { CASTES, CRYSTALS, LEVEL_LIST, META_UPGRADES, STARTING_CASTES, type MetaUpgradeDef } from './data';
import { isLang } from './i18n';
import type { CasteId, Lang, LevelDef, MetaState } from './types';

/**
 * Persistent progress: one JSON blob under `SAVE_KEY` in the per-game storage the arcade hands us. Every load goes
 * through `migrate`, which repairs anything malformed field by field, so a corrupt or hand-edited save degrades to
 * defaults instead of crashing the menus. To change the schema: bump `SAVE_VERSION` and teach `migrate` the old one.
 */
export const SAVE_KEY = 'save';
export const SAVE_VERSION = 1;

export type LevelRecord = { win: boolean; bonus: boolean; par: boolean; bestTime: number | null; fails: number };
export type Settings = { music: number; sfx: number; reducedFx: boolean };
export type Save = {
  v: typeof SAVE_VERSION;
  lang: Lang | null;
  crystals: number;
  owned: CasteId[];
  loadout: CasteId[];
  upgrades: Partial<Record<keyof MetaState, number>>;
  levels: Record<string, LevelRecord>;
  scenes: string[];
  endless: { best: number; runs: number };
  speed: 1 | 2;
  coach: { seen: string[]; off: boolean };
  settings: Settings;
  w: number;
};

export const defaultSettings = (): Settings => ({ music: 0.6, sfx: 0.8, reducedFx: false });
export function defaultSave(): Save {
  return { v: SAVE_VERSION, lang: null, crystals: 0, owned: [...STARTING_CASTES], loadout: [...STARTING_CASTES], upgrades: {}, levels: {}, scenes: [], endless: { best: 0, runs: 0 }, speed: 1, coach: { seen: [], off: false }, settings: defaultSettings(), w: 0 };
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const count = (value: unknown, max = 1e9): number => (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : 0);
const strings = (value: unknown): string[] => (Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length < 64))] : []);
const unit = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback);

export function migrate(raw: unknown): Save {
  const save = defaultSave();
  if (!isObject(raw)) return save;
  save.lang = isLang(raw.lang) ? raw.lang : null;
  save.crystals = count(raw.crystals, 1e6);
  save.owned = [...new Set([...STARTING_CASTES, ...strings(raw.owned).filter((id): id is CasteId => id in CASTES)])];
  const loadout = strings(raw.loadout).filter((id): id is CasteId => save.owned.includes(id as CasteId));
  save.loadout = loadout.length ? loadout.slice(0, 6) : [...save.owned].slice(0, 5);
  if (isObject(raw.upgrades)) for (const upgrade of META_UPGRADES) { const rank = count(raw.upgrades[upgrade.id], upgrade.costs.length); if (rank) save.upgrades[upgrade.id] = rank; }
  if (isObject(raw.levels)) for (const [id, value] of Object.entries(raw.levels)) {
    if (!isObject(value) || id.length > 16) continue;
    save.levels[id] = { win: value.win === true, bonus: value.bonus === true, par: value.par === true, bestTime: typeof value.bestTime === 'number' && Number.isFinite(value.bestTime) ? value.bestTime : null, fails: count(value.fails, 99) };
  }
  save.scenes = strings(raw.scenes);
  if (isObject(raw.endless)) save.endless = { best: count(raw.endless.best), runs: count(raw.endless.runs) };
  save.speed = raw.speed === 2 ? 2 : 1;
  if (isObject(raw.coach)) save.coach = { seen: strings(raw.coach.seen).slice(-300), off: raw.coach.off === true };
  if (isObject(raw.settings)) save.settings = { music: unit(raw.settings.music, 0.6), sfx: unit(raw.settings.sfx, 0.8), reducedFx: raw.settings.reducedFx === true };
  save.w = count(raw.w);
  return save;
}

export function loadSave(storage: GameStorage): Save {
  try { return migrate(storage.get<unknown>(SAVE_KEY, null)); } catch { return defaultSave(); }
}
/** Writes and reads back; false means storage is not keeping our data. */
export function writeSave(storage: GameStorage, save: Save): boolean {
  save.w++;
  try { storage.set(SAVE_KEY, save); const back = storage.get<{ w?: number } | null>(SAVE_KEY, null); return !!back && back.w === save.w; } catch { return false; }
}
export function resetSave(storage: GameStorage, old: Save): Save {
  const fresh = defaultSave();
  fresh.lang = old.lang; fresh.settings = { ...old.settings };
  try { storage.remove(SAVE_KEY); } catch { /* ignore */ }
  return fresh;
}

export const metaOf = (save: Save): MetaState => ({ scent: save.upgrades.scent ?? 0, hatch: save.upgrades.hatch ?? 0, sugar: save.upgrades.sugar ?? 0, queen: save.upgrades.queen ?? 0, slot: save.upgrades.slot ?? 0 });
export const slotsOf = (save: Save) => 5 + (save.upgrades.slot ?? 0);
export const starsOf = (record: LevelRecord | undefined) => (record ? (record.win ? 1 : 0) + (record.bonus ? 1 : 0) + (record.par ? 1 : 0) : 0);
export const totalStars = (save: Save) => LEVEL_LIST.reduce((sum, level) => sum + starsOf(save.levels[level.id]), 0);

export function isUnlocked(save: Save, levelId: string): boolean {
  const index = LEVEL_LIST.findIndex(level => level.id === levelId);
  if (index <= 0) return index === 0;
  return !!save.levels[LEVEL_LIST[index - 1].id]?.win;
}

export type Outcome = { won: boolean; bonus: boolean; par: boolean; time: number };
export type Reward = { crystals: number; unlocked: CasteId[] };
export function applyOutcome(save: Save, level: LevelDef, outcome: Outcome): Reward {
  const record = save.levels[level.id] ?? { win: false, bonus: false, par: false, bestTime: null, fails: 0 };
  const reward: Reward = { crystals: 0, unlocked: [] };
  if (!outcome.won) { record.fails = Math.min(99, record.fails + 1); save.levels[level.id] = record; return reward; }
  if (!record.win) reward.crystals += level.boss ? CRYSTALS.boss : CRYSTALS.star;
  if (outcome.bonus && !record.bonus) reward.crystals += CRYSTALS.star;
  if (outcome.par && !record.par) reward.crystals += CRYSTALS.star;
  record.win = true; record.bonus ||= outcome.bonus; record.par ||= outcome.par;
  record.bestTime = record.bestTime === null ? outcome.time : Math.min(record.bestTime, outcome.time);
  save.levels[level.id] = record;
  save.crystals += reward.crystals;
  // Castes join the collection once the level that introduces them is cleared.
  for (const caste of Object.values(CASTES)) if (caste.introduced === level.id && !save.owned.includes(caste.id)) { save.owned.push(caste.id); reward.unlocked.push(caste.id); }
  for (const caste of level.cards ?? []) if (!save.owned.includes(caste)) { save.owned.push(caste); reward.unlocked.push(caste); }
  return reward;
}

export function upgradeCost(save: Save, upgrade: MetaUpgradeDef): number | null {
  const rank = save.upgrades[upgrade.id] ?? 0;
  return rank < upgrade.costs.length ? upgrade.costs[rank] : null;
}
export function buyUpgrade(save: Save, upgrade: MetaUpgradeDef): boolean {
  const cost = upgradeCost(save, upgrade);
  if (cost === null || save.crystals < cost) return false;
  save.crystals -= cost;
  save.upgrades[upgrade.id] = (save.upgrades[upgrade.id] ?? 0) + 1;
  return true;
}
export function respec(save: Save): number {
  let back = 0;
  for (const upgrade of META_UPGRADES) { const rank = save.upgrades[upgrade.id] ?? 0; for (let i = 0; i < rank; i++) back += upgrade.costs[i]; }
  save.upgrades = {};
  save.crystals += back;
  if (save.loadout.length > slotsOf(save)) save.loadout = save.loadout.slice(0, slotsOf(save));
  return back;
}
