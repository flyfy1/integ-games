import type { GameStorage } from '../../../core/game-types';
import { isLang, type Lang } from './i18n';
import { PUZZLES } from './levels';
import type { RuleId } from './types';

/**
 * Puzzle progress lives under its own key (`puzzle`), so the old real-time campaign save (`save`) is never read as
 * puzzle clears and is never overwritten: its level ids collide with the new ones. Language and settings carry over
 * from the old save the first time; old campaign progress is not migrated, and the shell shows a one-line notice.
 */
export const PUZZLE_KEY = 'puzzle';
export const OLD_KEY = 'save';
export const PUZZLE_VERSION = 1;

export type PuzzleRecord = { win: boolean; elegant: boolean; fails: number; best: number | null };
export type PuzzleSettings = { music: number; sfx: number; reducedFx: boolean };
export type PuzzleSave = {
  v: typeof PUZZLE_VERSION;
  lang: Lang | null;
  levels: Record<string, PuzzleRecord>;
  rules: RuleId[];
  scenes: string[];
  settings: PuzzleSettings;
  /** The "your old campaign was reset" notice has been shown. */
  noticed: boolean;
  w: number;
};

export const defaultPuzzleSave = (): PuzzleSave => ({ v: PUZZLE_VERSION, lang: null, levels: {}, rules: [], scenes: [], settings: { music: 0.6, sfx: 0.8, reducedFx: false }, noticed: false, w: 0 });

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const count = (value: unknown, max = 1e9) => (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : 0);
const unit = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback);
const strings = (value: unknown): string[] => (Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === 'string' && v.length < 40))] : []);
const settingsFrom = (raw: unknown, fallback: PuzzleSettings): PuzzleSettings => (isObject(raw) ? { music: unit(raw.music, fallback.music), sfx: unit(raw.sfx, fallback.sfx), reducedFx: raw.reducedFx === true } : fallback);

export function migratePuzzle(raw: unknown): PuzzleSave {
  const save = defaultPuzzleSave();
  if (!isObject(raw)) return save;
  save.lang = isLang(raw.lang) ? raw.lang : null;
  if (isObject(raw.levels)) for (const [id, value] of Object.entries(raw.levels)) {
    if (!isObject(value) || !PUZZLES.some(l => l.id === id)) continue;
    save.levels[id] = { win: value.win === true, elegant: value.elegant === true, fails: count(value.fails, 999), best: typeof value.best === 'number' && Number.isFinite(value.best) ? Math.max(0, Math.floor(value.best)) : null };
  }
  save.rules = strings(raw.rules) as RuleId[];
  save.scenes = strings(raw.scenes);
  save.settings = settingsFrom(raw.settings, save.settings);
  save.noticed = raw.noticed === true;
  save.w = count(raw.w);
  return save;
}

/** Load puzzle progress. `hadCampaign` says an old real-time save with progress exists (show the reset notice). */
export function loadPuzzle(storage: GameStorage): { save: PuzzleSave; hadCampaign: boolean } {
  let stored: unknown = null, old: unknown = null;
  try { stored = storage.get<unknown>(PUZZLE_KEY, null); } catch { stored = null; }
  try { old = storage.get<unknown>(OLD_KEY, null); } catch { old = null; }
  const save = migratePuzzle(stored);
  if (stored === null && isObject(old)) {
    if (isLang(old.lang)) save.lang = old.lang;
    save.settings = settingsFrom(old.settings, save.settings);
  }
  const hadCampaign = isObject(old) && isObject(old.levels) && Object.values(old.levels).some(v => isObject(v) && v.win === true);
  return { save, hadCampaign };
}
export function writePuzzle(storage: GameStorage, save: PuzzleSave): boolean {
  save.w++;
  try { storage.set(PUZZLE_KEY, save); const back = storage.get<{ w?: number } | null>(PUZZLE_KEY, null); return !!back && back.w === save.w; } catch { return false; }
}
export function resetPuzzle(storage: GameStorage, old: PuzzleSave): PuzzleSave {
  const fresh = defaultPuzzleSave();
  fresh.lang = old.lang; fresh.settings = { ...old.settings }; fresh.noticed = true;
  try { storage.remove(PUZZLE_KEY); } catch { /* ignore */ }
  return fresh;
}

export const isOpen = (save: PuzzleSave, id: string) => { const i = PUZZLES.findIndex(l => l.id === id); return i === 0 || (i > 0 && !!save.levels[PUZZLES[i - 1].id]?.win); };
/** First open level not yet cleared (else the last one). */
export const nextUp = (save: PuzzleSave) => PUZZLES.find(l => isOpen(save, l.id) && !save.levels[l.id]?.win)?.id ?? PUZZLES[PUZZLES.length - 1].id;
export function recordRun(save: PuzzleSave, id: string, won: boolean, cost: number, par: number | undefined): { first: boolean; elegant: boolean } {
  const rec = save.levels[id] ?? { win: false, elegant: false, fails: 0, best: null };
  const first = won && !rec.win;
  const elegant = won && par !== undefined && cost <= par;
  if (won) { rec.win = true; rec.elegant ||= elegant; rec.best = rec.best === null ? cost : Math.min(rec.best, cost); }
  else rec.fails = Math.min(999, rec.fails + 1);
  save.levels[id] = rec;
  return { first, elegant };
}
