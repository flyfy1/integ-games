import type { GameStorage } from '../../core/game-types';
import { HOLES } from './holes';
import { isLang, type Lang } from './i18n';

/** Saved under the arcade's per-game storage as `save` (version 1). */
export type HoleRecord = { best: number; stars: [boolean, boolean, boolean] };
export type Save = {
  v: 1;
  holes: Record<number, HoleRecord>;
  lang?: Lang;
  settings: { sfx: number; reduced: boolean; longPreview: boolean };
  party: { players: number; course: number };
};

const KEY = 'save';
export function blankSave(): Save {
  return { v: 1, holes: {}, settings: { sfx: 0.8, reduced: false, longPreview: false }, party: { players: 2, course: 1 } };
}

export function loadSave(storage: GameStorage): Save {
  const raw = storage.get<unknown>(KEY, null);
  const save = blankSave();
  if (!raw || typeof raw !== 'object') return save;
  const r = raw as Partial<Save>;
  if (r.holes && typeof r.holes === 'object') for (const [k, v] of Object.entries(r.holes)) {
    const id = Number(k);
    if (!HOLES.some(h => h.id === id) || !v || typeof v !== 'object') continue;
    const best = Number((v as HoleRecord).best), stars = (v as HoleRecord).stars;
    if (Number.isFinite(best) && best > 0 && Array.isArray(stars)) save.holes[id] = { best, stars: [!!stars[0], !!stars[1], !!stars[2]] };
  }
  if (isLang(r.lang)) save.lang = r.lang;
  if (r.settings && typeof r.settings === 'object') {
    const s = r.settings;
    if (typeof s.sfx === 'number' && s.sfx >= 0 && s.sfx <= 1) save.settings.sfx = s.sfx;
    save.settings.reduced = !!s.reduced; save.settings.longPreview = !!s.longPreview;
  }
  if (r.party && typeof r.party === 'object') {
    const p = r.party;
    if (p.players >= 2 && p.players <= 4) save.party.players = p.players;
    if (p.course >= 0 && p.course <= 3) save.party.course = p.course;
  }
  return save;
}

export function writeSave(storage: GameStorage, save: Save): boolean {
  try { storage.set(KEY, save); return true; } catch { return false; }
}

export const isUnlocked = (save: Save, id: number) => id === HOLES[0].id || !!save.holes[id - 1]?.stars[0];
export const totalStars = (save: Save) => Object.values(save.holes).reduce((n, r) => n + r.stars.filter(Boolean).length, 0);
export const acesFound = (save: Save) => Object.values(save.holes).filter(r => r.stars[2]).length;

/** Records a finished hole; returns which stars are new. */
export function recordHole(save: Save, id: number, par: number, strokes: number, holed: boolean): boolean[] {
  const prev = save.holes[id];
  const stars: [boolean, boolean, boolean] = [holed, holed && strokes <= par, holed && strokes === 1];
  const fresh = stars.map((s, i) => s && !prev?.stars[i]);
  if (!holed && !prev) return fresh;
  save.holes[id] = {
    best: holed ? Math.min(prev?.best ?? Infinity, strokes) : prev!.best,
    stars: [stars[0] || !!prev?.stars[0], stars[1] || !!prev?.stars[1], stars[2] || !!prev?.stars[2]]
  };
  return fresh;
}
