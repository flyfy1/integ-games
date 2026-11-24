import type { GameStorage } from '../../core/game-types';
import { LEVELS } from './data/levels';
import { isLang, type Lang } from './i18n';
import type { Part, PartKind } from './types';

/**
 * Lantern Works save (one key in the arcade's per-game storage). Version 1. Each level keeps its three stars, the
 * best parts and beats ever reached, and the player's last build so a workshop is still there when they come back.
 */
export const SAVE_KEY = 'save';
export const SAVE_VERSION = 1;

export type LevelRecord = { stars: [boolean, boolean, boolean]; bestParts: number | null; bestBeats: number | null; build?: Part[] };
export type Settings = { sfx: number; music: number; glyphs: boolean; reduced: boolean };
export type Save = {
  v: number;
  lang: Lang | null;
  levels: Record<string, LevelRecord>;
  night: { best: number; shifts: number; build?: Part[] };
  settings: Settings;
  seen: string[];
  speed: number;
};

export const defaultSave = (): Save => ({ v: SAVE_VERSION, lang: null, levels: {}, night: { best: 0, shifts: 0 }, settings: { sfx: 0.8, music: 0.5, glyphs: false, reduced: false }, seen: [], speed: 1 });

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const PART_KINDS = new Set<PartKind>(['belt', 'folder', 'vat', 'joiner', 'splitter', 'mixer', 'sorter', 'bin', 'bridge', 'wick', 'gate', 'stamp', 'bundler']);
const cleanBuild = (raw: unknown): Part[] | undefined => Array.isArray(raw)
  ? raw.filter((p): p is Part => !!p && typeof p === 'object' && PART_KINDS.has((p as Part).kind) && Number.isInteger((p as Part).x) && Number.isInteger((p as Part).y) && [0, 1, 2, 3].includes((p as Part).dir)).slice(0, 200)
  : undefined;

export function migrate(raw: unknown): Save {
  const base = defaultSave();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<Save>;
  base.lang = isLang(r.lang) ? r.lang : null;
  if (r.levels && typeof r.levels === 'object') {
    for (const [id, rec] of Object.entries(r.levels)) {
      if (!rec || typeof rec !== 'object') continue;
      const stars = Array.isArray(rec.stars) ? rec.stars : [];
      base.levels[id] = { stars: [!!stars[0], !!stars[1], !!stars[2]], bestParts: typeof rec.bestParts === 'number' ? rec.bestParts : null, bestBeats: typeof rec.bestBeats === 'number' ? rec.bestBeats : null, build: cleanBuild(rec.build) };
    }
  }
  if (r.night && typeof r.night === 'object') base.night = { best: num(r.night.best, 0), shifts: num(r.night.shifts, 0), build: cleanBuild(r.night.build) };
  if (r.settings && typeof r.settings === 'object') {
    const s = r.settings;
    base.settings = { sfx: Math.max(0, Math.min(1, num(s.sfx, 0.8))), music: Math.max(0, Math.min(1, num(s.music, 0.5))), glyphs: !!s.glyphs, reduced: !!s.reduced };
  }
  if (Array.isArray(r.seen)) base.seen = r.seen.filter((x): x is string => typeof x === 'string').slice(0, 200);
  base.speed = [1, 2, 4].includes(num(r.speed, 1)) ? num(r.speed, 1) : 1;
  return base;
}

export function loadSave(storage: GameStorage): Save {
  try { return migrate(storage.get<unknown>(SAVE_KEY, null)); } catch { return defaultSave(); }
}
export function writeSave(storage: GameStorage, save: Save): boolean {
  try { storage.set(SAVE_KEY, save); const back = storage.get<Save | null>(SAVE_KEY, null); return !!back && back.v === save.v; } catch { return false; }
}

/** Folds a finished run into the record; returns which stars are new. */
export function recordWin(save: Save, id: string, stars: [boolean, boolean, boolean], parts: number, beats: number): boolean[] {
  const rec = save.levels[id] ?? { stars: [false, false, false], bestParts: null, bestBeats: null };
  const fresh = stars.map((s, i) => s && !rec.stars[i]);
  rec.stars = [rec.stars[0] || stars[0], rec.stars[1] || stars[1], rec.stars[2] || stars[2]];
  if (stars[0]) {
    rec.bestParts = rec.bestParts === null ? parts : Math.min(rec.bestParts, parts);
    rec.bestBeats = rec.bestBeats === null ? beats : Math.min(rec.bestBeats, beats);
  }
  save.levels[id] = rec;
  return fresh;
}

export const isUnlocked = (save: Save, id: string) => {
  const i = LEVELS.findIndex(l => l.id === id);
  if (i <= 0) return i === 0;
  return !!save.levels[LEVELS[i - 1].id]?.stars[0];
};
export const totalStars = (save: Save) => Object.values(save.levels).reduce((n, r) => n + r.stars.filter(Boolean).length, 0);
export const nightUnlocked = (save: Save) => !!save.levels['1-5']?.stars[0];
